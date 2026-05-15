import { useState, useMemo } from 'react'
import { Plus, Search, Pencil, Trash2, X, Save, ShoppingBag, FileText, CheckCircle2, Clock, Download, Printer, Eye, Package } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { exportCSV } from '../utils/exportUtils.js'
import Modal from '../components/UI/Modal.jsx'

const SO_STATUS = {
  draft: { label: 'Draft', color: 'blue' },
  confirmed: { label: 'Dikonfirmasi', color: 'green' },
  delivered: { label: 'Dikirim', color: 'green' },
  cancelled: { label: 'Dibatalkan', color: 'red' },
}
const SO_TABS = [
  { id: 'all', label: 'Semua SO', icon: FileText },
  { id: 'draft', label: 'Draft', icon: Clock },
  { id: 'confirmed', label: 'Dikonfirmasi', icon: CheckCircle2 },
  { id: 'delivered', label: 'Dikirim', icon: Package },
]
const emptyItem = { nama: '', qty: 1, satuan: 'Unit', harga: 0 }

export default function Penjualan() {
  const { state, dispatch } = useApp()
  const soList = state.salesOrders || []
  const pelangganList = state.pelangganMaster || []
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ noSO:'', tanggal: new Date().toISOString().split('T')[0], pelanggan_id:'', pelanggan_nama:'', pembayaran:'tunai', keterangan:'', status:'draft' })
  const [lineItems, setLineItems] = useState([{ ...emptyItem }])

  const stats = useMemo(() => ({
    total: soList.length,
    draft: soList.filter(p => p.status === 'draft').length,
    confirmed: soList.filter(p => p.status === 'confirmed').length,
    totalValue: soList.filter(p => p.status !== 'cancelled').reduce((s, p) => s + (p.total || 0), 0),
  }), [soList])

  const filtered = useMemo(() => {
    let list = soList
    if (tab !== 'all') {
      if (tab === 'delivered') list = list.filter(p => p.status === 'delivered')
      else list = list.filter(p => p.status === tab)
    }
    if (search) list = list.filter(p => (p.noSO||'').toLowerCase().includes(search.toLowerCase()) || (p.pelanggan_nama||'').toLowerCase().includes(search.toLowerCase()))
    return list
  }, [soList, tab, search])

  function openAdd() {
    setForm({ noSO:'', tanggal: new Date().toISOString().split('T')[0], pelanggan_id:'', pelanggan_nama:'', pembayaran:'tunai', keterangan:'', status:'draft' })
    setLineItems([{ ...emptyItem }]); setEditId(null); setShowModal(true)
  }
  function openEdit(so) {
    setForm({ noSO:so.noSO, tanggal:so.tanggal, pelanggan_id:so.pelanggan_id, pelanggan_nama:so.pelanggan_nama, pembayaran:so.pembayaran||'tunai', keterangan:so.keterangan, status:so.status })
    const items = so.items ? (typeof so.items === 'string' ? JSON.parse(so.items) : so.items) : [{ ...emptyItem }]
    setLineItems(items.length > 0 ? items : [{ ...emptyItem }]); setEditId(so.id); setShowModal(true)
  }
  function addLine() { setLineItems([...lineItems, { ...emptyItem }]) }
  function removeLine(i) { if (lineItems.length > 1) setLineItems(lineItems.filter((_, idx) => idx !== i)) }
  function updateLine(i, f, v) { const u = [...lineItems]; u[i] = { ...u[i], [f]: v }; setLineItems(u) }
  function calcTotal() { return lineItems.reduce((s, item) => s + (Number(item.qty) * Number(item.harga)), 0) }

  function handleSave() {
    if (!form.pelanggan_nama) return alert('Pelanggan wajib diisi')
    if (!lineItems[0]?.nama) return alert('Minimal 1 item barang')
    const payload = { ...form, total: calcTotal(), items: lineItems }
    if (editId) dispatch({ type: 'UPDATE_SO', payload: { ...payload, id: editId } })
    else dispatch({ type: 'ADD_SO', payload })
    setShowModal(false)
  }
  function handleStatus(so, s) { if (confirm(`Ubah status SO ${so.noSO}?`)) dispatch({ type: 'UPDATE_SO', payload: { ...so, status: s } }) }
  function handleDelete(id) { if (confirm('Hapus SO ini?')) dispatch({ type: 'DELETE_SO', payload: id }) }
  function handleExport() {
    exportCSV('Sales_Orders', ['No. SO','Tanggal','Pelanggan','Pembayaran','Status','Total','Keterangan'],
      filtered.map(p => [p.noSO, p.tanggal, p.pelanggan_nama, p.pembayaran, SO_STATUS[p.status]?.label, p.total, p.keterangan]))
  }
  function handlePrint(so) {
    const items = so.items ? (typeof so.items === 'string' ? JSON.parse(so.items) : so.items) : []
    const peng = state.pengaturan || {}
    const w = window.open('','_blank','width=800,height=600')
    let h = `<html><head><title>SO ${so.noSO}</title><style>body{font-family:Arial;padding:30px;font-size:12px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ccc;padding:6px 8px}th{background:#f5f5f5}.text-right{text-align:right}h2{margin:0;text-align:center}</style></head><body>`
    h += `<h2>${peng.namaPerusahaan||'PERUMDA PASAR BANJARMASIN'}</h2><p style="text-align:center">SALES ORDER — ${so.noSO}</p>`
    h += `<p><strong>Tanggal:</strong> ${so.tanggal} | <strong>Pelanggan:</strong> ${so.pelanggan_nama} | <strong>Pembayaran:</strong> ${so.pembayaran}</p>`
    h += `<table><thead><tr><th>No</th><th>Barang</th><th class="text-right">Qty</th><th>Satuan</th><th class="text-right">Harga</th><th class="text-right">Subtotal</th></tr></thead><tbody>`
    items.forEach((it,i) => { h += `<tr><td>${i+1}</td><td>${it.nama}</td><td class="text-right">${it.qty}</td><td>${it.satuan}</td><td class="text-right">${Number(it.harga).toLocaleString('id-ID')}</td><td class="text-right">${(Number(it.qty)*Number(it.harga)).toLocaleString('id-ID')}</td></tr>` })
    h += `<tr style="font-weight:bold;border-top:2px solid #333"><td colspan="5" class="text-right">TOTAL</td><td class="text-right">Rp ${(so.total||0).toLocaleString('id-ID')}</td></tr></tbody></table>`
    h += `<div style="display:flex;justify-content:space-between;margin-top:60px;text-align:center"><div style="width:200px"><div style="border-top:1px solid #333;padding-top:4px">Dibuat</div></div><div style="width:200px"><div style="border-top:1px solid #333;padding-top:4px">Disetujui</div></div><div style="width:200px"><div style="border-top:1px solid #333;padding-top:4px">Pelanggan</div></div></div>`
    h += `<script>window.print()</script></body></html>`
    w.document.write(h); w.document.close()
  }

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div><h1>Penjualan (Sales Order)</h1><p>Manajemen penjualan — {soList.length} SO</p></div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-outline" onClick={handleExport}><Download size={16}/> Export</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns:'repeat(4,1fr)', marginBottom:20 }}>
        <div className="kpi-card"><div className="kpi-label">Total SO <ShoppingBag size={16} color="var(--primary)"/></div><div className="kpi-value">{stats.total}</div></div>
        <div className="kpi-card"><div className="kpi-label">Draft <Clock size={16} color="var(--warning)"/></div><div className="kpi-value" style={{color:'var(--warning)'}}>{stats.draft}</div></div>
        <div className="kpi-card"><div className="kpi-label">Dikonfirmasi <CheckCircle2 size={16} color="var(--success)"/></div><div className="kpi-value" style={{color:'var(--success)'}}>{stats.confirmed}</div></div>
        <div className="kpi-card"><div className="kpi-label">Total Nilai</div><div className="kpi-value" style={{fontSize:16}}>{formatRupiah(stats.totalValue)}</div></div>
      </div>

      <div className="toolbar">
        <div className="topbar-search" style={{maxWidth:280}}><Search/><input type="text" placeholder="Cari SO/pelanggan..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <div className="toolbar-right"><button className="btn btn-primary" onClick={openAdd}><Plus size={16}/> Buat SO Baru</button></div>
      </div>

      <div className="tabs" style={{marginBottom:16}}>
        {SO_TABS.map(t=><button key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}><t.icon size={16}/> {t.label}</button>)}
      </div>

      <div className="card"><div className="table-container"><table>
        <thead><tr><th>No. SO</th><th>Tanggal</th><th>Pelanggan</th><th>Bayar</th><th className="text-center">Items</th><th className="text-right">Total</th><th>Status</th><th className="text-center">Aksi</th></tr></thead>
        <tbody>
          {filtered.map(so => {
            const items = so.items ? (typeof so.items==='string' ? JSON.parse(so.items) : so.items) : []
            const st = SO_STATUS[so.status] || SO_STATUS.draft
            return (<tr key={so.id}>
              <td className="mono" style={{fontWeight:600}}>{so.noSO}</td><td>{so.tanggal}</td>
              <td style={{fontWeight:500}}>{so.pelanggan_nama}</td>
              <td><span className={`badge ${so.pembayaran==='kredit'?'orange':'green'}`}>{so.pembayaran==='kredit'?'Kredit':'Tunai'}</span></td>
              <td className="text-center"><span className="badge blue">{items.length}</span></td>
              <td className="text-right mono" style={{fontWeight:600}}>{formatRupiah(so.total||0)}</td>
              <td><span className={`badge ${st.color}`}>{st.label}</span></td>
              <td className="text-center">
                <div style={{display:'flex',gap:3,justifyContent:'center',flexWrap:'wrap'}}>
                  <button className="btn btn-sm btn-outline" onClick={()=>setShowDetail(so)}><Eye size={12}/></button>
                  {so.status==='draft'&&<button className="btn btn-sm btn-primary" style={{fontSize:10}} onClick={()=>handleStatus(so,'confirmed')}>Confirm</button>}
                  {so.status==='confirmed'&&<button className="btn btn-sm btn-primary" style={{fontSize:10}} onClick={()=>handleStatus(so,'delivered')}>Kirim</button>}
                  <button className="btn btn-sm btn-outline" onClick={()=>handlePrint(so)}><Printer size={12}/></button>
                  <button className="btn btn-sm btn-outline" onClick={()=>openEdit(so)}><Pencil size={12}/></button>
                  <button className="btn btn-sm btn-outline" style={{color:'var(--danger)'}} onClick={()=>handleDelete(so.id)}><Trash2 size={12}/></button>
                </div>
              </td>
            </tr>)
          })}
          {filtered.length===0&&<tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>Belum ada Sales Order</td></tr>}
        </tbody>
      </table></div></div>

      {showDetail&&(()=>{
        const items = showDetail.items?(typeof showDetail.items==='string'?JSON.parse(showDetail.items):showDetail.items):[]
        return <Modal title={`Detail SO: ${showDetail.noSO}`} onClose={()=>setShowDetail(null)} width={700} footer={
          <><button className="btn btn-outline" onClick={()=>handlePrint(showDetail)}><Printer size={14}/> Cetak</button><button className="btn btn-primary" onClick={()=>setShowDetail(null)}>Tutup</button></>
        }>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
            <div><strong>Tanggal:</strong> {showDetail.tanggal}<br/><strong>Pelanggan:</strong> {showDetail.pelanggan_nama}<br/><strong>Pembayaran:</strong> {showDetail.pembayaran}</div>
            <span className={`badge ${(SO_STATUS[showDetail.status]||{}).color}`}>{(SO_STATUS[showDetail.status]||{}).label}</span>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{background:'var(--bg-secondary)'}}><th style={{padding:'6px 8px',textAlign:'left'}}>Barang</th><th className="text-right" style={{padding:'6px 8px'}}>Qty</th><th style={{padding:'6px 8px'}}>Satuan</th><th className="text-right" style={{padding:'6px 8px'}}>Harga</th><th className="text-right" style={{padding:'6px 8px'}}>Subtotal</th></tr></thead>
            <tbody>
              {items.map((it,i)=><tr key={i} style={{borderBottom:'1px solid var(--border-light)'}}><td style={{padding:'6px 8px'}}>{it.nama}</td><td className="text-right" style={{padding:'6px 8px'}}>{it.qty}</td><td style={{padding:'6px 8px'}}>{it.satuan}</td><td className="text-right mono" style={{padding:'6px 8px'}}>{formatRupiah(Number(it.harga))}</td><td className="text-right mono" style={{padding:'6px 8px',fontWeight:600}}>{formatRupiah(Number(it.qty)*Number(it.harga))}</td></tr>)}
              <tr style={{fontWeight:700,borderTop:'2px solid var(--border)'}}><td colSpan={4} className="text-right" style={{padding:8}}>TOTAL</td><td className="text-right mono" style={{padding:8}}>{formatRupiah(showDetail.total||0)}</td></tr>
            </tbody>
          </table>
        </Modal>
      })()}

      {showModal&&<Modal title={editId?'Edit Sales Order':'Buat Sales Order Baru'} onClose={()=>setShowModal(false)} width={800} footer={
        <><button className="btn btn-outline" onClick={()=>setShowModal(false)}>Batal</button><button className="btn btn-primary" onClick={handleSave}><Save size={16}/> {editId?'Simpan':'Buat SO'}</button></>
      }>
        <div className="form-row">
          <div className="form-group"><label className="form-label">No. SO</label><input className="form-input" value={form.noSO} onChange={e=>setForm({...form,noSO:e.target.value})} placeholder="Auto-generate"/></div>
          <div className="form-group"><label className="form-label">Tanggal</label><input className="form-input" type="date" value={form.tanggal} onChange={e=>setForm({...form,tanggal:e.target.value})}/></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Pelanggan *</label>
            {pelangganList.length>0?<select className="form-select" value={form.pelanggan_nama} onChange={e=>{const p=pelangganList.find(x=>x.nama===e.target.value);setForm({...form,pelanggan_nama:e.target.value,pelanggan_id:p?.id||''})}}>
              <option value="">— Pilih —</option>{pelangganList.map(p=><option key={p.id} value={p.nama}>{p.nama}</option>)}
            </select>:<input className="form-input" value={form.pelanggan_nama} onChange={e=>setForm({...form,pelanggan_nama:e.target.value})} placeholder="Nama pelanggan"/>}
          </div>
          <div className="form-group"><label className="form-label">Pembayaran</label>
            <select className="form-select" value={form.pembayaran} onChange={e=>setForm({...form,pembayaran:e.target.value})}><option value="tunai">Tunai</option><option value="kredit">Kredit</option></select>
          </div>
        </div>
        <div className="form-group"><label className="form-label">Keterangan</label><input className="form-input" value={form.keterangan} onChange={e=>setForm({...form,keterangan:e.target.value})}/></div>
        <div style={{marginTop:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <strong style={{fontSize:13}}>Item Barang</strong>
            <button className="btn btn-sm btn-outline" onClick={addLine}><Plus size={12}/> Tambah</button>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{background:'var(--bg-secondary)'}}><th style={{padding:'6px 8px',textAlign:'left',width:'35%'}}>Nama</th><th style={{padding:'6px 8px',width:'12%'}}>Qty</th><th style={{padding:'6px 8px',width:'15%'}}>Satuan</th><th style={{padding:'6px 8px',width:'20%'}}>Harga</th><th style={{padding:'6px 8px',width:'15%'}} className="text-right">Subtotal</th><th style={{width:'3%'}}></th></tr></thead>
            <tbody>{lineItems.map((it,i)=><tr key={i} style={{borderBottom:'1px solid var(--border-light)'}}>
              <td style={{padding:4}}><input className="form-input" style={{fontSize:12,padding:'4px 6px'}} value={it.nama} onChange={e=>updateLine(i,'nama',e.target.value)}/></td>
              <td style={{padding:4}}><input className="form-input" type="number" style={{fontSize:12,padding:'4px 6px',textAlign:'right'}} value={it.qty} onChange={e=>updateLine(i,'qty',e.target.value)} min="1"/></td>
              <td style={{padding:4}}><select className="form-select" style={{fontSize:12,padding:'4px 6px'}} value={it.satuan} onChange={e=>updateLine(i,'satuan',e.target.value)}><option>Unit</option><option>Liter</option><option>Pak</option><option>Kg</option><option>Set</option></select></td>
              <td style={{padding:4}}><input className="form-input" type="number" style={{fontSize:12,padding:'4px 6px',textAlign:'right'}} value={it.harga} onChange={e=>updateLine(i,'harga',e.target.value)}/></td>
              <td className="text-right mono" style={{padding:'4px 8px',fontWeight:600}}>{formatRupiah(Number(it.qty)*Number(it.harga))}</td>
              <td style={{padding:4}}><button className="btn btn-icon btn-sm" style={{color:'var(--danger)'}} onClick={()=>removeLine(i)}><X size={12}/></button></td>
            </tr>)}</tbody>
          </table>
          <div style={{textAlign:'right',marginTop:8,fontSize:14,fontWeight:700}}>Total: <span className="mono">{formatRupiah(calcTotal())}</span></div>
        </div>
      </Modal>}
    </div>
  )
}
