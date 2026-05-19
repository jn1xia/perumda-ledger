import { useState, useMemo } from 'react'
import { Printer, Search } from 'lucide-react'
import { printReport } from '../../utils/exportUtils.js'

const fmtSign = v => (v < 0 ? '-' : '') + 'Rp ' + Math.abs(v).toLocaleString('id-ID')
const fmtPct = v => (v * 100).toFixed(1) + '%'

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

// Helper: flatten COA tree to posting accounts
function flatCOA(nodes, r = []) {
  nodes.forEach(n => {
    if (n.type === 'posting') r.push(n)
    if (n.children) flatCOA(n.children, r)
  })
  return r
}

// Helper: calculate period balance for HPP accounts (debit-normal, no saldoAwal for income statement)
function calcAccountBalance(acct, journals) {
  let d = 0, k = 0
  journals.forEach(j => {
    if (j.akun_debit?.split(' ')[0] === acct.code) d += j.debit || 0
    if (j.akun_kredit?.split(' ')[0] === acct.code) k += j.kredit || 0
  })
  return d - k // HPP is debit-normal
}

function getHPPAccounts(state) {
  const flat = flatCOA(state.coaTree || [])
  return flat.filter(a => a.code.startsWith('5') && a.type === 'posting')
}

function getPendapatanTotal(state, journals) {
  const flat = flatCOA(state.coaTree || [])
  const pendapatanAccts = flat.filter(a => (a.code.startsWith('4') || a.code.startsWith('7')) && a.type === 'posting')
  let total = 0
  pendapatanAccts.forEach(a => { total += -(calcAccountBalance(a, journals)) }) // credit-normal → negate
  return total
}

// === HPP Summary Report ===
export function HPP({ state, journals, periodLabel }) {
  const hppAccounts = getHPPAccounts(state)
  const totalPendapatan = getPendapatanTotal(state, journals)

  const rows = hppAccounts.map(a => ({
    ...a,
    balance: calcAccountBalance(a, journals)
  })).filter(r => r.balance !== 0 || true) // show all

  const totalHPP = rows.reduce((s, r) => s + r.balance, 0)
  const labaKotor = totalPendapatan - totalHPP
  const hppRatio = totalPendapatan !== 0 ? totalHPP / totalPendapatan : 0
  const marginKotor = totalPendapatan !== 0 ? labaKotor / totalPendapatan : 0

  return (
    <div className="report-doc">
      <ReportHeader title="LAPORAN HARGA POKOK PENJUALAN (HPP)" subtitle={`Periode: ${periodLabel}`} onPrint={() => printReport('HPP')} />
      <div className="report-doc-body">
        {/* KPI Cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
          <div style={{background:'var(--bg-tertiary)',padding:16,borderRadius:10,textAlign:'center'}}>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>Total Pendapatan</div>
            <div style={{fontSize:16,fontWeight:700,color:'var(--success)'}}>{fmtSign(totalPendapatan)}</div>
          </div>
          <div style={{background:'var(--bg-tertiary)',padding:16,borderRadius:10,textAlign:'center'}}>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>Total HPP</div>
            <div style={{fontSize:16,fontWeight:700,color:'var(--danger)'}}>{fmtSign(totalHPP)}</div>
          </div>
          <div style={{background:'var(--bg-tertiary)',padding:16,borderRadius:10,textAlign:'center'}}>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>Laba Kotor</div>
            <div style={{fontSize:16,fontWeight:700,color:labaKotor >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(labaKotor)}</div>
          </div>
          <div style={{background:'var(--bg-tertiary)',padding:16,borderRadius:10,textAlign:'center'}}>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>Margin Kotor</div>
            <div style={{fontSize:16,fontWeight:700,color:'var(--primary)'}}>{fmtPct(marginKotor)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr style={{background:'var(--bg-secondary)'}}>
              <th>Kode</th><th>Nama Akun</th><th className="text-right">Jumlah (Rp)</th><th className="text-right">% thd Pendapatan</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{background:'rgba(16,185,129,0.06)',fontWeight:600}}>
              <td></td><td>Total Pendapatan</td>
              <td className="text-right mono">{fmtSign(totalPendapatan)}</td>
              <td className="text-right mono">100.0%</td>
            </tr>
            <tr><td colSpan={4} style={{padding:'4px 0',borderBottom:'2px solid var(--border)'}}></td></tr>
            {rows.map(r => (
              <tr key={r.code}>
                <td className="mono" style={{fontWeight:500}}>{r.code}</td>
                <td>{r.name}</td>
                <td className="text-right mono">{fmtSign(r.balance)}</td>
                <td className="text-right mono" style={{color:'var(--text-muted)'}}>{totalPendapatan !== 0 ? fmtPct(r.balance / totalPendapatan) : '-'}</td>
              </tr>
            ))}
            <tr style={{borderTop:'2px solid var(--border)',fontWeight:700,background:'rgba(239,68,68,0.06)'}}>
              <td></td><td>TOTAL HPP</td>
              <td className="text-right mono">{fmtSign(totalHPP)}</td>
              <td className="text-right mono">{fmtPct(hppRatio)}</td>
            </tr>
            <tr style={{borderTop:'2px solid var(--primary)',fontWeight:700,fontSize:15,background:'rgba(59,130,246,0.08)'}}>
              <td></td><td>LABA KOTOR (Pendapatan - HPP)</td>
              <td className="text-right mono" style={{color:labaKotor >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(labaKotor)}</td>
              <td className="text-right mono">{fmtPct(marginKotor)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// === HPP Detail Report ===
export function HPPDetail({ state, journals, periodLabel }) {
  const hppAccounts = getHPPAccounts(state)
  const posted = journals

  const rows = hppAccounts.map(a => {
    let d = 0, k = 0, txCount = 0
    posted.forEach(j => {
      if (j.akun_debit?.split(' ')[0] === a.code) { d += j.debit || 0; txCount++ }
      if (j.akun_kredit?.split(' ')[0] === a.code) { k += j.kredit || 0; txCount++ }
    })
    return { ...a, debit: d, kredit: k, balance: d - k, txCount }
  })

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0)
  const totalKredit = rows.reduce((s, r) => s + r.kredit, 0)
  const totalBalance = rows.reduce((s, r) => s + r.balance, 0)

  return (
    <div className="report-doc">
      <ReportHeader title="LAPORAN HPP DETAIL" subtitle={`Periode: ${periodLabel}`} onPrint={() => printReport('HPP Detail')} />
      <div className="report-doc-body">
        <table>
          <thead>
            <tr style={{background:'var(--bg-secondary)'}}>
              <th>Kode</th><th>Nama Akun</th><th className="text-right">Debit</th><th className="text-right">Kredit</th><th className="text-right">Saldo</th><th className="text-center">Transaksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.code} style={r.balance !== 0 ? {} : {opacity: 0.5}}>
                <td className="mono" style={{fontWeight:500}}>{r.code}</td>
                <td>{r.name}</td>
                <td className="text-right mono">{r.debit ? fmtSign(r.debit) : '-'}</td>
                <td className="text-right mono">{r.kredit ? fmtSign(r.kredit) : '-'}</td>
                <td className="text-right mono" style={{fontWeight:600}}>{fmtSign(r.balance)}</td>
                <td className="text-center">{r.txCount || '-'}</td>
              </tr>
            ))}
            <tr style={{borderTop:'2px solid var(--border)',fontWeight:700,background:'rgba(239,68,68,0.06)'}}>
              <td></td><td>TOTAL</td>
              <td className="text-right mono">{fmtSign(totalDebit)}</td>
              <td className="text-right mono">{fmtSign(totalKredit)}</td>
              <td className="text-right mono">{fmtSign(totalBalance)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// === HPP Multi-Period Helper ===
function HPPMultiPeriod({ title, state, journals, periodLabel, selectedPeriod, periodGroups }) {
  const hppAccounts = getHPPAccounts(state)
  const allPosted = journals

  const periodData = periodGroups.map(pg => {
    const pJournals = allPosted.filter(j => {
      if (!j.tanggal) return false
      return pg.months.some(m => j.tanggal.startsWith(m))
    })
    const total = hppAccounts.reduce((s, a) => s + calcAccountBalance(a, pJournals), 0)
    const pendapatan = getPendapatanTotal(state, pJournals)
    return { ...pg, total, pendapatan, labaKotor: pendapatan - total }
  })

  const grandHPP = periodData.reduce((s, p) => s + p.total, 0)
  const grandPendapatan = periodData.reduce((s, p) => s + p.pendapatan, 0)
  const grandLabaKotor = grandPendapatan - grandHPP

  return (
    <div className="report-doc">
      <ReportHeader title={title} subtitle={`Periode: ${periodLabel}`} onPrint={() => printReport(title)} />
      <div className="report-doc-body">
        <table>
          <thead>
            <tr style={{background:'var(--bg-secondary)'}}>
              <th>Periode</th><th className="text-right">Pendapatan</th><th className="text-right">HPP</th><th className="text-right">Laba Kotor</th><th className="text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {periodData.map((p, i) => (
              <tr key={i}>
                <td style={{fontWeight:500}}>{p.label}</td>
                <td className="text-right mono">{fmtSign(p.pendapatan)}</td>
                <td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(p.total)}</td>
                <td className="text-right mono" style={{fontWeight:600,color:p.labaKotor >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(p.labaKotor)}</td>
                <td className="text-right mono">{p.pendapatan !== 0 ? fmtPct(p.labaKotor / p.pendapatan) : '-'}</td>
              </tr>
            ))}
            <tr style={{borderTop:'2px solid var(--border)',fontWeight:700,background:'rgba(59,130,246,0.08)'}}>
              <td>TOTAL</td>
              <td className="text-right mono">{fmtSign(grandPendapatan)}</td>
              <td className="text-right mono">{fmtSign(grandHPP)}</td>
              <td className="text-right mono" style={{color:grandLabaKotor >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(grandLabaKotor)}</td>
              <td className="text-right mono">{grandPendapatan !== 0 ? fmtPct(grandLabaKotor / grandPendapatan) : '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// === HPP per 3 Bulan ===
export function HPPTriwulan({ state, journals, periodLabel, selectedPeriod }) {
  const groups = [
    { label: 'Triwulan I (Jan-Mar)', months: ['2026-01','2026-02','2026-03'] },
    { label: 'Triwulan II (Apr-Jun)', months: ['2026-04','2026-05','2026-06'] },
    { label: 'Triwulan III (Jul-Sep)', months: ['2026-07','2026-08','2026-09'] },
    { label: 'Triwulan IV (Okt-Des)', months: ['2026-10','2026-11','2026-12'] },
  ]
  return <HPPMultiPeriod title="LAPORAN HPP PER TRIWULAN" state={state} journals={journals} periodLabel={periodLabel} selectedPeriod={selectedPeriod} periodGroups={groups} />
}

// === HPP per 2 Bulan ===
export function HPP2Bulan({ state, journals, periodLabel, selectedPeriod }) {
  const groups = [
    { label: 'Jan-Feb', months: ['2026-01','2026-02'] },
    { label: 'Mar-Apr', months: ['2026-03','2026-04'] },
    { label: 'Mei-Jun', months: ['2026-05','2026-06'] },
    { label: 'Jul-Ags', months: ['2026-07','2026-08'] },
    { label: 'Sep-Okt', months: ['2026-09','2026-10'] },
    { label: 'Nov-Des', months: ['2026-11','2026-12'] },
  ]
  return <HPPMultiPeriod title="LAPORAN HPP PER 2 BULAN" state={state} journals={journals} periodLabel={periodLabel} selectedPeriod={selectedPeriod} periodGroups={groups} />
}

// === HPP vs Budget ===
export function HPPBudget({ state, journals, periodLabel }) {
  const hppAccounts = getHPPAccounts(state)
  const anggaranList = state.anggaran || []

  const rows = hppAccounts.map(a => {
    const balance = calcAccountBalance(a, journals)
    const ang = anggaranList.find(x => x.kode_akun === a.code)
    const budget = ang ? (ang.anggaran || 0) : 0
    const variance = budget - balance
    const pct = budget !== 0 ? balance / budget : 0
    return { ...a, balance, budget, variance, pct }
  })

  const totalRealisasi = rows.reduce((s, r) => s + r.balance, 0)
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0)
  const totalVariance = totalBudget - totalRealisasi
  const totalPct = totalBudget !== 0 ? totalRealisasi / totalBudget : 0

  return (
    <div className="report-doc">
      <ReportHeader title="LAPORAN HPP vs ANGGARAN" subtitle={`Periode: ${periodLabel}`} onPrint={() => printReport('HPP vs Budget')} />
      <div className="report-doc-body">
        <table>
          <thead>
            <tr style={{background:'var(--bg-secondary)'}}>
              <th>Kode</th><th>Nama Akun</th><th className="text-right">Anggaran</th><th className="text-right">Realisasi</th><th className="text-right">Selisih</th><th className="text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.code}>
                <td className="mono" style={{fontWeight:500}}>{r.code}</td>
                <td>{r.name}</td>
                <td className="text-right mono">{r.budget ? fmtSign(r.budget) : '-'}</td>
                <td className="text-right mono">{fmtSign(r.balance)}</td>
                <td className="text-right mono" style={{color:r.variance >= 0 ? 'var(--success)' : 'var(--danger)'}}>{r.budget ? fmtSign(r.variance) : '-'}</td>
                <td className="text-right mono">{r.budget ? fmtPct(r.pct) : '-'}</td>
              </tr>
            ))}
            <tr style={{borderTop:'2px solid var(--border)',fontWeight:700,background:'rgba(59,130,246,0.08)'}}>
              <td></td><td>TOTAL HPP</td>
              <td className="text-right mono">{fmtSign(totalBudget)}</td>
              <td className="text-right mono">{fmtSign(totalRealisasi)}</td>
              <td className="text-right mono" style={{color:totalVariance >= 0 ? 'var(--success)' : 'var(--danger)'}}>{fmtSign(totalVariance)}</td>
              <td className="text-right mono">{totalBudget !== 0 ? fmtPct(totalPct) : '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}


// --- Lacak Kilat ---
export function LacakKilat({ state, formatRupiah }) {
  const [q, setQ] = useState('')
  const posted = state.journals.filter(j => j.status === 'posted')
  const results = q.length >= 2 ? posted.filter(j =>
    j.id.toLowerCase().includes(q.toLowerCase()) ||
    j.keterangan.toLowerCase().includes(q.toLowerCase()) ||
    j.akun_debit?.toLowerCase().includes(q.toLowerCase()) ||
    j.akun_kredit?.toLowerCase().includes(q.toLowerCase())
  ) : []
  return (
    <div className="report-doc">
      <ReportHeader title="LACAK KILAT" subtitle="Pencarian Cepat Transaksi — Quick Trace" onPrint={() => printReport('Lacak Kilat')} />
      <div className="report-doc-body">
        <div style={{marginBottom:20}}>
          <div className="topbar-search" style={{maxWidth:500}}>
            <Search size={18} />
            <input type="text" placeholder="Cari no. jurnal, keterangan, atau kode akun..." value={q} onChange={e => setQ(e.target.value)} style={{fontSize:14}} />
          </div>
          <p style={{fontSize:12,color:'var(--text-muted)',marginTop:6}}>Ketik minimal 2 karakter untuk mulai mencari</p>
        </div>
        {results.length > 0 && (
          <table><thead><tr><th>No. Jurnal</th><th>Tanggal</th><th>Keterangan</th><th>Akun Debit</th><th>Akun Kredit</th><th className="text-right">Jumlah</th><th>Status</th></tr></thead>
          <tbody>
            {results.map(j => (
              <tr key={j.id}>
                <td className="mono" style={{fontWeight:600}}>{j.id}</td>
                <td>{j.tanggal}</td>
                <td>{j.keterangan}</td>
                <td className="mono" style={{fontSize:12}}>{j.akun_debit}</td>
                <td className="mono" style={{fontSize:12}}>{j.akun_kredit}</td>
                <td className="text-right mono">{formatRupiah(j.debit)}</td>
                <td><span className={`badge ${j.status==='posted'?'green':'orange'}`}>{j.status}</span></td>
              </tr>
            ))}
          </tbody></table>
        )}
        {q.length >= 2 && results.length === 0 && (
          <div style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>
            <p style={{fontSize:18,marginBottom:8}}>Tidak ditemukan</p>
            <p style={{fontSize:13}}>Tidak ada transaksi yang cocok dengan "{q}"</p>
          </div>
        )}
        {q.length < 2 && (
          <div style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>
            <p style={{fontSize:14}}>Gunakan fitur pencarian di atas untuk melacak transaksi secara cepat berdasarkan nomor jurnal, keterangan, atau kode akun.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Laporan Sortir ---
export function LaporanSortir({ state, formatRupiah }) {
  const posted = state.journals.filter(j => j.status === 'posted')
  function flat(nodes, r=[]) { nodes.forEach(n => { if(n.type==='posting') r.push(n); if(n.children) flat(n.children,r) }); return r }
  const accts = flat(state.coaTree || [])
  // Sort by kodeSortir then code
  const sorted = [...accts].sort((a,b) => {
    if (a.kodeSortir && b.kodeSortir) return a.kodeSortir.localeCompare(b.kodeSortir)
    if (a.kodeSortir) return -1
    if (b.kodeSortir) return 1
    return a.code.localeCompare(b.code)
  })
  const rows = sorted.map(a => {
    let d=0, k=0
    posted.forEach(j => { const dc=j.akun_debit?.split(' ')[0], kc=j.akun_kredit?.split(' ')[0]; if(dc===a.code) d+=j.debit; if(kc===a.code) k+=j.kredit })
    return { ...a, debit: d, kredit: k }
  })
  return (
    <div className="report-doc">
      <ReportHeader title="LAPORAN SORTIR" subtitle="Neraca Saldo Berdasarkan Kode Sortir" onPrint={() => printReport('Laporan Sortir')} />
      <div className="report-doc-body">
        <table><thead><tr><th>Sortir</th><th>Kode</th><th>Nama Akun</th><th>Kategori</th><th className="text-right">Debit</th><th className="text-right">Kredit</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.code}>
              <td className="mono" style={{color:'var(--primary)',fontWeight:600}}>{r.kodeSortir || '-'}</td>
              <td className="mono">{r.code}</td>
              <td>{r.name}</td>
              <td><span className={`badge ${r.category==='Aset'?'blue':r.category==='Pendapatan'?'green':r.category==='Beban'?'orange':r.category==='Kewajiban'?'red':'purple'}`}>{r.category}</span></td>
              <td className="text-right mono">{r.debit ? formatRupiah(r.debit) : '-'}</td>
              <td className="text-right mono">{r.kredit ? formatRupiah(r.kredit) : '-'}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  )
}
