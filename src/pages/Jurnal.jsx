import React, { useState, useMemo } from 'react'
import { Plus, Search, Filter, Eye, Edit2, Trash2, Check, X, Copy, Lock, Unlock, XCircle, AlertTriangle, Scale } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { apiReconcileMonth, apiSaveReportSnapshot, apiReconcileLedger } from '../services/api.js'
import { extractSnapshot, detectLampiranPeriods, classifySnapshot, hasReportValues, filterValidLra } from '../utils/reportSnapshot.js'
import Modal from '../components/UI/Modal.jsx'
import SearchableSelect from '../components/UI/SearchableSelect.jsx'
import { canApproveAmount, requiredApproverLabel, APPROVE_ROLES } from '../data/roles.js'
import ImportExcelButton from '../components/ExcelImport/ImportExcelButton.jsx'

const newRow = () => ({ akun: '', sub: '', jumlah: '', ket: '' })
const makeEmptyForm = () => ({
  tanggal: new Date().toISOString().split('T')[0],
  keterangan: '',
  status: 'pending',
  tipe_transaksi: '', // 'pendapatan' | 'pengeluaran' | 'transfer' — auto-detected or manual
  debitRows: [newRow()],
  kreditRows: [newRow()],
})

// Auto-detect transaction type from account codes
const detectTipeTransaksi = (debitRows, kreditRows) => {
  const dCodes = debitRows.filter(r => r.akun).map(r => r.akun.split(' ')[0])
  const kCodes = kreditRows.filter(r => r.akun).map(r => r.akun.split(' ')[0])
  // Pendapatan: kredit side has revenue accounts (4x, 7x) and debit side has cash/bank (111, 112)
  const hasRevenue = kCodes.some(c => c.startsWith('41') || c.startsWith('42') || c.startsWith('7'))
  const hasCashDebit = dCodes.some(c => c.startsWith('111') || c.startsWith('112'))
  if (hasRevenue && hasCashDebit) return 'pendapatan'
  // Pengeluaran: debit side has expense (5x, 6x, 8x) and kredit side has cash/bank
  const hasExpense = dCodes.some(c => c.startsWith('5') || c.startsWith('6') || c.startsWith('8'))
  const hasCashKredit = kCodes.some(c => c.startsWith('111') || c.startsWith('112'))
  if (hasExpense && hasCashKredit) return 'pengeluaran'
  // If only expense accounts (no cash), still classify as pengeluaran
  if (hasExpense) return 'pengeluaran'
  // If only revenue accounts, still classify as pendapatan
  if (hasRevenue) return 'pendapatan'
  return 'transfer'
}

// "61010 - Beban Gaji" -> { code: '61010', name: 'Beban Gaji' }
const parseAkunValue = (v) => {
  const s = String(v || '')
  const dash = s.indexOf(' - ')
  if (dash >= 0) return { code: s.slice(0, dash).trim(), name: s.slice(dash + 3).trim() }
  const sp = s.indexOf(' ')
  return sp > 0 ? { code: s.slice(0, sp).trim(), name: s.slice(sp + 1).trim() } : { code: s.trim(), name: '' }
}

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

export default function Jurnal() {
  const {
    state,
    dispatch,
    addJournal,
    updateJournal,
    deleteJournal,
    deleteJournals,
    deleteJournalsByMonth,
    approveJournal,
    unapproveJournal,
    copyJournal,
    addJournals,
    refreshData,
  } = useApp()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [showBulkDelete, setShowBulkDelete] = useState(null) // 'selected' | 'month' | null
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(makeEmptyForm())
  const [showLockPanel, setShowLockPanel] = useState(false)
  const [lockPeriod, setLockPeriod] = useState('Januari 2026')
  const [showSelisih, setShowSelisih] = useState(false)

  // Fallback: derive posting accounts directly from coaTree if coaFlat is empty
  function flattenTree(nodes, result = []) {
    if (!nodes) return result
    nodes.forEach(n => {
      if (n.type === 'posting') result.push(n)
      if (n.children) flattenTree(n.children, result)
    })
    return result
  }
  const postingAccounts = state.coaFlat.length > 0
    ? state.coaFlat.filter(a => a.type === 'posting')
    : flattenTree(state.coaTree)

  const anggaranOptions = (state.anggaran || []).filter(a => a.is_total !== 1)

  // Month name helper
  const getMonthName = (tanggal) => {
    if (!tanggal) return '-'
    const d = new Date(tanggal)
    return MONTHS[d.getMonth()]
  }

  // Month badge colors
  const MONTH_COLORS = [
    '#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#f59e0b',
    '#10b981','#14b8a6','#06b6d4','#3b82f6','#a855f7','#e11d48'
  ]
  const getMonthColor = (tanggal) => {
    if (!tanggal) return '#6366f1'
    return MONTH_COLORS[new Date(tanggal).getMonth()] || '#6366f1'
  }

  // Available months from journal data for filter
  const availableMonths = useMemo(() => {
    const map = {}
    state.journals.forEach(j => {
      if (j.tanggal) {
        const d = new Date(j.tanggal)
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
        const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
        map[key] = label
      }
    })
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([key, label]) => ({ key, label }))
  }, [state.journals])

  // Build akun options for SearchableSelect
  const akunOptions = useMemo(() => 
    postingAccounts.map(a => ({ label: `${a.code} - ${a.name}`, value: `${a.code} - ${a.name}` })),
    [postingAccounts]
  )

  // Predefined sub-akun per account code (dari data jurnal aktual Perumda)
  const PREDEFINED_SUBAKUN = {
    // === BEBAN ADMINISTRASI & UMUM (61xxx) ===
    '61010': ['Beban Gaji Pokok Direksi','Beban Gaji Pokok Pegawai Tetap'],
    '61020': ['Beban Tunjangan Jabatan','Beban Tunjangan Fungsional','Beban Tunjangan Representatif Direktur',
              'Beban Tunjangan Makan','Beban Tunjangan Transportasi','Beban Tunjangan Kesehatan (JKN)',
              'Beban Tunjangan Ketenagakerjaan (JKK & JKM)'],
    '61030': ['Beban Tunjangan Kesehatan (THL)','Beban Tunjangan Ketenagakerjaan (JKK & JKM) - THL',
              'Beban Tunjangan Hari Raya THL'],
    '61040': ['Beban ATK'],
    '61050': ['Beban Listrik','Beban Air','Beban Wifi/Internet','Beban Website dan Aplikasi (Server)'],
    '61060': ['Beban Makan Minum Rapat','Beban Makan Minum Kegiatan Kantor',
              'Beban Makan Minum Aktivitas Lapangan','Beban Makan Minum Kunjungan Tamu/Sosialisasi Pedagang'],
    '61070': ['Beban Pemeliharaan Perlengkapan dan Peralatan Kantor',
              'Beban Pemeliharaan Instalasi Listrik dan Air','Beban Pemeliharaan Bangunan Gedung Kantor'],
    '61080': ['Beban BBM Direksi','Beban BBM Mobil Keliling','Beban BBM Pick Up','Beban BBM Truck',
              'Beban BBM Genset dan Mesin Pencacah','Beban BBM Ketua Dewas'],
    // PERJALANAN DINAS — bukan transportasi rapat
    '61090': ['Perjalanan Dinas Dalam Kota','Perjalanan Dinas Luar Kota',
              'Beban Perjalanan Dinas Dewan Pengawas','Uang Harian Perjalanan Dinas'],
    // PENDIDIKAN & PELATIHAN — bukan audit (audit masuk 61120)
    '61100': ['Beban Diklat/Bimtek Direksi dan Pegawai','Beban Diklat/Bimtek Dewan Pengawas',
              'Beban Diklat/Bimtek/Pelatihan Pedagang'],
    '61110': ['Beban Sewa Mobil Operasional'],
    // JASA PROFESIONAL — audit & konsultan
    '61120': ['Beban Audit Laporan Keuangan / Pendampingan KAP','Beban Konsultan Rencana Bisnis',
              'Beban Seleksi Pegawai','Beban Kajian Penyesuaian Tarif','Beban Pendataan Pedagang'],
    '61130': ['Beban Penyusutan Bangunan','Beban Penyusutan Kendaraan','Beban Penyusutan Peralatan',
              'Beban Penyusutan Mesin','Beban Penyusutan Instalasi Listrik'],
    // BEBAN UMUM LAIN-LAIN — menggunakan nama child accounts
    '61140': ['Beban Kegiatan Kelembagaan','Beban Honorarium Narasumber','Beban Bingkisan Lebaran untuk Karyawan',
              'Beban Transportasi Rapat','Beban Jilid Laporan','Beban Parkir Karyawan',
              'Beban Pembuatan Video Profil Perumda','Beban Kegiatan 17 Agustusan',
              'Beban Buka Puasa Bersama','Beban Pembuatan Souvenir Perumda',
              'Beban Sayembara Logo Perusahaan','Beban Kegiatan Olahraga Karyawan',
              'Beban Peringatan Hari Jadi Kota Banjarmasin','Beban Peringatan HUT Perumda'],

    // === BEBAN OPERASIONAL & BISNIS (62xxx) ===
    '62010': ['Beban Pajak Mobil Operasional','Beban Parkir Mobil Operasional',
              'Beban Pemeliharaan Mobil Truck','Beban Pemeliharaan Mobil Pick Up',
              'Beban Pemeliharaan Mobil Keliling','Beban Pemeliharaan Tossa'],
    '62020': ['Beban Pemeliharaan Bangunan Pasar (Insidentil dan pengecatan)'],
    '62030': ['Alat dan Bahan Kebersihan Pasar','Alat dan Bahan Penyegelan','Beban Atribut Petugas Kebersihan'],
    '62040': ['Beban Cetak Dokumen Perjanjian Sewa','Beban Cetak Segel','Beban Cetak Karcis Retribusi Harian',
              'Beban Cetak Spanduk','Beban Pendataan Pedagang'],
    '62050': ['Beban Cetak Karcis Retribusi Harian','Beban Cetak ID Card + Pin Perumda','Beban Cetak Spanduk'],
    '62060': ['Beban Honor Tenaga Outsorching/Kontrak','Beban Honor Tenaga Harian Lepas',
              'Beban Lembur Tenaga Harian Lepas','Beban Lembur Tenaga Kontrak (Sopir, Satpam, OB)'],
    '62070': ['Beban Tunjangan Fungsional','Beban Tunjangan Kesehatan (THL)',
              'Beban Tunjangan Ketenagakerjaan (JKK & JKM) - THL','Beban Tunjangan Hari Raya THL'],
    // KELENGKAPAN PEGAWAI — pakaian, atribut
    '62080': ['Beban Atribut Penagihan (Rompi + Topi)','Beban Baju Petugas Kebersihan',
              'Beban Atribut Petugas Kebersihan','Beban Petugas Keamanan (29)',
              'Beban Atribut Petugas Parkir (Baju + Topi)','Beban Cetak ID Card + Pin Perumda'],
    // INSENTIF/KESEJAHTERAAN — lembur, insentif, dan kegiatan sosial
    '62090': ['Beban Lembur Karyawan','Beban Lembur Tenaga Kontrak (Sopir, Satpam, OB)',
              'Beban Lembur Tenaga Harian Lepas','Beban Insentif Bagian Penagihan',
              'Beban Honor Dewas','Beban Buka Puasa Bersama'],
    // KEAMANAN & KETERTIBAN PASAR
    '62100': ['Jasa Pengamanan Pasar','Honor Satpam/Petugas Keamanan',
              'Beban Pemeliharaan Keamanan dan Ketertiban Pasar'],

    // === BPP (51xxx) ===
    '51000': ['Pembelian Bapok untuk Gerai Inflasi','Pembelian Produk Pasar'],
    '51001': ['Pembelian Gas LPG 3kg','Pembelian Gas LPG 12kg'],

    // === PENDAPATAN (41xxx, 42xxx) ===
    // Nama mengikuti konvensi jurnal divisi (kelompok 41000 = Bisnis Utama,
    // 42000 = Bisnis Lainnya) — sebelumnya beberapa saran nyasar kelompok
    // (grosir di 41000; PKL/sampah di 42000) sehingga baris LRA-nya salah.
    '41000': ['Pendapatan Pengelolaan Pasar Toko/Kios, Bak, dan Los (Bulanan)',
              'Pendapatan Pengelolaan Pasar PKL (Harian)',
              'Pendapatan Pemeliharaan Kebersihan Pasar (Sampah)',
              'Pendapatan Denda Pelayanan Pasar','Pendapatan Perizinan',
              'Pendapatan Pengelolaan Lain-lain','Pendapatan Keamanan Pasar',
              'Pendapatan Ramayana'],
    '42000': ['Pendapatan Parkir',
              'Pendapatan Sewa Tempat Event Khusus/Rakyat/Ruang Kreasi',
              'Pendapatan Sewa Tempat Wisata Kuliner (fooodcourt)',
              'Pendapatan Layanan Pengiriman','Pendapatan Studio Live Selling',
              'Pendapatan Iklan/Reklame/Promosi','Pendapatan Pusat Grosir Bahan Pokok',
              'Pendapatan Gerai Inflasi','Pendapatan Air Minum Isi Ulang',
              'Pendapatan Gas LPG'],
    '42001': ['Pendapatan Parkir'],
    '42008': ['Pendapatan Pusat Grosir Bahan Pokok'],
    '42009': ['Pendapatan Gerai Inflasi'],
    '42010': ['Pendapatan Air Minum Isi Ulang'],
    '42011': ['Pendapatan Gas LPG'],

    // === NON-OPERASIONAL (divisi membukukan di kode GRUP; Sub Akun memisahkan
    // akun sebenarnya — "Pajak Penghasilan" di sini diklasifikasi ke 99999) ===
    '70000': ['Pendapatan Bunga','Pendapatan Penjualan Aset',
              'Pendapatan Selisih Lebih','Pendapatan Lain-lain'],
    '80000': ['Pajak Penghasilan','Beban Pajak Bank','Beban Administrasi Bank',
              'Beban Kerugian Persediaan','Beban Lain Lain'],
    '70001': ['Pendapatan Bunga'],
    '70002': ['Pendapatan Penjualan Aset'],
    '70003': ['Pendapatan Selisih Lebih'],
    '70004': ['Pendapatan Lain-lain'],
    '80001': ['Beban Pajak Bank'],
    '80002': ['Beban Administrasi Bank'],
    '80003': ['Beban Lain Lain'],
    '80004': ['Beban Kerugian Persediaan'],
    '99999': ['Pajak Penghasilan'],

    // === KAS & BANK ===
    '11101': ['Penerimaan Kas Kecil','Pengeluaran Kas Kecil','Replenishment Kas Kecil'],
    '11103': ['Penerimaan Retribusi','Setoran Kas','Transfer Antar Bank','Penyetoran Modal Daerah'],
    '11104': ['Penerimaan Bunga','Transfer dari Bank Kalsel','Pencairan Deposito'],

    // === ASET TETAP ===
    '12101': ['Tanah Pasar','Tanah Kantor','Tanah Bangunan'],
    '12201': ['Bangunan Pasar Tradisional','Bangunan Kantor','Renovasi Bangunan'],
    '12202': ['Kendaraan Operasional','Kendaraan Direksi','Kendaraan Pengangkut'],
    '12203': ['Instalasi Listrik','Instalasi Air','Instalasi Telepon'],
    '12203.1': ['Penambahan Instalasi Listrik Pasar','Penggantian Instalasi Listrik',
                'Pemasangan Instalasi Listrik Baru'],
    '12203.2': ['Penambahan Instalasi Air','Penggantian Instalasi Air'],
    '12300': ['Pembangunan Gedung Pasar','Renovasi Bangunan Pasar','Pengadaan Peralatan',
              'Aset Dalam Penyelesaian'],
  }

  // Master list of ALL known sub-akuns (fallback for any unmapped account)
  const ALL_KNOWN_SUBAKUN = [
    'Alat dan Bahan Kebersihan Pasar','Alat dan Bahan Penyegelan',
    'Beban ATK','Beban Administrasi Bank',
    'Beban Air','Beban Atribut Petugas Kebersihan',
    'Beban Audit Laporan Keuangan / Pendampingan KAP',
    'Beban BBM Direksi','Beban BBM Mobil Keliling','Beban BBM Pick Up','Beban BBM Truck',
    'Beban Cetak ID Card + Pin Perumda','Beban Cetak Karcis Retribusi Harian','Beban Cetak Spanduk',
    'Beban Gaji Pokok Direksi','Beban Gaji Pokok Pegawai Tetap',
    'Beban Honor Dewas','Beban Honor Tenaga Harian Lepas','Beban Honor Tenaga Outsorching/Kontrak',
    'Beban Kegiatan Kelembagaan','Beban Lain Lain','Beban Lembur Karyawan',
    'Beban Lembur Tenaga Harian Lepas','Beban Lembur Tenaga Kontrak (Sopir, Satpam, OB)',
    'Beban Listrik','Beban Makan Minum Aktivitas Lapangan','Beban Makan Minum Kegiatan Kantor',
    'Beban Makan Minum Kunjungan Tamu/Sosialisasi Pedagang','Beban Makan Minum Rapat',
    'Beban Pajak Bank','Beban Parkir Mobil Operasional',
    'Beban Pemeliharaan Bangunan Pasar (Insidentil dan pengecatan)',
    'Beban Pemeliharaan Mobil Keliling','Beban Pemeliharaan Mobil Truck',
    'Beban Pemeliharaan Perlengkapan dan Peralatan Kantor','Beban Pendataan Pedagang',
    'Beban Penyusutan Bangunan','Beban Penyusutan Instalasi Listrik',
    'Beban Penyusutan Kendaraan','Beban Penyusutan Mesin','Beban Penyusutan Peralatan',
    'Beban Sewa Mobil Operasional','Beban Transportasi Rapat',
    'Beban Tunjangan Fungsional','Beban Tunjangan Jabatan',
    'Beban Tunjangan Kesehatan (JKN)','Beban Tunjangan Kesehatan (THL)',
    'Beban Tunjangan Ketenagakerjaan (JKK & JKM)','Beban Tunjangan Ketenagakerjaan (JKK & JKM) - THL',
    'Beban Tunjangan Makan','Beban Tunjangan Representatif Direktur','Beban Tunjangan Transportasi',
    'Beban Website dan Aplikasi (Server)','Beban Wifi/Internet',
    'Karyawan','Pendapatan Air Minum Isi Ulang','Pendapatan Bunga','Pendapatan Gas LPG',
    'Pendapatan Gerai Inflasi','Pendapatan Parkir',
    'Pendapatan Pemeliharaan Kebersihan Pasar (Sampah)',
    'Pendapatan Pengelolaan Pasar PKL (Harian)',
    'Pendapatan Pengelolaan Pasar Toko/Kios, Bak, dan Los (Bulanan)',
    'Pendapatan Pusat Grosir Bahan Pokok',
  ]

  // Build sub akun options. The picker now draws from the FULL COA (the same
  // source as the main Akun dropdown / postingAccounts), formatted "CODE - NAME"
  // like akunOptions, so EVERY account code — e.g. 41008, 41009 — is searchable
  // as a sub-akun. Account-specific suggestions (this account's COA children,
  // journal-history sub-akuns, and predefined names) are listed FIRST, then the
  // rest of the COA. When a sub-akun chosen here carries a leading numeric code,
  // report attribution follows that sub-code (see reportDelta.codeOf /
  // lraOutline.extractAccountCode); free-text names keep attribution on the parent.
  const getSubAkunOptions = (mainAkun) => {
    if (!mainAkun) return []
    const code = mainAkun.split(' ')[0] // e.g. "61010" from "61010 - Beban Gaji"

    const seen = new Set()
    const specific = []
    const pushUnique = (arr, label, value) => {
      const v = value != null ? value : label
      if (!v || seen.has(v)) return
      seen.add(v)
      arr.push({ label, value: v })
    }

    // 1. COA children of THIS account (real sub-codes), formatted "CODE - NAME".
    ;(postingAccounts || []).forEach(a => {
      const ac = String(a.code || '')
      if (ac !== code && ac.startsWith(code) && ac.length > code.length)
        pushUnique(specific, `${a.code} - ${a.name}`)
    })

    // 2. Journal-history sub-akuns already used for this account (free-text names).
    state.journals.forEach(j => {
      ;[j.akun_debit, j.akun_kredit].forEach(a => {
        if (a && a.startsWith(code) && a.includes(' > ')) {
          const sub = a.split(' > ')[1]
          if (sub) pushUnique(specific, sub)
        }
      })
    })

    // 3. Predefined suggestions for this account (free-text names).
    ;(PREDEFINED_SUBAKUN[code] || []).forEach(s => pushUnique(specific, s))

    // 4. The rest of the FULL COA, formatted "CODE - NAME" (every code searchable).
    const rest = []
    ;(postingAccounts || []).forEach(a => pushUnique(rest, `${a.code} - ${a.name}`))

    // Account-specific first, then the rest of the COA.
    return [...specific, ...rest]
  }

  const lockedPeriods = state.lockedPeriods || []

  // Check if a date falls in a locked period
  function isDateLocked(dateStr) {
    if (!dateStr) return false
    const d = new Date(dateStr)
    const monthName = MONTHS[d.getMonth()]
    const year = d.getFullYear()
    return lockedPeriods.includes(`${monthName} ${year}`)
  }

  const filtered = state.journals.filter(j => {
    const matchSearch = (j.keterangan || '').toLowerCase().includes(search.toLowerCase()) ||
      (j.id || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || j.status === statusFilter
    const matchMonth = monthFilter === 'all' || (j.tanggal && (() => {
      const d = new Date(j.tanggal)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      return key === monthFilter
    })())
    return matchSearch && matchStatus && matchMonth
  })

  // Stats
  const totalPosted = state.journals.filter(j => j.status === 'posted').length
  const totalPending = state.journals.filter(j => j.status === 'pending').length

  // --- Bulk selection (checkbox per transaksi) ---
  // Locked journals can't be deleted, so they are not selectable.
  const selectableIds = filtered.filter(j => !isDateLocked(j.tanggal)).map(j => j.id)
  const selectedVisible = selectableIds.filter(id => selectedIds.has(id))
  const allSelected = selectableIds.length > 0 && selectedVisible.length === selectableIds.length

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleSelectAll = () => setSelectedIds(prev => {
    if (allSelected) {
      const next = new Set(prev)
      selectableIds.forEach(id => next.delete(id))
      return next
    }
    return new Set([...prev, ...selectableIds])
  })

  // Month currently chosen in the filter (for "Hapus Semua")
  const monthFilterLabel = (availableMonths.find(m => m.key === monthFilter) || {}).label || monthFilter
  const monthJournals = monthFilter !== 'all'
    ? state.journals.filter(j => j.tanggal && j.tanggal.startsWith(monthFilter))
    : []
  const monthBaselineCount = monthJournals.filter(j => /^(XL|SUM|ADJ|CAS)-/.test(j.id || '')).length

  async function handleDeleteSelected() {
    if (selectedVisible.length === 0) return
    setBulkDeleting(true)
    try {
      await deleteJournals(selectedVisible)
    } finally {
      setBulkDeleting(false)
      setSelectedIds(new Set())
      setShowBulkDelete(null)
    }
  }

  function openDeleteMonth() {
    if (monthFilter === 'all') return
    if (lockedPeriods.includes(monthFilterLabel)) {
      return alert(`Periode ${monthFilterLabel} sedang terkunci. Buka kunci periode terlebih dahulu.`)
    }
    if (monthJournals.length === 0) {
      return alert(`Tidak ada jurnal di bulan ${monthFilterLabel}.`)
    }
    setShowBulkDelete('month')
  }

  async function handleDeleteMonth() {
    setBulkDeleting(true)
    try {
      await deleteJournalsByMonth(monthFilter)
    } finally {
      setBulkDeleting(false)
      setSelectedIds(new Set())
      setShowBulkDelete(null)
    }
  }

  // --- Multi-line form row helpers ---
  const updateRow = (side, idx, patch) => setForm(f => {
    const key = side === 'd' ? 'debitRows' : 'kreditRows'
    return { ...f, [key]: f[key].map((r, i) => i === idx ? { ...r, ...patch } : r) }
  })
  const addFormRow = (side) => setForm(f => {
    const key = side === 'd' ? 'debitRows' : 'kreditRows'
    return { ...f, [key]: [...f[key], newRow()] }
  })
  const removeFormRow = (side, idx) => setForm(f => {
    const key = side === 'd' ? 'debitRows' : 'kreditRows'
    const rows = f[key].filter((_, i) => i !== idx)
    return { ...f, [key]: rows.length ? rows : [newRow()] }
  })

  function openAdd() {
    setForm(makeEmptyForm())
    setEditId(null)
    setShowModal(true)
  }

  function openEdit(journal) {
    if (isDateLocked(journal.tanggal)) {
      return alert('Jurnal ini berada di periode yang terkunci. Buka kunci periode terlebih dahulu.')
    }
    // Prefer normalized journal_lines, then `lines` JSON, then 2-account fields
    let lines = journal.journal_lines
    if (!Array.isArray(lines) || lines.length === 0) {
      let parsed = journal.lines
      if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed) } catch { parsed = null } }
      lines = Array.isArray(parsed) ? parsed : null
    }
    let debitRows = [], kreditRows = []
    if (Array.isArray(lines) && lines.length > 0) {
      lines.forEach(l => {
        const akun = l.akun_code ? `${l.akun_code} - ${l.akun_name || ''}`.replace(/ - $/, '') : (l.akun_name || '')
        const ket = l.keterangan && l.keterangan !== journal.keterangan ? l.keterangan : ''
        if ((Number(l.debit) || 0) > 0) debitRows.push({ akun, sub: l.sub_akun || '', jumlah: String(l.debit), ket })
        else if ((Number(l.kredit) || 0) > 0) kreditRows.push({ akun, sub: l.sub_akun || '', jumlah: String(l.kredit), ket })
      })
    }
    if (debitRows.length === 0 || kreditRows.length === 0) {
      const parseAcct = (s) => {
        const v = String(s || ''); const idx = v.indexOf(' > ')
        return idx >= 0 ? [v.slice(0, idx), v.slice(idx + 3)] : [v, '']
      }
      const [aD, sD] = parseAcct(journal.akun_debit)
      const [aK, sK] = parseAcct(journal.akun_kredit)
      if (debitRows.length === 0) debitRows = [{ akun: aD, sub: sD, jumlah: String(journal.debit || journal.kredit || '') }]
      if (kreditRows.length === 0) kreditRows = [{ akun: aK, sub: sK, jumlah: String(journal.kredit || journal.debit || '') }]
    }
    setForm({ tanggal: journal.tanggal, keterangan: journal.keterangan, status: journal.status, tipe_transaksi: journal.tipe_transaksi || '', debitRows, kreditRows })
    setEditId(journal.id)
    setShowModal(true)
  }

  async function handleSave() {
    const dRows = form.debitRows.filter(r => r.akun && Number(r.jumlah) > 0)
    const kRows = form.kreditRows.filter(r => r.akun && Number(r.jumlah) > 0)
    if (!form.keterangan.trim()) return alert('Keterangan wajib diisi. Mohon isi deskripsi transaksi.')
    if (dRows.length === 0) return alert('Minimal satu baris Debit dengan akun & jumlah > 0.')
    if (kRows.length === 0) return alert('Minimal satu baris Kredit dengan akun & jumlah > 0.')
    if (!form.tipe_transaksi) return alert('Pilih Tipe Transaksi (Pendapatan / Pengeluaran / Transfer) untuk menentukan arah arus kas.')
    const totalD = dRows.reduce((s, r) => s + Number(r.jumlah), 0)
    const totalK = kRows.reduce((s, r) => s + Number(r.jumlah), 0)
    if (Math.abs(totalD - totalK) > 0.01) {
      return alert(`Jurnal tidak seimbang.\nTotal Debit: ${formatRupiah(totalD)}\nTotal Kredit: ${formatRupiah(totalK)}`)
    }
    const toLine = (r, side) => {
      const { code, name } = parseAkunValue(r.akun)
      return {
        akun_code: code, akun_name: name, sub_akun: r.sub || '',
        debit: side === 'd' ? Number(r.jumlah) : 0,
        kredit: side === 'k' ? Number(r.jumlah) : 0,
        keterangan: r.ket || form.keterangan,
      }
    }
    const lines = [...dRows.map(r => toLine(r, 'd')), ...kRows.map(r => toLine(r, 'k'))]
    const acctStr = (r) => `${r.akun}${r.sub ? ' > ' + r.sub : ''}`
    // Explicit user selection (required); falls back to auto-detect for safety
    const tipe = form.tipe_transaksi || detectTipeTransaksi(form.debitRows, form.kreditRows)
    const entry = {
      tanggal: form.tanggal,
      keterangan: form.keterangan,
      status: form.status,
      tipe_transaksi: tipe,
      lines,
      debit: totalD,
      kredit: totalK,
      akun_debit: acctStr(dRows[0]),
      akun_kredit: acctStr(kRows[0]),
    }
    setShowModal(false)
    if (editId) {
      await updateJournal(editId, { ...entry, id: editId })
    } else {
      const num = String(state.nextJournalNum).padStart(3, '0')
      await addJournal({ ...entry, id: `JV-2026-${num}` })
    }
  }

  async function handleDelete(id) {
    const j = state.journals.find(j => j.id === id)
    if (j && isDateLocked(j.tanggal)) {
      return alert('Jurnal ini berada di periode yang terkunci.')
    }
    setShowDeleteConfirm(null)
    await deleteJournal(id)
  }

  async function handleCopy(id) {
    await copyJournal(id)
  }

  // After approving, reconcile the affected month's Buku Besar to the Neraca
  // snapshot. New user journals (JV-/JRN-) are kept as deltas (NOT re-baselined),
  // so they flow into every report on top of the audited snapshot.
  async function reconcilePeriods(periods) {
    const uniq = [...new Set((periods || []).filter(p => /^\d{4}-\d{2}$/.test(p)))]
    let changed = false
    for (const p of uniq) {
      try { const r = await apiReconcileLedger(p); if (r && r.reconciled) changed = true } catch (_) { /* best-effort */ }
    }
    if (changed && typeof refreshData === 'function') await refreshData('all')
  }

  async function handleApprove(id) {
    const j = state.journals.find(j => j.id === id)
    const amount = j ? (j.debit || j.kredit || 0) : 0
    const period = j && j.tanggal ? String(j.tanggal).slice(0, 7) : null
    const currentRole = state.session?.role || window.__USER_ROLE__ || 'admin'

    // SOP Pembayaran B&J: cek batas otoritas berdasarkan nilai transaksi
    if (!canApproveAmount(currentRole, amount)) {
      const needed = requiredApproverLabel(amount)
      return alert(
        `Tidak dapat approve.\n\nNilai transaksi: ${formatRupiah(amount)}\nMemerlukan: ${needed}\nRole Anda: ${currentRole}\n\nSesuai SOP Pembayaran Barang & Jasa Perumda Pasar Banjarmasin.`
      )
    }
    await approveJournal(id)
    if (period) await reconcilePeriods([period])
  }

  async function handleApproveAll() {
    const currentRole = state.session?.role || window.__USER_ROLE__ || 'admin'
    const pending = state.journals.filter(j => j.status === 'pending')

    if (pending.length === 0) {
      return alert('Tidak ada jurnal pending untuk di-approve.')
    }

    // Partition into approvable vs skipped (locked period or beyond role authority)
    const approvable = []
    const skippedLocked = []
    const skippedAuthority = []
    pending.forEach(j => {
      if (isDateLocked(j.tanggal)) { skippedLocked.push(j); return }
      const amount = j.debit || j.kredit || 0
      if (!canApproveAmount(currentRole, amount)) { skippedAuthority.push(j); return }
      approvable.push(j)
    })

    if (approvable.length === 0) {
      return alert(
        `Tidak ada jurnal yang dapat di-approve.\n` +
        `${skippedLocked.length} di periode terkunci, ` +
        `${skippedAuthority.length} di luar wewenang role "${currentRole}".`
      )
    }

    let msg = `Approve ${approvable.length} jurnal pending?`
    const skippedTotal = skippedLocked.length + skippedAuthority.length
    if (skippedTotal > 0) {
      msg += `\n\n${skippedTotal} jurnal akan dilewati:`
      if (skippedLocked.length) msg += `\n• ${skippedLocked.length} di periode terkunci`
      if (skippedAuthority.length) msg += `\n• ${skippedAuthority.length} di luar wewenang role "${currentRole}"`
    }
    if (!window.confirm(msg)) return

    for (const j of approvable) {
      await approveJournal(j.id)
    }

    // Reconcile each affected month's Buku Besar to its Neraca snapshot. This
    // ties only the AUDITED BASELINE (XL-/SUM-/ADJ-/CAS-) to the snapshot; the
    // just-approved JV-/JRN- journals are kept as deltas and float on top of
    // every report (NOT re-baselined to XL-).
    await reconcilePeriods(approvable.map(j => String(j.tanggal || '').slice(0, 7)))

    if (skippedTotal > 0) {
      alert(`${approvable.length} jurnal berhasil di-approve. ${skippedTotal} dilewati.`)
    }
  }

  async function handleUnapprove(id) {
    const j = state.journals.find(j => j.id === id)
    if (j && isDateLocked(j.tanggal)) {
      return alert('Jurnal ini berada di periode yang terkunci.')
    }
    await unapproveJournal(id)
  }

  function handleLockPeriod() {
    dispatch({ type: 'LOCK_PERIOD', payload: lockPeriod })
  }

  function handleUnlockPeriod(period) {
    dispatch({ type: 'UNLOCK_PERIOD', payload: period })
  }

  // Check AR/AP balance
  function checkARAPBalance() {
    setShowSelisih(true)
  }

  // Compute selisih data
  const selisihData = useMemo(() => {
    const piutang = state.piutang || []
    const hutang = state.hutang || []
    const totalAR = piutang.reduce((s, p) => s + (p.sisa || 0), 0)
    const totalAP = hutang.reduce((s, h) => s + (h.sisa || 0), 0)
    const posted = state.journals.filter(j => j.status === 'posted')
    let journalAR = 0, journalAP = 0
    let totalDebit = 0, totalKredit = 0
    const imbalanced = []
    posted.forEach(j => {
      totalDebit += j.debit
      totalKredit += j.kredit
      if (j.debit !== j.kredit) imbalanced.push(j)
      if (j.akun_debit.includes('11201')) journalAR += j.debit
      if (j.akun_kredit.includes('11201')) journalAR -= j.kredit
      if (j.akun_kredit.includes('21101')) journalAP += j.kredit
      if (j.akun_debit.includes('21101')) journalAP -= j.debit
    })
    return { totalAR, totalAP, journalAR, journalAP, totalDebit, totalKredit, imbalanced, isBalanced: totalDebit === totalKredit, arMatch: totalAR === journalAR, apMatch: totalAP === journalAP }
  }, [state.journals, state.piutang, state.hutang])

  // Multi-line balance computation for the form
  const formDebitRows = (form.debitRows || []).filter(r => r.akun && Number(r.jumlah) > 0)
  const formKreditRows = (form.kreditRows || []).filter(r => r.akun && Number(r.jumlah) > 0)
  const formTotalDebit = formDebitRows.reduce((s, r) => s + Number(r.jumlah), 0)
  const formTotalKredit = formKreditRows.reduce((s, r) => s + Number(r.jumlah), 0)
  const formBalanced = formDebitRows.length > 0 && formKreditRows.length > 0 && Math.abs(formTotalDebit - formTotalKredit) < 0.01 && formTotalDebit > 0
  const isFormValid = !!form.tanggal && formBalanced && !!form.tipe_transaksi

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Jurnal Umum</h1>
        <p>Kelola entri jurnal akuntansi — {state.journals.length} entri ({totalPosted} posted, {totalPending} pending)</p>
      </div>

      {/* SOP Approval info banner */}
      {(() => {
        const role = state.session?.role || window.__USER_ROLE__ || ''
        if (!role) return null
        const isApprover = APPROVE_ROLES.includes(role)
        return (
          <div style={{ padding: '8px 14px', background: isApprover ? 'rgba(16,185,129,0.07)' : 'rgba(245,158,11,0.07)', border: `1px solid ${isApprover ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`, borderRadius: 8, marginBottom: 12, fontSize: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: isApprover ? '#10B981' : '#F59E0B' }}>
              {isApprover ? '✓ Anda berwenang approve' : '⚠ Anda tidak berwenang approve'}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'var(--text-muted)' }}>SOP: &lt; Rp 1 jt → Manajer · &gt; Rp 1 jt → Direktur Umum &amp; Keuangan · &gt; Rp 50 jt → Direktur Utama</span>
          </div>
        )
      })()}

      {/* Locked periods indicator */}
      {lockedPeriods.length > 0 && (
        <div style={{display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center'}}>
          <Lock size={14} color="var(--warning)" />
          <span style={{fontSize:12, color:'var(--text-muted)'}}>Periode terkunci:</span>
          {lockedPeriods.map(p => (
            <span key={p} className="badge orange" style={{fontSize:11}}>{p}</span>
          ))}
        </div>
      )}

      <div className="toolbar">
        <div className="topbar-search" style={{ maxWidth: 280 }}>
          <Search />
          <input type="text" placeholder="Cari jurnal..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Semua Status</option>
          <option value="posted">Posted</option>
          <option value="pending">Pending</option>
        </select>
        <select className="form-select" style={{ width: 'auto', minWidth: 150 }} value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
          <option value="all">📅 Semua Bulan</option>
          {availableMonths.map(m => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
        <div className="toolbar-right">
          <button className="btn btn-outline" onClick={() => setShowLockPanel(!showLockPanel)} title="Kunci Periode"><Lock size={16} /> Kunci Periode</button>
          <button className="btn btn-outline" onClick={() => setShowSelisih(true)} title="Cek Selisih Jurnal"><Scale size={16} /> Cek Selisih</button>
          <button className="btn btn-outline" onClick={checkARAPBalance} title="Check AR/AP">Check AR/AP</button>
          <ImportExcelButton moduleType="jurnal" label="Import Excel" knownCodes={state.coaFlat.map(a => a.code)} coaAccounts={state.coaFlat} onImport={async (data, detectedType, workbook) => {
            // Months present in the upload (from the parsed journal dates).
            const months = [...new Set(
              data.map(d => String(d.tanggal || '').slice(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m))
            )]

            // ── PATH A: LAMPIRAN-style upload (JURNAL <BULAN> <TAHUN> sheet) ────
            // Two sub-modes, decided per period by what the workbook REALLY holds:
            //  • 'snapshot' — official lampiran (valid NERACA + LABA RUGI sheets):
            //    reports freeze to the sheets, JURNAL loads as baseline (XL-) so
            //    Buku Besar matches without double-counting the snapshot.
            //  • 'jurnal'   — journal book only (no readable official report
            //    sheets): the JURNAL sheet REPLACES the month's journals as live
            //    JV- entries and any frozen snapshot/LRA rows for the month are
            //    CLEARED, so every report (L/R, LRA, Neraca, Arus Kas, triwulan/
            //    semester) is computed from the journals — the 07-07-2026 kendala
            //    was this file shape being saved as an (empty) snapshot, leaving
            //    the journals invisible to all reports except Buku Besar.
            if (workbook) {
              // Periods to process: months found in the lampiran's JURNAL sheets,
              // unioned with any months present in parsed rows (template fallback).
              const candidatePeriods = [...new Set([
                ...detectLampiranPeriods(workbook).map(p => p.period),
                ...months,
              ])]
              const snapMsgs = []
              let didSnapshot = false
              let didJournalOnly = false
              for (const period of candidatePeriods) {
                try {
                  const snap = extractSnapshot(workbook, period)
                  const mode = classifySnapshot(snap)
                  if (mode === 'snapshot') {
                    const validLra = filterValidLra(snap.lra)
                    const r = await apiSaveReportSnapshot({
                      period, neraca: snap.neraca,
                      arusKas: hasReportValues(snap.arusKas) ? snap.arusKas : [],
                      labaRugi: snap.labaRugi, lra: validLra,
                      journals: snap.journals,
                    })
                    const l = r.loaded || {}
                    snapMsgs.push(`${period}: snapshot resmi (Neraca ${l.neraca || 0} / Arus Kas ${l.arus_kas || 0} / Laba Rugi ${l.laba_rugi || 0}), ${l.journals || 0} jurnal baseline`)
                    didSnapshot = true
                  } else if (mode === 'jurnal') {
                    // Live journals: JV- ids so they overlay every report as delta;
                    // clearReports drops any stale frozen snapshot for the month.
                    const journals = snap.journals.map(j => ({ ...j, id: String(j.id).replace(/^XL-/, 'JV-') }))
                    const r = await apiSaveReportSnapshot({ period, journals, clearReports: true })
                    const skipped = [snap.sheets.neraca && 'NERACA', snap.sheets.labaRugi && 'LABA RUGI', snap.sheets.arusKas && 'ARUS KAS'].filter(Boolean)
                    snapMsgs.push(`${period}: ${(r.loaded || {}).journals || 0} jurnal dimuat sebagai jurnal baru (JV-)` +
                      (skipped.length ? ` — sheet ${skipped.join('/')} terdeteksi tapi nilainya tidak terbaca, dilewati` : ''))
                    didJournalOnly = true
                  }
                } catch (e) {
                  // Not a lampiran for this period — fall through to delta path.
                }
              }
              if (didSnapshot || didJournalOnly) {
                if (typeof refreshData === 'function') await refreshData('all')
                const lines = [`File diproses per bulan:`, ...snapMsgs, '']
                if (didSnapshot) lines.push('Bulan ber-snapshot resmi: laporan tampil persis seperti lampiran; jurnal baseline (XL-) mengisi Buku Besar.')
                if (didJournalOnly) lines.push('Bulan tanpa sheet laporan resmi: jurnal MENGGANTIKAN seluruh jurnal bulan tersebut, dan Laporan L/R, LRA, Neraca, Arus Kas serta rekap triwulan/semester dihitung otomatis dari jurnal (Buku Besar).')
                lines.push('Jurnal masuk berstatus PENDING — klik "Approve Semua" untuk memposting ke Buku Besar & laporan.')
                return lines.join('\n')
              }
            }

            // ── PATH B: Plain journal template ─────────────────────────────────
            // A plain "Jurnal Transaksi"-style template (NOT a full LAMPIRAN with
            // NERACA / ARUS KAS / LABA RUGI / JURNAL report sheets). These rows are
            // LIVE DELTAS: assign app journal ids (JV- prefix) and serialize lines
            // for the bulk API so the flat view + journal_lines match. After
            // "Approve Semua" they post (JV-/JRN-) and flow into every report via
            // the existing snapshot+delta overlay — NO snapshot reload and NO
            // demotion to XL-. The audited baseline is (re)set ONLY through the
            // explicit "Muat Snapshot Laporan Audited" action (the separate
            // POST /reports/load-audited endpoint) / a full LAMPIRAN upload
            // (PATH A) — never automatically on a plain template import, so user
            // journals are never silently rebaselined.
            const startNum = state.nextJournalNum || 1
            const prepared = data.map((d, i) => ({
              ...d,
              id: `JV-2026-${String(startNum + i).padStart(3, '0')}`,
              status: d.status || 'pending',
              tipe_transaksi: d.tipe_transaksi || 'transfer',
              lines: d.lines ? (typeof d.lines === 'string' ? d.lines : JSON.stringify(d.lines)) : null,
            }))
            await addJournals(prepared)

            // Re-sync UI so the new pending JV- journals show. Reports already
            // reflect them as deltas once they are approved (posted) — no
            // load-audited call, no rebaseline.
            if (typeof refreshData === 'function') await refreshData('all')

            return `${data.length} jurnal berhasil diimport sebagai jurnal baru (JV-). ` +
              `Status PENDING — klik "Approve Semua" untuk memposting ke Buku Besar. ` +
              `Setelah di-approve, jurnal otomatis menambah (delta) ke Neraca/Laba Rugi/Arus Kas/LRA di atas snapshot audited — tanpa memuat ulang snapshot.`
          }} />
          {selectedVisible.length > 0 && (
            <button className="btn btn-danger" id="btn-delete-selected" onClick={() => setShowBulkDelete('selected')} title="Hapus jurnal yang dicentang">
              <Trash2 size={16} /> Hapus Terpilih ({selectedVisible.length})
            </button>
          )}
          {monthFilter !== 'all' && (
            <button className="btn btn-outline" id="btn-delete-month" onClick={openDeleteMonth} title={`Hapus SEMUA jurnal bulan ${monthFilterLabel}`} style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.4)' }}>
              <Trash2 size={16} /> Hapus Semua ({monthFilterLabel})
            </button>
          )}
          <button className="btn btn-outline" id="btn-approve-all" onClick={handleApproveAll} disabled={totalPending === 0} title="Approve semua jurnal pending" style={{ color: totalPending > 0 ? 'var(--success)' : undefined }}><Check size={16} /> Approve Semua{totalPending > 0 ? ` (${totalPending})` : ''}</button>
          <button className="btn btn-primary" id="btn-add-journal" onClick={openAdd}><Plus size={16} /> Buat Jurnal</button>
        </div>
      </div>

      {/* Lock Period Panel */}
      {showLockPanel && (
        <div className="card" style={{marginBottom:16, padding: 16}}>
          <div className="card-header" style={{marginBottom:12}}>
            <div className="card-title">Kunci / Buka Kunci Transaksi Periode</div>
            <button className="btn btn-outline" onClick={() => setShowLockPanel(false)}><X size={16} /></button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Pilih Periode</label>
              <select className="form-select" value={lockPeriod} onChange={e => setLockPeriod(e.target.value)}>
                {MONTHS.map(m => ['2025','2026'].map(y =>
                  <option key={`${m} ${y}`} value={`${m} ${y}`}>{m} {y}</option>
                )).flat()}
              </select>
            </div>
            <div className="form-group" style={{display:'flex', alignItems:'flex-end', gap:8}}>
              <button className="btn btn-primary" onClick={handleLockPeriod}><Lock size={14} /> Kunci</button>
            </div>
          </div>
          {lockedPeriods.length > 0 && (
            <div style={{marginTop:12}}>
              <label className="form-label">Periode Terkunci:</label>
              <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:4}}>
                {lockedPeriods.map(p => (
                  <div key={p} style={{display:'flex', alignItems:'center', gap:4, padding:'4px 10px', background:'var(--bg-secondary)', borderRadius:6, fontSize:13}}>
                    <Lock size={12} color="var(--warning)" />
                    {p}
                    <button onClick={() => handleUnlockPeriod(p)} style={{background:'none', border:'none', cursor:'pointer', color:'var(--danger)', padding:0, marginLeft:4}} title="Buka kunci">
                      <Unlock size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      <div className="card">
        <div className="table-container">
          {/* Flat Excel-style view: flatten all journal_lines into rows */}
          {(() => {
            // Flatten all journal_lines from filtered journals into a single flat list
            const flatLines = []
            const sortedJournals = [...filtered].sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || ''))
            sortedJournals.forEach(j => {
              const jLines = j.journal_lines || []
              if (jLines.length > 0) {
                jLines.forEach((line, idx) => {
                  flatLines.push({ ...line, _journal: j, _isFirst: idx === 0, _groupSize: jLines.length, _lineIdx: idx })
                })
              } else {
                // Legacy entries without journal_lines — create 2 synthetic lines
                const parseAcct = (raw) => {
                  const s = raw || ''
                  const gt = s.indexOf(' > ')
                  let main = s, sub = ''
                  if (gt >= 0) { main = s.slice(0, gt); sub = s.slice(gt + 3) }
                  const sp = main.indexOf(' ')
                  return { code: sp > 0 ? main.slice(0, sp) : '', name: sp > 0 ? main.slice(sp + 1) : main, sub }
                }
                const dA = parseAcct(j.akun_debit)
                const kA = parseAcct(j.akun_kredit)
                flatLines.push({
                  tanggal: j.tanggal, bukti: j.bukti || '', akun_code: dA.code, akun_name: dA.name,
                  sub_akun: dA.sub, debit: j.debit, kredit: null, keterangan: j.keterangan,
                  _journal: j, _isFirst: true, _groupSize: 2, _lineIdx: 0
                })
                flatLines.push({
                  tanggal: j.tanggal, bukti: j.bukti || '', akun_code: kA.code, akun_name: kA.name,
                  sub_akun: kA.sub, debit: null, kredit: j.kredit, keterangan: j.keterangan,
                  _journal: j, _isFirst: false, _groupSize: 2, _lineIdx: 1
                })
              }
            })

            const fDate = (d) => { if (!d) return '-'; const t = new Date(d); return `${t.getDate()}/${t.getMonth()+1}/${t.getFullYear()}` }
            const totalD = flatLines.reduce((s, l) => s + (l.debit != null ? l.debit : 0), 0)
            const totalK = flatLines.reduce((s, l) => s + (l.kredit != null ? l.kredit : 0), 0)

            return (
              <table className="report-table" style={{ fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border)' }}>
                    <th style={{ width: 34, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        disabled={selectableIds.length === 0}
                        title="Pilih semua transaksi"
                        style={{ cursor: 'pointer', width: 15, height: 15, verticalAlign: 'middle' }}
                      />
                    </th>
                    <th style={{ width: 90 }}>Tgl</th>
                    <th style={{ width: 70 }}>No. Akun</th>
                    <th style={{ minWidth: 200 }}>Akun</th>
                    <th style={{ minWidth: 180 }}>Sub Akun</th>
                    <th className="text-right" style={{ width: 130 }}>D</th>
                    <th className="text-right" style={{ width: 130 }}>K</th>
                    <th style={{ minWidth: 200 }}>Keterangan</th>
                    <th style={{ width: 168 }}>Aksi</th>
                  </tr>
                  <tr style={{ background: 'rgba(59,130,246,0.05)', fontWeight: 700, fontSize: 12 }}>
                    <td colSpan={5} className="text-right">TOTAL ({flatLines.length} baris, {filtered.length} transaksi)</td>
                    <td className="text-right mono">{formatRupiah(totalD)}</td>
                    <td className="text-right mono">{formatRupiah(totalK)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </thead>
                <tbody>
                  {flatLines.length === 0 && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Tidak ada jurnal ditemukan</td></tr>
                  )}
                  {flatLines.map((line, idx) => {
                    const j = line._journal
                    const locked = isDateLocked(j.tanggal)
                    const sty = locked ? { opacity: 0.7 } : {}
                    const isLastInGroup = line._lineIdx === line._groupSize - 1

                    // Format D and K exactly like Excel:
                    // null = blank (empty cell), number = show value (including 0)
                    const dDisplay = line.debit !== null && line.debit !== undefined
                      ? (line.debit === 0 ? '0' : formatRupiah(line.debit))
                      : ''
                    const kDisplay = line.kredit !== null && line.kredit !== undefined
                      ? (line.kredit === 0 ? '0' : formatRupiah(line.kredit))
                      : ''

                    return (
                      <tr key={`flat-${idx}`} style={{
                        ...sty,
                        borderBottom: isLastInGroup ? '2px solid var(--border)' : '1px solid rgba(var(--border-rgb, 200,200,200), 0.3)',
                      }}>
                        {line._isFirst && (
                          <td rowSpan={line._groupSize} style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(j.id)}
                              onChange={() => toggleSelect(j.id)}
                              disabled={locked}
                              title={locked ? 'Periode terkunci' : `Pilih ${j.id}`}
                              style={{ cursor: locked ? 'not-allowed' : 'pointer', width: 15, height: 15 }}
                            />
                          </td>
                        )}
                        <td style={{ whiteSpace: 'nowrap', fontWeight: 600, fontSize: 12 }}>
                          {fDate(line.tanggal || j.tanggal)}
                          {locked && <> <Lock size={10} color="var(--warning)" /></>}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{line.bukti || ''}</td>
                        <td style={{ fontSize: 13 }}>{line.akun_name}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{line.sub_akun || ''}</td>
                        <td className="text-right mono" style={{
                          fontWeight: (line.debit != null && line.debit > 0) ? 600 : 400,
                          color: (line.debit != null && line.debit > 0) ? 'var(--success)' : 'var(--text-muted)',
                        }}>
                          {dDisplay}
                        </td>
                        <td className="text-right mono" style={{
                          fontWeight: (line.kredit != null && line.kredit > 0) ? 600 : 400,
                          color: (line.kredit != null && line.kredit > 0) ? 'var(--primary)' : 'var(--text-muted)',
                        }}>
                          {kDisplay}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {line.keterangan || ''}
                          {line._isFirst && j.tipe_transaksi && j.tipe_transaksi !== 'transfer' && (
                            <span style={{
                              display: 'inline-block', marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: 10,
                              fontWeight: 600, verticalAlign: 'middle',
                              background: j.tipe_transaksi === 'pendapatan' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                              color: j.tipe_transaksi === 'pendapatan' ? '#10B981' : '#EF4444',
                            }}>
                              {j.tipe_transaksi === 'pendapatan' ? '💰 IN' : '💸 OUT'}
                            </span>
                          )}
                        </td>
                        {line._isFirst && (() => {
                          const actBtn = { background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center' }
                          const isPosted = j.status === 'posted'
                          return (
                            <td rowSpan={line._groupSize} style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button style={actBtn} title="Lihat detail" onClick={() => setShowDetail(j)}><Eye size={14} /></button>
                                <button style={{ ...actBtn, opacity: (isPosted || locked) ? 0.4 : 1 }} title={isPosted ? 'Tidak bisa edit (posted)' : 'Edit'} disabled={isPosted || locked} onClick={() => openEdit(j)}><Edit2 size={14} /></button>
                                {isPosted
                                  ? <button style={{ ...actBtn, color: 'var(--warning)', opacity: locked ? 0.4 : 1 }} title="Batalkan Approve" disabled={locked} onClick={() => handleUnapprove(j.id)}><XCircle size={14} /></button>
                                  : <button style={{ ...actBtn, color: 'var(--success)' }} title="Approve (Posting)" onClick={() => handleApprove(j.id)}><Check size={14} /></button>}
                                <button style={actBtn} title="Salin" onClick={() => handleCopy(j.id)}><Copy size={14} /></button>
                                <button style={{ ...actBtn, color: 'var(--danger)', opacity: locked ? 0.4 : 1 }} title="Hapus" disabled={locked} onClick={() => setShowDeleteConfirm(j.id)}><Trash2 size={14} /></button>
                              </div>
                            </td>
                          )
                        })()}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          })()}
        </div>
      </div>




      {/* ADD/EDIT MODAL */}
      {showModal && (
        <Modal
          title={editId ? 'Edit Jurnal' : 'Buat Jurnal Baru'}
          onClose={() => setShowModal(false)}
          width={1040}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Batal</button>
              <button className="btn btn-primary" disabled={!isFormValid} onClick={handleSave}>{editId ? 'Simpan Perubahan' : 'Simpan Jurnal'}</button>
            </>
          }
        >
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tanggal</label>
              <input className="form-input" type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="pending">Pending</option>
                <option value="posted">Posted</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Keterangan</label>
            <input className="form-input" placeholder="Deskripsi transaksi..." value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} />
          </div>

          {/* Tipe Transaksi — auto-detected with manual override */}
          <div style={{ marginTop: 8 }}>
            <label className="form-label" style={{ marginBottom: 6 }}>Tipe Transaksi (untuk Arus Kas) <span style={{ color: 'var(--danger)' }}>*</span>{!form.tipe_transaksi && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}> — wajib dipilih</span>}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'pendapatan', label: '💰 Pendapatan', color: '#10B981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.4)' },
                { value: 'pengeluaran', label: '💸 Pengeluaran', color: '#EF4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.4)' },
                { value: 'transfer', label: '🔄 Transfer', color: '#6366F1', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.4)' },
              ].map(opt => {
                const autoDetected = detectTipeTransaksi(form.debitRows, form.kreditRows)
                const isActive = form.tipe_transaksi === opt.value
                const isAuto = !form.tipe_transaksi && autoDetected === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm({ ...form, tipe_transaksi: opt.value })}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                      border: `2px ${isAuto ? 'dashed' : 'solid'} ${isActive ? opt.border : (isAuto ? opt.border : 'var(--border)')}`,
                      background: isActive ? opt.bg : 'transparent',
                      color: isActive ? opt.color : (isAuto ? opt.color : 'var(--text-muted)'),
                      fontWeight: isActive ? 700 : 400, fontSize: 13,
                      transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}
                  >
                    {opt.label}
                    {isAuto && <span style={{ fontSize: 10, opacity: 0.7 }}>(saran)</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Multi-line entry: Debit & Kredit sections */}
          {[
            { side: 'd', key: 'debitRows', label: 'Akun Debit', badge: 'D', badgeClass: 'green', color: 'var(--success)', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.2)' },
            { side: 'k', key: 'kreditRows', label: 'Akun Kredit', badge: 'K', badgeClass: 'blue', color: 'var(--primary)', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.2)' },
          ].map(sec => (
            <div key={sec.side} style={{ marginTop: sec.side === 'd' ? 8 : 12, padding: 12, borderRadius: 8, background: sec.bg, border: `1px solid ${sec.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge ${sec.badgeClass}`} style={{ fontSize: 11 }}>{sec.badge}</span>
                  <strong style={{ fontSize: 13, color: sec.color }}>{sec.label}</strong>
                </div>
                <button className="btn btn-outline" style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => addFormRow(sec.side)}><Plus size={12} /> Tambah Baris</button>
              </div>
              {form[sec.key].map((row, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px 34px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    {idx === 0 && <label className="form-label">Akun</label>}
                    <SearchableSelect
                      value={row.akun}
                      onChange={val => updateRow(sec.side, idx, { akun: val, sub: '' })}
                      options={akunOptions}
                      placeholder={`Akun ${sec.side === 'd' ? 'debit' : 'kredit'}...`}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    {idx === 0 && <label className="form-label">Sub Akun</label>}
                    <SearchableSelect
                      value={row.sub}
                      onChange={val => updateRow(sec.side, idx, { sub: val })}
                      options={getSubAkunOptions(row.akun)}
                      placeholder={row.akun ? 'Sub akun...' : 'Pilih akun dulu...'}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    {idx === 0 && <label className="form-label">Deskripsi Baris</label>}
                    <input
                      className="form-input"
                      placeholder="Deskripsi per baris (opsional)..."
                      value={row.ket || ''}
                      onChange={e => updateRow(sec.side, idx, { ket: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    {idx === 0 && <label className="form-label">Jumlah (Rp)</label>}
                    <input className="form-input" type="number" placeholder="0" value={row.jumlah} onChange={e => updateRow(sec.side, idx, { jumlah: e.target.value })} />
                  </div>
                  <button className="btn btn-outline" style={{ padding: 7, color: 'var(--danger)' }} disabled={form[sec.key].length === 1} onClick={() => removeFormRow(sec.side, idx)} title="Hapus baris"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          ))}

          {/* Balance indicator */}
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 13, background: formBalanced ? 'rgba(16,185,129,0.08)' : 'rgba(229,77,66,0.08)', border: `1px solid ${formBalanced ? 'rgba(16,185,129,0.3)' : 'rgba(229,77,66,0.3)'}` }}>
            <span>Total Debit: <strong className="mono" style={{ color: 'var(--success)' }}>{formatRupiah(formTotalDebit)}</strong></span>
            <span>Total Kredit: <strong className="mono" style={{ color: 'var(--primary)' }}>{formatRupiah(formTotalKredit)}</strong></span>
            <span style={{ fontWeight: 700, color: formBalanced ? 'var(--success)' : 'var(--danger)' }}>
              {formBalanced ? '✓ Seimbang' : `Selisih ${formatRupiah(Math.abs(formTotalDebit - formTotalKredit))}`}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Prinsip akuntansi: setiap jurnal harus seimbang (Total Debit = Total Kredit). Tambah baris untuk transaksi multi-akun.
          </div>
        </Modal>
      )}

      {/* DELETE CONFIRMATION */}
      {showDeleteConfirm && (
        <Modal title="Konfirmasi Hapus" onClose={() => setShowDeleteConfirm(null)} footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowDeleteConfirm(null)}>Batal</button>
            <button className="btn btn-danger" onClick={() => handleDelete(showDeleteConfirm)}>Hapus Jurnal</button>
          </>
        }>
          <p>Apakah Anda yakin ingin menghapus jurnal <strong>{showDeleteConfirm}</strong>?</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>Tindakan ini tidak dapat dibatalkan.</p>
        </Modal>
      )}

      {/* BULK DELETE CONFIRMATION (terpilih / semua per bulan) */}
      {showBulkDelete && (() => {
        const isMonth = showBulkDelete === 'month'
        const targets = isMonth ? monthJournals : filtered.filter(j => selectedVisible.includes(j.id))
        const nPosted = targets.filter(j => j.status === 'posted').length
        const nPending = targets.length - nPosted
        return (
          <Modal
            title={isMonth ? `Hapus Semua Jurnal — ${monthFilterLabel}` : `Hapus ${targets.length} Jurnal Terpilih`}
            onClose={() => !bulkDeleting && setShowBulkDelete(null)}
            footer={
              <>
                <button className="btn btn-outline" disabled={bulkDeleting} onClick={() => setShowBulkDelete(null)}>Batal</button>
                <button className="btn btn-danger" disabled={bulkDeleting} onClick={isMonth ? handleDeleteMonth : handleDeleteSelected}>
                  {bulkDeleting ? 'Menghapus...' : `Hapus ${targets.length} Jurnal`}
                </button>
              </>
            }
          >
            {isMonth ? (
              <p>
                Anda akan menghapus <strong>SEMUA {targets.length} jurnal</strong> di bulan{' '}
                <strong>{monthFilterLabel}</strong> — termasuk jurnal yang tidak tampil karena
                filter status/pencarian.
              </p>
            ) : (
              <p>Anda akan menghapus <strong>{targets.length} jurnal</strong> yang dicentang.</p>
            )}
            <p style={{ marginTop: 8, fontSize: 13 }}>
              {nPosted} posted · {nPending} pending
            </p>
            {nPosted > 0 && (
              <p style={{ marginTop: 8, fontSize: 13, color: 'var(--warning)' }}>
                ⚠ Jurnal berstatus <strong>posted</strong> ikut terhapus — angka Buku Besar,
                Neraca, Laba Rugi, dan LRA akan berubah.
              </p>
            )}
            {isMonth && monthBaselineCount > 0 && (
              <p style={{ marginTop: 8, fontSize: 13, color: 'var(--danger)' }}>
                ⚠ Termasuk <strong>{monthBaselineCount} jurnal baseline audited</strong> (XL-/SUM-/ADJ-/CAS-).
                Menghapusnya mengosongkan Buku Besar bulan ini; muat ulang lewat
                &quot;Muat Snapshot Laporan Audited&quot; / upload lampiran jika diperlukan kembali.
              </p>
            )}
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>Tindakan ini tidak dapat dibatalkan.</p>
          </Modal>
        )
      })()}

      {/* DETAIL MODAL */}
      {showDetail && (() => {
        // Parse sub-accounts for detail modal
        const parseParts = (raw) => {
          const s = raw || ''
          const gtIdx = s.indexOf(' > ')
          let main = s, sub = ''
          if (gtIdx >= 0) { main = s.slice(0, gtIdx); sub = s.slice(gtIdx + 3) }
          const dashIdx = main.indexOf(' - ')
          const spaceIdx = main.indexOf(' ')
          const code = dashIdx > 0 ? main.slice(0, dashIdx) : (spaceIdx > 0 ? main.slice(0, spaceIdx) : main)
          const name = dashIdx > 0 ? main.slice(dashIdx + 3) : (spaceIdx > 0 ? main.slice(spaceIdx + 1) : '')
          return { code, name, sub }
        }
        const dd = parseParts(showDetail.akun_debit)
        const kk = parseParts(showDetail.akun_kredit)
        const DAYS_FULL = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']
        const dt = new Date(showDetail.tanggal)
        const dateFormatted = `${String(dt.getDate()).padStart(2,'0')} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()} (${DAYS_FULL[dt.getDay()]})`

        return (
        <Modal title={`Detail ${showDetail.id}`} onClose={() => setShowDetail(null)} width={640} footer={
          <button className="btn btn-outline" onClick={() => setShowDetail(null)}>Tutup</button>
        }>
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="form-row">
              <div><span className="form-label">No. Jurnal</span><p className="mono" style={{fontWeight:600}}>{showDetail.id}</p></div>
              <div><span className="form-label">Tanggal</span><p style={{fontWeight:600}}>{dateFormatted}</p></div>
            </div>
            <div><span className="form-label">Keterangan</span><p>{showDetail.keterangan}</p></div>

            {/* Debit/Kredit details */}
            {(showDetail.journal_lines || []).length > 0 ? (
              <>
                {/* Multi-line debit details */}
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span className="badge green" style={{ fontSize: 10 }}>DEBIT</span>
                    <strong style={{ fontSize: 13, color: 'var(--success)' }}>{formatRupiah(showDetail.debit)}</strong>
                  </div>
                  {showDetail.journal_lines.filter(l => l.debit > 0).map((l, idx) => (
                    <div key={idx} style={{ marginBottom: 6, paddingLeft: 8, borderLeft: '2px solid rgba(16,185,129,0.3)' }}>
                      <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                        <span>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>{l.akun_code}</span>
                          {l.akun_name}
                        </span>
                        <strong className="mono" style={{ color: 'var(--success)' }}>{formatRupiah(l.debit)}</strong>
                      </div>
                      {l.sub_akun && (
                        <div style={{ paddingLeft: 16, fontSize: 12, color: 'var(--success)', fontWeight: 500 }}>
                          ▸ {l.sub_akun}
                        </div>
                      )}
                      {l.keterangan && (
                        <div style={{ paddingLeft: 16, fontSize: 11, color: 'var(--text-muted)' }}>{l.keterangan}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Multi-line kredit details */}
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span className="badge blue" style={{ fontSize: 10 }}>KREDIT</span>
                    <strong style={{ fontSize: 13, color: 'var(--primary)' }}>{formatRupiah(showDetail.kredit)}</strong>
                  </div>
                  {showDetail.journal_lines.filter(l => l.kredit > 0).map((l, idx) => (
                    <div key={idx} style={{ marginBottom: 6, paddingLeft: 8, borderLeft: '2px solid rgba(59,130,246,0.3)' }}>
                      <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                        <span>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>{l.akun_code}</span>
                          {l.akun_name}
                        </span>
                        <strong className="mono" style={{ color: 'var(--primary)' }}>{formatRupiah(l.kredit)}</strong>
                      </div>
                      {l.sub_akun && (
                        <div style={{ paddingLeft: 16, fontSize: 12, color: 'var(--primary)', fontWeight: 500 }}>
                          ▸ {l.sub_akun}
                        </div>
                      )}
                      {l.keterangan && (
                        <div style={{ paddingLeft: 16, fontSize: 11, color: 'var(--text-muted)' }}>{l.keterangan}</div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Legacy single debit/kredit detail */}
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span className="badge green" style={{ fontSize: 10 }}>DEBIT</span>
                    <strong style={{ fontSize: 13, color: 'var(--success)' }}>{formatRupiah(showDetail.debit)}</strong>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>{dd.code}</span>
                    {dd.name}
                  </div>
                  {dd.sub && (
                    <div style={{ marginTop: 4, paddingLeft: 16, fontSize: 12, color: 'var(--success)', fontWeight: 500 }}>
                      ▸ Sub: {dd.sub}
                    </div>
                  )}
                </div>

                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span className="badge blue" style={{ fontSize: 10 }}>KREDIT</span>
                    <strong style={{ fontSize: 13, color: 'var(--primary)' }}>{formatRupiah(showDetail.kredit)}</strong>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>{kk.code}</span>
                    {kk.name}
                  </div>
                  {kk.sub && (
                    <div style={{ marginTop: 4, paddingLeft: 16, fontSize: 12, color: 'var(--primary)', fontWeight: 500 }}>
                      ▸ Sub: {kk.sub}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="form-row">
              <div><span className="form-label">Status</span><span className={`badge ${showDetail.status === 'posted' ? 'green' : 'orange'}`}>{showDetail.status === 'posted' ? 'Posted' : 'Pending'}</span></div>
              {showDetail.bukti && <div><span className="form-label">No. Bukti</span><p className="mono">{showDetail.bukti}</p></div>}
            </div>
            {isDateLocked(showDetail.tanggal) && (
              <div style={{padding:'8px 12px', background:'rgba(245,158,11,0.1)', borderRadius:8, fontSize:13, color:'var(--warning)', display:'flex', alignItems:'center', gap:6}}>
                <Lock size={14} /> Jurnal ini berada di periode yang terkunci
              </div>
            )}
          </div>
        </Modal>
        )
      })()}

      {/* CEK SELISIH MODAL */}
      {showSelisih && (
        <Modal title="Cek Selisih Jurnal" onClose={() => setShowSelisih(false)} width={700} footer={
          <button className="btn btn-outline" onClick={() => setShowSelisih(false)}>Tutup</button>
        }>
          <div style={{display:'grid', gap:16}}>
            {/* Overall Balance Check */}
            <div style={{padding:16, borderRadius:8, background: selisihData.isBalanced ? 'var(--success-light)' : 'rgba(229,77,66,0.1)', display:'flex', alignItems:'center', gap:12}}>
              {selisihData.isBalanced ? <Check size={20} color="var(--success)" /> : <AlertTriangle size={20} color="var(--danger)" />}
              <div>
                <div style={{fontWeight:600, color: selisihData.isBalanced ? 'var(--success)' : 'var(--danger)'}}>
                  {selisihData.isBalanced ? '✓ Jurnal Balance — Total Debit = Total Kredit' : '✗ Jurnal Tidak Balance!'}
                </div>
                <div style={{fontSize:12, color:'var(--text-muted)', marginTop:2}}>Total Debit: {formatRupiah(selisihData.totalDebit)} | Total Kredit: {formatRupiah(selisihData.totalKredit)}</div>
              </div>
            </div>

            {/* AR/AP Sync Check */}
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <div style={{padding:14, borderRadius:8, border:'1px solid var(--border)'}}>
                <div style={{fontWeight:600, marginBottom:8, display:'flex', alignItems:'center', gap:6}}>
                  {selisihData.arMatch ? <Check size={14} color="var(--success)" /> : <AlertTriangle size={14} color="var(--warning)" />}
                  Piutang (AR)
                </div>
                <div style={{fontSize:13, display:'grid', gap:4}}>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span>Modul Piutang:</span><span className="mono" style={{fontWeight:600}}>{formatRupiah(selisihData.totalAR)}</span></div>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span>Jurnal (11201):</span><span className="mono" style={{fontWeight:600}}>{formatRupiah(selisihData.journalAR)}</span></div>
                  <div style={{borderTop:'1px solid var(--border-light)', paddingTop:4, marginTop:4, display:'flex', justifyContent:'space-between'}}>
                    <span>Selisih:</span>
                    <span className="mono" style={{fontWeight:700, color: selisihData.arMatch ? 'var(--success)' : 'var(--warning)'}}>{formatRupiah(selisihData.totalAR - selisihData.journalAR)}</span>
                  </div>
                </div>
              </div>
              <div style={{padding:14, borderRadius:8, border:'1px solid var(--border)'}}>
                <div style={{fontWeight:600, marginBottom:8, display:'flex', alignItems:'center', gap:6}}>
                  {selisihData.apMatch ? <Check size={14} color="var(--success)" /> : <AlertTriangle size={14} color="var(--warning)" />}
                  Hutang (AP)
                </div>
                <div style={{fontSize:13, display:'grid', gap:4}}>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span>Modul Hutang:</span><span className="mono" style={{fontWeight:600}}>{formatRupiah(selisihData.totalAP)}</span></div>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span>Jurnal (21101):</span><span className="mono" style={{fontWeight:600}}>{formatRupiah(selisihData.journalAP)}</span></div>
                  <div style={{borderTop:'1px solid var(--border-light)', paddingTop:4, marginTop:4, display:'flex', justifyContent:'space-between'}}>
                    <span>Selisih:</span>
                    <span className="mono" style={{fontWeight:700, color: selisihData.apMatch ? 'var(--success)' : 'var(--warning)'}}>{formatRupiah(selisihData.totalAP - selisihData.journalAP)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Imbalanced entries */}
            {selisihData.imbalanced.length > 0 && (
              <div>
                <div style={{fontWeight:600, marginBottom:8, color:'var(--danger)'}}>Jurnal Tidak Balance ({selisihData.imbalanced.length})</div>
                <table>
                  <thead><tr><th>No.</th><th>Keterangan</th><th className="text-right">Debit</th><th className="text-right">Kredit</th><th className="text-right">Selisih</th></tr></thead>
                  <tbody>
                    {selisihData.imbalanced.map(j => (
                      <tr key={j.id}>
                        <td className="mono">{j.id}</td>
                        <td>{j.keterangan}</td>
                        <td className="text-right mono">{formatRupiah(j.debit)}</td>
                        <td className="text-right mono">{formatRupiah(j.kredit)}</td>
                        <td className="text-right mono" style={{color:'var(--danger)', fontWeight:600}}>{formatRupiah(j.debit - j.kredit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{fontSize:12, color:'var(--text-muted)', padding:'8px 12px', background:'var(--bg-secondary)', borderRadius:6}}>
              💡 Perbedaan antara modul dan jurnal menunjukkan transaksi yang belum di-sinkronkan ke buku besar.
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
