/*
 * fix_journal_lines_akun_code.cjs
 *
 * Kendala #1 (docs/KENDALA_SINKRONISASI_PERBAIKAN.md):
 * "Saat input jurnal di buku besar beberapa akun dan sub akun di COA tidak
 *  muncul transaksinya."
 *
 * Root cause (verified): rows in `journal_lines` carry a CORRUPTED `akun_code`
 * (e.g. "111177", "211251" all named "Kas Kecil") or an empty akun_code, while
 * `akun_name` / `sub_akun` are correct. Buku Besar (computeLedger) matches by
 * the leading code token, so these transactions never appear under their
 * account.
 *
 * This repair recovers the correct COA code from the (reliable) account NAME:
 *   1. sub_akun  exact (normalized) == coa.name        -> leaf code (most specific)
 *   2. akun_name exact (normalized) == coa.name
 *   3. directional unique prefix match (coa.name <-> akun_name)
 *   4. if still unresolved but current akun_code looks like a real 5-digit code
 *      missing from COA, keep it and ADD the COA account.
 *
 * Only rows whose akun_code is null/empty OR not present in COA are touched, so
 * the script is idempotent and safe to re-run. All affected rows belong to
 * imported XL- (audited baseline) journals, so the Excel-snapshot reports are
 * unaffected; only Buku Besar visibility is corrected.
 *
 * Run:  node fix_journal_lines_akun_code.cjs          (apply)
 *       node fix_journal_lines_akun_code.cjs --dry     (preview only)
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB = process.env.DB_PATH || path.join(__dirname, 'server', 'perumda_ledger.db');
const DRY = process.argv.includes('--dry');
const db = new sqlite3.Database(DB);

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));

// Derive a COA category from a code prefix (for any COA row we must add).
function categoryForCode(code) {
  const c = String(code);
  if (/^1/.test(c)) return 'Aset';
  if (/^2/.test(c)) return 'Kewajiban';
  if (/^3/.test(c)) return 'Ekuitas';
  if (/^4|^7/.test(c)) return 'Pendapatan';
  if (/^5/.test(c)) return 'HPP';
  return 'Beban'; // 6/8/9
}

(async () => {
  const coa = await all('SELECT code, name, category FROM coa');
  const codeSet = new Set(coa.map(c => String(c.code)));
  // name(normalized) -> [codes]
  const byName = new Map();
  for (const c of coa) {
    const k = norm(c.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(String(c.code));
  }

  // Explicit aliases for descriptive names whose COA target is ambiguous by
  // pure name matching (e.g. the parent header "5 BEBAN POKOK PENJUALAN" and
  // leaf "51000 Beban Pokok Penjualan" normalize identically). Keyed by the
  // readable name; matched on the normalized form.
  const ALIAS_RAW = {
    'Beban Pokok Penjualan (Bapok & Gerai Inflasi)': '51000',
    'Beban Pokok Penjualan (Gas LPG)': '51000',
    'Persediaan Barang Dagang (Bapok dan Gerai Inflasi)': '11401',
  };
  const ALIAS = new Map(Object.entries(ALIAS_RAW).map(([k, v]) => [norm(k), v]));

  // Resolve a single descriptive string to a unique COA code, or null.
  function resolveName(name) {
    const n = norm(name);
    if (!n) return null;
    if (ALIAS.has(n)) return ALIAS.get(n);
    // exact
    if (byName.has(n) && byName.get(n).length === 1) return byName.get(n)[0];
    // directional unique prefix (coa is prefix of name, or name is prefix of coa)
    const hits = [];
    for (const [k, codes] of byName.entries()) {
      if (codes.length !== 1) continue;
      if (k === n) continue;
      if (k.startsWith(n) || n.startsWith(k)) hits.push(codes[0]);
    }
    const uniq = [...new Set(hits)];
    return uniq.length === 1 ? uniq[0] : null;
  }

  const lines = await all(`SELECT id, journal_id, akun_code, akun_name, sub_akun FROM journal_lines`);
  const bad = lines.filter(l => {
    const c = String(l.akun_code || '');
    return !c || !codeSet.has(c);
  });

  const fixes = [];          // { id, newCode, via }
  const coaToAdd = new Map(); // code -> name
  const unresolved = [];

  for (const l of bad) {
    // 1. sub_akun exact (most specific leaf)
    let code = l.sub_akun ? resolveName(l.sub_akun) : null;
    let via = code ? 'sub_akun' : null;
    // 2. akun_name
    if (!code) { code = resolveName(l.akun_name); if (code) via = 'akun_name'; }
    // 3. current akun_code is a plausible 5-digit code missing from COA -> add it
    if (!code) {
      const cur = String(l.akun_code || '');
      if (/^\d{4,5}(\.\d+)?$/.test(cur) && !codeSet.has(cur)) {
        code = cur; via = 'add-coa';
        if (l.akun_name) coaToAdd.set(cur, l.akun_name);
      }
    }
    if (code) fixes.push({ id: l.id, journal_id: l.journal_id, oldCode: l.akun_code, newCode: code, name: l.akun_name, sub: l.sub_akun, via });
    else unresolved.push(l);
  }

  console.log(`Total journal_lines        : ${lines.length}`);
  console.log(`Bad (null/invalid akun_code): ${bad.length}`);
  console.log(`Resolved                    : ${fixes.length}`);
  console.log(`COA accounts to add         : ${coaToAdd.size}${coaToAdd.size ? ' -> ' + [...coaToAdd.keys()].join(', ') : ''}`);
  console.log(`Unresolved                  : ${unresolved.length}`);
  if (unresolved.length) {
    console.log('--- UNRESOLVED (left untouched, need manual mapping) ---');
    unresolved.forEach(u => console.log(`  line#${u.id} ${u.journal_id} code="${u.akun_code}" name="${u.akun_name}" sub="${u.sub_akun || ''}"`));
  }

  // Summary of via-counts
  const viaCount = fixes.reduce((m, f) => (m[f.via] = (m[f.via] || 0) + 1, m), {});
  console.log('Resolution methods          :', JSON.stringify(viaCount));

  if (DRY) { console.log('\n[DRY RUN] no changes written.'); db.close(); return; }

  await run('BEGIN TRANSACTION');
  try {
    for (const [code, name] of coaToAdd.entries()) {
      await run('INSERT OR IGNORE INTO coa (code, name, type, category) VALUES (?, ?, ?, ?)',
        [code, name, 'posting', categoryForCode(code)]);
    }
    for (const f of fixes) {
      await run('UPDATE journal_lines SET akun_code = ? WHERE id = ?', [f.newCode, f.id]);
    }
    await run('COMMIT');
  } catch (e) {
    await run('ROLLBACK');
    console.error('FAILED, rolled back:', e.message);
    db.close();
    process.exit(1);
  }

  // Verify
  const remaining = await all(`
    SELECT COUNT(*) c FROM journal_lines jl LEFT JOIN coa c ON jl.akun_code = c.code
    WHERE jl.akun_code IS NULL OR jl.akun_code = '' OR c.code IS NULL`);
  console.log(`\n✅ Applied. Remaining bad journal_lines: ${remaining[0].c}`);
  db.close();
})();
