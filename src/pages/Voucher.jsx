import { useState, useMemo } from 'react'
import { Plus, Search, Check, X, Eye, Edit2, Trash2, Printer, Download, FileText, CheckCircle2, Clock, Lock } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import Modal from '../components/UI/Modal.jsx'
import SearchableSelect from '../components/UI/SearchableSelect.jsx'

const GROUP_TRANSAKSI = [
  { value: 'KM', label: 'KM - Kas Masuk' },
  { value: 'KK', label: 'KK - Kas Keluar' },
  { value: 'BM', label: 'BM - Bank Masuk' },
  { value: 'BK', label: 'BK - Bank Keluar' },
  { value: 'JU', label: 'JU - Jurnal Umum' },
  { value: 'JM', label: 'JM - Jurnal Memorial' },
]

const emptyLine = { akun: '', keterangan: '', debit: 0, kredit: 0 }

export default function Voucher() {
  const { state, dispatch } = useApp()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [editId, setEditId] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)

  // Voucher form
  const [voucherForm, setVoucherForm] = useState({
    groupTransaksi: 'JU',
    tanggal: new Date().toISOString().split('T')[0],
    keterangan: '',
    lines: [{ ...emptyLine }, { ...emptyLine }],
  })

  // COA options
  function flattenTree(nodes, result = []) {
    if (!nodes) return result
    nodes.forEach(n => { if (n.type === 'posting') result.push(n); if (n.children) flattenTree(n.children, result) })
    return result
  }
  const postingAccounts = state.coaFlat.length > 0 ? state.coaFlat.filter(a => a.type === 'posting') : flattenTree(state.coaTree)
  const akunOptions = useMemo(() => postingAccounts.map(a => ({ label: `${a.code} - ${a.name}`, value: `${a.code} - ${a.name}` })), [postingAccounts])

  // Voucher list from journals that have group_transaksi or lines
  const vouchers = useMemo(() => {
    return state.journals.filter(j => j.bukti && j.bukti.startsWith('V-'))
  }, [state.journals])

  const filtered = vouchers.filter(j => {
    const matchSearch = (j.keterangan || '').toLowerCase().includes(search.toLowerCase()) || j.id.toLowerCase().includes(search.toLowerCase()) || (j.bukti || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || j.status === statusFilter
    return matchSearch && matchStatus
  })

  // Stats
  const totalApproved = vouchers.filter(v => v.status === 'posted').length
  const totalPending = vouchers.filter(v => v.status === 'pending').length
  const totalAmount = vouchers.reduce((s, v) => s + (v.debit || 0), 0)

  function addLine() {
    setVoucherForm(f => ({ ...f, lines: [...f.lines, { ...emptyLine }] }))
  }
  function removeLine(idx) {
    setVoucherForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))
  }
  function updateLine(idx, field, value) {
    setVoucherForm(f => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, [field]: field === 'debit' || field === 'kredit' ? Number(value) || 0 : value } : l) }))
  }

  const totalDebit = voucherForm.lines.reduce((s, l) => s + (l.debit || 0), 0)
  const totalKredit = voucherForm.lines.reduce((s, l) => s + (l.kredit || 0), 0)
  const isBalanced = totalDebit === totalKredit && totalDebit > 0

  function openAdd() {
    setVoucherForm({ groupTransaksi: 'JU', tanggal: new Date().toISOString().split('T')[0], keterangan: '', lines: [{ ...emptyLine }, { ...emptyLine }] })
    setEditId(null)
    setShowModal(true)
  }

  function handleSave() {
    if (!isBalanced) return alert('Total Debit harus sama dengan Total Kredit')
    if (!voucherForm.keterangan) return alert('Keterangan wajib diisi')

    const debitLines = voucherForm.lines.filter(l => l.debit > 0)
    const kreditLines = voucherForm.lines.filter(l => l.kredit > 0)
    if (debitLines.length === 0 || kreditLines.length === 0) return alert('Minimal 1 baris debit dan 1 baris kredit')

    // Generate voucher number
    const prefix = voucherForm.groupTransaksi
    const existingCount = vouchers.filter(v => (v.bukti || '').startsWith(`V-${prefix}`)).length
    const voucherNo = `V-${prefix}-${String(existingCount + 1).padStart(4, '0')}`

    // Create journal entries from voucher lines — one entry per debit/kredit pair
    const entries = []
    const maxPairs = Math.max(debitLines.length, kreditLines.length)
    for (let i = 0; i < maxPairs; i++) {
      const dLine = debitLines[i % debitLines.length]
      const kLine = kreditLines[i % kreditLines.length]
      const amount = i < debitLines.length ? dLine.debit : kLine.kredit
      entries.push({
        tanggal: voucherForm.tanggal,
        keterangan: `[${voucherNo}] ${voucherForm.keterangan}${dLine.keterangan ? ' - ' + dLine.keterangan : ''}`,
        akun_debit: dLine.akun,
        akun_kredit: kLine.akun,
        debit: amount,
        kredit: amount,
        status: 'pending',
        bukti: voucherNo,
        lines: JSON.stringify(voucherForm.lines),
      })
    }

    // If it simplifies, create single journal entry for simple vouchers
    if (debitLines.length === 1 && kreditLines.length === 1) {
      dispatch({
        type: 'ADD_JOURNAL', payload: {
          tanggal: voucherForm.tanggal,
          keterangan: `[${voucherNo}] ${voucherForm.keterangan}`,
          akun_debit: debitLines[0].akun,
          akun_kredit: kreditLines[0].akun,
          debit: totalDebit,
          kredit: totalKredit,
          status: 'pending',
          bukti: voucherNo,
          lines: JSON.stringify(voucherForm.lines),
        }
      })
    } else {
      entries.forEach(e => dispatch({ type: 'ADD_JOURNAL', payload: e }))
    }

    setShowModal(false)
  }

  function handleApprove(id) { dispatch({ type: 'APPROVE_JOURNAL', payload: id }) }
  function handleUnapprove(id) { dispatch({ type: 'UNAPPROVE_JOURNAL', payload: id }) }
  function handleDelete(id) { dispatch({ type: 'DELETE_JOURNAL', payload: id }); setShowDeleteConfirm(null) }

  function printVoucher(v) {
    const lines = v.lines ? JSON.parse(v.lines) : []
    const w = window.open('', '_blank', 'width=800,height=600')
    const pengaturan = state.pengaturan || {}
    w.document.write(`<html><head><title>Voucher ${v.bukti}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;font-size:13px}
      table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ccc;padding:8px;text-align:left}
      th{background:#f5f5f5}.text-right{text-align:right}.header{text-align:center;margin-bottom:24px}
      .sign-row{display:flex;justify-content:space-between;margin-top:48px;text-align:center}
      .sign-box{width:30%;border-top:1px solid #333;padding-top:8px}
      @media print{body{padding:20px}}</style></head><body>
      <div class="header"><h2>${pengaturan.namaPerusahaan || 'PERUMDA PASAR BANJARMASIN'}</h2>
      <p>${pengaturan.alamat || ''}, ${pengaturan.kota || 'Banjarmasin'}</p>
      <h3>BUKTI VOUCHER</h3><p>No: <strong>${v.bukti}</strong> | Tanggal: ${v.tanggal}</p></div>
      <p><strong>Keterangan:</strong> ${v.keterangan}</p>
      <table><thead><tr><th>No</th><th>Akun</th><th>Keterangan</th><th class="text-right">Debit</th><th class="text-right">Kredit</th></tr></thead><tbody>
      ${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${l.akun}</td><td>${l.keterangan || '-'}</td><td class="text-right">${l.debit ? 'Rp ' + l.debit.toLocaleString('id-ID') : '-'}</td><td class="text-right">${l.kredit ? 'Rp ' + l.kredit.toLocaleString('id-ID') : '-'}</td></tr>`).join('')}
      <tr style="font-weight:bold;border-top:2px solid #333"><td colspan="3">TOTAL</td><td class="text-right">${'Rp ' + lines.reduce((s, l) => s + (l.debit || 0), 0).toLocaleString('id-ID')}</td><td class="text-right">${'Rp ' + lines.reduce((s, l) => s + (l.kredit || 0), 0).toLocaleString('id-ID')}</td></tr>
      </tbody></table>
      <div class="sign-row"><div class="sign-box"><p>Dibuat oleh</p><br><br><p>${pengaturan.namaKasirVoucher || '________________'}</p></div>
      <div class="sign-box"><p>Diperiksa oleh</p><br><br><p>${pengaturan.namaPeriksaVoucher || '________________'}</p></div>
      <div class="sign-box"><p>Disetujui oleh</p><br><br><p>${pengaturan.namaSetujuVoucher || '________________'}</p></div></div>
      <script>window.print()</script></body></html>`)
    w.document.close()
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Voucher</h1>
        <p>Input, approval & cetak bukti voucher — {vouchers.length} voucher</p>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Voucher <span className="kpi-icon blue"><FileText size={16} /></span></div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{vouchers.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Approved <CheckCircle2 size={16} color="var(--success)" /></div>
          <div className="kpi-value" style={{ fontSize: 18, color: 'var(--success)' }}>{totalApproved}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Pending <Clock size={16} color="var(--warning)" /></div>
          <div className="kpi-value" style={{ fontSize: 18, color: 'var(--warning)' }}>{totalPending}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Nominal</div>
          <div className="kpi-value" style={{ fontSize: 16 }}>{formatRupiah(totalAmount)}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="topbar-search" style={{ maxWidth: 320 }}>
          <Search /><input type="text" placeholder="Cari voucher..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Semua Status</option>
          <option value="posted">Approved</option>
          <option value="pending">Pending</option>
        </select>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Buat Voucher</button>
        </div>
      </div>

      {/* Voucher Table */}
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>No. Bukti</th><th>Tanggal</th><th>Grup</th><th>Keterangan</th>
                <th className="text-right">Debit</th><th className="text-right">Kredit</th>
                <th className="text-center">Status</th><th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Belum ada voucher</td></tr>}
              {filtered.map(v => {
                const group = (v.bukti || '').split('-')[1] || ''
                return (
                  <tr key={v.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{v.bukti}</td>
                    <td>{v.tanggal}</td>
                    <td><span className="badge blue">{group}</span></td>
                    <td>{v.keterangan}</td>
                    <td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(v.debit)}</td>
                    <td className="text-right mono" style={{ color: 'var(--primary)' }}>{formatRupiah(v.kredit)}</td>
                    <td className="text-center">
                      <span className={`badge ${v.status === 'posted' ? 'green' : 'orange'}`}>
                        {v.status === 'posted' ? 'Approved' : 'Pending'}
                      </span>
                    </td>
                    <td className="text-center">
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-icon btn-outline btn-sm" title="Detail" onClick={() => setShowDetail(v)}><Eye size={12} /></button>
                        <button className="btn btn-icon btn-outline btn-sm" title="Cetak" onClick={() => printVoucher(v)}><Printer size={12} /></button>
                        {v.status === 'pending' && (
                          <button className="btn btn-icon btn-sm btn-primary" title="Approve" onClick={() => handleApprove(v.id)}><Check size={12} /></button>
                        )}
                        {v.status === 'posted' && (
                          <button className="btn btn-icon btn-outline btn-sm" title="Unapprove" onClick={() => handleUnapprove(v.id)}><X size={12} /></button>
                        )}
                        {v.status === 'pending' && (
                          <button className="btn btn-icon btn-outline btn-sm" style={{ color: 'var(--danger)' }} title="Hapus" onClick={() => setShowDeleteConfirm(v.id)}><Trash2 size={12} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE VOUCHER MODAL */}
      {showModal && (
        <Modal title="Buat Voucher Baru" onClose={() => setShowModal(false)} width={900} footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowModal(false)}>Batal</button>
            <button className="btn btn-primary" disabled={!isBalanced} onClick={handleSave}>
              {isBalanced ? 'Simpan Voucher' : 'Debit ≠ Kredit'}
            </button>
          </>
        }>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Grup Transaksi</label>
              <select className="form-select" value={voucherForm.groupTransaksi} onChange={e => setVoucherForm(f => ({ ...f, groupTransaksi: e.target.value }))}>
                {GROUP_TRANSAKSI.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tanggal</label>
              <input className="form-input" type="date" value={voucherForm.tanggal} onChange={e => setVoucherForm(f => ({ ...f, tanggal: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Keterangan</label>
            <input className="form-input" placeholder="Deskripsi voucher..." value={voucherForm.keterangan} onChange={e => setVoucherForm(f => ({ ...f, keterangan: e.target.value }))} />
          </div>

          {/* Multi-line entry */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>Baris Transaksi</label>
              <button className="btn btn-sm btn-outline" onClick={addLine}><Plus size={14} /> Tambah Baris</button>
            </div>
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={{ width: 40, padding: '8px 4px' }}>#</th>
                  <th style={{ padding: '8px 4px' }}>Akun</th>
                  <th style={{ padding: '8px 4px', width: 180 }}>Keterangan</th>
                  <th style={{ padding: '8px 4px', width: 140 }} className="text-right">Debit</th>
                  <th style={{ padding: '8px 4px', width: 140 }} className="text-right">Kredit</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {voucherForm.lines.map((line, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '4px' }}>{idx + 1}</td>
                    <td style={{ padding: '4px' }}>
                      <SearchableSelect value={line.akun} onChange={val => updateLine(idx, 'akun', val)} options={akunOptions} placeholder="Pilih akun..." />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input className="form-input" style={{ padding: '6px 8px', fontSize: 12 }} value={line.keterangan} onChange={e => updateLine(idx, 'keterangan', e.target.value)} placeholder="Ket. baris" />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input className="form-input" type="number" style={{ padding: '6px 8px', fontSize: 12, textAlign: 'right' }} value={line.debit || ''} onChange={e => updateLine(idx, 'debit', e.target.value)} placeholder="0" />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input className="form-input" type="number" style={{ padding: '6px 8px', fontSize: 12, textAlign: 'right' }} value={line.kredit || ''} onChange={e => updateLine(idx, 'kredit', e.target.value)} placeholder="0" />
                    </td>
                    <td style={{ padding: '4px' }}>
                      {voucherForm.lines.length > 2 && (
                        <button className="btn btn-icon btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeLine(idx)}><X size={12} /></button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td colSpan={3} className="text-right" style={{ padding: '8px 4px' }}>TOTAL</td>
                  <td className="text-right mono" style={{ padding: '8px 4px', color: 'var(--success)' }}>{formatRupiah(totalDebit)}</td>
                  <td className="text-right mono" style={{ padding: '8px 4px', color: 'var(--primary)' }}>{formatRupiah(totalKredit)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            {!isBalanced && totalDebit > 0 && (
              <div style={{ padding: '8px 12px', background: 'rgba(229,77,66,0.1)', borderRadius: 6, marginTop: 8, fontSize: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚠️ Selisih: {formatRupiah(Math.abs(totalDebit - totalKredit))} — Total Debit harus sama dengan Total Kredit
              </div>
            )}
            {isBalanced && (
              <div style={{ padding: '8px 12px', background: 'var(--success-light)', borderRadius: 6, marginTop: 8, fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                ✓ Balance — Voucher siap disimpan
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* DETAIL MODAL */}
      {showDetail && (
        <Modal title={`Detail Voucher ${showDetail.bukti}`} onClose={() => setShowDetail(null)} width={700} footer={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => printVoucher(showDetail)}><Printer size={14} /> Cetak</button>
            <button className="btn btn-outline" onClick={() => setShowDetail(null)}>Tutup</button>
          </div>
        }>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="form-row">
              <div><span className="form-label">No. Bukti</span><p className="mono" style={{ fontWeight: 600 }}>{showDetail.bukti}</p></div>
              <div><span className="form-label">Tanggal</span><p>{showDetail.tanggal}</p></div>
              <div><span className="form-label">Status</span><span className={`badge ${showDetail.status === 'posted' ? 'green' : 'orange'}`}>{showDetail.status === 'posted' ? 'Approved' : 'Pending'}</span></div>
            </div>
            <div><span className="form-label">Keterangan</span><p>{showDetail.keterangan}</p></div>
            {showDetail.lines && (() => {
              const lines = JSON.parse(showDetail.lines)
              return (
                <div className="table-container">
                  <table style={{ fontSize: 13 }}>
                    <thead><tr><th>#</th><th>Akun</th><th>Keterangan</th><th className="text-right">Debit</th><th className="text-right">Kredit</th></tr></thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i}><td>{i + 1}</td><td>{l.akun}</td><td>{l.keterangan || '-'}</td>
                          <td className="text-right mono">{l.debit ? formatRupiah(l.debit) : '-'}</td>
                          <td className="text-right mono">{l.kredit ? formatRupiah(l.kredit) : '-'}</td></tr>
                      ))}
                      <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                        <td colSpan={3}>TOTAL</td>
                        <td className="text-right mono">{formatRupiah(lines.reduce((s, l) => s + (l.debit || 0), 0))}</td>
                        <td className="text-right mono">{formatRupiah(lines.reduce((s, l) => s + (l.kredit || 0), 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>
        </Modal>
      )}

      {/* DELETE CONFIRM */}
      {showDeleteConfirm && (
        <Modal title="Konfirmasi Hapus" onClose={() => setShowDeleteConfirm(null)} footer={
          <><button className="btn btn-outline" onClick={() => setShowDeleteConfirm(null)}>Batal</button>
            <button className="btn btn-danger" onClick={() => handleDelete(showDeleteConfirm)}>Hapus Voucher</button></>
        }>
          <p>Apakah Anda yakin ingin menghapus voucher ini?</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Tindakan ini tidak dapat dibatalkan.</p>
        </Modal>
      )}
    </div>
  )
}
