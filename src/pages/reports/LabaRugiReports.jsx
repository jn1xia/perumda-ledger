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

// Dynamic Calculation Helper
const generateDynamicLRData = (state, journals) => {
  if (!state || !journals) return { pendapatanItems: [], bebanItems: [], totalPendapatan: 0, totalBeban: 0, labaBersih: 0 }
  const coaFlat = state.coaFlat || []
  
  const pendapatanAccounts = coaFlat.filter(c => (c.code.startsWith('4') || c.code.startsWith('7')) && c.type === 'posting')
  const bebanAccounts = coaFlat.filter(c => (c.code.startsWith('5') || c.code.startsWith('6') || c.code.startsWith('8')) && c.type === 'posting')

  let totalPendapatan = 0
  let totalBeban = 0

  const pItems = pendapatanAccounts.map(a => {
    let d = 0, k = 0
    journals.forEach(j => {
      if (j.akun_debit && j.akun_debit.startsWith(a.code)) d += j.debit
      if (j.akun_kredit && j.akun_kredit.startsWith(a.code)) k += j.kredit
    })
    const v = k - d // Pendapatan is Credit Normal
    totalPendapatan += v
    return { code: a.code, n: a.name, v }
  }).filter(item => item.v !== 0)

  const bItems = bebanAccounts.map(a => {
    let d = 0, k = 0
    journals.forEach(j => {
      if (j.akun_debit && j.akun_debit.startsWith(a.code)) d += j.debit
      if (j.akun_kredit && j.akun_kredit.startsWith(a.code)) k += j.kredit
    })
    const v = d - k // Beban is Debit Normal
    totalBeban += v
    return { code: a.code, n: a.name, v }
  }).filter(item => item.v !== 0)

  return { pendapatanItems: pItems, bebanItems: bItems, totalPendapatan, totalBeban, labaBersih: totalPendapatan - totalBeban }
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
        <table><thead><tr><th>Akun</th><th>Sub Akun</th><th className="text-right">Jumlah</th></tr></thead>
          <tbody>
            <tr style={{background:'var(--success-light)'}}><td style={{fontWeight:700}} colSpan={3}>PENDAPATAN USAHA</td></tr>
            {pendapatanItems.map((p,i) => (
              <tr key={i}>
                <td style={{paddingLeft:24}}></td>
                <td className="mono" style={{fontSize:12,color:'var(--text-muted)'}}>{p.code} - {p.n}</td>
                <td className="text-right mono">{fmtSign(p.v)}</td>
              </tr>
            ))}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td colSpan={2}>Total Pendapatan</td><td className="text-right mono" style={{color:'var(--success)'}}>{fmtSign(totalPendapatan)}</td></tr>
            <tr style={{height:8}}><td colSpan={3}></td></tr>
            
            <tr style={{background:'var(--danger-light)'}}><td style={{fontWeight:700}} colSpan={3}>BEBAN OPERASIONAL</td></tr>
            {bebanItems.map((b,i) => (
              <tr key={i}>
                <td style={{paddingLeft:24}}></td>
                <td className="mono" style={{fontSize:12,color:'var(--text-muted)'}}>{b.code} - {b.n}</td>
                <td className="text-right mono">{fmtSign(b.v)}</td>
              </tr>
            ))}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td colSpan={2}>Total Beban</td><td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(totalBeban)}</td></tr>
            <tr style={{height:8}}><td colSpan={3}></td></tr>
            
            <tr style={{fontWeight:700,background:'var(--border-light)',fontSize:15}}><td colSpan={2}>LABA (RUGI) BERSIH</td><td className="text-right mono" style={{color: labaBersih >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(labaBersih)}</td></tr>
          </tbody></table>
      </div>
    </div>
  )
}

// Fallback for incomplete tabs
const PlaceholderTab = ({ title }) => (
  <div style={{padding: 40, textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 12}}>
    <h3 style={{marginBottom: 8}}>{title}</h3>
    <p style={{color: 'var(--text-secondary)'}}>Laporan dinamis ini sedang dalam pengembangan dan akan dirilis pada pembaruan berikutnya.</p>
  </div>
)

export function LabaRugiTriwulan() { return <PlaceholderTab title="Laba Rugi per 3 Bulan" /> }
export function LabaRugi2Bulan() { return <PlaceholderTab title="Laba Rugi per 2 Bulan" /> }
export function LabaRugiBudget() { return <PlaceholderTab title="Laba Rugi vs Budget" /> }
export function LabaRugiProject() { return <PlaceholderTab title="Laba Rugi per Project" /> }
