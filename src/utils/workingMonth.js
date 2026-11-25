// workingMonth.js — the one month the daily-bookkeeping screens work on, and
// how they write dates ("14 Jan 2027", never "2/1/2026").
// Spec: docs/superpowers/specs/2026-11-25-daily-bookkeeping-plan.md §5.1.
import { DAILY_BOOK_START_DEFAULT } from './bookYear.js'

const BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const BULAN_PENDEK = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** '2027-01-14' → '14 Jan 2027'; '-' when there is no date. */
export function formatTanggal(tanggal) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(tanggal || ''))
  return m ? `${m[3]} ${BULAN_PENDEK[Number(m[2])]} ${m[1]}` : '-'
}

/** '2027-01' → 'Januari 2027'. */
export function bulanLabel(ym) {
  const m = /^(\d{4})-(\d{2})/.exec(String(ym || ''))
  return m ? `${BULAN[Number(m[2])]} ${m[1]}` : ''
}

const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** The calendar month of `now`. */
export function defaultWorkingMonth(now = new Date()) {
  return ymOf(now)
}

/** Locked months as the server enforces them: 'YYYY-MM' entries only. */
export function normalizeLocked(lockedPeriods) {
  return (lockedPeriods || [])
    .map(p => (p && typeof p === 'object') ? p.period : p)
    .filter(p => /^\d{4}-\d{2}$/.test(String(p || '')))
}

/**
 * Months to choose from: January 2026 through December of the year after
 * `now`. state: 'dikunci' (locked), 'dari Excel' (before the month daily
 * bookkeeping starts, or a lampiran month), 'terbuka'.
 */
export function monthOptions({ now = new Date(), lockedPeriods = [], periodModes = {}, startDate = DAILY_BOOK_START_DEFAULT } = {}) {
  const locked = new Set(normalizeLocked(lockedPeriods))
  const startMonth = String(startDate || DAILY_BOOK_START_DEFAULT).slice(0, 7)
  const out = []
  const lastYear = now.getFullYear() + 1
  for (let y = 2026; y <= lastYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const value = `${y}-${String(m).padStart(2, '0')}`
      const state = locked.has(value) ? 'dikunci'
        : (value < startMonth || periodModes[value] === 'audited') ? 'dari Excel'
        : 'terbuka'
      out.push({ value, label: bulanLabel(value), state })
    }
  }
  return out
}
