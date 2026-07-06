# Kendala Sinkronisasi Data Keuangan (Manual Excel ↔ Aplikasi) — Daftar Perbaikan

**Sumber:** Video referensi Divisi Keuangan Perumda Pasar Banjarmasin, 24 Juni 2026
- [Video 1 — Referensi File Manual Excel & Integrasi](https://www.youtube.com/watch?v=mk_XsBWOmrY)
- [Video 2 — Kendala Sinkronisasi Data Keuangan di Aplikasi](https://www.youtube.com/watch?v=fa1jNB2ZaFo)

**Status umum:** Sinkronisasi antara file data manual keuangan dengan aplikasi **belum tersinkronisasi sepenuhnya**. Total angka pada beberapa laporan sudah cocok, namun terdapat cacat *routing/linking* sehingga sebagian transaksi tidak mengalir dengan benar dari Jurnal → Buku Besar → LRA.

---

## Alur data yang seharusnya (acuan)

```
Jurnal  →  Buku Besar (= "Data Lampiran Laba Rugi")  →  Laba Rugi  →  LRA  →  Laporan Triwulan / Semester
```

- **Buku Besar / Data Lampiran Laba Rugi** adalah rangkuman dari semua jurnal dan menjadi alat bantu untuk LRA.
- Angka satu akun harus **identik** di seluruh lapisan (contoh kasus: *Beban Pemeliharaan Bangunan Pasar* COA 620 = Rp60.281.820 di jurnal, buku besar, laba rugi, dan LRA).
- Klik total di Buku Besar harus bisa **drill-down** kembali ke jurnal asalnya.
- **Carryover bulanan:** saldo akhir bulan lalu menjadi saldo awal bulan berjalan.
  Rumus: `Sampai bulan ini = Saldo sampai bulan lalu + Realisasi bulan ini` (kolom 7 + 8).
  Contoh: kolom "sampai bulan lalu" laporan Juni diambil dari saldo akhir laporan Mei.

---

## Daftar Kendala yang Harus Diperbaiki

### 1. Transaksi tidak muncul di Buku Besar untuk sebagian akun & sub-akun COA
- **Masalah:** Saat input jurnal, beberapa akun dan sub-akun di COA **tidak menampilkan transaksinya** di Buku Besar. Total debit/kredit tampil **0** dan daftar transaksi kosong, padahal jurnal sudah terisi.
- **Bukti (Video 2):** Akun *makan minum rapat / beban konsumsi rapat & tamu* memiliki banyak transaksi (tgl 2–22, total Rp8.556.900) di jurnal, tetapi Buku Besar menampilkan nol.
- **Ekspektasi:** Klik akun di Buku Besar menampilkan kumpulan transaksi jurnal (tanggal + nilai) yang membentuk total akun tersebut.
- **Prioritas:** Tinggi (akar masalah utama).

### 2. LRA tidak update transaksi terbaru
- **Masalah:** Karena #1, transaksi terbaru yang baru diinput **tidak masuk/ter-update** di Laporan Realisasi Anggaran (LRA).
- **Bukti (Video 2):**
  - *Pembuatan souvenir / pelunasan plakat akrilik Perumda* (~Rp7.601.680, beban umum lain-lain) sudah dijurnal tetapi **tidak muncul** di LRA.
  - *Beban perlengkapan* memiliki selisih terhadap manual karena entri terbaru belum ter-link sempurna.
  - **Catatan penting:** Secara **total** beberapa akun sudah cocok dengan manual (mis. beban umum lain-lain Rp12.040.680), tetapi transaksi tidak terpetakan ke baris/"rumah" akun yang benar di LRA. Jadi masalahnya adalah **pemetaan per-baris**, bukan hanya total.
- **Ekspektasi:** Setiap jurnal yang tersimpan langsung ter-update dan terpetakan ke baris akun yang benar di LRA.
- **Prioritas:** Tinggi.

### 3. Approve jurnal hasil upload template tidak muncul menunya
- **Masalah:** Input jurnal **satu per satu** lewat menu *Buat Jurnal* berhasil masuk ke list jurnal. Namun untuk versi **upload template jurnal**, tombol/menu untuk **approve** tidak muncul, sehingga jurnal hasil upload tidak bisa diproses.
- **Ekspektasi:** Jurnal hasil upload template tampil dengan opsi approve yang berfungsi, lalu masuk ke list jurnal seperti input manual.
- **Prioritas:** Tinggi.

### 4. Laporan Triwulan & Semester tidak ter-update
- **Masalah:** Saat membuka menu **Laporan Triwulan** dan **Semester**, data tidak ter-update. Secara mekanisme seharusnya data ditarik/diakumulasi dari **laporan bulanan**.
- **Ekspektasi:** Laporan triwulan & semester otomatis mengakumulasi data dari laporan bulanan terkait.
- **Prioritas:** Sedang–Tinggi (bergantung pada perbaikan #1 & #2).

### 5. Integrasi & sinkronisasi fitur NPD (Nota Pencairan Dana) belum bisa
- **Masalah:** Integrasi dan sinkronisasi data di fitur **NPD (Nota Pencairan Dana)** belum bisa dijalankan karena fitur-fitur sebelumnya (#1–#4) belum fix dan selesai.
- **Ekspektasi:** Setelah sinkronisasi inti selesai, fitur NPD dapat menarik data terintegrasi dengan benar.
- **Prioritas:** Tergantung (blocked oleh #1–#4).

---

## Kendala UI / UX Tambahan (dari Video 2)

### A. Form jurnal melompat kembali ke menu Jurnal saat copy
- Saat menyalin (copy) nilai di dalam form input jurnal, aplikasi tiba-tiba kembali ke menu/daftar jurnal. Workaround sementara: menahan tombol **Shift**.
- **Perlu diinvestigasi:** apakah karena salah pencet atau bug penanganan keyboard/focus.

### B. Tidak ada scroll horizontal di laporan
- Pada tampilan laporan, kolom tidak bisa digeser/scroll horizontal untuk membandingkan angka. Workaround sementara: split-screen / belah layar.
- **Permintaan:** sediakan scroll horizontal pada tabel laporan.

### C. Permintaan fitur filter (dari Video 1)
- Tambahkan **menu filter** (per akun & per tanggal/bulan) seperti alat bantu di Excel manual, mis. menampilkan semua entri *beban pemeliharaan bangunan pasar* di bulan Juni.

---

## Yang Sudah Tersinkronisasi dengan Benar (verifikasi Video 2)

| Item | Status | Nilai acuan |
|------|--------|-------------|
| Makan minum rapat (LRA) | ✅ Sinkron | Rp1.362.100 |
| Laba Rugi (Juni) | ✅ Aman | 391.612.305 |
| Neraca (Juni) | ✅ Aman | 466.428.435... |
| Arus Kas (Juni) | ✅ Aman | 15.936.137.217,83 |
| Penerimaan (LRA vs manual) | ⚠️ Selisih kecil | ±296,xx jt (perlu dicek ulang) |
| COA Pendapatan Ramayana | ✅ Sudah bisa dipilih | — |

---

## Ringkasan Prioritas Perbaikan

1. **[P1]** Perbaiki pemetaan/linking transaksi Jurnal → Buku Besar (kendala #1) — akar masalah.
2. **[P1]** Pastikan transaksi terpetakan ke baris akun yang benar di LRA (kendala #2).
3. **[P1]** Perbaiki approve jurnal hasil upload template (kendala #3).
4. **[P2]** Akumulasi otomatis Laporan Triwulan & Semester dari laporan bulanan (kendala #4).
5. **[P2]** Perbaikan UI: copy-jump pada form jurnal & scroll horizontal laporan; tambahkan menu filter.
6. **[P3]** Aktifkan integrasi fitur NPD setelah #1–#4 selesai (kendala #5).
