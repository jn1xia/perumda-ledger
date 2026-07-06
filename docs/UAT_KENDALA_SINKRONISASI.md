# UAT — Perbaikan Sinkronisasi Data Keuangan (Manual Excel ↔ Aplikasi)
## Perumda Pasar Banjarmasin | 2026

**Tujuan:** Memverifikasi perbaikan kendala sinkronisasi yang dilaporkan Divisi Keuangan (24 Juni 2026).
**Referensi:** `docs/KENDALA_SINKRONISASI_PERBAIKAN.md`
**Sumber kendala:** [Video 1](https://www.youtube.com/watch?v=mk_XsBWOmrY) · [Video 2](https://www.youtube.com/watch?v=fa1jNB2ZaFo)
**Primary Actor:** Akuntan / Divisi Keuangan
**Acuan benar (PASS):** Angka pada manual Excel = angka pada aplikasi di setiap lapisan (Jurnal → Buku Besar → Laba Rugi → LRA → Triwulan/Semester).

---

## Data Uji Standar (dipakai di seluruh skenario)

| Ref | Tanggal | Akun (Debit) | Sub-akun / Akun Kredit | Nominal |
|-----|---------|--------------|------------------------|---------|
| TX-1 | 22 Jun 2026 | Perlengkapan & peralatan kantor | Kas Kecil | Rp650.000 |
| TX-2 | 22 Jun 2026 | Perlengkapan & peralatan | Kas Kecil | Rp355.800 |
| TX-3 | 22 Jun 2026 | Beban umum lain-lain (souvenir/plakat akrilik) + Beban administrasi bank | Bank Kalsel | Rp7.601.680 |
| TX-4 | 22 Jun 2026 | Beban konsumsi rapat + Admin bank | Bank Kalsel | Rp527.500 |
| TX-5 | 22 Jun 2026 | Bank Kalsel (Pendapatan diterima di muka) | Pendapatan Ramayana | (uji pendapatan) |

**Akun acuan lintas-laporan:** *Beban Pemeliharaan Bangunan Pasar* (COA 620) = **Rp60.281.820** harus identik di Jurnal, Buku Besar, Laba Rugi, dan LRA.

---

## Modul A — Buku Besar: Transaksi Akun/Sub-akun COA Muncul (Kendala #1)
**Layer:** Report / DB | **Prioritas:** P1

| # | Tipe | Skenario | Expected Result |
|---|------|----------|-----------------|
| TC-A1 | ✅ Positive | Input TX-1..TX-4 lalu buka Buku Besar akun terkait (mis. beban perlengkapan) periode 1–22 Jun | Setiap transaksi tampil dengan tanggal & nominal; total debit/kredit > 0 dan sesuai jurnal |
| TC-A2 | ✅ Positive | Buka Buku Besar *beban konsumsi rapat & tamu* periode 2–22 Jun | Daftar transaksi tampil, total = Rp8.556.900 (sesuai manual) |
| TC-A3 | ✅ Positive | Klik total pada satu akun di Buku Besar (drill-down) | Tampil kumpulan transaksi jurnal pembentuk total (tanggal + nominal), kembali ke jurnal asal |
| TC-A4 | ✅ Positive | Bandingkan total Buku Besar tiap akun dengan manual Excel (data lampiran laba rugi) | Angka identik untuk semua akun & sub-akun |
| TC-A5 | ❌ Negative | Buka Buku Besar untuk akun yang belum ada transaksi di periode | Tampil kosong dengan total 0 secara benar (bukan karena gagal link) |
| TC-A6 | ❌ Negative | Input jurnal pada sub-akun spesifik COA, cek Buku Besar | Transaksi WAJIB muncul di sub-akun yang benar; tidak ada akun/sub-akun yang "hilang" |

---

## Modul B — LRA: Update Transaksi Terbaru & Pemetaan Baris (Kendala #2)
**Layer:** Report | **Prioritas:** P1

| # | Tipe | Skenario | Expected Result |
|---|------|----------|-----------------|
| TC-B1 | ✅ Positive | Setelah input TX-3 (souvenir/plakat akrilik), buka LRA bulan Juni → beban umum lain-lain | Transaksi Rp7.601.680 MUNCUL & ter-update di baris yang benar |
| TC-B2 | ✅ Positive | Cek LRA *beban perlengkapan* setelah input TX-1 + TX-2 | Realisasi bulan ini bertambah Rp1.005.800 (650.000 + 355.800), tanpa selisih vs manual |
| TC-B3 | ✅ Positive | Cek LRA *makan minum rapat* (regression) | Tetap sinkron = Rp1.362.100 |
| TC-B4 | ✅ Positive | Bandingkan total per baris LRA vs manual Excel untuk beban umum lain-lain | Total identik (Rp12.040.680) DAN tiap transaksi terpetakan ke baris/"rumah" akun yang benar |
| TC-B5 | ✅ Positive | Verifikasi carryover: kolom "sampai bulan lalu" Juni vs saldo akhir laporan Mei | Nilai identik; `Sampai bulan ini = saldo bulan lalu + realisasi bulan ini` |
| TC-B6 | ❌ Negative | Input jurmal lalu cek LRA tanpa refresh | Data tetap konsisten; tidak ada transaksi yang tertinggal/tidak ter-link |

---

## Modul C — Upload Template Jurnal & Approve (Kendala #3)
**Layer:** UI / Workflow | **Prioritas:** P1

| # | Tipe | Skenario | Expected Result |
|---|------|----------|-----------------|
| TC-C1 | ✅ Positive | Input jurnal satu per satu via menu Buat Jurnal | Jurnal masuk ke list jurnal (baseline, sudah berfungsi) |
| TC-C2 | ✅ Positive | Upload template jurnal (mis. `template per 22 juni.xlsx`) | File terbaca, daftar jurnal preview tampil |
| TC-C3 | ✅ Positive | Setelah upload, tombol/menu **Approve** tampil dan dapat diklik | Menu approve MUNCUL; jurnal ter-approve masuk ke list jurnal |
| TC-C4 | ✅ Positive | Bandingkan hasil jurnal dari upload vs input manual | Hasil identik di Jurnal, Buku Besar, dan LRA |
| TC-C5 | ❌ Negative | Upload template dengan baris tidak seimbang (debit ≠ kredit) | Sistem MENOLAK approve, tampilkan pesan tidak seimbang |
| TC-C6 | ❌ Negative | Upload template format/kolom salah | Sistem MENOLAK dengan pesan validasi yang jelas |

---

## Modul D — Laporan Triwulan & Semester (Kendala #4)
**Layer:** Report | **Prioritas:** P2

| # | Tipe | Skenario | Expected Result |
|---|------|----------|-----------------|
| TC-D1 | ✅ Positive | Buka Laporan Triwulan II (Apr–Jun) setelah input transaksi Juni | Data ter-update; akumulasi diambil dari laporan bulanan Apr+Mei+Jun |
| TC-D2 | ✅ Positive | Buka Laporan Semester I (Jan–Jun) | Data ter-update; akumulasi dari 6 laporan bulanan |
| TC-D3 | ✅ Positive | Bandingkan total triwulan/semester vs penjumlahan laporan bulanan | Angka identik (konsisten dengan LRA bulanan) |
| TC-D4 | ❌ Negative | Buka laporan triwulan untuk periode tanpa data bulanan | Tampil kosong/0 secara benar, bukan error |

---

## Modul E — Integrasi NPD (Nota Pencairan Dana) (Kendala #5)
**Layer:** Integration | **Prioritas:** P3 (blocked oleh #1–#4)

| # | Tipe | Skenario | Expected Result |
|---|------|----------|-----------------|
| TC-E1 | ✅ Positive | Setelah #1–#4 PASS, buka fitur NPD dan tarik data terkait | NPD menampilkan data terintegrasi & sinkron dengan jurnal/LRA |
| TC-E2 | ✅ Positive | Buat NPD mengacu pada transaksi/anggaran yang sudah tercatat | Data NPD konsisten dengan realisasi LRA |
| TC-E3 | ❌ Negative | Coba akses NPD bila prasyarat (#1–#4) belum selesai | Fitur memberi indikasi data belum siap, tidak menampilkan angka salah |

---

## Modul F — Perbaikan UI/UX (dari Video 2)
**Layer:** UI | **Prioritas:** P2

| # | Tipe | Skenario | Expected Result |
|---|------|----------|-----------------|
| TC-F1 | ✅ Positive | Salin (copy) nilai di dalam form Buat Jurnal | Form TETAP di halaman input; tidak melompat kembali ke menu/daftar jurnal |
| TC-F2 | ✅ Positive | Geser/scroll horizontal pada tabel laporan (LRA/Laba Rugi) | Kolom dapat digeser untuk membandingkan angka tanpa split-screen |
| TC-F3 | ✅ Positive | Gunakan menu filter Buku Besar/Jurnal per akun & per tanggal (mis. beban pemeliharaan bangunan pasar, Juni) | Hanya transaksi sesuai filter yang tampil |

---

## Kriteria Kelulusan (Exit Criteria)

1. **Seluruh TC P1 (Modul A, B, C) PASS** — sinkronisasi inti Jurnal → Buku Besar → LRA benar dan lengkap.
2. **Tidak ada transaksi "hilang"** di Buku Besar maupun LRA; total DAN pemetaan per-baris cocok dengan manual Excel.
3. **Laporan triwulan & semester** terakumulasi otomatis dari laporan bulanan (Modul D).
4. **Regression PASS** untuk laporan yang sudah benar: Laba Rugi (391.612.305), Neraca, Arus Kas (15.936.137.217,83), makan minum rapat (Rp1.362.100).
5. **Perbaikan UI** (Modul F) terverifikasi.
6. **NPD (Modul E)** baru diuji setelah #1–#4 dinyatakan PASS.

---

## Lembar Hasil Eksekusi

| Modul | Total TC | PASS | FAIL | Catatan |
|-------|----------|------|------|---------|
| A — Buku Besar | 6 | | | |
| B — LRA | 6 | | | |
| C — Upload/Approve | 6 | | | |
| D — Triwulan/Semester | 4 | | | |
| E — NPD | 3 | | | |
| F — UI/UX | 3 | | | |
| **Total** | **28** | | | |
