import { useState, useMemo } from 'react'
import { Plus, Search, Pencil, Trash2, X, Save, DollarSign, Clock, CheckCircle2, AlertTriangle, Printer, Download, BarChart2, Book, CheckSquare, CalendarClock, History } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'

// --- Aging helper ---
function hitungUmur(jatuhTempo) {
  if (!jatuhTempo) return null
  const selisih = Math.floor((new Date() - new Date(jatuhTempo)) / 86400000)
  return selisih // positive = overdue, negative = not yet due
}

function agingBucket(days) {
  if (days <= 0) return 'Belum Jatuh Tempo'
  if (days <= 30) return '1 – 30 Hari'
  if (days <= 60) return '31 – 60 Hari'
  if (days <= 90) return '61 – 90 Hari'
  return '> 90 Hari'
}

const agingOrder = ['Belum Jatuh Tempo', '1 – 30 Hari', '31 – 60 Hari', '61 – 90 Hari', '> 90 Hari']
const agingColors = {
  'Belum Jatuh Tempo': 'green', '1 – 30 Hari': 'orange', '31 – 60 Hari': 'orange', '61 – 90 Hari': 'red', '> 90 Hari': 'red'
}

const pageTabs = [
  { id: 'semua', label: 'Buku Piutang', icon: Book },
  { id: 'belum', label: 'Belum Lunas', icon: Clock },
  { id: 'lunas', label: 'Telah Lunas', icon: CheckSquare },
  { id: 'aging', label: 'Umur Piutang', icon: History },
  { id: 'jatuh-tempo', label: 'Jatuh Tempo', icon: CalendarClock },
]

function getStatusBadge(status) {
  const map = { lunas: 'green', sebagian: 'orange', belum: 'blue', 'jatuh-tempo': 'red' }
  const label = { lunas: 'Lunas', sebagian: 'Sebagian', belum: 'Belum Bayar', 'jatuh-tempo': 'Jatuh Tempo' }
  return <span className={`badge ${map[status] || 'blue'}`}>{label[status] || status}</span>
}

export default function Piutang() {
  const { state, dispatch } = useApp()
  const piutangList = state.piutang || []
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('semua')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [showPayment, setShowPayment] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [form, setForm] = useState({
    noFaktur: '', tanggal: new Date().toISOString().split('T')[0], jatuhTempo: '',
    pelanggan: '', keterangan: '', jumlah: 0
  })

  const stats = useMemo(() => {
    const total = piutangList.reduce((s, p) => s + p.jumlah, 0)
    const terbayar = piutangList.reduce((s, p) => s + (p.terbayar || 0), 0)
    const sisa = piutangList.reduce((s, p) => s + (p.sisa || 0), 0)
    const jatuhTempo = piutangList.filter(p => p.status !== 'lunas' && hitungUmur(p.jatuhTempo) > 0).length
    return { total, terbayar, sisa, jatuhTempo }
  }, [piutangList])

  // Filtered list per tab
  const filtered = useMemo(() => {
    let list = piutangList
    if (search) {
      list = list.filter(p =>
        p.pelanggan.toLowerCase().includes(search.toLowerCase()) ||
        p.noFaktur.toLowerCase().includes(search.toLowerCase()) ||
        (p.keterangan || '').toLowerCase().includes(search.toLowerCase())
      )
    }
    if (activeTab === 'belum') list = list.filter(p => p.status !== 'lunas')
    if (activeTab === 'lunas') list = list.filter(p => p.status === 'lunas')
    if (activeTab === 'jatuh-tempo') list = list.filter(p => p.status !== 'lunas' && hitungUmur(p.jatuhTempo) > 0)
    return list
  }, [piutangList, search, activeTab])

  // Aging grouped data
  const agingData = useMemo(() => {
    const belumLunas = piutangList.filter(p => p.status !== 'lunas')
    const groups = {}
    agingOrder.forEach(k => { groups[k] = { items: [], total: 0 } })
    belumLunas.forEach(p => {
      const days = hitungUmur(p.jatuhTempo)
      const bucket = agingBucket(days)
      groups[bucket].items.push({ ...p, hariLewat: days })
      groups[bucket].total += (p.sisa || 0)
    })
    return groups
  }, [piutangList])

  const resetForm = () => {
    setForm({ noFaktur: '', tanggal: new Date().toISOString().split('T')[0], jatuhTempo: '', pelanggan: '', keterangan: '', jumlah: 0 })
    setEditItem(null)
    setShowForm(false)
  }

  const handleSubmit = () => {
    if (!form.noFaktur || !form.pelanggan) return alert('No. Faktur dan Pelanggan wajib diisi')
    const jumlah = Number(form.jumlah)
    if (editItem) {
      dispatch({ type: 'UPDATE_PIUTANG', payload: { ...editItem, ...form, jumlah } })
    } else {
      dispatch({ type: 'ADD_PIUTANG', payload: { ...form, jumlah, terbayar: 0, sisa: jumlah, status: 'belum' } })
    }
    resetForm()
  }

  const handlePayment = (item) => {
    const amount = Number(paymentAmount)
    if (amount <= 0 || amount > item.sisa) return alert('Jumlah pembayaran tidak valid')
    const newTerbayar = (item.terbayar || 0) + amount
    const newSisa = item.jumlah - newTerbayar
    const newStatus = newSisa <= 0 ? 'lunas' : 'sebagian'
    dispatch({ type: 'UPDATE_PIUTANG', payload: { ...item, terbayar: newTerbayar, sisa: Math.max(0, newSisa), status: newStatus } })
    setShowPayment(null)
    setPaymentAmount(0)
  }

  const handleDelete = (id) => {
    if (confirm('Hapus piutang ini?')) dispatch({ type: 'DELETE_PIUTANG', payload: id })
  }

  // Main table (used for semua, belum, lunas, jatuh-tempo tabs)
  function MainTable({ list }) {
    return (
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>No. Faktur</th><th>Tanggal</th><th>Jatuh Tempo</th><th>Pelanggan</th>
                <th>Keterangan</th><th className="text-right">Jumlah</th><th className="text-right">Terbayar</th>
                <th className="text-right">Sisa</th><th>Status</th><th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {list.map(p => {
                const overdue = p.status !== 'lunas' && hitungUmur(p.jatuhTempo) > 0
                return (
                  <tr key={p.id}>
                    <td className="mono">{p.noFaktur}</td>
                    <td>{p.tanggal}</td>
                    <td style={{ color: overdue ? 'var(--danger)' : 'inherit', fontWeight: overdue ? 600 : 400 }}>
                      {p.jatuhTempo} {overdue && <span style={{ fontSize: 11 }}>({hitungUmur(p.jatuhTempo)}h)</span>}
                    </td>
                    <td style={{ fontWeight: 500 }}>{p.pelanggan}</td>
                    <td>{p.keterangan}</td>
                    <td className="text-right mono">{formatRupiah(p.jumlah)}</td>
                    <td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(p.terbayar || 0)}</td>
                    <td className="text-right mono" style={{ fontWeight: 600, color: p.sisa > 0 ? 'var(--warning)' : 'var(--success)' }}>
                      {formatRupiah(p.sisa || 0)}
                    </td>
                    <td>{getStatusBadge(p.status)}</td>
                    <td className="text-center">
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {p.status !== 'lunas' && (
                          <button className="btn btn-sm btn-primary" onClick={() => { setShowPayment(p); setPaymentAmount(p.sisa) }}>Bayar</button>
                        )}
                        <button className="btn btn-sm btn-outline" onClick={() => { setEditItem(p); setForm({ ...p }); setShowForm(true) }}><Pencil size={14} /></button>
                        <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(p.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {list.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Tidak ada data</td></tr>}
            </tbody>
          </table>
        </div>
        {list.length > 0 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: 32, fontSize: 13, fontWeight: 600 }}>
            <span>Total Jumlah: <span className="mono">{formatRupiah(list.reduce((s, p) => s + p.jumlah, 0))}</span></span>
            <span>Total Terbayar: <span className="mono" style={{ color: 'var(--success)' }}>{formatRupiah(list.reduce((s, p) => s + (p.terbayar || 0), 0))}</span></span>
            <span>Total Sisa: <span className="mono" style={{ color: 'var(--warning)' }}>{formatRupiah(list.reduce((s, p) => s + (p.sisa || 0), 0))}</span></span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Piutang Usaha</h1>
          <p>Manajemen piutang dagang (Accounts Receivable)</p>
        </div>
        <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => window.print()}>
          <Printer size={16} /> Cetak
        </button>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Piutang <span className="kpi-icon blue" style={{ width: 28, height: 28 }}><DollarSign size={16} /></span></div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{formatRupiah(stats.total)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Sudah Terbayar <CheckCircle2 size={16} color="var(--success)" /></div>
          <div className="kpi-value" style={{ fontSize: 18, color: 'var(--success)' }}>{formatRupiah(stats.terbayar)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Sisa Piutang <Clock size={16} color="var(--warning)" /></div>
          <div className="kpi-value" style={{ fontSize: 18, color: 'var(--warning)' }}>{formatRupiah(stats.sisa)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Jatuh Tempo <AlertTriangle size={16} color="var(--danger)" /></div>
          <div className="kpi-value" style={{ fontSize: 18, color: 'var(--danger)' }}>{stats.jatuhTempo}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="topbar-search" style={{ maxWidth: 300 }}>
          <Search /><input type="text" placeholder="Cari faktur/pelanggan..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true) }}><Plus size={16} /> Tambah Piutang</button>
        </div>
      </div>

      {/* Page Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {pageTabs.map(t => (
          <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            <t.icon size={16} />
            {t.label}
            {t.id === 'belum' && <span className="badge orange" style={{ marginLeft: 6, fontSize: 11 }}>{piutangList.filter(p => p.status !== 'lunas').length}</span>}
            {t.id === 'jatuh-tempo' && stats.jatuhTempo > 0 && <span className="badge red" style={{ marginLeft: 6, fontSize: 11 }}>{stats.jatuhTempo}</span>}
          </button>
        ))}
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <div className="card-header" style={{ marginBottom: 16 }}>
            <div className="card-title">{editItem ? 'Edit Piutang' : 'Tambah Piutang Baru'}</div>
            <button className="btn btn-outline" onClick={resetForm}><X size={16} /></button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">No. Faktur</label>
              <input className="form-input" value={form.noFaktur} onChange={e => setForm({ ...form, noFaktur: e.target.value })} placeholder="INV-2026-005" />
            </div>
            <div className="form-group">
              <label className="form-label">Pelanggan</label>
              <input className="form-input" value={form.pelanggan} onChange={e => setForm({ ...form, pelanggan: e.target.value })} placeholder="Nama pelanggan" />
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
              <label className="form-label">Keterangan</label>
              <input className="form-input" value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} placeholder="Sewa Kios A-12" />
            </div>
            <div className="form-group">
              <label className="form-label">Jumlah</label>
              <input className="form-input" type="number" value={form.jumlah} onChange={e => setForm({ ...form, jumlah: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-outline" onClick={resetForm}>Batal</button>
            <button className="btn btn-primary" onClick={handleSubmit}><Save size={16} /> {editItem ? 'Simpan' : 'Tambah'}</button>
          </div>
        </div>
      )}

      {/* === TAB CONTENT === */}
      {(activeTab === 'semua' || activeTab === 'belum' || activeTab === 'lunas') && (
        <MainTable list={filtered} />
      )}

      {/* === JATUH TEMPO TAB === */}
      {activeTab === 'jatuh-tempo' && (
        <div>
          <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} color="var(--danger)" />
            <span style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>
              {filtered.length} tagihan telah jatuh tempo dengan total sisa {formatRupiah(filtered.reduce((s, p) => s + (p.sisa || 0), 0))}
            </span>
          </div>
          <MainTable list={filtered} />
        </div>
      )}

      {/* === UMUR PIUTANG / AGING TAB === */}
      {activeTab === 'aging' && (
        <div>
          {/* Summary by bucket */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 20 }}>
            {agingOrder.map(bucket => (
              <div key={bucket} className="kpi-card" style={{ textAlign: 'center' }}>
                <div className="kpi-label" style={{ justifyContent: 'center', fontSize: 12 }}>{bucket}</div>
                <div className="kpi-value" style={{ fontSize: 16, color: agingData[bucket].total > 0 && bucket !== 'Belum Jatuh Tempo' ? 'var(--danger)' : 'inherit' }}>
                  {formatRupiah(agingData[bucket].total)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{agingData[bucket].items.length} tagihan</div>
              </div>
            ))}
          </div>

          {/* Aging detail table */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><BarChart2 size={16} /> Laporan Umur Piutang</div>
              <button className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => window.print()}>
                <Printer size={14} /> Cetak
              </button>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>No. Faktur</th><th>Pelanggan</th><th>Tanggal</th><th>Jatuh Tempo</th>
                    <th className="text-right">Sisa Piutang</th><th>Umur (Hari)</th><th className="text-center">Bucket</th>
                  </tr>
                </thead>
                <tbody>
                  {agingOrder.map(bucket =>
                    agingData[bucket].items.length > 0 ? (
                      <>
                        <tr key={`hdr-${bucket}`} style={{ background: 'var(--border-light)' }}>
                          <td colSpan={5} style={{ fontWeight: 700, fontSize: 13 }}>{bucket}</td>
                          <td></td>
                          <td className="text-right mono" style={{ fontWeight: 700 }}>{formatRupiah(agingData[bucket].total)}</td>
                        </tr>
                        {agingData[bucket].items.map(p => (
                          <tr key={p.id}>
                            <td className="mono">{p.noFaktur}</td>
                            <td style={{ fontWeight: 500 }}>{p.pelanggan}</td>
                            <td>{p.tanggal}</td>
                            <td>{p.jatuhTempo}</td>
                            <td className="text-right mono" style={{ color: 'var(--warning)', fontWeight: 600 }}>{formatRupiah(p.sisa || 0)}</td>
                            <td className="text-center">
                              <span className={`badge ${p.hariLewat > 0 ? 'red' : 'green'}`}>
                                {p.hariLewat > 0 ? `+${p.hariLewat} hari` : `${Math.abs(p.hariLewat)} hari lagi`}
                              </span>
                            </td>
                            <td className="text-center">
                              <span className={`badge ${agingColors[bucket]}`}>{bucket}</span>
                            </td>
                          </tr>
                        ))}
                      </>
                    ) : null
                  )}
                  {piutangList.filter(p => p.status !== 'lunas').length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Tidak ada piutang yang belum lunas</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Grand total footer */}
            <div style={{ padding: '12px 20px', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>TOTAL PIUTANG BELUM LUNAS</span>
              <span className="mono" style={{ color: 'var(--warning)' }}>{formatRupiah(stats.sisa)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <>
          <div className="modal-overlay" onClick={() => setShowPayment(null)} />
          <div className="modal">
            <div className="card-header" style={{ marginBottom: 16 }}>
              <div className="card-title">Catat Pembayaran</div>
              <button className="btn btn-outline" onClick={() => setShowPayment(null)}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Pelanggan: <strong>{showPayment.pelanggan}</strong></p>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>Sisa: <strong style={{ color: 'var(--warning)' }}>{formatRupiah(showPayment.sisa)}</strong></p>
            <div className="form-group">
              <label className="form-label">Jumlah Pembayaran</label>
              <input className="form-input" type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} max={showPayment.sisa} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setShowPayment(null)}>Batal</button>
              <button className="btn btn-primary" onClick={() => handlePayment(showPayment)}><Save size={16} /> Catat Pembayaran</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
