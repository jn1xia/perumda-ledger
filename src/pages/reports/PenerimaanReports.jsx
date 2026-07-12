import { Printer } from 'lucide-react'
import { printReport } from '../../utils/exportUtils.js'
import { periodValueToMonths } from '../../utils/journalFilters.js'
import { useMonthlyLrLineValues } from '../../utils/monthlyLineValues.js'

const fmt = v => 'Rp ' + Math.abs(v).toLocaleString('id-ID')
const fmtSign = v => (v < 0 ? '-' : '') + fmt(v)
const pct = (val, target) => target === 0 ? '0.0' : ((val / target) * 100).toFixed(1)

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

// Revenue category mapping based on Excel structure
const REVENUE_CATEGORIES = {
  bisnis_utama: {
    label: 'Bisnis Utama',
    prefix: '41',
    items: [
      { code: '41010', name: 'Pengelolaan Pasar dari Toko/Kios, Bak dan Los (Bulanan)' },
      { code: '41020', name: 'Pengelolaan Pasar untuk Pelataran/Kaki Lima (Harian)' },
      { code: '41030', name: 'Pendapatan Unit Kebersihan Pasar (Sampah)' },
      { code: '41040', name: 'Pendapatan Denda Pelayanan Pasar' },
      { code: '41050', name: 'Pendapatan Perizinan' },
      { code: '41060', name: 'Pendapatan Pengelolaan Lain-lain' },
      { code: '41070', name: 'Pendapatan Keamanan Pasar' },
    ]
  },
  pengembangan: {
    label: 'Pendapatan Pengembangan Bisnis Lainnya',
    prefix: '42',
    items: [
      { code: '42010', name: 'Pendapatan Parkir' },
      { code: '42020', name: 'Pendapatan Gerai Inflasi & Bahan Pokok' },
      { code: '42030', name: 'Pendapatan Gas LPG' },
      { code: '42040', name: 'Pendapatan Sewa Lahan' },
      { code: '42050', name: 'Pendapatan Event/Acara' },
    ]
  }
}

// Per-month category values via the shared line-value engine: audited months
// come from the monthly L/R snapshot ("Pendapatan Bisnis Utama" /
// "Pendapatan Pengembangan Bisnis Lainnya" + JV- deltas), journal months from
// posted-journal kredit sums on the 41/42 prefixes.
const getRevenueData = (lineValue, selectedMonth) => {
  const rangeSum = (prefix, from, to) => {
    let s = 0
    for (let m = Math.max(1, from); m <= to; m++) s += lineValue(m, prefix, { isRevenue: true })
    return s
  }
  return Object.entries(REVENUE_CATEGORIES).map(([key, cat]) => ({
    key,
    label: cat.label,
    prefix: cat.prefix,
    sdBulanLalu: rangeSum(cat.prefix, 1, selectedMonth - 1),
    bulanIni: lineValue(selectedMonth, cat.prefix, { isRevenue: true }),
    sdBulanIni: rangeSum(cat.prefix, 1, selectedMonth),
  }))
}

export function Penerimaan({ state, journals, periodLabel, selectedPeriod }) {
  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  
  // Determine selected month — for multi-month presets (tw/s/tahun) use the
  // LAST month in the range so the report tracks the selected period.
  const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, jun: 6, jul: 7, agt: 8, sep: 9, okt: 10, nov: 11, des: 12 }
  let selectedMonth = 1
  if (selectedPeriod) {
    const key = selectedPeriod.replace(/[^a-z]/g, '').slice(0, 3)
    selectedMonth = monthMap[key] || Math.max(...periodValueToMonths(selectedPeriod))
  }

  const { lineValue } = useMonthlyLrLineValues(selectedMonth, state?.periodModes, journals)
  const categories = getRevenueData(lineValue, selectedMonth)
  const grandBulanIni = categories.reduce((s, c) => s + c.bulanIni, 0)
  const grandPrior = categories.reduce((s, c) => s + c.sdBulanLalu, 0)
  const grandYTD = categories.reduce((s, c) => s + c.sdBulanIni, 0)

  return (
    <div className="report-doc">
      <ReportHeader 
        title="LAPORAN REALISASI PENERIMAAN" 
        subtitle={`Realisasi Penerimaan Bulan ${monthNames[selectedMonth]} 2026`} 
        onPrint={() => printReport('Penerimaan')} 
      />
      <div className="report-doc-body">
        <table><thead><tr>
          <th>No</th>
          <th>Program Pendapatan</th>
          <th className="text-right">Sd Bln Lalu</th>
          <th className="text-right">Bulan Ini</th>
          <th className="text-right">Sd Bln Ini (YTD)</th>
        </tr></thead>
          <tbody>
            {categories.map((cat, i) => (
              <tr key={cat.key} style={{ fontWeight: 600, background: 'rgba(16,185,129,0.1)' }}>
                <td>{i + 1}</td>
                <td>{cat.label}</td>
                <td className="text-right mono">{fmtSign(cat.sdBulanLalu)}</td>
                <td className="text-right mono">{fmtSign(cat.bulanIni)}</td>
                <td className="text-right mono" style={{fontWeight:700}}>{fmtSign(cat.sdBulanIni)}</td>
              </tr>
            ))}
            <tr style={{height:8}}><td colSpan={5}></td></tr>
            <tr style={{fontWeight:700, background:'var(--border-light)', fontSize:15, borderTop:'2px solid var(--border)'}}>
              <td colSpan={2}>TOTAL PENERIMAAN</td>
              <td className="text-right mono">{fmtSign(grandPrior)}</td>
              <td className="text-right mono">{fmtSign(grandBulanIni)}</td>
              <td className="text-right mono" style={{color:'var(--success)'}}>{fmtSign(grandYTD)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function RekapPenerimaan({ state, journals, periodLabel, selectedPeriod }) {
  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, jun: 6, jul: 7, agt: 8, sep: 9, okt: 10, nov: 11, des: 12 }
  let selectedMonth = 1
  if (selectedPeriod) {
    const key = selectedPeriod.replace(/[^a-z]/g, '').slice(0, 3)
    selectedMonth = monthMap[key] || Math.max(...periodValueToMonths(selectedPeriod))
  }

  const { lineValue } = useMonthlyLrLineValues(selectedMonth, state?.periodModes, journals)

  // Monthly breakdown — audited months from the monthly L/R snapshot, journal
  // months from posted journals (a month like Mei exists only as a snapshot).
  const monthlyData = []
  for (let m = 1; m <= selectedMonth; m++) {
    const bisnis = lineValue(m, '41', { isRevenue: true })
    const pengembangan = lineValue(m, '42', { isRevenue: true })
    monthlyData.push({
      month: monthNames[m],
      bisnis,
      pengembangan,
      total: bisnis + pengembangan,
    })
  }
  
  const grandTotal = monthlyData.reduce((s, m) => s + m.total, 0)

  return (
    <div className="report-doc">
      <ReportHeader 
        title="REKAP PENERIMAAN" 
        subtitle={`Rekap s/d ${monthNames[selectedMonth]} 2026`} 
        onPrint={() => printReport('Rekap Penerimaan')} 
      />
      <div className="report-doc-body">
        <table><thead><tr>
          <th>Bulan</th>
          <th className="text-right">Bisnis Utama (41xx)</th>
          <th className="text-right">Pengembangan (42xx)</th>
          <th className="text-right">Total</th>
        </tr></thead>
          <tbody>
            {monthlyData.map((m, i) => (
              <tr key={i}>
                <td style={{fontWeight:600}}>{m.month}</td>
                <td className="text-right mono">{fmtSign(m.bisnis)}</td>
                <td className="text-right mono">{fmtSign(m.pengembangan)}</td>
                <td className="text-right mono" style={{fontWeight:600}}>{fmtSign(m.total)}</td>
              </tr>
            ))}
            <tr style={{height:8}}><td colSpan={4}></td></tr>
            <tr style={{fontWeight:700, background:'var(--border-light)', fontSize:15, borderTop:'2px solid var(--border)'}}>
              <td>TOTAL YTD</td>
              <td className="text-right mono">{fmtSign(monthlyData.reduce((s,m) => s + m.bisnis, 0))}</td>
              <td className="text-right mono">{fmtSign(monthlyData.reduce((s,m) => s + m.pengembangan, 0))}</td>
              <td className="text-right mono" style={{color:'var(--success)'}}>{fmtSign(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
