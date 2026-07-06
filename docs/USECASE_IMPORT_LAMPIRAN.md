# Use Case: Import Lampiran → Snapshot + Jurnal Otomatis

Contoh end-to-end memakai lampiran asli **LAMPIRAN LAPORAN KEUANGAN JUNI 2026**.

## Tujuan
Sekali unggah file lampiran, sistem:
1. Membaca sheet laporan (NERACA / ARUS KAS / LABA RUGI / Penerimaan / Beban) sebagai **snapshot audited** → laporan tampil persis seperti Excel.
2. Membaca sheet **JURNAL** → mengimpor transaksi sebagai **baseline** sehingga Buku Besar terisi dan saldo cocok dengan Neraca.
3. Jurnal baru yang diinput setelahnya otomatis menambah (**delta**) ke semua laporan — tanpa unggah ulang / deploy ulang.

## Aktor
- **Staff Keuangan** — mengunggah lampiran & input jurnal baru.
- **Manager Keuangan** — memverifikasi laporan.

---

## Kondisi Awal
Laporan Juni masih terkunci ke snapshot lama. Buku Besar nyaris kosong untuk Juni (hanya 1 jurnal nyasar), dan Neraca / Arus Kas / LRA belum mencerminkan transaksi sebenarnya.

---

## Langkah 1 — Unggah lampiran dari halaman Jurnal
1. Buka **Jurnal Umum** → klik **Import Excel**.
2. Pada modal "Import Jurnal Transaksi dari Excel", **drag & drop** atau pilih `LAMPIRAN LAPORAN KEUANGAN JUNI 2026.xlsx`.
3. Sistem mendeteksi bahwa file adalah **lampiran lengkap** (ada sheet `JURNAL JUNI 2026` + sheet laporan) dan menampilkan langkah konfirmasi:
   > 📋 Lampiran terdeteksi — periode **Juni 2026**. Akan dimuat snapshot + jurnal baseline.
4. Klik **Muat Snapshot + Jurnal**.

Yang terjadi dalam sekali klik:
- Mem-parse sheet laporan (`NERACA JUNI 2026`, `ARUS KAS JUNI 2026`, `LABA RUGI JUNI 2026`, `Penerimaan` / `Beban Umum` / `Investasi`) → disimpan sebagai snapshot Juni.
- Mem-parse sheet `JURNAL JUNI 2026` → mengekstrak **54 transaksi / 149 baris**, balance **Rp 918.400.636** debit = kredit → dimuat sebagai jurnal baseline (`XL-2026-06-U0001 …`).

> Jika yang diunggah adalah **template jurnal biasa** (bukan lampiran), modal otomatis memakai alur lama: baris ditambahkan sebagai jurnal delta (`JV-`).

Pesan konfirmasi:

```
Lampiran diproses sebagai snapshot + jurnal baseline.
2026-06: snapshot (Neraca 55 / Arus Kas 27 / Laba Rugi 60), 54 jurnal baseline

Laporan kini tampil seperti lampiran. Jurnal baru yang Anda input
setelah ini otomatis menambah (delta) ke semua laporan.
```

> Alternatif: alur yang sama juga tersedia di **Pengaturan → Data & Backup → "Upload Lampiran → Snapshot Laporan"** (pilih periode lalu unggah).

---

## Langkah 2 — Verifikasi laporan cocok dengan lampiran
- **Laporan → Neraca / Arus Kas / Laba Rugi** (periode Juni): angka sama persis dengan Excel.
- **Laporan → LRA → Tabel Penerimaan**: tampil dengan layout lampiran.
- **Buku Besar**: sudah berisi aktivitas Juni. Contoh transaksi dari file:
  - 01/06, bukti 008 — Beban Pemeliharaan Bangunan Pasar (D) / Kas Kecil (K) Rp 750.000
  - 03/06, bukti 002 — multi-baris: Beban Pemeliharaan Rp 11.896.000 + Beban Adm Bank Rp 2.500 (D) / Bank Kalsel Rp 11.898.500 (K)
- **Saldo Buku Besar = Neraca** kini konsisten karena keduanya dari sumber yang sama.

---

## Langkah 3 — Tambah transaksi baru setelah closing (delta)
Misal 20 Juni perusahaan menerima pendapatan parkir yang belum ada di lampiran:

1. **Jurnal → + Buat Jurnal**:
   - Tanggal `2026-06-20`
   - Debit `11101 Kas Kecil` Rp 2.000.000
   - Kredit `42001 Pendapatan Parkir` Rp 2.000.000
2. **Approve** (status → posted). Jurnal mendapat id `JV-` sehingga diperlakukan sebagai **delta**.

Otomatis terjadi:

| Laporan | Dampak |
|---|---|
| Laba Rugi | Pendapatan Usaha +Rp 2.000.000 — muncul banner "➕ Termasuk 1 baris jurnal baru" |
| Neraca | Aset (Kas) +Rp 2.000.000 & Ekuitas (laba berjalan) +Rp 2.000.000 — tetap balance |
| Arus Kas | Arus kas operasi +Rp 2.000.000 |
| LRA Penerimaan | Realisasi outline 2.1 Pendapatan Parkir +Rp 2.000.000 |
| Buku Besar | Entri muncul di akun 11101 dan 42001 |

Tidak perlu unggah ulang atau deploy ulang — snapshot tetap sebagai baseline audited dan jurnal baru ditumpuk di atasnya.

---

## Langkah 4 — Unggah ulang (idempotent)
Jika lampiran Juni diunggah lagi (mis. file koreksi), impor akan **mengganti** seluruh jurnal baseline Juni dengan isi file → tidak ada duplikat.

> ⚠️ Catatan: proses ini mengganti **semua** jurnal Juni. Input manual `JV-` perlu dimasukkan kembali jika Anda mengunggah ulang.

---

## Aturan Inti
- **Lampiran yang diunggah = kebenaran audited** untuk bulan tsb (snapshot + jurnal baseline `XL-`).
- **Jurnal yang diinput setelahnya = delta** (`JV-`) yang mengalir live ke semua laporan.

## Catatan Teknis
- Deteksi lampiran di modal: `src/components/ExcelImport/ExcelImportModal.jsx` memanggil `detectLampiranPeriods(workbook)`; jika ada sheet `JURNAL <bulan> <tahun>`, modal beralih ke alur snapshot+baseline (langkah `lampiran`), bukan parser baris template.
- Ekstraksi: `src/utils/reportSnapshot.js` → `extractSnapshot` / `extractJournals` (grup per tanggal + bukti, dukung multi-baris).
- Penyimpanan: `POST /api/reports/snapshot` (server/routes/api.cjs) — menerima `journals` lalu mengganti jurnal bulan tsb dengan set baseline.
- Jurnal baseline pakai prefix `XL-` → ikut Buku Besar & mesin dinamis, tetapi tidak dihitung ganda oleh overlay delta laporan.
- Jurnal delta pakai prefix `JV-` (dibuat via "+ Buat Jurnal" atau import template biasa).
