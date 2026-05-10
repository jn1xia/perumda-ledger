import { Printer, Download } from 'lucide-react'
import { printReport } from '../../utils/exportUtils.js'

const fmt = v => 'Rp ' + Math.abs(v).toLocaleString('id-ID')
const fmtSign = v => (v < 0 ? '-' : '') + fmt(v)

// Shared report header
function ReportHeader({ title, subtitle, onPrint }) {
  return (
    <div className="report-doc-header" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div>
        <div className="company">PERUMDA PASAR BAIMAN</div>
        <h2>{title}</h2>
        <div className="period">{subtitle}</div>
      </div>
      <button className="btn btn-outline" style={{color:'white',borderColor:'rgba(255,255,255,0.5)',background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',gap:6,fontSize:13,padding:'8px 14px',borderRadius:8}} onClick={onPrint}>
        <Printer size={14} /> Cetak Laporan
      </button>
    </div>
  )
}

const generateDynamicNeracaData = (state, journalsYTD) => {
  if (!state || !journalsYTD) return { asetItems: [], kewajibanItems: [], ekuitasItems: [], totalAset: 0, totalKewajiban: 0, totalEkuitas: 0 }
  
  const coaFlat = state.coaFlat || []
  
  // Calculate Laba Bersih YTD (Strictly Journals)
  const pendapatanYTD = coaFlat.filter(c => (c.code.startsWith('4') || c.code.startsWith('7')) && c.type === 'posting').reduce((sum, a) => {
    let d=0, k=0; journalsYTD.forEach(j => { if(j.akun_debit && j.akun_debit.startsWith(a.code)) d+=j.debit; if(j.akun_kredit && j.akun_kredit.startsWith(a.code)) k+=j.kredit }); return sum + k - d;
  }, 0)
  const bebanYTD = coaFlat.filter(c => (c.code.startsWith('5') || c.code.startsWith('6') || c.code.startsWith('8')) && c.type === 'posting').reduce((sum, a) => {
    let d=0, k=0; journalsYTD.forEach(j => { if(j.akun_debit && j.akun_debit.startsWith(a.code)) d+=j.debit; if(j.akun_kredit && j.akun_kredit.startsWith(a.code)) k+=j.kredit }); return sum + d - k;
  }, 0)
  const labaBersihYTD = pendapatanYTD - bebanYTD

  const calcBalances = (prefix, isCreditNormal) => {
    const accts = coaFlat.filter(c => c.code.startsWith(prefix) && c.type === 'posting')
    let total = 0
    const items = accts.map(a => {
      let d=0, k=0; journalsYTD.forEach(j => { if(j.akun_debit && j.akun_debit.startsWith(a.code)) d+=j.debit; if(j.akun_kredit && j.akun_kredit.startsWith(a.code)) k+=j.kredit });
      const v = isCreditNormal ? (a.saldo_awal || 0) + k - d : (a.saldo_awal || 0) + d - k;
      total += v;
      return { code: a.code, n: a.name, v }
    }).filter(i => i.v !== 0)
    return { items, total }
  }

  const aset = calcBalances('1', false)
  const kewajiban = calcBalances('2', true)
  const ekuitasData = calcBalances('3', true)
  
  const ekuitasItems = [...ekuitasData.items, { code: '', n: 'Laba/Rugi Berjalan (YTD)', v: labaBersihYTD }]
  const totalEkuitas = ekuitasData.total + labaBersihYTD

  return {
    asetItems: aset.items, totalAset: aset.total,
    kewajibanItems: kewajiban.items, totalKewajiban: kewajiban.total,
    ekuitasItems, totalEkuitas
  }
}

// --- Neraca Saldo per Tanggal ---
export function NeracaSaldoTanggal({ state, journals, periodLabel, formatRupiah }) {
  const posted = journals || []
  function flat(nodes, r=[]) { nodes.forEach(n => { if(n.type==='posting') r.push(n); if(n.children) flat(n.children,r) }); return r }
  const accts = flat(state.coaTree || [])
  const rows = accts.map(a => {
    let d=0, k=0
    posted.forEach(j => { const dc=j.akun_debit?.split(' ')[0], kc=j.akun_kredit?.split(' ')[0]; if(dc===a.code) d+=j.debit; if(kc===a.code) k+=j.kredit })
    return { ...a, debit: d, kredit: k }
  }).filter(r => r.debit || r.kredit)
  return (
    <div className="report-doc">
      <ReportHeader title="NERACA SALDO PER TANGGAL" subtitle={`Per ${periodLabel || 'Januari 2026'} — Berdasarkan Tanggal Jurnal`} onPrint={() => printReport('Neraca Saldo per Tanggal')} />
      <div className="report-doc-body">
        <table><thead><tr><th>Kode</th><th>Nama Akun</th><th>Tanggal Terakhir</th><th className="text-right">Debit</th><th className="text-right">Kredit</th></tr></thead>
          <tbody>
            {rows.map(r => {
              const lastJournal = posted.filter(j => j.akun_debit?.startsWith(r.code) || j.akun_kredit?.startsWith(r.code)).sort((a,b) => b.tanggal.localeCompare(a.tanggal))[0]
              return (
                <tr key={r.code}><td className="mono">{r.code}</td><td>{r.name}</td><td style={{fontSize:12,color:'var(--text-muted)'}}>{lastJournal?.tanggal || '-'}</td><td className="text-right mono">{r.debit ? formatRupiah(r.debit) : '-'}</td><td className="text-right mono">{r.kredit ? formatRupiah(r.kredit) : '-'}</td></tr>
              )
            })}
          </tbody></table>
      </div>
    </div>
  )
}

// --- Neraca Saldo per Tipe ---
export function NeracaSaldoType({ state, journals, periodLabel, formatRupiah }) {
  const posted = journals || []
  function flat(nodes, r=[]) { nodes.forEach(n => { if(n.type==='posting') r.push(n); if(n.children) flat(n.children,r) }); return r }
  const accts = flat(state.coaTree || [])
  const rows = accts.map(a => {
    let d=0, k=0
    posted.forEach(j => { const dc=j.akun_debit?.split(' ')[0], kc=j.akun_kredit?.split(' ')[0]; if(dc===a.code) d+=j.debit; if(kc===a.code) k+=j.kredit })
    return { ...a, debit: d, kredit: k }
  }).filter(r => r.debit || r.kredit)
  const categories = ['Aset','Kewajiban','Ekuitas','Pendapatan','Beban']
  const catColors = { Aset:'var(--primary-light)', Kewajiban:'var(--danger-light)', Ekuitas:'var(--success-light)', Pendapatan:'var(--success-light)', Beban:'var(--danger-light)' }
  return (
    <div className="report-doc">
      <ReportHeader title="NERACA SALDO PER TIPE AKUN" subtitle={`Per ${periodLabel || 'Januari 2026'} — Berdasarkan Kategori`} onPrint={() => printReport('Neraca Saldo per Tipe')} />
      <div className="report-doc-body">
        {categories.map(cat => {
          const catRows = rows.filter(r => r.category === cat)
          if (catRows.length === 0) return null
          const totD = catRows.reduce((s,r) => s+r.debit, 0), totK = catRows.reduce((s,r) => s+r.kredit, 0)
          return (
            <div key={cat} style={{marginBottom:20}}>
              <div style={{background:catColors[cat],padding:'10px 16px',borderRadius:'var(--radius-sm)',fontWeight:700,marginBottom:4}}>{cat.toUpperCase()}</div>
              <table><thead><tr><th>Kode</th><th>Nama Akun</th><th className="text-right">Debit</th><th className="text-right">Kredit</th></tr></thead>
                <tbody>
                  {catRows.map(r => <tr key={r.code}><td className="mono">{r.code}</td><td>{r.name}</td><td className="text-right mono">{r.debit ? formatRupiah(r.debit) : '-'}</td><td className="text-right mono">{r.kredit ? formatRupiah(r.kredit) : '-'}</td></tr>)}
                  <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td colSpan={2}>Subtotal {cat}</td><td className="text-right mono">{formatRupiah(totD)}</td><td className="text-right mono">{formatRupiah(totK)}</td></tr>
                </tbody></table>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Neraca MTD/YTD ---
export function NeracaMTDYTD({ state, journalsYTD, periodLabel }) {
  const period = periodLabel || 'Januari 2026'
  const { asetItems, kewajibanItems, ekuitasItems, totalAset, totalKewajiban, totalEkuitas } = generateDynamicNeracaData(state, journalsYTD)
  
  return (
    <div className="report-doc">
      <ReportHeader title="NERACA MTD / YTD" subtitle={`Month-to-Date & Year-to-Date — ${period}`} onPrint={() => printReport('Neraca MTD/YTD')} />
      <div className="report-doc-body">
        <table><thead><tr><th>Akun</th><th className="text-right">Saldo YTD</th><th className="text-right">% of Total</th></tr></thead>
          <tbody>
            <tr style={{background:'var(--primary-light)'}}><td style={{fontWeight:700}} colSpan={3}>ASET</td></tr>
            {asetItems.map((a,i) => <tr key={i}><td style={{paddingLeft:32}}>{a.code} - {a.n}</td><td className="text-right mono">{fmtSign(a.v)}</td><td className="text-right mono">{totalAset ? ((a.v/totalAset)*100).toFixed(1)+'%' : '0%'}</td></tr>)}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Aset</td><td className="text-right mono">{fmtSign(totalAset)}</td><td className="text-right mono">100%</td></tr>
            <tr style={{height:12}}><td colSpan={3}></td></tr>
            <tr style={{background:'var(--danger-light)'}}><td style={{fontWeight:700}} colSpan={3}>KEWAJIBAN</td></tr>
            {kewajibanItems.map((k,i) => <tr key={i}><td style={{paddingLeft:32}}>{k.code} - {k.n}</td><td className="text-right mono">{fmtSign(k.v)}</td><td className="text-right mono">{totalKewajiban+totalEkuitas ? ((k.v/(totalKewajiban+totalEkuitas))*100).toFixed(1)+'%' : '0%'}</td></tr>)}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Kewajiban</td><td className="text-right mono">{fmtSign(totalKewajiban)}</td><td className="text-right mono">-</td></tr>
            <tr style={{height:12}}><td colSpan={3}></td></tr>
            <tr style={{background:'var(--success-light)'}}><td style={{fontWeight:700}} colSpan={3}>EKUITAS</td></tr>
            {ekuitasItems.map((e,i) => <tr key={i}><td style={{paddingLeft:32}}>{e.code ? `${e.code} - ` : ''}{e.n}</td><td className="text-right mono" style={{color:e.v<0?'var(--danger)':undefined}}>{fmtSign(e.v)}</td><td className="text-right mono">-</td></tr>)}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td>Total Ekuitas</td><td className="text-right mono">{fmtSign(totalEkuitas)}</td><td className="text-right mono">-</td></tr>
            <tr style={{height:8}}><td colSpan={3}></td></tr>
            <tr style={{fontWeight:700,background:'var(--border-light)',fontSize:15}}><td>Total Kewajiban & Ekuitas</td><td className="text-right mono">{fmtSign(totalKewajiban+totalEkuitas)}</td><td className="text-right mono">100%</td></tr>
          </tbody></table>
      </div>
    </div>
  )
}

// --- Neraca Detail ---
export function NeracaDetail({ state, journals, periodLabel }) {
  const period = periodLabel || 'Januari 2026'
  const { asetItems, kewajibanItems, ekuitasItems, totalAset, totalKewajiban, totalEkuitas } = generateDynamicNeracaData(state, journals)
  return (
    <div className="report-doc">
      <ReportHeader title="NERACA DETAIL" subtitle={`Per ${period} — Rincian Sub-Akun`} onPrint={() => printReport('Neraca Detail')} />
      <div className="report-doc-body">
        <table><thead><tr><th>Akun</th><th>Sub Akun</th><th className="text-right">Jumlah</th></tr></thead>
          <tbody>
            <tr style={{background:'var(--primary-light)'}}><td style={{fontWeight:700}} colSpan={3}>ASET</td></tr>
            {asetItems.map((a,i) => (
              <tr key={i}>
                <td style={{paddingLeft:24}}></td>
                <td className="mono" style={{fontSize:12,color:'var(--text-muted)'}}>{a.code} - {a.n}</td>
                <td className="text-right mono">{fmtSign(a.v)}</td>
              </tr>
            ))}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td colSpan={2}>Total Aset</td><td className="text-right mono" style={{color:'var(--primary)'}}>{fmtSign(totalAset)}</td></tr>
            <tr style={{height:12}}><td colSpan={3}></td></tr>
            
            <tr style={{background:'var(--danger-light)'}}><td style={{fontWeight:700}} colSpan={3}>KEWAJIBAN</td></tr>
            {kewajibanItems.map((k,i) => (
              <tr key={i}>
                <td style={{paddingLeft:24}}></td>
                <td className="mono" style={{fontSize:12,color:'var(--text-muted)'}}>{k.code} - {k.n}</td>
                <td className="text-right mono">{fmtSign(k.v)}</td>
              </tr>
            ))}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td colSpan={2}>Total Kewajiban</td><td className="text-right mono">{fmtSign(totalKewajiban)}</td></tr>
            <tr style={{height:12}}><td colSpan={3}></td></tr>

            <tr style={{background:'var(--success-light)'}}><td style={{fontWeight:700}} colSpan={3}>EKUITAS</td></tr>
            {ekuitasItems.map((e,i) => (
              <tr key={i}>
                <td style={{paddingLeft:24}}></td>
                <td className="mono" style={{fontSize:12,color:'var(--text-muted)'}}>{e.code ? `${e.code} - ` : ''}{e.n}</td>
                <td className="text-right mono" style={{color:e.v<0?'var(--danger)':undefined}}>{fmtSign(e.v)}</td>
              </tr>
            ))}
            <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td colSpan={2}>Total Ekuitas</td><td className="text-right mono">{fmtSign(totalEkuitas)}</td></tr>
            <tr style={{height:8}}><td colSpan={3}></td></tr>
            <tr style={{fontWeight:700,background:'var(--border-light)',fontSize:15,borderTop:'2px solid var(--border)'}}><td colSpan={2}>TOTAL KEWAJIBAN & EKUITAS</td><td className="text-right mono" style={{color:'var(--primary)'}}>{fmtSign(totalKewajiban+totalEkuitas)}</td></tr>
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

export function NeracaTriwulan() { return <PlaceholderTab title="Neraca per 3 Bulan" /> }
