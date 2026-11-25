// bookYear.js — which journals the 2026 report pages may see.
//
// The report pages built in 2026 (Laporan, LRA, NPD, Buku Besar, Dashboard …)
// pick journals by MONTH NUMBER only in several places (LRA.jsx, NPDReport.jsx,
// LabaRugiReports.jsx, journalFilters.js). Once vouchers are typed for 2027, a
// January 2027 entry would be counted in January 2026. AppContext therefore
// hands those pages `state.journals` = the books up to LEGACY_BOOK_YEAR, and the
// daily-bookkeeping screens read every year from `state.journalsAll`.
// Spec: docs/superpowers/specs/2026-11-25-daily-bookkeeping-plan.md §5.8.

/** The year the existing report pages are built for. */
export const LEGACY_BOOK_YEAR = 2026

/** Year of a 'YYYY-MM-DD' date, or null. */
export function yearOf(tanggal) {
  const m = /^(\d{4})-\d{2}/.exec(String(tanggal || ''))
  return m ? Number(m[1]) : null
}

/** Journals of LEGACY_BOOK_YEAR and earlier (undated rows stay, as before). */
export function legacyView(journals) {
  return (journals || []).filter(j => {
    const y = yearOf(j && j.tanggal)
    return y == null || y <= LEGACY_BOOK_YEAR
  })
}
