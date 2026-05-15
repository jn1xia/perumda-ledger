import { useState, useMemo } from 'react'
import { Plus, Search, Trash2, Download, Printer, FileText, ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { exportCSV } from '../utils/exportUtils.js'
import Modal from '../components/UI/Modal.jsx'

const TABS = [
  { id: 'keluaran', label: 'Faktur Keluaran', icon: ArrowUpRight },
  { id: 'masukan', label: 'Faktur Masukan', icon: ArrowDownLeft },
  { id: 'rekap', label: 'Rekap PPN', icon: FileText },
]

const STATUS_MAP = {
  draft: { label: 'Draft', color: 'blue' },
  reported: { label: 'Dilaporkan', color: 'green' },
}

const PPN_RATE = 0.11 // 11% PPN rate

export default function EFaktur() {
  const { state, dispatch } = useApp()
  const efakturList = state.efaktur || []
  const pelangganList = state.pelangganMaster || []
  const supplierList = state.supplierMaster || []
  const [tab, setTab] = useState('keluaran')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    noFaktur: '', tanggal: new Date().toISOString().split('T')[0],
    tipe: 'keluaran', npwpLawan: '', namaLawan: '', alamatLawan: '',
    dpp: 0, ppn: 0, status: 'draft', keterangan: '',
  })

  const filtered = useMemo(() => {
    let list = efakturList
    if (tab === 'keluaran') list = list.filter(e => e.tipe === 'keluaran')
    if (tab === 'masukan') list = list.filter(e => e.tipe === 'masukan')
    if (search) {
      list = list.filter(e =>
        (e.noFaktur || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.namaLawan || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.npwpLawan || '').toLowerCase().includes(search.toLowerCase())
      )
    }
    return list
  }, [efakturList, tab, search])

  const stats = useMemo(() => {
    const keluaran = efakturList.filter(e => e.tipe === 'keluaran')
    const masukan = efakturList.filter(e => e.tipe === 'masukan')
    return {
      dppKeluaran: keluaran.reduce((s, e) => s + (e.dpp || 0), 0),
      ppnKeluaran: keluaran.reduce((s, e) => s + (e.ppn || 0), 0),
      dppMasukan: masukan.reduce((s, e) => s + (e.dpp || 0), 0),
      ppnMasukan: masukan.reduce((s, e) => s + (e.ppn || 0), 0),
      countKeluaran: keluaran.length,
      countMasukan: masukan.length,
    }
  }, [efakturList])

  function openAdd() {
    setForm({
      noFaktur: '', tanggal: new Date().toISOString().split('T')[0],
      tipe: tab === 'masukan' ? 'masukan' : 'keluaran',
      npwpLawan: '', namaLawan: '', alamatLawan: '',
      dpp: 0, ppn: 0, status: 'draft', keterangan: '',
    })
    setShowModal(true)
  }

  function handleDppChange(val) {
    const dpp = Number(val)
    setForm({ ...form, dpp, ppn: Math.round(dpp * PPN_RATE) })
  }

  function handleSave() {
    if (!form.namaLawan || !form.dpp) return alert('Nama Lawan Transaksi dan DPP wajib diisi')
    dispatch({ type: 'ADD_EFAKTUR', payload: form })
    setShowModal(false)
  }

  function handleDelete(id) {
    if (!confirm('Hapus faktur ini?')) return
    dispatch({ type: 'DELETE_EFAKTUR', payload: id })
  }

  function handleExportDJP() {
    // DJP CSV format: FK, KD_JENIS_TRANSAKSI, FG_PENGGANTI, NOMOR_FAKTUR, MASA_PAJAK, TAHUN_PAJAK, TANGGAL_FAKTUR, NPWP, NAMA, ALAMAT_LENGKAP, JUMLAH_DPP, JUMLAH_PPN, ...
    const rows = filtered.map(e => {
      const tgl = e.tanggal.replace(/-/g, '/')
      const masa = e.tanggal.split('-')[1]
      const tahun = e.tanggal.split('-')[0]
      return ['FK', '01', '0', e.noFaktur || '', masa, tahun, tgl, e.npwpLawan || '', e.namaLawan, e.alamatLawan || '', e.dpp, e.ppn, '0', '0', '0', '0', '0', '0', '0', '0']
    })
    exportCSV(`EFaktur_${tab}_DJP`, ['FK', 'KD_JENIS_TRANSAKSI', 'FG_PENGGANTI', 'NOMOR_FAKTUR', 'MASA_PAJAK', 'TAHUN_PAJAK', 'TANGGAL_FAKTUR', 'NPWP', 'NAMA', 'ALAMAT_LENGKAP', 'JUMLAH_DPP', 'JUMLAH_PPN', 'JUMLAH_PPNBM', 'ID_KETERANGAN_TAMBAHAN', 'FG_UANG_MUKA', 'UANG_MUKA_DPP', 'UANG_MUKA_PPN', 'UANG_MUKA_PPNBM', 'REFERENSI', 'KETERANGAN_TAMBAHAN'], rows)
  }

  function handleExportCSV() {
    exportCSV(`EFaktur_${tab}`, ['No. Faktur', 'Tanggal', 'Tipe', 'NPWP Lawan', 'Nama Lawan', 'Alamat', 'DPP', 'PPN', 'Status', 'Keterangan'],
      filtered.map(e => [e.noFaktur, e.tanggal, e.tipe === 'keluaran' ? 'Keluaran' : 'Masukan', e.npwpLawan, e.namaLawan, e.alamatLawan, e.dpp, e.ppn, e.status, e.keterangan]))
  }

  const lawanOptions = tab === 'masukan' || form.tipe === 'masukan' ? supplierList : pelangganList

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>E-Faktur PPN</h1>
          <p>Pengelolaan faktur pajak untuk pelaporan SPT PPN</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleExportDJP}><Download size={16} /> Export DJP</button>
          <button className="btn btn-outline" onClick={handleExportCSV}><Download size={16} /> Export CSV</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">PPN Keluaran <ArrowUpRight size={16} color="var(--danger)" /></div>
          <div className="kpi-value" style={{ fontSize: 16 }}>{formatRupiah(stats.ppnKeluaran)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stats.countKeluaran} faktur · DPP {formatRupiah(stats.dppKeluaran)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">PPN Masukan <ArrowDownLeft size={16} color="var(--success)" /></div>
          <div className="kpi-value" style={{ fontSize: 16 }}>{formatRupiah(stats.ppnMasukan)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stats.countMasukan} faktur · DPP {formatRupiah(stats.dppMasukan)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Kurang/Lebih Bayar</div>
          <div className="kpi-value" style={{ fontSize: 16, color: stats.ppnKeluaran - stats.ppnMasukan > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {formatRupiah(Math.abs(stats.ppnKeluaran - stats.ppnMasukan))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stats.ppnKeluaran - stats.ppnMasukan > 0 ? 'Kurang Bayar' : 'Lebih Bayar'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Tarif PPN</div>
          <div className="kpi-value" style={{ fontSize: 24 }}>11%</div>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab !== 'rekap' && (
        <>
          <div className="toolbar">
            <div className="topbar-search" style={{ maxWidth: 300 }}>
              <Search /><input type="text" placeholder="Cari faktur/NPWP..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="toolbar-right">
              <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Tambah Faktur</button>
            </div>
          </div>

          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>No. Faktur</th><th>Tanggal</th><th>NPWP</th>
                    <th>Nama</th><th className="text-right">DPP</th>
                    <th className="text-right">PPN (11%)</th><th>Status</th>
                    <th className="text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => {
                    const st = STATUS_MAP[e.status] || STATUS_MAP.draft
                    return (
                      <tr key={e.id}>
                        <td className="mono" style={{ fontWeight: 600 }}>{e.noFaktur || '-'}</td>
                        <td>{e.tanggal}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{e.npwpLawan || '-'}</td>
                        <td style={{ fontWeight: 500 }}>{e.namaLawan}</td>
                        <td className="text-right mono">{formatRupiah(e.dpp || 0)}</td>
                        <td className="text-right mono" style={{ fontWeight: 600 }}>{formatRupiah(e.ppn || 0)}</td>
                        <td><span className={`badge ${st.color}`}>{st.label}</span></td>
                        <td className="text-center">
                          <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(e.id)}><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Belum ada data faktur pajak</td></tr>}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13, fontWeight: 600 }}>
                <span>Total DPP: <span className="mono">{formatRupiah(filtered.reduce((s, e) => s + (e.dpp || 0), 0))}</span></span>
                <span>Total PPN: <span className="mono">{formatRupiah(filtered.reduce((s, e) => s + (e.ppn || 0), 0))}</span></span>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'rekap' && (
        <div className="card" style={{ padding: 20 }}>
          <div className="card-header" style={{ marginBottom: 16 }}>
            <div className="card-title"><FileText size={16} /> Rekap PPN Bulanan</div>
            <button className="btn btn-outline btn-sm" onClick={() => window.print()}><Printer size={14} /> Cetak</button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th>Bulan</th>
                  <th className="text-right">DPP Keluaran</th><th className="text-right">PPN Keluaran</th>
                  <th className="text-right">DPP Masukan</th><th className="text-right">PPN Masukan</th>
                  <th className="text-right">Kurang/Lebih Bayar</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }, (_, i) => {
                  const month = String(i + 1).padStart(2, '0')
                  const monthName = new Date(2026, i).toLocaleString('id-ID', { month: 'long' })
                  const kel = efakturList.filter(e => e.tipe === 'keluaran' && e.tanggal?.startsWith(`2026-${month}`))
                  const mas = efakturList.filter(e => e.tipe === 'masukan' && e.tanggal?.startsWith(`2026-${month}`))
                  const dppK = kel.reduce((s, e) => s + (e.dpp || 0), 0)
                  const ppnK = kel.reduce((s, e) => s + (e.ppn || 0), 0)
                  const dppM = mas.reduce((s, e) => s + (e.dpp || 0), 0)
                  const ppnM = mas.reduce((s, e) => s + (e.ppn || 0), 0)
                  const diff = ppnK - ppnM
                  return (
                    <tr key={month}>
                      <td style={{ fontWeight: 500 }}>{monthName}</td>
                      <td className="text-right mono">{formatRupiah(dppK)}</td>
                      <td className="text-right mono">{formatRupiah(ppnK)}</td>
                      <td className="text-right mono">{formatRupiah(dppM)}</td>
                      <td className="text-right mono">{formatRupiah(ppnM)}</td>
                      <td className="text-right mono" style={{ fontWeight: 600, color: diff > 0 ? 'var(--danger)' : diff < 0 ? 'var(--success)' : 'inherit' }}>
                        {diff > 0 ? `(KB) ${formatRupiah(diff)}` : diff < 0 ? `(LB) ${formatRupiah(Math.abs(diff))}` : '-'}
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td>TOTAL 2026</td>
                  <td className="text-right mono">{formatRupiah(stats.dppKeluaran)}</td>
                  <td className="text-right mono">{formatRupiah(stats.ppnKeluaran)}</td>
                  <td className="text-right mono">{formatRupiah(stats.dppMasukan)}</td>
                  <td className="text-right mono">{formatRupiah(stats.ppnMasukan)}</td>
                  <td className="text-right mono" style={{ color: stats.ppnKeluaran - stats.ppnMasukan > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {formatRupiah(Math.abs(stats.ppnKeluaran - stats.ppnMasukan))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <Modal title={`Tambah Faktur ${form.tipe === 'keluaran' ? 'Keluaran' : 'Masukan'}`} onClose={() => setShowModal(false)} width={600} footer={
          <><button className="btn btn-outline" onClick={() => setShowModal(false)}>Batal</button>
            <button className="btn btn-primary" onClick={handleSave}>Simpan</button></>
        }>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">No. Faktur Pajak</label>
              <input className="form-input" value={form.noFaktur} onChange={e => setForm({ ...form, noFaktur: e.target.value })} placeholder="010.000-26.00000001" />
            </div>
            <div className="form-group">
              <label className="form-label">Tanggal</label>
              <input className="form-input" type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tipe</label>
              <select className="form-select" value={form.tipe} onChange={e => setForm({ ...form, tipe: e.target.value })}>
                <option value="keluaran">Faktur Keluaran</option>
                <option value="masukan">Faktur Masukan</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">NPWP Lawan Transaksi</label>
              <input className="form-input" value={form.npwpLawan} onChange={e => setForm({ ...form, npwpLawan: e.target.value })} placeholder="XX.XXX.XXX.X-XXX.XXX" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Nama Lawan Transaksi *</label>
            {lawanOptions.length > 0 ? (
              <select className="form-select" value={form.namaLawan} onChange={e => {
                const lawan = lawanOptions.find(l => l.nama === e.target.value)
                setForm({ ...form, namaLawan: e.target.value, npwpLawan: lawan?.npwp || form.npwpLawan, alamatLawan: lawan?.alamat || form.alamatLawan })
              }}>
                <option value="">— Pilih —</option>
                {lawanOptions.map(l => <option key={l.id} value={l.nama}>{l.nama}{l.npwp ? ` (${l.npwp})` : ''}</option>)}
              </select>
            ) : (
              <input className="form-input" value={form.namaLawan} onChange={e => setForm({ ...form, namaLawan: e.target.value })} placeholder="Nama" />
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Alamat</label>
            <input className="form-input" value={form.alamatLawan} onChange={e => setForm({ ...form, alamatLawan: e.target.value })} placeholder="Alamat lawan transaksi" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">DPP (Dasar Pengenaan Pajak)</label>
              <input className="form-input" type="number" value={form.dpp} onChange={e => handleDppChange(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">PPN (11%)</label>
              <input className="form-input" type="number" value={form.ppn} readOnly style={{ background: 'var(--bg-secondary)' }} />
            </div>
          </div>
          <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8, marginTop: 8, fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            <span>Total (DPP + PPN):</span>
            <span className="mono">{formatRupiah((Number(form.dpp) || 0) + (Number(form.ppn) || 0))}</span>
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Keterangan</label>
            <input className="form-input" value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} placeholder="Catatan" />
          </div>
        </Modal>
      )}
    </div>
  )
}
