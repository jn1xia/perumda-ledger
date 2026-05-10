import { useState } from 'react'
import { ChevronRight, Plus, Edit2, Trash2, Search, ArrowUpDown, Layers } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import Modal from '../components/UI/Modal.jsx'
import { formatRupiah } from '../data/sampleData.js'

const categoryColors = { Aset: 'blue', Kewajiban: 'red', Ekuitas: 'purple', Pendapatan: 'green', Beban: 'orange' }

const DEPARTEMEN_OPTIONS = [
  '', 'Operasional', 'Keuangan', 'SDM', 'Pemasaran', 'Pengadaan', 'IT', 'Umum', 'Produksi'
]

function COARow({ item, depth = 0, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = item.children && item.children.length > 0

  return (
    <>
      <tr className="tree-row" onClick={() => hasChildren && setExpanded(!expanded)}>
        <td>
          <span className="tree-indent" style={{ paddingLeft: depth * 24 }}>
            {hasChildren && (
              <span className={`tree-toggle ${expanded ? 'expanded' : ''}`}>
                <ChevronRight size={16} />
              </span>
            )}
            {!hasChildren && <span style={{ width: 20, display: 'inline-block' }} />}
            <span className="mono" style={{ fontWeight: hasChildren ? 600 : 400 }}>{item.code}</span>
          </span>
        </td>
        <td style={{ fontWeight: hasChildren ? 600 : 400 }}>{item.name}</td>
        <td><span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.kodeSortir || '-'}</span></td>
        <td>
          <span className={`badge ${item.type === 'posting' ? 'green' : 'gray'}`}>
            {item.type === 'posting' ? 'Posting' : 'Parent'}
          </span>
        </td>
        <td>
          <span className={`badge ${categoryColors[item.category] || 'gray'}`}>
            {item.category}
          </span>
        </td>
        <td>{item.kodeDepartemen ? <span className="badge gray" style={{ fontSize: 11 }}>{item.kodeDepartemen}</span> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>-</span>}</td>
        <td className="text-right mono" style={{ fontSize: 13 }}>
          {item.saldoAwal ? formatRupiah(item.saldoAwal) : '-'}
        </td>
        <td className="text-center">
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button className="btn btn-icon btn-outline btn-sm" onClick={e => { e.stopPropagation(); onEdit(item) }}><Edit2 size={14} /></button>
            {item.type === 'posting' && (
              <button className="btn btn-icon btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={e => { e.stopPropagation(); onDelete(item) }}><Trash2 size={14} /></button>
            )}
          </div>
        </td>
      </tr>
      {expanded && hasChildren && item.children.map(child => (
        <COARow key={child.code} item={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  )
}

const emptyForm = {
  code: '', name: '', type: 'posting', category: 'Aset',
  parentCode: '', kodeSortir: '', saldoAwal: 0, kodeDepartemen: ''
}

export default function COA() {
  const { state, dispatch } = useApp()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [editCode, setEditCode] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [activeTab, setActiveTab] = useState('tree') // 'tree' | 'flat'

  const parentAccounts = state.coaFlat.filter(a => a.type === 'parent')

  // Flat view with search
  const flatFiltered = state.coaFlat.filter(a =>
    !search ||
    a.code.toLowerCase().includes(search.toLowerCase()) ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.kodeSortir || '').toLowerCase().includes(search.toLowerCase())
  )

  function openAdd() {
    setForm(emptyForm)
    setEditCode(null)
    setShowModal(true)
  }

  function openEdit(item) {
    setForm({
      code: item.code, name: item.name, type: item.type, category: item.category,
      parentCode: '', kodeSortir: item.kodeSortir || '', saldoAwal: item.saldoAwal || 0,
      kodeDepartemen: item.kodeDepartemen || ''
    })
    setEditCode(item.code)
    setShowModal(true)
  }

  function handleSave() {
    if (editCode) {
      dispatch({
        type: 'UPDATE_ACCOUNT',
        payload: {
          code: editCode,
          updates: {
            name: form.name, category: form.category,
            kodeSortir: form.kodeSortir, saldoAwal: Number(form.saldoAwal),
            kodeDepartemen: form.kodeDepartemen
          }
        }
      })
    } else {
      dispatch({
        type: 'ADD_ACCOUNT',
        payload: {
          parentCode: form.parentCode || null,
          account: {
            code: form.code, name: form.name, type: form.type, category: form.category,
            kodeSortir: form.kodeSortir, saldoAwal: Number(form.saldoAwal),
            kodeDepartemen: form.kodeDepartemen
          }
        }
      })
    }
    setShowModal(false)
  }

  function handleDelete(item) {
    dispatch({ type: 'DELETE_ACCOUNT', payload: item.code })
    setShowDeleteConfirm(null)
  }

  const totalPosting = state.coaFlat.filter(a => a.type === 'posting').length
  const totalParent = state.coaFlat.filter(a => a.type === 'parent').length
  const isFormValid = editCode ? form.name : (form.code && form.name)

  // Sorted flat list by kodeSortir then code
  const sortedFlat = [...flatFiltered].sort((a, b) => {
    if (a.kodeSortir && b.kodeSortir) return a.kodeSortir.localeCompare(b.kodeSortir)
    if (a.kodeSortir) return -1
    if (b.kodeSortir) return 1
    return a.code.localeCompare(b.code)
  })

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Chart of Accounts</h1>
        <p>Bagan Akun — {totalPosting} akun posting, {totalParent} akun parent</p>
      </div>

      {/* KPI Summary */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Akun <Layers size={16} color="var(--primary)" /></div>
          <div className="kpi-value">{state.coaFlat.length}</div>
          <div className="kpi-trend up">{totalPosting} posting · {totalParent} parent</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Saldo Awal <ArrowUpDown size={16} color="var(--success)" /></div>
          <div className="kpi-value" style={{ fontSize: 16 }}>
            {formatRupiah(state.coaFlat.reduce((s, a) => s + (a.saldoAwal || 0), 0))}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Akun Berdepartemen</div>
          <div className="kpi-value">{state.coaFlat.filter(a => a.kodeDepartemen).length}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="topbar-search" style={{ maxWidth: 320 }}>
          <Search />
          <input type="text" placeholder="Cari kode, nama, atau kode sortir..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${activeTab === 'tree' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('tree')}>Tampilan Pohon</button>
          <button className={`btn ${activeTab === 'flat' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('flat')}>Tampilan Daftar</button>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" id="btn-add-coa" onClick={openAdd}><Plus size={16} /> Tambah Akun</button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '18%' }}>Kode Akun</th>
                <th style={{ width: '30%' }}>Nama Akun</th>
                <th style={{ width: '10%' }}>Kode Sortir</th>
                <th>Status</th>
                <th>Kategori</th>
                <th style={{ width: '12%' }}>Departemen</th>
                <th className="text-right" style={{ width: '12%' }}>Saldo Awal</th>
                <th className="text-center" style={{ width: '8%' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {activeTab === 'tree'
                ? state.coaTree.map(item => (
                    <COARow key={item.code} item={item} onEdit={openEdit} onDelete={item => setShowDeleteConfirm(item)} />
                  ))
                : sortedFlat.map(item => (
                    <tr key={item.code}>
                      <td className="mono" style={{ fontWeight: item.type === 'parent' ? 600 : 400 }}>{item.code}</td>
                      <td style={{ fontWeight: item.type === 'parent' ? 600 : 400 }}>{item.name}</td>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.kodeSortir || '-'}</td>
                      <td><span className={`badge ${item.type === 'posting' ? 'green' : 'gray'}`}>{item.type === 'posting' ? 'Posting' : 'Parent'}</span></td>
                      <td><span className={`badge ${categoryColors[item.category] || 'gray'}`}>{item.category}</span></td>
                      <td>{item.kodeDepartemen ? <span className="badge gray" style={{ fontSize: 11 }}>{item.kodeDepartemen}</span> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>-</span>}</td>
                      <td className="text-right mono" style={{ fontSize: 13 }}>{item.saldoAwal ? formatRupiah(item.saldoAwal) : '-'}</td>
                      <td className="text-center">
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button className="btn btn-icon btn-outline btn-sm" onClick={() => openEdit(item)}><Edit2 size={14} /></button>
                          {item.type === 'posting' && (
                            <button className="btn btn-icon btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setShowDeleteConfirm(item)}><Trash2 size={14} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD/EDIT MODAL */}
      {showModal && (
        <Modal
          title={editCode ? `Edit Akun ${editCode}` : 'Tambah Akun Baru'}
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Batal</button>
              <button className="btn btn-primary" disabled={!isFormValid} onClick={handleSave}>
                {editCode ? 'Simpan Perubahan' : 'Tambah Akun'}
              </button>
            </>
          }
        >
          {!editCode && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Kode Akun *</label>
                <input className="form-input" placeholder="Contoh: 11108" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Parent Akun</label>
                <select className="form-select" value={form.parentCode} onChange={e => setForm({ ...form, parentCode: e.target.value })}>
                  <option value="">— Root (level teratas) —</option>
                  {parentAccounts.map(a => (
                    <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Nama Akun *</label>
            <input className="form-input" placeholder="Nama akun..." value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-row">
            {!editCode && (
              <div className="form-group">
                <label className="form-label">Tipe</label>
                <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="posting">Posting</option>
                  <option value="parent">Parent</option>
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Kategori</label>
              <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="Aset">Aset</option>
                <option value="Kewajiban">Kewajiban</option>
                <option value="Ekuitas">Ekuitas</option>
                <option value="Pendapatan">Pendapatan</option>
                <option value="Beban">Beban</option>
              </select>
            </div>
          </div>
          {/* NEW: Kode Sortir, Saldo Awal, Kode Departemen */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Kode Sortir</label>
              <input className="form-input" placeholder="Contoh: A01, 001" value={form.kodeSortir} onChange={e => setForm({ ...form, kodeSortir: e.target.value })} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Digunakan untuk urutan laporan sortir</span>
            </div>
            <div className="form-group">
              <label className="form-label">Kode Departemen</label>
              <select className="form-select" value={form.kodeDepartemen} onChange={e => setForm({ ...form, kodeDepartemen: e.target.value })}>
                {DEPARTEMEN_OPTIONS.map(d => (
                  <option key={d} value={d}>{d || '— Tanpa Departemen —'}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Saldo Awal (Rp)</label>
            <input className="form-input" type="number" value={form.saldoAwal} onChange={e => setForm({ ...form, saldoAwal: e.target.value })} placeholder="0" />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Saldo neraca awal tahun buku</span>
          </div>
        </Modal>
      )}

      {/* DELETE CONFIRMATION */}
      {showDeleteConfirm && (
        <Modal title="Konfirmasi Hapus Akun" onClose={() => setShowDeleteConfirm(null)} footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowDeleteConfirm(null)}>Batal</button>
            <button className="btn btn-danger" onClick={() => handleDelete(showDeleteConfirm)}>Hapus Akun</button>
          </>
        }>
          <p>Apakah Anda yakin ingin menghapus akun <strong>{showDeleteConfirm.code} — {showDeleteConfirm.name}</strong>?</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>Pastikan tidak ada transaksi yang menggunakan akun ini.</p>
        </Modal>
      )}
    </div>
  )
}
