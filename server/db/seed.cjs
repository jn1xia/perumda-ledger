const db = require('./database.cjs');
const { initDatabase } = require('./schema.cjs');
const fs = require('fs');
const path = require('path');

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
  const dbRun = (sql, params) => new Promise((resolve, reject) => {
    db.run(sql, params || [], function(err) { err ? reject(err) : resolve(this); });
  });
  const dbGet = (sql) => new Promise((resolve, reject) => {
    db.get(sql, (err, row) => { err ? reject(err) : resolve(row); });
  });

  return (async () => {
    // Only seed if tables are empty — never overwrite existing data
    const journalCount = await dbGet('SELECT COUNT(*) as c FROM journals');
    const coaCount = await dbGet('SELECT COUNT(*) as c FROM coa');

    if (journalCount.c > 0 && coaCount.c > 0) {
      console.log(`Database already has data (${journalCount.c} journals, ${coaCount.c} COA). Skipping seed.`);
      return;
    }

    console.log("Seeding database from sample data (first-time setup)...");
    
    const sampleData = require('../../src/data/sampleData.json');
    
    // Load full journals (all months Jan-Apr 2026) from dedicated seed file if available
    // This file is generated from the full Excel-imported dataset
    let journalSeedData;
    const fullJournalPath = path.join(__dirname, '..', 'seed_all_journals.json');
    if (fs.existsSync(fullJournalPath)) {
      journalSeedData = JSON.parse(fs.readFileSync(fullJournalPath, 'utf-8'));
      console.log(`Loading full journal dataset: ${journalSeedData.length} journals (Jan-Apr 2026)`);
    } else {
      journalSeedData = sampleData.journals || [];
      console.log(`Loading sample journals: ${journalSeedData.length} journals`);
    }
    
    // COA — insert hierarchy parents then posting accounts  
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
    
    for (const h of hierarchy) {
      await dbRun('INSERT OR REPLACE INTO coa (code, name, type, category, parent_code, saldo_awal) VALUES (?,?,?,?,?,?)',
        [h.code, h.name, h.type, h.category, h.parent_code, h.saldo_awal]);
    }
    
    const coaData = sampleData.coa || [];
    for (const a of coaData) {
      if (parentCodes.has(a.code)) continue;
      let pc = a.parent_code;
      if (!pc && a.code.length >= 2) pc = a.code.substring(0, 2);
      if (pc && !parentCodes.has(pc) && a.code.length >= 4) pc = a.code.substring(0, 1);
      await dbRun('INSERT OR REPLACE INTO coa (code, name, type, category, parent_code, saldo_awal) VALUES (?,?,?,?,?,?)',
        [a.code, a.name, a.type || 'posting', a.category, pc, a.saldo_awal || 0]);
    }
    const finalCoa = await dbGet('SELECT COUNT(*) as c FROM coa');
    console.log(`COA seeded: ${finalCoa.c} accounts`);

    // Journals — use full 4-month dataset if available, else fall back to sampleData
    for (const j of journalSeedData) {
      await dbRun('INSERT OR REPLACE INTO journals (id, tanggal, keterangan, akun_debit, akun_kredit, debit, kredit, status, bukti) VALUES (?,?,?,?,?,?,?,?,?)',
        [j.id, j.tanggal, j.keterangan, j.akun_debit, j.akun_kredit, j.debit, j.kredit, j.status, j.bukti]);
    }
    console.log(`Journals seeded: ${journalSeedData.length}`);

    // Assets
    const assets = sampleData.assets || [];
    for (const a of assets) {
      await dbRun(`INSERT OR REPLACE INTO assets (kode,nama,detail,kategori,tgl_perolehan,nilai_perolehan,penyusutan_per_tahun,penyusutan_per_bulan,beban_penyusutan_2025,nilai_penyusutan,nilai_buku,beban_penyusutan_maret_2026,akum_penyusutan_maret_2026,nilai_buku_maret_2026,umur_manfaat,keterangan) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [a.kode,a.nama,a.detail||'',a.kategori,a.tgl_perolehan,a.nilai_perolehan||0,a.penyusutan_per_tahun||0,a.penyusutan_per_bulan||0,a.beban_penyusutan_2025||0,a.nilai_penyusutan||0,a.nilai_buku||0,a.beban_penyusutan_maret_2026||0,a.akum_penyusutan_maret_2026||0,a.nilai_buku_maret_2026||0,a.umur_manfaat||'',a.keterangan||'']);
    }
    console.log(`Assets seeded: ${assets.length}`);

    // Pengaturan
    const pengaturan = sampleData.pengaturan || {};
    for (const [key, val] of Object.entries(pengaturan)) {
      await dbRun('INSERT OR REPLACE INTO pengaturan (key, value) VALUES (?, ?)', [key, JSON.stringify(val)]);
    }
    console.log("Pengaturan seeded.");
    console.log("✅ Database initial seeding completed.");
  })();
}


// Run if called directly
if (require.main === module) {
  initDatabase()
    .then(() => seedDatabase())
    .then(() => fixAnggaranTable())
    .then(() => {
      console.log("Database ready.");
      process.exit(0);
    })
    .catch(err => {
      console.error("Failed to initialize database:", err);
      process.exit(1);
    });
}

/**
 * fixAnggaranTable — ensures the anggaran table has correct per-month data.
 * Uses server/seed_anggaran_monthly.json (exported from the real Excel-imported data).
 * Only re-seeds if per-month data is missing.
 */
function fixAnggaranTable() {
  return new Promise((resolve, reject) => {
    const db = require('./database.cjs');
    const path = require('path');
    const fs = require('fs');

    // Check if anggaran already has per-month data (bulan > 0)
    db.all("SELECT DISTINCT bulan FROM anggaran WHERE bulan > 0", (err, months) => {
      if (err) return reject(err);
      
      if (months && months.length >= 2) {
        console.log(`Anggaran OK: ${months.length} months of per-month data found.`);
        return resolve();
      }

      // Need to re-seed — look for the per-month seed file
      const seedFile = path.join(__dirname, '..', 'seed_anggaran_monthly.json');
      if (!fs.existsSync(seedFile)) {
        console.log("⚠️  No per-month anggaran seed file found (server/seed_anggaran_monthly.json). Skipping.");
        return resolve();
      }

      console.log("Fixing anggaran table with per-month data from seed file...");
      const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
      
      db.run("DELETE FROM anggaran", (delErr) => {
        if (delErr) return reject(delErr);
        
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO anggaran (kode, nama, kategori, bulan, anggaran_awal, target_bulan, sd_bln_lalu, bulan_ini, realisasi, persentase, is_total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        let pending = seedData.length;
        if (pending === 0) { stmt.finalize(); return resolve(); }
        
        seedData.forEach(item => {
          stmt.run(
            item.kode, item.nama, item.kategori, item.bulan || 0,
            item.anggaran_awal || 0, item.target_bulan || 0, item.sd_bln_lalu || 0,
            item.bulan_ini || 0, item.realisasi || 0, item.persentase || 0, item.is_total || 0,
            (err) => {
              if (err) console.error("Error inserting anggaran:", err);
              pending--;
              if (pending === 0) {
                stmt.finalize();
                console.log(`✅ Anggaran re-seeded: ${seedData.length} per-month records (${months ? months.length : 0} → 4 months)`);
                resolve();
              }
            }
          );
        });
      });
    });
  });
}
/**
 * seedReportData — ensures reference Neraca and Arus Kas data from Excel
 * is present in the database. Uses server/seed_report_data.json.
 * Only seeds if the tables are empty.
 */
function seedReportData() {
  return new Promise((resolve, reject) => {
    const db = require('./database.cjs');
    const path = require('path');
    const fs = require('fs');

    const seedFile = path.join(__dirname, '..', 'seed_report_data.json');
    if (!fs.existsSync(seedFile)) {
      console.log("⚠️  No report data seed file found (server/seed_report_data.json). Skipping.");
      return resolve();
    }

    db.get('SELECT COUNT(*) as c FROM report_neraca', (err, row) => {
      if (err) {
        console.log("report_neraca table not yet created, skipping report seed.");
        return resolve();
      }
      if (row && row.c > 0) {
        console.log(`Report data OK: ${row.c} neraca rows already present.`);
        return resolve();
      }

      console.log("Seeding reference report data from seed file...");
      const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));

      const { neraca, arusKas, labaRugi } = seedData;
      let pending = (neraca ? neraca.length : 0) + (arusKas ? arusKas.length : 0) + (labaRugi ? labaRugi.length : 0);
      if (pending === 0) return resolve();

      const stmtN = db.prepare('INSERT INTO report_neraca (period, sort_order, label, value, depth) VALUES (?, ?, ?, ?, ?)');
      const stmtCF = db.prepare('INSERT INTO report_arus_kas (period, sort_order, label, value, is_section) VALUES (?, ?, ?, ?, ?)');
      const stmtLR = db.prepare('INSERT INTO report_laba_rugi (period, sort_order, label, value, depth) VALUES (?, ?, ?, ?, ?)');

      const done = (err) => {
        if (err) console.error("Error seeding report data:", err);
        pending--;
        if (pending === 0) {
          stmtN.finalize();
          stmtCF.finalize();
          stmtLR.finalize();
          console.log(`✅ Report data seeded: ${neraca.length} neraca + ${arusKas.length} arus kas + ${(labaRugi || []).length} laba rugi rows`);
          resolve();
        }
      };

      (neraca || []).forEach(r => stmtN.run(r.period, r.sort_order, r.label, r.value, r.depth || 0, done));
      (arusKas || []).forEach(r => stmtCF.run(r.period, r.sort_order, r.label, r.value, r.is_section || 0, done));
      (labaRugi || []).forEach(r => stmtLR.run(r.period, r.sort_order, r.label, r.value, r.depth || 0, done));
    });
  });
}
/**
 * migrateJournalLines — ensures journal_lines table has the correct schema
 * and data. Detects old schema (missing tanggal/bukti columns) or stale data
 * (old 2-line format) and forces a full re-import from parent journals.
 */
function migrateJournalLines() {
  return new Promise((resolve, reject) => {
    const db = require('./database.cjs');

    // Check if journal_lines table has the tanggal column (new schema)
    db.all("PRAGMA table_info(journal_lines)", (err, cols) => {
      if (err || !cols) {
        console.log('journal_lines table not ready, skipping migration.');
        return resolve();
      }

      const colNames = cols.map(c => c.name);
      const hasNewSchema = colNames.includes('tanggal') && colNames.includes('bukti');

      if (!hasNewSchema) {
        // Old schema — drop and recreate
        console.log('journal_lines: Old schema detected (missing tanggal/bukti). Dropping and recreating...');
        db.run('DROP TABLE IF EXISTS journal_lines', (dropErr) => {
          if (dropErr) { console.error('Drop error:', dropErr); return resolve(); }
          db.run(`CREATE TABLE journal_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_id TEXT NOT NULL,
            line_order INTEGER NOT NULL DEFAULT 0,
            tanggal TEXT,
            bukti TEXT,
            akun_code TEXT,
            akun_name TEXT NOT NULL,
            sub_akun TEXT,
            debit REAL,
            kredit REAL,
            keterangan TEXT,
            FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE
          )`, (createErr) => {
            if (createErr) { console.error('Create error:', createErr); return resolve(); }
            db.run('CREATE INDEX IF NOT EXISTS idx_jlines_journal ON journal_lines(journal_id)', () => {
              doMigration(db, resolve);
            });
          });
        });
        return;
      }

      // New schema exists — check if data is present and correct
      db.get('SELECT COUNT(*) as c FROM journal_lines', (err2, row) => {
        if (err2 || !row) return resolve();
        
        // Check if we have enough lines (old format had ~1423, new should have ~1437)
        db.get("SELECT COUNT(*) as c FROM journals WHERE id LIKE 'XL-%'", (err3, jRow) => {
          if (err3 || !jRow) return resolve();
          
          // If lines exist and count looks right, skip
          if (row.c > 0 && row.c >= jRow.c * 2) {
            // Additionally verify multi-line transactions exist (not just 2-line fallback)
            db.get("SELECT COUNT(*) as c FROM journal_lines WHERE journal_id LIKE 'XL-%' GROUP BY journal_id HAVING COUNT(*) >= 3 LIMIT 1", (e4, multi) => {
              if (multi) {
                console.log(`journal_lines OK: ${row.c} lines, multi-line transactions present.`);
                return resolve();
              }
              // All are 2-line — stale data from old migration, force re-import
              console.log(`journal_lines: Stale data detected (${row.c} lines, no multi-line). Clearing and re-importing...`);
              db.run("DELETE FROM journal_lines", () => doMigration(db, resolve));
            });
            return;
          }
          
          if (row.c === 0) {
            console.log('journal_lines: Empty table, importing from journals...');
            doMigration(db, resolve);
          } else {
            console.log(`journal_lines OK: ${row.c} lines already present.`);
            resolve();
          }
        });
      });
    });
  });
}

// Helper: create basic 2-line journal_lines from parent journals
// (fallback for persistent volume — full multi-line comes from Docker build reimport)
function doMigration(db, resolve) {
  console.log('Migrating: Creating journal_lines from existing journal entries...');

  db.all("SELECT * FROM journals WHERE id LIKE 'XL-%' ORDER BY id", (err2, journals) => {
    if (err2 || !journals || journals.length === 0) {
      console.log('No XL-* journals found to migrate.');
      return resolve();
    }

    const stmt = db.prepare(`
      INSERT INTO journal_lines (journal_id, line_order, tanggal, bukti, akun_code, akun_name, sub_akun, debit, kredit, keterangan)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let pending = 0;

    journals.forEach(j => {
      const parseAkun = (raw) => {
        const s = raw || '';
        const gt = s.indexOf(' > ');
        let main = s, sub = '';
        if (gt >= 0) { main = s.slice(0, gt); sub = s.slice(gt + 3); }
        const sp = main.indexOf(' ');
        const code = sp > 0 ? main.slice(0, sp) : main;
        const name = sp > 0 ? main.slice(sp + 1) : main;
        return { code, name, sub };
      };

      const debitAcct = parseAkun(j.akun_debit);
      const kreditAcct = parseAkun(j.akun_kredit);

      pending++;
      stmt.run(j.id, 0, j.tanggal, j.bukti || '', debitAcct.code, debitAcct.name, debitAcct.sub || null,
        j.debit, null, j.keterangan || null, (e) => {
          if (e) console.error('Error inserting debit line:', e);
          pending--;
          if (pending === 0) { stmt.finalize(); finish(); }
        });

      pending++;
      stmt.run(j.id, 1, j.tanggal, j.bukti || '', kreditAcct.code, kreditAcct.name, kreditAcct.sub || null,
        null, j.kredit, j.keterangan || null, (e) => {
          if (e) console.error('Error inserting kredit line:', e);
          pending--;
          if (pending === 0) { stmt.finalize(); finish(); }
        });
    });

    function finish() {
      console.log(`✅ journal_lines migrated: ${journals.length} journals → ${journals.length * 2} lines (basic 2-line format)`);
      console.log('   Note: Full multi-line data comes from Docker build reimport');
      resolve();
    }
  });
}

module.exports = { initDatabase, seedDatabase, fixAnggaranTable, seedReportData, migrateJournalLines };
