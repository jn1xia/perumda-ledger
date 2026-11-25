// useFindings — the journal findings of every stored month from FINDINGS_FROM
// (journalChecks.findingsByMonth over state.journals) plus their "sudah dicek"
// acknowledgements. Shared by the bell (TopBar) and Cek Konsistensi.
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { findingsByMonth } from '../../utils/journalChecks.js'
import { apiGetFindingAcks, apiAckFinding, apiUnackFinding } from '../../services/api.js'

const ACKS_CHANGED = 'perumda-finding-acks-changed'

export default function useFindings() {
  const { state } = useApp()
  // Every year: 2027 vouchers are checked too (state.journals is 2026 only).
  const journals = state.journalsAll || state.journals
  const coa = state.coaFlat
  const byMonth = useMemo(() => {
    try { return findingsByMonth(journals || [], { coa: coa || [] }) } catch { return {} }
  }, [journals, coa])

  // period → Map(key → note). A failed load leaves it empty: findings still show.
  const [acks, setAcks] = useState({})
  const load = useCallback(async () => {
    try {
      const rows = await apiGetFindingAcks()
      const m = {}
      for (const r of rows || []) (m[r.period] = m[r.period] || new Map()).set(r.finding_key, r.note || '')
      setAcks(m)
    } catch { /* keep what we have */ }
  }, [])
  useEffect(() => {
    load()
    const h = () => load()
    window.addEventListener(ACKS_CHANGED, h)
    return () => window.removeEventListener(ACKS_CHANGED, h)
  }, [load])

  const ack = useCallback(async (period, f, note) => {
    await apiAckFinding(period, f.key, note)
    window.dispatchEvent(new Event(ACKS_CHANGED))
  }, [])
  const unack = useCallback(async (period, f) => {
    await apiUnackFinding(period, f.key)
    window.dispatchEvent(new Event(ACKS_CHANGED))
  }, [])

  // Open = not acknowledged, severity salah or periksa (info never counts).
  const openByMonth = useMemo(() => {
    const out = {}
    for (const [ym, list] of Object.entries(byMonth)) {
      const a = acks[ym]
      const open = list.filter(f => f.severity !== 'info' && !(a && a.has(f.key)))
      if (open.length) out[ym] = open
    }
    return out
  }, [byMonth, acks])
  const openCount = Object.values(openByMonth).reduce((s, l) => s + l.length, 0)

  return { byMonth, acks, openByMonth, openCount, ack, unack }
}
