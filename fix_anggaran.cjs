const db = require('./server/db/database.cjs');
const sampleData = require('./src/data/sampleData.json');

db.serialize(() => {
  db.run("DELETE FROM anggaran", (err) => {
    if (err) return console.error(err);
    
    const data = sampleData['anggaran'];
    if (!data || data.length === 0) return console.log('No anggaran data found');
    
    const keys = Object.keys(data[0]);
    const placeholders = keys.map(() => '?').join(', ');
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO anggaran (${keys.join(', ')})
      VALUES (${placeholders})
    `);
    
    data.forEach((item, index) => {
      if (!item.kode || item.kode === '') {
        item.kode = `ANG-${item.kategori}-${index}`;
      }
      const values = keys.map(key => item[key]);
      stmt.run(values);
    });
    
    stmt.finalize(() => {
      db.get("SELECT COUNT(*) AS count FROM anggaran", (err, row) => {
        console.log("Anggaran rows inserted:", row.count);
      });
    });
  });
});
