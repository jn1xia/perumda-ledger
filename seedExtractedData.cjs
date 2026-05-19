/**
 * seedExtractedData.cjs — Import extracted data into the server SQLite DB.
 * Uses the same sqlite3 module as the server.
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const DATA_PATH = path.join(__dirname, 'src', 'data', 'extractedAllData.json');

if (!fs.existsSync(DB_PATH)) {
  console.error('ERROR: Database not found. Start server first.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const db = new sqlite3.Database(DB_PATH);

function run(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params || [], function(err) { err ? reject(err) : resolve(this); });
  });
}
function get(sql) {
  return new Promise((resolve, reject) => {
    db.get(sql, (err, row) => { err ? reject(err) : resolve(row); });
  });
}
function all(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => { err ? reject(err) : resolve(rows); });
  });
}

async function seed() {
  console.log('=== Seeding extracted data into DB ===\n');
  await run('PRAGMA journal_mode = WAL');

  // 1. Journals
  const before = await get('SELECT COUNT(*) as c FROM journals');
  console.log(`Existing journals: ${before.c}`);

  const stmt = db.prepare(`INSERT OR REPLACE INTO journals 
    (id, tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti) 
    VALUES (?,?,?,?,?,?,?,?,?)`);

  for (const j of data.allJournals) {
    await new Promise((resolve, reject) => {
      stmt.run(j.id, j.tanggal, j.keterangan, j.debit, j.kredit, j.status,
        j.akun_debit, j.akun_kredit, j.bukti || '', err => err ? reject(err) : resolve());
    });
  }
  await new Promise(r => stmt.finalize(r));

  const after = await get('SELECT COUNT(*) as c FROM journals');
  console.log(`Journals after seed: ${after.c} (added ${after.c - before.c})`);

  // 2. Anggaran
  const am = data.anggaranMaster;
  const angStmt = db.prepare(`INSERT OR REPLACE INTO anggaran 
    (kode, nama, kategori, bulan, anggaran_awal, target_bulan, sd_bln_lalu, bulan_ini, realisasi, persentase, is_total) 
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

  let angCount = 0;
  const seedKat = async (items, kategori, prefix) => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const kode = it.kode || `${prefix}${i+1}`;
      await new Promise((resolve, reject) => {
        angStmt.run(kode, it.uraian, kategori, 4, it.paguTahun, Math.round(it.paguTahun/12),
          0, it.realisasi, it.realisasi, it.pct || 0, 0, err => err ? reject(err) : resolve());
      });
      angCount++;
    }
  };

  await seedKat(am.investasi, 'bebanInvestasi', 'INV.');
  await seedKat(am.umum, 'bebanUmum', 'UMM.');
  await seedKat(am.operasional, 'bebanOperasional', 'OPS.');
  await new Promise(r => angStmt.finalize(r));
  console.log(`Anggaran seeded: ${angCount} items`);

  // 3. Summary
  const byMonth = await all("SELECT substr(tanggal,1,7) as ym, COUNT(*) as c FROM journals GROUP BY ym ORDER BY ym");
  console.log('\nJournals by month:');
  byMonth.forEach(r => console.log(`  ${r.ym}: ${r.c}`));

  const angTotal = await get('SELECT COUNT(*) as c FROM anggaran');
  console.log(`\nTotal anggaran: ${angTotal.c}`);
  console.log('\n=== DONE ===');
}

seed()
  .then(() => db.close())
  .catch(err => { console.error(err); db.close(); process.exit(1); });
