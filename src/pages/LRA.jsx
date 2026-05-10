import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { Printer, Download, FileText, TrendingUp, TrendingDown, Wallet, BarChart3, Building2, Briefcase, ChevronDown, ChevronRight, Calendar } from 'lucide-react'
import { printReport } from '../utils/exportUtils.js'
import { MONTHS, periodValueToYearMonth, periodValueToLabel, filterJournalsByMonth, filterJournalsYTD } from '../utils/journalFilters.js'
import { buildFlatHierarchy, getRowStyle } from '../utils/treeUtils.js'
import * as XLSX from 'xlsx'

const lraTabs = [
  { id: 'penerimaan',      label: 'Tabel Penerimaan',  icon: TrendingUp,   catKey: 'penerimaan' },
  { id: 'rekap-penerimaan',label: 'Rekap Penerimaan',  icon: Wallet,       catKey: 'penerimaan' },
  { id: 'investasi',       label: 'Beban Investasi',    icon: Building2,    catKey: 'bebanInvestasi' },
  { id: 'rekap-investasi', label: 'Rekap Investasi',   icon: BarChart3,    catKey: 'bebanInvestasi' },
  { id: 'beban-ops',       label: 'Beban Operasional', icon: TrendingDown, catKey: 'bebanOperasional' },
  { id: 'rekap-beban-ops', label: 'Rekap Beban Ops',   icon: FileText,     catKey: 'bebanOperasional' },
  { id: 'beban-umum',      label: 'Beban Umum',         icon: Briefcase,    catKey: 'bebanUmum' },
  { id: 'rekap-beban-umum',label: 'Rekap Beban Umum',  icon: FileText,     catKey: 'bebanUmum' },
]

function ReportHeader({ title, subtitle, onPrint, onExport }) {
  return (
    <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div className="company">PERUMDA PASAR BAIMAN</div>
        <h2>{title}</h2>
        <div className="period">{subtitle}</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', gap:6, fontSize:13, padding:'8px 14px', borderRadius:8 }} onClick={onPrint}>
          <Printer size={14} /> Cetak Laporan
        </button>
        <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', gap:6, fontSize:13, padding:'8px 14px', borderRadius:8 }} onClick={onExport}>
          <Download size={14} /> Unduh Excel (.xlsx)
        </button>
      </div>
    </div>
  )
}

export default function LRA() {
  const { state } = useApp()
  const [activeTab, setActiveTab] = useState('penerimaan')
  const [selectedMonth, setSelectedMonth] = useState('apr')
  const [collapsed, setCollapsed] = useState({})

  const anggaranCats = state.anggaranCategories || {}
  const allJournals = useMemo(() => (state.journals || []).filter(j => j.status === 'posted'), [state.journals])

  // Filter journals for the selected month (MTD) and YTD
  const yearMonth = periodValueToYearMonth(selectedMonth)
  const monthLabel = periodValueToLabel(selectedMonth)

  const journalsMTD = useMemo(() => filterJournalsByMonth(allJournals, yearMonth), [allJournals, yearMonth])
  const journalsYTD = useMemo(() => filterJournalsYTD(allJournals, yearMonth), [allJournals, yearMonth])

  const activeTabInfo = lraTabs.find(t => t.id === activeTab) || lraTabs[0]
  const catKey = activeTabInfo.catKey
  const rawData = (anggaranCats[catKey] || []).filter(i => !i.is_total)

  // Build flat hierarchy for sub-tree display
  const hierarchyData = useMemo(() => {
    try { return buildFlatHierarchy(rawData) }
    catch { return rawData.map(d => ({ ...d, _depth: 0, _hasChildren: false })) }
  }, [rawData])

  // For each item, calculate realisasi from journals matching its category/code
  const lraData = useMemo(() => {
    const journalSums = { mtd: {}, ytd: {}, prev: {} }
    
    // We need to know what the "base" month is. Let's assume it's January 2026 for now.
    // Ideally this should be a setting.
    const BASE_MONTH_NUM = 1 
    const currentMonthNum = MONTHS.find(m => m.value === selectedMonth)?.num || 4

    allJournals.forEach(j => {
      if (j.status === 'posted' && j.kode_anggaran && j.kode_anggaran.startsWith(`${catKey}|`)) {
        const kode = j.kode_anggaran.split('|')[1]
        const amount = catKey === 'penerimaan' ? (j.kredit - j.debit) : (j.debit - j.kredit)
        
        if (!j.tanggal) return
        const [jy, jm] = j.tanggal.split('-').map(Number)
        
        if (jm === currentMonthNum) {
          journalSums.mtd[kode] = (journalSums.mtd[kode] || 0) + amount
        }
        if (jm <= currentMonthNum) {
          journalSums.ytd[kode] = (journalSums.ytd[kode] || 0) + amount
        }
        if (jm < currentMonthNum) {
          journalSums.prev[kode] = (journalSums.prev[kode] || 0) + amount
        }
      }
    })

    return hierarchyData.map(item => {
      const anggaran = item.anggaran_awal || 0
      
      // Calculate dynamic sums for this item and its children
      const getSum = (source) => {
        let sum = source[item.kode] || 0
        if (item._hasChildren) {
          Object.keys(source).forEach(k => {
            if (k.startsWith(`${item.kode}.`)) sum += source[k]
          })
        }
        return sum
      }

      const bulanIni = getSum(journalSums.mtd)
      const sdBlnLalu = getSum(journalSums.prev)
      const realisasi = sdBlnLalu + bulanIni
      const targetBulan = anggaran > 0 ? anggaran / 12 : 0
      const persen = anggaran > 0 ? (realisasi / anggaran * 100) : 0
      
      return { ...item, anggaran, sdBlnLalu, bulanIni, realisasi, targetBulan, persen }
    })
  }, [hierarchyData, allJournals, catKey, selectedMonth])

  const toggleCollapse = (kode) => setCollapsed(prev => ({ ...prev, [kode]: !prev[kode] }))

  function LRATable({ data, title }) {
    const leafItems = data.filter(d => !d._hasChildren)
    const totalAnggaran = leafItems.reduce((s, d) => s + d.anggaran, 0)
    const totalRealisasi = leafItems.reduce((s, d) => s + d.realisasi, 0)
    const totalBulanIni = leafItems.reduce((s, d) => s + d.bulanIni, 0)
    const totalSdBlnLalu = leafItems.reduce((s, d) => s + d.sdBlnLalu, 0)
    const totalSelisih = totalAnggaran - totalRealisasi
    const totalPersen = totalAnggaran > 0 ? (totalRealisasi / totalAnggaran * 100) : 0

    // Track which parents are collapsed
    const visibleData = []
    const collapsedParents = new Set()

    data.forEach(item => {
      const kode = String(item.kode)
      // Check if any parent is collapsed
      const isHidden = [...collapsedParents].some(pk => kode.startsWith(pk + '.'))
      if (isHidden) return

      if (item._hasChildren && collapsed[kode]) {
        collapsedParents.add(kode)
      }
      visibleData.push(item)
    })

    return (
      <table>
        <thead>
          <tr>
            <th style={{width:'8%'}}>No</th>
            <th style={{width:'30%'}}>Program / Kegiatan</th>
            <th className="text-right" style={{width:'13%'}}>Anggaran 1 Thn</th>
            <th className="text-right" style={{width:'11%'}}>Target/Bln</th>
            <th className="text-right" style={{width:'10%'}}>Sd Bln Lalu</th>
            <th className="text-right" style={{width:'10%'}}>Bulan Ini</th>
            <th className="text-right" style={{width:'10%'}}>Sd Bln Ini</th>
            <th className="text-right" style={{width:'5%'}}>%</th>
            <th style={{width:'8%'}}>Progress</th>
          </tr>
        </thead>
        <tbody>
          {visibleData.map((item) => {
            const kode = String(item.kode)
            const depth = item._depth || 0
            const isHeader = item._hasChildren
            const isCollapsed = collapsed[kode]
            const persen = item.persen || 0
            const isOver = persen > 100

            return (
              <tr key={kode} style={{
                fontWeight: depth === 0 ? 700 : depth === 1 && isHeader ? 600 : 400,
                background: depth === 0 ? 'var(--bg-secondary)' : depth === 1 && isHeader ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderTop: depth === 0 ? '2px solid var(--border)' : undefined,
                color: item.is_total ? 'var(--primary)' : undefined,
                fontSize: 12,
              }}>
                <td className="mono" style={{ paddingLeft: 8 + depth * 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {isHeader && (
                      <span style={{ cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }} onClick={() => toggleCollapse(kode)}>
                        {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      </span>
                    )}
                    {kode}
                  </div>
                </td>
                <td style={{ paddingLeft: 8 + depth * 12, fontWeight: depth <= 1 && isHeader ? 600 : 400 }}>
                  {item.nama}
                </td>
                <td className="text-right mono">{item.anggaran ? formatRupiah(item.anggaran) : '-'}</td>
                <td className="text-right mono">{item.targetBulan ? formatRupiah(Math.round(item.targetBulan)) : '-'}</td>
                <td className="text-right mono">{item.sdBlnLalu ? formatRupiah(item.sdBlnLalu) : '-'}</td>
                <td className="text-right mono" style={{ fontWeight: 600 }}>{item.bulanIni ? formatRupiah(item.bulanIni) : '-'}</td>
                <td className="text-right mono" style={{ fontWeight: 600, color: isOver ? 'var(--danger)' : item.realisasi > 0 ? 'var(--success)' : undefined }}>
                  {item.realisasi ? formatRupiah(item.realisasi) : '-'}
                </td>
                <td className="text-right" style={{ fontSize: 11, color: isOver ? 'var(--danger)' : undefined }}>
                  {item.anggaran > 0 ? persen.toFixed(1) + '%' : '-'}
                </td>
                <td>
                  {item.anggaran > 0 && !isHeader && (
                    <div style={{ background: 'var(--border-light)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(persen, 100)}%`, height: '100%', borderRadius: 4, background: isOver ? 'var(--danger)' : persen > 80 ? 'var(--warning)' : 'var(--success)', transition: 'width 0.5s ease' }} />
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
          <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: 'var(--border-light)', fontSize: 13 }}>
            <td colSpan={2}>TOTAL {title}</td>
            <td className="text-right mono">{formatRupiah(totalAnggaran)}</td>
            <td className="text-right mono">{formatRupiah(Math.round(totalAnggaran / 12))}</td>
            <td className="text-right mono">{formatRupiah(totalSdBlnLalu)}</td>
            <td className="text-right mono">{formatRupiah(totalBulanIni)}</td>
            <td className="text-right mono" style={{ color: totalSelisih >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatRupiah(totalRealisasi)}</td>
            <td className="text-right">{totalPersen.toFixed(1)}%</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    )
  }

  function RekapTable({ data, title }) {
    const leafItems = data.filter(d => !d._hasChildren)
    const totalAnggaran = leafItems.reduce((s, d) => s + d.anggaran, 0)
    const totalRealisasi = leafItems.reduce((s, d) => s + d.realisasi, 0)

    const visibleData = []
    const collapsedParents = new Set()

    data.forEach(item => {
      const kode = String(item.kode)
      const isHidden = [...collapsedParents].some(pk => kode.startsWith(pk + '.'))
      if (isHidden) return

      if (item._hasChildren && collapsed[kode]) {
        collapsedParents.add(kode)
      }
      visibleData.push(item)
    })

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
          <div className="kpi-card" style={{ textAlign: 'center' }}>
            <div className="kpi-label" style={{ justifyContent: 'center' }}>Total Anggaran</div>
            <div className="kpi-value" style={{ color: 'var(--primary)' }}>{formatRupiah(totalAnggaran)}</div>
          </div>
          <div className="kpi-card" style={{ textAlign: 'center' }}>
            <div className="kpi-label" style={{ justifyContent: 'center' }}>Total Realisasi</div>
            <div className="kpi-value" style={{ color: 'var(--success)' }}>{formatRupiah(totalRealisasi)}</div>
          </div>
          <div className="kpi-card" style={{ textAlign: 'center' }}>
            <div className="kpi-label" style={{ justifyContent: 'center' }}>Sisa Anggaran</div>
            <div className="kpi-value" style={{ color: (totalAnggaran - totalRealisasi) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatRupiah(totalAnggaran - totalRealisasi)}
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{width:'15%'}}>No/Kode</th>
              <th style={{width:'35%'}}>Uraian</th>
              <th className="text-right" style={{width:'15%'}}>Anggaran</th>
              <th className="text-right" style={{width:'15%'}}>Realisasi Sd Bln Ini</th>
              <th className="text-right" style={{width:'10%'}}>%</th>
              <th className="text-center" style={{width:'10%'}}>Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleData.map((item) => {
              const kode = String(item.kode)
              const depth = item._depth || 0
              const isHeader = item._hasChildren
              const isCollapsed = collapsed[kode]
              const pct = item.persen || 0
              const status = pct >= 100 ? 'Terealisasi' : pct >= 75 ? 'Hampir' : pct >= 50 ? 'Berjalan' : pct > 0 ? 'Rendah' : 'Belum'
              const badge = pct >= 100 ? 'green' : pct >= 75 ? 'blue' : pct >= 50 ? 'orange' : 'red'

              return (
                <tr key={kode} style={{
                  fontWeight: depth === 0 ? 700 : depth === 1 && isHeader ? 600 : 400,
                  background: depth === 0 ? 'var(--bg-secondary)' : depth === 1 && isHeader ? 'rgba(255,255,255,0.02)' : 'transparent',
                  borderTop: depth === 0 ? '2px solid var(--border)' : undefined,
                  color: item.is_total ? 'var(--primary)' : undefined,
                  fontSize: 12,
                }}>
                  <td className="mono" style={{ paddingLeft: 8 + depth * 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isHeader && (
                        <span style={{ cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }} onClick={() => toggleCollapse(kode)}>
                          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        </span>
                      )}
                      {kode}
                    </div>
                  </td>
                  <td style={{ paddingLeft: 8 + depth * 12, fontWeight: depth <= 1 && isHeader ? 600 : 400 }}>
                    {item.nama}
                  </td>
                  <td className="text-right mono">{item.anggaran ? formatRupiah(item.anggaran) : '-'}</td>
                  <td className="text-right mono">{item.realisasi ? formatRupiah(item.realisasi) : '-'}</td>
                  <td className="text-right">{item.anggaran > 0 ? pct.toFixed(1) + '%' : '-'}</td>
                  <td className="text-center">{!isHeader && item.anggaran > 0 && <span className={`badge ${badge}`}>{status}</span>}</td>
                </tr>
              )
            })}
            <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: 'var(--border-light)', fontSize: 13 }}>
              <td colSpan={2}>JUMLAH {title}</td>
              <td className="text-right mono">{formatRupiah(totalAnggaran)}</td>
              <td className="text-right mono">{formatRupiah(totalRealisasi)}</td>
              <td className="text-right">{totalAnggaran > 0 ? (totalRealisasi / totalAnggaran * 100).toFixed(1) : 0}%</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  function getActiveTitle() {
    if (activeTab.includes('penerimaan')) return 'PENERIMAAN'
    if (activeTab.includes('investasi')) return 'BEBAN INVESTASI'
    if (activeTab.includes('beban-ops')) return 'BEBAN OPERASIONAL'
    if (activeTab.includes('beban-umum')) return 'BEBAN UMUM'
    return ''
  }

  const isRekap = activeTab.startsWith('rekap')
  const subtitle = isRekap
    ? `Rekapitulasi ${getActiveTitle()} — Per Bulan ${monthLabel} 2026`
    : `Tabel ${getActiveTitle()} — Periode ${monthLabel} 2026`

  function handleExport() {
    const title = getActiveTitle()
    const rows = lraData.filter(d => !d._hasChildren).map(d => [
      d.kode, d.nama,
      d.anggaran, Math.round(d.targetBulan),
      d.sdBlnLalu, d.bulanIni, d.realisasi,
      d.persen.toFixed(1) + '%'
    ])
    const ws = XLSX.utils.aoa_to_sheet([
      [`LRA ${title} — ${monthLabel} 2026`], [],
      ['No/Kode', 'Program / Kegiatan', 'Anggaran 1 Thn', 'Target/Bln', 'Sd Bln Lalu', 'Bulan Ini', 'Sd Bln Ini', '%'],
      ...rows
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `LRA ${title}`)
    XLSX.writeFile(wb, `LRA_${title}_${selectedMonth}.xlsx`)
  }

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Laporan Realisasi Anggaran</h1>
          <p>LRA — Sesuai Standar Akuntansi Keuangan Entitas Privat (SAK EP)</p>
        </div>
        <button className="btn btn-outline" onClick={() => printReport('LRA — Perumda Pasar Baiman')}>
          <Printer size={16} /> Cetak Laporan
        </button>
      </div>

      {/* Month Selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <Calendar size={16} color="var(--primary)" />
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Periode:</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MONTHS.map(m => (
              <button
                key={m.value}
                onClick={() => setSelectedMonth(m.value)}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  border: m.isAudit ? '1px solid var(--primary)' : '1px solid transparent',
                  background: selectedMonth === m.value ? 'var(--primary)' : 'var(--border-light)',
                  color: selectedMonth === m.value ? 'white' : 'var(--text-muted)',
                  fontWeight: selectedMonth === m.value || m.isAudit ? 600 : 400,
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
              >
                {m.label}
                {m.isAudit && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, background: 'var(--success)', borderRadius: '50%', border: '2px solid var(--bg-primary)' }} />}
              </button>
            ))}
          </div>
        </div>
        {!MONTHS.find(m => m.value === selectedMonth)?.isAudit && (
          <div style={{ fontSize: 11, color: 'var(--warning)', paddingLeft: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚠️ Data audit hanya tersedia untuk bulan Januari dan April 2026.</span>
          </div>
        )}
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {lraTabs.map(tab => (
          <button key={tab.id} className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setActiveTab(tab.id)}>
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="report-doc">
        <ReportHeader
          title={`LAPORAN REALISASI ANGGARAN — ${getActiveTitle()}`}
          subtitle={subtitle}
          onPrint={() => printReport(`LRA ${getActiveTitle()}`)}
          onExport={handleExport}
        />
        <div className="report-doc-body">
          {isRekap
            ? <RekapTable data={lraData} title={getActiveTitle()} />
            : <LRATable data={lraData} title={getActiveTitle()} />
          }
        </div>
      </div>
    </div>
  )
}
