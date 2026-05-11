import { useMemo } from 'react'
import { Line, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { AlertCircle, CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { dashboardKPIs, bbmChartData, trenBebanData } from '../data/sampleData.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const chartOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1E293B', cornerRadius: 8, padding: 12 } },
  scales: { x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94A3B8' } }, y: { grid: { color: '#F1F5F9' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94A3B8', callback: v => (v / 1000000).toFixed(0) + 'jt' } } }
}

export default function Dashboard() {
  const { state } = useApp()

  const pendingCount = useMemo(() => state.journals.filter(j => j.status === 'pending').length, [state.journals])
  const totalJournals = state.journals.length

  const alerts = [
    ...(pendingCount > 0 ? [{ type: 'warning', title: `${pendingCount} Jurnal menunggu persetujuan`, desc: 'Terdapat jurnal yang perlu di-review' }] : []),
    { type: 'success', title: 'Data Periode April 2026', desc: 'Saldo awal sesuai LAI Perumda 2025 (audited)' },
    { type: 'info', title: `${state.coaFlat.length} Akun COA Perumda`, desc: 'Bagan akun lengkap sesuai data Perumda' },
  ]

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Dashboard Keuangan</h1>
        <p>Periode Mei 2026 — Sistem Akuntansi Perumda Pasar Baiman</p>
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
        {dashboardKPIs.map((kpi, i) => (
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
              <div className="card-subtitle">7 bulan terakhir</div>
            </div>
          </div>
          <div style={{ height: 260 }}><Line data={bbmChartData} options={chartOptions} /></div>
        </div>
        <div className="chart-card">
          <div className="card-header">
            <div>
              <div className="card-title">Tren Beban</div>
              <div className="card-subtitle">Akun 610xx & 620xx (7 bulan terakhir)</div>
            </div>
          </div>
          <div style={{ height: 260 }}><Bar data={trenBebanData} options={chartOptions} /></div>
        </div>
      </div>
    </div>
  )
}
