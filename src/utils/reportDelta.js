/**
 * reportDelta.js
 *
 * "Baseline + delta" support for the official Excel-snapshot reports
 * (Neraca, Laba Rugi, Arus Kas, LRA) for the audited months Jan–Apr 2026.
 *
 * Those reports render a frozen Excel snapshot so they always match the
 * official lampiran exactly. The downside is that a journal the user enters
 * after the import was NOT reflected. To fix that without losing the exact
 * Excel baseline, we treat user-entered journals as a DELTA that is layered
 * on top of the Excel figures.
 *
 * A journal counts as a user "delta" entry when its id is NOT part of the
 * original Excel/seed import. Imported journals use prefixes XL-, SUM-, ADJ-,
 * CAS-; journals created through the app use JV- / JRN-.
 */

import { expandJournals } from './journalExpand.js'

const DELTA_ID_RE = /^(JV|JRN)-/i

/** True when a journal was entered by the user (not part of the Excel import). */
export function isDeltaJournal(j) {
  return DELTA_ID_RE.test(String(j?.id || ''))
}

/**
 * Posted, expanded, user-entered journals. Pass already-period-filtered
 * journals to keep the same period scope as the report (YTD vs MTD).
 */
export function deltaJournals(journals) {
  const delta = (journals || []).filter(j => isDeltaJournal(j) && (j.status === 'posted' || j.status === undefined))
  return expandJournals(delta)
}

/**
 * Net movement for accounts whose code starts with `prefix`.
 * isDebit=true  -> debit-normal accounts (assets, expenses): debit − kredit
 * isDebit=false -> credit-normal accounts (liab, equity, revenue): kredit − debit
 * Reversals on the opposite side are netted out.
 */
export function deltaByPrefix(expandedDelta, prefix, isDebit) {
  return (expandedDelta || []).reduce((sum, j) => {
    const primaryCode = (isDebit ? j.akun_debit : j.akun_kredit)?.split(' ')[0] || ''
    const primaryAmt = isDebit ? (j.debit || 0) : (j.kredit || 0)
    const offsetCode = (isDebit ? j.akun_kredit : j.akun_debit)?.split(' ')[0] || ''
    const offsetAmt = isDebit ? (j.kredit || 0) : (j.debit || 0)
    let s = sum
    if (primaryCode.startsWith(prefix)) s += primaryAmt
    if (offsetCode.startsWith(prefix)) s -= offsetAmt
    return s
  }, 0)
}

/** Net cash (111/112) movement: +inflow (debit) − outflow (kredit). */
export function deltaCash(expandedDelta) {
  return (expandedDelta || []).reduce((sum, j) => {
    const dc = (j.akun_debit || '').split(' ')[0]
    const kc = (j.akun_kredit || '').split(' ')[0]
    let s = sum
    if (dc.startsWith('111') || dc.startsWith('112')) s += (j.debit || 0)
    if (kc.startsWith('111') || kc.startsWith('112')) s -= (j.kredit || 0)
    return s
  }, 0)
}

/** Net delta per account NAME (lower-cased, trimmed) for best-effort line matching. */
export function deltaByName(expandedDelta) {
  const map = {}
  const add = (acctStr, amt, sign) => {
    if (!acctStr || !amt) return
    // strip leading "code " and any " > sub"
    let name = acctStr.replace(/^\S+\s*-?\s*/, '').split(' > ')[0].trim()
    if (!name) name = acctStr.trim()
    const key = name.toLowerCase()
    map[key] = (map[key] || 0) + sign * amt
  }
  ;(expandedDelta || []).forEach(j => {
    // debit-normal vs credit-normal decided by code prefix
    const dCode = (j.akun_debit || '').split(' ')[0]
    const kCode = (j.akun_kredit || '').split(' ')[0]
    // Aset(1) & beban(5,6,8): debit increases. Kewajiban(2)/ekuitas(3)/pendapatan(4,7): kredit increases.
    if (j.debit) add(j.akun_debit, j.debit, /^[1568]/.test(dCode) ? +1 : -1)
    if (j.kredit) add(j.akun_kredit, j.kredit, /^[2347]/.test(kCode) ? +1 : -1)
  })
  return map
}

/**
 * Overlay name-matched deltas onto a copy of Excel ref rows ({ label, value }).
 * Only leaf rows (numeric value, not a JUMLAH/section header) are matched.
 * Returns { rows, matched } where matched is the total delta that hit a row.
 */
export function overlayByName(refRows, nameMap) {
  let matched = 0
  const used = {}
  const rows = (refRows || []).map(r => {
    const label = String(r.label || '')
    const upper = label.toUpperCase()
    const isTotalish = upper.includes('JUMLAH') || upper.includes('JUMAH') || upper.startsWith('LABA') || upper.includes('EBITDA')
    if (r.value == null || isTotalish) return { ...r }
    const key = label.toLowerCase().trim()
    if (nameMap[key] != null && !used[key]) {
      used[key] = true
      matched += nameMap[key]
      return { ...r, value: r.value + nameMap[key], _delta: nameMap[key] }
    }
    return { ...r }
  })
  return { rows, matched, used }
}

export const fmtSigned = (n, formatRupiah) =>
  (n >= 0 ? '+' : '−') + formatRupiah(Math.abs(n))
