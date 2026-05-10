import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { Printer, Download, FileText, TrendingUp, TrendingDown, Wallet, BarChart3, Building2, Briefcase } from 'lucide-react'
import { printReport, exportCSV } from '../utils/exportUtils.js'

const lraTabs = [
  { id: 'penerimaan', label: 'Tabel Penerimaan', icon: TrendingUp, catKey: 'penerimaan' },
  { id: 'rekap-penerimaan', label: 'Rekap Penerimaan', icon: Wallet, catKey: 'penerimaan' },
  { id: 'investasi', label: 'Investasi', icon: Building2, catKey: 'bebanInvestasi' },
  { id: 'rekap-investasi', label: 'Rekap Investasi', icon: BarChart3, catKey: 'bebanInvestasi' },
  { id: 'beban-ops', label: 'Beban Operasional', icon: TrendingDown, catKey: 'bebanOperasional' },
  { id: 'rekap-beban-ops', label: 'Rekap Beban Ops', icon: FileText, catKey: 'bebanOperasional' },
  { id: 'beban-umum', label: 'Beban Umum', icon: Briefcase, catKey: 'bebanUmum' },
  { id: 'rekap-beban-umum', label: 'Rekap Beban Umum', icon: FileText, catKey: 'bebanUmum' },
]

function ReportHeader({ title, subtitle, onPrint, onExport }) {
  return (
    <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div className="company">PERUMDA PASAR BAIMAN</div>
        <h2>{title}</h2>
        <div className="period">{subtitle || 'Untuk Periode yang Berakhir 30 April 2026'}</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', gap:6, fontSize:13, padding:'8px 14px', borderRadius:8 }} onClick={onPrint}><Printer size={14} /> Cetak Laporan</button>
        <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', gap:6, fontSize:13, padding:'8px 14px', borderRadius:8 }} onClick={onExport}><Download size={14} /> Unduh Excel (.xlsx)</button>
      </div>
    </div>
  )
}

export default function LRA() {
  const { state } = useApp()
  const [activeTab, setActiveTab] = useState('penerimaan')
  const anggaranCats = state.anggaranCategories || {}

  // Get active tab info
  const activeTabInfo = lraTabs.find(t => t.id === activeTab) || lraTabs[0]
  const catKey = activeTabInfo.catKey
  const currentData = (anggaranCats[catKey] || []).filter(i => !i.is_total)

  // Transform for LRA display
  const lraData = useMemo(() => {
    return currentData.map(d => ({
      kode: d.kode,
      nama: d.nama,
      anggaran: d.anggaran_awal || 0,
      realisasiJurnal: d.realisasi || 0,
      selisih: (d.anggaran_awal || 0) - (d.realisasi || 0),
      persen: d.anggaran_awal > 0 ? ((d.realisasi || 0) / d.anggaran_awal * 100) : 0,
    }))
  }, [currentData])

  function LRATable({ data, title }) {
    const totalAnggaran = data.reduce((s, d) => s + d.anggaran, 0)
    const totalRealisasi = data.reduce((s, d) => s + d.realisasiJurnal, 0)
    const totalSelisih = totalAnggaran - totalRealisasi
    const totalPersen = totalAnggaran > 0 ? (totalRealisasi / totalAnggaran * 100) : 0
    return (
      <table>
        <thead>
          <tr><th>Kode</th><th>Uraian</th><th className="text-right">Anggaran</th><th className="text-right">Realisasi</th><th className="text-right">Selisih</th><th className="text-right">%</th><th style={{width:100}}>Progress</th></tr>
        </thead>
        <tbody>
          {data.map(d => (
            <tr key={d.kode}>
              <td className="mono">{d.kode}</td>
              <td style={{fontWeight:500}}>{d.nama}</td>
              <td className="text-right mono">{formatRupiah(d.anggaran_awal)}</td>
              <td className="text-right mono">{formatRupiah(d.realisasiJurnal)}</td>
              <td className="text-right mono" style={{color: d.selisih >= 0 ? 'var(--success)' : 'var(--danger)'}}>{d.selisih >= 0 ? '' : '-'}{formatRupiah(Math.abs(d.selisih))}</td>
              <td className="text-right">{d.persen.toFixed(1)}%</td>
              <td>
                <div style={{background:'var(--border-light)', borderRadius:4, height:8, overflow:'hidden'}}>
                  <div style={{width:`${Math.min(d.persen,100)}%`, height:'100%', borderRadius:4, background: d.persen > 95 ? 'var(--danger)' : d.persen > 80 ? 'var(--warning)' : 'var(--success)', transition:'width 0.5s ease'}} />
                </div>
              </td>
            </tr>
          ))}
          <tr style={{fontWeight:700, borderTop:'2px solid var(--border)', background:'var(--border-light)'}}>
            <td colSpan={2}>TOTAL {title}</td>
            <td className="text-right mono">{formatRupiah(totalAnggaran)}</td>
            <td className="text-right mono">{formatRupiah(totalRealisasi)}</td>
            <td className="text-right mono" style={{color: totalSelisih >= 0 ? 'var(--success)' : 'var(--danger)'}}>{formatRupiah(totalSelisih)}</td>
            <td className="text-right">{totalPersen.toFixed(1)}%</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    )
  }

  function RekapTable({ data, title }) {
    const totalAnggaran = data.reduce((s, d) => s + d.anggaran, 0)
    const totalRealisasi = data.reduce((s, d) => s + d.realisasiJurnal, 0)
    return (
      <div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24}}>
          <div className="kpi-card" style={{textAlign:'center'}}>
            <div className="kpi-label" style={{justifyContent:'center'}}>Total Anggaran</div>
            <div className="kpi-value" style={{color:'var(--primary)'}}>{formatRupiah(totalAnggaran)}</div>
          </div>
          <div className="kpi-card" style={{textAlign:'center'}}>
            <div className="kpi-label" style={{justifyContent:'center'}}>Total Realisasi</div>
            <div className="kpi-value" style={{color:'var(--success)'}}>{formatRupiah(totalRealisasi)}</div>
          </div>
          <div className="kpi-card" style={{textAlign:'center'}}>
            <div className="kpi-label" style={{justifyContent:'center'}}>Sisa Anggaran</div>
            <div className="kpi-value" style={{color: (totalAnggaran - totalRealisasi) >= 0 ? 'var(--success)' : 'var(--danger)'}}>{formatRupiah(totalAnggaran - totalRealisasi)}</div>
          </div>
        </div>
        <table>
          <thead><tr><th>No</th><th>Uraian</th><th className="text-right">Anggaran</th><th className="text-right">Realisasi</th><th className="text-right">%</th><th className="text-center">Status</th></tr></thead>
          <tbody>
            {data.map((d, i) => {
              const pct = d.persen
              const status = pct >= 100 ? 'Terealisasi' : pct >= 75 ? 'Hampir' : pct >= 50 ? 'Berjalan' : pct > 0 ? 'Rendah' : 'Belum'
              const badge = pct >= 100 ? 'green' : pct >= 75 ? 'blue' : pct >= 50 ? 'orange' : 'red'
              return (
                <tr key={d.kode}>
                  <td>{i+1}</td>
                  <td style={{fontWeight:500}}>{d.nama}</td>
                  <td className="text-right mono">{formatRupiah(d.anggaran_awal)}</td>
                  <td className="text-right mono">{formatRupiah(d.realisasiJurnal)}</td>
                  <td className="text-right">{pct.toFixed(1)}%</td>
                  <td className="text-center"><span className={`badge ${badge}`}>{status}</span></td>
                </tr>
              )
            })}
            <tr style={{fontWeight:700, borderTop:'2px solid var(--border)'}}>
              <td colSpan={2}>JUMLAH</td>
              <td className="text-right mono">{formatRupiah(totalAnggaran)}</td>
              <td className="text-right mono">{formatRupiah(totalRealisasi)}</td>
              <td className="text-right">{totalAnggaran > 0 ? (totalRealisasi/totalAnggaran*100).toFixed(1) : 0}%</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  function getActiveTitle() {
    if (activeTab.includes('penerimaan')) return 'PENERIMAAN'
    if (activeTab.includes('investasi')) return 'INVESTASI'
    if (activeTab.includes('beban-ops')) return 'BEBAN OPERASIONAL'
    if (activeTab.includes('beban-umum')) return 'BEBAN UMUM'
    return ''
  }

  function getSubtitle() {
    const isRekap = activeTab.startsWith('rekap')
    const title = getActiveTitle()
    if (isRekap) {
      return `Rekapitulasi ${title} — Per 3 Bulan (Triwulan)`
    }
    return `Tabel ${title} — Periode April 2026`
  }

  function handleExport() {
    const title = getActiveTitle()
    exportCSV(`LRA_${title}`, ['Kode','Uraian','Anggaran','Realisasi','Selisih','%'],
      lraData.map(d => [d.kode, d.nama, d.anggaran, d.realisasiJurnal, d.selisih, d.persen.toFixed(1)])
    )
  }

  const isRekap = activeTab.startsWith('rekap')

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Laporan Realisasi Anggaran</h1>
          <p>LRA — Sesuai Standar Akuntansi Keuangan Entitas Privat (SAK EP)</p>
        </div>
        <button className="btn btn-outline" onClick={() => printReport('LRA — Perumda Pasar Baiman')}><Printer size={16} /> Cetak Laporan</button>
      </div>

      <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:20}}>
        {lraTabs.map(tab => (
          <button key={tab.id} className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-outline'}`} style={{fontSize:12, padding:'6px 12px'}} onClick={() => setActiveTab(tab.id)}>
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="report-doc">
        <ReportHeader
          title={`LAPORAN REALISASI ANGGARAN — ${getActiveTitle()}`}
          subtitle={getSubtitle()}
          onPrint={() => printReport(`LRA ${getActiveTitle()}`)}
          onExport={handleExport}
        />
        <div className="report-doc-body">
          {isRekap ? <RekapTable data={lraData} title={getActiveTitle()} /> : <LRATable data={lraData} title={getActiveTitle()} />}
        </div>
      </div>
    </div>
  )
}
