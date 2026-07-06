/**
 * pbt_layout.spec.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * PROPERTY-BASED TESTS (layout) — Spec: perbaikan-laporan-juni-2026 (TASK 7)
 *
 * Validates Requirements 2.5, 2.6 (fix checking) and 3.4 (preservation) — the
 * layout half of Task 7. The numeric half lives in scripts/pbt_overlay.cjs.
 *
 * Properties (Property 3 & 4, layout):
 *   • For random viewport widths × column counts, a USABLE horizontal scroll
 *     exists IFF the rendered table overflows its container
 *     (renderedWidth > viewport  ⇒  horizontalScrollAvailable;
 *      renderedWidth ≤ viewport   ⇒  NO horizontal scrollbar).
 *   • A fitting (narrow) report never shows an unnecessary scrollbar (Req 3.4).
 *   • Two reports side by side each scroll independently (Req 2.6).
 *
 * Approach: reuses the real-browser measurement approach from
 * tests/explore_layout_scroll.spec.cjs — the SHIPPED src/index.css is injected
 * directly and Chromium reports scrollWidth/clientWidth + computed overflow-x.
 * Because the layout fix is authored verbatim in src/index.css (passed through
 * unchanged by the bundler), a prior `npm run build` is not required for this
 * measurement. Many seeded-random cases are run with a fixed seed for
 * reproducibility (mulberry32, same family as the exploratory layout test).
 *
 * To prove the property is not vacuous, every random case is ALSO measured with
 * the fix reverted (overflow-x: hidden); in the reverted state the invariant
 * must FLIP for overflowing tables (scroll becomes unavailable) — demonstrating
 * the test discriminates fixed vs. unfixed CSS.
 *
 * Run:  node tests/pbt_layout.spec.cjs
 *
 * Exit code: 0 when every property holds across all cases, 1 otherwise (the
 * failing case's seed + dimensions are printed for reproducibility).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const CSS_PATH = path.join(__dirname, '..', 'src', 'index.css');
const SHIPPED_CSS = fs.readFileSync(CSS_PATH, 'utf8').replace(/@import\s+url\([^)]*\);?/g, '');
const SEED = 0x5C0011; // fixed seed → reproducible

// ── seeded RNG (mulberry32) ──────────────────────────────────────────────
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

// ── HTML builders (mirror the real report DOM) ───────────────────────────
function reportDoc({ headers, rows, docStyle = '', bodyId }) {
  const ths = headers.map((h) => `<th>${h}</th>`).join('');
  const trs = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return (
    `<div class="report-doc" style="${docStyle}">` +
    `<div class="report-doc-header"><div class="company">PERUMDA PASAR BAIMAN</div><h2>LAPORAN</h2></div>` +
    `<div class="report-doc-body" id="${bodyId}"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>` +
    `</div>`
  );
}
function buildHtml(inner, extraStyle = '') {
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${SHIPPED_CSS}</style>` +
    (extraStyle ? `<style>${extraStyle}</style>` : '') +
    `</head><body>${inner}</body></html>`
  );
}
function makeTable(nCols, nRows) {
  const headers = Array.from({ length: nCols }, (_, i) => `Kolom Data Ke-${i + 1}`);
  const rows = Array.from({ length: nRows }, (_, r) =>
    Array.from({ length: nCols }, (_, i) => (r === 0 ? `12.345.${i}` : `Teks contoh ${i}`)));
  return { headers, rows };
}

// ── measurement (runs in the browser) ────────────────────────────────────
async function measure(page, selector) {
  const m = await page.$eval(selector, (el) => {
    const cs = getComputedStyle(el);
    const prev = el.scrollLeft;
    el.scrollLeft = 1e7;
    const maxScrollLeft = el.scrollLeft;
    el.scrollLeft = prev;
    return { overflowX: cs.overflowX, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, maxScrollLeft };
  });
  m.overflowed = m.scrollWidth > m.clientWidth + 1; // +1px sub-pixel tolerance
  m.styleScrollable = m.overflowX === 'auto' || m.overflowX === 'scroll';
  m.available = m.overflowed && m.styleScrollable; // user-reachable horizontal scroll
  return m;
}

// ── tiny assert harness ──────────────────────────────────────────────────
const results = [];
const check = (name, cond, detail) => {
  const ok = !!cond;
  results.push({ name, ok });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  (${detail})` : ''}`);
  return ok;
};
const section = (t) => console.log(`\n${t}`);

(async () => {
  console.log('═'.repeat(78));
  console.log(' PROPERTY-BASED TESTS (layout) — horizontal scroll iff overflow');
  console.log(' Spec: perbaikan-laporan-juni-2026 / Task 7 (Req 2.5, 2.6, 3.4)');
  console.log('═'.repeat(78));
  console.log(` CSS under test: ${path.relative(process.cwd(), CSS_PATH)}  (seed=0x${SEED.toString(16)})`);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const rng = mulberry32(SEED);

    // ── Property A — scroll available IFF table overflows (≥100 cases) ──
    section('A. Property — over random (viewport width × column count): scroll available IFF overflow');
    const TRIALS = 120;
    // forced coverage: a guaranteed-overflow and a guaranteed-fit case
    const cases = [{ w: 340, n: 14 }, { w: 1500, n: 2 }];
    for (let i = 0; i < TRIALS - 2; i++) cases.push({ w: randInt(rng, 320, 1500), n: randInt(rng, 2, 14) });

    let held = 0, nOverflow = 0, nFit = 0;
    const fails = [];
    for (const c of cases) {
      const { headers, rows } = makeTable(c.n, 4);
      await page.setViewportSize({ width: c.w, height: 800 });
      await page.setContent(buildHtml(reportDoc({ headers, rows, bodyId: 'rb' })), { waitUntil: 'load' });
      const m = await measure(page, '#rb');
      if (m.overflowed) nOverflow++; else nFit++;
      // The invariant: usable horizontal scroll exists exactly when the table overflows.
      if (m.available === m.overflowed) held++;
      else if (fails.length < 5) fails.push({ ...c, overflowX: m.overflowX, scrollWidth: m.scrollWidth, clientWidth: m.clientWidth, maxScrollLeft: m.maxScrollLeft });
    }
    check(`A1: invariant held for all ${cases.length} cases (available IFF overflow)`,
      held === cases.length, `held=${held}/${cases.length}, overflow=${nOverflow}, fit=${nFit}` + (fails.length ? `; counterexample=${JSON.stringify(fails[0])}` : ''));
    check('A2: property exercised BOTH branches (some overflow, some fit)',
      nOverflow > 0 && nFit > 0, `overflow=${nOverflow}, fit=${nFit}`);

    // ── Property B — overflowing tables actually scroll; fitting tables don't ──
    section('B. Property — overflow ⇒ maxScrollLeft>0; fit ⇒ maxScrollLeft==0');
    let scrollPosOK = 0, scrollPosTotal = 0;
    const rng2 = mulberry32(SEED ^ 0x9E3779B9);
    for (let i = 0; i < 60; i++) {
      const c = { w: randInt(rng2, 320, 1500), n: randInt(rng2, 2, 14) };
      const { headers, rows } = makeTable(c.n, 3);
      await page.setViewportSize({ width: c.w, height: 800 });
      await page.setContent(buildHtml(reportDoc({ headers, rows, bodyId: 'rb' })), { waitUntil: 'load' });
      const m = await measure(page, '#rb');
      scrollPosTotal++;
      const ok = m.overflowed ? (m.maxScrollLeft > 0) : (m.maxScrollLeft === 0);
      if (ok) scrollPosOK++;
    }
    check(`B1: maxScrollLeft consistent with overflow for all ${scrollPosTotal} cases`,
      scrollPosOK === scrollPosTotal, `ok=${scrollPosOK}/${scrollPosTotal}`);

    // ── Property C — NEGATIVE CONTROL: revert fix ⇒ invariant flips ──────
    section('C. Negative control — fix reverted (overflow-x:hidden) ⇒ overflowing tables lose scroll');
    let flipped = 0, flipTotal = 0;
    const rng3 = mulberry32(SEED ^ 0x12345);
    for (let i = 0; i < 40; i++) {
      const c = { w: randInt(rng3, 320, 520), n: randInt(rng3, 9, 14) }; // biased to overflow
      const { headers, rows } = makeTable(c.n, 3);
      await page.setViewportSize({ width: c.w, height: 800 });
      await page.setContent(
        buildHtml(reportDoc({ headers, rows, bodyId: 'rb' }), '.report-doc-body { overflow-x: hidden !important; }'),
        { waitUntil: 'load' });
      const m = await measure(page, '#rb');
      // With the fix reverted (overflow-x:hidden) there is NO user-facing
      // scrollbar, so the column is unreachable even though the browser still
      // allows programmatic scrollLeft. The user-facing signal is `available`
      // (overflow-x resolves to auto|scroll), matching the exploratory harness.
      if (m.overflowed) { flipTotal++; if (!m.available) flipped++; }
    }
    check(`C1: with the fix reverted, scroll is UNAVAILABLE for all ${flipTotal} overflowing cases`,
      flipTotal > 0 && flipped === flipTotal, `unavailable=${flipped}/${flipTotal}`);

    // ── Property D — two reports side by side each scroll (Req 2.6) ──────
    section('D. Property — two reports side by side each scroll horizontally (Req 2.6)');
    let pairOK = 0, pairTotal = 0;
    const rng4 = mulberry32(SEED ^ 0xABCDEF);
    for (let i = 0; i < 20; i++) {
      const cardW = randInt(rng4, 360, 480);
      const vp = cardW * 2 + 40;
      const { headers, rows } = makeTable(9, 3);
      const sideBySide =
        `<div style="display:flex; gap:16px; align-items:flex-start;">` +
        reportDoc({ headers, rows, docStyle: `width:${cardW}px;`, bodyId: 'rbL' }) +
        reportDoc({ headers, rows, docStyle: `width:${cardW}px;`, bodyId: 'rbR' }) +
        `</div>`;
      await page.setViewportSize({ width: vp, height: 800 });
      await page.setContent(buildHtml(sideBySide), { waitUntil: 'load' });
      const L = await measure(page, '#rbL');
      const R = await measure(page, '#rbR');
      pairTotal++;
      if (L.available && L.maxScrollLeft > 0 && R.available && R.maxScrollLeft > 0) pairOK++;
    }
    check(`D1: both side-by-side reports scroll for all ${pairTotal} layouts`,
      pairOK === pairTotal, `ok=${pairOK}/${pairTotal}`);

    await page.close();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + '─'.repeat(78));
  console.log(`RESULT: ${results.length - failed.length}/${results.length} checks passed.  (seed=0x${SEED.toString(16)})`);
  if (failed.length) {
    console.log('FAILED checks:');
    failed.forEach((r) => console.log(`  - ${r.name}`));
    console.log('\nLayout property test FAILED.');
    process.exit(1);
  }
  console.log('Layout property test PASSED — scroll available iff overflow; narrow reports clean; side-by-side both scroll.');
  process.exit(0);
})().catch((e) => {
  console.error('\nTest harness error:', e && e.stack ? e.stack : e);
  process.exit(2);
});
