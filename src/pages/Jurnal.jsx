import React, { useState, useMemo } from 'react'
import { Plus, Search, Filter, Eye, Edit2, Trash2, Check, X, Copy, Lock, Unlock, XCircle, AlertTriangle, Scale } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import Modal from '../components/UI/Modal.jsx'

const emptyForm = {
  tanggal: new Date().toISOString().split('T')[0],
  keterangan: '',
  akun_debit: '',
  akun_kredit: '',
  debit: '',
  kredit: '',
  kode_anggaran: '',
  status: 'pending',
}

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

export default function Jurnal() {
  const { state, dispatch } = useApp()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [showDetail, setShowDetail] = useState(null)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [showLockPanel, setShowLockPanel] = useState(false)
  const [lockPeriod, setLockPeriod] = useState('Januari 2026')
  const [showSelisih, setShowSelisih] = useState(false)

  // Fallback: derive posting accounts directly from coaTree if coaFlat is empty
  function flattenTree(nodes, result = []) {
    if (!nodes) return result
    nodes.forEach(n => {
      if (n.type === 'posting') result.push(n)
      if (n.children) flattenTree(n.children, result)
    })
    return result
  }
  const postingAccounts = state.coaFlat.length > 0
    ? state.coaFlat.filter(a => a.type === 'posting')
    : flattenTree(state.coaTree)

  const anggaranOptions = (state.anggaran || []).filter(a => a.is_total !== 1)

  const lockedPeriods = state.lockedPeriods || []

  // Check if a date falls in a locked period
  function isDateLocked(dateStr) {
    if (!dateStr) return false
    const d = new Date(dateStr)
    const monthName = MONTHS[d.getMonth()]
    const year = d.getFullYear()
    return lockedPeriods.includes(`${monthName} ${year}`)
  }

  const filtered = state.journals.filter(j => {
    const matchSearch = j.keterangan.toLowerCase().includes(search.toLowerCase()) ||
      j.id.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || j.status === statusFilter
    return matchSearch && matchStatus
  })

  // Stats
  const totalPosted = state.journals.filter(j => j.status === 'posted').length
  const totalPending = state.journals.filter(j => j.status === 'pending').length

  function openAdd() {
    setForm(emptyForm)
    setEditId(null)
    setShowModal(true)
  }

  function openEdit(journal) {
    if (isDateLocked(journal.tanggal)) {
      return alert('Jurnal ini berada di periode yang terkunci. Buka kunci periode terlebih dahulu.')
    }
    setForm({
      tanggal: journal.tanggal,
      keterangan: journal.keterangan,
      akun_debit: journal.akun_debit,
      akun_kredit: journal.akun_kredit,
      debit: String(journal.debit),
      kredit: String(journal.kredit),
      kode_anggaran: journal.kode_anggaran || '',
      status: journal.status,
    })
    setEditId(journal.id)
    setShowModal(true)
  }

  function handleSave() {
    const amount = Number(form.debit) || 0
    const entry = {
      tanggal: form.tanggal,
      keterangan: form.keterangan,
      akun_debit: form.akun_debit,
      akun_kredit: form.akun_kredit,
      debit: amount,
      kredit: amount,
      kode_anggaran: form.kode_anggaran || null,
      status: form.status,
    }
    if (editId) {
      dispatch({ type: 'UPDATE_JOURNAL', payload: { ...entry, id: editId } })
    } else {
      dispatch({ type: 'ADD_JOURNAL', payload: entry })
    }
    setShowModal(false)
  }

  function handleDelete(id) {
    const j = state.journals.find(j => j.id === id)
    if (j && isDateLocked(j.tanggal)) {
      return alert('Jurnal ini berada di periode yang terkunci.')
    }
    dispatch({ type: 'DELETE_JOURNAL', payload: id })
    setShowDeleteConfirm(null)
  }

  function handleCopy(id) {
    dispatch({ type: 'COPY_JOURNAL', payload: id })
  }

  function handleApprove(id) {
    dispatch({ type: 'APPROVE_JOURNAL', payload: id })
  }

  function handleUnapprove(id) {
    const j = state.journals.find(j => j.id === id)
    if (j && isDateLocked(j.tanggal)) {
      return alert('Jurnal ini berada di periode yang terkunci.')
    }
    dispatch({ type: 'UNAPPROVE_JOURNAL', payload: id })
  }

  function handleLockPeriod() {
    dispatch({ type: 'LOCK_PERIOD', payload: lockPeriod })
  }

  function handleUnlockPeriod(period) {
    dispatch({ type: 'UNLOCK_PERIOD', payload: period })
  }

  // Check AR/AP balance
  function checkARAPBalance() {
    setShowSelisih(true)
  }

  // Compute selisih data
  const selisihData = useMemo(() => {
    const piutang = state.piutang || []
    const hutang = state.hutang || []
    const totalAR = piutang.reduce((s, p) => s + (p.sisa || 0), 0)
    const totalAP = hutang.reduce((s, h) => s + (h.sisa || 0), 0)
    const posted = state.journals.filter(j => j.status === 'posted')
    let journalAR = 0, journalAP = 0
    let totalDebit = 0, totalKredit = 0
    const imbalanced = []
    posted.forEach(j => {
      totalDebit += j.debit
      totalKredit += j.kredit
      if (j.debit !== j.kredit) imbalanced.push(j)
      if (j.akun_debit.includes('11201')) journalAR += j.debit
      if (j.akun_kredit.includes('11201')) journalAR -= j.kredit
      if (j.akun_kredit.includes('21101')) journalAP += j.kredit
      if (j.akun_debit.includes('21101')) journalAP -= j.debit
    })
    return { totalAR, totalAP, journalAR, journalAP, totalDebit, totalKredit, imbalanced, isBalanced: totalDebit === totalKredit, arMatch: totalAR === journalAR, apMatch: totalAP === journalAP }
  }, [state.journals, state.piutang, state.hutang])

  const isFormValid = form.tanggal && form.keterangan && form.akun_debit && form.akun_kredit && Number(form.debit) > 0

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Jurnal Umum</h1>
        <p>Kelola entri jurnal akuntansi — {state.journals.length} entri ({totalPosted} posted, {totalPending} pending)</p>
      </div>

      {/* Locked periods indicator */}
      {lockedPeriods.length > 0 && (
        <div style={{display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center'}}>
          <Lock size={14} color="var(--warning)" />
          <span style={{fontSize:12, color:'var(--text-muted)'}}>Periode terkunci:</span>
          {lockedPeriods.map(p => (
            <span key={p} className="badge orange" style={{fontSize:11}}>{p}</span>
          ))}
        </div>
      )}

      <div className="toolbar">
        <div className="topbar-search" style={{ maxWidth: 320 }}>
          <Search />
          <input type="text" placeholder="Cari jurnal..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Semua Status</option>
          <option value="posted">Posted</option>
          <option value="pending">Pending</option>
        </select>
        <div className="toolbar-right">
          <button className="btn btn-outline" onClick={() => setShowLockPanel(!showLockPanel)} title="Kunci Periode"><Lock size={16} /> Kunci Periode</button>
          <button className="btn btn-outline" onClick={() => setShowSelisih(true)} title="Cek Selisih Jurnal"><Scale size={16} /> Cek Selisih</button>
          <button className="btn btn-outline" onClick={checkARAPBalance} title="Check AR/AP">Check AR/AP</button>
          <button className="btn btn-primary" id="btn-add-journal" onClick={openAdd}><Plus size={16} /> Buat Jurnal</button>
        </div>
      </div>

      {/* Lock Period Panel */}
      {showLockPanel && (
        <div className="card" style={{marginBottom:16, padding: 16}}>
          <div className="card-header" style={{marginBottom:12}}>
            <div className="card-title">Kunci / Buka Kunci Transaksi Periode</div>
            <button className="btn btn-outline" onClick={() => setShowLockPanel(false)}><X size={16} /></button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Pilih Periode</label>
              <select className="form-select" value={lockPeriod} onChange={e => setLockPeriod(e.target.value)}>
                {MONTHS.map(m => ['2025','2026'].map(y =>
                  <option key={`${m} ${y}`} value={`${m} ${y}`}>{m} {y}</option>
                )).flat()}
              </select>
            </div>
            <div className="form-group" style={{display:'flex', alignItems:'flex-end', gap:8}}>
              <button className="btn btn-primary" onClick={handleLockPeriod}><Lock size={14} /> Kunci</button>
            </div>
          </div>
          {lockedPeriods.length > 0 && (
            <div style={{marginTop:12}}>
              <label className="form-label">Periode Terkunci:</label>
              <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:4}}>
                {lockedPeriods.map(p => (
                  <div key={p} style={{display:'flex', alignItems:'center', gap:4, padding:'4px 10px', background:'var(--bg-secondary)', borderRadius:6, fontSize:13}}>
                    <Lock size={12} color="var(--warning)" />
                    {p}
                    <button onClick={() => handleUnlockPeriod(p)} style={{background:'none', border:'none', cursor:'pointer', color:'var(--danger)', padding:0, marginLeft:4}} title="Buka kunci">
                      <Unlock size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table className="report-table">
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ width: 100 }}>Tgl</th>
                <th style={{ width: 80 }}>No.</th>
                <th>Akun</th>
                <th>Sub Akun</th>
                <th className="text-right" style={{ width: 120 }}>D</th>
                <th className="text-right" style={{ width: 120 }}>K</th>
                <th>Keterangan</th>
                <th className="text-center">Status</th>
                <th className="text-center">Aksi</th>
              </tr>
              {/* Header Totals Row */}
              <tr style={{ background: 'rgba(59,130,246,0.05)', fontWeight: 700 }}>
                <td colSpan={4} className="text-right">TOTAL</td>
                <td className="text-right mono">{formatRupiah(selisihData.totalDebit)}</td>
                <td className="text-right mono">{formatRupiah(selisihData.totalKredit)}</td>
                <td colSpan={3}></td>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Tidak ada jurnal ditemukan</td></tr>
              )}
              {filtered.map(j => {
                const locked = isDateLocked(j.tanggal)
                const [debitCode, debitName] = j.akun_debit.split(' - ')
                const [kreditCode, kreditName] = j.akun_kredit.split(' - ')
                
                return (
                <React.Fragment key={j.id}>
                  {/* Debit Row */}
                  <tr style={locked ? {opacity: 0.7} : {}}>
                    <td rowSpan={2} style={{ verticalAlign: 'top', paddingTop: 12, borderBottom: '2px solid var(--border)' }}>{j.tanggal} {locked && <Lock size={10} color="var(--warning)" />}</td>
                    <td className="mono" rowSpan={2} style={{ verticalAlign: 'top', paddingTop: 12, borderBottom: '2px solid var(--border)' }}>{j.id}</td>
                    <td style={{ fontWeight: 500 }}>{debitName} <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>({debitCode})</span></td>
                    <td style={{ fontSize: 12, color: 'var(--primary)' }}>{j.kode_anggaran || '-'}</td>
                    <td className="text-right mono" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', fontWeight: 600 }}>{formatRupiah(j.debit)}</td>
                    <td className="text-right mono">-</td>
                    <td rowSpan={2} style={{ verticalAlign: 'top', paddingTop: 12, fontSize: 12, borderBottom: '2px solid var(--border)' }}>{j.keterangan}</td>
                    <td className="text-center" rowSpan={2} style={{ verticalAlign: 'top', paddingTop: 12, borderBottom: '2px solid var(--border)' }}>
                      <span className={`badge ${j.status === 'posted' ? 'green' : 'orange'}`} style={{ fontSize: 10 }}>
                        {j.status === 'posted' ? 'P' : 'W'}
                      </span>
                    </td>
                    <td className="text-center" rowSpan={2} style={{ verticalAlign: 'top', paddingTop: 12, borderBottom: '2px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-icon btn-outline btn-sm" title="Detail" onClick={() => setShowDetail(j)}><Eye size={12} /></button>
                        {!locked && (
                          <>
                            <button className="btn btn-icon btn-outline btn-sm" title="Edit" onClick={() => openEdit(j)}><Edit2 size={12} /></button>
                            <button className="btn btn-icon btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setShowDeleteConfirm(j.id)}><Trash2 size={12} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Kredit Row */}
                  <tr style={locked ? {opacity: 0.7, borderBottom: '2px solid var(--border)'} : { borderBottom: '2px solid var(--border)' }}>
                    <td style={{ paddingLeft: 24, fontWeight: 500 }}>{kreditName} <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>({kreditCode})</span></td>
                    <td></td>
                    <td className="text-right mono">-</td>
                    <td className="text-right mono" style={{ background: 'rgba(59,130,246,0.05)', color: 'var(--primary)', fontWeight: 600 }}>{formatRupiah(j.kredit)}</td>
                  </tr>
                </React.Fragment>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD/EDIT MODAL */}
      {showModal && (
        <Modal
          title={editId ? 'Edit Jurnal' : 'Buat Jurnal Baru'}
          onClose={() => setShowModal(false)}
          width={640}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Batal</button>
              <button className="btn btn-primary" disabled={!isFormValid} onClick={handleSave}>{editId ? 'Simpan Perubahan' : 'Simpan Jurnal'}</button>
            </>
          }
        >
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tanggal *</label>
              <input className="form-input" type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="pending">Pending</option>
                <option value="posted">Posted</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Keterangan *</label>
            <input className="form-input" placeholder="Deskripsi transaksi..." value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} />
          </div>

          <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 12, marginBottom: 16, border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div className="segmented-control" style={{ display: 'flex', background: 'var(--border-light)', padding: 4, borderRadius: 10, width: '100%', maxWidth: 300 }}>
                <button 
                  onClick={() => setForm({ ...form, side: 'debit' })}
                  style={{ 
                    flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: (form.side || 'debit') === 'debit' ? 'var(--primary)' : 'transparent',
                    color: (form.side || 'debit') === 'debit' ? 'white' : 'var(--text-muted)',
                    fontWeight: 600, transition: 'all 0.2s', fontSize: 13
                  }}
                >
                  DEBIT (D)
                </button>
                <button 
                  onClick={() => setForm({ ...form, side: 'kredit' })}
                  style={{ 
                    flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: form.side === 'kredit' ? 'var(--danger)' : 'transparent',
                    color: form.side === 'kredit' ? 'white' : 'var(--text-muted)',
                    fontWeight: 600, transition: 'all 0.2s', fontSize: 13
                  }}
                >
                  KREDIT (K)
                </button>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Akun Utama *</label>
                <select className="form-select" value={(form.side || 'debit') === 'debit' ? form.akun_debit : form.akun_kredit} onChange={e => {
                  if ((form.side || 'debit') === 'debit') setForm({ ...form, akun_debit: e.target.value })
                  else setForm({ ...form, akun_kredit: e.target.value })
                }}>
                  <option value="">— Pilih Akun —</option>
                  {postingAccounts.map(a => (
                    <option key={a.code} value={`${a.code} - ${a.name}`}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Akun Lawan *</label>
                <select className="form-select" value={(form.side || 'debit') === 'debit' ? form.akun_kredit : form.akun_debit} onChange={e => {
                  if ((form.side || 'debit') === 'debit') setForm({ ...form, akun_kredit: e.target.value })
                  else setForm({ ...form, akun_debit: e.target.value })
                }}>
                  <option value="">— Pilih Akun Lawan —</option>
                  {postingAccounts.map(a => (
                    <option key={a.code} value={`${a.code} - ${a.name}`}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Jumlah (Rp) *</label>
              <input className="form-input" type="number" placeholder="0" value={form.debit} onChange={e => setForm({ ...form, debit: e.target.value, kredit: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Program COA (LRA)</label>
              <select className="form-select" value={form.kode_anggaran} onChange={e => setForm({ ...form, kode_anggaran: e.target.value })}>
                <option value="">— Pilih Akun Referensi COA —</option>
                {postingAccounts.map(a => (
                  <option key={a.code} value={a.code}>[{a.code}] {a.name}</option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Pilih akun COA untuk klasifikasi pelaporan LRA.</p>
            </div>
          </div>
        </Modal>
      )}

      {/* DELETE CONFIRMATION */}
      {showDeleteConfirm && (
        <Modal title="Konfirmasi Hapus" onClose={() => setShowDeleteConfirm(null)} footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowDeleteConfirm(null)}>Batal</button>
            <button className="btn btn-danger" onClick={() => handleDelete(showDeleteConfirm)}>Hapus Jurnal</button>
          </>
        }>
          <p>Apakah Anda yakin ingin menghapus jurnal <strong>{showDeleteConfirm}</strong>?</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>Tindakan ini tidak dapat dibatalkan.</p>
        </Modal>
      )}

      {/* DETAIL MODAL */}
      {showDetail && (
        <Modal title={`Detail ${showDetail.id}`} onClose={() => setShowDetail(null)} footer={
          <button className="btn btn-outline" onClick={() => setShowDetail(null)}>Tutup</button>
        }>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="form-row">
              <div><span className="form-label">No. Jurnal</span><p className="mono" style={{fontWeight:600}}>{showDetail.id}</p></div>
              <div><span className="form-label">Tanggal</span><p>{showDetail.tanggal}</p></div>
            </div>
            <div><span className="form-label">Keterangan</span><p>{showDetail.keterangan}</p></div>
            <div className="form-row">
              <div><span className="form-label">Akun Debit</span><p style={{fontSize:13}}>{showDetail.akun_debit}</p></div>
              <div><span className="form-label">Akun Kredit</span><p style={{fontSize:13}}>{showDetail.akun_kredit}</p></div>
            </div>
            <div className="form-row">
              <div><span className="form-label">Jumlah</span><p className="mono" style={{fontWeight:700, fontSize:18}}>{formatRupiah(showDetail.debit)}</p></div>
              <div><span className="form-label">Status</span><span className={`badge ${showDetail.status === 'posted' ? 'green' : 'orange'}`}>{showDetail.status === 'posted' ? 'Posted' : 'Pending'}</span></div>
            </div>
            {isDateLocked(showDetail.tanggal) && (
              <div style={{padding:'8px 12px', background:'rgba(245,158,11,0.1)', borderRadius:8, fontSize:13, color:'var(--warning)', display:'flex', alignItems:'center', gap:6}}>
                <Lock size={14} /> Jurnal ini berada di periode yang terkunci
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* CEK SELISIH MODAL */}
      {showSelisih && (
        <Modal title="Cek Selisih Jurnal" onClose={() => setShowSelisih(false)} width={700} footer={
          <button className="btn btn-outline" onClick={() => setShowSelisih(false)}>Tutup</button>
        }>
          <div style={{display:'grid', gap:16}}>
            {/* Overall Balance Check */}
            <div style={{padding:16, borderRadius:8, background: selisihData.isBalanced ? 'var(--success-light)' : 'rgba(229,77,66,0.1)', display:'flex', alignItems:'center', gap:12}}>
              {selisihData.isBalanced ? <Check size={20} color="var(--success)" /> : <AlertTriangle size={20} color="var(--danger)" />}
              <div>
                <div style={{fontWeight:600, color: selisihData.isBalanced ? 'var(--success)' : 'var(--danger)'}}>
                  {selisihData.isBalanced ? '✓ Jurnal Balance — Total Debit = Total Kredit' : '✗ Jurnal Tidak Balance!'}
                </div>
                <div style={{fontSize:12, color:'var(--text-muted)', marginTop:2}}>Total Debit: {formatRupiah(selisihData.totalDebit)} | Total Kredit: {formatRupiah(selisihData.totalKredit)}</div>
              </div>
            </div>

            {/* AR/AP Sync Check */}
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <div style={{padding:14, borderRadius:8, border:'1px solid var(--border)'}}>
                <div style={{fontWeight:600, marginBottom:8, display:'flex', alignItems:'center', gap:6}}>
                  {selisihData.arMatch ? <Check size={14} color="var(--success)" /> : <AlertTriangle size={14} color="var(--warning)" />}
                  Piutang (AR)
                </div>
                <div style={{fontSize:13, display:'grid', gap:4}}>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span>Modul Piutang:</span><span className="mono" style={{fontWeight:600}}>{formatRupiah(selisihData.totalAR)}</span></div>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span>Jurnal (11201):</span><span className="mono" style={{fontWeight:600}}>{formatRupiah(selisihData.journalAR)}</span></div>
                  <div style={{borderTop:'1px solid var(--border-light)', paddingTop:4, marginTop:4, display:'flex', justifyContent:'space-between'}}>
                    <span>Selisih:</span>
                    <span className="mono" style={{fontWeight:700, color: selisihData.arMatch ? 'var(--success)' : 'var(--warning)'}}>{formatRupiah(selisihData.totalAR - selisihData.journalAR)}</span>
                  </div>
                </div>
              </div>
              <div style={{padding:14, borderRadius:8, border:'1px solid var(--border)'}}>
                <div style={{fontWeight:600, marginBottom:8, display:'flex', alignItems:'center', gap:6}}>
                  {selisihData.apMatch ? <Check size={14} color="var(--success)" /> : <AlertTriangle size={14} color="var(--warning)" />}
                  Hutang (AP)
                </div>
                <div style={{fontSize:13, display:'grid', gap:4}}>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span>Modul Hutang:</span><span className="mono" style={{fontWeight:600}}>{formatRupiah(selisihData.totalAP)}</span></div>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span>Jurnal (21101):</span><span className="mono" style={{fontWeight:600}}>{formatRupiah(selisihData.journalAP)}</span></div>
                  <div style={{borderTop:'1px solid var(--border-light)', paddingTop:4, marginTop:4, display:'flex', justifyContent:'space-between'}}>
                    <span>Selisih:</span>
                    <span className="mono" style={{fontWeight:700, color: selisihData.apMatch ? 'var(--success)' : 'var(--warning)'}}>{formatRupiah(selisihData.totalAP - selisihData.journalAP)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Imbalanced entries */}
            {selisihData.imbalanced.length > 0 && (
              <div>
                <div style={{fontWeight:600, marginBottom:8, color:'var(--danger)'}}>Jurnal Tidak Balance ({selisihData.imbalanced.length})</div>
                <table>
                  <thead><tr><th>No.</th><th>Keterangan</th><th className="text-right">Debit</th><th className="text-right">Kredit</th><th className="text-right">Selisih</th></tr></thead>
                  <tbody>
                    {selisihData.imbalanced.map(j => (
                      <tr key={j.id}>
                        <td className="mono">{j.id}</td>
                        <td>{j.keterangan}</td>
                        <td className="text-right mono">{formatRupiah(j.debit)}</td>
                        <td className="text-right mono">{formatRupiah(j.kredit)}</td>
                        <td className="text-right mono" style={{color:'var(--danger)', fontWeight:600}}>{formatRupiah(j.debit - j.kredit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{fontSize:12, color:'var(--text-muted)', padding:'8px 12px', background:'var(--bg-secondary)', borderRadius:6}}>
              💡 Perbedaan antara modul dan jurnal menunjukkan transaksi yang belum di-sinkronkan ke buku besar.
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
