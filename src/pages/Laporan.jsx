import { useState, useMemo, useEffect } from 'react'
import { Doughnut, Line, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { TrendingDown, TrendingUp, Printer, Download, BarChart3, FileText, PieChart, Activity, Wallet, BookOpen, StickyNote, Zap, SortAsc, Calendar } from 'lucide-react'
import { useApp, computeCashFlow } from '../context/AppContext.jsx'
import { expandJournals } from '../utils/journalExpand.js'
import { isDeltaJournal, deltaByPrefix, deltaCash, deltaByName, fmtSigned, buildLabaRugiRows, buildNeracaRows, buildArusKasRows, buildArusKasIndirectRows, codeOf, normLabel } from '../utils/reportDelta.js'
import { formatRupiah } from '../data/sampleData.js'
import reconcileAlias from '../utils/reconcileAlias.json'
import lrAlias from '../utils/lrAlias.json'
import { apiGetRefNeraca, apiGetRefArusKas, apiGetRefLabaRugi, apiGetAuditedPeriods } from '../services/api.js'
import { hasReportValues } from '../utils/reportSnapshot.js'
import { MONTHS, PERIOD_PRESETS, periodValueToYearMonth, periodValueToLabel, periodValueToMonths, filterJournalsByMonth, filterJournalsByPeriod, filterJournalsYTD } from '../utils/journalFilters.js'
import { printReport, exportCSV, exportLabaRugi, exportNeraca, exportNeracaSaldo, exportPerubahanEkuitas, exportArusKas, exportAnalisis } from '../utils/exportUtils.js'
import { exportFullReport } from '../utils/exportFullReport.js'
import { NeracaSaldoTanggal, NeracaSaldoType, NeracaMTDYTD, NeracaDetail, NeracaTriwulan } from './reports/NeracaReports.jsx'
import { LabaRugiMTDYTD, LabaRugiDetail, LabaRugiTriwulan, LabaRugiSemester, LabaRugi2Bulan, LabaRugiBudget, LabaRugiProject } from './reports/LabaRugiReports.jsx'
import { HPP, HPPDetail, HPPTriwulan, HPP2Bulan, HPPBudget, LacakKilat, LaporanSortir } from './reports/HPPAndSpecialReports.jsx'
import { Penerimaan, RekapPenerimaan } from './reports/PenerimaanReports.jsx'
import { BebanUmum, RekapBebanUmum, BebanOperasional, RekapBebanOperasional, BebanInvestasi, RekapBebanInvestasi } from './reports/BebanDetailReports.jsx'

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 12 }, padding: 16, usePointStyle: true } }, tooltip: { backgroundColor: '#1E293B', cornerRadius: 8, padding: 12 } },
    scales: { x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94A3B8' } }, y: { grid: { color: '#F1F5F9' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94A3B8', callback: v => (v / 1000000).toFixed(0) + 'jt' } } }
}
const doughnutOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }

// Per-month data-source chips shown on every report: the reader must always be
// able to SEE whether a month renders the frozen audited snapshot or is
// computed live from journals (kendala 07-07-2026 took a 12-minute video to
// diagnose precisely because this state was invisible).
const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const EMPTY_PERIOD_MODES = {}
function SourceBadgeRow({ items }) {
    if (!items || !items.length) return null
    return (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 12px' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Sumber data per bulan:</span>
            {items.map(it => (
                <span key={it.label} title={it.audited ? 'Angka beku dari lampiran laporan resmi (audited); jurnal baru ditambahkan sebagai delta' : 'Dihitung langsung dari jurnal yang sudah di-approve (Buku Besar)'}
                    style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10,
                        background: it.audited ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)',
                        color: it.audited ? 'var(--success, #059669)' : 'var(--primary, #4f46e5)' }}>
                    {it.label}: {it.audited ? 'snapshot audited' : 'dari jurnal'}
                </span>
            ))}
        </div>
    )
}

// Aggregate monthly snapshot rows into a single period view. Laba Rugi and Arus
// Kas are additive flows, so values are summed across the months in range (keyed
// by label, which is stable across the monthly templates). `firstLabel`/`lastLabel`
// let balance lines opt out of summation — e.g. the cash "opening" balance takes
// the first month's value and the cash "closing" balance the last month's.
function aggregateFlowRows(monthRows, { firstLabel, lastLabel } = {}) {
  const nonEmpty = (monthRows || []).filter(rows => Array.isArray(rows) && rows.length)
  if (!nonEmpty.length) return []
  const template = nonEmpty[nonEmpty.length - 1] // latest month = most complete structure
  const first = nonEmpty[0]
  const sumByLabel = {}, seen = {}
  nonEmpty.forEach(rows => rows.forEach(r => {
    if (typeof r.value === 'number') { const k = String(r.label); sumByLabel[k] = (sumByLabel[k] || 0) + r.value; seen[k] = true }
  }))
  const pick = (arr, label) => { const f = (arr || []).find(x => String(x.label) === String(label)); return f && typeof f.value === 'number' ? f.value : null }
  return template.map(r => {
    const label = String(r.label || '')
    if (firstLabel && firstLabel.test(label)) return { ...r, value: pick(first, label) }
    if (lastLabel && lastLabel.test(label)) return { ...r, value: pick(template, label) }
    return { ...r, value: seen[label] ? sumByLabel[label] : r.value }
  })
}

const tabs = [
    // Group: Neraca Saldo (hidden — group removed from tabGroups below)
    { id: 'neraca-saldo', label: 'Neraca Saldo', icon: Wallet, group: 'Neraca Saldo', hidden: true },
    { id: 'neraca-saldo-tanggal', label: 'NS per Tanggal', icon: Wallet, group: 'Neraca Saldo', hidden: true },
    { id: 'neraca-saldo-type', label: 'NS per Tipe', icon: Wallet, group: 'Neraca Saldo', hidden: true },
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
    // Group: Anggaran (Budget vs Realization)
    { id: 'penerimaan', label: 'Penerimaan', icon: TrendingUp, group: 'Anggaran' },
    { id: 'rekap-penerimaan', label: 'Rekap Penerimaan', icon: TrendingUp, group: 'Anggaran' },
    { id: 'beban-umum', label: 'Beban Umum', icon: BarChart3, group: 'Anggaran' },
    { id: 'rekap-beban-umum', label: 'Rekap Beban Umum', icon: BarChart3, group: 'Anggaran' },
    { id: 'beban-operasional', label: 'Beban Operasional', icon: BarChart3, group: 'Anggaran' },
    { id: 'rekap-beban-ops', label: 'Rekap Beban Ops', icon: BarChart3, group: 'Anggaran' },
    { id: 'beban-investasi', label: 'Beban Investasi', icon: BarChart3, group: 'Anggaran' },
    { id: 'rekap-beban-inv', label: 'Rekap Beban Inv', icon: BarChart3, group: 'Anggaran' },
    // Group: Lainnya
    { id: 'perubahan-ekuitas', label: 'Perubahan Ekuitas', icon: PieChart, group: 'Lainnya' },
    { id: 'arus-kas', label: 'Arus Kas', icon: TrendingUp, group: 'Lainnya' },
    { id: 'calk', label: 'CALK', icon: StickyNote, group: 'Lainnya' },
    { id: 'rasio', label: 'Analisis Rasio', icon: Zap, group: 'Lainnya' }
]

// 'Neraca Saldo' group hidden from UI (code kept intact). Remove from this array to restore.
const tabGroups = ['Neraca', 'Laba Rugi', 'HPP', 'Khusus', 'Anggaran', 'Lainnya']

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
    const [refNeracaData, setRefNeracaData] = useState([])
    const [refNeracaPrevData, setRefNeracaPrevData] = useState([])
    const [refArusKasData, setRefArusKasData] = useState([])
    const [refLabaRugiData, setRefLabaRugiData] = useState([])
    const [auditedPeriods, setAuditedPeriods] = useState([])
    // Which months in range actually carry a real Laba Rugi snapshot (nonzero
    // values), and which month the rendered Neraca baseline comes from. Months
    // WITHOUT a snapshot contribute ALL their posted journals to the overlay —
    // not just JV-/JRN- — so template-imported months stay visible in
    // triwulan/semester views (kendala 07-07-2026).
    const [flowSnapYMs, setFlowSnapYMs] = useState(() => new Set())
    const [neracaBaseYM, setNeracaBaseYM] = useState(null)

    function getPeriodLabel(val) {
        return periodValueToLabel(val)
    }

    const { coaFlat, coaTree } = state
    // Explicit per-month report mode from the server (period_status table).
    // 'jurnal' overrides any leftover snapshot rows; missing month = decide by
    // (value-guarded) snapshot presence for backward compatibility.
    // (Module-level EMPTY keeps the reference stable for effect deps.)
    const periodModes = state.periodModes || EMPTY_PERIOD_MODES
    // Expand multi-line (form `lines`) journals so dynamic Neraca/Laba Rugi/Arus Kas
    // reflect every posting line. No-op for legacy/imported journals.
    const journals = useMemo(() => expandJournals(state.journals), [state.journals])

    // --- DYNAMIC CALCULATION ENGINE ---
    const yearMonth = periodValueToYearMonth(selectedPeriod)

    // Fetch reference report data from Excel-imported database when period changes.
    // For multi-month presets (TW/Semester/Tahunan) we fetch EVERY month in range
    // and aggregate: Laba Rugi & Arus Kas are summed across months (flow statements),
    // while Neraca takes the last month that has a snapshot (point-in-time balance).
    const rangeYearMonths = useMemo(
        () => periodValueToMonths(selectedPeriod).map(m => `2026-${String(m).padStart(2, '0')}`),
        [selectedPeriod]
    )
    useEffect(() => {
        if (!rangeYearMonths.length) return
        let cancelled = false
        // Snapshot rows count only when they carry real numbers: a bad upload can
        // leave label-only rows (all null/0, or a couple of stray numerics) which
        // must not freeze the report. Same ≥5-nonzero rule as the import path.
        // The explicit period mode wins over data presence: a month set to
        // 'jurnal' ignores any leftover frozen rows entirely.
        const isJurnalMonth = (ym) => periodModes[ym] === 'jurnal'
        const hasVals = (rows, ym) => !isJurnalMonth(ym) && hasReportValues(rows)
        ;(async () => {
            try {
                const results = await Promise.all(rangeYearMonths.map(ym => Promise.all([
                    apiGetRefNeraca(ym).catch(() => []),
                    apiGetRefArusKas(ym).catch(() => []),
                    apiGetRefLabaRugi(ym).catch(() => []),
                ]).then(([n, a, l]) => ({
                    ym,
                    n: hasVals(n, ym) ? n : [],
                    a: hasVals(a, ym) ? a : [],
                    l: hasVals(l, ym) ? l : [],
                }))))
                if (cancelled) return
                // Neraca: latest month in range that actually has a snapshot. When
                // NO month in range has one (journal-driven month like Juni-2026
                // template import), fall back to the latest EARLIER snapshot as the
                // baseline — its balance plus the later months' journal deltas IS
                // the point-in-time Neraca.
                const withN = results.filter(r => r.n.length)
                let baseN = withN.length ? withN[withN.length - 1] : null
                if (!baseN) {
                    const firstM = periodValueToMonths(selectedPeriod)[0]
                    for (let m = firstM - 1; m >= 1 && !baseN; m--) {
                        const ym = `2026-${String(m).padStart(2, '0')}`
                        const rows = await apiGetRefNeraca(ym).catch(() => [])
                        if (hasVals(rows, ym)) baseN = { ym, n: rows }
                    }
                    if (cancelled) return
                }
                setRefNeracaData(baseN ? baseN.n : [])
                setNeracaBaseYM(baseN ? baseN.ym : null)
                // Laba Rugi: sum monthly snapshots across the range; remember which
                // months are snapshot-backed (others overlay ALL posted journals).
                setFlowSnapYMs(new Set(results.filter(r => r.l.length).map(r => r.ym)))
                setRefLabaRugiData(aggregateFlowRows(results.map(r => r.l)))
                // Arus Kas: sum flows; opening = first month, closing = last month.
                setRefArusKasData(aggregateFlowRows(results.map(r => r.a), {
                    firstLabel: /periode sebelumnya|kas awal|saldo.*awal/i,
                    lastLabel: /akhir periode/i,
                }))
            } catch {
                if (!cancelled) { setRefNeracaData([]); setNeracaBaseYM(null); setRefArusKasData([]); setRefLabaRugiData([]); setFlowSnapYMs(new Set()) }
            }
        })()

        // Comparative Neraca = month immediately before the range start (prior period).
        const firstMonth = periodValueToMonths(selectedPeriod)[0]
        const prevYM = firstMonth > 1 ? `2026-${String(firstMonth - 1).padStart(2, '0')}` : '2025-12'
        apiGetRefNeraca(prevYM).then(r => { if (!cancelled) setRefNeracaPrevData(Array.isArray(r) ? r : []) }).catch(() => { if (!cancelled) setRefNeracaPrevData([]) })
        return () => { cancelled = true }
    }, [rangeYearMonths, selectedPeriod, periodModes])

    // Which months have an audited snapshot loaded (driven by report_neraca presence
    // on the server). Refreshed once; lets newly-loaded months render as audited.
    useEffect(() => {
        apiGetAuditedPeriods().then(p => setAuditedPeriods(Array.isArray(p) ? p : [])).catch(() => setAuditedPeriods([]))
    }, [])

    // Snapshot render path is used when the (value-guarded) reference rows for
    // the report actually loaded — a month whose snapshot rows are absent or
    // carry no real values renders dynamically from journals instead. The old
    // gate hardcoded Mei/Juni as "audited", freezing journal-driven months at
    // stale figures (kendala 07-07-2026). `auditedPeriods` is kept as a hint of
    // what the server has loaded (helps future diagnostics/devtools).
    const hasRealExcelData = rangeYearMonths.some(ym => auditedPeriods.includes(ym)) ||
        refLabaRugiData.length > 0 || refNeracaData.length > 0 || refArusKasData.length > 0

    // For Laba Rugi (Income Statement): the selected period (single or multi-month)
    const postedForLabaRugi = useMemo(() =>
        filterJournalsByPeriod(journals.filter(j => j.status === 'posted'), selectedPeriod)
    , [journals, selectedPeriod])

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

    // Direct journal sum by prefix — more robust, works for all imported account codes.
    // Uses codeOf() (effective code) so header-coded postings classify like the
    // official Excel: "80000 … > Pajak Penghasilan" counts as 99999, "70000 … >
    // Pendapatan Bunga" as 70001, etc. (spec §3.3).
    const sumJByPrefix = (prefix, isDebit, journalSet) =>
        journalSet.reduce((sum, j) => {
            // Primary side: the account we're summing (debit-side for expenses, credit-side for income)
            const primaryCode = codeOf(isDebit ? j.akun_debit : j.akun_kredit)
            const primaryAmt  = isDebit ? j.debit : j.kredit
            // Offset side: if a REVERSAL credits back into the same prefix, subtract it
            const offsetCode  = codeOf(isDebit ? j.akun_kredit : j.akun_debit)
            const offsetAmt   = isDebit ? j.kredit : j.debit
            let s = sum
            if (primaryCode?.startsWith(prefix)) s += (primaryAmt || 0)
            if (offsetCode?.startsWith(prefix))  s -= (offsetAmt  || 0)
            return s
        }, 0)

    // Extract individual line items from journals by prefix (effective code)
    const getJLineItems = (prefix, isDebit, journalSet) => {
        const map = {}
        journalSet.forEach(j => {
            const akunStr = isDebit ? j.akun_debit : j.akun_kredit
            const code = codeOf(akunStr)
            if (code?.startsWith(prefix)) {
                // Prefer the official lampiran line label for rerouted/known codes;
                // fall back to the account name from akunStr (ignoring keterangan,
                // which might just say "Import Feb 2026").
                let name = lrAlias[code] || akunStr?.replace(/^\S+\s*-\s*/, '') || code
                const amt = isDebit ? j.debit : j.kredit
                map[code] = { name, amount: (map[code]?.amount || 0) + (amt || 0) }
            }
        })
        return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([code, {name, amount}]) => ({ code, name, amount }))
    }

    // Dynamic Laba Rugi Variables (Period specific, strictly journals only)
    const dynPendapatanUtama = sumJByPrefix('41', false, postedForLabaRugi)
    const dynPendapatanLainnya = sumJByPrefix('42', false, postedForLabaRugi)
    const dynBPP = sumJByPrefix('51', true, postedForLabaRugi)
    const dynPendapatanNonOps = sumJByPrefix('7', false, postedForLabaRugi)
    const dynBebanAdmin = sumJByPrefix('61', true, postedForLabaRugi)
    const dynBebanOps = sumJByPrefix('62', true, postedForLabaRugi)
    const dynBebanNonOps = sumJByPrefix('8', true, postedForLabaRugi)

    const dynPendapatanUsaha = dynPendapatanUtama + dynPendapatanLainnya
    const dynLabaBruto = dynPendapatanUsaha - dynBPP
    // Beban Pajak Penghasilan (PPh badan) — account 99999. The division journals
    // it under 80000 with Sub Akun "Pajak Penghasilan"; codeOf reroutes it to 99,
    // and the official June lampiran presents it INSIDE Beban Operasional as the
    // row "Beban PPN dan PPH" (J53) with the tax row below laba-sebelum-pajak = 0.
    const dynPajakPenghasilan = sumJByPrefix('99', true, postedForLabaRugi)
    // JUMLAH BEBAN USAHA = BebanAdmin + BebanOps + PPh line (June lampiran layout;
    // does NOT include BPP per Excel format)
    const dynJumlahBebanUsaha = dynBebanAdmin + dynBebanOps + dynPajakPenghasilan
    // LABA USAHA = LABA BRUTO - JUMLAH BEBAN USAHA
    const dynLabaUsaha = dynLabaBruto - dynJumlahBebanUsaha
    const dynNetNonOp = dynPendapatanNonOps - dynBebanNonOps
    // Already net of the PPh (it sits inside beban usaha) — matches lampiran J77.
    const dynLabaBersihSebelumPajak = dynLabaUsaha + dynNetNonOp
    const dynTotalPendapatan = dynPendapatanUsaha + dynPendapatanNonOps
    // Total beban for reference (includes BPP + income tax)
    const dynTotalBeban = dynBPP + dynJumlahBebanUsaha + dynBebanNonOps
    // Tax row shows 0 in the June layout, so setelah pajak == sebelum pajak.
    const dynLabaBersih = dynLabaBersihSebelumPajak
    const dynPenyusutan = sumJByPrefix('6113', true, postedForLabaRugi)
    // Effective codes (codeOf) already fold "70000 > Pendapatan Bunga" into 70001
    // and "80000 > Beban Pajak Bank" into 80001 — no name heuristics needed.
    const dynPendapatanBungaBank = sumJByPrefix('70001', false, postedForLabaRugi)
    const dynBebanPajakBank = sumJByPrefix('80001', true, postedForLabaRugi)
    // EBITDA per lampiran J81 = setelahPajak − bunga + pajakBank + penyusutan + PPh line.
    const dynEBITDA = dynLabaBersih - dynPendapatanBungaBank + dynBebanPajakBank + dynPenyusutan + dynPajakPenghasilan

    // Line items for detailed LR display
    const dynBPPItems = getJLineItems('51', true, postedForLabaRugi)
    const dynBebanUItems = getJLineItems('61', true, postedForLabaRugi)
    const dynBebanOpsItemsList = getJLineItems('62', true, postedForLabaRugi)
    const dynPendLainItems = getJLineItems('7', false, postedForLabaRugi)
    const dynBebanLainItems = getJLineItems('8', true, postedForLabaRugi)

    // YTD Laba Rugi for Neraca & Ekuitas (Strictly journals up to current month)
    const dynPendapatanUtamaYTD = sumJByPrefix('41', false, postedForNeraca)
    const dynPendapatanLainnyaYTD = sumJByPrefix('42', false, postedForNeraca)
    const dynPendapatanNonOpsYTD = sumJByPrefix('7', false, postedForNeraca)
    const dynBebanAdminYTD = sumJByPrefix('61', true, postedForNeraca)
    const dynBebanOpsYTD = sumJByPrefix('62', true, postedForNeraca)
    const dynBebanNonOpsYTD = sumJByPrefix('8', true, postedForNeraca)
    const dynBPPYTD = sumJByPrefix('51', true, postedForNeraca)
    const dynPajakPenghasilanYTD = sumJByPrefix('99', true, postedForNeraca)
    const dynLabaBersihYTD = (dynPendapatanUtamaYTD + dynPendapatanLainnyaYTD + dynPendapatanNonOpsYTD) - (dynBPPYTD + dynBebanAdminYTD + dynBebanOpsYTD + dynBebanNonOpsYTD + dynPajakPenghasilanYTD)

    // === DELTA (user-entered journals) overlaid onto the frozen Excel reports ===
    // Keeps Jan–Apr identical to the official lampiran until the user adds/edits a
    // jurnal, then the affected lines + totals shift by exactly that jurnal.
    // Months WITHOUT a real snapshot contribute ALL their posted journals (any id
    // prefix): their figures exist ONLY in the journals, so filtering to JV-/JRN-
    // made template-imported months vanish from multi-month views (kendala
    // 07-07-2026 — TW2/semester tidak update).
    const ymOfJournal = (j) => String(j.tanggal || '').slice(0, 7)
    const deltaSetLR = useMemo(() =>
        postedForLabaRugi.filter(j => isDeltaJournal(j) || !flowSnapYMs.has(ymOfJournal(j)))
    , [postedForLabaRugi, flowSnapYMs])      // period scope (MTD/range)
    const deltaSetYTD = useMemo(() =>
        postedForNeraca.filter(j => isDeltaJournal(j) || (neracaBaseYM != null && ymOfJournal(j) > neracaBaseYM))
    , [postedForNeraca, neracaBaseYM])       // YTD scope (baseline snapshot month + later movements)
    const hasDeltaLR = deltaSetLR.length > 0
    const hasDeltaYTD = deltaSetYTD.length > 0

    // Per-month source chips (flow reports use LR-snapshot presence; Neraca is
    // point-in-time: months up to the baseline snapshot are frozen, later
    // months are journal movements).
    const flowSourceItems = rangeYearMonths.map(ym => ({
        label: MONTH_SHORT[parseInt(ym.split('-')[1], 10)] || ym,
        audited: flowSnapYMs.has(ym),
    }))
    const neracaSourceItems = rangeYearMonths.map(ym => ({
        label: MONTH_SHORT[parseInt(ym.split('-')[1], 10)] || ym,
        audited: neracaBaseYM != null && ym <= neracaBaseYM,
    }))

    // Laba Rugi buckets (period scope). deltaByPrefix uses effective codes, so
    // PPh journaled as "80000 > Pajak Penghasilan" lands in `pajak` ('99'), not
    // in bebanLain — and per the June lampiran layout it belongs inside beban
    // usaha ("Beban PPN dan PPH" row).
    const dLR = {
      pendUsaha: deltaByPrefix(deltaSetLR, '41', false) + deltaByPrefix(deltaSetLR, '42', false),
      bpp: deltaByPrefix(deltaSetLR, '51', true),
      admin: deltaByPrefix(deltaSetLR, '61', true),
      ops: deltaByPrefix(deltaSetLR, '62', true),
      pendLain: deltaByPrefix(deltaSetLR, '7', false),
      bebanLain: deltaByPrefix(deltaSetLR, '8', true),
      pajak: deltaByPrefix(deltaSetLR, '99', true),
      penyusutan: deltaByPrefix(deltaSetLR, '6113', true),
      bunga: deltaByPrefix(deltaSetLR, '70001', false),
      pajakBank: deltaByPrefix(deltaSetLR, '80001', true),
    }
    dLR.bebanUsaha = dLR.admin + dLR.ops + dLR.pajak
    dLR.bruto = dLR.pendUsaha - dLR.bpp
    dLR.labaUsaha = dLR.bruto - dLR.bebanUsaha
    dLR.netLainLain = dLR.pendLain - dLR.bebanLain
    dLR.labaBersih = dLR.labaUsaha + dLR.netLainLain
    dLR.ebitda = dLR.labaBersih - dLR.bunga + dLR.pajakBank + dLR.penyusutan + dLR.pajak
    const nameMapLR = useMemo(() => deltaByName(deltaSetLR), [deltaSetLR])

    // Delta keyed by Laba Rugi line label using lrAlias (COA code → LR label), for
    // accounts whose name differs from the LR line (e.g. "Beban Umum Lain-lain" →
    // "Beban Umum Lainnya"). So the specific beban line — not just the total — moves.
    const lrAliasDeltaByLabel = useMemo(() => {
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const m = {}
      for (const j of deltaSetLR) {
        const dCode = (j.akun_debit || '').split(' ')[0]
        const kCode = (j.akun_kredit || '').split(' ')[0]
        if (j.debit && lrAlias[dCode]) {
          const sign = /^[1568]/.test(dCode) ? +1 : -1
          const k = norm(lrAlias[dCode]); m[k] = (m[k] || 0) + sign * (j.debit || 0)
        }
        if (j.kredit && lrAlias[kCode]) {
          const sign = /^[2347]/.test(kCode) ? +1 : -1
          const k = norm(lrAlias[kCode]); m[k] = (m[k] || 0) + sign * (j.kredit || 0)
        }
      }
      return m
    }, [deltaSetLR])

    // Neraca buckets (YTD scope)
    const dN = {
      aset: deltaByPrefix(deltaSetYTD, '1', true),
      kewajiban: deltaByPrefix(deltaSetYTD, '2', false),
      ekuitas: deltaByPrefix(deltaSetYTD, '3', false),
      pl: (deltaByPrefix(deltaSetYTD, '4', false) + deltaByPrefix(deltaSetYTD, '7', false))
        - (deltaByPrefix(deltaSetYTD, '5', true) + deltaByPrefix(deltaSetYTD, '6', true) + deltaByPrefix(deltaSetYTD, '8', true)),
    }
    const nameMapN = useMemo(() => deltaByName(deltaSetYTD), [deltaSetYTD])
    const cashDeltaLR = useMemo(() => deltaCash(deltaSetLR), [deltaSetLR])

    // Delta keyed by Neraca label using the reconcileAlias map (COA code → Neraca
    // label), for accounts whose journal name differs from the Neraca label
    // (e.g. "Bank Kalsel - 3204661684" → "Kas Bank Kalsel"). Mirrors deltaByName's
    // sign rules: debit-normal (1/5/6/8) +debit/−kredit, credit-normal (2/3/4/7) opposite.
    const aliasNeracaKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const aliasDeltaByLabel = useMemo(() => {
      const m = {}
      for (const j of deltaSetYTD) {
        const dCode = (j.akun_debit || '').split(' ')[0]
        const kCode = (j.akun_kredit || '').split(' ')[0]
        if (j.debit && reconcileAlias[dCode]) {
          const sign = /^[1568]/.test(dCode) ? +1 : -1
          const k = aliasNeracaKey(reconcileAlias[dCode]); m[k] = (m[k] || 0) + sign * (j.debit || 0)
        }
        if (j.kredit && reconcileAlias[kCode]) {
          const sign = /^[2347]/.test(kCode) ? +1 : -1
          const k = aliasNeracaKey(reconcileAlias[kCode]); m[k] = (m[k] || 0) + sign * (j.kredit || 0)
        }
      }
      return m
    }, [deltaSetYTD])

    // Overlay delta onto Excel Neraca rows (returns adjusted copy).
    // Robust attribution lives in src/utils/reportDelta.js so the app and the
    // offline test harness run the SAME code (perbaikan-laporan-juni-2026 §1).
    // baseYM/viewYM enable the equity roll-forward: when the baseline snapshot
    // is an EARLIER month, its "(Laba) Rugi Periode Berjalan" folds into "Saldo
    // Laba (Rugi) Periode Lalu" and berjalan shows the view month only
    // (division convention, lampiran NERACA I72/I73).
    const applyNeracaDelta = (rows) => buildNeracaRows(rows, deltaSetYTD, { baseYM: neracaBaseYM, viewYM: yearMonth })

    // Overlay delta onto Excel Laba Rugi rows (shared robust attribution).
    const applyLabaRugiDelta = (rows) => buildLabaRugiRows(rows, deltaSetLR)

    const cashFlow = useMemo(() => computeCashFlow(postedForLabaRugi), [postedForLabaRugi])

    // === Compute beginning & ending cash balance for Arus Kas ===
    // Beginning cash = saldoAwal of all cash/bank accounts + movements from journals BEFORE the selected period
    const cashBalances = useMemo(() => {
        const cashAccts = coaFlat.filter(a => a.code.startsWith('111') && a.type === 'posting')
        // Sum all opening balances for cash/bank accounts
        const saldoAwalKas = cashAccts.reduce((s, a) => s + (a.saldoAwal || 0), 0)

        // Get all posted journals BEFORE the selected period (for beginning balance)
        const posted = journals.filter(j => j.status === 'posted')
        const selectedMonths = periodValueToMonths(selectedPeriod)
        const firstMonth = Math.min(...selectedMonths)
        const journalsBeforePeriod = posted.filter(j => {
            if (!j.tanggal) return false
            const jm = parseInt(j.tanggal.split('-')[1], 10)
            return jm < firstMonth
        })

        // Cash movement before the period
        let movementBefore = 0
        journalsBeforePeriod.forEach(j => {
            const dc = (j.akun_debit || '').split(' ')[0]
            const kc = (j.akun_kredit || '').split(' ')[0]
            if (dc.startsWith('111')) movementBefore += (j.debit || 0)
            if (kc.startsWith('111')) movementBefore -= (j.kredit || 0)
        })

        const beginningCash = saldoAwalKas + movementBefore
        const endingCash = beginningCash + cashFlow.totalNetto

        // Also compute what Neraca shows for Kas & Bank (for reconciliation)
        const neracaKasBank = calculateBalanceByCode('111', false, postedForNeraca)

        return { beginningCash, endingCash, neracaKasBank }
    }, [coaFlat, journals, selectedPeriod, cashFlow.totalNetto, postedForNeraca])

    // === DYNAMIC CHART DATA ===
    const dynChartMonths = useMemo(() => {
        const num = MONTHS.find(m => m.value === selectedPeriod)?.num || 4
        const start = Math.max(1, num - 5)
        return MONTHS.filter(m => m.num >= start && m.num <= num)
    }, [selectedPeriod])

    const dynMonthlyData = useMemo(() => {
        const posted = journals.filter(j => j.status === 'posted')
        return dynChartMonths.map(m => {
            const mj = posted.filter(j => j.tanggal && j.tanggal.startsWith(m.yearMonth))
            let pendapatan = 0, beban = 0, kasNet = 0
            mj.forEach(j => {
                const d = j.akun_debit?.split(' ')[0] || '', k = j.akun_kredit?.split(' ')[0] || ''
                if (k.startsWith('41') || k.startsWith('42') || k.startsWith('7')) pendapatan += j.kredit || 0
                if (d.startsWith('61') || d.startsWith('62') || d.startsWith('8')) beban += j.debit || 0
                if (d.startsWith('111')) kasNet += j.debit || 0
                if (k.startsWith('111')) kasNet -= j.kredit || 0
            })
            return { label: m.label.substring(0, 3), pendapatan, beban, laba: pendapatan - beban, kasNet }
        })
    }, [journals, dynChartMonths])

    const trendRangeLabel = dynChartMonths.length > 1
        ? `${dynChartMonths[0].label.substring(0,3)} – ${dynChartMonths[dynChartMonths.length-1].label.substring(0,3)} 2026`
        : `${dynChartMonths[0]?.label || ''} 2026`

    const dynKomposisiBebanData = useMemo(() => ({
        labels: ['Beban Administrasi', 'Beban Operasional', 'Beban Non-Ops'],
        datasets: [{ data: [dynBebanAdmin, dynBebanOps, dynBebanNonOps], backgroundColor: ['#6366F1', '#F59E0B', '#EF4444'], borderWidth: 0 }]
    }), [dynBebanAdmin, dynBebanOps, dynBebanNonOps])

    const dynTrenLabaData = useMemo(() => ({
        labels: dynMonthlyData.map(d => d.label),
        datasets: [{ label: 'Laba Bersih', data: dynMonthlyData.map(d => d.laba), borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4 }]
    }), [dynMonthlyData])

    const dynPvBData = useMemo(() => ({
        labels: dynMonthlyData.map(d => d.label),
        datasets: [
            { label: 'Pendapatan', data: dynMonthlyData.map(d => d.pendapatan), backgroundColor: '#10B981', borderRadius: 6 },
            { label: 'Beban', data: dynMonthlyData.map(d => d.beban), backgroundColor: '#EF4444', borderRadius: 6 }
        ]
    }), [dynMonthlyData])

    const dynKasBalances = useMemo(() => {
        let running = coaFlat.filter(a => a.code.startsWith('111') && a.type === 'posting').reduce((s, a) => s + (a.saldoAwal || 0), 0)
        return dynMonthlyData.map(d => { running += d.kasNet; return running })
    }, [dynMonthlyData, coaFlat])

    const dynTrenKasData = useMemo(() => ({
        labels: dynMonthlyData.map(d => d.label),
        datasets: [{ label: 'Saldo Kas & Bank', data: dynKasBalances, borderColor: '#6366F1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.4 }]
    }), [dynMonthlyData, dynKasBalances])

    const dynCurrentKas = dynKasBalances.length > 0 ? dynKasBalances[dynKasBalances.length - 1] : 0

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
                </div>
                {/* TW / Semester / Tahunan Presets */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Presets:</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {PERIOD_PRESETS.map(p => (
                            <button key={p.value} onClick={() => setSelectedPeriod(p.value)} style={{
                                padding: '4px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                                border: '1px solid var(--border)',
                                background: selectedPeriod === p.value ? 'var(--primary)' : 'transparent',
                                color: selectedPeriod === p.value ? 'white' : 'var(--text-muted)',
                                fontWeight: selectedPeriod === p.value ? 600 : 400,
                                transition: 'all 0.2s'
                            }}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <div className="toggle-wrapper" onClick={() => setShowComparison(!showComparison)} style={{ marginLeft: 'auto' }}>
                        <div className={`toggle ${showComparison ? 'active' : ''}`} />
                        <span style={{ fontSize: 12 }}>Perbandingan</span>
                    </div>
                </div>
                {!MONTHS.find(m => m.value === selectedPeriod)?.isAudit && !PERIOD_PRESETS.find(p => p.value === selectedPeriod) && (
                    <div style={{ fontSize: 11, color: 'var(--warning)', paddingLeft: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>✅ Data audit tersedia untuk bulan Januari – April 2026 (641 jurnal dari 4 bulan).</span>
                    </div>
                )}
            </div>

            {/* Group selector row */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {tabGroups.map(g => (
                    <button key={g} className={`btn btn-sm ${activeGroup === g ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => { setActiveGroup(g); const first = tabs.find(t => t.group === g && !t.hidden); if (first) setActiveTab(first.id) }}>
                        {g}
                    </button>
                ))}
            </div>
            {/* Tabs within active group */}
            <div className="tabs">
                {tabs.filter(t => t.group === activeGroup && !t.hidden).map(tab => (
                    <button key={tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}>
                        <tab.icon size={16} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* ===== LABA RUGI TAB ===== */}
            {activeTab === 'laba-rugi' && (
                <>
                    {refLabaRugiData.length > 0 && hasRealExcelData ? (
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
                                <SourceBadgeRow items={flowSourceItems} />
                                {hasDeltaLR && (
                                    <div style={{ background: 'rgba(99,102,241,0.1)', padding: '8px 16px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12, color: 'var(--primary)' }}>
                                        ➕ Termasuk {deltaSetLR.length} baris jurnal baru — Laba bersih {fmtSigned(dLR.labaBersih, formatRupiah)}
                                    </div>
                                )}
                                <table><thead><tr><th>Akun / Uraian</th><th className="text-right" style={{ width: 200 }}>{getPeriodLabel(selectedPeriod)}</th></tr></thead>
                                    <tbody>
                                        {applyLabaRugiDelta(refLabaRugiData).filter(r => r.label && r.label !== '2.3').map((row, i) => {
                                            const label = row.label
                                            const upper = label.toUpperCase()
                                            const depth = row.depth || 0
                                            const isTotal = upper.includes('JUMLAH') || upper.includes('JUMAH')
                                            const isLabaLine = upper.startsWith('LABA (RUGI)')
                                            const isSectionHeader = depth <= 2 && row.value == null
                                            const isBrutoUsaha = upper === 'LABA (RUGI) BRUTO' || upper === 'LABA (RUGI) USAHA'
                                            const isNetProfit = upper.includes('BERSIH SETELAH PAJAK')
                                            const isEbitda = upper.startsWith('EBITDA')

                                            let bgColor = 'transparent'
                                            if (isSectionHeader && upper.includes('PENDAPATAN')) bgColor = 'rgba(16,185,129,0.12)'
                                            if (isSectionHeader && upper.includes('BEBAN')) bgColor = 'rgba(239,68,68,0.1)'
                                            if (isBrutoUsaha) bgColor = 'rgba(99,102,241,0.12)'
                                            if (isNetProfit) bgColor = 'var(--border-light)'

                                            let textColor = undefined
                                            if (row.value < 0) textColor = 'var(--danger)'
                                            else if ((isLabaLine || isNetProfit) && row.value > 0) textColor = 'var(--success)'

                                            return (
                                                <tr key={i} style={{
                                                    fontWeight: isTotal || isLabaLine || isSectionHeader || isNetProfit ? 700 : 400,
                                                    background: bgColor,
                                                    fontSize: isNetProfit || isSectionHeader ? 14 : 13,
                                                    borderTop: isTotal || isLabaLine ? '2px solid var(--border)' : undefined,
                                                    fontStyle: isEbitda ? 'italic' : undefined
                                                }}>
                                                    <td style={{ paddingLeft: 12 + depth * 14, color: isEbitda ? 'var(--text-muted)' : undefined, fontSize: isEbitda ? 12 : undefined }}>{label}</td>
                                                    <td className="text-right mono" style={{ color: textColor, fontSize: isEbitda ? 12 : undefined }}>
                                                        {row.value != null ? formatRupiah(row.value) : ''}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
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
                            <SourceBadgeRow items={flowSourceItems} />
                            <table>
                                <thead><tr><th>Akun / Uraian</th><th className="text-right">{getPeriodLabel(selectedPeriod)}</th></tr></thead>
                                <tbody>
                                    {/* === PENDAPATAN USAHA === */}
                                    <tr style={{ background: 'rgba(16,185,129,0.15)', fontWeight: 700 }}><td colSpan={2}>PENDAPATAN USAHA</td></tr>
                                    <tr><td style={{ paddingLeft: 32 }}>Pendapatan Bisnis Utama</td><td className="text-right mono">{formatRupiah(dynPendapatanUtama)}</td></tr>
                                    <tr><td style={{ paddingLeft: 32 }}>Pendapatan Bisnis Lainnya</td><td className="text-right mono">{formatRupiah(dynPendapatanLainnya)}</td></tr>
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                                        <td>JUMLAH PENDAPATAN USAHA</td>
                                        <td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(dynPendapatanUsaha)}</td>
                                    </tr>
                                    <tr style={{ height: 8 }}><td colSpan={2} /></tr>

                                    {/* === BPP === */}
                                    {dynBPP > 0 && <>
                                        <tr style={{ background: 'rgba(239,68,68,0.1)', fontWeight: 700 }}><td colSpan={2}>BEBAN POKOK PENJUALAN</td></tr>
                                        {dynBPPItems.map((item, i) => (
                                            <tr key={i}><td style={{ paddingLeft: 32 }}>{item.name}</td><td className="text-right mono">{formatRupiah(item.amount)}</td></tr>
                                        ))}
                                        <tr style={{ fontWeight: 700, borderTop: '1px solid var(--border)' }}>
                                            <td>JUMLAH BEBAN POKOK PENJUALAN</td>
                                            <td className="text-right mono">{formatRupiah(dynBPP)}</td>
                                        </tr>
                                        <tr style={{ height: 8 }}><td colSpan={2} /></tr>
                                        <tr style={{ fontWeight: 700, background: 'rgba(99,102,241,0.12)', borderTop: '1px solid var(--border)' }}>
                                            <td>LABA BRUTO</td>
                                            <td className="text-right mono" style={{ color: dynLabaBruto >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatRupiah(dynLabaBruto)}</td>
                                        </tr>
                                        <tr style={{ height: 10 }}><td colSpan={2} /></tr>
                                    </>}

                                    {/* === BEBAN ADMINISTRASI & UMUM === */}
                                    <tr style={{ background: 'rgba(239,68,68,0.1)', fontWeight: 700 }}><td colSpan={2}>BEBAN ADMINISTRASI &amp; UMUM</td></tr>
                                    {dynBebanUItems.map((item, i) => (
                                        <tr key={i}><td style={{ paddingLeft: 32 }}>{item.name}</td><td className="text-right mono">{formatRupiah(item.amount)}</td></tr>
                                    ))}
                                    <tr style={{ fontWeight: 700, borderTop: '1px solid var(--border)' }}>
                                        <td>JUMLAH BEBAN ADMINISTRASI &amp; UMUM</td>
                                        <td className="text-right mono">{formatRupiah(dynBebanAdmin)}</td>
                                    </tr>
                                    <tr style={{ height: 8 }}><td colSpan={2} /></tr>

                                    {/* === BEBAN OPERASIONAL === */}
                                    <tr style={{ background: 'rgba(239,68,68,0.1)', fontWeight: 700 }}><td colSpan={2}>BEBAN OPERASIONAL</td></tr>
                                    {dynBebanOpsItemsList.map((item, i) => (
                                        <tr key={i}><td style={{ paddingLeft: 32 }}>{item.name}</td><td className="text-right mono">{formatRupiah(item.amount)}</td></tr>
                                    ))}
                                    {dynPajakPenghasilan !== 0 && (
                                        /* PPh badan disajikan di dalam Beban Operasional (baris "Beban PPN
                                           dan PPH") sesuai format lampiran resmi Juni 2026 (J53). */
                                        <tr><td style={{ paddingLeft: 32 }}>Beban PPN dan PPH</td><td className="text-right mono">{formatRupiah(dynPajakPenghasilan)}</td></tr>
                                    )}
                                    <tr style={{ fontWeight: 700, borderTop: '1px solid var(--border)' }}>
                                        <td>JUMLAH BEBAN OPERASIONAL</td>
                                        <td className="text-right mono">{formatRupiah(dynBebanOps + dynPajakPenghasilan)}</td>
                                    </tr>
                                    <tr style={{ height: 8 }}><td colSpan={2} /></tr>

                                    <tr style={{ fontWeight: 700 }}>
                                        <td>JUMLAH BEBAN USAHA</td>
                                        <td className="text-right mono">{formatRupiah(dynJumlahBebanUsaha)}</td>
                                    </tr>
                                    <tr style={{ height: 8 }}><td colSpan={2} /></tr>

                                    <tr style={{ fontWeight: 700, background: 'rgba(99,102,241,0.12)', borderTop: '2px solid var(--border)', fontSize: 14 }}>
                                        <td>LABA (RUGI) USAHA</td>
                                        <td className="text-right mono" style={{ color: dynLabaUsaha >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatRupiah(dynLabaUsaha)}</td>
                                    </tr>
                                    <tr style={{ height: 16 }}><td colSpan={2} /></tr>

                                    {/* === PENDAPATAN LAIN-LAIN === */}
                                    {(dynPendapatanNonOps > 0 || dynPendLainItems.length > 0) && <>
                                        <tr style={{ background: 'rgba(16,185,129,0.1)', fontWeight: 700 }}><td colSpan={2}>PENDAPATAN LAIN-LAIN</td></tr>
                                        {dynPendLainItems.map((item, i) => (
                                            <tr key={i}><td style={{ paddingLeft: 32 }}>{item.name}</td><td className="text-right mono">{formatRupiah(item.amount)}</td></tr>
                                        ))}
                                        <tr style={{ fontWeight: 700, borderTop: '1px solid var(--border)' }}>
                                            <td>JUMLAH PENDAPATAN LAIN-LAIN</td>
                                            <td className="text-right mono">{formatRupiah(dynPendapatanNonOps)}</td>
                                        </tr>
                                        <tr style={{ height: 8 }}><td colSpan={2} /></tr>
                                    </>}

                                    {/* === BEBAN NON OPERASIONAL === */}
                                    {(dynBebanNonOps > 0 || dynBebanLainItems.length > 0) && <>
                                        <tr style={{ background: 'rgba(239,68,68,0.1)', fontWeight: 700 }}><td colSpan={2}>BEBAN NON OPERASIONAL</td></tr>
                                        {dynBebanLainItems.map((item, i) => (
                                            <tr key={i}><td style={{ paddingLeft: 32 }}>{item.name}</td><td className="text-right mono">{formatRupiah(item.amount)}</td></tr>
                                        ))}
                                        <tr style={{ fontWeight: 700, borderTop: '1px solid var(--border)' }}>
                                            <td>JUMLAH BEBAN NON OPERASIONAL</td>
                                            <td className="text-right mono">{formatRupiah(dynBebanNonOps)}</td>
                                        </tr>
                                        <tr style={{ height: 8 }}><td colSpan={2} /></tr>
                                    </>}

                                    {(dynPendapatanNonOps > 0 || dynBebanNonOps > 0) && (
                                        <tr style={{ fontWeight: 600 }}>
                                            <td>JUMLAH PENDAPATAN DAN (BEBAN LAIN-LAIN)</td>
                                            <td className="text-right mono" style={{ color: dynNetNonOp >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatRupiah(dynNetNonOp)}</td>
                                        </tr>
                                    )}

                                    <tr style={{ height: 12 }}><td colSpan={2} /></tr>

                                    {/* === LABA BERSIH === */}
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                                        <td>LABA (RUGI) BERSIH SEBELUM PAJAK</td>
                                        <td className="text-right mono" style={{ color: dynLabaBersihSebelumPajak >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatRupiah(dynLabaBersihSebelumPajak)}</td>
                                    </tr>
                                    <tr>
                                        {/* PPh sudah disajikan di Beban Operasional (baris "Beban PPN dan
                                            PPH") — baris pajak di sini 0, persis lampiran Juni (J78). */}
                                        <td style={{ paddingLeft: 32 }}>Beban Pajak Penghasilan</td>
                                        <td className="text-right mono">Rp -</td>
                                    </tr>
                                    <tr style={{ fontWeight: 700, background: 'var(--border-light)', fontSize: 15, borderTop: '1px solid var(--border)' }}>
                                        <td>LABA (RUGI) BERSIH SETELAH PAJAK</td>
                                        <td className="text-right mono" style={{ color: dynLabaBersih >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatRupiah(dynLabaBersih)}</td>
                                    </tr>
                                    <tr style={{ height: 8 }}><td colSpan={2} /></tr>
                                    <tr style={{ borderTop: '1px dashed var(--border)', paddingTop: 4 }}>
                                        <td style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>EBITDA (Earning Before Interest Tax Depreciation Amortization)</td>
                                        <td className="text-right mono" style={{ fontSize: 12, color: dynEBITDA >= 0 ? 'var(--success)' : 'var(--danger)', fontStyle: 'italic' }}>{formatRupiah(dynEBITDA)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    )}

                    <div className="chart-grid">
                        <div className="chart-card">
                            <div className="card-header"><div><div className="card-title">Komposisi Beban Operasional</div><div className="card-subtitle">{getPeriodLabel(selectedPeriod)} 2026</div></div></div>
                            <div style={{ height: 240, display: 'flex', justifyContent: 'center' }}><Doughnut data={dynKomposisiBebanData} options={doughnutOpts} /></div>
                            <div style={{ marginTop: 16 }}>
                                {dynKomposisiBebanData.labels.map((label, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? '1px solid var(--border-light)' : 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: dynKomposisiBebanData.datasets[0].backgroundColor[i] }} /><span style={{ fontSize: 13 }}>{label}</span></div>
                                        <span className="mono" style={{ fontSize: 13 }}>{formatRupiah(dynKomposisiBebanData.datasets[0].data[i])}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="chart-card">
                            <div className="card-header"><div><div className="card-title">Tren Laba Bersih</div><div className="card-subtitle">{trendRangeLabel}</div></div></div>
                            <div style={{ height: 280 }}><Line data={dynTrenLabaData} options={chartOpts} /></div>
                        </div>
                    </div>

                    <div className="chart-grid">
                        <div className="chart-card">
                            <div className="card-header"><div><div className="card-title">Pendapatan vs. Beban — Tren Bulanan</div><div className="card-subtitle">{trendRangeLabel}</div></div></div>
                            <div style={{ height: 280 }}><Bar data={dynPvBData} options={chartOpts} /></div>
                        </div>
                        <div className="chart-card">
                            <div className="card-header"><div><div className="card-title">Tren Saldo Kas & Bank</div><div className="card-subtitle">{trendRangeLabel}</div></div><span style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatRupiah(dynCurrentKas)}</span></div>
                            <div style={{ height: 280 }}><Line data={dynTrenKasData} options={{ ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, ticks: { ...chartOpts.scales.y.ticks, callback: v => (v / 1000000).toFixed(1) + 'M' } } } }} /></div>
                        </div>
                    </div>
                </>
            )}

            {/* ===== ARUS KAS TAB ===== */}
            {activeTab === 'arus-kas' && (() => {
                // Use reference data from Excel only for months with real audited data
                if (refArusKasData.length > 0 && hasRealExcelData) {
                    return (
                        <div className="report-doc">
                            <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div className="company">PERUMDA PASAR BAIMAN</div>
                                    <h2>LAPORAN ARUS KAS</h2>
                                    <div className="period">Untuk Periode {getPeriodLabel(selectedPeriod)} 2026 — Metode Tidak Langsung</div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('Laporan Arus Kas')}><Printer size={14} /> Cetak Laporan</button>
                                    <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => exportArusKas(cashFlow)}><Download size={14} /> Unduh Excel (.xlsx)</button>
                                </div>
                            </div>
                            <div className="report-doc-body">
                                <SourceBadgeRow items={flowSourceItems} />
                                {hasDeltaLR && cashDeltaLR !== 0 && (
                                    <div style={{ background: 'rgba(99,102,241,0.1)', padding: '8px 16px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12, color: 'var(--primary)' }}>
                                        ➕ Termasuk arus kas jurnal baru — Kas {fmtSigned(cashDeltaLR, formatRupiah)} ({cashDeltaLR >= 0 ? 'penerimaan' : 'pengeluaran'} bersih)
                                    </div>
                                )}
                                <table><thead><tr><th>Keterangan</th><th className="text-right" style={{ width: 200 }}>Jumlah</th></tr></thead>
                                    <tbody>
                                        {buildArusKasRows(refArusKasData, deltaSetLR).map((row, i) => {
                                            const label = row.label
                                            const isSection = row.is_section === 1
                                            const isSubtotalRow = label.includes('Arus Kas Diperoleh') || label.includes('Arus Kas Digunakan')
                                            const isBottomRow = label.includes('Kenaikan') || label.includes('Kas dan Setara') || label.includes('Koreksi')
                                            const isEndingCash = label.includes('Akhir Periode')
                                            
                                            let bgColor = 'transparent'
                                            if (isSection && label.includes('Operasi')) bgColor = 'var(--success-light)'
                                            if (isSection && label.includes('Investasi')) bgColor = 'var(--primary-light)'
                                            if (isSection && label.includes('Pendanaan')) bgColor = 'rgba(168,85,247,0.15)'
                                            if (isSubtotalRow) bgColor = 'rgba(255,255,255,0.05)'
                                            if (isBottomRow && label.includes('Kenaikan')) bgColor = 'var(--border-light)'
                                            if (isEndingCash) bgColor = 'var(--primary-light)'
                                            
                                            let textColor = undefined
                                            if (row.value < 0) textColor = 'var(--danger)'
                                            if (row.value > 0) textColor = 'var(--success)'
                                            if (isEndingCash) textColor = 'var(--primary)'
                                            
                                            return (
                                                <tr key={i} style={{
                                                    fontWeight: isSection || isSubtotalRow || isBottomRow ? 700 : 400,
                                                    background: bgColor,
                                                    fontSize: isSection || isBottomRow ? 14 : 13,
                                                    borderTop: isSubtotalRow || isBottomRow ? '2px solid var(--border)' : undefined
                                                }}>
                                                    <td style={{ paddingLeft: isSection || isBottomRow ? 12 : (isSubtotalRow ? 20 : 32) }}>{label}</td>
                                                    <td className="text-right mono" style={{ color: textColor }}>
                                                        {row.value != null ? formatRupiah(row.value) : ''}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                }

                // Fallback (journal-mode months): division-format INDIRECT method
                // built from the period's journals (effective-code movements) —
                // exactly the lampiran ARUS KAS layout (spec §7). Kas awal comes
                // from the baseline Neraca snapshot's cash rows (plus any interim
                // journal months), so the statement ties to the Neraca.
                const CASH_ROW_LABELS = new Set([
                    'kas kecil - kantor', 'kas pendapatan belum setor', 'kas bank kalsel', 'bank bni',
                    'investasi jangka pendek', 'bank bni bisnis', 'bank bni tapcash', 'bank bsi',
                ])
                const firstYM = rangeYearMonths[0]
                let kasAwal = cashBalances.beginningCash
                if (refNeracaData.length > 0 && neracaBaseYM && neracaBaseYM < firstYM) {
                    const baselineCash = refNeracaData.reduce((s, r) => s + (CASH_ROW_LABELS.has(normLabel(r.label)) ? (r.value || 0) : 0), 0)
                    const interimCash = deltaCash(deltaSetYTD.filter(j => {
                        const ym = String(j.tanggal || '').slice(0, 7)
                        return ym > neracaBaseYM && ym < firstYM
                    }))
                    kasAwal = baselineCash + interimCash
                }
                const ak = buildArusKasIndirectRows({
                    journals: postedForLabaRugi,
                    labaSebelumPajak: dynLabaBersihSebelumPajak,
                    penyusutan: dynPenyusutan,
                    pajakRow: 0,
                    kasAwal,
                })

                return (
                    <div className="report-doc">
                        <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div><div className="company">PERUMDA PASAR BAIMAN</div><h2>LAPORAN ARUS KAS</h2><div className="period">Untuk Periode {getPeriodLabel(selectedPeriod)} 2026 — Metode Tidak Langsung</div></div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('Laporan Arus Kas')}><Printer size={14} /> Cetak Laporan</button>
                                <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => exportArusKas(cashFlow)}><Download size={14} /> Unduh Excel (.xlsx)</button>
                            </div>
                        </div>
                        <div className="report-doc-body">
                            <SourceBadgeRow items={flowSourceItems} />
                            <table><thead><tr><th>Keterangan</th><th className="text-right" style={{ width: 200 }}>Jumlah</th></tr></thead>
                                <tbody>
                                    {ak.rows.map((row, i) => {
                                        const label = row.label
                                        const isSection = !!row.header
                                        const isSubtotalRow = !!row.subtotal
                                        const isEndingCash = label.includes('Akhir Periode')
                                        let bgColor = 'transparent'
                                        if (isSection && label.includes('Operasi')) bgColor = 'var(--success-light)'
                                        if (isSection && label.includes('Investasi')) bgColor = 'var(--primary-light)'
                                        if (isSection && label.includes('Pendanaan')) bgColor = 'rgba(168,85,247,0.15)'
                                        if (isSubtotalRow) bgColor = 'rgba(255,255,255,0.05)'
                                        if (label.includes('Kenaikan')) bgColor = 'var(--border-light)'
                                        if (isEndingCash) bgColor = 'var(--primary-light)'
                                        let textColor = undefined
                                        if (row.value < 0) textColor = 'var(--danger)'
                                        if (row.value > 0) textColor = 'var(--success)'
                                        if (isEndingCash) textColor = 'var(--primary)'
                                        return (
                                            <tr key={i} style={{
                                                fontWeight: isSection || isSubtotalRow ? 700 : 400,
                                                background: bgColor,
                                                fontSize: isSection ? 14 : 13,
                                                borderTop: isSubtotalRow ? '2px solid var(--border)' : undefined
                                            }}>
                                                <td style={{ paddingLeft: isSection ? 12 : (isSubtotalRow ? 20 : 32) }}>{label}</td>
                                                <td className="text-right mono" style={{ color: textColor }}>
                                                    {row.value != null ? formatRupiah(row.value) : ''}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            })()}

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
                        <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div className="company">PERUMDA PASAR BAIMAN</div><h2>NERACA SALDO</h2><div className="period">Per {getPeriodLabel(selectedPeriod)} 2026</div></div><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('Neraca Saldo')}><Printer size={14} /> Cetak Laporan</button><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => exportNeracaSaldo(rows)}><Download size={14} /> Unduh Excel (.xlsx)</button></div></div>
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
                // Use reference data from Excel only for months with real audited data
                if (refNeracaData.length > 0 && hasRealExcelData) {
                    // Comparative column = the period immediately before the range start
                    // (prior month for a single month; prior period-end for a preset).
                    const firstMonthNum = periodValueToMonths(selectedPeriod)[0]
                    const prevYM = firstMonthNum > 1 ? `2026-${String(firstMonthNum - 1).padStart(2, '0')}` : '2025-12'
                    const curLabel = `${getPeriodLabel(selectedPeriod)} ${yearMonth.split('-')[0]}`
                    const prevLabel = (() => { const m = MONTHS.find(x => x.yearMonth === prevYM); return m ? `${m.label} ${prevYM.split('-')[0]}` : '' })()
                    const hasPrev = refNeracaPrevData.length > 0
                    // Occurrence-aware lookup: the lampiran Neraca repeats the label
                    // "Nilai Buku" (properti investasi AND aset tetap group) — a plain
                    // first-match map showed the PI figure on BOTH rows of the
                    // comparative column.
                    const prevValsByLabel = {}
                    refNeracaPrevData.forEach(r => { (prevValsByLabel[r.label] = prevValsByLabel[r.label] || []).push(r.value) })
                    const prevSeen = {}
                    const nextPrevVal = (label) => {
                        const arr = prevValsByLabel[label]
                        const idx = prevSeen[label] || 0
                        prevSeen[label] = idx + 1
                        return arr ? arr[Math.min(idx, arr.length - 1)] : undefined
                    }
                    return (
                        <div className="report-doc">
                            <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div className="company">PERUMDA PASAR BAIMAN</div><h2>NERACA (LAPORAN POSISI KEUANGAN)</h2><div className="period">Per {getPeriodLabel(selectedPeriod)}</div></div><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('Neraca')}><Printer size={14} /> Cetak Laporan</button><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={exportNeraca}><Download size={14} /> Unduh Excel (.xlsx)</button></div></div>
                            <div className="report-doc-body">
                                <SourceBadgeRow items={neracaSourceItems} />
                                {hasDeltaYTD && (
                                    <div style={{ background: 'rgba(99,102,241,0.1)', padding: '8px 16px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12, color: 'var(--primary)' }}>
                                        ➕ Termasuk {deltaSetYTD.length} baris jurnal baru — Aset {fmtSigned(dN.aset, formatRupiah)}, Kewajiban {fmtSigned(dN.kewajiban, formatRupiah)}, Ekuitas {fmtSigned(dN.ekuitas + dN.pl, formatRupiah)}
                                    </div>
                                )}
                                <table><thead><tr><th>Akun</th><th className="text-right" style={{ width: 180 }}>{curLabel}</th>{hasPrev && <th className="text-right" style={{ width: 180 }}>{prevLabel}</th>}</tr></thead>
                                    <tbody>
                                        {applyNeracaDelta(refNeracaData).filter(r => r.label && r.label !== '2.2').map((row, i) => {
                                            const label = row.label
                                            const isSection = ['ASET', 'KEWAJIBAN', 'EKUITAS'].includes(label.toUpperCase())
                                            const isTotal = label.toUpperCase().includes('JUMLAH')
                                            const isSubheader = !row._unmapped && (label.includes(':') || ['Aset Lancar', 'Aset Tidak Lancar', 'Kewajiban  Jangka Pendek', 'Kewajiban Jangka Panjang', 'Kekayaan Pemda Yang Dipisahkan', 'Aset Lainnya', 'Aset Dalam Penyelesaian'].some(s => label.includes(s)))
                                            const isNilaiLabel = label.includes('Nilai Buku')
                                            const depth = row.depth || 0
                                            const prevVal = nextPrevVal(label)
                                            
                                            let bgColor = 'transparent'
                                            if (isSection && label.toUpperCase() === 'ASET') bgColor = 'var(--primary-light)'
                                            if (isSection && label.toUpperCase() === 'KEWAJIBAN') bgColor = 'var(--danger-light)'
                                            if (isSection && label.toUpperCase() === 'EKUITAS') bgColor = 'var(--success-light)'
                                            if (isTotal) bgColor = 'var(--border-light)'
                                            
                                            let textColor = undefined
                                            if (row.value < 0) textColor = 'var(--danger)'
                                            if (isTotal && label.includes('ASET')) textColor = 'var(--primary)'
                                            if (isTotal && label.includes('KEWAJIBAN DAN')) textColor = undefined
                                            if (isTotal && label.includes('KEWAJIBAN') && !label.includes('DAN')) textColor = 'var(--danger)'
                                            if (isTotal && label.includes('EKUITAS') && !label.includes('KEWAJIBAN')) textColor = 'var(--success)'

                                            return (
                                                <tr key={i} style={{
                                                    fontWeight: isSection || isTotal || isSubheader || isNilaiLabel ? 600 : 400,
                                                    background: bgColor,
                                                    fontSize: isSection || isTotal ? 14 : 13,
                                                    borderTop: isTotal ? '2px solid var(--border)' : undefined,
                                                    fontStyle: row._unmapped ? 'italic' : undefined
                                                }}>
                                                    <td style={{ paddingLeft: 12 + depth * 16, color: row._unmapped ? 'var(--text-muted)' : undefined }}>{label}</td>
                                                    <td className="text-right mono" style={{ color: textColor }}>
                                                        {row.value != null ? formatRupiah(row.value) : ''}
                                                    </td>
                                                    {hasPrev && (
                                                        <td className="text-right mono" style={{ color: prevVal < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                                                            {prevVal != null ? formatRupiah(prevVal) : ''}
                                                        </td>
                                                    )}
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                }

                // Fallback: dynamic computation from COA tree
                const posted = postedForNeraca
                const getAccAmount = (code) => {
                    let d = 0, k = 0
                    posted.forEach(j => {
                        const dc = (j.akun_debit || '').split(' ')[0]
                        const kc = (j.akun_kredit || '').split(' ')[0]
                        if (dc === code) d += (j.debit || 0)
                        if (kc === code) k += (j.kredit || 0)
                    })
                    return { d, k }
                }
                const buildItems = (nodes, isCreditNormal) => {
                    let total = 0
                    const items = nodes.map(node => {
                        const isPosting = node.type === 'posting'
                        const sa = node.saldo_awal || node.saldoAwal || 0
                        let childItems = [], childTotal = 0
                        if (node.children && node.children.length > 0) {
                            const result = buildItems(node.children, isCreditNormal)
                            childItems = result.items; childTotal = result.total
                        }
                        let val = isPosting ? (isCreditNormal ? sa + getAccAmount(node.code).k - getAccAmount(node.code).d : sa + getAccAmount(node.code).d - getAccAmount(node.code).k) : childTotal
                        total += val
                        return { code: node.code, name: node.name, v: val, isParent: !isPosting, children: childItems }
                    }).filter(i => Math.abs(i.v) > 0.01 || i.children.length > 0)
                    return { items, total }
                }
                const renderRow = (item, depth) => {
                    const rows = []
                    rows.push(<tr key={item.code || item.name} style={{ fontWeight: item.isParent ? 600 : 400, background: item.isParent && depth === 0 ? 'rgba(255,255,255,0.03)' : 'transparent', fontSize: item.isParent && depth <= 1 ? 14 : 13 }}><td style={{ paddingLeft: 20 + depth * 20 }}>{item.code ? `${item.code} — ` : ''}{item.name}</td><td className="text-right mono" style={{ color: item.v < 0 ? 'var(--danger)' : undefined }}>{formatRupiah(item.v)}</td></tr>)
                    if (item.children) item.children.forEach(child => rows.push(...renderRow(child, depth + 1)))
                    return rows
                }
                const aset = buildItems(coaTree.filter(n => n.code.startsWith('1')), false)
                const kewajiban = buildItems(coaTree.filter(n => n.code.startsWith('2')), true)
                const ekuitas = buildItems(coaTree.filter(n => n.code.startsWith('3')), true)
                const totalEkuitas = ekuitas.total + dynLabaBersihYTD
                const isBalanced = Math.abs(aset.total - (kewajiban.total + totalEkuitas)) < 1
                return (
                    <div className="report-doc">
                        <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div className="company">PERUMDA PASAR BAIMAN</div><h2>NERACA (LAPORAN POSISI KEUANGAN)</h2><div className="period">Per {getPeriodLabel(selectedPeriod)}</div></div><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('Neraca')}><Printer size={14} /> Cetak Laporan</button><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={exportNeraca}><Download size={14} /> Unduh Excel (.xlsx)</button></div></div>
                        <div className="report-doc-body">
                            <table><thead><tr><th>Akun</th><th className="text-right">Jumlah</th></tr></thead>
                                <tbody>
                                    <tr style={{ background: 'var(--primary-light)' }}><td style={{ fontWeight: 700 }}>ASET</td><td></td></tr>
                                    {aset.items.map(item => renderRow(item, 0))}
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}><td>Total Aset</td><td className="text-right mono" style={{ color: 'var(--primary)' }}>{formatRupiah(aset.total)}</td></tr>
                                    <tr style={{ height: 12 }}><td colSpan={2}></td></tr>
                                    <tr style={{ background: 'var(--danger-light)' }}><td style={{ fontWeight: 700 }}>KEWAJIBAN</td><td></td></tr>
                                    {kewajiban.items.map(item => renderRow(item, 0))}
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}><td>Total Kewajiban</td><td className="text-right mono" style={{ color: 'var(--danger)' }}>{formatRupiah(kewajiban.total)}</td></tr>
                                    <tr style={{ height: 12 }}><td colSpan={2}></td></tr>
                                    <tr style={{ background: 'var(--success-light)' }}><td style={{ fontWeight: 700 }}>EKUITAS</td><td></td></tr>
                                    {ekuitas.items.map(item => renderRow(item, 0))}
                                    <tr><td style={{ paddingLeft: 40 }}>Laba/Rugi Berjalan (YTD)</td><td className="text-right mono" style={{ color: dynLabaBersihYTD < 0 ? 'var(--danger)' : 'var(--success)' }}>{formatRupiah(dynLabaBersihYTD)}</td></tr>
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}><td>Total Ekuitas</td><td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(totalEkuitas)}</td></tr>
                                    <tr style={{ height: 8 }}><td colSpan={2}></td></tr>
                                    <tr style={{ fontWeight: 700, background: 'var(--border-light)', fontSize: 15 }}><td>Total Kewajiban + Ekuitas</td><td className="text-right mono">{formatRupiah(kewajiban.total + totalEkuitas)}</td></tr>
                                    <tr><td colSpan={2} style={{ textAlign: 'center', padding: 12 }}><span className={`badge ${isBalanced ? 'green' : 'red'}`}>{isBalanced ? '✓ Balance — Aset = Kewajiban + Ekuitas' : `✗ Selisih: ${formatRupiah(Math.abs(aset.total - (kewajiban.total + totalEkuitas)))}`}</span></td></tr>
                                </tbody></table>
                        </div>
                    </div>
                )
            })()}

            {/* ===== PERUBAHAN EKUITAS TAB ===== */}
            {activeTab === 'perubahan-ekuitas' && (() => {
                // Equity COA: 31000 Modal Perumda, 32000 Modal Disetor, 33000 Saldo Laba Tahun Lalu,
                // 34000 Laba Periode Berjalan, 35000 Koreksi Ekuitas.
                // "Modal" column = penyertaan + disetor (31+32). "Laba Ditahan" = saldo laba lalu (33+34 opening).
                const dynModal = calculateBalanceByCode('31', true, postedForNeraca) + calculateBalanceByCode('32', true, postedForNeraca)
                const dynLabaDitahan = calculateBalanceByCode('33', true, postedForNeraca) + calculateBalanceByCode('34', true, postedForNeraca)
                const dynKoreksi = calculateBalanceByCode('35', true, postedForNeraca)

                const saldoAwalMdl = dynModal
                const saldoAkhirMdl = saldoAwalMdl
                const saldoAkhirLR = dynLabaBersihYTD
                const saldoAkhirTotal = saldoAkhirMdl + dynLabaDitahan + dynKoreksi + saldoAkhirLR

                return (
                    <div className="report-doc">
                        <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div className="company">PERUMDA PASAR BAIMAN</div><h2>LAPORAN PERUBAHAN EKUITAS</h2><div className="period">Untuk Periode {getPeriodLabel(selectedPeriod)} 2026</div></div><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('Perubahan Ekuitas')}><Printer size={14} /> Cetak Laporan</button><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => exportPerubahanEkuitas([
                            ['Saldo Awal (1 Jan 2026)', saldoAwalMdl, dynLabaDitahan + dynKoreksi, saldoAwalMdl + dynLabaDitahan + dynKoreksi],
                            ['Penambahan Modal', '-', '-', '-'],
                            ['Laba (Rugi) Bersih Tahun Berjalan (YTD)', '-', dynLabaBersihYTD, dynLabaBersihYTD],
                            ['Dividen', '-', '-', '-'],
                            ['Saldo Akhir Periode', saldoAkhirMdl, dynLabaDitahan + dynKoreksi + dynLabaBersihYTD, saldoAkhirTotal],
                          ])}><Download size={14} /> Unduh Excel (.xlsx)</button></div></div>
                        <div className="report-doc-body">
                            <table><thead><tr><th>Keterangan</th><th className="text-right">Modal</th><th className="text-right">Laba Ditahan</th><th className="text-right">Total Ekuitas</th></tr></thead>
                                <tbody>
                                    <tr style={{ fontWeight: 600 }}><td>Saldo Awal (1 Jan 2026)</td><td className="text-right mono">{formatRupiah(saldoAwalMdl)}</td><td className="text-right mono">{formatRupiah(dynLabaDitahan + dynKoreksi)}</td><td className="text-right mono">{formatRupiah(saldoAwalMdl + dynLabaDitahan + dynKoreksi)}</td></tr>
                                    <tr><td style={{ paddingLeft: 24 }}>Penambahan Modal</td><td className="text-right mono">-</td><td className="text-right mono">-</td><td className="text-right mono">-</td></tr>
                                    <tr><td style={{ paddingLeft: 24 }}>Laba (Rugi) Bersih Tahun Berjalan (YTD)</td><td className="text-right mono">-</td><td className="text-right mono" style={{ color: dynLabaBersihYTD < 0 ? 'var(--danger)' : 'var(--success)' }}>{formatRupiah(dynLabaBersihYTD)}</td><td className="text-right mono" style={{ color: dynLabaBersihYTD < 0 ? 'var(--danger)' : 'var(--success)' }}>{formatRupiah(dynLabaBersihYTD)}</td></tr>
                                    <tr><td style={{ paddingLeft: 24 }}>Dividen</td><td className="text-right mono">-</td><td className="text-right mono">-</td><td className="text-right mono">-</td></tr>
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: 'var(--border-light)' }}><td>Saldo Akhir Periode</td><td className="text-right mono">{formatRupiah(saldoAkhirMdl)}</td><td className="text-right mono" style={{ color: (dynLabaDitahan + dynKoreksi + dynLabaBersihYTD) < 0 ? 'var(--danger)' : 'var(--success)' }}>{formatRupiah(dynLabaDitahan + dynKoreksi + dynLabaBersihYTD)}</td><td className="text-right mono" style={{ color: saldoAkhirTotal < 0 ? 'var(--danger)' : 'var(--primary)' }}>{formatRupiah(saldoAkhirTotal)}</td></tr>
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
            {activeTab === 'rasio' && (() => {
                const rTotalAset = calculateBalanceByCode('1', false, postedForNeraca)
                const rTotalKewajiban = calculateBalanceByCode('2', true, postedForNeraca)
                const rTotalEkuitasBase = calculateBalanceByCode('3', true, postedForNeraca)
                const rTotalEkuitas = rTotalEkuitasBase + dynLabaBersihYTD
                const rKasBank = calculateBalanceByCode('111', false, postedForNeraca) + calculateBalanceByCode('112', false, postedForNeraca)
                const rPiutang = calculateBalanceByCode('113', false, postedForNeraca) + calculateBalanceByCode('114', false, postedForNeraca)
                const rAsetLancar = rKasBank + rPiutang + calculateBalanceByCode('115', false, postedForNeraca)
                const rCurrentRatio = rTotalKewajiban > 0 ? (rAsetLancar / rTotalKewajiban) : 0
                const rDTE = rTotalEkuitas > 0 ? (rTotalKewajiban / rTotalEkuitas * 100) : 0
                const rNPM = dynTotalPendapatan > 0 ? (dynLabaBersih / dynTotalPendapatan * 100) : 0
                const rROA = rTotalAset > 0 ? (dynLabaBersih / rTotalAset * 100) : 0
                const rROE = rTotalEkuitas > 0 ? (dynLabaBersih / rTotalEkuitas * 100) : 0
                const rCashRatio = rTotalKewajiban > 0 ? (rKasBank / rTotalKewajiban) : 0
                const ratios = [
                    { name: 'Current Ratio', value: rCurrentRatio.toFixed(2), unit: 'x', color: rCurrentRatio > 1 ? 'var(--success)' : 'var(--danger)', desc: 'Aset Lancar / Kewajiban Lancar', interp: rCurrentRatio > 2 ? 'Sangat Baik' : rCurrentRatio > 1 ? 'Baik' : 'Buruk', badge: rCurrentRatio > 1 ? 'green' : 'red' },
                    { name: 'Debt to Equity', value: rDTE.toFixed(2), unit: '%', color: rDTE < 50 ? 'var(--success)' : 'var(--warning)', desc: 'Total Kewajiban / Total Ekuitas', interp: rDTE < 30 ? 'Rendah' : rDTE < 80 ? 'Sedang' : 'Tinggi', badge: rDTE < 50 ? 'green' : 'orange' },
                    { name: 'Net Profit Margin', value: rNPM.toFixed(1), unit: '%', color: rNPM >= 0 ? 'var(--success)' : 'var(--danger)', desc: 'Laba Bersih / Pendapatan', interp: rNPM > 10 ? 'Baik' : rNPM >= 0 ? 'Tipis' : 'Rugi', badge: rNPM >= 0 ? 'green' : 'red' },
                    { name: 'ROA', value: rROA.toFixed(2), unit: '%', color: rROA >= 0 ? 'var(--success)' : 'var(--danger)', desc: 'Laba Bersih / Total Aset', interp: rROA > 5 ? 'Baik' : rROA >= 0 ? 'Sedang' : 'Negatif', badge: rROA >= 0 ? 'green' : 'orange' },
                    { name: 'ROE', value: rROE.toFixed(2), unit: '%', color: rROE >= 0 ? 'var(--success)' : 'var(--danger)', desc: 'Laba Bersih / Total Ekuitas', interp: rROE > 10 ? 'Baik' : rROE >= 0 ? 'Sedang' : 'Negatif', badge: rROE >= 0 ? 'green' : 'orange' },
                    { name: 'Cash Ratio', value: rCashRatio.toFixed(2), unit: 'x', color: rCashRatio > 1 ? 'var(--success)' : 'var(--danger)', desc: 'Kas & Bank / Kewajiban Lancar', interp: rCashRatio > 1 ? 'Sangat Baik' : rCashRatio > 0.5 ? 'Cukup' : 'Rendah', badge: rCashRatio > 1 ? 'green' : 'orange' },
                ]
                const barData = { labels: ratios.map(r => r.name), datasets: [{ label: 'Nilai', data: ratios.map(r => parseFloat(r.value)), backgroundColor: ratios.map(r => r.color), borderRadius: 6 }] }
                const ekuitasPct = (rTotalEkuitas + rTotalKewajiban) > 0 ? (rTotalEkuitas / (rTotalEkuitas + rTotalKewajiban) * 100).toFixed(1) : '0'
                const kewajibanPct = (rTotalEkuitas + rTotalKewajiban) > 0 ? (rTotalKewajiban / (rTotalEkuitas + rTotalKewajiban) * 100).toFixed(1) : '0'
                return (
                    <>
                        <div className="report-doc" style={{ marginBottom: 24 }}>
                            <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div className="company">PERUMDA PASAR BAIMAN</div><h2>ANALISIS RASIO KEUANGAN</h2><div className="period">Periode {getPeriodLabel(selectedPeriod)} 2026</div></div><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={() => printReport('Analisis Rasio')}><Printer size={14} /> Cetak Laporan</button><button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }} onClick={exportAnalisis}><Download size={14} /> Unduh Excel (.xlsx)</button></div></div>
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
                                        {ratios.map((r, i) => (
                                            <tr key={i}><td style={{ fontWeight: 500 }}>{r.name}</td><td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.desc}</td><td className="text-right mono" style={{ fontWeight: 600, color: r.color }}>{r.value}{r.unit}</td><td className="text-center"><span className={`badge ${r.badge}`}>{r.interp}</span></td></tr>
                                        ))}
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
                                <div style={{ height: 280 }}><Doughnut data={{ labels: ['Ekuitas', 'Kewajiban'], datasets: [{ data: [rTotalEkuitas, rTotalKewajiban], backgroundColor: ['#10B981', '#E54D42'], borderWidth: 0, cutout: '60%' }] }} options={doughnutOpts} /></div>
                                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-around' }}>
                                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ekuitas</div><div style={{ fontWeight: 700, color: 'var(--success)' }}>{ekuitasPct}%</div></div>
                                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Kewajiban</div><div style={{ fontWeight: 700, color: 'var(--danger)' }}>{kewajibanPct}%</div></div>
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
            {activeTab === 'hpp' && <HPP state={state} journals={postedForLabaRugi} periodLabel={getPeriodLabel(selectedPeriod)} />}
            {activeTab === 'hpp-detail' && <HPPDetail state={state} journals={postedForLabaRugi} periodLabel={getPeriodLabel(selectedPeriod)} />}
            {activeTab === 'hpp-triwulan' && <HPPTriwulan state={state} journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} selectedPeriod={selectedPeriod} />}
            {activeTab === 'hpp-2bulan' && <HPP2Bulan state={state} journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} selectedPeriod={selectedPeriod} />}
            {activeTab === 'hpp-budget' && <HPPBudget state={state} journals={postedForLabaRugi} periodLabel={getPeriodLabel(selectedPeriod)} />}
            {activeTab === 'lacak-kilat' && <LacakKilat state={state} formatRupiah={formatRupiah} />}
            {activeTab === 'laporan-sortir' && <LaporanSortir state={state} formatRupiah={formatRupiah} />}
            {activeTab === 'penerimaan' && <Penerimaan state={state} journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} selectedPeriod={selectedPeriod} />}
            {activeTab === 'rekap-penerimaan' && <RekapPenerimaan state={state} journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} selectedPeriod={selectedPeriod} />}
            {activeTab === 'beban-umum' && <BebanUmum journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} selectedPeriod={selectedPeriod} />}
            {activeTab === 'rekap-beban-umum' && <RekapBebanUmum journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} selectedPeriod={selectedPeriod} />}
            {activeTab === 'beban-operasional' && <BebanOperasional journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} selectedPeriod={selectedPeriod} />}
            {activeTab === 'rekap-beban-ops' && <RekapBebanOperasional journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} selectedPeriod={selectedPeriod} />}
            {activeTab === 'beban-investasi' && <BebanInvestasi journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} selectedPeriod={selectedPeriod} />}
            {activeTab === 'rekap-beban-inv' && <RekapBebanInvestasi journals={postedForNeraca} periodLabel={getPeriodLabel(selectedPeriod)} selectedPeriod={selectedPeriod} />}
        </div>
    )
}
