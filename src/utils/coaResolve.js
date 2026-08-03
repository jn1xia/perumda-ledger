// coaResolve.js
// Account-code resolution for journal import / mapping.
//
// Rule (per business requirement): an imported journal line is matched to the
// Chart of Accounts by EITHER its code OR its name (description).
//   1. If the line's code exists in the COA  → use that code (as-is).
//   2. Else if the line's NAME matches an existing COA account → use that
//      account's code (e.g. code "52000" not found, but name
//      "Beban Pokok Penjualan (Gas LPG)" matches existing 51001 → map to 51001).
//   3. Else → the account is genuinely unknown (flag it / leave code as-is).

/** Normalize an account name for tolerant matching (case + whitespace). */
export function normalizeName(name) {
  return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Build a lookup index from a list of COA accounts ({ code, name }).
 * Returns { codeSet, nameToCode }.
 */
export function buildCoaIndex(coaAccounts = []) {
  const codeSet = new Set()
  const nameToCode = new Map()
  const codeToName = new Map()
  for (const a of coaAccounts || []) {
    const code = String(a?.code ?? '').trim()
    if (!code) continue
    codeSet.add(code)
    const nk = normalizeName(a?.name)
    if (nk) codeToName.set(code, String(a.name))
    // First code wins for a given name (COA codes are ordered ascending on load,
    // so the canonical/lowest code is preferred when names collide).
    if (nk && !nameToCode.has(nk)) nameToCode.set(nk, code)
  }
  return { codeSet, nameToCode, codeToName }
}

/**
 * COA codes whose NAME plausibly describes `name`.
 *
 * Exact normalized match wins. Otherwise accept a prefix relation in either
 * direction, because the division's sheets routinely abbreviate or extend the
 * official name — "Bank Kalsel" for "Bank Kalsel - 3204661684", or "Persediaan
 * Barang Dagang (Bapok dan Gerai Inflasi)" for "Persediaan Barang Dagang".
 * Without that tolerance the real mis-codings hide among dozens of harmless
 * wording differences.
 */
export function nameMatches(a, b) {
  const x = normalizeName(a), y = normalizeName(b)
  if (!x || !y) return false
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  // Guard against runaway prefixes: the COA contains stub headers like "BEBAN"
  // (50000) that would otherwise "match" every expense name in the book. Demand
  // a substantial, and substantially overlapping, prefix.
  if (short.length < 8) return false
  if (short.length / long.length < 0.4) return false
  return long.startsWith(short)
}

export function coaCodesForName(name, index) {
  const nk = normalizeName(name)
  if (!nk || !index) return []
  const exact = index.nameToCode.get(nk)
  if (exact) return [exact]
  const hits = []
  for (const [coaName, code] of index.nameToCode) {
    if (nameMatches(nk, coaName)) hits.push(code)
  }
  return hits
}

/** True when `a` and `b` sit on the same branch (one code prefixes the other). */
function sameBranch(a, b) {
  const x = String(a), y = String(b)
  return x === y || x.startsWith(y) || y.startsWith(x)
}

/**
 * Rows where the account CODE and the account NAME disagree — the defect class
 * that silently corrupts reports, because every report keys off the CODE while
 * the division reads the NAME. `resolveLineCode` cannot catch it: rule 1 accepts
 * any code that merely EXISTS in the COA, so "61070 Peralatan" imports happily
 * even though 61070 is "Beban Perlengkapan dan Pemeliharaan Kantor" and the real
 * Peralatan account is 12204.1.
 *
 * A row is reported only when its name points at a DIFFERENT branch of the COA.
 * A suggestion on the same branch (e.g. name matches group "42" while the code
 * is its posting child "42000") is a wording artefact, not an error.
 *
 * @returns [{ tanggal, keterangan, code, codeName, rowName, suggestions, debit, kredit }]
 */
export function findCoaConflicts(entries, index) {
  if (!index) return []
  const out = []
  for (const entry of entries || []) {
    for (const l of (Array.isArray(entry?.lines) ? entry.lines : [])) {
      const code = String(l?.akun_code ?? '').trim()
      const rowName = String(l?.akun_name ?? '').trim()
      if (!code || !rowName) continue
      if (!index.codeSet.has(code)) continue   // unknown code → already flagged elsewhere
      const codeName = index.codeToName.get(code) || ''
      // The row already describes its own account — nothing to report, even when
      // another account happens to share the name (the COA has real duplicates,
      // e.g. 11200/11201 both "Piutang Usaha").
      if (nameMatches(rowName, codeName)) continue
      const candidates = coaCodesForName(rowName, index).filter(c => !sameBranch(c, code))
      if (candidates.length === 0) continue
      out.push({
        tanggal: entry.tanggal || '',
        keterangan: l.keterangan || entry.keterangan || '',
        code,
        codeName,
        rowName,
        suggestions: candidates.map(c => ({ code: c, name: index.codeToName.get(c) || '' })),
        debit: Number(l.debit) || 0,
        kredit: Number(l.kredit) || 0,
      })
    }
  }
  return out
}

/**
 * Resolve the effective COA code for a single line.
 * @returns { code, matchedBy } where matchedBy is 'code' | 'name' | 'none'.
 */
export function resolveLineCode(line, index) {
  const rawCode = String(line?.akun_code ?? '').trim()
  if (!index) return { code: rawCode, matchedBy: rawCode ? 'code' : 'none' }
  if (rawCode && index.codeSet.has(rawCode)) return { code: rawCode, matchedBy: 'code' }
  const nk = normalizeName(line?.akun_name)
  if (nk && index.nameToCode.has(nk)) return { code: index.nameToCode.get(nk), matchedBy: 'name' }
  return { code: rawCode, matchedBy: 'none' }
}

const acctStr = (l) =>
  l ? `${l.akun_code} - ${l.akun_name}${l.sub_akun ? ' > ' + l.sub_akun : ''}`.trim() : ''

/**
 * Return a copy of a parsed journal entry with every line's akun_code resolved
 * against the COA (by code, then by name). The akun_debit / akun_kredit summary
 * strings are rebuilt from the first resolved debit / credit line so the posted
 * journal and report mapping stay consistent.
 */
export function remapEntryAccounts(entry, index) {
  if (!entry || !Array.isArray(entry.lines)) return entry
  const lines = entry.lines.map(l => {
    const { code } = resolveLineCode(l, index)
    return code === l.akun_code ? l : { ...l, akun_code: code }
  })
  const firstD = lines.find(l => (Number(l.debit) || 0) > 0)
  const firstK = lines.find(l => (Number(l.kredit) || 0) > 0)
  return {
    ...entry,
    lines,
    akun_debit: firstD ? acctStr(firstD) : entry.akun_debit,
    akun_kredit: firstK ? acctStr(firstK) : entry.akun_kredit,
  }
}

/** Apply remapEntryAccounts to a list of entries. */
export function remapEntries(entries, index) {
  return (entries || []).map(e => remapEntryAccounts(e, index))
}
