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

---

## Modul 4: Departemen

**Halaman:** Sidebar → Master Data (`/master-data`) → Tab Departemen

**Cara tambah departemen:**
1. Klik **+ Tambah Departemen**
2. Isi Kode (contoh: `DEP-001`), Nama, Keterangan
3. Klik **Simpan**

**Cara hapus:**
- Departemen tidak bisa dihapus jika ada akun COA atau jurnal yang mereferensikannya

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

---

## Modul 29: Giro

**Halaman:** Sidebar → Giro (`/giro`)

**Cara tambah giro:**
1. Klik **+ Tambah Giro**
2. Isi: No. Giro, Tanggal, Jatuh Tempo, Jumlah, Tipe (Masuk/Keluar)
3. Klik **Simpan**

**Status giro:** Aktif → Cair / Tolak

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

---

## Modul 31: Produksi (Assembling)

**Status:** Tidak Berlaku (N/A)

Modul ini tidak digunakan karena Perumda Pasar bukan perusahaan manufaktur.

---

## Modul 32: E-Faktur PPN

**Halaman:** Sidebar → E-Faktur (`/efaktur`)

**Cara tambah e-faktur:**
1. Klik **+ Tambah E-Faktur**
2. Isi: No. Faktur, Tanggal, DPP, PPN, Tipe (Masuk/Keluar), NPWP Lawan
3. Klik **Simpan**

Digunakan untuk pelaporan pajak ke DJP.

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
