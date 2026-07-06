/**
 * import_neraca_bs_feb.cjs
 * 
 * Imports the missing Balance Sheet (Neraca) accounts (Assets, Liabilities, Equity)
 * for February 2026 from the "DATA LAMPIRAN NERACA" sheet.
 * Uses 11103 Bank Kalsel as the clearing counterpart to match the existing P&L logic.
 */
const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const DIR = path.join(__dirname, 'src/FILES/');
const FEB_FILE = 'LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx';
const NERACA_SHEET = 'DATA LAMPIRAN NERACA';

function dbRun(db, sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function(e) { e ? rej(e) : res(this) }));
}

function num(v) {
  if (typeof v === 'number') return v;
  if (!v || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

const BANK_KALSEL = '11103 - Bank Kalsel';
const CLEARING_ACCOUNT = '11103 Bank Kalsel';

async function main() {
  console.log('=== Importing Missing Balance Sheet Accounts for Apr 2026 ===\n');
  const db = new sqlite3.Database(DB_PATH);
  
  // Clear any previously imported Neraca-only SUM entries if we ran this before
  const del = await dbRun(db, "DELETE FROM journals WHERE id LIKE 'SUM-2026-04-BS-%'");
  console.log(`Cleared ${del.changes} old BS entries.`);

  try {
    const wb = XLSX.readFile(path.join(DIR, FEB_FILE));
    const ws = wb.Sheets[NERACA_SHEET];
    if (!ws) throw new Error(`Sheet ${NERACA_SHEET} not found`);

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    
    const entries = [];
    const lastDay = '2026-04-30';
    
    rows.slice(2).forEach(r => {
      const rawCode = String(r[1] || '').trim();
      const name = String(r[2] || '').trim();
      const dAmt = num(r[5]);
      const kAmt = num(r[6]);
      
      if (!rawCode || !name) return;
      if (dAmt === 0 && kAmt === 0) return;
      
      // We only want Balance Sheet accounts (1xxxx, 2xxxx, 3xxxx)
      // And we skip 11103 Bank Kalsel because it will act as the natural clearing account
      const prefix = rawCode.slice(0, 1);
      if (!['1', '2', '3'].includes(prefix)) return;
      if (rawCode === '11103') return; 

      const fullAkun = `${rawCode} ${name}`;
      
      if (dAmt > 0) {
        entries.push({
          id: `SUM-2026-04-BS-${rawCode}-D`,
          tanggal: lastDay, status: 'posted',
          akun_debit: fullAkun, akun_kredit: CLEARING_ACCOUNT,
          debit: dAmt, kredit: dAmt,
          keterangan: `[Neraca Apr] Debit ${name}`
        });
      }
      
      if (kAmt > 0) {
        entries.push({
          id: `SUM-2026-04-BS-${rawCode}-K`,
          tanggal: lastDay, status: 'posted',
          akun_debit: CLEARING_ACCOUNT, akun_kredit: fullAkun,
          debit: kAmt, kredit: kAmt,
          keterangan: `[Neraca Apr] Kredit ${name}`
        });
      }
    });
    
    console.log(`Parsed ${entries.length} BS journal entries to insert.`);
    
    let inserted = 0;
    for (const e of entries) {
      await dbRun(db,
        `INSERT OR REPLACE INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.tanggal, e.akun_debit, e.akun_kredit, e.debit, e.kredit, e.keterangan, e.status]
      );
      inserted++;
    }
    console.log(`✓ Successfully inserted ${inserted} Balance Sheet entries.`);
    
  } catch (err) {
    console.error("ERROR:", err.message);
  }
  
  db.close();
}

main().catch(console.error);
