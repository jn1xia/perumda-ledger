const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const DIR = path.join(__dirname, 'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026');
const FEB_FILE = 'DRAFT AUDITED -LAMPIRAN LAPORAN BULAN FEBRUARI 2026.xlsx';

function num(v) {
  if (typeof v === 'number') return v;
  if (!v || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

const FIXED_MAP = {
  'bank kalsel': '11103', 'kas kecil': '11101', 'bank bni': '11104', 'bank bni bisnis': '11106',
  'bank bni tapcash': '11107', 'piutang usaha': '11201', 'persediaan barang dagang': '11401',
  'persediaan barang dagang (gas lpg)': '11402', 'bbm dibayar di muka': '11501',
  'pendapatan bisnis utama': '41000', 'pendapatan bisnis lainnya': '42000',
  'pendapatan di luar operasional': '70000', 'beban di luar operasional': '80000'
};

function resolveCode(rawCode, name, nameLookup) {
  const code = String(rawCode||'').trim();
  const nKey = String(name||'').toLowerCase().trim();
  if (/^\d{4,6}(\.\d+)?$/.test(code) && !['561510','611547','111177','211251','311325','411399','511473'].includes(code)) return code;
  if (FIXED_MAP[nKey]) return FIXED_MAP[nKey];
  for (const [k,v] of Object.entries(FIXED_MAP)) if (nKey.includes(k)) return v;
  if (nameLookup[nKey]) return nameLookup[nKey];
  for (const [k,v] of Object.entries(nameLookup)) if (nKey && k.includes(nKey)) return v;
  return code || nKey;
}

async function getDbBalances(db) {
  return new Promise((res, rej) => {
    db.all(`SELECT akun_debit, akun_kredit, debit, kredit FROM journals WHERE tanggal LIKE '2026-02%' AND status='posted'`, (err, rows) => {
      if (err) return rej(err);
      const b = {};
      rows.forEach(r => {
        const d = r.akun_debit ? String(r.akun_debit).split(' ')[0] : null;
        const k = r.akun_kredit ? String(r.akun_kredit).split(' ')[0] : null;
        if (d && !isNaN(parseInt(d[0]))) b[d] = (b[d]||0) + num(r.debit);
        if (k && !isNaN(parseInt(k[0]))) b[k] = (b[k]||0) - num(r.kredit);
      });
      res(b);
    });
  });
}

function getJurnalBalances(wb, nameLookup) {
  const ws = wb.Sheets['JURNAL FEB 2026'];
  if (!ws) return {};
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const hIdx = rows.findIndex(r => r.some(c => String(c||'').toLowerCase().includes('tgl')));
  const b = {};
  rows.slice(hIdx + 1).forEach(r => {
    const dVal = num(r[5]), kVal = num(r[6]);
    if (dVal===0 && kVal===0) return;
    const name = String(r[3]||'').trim();
    if (!name) return;
    const code = resolveCode(r[0], name, nameLookup);
    b[code] = (b[code]||0) + dVal - kVal;
  });
  return b;
}

function getNeracaLampiranBalances(wb) {
  const ws = wb.Sheets['DATA LAMPIRAN NERACA'];
  if (!ws) return {};
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const b = {};
  rows.slice(2).forEach(r => {
    const code = String(r[1]||'').trim();
    if (!code || !/^\d/.test(code)) return;
    const dVal = num(r[5]), kVal = num(r[6]);
    // The sheet shows absolute debit and credit movements.
    // Asset/Expense (D normal) -> D - K
    // Liab/Equity/Income (K normal) -> K - D (Wait, balance mathematically is always D-K in trial balance)
    // To be consistent with DB (where D is + and K is -):
    b[code] = dVal - kVal;
    
    // Exception: For income and equity, if the movement was purely credit, dVal-kVal is negative.
    // The DB does the same (Pendapatan is negative). So D - K is universal for Trial Balance!
  });
  return b;
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  const nameLookup = await new Promise(res => {
    db.all('SELECT code, name FROM coa', (e, rows) => {
      const b = {};
      rows.forEach(r => b[(r.name||'').toLowerCase().trim()] = r.code);
      res(b);
    });
  });
  
  const dbBal = await getDbBalances(db);
  const wb = XLSX.readFile(path.join(DIR, FEB_FILE));
  const jurBal = getJurnalBalances(wb, nameLookup);
  const nerBal = getNeracaLampiranBalances(wb);
  
  // Also parse LR PERIOD FEB to see what is explicitly reported
  // Just grabbing the bottom line or main accounts from LR PERIOD FEB is hard without visual layout,
  // but we know NERACA LAMPIRAN perfectly matches LR PERIOD FEB because it's a pivot/sum.

  const allKeys = new Set([...Object.keys(dbBal), ...Object.keys(jurBal), ...Object.keys(nerBal)]);
  const keys = Array.from(allKeys).filter(k => /^\d/.test(k)).sort();
  
  console.log("Account | DB Balance | DATA LAMPIRAN NERACA | JURNAL FEB 2026 | Match Status");
  console.log("---|---|---|---|---");
  
  keys.forEach(k => {
    const d = Math.round(dbBal[k]||0);
    const n = Math.round(nerBal[k]||0);
    const j = Math.round(jurBal[k]||0);
    if (d===0 && n===0 && j===0) return;
    
    let status = "";
    if (d === n && n === j) status = "✅ All Match";
    else if (d === n) status = "✅ DB Matches Neraca (Jurnal differs)";
    else if (d === j) status = "⚠️ DB Matches Jurnal (Neraca differs)";
    else if (n === j) status = "❌ DB Differs from both";
    else status = "❌ All differ";
    
    // Format large numbers
    const df = d.toLocaleString(), nf = n.toLocaleString(), jf = j.toLocaleString();
    console.log(`${k} | ${df} | ${nf} | ${jf} | ${status}`);
  });
  
  db.close();
}

main().catch(console.error);
