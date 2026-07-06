#!/usr/bin/env node
/* eslint-disable */
/**
 * pbt_overlay.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * PROPERTY-BASED TESTS (numeric) — Spec: perbaikan-laporan-juni-2026 (TASK 7)
 *
 * Validates Requirements 2.1, 2.2, 2.3, 2.4 (fix checking) and 3.1, 3.2, 3.3
 * (preservation checking) — the numeric half of Task 7. The layout half
 * (Requirements 2.5, 2.6, 3.4) lives in tests/pbt_layout.spec.cjs.
 *
 * This harness exercises MANY seeded-random cases (100+ trials per property)
 * against the REAL, shipped attribution code (src/utils/reportDelta.js and
 * src/utils/lraOutline.js, loaded via dynamic import()). It NEVER mutates the
 * live data: the correct June baseline is parsed in-memory from the official
 * Excel reference `(2)` (reused via scripts/explore_overlay_delta.cjs), and the
 * QA DB is opened READ-ONLY for the preservation guards.
 *
 * Conventions (project has no jest/vitest/fast-check): standalone CommonJS with
 * an inline seeded RNG (the same LCG used by the other `.cjs` harnesses), `xlsx`
 * + `sqlite3`, ESM source loaded with dynamic import().
 *
 *   PROPERTY 1 (fix checking, primary) — for random posted JV- journals on the
 *     correct `(2)` baseline, for sampled report lines across all four reports:
 *       • renderValue(L) == baseline(L) + correctlyAttributedDelta(L)  (≤ Rp 1),
 *         where correctlyAttributedDelta is computed INDEPENDENTLY by COA code
 *         (not by reusing the implementation's own attributeDelta output),
 *       • every JUMLAH == Σ its visible leaves (incl. any "(Belum Terpetakan)"),
 *       • Neraca balances (JUMLAH ASET == JUMLAH KEWAJIBAN DAN EKUITAS ≤ Rp 1),
 *       • Arus Kas identity (Kenaikan == Operasi + Investasi + Pendanaan),
 *       • the sign follows each account's normal balance and the LRA outline is
 *         correct, and no journal is silently dropped (unmapped is surfaced).
 *
 *   PROPERTY 2 (preservation) — for random periods Jan–May and random rows the
 *     value is unchanged vs the recorded baseline (scripts/preserve_baseline.json
 *     + read-only QA DB); for an empty/irrelevant delta the overlay does not
 *     move disjoint rows.
 *
 *   PROPERTY 4 (no double-count + sign) — for random JV- deltas the moved total
 *     equals the sum of correctly-attributed leaf deltas (no double-count) and
 *     the sign matches the accounts' normal balance.
 *
 * Run:
 *   DB_PATH=server/perumda_ledger.qa.db node scripts/pbt_overlay.cjs
 *
 * Exit code: 0 when every property holds across all trials, 1 otherwise. On a
 * failure the seed + counterexample are printed for reproducibility; per Task 7
 * we STOP and report a real defect rather than weakening the property.
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const explore = require('./explore_overlay_delta.cjs'); // loadBaseline() from Excel (2)

// ── Config ──────────────────────────────────────────────────────────────────
const TOL = 1; // Rp 1 rounding tolerance (Expected Behavior 2.1–2.4, Req 3.2)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'perumda_ledger.qa.db');
const BASELINE_JSON = path.join(__dirname, 'preserve_baseline.json');
const AUDITED_PERIODS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
const JUNE = '2026-06';
const SEED = 0x7A5E0017; // fixed seed → reproducible sampling

// ── Helpers ─────────────────────────────────────────────────────────────────
const rupiah = (n) => (n == null ? '—' : (Math.round(Number(n) * 100) / 100).toLocaleString('id-ID'));
const approx = (a, b) => Math.abs((a || 0) - (b || 0)) <= TOL;
const equalValue = (a, b) => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) <= 1e-6;
};
// Deterministic LCG (same family as the other harnesses) for reproducibility.
let _seed = SEED >>> 0;
const rnd = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const randAmt = () => Math.floor(rnd() * 19_000_000) + 1_000_000; // Rp 1jt – 20jt

// ── Failure collection ────────────────────────────────────────────────────
const failures = [];
const fail = (prop, detail, extra) => failures.push({ prop, detail, extra });

// ════════════════════════════════════════════════════════════════════════════
// REAL modules under test (loaded via dynamic import in main)
// ════════════════════════════════════════════════════════════════════════════
let RD = null; // src/utils/reportDelta.js  (Neraca / Laba Rugi / Arus Kas overlay)
let LO = null; // src/utils/lraOutline.js   (LRA Beban Operasional overlay)
async function loadRealModules() {
  RD = await import('../src/utils/reportDelta.js');
  LO = await import('../src/utils/lraOutline.js');
}

// ════════════════════════════════════════════════════════════════════════════
// INDEPENDENT ORACLE — correctlyAttributedDelta computed by STABLE COA code.
// Written from scratch (NOT calling RD.attributeDelta): each journal leg moves
// its own account in its natural direction; section sums drive the totals via
// the accounting identities; leaves resolve by code. This is the oracle the
// app render is checked against.
// ════════════════════════════════════════════════════════════════════════════
const codeOf = (acctStr) => String(acctStr || '').trim().split(/\s+/)[0] || '';

// Normal balance by account class (debit-normal => +debit / -kredit).
function oracleDebitNormal(code) {
  const c = String(code || '');
  if (/^1/.test(c)) return true;       // Aset
  if (/^[23]/.test(c)) return false;   // Kewajiban / Ekuitas
  if (/^[47]/.test(c)) return false;   // Pendapatan
  if (/^[5689]/.test(c)) return true;  // HPP / Beban / non-ops / Pajak penghasilan
  return true;
}
function oracleNeracaSection(code) {
  const c = String(code || '');
  if (/^11/.test(c)) return 'asetLancar';
  if (/^1[23]/.test(c)) return 'asetTidakLancar';
  if (/^2/.test(c)) return 'kewajiban';
  if (/^3/.test(c)) return 'ekuitas';
  return 'laba';
}
function oracleActivity(counterCode) {
  const c = String(counterCode || '');
  if (/^1[23]/.test(c)) return 'investasi';
  if (/^22/.test(c) || /^3/.test(c)) return 'pendanaan';
  return 'operasi';
}
// COA-code → exact Excel label (the alias JSON files are used purely as a data
// dictionary; the resolution logic below is the oracle's own).
const lrAlias = require('../src/utils/lrAlias.json');
const reconcileAlias = require('../src/utils/reconcileAlias.json');
function oracleLrLine(code) {
  const c = String(code || '');
  if (lrAlias[c]) return lrAlias[c];
  const group = c.length >= 5 ? c.slice(0, 4) + '0' : c;
  if (lrAlias[group]) return lrAlias[group];
  if (lrAlias[c.slice(0, 2)]) return lrAlias[c.slice(0, 2)];
  return null;
}
function oracleNeracaLine(code) { return reconcileAlias[String(code || '')] || null; }

// LR total labels (keyword → derived delta). Same accounting structure the
// report uses, but the section sums feeding it are computed independently here.
function lrTotalDeltas(s) {
  const bruto = s.pendUsaha - s.bpp;
  const bebanUsaha = s.admin + s.ops;
  const labaUsaha = bruto - bebanUsaha;
  const netLainLain = s.pendLain - s.bebanNonOps;
  const sebelumPajak = labaUsaha + netLainLain;
  const setelahPajak = sebelumPajak - s.pajak;
  const ebitda = sebelumPajak - s.bunga + s.pajakBank + s.penyusutan;
  return [
    ['JUMLAH PENDAPATAN USAHA', s.pendUsaha],
    ['JUMLAH BEBAN POKOK PENJUALAN', s.bpp],
    ['LABA (RUGI) BRUTO', bruto],
    ['JUMLAH BEBAN UMUM DAN ADMINISTRASI', s.admin],
    ['BEBAN OPERASIONAL DAN BISNIS', s.ops],
    ['BEBAN USAHA', bebanUsaha],
    ['LABA (RUGI) USAHA', labaUsaha],
    ['JUMLAH PENDAPATAN LAIN-LAIN', s.pendLain],
    ['BEBAN NON OPERASIONAL', s.bebanNonOps],
    ['JUMLAH PENDAPATAN DAN (BEBAN LAIN-LAIN)', netLainLain],
    ['BERSIH SEBELUM PAJAK', sebelumPajak],
    ['BERSIH SETELAH PAJAK', setelahPajak],
    ['EBITDA', ebitda],
  ];
}
const isLrTotalLabel = (label) => {
  const u = String(label || '').toUpperCase();
  return u.includes('JUMLAH') || u.includes('JUMAH') || u.startsWith('LABA') || u.startsWith('EBITDA');
};

/** Attribute a set of (single-line) delta journals independently by COA code. */
function oracleAttribute(journals) {
  const lrLeaf = {}, nLeaf = {};
  const s = { pendUsaha: 0, bpp: 0, admin: 0, ops: 0, pendLain: 0, bebanNonOps: 0, pajak: 0, penyusutan: 0, bunga: 0, pajakBank: 0 };
  const nSec = { asetLancar: 0, asetTidakLancar: 0, kewajiban: 0, ekuitasDirect: 0, pl: 0, unmappedLancar: 0, unmappedTidakLancar: 0 };
  const ak = { operasi: 0, investasi: 0, pendanaan: 0, cash: 0 };
  const add = (m, k, v) => { if (k) m[k] = (m[k] || 0) + v; };
  const legs = [];
  for (const j of journals) {
    if (j.debit) legs.push({ j, code: codeOf(j.akun_debit), amt: j.debit, side: 'D' });
    if (j.kredit) legs.push({ j, code: codeOf(j.akun_kredit), amt: j.kredit, side: 'K' });
  }
  for (const leg of legs) {
    const c = leg.code;
    const natural = (leg.side === 'D' ? (oracleDebitNormal(c) ? +1 : -1) : (oracleDebitNormal(c) ? -1 : +1)) * leg.amt;
    // Laba Rugi
    if (/^4/.test(c)) { s.pendUsaha += natural; add(lrLeaf, oracleLrLine(c), natural); }
    else if (/^51/.test(c)) { s.bpp += natural; }
    else if (/^61/.test(c)) { s.admin += natural; add(lrLeaf, oracleLrLine(c), natural); if (/^6113/.test(c)) s.penyusutan += natural; }
    else if (/^62/.test(c)) { s.ops += natural; add(lrLeaf, oracleLrLine(c), natural); }
    else if (/^7/.test(c)) { s.pendLain += natural; if (/^70001/.test(c)) s.bunga += natural; }
    else if (/^8/.test(c)) { s.bebanNonOps += natural; if (/^80001/.test(c)) s.pajakBank += natural; }
    else if (/^9/.test(c)) { s.pajak += natural; add(lrLeaf, oracleLrLine(c), natural); }
    // Neraca
    const sec = oracleNeracaSection(c);
    if (sec === 'asetLancar') { nSec.asetLancar += natural; const l = oracleNeracaLine(c); if (l) add(nLeaf, l, natural); else nSec.unmappedLancar += natural; }
    else if (sec === 'asetTidakLancar') { nSec.asetTidakLancar += natural; const l = oracleNeracaLine(c); if (l) add(nLeaf, l, natural); else nSec.unmappedTidakLancar += natural; }
    else if (sec === 'kewajiban') { nSec.kewajiban += natural; add(nLeaf, oracleNeracaLine(c), natural); }
    else if (sec === 'ekuitas') { nSec.ekuitasDirect += natural; add(nLeaf, oracleNeracaLine(c), natural); }
    else { nSec.pl += (/^[47]/.test(c) ? natural : -natural); }
    // Arus Kas classified in a journal-grouped pass after this loop (below).
  }
  // Arus Kas (journal-grouped): net each journal's cash legs, attribute by its
  // NON-cash legs — same independent rule as src/utils/reportDelta.js. Single-
  // line journals group to one key + one non-cash leg → identical to classifying
  // by the counter account; the net cash total is unchanged.
  const journalKey = (j) => (j && j._expandedFrom != null ? j._expandedFrom : (j && j.id != null ? j.id : j));
  const byJournal = new Map();
  for (const leg of legs) {
    const k = journalKey(leg.j);
    if (!byJournal.has(k)) byJournal.set(k, []);
    byJournal.get(k).push(leg);
  }
  const AK_ORDER = ['operasi', 'investasi', 'pendanaan'];
  for (const grp of byJournal.values()) {
    const cashLegs = grp.filter(l => /^111/.test(l.code));
    if (!cashLegs.length) continue;
    const netCash = cashLegs.reduce((s, l) => s + (l.side === 'D' ? +l.amt : -l.amt), 0);
    ak.cash += netCash;
    if (!netCash) continue;
    const weight = { operasi: 0, investasi: 0, pendanaan: 0 };
    let totalW = 0;
    for (const l of grp) { if (/^111/.test(l.code)) continue; weight[oracleActivity(l.code)] += l.amt; totalW += l.amt; }
    if (totalW <= 0) { ak.operasi += netCash; continue; }
    const touched = AK_ORDER.filter(a => weight[a] > 0);
    let assigned = 0;
    touched.forEach((a, i) => { const share = (i === touched.length - 1) ? (netCash - assigned) : (netCash * weight[a] / totalW); assigned += share; ak[a] += share; });
  }
  return { lrLeaf, nLeaf, s, nSec, ak };
}

// Independent expected DELTA for a given report line label.
function oracleLrDelta(label, A) {
  if (isLrTotalLabel(label)) {
    const u = String(label).toUpperCase();
    const hit = lrTotalDeltas(A.s).find(([kw]) => u.includes(kw));
    return hit ? hit[1] : 0;
  }
  return A.lrLeaf[label] != null ? A.lrLeaf[label] : 0;
}
function oracleNeracaDelta(label, A) {
  const u = String(label || '').toUpperCase();
  if (/jumlah aset lancar/i.test(label)) return A.nSec.asetLancar;
  if (/jumlah aset tidak lancar/i.test(label)) return A.nSec.asetTidakLancar;
  if (u.startsWith('JUMLAH ')) {
    if (u.includes('KEWAJIBAN DAN')) return A.nSec.kewajiban + A.nSec.ekuitasDirect + A.nSec.pl;
    if (u.includes('ASET')) return A.nSec.asetLancar + A.nSec.asetTidakLancar;
    if (u.includes('KEWAJIBAN')) return A.nSec.kewajiban;
    if (u.includes('EKUITAS')) return A.nSec.ekuitasDirect + A.nSec.pl;
  }
  if (/berjalan/i.test(label)) return A.nSec.pl;
  return A.nLeaf[label] != null ? A.nLeaf[label] : 0;
}
function oracleArusDelta(label, A) {
  const l = String(label || '');
  if (/Diperoleh dari\s+Aktivitas Operasi/i.test(l)) return A.ak.operasi;
  if (/Digunakan untuk\s+Aktivitas Investasi/i.test(l)) return A.ak.investasi;
  if (/Aktivitas Pendanaan/i.test(l) && /Diperoleh|Digunakan/i.test(l)) return A.ak.pendanaan;
  if (/kenaikan|akhir periode/i.test(l)) return A.ak.cash;
  return 0;
}

// ════════════════════════════════════════════════════════════════════════════
// RANDOM JOURNAL GENERATOR — realistic COA pool (codes + names).
// ════════════════════════════════════════════════════════════════════════════
const ACCOUNTS = {
  // Laba Rugi (mapped) — admin (61xx), operasional (62xx), revenue (41/42), tax
  '61012': 'Beban Gaji Pokok Pegawai Tetap',
  '61042': 'Beban Materai dan Benda Pos',
  '61071': 'Beban Pemeliharaan Instalasi',
  '62013': 'Beban Pemeliharaan Mobil Truck',
  '62021': 'Beban Pemeliharaan Bangunan Pasar',
  '62041': 'Beban Sewa Lapak Pelayanan',
  '41001': 'Pendapatan Sewa Kios',
  '41005': 'Pendapatan Pengelolaan Lain-lain',
  '42002': 'Pendapatan Pengembangan Bisnis B',
  '99999': 'Pajak Penghasilan',
  // Neraca (mapped current assets / liabilities / equity)
  '11201': 'Piutang Usaha',
  '11401': 'Persediaan Barang Dagang (Bapok dan Gerai Inflasi)',
  '21001': 'Utang Usaha',
  '22001': 'Utang Bank',
  // Neraca (UNMAPPED — to exercise "(Belum Terpetakan)" surfacing)
  '11203': 'Piutang Lain-lain',          // current asset, no reconcile label
  '12101': 'Tanah Tambahan Pasar',        // fixed asset, no reconcile label
  // Cash counter-accounts
  '11103': 'Bank Kalsel - 3204661684',
  '11104': 'Bank BNI',
};
// Accounts that can be the "primary" leg of a generated journal.
const PRIMARY_CODES = ['61012', '61042', '61071', '62013', '62021', '62041', '41001', '41005', '42002', '99999', '11201', '11401', '21001', '22001', '11203', '12101'];
const COUNTER_CODES = ['11103', '11104', '11201', '21001'];
const acctStr = (code) => `${code} ${ACCOUNTS[code]}`;

/** One balanced double-entry journal: a primary account vs a counter account. */
function makeJournal(tag) {
  let pc = pick(PRIMARY_CODES);
  let cc = pick(COUNTER_CODES);
  while (cc === pc) cc = pick(COUNTER_CODES);
  const amt = randAmt();
  // Randomly orient which side is debit (oracle + app both handle either).
  const primaryOnDebit = rnd() < 0.5;
  const debCode = primaryOnDebit ? pc : cc;
  const kreCode = primaryOnDebit ? cc : pc;
  return {
    id: `JV-PBT-${tag}`, tanggal: '2026-06-18', status: 'posted',
    akun_debit: acctStr(debCode), akun_kredit: acctStr(kreCode),
    debit: amt, kredit: amt, keterangan: 'pbt random journal',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// STRUCTURAL HELPERS (checked directly on app output — oracle-independent)
// ════════════════════════════════════════════════════════════════════════════
// Sum the contiguous run of visible leaf rows (value != null, not a total)
// immediately preceding a subtotal — i.e. that subtotal's direct children
// (including any inserted "(Belum Terpetakan)" leaf).
function precedingLeafSum(rows, idx) {
  let sum = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.value == null) break;
    if (isLrTotalLabel(r.label) || /^JUMLAH /i.test(String(r.label))) break;
    sum += r.value || 0;
  }
  return sum;
}
const findVal = (rows, re) => { const r = rows.find(x => re.test(String(x.label))); return r ? (r.value || 0) : null; };

// ════════════════════════════════════════════════════════════════════════════
// PROPERTY 1 — fix checking (primary). Validates Req 2.1–2.4.
// ════════════════════════════════════════════════════════════════════════════
function property1(base, trials) {
  console.log('\n── PROPERTY 1 — overlay delta accurate over the correct (2) baseline (Req 2.1–2.4) ──');
  let perLineChecks = 0, leafSumChecks = 0, balanceChecks = 0, arusIdentityChecks = 0, unmappedChecks = 0;

  for (let t = 0; t < trials; t++) {
    const n = 1 + Math.floor(rnd() * 4); // 1–4 journals per trial
    const journals = Array.from({ length: n }, (_, k) => makeJournal(`${t}_${k}`));
    const A = oracleAttribute(journals);

    // Render via the REAL app code path.
    const lrApp = RD.buildLabaRugiRows(base.labaRugi, journals);
    const nApp = RD.buildNeracaRows(base.neraca, journals);
    const akApp = RD.buildArusKasRows(base.arusKas, journals);
    const opsApp = LO.buildBebanOpsRows(base.bebanOps, journals);

    // (a) per-line: renderValue(L) == baseline(L) + correctlyAttributedDelta(L).
    //     Drop inserted "(Belum Terpetakan)" rows to realign 1:1 with baseline.
    const lrReal = lrApp.filter(r => !r._unmapped);
    const nReal = nApp.filter(r => !r._unmapped);
    const checkPerLine = (report, baseRows, appRows, oracleDelta) => {
      if (baseRows.length !== appRows.length) {
        fail('P1', `${report}: row count ${appRows.length} ≠ baseline ${baseRows.length}`, { trial: t });
        return;
      }
      for (let i = 0; i < baseRows.length; i++) {
        if (baseRows[i].value == null) continue;
        const appDelta = (appRows[i].value || 0) - (baseRows[i].value || 0);
        const expDelta = oracleDelta(baseRows[i].label, A);
        perLineChecks++;
        if (!approx(appDelta, expDelta)) {
          fail('P1', `${report} "${baseRows[i].label}": app Δ ${rupiah(appDelta)} ≠ oracle Δ ${rupiah(expDelta)}`,
            { trial: t, seed: SEED, journals });
        }
      }
    };
    checkPerLine('Laba Rugi', base.labaRugi, lrReal, oracleLrDelta);
    checkPerLine('Neraca', base.neraca, nReal, oracleNeracaDelta);
    checkPerLine('Arus Kas', base.arusKas, akApp, oracleArusDelta);

    // (b) every JUMLAH == Σ its visible leaves (incl. "(Belum Terpetakan)").
    const leafTargets = [
      ['Laba Rugi', lrApp, /^JUMLAH PENDAPATAN USAHA$/i],
      ['Laba Rugi', lrApp, /^JUMLAH BEBAN UMUM DAN ADMINISTRASI$/i],
      ['Laba Rugi', lrApp, /^JUM(LAH|AH) BEBAN OPERASIONAL DAN BISNIS$/i],
      ['Neraca', nApp, /^Jumlah Aset Lancar$/i],
    ];
    for (const [report, rows, re] of leafTargets) {
      const idx = rows.findIndex(r => re.test(String(r.label)));
      if (idx < 0) continue;
      leafSumChecks++;
      const total = rows[idx].value || 0;
      const leafSum = precedingLeafSum(rows, idx);
      if (!approx(total, leafSum)) {
        fail('P1', `${report} "${rows[idx].label}": JUMLAH ${rupiah(total)} ≠ Σ visible leaves ${rupiah(leafSum)}`,
          { trial: t, seed: SEED, journals });
      }
    }

    // (c) Neraca balance: JUMLAH ASET == JUMLAH KEWAJIBAN DAN EKUITAS (≤ Rp 1).
    const aset = findVal(nApp, /^JUMLAH ASET$/i);
    const ke = findVal(nApp, /JUMLAH KEWAJIBAN DAN EKUITAS/i);
    if (aset != null && ke != null) {
      balanceChecks++;
      if (!approx(aset, ke)) fail('P1', `Neraca unbalanced: Aset ${rupiah(aset)} ≠ Kewajiban+Ekuitas ${rupiah(ke)}`, { trial: t, seed: SEED, journals });
    }

    // (c2) Arus Kas identity: Kenaikan == Operasi + Investasi + Pendanaan.
    const sub = (re) => { const r = akApp.find(x => re.test(String(x.label))); return r ? (r.value || 0) : 0; };
    const kenaikan = sub(/kenaikan/i);
    // Match the activity SUBTOTAL rows (which carry "Diperoleh"/"Digunakan"),
    // never the null section-header rows ("Arus Kas dari Aktivitas …").
    const activities = sub(/Diperoleh dari\s+Aktivitas Operasi/i)
      + sub(/Digunakan untuk\s+Aktivitas Investasi/i)
      + sub(/(Diperoleh|Digunakan).*Aktivitas Pendanaan/i);
    arusIdentityChecks++;
    if (!approx(kenaikan, activities)) fail('P1', `Arus Kas identity broken: Kenaikan ${rupiah(kenaikan)} ≠ Σ activities ${rupiah(activities)}`, { trial: t, seed: SEED, journals });

    // (d) no silent drop — unmapped accounts must surface.
    //   Neraca: an unmapped current/fixed asset amount must appear as a visible
    //   "(Belum Terpetakan)" leaf.
    if (Math.abs(A.nSec.unmappedLancar) > TOL) {
      unmappedChecks++;
      const row = nApp.find(r => r._unmapped && /Aset Lancar Lainnya/i.test(r.label));
      if (!row || !approx(row.value, A.nSec.unmappedLancar)) fail('P1', `Neraca unmapped current-asset ${rupiah(A.nSec.unmappedLancar)} not surfaced`, { trial: t, seed: SEED, journals });
    }
    if (Math.abs(A.nSec.unmappedTidakLancar) > TOL) {
      unmappedChecks++;
      const row = nApp.find(r => r._unmapped && /Aset Tidak Lancar Lainnya/i.test(r.label));
      if (!row || !approx(row.value, A.nSec.unmappedTidakLancar)) fail('P1', `Neraca unmapped fixed-asset ${rupiah(A.nSec.unmappedTidakLancar)} not surfaced`, { trial: t, seed: SEED, journals });
    }
  }

  console.log(`   trials: ${trials}  (seed=0x${SEED.toString(16)})`);
  console.log(`   per-line accuracy checks: ${perLineChecks}`);
  console.log(`   JUMLAH == Σ leaves checks: ${leafSumChecks}`);
  console.log(`   Neraca balance checks: ${balanceChecks}`);
  console.log(`   Arus Kas identity checks: ${arusIdentityChecks}`);
  console.log(`   unmapped-surfaced checks: ${unmappedChecks}`);
}

// ════════════════════════════════════════════════════════════════════════════
// PROPERTY "1-LRA" — LRA Beban Operasional outline correctness + unmapped.
// (Part of Req 2.1 — the LRA leg of the primary property.)
// ════════════════════════════════════════════════════════════════════════════
function propertyLRA(base, trials) {
  console.log('\n── PROPERTY 1 (LRA) — Beban Operasional delta lands on the correct outline (Req 2.1) ──');
  // Leaf codes (NOT ending in 0) with a known, stable outline.
  const LEAF = [
    { code: '62013', name: 'Beban Pemeliharaan Mobil Truck', outline: '1.1.3' },
    { code: '62021', name: 'Beban Pemeliharaan Bangunan Pasar', outline: '1.2.1' },
    { code: '62041', name: 'Beban Sewa Lapak', outline: '2.1.1' },
    { code: '62061', name: 'Beban Honor THL', outline: '3.1.1' },
    { code: '62081', name: 'Beban Rompi Penagihan', outline: '3.3.1' },
  ];
  // Ambiguous parent (ends in 0) WITHOUT a descriptive keyword → must be unmapped
  // (never dumped on first-child outline 1.1.1).
  const PARENT = { code: '62010', name: 'Beban Pemeliharaan Kendaraan Operasional' };

  let outlineChecks = 0, unmappedChecks = 0, keywordChecks = 0;
  for (let t = 0; t < trials; t++) {
    const leaf = pick(LEAF);
    const amt = randAmt();
    const useParent = rnd() < 0.35;
    const journals = [];
    if (useParent) {
      journals.push({ id: `JV-LRA-${t}`, tanggal: '2026-06-19', status: 'posted',
        akun_debit: `${PARENT.code} ${PARENT.name}`, akun_kredit: acctStr('11103'),
        debit: amt, kredit: amt, keterangan: 'pemeliharaan rutin' }); // no resolver keyword
    } else {
      journals.push({ id: `JV-LRA-${t}`, tanggal: '2026-06-19', status: 'posted',
        akun_debit: `${leaf.code} ${leaf.name}`, akun_kredit: acctStr('11103'),
        debit: amt, kredit: amt, keterangan: 'biaya operasional' });
    }
    const built = LO.buildBebanOpsRows(base.bebanOps, journals);

    if (useParent) {
      unmappedChecks++;
      const isUnmapped = built.unmapped.some(u => u.code === PARENT.code && approx(u.amt, amt));
      const leaked = built.rows['1.1.1'] && !approx(built.rows['1.1.1'].value, base.bebanOps.find(r => r.outline === '1.1.1').bulanIni);
      if (!isUnmapped) fail('P1-LRA', `ambiguous parent ${PARENT.code} not flagged unmapped (amt ${rupiah(amt)})`, { trial: t, seed: SEED, journals });
      if (leaked) fail('P1-LRA', `ambiguous parent ${PARENT.code} leaked onto first-child outline 1.1.1`, { trial: t, seed: SEED, journals });
    } else {
      outlineChecks++;
      const baseV = base.bebanOps.find(r => r.outline === leaf.outline).bulanIni;
      const appV = built.rows[leaf.outline] ? built.rows[leaf.outline].value : null;
      if (appV == null || !approx(appV, baseV + amt)) {
        fail('P1-LRA', `${leaf.code} delta did not land on outline ${leaf.outline}: app ${rupiah(appV)} ≠ ${rupiah(baseV + amt)}`, { trial: t, seed: SEED, journals });
      }
    }
  }

  // Parent WITH a descriptive keyword routes to the correct sub-outline.
  for (const [kw, outline] of [['truck', '1.1.3'], ['parkir', '1.1.2'], ['keliling', '1.1.5']]) {
    const amt = randAmt();
    const journals = [{ id: `JV-LRA-KW-${kw}`, tanggal: '2026-06-19', status: 'posted',
      akun_debit: '62010 Beban Pemeliharaan Kendaraan Operasional', akun_kredit: acctStr('11103'),
      debit: amt, kredit: amt, keterangan: `pemeliharaan ${kw}` }];
    const built = LO.buildBebanOpsRows(base.bebanOps, journals);
    keywordChecks++;
    const baseV = base.bebanOps.find(r => r.outline === outline).bulanIni;
    const appV = built.rows[outline] ? built.rows[outline].value : null;
    if (appV == null || !approx(appV, baseV + amt)) fail('P1-LRA', `parent 62010 "${kw}" did not route to ${outline}: app ${rupiah(appV)} ≠ ${rupiah(baseV + amt)}`, { seed: SEED, journals });
  }

  console.log(`   trials: ${trials}  (seed=0x${SEED.toString(16)})`);
  console.log(`   leaf-outline checks: ${outlineChecks}`);
  console.log(`   ambiguous-parent unmapped checks: ${unmappedChecks}`);
  console.log(`   keyword-routed parent checks: ${keywordChecks}`);
}

// ════════════════════════════════════════════════════════════════════════════
// PROPERTY 4 — moved total == Σ correctly-attributed leaf deltas + sign.
// ════════════════════════════════════════════════════════════════════════════
function property4(base, trials) {
  console.log('\n── PROPERTY 4 — no double-count; sign follows the account normal balance ──');
  // Single-account scenarios with a known sign expectation.
  const CASES = [
    { code: '61012', name: 'Beban Gaji Pokok Pegawai Tetap', side: 'D', leaf: 'Beban Gaji', dir: +1 }, // expense debit → leaf up
    { code: '62013', name: 'Beban Pemeliharaan Mobil Truck', side: 'D', leaf: 'Beban Pemeliharaan Kendaraan Operasional', dir: +1 },
    { code: '41001', name: 'Pendapatan Sewa Kios', side: 'K', leaf: 'Pendapatan Bisnis Utama', dir: +1 }, // revenue credit → revenue up
    { code: '99999', name: 'Pajak Penghasilan', side: 'D', leaf: 'Beban Pajak Penghasilan', dir: +1 }, // class 9 debit-normal
  ];
  let signChecks = 0, doubleCountChecks = 0;
  for (let t = 0; t < trials; t++) {
    const c = pick(CASES);
    const amt = randAmt();
    const journal = c.side === 'D'
      ? { id: `JV-SIGN-${t}`, akun_debit: `${c.code} ${c.name}`, akun_kredit: acctStr('11103'), debit: amt, kredit: amt, status: 'posted', tanggal: '2026-06-18', keterangan: 'sign probe' }
      : { id: `JV-SIGN-${t}`, akun_debit: acctStr('11103'), akun_kredit: `${c.code} ${c.name}`, debit: amt, kredit: amt, status: 'posted', tanggal: '2026-06-18', keterangan: 'sign probe' };
    const lrApp = RD.buildLabaRugiRows(base.labaRugi, [journal]);
    const baseRow = base.labaRugi.find(r => r.label === c.leaf);
    const appRow = lrApp.find(r => r.label === c.leaf);
    if (baseRow && appRow) {
      signChecks++;
      const delta = (appRow.value || 0) - (baseRow.value || 0);
      if (Math.sign(delta) !== c.dir || !approx(Math.abs(delta), amt)) {
        fail('P4', `${c.code} leaf "${c.leaf}" sign/magnitude wrong: Δ ${rupiah(delta)} (expected ${c.dir > 0 ? '+' : '-'}${rupiah(amt)})`, { trial: t, seed: SEED, journal });
      }
    }
    // No double-count: the subtotal moves by exactly the single leaf's amount.
    // Match the TOTAL rows (JUMLAH/JUMAH …), never the null section headers.
    const subRe = /^61/.test(c.code) ? /^JUMLAH BEBAN UMUM DAN ADMINISTRASI$/i
      : /^62/.test(c.code) ? /^JUM(LAH|AH) BEBAN OPERASIONAL DAN BISNIS$/i
      : /^4/.test(c.code) ? /^JUMLAH PENDAPATAN USAHA$/i : null;
    if (subRe) {
      doubleCountChecks++;
      const bSub = base.labaRugi.find(r => subRe.test(String(r.label)));
      const aSub = lrApp.find(r => subRe.test(String(r.label)));
      if (bSub && aSub) {
        const subDelta = (aSub.value || 0) - (bSub.value || 0);
        if (!approx(Math.abs(subDelta), amt)) fail('P4', `${c.code} subtotal moved ${rupiah(subDelta)} ≠ single leaf amount ${rupiah(amt)} (double-count?)`, { trial: t, seed: SEED, journal });
      }
    }
  }
  console.log(`   trials: ${trials}  (seed=0x${SEED.toString(16)})`);
  console.log(`   sign checks: ${signChecks}`);
  console.log(`   no-double-count checks: ${doubleCountChecks}`);
}

// ════════════════════════════════════════════════════════════════════════════
// PROPERTY 2 — preservation (Req 3.1, 3.2, 3.3). Read-only QA DB.
// ════════════════════════════════════════════════════════════════════════════
function openDb() { return new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY); }
function allRows(db, sql, p = []) { return new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r)))); }
async function readPeriod(db, period) {
  const map = (rows) => rows.map(r => ({ label: r.label, value: r.value }));
  return {
    neraca: map(await allRows(db, 'SELECT label, value FROM report_neraca WHERE period=? ORDER BY sort_order', [period])),
    labaRugi: map(await allRows(db, 'SELECT label, value FROM report_laba_rugi WHERE period=? ORDER BY sort_order', [period])),
    arusKas: map(await allRows(db, 'SELECT label, value FROM report_arus_kas WHERE period=? ORDER BY sort_order', [period])),
  };
}

async function property2(db, trials) {
  console.log('\n── PROPERTY 2 — preservation: Jan–May frozen, June no-delta, overlay quiet (Req 3.1–3.3) ──');

  // 2a. Jan–May random rows unchanged vs the recorded baseline (Req 3.2).
  if (!fs.existsSync(BASELINE_JSON)) {
    console.log('   ⚠ preserve_baseline.json missing — run scripts/preserve_numeric.cjs first to record it. Skipping 2a.');
  } else {
    const recorded = JSON.parse(fs.readFileSync(BASELINE_JSON, 'utf8')).periods;
    const live = {};
    for (const p of AUDITED_PERIODS) live[p] = await readPeriod(db, p);
    const flat = [];
    for (const p of AUDITED_PERIODS)
      for (const tbl of ['neraca', 'labaRugi', 'arusKas'])
        live[p][tbl].forEach((row, i) => flat.push({ p, tbl, i, row }));
    let frozenChecks = 0;
    for (let s = 0; s < trials; s++) {
      const f = flat[Math.floor(rnd() * flat.length)];
      const rec = ((recorded[f.p] || {})[f.tbl] || [])[f.i];
      frozenChecks++;
      if (!rec || rec.label !== f.row.label || !equalValue(rec.value, f.row.value)) {
        fail('P2', `Jan–May drift ${f.p}/${f.tbl}[${f.i}] "${f.row.label}": ${rupiah(f.row.value)} vs recorded ${rec ? rupiah(rec.value) : 'MISSING'}`, { seed: SEED });
      }
    }
    console.log(`   2a Jan–May frozen-row samples: ${frozenChecks}`);
  }

  // 2b. June with NO user delta == its stored snapshot (Req 3.1, structural).
  const june = await readPeriod(db, JUNE);
  let noDeltaChecks = 0;
  const idEmpty = (report, baseRows, appRows) => {
    for (let i = 0; i < baseRows.length; i++) {
      noDeltaChecks++;
      if (!equalValue(baseRows[i].value, appRows[i].value))
        fail('P2', `June no-delta moved ${report} "${baseRows[i].label}": ${rupiah(appRows[i].value)} ≠ snapshot ${rupiah(baseRows[i].value)}`);
    }
  };
  idEmpty('Neraca', june.neraca, RD.buildNeracaRows(june.neraca, []));
  idEmpty('Laba Rugi', june.labaRugi, RD.buildLabaRugiRows(june.labaRugi, []));
  idEmpty('Arus Kas', june.arusKas, RD.buildArusKasRows(june.arusKas, []));

  // 2c. Irrelevant delta leaves DISJOINT rows untouched (Req 3.3).
  //   A delta touching only operating-expense / cash accounts must not move
  //   rows in unrelated sections (fixed assets, equity, revenue, investing).
  const MOVERS = [
    { deb: '61012 - Beban Gaji Pokok Pegawai Tetap', kre: '11103 - Bank Kalsel' },
    { deb: '62013 - Beban Pemeliharaan Mobil Truck', kre: '11103 - Bank Kalsel' },
    { deb: '61042 - Beban Materai', kre: '11104 - Bank BNI' },
  ];
  const DISJOINT = {
    neraca: ['Tanah', 'Bangunan', 'Mesin', 'Modal Disetor', 'Koreksi Ekuitas'],
    labaRugi: ['Pendapatan Bisnis Utama', 'Pendapatan Pengembangan Bisnis Lainnya', 'Beban Administrasi Bank'],
    arusKas: ['Pembelian Aset Tetap', 'Pengadaan Aset Tidak Berwujud', 'Utang Bank', 'Penyetoran Modal'],
  };
  const valOf = (rows, label) => { const r = rows.find(x => x.label === label); return r ? r.value : undefined; };
  let quietChecks = 0;
  for (let t = 0; t < trials; t++) {
    const mv = pick(MOVERS);
    const amt = randAmt();
    const delta = [{ id: `JV-QUIET-${t}`, tanggal: '2026-06-18', status: 'posted', akun_debit: mv.deb, akun_kredit: mv.kre, debit: amt, kredit: amt, keterangan: 'quiet probe' }];
    const apps = {
      neraca: RD.buildNeracaRows(june.neraca, delta),
      labaRugi: RD.buildLabaRugiRows(june.labaRugi, delta),
      arusKas: RD.buildArusKasRows(june.arusKas, delta),
    };
    for (const tbl of ['neraca', 'labaRugi', 'arusKas']) {
      for (const label of DISJOINT[tbl]) {
        const before = valOf(june[tbl], label);
        if (before === undefined) continue;
        const after = valOf(apps[tbl], label);
        quietChecks++;
        if (!equalValue(before, after)) fail('P2', `irrelevant delta moved disjoint ${tbl} "${label}": ${rupiah(before)} → ${rupiah(after)}`, { seed: SEED });
      }
    }
  }
  console.log(`   2b June no-delta identity checks: ${noDeltaChecks}`);
  console.log(`   2c overlay-quiet disjoint-row checks: ${quietChecks}`);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('═'.repeat(78));
  console.log(' PROPERTY-BASED TESTS (numeric) — fix checking + preservation checking');
  console.log(' Spec: perbaikan-laporan-juni-2026 / Task 7 (Req 2.1–2.4, 3.1–3.3)');
  console.log('═'.repeat(78));
  console.log(` DB (read-only): ${path.relative(path.join(__dirname, '..'), DB_PATH)}`);

  await loadRealModules();
  const base = explore.loadBaseline(); // correct (2) baseline, in-memory
  console.log(` Baseline from (2): Neraca=${base.neraca.length} LabaRugi=${base.labaRugi.length} ArusKas=${base.arusKas.length} BebanOps=${base.bebanOps.length}`);

  property1(base, 150);
  propertyLRA(base, 120);
  property4(base, 120);

  const db = openDb();
  try {
    await property2(db, 120);
  } finally {
    db.close();
  }

  // ── Report ──
  console.log('\n' + '─'.repeat(78));
  if (failures.length === 0) {
    console.log(' ✅ ALL PROPERTIES HOLD across every trial.');
    console.log('    • P1: renderValue == baseline + independent COA-attributed delta; JUMLAH == Σ leaves;');
    console.log('          Neraca balanced; Arus Kas identity; unmapped surfaced.');
    console.log('    • P1-LRA: Beban Operasional delta lands on the correct outline; ambiguous parents flagged.');
    console.log('    • P4: no double-count; sign follows account normal balance.');
    console.log('    • P2: Jan–May frozen; June no-delta == snapshot; irrelevant deltas leave disjoint rows quiet.');
  } else {
    const byProp = {};
    failures.forEach(f => { byProp[f.prop] = (byProp[f.prop] || 0) + 1; });
    console.log(` ❌ PROPERTY VIOLATIONS: ${failures.length}  ${JSON.stringify(byProp)}`);
    failures.slice(0, 25).forEach(f => {
      console.log(`    [${f.prop}] ${f.detail}`);
      if (f.extra && f.extra.journals) console.log(`        seed=0x${SEED.toString(16)} journals=${JSON.stringify(f.extra.journals.map(j => ({ d: j.akun_debit, k: j.akun_kredit, amt: j.debit })))}`);
      else if (f.extra && f.extra.journal) console.log(`        seed=0x${SEED.toString(16)} journal=${JSON.stringify({ d: f.extra.journal.akun_debit, k: f.extra.journal.akun_kredit, amt: f.extra.journal.debit })}`);
    });
    if (failures.length > 25) console.log(`    … and ${failures.length - 25} more`);
  }
  console.log('─'.repeat(78));
  process.exit(failures.length === 0 ? 0 : 1);
}

if (require.main === module) {
  main().catch(e => { console.error('FATAL:', e && e.stack ? e.stack : e); process.exit(2); });
}
