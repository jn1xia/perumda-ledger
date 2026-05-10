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
    db.serialize(() => {
      db.run("BEGIN TRANSACTION", (err) => {
        if (err) return reject(err);

        // Load sample data from generated file
        const sampleData = require('../../src/data/sampleData.json');
        
        // Clear existing data
        const tables = [
          'journals', 'coa', 'assets', 'inventory', 'bbm',
          'piutang', 'hutang', 'anggaran', 'rekonsiliasi',
          'pengaturan', 'locked_periods'
        ];
        
        let tablesPending = tables.length;
        let tablesHasError = null;
        
        tables.forEach(table => {
          db.run(`DELETE FROM ${table}`, (err) => {
            if (err) tablesHasError = err;
            tablesPending--;
            if (tablesPending === 0 && tablesHasError) {
              db.run("ROLLBACK", () => reject(tablesHasError));
            }
          });
        });
        
        // Reset counters
        db.run("UPDATE counters SET value = 0 WHERE key IN ('nextJournal', 'nextAsset', 'nextBBM', 'nextPiutang', 'nextHutang')", (err) => {
          if (err) reject(err);
        });
        
        // Insert sample data
        let samplePending = Object.keys(sampleData).length;
        let sampleHasError = null;
        
        Object.keys(sampleData).forEach(tableName => {
          const data = sampleData[tableName];
          
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
            const keys = Object.keys(data[0]);
            const placeholders = keys.map(() => '?').join(', ');
            
            const stmt = db.prepare(`
              INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')})
              VALUES (${placeholders})
            `);
            
            data.forEach(item => {
              const values = keys.map(key => item[key]);
              stmt.run(values, (err) => {
                if (err) sampleHasError = err;
              });
            });
            
            stmt.finalize(() => {
              samplePending--;
              if (samplePending === 0 && sampleHasError) {
                db.run("ROLLBACK", () => reject(sampleHasError));
              }
            });
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

module.exports = { initDatabase, seedDatabase };
