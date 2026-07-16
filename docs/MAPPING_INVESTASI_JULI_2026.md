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
