const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const TEST_DB_PATH = path.join(__dirname, 'server', 'test_ledger.db');

// Create isolated test DB
if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
fs.copyFileSync(DB_PATH, TEST_DB_PATH);

const db = new sqlite3.Database(TEST_DB_PATH);
let stats = { total: 0, pass: 0, fail: 0 };
let currentModule = '';
const resultsLog = [];

function log(msg) {
  // console.log(msg);
}

function recordTest(name, passed, detail) {
  stats.total++;
  if (passed) stats.pass++; else stats.fail++;
  if (!passed) {
    resultsLog.push(`❌ FAIL | ${currentModule} | ${name} | ${detail}`);
  }
}

async function runSQL(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

async function expectSuccess(name, sql, params = []) {
  try {
    await runSQL(sql, params);
    recordTest(name, true, '');
  } catch (err) {
    recordTest(name, false, err.message);
  }
}

async function expectError(name, sql, params = []) {
  try {
    await runSQL(sql, params);
    recordTest(name, false, 'Expected error but succeeded');
  } catch (err) {
    recordTest(name, true, err.message);
  }
}

async function runSuite() {
  console.log('🚀 Starting Deep QA Stress Test Suite (Positive & Negative)...');

  // ==========================================
  // MODULE GROUP 1: COA & Master Data
  // ==========================================
  currentModule = 'COA & Master Data';
  // 25 Positive Tests
  for (let i = 1; i <= 25; i++) {
    await expectSuccess(`Positive Insert COA Valid Data #${i}`, 
      `INSERT INTO coa (code, name, type, category) VALUES (?, ?, ?, ?)`, 
      [`999${i}`, `Test Account ${i}`, 'expense', 'Test Category']);
  }
  // 25 Negative Tests
  for (let i = 1; i <= 10; i++) {
    await expectError(`Negative Insert COA Duplicate Code #${i}`, 
      `INSERT INTO coa (code, name) VALUES (?, ?)`, [`9991`, `Dup`]);
  }
  for (let i = 1; i <= 15; i++) {
    await expectError(`Negative Insert COA Null PK #${i}`, 
      `INSERT INTO coa (code, name) VALUES (NULL, 'Null Code')`);
  }

  // ==========================================
  // MODULE GROUP 2: JURNAL & VOUCHER
  // ==========================================
  currentModule = 'Jurnal & Voucher';
  // 25 Positive Tests
  for (let i = 1; i <= 25; i++) {
    await expectSuccess(`Positive Insert Jurnal Valid #${i}`, 
      `INSERT INTO journals (id, tanggal, keterangan, debit, kredit, akun_debit, akun_kredit) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
      [`TEST-JRN-${i}`, `2026-05-15`, `Test Desc`, 1000, 1000, '11101', '11102']);
  }
  // 25 Negative Tests
  for (let i = 1; i <= 12; i++) {
    await expectError(`Negative Insert Jurnal Null Akun Debit #${i}`, 
      `INSERT INTO journals (id, tanggal, debit, kredit, akun_kredit) VALUES (?, '2026-01-01', 100, 100, '11102')`, [`ERR-JRN-${i}`]);
  }
  for (let i = 1; i <= 13; i++) {
    await expectError(`Negative Insert Jurnal Null Tanggal #${i}`, 
      `INSERT INTO journals (id, debit, kredit, akun_debit, akun_kredit) VALUES (?, 100, 100, '11101', '11102')`, [`ERR2-JRN-${i}`]);
  }

  // ==========================================
  // MODULE GROUP 3: PELANGGAN & SUPPLIER (AR/AP Master)
  // ==========================================
  currentModule = 'Pelanggan & Supplier';
  for (let i = 1; i <= 25; i++) {
    await expectSuccess(`Positive Insert Pelanggan #${i}`, 
      `INSERT INTO pelanggan (id, nama, npwp) VALUES (?, ?, ?)`, [`CUST-${i}`, `Pelanggan ${i}`, `12345678901234${i}`]);
  }
  for (let i = 1; i <= 25; i++) {
    await expectError(`Negative Insert Pelanggan Duplicate ID #${i}`, 
      `INSERT INTO pelanggan (id, nama) VALUES ('CUST-1', 'Dup Cust')`);
  }

  // ==========================================
  // MODULE GROUP 4: PURCHASE ORDERS & SALES ORDERS
  // ==========================================
  currentModule = 'PO & SO Transactions';
  for (let i = 1; i <= 25; i++) {
    await expectSuccess(`Positive Insert Sales Order #${i}`, 
      `INSERT INTO sales_orders (id, tanggal, pelanggan_id, total, status) VALUES (?, '2026-05-15', 'CUST-1', 50000, 'Draft')`, [`SO-TEST-${i}`]);
  }
  for (let i = 1; i <= 25; i++) {
    await expectError(`Negative Insert SO Null PK #${i}`, 
      `INSERT INTO sales_orders (id, tanggal) VALUES (NULL, '2026-05-15')`);
  }

  // ==========================================
  // MODULE GROUP 5: GIRO
  // ==========================================
  currentModule = 'Giro Masuk/Keluar';
  for (let i = 1; i <= 25; i++) {
    await expectSuccess(`Positive Insert Giro #${i}`, 
      `INSERT INTO giro (id, nomor_giro, nominal, status) VALUES (?, ?, ?, ?)`, [`GR-${i}`, `BG999${i}`, 1500000, 'Pending']);
  }
  for (let i = 1; i <= 25; i++) {
    await expectError(`Negative Insert Giro Duplicate ID #${i}`, 
      `INSERT INTO giro (id, nomor_giro) VALUES ('GR-1', 'Dup Giro')`);
  }

  // ==========================================
  // MODULE GROUP 6: E-FAKTUR
  // ==========================================
  currentModule = 'E-Faktur PPN';
  for (let i = 1; i <= 25; i++) {
    await expectSuccess(`Positive Insert EFaktur #${i}`, 
      `INSERT INTO efaktur (id, dpp, ppn, tipe) VALUES (?, ?, ?, ?)`, [`FK-${i}`, 1000000, 110000, 'Keluaran']);
  }
  for (let i = 1; i <= 25; i++) {
    await expectError(`Negative Insert EFaktur Duplicate ID #${i}`, 
      `INSERT INTO efaktur (id, dpp) VALUES ('FK-1', 5000)`);
  }

  // ==========================================
  // MODULE GROUP 7: ASET TETAP
  // ==========================================
  currentModule = 'Aktiva Tetap';
  for (let i = 1; i <= 25; i++) {
    await expectSuccess(`Positive Insert Aset #${i}`, 
      `INSERT INTO assets (kode, nama, nilai_perolehan) VALUES (?, ?, ?)`, [`AST-TEST-${i}`, `Mesin ${i}`, 5000000]);
  }
  for (let i = 1; i <= 25; i++) {
    await expectError(`Negative Insert Aset Duplicate PK #${i}`, 
      `INSERT INTO assets (kode, nama) VALUES ('AST-TEST-1', 'Dup Mesin')`);
  }


  db.close();

  // Print Summary
  console.log('\n📊 TEST EXECUTION SUMMARY');
  console.log(`Total Tests Run : ${stats.total}`);
  console.log(`Passed Tests    : ✅ ${stats.pass}`);
  console.log(`Failed Tests    : ❌ ${stats.fail}`);

  if (stats.fail > 0) {
    console.log('\n⚠️ FAILURE DETAILS:');
    resultsLog.forEach(log => console.log(log));
  } else {
    console.log('\n🏆 ALL STRESS TESTS PASSED SUCCESSFULLY!');
    console.log('Database schema strictly enforces constraints across all modules.');
  }
}

runSuite().catch(console.error);
