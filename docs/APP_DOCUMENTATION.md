# Perumda Ledger — Dokumentasi Aplikasi

Aplikasi akuntansi untuk **Perumda Pasar Banjarmasin** (BUMD pengelola pasar, Kalimantan Selatan).
Mencakup siklus akuntansi penuh: COA → Jurnal → Buku Besar → Laporan (Neraca, Laba Rugi, Arus Kas, LRA) → NPD, dengan 36 modul.

Dokumen ini adalah referensi menyeluruh: arsitektur, model data, alur impor lampiran, mesin laporan (snapshot + delta), rekonsiliasi buku besar ke neraca, peran/izin, daftar endpoint API, perintah build/deploy, dan catatan operasional. Untuk ringkasan konvensi kode lihat juga `CLAUDE.md`.

---

## 1. Ringkasan Teknologi

| Lapisan | Teknologi |
|---|---|
| Frontend | React 18 + Vite 5 (SPA) |
| Backend | Express 5 (CommonJS), Node 20 |
| Database | SQLite 3 via paket `sqlite3` |
| Runtime | Satu proses — server menyajikan API (`/api`) sekaligus static `dist/` |
| Deploy | Fly.io — app `perumda-ledger-scs9va`, region `sin` (Singapore) |
| Auth | Berbasis peran via header `X-User-Role`; peran default `admin` |
| Parsing Excel | `xlsx` (SheetJS) di sisi browser dan sisi build |

URL produksi: **https://perumda-ledger-scs9va.fly.dev**

---

## 2. Struktur Proyek

```
src/
  pages/                  — satu file per modul (COA, Jurnal, LRA, Laporan, NPDReport, BukuBesar, Pengaturan …)
  components/
    ExcelImport/          — ExcelImportModal.jsx + ImportExcelButton.jsx
    UI/                   — Modal, SearchableSelect
    Layout/               — Sidebar, AppLayout
  context/
    AppContext.jsx        — store global useReducer (semua state di sini)
  data/
    sampleData.js         — formatRupiah, PERIOD_OPTIONS, COA fallback, sample journals
    *.json                — sampleData, npdAnggaran, npdData, extractedData*
  utils/
    excelParsers.js       — parseJurnal, parseSaldoAwal, autoParse, deriveTipe
    reportSnapshot.js      — parser lampiran sisi-browser + ekstraksi jurnal (snapshot)
    reportDelta.js        — overlay "baseline + delta" jurnal user ke bulan teraudit
    reconcileAlias.json   — peta kode COA → label Neraca (rekonsiliasi)
    lrAlias.json          — peta kode COA → baris Laba Rugi
    lraOutline.js         — ACCOUNT_TO_OUTLINE, resolveOutline, categoryKeyForCode
    journalExpand.js      — expandJournals (multi-baris → half-record)
    journalFilters.js     — MONTHS, PERIOD_PRESETS, periodValueToMonths
    treeUtils.js          — helper pohon COA
  services/
    api.js                — semua wrapper fetchAPI (apiGetJournals, apiReconcileLedger …)

server/
  index.cjs               — entry Express, mount /api + serve dist/
  routes/api.cjs          — SEMUA endpoint REST
  middleware/
    auth.cjs              — requireRole, getRole
    validators.cjs        — validateCoaPayload, ALLOWED_COA_TYPES
  db/
    database.cjs          — koneksi singleton SQLite (env DB_PATH)
    schema.cjs            — CREATE TABLE + migrasi
    seed.cjs              — seed COA + anggaran saat boot pertama
scripts/
  import_report_data.cjs  — importer snapshot lampiran saat build (dipakai ulang oleh API)
```

---

## 3. Model Negara (State) & Alur Data

- **Satu store global** di `AppContext.jsx` lewat `useReducer`. Tidak pakai Redux.
- State dimuat dari API saat mount via `loadStateFromAPI()`.
- Pola mutasi: dispatch action → reducer ubah state → panggilan `api.apiXxx()` (fire-and-forget).
- `refreshData('journals')` / `refreshData('all')` me-resync dari DB setelah operasi bulk.

### Bentuk Jurnal

```js
{
  id: "JV-2026-001",          // prefix menentukan baseline vs delta (lihat §6)
  tanggal: "YYYY-MM-DD",
  keterangan, debit, kredit,
  status: "posted" | "pending",
  akun_debit: "kode - nama",
  akun_kredit: "kode - nama",
  tipe_transaksi: "pendapatan" | "pengeluaran" | "transfer",
  lines?: [ { akun_code, akun_name, sub_akun, debit, kredit, keterangan } ]  // JSON multi-baris
}
```

- Jurnal multi-baris menyimpan detail di array `lines`.
- **Selalu panggil `expandJournals(journals)`** sebelum agregasi per-akun — memecah entri multi-baris menjadi half-record agar laporan 2-akun lama tetap benar.
- Hanya `status === 'posted'` yang muncul di LRA / NPD / Buku Besar / overlay laporan.
- Jurnal hasil impor di-set `status: 'pending'` (wajib disetujui dulu — lihat §5 & §7).

---

## 4. Chart of Accounts (COA)

- Pohon di `state.coaTree`, array datar di `state.coaFlat`.
- `flattenCOA` memancarkan snake_case (`saldo_awal`, `kode_sortir`) dan camelCase (`saldoAwal`, `kodeSortir`).
- `buildCOATree` tidak pernah membuang akun: orphan (parent hilang) menjadi root top-level.
- `ADD_ACCOUNT` otomatis menurunkan `parentCode` dari prefix kode (`41009` → parent `41`).
- `POST /coa` wajib `code`, `name`; `type` harus salah satu dari `ALLOWED_COA_TYPES` = `posting|parent|asset|liability|equity|revenue|expense`.

### Rentang Kode Akun

| Prefix | Kategori | Contoh |
|---|---|---|
| `1xxxx` | Aset | `11101` Kas Kecil, `11103` Kas Bank Kalsel |
| `12xxx` | Aset Tetap / Investasi | `12204` Peralatan Kantor |
| `2xxxx` | Kewajiban | `21101` Hutang Usaha |
| `3xxxx` | Ekuitas | `31000` Modal, `33000` Saldo Laba, `35000` Koreksi Ekuitas (suspense) |
| `41xxx` | Pendapatan Bisnis Utama | `41001` Pendapatan Sewa Kios |
| `42xxx` | Pendapatan Bisnis Lainnya | `42001` Pendapatan Parkir |
| `61xxx` | Beban Umum | `61110/61111` Beban Sewa Mobil Operasional |
| `62xxx` | Beban Operasional | `62011` Beban Pajak Mobil |
| `70001` | Pendapatan Bunga | — |
| `80xxx` | Beban Lain-lain | `80002` Beban Administrasi Bank |

Pemetaan penting: `41009`/`41006` → outline `1.5`; `61110`/`61111` → outline `11.1`.

---

## 5. Impor Excel & Lampiran

Ada dua jalur impor, keduanya lewat `ExcelImportModal.jsx`:

### 5.1 Template jurnal sederhana
`parseJurnal(ws)` (di `excelParsers.js`) mengembalikan array dengan dua properti diagnostik non-enumerable:
- `.skipped` — baris dibuang (tidak ada D/K terbaca) → banner kuning "baris dilewati".
- `.incomplete` — baris diimpor tapi ada sel kosong (Tanggal/No. Akun/Nama Akun/Keterangan) → banner kuning "ada kolom kosong".

`autoParse(ws, hint)` membungkus semua parser → `{ type, data, skipped, incomplete }`.

### 5.2 Lampiran berstruktur (snapshot + jurnal)
Saat file yang diunggah adalah **LAMPIRAN LAPORAN KEUANGAN** (mis. `LAMPIRAN LAPORAN KEUANGAN JUNI 2026 .xlsx`), modal mendeteksinya via `detectLampiranPeriods(workbook)` — yaitu adanya sheet `JURNAL <BULAN> <TAHUN>`. Bila terdeteksi, modal melewatkan workbook ke `onImport` untuk alur snapshot+baseline.

Parser sisi-browser di `src/utils/reportSnapshot.js`:

| Fungsi | Sheet | Kolom nilai / layout |
|---|---|---|
| `parseNeraca(ws)` | NERACA | label di kolom pertama berisi teks; nilai di kolom 8; `depth` = indeks kolom label |
| `parseArusKas(ws, 2)` | ARUS KAS | seksi di col0, item di col1, nilai di col2 |
| `parseLabaRugi(ws, 9)` | LABA RUGI | label sebelum col9; nilai di col9 |
| `parsePenerimaan(ws)` | PENERIMAAN / BEBAN UMUM / INVESTASI | outline di col3, nama col4, anggaran col6, target col7, sd bln lalu col8, bulan ini col9, realisasi col10, % col11 |
| `parseBebanOperasional(ws)` | BEBAN OPERASIONAL | 3-level: group col2 / sub-group col3 / rincian col4; nama col5; anggaran col7, target col8, sd bln lalu col9, bulan ini col10, realisasi col11, % col12 |
| `parseJournalSheet(ws, period)` | JURNAL | header dideteksi ("Tgl"/"Akun"/"Sub Akun"/"Keterangan"); kode akun di kolom 0; baris posting dikelompokkan per tanggal+bukti menjadi transaksi double-entry |

Fungsi orkestrasi:
- `detectLampiranPeriods(workbook)` → `[{ period, label, sheet }]`.
- `extractJournals(workbook, period)` → array jurnal baseline dari sheet JURNAL.
- `extractSnapshot(workbook, period)` → `{ period, neraca, arusKas, labaRugi, penerimaan, lra, journals, sheets, warnings }`.

**Derivasi `tipe_transaksi`** saat impor (untuk Arus Kas), di `parseJournalSheet` & `deriveTipe`:
1. keterangan mengandung "beban" → `pengeluaran`
2. keterangan mengandung "pendapatan" → `pendapatan`
3. fallback kelas akun: debit ke akun `5/6/8` → `pengeluaran`; kredit ke akun `4/7` → `pendapatan`
4. selain itu → `transfer`

> **Batas memori VM**: VM Fly hanya 256MB. Mem-parse lampiran 8.7MB di mesin akan OOM (exit 137). Ekstrak data **secara lokal** lalu kirim JSON kecil ke API.

---

## 6. Mesin Laporan — Arsitektur "Snapshot + Delta"

Inti dari laporan resmi. Bulan teraudit (Jan–Jun 2026) **bukan** dihitung ulang dari jurnal — angkanya adalah **snapshot Excel yang dibekukan** di tabel `report_neraca`, `report_arus_kas`, `report_laba_rugi`. Ini menjaga laporan identik dengan lampiran resmi.

Agar jurnal baru tetap tercermin tanpa kehilangan baseline Excel, jurnal user diperlakukan sebagai **delta** yang ditumpuk di atas angka snapshot.

### 6.1 Baseline vs Delta (kunci prefix ID)
Di `src/utils/reportDelta.js`:
- **Baseline** (bagian dari impor Excel/seed, TIDAK di-overlay): prefix `XL-`, `SUM-`, `ADJ-`, `CAS-`.
- **Delta** (dibuat user via app, di-overlay di atas snapshot): prefix `JV-`, `JRN-`.

```js
isDeltaJournal(j)          // true jika id cocok JV-/JRN-
deltaJournals(journals)    // filter delta + posted, lalu expandJournals
deltaByPrefix(exp, prefix, isDebit)  // net delta per prefix kode akun
deltaCash(exp)             // net pergerakan kas (akun 111), +debit −kredit
deltaByName(exp)           // net delta per NAMA akun (untuk pencocokan baris)
overlayByName(refRows, nameMap)      // tumpuk delta ke baris snapshot via nama → { rows, matched }
fmtSigned(n, formatRupiah) // format bertanda "+/−"
```

`Laporan.jsx` memuat baris snapshot (`apiGetRefNeraca` dll), lalu menumpuk delta lewat alias/nama. Neraca juga punya **kolom komparatif bulan sebelumnya** (mengambil snapshot `getPrevYearMonth(yearMonth)` dan mencocokkan label).

### 6.2 Peta Alias
- `src/utils/reconcileAlias.json` — kode COA → label Neraca. Dipakai oleh rekonsiliasi buku besar, delta Neraca, dan Laba Rugi.
  ```json
  {
    "11103": "Kas Bank Kalsel",
    "11201": "Piutang Usaha",
    "11401": "Persediaan Barang Dagang (Bapok dan Gerai Inflasi)",
    "31000": "Modal Perumda Pasar Banjarmasin",
    "33000": "Saldo Laba (Rugi) Periode Lalu"
  }
  ```
- `src/utils/lrAlias.json` — kode COA → baris Laba Rugi, mis. `{ "61140": "Beban Umum Lainnya" }`.

**Prioritas pencocokan**: alias → nama persis → prefix unik → lewati.

---

## 7. Persetujuan Jurnal (Pending → Posted)

- Jurnal hasil impor (lampiran maupun template) masuk dengan `status: 'pending'`.
- Tidak akan muncul di laporan / buku besar sampai disetujui.
- Endpoint: `POST /journals/approve/:id`, `POST /journals/unapprove/:id` (peran: `admin`, `super_admin`, `akuntan`, `manajer_keuangan`, `direktur`).
- "Approve all" menyetujui per id dan memicu rekonsiliasi (lihat §8) lewat `reconcilePeriods` di `Jurnal.jsx`.

---

## 8. Rekonsiliasi Buku Besar → Neraca

Karena data jurnal historis tidak lengkap, saldo buku besar tidak otomatis sama dengan Neraca teraudit. Endpoint `POST /reports/reconcile-ledger` menyelesaikan ini.

- Memposting **satu jurnal penyesuaian gabungan** `ADJ-NRC-ALL-<period>` sehingga saldo posted setiap akun neraca sama dengan angka Neraca-nya.
- Selisih bersih diparkir di akun suspense **`35000` Koreksi Ekuitas**.
- **Idempotent**; no-op bila tidak ada snapshot Neraca untuk periode itu.
- Pencocokan akun→label Neraca pakai `reconcileAlias.json` (alias → nama persis → prefix unik).
- Kueri saldo **mengecualikan** jurnal delta `JV-`/`JRN-` agar yang direkonsiliasi hanya **baseline teraudit** ke snapshot — delta user lalu mengambang di atas di setiap laporan.

Di UI `BukuBesar.jsx`:
- Tombol per-akun + "Rekonsiliasi Semua Akun" (pilih periode).
- Otomatis berjalan saat persetujuan jurnal via `reconcilePeriods` di `Jurnal.jsx`.
- Baris `ADJ-NRC` selalu dipertahankan oleh filter `ledgerEntries` walau filter tanggal di tengah bulan, sehingga Saldo Akhir selalu mengikat ke Neraca.

Wrapper klien: `apiReconcileLedger` di `src/services/api.js`.

> **Keterbatasan diketahui**: Bank Kalsel & beberapa akun mengikat ke Neraca hanya lewat plug sintetis besar ke `35000` (data jurnal belum lengkap). Perbaikan sebenarnya = melengkapi data jurnal. Akun P&L/beban di Buku Besar bersifat kumulatif YTD, **tidak** sebanding langsung dengan baris LR bulanan.

---

## 9. LRA — Tampilan Mengikuti Template Excel

`src/pages/LRA.jsx` menyajikan setiap tab LRA dengan struktur identik sheet Excel.

### Komponen
- `PenerimaanTable` — untuk tab Penerimaan. Kolom: Program & Kegiatan, Kinerja Indikator ("Jumlah Pendapatan"), Target 1 Tahun (5), Target [bulan] (6), Realisasi [Sd bln lalu (7), Bulan ini (8), Sd Bulan ini (9)=(7)+(8)], Capaian % (10)=(8)/(6)×100, Selisih (11)=(5)−(9), Deviasi (12)=(9)/(5)×100. Ada badge bernomor per grup, "Total" per grup, "TOTAL PENDAPATAN USAHA", "TOTAL PENDAPATAN".
- `LRADetailTable` — generik, nesting kedalaman bebas, Total per grup + grand total; dipakai untuk semua tab beban.

### Peta outline (di `LRA.jsx`)
- `GROUP_UMUM` (mis. `'11': 'XI. Beban Sewa Kendaraan'`), `URAIAN_UMUM` (mis. `'11.1': 'Sewa Mobil Operasional'`).
- `SUBGROUP_OPERASIONAL` + `LEAF_OPERASIONAL` untuk Beban Operasional 3-level.
- `GROUP_OPERASIONAL`, `GROUP_INVESTASI`.

### Mesin perhitungan (`lraData`)
- **Bulan teraudit**: baca tabel `state.anggaran` + overlay `deltaJournals`.
- **Bulan dinamis**: seed kumulatif dari bulan teraudit sebelumnya, lalu tambah jurnal posted.
- Target/bulan memakai `target_bulan` (kolom 8) yang dimuat — **bukan** selalu /12 (sebagian baris anggaran dibagi 12, sebagian dibagi 1x). `targetBulanRec` ditangkap dari `matchingRecords`.
- `masterBudgetItems` = baris anggaran April (non-`ANG-`) sebagai template baris. Bila tidak ada baris template untuk outline, baris tidak dirender meski ada jurnal.

> **Sinkronisasi antar bulan**: kolom "Sd bln lalu" bulan N harus = kolom "Sd bln ini" bulan N−1. `parseBebanOperasional` memuat kolom-kolom ini langsung dari lampiran sehingga konsisten antar bulan.

---

## 10. Bentuk Baris Anggaran (Budget)

```js
{
  kode:        "11.1" | "ANG-bebanUmum-84",   // prefix "ANG-" = impor Excel legacy
  nama:        "Sewa Mobil Operasional",
  kategori:    "penerimaan" | "bebanUmum" | "bebanOperasional" | "bebanInvestasi",
  bulan:       1–12,
  anggaran_awal: 370000000,
  sd_bln_lalu:   95399997,   // kumulatif s/d bulan sebelumnya (teraudit)
  bulan_ini:     31799999,   // realisasi bulan ini (teraudit)
  realisasi:     127199996,  // sd_bln_lalu + bulan_ini
  is_total:      0 | 1,
}
```

`masterBudgetItems` memfilter baris **non-`ANG-`** dari April (bulan=4) sebagai template kanonik; `outlineOf(r) = r.kode.startsWith('ANG-') ? r.nama : r.kode`.

---

## 11. NPD

- Dibangun dari `state.anggaran` (pagu) + `state.journals` (realisasi via jembatan jurnal).
- Bulan **dengan** aktivitas jurnal: realisasi dihitung dari jurnal (`expandJournals` + `resolveOutline`).
- Bulan **tanpa** aktivitas: jatuh ke angka `anggaran` precomputed (tanpa regresi).
- `getUraian` / `getGroup` memetakan kode outline ke label di `NPDReport.jsx`.

---

## 12. Peran & Izin

```
kasir            → input/cetak voucher, lihat laporan
akuntan          → semua transaksi, approve, laporan
spv_akuntansi    → approve, tulis COA
manajer_keuangan → approve, kunci periode, laporan  (alias: manager_keuangan)
direktur         → approve, laporan
auditor          → read-only semua
staff_gudang     → inventory
staff_pajak      → e-faktur
admin            → akses penuh termasuk tulis COA, backup
super_admin      → akses penuh + buka kunci periode
```

Peran default tanpa sesi: `admin` (dikirim sebagai header `X-User-Role: admin`).

---

## 13. Endpoint API (di bawah `/api`)

```
# Jurnal
GET/POST       /journals            list / create
GET            /journals/summary
GET/PUT/DELETE /journals/:id
DELETE         /journals?month=YYYY-MM
POST           /journals/bulk
POST           /journals/approve/:id
POST           /journals/unapprove/:id

# COA
GET/POST       /coa
PUT/DELETE     /coa/:code

# Master & transaksi
GET/POST       /assets    PUT/DELETE /assets/:kode
GET/POST       /inventory DELETE /inventory/:kode
GET/POST       /bbm       DELETE /bbm/:id
GET/POST/PUT/DELETE /piutang  /piutang/:id
GET/POST/PUT/DELETE /hutang   /hutang/:id
GET/POST       /giro
GET/POST       /vouchers   POST /vouchers/:id/approve
GET/POST       /anggaran   DELETE /anggaran/:kode   POST /fix-anggaran
GET/POST       /rekonsiliasi  DELETE /rekonsiliasi/:id
GET/PUT        /pengaturan

# Laporan
GET            /reports/buku-besar
GET            /reports/neraca
GET            /reports/neraca-saldo
GET            /reports/rugi-laba
GET            /reports/anggaran-realisasi
GET            /reports/audited-periods           # periode dengan snapshot (DISTINCT report_laba_rugi.period)
POST           /reports/snapshot                  # simpan snapshot dari klien (+ jurnal baseline opsional)
POST           /reports/reconcile-ledger          # rekonsiliasi buku besar → neraca (ADJ-NRC-ALL-<period>)

# Periode & sistem
GET/POST/DELETE /locked-periods   /locked-periods/:period
POST           /periods/locks / /periods/unlock
POST           /system/backup
POST           /reset                              # reset penuh
POST           /reset-month  { period }            # hapus semua data + snapshot 1 bulan
```

### `POST /reports/snapshot` (detail)
Body: `{ period, neraca:[{order,label,value,depth}], arusKas:[{order,label,value,isSection}], labaRugi:[{order,label,value,depth}], journals?:[...] }`.
- Mengizinkan bulan baru dimuat **tanpa redeploy**.
- Bila `journals` disertakan → menggantikan jurnal periode itu sebagai baseline.
- Bila `journals` tidak disertakan → men-demote jurnal delta `JV-` bulan itu menjadi baseline (`XL-`) agar snapshot tidak dihitung ganda oleh overlay.

### `POST /reports/reconcile-ledger` (detail)
Lihat §8. Body `{ period }`. Mengembalikan `{ success, period, reconciled, adjusted, reason? }` (`reason`: `no_snapshot` | `no_suspense_account` | `already_matched`).

---

## 14. Database

- **Produksi** (Fly.io): volume ter-mount `/app/data/perumda_ledger.db`.
- **Lokal**: `server/perumda_ledger.db` (atau env `DB_PATH`).
- Skema: `server/db/schema.cjs`; seed: `server/db/seed.cjs` (jalan saat boot pertama bila DB kosong).

Tabel kunci: `journals`, `journal_lines`, `coa`, `anggaran`, `assets`, `inventory`, `piutang`, `hutang`, `bbm`, `giro`, `vouchers` (view atas journals `bukti LIKE 'VC-%'`), `locked_periods`, `audit_log`, `departemen`, `pelanggan`, `supplier`, `purchase_orders`, `sales_orders`, `efaktur`.

Tabel snapshot laporan (di-key per `period` YYYY-MM):
- `report_neraca (period, sort_order, label, value, depth)`
- `report_arus_kas (period, sort_order, label, value, is_section)`
- `report_laba_rugi (period, sort_order, label, value, depth)`

---

## 15. Perintah Dev, Build & Deploy

```bash
# aktifkan Node dulu (nvm):
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"

npm run dev        # Vite dev server (frontend, port 5173)
npm run server     # Express API (port 3001)
npm run build      # build produksi → dist/
npm run db:init    # re-seed database

# Deploy ke Fly (flyctl di ~/.fly/bin, TIDAK ada di PATH):
~/.fly/bin/flyctl deploy --app perumda-ledger-scs9va
~/.fly/bin/flyctl deploy --remote-only
~/.fly/bin/flyctl releases --app perumda-ledger-scs9va   # cek versi terakhir
~/.fly/bin/flyctl status   --app perumda-ledger-scs9va   # cek kesehatan mesin
```

- Auth Fly: user `48shield@gmail.com`.
- Mesin auto-stop (`min_machines_running=0`). Bangunkan sebelum SSH:
  `curl -s -o /dev/null https://perumda-ledger-scs9va.fly.dev/ ; sleep 5`
- Operasi prod destruktif: **backup DB dulu** —
  `cp /app/data/perumda_ledger.db /app/data/perumda_ledger.backup-<tstamp>.db`
- Warning token metrics di output deploy tidak berbahaya.

---

## 16. Mata Uang

- Selalu pakai `formatRupiah(num)` dari `src/data/sampleData.js`.
- Format: `Rp 4.890.435,23` — tepat **2 desimal**, locale id-ID (`.` ribuan, `,` desimal).

---

## 17. Skenario Operasional Umum

### Hapus & re-upload data 1 bulan agar laporan persis Excel
1. `POST /reset-month { period: "2026-06" }` — hapus jurnal + modul + snapshot bulan itu.
2. Upload lampiran via Pengaturan / Jurnal "Import Excel" → `extractSnapshot` menghasilkan snapshot + jurnal baseline → `POST /reports/snapshot` dengan `journals`.
3. Setujui jurnal bila perlu; rekonsiliasi otomatis berjalan → Buku Besar mengikat ke Neraca.

### Tambah jurnal baru di bulan teraudit (delta)
- Buat jurnal `JV-` via app. Setelah disetujui (`posted`), ia mengambang sebagai delta di atas snapshot dan tercermin di Laba Rugi, LRA, Neraca (via alias), Arus Kas (via `tipe_transaksi`), dan Buku Besar.

---

## 18. Gotchas

1. **Jurnal tak muncul di LRA/NPD** — cek: (a) `status === 'posted'`, (b) `resolveOutline(kode)` valid, (c) ada baris template untuk outline itu di anggaran April untuk `kategori` tsb.
2. **Jurnal baru tak update laporan teraudit** — pastikan id berprefix delta (`JV-`/`JRN-`), bukan baseline (`XL-`). Approve flow tidak boleh me-rebase `JV-`→`XL-`.
3. **Neraca: akun tak ter-update** — kemungkinan butuh entri di `reconcileAlias.json` (mis. Kas Bank Kalsel `11103`).
4. **Buku Besar ≠ Neraca** — jalankan "Rekonsiliasi Semua Akun"; akun P&L bersifat kumulatif YTD (tidak sebanding LR bulanan).
5. **OOM saat impor di VM** (exit 137) — parse lampiran lokal, kirim JSON kecil.
6. **Deploy seperti menggantung** — normal; cek `flyctl releases` setelah ±3 menit.
7. **`!` di skrip `node -e`** — zsh history expansion. Tulis ke file `.cjs`/`.mjs` lalu jalankan.
8. **`formatRupiah` desimal aneh** — fungsi selalu 2 desimal; jika beda, pemanggil tidak memakainya.

---

## 19. Catatan & Keterbatasan

- Grup IV (Beban Pokok Perdagangan 4.1/4.2) belum punya rincian leaf yang dimuat.
- Pengikatan Buku Besar→Neraca untuk beberapa akun mengandalkan plug sintetis ke `35000` karena data jurnal belum lengkap.
- Skrip sementara dibuat sebagai `_nama.cjs`/`.mjs` di workspace, dijalankan, lalu dihapus (`fs_write` tidak bisa menulis ke `/tmp`).
