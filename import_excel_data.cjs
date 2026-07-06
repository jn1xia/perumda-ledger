/**
 * import_excel_data.cjs
 * 
 * Imports journal entries + saldo awal from the LAMPIRAN LAPORAN KEUANGAN Excel files
 * into the SQLite database, so that all reports (L/R, Neraca, Arus Kas) match the 
 * Perumda manual exactly.
 *
 * Usage: node import_excel_data.cjs
 */
const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const DIR = path.join(__dirname, 'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026');

const MONTHS_DATA = [
  { file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026.xlsx', jSheet: 'JURNAL JAN 2026', month: '2026-01', label: 'Jan' },
  { file: 'DRAFT AUDITED -LAMPIRAN LAPORAN BULAN FEBRUARI 2026.xlsx', jSheet: 'JURNAL FEB 2026', month: '2026-02', label: 'Feb' },
];

// ─── Promisified DB helpers ───────────────────────────────────────────────────
function dbRun(db, sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function(err) { err ? rej(err) : res(this) }));
}
function dbGet(db, sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
}

// ─── Excel date → ISO ─────────────────────────────────────────────────────────
function xlDate(val, fallbackMonth) {
  if (!val && val !== 0) return fallbackMonth + '-01';
  if (typeof val === 'number' && val > 40000) {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  return fallbackMonth + '-01';
}

function num(v) {
  if (typeof v === 'number') return v;
  if (!v || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ─── Build COA lookup from "Akun Utama" or "COA" sheet ────────────────────────
function buildCOALookup(wb) {
  const coaSheetName = wb.SheetNames.find(s => s.includes('Akun Utama') || s === 'COA');
  const lookup = {};
  const nameLookup = {};
  
  if (coaSheetName) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[coaSheetName], { header: 1, defval: '' });
    rows.forEach(r => {
      const code = String(r[0] || '').trim();
      const name = String(r[1] || '').trim();
      if (code && name && code.match(/^\d/)) {
        lookup[code] = name;
        nameLookup[name.toLowerCase()] = code;
      }
    });
  }
  
  // Also load from DATA LAMPIRAN NERACA
  const nsSheetName = wb.SheetNames.find(s => s === 'DATA LAMPIRAN NERACA');
  if (nsSheetName) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nsSheetName], { header: 1, defval: '' });
    rows.forEach(r => {
      const code = String(r[0] || '').trim();
      const name = String(r[1] || '').trim();
      if (code && name && code.match(/^\d/)) {
        if (!lookup[code]) lookup[code] = name;
        if (!nameLookup[name.toLowerCase()]) nameLookup[name.toLowerCase()] = code;
      }
    });
  }
  
  return { lookup, nameLookup };
}

// ─── Parse January-style journal (date in col0, name-based accounts) ──────────
function parseJanJournal(ws, month, coaLookup) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const hIdx = rows.findIndex(r => String(r[0] || '').toLowerCase().includes('tgl'));
  if (hIdx < 0) return [];
  
  const dataRows = rows.slice(hIdx + 1);
  const entries = [];
  let curDate = null, curNo = null;
  const groups = [];
  let curGroup = null;
  
  dataRows.forEach(r => {
    if (r[0]) curDate = r[0];
    if (r[1]) curNo = r[1];
    
    const akunName = String(r[2] || '').trim();
    const subAkun = String(r[3] || '').trim();
    const dVal = num(r[4]);
    const kVal = num(r[5]);
    const ket = String(r[6] || '').trim();
    
    if (!akunName || (dVal === 0 && kVal === 0)) return;
    
    const code = coaLookup.nameLookup[akunName.toLowerCase()] || '';
    const fullAkun = code ? `${code} ${akunName}` : akunName;
    const fullAkunWithSub = subAkun ? `${fullAkun} > ${subAkun}` : fullAkun;
    
    const key = curDate + '|' + curNo;
    if (!curGroup || curGroup.key !== key) {
      curGroup = { key, date: curDate, no: curNo, lines: [] };
      groups.push(curGroup);
    }
    
    curGroup.lines.push({ akun: fullAkunWithSub, d: dVal, k: kVal, ket });
  });
  
  groups.forEach(g => {
    const allLines = g.lines;
    let pendingDebits = [];
    
    for (const line of allLines) {
      if (line.d > 0) {
        pendingDebits.push(line);
      } else if (line.k > 0 && pendingDebits.length > 0) {
        for (const dLine of pendingDebits) {
          entries.push({
            id: `XL-${month}-${g.no || ''}-${entries.length}`,
            tanggal: xlDate(g.date, month),
            akun_debit: dLine.akun,
            akun_kredit: line.akun,
            debit: dLine.d,
            kredit: dLine.d,
            keterangan: dLine.ket || line.ket,
            status: 'posted'
          });
        }
        pendingDebits = [];
      }
    }
    
    pendingDebits.forEach(dLine => {
      entries.push({
        id: `XL-${month}-${g.no || ''}-unp-${entries.length}`,
        tanggal: xlDate(g.date, month),
        akun_debit: dLine.akun,
        akun_kredit: '',
        debit: dLine.d,
        kredit: dLine.d,
        keterangan: dLine.ket,
        status: 'posted'
      });
    });
  });
  
  return entries;
}

// ─── Parse February-style journal (code in col0, date in col1) ────────────────
function parseFebJournal(ws, month, coaLookup) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const hIdx = rows.findIndex(r => r.some(c => String(c || '').toLowerCase().includes('tgl')));
  if (hIdx < 0) return [];
  
  const dataRows = rows.slice(hIdx + 1);
  const entries = [];
  let curDate = null;
  const groups = [];
  let curGroup = null;
  
  dataRows.forEach(r => {
    const acctCode = String(r[0] || '').trim();
    if (r[1]) curDate = r[1];
    const journalNo = String(r[2] || '').trim();
    const akunName = String(r[3] || '').trim();
    const subAkun = String(r[4] || '').trim();
    const dVal = num(r[5]);
    const kVal = num(r[6]);
    const ket = String(r[7] || '').trim();
    
    if (!akunName || (dVal === 0 && kVal === 0)) return;
    
    const codeFromLookup = acctCode.match(/^\d/) ? acctCode : (coaLookup.nameLookup[akunName.toLowerCase()] || '');
    const fullAkun = codeFromLookup ? `${codeFromLookup} ${akunName}` : akunName;
    const fullAkunWithSub = subAkun ? `${fullAkun} > ${subAkun}` : fullAkun;
    
    const key = curDate + '|' + journalNo;
    if (!curGroup || curGroup.key !== key) {
      curGroup = { key, date: curDate, no: journalNo, lines: [] };
      groups.push(curGroup);
    }
    
    curGroup.lines.push({ akun: fullAkunWithSub, d: dVal, k: kVal, ket });
  });
  
  groups.forEach(g => {
    const allLines = g.lines;
    let pendingDebits = [];
    
    for (const line of allLines) {
      if (line.d > 0) {
        pendingDebits.push(line);
      } else if (line.k > 0 && pendingDebits.length > 0) {
        for (const dLine of pendingDebits) {
          entries.push({
            id: `XL-${month}-${g.no || ''}-${entries.length}`,
            tanggal: xlDate(g.date, month),
            akun_debit: dLine.akun,
            akun_kredit: line.akun,
            debit: dLine.d,
            kredit: dLine.d,
            keterangan: dLine.ket || line.ket,
            status: 'posted'
          });
        }
        pendingDebits = [];
      }
    }
    
    pendingDebits.forEach(dLine => {
      entries.push({
        id: `XL-${month}-${g.no || ''}-unp-${entries.length}`,
        tanggal: xlDate(g.date, month),
        akun_debit: dLine.akun,
        akun_kredit: '',
        debit: dLine.d,
        kredit: dLine.d,
        keterangan: dLine.ket,
        status: 'posted'
      });
    });
  });
  
  return entries;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== PERUMDA LEDGER — Excel Data Import ===\n');
  
  const db = new sqlite3.Database(DB_PATH);
  
  // Read the first file to build COA
  const janPath = path.join(DIR, MONTHS_DATA[0].file);
  const janWb = XLSX.readFile(janPath);
  const coaLookup = buildCOALookup(janWb);
  console.log(`COA loaded: ${Object.keys(coaLookup.lookup).length} accounts\n`);
  
  // 1. Create saldo_awal table if needed
  await dbRun(db, `CREATE TABLE IF NOT EXISTS saldo_awal (
    kode TEXT PRIMARY KEY,
    nama TEXT,
    tipe TEXT DEFAULT 'D',
    saldo REAL DEFAULT 0
  )`);
  
  // Import Saldo Awal
  console.log('── Importing Saldo Awal from DATA LAMPIRAN NERACA...');
  const nsSheetName = janWb.SheetNames.find(s => s === 'DATA LAMPIRAN NERACA');
  let saCount = 0;
  if (nsSheetName) {
    const rows = XLSX.utils.sheet_to_json(janWb.Sheets[nsSheetName], { header: 1, defval: '' });
    const hIdx = rows.findIndex(r => String(r[0] || '').toLowerCase() === 'akun');
    for (const r of rows.slice(hIdx + 1)) {
      const code = String(r[0] || '').trim();
      if (!code.match(/^\d{4,}/)) continue;
      const name = String(r[1] || '').trim();
      const tipe = String(r[2] || 'D').trim();
      const saldo = num(r[3]);
      if (saldo === 0 && !name) continue;
      await dbRun(db, 'INSERT OR REPLACE INTO saldo_awal (kode, nama, tipe, saldo) VALUES (?, ?, ?, ?)', [code, name, tipe, saldo]);
      saCount++;
    }
  }
  console.log(`   → ${saCount} saldo awal records imported.\n`);
  
  // 2. Clear existing XL- prefixed journals
  const delResult = await dbRun(db, "DELETE FROM journals WHERE id LIKE 'XL-%'");
  console.log(`── Cleared ${delResult.changes || 0} existing XL- journal entries.\n`);
  
  // 3. Import journals for each month
  let totalImported = 0;
  
  for (const m of MONTHS_DATA) {
    console.log(`── Processing ${m.label} (${m.month})...`);
    try {
      const wb = XLSX.readFile(path.join(DIR, m.file));
      const ws = wb.Sheets[m.jSheet];
      if (!ws) { console.log(`   Sheet "${m.jSheet}" not found!`); continue; }
      
      let entries;
      if (m.month === '2026-01') {
        entries = parseJanJournal(ws, m.month, coaLookup);
      } else {
        entries = parseFebJournal(ws, m.month, coaLookup);
      }
      
      console.log(`   Parsed ${entries.length} journal entries`);
      
      // Insert all entries
      for (const e of entries) {
        await dbRun(db, `INSERT OR REPLACE INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [e.id, e.tanggal, e.akun_debit, e.akun_kredit, e.debit, e.kredit, e.keterangan, e.status]);
      }
      
      totalImported += entries.length;
      console.log(`   → ${entries.length} entries inserted.\n`);
      
    } catch(e) {
      console.log(`   ERROR: ${e.message}\n`);
    }
  }
  
  // 4. Summary
  const totalJ = await dbGet(db, "SELECT COUNT(*) as cnt FROM journals");
  const totalP = await dbGet(db, "SELECT COUNT(*) as cnt FROM journals WHERE status = 'posted'");
  const xlJ = await dbGet(db, "SELECT COUNT(*) as cnt FROM journals WHERE id LIKE 'XL-%'");
  
  console.log('════════════════════════════════════════');
  console.log(`Total imported this run : ${totalImported}`);
  console.log(`Total XL- journals      : ${xlJ.cnt}`);
  console.log(`Total all journals      : ${totalJ.cnt}`);
  console.log(`Total posted            : ${totalP.cnt}`);
  console.log('════════════════════════════════════════');
  
  // 5. Quick validation
  console.log('\n── Quick L/R validation:');
  const pend41 = await dbGet(db, "SELECT SUM(kredit) as total FROM journals WHERE akun_kredit LIKE '41%' AND tanggal LIKE '2026-01%' AND status='posted'");
  console.log(`   Jan Pendapatan Bisnis Utama (41xxx): Rp ${(pend41.total||0).toLocaleString()}`);
  console.log(`   Expected from Excel               : Rp 552,723,127`);
  
  const pend42 = await dbGet(db, "SELECT SUM(kredit) as total FROM journals WHERE akun_kredit LIKE '42%' AND tanggal LIKE '2026-01%' AND status='posted'");
  console.log(`   Jan Pendapatan Lainnya (42xxx)     : Rp ${(pend42.total||0).toLocaleString()}`);
  console.log(`   Expected from Excel               : Rp 149,632,000`);
  
  const beban61 = await dbGet(db, "SELECT SUM(debit) as total FROM journals WHERE akun_debit LIKE '61%' AND tanggal LIKE '2026-01%' AND status='posted'");
  console.log(`   Jan Beban Admin (61xxx)            : Rp ${(beban61.total||0).toLocaleString()}`);
  console.log(`   Expected from Excel               : Rp 764,813,073`);
  
  db.close();
  console.log('\nDone! Restart the server to see the new data.');
}

main().catch(e => { console.error(e); process.exit(1); });
