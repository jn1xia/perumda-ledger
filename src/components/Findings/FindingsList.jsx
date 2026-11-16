// FindingsList — the "Hasil pemeriksaan" of a journal book (journalChecks.js),
// grouped by severity, each finding opening to the rows behind it. Used in the
// import dialog (before upload) and on Cek Konsistensi (stored months, with
// "Tandai sudah dicek").
import { useState } from 'react'
import { XCircle, AlertTriangle, Info, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import { formatRupiah } from '../../data/sampleData.js'

export const SEVERITY_STYLE = {
  salah:   { icon: XCircle, color: 'var(--danger, #dc2626)', bg: 'rgba(239,68,68,0.08)', label: 'Salah', hint: 'laporan salah sampai diperbaiki' },
  periksa: { icon: AlertTriangle, color: 'var(--warning, #d97706)', bg: 'rgba(251,191,36,0.10)', label: 'Periksa', hint: 'satu baris laporan bergantung pada ini' },
  info:    { icon: Info, color: 'var(--primary, #4f46e5)', bg: 'rgba(99,102,241,0.06)', label: 'Info', hint: 'untuk diketahui' },
}

function RowsTable({ rows, rowCount }) {
  if (!rows || !rows.length) return null
  const cell = { padding: '3px 8px', borderBottom: '1px solid var(--border-light, #e5e7eb)', verticalAlign: 'top' }
  return (
    <div style={{ overflowX: 'auto', marginTop: 6 }}>
      <table style={{ fontSize: 11.5, borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
          <th style={cell}>Tanggal</th><th style={cell}>Voucher</th><th style={cell}>Akun</th>
          <th style={{ ...cell, textAlign: 'right' }}>Debit</th><th style={{ ...cell, textAlign: 'right' }}>Kredit</th><th style={cell}>Keterangan</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...cell, whiteSpace: 'nowrap' }}>{r.tanggal}</td>
              <td style={cell}>{r.bukti || '–'}</td>
              <td style={cell}>{r.akun}</td>
              <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }} className="mono">{r.debit ? formatRupiah(r.debit) : ''}</td>
              <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }} className="mono">{r.kredit ? formatRupiah(r.kredit) : ''}</td>
              <td style={cell}>{r.keterangan}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rowCount > rows.length && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>… dan {rowCount - rows.length} baris lainnya</div>}
    </div>
  )
}

function FindingItem({ f, acked, ackNote, onAck, onUnack }) {
  const [open, setOpen] = useState(false)
  const s = SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.info
  const Icon = s.icon
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div style={{ padding: '8px 10px', background: acked ? 'transparent' : s.bg, borderBottom: '1px solid var(--border-light, #e5e7eb)', opacity: acked ? 0.65 : 1 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Icon size={15} style={{ color: s.color, flexShrink: 0, marginTop: 2 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <button type="button" onClick={() => setOpen(o => !o)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Chevron size={13} /> {f.title}
          </button>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{f.detail}</div>
          {open && (
            <>
              <div style={{ fontSize: 12, marginTop: 4 }}><strong>Yang perlu dilakukan:</strong> {f.action}</div>
              <RowsTable rows={f.rows} rowCount={f.rowCount} />
            </>
          )}
          {acked && <div style={{ fontSize: 11, color: 'var(--success, #059669)', marginTop: 3 }}><CheckCircle2 size={11} /> Sudah dicek{ackNote ? `: ${ackNote}` : ''}</div>}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: s.color, flexShrink: 0 }}>{s.label}</span>
        {(onAck || onUnack) && f.severity !== 'salah' && (
          acked
            ? <button type="button" className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }} onClick={() => onUnack(f)}>Batalkan</button>
            : <button type="button" className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }} onClick={() => onAck(f)}>Tandai sudah dicek</button>
        )}
      </div>
    </div>
  )
}

/**
 * @param findings  Finding[] (journalChecks.checkBook)
 * @param acks      Map key → note for this month (optional)
 * @param onAck / onUnack  (finding) => void (optional; no buttons without them)
 * @param emptyText text when there is nothing to report
 */
export default function FindingsList({ findings, acks, onAck, onUnack, emptyText = 'Tidak ada temuan.' }) {
  if (!findings || !findings.length) {
    return <div style={{ fontSize: 12.5, color: 'var(--success, #059669)', display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14} /> {emptyText}</div>
  }
  const counts = { salah: 0, periksa: 0, info: 0 }
  findings.forEach(f => { counts[f.severity] = (counts[f.severity] || 0) + 1 })
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {['salah', 'periksa', 'info'].filter(k => counts[k]).map(k => (
          <span key={k} style={{ color: SEVERITY_STYLE[k].color, fontWeight: 600 }} title={SEVERITY_STYLE[k].hint}>{counts[k]} {SEVERITY_STYLE[k].label.toLowerCase()}</span>
        ))}
        <span style={{ color: 'var(--text-muted)' }}>Klik judul untuk melihat baris jurnalnya.</span>
      </div>
      <div style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, overflow: 'hidden', maxHeight: 360, overflowY: 'auto' }}>
        {findings.map(f => (
          <FindingItem key={f.key} f={f} acked={!!(acks && acks.has(f.key))} ackNote={acks && acks.get(f.key)} onAck={onAck} onUnack={onUnack} />
        ))}
      </div>
    </div>
  )
}
