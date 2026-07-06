#!/usr/bin/env node
/* eslint-disable */
/**
 * compare_db_vs_ref2.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads the June 2026 report SNAPSHOT and the posted June JV-/JRN- journals from
 * a given SQLite DB (DB_PATH), then renders the APP-VISIBLE reports two ways
 * using the REAL shipped modules (src/utils/reportDelta.js + lraOutline.js):
 *
 *   snapshot-only            (no deltas)            → what the report stores
 *   snapshot + JV/JRN deltas (live overlay)         → what the app shows
 *
 * and compares BOTH to the official audited "(2)" lampiran, line-by-line within
 * Rp 1, across every grouping the user listed:
 *   Laporan Keuangan: Neraca, Laba Rugi, Arus Kas
 *   LRA: Penerimaan, Beban Umum, Beban Operasional, Investasi
 *
 * Read-only against the DB. Reuses the EXACT math from set_baseline_minus_template.cjs.
 *
 *   DB_PATH=/tmp/prod.db node scripts/compare_db_vs_ref2.cjs
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const setter = require('./set_baseline_minus_template.cjs');

const PERIOD = '2026-06';
const BULAN = 6;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'perumda_ledger.db');
const TOL = 1;
const approx = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) <= TOL;
const rupiah = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString('id-ID'));

function dbAll(file, sql, p = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY);
    db.all(sql, p, (e, r) => { db.close(); e ? reject(e) : resolve(r || []); });
  });
}

// Reconstruct journal objects (with their `lines` JSON) exactly as the server
// would hand them to the report overlay, so expandJournals behaves identically.
async function loadJvJournals(file) {
  const rows = await dbAll(file,
    `SELECT id, tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, lines
       FROM journals
      WHERE substr(tanggal,1,7)=? AND status='posted' AND (id LIKE 'JV-%' OR id LIKE 'JRN-%')
      ORDER BY id`, [PERIOD]);
  return rows.map(r => ({ ...r }));
}

async function loadSnapshot(file) {
  const neraca = await dbAll(file, "SELECT sort_order AS 'order', label, value, depth FROM report_neraca WHERE period=? ORDER BY sort_order", [PERIOD]);
  const labaRugi = await dbAll(file, "SELECT sort_order AS 'order', label, value, depth FROM report_laba_rugi WHERE period=? ORDER BY sort_order", [PERIOD]);
  const arusKas = await dbAll(file, "SELECT sort_order AS 'order', label, value, is_section AS isSection FROM report_arus_kas WHERE period=? ORDER BY sort_order", [PERIOD]);
  const lra = {};
  for (const { kategori } of setter.LRA_CATS) {
    const rows = await dbAll(file, "SELECT nama AS outline, bulan_ini AS bulanIni FROM anggaran WHERE kategori=? AND bulan=? AND is_total=0", [kategori, BULAN]);
    lra[kategori] = rows;
  }
  return { neraca, labaRugi, arusKas, lra };
}

// Compare a set of rendered rows against the (2) reference rows.
function cmpRows(refRows, builtRows) {
  const built = builtRows.filter(r => !r._unmapped);
  const diffs = [];
  let unmapped = builtRows.filter(r => /Belum Terpetakan/i.test(String(r.label || '')));
  const n = Math.max(built.length, refRows.length);
  if (built.length !== refRows.length) diffs.push(`row-count ${built.length} vs (2) ${refRows.length}`);
  for (let i = 0; i < Math.min(built.length, refRows.length); i++) {
    if (refRows[i].value == null && built[i].value == null) continue;
    if (!approx(built[i].value, refRows[i].value)) {
      diffs.push(`"${refRows[i].label}": got ${rupiah(built[i].value)} vs (2) ${rupiah(refRows[i].value)} (Δ ${rupiah((built[i].value || 0) - (refRows[i].value || 0))})`);
    }
  }
  return { diffs, unmapped };
}

function neracaBalanced(rows) {
  const find = (re) => { const r = rows.find(x => re.test(String(x.label))); return r ? r.value : undefined; };
  const aset = find(/^JUMLAH ASET$/i);
  const ke = find(/JUMLAH KEWAJIBAN DAN EKUITAS/i);
  return { ok: aset != null && ke != null && approx(aset, ke), aset, ke };
}

function renderLra(baselineRows, deltaMap) {
  const out = {};
  for (const r of baselineRows) out[String(r.outline)] = (Number(r.bulanIni) || 0) + (deltaMap[String(r.outline)] || 0);
  return out;
}

function cmpLra(refRows, renderedMap) {
  const diffs = [];
  for (const r of refRows) {
    const got = renderedMap[String(r.outline)];
    if (got == null) { diffs.push(`outline ${r.outline} "${r.nama}": MISSING in DB snapshot`); continue; }
    if (!approx(got, r.bulanIni)) diffs.push(`outline ${r.outline} "${r.nama}": got ${rupiah(got)} vs (2) ${rupiah(r.bulanIni)} (Δ ${rupiah((got || 0) - (r.bulanIni || 0))})`);
  }
  return diffs;
}

(async () => {
  const mode = process.argv[2] || 'both'; // 'both' prints snapshot-only and snapshot+delta
  console.log('═'.repeat(78));
  console.log(` COMPARE DB vs "(2)"   DB_PATH=${DB_PATH}`);
  console.log('═'.repeat(78));

  const mods = await setter.loadModules();
  const { RD, JE, LO } = mods;
  const ref2 = setter.loadRef2();
  const snap = await loadSnapshot(DB_PATH);
  const jvJournals = await loadJvJournals(DB_PATH);
  const legs = JE.expandJournals(jvJournals);
  console.log(` Snapshot rows: Neraca=${snap.neraca.length} LR=${snap.labaRugi.length} AK=${snap.arusKas.length} | LRA pen=${snap.lra.penerimaan.length} bu=${snap.lra.bebanUmum.length} inv=${snap.lra.bebanInvestasi.length} ops=${snap.lra.bebanOperasional.length}`);
  console.log(` JV/JRN June journals: ${jvJournals.length} → ${legs.length} legs`);
  console.log(` (2) rows: Neraca=${ref2.neraca.length} LR=${ref2.labaRugi.length} AK=${ref2.arusKas.length} | LRA pen=${ref2.lra.penerimaan.length} bu=${ref2.lra.bebanUmum.length} inv=${ref2.lra.bebanInvestasi.length} ops=${ref2.lra.bebanOperasional.length}`);

  const LRA_LABEL = { penerimaan: 'LRA Penerimaan', bebanUmum: 'LRA Beban Umum', bebanInvestasi: 'LRA Investasi', bebanOperasional: 'LRA Beban Operasional' };

  function block(title, withDelta) {
    console.log(`\n${'─'.repeat(78)}\n ${title}\n${'─'.repeat(78)}`);
    const j = withDelta ? legs : [];
    const results = [];
    const push = (name, diffs, extra) => {
      const ok = diffs.length === 0;
      results.push({ name, ok, diffs, extra });
      console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(22)} ${ok ? 'MATCHES (2) within Rp 1' : diffs.length + ' differing line(s)' }${extra ? '  ' + extra : ''}`);
      if (!ok) diffs.slice(0, 6).forEach(d => console.log(`        - ${d}`));
    };

    const nBuilt = RD.buildNeracaRows(snap.neraca, j);
    const nRes = cmpRows(ref2.neraca, nBuilt);
    const bal = neracaBalanced(nBuilt);
    push('Neraca', nRes.diffs, `[balanced=${bal.ok ? 'YES' : 'NO'} aset=${rupiah(bal.aset)} k+e=${rupiah(bal.ke)}]` + (nRes.unmapped.length ? ` UNMAPPED:${nRes.unmapped.length}` : ''));

    const lrRes = cmpRows(ref2.labaRugi, RD.buildLabaRugiRows(snap.labaRugi, j));
    push('Laba Rugi', lrRes.diffs, lrRes.unmapped.length ? `UNMAPPED:${lrRes.unmapped.length}` : '');

    const akRes = cmpRows(ref2.arusKas, RD.buildArusKasRows(snap.arusKas, j));
    push('Arus Kas', akRes.diffs);

    for (const { kategori } of setter.LRA_CATS) {
      const dmap = withDelta ? setter.computeLraDelta(kategori, legs, LO) : {};
      const rendered = renderLra(snap.lra[kategori], dmap);
      const diffs = cmpLra(ref2.lra[kategori], rendered);
      push(LRA_LABEL[kategori], diffs);
    }
    return results;
  }

  let snapOnly = null, withDelta = null;
  if (mode === 'snapshot' || mode === 'both') snapOnly = block('SNAPSHOT ONLY (no deltas)  — what report tables store', false);
  if (mode === 'delta' || mode === 'both') withDelta = block('SNAPSHOT + JV/JRN DELTAS  — what the app renders', true);

  // Bottom line for the delta render (the user-facing scenario).
  if (withDelta) {
    const allOk = withDelta.every(r => r.ok);
    console.log(`\n ${allOk ? '✅' : '❌'} App-rendered (snapshot + JV deltas) ${allOk ? 'EQUALS' : 'does NOT equal'} "(2)" across all groupings.`);
    process.exit(allOk ? 0 : 1);
  }
})().catch(e => { console.error('FATAL:', e && e.stack ? e.stack : e); process.exit(2); });
