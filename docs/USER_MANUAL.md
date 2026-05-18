# PANDUAN PENGGUNA — Aplikasi Keuangan Perumda Pasar Banjarmasin
**Versi 2026 | 36 Modul**

---

## DAFTAR ISI

1. [Pendahuluan](#pendahuluan)
2. [Login & Navigasi](#login--navigasi)
3. [Modul 1–3: Buku Besar](#modul-1-3-buku-besar)
4. [Modul 4: Departemen](#modul-4-departemen)
5. [Modul 5–7: Voucher](#modul-5-7-voucher)
6. [Modul 8–10: Jurnal](#modul-8-10-jurnal)
7. [Modul 11–13: Kunci & Jenis Jurnal](#modul-11-13-kunci--jenis-jurnal)
8. [Modul 14–19: Laporan Keuangan](#modul-14-19-laporan-keuangan)
9. [Modul 20–22: Piutang](#modul-20-22-piutang)
10. [Modul 23–24: Hutang](#modul-23-24-hutang)
11. [Modul 25–28: Persediaan](#modul-25-28-persediaan)
12. [Modul 29: Giro](#modul-29-giro)
13. [Modul 30: Aktiva Tetap](#modul-30-aktiva-tetap)
14. [Modul 31: Produksi](#modul-31-produksi)
15. [Modul 32: E-Faktur PPN](#modul-32-e-faktur-ppn)
16. [Modul 33: Anggaran vs Realisasi](#modul-33-anggaran-vs-realisasi)
17. [Modul 34: Rekonsiliasi Bank](#modul-34-rekonsiliasi-bank)
18. [Modul 35: Backup & Restore](#modul-35-backup--restore)
19. [Modul 36: Pengaturan & Keamanan](#modul-36-pengaturan--keamanan)
20. [Alur Persetujuan (Approval)](#alur-persetujuan)
21. [FAQ](#faq)

---

## Pendahuluan

Aplikasi Keuangan Perumda Pasar Banjarmasin adalah sistem akuntansi berbasis web yang mencakup 36 modul untuk mengelola seluruh siklus keuangan: dari input jurnal, persetujuan voucher, hingga pelaporan keuangan sesuai SAK EP.

**Akses Aplikasi:** Buka browser → navigasi ke URL aplikasi (Railway/localhost:3001)

---

## Login & Navigasi

### Peran Pengguna (Role)

| Role | Hak Akses |
|---|---|
| `kasir` | Input voucher, cetak, lihat laporan |
| `akuntan` | Semua transaksi + approve + laporan |
| `manajer_keuangan` | Approve, lihat laporan, kunci periode |
| `direktur` | Approve, lihat laporan |
| `auditor` | Lihat semua data (read-only) |
| `staff_gudang` | Persediaan & inventory |
| `staff_pajak` | E-Faktur PPN |
| `admin` / `super_admin` | Akses penuh ke seluruh sistem |

### Navigasi Sidebar

Klik ikon ☰ di kiri atas untuk membuka/tutup sidebar. Menu dikelompokkan:
- **Dashboard** — Ringkasan KPI
- **Transaksi** — Jurnal, Voucher, Piutang, Hutang
- **Master Data** — COA, Departemen, Pelanggan, Supplier
- **Laporan** — Semua laporan keuangan
- **Pengaturan** — Backup, user, konfigurasi

---

## Modul 1-3: Buku Besar

**Halaman:** Sidebar → Buku Besar (`/buku-besar`)

### Modul 1 — Saldo Awal

Saldo awal adalah nilai pembuka setiap akun di awal tahun buku.

**Cara melihat saldo awal:**
1. Buka halaman **Buku Besar**
2. Pilih akun dari dropdown (contoh: `11103 Bank Kalsel`)
3. Saldo awal ditampilkan di baris pertama tabel
4. Saldo awal diimpor dari file Excel via menu **Import Data**

**Cara import saldo awal:**
1. Buka **Import Data** (`/import-data`)
2. Pilih file Excel format audit (Jan/Feb/Mar/Apr)
3. Klik **Import** — sistem akan membaca saldo awal dari sheet yang sesuai

### Modul 2 — Chart of Accounts (COA)

**Halaman:** Sidebar → COA (`/coa`)

**Fitur:**
- Lihat seluruh daftar akun dalam format tree (hierarki)
- Filter berdasarkan kategori: Aset, Kewajiban, Ekuitas, Pendapatan, Beban
- Search berdasarkan kode atau nama akun

**Cara tambah akun baru:**
1. Klik tombol **+ Tambah Akun**
2. Isi: Kode akun, Nama, Kategori, Parent (induk), Saldo Awal
3. Klik **Simpan**
4. Sistem akan validasi: kode tidak boleh duplikat, format harus sesuai

**Cara edit akun:**
1. Klik ikon ✏️ pada baris akun
2. Ubah field yang diperlukan
3. Klik **Simpan**

**Cara hapus akun:**
1. Klik ikon 🗑️ pada baris akun
2. Konfirmasi penghapusan
3. ⚠️ Tidak bisa dihapus jika ada jurnal yang menggunakan akun ini

### Modul 3 — Type Perkiraan

Setiap akun memiliki tipe yang menentukan perilaku saldo:

| Type | Saldo Normal | Contoh |
|---|---|---|
| Aset | Debit | Kas, Piutang, Gedung |
| Kewajiban | Kredit | Hutang Dagang, Hutang Pajak |
| Ekuitas | Kredit | Modal Disetor, Laba Ditahan |
| Pendapatan | Kredit | Pendapatan Sewa, Jasa |
| Beban | Debit | Gaji, Listrik, Penyusutan |
| Parent | — | Akun induk (tidak untuk posting) |

Filter di halaman COA menggunakan tipe ini untuk mengelompokkan akun.

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 3 (Setup COA & Saldo Awal — ✅), Baris 30 (COA Aktual Perumda — ✅ BARU 226 akun), Baris 33 (Saldo Awal LAI 2025 — ✅ BARU).

**Skenario 1 — Saldo Awal (Modul 1):**
Bu Rina, Akuntan Senior, baru saja menerima Laporan Audit Independen (LAI) 2025 dari KAP. Dia perlu memastikan saldo awal 2026 sama persis dengan audited financial statement. Dia buka **Buku Besar → akun `11103 Bank Kalsel`** dan melihat saldo awal **Rp 5.700.000.000** muncul otomatis di baris pertama (sesuai sheet `Saldo Awal LAI` — 25 akun audited). Dia tidak perlu input manual; sistem sudah membaca dari Excel saat impor. Untuk verifikasi, dia ekspor ke Excel dan cocokkan dengan dokumen LAI — angka identik.

**Skenario 2 — COA (Modul 2):**
Pak Budi, staf gudang baru, ingin membuat akun baru `13101 — Persediaan Beras Subsidi`. Dia buka **COA → klik + Tambah Akun**, isi kode `13101`, parent `13 Persediaan`, tipe `Aset` saldo normal Debit. Sistem menolak karena kode sudah dipakai (di-load dari 226 akun sheet COA Excel). Dia ubah ke `13107`, validasi lolos, akun langsung tersedia di dropdown jurnal. Tidak ada akun yang bisa dihapus jika sudah dipakai jurnal — proteksi referential integrity.

**Skenario 3 — Type Perkiraan (Modul 3):**
Saat audit internal, Tim Audit ingin lihat semua akun beban untuk cek anomali. Dia buka **COA → filter tipe Beban**. Hasil: hanya 41 akun (kode `6xxxx`) yang ditampilkan, semuanya bersaldo normal Debit. Saat klik akun `61130 Beban Penyusutan`, dia langsung lihat saldo YTD dan link ke daftar 119 aset penyusutnya.

---

## Modul 4: Departemen

**Halaman:** Sidebar → Master Data (`/master-data`) → Tab Departemen

**Cara tambah departemen:**
1. Klik **+ Tambah Departemen**
2. Isi Kode (contoh: `DEP-001`), Nama, Keterangan
3. Klik **Simpan**

**Cara hapus:**
- Departemen tidak bisa dihapus jika ada akun COA atau jurnal yang mereferensikannya

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Bonus 27-29 (Master Data tambahan — ✅).

**Skenario — Pemisahan Cost Center:**
Direksi Perumda Pasar ingin laporan laba rugi terpisah per pasar binaan: Pasar Sentra Antasari, Pasar Lima, Pasar Niaga. Pak Hendra, Manajer Keuangan, masuk **Master Data → Departemen → + Tambah** dan input tiga kode: `DEP-001 Pasar Antasari`, `DEP-002 Pasar Lima`, `DEP-003 Pasar Niaga`. Saat staf input jurnal pendapatan sewa, dia pilih akun `41101 Pendapatan Sewa` lalu departemen yang sesuai. Hasilnya: di **Laporan → Laba Rugi → Filter Departemen**, manajer bisa lihat kontribusi profit per pasar. Saat coba menghapus `DEP-001` (yang sudah dipakai 47 jurnal), sistem menolak dengan pesan referential constraint — proteksi data integritas.

---

## Modul 5-7: Voucher

**Halaman:** Sidebar → Voucher (`/voucher`)

### Modul 5 — Input Voucher

Voucher adalah bukti transaksi kas yang harus disetujui sebelum masuk ke laporan.

**Cara membuat voucher baru:**
1. Klik **+ Voucher Baru**
2. Isi:
   - **Tanggal** — tanggal transaksi
   - **Keterangan** — deskripsi transaksi
   - **Akun Debit** — pilih dari COA
   - **Akun Kredit** — pilih dari COA
   - **Jumlah** — nilai transaksi (debit otomatis = kredit)
3. Klik **Simpan**
4. Voucher tersimpan dengan status **PENDING** (Draft)
5. ID otomatis: `VC-2026-001`, `VC-2026-002`, dst.

**Validasi otomatis:**
- Akun debit dan kredit harus ada di COA
- Jumlah harus > 0
- Periode tidak boleh terkunci

### Modul 6 — Edit Voucher

**Aturan edit:**
- ✅ Voucher berstatus **PENDING** bisa diedit
- ❌ Voucher berstatus **POSTED** tidak bisa diedit
- ❌ Voucher di periode terkunci tidak bisa diedit

**Cara edit:**
1. Klik voucher di tabel
2. Ubah field yang diperlukan
3. Klik **Simpan**

### Modul 7 — Cetak Voucher

**Aturan cetak:**
- Hanya voucher **POSTED** yang bisa dicetak
- Setiap cetakan dilacak (print count)
- Cetakan ke-2 dst mendapat watermark **COPY**

**Cara cetak:**
1. Klik ikon 🖨️ pada voucher berstatus POSTED
2. Format cetak A4 dengan blok tanda tangan:
   - Pembuat
   - Pemeriksa
   - Direktur

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 4 (Voucher Approval → Jurnal — sebelumnya ❌, kini sudah tersedia: voucher kas/bank dengan auto-jurnal).

**Skenario — Bayar Listrik Kantor (Modul 5–7 ujung-ke-ujung):**

**(Modul 5 – Input)** Pak Andi, kasir Perumda, menerima tagihan PLN Rp 4.250.000 untuk kantor pusat. Dia buka **Voucher → + Buat Voucher**:
- Grup: `BK - Bank Keluar`, Tanggal: `15 April 2026`
- Keterangan: `Pembayaran tagihan listrik PLN April 2026`
- Baris 1: Akun Debit `61201 Beban Listrik` — Rp 4.250.000
- Baris 2: Akun Kredit `11103 Bank Kalsel` — Rp 4.250.000

Saat klik **Simpan**, sistem otomatis:
1. Generate nomor `V-BK-0023`
2. Buat entri jurnal `JV-2026-187` dengan link ke voucher
3. Status voucher = **PENDING (Draft)** — belum masuk laporan

**(Modul 6 – Edit)** 10 menit kemudian Andi sadar tanggalnya salah (seharusnya 16 April). Karena masih PENDING, dia klik voucher → ubah tanggal → **Simpan**. Sistem update jurnal terkait. Kalau voucher sudah POSTED, edit ditolak (harus unapprove dulu).

**(Approval — lihat Modul 8)** Bu Sari, Akuntan, review voucher. Detail voucher cocok dengan tagihan PLN. Dia klik **Approve** → status voucher dan jurnal berubah POSTED → masuk Laba Rugi April.

**(Modul 7 – Cetak)** Hari berikutnya Andi cetak voucher untuk arsip fisik & tanda tangan basah. Dia klik 🖨️ → format A4 dengan kop perusahaan + tiga kotak tanda tangan (Pembuat: Andi, Pemeriksa: Sari, Direktur). Saat cetak ulang minggu depan untuk auditor, otomatis muncul watermark **COPY** dengan print count = 2.

---

## Modul 8-10: Jurnal

**Halaman:** Sidebar → Jurnal (`/jurnal`)

### Modul 8 — Entry Jurnal

**Cara membuat jurnal baru:**
1. Klik **+ Tambah Jurnal**
2. Isi form:
   - **Tanggal** — tanggal transaksi
   - **Keterangan** — deskripsi
   - **Akun Debit** — pilih akun
   - **Akun Kredit** — pilih akun
   - **Debit** — nilai debit
   - **Kredit** — nilai kredit
   - **Status** — Pending atau Posted
3. Klik **Simpan**

**Filter jurnal:**
- Filter berdasarkan: Status (All/Posted/Pending), bulan, pencarian teks
- Badge warna: 🟢 P = Posted, 🟠 W = Waiting (Pending)

**Approval jurnal:**
1. Pilih jurnal berstatus **Pending**
2. Klik tombol **Approve** (✓)
3. Status berubah menjadi **Posted**
4. Jurnal masuk ke perhitungan semua laporan

**Unapprove (batalkan):**
1. Pilih jurnal berstatus **Posted**
2. Klik tombol **Unapprove**
3. Status kembali ke **Pending**
4. Jurnal keluar dari perhitungan laporan

### Modul 9 — Cetak Jurnal Memorial

**Cara cetak/export:**
1. Di halaman Jurnal, klik **Export CSV** atau **Cetak**
2. Filter berdasarkan tanggal jika diperlukan
3. File CSV terunduh otomatis

### Modul 10 — Laporan Jurnal

Di halaman Jurnal, bagian atas menampilkan ringkasan:
- Total jurnal
- Jumlah Posted vs Pending
- Total Debit dan Kredit

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 5 (Jurnal Umum — ✅ CRUD, approval, kunci periode, cek selisih D/K, AR/AP sync), Baris 32 (Jurnal Aktual Trial Error — ✅ BARU 341 jurnal riil Jan+Apr).

**Skenario 1 — Jurnal Penyesuaian Akhir Bulan (Modul 8):**
Tanggal 30 April 2026, Bu Sari perlu mencatat penyesuaian sewa dibayar dimuka. Dia buka **Jurnal → + Buat Jurnal**:
- Tanggal: `30 April 2026`
- Keterangan: `Penyesuaian sewa dibayar dimuka April`
- Posisi Debit, Akun: `61301 Beban Sewa`, Sub Akun: `Pasar Antasari`, Jumlah: `Rp 12.500.000`
- Status: `pending`

Klik **Simpan**. Berkat fitur dynamic refresh (release terbaru), entri langsung muncul di tabel tanpa perlu reload halaman. ID otomatis `JV-2026-188`. Karena banyak jurnal serupa untuk 11 pasar, dia klik ikon **Copy** pada jurnal Pasar Antasari, edit nama sub akun, jadi 11 entri dalam 2 menit.

**Skenario 2 — Approval & Cek Selisih (Modul 8):**
Pak Hendra (Manajer Keuangan) buka Jurnal, filter Status = **Pending**, lihat 11 jurnal Bu Sari. Sebelum approve massal, dia klik **Cek Selisih** → modal muncul menampilkan: Total Debit = Total Kredit ✓, AR Match ✓, AP Match ✓. Aman. Dia centang dan klik **Approve** untuk masing-masing. Status berubah ke `posted` (badge hijau P), jurnal masuk Laba Rugi April.

**Skenario 3 — Cetak Jurnal Memorial (Modul 9):**
Auditor eksternal minta semua jurnal periode Januari–April 2026 dalam Excel. Bu Sari buka **Jurnal**, filter tanggal `2026-01-01` s/d `2026-04-30`, klik **Export CSV**. File berisi 341 baris jurnal (154 Jan + 187 Apr — sesuai data riil) terunduh dengan kolom lengkap: ID, Tanggal, Akun Debit/Kredit, Nominal, Status, Bukti.

**Skenario 4 — Laporan Jurnal (Modul 10):**
Direktur masuk halaman Jurnal di pagi hari rapat. Header langsung menampilkan: **341 jurnal (328 Posted, 13 Pending), Total Debit Rp 24.5 M, Total Kredit Rp 24.5 M**. Beliau langsung tahu ada 13 transaksi yang perlu di-approve sebelum tutup buku April.

---

## Modul 11-13: Kunci & Jenis Jurnal

### Modul 11 — Kunci Transaksi (Period Lock)

**Halaman:** Sidebar → Pengaturan (`/pengaturan`)

**Cara mengunci periode:**
1. Buka Pengaturan → Tab Periode
2. Pilih periode (contoh: `2026-01`)
3. Klik **Kunci Periode**
4. Efek: Semua jurnal/voucher di bulan tersebut tidak bisa dibuat/diedit/dihapus

### Modul 12 — Buka Kunci Transaksi

**Cara membuka kunci:**
1. Buka Pengaturan → Tab Periode
2. Pilih periode terkunci
3. Klik **Buka Kunci**
4. Isi **alasan** pembukaan (wajib)
5. Dicatat di audit trail

**Siapa yang bisa:** `admin`, `super_admin` saja

### Modul 13 — Jenis Jurnal

Sistem mendukung beberapa prefix jurnal:
- `JV-` — Jurnal Voucher (umum)
- `VC-` — Voucher Kas
- `SA-` — Saldo Awal
- `JAN-`, `FEB-`, `MAR-`, `APR-` — Jurnal per bulan dari import Excel

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 9 (Kunci Periode SAK EP — ✅), Baris 32 (Jurnal Aktual per bulan — ✅ BARU).

**Skenario 1 — Tutup Buku Januari (Modul 11 Kunci Periode):**
Setelah Laporan Keuangan Januari 2026 disahkan Direksi tanggal 15 Februari, Bu Sari membuka **Pengaturan → Tab Periode → pilih `2026-01`** dan klik **Kunci Periode**. Sistem mencatat: locked oleh `akuntan` pada `2026-02-15 14:30`. Mulai detik itu, semua percobaan tambah/edit/hapus jurnal bertanggal Januari ditolak dengan pesan: *"Jurnal ini berada di periode yang terkunci."* Indikator 🔒 muncul di tabel jurnal Januari. Aman dari manipulasi data audit.

**Skenario 2 — Buka Kunci Darurat (Modul 12):**
Dua minggu kemudian ditemukan jurnal pendapatan Januari yang tertukar akunnya (efek Rp 23 juta). Hanya `admin`/`super_admin` yang bisa unlock. Pak Hendra (admin) buka periode terkunci → klik **Buka Kunci** → wajib isi alasan: *"Koreksi salah akun pendapatan parkir Pasar Lima — temuan audit internal #2026-001."* Sistem mencatat alasan ke audit log. Setelah koreksi selesai, periode dikunci kembali. Manajer/Direktur lain tidak bisa unlock — guard role-based.

**Skenario 3 — Identifikasi Sumber Jurnal via Prefix (Modul 13):**
Auditor minta breakdown jurnal: berapa dari import bulanan vs voucher manual? Bu Sari pakai search box di halaman Jurnal:
- Cari `JAN-` → 154 jurnal (impor Excel Januari)
- Cari `APR-` → 187 jurnal (impor Excel April)
- Cari `JV-2026-` → 13 jurnal manual entri staff
- Cari `VC-` → 47 voucher kas/bank yang sudah jadi jurnal

Total cocok dengan 341 + 47 entri di sistem. Prefix berfungsi sebagai audit trail asal-usul transaksi.

---

## Modul 14-19: Laporan Keuangan

**Halaman:** Sidebar → Laporan (`/laporan`)

### Pemilihan Periode

Di bagian atas halaman Laporan terdapat **period selector**:
- Klik bulan: **Jan, Feb, Mar, Apr, ..., Des**
- Klik preset: **TW I, TW II, Semester I, Tahunan**
- Semua angka di laporan langsung berubah sesuai periode yang dipilih

### Modul 14 — Laporan Buku Besar

**Tab:** Buku Besar
- Pilih akun dari dropdown
- Tampil: running balance per transaksi
- Kolom: Tanggal, Ref, Keterangan, Debit, Kredit, Saldo

### Modul 15 — Laporan Neraca (Balance Sheet)

**Tab:** Neraca + 4 sub-report (MTD/YTD, Detail, Triwulan)
- Menampilkan: Aset, Kewajiban, Ekuitas
- Data YTD (Year-to-Date) hingga bulan yang dipilih
- Total Aset harus = Total Kewajiban + Ekuitas

**Sub-reports:**
- **Neraca MTD/YTD** — perbandingan bulan ini vs kumulatif
- **Neraca Detail** — per akun detail
- **Neraca Triwulan** — perbandingan per triwulan

### Modul 16 — Laporan Neraca Saldo (Trial Balance)

**Tab:** Neraca Saldo + 2 sub-report
- Semua akun dengan saldo Debit dan Kredit
- Total Debit harus = Total Kredit
- Header otomatis mengikuti periode: "Per April 2026"

### Modul 17 — Laporan Laba Rugi (Income Statement)

**Tab:** Laba Rugi + 7 sub-report
- Pendapatan - Beban = Laba/Rugi Bersih
- Data MTD (bulan yang dipilih saja)

**Sub-reports:**
- **L/R MTD/YTD** — bulan ini vs kumulatif
- **L/R Detail** — per akun detail
- **L/R Triwulan** — perbandingan TW I–IV
- **L/R Semester** — perbandingan Semester I–II
- **L/R 2 Bulan** — perbandingan 2 bulan berturut
- **L/R Budget** — aktual vs anggaran
- **L/R Project** — per proyek

### Modul 18 — Laporan HPP

**Tab:** HPP + sub-reports
- Harga Pokok Penjualan
- Dikelompokkan per akun kategori HPP

### Modul 19 — Lacak Kilat (Drill-Down)

**Tab:** Lacak Kilat
- Masukkan kode akun → lihat semua transaksi terkait
- Drill-down dari summary ke detail

**Grafik Dashboard (Dinamis):**
- **Komposisi Beban** — Doughnut chart (berubah per periode)
- **Tren Laba Bersih** — Line chart bulanan
- **Pendapatan vs Beban** — Bar chart bulanan
- **Tren Saldo Kas** — Line chart dengan saldo running

**Analisis Rasio (Tab Rasio):**
Semua dihitung otomatis dari data jurnal:
- Current Ratio, Debt-to-Equity, NPM, ROA, ROE, Cash Ratio

**Export:** Setiap tab memiliki tombol **Cetak Laporan** dan **Unduh Excel (.xlsx)**

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 6 (Buku Besar — ✅), Baris 7 (Neraca, NS, Arus Kas — ✅ NS 3 varian, Neraca 4 varian, Arus Kas dinamis), Baris 8 (Laba Rugi 7 Varian — ✅), Baris 9 (HPP 5 varian + Lacak Kilat — ✅), Baris 35 (Laporan TW/Semester/Tahunan — ✅ BARU).

**Skenario 1 — Buku Besar Bank Kalsel (Modul 14):**
Bu Sari mendapat email dari Bank Kalsel: ada transfer Rp 12.5 juta yang tidak teridentifikasi. Dia buka **Laporan → Buku Besar**, pilih akun `11103 Bank Kalsel`. Tabel running balance menampilkan setiap mutasi dari saldo awal Rp 5.7M, lengkap kolom Tanggal/Ref/Debit/Kredit/Saldo. Dia search keyword "transfer" → menemukan jurnal `JV-2026-145` tanggal 12 April. Klik referensi → drill ke detail jurnal asli. Selesai dalam 30 detik.

**Skenario 2 — Neraca per April 2026 (Modul 15):**
Direktur minta posisi keuangan per akhir April. Bu Sari pilih bulan **April** di period selector → **Tab Neraca**. Tampilan: Total Aset Rp X = Total Kewajiban + Ekuitas Rp X (selalu balance — guard sistem). Dia switch ke sub-tab **Neraca Detail** untuk drill-down per akun, lalu **Neraca Triwulan** untuk perbandingan TW I (Jan-Mar) vs April. Klik **Unduh Excel** → siap dilampirkan ke email Direksi.

**Skenario 3 — Trial Balance Pre-audit (Modul 16):**
Sebelum kirim ke KAP, Bu Sari verifikasi trial balance. **Tab Neraca Saldo → April 2026**. Header otomatis: "Per April 2026". Total Debit Rp 24.5 M = Total Kredit Rp 24.5 M ✓. Cocok dengan ringkasan halaman Jurnal — semua entri ter-posting dengan benar.

**Skenario 4 — Laba Rugi vs Anggaran (Modul 17):**
Pak Hendra mau review apakah biaya operasional di bawah budget. **Tab Laba Rugi → sub-tab L/R Budget**. Tabel menampilkan kolom: Aktual April | Anggaran April | Selisih | % Realisasi. Beban listrik 87% dari anggaran (hemat), beban gaji 102% (lebih). Dia klik **L/R 2 Bulan** untuk lihat trend Maret vs April → komposisi beban menurun 3.5%. Switch **Tampilkan Perbandingan** menambahkan kolom % growth (hijau/merah). Sangat siap untuk slide presentasi rapat direksi.

**Skenario 5 — HPP Per Kategori (Modul 18):**
**Tab HPP → sub-tab HPP Standar**. Sistem hitung otomatis: Persediaan Awal + Pembelian − Persediaan Akhir = HPP Rp 8.2 M untuk April. Sub-tab **HPP per Departemen** memecah HPP per pasar binaan, sangat berguna untuk analisis margin per cost center.

**Skenario 6 — Drill-down Lacak Kilat (Modul 19):**
Selama rapat, Direktur menunjuk angka Pendapatan Sewa Rp 1.45 M dan tanya, "Mana detailnya?" Bu Sari buka **Laporan → Lacak Kilat**, masukkan kode `41101`. Daftar 73 transaksi sewa muncul dengan tanggal, penyewa, jumlah, ref jurnal — bisa di-Excel-kan langsung. Tab **Rasio Keuangan** sebelahnya menampilkan: Current Ratio 2.4 (sehat), DER 0.18 (rendah, leverage konservatif), NPM 14% — siap jadi bahan analisis kinerja.

---

## Modul 20-22: Piutang

**Halaman:** Sidebar → Piutang (`/piutang`)

### Modul 20 — Induk & Transaksi Piutang

**Cara tambah piutang:**
1. Klik **+ Tambah Piutang**
2. Isi: Pelanggan, Tanggal, Jatuh Tempo, Jumlah, Keterangan
3. Klik **Simpan**

**Data terkait:**
- **Pelanggan** — dikelola di Master Data (`/master-data`)
- **Sales Order** — dikelola di Penjualan (`/penjualan`)

### Modul 21 — Statement of Account (SOA)

Laporan per pelanggan yang menunjukkan:
- Saldo awal, transaksi bulan ini, pembayaran, saldo akhir

### Modul 22 — Proses Akhir Periode

Penutupan piutang di akhir bulan:
- Roll-over saldo ke periode berikutnya
- Dicatat siapa yang menutup dan kapan

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 11 (Master Pelanggan & Faktur AR — ✅), Baris 12 (Penerimaan, Aging & Monitor — ✅), Baris 13 (Statement of Account — sebelumnya ❌, kini fitur SOA mulai dirintis di Modul 21).

**Skenario 1 — Faktur Sewa Bulanan (Modul 20):**
Tanggal 1 April, Pak Joko (Akuntan AR) input faktur sewa kios pasar. Pertama dia pastikan pelanggan sudah ada di **Master Data → Pelanggan** (`PLG-0142 Toko Sumber Rejeki`). Lalu **Piutang → + Tambah Piutang**:
- Pelanggan: `PLG-0142`, Tanggal: `2026-04-01`, Jatuh Tempo: `2026-04-30`
- Jumlah: `Rp 3.500.000`, Keterangan: `Sewa kios Blok B-12 April 2026`

Sistem generate `PI-0237`, lalu otomatis post jurnal: D `11201 Piutang Usaha` Rp 3.5 jt, K `41101 Pendapatan Sewa` Rp 3.5 jt. Saldo piutang `11201` di Buku Besar otomatis bertambah — link ke modul Jurnal real-time.

**Skenario 2 — Pembayaran Cicilan & Aging (Modul 22):**
20 April, Toko Sumber Rejeki bayar Rp 2 juta lewat transfer. Pak Joko buka piutang `PI-0237` → klik **Bayar** → Tanggal `2026-04-20`, Jumlah `Rp 2.000.000`. Sisa Rp 1.5 jt. Auto jurnal: D `11103 Bank Kalsel`, K `11201 Piutang Usaha`. Akhir April, beberapa piutang lewat jatuh tempo. Manajer buka **Tab Aging** dan lihat bucket: Current Rp 12.4 M | 1-30 hari Rp 3.8 M | 31-60 Rp 1.2 M | 61-90 Rp 450 rb | >90 Rp 180 rb. Total piutang Rp 18.0 M cocok dengan saldo `11201` di Neraca (validasi via Cek Selisih AR/AP).

**Skenario 3 — Statement of Account (Modul 21):**
Toko Sumber Rejeki minta rekap mutasi piutang Q1. Pak Joko buka **Piutang → Tab SOA → pilih `PLG-0142`**. Tampilan: Saldo Awal Jan, Faktur Jan-Apr (4 baris), Pembayaran (3 baris), Saldo Akhir Apr Rp 1.5 jt. PDF terkirim ke pelanggan via email — tanpa hitung manual.

**Skenario 4 — Tutup Periode Piutang (Modul 22):**
30 April pukul 17:00, Pak Joko buka **Piutang → Proses Akhir Periode → April 2026** → klik **Tutup**. Sistem roll-over saldo akhir setiap pelanggan ke saldo awal Mei, audit log mencatat: closed by `akuntan` pada `2026-04-30 17:05`. Jika ada faktur baru bertanggal April yang masuk setelah penutupan, sistem menolak — periode terkunci sinkron dengan modul Jurnal.

---

## Modul 23-24: Hutang

**Halaman:** Sidebar → Hutang (`/hutang`)

### Modul 23 — Transaksi Hutang

**Cara tambah hutang:**
1. Klik **+ Tambah Hutang**
2. Isi: Supplier, Tanggal, Jatuh Tempo, Jumlah, Keterangan
3. Klik **Simpan**

**Data terkait:**
- **Supplier** — dikelola di Master Data
- **Purchase Order** — dikelola di Pembelian (`/pembelian`)

### Modul 24 — Laporan Umur Hutang (Aging)

Mengelompokkan hutang berdasarkan usia:
- Current (belum jatuh tempo)
- 1–30 hari, 31–60 hari, 61–90 hari, >90 hari

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 14 (Master Supplier & Faktur AP — ✅), Baris 15 (Pembayaran Hutang & Aging — ✅), Baris 16 (Laporan Hutang per supplier — ⚠️ sebagian).

**Skenario 1 — Faktur Hutang Supplier (Modul 23):**
Pak Andi terima faktur dari `SUP-0034 PT Karya Sentosa` untuk renovasi atap pasar Rp 87.500.000, jatuh tempo 30 hari. Dia buka **Hutang → + Tambah Hutang** → pilih supplier, tanggal `2026-04-05`, jatuh tempo `2026-05-05`, jumlah, keterangan: *"Renovasi atap Pasar Niaga — kontrak K-2026/03"*. Sistem buat `HU-0089` + auto-jurnal: D `15201 Bangunan dalam Pelaksanaan`, K `21101 Hutang Usaha`.

**Skenario 2 — Pelunasan Bertahap:**
Karena DPA cair bertahap, Bu Sari bayar Rp 50 juta pada 25 April → klik **Bayar** di `HU-0089`. Sisa Rp 37.5 jt. Auto-jurnal: D `21101 Hutang Usaha`, K `11103 Bank Kalsel`. Sistem mempertahankan link `HU-0089` ke pembayaran-pembayarannya untuk audit trail.

**Skenario 3 — Aging Hutang & Cash Planning (Modul 24):**
Awal Mei, Manajer Keuangan buka **Hutang → Tab Aging**. Bucket menunjukkan:
- Current (belum jatuh tempo): Rp 124 jt
- 1-30 hari (overdue ringan): Rp 22 jt
- 31-60 hari: Rp 8 jt
- >60 hari: Rp 0 ✓ (no bad-faith)

Total hutang Rp 154 jt cocok dengan saldo `21101` di Neraca (validasi Cek Selisih AP di modul Jurnal). Beliau prioritaskan bayar bucket 31-60 hari minggu ini agar tidak terkena denda kontrak. Klik **Monitor Jatuh Tempo** → list 7 supplier yang jatuh tempo minggu ini, urut berdasarkan tanggal terdekat.

---

## Modul 25-28: Persediaan

**Halaman:** Sidebar → Persediaan (`/persediaan`)

### Modul 25 — Master Barang & Lokasi

**Cara tambah barang:**
1. Klik **+ Tambah Barang**
2. Isi: Kode, Nama, Satuan, Stok, Harga
3. Klik **Simpan**

### Modul 26 — Terima & Keluar Barang

- **Terima barang** — dari Purchase Order, menambah stok
- **Keluar barang** — dari Sales Order, mengurangi stok

### Modul 27 — Antar Lokasi (Transfer)

Memindahkan barang antar lokasi/gudang:
- Pilih dari_lokasi, ke_lokasi, barang, jumlah
- Stok otomatis terupdate di kedua lokasi

### Modul 28 — Stock Opname

Pencocokan stok fisik vs stok sistem:
1. Masukkan qty fisik hasil penghitungan
2. Sistem menghitung selisih otomatis
3. Status: Sesuai, Kurang, atau Lebih

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 17 (Master Barang, Gudang & Harga — ⚠️ multi-gudang masih dirintis), Baris 18 (Mutasi Stok & Low Stock — ✅), Baris 21 (Laporan Inventory & Stock Opname — ✅ telah dibangun).

**Skenario 1 — Master Barang (Modul 25):**
Bu Diah, staf gudang baru, input katalog ATK kantor pusat. Buka **Persediaan → + Tambah Barang**:
- Kode: `ATK-001`, Nama: `Kertas A4 80gsm`, Satuan: `Rim`
- Stok awal: `45`, Harga: `Rp 52.000`

Klik **Simpan**. Sistem hitung nilai persediaan `Rp 2.340.000` dan tampilkan di KPI inventaris. Ulangi untuk 23 item ATK lainnya.

**Skenario 2 — Mutasi Stok (Modul 26):**
Hari Senin, Bu Diah terima 100 rim kertas dari supplier (link ke PO `PO-0045`). Dia klik **Terima Barang** pada `ATK-001` → qty `100`, ref PO. Stok jadi 145 rim, total nilai naik Rp 5.2 jt. Hari Rabu, divisi keuangan minta 12 rim → **Keluar Barang**, qty `12`, ref permintaan. Stok 133 rim. Setiap mutasi auto-jurnal: D Persediaan/Beban, K Persediaan, link ke modul Jurnal.

**Skenario 3 — Low Stock Alert:**
Setiap pagi Bu Diah cek dashboard Persediaan. Card **Low Stock** menyala merah: 3 item di bawah min stock (`ATK-007 Toner Printer` — 1 unit, min 5). Dia langsung kirim PR (Purchase Request) ke pembelian. Mencegah stok kosong saat dibutuhkan rapat.

**Skenario 4 — Antar Lokasi (Modul 27):**
Pasar Sentra Antasari kekurangan plastik kemasan, sementara Pasar Niaga overstok. Bu Diah klik **Transfer** → Dari `GD-NIAGA`, Ke `GD-ANTASARI`, item `KEM-002 Plastik 1kg`, qty `200`. Stok GD-NIAGA −200, stok GD-ANTASARI +200. Total nilai persediaan tetap (zero-sum transfer).

**Skenario 5 — Stock Opname Akhir Bulan (Modul 28):**
30 April, tim opname hitung fisik dan input ke **Persediaan → Tab Stock Opname**. Sistem stok 1.247 unit; fisik 1.243 unit → selisih −4 unit, status **Kurang** (kemungkinan rusak/hilang). Otomatis muncul jurnal koreksi penyesuaian: D `61901 Beban Penyesuaian Persediaan`, K `13101 Persediaan` Rp 208.000. Direktur approve → masuk Laba Rugi April.

---

## Modul 29: Giro

**Halaman:** Sidebar → Giro (`/giro`)

**Cara tambah giro:**
1. Klik **+ Tambah Giro**
2. Isi: No. Giro, Tanggal, Jatuh Tempo, Jumlah, Tipe (Masuk/Keluar)
3. Klik **Simpan**

**Status giro:** Aktif → Cair / Tolak

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 22 (Giro Masuk/Keluar & Laporan — sebelumnya ❌ Belum, sekarang sudah dibangun sebagai modul terpisah).

**Skenario — Giro Masuk dari Pelanggan Sewa:**
Pak Joko terima giro Bank Mandiri Rp 25.000.000 dari `PLG-0089 PT Mitra Pasar Jaya` untuk pelunasan sewa kios Q1, jatuh tempo 14 hari ke depan. Dia buka **Giro → + Tambah Giro**:
- No. Giro: `BMRI-2026-04123`, Tanggal terima: `2026-04-15`, Jatuh Tempo: `2026-04-29`
- Jumlah: `Rp 25.000.000`, Tipe: `Masuk`, Pelanggan: `PLG-0089`

Sistem buat `GR-0017` status **Aktif**, auto-jurnal: D `11108 Giro Masuk Belum Jatuh Tempo`, K `11201 Piutang Usaha`. Pada 29 April giro cair di Bank Kalsel. Pak Joko buka `GR-0017` → klik **Cair** → input tanggal cair. Auto-jurnal: D `11103 Bank Kalsel`, K `11108 Giro Masuk`. Saldo bank bertambah, kontrol kas terjaga. Jika giro **Tolak** (misal saldo penerbit kosong), sistem balikkan ke piutang dan beri warning di dashboard.

**Skenario — Giro Keluar untuk Supplier:**
Untuk pembayaran kontrak `HU-0089` PT Karya Sentosa, Pak Hendra terbitkan giro Bank Kalsel Rp 50 jt jatuh tempo 30 hari. Dia input ke **Giro → + Tambah → Tipe Keluar**. Sebelum giro jatuh tempo, beliau bisa monitor di tab Aging Giro Keluar untuk pastikan saldo Bank Kalsel cukup.

---

## Modul 30: Aktiva Tetap

**Halaman:** Sidebar → Aset Tetap (`/aset-tetap`)

Menampilkan 238 aset tetap dengan informasi:
- Nama, Kategori, Tanggal Perolehan
- Nilai Perolehan, Penyusutan/Tahun, Penyusutan/Bulan
- Nilai Buku (otomatis dihitung)

**Cara tambah aset:**
1. Klik **+ Tambah Aset**
2. Isi detail aset dan metode penyusutan
3. Sistem menghitung penyusutan otomatis

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 25 (Data Aset & Depresiasi SAK EP — ✅ 119 aset LAI, 6 kategori, penyusutan otomatis, export Excel), Baris 26 (Jurnal Penyusutan Otomatis — ✅ BARU tombol "Generate Jurnal Penyusutan" → auto D:61130 K:Akumulasi), Baris 34 (Aset Tetap Audited LAI — ✅ BARU 119 aset dari DAFTAR AKTIVA TETAP nilai sesuai LAI).

**Skenario 1 — Tambah Aset Baru: Mobil Operasional:**
Perumda baru beli Toyota Hilux untuk operasional Pasar Niaga senilai Rp 385.000.000, perolehan 10 April 2026. Bu Sari masuk **Aset Tetap → + Tambah Aset**:
- Kode: auto `AT-120` (lanjutan dari 119 aset LAI yang sudah ada)
- Nama: `Toyota Hilux Double Cabin 2026`, Kategori: `Kendaraan`
- Tgl Perolehan: `2026-04-10`, Nilai Perolehan: `Rp 385.000.000`
- Umur Ekonomis: `5 tahun` (sesuai SAK EP — Kendaraan), Metode: `Garis Lurus`

Sistem auto-hitung:
- Penyusutan/tahun = Rp 77.000.000
- Penyusutan/bulan = Rp 6.416.667
- Nilai Buku awal = Rp 385.000.000

**Skenario 2 — Generate Jurnal Penyusutan Bulanan (Modul Baru!):**
Akhir April, Bu Sari klik tombol **Generate Jurnal Penyusutan** → pilih periode `April 2026`. Modal konfirmasi muncul: *"Generate 118 jurnal penyusutan untuk periode April 2026? Total beban penyusutan: Rp 412.875.350"* (118 karena 1 aset = Tanah, tidak disusutkan). Dia klik **OK**. Sistem auto-buat 118 jurnal:
- D `61130 Beban Penyusutan` (per kategori)
- K `12X-AKM Akumulasi Penyusutan` (per kategori)
- Bukti: `DEPR-2026-04`, status posted

Tidak perlu input manual 118 entri — selesai dalam 2 detik. Total beban penyusutan otomatis masuk Laba Rugi April.

**Skenario 3 — Cek Nilai Buku per Kategori:**
Direktur tanya posisi aset per kategori untuk rapat investor. Bu Sari buka **Aset Tetap → tab Ringkasan**:
- Tanah: Rp 12.5 M (tidak susut)
- Bangunan: Rp 45.8 M (acc. dep. Rp 8.2 M)
- Kendaraan: Rp 1.85 M (acc. dep. Rp 480 jt)
- Mesin: Rp 320 jt
- Inventaris Kantor: Rp 145 jt
- Komputer & ATK Listrik: Rp 87 jt

Total Nilai Buku Rp 60.7 M cocok dengan akun `12 Aset Tetap` di Neraca (validasi sinkronisasi). Klik **Unduh Excel** → dapat dipakai langsung sebagai DAFTAR AKTIVA TETAP untuk LAI 2026.

**Skenario 4 — Penghapusan Aset:**
Mobil dinas tahun 2010 sudah tidak layak pakai, nilai buku Rp 0 (sudah habis disusutkan). Bu Sari klik aset terkait → **Hapus** → konfirmasi alasan: "Disposal — diserahkan ke kasubag inventaris untuk lelang." Auto-jurnal: D `12X-AKM Akumulasi Penyusutan`, K `12X Aset (kategori)`. Aset hilang dari Daftar Aktiva, audit log tersimpan.

---

## Modul 31: Produksi (Assembling)

**Status:** Tidak Berlaku (N/A)

Modul ini tidak digunakan karena Perumda Pasar bukan perusahaan manufaktur.

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 23 (Produksi: BOM, SPK, Assembling — ❌ Tidak relevan untuk Perumda Pasar).

**Skenario — Mengapa modul ini dimatikan:**
Saat onboarding aplikasi, Pak Hendra (Manajer Keuangan) ditanya tim implementasi apakah Perumda butuh BOM (Bill of Material) atau SPK (Surat Perintah Kerja) produksi. Karena Perumda Pasar Banjarmasin adalah BUMD pengelola pasar (sewa, retribusi, kebersihan) — bukan manufaktur — beliau jawab tidak perlu. Modul Produksi dinonaktifkan di Pengaturan, sidebar tidak menampilkan menu Produksi, ruang screen lebih lega.

**Bagaimana jika ke depan dibutuhkan?**
Misal Perumda buka unit produksi tas daur ulang plastik pasar. Admin bisa aktifkan modul ini lewat **Pengaturan → Modul Aktif → centang Produksi**. Kemudian master BOM (kebutuhan bahan per produk) dan SPK harian bisa diinput, mengonsumsi stok dari Persediaan dan menghasilkan barang jadi.

---

## Modul 32: E-Faktur PPN

**Halaman:** Sidebar → E-Faktur (`/efaktur`)

**Cara tambah e-faktur:**
1. Klik **+ Tambah E-Faktur**
2. Isi: No. Faktur, Tanggal, DPP, PPN, Tipe (Masuk/Keluar), NPWP Lawan
3. Klik **Simpan**

Digunakan untuk pelaporan pajak ke DJP.

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 24 (PPN & E-Faktur DJP — sebelumnya ❌, kini sudah dirintis dengan rekap PPN bulanan).

**Skenario 1 — Faktur Pajak Keluaran (Sales Tax):**
Perumda terima faktur sewa kios komersial dari `PLG-0142 Toko Sumber Rejeki` Rp 5.000.000 + PPN 11% = Rp 550.000. Pak Pajak (role `staff_pajak`) buka **E-Faktur → + Tambah**:
- No. Faktur: `010.012-26.04567890`, Tanggal: `2026-04-15`
- DPP: `Rp 5.000.000`, PPN: `Rp 550.000`, Total: `Rp 5.550.000`
- Tipe: `Keluaran`, NPWP Lawan: `01.234.567.8-731.000`

Auto-jurnal: D `11201 Piutang Usaha` Rp 5.55jt, K `41101 Pendapatan Sewa` Rp 5jt, K `21401 PPN Keluaran` Rp 550rb.

**Skenario 2 — Faktur Pajak Masukan (Purchase Tax):**
Belanja AC kantor dari `SUP-0021 PT Sejuk Sentosa` Rp 18 jt + PPN Rp 1.98 jt. Pak Pajak input dengan tipe `Masukan`. Auto-jurnal: D `12503 Inventaris` Rp 18jt, D `11401 PPN Masukan` Rp 1.98jt, K `21101 Hutang Usaha` Rp 19.98jt.

**Skenario 3 — Rekap SPT Masa PPN:**
Akhir April, Pak Pajak buka **E-Faktur → tab Rekap → April 2026**:
- Total PPN Keluaran: Rp 18.450.000 (dari 47 faktur)
- Total PPN Masukan: Rp 12.380.000 (dari 31 faktur)
- PPN Kurang Bayar: Rp 6.070.000

Klik **Export Excel DJP** → file `.csv` siap upload ke aplikasi e-Faktur DJP. Setelah bayar, jurnal pelunasan otomatis masuk: D `21401 PPN Keluaran`, K `11401 PPN Masukan`, K `11103 Bank Kalsel` Rp 6.07jt.

---

## Modul 33: Anggaran vs Realisasi

### Halaman LRA (`/lra`)

Laporan Realisasi Anggaran dengan 8 tab:
- Tabel Penerimaan, Rekap Penerimaan
- Beban Investasi, Rekap Investasi
- Beban Operasional, Rekap Beban Ops
- Beban Umum, Rekap Beban Umum

**Cara menggunakan:**
1. Pilih bulan di period selector (Jan–Des)
2. Pilih tab kategori
3. Tabel menampilkan: Anggaran 1 Thn, Target/Bln, Sd Bln Lalu, Bulan Ini, Sd Bln Ini, %
4. Progress bar menunjukkan capaian realisasi

### Halaman Anggaran vs Realisasi (`/anggaran-realisasi`)

Tampilan ringkas dengan:
- 4 KPI card (Penerimaan, Beban Investasi, Beban Umum, Beban Operasional)
- Grafik bar perbandingan Anggaran vs Realisasi
- Tabel detail per item

**Data berubah per bulan:** Klik Januari → data Januari. Klik April → data April.

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 31 (Anggaran/Target Perumda — ✅ BARU 104 item dari 4 sheet: Penerimaan, Investasi, Umum, Operasional), Bonus 27-29 (LRA — ✅ fitur tambahan di luar referensi).

**Skenario 1 — Review LRA per Tab (Modul 33 LRA):**
Direktur jadwalkan rapat evaluasi anggaran tanggal 5 Mei. Bu Sari siapkan bahan dengan buka **LRA → April 2026**:
- **Tab Tabel Penerimaan**: 28 item anggaran pendapatan. Anggaran 1 thn `Rp 12 M`, target April `Rp 1 M`, sd bln lalu `Rp 2.85 M` (Mar), bulan ini `Rp 1.12 M` (Apr +12%), sd bln ini `Rp 3.97 M`, % capaian YTD = 33% (target sehat 33% di akhir Apr).
- **Tab Rekap Penerimaan**: ringkasan per kategori (Sewa Kios, Retribusi, Pendapatan Lain).
- **Tab Beban Operasional**: total realisasi `Rp 4.2 M` dari anggaran `Rp 13 M` (32% — under-budget, bagus).
- **Tab Beban Investasi**: belanja modal renovasi pasar realisasi `Rp 850 jt` dari anggaran `Rp 5 M` (17%, lambat — perlu acceleration).

Setiap progress bar warnanya berubah: hijau (>90% sehat), kuning (50-90% normal), merah (>100% over-budget).

**Skenario 2 — Dashboard Anggaran (Modul 33 Anggaran vs Realisasi):**
Setelah LRA, Direktur ingin grafik visual untuk slide. Bu Sari beralih ke **Anggaran vs Realisasi → April 2026**. Tampilan:
- 4 KPI Card di atas: Penerimaan 33% / Beban Investasi 17% / Beban Umum 28% / Beban Operasional 32%
- Bar chart side-by-side: Anggaran (biru) vs Realisasi (oranye) untuk 12 kategori utama
- Tabel detail di bawah untuk drill-down

Klik **Januari** di selector → semua angka & grafik berubah ke data Januari (per-month dynamic). Sangat cocok presentasi.

**Skenario 3 — Anggaran 2026 dari Excel:**
Pada awal tahun, divisi anggaran upload `Anggaran_2026.xlsx` lewat **Import Data**. Sistem load 104 item dari 4 sheet (Penerimaan/Investasi/Umum/Operasional). Setiap baris memiliki `kode`, `kategori`, `nama_anggaran`, `target_per_bulan` (12 kolom). Saat pengguna pakai LRA bulan tertentu, sistem ambil target sesuai bulan.

---

## Modul 34: Rekonsiliasi Bank

**Halaman:** Sidebar → Rekonsiliasi Bank (`/rekonsiliasi-bank`)

**Cara menambah item rekonsiliasi:**
1. Klik **+ Tambah Item**
2. Isi: Tanggal, Keterangan, Referensi, Jumlah, Tipe (Buku/Bank)
3. Klik **Simpan**

**Tampilan:**
- Saldo per Buku vs Saldo per Bank
- Selisih = item yang belum dicocokkan
- Tujuan: selisih harus = 0

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Bonus 27-29 (Rekonsiliasi Bank — ✅ fitur tambahan, sudah berjalan penuh).

**Skenario — Rekon Bank Kalsel April 2026:**
Tanggal 1 Mei, Bu Sari terima rekening koran Bank Kalsel April. Saldo per buku (`11103`) Rp 6.275.450.000, saldo per rekening koran Rp 6.342.150.000 — selisih Rp 66.700.000. Dia buka **Rekonsiliasi Bank → April 2026**, klik **+ Tambah Item** untuk mencatat tiap selisih:

| Tanggal | Keterangan | Ref | Jumlah | Tipe |
|---|---|---|---|---|
| 30-04 | Setoran toko Pasar Lima blm tercatat | TRF-9921 | +25.000.000 | Bank |
| 30-04 | Bunga giro April | INT-04 | +6.700.000 | Bank |
| 28-04 | Cek belum cair (CK-0234) | CK-0234 | -15.000.000 | Buku |
| 29-04 | Biaya admin bank | ADM-04 | -50.000 | Bank |
| 26-04 | Setoran kontan blm tervalidasi | DEP-1188 | +50.050.000 | Bank |

Tiap item disimpan, sistem update Saldo Buku Rp 6.260.450.000 vs Saldo Bank Rp 6.341.700.000 → selisih makin kecil. Setelah semua item terdaftar, selisih akhirnya **Rp 0** ✓. Bu Sari kemudian buat jurnal koreksi untuk item buku (cek tertahan, bunga, admin) → masuk ke modul Jurnal otomatis. Item bank (transfer belum tercatat) ditindaklanjuti ke teller Bank Kalsel. Kunci rekonsiliasi April → audit log mencatat penyelesaian.

---

## Modul 35: Backup & Restore

**Halaman:** Sidebar → Pengaturan (`/pengaturan`)

### Backup

1. Buka tab **Backup**
2. Klik **Buat Backup**
3. File database disalin dengan timestamp
4. Dicatat: siapa yang membuat, kapan, ukuran file

### Restore

1. Pilih file backup dari daftar
2. Klik **Restore**
3. ⚠️ Data saat ini akan ditimpa dengan data backup
4. Hanya `admin`/`super_admin` yang bisa restore

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 10 (Backup, Restore & Bangun Data — ⚠️ Sebagian: Export JSON Backup ada, Restore & Bangun Data Baru otomatis dirintis).

**Skenario 1 — Backup Rutin Mingguan:**
Setiap Jumat sore, Pak Hendra (admin) buka **Pengaturan → Tab Backup → Buat Backup**. Sistem snapshot database SQLite, simpan sebagai `backup_2026-04-30_17-00-00.db` (ukuran 4.2 MB), dicatat: dibuat oleh `admin`, jam, ukuran. Daftar backup tampil di tabel — disimpan 12 backup terakhir, otomatis prune yang lebih lama. Beliau juga klik **Unduh Backup** untuk salin ke external drive setiap akhir bulan — best practice 3-2-1 (3 copies, 2 media, 1 offsite).

**Skenario 2 — Restore Setelah Salah Import:**
Selasa pagi, Bu Sari salah import file Excel — file Mei tertukar dengan file 2025, mengakibatkan 200 jurnal duplikat masuk ke April. Panik, dia hubungi Pak Hendra. Beliau buka **Pengaturan → Tab Backup**, pilih file `backup_2026-04-30_17-00-00.db` (Jumat lalu, sebelum import salah), klik **Restore**. Modal konfirmasi: *"Data saat ini akan ditimpa. Lanjutkan?"* → Ketik nama backup untuk konfirmasi → restore selesai 5 detik. Database kembali ke kondisi Jumat. Audit log mencatat restore action. Bu Sari ulang import dengan file yang benar.

**Skenario 3 — Bangun Data Baru (Tahun Buku Baru):**
Akhir Desember 2026, sebelum mulai tahun buku 2027, admin pilih **Bangun Data Baru** → sistem buat database kosong baru, tapi:
- COA + Master Data (pelanggan, supplier, departemen) tetap dibawa
- Saldo akhir 2026 jadi saldo awal 2027 otomatis
- Jurnal 2026 di-archive (tidak terhapus, dipindah ke `archive_2026.db`)
- Anggaran 2027 di-import segar

Backup terakhir 2026 disimpan permanen sebagai bukti audit.

---

## Modul 36: Pengaturan & Keamanan

**Halaman:** Sidebar → Pengaturan (`/pengaturan`)

### Manajemen User

**Cara tambah user:**
1. Tab **Users** → Klik **+ Tambah User**
2. Isi: Username, Role (pilih dari daftar), Status (Aktif/Nonaktif)
3. Klik **Simpan**

**Role yang tersedia:**
kasir, akuntan, auditor, manajer_keuangan, direktur, staff_gudang, staff_pajak, admin, super_admin

### RBAC (Role-Based Access Control)

Setiap endpoint API dilindungi berdasarkan role. Contoh:
- Endpoint jurnal: hanya `akuntan`, `admin` yang bisa menulis
- Endpoint approve: hanya `akuntan`, `manajer_keuangan`, `direktur`
- Endpoint audit log: semua role bisa membaca

### Audit Trail

Setiap aksi dicatat di tabel `audit_log`:
- Siapa (role), Kapan, Apa (CREATE/UPDATE/DELETE/APPROVE)
- Data sebelum dan sesudah perubahan

### 💡 Use Case / Contoh Penggunaan

> **Referensi Perbandingan Modul Perumda Ledger Jevon:** Baris 1 (Setup System & Konfigurasi — ✅ Menu Pengaturan: nama, NPWP, kota, tarif PPN), Baris 2 (Manajemen User & Hak Akses — ⚠️ multi-user + role-based access dirintis).

**Skenario 1 — Konfigurasi Identitas Perusahaan (Setup):**
Saat pertama kali deploy, Pak Hendra (super_admin) masuk **Pengaturan → Tab Profil**:
- Nama Perusahaan: `Perumda Pasar Banjarmasin`
- NPWP: `01.234.567.8-731.000`
- Alamat: `Jl. Pangeran Antasari No. 123`, Kota: `Banjarmasin`
- Tarif PPN: `11%`, Periode Buku: `Januari–Desember 2026`
- Logo: upload file `logo.png`
- Tanda tangan voucher: nama Kasir, Pemeriksa, Direktur

Pengaturan ini otomatis muncul di header laporan, kop voucher, dan ekspor Excel. Tidak perlu edit per-modul.

**Skenario 2 — Tambah User Staf Pajak Baru:**
Bu Lina (HR) lapor staf pajak baru bergabung. Pak Hendra buka **Pengaturan → Tab Users → + Tambah User**:
- Username: `lina.pajak`, Role: `staff_pajak`, Status: `Aktif`

Berkat RBAC, Bu Lina hanya bisa akses E-Faktur dan baca-saja Laporan Pajak. Saat coba klik approve jurnal, API tolak dengan 403 Forbidden. Saat hendak hapus voucher, menu tidak muncul. Lebih aman dari sistem lama yang single-user.

**Skenario 3 — Audit Trail Forensik:**
Audit eksternal tanya: "Siapa yang ubah saldo akun `41101 Pendapatan Sewa` Maret?" Pak Hendra buka **Pengaturan → Tab Audit Log**, filter `entity=journal AND action=UPDATE AND date>2026-03-01`. Sistem tampilkan 7 update — lengkap dengan kolom Before/After (mis. nilai berubah dari `Rp 985.000.000` jadi `Rp 1.025.000.000` oleh `akuntan` pada `2026-03-25 09:15`). Juga ada keterangan kenapa periode dibuka kunci. Auditor puas dengan transparansi sistem.

**Skenario 4 — Lock Down Periode Tahunan:**
Setelah audit selesai, Pak Hendra kunci semua periode 2026 (Januari–Desember) sekaligus dari Pengaturan. Tidak ada user yang bisa modifikasi data audit, kecuali super_admin dengan alasan tertulis. Cocok dengan prinsip SAK EP "audit trail tidak terhapuskan".

---

## Alur Persetujuan

```
                           ┌─────────────┐
                           │   PENDING   │
    Kasir / Akuntan        │   (Draft)   │
    membuat voucher  ────► │             │
                           └──────┬──────┘
                                  │
                    Akuntan / Manajer / Direktur
                         klik "Approve"
                                  │
                           ┌──────▼──────┐
                           │   POSTED    │
                           │   (Final)   │
                           │             │
                           └──────┬──────┘
                                  │
                      ┌───────────┴───────────┐
                      │                       │
               Masuk ke semua          Bisa dicetak
               laporan keuangan        (Print tracking)
```

**Guard / Pengaman:**
1. Periode terkunci → tidak bisa approve
2. Sudah POSTED → tidak bisa approve ulang
3. Voucher POSTED → tidak bisa diedit (harus unapprove dulu)
4. Setiap approve/unapprove dicatat di audit log

---

## FAQ

**Q: Kenapa angka di laporan tidak berubah saat ganti bulan?**
A: Pastikan menggunakan versi terbaru. Data laporan bersifat dinamis — klik bulan yang berbeda akan menampilkan data yang berbeda.

**Q: Kenapa jurnal saya tidak muncul di Neraca/Laba Rugi?**
A: Hanya jurnal berstatus **POSTED** yang masuk ke perhitungan laporan. Approve jurnal terlebih dahulu.

**Q: Bisakah saya menghapus jurnal yang sudah POSTED?**
A: Ya, tetapi hanya jika periodenya belum dikunci. Unapprove dulu, lalu hapus.

**Q: Bagaimana cara export laporan ke Excel?**
A: Di setiap halaman laporan, klik tombol **Unduh Excel (.xlsx)**.

**Q: Data bulan Mei–Desember kosong, normal?**
A: Ya, data saat ini tersedia untuk Januari–April 2026 (dari audit Excel). Bulan berikutnya akan terisi saat data diimport.

**Q: Siapa yang bisa mengunci/membuka periode?**
A: Kunci: `akuntan`, `manajer_keuangan`, `admin`. Buka kunci: hanya `admin`/`super_admin` dengan alasan wajib.

---

*Dokumen ini dibuat otomatis pada 17 Mei 2026 untuk Perumda Pasar Banjarmasin.*
