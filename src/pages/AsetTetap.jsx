import { useState, useMemo } from 'react'
import { Plus, Search, Edit2, Trash2, Building2, Truck, Wrench, MapPin, Calculator, Download } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import Modal from '../components/UI/Modal.jsx'
import { exportCSV } from '../utils/exportUtils.js'

const emptyForm = {
  nama: '', kategori: 'Peralatan', tgl_perolehan: new Date().toISOString().split('T')[0],
  nilai_perolehan: '', nilai_penyusutan: '0', umur_manfaat: '8 tahun',
}

// Depreciation rates per category (straight-line per year)
const DEPR_RATES = { Tanah: 0, Bangunan: 0.05, Kendaraan: 0.125, Mesin: 0.125, 'Instalasi Listrik': 0.125, Peralatan: 0.25 }
const CATEGORY_ICONS = { Tanah: MapPin, Bangunan: Building2, Kendaraan: Truck, Mesin: Wrench, 'Instalasi Listrik': Wrench, Peralatan: Wrench }
const CATEGORY_COLORS = { Tanah: '#10B981', Bangunan: '#3B82F6', Kendaraan: '#F59E0B', Mesin: '#8B5CF6', 'Instalasi Listrik': '#EC4899', Peralatan: '#6366F1' }

function computeAutoDepreciation(asset) {
  const rate = DEPR_RATES[asset.kategori] || 0
  if (rate === 0) return 0
  const perolehan = new Date(asset.tgl_perolehan)
  const now = new Date()
  const years = (now - perolehan) / (365.25 * 24 * 60 * 60 * 1000)
  return Math.min(Math.floor(asset.nilai_perolehan * rate * years), asset.nilai_perolehan)
}

export default function AsetTetap() {
  const { state, dispatch } = useApp()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [editKode, setEditKode] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [filterCategory, setFilterCategory] = useState('all')

  const filtered = state.assets.filter(a => {
    const matchSearch = a.nama.toLowerCase().includes(search.toLowerCase()) || a.kode.toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCategory === 'all' || a.kategori === filterCategory
    return matchSearch && matchCat
  })

  const totalPerolehan = state.assets.reduce((s, a) => s + a.nilai_perolehan, 0)
  const totalPenyusutan = state.assets.reduce((s, a) => s + a.nilai_penyusutan, 0)
  const totalBuku = state.assets.reduce((s, a) => s + a.nilai_buku, 0)

  // Category recap
  const categoryRecap = useMemo(() => {
    const cats = ['Tanah', 'Bangunan', 'Kendaraan', 'Mesin', 'Instalasi Listrik', 'Peralatan']
    return cats.map(cat => {
      const items = state.assets.filter(a => a.kategori === cat)
      const perolehan = items.reduce((s, a) => s + a.nilai_perolehan, 0)
      const penyusutan = items.reduce((s, a) => s + a.nilai_penyusutan, 0)
      const autoPenyusutan = items.reduce((s, a) => s + computeAutoDepreciation(a), 0)
      return { kategori: cat, jumlah: items.length, perolehan, penyusutan, autoPenyusutan, buku: perolehan - penyusutan, rate: DEPR_RATES[cat] }
    }).filter(c => c.jumlah > 0)
  }, [state.assets])

  function openAdd() {
    setForm(emptyForm)
    setEditKode(null)
    setShowModal(true)
  }

  function openEdit(asset) {
    setForm({
      nama: asset.nama, kategori: asset.kategori, tgl_perolehan: asset.tgl_perolehan,
      nilai_perolehan: String(asset.nilai_perolehan), nilai_penyusutan: String(asset.nilai_penyusutan),
      umur_manfaat: asset.umur_manfaat,
    })
    setEditKode(asset.kode)
    setShowModal(true)
  }

  function handleSave() {
    const perolehan = Number(form.nilai_perolehan) || 0
    const penyusutan = Number(form.nilai_penyusutan) || 0
    const entry = {
      nama: form.nama, kategori: form.kategori, tgl_perolehan: form.tgl_perolehan,
      nilai_perolehan: perolehan, nilai_penyusutan: penyusutan,
      nilai_buku: perolehan - penyusutan, umur_manfaat: form.umur_manfaat,
    }
    if (editKode) {
      dispatch({ type: 'UPDATE_ASSET', payload: { ...entry, kode: editKode } })
    } else {
      dispatch({ type: 'ADD_ASSET', payload: entry })
    }
    setShowModal(false)
  }

  function handleDelete(kode) {
    dispatch({ type: 'DELETE_ASSET', payload: kode })
    setShowDeleteConfirm(null)
  }

  function handleExportAssets() {
    exportCSV('Rekap_Aset_Tetap', ['Kode','Nama','Kategori','Tgl Perolehan','Nilai Perolehan','Akum Penyusutan','Nilai Buku','Umur Manfaat'],
      state.assets.map(a => [a.kode, a.nama, a.kategori, a.tgl_perolehan, a.nilai_perolehan, a.nilai_penyusutan, a.nilai_buku, a.umur_manfaat])
    )
  }

  const isFormValid = form.nama && form.tgl_perolehan && Number(form.nilai_perolehan) > 0

  return (
    <div className="animate-in">
      <div className="page-header" style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
        <div>
          <h1>Aset Tetap</h1>
          <p>Manajemen aset tetap perusahaan — {state.assets.length} aset | Penyusutan metode garis lurus (SAK EP)</p>
        </div>
        <button className="btn btn-outline" style={{display:'flex', alignItems:'center', gap:6}} onClick={handleExportAssets}><Download size={16} /> Unduh Excel Rekap</button>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Nilai Perolehan</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{formatRupiah(totalPerolehan)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Akum. Penyusutan</div>
          <div className="kpi-value" style={{ fontSize: 18, color: 'var(--danger)' }}>{formatRupiah(totalPenyusutan)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Nilai Buku</div>
          <div className="kpi-value" style={{ fontSize: 18, color: 'var(--primary)' }}>{formatRupiah(totalBuku)}</div>
        </div>
      </div>

      {/* Category Recap — Rekapan Aset per Kategori */}
      <div className="card" style={{marginBottom:20, padding:20}}>
        <div style={{fontWeight:600, marginBottom:16, display:'flex', alignItems:'center', gap:8}}><Calculator size={18} color="var(--primary)" /> Rekapan Penyusutan per Kategori</div>
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Kategori</th><th className="text-center">Jumlah Aset</th><th className="text-right">Nilai Perolehan</th><th className="text-right">Tarif/Tahun</th><th className="text-right">Akum. Penyusutan</th><th className="text-right">Nilai Buku</th></tr>
            </thead>
            <tbody>
              {categoryRecap.map(c => {
                const Icon = CATEGORY_ICONS[c.kategori]
                return (
                  <tr key={c.kategori} style={{cursor:'pointer'}} onClick={() => setFilterCategory(filterCategory === c.kategori ? 'all' : c.kategori)}>
                    <td style={{fontWeight:500}}><span style={{display:'flex', alignItems:'center', gap:8}}><Icon size={16} color={CATEGORY_COLORS[c.kategori]} />{c.kategori}</span></td>
                    <td className="text-center"><span className="badge blue">{c.jumlah}</span></td>
                    <td className="text-right mono">{formatRupiah(c.perolehan)}</td>
                    <td className="text-right">{c.rate > 0 ? `${(c.rate*100).toFixed(1)}%` : 'N/A'}</td>
                    <td className="text-right mono" style={{color:'var(--danger)'}}>{formatRupiah(c.penyusutan)}</td>
                    <td className="text-right mono" style={{fontWeight:600}}>{formatRupiah(c.buku)}</td>
                  </tr>
                )
              })}
              <tr style={{fontWeight:700, borderTop:'2px solid var(--border)'}}>
                <td>TOTAL</td>
                <td className="text-center"><span className="badge blue">{state.assets.length}</span></td>
                <td className="text-right mono">{formatRupiah(totalPerolehan)}</td>
                <td></td>
                <td className="text-right mono" style={{color:'var(--danger)'}}>{formatRupiah(totalPenyusutan)}</td>
                <td className="text-right mono" style={{fontWeight:700, color:'var(--primary)'}}>{formatRupiah(totalBuku)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="toolbar">
        <div className="topbar-search" style={{ maxWidth: 300 }}>
          <Search /><input type="text" placeholder="Cari aset..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{width:'auto'}} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="all">Semua Kategori</option>
          <option value="Tanah">Tanah</option>
          <option value="Bangunan">Bangunan</option>
          <option value="Kendaraan">Kendaraan</option>
          <option value="Mesin">Mesin</option>
          <option value="Instalasi Listrik">Instalasi Listrik</option>
          <option value="Peralatan">Peralatan</option>
        </select>
        <div className="toolbar-right">
          <button className="btn btn-primary" id="btn-add-asset" onClick={openAdd}><Plus size={16} /> Tambah Aset</button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead><tr><th>Kode</th><th>Nama Aset</th><th>Kategori</th><th>Tgl Perolehan</th><th className="text-right">Nilai Perolehan</th><th className="text-right">Akum. Penyusutan</th><th className="text-right">Nilai Buku</th><th>Umur</th><th className="text-center">Aksi</th></tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Tidak ada aset ditemukan</td></tr>
              )}
              {filtered.map(a => (
                <tr key={a.kode}>
                  <td className="mono">{a.kode}</td>
                  <td style={{ fontWeight: 500 }}>{a.nama}</td>
                  <td><span className="badge blue">{a.kategori}</span></td>
                  <td>{a.tgl_perolehan}</td>
                  <td className="text-right mono">{formatRupiah(a.nilai_perolehan)}</td>
                  <td className="text-right mono" style={{ color: 'var(--danger)' }}>{formatRupiah(a.nilai_penyusutan)}</td>
                  <td className="text-right mono" style={{ fontWeight: 600 }}>{formatRupiah(a.nilai_buku)}</td>
                  <td>{a.umur_manfaat}</td>
                  <td className="text-center">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="btn btn-icon btn-outline btn-sm" onClick={() => openEdit(a)}><Edit2 size={14} /></button>
                      <button className="btn btn-icon btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setShowDeleteConfirm(a.kode)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title={editKode ? `Edit ${editKode}` : 'Tambah Aset Baru'} onClose={() => setShowModal(false)} width={600} footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowModal(false)}>Batal</button>
            <button className="btn btn-primary" disabled={!isFormValid} onClick={handleSave}>{editKode ? 'Simpan' : 'Tambah Aset'}</button>
          </>
        }>
          <div className="form-group">
            <label className="form-label">Nama Aset *</label>
            <input className="form-input" placeholder="Nama aset..." value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Kategori</label>
              <select className="form-select" value={form.kategori} onChange={e => setForm({ ...form, kategori: e.target.value })}>
                <option value="Tanah">Tanah</option>
                <option value="Bangunan">Bangunan</option>
                <option value="Kendaraan">Kendaraan</option>
                <option value="Mesin">Mesin</option>
                <option value="Instalasi Listrik">Instalasi Listrik</option>
                <option value="Peralatan">Peralatan</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tanggal Perolehan *</label>
              <input className="form-input" type="date" value={form.tgl_perolehan} onChange={e => setForm({ ...form, tgl_perolehan: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nilai Perolehan (Rp) *</label>
              <input className="form-input" type="number" placeholder="0" value={form.nilai_perolehan} onChange={e => setForm({ ...form, nilai_perolehan: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Akum. Penyusutan (Rp)</label>
              <input className="form-input" type="number" placeholder="0" value={form.nilai_penyusutan} onChange={e => setForm({ ...form, nilai_penyusutan: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Umur Manfaat</label>
            <select className="form-select" value={form.umur_manfaat} onChange={e => setForm({ ...form, umur_manfaat: e.target.value })}>
              <option value="-">Tidak disusutkan</option>
              <option value="4 tahun">4 tahun</option>
              <option value="8 tahun">8 tahun</option>
              <option value="10 tahun">10 tahun</option>
              <option value="20 tahun">20 tahun</option>
            </select>
          </div>
        </Modal>
      )}

      {showDeleteConfirm && (
        <Modal title="Konfirmasi Hapus" onClose={() => setShowDeleteConfirm(null)} footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowDeleteConfirm(null)}>Batal</button>
            <button className="btn btn-danger" onClick={() => handleDelete(showDeleteConfirm)}>Hapus Aset</button>
          </>
        }>
          <p>Apakah Anda yakin ingin menghapus aset <strong>{showDeleteConfirm}</strong>?</p>
        </Modal>
      )}
    </div>
  )
}
