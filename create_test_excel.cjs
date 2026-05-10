const XLSX = require('xlsx');

const wsData = [
  ['Tanggal', 'Bukti', 'Keterangan', 'Akun Debit', 'Akun Kredit', 'Debit', 'Kredit'],
  ['2026-05-10', 'JV-TEST-001', 'Test Import Row 1', '11101 - Bank BNI', '41000 - Pendapatan Bisnis Utama', 5000000, 5000000],
  ['2026-05-11', 'JV-TEST-002', 'Test Import Row 2', '61020 - Beban Tunjangan', '11103 - Bank Kalsel', 1500000, 1500000]
];
const ws = XLSX.utils.aoa_to_sheet(wsData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Jurnal');
XLSX.writeFile(wb, 'test_import_data.xlsx');
console.log('Created test_import_data.xlsx');
