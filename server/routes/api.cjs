const db = require('../db/database.cjs');
const express = require('express');
const router = express.Router();
const counters = require('./counters.cjs');

// === JOURNALS ===
router.get('/journals', (req, res) => {
  db.all("SELECT * FROM journals ORDER BY tanggal DESC, created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/journals/:id', (req, res) => {
  db.get("SELECT * FROM journals WHERE id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || null);
  });
});

router.post('/journals', async (req, res) => {
  const { id, tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti } = req.body;
  if (!tanggal || !keterangan || !akun_debit || !akun_kredit) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  let journalId = id;
  if (!id) {
    const nextNum = await counters.next('nextJournal');
    journalId = `JV-2026-${String(nextNum).padStart(3, '0')}`;
  }
  const debitVal = debit !== undefined ? debit : (kredit !== undefined ? kredit : 0);
  const kreditVal = kredit !== undefined ? kredit : (debit !== undefined ? debit : 0);
  db.run(`
    INSERT OR REPLACE INTO journals (id, tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
   `, [journalId, tanggal, keterangan, debitVal, kreditVal, status || 'pending', akun_debit, akun_kredit, bukti || ''], function(err) {
     if (err) return res.status(500).json({ error: err.message });
     res.json({ id: journalId, ...req.body });
   });
 });

router.post('/journals/bulk', (req, res) => {
  const journals = req.body.journals;
  
  if (!Array.isArray(journals)) {
    return res.status(400).json({ error: 'Expected an array of journals' });
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO journals (id, tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    
    Promise.all(journals.map(j => {
      return new Promise((resolve, reject) => {
        const debitVal = j.debit !== undefined ? j.debit : (j.kredit !== undefined ? j.kredit : 0);
        const kreditVal = j.kredit !== undefined ? j.kredit : (j.debit !== undefined ? j.debit : 0);
        stmt.run([j.id, j.tanggal, j.keterangan, debitVal, kreditVal, j.status || 'pending', j.akun_debit, j.akun_kredit, j.bukti || ''], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }))
    .then(() => {
      stmt.finalize();
      db.run("COMMIT", () => {
        res.json({ success: true, count: journals.length });
      });
    })
    .catch(err => {
      stmt.finalize();
      db.run("ROLLBACK", () => {
        res.status(500).json({ error: err.message || "Bulk insert failed" });
      });
    });
  });
});

router.put('/journals/:id', (req, res) => {
  const { tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti } = req.body;
  db.run(`
    UPDATE journals SET tanggal = ?, keterangan = ?, debit = ?, kredit = ?, status = ?,
      akun_debit = ?, akun_kredit = ?, bukti = ?, updated_at = datetime('now') WHERE id = ?
  `, [tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, ...req.body });
  });
});

router.delete('/journals/:id', (req, res) => {
  db.run("DELETE FROM journals WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

router.delete('/journals', (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'Month parameter required (YYYY-MM)' });
  db.run("DELETE FROM journals WHERE substr(tanggal, 1, 7) = ?", [month], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

router.post('/journals/approve/:id', (req, res) => {
  db.run("UPDATE journals SET status = 'posted', updated_at = datetime('now') WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, status: 'posted' });
  });
});

router.post('/journals/unapprove/:id', (req, res) => {
  db.run("UPDATE journals SET status = 'pending', updated_at = datetime('now') WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, status: 'pending' });
  });
});

// === COA ===
router.get('/coa', (req, res) => {
  db.all("SELECT * FROM coa ORDER BY code", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/coa', (req, res) => {
  const { code, name, type, category, parent_code, saldo_awal, kode_sortir, kode_departemen } = req.body;
  db.run(`
    INSERT INTO coa (code, name, type, category, parent_code, saldo_awal, kode_sortir, kode_departemen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [code, name, type || 'posting', category, parent_code, saldo_awal || 0, kode_sortir, kode_departemen], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, ...req.body });
  });
});

router.put('/coa/:code', (req, res) => {
  const { name, type, category, parent_code, saldo_awal, kode_sortir, kode_departemen } = req.body;
  db.run(`
    UPDATE coa SET name = ?, type = ?, category = ?, parent_code = ?, saldo_awal = ?, kode_sortir = ?, kode_departemen = ?
    WHERE code = ?
  `, [name, type, category, parent_code, saldo_awal, kode_sortir, kode_departemen, req.params.code], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ code: req.params.code, ...req.body });
  });
});

router.delete('/coa/:code', (req, res) => {
  db.run("DELETE FROM coa WHERE code = ?", [req.params.code], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === ASSETS ===
router.get('/assets', (req, res) => {
  db.all("SELECT * FROM assets ORDER BY kategori, nama", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/assets', async (req, res) => {
  const { kode, nama, detail, kategori, tgl_perolehan, nilai_perolehan, penyusutan_per_tahun,
          penyusutan_per_bulan, beban_penyusutan_2025, nilai_penyusutan, nilai_buku,
          beban_penyusutan_maret_2026, akum_penyusutan_maret_2026, nilai_buku_maret_2026,
          umur_manfaat, keterangan } = req.body;
  let assetCode = kode;
  if (!kode) {
    const nextNum = await counters.next('nextAsset');
    assetCode = `AT-${String(nextNum).padStart(3, '0')}`;
  }
  db.run(`
    INSERT OR REPLACE INTO assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [assetCode, nama, detail, kategori, tgl_perolehan, nilai_perolehan, penyusutan_per_tahun,
      penyusutan_per_bulan, beban_penyusutan_2025, nilai_penyusutan, nilai_buku,
      beban_penyusutan_maret_2026, akum_penyusutan_maret_2026, nilai_buku_maret_2026,
      umur_manfaat, keterangan], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ kode: assetCode, ...req.body });
  });
});

router.put('/assets/:kode', (req, res) => {
  const { nama, detail, kategori, tgl_perolehan, nilai_perolehan, penyusutan_per_tahun,
          penyusutan_per_bulan, beban_penyusutan_2025, nilai_penyusutan, nilai_buku,
          beban_penyusutan_maret_2026, akum_penyusutan_maret_2026, nilai_buku_maret_2026,
          umur_manfaat, keterangan } = req.body;
  db.run(`
    UPDATE assets SET nama = ?, detail = ?, kategori = ?, tgl_perolehan = ?, nilai_perolehan = ?, 
    penyusutan_per_tahun = ?, penyusutan_per_bulan = ?, beban_penyusutan_2025 = ?, nilai_penyusutan = ?, 
    nilai_buku = ?, beban_penyusutan_maret_2026 = ?, akum_penyusutan_maret_2026 = ?, nilai_buku_maret_2026 = ?, 
    umur_manfaat = ?, keterangan = ? WHERE kode = ?
  `, [nama, detail, kategori, tgl_perolehan, nilai_perolehan, penyusutan_per_tahun,
      penyusutan_per_bulan, beban_penyusutan_2025, nilai_penyusutan, nilai_buku,
      beban_penyusutan_maret_2026, akum_penyusutan_maret_2026, nilai_buku_maret_2026,
      umur_manfaat, keterangan, req.params.kode], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ kode: req.params.kode, ...req.body });
  });
});

router.delete('/assets/:kode', (req, res) => {
  db.run("DELETE FROM assets WHERE kode = ?", [req.params.kode], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === INVENTORY ===
router.get('/inventory', (req, res) => {
  db.all("SELECT * FROM inventory", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/inventory', (req, res) => {
  const { kode, nama, satuan, stok_awal, masuk, keluar, stok_akhir, harga_satuan, nilai_total } = req.body;
  db.run(`
    INSERT OR REPLACE INTO inventory VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [kode, nama, satuan, stok_awal, masuk, keluar, stok_akhir, harga_satuan, nilai_total], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ kode, ...req.body });
  });
});

router.delete('/inventory/:kode', (req, res) => {
  db.run("DELETE FROM inventory WHERE kode = ?", [req.params.kode], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === BBM ===
router.get('/bbm', (req, res) => {
  db.all("SELECT * FROM bbm ORDER BY tanggal DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/bbm', async (req, res) => {
  const { id, tanggal, tipe, keterangan, volume, harga, total } = req.body;
  let bbmId = id;
  if (!id) {
    const nextNum = await counters.next('nextBBM');
    bbmId = `BBM-${String(nextNum).padStart(3, '0')}`;
  }
  db.run(`
    INSERT OR REPLACE INTO bbm (id, tanggal, tipe, keterangan, volume, harga, total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [bbmId, tanggal, tipe, keterangan, volume, harga, total], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: bbmId, ...req.body });
  });
});

router.delete('/bbm/:id', (req, res) => {
  db.run("DELETE FROM bbm WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === PIUTANG ===
router.get('/piutang', (req, res) => {
  db.all("SELECT * FROM piutang ORDER BY tanggal DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/piutang', async (req, res) => {
  const { id, no_faktur, tanggal, jatuh_tempo, pelanggan, keterangan, jumlah, terbayar, sisa, status } = req.body;
  let piId = id;
  if (!id) {
    const nextNum = await counters.next('nextPiutang');
    piId = `PI-${String(nextNum).padStart(3, '0')}`;
  }
  db.run(`
    INSERT OR REPLACE INTO piutang VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [piId, no_faktur, tanggal, jatuh_tempo, pelanggan, keterangan, jumlah, terbayar, sisa, status], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: piId, ...req.body });
  });
});

router.put('/piutang/:id', (req, res) => {
  const { no_faktur, tanggal, jatuh_tempo, pelanggan, keterangan, jumlah, terbayar, sisa, status } = req.body;
  db.run(`
    UPDATE piutang SET no_faktur = ?, tanggal = ?, jatuh_tempo = ?, pelanggan = ?,
      keterangan = ?, jumlah = ?, terbayar = ?, sisa = ?, status = ? WHERE id = ?
  `, [no_faktur, tanggal, jatuh_tempo, pelanggan, keterangan, jumlah, terbayar, sisa, status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, ...req.body });
  });
});

router.delete('/piutang/:id', (req, res) => {
  db.run("DELETE FROM piutang WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === HUTANG ===
router.get('/hutang', (req, res) => {
  db.all("SELECT * FROM hutang ORDER BY tanggal DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/hutang', async (req, res) => {
  const { id, no_faktur, tanggal, jatuh_tempo, supplier, keterangan, jumlah, terbayar, sisa, status } = req.body;
  let huId = id;
  if (!id) {
    const nextNum = await counters.next('nextHutang');
    huId = `HU-${String(nextNum).padStart(3, '0')}`;
  }
  db.run(`
    INSERT OR REPLACE INTO hutang VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [huId, no_faktur, tanggal, jatuh_tempo, supplier, keterangan, jumlah, terbayar, sisa, status], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: huId, ...req.body });
  });
});

router.put('/hutang/:id', (req, res) => {
  const { no_faktur, tanggal, jatuh_tempo, supplier, keterangan, jumlah, terbayar, sisa, status } = req.body;
  db.run(`
    UPDATE hutang SET no_faktur = ?, tanggal = ?, jatuh_tempo = ?, supplier = ?,
      keterangan = ?, jumlah = ?, terbayar = ?, sisa = ?, status = ? WHERE id = ?
  `, [no_faktur, tanggal, jatuh_tempo, supplier, keterangan, jumlah, terbayar, sisa, status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, ...req.body });
  });
});

router.delete('/hutang/:id', (req, res) => {
  db.run("DELETE FROM hutang WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === ANGGARAN ===
router.get('/anggaran', (req, res) => {
  db.all("SELECT * FROM anggaran ORDER BY kode", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/anggaran', (req, res) => {
  const { kode, nama, kategori, anggaran_awal, realisasi, sisa, persentase } = req.body;
  db.run(`
    INSERT OR REPLACE INTO anggaran VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [kode, nama, kategori, anggaran_awal, realisasi, sisa, persentase], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ kode, ...req.body });
  });
});

router.delete('/anggaran/:kode', (req, res) => {
  db.run("DELETE FROM anggaran WHERE kode = ?", [req.params.kode], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === REKONSILIASI ===
router.get('/rekonsiliasi', (req, res) => {
  db.all("SELECT * FROM rekonsiliasi ORDER BY tanggal DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/rekonsiliasi', (req, res) => {
  const { tanggal, keterangan, ref, jumlah, tipe } = req.body;
  db.run(`
    INSERT INTO rekonsiliasi (tanggal, keterangan, ref, jumlah, tipe) VALUES (?, ?, ?, ?, ?)
  `, [tanggal, keterangan, ref, jumlah, tipe || 'buku'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, ...req.body });
  });
});

router.delete('/rekonsiliasi/:id', (req, res) => {
  db.run("DELETE FROM rekonsiliasi WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === PENGATURAN ===
router.get('/pengaturan', (req, res) => {
  db.all("SELECT * FROM pengaturan", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = {};
    rows.forEach(r => {
      try { settings[r.key] = JSON.parse(r.value); } catch(e) { settings[r.key] = r.value; }
    });
    res.json(settings);
  });
});

router.put('/pengaturan', (req, res) => {
  const stmt = db.prepare("INSERT OR REPLACE INTO pengaturan (key, value) VALUES (?, ?)");
  const entries = Object.entries(req.body);
  let completed = 0;
  let hasError = null;

  if (entries.length === 0) {
    stmt.finalize();
    return res.json({ success: true, updated: [] });
  }

  entries.forEach(([key, value]) => {
    stmt.run(key, JSON.stringify(value), (err) => {
      if (err) hasError = err;
      completed++;
      if (completed === entries.length) {
        stmt.finalize();
        if (hasError) {
          res.status(500).json({ error: hasError.message });
        } else {
          res.json({ success: true, updated: Object.keys(req.body) });
        }
      }
    });
  });
});

// === LOCKED PERIODS ===
router.get('/locked-periods', (req, res) => {
  db.all("SELECT period FROM locked_periods", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.period));
  });
});

router.post('/locked-periods', (req, res) => {
  const { period } = req.body;
  db.run("INSERT OR IGNORE INTO locked_periods (period) VALUES (?)", [period], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ period, locked: true });
  });
});

router.delete('/locked-periods/:period', (req, res) => {
  db.run("DELETE FROM locked_periods WHERE period = ?", [req.params.period], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ unlocked: true });
  });
});

// === RESET DATA ===
router.post('/reset', (req, res) => {
  db.serialize(() => {
    db.run("BEGIN TRANSACTION", (err) => {
      if (err) return res.status(500).json({ error: err.message });

      const tables = [
        'journals', 'coa', 'assets', 'inventory', 'bbm',
        'piutang', 'hutang', 'anggaran', 'rekonsiliasi',
        'pengaturan', 'locked_periods'
      ];

      let completed = 0;
      let hasError = false;

      tables.forEach(table => {
        db.run(`DELETE FROM ${table}`, (err) => {
          if (err) {
            hasError = err;
          }
          completed++;
          if (completed === tables.length) {
            if (hasError) {
              db.run("ROLLBACK", () => {
                res.status(500).json({ error: hasError.message });
              });
            } else {
              db.run("UPDATE counters SET value = 0 WHERE key IN ('nextJournal', 'nextAsset', 'nextBBM', 'nextPiutang', 'nextHutang')", (err2) => {
                if (err2) {
                  db.run("ROLLBACK", () => {
                    res.status(500).json({ error: err2.message });
                  });
                  return;
                }
                db.run("COMMIT", (err3) => {
                  if (err3) return res.status(500).json({ error: err3.message });
                  res.json({ success: true, message: 'All data reset' });
                });
              });
            }
          }
        });
      });
    });
  });
});

// === EXPORT ===
router.get('/export', (req, res) => {
  db.all("SELECT * FROM journals", (err, journals) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all("SELECT * FROM coa", (err2, coa) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ journals, coa });
    });
  });
});

module.exports = router;
