const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const DIR = path.join(__dirname, 'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026');
const FEB_FILE = 'DRAFT AUDITED -LAMPIRAN LAPORAN BULAN FEBRUARI 2026.xlsx';
const FEB_SHEET = 'JURNAL FEB 2026';

function num(v) {
  if (typeof v === 'number') return v;
  if (!v || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// Build name → code lookup from COA (and common aliases)
function buildCOALookup(db) {
  return new Promise((res) => {
    db.all('SELECT code, name FROM coa', (e, rows) => {
      const byName = {};
      rows.forEach(r => { byName[(r.name||'').toLowerCase().trim()] = r.code; });
      res(byName);
    });
  });
}

const FIXED_NAME_MAP = {
  'bank kalsel': '11103', 'bank bni bisnis': '11106', 'bank bni tapcash': '11107',
  'bank bni': '11104', 'kas kecil': '11101', 'bbm dibayar di muka': '11501',
  'piutang usaha': '11201', 'persediaan barang dagang': '11401',
  'persediaan barang dagang (gas lpg)': '11402', 'utang daerah': '21000',
  'pendapatan bisnis utama': '41000', 'pendapatan bisnis lainnya': '42000',
  'pendapatan pengembangan bisnis lainnya': '42000', 'pendapatan di luar operasional': '70000',
  'beban di luar operasional': '80000', 'beban pokok penjualan (bapok & gerai inflasi)': '51010',
  'beban pokok penjualan (gas lpg)': '51020', 'akumulasi penyusutan bangunan': '12102.2',
  'akumulasi penyusutan kendaraan': '12201.2', 'akumulasi penyusutan mesin': '12202.2',
  'akumulasi penyusutan instalasi listrik': '12203.2', 'akumulasi penyusutan peralatan': '12204.2',
  'beban penyusutan aktiva tetap': '61130',
};

function isValidCode(raw) {
  if (!raw) return false;
  return /^\d{4,6}(\.\d+)?$/.test(raw) && /^(11|12|13|21|22|31|32|33|34|41|42|43|51|61|62|70|80)\d/.test(raw);
}

const FORCE_NAME_LOOKUP = new Set(['61140', '561510', '611547']);

function resolveCode(codeRaw, name, nameLookup) {
  const nameKey = (name || '').toLowerCase().trim();
  if (FORCE_NAME_LOOKUP.has(codeRaw) || !isValidCode(codeRaw)) {
    if (FIXED_NAME_MAP[nameKey]) return FIXED_NAME_MAP[nameKey];
    for (const [k, v] of Object.entries(FIXED_NAME_MAP)) {
      if (nameKey.includes(k) || k.includes(nameKey.split(' ').slice(0,2).join(' '))) return v;
    }
    if (nameLookup[nameKey]) return nameLookup[nameKey];
    for (const [k, v] of Object.entries(nameLookup)) {
      if (nameKey && k.includes(nameKey)) return v;
    }
    if (nameKey.includes('bank kalsel')) return '11103';
    if (nameKey.includes('bank bni bisnis')) return '11106';
    if (nameKey.includes('bank bni tapcash')) return '11107';
    if (nameKey.includes('bank bni')) return '11104';
    if (nameKey.includes('kas kecil')) return '11101';
    if (nameKey.includes('bbm dibayar')) return '11501';
    if (nameKey.includes('piutang usaha')) return '11201';
    if (nameKey.includes('utang')) return '21000';
    if (nameKey.includes('persediaan')) return '11401';
    if (nameKey.includes('pendapatan bisnis utama') || nameKey.includes('pendapatan pengelolaan') || 
        nameKey.includes('pendapatan sewa') || nameKey.includes('pendapatan pemeliharaan') ||
        nameKey.includes('pendapatan denda') || nameKey.includes('pendapatan sampah') ||
        nameKey.includes('pendapatan keamanan')) return '41000';
    if (nameKey.includes('pendapatan parkir') || nameKey.includes('pendapatan bisnis lainnya') || 
        nameKey.includes('pendapatan iklan') || nameKey.includes('pendapatan pusat') ||
        nameKey.includes('pendapatan sewa tempat') || nameKey.includes('pendapatan studio') ||
        nameKey.includes('pendapatan gerai') || nameKey.includes('pendapatan air') ||
        nameKey.includes('pendapatan gas lpg')) return '42000';
    if (nameKey.includes('pendapatan bunga') || nameKey.includes('pendapatan lain')) return '70000';
    if (nameKey.includes('beban pajak') || nameKey.includes('beban administrasi bank') ||
        nameKey.includes('beban lain') || nameKey.includes('beban di luar')) return '80000';
    if (nameKey.includes('penyusutan') && nameKey.includes('beban')) return '61130';
    if (nameKey.includes('akumulasi penyusutan kendaraan')) return '12201.2';
    if (nameKey.includes('akumulasi penyusutan bangunan')) return '12102.2';
    if (nameKey.includes('akumulasi penyusutan mesin')) return '12202.2';
    if (nameKey.includes('akumulasi penyusutan peralatan')) return '12204.2';
    if (nameKey.includes('akumulasi penyusutan instalasi')) return '12203.2';
    return codeRaw;
  }
  return codeRaw;
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
        if (dCode) balances[dCode] = (balances[dCode] || 0) + dVal;
        if (kCode) balances[kCode] = (balances[kCode] || 0) - kVal;
      });
      resolve(balances);
    });
  });
}

function getExcelBalances(filePath, sheetName, nameLookup) {
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
      
      const code = resolveCode(codeRaw, name, nameLookup) || name;
      balances[code] = (balances[code] || 0) + dVal - kVal;
    });
    return balances;
  } catch (e) {
    console.error("Error reading excel:", e);
    return null;
  }
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  const nameLookup = await buildCOALookup(db);
  
  const dbBalances = await getDbBalances(db);
  const xlBalances = getExcelBalances(path.join(DIR, FEB_FILE), FEB_SHEET, nameLookup);
  
  const allKeys = new Set([...Object.keys(dbBalances), ...Object.keys(xlBalances || {})]);
  
  let diffCount = 0;
  console.log("=== DIFFERENCES (DB vs EXCEL FEB) ===");
  console.log("Account".padEnd(15) + " | " + "DB Balance".padStart(15) + " | " + "Excel Balance".padStart(15) + " | " + "Diff".padStart(15));
  console.log("-".repeat(70));
  
  const diffs = [];
  for (const k of allKeys) {
    const dVal = dbBalances[k] || 0;
    const xVal = xlBalances ? (xlBalances[k] || 0) : 0;
    const diff = dVal - xVal;
    
    if (Math.abs(diff) > 1) {
      diffs.push({ k, dVal, xVal, diff });
      diffCount++;
    }
  }
  
  diffs.sort((a,b) => a.k.localeCompare(b.k)).forEach(({k, dVal, xVal, diff}) => {
      console.log(k.padEnd(15) + " | " + Math.round(dVal).toLocaleString().padStart(15) + " | " + Math.round(xVal).toLocaleString().padStart(15) + " | " + Math.round(diff).toLocaleString().padStart(15));
  });
  
  console.log("-".repeat(70));
  console.log(`Total differences found: ${diffCount}`);
  db.close();
}

main().catch(console.error);
