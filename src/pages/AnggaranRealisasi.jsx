import { useState, useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah, PERIOD_OPTIONS } from '../data/sampleData.js'
import { Pencil, Trash2, Plus, Save, X, TrendingUp, TrendingDown, Target, DollarSign, ChevronDown, ChevronRight, Filter } from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const CATEGORY_TABS = [
  { key: 'penerimaan', label: 'Penerimaan', color: '#10B981', icon: TrendingUp },
  { key: 'bebanInvestasi', label: 'Beban Investasi', color: '#8B5CF6', icon: Target },
  { key: 'bebanUmum', label: 'Beban Umum', color: '#F59E0B', icon: DollarSign },
  { key: 'bebanOperasional', label: 'Beban Operasional', color: '#E54D42', icon: TrendingDown },
]

export default function AnggaranRealisasi() {
  const { state } = useApp()
  const anggaranCats = state.anggaranCategories || {}
  const [activeCategory, setActiveCategory] = useState('penerimaan')
  const [selectedPeriod, setSelectedPeriod] = useState('apr')
  const [expandedGroups, setExpandedGroups] = useState({})

  const currentData = anggaranCats[activeCategory] || []
  const currentTab = CATEGORY_TABS.find(t => t.key === activeCategory)

  // Compute category totals for KPI cards
  const categoryTotals = useMemo(() => {
    return CATEGORY_TABS.map(tab => {
      const items = anggaranCats[tab.key] || []
      const totals = items.filter(i => i.is_total)
      const grandTotal = totals.length > 0 ? totals[totals.length - 1] : null
      return {
        key: tab.key,
        label: tab.label,
        color: tab.color,
        anggaran: grandTotal?.anggaran_awal || items.reduce((s, i) => s + (i.is_total ? 0 : (i.anggaran_awal_awal || 0)), 0),
        realisasi: grandTotal?.realisasi || items.reduce((s, i) => s + (i.is_total ? 0 : (i.realisasi || 0)), 0),
        capaian: grandTotal?.persentase || 0,
      }
    })
  }, [anggaranCats])

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

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Anggaran vs Realisasi</h1>
        <p>Laporan Realisasi Rencana Kerja Anggaran 2026 — Periode April 2026</p>
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

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={14} color="var(--text-muted)" />
          <select className="form-select" style={{ width: 'auto', fontSize: 12 }} value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}>
            {PERIOD_OPTIONS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
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
              {currentData.map((item, idx) => {
                const persen = item.anggaran_awal > 0 ? (item.realisasi / item.anggaran_awal) * 100 : 0
                const isOverBudget = persen > 100
                return (
                  <tr key={idx} style={item.is_total ? { fontWeight: 700, background: 'var(--bg-secondary)', borderTop: '2px solid var(--border)' } : {}}>
                    <td className="mono" style={{ fontSize: 12 }}>{item.kode}</td>
                    <td style={{ fontWeight: item.is_total ? 700 : 500, fontSize: item.is_total ? 13 : 12, paddingLeft: item.is_total ? 8 : 16 }}>{item.nama}</td>
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
                      {item.anggaran_awal > 0 && !item.is_total && (
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
