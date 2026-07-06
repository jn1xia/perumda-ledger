/**
 * import_report_data.cjs
 * 
 * Imports NERACA and ARUS KAS data from Excel files.
 * Uses ONLY the primary Neraca sheets (with " 2026" suffix) from each file.
 * 
 * Source sheets:
 *   Jan: "NERACA JAN 2026" from DRAFT AUDITED file
 *   Feb: "NERACA FEB 2026" from Feb file
 *   Mar: "NERACA MARET 2026" from Mar file
 *   Apr: "NERACA APRIL 2026" from Apr file
 */
const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'perumda_ledger.db');
const FILES_DIR = path.join(__dirname, '..', 'src', 'FILES');
// Monthly lampiran files that live outside src/FILES (e.g. Mei 2026 onward) can
// set a per-source `dir`. Defaults to FILES_DIR when omitted.
const MEI_DIR = path.join(__dirname, '..', 'src', 'Mei Data');
const JUNI_DIR = path.join(__dirname, '..', 'src', 'Mei Data', 'june data');

// Explicit mapping: period → { file, neracaSheet, cfSheet, lrSheet }
// Laba Rugi current-month value is in column 9 (lrValCol).
const SOURCES = [
  {
    period: '2026-01', label: 'Januari',
    file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx',
    neracaSheet: 'NERACA JAN 2026',
    cfSheet: 'ARUS KAS 2026',
    cfValCol: 2,
    lrSheet: 'LABA RUGI JAN 2026',
    lrValCol: 9,
  },
  {
    period: '2026-02', label: 'Februari',
    file: 'LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx',
    neracaSheet: 'NERACA FEB 2026',
    cfSheet: 'ARUS KAS 2026',
    cfValCol: 2,
    lrSheet: 'LABA RUGI FEB 2026',
    lrValCol: 9,
  },
  {
    period: '2026-03', label: 'Maret',
    file: 'LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx',
    neracaSheet: 'NERACA MARET 2026',
    cfSheet: 'ARUS KAS MARET 2026',
    cfValCol: 2,
    lrSheet: 'LABA RUGI MARET 2026',
    lrValCol: 9,
  },
  {
    period: '2026-04', label: 'April',
    file: 'LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx',
    neracaSheet: 'NERACA APRIL 2026',
    cfSheet: 'ARUS KAS APRIL 2026',
    cfValCol: 2,
    lrSheet: 'LABA RUGI APRIL 2026',
    lrValCol: 9,
  },
  {
    // Mei 2026 — official lampiran lives in src/Mei Data. Neraca, Arus Kas and
    // Laba Rugi are imported as the audited reference snapshot.
    period: '2026-05', label: 'Mei',
    dir: MEI_DIR,
    file: 'LAMPIRAN LAPORAN KEUANGAN MEI 2026 (2).xlsx',
    neracaSheet: 'NERACA MEI 2026',
    cfSheet: 'ARUS KAS MEI 2026',
    cfValCol: 2,
    lrSheet: 'LABA RUGI MEI 2026',
    lrValCol: 9,
    penerimaanSheet: 'Penerimaan',
    // LRA category sheets that share the Penerimaan layout (outline col 3, values col 6-11).
    lraSheets: [
      { sheet: 'Penerimaan', kategori: 'penerimaan' },
      { sheet: 'Beban Umum', kategori: 'bebanUmum' },
      { sheet: ' Investasi', kategori: 'bebanInvestasi' },
    ],
  },
  {
    // Juni 2026 — official audited reference lampiran "(2)" in src/FILES.
    // Re-baselined (task 5.2) from the interim file in src/Mei Data/june data to
    // the official "LAMPIRAN LAPORAN KEUANGAN JUNI 2026  (2).xlsx" (note the
    // DOUBLE space before "(2)"). Used as the audited baseline so June reports
    // match the Excel exactly and June journals (XL- baseline) are not
    // double-counted by the delta overlay. NOTE: this same swap (source → (2) →
    // load-audited) is the official procedure whenever a new audited Excel ships.
    period: '2026-06', label: 'Juni',
    dir: FILES_DIR,
    file: 'LAMPIRAN LAPORAN KEUANGAN JUNI 2026  (2).xlsx',
    neracaSheet: 'NERACA JUNI 2026',
    cfSheet: 'ARUS KAS JUNI 2026',
    cfValCol: 2,
    lrSheet: 'LABA RUGI JUNI 2026',
    lrValCol: 9,
    penerimaanSheet: 'Penerimaan',
    lraSheets: [
      { sheet: 'Penerimaan', kategori: 'penerimaan' },
      { sheet: 'Beban Umum', kategori: 'bebanUmum' },
      { sheet: ' Investasi', kategori: 'bebanInvestasi' },
      // Task 5.3: Beban Operasional uses a 3-level layout → parsed by
      // parseBebanOperasional (NOT parsePenerimaan). Trailing space in sheet name.
      { sheet: 'Beban Operasional ', kategori: 'bebanOperasional' },
    ],
  },
];

// Also import CF monthly sheets from Jan file
const CF_MONTHLY = [
  { period: '2026-01', sheet: 'CF JAN', file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx' },
  { period: '2026-02', sheet: 'CF FEB', file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx' },
  { period: '2026-03', sheet: 'CF MAR', file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx' },
  { period: '2026-04', sheet: 'CF APR', file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx' },
  { period: '2026-07', sheet: 'CF JULI', file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx' },
  { period: '2026-08', sheet: 'CF AGT', file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx' },
  { period: '2026-09', sheet: 'CF SEP', file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx' },
  { period: '2026-10', sheet: 'CF OKT', file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx' },
  { period: '2026-11', sheet: 'CF NOV', file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx' },
  { period: '2026-12', sheet: 'CF DES', file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx' },
];

// Best-effort release hook so peak memory stays at roughly ONE workbook at a
// time. We explicitly drop each workbook reference after its period/source is
// processed; if node was started with --expose-gc we also nudge the collector
// so the 8.7 MB+ June workbook isn't held alongside the next file on the
// memory-constrained remote builder. Harmless no-op when gc isn't exposed.
function releaseMem() {
  if (typeof global.gc === 'function') { try { global.gc(); } catch (_) { /* noop */ } }
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve(this) }));
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

// Parse NERACA sheet — value in column 8 (current month amount)
function parseNeraca(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const rows = [];
  let orderNum = 0;
  
  data.forEach((row) => {
    let label = '', value = null, depth = 0;
    
    // Find first non-empty string in cols 0-7 (gives us depth and label)
    for (let col = 0; col < Math.min(row.length, 8); col++) {
      if (typeof row[col] === 'string' && row[col].trim()) {
        label = row[col].trim();
        depth = col;
        break;
      }
    }
    
    if (!label) return;
    // Skip header rows
    if (label.includes('PERUSAHAAN') || label.includes('LAPORAN') || 
        label.includes('Untuk Periode') || label.includes('Berakhir') ||
        label.match(/^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4}$/) ||
        label.match(/^\(Audited\)$/) || label === 'Rp' || label === 'Rp.') return;
    
    // Value in column 8 (current month)
    if (typeof row[8] === 'number') {
      value = row[8];
    }
    
    rows.push({ order: orderNum++, label, value, depth });
  });
  
  return rows;
}

// Parse Arus Kas sheet
function parseArusKas(ws, valCol = 2) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const rows = [];
  let orderNum = 0;
  
  data.forEach((row) => {
    let label = '', value = null, isSection = false;
    
    if (typeof row[0] === 'string' && row[0].trim() && row[0].trim() !== ' ') {
      label = row[0].trim();
      isSection = true;
      value = typeof row[valCol] === 'number' ? row[valCol] : null;
    } else if (typeof row[1] === 'string' && row[1].trim() && row[1].trim() !== ' ') {
      label = row[1].trim();
      value = typeof row[valCol] === 'number' ? row[valCol] : null;
    }
    
    if (!label) return;
    if (label.includes('PERUSAHAAN') || label.includes('LAPORAN ARUS') || 
        label.includes('Untuk Periode') || label.includes('Audited') || 
        label.includes('2025') || label.includes('2026')) {
      if (!label.includes('Arus Kas')) return;
    }
    
    rows.push({ order: orderNum++, label, value, isSection });
  });
  
  return rows;
}

// Parse LABA RUGI sheet — label depth from columns 0..valCol-1, value in column 9 (current month)
function parseLabaRugi(ws, valCol = 9) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const rows = [];
  let orderNum = 0;
  
  data.forEach((row) => {
    let label = '', value = null, depth = 0;
    
    // Find first non-empty string before the value column (gives depth + label)
    for (let col = 0; col < Math.min(row.length, valCol); col++) {
      if (typeof row[col] === 'string' && row[col].trim()) {
        label = row[col].trim();
        depth = col;
        break;
      }
    }
    
    if (!label) return;
    // Skip header / marker / footnote rows
    if (label.includes('PERUSAHAAN') || label.includes('LAPORAN LABA') ||
        label.includes('Untuk Periode') || label.includes('Berakhir') ||
        label.match(/^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4}$/) ||
        label.match(/^\(Audited\)$/) || label === 'Rp' || label === 'Rp.' ||
        label === '2.3' || label.startsWith('*')) return;
    
    if (typeof row[valCol] === 'number') value = row[valCol];
    
    rows.push({ order: orderNum++, label, value, depth });
  });
  
  return rows;
}

// Parse the "Penerimaan" LRA sheet → leaf budget-realization rows.
// Columns: [3]=outline (1.1), [4]=name, [6]=Target 1 Tahun (anggaran),
// [7]=Target bulan, [8]=Sd bln lalu, [9]=Bulan ini, [10]=Sd bulan ini, [11]=%.
function parsePenerimaan(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const rows = [];
  data.forEach(r => {
    const o = r[3] == null ? '' : String(r[3]).trim();
    if (!/^\d+\.\d+$/.test(o)) return; // only leaf outline rows (1.1, 2.10, 3.1)
    rows.push({
      outline: o,
      nama: String(r[4] || '').trim(),
      anggaran: Number(r[6]) || 0,
      target: Number(r[7]) || 0,
      sdBlnLalu: Number(r[8]) || 0,
      bulanIni: Number(r[9]) || 0,
      realisasi: Number(r[10]) || 0,
      persen: Number(r[11]) || 0,
    });
  });
  return rows;
}

// Parse the " Investasi" LRA sheet (NOTE the leading space in the sheet name).
//
// Layout (same value columns as Penerimaan): outline col 3, name col 4,
// anggaran col 6, target col 7, sd_bln_lalu col 8, bulan_ini col 9,
// realisasi (sd bln ini) col 10, % col 11. The sheet is THREE levels deep:
//
//   group header   col2=number, col4=group name, NO outline, NO budget value
//   sub-item       col3="1.1"   (level-2 outline) — may itself have detail rows
//   detail rincian col3 EMPTY, col4="a. …" detail label + budget value
//
// The flat parsePenerimaan only captures the level-2 "1.1" rows and drops every
// detail rincian (where the real per-line realization lives). This 3-level-aware
// parser ADDITIONALLY synthesizes a child outline ("1.1.1", "1.1.2", …) for each
// detail row under the last seen level-2 parent, capturing the VERBATIM Excel
// label (`nama`) so the UI can render every line exactly like the Excel.
// "Total" / "TOTAL INVESTASI" summary rows are skipped (the report draws totals
// itself, and the LRA hierarchy aggregates children bottom-up).
function parseInvestasi(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const rows = [];
  let lastParent = null; // last level-2 outline, e.g. "1.5"
  let childSeq = 0;      // detail counter under lastParent
  const makeRow = (outline, nama, r) => ({
    outline,
    nama: String(nama || '').trim(),
    anggaran: Number(r[6]) || 0,
    target: Number(r[7]) || 0,
    sdBlnLalu: Number(r[8]) || 0,
    bulanIni: Number(r[9]) || 0,
    realisasi: Number(r[10]) || 0,
    persen: Number(r[11]) || 0,
  });
  for (const r of data) {
    if (!r) continue;
    const oCell = r[3] == null ? '' : String(r[3]).trim();
    const label = r[4] == null ? '' : String(r[4]).trim();
    const hasBudget = typeof r[6] === 'number';
    if (/^\d+\.\d+$/.test(oCell)) {
      // Level-2 sub-item — resets the detail counter for its children.
      lastParent = oCell;
      childSeq = 0;
      rows.push(makeRow(oCell, label, r));
      continue;
    }
    if (!oCell && label && lastParent) {
      const up = label.toUpperCase();
      // Skip group "Total" and the grand "TOTAL INVESTASI" rows.
      if (up === 'TOTAL' || up.startsWith('TOTAL INVESTASI')) continue;
      // Group header rows carry a label but no budget value → skip (a new
      // level-2 row that follows will reset lastParent anyway).
      if (!hasBudget) continue;
      // Detail rincian under the current parent → synthesize a child outline.
      childSeq += 1;
      rows.push(makeRow(`${lastParent}.${childSeq}`, label, r));
    }
  }
  return rows;
}

// Parse the "Beban Operasional " LRA sheet — a 3-level outline layout that the
// flat parsePenerimaan cannot handle. Verbatim port of parseBebanOperasional in
// src/utils/reportSnapshot.js (also mirrored in scripts/explore_overlay_delta.cjs):
//   group col2 / sub-group col3 / rincian col4; name col5;
//   anggaran col7, target col8, sd_bln_lalu col9, bulan_ini col10,
//   realisasi (sd bln ini) col11, % col12. "Total" rows are skipped.
function parseBebanOperasional(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const rows = [];
  for (const r of data) {
    if (!r) continue;
    const sub = r[3] == null ? '' : String(r[3]).trim();
    const leaf = r[4] == null ? '' : String(r[4]).trim();
    let outline = '';
    if (/^\d+\.\d+\.\d+$/.test(leaf)) outline = leaf;
    else if (/^\d+\.\d+$/.test(sub)) outline = sub;
    else continue;
    const nama = String(r[5] || '').trim();
    if (!nama || nama.toLowerCase() === 'total') continue;
    rows.push({
      outline, nama,
      anggaran: Number(r[7]) || 0,
      target: Number(r[8]) || 0,
      sdBlnLalu: Number(r[9]) || 0,
      bulanIni: Number(r[10]) || 0,
      realisasi: Number(r[11]) || 0,
      persen: Number(r[12]) || 0,
    });
  }
  return rows;
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);  // Create tables
  await run(db, `CREATE TABLE IF NOT EXISTS report_neraca (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    label TEXT NOT NULL,
    value REAL,
    depth INTEGER DEFAULT 0
  )`);
  
  await run(db, `CREATE TABLE IF NOT EXISTS report_arus_kas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    label TEXT NOT NULL,
    value REAL,
    is_section INTEGER DEFAULT 0
  )`);
  
  await run(db, `CREATE TABLE IF NOT EXISTS report_laba_rugi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    label TEXT NOT NULL,
    value REAL,
    depth INTEGER DEFAULT 0
  )`);
  
  // Clear ALL existing data
  await run(db, 'DELETE FROM report_neraca');
  await run(db, 'DELETE FROM report_arus_kas');
  await run(db, 'DELETE FROM report_laba_rugi');
  
  let totalN = 0, totalCF = 0, totalLR = 0;
  
  // ── Import NERACA from each source ──
  for (const src of SOURCES) {
    console.log(`\n── ${src.label} (${src.period}) ──`);
    
    let wb;
    try {
      // MEMORY-LEAN PARSE: read ONLY the sheets this loop consumes (Neraca +
      // Laba Rugi) with dense storage so we never load the whole multi-sheet
      // "(2)" workbook (8.7 MB+, dozens of heavy sheets) into memory on the
      // remote builder — that full-workbook read OOM-kills the 512 MB build VM.
      const neededSheets = [src.neracaSheet, src.lrSheet].filter(Boolean);
      wb = XLSX.readFile(path.join(src.dir || FILES_DIR, src.file), { sheets: neededSheets, dense: true });
    } catch (e) {
      console.log(`   ❌ File not found: ${src.file}`);
      continue;
    }
    
    const ws = wb.Sheets[src.neracaSheet];
    if (!ws) {
      console.log(`   ❌ Sheet "${src.neracaSheet}" not found`);
      continue;
    }
    
    const rows = parseNeraca(ws);
    console.log(`   📊 Neraca: ${rows.length} rows from "${src.neracaSheet}"`);
    
    for (const r of rows) {
      await run(db, 'INSERT INTO report_neraca (period, sort_order, label, value, depth) VALUES (?, ?, ?, ?, ?)',
        [src.period, r.order, r.label, r.value, r.depth]);
      totalN++;
    }
    
    // Verify key values
    const jumlahAset = rows.find(r => r.label === 'JUMLAH ASET');
    const jumlahKewajiban = rows.find(r => r.label === 'JUMLAH KEWAJIBAN');
    const jumlahEkuitas = rows.find(r => r.label === 'JUMLAH EKUITAS');
    console.log(`   ✓ JUMLAH ASET:       ${jumlahAset?.value?.toLocaleString() || 'N/A'}`);
    console.log(`   ✓ JUMLAH KEWAJIBAN:  ${jumlahKewajiban?.value?.toLocaleString() || 'N/A'}`);
    console.log(`   ✓ JUMLAH EKUITAS:    ${jumlahEkuitas?.value?.toLocaleString() || 'N/A'}`);
    
    // ── Import LABA RUGI from the same file ──
    if (src.lrSheet) {
      const wsLR = wb.Sheets[src.lrSheet];
      if (!wsLR) {
        console.log(`   ❌ Sheet "${src.lrSheet}" not found`);
      } else {
        const lrRows = parseLabaRugi(wsLR, src.lrValCol || 9);
        for (const r of lrRows) {
          await run(db, 'INSERT INTO report_laba_rugi (period, sort_order, label, value, depth) VALUES (?, ?, ?, ?, ?)',
            [src.period, r.order, r.label, r.value, r.depth]);
          totalLR++;
        }
        const labaBersih = lrRows.find(r => r.label.includes('BERSIH SETELAH PAJAK'));
        console.log(`   📈 Laba Rugi: ${lrRows.length} rows from "${src.lrSheet}"  | Laba Bersih: ${labaBersih?.value?.toLocaleString() || 'N/A'}`);
      }
    }

    // Release this workbook before reading the next source so we never hold
    // two parsed workbooks (incl. the large June "(2)" file) at once.
    wb = null;
    releaseMem();
  }
  
  // ── Import ARUS KAS ──
  // IMPORTANT: the per-period official sheets (e.g. "ARUS KAS 2026",
  // "ARUS KAS MARET 2026") are the source of truth and MUST take precedence.
  // The generic "CF <MONTH>" sheets in the January DRAFT file are projection
  // placeholders (labelled "Februari 2025" etc.) and are only used as a
  // fallback for months that have no dedicated file (May–Dec).
  console.log('\n── Arus Kas ──');

  // 1) Official per-period CF sheets first (highest precedence)
  for (const src of SOURCES) {
    let wb;
    // Read ONLY the Arus Kas sheet (dense) — avoids loading the full "(2)"
    // workbook into memory and OOM-killing the remote build VM.
    try { wb = XLSX.readFile(path.join(src.dir || FILES_DIR, src.file), { sheets: [src.cfSheet].filter(Boolean), dense: true }); } catch(e) { continue; }
    
    const ws = wb.Sheets[src.cfSheet];
    if (!ws) {
      console.log(`   ⚠️  CF sheet "${src.cfSheet}" not found in ${src.file}`);
      continue;
    }
    
    const rows = parseArusKas(ws, src.cfValCol || 2);
    if (rows.length === 0) continue;
    
    console.log(`   💰 ${src.cfSheet} → ${src.period}: ${rows.length} rows`);
    for (const r of rows) {
      await run(db, 'INSERT INTO report_arus_kas (period, sort_order, label, value, is_section) VALUES (?, ?, ?, ?, ?)',
        [src.period, r.order, r.label, r.value, r.isSection ? 1 : 0]);
      totalCF++;
    }

    // Free the workbook before re-reading the next source file.
    wb = null;
    releaseMem();
  }

  // 2) Fallback: generic monthly CF sheets — only for periods not already imported
  for (const cf of CF_MONTHLY) {
    const existing = await all(db, 'SELECT COUNT(*) as cnt FROM report_arus_kas WHERE period = ?', [cf.period]);
    if (existing[0].cnt > 0) continue;
    
    let wb;
    try {
      wb = XLSX.readFile(path.join(FILES_DIR, cf.file), { sheets: [cf.sheet].filter(Boolean), dense: true });
    } catch (e) { continue; }
    
    const ws = wb.Sheets[cf.sheet];
    if (!ws) continue;
    
    const rows = parseArusKas(ws, 2);
    if (rows.length === 0) continue;
    
    console.log(`   💰 ${cf.sheet} → ${cf.period}: ${rows.length} rows (fallback)`);
    for (const r of rows) {
      await run(db, 'INSERT INTO report_arus_kas (period, sort_order, label, value, is_section) VALUES (?, ?, ?, ?, ?)',
        [cf.period, r.order, r.label, r.value, r.isSection ? 1 : 0]);
      totalCF++;
    }

    // Free the workbook before the next fallback iteration.
    wb = null;
    releaseMem();
  }
  
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  TOTAL: ${totalN} Neraca rows, ${totalCF} Arus Kas rows, ${totalLR} Laba Rugi rows`);
  console.log(`═══════════════════════════════════════`);
  
  // Verify
  const neracaPeriods = await all(db, 'SELECT period, COUNT(*) as cnt FROM report_neraca GROUP BY period ORDER BY period');
  console.log('\nNeraca periods:', neracaPeriods);
  
  const cfPeriods = await all(db, 'SELECT period, COUNT(*) as cnt FROM report_arus_kas GROUP BY period ORDER BY period');
  console.log('Arus Kas periods:', cfPeriods);
  
  const lrPeriods = await all(db, 'SELECT period, COUNT(*) as cnt FROM report_laba_rugi GROUP BY period ORDER BY period');
  console.log('Laba Rugi periods:', lrPeriods);
  
  db.close();
  console.log('\nDone!');
}

module.exports = { parseNeraca, parseArusKas, parseLabaRugi, parsePenerimaan, parseInvestasi, parseBebanOperasional, SOURCES, FILES_DIR, MEI_DIR };

if (require.main === module) {
  main().catch(console.error);
}