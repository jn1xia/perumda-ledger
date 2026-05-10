import { useState } from 'react'
import { Printer, Search } from 'lucide-react'
import { printReport } from '../../utils/exportUtils.js'

const fmtSign = v => (v < 0 ? '-' : '') + 'Rp ' + Math.abs(v).toLocaleString('id-ID')

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

// Fallback for incomplete tabs
const PlaceholderTab = ({ title }) => (
  <div style={{padding: 40, textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 12}}>
    <h3 style={{marginBottom: 8}}>{title}</h3>
    <p style={{color: 'var(--text-secondary)'}}>Laporan dinamis ini sedang dalam pengembangan dan akan dirilis pada pembaruan berikutnya.</p>
  </div>
)

// --- HPP ---
export function HPP() { return <PlaceholderTab title="Laporan Harga Pokok Penjualan (HPP)" /> }

// --- HPP Detail ---
export function HPPDetail() { return <PlaceholderTab title="Laporan HPP Detail" /> }

// --- HPP per 3 Bulan ---
export function HPPTriwulan() { return <PlaceholderTab title="Laporan HPP per 3 Bulan" /> }

// --- HPP per 2 Bulan ---
export function HPP2Bulan() { return <PlaceholderTab title="Laporan HPP per 2 Bulan" /> }

// --- HPP vs Budget ---
export function HPPBudget() { return <PlaceholderTab title="Laporan HPP vs Budget" /> }


// --- Lacak Kilat ---
export function LacakKilat({ state, formatRupiah }) {
  const [q, setQ] = useState('')
  const posted = state.journals.filter(j => j.status === 'posted')
  const results = q.length >= 2 ? posted.filter(j =>
    j.id.toLowerCase().includes(q.toLowerCase()) ||
    j.keterangan.toLowerCase().includes(q.toLowerCase()) ||
    j.akunDebit.toLowerCase().includes(q.toLowerCase()) ||
    j.akunKredit.toLowerCase().includes(q.toLowerCase())
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
                <td className="mono" style={{fontSize:12}}>{j.akunDebit}</td>
                <td className="mono" style={{fontSize:12}}>{j.akunKredit}</td>
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
    posted.forEach(j => { const dc=j.akunDebit.split(' ')[0], kc=j.akunKredit.split(' ')[0]; if(dc===a.code) d+=j.debit; if(kc===a.code) k+=j.kredit })
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
