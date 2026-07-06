const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const DIR1 = path.join(__dirname, 'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026');
const FEB_FILE1 = 'DRAFT AUDITED -LAMPIRAN LAPORAN BULAN FEBRUARI 2026.xlsx';
const DIR2 = path.join(__dirname, 'src/FILES');
const FEB_FILE2 = 'LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx';
const FEB_SHEET = 'JURNAL FEB 2026';

function num(v) {
  if (typeof v === 'number') return v;
  if (!v || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

async function getDbBalances(db) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT akun_debit, akun_kredit, debit, kredit FROM journals WHERE tanggal LIKE '2026-02%' AND status='posted'`, (err, rows) => {
      if (err) return reject(err);
      const balances = {};
      
      rows.forEach(row => {
        const dCode = row.akun_debit ? String(row.akun_debit).split(' ')[0] : null;
        const kCode = row.akun_kredit ? String(row.akun_kredit).split(' ')[0] : null;
        const dVal = num(row.debit);
        const kVal = num(row.kredit);
        
        if (dCode) {
          balances[dCode] = (balances[dCode] || 0) + dVal;
        }
        if (kCode) {
          balances[kCode] = (balances[kCode] || 0) - kVal;
        }
      });
      resolve(balances);
    });
  });
}

function getExcelBalances(filePath, sheetName) {
  try {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[sheetName];
    if (!ws) return null;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    
    const hIdx = rows.findIndex(r => r.some(c => String(c||'').toLowerCase().includes('tgl')));
    if (hIdx === -1) return null;
    const dataRows = rows.slice(hIdx + 1);
    
    const balances = {};
    dataRows.forEach(r => {
      const codeRaw = String(r[0] || '').trim();
      const name = String(r[3] || '').trim();
      const dVal = num(r[5]);
      const kVal = num(r[6]);
      
      if (!name || (dVal === 0 && kVal === 0)) return;
      
      // simplistic extraction without deep resolution, just to see what Excel has
      // We assume codeRaw is populated in excel for this simple comparison
      // If codeRaw is missing, we use name.
      const code = codeRaw || name;
      
      balances[code] = (balances[code] || 0) + dVal - kVal;
    });
    return balances;
  } catch (e) {
    return null;
  }
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  
  console.log("Fetching DB balances for Feb...");
  const dbBalances = await getDbBalances(db);
  
  console.log("Fetching Excel balances 1...");
  const xl1Balances = getExcelBalances(path.join(DIR1, FEB_FILE1), FEB_SHEET);
  
  console.log("Fetching Excel balances 2...");
  const xl2Balances = getExcelBalances(path.join(DIR2, FEB_FILE2), FEB_SHEET);
  
  console.log("== Comparison ==");
  const allKeys = new Set([...Object.keys(dbBalances), ...Object.keys(xl1Balances || {}), ...Object.keys(xl2Balances || {})]);
  
  let diffCount = 0;
  
  for (const k of allKeys) {
    const dVal = dbBalances[k] || 0;
    const x1Val = xl1Balances ? (xl1Balances[k] || 0) : 0;
    const x2Val = xl2Balances ? (xl2Balances[k] || 0) : 0;
    
    if (Math.abs(dVal - x1Val) > 1 || Math.abs(dVal - x2Val) > 1) {
      console.log(`Key: ${k}`);
      console.log(`  DB: ${dVal}`);
      if (xl1Balances) console.log(`  XL1: ${x1Val}`);
      if (xl2Balances) console.log(`  XL2: ${x2Val}`);
      diffCount++;
    }
  }
  
  console.log(`Total differences found: ${diffCount}`);
  db.close();
}

main().catch(console.error);
