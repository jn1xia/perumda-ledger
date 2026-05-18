import { useState } from 'react'
import { CheckCircle2, AlertTriangle, Plus, X, Save, Trash2, Download } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { exportCSV } from '../utils/exportUtils.js'

export default function RekonsiliasiBank() {
  const { state, dispatch } = useApp()
  const rekon = state.rekonsiliasi || { saldoBank: 0, saldoBuku: 0, selisih: 0, items: [] }
  const [showAddItem, setShowAddItem] = useState(false)
  const [showEditSaldo, setShowEditSaldo] = useState(false)
  const [newItem, setNewItem] = useState({ tanggal: new Date().toISOString().split('T')[0], keterangan: '', ref: '', jumlah: 0, tipe: 'bank' })
  const [saldoForm, setSaldoForm] = useState({ saldoBank: rekon.saldoBank, saldoBuku: rekon.saldoBuku })

  const handleResolve = (index) => {
    if (confirm('Selesaikan item rekonsiliasi ini? Item akan dihapus dari daftar.')) {
      dispatch({ type: 'RESOLVE_REKON_ITEM', payload: index })
    }
  }

  const handleAddItem = () => {
    if (!newItem.keterangan || !newItem.ref) return alert('Keterangan dan Referensi wajib diisi')
    dispatch({ type: 'ADD_REKON_ITEM', payload: { ...newItem, jumlah: Number(newItem.jumlah) } })
    setNewItem({ tanggal: new Date().toISOString().split('T')[0], keterangan: '', ref: '', jumlah: 0, tipe: 'bank' })
    setShowAddItem(false)
  }

  const handleUpdateSaldo = () => {
    const saldoBank = Number(saldoForm.saldoBank)
    const saldoBuku = Number(saldoForm.saldoBuku)
    dispatch({ type: 'UPDATE_REKON_SALDO', payload: { saldoBank, saldoBuku } })
    setShowEditSaldo(false)
  }

  const computedSelisih = rekon.items.reduce((s, item) => s + item.jumlah, 0)

  const handleExport = () => {
    const rows = [
      ['--- Rekonsiliasi Bank ---', '', '', '', ''],
      ['Saldo Rekening Koran', formatRupiah(rekon.saldoBank), '', '', ''],
      ['Saldo Buku Besar', formatRupiah(rekon.saldoBuku), '', '', ''],
      ['Selisih Belum Selesai', formatRupiah(computedSelisih), '', '', ''],
      ['', '', '', '', ''],
      ['Tanggal', 'Keterangan', 'Referensi', 'Sumber', 'Jumlah'],
      ...rekon.items.map(item => [
        item.tanggal,
        item.keterangan,
        item.ref,
        item.tipe === 'bank' ? 'Rekening Koran' : 'Buku Besar',
        item.jumlah,
      ]),
    ]
    exportCSV(
      `Rekonsiliasi_Bank_${new Date().toISOString().split('T')[0]}`,
      ['Tanggal', 'Keterangan', 'Referensi', 'Sumber', 'Jumlah'],
      rekon.items.map(item => [
        item.tanggal, item.keterangan, item.ref,
        item.tipe === 'bank' ? 'Rekening Koran' : 'Buku Besar',
        item.jumlah,
      ])
    )
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Rekonsiliasi Bank</h1>
        <p>Pencocokan saldo bank dengan buku besar</p>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns: 'repeat(3, 1fr)'}}>
        <div className="kpi-card" onClick={() => { setSaldoForm({ saldoBank: rekon.saldoBank, saldoBuku: rekon.saldoBuku }); setShowEditSaldo(true) }} style={{cursor:'pointer'}}>
          <div className="kpi-label">Saldo Rekening Koran</div>
          <div className="kpi-value" style={{fontSize:18}}>{formatRupiah(rekon.saldoBank)}</div>
          <div style={{fontSize:12, color:'var(--text-muted)'}}>Bank Kalsel — 11103 (klik untuk edit)</div>
        </div>
        <div className="kpi-card" onClick={() => { setSaldoForm({ saldoBank: rekon.saldoBank, saldoBuku: rekon.saldoBuku }); setShowEditSaldo(true) }} style={{cursor:'pointer'}}>
          <div className="kpi-label">Saldo Buku Besar</div>
          <div className="kpi-value" style={{fontSize:18}}>{formatRupiah(rekon.saldoBuku)}</div>
          <div style={{fontSize:12, color:'var(--text-muted)'}}>Per 31 Januari 2026 (klik untuk edit)</div>
        </div>
        <div className="kpi-card" style={{borderColor: computedSelisih !== 0 ? 'var(--warning)' : 'var(--success)'}}>
          <div className="kpi-label">
            Selisih
            {computedSelisih !== 0
              ? <AlertTriangle size={18} color="var(--warning)" />
              : <CheckCircle2 size={18} color="var(--success)" />
            }
          </div>
          <div className="kpi-value" style={{fontSize:18, color: computedSelisih !== 0 ? 'var(--warning)' : 'var(--success)'}}>{formatRupiah(computedSelisih)}</div>
        </div>
      </div>

      {showEditSaldo && (
        <div className="card" style={{marginTop: 16, padding: 20}}>
          <div className="card-header" style={{marginBottom: 12}}>
            <div className="card-title">Edit Saldo</div>
            <button className="btn btn-outline" onClick={() => setShowEditSaldo(false)}><X size={16} /></button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Saldo Rekening Koran</label>
              <input className="form-input" type="number" value={saldoForm.saldoBank} onChange={e => setSaldoForm({...saldoForm, saldoBank: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Saldo Buku Besar</label>
              <input className="form-input" type="number" value={saldoForm.saldoBuku} onChange={e => setSaldoForm({...saldoForm, saldoBuku: e.target.value})} />
            </div>
          </div>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:8}}>
            <button className="btn btn-outline" onClick={() => setShowEditSaldo(false)}>Batal</button>
            <button className="btn btn-primary" onClick={handleUpdateSaldo}><Save size={16} /> Simpan</button>
          </div>
        </div>
      )}

      <div className="toolbar" style={{marginTop: 16}}>
        <div className="toolbar-right" style={{marginLeft:0, display:'flex', gap:8}}>
          <button className="btn btn-outline" onClick={handleExport}><Download size={16} /> Export CSV</button>
          <button className="btn btn-primary" onClick={() => setShowAddItem(true)}><Plus size={16} /> Tambah Item Rekonsiliasi</button>
        </div>
      </div>

      {showAddItem && (
        <div className="card" style={{marginBottom: 16, padding: 20}}>
          <div className="card-header" style={{marginBottom: 12}}>
            <div className="card-title">Tambah Item Rekonsiliasi</div>
            <button className="btn btn-outline" onClick={() => setShowAddItem(false)}><X size={16} /></button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tanggal</label>
              <input className="form-input" type="date" value={newItem.tanggal} onChange={e => setNewItem({...newItem, tanggal: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Keterangan</label>
              <input className="form-input" value={newItem.keterangan} onChange={e => setNewItem({...newItem, keterangan: e.target.value})} placeholder="Transfer masuk belum tercatat" />
            </div>
            <div className="form-group">
              <label className="form-label">Referensi</label>
              <input className="form-input" value={newItem.ref} onChange={e => setNewItem({...newItem, ref: e.target.value})} placeholder="CR-0125" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Jumlah (negatif untuk kredit)</label>
              <input className="form-input" type="number" value={newItem.jumlah} onChange={e => setNewItem({...newItem, jumlah: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Sumber</label>
              <select className="form-select" value={newItem.tipe} onChange={e => setNewItem({...newItem, tipe: e.target.value})}>
                <option value="bank">Rekening Koran</option>
                <option value="buku">Buku Besar</option>
              </select>
            </div>
          </div>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:8}}>
            <button className="btn btn-outline" onClick={() => setShowAddItem(false)}>Batal</button>
            <button className="btn btn-primary" onClick={handleAddItem}><Save size={16} /> Simpan</button>
          </div>
        </div>
      )}

      <div className="card" style={{marginTop: 8}}>
        <div className="card-header">
          <div className="card-title">Item Rekonsiliasi</div>
          <span className="badge orange">{rekon.items.length} item belum selesai</span>
        </div>
        <div className="table-container">
          <table>
            <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Referensi</th><th>Sumber</th><th className="text-right">Jumlah</th><th className="text-center">Aksi</th></tr></thead>
            <tbody>
              {rekon.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.tanggal}</td>
                  <td>{item.keterangan}</td>
                  <td className="mono">{item.ref}</td>
                  <td><span className={`badge ${item.tipe === 'bank' ? 'blue' : 'purple'}`}>{item.tipe === 'bank' ? 'Rekening Koran' : 'Buku Besar'}</span></td>
                  <td className="text-right mono" style={{fontWeight:600, color: item.jumlah >= 0 ? 'var(--success)' : 'var(--danger)'}}>{formatRupiah(item.jumlah)}</td>
                  <td className="text-center">
                    <button className="btn btn-sm btn-primary" onClick={() => handleResolve(i)}>Selesaikan</button>
                  </td>
                </tr>
              ))}
              {rekon.items.length === 0 && (
                <tr><td colSpan={6} style={{textAlign:'center', padding:20, color:'var(--text-muted)'}}>
                  <CheckCircle2 size={24} color="var(--success)" style={{marginBottom:8}} /><br />
                  Semua item telah direkonsiliasi!
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
