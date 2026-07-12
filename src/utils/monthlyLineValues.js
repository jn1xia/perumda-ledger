// Per-month report-line values for the Laporan "Anggaran" detail tabs
// (Penerimaan / Beban Umum / Beban Operasional / Beban Investasi + rekaps).
//
// A month's figures come from its audited monthly snapshot (report_laba_rugi /
// report_neraca, + user JV-/JRN- journal deltas) whenever one exists — the same
// "laporan bulanan feeds the recap" mechanism the finance division uses — and
// from posted journals only for journal-driven months (period mode 'jurnal' or
// no snapshot). Summing raw journals across audited months double-counted the
// baseline aggregates (e.g. Beban Umum Lainnya showed milyaran) and showed
// Rp 0 for months whose book exists only as a snapshot (Mei).
import { useEffect, useMemo, useState } from 'react'
import { apiGetRefLabaRugi, apiGetRefNeraca } from '../services/api.js'
import { hasReportValues } from './reportSnapshot.js'
import { normLabel, deltaJournals, buildLabaRugiRows } from './reportDelta.js'
import lrAlias from './lrAlias.json'

const ymOf = (m) => `2026-${String(m).padStart(2, '0')}`

export const journalsOfMonth = (journals, m) =>
  (journals || []).filter(j => j.tanggal && parseInt(String(j.tanggal).split('-')[1], 10) === m)

// Fetch the monthly snapshots for months 1..maxMonth. Months explicitly in
// 'jurnal' mode return [] no matter what rows linger (kendala 07-07-2026).
function useMonthlySnapshots(apiFn, maxMonth, periodModes) {
  const [snaps, setSnaps] = useState({})
  const key = maxMonth + '|' + JSON.stringify(periodModes || {})
  useEffect(() => {
    let cancelled = false
    const months = Array.from({ length: maxMonth }, (_, i) => i + 1)
    Promise.all(months.map(m => apiFn(ymOf(m)).catch(() => [])))
      .then(rs => {
        if (cancelled) return
        const o = {}
        months.forEach((m, i) => {
          const jurnalMode = periodModes && periodModes[ymOf(m)] === 'jurnal'
          o[m] = jurnalMode ? [] : (Array.isArray(rs[i]) ? rs[i] : [])
        })
        setSnaps(o)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return snaps
}

const sumJournalSide = (jlist, side, amtKey, codePrefix) => (jlist || []).reduce((s, j) => {
  const c = (j[side] || '').split(' ')[0]
  return s + (c && c.startsWith(codePrefix) ? (j[amtKey] || 0) : 0)
}, 0)

// Label drift across the division's monthly books: Februari titles the
// kelengkapan rows "… Pegawai Umum" / "… Pegawai Operasional" while the other
// months use "… Pegawai Kantor" / "… Pegawai" — try the variants in order.
const LR_LABEL_VARIANTS = {
  '61030': ['Beban Kelengkapan Pegawai Kantor', 'Beban Kelengkapan Pegawai Umum'],
  '62080': ['Beban Kelengkapan Pegawai', 'Beban Kelengkapan Pegawai Operasional'],
}

/**
 * Laba-Rugi line values per month.
 * `lineValue(m, code, { isRevenue })` — value of the L/R line the code aliases
 * to (audited month: snapshot + JV- delta; journal month: posted-journal sum by
 * account-code prefix — debit legs for expenses, kredit legs for revenue).
 */
export function useMonthlyLrLineValues(maxMonth, periodModes, journals) {
  const snaps = useMonthlySnapshots(apiGetRefLabaRugi, maxMonth, periodModes)

  return useMemo(() => {
    const byMonth = {}
    for (let m = 1; m <= maxMonth; m++) {
      const snap = snaps[m]
      const mj = journalsOfMonth(journals, m)
      if (hasReportValues(snap)) {
        const labelMap = new Map()
        buildLabaRugiRows(snap, deltaJournals(mj)).forEach(r => {
          if (r.value == null) return
          const k = normLabel(r.label)
          labelMap.set(k, (labelMap.get(k) || 0) + r.value)
        })
        byMonth[m] = { source: 'snapshot', labelMap }
      } else {
        byMonth[m] = { source: 'journals', journals: mj }
      }
    }

    const lineValue = (m, code, { isRevenue = false } = {}) => {
      const e = byMonth[m]
      if (!e) return 0
      if (e.source === 'snapshot') {
        // Exact alias only — a code that shares its group alias (e.g. 61041 →
        // 61040's line) would double-count the same snapshot row. Known label
        // variants are tried in order; the FIRST label present wins (never
        // summed, they name the same line in different months).
        const labels = LR_LABEL_VARIANTS[code] || (lrAlias[code] ? [lrAlias[code]] : [])
        for (const label of labels) {
          const k = normLabel(label)
          if (e.labelMap.has(k)) return e.labelMap.get(k)
        }
        return 0
      }
      return isRevenue
        ? sumJournalSide(e.journals, 'akun_kredit', 'kredit', code)
        : sumJournalSide(e.journals, 'akun_debit', 'debit', code)
    }
    const sourceOf = (m) => (byMonth[m] ? byMonth[m].source : 'journals')
    return { lineValue, sourceOf }
  }, [snaps, journals, maxMonth])
}

// Gross fixed-asset Neraca lines per investasi tab row (akumulasi excluded).
const INVESTASI_NERACA_LABEL = {
  '12102.1': 'Bangunan',
  '12201.1': 'Kendaraan',
  '12202.1': 'Mesin',
  '12203.1': 'Instalasi Listrik',
  '12204.1': 'Peralatan',
}

/**
 * Belanja-modal (capex) per month per gross asset code — the division's Δgross
 * convention: an audited month's realization = its Neraca gross line minus the
 * previous month's (opening for Januari comes from the COA saldo awal); a
 * journal month sums its posted 12xxx.1 debits. 12300 Aset Dalam Penyelesaian
 * is NOT belanja modal (progress payments live in Arus Kas operasi).
 */
export function useMonthlyCapexValues(maxMonth, periodModes, journals, coaFlat) {
  const snaps = useMonthlySnapshots(apiGetRefNeraca, maxMonth, periodModes)

  return useMemo(() => {
    const grossOf = (rows, label) => {
      const want = normLabel(label)
      const row = (rows || []).find(r =>
        normLabel(r.label) === want && !/akumulasi/i.test(String(r.label || '')))
      return row && row.value != null ? row.value : null
    }
    const openingOf = (code) => {
      const acc = (coaFlat || []).find(a => String(a.code) === code)
      return acc ? (acc.saldoAwal ?? acc.saldo_awal ?? 0) : 0
    }

    const capexValue = (m, code) => {
      const label = INVESTASI_NERACA_LABEL[code]
      const snap = snaps[m]
      if (label && hasReportValues(snap)) {
        const cur = grossOf(snap, label)
        if (cur != null) {
          const prevSnap = m > 1 ? snaps[m - 1] : null
          const prev = m === 1
            ? openingOf(code)
            : (hasReportValues(prevSnap) ? grossOf(prevSnap, label) : null)
          if (prev != null) return cur - prev
        }
      }
      // Journal month (or no usable snapshot pair): posted debits on the code.
      return sumJournalSide(journalsOfMonth(journals, m), 'akun_debit', 'debit', code)
    }
    const sourceOf = (m) => (hasReportValues(snaps[m]) ? 'snapshot' : 'journals')
    return { capexValue, sourceOf }
  }, [snaps, journals, maxMonth, coaFlat])
}
