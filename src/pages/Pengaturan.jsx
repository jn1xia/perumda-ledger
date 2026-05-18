import { useState, useEffect } from 'react'
import { Save, Building2, User, Shield, Database, Bell, FileText, Download, Upload, AlertTriangle, CheckCircle2, Plus, Pencil, Trash2, KeyRound, UserCog, LogOut } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { ROLE_META, ROLES_BY_DIVISI, getRoleLabel, getRoleDivisi } from '../data/roles.js'

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

  const handleRestoreData = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result)
          if (!data.journals && !data.coaTree) {
            alert('Format file tidak valid. Pastikan file adalah backup Perumda Ledger.')
            return
          }
          if (!confirm(`Restore backup dari ${file.name}? Data saat ini akan ditimpa.`)) return
          dispatch({ type: 'SET_STATE', payload: data })
          alert('✅ Data berhasil di-restore dari backup.')
          setSaved(true)
          setTimeout(() => setSaved(false), 3000)
        } catch (err) {
          alert('Gagal membaca file: ' + err.message)
        }
      }
      reader.readAsText(file)
    }
    input.click()
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
                  <h4 style={{margin:0, marginBottom:4}}>Restore dari Backup</h4>
                  <p style={{margin:0, fontSize:13, color:'var(--text-muted)'}}>Upload file JSON backup untuk mengembalikan data</p>
                </div>
                <button className="btn btn-outline" onClick={handleRestoreData}><Upload size={16} /> Restore</button>
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

      case 'pengguna':
        return <PenggunaSection />

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

// =============================================================================
// User Management Section (#2 — Manajemen User & Hak Akses)
// Sesuai SOP: SOP Dokumen Permintaan, SOP Pembayaran Barang & Jasa
// =============================================================================

function PenggunaSection() {
  const { state, dispatch } = useApp()
  const users    = state.users    || []
  const session  = state.session  // current logged-in session
  const divisiKeys = Object.keys(ROLES_BY_DIVISI)

  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState({ username: '', nama: '', role: 'staff_keuangan', aktif: 1 })
  const [search, setSearch]   = useState('')

  const filtered = search
    ? users.filter(u =>
        u.username.includes(search.toLowerCase()) ||
        (u.nama || '').toLowerCase().includes(search.toLowerCase()) ||
        getRoleLabel(u.role).toLowerCase().includes(search.toLowerCase())
      )
    : users

  function startNew() {
    setForm({ username: '', nama: '', role: 'staff_keuangan', aktif: 1 })
    setEditing('new')
  }
  function startEdit(u) {
    setForm({ username: u.username, nama: u.nama || '', role: u.role || 'staff_keuangan', aktif: u.aktif === 0 ? 0 : 1 })
    setEditing(u.username)
  }
  function cancel() { setEditing(null) }

  function saveUser() {
    const username = (form.username || '').trim().toLowerCase()
    if (!username) return alert('Username wajib diisi.')
    if (!/^[a-z0-9_.]+$/.test(username)) return alert('Username hanya huruf kecil, angka, titik, atau garis bawah.')
    if (editing === 'new' && users.some(u => u.username === username)) {
      return alert(`Username "${username}" sudah dipakai.`)
    }
    const payload = { username, nama: form.nama.trim(), role: form.role, aktif: Number(form.aktif) }
    if (editing === 'new') {
      dispatch({ type: 'ADD_USER', payload })
    } else {
      dispatch({ type: 'UPDATE_USER', payload })
    }
    setEditing(null)
  }

  function deleteUser(u) {
    if (session && u.username === session.username) {
      return alert('Anda sedang login sebagai user ini — tidak bisa dihapus.')
    }
    if (!confirm(`Hapus user "${u.username}" (${getRoleLabel(u.role)})?`)) return
    dispatch({ type: 'DELETE_USER', payload: u.username })
  }

  return (
    <>
      <div className="card-header">
        <div className="card-title">Manajemen Pengguna & Hak Akses</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sesuai Struktur Organisasi Perumda Pasar Banjarmasin</div>
      </div>

      {/* Session aktif */}
      {session && (
        <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <KeyRound size={16} color="#10B981" />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{session.username}</span>
            <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>·</span>
            <span style={{ fontSize: 12, color: 'var(--primary)' }}>{session.roleLabel}</span>
            <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>·</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{getRoleDivisi(session.role)}</span>
          </div>
          <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={() => { if (confirm('Keluar dari sistem?')) dispatch({ type: 'LOGOUT' }) }}>
            <LogOut size={13} /> Keluar
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <input
          className="form-input"
          placeholder="Cari username, nama, atau jabatan..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>{users.length} pengguna terdaftar</span>
          {editing !== 'new' && (
            <button className="btn btn-primary btn-sm" onClick={startNew}><Plus size={14} /> Tambah User</button>
          )}
        </div>
      </div>

      {/* Inline add/edit form */}
      {editing && (
        <div style={{ padding: 14, border: '1px solid var(--primary)', borderRadius: 8, marginBottom: 12, background: 'rgba(59,130,246,0.04)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--primary)' }}>
            {editing === 'new' ? 'Tambah Pengguna Baru' : `Edit: ${editing}`}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Username *</label>
              <input
                className="form-input"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                placeholder="contoh: sari.keuangan"
                disabled={editing !== 'new'}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Nama Lengkap</label>
              <input className="form-input" value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} placeholder="Nama lengkap" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Jabatan / Role * <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(sesuai struktur org)</span></label>
              <select className="form-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {divisiKeys.map(div => (
                  <optgroup key={div} label={div}>
                    {ROLES_BY_DIVISI[div].map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {form.role && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {ROLE_META.find(r => r.value === form.role)?.desc}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.aktif} onChange={e => setForm({ ...form, aktif: Number(e.target.value) })}>
                <option value={1}>Aktif</option>
                <option value={0}>Nonaktif</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button className="btn btn-outline btn-sm" onClick={cancel}>Batal</button>
            <button className="btn btn-primary btn-sm" onClick={saveUser}>
              <Save size={14} /> {editing === 'new' ? 'Tambah User' : 'Simpan Perubahan'}
            </button>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
        <table style={{ fontSize: 13, width: '100%' }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Username</th>
              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Nama</th>
              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Jabatan</th>
              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Divisi</th>
              <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
              <th style={{ padding: '8px 12px', textAlign: 'center' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                {users.length === 0 ? 'Belum ada user. Klik "+ Tambah User" untuk memulai.' : 'Tidak ada user yang cocok.'}
              </td></tr>
            )}
            {filtered.map(u => {
              const isMe = session && u.username === session.username
              return (
                <tr key={u.username} style={{ borderTop: '1px solid var(--border-light)', background: isMe ? 'rgba(59,130,246,0.04)' : undefined }}>
                  <td className="mono" style={{ padding: '8px 12px', fontWeight: 600 }}>
                    {u.username}
                    {isMe && <span className="badge blue" style={{ marginLeft: 6, fontSize: 10 }}>saya</span>}
                  </td>
                  <td style={{ padding: '8px 12px' }}>{u.nama || <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span className="badge" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', fontSize: 11 }}>
                      {getRoleLabel(u.role)}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>{getRoleDivisi(u.role)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    {u.aktif === 0 ? <span className="badge red">Nonaktif</span> : <span className="badge green">Aktif</span>}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn btn-icon btn-sm btn-outline" title="Edit user" onClick={() => startEdit(u)}><Pencil size={13} /></button>
                      <button className="btn btn-icon btn-sm btn-outline" style={{ color: 'var(--danger)' }} title="Hapus user" onClick={() => deleteUser(u)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* SOP Approval info */}
      <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
        <strong style={{ color: 'var(--warning)' }}>Hierarki Persetujuan (SOP Pembayaran Barang & Jasa):</strong>
        <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
          <li>Pengeluaran <strong>&lt; Rp 1.000.000</strong> → Cukup <em>Manajer Departemen</em></li>
          <li>Pengeluaran <strong>&gt; Rp 1.000.000</strong> → Perlu <em>Direktur Umum & Keuangan</em></li>
          <li>Pengeluaran <strong>&gt; Rp 50.000.000</strong> → Perlu <em>Direktur Utama</em></li>
          <li>Batas waktu masuk berkas: <strong>pukul 15.00 WIB</strong> · Eksekusi bayar: <strong>15.30 WIB</strong></li>
        </ul>
        <strong style={{ color: 'var(--warning)', display: 'block', marginTop: 8 }}>SOP Laporan Keuangan — Closing Cycle:</strong>
        <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
          <li>Tgl 1: Rekonsiliasi → <em>Staff Keuangan & Perpajakan</em></li>
          <li>Tgl 2: Closing Jurnal → <em>SPV Akuntansi & Pelaporan</em></li>
          <li>Tgl 2-3: Penyusunan Draft → <em>Manager Keuangan</em></li>
          <li>Tgl 4: Review & Verifikasi → <em>Direktur Umum & Keuangan</em></li>
          <li>Tgl 5: Penyajian kepada Direksi</li>
        </ul>
      </div>
    </>
  )
}
