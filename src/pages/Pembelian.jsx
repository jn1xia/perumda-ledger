import { useState, useMemo } from 'react'
import { Plus, Search, Pencil, Trash2, X, Save, ShoppingCart, FileText, CheckCircle2, Clock, Download, Printer, Eye, Package } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { exportCSV } from '../utils/exportUtils.js'
import Modal from '../components/UI/Modal.jsx'

const PO_STATUS = {
  draft: { label: 'Draft', color: 'blue' },
  approved: { label: 'Disetujui', color: 'green' },
  received: { label: 'Diterima', color: 'green' },
  partial: { label: 'Sebagian Diterima', color: 'orange' },
  cancelled: { label: 'Dibatalkan', color: 'red' },
}

const PO_TABS = [
  { id: 'all', label: 'Semua PO', icon: FileText },
  { id: 'draft', label: 'Draft', icon: Clock },
  { id: 'approved', label: 'Disetujui', icon: CheckCircle2 },
  { id: 'received', label: 'Diterima', icon: Package },
]

const emptyItem = { nama: '', qty: 1, satuan: 'Unit', harga: 0 }

export default function Pembelian() {
  const { state, dispatch } = useApp()
  const poList = state.purchaseOrders || []
  const supplierList = state.supplierMaster || []
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    noPO: '', tanggal: new Date().toISOString().split('T')[0],
    supplier_id: '', supplier_nama: '', keterangan: '', status: 'draft',
  })
  const [lineItems, setLineItems] = useState([{ ...emptyItem }])

  const stats = useMemo(() => ({
    total: poList.length,
    draft: poList.filter(p => p.status === 'draft').length,
    approved: poList.filter(p => p.status === 'approved').length,
    received: poList.filter(p => p.status === 'received' || p.status === 'partial').length,
    totalValue: poList.filter(p => p.status !== 'cancelled').reduce((s, p) => s + (p.total || 0), 0),
  }), [poList])

  const filtered = useMemo(() => {
    let list = poList
    if (tab !== 'all') {
      if (tab === 'received') list = list.filter(p => p.status === 'received' || p.status === 'partial')
      else list = list.filter(p => p.status === tab)
    }
    if (search) {
      list = list.filter(p =>
        (p.noPO || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.supplier_nama || '').toLowerCase().includes(search.toLowerCase())
      )
    }
    return list
  }, [poList, tab, search])

  function openAdd() {
    setForm({ noPO: '', tanggal: new Date().toISOString().split('T')[0], supplier_id: '', supplier_nama: '', keterangan: '', status: 'draft' })
    setLineItems([{ ...emptyItem }])
    setEditId(null)
    setShowModal(true)
  }

  function openEdit(po) {
    setForm({ noPO: po.noPO, tanggal: po.tanggal, supplier_id: po.supplier_id, supplier_nama: po.supplier_nama, keterangan: po.keterangan, status: po.status })
    const items = po.items ? (typeof po.items === 'string' ? JSON.parse(po.items) : po.items) : [{ ...emptyItem }]
    setLineItems(items.length > 0 ? items : [{ ...emptyItem }])
    setEditId(po.id)
    setShowModal(true)
  }

  function addLine() { setLineItems([...lineItems, { ...emptyItem }]) }
  function removeLine(i) { if (lineItems.length > 1) setLineItems(lineItems.filter((_, idx) => idx !== i)) }
  function updateLine(i, field, val) {
    const updated = [...lineItems]
    updated[i] = { ...updated[i], [field]: val }
    setLineItems(updated)
  }

  function calcTotal() {
    return lineItems.reduce((s, item) => s + (Number(item.qty) * Number(item.harga)), 0)
  }

  function handleSave() {
    if (!form.supplier_nama) return alert('Supplier wajib dipilih/diisi')
    if (lineItems.length === 0 || !lineItems[0].nama) return alert('Minimal 1 item barang')
    const total = calcTotal()
    const payload = { ...form, total, items: lineItems }
    if (editId) {
      dispatch({ type: 'UPDATE_PO', payload: { ...payload, id: editId } })
    } else {
      dispatch({ type: 'ADD_PO', payload })
    }
    setShowModal(false)
  }

  function handleStatusChange(po, newStatus) {
    if (!confirm(`Ubah status PO ${po.noPO} menjadi "${PO_STATUS[newStatus]?.label}"?`)) return
    dispatch({ type: 'UPDATE_PO', payload: { ...po, status: newStatus } })
  }

  function handleDelete(id) {
    if (!confirm('Hapus PO ini?')) return
    dispatch({ type: 'DELETE_PO', payload: id })
  }

  function handleExport() {
    exportCSV('Purchase_Orders', ['No. PO', 'Tanggal', 'Supplier', 'Status', 'Total', 'Keterangan'],
      filtered.map(p => [p.noPO, p.tanggal, p.supplier_nama, PO_STATUS[p.status]?.label || p.status, p.total, p.keterangan]))
  }

  function handlePrint(po) {
    const items = po.items ? (typeof po.items === 'string' ? JSON.parse(po.items) : po.items) : []
    const peng = state.pengaturan || {}
    const w = window.open('', '_blank', 'width=800,height=600')
    let html = `<html><head><title>PO ${po.noPO}</title><style>body{font-family:Arial;padding:30px;font-size:12px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ccc;padding:6px 8px}th{background:#f5f5f5}.text-right{text-align:right}h2{margin:0;text-align:center}.header{margin-bottom:20px}.info{display:flex;justify-content:space-between;margin:16px 0}</style></head><body>`
    html += `<div class="header"><h2>${peng.namaPerusahaan || 'PERUMDA PASAR BANJARMASIN'}</h2><p style="text-align:center">PURCHASE ORDER</p></div>`
    html += `<div class="info"><div><strong>No. PO:</strong> ${po.noPO}<br><strong>Tanggal:</strong> ${po.tanggal}<br><strong>Supplier:</strong> ${po.supplier_nama}</div><div><strong>Status:</strong> ${PO_STATUS[po.status]?.label}<br>${po.keterangan ? `<strong>Ket:</strong> ${po.keterangan}` : ''}</div></div>`
    html += `<table><thead><tr><th>No</th><th>Nama Barang</th><th class="text-right">Qty</th><th>Satuan</th><th class="text-right">Harga</th><th class="text-right">Subtotal</th></tr></thead><tbody>`
    items.forEach((item, i) => {
      const sub = Number(item.qty) * Number(item.harga)
      html += `<tr><td>${i + 1}</td><td>${item.nama}</td><td class="text-right">${item.qty}</td><td>${item.satuan}</td><td class="text-right">Rp ${Number(item.harga).toLocaleString('id-ID')}</td><td class="text-right">Rp ${sub.toLocaleString('id-ID')}</td></tr>`
    })
    html += `<tr style="font-weight:bold;border-top:2px solid #333"><td colspan="5" class="text-right">TOTAL</td><td class="text-right">Rp ${(po.total || 0).toLocaleString('id-ID')}</td></tr></tbody></table>`
    html += `<div style="display:flex;justify-content:space-between;margin-top:60px;text-align:center"><div style="width:200px"><div style="border-top:1px solid #333;padding-top:4px">Dibuat Oleh</div></div><div style="width:200px"><div style="border-top:1px solid #333;padding-top:4px">Disetujui Oleh</div></div><div style="width:200px"><div style="border-top:1px solid #333;padding-top:4px">Supplier</div></div></div>`
    html += `<script>window.print()</script></body></html>`
    w.document.write(html); w.document.close()
  }

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Pembelian (Purchase Order)</h1>
          <p>Manajemen pembelian barang & jasa — {poList.length} PO</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={handleExport}><Download size={16} /> Export</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total PO <ShoppingCart size={16} color="var(--primary)" /></div>
          <div className="kpi-value">{stats.total}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Draft <Clock size={16} color="var(--warning)" /></div>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>{stats.draft}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Disetujui <CheckCircle2 size={16} color="var(--success)" /></div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>{stats.approved}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Nilai PO</div>
          <div className="kpi-value" style={{ fontSize: 16 }}>{formatRupiah(stats.totalValue)}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="topbar-search" style={{ maxWidth: 280 }}>
          <Search /><input type="text" placeholder="Cari PO / supplier..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Buat PO Baru</button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {PO_TABS.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>No. PO</th><th>Tanggal</th><th>Supplier</th>
                <th className="text-center">Items</th><th className="text-right">Total</th>
                <th>Status</th><th>Keterangan</th><th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(po => {
                const items = po.items ? (typeof po.items === 'string' ? JSON.parse(po.items) : po.items) : []
                const st = PO_STATUS[po.status] || PO_STATUS.draft
                return (
                  <tr key={po.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{po.noPO}</td>
                    <td>{po.tanggal}</td>
                    <td style={{ fontWeight: 500 }}>{po.supplier_nama}</td>
                    <td className="text-center"><span className="badge blue">{items.length}</span></td>
                    <td className="text-right mono" style={{ fontWeight: 600 }}>{formatRupiah(po.total || 0)}</td>
                    <td><span className={`badge ${st.color}`}>{st.label}</span></td>
                    <td style={{ fontSize: 12 }}>{po.keterangan}</td>
                    <td className="text-center">
                      <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-outline" onClick={() => setShowDetail(po)} title="Detail"><Eye size={12} /></button>
                        {po.status === 'draft' && <button className="btn btn-sm btn-primary" style={{ fontSize: 10 }} onClick={() => handleStatusChange(po, 'approved')}>Approve</button>}
                        {po.status === 'approved' && <button className="btn btn-sm btn-primary" style={{ fontSize: 10 }} onClick={() => handleStatusChange(po, 'received')}>Terima</button>}
                        <button className="btn btn-sm btn-outline" onClick={() => handlePrint(po)} title="Cetak"><Printer size={12} /></button>
                        <button className="btn btn-sm btn-outline" onClick={() => openEdit(po)}><Pencil size={12} /></button>
                        <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(po.id)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Belum ada Purchase Order</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* PO Detail Modal */}
      {showDetail && (() => {
        const items = showDetail.items ? (typeof showDetail.items === 'string' ? JSON.parse(showDetail.items) : showDetail.items) : []
        const st = PO_STATUS[showDetail.status] || PO_STATUS.draft
        return (
          <Modal title={`Detail PO: ${showDetail.noPO}`} onClose={() => setShowDetail(null)} width={700} footer={
            <><button className="btn btn-outline" onClick={() => handlePrint(showDetail)}><Printer size={14} /> Cetak</button>
              <button className="btn btn-primary" onClick={() => setShowDetail(null)}>Tutup</button></>
          }>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div><strong>Tanggal:</strong> {showDetail.tanggal}<br /><strong>Supplier:</strong> {showDetail.supplier_nama}</div>
              <div><span className={`badge ${st.color}`}>{st.label}</span></div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--bg-secondary)' }}><th style={{ padding: '6px 8px', textAlign: 'left' }}>Barang</th><th className="text-right" style={{ padding: '6px 8px' }}>Qty</th><th style={{ padding: '6px 8px' }}>Satuan</th><th className="text-right" style={{ padding: '6px 8px' }}>Harga</th><th className="text-right" style={{ padding: '6px 8px' }}>Subtotal</th></tr></thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '6px 8px' }}>{item.nama}</td>
                    <td className="text-right" style={{ padding: '6px 8px' }}>{item.qty}</td>
                    <td style={{ padding: '6px 8px' }}>{item.satuan}</td>
                    <td className="text-right mono" style={{ padding: '6px 8px' }}>{formatRupiah(Number(item.harga))}</td>
                    <td className="text-right mono" style={{ padding: '6px 8px', fontWeight: 600 }}>{formatRupiah(Number(item.qty) * Number(item.harga))}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td colSpan={4} className="text-right" style={{ padding: '8px' }}>TOTAL</td>
                  <td className="text-right mono" style={{ padding: '8px' }}>{formatRupiah(showDetail.total || 0)}</td>
                </tr>
              </tbody>
            </table>
            {showDetail.keterangan && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>Keterangan: {showDetail.keterangan}</p>}
          </Modal>
        )
      })()}

      {/* Create/Edit PO Modal */}
      {showModal && (
        <Modal title={editId ? 'Edit Purchase Order' : 'Buat Purchase Order Baru'} onClose={() => setShowModal(false)} width={800} footer={
          <><button className="btn btn-outline" onClick={() => setShowModal(false)}>Batal</button>
            <button className="btn btn-primary" onClick={handleSave}><Save size={16} /> {editId ? 'Simpan' : 'Buat PO'}</button></>
        }>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">No. PO</label>
              <input className="form-input" value={form.noPO} onChange={e => setForm({ ...form, noPO: e.target.value })} placeholder="Auto-generate jika kosong" />
            </div>
            <div className="form-group">
              <label className="form-label">Tanggal</label>
              <input className="form-input" type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Supplier *</label>
              {supplierList.length > 0 ? (
                <select className="form-select" value={form.supplier_nama} onChange={e => {
                  const sup = supplierList.find(s => s.nama === e.target.value)
                  setForm({ ...form, supplier_nama: e.target.value, supplier_id: sup?.id || '' })
                }}>
                  <option value="">— Pilih Supplier —</option>
                  {supplierList.map(s => <option key={s.id} value={s.nama}>{s.nama}</option>)}
                </select>
              ) : (
                <input className="form-input" value={form.supplier_nama} onChange={e => setForm({ ...form, supplier_nama: e.target.value })} placeholder="Nama supplier" />
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Keterangan</label>
              <input className="form-input" value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} placeholder="Catatan PO" />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 13 }}>Item Barang</strong>
              <button className="btn btn-sm btn-outline" onClick={addLine}><Plus size={12} /> Tambah Baris</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left', width: '35%' }}>Nama Barang</th>
                <th style={{ padding: '6px 8px', width: '12%' }}>Qty</th>
                <th style={{ padding: '6px 8px', width: '15%' }}>Satuan</th>
                <th style={{ padding: '6px 8px', width: '20%' }}>Harga</th>
                <th style={{ padding: '6px 8px', width: '15%' }} className="text-right">Subtotal</th>
                <th style={{ padding: '6px 8px', width: '3%' }}></th>
              </tr></thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '4px' }}><input className="form-input" style={{ fontSize: 12, padding: '4px 6px' }} value={item.nama} onChange={e => updateLine(i, 'nama', e.target.value)} placeholder="Nama barang" /></td>
                    <td style={{ padding: '4px' }}><input className="form-input" type="number" style={{ fontSize: 12, padding: '4px 6px', textAlign: 'right' }} value={item.qty} onChange={e => updateLine(i, 'qty', e.target.value)} min="1" /></td>
                    <td style={{ padding: '4px' }}><select className="form-select" style={{ fontSize: 12, padding: '4px 6px' }} value={item.satuan} onChange={e => updateLine(i, 'satuan', e.target.value)}>
                      <option>Unit</option><option>Liter</option><option>Pak</option><option>Kg</option><option>Meter</option><option>Roll</option><option>Set</option><option>Lembar</option>
                    </select></td>
                    <td style={{ padding: '4px' }}><input className="form-input" type="number" style={{ fontSize: 12, padding: '4px 6px', textAlign: 'right' }} value={item.harga} onChange={e => updateLine(i, 'harga', e.target.value)} /></td>
                    <td className="text-right mono" style={{ padding: '4px 8px', fontWeight: 600 }}>{formatRupiah(Number(item.qty) * Number(item.harga))}</td>
                    <td style={{ padding: '4px' }}><button className="btn btn-icon btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeLine(i)}><X size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ textAlign: 'right', marginTop: 8, fontSize: 14, fontWeight: 700 }}>
              Total: <span className="mono">{formatRupiah(calcTotal())}</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
