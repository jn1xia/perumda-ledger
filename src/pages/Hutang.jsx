import { useState, useMemo } from 'react'
import { Plus, Search, Pencil, Trash2, X, Save, DollarSign, Clock, CheckCircle2, AlertTriangle, Printer, BarChart2, Book, CheckSquare, CalendarClock, History, Download, FileText } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { exportCSV } from '../utils/exportUtils.js'

function hitungUmur(jatuhTempo) {
  if (!jatuhTempo) return null
  return Math.floor((new Date() - new Date(jatuhTempo)) / 86400000)
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
  { id: 'semua', label: 'Buku Hutang', icon: Book },
  { id: 'belum', label: 'Belum Lunas', icon: Clock },
  { id: 'lunas', label: 'Telah Lunas', icon: CheckSquare },
  { id: 'aging', label: 'Umur Hutang', icon: History },
  { id: 'jatuh-tempo', label: 'Jatuh Tempo', icon: CalendarClock },
  { id: 'laporan', label: 'Laporan Hutang', icon: FileText },
]

function getStatusBadge(status) {
  const map = { lunas: 'green', sebagian: 'orange', belum: 'blue' }
  const label = { lunas: 'Lunas', sebagian: 'Sebagian', belum: 'Belum Bayar' }
  return <span className={`badge ${map[status] || 'blue'}`}>{label[status] || status}</span>
}

export default function Hutang() {
  const { state, dispatch } = useApp()
  const hutangList = state.hutang || []
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('semua')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [showPayment, setShowPayment] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [form, setForm] = useState({
    noFaktur: '', tanggal: new Date().toISOString().split('T')[0], jatuhTempo: '',
    supplier: '', keterangan: '', jumlah: 0
  })

  const stats = useMemo(() => {
    const total = hutangList.reduce((s, h) => s + h.jumlah, 0)
    const terbayar = hutangList.reduce((s, h) => s + (h.terbayar || 0), 0)
    const sisa = hutangList.reduce((s, h) => s + (h.sisa || 0), 0)
    const jatuhTempo = hutangList.filter(h => h.status !== 'lunas' && hitungUmur(h.jatuhTempo) > 0).length
    return { total, terbayar, sisa, jatuhTempo }
  }, [hutangList])

  function handleExportHutang() {
    exportCSV('Laporan_Hutang', ['No. Faktur', 'Tanggal', 'Jatuh Tempo', 'Supplier', 'Keterangan', 'Jumlah', 'Terbayar', 'Sisa', 'Status'],
      hutangList.map(h => [h.noFaktur, h.tanggal, h.jatuhTempo, h.supplier, h.keterangan, h.jumlah, h.terbayar || 0, h.sisa || 0, h.status]))
  }

  function handlePrintHutang() {
    const w = window.open('', '_blank', 'width=900,height=700')
    const peng = state.pengaturan || {}
    let html = `<html><head><title>Laporan Hutang</title><style>body{font-family:Arial;padding:30px;font-size:12px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ccc;padding:6px 8px}th{background:#f5f5f5}.text-right{text-align:right}h2{margin:0;text-align:center}</style></head><body><h2>${peng.namaPerusahaan || 'PERUMDA PASAR BANJARMASIN'}</h2><p style="text-align:center">LAPORAN HUTANG USAHA — Per ${new Date().toLocaleDateString('id-ID')}</p>`
    html += `<table><thead><tr><th>No. Faktur</th><th>Tanggal</th><th>JT</th><th>Supplier</th><th class="text-right">Jumlah</th><th class="text-right">Dibayar</th><th class="text-right">Sisa</th><th>Status</th></tr></thead><tbody>`
    hutangList.forEach(h => html += `<tr><td>${h.noFaktur}</td><td>${h.tanggal}</td><td>${h.jatuhTempo||'-'}</td><td>${h.supplier}</td><td class="text-right">${h.jumlah.toLocaleString('id-ID')}</td><td class="text-right">${(h.terbayar||0).toLocaleString('id-ID')}</td><td class="text-right" style="font-weight:bold">${(h.sisa||0).toLocaleString('id-ID')}</td><td>${h.status}</td></tr>`)
    html += `<tr style="font-weight:bold;border-top:2px solid #333"><td colspan="4">TOTAL</td><td class="text-right">${stats.total.toLocaleString('id-ID')}</td><td class="text-right">${stats.terbayar.toLocaleString('id-ID')}</td><td class="text-right">${stats.sisa.toLocaleString('id-ID')}</td><td></td></tr></tbody></table><script>window.print()</script></body></html>`
    w.document.write(html); w.document.close()
  }

  const filtered = useMemo(() => {
    let list = hutangList
    if (search) {
      list = list.filter(h =>
        h.supplier.toLowerCase().includes(search.toLowerCase()) ||
        h.noFaktur.toLowerCase().includes(search.toLowerCase()) ||
        (h.keterangan || '').toLowerCase().includes(search.toLowerCase())
      )
    }
    if (activeTab === 'belum') list = list.filter(h => h.status !== 'lunas')
    if (activeTab === 'lunas') list = list.filter(h => h.status === 'lunas')
    if (activeTab === 'jatuh-tempo') list = list.filter(h => h.status !== 'lunas' && hitungUmur(h.jatuhTempo) > 0)
    return list
  }, [hutangList, search, activeTab])

  const agingData = useMemo(() => {
    const belumLunas = hutangList.filter(h => h.status !== 'lunas')
    const groups = {}
    agingOrder.forEach(k => { groups[k] = { items: [], total: 0 } })
    belumLunas.forEach(h => {
      const days = hitungUmur(h.jatuhTempo)
      const bucket = agingBucket(days)
      groups[bucket].items.push({ ...h, hariLewat: days })
      groups[bucket].total += (h.sisa || 0)
    })
    return groups
  }, [hutangList])

  const resetForm = () => {
    setForm({ noFaktur: '', tanggal: new Date().toISOString().split('T')[0], jatuhTempo: '', supplier: '', keterangan: '', jumlah: 0 })
    setEditItem(null)
    setShowForm(false)
  }

  const handleSubmit = () => {
    if (!form.noFaktur || !form.supplier) return alert('No. Faktur dan Supplier wajib diisi')
    const jumlah = Number(form.jumlah)
    if (editItem) {
      dispatch({ type: 'UPDATE_HUTANG', payload: { ...editItem, ...form, jumlah } })
    } else {
      dispatch({ type: 'ADD_HUTANG', payload: { ...form, jumlah, terbayar: 0, sisa: jumlah, status: 'belum' } })
    }
    resetForm()
  }

  const handlePayment = (item) => {
    const amount = Number(paymentAmount)
    if (amount <= 0 || amount > item.sisa) return alert('Jumlah pembayaran tidak valid')
    const newTerbayar = (item.terbayar || 0) + amount
    const newSisa = item.jumlah - newTerbayar
    const newStatus = newSisa <= 0 ? 'lunas' : 'sebagian'
    dispatch({ type: 'UPDATE_HUTANG', payload: { ...item, terbayar: newTerbayar, sisa: Math.max(0, newSisa), status: newStatus } })
    setShowPayment(null)
    setPaymentAmount(0)
  }

  const handleDelete = (id) => {
    if (confirm('Hapus hutang ini?')) dispatch({ type: 'DELETE_HUTANG', payload: id })
  }

  function MainTable({ list }) {
    return (
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>No. Faktur</th><th>Tanggal</th><th>Jatuh Tempo</th><th>Supplier</th>
                <th>Keterangan</th><th className="text-right">Jumlah</th><th className="text-right">Dibayar</th>
                <th className="text-right">Sisa</th><th>Status</th><th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {list.map(h => {
                const overdue = h.status !== 'lunas' && hitungUmur(h.jatuhTempo) > 0
                return (
                  <tr key={h.id}>
                    <td className="mono">{h.noFaktur}</td>
                    <td>{h.tanggal}</td>
                    <td style={{ color: overdue ? 'var(--danger)' : 'inherit', fontWeight: overdue ? 600 : 400 }}>
                      {h.jatuhTempo} {overdue && <span style={{ fontSize: 11 }}>({hitungUmur(h.jatuhTempo)}h)</span>}
                    </td>
                    <td style={{ fontWeight: 500 }}>{h.supplier}</td>
                    <td>{h.keterangan}</td>
                    <td className="text-right mono">{formatRupiah(h.jumlah)}</td>
                    <td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(h.terbayar || 0)}</td>
                    <td className="text-right mono" style={{ fontWeight: 600, color: h.sisa > 0 ? 'var(--warning)' : 'var(--success)' }}>
                      {formatRupiah(h.sisa || 0)}
                    </td>
                    <td>{getStatusBadge(h.status)}</td>
                    <td className="text-center">
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {h.status !== 'lunas' && (
                          <button className="btn btn-sm btn-primary" onClick={() => { setShowPayment(h); setPaymentAmount(h.sisa) }}>Bayar</button>
                        )}
                        <button className="btn btn-sm btn-outline" onClick={() => { setEditItem(h); setForm({ ...h }); setShowForm(true) }}><Pencil size={14} /></button>
                        <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(h.id)}><Trash2 size={14} /></button>
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
            <span>Total Jumlah: <span className="mono">{formatRupiah(list.reduce((s, h) => s + h.jumlah, 0))}</span></span>
            <span>Total Dibayar: <span className="mono" style={{ color: 'var(--success)' }}>{formatRupiah(list.reduce((s, h) => s + (h.terbayar || 0), 0))}</span></span>
            <span>Total Sisa: <span className="mono" style={{ color: 'var(--warning)' }}>{formatRupiah(list.reduce((s, h) => s + (h.sisa || 0), 0))}</span></span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Hutang Usaha</h1>
          <p>Manajemen hutang dagang (Accounts Payable) — {hutangList.length} faktur</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={handleExportHutang}><Download size={16} /> Export Excel</button>
          <button className="btn btn-outline" onClick={handlePrintHutang}><Printer size={16} /> Cetak Laporan</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Hutang <span className="kpi-icon blue" style={{ width: 28, height: 28 }}><DollarSign size={16} /></span></div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{formatRupiah(stats.total)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Sudah Dibayar <CheckCircle2 size={16} color="var(--success)" /></div>
          <div className="kpi-value" style={{ fontSize: 18, color: 'var(--success)' }}>{formatRupiah(stats.terbayar)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Sisa Hutang <Clock size={16} color="var(--warning)" /></div>
          <div className="kpi-value" style={{ fontSize: 18, color: 'var(--warning)' }}>{formatRupiah(stats.sisa)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Jatuh Tempo <AlertTriangle size={16} color="var(--danger)" /></div>
          <div className="kpi-value" style={{ fontSize: 18, color: 'var(--danger)' }}>{stats.jatuhTempo}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="topbar-search" style={{ maxWidth: 300 }}>
          <Search /><input type="text" placeholder="Cari faktur/supplier..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true) }}><Plus size={16} /> Tambah Hutang</button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {pageTabs.map(t => (
          <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            <t.icon size={16} />
            {t.label}
            {t.id === 'belum' && <span className="badge orange" style={{ marginLeft: 6, fontSize: 11 }}>{hutangList.filter(h => h.status !== 'lunas').length}</span>}
            {t.id === 'jatuh-tempo' && stats.jatuhTempo > 0 && <span className="badge red" style={{ marginLeft: 6, fontSize: 11 }}>{stats.jatuhTempo}</span>}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <div className="card-header" style={{ marginBottom: 16 }}>
            <div className="card-title">{editItem ? 'Edit Hutang' : 'Tambah Hutang Baru'}</div>
            <button className="btn btn-outline" onClick={resetForm}><X size={16} /></button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">No. Faktur</label>
              <input className="form-input" value={form.noFaktur} onChange={e => setForm({ ...form, noFaktur: e.target.value })} placeholder="B-2026-004" />
            </div>
            <div className="form-group">
              <label className="form-label">Supplier</label>
              <input className="form-input" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="Nama supplier" />
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
              <input className="form-input" value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} placeholder="Pembelian material" />
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

      {(activeTab === 'semua' || activeTab === 'belum' || activeTab === 'lunas') && (
        <MainTable list={filtered} />
      )}

      {activeTab === 'jatuh-tempo' && (
        <div>
          <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} color="var(--danger)" />
            <span style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>
              {filtered.length} hutang telah jatuh tempo dengan total sisa {formatRupiah(filtered.reduce((s, h) => s + (h.sisa || 0), 0))}
            </span>
          </div>
          <MainTable list={filtered} />
        </div>
      )}

      {activeTab === 'aging' && (
        <div>
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

          <div className="card">
            <div className="card-header">
              <div className="card-title"><BarChart2 size={16} /> Laporan Umur Hutang</div>
              <button className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => window.print()}>
                <Printer size={14} /> Cetak
              </button>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>No. Faktur</th><th>Supplier</th><th>Tanggal</th><th>Jatuh Tempo</th>
                    <th className="text-right">Sisa Hutang</th><th>Umur (Hari)</th><th className="text-center">Bucket</th>
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
                        {agingData[bucket].items.map(h => (
                          <tr key={h.id}>
                            <td className="mono">{h.noFaktur}</td>
                            <td style={{ fontWeight: 500 }}>{h.supplier}</td>
                            <td>{h.tanggal}</td>
                            <td>{h.jatuhTempo}</td>
                            <td className="text-right mono" style={{ color: 'var(--warning)', fontWeight: 600 }}>{formatRupiah(h.sisa || 0)}</td>
                            <td className="text-center">
                              <span className={`badge ${h.hariLewat > 0 ? 'red' : 'green'}`}>
                                {h.hariLewat > 0 ? `+${h.hariLewat} hari` : `${Math.abs(h.hariLewat)} hari lagi`}
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
                  {hutangList.filter(h => h.status !== 'lunas').length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Tidak ada hutang yang belum lunas</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>TOTAL HUTANG BELUM LUNAS</span>
              <span className="mono" style={{ color: 'var(--warning)' }}>{formatRupiah(stats.sisa)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Laporan Hutang Tab (#16) */}
      {activeTab === 'laporan' && (() => {
        const suppliers = [...new Set(hutangList.map(h => h.supplier))].sort()
        return (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button className="btn btn-outline" onClick={handlePrintHutang}><Printer size={14} /> Cetak Laporan</button>
              <button className="btn btn-outline" onClick={handleExportHutang}><Download size={14} /> Export Excel</button>
            </div>
            <div className="card">
              <div className="card-header" style={{ padding: '12px 20px' }}><div className="card-title"><FileText size={16} /> Rekap Hutang per Supplier</div></div>
              <div className="table-container">
                <table>
                  <thead><tr><th>Supplier</th><th className="text-center">Jumlah Faktur</th><th className="text-right">Total Hutang</th><th className="text-right">Terbayar</th><th className="text-right">Sisa</th></tr></thead>
                  <tbody>
                    {suppliers.map(s => {
                      const items = hutangList.filter(h => h.supplier === s)
                      const total = items.reduce((sm, h) => sm + h.jumlah, 0)
                      const bayar = items.reduce((sm, h) => sm + (h.terbayar || 0), 0)
                      const sisa = items.reduce((sm, h) => sm + (h.sisa || 0), 0)
                      return (
                        <tr key={s}>
                          <td style={{ fontWeight: 500 }}>{s}</td>
                          <td className="text-center"><span className="badge blue">{items.length}</span></td>
                          <td className="text-right mono">{formatRupiah(total)}</td>
                          <td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(bayar)}</td>
                          <td className="text-right mono" style={{ fontWeight: 600, color: sisa > 0 ? 'var(--warning)' : 'var(--success)' }}>{formatRupiah(sisa)}</td>
                        </tr>
                      )
                    })}
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                      <td>TOTAL</td>
                      <td className="text-center"><span className="badge blue">{hutangList.length}</span></td>
                      <td className="text-right mono">{formatRupiah(stats.total)}</td>
                      <td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(stats.terbayar)}</td>
                      <td className="text-right mono" style={{ color: 'var(--warning)' }}>{formatRupiah(stats.sisa)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            {suppliers.length === 0 && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Belum ada data hutang</div>}
          </div>
        )
      })()}

      {showPayment && (
        <>
          <div className="modal-overlay" onClick={() => setShowPayment(null)} />
          <div className="modal">
            <div className="card-header" style={{ marginBottom: 16 }}>
              <div className="card-title">Catat Pembayaran Hutang</div>
              <button className="btn btn-outline" onClick={() => setShowPayment(null)}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Supplier: <strong>{showPayment.supplier}</strong></p>
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
