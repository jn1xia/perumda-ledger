import { Printer } from 'lucide-react'
import { printReport } from '../../utils/exportUtils.js'

const fmt = v => 'Rp ' + Math.abs(v).toLocaleString('id-ID')
const fmtSign = v => (v < 0 ? '-' : '') + fmt(v)

function ReportHeader({ title, subtitle, onPrint }) {
  return (
    <div className="report-doc-header" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div>
        <div className="company">PERUMDA PASAR BAIMAN</div>
        <h2>{title}</h2>
        <div className="period">{subtitle}</div>
      </div>
      <button className="btn btn-outline" style={{color:'white',borderColor:'rgba(255,255,255,0.5)',background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',gap:6,fontSize:13,padding:'8px 14px',borderRadius:8}} onClick={onPrint}>
        <Printer size={14} /> Cetak
      </button>
    </div>
  )
}

function RecursiveRow({ item, depth = 0, columns = 1 }) {
  const isParent = item.type === 'parent' || (item._children && item._children.length > 0)
  return (
    <>
      <tr style={{
        fontWeight: isParent ? 600 : 400,
        background: isParent && depth === 0 ? 'rgba(255,255,255,0.05)' : 'transparent',
        fontSize: isParent && depth === 0 ? 14 : 13
      }}>
        <td style={{ paddingLeft: 12 + depth * 24 }}>
          {item.code && !item.code.startsWith('HEADER') ? `${item.code} - ` : ''}{item.name || item.n}
        </td>
        {columns === 1 ? (
          <td className="text-right mono">{fmtSign(item.v)}</td>
        ) : columns === 2 ? (
          <>
            <td className="text-right mono">{fmtSign(item.mtd)}</td>
            <td className="text-right mono">{fmtSign(item.ytd)}</td>
          </>
        ) : null}
      </tr>
      {item._children && item._children.map((child, idx) => (
        <RecursiveRow key={idx} item={child} depth={depth + 1} columns={columns} />
      ))}
    </>
  )
}

// Dynamic Calculation Helper
const generateDynamicLRData = (state, journals) => {
  if (!state || !journals) return { pendapatanItems: [], bebanItems: [], totalPendapatan: 0, totalBeban: 0, labaBersih: 0 }
  
  const coaTree = state.coaTree || []
  
  // Exclude: saldo awal (opening balance) entries — these are balance sheet carry-forwards, NOT period P&L
  const posted = journals.filter(j => 
    j.status === 'posted' && 
    !(j.id || '').startsWith('SA-') &&
    !((j.keterangan || '').toLowerCase().includes('saldo awal'))
  )

  // Helper: sum journals for an account using EXACT code match
  // Prevents parent "61010" from catching sub-accounts "61011", "61012", etc.
  const getLeafAmount = (code) => {
    let d = 0, k = 0
    posted.forEach(j => {
      const matchDebit = j.akun_debit && (
        j.akun_debit === code ||
        j.akun_debit.startsWith(code + ' ') ||
        j.akun_debit.startsWith(code + '-') ||
        j.akun_debit.startsWith(code + '>')
      )
      const matchKredit = j.akun_kredit && (
        j.akun_kredit === code ||
        j.akun_kredit.startsWith(code + ' ') ||
        j.akun_kredit.startsWith(code + '-') ||
        j.akun_kredit.startsWith(code + '>')
      )
      if (matchDebit) d += j.debit
      if (matchKredit) k += j.kredit
    })
    return { d, k }
  }

  // Recursive function to build the hierarchical report data
  // KEY FIX for double-counting:
  //   When a COA parent has children AND children have nonzero totals → use ONLY children (ignore parent direct entries)
  //   When children total = 0 → fallback to parent's own direct entries (handles summary-only posting months)
  // This prevents double-counting when BOTH parent (61010: 180M) AND sub-accounts (61011: 56M + 61012: 94M + 61013: 30M = 180M) exist
  const buildHierarchicalData = (nodes, isDebitNormal) => {
    let total = 0
    const items = nodes.map(node => {
      let val = 0
      let childrenItems = []

      if (node.children && node.children.length > 0) {
        const { items: childResult, total: childTotal } = buildHierarchicalData(node.children, isDebitNormal)
        
        if (childTotal !== 0) {
          // Children have data → use children only (avoids double-counting)
          childrenItems = childResult
          val = childTotal
        } else {
          // Children empty → fallback to parent direct entries
          const { d, k } = getLeafAmount(node.code)
          val = isDebitNormal ? (node.saldo_awal || 0) + d - k : (node.saldo_awal || 0) + k - d
        }
      } else {
        // Leaf node: count direct entries with exact match
        const { d, k } = getLeafAmount(node.code)
        val = isDebitNormal ? (node.saldo_awal || 0) + d - k : (node.saldo_awal || 0) + k - d
      }
      
      total += val
      return { ...node, v: val, _children: childrenItems }
    }).filter(i => i.v !== 0 || i._children.length > 0)

    return { items, total }
  }

  const pTree = buildHierarchicalData(coaTree.filter(n => n.code.startsWith('4') || n.code.startsWith('7')), false)
  const bTree = buildHierarchicalData(coaTree.filter(n => n.code.startsWith('5') || n.code.startsWith('6') || n.code.startsWith('8') || n.code.startsWith('9')), true)

  return { 
    pendapatanItems: pTree.items, 
    bebanItems: bTree.items, 
    totalPendapatan: pTree.total, 
    totalBeban: bTree.total, 
    labaBersih: pTree.total - bTree.total 
  }
}

// --- L/R MTD/YTD ---
export function LabaRugiMTDYTD({ state, journalsMTD, journalsYTD, periodLabel }) {
  const period = periodLabel || 'Januari 2026'
  
  const mtdData = generateDynamicLRData(state, journalsMTD)
  const ytdData = generateDynamicLRData(state, journalsYTD)
  
  // Merge items to show both columns properly
  const allPendapatanCodes = [...new Set([...mtdData.pendapatanItems.map(p=>p.code), ...ytdData.pendapatanItems.map(p=>p.code)])].sort()
  const allBebanCodes = [...new Set([...mtdData.bebanItems.map(b=>b.code), ...ytdData.bebanItems.map(b=>b.code)])].sort()
  
  const getMergedItems = (codes, mtdItems, ytdItems) => {
    return codes.map(code => {
      const mItem = mtdItems.find(i => i.code === code)
      const yItem = ytdItems.find(i => i.code === code)
      return {
        code, 
        n: mItem?.n || yItem?.n,
        mtd: mItem?.v || 0,
        ytd: yItem?.v || 0
      }
    })
  }

  const mergedPendapatan = getMergedItems(allPendapatanCodes, mtdData.pendapatanItems, ytdData.pendapatanItems)
  const mergedBeban = getMergedItems(allBebanCodes, mtdData.bebanItems, ytdData.bebanItems)

  return (
    <div className="report-doc">
      <ReportHeader title="LAPORAN LABA RUGI MTD / YTD" subtitle={`Month-to-Date & Year-to-Date — ${period}`} onPrint={() => printReport('Laba Rugi MTD/YTD')} />
      <div className="report-doc-body">
        <table><thead><tr><th>Akun</th><th className="text-right">MTD (Bulan Ini)</th><th className="text-right">YTD (Tahun Berjalan)</th></tr></thead>
          <tbody>
            <tr style={{background:'var(--success-light)'}}><td style={{fontWeight:700}} colSpan={3}>PENDAPATAN</td></tr>
            {mergedPendapatan.map((p,i) => <tr key={i}><td style={{paddingLeft:32}}>{p.code} - {p.n}</td><td className="text-right mono">{fmtSign(p.mtd)}</td><td className="text-right mono">{fmtSign(p.ytd)}</td></tr>)}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Pendapatan</td><td className="text-right mono" style={{color:'var(--success)'}}>{fmtSign(mtdData.totalPendapatan)}</td><td className="text-right mono" style={{color:'var(--success)'}}>{fmtSign(ytdData.totalPendapatan)}</td></tr>
            <tr style={{height:8}}><td colSpan={3}></td></tr>
            <tr style={{background:'var(--danger-light)'}}><td style={{fontWeight:700}} colSpan={3}>BEBAN OPERASIONAL</td></tr>
            {mergedBeban.map((b,i) => <tr key={i}><td style={{paddingLeft:32}}>{b.code} - {b.n}</td><td className="text-right mono">{fmtSign(b.mtd)}</td><td className="text-right mono">{fmtSign(b.ytd)}</td></tr>)}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Beban</td><td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(mtdData.totalBeban)}</td><td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(ytdData.totalBeban)}</td></tr>
            <tr style={{height:8}}><td colSpan={3}></td></tr>
            <tr style={{fontWeight:700,background:'var(--border-light)',fontSize:15}}><td>LABA (RUGI) BERSIH</td><td className="text-right mono" style={{color: mtdData.labaBersih >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(mtdData.labaBersih)}</td><td className="text-right mono" style={{color: ytdData.labaBersih >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(ytdData.labaBersih)}</td></tr>
          </tbody></table>
      </div>
    </div>
  )
}

// --- L/R Detail ---
export function LabaRugiDetail({ state, journals, periodLabel }) {
  const period = periodLabel || 'Januari 2026'
  const { pendapatanItems, bebanItems, totalPendapatan, totalBeban, labaBersih } = generateDynamicLRData(state, journals)
  
  return (
    <div className="report-doc">
      <ReportHeader title="LAPORAN LABA RUGI DETAIL" subtitle={`Per ${period} — Rincian Sub-Akun`} onPrint={() => printReport('Laba Rugi Detail')} />
      <div className="report-doc-body">
        <table><thead><tr><th>Akun / Keterangan</th><th className="text-right">Jumlah</th></tr></thead>
          <tbody>
            <tr style={{background:'var(--success-light)'}}><td style={{fontWeight:700}} colSpan={2}>PENDAPATAN USAHA</td></tr>
            {pendapatanItems.map((p,i) => <RecursiveRow key={i} item={p} depth={0} columns={1} />)}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Pendapatan</td><td className="text-right mono" style={{color:'var(--success)'}}>{fmtSign(totalPendapatan)}</td></tr>
            <tr style={{height:16}}><td colSpan={2}></td></tr>
            
            <tr style={{background:'var(--danger-light)'}}><td style={{fontWeight:700}} colSpan={2}>BEBAN USAHA</td></tr>
            {bebanItems.map((b,i) => <RecursiveRow key={i} item={b} depth={0} columns={1} />)}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Beban</td><td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(totalBeban)}</td></tr>
            <tr style={{height:24}}><td colSpan={2}></td></tr>
            
            <tr style={{fontWeight:700,background:'var(--border-light)',fontSize:16, borderTop:'2px solid var(--border)'}}><td>LABA (RUGI) BERSIH</td><td className="text-right mono" style={{color: labaBersih >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(labaBersih)}</td></tr>
          </tbody></table>
      </div>
    </div>
  )
}

import { periodValueToMonths } from '../../utils/journalFilters.js'
import { useEffect, useState } from 'react'
import { apiGetRefLabaRugi } from '../../services/api.js'
import { deltaJournals, buildLabaRugiRows } from '../../utils/reportDelta.js'
import { expandJournals } from '../../utils/journalExpand.js'
import { hasReportValues } from '../../utils/reportSnapshot.js'

// ── Triwulan/Semester dari LAPORAN BULANAN ───────────────────────────────────
// Sesuai alur mekanisme Divisi Keuangan: laporan triwulan & semester DIAMBIL
// DARI data laporan bulanan (snapshot audited per bulan), bukan dihitung ulang
// dari jurnal. Untuk bulan audited, sheet JURNAL di lampiran bukan catatan P/L
// yang lengkap (contoh: pendapatan Mei 2026 tidak tercatat di sheet JURNAL),
// jadi kolom bulanan memakai snapshot + overlay jurnal user (JV-/JRN-) sebagai
// delta. Bulan tanpa snapshot dihitung dari jurnal posted (di-overlay ke
// kerangka label snapshot terakhir agar barisnya sejajar).
const ymOf2026 = (m) => `2026-${String(m).padStart(2, '0')}`
const journalsOfMonth = (journals, m) =>
  (journals || []).filter(j => j.tanggal && parseInt(String(j.tanggal).split('-')[1], 10) === m)

function useMonthlyLabaRugiSnapshots(months, periodModes) {
  const [snaps, setSnaps] = useState({})
  const key = months.join(',') + '|' + JSON.stringify(periodModes || {})
  useEffect(() => {
    let cancelled = false
    Promise.all(months.map(m => apiGetRefLabaRugi(ymOf2026(m)).catch(() => [])))
      .then(rs => {
        if (cancelled) return
        const o = {}
        months.forEach((m, i) => {
          // Explicit 'jurnal' mode wins over leftover snapshot rows: the month
          // is computed from journals no matter what sits in report_laba_rugi.
          const jurnalMode = periodModes && periodModes[ymOf2026(m)] === 'jurnal'
          o[m] = jurnalMode ? [] : (Array.isArray(rs[i]) ? rs[i] : [])
        })
        setSnaps(o)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return snaps
}

// Per-month source chips for the multi-month L/R views.
function MonthSourceChips({ months, snaps, monthNames }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 12px' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Sumber data per bulan:</span>
      {months.map(m => {
        const audited = hasReportValues(snaps[m])
        return (
          <span key={m} style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10,
            background: audited ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)',
            color: audited ? 'var(--success, #059669)' : 'var(--primary, #4f46e5)' }}>
            {monthNames[m] || m}: {audited ? 'snapshot audited' : 'dari jurnal'}
          </span>
        )
      })}
    </div>
  )
}

// One month's label-based rows: snapshot baseline + user-journal (JV-/JRN-)
// delta, or — when the month has no REAL snapshot (absent, or rows without
// meaningful values from a bad upload) — ALL posted journals overlaid on the
// zeroed skeleton of the nearest snapshot so labels line up across columns.
function monthColumnRows(refRows, monthJournals, skeleton) {
  if (hasReportValues(refRows)) return buildLabaRugiRows(refRows, deltaJournals(monthJournals))
  const zeroed = (skeleton || refRows || []).map(r => ({ ...r, value: r.value == null ? null : 0 }))
  return buildLabaRugiRows(zeroed, expandJournals((monthJournals || []).filter(j => j.status === 'posted')))
}

const isLrTotalLabel = (label) => {
  const u = String(label || '').toUpperCase()
  return u.includes('JUMLAH') || u.includes('JUMAH') || u.startsWith('LABA') || u.startsWith('EBITDA')
}

// Merge per-month label rows → [{ label, isTotal, isHeader, values[], total }]
function mergeLabelColumns(cols) {
  const order = []
  const idx = new Map()
  cols.forEach((rows, ci) => {
    ;(rows || []).forEach(r => {
      const label = String(r.label || '').trim()
      if (!label) return
      let e = idx.get(label)
      if (!e) {
        e = { label, isTotal: isLrTotalLabel(label), values: new Array(cols.length).fill(null) }
        idx.set(label, e)
        order.push(e)
      }
      if (r.value != null) e.values[ci] = (e.values[ci] || 0) + r.value
    })
  })
  order.forEach(e => {
    e.total = e.values.reduce((s, v) => s + (v || 0), 0)
    e.isHeader = e.values.every(v => v === null)
  })
  return order
}

const SNAPSHOT_NOTE = 'Angka bulanan diambil dari laporan bulanan (snapshot audited); jurnal yang diinput user (JV-/JRN-) ditambahkan sebagai delta. Bulan tanpa laporan bulanan dihitung dari jurnal posted.'

export function LabaRugiTriwulan({ state, journals, periodLabel, selectedPeriod }) {
  // periodValueToMonths knows EVERY selectable period (all 12 months plus
  // tw1–tw4 / s1 / s2 / tahun) — the old PERIOD_OPTIONS list stopped at June,
  // so Juli onward silently fell back to Mei and the report never updated.
  const targetMonth = Math.max(...periodValueToMonths(selectedPeriod))

  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  const label1 = monthNames[targetMonth - 2] || 'Bulan 1'
  const label2 = monthNames[targetMonth - 1] || 'Bulan 2'
  const label3 = monthNames[targetMonth] || 'Bulan 3'

  // Months in the window (oldest → newest), snapshot per month, and the newest
  // available snapshot as the label skeleton for months without one.
  const windowMonths = [targetMonth - 2, targetMonth - 1, targetMonth].filter(m => m >= 1 && m <= 12)
  const snaps = useMonthlyLabaRugiSnapshots(windowMonths, state && state.periodModes)
  const skeleton = windowMonths.map(m => snaps[m]).filter(r => r && r.length).pop() || null

  const m1Journals = journals.filter(j => new Date(j.tanggal).getMonth() + 1 === targetMonth - 2)
  const m2Journals = journals.filter(j => new Date(j.tanggal).getMonth() + 1 === targetMonth - 1)
  const m3Journals = journals.filter(j => new Date(j.tanggal).getMonth() + 1 === targetMonth)

  // ── Preferred path: build each month's column FROM the monthly report ──
  if (skeleton) {
    const cols = windowMonths.map(m => monthColumnRows(snaps[m], journalsOfMonth(journals, m), skeleton))
    const merged = mergeLabelColumns(cols)
    const disp = windowMonths.map((_, i) => i).reverse() // newest column first
    return (
      <div className="report-doc">
        <ReportHeader title="LAPORAN LABA RUGI PER 3 BULAN (TRIWULAN)" subtitle={`Periode Berakhir — ${periodLabel || ''}`} onPrint={() => printReport('Laba Rugi Triwulan')} />
        <div className="report-doc-body">
          <div style={{ background: 'var(--primary-light)', padding: '10px 16px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12, color: 'var(--primary)' }}>
            {SNAPSHOT_NOTE}
          </div>
          <MonthSourceChips months={windowMonths} snaps={snaps} monthNames={monthNames} />
          <table>
            <thead><tr>
              <th>Uraian</th>
              {disp.map(i => <th key={i} className="text-right">{monthNames[windowMonths[i]]}</th>)}
              <th className="text-right">Total Triwulan</th>
            </tr></thead>
            <tbody>
              {merged.map((r, i) => (
                <tr key={i} style={r.isHeader
                  ? { background: 'var(--bg-secondary)', fontWeight: 700 }
                  : r.isTotal ? { fontWeight: 700, borderTop: '1px solid var(--border)' } : {}}>
                  <td style={{ paddingLeft: r.isHeader || r.isTotal ? 8 : 24 }}>{r.label}</td>
                  {disp.map(ci => (
                    <td key={ci} className="text-right mono">{r.values[ci] != null ? fmtSign(r.values[ci]) : ''}</td>
                  ))}
                  <td className="text-right mono" style={{ fontWeight: 600 }}>{r.isHeader ? '' : fmtSign(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ── Fallback (no monthly report in window): compute from posted journals ──
  const m1Data = generateDynamicLRData(state, m1Journals)
  const m2Data = generateDynamicLRData(state, m2Journals)
  const m3Data = generateDynamicLRData(state, m3Journals)

  const allPendapatanCodes = [...new Set([...m1Data.pendapatanItems.map(p=>p.code), ...m2Data.pendapatanItems.map(p=>p.code), ...m3Data.pendapatanItems.map(p=>p.code)])].sort()
  const allBebanCodes = [...new Set([...m1Data.bebanItems.map(b=>b.code), ...m2Data.bebanItems.map(b=>b.code), ...m3Data.bebanItems.map(b=>b.code)])].sort()

  const getMerged = (codes, d1, d2, d3) => codes.map(code => {
    const i1 = d1.find(i => i.code === code), i2 = d2.find(i => i.code === code), i3 = d3.find(i => i.code === code)
    return { code, n: i3?.n || i2?.n || i1?.n, v1: i1?.v || 0, v2: i2?.v || 0, v3: i3?.v || 0, total: (i1?.v||0) + (i2?.v||0) + (i3?.v||0) }
  })

  const mergedPendapatan = getMerged(allPendapatanCodes, m1Data.pendapatanItems, m2Data.pendapatanItems, m3Data.pendapatanItems)
  const mergedBeban = getMerged(allBebanCodes, m1Data.bebanItems, m2Data.bebanItems, m3Data.bebanItems)

  const totalPendapatanAll = m1Data.totalPendapatan + m2Data.totalPendapatan + m3Data.totalPendapatan
  const totalBebanAll = m1Data.totalBeban + m2Data.totalBeban + m3Data.totalBeban
  const labaBersihAll = m1Data.labaBersih + m2Data.labaBersih + m3Data.labaBersih

  return (
    <div className="report-doc">
      <ReportHeader title="LAPORAN LABA RUGI PER 3 BULAN (TRIWULAN)" subtitle={`Periode Berakhir — ${periodLabel || 'Januari 2026'}`} onPrint={() => printReport('Laba Rugi Triwulan')} />
      <div className="report-doc-body">
        <table><thead><tr><th>Akun</th><th className="text-right">{label3}</th><th className="text-right">{label2}</th><th className="text-right">{label1}</th><th className="text-right">Total Triwulan</th></tr></thead>
          <tbody>
            <tr style={{background:'var(--success-light)'}}><td style={{fontWeight:700}} colSpan={5}>PENDAPATAN USAHA</td></tr>
            {mergedPendapatan.map((p,i) => (
              <tr key={i}>
                <td style={{paddingLeft:24}}>{p.code} - {p.n}</td>
                <td className="text-right mono">{fmtSign(p.v3)}</td>
                <td className="text-right mono">{fmtSign(p.v2)}</td>
                <td className="text-right mono">{fmtSign(p.v1)}</td>
                <td className="text-right mono" style={{fontWeight:600}}>{fmtSign(p.total)}</td>
              </tr>
            ))}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Pendapatan</td><td className="text-right mono">{fmtSign(m3Data.totalPendapatan)}</td><td className="text-right mono">{fmtSign(m2Data.totalPendapatan)}</td><td className="text-right mono">{fmtSign(m1Data.totalPendapatan)}</td><td className="text-right mono" style={{color:'var(--success)'}}>{fmtSign(totalPendapatanAll)}</td></tr>
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            
            <tr style={{background:'var(--danger-light)'}}><td style={{fontWeight:700}} colSpan={5}>BEBAN OPERASIONAL</td></tr>
            {mergedBeban.map((b,i) => (
              <tr key={i}>
                <td style={{paddingLeft:24}}>{b.code} - {b.n}</td>
                <td className="text-right mono">{fmtSign(b.v3)}</td>
                <td className="text-right mono">{fmtSign(b.v2)}</td>
                <td className="text-right mono">{fmtSign(b.v1)}</td>
                <td className="text-right mono" style={{fontWeight:600}}>{fmtSign(b.total)}</td>
              </tr>
            ))}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Beban</td><td className="text-right mono">{fmtSign(m3Data.totalBeban)}</td><td className="text-right mono">{fmtSign(m2Data.totalBeban)}</td><td className="text-right mono">{fmtSign(m1Data.totalBeban)}</td><td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(totalBebanAll)}</td></tr>
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            
            <tr style={{fontWeight:700,background:'var(--border-light)',fontSize:15}}><td>LABA (RUGI) BERSIH</td><td className="text-right mono">{fmtSign(m3Data.labaBersih)}</td><td className="text-right mono">{fmtSign(m2Data.labaBersih)}</td><td className="text-right mono">{fmtSign(m1Data.labaBersih)}</td><td className="text-right mono" style={{color: labaBersihAll >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(labaBersihAll)}</td></tr>
          </tbody></table>
      </div>
    </div>
  )
}

export function LabaRugi2Bulan({ state, journals, periodLabel, selectedPeriod }) {
  const targetMonth = Math.max(...periodValueToMonths(selectedPeriod))

  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  const labelLalu = monthNames[targetMonth - 1] || 'Bulan Lalu'
  const labelBerjalan = monthNames[targetMonth] || 'Bulan Berjalan'

  const windowMonths = [targetMonth - 1, targetMonth].filter(m => m >= 1 && m <= 12)
  const snaps = useMonthlyLabaRugiSnapshots(windowMonths, state && state.periodModes)
  const skeleton = windowMonths.map(m => snaps[m]).filter(r => r && r.length).pop() || null

  if (skeleton && windowMonths.length === 2) {
    const cols = windowMonths.map(m => monthColumnRows(snaps[m], journalsOfMonth(journals, m), skeleton))
    const merged = mergeLabelColumns(cols)
    return (
      <div className="report-doc">
        <ReportHeader title="LAPORAN LABA RUGI PER 2 BULAN" subtitle={`Periode Berakhir — ${periodLabel || ''}`} onPrint={() => printReport('Laba Rugi 2 Bulan')} />
        <div className="report-doc-body">
          <div style={{ background: 'var(--primary-light)', padding: '10px 16px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12, color: 'var(--primary)' }}>
            {SNAPSHOT_NOTE}
          </div>
          <MonthSourceChips months={windowMonths} snaps={snaps} monthNames={monthNames} />
          <table>
            <thead><tr><th>Uraian</th><th className="text-right">{labelBerjalan}</th><th className="text-right">{labelLalu}</th><th className="text-right">Selisih</th><th className="text-right">%</th></tr></thead>
            <tbody>
              {merged.map((r, i) => {
                const vLalu = r.values[0] || 0, vIni = r.values[1] || 0
                const selisih = vIni - vLalu
                const pct = vLalu === 0 ? (vIni !== 0 ? 100 : 0) : (selisih / Math.abs(vLalu)) * 100
                return (
                  <tr key={i} style={r.isHeader
                    ? { background: 'var(--bg-secondary)', fontWeight: 700 }
                    : r.isTotal ? { fontWeight: 700, borderTop: '1px solid var(--border)' } : {}}>
                    <td style={{ paddingLeft: r.isHeader || r.isTotal ? 8 : 24 }}>{r.label}</td>
                    <td className="text-right mono">{r.values[1] != null ? fmtSign(r.values[1]) : ''}</td>
                    <td className="text-right mono">{r.values[0] != null ? fmtSign(r.values[0]) : ''}</td>
                    <td className="text-right mono">{r.isHeader ? '' : fmtSign(selisih)}</td>
                    <td className="text-right mono">{r.isHeader ? '' : pct.toFixed(1) + '%'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const mLaluJournals = journals.filter(j => new Date(j.tanggal).getMonth() + 1 === targetMonth - 1)
  const mBerjalanJournals = journals.filter(j => new Date(j.tanggal).getMonth() + 1 === targetMonth)

  const mLaluData = generateDynamicLRData(state, mLaluJournals)
  const mBerjalanData = generateDynamicLRData(state, mBerjalanJournals)

  const allPendapatanCodes = [...new Set([...mLaluData.pendapatanItems.map(p=>p.code), ...mBerjalanData.pendapatanItems.map(p=>p.code)])].sort()
  const allBebanCodes = [...new Set([...mLaluData.bebanItems.map(b=>b.code), ...mBerjalanData.bebanItems.map(b=>b.code)])].sort()

  const getMerged = (codes, dLalu, dBerjalan) => codes.map(code => {
    const iLalu = dLalu.find(i => i.code === code), iBerjalan = dBerjalan.find(i => i.code === code)
    const vLalu = iLalu?.v || 0, vBerjalan = iBerjalan?.v || 0
    const selisih = vBerjalan - vLalu
    const pct = vLalu === 0 ? (vBerjalan > 0 ? 100 : 0) : (selisih / vLalu) * 100
    return { code, n: iBerjalan?.n || iLalu?.n, vLalu, vBerjalan, selisih, pct }
  })

  const mergedPendapatan = getMerged(allPendapatanCodes, mLaluData.pendapatanItems, mBerjalanData.pendapatanItems)
  const mergedBeban = getMerged(allBebanCodes, mLaluData.bebanItems, mBerjalanData.bebanItems)

  const selisihPendapatan = mBerjalanData.totalPendapatan - mLaluData.totalPendapatan
  const pctPendapatan = mLaluData.totalPendapatan === 0 ? 0 : (selisihPendapatan / mLaluData.totalPendapatan) * 100

  const selisihBeban = mBerjalanData.totalBeban - mLaluData.totalBeban
  const pctBeban = mLaluData.totalBeban === 0 ? 0 : (selisihBeban / mLaluData.totalBeban) * 100

  const selisihLaba = mBerjalanData.labaBersih - mLaluData.labaBersih

  return (
    <div className="report-doc">
      <ReportHeader title="LAPORAN LABA RUGI PER 2 BULAN" subtitle={`Periode Berakhir — ${periodLabel || 'Januari 2026'}`} onPrint={() => printReport('Laba Rugi 2 Bulan')} />
      <div className="report-doc-body">
        <table><thead><tr><th>Akun</th><th className="text-right">{labelBerjalan}</th><th className="text-right">{labelLalu}</th><th className="text-right">Selisih</th><th className="text-right">% Pertumbuhan</th></tr></thead>
          <tbody>
            <tr style={{background:'var(--success-light)'}}><td style={{fontWeight:700}} colSpan={5}>PENDAPATAN USAHA</td></tr>
            {mergedPendapatan.map((p,i) => (
              <tr key={i}>
                <td style={{paddingLeft:24}}>{p.code} - {p.n}</td>
                <td className="text-right mono">{fmtSign(p.vBerjalan)}</td>
                <td className="text-right mono">{fmtSign(p.vLalu)}</td>
                <td className="text-right mono" style={{color: p.selisih >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(p.selisih)}</td>
                <td className="text-right mono" style={{color: p.pct >= 0 ? 'var(--success)' : 'var(--danger)'}}>{p.pct.toFixed(1)}%</td>
              </tr>
            ))}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Pendapatan</td><td className="text-right mono">{fmtSign(mBerjalanData.totalPendapatan)}</td><td className="text-right mono">{fmtSign(mLaluData.totalPendapatan)}</td><td className="text-right mono" style={{color: selisihPendapatan >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(selisihPendapatan)}</td><td className="text-right mono" style={{color: pctPendapatan >= 0 ? 'var(--success)' : 'var(--danger)'}}>{pctPendapatan.toFixed(1)}%</td></tr>
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            
            <tr style={{background:'var(--danger-light)'}}><td style={{fontWeight:700}} colSpan={5}>BEBAN OPERASIONAL</td></tr>
            {mergedBeban.map((b,i) => (
              <tr key={i}>
                <td style={{paddingLeft:24}}>{b.code} - {b.n}</td>
                <td className="text-right mono">{fmtSign(b.vBerjalan)}</td>
                <td className="text-right mono">{fmtSign(b.vLalu)}</td>
                <td className="text-right mono" style={{color: b.selisih <= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(b.selisih)}</td>
                <td className="text-right mono" style={{color: b.pct <= 0 ? 'var(--success)' : 'var(--danger)'}}>{b.pct.toFixed(1)}%</td>
              </tr>
            ))}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Beban</td><td className="text-right mono">{fmtSign(mBerjalanData.totalBeban)}</td><td className="text-right mono">{fmtSign(mLaluData.totalBeban)}</td><td className="text-right mono" style={{color: selisihBeban <= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(selisihBeban)}</td><td className="text-right mono" style={{color: pctBeban <= 0 ? 'var(--success)' : 'var(--danger)'}}>{pctBeban.toFixed(1)}%</td></tr>
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            
            <tr style={{fontWeight:700,background:'var(--border-light)',fontSize:15}}><td>LABA (RUGI) BERSIH</td><td className="text-right mono">{fmtSign(mBerjalanData.labaBersih)}</td><td className="text-right mono">{fmtSign(mLaluData.labaBersih)}</td><td className="text-right mono" style={{color: selisihLaba >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(selisihLaba)}</td><td className="text-right mono">-</td></tr>
          </tbody></table>
      </div>
    </div>
  )
}

export function LabaRugiBudget({ state, journals, periodLabel }) {
  const { pendapatanItems, bebanItems, totalPendapatan, totalBeban, labaBersih } = generateDynamicLRData(state, journals)
  return (
    <div className="report-doc">
      <ReportHeader title="LAPORAN LABA RUGI VS BUDGET" subtitle={`Realisasi vs Anggaran — ${periodLabel || 'Januari 2026'}`} onPrint={() => printReport('Laba Rugi vs Budget')} />
      <div className="report-doc-body">
        <div style={{ background: 'var(--primary-light)', padding: '12px 20px', borderRadius: 'var(--radius-sm)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--primary)' }}>⚠️ Kolom Anggaran di bawah ini adalah <b>estimasi ilustratif otomatis</b> (bukan angka audited dan bukan dari modul Anggaran). Untuk realisasi vs anggaran yang sebenarnya, gunakan menu <b>LRA</b> / <b>NPD</b>.</span>
        </div>
        <table><thead><tr><th>Akun</th><th className="text-right">Realisasi (Aktual)</th><th className="text-right">Anggaran (Budget)</th><th className="text-right">Penyimpangan (Varian)</th><th className="text-right">% Capaian</th></tr></thead>
          <tbody>
            <tr style={{background:'var(--success-light)'}}><td style={{fontWeight:700}} colSpan={5}>PENDAPATAN USAHA</td></tr>
            {pendapatanItems.map((p,i) => {
              const budget = p.v * 1.1; const varian = p.v - budget; const pct = (p.v / budget) * 100
              return (
              <tr key={i}>
                <td style={{paddingLeft:24}}>{p.code} - {p.n}</td>
                <td className="text-right mono">{fmtSign(p.v)}</td>
                <td className="text-right mono">{fmtSign(budget)}</td>
                <td className="text-right mono" style={{color: varian >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(varian)}</td>
                <td className="text-right mono" style={{color: pct >= 100 ? 'var(--success)' : 'var(--danger)'}}>{pct.toFixed(1)}%</td>
              </tr>
            )})}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Pendapatan</td><td className="text-right mono">{fmtSign(totalPendapatan)}</td><td className="text-right mono">{fmtSign(totalPendapatan*1.1)}</td><td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(totalPendapatan - (totalPendapatan*1.1))}</td><td className="text-right mono" style={{color:'var(--danger)'}}>90.9%</td></tr>
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            
            <tr style={{background:'var(--danger-light)'}}><td style={{fontWeight:700}} colSpan={5}>BEBAN OPERASIONAL</td></tr>
            {bebanItems.map((b,i) => {
              const budget = b.v * 0.85; const varian = b.v - budget; const pct = (b.v / budget) * 100
              return (
              <tr key={i}>
                <td style={{paddingLeft:24}}>{b.code} - {b.n}</td>
                <td className="text-right mono">{fmtSign(b.v)}</td>
                <td className="text-right mono">{fmtSign(budget)}</td>
                <td className="text-right mono" style={{color: varian <= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(varian)}</td>
                <td className="text-right mono" style={{color: pct <= 100 ? 'var(--success)' : 'var(--danger)'}}>{pct.toFixed(1)}%</td>
              </tr>
            )})}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Beban</td><td className="text-right mono">{fmtSign(totalBeban)}</td><td className="text-right mono">{fmtSign(totalBeban*0.85)}</td><td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(totalBeban - (totalBeban*0.85))}</td><td className="text-right mono" style={{color:'var(--danger)'}}>117.6%</td></tr>
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            
            <tr style={{fontWeight:700,background:'var(--border-light)',fontSize:15}}><td>LABA (RUGI) BERSIH</td><td className="text-right mono">{fmtSign(labaBersih)}</td><td className="text-right mono">{fmtSign((totalPendapatan*1.1)-(totalBeban*0.85))}</td><td className="text-right mono">-</td><td className="text-right mono">-</td></tr>
          </tbody></table>
      </div>
    </div>
  )
}

export function LabaRugiProject({ state, journals, periodLabel }) {
  const { totalPendapatan, totalBeban, labaBersih } = generateDynamicLRData(state, journals)
  return (
    <div className="report-doc">
      <ReportHeader title="LAPORAN LABA RUGI PER PROJECT / PASAR" subtitle={`Profitabilitas Unit Bisnis — ${periodLabel || 'Januari 2026'}`} onPrint={() => printReport('Laba Rugi Project')} />
      <div className="report-doc-body">
        <div style={{ background: 'var(--primary-light)', padding: '12px 20px', borderRadius: 'var(--radius-sm)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--primary)' }}>⚠️ Jurnal belum di-tag per Project/Pasar. Alokasi antar unit di bawah ini adalah <b>distribusi estimasi ilustratif</b> (bukan angka audited). Total Konsolidasi tetap akurat.</span>
        </div>
        <table><thead><tr><th>Keterangan</th><th className="text-right">Pasar Baiman Pusat</th><th className="text-right">Pasar Baiman Cab. Utara</th><th className="text-right">Pasar Baiman Cab. Selatan</th><th className="text-right">Total Konsolidasi</th></tr></thead>
          <tbody>
            <tr style={{background:'var(--success-light)'}}><td style={{fontWeight:700}} colSpan={5}>PENDAPATAN</td></tr>
            <tr>
              <td style={{paddingLeft:24}}>Pendapatan Retribusi & Sewa</td>
              <td className="text-right mono">{fmtSign(totalPendapatan * 0.6)}</td>
              <td className="text-right mono">{fmtSign(totalPendapatan * 0.25)}</td>
              <td className="text-right mono">{fmtSign(totalPendapatan * 0.15)}</td>
              <td className="text-right mono" style={{fontWeight:600}}>{fmtSign(totalPendapatan)}</td>
            </tr>
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            
            <tr style={{background:'var(--danger-light)'}}><td style={{fontWeight:700}} colSpan={5}>BEBAN</td></tr>
            <tr>
              <td style={{paddingLeft:24}}>Beban Operasional Pasar</td>
              <td className="text-right mono">{fmtSign(totalBeban * 0.5)}</td>
              <td className="text-right mono">{fmtSign(totalBeban * 0.3)}</td>
              <td className="text-right mono">{fmtSign(totalBeban * 0.2)}</td>
              <td className="text-right mono" style={{fontWeight:600}}>{fmtSign(totalBeban)}</td>
            </tr>
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            
            <tr style={{fontWeight:700,background:'var(--border-light)',fontSize:15}}>
              <td>LABA (RUGI) UNIT BISNIS</td>
              <td className="text-right mono" style={{color: (totalPendapatan*0.6)-(totalBeban*0.5) >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign((totalPendapatan*0.6)-(totalBeban*0.5))}</td>
              <td className="text-right mono" style={{color: (totalPendapatan*0.25)-(totalBeban*0.3) >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign((totalPendapatan*0.25)-(totalBeban*0.3))}</td>
              <td className="text-right mono" style={{color: (totalPendapatan*0.15)-(totalBeban*0.2) >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign((totalPendapatan*0.15)-(totalBeban*0.2))}</td>
              <td className="text-right mono" style={{color: labaBersih >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(labaBersih)}</td>
            </tr>
          </tbody></table>
      </div>
    </div>
  )
}

export function LabaRugiSemester({ state, journals, periodLabel, selectedPeriod }) {
  // Semester follows the LAST month of the selected period, so the 's2' preset
  // and single months Juli–Desember all resolve to Semester II. The old check
  // only matched month-name substrings and missed the 's2' preset entirely.
  const isS2 = Math.max(...periodValueToMonths(selectedPeriod)) > 6
  const semesterLabel = isS2 ? 'Semester II (Jul - Des)' : 'Semester I (Jan - Jun)'
  const startMonth = isS2 ? 7 : 1
  const endMonth = isS2 ? 12 : 6

  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

  // Monthly snapshots for the semester — the semester figure is the SUM of the
  // monthly reports (+ user-journal deltas), per the Divisi Keuangan mechanism.
  const semMonths = []
  for (let m = startMonth; m <= endMonth; m++) semMonths.push(m)
  const snaps = useMonthlyLabaRugiSnapshots(semMonths, state && state.periodModes)
  const skeleton = semMonths.map(m => snaps[m]).filter(r => r && r.length).pop() || null

  const semJournals = journals.filter(j => {
    const m = new Date(j.tanggal).getMonth() + 1
    return m >= startMonth && m <= endMonth
  })

  if (skeleton) {
    const cols = semMonths.map(m => monthColumnRows(snaps[m], journalsOfMonth(journals, m), skeleton))
    const merged = mergeLabelColumns(cols)
    return (
      <div className="report-doc">
        <ReportHeader title={`LAPORAN LABA RUGI — ${semesterLabel.toUpperCase()}`} subtitle={`Konsolidasi 6 Bulan — Tahun 2026`} onPrint={() => printReport(`Laba Rugi ${semesterLabel}`)} />
        <div className="report-doc-body">
          <div style={{ background: 'var(--primary-light)', padding: '10px 16px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12, color: 'var(--primary)' }}>
            {SNAPSHOT_NOTE}
          </div>
          <MonthSourceChips months={semMonths} snaps={snaps} monthNames={monthNames} />
          <table>
            <thead><tr><th>Uraian</th><th className="text-right">Total Realisasi ({semesterLabel})</th></tr></thead>
            <tbody>
              {merged.map((r, i) => (
                <tr key={i} style={r.isHeader
                  ? { background: 'var(--bg-secondary)', fontWeight: 700 }
                  : r.isTotal ? { fontWeight: 700, borderTop: '1px solid var(--border)' } : {}}>
                  <td style={{ paddingLeft: r.isHeader || r.isTotal ? 8 : 24 }}>{r.label}</td>
                  <td className="text-right mono" style={{ fontWeight: r.isTotal ? 700 : 400 }}>{r.isHeader ? '' : fmtSign(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const semData = generateDynamicLRData(state, semJournals)

  return (
    <div className="report-doc">
      <ReportHeader title={`LAPORAN LABA RUGI — ${semesterLabel.toUpperCase()}`} subtitle={`Konsolidasi 6 Bulan — Tahun 2026`} onPrint={() => printReport(`Laba Rugi ${semesterLabel}`)} />
      <div className="report-doc-body">
        <div style={{ background: 'var(--primary-light)', padding: '12px 20px', borderRadius: 'var(--radius-sm)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--primary)' }}>Laporan ini menyajikan akumulasi pendapatan dan beban selama periode {semesterLabel}.</span>
        </div>
        <table><thead><tr><th>Akun / Keterangan</th><th className="text-right">Total Realisasi ({semesterLabel})</th></tr></thead>
          <tbody>
            <tr style={{background:'var(--success-light)'}}><td style={{fontWeight:700}} colSpan={2}>PENDAPATAN</td></tr>
            {semData.pendapatanItems.map((p,i) => <RecursiveRow key={i} item={p} depth={0} columns={1} />)}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Pendapatan</td><td className="text-right mono" style={{color:'var(--success)'}}>{fmtSign(semData.totalPendapatan)}</td></tr>
            <tr style={{height:16}}><td colSpan={2}></td></tr>
            
            <tr style={{background:'var(--danger-light)'}}><td style={{fontWeight:700}} colSpan={2}>BEBAN</td></tr>
            {semData.bebanItems.map((b,i) => <RecursiveRow key={i} item={b} depth={0} columns={1} />)}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Beban</td><td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(semData.totalBeban)}</td></tr>
            <tr style={{height:24}}><td colSpan={2}></td></tr>
            
            <tr style={{fontWeight:700,background:'var(--border-light)',fontSize:16, borderTop:'2px solid var(--border)'}}><td>LABA (RUGI) BERSIH SEMESTER</td><td className="text-right mono" style={{color: semData.labaBersih >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(semData.labaBersih)}</td></tr>
          </tbody></table>
      </div>
    </div>
  )
}
