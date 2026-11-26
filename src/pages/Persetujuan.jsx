// Persetujuan — the SPV Akuntansi / Manajer Keuangan post or return vouchers
// (spec 2026-11-25 §5.4; mockup "Persetujuan"). Inside Keuangan whatever the
// amount; a payment from Rp 1 jt needs the author's "sudah ditandatangani"
// tick. Posting your own voucher is a warning for now (one person enters and
// approves, owner 26 Nov 2026) unless Pengaturan forbids it (selfPostPolicy).
// The server enforces all of it — this page shows it before the click.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import { lineDestination, needsSignatureTick, sopSigner, VOUCHER_TYPES, selfPostPolicy } from '../utils/voucherRules.js'
import { checkBook } from '../utils/journalChecks.js'
import { formatTanggal } from '../utils/workingMonth.js'
import { formatRupiah } from '../data/sampleData.js'
import { CheckCircle2, Undo2, AlertTriangle } from 'lucide-react'

const amountOf = (j) => Math.max(Number(j.debit) || 0, Number(j.kredit) || 0)
const linesOf = (j) => { let l = j.lines; if (typeof l === 'string') { try { l = JSON.parse(l) } catch { l = [] } } return Array.isArray(l) ? l : [] }

function destinations(j) {
  const lines = linesOf(j)
  const codes = lines.map(l => String(l.akun_code))
  const out = []
  lines.forEach((l, i) => {
    if (String(l.akun_code) === String(j.cash_account || '')) return
    const d = lineDestination(l, { tanggal: j.tanggal, counterCodes: codes.filter((_, k) => k !== i) })
    const label = d.lra ? d.text.replace(/^Masuk ke LRA /, '').split(' · ')[0] : (d.neraca ? `Neraca: ${d.neraca}` : (d.lr ? `Laba Rugi: ${d.lr}` : ''))
    if (label && !out.includes(label)) out.push(label)
  })
  return out
}

export default function Persetujuan() {
  const { state, postVoucher, returnVoucher } = useApp()
  const me = state.session?.username || ''
  const privileged = ['admin', 'super_admin'].includes(state.session?.role)
  const forbidOwn = selfPostPolicy(state.pengaturan) === 'larang' && !privileged
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(() => new Set())
  const [focus, setFocus] = useState(null)
  const [returning, setReturning] = useState(null) // ids being returned
  const [note, setNote] = useState('')
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)

  const pending = useMemo(() => (state.journalsAll || [])
    .filter(j => j.voucher_type && j.status === 'pending')
    .sort((a, b) => String(a.submitted_at || a.tanggal).localeCompare(String(b.submitted_at || b.tanggal)) || String(a.id).localeCompare(String(b.id))),
  [state.journalsAll])

  // Findings per voucher: the month's checks, matched on No. Bukti.
  const findingsByNo = useMemo(() => {
    const m = new Map()
    const months = [...new Set(pending.map(j => String(j.tanggal).slice(0, 7)))]
    for (const ym of months) {
      const book = (state.journalsAll || []).filter(j => String(j.tanggal || '').slice(0, 7) === ym)
      let fs = []
      try { fs = checkBook(book, { period: ym, coa: state.coaFlat || [] }) } catch { fs = [] }
      for (const f of fs) {
        if (f.severity === 'info' || f.check === 'ttd-belum') continue
        for (const r of f.rows || []) {
          const key = `${ym}|${String(r.bukti || '').trim()}`
          m.set(key, [...new Set([...(m.get(key) || []), f.title])])
        }
      }
    }
    return m
  }, [pending, state.journalsAll, state.coaFlat])

  const rows = pending.map(j => {
    const amount = amountOf(j)
    const tick = needsSignatureTick(amount, j.voucher_type)
    const own = !!me && j.created_by === me
    const findings = findingsByNo.get(`${String(j.tanggal).slice(0, 7)}|${String(j.voucher_no || j.bukti || '').trim()}`) || []
    return { j, amount, tick, signed: !!Number(j.sop_signed), own, ownBlocked: own && forbidOwn, findings, dest: destinations(j) }
  })
  const shown = rows.filter(r =>
    filter === 'all' ? true
      : filter === 'temuan' ? r.findings.length > 0
        : filter === 'ttd' ? (r.tick && !r.signed)
          : r.amount >= 50000000)
  const counts = {
    all: rows.length,
    temuan: rows.filter(r => r.findings.length).length,
    ttd: rows.filter(r => r.tick && !r.signed).length,
    big: rows.filter(r => r.amount >= 50000000).length,
  }
  const canPost = (r) => !r.ownBlocked && (!r.tick || r.signed)
  const sel = shown.filter(r => selected.has(r.j.id))
  const selSum = sel.reduce((s, r) => s + r.amount, 0)
  const selOwn = sel.filter(r => r.own).length
  const toggle = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function postMany(list) {
    setBusy(true)
    const out = []
    for (const r of list) {
      try {
        const res = await postVoucher(r.j.id)
        out.push({ ok: true, text: `${r.j.voucher_no} diposting.` })
        for (const w of (res && res.warnings) || []) out.push({ ok: true, warn: true, text: w })
      } catch (e) { out.push({ ok: false, text: `${r.j.voucher_no}: ${e.message}` }) }
    }
    setMessages(out); setSelected(new Set()); setFocus(null); setBusy(false)
  }
  async function returnMany(ids) {
    if (!note.trim()) return
    setBusy(true)
    const out = []
    for (const id of ids) {
      const r = rows.find(x => x.j.id === id)
      try { await returnVoucher(id, note.trim()); out.push({ ok: true, text: `${r ? r.j.voucher_no : id} dikembalikan ke ${r ? r.j.created_by || 'penginput' : 'penginput'}.` }) } catch (e) { out.push({ ok: false, text: `${r ? r.j.voucher_no : id}: ${e.message}` }) }
    }
    setMessages(out); setReturning(null); setNote(''); setSelected(new Set()); setFocus(null); setBusy(false)
  }

  const focused = rows.find(r => r.j.id === focus)
  const chip = (key, label) => (
    <button type="button" key={key} className={`db-chip ${filter === key ? '' : 'gray'}`} style={{ cursor: 'pointer', border: 0 }} onClick={() => setFilter(key)}>{label} ({counts[key]})</button>
  )

  return (
    <div className="db-page" id="persetujuan">
      <div className="db-head">
        <div>
          <h1>Persetujuan</h1>
          <p>{rows.length} voucher menunggu · {formatRupiah(rows.reduce((s, r) => s + r.amount, 0))}. Untuk SPV Akuntansi dan Manajer Keuangan.</p>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="db-note" style={{ marginBottom: 12 }}>
          {messages.map((m, i) => <div key={i} style={{ color: m.warn ? 'var(--warning)' : m.ok ? 'var(--success)' : 'var(--danger)' }}>{m.warn ? '⚠' : m.ok ? '✓' : '✕'} {m.text}</div>)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {chip('all', 'Semua')}{chip('temuan', 'Ada temuan')}{chip('ttd', 'Tanda tangan belum dikonfirmasi')}{chip('big', 'Rp 50 jt ke atas')}
      </div>

      <div className="db-card" style={{ padding: '6px 8px' }}>
        {shown.length === 0 ? (
          <div style={{ padding: 18 }} className="db-muted">Tidak ada voucher yang menunggu persetujuan{filter !== 'all' ? ' dengan saringan ini' : ''}.</div>
        ) : (
          <div className="db-tw">
            <table className="db-table" id="tabel-persetujuan">
              <thead><tr><th /><th>No.</th><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th className="r">Jumlah</th><th>Masuk ke laporan</th><th>Bukti fisik (SOP)</th><th>Diinput</th></tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.j.id} style={{ cursor: 'pointer', background: focus === r.j.id ? 'color-mix(in srgb, var(--primary) 6%, transparent)' : undefined }} onClick={() => setFocus(r.j.id)}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Pilih ${r.j.voucher_no}`} checked={selected.has(r.j.id)} disabled={!canPost(r)} title={r.ownBlocked ? 'Voucher Anda sendiri' : (!canPost(r) ? 'Tanda tangan belum dikonfirmasi' : undefined)} onChange={() => toggle(r.j.id)} style={{ width: 16, height: 16 }} />
                    </td>
                    <td className="db-num">{r.j.voucher_no}</td>
                    <td className="db-num">{formatTanggal(r.j.tanggal)}</td>
                    <td><span className="db-chip gray">{r.j.voucher_type}</span></td>
                    <td>{r.j.keterangan}{r.j.party ? <div className="db-muted" style={{ fontSize: 12 }}>{r.j.party}</div> : null}</td>
                    <td className="r db-num">{formatRupiah(r.amount)}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 260 }}>
                      {r.dest.join(' · ') || '—'}
                      {r.findings.map(t => <div key={t}><span className="db-chip warn" style={{ marginTop: 4 }}>temuan: {t}</span></div>)}
                    </td>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {!r.tick ? <span className="db-muted">{r.j.voucher_type === 'KK' || r.j.voucher_type === 'BK' ? 'Manajer' : '—'}</span>
                        : r.signed ? <span style={{ color: 'var(--success)' }}>✓ {sopSigner(r.amount)}</span>
                          : <span style={{ color: 'var(--warning)', fontWeight: 600 }}>⚠ {sopSigner(r.amount)}: belum dikonfirmasi</span>}
                    </td>
                    <td>{r.j.created_by || '—'}{r.own ? (r.ownBlocked ? <div className="db-muted" style={{ fontSize: 11.5 }}>voucher Anda</div> : <div><span className="db-chip warn" style={{ marginTop: 4 }} title="Penginput dan penyetuju orang yang sama: boleh, dengan peringatan">voucher Anda</span></div>) : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sel.length > 0 && (
        <div className="db-card" style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--primary-light)' }}>
          <b id="sel-info">{sel.length} dipilih · {formatRupiah(selSum)}</b>
          {selOwn > 0 && <span id="sel-own" style={{ color: 'var(--warning)', fontSize: 13 }}><AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> {selOwn === sel.length ? 'Semua' : selOwn} voucher Anda input sendiri: boleh diposting, dengan peringatan, dan tercatat di Cek Data.</span>}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setReturning(sel.map(r => r.j.id)); setNote('') }}><Undo2 size={15} /> Kembalikan dengan catatan</button>
          <button type="button" id="btn-posting" className="btn btn-primary" disabled={busy} onClick={() => postMany(sel)}><CheckCircle2 size={15} /> Setujui &amp; posting</button>
        </div>
      )}

      {returning && (
        <div className="db-card" style={{ marginTop: 12 }}>
          <b>Kembalikan {returning.length} voucher dengan catatan</b>
          <textarea id="catatan-kembali" className="form-input" rows={3} style={{ width: '100%', marginTop: 8 }} placeholder="Apa yang harus diperbaiki penginput?" value={note} onChange={e => setNote(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-outline" onClick={() => setReturning(null)}>Batal</button>
            <button type="button" id="btn-kembalikan" className="btn btn-primary" disabled={busy || !note.trim()} onClick={() => returnMany(returning)}>Kembalikan</button>
          </div>
        </div>
      )}

      {focused && (
        <div className="db-card" style={{ marginTop: 16 }} id="detail-voucher">
          <div className="db-head" style={{ marginBottom: 6 }}>
            <div>
              <h2>{focused.j.voucher_no} · {VOUCHER_TYPES[focused.j.voucher_type]?.label} · {focused.j.keterangan}</h2>
              <p style={{ fontSize: 13 }}>{formatTanggal(focused.j.tanggal)} · diinput {focused.j.created_by || '—'} · {formatRupiah(focused.amount)}</p>
            </div>
            {focused.tick && !focused.signed && <span className="db-chip bad">Tanda tangan {sopSigner(focused.amount)} belum dikonfirmasi</span>}
          </div>
          <table className="db-table">
            <tbody>
              {linesOf(focused.j).map((l, i, all) => {
                const d = lineDestination(l, { tanggal: focused.j.tanggal, counterCodes: all.map(x => String(x.akun_code)).filter((_, k) => k !== i) })
                return (
                  <tr key={i}>
                    <td style={{ width: 26 }} className="db-muted"><b>{Number(l.debit) ? 'D' : 'K'}</b></td>
                    <td>{l.akun_code} {l.akun_name}{l.sub_akun ? ` › ${l.sub_akun}` : ''}<div className="db-muted" style={{ fontSize: 12.5 }}>{d.text}</div></td>
                    <td className="r db-num">{formatRupiah(Number(l.debit) || Number(l.kredit) || 0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {focused.own && (focused.ownBlocked
            ? <div className="db-note" style={{ marginTop: 10 }}><AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> Ini voucher Anda sendiri: rekan lain yang menyetujuinya (pemisahan tugas).</div>
            : <div className="db-note" id="peringatan-sendiri" style={{ marginTop: 10, color: 'var(--warning)' }}><AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> Voucher ini Anda input sendiri. SOP: penyetuju sebaiknya orang lain. Boleh diposting; aplikasi mencatatnya di Cek Data.</div>)}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setReturning([focused.j.id]); setNote(focused.tick && !focused.signed ? `Mohon lengkapi tanda tangan ${sopSigner(focused.amount)} pada bukti, lalu ajukan ulang.` : '') }}><Undo2 size={15} /> Kembalikan ke {focused.j.created_by || 'penginput'}</button>
            <button type="button" className="btn btn-primary" disabled={busy || !canPost(focused)} title={!canPost(focused) ? (focused.ownBlocked ? 'Voucher Anda sendiri' : 'Konfirmasi tanda tangan dulu') : undefined} onClick={() => postMany([focused])}><CheckCircle2 size={15} /> Setujui</button>
            <Link className="btn btn-outline" to={`/daftar-voucher?q=${encodeURIComponent(focused.j.voucher_no || '')}`}>Lihat di Daftar Voucher</Link>
          </div>
        </div>
      )}
      <p className="db-muted" style={{ fontSize: 12.5, marginTop: 12 }}>Voucher yang disetujui langsung masuk Buku Besar dan semua laporan. Yang dikembalikan kembali ke penginput dengan catatan. Aplikasi mencatat siapa menginput dan siapa menyetujui.</p>
    </div>
  )
}
