# Bugfix Requirements Document

## Introduction

Aplikasi Perumda Ledger menyajikan laporan keuangan bulan teraudit (termasuk Juni 2026) dari angka resmi lampiran Excel, lalu menumpuk ("overlay") jurnal yang diinput pengguna di atas angka tersebut. Setelah pengguna menambahkan jurnal baru bertanggal **17–20 Juni 2026**, empat laporan berikut menampilkan nilai yang **tidak sama** dengan file Excel acuan **"LAMPIRAN LAPORAN KEUANGAN JUNI 2026 (2)"**:

- **LRA (Laporan Realisasi Anggaran)** — khususnya bagian **Beban Operasional**
- **Laporan Laba Rugi**
- **Neraca**
- **Laporan Arus Kas**

Selisihnya material. Sebagai contoh, pada baris "Beban Operasional dan Bisnis" dan "Beban Umum dan Administrasi" perbedaannya mencapai belasan hingga puluhan juta rupiah, dan akhirnya menggeser angka Laba/Rugi Bersih. Akibatnya laporan aplikasi tidak dapat dipakai untuk pembandingan dengan laporan resmi.

Selain ketidakcocokan angka, terdapat kebutuhan tampilan: laporan dengan banyak kolom saat ini terpotong di tepi area tampilan karena kontainer laporan menyembunyikan konten yang melebihi lebar (overflow tersembunyi), tanpa kemampuan menggulir ke kiri/kanan. Pengguna meminta agar **semua laporan dapat digulir secara horizontal**, terutama saat beberapa laporan ditampilkan berdampingan.

File acuan: `src/FILES/LAMPIRAN LAPORAN KEUANGAN JUNI 2026  (2).xlsx`

Dokumen ini hanya mendefinisikan perilaku yang salah saat ini, perilaku benar yang diharapkan, dan perilaku yang harus tetap dipertahankan. Detail teknis dan rancangan solusi akan dibahas pada dokumen desain.

## Bug Analysis

### Current Behavior (Defect)

Perilaku yang terjadi saat ini setelah jurnal 17–20 Juni 2026 diinput.

1.1 WHEN jurnal baru bertanggal 17–20 Juni 2026 telah ditambahkan dan berstatus posted THEN the system menampilkan LRA bagian "Beban Operasional" dengan nilai realisasi (kolom "Bulan ini" dan "Sd Bulan ini") yang berbeda dari Excel acuan "LAMPIRAN LAPORAN KEUANGAN JUNI 2026 (2)"

1.2 WHEN jurnal baru bertanggal 17–20 Juni 2026 telah ditambahkan dan berstatus posted THEN the system menampilkan Laporan Laba Rugi dengan nilai (antara lain baris "Beban Operasional dan Bisnis", "Jumlah Beban Umum dan Administrasi", dan "Laba/Rugi Bersih") yang berbeda dari Excel acuan

1.3 WHEN jurnal baru bertanggal 17–20 Juni 2026 telah ditambahkan dan berstatus posted THEN the system menampilkan Neraca dengan nilai pos terkait (mis. saldo kas/bank) beserta total Aset/Kewajiban/Ekuitas yang berbeda dari Excel acuan

1.4 WHEN jurnal baru bertanggal 17–20 Juni 2026 telah ditambahkan dan berstatus posted THEN the system menampilkan Laporan Arus Kas dengan nilai (arus kas dari aktivitas operasi/investasi dan saldo kas akhir periode) yang berbeda dari Excel acuan

1.5 WHEN sebuah laporan memiliki kolom yang lebih lebar daripada area tampilannya THEN the system memotong (clip) kolom yang melebihi area dan tidak menyediakan cara untuk menggulir secara horizontal

1.6 WHEN dua laporan atau lebih ditampilkan berdampingan THEN the system tidak dapat menampilkan kolom yang terpotong karena tidak tersedia scroll horizontal

### Expected Behavior (Correct)

Perilaku yang seharusnya terjadi untuk kondisi pemicu yang sama.

2.1 WHEN jurnal baru bertanggal 17–20 Juni 2026 telah ditambahkan dan berstatus posted THEN the system SHALL menampilkan LRA bagian "Beban Operasional" dengan nilai realisasi yang sama dengan Excel acuan (toleransi pembulatan ≤ Rp 1)

2.2 WHEN jurnal baru bertanggal 17–20 Juni 2026 telah ditambahkan dan berstatus posted THEN the system SHALL menampilkan Laporan Laba Rugi dengan nilai (termasuk baris beban dan Laba/Rugi Bersih) yang sama dengan Excel acuan (toleransi pembulatan ≤ Rp 1)

2.3 WHEN jurnal baru bertanggal 17–20 Juni 2026 telah ditambahkan dan berstatus posted THEN the system SHALL menampilkan Neraca dengan nilai pos dan total (Aset, Kewajiban, Ekuitas) yang sama dengan Excel acuan dan tetap seimbang (Jumlah Aset = Jumlah Kewajiban + Ekuitas)

2.4 WHEN jurnal baru bertanggal 17–20 Juni 2026 telah ditambahkan dan berstatus posted THEN the system SHALL menampilkan Laporan Arus Kas dengan nilai arus kas per aktivitas dan saldo kas akhir periode yang sama dengan Excel acuan (toleransi pembulatan ≤ Rp 1)

2.5 WHEN sebuah laporan memiliki kolom yang lebih lebar daripada area tampilannya THEN the system SHALL menyediakan scroll horizontal (geser kiri/kanan) sehingga seluruh kolom dapat dilihat tanpa terpotong

2.6 WHEN dua laporan atau lebih ditampilkan berdampingan THEN the system SHALL memungkinkan setiap laporan digulir secara horizontal untuk melihat seluruh kontennya

### Unchanged Behavior (Regression Prevention)

Perilaku yang harus tetap dipertahankan (kondisi yang tidak memicu bug).

3.1 WHEN belum ada jurnal yang diinput pengguna untuk Juni 2026 THEN the system SHALL CONTINUE TO menampilkan seluruh laporan Juni dengan angka yang sama persis dengan snapshot Excel resmi

3.2 WHEN laporan untuk bulan teraudit lain (Januari–Mei 2026) dibuka THEN the system SHALL CONTINUE TO menampilkan nilai yang sama dengan lampiran Excel masing-masing bulan

3.3 WHEN baris atau akun yang tidak terpengaruh oleh jurnal 17–20 Juni 2026 ditampilkan THEN the system SHALL CONTINUE TO menampilkan nilainya tanpa perubahan

3.4 WHEN sebuah laporan cukup sempit untuk muat di area tampilan THEN the system SHALL CONTINUE TO menampilkannya seperti semula tanpa scrollbar horizontal yang tidak perlu

3.5 WHEN laporan dicetak atau diekspor (Cetak Laporan / Unduh Excel) THEN the system SHALL CONTINUE TO menghasilkan keluaran yang berfungsi dan memuat seluruh kolom seperti semula

3.6 WHEN pengguna menggulir secara vertikal di dalam laporan THEN the system SHALL CONTINUE TO mendukung scroll vertikal seperti semula
