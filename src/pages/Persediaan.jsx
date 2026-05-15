import { useState, useMemo } from 'react'
import { Plus, Search, Pencil, Trash2, X, Save, Download, Printer, Package, AlertTriangle, BarChart2 } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { exportCSV } from '../utils/exportUtils.js'

const KATEGORI_BARANG = ['Alat Kebersihan', 'ATK', 'Bahan Baku', 'Perlengkapan', 'Suku Cadang', 'Lain-lain']
const LOKASI_GUDANG = ['Gudang Utama', 'Gudang Pasar A', 'Gudang Pasar B', 'Kantor']

export default function Persediaan() {
  const { state, dispatch } = useApp()
  const inventory = state.inventory || []
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [filterKategori, setFilterKategori] = useState('all')
  const [form, setForm] = useState({ kode: '', nama: '', satuan: 'Unit', stokAwal: 0, masuk: 0, keluar: 0, hargaSatuan: 0, kategori: 'Perlengkapan', lokasi: 'Gudang Utama', hargaJual: 0, minStok: 10 })

  const filtered = inventory.filter(p => {
    const matchSearch = p.nama.toLowerCase().includes(search.toLowerCase()) || p.kode.toLowerCase().includes(search.toLowerCase())
    const matchKategori = filterKategori === 'all' || (p.kategori || '') === filterKategori
    return matchSearch && matchKategori
  })
  const totalNilai = inventory.reduce((s, p) => s + (p.nilaiTotal || 0), 0)
  const lowStock = inventory.filter(p => (p.stokAkhir || 0) < (p.minStok || 10)).length

  const resetForm = () => {
    setForm({ kode: '', nama: '', satuan: 'Unit', stokAwal: 0, masuk: 0, keluar: 0, hargaSatuan: 0, kategori: 'Perlengkapan', lokasi: 'Gudang Utama', hargaJual: 0, minStok: 10 })
    setEditItem(null)
    setShowForm(false)
  }

  function handleExportInventory() {
    exportCSV('Persediaan', ['Kode', 'Nama', 'Kategori', 'Lokasi', 'Satuan', 'Stok Awal', 'Masuk', 'Keluar', 'Stok Akhir', 'Harga Satuan', 'Harga Jual', 'Nilai Total', 'Min Stok'],
      inventory.map(p => [p.kode, p.nama, p.kategori || '-', p.lokasi || '-', p.satuan, p.stokAwal, p.masuk, p.keluar, p.stokAkhir, p.hargaSatuan, p.hargaJual || 0, p.nilaiTotal, p.minStok || 10]))
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
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Persediaan</h1>
          <p>Manajemen stok dan inventaris — {inventory.length} jenis barang</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={handleExportInventory}><Download size={16} /> Export Excel</button>
          <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> Cetak</button>
        </div>
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
        <div className="topbar-search" style={{maxWidth: 260}}>
          <Search /><input type="text" placeholder="Cari barang..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={filterKategori} onChange={e => setFilterKategori(e.target.value)}>
          <option value="all">Semua Kategori</option>
          {KATEGORI_BARANG.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
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
              <label className="form-label">Kategori</label>
              <select className="form-select" value={form.kategori} onChange={e => setForm({...form, kategori: e.target.value})}>
                {KATEGORI_BARANG.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Satuan</label>
              <select className="form-select" value={form.satuan} onChange={e => setForm({...form, satuan: e.target.value})}>
                <option>Unit</option><option>Liter</option><option>Pak</option><option>Kaleng</option><option>Kg</option><option>Meter</option><option>Roll</option><option>Lembar</option><option>Set</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Lokasi / Gudang</label>
              <select className="form-select" value={form.lokasi} onChange={e => setForm({...form, lokasi: e.target.value})}>
                {LOKASI_GUDANG.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Min. Stok (alert)</label>
              <input className="form-input" type="number" value={form.minStok} onChange={e => setForm({...form, minStok: e.target.value})} />
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
            <thead><tr><th>Kode</th><th>Nama Barang</th><th>Satuan</th><th className="text-right">Stok Awal</th><th className="text-right">Masuk</th><th className="text-right">Keluar</th><th className="text-right">Stok Akhir</th><th className="text-right">Harga Satuan</th><th className="text-right">Nilai Total</th><th className="text-center">Tgl Input</th><th className="text-center">Aksi</th></tr></thead>
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
                  <td className="text-center" style={{fontSize:11, color:'var(--text-muted)'}}>{p.created_at ? new Date(p.created_at).toLocaleDateString('id-ID') : '-'}</td>
                  <td className="text-center">
                    <div style={{display:'flex', gap:4, justifyContent:'center'}}>
                      <button className="btn btn-sm btn-outline" onClick={() => handleEdit(p)}><Pencil size={14} /></button>
                      <button className="btn btn-sm btn-outline" style={{color:'var(--danger)'}} onClick={() => handleDelete(p.kode)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={11} style={{textAlign:'center', padding:20, color:'var(--text-muted)'}}>Tidak ada data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Opname (#21) */}
      <div className="card" style={{marginTop:24}}>
        <div className="card-header" style={{padding:'12px 20px', borderBottom:'1px solid var(--border)'}}>
          <div className="card-title"><Package size={16} /> Stock Opname — Perbandingan Stok Sistem vs Fisik</div>
          <button className="btn btn-sm btn-outline" onClick={() => {
            exportCSV('Stock_Opname', ['Kode','Nama','Kategori','Lokasi','Stok Sistem','Stok Fisik (input)','Selisih','Status'],
              inventory.map(p => [p.kode, p.nama, p.kategori||'-', p.lokasi||'-', p.stokAkhir||0, '', '', 'Belum Opname']))
          }}><Download size={14} /> Template Opname</button>
        </div>
        <div className="table-container">
          <table style={{fontSize:12}}>
            <thead><tr style={{background:'var(--bg-secondary)'}}>
              <th>Kode</th><th>Nama Barang</th><th>Kategori</th><th>Lokasi</th>
              <th className="text-right">Stok Sistem</th>
              <th className="text-right">Min Stok</th>
              <th className="text-center">Status</th>
            </tr></thead>
            <tbody>
              {inventory.map(p => {
                const stok = p.stokAkhir || 0
                const min = p.minStok || 10
                const isLow = stok < min
                const isEmpty = stok === 0
                return (
                  <tr key={p.kode} style={isEmpty ? {background:'rgba(239,68,68,0.05)'} : isLow ? {background:'rgba(245,158,11,0.05)'} : {}}>
                    <td className="mono">{p.kode}</td>
                    <td style={{fontWeight:500}}>{p.nama}</td>
                    <td>{p.kategori || '-'}</td>
                    <td>{p.lokasi || '-'}</td>
                    <td className="text-right mono" style={{fontWeight:600}}>{stok.toLocaleString('id-ID')}</td>
                    <td className="text-right mono">{min}</td>
                    <td className="text-center">
                      {isEmpty ? <span className="badge red">Habis</span>
                        : isLow ? <span className="badge orange">Stok Rendah</span>
                        : <span className="badge green">OK</span>}
                    </td>
                  </tr>
                )
              })}
              {inventory.length === 0 && <tr><td colSpan={7} style={{textAlign:'center',padding:20,color:'var(--text-muted)'}}>Belum ada data persediaan</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{padding:'12px 20px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text-secondary)'}}>
          <span>Total Item: {inventory.length}</span>
          <span>Stok Rendah: <strong style={{color:'var(--warning)'}}>{lowStock}</strong></span>
          <span>Habis: <strong style={{color:'var(--danger)'}}>{inventory.filter(p => (p.stokAkhir||0) === 0).length}</strong></span>
        </div>
      </div>

      {/* Penyusutan Peralatan Section */}
      <div className="card" style={{marginTop:24}}>
        <div className="card-header" style={{padding:20, borderBottom:'1px solid var(--border)'}}>
          <div className="card-title">Rekapitulasi Beban Penyusutan Peralatan (Bulanan)</div>
        </div>
        <div className="table-container">
          <table style={{fontSize:11}}>
            <thead>
              <tr style={{background:'var(--bg-secondary)'}}>
                <th rowSpan={2} style={{verticalAlign:'middle'}}>Uraian Peralatan</th>
                <th rowSpan={2} className="text-right" style={{verticalAlign:'middle'}}>Nilai Perolehan</th>
                <th colSpan={4} className="text-center">Beban Penyusutan 2026 (Rp)</th>
                <th rowSpan={2} className="text-right" style={{verticalAlign:'middle'}}>Akumulasi</th>
              </tr>
              <tr style={{background:'var(--bg-secondary)'}}>
                <th className="text-right">Januari</th>
                <th className="text-right">Februari</th>
                <th className="text-right">Maret</th>
                <th className="text-right">April</th>
              </tr>
            </thead>
            <tbody>
              {state.assets.filter(a => a.kategori === 'Peralatan').map(a => {
                 const perolehan = a.nilai_perolehan || 0
                 const blnIni = a.penyusutan_per_bulan || Math.floor((perolehan * 0.25) / 12)
                 const akum = (a.akum_penyusutan_maret_2026 || a.nilai_penyusutan) + (a.beban_penyusutan_maret_2026 || blnIni)
                 return (
                   <tr key={a.kode}>
                     <td>{a.nama}</td>
                     <td className="text-right mono">{formatRupiah(perolehan)}</td>
                     <td className="text-right mono">{formatRupiah(blnIni)}</td>
                     <td className="text-right mono">{formatRupiah(blnIni)}</td>
                     <td className="text-right mono">{formatRupiah(blnIni)}</td>
                     <td className="text-right mono" style={{background:'rgba(16,185,129,0.05)', fontWeight:600}}>{formatRupiah(blnIni)}</td>
                     <td className="text-right mono" style={{fontWeight:600}}>{formatRupiah(akum)}</td>
                   </tr>
                 )
              })}
              {state.assets.filter(a => a.kategori === 'Peralatan').length === 0 && (
                <tr><td colSpan={7} style={{textAlign:'center', padding:20, color:'var(--text-muted)'}}>Tidak ada aset peralatan</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
