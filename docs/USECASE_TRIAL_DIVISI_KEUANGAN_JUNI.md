# Use Case: Trial Divisi Keuangan — Sinkronisasi Laporan Juni 2026

Skenario nyata dari *List Pertanyaan/Tanggapan/Request Divisi Keuangan* (per 12/06/2026):
saat upload jurnal Juni, **Laba Rugi** sudah update tetapi **Neraca, Arus Kas, LRA, dan Buku Besar** belum.
Dokumen ini menunjukkan alur yang benar setelah pembaruan terbaru.

## Aktor
- **Staff Keuangan** — upload lampiran & input jurnal.
- **Manager Keuangan** — verifikasi laporan.

## Prasyarat
- File `LAMPIRAN LAPORAN KEUANGAN JUNI 2026.xlsx` (berisi sheet laporan + sheet `JURNAL JUNI 2026`).
- Login dengan peran yang boleh menulis jurnal.

---

## Skenario A — Sinkronisasi seluruh laporan dari lampiran

### Langkah
1. Buka **Jurnal Umum → Import Excel**.
2. Drag & drop `LAMPIRAN LAPORAN KEUANGAN JUNI 2026.xlsx`.
3. Modal mendeteksi lampiran → menampilkan **"Lampiran terdeteksi — Juni 2026"**.
4. Klik **Muat Snapshot + Jurnal**.

### Hasil yang diharapkan
| Modul | Sebelum | Sesudah |
|---|---|---|
| Laba Rugi | ✅ sudah update | ✅ sama dengan Excel |
| **Neraca** | ❌ belum update | ✅ tampil persis lampiran (snapshot 55 baris) |
| **Arus Kas** | ❌ belum update | ✅ tampil persis lampiran (27 baris) |
| **LRA** (sd bln lalu → bulan ini → sd bulan ini) | ❌ tidak sinkron | ✅ kolom (7)(8)(9) sesuai lampiran |
| **Buku Besar** | ❌ kosong/stale | ✅ terisi 54 transaksi (149 baris, Rp 918.400.636) |

Contoh nilai LRA Penerimaan yang kini cocok (outline 1.1 Pengelolaan Pasar Toko/Kios):
- Target 1 Tahun: Rp 8.632.194.723
- Sd bln lalu (7): Rp 1.322.283.739
- Bulan ini (8): Rp 0
- Sd Bulan ini (9): Rp 1.322.283.739

---

## Skenario B — Tambah transaksi baru setelah closing (delta)

Misal 20 Juni ada pendapatan parkir yang belum ada di lampiran:

1. **Jurnal → + Buat Jurnal**
   - Tanggal `2026-06-20`, Debit `11101 Kas Kecil` Rp 2.000.000, Kredit `42001 Pendapatan Parkir` Rp 2.000.000.
2. **Approve** (status posted, id `JV-`).

### Hasil
- Laba Rugi: Pendapatan Usaha **+Rp 2.000.000**.
- Neraca: Aset (Kas) +Rp 2.000.000 & Ekuitas +Rp 2.000.000 → tetap balance.
- Arus Kas: arus operasi +Rp 2.000.000.
- LRA Penerimaan: realisasi outline 2.1 +Rp 2.000.000.
- Buku Besar: entri muncul di akun 11101 & 42001.

Snapshot lampiran tetap jadi baseline; jurnal baru menumpuk sebagai delta. Tanpa upload ulang / deploy ulang.

---

## Skenario C — Tie-out Kas Kecil (Buku Besar = Neraca)

Keluhan: "Buku Besar Kas Kecil belum sama dengan Excel."

### Temuan
Data jurnal yang diunggah (baik sheet `JURNAL JUNI 2026` maupun `template_jurnal`) hanya memuat **149 baris berisi nominal**; ~324 baris kosong, termasuk **"Pengisian Saldo Kas Kecil" (top-up) tanpa nominal**. Akibatnya:
- Kas Kecil dari jurnal: hanya pengeluaran **−Rp 6.319.160** (tidak ada top-up).
- Neraca lampiran: Kas Kecil ≈ **Rp 23,5 jt**.

### Tindakan agar tie-out
Buku Besar = **Saldo Awal + mutasi jurnal**. Agar cocok dengan Neraca, lakukan salah satu:
1. **Lengkapi nominal jurnal** yang kosong (khususnya top-up Kas Kecil) di sheet/template sebelum upload, atau
2. **Set Saldo Awal** akun Kas Kecil (11101) untuk Juni = saldo akhir Mei, sehingga `Saldo Awal + (−6.319.160)` = angka Neraca.

> ⚠️ Aplikasi tidak bisa membuat nominal yang hilang. Tie-out Kas Kecil bergantung pada kelengkapan data jurnal + saldo awal yang benar. Laporan Neraca/Arus Kas/LRA tetap akurat karena diambil dari sheet laporan yang lengkap.

---

## Ringkasan
- **Neraca, Arus Kas, LRA** → sinkron otomatis dari lampiran (Skenario A). ✅
- **Jurnal baru** → delta live ke semua laporan (Skenario B). ✅
- **Buku Besar Kas Kecil** → ikut terisi, tie-out perlu data jurnal lengkap + saldo awal (Skenario C). ⚠️

## Catatan Teknis
- Deteksi lampiran: `src/components/ExcelImport/ExcelImportModal.jsx` → `detectLampiranPeriods`.
- Ekstraksi snapshot + jurnal: `src/utils/reportSnapshot.js` → `extractSnapshot` / `extractJournals`.
- Penyimpanan: `POST /api/reports/snapshot` (terima `journals`, ganti jurnal periode dengan baseline `XL-`).
- LRA realisasi: `loadLraToAnggaran` menyimpan `sd_bln_lalu`, `bulan_ini`, `realisasi` dari sheet Penerimaan.
