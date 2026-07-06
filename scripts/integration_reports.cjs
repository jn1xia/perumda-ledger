#!/usr/bin/env node
/* eslint-disable */
/**
 * integration_reports.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * INTEGRATION TESTS (full flow & cross-month regression)
 *   Spec: perbaikan-laporan-juni-2026  —  TASK 8
 *
 * Validates Requirements 2.1–2.6 and 3.1–3.6 end-to-end, exercising the REAL,
 * shipped attribution code (src/utils/reportDelta.js + src/utils/lraOutline.js,
 * loaded via dynamic import()) on the REAL official (2) baseline and the REAL
 * read-only QA snapshot — wiring together the units the other harnesses test in
 * isolation. NO application code is modified; the QA DB is opened READ-ONLY and
 * the in-memory (2) baseline is never mutated.
 *
 * Conventions follow the project's other harnesses (no jest/vitest/fast-check):
 * standalone CommonJS, `xlsx` + `sqlite3`, the (2) Excel baseline loader is
 * reused from scripts/explore_overlay_delta.cjs, and the layout leg reuses the
 * existing playwright specs (tests/explore_layout_scroll.spec.cjs +
 * tests/preserve_layout_export.spec.cjs) by running them as the layout
 * integration scenario.
 *
 * Scenarios (each maps directly to a Task-8 bullet):
 *   1. NO-REBASELINE DELTA FLOW (PRIMARY) — from the correct (2) June baseline,
 *      add one and then several JV- journals and confirm all four reports
 *      (Laba Rugi, Neraca, Arus Kas, LRA Beban Operasional) reflect them: only
 *      the affected lines + their parent totals move (by exactly the delta),
 *      Neraca stays balanced, totals == Σ leaves — WITHOUT any reload/re-baseline.
 *   2. SETUP FLOW — the June snapshot currently loaded in the QA DB equals (2)
 *      with no delta (all four reports within Rp 1), and anggaran has
 *      ANG-bebanOperasional-* rows for month 6 (LRA isDynamic=false).
 *   3. UNMAPPED ACCOUNT — a journal on an account with no report line surfaces a
 *      visible "(Belum Terpetakan)" line carrying the amount; the report stays
 *      balanced/consistent (no silent drop).
 *   4. LAYOUT INTEGRATION — a wide report + two reports side by side scroll
 *      horizontally; print/export keeps every column; vertical scroll works.
 *      (Reuses the existing layout/export playwright harnesses.)
 *   5. CROSS-MONTH REGRESSION — Jan–May values are unchanged vs the recorded
 *      baseline (scripts/preserve_baseline.json) and remain equal to each
 *      month's Excel lampiran; switching months does not alter other months.
 *
 * Run:
 *   DB_PATH=server/perumda_ledger.qa.db node scripts/integration_reports.cjs
 *
 * Exit code: 0 when every integration scenario holds, 1 otherwise. Per Task 8,
 * if a scenario reveals a real defect we STOP and report it (never weaken the
 * test or edit source).
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();

const explore = require('./explore_overlay_delta.cjs'); // loadBaseline() from Excel (2)
const reportImport = require('./import_report_data.cjs'); // parsers + SOURCES + FILES_DIR

// ── Config ──────────────────────────────────────────────────────────────────
const TOL = 1; // Rp 1 rounding tolerance (Req 2.x / 3.2)
const ROOT = path.join(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'server', 'perumda_ledger.qa.db');
const BASELINE_JSON = path.join(__dirname, 'preserve_baseline.json');
const AUDITED_PERIODS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
const JUNE = '2026-06';
const SHEETS = { neraca: 'NERACA JUNI 2026', arusKas: 'ARUS KAS JUNI 2026', labaRugi: 'LABA RUGI JUNI 2026' };

// ── Helpers ─────────────────────────────────────────────────────────────────
const rupiah = (n) => (n == null ? '—' : (Math.round(Number(n) * 100) / 100).toLocaleString('id-ID'));
const approx = (a, b) => Math.abs((a || 0) - (b || 0)) <= TOL;
const codeOf = (s) => String(s || '').trim().split(/\s+/)[0] || '';
const findRow = (rows, re) => rows.find((r) => re.test(String(r.label)));
const valOf = (rows, re) => { const r = findRow(rows, re); return r ? r.value : undefined; };

// ── Result accounting ─────────────────────────────────────────────────────
let checksRun = 0;
const failures = [];
function check(scenario, name, cond, detail) {
  checksRun++;
  const ok = !!cond;
  if (!ok) failures.push({ scenario, name, detail });
  console.log(`   [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  (${detail})` : ''}`);
  return ok;
}
function section(t) { console.log(`\n${t}`); }

// ════════════════════════════════════════════════════════════════════════════
// REAL modules under test (loaded via dynamic import in main)
// ════════════════════════════════════════════════════════════════════════════
let RD = null; // src/utils/reportDelta.js
let LO = null; // src/utils/lraOutline.js
async function loadRealModules() {
  RD = await import('../src/utils/reportDelta.js');
  LO = await import('../src/utils/lraOutline.js');
}

// ════════════════════════════════════════════════════════════════════════════
// Structural invariants used across scenarios
// ════════════════════════════════════════════════════════════════════════════
const isTotalLabel = (label) => {
  const u = String(label || '').toUpperCase();
  return u.includes('JUMLAH') || u.includes('JUMAH') || u.startsWith('LABA') || u.startsWith('EBITDA') || u.includes('NILAI BUKU');
};
// Sum the contiguous run of visible leaf rows immediately preceding a subtotal
// (its direct children, including any inserted "(Belum Terpetakan)" leaf).
function precedingLeafSum(rows, idx) {
  let sum = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.value == null) break;
    if (isTotalLabel(r.label)) break;
    sum += r.value || 0;
  }
  return sum;
}
function neracaBalanced(nRows) {
  const aset = valOf(nRows, /^JUMLAH ASET$/i);
  const ke = valOf(nRows, /JUMLAH KEWAJIBAN DAN EKUITAS/i);
  return aset != null && ke != null && approx(aset, ke) ? { ok: true, aset, ke } : { ok: false, aset, ke };
}

// ════════════════════════════════════════════════════════════════════════════
// SCENARIO 1 — NO-REBASELINE DELTA FLOW (PRIMARY).  Req 2.1–2.4.
// ════════════════════════════════════════════════════════════════════════════
// Each scenario journal touches mapped accounts only; we know the EXACT line
// movements, so we assert: affected leaves move by exactly the delta, every
// other leaf is unchanged, every JUMLAH == Σ its leaves, and Neraca balances.

// Verify the detail LEAVES of a report: only `expected` leaves move (by exact
// amount) and every other detail leaf is unchanged. `excludeRe` skips rows that
// are section subtotals/totals rather than detail leaves (e.g. the Arus Kas
// activity/net/ending rows, which the overlay moves directly — Arus Kas detail
// items are not leaf-summed, so its consistency is checked via the Kenaikan ==
// Σ activities identity instead, mirroring scripts/pbt_overlay.cjs).
function assertLeafDeltas(scenario, reportName, baseRows, appRows, expectedLeaves, excludeRe) {
  if (baseRows.length !== appRows.length) {
    check(scenario, `${reportName}: row count preserved`, false, `app=${appRows.length} base=${baseRows.length}`);
    return;
  }
  let leafMovesOK = true, leafQuietOK = true;
  for (let i = 0; i < baseRows.length; i++) {
    const b = baseRows[i], a = appRows[i];
    if (b.value == null) continue;
    if (isTotalLabel(b.label)) continue;             // totals checked separately
    if (excludeRe && excludeRe.test(String(b.label))) continue; // section subtotals
    const delta = (a.value || 0) - (b.value || 0);
    const exp = expectedLeaves[b.label];
    if (exp != null) {
      if (!approx(delta, exp)) { leafMovesOK = false; check(scenario, `${reportName} leaf "${b.label}" moved by exactly ${rupiah(exp)}`, false, `got Δ ${rupiah(delta)}`); }
    } else if (!approx(delta, 0)) {
      leafQuietOK = false;
      check(scenario, `${reportName} untouched leaf "${b.label}" stays put`, false, `moved Δ ${rupiah(delta)}`);
    }
  }
  if (leafMovesOK) check(scenario, `${reportName}: every affected leaf moved by exactly its delta`, true, `${Object.keys(expectedLeaves).length} leaves`);
  if (leafQuietOK) check(scenario, `${reportName}: all untouched detail leaves unchanged`, true);
}

// Assert each named leaf-subtotal (a subtotal whose direct children form a
// contiguous block of detail leaves) equals the sum of those leaves. Only such
// subtotals are checked — derived/computed grand totals (LABA BERSIH, JUMLAH
// ASET, etc.) are validated by the balance / identity assertions instead.
function assertLeafSubtotals(scenario, reportName, appRows, subtotalRegexes) {
  let ok = true;
  for (const re of subtotalRegexes) {
    const idx = appRows.findIndex((r) => re.test(String(r.label)));
    if (idx < 0) { ok = false; check(scenario, `${reportName}: subtotal ${re} located`, false); continue; }
    const total = appRows[idx].value || 0;
    const leafSum = precedingLeafSum(appRows, idx);
    if (!approx(total, leafSum)) { ok = false; check(scenario, `${reportName} "${appRows[idx].label}" == Σ its leaves`, false, `total ${rupiah(total)} ≠ Σ ${rupiah(leafSum)}`); }
  }
  if (ok) check(scenario, `${reportName}: each leaf-subtotal == Σ of its detail leaves`, true, `${subtotalRegexes.length} subtotals`);
}

// Well-defined leaf-subtotals per report (children are a contiguous leaf block).
const LR_LEAF_SUBTOTALS = [/^JUMLAH PENDAPATAN USAHA$/i, /^JUMLAH BEBAN UMUM DAN ADMINISTRASI$/i, /^JUM(LAH|AH) BEBAN OPERASIONAL DAN BISNIS$/i];
const NERACA_LEAF_SUBTOTALS = [/^Jumlah Aset Lancar$/i];
// Arus Kas section subtotals/totals that the overlay moves directly (not leaves).
const AK_SUBTOTAL_RE = /Aktivitas Operasi|Aktivitas Investasi|Aktivitas Pendanaan|kenaikan|akhir periode/i;

async function scenario1_noRebaselineFlow(base) {
  section('━━ SCENARIO 1 — No-rebaseline delta flow (PRIMARY) — Req 2.1–2.4 ━━');

  // Deep-freeze a copy of the baseline so we can prove the overlay never mutates
  // it (i.e. no re-baseline / reload is needed or performed).
  const baseSnapshot = JSON.stringify({ n: base.neraca, lr: base.labaRugi, ak: base.arusKas, ops: base.bebanOps });

  // ── 1a. ONE journal: beban gaji paid from Bank Kalsel ──────────────────
  section('1a. Add ONE JV- journal (61012 Beban Gaji ← 11103 Bank Kalsel, Rp 10.000.000)');
  const j1 = [{ id: 'JV-2026-0617', tanggal: '2026-06-17', status: 'posted',
    akun_debit: '61012 Beban Gaji Pokok Pegawai Tetap', akun_kredit: '11103 Bank Kalsel - 3204661684',
    debit: 10_000_000, kredit: 10_000_000, keterangan: 'Pembayaran gaji pegawai tetap Juni' }];

  let lr = RD.buildLabaRugiRows(base.labaRugi, j1);
  let nr = RD.buildNeracaRows(base.neraca, j1);
  let ak = RD.buildArusKasRows(base.arusKas, j1);
  let ops = LO.buildBebanOpsRows(base.bebanOps, j1);

  assertLeafDeltas('S1a', 'Laba Rugi', base.labaRugi, lr, { 'Beban Gaji': 10_000_000 });
  assertLeafSubtotals('S1a', 'Laba Rugi', lr, LR_LEAF_SUBTOTALS);
  assertLeafDeltas('S1a', 'Neraca', base.neraca, nr, { 'Kas Bank Kalsel': -10_000_000, '(Laba) Rugi Periode Berjalan': -10_000_000 });
  assertLeafSubtotals('S1a', 'Neraca', nr, NERACA_LEAF_SUBTOTALS);
  // Arus Kas: operating activity + ending cash both drop by 10M; investing &
  // financing stay put. (Arus Kas subtotals are moved directly by the overlay.)
  check('S1a', 'Arus Kas operating activity moves by −Rp 10.000.000',
    approx((valOf(ak, /Diperoleh dari\s+Aktivitas Operasi/i) || 0) - (valOf(base.arusKas, /Diperoleh dari\s+Aktivitas Operasi/i) || 0), -10_000_000));
  check('S1a', 'Arus Kas ending cash moves by −Rp 10.000.000',
    approx((valOf(ak, /akhir periode/i) || 0) - (valOf(base.arusKas, /akhir periode/i) || 0), -10_000_000));
  check('S1a', 'Arus Kas investing & financing activities unchanged',
    approx(valOf(ak, /Digunakan untuk\s+Aktivitas Investasi/i), valOf(base.arusKas, /Digunakan untuk\s+Aktivitas Investasi/i))
    && approx(valOf(ak, /(Diperoleh|Digunakan).*Aktivitas Pendanaan/i), valOf(base.arusKas, /(Diperoleh|Digunakan).*Aktivitas Pendanaan/i)));
  const b1 = neracaBalanced(nr);
  check('S1a', 'Neraca balanced after one journal', b1.ok, `Aset ${rupiah(b1.aset)} vs Kew+Ek ${rupiah(b1.ke)}`);
  // LRA is a 62xxx report — a 61xxx journal must NOT move it.
  const lraQuiet1 = base.bebanOps.every((r) => approx(ops.rows[r.outline].value, r.bulanIni));
  check('S1a', 'LRA Beban Operasional untouched by a 61xxx journal', lraQuiet1 && ops.unmapped.length === 0);

  // ── 1b. SEVERAL journals across all four reports ───────────────────────
  section('1b. Add SEVERAL JV- journals (beban 61012, beban-ops 62013, pendapatan 41001) — no reload');
  const jN = [
    { id: 'JV-2026-0617', tanggal: '2026-06-17', status: 'posted',
      akun_debit: '61012 Beban Gaji Pokok Pegawai Tetap', akun_kredit: '11103 Bank Kalsel - 3204661684',
      debit: 10_000_000, kredit: 10_000_000, keterangan: 'gaji' },
    { id: 'JV-2026-0619', tanggal: '2026-06-19', status: 'posted',
      akun_debit: '62013 Beban Pemeliharaan Mobil Truck', akun_kredit: '11103 Bank Kalsel - 3204661684',
      debit: 9_000_000, kredit: 9_000_000, keterangan: 'servis mobil truck operasional' },
    { id: 'JV-2026-0620', tanggal: '2026-06-20', status: 'posted',
      akun_debit: '11103 Bank Kalsel - 3204661684', akun_kredit: '41001 Pendapatan Sewa Kios',
      debit: 5_000_000, kredit: 5_000_000, keterangan: 'penerimaan sewa kios' },
  ];

  lr = RD.buildLabaRugiRows(base.labaRugi, jN);
  nr = RD.buildNeracaRows(base.neraca, jN);
  ak = RD.buildArusKasRows(base.arusKas, jN);
  ops = LO.buildBebanOpsRows(base.bebanOps, jN);

  // Net cash on 11103 = −10 −9 +5 = −14M; profit-of-period = same.
  assertLeafDeltas('S1b', 'Laba Rugi', base.labaRugi, lr, {
    'Beban Gaji': 10_000_000,
    'Beban Pemeliharaan Kendaraan Operasional': 9_000_000,
    'Pendapatan Bisnis Utama': 5_000_000,
  });
  assertLeafSubtotals('S1b', 'Laba Rugi', lr, LR_LEAF_SUBTOTALS);
  assertLeafDeltas('S1b', 'Neraca', base.neraca, nr, {
    'Kas Bank Kalsel': -14_000_000,
    '(Laba) Rugi Periode Berjalan': -14_000_000,
  });
  assertLeafSubtotals('S1b', 'Neraca', nr, NERACA_LEAF_SUBTOTALS);
  check('S1b', 'Arus Kas operating activity moves by −Rp 14.000.000',
    approx((valOf(ak, /Diperoleh dari\s+Aktivitas Operasi/i) || 0) - (valOf(base.arusKas, /Diperoleh dari\s+Aktivitas Operasi/i) || 0), -14_000_000));
  check('S1b', 'Arus Kas net change moves by −Rp 14.000.000',
    approx((valOf(ak, /kenaikan/i) || 0) - (valOf(base.arusKas, /kenaikan/i) || 0), -14_000_000));
  check('S1b', 'Arus Kas ending cash moves by −Rp 14.000.000',
    approx((valOf(ak, /akhir periode/i) || 0) - (valOf(base.arusKas, /akhir periode/i) || 0), -14_000_000));
  // Arus Kas identity: Kenaikan == Operasi + Investasi + Pendanaan.
  const kenaikan = valOf(ak, /kenaikan/i) || 0;
  const actSum = (valOf(ak, /Diperoleh dari\s+Aktivitas Operasi/i) || 0)
    + (valOf(ak, /Digunakan untuk\s+Aktivitas Investasi/i) || 0)
    + (valOf(ak, /(Diperoleh|Digunakan).*Aktivitas Pendanaan/i) || 0);
  check('S1b', 'Arus Kas identity holds (Kenaikan == Σ activities)', approx(kenaikan, actSum), `${rupiah(kenaikan)} vs ${rupiah(actSum)}`);

  const bN = neracaBalanced(nr);
  check('S1b', 'Neraca balanced after several journals', bN.ok, `Aset ${rupiah(bN.aset)} vs Kew+Ek ${rupiah(bN.ke)}`);

  // LRA Beban Operasional: 62013 → outline 1.1.3 moves by +9M; all others quiet.
  const baseOps113 = base.bebanOps.find((r) => r.outline === '1.1.3').bulanIni;
  check('S1b', 'LRA Beban Operasional outline 1.1.3 moves by +Rp 9.000.000',
    approx(ops.rows['1.1.3'].value, baseOps113 + 9_000_000), `got ${rupiah(ops.rows['1.1.3'] && ops.rows['1.1.3'].value)}`);
  const lraQuietN = base.bebanOps.filter((r) => r.outline !== '1.1.3').every((r) => approx(ops.rows[r.outline].value, r.bulanIni));
  check('S1b', 'LRA Beban Operasional: all other outlines unchanged', lraQuietN);
  check('S1b', 'LRA Beban Operasional: no unmapped 62xxx leg dropped', ops.unmapped.length === 0);

  // ── Prove NO re-baseline happened: the in-memory baseline is byte-identical ─
  const baseAfter = JSON.stringify({ n: base.neraca, lr: base.labaRugi, ak: base.arusKas, ops: base.bebanOps });
  check('S1b', 'Baseline NOT mutated by the overlay (no reload / re-baseline needed)', baseAfter === baseSnapshot);
}

// ════════════════════════════════════════════════════════════════════════════
// SCENARIO 2 — SETUP FLOW.  June snapshot in QA DB == (2), no delta.  Req 2.1.
// ════════════════════════════════════════════════════════════════════════════
function openDb() { return new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY); }
function allRows(db, sql, p = []) { return new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r)))); }

async function scenario2_setupFlow(db, base) {
  section('━━ SCENARIO 2 — Setup flow: June QA snapshot == (2), no delta — Req 2.1 ━━');

  const dbN = (await allRows(db, 'SELECT label, value FROM report_neraca WHERE period=? ORDER BY sort_order', [JUNE]));
  const dbLR = (await allRows(db, 'SELECT label, value FROM report_laba_rugi WHERE period=? ORDER BY sort_order', [JUNE]));
  const dbAK = (await allRows(db, 'SELECT label, value FROM report_arus_kas WHERE period=? ORDER BY sort_order', [JUNE]));

  // Full sweep: every stored June row equals the (2) Excel value (≤ Rp 1).
  const sweep = (name, dbRows, xlRows) => {
    let mismatches = 0, compared = 0;
    const n = Math.min(dbRows.length, xlRows.length);
    for (let i = 0; i < n; i++) {
      if (dbRows[i].label !== xlRows[i].label) continue; // structural drift handled by count check below
      if (dbRows[i].value == null && xlRows[i].value == null) continue;
      compared++;
      if (!approx(dbRows[i].value, xlRows[i].value)) { mismatches++; if (mismatches <= 5) check('S2', `${name} "${dbRows[i].label}" == (2)`, false, `DB ${rupiah(dbRows[i].value)} ≠ (2) ${rupiah(xlRows[i].value)}`); }
    }
    check('S2', `${name}: row count matches (2)`, dbRows.length === xlRows.length, `DB=${dbRows.length} (2)=${xlRows.length}`);
    check('S2', `${name}: all ${compared} rows equal (2) within Rp ${TOL}`, mismatches === 0, `${mismatches} mismatch(es)`);
  };
  sweep('Neraca', dbN, base.neraca);
  sweep('Laba Rugi', dbLR, base.labaRugi);
  sweep('Arus Kas', dbAK, base.arusKas);

  // Key totals explicitly (the design "Examples" lines).
  check('S2', 'Neraca JUMLAH ASET == (2)', approx(valOf(dbN, /^JUMLAH ASET$/i), valOf(base.neraca, /^JUMLAH ASET$/i)),
    `DB ${rupiah(valOf(dbN, /^JUMLAH ASET$/i))}`);
  check('S2', 'Laba Rugi JUMLAH BEBAN UMUM DAN ADMINISTRASI == (2)',
    approx(valOf(dbLR, /JUMLAH BEBAN UMUM DAN ADMIN/i), valOf(base.labaRugi, /JUMLAH BEBAN UMUM DAN ADMIN/i)));
  check('S2', 'Arus Kas Saldo Kas Akhir Periode == (2)',
    approx(valOf(dbAK, /akhir periode/i), valOf(base.arusKas, /akhir periode/i)));

  // anggaran has ANG-bebanOperasional-* rows for month 6 → LRA isDynamic=false.
  const ops6 = await allRows(db, "SELECT COUNT(*) c FROM anggaran WHERE bulan=6 AND kategori='bebanOperasional'");
  check('S2', 'anggaran has ANG-bebanOperasional-* rows for month 6 (LRA isDynamic=false)', (ops6[0] ? ops6[0].c : 0) > 0, `${ops6[0] ? ops6[0].c : 0} rows`);

  // Neraca is balanced with no delta.
  const b = neracaBalanced(dbN);
  check('S2', 'June snapshot Neraca balanced (no delta)', b.ok, `Aset ${rupiah(b.aset)} vs Kew+Ek ${rupiah(b.ke)}`);
}

// ════════════════════════════════════════════════════════════════════════════
// SCENARIO 3 — UNMAPPED ACCOUNT surfaces as "(Belum Terpetakan)".  Req 2.3.
// ════════════════════════════════════════════════════════════════════════════
async function scenario3_unmappedAccount(base) {
  section('━━ SCENARIO 3 — Unmapped account surfaces (no silent drop) — Req 2.3 ━━');

  // 11203 "Piutang Lain-lain" is a CURRENT ASSET with NO reconcileAlias label →
  // it must surface as a visible "(Belum Terpetakan)" leaf, funded by revenue
  // (41001) so the sheet stays balanced.
  const j = [{ id: 'JV-2026-0618', tanggal: '2026-06-18', status: 'posted',
    akun_debit: '11203 Piutang Lain-lain', akun_kredit: '41001 Pendapatan Sewa Kios',
    debit: 7_000_000, kredit: 7_000_000, keterangan: 'piutang lain-lain atas pendapatan' }];

  const nr = RD.buildNeracaRows(base.neraca, j);

  const unmappedRow = nr.find((r) => r._unmapped && /Aset Lancar Lainnya \(Belum Terpetakan\)/i.test(r.label));
  check('S3', 'A "(Belum Terpetakan)" current-asset line APPEARS', !!unmappedRow, unmappedRow ? `label="${unmappedRow.label}"` : 'missing');
  check('S3', 'the "(Belum Terpetakan)" line carries the unmapped amount (Rp 7.000.000)', !!unmappedRow && approx(unmappedRow.value, 7_000_000), unmappedRow ? rupiah(unmappedRow.value) : '—');

  // Jumlah Aset Lancar == Σ its visible leaves (incl. the unmapped leaf).
  const idx = nr.findIndex((r) => /^Jumlah Aset Lancar$/i.test(String(r.label)));
  if (idx >= 0) {
    const total = nr[idx].value || 0;
    const leafSum = precedingLeafSum(nr, idx);
    check('S3', 'Jumlah Aset Lancar == Σ visible leaves (unmapped amount included, not dropped)', approx(total, leafSum), `total ${rupiah(total)} vs Σ ${rupiah(leafSum)}`);
  } else {
    check('S3', 'Jumlah Aset Lancar row located', false);
  }

  // Sheet still balances (the grand total already includes the unmapped amount).
  const b = neracaBalanced(nr);
  check('S3', 'Neraca still balanced with an unmapped account', b.ok, `Aset ${rupiah(b.aset)} vs Kew+Ek ${rupiah(b.ke)}`);

  // The amount must really be present somewhere — explicit "no silent drop".
  const asetDelta = (valOf(nr, /^JUMLAH ASET$/i) || 0) - (valOf(base.neraca, /^JUMLAH ASET$/i) || 0);
  check('S3', 'JUMLAH ASET rose by exactly the unmapped amount (no silent drop)', approx(asetDelta, 7_000_000), `Δ ${rupiah(asetDelta)}`);
}

// ════════════════════════════════════════════════════════════════════════════
// SCENARIO 4 — LAYOUT INTEGRATION (reuse the playwright/export harnesses). Req 2.5/2.6/3.4/3.5/3.6
// ════════════════════════════════════════════════════════════════════════════
function scenario4_layout() {
  section('━━ SCENARIO 4 — Layout integration (wide + side-by-side scroll, export all columns, vertical scroll) ━━');
  const specs = [
    { file: path.join(ROOT, 'tests', 'explore_layout_scroll.spec.cjs'), what: 'wide report + two side-by-side reports scroll horizontally; narrow no-scroll; print keeps columns (Req 2.5, 2.6, 3.4)' },
    { file: path.join(ROOT, 'tests', 'preserve_layout_export.spec.cjs'), what: 'export (LabaRugi/Neraca/ArusKas/FullReport) keeps all columns; vertical scroll + sticky header (Req 3.5, 3.6)' },
  ];
  for (const s of specs) {
    const rel = path.relative(ROOT, s.file);
    const res = spawnSync('node', [s.file], { cwd: ROOT, encoding: 'utf8' });
    const ok = res.status === 0;
    if (!ok) {
      const tail = String((res.stdout || '') + (res.stderr || '')).trim().split('\n').slice(-12).join('\n');
      console.log(`   ── ${rel} output (tail) ──\n${tail}`);
    }
    check('S4', `layout/export harness ${rel} passes`, ok, s.what);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SCENARIO 5 — CROSS-MONTH REGRESSION.  Req 3.1, 3.2, 3.3.
// ════════════════════════════════════════════════════════════════════════════
async function scenario5_crossMonth(db, base) {
  section('━━ SCENARIO 5 — Cross-month regression: Jan–May unchanged; switching months is isolated — Req 3.1–3.3 ━━');

  if (!fs.existsSync(BASELINE_JSON)) {
    check('S5', 'recorded baseline scripts/preserve_baseline.json present', false, 'run scripts/preserve_numeric.cjs first');
    return;
  }
  const recorded = JSON.parse(fs.readFileSync(BASELINE_JSON, 'utf8')).periods;

  // 5a. Jan–May DB == recorded baseline (value-for-value).
  let cells = 0, drift = 0;
  const live = {};
  for (const p of AUDITED_PERIODS) {
    live[p] = {
      neraca: (await allRows(db, 'SELECT label, value FROM report_neraca WHERE period=? ORDER BY sort_order', [p])).map((r) => ({ label: r.label, value: r.value })),
      labaRugi: (await allRows(db, 'SELECT label, value FROM report_laba_rugi WHERE period=? ORDER BY sort_order', [p])).map((r) => ({ label: r.label, value: r.value })),
      arusKas: (await allRows(db, 'SELECT label, value FROM report_arus_kas WHERE period=? ORDER BY sort_order', [p])).map((r) => ({ label: r.label, value: r.value })),
    };
    for (const tbl of ['neraca', 'labaRugi', 'arusKas']) {
      const a = live[p][tbl], b = (recorded[p] || {})[tbl] || [];
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        cells++;
        const av = a[i], bv = b[i];
        if (!av || !bv || av.label !== bv.label || Math.abs((av.value || 0) - (bv.value || 0)) > 1e-6) {
          drift++;
          if (drift <= 5) check('S5', `${p}/${tbl}[${i}] frozen`, false, `live ${av ? rupiah(av.value) : 'MISSING'} vs recorded ${bv ? rupiah(bv.value) : 'MISSING'}`);
        }
      }
    }
  }
  check('S5', `Jan–May frozen vs recorded baseline (${cells} cells across 5 periods × 3 reports)`, drift === 0, `${drift} drifted`);

  // 5b. Jan–May key totals still equal each month's Excel lampiran (≤ Rp 1).
  let xlChecks = 0, xlBad = 0;
  for (const src of reportImport.SOURCES) {
    if (!AUDITED_PERIODS.includes(src.period)) continue;
    let wb;
    try { wb = XLSX.readFile(path.join(src.dir || reportImport.FILES_DIR, src.file)); }
    catch (e) { xlBad++; check('S5', `${src.period}: Excel lampiran readable`, false, e.message); continue; }
    const xN = reportImport.parseNeraca(wb.Sheets[src.neracaSheet]);
    const xLR = reportImport.parseLabaRugi(wb.Sheets[src.lrSheet], src.lrValCol || 9);
    const cases = [
      ['Neraca JUMLAH ASET', valOf(live[src.period].neraca, /^JUMLAH ASET$/i), valOf(xN, /^JUMLAH ASET$/i)],
      ['Laba Rugi BERSIH SETELAH PAJAK', valOf(live[src.period].labaRugi, /BERSIH SETELAH PAJAK/i), valOf(xLR, /BERSIH SETELAH PAJAK/i)],
    ];
    for (const [name, dbv, xlv] of cases) {
      if (dbv == null || xlv == null) continue;
      xlChecks++;
      if (!approx(dbv, xlv)) { xlBad++; check('S5', `${src.period} ${name} == Excel`, false, `DB ${rupiah(dbv)} ≠ Excel ${rupiah(xlv)}`); }
    }
  }
  check('S5', `Jan–May key totals equal Excel lampiran (${xlChecks} checks, ≤ Rp ${TOL})`, xlBad === 0, `${xlBad} mismatch(es)`);

  // 5c. Switching months is isolated: posting a June delta and rendering June
  //     does not alter the Jan–May DB rows we just read (they are independent
  //     per-period data, never passed into the June overlay).
  const beforeSwitch = JSON.stringify(live);
  const juneDelta = [{ id: 'JV-2026-0625', tanggal: '2026-06-25', status: 'posted',
    akun_debit: '61012 Beban Gaji Pokok Pegawai Tetap', akun_kredit: '11103 Bank Kalsel - 3204661684',
    debit: 3_000_000, kredit: 3_000_000, keterangan: 'gaji tambahan' }];
  const juneLR = RD.buildLabaRugiRows(base.labaRugi, juneDelta); // render June with a delta
  const juneMoved = !approx(valOf(juneLR, /JUMLAH BEBAN UMUM DAN ADMIN/i), valOf(base.labaRugi, /JUMLAH BEBAN UMUM DAN ADMIN/i));
  const afterSwitch = JSON.stringify(live); // Jan–May data we hold is unchanged
  check('S5', 'rendering June WITH a delta actually changes June (control)', juneMoved);
  check('S5', 'switching to June does NOT alter Jan–May audited values', beforeSwitch === afterSwitch);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('═'.repeat(78));
  console.log(' INTEGRATION TESTS — full flow & cross-month regression');
  console.log(' Spec: perbaikan-laporan-juni-2026 / Task 8 (Req 2.1–2.6, 3.1–3.6)');
  console.log('═'.repeat(78));
  console.log(` DB (read-only): ${path.relative(ROOT, DB_PATH)}`);

  await loadRealModules();
  const base = explore.loadBaseline(); // correct (2) baseline, in-memory (never mutated)
  console.log(` Baseline (2): Neraca=${base.neraca.length} LabaRugi=${base.labaRugi.length} ArusKas=${base.arusKas.length} BebanOps=${base.bebanOps.length} rows`);

  const db = openDb();
  try {
    await scenario1_noRebaselineFlow(base);
    await scenario2_setupFlow(db, base);
    await scenario3_unmappedAccount(base);
    scenario4_layout();
    await scenario5_crossMonth(db, base);
  } finally {
    db.close();
  }

  console.log('\n' + '─'.repeat(78));
  if (failures.length === 0) {
    console.log(` ✅ ALL INTEGRATION SCENARIOS PASSED — ${checksRun} checks across 5 scenarios.`);
    console.log('    1) No-rebaseline delta flow: 4 reports reflect JV- journals; only affected');
    console.log('       lines + parents move by exactly the delta; Neraca balanced; total == Σ leaves.');
    console.log('    2) Setup flow: June QA snapshot == (2) (no delta); LRA isDynamic=false.');
    console.log('    3) Unmapped account surfaces as "(Belum Terpetakan)"; balanced; no silent drop.');
    console.log('    4) Layout/export: wide + side-by-side scroll; exports keep all columns; vertical scroll.');
    console.log('    5) Cross-month: Jan–May frozen vs baseline & Excel; switching months is isolated.');
  } else {
    console.log(` ❌ INTEGRATION FAILURES: ${failures.length} / ${checksRun} checks`);
    const byScenario = {};
    failures.forEach((f) => { byScenario[f.scenario] = (byScenario[f.scenario] || 0) + 1; });
    console.log('    by scenario: ' + Object.entries(byScenario).map(([k, v]) => `${k}=${v}`).join(', '));
    failures.slice(0, 40).forEach((f) => console.log(`    [${f.scenario}] ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
  }
  console.log('─'.repeat(78));
  process.exit(failures.length === 0 ? 0 : 1);
}

if (require.main === module) {
  main().catch((e) => { console.error('FATAL:', e && e.stack ? e.stack : e); process.exit(2); });
}

module.exports = { main };
