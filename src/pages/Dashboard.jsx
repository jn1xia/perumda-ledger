import { useMemo } from 'react'
import { Line, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { AlertCircle, CheckCircle2, TrendingDown, TrendingUp, RefreshCw, Activity } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { expandJournals } from '../utils/journalExpand.js'
import { cashBalancesByAccount } from '../utils/reportDelta.js'
import { latestPostedMonth } from '../utils/journalFilters.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

const chartOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1E293B', cornerRadius: 8, padding: 12 } },
  scales: { x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94A3B8' } }, y: { grid: { color: '#F1F5F9' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94A3B8', callback: v => (v / 1000000).toFixed(0) + 'jt' } } }
}

export default function Dashboard() {
  const { state, refreshData } = useApp()

  const pendingCount = useMemo(() => state.journals.filter(j => j.status === 'pending').length, [state.journals])
  const postedCount = useMemo(() => state.journals.filter(j => j.status === 'posted').length, [state.journals])
  const totalJournals = state.journals.length

  const dashboardData = useMemo(() => {
    const posted = expandJournals(state.journals).filter(j => j.status === 'posted')
    const months = MONTHS_SHORT
    // Periode berjalan = bulan terakhir yang sudah punya jurnal posted.
    // Sebelumnya di-hard-code ke 4 (April), sehingga kartu pendapatan, kedua
    // grafik dan seluruh label periode berhenti di April walaupun pembukuan
    // sudah jalan sampai Agustus.
    const currentMonth = latestPostedMonth(posted) || 1

    const startsWithAny = (akun, prefixes) => prefixes.some(p => String(akun || '').startsWith(p))
    const openingBalance = (prefixes) => (state.coaFlat || [])
      .filter(a => prefixes.some(p => String(a.code || '').startsWith(p)))
      .reduce((s, a) => s + (Number(a.saldo_awal) || 0), 0)

    const assetBalance = (prefixes) => posted.reduce((s, j) => {
      let total = s
      if (startsWithAny(j.akun_debit, prefixes)) total += Number(j.debit) || 0
      if (startsWithAny(j.akun_kredit, prefixes)) total -= Number(j.kredit) || 0
      return total
    }, openingBalance(prefixes))

    const incomeForMonth = (monthNumber) => posted.reduce((s, j) => {
      if (!String(j.tanggal || '').startsWith(`2026-${String(monthNumber).padStart(2, '0')}`)) return s
      let total = s
      if (String(j.akun_kredit || '').startsWith('4')) total += Number(j.kredit) || 0
      if (String(j.akun_debit || '').startsWith('4')) total -= Number(j.debit) || 0
      return total
    }, 0)

    const expenseForMonth = (monthNumber) => posted.reduce((s, j) => {
      if (!String(j.tanggal || '').startsWith(`2026-${String(monthNumber).padStart(2, '0')}`)) return s
      let total = s
      if (String(j.akun_debit || '').startsWith('6')) total += Number(j.debit) || 0
      if (String(j.akun_kredit || '').startsWith('6')) total -= Number(j.kredit) || 0
      return total
    }, 0)

    const monthlyBBM = months.map((_, idx) => {
      const monthNumber = idx + 1
      return posted.reduce((s, j) => {
        if (!String(j.tanggal || '').startsWith(`2026-${String(monthNumber).padStart(2, '0')}`)) return s
        let total = s
        if (String(j.akun_debit || '').startsWith('11501')) total += Number(j.debit) || 0
        if (String(j.akun_kredit || '').startsWith('11501')) total -= Number(j.kredit) || 0
        return total
      }, 0)
    })

    // Kas & setara kas per akun. Memakai definisi yang sama dengan Laporan Arus
    // Kas (isCashCode -> kelas 111) dan dibangun dari satu peta, jadi: (a) tidak
    // ada rekening kas yang bisa tertinggal lagi ketika akun baru dibuat — daftar
    // kode yang ditulis tangan di sini pernah melewatkan 11108 Bank BSI — dan
    // (b) total kartu selalu sama dengan jumlah rincian di bawahnya.
    const cashByAccount = cashBalancesByAccount(state.coaFlat, posted)
    const cashName = (code) => {
      const a = (state.coaFlat || []).find(x => String(x.code || '') === code)
      return a ? a.name : code
    }
    const cashTotal = [...cashByAccount.values()].reduce((s, v) => s + v, 0)
    const cashSubs = [...cashByAccount.entries()]
      .filter(([, v]) => v !== 0)
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([code, v]) => ({ code, name: cashName(code), amount: formatRupiah(v) }))

    const currentIncome = incomeForMonth(currentMonth)
    const previousIncome = incomeForMonth(currentMonth - 1)
    const incomeTrend = previousIncome !== 0
      ? `${Math.abs(((currentIncome - previousIncome) / previousIncome) * 100).toFixed(1)}%`
      : '-'

    const kpis = [
      {
        label: 'Kas & Bank',
        value: formatRupiah(cashTotal),
        subs: cashSubs,
      },
      {
        label: 'Piutang Usaha',
        value: formatRupiah(assetBalance(['11201'])),
        trend: { value: `${state.piutang?.filter(p => (p.sisa || 0) > 0).length || 0} open`, direction: 'down', vs: 'faktur aktif' },
        subs: [{ code: '11201', name: 'Piutang Usaha', amount: '' }],
      },
      {
        // Hanya akun 4xxxx, sama persis dengan baris "JUMLAH PENDAPATAN USAHA"
        // di Laba Rugi. Pendapatan lain-lain (7xxxx) sengaja tidak ikut karena
        // di Laba Rugi pun berdiri sendiri sebagai "JUMLAH PENDAPATAN LAIN-LAIN".
        label: `Pendapatan Usaha (${months[currentMonth - 1]})`,
        value: formatRupiah(currentIncome),
        trend: { value: incomeTrend, direction: currentIncome >= previousIncome ? 'up' : 'down', vs: 'vs bulan lalu' },
        subs: [{ code: '4xxxx', name: 'Pendapatan Usaha Posted', amount: '' }],
      },
      {
        label: 'BBM Dibayar di Muka',
        value: formatRupiah(assetBalance(['11501'])),
        trend: { value: '-', direction: 'down', vs: 'saldo posted' },
        subs: [{ code: '11501', name: 'BBM Prabayar', amount: '' }],
      },
    ]

    return {
      kpis,
      currentMonth,
      bbmChart: {
        labels: months.slice(0, currentMonth),
        datasets: [{
          label: 'BBM Realisasi',
          data: monthlyBBM.slice(0, currentMonth),
          borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.4, fill: true, pointRadius: 5, pointBackgroundColor: '#3B82F6',
        }],
      },
      bebanChart: {
        labels: months.slice(0, currentMonth),
        datasets: [{
          label: 'Beban Umum & Administrasi',
          data: months.slice(0, currentMonth).map((_, idx) => expenseForMonth(idx + 1)),
          backgroundColor: '#E54D42', borderRadius: 6,
        }],
      },
    }
  }, [state.journals, state.coaFlat, state.piutang])

  const periodeLabel = `${MONTHS_LONG[dashboardData.currentMonth - 1]} 2026`

  const alerts = [
    ...(pendingCount > 0 ? [{ type: 'warning', title: `${pendingCount} Jurnal menunggu persetujuan`, desc: 'Terdapat jurnal yang perlu di-review' }] : []),
    { type: 'success', title: `Data Periode ${periodeLabel}`, desc: 'Saldo awal sesuai LAI Perumda 2025 (audited)' },
    { type: 'info', title: `${state.coaFlat.length} Akun COA Perumda`, desc: 'Bagan akun lengkap sesuai data Perumda' },
  ]

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Dashboard Keuangan</h1>
          <p>Periode {periodeLabel} — Sistem Akuntansi Perumda Pasar Baiman</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={14} color="#10B981" />
            <span>Live data:</span>
            <strong style={{ color: 'var(--text)' }}>{postedCount}</strong>&nbsp;posted
            <span>·</span>
            <strong style={{ color: '#F59E0B' }}>{pendingCount}</strong>&nbsp;pending
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => refreshData('all')}
            title="Tarik ulang data dari server"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="alert-grid">
          {alerts.map((alert, i) => (
            <div key={i} className={`alert-banner ${alert.type}`}>
              <div className="alert-icon">
                {alert.type === 'warning' ? <AlertCircle size={24} color="#F59E0B" /> : <CheckCircle2 size={24} color="#10B981" />}
              </div>
              <div className="alert-text">
                <h3>{alert.title}</h3>
                <p>{alert.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="kpi-grid">
        {dashboardData.kpis.map((kpi, i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            {kpi.trend && (
              <div className={`kpi-trend ${kpi.trend.direction}`}>
                {kpi.trend.direction === 'down' ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                {kpi.trend.value} {kpi.trend.vs}
              </div>
            )}
            {kpi.subs && kpi.subs.length > 0 && kpi.subs[0].amount && (
              <div className="kpi-sub">
                {kpi.subs.map((s, j) => (
                  <div key={j} className="kpi-sub-item">
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{s.code} {s.name}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '12px' }}>{s.amount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <div className="card-header">
            <div>
              <div className="card-title">BBM Top-up vs Pemakaian</div>
              <div className="card-subtitle">Jan–{MONTHS_SHORT[dashboardData.currentMonth - 1]} 2026</div>
            </div>
          </div>
          <div style={{ height: 260 }}><Line data={dashboardData.bbmChart} options={chartOptions} /></div>
        </div>
        <div className="chart-card">
          <div className="card-header">
            <div>
              <div className="card-title">Tren Beban</div>
              <div className="card-subtitle">Akun 610xx &amp; 620xx (Jan–{MONTHS_SHORT[dashboardData.currentMonth - 1]} 2026)</div>
            </div>
          </div>
          <div style={{ height: 260 }}><Bar data={dashboardData.bebanChart} options={chartOptions} /></div>
        </div>
      </div>
    </div>
  )
}
