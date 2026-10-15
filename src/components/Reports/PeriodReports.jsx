// PeriodReports.jsx
// Official period reports (Triwulan / Semester / Tahunan) uploaded by Bagian
// Keuangan, shown exactly as their workbook lays them out: the statements with
// their two columns (the period and the comparison the division chose) and the
// LRA tables with their own headers, numbering and totals. The parsed pack
// comes from src/utils/periodReport.js through /api/reports/period-reports.
import { useEffect, useState } from 'react'
import { FileCheck2, Printer, Download, Calculator, Trash2 } from 'lucide-react'
import { apiGetPeriodReport } from '../../services/api.js'
import { periodReportKey, lraRekapRows } from '../../utils/periodReport.js'
import { formatRupiah } from '../../data/sampleData.js'
import { printReport, exportReportTable, reportTableOf } from '../../utils/exportUtils.js'

// Packs already fetched, by key and upload time (a re-upload changes the time).
const packCache = new Map()

/**
 * The official pack for a period preset ('tw1', 's1', 'tahun'), when one is
 * on file. `periodReports` is the list kept in the app state.
 * → { meta, pack, loading, error } — meta is null when there is none.
 */
export function usePeriodReport(preset, periodReports) {
  const key = preset ? periodReportKey(preset) : null
  const meta = key ? (periodReports || []).find(r => r.period_key === key) || null : null
  const stamp = meta ? `${key}|${meta.updated_at || ''}` : null
  const [state, setState] = useState({ stamp: null, pack: null, loading: false, error: null })
  useEffect(() => {
    if (!stamp) return undefined
    if (packCache.has(stamp)) { setState({ stamp, pack: packCache.get(stamp), loading: false, error: null }); return undefined }
    let cancelled = false
    setState({ stamp, pack: null, loading: true, error: null })
    apiGetPeriodReport(key)
      .then(r => {
        if (cancelled) return
        const pack = r && r.data ? r.data : null
        if (pack) packCache.set(stamp, pack)
        setState({ stamp, pack, loading: false, error: pack ? null : 'data kosong' })
      })
      .catch(e => { if (!cancelled) setState({ stamp, pack: null, loading: false, error: e.message }) })
    return () => { cancelled = true }
  }, [stamp, key])
  const current = state.stamp === stamp
  return { key, meta, pack: current ? state.pack : null, loading: current && state.loading, error: current ? state.error : null }
}

function uploadedAt(meta) {
  if (!meta || !meta.updated_at) return ''
  const d = new Date(String(meta.updated_at).replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Banner above a report that has an official version: which version shows,
 * where it came from, and a switch to the app's own computation.
 */
export function PeriodReportBanner({ official, showApp, onToggle, onDelete, missingNote }) {
  const { meta, pack, loading, error } = official
  if (!meta) return null
  const label = (pack && pack.label) || meta.label || meta.period_key
  const when = uploadedAt(meta)
  const color = showApp ? 'rgba(99,102,241,' : 'rgba(16,185,129,'
  return (
    <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', marginBottom: 12, borderRadius: 10, fontSize: 13, background: `${color}0.08)`, border: `1px solid ${color}0.35)` }}>
      <FileCheck2 size={16} color={showApp ? 'var(--primary)' : 'var(--success)'} />
      <div style={{ flex: 1, minWidth: 240, lineHeight: 1.45 }}>
        {showApp
          ? <>Menampilkan <b>hitungan aplikasi</b> dari data bulanan. Laporan resmi <b>{label}</b> tersedia.</>
          : <><b>Laporan resmi {label}</b> — angka persis seperti berkas Bagian Keuangan
              {meta.file_name ? <> (<span className="mono" style={{ fontSize: 12 }}>{meta.file_name}</span>)</> : null}
              {when ? <>, diunggah {when}</> : null}.</>}
        {!showApp && missingNote ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{missingNote}</div> : null}
        {loading ? <span style={{ color: 'var(--text-muted)' }}> Memuat…</span> : null}
        {error ? <span style={{ color: 'var(--danger)' }}> Gagal memuat laporan resmi: {error}</span> : null}
      </div>
      <button className="btn btn-sm btn-outline" onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {showApp ? <><FileCheck2 size={14} /> Lihat laporan resmi</> : <><Calculator size={14} /> Lihat hitungan aplikasi</>}
      </button>
      {onDelete && !showApp ? (
        <button className="btn btn-sm btn-outline" onClick={onDelete} title="Hapus laporan resmi periode ini (data bulanan tidak berubah)"
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.4)' }}>
          <Trash2 size={14} /> Hapus
        </button>
      ) : null}
    </div>
  )
}

const headerBtnStyle = { color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }

const fileNameOf = (...parts) => parts.filter(Boolean).join('_').replace(/\s+/g, '_')

// ── Neraca / Laba Rugi / Arus Kas ────────────────────────────────────────────
function statementRowStyle(row) {
  const label = String(row.label || '')
  const upper = label.toUpperCase()
  const empty = row.values.every(v => v == null)
  const isNote = label.startsWith('*')
  const isTotal = /\b(JUMLAH|JUMAH|TOTAL)\b/.test(upper)
  const isResult = /^LABA \(RUGI\)|^KENAIKAN|AKHIR PERIODE$/.test(upper)
  const isSection = empty && !isNote && (row.depth === 0 || label === upper)
  const isSub = empty && !isNote && !isSection
  return { isNote, isTotal, isResult, isSection, isSub }
}

/** One official statement (Neraca, Laba Rugi or Arus Kas) of a period pack. */
export function OfficialStatement({ pack, report, docTitle }) {
  if (!report) return null
  const titleLines = [pack.company, report.title, report.subtitle]
  return (
    <div className="report-doc" style={{ marginBottom: 24 }}>
      <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="company">{pack.company || 'PERUMDA PASAR BAIMAN'}</div>
          <h2>{report.title || docTitle}</h2>
          <div className="period">{report.subtitle || pack.label}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" style={headerBtnStyle} onClick={() => printReport(`${docTitle} ${pack.label}`)}><Printer size={14} /> Cetak Laporan</button>
          <button className="btn btn-outline" style={headerBtnStyle}
            onClick={(e) => exportReportTable(reportTableOf(e), { filename: fileNameOf(docTitle, pack.label), sheetName: docTitle, titleLines })}>
            <Download size={14} /> Unduh Excel (.xlsx)
          </button>
        </div>
      </div>
      <div className="report-doc-body">
        <table>
          <thead>
            <tr>
              <th>Uraian</th>
              {report.columns.map((c, i) => <th key={i} className="text-right" style={{ width: 200 }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row, i) => {
              const s = statementRowStyle(row)
              if (s.isNote) {
                return <tr key={i}><td colSpan={1 + report.columns.length} style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)' }}>{row.label}</td></tr>
              }
              let background
              if (s.isSection) background = 'var(--bg-secondary)'
              if (s.isTotal) background = 'var(--border-light)'
              if (s.isResult) background = 'rgba(99,102,241,0.10)'
              return (
                <tr key={i} style={{
                  fontWeight: s.isSection || s.isSub || s.isTotal || s.isResult ? 700 : 400,
                  background,
                  borderTop: s.isTotal || s.isResult ? '2px solid var(--border)' : undefined,
                }}>
                  <td style={{ paddingLeft: 12 + (row.depth || 0) * 16 }}>{row.label}</td>
                  {row.values.map((v, k) => (
                    <td key={k} className="text-right mono" data-v={v == null ? '' : v}
                      style={{ color: v < 0 ? 'var(--danger)' : (k > 0 ? 'var(--text-muted)' : undefined) }}>
                      {v == null ? '' : formatRupiah(v)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── LRA tables ───────────────────────────────────────────────────────────────
const COLOR_GROUP = 'rgba(59,130,246,0.12)'
const COLOR_TOTAL = '#FEF9C3'
const headStyle = { fontSize: 11, lineHeight: 1.25, verticalAlign: 'middle', textAlign: 'center' }
const numStyle = { fontSize: 9, fontWeight: 400, color: 'var(--text-muted)', display: 'block' }

const isPctRole = (role) => role === 'capaian' || role === 'deviasi'
const fmtAmount = (v) => (Number(v) || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtPct = (v) => (Number(v) || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function ValueCell({ value, role, bold }) {
  if (value == null) return <td />
  const style = { fontWeight: bold ? 700 : 400, whiteSpace: 'nowrap', color: bold ? '#1E293B' : (value < 0 ? 'var(--danger)' : undefined) }
  if (isPctRole(role)) return <td className="text-right" data-v={value} style={style}>{fmtPct(value)}</td>
  return (
    <td className="text-right mono" data-v={value} style={style}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: bold ? '#64748B' : 'var(--text-muted)' }}>Rp</span>
        <span>{fmtAmount(value)}</span>
      </div>
    </td>
  )
}

const columnNote = (c) => [c.num, c.formula ? `= ${c.formula}` : ''].filter(Boolean).join(' ')

/** One official LRA table (Penerimaan, Investasi, Beban Umum, Beban Operasional). */
export function OfficialLraTable({ table }) {
  if (!table) return null
  const cols = table.columns
  const hasGroup = cols.some(c => c.group)
  const showNote = table.rows.some(r => r.penjelasan)
  const width = 2 + cols.length + (showNote ? 1 : 0)

  const head1 = [], head2 = []
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i]
    if (c.group) {
      let n = 1
      while (i + n < cols.length && cols[i + n].group === c.group) n++
      head1.push(<th key={`g${i}`} colSpan={n} style={headStyle}>{c.group}</th>)
      for (let k = i; k < i + n; k++) {
        head2.push(<th key={`s${k}`} style={headStyle}>{cols[k].label}<span style={numStyle}>{columnNote(cols[k])}</span></th>)
      }
      i += n - 1
    } else {
      head1.push(<th key={`c${i}`} rowSpan={hasGroup ? 2 : 1} style={headStyle}>{c.label}<span style={numStyle}>{columnNote(c)}</span></th>)
    }
  }

  return (
    <table style={{ fontSize: 12 }}>
      <thead>
        <tr>
          <th rowSpan={hasGroup ? 2 : 1} style={{ ...headStyle, width: '24%' }}>Program dan Kegiatan<span style={numStyle}>(3)</span></th>
          <th rowSpan={hasGroup ? 2 : 1} style={{ ...headStyle, width: '9%' }}>{table.kinerjaLabel || 'Kinerja Indikator'}<span style={numStyle}>(4)</span></th>
          {head1}
          {showNote ? <th rowSpan={hasGroup ? 2 : 1} style={{ ...headStyle, width: '9%' }}>Penjelasan dan Tindak Lanjut</th> : null}
        </tr>
        {hasGroup ? <tr>{head2}</tr> : null}
      </thead>
      <tbody>
        {table.rows.map((r, idx) => {
          const note = showNote ? <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.penjelasan}</td> : null
          if (r.kind === 'note') {
            return <tr key={idx}><td colSpan={width} style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)' }}>{r.nama}</td></tr>
          }
          if (r.kind === 'division' || r.kind === 'caption') {
            return (
              <tr key={idx} style={{ fontWeight: 700 }}>
                <td colSpan={width - (showNote ? 1 : 0)} style={{ paddingLeft: 12 }}>{r.nama}</td>{note}
              </tr>
            )
          }
          if (r.kind === 'group') {
            const depth = Math.max(0, r.depth)
            return (
              <tr key={idx} style={{ background: depth === 0 ? COLOR_GROUP : 'rgba(59,130,246,0.05)', fontWeight: depth === 0 ? 700 : 600 }}>
                <td colSpan={width - (showNote ? 1 : 0)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 + depth * 18 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 20, borderRadius: 4, background: depth === 0 ? 'var(--primary)' : 'var(--text-muted)', color: 'white', fontSize: 11, padding: '0 5px' }}>{r.outline}</span>
                    {r.nama}
                  </div>
                </td>
                {note}
              </tr>
            )
          }
          if (r.kind === 'total' || r.kind === 'grandtotal') {
            const grand = r.kind === 'grandtotal'
            return (
              <tr key={idx} style={{ background: COLOR_TOTAL, fontWeight: 700, fontSize: grand ? 12.5 : 12, color: '#1E293B' }}>
                <td colSpan={2} style={{ textAlign: grand ? 'left' : 'right', paddingLeft: 12, paddingRight: 12, color: '#1E293B' }}>{r.nama}</td>
                {r.values.map((v, k) => <ValueCell key={k} value={v} role={cols[k].role} bold />)}
                {note}
              </tr>
            )
          }
          // item / detail
          const depth = Math.max(0, r.depth)
          return (
            <tr key={idx} style={{ fontSize: 12 }}>
              <td style={{ paddingLeft: 20 + depth * 14 }}>
                {r.outline ? <span className="mono" style={{ color: 'var(--text-muted)', marginRight: 6 }}>{r.outline}</span> : null}
                {r.nama}
              </td>
              <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{r.kinerja}</td>
              {r.values.map((v, k) => <ValueCell key={k} value={v} role={cols[k].role} />)}
              {note}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Rekap view of an official LRA table, as the division's "Rekap …" sheets. */
export function OfficialLraRekap({ table }) {
  if (!table) return null
  const rows = lraRekapRows(table)
  const col = (role) => table.columns.find(c => c.role === role) || {}
  const realisasiLabel = col('current').label ? `Realisasi ${col('current').label}` : 'Realisasi'
  return (
    <table style={{ fontSize: 12 }}>
      <thead>
        <tr>
          <th style={{ width: '10%' }}>No/Kode</th>
          <th style={{ width: '38%' }}>Uraian</th>
          <th className="text-right" style={{ width: '15%' }}>{col('anggaran').label || 'Anggaran 1 Tahun'}</th>
          <th className="text-right" style={{ width: '15%' }}>{col('target').label || 'Target'}</th>
          <th className="text-right" style={{ width: '15%' }}>{realisasiLabel}</th>
          <th className="text-right" style={{ width: '7%' }}>%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const isTotal = r.kind === 'total' || r.kind === 'grandtotal'
          const isGroup = r.kind === 'group'
          const depth = Math.max(0, r.depth)
          return (
            <tr key={i} style={{
              fontWeight: isTotal || (isGroup && depth === 0) ? 700 : isGroup ? 600 : 400,
              background: isTotal ? COLOR_TOTAL : (isGroup && depth === 0 ? 'var(--bg-secondary)' : undefined),
              color: isTotal ? '#1E293B' : undefined,
            }}>
              <td className="mono" style={{ paddingLeft: 8 + depth * 14 }}>{r.outline}</td>
              <td style={{ paddingLeft: 8 + (isTotal ? 0 : depth * 12), textAlign: r.kind === 'total' ? 'right' : undefined }}>{r.nama}</td>
              {isGroup ? <><td /><td /><td /><td /></> : <>
                <td className="text-right mono" data-v={r.anggaran ?? ''}>{r.anggaran == null ? '' : formatRupiah(r.anggaran)}</td>
                <td className="text-right mono" data-v={r.target ?? ''}>{r.target == null ? '' : formatRupiah(r.target)}</td>
                <td className="text-right mono" data-v={r.realisasi ?? ''}>{r.realisasi == null ? '' : formatRupiah(r.realisasi)}</td>
                <td className="text-right" data-v={r.persen ?? ''}>{r.persen == null ? '' : fmtPct(r.persen)}</td>
              </>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
