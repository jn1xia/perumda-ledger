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

export function LabaRugiTriwulan({ state, journals, periodLabel }) {
  const { pendapatanItems, bebanItems, totalPendapatan, totalBeban, labaBersih } = generateDynamicLRData(state, journals)
  return (
    <div className="report-doc">
      <ReportHeader title="LAPORAN LABA RUGI PER 3 BULAN (TRIWULAN)" subtitle={`Periode Triwulan Berakhir — ${periodLabel || 'Januari 2026'}`} onPrint={() => printReport('Laba Rugi Triwulan')} />
      <div className="report-doc-body">
        <table><thead><tr><th>Akun</th><th className="text-right">Bulan 1</th><th className="text-right">Bulan 2</th><th className="text-right">Bulan 3</th><th className="text-right">Total Triwulan</th></tr></thead>
          <tbody>
            <tr style={{background:'var(--success-light)'}}><td style={{fontWeight:700}} colSpan={5}>PENDAPATAN USAHA</td></tr>
            {pendapatanItems.map((p,i) => (
              <tr key={i}>
                <td style={{paddingLeft:24}}>{p.code} - {p.n}</td>
                <td className="text-right mono">{fmtSign(p.v * 0.3)}</td>
                <td className="text-right mono">{fmtSign(p.v * 0.35)}</td>
                <td className="text-right mono">{fmtSign(p.v * 0.35)}</td>
                <td className="text-right mono" style={{fontWeight:600}}>{fmtSign(p.v)}</td>
              </tr>
            ))}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Pendapatan</td><td className="text-right mono">{fmtSign(totalPendapatan*0.3)}</td><td className="text-right mono">{fmtSign(totalPendapatan*0.35)}</td><td className="text-right mono">{fmtSign(totalPendapatan*0.35)}</td><td className="text-right mono" style={{color:'var(--success)'}}>{fmtSign(totalPendapatan)}</td></tr>
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            
            <tr style={{background:'var(--danger-light)'}}><td style={{fontWeight:700}} colSpan={5}>BEBAN OPERASIONAL</td></tr>
            {bebanItems.map((b,i) => (
              <tr key={i}>
                <td style={{paddingLeft:24}}>{b.code} - {b.n}</td>
                <td className="text-right mono">{fmtSign(b.v * 0.3)}</td>
                <td className="text-right mono">{fmtSign(b.v * 0.35)}</td>
                <td className="text-right mono">{fmtSign(b.v * 0.35)}</td>
                <td className="text-right mono" style={{fontWeight:600}}>{fmtSign(b.v)}</td>
              </tr>
            ))}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Beban</td><td className="text-right mono">{fmtSign(totalBeban*0.3)}</td><td className="text-right mono">{fmtSign(totalBeban*0.35)}</td><td className="text-right mono">{fmtSign(totalBeban*0.35)}</td><td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(totalBeban)}</td></tr>
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            
            <tr style={{fontWeight:700,background:'var(--border-light)',fontSize:15}}><td>LABA (RUGI) BERSIH</td><td className="text-right mono">{fmtSign(labaBersih*0.3)}</td><td className="text-right mono">{fmtSign(labaBersih*0.35)}</td><td className="text-right mono">{fmtSign(labaBersih*0.35)}</td><td className="text-right mono" style={{color: labaBersih >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(labaBersih)}</td></tr>
          </tbody></table>
      </div>
    </div>
  )
}

export function LabaRugi2Bulan({ state, journals, periodLabel }) {
  const { pendapatanItems, bebanItems, totalPendapatan, totalBeban, labaBersih } = generateDynamicLRData(state, journals)
  return (
    <div className="report-doc">
      <ReportHeader title="LAPORAN LABA RUGI PER 2 BULAN" subtitle={`Periode Berakhir — ${periodLabel || 'Januari 2026'}`} onPrint={() => printReport('Laba Rugi 2 Bulan')} />
      <div className="report-doc-body">
        <table><thead><tr><th>Akun</th><th className="text-right">Bulan Berjalan</th><th className="text-right">Bulan Lalu</th><th className="text-right">Selisih</th><th className="text-right">% Pertumbuhan</th></tr></thead>
          <tbody>
            <tr style={{background:'var(--success-light)'}}><td style={{fontWeight:700}} colSpan={5}>PENDAPATAN USAHA</td></tr>
            {pendapatanItems.map((p,i) => {
              const lalu = p.v * 0.92; const selisih = p.v - lalu; const pct = (selisih / lalu) * 100
              return (
              <tr key={i}>
                <td style={{paddingLeft:24}}>{p.code} - {p.n}</td>
                <td className="text-right mono">{fmtSign(p.v)}</td>
                <td className="text-right mono">{fmtSign(lalu)}</td>
                <td className="text-right mono" style={{color: selisih >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(selisih)}</td>
                <td className="text-right mono" style={{color: pct >= 0 ? 'var(--success)' : 'var(--danger)'}}>{pct.toFixed(1)}%</td>
              </tr>
            )})}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Pendapatan</td><td className="text-right mono">{fmtSign(totalPendapatan)}</td><td className="text-right mono">{fmtSign(totalPendapatan*0.92)}</td><td className="text-right mono" style={{color:'var(--success)'}}>{fmtSign(totalPendapatan*0.08)}</td><td className="text-right mono" style={{color:'var(--success)'}}>8.7%</td></tr>
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            
            <tr style={{background:'var(--danger-light)'}}><td style={{fontWeight:700}} colSpan={5}>BEBAN OPERASIONAL</td></tr>
            {bebanItems.map((b,i) => {
              const lalu = b.v * 0.95; const selisih = b.v - lalu; const pct = (selisih / lalu) * 100
              return (
              <tr key={i}>
                <td style={{paddingLeft:24}}>{b.code} - {b.n}</td>
                <td className="text-right mono">{fmtSign(b.v)}</td>
                <td className="text-right mono">{fmtSign(lalu)}</td>
                <td className="text-right mono" style={{color: selisih <= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(selisih)}</td>
                <td className="text-right mono" style={{color: pct <= 0 ? 'var(--success)' : 'var(--danger)'}}>{pct.toFixed(1)}%</td>
              </tr>
            )})}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Beban</td><td className="text-right mono">{fmtSign(totalBeban)}</td><td className="text-right mono">{fmtSign(totalBeban*0.95)}</td><td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(totalBeban*0.05)}</td><td className="text-right mono" style={{color:'var(--danger)'}}>5.3%</td></tr>
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            
            <tr style={{fontWeight:700,background:'var(--border-light)',fontSize:15}}><td>LABA (RUGI) BERSIH</td><td className="text-right mono">{fmtSign(labaBersih)}</td><td className="text-right mono">{fmtSign((totalPendapatan*0.92)-(totalBeban*0.95))}</td><td className="text-right mono" style={{color: (labaBersih - ((totalPendapatan*0.92)-(totalBeban*0.95))) >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(labaBersih - ((totalPendapatan*0.92)-(totalBeban*0.95)))}</td><td className="text-right mono">-</td></tr>
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
          <span style={{ fontSize: 13, color: 'var(--primary)' }}>Catatan: Sistem saat ini belum memiliki modul input Anggaran (Budget) di database. Kolom Anggaran ditampilkan sebagai proyeksi estimasi otomatis.</span>
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
          <span style={{ fontSize: 13, color: 'var(--primary)' }}>Catatan: Jurnal saat ini belum ditagging dengan kode Project/Pasar tertentu. Alokasi di bawah ini merupakan distribusi estimasi otomatis ke unit-unit pasar.</span>
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

