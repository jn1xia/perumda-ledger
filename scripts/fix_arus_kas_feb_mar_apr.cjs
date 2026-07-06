/**
 * fix_arus_kas_feb_mar_apr.cjs
 *
 * Idempotent, surgical fix: replaces report_arus_kas rows for periods
 * 2026-02, 2026-03 and 2026-04 with the OFFICIAL per-period cash-flow sheets
 * (current-month column) from the lampiran Excel files.
 *
 * Background: earlier imports populated these periods from the January DRAFT
 * file's generic "CF <MONTH>" projection sheets ("Februari 2025" placeholders),
 * producing wrong values. The authoritative data lives in the per-month sheets:
 *   2026-02 → "ARUS KAS 2026"        (LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx)
 *   2026-03 → "ARUS KAS MARET 2026"  (LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx)
 *   2026-04 → "ARUS KAS APRIL 2026"  (LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx)
 *
 * Only touches report_arus_kas for those three periods. Safe to run repeatedly.
 * Targets process.env.DB_PATH (Fly volume) or the local server DB by default.
 */
const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'perumda_ledger.db');
const FILES_DIR = path.join(__dirname, '..', 'src', 'FILES');

const TARGETS = [
  { period: '2026-02', file: 'LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx', sheet: 'ARUS KAS 2026' },
  { period: '2026-03', file: 'LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx', sheet: 'ARUS KAS MARET 2026' },
  { period: '2026-04', file: 'LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx', sheet: 'ARUS KAS APRIL 2026' },
];

// Identical parsing to scripts/import_report_data.cjs::parseArusKas
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

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
}
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function main() {
  console.log(`DB: ${DB_PATH}`);

  // Parse all target sheets up-front so a parse failure never mutates the DB
  const parsed = {};
  for (const t of TARGETS) {
    const wb = XLSX.readFile(path.join(FILES_DIR, t.file));
    const ws = wb.Sheets[t.sheet];
    if (!ws) throw new Error(`Sheet "${t.sheet}" not found in ${t.file}`);
    parsed[t.period] = parseArusKas(ws, 2);
    if (parsed[t.period].length === 0) throw new Error(`No rows parsed from ${t.sheet}`);
    console.log(`Parsed ${t.sheet} (${t.period}): ${parsed[t.period].length} rows`);
  }

  const db = new sqlite3.Database(DB_PATH);
  await run(db, 'PRAGMA busy_timeout = 8000');
  for (const t of TARGETS) {
    await run(db, 'DELETE FROM report_arus_kas WHERE period = ?', [t.period]);
    for (const r of parsed[t.period]) {
      await run(db, 'INSERT INTO report_arus_kas (period, sort_order, label, value, is_section) VALUES (?, ?, ?, ?, ?)',
        [t.period, r.order, r.label, r.value, r.isSection ? 1 : 0]);
    }
    const last = await all(db, 'SELECT value FROM report_arus_kas WHERE period = ? AND label LIKE "%Akhir Periode%"', [t.period]);
    console.log(`✅ ${t.period}: ${parsed[t.period].length} rows  | Kas Akhir Periode = ${last[0] ? last[0].value : 'N/A'}`);
  }
  await new Promise((res) => db.close(res));
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
