// subAkunRegistry.js — Sub Akun overrides chosen by the SPV in Data Induk.
//
// A Sub Akun row may carry `report_code`: read the line on that account in the
// reports ("Listrik Pasar Hanyar" under 61050 → 51002 Beban Pokok Listrik).
// lraOutline.reportLineAccount consults this first. Only journals dated from
// OVERRIDE_FROM take an override, so nothing the SPV sets can move a 2026
// number. AppContext fills the registry when the Sub Akun list loads.

export const OVERRIDE_FROM = '2027-01-01'

let byKey = new Map()
let nameOf = () => ''

const keyOf = (code, sub) => `${String(code || '').trim()}|${String(sub || '').trim().toLowerCase()}`

/** Replace the overrides with the active rows that name a report account. */
export function setSubAkunOverrides(rows, coaName) {
  const next = new Map()
  for (const r of rows || []) {
    if (!r || !r.report_code) continue
    if (r.active !== undefined && r.active !== null && !Number(r.active)) continue
    next.set(keyOf(r.account_code, r.name), String(r.report_code).trim())
  }
  byKey = next
  nameOf = typeof coaName === 'function' ? coaName : () => ''
}

/** { code, name } of the account a line is read on, or null (no override / before 2027). */
export function overrideFor(code, sub, tanggal) {
  if (String(tanggal || '') < OVERRIDE_FROM) return null
  const to = byKey.get(keyOf(code, sub))
  return to ? { code: to, name: nameOf(to) || '' } : null
}
