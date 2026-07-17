import { useState, useEffect } from 'react'
import { Save, Building2, User, Shield, Database, Bell, FileText, Download, Upload, AlertTriangle, CheckCircle2, Plus, Pencil, Trash2, KeyRound, UserCog, LogOut, BookOpen, Bot, Sparkles, MessageCircle, FileSpreadsheet, Cpu, Eye, EyeOff, Zap, CheckCircle } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { apiResetMonth, apiLoadAudited, apiSaveReportSnapshot, apiResetUserPassword } from '../services/api.js'
import * as XLSX from 'xlsx'
import { extractSnapshot, periodMonthLabel } from '../utils/reportSnapshot.js'
import { ROLE_META, ROLES_BY_DIVISI, getRoleLabel, getRoleDivisi } from '../data/roles.js'

export default function Pengaturan() {
  const { state, dispatch } = useApp()
  const [activeSection, setActiveSection] = useState('perusahaan')
  const [form, setForm] = useState({ ...state.pengaturan })
  const [saved, setSaved] = useState(false)
   const [deleteMonth, setDeleteMonth] = useState('')
   const [showDeleteModal, setShowDeleteModal] = useState(false)
   const [showResetModal, setShowResetModal] = useState(false)
   const [resetMonth, setResetMonth] = useState('')
   const [showResetMonthModal, setShowResetMonthModal] = useState(false)
   const [resetMonthBusy, setResetMonthBusy] = useState(false)
   const [auditedMonth, setAuditedMonth] = useState('')
   const [auditedBusy, setAuditedBusy] = useState(false)
   const [uploadMonth, setUploadMonth] = useState('')
   const [uploadBusy, setUploadBusy] = useState(false)

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
    { id: 'panduan', label: 'Panduan Pengguna', icon: BookOpen },
    { id: 'ai-integrasi', label: 'AI & Integrasi', icon: Cpu },
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

  const handleResetMonth = () => {
    if (!resetMonth) {
      alert('Silakan pilih bulan terlebih dahulu.')
      return
    }
    setShowResetMonthModal(true)
  }

  const confirmResetMonth = async () => {
    setResetMonthBusy(true)
    try {
      const result = await apiResetMonth(resetMonth)
      setShowResetMonthModal(false)
      const labelBulan = new Date(resetMonth.split('-')[0], parseInt(resetMonth.split('-')[1]) - 1, 1)
        .toLocaleString('id-ID', { month: 'long', year: 'numeric' })
      alert(`✅ Data bulan ${labelBulan} berhasil direset (${result.total || 0} baris dihapus). Halaman akan dimuat ulang.`)
      // Reload so all modules reflect the server state.
      window.location.reload()
    } catch (err) {
      alert('Gagal mereset data bulanan: ' + err.message)
    } finally {
      setResetMonthBusy(false)
    }
  }

  const handleLoadAudited = async () => {
    if (!auditedMonth) { alert('Silakan pilih bulan terlebih dahulu.'); return }
    const labelBulan = new Date(auditedMonth.split('-')[0], parseInt(auditedMonth.split('-')[1]) - 1, 1)
      .toLocaleString('id-ID', { month: 'long', year: 'numeric' })
    if (!confirm(`Muat snapshot laporan audited (Neraca, Arus Kas, Laba Rugi) untuk ${labelBulan} dari lampiran resmi?\n\nLaporan periode ini akan menampilkan angka persis seperti Excel, dan jurnal bulan ini dijadikan baseline agar tidak terhitung ganda.`)) return
    setAuditedBusy(true)
    try {
      const result = await apiLoadAudited(auditedMonth)
      const l = result.loaded || {}
      alert(`✅ Snapshot ${labelBulan} dimuat: Neraca ${l.neraca || 0} baris, Arus Kas ${l.arus_kas || 0} baris, Laba Rugi ${l.laba_rugi || 0} baris. Halaman akan dimuat ulang.`)
      window.location.reload()
    } catch (err) {
      alert('Gagal memuat snapshot audited: ' + err.message)
    } finally {
      setAuditedBusy(false)
    }
  }

  const handleUploadLampiran = () => {
    if (!uploadMonth) { alert('Pilih bulan periode laporan terlebih dahulu.'); return }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,.xls'
    input.onchange = async (e) => {
      const file = e.target.files && e.target.files[0]
      if (!file) return
      setUploadBusy(true)
      try {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array', cellDates: false })
        const snap = extractSnapshot(wb, uploadMonth)
        if (snap.neraca.length === 0 && snap.arusKas.length === 0 && snap.labaRugi.length === 0 && Object.keys(snap.lra || {}).length === 0 && (snap.journals?.length || 0) === 0) {
          alert(`Tidak menemukan sheet laporan untuk ${periodMonthLabel(uploadMonth)} di file ini.\n\n` +
            `Pastikan file lampiran memuat sheet seperti "NERACA ${periodMonthLabel(uploadMonth).split(' ')[0].toUpperCase()} ${uploadMonth.split('-')[0]}".`)
          return
        }
        const result = await apiSaveReportSnapshot({
          period: uploadMonth, neraca: snap.neraca, arusKas: snap.arusKas, labaRugi: snap.labaRugi, lra: snap.lra,
          journals: snap.journals,
        })
        const l = result.loaded || {}
        const lraCounts = l.lra ? Object.entries(l.lra).map(([k, v]) => `${k}:${v}`).join(', ') : '-'
        const warn = snap.warnings.length ? `\n\nCatatan: ${snap.warnings.join('; ')}` : ''
        alert(`✅ Snapshot ${periodMonthLabel(uploadMonth)} dimuat dari lampiran:\nNeraca ${l.neraca || 0}, Arus Kas ${l.arus_kas || 0}, Laba Rugi ${l.laba_rugi || 0} baris.\nLRA: ${lraCounts}.\nJurnal: ${l.journals || 0} transaksi diimpor (status PENDING — perlu di-Approve di menu Jurnal).${warn}\n\nHalaman akan dimuat ulang.`)
        window.location.reload()
      } catch (err) {
        alert('Gagal memproses lampiran: ' + err.message)
      } finally {
        setUploadBusy(false)
      }
    }
    input.click()
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
              <div style={{padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <h4 style={{margin:0, marginBottom:4, color:'var(--danger)'}}>Reset Data Bulanan (Lengkap)</h4>
                  <p style={{margin:0, fontSize:13, color:'var(--text-muted)'}}>Menghapus SEMUA data bulan tertentu di seluruh modul: jurnal &amp; buku besar, piutang, hutang, giro, BBM, rekonsiliasi, PO/SO, e-faktur, persediaan (transfer/opname), serta snapshot laporan (Neraca, Arus Kas, Laba Rugi). Tidak dapat dibatalkan!</p>
                </div>
                <div style={{display:'flex', gap: 8, alignItems:'center'}}>
                  <input type="month" className="form-input" value={resetMonth} onChange={e => setResetMonth(e.target.value)} />
                  <button className="btn btn-outline" style={{color:'var(--danger)', borderColor:'var(--danger)'}} onClick={handleResetMonth}><AlertTriangle size={16} /> Reset Bulan</button>
                </div>
              </div>
              <div style={{padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <h4 style={{margin:0, marginBottom:4, color:'var(--primary)'}}>Muat Snapshot Laporan Audited</h4>
                  <p style={{margin:0, fontSize:13, color:'var(--text-muted)'}}>Memuat Neraca, Arus Kas &amp; Laba Rugi resmi dari lampiran untuk bulan tertentu, sehingga laporan tampil <strong>persis seperti Excel</strong>. Jurnal bulan itu otomatis dijadikan baseline agar tidak terhitung ganda. Jalankan ini setelah reset &amp; upload ulang jurnal.</p>
                </div>
                <div style={{display:'flex', gap: 8, alignItems:'center'}}>
                  <input type="month" className="form-input" value={auditedMonth} onChange={e => setAuditedMonth(e.target.value)} />
                  <button className="btn btn-primary" onClick={handleLoadAudited} disabled={auditedBusy}><CheckCircle size={16} /> {auditedBusy ? 'Memuat…' : 'Muat Snapshot'}</button>
                </div>
              </div>
              <div style={{padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <h4 style={{margin:0, marginBottom:4, color:'var(--primary)'}}>Upload Lampiran → Snapshot Laporan</h4>
                  <p style={{margin:0, fontSize:13, color:'var(--text-muted)'}}>Untuk bulan baru: pilih periode lalu unggah file <strong>LAMPIRAN</strong> Excel. Sistem membaca sheet NERACA / ARUS KAS / LABA RUGI / Penerimaan sebagai snapshot audited, <strong>dan mengimpor data jurnal</strong> dari sheet JURNAL bulan tersebut sebagai baseline. Laporan (Neraca, Arus Kas, LRA) langsung tampil persis seperti Excel dan Buku Besar terisi otomatis — <strong>tanpa perlu deploy ulang</strong>. Jurnal baru yang Anda input setelahnya otomatis menambah (delta) ke semua laporan.</p>
                </div>
                <div style={{display:'flex', gap: 8, alignItems:'center'}}>
                  <input type="month" className="form-input" value={uploadMonth} onChange={e => setUploadMonth(e.target.value)} />
                  <button className="btn btn-primary" onClick={handleUploadLampiran} disabled={uploadBusy}><Upload size={16} /> {uploadBusy ? 'Memproses…' : 'Upload Lampiran'}</button>
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

      case 'panduan':
        return <PanduanSection />

      case 'ai-integrasi':
        return <AiIntegrasiSection form={form} setForm={setForm} />

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
          {['perusahaan', 'pajak', 'voucher', 'ai-integrasi'].includes(activeSection) && (
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

       {/* CUSTOM MODAL FOR MONTHLY RESET CONFIRMATION */}
       {showResetMonthModal && (
         <div
           onClick={() => !resetMonthBusy && setShowResetMonthModal(false)}
           style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         >
           <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: '8px', padding: '24px', width: '90%', maxWidth: '440px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
               <span style={{ color: '#dc2626', fontSize: '24px' }}>⚠️</span>
               <h3 style={{ margin: 0, color: '#1f2937', fontSize: '18px' }}>Reset Data Bulanan</h3>
             </div>
             <div style={{ color: '#4b5563', lineHeight: '1.6', marginBottom: '16px' }}>
               Anda akan menghapus <strong>SEMUA data</strong> di seluruh modul untuk bulan{' '}
               <strong style={{ color: '#1f2937' }}>
                 {resetMonth && new Date(resetMonth.split('-')[0], parseInt(resetMonth.split('-')[1]) - 1, 1).toLocaleString('id-ID', { month: 'long', year: 'numeric' })}
               </strong>{' '}
               (jurnal, buku besar, piutang, hutang, giro, BBM, rekonsiliasi, PO/SO, e-faktur, persediaan, serta laporan Neraca/Arus Kas/Laba Rugi).
             </div>
             <div style={{ color: '#dc2626', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>
               Tindakan ini permanen dan tidak dapat dibatalkan.
             </div>
             <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
               <button onClick={() => setShowResetMonthModal(false)} disabled={resetMonthBusy}
                 style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '8px 16px', borderRadius: '6px', cursor: resetMonthBusy ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
                 Batal
               </button>
               <button onClick={confirmResetMonth} disabled={resetMonthBusy}
                 style={{ background: '#dc2626', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: resetMonthBusy ? 'not-allowed' : 'pointer', fontSize: '14px', opacity: resetMonthBusy ? 0.7 : 1 }}>
                 {resetMonthBusy ? 'Mereset…' : 'Ya, Reset Bulan Ini'}
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
// AI & Integrasi Section
// =============================================================================
function AiIntegrasiSection({ form, setForm }) {
  const [showKey, setShowKey]       = useState(false)
  const [testing, setTesting]       = useState(false)
  const [testResult, setTestResult] = useState(null)

  const PROVIDERS_INFO = {
    gemini: {
      label: 'Google Gemini', icon: '✨', color: '#4285f4',
      keyLink: 'https://aistudio.google.com/app/apikey',
      keyDesc: 'Gratis di Google AI Studio — cukup login Google',
      placeholder: 'AIzaSy...',
      models: [
        { value: 'gemini-2.0-flash',    label: 'Gemini 2.0 Flash',  free: true,  desc: 'Cepat & gratis' },
        { value: 'gemini-1.5-flash',    label: 'Gemini 1.5 Flash',  free: true,  desc: 'Andalan chat' },
        { value: 'gemini-1.5-flash-8b', label: 'Flash-8B',          free: true,  desc: 'Ringan & cepat' },
        { value: 'gemini-1.5-pro',      label: 'Gemini 1.5 Pro',    free: false, desc: 'Butuh billing' },
      ]
    },
    groq: {
      label: 'Groq', icon: '⚡', color: '#f55036',
      keyLink: 'https://console.groq.com/keys',
      keyDesc: '14.400 req/hari GRATIS — Llama & Mixtral, super cepat',
      placeholder: 'gsk_...',
      models: [
        { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B',  free: true, desc: 'Terbaik & gratis' },
        { value: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B',   free: true, desc: 'Super cepat' },
        { value: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B',   free: true, desc: 'Context panjang' },
        { value: 'gemma2-9b-it',            label: 'Gemma 2 9B',     free: true, desc: 'Google open-source' },
        { value: 'llama3-70b-8192',         label: 'Llama 3 70B',    free: true, desc: 'Sangat akurat' },
      ]
    },
    openrouter: {
      label: 'OpenRouter', icon: '🔀', color: '#7c3aed',
      keyLink: 'https://openrouter.ai/keys',
      keyDesc: 'Model gratis tersedia — satu key akses banyak AI',
      placeholder: 'sk-or-v1-...',
      models: [
        { value: 'meta-llama/llama-3.1-8b-instruct:free',   label: 'Llama 3.1 8B',  free: true, desc: 'Meta AI' },
        { value: 'meta-llama/llama-3.3-70b-instruct:free',  label: 'Llama 3.3 70B', free: true, desc: 'Terkuat gratis' },
        { value: 'google/gemma-2-9b-it:free',               label: 'Gemma 2 9B',    free: true, desc: 'Google open' },
        { value: 'mistralai/mistral-7b-instruct:free',      label: 'Mistral 7B',    free: true, desc: 'Eropa AI' },
        { value: 'microsoft/phi-3-mini-128k-instruct:free', label: 'Phi-3 Mini',    free: true, desc: 'Microsoft' },
        { value: 'qwen/qwen-2-7b-instruct:free',            label: 'Qwen 2 7B',     free: true, desc: 'Alibaba AI' },
      ]
    }
  }

  const provider      = form.aiProvider || 'gemini'
  const pInfo         = PROVIDERS_INFO[provider]
  const apiKeyField   = provider === 'gemini' ? 'geminiApiKey' : `${provider}ApiKey`
  const modelField    = provider === 'gemini' ? 'geminiModel'  : `${provider}Model`
  const currentKey    = form[apiKeyField] || ''
  const currentModel  = form[modelField]  || pInfo.models[0].value

  const handleTest = async () => {
    if (!currentKey) return setTestResult({ ok: false, msg: 'API Key belum diisi.' })
    setTesting(true); setTestResult(null)
    try {
      let data
      if (provider === 'gemini') {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${currentKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] }) })
        data = await res.json()
        if (data.error) throw new Error(data.error.message)
      } else {
        const url = provider === 'groq'
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : 'https://openrouter.ai/api/v1/chat/completions'
        const res = await fetch(url, { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentKey}` },
          body: JSON.stringify({ model: currentModel, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 }) })
        data = await res.json()
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
      }
      setTestResult({ ok: true, msg: `✅ Berhasil! ${pInfo.label} — ${currentModel}` })
    } catch (e) {
      setTestResult({ ok: false, msg: `❌ Gagal: ${e.message}` })
    } finally { setTesting(false) }
  }

  return (
    <>
      <div className="card-header">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Cpu size={18} color="var(--primary)" /> AI & Integrasi
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pilih provider AI & konfigurasi API Key</div>
      </div>

      {/* Provider Tabs */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label">Provider AI</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(PROVIDERS_INFO).map(([key, p]) => (
            <button key={key}
              onClick={() => { setForm({ ...form, aiProvider: key }); setTestResult(null) }}
              style={{ padding: '8px 16px', borderRadius: 8,
                border: `2px solid ${provider === key ? p.color : 'var(--border)'}`,
                background: provider === key ? `${p.color}18` : 'var(--bg-secondary)',
                color: provider === key ? p.color : 'var(--text-secondary)',
                cursor: 'pointer', fontWeight: provider === key ? 700 : 400, fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
              <span>{p.icon}</span> {p.label}
              {key === 'groq' && <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '1px 6px', borderRadius: 3 }}>Best Free</span>}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{pInfo.keyDesc}</div>
      </div>

      {/* API Key */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <KeyRound size={14} /> {pInfo.label} API Key
          <a href={pInfo.keyLink} target="_blank" rel="noreferrer"
            style={{ fontSize: 11, color: 'var(--primary)', marginLeft: 8 }}>Dapatkan gratis ↗</a>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input className="form-input" type={showKey ? 'text' : 'password'}
              placeholder={pInfo.placeholder} value={currentKey}
              onChange={e => setForm({ ...form, [apiKeyField]: e.target.value })}
              style={{ paddingRight: 40 }} />
            <button onClick={() => setShowKey(!showKey)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <button className="btn btn-outline" onClick={handleTest} disabled={testing}
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            {testing ? <>⟳ Testing...</> : <><Zap size={14} /> Test</>}
          </button>
        </div>
        {testResult && (
          <div style={{ marginTop: 8, fontSize: 13, color: testResult.ok ? 'var(--success)' : 'var(--danger)' }}>
            {testResult.msg}
          </div>
        )}
      </div>

      {/* Model selector */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label"><Cpu size={14} /> Model</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pInfo.models.map(m => (
            <label key={m.value} style={{ display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s',
              border: `1px solid ${currentModel === m.value ? pInfo.color : 'var(--border)'}`,
              background: currentModel === m.value ? `${pInfo.color}10` : 'var(--bg-secondary)' }}>
              <input type="radio" name={`${provider}Model`} value={m.value}
                checked={currentModel === m.value}
                onChange={() => setForm({ ...form, [modelField]: m.value })} />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{m.label}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>{m.desc}</span>
              </div>
              {m.free && <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '2px 6px', borderRadius: 3 }}>GRATIS</span>}
            </label>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 2 }}>
        <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: 4 }}>💡 Cara pakai tiap provider:</strong>
        <b>Gemini</b>: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>aistudio.google.com</a> → Login → Create API Key<br />
        <b>Groq</b>: <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>console.groq.com</a> → Daftar → Create API Key (paling stabil)<br />
        <b>OpenRouter</b>: <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>openrouter.ai</a> → Sign Up → Create Key → pilih model :free
      </div>
    </>
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
  const [form, setForm]       = useState({ username: '', nama: '', role: 'staff_keuangan', aktif: 1, password: '' })
  const [search, setSearch]   = useState('')

  const filtered = search
    ? users.filter(u =>
        u.username.includes(search.toLowerCase()) ||
        (u.nama || '').toLowerCase().includes(search.toLowerCase()) ||
        getRoleLabel(u.role).toLowerCase().includes(search.toLowerCase())
      )
    : users

  function startNew() {
    setForm({ username: '', nama: '', role: 'staff_keuangan', aktif: 1, password: '' })
    setEditing('new')
  }
  function startEdit(u) {
    setForm({ username: u.username, nama: u.nama || '', role: u.role || 'staff_keuangan', aktif: u.aktif === 0 ? 0 : 1, password: '' })
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
    if (editing === 'new' && form.password && form.password.length < 8) {
      return alert('Password awal minimal 8 karakter (atau kosongkan untuk memakai password default).')
    }
    if (editing === 'new') {
      // Include the initial password so the account can log in (server hashes it;
      // empty → server uses the default password, forced change on first login).
      const payload = { username, nama: form.nama.trim(), role: form.role, aktif: Number(form.aktif) }
      if (form.password) payload.password = form.password
      dispatch({ type: 'ADD_USER', payload })
    } else {
      dispatch({ type: 'UPDATE_USER', payload: { username, nama: form.nama.trim(), role: form.role, aktif: Number(form.aktif) } })
    }
    setEditing(null)
  }

  async function resetPassword(u) {
    const np = prompt(`Reset password untuk "${u.username}" — masukkan password baru (min. 8 karakter):`)
    if (np == null) return
    if (np.length < 8) return alert('Password minimal 8 karakter.')
    try {
      await apiResetUserPassword(u.username, np)
      alert(`Password "${u.username}" berhasil direset. User wajib menggantinya saat login berikutnya.`)
    } catch (e) {
      alert('Gagal reset password: ' + (e.message || 'error'))
    }
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
          {editing === 'new' && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Password Awal <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(min. 8 karakter, opsional)</span></label>
                <input
                  className="form-input"
                  type="text"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Kosongkan untuk password default (wajib diganti saat login pertama)"
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}
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
                      <button className="btn btn-icon btn-sm btn-outline" title="Reset password" onClick={() => resetPassword(u)}><KeyRound size={13} /></button>
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

// =============================================================================
// Panduan Pengguna (User Manual)
// =============================================================================
function PanduanSection() {
  const [openSection, setOpenSection] = useState('ai-assistant')

  const toggle = (id) => setOpenSection(openSection === id ? null : id)

  const SectionCard = ({ id, icon, title, badge, children }) => (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
      <button
        onClick={() => toggle(id)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
          background: openSection === id ? 'rgba(99,102,241,0.08)' : 'var(--bg-secondary)',
          border: 'none', cursor: 'pointer', color: 'inherit', textAlign: 'left',
          borderBottom: openSection === id ? '1px solid var(--border)' : 'none',
          transition: 'background 0.2s'
        }}
      >
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{title}</span>
        {badge && <span className="badge blue" style={{ fontSize: 10 }}>{badge}</span>}
        <span style={{ fontSize: 18, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: openSection === id ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {openSection === id && (
        <div style={{ padding: '16px 18px', fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
          {children}
        </div>
      )}
    </div>
  )

  const Step = ({ num, children }) => (
    <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
      <span style={{ width: 24, height: 24, minWidth: 24, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{num}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )

  const Tip = ({ children }) => (
    <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, marginTop: 8, marginBottom: 8, fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 16 }}>💡</span>
      <div>{children}</div>
    </div>
  )

  const Warning = ({ children }) => (
    <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, marginTop: 8, marginBottom: 8, fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 16 }}>⚠️</span>
      <div>{children}</div>
    </div>
  )

  return (
    <>
      <div className="card-header" style={{ marginBottom: 8 }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BookOpen size={20} color="var(--primary)" /> Panduan Pengguna
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sistem Informasi Akuntansi — Perumda Pasar Baiman Banjarmasin</div>
      </div>

      {/* Version info */}
      <div style={{ padding: '10px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, marginBottom: 16, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><strong>Versi:</strong> 2.0 — Mei 2026</span>
        <span style={{ color: 'var(--text-muted)' }}>Terakhir diperbarui: 20 Mei 2026</span>
      </div>

      {/* ── AI ASSISTANT ── */}
      <SectionCard id="ai-assistant" icon="🤖" title="AI Assistant" badge="BARU">
        <div style={{ marginBottom: 12 }}>
          <strong style={{ color: 'var(--primary)', fontSize: 14 }}>Asisten AI Cerdas untuk Import & Analisis Data</strong>
          <p style={{ marginTop: 6 }}>AI Assistant adalah fitur chatbot pintar yang membantu Anda mengupload, mengekstrak, dan mengimpor data dari file Excel ke semua modul sistem secara otomatis.</p>
        </div>

        <div style={{ fontWeight: 600, marginBottom: 8, color: 'white' }}>📍 Cara Mengakses</div>
        <p>Klik tombol <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontSize: 12 }}>✨ 💬</span> di <strong>pojok kanan bawah</strong> layar. Tombol ini selalu tersedia di semua halaman.</p>

        <div style={{ fontWeight: 600, marginBottom: 8, marginTop: 16, color: 'white' }}>📂 Upload & Import Excel</div>
        <Step num="1">Buka AI Assistant dengan klik tombol di pojok kanan bawah</Step>
        <Step num="2"><strong>Drag & Drop</strong> file Excel (.xlsx / .xls) langsung ke area chat, atau klik tombol <strong>📎 Upload</strong> di kiri bawah</Step>
        <Step num="3">Sistem otomatis membaca semua sheet dan mendeteksi tipe data</Step>
        <Step num="4">Lihat <strong>preview data</strong> yang terdeteksi — jumlah item per modul ditampilkan</Step>
        <Step num="5">Klik <strong>"Import Semua"</strong> untuk import sekaligus, atau klik chip modul tertentu untuk import satu per satu</Step>

        <Tip>
          <strong>Nama sheet yang dikenali otomatis:</strong><br/>
          <code style={{ fontSize: 11 }}>COA, Jurnal, Piutang, Hutang, Persediaan/Inventory/Stok, Aset/Aktiva, Penerimaan, Beban Umum, Beban Operasional, Investasi, Saldo/Rekap Akun</code>
        </Tip>

        <div style={{ fontWeight: 600, marginBottom: 8, marginTop: 16, color: 'white' }}>💬 Perintah Chat yang Tersedia</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Perintah</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Fungsi</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['ringkasan', 'Tampilkan ringkasan seluruh data sistem'],
              ['jurnal', 'Info jurnal tersimpan per bulan'],
              ['laba rugi', 'Ringkasan Laba Rugi (P&L)'],
              ['piutang', 'Saldo Piutang (AR)'],
              ['hutang', 'Saldo Hutang (AP)'],
              ['aset', 'Daftar Aset Tetap & Nilai Buku'],
              ['help / bantuan', 'Daftar lengkap perintah'],
            ].map(([cmd, desc], i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '6px 8px' }}><code style={{ background: 'rgba(99,102,241,0.15)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{cmd}</code></td>
                <td style={{ padding: '6px 8px' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontWeight: 600, marginBottom: 8, marginTop: 16, color: 'white' }}>🎯 Modul yang Didukung Import</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {[
            ['📊', 'Chart of Accounts (COA)', 'Sheet "COA"'],
            ['💰', 'Saldo Awal', 'Sheet "Rekap Akun"'],
            ['📋', 'Anggaran (RKA)', 'Sheet Penerimaan/Beban'],
            ['🏗️', 'Aset Tetap', 'Sheet "Aktiva Tetap"'],
            ['📝', 'Jurnal Transaksi', 'Sheet "Jurnal [bulan]"'],
            ['💳', 'Piutang (AR)', 'Sheet "Piutang"'],
            ['💸', 'Hutang (AP)', 'Sheet "Hutang"'],
            ['📦', 'Persediaan', 'Sheet "Persediaan/Stok"'],
          ].map(([icon, label, hint], i) => (
            <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 12 }}>
              <span style={{ marginRight: 6 }}>{icon}</span>
              <strong>{label}</strong>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>
            </div>
          ))}
        </div>

        <Warning>
          Data yang diimport akan <strong>ditambahkan</strong> ke data yang sudah ada (tidak menimpa). Jika perlu mengulang, hapus data lama terlebih dahulu di menu <strong>Pengaturan → Data & Backup</strong>.
        </Warning>
      </SectionCard>

      {/* ── JURNAL ── */}
      <SectionCard id="jurnal" icon="📝" title="Jurnal Umum">
        <p>Modul utama untuk mencatat semua transaksi akuntansi dengan prinsip double-entry (Debit = Kredit).</p>

        <div style={{ fontWeight: 600, marginBottom: 8, color: 'white' }}>Fitur Utama</div>
        <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
          <li><strong>Filter per Bulan</strong> — Pilih dropdown bulan di toolbar untuk melihat jurnal periode tertentu</li>
          <li><strong>Kolom Bulan</strong> — Badge berwarna menunjukkan bulan setiap entri (Januari=ungu, Februari=pink, dst.)</li>
          <li><strong>Filter Status</strong> — Tampilkan hanya jurnal Posted atau Pending</li>
          <li><strong>Kunci Periode</strong> — Kunci bulan tertentu agar tidak bisa diubah/dihapus</li>
          <li><strong>Cek Selisih</strong> — Validasi apakah total Debit = Kredit</li>
          <li><strong>Approval SOP</strong> — Sesuai SOP Pembayaran Barang & Jasa</li>
        </ul>

        <div style={{ fontWeight: 600, marginBottom: 8, color: 'white' }}>Cara Membuat Jurnal</div>
        <Step num="1">Klik tombol <strong>"+ Buat Jurnal"</strong></Step>
        <Step num="2">Isi tanggal, keterangan, akun debit, akun kredit, dan jumlah</Step>
        <Step num="3">Klik <strong>"Simpan"</strong> — jurnal berstatus Pending</Step>
        <Step num="4">Klik tombol <strong>✓ (Approve)</strong> untuk posting jurnal</Step>

        <Tip>Gunakan fitur <strong>AI Assistant</strong> untuk import jurnal dari Excel secara massal.</Tip>
      </SectionCard>

      {/* ── LAPORAN ── */}
      <SectionCard id="laporan" icon="📈" title="Laporan Keuangan">
        <p>Seluruh laporan dihitung otomatis dari data jurnal yang sudah di-posting (status "Posted").</p>

        <div style={{ fontWeight: 600, marginBottom: 8, color: 'white' }}>Jenis Laporan</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {[
              ['Neraca Saldo', 'Trial Balance — per tanggal, per tipe, MTD/YTD, detail, triwulan'],
              ['Neraca', 'Balance Sheet — posisi keuangan (Aset, Kewajiban, Ekuitas)'],
              ['Laba Rugi', 'P&L — Pendapatan, BPP, Beban, Laba Bersih, EBITDA'],
              ['HPP', 'Harga Pokok Penjualan — detail, triwulan, vs budget'],
              ['Arus Kas', 'Cash Flow — metode langsung'],
              ['Perubahan Ekuitas', 'Perubahan modal dan laba ditahan'],
              ['Lacak Kilat', 'Quick search transaksi'],
              ['Laporan Sortir', 'Sortir data jurnal sesuai kebutuhan'],
            ].map(([name, desc], i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{name}</td>
                <td style={{ padding: '6px 8px' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Tip>Semua laporan bisa dicetak (<strong>Cetak Laporan</strong>) atau diunduh sebagai Excel (<strong>Unduh Excel</strong>).</Tip>
      </SectionCard>

      {/* ── IMPORT DATA ── */}
      <SectionCard id="import" icon="📥" title="Import Data">
        <p>Dua mode import tersedia:</p>

        <div style={{ fontWeight: 600, marginBottom: 8, color: 'white' }}>1. Format Template Standar</div>
        <p>Unduh template Excel, isi data jurnal, lalu upload. Kolom wajib: Tanggal, Akun Debit, Akun Kredit, Debit, Kredit.</p>

        <div style={{ fontWeight: 600, marginBottom: 8, marginTop: 12, color: 'white' }}>2. Full Import (Lampiran Laporan Keuangan)</div>
        <p>Upload file Excel Lampiran Laporan Keuangan. Sistem otomatis mendeteksi dan mengimport: COA, Saldo Awal, Anggaran, Aset Tetap, dan Jurnal sekaligus.</p>

        <Tip>Untuk import yang lebih fleksibel dan interaktif, gunakan <strong>AI Assistant</strong> (tombol 💬 di pojok kanan bawah). AI bisa mendeteksi lebih banyak tipe data termasuk Piutang, Hutang, dan Persediaan.</Tip>
      </SectionCard>

      {/* ── COA ── */}
      <SectionCard id="coa" icon="📊" title="Chart of Accounts (COA)">
        <p>Daftar kode akun resmi sesuai standar akuntansi Perumda Pasar Banjarmasin.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
          <tbody>
            {[
              ['1xxxx', 'Aset', 'Kas, Bank, Piutang, Persediaan, Aset Tetap'],
              ['2xxxx', 'Kewajiban', 'Hutang, Pendapatan Diterima Dimuka'],
              ['3xxxx', 'Ekuitas', 'Modal, Laba Ditahan'],
              ['4xxxx', 'Pendapatan', 'Pendapatan Usaha & Pengembangan Bisnis'],
              ['5xxxx', 'HPP', 'Beban Pokok Penjualan'],
              ['6xxxx', 'Beban', 'Beban Umum & Administrasi, Operasional'],
              ['7xxxx', 'Pendapatan Lain', 'Bunga Bank, Pendapatan Non-operasional'],
              ['8xxxx', 'Beban Lain', 'Pajak Bank, Admin Bank, Beban Non-ops'],
            ].map(([code, cat, desc], i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="mono" style={{ padding: '4px 8px', fontWeight: 600, fontSize: 11 }}>{code}</td>
                <td style={{ padding: '4px 8px', fontWeight: 500 }}>{cat}</td>
                <td style={{ padding: '4px 8px' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      {/* ── PIUTANG & HUTANG ── */}
      <SectionCard id="piutang-hutang" icon="💳" title="Piutang & Hutang">
        <p>Kelola Accounts Receivable (AR) dan Accounts Payable (AP).</p>
        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
          <li><strong>Piutang</strong> — Catat tagihan ke pelanggan, umur piutang, status pembayaran</li>
          <li><strong>Hutang</strong> — Catat kewajiban ke supplier, jatuh tempo, pelunasan</li>
          <li><strong>Auto-jurnal</strong> — Pembayaran piutang/hutang otomatis membuat jurnal</li>
        </ul>
      </SectionCard>

      {/* ── ASET TETAP ── */}
      <SectionCard id="aset" icon="🏗️" title="Aset Tetap & Penyusutan">
        <p>Kelola aset tetap perusahaan dan hitung penyusutan otomatis.</p>
        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
          <li>Kategori: Tanah, Bangunan, Kendaraan, Mesin, Peralatan</li>
          <li>Generate jurnal penyusutan otomatis per bulan</li>
          <li>Tracking nilai perolehan, akumulasi penyusutan, dan nilai buku</li>
        </ul>
      </SectionCard>

      {/* ── PERSEDIAAN ── */}
      <SectionCard id="persediaan" icon="📦" title="Persediaan & Stock Opname">
        <p>Kelola stok barang dan lakukan stock opname berkala.</p>
        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
          <li>Pencatatan masuk/keluar otomatis dari PO & SO</li>
          <li>Stock Opname dengan auto-jurnal koreksi selisih</li>
          <li>Monitoring stok minimum dan valuasi persediaan</li>
        </ul>
      </SectionCard>

      {/* ── PEMBELIAN & PENJUALAN ── */}
      <SectionCard id="transaksi" icon="🛒" title="Pembelian & Penjualan">
        <p>Kelola Purchase Order (PO) dan Sales Order (SO).</p>
        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
          <li><strong>Pembelian</strong> — Buat PO, approve, dan auto-jurnal AP + update stok</li>
          <li><strong>Penjualan</strong> — Buat SO, approve, dan auto-jurnal AR</li>
          <li><strong>Giro</strong> — Kelola giro masuk/keluar, pencairan, dan penolakan</li>
          <li><strong>E-Faktur</strong> — Generate faktur pajak elektronik</li>
        </ul>
      </SectionCard>

      {/* ── ANGGARAN ── */}
      <SectionCard id="anggaran" icon="📋" title="Anggaran & Realisasi">
        <p>Monitor realisasi anggaran vs RKA (Rencana Kerja Anggaran).</p>
        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
          <li>Kategori: Penerimaan, Investasi, Beban Umum, Beban Operasional</li>
          <li>Perbandingan anggaran vs realisasi per bulan</li>
          <li>Persentase capaian dan sisa anggaran</li>
        </ul>
      </SectionCard>

      {/* ── VOUCHER ── */}
      <SectionCard id="voucher" icon="🧾" title="Voucher & Bukti Kas">
        <p>Cetak voucher pembayaran, penerimaan, dan bukti kas.</p>
        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
          <li>Bukti Kas Keluar (BKK), Bukti Kas Masuk (BKM)</li>
          <li>Jurnal Umum (JU), Jurnal Memorial (JM)</li>
          <li>Format cetak sesuai standar Perumda</li>
        </ul>
      </SectionCard>

      {/* ── KEYBOARD SHORTCUTS ── */}
      <SectionCard id="shortcuts" icon="⌨️" title="Tips & Shortcut">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {[
              ['AI Assistant', 'Klik tombol ✨💬 di pojok kanan bawah'],
              ['Cetak Laporan', 'Klik "Cetak Laporan" di header setiap report'],
              ['Export Excel', 'Klik "Unduh Excel (.xlsx)" di header laporan'],
              ['Filter Cepat', 'Gunakan search bar dan dropdown filter di setiap halaman'],
              ['Backup Data', 'Pengaturan → Data & Backup → Export'],
              ['Kunci Periode', 'Jurnal → Kunci Periode → pilih bulan'],
            ].map(([action, how], i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{action}</td>
                <td style={{ padding: '6px 8px' }}>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', marginTop: 8 }}>
        <strong>Perumda Pasar Baiman Banjarmasin</strong> — Sistem Informasi Akuntansi v2.0<br/>
        Untuk bantuan lebih lanjut, hubungi Tim IT atau gunakan AI Assistant (tombol 💬)
      </div>
    </>
  )
}
