#!/usr/bin/env node
/* eslint-disable */
/**
 * set_baseline_minus_template.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * BASELINE-SETTER for the "(2) minus 17–20 June" model.
 *
 * Writes the June 2026 audited snapshot as:
 *
 *        snapshot(June)  =  (2)-parsed-values  −  template-effect
 *
 * where:
 *   • "(2)" is the official audited lampiran
 *     src/FILES/LAMPIRAN LAPORAN KEUANGAN JUNI 2026  (2).xlsx  (double space),
 *   • "template-effect" is the per-line effect of the 17–20 June journals in
 *     src/Mei Data/june data/template per 22 juni.xlsx (34 journals / 46 legs),
 *     computed with the REAL, shipped attribution code
 *     (src/utils/reportDelta.js + src/utils/lraOutline.js, WITH the new
 *     12102.1 / 12300 Neraca aliases and the 62020→1.2.1 / 62100→4.1.1 outline
 *     fixes).
 *
 * Intent:  snapshot + JV(template, as live deltas) == (2), line-for-line.
 *
 * The 17–20 June rows are managed as LIVE DELTAS (kept as JV-/JRN- journals).
 * This script writes ONLY the report snapshots:
 *     report_neraca, report_laba_rugi, report_arus_kas   (for 2026-06)
 *     anggaran  (kategori penerimaan / bebanUmum / bebanInvestasi /
 *                bebanOperasional, bulan 6)
 * It NEVER touches the journals / journal_lines tables — the JV- template
 * journals are NOT demoted (to XL-) and NOT deleted.
 *
 * Honors DB_PATH (defaults to server/perumda_ledger.db — the prod volume path).
 *
 *   # offline dry-run against a copy (recommended before prod):
 *   DB_PATH=/tmp/copy.db node scripts/set_baseline_minus_template.cjs
 *
 *   # prod (next step, NOT part of this offline change):
 *   DB_PATH=/app/data/perumda_ledger.db node scripts/set_baseline_minus_template.cjs
 *
 * Use --dry-run to compute + validate without writing.
 *
 * This module also EXPORTS its pure helpers so the verification harness
 * (scripts/verify_baseline_minus_template.cjs) reuses the EXACT same math.
 */

const path = require('path');
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const reportImport = require('./import_report_data.cjs');

const PERIOD = '2026-06';
const BULAN = 6;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'perumda_ledger.db');
const TEMPLATE_FILE = path.join(__dirname, '..', 'src', 'Mei Data', 'june data', 'template per 22 juni.xlsx');
const TEMPLATE_SHEET = 'Jurnal Transaksi';

const SHEETS = {
  neraca: 'NERACA JUNI 2026',
  arusKas: 'ARUS KAS JUNI 2026',
  labaRugi: 'LABA RUGI JUNI 2026',
  bebanOps: 'Beban Operasional ',     // trailing space intentional
  penerimaan: 'Penerimaan',
  bebanUmum: 'Beban Umum',
  investasi: ' Investasi',             // leading space intentional
};
// LRA category → its (2) sheet + parser.
const LRA_CATS = [
  { kategori: 'penerimaan', sheet: SHEETS.penerimaan, threeLevel: false },
  { kategori: 'bebanUmum', sheet: SHEETS.bebanUmum, threeLevel: false },
  { kategori: 'bebanInvestasi', sheet: SHEETS.investasi, threeLevel: false },
  { kategori: 'bebanOperasional', sheet: SHEETS.bebanOps, threeLevel: true },
];

function ref2Path() {
  const src = (reportImport.SOURCES || []).find(s => s.period === PERIOD);
  if (!src) throw new Error(`No SOURCES entry for ${PERIOD}`);
  return path.join(src.dir || reportImport.FILES_DIR, src.file);
}

// ── ESM modules (loaded once via dynamic import) ───────────────────────────
async function loadModules() {
  return {
    RD: await import('../src/utils/reportDelta.js'),
    LO: await import('../src/utils/lraOutline.js'),
    JE: await import('../src/utils/journalExpand.js'),
    EP: await import('../src/utils/excelParsers.js'),
  };
}

// ── Parse the official (2) reference snapshot (memory-lean: only needed sheets) ──
function loadRef2() {
  const needed = Object.values(SHEETS);
  const wb = XLSX.readFile(ref2Path(), { sheets: needed, dense: true });
  const out = {
    neraca: reportImport.parseNeraca(wb.Sheets[SHEETS.neraca]),
    labaRugi: reportImport.parseLabaRugi(wb.Sheets[SHEETS.labaRugi], 9),
    arusKas: reportImport.parseArusKas(wb.Sheets[SHEETS.arusKas], 2),
    lra: {
      penerimaan: reportImport.parsePenerimaan(wb.Sheets[SHEETS.penerimaan]),
      bebanUmum: reportImport.parsePenerimaan(wb.Sheets[SHEETS.bebanUmum]),
      // " Investasi" is a 3-level sheet → detail-aware parser (synthesizes the
      // rincian child outlines 1.1.1, 1.1.2, … with their verbatim labels).
      bebanInvestasi: reportImport.parseInvestasi(wb.Sheets[SHEETS.investasi]),
      bebanOperasional: reportImport.parseBebanOperasional(wb.Sheets[SHEETS.bebanOps]),
    },
  };
  return out;
}

// ── Parse the 17–20 June template into JV- journals (app parser → identical to
//    what the live import produces). Each entry carries a `lines` array. ──
function loadTemplateJournals(EP) {
  const wb = XLSX.readFile(TEMPLATE_FILE);
  const entries = EP.parseJurnal(wb.Sheets[TEMPLATE_SHEET]);
  return entries.map((e, i) => ({
    ...e,
    id: `JV-${PERIOD}-T${String(i + 1).padStart(3, '0')}`,
    status: 'posted',
  }));
}

// ── Per-outline LRA delta — mirrors src/pages/LRA.jsx delta attribution exactly
//    (resolveOutline + categoryKeyForCode for penerimaan/bebanUmum/bebanOperasional;
//    getInvestasiOutline for bebanInvestasi). Operates on EXPANDED legs. ──
function computeLraDelta(catKey, expandedLegs, LO) {
  const { resolveOutline, getInvestasiOutline, categoryKeyForCode, extractAccountCode } = LO;
  const m = {};
  const add = (o, v) => { if (o) m[o] = (m[o] || 0) + v; };
  for (const j of expandedLegs) {
    const dc = extractAccountCode(j.akun_debit);
    const kc = extractAccountCode(j.akun_kredit);
    const debit = Number(j.debit) || 0;
    const kredit = Number(j.kredit) || 0;
    if (catKey === 'penerimaan') {
      if (kc) add(resolveOutline(kc, j.keterangan), kredit);
      if (dc) add(resolveOutline(dc, j.keterangan), -debit);
    } else if (catKey === 'bebanInvestasi') {
      if (dc) add(getInvestasiOutline(dc, j.keterangan), debit);
      if (kc) add(getInvestasiOutline(kc, j.keterangan), -kredit);
    } else { // bebanUmum / bebanOperasional
      if (dc && categoryKeyForCode(dc) === catKey) add(resolveOutline(dc, j.keterangan), debit);
      if (kc && categoryKeyForCode(kc) === catKey) add(resolveOutline(kc, j.keterangan), -kredit);
    }
  }
  return m;
}

/**
 * Compute the full "(2) minus template" baseline in memory.
 * Returns:
 *   { neraca:[{order,label,value,depth}], labaRugi:[...],
 *     arusKas:[{order,label,value,isSection}],
 *     lra: { <kategori>: [{outline,nama,anggaran,target,sdBlnLalu,bulanIni,realisasi,persen}] },
 *     delta: { neraca:[Δ per row], labaRugi:[...], arusKas:[...], lra:{cat:{outline:Δ}} },
 *     warnings:[...] }
 * Throws if the template introduces any "(Belum Terpetakan)" leaf or changes the
 * report row count (i.e. there is an unmapped account) — we refuse to write a
 * snapshot that wouldn't reconcile cleanly.
 */
function computeBaseline(ref2, templateJournals, mods) {
  const { RD, LO, JE } = mods;
  const warnings = [];
  const legs = JE.expandJournals(templateJournals);

  // — Report tables: baseline[i] = (2)[i] − Δ[i], where Δ[i] = built[i] − (2)[i]. —
  const buildTable = (baseRows, builtRows, name) => {
    if (builtRows.length !== baseRows.length || builtRows.some(r => r._unmapped)) {
      const extra = builtRows.filter(r => r._unmapped).map(r => r.label);
      throw new Error(`${name}: template produced ${builtRows.length - baseRows.length} extra row(s) / unmapped leaves [${extra.join(', ')}] — refusing to write a non-reconciling snapshot. Add the missing COA→line mapping first.`);
    }
    const deltas = [];
    const rows = baseRows.map((r, i) => {
      if (r.value == null) { deltas.push(0); return { ...r }; }
      const d = (builtRows[i].value || 0) - (r.value || 0);
      deltas.push(d);
      return { ...r, value: (r.value || 0) - d };
    });
    return { rows, deltas };
  };

  const nBuilt = RD.buildNeracaRows(ref2.neraca, legs);
  const lrBuilt = RD.buildLabaRugiRows(ref2.labaRugi, legs);
  const akBuilt = RD.buildArusKasRows(ref2.arusKas, legs);
  const neraca = buildTable(ref2.neraca, nBuilt, 'Neraca');
  const labaRugi = buildTable(ref2.labaRugi, lrBuilt, 'Laba Rugi');
  const arusKas = buildTable(ref2.arusKas, akBuilt, 'Arus Kas');

  // — LRA categories: baseline bulanIni/realisasi = (2) − Δ(outline). —
  const lra = {};
  const lraDelta = {};
  for (const { kategori } of LRA_CATS) {
    const baseRows = ref2.lra[kategori] || [];
    const m = computeLraDelta(kategori, legs, LO);
    lraDelta[kategori] = m;
    lra[kategori] = baseRows.map(r => {
      const d = m[r.outline] || 0;
      if (d) {
        // Surface (not silently swallow) any outline that the delta lands on but
        // that doesn't exist as a (2) anggaran row — would otherwise be a phantom.
      }
      return {
        ...r,
        bulanIni: (Number(r.bulanIni) || 0) - d,
        realisasi: (Number(r.realisasi) || 0) - d,
      };
    });
    // Flag any delta outline not present in the (2) rows. This is INFORMATIONAL,
    // not an error: such a delta is dropped IDENTICALLY by the live LRA render
    // (no matching master item), so the amount simply stays at its (2) position
    // in the baseline and the live cycle still reconciles (snapshot+delta==(2)).
    const present = new Set(baseRows.map(r => r.outline));
    for (const o of Object.keys(m)) {
      if (Math.abs(m[o]) > 0.5 && !present.has(o)) warnings.push(`LRA ${kategori}: delta outline ${o} (Rp ${Math.round(m[o]).toLocaleString('id-ID')}) has no (2) row → dropped consistently (matches live render; amount stays at its (2) line).`);
    }
  }

  return {
    neraca: neraca.rows, labaRugi: labaRugi.rows, arusKas: arusKas.rows, lra,
    delta: { neraca: neraca.deltas, labaRugi: labaRugi.deltas, arusKas: arusKas.deltas, lra: lraDelta },
    warnings,
  };
}

// ── DB writers ─────────────────────────────────────────────────────────────
function run(db, sql, p = []) { return new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this.changes || 0); })); }
function all(db, sql, p = []) { return new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || []))); }

// SAFE migration: ensure the `anggaran.nama_excel` column exists (verbatim Excel
// label used by the LRA UI to render rows exactly like the lampiran). Checks
// PRAGMA table_info first and tolerates an already-present column / older DBs.
async function ensureNamaExcelColumn(db) {
  const cols = await all(db, 'PRAGMA table_info(anggaran)');
  if (!cols.some(c => String(c.name) === 'nama_excel')) {
    await run(db, 'ALTER TABLE anggaran ADD COLUMN nama_excel TEXT').catch(() => {});
  }
}

async function writeBaseline(db, baseline) {
  await ensureNamaExcelColumn(db);
  await run(db, 'BEGIN TRANSACTION');
  try {
    await run(db, 'DELETE FROM report_neraca WHERE period=?', [PERIOD]);
    for (const r of baseline.neraca) await run(db, 'INSERT INTO report_neraca (period, sort_order, label, value, depth) VALUES (?,?,?,?,?)', [PERIOD, r.order, r.label, r.value, r.depth]);

    await run(db, 'DELETE FROM report_laba_rugi WHERE period=?', [PERIOD]);
    for (const r of baseline.labaRugi) await run(db, 'INSERT INTO report_laba_rugi (period, sort_order, label, value, depth) VALUES (?,?,?,?,?)', [PERIOD, r.order, r.label, r.value, r.depth]);

    await run(db, 'DELETE FROM report_arus_kas WHERE period=?', [PERIOD]);
    for (const r of baseline.arusKas) await run(db, 'INSERT INTO report_arus_kas (period, sort_order, label, value, is_section) VALUES (?,?,?,?,?)', [PERIOD, r.order, r.label, r.value, r.isSection ? 1 : 0]);

    for (const { kategori } of LRA_CATS) {
      await run(db, 'DELETE FROM anggaran WHERE kategori=? AND bulan=?', [kategori, BULAN]);
      for (const r of baseline.lra[kategori]) {
        const outline = String(r.outline || '').trim();
        if (!/^\d+(\.\d+)*$/.test(outline)) continue;
        await run(db,
          `INSERT INTO anggaran (kode,nama,nama_excel,kategori,bulan,anggaran_awal,target_bulan,sd_bln_lalu,bulan_ini,realisasi,persentase,is_total)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`,
          [`ANG-${kategori}-${outline}`, outline, (r.nama != null ? String(r.nama) : ''), kategori, BULAN,
           Number(r.anggaran) || 0, Number(r.target) || 0, Number(r.sdBlnLalu) || 0,
           Number(r.bulanIni) || 0, Number(r.realisasi) || 0, Number(r.persen) || 0]);
      }
    }
    await run(db, 'COMMIT');
  } catch (e) {
    await run(db, 'ROLLBACK').catch(() => {});
    throw e;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log('═'.repeat(78));
  console.log(' BASELINE-SETTER — June snapshot = (2) MINUS 17–20 June template');
  console.log('═'.repeat(78));
  console.log(` DB_PATH: ${DB_PATH}${dryRun ? '   (DRY RUN — no writes)' : ''}`);

  const mods = await loadModules();
  const ref2 = loadRef2();
  const templateJournals = loadTemplateJournals(mods.EP);
  const legCount = mods.JE.expandJournals(templateJournals).length;
  console.log(` (2) parsed: Neraca=${ref2.neraca.length} LabaRugi=${ref2.labaRugi.length} ArusKas=${ref2.arusKas.length} | LRA: pen=${ref2.lra.penerimaan.length} bu=${ref2.lra.bebanUmum.length} inv=${ref2.lra.bebanInvestasi.length} ops=${ref2.lra.bebanOperasional.length}`);
  console.log(` Template: ${templateJournals.length} journals / ${legCount} legs (17–20 June)`);

  const baseline = computeBaseline(ref2, templateJournals, mods);
  if (baseline.warnings.length) {
    console.log('\n ⚠ Warnings:');
    baseline.warnings.forEach(w => console.log('   - ' + w));
  }

  // Quick effect summary for the operator.
  const sumAbs = (arr) => arr.reduce((s, d) => s + Math.abs(d), 0);
  console.log('\n Per-line effect subtracted (Σ|Δ|):');
  console.log(`   Neraca rows moved: ${baseline.delta.neraca.filter(d => Math.abs(d) > 0.5).length}`);
  console.log(`   Laba Rugi rows moved: ${baseline.delta.labaRugi.filter(d => Math.abs(d) > 0.5).length}`);
  console.log(`   Arus Kas rows moved: ${baseline.delta.arusKas.filter(d => Math.abs(d) > 0.5).length}`);
  for (const { kategori } of LRA_CATS) {
    const m = baseline.delta.lra[kategori];
    const moved = Object.keys(m).filter(o => Math.abs(m[o]) > 0.5);
    console.log(`   LRA ${kategori}: ${moved.length} outline(s) moved [${moved.map(o => `${o}:${Math.round(m[o]).toLocaleString('id-ID')}`).join(', ')}]`);
  }

  if (dryRun) {
    console.log('\n DRY RUN complete — nothing written.');
    return;
  }

  const db = new sqlite3.Database(DB_PATH);
  try {
    // Record journal counts BEFORE, to prove we never touch them.
    const before = await new Promise((res, rej) => db.get(
      "SELECT (SELECT COUNT(*) FROM journals WHERE substr(tanggal,1,7)=?) j, (SELECT COUNT(*) FROM journal_lines WHERE substr(tanggal,1,7)=?) l", [PERIOD, PERIOD], (e, r) => e ? rej(e) : res(r)));
    await writeBaseline(db, baseline);
    const after = await new Promise((res, rej) => db.get(
      "SELECT (SELECT COUNT(*) FROM journals WHERE substr(tanggal,1,7)=?) j, (SELECT COUNT(*) FROM journal_lines WHERE substr(tanggal,1,7)=?) l", [PERIOD, PERIOD], (e, r) => e ? rej(e) : res(r)));
    console.log(`\n ✓ Snapshot written for ${PERIOD}.`);
    console.log(`   journals(June): ${before.j} → ${after.j}  |  journal_lines(June): ${before.l} → ${after.l}  (UNCHANGED — JV- template not demoted/deleted)`);
    if (before.j !== after.j || before.l !== after.l) throw new Error('journal tables changed — this must never happen');
  } finally {
    db.close();
  }
  console.log('\n Done. snapshot + JV(template) == (2)  (verify with scripts/verify_baseline_minus_template.cjs).');
}

module.exports = {
  PERIOD, BULAN, SHEETS, LRA_CATS, TEMPLATE_FILE, TEMPLATE_SHEET,
  ref2Path, loadModules, loadRef2, loadTemplateJournals, computeLraDelta, computeBaseline,
};

if (require.main === module) {
  main().catch(e => { console.error('FATAL:', e && e.stack ? e.stack : e); process.exit(1); });
}
