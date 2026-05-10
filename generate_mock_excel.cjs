const XLSX = require('xlsx');

const wsData = [
  ['Tanggal', 'Bukti', 'Keterangan', 'Akun Debit', 'Akun Kredit', 'Debit', 'Kredit'],
  ['2026-06-01', 'B.02', 'Test Import 1', '11101 - Kas Kecil', '41000 - Pendapatan Bisnis Utama', 500000, 500000],
  ['2026-06-02', 'B.03', 'Test Import 2', '61020 - Beban Tunjangan Pegawai Umum', '11103 - Bank Kalsel', 250000, 250000]
];

const ws = XLSX.utils.aoa_to_sheet(wsData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Jurnal');

XLSX.writeFile(wb, 'mock_import.xlsx');
console.log('Mock file generated: mock_import.xlsx');
