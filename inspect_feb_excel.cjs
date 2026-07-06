/**
 * inspect_feb_excel.cjs
 * Inspects the February Excel to understand structure
 */
const XLSX = require('xlsx');
const path = require('path');

const DIR = path.join(__dirname, 'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026');
const FEB_FILE = 'DRAFT AUDITED -LAMPIRAN LAPORAN BULAN FEBRUARI 2026.xlsx';
const FEB_SHEET = 'JURNAL FEB 2026';

function num(v) {
  if (typeof v === 'number') return v;
  if (!v || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

const wb = XLSX.readFile(path.join(DIR, FEB_FILE));
console.log('Sheets:', wb.SheetNames);

const ws = wb.Sheets[FEB_SHEET];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log('\nFirst 10 rows:');
rows.slice(0,10).forEach((r, i) => console.log(`Row ${i}:`, r.slice(0,8)));

const hIdx = rows.findIndex(r => r.some(c => String(c||'').toLowerCase().includes('tgl')));
console.log('\nHeader row index:', hIdx);
console.log('Header row:', rows[hIdx]);

// Show first 30 data rows
const dataRows = rows.slice(hIdx + 1);
console.log('\nFirst 30 data rows (col0=code, col1=date, col2=jNo, col3=name, col4=sub, col5=D, col6=K):');
let totalD = 0, totalK = 0;
dataRows.slice(0, 100).forEach((r, i) => {
  const dVal = num(r[5]);
  const kVal = num(r[6]);
  if (dVal > 0 || kVal > 0) {
    totalD += dVal;
    totalK += kVal;
    console.log(`  [${hIdx+1+i}] code=${r[0]}, jNo=${r[2]}, name="${r[3]}", sub="${r[4]}", D=${dVal.toLocaleString()}, K=${kVal.toLocaleString()}, ket="${r[7]}"`);
  }
});
console.log(`\n(first 100 data rows) TotalD=${totalD.toLocaleString()}, TotalK=${totalK.toLocaleString()}`);

// Sum all D and K
let totD = 0, totK = 0;
dataRows.forEach(r => { totD += num(r[5]); totK += num(r[6]); });
console.log(`\nGrand total D=${totD.toLocaleString()}, K=${totK.toLocaleString()}`);

// Group by account code that are valid
const acctTotals = {};
dataRows.forEach(r => {
  const code = String(r[0]||'').trim();
  const name = String(r[3]||'').trim();
  const dVal = num(r[5]);
  const kVal = num(r[6]);
  if (!name || (dVal === 0 && kVal === 0)) return;
  const key = `${code}|${name}`;
  if (!acctTotals[key]) acctTotals[key] = { code, name, d: 0, k: 0 };
  acctTotals[key].d += dVal;
  acctTotals[key].k += kVal;
});

console.log('\n=== Account Totals from Excel ===');
Object.values(acctTotals).sort((a,b) => a.code.localeCompare(b.code)).forEach(x => {
  const net = x.d - x.k;
  if (Math.abs(net) > 0) {
    console.log(`  code="${x.code}", name="${x.name}" → D=${Math.round(x.d).toLocaleString()}, K=${Math.round(x.k).toLocaleString()}, NET=${Math.round(net).toLocaleString()}`);
  }
});
