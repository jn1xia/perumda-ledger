import { useState, useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { Pencil, Trash2, Plus, Save, X, TrendingUp, TrendingDown, Target, DollarSign, ChevronDown, ChevronRight, Filter, Calendar } from 'lucide-react'
import { MONTHS, periodValueToYearMonth, periodValueToLabel, filterJournalsByMonth, filterJournalsYTD } from '../utils/journalFilters.js'
import { buildFlatHierarchy } from '../utils/treeUtils.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const CATEGORY_TABS = [
  { key: 'penerimaan', label: 'Penerimaan', color: '#10B981', icon: TrendingUp },
  { key: 'bebanInvestasi', label: 'Beban Investasi', color: '#8B5CF6', icon: Target },
  { key: 'bebanUmum', label: 'Beban Umum', color: '#F59E0B', icon: DollarSign },
  { key: 'bebanOperasional', label: 'Beban Operasional', color: '#E54D42', icon: TrendingDown },
]

export default function AnggaranRealisasi() {
  const { state } = useApp()

  const [activeCategory, setActiveCategory] = useState('penerimaan')
  const [selectedPeriod, setSelectedPeriod] = useState('apr')
  const [expandedGroups, setExpandedGroups] = useState({})
  const [collapsed, setCollapsed] = useState({})



  const currentTab = CATEGORY_TABS.find(t => t.key === activeCategory)
  const monthLabel = periodValueToLabel(selectedPeriod)
  
  // Filter anggaran for the selected month (use pre-computed values from Excel/DB)
  const monthNum = MONTHS.find(m => m.value === selectedPeriod)?.num || 4

  const anggaranForMonth = useMemo(() => {
    const allAnggaran = state.anggaran || []
    const monthData = allAnggaran.filter(a => a.bulan === monthNum)
    if (monthData.length > 0) return monthData
    const legacyData = allAnggaran.filter(a => !a.bulan || a.bulan === 0)
    return legacyData.length > 0 ? legacyData : allAnggaran
  }, [state.anggaran, monthNum])

  // Group by category for the selected month
  const anggaranCatsForMonth = useMemo(() => {
    return anggaranForMonth.reduce((acc, item) => {
      if (!acc[item.kategori]) acc[item.kategori] = []
      acc[item.kategori].push(item)
      return acc
    }, {})
  }, [anggaranForMonth])

  // Compute category totals for KPI cards using pre-computed data
  const categoryTotals = useMemo(() => {
    return CATEGORY_TABS.map(tab => {
      const items = (anggaranCatsForMonth[tab.key] || []).filter(i => !i.is_total)
      const totalAnggaran = items.reduce((s, i) => s + (i.anggaran_awal || 0), 0)
      const totalRealisasi = items.reduce((s, i) => s + (i.realisasi || 0), 0)
      return {
        key: tab.key,
        label: tab.label,
        color: tab.color,
        anggaran: totalAnggaran,
        realisasi: totalRealisasi,
      }
    })
  }, [anggaranCatsForMonth])

  const currentData = anggaranCatsForMonth[activeCategory] || []

  // Build hierarchical display data with pre-computed values
  const hierarchyData = useMemo(() => {
    const raw = currentData.filter(i => !i.is_total)
    try {
      const tree = buildFlatHierarchy(raw)
      return tree.map(item => ({
        ...item,
        sd_bln_lalu: item.sd_bln_lalu || 0,
        bulan_ini: item.bulan_ini || 0,
        realisasi: item.realisasi || ((item.sd_bln_lalu || 0) + (item.bulan_ini || 0)),
        target_bulan: item.anggaran_awal > 0 ? item.anggaran_awal / 12 : 0,
      }))
    } catch {
      return raw.map(d => ({
        ...d, _depth: 0, _hasChildren: false,
        sd_bln_lalu: d.sd_bln_lalu || 0,
        bulan_ini: d.bulan_ini || 0,
        realisasi: d.realisasi || ((d.sd_bln_lalu || 0) + (d.bulan_ini || 0)),
        target_bulan: d.anggaran_awal > 0 ? d.anggaran_awal / 12 : 0,
      }))
    }
  }, [currentData])

  // Chart data for current category (non-total items only)
  const chartItems = currentData.filter(i => !i.is_total && i.anggaran_awal_awal > 0).slice(0, 12)
  const chartData = {
    labels: chartItems.map(a => a.nama.length > 22 ? a.nama.substring(0, 22) + '...' : a.nama),
    datasets: [
      { label: 'Anggaran', data: chartItems.map(a => a.anggaran_awal_awal), backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 6 },
      { label: 'Sd Bulan Ini', data: chartItems.map(a => a.realisasi), backgroundColor: currentTab?.color || '#10B981', borderRadius: 6 },
    ]
  }

  const toggleGroup = (idx) => {
    setExpandedGroups(prev => ({ ...prev, [idx]: !prev[idx] }))
  }
  const toggleCollapse = (kode) => setCollapsed(prev => ({ ...prev, [kode]: !prev[kode] }))

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Anggaran vs Realisasi</h1>
        <p>Laporan Realisasi Rencana Kerja Anggaran 2026 — Periode {monthLabel} 2026</p>
      </div>

      {/* KPI Cards - Summary per category */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        {categoryTotals.map(ct => (
          <div key={ct.key} className="kpi-card" style={{ cursor: 'pointer', border: activeCategory === ct.key ? `2px solid ${ct.color}` : undefined }} onClick={() => setActiveCategory(ct.key)}>
            <div className="kpi-label">{ct.label}</div>
            <div className="kpi-value" style={{ fontSize: 14, color: ct.color }}>{formatRupiah(ct.anggaran)}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Realisasi</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{formatRupiah(ct.realisasi)}</span>
            </div>
            <div style={{ background: 'var(--border-light)', borderRadius: 4, height: 6, overflow: 'hidden', marginTop: 6 }}>
              <div style={{ width: `${Math.min(ct.anggaran > 0 ? (ct.realisasi / ct.anggaran) * 100 : 0, 100)}%`, height: '100%', borderRadius: 4, background: ct.color, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        ))}
      </div>

        {/* Category Tabs + Month Filter */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {CATEGORY_TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button key={tab.key} className={`btn btn-sm ${activeCategory === tab.key ? 'btn-primary' : 'btn-outline'}`}
                style={activeCategory === tab.key ? { background: tab.color, borderColor: tab.color } : {}}
                onClick={() => setActiveCategory(tab.key)}>
                <Icon size={14} /> {tab.label}
              </button>
            )
          })}
        </div>
        {/* Month Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <Calendar size={14} color="var(--primary)" />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Periode:</span>
            {MONTHS.map(m => (
              <button key={m.value} onClick={() => setSelectedPeriod(m.value)} style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                border: m.isAudit ? '1px solid var(--primary)' : '1px solid transparent',
                background: selectedPeriod === m.value ? 'var(--primary)' : 'var(--border-light)',
                color: selectedPeriod === m.value ? 'white' : 'var(--text-muted)',
                fontWeight: selectedPeriod === m.value || m.isAudit ? 600 : 400,
                transition: 'all 0.2s',
                position: 'relative'
              }}>
                {m.label}
                {m.isAudit && <span style={{ position: 'absolute', top: -3, right: -3, width: 6, height: 6, background: 'var(--success)', borderRadius: '50%', border: '1px solid var(--bg-primary)' }} />}
              </button>
            ))}
          </div>
          {!MONTHS.find(m => m.value === selectedPeriod)?.isAudit && (
            <div style={{ fontSize: 10, color: 'var(--warning)', paddingLeft: 12 }}>
               ⚠️ Data hanya tersedia untuk Januari & April.
            </div>
          )}
        </div>

      {/* Chart */}
      {chartItems.length > 0 && (
        <div className="chart-card" style={{ marginBottom: 24 }}>
          <div className="card-header"><div className="card-title">Grafik {currentTab?.label}</div></div>
          <div style={{ height: 300 }}>
            <Bar data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter' }, usePointStyle: true, padding: 16 } }, tooltip: { backgroundColor: '#1E293B', cornerRadius: 8 } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9, family: 'Inter' }, maxRotation: 45 } }, y: { grid: { color: '#F1F5F9' }, ticks: { callback: v => (v / 1000000000).toFixed(1) + 'M', font: { family: 'Inter', size: 11 }, color: '#94A3B8' } } } }} />
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '6%' }}>No</th>
                <th style={{ width: '28%' }}>Program / Kegiatan</th>
                <th className="text-right" style={{ width: '12%' }}>Anggaran 1 Tahun</th>
                <th className="text-right" style={{ width: '11%' }}>Target/Bulan</th>
                <th className="text-right" style={{ width: '11%' }}>Sd Bln Lalu</th>
                <th className="text-right" style={{ width: '11%' }}>Bulan Ini</th>
                <th className="text-right" style={{ width: '11%' }}>Sd Bulan Ini</th>
                <th className="text-right" style={{ width: '5%' }}>%</th>
                <th style={{ width: '5%' }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {currentData.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Tidak ada data</td></tr>
              )}
              {hierarchyData.map((item, idx) => {
                const depth = item._depth || 0
                const isHeader = item._hasChildren
                const kode = String(item.kode)
                const isCollapsed = collapsed[kode]
                const persen = item.anggaran_awal > 0 ? (item.realisasi / item.anggaran_awal) * 100 : 0
                const isOverBudget = persen > 100
                // Skip children of collapsed parents
                return (
                  <tr key={idx} style={{
                    fontWeight: depth === 0 ? 700 : depth === 1 && isHeader ? 600 : 400,
                    background: depth === 0 ? 'var(--bg-secondary)' : depth === 1 && isHeader ? 'rgba(255,255,255,0.02)' : 'transparent',
                    borderTop: depth === 0 ? '2px solid var(--border)' : undefined,
                    fontSize: 12,
                  }}>
                    <td className="mono" style={{ fontSize: 12, paddingLeft: 8 + depth * 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isHeader && (
                          <span style={{ cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }} onClick={() => toggleCollapse(kode)}>
                            {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                          </span>
                        )}
                        {kode}
                      </div>
                    </td>
                    <td style={{ fontWeight: depth === 0 ? 700 : isHeader ? 600 : 500, fontSize: item.is_total ? 13 : 12, paddingLeft: 4 + depth * 10 }}>{item.nama}</td>
                    <td className="text-right mono" style={{ fontSize: 12 }}>{item.anggaran_awal ? formatRupiah(item.anggaran_awal) : '-'}</td>
                    <td className="text-right mono" style={{ fontSize: 12 }}>{item.target_bulan ? formatRupiah(Math.round(item.target_bulan)) : '-'}</td>
                    <td className="text-right mono" style={{ fontSize: 12 }}>{item.sd_bln_lalu ? formatRupiah(item.sd_bln_lalu) : '-'}</td>
                    <td className="text-right mono" style={{ fontSize: 12, fontWeight: 600 }}>{item.bulan_ini ? formatRupiah(item.bulan_ini) : '-'}</td>
                    <td className="text-right mono" style={{ fontSize: 12, fontWeight: 600, color: isOverBudget ? 'var(--danger)' : 'var(--success)' }}>
                      {item.realisasi ? formatRupiah(item.realisasi) : '-'}
                    </td>
                    <td className="text-right" style={{ fontSize: 11, color: isOverBudget ? 'var(--danger)' : undefined }}>
                      {item.anggaran_awal > 0 ? persen.toFixed(1) + '%' : '-'}
                    </td>
                    <td style={{ width: 80 }}>
                      {item.anggaran_awal > 0 && !isHeader && (
                        <div style={{ background: 'var(--border-light)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(persen, 100)}%`, height: '100%', borderRadius: 4,
                            background: isOverBudget ? 'var(--danger)' : persen > 80 ? 'var(--warning)' : 'var(--success)',
                            transition: 'width 0.5s ease'
                          }} />
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
        * Laporan Realisasi Rencana Kerja Anggaran ini menggunakan metode pencatatan Cash Basis
      </div>
    </div>
  )
}
