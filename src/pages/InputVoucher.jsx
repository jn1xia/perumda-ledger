// Input Voucher — daily bookkeeping (spec 2026-11-25 §5.3; mockup "Input Voucher").
// Every line shows where it lands in the reports while it is typed, and the
// problems that block it come from voucherRules.js — the same rules the server
// applies — so what this page refuses is exactly what the server refuses.
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import { apiNextVoucherNo } from '../services/api.js'
import {
  VOUCHER_TYPES, lineDestination, voucherProblems, sopSigner, needsSignatureTick, isCashCode,
} from '../utils/voucherRules.js'
import { dailyBookStart } from '../utils/bookYear.js'
import { normalizeLocked, bulanLabel, formatTanggal } from '../utils/workingMonth.js'
import { formatRupiah } from '../data/sampleData.js'
import { Plus, Trash2, Copy, Save, Send, AlertTriangle, CheckCircle2 } from 'lucide-react'

const TYPE_ORDER = ['KK', 'KM', 'BK', 'BM', 'JM']
const DEFAULT_CASH = { KK: '11101', KM: '11101', BK: '11104', BM: '11104' }
const emptyLine = () => ({ akun_code: '', sub_akun: '', kategori: '', keterangan: '', jumlah: '', debit: '', kredit: '' })
const digits = (s) => Number(String(s ?? '').replace(/[^\d]/g, '')) || 0
const fmtNum = (n) => (n ? Number(n).toLocaleString('id-ID') : '')
const todayISO = () => new Date().toISOString().slice(0, 10)

function parseLines(j) {
  let lines = j.lines
  if (typeof lines === 'string') { try { lines = JSON.parse(lines) } catch { lines = [] } }
  return Array.isArray(lines) ? lines : []
}

/** A stored voucher back into the form's shape (the cash leg is not a typed line). */
function voucherToForm(j) {
  const type = j.voucher_type
  const lines = parseLines(j)
  const cash = j.cash_account || ''
  const typed = VOUCHER_TYPES[type]?.cashSide
    ? lines.filter((l, i) => !(String(l.akun_code) === String(cash) && (i === 0 || i === lines.length - 1)))
    : lines
  return {
    voucher_type: type, voucher_no: j.voucher_no || j.bukti || '', autoNo: false, tanggal: j.tanggal, cash_account: cash,
    party: j.party || '', keterangan: j.keterangan || '', sop_signed: !!Number(j.sop_signed),
    lines: typed.map(l => ({
      akun_code: String(l.akun_code || ''), sub_akun: l.sub_akun || '', kategori: l.kategori || '', keterangan: l.keterangan || '',
      jumlah: VOUCHER_TYPES[type]?.cashSide ? String(Number(l.debit) || Number(l.kredit) || '') : '',
      debit: Number(l.debit) ? String(l.debit) : '', kredit: Number(l.kredit) ? String(l.kredit) : '',
    })),
  }
}

export default function InputVoucher() {
  const { state, saveVoucher } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('id')
  const startDate = dailyBookStart(state.pengaturan)
  const me = state.session?.username || ''

  const coa = useMemo(() => (state.coaFlat || []).filter(a => /^\d{5}$/.test(String(a.code))), [state.coaFlat])
  const coaName = useMemo(() => { const m = new Map(coa.map(a => [String(a.code), a.name])); return (c) => m.get(String(c)) || '' }, [coa])
  const cashAccounts = useMemo(() => coa.filter(a => isCashCode(a.code)), [coa])
  const subAkunByCode = useMemo(() => {
    const m = new Map()
    for (const s of state.subAkun || []) {
      if (s.active !== undefined && s.active !== null && !Number(s.active)) continue
      const k = String(s.account_code)
      m.set(k, [...(m.get(k) || []), s.name])
    }
    return m
  }, [state.subAkun])
  const vouchers = useMemo(() => (state.journalsAll || []).filter(j => j.voucher_type), [state.journalsAll])
  const editing = useMemo(() => (editId ? vouchers.find(v => v.id === editId) : null), [editId, vouchers])

  const defaultDate = () => {
    const t = todayISO()
    const wm = state.workingMonth || t.slice(0, 7)
    if (t.slice(0, 7) === wm && t >= startDate) return t
    const first = `${wm}-01`
    return first < startDate ? startDate : first
  }
  const blank = (type = 'KK') => ({
    voucher_type: type, voucher_no: '', autoNo: true, tanggal: defaultDate(), cash_account: DEFAULT_CASH[type] || '',
    party: '', keterangan: '', sop_signed: false, lines: [emptyLine()],
  })
  const [v, setV] = useState(() => blank())
  const [serverProblems, setServerProblems] = useState([])
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)
  const lastAmountRef = useRef(null)

  // Load the voucher being edited (draft or returned).
  useEffect(() => { if (editing) setV(voucherToForm(editing)) }, [editing])

  // Next free number for the year of the date (new vouchers only). Each year
  // has its own running number: an auto-filled number follows the date's year;
  // a number typed by hand (to match the paper) stays.
  const year = String(v.tanggal || '').slice(0, 4)
  useEffect(() => {
    if (editId || !/^\d{4}$/.test(year)) return
    let alive = true
    apiNextVoucherNo(year).then(r => { if (alive && r && r.next) setV(x => (x.voucher_no && !x.autoNo ? x : { ...x, voucher_no: r.next, autoNo: true })) }).catch(() => {})
    return () => { alive = false }
  }, [year, editId, saved])

  const type = VOUCHER_TYPES[v.voucher_type] || VOUCHER_TYPES.KK
  const usedNos = useMemo(() => vouchers.filter(j => String(j.voucher_year || String(j.tanggal).slice(0, 4)) === year && j.id !== editId).map(j => j.voucher_no || j.bukti), [vouchers, year, editId])
  const ctx = useMemo(() => ({
    coaCodes: new Set(coa.map(a => String(a.code))), coaName, subAkunByCode,
    lockedPeriods: normalizeLocked(state.lockedPeriods), usedNos, startDate,
  }), [coa, coaName, subAkunByCode, state.lockedPeriods, usedNos, startDate])

  const body = useMemo(() => ({
    ...Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'autoNo')),
    lines: v.lines.map(l => ({
      akun_code: String(l.akun_code || '').trim(), akun_name: coaName(l.akun_code), sub_akun: l.sub_akun, kategori: l.kategori,
      keterangan: l.keterangan,
      ...(type.cashSide ? { jumlah: digits(l.jumlah) } : { debit: digits(l.debit), kredit: digits(l.kredit) }),
    })),
  }), [v, type, coaName])
  const problems = useMemo(() => voucherProblems(body, ctx), [body, ctx])
  const total = type.cashSide
    ? body.lines.reduce((s, l) => s + (l.jumlah || 0), 0)
    : body.lines.reduce((s, l) => s + (l.debit || 0), 0)
  const kreditTotal = type.cashSide ? total : body.lines.reduce((s, l) => s + (l.kredit || 0), 0)
  const balanced = Math.abs(total - kreditTotal) < 0.005
  const needTick = needsSignatureTick(total, v.voucher_type)
  const isPayment = v.voucher_type === 'KK' || v.voucher_type === 'BK'
  const counter = (i) => [v.cash_account, ...body.lines.filter((_, k) => k !== i).map(l => l.akun_code)].filter(Boolean)
  const dests = body.lines.map((l, i) => {
    if (!l.akun_code || !coaName(l.akun_code)) return null
    const side = type.cashSide === 'kredit' ? { debit: l.jumlah || 1, kredit: 0 } : type.cashSide === 'debit' ? { debit: 0, kredit: l.jumlah || 1 } : { debit: l.debit, kredit: l.kredit }
    return lineDestination({ ...l, ...side }, { tanggal: v.tanggal, counterCodes: counter(i) })
  })
  const byLine = (n) => problems.filter(p => p.line === n)

  const set = (patch) => { setSaved(null); setServerProblems([]); setV(x => ({ ...x, ...patch })) }
  const setLine = (i, patch) => set({ lines: v.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) })
  const addLine = () => set({ lines: [...v.lines, emptyLine()] })
  const removeLine = (i) => set({ lines: v.lines.length > 1 ? v.lines.filter((_, k) => k !== i) : [emptyLine()] })
  const switchType = (t) => set({ voucher_type: t, cash_account: VOUCHER_TYPES[t].cashSide ? (VOUCHER_TYPES[t].bank === VOUCHER_TYPES[v.voucher_type]?.bank && v.cash_account ? v.cash_account : DEFAULT_CASH[t]) : '' })

  const copyLast = () => {
    const mine = vouchers.filter(j => j.voucher_type === v.voucher_type && (!me || j.created_by === me)).sort((a, b) => String(b.id).localeCompare(String(a.id)))
    if (!mine.length) return
    const f = voucherToForm(mine[0])
    set({ cash_account: f.cash_account, party: f.party, keterangan: f.keterangan, lines: f.lines.length ? f.lines : [emptyLine()] })
  }

  const save = useCallback(async (submit) => {
    if (busy || problems.length) return
    setBusy(true)
    try {
      const r = await saveVoucher({ ...body, sop_signed: v.sop_signed ? 1 : 0 }, { id: editId, submit })
      setSaved({ id: r.id, no: r.voucher_no, submit })
      if (editId) navigate('/daftar-voucher')
      else setV(x => ({ ...blank(x.voucher_type), tanggal: x.tanggal, cash_account: x.cash_account }))
    } catch (e) {
      const list = (e.data && e.data.problems) || [{ message: e.message || 'Gagal menyimpan voucher.' }]
      setServerProblems(list)
    } finally { setBusy(false) }
  }, [busy, problems.length, saveVoucher, body, v.sop_signed, editId, navigate])

  // Keyboard: Ctrl+S save draft, Ctrl+Enter submit.
  useEffect(() => {
    const h = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); save(false) }
      if (e.key === 'Enter') { e.preventDefault(); save(true) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [save])

  const lraTotals = useMemo(() => {
    const m = new Map()
    dests.forEach((d, i) => {
      if (!d || !d.lra) return
      const key = `${d.lra.kategori}|${d.lra.outline}`
      const amt = type.cashSide ? (body.lines[i].jumlah || 0) : Math.max(body.lines[i].debit || 0, body.lines[i].kredit || 0)
      const label = d.text.replace(/^Masuk ke /, '').split(' · ')[0]
      m.set(key, { label, amount: (m.get(key)?.amount || 0) + amt })
    })
    return [...m.values()]
  }, [dests, body.lines, type.cashSide])

  if (editId && !editing) {
    return <div className="db-page"><div className="db-head"><div><h1>Input Voucher</h1><p>Voucher {editId} tidak ditemukan.</p></div></div></div>
  }
  const readOnly = editing && !['draft', 'returned'].includes(editing.status)
  const allProblems = [...problems, ...serverProblems.filter(sp => !problems.some(p => p.message === sp.message))]

  return (
    <div className="db-page" id="input-voucher">
      <div className="db-head">
        <div>
          <h1>{editId ? `Ubah Voucher ${v.voucher_no}` : 'Input Voucher'}</h1>
          <p>{bulanLabel(state.workingMonth)} · voucher masuk sebagai draf sampai diajukan ke SPV. Pembukuan harian mulai {formatTanggal(startDate)}.</p>
        </div>
        {!editId && <button type="button" className="btn btn-outline" onClick={copyLast}><Copy size={15} /> Salin voucher terakhir</button>}
      </div>

      {editing && editing.status === 'returned' && (
        <div className="db-note" style={{ marginBottom: 12, borderColor: 'var(--warning)' }}>
          <b>Dikembalikan oleh {editing.returned_by}:</b> {editing.returned_note}
        </div>
      )}
      {saved && (
        <div className="db-note" style={{ marginBottom: 12, borderColor: 'var(--success)', color: 'var(--success)' }}>
          <CheckCircle2 size={14} style={{ verticalAlign: '-2px' }} /> Voucher {saved.no} {saved.submit ? 'diajukan ke SPV' : 'tersimpan sebagai draf'}.
        </div>
      )}

      <div className="iv-types" role="tablist" aria-label="Jenis voucher">
        {TYPE_ORDER.map(t => (
          <button key={t} type="button" role="tab" aria-selected={v.voucher_type === t} className={v.voucher_type === t ? 'on' : ''} disabled={readOnly} onClick={() => switchType(t)}>
            {VOUCHER_TYPES[t].label} <small>{t}</small>
          </button>
        ))}
      </div>

      <div className="iv-grid">
        <div className="db-card">
          {allProblems.length > 0 && (
            <div className="db-alert" role="alert" id="voucher-problems" style={{ marginBottom: 14 }}>
              <span className="t">{allProblems.length} hal harus diperbaiki sebelum voucher bisa disimpan atau diajukan</span>
              <ul>{allProblems.map((p, i) => <li key={i}>{p.message}</li>)}</ul>
            </div>
          )}
          <div className="iv-fields">
            <label className="iv-fld"><span>No. Bukti</span>
              <input id="f-no" className={`form-input ${problems.some(p => p.field === 'voucher_no') ? 'iv-bad' : ''}`} value={v.voucher_no} onChange={e => set({ voucher_no: e.target.value.trim(), autoNo: false })} disabled={readOnly} />
              <small>otomatis; ubah bila beda dengan bukti fisik</small>
            </label>
            <label className="iv-fld"><span>Tanggal</span>
              <input id="f-tanggal" type="date" className={`form-input ${problems.some(p => p.field === 'tanggal') ? 'iv-bad' : ''}`} value={v.tanggal} onChange={e => set({ tanggal: e.target.value })} disabled={readOnly} />
              <small>{formatTanggal(v.tanggal)}</small>
            </label>
            {type.cashSide && (
              <label className="iv-fld"><span>{type.cashSide === 'kredit' ? 'Dibayar dari' : 'Diterima di'}</span>
                <select id="f-cash" className="form-input" value={v.cash_account} onChange={e => set({ cash_account: e.target.value })} disabled={readOnly}>
                  <option value="">— pilih kas/bank —</option>
                  {cashAccounts.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                </select>
              </label>
            )}
            {type.cashSide && (
              <label className="iv-fld"><span>{type.cashSide === 'kredit' ? 'Dibayar kepada' : 'Diterima dari'}</span>
                <input id="f-party" className="form-input" value={v.party} onChange={e => set({ party: e.target.value })} disabled={readOnly} />
              </label>
            )}
            <label className="iv-fld iv-wide"><span>Keterangan</span>
              <input id="f-ket" className="form-input" value={v.keterangan} onChange={e => set({ keterangan: e.target.value })} disabled={readOnly} />
            </label>
          </div>

          <datalist id="coa-accounts">
            {coa.map(a => <option key={a.code} value={`${a.code} ${a.name}`} />)}
          </datalist>
          <div className="iv-lines">
            <div className={`iv-lh ${type.cashSide ? '' : 'jm'}`}>
              <span>Akun</span><span>Sub Akun</span><span>Keterangan baris</span>
              {type.cashSide ? <span className="r">Jumlah (Rp)</span> : <><span className="r">Debit</span><span className="r">Kredit</span></>}
              <span />
            </div>
            {v.lines.map((l, i) => {
              const d = dests[i]
              const subs = subAkunByCode.get(String(l.akun_code)) || []
              const lp = byLine(i + 1)
              return (
                <div className={`iv-ln ${type.cashSide ? '' : 'jm'}`} key={i} data-line={i + 1}>
                  <input className={`form-input ${lp.some(p => /akun/.test(p.message) && !/Sub Akun/.test(p.message)) ? 'iv-bad' : ''}`} list="coa-accounts" placeholder="Ketik kode atau nama akun"
                    value={l.akun_code ? `${l.akun_code}${coaName(l.akun_code) ? ` ${coaName(l.akun_code)}` : ''}` : l._q || ''}
                    onChange={e => { const t = e.target.value; const code = (t.match(/^\d{5}/) || [''])[0]; setLine(i, code ? { akun_code: code, sub_akun: '', kategori: '', _q: '' } : { akun_code: '', _q: t }) }}
                    aria-label={`Akun baris ${i + 1}`} disabled={readOnly} />
                  <select className={`form-input ${lp.some(p => /Sub Akun/.test(p.message)) ? 'iv-bad' : ''}`} value={l.sub_akun} onChange={e => setLine(i, { sub_akun: e.target.value })} disabled={readOnly || !subs.length} aria-label={`Sub Akun baris ${i + 1}`}>
                    <option value="">{subs.length ? '— pilih Sub Akun —' : '(tanpa Sub Akun)'}</option>
                    {subs.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input className="form-input" placeholder="Keterangan baris" value={l.keterangan} onChange={e => setLine(i, { keterangan: e.target.value })} disabled={readOnly} aria-label={`Keterangan baris ${i + 1}`} />
                  {type.cashSide ? (
                    <input ref={i === v.lines.length - 1 ? lastAmountRef : null} className="form-input r" inputMode="numeric" placeholder="0" value={fmtNum(digits(l.jumlah))}
                      onChange={e => setLine(i, { jumlah: String(digits(e.target.value)) })}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.ctrlKey && i === v.lines.length - 1) { e.preventDefault(); addLine() } }}
                      aria-label={`Jumlah baris ${i + 1}`} disabled={readOnly} />
                  ) : (
                    <>
                      <input className="form-input r" inputMode="numeric" placeholder="0" value={fmtNum(digits(l.debit))} onChange={e => setLine(i, { debit: String(digits(e.target.value)) })} aria-label={`Debit baris ${i + 1}`} disabled={readOnly} />
                      <input className="form-input r" inputMode="numeric" placeholder="0" value={fmtNum(digits(l.kredit))} onChange={e => setLine(i, { kredit: String(digits(e.target.value)) })} aria-label={`Kredit baris ${i + 1}`} disabled={readOnly} />
                    </>
                  )}
                  <button type="button" className="btn-icon" title="Hapus baris" onClick={() => removeLine(i)} disabled={readOnly}><Trash2 size={15} /></button>
                  {d && (d.need === 'kategori' || /^(BAPOK|GERAI)$/.test(l.kategori)) && (
                    <div className="iv-kat" role="group" aria-label={`Kategori baris ${i + 1}`}>
                      {['BAPOK', 'GERAI'].map(k => <button key={k} type="button" className={l.kategori === k ? 'on' : ''} onClick={() => setLine(i, { kategori: k })} disabled={readOnly}>{k}</button>)}
                    </div>
                  )}
                  {subs.length > 0 && !l.sub_akun ? <div className="db-dest iv-dest need"><b>Pilih Sub Akun:</b> baris laporannya ditentukan oleh Sub Akun.</div>
                    : d && d.text && <div className={`db-dest iv-dest ${d.need ? 'need' : ''}`}>{d.need ? <b>{d.text}</b> : <>{d.text}{d.lra && d.lra.anggaran ? <span className="db-muted"> · anggaran setahun {formatRupiah(d.lra.anggaran)}</span> : null}</>}</div>}
                </div>
              )
            })}
            {!readOnly && <button type="button" className="iv-add" onClick={addLine}><Plus size={14} /> Tambah baris <kbd>Enter</kbd></button>}
            {type.cashSide && (
              <div className="iv-contra">
                <span>Sisi {type.cashSide} otomatis: <b>{v.cash_account ? `${v.cash_account} ${coaName(v.cash_account)}` : '—'}</b></span>
                <b className="db-num">{formatRupiah(total)}</b>
              </div>
            )}
          </div>
          <div className="iv-keys"><kbd>Tab</kbd> pindah kolom · <kbd>Enter</kbd> di jumlah terakhir: baris baru · <kbd>Ctrl</kbd>+<kbd>S</kbd> simpan draf · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> ajukan</div>
        </div>

        <div className="db-card iv-sum">
          <div className="db-sec">Jumlah voucher</div>
          <div className="iv-big db-num">{formatRupiah(total)}</div>
          <div className="iv-row"><span>Debit = Kredit</span>{balanced ? <span className="db-chip ok">Seimbang</span> : <span className="db-chip bad">Belum seimbang</span>}</div>
          {isPayment && <div className="iv-box">
            <b>Bukti fisik (SOP)</b>
            <div className="db-sec" style={{ fontSize: 13 }}>Ditandatangani <b>{sopSigner(total)}</b></div>
            <label className="iv-check"><input id="f-sop" type="checkbox" checked={!!v.sop_signed} onChange={e => set({ sop_signed: e.target.checked })} disabled={readOnly} /> Bukti fisik sudah ditandatangani</label>
            {needTick && !v.sop_signed && <div style={{ color: 'var(--warning)', fontSize: 12.5, marginTop: 4 }}>Belum dicentang: SPV tidak bisa menyetujui voucher ini sebelum dicentang.</div>}
          </div>}
          {lraTotals.length > 0 && (
            <div className="iv-box">
              <b>Masuk ke laporan</b>
              {lraTotals.map(t => <div key={t.label} className="iv-row" style={{ fontSize: 13 }}><span>{t.label}</span><span className="db-num">{formatRupiah(t.amount)}</span></div>)}
            </div>
          )}
          {!readOnly && (
            <div className="iv-actions">
              <button id="btn-ajukan" type="button" className="btn btn-primary" disabled={busy || allProblems.length > 0} onClick={() => save(true)}><Send size={15} /> {allProblems.length ? `Perbaiki ${allProblems.length} hal dulu` : 'Simpan & ajukan ke SPV'}</button>
              <button id="btn-draf" type="button" className="btn btn-outline" disabled={busy || allProblems.length > 0} onClick={() => save(false)}><Save size={15} /> Simpan draf</button>
            </div>
          )}
          <p className="db-muted" style={{ fontSize: 12, marginTop: 10 }}>
            {allProblems.length > 0 && <><AlertTriangle size={12} style={{ verticalAlign: '-1px' }} /> Voucher disimpan setelah semua hal di kotak merah diperbaiki. </>}
            Setelah diajukan, voucher menunggu di Persetujuan SPV Akuntansi / Manajer Keuangan. Yang menginput tidak bisa menyetujui vouchernya sendiri.
          </p>
        </div>
      </div>
    </div>
  )
}
