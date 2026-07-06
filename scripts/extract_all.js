const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const janFile = 'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026/DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026.xlsx';
const febFile = 'src/FILES/LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx';
const marFile = 'src/FILES/LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx';
const aprFile = 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx';

const wbJ = XLSX.readFile(janFile);
const wbF = XLSX.readFile(febFile);
const wbM = XLSX.readFile(marFile);
const wbA = XLSX.readFile(aprFile);

function sheetRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

function printSheet(wb, sheetName, label) {
  const rows = sheetRows(wb, sheetName);
  if (!rows.length) { console.log(label + ': NOT FOUND'); return; }
  console.log('\n=== ' + label + ' ===');
  rows.forEach((row, i) => {
    const vals = row.map(c => typeof c === 'number' ? c : String(c).trim()).filter(c => c !== '');
    if (vals.length > 0) console.log('R' + (i+1) + ': ' + JSON.stringify(vals));
  });
}

// ---- LABA RUGI ----
printSheet(wbJ, 'LABA RUGI JAN 2026',  'LR JAN');
printSheet(wbF, 'LABA RUGI FEB 2026',  'LR FEB');
printSheet(wbM, 'LABA RUGI MARET 2026','LR MAR');
printSheet(wbA, 'LABA RUGI APRIL 2026','LR APR');
