// subAkunRegistry.js — Sub Akun overrides chosen by the SPV in Data Induk.
//
// A Sub Akun row may carry `report_code`: read the line on that account in the
// reports ("Listrik Pasar Hanyar" under 61050 → 51002 Beban Pokok Listrik).
// lraOutline.reportLineAccount consults this first. Only journals dated from
// the start of daily bookkeeping (bookYear.dailyBookStart) take an override,
// so nothing the SPV sets can move an earlier number. AppContext fills the
// registry when the Sub Akun list loads.
import { DAILY_BOOK_START_DEFAULT } from './bookYear.js'

let byKey = new Map()
let nameOf = () => ''
let fromDate = DAILY_BOOK_START_DEFAULT

const keyOf = (code, sub) => `${String(code || '').trim()}|${String(sub || '').trim().toLowerCase()}`

/** Replace the overrides with the active rows that name a report account. */
export function setSubAkunOverrides(rows, coaName, from = DAILY_BOOK_START_DEFAULT) {
  const next = new Map()
  for (const r of rows || []) {
    if (!r || !r.report_code) continue
    if (r.active !== undefined && r.active !== null && !Number(r.active)) continue
    next.set(keyOf(r.account_code, r.name), String(r.report_code).trim())
  }
  byKey = next
  nameOf = typeof coaName === 'function' ? coaName : () => ''
  fromDate = /^\d{4}-\d{2}-\d{2}$/.test(String(from || '')) ? String(from) : DAILY_BOOK_START_DEFAULT
}

/** { code, name } of the account a line is read on, or null (no override / before the start). */
export function overrideFor(code, sub, tanggal) {
  if (String(tanggal || '') < fromDate) return null
  const to = byKey.get(keyOf(code, sub))
  return to ? { code: to, name: nameOf(to) || '' } : null
}
