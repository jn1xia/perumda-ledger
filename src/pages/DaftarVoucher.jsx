// Daftar Voucher — the working month's vouchers and journals, 50 per page
// (spec 2026-11-25 §5.5): status and type filters, search (?q= from the top
// bar searches every month), dates "14 Jan 2027", the real column names.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import { VOUCHER_TYPES, lineDestination } from '../utils/voucherRules.js'
import { bulanLabel, formatTanggal } from '../utils/workingMonth.js'
import { jurnalUntukExcel, jurnalWorkbook } from '../utils/jurnalExport.js'
import { formatRupiah } from '../data/sampleData.js'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { Plus, FileSpreadsheet } from 'lucide-react'

const PAGE = 50
const STATUS = {
  draft: ['Draf', 'gray'], pending: ['Diajukan', 'warn'], returned: ['Dikembalikan', 'bad'], posted: ['Diposting', 'ok'],
}
const linesOf = (j) => { let l = j.lines; if (typeof l === 'string') { try { l = JSON.parse(l) } catch { l = [] } } return Array.isArray(l) ? l : (j.journal_lines || []) }
const amountOf = (j) => Math.max(Number(j.debit) || 0, Number(j.kredit) || 0)

export default function DaftarVoucher() {
  const { state, submitVoucher, deleteVoucher } = useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') || '').trim()
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState(null)
  const [msg, setMsg] = useState(null)
  const me = state.session?.username || ''
  const role = state.session?.role || ''
  const approver = ['spv_akuntansi', 'manager_keuangan', 'admin', 'super_admin'].includes(role)
  const ym = state.workingMonth

  useEffect(() => { setPage(0) }, [q, status, type, ym])

  const list = useMemo(() => {
    const all = state.journalsAll || []
    const needle = q.toLowerCase()
    const base = q
      ? all.filter(j => {
        const text = [j.id, j.voucher_no, j.bukti, j.keterangan, j.party, j.akun_debit, j.akun_kredit,
          ...linesOf(j).flatMap(l => [l.akun_code, l.akun_name, l.sub_akun, l.keterangan])].join(' ').toLowerCase()
        return text.includes(needle)
      })
      : all.filter(j => String(j.tanggal || '').startsWith(ym))
    return base
      .filter(j => status === 'all' || j.status === status)
      .filter(j => type === 'all' || (type === 'excel' ? !j.voucher_type : j.voucher_type === type))
      .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)) || String(b.voucher_no || b.bukti || '').localeCompare(String(a.voucher_no || a.bukti || '')))
  }, [state.journalsAll, q, ym, status, type])

  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const shown = list.slice(page * PAGE, page * PAGE + PAGE)
  const mayEdit = (j) => j.voucher_type && ['draft', 'returned'].includes(j.status) && (approver || j.created_by === me)
  const mayDelete = (j) => j.voucher_type && ['draft', 'returned'].includes(j.status) && (['admin', 'super_admin'].includes(role) || j.created_by === me)

  async function act(fn, okText) {
    try { await fn(); setMsg({ ok: true, text: okText }) } catch (e) { setMsg({ ok: false, text: e.message }) }
  }

  // "JURNAL untuk Excel": the month's posted vouchers in the workbook's JURNAL
  // columns, to paste below the month's Excel rows (utils/jurnalExport.js).
  function exportJurnal() {
    try {
      const names = new Map((state.coaFlat || []).map(a => [String(a.code), a.name]))
      const r = jurnalUntukExcel(state.journalsAll || [], ym, { coaName: (c) => names.get(String(c)) || '' })
      if (!r.rows.length) {
        setMsg({ ok: false, text: `Belum ada voucher yang diposting di ${bulanLabel(ym)}.${r.notPosted.length ? ` ${r.notPosted.length} voucher belum diposting.` : ''}` })
        return
      }
      const out = XLSX.write(jurnalWorkbook(XLSX, r, ym), { bookType: 'xlsx', type: 'array' })
      saveAs(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `JURNAL ${bulanLabel(ym).toUpperCase()} dari aplikasi.xlsx`)
      const check = r.newNames.length + r.newSubs.length + r.moved.length
      setMsg({ ok: true, text: `${r.vouchers} voucher (${r.rows.length} baris, Debit = Kredit ${formatRupiah(r.debit)}) diekspor untuk sheet JURNAL ${bulanLabel(ym)}.`
        + (r.notPosted.length ? ` ${r.notPosted.length} voucher belum diposting tidak ikut.` : '')
        + (check ? ` Periksa ${check} akun / Sub Akun di sheet Ringkasan: belum pernah ada di JURNAL Excel, atau di JURNAL ${bulanLabel(r.latestExcelYm)} dicatat di akun lain.` : '') })
    } catch (e) { setMsg({ ok: false, text: `Gagal membuat file: ${e.message}` }) }
  }

  return (
    <div className="db-page" id="daftar-voucher">
      <div className="db-head">
        <div>
          <h1>Daftar Voucher</h1>
          <p>{q ? <>Hasil pencarian "<b>{q}</b>" di semua bulan · <button type="button" className="link-btn" onClick={() => setParams({})}>hapus pencarian</button></> : <>{bulanLabel(ym)} · {list.length} jurnal</>}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" id="btn-jurnal-excel" className="btn btn-outline" onClick={exportJurnal} title={`Voucher yang sudah diposting di ${bulanLabel(ym)}, dalam kolom sheet JURNAL workbook (A sampai I), untuk ditempel di bawah baris Excel`}><FileSpreadsheet size={15} /> JURNAL untuk Excel</button>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/input-voucher')}><Plus size={15} /> Input voucher</button>
        </div>
      </div>

      {msg && <div className="db-note" style={{ marginBottom: 12, color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>{msg.ok ? '✓' : '✕'} {msg.text}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select className="form-input" style={{ width: 'auto' }} value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
          <option value="all">Semua status</option>
          {Object.entries(STATUS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select className="form-input" style={{ width: 'auto' }} value={type} onChange={e => setType(e.target.value)} aria-label="Jenis">
          <option value="all">Semua jenis</option>
          {Object.entries(VOUCHER_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label} ({k})</option>)}
          <option value="excel">Dari Excel</option>
        </select>
      </div>

      <div className="db-card" style={{ padding: '6px 8px' }}>
        {shown.length === 0 ? <div className="db-muted" style={{ padding: 18 }}>Belum ada jurnal{q ? ' yang cocok' : ` di ${bulanLabel(ym)}`}.</div> : (
          <div className="db-tw">
            <table className="db-table" id="tabel-voucher">
              <thead><tr><th>No. Bukti</th><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th className="r">Jumlah</th><th>Status</th><th>Diinput</th><th /></tr></thead>
              <tbody>
                {shown.map(j => {
                  const st = STATUS[j.status] || [j.status, 'gray']
                  const isOpen = open === j.id
                  return [
                    <tr key={j.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(isOpen ? null : j.id)}>
                      <td className="db-num">{j.voucher_no || j.bukti || '—'}</td>
                      <td className="db-num">{formatTanggal(j.tanggal)}</td>
                      <td>{j.voucher_type ? VOUCHER_TYPES[j.voucher_type]?.label : <span className="db-muted">Excel</span>}</td>
                      <td>{j.keterangan}{j.status === 'returned' && j.returned_note ? <div style={{ fontSize: 12, color: 'var(--danger)' }}>Dikembalikan: {j.returned_note}</div> : null}</td>
                      <td className="r db-num">{formatRupiah(amountOf(j))}</td>
                      <td><span className={`db-chip ${st[1]}`}>{st[0]}</span></td>
                      <td>{j.created_by || <span className="db-muted">—</span>}{j.approved_by ? <div className="db-muted" style={{ fontSize: 11.5 }}>disetujui {j.approved_by}</div> : null}</td>
                      <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                        {mayEdit(j) && <button type="button" className="btn btn-sm btn-outline" onClick={() => navigate(`/input-voucher?id=${encodeURIComponent(j.id)}`)}>Ubah</button>}{' '}
                        {mayEdit(j) && j.created_by === me && <button type="button" className="btn btn-sm btn-outline" onClick={() => act(() => submitVoucher(j.id), `${j.voucher_no} diajukan.`)}>Ajukan</button>}{' '}
                        {mayDelete(j) && <button type="button" className="btn btn-sm btn-outline" onClick={() => { if (window.confirm(`Hapus draf ${j.voucher_no}?`)) act(() => deleteVoucher(j.id), `${j.voucher_no} dihapus.`) }}>Hapus</button>}
                      </td>
                    </tr>,
                    isOpen && (
                      <tr key={`${j.id}-d`}><td colSpan={8} style={{ background: 'var(--bg)' }}>
                        {linesOf(j).map((l, i, all) => {
                          const d = lineDestination(l, { tanggal: j.tanggal, counterCodes: all.map(x => String(x.akun_code)).filter((_, k) => k !== i) })
                          return (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 8, padding: '4px 0', fontSize: 12.5 }}>
                              <b className="db-muted">{Number(l.debit) ? 'D' : 'K'}</b>
                              <span>{l.akun_code} {l.akun_name}{l.sub_akun ? ` › ${l.sub_akun}` : ''}{d.text ? <span className="db-muted"> — {d.text}</span> : null}</span>
                              <span className="db-num">{formatRupiah(Number(l.debit) || Number(l.kredit) || 0)}</span>
                            </div>
                          )
                        })}
                      </td></tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <button type="button" className="btn btn-sm btn-outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Sebelumnya</button>
          <span className="db-sec" style={{ fontSize: 13 }}>Halaman {page + 1} dari {pages} · {list.length} jurnal</span>
          <button type="button" className="btn btn-sm btn-outline" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Berikutnya ›</button>
        </div>
      )}
    </div>
  )
}
