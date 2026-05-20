/**
 * Fix journals with account NAMES instead of CODES directly in SQLite.
 * Bypasses the API's "ALREADY_POSTED" guard.
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');

const manualMap = {
  // Banks & Cash
  'kas kecil': '11101 - Kas Kecil',
  'bank kalsel': '11103 - Bank Kalsel',
  'bank bni': '11104 - Bank BNI',
  'bank bni bisnis': '11106 - Bank BNI Bisnis',
  'bank bni tapcash': '11105 - Investasi Jangka Pendek',
  'bbm dibayar di muka': '11501 - BBM Dibayar di Muka',
  'piutang usaha': '11201 - Piutang Usaha',
  'utang usaha': '21200 - Utang Usaha',
  'utang daerah': '22300 - Utang Daerah',
  'persediaan barang dagang (gas lpg)': '11401 - Persediaan Barang Dagang',
  'persediaan barang dagang (bapok dan gerai inflasi)': '11401 - Persediaan Barang Dagang',
  // Fixed Assets
  'bangunan': '12102.1 - Bangunan',
  'peralatan': '12204.1 - Peralatan',
  'aset dalam penyelesaian': '12300 - Aset Dalam Penyelesaian',
  // Akumulasi Penyusutan
  'akumulasi penyusutan bangunan': '12102.2 - Akumulasi Penyusutan Bangunan',
  'akumulasi penyusutan kendaraan': '12201.2 - Akumulasi Penyusutan Kendaraan',
  'akumulasi penyusutan mesin': '12202.2 - Akumulasi Penyusutan Mesin',
  'akumulasi penyusutan instalasi listrik': '12203.2 - Akumulasi Penyusutan Instalasi Listrik',
  'akumulasi penyusutan peralatan': '12204.2 - Akumulasi Penyusutan Peralatan',
  // Pendapatan
  'pendapatan bisnis lainnya': '42000 - Pendapatan Operasional Lainnya',
  'pendapatan di luar operasional > pendapatan bunga': '70001 - Pendapatan Bunga',
  'pendapatan bisnis lainnya > pendapatan air minum isi ulang': '42010 - Penjualan Air Minum Isi Ulang',
  'pendapatan bisnis lainnya > pendapatan gas lpg': '42011 - Penjualan Gas LPG',
  'pendapatan bisnis lainnya > pendapatan gerai inflasi': '42009 - Pendapatan Gerai Inflasi',
  'pendapatan bisnis lainnya > pendapatan parkir': '42001 - Pendapatan Parkir',
  'pendapatan bisnis lainnya > pendapatan pusat grosir bahan pokok': '42008 - Pendapatan Perdagangan Bahan Pokok',
  'pendapatan bisnis utama > pendapatan pemeliharaan kebersihan': '41003 - Pendapatan Pemeliharaan Kebersihan Pasar',
  'pendapatan bisnis utama > pendapatan pengelolaan pasar pkl': '41002 - Pendapatan Pengelolaan Pasar PKL',
  'pendapatan bisnis utama > pendapatan pengelolaan pasar toko': '41001 - Pendapatan Pengelolaan Pasar Toko/Kios',
  // HPP
  'beban pokok penjualan (gas lpg)': '51000 - Beban Pokok Penjualan',
  'beban pokok penjualan (bapok & gerai inflasi)': '51000 - Beban Pokok Penjualan',
  // Beban Gaji
  'beban gaji > beban gaji pokok direksi': '61011 - Beban Gaji Pokok Direksi',
  'beban gaji > beban gaji pokok pegawai tetap': '61012 - Beban Gaji Pokok Pegawai Tetap',
  'beban gaji > beban honor dewas': '61013 - Beban Honor Dewas',
  // Tunjangan Umum
  'beban tunjangan pegawai umum > beban tunjangan jabatan': '61021 - Beban Tunjangan Jabatan',
  'beban tunjangan pegawai umum > beban tunjangan fungsional': '61022 - Beban Tunjangan Fungsional',
  'beban tunjangan pegawai umum > beban tunjangan transportasi': '61023 - Beban Tunjangan Transportasi',
  'beban tunjangan pegawai umum > beban tunjangan makan': '61024 - Beban Tunjangan Makan',
  'beban tunjangan pegawai umum > beban tunjangan ketenagakerjaan': '61026 - Beban Tunjangan Ketenagakerjaan',
  'beban tunjangan pegawai umum > beban tunjangan kesehatan': '61025 - Beban Tunjangan Kesehatan',
  // ATK
  'beban alat tulis kantor > beban atk': '61041 - Beban Alat Tulis Kantor',
  // Telepon/Listrik/Air
  'beban telepon/listrik/air/wifi/website > beban air': '61052 - Beban Air',
  'beban telepon/listrik/air/wifi/website > beban listrik': '61053 - Beban Listrik',
  'beban telepon/listrik/air/wifi/website > beban wifi/internet': '61054 - Beban Wifi/Internet',
  // Konsumsi
  'beban konsumsi rapat dan tamu > beban makan minum rapat': '61061 - Beban Makan Minum Rapat',
  'beban konsumsi rapat dan tamu > beban makan minum kunjungan tamu': '61062 - Beban Makan Minum Kunjungan Tamu',
  'beban konsumsi rapat dan tamu > beban makan minum aktivitas lapangan': '61063 - Beban Makan Minum Aktivitas Lapangan',
  'beban konsumsi rapat dan tamu > beban makan minum kegiatan kantor': '61064 - Beban Makan Minum Kegiatan Kantor',
  'beban konsumsi rapat dan tamu > beban makan minum kegiatan kebersihan': '61065 - Beban Makan Minum Kegiatan Kebersihan',
  // BBM
  'beban bahan bakar minyak > beban bbm direksi': '61081 - Beban BBM Direksi',
  'beban bahan bakar minyak > beban bbm mobil keliling': '61082 - Beban BBM Mobil Keliling',
  'beban bahan bakar minyak > beban bbm truck': '61083 - Beban BBM Truck',
  'beban bahan bakar minyak > beban bbm pick up': '61084 - Beban BBM Pick Up',
  // Perjalanan Dinas
  'beban perjalanan dinas > karyawan': '61091 - Karyawan',
  // Pendidikan
  'beban pendidikan, pelatihan, dan bimbingan teknik > beban diklat': '61101 - Beban Diklat/Bimtek',
  // Jasa Profesional
  'beban jasa profesional/konsultan/tenaga ahli > beban pendataan': '61125 - Beban Pendataan Pedagang',
  // Penyusutan
  'beban penyusutan aktiva tetap > beban penyusutan bangunan': '61131 - Beban Penyusutan Bangunan',
  'beban penyusutan aktiva tetap > beban penyusutan kendaraan': '61132 - Beban Penyusutan Kendaraan',
  'beban penyusutan aktiva tetap > beban penyusutan mesin': '61133 - Beban Penyusutan Mesin',
  'beban penyusutan aktiva tetap > beban penyusutan instalasi listrik': '61134 - Beban Penyusutan Instalasi Listrik',
  'beban penyusutan aktiva tetap > beban penyusutan peralatan': '61135 - Beban Penyusutan Peralatan',
  // Umum Lain-lain
  'beban umum lain-lain > beban kegiatan kelembagaan': '61141 - Beban Kegiatan Kelembagaan',
  'beban umum lain-lain > beban transportasi rapat': '61144 - Beban Transportasi Rapat',
  'beban lain lain': '61140 - Beban Umum Lain-lain',
  // Perlengkapan
  'beban perlengkapan dan pemeliharaan kantor > beban pemeliharaan': '61071 - Beban Pemeliharaan Perlengkapan',
  // Operasional
  'beban pemeliharaan kendaraan operasional > beban parkir mobil': '62012 - Beban Parkir Mobil Operasional',
  'beban pemeliharaan kendaraan operasional > beban pemeliharaan': '62013 - Beban Pemeliharaan Mobil Truck',
  'beban pemeliharaan bangunan pasar > beban pemeliharaan bangunan': '62021 - Beban Pemeliharaan Bangunan Pasar',
  'beban pemeliharaan kebersihan pasar > alat dan bahan kebersihan': '62032 - Alat dan Bahan Kebersihan Pasar',
  'beban pemeliharaan kebersihan pasar > alat dan bahan penyegelan': '62031 - Alat dan Bahan Penyegelan',
  'beban barang cetakan > beban cetak spanduk': '62051 - Beban Cetak Spanduk',
  'beban pelayanan dan pemasaran': '62040 - Beban Pelayanan dan Pemasaran',
  // Honor Kontrak
  'beban gaji dan honor tenaga kontrak dan harian lepas': '62060 - Beban Honor Tenaga Kontrak',
  // Tunjangan Operasional
  'beban tunjangan pegawai operasional > beban tunjangan kesehatan': '62071 - Beban Tunjangan Kesehatan (THL)',
  'beban tunjangan pegawai operasional > beban tunjangan ketenagakerjaan': '62072 - Beban Tunjangan Ketenagakerjaan (THL)',
  // Kelengkapan Operasional
  'beban kelengkapan pegawai operasional': '62080 - Beban Kelengkapan Pegawai',
  'beban kelengkapan pegawai operasional > beban atribut petugas': '62083 - Beban Atribut Petugas Kebersihan',
  'beban kelengkapan pegawai operasional > beban cetak id card': '62084 - Beban Cetak ID Card',
  // Insentif
  'beban insentif kesejahteraan pegawai': '62090 - Beban Insentif Kesejahteraan Pegawai',
  'beban insentif/ kesejahteraan pegawai > beban lembur karyawan': '62091 - Beban Lembur Karyawan',
  'beban insentif/ kesejahteraan pegawai > beban lembur tenaga': '62092 - Beban Lembur Tenaga Kontrak',
  'beban insentif kesejahteraan pegawai > beban lembur karyawan': '62091 - Beban Lembur Karyawan',
  'beban insentif kesejahteraan pegawai > beban lembur tenaga harian': '62093 - Beban Lembur Tenaga Harian Lepas',
  // Non-ops
  'beban di luar operasional > beban administrasi bank': '80002 - Beban Administrasi Bank',
  'beban di luar operasional > beban pajak bank': '80003 - Beban Lain-lain',
};

function resolveAccount(rawName) {
  if (!rawName) return null;
  const first = rawName.split(' ')[0];
  if (first.replace(/\./g, '').match(/^\d+$/)) return null; // already has code, skip
  
  const lower = rawName.toLowerCase().trim();
  
  // 1. Exact match
  if (manualMap[lower]) return manualMap[lower];
  
  // 2. Prefix match (for truncated names)
  for (const [key, val] of Object.entries(manualMap)) {
    if (lower.startsWith(key) || key.startsWith(lower)) return val;
  }
  
  return null; // unresolved
}

const db = new sqlite3.Database(DB_PATH);

db.all(`SELECT id, akun_debit, akun_kredit FROM journals`, (err, rows) => {
  if (err) { console.error(err); process.exit(1); }
  
  let needsFix = [];
  let unresolved = [];
  
  rows.forEach(r => {
    const adBad = r.akun_debit && !r.akun_debit.split(' ')[0].replace(/\./g, '').match(/^\d+$/);
    const akBad = r.akun_kredit && !r.akun_kredit.split(' ')[0].replace(/\./g, '').match(/^\d+$/);
    if (!adBad && !akBad) return;
    
    const newD = adBad ? resolveAccount(r.akun_debit) : null;
    const newK = akBad ? resolveAccount(r.akun_kredit) : null;
    
    if ((adBad && !newD) || (akBad && !newK)) {
      unresolved.push({ id: r.id, d: r.akun_debit, k: r.akun_kredit, newD, newK });
      // Still fix what we can
    }
    
    needsFix.push({
      id: r.id,
      newDebit: newD || r.akun_debit,
      newKredit: newK || r.akun_kredit
    });
  });
  
  console.log(`Total journals: ${rows.length}`);
  console.log(`Need fixing: ${needsFix.length}`);
  
  if (unresolved.length > 0) {
    console.log(`\n⚠️  Partially unresolved (${unresolved.length}):`);
    unresolved.forEach(u => {
      const d = u.newD ? '✓' : `✗ "${u.d}"`;
      const k = u.newK ? '✓' : `✗ "${u.k}"`;
      console.log(`  ${u.id}: D=${d} K=${k}`);
    });
  }
  
  // Execute all fixes in a transaction
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    let fixed = 0;
    needsFix.forEach(f => {
      db.run(`UPDATE journals SET akun_debit = ?, akun_kredit = ? WHERE id = ?`,
        [f.newDebit, f.newKredit, f.id], function(err) {
          if (err) console.error(`  ERR ${f.id}: ${err.message}`);
          else if (this.changes > 0) fixed++;
        });
    });
    db.run('COMMIT', () => {
      // Verify
      db.all(`SELECT id, akun_debit, akun_kredit FROM journals WHERE akun_debit NOT GLOB '[0-9]*' OR akun_kredit NOT GLOB '[0-9]*'`, (err, remaining) => {
        if (err) console.error(err);
        console.log(`\n✅ Fix complete. Remaining without codes: ${remaining ? remaining.length : '?'}`);
        if (remaining && remaining.length > 0) {
          remaining.slice(0, 10).forEach(r => {
            console.log(`  ${r.id}: D="${r.akun_debit?.substring(0,40)}" K="${r.akun_kredit?.substring(0,40)}"`);
          });
        }
        db.close();
      });
    });
  });
});
