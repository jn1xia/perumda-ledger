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
  for (const a of coaAccounts || []) {
    const code = String(a?.code ?? '').trim()
    if (!code) continue
    codeSet.add(code)
    const nk = normalizeName(a?.name)
    // First code wins for a given name (COA codes are ordered ascending on load,
    // so the canonical/lowest code is preferred when names collide).
    if (nk && !nameToCode.has(nk)) nameToCode.set(nk, code)
  }
  return { codeSet, nameToCode }
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
