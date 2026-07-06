// make_seed_journals.cjs — generates a journal Excel you can import into the live
// app to test LRA cumulative (TW III), NPD-reflects-journals, and the skipped-row notice.
const XLSX = require('xlsx');

// Columns match parseJurnal: Tgl | No.Akun | Akun | Sub Akun | D | K | Keterangan | Tipe
const rows = [
  ['Tanggal', 'No Akun', 'Akun', 'Sub Akun', 'D', 'K', 'Keterangan', 'Tipe'],

  // ── Fix 2 (LRA cumulative TW III = Jul+Aug+Sep) & Fix 4 (NPD reflects journals) ──
  // 61111 = Beban Sewa Kendaraan → outline 11.1
  ['2026-07-10', '61111', 'Beban Sewa Kendaraan', '', 10000000, 0, 'Sewa kendaraan operasional Juli', 'pengeluaran'],
  ['2026-07-10', '11101', 'Kas/Bank',            '', 0, 10000000, 'Sewa kendaraan operasional Juli', 'pengeluaran'],

  ['2026-08-10', '61111', 'Beban Sewa Kendaraan', '', 5000000, 0, 'Sewa kendaraan operasional Agustus', 'pengeluaran'],
  ['2026-08-10', '11101', 'Kas/Bank',            '', 0, 5000000, 'Sewa kendaraan operasional Agustus', 'pengeluaran'],

  ['2026-09-10', '61111', 'Beban Sewa Kendaraan', '', 2000000, 0, 'Sewa kendaraan operasional September', 'pengeluaran'],
  ['2026-09-10', '11101', 'Kas/Bank',            '', 0, 2000000, 'Sewa kendaraan operasional September', 'pengeluaran'],

  // ── Fix 4 (NPD reflects journals) — May entry for a different category ──
  // 61011 = Gaji Direksi → outline 1.1 (bebanUmum)
  ['2026-05-15', '61011', 'Gaji Direksi', '', 7500000, 0, 'Gaji direksi Mei', 'pengeluaran'],
  ['2026-05-15', '11101', 'Kas/Bank',     '', 0, 7500000, 'Gaji direksi Mei', 'pengeluaran'],

  // ── Fix 3 (skipped-row notification) — DELIBERATELY BROKEN: no readable D/K ──
  ['2026-05-20', '61021', 'Tunjangan Jabatan', '', '-', '', 'Baris sengaja rusak untuk uji notifikasi', 'pengeluaran'],
];

const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Jurnal');
XLSX.writeFile(wb, 'seed_test_journals.xlsx');
console.log('Created seed_test_journals.xlsx with', rows.length - 1, 'rows (1 deliberately broken).');
