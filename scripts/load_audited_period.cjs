/**
 * load_audited_period.cjs
 *
 * Loads ONE period's official audited report snapshot (Neraca + Arus Kas +
 * Laba Rugi + LRA categories) from its bundled lampiran Excel into the database,
 * and demotes that month's user-entered (JV-) journals to baseline (XL-) so the
 * snapshot is not double-counted by the report delta overlay.
 *
 * This is the CLI equivalent of POST /api/reports/load-audited and is safe to
 * run directly against the prod volume DB.
 *
 *   DB_PATH=/app/data/perumda_ledger.db node scripts/load_audited_period.cjs 2026-06
 */
const path = require('path');
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const reportImport = require('./import_report_data.cjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'perumda_ledger.db');
const period = String(process.argv[2] || '').trim();

if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
  console.error('Usage: DB_PATH=... node scripts/load_audited_period.cjs YYYY-MM');
  process.exit(1);
}

const src = (reportImport.SOURCES || []).find(s => s.period === period);
if (!src) { console.error(`No audited source configured for ${period}`); process.exit(1); }

// MEMORY-LEAN PARSE: read ONLY the sheets we actually consume (Neraca, Arus Kas,
// Laba Rugi, and each LRA category sheet) and use dense storage. The June "(2)"
// workbook has dozens of heavy sheets; parsing just these (instead of the whole
// book) keeps peak memory to roughly one report's worth of cells. The workbook
// reference is freed right after parsing (see main()) so it isn't held while the
// DB writes run.
const neededSheets = [
  src.neracaSheet, src.cfSheet, src.lrSheet,
  ...(Array.isArray(src.lraSheets)
    ? src.lraSheets.map(s => s.sheet)
    : (src.penerimaanSheet ? [src.penerimaanSheet] : [])),
].filter(Boolean);
let wb = XLSX.readFile(path.join(src.dir || reportImport.FILES_DIR, src.file), { sheets: neededSheets, dense: true });
const db = new sqlite3.Database(DB_PATH);
const run = (sql, p = []) => new Promise((resolve, reject) =>
  db.run(sql, p, function (e) { e ? reject(e) : resolve(this.changes || 0); }));
const all = (sql, p = []) => new Promise((resolve, reject) =>
  db.all(sql, p, (e, r) => e ? reject(e) : resolve(r || [])));

// SAFE migration: ensure the `anggaran.nama_excel` column exists (verbatim Excel
// label, rendered by the LRA UI). PRAGMA-check first; tolerate existing column.
async function ensureNamaExcelColumn() {
  const cols = await all('PRAGMA table_info(anggaran)');
  if (!cols.some(c => String(c.name) === 'nama_excel')) {
    await run('ALTER TABLE anggaran ADD COLUMN nama_excel TEXT').catch(() => {});
  }
}

async function loadLraToAnggaran(kategori, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const bulan = parseInt(period.split('-')[1], 10);
  await run('DELETE FROM anggaran WHERE kategori=? AND bulan=?', [kategori, bulan]);
  let n = 0;
  for (const r of rows) {
    const outline = String(r.outline || '').trim();
    if (!/^\d+(\.\d+)*$/.test(outline)) continue;
    await run(
      `INSERT INTO anggaran (kode,nama,nama_excel,kategori,bulan,anggaran_awal,target_bulan,sd_bln_lalu,bulan_ini,realisasi,persentase,is_total)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`,
      [`ANG-${kategori}-${outline}`, outline, (r.nama != null ? String(r.nama) : ''), kategori, bulan,
       Number(r.anggaran) || 0, Number(r.target) || 0, Number(r.sdBlnLalu) || 0,
       Number(r.bulanIni) || 0, Number(r.realisasi) || 0, Number(r.persen) || 0]);
    n++;
  }
  return n;
}

async function main() {
  const baselinePrefix = `XL-${period}-`;
  const loaded = { neraca: 0, arus_kas: 0, laba_rugi: 0, journals_rebased: 0, lra: {} };
  await ensureNamaExcelColumn();
  await run('BEGIN TRANSACTION');
  await run('PRAGMA defer_foreign_keys = ON');
  try {
    // Demote this month's delta journals to baseline.
    loaded.journals_rebased = await run(
      "UPDATE journal_lines SET journal_id = ? || substr(journal_id, 9) WHERE journal_id LIKE 'JV-2026-%' AND substr(tanggal,1,7)=?", [baselinePrefix, period]);
    await run("UPDATE journals SET id = ? || substr(id, 9) WHERE id LIKE 'JV-2026-%' AND substr(tanggal,1,7)=?", [baselinePrefix, period]);

    const nWs = wb.Sheets[src.neracaSheet];
    if (nWs) {
      await run('DELETE FROM report_neraca WHERE period=?', [period]);
      const rows = reportImport.parseNeraca(nWs);
      for (const r of rows) await run('INSERT INTO report_neraca (period, sort_order, label, value, depth) VALUES (?, ?, ?, ?, ?)', [period, r.order, r.label, r.value, r.depth]);
      loaded.neraca = rows.length;
    }
    const cWs = src.cfSheet && wb.Sheets[src.cfSheet];
    if (cWs) {
      await run('DELETE FROM report_arus_kas WHERE period=?', [period]);
      const rows = reportImport.parseArusKas(cWs, src.cfValCol || 2);
      for (const r of rows) await run('INSERT INTO report_arus_kas (period, sort_order, label, value, is_section) VALUES (?, ?, ?, ?, ?)', [period, r.order, r.label, r.value, r.isSection ? 1 : 0]);
      loaded.arus_kas = rows.length;
    }
    const lWs = src.lrSheet && wb.Sheets[src.lrSheet];
    if (lWs) {
      await run('DELETE FROM report_laba_rugi WHERE period=?', [period]);
      const rows = reportImport.parseLabaRugi(lWs, src.lrValCol || 9);
      for (const r of rows) await run('INSERT INTO report_laba_rugi (period, sort_order, label, value, depth) VALUES (?, ?, ?, ?, ?)', [period, r.order, r.label, r.value, r.depth]);
      loaded.laba_rugi = rows.length;
    }
    const lraSheets = Array.isArray(src.lraSheets) ? src.lraSheets
      : (src.penerimaanSheet ? [{ sheet: src.penerimaanSheet, kategori: 'penerimaan' }] : []);
    for (const ls of lraSheets) {
      const ws = wb.Sheets[ls.sheet];
      if (!ws) continue;
      // Pick the parser by category layout:
      //   bebanOperasional → 3-level parseBebanOperasional
      //   bebanInvestasi   → 3-level parseInvestasi (detail rincian rows)
      //   else (penerimaan / bebanUmum) → flat parsePenerimaan
      const parse = ls.kategori === 'bebanOperasional' ? reportImport.parseBebanOperasional
        : ls.kategori === 'bebanInvestasi' ? reportImport.parseInvestasi
        : reportImport.parsePenerimaan;
      loaded.lra[ls.kategori] = await loadLraToAnggaran(ls.kategori, parse(ws));
    }
    await run('COMMIT');
  } catch (e) {
    await run('ROLLBACK').catch(() => {});
    throw e;
  }
  // Free the parsed workbook before reporting/closing — identical data already
  // written to the DB, so we no longer need it in memory.
  wb = null;
  if (typeof global.gc === 'function') { try { global.gc(); } catch (_) { /* noop */ } }
  console.log(`Loaded audited snapshot for ${period}:`, JSON.stringify(loaded));
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
