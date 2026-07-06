/**
 * Exploratory bug-condition / expected-behavior test — Property 3:
 *   "Scroll Horizontal untuk Laporan Lebar" (horizontal scroll for wide reports)
 *
 * Spec : .kiro/specs/perbaikan-laporan-juni-2026
 * Tasks: written for Task 2 (exploratory) and REUSED by Task 5.6 (verify fix).
 *
 * **Validates: Requirements 2.5, 2.6**  (Expected Behavior; exposes 1.5, 1.6)
 *
 * Property 3 (Expected Behavior):
 *   For any report whose rendered table is wider than its container, the
 *   layout SHALL provide horizontal scrolling on `.report-doc-body` so every
 *   column is reachable and not clipped — including when two or more reports
 *   are shown side by side.
 *
 * Preservation (Property 4 — asserted here so this test doubles as the basis
 * for Task 5.6 / regression guard):
 *   - A NARROW report (table fits the viewport) gets NO unnecessary horizontal
 *     scrollbar.
 *   - Under @media print, `.report-doc-body` keeps `overflow: visible` so all
 *     columns print (not clipped to a scroll area).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS TEST PASSES ON THE CURRENT CODE (and still proves it detects the bug)
 * ─────────────────────────────────────────────────────────────────────────
 * The horizontal-scroll fix (Task 5.4) ALREADY shipped in src/index.css:
 *     .report-doc-body            { overflow-x: auto; }
 *     .report-doc-body table th   { white-space: nowrap; }
 *     @media print .report-doc-body { overflow: visible !important; }
 *     .report-doc                 { overflow: hidden; }   (kept for corner clip)
 * So, unlike a normal exploration test, this PASSES against the real CSS.
 *
 * To prove the test is NOT vacuous, it runs a NEGATIVE CONTROL: the SAME wide
 * table at the SAME narrow viewport, but with the fix reverted to the pre-5.4
 * state via an override (`.report-doc-body { overflow: visible }` — the
 * original bug — and also `overflow-x: hidden`). In that reverted state the
 * test asserts horizontal scroll is UNAVAILABLE (columns clipped/unreachable).
 *   Fixed CSS   => scroll AVAILABLE   (assertions pass)
 *   Reverted    => scroll UNAVAILABLE (assertions confirm the bug)
 * The test therefore demonstrably discriminates fixed vs. unfixed layout.
 *
 * Tooling: uses the `playwright` library (devDependency) + cached Chromium for
 * REAL browser layout (scrollWidth/clientWidth + computed overflow-x). The
 * `@playwright/test` runner is not installed, so this is a self-contained node
 * harness, consistent with the repo's `.cjs` script convention. The shipped
 * `src/index.css` rules are injected directly, so a prior `npm run build` is
 * not required (the rules are authored verbatim in source and passed through
 * unchanged by the bundler).
 *
 * Run:  node tests/explore_layout_scroll.spec.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const CSS_PATH = path.join(__dirname, '..', 'src', 'index.css');
// Strip the remote @import (Google Fonts) so the test is offline-friendly and
// deterministic; fonts only nudge pixel widths, never the overflow logic.
const SHIPPED_CSS = fs
  .readFileSync(CSS_PATH, 'utf8')
  .replace(/@import\s+url\([^)]*\);?/g, '');

// ── tiny assert harness ──────────────────────────────────────────────────
const results = [];
function check(name, cond, detail) {
  const ok = !!cond;
  results.push({ name, ok });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  (${detail})` : ''}`);
  return ok;
}
function section(title) {
  console.log(`\n${title}`);
}

// ── seeded RNG (mulberry32) for reproducible property sampling ───────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

// ── HTML builders (mirror the real report DOM) ───────────────────────────
function reportDoc({ headers, rows, docStyle = '', bodyId }) {
  const ths = headers.map((h) => `<th>${h}</th>`).join('');
  const trs = rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('');
  return (
    `<div class="report-doc" style="${docStyle}">` +
    `<div class="report-doc-header"><div class="company">PERUMDA PASAR BAIMAN</div>` +
    `<h2>LAPORAN</h2></div>` +
    `<div class="report-doc-body" id="${bodyId}">` +
    `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>` +
    `</div></div>`
  );
}
function buildHtml(inner, extraStyle = '') {
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<style>${SHIPPED_CSS}</style>` +
    (extraStyle ? `<style>${extraStyle}</style>` : '') +
    `</head><body>${inner}</body></html>`
  );
}

// A realistic LRA report: 9 columns (the concrete wide-report anchor).
const LRA_HEADERS = [
  'Kode Rekening',
  'Uraian Kegiatan / Rekening',
  'Anggaran Tahun 2026',
  'Realisasi s/d Bulan Lalu',
  'Realisasi Bulan Ini',
  'Realisasi s/d Bulan Ini',
  'Sisa Anggaran',
  '% Realisasi',
  'Keterangan',
];
const LRA_ROWS = [
  ['4.1.01', 'Pendapatan Retribusi Pasar', '1.200.000.000', '450.000.000', '85.000.000', '535.000.000', '665.000.000', '44,58', 'Sesuai target'],
  ['5.1.02', 'Beban Pemeliharaan Kendaraan Operasional', '300.000.000', '120.000.000', '27.574.000', '147.574.000', '152.426.000', '49,19', 'Dalam batas'],
  ['5.2.01', 'Beban Umum dan Administrasi Kantor', '250.000.000', '98.251.556', '20.138.134', '118.389.690', '131.610.310', '47,36', 'Normal'],
];
const WIDE_TABLE = { headers: LRA_HEADERS, rows: LRA_ROWS };

// A narrow report that comfortably fits any reasonable container.
const NARROW_HEADERS = ['Akun', 'Saldo'];
const NARROW_ROWS = [['Kas', '100'], ['Bank', '250']];

// ── measurement (runs in the browser) ────────────────────────────────────
async function measure(page, selector) {
  const m = await page.$eval(selector, (el) => {
    const cs = getComputedStyle(el);
    const prev = el.scrollLeft;
    el.scrollLeft = 1e7; // probe: how far can it actually scroll horizontally?
    const maxScrollLeft = el.scrollLeft;
    el.scrollLeft = prev;
    return {
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      maxScrollLeft,
    };
  });
  m.overflowed = m.scrollWidth > m.clientWidth + 1; // +1 px sub-pixel tolerance
  // User-facing horizontal scroll: an auto/scroll overflow-x renders a usable
  // scrollbar. `hidden` clips with no scrollbar; `visible` overflows then gets
  // clipped by .report-doc (overflow:hidden) — neither is user-reachable.
  m.styleScrollable = m.overflowX === 'auto' || m.overflowX === 'scroll';
  m.available = m.overflowed && m.styleScrollable;
  return m;
}

async function loadAndMeasure(browser, { viewport, html, selector, media }) {
  const page = await browser.newPage();
  try {
    await page.setViewportSize(viewport);
    if (media) await page.emulateMedia({ media });
    await page.setContent(html, { waitUntil: 'load' });
    return await measure(page, selector);
  } finally {
    await page.close();
  }
}

(async () => {
  const SEED = 0xC0FFEE;
  console.log('Exploratory layout test — Property 3 (horizontal scroll for wide reports)');
  console.log(`CSS under test: ${path.relative(process.cwd(), CSS_PATH)}`);

  // ── 0. Static sanity: the shipped CSS still carries the Task 5.4 rules ──
  section('Static CSS rules (source of truth edited by Task 5.4)');
  check(
    '0a: .report-doc-body declares overflow-x: auto',
    /\.report-doc-body\s*\{[^}]*overflow-x:\s*auto/.test(SHIPPED_CSS),
  );
  check(
    '0b: .report-doc-body table th declares white-space: nowrap',
    /\.report-doc-body\s+table\s+th\s*\{[^}]*white-space:\s*nowrap/.test(SHIPPED_CSS),
  );
  check(
    '0c: .report-doc keeps overflow: hidden (rounded-corner clip)',
    /\.report-doc\s*\{[^}]*overflow:\s*hidden/.test(SHIPPED_CSS),
  );
  check(
    '0d: @media print sets .report-doc-body overflow: visible !important',
    /\.report-doc-body\s*\{[^}]*overflow:\s*visible\s*!important/.test(SHIPPED_CSS),
  );

  const browser = await chromium.launch({ headless: true });
  try {
    const NARROW_VP = { width: 420, height: 720 };

    // ── A. Shipped CSS, wide LRA table on a narrow viewport => SCROLL OK ──
    section('A. Expected Behavior — wide report (LRA, 9 cols) on narrow viewport');
    const htmlWide = buildHtml(reportDoc({ ...WIDE_TABLE, bodyId: 'rb' }));
    const A = await loadAndMeasure(browser, { viewport: NARROW_VP, html: htmlWide, selector: '#rb' });
    check('A1: table is wider than its container (would clip without scroll)',
      A.overflowed, `scrollWidth=${A.scrollWidth} > clientWidth=${A.clientWidth}`);
    check('A2: .report-doc-body overflow-x is auto|scroll',
      A.styleScrollable, `overflow-x=${A.overflowX}`);
    check('A3: horizontal scroll AVAILABLE — all columns reachable',
      A.available && A.maxScrollLeft > 0, `maxScrollLeft=${A.maxScrollLeft}px`);

    // ── B. NEGATIVE CONTROL: revert the fix => scroll UNAVAILABLE ─────────
    section('B. Negative control — fix reverted to pre-5.4 state (proves the test detects the bug)');
    const B1 = await loadAndMeasure(browser, {
      viewport: NARROW_VP,
      selector: '#rb',
      html: buildHtml(reportDoc({ ...WIDE_TABLE, bodyId: 'rb' }),
        '.report-doc-body { overflow: visible !important; }'), // the original bug
    });
    check('B1: reverted (overflow:visible) — scroll UNAVAILABLE, content clipped by .report-doc',
      !B1.available && B1.maxScrollLeft === 0, `overflow-x=${B1.overflowX}, maxScrollLeft=${B1.maxScrollLeft}px`);

    const B2 = await loadAndMeasure(browser, {
      viewport: NARROW_VP,
      selector: '#rb',
      html: buildHtml(reportDoc({ ...WIDE_TABLE, bodyId: 'rb' }),
        '.report-doc-body { overflow-x: hidden !important; }'), // clipped, no scrollbar
    });
    check('B2: reverted (overflow-x:hidden) — scroll UNAVAILABLE (clipped, no scrollbar)',
      !B2.available, `overflow-x=${B2.overflowX}`);

    check('B3: test DISCRIMINATES — fixed=available, reverted=unavailable',
      A.available === true && B1.available === false && B2.available === false);

    // ── C. Preservation — narrow report on a wide viewport => NO scrollbar ─
    section('C. Preservation — narrow report does not get an unnecessary scrollbar (Req 3.4)');
    const C = await loadAndMeasure(browser, {
      viewport: { width: 1280, height: 800 },
      selector: '#rbN',
      html: buildHtml(reportDoc({ headers: NARROW_HEADERS, rows: NARROW_ROWS, bodyId: 'rbN' })),
    });
    check('C1: narrow report does NOT overflow its container',
      !C.overflowed, `scrollWidth=${C.scrollWidth} <= clientWidth=${C.clientWidth}`);
    check('C2: narrow report has NO horizontal scroll (nothing to scroll)',
      !C.available && C.maxScrollLeft === 0, `overflow-x=${C.overflowX}, maxScrollLeft=${C.maxScrollLeft}px`);

    // ── D. Two reports side by side => each body scrolls (Req 2.6) ────────
    section('D. Expected Behavior — two reports side by side each scroll horizontally (Req 2.6)');
    const sideBySide =
      `<div style="display:flex; gap:16px; align-items:flex-start;">` +
      reportDoc({ ...WIDE_TABLE, docStyle: 'width:440px;', bodyId: 'rbL' }) +
      reportDoc({ ...WIDE_TABLE, docStyle: 'width:440px;', bodyId: 'rbR' }) +
      `</div>`;
    const dHtml = buildHtml(sideBySide);
    const DL = await loadAndMeasure(browser, { viewport: { width: 940, height: 800 }, html: dHtml, selector: '#rbL' });
    const DR = await loadAndMeasure(browser, { viewport: { width: 940, height: 800 }, html: dHtml, selector: '#rbR' });
    check('D1: LEFT report scroll AVAILABLE', DL.available && DL.maxScrollLeft > 0,
      `overflow-x=${DL.overflowX}, maxScrollLeft=${DL.maxScrollLeft}px`);
    check('D2: RIGHT report scroll AVAILABLE', DR.available && DR.maxScrollLeft > 0,
      `overflow-x=${DR.overflowX}, maxScrollLeft=${DR.maxScrollLeft}px`);

    // ── E. Preservation — @media print keeps overflow visible (Req 3.5) ──
    section('E. Preservation — @media print keeps .report-doc-body overflow visible (Req 3.5)');
    const E = await loadAndMeasure(browser, {
      viewport: NARROW_VP,
      media: 'print',
      selector: '#rb',
      html: buildHtml(reportDoc({ ...WIDE_TABLE, bodyId: 'rb' })),
    });
    check('E1: under print media, overflow-x computes to visible (all columns print)',
      E.overflowX === 'visible', `overflow-x=${E.overflowX}`);

    // ── F. Scoped property — scroll available IFF table overflows ────────
    section('F. Property — over random (viewport width × column count): scroll available iff overflow');
    const rng = mulberry32(SEED);
    const page = await browser.newPage();
    let allHeld = true, nOverflow = 0, nFit = 0, nCases = 0;
    const firstFail = [];
    // forced coverage cases + random samples
    const cases = [{ w: 360, n: 12 }, { w: 1400, n: 2 }];
    for (let i = 0; i < 14; i++) cases.push({ w: randInt(rng, 320, 1440), n: randInt(rng, 2, 12) });
    try {
      for (const c of cases) {
        const headers = Array.from({ length: c.n }, (_, i) => `Kolom Data Ke-${i + 1}`);
        const rows = Array.from({ length: 3 }, (_, r) =>
          Array.from({ length: c.n }, (_, i) => (r === 0 ? `12.345.${i}` : `Teks contoh ${i}`)));
        await page.setViewportSize({ width: c.w, height: 800 });
        await page.setContent(buildHtml(reportDoc({ headers, rows, bodyId: 'rb' })), { waitUntil: 'load' });
        const m = await measure(page, '#rb');
        nCases++;
        // The invariant: a usable horizontal scroll exists exactly when (and
        // only when) the table overflows its container.
        const held = m.available === m.overflowed;
        if (m.overflowed) nOverflow++; else nFit++;
        if (!held) { allHeld = false; if (firstFail.length < 3) firstFail.push({ ...c, ...m }); }
      }
    } finally {
      await page.close();
    }
    check(`F1: invariant held for all ${nCases} random cases (available iff overflow)`,
      allHeld, `overflow=${nOverflow}, fit=${nFit}, seed=0x${SEED.toString(16)}` +
      (firstFail.length ? `; counterexample=${JSON.stringify(firstFail[0])}` : ''));
    check('F2: property exercised BOTH overflow and fit branches',
      nOverflow > 0 && nFit > 0, `overflow=${nOverflow}, fit=${nFit}`);
  } finally {
    await browser.close();
  }

  // ── summary ──────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  section('──────────────────────────────────────────────');
  console.log(`RESULT: ${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log('FAILED checks:');
    failed.forEach((r) => console.log(`  - ${r.name}`));
    console.log('\nProperty 3 layout test FAILED.');
    process.exit(1);
  }
  console.log('\nProperty 3 layout test PASSED — wide reports scroll horizontally; narrow reports do not; print keeps all columns.');
  process.exit(0);
})().catch((e) => {
  console.error('\nTest harness error:', e && e.stack ? e.stack : e);
  process.exit(2);
});
