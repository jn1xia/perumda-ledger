#!/usr/bin/env node
/* eslint-disable */
/**
 * preserve_numeric.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * PRESERVATION PROPERTY TEST  —  Spec: perbaikan-laporan-juni-2026  (TASK 3)
 *
 * Property 2 (Preservation): "Bulan Lain, Juni Tanpa Delta, dan Baris Tak
 * Terdampak."  Validates Requirements 3.1, 3.2, 3.3.
 *
 * ✅  THIS TEST IS DESIGNED TO **PASS** ON THE CURRENT (UNFIXED) CODE.
 *     Passing locks in the baseline that the fix must NOT regress. The SAME
 *     script is re-run at task 5.7 to confirm the fix (tasks 5.1–5.3) introduces
 *     no regression. It is written so it still PASSES after the June re-baseline
 *     (task 5.2) — see "WHY THIS SURVIVES THE JUNE RE-BASELINE" below.
 *
 * Methodology: OBSERVATION-FIRST. We observe behavior on the current/unfixed
 * data and freeze it as the baseline to preserve. There are three guards, of
 * two different natures:
 *
 *   GUARD A — Jan–May frozen NUMERIC baseline  (Req 3.2, the core regression
 *     guard).  The stored snapshots (report_neraca / report_laba_rugi /
 *     report_arus_kas) for 2026-01…2026-05 are recorded verbatim into
 *     `scripts/preserve_baseline.json` on first run, and every later run asserts
 *     the live DB still equals that recording — value-for-value. We also cross-
 *     check those stored values against each month's official Excel lampiran
 *     (≤ Rp 1) so "frozen" also means "still equals Excel" (Req 3.2). These are
 *     FIXED NUMBERS: Jan–May must be byte-identical before and after the fix.
 *
 *   GUARD B — June WITHOUT user delta == its stored snapshot  (Req 3.1).
 *     STRUCTURAL, not a fixed number. We assert render(base, NO JV-/JRN- delta)
 *     == the loaded June snapshot exactly (no phantom movement). We do NOT hard-
 *     code June's current figures, because task 5.2 will intentionally re-base
 *     June from `(2)` and June's no-delta numbers WILL change — that is the fix,
 *     not a regression. The invariant that holds before AND after is: with no
 *     delta, the rendered report equals whatever snapshot is loaded.
 *
 *   GUARD C — Untouched rows / overlay quiet  (Req 3.3).  STRUCTURAL. When a
 *     delta touches some accounts, rows/accounts NOT relevant to that delta must
 *     not move: overlay(rendered) == base for those rows. Holds before and after
 *     the fix because an irrelevant delta never attributes to a disjoint line.
 *
 * WHY THIS SURVIVES THE JUNE RE-BASELINE (task 5.2):
 *   • Jan–May invariance is NUMERIC/FROZEN — task 5.2 only rewrites the 2026-06
 *     snapshot, so Jan–May DB rows stay identical to the recording.
 *   • The June and untouched-row invariants are STRUCTURAL — they compare the
 *     overlay output to the *currently loaded* snapshot, never to a hard-coded
 *     June figure. After June is re-based to `(2)`, "no delta ⇒ render == loaded
 *     snapshot" and "irrelevant delta ⇒ disjoint rows unchanged" both still hold.
 *
 * Conventions follow scripts/explore_overlay_delta.cjs (Task 1): standalone
 * CommonJS, `xlsx` + `sqlite3`, QA DB opened READ-ONLY (never mutated), and the
 * overlay attribution logic mirrored verbatim from src/pages/Laporan.jsx with
 * source citations (the React/ESM render path can't run inside a .cjs harness).
 *
 * Run (UNFIXED code):
 *   DB_PATH=server/perumda_ledger.qa.db node scripts/preserve_numeric.cjs
 *
 * Exit code: 0 when all preservation guards hold (EXPECTED here), 1 otherwise.
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const reportImport = require('./import_report_data.cjs'); // parseNeraca/parseLabaRugi/parseArusKas + SOURCES

// ── Config ──────────────────────────────────────────────────────────────────
const TOL = 1; // Rp 1 rounding tolerance (Req 3.2 "toleransi pembulatan ≤ Rp 1")
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'perumda_ledger.qa.db');
const BASELINE_JSON = path.join(__dirname, 'preserve_baseline.json'); // stored next to this test
const AUDITED_PERIODS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
const JUNE = '2026-06';

// ── Small helpers ─────────────────────────────────────────────────────────
const rupiah = (n) => (n == null ? '—' : (Math.round(Number(n) * 100) / 100).toLocaleString('id-ID'));
const approx = (a, b) => Math.abs((a || 0) - (b || 0)) <= TOL;
// Frozen-baseline equality: null==null, numbers equal within float noise.
function equalValue(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) <= 1e-6;
}
// Deterministic LCG (same generator as Task 1) for reproducible sampling.
let _seed = 20260603;
const rnd = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ════════════════════════════════════════════════════════════════════════════
// READ-ONLY DB ACCESS
// ════════════════════════════════════════════════════════════════════════════
function openDb() {
  return new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
}
function allRows(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, r) => (e ? reject(e) : resolve(r))));
}
async function readNeraca(db, period) {
  return (await allRows(db, 'SELECT sort_order, label, value, depth FROM report_neraca WHERE period=? ORDER BY sort_order', [period]))
    .map(r => ({ order: r.sort_order, label: r.label, value: r.value, depth: r.depth }));
}
async function readLabaRugi(db, period) {
  return (await allRows(db, 'SELECT sort_order, label, value, depth FROM report_laba_rugi WHERE period=? ORDER BY sort_order', [period]))
    .map(r => ({ order: r.sort_order, label: r.label, value: r.value, depth: r.depth }));
}
async function readArusKas(db, period) {
  return (await allRows(db, 'SELECT sort_order, label, value, is_section FROM report_arus_kas WHERE period=? ORDER BY sort_order', [period]))
    .map(r => ({ order: r.sort_order, label: r.label, value: r.value, isSection: !!r.is_section }));
}
async function readPeriodReports(db, period) {
  return {
    neraca: await readNeraca(db, period),
    labaRugi: await readLabaRugi(db, period),
    arusKas: await readArusKas(db, period),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// OVERLAY MIRROR  —  verbatim port of the delta-overlay attribution logic in
// src/pages/Laporan.jsx (via scripts/explore_overlay_delta.cjs). Used ONLY to
// exercise the "no movement" structural guards (B & C). With an empty delta
// every function is a no-op by construction; with an irrelevant delta it must
// leave disjoint rows untouched.
// ════════════════════════════════════════════════════════════════════════════
const reconcileAlias = require('../src/utils/reconcileAlias.json');
const lrAlias = require('../src/utils/lrAlias.json');

// ── REAL attribution modules (loaded via dynamic import in main) ──
// The previously-copied buggy mirror has been removed; these wrappers call the
// SAME pure functions the React app uses (src/utils/reportDelta.js), so this
// preservation test exercises the real overlay code path.
let RD = null;
async function loadRealModules() { RD = await import('../src/utils/reportDelta.js'); }

// ── src/utils/reportDelta.js : deltaByPrefix / deltaCash / deltaByName ──
function deltaByPrefix(expandedDelta, prefix, isDebit) {
  return (expandedDelta || []).reduce((sum, j) => {
    const primaryCode = (isDebit ? j.akun_debit : j.akun_kredit)?.split(' ')[0] || '';
    const primaryAmt = isDebit ? (j.debit || 0) : (j.kredit || 0);
    const offsetCode = (isDebit ? j.akun_kredit : j.akun_debit)?.split(' ')[0] || '';
    const offsetAmt = isDebit ? (j.kredit || 0) : (j.debit || 0);
    let s = sum;
    if (primaryCode.startsWith(prefix)) s += primaryAmt;
    if (offsetCode.startsWith(prefix)) s -= offsetAmt;
    return s;
  }, 0);
}
function deltaCash(expandedDelta) {
  return (expandedDelta || []).reduce((sum, j) => {
    const dc = (j.akun_debit || '').split(' ')[0];
    const kc = (j.akun_kredit || '').split(' ')[0];
    let s = sum;
    if (dc.startsWith('111')) s += (j.debit || 0);
    if (kc.startsWith('111')) s -= (j.kredit || 0);
    return s;
  }, 0);
}
function deltaByName(expandedDelta) {
  const map = {};
  const add = (acctStr, amt, sign) => {
    if (!acctStr || !amt) return;
    let name = acctStr.replace(/^\S+\s*-?\s*/, '').split(' > ')[0].trim();
    if (!name) name = acctStr.trim();
    const key = name.toLowerCase();
    map[key] = (map[key] || 0) + sign * amt;
  };
  (expandedDelta || []).forEach(j => {
    const dCode = (j.akun_debit || '').split(' ')[0];
    const kCode = (j.akun_kredit || '').split(' ')[0];
    if (j.debit) add(j.akun_debit, j.debit, /^[1568]/.test(dCode) ? +1 : -1);
    if (j.kredit) add(j.akun_kredit, j.kredit, /^[2347]/.test(kCode) ? +1 : -1);
  });
  return map;
}

// ── REAL overlay builders (src/utils/reportDelta.js) ──
function buildLR_AppRows(baseLR, delta) { return RD.buildLabaRugiRows(baseLR, delta); }
function buildNeraca_AppRows(baseN, delta) { return RD.buildNeracaRows(baseN, delta); }
function buildArusKas_AppRows(baseAK, delta) { return RD.buildArusKasRows(baseAK, delta); }

// ════════════════════════════════════════════════════════════════════════════
// FAILURE COLLECTION
// ════════════════════════════════════════════════════════════════════════════
const failures = [];
const fail = (guard, detail) => failures.push({ guard, detail });

// ════════════════════════════════════════════════════════════════════════════
// GUARD A — Jan–May frozen NUMERIC baseline (Req 3.2)
// ════════════════════════════════════════════════════════════════════════════
async function guardA_frozenBaseline(db) {
  console.log('\n── GUARD A — Jan–May frozen numeric baseline (Req 3.2) ──');

  // 1) Snapshot the live DB for Jan–May.
  const live = {};
  for (const p of AUDITED_PERIODS) live[p] = await readPeriodReports(db, p);

  // 2) Record on first run; otherwise load the recorded baseline.
  let recorded, mode;
  if (!fs.existsSync(BASELINE_JSON)) {
    fs.writeFileSync(BASELINE_JSON, JSON.stringify({ recordedAt: new Date().toISOString(), periods: live }, null, 2));
    recorded = live; mode = 'RECORDED (first run)';
    console.log(`   ✎ Baseline recorded → ${path.relative(path.join(__dirname, '..'), BASELINE_JSON)}`);
  } else {
    recorded = JSON.parse(fs.readFileSync(BASELINE_JSON, 'utf8')).periods;
    mode = 'COMPARED to recorded baseline';
    console.log(`   ↺ Loaded recorded baseline ← ${path.relative(path.join(__dirname, '..'), BASELINE_JSON)}`);
  }

  // 3) Full sweep: live == recorded, value-for-value (the core regression guard).
  let cellsChecked = 0;
  for (const p of AUDITED_PERIODS) {
    for (const tbl of ['neraca', 'labaRugi', 'arusKas']) {
      const a = live[p][tbl], b = (recorded[p] || {})[tbl] || [];
      if (a.length !== b.length) { fail('A', `${p}/${tbl}: row count ${a.length} ≠ recorded ${b.length}`); continue; }
      for (let i = 0; i < a.length; i++) {
        cellsChecked++;
        if (a[i].label !== b[i].label) fail('A', `${p}/${tbl}[${i}]: label "${a[i].label}" ≠ recorded "${b[i].label}"`);
        if (!equalValue(a[i].value, b[i].value)) fail('A', `${p}/${tbl} "${a[i].label}": value ${rupiah(a[i].value)} ≠ recorded ${rupiah(b[i].value)}`);
      }
    }
  }

  // 4) Property-based style: seeded random sampling over (period, table, row).
  const flat = [];
  for (const p of AUDITED_PERIODS)
    for (const tbl of ['neraca', 'labaRugi', 'arusKas'])
      live[p][tbl].forEach((row, i) => flat.push({ p, tbl, i, row }));
  const SAMPLES = 80;
  let sampleMismatch = 0;
  for (let s = 0; s < SAMPLES; s++) {
    const f = flat[Math.floor(rnd() * flat.length)];
    const rec = ((recorded[f.p] || {})[f.tbl] || [])[f.i];
    if (!rec || rec.label !== f.row.label || !equalValue(rec.value, f.row.value)) {
      sampleMismatch++;
      fail('A', `random sample ${f.p}/${f.tbl}[${f.i}] "${f.row.label}" drifted: ${rupiah(f.row.value)} vs recorded ${rec ? rupiah(rec.value) : 'MISSING'}`);
    }
  }

  // 5) Cross-check stored Jan–May against the official Excel lampiran (Req 3.2).
  //    Key totals only, ≤ Rp 1 — confirms "frozen" also means "still equals Excel".
  let xlChecks = 0, xlMissing = 0;
  for (const src of reportImport.SOURCES) {
    if (!AUDITED_PERIODS.includes(src.period)) continue;
    let wb;
    try { wb = XLSX.readFile(path.join(src.dir || reportImport.FILES_DIR, src.file)); }
    catch (e) { fail('A', `${src.period}: cannot open Excel ${src.file}: ${e.message}`); continue; }

    const xN = reportImport.parseNeraca(wb.Sheets[src.neracaSheet]);
    const xLR = reportImport.parseLabaRugi(wb.Sheets[src.lrSheet], src.lrValCol || 9);
    const dbN = live[src.period].neraca, dbLR = live[src.period].labaRugi;
    const findN = (rows, re) => (rows.find(r => re.test(String(r.label))) || {}).value;
    const checks = [
      ['Neraca JUMLAH ASET', findN(dbN, /^JUMLAH ASET$/i), findN(xN, /^JUMLAH ASET$/i)],
      ['Neraca JUMLAH KEWAJIBAN', findN(dbN, /^JUMLAH KEWAJIBAN$/i), findN(xN, /^JUMLAH KEWAJIBAN$/i)],
      ['Neraca JUMLAH EKUITAS', findN(dbN, /^JUMLAH EKUITAS$/i), findN(xN, /^JUMLAH EKUITAS$/i)],
      ['LabaRugi BERSIH SETELAH PAJAK', findN(dbLR, /BERSIH SETELAH PAJAK/i), findN(xLR, /BERSIH SETELAH PAJAK/i)],
    ];
    for (const [name, dbv, xlv] of checks) {
      if (dbv == null || xlv == null) { xlMissing++; continue; }
      xlChecks++;
      if (!approx(dbv, xlv)) fail('A', `${src.period} ${name}: DB ${rupiah(dbv)} ≠ Excel ${rupiah(xlv)} (Δ ${rupiah(dbv - xlv)})`);
    }
  }

  // 6) Structural: each stored Jan–May Neraca is balanced (Aset == Kewajiban+Ekuitas).
  for (const p of AUDITED_PERIODS) {
    const rows = live[p].neraca;
    const aset = (rows.find(r => /^JUMLAH ASET$/i.test(r.label)) || {}).value;
    const ke = (rows.find(r => /JUMLAH KEWAJIBAN DAN EKUITAS/i.test(r.label)) || {}).value;
    if (aset != null && ke != null && !approx(aset, ke))
      fail('A', `${p} Neraca not balanced: Aset ${rupiah(aset)} ≠ Kewajiban+Ekuitas ${rupiah(ke)}`);
  }

  console.log(`   mode: ${mode}`);
  console.log(`   full sweep: ${cellsChecked} cells across ${AUDITED_PERIODS.length} periods × 3 reports`);
  console.log(`   random samples: ${SAMPLES} (mismatches: ${sampleMismatch})`);
  console.log(`   Excel cross-checks: ${xlChecks} key totals (≤ Rp ${TOL}); ${xlMissing} label(s) not located`);
  console.log(`   balance checks: ${AUDITED_PERIODS.length} periods`);
}

// ════════════════════════════════════════════════════════════════════════════
// GUARD B — June WITHOUT user delta == its stored snapshot (Req 3.1, STRUCTURAL)
// ════════════════════════════════════════════════════════════════════════════
async function guardB_juneNoDelta(db) {
  console.log('\n── GUARD B — June (no JV-/JRN- delta) == stored snapshot (Req 3.1) ──');
  const june = await readPeriodReports(db, JUNE);
  const NO_DELTA = []; // the "no user journal" scenario

  const checkIdentity = (report, baseRows, appRows) => {
    let moved = 0;
    for (let i = 0; i < baseRows.length; i++) {
      if (!equalValue(baseRows[i].value, appRows[i].value)) {
        moved++;
        fail('B', `${report} "${baseRows[i].label}": no-delta render ${rupiah(appRows[i].value)} ≠ snapshot ${rupiah(baseRows[i].value)}`);
      }
    }
    return moved;
  };

  const m1 = checkIdentity('Neraca', june.neraca, buildNeraca_AppRows(june.neraca, NO_DELTA));
  const m2 = checkIdentity('Laba Rugi', june.labaRugi, buildLR_AppRows(june.labaRugi, NO_DELTA));
  const m3 = checkIdentity('Arus Kas', june.arusKas, buildArusKas_AppRows(june.arusKas, NO_DELTA));

  console.log(`   render(base, no delta) compared to loaded snapshot — phantom movements: ${m1 + m2 + m3}`);
  console.log(`   (structural: compares to the *loaded* June snapshot, so it survives the task-5.2 re-baseline)`);
}

// ════════════════════════════════════════════════════════════════════════════
// GUARD C — Untouched rows / overlay quiet (Req 3.3, STRUCTURAL)
// ════════════════════════════════════════════════════════════════════════════
// A delta touching only an operating-expense account (class 6) paid via cash
// (11103). Rows in DISJOINT sections must not move under either the unfixed or
// the fixed overlay, because an irrelevant delta never attributes to them.
const MOVERS = [
  { deb: '61012 - Beban Gaji Pokok Pegawai Tetap', kre: '11103 - Bank Kalsel' },
  { deb: '62012 - Beban Pemeliharaan Pasar', kre: '11103 - Bank Kalsel' },
  { deb: '61020 - Beban Alat Tulis Kantor', kre: '11103 - Bank Kalsel' },
];
// Leaf rows provably disjoint from {class-6 beban, 11103 cash, P/L-berjalan, totals}:
const UNTOUCHED = {
  neraca: ['Tanah', 'Bangunan', 'Mesin', 'Modal Disetor', 'Koreksi Ekuitas'],          // fixed assets + equity (not in alias map)
  labaRugi: ['Pendapatan Bisnis Utama', 'Pendapatan Pengembangan Bisnis Lainnya', 'Beban Administrasi Bank'], // revenue + non-op beban
  arusKas: ['Pembelian Aset Tetap', 'Pengadaan Aset Tidak Berwujud', 'Utang Bank', 'Penyetoran Modal'],       // investing + financing
};

async function guardC_overlayQuiet(db) {
  console.log('\n── GUARD C — untouched rows / overlay quiet (Req 3.3) ──');
  const june = await readPeriodReports(db, JUNE);
  const baseVal = (rows, label) => { const r = rows.find(x => x.label === label); return r ? r.value : undefined; };

  const TRIALS = 30;
  let trials = 0, checks = 0;
  for (let t = 0; t < TRIALS; t++) {
    const mv = pick(MOVERS);
    const amt = Math.floor(rnd() * 9_000_000) + 1_000_000;
    const delta = [{ id: `JV-QUIET-${t}`, tanggal: '2026-06-18', status: 'posted',
      akun_debit: mv.deb, akun_kredit: mv.kre, debit: amt, kredit: amt, keterangan: 'overlay-quiet probe' }];
    trials++;

    const apps = {
      neraca: buildNeraca_AppRows(june.neraca, delta),
      labaRugi: buildLR_AppRows(june.labaRugi, delta),
      arusKas: buildArusKas_AppRows(june.arusKas, delta),
    };
    for (const tbl of ['neraca', 'labaRugi', 'arusKas']) {
      for (const label of UNTOUCHED[tbl]) {
        const before = baseVal(june[tbl], label);
        if (before === undefined) continue; // label not present this period — skip silently
        const after = baseVal(apps[tbl], label);
        checks++;
        if (!equalValue(before, after))
          fail('C', `${tbl} "${label}" moved by an irrelevant delta (${mv.deb.split(' ')[0]} Rp ${rupiah(amt)}): ${rupiah(before)} → ${rupiah(after)}`);
      }
    }
  }
  console.log(`   ${trials} random irrelevant-delta trials × disjoint leaves → ${checks} "must-not-move" checks`);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('═'.repeat(78));
  console.log(' PRESERVATION PROPERTY TEST — bulan lain, Juni tanpa delta, baris tak terdampak');
  console.log(' Spec: perbaikan-laporan-juni-2026 / Task 3 / Property 2 (Req 3.1, 3.2, 3.3)');
  console.log(' EXPECTATION: this test PASSES on unfixed code (locks the baseline to preserve).');
  console.log('═'.repeat(78));
  console.log(` DB (read-only): ${path.relative(path.join(__dirname, '..'), DB_PATH)}`);

  const db = openDb();
  try {
    await loadRealModules();
    await guardA_frozenBaseline(db);
    await guardB_juneNoDelta(db);
    await guardC_overlayQuiet(db);
  } finally {
    db.close();
  }

  // ── Report ──
  console.log('\n' + '─'.repeat(78));
  if (failures.length === 0) {
    console.log(' ✅ ALL PRESERVATION GUARDS HOLD.');
    console.log('    • Guard A: Jan–May snapshots frozen (recorded JSON) and equal to Excel lampiran.');
    console.log('    • Guard B: June with no delta renders exactly its stored snapshot (no phantom movement).');
    console.log('    • Guard C: irrelevant deltas leave disjoint rows untouched (overlay quiet).');
    console.log('    This is the EXPECTED outcome for Task 3 — the baseline to preserve is locked in.');
    console.log('    Re-run at task 5.7 to confirm the fix introduces no regression.');
  } else {
    const byGuard = { A: 0, B: 0, C: 0 };
    failures.forEach(f => { byGuard[f.guard] = (byGuard[f.guard] || 0) + 1; });
    console.log(` ❌ PRESERVATION VIOLATIONS: ${failures.length}  (A=${byGuard.A}, B=${byGuard.B}, C=${byGuard.C})`);
    failures.slice(0, 60).forEach(f => console.log(`    [Guard ${f.guard}] ${f.detail}`));
    if (failures.length > 60) console.log(`    … and ${failures.length - 60} more`);
  }
  console.log('─'.repeat(78));
  process.exit(failures.length === 0 ? 0 : 1);
}

if (require.main === module) {
  main().catch(e => { console.error('FATAL:', e); process.exit(2); });
}

module.exports = {
  buildLR_AppRows, buildNeraca_AppRows, buildArusKas_AppRows,
  deltaByPrefix, deltaCash, deltaByName, equalValue, TOL, BASELINE_JSON,
};
