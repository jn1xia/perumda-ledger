/**
 * fix_feb_sum_entries.cjs
 * Corrects the SUM- journal entries for February 2026 to match
 * the official LABA RUGI FEB 2026 figures from the Excel.
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');

function dbRun(db, sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function(e) { e ? rej(e) : res(this) }));
}
function dbGet(db, sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
}

// Official figures from LABA RUGI FEB 2026 sheet
const OFFICIAL_FEB = [
  // Revenue (kredit side)
  { id: 'SUM-2026-02-41000', tanggal: '2026-02-28', akun_debit: '11103 Bank Kalsel', akun_kredit: '41000 Pendapatan Bisnis Utama',         debit: 449943403,      kredit: 449943403 },
  { id: 'SUM-2026-02-42000', tanggal: '2026-02-28', akun_debit: '11103 Bank Kalsel', akun_kredit: '42000 Pendapatan Bisnis Lainnya',        debit: 165864000,      kredit: 165864000 },
  // BPP
  { id: 'SUM-2026-02-51000', tanggal: '2026-02-28', akun_debit: '51000 Beban Pokok Penjualan (Bapok & Gerai Inflasi)', akun_kredit: '11103 Bank Kalsel', debit: 21464000, kredit: 21464000 },
  { id: 'SUM-2026-02-51001', tanggal: '2026-02-28', akun_debit: '51001 Beban Pokok Penjualan (Gas LPG)', akun_kredit: '11103 Bank Kalsel', debit: 4575000, kredit: 4575000 },
  // Beban Umum & Admin (61xxx)
  { id: 'SUM-2026-02-61010', tanggal: '2026-02-28', akun_debit: '61010 Beban Gaji',                                     akun_kredit: '11103 Bank Kalsel', debit: 180773583,      kredit: 180773583 },
  { id: 'SUM-2026-02-61020', tanggal: '2026-02-28', akun_debit: '61020 Beban Tunjangan Pegawai Umum',                   akun_kredit: '11103 Bank Kalsel', debit: 59082074,       kredit: 59082074 },
  { id: 'SUM-2026-02-61030', tanggal: '2026-02-28', akun_debit: '61030 Beban Kelengkapan Pegawai Kantor',               akun_kredit: '11103 Bank Kalsel', debit: 3060000,        kredit: 3060000 },
  { id: 'SUM-2026-02-61040', tanggal: '2026-02-28', akun_debit: '61040 Beban Alat Tulis Kantor',                        akun_kredit: '11103 Bank Kalsel', debit: 22304731,       kredit: 22304731 },
  { id: 'SUM-2026-02-61050', tanggal: '2026-02-28', akun_debit: '61050 Beban Telepon/Listrik/Air/Wifi/Website',         akun_kredit: '11103 Bank Kalsel', debit: 10405927,       kredit: 10405927 },
  { id: 'SUM-2026-02-61060', tanggal: '2026-02-28', akun_debit: '61060 Beban Konsumsi Rapat dan Tamu',                  akun_kredit: '11103 Bank Kalsel', debit: 7115389,        kredit: 7115389 },
  { id: 'SUM-2026-02-61070', tanggal: '2026-02-28', akun_debit: '61070 Beban Perlengkapan dan Pemeliharaan Kantor',     akun_kredit: '11103 Bank Kalsel', debit: 20713284,       kredit: 20713284 },
  { id: 'SUM-2026-02-61080', tanggal: '2026-02-28', akun_debit: '61080 Beban Bahan Bakar Minyak',                       akun_kredit: '11103 Bank Kalsel', debit: 58697947,       kredit: 58697947 },
  { id: 'SUM-2026-02-61090', tanggal: '2026-02-28', akun_debit: '61090 Beban Perjalanan Dinas',                         akun_kredit: '11103 Bank Kalsel', debit: 225000,         kredit: 225000 },
  { id: 'SUM-2026-02-61100', tanggal: '2026-02-28', akun_debit: '61100 Beban Pendidikan Pelatihan dan Bimbingan Teknik',akun_kredit: '11103 Bank Kalsel', debit: 3000000,        kredit: 3000000 },
  { id: 'SUM-2026-02-61110', tanggal: '2026-02-28', akun_debit: '61110 Beban Sewa Kendaraan',                           akun_kredit: '11103 Bank Kalsel', debit: 31799999,       kredit: 31799999 },
  { id: 'SUM-2026-02-61130', tanggal: '2026-02-28', akun_debit: '61130 Beban Penyusutan Aktiva Tetap',                  akun_kredit: '11103 Bank Kalsel', debit: 291894195.005,  kredit: 291894195.005 },
  { id: 'SUM-2026-02-61140', tanggal: '2026-02-28', akun_debit: '61140 Beban Umum Lainnya',                             akun_kredit: '11103 Bank Kalsel', debit: 44865000,       kredit: 44865000 },
  // Beban Operasional (62xxx)
  { id: 'SUM-2026-02-62010', tanggal: '2026-02-28', akun_debit: '62010 Beban Pemeliharaan Kendaraan Operasional',       akun_kredit: '11103 Bank Kalsel', debit: 28766980,       kredit: 28766980 },
  { id: 'SUM-2026-02-62020', tanggal: '2026-02-28', akun_debit: '62020 Beban Pemeliharaan Bangunan Pasar',              akun_kredit: '11103 Bank Kalsel', debit: 13750000,       kredit: 13750000 },
  { id: 'SUM-2026-02-62030', tanggal: '2026-02-28', akun_debit: '62030 Beban Pemeliharaan Kebersihan Pasar',            akun_kredit: '11103 Bank Kalsel', debit: 1765000,        kredit: 1765000 },
  { id: 'SUM-2026-02-62040', tanggal: '2026-02-28', akun_debit: '62040 Beban Pelayanan dan Pemasaran',                  akun_kredit: '11103 Bank Kalsel', debit: 1750000,        kredit: 1750000 },
  { id: 'SUM-2026-02-62050', tanggal: '2026-02-28', akun_debit: '62050 Beban Barang Cetakan',                           akun_kredit: '11103 Bank Kalsel', debit: 1271000,        kredit: 1271000 },
  { id: 'SUM-2026-02-62060', tanggal: '2026-02-28', akun_debit: '62060 Beban Honor Tenaga Kontrak dan Harian Lepas',    akun_kredit: '11103 Bank Kalsel', debit: 202964979,      kredit: 202964979 },
  { id: 'SUM-2026-02-62070', tanggal: '2026-02-28', akun_debit: '62070 Beban Tunjangan Pegawai Operasional',            akun_kredit: '11103 Bank Kalsel', debit: 24941979,       kredit: 24941979 },
  { id: 'SUM-2026-02-62090', tanggal: '2026-02-28', akun_debit: '62090 Beban Insentif Kesejahteraan Pegawai',           akun_kredit: '11103 Bank Kalsel', debit: 6250000,        kredit: 6250000 },
  // Note: 62080 (Beban Kelengkapan Pegawai Operasional) and 62100 (Beban Keamanan) are in the Excel
  // but the official LR shows total Beban Ops = 281,459,938. Let's compute: 28766980+13750000+1765000+1750000+1271000+202964979+24941979+6250000 = 281,459,938 ✅
  // Non-operating
  { id: 'SUM-2026-02-70001', tanggal: '2026-02-28', akun_debit: '11103 Bank Kalsel', akun_kredit: '70001 Pendapatan Bunga',                debit: 17104222.65,    kredit: 17104222.65 },
  { id: 'SUM-2026-02-70004', tanggal: '2026-02-28', akun_debit: '11103 Bank Kalsel', akun_kredit: '70004 Pendapatan Lain-lain',             debit: 307,            kredit: 307 },
  { id: 'SUM-2026-02-80001', tanggal: '2026-02-28', akun_debit: '80001 Beban Pajak Bank',                               akun_kredit: '11103 Bank Kalsel', debit: 3420845.53,     kredit: 3420845.53 },
  { id: 'SUM-2026-02-80002', tanggal: '2026-02-28', akun_debit: '80002 Beban Administrasi Bank',                        akun_kredit: '11103 Bank Kalsel', debit: 172500,         kredit: 172500 },
];

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  
  console.log('=== Fixing Feb 2026 SUM Journal Entries ===\n');
  
  // Delete all existing SUM-2026-02- entries
  const del = await dbRun(db, "DELETE FROM journals WHERE id LIKE 'SUM-2026-02-%'");
  console.log(`Deleted ${del.changes} old SUM-2026-02- entries`);
  
  // Insert official entries
  let inserted = 0;
  for (const e of OFFICIAL_FEB) {
    await dbRun(db,
      `INSERT INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'posted')`,
      [e.id, e.tanggal, e.akun_debit, e.akun_kredit, e.debit, e.kredit, 'Import Feb 2026']
    );
    inserted++;
  }
  console.log(`Inserted ${inserted} official SUM entries\n`);
  
  // Validate
  console.log('=== VALIDATION vs Official Excel LR ===');
  const checks = [
    { sql: "SELECT sum(kredit) t FROM journals WHERE tanggal LIKE '2026-02%' AND akun_kredit LIKE '41%'", lbl: 'Pendapatan Utama (41)', exp: 449943403 },
    { sql: "SELECT sum(kredit) t FROM journals WHERE tanggal LIKE '2026-02%' AND akun_kredit LIKE '42%'", lbl: 'Pendapatan Lainnya (42)', exp: 165864000 },
    { sql: "SELECT sum(debit) t FROM journals WHERE tanggal LIKE '2026-02%' AND akun_debit LIKE '51%'",   lbl: 'BPP', exp: 26039000 },
    { sql: "SELECT sum(debit) t FROM journals WHERE tanggal LIKE '2026-02%' AND akun_debit LIKE '61%'",   lbl: 'Beban Admin (61)', exp: 733937129 },
    { sql: "SELECT sum(debit) t FROM journals WHERE tanggal LIKE '2026-02%' AND akun_debit LIKE '62%'",   lbl: 'Beban Ops (62)', exp: 281459938 },
  ];
  
  for (const c of checks) {
    const row = await dbGet(db, c.sql);
    const val = row.t || 0;
    const diff = Math.abs(val - c.exp);
    const ok = diff < 1 ? '✅' : (diff < 2000000 ? '⚠️ ' : '❌');
    console.log(`${ok} ${c.lbl.padEnd(28)} ${Math.round(val).toLocaleString().padStart(16)} | Expected: ${c.exp.toLocaleString()}`);
  }
  
  const [p41, p42, bpp, b61, b62] = await Promise.all(checks.map(c => dbGet(db, c.sql)));
  const labaUsaha = ((p41.t||0) + (p42.t||0)) - (bpp.t||0) - (b61.t||0) - (b62.t||0);
  console.log(`\n   Laba Usaha: ${Math.round(labaUsaha).toLocaleString()} | Expected: -399,589,664`);
  
  db.close();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
