import { useState, useMemo } from 'react'
import { FileText, Search, Download, Printer, ChevronDown, ChevronRight, Calendar, Filter, BarChart3, Wallet, TrendingDown } from 'lucide-react'
import { formatRupiah } from '../data/sampleData.js'
import { MONTHS, PERIOD_PRESETS, periodValueToMonths } from '../utils/journalFilters.js'
import { exportXLSX } from '../utils/exportUtils.js'

import npdDataRaw from '../data/npdData.json'
import npdAnggaranRaw from '../data/npdAnggaran.json'

const KATEGORI_COLORS = {
  'Investasi': { bg: 'rgba(99,102,241,0.08)', border: '#6366f1', icon: '🏗️' },
  'Beban Operasional': { bg: 'rgba(245,158,11,0.08)', border: '#f59e0b', icon: '⚙️' },
  'Beban Umum & Administrasi': { bg: 'rgba(16,185,129,0.08)', border: '#10b981', icon: '🏢' },
}

export default function NPDReport() {
  const npdData = Array.isArray(npdDataRaw) ? npdDataRaw : []
  const [selectedPeriod, setSelectedPeriod] = useState('jan')
  const [search, setSearch] = useState('')
  const [expandedNPD, setExpandedNPD] = useState(new Set())
  const [filterKategori, setFilterKategori] = useState('all')


  const periodMonths = useMemo(() => periodValueToMonths(selectedPeriod), [selectedPeriod])

  const filtered = useMemo(() => {
    let list = npdData.filter(n => periodMonths.includes(n.bulan))
    if (filterKategori !== 'all') list = list.filter(n => n.kategori === filterKategori)
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(n =>
        (n.fileName || '').toLowerCase().includes(s) ||
        (n.npdNomor || '').toLowerCase().includes(s) ||
        (n.lineItems || []).some(li => (li.uraian || '').toLowerCase().includes(s))
      )
    }
    return list
  }, [npdData, periodMonths, filterKategori, search])

  const stats = useMemo(() => {
    const totalDiminta = filtered.reduce((s, n) => s + (n.jumlahDiminta || 0), 0)
    const totalDibayarkan = filtered.reduce((s, n) => s + (n.jumlahDibayarkan || 0), 0)
    const totalPotongan = filtered.reduce((s, n) => s + (n.potongan || 0), 0)
    const totalItems = filtered.reduce((s, n) => s + (n.lineItems || []).length, 0)
    const byKat = {}
    filtered.forEach(n => {
      if (!byKat[n.kategori]) byKat[n.kategori] = { count: 0, total: 0 }
      byKat[n.kategori].count++
      byKat[n.kategori].total += n.jumlahDiminta || 0
    })
    return { totalDiminta, totalDibayarkan, totalPotongan, totalItems, count: filtered.length, byKat }
  }, [filtered])

  // Anggaran from Excel Rekap sheets
  const anggaranData = npdAnggaranRaw || { investasi: [], umum: [], operasional: [], totals: {} }
  const anggaranTotals = anggaranData.totals || {}

  // Akumulasi Pencairan YTD (Jan s/d selected month)
  const akumulasiYTD = useMemo(() => {
    const allMonths = Array.from({ length: 12 }, (_, i) => i + 1)
    const selectedMax = Math.max(...periodMonths)
    const ytdMonths = allMonths.filter(m => m <= selectedMax)
    const ytdNPD = npdData.filter(n => ytdMonths.includes(n.bulan))
    const byKat = {}
    ytdNPD.forEach(n => {
      if (!byKat[n.kategori]) byKat[n.kategori] = 0
      byKat[n.kategori] += n.jumlahDiminta || 0
    })
    const total = ytdNPD.reduce((s, n) => s + (n.jumlahDiminta || 0), 0)
    return { total, byKat, count: ytdNPD.length }
  }, [npdData, periodMonths])

  function toggleExpand(idx) {
    setExpandedNPD(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  function handleExport() {
    const rows = []
    filtered.forEach(n => {
      rows.push([n.npdNomor, n.tanggal, n.kategori, n.fileName, n.subKegiatan, n.jumlahDiminta, n.ppn || 0, n.pph || 0, n.potongan || 0, n.jumlahDibayarkan || n.jumlahDiminta])
      ;(n.lineItems || []).forEach(li => {
        rows.push(['', '', '', `  ${li.kode} ${li.uraian}`, '', li.anggaran, li.akumulasi, li.pencairan, '', li.sisa])
      })
    })
    exportXLSX('Laporan_NPD', ['No. NPD', 'Tanggal', 'Kategori', 'Program/Beban', 'Sub Kegiatan', 'Jumlah Diminta', 'PPN', 'PPh', 'Potongan', 'Dibayarkan'], rows, 'NPD')
  }

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Nota Pencairan Dana (NPD)</h1>
          <p>Monitoring pencairan dana per program dan beban — {filtered.length} dokumen</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={handleExport}><Download size={16} /> Export Excel</button>
          <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> Cetak</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label"><FileText size={16} color="var(--primary)" /> Total NPD</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{stats.count}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stats.totalItems} rincian item</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><Wallet size={16} color="var(--primary)" /> Pencairan Periode</div>
          <div className="kpi-value" style={{ fontSize: 16 }}>{formatRupiah(stats.totalDiminta)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dana diminta</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><BarChart3 size={16} color="var(--success)" /> Akumulasi YTD</div>
          <div className="kpi-value" style={{ fontSize: 16, color: 'var(--success)' }}>{formatRupiah(akumulasiYTD.total)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Jan s/d periode ini ({akumulasiYTD.count} NPD)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><TrendingDown size={16} color="var(--danger)" /> Potongan</div>
          <div className="kpi-value" style={{ fontSize: 16, color: 'var(--danger)' }}>{formatRupiah(stats.totalPotongan)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>PPN + PPh</div>
        </div>
      </div>

      {/* Anggaran vs Realisasi Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Investasi', key: 'investasi', ...KATEGORI_COLORS['Investasi'] },
          { label: 'Beban Operasional', key: 'operasional', ...KATEGORI_COLORS['Beban Operasional'] },
          { label: 'Beban Umum & Adm', key: 'umum', ...KATEGORI_COLORS['Beban Umum & Administrasi'] },
        ].map(cat => {
          const pagu = anggaranTotals[cat.key]?.pagu || 0
          const real = anggaranTotals[cat.key]?.realisasi || 0
          const ytdKat = akumulasiYTD.byKat[cat.label] || akumulasiYTD.byKat[Object.keys(akumulasiYTD.byKat).find(k => k.includes(cat.label.split(' ')[0])) || ''] || 0
          const pct = pagu > 0 ? (real / pagu * 100) : 0
          return (
            <div key={cat.key} onClick={() => setFilterKategori(filterKategori === cat.label ? 'all' : cat.label)}
              style={{ padding: '14px 16px', borderRadius: 10, background: cat.bg, border: `1px solid ${filterKategori === cat.label ? cat.border : 'transparent'}`, cursor: 'pointer', transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{cat.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{cat.label}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Anggaran: {formatRupiah(pagu)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Realisasi: {formatRupiah(real)} ({pct.toFixed(1)}%)</div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', marginTop: 4 }}>
                <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(pct, 100)}%`, background: cat.border, transition: 'width 0.5s' }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Period Selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <Calendar size={16} color="var(--primary)" />
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Periode:</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {MONTHS.map(m => (
              <button key={m.value} onClick={() => setSelectedPeriod(m.value)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                border: selectedPeriod === m.value ? '1px solid var(--primary)' : '1px solid transparent',
                background: selectedPeriod === m.value ? 'var(--primary)' : 'var(--border-light)',
                color: selectedPeriod === m.value ? 'white' : 'var(--text-muted)',
                fontWeight: selectedPeriod === m.value ? 600 : 400, transition: 'all 0.2s'
              }}>{m.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Presets:</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PERIOD_PRESETS.map(p => (
              <button key={p.value} onClick={() => setSelectedPeriod(p.value)} style={{
                padding: '4px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: selectedPeriod === p.value ? 'var(--primary)' : 'transparent',
                color: selectedPeriod === p.value ? 'white' : 'var(--text-muted)',
                fontWeight: selectedPeriod === p.value ? 600 : 400, transition: 'all 0.2s'
              }}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="topbar-search" style={{ maxWidth: 400 }}>
          <Search /><input type="text" placeholder="Cari NPD, program, atau uraian..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {filterKategori !== 'all' && (
          <button className="btn btn-sm btn-outline" onClick={() => setFilterKategori('all')}>
            <Filter size={14} /> Reset Filter
          </button>
        )}
      </div>

      {/* NPD Table */}
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={{ width: 30 }}></th>
                <th style={{ width: '15%' }}>No. NPD</th>
                <th style={{ width: '10%' }}>Tanggal</th>
                <th style={{ width: '15%' }}>Kategori</th>
                <th>Program / Beban</th>
                <th className="text-right" style={{ width: '15%' }}>Jumlah Diminta</th>
                <th className="text-right" style={{ width: '12%' }}>Dibayarkan</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  Tidak ada data NPD untuk periode ini
                </td></tr>
              )}
              {filtered.map((n, idx) => {
                const isOpen = expandedNPD.has(idx)
                const katStyle = KATEGORI_COLORS[n.kategori] || {}
                return (
                  <>{/* eslint-disable-next-line react/jsx-key */}
                    <tr key={idx} onClick={() => toggleExpand(idx)} style={{ cursor: 'pointer' }}>
                      <td>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td className="mono" style={{ fontWeight: 600, fontSize: 12 }}>{n.npdNomor || '-'}</td>
                      <td style={{ fontSize: 12 }}>{n.tanggal}</td>
                      <td><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500,
                        background: katStyle.bg || 'var(--bg-secondary)', color: katStyle.border || 'var(--text-muted)' }}>
                        {katStyle.icon} {n.kategori}</span></td>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{n.fileName}</td>
                      <td className="text-right mono" style={{ fontWeight: 600 }}>{formatRupiah(n.jumlahDiminta)}</td>
                      <td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(n.jumlahDibayarkan || n.jumlahDiminta)}</td>
                    </tr>
                    {isOpen && (n.lineItems || []).length > 0 && (
                      <tr key={`${idx}-detail`}>
                        <td colSpan={7} style={{ padding: 0, background: 'var(--bg-subtle)' }}>
                          <table style={{ width: '100%', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-secondary)' }}>
                                <th style={{ width: '8%', padding: '6px 12px' }}>Kode</th>
                                <th style={{ padding: '6px 12px' }}>Uraian</th>
                                <th className="text-right" style={{ width: '15%', padding: '6px 12px' }}>Anggaran</th>
                                <th className="text-right" style={{ width: '15%', padding: '6px 12px' }}>Akumulasi</th>
                                <th className="text-right" style={{ width: '15%', padding: '6px 12px' }}>Pencairan Ini</th>
                                <th className="text-right" style={{ width: '15%', padding: '6px 12px' }}>Sisa</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(n.lineItems || []).map((li, j) => {
                                const pct = li.anggaran > 0 ? ((li.anggaran - li.sisa) / li.anggaran * 100) : 0
                                return (
                                  <tr key={j}>
                                    <td style={{ padding: '4px 12px' }} className="mono">{li.kode}</td>
                                    <td style={{ padding: '4px 12px' }}>{li.uraian}</td>
                                    <td className="text-right mono" style={{ padding: '4px 12px' }}>{formatRupiah(li.anggaran)}</td>
                                    <td className="text-right mono" style={{ padding: '4px 12px' }}>{formatRupiah(li.akumulasi)}</td>
                                    <td className="text-right mono" style={{ padding: '4px 12px', fontWeight: 600, color: li.pencairan > 0 ? 'var(--primary)' : '' }}>{formatRupiah(li.pencairan)}</td>
                                    <td className="text-right" style={{ padding: '4px 12px' }}>
                                      <span className="mono">{formatRupiah(li.sisa)}</span>
                                      {li.anggaran > 0 && <div style={{ height: 3, borderRadius: 2, background: 'var(--border-light)', marginTop: 2 }}>
                                        <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(pct, 100)}%`,
                                          background: pct > 95 ? 'var(--danger)' : pct > 80 ? 'var(--warning)' : 'var(--success)' }} />
                                      </div>}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td colSpan={5}>TOTAL PERIODE</td>
                  <td className="text-right mono">{formatRupiah(stats.totalDiminta)}</td>
                  <td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(stats.totalDibayarkan || stats.totalDiminta)}</td>
                </tr>
                <tr style={{ fontWeight: 600, background: 'rgba(16,185,129,0.06)' }}>
                  <td colSpan={5} style={{ color: 'var(--success)' }}>AKUMULASI PENCAIRAN (Jan s/d Periode Ini)</td>
                  <td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(akumulasiYTD.total)}</td>
                  <td className="text-right mono" style={{ color: 'var(--text-muted)' }}>{akumulasiYTD.count} NPD</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
