// ─── journalFilters.js ────────────────────────────────────────────────────────
// Shared utilities for filtering journals by month/period

export const MONTHS = [
  { value: 'jan', label: 'Januari',  yearMonth: '2026-01', num: 1, isAudit: true },
  { value: 'feb', label: 'Februari', yearMonth: '2026-02', num: 2, isAudit: true },
  { value: 'mar', label: 'Maret',    yearMonth: '2026-03', num: 3, isAudit: true },
  { value: 'apr', label: 'April',    yearMonth: '2026-04', num: 4, isAudit: true },
  { value: 'mei', label: 'Mei',      yearMonth: '2026-05', num: 5 },
  { value: 'jun', label: 'Juni',     yearMonth: '2026-06', num: 6 },
  { value: 'jul', label: 'Juli',     yearMonth: '2026-07', num: 7 },
  { value: 'agt', label: 'Agustus',  yearMonth: '2026-08', num: 8 },
  { value: 'sep', label: 'September',yearMonth: '2026-09', num: 9 },
  { value: 'okt', label: 'Oktober',  yearMonth: '2026-10', num: 10 },
  { value: 'nov', label: 'November', yearMonth: '2026-11', num: 11 },
  { value: 'des', label: 'Desember', yearMonth: '2026-12', num: 12 },
]

// Multi-month period presets for BUMD reporting
export const PERIOD_PRESETS = [
  { value: 'tw1', label: 'TW I', months: [1,2,3], lastMonth: '2026-03' },
  { value: 'tw2', label: 'TW II', months: [4,5,6], lastMonth: '2026-06' },
  { value: 'tw3', label: 'TW III', months: [7,8,9], lastMonth: '2026-09' },
  { value: 'tw4', label: 'TW IV', months: [10,11,12], lastMonth: '2026-12' },
  { value: 's1', label: 'Semester I', months: [1,2,3,4,5,6], lastMonth: '2026-06' },
  { value: 's2', label: 'Semester II', months: [7,8,9,10,11,12], lastMonth: '2026-12' },
  { value: 'tahun', label: 'Tahunan', months: [1,2,3,4,5,6,7,8,9,10,11,12], lastMonth: '2026-12' },
]

/** Convert a period value ('jan','apr','tw1','s1','tahun') to a "YYYY-MM" string (last month of range) */
export function periodValueToYearMonth(value) {
  const m = MONTHS.find(m => m.value === value)
  if (m) return m.yearMonth
  const p = PERIOD_PRESETS.find(p => p.value === value)
  if (p) return p.lastMonth
  return '2026-04'
}

/** Convert a period value to a human-readable label */
export function periodValueToLabel(value) {
  const m = MONTHS.find(m => m.value === value)
  if (m) return m.label
  const p = PERIOD_PRESETS.find(p => p.value === value)
  if (p) return p.label
  return 'April'
}

/** Get the months array for a period value (single month or multi-month preset) */
export function periodValueToMonths(value) {
  const m = MONTHS.find(m => m.value === value)
  if (m) return [m.num]
  const p = PERIOD_PRESETS.find(p => p.value === value)
  if (p) return p.months
  return [4]
}

/** Filter journals to only those IN the given period (single month or multi-month) */
export function filterJournalsByPeriod(journals, periodValue) {
  const months = periodValueToMonths(periodValue)
  return (journals || []).filter(j => {
    if (!j.tanggal) return false
    const jm = parseInt(j.tanggal.split('-')[1], 10)
    return months.includes(jm)
  })
}

/** Filter journals to only those IN the given month (YYYY-MM) */
export function filterJournalsByMonth(journals, yearMonth) {
  if (!yearMonth) return journals
  return (journals || []).filter(j => j.tanggal && j.tanggal.startsWith(yearMonth))
}

/** Filter journals Year-To-Date up to and including the given month */
export function filterJournalsYTD(journals, yearMonth) {
  if (!yearMonth) return journals
  const [year, mon] = yearMonth.split('-').map(Number)
  return (journals || []).filter(j => {
    if (!j.tanggal) return false
    const [jy, jm] = j.tanggal.split('-').map(Number)
    return jy === year && jm <= mon
  })
}

/** Get the previous month's yearMonth string */
export function getPrevYearMonth(yearMonth) {
  const [year, mon] = yearMonth.split('-').map(Number)
  if (mon === 1) return `${year - 1}-12`
  return `${year}-${String(mon - 1).padStart(2, '0')}`
}

/**
 * Compute the net balance of a COA account from journals (YTD),
 * adding saldo_awal (opening balance).
 */
export function computeAccountBalance(code, journals, saldoAwal = 0, normalBalance = 'D') {
  let debit = 0, kredit = 0
  journals.forEach(j => {
    const dCode = j.akun_debit?.split(' ')[0]
    const kCode = j.akun_kredit?.split(' ')[0]
    if (dCode === code || (dCode && dCode.startsWith(code + '.'))) debit += (j.debit || 0)
    if (kCode === code || (kCode && kCode.startsWith(code + '.'))) kredit += (j.kredit || 0)
  })
  const movement = normalBalance === 'D' ? (debit - kredit) : (kredit - debit)
  return saldoAwal + movement
}
