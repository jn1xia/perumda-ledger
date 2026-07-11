# Kelemahan / Flaw Catalog — LAMPIRAN LAPORAN KEUANGAN JUNI 2026.xlsx

Catatan hasil audit menyeluruh (2026-07-10) atas workbook resmi divisi keuangan
(`LAMPIRAN LAPORAN KEUANGAN JUNI 2026.xlsx`) dan file upload (`JURNAL JUNI(1).xlsx`).
Dokumen ini **terpisah dari rencana perbaikan aplikasi** (lihat
`docs/FIX_PLAN_PROGRAM_JUNI_2026.md`) — isinya adalah cacat pada Excel-nya sendiri:
apa buktinya, apa dampaknya pada angka Juni, dan apa risikonya ke depan.

**Kesimpulan umum:** angka-angka pada laporan Juni yang dipublikasikan (Neraca, Laba Rugi,
Arus Kas, LRA) **tidak mengandung salah hitung** — Neraca balance (cek internal I79 = 0),
Arus Kas terikat ke kas Neraca (cek D44 = 0), dan seluruh SUMIF cocok dengan perhitungan
ulang independen dari jurnal. Namun hasil yang benar itu dicapai lewat sejumlah *workaround*
manual dan formula yang rapuh. Flaw di bawah diurutkan berdasarkan tingkat risiko.

---

## A. Cacat formula (salah rumus, hasil kebetulan benar bulan ini)

### A1. `DATA LAMPIRAN NERACA` H51 — rumus saldo salah arah ⚠️ risiko tertinggi

* **Bukti:** Baris 51 (`Biaya yang Masih Harus Dibayar`, akun bersaldo normal **Kredit**,
  D51 = "K") memakai rumus akun **Debit**: `H51 = E51 + F51 − G51` → hasil **−488.840.600**
  (terbalik tanda). Baris K-normal lain (46, 49, 50) benar memakai `E − F + G`.
* **Workaround yang sekarang dipakai:** sheet `NERACA JUNI 2026` baris 61 tidak membaca H51,
  melainkan langsung `='DATA LAMPIRAN NERACA'!G51` (jumlah **kredit bulan ini** saja).
* **Dampak Juni:** nol — karena saldo awal 0 dan tidak ada debit, `G51` kebetulan = saldo
  yang benar (+488.840.600).
* **Risiko:** begitu akun ini punya saldo awal ≠ 0 atau ada pembayaran (debit) di bulan
  berjalan, Neraca terbit dengan **angka salah** tanpa ada error yang terlihat.
* **Perbaikan di Excel:** ganti H51 menjadi `=E51−F51+G51` dan kembalikan Neraca baris 61 ke
  `=DLN!H51`.

### A2. Cek internal liabilitas+ekuitas (`DATA LAMPIRAN NERACA` I60) rusak

* **Bukti:** `I60 = SUM(H45:H60)` = 865.461.555.129,02 ≠ Jumlah Aset 866.015.868.530,02.
  Selisih 554.313.401 = (2 × 488.840.600 dari A1) − 423.367.799 (H59 memakai laba *sebelum*
  pajak, sedangkan Neraca memakai setelah pajak).
* **Dampak:** cek pengaman internalnya sendiri tidak bisa dipakai; pembaca yang memverifikasi
  lewat I60 akan mengira neraca tidak balance padahal laporan publikasinya benar.

### A3. `RASIO` — semua rasio error

* **Bukti:** J47/J55/J61/J65 = `#DIV/0!`, J51 = `#VALUE!` karena sel input G47…G66 kosong /
  berisi `-` (template tidak pernah diisi untuk Juni).
* **Dampak:** halaman rasio tidak informatif; bukan masalah data.

### A4. `DAFTAR AKTIVA TETAP` — 51 sel `#REF!` dan judul salah tahun

* **Bukti:** kolom O ("penyusutan per bulan") baris 72+ berisi `#REF!`; judul sheet
  "PER 30 JUNI **2025**" padahal kolom-kolomnya "Per Maret 2026".
* **Dampak Juni:** nol — jurnal penyusutan Juni (61130 = 314.632.492,1005, terpecah ke 5 akun
  akumulasi) tetap konsisten dengan register. Tapi register ini sumber angka penyusutan;
  sel rusak di dalamnya menurunkan kepercayaan dan mudah menular saat di-copy bulan berikut.

---

## B. Hardcode / langkah manual (benar bulan ini, pasti basi bulan depan)

### B1. `LABA RUGI JUNI 2026` J53 & J78 — pajak penghasilan di-hardcode dan pindah tempat

* **Bukti:** J53 "Beban PPN dan PPH" = angka ketik manual `423367799` (bukan rumus;
  seharusnya `=DLN!H105`); J78 "Beban Pajak Penghasilan" = ketik manual `0`.
  Bulan Mei justru kebalikannya (L53 = 0, L78 = 67.028.943).
* **Dampak:** laba bersih & EBITDA tidak berubah, tapi **subtotal** (Jumlah Beban
  Operasional, Laba Usaha, Laba Sebelum Pajak) berpindah 423jt tergantung penempatan —
  penyajian antarbulan tidak konsisten, dan pembanding otomatis (aplikasi) harus menebak
  konvensi bulan itu.
* **Perbaikan di Excel:** pilih satu konvensi (disarankan: baris pajak sendiri, J78 = rumus
  `=DLN!H105`) dan pakai rumus, bukan angka ketik.

### B2. Kolom kumulatif LRA ("Realisasi s.d. bulan lalu") seluruhnya hardcode

* **Bukti:** kolom I pada `Penerimaan`, `Beban Umum`, `Beban Operasional `, ` Investasi`
  adalah nilai ketik yang disalin dari workbook bulan sebelumnya.
* **Risiko:** satu salah salin = kumulatif salah sepanjang sisa tahun, tanpa jejak.

### B3. Baris Beban Pokok LRA (`Beban Operasional ` K61/K62) hardcode

* **Bukti:** K61 = `194798200` (= pembelian persediaan: debit 11401 189.918.200 + debit
  11402 4.880.000), K62 = 0 — angka benar tapi diketik manual, bukan rumus dari annex.

### B4. Nilai kolom "Mei 2026" (kolom K Neraca / L Laba Rugi / F Arus Kas) adalah tempelan nilai

* Konsekuensi desain "workbook bulanan berantai": tidak ada jejak formula ke buku Mei.
  Kesalahan tempel tidak terdeteksi otomatis. (Untuk Juni terverifikasi benar.)

---

## C. Kerapuhan struktural (bekerja sekarang, mudah patah)

### C1. Seluruh agregasi memakai **nama teks**, bukan kode akun

* SUMIF Neraca mencocokkan **nama Akun** (kolom D jurnal); P&L/LRA mencocokkan **nama Sub
  Akun** (kolom E). Salah ketik satu huruf/spasi pada nama = transaksi hilang dari laporan
  **tanpa error**.

### C2. Konflik tabel kode antar-sheet

* Jurnal + sheet `COA`: 21500 = Biaya yang Masih Harus Dibayar, 21600 = PDD,
  22300 = Utang Daerah. Kolom kode di `DATA LAMPIRAN NERACA`: 21500 = Utang Daerah,
  21600 = PDD, 21700 = Biaya YMHD. Sub-kode annex L/R juga bergeser (70001 = header di annex,
  = Pendapatan Bunga di DLN).
* **Dampak:** Excel selamat karena join by name; sistem lain (aplikasi, BI, auditor) yang
  percaya kolom kode akan salah memetakan **Rp 488.840.600**.

### C3. Nama dengan spasi tersembunyi & baris duplikat

* Sub Akun berspasi buntut: `'Pendapatan Ramayana '`, `'Beban Jilid Laporan '`,
  `'Beban Pembuatan Souvenir Perumda '` — cocok hanya karena daftar nama annex ikut
  berspasi buntut.
* `DATA LAMPIRAN NERACA` punya dua baris piutang: `' Piutang Usaha'` (spasi depan, kode
  header 11200) dan `'Piutang Usaha'` (11201). SUMIF Excel membedakannya; sistem yang
  melakukan trim lalu menjumlah dua-duanya akan **dobel 58.351.411**.
* Label Neraca `"Kas Kecil  - Kantor"` (spasi ganda) dan `"Tanah "` (spasi buntut).

### C4. Jendela SUMIF terkunci di baris 1–731 jurnal

* Semua rumus membaca `'JURNAL JUNI 2026'!$…$731`. Jurnal Juni = 429 baris (aman). Bulan
  dengan > ±728 baris jurnal akan **terpotong diam-diam** — laporan kurang catat tanpa
  peringatan apa pun.

### C5. Kolom-kolom bulan legacy di `DATA LAMPIRAN LABA RUGI 2026`

* Pasangan kolom Feb–Des menunjuk irisan baris jurnal (732–4569) yang sudah tidak ada di
  file bulanan ini → semuanya 0, tapi tetap ikut dijumlahkan di kolom Total. Ada typo rentang
  (baris 3140–3146 masuk irisan November **dan** Desember) — dobel hitung laten jika pola
  jurnal setahun-satu-sheet dipakai lagi.
* Rentang kredit tidak seragam antarbaris (`$E$4:$G$731` vs `$E$330:$G$731`) — kebetulan
  tidak berdampak karena semua kredit pendapatan ada di batch 30 Juni (baris 330+); patah
  jika urutan input berubah.

### C6. 111 external link, 6 di antaranya masih hidup di rumus laporan

* Workbook menyimpan referensi ke 111 file eksternal (warisan template audit sejak 2002!).
  Yang masih dipakai rumus aktif: `[84]` (file "LAPORAN PERUMDA 2025 …xlsx" di folder
  Downloads komputer lain) pada Neraca baris 14/50/57/64, dan `[222]NERACA OKT` pada Arus
  Kas baris 28/38. Semuanya sekarang mengembalikan nilai cache **0**.
* **Risiko:** membuka + recalc di komputer tanpa file itu → nilai basi/`#REF`; nilai baris
  itu tidak akan pernah bisa berubah dari 0 secara sah.
* **Perbaikan di Excel:** putus semua link (Data → Edit Links → Break Link), ganti dengan 0
  eksplisit atau baris akun sungguhan.

### C7. Kolom kode akun di sheet annex (DATA LAMPIRAN LABA RUGI) bergeser satu baris terhadap COA — ±88 kode

* **Bukti (audit 2026-07-11):** untuk hampir seluruh rentang 61xxx/62xxx/70xxx, nama
  pada kode *N* di annex = nama pada kode *N−1* di sheet `COA`. Annex menyisipkan
  baris judul kelompok ke dalam penomoran sehingga semua kode di bawahnya
  terdorong satu slot. Contoh:

  | Kode | Sheet COA | Sheet annex |
  |---|---|---|
  | 61052 | Beban Air | Beban Telepon |
  | 61061 | Beban Makan Minum Rapat | Beban Konsumsi Rapat dan Tamu (induknya!) |
  | 70001 | Pendapatan Bunga | Pendapatan di Luar Operasional (judul) |
  | 70000 | Pendapatan di Luar Operasional | **Beban Insentif Bagian Penagihan** (beban di kode pendapatan!) |

* **Dampak pada angka:** nol — tidak ada satu pun rumus workbook yang membaca
  kolom kode annex (semua SUMIF join by *nama*). Kolom kode itu murni hiasan.
* **Risiko:** siapa pun yang mempercayai kolom kode annex (importir data, auditor,
  BI tool) mendapat akun yang salah secara sistematis.
* **Perbaikan di Excel:** jangan coba dinomori ulang manual — lebih aman **hapus
  kolom kode annex** (tidak dipakai rumus) atau generate ulang dari sheet COA.

### C8. Kode yang sama = akun yang berbeda antar-sheet

* **80001**: COA = "Beban Bunga Bank", tetapi annex dan DATA LAMPIRAN NERACA =
  "Beban Pajak Bank" — dan **COA sama sekali tidak punya akun "Beban Pajak
  Bank"** padahal ada realisasinya Rp 3.700.583 di Juni.
* **42008/42010/42011**: COA menamai "Pendapatan Perdagangan Bahan Pokok dan
  Penting" / "Penjualan Air Minum…" / "Penjualan Gas LPG", annex menamai
  "Pendapatan Pusat Grosir Bahan Pokok" / "Pendapatan Air Minum…" /
  "Pendapatan Gas LPG" (nama versi annex-lah yang dipakai jurnal).
* **33000**: "Saldo Laba (Rugi) *Tahun* Lalu" (COA) vs "…*Periode* Lalu" (DLN).
* (21500/21600/21700 dan 22300 sudah tercatat di C2.)

### C9. Jurnal memakai 8 nama Sub Akun "alias" yang tidak ada di baris COA mana pun

* **Bukti positif dulu:** label akun UTAMA jurnal 100% konsisten dengan COA
  (0 mismatch pada 426 baris), dan tidak ada satu pun Sub Akun yang dibukukan
  di keluarga akun yang salah. Inti pembukuan divisi rapi.
* **Alias yang dipakai jurnal (Juni):**

  | Jurnal menulis | COA sebenarnya | Rp (Juni) |
  |---|---|---:|
  | Pendapatan Pusat Grosir Bahan Pokok | 42008 Pendapatan Perdagangan Bahan Pokok dan Penting | 195.911.500 |
  | Beban ATK | 61041 Beban Alat Tulis Kantor | 8.593.000 |
  | Pendapatan Gas LPG | 42011 Penjualan Gas LPG | 7.400.000 |
  | Beban Pajak Bank | *(tidak ada — 80001 COA = "Beban Bunga Bank")* | 3.700.583 |
  | Beban Makan Minum Kunjungan Tamu/Sosialisasi Pedagang | 61062 (beda spasi setelah "/") | 3.203.300 |
  | Beban Tunjangan Fungsional | 61022 …(Kordinator) | 1.250.000 |
  | Pendapatan Air Minum Isi Ulang | 42010 Penjualan Air Minum Isi Ulang | 690.000 |
  | Pendapatan Layanan Pengiriman | 42004 Pendapatan Layanan Pengiriman Barang | 0 |

* **Dampak:** workbook sendiri aman (annex meniru nama jurnal, bukan nama COA);
  aplikasi juga sudah mengenali semua alias ini. Risikonya konsistensi jangka
  panjang: dua nama untuk akun yang sama mengundang typo baru.
* **Perbaikan di Excel:** bakukan satu nama per akun (ubah nama COA mengikuti
  kebiasaan jurnal, atau sebaliknya — yang penting satu).

---

## D. Catatan kualitas data (bukan cacat, tapi perlu diketahui)

| # | Temuan | Nilai | Keterangan |
|---|---|---|---|
| D1 | 18 baris jurnal bernilai 0 (30 Juni) | — | Placeholder pasangan bank↔pendapatan untuk pos yang nihil bulan ini; tidak memengaruhi laporan |
| D2 | Kolom Keterangan kosong di file upload | 426/426 baris | Lampiran punya keterangan di 326 baris; tidak dipakai rumus mana pun |
| D3 | Selisih rekonsiliasi Bank Kalsel | −0,82 | `DLN` H8 (buku: 6.806.187.798,87) vs I8 (rekening koran: …799,69) — dibiarkan; angka buku yang dipublikasikan |
| D4 | Desimal "debu" pada penyusutan | …492,1005 | Penyusutan per bulan dihitung dari tarif tahunan ÷ 12 → pecahan rupiah; sistem yang membulatkan per baris tidak akan pernah cocok persis |
| D5 | PPh Juni 423.367.799 dibukukan sebagai 80000 | — | Secara substansi = akun 99999 (pemisahan hanya lewat Sub Akun); lihat C1/C2 |
| D6 | LRA basis kas bercampur sumber | — | Penerimaan 1.6 = pelunasan piutang (kredit 11201) = 58.351.411; Beban Pokok = pembelian persediaan (debit 11401/11402) = 194.798.200; Beban Umum LRA tanpa penyusutan — disengaja (basis kas), tapi tidak terdokumentasi di workbook |

---

## E. Ringkasan: mana yang harus diperbaiki di mana

| Flaw | Perbaiki di Excel (divisi) | Aplikasi harus… |
|---|---|---|
| A1 rumus H51 | ✅ ganti rumus | hitung dengan rumus yang benar (jangan tiru `=G51`) |
| B1 pajak hardcode | ✅ jadikan rumus, satu konvensi | ikuti penempatan Juni untuk acceptance; simpan sebagai flag penyajian |
| B2/B3 hardcode LRA | ✅ jadikan rumus | hitung kumulatif dari snapshot bulan lalu + jurnal |
| C1 join by name | (desain Excel) | join by kode efektif + Sub Akun; trim nama dua sisi |
| C2 konflik kode | ✅ samakan tabel kode DLN dengan COA | pakai konvensi COA (21500 = BYMHD) |
| C3 spasi/duplikat | ✅ rapikan nama | normalisasi whitespace saat impor |
| C4 jendela 731 baris | ✅ ubah ke full-column range | tidak ada batas — dan justru jadi pembanding yang benar jika Excel terpotong |
| C6 external link | ✅ break links | perlakukan 6 baris itu sebagai 0 |
| C7 kode annex bergeser ±88 kode | ✅ hapus / generate ulang kolom kode annex dari COA | jangan pernah membaca kode annex — join by nama (sudah) |
| C8 kode sama ≠ akun sama (80001 dll.) | ✅ satu nama per kode; tambahkan akun "Beban Pajak Bank" ke COA | kenali kedua nama (sudah) |
| C9 8 nama Sub Akun alias | ✅ bakukan satu nama per akun | kenali alias via kata kunci — termasuk "Beban ATK" → baris LRA 4.1 (sudah) |
| A3/A4 error template | ✅ isi/derefensi | abaikan (bukan jalur publikasi) |

Untuk mekanisme lengkap tiap sheet (rumus per sel + checksum acceptance Juni), lihat
`docs/FORMULA_SPEC_LAMPIRAN_JUNI_2026.md`.
