#!/usr/bin/env node
/* eslint-disable */
/**
 * explore_overlay_delta.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPLORATORY BUG-CONDITION TEST  —  Spec: perbaikan-laporan-juni-2026  (TASK 1)
 *
 * Property 1 (Bug Condition): "Overlay Delta Akurat di Atas Baseline yang Benar".
 *
 * ⚠️  THIS TEST IS DESIGNED TO **FAIL** ON THE CURRENT (UNFIXED) CODE.
 *     A failure here is the SUCCESS outcome for this task: it proves the
 *     delta-overlay attribution bug (root-cause class A) exists, independent of
 *     the stale-baseline bug (class B). The SAME test is re-run at task 5.5 to
 *     verify the fix makes it pass.  DO NOT fix code or weaken assertions here.
 *
 * What it does (per design.md "Testing Strategy" → "Exploratory Bug Condition"):
 *   1. Builds a CORRECT baseline by parsing the official Excel reference
 *      `src/FILES/LAMPIRAN LAPORAN KEUANGAN JUNI 2026  (2).xlsx`  (sheets:
 *      NERACA JUNI 2026, ARUS KAS JUNI 2026, LABA RUGI JUNI 2026, and the
 *      3-level `Beban Operasional ` sheet — note the trailing space).
 *      This in-memory snapshot equals what `load-audited` would write from (2),
 *      so the live QA DB is NEVER mutated (read-only access only).
 *   2. Documents the `staleBaseline` precondition (design Exploratory Case 6):
 *      the stored June snapshot in server/perumda_ledger.qa.db matches the
 *      INTERIM file, differs materially from (2), and has no
 *      ANG-bebanOperasional-* row for month 6 (isDynamic==true). This is only a
 *      precondition — the MAIN assertions below are about the delta overlay.
 *   3. Injects JV- journals dated 17–20 June 2026 (the 5 design anchor cases).
 *   4. Renders the four reports two ways:
 *        • APP path  — a faithful mirror of the real attribution logic in
 *          src/pages/Laporan.jsx (applyNeracaDelta / applyLabaRugiDelta / Arus
 *          Kas cashDeltaLR) and src/pages/LRA.jsx (resolveOutline delta), using
 *          src/utils/reportDelta.js + src/utils/lraOutline.js semantics.
 *          (The React/ESM render path can't run in a .cjs harness, so the pure
 *           attribution logic is copied verbatim with source citations.)
 *        • EXPECTED path — `baseline(L) + correctlyAttributedDelta(L)` computed
 *          INDEPENDENTLY: delta attributed via stable COA account code (NOT a
 *          lowercased name), sign per the account's normal balance, correct LRA
 *          outline, parent totals propagated exactly once.
 *   5. Asserts, for every line/total L across the four reports:
 *        ABS(app(L) − expected(L)) ≤ 1, AND total == Σ leaves (no double-count),
 *        AND Neraca balanced (Jumlah Aset == Jumlah Kewajiban + Ekuitas),
 *        AND no journal silently dropped (unmapped flagged, not vanished).
 *   6. Adds a randomized generalization layer (property over random journals).
 *
 * Run (UNFIXED code):
 *   DB_PATH=server/perumda_ledger.qa.db node scripts/explore_overlay_delta.cjs
 *
 * Exit code: 1 when the bug is confirmed (assertions fail → EXPECTED here),
 *            0 only if everything unexpectedly matches (would mean the test
 *            does not detect the bug).
 */

const path = require('path');
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const reportImport = require('./import_report_data.cjs'); // parseNeraca/parseLabaRugi/parseArusKas

// ── Config ──────────────────────────────────────────────────────────────────
const TOL = 1; // Rp 1 rounding tolerance (per Expected Behavior 2.1–2.4)
const REF2_FILE = path.join(__dirname, '..', 'src', 'FILES', 'LAMPIRAN LAPORAN KEUANGAN JUNI 2026  (2).xlsx');
const INTERIM_FILE = path.join(__dirname, '..', 'src', 'Mei Data', 'june data', 'LAMPIRAN LAPORAN KEUANGAN JUNI 2026 .xlsx');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'perumda_ledger.qa.db');
const SHEETS = {
  neraca: 'NERACA JUNI 2026',
  arusKas: 'ARUS KAS JUNI 2026',
  labaRugi: 'LABA RUGI JUNI 2026',
  bebanOps: 'Beban Operasional ', // trailing space is intentional
};

// ── Small helpers ─────────────────────────────────────────────────────────
const rupiah = (n) => (n == null ? '—' : (Math.round(Number(n) * 100) / 100).toLocaleString('id-ID'));
const codeOf = (acctStr) => String(acctStr || '').trim().split(/\s+/)[0]; // leading COA code
const approx = (a, b) => Math.abs((a || 0) - (b || 0)) <= TOL;

// 3-level Beban Operasional parser — verbatim port of parseBebanOperasional in
// src/utils/reportSnapshot.js (group col2 / sub col3 / rincian col4; name col5;
// anggaran col7, target col8, sd_bln_lalu col9, bulan_ini col10, realisasi col11).
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
      anggaran: Number(r[7]) || 0, target: Number(r[8]) || 0,
      sdBlnLalu: Number(r[9]) || 0, bulanIni: Number(r[10]) || 0,
      realisasi: Number(r[11]) || 0, persen: Number(r[12]) || 0,
    });
  }
  return rows;
}

// ── Baseline (correct) snapshot from Excel (2) ────────────────────────────
function loadBaseline() {
  const wb = XLSX.readFile(REF2_FILE);
  return {
    neraca: reportImport.parseNeraca(wb.Sheets[SHEETS.neraca]),         // [{order,label,value,depth}]
    labaRugi: reportImport.parseLabaRugi(wb.Sheets[SHEETS.labaRugi], 9),
    arusKas: reportImport.parseArusKas(wb.Sheets[SHEETS.arusKas], 2),   // [{order,label,value,isSection}]
    bebanOps: parseBebanOperasional(wb.Sheets[SHEETS.bebanOps]),        // [{outline,nama,bulanIni,...}]
  };
}

// ── staleBaseline evidence (read-only; precondition only) ─────────────────
function documentStaleBaseline() {
  return new Promise((resolve) => {
    const out = { checked: false, notes: [] };
    let db;
    try { db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY); }
    catch (e) { out.notes.push('QA DB not readable: ' + e.message); return resolve(out); }
    const all = (sql, p = []) => new Promise((res) => db.all(sql, p, (e, r) => res(e ? [] : r)));
    (async () => {
      out.checked = true;
      const wb2 = XLSX.readFile(REF2_FILE);
      const wbI = XLSX.readFile(INTERIM_FILE);
      const lr2 = reportImport.parseLabaRugi(wb2.Sheets[SHEETS.labaRugi], 9)
        .find(r => /JUMLAH BEBAN UMUM DAN ADMIN/i.test(r.label));
      const lrI = reportImport.parseLabaRugi(wbI.Sheets[SHEETS.labaRugi], 9)
        .find(r => /JUMLAH BEBAN UMUM DAN ADMIN/i.test(r.label));
      const lrDb = await all("SELECT value FROM report_laba_rugi WHERE period='2026-06' AND label LIKE '%JUMLAH BEBAN UMUM DAN ADMIN%'");
      const dbVal = lrDb[0] && lrDb[0].value;
      out.notes.push(`Laba Rugi "JUMLAH BEBAN UMUM…": DB=${rupiah(dbVal)}  interim=${rupiah(lrI && lrI.value)}  (2)=${rupiah(lr2 && lr2.value)}`);
      out.snapshotMatchesInterim = approx(dbVal, lrI && lrI.value);
      out.snapshotDiffersFrom2 = !approx(dbVal, lr2 && lr2.value);

      const ops6 = await all("SELECT COUNT(*) c FROM anggaran WHERE bulan=6 AND kategori='bebanOperasional'");
      out.noBebanOpsAnggaran = (ops6[0] ? ops6[0].c : 0) === 0;
      out.notes.push(`anggaran ANG-bebanOperasional-* (bulan 6): ${ops6[0] ? ops6[0].c : 0} rows → isDynamic==${out.noBebanOpsAnggaran}`);
      db.close();
      resolve(out);
    })().catch((e) => { out.notes.push('error: ' + e.message); try { db.close(); } catch (_) {} resolve(out); });
  });
}

module.exports = { loadBaseline, parseBebanOperasional, codeOf, approx, TOL };


// ════════════════════════════════════════════════════════════════════════════
// COA ACCOUNT MODEL  (the independent oracle attributes by STABLE CODE)
// ════════════════════════════════════════════════════════════════════════════
// Normal balance per account class — used to give the delta the correct SIGN.
// Mirrors the intent of the would-be `isDebitNormal(code)` helper (design Fix 1.2)
// and fixes the gap the current code has for class 9 (pajak penghasilan), which
// src/utils/reportDelta.js mis-signs because it only tests /^[1568]/ vs /^[2347]/.
function isDebitNormal(code) {
  const c = String(code || '');
  if (/^1/.test(c)) return true;   // Aset (debit-normal)
  if (/^[23]/.test(c)) return false; // Kewajiban / Ekuitas (credit-normal)
  if (/^[47]/.test(c)) return false; // Pendapatan (credit-normal)
  if (/^[5689]/.test(c)) return true; // HPP / Beban / Beban non-ops / Pajak penghasilan (debit-normal)
  return true;
}

// Which Neraca SECTION an account belongs to (by code) — the oracle uses this to
// place a current-asset delta into "Jumlah Aset Lancar" (not "…Tidak Lancar").
function neracaSection(code) {
  const c = String(code || '');
  if (/^11/.test(c)) return 'asetLancar';      // kas/bank/piutang/persediaan/dibayar dimuka
  if (/^1[23]/.test(c)) return 'asetTidakLancar'; // aset tetap / aset lain
  if (/^2/.test(c)) return 'kewajiban';
  if (/^3/.test(c)) return 'ekuitas';
  return 'laba'; // 4/5/6/7/8/9 → flows to "(Laba) Rugi Periode Berjalan"
}

// Which Arus Kas ACTIVITY the cash counter-account belongs to (oracle).
function arusKasActivity(counterCode) {
  const c = String(counterCode || '');
  if (/^1[23]/.test(c)) return 'investasi';      // fixed/intangible asset
  if (/^22/.test(c) || /^3/.test(c)) return 'pendanaan'; // utang bank / modal
  return 'operasi'; // expenses, revenue, receivables, tax, payables → operating
}

// Stable COA-code → exact Excel report-line label (the oracle's "alias-by-code"
// map; design Fix 1.1). These are the GROUP-level lines the Laba Rugi / Neraca
// collapse multiple COA leaves into.
const LR_LINE_BY_CODE = {
  '41': 'Pendapatan Bisnis Utama',
  '42': 'Pendapatan Pengembangan Bisnis Lainnya',
  '61010': 'Beban Gaji',
  '62010': 'Beban Pemeliharaan Kendaraan Operasional',
  '99999': 'Beban Pajak Penghasilan',
};
const NERACA_LINE_BY_CODE = {
  '11103': 'Kas Bank Kalsel',
  '11104': 'Bank BNI',
  // 11203 "Piutang Lain-lain" intentionally has NO Neraca line → unmapped leaf.
};
function lrLineForCode(code) {
  const c = String(code || '');
  if (LR_LINE_BY_CODE[c]) return LR_LINE_BY_CODE[c];          // exact (e.g. 99999)
  const group = c.length >= 5 ? c.slice(0, 4) + '0' : c;       // child → sub-group (62013→62010, 61012→61010)
  if (LR_LINE_BY_CODE[group]) return LR_LINE_BY_CODE[group];
  if (LR_LINE_BY_CODE[c.slice(0, 2)]) return LR_LINE_BY_CODE[c.slice(0, 2)]; // class (41/42)
  return null; // unmapped
}

// ════════════════════════════════════════════════════════════════════════════
// THE INJECTED JV- JOURNALS  (17–20 June 2026) — the 5 design anchor cases.
// Account strings use the live COA names so the APP path's name/alias matching
// behaves exactly as in production.
// ════════════════════════════════════════════════════════════════════════════
const JOURNALS = [
  // Anchor 1 — Laba Rugi leaf vs total: 61012's name ≠ Excel leaf "Beban Gaji",
  // not in lrAlias.json → app moves the 61-bucket TOTAL but the leaf stays static.
  { id: 'JV-2026-0617A', tanggal: '2026-06-17', status: 'posted',
    akun_debit: '61012 Beban Gaji Pokok Pegawai Tetap', akun_kredit: '11103 Bank Kalsel - 3204661684',
    debit: 10000000, kredit: 10000000, keterangan: 'Pembayaran gaji pegawai tetap Juni', anchor: 1 },

  // Anchor 2 — Neraca subtotal misclassification: 11203 (current asset) has no
  // matching Neraca leaf/alias → app leaves "Jumlah Aset Lancar" flat and dumps
  // the delta into "Jumlah Aset Tidak Lancar"/grand total. Funded by revenue
  // (41005) so the asset rises without a cash offset.
  { id: 'JV-2026-0618B', tanggal: '2026-06-18', status: 'posted',
    akun_debit: '11203 Piutang Lain-lain', akun_kredit: '41005 Pendapatan Pengelolaan Lain-lain',
    debit: 5000000, kredit: 5000000, keterangan: 'Piutang lain-lain atas pendapatan pengelolaan', anchor: 2 },

  // Anchor 3 — LRA outline fallback: 62010 is a PARENT account and the keterangan
  // has no keyword → resolveOperasionalOutline returns null and resolveOutline
  // falls back to ACCOUNT_TO_OUTLINE['62010']='1.1.1' (the first child leaf).
  { id: 'JV-2026-0619C', tanggal: '2026-06-19', status: 'posted',
    akun_debit: '62010 Beban Pemeliharaan Kendaraan Operasional', akun_kredit: '11103 Bank Kalsel - 3204661684',
    debit: 8000000, kredit: 8000000, keterangan: 'Pemeliharaan kendaraan operasional rutin', anchor: 3 },

  // Anchor 4 — Arus Kas not classified: operational expense paid in cash. App
  // adds cashDeltaLR only to "Kenaikan/Akhir Periode"; the Operasi activity
  // subtotal never moves. (62013 maps correctly to LRA 1.1.3 — shows the test
  // does NOT false-positive on correctly-attributed lines.)
  { id: 'JV-2026-0619D', tanggal: '2026-06-19', status: 'posted',
    akun_debit: '62013 Beban Pemeliharaan Mobil Truck', akun_kredit: '11103 Bank Kalsel - 3204661684',
    debit: 9000000, kredit: 9000000, keterangan: 'Servis mobil truck operasional', anchor: 4 },

  // Anchor 5 — unmapped / silent drop + wrong sign: 99999 (Beban Pajak
  // Penghasilan, class 9) is captured by NO Laba Rugi bucket and matches no
  // leaf/alias → it vanishes from Laba Rugi with no "unmapped" indicator, and
  // because reportDelta only signs /^[1568]/ vs /^[2347]/, class 9 is mis-signed
  // in Neraca → the balance sheet goes UNBALANCED.
  { id: 'JV-2026-0620E', tanggal: '2026-06-20', status: 'posted',
    akun_debit: '99999 Pajak Penghasilan', akun_kredit: '11103 Bank Kalsel - 3204661684',
    debit: 12000000, kredit: 12000000, keterangan: 'Setoran PPh badan Juni', anchor: 5 },
];


// ════════════════════════════════════════════════════════════════════════════
// APP PATH (FIXED)  —  the REAL production attribution logic, imported.
// The previously-copied buggy mirror has been removed; these thin wrappers call
// the SAME pure functions the React app uses (src/utils/reportDelta.js and
// src/utils/lraOutline.js), loaded via dynamic import() in main(). The repo is
// ESM, so the .cjs harness imports them asynchronously (same pattern as
// tests/preserve_layout_export.spec.cjs).
// ════════════════════════════════════════════════════════════════════════════
let RD = null; // src/utils/reportDelta.js  (Neraca / Laba Rugi / Arus Kas attribution)
let LO = null; // src/utils/lraOutline.js   (LRA Beban Operasional outline attribution)

async function loadRealModules() {
  RD = await import('../src/utils/reportDelta.js');
  LO = await import('../src/utils/lraOutline.js');
}

// Laba Rugi / Neraca / Arus Kas: real overlay builders (Laporan.jsx consumes these).
function buildLR_AppRows(baseLR, delta) { return RD.buildLabaRugiRows(baseLR, delta); }
function buildNeraca_AppRows(baseN, delta) { return RD.buildNeracaRows(baseN, delta); }
function buildArusKas_AppRows(baseAK, delta) { return RD.buildArusKasRows(baseAK, delta); }

// ── src/utils/lraOutline.js : ACCOUNT_TO_OUTLINE + resolveOperasionalOutline.
//    These are still declared here because the independent ORACLE (below) uses
//    them as part of its COA model — they are NOT the buggy app path. The real
//    LRA delta attribution is exercised through LO.buildBebanOpsRows. ──
const ACC_OUTLINE = {
  '62011': '1.1.1', '62012': '1.1.2', '62013': '1.1.3', '62014': '1.1.4', '62015': '1.1.5', '62016': '1.1.6',
  '62010': '1.1.1', '62020': '1.2.1', '62030': '1.3.1', '62040': '2.1.1', '62050': '2.2.1',
  '62060': '3.1.1', '62070': '3.2.1', '62080': '3.3.1', '62090': '3.4.1',
};
function resolveOperasionalOutline(code, keterangan = '') {
  const c = String(code); const desc = String(keterangan).toLowerCase();
  if (c === '62010') {
    if (desc.includes('pajak')) return '1.1.1';
    if (desc.includes('parkir')) return '1.1.2';
    if (desc.includes('truck') || desc.includes('truk')) return '1.1.3';
    if (desc.includes('pickup') || desc.includes('pick up') || desc.includes('bak')) return '1.1.4';
    if (desc.includes('keliling')) return '1.1.5';
    if (desc.includes('tossa') || desc.includes('roda 3') || desc.includes('motor')) return '1.1.6';
    return null;
  }
  return null; // other parents return null too (only 62010 relevant to anchors)
}

// LRA Beban Operasional app render at outline granularity — REAL function.
function buildLRAOps_AppRows(baseOps, delta) { return LO.buildBebanOpsRows(baseOps, delta); }


// ════════════════════════════════════════════════════════════════════════════
// EXPECTED PATH (ORACLE)  —  baseline + correctlyAttributedDelta, computed
// INDEPENDENTLY by stable COA code + normal-balance sign + correct LRA outline.
// ════════════════════════════════════════════════════════════════════════════
// Process both legs of every journal into natural-direction movements.
function attributeCorrectly(journals) {
  const lrLeaf = {}, nLeaf = {};
  const lrSec = { pendUsaha: 0, bpp: 0, admin: 0, ops: 0, pendLain: 0, bebanNonOps: 0, pajak: 0 };
  const nSec = { asetLancar: 0, asetTidakLancar: 0, kewajiban: 0, ekuitasDirect: 0, pl: 0 };
  const ak = { operasi: 0, investasi: 0, pendanaan: 0, cash: 0 };
  const opsLeaf = {}; const opsUnmapped = [];
  let nUnmappedLancar = 0, nUnmappedTidakLancar = 0;
  const add = (m, k, v) => { if (k) m[k] = (m[k] || 0) + v; };

  const legs = [];
  for (const j of journals) {
    if (j.debit) legs.push({ j, code: codeOf(j.akun_debit), amt: j.debit, side: 'D' });
    if (j.kredit) legs.push({ j, code: codeOf(j.akun_kredit), amt: j.kredit, side: 'K' });
  }

  for (const leg of legs) {
    const c = leg.code;
    // natural-direction movement of THIS account
    const natural = (leg.side === 'D' ? (isDebitNormal(c) ? +1 : -1) : (isDebitNormal(c) ? -1 : +1)) * leg.amt;
    const cls = c[0];

    // — Laba Rugi (P/L classes 4,5,6,7,8,9) —
    if (/^4/.test(c)) { lrSec.pendUsaha += natural; add(lrLeaf, lrLineForCode(c), natural); }
    else if (/^51/.test(c)) { lrSec.bpp += natural; }
    else if (/^61/.test(c)) { lrSec.admin += natural; add(lrLeaf, lrLineForCode(c), natural); }
    else if (/^62/.test(c)) { lrSec.ops += natural; add(lrLeaf, lrLineForCode(c), natural); }
    else if (/^7/.test(c)) { lrSec.pendLain += natural; }
    else if (/^8/.test(c)) { lrSec.bebanNonOps += natural; }
    else if (/^9/.test(c)) { lrSec.pajak += natural; add(lrLeaf, lrLineForCode(c), natural); }

    // — Neraca —
    const sec = neracaSection(c);
    if (sec === 'asetLancar') { nSec.asetLancar += natural; const lbl = NERACA_LINE_BY_CODE[c]; if (lbl) add(nLeaf, lbl, natural); else nUnmappedLancar += natural; }
    else if (sec === 'asetTidakLancar') { nSec.asetTidakLancar += natural; const lbl = NERACA_LINE_BY_CODE[c]; if (lbl) add(nLeaf, lbl, natural); else nUnmappedTidakLancar += natural; }
    else if (sec === 'kewajiban') { nSec.kewajiban += natural; }
    else if (sec === 'ekuitas') { nSec.ekuitasDirect += natural; }
    else { // P/L → "(Laba) Rugi Periode Berjalan" (revenue raises profit, expense lowers it)
      nSec.pl += (/^[47]/.test(c) ? natural : -natural);
    }

    // — Arus Kas: cash legs are classified by NON-cash legs of the SAME journal
    //   (grouped pass after this loop — see below). expandJournals splits multi-
    //   line journals into one-sided legs, so a cash half no longer carries its
    //   counter account; grouping by the originating journal restores it. —

    // — LRA Beban Operasional (62xx debit only) —
    if (leg.side === 'D' && /^62/.test(c)) {
      const isParent = /0$/.test(c); // 62010,62020,… parents end in 0
      const op = resolveOperasionalOutline(c, leg.j.keterangan);
      if (op) add(opsLeaf, op, leg.amt);
      else if (!isParent && ACC_OUTLINE[c]) add(opsLeaf, ACC_OUTLINE[c], leg.amt); // genuine leaf code
      else opsUnmapped.push({ code: c, amt: leg.amt, keterangan: leg.j.keterangan }); // ambiguous parent → flagged, NOT dumped on first child
    }
  }

  // — Arus Kas: net each journal's cash legs, attribute by its NON-cash legs —
  // (journal-grouped; same independent rule as src/utils/reportDelta.js). Single-
  // line journals group to one key + one non-cash leg → identical to classifying
  // by the counter account. Net cash total is unchanged; only the split changes.
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
    for (const l of grp) { if (/^111/.test(l.code)) continue; weight[arusKasActivity(l.code)] += l.amt; totalW += l.amt; }
    if (totalW <= 0) { ak.operasi += netCash; continue; } // unpaired cash leg → operasi fallback
    const touched = AK_ORDER.filter(a => weight[a] > 0);
    let assigned = 0;
    touched.forEach((a, i) => { const share = (i === touched.length - 1) ? (netCash - assigned) : (netCash * weight[a] / totalW); assigned += share; ak[a] += share; });
  }
  return { lrLeaf, nLeaf, lrSec, nSec, ak, opsLeaf, opsUnmapped, nUnmappedLancar, nUnmappedTidakLancar };
}

function buildLR_ExpectedRows(baseLR, A) {
  const s = A.lrSec;
  const pendUsaha = s.pendUsaha, bpp = s.bpp, admin = s.admin, ops = s.ops;
  const pendLain = s.pendLain, bebanNonOps = s.bebanNonOps, pajak = s.pajak;
  const bruto = pendUsaha - bpp;
  const bebanUsaha = admin + ops;
  const labaUsaha = bruto - bebanUsaha;
  const netLainLain = pendLain - bebanNonOps;
  const sebelumPajak = labaUsaha + netLainLain;
  const setelahPajak = sebelumPajak - pajak;
  const ebitda = sebelumPajak; // excludes tax (and no interest/depreciation journals here)
  const totalMap = [
    ['JUMLAH PENDAPATAN USAHA', pendUsaha], ['JUMLAH BEBAN POKOK PENJUALAN', bpp],
    ['LABA (RUGI) BRUTO', bruto], ['JUMLAH BEBAN UMUM DAN ADMINISTRASI', admin],
    ['BEBAN OPERASIONAL DAN BISNIS', ops], ['BEBAN USAHA', bebanUsaha],
    ['LABA (RUGI) USAHA', labaUsaha], ['JUMLAH PENDAPATAN LAIN-LAIN', pendLain],
    ['BEBAN NON OPERASIONAL', bebanNonOps], ['JUMLAH PENDAPATAN DAN (BEBAN LAIN-LAIN)', netLainLain],
    ['BERSIH SEBELUM PAJAK', sebelumPajak], ['BERSIH SETELAH PAJAK', setelahPajak], ['EBITDA', ebitda],
  ];
  return baseLR.map(r => {
    const out = { ...r };
    const upper = String(r.label || '').toUpperCase();
    const isTotal = upper.includes('JUMLAH') || upper.includes('JUMAH') || upper.startsWith('LABA') || upper.startsWith('EBITDA');
    if (isTotal) { const hit = totalMap.find(([kw]) => upper.includes(kw)); if (hit) out.value = (out.value || 0) + hit[1]; return out; }
    if (r.value == null) return out;
    if (A.lrLeaf[r.label] != null) out.value += A.lrLeaf[r.label]; // tax leaf "Beban Pajak Penghasilan" included
    return out;
  });
}

function buildNeraca_ExpectedRows(baseN, A) {
  const lancar = A.nSec.asetLancar, tidakLancar = A.nSec.asetTidakLancar;
  const aset = lancar + tidakLancar, kewajiban = A.nSec.kewajiban;
  const ekuitas = A.nSec.ekuitasDirect + A.nSec.pl;
  const unmappedLancar = A.nUnmappedLancar || 0;
  const unmappedTidakLancar = A.nUnmappedTidakLancar || 0;
  let lastLeafDepth = 0;
  const out = [];
  for (const r of baseN) {
    const row = { ...r };
    const label = String(r.label || ''); const upper = label.toUpperCase();
    if (r.value == null) { out.push(row); continue; }
    if (/jumlah aset lancar/i.test(label)) {
      // Unmapped current-asset amount surfaces as a visible "(Belum Terpetakan)"
      // leaf so the subtotal equals the sum of its visible leaves (and the grand
      // total/balance — which already include this amount — are unchanged).
      if (unmappedLancar) out.push({ ...r, label: 'Aset Lancar Lainnya (Belum Terpetakan)', value: unmappedLancar, depth: lastLeafDepth, _unmapped: true });
      row.value += lancar; out.push(row); continue;
    }
    if (/jumlah aset tidak lancar/i.test(label)) {
      if (unmappedTidakLancar) out.push({ ...r, label: 'Aset Tidak Lancar Lainnya (Belum Terpetakan)', value: unmappedTidakLancar, depth: lastLeafDepth, _unmapped: true });
      row.value += tidakLancar; out.push(row); continue;
    }
    if (upper.startsWith('JUMLAH ')) {
      if (upper.includes('KEWAJIBAN DAN')) row.value += kewajiban + ekuitas;
      else if (upper.includes('ASET')) row.value += aset;
      else if (upper.includes('KEWAJIBAN')) row.value += kewajiban;
      else if (upper.includes('EKUITAS')) row.value += ekuitas;
      out.push(row); continue;
    }
    if (/berjalan/i.test(label)) { row.value += A.nSec.pl; lastLeafDepth = row.depth || 0; out.push(row); continue; }
    if (A.nLeaf[label] != null) row.value += A.nLeaf[label];
    lastLeafDepth = row.depth || 0;
    out.push(row);
  }
  return out;
}

function buildArusKas_ExpectedRows(baseAK, A) {
  const operasi = A.ak.operasi, investasi = A.ak.investasi, pendanaan = A.ak.pendanaan, cash = A.ak.cash;
  return baseAK.map(r => {
    const out = { ...r };
    const l = String(r.label || '');
    if (/Diperoleh dari\s+Aktivitas Operasi/i.test(l)) out.value = (out.value || 0) + operasi;
    else if (/Digunakan untuk\s+Aktivitas Investasi/i.test(l)) out.value = (out.value || 0) + investasi;
    else if (/Aktivitas Pendanaan/i.test(l) && /Diperoleh|Digunakan/i.test(l)) out.value = (out.value || 0) + pendanaan;
    else if (/kenaikan|akhir periode/i.test(l)) out.value = (out.value || 0) + cash;
    return out;
  });
}


// ════════════════════════════════════════════════════════════════════════════
// ASSERTION ENGINE
// ════════════════════════════════════════════════════════════════════════════
const isTotalLabel = (label) => {
  const u = String(label || '').toUpperCase();
  return u.includes('JUMLAH') || u.includes('JUMAH') || u.startsWith('LABA') || u.startsWith('EBITDA') || u.includes('NILAI BUKU');
};

// Sum the contiguous run of leaf rows (value != null, not a total) immediately
// preceding a subtotal row — i.e. that subtotal's direct children.
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

const failures = [];
const record = (report, line, appV, expV, cause, anchor) =>
  failures.push({ report, line, appV, expV, diff: (appV || 0) - (expV || 0), cause, anchor });

function compareRows(report, appRows, expRows, anchorHint) {
  for (let i = 0; i < appRows.length; i++) {
    const a = appRows[i], e = expRows[i];
    if (a.value == null && e.value == null) continue;
    if (!approx(a.value, e.value)) record(report, a.label, a.value, e.value, 'app(L) ≠ baseline(L)+correctDelta(L)', anchorHint(a.label));
  }
}

function main() {
  console.log('═'.repeat(78));
  console.log(' EXPLORATORY BUG-CONDITION TEST — overlay delta over a CORRECT baseline');
  console.log(' Spec: perbaikan-laporan-juni-2026 / Task 1 / Property 1');
  console.log(' EXPECTATION: this test FAILS on unfixed code (failure = bug confirmed).');
  console.log('═'.repeat(78));

  const base = loadBaseline();
  console.log(`\nBaseline parsed from (2): Neraca=${base.neraca.length} LabaRugi=${base.labaRugi.length} ArusKas=${base.arusKas.length} BebanOps=${base.bebanOps.length} rows`);

  return Promise.all([loadRealModules(), documentStaleBaseline()]).then(([, stale]) => {
    console.log('\n── Precondition: staleBaseline (design Exploratory Case 6) ──');
    if (stale.checked) {
      stale.notes.forEach(n => console.log('   ' + n));
      console.log(`   → snapshot matches INTERIM: ${stale.snapshotMatchesInterim}; differs from (2): ${stale.snapshotDiffersFrom2}; no bebanOperasional anggaran: ${stale.noBebanOpsAnggaran}`);
      console.log('   (Documented only — the MAIN assertions below run on the CORRECT (2) baseline.)');
    } else {
      console.log('   (QA DB not available — precondition skipped; main assertions still run on (2).)');
    }

    // ── Render APP vs EXPECTED on the CORRECT (2) baseline + injected JV- journals ──
    const delta = JOURNALS; // single-line journals pass through expandJournals untouched
    const A = attributeCorrectly(JOURNALS);

    const lrApp = buildLR_AppRows(base.labaRugi, delta);
    const lrExp = buildLR_ExpectedRows(base.labaRugi, A);
    const nApp = buildNeraca_AppRows(base.neraca, delta);
    const nExp = buildNeraca_ExpectedRows(base.neraca, A);
    const akApp = buildArusKas_AppRows(base.arusKas, delta);
    const akExp = buildArusKas_ExpectedRows(base.arusKas, A);
    const opsApp = buildLRAOps_AppRows(base.bebanOps, delta);

    const anchorFor = (label) => {
      const l = String(label || '').toLowerCase();
      if (/beban gaji$|pendapatan bisnis utama|pemeliharaan kendaraan operasional/.test(l)) return 1;
      if (/aset lancar|aset tidak lancar/.test(l)) return 2;
      if (/setelah pajak|pajak penghasilan/.test(l)) return 5;
      if (/berjalan|jumlah ekuitas|jumlah kewajiban dan ekuitas|jumlah aset$/.test(l)) return 5;
      if (/aktivitas operasi|aktivitas investasi|aktivitas pendanaan|kenaikan|akhir periode/.test(l)) return 4;
      return 0;
    };

    // (a) per-line accuracy across the three Excel-shaped reports
    compareRows('Laba Rugi', lrApp, lrExp, anchorFor);
    compareRows('Neraca', nApp, nExp, anchorFor);
    compareRows('Arus Kas', akApp, akExp, anchorFor);

    // (a) LRA Beban Operasional at outline granularity
    for (const r of base.bebanOps) {
      const appV = opsApp.rows[r.outline] ? opsApp.rows[r.outline].value : r.bulanIni;
      const expV = r.bulanIni + (A.opsLeaf[r.outline] || 0);
      if (!approx(appV, expV)) record('LRA Beban Ops', `${r.outline} ${r.nama}`, appV, expV, 'delta on wrong outline (parent→first-child 1.1.1 fallback)', 3);
    }

    // (b) consistency: subtotal must equal Σ of its direct leaf rows (no double-count / no leak)
    const consistencyTargets = [
      ['Laba Rugi', lrApp, 'JUMLAH PENDAPATAN USAHA'],
      ['Laba Rugi', lrApp, 'JUMLAH BEBAN UMUM DAN ADMINISTRASI'],
      ['Laba Rugi', lrApp, 'JUMAH BEBAN OPERASIONAL DAN BISNIS'],
      ['Neraca', nApp, 'Jumlah Aset Lancar'],
    ];
    for (const [report, rows, label] of consistencyTargets) {
      const idx = rows.findIndex(r => String(r.label).toUpperCase() === label.toUpperCase()
        || String(r.label).toUpperCase().includes(label.toUpperCase()));
      if (idx < 0) continue;
      const total = rows[idx].value || 0;
      const leafSum = precedingLeafSum(rows, idx);
      if (!approx(total, leafSum)) {
        failures.push({ report, line: `${label} [total == Σ leaves]`, appV: total, expV: leafSum,
          diff: total - leafSum, cause: 'total moved but detail leaves did not (total ≠ Σ leaves)',
          anchor: report === 'Neraca' ? 2 : 1 });
      }
    }

    // (c) Neraca balance: Jumlah Aset must equal Jumlah Kewajiban dan Ekuitas
    const find = (rows, re) => { const r = rows.find(x => re.test(String(x.label))); return r ? (r.value || 0) : null; };
    const appAset = find(nApp, /^JUMLAH ASET$/i);
    const appKE = find(nApp, /JUMLAH KEWAJIBAN DAN EKUITAS/i);
    if (appAset != null && appKE != null && !approx(appAset, appKE)) {
      failures.push({ report: 'Neraca', line: 'BALANCE: Jumlah Aset == Kewajiban+Ekuitas', appV: appAset, expV: appKE,
        diff: appAset - appKE, cause: 'class-9 (pajak) delta mis-signed/uncaptured → balance sheet unbalanced', anchor: 5 });
    }

    // (c2) Arus Kas internal identity: Kenaikan == Operasi + Investasi + Pendanaan
    const akSub = (re) => { const r = akApp.find(x => re.test(String(x.label))); return r ? (r.value || 0) : 0; };
    const akKenaikan = akSub(/kenaikan/i);
    const akActivitiesSum = akSub(/Diperoleh dari\s+Aktivitas Operasi/i) + akSub(/Digunakan untuk\s+Aktivitas Investasi/i) + akSub(/Aktivitas Pendanaan/i);
    if (!approx(akKenaikan, akActivitiesSum)) {
      failures.push({ report: 'Arus Kas', line: 'Kenaikan == Σ(Operasi+Investasi+Pendanaan)', appV: akKenaikan, expV: akActivitiesSum,
        diff: akKenaikan - akActivitiesSum, cause: 'bottom line moved but activity sections did not (cashDeltaLR only on Kenaikan/Akhir)', anchor: 4 });
    }

    // Oracle self-validation (must hold by construction; not a bug counter — guards 5.5 reuse)
    const oracleWarnings = [];
    const expAset = find(nExp, /^JUMLAH ASET$/i);
    const expKE = find(nExp, /JUMLAH KEWAJIBAN DAN EKUITAS/i);
    if (expAset != null && expKE != null && !approx(expAset, expKE)) oracleWarnings.push(`EXPECTED Neraca does not balance (${rupiah(expAset)} vs ${rupiah(expKE)})`);
    const lrCheck = (label) => {
      const idx = lrExp.findIndex(r => String(r.label).toUpperCase().includes(label));
      if (idx < 0) return;
      const t = lrExp[idx].value || 0, s = precedingLeafSum(lrExp, idx);
      if (!approx(t, s)) oracleWarnings.push(`EXPECTED "${lrExp[idx].label}" total ${rupiah(t)} ≠ Σ leaves ${rupiah(s)}`);
    };
    lrCheck('JUMLAH PENDAPATAN USAHA'); lrCheck('JUMLAH BEBAN UMUM DAN ADMINISTRASI'); lrCheck('JUMAH BEBAN OPERASIONAL DAN BISNIS');
    // EXPECTED Neraca "Jumlah Aset Lancar" must also equal Σ of its visible leaves
    // (including the modelled "(Belum Terpetakan)" leaf) — internal consistency.
    const nExpIdx = nExp.findIndex(r => /jumlah aset lancar/i.test(String(r.label)));
    if (nExpIdx >= 0) {
      const t = nExp[nExpIdx].value || 0, s = precedingLeafSum(nExp, nExpIdx);
      if (!approx(t, s)) oracleWarnings.push(`EXPECTED "${nExp[nExpIdx].label}" total ${rupiah(t)} ≠ Σ leaves ${rupiah(s)}`);
    }

    // (d) no silent drop: every injected journal's main leg must surface somewhere
    const silentDrops = [];
    // Anchor 5: tax (99999) must move Laba Rugi "Beban Pajak Penghasilan"; app leaves it static.
    const taxRowApp = lrApp.find(r => /Beban Pajak Penghasilan/i.test(r.label));
    const taxRowBase = base.labaRugi.find(r => /Beban Pajak Penghasilan/i.test(r.label));
    if (taxRowApp && approx(taxRowApp.value, taxRowBase.value)) silentDrops.push('Laba Rugi "Beban Pajak Penghasilan" (99999) — vanished, no unmapped indicator');
    // Anchor 3: parent 62010 has no unmapped indicator in the app render
    if (opsApp.unmapped.length === 0 && A.opsUnmapped.length > 0)
      silentDrops.push(`LRA: ${A.opsUnmapped.map(u => u.code).join(',')} (parent, ambiguous) dumped on first child instead of flagged unmapped`);

    // ── Randomized generalization (property over random journals) ──
    const pool = [
      { code: '61012', name: 'Beban Gaji Pokok Pegawai Tetap', lrLeaf: 'Beban Gaji' },
      { code: '62013', name: 'Beban Pemeliharaan Mobil Truck', lrLeaf: 'Beban Pemeliharaan Kendaraan Operasional' },
      { code: '99999', name: 'Pajak Penghasilan', lrLeaf: 'Beban Pajak Penghasilan' },
    ];
    let randTrials = 0, randBugHits = 0;
    let seed = 1234567;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let t = 0; t < 40; t++) {
      const pick = pool[Math.floor(rnd() * pool.length)];
      const amt = Math.floor(rnd() * 9_000_000) + 1_000_000;
      const jr = [{ id: `JV-RND-${t}`, tanggal: '2026-06-19', status: 'posted',
        akun_debit: `${pick.code} ${pick.name}`, akun_kredit: '11103 Bank Kalsel - 3204661684',
        debit: amt, kredit: amt, keterangan: 'random op' }];
      const ra = buildLR_AppRows(base.labaRugi, jr);
      const re = buildLR_ExpectedRows(base.labaRugi, attributeCorrectly(jr));
      const leafA = ra.find(r => r.label === pick.lrLeaf);
      const leafE = re.find(r => r.label === pick.lrLeaf);
      randTrials++;
      if (leafA && leafE && !approx(leafA.value, leafE.value)) randBugHits++;
    }

    // ── Report ──
    printReport(failures, silentDrops, { randTrials, randBugHits }, oracleWarnings);

    const bugConfirmed = failures.length > 0 || silentDrops.length > 0;
    process.exit(bugConfirmed ? 1 : 0);
  });
}

function printReport(fails, silentDrops, rand, oracleWarnings) {
  console.log('\n' + '─'.repeat(78));
  console.log(' COUNTEREXAMPLES (app render ≠ baseline + correctly-attributed delta)');
  console.log('─'.repeat(78));
  const byAnchor = {};
  for (const f of fails) { (byAnchor[f.anchor] = byAnchor[f.anchor] || []).push(f); }
  const titles = {
    1: 'Anchor 1 — Laba Rugi: total moves but detail leaf stays static (total ≠ Σ leaves)',
    2: 'Anchor 2 — Neraca: current-asset delta misclassified (Aset Lancar vs Tidak Lancar)',
    3: 'Anchor 3 — LRA: parent 62010 delta dumped on wrong outline 1.1.1',
    4: 'Anchor 4 — Arus Kas: activity sections static; only Kenaikan/Akhir Periode move',
    5: 'Anchor 5 — Unmapped / wrong sign: class-9 tax dropped + Neraca unbalanced',
    0: 'Other discrepancies',
  };
  for (const k of [1, 2, 3, 4, 5, 0]) {
    const list = byAnchor[k]; if (!list || !list.length) continue;
    console.log(`\n▸ ${titles[k]}`);
    for (const f of list) {
      console.log(`    [${f.report}] ${f.line}`);
      console.log(`        app=${rupiah(f.appV)}  expected=${rupiah(f.expV)}  diff=${rupiah(f.diff)}`);
      console.log(`        cause: ${f.cause}`);
    }
  }
  if (silentDrops.length) {
    console.log('\n▸ Silent drops (no "unmapped" indicator surfaced):');
    silentDrops.forEach(s => console.log('    • ' + s));
  }
  console.log('\n' + '─'.repeat(78));
  console.log(` Generalization: ${rand.randBugHits}/${rand.randTrials} random journals reproduced the leaf-vs-total bug`);
  console.log('─'.repeat(78));

  if (oracleWarnings && oracleWarnings.length) {
    console.log('\n ⚠️  ORACLE SELF-CHECK WARNINGS (independent oracle should be internally consistent):');
    oracleWarnings.forEach(w => console.log('    • ' + w));
  } else {
    console.log('\n ✓ Oracle self-check: EXPECTED reports are internally consistent (balanced; total==Σ leaves).');
  }

  const total = fails.length + silentDrops.length;
  console.log('\n' + '═'.repeat(78));
  if (total > 0) {
    console.log(` ❌ TEST FAILED — ${fails.length} line/total mismatches + ${silentDrops.length} silent drops.`);
    console.log('    ✅ This is the EXPECTED outcome for Task 1: the delta-overlay bug is CONFIRMED.');
    console.log('    The same test is reused at task 5.5 to verify the fix makes it PASS.');
  } else {
    console.log(' ⚠️  TEST PASSED UNEXPECTEDLY — the harness did not detect the overlay bug.');
    console.log('    Investigate: the mirrored app logic or the oracle may be mis-modeled.');
  }
  console.log('═'.repeat(78));
}

if (require.main === module) {
  main();
}
