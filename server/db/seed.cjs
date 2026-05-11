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
  return new Promise((resolve, reject) => {
    // Check if database already has data
    db.get("SELECT COUNT(*) as count FROM journals", (err, row) => {
      if (err) return reject(err);
      // Force seed for this update to ensure audit data and COA hierarchy are pushed
      const forceReSeed = true;
      if (!forceReSeed && row && row.count > 0) {
        console.log("Database already contains data, skipping seed.");
        return resolve();
      }

      console.log("Seeding database from sample data...");
      db.serialize(() => {
        db.run("BEGIN TRANSACTION", (err) => {
          if (err) return reject(err);

          // Load sample data from generated file
          const sampleData = require('../../src/data/sampleData.json');
          
          // Clear ALL existing data synchronously within serialize
          const tables = [
            'journals', 'coa', 'assets', 'inventory', 'bbm',
            'piutang', 'hutang', 'anggaran', 'rekonsiliasi',
            'pengaturan', 'locked_periods'
          ];
          
          tables.forEach(table => {
            db.run(`DELETE FROM ${table}`);
          });
        
          // Reset counters
          db.run("UPDATE counters SET value = 0 WHERE key IN ('nextJournal', 'nextAsset', 'nextBBM', 'nextPiutang', 'nextHutang')");
          
          console.log("Tables cleared, inserting seed data...");
        
        // Insert sample data
        let samplePending = Object.keys(sampleData).length;
        let sampleHasError = null;
        
        // Helper to heal COA data if it's flat
        const healCOA = (coa) => {
          const hierarchy = [
            { code: '1', name: 'ASET', type: 'parent', category: 'Aset' },
            { code: '11', name: 'Aset Lancar', type: 'parent', category: 'Aset', parent_code: '1' },
            { code: '12', name: 'Aset Tidak Lancar', type: 'parent', category: 'Aset', parent_code: '1' },
            { code: '2', name: 'KEWAJIBAN', type: 'parent', category: 'Kewajiban' },
            { code: '21', name: 'Kewajiban Jangka Pendek', type: 'parent', category: 'Kewajiban', parent_code: '2' },
            { code: '3', name: 'EKUITAS', type: 'parent', category: 'Ekuitas' },
            { code: '4', name: 'PENDAPATAN', type: 'parent', category: 'Pendapatan' },
            { code: '41', name: 'Pendapatan Bisnis Utama', type: 'parent', category: 'Pendapatan', parent_code: '4' },
            { code: '42', name: 'Pendapatan Bisnis Lainnya', type: 'parent', category: 'Pendapatan', parent_code: '4' },
            { code: '5', name: 'BEBAN POKOK PENJUALAN', type: 'parent', category: 'HPP' },
            { code: '6', name: 'BEBAN', type: 'parent', category: 'Beban' },
            { code: '61', name: 'Beban Administrasi & Umum', type: 'parent', category: 'Beban', parent_code: '6' },
            { code: '62', name: 'Beban Operasional', type: 'parent', category: 'Beban', parent_code: '6' },
            { code: '7', name: 'PENDAPATAN LAIN', type: 'parent', category: 'Pendapatan' },
            { code: '8', name: 'BEBAN LAIN', type: 'parent', category: 'Beban' },
            { code: '9', name: 'PAJAK', type: 'parent', category: 'Beban' }
          ];
          
          const result = [...hierarchy];
          const codes = new Set(hierarchy.map(h => h.code));
          
          coa.forEach(a => {
            if (codes.has(a.code)) return;
            let parent_code = a.parent_code;
            if (!parent_code) {
              if (a.code.length >= 2) parent_code = a.code.substring(0, 2);
              if (a.code.length >= 4) {
                // Check if 2-digit parent exists, else use 1-digit
                if (!hierarchy.find(h => h.code === a.code.substring(0,2))) {
                   parent_code = a.code.substring(0, 1);
                }
              }
            }
            result.push({ ...a, parent_code });
          });
          return result;
        };

        Object.keys(sampleData).forEach(tableName => {
          let data = sampleData[tableName];
          if (tableName === 'coa') data = healCOA(data);
          
          if (!Array.isArray(data)) {
            // Handle single object (like pengaturan)
            if (tableName === 'pengaturan') {
              const entries = Object.entries(data);
              let pendingEntries = entries.length;
              if (pendingEntries === 0) {
                samplePending--;
              } else {
                entries.forEach(([key, val]) => {
                  db.run(`INSERT OR REPLACE INTO pengaturan (key, value) VALUES (?, ?)`, [key, JSON.stringify(val)], (err) => {
                    if (err) sampleHasError = err;
                    pendingEntries--;
                    if (pendingEntries === 0) {
                      samplePending--;
                      if (samplePending === 0 && sampleHasError) {
                        db.run("ROLLBACK", () => reject(sampleHasError));
                      }
                    }
                  });
                });
              }
            } else {
              const keys = Object.keys(data);
              const values = keys.map(key => data[key]);
              const placeholders = keys.map(() => '?').join(', ');
              
              db.run(`
                INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')})
                VALUES (${placeholders})
              `, values, (err) => {
                if (err) sampleHasError = err;
                samplePending--;
                if (samplePending === 0 && sampleHasError) {
                  db.run("ROLLBACK", () => reject(sampleHasError));
                }
              });
            }
          } else if (data.length > 0) {
            // Handle array of objects
            if (tableName === 'anggaran') {
              // anggaran table has composite unique (kode, kategori) — use explicit columns
              const stmt = db.prepare(`
                INSERT OR IGNORE INTO anggaran (kode, nama, kategori, anggaran_awal, target_bulan, sd_bln_lalu, bulan_ini, realisasi, persentase, is_total)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);
              data.forEach((item, index) => {
                if (!item.kode || item.kode === '') item.kode = `ANG-${item.kategori || 'cat'}-${index}`;
                stmt.run(
                  item.kode, item.nama, item.kategori,
                  item.anggaran_awal || 0, item.target_bulan || 0, item.sd_bln_lalu || 0,
                  item.bulan_ini || 0, item.realisasi || 0, item.persentase || 0, item.is_total || 0,
                  (err) => { if (err) sampleHasError = err; }
                );
              });
              stmt.finalize(() => {
                samplePending--;
                if (samplePending === 0 && sampleHasError) db.run("ROLLBACK", () => reject(sampleHasError));
              });
            } else {
              const keys = Object.keys(data[0]);
              const placeholders = keys.map(() => '?').join(', ');
              const stmt = db.prepare(`
                INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')})
                VALUES (${placeholders})
              `);
              data.forEach((item) => {
                const values = keys.map(key => item[key]);
                stmt.run(values, (err) => { if (err) sampleHasError = err; });
              });
              stmt.finalize(() => {
                samplePending--;
                if (samplePending === 0 && sampleHasError) db.run("ROLLBACK", () => reject(sampleHasError));
              });
            }
          } else {
            // Empty array
            samplePending--;
            if (samplePending === 0 && sampleHasError) {
              db.run("ROLLBACK", () => reject(sampleHasError));
            }
          }
        });
        
        // Finalize
        setTimeout(() => {
          if (!sampleHasError && !tablesHasError) {
            db.run("COMMIT", (err) => {
              if (err) return reject(err);
              console.log("Database seeding completed with sample data from Excel files");
              resolve();
            });
          }
        }, 100);
      });
    });
  });
  });
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
