import { useState, useMemo } from 'react'
import { Doughnut, Line, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { TrendingDown, TrendingUp, Printer, Download, BarChart3, FileText, PieChart, Activity, Wallet, BookOpen, StickyNote, Zap, SortAsc, Calendar } from 'lucide-react'
import { useApp, computeCashFlow } from '../context/AppContext.jsx'
import { laporanKPIs, komposisiBebanData, trenLabaBersihData, pendapatanVsBebanData, trenSaldoKasData, formatRupiah } from '../data/sampleData.js'
import { MONTHS, periodValueToYearMonth, periodValueToLabel, filterJournalsByMonth, filterJournalsYTD } from '../utils/journalFilters.js'
import { printReport, exportCSV, exportLabaRugi, exportNeraca, exportNeracaSaldo, exportPerubahanEkuitas, exportArusKas, exportAnalisis } from '../utils/exportUtils.js'
import { exportFullReport } from '../utils/exportFullReport.js'
import { NeracaSaldoTanggal, NeracaSaldoType, NeracaMTDYTD, NeracaDetail, NeracaTriwulan } from './reports/NeracaReports.jsx'
import { LabaRugiMTDYTD, LabaRugiDetail, LabaRugiTriwulan, LabaRugiSemester, LabaRugi2Bulan, LabaRugiBudget, LabaRugiProject } from './reports/LabaRugiReports.jsx'
import { HPP, HPPDetail, HPPTriwulan, HPP2Bulan, HPPBudget, LacakKilat, LaporanSortir } from './reports/HPPAndSpecialReports.jsx'

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 12 }, padding: 16, usePointStyle: true } }, tooltip: { backgroundColor: '#1E293B', cornerRadius: 8, padding: 12 } },
    scales: { x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94A3B8' } }, y: { grid: { color: '#F1F5F9' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94A3B8', callback: v => (v / 1000000).toFixed(0) + 'jt' } } }
}
const doughnutOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }

const tabs = [
    // Group: Neraca Saldo
    { id: 'neraca-saldo', label: 'Neraca Saldo', icon: Wallet, group: 'Neraca Saldo' },
    { id: 'neraca-saldo-tanggal', label: 'NS per Tanggal', icon: Wallet, group: 'Neraca Saldo' },
    { id: 'neraca-saldo-type', label: 'NS per Tipe', icon: Wallet, group: 'Neraca Saldo' },
    // Group: Neraca
    { id: 'neraca', label: 'Neraca', icon: BookOpen, group: 'Neraca' },
    { id: 'neraca-mtd-ytd', label: 'Neraca MTD/YTD', icon: BookOpen, group: 'Neraca' },
    { id: 'neraca-detail', label: 'Neraca Detail', icon: BookOpen, group: 'Neraca' },
    { id: 'neraca-triwulan', label: 'Neraca per 3 Bln', icon: BookOpen, group: 'Neraca' },
    // Group: Laba Rugi
    { id: 'laba-rugi', label: 'Laba Rugi', icon: Activity, group: 'Laba Rugi' },
    { id: 'lr-mtd-ytd', label: 'L/R MTD/YTD', icon: Activity, group: 'Laba Rugi' },
    { id: 'lr-detail', label: 'L/R Detail', icon: Activity, group: 'Laba Rugi' },
    { id: 'lr-triwulan', label: 'L/R per 3 Bln', icon: Activity, group: 'Laba Rugi' },
    { id: 'lr-semester', label: 'L/R per Semester', icon: Activity, group: 'Laba Rugi' },
    { id: 'lr-2bulan', label: 'L/R per 2 Bln', icon: Activity, group: 'Laba Rugi' },
    { id: 'lr-budget', label: 'L/R vs Budget', icon: Activity, group: 'Laba Rugi' },
    { id: 'lr-project', label: 'L/R per Project', icon: Activity, group: 'Laba Rugi' },
    // Group: HPP
    { id: 'hpp', label: 'HPP', icon: BarChart3, group: 'HPP' },
    { id: 'hpp-detail', label: 'HPP Detail', icon: BarChart3, group: 'HPP' },
    { id: 'hpp-triwulan', label: 'HPP per 3 Bln', icon: BarChart3, group: 'HPP' },
    { id: 'hpp-2bulan', label: 'HPP per 2 Bln', icon: BarChart3, group: 'HPP' },
    { id: 'hpp-budget', label: 'HPP vs Budget', icon: BarChart3, group: 'HPP' },
    // Group: Khusus
    { id: 'lacak-kilat', label: 'Lacak Kilat', icon: TrendingDown, group: 'Khusus' },
    { id: 'laporan-sortir', label: 'Laporan Sortir', icon: FileText, group: 'Khusus' },
    // Group: Lainnya
    { id: 'perubahan-ekuitas', label: 'Perubahan Ekuitas', icon: PieChart, group: 'Lainnya' },
    { id: 'arus-kas', label: 'Arus Kas', icon: TrendingUp, group: 'Lainnya' },
    { id: 'calk', label: 'CALK', icon: StickyNote, group: 'Lainnya' },
    { id: 'rasio', label: 'Analisis Rasio', icon: Zap, group: 'Lainnya' }
]

const tabGroups = ['Neraca Saldo', 'Neraca', 'Laba Rugi', 'HPP', 'Khusus', 'Lainnya']

function CashFlowSection({ title, data, color }) {
    return (
        <div style={{ marginBottom: 24 }}>
            <div style={{ background: color, padding: '12px 20px', borderRadius: 'var(--radius-sm)', marginBottom: 8 }}>
                <strong>{title}</strong>
            </div>
            {data.items.length === 0 && (
                <p style={{ color: 'var(--text-muted)', padding: '12px 20px', fontSize: 13 }}>Tidak ada transaksi kas dalam kategori ini</p>
            )}
            {data.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 20px', borderBottom: '1px solid var(--border-light)' }}>
                    <div>
                        <span style={{ fontSize: 13 }}>{item.keterangan}</span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{item.ref}</span>
                    </div>
                    <span className="mono" style={{ fontWeight: 600, color: item.jumlah >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {formatRupiah(item.jumlah)}
                    </span>
                </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                <span>Arus Kas Bersih — {title}</span>
                <span className="mono" style={{ color: data.netto >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatRupiah(data.netto)}</span>
            </div>
        </div>
    )
}

export default function Laporan() {
    const { state } = useApp()
    const [activeTab, setActiveTab] = useState('laba-rugi')
    const [activeGroup, setActiveGroup] = useState('Laba Rugi')
    const [showComparison, setShowComparison] = useState(false)
    const [selectedPeriod, setSelectedPeriod] = useState('apr')

    function getPeriodLabel(val) {
        return periodValueToLabel(val)
    }

    const { journals, coaFlat, coaTree } = state

    // --- DYNAMIC CALCULATION ENGINE ---
    const yearMonth = periodValueToYearMonth(selectedPeriod)

    // For Laba Rugi (Income Statement): only the selected month
    const postedForLabaRugi = useMemo(() =>
        filterJournalsByMonth(journals.filter(j => j.status === 'posted'), yearMonth)
    , [journals, yearMonth])

    // For Neraca (Balance Sheet): YTD up to and including selected month
    const postedForNeraca = useMemo(() =>
        filterJournalsYTD(journals.filter(j => j.status === 'posted'), yearMonth)
    , [journals, yearMonth])

    // Helper to calculate balance for a set of accounts and a specific set of journals
    const calculateBalance = (accountNameContains, isCreditNormal, journalSet) => {
        const accts = coaFlat.filter(a => a.name.toLowerCase().includes(accountNameContains.toLowerCase()) && a.type === 'posting')
        let total = 0
        accts.forEach(a => {
            let d = 0, k = 0
            journalSet.forEach(j => {
                if (j.akun_debit?.split(' ')[0] === a.code) d += j.debit
                if (j.akun_kredit?.split(' ')[0] === a.code) k += j.kredit
            })
            if (isCreditNormal) total += (a.saldoAwal || 0) + k - d
            else total += (a.saldoAwal || 0) + d - k
        })
        return total
    }

    const calculateBalanceByCode = (prefix, isCreditNormal, journalSet) => {
        const accts = coaFlat.filter(a => a.code.startsWith(prefix) && a.type === 'posting')
        let total = 0
        accts.forEach(a => {
            let d = 0, k = 0
            journalSet.forEach(j => {
                if (j.akun_debit?.split(' ')[0] === a.code) d += j.debit
                if (j.akun_kredit?.split(' ')[0] === a.code) k += j.kredit
            })
            if (isCreditNormal) total += (a.saldoAwal || 0) + k - d
            else total += (a.saldoAwal || 0) + d - k
        })
        return total
    }

    // Helper for Income Statement: never include saldoAwal since nominal accounts reset every period
    const calculatePeriodBalanceByCode = (prefix, isCreditNormal, journalSet) => {
        const accts = coaFlat.filter(a => a.code.startsWith(prefix) && a.type === 'posting')
        let total = 0
        accts.forEach(a => {
            let d = 0, k = 0
            journalSet.forEach(j => {
                if (j.akun_debit?.split(' ')[0] === a.code) d += j.debit
                if (j.akun_kredit?.split(' ')[0] === a.code) k += j.kredit
            })
            if (isCreditNormal) total += k - d
            else total += d - k
        })
        return total
    }

    // Dynamic Laba Rugi Variables (Period specific, strictly journals only)
    const dynPendapatanUtama = calculatePeriodBalanceByCode('41', true, postedForLabaRugi)
    const dynPendapatanLainnya = calculatePeriodBalanceByCode('42', true, postedForLabaRugi)
    const dynPendapatanNonOps = calculatePeriodBalanceByCode('7', true, postedForLabaRugi)
    const dynBebanAdmin = calculatePeriodBalanceByCode('61', false, postedForLabaRugi)
    const dynBebanOps = calculatePeriodBalanceByCode('62', false, postedForLabaRugi)
    const dynBebanNonOps = calculatePeriodBalanceByCode('8', false, postedForLabaRugi)

    const dynTotalPendapatan = dynPendapatanUtama + dynPendapatanLainnya + dynPendapatanNonOps
    const dynTotalBeban = dynBebanAdmin + dynBebanOps + dynBebanNonOps
    const dynLabaBersih = dynTotalPendapatan - dynTotalBeban

    // YTD Laba Rugi for Neraca & Ekuitas (Strictly journals up to current month)
    const dynPendapatanUtamaYTD = calculatePeriodBalanceByCode('41', true, postedForNeraca)
    const dynPendapatanLainnyaYTD = calculatePeriodBalanceByCode('42', true, postedForNeraca)
    const dynPendapatanNonOpsYTD = calculatePeriodBalanceByCode('7', true, postedForNeraca)
    const dynBebanAdminYTD = calculatePeriodBalanceByCode('61', false, postedForNeraca)
    const dynBebanOpsYTD = calculatePeriodBalanceByCode('62', false, postedForNeraca)
    const dynBebanNonOpsYTD = calculatePeriodBalanceByCode('8', false, postedForNeraca)
    const dynLabaBersihYTD = (dynPendapatanUtamaYTD + dynPendapatanLainnyaYTD + dynPendapatanNonOpsYTD) - (dynBebanAdminYTD + dynBebanOpsYTD + dynBebanNonOpsYTD)

    const cashFlow = useMemo(() => computeCashFlow(postedForLabaRugi), [postedForLabaRugi])

    return (
        <div className="animate-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Laporan Keuangan</h1>
                    <p>Financial Statements — Perumda Pasar Baiman</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => exportFullReport(state, journals, selectedPeriod, cashFlow)}><Download size={16} /> Export Laporan Lengkap (.xlsx)</button>
                    <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => printReport('Laporan Keuangan — Perumda Pasar Baiman')}><Printer size={16} /> Cetak Laporan</button>
                </div>
            </div>

            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="kpi-card">
                    <div className="kpi-label">Total Pendapatan <span className="kpi-icon green"><TrendingUp size={18} /></span></div>
                    <div className="kpi-value">{formatRupiah(dynTotalPendapatan)}</div>
                    <div className="kpi-trend up"><TrendingUp size={14} /> - {getPeriodLabel(selectedPeriod)}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">Total Beban <span className="kpi-icon red"><TrendingDown size={18} /></span></div>
                    <div className="kpi-value">{formatRupiah(dynTotalBeban)}</div>
                    <div className="kpi-trend down"><TrendingDown size={14} /> - {getPeriodLabel(selectedPeriod)}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">Laba Bersih <span className="kpi-icon green"><TrendingUp size={18} /></span></div>
                    <div className="kpi-value">{formatRupiah(dynLabaBersih)}</div>
                    <div className="kpi-trend up"><TrendingUp size={14} /> - {getPeriodLabel(selectedPeriod)}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">Total Aset <span className="kpi-icon blue"><BookOpen size={18} /></span></div>
                    <div className="kpi-value">{formatRupiah(calculateBalanceByCode('1', false, postedForNeraca))}</div>
                    <div className="kpi-trend up"><TrendingUp size={14} /> - {getPeriodLabel(selectedPeriod)}</div>
                </div>
            </div>

            {/* Month Selector Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <Calendar size={16} color="var(--primary)" />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Periode:</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                        {MONTHS.map(m => (
                            <button key={m.value} onClick={() => setSelectedPeriod(m.value)} style={{
                                padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                                border: m.isAudit ? '1px solid var(--primary)' : '1px solid transparent',
                                background: selectedPeriod === m.value ? 'var(--primary)' : 'var(--border-light)',
                                color: selectedPeriod === m.value ? 'white' : 'var(--text-muted)',
                                fontWeight: selectedPeriod === m.value || m.isAudit ? 600 : 400,
                                transition: 'all 0.2s',
                                position: 'relative'
                            }}>
                                {m.label}
                                {m.isAudit && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, background: 'var(--success)', borderRadius: '50%', border: '2px solid var(--bg-primary)' }} />}
                            </button>
                        ))}
                    </div>
                    <div className="toggle-wrapper" onClick={() => setShowComparison(!showComparison)} style={{ marginLeft: 'auto' }}>
                        <div className={`toggle ${showComparison ? 'active' : ''}`} />
                        <span style={{ fontSize: 12 }}>Perbandingan</span>
                    </div>
                </div>
                {!MONTHS.find(m => m.value === selectedPeriod)?.isAudit && (
                    <div style={{ fontSize: 11, color: 'var(--warning)', paddingLeft: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>⚠️ Data audit hanya tersedia untuk bulan Januari dan April 2026.</span>
                    </div>
                )}
            </div>

            {/* Group selector row */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {tabGroups.map(g => (
                    <button key={g} className={`btn btn-sm ${activeGroup === g ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => { setActiveGroup(g); const first = tabs.find(t => t.group === g); if (first) setActiveTab(first.id) }}>
                        {g}
                    </button>
                ))}
            </div>
            {/* Tabs within active group */}
            <div className="tabs">
                {tabs.filter(t => t.group === activeGroup).map(tab => (
                    <button key={tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}>
                        <tab.icon size={16} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* ===== LABA RUGI TAB ===== */}
            {activeTab === 'laba-rugi' && (
                <>
                    <div className="report-doc" style={{ marginBottom: 24 }}>
                        <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div className="company">PERUMDA PASAR BAIMAN</div>
                                <h2>LAPORAN LABA RUGI</h2>
                                <div className="period">Untuk Periode {getPeriodLabel(selectedPeriod)} 2026</div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('Laporan Laba Rugi')}><Printer size={14} /> Cetak Laporan</button>
                                <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={exportLabaRugi}><Download size={14} /> Unduh Excel (.xlsx)</button>
                            </div>
                        </div>
                        <div className="report-doc-body">
                            <table>
                                <thead><tr><th>Akun</th><th className="text-right">{getPeriodLabel(selectedPeriod)}</th>{showComparison && <th className="text-right">Bulan Lalu</th>}{showComparison && <th className="text-right">Selisih</th>}</tr></thead>
                                <tbody>
                                    <tr style={{ background: 'var(--success-light)' }}><td style={{ fontWeight: 700 }}>PENDAPATAN</td><td></td>{showComparison && <td></td>}{showComparison && <td></td>}</tr>
                                    <tr><td style={{ paddingLeft: 32 }}>Pendapatan Bisnis Utama</td><td className="text-right mono">{formatRupiah(dynPendapatanUtama)}</td>{showComparison && <td className="text-right mono">Rp 0</td>}{showComparison && <td className="text-right mono">-</td>}</tr>
                                    <tr><td style={{ paddingLeft: 32 }}>Pendapatan Bisnis Lainnya</td><td className="text-right mono">{formatRupiah(dynPendapatanLainnya)}</td>{showComparison && <td className="text-right mono">Rp 0</td>}{showComparison && <td className="text-right mono">-</td>}</tr>
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}><td>Total Pendapatan</td><td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(dynTotalPendapatan)}</td>{showComparison && <td className="text-right mono">Rp 0</td>}{showComparison && <td className="text-right mono">-</td>}</tr>
                                    <tr style={{ height: 8 }}><td colSpan={showComparison ? 4 : 2}></td></tr>
                                    <tr style={{ background: 'var(--danger-light)' }}><td style={{ fontWeight: 700 }}>BEBAN</td><td></td>{showComparison && <td></td>}{showComparison && <td></td>}</tr>
                                    <tr><td style={{ paddingLeft: 32 }}>Beban Administrasi & Umum</td><td className="text-right mono">{formatRupiah(dynBebanAdmin)}</td>{showComparison && <td className="text-right mono">Rp 0</td>}{showComparison && <td className="text-right mono">-</td>}</tr>
                                    <tr><td style={{ paddingLeft: 32 }}>Beban Operasional & Bisnis</td><td className="text-right mono">{formatRupiah(dynBebanOps)}</td>{showComparison && <td className="text-right mono">Rp 0</td>}{showComparison && <td className="text-right mono">-</td>}</tr>
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}><td>Total Beban</td><td className="text-right mono" style={{ color: 'var(--danger)' }}>{formatRupiah(dynTotalBeban)}</td>{showComparison && <td className="text-right mono">Rp 0</td>}{showComparison && <td className="text-right mono">-</td>}</tr>
                                    <tr style={{ height: 8 }}><td colSpan={showComparison ? 4 : 2}></td></tr>
                                    <tr style={{ fontWeight: 700, background: 'var(--border-light)', fontSize: 15 }}>
                                        <td>LABA BERSIH</td>
                                        <td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(dynLabaBersih)}</td>
                                        {showComparison && <td className="text-right mono">Rp 0</td>}
                                        {showComparison && <td className="text-right mono">-</td>}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="chart-grid">
                        <div className="chart-card">
                            <div className="card-header"><div><div className="card-title">Komposisi Beban Operasional</div><div className="card-subtitle">Januari 2026</div></div></div>
                            <div style={{ height: 240, display: 'flex', justifyContent: 'center' }}><Doughnut data={komposisiBebanData} options={doughnutOpts} /></div>
                            <div style={{ marginTop: 16 }}>
                                {komposisiBebanData.labels.map((label, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? '1px solid var(--border-light)' : 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: komposisiBebanData.datasets[0].backgroundColor[i] }} /><span style={{ fontSize: 13 }}>{label}</span></div>
                                        <span className="mono" style={{ fontSize: 13 }}>{formatRupiah(komposisiBebanData.datasets[0].data[i])}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="chart-card">
                            <div className="card-header"><div><div className="card-title">Tren Laba Bersih 6 Bulan</div><div className="card-subtitle">Agt 2025 – Jan 2026</div></div></div>
                            <div style={{ height: 280 }}><Line data={trenLabaBersihData} options={chartOpts} /></div>
                        </div>
                    </div>

                    <div className="chart-grid">
                        <div className="chart-card">
                            <div className="card-header"><div><div className="card-title">Pendapatan vs. Beban — Tren Bulanan</div><div className="card-subtitle">Agt 2025 – Jan 2026</div></div></div>
                            <div style={{ height: 280 }}><Bar data={pendapatanVsBebanData} options={chartOpts} /></div>
                        </div>
                        <div className="chart-card">
                            <div className="card-header"><div><div className="card-title">Tren Saldo Kas & Bank</div><div className="card-subtitle">6 bulan terakhir</div></div><span style={{ fontWeight: 700, color: 'var(--primary)' }}>Rp 5.821.835.000</span></div>
                            <div style={{ height: 280 }}><Line data={trenSaldoKasData} options={{ ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, ticks: { ...chartOpts.scales.y.ticks, callback: v => (v / 1000000).toFixed(1) + 'M' } } } }} /></div>
                        </div>
                    </div>
                </>
            )}

            {/* ===== ARUS KAS TAB (AUTO-GENERATED) ===== */}
            {activeTab === 'arus-kas' && (
                <div className="report-doc">
                    <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div className="company">PERUMDA PASAR BAIMAN</div>
                            <h2>LAPORAN ARUS KAS</h2>
                            <div className="period">Untuk Periode {getPeriodLabel(selectedPeriod)} 2026 — Metode Langsung</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('Laporan Arus Kas')}><Printer size={14} /> Cetak Laporan</button>
                            <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => exportArusKas(cashFlow)}><Download size={14} /> Unduh Excel (.xlsx)</button>
                        </div>
                    </div>
                    <div className="report-doc-body">
                        <div style={{ background: 'var(--primary-light)', padding: '12px 20px', borderRadius: 'var(--radius-sm)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Activity size={16} color="var(--primary)" />
                            <span style={{ fontSize: 13, color: 'var(--primary)' }}>Laporan ini digenerate otomatis dari data jurnal yang sudah di-posting. Total {state.journals.filter(j => j.status === 'posted').length} jurnal diproses.</span>
                        </div>

                        <CashFlowSection title="Aktivitas Operasional" data={cashFlow.operasional} color="var(--success-light)" />
                        <CashFlowSection title="Aktivitas Investasi" data={cashFlow.investasi} color="var(--primary-light)" />
                        <CashFlowSection title="Aktivitas Pendanaan" data={cashFlow.pendanaan} color="var(--purple-light)" />

                        <div style={{ background: 'var(--border-light)', padding: '16px 20px', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                            <strong style={{ fontSize: 16 }}>KENAIKAN / (PENURUNAN) KAS BERSIH</strong>
                            <strong className="mono" style={{ fontSize: 18, color: cashFlow.totalNetto >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                {formatRupiah(cashFlow.totalNetto)}
                            </strong>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== NERACA SALDO TAB ===== */}
            {activeTab === 'neraca-saldo' && (() => {
                function flat(nodes, r = []) { nodes.forEach(n => { if (n.type === 'posting') r.push(n); if (n.children) flat(n.children, r) }); return r }
                const accts = flat(state.coaTree || [])
                const rows = accts.map(a => {
                    let d = 0, k = 0
                    postedForNeraca.forEach(j => { const dc = j.akun_debit?.split(' ')[0], kc = j.akun_kredit?.split(' ')[0]; if (dc === a.code) d += j.debit; if (kc === a.code) k += j.kredit })
                    
                    // Incorporate saldoAwal
                    let balanceD = 0, balanceK = 0
                    let category = a.category?.toLowerCase() || ''
                    // Normal balance: Asset/Expense -> Debit, Liability/Equity/Income -> Credit
                    let isCreditNormal = ['kewajiban', 'ekuitas', 'pendapatan'].includes(category)
                    
                    let net = (a.saldoAwal || 0) + (isCreditNormal ? k - d : d - k)
                    if (net > 0) {
                        if (isCreditNormal) balanceK = net
                        else balanceD = net
                    } else if (net < 0) {
                        if (isCreditNormal) balanceD = -net
                        else balanceK = -net
                    }

                    return { ...a, debit: balanceD, kredit: balanceK }
                }).filter(r => r.debit !== 0 || r.kredit !== 0)
                const totD = rows.reduce((s, r) => s + r.debit, 0), totK = rows.reduce((s, r) => s + r.kredit, 0)
                return (
                    <div className="report-doc">
                        <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div className="company">PERUMDA PASAR BAIMAN</div><h2>NERACA SALDO</h2><div className="period">Per 30 April 2026</div></div><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('Neraca Saldo')}><Printer size={14} /> Cetak Laporan</button><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => exportNeracaSaldo(rows)}><Download size={14} /> Unduh Excel (.xlsx)</button></div></div>
                        <div className="report-doc-body">
                            <table><thead><tr><th>Kode</th><th>Nama Akun</th><th className="text-right">Debit</th><th className="text-right">Kredit</th></tr></thead>
                                <tbody>
                                    {rows.map(r => <tr key={r.code}><td className="mono">{r.code}</td><td>{r.name}</td><td className="text-right mono">{r.debit ? formatRupiah(r.debit) : '-'}</td><td className="text-right mono">{r.kredit ? formatRupiah(r.kredit) : '-'}</td></tr>)}
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}><td colSpan={2}>TOTAL</td><td className="text-right mono">{formatRupiah(totD)}</td><td className="text-right mono">{formatRupiah(totK)}</td></tr>
                                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 12 }}><span className={`badge ${totD === totK ? 'green' : 'red'}`}>{totD === totK ? '✓ Balance — Debit = Kredit' : '✗ Tidak Balance'}</span></td></tr>
                                </tbody></table>
                        </div>
                    </div>
                )
            })()}

            {/* ===== NERACA TAB ===== */}
            {activeTab === 'neraca' && (() => {
                // Aset (Debit Normal)
                const dynKas = calculateBalanceByCode('111', false, postedForNeraca) + calculateBalanceByCode('112', false, postedForNeraca)
                const dynPiutang = calculateBalanceByCode('113', false, postedForNeraca) + calculateBalanceByCode('114', false, postedForNeraca)
                const dynBBM = calculateBalanceByCode('115', false, postedForNeraca)
                
                // Aset Tetap and Penyusutan
                const dynAsetTetap = calculateBalanceByCode('13', false, postedForNeraca)
                const dynAkumPenyusutan = calculateBalanceByCode('132', true, postedForNeraca) || calculateBalanceByCode('122', true, postedForNeraca)

                const asetItems = [
                    { n: 'Kas & Bank', v: dynKas }, 
                    { n: 'Piutang Usaha', v: dynPiutang }, 
                    { n: 'BBM Dibayar di Muka', v: dynBBM }, 
                    { n: 'Aset Tetap (neto)', v: dynAsetTetap }, 
                    { n: 'Akum. Penyusutan', v: -dynAkumPenyusutan }
                ]

                // Kewajiban (Credit Normal)
                const dynUtangUsaha = calculateBalanceByCode('211', true, postedForNeraca) + calculateBalanceByCode('212', true, postedForNeraca) + calculateBalanceByCode('213', true, postedForNeraca)
                const dynUtangPajak = calculateBalanceByCode('214', true, postedForNeraca) || calculateBalanceByCode('215', true, postedForNeraca)
                const kewajibanItems = [
                    { n: 'Utang Usaha', v: dynUtangUsaha }, 
                    { n: 'Utang Pajak', v: dynUtangPajak }
                ]

                // Ekuitas (Credit Normal)
                const dynModalDisetor = calculateBalanceByCode('31', true, postedForNeraca)
                const dynLabaDitahan = calculateBalanceByCode('32', true, postedForNeraca)
                
                const ekuitasItems = [
                    { n: 'Modal Disetor', v: dynModalDisetor }, 
                    { n: 'Laba Ditahan', v: dynLabaDitahan }, 
                    { n: 'Laba/Rugi Berjalan (YTD)', v: dynLabaBersihYTD } // Must be YTD to balance Neraca
                ]

                // Real balance check (total sum of codes) to ensure we don't miss any accounts!
                const dynTotalAset = calculateBalanceByCode('1', false, postedForNeraca)
                const dynTotalKewajiban = calculateBalanceByCode('2', true, postedForNeraca)
                const dynTotalEkuitasData = calculateBalanceByCode('3', true, postedForNeraca)
                const dynTotalEkuitas = dynTotalEkuitasData + dynLabaBersihYTD

                return (
                    <div className="report-doc">
                        <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div className="company">PERUMDA PASAR BAIMAN</div><h2>NERACA (LAPORAN POSISI KEUANGAN)</h2><div className="period">Per {getPeriodLabel(selectedPeriod)}</div></div><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('Neraca')}><Printer size={14} /> Cetak Laporan</button><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={exportNeraca}><Download size={14} /> Unduh Excel (.xlsx)</button></div></div>
                        <div className="report-doc-body">
                            <table><thead><tr><th>Akun</th><th className="text-right">Jumlah</th></tr></thead>
                                <tbody>
                                    <tr style={{ background: 'var(--primary-light)' }}><td style={{ fontWeight: 700 }}>ASET</td><td></td></tr>
                                    {asetItems.map((a, i) => <tr key={i}><td style={{ paddingLeft: 32 }}>{a.n}</td><td className="text-right mono" style={{ color: a.v < 0 ? 'var(--danger)' : undefined }}>{formatRupiah(a.v)}</td></tr>)}
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}><td>Total Aset</td><td className="text-right mono" style={{ color: 'var(--primary)' }}>{formatRupiah(dynTotalAset)}</td></tr>
                                    <tr style={{ height: 12 }}><td colSpan={2}></td></tr>
                                    <tr style={{ background: 'var(--danger-light)' }}><td style={{ fontWeight: 700 }}>KEWAJIBAN</td><td></td></tr>
                                    {kewajibanItems.map((k, i) => <tr key={i}><td style={{ paddingLeft: 32 }}>{k.n}</td><td className="text-right mono">{formatRupiah(k.v)}</td></tr>)}
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}><td>Total Kewajiban</td><td className="text-right mono" style={{ color: 'var(--danger)' }}>{formatRupiah(dynTotalKewajiban)}</td></tr>
                                    <tr style={{ height: 12 }}><td colSpan={2}></td></tr>
                                    <tr style={{ background: 'var(--success-light)' }}><td style={{ fontWeight: 700 }}>EKUITAS</td><td></td></tr>
                                    {ekuitasItems.map((e, i) => <tr key={i}><td style={{ paddingLeft: 32 }}>{e.n}</td><td className="text-right mono" style={{ color: e.v < 0 ? 'var(--danger)' : undefined }}>{formatRupiah(e.v)}</td></tr>)}
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}><td>Total Ekuitas</td><td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(dynTotalEkuitas)}</td></tr>
                                    <tr style={{ height: 8 }}><td colSpan={2}></td></tr>
                                    <tr style={{ fontWeight: 700, background: 'var(--border-light)', fontSize: 15 }}><td>Total Kewajiban + Ekuitas</td><td className="text-right mono">{formatRupiah(dynTotalKewajiban + dynTotalEkuitas)}</td></tr>
                                </tbody></table>
                        </div>
                    </div>
                )
            })()}

            {/* ===== PERUBAHAN EKUITAS TAB ===== */}
            {activeTab === 'perubahan-ekuitas' && (() => {
                const dynModalDisetor = calculateBalanceByCode('31', true, postedForNeraca)
                const dynLabaDitahan = calculateBalanceByCode('32', true, postedForNeraca)
                
                const saldoAwalMdl = dynModalDisetor
                const saldoAkhirMdl = saldoAwalMdl
                const saldoAkhirLR = dynLabaBersihYTD
                const saldoAkhirTotal = saldoAkhirMdl + dynLabaDitahan + saldoAkhirLR

                return (
                    <div className="report-doc">
                        <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div className="company">PERUMDA PASAR BAIMAN</div><h2>LAPORAN PERUBAHAN EKUITAS</h2><div className="period">Untuk Periode {getPeriodLabel(selectedPeriod)} 2026</div></div><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('Perubahan Ekuitas')}><Printer size={14} /> Cetak Laporan</button><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={exportPerubahanEkuitas}><Download size={14} /> Unduh Excel (.xlsx)</button></div></div>
                        <div className="report-doc-body">
                            <table><thead><tr><th>Keterangan</th><th className="text-right">Modal Disetor</th><th className="text-right">Laba Ditahan</th><th className="text-right">Total Ekuitas</th></tr></thead>
                                <tbody>
                                    <tr style={{ fontWeight: 600 }}><td>Saldo Awal (1 Jan 2026)</td><td className="text-right mono">{formatRupiah(saldoAwalMdl)}</td><td className="text-right mono">{formatRupiah(dynLabaDitahan)}</td><td className="text-right mono">{formatRupiah(saldoAwalMdl + dynLabaDitahan)}</td></tr>
                                    <tr><td style={{ paddingLeft: 24 }}>Penambahan Modal</td><td className="text-right mono">-</td><td className="text-right mono">-</td><td className="text-right mono">-</td></tr>
                                    <tr><td style={{ paddingLeft: 24 }}>Laba (Rugi) Bersih Tahun Berjalan (YTD)</td><td className="text-right mono">-</td><td className="text-right mono" style={{ color: dynLabaBersihYTD < 0 ? 'var(--danger)' : 'var(--success)' }}>{formatRupiah(dynLabaBersihYTD)}</td><td className="text-right mono" style={{ color: dynLabaBersihYTD < 0 ? 'var(--danger)' : 'var(--success)' }}>{formatRupiah(dynLabaBersihYTD)}</td></tr>
                                    <tr><td style={{ paddingLeft: 24 }}>Dividen</td><td className="text-right mono">-</td><td className="text-right mono">-</td><td className="text-right mono">-</td></tr>
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: 'var(--border-light)' }}><td>Saldo Akhir Periode</td><td className="text-right mono">{formatRupiah(saldoAkhirMdl)}</td><td className="text-right mono" style={{ color: (dynLabaDitahan + dynLabaBersihYTD) < 0 ? 'var(--danger)' : 'var(--success)' }}>{formatRupiah(dynLabaDitahan + dynLabaBersihYTD)}</td><td className="text-right mono" style={{ color: saldoAkhirTotal < 0 ? 'var(--danger)' : 'var(--primary)' }}>{formatRupiah(saldoAkhirTotal)}</td></tr>
                                </tbody></table>
                        </div>
                    </div>
                )
            })()}

            {/* ===== CALK TAB (Catatan Atas Laporan Keuangan) ===== */}
            {activeTab === 'calk' && (
                <div className="report-doc">
                    <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div className="company">PERUMDA PASAR BAIMAN</div><h2>CATATAN ATAS LAPORAN KEUANGAN (CALK)</h2><div className="period">Untuk Periode {getPeriodLabel(selectedPeriod)} 2026 — Sesuai SAK EP</div></div><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('CALK')}><Printer size={14} /> Cetak Laporan</button><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => {
                        const rows = [
                            ['1. GAMBARAN UMUM PERUSAHAAN', ''],
                            ['Nama', 'Perumda Pasar Baiman'],
                            ['Alamat', 'Jl. Pasar Baiman No. 1, Banjarmasin'],
                            ['Bidang Usaha', 'Pengelolaan Pasar'],
                            ['', ''],
                            ['2. KEBIJAKAN AKUNTANSI', ''],
                            ['Dasar Penyusunan', 'SAK EP (Standar Akuntansi Keuangan Entitas Privat)'],
                            ['Metode Penyusutan', 'Garis Lurus (Straight Line)'],
                            ['Pengakuan Pendapatan', 'Accrual Basis'],
                            ['', ''],
                            ['3. ASET TETAP', ''],
                            ...state.assets.map(a => [`  ${a.nama} (${a.kategori})`, `Perolehan: ${a.nilaiPerolehan}, Penyusutan: ${a.nilaiPenyusutan}, Buku: ${a.nilaiBuku}`]),
                        ]
                        exportCSV('CALK', ['Catatan', 'Keterangan'], rows.map(r => [r[0] || '', r[1] || '']))
                    }}><Download size={14} /> Unduh Excel (.xlsx)</button></div></div>
                    <div className="report-doc-body" style={{ fontSize: 14 }}>
                        <div style={{ marginBottom: 28 }}>
                            <h3 style={{ color: 'var(--primary)', marginBottom: 12, fontSize: 16, borderBottom: '2px solid var(--primary)', paddingBottom: 8 }}>1. GAMBARAN UMUM PERUSAHAAN</h3>
                            <table>
                                <tbody>
                                    <tr><td style={{ fontWeight: 600, width: 220 }}>Nama Perusahaan</td><td>{state.pengaturan?.namaPerusahaan || 'Perumda Pasar Baiman'}</td></tr>
                                    <tr><td style={{ fontWeight: 600 }}>NPWP</td><td>{state.pengaturan?.npwp || '01.234.567.8-901.000'}</td></tr>
                                    <tr><td style={{ fontWeight: 600 }}>Alamat</td><td>{state.pengaturan?.alamat || 'Jl. Pasar Baiman No. 1, Banjarmasin'}</td></tr>
                                    <tr><td style={{ fontWeight: 600 }}>Bidang Usaha</td><td>Pengelolaan dan Pengembangan Pasar Tradisional</td></tr>
                                    <tr><td style={{ fontWeight: 600 }}>Kota</td><td>{state.pengaturan?.kota || 'Banjarmasin'}</td></tr>
                                    <tr><td style={{ fontWeight: 600 }}>Tahun Buku</td><td>1 Januari — 31 Desember 2026</td></tr>
                                </tbody>
                            </table>
                        </div>

                        <div style={{ marginBottom: 28 }}>
                            <h3 style={{ color: 'var(--primary)', marginBottom: 12, fontSize: 16, borderBottom: '2px solid var(--primary)', paddingBottom: 8 }}>2. KEBIJAKAN AKUNTANSI SIGNIFIKAN</h3>
                            <div style={{ marginBottom: 16 }}>
                                <h4 style={{ fontSize: 14, marginBottom: 6 }}>a. Dasar Penyusunan Laporan Keuangan</h4>
                                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>Laporan keuangan disusun berdasarkan <strong>Standar Akuntansi Keuangan Entitas Privat (SAK EP)</strong> yang berlaku di Indonesia. Laporan disusun dengan dasar akrual (accrual basis) kecuali laporan arus kas.</p>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <h4 style={{ fontSize: 14, marginBottom: 6 }}>b. Pengakuan Pendapatan</h4>
                                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>Pendapatan sewa kios, retribusi, dan parkir diakui pada saat jasa telah diberikan dan manfaat ekonomi dapat diukur secara andal. Pendapatan diukur pada nilai wajar imbalan yang diterima atau dapat diterima.</p>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <h4 style={{ fontSize: 14, marginBottom: 6 }}>c. Aset Tetap dan Penyusutan</h4>
                                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>Aset tetap dicatat sebesar harga perolehan dikurangi akumulasi penyusutan. Penyusutan dihitung menggunakan <strong>metode garis lurus (straight-line)</strong> berdasarkan estimasi umur manfaat aset:</p>
                                <table style={{ marginTop: 8 }}>
                                    <thead><tr><th>Kategori</th><th>Umur Manfaat</th><th>Tarif/Tahun</th></tr></thead>
                                    <tbody>
                                        <tr><td>Bangunan / Gedung</td><td>20 tahun</td><td>5%</td></tr>
                                        <tr><td>Kendaraan</td><td>8 tahun</td><td>12.5%</td></tr>
                                        <tr><td>Peralatan</td><td>4 — 8 tahun</td><td>12.5% — 25%</td></tr>
                                        <tr><td>Tanah</td><td>Tidak disusutkan</td><td>-</td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <h4 style={{ fontSize: 14, marginBottom: 6 }}>d. Pajak Pertambahan Nilai (PPN)</h4>
                                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>Tarif PPN yang berlaku adalah <strong>{state.pengaturan?.ppnStandard || 11}%</strong> sesuai ketentuan perpajakan yang berlaku. Materai dikenakan untuk transaksi di atas {formatRupiah(state.pengaturan?.materaiMulai || 5000000)}.</p>
                            </div>
                        </div>

                        <div style={{ marginBottom: 28 }}>
                            <h3 style={{ color: 'var(--primary)', marginBottom: 12, fontSize: 16, borderBottom: '2px solid var(--primary)', paddingBottom: 8 }}>3. RINCIAN ASET TETAP</h3>
                            <table>
                                <thead><tr><th>Kode</th><th>Nama Aset</th><th>Kategori</th><th className="text-right">Nilai Perolehan</th><th className="text-right">Akum. Penyusutan</th><th className="text-right">Nilai Buku</th></tr></thead>
                                <tbody>
                                    {state.assets.map(a => (
                                        <tr key={a.kode}>
                                            <td className="mono">{a.kode}</td>
                                            <td>{a.nama}</td>
                                            <td><span className="badge blue">{a.kategori}</span></td>
                                            <td className="text-right mono">{formatRupiah(a.nilaiPerolehan)}</td>
                                            <td className="text-right mono" style={{ color: 'var(--danger)' }}>{formatRupiah(a.nilaiPenyusutan)}</td>
                                            <td className="text-right mono" style={{ fontWeight: 600 }}>{formatRupiah(a.nilaiBuku)}</td>
                                        </tr>
                                    ))}
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                                        <td colSpan={3}>TOTAL</td>
                                        <td className="text-right mono">{formatRupiah(state.assets.reduce((s, a) => s + a.nilaiPerolehan, 0))}</td>
                                        <td className="text-right mono" style={{ color: 'var(--danger)' }}>{formatRupiah(state.assets.reduce((s, a) => s + a.nilaiPenyusutan, 0))}</td>
                                        <td className="text-right mono" style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatRupiah(state.assets.reduce((s, a) => s + a.nilaiBuku, 0))}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div style={{ marginBottom: 28 }}>
                            <h3 style={{ color: 'var(--primary)', marginBottom: 12, fontSize: 16, borderBottom: '2px solid var(--primary)', paddingBottom: 8 }}>4. PIUTANG USAHA</h3>
                            <table>
                                <thead><tr><th>No. Faktur</th><th>Pelanggan</th><th className="text-right">Jumlah</th><th className="text-right">Terbayar</th><th className="text-right">Sisa</th><th>Status</th></tr></thead>
                                <tbody>
                                    {(state.piutang || []).map(p => (
                                        <tr key={p.id}>
                                            <td className="mono">{p.noFaktur}</td>
                                            <td>{p.pelanggan}</td>
                                            <td className="text-right mono">{formatRupiah(p.jumlah)}</td>
                                            <td className="text-right mono">{formatRupiah(p.terbayar)}</td>
                                            <td className="text-right mono" style={{ color: p.sisa > 0 ? 'var(--danger)' : 'var(--success)' }}>{formatRupiah(p.sisa)}</td>
                                            <td><span className={`badge ${p.status === 'lunas' ? 'green' : p.status === 'sebagian' ? 'orange' : 'red'}`}>{p.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ marginBottom: 28 }}>
                            <h3 style={{ color: 'var(--primary)', marginBottom: 12, fontSize: 16, borderBottom: '2px solid var(--primary)', paddingBottom: 8 }}>5. HUTANG USAHA</h3>
                            <table>
                                <thead><tr><th>No. Faktur</th><th>Supplier</th><th className="text-right">Jumlah</th><th className="text-right">Dibayar</th><th className="text-right">Sisa</th><th>Status</th></tr></thead>
                                <tbody>
                                    {(state.hutang || []).map(h => (
                                        <tr key={h.id}>
                                            <td className="mono">{h.noFaktur}</td>
                                            <td>{h.supplier}</td>
                                            <td className="text-right mono">{formatRupiah(h.jumlah)}</td>
                                            <td className="text-right mono">{formatRupiah(h.terbayar)}</td>
                                            <td className="text-right mono" style={{ color: h.sisa > 0 ? 'var(--danger)' : 'var(--success)' }}>{formatRupiah(h.sisa)}</td>
                                            <td><span className={`badge ${h.status === 'lunas' ? 'green' : h.status === 'sebagian' ? 'orange' : 'red'}`}>{h.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ background: 'var(--primary-light)', padding: '16px 20px', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--primary)' }}>
                            <strong>Catatan:</strong> Laporan keuangan ini disusun sesuai dengan Standar Akuntansi Keuangan Entitas Privat (SAK EP) dan telah menyajikan secara wajar posisi keuangan, kinerja keuangan, dan arus kas entitas.
                        </div>
                    </div>
                </div>
            )}

            {/* ===== ANALISIS TAB ===== */}
            {activeTab === 'analisis' && (() => {
                const totalPendapatan = 135375000, totalBeban = 270976817, labaBersih = -135601817, totalAset = 9043267236, totalKewajiban = 156000000, totalEkuitas = 8887267236, kasBank = 5846500000
                const ratios = [
                    { name: 'Current Ratio', value: ((5846500000 + 285000000 + 40800000) / totalKewajiban).toFixed(2), unit: 'x', color: 39.59 > 1 ? 'var(--success)' : 'var(--danger)', desc: 'Aset Lancar / Kewajiban Lancar' },
                    { name: 'Debt to Equity', value: (totalKewajiban / totalEkuitas * 100).toFixed(2), unit: '%', color: 'var(--primary)', desc: 'Total Kewajiban / Total Ekuitas' },
                    { name: 'Net Profit Margin', value: (labaBersih / totalPendapatan * 100).toFixed(1), unit: '%', color: 'var(--danger)', desc: 'Laba Bersih / Total Pendapatan' },
                    { name: 'ROA', value: (labaBersih / totalAset * 100).toFixed(2), unit: '%', color: 'var(--danger)', desc: 'Laba Bersih / Total Aset' },
                    { name: 'ROE', value: (labaBersih / totalEkuitas * 100).toFixed(2), unit: '%', color: 'var(--danger)', desc: 'Laba Bersih / Total Ekuitas' },
                    { name: 'Cash Ratio', value: (kasBank / totalKewajiban).toFixed(2), unit: 'x', color: 'var(--success)', desc: 'Kas & Bank / Kewajiban Lancar' },
                ]
                const barData = { labels: ratios.map(r => r.name), datasets: [{ label: 'Nilai', data: ratios.map(r => parseFloat(r.value)), backgroundColor: ratios.map(r => r.color), borderRadius: 6 }] }
                return (
                    <>
                        <div className="report-doc" style={{ marginBottom: 24 }}>
                            <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div className="company">PERUMDA PASAR BAIMAN</div><h2>ANALISIS RASIO KEUANGAN</h2><div className="period">Periode Januari 2026</div></div><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('Analisis Rasio')}><Printer size={14} /> Cetak Laporan</button><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={exportAnalisis}><Download size={14} /> Unduh Excel (.xlsx)</button></div></div>
                            <div className="report-doc-body">
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
                                    {ratios.map((r, i) => (
                                        <div key={i} className="kpi-card" style={{ textAlign: 'center' }}>
                                            <div className="kpi-label" style={{ justifyContent: 'center' }}>{r.name}</div>
                                            <div className="kpi-value" style={{ color: r.color }}>{r.value}{r.unit}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{r.desc}</div>
                                        </div>
                                    ))}
                                </div>
                                <table><thead><tr><th>Rasio</th><th>Formula</th><th className="text-right">Nilai</th><th className="text-center">Interpretasi</th></tr></thead>
                                    <tbody>
                                        <tr><td style={{ fontWeight: 500 }}>Current Ratio</td><td style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aset Lancar ÷ Kewajiban Lancar</td><td className="text-right mono" style={{ fontWeight: 600 }}>39.59x</td><td className="text-center"><span className="badge green">Sangat Baik</span></td></tr>
                                        <tr><td style={{ fontWeight: 500 }}>Debt to Equity</td><td style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Utang ÷ Total Ekuitas</td><td className="text-right mono" style={{ fontWeight: 600 }}>1.76%</td><td className="text-center"><span className="badge green">Rendah</span></td></tr>
                                        <tr><td style={{ fontWeight: 500 }}>Net Profit Margin</td><td style={{ fontSize: 12, color: 'var(--text-muted)' }}>Laba Bersih ÷ Pendapatan</td><td className="text-right mono" style={{ fontWeight: 600, color: 'var(--danger)' }}>-100.2%</td><td className="text-center"><span className="badge red">Rugi</span></td></tr>
                                        <tr><td style={{ fontWeight: 500 }}>Return on Assets</td><td style={{ fontSize: 12, color: 'var(--text-muted)' }}>Laba Bersih ÷ Total Aset</td><td className="text-right mono" style={{ fontWeight: 600, color: 'var(--danger)' }}>-1.50%</td><td className="text-center"><span className="badge orange">Negatif</span></td></tr>
                                        <tr><td style={{ fontWeight: 500 }}>Return on Equity</td><td style={{ fontSize: 12, color: 'var(--text-muted)' }}>Laba Bersih ÷ Total Ekuitas</td><td className="text-right mono" style={{ fontWeight: 600, color: 'var(--danger)' }}>-1.53%</td><td className="text-center"><span className="badge orange">Negatif</span></td></tr>
                                        <tr><td style={{ fontWeight: 500 }}>Cash Ratio</td><td style={{ fontSize: 12, color: 'var(--text-muted)' }}>Kas & Bank ÷ Kewajiban Lancar</td><td className="text-right mono" style={{ fontWeight: 600 }}>37.48x</td><td className="text-center"><span className="badge green">Sangat Baik</span></td></tr>
                                    </tbody></table>
                            </div>
                        </div>
                        <div className="chart-grid">
                            <div className="chart-card">
                                <div className="card-header"><div><div className="card-title">Rasio Keuangan</div><div className="card-subtitle">Perbandingan Visual</div></div></div>
                                <div style={{ height: 280 }}><Bar data={barData} options={{ ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, ticks: { ...chartOpts.scales.y.ticks, callback: v => v } } }, plugins: { ...chartOpts.plugins, legend: { display: false } } }} /></div>
                            </div>
                            <div className="chart-card">
                                <div className="card-header"><div><div className="card-title">Komposisi Aset vs Kewajiban</div><div className="card-subtitle">Struktur Keuangan</div></div></div>
                                <div style={{ height: 280 }}><Doughnut data={{ labels: ['Ekuitas', 'Kewajiban'], datasets: [{ data: [totalEkuitas, totalKewajiban], backgroundColor: ['#10B981', '#E54D42'], borderWidth: 0, cutout: '60%' }] }} options={doughnutOpts} /></div>
                                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-around' }}>
                                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ekuitas</div><div style={{ fontWeight: 700, color: 'var(--success)' }}>98.3%</div></div>
                                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Kewajiban</div><div style={{ fontWeight: 700, color: 'var(--danger)' }}>1.7%</div></div>
                                </div>
                            </div>
                        </div>
                    </>
                )
            })()}
            {/* ===== NEW REPORT TABS ===== */}
            {activeTab === 'neraca-saldo-tanggal' && <NeracaSaldoTanggal state={state} journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} formatRupiah={formatRupiah} />}
            {activeTab === 'neraca-saldo-type' && <NeracaSaldoType state={state} journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} formatRupiah={formatRupiah} />}
            {activeTab === 'neraca-mtd-ytd' && <NeracaMTDYTD state={state} journalsMTD={postedForLabaRugi} journalsYTD={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} formatRupiah={formatRupiah} />}
            {activeTab === 'neraca-detail' && <NeracaDetail state={state} journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} formatRupiah={formatRupiah} />}
            {activeTab === 'neraca-triwulan' && <NeracaTriwulan state={state} journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} formatRupiah={formatRupiah} />}
            {activeTab === 'lr-mtd-ytd' && <LabaRugiMTDYTD state={state} journalsMTD={postedForLabaRugi} journalsYTD={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} />}
            {activeTab === 'lr-detail' && <LabaRugiDetail state={state} journals={postedForLabaRugi} periodLabel={getPeriodLabel(selectedPeriod)} />}
            {activeTab === 'lr-triwulan' && <LabaRugiTriwulan state={state} journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} selectedPeriod={selectedPeriod} />}
            {activeTab === 'lr-semester' && <LabaRugiSemester state={state} journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} selectedPeriod={selectedPeriod} />}
            {activeTab === 'lr-2bulan' && <LabaRugi2Bulan state={state} journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} selectedPeriod={selectedPeriod} />}
            {activeTab === 'lr-budget' && <LabaRugiBudget state={state} journals={postedForLabaRugi} periodLabel={getPeriodLabel(selectedPeriod)} />}
            {activeTab === 'lr-project' && <LabaRugiProject state={state} journals={postedForLabaRugi} periodLabel={getPeriodLabel(selectedPeriod)} />}
            {activeTab === 'hpp' && <HPP />}
            {activeTab === 'hpp-detail' && <HPPDetail />}
            {activeTab === 'hpp-triwulan' && <HPPTriwulan />}
            {activeTab === 'hpp-2bulan' && <HPP2Bulan />}
            {activeTab === 'hpp-budget' && <HPPBudget />}
            {activeTab === 'lacak-kilat' && <LacakKilat state={state} formatRupiah={formatRupiah} />}
            {activeTab === 'laporan-sortir' && <LaporanSortir state={state} formatRupiah={formatRupiah} />}
        </div>
    )
}
