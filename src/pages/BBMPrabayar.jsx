import { useState, useMemo } from 'react'
import { Fuel, TrendingDown, TrendingUp, Plus, Trash2, X, Save } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'

export default function BBMPrabayar() {
  const { state, dispatch } = useApp()
  const transactions = state.bbmTransactions || []
  const [showForm, setShowForm] = useState(false)
  const [formTipe, setFormTipe] = useState('Top-up')
  const [form, setForm] = useState({ tanggal: new Date().toISOString().split('T')[0], keterangan: '', volume: '', harga: 7500 })

  const stats = useMemo(() => {
    let totalTopup = 0, totalPakai = 0, volTopup = 0, volPakai = 0
    transactions.forEach(t => {
      if (t.tipe === 'Top-up') { totalTopup += t.total; volTopup += t.volume }
      else { totalPakai += t.total; volPakai += t.volume }
    })
    return { saldo: totalTopup - totalPakai, volumeSisa: volTopup - volPakai, totalTopup, totalPakai, volTopup, volPakai }
  }, [transactions])

  const resetForm = () => {
    setForm({ tanggal: new Date().toISOString().split('T')[0], keterangan: '', volume: '', harga: 7500 })
    setShowForm(false)
  }

  const handleSubmit = () => {
    if (!form.keterangan || !form.volume) return alert('Keterangan dan Volume wajib diisi')
    const volume = Number(form.volume)
    const harga = Number(form.harga)
    dispatch({
      type: 'ADD_BBM',
      payload: { tanggal: form.tanggal, tipe: formTipe, keterangan: form.keterangan, volume, harga, total: volume * harga }
    })
    resetForm()
  }

  const handleDelete = (id) => {
    if (confirm('Hapus transaksi BBM ini?')) {
      dispatch({ type: 'DELETE_BBM', payload: id })
    }
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>BBM Prabayar</h1>
        <p>Manajemen bahan bakar prabayar</p>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns: 'repeat(4, 1fr)'}}>
        <div className="kpi-card">
          <div className="kpi-label">Saldo BBM <span className="kpi-icon blue" style={{width:28,height:28}}><Fuel size={16} /></span></div>
          <div className="kpi-value">{formatRupiah(stats.saldo)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Volume Tersisa</div>
          <div className="kpi-value">{stats.volumeSisa.toLocaleString('id-ID')} L</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Top-up</div>
          <div className="kpi-value" style={{color:'var(--success)'}}>{formatRupiah(stats.totalTopup)}</div>
          <div className="kpi-trend up"><TrendingUp size={14} /> {stats.volTopup.toLocaleString('id-ID')} Liter</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Pemakaian</div>
          <div className="kpi-value" style={{color:'var(--danger)'}}>{formatRupiah(stats.totalPakai)}</div>
          <div className="kpi-trend down"><TrendingDown size={14} /> {stats.volPakai.toLocaleString('id-ID')} Liter</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-right" style={{marginLeft:0}}>
          <button className="btn btn-primary" onClick={() => { setFormTipe('Top-up'); setShowForm(true) }}><Plus size={16} /> Catat Top-up</button>
          <button className="btn btn-outline" onClick={() => { setFormTipe('Pemakaian'); setShowForm(true) }}><Plus size={16} /> Catat Pemakaian</button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{marginBottom: 20, padding: 20}}>
          <div className="card-header" style={{marginBottom: 16}}>
            <div className="card-title">Catat {formTipe}</div>
            <button className="btn btn-outline" onClick={resetForm}><X size={16} /></button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tanggal</label>
              <input className="form-input" type="date" value={form.tanggal} onChange={e => setForm({...form, tanggal: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Keterangan</label>
              <input className="form-input" value={form.keterangan} onChange={e => setForm({...form, keterangan: e.target.value})} placeholder={formTipe === 'Top-up' ? 'Pembelian Solar 500L' : 'Operasional truck harian'} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Volume (Liter)</label>
              <input className="form-input" type="number" value={form.volume} onChange={e => setForm({...form, volume: e.target.value})} placeholder="500" />
            </div>
            <div className="form-group">
              <label className="form-label">Harga per Liter</label>
              <input className="form-input" type="number" value={form.harga} onChange={e => setForm({...form, harga: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Total</label>
              <div className="form-input" style={{background:'var(--bg-secondary)', fontWeight:600}}>{formatRupiah(Number(form.volume||0) * Number(form.harga||0))}</div>
            </div>
          </div>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:12}}>
            <button className="btn btn-outline" onClick={resetForm}>Batal</button>
            <button className="btn btn-primary" onClick={handleSubmit}><Save size={16} /> Simpan</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><div className="card-title">Riwayat Transaksi BBM</div></div>
        <div className="table-container">
          <table>
            <thead><tr><th>ID</th><th>Tanggal</th><th>Tipe</th><th>Keterangan</th><th className="text-right">Volume (L)</th><th className="text-right">Harga/L</th><th className="text-right">Total</th><th className="text-center">Aksi</th></tr></thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id}>
                  <td className="mono">{t.id}</td>
                  <td>{t.tanggal}</td>
                  <td><span className={`badge ${t.tipe === 'Top-up' ? 'green' : 'red'}`}>{t.tipe}</span></td>
                  <td>{t.keterangan}</td>
                  <td className="text-right" style={{color: t.tipe === 'Top-up' ? 'var(--success)' : 'var(--danger)', fontWeight:600}}>{t.tipe === 'Top-up' ? '+' : '-'}{t.volume}</td>
                  <td className="text-right mono">{formatRupiah(t.harga)}</td>
                  <td className="text-right mono" style={{fontWeight:600, color: t.tipe === 'Top-up' ? 'var(--success)' : 'var(--danger)'}}>{t.tipe === 'Top-up' ? '' : '-'}{formatRupiah(t.total)}</td>
                  <td className="text-center">
                    <button className="btn btn-sm btn-outline" style={{color:'var(--danger)'}} onClick={() => handleDelete(t.id)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && <tr><td colSpan={8} style={{textAlign:'center', padding:20, color:'var(--text-muted)'}}>Tidak ada transaksi</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
