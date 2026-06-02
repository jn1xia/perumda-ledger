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

// Beban Umum (Admin Expenses) categories matching Excel
const BEBAN_UMUM_ITEMS = [
  { code: '61010', name: 'Gaji Pegawai' },
  { code: '61020', name: 'Tunjangan Pegawai Umum' },
  { code: '61030', name: 'Kelengkapan Pegawai' },
  { code: '61040', name: 'Perlengkapan' },
  { code: '61041', name: 'Alat Tulis Kantor' },
  { code: '61050', name: 'Telepon/Listrik/Air/Wifi/Website' },
  { code: '61060', name: 'Konsumsi Rapat dan Tamu' },
  { code: '61070', name: 'Perlengkapan & Pemeliharaan Kantor' },
  { code: '61080', name: 'Bahan Bakar Minyak' },
  { code: '61090', name: 'Perjalanan Dinas' },
  { code: '61100', name: 'Pendidikan, Pelatihan dan Bimtek' },
  { code: '61110', name: 'Sewa Kendaraan' },
  { code: '61120', name: 'Jasa Profesional/Konsultan/Tenaga Ahli' },
  { code: '61130', name: 'Penyusutan Aktiva Tetap' },
  { code: '61140', name: 'Beban Umum Lainnya' },
]

// Beban Operasional categories matching Excel
const BEBAN_OPS_ITEMS = [
  { code: '62010', name: 'Pemeliharaan Kendaraan Operasional' },
  { code: '62020', name: 'Pemeliharaan Pasar' },
  { code: '62030', name: 'Pemeliharaan Kebersihan Pasar' },
  { code: '62040', name: 'Pelayanan dan Pemasaran' },
  { code: '62050', name: 'Barang Cetakan' },
  { code: '62060', name: 'Gaji dan Honor Tenaga Kontrak dan Harian Lepas' },
  { code: '62070', name: 'Tunjangan Pegawai Operasional' },
  { code: '62080', name: 'Kelengkapan Pegawai' },
  { code: '62090', name: 'Insentif/Kesejahteraan Pegawai' },
  { code: '62100', name: 'Pemeliharaan Keamanan dan Ketertiban Pasar' },
]

// Beban Investasi (Capital programs)
const BEBAN_INVESTASI_ITEMS = [
  { code: '12204.1', name: 'Pengadaan Peralatan', isDebit: true, isAsset: true },
  { code: '12201.1', name: 'Pengadaan Kendaraan', isDebit: true, isAsset: true },
  { code: '12203.1', name: 'Instalasi Listrik', isDebit: true, isAsset: true },
  { code: '12202.1', name: 'Pengadaan Mesin', isDebit: true, isAsset: true },
  { code: '12102.1', name: 'Pembangunan/Renovasi Bangunan', isDebit: true, isAsset: true },
  { code: '12300', name: 'Aset Dalam Penyelesaian', isDebit: true, isAsset: true },
]

const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, jun: 6, jul: 7, agt: 8, sep: 9, okt: 10, nov: 11, des: 12 }

function getSelectedMonth(selectedPeriod) {
  if (!selectedPeriod) return 1
  const key = selectedPeriod.replace(/[^a-z]/g, '').slice(0, 3)
  return monthMap[key] || 1
}

function buildBebanData(journals, items, selectedMonth, prefix) {
  const posted = (journals || []).filter(j => j.status === 'posted' && !(j.id||'').startsWith('SA-'))

  const sumD = (code, jlist) => jlist.reduce((s, j) => {
    const c = (j.akun_debit||'').split(' ')[0]
    return s + (c?.startsWith(code) ? (j.debit || 0) : 0)
  }, 0)

  const monthJournals = posted.filter(j => new Date(j.tanggal).getMonth() + 1 === selectedMonth)
  const priorJournals = posted.filter(j => new Date(j.tanggal).getMonth() + 1 < selectedMonth)
  const ytdJournals = posted.filter(j => new Date(j.tanggal).getMonth() + 1 <= selectedMonth)

  const rows = items.map(item => ({
    ...item,
    sdBulanLalu: sumD(item.code, priorJournals),
    bulanIni: sumD(item.code, monthJournals),
    sdBulanIni: sumD(item.code, ytdJournals),
  })).filter(r => r.sdBulanIni > 0 || r.bulanIni > 0 || r.sdBulanLalu > 0)

  const totalSdLalu = sumD(prefix, priorJournals)
  const totalBulanIni = sumD(prefix, monthJournals)
  const totalYTD = sumD(prefix, ytdJournals)

  return { rows, totalSdLalu, totalBulanIni, totalYTD }
}

function BebanTable({ title, subtitle, rows, totalSdLalu, totalBulanIni, totalYTD, totalLabel, printName }) {
  return (
    <div className="report-doc">
      <ReportHeader title={title} subtitle={subtitle} onPrint={() => printReport(printName)} />
      <div className="report-doc-body">
        <table><thead><tr>
          <th>No</th>
          <th>Uraian Beban</th>
          <th className="text-right">Sd Bln Lalu</th>
          <th className="text-right">Bulan Ini</th>
          <th className="text-right">Sd Bln Ini (YTD)</th>
        </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.code}>
                <td>{i + 1}</td>
                <td>{r.code} - {r.name}</td>
                <td className="text-right mono">{fmtSign(r.sdBulanLalu)}</td>
                <td className="text-right mono">{fmtSign(r.bulanIni)}</td>
                <td className="text-right mono" style={{fontWeight:600}}>{fmtSign(r.sdBulanIni)}</td>
              </tr>
            ))}
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            <tr style={{fontWeight:700, background:'var(--border-light)', fontSize:15, borderTop:'2px solid var(--border)'}}>
              <td colSpan={2}>{totalLabel}</td>
              <td className="text-right mono">{fmtSign(totalSdLalu)}</td>
              <td className="text-right mono">{fmtSign(totalBulanIni)}</td>
              <td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(totalYTD)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RekapTable({ title, subtitle, data, printName }) {
  const grandTotal = data.reduce((s, m) => s + m.total, 0)
  return (
    <div className="report-doc">
      <ReportHeader title={title} subtitle={subtitle} onPrint={() => printReport(printName)} />
      <div className="report-doc-body">
        <table><thead><tr>
          <th>Bulan</th>
          <th className="text-right">Total Realisasi</th>
          <th className="text-right">Kumulatif (YTD)</th>
        </tr></thead>
          <tbody>
            {data.map((m, i) => (
              <tr key={i}>
                <td style={{fontWeight:600}}>{m.month}</td>
                <td className="text-right mono">{fmtSign(m.total)}</td>
                <td className="text-right mono" style={{fontWeight:600}}>{fmtSign(m.cumulative)}</td>
              </tr>
            ))}
            <tr style={{height:8}}><td colSpan={3}></td></tr>
            <tr style={{fontWeight:700, background:'var(--border-light)', fontSize:15, borderTop:'2px solid var(--border)'}}>
              <td>TOTAL YTD</td>
              <td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(grandTotal)}</td>
              <td className="text-right mono" style={{color:'var(--danger)'}}>{fmtSign(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function buildRekapData(journals, prefix, selectedMonth) {
  const posted = (journals || []).filter(j => j.status === 'posted' && !(j.id||'').startsWith('SA-'))
  const sumD = (jlist) => jlist.reduce((s, j) => {
    const c = (j.akun_debit||'').split(' ')[0]
    return s + (c?.startsWith(prefix) ? (j.debit || 0) : 0)
  }, 0)

  const data = []
  let cumulative = 0
  for (let m = 1; m <= selectedMonth; m++) {
    const mj = posted.filter(j => new Date(j.tanggal).getMonth() + 1 === m)
    const total = sumD(mj)
    cumulative += total
    data.push({ month: monthNames[m], total, cumulative })
  }
  return data
}

// ─── BEBAN UMUM ──────────────────────────────────────────────────────
export function BebanUmum({ journals, periodLabel, selectedPeriod }) {
  const selectedMonth = getSelectedMonth(selectedPeriod)
  const { rows, totalSdLalu, totalBulanIni, totalYTD } = buildBebanData(journals, BEBAN_UMUM_ITEMS, selectedMonth, '61')
  return <BebanTable 
    title="BEBAN UMUM DAN ADMINISTRASI" 
    subtitle={`Realisasi Bulan ${monthNames[selectedMonth]} 2026`}
    rows={rows} totalSdLalu={totalSdLalu} totalBulanIni={totalBulanIni} totalYTD={totalYTD}
    totalLabel="JUMLAH BEBAN UMUM DAN ADMINISTRASI"
    printName="Beban Umum"
  />
}

export function RekapBebanUmum({ journals, periodLabel, selectedPeriod }) {
  const selectedMonth = getSelectedMonth(selectedPeriod)
  const data = buildRekapData(journals, '61', selectedMonth)
  return <RekapTable
    title="REKAP BEBAN UMUM DAN ADMINISTRASI"
    subtitle={`Rekap s/d ${monthNames[selectedMonth]} 2026`}
    data={data}
    printName="Rekap Beban Umum"
  />
}

// ─── BEBAN OPERASIONAL ──────────────────────────────────────────────
export function BebanOperasional({ journals, periodLabel, selectedPeriod }) {
  const selectedMonth = getSelectedMonth(selectedPeriod)
  const { rows, totalSdLalu, totalBulanIni, totalYTD } = buildBebanData(journals, BEBAN_OPS_ITEMS, selectedMonth, '62')
  return <BebanTable 
    title="BEBAN OPERASIONAL DAN BISNIS" 
    subtitle={`Realisasi Bulan ${monthNames[selectedMonth]} 2026`}
    rows={rows} totalSdLalu={totalSdLalu} totalBulanIni={totalBulanIni} totalYTD={totalYTD}
    totalLabel="JUMLAH BEBAN OPERASIONAL DAN BISNIS"
    printName="Beban Operasional"
  />
}

export function RekapBebanOperasional({ journals, periodLabel, selectedPeriod }) {
  const selectedMonth = getSelectedMonth(selectedPeriod)
  const data = buildRekapData(journals, '62', selectedMonth)
  return <RekapTable
    title="REKAP BEBAN OPERASIONAL DAN BISNIS"
    subtitle={`Rekap s/d ${monthNames[selectedMonth]} 2026`}
    data={data}
    printName="Rekap Beban Operasional"
  />
}

// ─── BEBAN INVESTASI ────────────────────────────────────────────────
export function BebanInvestasi({ journals, periodLabel, selectedPeriod }) {
  const selectedMonth = getSelectedMonth(selectedPeriod)
  const posted = (journals || []).filter(j => j.status === 'posted' && !(j.id||'').startsWith('SA-'))

  const sumD = (code, jlist) => jlist.reduce((s, j) => {
    const c = (j.akun_debit||'').split(' ')[0]
    return s + (c === code ? (j.debit || 0) : 0)
  }, 0)

  const monthJournals = posted.filter(j => new Date(j.tanggal).getMonth() + 1 === selectedMonth)
  const priorJournals = posted.filter(j => new Date(j.tanggal).getMonth() + 1 < selectedMonth)
  const ytdJournals = posted.filter(j => new Date(j.tanggal).getMonth() + 1 <= selectedMonth)

  const rows = BEBAN_INVESTASI_ITEMS.map(item => ({
    ...item,
    sdBulanLalu: sumD(item.code, priorJournals),
    bulanIni: sumD(item.code, monthJournals),
    sdBulanIni: sumD(item.code, ytdJournals),
  })).filter(r => r.sdBulanIni > 0 || r.bulanIni > 0)

  const totalSdLalu = rows.reduce((s, r) => s + r.sdBulanLalu, 0)
  const totalBulanIni = rows.reduce((s, r) => s + r.bulanIni, 0)
  const totalYTD = rows.reduce((s, r) => s + r.sdBulanIni, 0)

  return <BebanTable 
    title="BEBAN INVESTASI (BELANJA MODAL)" 
    subtitle={`Realisasi Bulan ${monthNames[selectedMonth]} 2026`}
    rows={rows} totalSdLalu={totalSdLalu} totalBulanIni={totalBulanIni} totalYTD={totalYTD}
    totalLabel="JUMLAH BEBAN INVESTASI"
    printName="Beban Investasi"
  />
}

export function RekapBebanInvestasi({ journals, periodLabel, selectedPeriod }) {
  const selectedMonth = getSelectedMonth(selectedPeriod)
  const posted = (journals || []).filter(j => j.status === 'posted' && !(j.id||'').startsWith('SA-'))

  const sumAssets = (jlist) => BEBAN_INVESTASI_ITEMS.reduce((s, item) => {
    return s + jlist.reduce((ss, j) => {
      const c = (j.akun_debit||'').split(' ')[0]
      return ss + (c === item.code ? (j.debit || 0) : 0)
    }, 0)
  }, 0)

  const data = []
  let cumulative = 0
  for (let m = 1; m <= selectedMonth; m++) {
    const mj = posted.filter(j => new Date(j.tanggal).getMonth() + 1 === m)
    const total = sumAssets(mj)
    cumulative += total
    data.push({ month: monthNames[m], total, cumulative })
  }

  return <RekapTable
    title="REKAP BEBAN INVESTASI (BELANJA MODAL)"
    subtitle={`Rekap s/d ${monthNames[selectedMonth]} 2026`}
    data={data}
    printName="Rekap Beban Investasi"
  />
}
