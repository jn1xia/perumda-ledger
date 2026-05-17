/**
 * SCHEMA MIGRATION: Add NOT NULL constraint to TEXT PRIMARY KEY columns
 * 
 * Root Cause: SQLite's TEXT PRIMARY KEY does NOT automatically enforce NOT NULL
 * (unlike INTEGER PRIMARY KEY). This migration rebuilds affected tables with
 * explicit NOT NULL on their primary key columns.
 * 
 * Tables affected:
 *   - sales_orders
 *   - purchase_orders
 *   - pelanggan
 *   - supplier
 *   - giro
 *   - efaktur
 *
 * Strategy: CREATE new -> COPY data -> DROP old -> RENAME new
 * (SQLite does not support ALTER COLUMN)
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const BACKUP_PATH = path.join(__dirname, 'server', `perumda_ledger_backup_${Date.now()}.db`);

// Backup before migration
fs.copyFileSync(DB_PATH, BACKUP_PATH);
console.log(`\n🔒 Backup created: ${BACKUP_PATH}`);

const db = new sqlite3.Database(DB_PATH);

function runSQL(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, function(err) {
      if (err) reject(new Error(`SQL Failed: ${sql}\n  → ${err.message}`));
      else resolve(this);
    });
  });
}

const migrations = [
  {
    table: 'sales_orders',
    tempName: 'sales_orders_new',
    createSQL: `CREATE TABLE sales_orders_new (
      id TEXT NOT NULL PRIMARY KEY,
      tanggal TEXT,
      pelanggan_id TEXT,
      items TEXT,
      subtotal REAL,
      ppn REAL,
      total REAL,
      status TEXT,
      tipe_pembayaran TEXT
    )`,
    copySQL: `INSERT INTO sales_orders_new SELECT * FROM sales_orders`,
  },
  {
    table: 'purchase_orders',
    tempName: 'purchase_orders_new',
    createSQL: `CREATE TABLE purchase_orders_new (
      id TEXT NOT NULL PRIMARY KEY,
      tanggal TEXT,
      supplier_id TEXT,
      items TEXT,
      subtotal REAL,
      ppn REAL,
      total REAL,
      status TEXT
    )`,
    copySQL: `INSERT INTO purchase_orders_new SELECT * FROM purchase_orders`,
  },
  {
    table: 'pelanggan',
    tempName: 'pelanggan_new',
    createSQL: `CREATE TABLE pelanggan_new (
      id TEXT NOT NULL PRIMARY KEY,
      nama TEXT,
      npwp TEXT,
      alamat TEXT,
      telepon TEXT
    )`,
    copySQL: `INSERT INTO pelanggan_new SELECT * FROM pelanggan`,
  },
  {
    table: 'supplier',
    tempName: 'supplier_new',
    createSQL: `CREATE TABLE supplier_new (
      id TEXT NOT NULL PRIMARY KEY,
      nama TEXT,
      npwp TEXT,
      alamat TEXT,
      telepon TEXT
    )`,
    copySQL: `INSERT INTO supplier_new SELECT * FROM supplier`,
  },
  {
    table: 'giro',
    tempName: 'giro_new',
    createSQL: `CREATE TABLE giro_new (
      id TEXT NOT NULL PRIMARY KEY,
      nomor_giro TEXT,
      tipe TEXT,
      bank TEXT,
      nominal REAL,
      tanggal_terbit TEXT,
      tanggal_jt TEXT,
      status TEXT
    )`,
    copySQL: `INSERT INTO giro_new SELECT * FROM giro`,
  },
  {
    table: 'efaktur',
    tempName: 'efaktur_new',
    createSQL: `CREATE TABLE efaktur_new (
      id TEXT NOT NULL PRIMARY KEY,
      tanggal TEXT,
      tipe TEXT,
      dpp REAL,
      ppn REAL,
      npwp TEXT,
      nama TEXT,
      status TEXT
    )`,
    copySQL: `INSERT INTO efaktur_new SELECT * FROM efaktur`,
  },
];

async function migrate() {
  console.log('\n🔧 Starting Schema Migration: Adding NOT NULL to TEXT PRIMARY KEY columns...\n');

  let passed = 0;
  let failed = 0;

  // Enable foreign keys & WAL for safety
  await runSQL('PRAGMA foreign_keys = OFF');
  await runSQL('PRAGMA journal_mode = WAL');

  for (const m of migrations) {
    try {
      // Step 1: Drop temp table if leftover from failed run
      await runSQL(`DROP TABLE IF EXISTS ${m.tempName}`);
      // Step 2: Create new table with NOT NULL PK
      await runSQL(m.createSQL);
      // Step 3: Copy existing data
      await runSQL(m.copySQL);
      // Step 4: Drop old table
      await runSQL(`DROP TABLE ${m.table}`);
      // Step 5: Rename new -> original
      await runSQL(`ALTER TABLE ${m.tempName} RENAME TO ${m.table}`);

      console.log(`  ✅ MIGRATED: ${m.table}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAILED:   ${m.table} → ${err.message}`);
      // Cleanup temp table if it was created
      try { await runSQL(`DROP TABLE IF EXISTS ${m.tempName}`); } catch {}
      failed++;
    }
  }

  await runSQL('PRAGMA foreign_keys = ON');

  console.log(`\n📊 Migration Summary`);
  console.log(`  Tables Migrated : ✅ ${passed}`);
  console.log(`  Tables Failed   : ❌ ${failed}`);

  db.close(() => {
    console.log('\n✅ Database connection closed.\n');
    if (failed > 0) {
      console.log(`⚠️  Some tables failed. Restore from backup:\n   ${BACKUP_PATH}`);
    } else {
      console.log('🏆 All tables successfully migrated. Schema now enforces NOT NULL on all TEXT PRIMARY KEYs.');
    }
  });
}

migrate().catch(err => {
  console.error('\n💥 Critical migration error:', err.message);
  console.log(`Restore from backup: ${BACKUP_PATH}`);
  db.close();
});
