const db = require('./database.cjs');
const { initDatabase } = require('./schema.cjs');

function flattenCOA(nodes, result = [], parentCode = null) {
  if (!nodes) return result;
  nodes.forEach(n => {
    result.push({
      code: n.code,
      name: n.name,
      type: n.type || 'posting',
      category: n.category,
      parent_code: parentCode,
      saldo_awal: n.saldoAwal || 0,
      kode_sortir: n.kodeSortir || '',
      kode_departemen: n.kodeDepartemen || ''
    });
    if (n.children) flattenCOA(n.children, result, n.code);
  });
  return result;
}

function seedDatabase() {
  // Promisify db methods
  const dbRun = (sql, params) => new Promise((resolve, reject) => {
    db.run(sql, params || [], function(err) { err ? reject(err) : resolve(this); });
  });
  const dbGet = (sql) => new Promise((resolve, reject) => {
    db.get(sql, (err, row) => { err ? reject(err) : resolve(row); });
  });

  return (async () => {
    // Force re-seed to push correct COA/journal data from Excel
    console.log("Seeding database from sample data...");
    
    const sampleData = require('../../src/data/sampleData.json');
    
    // Step 1: Clear all tables
    const tables = ['journals','coa','assets','inventory','bbm','piutang','hutang','anggaran','rekonsiliasi','pengaturan','locked_periods'];
    for (const t of tables) {
      await dbRun(`DELETE FROM ${t}`);
    }
    await dbRun("UPDATE counters SET value = 0 WHERE key IN ('nextJournal','nextAsset','nextBBM','nextPiutang','nextHutang')");
    console.log("All tables cleared.");

    // Step 2: COA — insert hierarchy parents then posting accounts  
    const hierarchy = [
      { code:'1', name:'ASET', type:'parent', category:'Aset', parent_code:null, saldo_awal:0 },
      { code:'11', name:'Aset Lancar', type:'parent', category:'Aset', parent_code:'1', saldo_awal:0 },
      { code:'12', name:'Aset Tidak Lancar', type:'parent', category:'Aset', parent_code:'1', saldo_awal:0 },
      { code:'13', name:'Aset Lainnya', type:'parent', category:'Aset', parent_code:'1', saldo_awal:0 },
      { code:'2', name:'KEWAJIBAN', type:'parent', category:'Kewajiban', parent_code:null, saldo_awal:0 },
      { code:'21', name:'Kewajiban Jangka Pendek', type:'parent', category:'Kewajiban', parent_code:'2', saldo_awal:0 },
      { code:'22', name:'Kewajiban Jangka Panjang', type:'parent', category:'Kewajiban', parent_code:'2', saldo_awal:0 },
      { code:'3', name:'EKUITAS', type:'parent', category:'Ekuitas', parent_code:null, saldo_awal:0 },
      { code:'4', name:'PENDAPATAN', type:'parent', category:'Pendapatan', parent_code:null, saldo_awal:0 },
      { code:'41', name:'Pendapatan Bisnis Utama', type:'parent', category:'Pendapatan', parent_code:'4', saldo_awal:0 },
      { code:'42', name:'Pendapatan Bisnis Lainnya', type:'parent', category:'Pendapatan', parent_code:'4', saldo_awal:0 },
      { code:'5', name:'BEBAN POKOK PENJUALAN', type:'parent', category:'HPP', parent_code:null, saldo_awal:0 },
      { code:'6', name:'BEBAN', type:'parent', category:'Beban', parent_code:null, saldo_awal:0 },
      { code:'61', name:'Beban Administrasi & Umum', type:'parent', category:'Beban', parent_code:'6', saldo_awal:0 },
      { code:'62', name:'Beban Operasional', type:'parent', category:'Beban', parent_code:'6', saldo_awal:0 },
      { code:'7', name:'PENDAPATAN LAIN', type:'parent', category:'Pendapatan', parent_code:null, saldo_awal:0 },
      { code:'8', name:'BEBAN LAIN', type:'parent', category:'Beban', parent_code:null, saldo_awal:0 },
      { code:'9', name:'PAJAK', type:'parent', category:'Beban', parent_code:null, saldo_awal:0 },
    ];
    const parentCodes = new Set(hierarchy.map(h => h.code));
    
    // Insert hierarchy parents
    for (const h of hierarchy) {
      await dbRun('INSERT OR REPLACE INTO coa (code, name, type, category, parent_code, saldo_awal) VALUES (?,?,?,?,?,?)',
        [h.code, h.name, h.type, h.category, h.parent_code, h.saldo_awal]);
    }
    
    // Insert posting accounts from sampleData
    const coaData = sampleData.coa || [];
    for (const a of coaData) {
      if (parentCodes.has(a.code)) continue; // skip duplicates from hierarchy
      let pc = a.parent_code;
      if (!pc && a.code.length >= 2) pc = a.code.substring(0, 2);
      if (pc && !parentCodes.has(pc) && a.code.length >= 4) pc = a.code.substring(0, 1);
      await dbRun('INSERT OR REPLACE INTO coa (code, name, type, category, parent_code, saldo_awal) VALUES (?,?,?,?,?,?)',
        [a.code, a.name, a.type || 'posting', a.category, pc, a.saldo_awal || 0]);
    }
    const coaCount = await dbGet('SELECT COUNT(*) as c FROM coa');
    console.log(`COA seeded: ${coaCount.c} accounts`);

    // Step 3: Journals
    const journals = sampleData.journals || [];
    for (const j of journals) {
      await dbRun('INSERT OR REPLACE INTO journals (id, tanggal, keterangan, akun_debit, akun_kredit, debit, kredit, status, bukti) VALUES (?,?,?,?,?,?,?,?,?)',
        [j.id, j.tanggal, j.keterangan, j.akun_debit, j.akun_kredit, j.debit, j.kredit, j.status, j.bukti]);
    }
    console.log(`Journals seeded: ${journals.length}`);

    // Step 4: Assets
    const assets = sampleData.assets || [];
    for (const a of assets) {
      await dbRun(`INSERT OR REPLACE INTO assets (kode,nama,detail,kategori,tgl_perolehan,nilai_perolehan,penyusutan_per_tahun,penyusutan_per_bulan,beban_penyusutan_2025,nilai_penyusutan,nilai_buku,beban_penyusutan_maret_2026,akum_penyusutan_maret_2026,nilai_buku_maret_2026,umur_manfaat,keterangan) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [a.kode,a.nama,a.detail||'',a.kategori,a.tgl_perolehan,a.nilai_perolehan||0,a.penyusutan_per_tahun||0,a.penyusutan_per_bulan||0,a.beban_penyusutan_2025||0,a.nilai_penyusutan||0,a.nilai_buku||0,a.beban_penyusutan_maret_2026||0,a.akum_penyusutan_maret_2026||0,a.nilai_buku_maret_2026||0,a.umur_manfaat||'',a.keterangan||'']);
    }
    console.log(`Assets seeded: ${assets.length}`);

    // Step 5: Anggaran
    const anggaran = sampleData.anggaran || [];
    for (let i = 0; i < anggaran.length; i++) {
      const a = anggaran[i];
      const kode = a.kode || `ANG-${a.kategori||'cat'}-${i}`;
      await dbRun('INSERT OR IGNORE INTO anggaran (kode,nama,kategori,anggaran_awal,target_bulan,sd_bln_lalu,bulan_ini,realisasi,persentase,is_total) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [kode, a.nama, a.kategori, a.anggaran_awal||0, a.target_bulan||0, a.sd_bln_lalu||0, a.bulan_ini||0, a.realisasi||0, a.persentase||0, a.is_total||0]);
    }
    console.log(`Anggaran seeded: ${anggaran.length}`);

    // Step 6: Pengaturan
    const pengaturan = sampleData.pengaturan || {};
    for (const [key, val] of Object.entries(pengaturan)) {
      await dbRun('INSERT OR REPLACE INTO pengaturan (key, value) VALUES (?, ?)', [key, JSON.stringify(val)]);
    }
    console.log("Pengaturan seeded.");

    console.log("✅ Database seeding completed successfully with Excel data.");
  })();
}


// Run if called directly
if (require.main === module) {
  initDatabase()
    .then(() => seedDatabase())
    .then(() => {
      console.log("Database ready. Run 'npm run server' to start the API server.");
      process.exit(0);
    })
    .catch(err => {
      console.error("Failed to initialize database:", err);
      process.exit(1);
    });
}

function fixAnggaranTable() {
  return new Promise((resolve, reject) => {
    const db = require('./database.cjs');
    db.get("SELECT COUNT(*) as count FROM anggaran", (err, row) => {
      if (err) return reject(err);
      if (row && row.count > 10) {
        return resolve(); // Looks fine
      }
      console.log("Fixing corrupted anggaran table...");
      db.run("DELETE FROM anggaran", (err) => {
        if (err) return reject(err);
        const sampleData = require('../../src/data/sampleData.json');
        const data = sampleData['anggaran'];
        if (!data || data.length === 0) return resolve();
        
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO anggaran (kode, nama, kategori, anggaran_awal, target_bulan, sd_bln_lalu, bulan_ini, realisasi, persentase, is_total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        let pending = data.length;
        data.forEach((item, index) => {
          if (!item.kode || item.kode === '') item.kode = `ANG-${item.kategori || 'cat'}-${index}`;
          stmt.run(
            item.kode, item.nama, item.kategori,
            item.anggaran_awal || 0, item.target_bulan || 0, item.sd_bln_lalu || 0,
            item.bulan_ini || 0, item.realisasi || 0, item.persentase || 0, item.is_total || 0,
            (err) => {
              if (err) console.error("Error inserting anggaran:", err);
              pending--;
              if (pending === 0) { stmt.finalize(); resolve(); }
            }
          );
        });
      });
    });
  });
}

module.exports = { initDatabase, seedDatabase, fixAnggaranTable };
