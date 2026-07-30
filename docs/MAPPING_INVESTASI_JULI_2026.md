# Mapping Kendala → Solusi: Rapat Lanjutan ke-12 (16 Juli 2026)

**Sumber:**
- Notulensi Rapat Lanjutan ke-12 Divisi Keuangan, IT & Vendor — 16 Juli 2026
- `LAI PERUMDA BAIMAN 2025 - rev.pdf` — hasil audit KAP tahun buku 2025 (sudah ada di `src/FILES/`)
- `LAMPIRAN LAPORAN KEUANGAN JUNI 2026.xlsx` — *full bundle* Juni dari Mbak Nisa (baru, `src/FILES/`)
- `LIST COA INVESTASI (RKA Juni 2026).xlsx` — daftar pos investasi RKA + realisasi Juni (baru, `src/FILES/`)

**Dokumen pendahulu:** `KENDALA_SINKRONISASI_PERBAIKAN.md` (rapat 24 Juni), `FIX_PLAN_PROGRAM_JUNI_2026.md`
(status: implemented 11 Juli, 26 tes acceptance hijau). Dokumen ini memetakan kendala **baru** dari rapat
16 Juli dan solusinya.

---

## Ringkasan Peta Kendala

| # | Kendala (notulensi) | Akar masalah | Solusi | Status |
|---|---|---|---|---|
| 1 | Sub-akun kosong pada baris aset → rincian LRA nyasar/kosong | Jurnal aset divisi memang **tidak mengisi Sub Akun** (15/15 baris aset Juni kosong) | Routing via kata kunci keterangan (`getInvestasiOutline`) — sudah jalan; kata kunci dilengkapi | ✅ di commit ini |
| 2 | Jurnal baku KAP ("Bangunan pada Bank Kalsel") tidak bisa memotong pos RKA ("Revitalisasi Pasar Antasari") | Nama akun ≠ nama pos RKA; jembatan = keterangan | **Tabel mapping COA→RKA** (bab 2) + perluasan kata kunci; terbukti cocok rupiah-per-rupiah utk Mei–Juni | ✅ di commit ini |
| 3 | Saldo awal aset tetap 2026 harus pakai hasil audit 2025 | Angka pra-audit berbeda dgn audited | Tabel saldo awal audited (bab 3) sebagai acuan input; register divisi **sudah** di-rebase ke audit | ✅ prod COA + seeder register |
| 4 | Selisih Beban Bapok antara LRA / Laba-Rugi / Neraca | Bukan bug — beda basis (kas vs akrual vs persediaan) | Tidak ada perubahan aplikasi; penjelasan rute data di bab 4 | ✅ sudah benar |
| 5 | Reklasifikasi PPN & PPh ke Beban Operasional | Konsultasi pajak berjalan | **Ditunda** sesuai kesepakatan rapat; dampak & rencana di bab 5 | ⏸ ditunda |

---

## 1. Sub-Akun Kosong pada Jurnal Aset [notulensi 00:05:08]

**Temuan di data.** Sheet `JURNAL JUNI 2026` pada *full bundle* memuat 15 baris akun `12xxx`;
kolom **Sub Akun kosong di semua baris aset**, termasuk:

| Kode | Akun | Debit/Kredit | Keterangan |
|---|---|---|---|
| `12102.1` | Bangunan | D 401.670.000 | Pekerjaan Revitalisasi Gedung di **Pasar Antasari** |
| `12102.1` | Bangunan | D 21.425.000 | Pelunasan Pemasangan Kanstin Beton di **Pasar Antasari** |
| `12203.1` | Instalasi Listrik | D 28.862.830 | Pemasangan Listrik Baru di Pasar Antasari 23.000 VA |
| `12203.1` | Instalasi Listrik | D 6.300.000 | Pemasangan Panel MCB 3 Phase Videotron Pasar Antasari |
| `12204.1` | Peralatan | D 1.700.000 + 2.150.000 | Kulkas Sharp; Printer G2730 |
| `12300` | Aset Dalam Penyelesaian | D 617.168.000 | Termin I 30% ex kebakaran **Pasar Harum Manis II** |
| `12300` | Aset Dalam Penyelesaian | D 113.646.000 | DP Pemasangan CCTV Pasar Antasari |

Catatan: kode "21202" yang tersebut di notulensi adalah salah dengar/ketik dari **12102** (Bangunan).

**Mengapa total benar tapi rincian nyasar.** Head account (Bangunan) cukup untuk Neraca, tetapi LRA
butuh baris RKA spesifik. Tanpa Sub Akun, satu-satunya sinyal adalah teks keterangan.

**Solusi yang dipakai aplikasi** (sudah berjalan sejak fix plan Juni): `getInvestasiOutline(kode, keterangan)`
di `src/utils/lraOutline.js` me-routing tiap posting aset ke baris " Investasi" lampiran lewat kata kunci
keterangan. Hasil Juni terbukti: `1.5.2` Pasar Antasari 423.095.000, `1.3.6` Instalasi Listrik 35.162.830,
`6.2` Perlengkapan Kantor 3.850.000 — persis kolom "Bulan ini" sheet ` Investasi` divisi
(total arus kas investasi Juni −462.107.830, dipin di `tests/reports/juneLampiranAcceptance.test.mjs`).

**Alternatif jangka panjang** (opsional, keputusan Divisi Keuangan): pakai daftar Sub Akun INVESTASI yang
sudah ada di sheet `Sub Akun` bundle (kelompok *Pengadaan Aset Tetap / Pengadaan Persediaan Bahan Pokok /
Pengadaan Sistem Perangkat Lunak / Perbaikan Pembangunan Sarpras Baru*) sehingga routing tidak bergantung
kata kunci. Selama Sub Akun tetap kosong, **disiplin keterangan** (bab 2.3) adalah kuncinya.

---

## 2. Mapping COA Standar ↔ Pos Investasi RKA [notulensi 00:07:09, 00:14:32]

Kendala inti: KAP mengharuskan jurnal baku `Bangunan (D) pada Bank Kalsel (K)`, sedangkan LRA harus
memotong pos RKA yang namanya panjang. Jembatannya adalah tabel berikut (kini tertanam di
`getInvestasiOutline`).

### 2.1 Tabel mapping (COA × kata kunci keterangan → outline RKA)

| Akun COA | Kata kunci pada keterangan | Outline | Pos RKA |
|---|---|---|---|
| `12102.1` Bangunan | gudang | 2.1 | Perbaikan gudang bapok |
| | kantor | 6.1 | Renovasi Gedung Kantor |
| | akses jalan, pedestrian | 1.6.1 | Perbaikan akses jalan Pasar Lima/Cemara/Jahri Saleh |
| | penerangan | 1.6.2 | Penambahan Penerangan Pandu/Pekauman/Gadang/Telawang |
| | food court | 4.2 | Revitalisasi kawasan food court |
| | gerai inflasi | 4.3 | Sarana gerai inflasi |
| | sni, percontohan | 1.1 | Pengembangan Pasar Percontohan (SNI) |
| | tungging | 1.4.1 | Pasar Tungging — kios kuliner malam |
| | cemara | 1.4.2 | Pasar Cemara — pusat oleh-oleh |
| | baru permai, **pasar baru**, acp, neon box | 1.5.1 | Pasar Baru Permai Dasar — ACP & Neon Box |
| | **antasari** | 1.5.2 | Pasar Antasari — perbaikan toko/kios/lapak |
| | teluk dalam | 1.5.3 | Pasar Teluk Dalam — sport hall dll |
| | kuripan | 1.5.4 | Pasar Kuripan |
| | malabar | 1.5.5 | Pasar Malabar — ruang kreasi olahraga |
| | *(tanpa kata kunci)* | 1.5 | header program Revitalisasi (tidak hilang, tampil di baris program) |
| `12201.1` Kendaraan | *(semua)* | 1.3.1 | Pengadaan Mobil/Truck Box/Pickup/Freezer Box |
| `12202.1` Mesin | pemadam, apar | 1.3.2 | Alat Pemadam Kebakaran |
| | galon, isi ulang, depo(t) air | 4.5 | Mesin isi ulang air galon |
| | *(lainnya)* | 1.3 | header Sarana Pengelolaan Pasar |
| `12203.1` Instalasi Listrik | tungging, lampu halaman | 1.4.1 | Pasar Tungging |
| | penerangan, lampu jalan | 1.6.2 | Penambahan Penerangan |
| | *(lainnya)* | 1.3.6 | Pengadaan Instalasi Listrik Pasar |
| `12204.1` Peralatan | studio, live, kamera, selling | 3.1 | Sarana studio live selling |
| | cctv | 1.3.4 | Pengadaan CCTV pasar |
| | papan nama | 1.3.5 | Pengadaan Papan Nama Pasar |
| | bak, kontainer | 1.3.3 | Pengadaan Bak/Kontainer Truck |
| | galon | 4.5 | Mesin isi ulang air galon |
| | lpg, tabung gas | 4.6 | Tabung gas LPG |
| | tap kartu, pembayaran digital, edc | 5.2 | Alat Pembayaran digital/Tap kartu |
| | gerai inflasi | 4.3 | Sarana gerai inflasi |
| | pengiriman | 3.2 | Sarana tempat layanan pengiriman barang |
| | *(lainnya)* | 6.2 | Pengadaan Perlengkapan Kantor |
| `13101.1` Aset Tidak Berwujud | pembayaran, tap kartu | 5.2 | Alat Pembayaran digital |
| | *(lainnya — sistem/aplikasi)* | 5.1 | Pengembangan sistem informasi akuntansi |
| `12300` Aset Dalam Penyelesaian | — | *(tidak di-routing)* | lihat 2.4 |
| `12xxx.2` / `13101.2` akumulasi/amortisasi | — | *(tidak di-routing)* | penyusutan ≠ belanja modal |

### 2.2 Bukti kecocokan (register aset ↔ lampiran " Investasi")

Tabel "Penambahan Bangunan 2026" pada sheet `DAFTAR AKTIVA TETAP` adalah kunci mapping yang selama ini
dicari — tiap penambahan aset tercatat dengan keterangan yang memuat kata kunci pasarnya:

| Keterangan register | Tgl | Nilai (Rp) | Outline hasil mapping | Baris " Investasi" (SD bln lalu / bulan ini) |
|---|---|---|---|---|
| Perbaikan Gudang Gas Elpiji | 15/01 | 159.670.000 | 2.1 | 2.1 = 159.670.000 ✓ |
| Perbaikan Fasilitas Kantor,Dapur,dll (Kantor letak di Pasar Baru) | 08/05 | 182.700.000 | 6.1 | 6.1 = 182.700.000 ✓ |
| Perbaikan Atap Pasar Baru | 08/05 | 193.596.250 | 1.5.1 | 1.5.a = 193.596.250 ✓ |
| Pengadaan Taman Antasari | 13/05 | 112.206.780 | 1.5.2 | 1.5.b = **112.206.780** ✓ (angka "Rp112 juta" di notulensi) |
| Pekerjaan Revitalisasi Gedung di Pasar Antasari | 18/06 | 401.670.000 | 1.5.2 | 1.5.b bulan ini ✓ |
| Pemasangan Kanstin Beton di Pasar Antasari | 20/06 | 21.425.000 | 1.5.2 | 1.5.b bulan ini (total 423.095.000) ✓ |

Kata kunci yang **baru ditambahkan** di commit ini karena terbukti dibutuhkan data di atas:
`pasar baru → 1.5.1` (12102), `penerangan/lampu jalan → 1.6.2` dan `tungging → 1.4.1` (12203),
`galon/isi ulang/depo air → 4.5` (12202), `tap kartu/edc → 5.2`, `gerai inflasi → 4.3`,
`pengiriman → 3.2` (12204), seluruh cabang `13101.1 → 5.1/5.2`, plus guard amortisasi `13101.2`.
Urutan cek penting dan sudah diamankan tes: *kantor* menang atas *pasar baru* (kasus "Kantor letak di
Pasar Baru" → 6.1), *akses jalan/penerangan* menang atas nama pasar (RKA 1.6 menyebut nama banyak pasar).

### 2.3 Aturan tulis keterangan untuk Divisi Keuangan (agar mapping otomatis 100%)

Jurnal tetap baku sesuai KAP — cukup **keterangan memuat satu kata kunci** dari tabel 2.1:
1. Sebut nama pasarnya (mis. "… di Pasar Antasari", "… Pasar Baru").
2. Untuk non-lokasi, sebut jenis pos: "gudang", "kantor", "penerangan", "cctv", "papan nama", dst.
3. Hindari menyebut dua lokasi/pos dalam satu jurnal; kalau perlu, pecah barisnya.

### 2.4 Konvensi yang dipertahankan (sesuai buku divisi — mohon konfirmasi bila berubah)

- **12300 Aset Dalam Penyelesaian tidak dihitung realisasi investasi.** Lampiran divisi merealisasikan
  investasi saat **kapitalisasi** (jurnal `12102.1 ← 12300`), bukan saat termin dibayar — DP CCTV
  Antasari 113,6 jt dan termin Harum Manis II 617,2 jt Juni memang tidak muncul di " Investasi". ✓
- **Pasar Harum Manis II (ex kebakaran) tidak punya baris RKA.** Saat proyek ±2 M ini dikapitalisasi,
  mapping akan jatuh ke header program 1.5 (terlihat, tidak hilang). **Keputusan dibutuhkan:** tambah baris
  RKA-nya atau biarkan di 1.5.
- **Program 7 (Modal Kerja — stok bapok/gerai inflasi) realisasi 0 di lampiran.** Pembelian stok berjalan
  lewat persediaan `11401/11402` dan tampil sebagai Beban Pokok kas-basis di LRA Beban Operasional
  (`CASH_BASIS_BEBAN_POKOK`), bukan di tabel investasi. Aplikasi mengikuti konvensi yang sama.

---

## 3. Saldo Awal Aset Tetap 2026 = Audit 2025 [notulensi 00:17:04]

Angka final dari `LAI PERUMDA BAIMAN 2025 - rev.pdf` catatan 8–9 (per 31 Des 2025) — angka notulensi yang
tercantum "XXX" dilengkapi di sini:

| Aset (COA) | Harga perolehan | Akumulasi penyusutan | Nilai buku | Tarif |
|---|---:|---:|---:|---|
| Tanah (`12101`) | 786.424.200.000 | — | 786.424.200.000 | — |
| Bangunan (`12102.1/.2`) | 64.874.760.388 | 3.224.578.111 | 61.650.182.277 | 5% (20 th) |
| Kendaraan (`12201.1/.2`) | 355.905.800 | 7.414.704 | 348.491.096 | 12,5% (8 th) |
| Mesin (`12202.1/.2`) | 59.310.000 | 3.706.875 | 55.603.125 | 12,5% |
| Instalasi Listrik (`12203.1/.2`) | 11.273.500 | 117.432 | 11.156.068 | 12,5% |
| Peralatan (`12204.1/.2`) | 574.799.127 | 28.046.259 | 546.752.868 | 25% (4 th) |
| **Jumlah** | **852.300.248.815** | **3.263.863.381** | **849.036.385.434** | |

**Verifikasi silang (sudah dicek terhadap bundle Juni):**
- Sheet `DAFTAR AKTIVA TETAP` sudah **di-rebase ke audit** (baris "Saldo Awal Audited 2025" Peralatan
  574.799.127 / 28.046.259 persis audit).
- Bangunan: 64.874.760.388 + penambahan Jan–Mei 648.173.030 = 65.522.933.418; + Juni 423.095.000 =
  **65.946.028.418** — persis total register Juni. ✓
- Instalasi Listrik: 11.273.500 + 2.760.000 (Feb) + 35.162.830 (Juni) = 49.196.330 — persis register. ✓

**Tindakan aplikasi:** jadikan tabel di atas nilai `saldo_awal` COA 12xxx (dan seed modul Aset Tetap dari
sheet `DAFTAR AKTIVA TETAP`) saat inisialisasi 2026. Neraca bulanan berjalan sudah aman karena memakai
baseline snapshot lampiran + delta jurnal; saldo audited ini adalah acuan resmi bila DB di-reset/di-seed
ulang, dan prasyarat modul penyusutan otomatis (register memuat tarif & penyusutan per bulan per aset —
Juni: jurnal akumulasi `.2` senilai 314.632.492,10 yang selama ini diinput manual oleh divisi).

---

## 4. Beban Bapok: LRA vs Laba-Rugi vs Neraca [notulensi 00:27:12] — BUKAN BUG

Satu angka pembelian mengalir ke tiga laporan dengan basis berbeda (contoh notulensi):

```
Beli bapok tunai 194 jt   →  LRA (kas-basis)      : 194 jt  (debit 11401/11402 → baris 4.1/4.2)
Terjual/terpakai 50 jt    →  Laba/Rugi (akrual)   :  50 jt  (COGS 51000/51001)
Sisa belum terjual 144 jt →  Neraca               : 144 jt  (Persediaan Barang Dagang)
```

Aplikasi sudah mengikuti rute ini (`CASH_BASIS_BEBAN_POKOK` untuk LRA; 51xxx akrual untuk L/R; saldo
persediaan di Neraca) dan diverifikasi tes acceptance Juni (LRA 194.798.200 vs akrual 189.138.200).
Tidak ada perubahan kode; cukup sosialisasi rute data ini.

---

## 5. Reklasifikasi PPN & PPh ke Beban Operasional [notulensi 00:32:53] — DITUNDA

Kesepakatan rapat: fokus modul mapping investasi dulu. Kondisi sekarang sudah aman untuk pelaporan:
PPh yang dijurnal `80000 > Pajak Penghasilan` otomatis di-reroute ke `99999` (baris pajak), tidak
mencemari Beban Non-Operasional. Saat reklasifikasi jadi dieksekusi nanti, cakupannya:
1. Tambah COA beban pajak di bawah `62xxx` (Beban Operasional) sesuai arahan konsultan.
2. Perbarui `HEADER_SUBAKUN_REROUTE` + `ACCOUNT_TO_OUTLINE` (`lraOutline.js`) dan komposisi EBITDA di
   Laba/Rugi (`composeLabaRugi`).
3. Tambah baris anggaran RKA-nya bila ikut dilaporkan di LRA.

---

## Perubahan pada commit ini

| File | Perubahan |
|---|---|
| `src/utils/lraOutline.js` | Perluasan `getInvestasiOutline`: kata kunci baru (pasar baru, penerangan, galon, tap kartu, gerai inflasi, pengiriman, dll), dukungan `13101.x`, guard amortisasi |
| `tests/reports/lraOutline.test.mjs` | Pin 8 mapping baru (bukti register aset Juni) |
| `tests/reports/reportSnapshot.test.mjs` | Path fixture lampiran Juni → nama file kanonik |
| `tests/fixtures/JURNAL JUNI 2026 (divisi).xlsx` | Fixture jurnal Juni (diekstrak dari full bundle) — sebelumnya hilang, 4 file tes bergantung padanya |
| `src/FILES/LAMPIRAN LAPORAN KEUANGAN JUNI 2026.xlsx` | Full bundle Juni dari Divisi Keuangan (16 Jul) |
| `src/FILES/LIST COA INVESTASI (RKA Juni 2026).xlsx` | Daftar pos investasi RKA + realisasi Juni |

**Hasil tes:** 26/30 hijau (`node --test tests/reports/*.mjs`) — 4 yang merah adalah `serverFlow.test.mjs`
yang butuh DB lokal `server/perumda_ledger.db` + binary sqlite3 (prasyarat lingkungan, bukan regresi).

**Sisa pekerjaan (estimasi vendor 3 hari kerja, rapat):**
1. Muat ulang Juni dari full bundle di produksi (alur hapus-Juni → upload, sudah teruji).
2. Input saldo awal audited 2025 (tabel bab 3) + seed register aset tetap.
3. Konfirmasi 2 keputusan Divisi Keuangan: baris RKA untuk Harum Manis II, dan (opsional) pemakaian
   Sub Akun INVESTASI agar tidak bergantung kata kunci.

---

## Update Status — 16 Juli 2026 (implementasi)

| Item | Status |
|---|---|
| Jurnal Juni di produksi | ✅ **Dimuat & di-approve via API** — 115 jurnal `JV-2026-06-…` semuanya *posted*; D = K = 7.028.324.987,16; checksum cocok dengan buku divisi (Pend. Usaha 1.290.289.465; Beban Umum 743.330.990,10; BPP akrual 189.138.200); endpoint `reports/consistency` 4/4 OK. Dimuat **aditif** via `POST /journals/bulk` (Juni kosong — tidak ada data yang dihapus/di-overwrite). |
| Saldo awal audited 2025 | ✅ Terpasang di COA produksi (diverifikasi via API, cocok rupiah-per-rupiah dgn tabel bab 3) dan tersimpan di seed repo (`src/data/sampleData.js`). |
| Register Aset Tetap | ✅ Seeder kanonik baru `server/db/seedAsetTetap.cjs` (`npm run db:seed-aset`) — 125 baris dari sheet `DAFTAR AKTIVA TETAP` bundle Juni (6 seksi I–VI, termasuk MESIN & INSTALASI LISTRIK yang tidak dikenal importer lama), idempoten, konversi tanggal serial Excel, umur manfaat dari tarif, catatan KIB utk Tanah. Tabel `assets` produksi sudah berisi data yang identik (total perolehan 853.067.923.738). |
| Mapping COA→RKA di produksi | ✅ **Ter-deploy** (release v139, 17 Jul dini hari WITA) via pipeline GitHub Actions baru (`.github/workflows/fly-deploy.yml` — push ke `main` = deploy otomatis). Perbaikan penyerta: Dockerfile kini membangun DB seed image dari skema repo (`seed.cjs` + `seedAsetTetap.cjs`), tidak lagi bergantung DB lokal laptop yang ikut ter-copy. |
| Verifikasi lampiran vs aplikasi | ✅ **17 sheet lampiran Juni diverifikasi terhadap aplikasi produksi — cocok** (17 Jul, pasca-deploy v139). Menutup poin rapat #1–#2: LRA/Neraca/L-R/Arus Kas Juni dihitung live dari Buku Besar dan sinkron dengan buku divisi. |
| Keputusan Divisi Keuangan | ⏳ Baris RKA utk Harum Manis II; (opsional) pemakaian Sub Akun INVESTASI. |

### Verifikasi mesin 17 sheet lampiran Juni ↔ aplikasi produksi (17 Jul)

Seluruh 17 sheet Juni dibandingkan otomatis terhadap data produksi yang dihitung ulang dengan modul
aplikasi (jurnal prod + baseline Mei prod → Neraca/L-R/Arus Kas/LPE/LRA): **16/17 cocok penuh** —
Jurnal (115 jurnal, rupiah-per-rupiah), Neraca (40 baris), L/R (12 subtotal), Arus Kas (5 angka),
LPE, LRA Investasi (34 rincian), Penerimaan, Beban Umum, ketiga Rekap, Daftar Aktiva Tetap (125 baris),
COA, dan kedua sheet DATA LAMPIRAN.

**Perbaikan yang lahir dari verifikasi ini** — `resolveWithSubPriority` (lraOutline.js): Sub Akun yang
dipilih eksplisit kini menang atas kata kunci keterangan. Tiga posting Juni sebelumnya nyasar satu
baris: "Tunjangan Jabatan Koordiantor" (Sub Akun Fungsional) 1.250.000 → kini 2.2; "Sosialisasi …"
(Sub Akun Kegiatan Kantor) 355.500 → kini 6.4; "Pembelian Kabel 3 Meter" (Sub Akun Perlengkapan)
35.000 → kini 7.1. Total grup tidak berubah; kini baris-per-baris identik dgn buku divisi.

**Temuan data — Beban Pokok LRA 4.1/4.2 kumulatif — ✅ SELESAI (keputusan: ikut buku Juni):** buku Juni
divisi me-restate realisasi s.d. Mei menjadi **459.405.650**, sedangkan lampiran MEI yang dimuat ke
aplikasi (13 Jul) mencatat **633.183.250** — selisih **173.777.600** antara dua buku divisi sendiri
(bulan-ini Juni selalu identik). Sesuai arahan 17 Jul ("ikut buku Juni"), blok anggaran Mei
bebanOperasional dimuat ulang di produksi via loader snapshot-LRA: hanya 4.1 → realisasi 285.726.150 dan
4.2 → 173.679.500 yang berubah (38 baris lain identik; jurnal/laporan/mode Mei tak tersentuh). Sekalian:
`CASH_BASIS_BEBAN_POKOK` kini memetakan 11402 (LPG) → **4.1** mengikuti konvensi buku Juni (LPG ikut
bapok-penting; 4.2 hanya membawa angka bulan audited). Hasil akhir verifikasi mesin: **17/17 sheet cocok
penuh, baris-per-baris**.

Catatan kosmetik sheet (tidak memengaruhi laporan): kolom kode DATA LAMPIRAN L/R bergeser 1 baris di
4 baris blok 61/62; DATA LAMPIRAN NERACA memberi kode 21700 utk Biaya YMHD (COA: 21500); label periode
LPE masih teks template; 5 nama COA beda redaksi (mis. 42000 "Pendapatan Bisnis Lainnya" vs
"Pendapatan Operasional Lainnya").

---

## Trial Juli — buku divisi 74 jurnal + register aset (20 Jul 2026)

File `JURNAL_JULI_DAN_AKTIVA_TETAP.xlsx` dari divisi dimuat ke produksi dan diverifikasi mesin:
**17/17 checks PASS** (jurnal rupiah-per-rupiah; Neraca/L-R/Arus Kas/LPE dihitung app — sheet
bundel Juli memang template kosong; 4 sheet LRA + 4 Rekap; Daftar Aktiva Tetap; COA; kedua DATA
LAMPIRAN).

**Yang dimuat / berubah di produksi:**
- Juli diganti penuh: 58 jurnal lama (termasuk jurnal tes manual `JV-2026-001` 18/07 Rp 20.100.000)
  → **74 jurnal resmi divisi (s.d. 16/07), semua posted**. ΣD = ΣK = 694.784.402.
- **Koreksi impor U0010**: dua baris transfer "Pemindahan Saldo BNI Bisnis ke BNI Utama"
  (206.989.852) memakai kode `461436`/`511473` (potongan no. rekening, bukan kode akun) →
  dipetakan ke **11104 Bank BNI / 11106 Bank BNI Bisnis** — persis seperti DATA LAMPIRAN NERACA
  divisi sendiri. Mohon divisi perbaiki kolom No. Akun di master Excel-nya.
- **Register aset**: 125 → **132 baris** (Σ 853.245.006.115). Peralatan kini **833.460.567 = Neraca**
  (temuan selisih 177.082.377 CLOSED — aset audited 2025 sudah dirinci per item). Bangunan register
  **masih 65.522.933.418** vs Neraca 65.946.028.418: dua baris penambahan Juni (Revitalisasi Antasari
  401.670.000 + Kanstin 21.425.000) belum ditambahkan divisi ke DAFTAR AKTIVA TETAP.
- Jurnal PPh pertama Juli ada di U0063 (`80000 > Pajak Penghasilan` 4.708.148) → baris
  **"Beban PPN dan PPH" kini tampil** di L/R Juli. Jurnal 51001 (pemakaian Gas LPG) tetap belum ada
  — normal, jurnal akhir bulan.

**Perbaikan app yang lahir dari verifikasi ini:**
- `lraOutline.js` 61030: kata kunci `sasirangan` kini diperiksa SEBELUM `pdh/karyawan` — RKA 3.4
  "Kain sasirangan (karyawan + Direksi + Dewas)" (U0017 Rp 5.000.000) sempat jatuh ke 3.3 karena
  kata "karyawan" di dalam kurung. Dipin di test.
- `seedAsetTetap.cjs`: nomor urut sheet register TIDAK unik (PERALATAN 48–54 dipakai dua kali di
  register Juli) — parser kini memberi sufiks deterministik (48 → 48B) supaya INSERT OR REPLACE
  tidak menelan baris. Tanpa ini 7 baris (Σ 75.872.445) hilang diam-diam.

**Cacat workbook divisi (bukan selisih app — mohon dirapikan divisi):**
- Kolom "Sd bln lalu" keempat sheet LRA masih **posisi Mei** (Juni belum digulung): Beban Umum 33
  baris, Penerimaan 16, Beban Operasional 13, Investasi (1.3.6, 6.2).
- Nilai JUNI diparkir di kolom "Bulan ini" Juli: Investasi **1.5.2 = 423.095.000** (Antasari Juni)
  dan Beban Operasional **4.1 = 194.798.200** (bapok/LPG Juni). App menampilkan Juli yang benar
  (Investasi bulan-ini Juli = 7.577.500 instalasi listrik Antasari → 1.3.6).
- Regresi Juni: **16/17 tetap cocok** — satu-satunya beda adalah Daftar Aktiva Tetap karena register
  di produksi memang sudah diganti versi Juli (4 baris versi Juni direvisi divisi sendiri).

### COA 62110 Beban PPN dan PPH — dibuat (20 Jul 2026, konfirmasi WA divisi "fix")

Divisi mengonfirmasi penambahan COA PPN 62110; penempatan di Laba Rugi tetap di bagian **Beban
Operasional** seperti laporan Juni. Dikerjakan: (1) akun `62110 Beban PPN dan PPH` (posting, parent 62)
dibuat di produksi + seed; (2) engine laporan mengarahkan 62110 ke baris **"Beban PPN dan PPH"** yang
sama dengan reroute lama `80000 > Pajak Penghasilan` — dua gaya pencatatan mendarat identik, di dalam
Jumlah Beban Operasional; (3) 62110 sengaja TIDAK masuk LRA (belum ada baris RKA-nya — perlakuan yang
sama dengan PPh Juni). Dipin di test (36/36).

### Selisih Bangunan register vs Neraca — ✅ DITUTUP (20 Jul 2026, sore)

Klarifikasi divisi (WA): kedua penambahan Juni memang tercatat — di tabel samping "* Penambahan
Bangunan 2026" sheet DAFTAR AKTIVA TETAP (no. 5–6) dan di realisasi Investasi 1.5.2. Konvensi daftar
utama divisi ternyata **satu baris per pasar** dengan penambahan dilebur ke nilai baris pasarnya
(item 1–4 Jan–Mei sudah dilebur begitu; bukti: baris PASAR ANTASARI = 112.206.780 = persis nilai
Taman Antasari). Sesuai konfirmasi Mas Jefon, baris `AT-BANGUNAN-22 PASAR ANTASARI` di produksi
diubah 112.206.780 → **535.301.780** (+ Revitalisasi Gedung 401.670.000 + Kanstin Beton 21.425.000,
rincian dicatat di kolom keterangan baris). Hasil: **Bangunan register = 65.946.028.418 = Neraca
persis** — temuan #4 tertutup penuh (Peralatan sudah lebih dulu). Total register kini 853.668.101.115.
Catatan utk file divisi berikutnya: baris PASAR ANTASARI harus memuat nilai yang sama supaya muat-ulang
register tidak mundur lagi.

---

## Reklasifikasi PPN/PPh FINAL + insiden keterangan kosong (21 Jul 2026)

**Reklas final (konsultan pajak):** buku Juni v2 divisi menambah 2 baris di U0115:
`62110 Beban PPN dan PPH D 423.367.799` / `80000 > Pajak Penghasilan K 423.367.799`. Konsekuensi
di laporan: baris "Beban PPN dan PPH" tetap 423.367.799 di dalam Jumlah Beban Operasional
(762.289.002, tak berubah), TAPI **EBITDA Juni menjadi −90.355.135** (PPN/PPh = beban operasional,
tidak lagi di-add-back; add-back EBITDA hanya untuk PPh badan/99999 yang kini 0). Engine
(`reportDelta.js`) disesuaikan: 62110 = opex biasa yang mendarat di baris PPN/PPH via lrAlias —
konsisten dengan jalur halaman (dyn) yang sudah benar. Catatan utk divisi: formula EBITDA di sheet
LABA RUGI lampiran (J81) masih menambahkan J53 — perlu diganti (+J53 → +J78) supaya sheet ikut
konvensi baru; pivot DATA LAMPIRAN juga menyajikan debit PPh ganda (80000 + 99999).

**Insiden:** upload buku v2 via UI sore 21/07 menghapus SEMUA keterangan jurnal Juni di produksi
(115 header + 410 baris) → routing Investasi 1.5.2 (423.095.000) regresi ke 1.5 dan deskripsi
Buku Besar hilang. File v2 sendiri utuh; pipeline upload terbukti benar saat direplay end-to-end
(dugaan: tab browser masih memuat bundle lama). **Perbaikan:** Juni di-upload ulang dari v2 via
pipeline CLI + approve 115/115 — keterangan pulih, reklas tetap. Verifikasi ulang: **Juni 17/17,
Juli 17/17**.

**Modul Aset Tetap:** Rekapan Penyusutan kini menampilkan akumulasi **mengikuti Neraca** (baseline
bulan frozen terakhir via ref-neraca + jurnal 12xxx.2 sesudahnya) — sebelumnya menjumlah kolom
register statis akum-audited-2025 sehingga beda dengan Neraca (temuan Bu Nisa 21/07: mis. Peralatan
208,4 jt vs 73,6 jt; Bangunan 3,28 M vs 4,85 M). Rekonsiliasi per kategori terbukti sen-per-sen:
akum Neraca = baseline Mei + jurnal penyusutan Juni. Lampiran repo `src/FILES` diganti ke v2.

**KOREKSI (21 Jul, sore):** konfirmasi divisi — konvensi EBITDA TIDAK berubah: baris "Beban PPN dan
PPH" tetap di-add-back di akun mana pun ia dicatat (rumus J81 lampiran memang disengaja; laporan
cetak resmi Juni menunjukkan **EBITDA 333.012.664**, bukan −90.355.135). Interpretasi sebelumnya
("hanya PPh badan yang di-add-back") keliru. Engine dikembalikan: 62110 → bucket pajak (baris PPN/PPH
di dalam ops + add-back EBITDA), dan jalur halaman (dyn) kini menambahkan balik 62110 juga —
keduanya menghasilkan 333.012.664 untuk Juni. Verifikasi ulang: Juni 17/17, Juli 17/17, suite 36/36.

### Rekap LRA per-periode (22 Jul 2026 — reminder Bu Nisha)

Tab "Rekap …" LRA sebelumnya menampilkan realisasi KUMULATIF s.d. periode (Juni: 6.934.043.654,84)
padahal kolom % sudah periode — permintaan divisi: rekap bulanan = realisasi bulan bersangkutan,
TW II = 3 bulan terakhir. Perbaikan: kolom menjadi Anggaran 2026 | Target Periode | **Realisasi
Periode Ini** | % (periode vs target periode); kartu KPI "Realisasi Periode Ini" (+ subteks
kumulatif); target periode diskalakan × jumlah bulan preset. Juni kini menampilkan 1.367.143.785,05
(= TOTAL Rekap Penerimaan lampiran divisi, terverifikasi 17/17), TW II = 4.616.996.969,40.

### LRA multi-bulan (TW/Semester) — dedup April + recovery bulan hilang (22 Jul 2026)

Reminder Bu Nisha: "TW II belum update datanya". Akar masalah di builder LRA.jsx (tab Tabel & Rekap):
(1) **April punya baris ganda per outline** di bebanUmum (137 baris vs ~61) — satu baris ANG-<kat>-<outline>
kumulatif (sd_lalu benar) + satu baris outline polos (sd_lalu 0). Preset multi-bulan menjumlah keduanya →
BULAN INI dobel (Gaji Direksi TW II 226jt, seharusnya 170jt) dan baris sd_lalu=0 menimpa sd_lalu benar
→ SD BLN LALU tampil 0. Fix: dedup satu baris per bulan (realisasi terbesar = baris kumulatif benar).
(2) **Outline tanpa baris bulan awal** (mis. 11.1 Sewa Kendaraan tak punya baris Jan/Feb; nilainya ada di
sd_bln_lalu Maret = 63,6jt) → preset mulai-Januari (Semester I) kehilangan nilai itu. Fix: bila baris
terawal dalam periode mulai setelah firstMonth, sd_bln_lalu-nya (pra-sejarah dalam periode) dilipat ke
bulanIni. Verifikasi vs lampiran resmi divisi: **TW II Beban Umum 63/63, Semester I Beban Umum 64/64 cocok.**

### Trial Juli 86 jurnal + hardening importer anti-salah-label (22 Jul 2026)

**Data Juli:** file divisi `JURNAL_JULI_22_Juni_.xlsx` (86 jurnal s.d. 22 Juli) menggantikan 74 jurnal
lama di prod (s.d. 16 Juli). Tambahan 12 jurnal (a.l. Listrik Pasar Antasari 164.846.285, DP Atap
20.106.500, Plafon 8.006.500) + reklas PPh 62110 di U0063. Diupload via CLI (koreksi kode
461436/511473 → 11104/11106), approve 86/86, seimbang 897.687.835. L/R Juli lengkap; baris "Beban PPN
dan PPH" 4.708.148 tampil.

**Hardening (akar masalah "akun belum muncul"):** tab file itu bernama "JURNAL JUNI 2026" padahal
isinya transaksi Juli — jika diupload via aplikasi apa adanya, `detectLampiranPeriods` lama membaca
nama tab → memproses period 2026-06 → clearReports Juni + menaruh baris Juli di Juni (menimpa Juni).
Perbaikan `reportSnapshot.js`: (1) `dominantJournalPeriod(ws)` membaca bulan dari TANGGAL baris
(bukan nama tab); (2) `detectLampiranPeriods` memakai period tanggal-baris sebagai otoritatif +
flag `mismatch`; (3) `findSheet` untuk JURNAL punya fallback pencocokan tanggal-baris. Hasil: file
salah-label kini terdeteksi 2026-07 saja (Juni tak pernah masuk daftar → tak bisa tertimpa), dan UI
memunculkan peringatan "Tab … berisi transaksi Juli, mohon perbaiki nama tab". Dites di
reportSnapshot.test.mjs (suite 37/37).

### Laba Rugi Juli beda dgn Excel — nomor rekening bank di kolom No. Akun (24 Jul 2026)

**Gejala:** layar Laba Rugi Juli menampilkan LABA (RUGI) USAHA −178.008.866 sedangkan lampiran Excel
divisi −384.998.718. Selisih persis **206.989.852**.

**Akar masalah (data):** jurnal U0010 "Pemindahan Saldo BNI Bisnis ke BNI Utama" memakai **nomor
rekening bank** di kolom No. Akun — `461436` (Bank BNI) dan `511473` (Bank BNI Bisnis) — bukan kode
COA (seharusnya 11104 / 11106).

**Mengapa laporan jadi salah (aplikasi):** halaman Laba Rugi menjumlah per PREFIX kode.
`"511473".startsWith('51')` → sisi kredit transfer masuk **Beban Pokok Penjualan** (−206.989.852),
sedangkan `"461436"` tidak cocok prefix pendapatan '41'/'42' sehingga sisi debit tidak tertangkap →
kedua sisi transfer tidak saling meniadakan → laba lebih besar 206.989.852. Direproduksi persis.

**Temuan tambahan:** rincian jurnal tersimpan DUA kali — tabel `journal_lines` (berisi 11104/11106,
hasil koreksi sebelumnya) dan blob `journals.lines` (berisi 461436/511473, hasil upload divisi).
Keduanya berbeda hanya di U0010. Laporan membaca blob, sedangkan Cek Konsistensi membaca tabel →
memberi **"Semua kode akun dikenal di COA" (false all-clear)**.

**Perbaikan aplikasi:** (1) `isValidAccountCode()` (lraOutline) — kode sah = 5 digit + opsional
`.n` (99999 tetap sah); (2) `attributeDelta` menolak kode tidak sah dari klasifikasi dan
mencatatnya sebagai unmapped `KodeTidakValid` (nilai tidak hilang, tapi tidak merusak baris laporan);
(3) `Laporan.jsx` `sumJByPrefix`/`getJLineItems` memakai guard yang sama; (4) Cek Konsistensi kini
memindai **kedua salinan** + cek baru `lines_sync` yang menandai jurnal yang kedua salinannya berbeda.
Hasil: dengan data prod apa adanya, halaman & mesin sama-sama **−384.998.718 = Excel divisi**.
Dipin di reportDelta.test.mjs (suite 38/38); regresi Juni 17/17.

**Sisa tindak lanjut divisi:** perbaiki No. Akun 2 baris transfer BNI di file master (→ 11104 / 11106).

**Bug ikutan (ditemukan saat mengoreksi U0010):** `validateJournalPayload` memeriksa keberadaan COA
dengan mengirim SELURUH string tampilan (`"61060 Beban Konsumsi Rapat dan Tamu"`) — padahal importer
lampiran menyimpan akun dalam format `"KODE NAMA"` (spasi, tanpa tanda hubung). Akibatnya **setiap
jurnal hasil impor tidak bisa diedit** (PUT selalu 400 VALIDATION_FAILED) — persis cara divisi
memperbaiki akun yang salah ketik. Diperbaiki: validasi memakai KODE di depan saja; kode yang benar-
benar tidak ada di COA tetap ditolak.

### Penataan hierarki COA sesuai kolom INDUK (30 Jul 2026)

Sheet `COA` pada lampiran Juli menandai 28 akun dengan **INDUK** di kolom E. Struktur COA di aplikasi
sebelumnya datar: semua akun 5-digit menempel langsung ke kelompok 2-digit (mis. 61011 → `61`), sehingga
akun induk dan sub-akun tampil sejajar.

**Perubahan:** `parent_code` 152 akun dirapikan — 128 sub-akun dipindah ke induknya (61011 → 61010, dst.)
dan 24 induk dipindah ke header kelompoknya (61010 → 61000, 62010 → 62000). Hasil: pohon COA kini
`61 → 61000 → 61010 → 61011`. Akun neraca/struktural (93 akun) tidak disentuh. Verifikasi: tidak ada
parent menggantung/siklus, dan regresi laporan Juni tetap **17/17 cocok**.

**Pengecualian:** `62110 Beban PPN dan PPH` berada tepat setelah blok 62100 di sheet, tetapi bukan
anaknya — ditempatkan langsung di bawah `62000`.

**Kolom `type` sengaja TIDAK diubah menjadi 'parent'.** Di aplikasi ini `type` menentukan apakah akun
bisa menerima posting dan ikut di Buku Besar serta ekspor laporan lengkap. Seluruh 28 akun INDUK
justru menerima posting langsung (divisi menjurnal ke induk + Sub Akun) senilai **Rp 28,0 miliar**
Jan–Jul; menandainya 'parent' akan mengeluarkan akun-akun itu dari daftar Buku Besar dan membuat
ekspor laporan lengkap kurang saji. Pohon COA tetap menampilkannya sebagai akun utama (tebal, bisa
dibuka) karena penyusunan pohon memakai `parent_code`, bukan `type`.

Pelengkap: dropdown "Akun Induk" pada form COA kini juga memuat akun yang sudah punya anak (bukan
hanya `type='parent'`), supaya sub-akun baru bisa ditempatkan di bawah induknya.

### Rekalkulasi laporan Juli pasca-penataan COA + banding lampiran FIX (30 Jul 2026)

Laporan dihitung ulang dari jurnal produksi memakai COA yang sudah ditata, lalu dibandingkan sheet demi
sheet dengan `Copy of FIX LAMPIRAN LAPORAN KEUANGAN JULI 2026`. Penataan COA terbukti **tidak mengubah
satu angka pun** (pohon COA hanya tampilan; laporan dihitung dari jurnal).

**Temuan utama — 6 baris jurnal Juli ber-kode salah (nama ≠ kode).** Kolom No. Akun keliru sementara
nama akunnya benar; sheet ringkasan divisi sendiri mengikuti NAMA:

| Jurnal | Kode tertulis | Nama akun (benar) | Kode seharusnya | Nilai |
|---|---|---|---|---|
| U0121 | 61070 | Peralatan | **12204.1** | 113.646.000 |
| U0121 | 61070 | Biaya yang Masih Harus Dibayar | **21500** | 56.823.000 |
| U0121 | 11101 | Bank Kalsel | **11103** | 56.825.500 |
| U0106 | 62020 | Beban Pemeliharaan Keamanan & Ketertiban | **62100** | 40.000.000 |
| U0097 | 62020 | Beban Tunjangan Pegawai Umum | **61020** | 1.633.000 |
| U0098 | 62020 | Beban Umum Lain-lain | **61140** | 1.152.000 |

Akibatnya Kas Kecil sempat **minus 37.884.800** dan pembelian CCTV 113,6 jt masuk Beban Umum, bukan
Peralatan/Investasi 1.3.4. Setelah dikoreksi di produksi: **Neraca, Laba Rugi, Arus Kas, dan LPE Juli
cocok dengan lampiran divisi sampai rupiah terakhir** (verifikasi 2/17 → 10/17).

**Sisa 7 sheet yang belum cocok — seluruhnya cacat pada Excel divisi, bukan aplikasi:**
- **Kolom kumulatif "Sd Bulan Ini" belum digulung ke Juni.** Dibuktikan numerik: seluruh **64/64** baris
  Beban Umum terjelaskan (selisihnya persis = net Juni tiap baris); pola sama di Penerimaan (16 baris)
  dan Investasi (1.5.2 423.095.000, 1.3.6 35.162.830, 6.2 3.850.000). Kolom "bulan ini" sendiri **cocok
  persis** (Beban Umum 528.584.384; Penerimaan 84.190.865; Rekap Investasi 128.801.000).
- **Beban Operasional 4.1** memuat angka **Juni** (194.798.200) di kolom Juli — app Juli 169.426.960.
- **DAFTAR AKTIVA TETAP**: satu-satunya beda = baris PASAR ANTASARI (penggabungan penambahan Juni
  423.095.000) yang belum dimasukkan divisi ke Excel-nya.
- **DATA LAMPIRAN LABA RUGI**: PPh 4.708.148 masih tersaji di blok 80000 pada pivot, sedangkan aplikasi
  memakai 62110 (reklasifikasi) — beda penyajian, bukan nilai.

**Insiden berulang — keterangan jurnal Juni terhapus lagi.** Pada 27 Jul 05:33 seluruh keterangan Juni
(115 header + 410 baris) kembali kosong akibat upload; nilai & kode identik (0 beda), hanya keterangan
yang hilang, sehingga routing Investasi 1.5.2 kembali jatuh ke 1.5. Sudah dipulihkan dari buku v2 —
Juni kembali **17/17** (kecuali baris register Antasari di atas). Mohon divisi hard-refresh sebelum
upload; bila terulang lagi perlu ditelusuri lebih dalam di sisi klien.

**Register aset disegarkan** dari lampiran FIX (134 baris): CCTV 113.646.000 dan instalasi listrik Juli
15.155.000 masuk, penggabungan PASAR ANTASARI dipertahankan → Bangunan 65.946.028.418, Peralatan
947.106.567, Instalasi 64.351.330 (sama dengan Neraca).
