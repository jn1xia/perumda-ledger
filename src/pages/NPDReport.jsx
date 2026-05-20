import { useState, useMemo } from 'react'
import { FileText, Search, Download, Printer, ChevronDown, ChevronRight, Calendar, Filter, BarChart3, Wallet, TrendingDown, Eye, X } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { MONTHS, PERIOD_PRESETS, periodValueToMonths } from '../utils/journalFilters.js'
import { exportXLSX } from '../utils/exportUtils.js'

// ─────────────────────────────────────────────
// URAIAN LOOKUP: kode → descriptive label
// ─────────────────────────────────────────────
const URAIAN_UMUM = {
  '1.1': 'Gaji Direksi',
  '1.2': 'Gaji Pokok Karyawan',
  '1.3': 'Honor Dewan Pengawas (Ketua + Anggota + Sekretaris)',
  '2.1': 'Tunjangan Jabatan',
  '2.2': 'Tunjangan Fungsional (Koordinator)',
  '2.3': 'Tunjangan Transportasi',
  '2.4': 'Tunjangan Makan',
  '2.5': 'Tunjangan Kesehatan (JKN)',
  '2.6': 'Tunjangan Ketenagakerjaan (JKK, JKM & JHT)',
  '2.7': 'Tunjangan Hari Raya Keagamaan (THR)',
  '2.8': 'Tunjangan Representatif Direktur',
  '2.9': 'Tunjangan Pajak Penghasilan (PPh 21)',
  '3.1': 'Pakaian Adat Direksi',
  '3.2': 'PSL Direksi',
  '3.3': 'PDH Karyawan',
  '3.4': 'Kain Sasirangan (Karyawan + Direksi + Dewas)',
  '3.5': 'Pakaian Adat Ketua Dewan Pengawas',
  '3.6': 'Seragam Loket',
  '4.1': 'Beban Alat Tulis Kantor (ATK)',
  '4.2': 'Beban Benda Pos',
  '4.3': 'Pembuatan Stempel',
  '5.1': 'Biaya Telepon',
  '5.2': 'Biaya Air',
  '5.3': 'Biaya Listrik',
  '5.4': 'Biaya WiFi / Internet',
  '5.5': 'Biaya Website dan Aplikasi',
  '6.1': 'Makan Minum Rapat',
  '6.2': 'Makan Minum Kunjungan Tamu / Sosialisasi Pedagang',
  '6.3': 'Makan Minum Aktivitas Lapangan',
  '6.4': 'Makan Minum Kegiatan Kantor',
  '7.1': 'Pemeliharaan Perlengkapan dan Peralatan Kantor',
  '7.2': 'Pemeliharaan Instalasi Listrik dan Air',
  '7.3': 'Pemeliharaan Bangunan Gedung Kantor (termasuk asuransi)',
  '8.1': 'BBM Mobil Operasional',
  '8.2': 'BBM Mobil Keliling',
  '8.3': 'BBM Truck',
  '8.4': 'BBM Pickup',
  '8.5': 'BBM Genset & Mesin Cacah',
  '8.6': 'BBM Ketua Dewan Pengawas',
  '9.1': 'Beban Perjalanan Dinas Karyawan',
  '9.2': 'Beban Perjalanan Dinas Dewan Pengawas',
  '10.1': 'Diklat / Bimtek Direksi dan Karyawan',
  '10.2': 'Diklat / Bimtek Dewan Pengawas',
  '10.3': 'Diklat / Bimtek / Pelatihan Pedagang',
  '12.1': 'Beban Konsultan Rencana Bisnis',
  '12.2': 'Beban Seleksi Pegawai',
  '12.3': 'Beban Audit Laporan Keuangan / Pendampingan KAP',
  '12.4': 'Beban Kajian Penyesuaian Tarif',
  '12.5': 'Beban Pendataan Pedagang',
  '13.1': 'Biaya Kegiatan Kelembagaan',
  '13.2': 'Honorarium Narasumber',
  '13.3': 'Biaya Bingkisan Lebaran Karyawan',
  '13.4': 'Biaya Transportasi Rapat',
  '13.5': 'Biaya Jilid Laporan',
  '13.6': 'Biaya Parkir Karyawan',
  '13.7': 'Pembuatan Video Profil Perumda',
  '13.8': 'Kegiatan 17 Agustusan',
  '13.9': 'Buka Puasa Bersama',
  '13.10': 'Pembuatan Souvenir Perumda',
  '13.11': 'Biaya Sayembara Logo Perusahaan',
  '13.12': 'Kegiatan Olahraga Karyawan',
  '13.13': 'Peringatan Hari Jadi Kota Banjarmasin (Tanglong / Jukung Hias)',
  '13.14': 'Peringatan HUT Perumda ke-1',
}

const URAIAN_INVESTASI = {
  '1.1': 'Pengembangan Pasar Percontohan Standar Nasional Indonesia (SNI) — 1 Pasar',
  '1.2': 'Tata Letak Display Produk Dalam Pasar (Pasar Berlantai Dua)',
  '1.3': 'Perbaikan dan Pengadaan Sarana Pengelolaan Pasar',
  '1.4': 'Pengembangan Wisata Pasar Tematik (Produk-Produk Khusus)',
  '1.5': 'Revitalisasi atau Pembangunan Pasar',
  '1.6': 'Perbaikan Akses Jalan Menuju Pasar (Pedestrian, Lampu Jalan, Angkutan Umum)',
  '2.1': 'Perbaikan Gudang Bapok (Telawang / Sudirapi / Teluk Dalam / Pekauman)',
  '3.1': 'Pengadaan Sarana Studio Live Selling',
  '3.2': 'Sarana Tempat Layanan Pengiriman Barang',
  '4.1': 'Prasarana Tempat Event Khusus, Ruang Kreasi Komunitas, Hobi, Olahraga dan Fashion',
  '4.2': 'Revitalisasi Kawasan Food Court dan Lahan Lainnya',
  '4.3': 'Pengadaan Sarana Gerai Inflasi',
  '4.4': 'Prasarana Tempat Iklan / Reklame / Promosi',
  '4.5': 'Mesin Isi Ulang Air Galon',
  '4.6': 'Pengadaan Tabung Gas LPG',
  '5.1': 'Pengembangan Sistem Informasi Akuntansi',
  '5.2': 'Alat Pembayaran Digital / Tap Kartu',
  '6.1': 'Renovasi Gedung Kantor',
  '6.2': 'Pengadaan Perlengkapan Kantor',
  '7.1': 'Pengadaan Stok Barang — Perdagangan Bahan Pokok dan Penting',
  '7.2': 'Pengadaan Stok Barang — Gerai Inflasi',
}

const URAIAN_OPERASIONAL = {
  '4.1': 'Beban Pokok Perdagangan Bahan Pokok dan Penting',
  '4.2': 'Beban Pokok Gerai Inflasi',
  '1.1': 'Beban Pokok Perdagangan Bahan Pokok dan Penting',
  '1.2': 'Beban Pokok Gerai Inflasi',
}

// Section group labels per category
const GROUP_UMUM = {
  '1': 'I. Gaji Personalia',
  '2': 'II. Tunjangan',
  '3': 'III. Pakaian Dinas',
  '4': 'IV. Alat Tulis Kantor & Perlengkapan',
  '5': 'V. Utilitas (Telepon, Air, Listrik, Internet)',
  '6': 'VI. Konsumsi (Makan & Minum)',
  '7': 'VII. Pemeliharaan',
  '8': 'VIII. Bahan Bakar Minyak (BBM)',
  '9': 'IX. Perjalanan Dinas',
  '10': 'X. Pendidikan & Pelatihan',
  '12': 'XII. Jasa Konsultansi & Profesional',
  '13': 'XIII. Kegiatan Umum & Kelembagaan',
}

const GROUP_INVESTASI = {
  '1': 'I. Pengembangan & Revitalisasi Pasar',
  '2': 'II. Gudang Bahan Pokok (Bapok)',
  '3': 'III. Studio Live Selling & Pengiriman',
  '4': 'IV. Fasilitas Event, Bisnis & Kuliner',
  '5': 'V. Teknologi Informasi',
  '6': 'VI. Gedung Kantor',
  '7': 'VII. Modal Kerja (Stok Barang)',
}

const GROUP_OPERASIONAL = {
  '4': 'IV. Beban Pokok Penjualan',
  '1': 'I. Beban Pokok Penjualan',
}

// Category mapping
const KATEGORI_MAP = {
  'bebanInvestasi': 'Investasi',
  'bebanOperasional': 'Beban Operasional',
  'bebanUmum': 'Beban Umum & Administrasi',
}

const KATEGORI_COLORS = {
  'Investasi': { bg: 'rgba(99,102,241,0.08)', border: '#6366f1', text: '#6366f1', icon: '🏗️' },
  'Beban Operasional': { bg: 'rgba(245,158,11,0.08)', border: '#f59e0b', text: '#d97706', icon: '⚙️' },
  'Beban Umum & Administrasi': { bg: 'rgba(16,185,129,0.08)', border: '#10b981', text: '#059669', icon: '🏢' },
}

function getUraian(kategoriKey, kode) {
  if (kategoriKey === 'bebanUmum') return URAIAN_UMUM[kode] || kode
  if (kategoriKey === 'bebanInvestasi') return URAIAN_INVESTASI[kode] || kode
  if (kategoriKey === 'bebanOperasional') return URAIAN_OPERASIONAL[kode] || kode
  return kode
}

function getGroup(kategoriKey, kode) {
  const section = kode.split('.')[0]
  if (kategoriKey === 'bebanUmum') return GROUP_UMUM[section] || `${section}.`
  if (kategoriKey === 'bebanInvestasi') return GROUP_INVESTASI[section] || `${section}.`
  if (kategoriKey === 'bebanOperasional') return GROUP_OPERASIONAL[section] || `${section}.`
  return `${section}.`
}

const MONTH_NAMES = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

const ROMAN_MONTHS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

// ─────────────────────────────────────────────
// NPD DOCUMENT MODAL — formal view
// ─────────────────────────────────────────────
function NPDDocumentModal({ npd, onClose }) {
  if (!npd) return null
  const katStyle = KATEGORI_COLORS[npd.kategori] || {}
  const totalAnggaran = (npd.lineItems || []).reduce((s, li) => s + li.anggaran, 0)
  const totalAkumulasi = (npd.lineItems || []).reduce((s, li) => s + li.akumulasi, 0)
  const totalPencairan = (npd.lineItems || []).reduce((s, li) => s + li.pencairan, 0)
  const totalSisa = (npd.lineItems || []).reduce((s, li) => s + li.sisa, 0)

  // Group line items by section
  const groups = {}
  ;(npd.lineItems || []).forEach(li => {
    const g = li.group || 'Lainnya'
    if (!groups[g]) groups[g] = []
    groups[g].push(li)
  })

  let lineNo = 0

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'var(--bg-primary)', borderRadius: 14, width: '100%', maxWidth: 900, boxShadow: '0 24px 64px rgba(0,0,0,0.4)', border: '1px solid var(--border)' }}>
        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', borderRadius: '14px 14px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={18} color={katStyle.border || 'var(--primary)'} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>Nota Pencairan Dana — {npd.npdNomor}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-outline" onClick={() => window.print()}><Printer size={14} /> Cetak</button>
            <button className="btn btn-sm btn-outline" onClick={onClose}><X size={14} /></button>
          </div>
        </div>

        {/* NPD Document body */}
        <div style={{ padding: '24px 28px' }}>
          {/* Company header */}
          <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.5 }}>PERUSAHAAN UMUM DAERAH PASAR BAIMAN</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Kota Banjarmasin — NPWP: 01.234.567.8-901.000</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 10, padding: '4px 0' }}>NOTA PENCAIRAN DANA (NPD)</div>
          </div>

          {/* NPD info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', marginBottom: 20, fontSize: 13 }}>
            {[
              ['Nomor NPD', npd.npdNomor],
              ['Tanggal', `${npd.tanggal ? new Date(npd.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'}`],
              ['Kategori Beban', npd.kategori],
              ['Sub Kegiatan', npd.subKegiatan],
              ['Periode', `${MONTH_NAMES[npd.bulan]} ${npd.tahun}`],
              ['Jumlah Diminta', formatRupiah(npd.jumlahDiminta)],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px dashed var(--border-light)' }}>
                <span style={{ color: 'var(--text-muted)', width: 140, flexShrink: 0 }}>{label}</span>
                <span style={{ fontWeight: 600 }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Rincian table */}
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>Rincian Anggaran</div>
          <div className="table-container" style={{ marginBottom: 0 }}>
            <table style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={{ width: 36, padding: '8px 10px', textAlign: 'center' }}>No.</th>
                  <th style={{ width: 55, padding: '8px 10px' }}>Kode</th>
                  <th style={{ padding: '8px 10px' }}>Uraian Kegiatan / Beban</th>
                  <th style={{ width: '13%', padding: '8px 10px', textAlign: 'right' }}>Pagu Anggaran</th>
                  <th style={{ width: '13%', padding: '8px 10px', textAlign: 'right' }}>Realisasi s/d Bln Lalu</th>
                  <th style={{ width: '13%', padding: '8px 10px', textAlign: 'right' }}>Pencairan Bulan Ini</th>
                  <th style={{ width: '13%', padding: '8px 10px', textAlign: 'right' }}>Sisa Anggaran</th>
                  <th style={{ width: 54, padding: '8px 10px', textAlign: 'right' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groups).map(([groupLabel, items]) => (
                  <>
                    <tr key={groupLabel} style={{ background: 'rgba(99,102,241,0.05)' }}>
                      <td colSpan={8} style={{ padding: '6px 10px', fontWeight: 700, fontSize: 11, color: 'var(--primary)', letterSpacing: 0.2 }}>
                        {groupLabel}
                      </td>
                    </tr>
                    {items.map((li) => {
                      lineNo++
                      const serap = li.anggaran > 0 ? ((li.anggaran - li.sisa) / li.anggaran * 100) : 0
                      return (
                        <tr key={li.kode}>
                          <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>{lineNo}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: 'var(--primary)' }}>{li.kode}</td>
                          <td style={{ padding: '6px 10px', lineHeight: 1.4 }}>
                            <div style={{ fontWeight: 500 }}>{li.uraian}</div>
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{formatRupiah(li.anggaran)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{formatRupiah(li.akumulasi)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: li.pencairan > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>{formatRupiah(li.pencairan)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: li.sisa < 0 ? 'var(--danger)' : '' }}>{formatRupiah(li.sisa)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: serap > 90 ? 'var(--danger)' : serap > 70 ? 'var(--warning)' : 'var(--success)' }}>
                              {serap.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: 'var(--bg-secondary)' }}>
                  <td colSpan={3} style={{ padding: '8px 10px', fontWeight: 700 }}>TOTAL</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{formatRupiah(totalAnggaran)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{formatRupiah(totalAkumulasi)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: 'var(--primary)', fontWeight: 800 }}>{formatRupiah(totalPencairan)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{formatRupiah(totalSisa)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)' }}>
                    {totalAnggaran > 0 ? ((totalAnggaran - totalSisa) / totalAnggaran * 100).toFixed(1) + '%' : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Signature block */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 32, fontSize: 12 }}>
            {[
              { label: 'Diminta oleh', title: 'Kepala Divisi Keuangan' },
              { label: 'Diverifikasi oleh', title: 'Manajer Keuangan' },
              { label: 'Disetujui oleh', title: 'Direktur Utama' },
            ].map(s => (
              <div key={s.title} style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: 50 }}>{s.label},</div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                  <div style={{ fontWeight: 600 }}>(.......................................)</div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{s.title}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function NPDReport() {
  const { state } = useApp()
  const anggaranAll = state.anggaran || []

  const [selectedPeriod, setSelectedPeriod] = useState('jan')
  const [search, setSearch] = useState('')
  const [expandedNPD, setExpandedNPD] = useState(new Set())
  const [filterKategori, setFilterKategori] = useState('all')
  const [modalNPD, setModalNPD] = useState(null)

  const periodMonths = useMemo(() => periodValueToMonths(selectedPeriod), [selectedPeriod])

  // Build NPD docs from live anggaran — each category+month = 1 NPD document
  const npdData = useMemo(() => {
    const docs = []
    const npdCategories = ['bebanInvestasi', 'bebanOperasional', 'bebanUmum']

    npdCategories.forEach(catKey => {
      const displayKat = KATEGORI_MAP[catKey] || catKey
      const catItems = anggaranAll.filter(a => a.kategori === catKey && !a.is_total)

      const byMonth = {}
      catItems.forEach(item => {
        const bulan = item.bulan || 0
        if (!byMonth[bulan]) byMonth[bulan] = []
        byMonth[bulan].push(item)
      })

      Object.entries(byMonth).forEach(([bulanStr, items]) => {
        const bulan = Number(bulanStr)
        if (bulan === 0) return

        const totalBulanIni = items.reduce((s, i) => s + (i.bulan_ini || 0), 0)

        // Build line items with full uraian and group info
        const lineItems = items
          .filter(i => i.anggaran_awal > 0 || i.bulan_ini > 0 || i.realisasi > 0)
          .map(i => {
            const kode = i.nama || i.kode   // DB stores section code in 'nama'
            const uraian = getUraian(catKey, kode)
            const group = getGroup(catKey, kode)
            const anggaran = i.anggaran_awal || 0
            const akumulasi = i.sd_bln_lalu || 0
            const pencairan = i.bulan_ini || 0
            const realisasi = i.realisasi || 0
            const sisa = anggaran - realisasi
            const serap = anggaran > 0 ? (realisasi / anggaran * 100) : 0
            return { kode, uraian, group, anggaran, akumulasi, pencairan, realisasi, sisa, serap }
          })
          .sort((a, b) => {
            // Sort by kode numerically: "1.1" < "1.2" < "2.1"
            const [am, an] = a.kode.split('.').map(Number)
            const [bm, bn] = b.kode.split('.').map(Number)
            return am !== bm ? am - bm : (an || 0) - (bn || 0)
          })

        const totalAnggaran = lineItems.reduce((s, li) => s + li.anggaran, 0)
        const totalAkumulasi = lineItems.reduce((s, li) => s + li.akumulasi, 0)
        const totalPencairan = lineItems.reduce((s, li) => s + li.pencairan, 0)
        const totalSisa = lineItems.reduce((s, li) => s + li.sisa, 0)

        // Derive NPD number per Indonesian government format
        const catCode = catKey === 'bebanInvestasi' ? 'INV' : catKey === 'bebanUmum' ? 'UMM' : 'OPS'
        const npdNomor = `NPD-${catCode}/${ROMAN_MONTHS[bulan]}/2026`

        docs.push({
          npdNomor,
          subKegiatan: displayKat,
          kategori: displayKat,
          kategoriKey: catKey,
          fileName: `${displayKat} — ${MONTH_NAMES[bulan]} 2026`,
          bulan,
          tahun: 2026,
          tanggal: `2026-${String(bulan).padStart(2, '0')}-01`,
          jumlahDiminta: totalBulanIni,
          jumlahDibayarkan: totalBulanIni,
          lineItems,
          totalAnggaran,
          totalAkumulasi,
          totalPencairan,
          totalSisa,
          itemCount: lineItems.length,
          itemWithDisbursement: lineItems.filter(li => li.pencairan > 0).length,
        })
      })
    })

    // Sort by bulan then kategori
    return docs.sort((a, b) => a.bulan !== b.bulan ? a.bulan - b.bulan : a.kategori.localeCompare(b.kategori))
  }, [anggaranAll])

  // Anggaran vs Realisasi summary cards
  const anggaranTotals = useMemo(() => {
    const totals = {}
    const catMap = { bebanInvestasi: 'investasi', bebanOperasional: 'operasional', bebanUmum: 'umum' }
    Object.entries(catMap).forEach(([dbKey, shortKey]) => {
      const catItems = anggaranAll.filter(a => a.kategori === dbKey && !a.is_total)
      const months = [...new Set(catItems.map(a => a.bulan))].sort((a, b) => a - b)
      const lastMonth = months[months.length - 1] || 0
      const lastMonthItems = catItems.filter(a => a.bulan === lastMonth)
      const pagu = lastMonthItems.reduce((s, i) => s + (i.anggaran_awal || 0), 0)
      const realisasi = lastMonthItems.reduce((s, i) => s + (i.realisasi || 0), 0)
      totals[shortKey] = { pagu, realisasi }
    })
    return totals
  }, [anggaranAll])

  const filtered = useMemo(() => {
    let list = npdData.filter(n => periodMonths.includes(n.bulan))
    if (filterKategori !== 'all') list = list.filter(n => n.kategori === filterKategori)
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(n =>
        (n.fileName || '').toLowerCase().includes(s) ||
        (n.npdNomor || '').toLowerCase().includes(s) ||
        (n.lineItems || []).some(li =>
          (li.uraian || '').toLowerCase().includes(s) ||
          (li.kode || '').toLowerCase().includes(s)
        )
      )
    }
    return list
  }, [npdData, periodMonths, filterKategori, search])

  const stats = useMemo(() => {
    const totalDiminta = filtered.reduce((s, n) => s + (n.jumlahDiminta || 0), 0)
    const totalDibayarkan = filtered.reduce((s, n) => s + (n.jumlahDibayarkan || 0), 0)
    const totalItems = filtered.reduce((s, n) => s + (n.lineItems || []).length, 0)
    const byKat = {}
    filtered.forEach(n => {
      if (!byKat[n.kategori]) byKat[n.kategori] = { count: 0, total: 0 }
      byKat[n.kategori].count++
      byKat[n.kategori].total += n.jumlahDiminta || 0
    })
    return { totalDiminta, totalDibayarkan, totalItems, count: filtered.length, byKat }
  }, [filtered])

  const akumulasiYTD = useMemo(() => {
    const selectedMax = Math.max(...periodMonths)
    const ytdNPD = npdData.filter(n => n.bulan <= selectedMax)
    const byKat = {}
    ytdNPD.forEach(n => {
      if (!byKat[n.kategori]) byKat[n.kategori] = 0
      byKat[n.kategori] += n.jumlahDiminta || 0
    })
    return { total: ytdNPD.reduce((s, n) => s + (n.jumlahDiminta || 0), 0), byKat, count: ytdNPD.length }
  }, [npdData, periodMonths])

  function toggleExpand(idx) {
    setExpandedNPD(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  function handleExport() {
    const rows = []
    filtered.forEach(n => {
      rows.push([n.npdNomor, n.tanggal, n.kategori, n.fileName, '', n.totalAnggaran, n.totalAkumulasi, n.jumlahDiminta, n.totalSisa, ''])
      let no = 0
      ;(n.lineItems || []).forEach(li => {
        no++
        rows.push(['', '', li.group, `  ${no}. ${li.kode}`, li.uraian, li.anggaran, li.akumulasi, li.pencairan, li.sisa, li.serap.toFixed(1) + '%'])
      })
      rows.push([])
    })
    exportXLSX(
      'Laporan_NPD',
      ['No. NPD', 'Tanggal', 'Kategori / Kelompok', 'Kode', 'Uraian Kegiatan / Beban', 'Pagu Anggaran', 'Realisasi s/d Bln Lalu', 'Pencairan Bulan Ini', 'Sisa Anggaran', '% Serapan'],
      rows, 'NPD'
    )
  }

  return (
    <div className="animate-in">
      {modalNPD && <NPDDocumentModal npd={modalNPD} onClose={() => setModalNPD(null)} />}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Nota Pencairan Dana (NPD)</h1>
          <p>Monitoring pencairan dana per program dan beban — {filtered.length} dokumen{' '}
            <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>● Live dari Database</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={handleExport}><Download size={16} /> Export Excel</button>
          <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> Cetak</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label"><FileText size={16} color="var(--primary)" /> Total NPD</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{stats.count}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stats.totalItems} rincian item</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><Wallet size={16} color="var(--primary)" /> Pencairan Periode</div>
          <div className="kpi-value" style={{ fontSize: 16 }}>{formatRupiah(stats.totalDiminta)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dana diminta</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><BarChart3 size={16} color="var(--success)" /> Akumulasi YTD</div>
          <div className="kpi-value" style={{ fontSize: 16, color: 'var(--success)' }}>{formatRupiah(akumulasiYTD.total)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Jan s/d periode ini ({akumulasiYTD.count} NPD)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><TrendingDown size={16} color="var(--warning)" /> Item Aktif</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{filtered.reduce((s, n) => s + n.itemWithDisbursement, 0)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>item dengan pencairan</div>
        </div>
      </div>

      {/* Anggaran vs Realisasi Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Investasi', key: 'investasi', ...KATEGORI_COLORS['Investasi'] },
          { label: 'Beban Operasional', key: 'operasional', ...KATEGORI_COLORS['Beban Operasional'] },
          { label: 'Beban Umum & Adm', key: 'umum', ...KATEGORI_COLORS['Beban Umum & Administrasi'] },
        ].map(cat => {
          const pagu = anggaranTotals[cat.key]?.pagu || 0
          const real = anggaranTotals[cat.key]?.realisasi || 0
          const pct = pagu > 0 ? (real / pagu * 100) : 0
          const isActive = filterKategori === cat.label || filterKategori === `${cat.label.split(' ')[0]} & Administrasi`
          return (
            <div key={cat.key}
              onClick={() => setFilterKategori(filterKategori === cat.label ? 'all' : cat.label)}
              style={{ padding: '14px 16px', borderRadius: 10, background: cat.bg, border: `1.5px solid ${isActive ? cat.border : 'transparent'}`, cursor: 'pointer', transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{cat.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{cat.label}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 1 }}>Pagu: <span style={{ fontFamily: 'monospace' }}>{formatRupiah(pagu)}</span></div>
              <div style={{ fontSize: 11, color: cat.text, marginBottom: 4 }}>Realisasi: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatRupiah(real)}</span> ({pct.toFixed(1)}%)</div>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--border-light)', marginTop: 4 }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(pct, 100)}%`, background: cat.border, transition: 'width 0.5s' }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Period Selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <Calendar size={16} color="var(--primary)" />
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Periode:</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {MONTHS.map(m => (
              <button key={m.value} onClick={() => setSelectedPeriod(m.value)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                border: selectedPeriod === m.value ? '1px solid var(--primary)' : '1px solid transparent',
                background: selectedPeriod === m.value ? 'var(--primary)' : 'var(--border-light)',
                color: selectedPeriod === m.value ? 'white' : 'var(--text-muted)',
                fontWeight: selectedPeriod === m.value ? 600 : 400, transition: 'all 0.2s'
              }}>{m.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Presets:</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PERIOD_PRESETS.map(p => (
              <button key={p.value} onClick={() => setSelectedPeriod(p.value)} style={{
                padding: '4px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: selectedPeriod === p.value ? 'var(--primary)' : 'transparent',
                color: selectedPeriod === p.value ? 'white' : 'var(--text-muted)',
                fontWeight: selectedPeriod === p.value ? 600 : 400, transition: 'all 0.2s'
              }}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="topbar-search" style={{ maxWidth: 440 }}>
          <Search /><input type="text" placeholder="Cari nomor NPD, uraian, atau kode program..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {filterKategori !== 'all' && (
          <button className="btn btn-sm btn-outline" onClick={() => setFilterKategori('all')}>
            <Filter size={14} /> Reset Filter
          </button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} NPD · {filtered.reduce((s, n) => s + n.lineItems.length, 0)} rincian
        </div>
      </div>

      {/* Main NPD Table */}
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={{ width: 30 }}></th>
                <th style={{ width: '15%' }}>No. NPD</th>
                <th style={{ width: '10%' }}>Periode</th>
                <th style={{ width: '18%' }}>Kategori</th>
                <th>Program / Beban</th>
                <th className="text-right" style={{ width: 50 }}>Item</th>
                <th className="text-right" style={{ width: '14%' }}>Pencairan</th>
                <th className="text-right" style={{ width: '8%' }}>% Serapan</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                  Tidak ada data NPD untuk periode ini
                </td></tr>
              )}
              {filtered.map((n, idx) => {
                const isOpen = expandedNPD.has(idx)
                const katStyle = KATEGORI_COLORS[n.kategori] || {}
                const serapPct = n.totalAnggaran > 0 ? ((n.totalAnggaran - n.totalSisa) / n.totalAnggaran * 100) : 0

                // Group line items
                const groups = {}
                n.lineItems.forEach(li => {
                  const g = li.group || 'Lainnya'
                  if (!groups[g]) groups[g] = []
                  groups[g].push(li)
                })

                return (
                  <>
                    <tr key={idx} onClick={() => toggleExpand(idx)} style={{ cursor: 'pointer' }}>
                      <td>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td className="mono" style={{ fontWeight: 700, fontSize: 11 }}>{n.npdNomor}</td>
                      <td style={{ fontSize: 12 }}>{MONTH_NAMES[n.bulan]} {n.tahun}</td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: katStyle.bg || 'var(--bg-secondary)', color: katStyle.border || 'var(--text-muted)' }}>
                          {katStyle.icon} {n.kategori}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{n.fileName}</td>
                      <td className="text-right" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{n.itemCount}</td>
                      <td className="text-right mono" style={{ fontWeight: 700, color: n.jumlahDiminta > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>{formatRupiah(n.jumlahDiminta)}</td>
                      <td className="text-right">
                        <span style={{ fontSize: 11, fontWeight: 700,
                          color: serapPct > 90 ? 'var(--danger)' : serapPct > 70 ? 'var(--warning)' : 'var(--success)' }}>
                          {serapPct.toFixed(1)}%
                        </span>
                      </td>
                      <td onClick={e => { e.stopPropagation(); setModalNPD(n) }}
                        style={{ textAlign: 'center', cursor: 'pointer' }}
                        title="Lihat dokumen NPD lengkap">
                        <Eye size={14} color="var(--primary)" />
                      </td>
                    </tr>
                    {isOpen && n.lineItems.length > 0 && (
                      <tr key={`${idx}-detail`}>
                        <td colSpan={9} style={{ padding: 0, background: 'var(--bg-subtle)' }}>
                          <table style={{ width: '100%', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-secondary)' }}>
                                <th style={{ width: 36, padding: '6px 10px', textAlign: 'center' }}>No.</th>
                                <th style={{ width: 55, padding: '6px 10px' }}>Kode</th>
                                <th style={{ padding: '6px 10px' }}>Uraian Kegiatan / Beban</th>
                                <th className="text-right" style={{ width: '13%', padding: '6px 10px' }}>Pagu Anggaran</th>
                                <th className="text-right" style={{ width: '12%', padding: '6px 10px' }}>Real. s/d Bln Lalu</th>
                                <th className="text-right" style={{ width: '12%', padding: '6px 10px' }}>Pencairan Ini</th>
                                <th className="text-right" style={{ width: '12%', padding: '6px 10px' }}>Sisa Anggaran</th>
                                <th className="text-right" style={{ width: 60, padding: '6px 10px' }}>% Serap</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                let no = 0
                                return Object.entries(groups).map(([groupLabel, items]) => (
                                  <>
                                    <tr key={groupLabel} style={{ background: 'rgba(99,102,241,0.05)' }}>
                                      <td colSpan={8} style={{ padding: '5px 10px', fontWeight: 700, fontSize: 11, color: 'var(--primary)', letterSpacing: 0.2 }}>
                                        {groupLabel}
                                      </td>
                                    </tr>
                                    {items.map(li => {
                                      no++
                                      const serap = li.serap || 0
                                      return (
                                        <tr key={li.kode} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                          <td style={{ padding: '5px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>{no}</td>
                                          <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>{li.kode}</td>
                                          <td style={{ padding: '5px 10px', lineHeight: 1.4 }}>
                                            <span style={{ fontWeight: 500 }}>{li.uraian}</span>
                                          </td>
                                          <td className="text-right mono" style={{ padding: '5px 10px', fontSize: 11 }}>{formatRupiah(li.anggaran)}</td>
                                          <td className="text-right mono" style={{ padding: '5px 10px', fontSize: 11, color: 'var(--text-muted)' }}>{formatRupiah(li.akumulasi)}</td>
                                          <td className="text-right mono" style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, color: li.pencairan > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>{formatRupiah(li.pencairan)}</td>
                                          <td className="text-right mono" style={{ padding: '5px 10px', fontSize: 11, color: li.sisa < 0 ? 'var(--danger)' : '' }}>{formatRupiah(li.sisa)}</td>
                                          <td style={{ padding: '5px 10px', textAlign: 'right' }}>
                                            <div>
                                              <span style={{ fontSize: 10, fontWeight: 700, color: serap > 90 ? 'var(--danger)' : serap > 70 ? 'var(--warning)' : 'var(--success)' }}>
                                                {serap.toFixed(1)}%
                                              </span>
                                              {li.anggaran > 0 && (
                                                <div style={{ height: 3, borderRadius: 2, background: 'var(--border-light)', marginTop: 2, width: 48 }}>
                                                  <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(serap, 100)}%`,
                                                    background: serap > 90 ? 'var(--danger)' : serap > 70 ? 'var(--warning)' : 'var(--success)' }} />
                                                </div>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </>
                                ))
                              })()}
                            </tbody>
                            <tfoot>
                              <tr style={{ fontWeight: 700, background: 'var(--bg-secondary)', borderTop: '2px solid var(--border)' }}>
                                <td colSpan={3} style={{ padding: '6px 10px' }}>SUBTOTAL {n.kategori.toUpperCase()}</td>
                                <td className="text-right mono" style={{ padding: '6px 10px', fontSize: 11 }}>{formatRupiah(n.totalAnggaran)}</td>
                                <td className="text-right mono" style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)' }}>{formatRupiah(n.totalAkumulasi)}</td>
                                <td className="text-right mono" style={{ padding: '6px 10px', fontSize: 12, color: 'var(--primary)', fontWeight: 800 }}>{formatRupiah(n.totalPencairan)}</td>
                                <td className="text-right mono" style={{ padding: '6px 10px', fontSize: 11 }}>{formatRupiah(n.totalSisa)}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11 }}>
                                  {n.totalAnggaran > 0 ? `${((n.totalAnggaran - n.totalSisa) / n.totalAnggaran * 100).toFixed(1)}%` : '—'}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td colSpan={6}>TOTAL PERIODE {MONTH_NAMES[Math.max(...periodMonths)].toUpperCase()} 2026</td>
                  <td className="text-right mono">{formatRupiah(stats.totalDiminta)}</td>
                  <td colSpan={2}></td>
                </tr>
                <tr style={{ fontWeight: 600, background: 'rgba(16,185,129,0.06)' }}>
                  <td colSpan={6} style={{ color: 'var(--success)' }}>AKUMULASI PENCAIRAN (Jan s/d Periode Ini)</td>
                  <td className="text-right mono" style={{ color: 'var(--success)' }}>{formatRupiah(akumulasiYTD.total)}</td>
                  <td colSpan={2} className="text-right" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{akumulasiYTD.count} NPD</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
