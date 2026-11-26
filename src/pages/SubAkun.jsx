// Akun & Sub Akun — the list a voucher line chooses from (spec 2026-11-25
// §5.6). Each Sub Akun shows the report line it lands on; the SPV Akuntansi /
// Manajer Keuangan add, rename, deactivate, or tell the reports to read it on
// another account (from the start of daily bookkeeping only). Staff read.
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { lineDestination } from '../utils/voucherRules.js'
import { dailyBookStart } from '../utils/bookYear.js'
import { formatTanggal } from '../utils/workingMonth.js'
import { Plus, RefreshCw } from 'lucide-react'

const WRITERS = ['spv_akuntansi', 'manager_keuangan', 'admin', 'super_admin']
const linesOf = (j) => { let l = j.lines; if (typeof l === 'string') { try { l = JSON.parse(l) } catch { l = [] } } return Array.isArray(l) ? l : [] }

export default function SubAkun() {
  const { state, saveSubAkun, seedSubAkun } = useApp()
  const canWrite = WRITERS.includes(state.session?.role)
  const startDate = dailyBookStart(state.pengaturan)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState(null)
  const [add, setAdd] = useState({ account: '', name: '', report_code: '' })
  const [edit, setEdit] = useState(null) // { id, name, report_code }

  const coa = useMemo(() => (state.coaFlat || []).filter(a => /^\d{5}$/.test(String(a.code))), [state.coaFlat])
  const coaName = useMemo(() => { const m = new Map(coa.map(a => [String(a.code), a.name])); return (c) => m.get(String(c)) || '' }, [coa])
  const usage = useMemo(() => {
    const m = new Map()
    for (const j of state.journalsAll || []) for (const l of linesOf(j)) {
      if (!l.sub_akun) continue
      const k = `${l.akun_code}|${l.sub_akun}`
      m.set(k, (m.get(k) || 0) + 1)
    }
    return m
  }, [state.journalsAll])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const by = new Map()
    for (const s of state.subAkun || []) {
      const acct = String(s.account_code)
      const text = `${acct} ${coaName(acct)} ${s.name}`.toLowerCase()
      if (needle && !text.includes(needle)) continue
      by.set(acct, [...(by.get(acct) || []), s])
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [state.subAkun, q, coaName])

  const destOf = (s) => {
    const code = String(s.account_code)
    const side = /^[47]/.test(code) ? { debit: 0, kredit: 1 } : { debit: 1, kredit: 0 }
    return lineDestination({ akun_code: code, akun_name: coaName(code), sub_akun: s.name, ...side }, { tanggal: startDate > '2026-12-31' ? startDate : '2026-12-01' })
  }
  async function run(fn, ok) {
    try { const r = await fn(); setMsg({ ok: true, text: typeof ok === 'function' ? ok(r) : ok }) } catch (e) { setMsg({ ok: false, text: e.message }) }
  }
  const total = (state.subAkun || []).length

  return (
    <div className="db-page" id="sub-akun">
      <div className="db-head">
        <div>
          <h1>Akun &amp; Sub Akun</h1>
          <p>{total} Sub Akun. Voucher hanya bisa memilih Sub Akun dari daftar ini{canWrite ? '' : '; Sub Akun baru ditambahkan oleh SPV Akuntansi atau Manajer Keuangan'}.</p>
        </div>
        {canWrite && <button type="button" className="btn btn-outline" onClick={() => run(seedSubAkun, r => `${r.added} Sub Akun dari jurnal ditambahkan.`)}><RefreshCw size={15} /> Muat dari jurnal</button>}
      </div>
      {msg && <div className="db-note" style={{ marginBottom: 12, color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>{msg.ok ? '✓' : '✕'} {msg.text}</div>}

      {canWrite && (
        <div className="db-card" style={{ marginBottom: 16 }}>
          <h2>Tambah Sub Akun</h2>
          <datalist id="sa-accounts">{coa.map(a => <option key={a.code} value={`${a.code} ${a.name}`} />)}</datalist>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1fr) auto', gap: 10, marginTop: 10, alignItems: 'end' }}>
            <label className="iv-fld"><span>Akun</span><input id="sa-akun" className="form-input" list="sa-accounts" value={add.account} onChange={e => setAdd({ ...add, account: e.target.value })} placeholder="Ketik kode atau nama akun" /></label>
            <label className="iv-fld"><span>Nama Sub Akun</span><input id="sa-nama" className="form-input" value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} /></label>
            <label className="iv-fld"><span>Ikut baris laporan akun (opsional)</span><input id="sa-report" className="form-input" list="sa-accounts" value={add.report_code} onChange={e => setAdd({ ...add, report_code: e.target.value })} placeholder="mis. 51002" /></label>
            <button type="button" id="sa-tambah" className="btn btn-primary" disabled={!add.account.trim() || !add.name.trim()}
              onClick={() => run(() => saveSubAkun({ account_code: add.account.trim().split(/\s+/)[0], name: add.name.trim(), report_code: add.report_code.trim().split(/\s+/)[0] || null }), () => { setAdd({ account: '', name: '', report_code: '' }); return 'Sub Akun ditambahkan.' })}>
              <Plus size={15} /> Tambah
            </button>
          </div>
          <p className="db-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>"Ikut baris laporan akun": laporan membaca baris dengan Sub Akun ini seperti akun yang dipilih, untuk transaksi mulai {formatTanggal(startDate)}.</p>
        </div>
      )}

      <input className="form-input" style={{ maxWidth: 360, marginBottom: 12 }} placeholder="Cari akun atau Sub Akun…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="db-card" style={{ padding: '6px 8px' }}>
        {groups.length === 0 ? <div className="db-muted" style={{ padding: 18 }}>{total ? 'Tidak ada yang cocok.' : 'Daftar Sub Akun masih kosong.'}</div> : (
          <div className="db-tw">
            <table className="db-table" id="tabel-sub-akun">
              <thead><tr><th>Akun</th><th>Sub Akun</th><th>Masuk ke laporan</th><th className="r">Dipakai</th><th>Status</th>{canWrite && <th />}</tr></thead>
              <tbody>
                {groups.flatMap(([acct, rows]) => rows.map((s, i) => {
                  const d = destOf(s)
                  const isEdit = edit && edit.id === s.id
                  return (
                    <tr key={s.id} style={{ opacity: Number(s.active) === 0 ? 0.55 : 1 }}>
                      <td>{i === 0 ? <><b>{acct}</b> {coaName(acct)}</> : null}</td>
                      <td>{isEdit ? <input className="form-input" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /> : s.name}</td>
                      <td style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                        {isEdit ? <input className="form-input" list="sa-accounts" value={edit.report_code} onChange={e => setEdit({ ...edit, report_code: e.target.value })} placeholder="kode akun (kosong = akunnya sendiri)" />
                          : <>{s.report_code ? <div><span className="db-chip">ikut {s.report_code} {coaName(s.report_code)}</span></div> : null}{d.text || <span className="db-muted">belum punya baris laporan</span>}</>}
                      </td>
                      <td className="r db-num">{usage.get(`${acct}|${s.name}`) || 0}</td>
                      <td><span className={`db-chip ${Number(s.active) === 0 ? 'gray' : 'ok'}`} title={s.source === 'diganti' ? 'Nama lama dari Sub Akun yang sudah diganti namanya; jurnal lama masih memakainya.' : undefined}>{s.source === 'diganti' ? 'nama lama' : Number(s.active) === 0 ? 'nonaktif' : 'aktif'}</span></td>
                      {canWrite && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {isEdit ? (
                            <>
                              <button type="button" className="btn btn-sm btn-primary" onClick={() => run(() => saveSubAkun({ id: s.id, name: edit.name.trim(), report_code: edit.report_code.trim().split(/\s+/)[0] || '' }), () => { setEdit(null); return 'Sub Akun disimpan.' })}>Simpan</button>{' '}
                              <button type="button" className="btn btn-sm btn-outline" onClick={() => setEdit(null)}>Batal</button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="btn btn-sm btn-outline" onClick={() => setEdit({ id: s.id, name: s.name, report_code: s.report_code || '' })}>Ubah</button>{' '}
                              <button type="button" className="btn btn-sm btn-outline" onClick={() => run(() => saveSubAkun({ id: s.id, active: Number(s.active) === 0 ? 1 : 0 }), Number(s.active) === 0 ? 'Diaktifkan.' : 'Dinonaktifkan.')}>{Number(s.active) === 0 ? 'Aktifkan' : 'Nonaktifkan'}</button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                }))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
