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
          nilai_total REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        // Note: bulan column migration is complete — do NOT drop this table

        `CREATE TABLE IF NOT EXISTS anggaran (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kode TEXT NOT NULL,
          nama TEXT NOT NULL,
          kategori TEXT,
          bulan INTEGER DEFAULT 0,
          anggaran_awal REAL DEFAULT 0,
          target_bulan REAL DEFAULT 0,
          sd_bln_lalu REAL DEFAULT 0,
          bulan_ini REAL DEFAULT 0,
          realisasi REAL DEFAULT 0,
          persentase REAL DEFAULT 0,
          is_total INTEGER DEFAULT 0,
          UNIQUE(kode, kategori, bulan)
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

        // === GIRO TABLE (#22) ===
        `CREATE TABLE IF NOT EXISTS giro (
          id TEXT PRIMARY KEY,
          noGiro TEXT NOT NULL,
          tanggal TEXT NOT NULL,
          jatuhTempo TEXT,
          tipe TEXT DEFAULT 'masuk',
          pihak TEXT,
          bank TEXT,
          jumlah REAL DEFAULT 0,
          status TEXT DEFAULT 'belum',
          keterangan TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // === PELANGGAN MASTER (#11) ===
        `CREATE TABLE IF NOT EXISTS pelanggan (
          id TEXT PRIMARY KEY,
          kode TEXT UNIQUE,
          nama TEXT NOT NULL,
          alamat TEXT,
          kota TEXT,
          telepon TEXT,
          npwp TEXT,
          email TEXT,
          kontak TEXT,
          keterangan TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // === SUPPLIER MASTER (#14) ===
        `CREATE TABLE IF NOT EXISTS supplier (
          id TEXT PRIMARY KEY,
          kode TEXT UNIQUE,
          nama TEXT NOT NULL,
          alamat TEXT,
          kota TEXT,
          telepon TEXT,
          npwp TEXT,
          email TEXT,
          kontak TEXT,
          keterangan TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // === PURCHASE ORDER (#19) ===
        `CREATE TABLE IF NOT EXISTS purchase_orders (
          id TEXT PRIMARY KEY,
          noPO TEXT UNIQUE,
          tanggal TEXT NOT NULL,
          supplier_id TEXT,
          supplier_nama TEXT,
          status TEXT DEFAULT 'draft',
          total REAL DEFAULT 0,
          keterangan TEXT,
          items TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // === E-FAKTUR (#24) ===
        `CREATE TABLE IF NOT EXISTS efaktur (
          id TEXT PRIMARY KEY,
          noFaktur TEXT,
          tanggal TEXT NOT NULL,
          tipe TEXT DEFAULT 'keluaran',
          npwpLawan TEXT,
          namaLawan TEXT,
          alamatLawan TEXT,
          dpp REAL DEFAULT 0,
          ppn REAL DEFAULT 0,
          status TEXT DEFAULT 'draft',
          keterangan TEXT,
          ref_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // === SALES ORDERS (#20) ===
        `CREATE TABLE IF NOT EXISTS sales_orders (
          id TEXT PRIMARY KEY,
          noSO TEXT UNIQUE,
          tanggal TEXT NOT NULL,
          pelanggan_id TEXT,
          pelanggan_nama TEXT,
          pembayaran TEXT DEFAULT 'tunai',
          status TEXT DEFAULT 'draft',
          total REAL DEFAULT 0,
          keterangan TEXT,
          items TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Ensure 'lines' column exists in journals
        `ALTER TABLE journals ADD COLUMN lines TEXT`,
        
        // Ensure 'bukti' column exists in journals (voucher number)
        `ALTER TABLE journals ADD COLUMN bukti TEXT`,

        // Ensure 'tipe_transaksi' column exists in journals (pendapatan/pengeluaran/transfer)
        `ALTER TABLE journals ADD COLUMN tipe_transaksi TEXT DEFAULT 'transfer'`,

        // Who created this entry (username from the session) — enables
        // separation-of-duties (a maker may not approve their own entry).
        `ALTER TABLE journals ADD COLUMN created_by TEXT`,

        // Ensure 'nama_excel' column exists in anggaran — the verbatim label from
        // an uploaded lampiran. Used for display so report rows mirror the Excel
        // exactly when a snapshot exists; falls back to curated maps otherwise.
        `ALTER TABLE anggaran ADD COLUMN nama_excel TEXT`,
        
        // === DEPARTEMEN TABLE (#3 - Setup Induk Data) ===
        `CREATE TABLE IF NOT EXISTS departemen (
          kode TEXT PRIMARY KEY,
          nama TEXT NOT NULL,
          keterangan TEXT
        )`,
        // Ensure 'keterangan' column exists in legacy departemen tables
        `ALTER TABLE departemen ADD COLUMN keterangan TEXT`,

        // Ensure 'nama' is NOT NULL semantics (handled at write-validation layer)

        // Ensure locked_periods has audit columns (lock reason, locked-by/at, unlock reason/by/at)
        `ALTER TABLE locked_periods ADD COLUMN locked_by TEXT`,
        `ALTER TABLE locked_periods ADD COLUMN locked_at DATETIME`,
        `ALTER TABLE locked_periods ADD COLUMN unlock_reason TEXT`,
        `ALTER TABLE locked_periods ADD COLUMN unlocked_by TEXT`,
        `ALTER TABLE locked_periods ADD COLUMN unlocked_at DATETIME`,

        // Ensure timestamps exist in inventory
        `ALTER TABLE inventory ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
        `ALTER TABLE inventory ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,

        // === MODULE 13 — JENIS JURNAL (prefix master) ===
        `CREATE TABLE IF NOT EXISTS jenis_jurnal (
          prefix TEXT PRIMARY KEY,
          nama TEXT NOT NULL,
          deskripsi TEXT,
          next_value INTEGER DEFAULT 1,
          aktif INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // === MODULE 22 — PIUTANG PERIOD CLOSING ===
        `CREATE TABLE IF NOT EXISTS piutang_closings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          period TEXT NOT NULL UNIQUE,
          total_saldo REAL DEFAULT 0,
          rolled_over_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          rolled_over_by TEXT,
          keterangan TEXT
        )`,

        // === MODULE 27 — INVENTORY TRANSFERS (antar lokasi) ===
        `CREATE TABLE IF NOT EXISTS inventory_transfers (
          id TEXT PRIMARY KEY,
          tanggal TEXT NOT NULL,
          kode_barang TEXT NOT NULL,
          dari_lokasi TEXT NOT NULL,
          ke_lokasi TEXT NOT NULL,
          qty REAL NOT NULL,
          keterangan TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // === MODULE 28 — STOCK OPNAME ===
        `CREATE TABLE IF NOT EXISTS stock_opname (
          id TEXT PRIMARY KEY,
          tanggal TEXT NOT NULL,
          kode_barang TEXT NOT NULL,
          lokasi TEXT,
          qty_sistem REAL DEFAULT 0,
          qty_fisik REAL DEFAULT 0,
          selisih REAL DEFAULT 0,
          keterangan TEXT,
          status TEXT DEFAULT 'open',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // === MODULE 35 — BACKUP LOG ===
        `CREATE TABLE IF NOT EXISTS backups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT NOT NULL UNIQUE,
          size_bytes INTEGER DEFAULT 0,
          created_by TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          notes TEXT
        )`,

        // === MODULE 36 — USERS / ROLES ===
        `CREATE TABLE IF NOT EXISTS users (
          username TEXT PRIMARY KEY,
          nama TEXT,
          role TEXT NOT NULL DEFAULT 'kasir',
          aktif INTEGER DEFAULT 1,
          last_login DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // Real authentication columns (bcrypt hash + forced first-login rotation).
        // Added as idempotent ALTERs so existing DBs pick them up on next boot.
        `ALTER TABLE users ADD COLUMN password_hash TEXT`,
        `ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 1`,

        // === Schema-drift backfill (idempotent ALTERs) ===
        // Older DB versions used different column names. Add the canonical
        // columns so new code paths that reference them keep working.
        `ALTER TABLE giro ADD COLUMN noGiro TEXT`,
        `ALTER TABLE giro ADD COLUMN tanggal TEXT`,
        `ALTER TABLE giro ADD COLUMN jatuhTempo TEXT`,
        `ALTER TABLE giro ADD COLUMN pihak TEXT`,
        `ALTER TABLE giro ADD COLUMN jumlah REAL DEFAULT 0`,
        `ALTER TABLE giro ADD COLUMN keterangan TEXT`,
        `ALTER TABLE giro ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
        `ALTER TABLE giro ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,

        `ALTER TABLE efaktur ADD COLUMN noFaktur TEXT`,
        `ALTER TABLE efaktur ADD COLUMN npwpLawan TEXT`,
        `ALTER TABLE efaktur ADD COLUMN namaLawan TEXT`,
        `ALTER TABLE efaktur ADD COLUMN alamatLawan TEXT`,
        `ALTER TABLE efaktur ADD COLUMN keterangan TEXT`,
        `ALTER TABLE efaktur ADD COLUMN ref_id TEXT`,
        `ALTER TABLE efaktur ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,

        `ALTER TABLE purchase_orders ADD COLUMN noPO TEXT`,
        `ALTER TABLE purchase_orders ADD COLUMN supplier_nama TEXT`,
        `ALTER TABLE purchase_orders ADD COLUMN keterangan TEXT`,
        `ALTER TABLE purchase_orders ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
        `ALTER TABLE purchase_orders ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,

        `ALTER TABLE sales_orders ADD COLUMN noSO TEXT`,
        `ALTER TABLE sales_orders ADD COLUMN pelanggan_nama TEXT`,
        `ALTER TABLE sales_orders ADD COLUMN pembayaran TEXT DEFAULT 'tunai'`,
        `ALTER TABLE sales_orders ADD COLUMN keterangan TEXT`,
        `ALTER TABLE sales_orders ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
        `ALTER TABLE sales_orders ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,

        // === REFERENCE REPORT DATA (imported from Excel) ===
        `CREATE TABLE IF NOT EXISTS report_neraca (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          period TEXT NOT NULL,
          sort_order INTEGER NOT NULL,
          label TEXT NOT NULL,
          value REAL,
          depth INTEGER DEFAULT 0
        )`,

        `CREATE TABLE IF NOT EXISTS report_arus_kas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          period TEXT NOT NULL,
          sort_order INTEGER NOT NULL,
          label TEXT NOT NULL,
          value REAL,
          is_section INTEGER DEFAULT 0
        )`,

        `CREATE TABLE IF NOT EXISTS report_laba_rugi (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          period TEXT NOT NULL,
          sort_order INTEGER NOT NULL,
          label TEXT NOT NULL,
          value REAL,
          depth INTEGER DEFAULT 0
        )`,

        // === PERIOD STATUS — the ONE source of truth for how a month's reports
        // are produced. 'audited' = frozen official snapshot + user-journal delta;
        // 'jurnal' = computed live from posted journals. Set ONLY by explicit
        // actions (lampiran upload / load-audited / journal-book upload / reset).
        // A missing row means 'jurnal'. Report views read this instead of
        // guessing from row presence — guessing is what made months freeze at
        // stale figures (kendala 07-07-2026).
        `CREATE TABLE IF NOT EXISTS period_status (
          period TEXT PRIMARY KEY,
          mode TEXT NOT NULL CHECK(mode IN ('audited','jurnal')),
          source TEXT,
          set_by TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // Baseline flag: 1 = journal belongs to an audited month's official book
        // (already counted inside the frozen snapshot — reports must NOT overlay
        // it again); 0 = live user journal (overlays every report as delta).
        // Replaces the fragile id-prefix convention (XL-/SUM-/ADJ-/CAS- vs
        // JV-/JRN-) as the source of truth; prefixes remain display-only.
        // Added WITHOUT default so pre-existing rows surface as NULL and get
        // backfilled from their prefix below (idempotent, only touches NULL).
        `ALTER TABLE journals ADD COLUMN baseline INTEGER`,
        `UPDATE journals SET baseline = CASE
           WHEN id LIKE 'XL-%' OR id LIKE 'SUM-%' OR id LIKE 'ADJ-%' OR id LIKE 'CAS-%' THEN 1
           ELSE 0 END
         WHERE baseline IS NULL`,

        // One-time seeding of period_status from data that already exists:
        // months whose Laba Rugi snapshot carries real values were loaded from
        // an official lampiran → audited. INSERT OR IGNORE never overwrites an
        // explicitly-set mode.
        `INSERT OR IGNORE INTO period_status (period, mode, source)
         SELECT period, 'audited', 'backfill-snapshot'
         FROM report_laba_rugi WHERE value IS NOT NULL AND value <> 0
         GROUP BY period HAVING COUNT(*) >= 5`,

        // === JOURNAL LINES TABLE (flat Excel row storage) ===
        `CREATE TABLE IF NOT EXISTS journal_lines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          journal_id TEXT NOT NULL,
          line_order INTEGER NOT NULL DEFAULT 0,
          tanggal TEXT,
          bukti TEXT,
          akun_code TEXT,
          akun_name TEXT NOT NULL,
          sub_akun TEXT,
          debit REAL DEFAULT 0,
          kredit REAL DEFAULT 0,
          keterangan TEXT,
          FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE
        )`,

        `CREATE INDEX IF NOT EXISTS idx_jlines_journal ON journal_lines(journal_id)`
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
