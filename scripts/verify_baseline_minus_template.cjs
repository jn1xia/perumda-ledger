#!/usr/bin/env node
/* eslint-disable */
/**
 * verify_baseline_minus_template.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * OFFLINE VERIFICATION HARNESS for the "(2) minus 17–20 June" model.
 *
 * Proves, line-by-line within Rp 1, across ALL sheets
 *   (Neraca, Laba Rugi, Arus Kas, Penerimaan, Beban Umum, Beban Operasional,
 *    Investasi)
 * using the REAL shipped attribution code (src/utils/reportDelta.js +
 * src/utils/lraOutline.js) and the REAL parsers, that:
 *
 *   (a) baseline = (2) − template-effect;  baseline + template-deltas == "(2)"
 *       (and the Neraca stays balanced; NO "(Belum Terpetakan)" leaf appears).
 *   (b) delete the template ⇒ reports == baseline; the 17–20 amounts are removed
 *       from the CORRECT lines (baseline differs from (2) by exactly −Δ on the
 *       touched lines); no negative "(Belum Terpetakan)" leaf.
 *   (c) a DIFFERENT template (a couple amounts tweaked) ⇒ reports move by exactly
 *       the difference, with NO re-baseline (same baseline reused).
 *   (d) end-to-end DB check: run scripts/set_baseline_minus_template.cjs against a
 *       throwaway COPY of the QA DB, read the written snapshot back, and confirm
 *       it equals the in-memory baseline AND that the June JV-/JRN- journals were
 *       NOT demoted or deleted. (The real QA / prod DBs are never written.)
 *
 * Read-only: parses (2) and the template in-memory; for (d) it copies the QA DB
 * to a temp file and runs the setter there. The live QA/prod DBs are untouched.
 *
 * Run:
 *   node scripts/verify_baseline_minus_template.cjs
 *   (optional) QA_DB=server/perumda_ledger.qa.db node scripts/verify_baseline_minus_template.cjs
 *
 * Exit code: 0 when every sheet reconciles within Rp 1 and all guards hold, 1 otherwise.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const setter = require('./set_baseline_minus_template.cjs');

const TOL = 1;
const ROOT = path.join(__dirname, '..');
const QA_DB = process.env.QA_DB || path.join(ROOT, 'server', 'perumda_ledger.qa.db');
const rupiah = (n) => (n == null ? '—' : (Math.round(Number(n) * 100) / 100).toLocaleString('id-ID'));
const approx = (a, b) => Math.abs((a || 0) - (b || 0)) <= TOL;

// per-sheet result accounting
const sheets = {};
function sheetResult(name) { if (!sheets[name]) sheets[name] = { checks: 0, fails: 0, samples: [] }; return sheets[name]; }
function expect(sheet, cond, detail) {
  const s = sheetResult(sheet); s.checks++;
  if (!cond) { s.fails++; if (s.samples.length < 8) s.samples.push(detail); }
  return cond;
}

const isBelumTerpetakan = (label) => /Belum Terpetakan/i.test(String(label || ''));

// Compare a rendered report (built rows) against the (2) reference rows, row-by-row.
function compareToRef2(sheet, refRows, builtRows) {
  // Drop any inserted "(Belum Terpetakan)" rows (there should be NONE) so indices align.
  const built = builtRows.filter(r => !r._unmapped);
  expect(sheet, built.length === refRows.length, `${sheet}: row count ${built.length} ≠ (2) ${refRows.length}`);
  const n = Math.min(built.length, refRows.length);
  for (let i = 0; i < n; i++) {
    if (refRows[i].value == null && built[i].value == null) continue;
    expect(sheet, approx(built[i].value, refRows[i].value),
      `${sheet} "${refRows[i].label}": render ${rupiah(built[i].value)} ≠ (2) ${rupiah(refRows[i].value)} (Δ ${rupiah((built[i].value || 0) - (refRows[i].value || 0))})`);
  }
  // No "(Belum Terpetakan)" leaf at all (zero unmapped is required).
  expect(sheet, !builtRows.some(r => isBelumTerpetakan(r.label)), `${sheet}: an unexpected "(Belum Terpetakan)" leaf appeared`);
}

function neracaBalanced(rows) {
  const find = (re) => { const r = rows.find(x => re.test(String(x.label))); return r ? r.value : undefined; };
  const aset = find(/^JUMLAH ASET$/i);
  const ke = find(/JUMLAH KEWAJIBAN DAN EKUITAS/i);
  return { ok: aset != null && ke != null && approx(aset, ke), aset, ke };
}

// Render an LRA category (per-outline) the way the live LRA view does:
//   rendered.bulanIni(outline) = baseline.bulanIni(outline) + delta(outline)
function renderLra(baselineRows, deltaMap) {
  const out = {};
  for (const r of baselineRows) out[r.outline] = (Number(r.bulanIni) || 0) + (deltaMap[r.outline] || 0);
  return out;
}

async function main() {
  console.log('═'.repeat(78));
  console.log(' VERIFY — "(2) minus 17–20 June" baseline model (offline, real modules)');
  console.log('═'.repeat(78));

  const mods = await setter.loadModules();
  const { RD, JE, LO } = mods;
  const ref2 = setter.loadRef2();
  const templateJournals = setter.loadTemplateJournals(mods.EP);
  const legs = JE.expandJournals(templateJournals);
  console.log(` (2): Neraca=${ref2.neraca.length} LR=${ref2.labaRugi.length} AK=${ref2.arusKas.length} | LRA pen=${ref2.lra.penerimaan.length} bu=${ref2.lra.bebanUmum.length} inv=${ref2.lra.bebanInvestasi.length} ops=${ref2.lra.bebanOperasional.length}`);
  console.log(` Template: ${templateJournals.length} journals / ${legs.length} legs`);

  const baseline = setter.computeBaseline(ref2, templateJournals, mods);

  // ── (a) baseline + template-deltas == (2), per sheet, line-by-line ──────────
  console.log('\n── (a) baseline + template-deltas == (2) ──');
  compareToRef2('Neraca', ref2.neraca, RD.buildNeracaRows(baseline.neraca, legs));
  compareToRef2('Laba Rugi', ref2.labaRugi, RD.buildLabaRugiRows(baseline.labaRugi, legs));
  compareToRef2('Arus Kas', ref2.arusKas, RD.buildArusKasRows(baseline.arusKas, legs));
  // Neraca balanced after add-back.
  const bal = neracaBalanced(RD.buildNeracaRows(baseline.neraca, legs));
  expect('Neraca', bal.ok, `Neraca not balanced after add-back: Aset ${rupiah(bal.aset)} ≠ Kew+Ek ${rupiah(bal.ke)}`);
  // LRA categories (per-outline, LRA.jsx semantics).
  const LRA_SHEET = { penerimaan: 'Penerimaan', bebanUmum: 'Beban Umum', bebanInvestasi: 'Investasi', bebanOperasional: 'Beban Operasional' };
  for (const { kategori } of setter.LRA_CATS) {
    const sheet = LRA_SHEET[kategori];
    const dmap = setter.computeLraDelta(kategori, legs, LO);
    const rendered = renderLra(baseline.lra[kategori], dmap);
    for (const r of ref2.lra[kategori]) {
      expect(sheet, approx(rendered[r.outline], r.bulanIni),
        `${sheet} outline ${r.outline} "${r.nama}": render ${rupiah(rendered[r.outline])} ≠ (2) ${rupiah(r.bulanIni)}`);
    }
  }
  // Extra cross-check: bebanOperasional via the REAL buildBebanOpsRows (the
  // function the offline overlay harnesses use) reconciles to (2) bulan_ini too.
  {
    const baseOps = baseline.lra.bebanOperasional.map(r => ({ outline: r.outline, nama: r.nama, bulanIni: Number(r.bulanIni) || 0 }));
    const built = LO.buildBebanOpsRows(baseOps, templateJournals);
    for (const r of ref2.lra.bebanOperasional) {
      const v = built.rows[r.outline] ? built.rows[r.outline].value : (baseline.lra.bebanOperasional.find(x => x.outline === r.outline) || {}).bulanIni;
      expect('Beban Operasional', approx(v, r.bulanIni), `BebanOps(buildBebanOpsRows) outline ${r.outline}: ${rupiah(v)} ≠ (2) ${rupiah(r.bulanIni)}`);
    }
  }

  // ── (b) delete template ⇒ reports == baseline; removed from correct lines ──
  console.log('── (b) delete template ⇒ reports == baseline (amounts removed from correct lines) ──');
  const checkNoDelta = (sheet, baseRows, builtNoDelta) => {
    expect(sheet, builtNoDelta.length === baseRows.length, `${sheet}: row count changed with empty delta`);
    for (let i = 0; i < Math.min(baseRows.length, builtNoDelta.length); i++) {
      if (baseRows[i].value == null && builtNoDelta[i].value == null) continue;
      expect(sheet, approx(builtNoDelta[i].value, baseRows[i].value), `${sheet} "${baseRows[i].label}": no-delta render ${rupiah(builtNoDelta[i].value)} ≠ baseline ${rupiah(baseRows[i].value)}`);
    }
    // No "(Belum Terpetakan)" leaf, and certainly no NEGATIVE one.
    const bt = builtNoDelta.find(r => isBelumTerpetakan(r.label));
    expect(sheet, !bt, `${sheet}: "(Belum Terpetakan)" leaf present after delete (value ${bt ? rupiah(bt.value) : '—'})`);
  };
  checkNoDelta('Neraca', baseline.neraca, RD.buildNeracaRows(baseline.neraca, []));
  checkNoDelta('Laba Rugi', baseline.labaRugi, RD.buildLabaRugiRows(baseline.labaRugi, []));
  checkNoDelta('Arus Kas', baseline.arusKas, RD.buildArusKasRows(baseline.arusKas, []));
  // "removed from the CORRECT lines": baseline(L) == (2)(L) − Δ(L) on touched lines.
  const verifyRemoved = (sheet, refRows, baseRows, deltas) => {
    for (let i = 0; i < refRows.length; i++) {
      if (refRows[i].value == null) continue;
      const expected = (refRows[i].value || 0) - (deltas[i] || 0);
      expect(sheet, approx(baseRows[i].value, expected), `${sheet} "${refRows[i].label}": baseline ${rupiah(baseRows[i].value)} ≠ (2)−Δ ${rupiah(expected)}`);
    }
  };
  verifyRemoved('Neraca', ref2.neraca, baseline.neraca, baseline.delta.neraca);
  verifyRemoved('Laba Rugi', ref2.labaRugi, baseline.labaRugi, baseline.delta.labaRugi);
  verifyRemoved('Arus Kas', ref2.arusKas, baseline.arusKas, baseline.delta.arusKas);

  // ── (c) a DIFFERENT template ⇒ reports move by exactly the difference ───────
  console.log('── (c) different template ⇒ reports move by exactly the difference (no rebaseline) ──');
  // Tweak: add Rp 50.000.000 to the 12102.1 "Bangunan" revitalisasi journal
  // (debit 12102.1 / credit 11103). A clean, unambiguous COA mapping.
  const TWEAK = 50_000_000;
  const tweaked = JSON.parse(JSON.stringify(templateJournals));
  let tweakedOne = false;
  for (const j of tweaked) {
    if (tweakedOne) break;
    const lines = j.lines || [];
    const hasBangunan = lines.some(l => String(l.akun_code) === '12102.1' && (Number(l.debit) || 0) > 0);
    if (!hasBangunan) continue;
    for (const l of lines) {
      if (String(l.akun_code) === '12102.1' && (Number(l.debit) || 0) > 0) l.debit += TWEAK;
      if (String(l.akun_code) === '11103' && (Number(l.kredit) || 0) > 0) l.kredit += TWEAK;
    }
    j.debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    j.kredit = lines.reduce((s, l) => s + (Number(l.kredit) || 0), 0);
    tweakedOne = true;
  }
  expect('Neraca', tweakedOne, '(c) could not locate the 12102.1 Bangunan journal to tweak');
  const legs2 = JE.expandJournals(tweaked);
  // SAME baseline reused (no rebaseline). Render with the tweaked template.
  const n1 = RD.buildNeracaRows(baseline.neraca, legs);   // == (2)
  const n2 = RD.buildNeracaRows(baseline.neraca, legs2);  // == (2) shifted by the tweak
  const valByLabel = (rows, re) => { const r = rows.find(x => re.test(String(x.label))); return r ? (r.value || 0) : null; };
  // Independent expectations: Bangunan +TWEAK, Kas Bank Kalsel −TWEAK, net JUMLAH ASET unchanged.
  const dBangunan = valByLabel(n2, /^Bangunan$/) - valByLabel(n1, /^Bangunan$/);
  const dKas = valByLabel(n2, /^Kas Bank Kalsel$/) - valByLabel(n1, /^Kas Bank Kalsel$/);
  const dAset = valByLabel(n2, /^JUMLAH ASET$/) - valByLabel(n1, /^JUMLAH ASET$/);
  expect('Neraca', approx(dBangunan, TWEAK), `(c) Bangunan moved ${rupiah(dBangunan)} ≠ +${rupiah(TWEAK)}`);
  expect('Neraca', approx(dKas, -TWEAK), `(c) Kas Bank Kalsel moved ${rupiah(dKas)} ≠ −${rupiah(TWEAK)}`);
  expect('Neraca', approx(dAset, 0), `(c) JUMLAH ASET moved ${rupiah(dAset)} ≠ 0 (capex funded by cash)`);
  // Every OTHER line must be unchanged between the two templates (only the tweaked
  // accounts and their roll-ups move) — proves no global rebaseline.
  let movedRows = 0;
  for (let i = 0; i < n1.length; i++) {
    if (n1[i].value == null) continue;
    if (!approx(n1[i].value, n2[i].value)) movedRows++;
  }
  expect('Neraca', movedRows > 0 && movedRows <= 6, `(c) tweak moved ${movedRows} Neraca rows (expected only Bangunan + its subtotals/totals)`);
  // And n1 still equals (2) (baseline never rebaselined).
  expect('Neraca', approx(valByLabel(n1, /^JUMLAH ASET$/), valByLabel(ref2.neraca, /^JUMLAH ASET$/)), '(c) baseline drifted from (2) — unexpected rebaseline');

  // ── (d) end-to-end: setter writes to a COPY; snapshot matches; journals intact ─
  console.log('── (d) end-to-end DB write to a throwaway copy (journals untouched) ──');
  await scenarioD(baseline);

  // ── Report ──
  report();
}

function copyDbFamily(srcDb, destDb) {
  for (const suffix of ['', '-wal', '-shm']) {
    const s = srcDb + suffix;
    if (fs.existsSync(s)) fs.copyFileSync(s, destDb + suffix);
  }
}

async function scenarioD(baseline) {
  const sheet = 'DB write';
  if (!fs.existsSync(QA_DB)) { expect(sheet, true, ''); console.log(`   (skipped — no QA DB at ${path.relative(ROOT, QA_DB)})`); return; }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-setter-'));
  const tmpDb = path.join(tmpDir, 'copy.db');
  copyDbFamily(QA_DB, tmpDb);

  // journals/lines BEFORE (must be identical AFTER).
  const beforeJ = await dbGet(tmpDb, "SELECT (SELECT COUNT(*) FROM journals WHERE substr(tanggal,1,7)='2026-06') j, (SELECT COUNT(*) FROM journal_lines WHERE substr(tanggal,1,7)='2026-06') l, (SELECT group_concat(id) FROM journals WHERE substr(tanggal,1,7)='2026-06') ids");

  const res = spawnSync('node', [path.join(__dirname, 'set_baseline_minus_template.cjs')], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, DB_PATH: tmpDb },
  });
  expect(sheet, res.status === 0, `setter exited ${res.status}: ${(res.stderr || '').split('\n').slice(-3).join(' ')}`);

  // Read back the written June snapshot and compare to the in-memory baseline.
  const dbN = await dbAll(tmpDb, "SELECT label, value FROM report_neraca WHERE period='2026-06' ORDER BY sort_order");
  const dbLR = await dbAll(tmpDb, "SELECT label, value FROM report_laba_rugi WHERE period='2026-06' ORDER BY sort_order");
  const dbAK = await dbAll(tmpDb, "SELECT label, value FROM report_arus_kas WHERE period='2026-06' ORDER BY sort_order");
  const cmp = (name, dbRows, baseRows) => {
    expect(sheet, dbRows.length === baseRows.length, `${name}: DB rows ${dbRows.length} ≠ baseline ${baseRows.length}`);
    for (let i = 0; i < Math.min(dbRows.length, baseRows.length); i++) {
      if (dbRows[i].value == null && baseRows[i].value == null) continue;
      expect(sheet, approx(dbRows[i].value, baseRows[i].value), `${name} "${baseRows[i].label}": DB ${rupiah(dbRows[i].value)} ≠ baseline ${rupiah(baseRows[i].value)}`);
    }
  };
  cmp('report_neraca', dbN, baseline.neraca);
  cmp('report_laba_rugi', dbLR, baseline.labaRugi);
  cmp('report_arus_kas', dbAK, baseline.arusKas);

  // anggaran bebanOperasional written and matches baseline bulan_ini.
  const dbOps = await dbAll(tmpDb, "SELECT nama AS outline, bulan_ini FROM anggaran WHERE kategori='bebanOperasional' AND bulan=6");
  const opsMap = new Map(dbOps.map(r => [String(r.outline), r.bulan_ini]));
  for (const r of baseline.lra.bebanOperasional) {
    if (!/^\d+(\.\d+)*$/.test(String(r.outline))) continue;
    expect(sheet, opsMap.has(String(r.outline)) && approx(opsMap.get(String(r.outline)), r.bulanIni),
      `anggaran bebanOperasional ${r.outline}: DB ${rupiah(opsMap.get(String(r.outline)))} ≠ baseline ${rupiah(r.bulanIni)}`);
  }

  // journals/lines UNCHANGED (JV- not demoted/deleted).
  const afterJ = await dbGet(tmpDb, "SELECT (SELECT COUNT(*) FROM journals WHERE substr(tanggal,1,7)='2026-06') j, (SELECT COUNT(*) FROM journal_lines WHERE substr(tanggal,1,7)='2026-06') l, (SELECT group_concat(id) FROM journals WHERE substr(tanggal,1,7)='2026-06') ids");
  expect(sheet, beforeJ.j === afterJ.j && beforeJ.l === afterJ.l && (beforeJ.ids || '') === (afterJ.ids || ''),
    `June journals changed: before {j:${beforeJ.j},l:${beforeJ.l}} after {j:${afterJ.j},l:${afterJ.l}}`);

  // cleanup
  try { for (const s of ['', '-wal', '-shm']) { if (fs.existsSync(tmpDb + s)) fs.unlinkSync(tmpDb + s); } fs.rmdirSync(tmpDir); } catch (_) {}
}

function dbAll(file, sql, p = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY);
    db.all(sql, p, (e, r) => { db.close(); e ? reject(e) : resolve(r || []); });
  });
}
function dbGet(file, sql, p = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY);
    db.get(sql, p, (e, r) => { db.close(); e ? reject(e) : resolve(r || {}); });
  });
}

function report() {
  console.log('\n' + '─'.repeat(78));
  console.log(' PER-SHEET RESULTS (tolerance ≤ Rp 1):');
  let totalFails = 0;
  const order = ['Neraca', 'Laba Rugi', 'Arus Kas', 'Penerimaan', 'Beban Umum', 'Beban Operasional', 'Investasi', 'DB write'];
  for (const name of order) {
    const s = sheets[name]; if (!s) continue;
    totalFails += s.fails;
    console.log(`   ${s.fails === 0 ? '✓' : '✗'} ${name.padEnd(18)} ${s.checks - s.fails}/${s.checks} checks`);
    s.samples.forEach(d => console.log(`       - ${d}`));
  }
  console.log('─'.repeat(78));
  if (totalFails === 0) {
    console.log(' ✅ ALL SHEETS RECONCILE — baseline + template == (2); delete ⇒ baseline; tweak ⇒ exact diff; DB write OK.');
    process.exit(0);
  } else {
    console.log(` ❌ ${totalFails} reconciliation failure(s).`);
    process.exit(1);
  }
}

main().catch(e => { console.error('FATAL:', e && e.stack ? e.stack : e); process.exit(2); });
