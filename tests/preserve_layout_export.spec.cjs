/**
 * Preservation property test — Property 4:
 *   "Laporan Sempit, Cetak/Ekspor, dan Scroll Vertikal"
 *   (narrow reports, print/export, and vertical scroll)
 *
 * Spec : .kiro/specs/perbaikan-laporan-juni-2026
 * Tasks: written for Task 4 (preservation, observation-first) and REUSED by
 *        Task 5.8 (confirm the fix introduces no regression).
 *
 * **Validates: Requirements 3.4, 3.5, 3.6**
 *
 * Property 4 (Preservation):
 *   For any input where the layout bug-condition is NOT met (table fits the
 *   viewport, OR a print/export action, OR vertical scrolling), the layout
 *   SHALL behave exactly as before:
 *     • Req 3.4 — a report narrow enough to fit gets NO unnecessary horizontal
 *                 scrollbar.
 *     • Req 3.5 — Cetak Laporan (printReport) and Unduh Excel (exportLabaRugi /
 *                 exportNeraca / exportArusKas / exportFullReport) keep producing
 *                 working output that contains ALL columns / sheets.
 *     • Req 3.6 — page-level vertical scroll (via `.content`) and the sticky
 *                 table header (`thead th { position: sticky }`) keep working.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS PASSES ON THE CURRENT CODE (observation-first preservation)
 * ─────────────────────────────────────────────────────────────────────────
 * This test locks in behavior that the horizontal-scroll fix (Task 5.4, already
 * shipped in src/index.css) must NOT have broken, and that the upcoming numeric
 * fix (Tasks 5.1–5.3, which touches no CSS and no export code) must keep intact:
 *   - The Excel/print export functions build their workbooks in plain JS and are
 *     completely independent of the CSS `overflow-x` change — so they still emit
 *     every column and sheet. We prove this by actually INVOKING them and parsing
 *     the real emitted .xlsx bytes.
 *   - `.content { overflow-y: auto }` is untouched, so page vertical scroll works.
 *   - `thead th { position: sticky; top: 0 }` is still present and applies.
 *   - A narrow report still produces no horizontal scrollbar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW THIS COMPLEMENTS (does NOT duplicate) Task 2 (explore_layout_scroll.spec.cjs)
 * ─────────────────────────────────────────────────────────────────────────
 * Task 2 proves the *new feature*: WIDE reports CAN scroll horizontally
 * (Property 3), with a negative control and a side-by-side case. It only lightly
 * touches preservation (narrow report = no scroll; @media print = overflow
 * visible). This Task-4 test covers the preservation dimensions Task 2 does NOT:
 *   1. EXPORT (Req 3.5): really invokes exportLabaRugi/exportNeraca/exportArusKas/
 *      exportFullReport + printReport and asserts the emitted workbook keeps every
 *      column and sheet. (Task 2 never exercises the export path at all.)
 *   2. VERTICAL scroll + sticky header (Req 3.6): asserts `.content` scrolls
 *      vertically and `thead th` stays sticky. (Task 2 only checks the horizontal
 *      axis.)
 *   3. NARROW report (Req 3.4): kept here as the dedicated preservation guard,
 *      framed as a property over random fitting viewports.
 * The one small overlap — the @media-print overflow rule — is re-checked here
 * because it underwrites Req 3.5 (print keeps all columns), which is this test's
 * domain; Task 2 looks at it from the layout angle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TOOLING
 * ─────────────────────────────────────────────────────────────────────────
 * Self-contained `.cjs` harness (repo has no jest/vitest), consistent with
 * Task 2/3 conventions. Two runtimes in one file:
 *   • Part 1 (export) runs in Node with the real `xlsx`. The export modules are
 *     ESM and import `{ saveAs } from 'file-saver'` (a CJS module Vite bridges
 *     but raw Node ESM cannot). A tiny module loader (registered from an inline
 *     data: URL) swaps `file-saver` for an ESM stub that captures each
 *     saveAs(blob, filename) call, so we can parse the real emitted .xlsx bytes.
 *   • Part 2 (layout) uses the `playwright` library (devDependency) + cached
 *     Chromium for REAL browser layout, injecting the shipped src/index.css
 *     verbatim (no prior `npm run build` required).
 * The QA DB is NOT touched — this test is purely about layout + export structure,
 * which is exactly the dimension complementary to the numeric preservation test
 * (Task 3 / preserve_numeric.cjs).
 *
 * Run:  node tests/preserve_layout_export.spec.cjs
 * Exit: 0 when every preservation guard holds (EXPECTED here), 1 otherwise.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { register } = require('node:module');
const { pathToFileURL } = require('url');
const XLSX = require('xlsx');
const { chromium } = require('playwright');

// ── Register a loader that replaces the CJS `file-saver` with an ESM stub ──
// The stub records every saveAs(blob, filename) into globalThis.__savedFiles so
// we can read back the real workbook bytes the export functions emit.
const FILE_SAVER_STUB =
  'export function saveAs(b,f){ (globalThis.__savedFiles ??= []).push({ blob:b, filename:f }); }\n' +
  'export default { saveAs };';
const LOADER_SRC =
  `const STUB=${JSON.stringify(FILE_SAVER_STUB)};` +
  `export function resolve(spec,ctx,next){` +
  `  if(spec==='file-saver'){ return { url:'data:text/javascript,'+encodeURIComponent(STUB), shortCircuit:true }; }` +
  `  return next(spec,ctx);` +
  `}`;
register('data:text/javascript,' + encodeURIComponent(LOADER_SRC), pathToFileURL(__filename).href);

const CSS_PATH = path.join(__dirname, '..', 'src', 'index.css');
// Strip the remote @import (Google Fonts) so layout checks are offline/deterministic.
const SHIPPED_CSS = fs.readFileSync(CSS_PATH, 'utf8').replace(/@import\s+url\([^)]*\);?/g, '');

// ── tiny assert harness (same style as Task 2) ────────────────────────────
const results = [];
function check(name, cond, detail) {
  const ok = !!cond;
  results.push({ name, ok });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  (${detail})` : ''}`);
  return ok;
}
function section(title) { console.log(`\n${title}`); }

// ── seeded RNG (mulberry32) for reproducible property sampling ────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

// ════════════════════════════════════════════════════════════════════════
// PART 1 — EXPORT preservation (Req 3.5): invoke the REAL export functions and
//          verify the emitted workbook keeps every column / sheet.
// ════════════════════════════════════════════════════════════════════════
async function decodeSaved(saved) {
  // saved: [{ blob, filename }] → [{ filename, sheetNames, sheets:{ name:{rows,maxCols,aoa} } }]
  const out = [];
  for (const s of saved) {
    const buf = new Uint8Array(await s.blob.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'array' });
    const sheets = {};
    for (const sn of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1 });
      sheets[sn] = { aoa, rows: aoa.length, maxCols: aoa.reduce((m, r) => Math.max(m, (r || []).length), 0) };
    }
    out.push({ filename: s.filename, bytes: buf, sheetNames: wb.SheetNames, sheets });
  }
  return out;
}
async function runExport(fn) {
  globalThis.__savedFiles = [];
  fn();
  return decodeSaved(globalThis.__savedFiles);
}
const flat = (aoa) => aoa.map((r) => (r || []).map((c) => String(c ?? '')).join('\u0001')).join('\u0002');
const hasRowText = (aoa, text) => aoa.some((r) => (r || []).some((c) => String(c ?? '').trim() === text));

async function part1_exportPreservation() {
  section('PART 1 — Export preservation (Req 3.5): Unduh Excel / Cetak keep all columns & sheets');
  globalThis.alert = (m) => { check('export: no error alert raised', false, String(m).slice(0, 120)); };

  const eu = await import('../src/utils/exportUtils.js');
  const efr = await import('../src/utils/exportFullReport.js');

  // ── 1a. exportNeraca → single 'Neraca' sheet with both columns ──────────
  section('1a. exportNeraca()');
  const N = await runExport(() => eu.exportNeraca());
  check('1a1: emits exactly one workbook file', N.length === 1, `files=${N.length}`);
  if (N[0]) {
    check('1a2: valid .xlsx (ZIP/PK signature)', N[0].bytes[0] === 0x50 && N[0].bytes[1] === 0x4b);
    check("1a3: sheet 'Neraca' present", N[0].sheetNames.includes('Neraca'), N[0].sheetNames.join(','));
    const ws = N[0].sheets['Neraca'] || { maxCols: 0, aoa: [] };
    check('1a4: keeps both columns [Akun, Jumlah]',
      ws.maxCols >= 2 && hasRowText(ws.aoa, 'Akun') && hasRowText(ws.aoa, 'Jumlah'), `maxCols=${ws.maxCols}`);
    check('1a5: content rows present (ASET / Total Aset / KEWAJIBAN / EKUITAS)',
      hasRowText(ws.aoa, 'ASET') && hasRowText(ws.aoa, 'Total Aset') &&
      hasRowText(ws.aoa, 'KEWAJIBAN') && hasRowText(ws.aoa, 'EKUITAS'));
  }

  // ── 1b. exportLabaRugi → single 'Laba Rugi' sheet, all 4 columns ────────
  section('1b. exportLabaRugi()');
  const LR = await runExport(() => eu.exportLabaRugi());
  check('1b1: emits exactly one workbook file', LR.length === 1, `files=${LR.length}`);
  if (LR[0]) {
    check("1b2: sheet 'Laba Rugi' present", LR[0].sheetNames.includes('Laba Rugi'), LR[0].sheetNames.join(','));
    const ws = LR[0].sheets['Laba Rugi'] || { maxCols: 0, aoa: [] };
    const header = (ws.aoa[0] || []).map((c) => String(c));
    const EXPECTED = ['Akun', 'Jan 2026', 'Des 2025', 'Selisih'];
    check('1b3: header keeps all 4 columns [Akun, Jan 2026, Des 2025, Selisih]',
      ws.maxCols >= 4 && EXPECTED.every((h) => header.includes(h)), `header=${JSON.stringify(header)}`);
    check('1b4: section + total rows present (PENDAPATAN / Total Pendapatan / RUGI BERSIH)',
      hasRowText(ws.aoa, 'PENDAPATAN') && hasRowText(ws.aoa, 'Total Pendapatan') && hasRowText(ws.aoa, 'RUGI BERSIH'));
  }

  // ── 1c. exportArusKas → 'Arus Kas' sheet, all 3 activities + every item ──
  section('1c. exportArusKas(cashFlow) — incl. property over random cash-flow shapes');
  const sampleCF = {
    operasional: { items: [{ keterangan: 'Penerimaan Retribusi', jumlah: 100 }], netto: 100 },
    investasi: { items: [{ keterangan: 'Pembelian Aset Tetap', jumlah: -50 }], netto: -50 },
    pendanaan: { items: [{ keterangan: 'Penyetoran Modal', jumlah: 25 }], netto: 25 },
    totalNetto: 75,
  };
  const AK = await runExport(() => eu.exportArusKas(sampleCF));
  check('1c1: emits exactly one workbook file', AK.length === 1, `files=${AK.length}`);
  if (AK[0]) {
    check("1c2: sheet 'Arus Kas' present", AK[0].sheetNames.includes('Arus Kas'), AK[0].sheetNames.join(','));
    const ws = AK[0].sheets['Arus Kas'] || { maxCols: 0, aoa: [] };
    check('1c3: keeps both columns [Keterangan, Jumlah]',
      ws.maxCols >= 2 && hasRowText(ws.aoa, 'Keterangan') && hasRowText(ws.aoa, 'Jumlah'), `maxCols=${ws.maxCols}`);
    check('1c4: all three activity sections present (Operasional / Investasi / Pendanaan)',
      hasRowText(ws.aoa, 'AKTIVITAS OPERASIONAL') && hasRowText(ws.aoa, 'AKTIVITAS INVESTASI') &&
      hasRowText(ws.aoa, 'AKTIVITAS PENDANAAN'));
    check('1c5: net + grand-total rows present',
      hasRowText(ws.aoa, 'KENAIKAN/(PENURUNAN) KAS BERSIH'));
  }

  // Property: for random cash-flow shapes, EVERY line item is emitted (no row
  // dropped) and the column count never changes. This guards "memuat seluruh
  // kolom" structurally across arbitrary data.
  const rng = mulberry32(0xA17C45);
  let cfTrials = 0, cfMissing = 0, badCols = 0;
  for (let t = 0; t < 16; t++) {
    const mk = (sec, n) => Array.from({ length: n }, (_, i) => ({
      keterangan: `Item-${sec}-${t}-${i}-${randInt(rng, 100, 999)}`, jumlah: randInt(rng, -9_000_000, 9_000_000),
    }));
    const o = mk('OP', randInt(rng, 0, 5)), inv = mk('INV', randInt(rng, 0, 5)), p = mk('PEND', randInt(rng, 0, 5));
    const sum = (a) => a.reduce((s, x) => s + x.jumlah, 0);
    const cf = {
      operasional: { items: o, netto: sum(o) }, investasi: { items: inv, netto: sum(inv) },
      pendanaan: { items: p, netto: sum(p) }, totalNetto: sum(o) + sum(inv) + sum(p),
    };
    const out = await runExport(() => eu.exportArusKas(cf));
    cfTrials++;
    const ws = (out[0] && out[0].sheets['Arus Kas']) || { maxCols: 0, aoa: [] };
    if (ws.maxCols !== 2) badCols++;
    for (const it of [...o, ...inv, ...p]) {
      if (!hasRowText(ws.aoa, it.keterangan)) cfMissing++;
    }
  }
  check(`1c6: property — every line item emitted across ${cfTrials} random cash-flows`, cfMissing === 0,
    `missing=${cfMissing}, seed=0xA17C45`);
  check('1c7: property — Arus Kas column count stays 2 for all random shapes', badCols === 0, `violations=${badCols}`);

  // ── 1d. exportFullReport → all 6 sheets, each keeping its columns ────────
  section('1d. exportFullReport(state, journals, period, cashFlow)');
  const state = {
    coaTree: [
      { code: '11101', name: 'Kas', type: 'posting', saldoAwal: 1_000_000, defaultSide: 'D' },
      { code: '41010', name: 'Pendapatan Retribusi', type: 'posting', saldoAwal: 0, defaultSide: 'K' },
      { code: '61010', name: 'Beban Gaji', type: 'posting', saldoAwal: 0, defaultSide: 'D' },
    ],
  };
  const journals = [
    { tanggal: '2026-06-18', status: 'posted', akun_debit: '11101 - Kas', akun_kredit: '41010 - Pendapatan Retribusi', debit: 500_000, kredit: 500_000, keterangan: 'setoran' },
    { tanggal: '2026-06-19', status: 'posted', akun_debit: '61010 - Beban Gaji', akun_kredit: '11101 - Kas', debit: 200_000, kredit: 200_000, keterangan: 'gaji' },
  ];
  const cashFlow = {
    operasional: { items: [{ keterangan: 'Penerimaan', jumlah: 500_000 }], netto: 500_000 },
    investasi: { items: [], netto: 0 }, pendanaan: { items: [], netto: 0 }, totalNetto: 500_000,
  };
  const FR = await runExport(() => efr.exportFullReport(state, journals, 'juni', cashFlow));
  check('1d1: emits exactly one workbook file', FR.length === 1, `files=${FR.length}`);
  if (FR[0]) {
    const EXPECTED_SHEETS = ['Rekap Akun & Saldo', 'Laba Rugi', 'Neraca', 'Arus Kas', 'Jurnal', 'COA'];
    check('1d2: all 6 sheets present (none dropped)',
      EXPECTED_SHEETS.every((s) => FR[0].sheetNames.includes(s)), FR[0].sheetNames.join(' | '));
    // Each sheet must keep at least its known column count (observed baseline).
    const MIN_COLS = { 'Rekap Akun & Saldo': 6, 'Laba Rugi': 10, 'Neraca': 8, 'Arus Kas': 3, 'Jurnal': 8, 'COA': 3 };
    let colOk = true;
    const detail = [];
    for (const s of EXPECTED_SHEETS) {
      const got = (FR[0].sheets[s] || { maxCols: 0 }).maxCols;
      detail.push(`${s}=${got}/${MIN_COLS[s]}`);
      if (got < MIN_COLS[s]) colOk = false;
    }
    check('1d3: every sheet keeps all its columns', colOk, detail.join(', '));
    check("1d4: Jurnal sheet keeps its 8-column header (No..Kredit)",
      hasRowText(FR[0].sheets['Jurnal'].aoa, 'Debit') && hasRowText(FR[0].sheets['Jurnal'].aoa, 'Kredit') &&
      hasRowText(FR[0].sheets['Jurnal'].aoa, 'Akun Debit') && hasRowText(FR[0].sheets['Jurnal'].aoa, 'Akun Kredit'));
  }

  // ── 1e. printReport — Cetak Laporan still wired (sets title + triggers print) ──
  section('1e. printReport() — Cetak Laporan');
  let printed = false;
  const prevDoc = globalThis.document, prevWin = globalThis.window;
  globalThis.document = { title: '' };
  globalThis.window = { print: () => { printed = true; } };
  try {
    eu.printReport('Laporan Keuangan Juni 2026');
    check('1e1: printReport sets document.title', globalThis.document.title === 'Laporan Keuangan Juni 2026', globalThis.document.title);
    check('1e2: printReport triggers window.print()', printed === true);
  } catch (e) {
    check('1e1: printReport callable without error', false, e.message);
  } finally {
    globalThis.document = prevDoc; globalThis.window = prevWin;
  }
}

// ════════════════════════════════════════════════════════════════════════
// PART 2 — LAYOUT preservation (Req 3.4 narrow no-scroll, Req 3.6 vertical+sticky)
// ════════════════════════════════════════════════════════════════════════
function reportBody({ headers, rows, bodyId }) {
  const ths = headers.map((h) => `<th>${h}</th>`).join('');
  const trs = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="report-doc"><div class="report-doc-body" id="${bodyId}">` +
    `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div></div>`;
}
// Mirror the real app shell so `.content` is the bounded vertical-scroll container.
function appShell(inner) {
  return `<div class="app-layout"><div class="main-wrapper"><div class="content" id="content">${inner}</div></div></div>`;
}
function buildHtml(inner) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${SHIPPED_CSS}</style></head><body>${inner}</body></html>`;
}
async function measureH(page, selector) {
  const m = await page.$eval(selector, (el) => {
    const cs = getComputedStyle(el);
    const prev = el.scrollLeft; el.scrollLeft = 1e7; const maxScrollLeft = el.scrollLeft; el.scrollLeft = prev;
    return { overflowX: cs.overflowX, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, maxScrollLeft };
  });
  m.overflowed = m.scrollWidth > m.clientWidth + 1;
  m.styleScrollable = m.overflowX === 'auto' || m.overflowX === 'scroll';
  m.available = m.overflowed && m.styleScrollable;
  return m;
}
async function measureV(page, selector) {
  const m = await page.$eval(selector, (el) => {
    const cs = getComputedStyle(el);
    const prev = el.scrollTop; el.scrollTop = 1e7; const maxScrollTop = el.scrollTop; el.scrollTop = prev;
    return { overflowY: cs.overflowY, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, maxScrollTop };
  });
  m.overflowed = m.scrollHeight > m.clientHeight + 1;
  m.scrollable = (m.overflowY === 'auto' || m.overflowY === 'scroll');
  m.available = m.overflowed && m.scrollable && m.maxScrollTop > 0;
  return m;
}

const NARROW_HEADERS = ['Akun', 'Saldo'];
const NARROW_ROWS = [['Kas', '100'], ['Bank', '250']];

async function part2_layoutPreservation() {
  section('PART 2 — Layout preservation (Req 3.4 narrow no-scroll, Req 3.6 vertical + sticky)');

  // ── Static CSS rules that must remain (source of truth) ─────────────────
  section('2a. Static CSS rules preserved');
  check('2a1: .content keeps overflow-y: auto (page vertical scroll — Req 3.6)',
    /\.content\s*\{[^}]*overflow-y:\s*auto/.test(SHIPPED_CSS));
  check('2a2: thead th keeps position: sticky; top: 0 (sticky header — Req 3.6)',
    /thead\s+th\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/.test(SHIPPED_CSS));
  check('2a3: @media print keeps .report-doc-body overflow: visible !important (print all columns — Req 3.5)',
    /\.report-doc-body\s*\{[^}]*overflow:\s*visible\s*!important/.test(SHIPPED_CSS));

  const browser = await chromium.launch({ headless: true });
  try {
    // ── 2b. Req 3.6 — vertical scroll works in `.content` ─────────────────
    section('2b. Req 3.6 — page-level vertical scroll via `.content`');
    const tallRows = Array.from({ length: 80 }, (_, i) => [`Akun ${i}`, String(i * 1000)]);
    const pageV = await browser.newPage();
    try {
      await pageV.setViewportSize({ width: 1000, height: 520 });
      await pageV.setContent(buildHtml(appShell(reportBody({ headers: NARROW_HEADERS, rows: tallRows, bodyId: 'b' }))), { waitUntil: 'load' });
      const tall = await measureV(pageV, '#content');
      check('2b1: tall report — `.content` vertical scroll AVAILABLE',
        tall.available, `overflow-y=${tall.overflowY}, scrollHeight=${tall.scrollHeight} > clientHeight=${tall.clientHeight}, maxScrollTop=${tall.maxScrollTop}px`);

      const thPos = await pageV.$eval('thead th', (el) => getComputedStyle(el).position);
      check('2b2: sticky header — `thead th` computes position: sticky', thPos === 'sticky', `position=${thPos}`);

      // Negative control: a short report needs NO vertical scroll (proves 2b1 is meaningful).
      await pageV.setContent(buildHtml(appShell(reportBody({ headers: NARROW_HEADERS, rows: NARROW_ROWS, bodyId: 'b' }))), { waitUntil: 'load' });
      const short = await measureV(pageV, '#content');
      check('2b3: negative control — short report does NOT vertically overflow `.content`',
        !short.available && short.maxScrollTop === 0, `scrollHeight=${short.scrollHeight} <= clientHeight=${short.clientHeight}, maxScrollTop=${short.maxScrollTop}px`);
      check('2b4: vertical-scroll test DISCRIMINATES (tall=scroll, short=no-scroll)',
        tall.available === true && short.available === false);
    } finally {
      await pageV.close();
    }

    // ── 2c. Req 3.4 — narrow report gets NO unnecessary horizontal scrollbar ─
    section('2c. Req 3.4 — narrow report: no unnecessary horizontal scrollbar');
    const pageH = await browser.newPage();
    try {
      await pageH.setViewportSize({ width: 1280, height: 800 });
      await pageH.setContent(buildHtml(reportBody({ headers: NARROW_HEADERS, rows: NARROW_ROWS, bodyId: 'b' })), { waitUntil: 'load' });
      const C = await measureH(pageH, '#b');
      check('2c1: narrow report does NOT overflow its container',
        !C.overflowed, `scrollWidth=${C.scrollWidth} <= clientWidth=${C.clientWidth}`);
      check('2c2: narrow report has NO horizontal scroll position to reach',
        C.maxScrollLeft === 0, `maxScrollLeft=${C.maxScrollLeft}px (overflow-x=${C.overflowX})`);

      // Property: across random wide viewports, a few-column report never produces
      // an unnecessary horizontal scrollbar (no overflow ⇒ nothing to scroll).
      const rng = mulberry32(0x5C0FFE);
      let nFit = 0, nViol = 0;
      const firstViol = [];
      for (let i = 0; i < 16; i++) {
        const w = randInt(rng, 900, 1440);
        const n = randInt(rng, 2, 4);
        const headers = Array.from({ length: n }, (_, k) => `Kol ${k + 1}`);
        const rows = Array.from({ length: 3 }, () => Array.from({ length: n }, (_, k) => `v${k}`));
        await pageH.setViewportSize({ width: w, height: 800 });
        await pageH.setContent(buildHtml(reportBody({ headers, rows, bodyId: 'b' })), { waitUntil: 'load' });
        const m = await measureH(pageH, '#b');
        if (!m.overflowed) {
          nFit++;
          if (m.maxScrollLeft !== 0) { nViol++; if (firstViol.length < 3) firstViol.push({ w, n, ...m }); }
        }
      }
      check(`2c3: property — fitting reports never get a horizontal scrollbar (${nFit} fit cases)`,
        nViol === 0, `violations=${nViol}, seed=0x5C0FFE` + (firstViol.length ? `; counterexample=${JSON.stringify(firstViol[0])}` : ''));
      check('2c4: property actually exercised the "fits" branch', nFit > 0, `fit=${nFit}`);

      // Discriminator: a wide 12-column table on a tight viewport DOES overflow,
      // proving "not overflowed" above is a real, detectable signal.
      const wideHeaders = Array.from({ length: 12 }, (_, k) => `Kolom Data Panjang Ke-${k + 1}`);
      const wideRows = Array.from({ length: 3 }, () => Array.from({ length: 12 }, (_, k) => `Teks contoh ${k}`));
      await pageH.setViewportSize({ width: 360, height: 800 });
      await pageH.setContent(buildHtml(reportBody({ headers: wideHeaders, rows: wideRows, bodyId: 'b' })), { waitUntil: 'load' });
      const W = await measureH(pageH, '#b');
      check('2c5: discriminator — wide table on narrow viewport DOES overflow (measurement is meaningful)',
        W.overflowed, `scrollWidth=${W.scrollWidth} > clientWidth=${W.clientWidth}`);
    } finally {
      await pageH.close();
    }
  } finally {
    await browser.close();
  }
}

// ════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('═'.repeat(78));
  console.log(' PRESERVATION TEST — Property 4: laporan sempit, cetak/ekspor, scroll vertikal');
  console.log(' Spec: perbaikan-laporan-juni-2026 / Task 4 (Req 3.4, 3.5, 3.6)');
  console.log(' EXPECTATION: PASSES on current code (locks the layout/export baseline to preserve).');
  console.log('═'.repeat(78));
  console.log(` CSS under test: ${path.relative(process.cwd(), CSS_PATH)}`);

  await part1_exportPreservation();
  await part2_layoutPreservation();

  const failed = results.filter((r) => !r.ok);
  section('─'.repeat(78));
  console.log(`RESULT: ${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log('FAILED checks:');
    failed.forEach((r) => console.log(`  - ${r.name}`));
    console.log('\nProperty 4 preservation test FAILED.');
    process.exit(1);
  }
  console.log('\n✅ Property 4 preservation test PASSED.');
  console.log('   Locked in: Excel export (exportLabaRugi/Neraca/ArusKas/FullReport) keeps all');
  console.log('   columns & sheets; Cetak (printReport) stays wired; `.content` vertical scroll +');
  console.log('   sticky `thead th` keep working; narrow reports get no needless horizontal scrollbar.');
  console.log('   Re-run at Task 5.8 to confirm the fix introduces no regression.');
  process.exit(0);
})().catch((e) => {
  console.error('\nTest harness error:', e && e.stack ? e.stack : e);
  process.exit(2);
});
