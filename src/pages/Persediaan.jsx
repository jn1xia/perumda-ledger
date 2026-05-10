import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, X, Save } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'

export default function Persediaan() {
  const { state, dispatch } = useApp()
  const inventory = state.inventory || []
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ kode: '', nama: '', satuan: 'Unit', stokAwal: 0, masuk: 0, keluar: 0, hargaSatuan: 0 })

  const filtered = inventory.filter(p =>
    p.nama.toLowerCase().includes(search.toLowerCase()) || p.kode.toLowerCase().includes(search.toLowerCase())
  )
  const totalNilai = inventory.reduce((s, p) => s + (p.nilaiTotal || 0), 0)
  const lowStock = inventory.filter(p => (p.stokAkhir || 0) < 10).length

  const resetForm = () => {
    setForm({ kode: '', nama: '', satuan: 'Unit', stokAwal: 0, masuk: 0, keluar: 0, hargaSatuan: 0 })
    setEditItem(null)
    setShowForm(false)
  }

  const handleEdit = (item) => {
    setEditItem(item)
    setForm({ ...item })
    setShowForm(true)
  }

  const handleSubmit = () => {
    if (!form.nama || !form.kode) return alert('Kode dan Nama wajib diisi')
    const stokAkhir = Number(form.stokAwal) + Number(form.masuk) - Number(form.keluar)
    const nilaiTotal = stokAkhir * Number(form.hargaSatuan)
    const record = { ...form, stokAwal: Number(form.stokAwal), masuk: Number(form.masuk), keluar: Number(form.keluar), stokAkhir, hargaSatuan: Number(form.hargaSatuan), nilaiTotal }

    if (editItem) {
      dispatch({ type: 'UPDATE_INVENTORY', payload: record })
    } else {
      dispatch({ type: 'ADD_INVENTORY', payload: record })
    }
    resetForm()
  }

  const handleDelete = (kode) => {
    if (confirm('Hapus item persediaan ini?')) {
      dispatch({ type: 'DELETE_INVENTORY', payload: kode })
    }
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Persediaan</h1>
        <p>Manajemen stok dan inventaris</p>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20}}>
        <div className="kpi-card">
          <div className="kpi-label">Total Jenis Barang</div>
          <div className="kpi-value">{inventory.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Nilai Persediaan</div>
          <div className="kpi-value" style={{fontSize:18}}>{formatRupiah(totalNilai)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Stok Rendah (&lt;10)</div>
          <div className="kpi-value" style={{color:'var(--warning)'}}>{lowStock}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="topbar-search" style={{maxWidth: 300}}>
          <Search /><input type="text" placeholder="Cari barang..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true) }}><Plus size={16} /> Tambah Barang</button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{marginBottom: 20, padding: 20}}>
          <div className="card-header" style={{marginBottom: 16}}>
            <div className="card-title">{editItem ? 'Edit Barang' : 'Tambah Barang Baru'}</div>
            <button className="btn btn-outline" onClick={resetForm}><X size={16} /></button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Kode</label>
              <input className="form-input" value={form.kode} onChange={e => setForm({...form, kode: e.target.value})} placeholder="INV-006" disabled={!!editItem} />
            </div>
            <div className="form-group">
              <label className="form-label">Nama Barang</label>
              <input className="form-input" value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} placeholder="Nama barang" />
            </div>
            <div className="form-group">
              <label className="form-label">Satuan</label>
              <select className="form-select" value={form.satuan} onChange={e => setForm({...form, satuan: e.target.value})}>
                <option>Unit</option><option>Liter</option><option>Pak</option><option>Kaleng</option><option>Kg</option><option>Meter</option><option>Roll</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Stok Awal</label>
              <input className="form-input" type="number" value={form.stokAwal} onChange={e => setForm({...form, stokAwal: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Masuk</label>
              <input className="form-input" type="number" value={form.masuk} onChange={e => setForm({...form, masuk: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Keluar</label>
              <input className="form-input" type="number" value={form.keluar} onChange={e => setForm({...form, keluar: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Harga Satuan</label>
              <input className="form-input" type="number" value={form.hargaSatuan} onChange={e => setForm({...form, hargaSatuan: e.target.value})} />
            </div>
          </div>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:12}}>
            <button className="btn btn-outline" onClick={resetForm}>Batal</button>
            <button className="btn btn-primary" onClick={handleSubmit}><Save size={16} /> {editItem ? 'Simpan Perubahan' : 'Tambah'}</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table>
            <thead><tr><th>Kode</th><th>Nama Barang</th><th>Satuan</th><th className="text-right">Stok Awal</th><th className="text-right">Masuk</th><th className="text-right">Keluar</th><th className="text-right">Stok Akhir</th><th className="text-right">Harga Satuan</th><th className="text-right">Nilai Total</th><th className="text-center">Aksi</th></tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.kode}>
                  <td className="mono">{p.kode}</td>
                  <td style={{fontWeight:500}}>{p.nama}</td>
                  <td>{p.satuan}</td>
                  <td className="text-right">{(p.stokAwal||0).toLocaleString('id-ID')}</td>
                  <td className="text-right" style={{color:'var(--success)'}}>{(p.masuk||0).toLocaleString('id-ID')}</td>
                  <td className="text-right" style={{color:'var(--danger)'}}>{(p.keluar||0).toLocaleString('id-ID')}</td>
                  <td className="text-right" style={{fontWeight:600}}>{(p.stokAkhir||0).toLocaleString('id-ID')}</td>
                  <td className="text-right mono">{formatRupiah(p.hargaSatuan||0)}</td>
                  <td className="text-right mono" style={{fontWeight:600}}>{formatRupiah(p.nilaiTotal||0)}</td>
                  <td className="text-center">
                    <div style={{display:'flex', gap:4, justifyContent:'center'}}>
                      <button className="btn btn-sm btn-outline" onClick={() => handleEdit(p)}><Pencil size={14} /></button>
                      <button className="btn btn-sm btn-outline" style={{color:'var(--danger)'}} onClick={() => handleDelete(p.kode)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={10} style={{textAlign:'center', padding:20, color:'var(--text-muted)'}}>Tidak ada data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Penyusutan Peralatan Section */}
      <div className="card" style={{marginTop:24}}>
        <div className="card-header" style={{padding:20, borderBottom:'1px solid var(--border)'}}>
          <div className="card-title">Rekapitulasi Beban Penyusutan Peralatan</div>
        </div>
        <div className="table-container">
          <table style={{fontSize:12}}>
            <thead>
              <tr>
                <th>Uraian Peralatan</th>
                <th className="text-right">Nilai Perolehan</th>
                <th className="text-right">Masa Manfaat</th>
                <th className="text-right">Beban Penyusutan Bln Ini</th>
                <th className="text-right">Akumulasi Penyusutan</th>
              </tr>
            </thead>
            <tbody>
              {state.assets.filter(a => a.kategori === 'Peralatan').map(a => {
                 const perolehan = a.nilai_perolehan || 0
                 const rate = 0.25 // Default for Peralatan
                 const blnIni = Math.floor((perolehan * rate) / 12)
                 return (
                   <tr key={a.kode}>
                     <td>{a.nama}</td>
                     <td className="text-right mono">{formatRupiah(perolehan)}</td>
                     <td className="text-right">{a.umur_manfaat}</td>
                     <td className="text-right mono" style={{color:'var(--primary)'}}>{formatRupiah(blnIni)}</td>
                     <td className="text-right mono">{formatRupiah(a.nilai_penyusutan + blnIni)}</td>
                   </tr>
                 )
              })}
              {state.assets.filter(a => a.kategori === 'Peralatan').length === 0 && (
                <tr><td colSpan={5} style={{textAlign:'center', padding:20, color:'var(--text-muted)'}}>Tidak ada aset peralatan</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
