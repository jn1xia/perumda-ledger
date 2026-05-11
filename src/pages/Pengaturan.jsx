import { useState, useEffect } from 'react'
import { Save, Building2, User, Shield, Database, Bell, FileText, Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'

export default function Pengaturan() {
  const { state, dispatch } = useApp()
  const [activeSection, setActiveSection] = useState('perusahaan')
  const [form, setForm] = useState({ ...state.pengaturan })
  const [saved, setSaved] = useState(false)
   const [deleteMonth, setDeleteMonth] = useState('')
   const [showDeleteModal, setShowDeleteModal] = useState(false)
   const [showResetModal, setShowResetModal] = useState(false)

  useEffect(() => {
    setForm({ ...state.pengaturan })
  }, [state.pengaturan])

  const sections = [
    { id: 'perusahaan', label: 'Perusahaan', icon: Building2 },
    { id: 'pajak', label: 'Pajak & PPN', icon: FileText },
    { id: 'voucher', label: 'Voucher Setup', icon: FileText },
    { id: 'pengguna', label: 'Pengguna', icon: User },
    { id: 'keamanan', label: 'Keamanan', icon: Shield },
    { id: 'data', label: 'Data & Backup', icon: Database },
    { id: 'notifikasi', label: 'Notifikasi', icon: Bell },
  ]

  const handleSave = () => {
    dispatch({ type: 'UPDATE_PENGATURAN', payload: form })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleExportData = () => {
    const data = {
      journals: state.journals,
      coaTree: state.coaTree,
      assets: state.assets,
      inventory: state.inventory,
      bbmTransactions: state.bbmTransactions,
      piutang: state.piutang,
      hutang: state.hutang,
      anggaran: state.anggaran,
      rekonsiliasi: state.rekonsiliasi,
      pengaturan: state.pengaturan,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `perumda-ledger-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

    const handleResetData = () => {
     setShowResetModal(true);
    }

    const confirmResetData = () => {
     console.log('User confirmed reset - dispatching RESET_DATA');
     dispatch({ type: 'RESET_DATA' })
     setShowResetModal(false)
     console.log('Reset complete, closing modal');
     setTimeout(() => alert('Data berhasil direset ke pengaturan awal.'), 100)
    }

  const handleDeleteByMonth = () => {
    if (!deleteMonth) {
      alert('Silakan pilih bulan terlebih dahulu.')
      return
    }
    setShowDeleteModal(true)
  }

  const confirmDeleteByMonth = () => {
    dispatch({ type: 'DELETE_JOURNALS_BY_MONTH', payload: deleteMonth })
    setShowDeleteModal(false)
    setDeleteMonth('')
    
    // Show a temporary success message
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'perusahaan':
        return (
          <>
            <div className="card-header"><div className="card-title">Informasi Perusahaan</div></div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nama Perusahaan</label>
                <input className="form-input" value={form.namaPerusahaan || ''} onChange={e => setForm({...form, namaPerusahaan: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">NPWP</label>
                <input className="form-input" value={form.npwp || ''} onChange={e => setForm({...form, npwp: e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Alamat</label>
                <input className="form-input" value={form.alamat || ''} onChange={e => setForm({...form, alamat: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Kota</label>
                <input className="form-input" value={form.kota || ''} onChange={e => setForm({...form, kota: e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Telepon</label>
                <input className="form-input" value={form.telepon || ''} onChange={e => setForm({...form, telepon: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Jabatan Penanggung Jawab</label>
                <input className="form-input" value={form.jabatan || ''} onChange={e => setForm({...form, jabatan: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Tahun Fiskal Dimulai</label>
                <select className="form-select" value={form.tahunFiskal || 'Januari'} onChange={e => setForm({...form, tahunFiskal: e.target.value})}>
                  {['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Alamat Faktur Pajak</label>
                <input className="form-input" value={form.alamatFakturPajak || ''} onChange={e => setForm({...form, alamatFakturPajak: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">No. SK Pengukuhan PKP</label>
                <input className="form-input" value={form.noSkPengukuhan || ''} onChange={e => setForm({...form, noSkPengukuhan: e.target.value})} placeholder="Opsional" />
              </div>
            </div>
          </>
        )

      case 'pajak':
        return (
          <>
            <div className="card-header"><div className="card-title">Pengaturan Pajak & PPN</div></div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tarif PPN Standard (%)</label>
                <input className="form-input" type="number" value={form.ppnStandard || 11} onChange={e => setForm({...form, ppnStandard: Number(e.target.value)})} />
              </div>
              <div className="form-group">
                <label className="form-label">Denda Keterlambatan (%/bulan)</label>
                <input className="form-input" type="number" value={form.dendaTerlambat || 2} onChange={e => setForm({...form, dendaTerlambat: Number(e.target.value)})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Batas Materai (Rp)</label>
                <input className="form-input" type="number" value={form.materaiMulai || 5000000} onChange={e => setForm({...form, materaiMulai: Number(e.target.value)})} />
              </div>
              <div className="form-group">
                <label className="form-label">Nilai Materai (Rp)</label>
                <input className="form-input" type="number" value={form.materaiNilai || 10000} onChange={e => setForm({...form, materaiNilai: Number(e.target.value)})} />
              </div>
            </div>
            <div style={{padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, marginTop: 8, fontSize: 13, color: 'var(--text-secondary)'}}>
              <strong>Keterangan:</strong> Tarif PPN berlaku untuk semua transaksi pembelian/penjualan yang dikenakan pajak. Denda keterlambatan dihitung per bulan dari tanggal jatuh tempo.
            </div>
          </>
        )

      case 'voucher':
        return (
          <>
            <div className="card-header"><div className="card-title">Pengaturan Voucher</div></div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nama Kasir / Pembuat</label>
                <input className="form-input" value={form.namaKasirVoucher || ''} onChange={e => setForm({...form, namaKasirVoucher: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Nama Pemeriksa</label>
                <input className="form-input" value={form.namaPeriksaVoucher || ''} onChange={e => setForm({...form, namaPeriksaVoucher: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Nama Penyetuju</label>
                <input className="form-input" value={form.namaSetujuVoucher || ''} onChange={e => setForm({...form, namaSetujuVoucher: e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">No. Awal SPK</label>
                <input className="form-input" value={form.noAwalSpk || ''} onChange={e => setForm({...form, noAwalSpk: e.target.value})} placeholder="SPK00000" />
              </div>
            </div>
          </>
        )

      case 'data':
        return (
          <>
            <div className="card-header"><div className="card-title">Data & Backup</div></div>
            <div style={{display:'flex', flexDirection:'column', gap: 16}}>
              <div style={{padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <h4 style={{margin:0, marginBottom:4}}>Export Data (JSON Backup)</h4>
                  <p style={{margin:0, fontSize:13, color:'var(--text-muted)'}}>Download semua data aplikasi sebagai file JSON backup</p>
                </div>
                <button className="btn btn-primary" onClick={handleExportData}><Download size={16} /> Export</button>
              </div>
              <div style={{padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                 <div>
                   <h4 style={{margin:0, marginBottom:4, color:'var(--danger)'}}>Reset Semua Data</h4>
                   <p style={{margin:0, fontSize:13, color:'var(--text-muted)'}}>Menghapus semua data dan kembali ke pengaturan awal. Tidak dapat dibatalkan!</p>
                 </div>
                 <button className="btn btn-outline" style={{color:'var(--danger)', borderColor:'var(--danger)'}} onClick={() => setShowResetModal(true)}><AlertTriangle size={16} /> Reset</button>
              </div>
              <div style={{padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <h4 style={{margin:0, marginBottom:4, color:'var(--danger)'}}>Hapus Jurnal per Bulan</h4>
                  <p style={{margin:0, fontSize:13, color:'var(--text-muted)'}}>Menghapus semua transaksi jurnal pada bulan tertentu.</p>
                </div>
                <div style={{display:'flex', gap: 8, alignItems:'center'}}>
                  <input type="month" className="form-input" value={deleteMonth} onChange={e => setDeleteMonth(e.target.value)} />
                  <button className="btn btn-outline" style={{color:'var(--danger)', borderColor:'var(--danger)'}} onClick={handleDeleteByMonth}><AlertTriangle size={16} /> Hapus</button>
                </div>
              </div>
              <div style={{padding: '12px 16px', background: 'rgba(59,130,246,0.08)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)'}}>
                <strong>Info:</strong> Semua data disimpan di localStorage browser Anda. Menghapus cache browser akan menghapus semua data.
              </div>
            </div>
          </>
        )

      default:
        return (
          <div style={{textAlign:'center', padding: 40}}>
            {sections.find(s => s.id === activeSection) && (() => { const S = sections.find(s => s.id === activeSection); return <S.icon size={48} color="var(--text-muted)" style={{marginBottom:16}} /> })()}
            <h3 style={{color:'var(--text-secondary)', marginBottom:8}}>Pengaturan {sections.find(s=>s.id===activeSection)?.label}</h3>
            <p style={{color:'var(--text-muted)', fontSize:13}}>Fitur ini akan segera tersedia.</p>
          </div>
        )
    }
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Pengaturan</h1>
        <p>Konfigurasi sistem dan preferensi</p>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'220px 1fr', gap: 24}}>
        <div className="card" style={{padding: 8, height:'fit-content'}}>
          {sections.map(s => (
            <button key={s.id} className={`nav-item ${activeSection === s.id ? 'active' : ''}`} onClick={() => setActiveSection(s.id)} style={{width:'100%'}}>
              <s.icon size={18} /><span>{s.label}</span>
            </button>
          ))}
        </div>

        <div className="card">
          {renderSection()}
          {['perusahaan', 'pajak', 'voucher'].includes(activeSection) && (
            <div style={{marginTop:20, display:'flex', justifyContent:'flex-end', alignItems:'center', gap: 12}}>
              {saved && <span style={{color:'var(--success)', fontSize:13, display:'flex', alignItems:'center', gap:4}}><CheckCircle2 size={16} /> Tersimpan!</span>}
              <button className="btn btn-primary" onClick={handleSave}><Save size={16} /> Simpan Perubahan</button>
            </div>
          )}
        </div>
      </div>

        {/* CUSTOM MODAL FOR DELETE CONFIRMATION */}
        {showDeleteModal && (
         <div 
           onClick={() => setShowDeleteModal(false)} 
           style={{
             position: 'fixed', 
             top: 0, 
             left: 0, 
             right: 0, 
             bottom: 0, 
             backgroundColor: 'rgba(0,0,0,0.5)', 
             zIndex: 1000, 
             display: 'flex', 
             alignItems: 'center', 
             justifyContent: 'center'
           }}
         >
           <div 
             onClick={(e) => e.stopPropagation()} 
             style={{
               background: 'white', 
               borderRadius: '8px', 
               padding: '24px', 
               width: '90%', 
               maxWidth: '400px',
               boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
             }}
           >
             <div style={{ marginBottom: '20px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                 <span style={{ color: '#dc2626', fontSize: '24px' }}>⚠️</span>
                 <h3 style={{ margin: 0, color: '#1f2937', fontSize: '18px' }}>Konfirmasi Hapus Data</h3>
               </div>
             </div>
             
             <div style={{ color: '#4b5563', lineHeight: '1.6', marginBottom: '24px' }}>
               PERINGATAN: Anda yakin ingin menghapus <strong>SEMUA data jurnal</strong> untuk bulan{' '}
               <strong style={{ color: '#1f2937' }}>
                 {deleteMonth && new Date(deleteMonth.split('-')[0], parseInt(deleteMonth.split('-')[1])-1, 1).toLocaleString('id-ID', { month: 'long', year: 'numeric' })}
               </strong>?
             </div>
             
             <div style={{ color: '#dc2626', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>
               Tindakan ini permanen dan tidak dapat dibatalkan.
             </div>
             
             <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
               <button 
                 onClick={() => setShowDeleteModal(false)}
                 style={{
                   background: '#f3f4f6', 
                   color: '#374151', 
                   border: '1px solid #d1d5db', 
                   padding: '8px 16px', 
                   borderRadius: '6px', 
                   cursor: 'pointer',
                   fontSize: '14px'
                 }}
               >
                 Batal
               </button>
               <button 
                 onClick={confirmDeleteByMonth}
                 style={{
                   background: '#dc2626', 
                   color: 'white', 
                   border: 'none', 
                   padding: '8px 16px', 
                   borderRadius: '6px', 
                   cursor: 'pointer',
                   fontSize: '14px'
                 }}
               >
                 Ya, Hapus Data
               </button>
             </div>
           </div>
         </div>
       )}

       {/* CUSTOM MODAL FOR RESET CONFIRMATION */}
       {showResetModal && (
         <div 
           onClick={() => setShowResetModal(false)} 
           style={{
             position: 'fixed', 
             top: 0, 
             left: 0, 
             right: 0, 
             bottom: 0, 
             backgroundColor: 'rgba(0,0,0,0.5)', 
             zIndex: 1001, 
             display: 'flex', 
             alignItems: 'center', 
             justifyContent: 'center'
           }}
         >
           <div 
             onClick={(e) => e.stopPropagation()} 
             style={{
               background: 'white', 
               borderRadius: '8px', 
               padding: '24px', 
               width: '90%', 
               maxWidth: '400px',
               boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
             }}
           >
             <div style={{ marginBottom: '20px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                 <span style={{ color: '#dc2626', fontSize: '24px' }}>⚠️</span>
                 <h3 style={{ margin: 0, color: '#1f2937', fontSize: '18px' }}>Konfirmasi Reset Data</h3>
               </div>
             </div>
             
             <div style={{ color: '#4b5563', lineHeight: '1.6', marginBottom: '24px' }}>
               PERINGATAN: Ini akan <strong>menghapus SEMUA data</strong> (jurnal, COA, aset,Inventaris,BBM, Piutang, Hutang, dll) dan mengembalikan ke pengaturan awal. Tindakan ini <strong>tidak dapat dibatalkan</strong>.
             </div>
             
             <div style={{ color: '#dc2626', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>
               Apakah Anda yakin ingin melanjutkan?
             </div>
             
             <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
               <button 
                 onClick={() => setShowResetModal(false)}
                 style={{
                   background: '#f3f4f6', 
                   color: '#374151', 
                   border: '1px solid #d1d5db', 
                   padding: '8px 16px', 
                   borderRadius: '6px', 
                   cursor: 'pointer',
                   fontSize: '14px'
                 }}
               >
                 Batal
               </button>
               <button 
                 onClick={confirmResetData}
                 style={{
                   background: '#dc2626', 
                   color: 'white', 
                   border: 'none', 
                   padding: '8px 16px', 
                   borderRadius: '6px', 
                   cursor: 'pointer',
                   fontSize: '14px'
                 }}
               >
                 Ya, Reset Semua Data
               </button>
             </div>
           </div>
         </div>
       )}
    </div>
  )
}
