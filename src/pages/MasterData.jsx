import { useState, useMemo } from 'react'
import { Plus, Search, Pencil, Trash2, X, Save, Users, Truck, Download, Printer } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { exportCSV } from '../utils/exportUtils.js'
import Modal from '../components/UI/Modal.jsx'

const TABS = [
  { id: 'pelanggan', label: 'Pelanggan', icon: Users },
  { id: 'supplier', label: 'Supplier', icon: Truck },
]

const emptyPelanggan = { kode: '', nama: '', alamat: '', kota: '', telepon: '', npwp: '', email: '', kontak: '', keterangan: '' }
const emptySupplier = { kode: '', nama: '', alamat: '', kota: '', telepon: '', npwp: '', email: '', kontak: '', keterangan: '' }

export default function MasterData() {
  const { state, dispatch } = useApp()
  const pelangganList = state.pelangganMaster || []
  const supplierList = state.supplierMaster || []
  const [tab, setTab] = useState('pelanggan')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ ...emptyPelanggan })

  const isPelanggan = tab === 'pelanggan'
  const list = isPelanggan ? pelangganList : supplierList

  const filtered = useMemo(() => {
    if (!search) return list
    return list.filter(item =>
      (item.nama || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.kode || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.npwp || '').toLowerCase().includes(search.toLowerCase())
    )
  }, [list, search])

  function openAdd() {
    setForm(isPelanggan ? { ...emptyPelanggan } : { ...emptySupplier })
    setEditId(null)
    setShowModal(true)
  }

  function openEdit(item) {
    setForm({ ...item })
    setEditId(item.id)
    setShowModal(true)
  }

  function handleSave() {
    if (!form.nama) return alert('Nama wajib diisi')
    if (editId) {
      dispatch({ type: isPelanggan ? 'UPDATE_PELANGGAN' : 'UPDATE_SUPPLIER', payload: { ...form, id: editId } })
    } else {
      dispatch({ type: isPelanggan ? 'ADD_PELANGGAN' : 'ADD_SUPPLIER', payload: form })
    }
    setShowModal(false)
  }

  function handleDelete(id) {
    if (!confirm(`Hapus ${isPelanggan ? 'pelanggan' : 'supplier'} ini?`)) return
    dispatch({ type: isPelanggan ? 'DELETE_PELANGGAN' : 'DELETE_SUPPLIER', payload: id })
  }

  function handleExport() {
    const label = isPelanggan ? 'Pelanggan' : 'Supplier'
    exportCSV(`Master_${label}`, ['Kode', 'Nama', 'Alamat', 'Kota', 'Telepon', 'NPWP', 'Email', 'Kontak', 'Keterangan'],
      list.map(i => [i.kode, i.nama, i.alamat, i.kota, i.telepon, i.npwp, i.email, i.kontak, i.keterangan]))
  }

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Master Data</h1>
          <p>Data pelanggan & supplier — {pelangganList.length} pelanggan, {supplierList.length} supplier</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={handleExport}><Download size={16} /> Export</button>
          <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> Cetak</button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => { setTab(t.id); setSearch('') }}>
            <t.icon size={16} /> {t.label}
            <span className="badge blue" style={{ marginLeft: 6, fontSize: 11 }}>{t.id === 'pelanggan' ? pelangganList.length : supplierList.length}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="topbar-search" style={{ maxWidth: 300 }}>
          <Search /><input type="text" placeholder={`Cari ${isPelanggan ? 'pelanggan' : 'supplier'}...`} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Tambah {isPelanggan ? 'Pelanggan' : 'Supplier'}</button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Kode</th><th>Nama</th><th>Alamat</th><th>Kota</th>
                <th>Telepon</th><th>NPWP</th><th>Email</th><th>Kontak</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{item.kode}</td>
                  <td style={{ fontWeight: 500 }}>{item.nama}</td>
                  <td style={{ fontSize: 12 }}>{item.alamat || '-'}</td>
                  <td>{item.kota || '-'}</td>
                  <td>{item.telepon || '-'}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{item.npwp || '-'}</td>
                  <td style={{ fontSize: 12 }}>{item.email || '-'}</td>
                  <td>{item.kontak || '-'}</td>
                  <td className="text-center">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="btn btn-sm btn-outline" onClick={() => openEdit(item)}><Pencil size={12} /></button>
                      <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(item.id)}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Belum ada data {isPelanggan ? 'pelanggan' : 'supplier'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title={`${editId ? 'Edit' : 'Tambah'} ${isPelanggan ? 'Pelanggan' : 'Supplier'}`} onClose={() => setShowModal(false)} width={640} footer={
          <><button className="btn btn-outline" onClick={() => setShowModal(false)}>Batal</button>
            <button className="btn btn-primary" onClick={handleSave}><Save size={16} /> {editId ? 'Simpan' : 'Tambah'}</button></>
        }>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Kode</label>
              <input className="form-input" value={form.kode} onChange={e => setForm({ ...form, kode: e.target.value })} placeholder={isPelanggan ? 'PLG-001' : 'SUP-001'} />
            </div>
            <div className="form-group">
              <label className="form-label">Nama *</label>
              <input className="form-input" value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} placeholder={isPelanggan ? 'Nama pelanggan' : 'Nama supplier'} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Alamat</label>
            <input className="form-input" value={form.alamat} onChange={e => setForm({ ...form, alamat: e.target.value })} placeholder="Jl. ..." />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Kota</label>
              <input className="form-input" value={form.kota} onChange={e => setForm({ ...form, kota: e.target.value })} placeholder="Banjarmasin" />
            </div>
            <div className="form-group">
              <label className="form-label">Telepon</label>
              <input className="form-input" value={form.telepon} onChange={e => setForm({ ...form, telepon: e.target.value })} placeholder="0511-xxx" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">NPWP</label>
              <input className="form-input" value={form.npwp} onChange={e => setForm({ ...form, npwp: e.target.value })} placeholder="XX.XXX.XXX.X-XXX.XXX" />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@domain.com" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Contact Person</label>
              <input className="form-input" value={form.kontak} onChange={e => setForm({ ...form, kontak: e.target.value })} placeholder="Nama kontak" />
            </div>
            <div className="form-group">
              <label className="form-label">Keterangan</label>
              <input className="form-input" value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} placeholder="Catatan tambahan" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
