import { useState, useMemo } from 'react'
import { Plus, Search, Pencil, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, Printer, Download, ArrowDownLeft, ArrowUpRight, CalendarClock, FileText, CreditCard } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import Modal from '../components/UI/Modal.jsx'
import { exportCSV } from '../utils/exportUtils.js'

const GIRO_TABS = [
  { id: 'masuk', label: 'Giro Masuk', icon: ArrowDownLeft },
  { id: 'keluar', label: 'Giro Keluar', icon: ArrowUpRight },
  { id: 'jatuh-tempo', label: 'Jatuh Tempo', icon: CalendarClock },
  { id: 'laporan', label: 'Laporan', icon: FileText },
]

const STATUS_MAP = {
  'belum': { label: 'Belum Jatuh Tempo', color: 'blue' },
  'jatuh-tempo': { label: 'Jatuh Tempo', color: 'orange' },
  'cair': { label: 'Dicairkan', color: 'green' },
  'tolak': { label: 'Ditolak', color: 'red' },
}

const emptyForm = {
  noGiro: '', tanggal: new Date().toISOString().split('T')[0], jatuhTempo: '',
  pihak: '', bank: '', jumlah: 0, keterangan: '', tipe: 'masuk', status: 'belum',
}

export default function Giro() {
  const { state, dispatch } = useApp()
  const giroList = state.giro || []
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('masuk')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const stats = useMemo(() => {
    const masuk = giroList.filter(g => g.tipe === 'masuk')
    const keluar = giroList.filter(g => g.tipe === 'keluar')
    const today = new Date().toISOString().split('T')[0]
    const jtMasuk = masuk.filter(g => g.status === 'belum' && g.jatuhTempo <= today).length
    const jtKeluar = keluar.filter(g => g.status === 'belum' && g.jatuhTempo <= today).length
    return {
      totalMasuk: masuk.reduce((s, g) => s + g.jumlah, 0),
      totalKeluar: keluar.reduce((s, g) => s + g.jumlah, 0),
      countMasuk: masuk.length,
      countKeluar: keluar.length,
      jtMasuk, jtKeluar,
      cair: giroList.filter(g => g.status === 'cair').length,
      pending: giroList.filter(g => g.status === 'belum').length,
    }
  }, [giroList])

  const filtered = useMemo(() => {
    let list = giroList
    if (activeTab === 'masuk') list = list.filter(g => g.tipe === 'masuk')
    if (activeTab === 'keluar') list = list.filter(g => g.tipe === 'keluar')
    if (activeTab === 'jatuh-tempo') {
      const today = new Date().toISOString().split('T')[0]
      list = list.filter(g => g.status === 'belum' && g.jatuhTempo <= today)
    }
    if (search) {
      list = list.filter(g =>
        (g.noGiro || '').toLowerCase().includes(search.toLowerCase()) ||
        (g.pihak || '').toLowerCase().includes(search.toLowerCase()) ||
        (g.bank || '').toLowerCase().includes(search.toLowerCase())
      )
    }
    if (filterDateFrom) list = list.filter(g => g.tanggal >= filterDateFrom)
    if (filterDateTo) list = list.filter(g => g.tanggal <= filterDateTo)
    return list
  }, [giroList, activeTab, search, filterDateFrom, filterDateTo])

  function openAdd(tipe) {
    setForm({ ...emptyForm, tipe: tipe || (activeTab === 'keluar' ? 'keluar' : 'masuk') })
    setEditId(null)
    setShowModal(true)
  }

  function openEdit(g) {
    setForm({ ...g })
    setEditId(g.id)
    setShowModal(true)
  }

  function handleSave() {
    if (!form.noGiro || !form.pihak || !form.jumlah) return alert('No. Giro, Pihak, dan Jumlah wajib diisi')
    const jumlah = Number(form.jumlah)
    if (editId) {
      dispatch({ type: 'UPDATE_GIRO', payload: { ...form, id: editId, jumlah } })
    } else {
      dispatch({ type: 'ADD_GIRO', payload: { ...form, jumlah } })
    }
    setShowModal(false)
  }

  function handleCairkan(g) {
    if (!confirm(`Cairkan giro ${g.noGiro} senilai ${formatRupiah(g.jumlah)}?`)) return
    dispatch({ type: 'UPDATE_GIRO', payload: { ...g, status: 'cair' } })
  }

  function handleTolak(g) {
    if (!confirm(`Tolak giro ${g.noGiro}?`)) return
    dispatch({ type: 'UPDATE_GIRO', payload: { ...g, status: 'tolak' } })
  }

  function handleDelete(id) {
    dispatch({ type: 'DELETE_GIRO', payload: id })
    setShowDeleteConfirm(null)
  }

  function handleExport() {
    exportCSV(`Laporan_Giro_${activeTab}`, ['No. Giro', 'Tanggal', 'Jatuh Tempo', 'Tipe', 'Pihak', 'Bank', 'Jumlah', 'Status', 'Keterangan'],
      filtered.map(g => [g.noGiro, g.tanggal, g.jatuhTempo, g.tipe === 'masuk' ? 'Masuk' : 'Keluar', g.pihak, g.bank, g.jumlah, STATUS_MAP[g.status]?.label || g.status, g.keterangan])
    )
  }

  function GiroTable({ list }) {
    return (
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>No. Giro</th><th>Tanggal</th><th>Jatuh Tempo</th>
                <th>{activeTab === 'keluar' ? 'Supplier' : 'Pelanggan'}</th>
                <th>Bank</th><th className="text-right">Jumlah</th>
                <th>Status</th><th>Keterangan</th><th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Belum ada data giro</td></tr>}
              {list.map(g => {
                const today = new Date().toISOString().split('T')[0]
                const isOverdue = g.status === 'belum' && g.jatuhTempo <= today
                const st = STATUS_MAP[g.status] || STATUS_MAP['belum']
                return (
                  <tr key={g.id} style={isOverdue ? { background: 'rgba(229,77,66,0.05)' } : {}}>
                    <td className="mono" style={{ fontWeight: 600 }}>{g.noGiro}</td>
                    <td>{g.tanggal}</td>
                    <td style={{ color: isOverdue ? 'var(--danger)' : 'inherit', fontWeight: isOverdue ? 600 : 400 }}>
                      {g.jatuhTempo} {isOverdue && <AlertTriangle size={12} color="var(--danger)" />}
                    </td>
                    <td style={{ fontWeight: 500 }}>{g.pihak}</td>
                    <td>{g.bank}</td>
                    <td className="text-right mono" style={{ fontWeight: 600 }}>{formatRupiah(g.jumlah)}</td>
                    <td><span className={`badge ${st.color}`}>{st.label}</span></td>
                    <td style={{ fontSize: 12 }}>{g.keterangan}</td>
                    <td className="text-center">
                      <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {g.status === 'belum' && (
                          <>
                            <button className="btn btn-sm btn-primary" onClick={() => handleCairkan(g)} title="Cairkan">Cairkan</button>
                            <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)', fontSize: 11 }} onClick={() => handleTolak(g)}>Tolak</button>
                          </>
                        )}
                        <button className="btn btn-icon btn-outline btn-sm" onClick={() => openEdit(g)}><Pencil size={12} /></button>
                        <button className="btn btn-icon btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setShowDeleteConfirm(g.id)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {list.length > 0 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13, fontWeight: 600 }}>
            <span>Total: <span className="mono">{formatRupiah(list.reduce((s, g) => s + g.jumlah, 0))}</span></span>
            <span>{list.length} giro</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Giro</h1>
          <p>Manajemen giro masuk & keluar — {giroList.length} giro</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={handleExport}><Download size={16} /> Export Excel</button>
          <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> Cetak</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Giro Masuk <span className="kpi-icon green"><ArrowDownLeft size={16} /></span></div>
          <div className="kpi-value" style={{ fontSize: 16 }}>{formatRupiah(stats.totalMasuk)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stats.countMasuk} giro</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Giro Keluar <span className="kpi-icon red"><ArrowUpRight size={16} /></span></div>
          <div className="kpi-value" style={{ fontSize: 16 }}>{formatRupiah(stats.totalKeluar)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stats.countKeluar} giro</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Sudah Dicairkan <CheckCircle2 size={16} color="var(--success)" /></div>
          <div className="kpi-value" style={{ fontSize: 18, color: 'var(--success)' }}>{stats.cair}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Jatuh Tempo Hari Ini <AlertTriangle size={16} color="var(--danger)" /></div>
          <div className="kpi-value" style={{ fontSize: 18, color: 'var(--danger)' }}>{stats.jtMasuk + stats.jtKeluar}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="topbar-search" style={{ maxWidth: 260 }}>
          <Search /><input type="text" placeholder="Cari giro..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="form-input" type="date" style={{ width: 140, padding: '6px 8px', fontSize: 12 }} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} placeholder="Dari" />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>s/d</span>
          <input className="form-input" type="date" style={{ width: 140, padding: '6px 8px', fontSize: 12 }} value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} placeholder="Sampai" />
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => openAdd()}><Plus size={16} /> Tambah Giro</button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {GIRO_TABS.map(t => (
          <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            <t.icon size={16} /> {t.label}
            {t.id === 'jatuh-tempo' && (stats.jtMasuk + stats.jtKeluar) > 0 && <span className="badge red" style={{ marginLeft: 6, fontSize: 11 }}>{stats.jtMasuk + stats.jtKeluar}</span>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {(activeTab === 'masuk' || activeTab === 'keluar' || activeTab === 'jatuh-tempo') && <GiroTable list={filtered} />}

      {activeTab === 'laporan' && (
        <div className="card" style={{ padding: 20 }}>
          <div className="card-header" style={{ marginBottom: 16 }}>
            <div className="card-title"><FileText size={16} /> Laporan Giro</div>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th>Kategori</th><th className="text-center">Jumlah Giro</th>
                  <th className="text-right">Total Nominal</th><th className="text-right">% dari Total</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Giro Masuk — Belum Cair', filter: g => g.tipe === 'masuk' && g.status === 'belum', color: 'blue' },
                  { label: 'Giro Masuk — Dicairkan', filter: g => g.tipe === 'masuk' && g.status === 'cair', color: 'green' },
                  { label: 'Giro Masuk — Ditolak', filter: g => g.tipe === 'masuk' && g.status === 'tolak', color: 'red' },
                  { label: 'Giro Keluar — Belum Cair', filter: g => g.tipe === 'keluar' && g.status === 'belum', color: 'blue' },
                  { label: 'Giro Keluar — Dicairkan', filter: g => g.tipe === 'keluar' && g.status === 'cair', color: 'green' },
                  { label: 'Giro Keluar — Ditolak', filter: g => g.tipe === 'keluar' && g.status === 'tolak', color: 'red' },
                ].map((row, i) => {
                  const items = giroList.filter(row.filter)
                  const total = items.reduce((s, g) => s + g.jumlah, 0)
                  const grandTotal = giroList.reduce((s, g) => s + g.jumlah, 0)
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}><span className={`badge ${row.color}`} style={{ marginRight: 8 }}>{items.length}</span>{row.label}</td>
                      <td className="text-center">{items.length}</td>
                      <td className="text-right mono">{formatRupiah(total)}</td>
                      <td className="text-right">{grandTotal > 0 ? ((total / grandTotal) * 100).toFixed(1) + '%' : '0%'}</td>
                    </tr>
                  )
                })}
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td>TOTAL</td>
                  <td className="text-center">{giroList.length}</td>
                  <td className="text-right mono">{formatRupiah(giroList.reduce((s, g) => s + g.jumlah, 0))}</td>
                  <td className="text-right">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal title={editId ? 'Edit Giro' : 'Tambah Giro'} onClose={() => setShowModal(false)} width={600} footer={
          <><button className="btn btn-outline" onClick={() => setShowModal(false)}>Batal</button>
            <button className="btn btn-primary" onClick={handleSave}><Save size={16} /> {editId ? 'Simpan' : 'Tambah'}</button></>
        }>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">No. Giro</label>
              <input className="form-input" value={form.noGiro} onChange={e => setForm({ ...form, noGiro: e.target.value })} placeholder="GR-001" />
            </div>
            <div className="form-group">
              <label className="form-label">Tipe</label>
              <select className="form-select" value={form.tipe} onChange={e => setForm({ ...form, tipe: e.target.value })}>
                <option value="masuk">Giro Masuk</option>
                <option value="keluar">Giro Keluar</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tanggal</label>
              <input className="form-input" type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Jatuh Tempo</label>
              <input className="form-input" type="date" value={form.jatuhTempo} onChange={e => setForm({ ...form, jatuhTempo: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{form.tipe === 'masuk' ? 'Pelanggan' : 'Supplier'}</label>
              <input className="form-input" value={form.pihak} onChange={e => setForm({ ...form, pihak: e.target.value })} placeholder="Nama pihak" />
            </div>
            <div className="form-group">
              <label className="form-label">Bank</label>
              <input className="form-input" value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} placeholder="Bank Kalsel" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Jumlah (Rp)</label>
              <input className="form-input" type="number" value={form.jumlah} onChange={e => setForm({ ...form, jumlah: e.target.value })} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="belum">Belum Jatuh Tempo</option>
                <option value="jatuh-tempo">Jatuh Tempo</option>
                <option value="cair">Dicairkan</option>
                <option value="tolak">Ditolak</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Keterangan</label>
            <input className="form-input" value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} placeholder="Keterangan giro..." />
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <Modal title="Konfirmasi Hapus" onClose={() => setShowDeleteConfirm(null)} footer={
          <><button className="btn btn-outline" onClick={() => setShowDeleteConfirm(null)}>Batal</button>
            <button className="btn btn-danger" onClick={() => handleDelete(showDeleteConfirm)}>Hapus Giro</button></>
        }>
          <p>Apakah Anda yakin ingin menghapus giro ini?</p>
        </Modal>
      )}
    </div>
  )
}
