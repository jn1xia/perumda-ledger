const XLSX = require('xlsx');

const wsData = [
  ['Tanggal', 'Bukti', 'Keterangan', 'Akun Debit', 'Akun Kredit', 'Debit', 'Kredit'],
  ['2026-05-02', 'JV-MAY-001', 'Penerimaan Pendapatan Pasar MEI', '11101 - Bank BNI', '41000 - Pendapatan Bisnis Utama', 12500000, 12500000],
  ['2026-05-05', 'JV-MAY-002', 'Pembayaran Biaya Listrik MEI', '61040 - Beban Listrik, Air & Telepon', '11101 - Bank BNI', 3400000, 3400000],
  ['2026-05-10', 'JV-MAY-003', 'Penerimaan Piutang Sewa Kios', '11103 - Bank Kalsel', '11300 - Piutang Usaha', 8000000, 8000000],
  ['2026-05-15', 'JV-MAY-004', 'Pembayaran Gaji Karyawan MEI', '61010 - Beban Gaji dan Upah', '11101 - Bank BNI', 25000000, 25000000],
  ['2026-05-20', 'JV-MAY-005', 'Pembelian ATK Kantor MEI', '61080 - Beban ATK & Cetakan', '11102 - Kas Kecil', 750000, 750000]
];

const ws = XLSX.utils.aoa_to_sheet(wsData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Jurnal');
XLSX.writeFile(wb, 'dummy_mei_2026.xlsx');
console.log('Created dummy_mei_2026.xlsx');
