const db = require('./database.cjs');

// Initialize database schema
function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const statements = [
        // === JOURNALS TABLE ===
        `CREATE TABLE IF NOT EXISTS journals (
          id TEXT PRIMARY KEY,
          tanggal TEXT NOT NULL,
          keterangan TEXT,
          debit REAL NOT NULL DEFAULT 0,
          kredit REAL NOT NULL DEFAULT 0,
          status TEXT DEFAULT 'pending',
          akun_debit TEXT NOT NULL,
          akun_kredit TEXT NOT NULL,
          bukti TEXT,
          kode_anggaran TEXT,
          lines TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT (datetime('now'))
        )`,

        `CREATE INDEX IF NOT EXISTS idx_journals_tanggal ON journals(tanggal)`,
        `CREATE INDEX IF NOT EXISTS idx_journals_status ON journals(status)`,

        // === COA TABLE ===
        `CREATE TABLE IF NOT EXISTS coa (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          type TEXT DEFAULT 'posting',
          category TEXT,
          parent_code TEXT,
          saldo_awal REAL DEFAULT 0,
          kode_sortir TEXT,
          kode_departemen TEXT,
          FOREIGN KEY (parent_code) REFERENCES coa(code)
        )`,

        `CREATE INDEX IF NOT EXISTS idx_coa_code ON coa(code)`,
        `CREATE INDEX IF NOT EXISTS idx_coa_parent ON coa(parent_code)`,

        // === ASSETS TABLE ===
        `CREATE TABLE IF NOT EXISTS assets (
          kode TEXT PRIMARY KEY,
          nama TEXT NOT NULL,
          detail TEXT,
          kategori TEXT,
          tgl_perolehan TEXT,
          nilai_perolehan REAL DEFAULT 0,
          penyusutan_per_tahun REAL DEFAULT 0,
          penyusutan_per_bulan REAL DEFAULT 0,
          beban_penyusutan_2025 REAL DEFAULT 0,
          nilai_penyusutan REAL DEFAULT 0,
          nilai_buku REAL DEFAULT 0,
          beban_penyusutan_maret_2026 REAL DEFAULT 0,
          akum_penyusutan_maret_2026 REAL DEFAULT 0,
          nilai_buku_maret_2026 REAL DEFAULT 0,
          umur_manfaat TEXT,
          keterangan TEXT
        )`,

        // === INVENTORY TABLE ===
        `CREATE TABLE IF NOT EXISTS inventory (
          kode TEXT PRIMARY KEY,
          nama TEXT NOT NULL,
          satuan TEXT,
          stok_awal INTEGER DEFAULT 0,
          masuk INTEGER DEFAULT 0,
          keluar INTEGER DEFAULT 0,
          stok_akhir INTEGER DEFAULT 0,
          harga_satuan REAL DEFAULT 0,
          nilai_total REAL DEFAULT 0
        )`,

        // === BBM TABLE ===
        `CREATE TABLE IF NOT EXISTS bbm (
          id TEXT PRIMARY KEY,
          tanggal TEXT NOT NULL,
          tipe TEXT,
          keterangan TEXT,
          volume REAL DEFAULT 0,
          harga REAL DEFAULT 0,
          total REAL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )`,

        `CREATE INDEX IF NOT EXISTS idx_bbm_tanggal ON bbm(tanggal)`,

        // === PIUTANG TABLE ===
        `CREATE TABLE IF NOT EXISTS piutang (
          id TEXT PRIMARY KEY,
          no_faktur TEXT,
          tanggal TEXT NOT NULL,
          jatuh_tempo TEXT,
          pelanggan TEXT,
          keterangan TEXT,
          jumlah REAL DEFAULT 0,
          terbayar REAL DEFAULT 0,
          sisa REAL DEFAULT 0,
          status TEXT DEFAULT 'belum'
        )`,

        `CREATE INDEX IF NOT EXISTS idx_piutang_tanggal ON piutang(tanggal)`,

        // === HUTANG TABLE ===
        `CREATE TABLE IF NOT EXISTS hutang (
          id TEXT PRIMARY KEY,
          no_faktur TEXT,
          tanggal TEXT NOT NULL,
          jatuh_tempo TEXT,
          supplier TEXT,
          keterangan TEXT,
          jumlah REAL DEFAULT 0,
          terbayar REAL DEFAULT 0,
          sisa REAL DEFAULT 0,
          status TEXT DEFAULT 'belum'
        )`,

        `CREATE INDEX IF NOT EXISTS idx_hutang_tanggal ON hutang(tanggal)`,

        // === ANGGARAN TABLE ===
        `CREATE TABLE IF NOT EXISTS anggaran (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kode TEXT NOT NULL,
          nama TEXT NOT NULL,
          kategori TEXT,
          anggaran_awal REAL DEFAULT 0,
          target_bulan REAL DEFAULT 0,
          sd_bln_lalu REAL DEFAULT 0,
          bulan_ini REAL DEFAULT 0,
          realisasi REAL DEFAULT 0,
          persentase REAL DEFAULT 0,
          is_total INTEGER DEFAULT 0,
          UNIQUE(kode, kategori)
        )`,

        // === REKONSILIASI TABLE ===
        `CREATE TABLE IF NOT EXISTS rekonsiliasi (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tanggal TEXT NOT NULL,
          keterangan TEXT,
          ref TEXT,
          jumlah REAL NOT NULL,
          tipe TEXT DEFAULT 'buku'
        )`,

        // === PENGATURAN TABLE ===
        `CREATE TABLE IF NOT EXISTS pengaturan (
          key TEXT PRIMARY KEY,
          value TEXT
        )`,

        // === LOCKED PERIODS TABLE ===
        `CREATE TABLE IF NOT EXISTS locked_periods (
          period TEXT PRIMARY KEY
        )`,

        // === COUNTERS TABLE ===
        `CREATE TABLE IF NOT EXISTS counters (
          key TEXT PRIMARY KEY,
          value INTEGER DEFAULT 0
        )`,
        
        // Ensure 'lines' column exists in journals
        `ALTER TABLE journals ADD COLUMN lines TEXT`
      ];

      let pending = statements.length;
      let hasError = null;

      statements.forEach(sql => {
        db.run(sql, (err) => {
          if (err) {
            // Ignore "already exists" or "duplicate column" errors
            if (!err.message.includes('already exists') && !err.message.includes('duplicate column name')) {
              console.error('Schema error:', err.message);
              hasError = err;
            }
          }
          pending--;
          if (pending === 0) {
            if (hasError) {
              console.error("Database schema initialization failed");
              reject(hasError);
            } else {
              console.log("Database schema initialized successfully");
              resolve();
            }
          }
        });
      });
    });
  });
}

module.exports = { initDatabase };
