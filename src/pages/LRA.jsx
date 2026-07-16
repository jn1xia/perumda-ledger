import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { Printer, Download, FileText, TrendingUp, TrendingDown, Wallet, BarChart3, Building2, Briefcase, ChevronDown, ChevronRight, Calendar } from 'lucide-react'
import { printReport } from '../utils/exportUtils.js'
import { MONTHS, PERIOD_PRESETS, periodValueToYearMonth, periodValueToLabel, periodValueToMonths } from '../utils/journalFilters.js'
import { buildFlatHierarchy, getRowStyle } from '../utils/treeUtils.js'
import { expandJournals } from '../utils/journalExpand.js'
import { isDeltaJournal } from '../utils/reportDelta.js'
// SINGLE SOURCE OF TRUTH for account → outline mapping. LRA used to keep local
// copies of these maps/resolvers; every keyword fix then had to be made three
// times (lraOutline.js + LRA.jsx + NPDReport.jsx) and they drifted. Any mapping
// change now happens ONLY in lraOutline.js.
import { subAkunDesc, resolveOutline, resolveWithSubPriority, categoryKeyForCode, getInvestasiOutline, extractAccountCode, CASH_BASIS_BEBAN_POKOK, CASH_BASIS_PIUTANG_CODE, CASH_BASIS_PIUTANG_OUTLINE } from '../utils/lraOutline.js'
import * as XLSX from 'xlsx'

const lraTabs = [
  { id: 'penerimaan',      label: 'Tabel Penerimaan',  icon: TrendingUp,   catKey: 'penerimaan' },
  { id: 'rekap-penerimaan',label: 'Rekap Penerimaan',  icon: Wallet,       catKey: 'penerimaan' },
  { id: 'investasi',       label: 'Beban Investasi',    icon: Building2,    catKey: 'bebanInvestasi' },
  { id: 'rekap-investasi', label: 'Rekap Investasi',   icon: BarChart3,    catKey: 'bebanInvestasi' },
  { id: 'beban-ops',       label: 'Beban Operasional', icon: TrendingDown, catKey: 'bebanOperasional' },
  { id: 'rekap-beban-ops', label: 'Rekap Beban Ops',   icon: FileText,     catKey: 'bebanOperasional' },
  { id: 'beban-umum',      label: 'Beban Umum',         icon: Briefcase,    catKey: 'bebanUmum' },
  { id: 'rekap-beban-umum',label: 'Rekap Beban Umum',  icon: FileText,     catKey: 'bebanUmum' },
  { id: 'beban-lainnya',   label: 'Beban Lain-lain',    icon: TrendingDown, catKey: 'bebanLainnya' },
]

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
  '11.1': 'Sewa Mobil Operasional',
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
  '1.1.1': 'Pajak Mobil Operasional',
  '1.1.2': 'Parkir Mobil Operasional',
  '1.1.3': 'Pemeliharaan Mobil Truck',
  '1.1.4': 'Pemeliharaan Mobil Pick Up',
  '1.1.5': 'Pemeliharaan Mobil Keliling',
  '1.1.6': 'Pemeliharaan Tossa',
  '1.2.1': 'Pemeliharaan Bangunan Pasar',
  '1.3.1': 'Alat dan Bahan Penyegelan',
  '1.3.2': 'Alat dan Bahan Kebersihan Pasar',
  '2.1.1': 'Cetak Dokumen Perjanjian Sewa',
  '2.1.2': 'Cetak Segel',
  '2.1.3': 'Cetak Karcis Retribusi Harian',
  '2.2.1': 'Cetak Spanduk',
  '3.1.1': 'Honor Tenaga Outsourcing/Kontrak',
  '3.1.2': 'Honor Tenaga Harian Lepas',
  '3.2.1': 'Tunjangan Hari Raya THL',
  '3.2.2': 'Tunjangan Ketenagakerjaan (JKK & JKM) - THL',
  '3.2.3': 'Tunjangan Kesehatan (JKN) - THL',
  '3.3.1': 'Atribut Penagihan (Rompi + Topi)',
  '3.3.2': 'Baju Petugas Kebersihan',
  '3.3.3': 'Atribut Petugas Kebersihan',
  '3.3.4': 'Cetak ID Card + Pin Perumda',
  '3.3.5': 'Atribut Petugas Parkir (Baju + Topi)',
  '3.3.6': 'Petugas Keamanan',
  '3.4.1': 'Lembur Karyawan',
  '3.4.2': 'Lembur Tenaga Kontrak (Sopir, Satpam, OB)',
  '3.4.3': 'Lembur Tenaga Harian Lepas',
  '3.4.4': 'Insentif Bagian Penagihan',
  '1.4.1': 'Kerjasama Pengamanan Pasar dengan APH',
  // Legacy RKA slot for the same line (pre-2026 outline) — kept for old rows.
  '4.1.1': 'Kerjasama Pengamanan Pasar dengan APH',
}

const URAIAN_PENERIMAAN = {
  '1.1': 'Pengelolaan Pasar dari Toko/Kios, Bak dan Los (Bulanan)',
  '1.2': 'Pengelolaan Pasar untuk Pelataran/Kaki Lima (Harian)',
  '1.3': 'Pendapatan Unit Kebersihan Pasar (Sampah)',
  '1.4': 'Pendapatan Denda Pelayanan Pasar',
  '1.5': 'Pendapatan Perizinan',
  '1.6': 'Pendapatan Pengelolaan Lain-lain',
  '1.7': 'Pendapatan Keamanan Pasar',
  '1.8': 'Pendapatan Ramayana',
  '2.1': 'Pendapatan Parkir',
  '2.2': 'Pemakaian Tempat Event khusus/rakyat/ruang kreasi komunikasi/hobi/olahraga/fashion/dll',
  '2.3': 'Pemakaian Tempat Wisata Kuliner (foodcourt)',
  '2.4': 'Pendapatan Layanan Pengiriman Barang',
  '2.5': 'Pemakaian Tempat dan Jasa Live Selling',
  '2.6': 'Pemakaian Tempat Reklame dan Promosi',
  '2.7': 'Perdagangan Bahan Pokok dan Penting',
  '2.8': 'Perdagangan Gerai Inflasi',
  '2.9': 'Penjualan Air Minum Isi Ulang',
  '2.10': 'Penjualan Gas LPG',
  '3.1': 'Pendapatan Bunga dan Jasa Giro',
}

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
  '11': 'XI. Beban Sewa Kendaraan',
  '12': 'XII. Jasa Konsultansi & Profesional',
  '13': 'XIII. Kegiatan Umum & Kelembagaan',
}

const GROUP_INVESTASI = {
  '1': 'I. Program Operasional Pengelolaan Pasar',
  '2': 'II. Program Usaha Perdagangan Bahan Pokok',
  '3': 'III. Program Pembinaan Pedagang Pasar',
  '4': 'IV. Program Pengembangan Usaha Baru',
  '5': 'V. Program Pengembangan Teknologi Informasi',
  '6': 'VI. Program Pengembangan Sarana Pendukung',
  '7': 'VII. Program Modal Kerja',
}

// Beban Investasi STRUCTURE — mirrors the lampiran " Investasi" sheet VERBATIM
// (groups → programs → lettered rincian rows). Realization in the lampiran
// lives on the DETAIL rincian rows (or on a program when it has no breakdown);
// the program-with-detail rows stay at 0 realization and only the per-group
// "Total" + grand "TOTAL INVESTASI" aggregate the detail rows. This constant
// carries only the period-independent skeleton (outline, label, budget) — the
// realization values are computed per period from the anggaran rows (audited
// lampiran months) + posted journals (see investasiLeafVals in LRAContent).
const INVESTASI_SNAPSHOT = [
  { kode: '1', nama: 'Program Operasional Pengelolaan Pasar', programs: [
    { kode: '1.1', nama: 'Pengembangan Pasar Percontohan (SNI) - 1 Pasar', anggaran: 1000000000, details: [
      { kode: '1.1.1', nama: 'a. Penataan ruang/zonasi dan aksebilitas', anggaran: 300000000 },
      { kode: '1.1.2', nama: 'b. Pembangunan Fasilitas Umum : Kantor, toilet, ruang laktasi, pos keamanan, tempat ibadah, dll', anggaran: 450000000 },
      { kode: '1.1.3', nama: 'c. Pembangunan Infrastruktur : Instalasi air bersih, limbah, listrik, pengelolaan sampah, drainase, sirkulasi udara, dll', anggaran: 250000000 },
    ] },
    { kode: '1.2', nama: 'Tata letak display produk dalam pasar (untuk pasar-pasar berlantai dua)', anggaran: 100000000 },
    { kode: '1.3', nama: 'Perbaikan dan Pengadaan Sarana Pengelolaan Pasar', anggaran: 1500000000, details: [
      { kode: '1.3.1', nama: 'a. Pengadaan Mobil/Truck Box/Pickup/Freezer Box', anggaran: 550000000 },
      { kode: '1.3.2', nama: 'b. Alat Pemadam Kebakaran Pasar/APAR/Mesin Pemadam', anggaran: 150000000 },
      { kode: '1.3.3', nama: 'c. Pengadaan Bak/Kontainer Truck', anggaran: 200000000 },
      { kode: '1.3.4', nama: 'd. Pengadaan CCTV pasar', anggaran: 100000000 },
      { kode: '1.3.5', nama: 'e. Pengadaan Papan Nama Pasar', anggaran: 150000000 },
      { kode: '1.3.6', nama: 'f. Pengadaan Instalasi Listrik Pasar', anggaran: 350000000 },
    ] },
    { kode: '1.4', nama: 'Pengembangan Wisata Pasar yang memiliki keunikan atau pasar tematik yang menawarkan produk-produk khusus', anggaran: 360000000, details: [
      { kode: '1.4.1', nama: 'a. Pasar Tungging - Penambahan kios kuliner malam 20 buah, pemasangan paving blok dan penambahan lampu halaman', anggaran: 200000000 },
      { kode: '1.4.2', nama: 'b. Pasar Cemara - Pusat oleh-oleh dan pasar kuliner khas Banjarmasin', anggaran: 160000000 },
    ] },
    { kode: '1.5', nama: 'Revitalisasi atau Pembangunan Pasar', anggaran: 2500000000, details: [
      { kode: '1.5.1', nama: 'a. Pasar Baru Permai Dasar - Pemasangan ACP dan Cutting ACP, Pemasangan Neon Box Perusahaan', anggaran: 500000000 },
      { kode: '1.5.2', nama: 'b. Pasar Antasari - Perbaikan toko/kios/lapak/ruang', anggaran: 500000000 },
      { kode: '1.5.3', nama: 'c. Pasar Teluk Dalam - Sport Hall, aula serbaguna, game center, dan atau playground, paving, perbaikan jembatan', anggaran: 750000000 },
      { kode: '1.5.4', nama: 'd. Pasar Kuripan - masuk dalam proyek pelebaran jalan (masih kordinasi lintas SKPD)', anggaran: 390000000 },
      { kode: '1.5.5', nama: 'e. Pasar Malabar - Ruang kreasi olahraga', anggaran: 360000000 },
    ] },
    { kode: '1.6', nama: 'Perbaikan akses menuju jalan pasar dengan melakukan penataan jalan, pedestrian, lampu jalan dan akses angkutan umum', anggaran: 100000000, details: [
      { kode: '1.6.1', nama: 'a. Perbaikan akses jalan : Pasar Lima/Pasar Cemara/Pasar Jahri Saleh', anggaran: 50000000 },
      { kode: '1.6.2', nama: 'b. Penambahan Penerangan : Pasar Pandu/Pasar Pekauman/Pasar Gadang/Pasar Telawang', anggaran: 50000000 },
    ] },
  ] },
  { kode: '2', nama: 'Program Usaha Perdagangan Bahan Pokok', programs: [
    { kode: '2.1', nama: 'Perbaikan gudang bapok (Telawang/Sudirapi/Teluk Dalam/Pekauman/lainnya)', anggaran: 500000000 },
  ] },
  { kode: '3', nama: 'Program Pembinaan Pedagang Pasar', programs: [
    { kode: '3.1', nama: 'Sarana studio live selling', anggaran: 40000000 },
    { kode: '3.2', nama: 'Sarana tempat layanan pengiriman barang', anggaran: 10000000 },
  ] },
  { kode: '4', nama: 'Program Pengembangan Usaha Baru', programs: [
    { kode: '4.1', nama: 'Prasarana tempat event khusus, ruang kreasi komunitas, hobi, olahraga dan fashion', anggaran: 130000000 },
    { kode: '4.2', nama: 'Revitalisasi kawasan food court dan lahan lainnya', anggaran: 50000000 },
    { kode: '4.3', nama: 'Sarana gerai inflasi', anggaran: 50000000 },
    { kode: '4.4', nama: 'Prasarana tempat iklan/reklame/promosi', anggaran: 150000000 },
    { kode: '4.5', nama: 'Mesin isi ulang air galon', anggaran: 20000000 },
    { kode: '4.6', nama: 'Tabung gas LPG', anggaran: 100000000 },
  ] },
  { kode: '5', nama: 'Program Pengembangan Teknologi Informasi', programs: [
    { kode: '5.1', nama: 'Pengembangan sistem informasi akuntansi', anggaran: 150000000 },
    { kode: '5.2', nama: 'Alat Pembayaran digital/Tap kartu', anggaran: 100000000 },
  ] },
  { kode: '6', nama: 'Program Pengembangan Sarana Pendukung', programs: [
    { kode: '6.1', nama: 'Renovasi Gedung Kantor', anggaran: 300000000 },
    { kode: '6.2', nama: 'Pengadaan Perlengkapan Kantor', anggaran: 440000000 },
  ] },
  { kode: '7', nama: 'Program Modal Kerja', programs: [
    { kode: '7.1', nama: 'Pengadaan Stok Barang Untuk Perdagangan Bahan Pokok dan penting', anggaran: 1000000000 },
    { kode: '7.2', nama: 'Pengadaan Stok Barang Gerai Inflasi', anggaran: 250000000 },
  ] },
]

// Flatten INVESTASI_SNAPSHOT into the finalItems shape consumed by LRADetailTable
// (group header → program rows → detail rincian rows). Group/program-with-detail
// header values are roll-ups of their leaf descendants for the "Total" rows.
// `getVals(kode, nama)` supplies the per-period { sdBlnLalu, bulanIni } for each
// realization-carrying row; a program-with-detail header normally stays at 0
// like the lampiran, but any journal routed to the bare program outline (no
// leaf matched) is surfaced on that header row so no rupiah ever disappears.
function buildInvestasiItems(getVals) {
  const items = []
  const val = (kode, nama) => (getVals && getVals(kode, nama)) || { sdBlnLalu: 0, bulanIni: 0 }
  const mk = (kode, nama, depth, hasChildren, anggaran, sdBlnLalu, bulanIni) => {
    const realisasi = sdBlnLalu + bulanIni
    const targetBulan = anggaran
    const persen = targetBulan > 0 ? (bulanIni / targetBulan * 100) : 0
    return { kode, nama, kategori: 'bebanInvestasi', is_total: 0, _depth: depth, _hasChildren: hasChildren, anggaran, sdBlnLalu, bulanIni, realisasi, targetBulan, persen }
  }
  for (const g of INVESTASI_SNAPSHOT) {
    let gAng = 0, gLalu = 0, gIni = 0
    const groupRows = []
    for (const p of g.programs) {
      if (p.details && p.details.length) {
        const pAng = p.details.reduce((s, d) => s + d.anggaran, 0)
        // Program-with-detail header: 0 in the lampiran; carries only journals
        // that resolved to the bare program outline.
        const pv = val(p.kode, p.nama)
        groupRows.push(mk(p.kode, p.nama, 1, true, p.anggaran || pAng, pv.sdBlnLalu, pv.bulanIni))
        gLalu += pv.sdBlnLalu; gIni += pv.bulanIni
        for (const d of p.details) {
          const dv = val(d.kode, d.nama)
          groupRows.push(mk(d.kode, d.nama, 2, false, d.anggaran, dv.sdBlnLalu, dv.bulanIni))
          gAng += d.anggaran; gLalu += dv.sdBlnLalu; gIni += dv.bulanIni
        }
      } else {
        const pv = val(p.kode, p.nama)
        groupRows.push(mk(p.kode, p.nama, 1, false, p.anggaran, pv.sdBlnLalu, pv.bulanIni))
        gAng += p.anggaran; gLalu += pv.sdBlnLalu; gIni += pv.bulanIni
      }
    }
    items.push(mk(g.kode, g.nama, 0, true, gAng, gLalu, gIni))
    items.push(...groupRows)
  }
  return items
}

const GROUP_OPERASIONAL = {
  '1': 'I. Beban Pemeliharaan',
  '2': 'II. Beban Pelayanan dan Pemasaran',
  '3': 'III. Beban Pegawai Operasional',
  '4': 'IV. Beban Pokok Perdagangan',
}

// Sub-kelompok (level 2) Beban Operasional — sesuai sheet lampiran "Beban Operasional".
const SUBGROUP_OPERASIONAL = {
  '1.1': 'Pemeliharaan Kendaraan Operasional',
  '1.2': 'Pemeliharaan Bangunan Pasar',
  '1.3': 'Pemeliharaan Kebersihan Pasar',
  '1.4': 'Pemeliharaan Keamanan dan Ketertiban',
  '2.1': 'Beban Cetak Karcis Tarif Pelanggan',
  '2.2': 'Beban Barang Cetakan',
  '3.1': 'Honor Tenaga Kontrak dan Harian Lepas',
  '3.2': 'Tunjangan Pegawai Operasional',
  '3.3': 'Kelengkapan Pegawai',
  '3.4': 'Insentif/Kesejahteraan Pegawai',
  '4.1': 'Beban Pokok Perdagangan Bahan Pokok',
  '4.2': 'Beban Pokok Gerai Inflasi',
}

// Rincian (level 3) Beban Operasional dengan anggaran 1 tahun (dari lampiran).
const LEAF_OPERASIONAL = {
  '1.1.1': { nama: 'Pajak Mobil Operasional', ang: 25000000 },
  '1.1.2': { nama: 'Parkir Mobil Operasional', ang: 3000000 },
  '1.1.3': { nama: 'Pemeliharaan Mobil Truck (3)', ang: 58710000 },
  '1.1.4': { nama: 'Pemeliharaan Mobil Pick Up (4)', ang: 20000000 },
  '1.1.5': { nama: 'Pemeliharaan Mobil Keliling (2)', ang: 10000000 },
  '1.2.1': { nama: 'Pemeliharaan Bangunan Pasar (insidentil dan pengecatan)', ang: 900000000 },
  '1.3.1': { nama: 'Alat dan Bahan Penyegelan', ang: 20000000 },
  '1.3.2': { nama: 'Alat dan Bahan Kebersihan Pasar', ang: 35500000 },
  '1.4.1': { nama: 'Kerjasama Pengamanan Pasar dengan APH', ang: 900000000 },
  '2.1.1': { nama: 'Cetak dokumen perjanjian sewa (25000)', ang: 5100000 },
  '2.1.2': { nama: 'Cetak segel (1000)', ang: 2500000 },
  '2.1.3': { nama: 'Cetak karcis retribusi harian (6000)', ang: 10000000 },
  '2.2.1': { nama: 'Cetak Spanduk', ang: 25500000 },
  '3.1.1': { nama: 'Honor tenaga Outsourcing/kontrak', ang: 448560000 },
  '3.1.2': { nama: 'Honor tenaga harian lepas', ang: 2687040000 },
  '3.2.1': { nama: 'Tunjangan Hari Raya THL', ang: 223920000 },
  '3.2.2': { nama: 'Tunjangan Ketenagakerjaan (JKK & JKM) THL', ang: 27198613 },
  '3.2.3': { nama: 'Tunjangan Kesehatan (JKN) THL', ang: 234781387 },
  '3.3.1': { nama: 'Atribut Petugas Penagihan (Rompi + Topi)', ang: 10000000 },
  '3.3.2': { nama: 'Baju Petugas Kebersihan', ang: 28600000 },
  '3.3.3': { nama: 'Atribut Petugas Kebersihan (Sepatu booth + jas hujan + Rompi scotlight)', ang: 20000000 },
  '3.3.4': { nama: 'Cetak ID Card + Pin Perumda', ang: 3000000 },
  '3.3.5': { nama: 'Atribut Petugas Parkir (Baju + Topi)', ang: 15000000 },
  '3.3.6': { nama: 'Atribut Petugas Keamanan (29)', ang: 28175000 },
  '3.4.1': { nama: 'Lembur Karyawan', ang: 75000000 },
  '3.4.2': { nama: 'Lembur Tenaga Kontrak', ang: 15000000 },
  '3.4.3': { nama: 'Lembur Tenaga Harian Lepas', ang: 26250000 },
  '3.4.4': { nama: 'Insentif Penagihan', ang: 100000000 },
}

const GROUP_PENERIMAAN = {
  '1': 'I. Bisnis Utama',
  '2': 'II. Pendapatan Operasional Lainnya',
  '3': 'III. Pendapatan Jasa Bunga',
}

const GROUP_LAINNYA = {
  '1': 'I. Beban di Luar Operasional',
}

const URAIAN_LAINNYA = {
  '1.1': 'Beban Bunga Bank',
  '1.2': 'Beban Administrasi Bank',
  '1.3': 'Beban Lain-lain',
}

function ReportHeader({ title, subtitle, onPrint, onExport }) {
  return (
    <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div className="company">PERUMDA PASAR BAIMAN</div>
        <h2>{title}</h2>
        <div className="period">{subtitle}</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', gap:6, fontSize:13, padding:'8px 14px', borderRadius:8 }} onClick={onPrint}>
          <Printer size={14} /> Cetak Laporan
        </button>
        <button className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', gap:6, fontSize:13, padding:'8px 14px', borderRadius:8 }} onClick={onExport}>
          <Download size={14} /> Unduh Excel (.xlsx)
        </button>
      </div>
    </div>
  )
}

export default function LRA() {
  const { state } = useApp()
  const [activeTab, setActiveTab] = useState('penerimaan')
  const [selectedMonth, setSelectedMonth] = useState('apr')
  const [collapsed, setCollapsed] = useState({})

  const activeTabInfo = lraTabs.find(t => t.id === activeTab) || lraTabs[0]
  const catKey = activeTabInfo.catKey

  const anggaranAll = state.anggaran || []
  const allJournals = useMemo(() => (state.journals || []).filter(j => j.status === 'posted'), [state.journals])

  // Filter journals for the selected month (MTD) and YTD
  const yearMonth = periodValueToYearMonth(selectedMonth)
  const monthLabel = periodValueToLabel(selectedMonth)
  const periodMonths = useMemo(() => periodValueToMonths(selectedMonth), [selectedMonth])

  // Construct a canonical list of master budget items for the active category
  const masterBudgetItems = useMemo(() => {
    // Snapshot-driven line template. Prefer the rows loaded for the SELECTED period
    // (written by loadLraToAnggaran when a lampiran is uploaded) so the report
    // renders the exact set of lines present in that month's Excel. Fall back to
    // the April template for months not yet loaded. This keeps the LRA structure
    // in lock-step with the uploaded snapshot (same "snapshot + delta" principle
    // used by Neraca / Laba Rugi / Arus Kas).
    const periodRows = anggaranAll.filter(a => a.kategori === catKey && periodMonths.includes(a.bulan) && !a.is_total)
    // Fallback template: the LATEST audited month before the period that has
    // rows — a lampiran can add lines mid-year (12.1 Beban Konsultan Rencana
    // Bisnis first appears in Mei), so seeding the line set from April alone
    // would silently drop journals on the newer lines. April stays the floor.
    const templateRows = periodRows.length
      ? periodRows
      : (() => {
          const before = anggaranAll.filter(a =>
            a.kategori === catKey && !a.is_total &&
            a.bulan >= 4 && a.bulan < Math.min(...periodMonths))
          if (!before.length) return []
          const latest = Math.max(...before.map(a => a.bulan))
          return before.filter(a => a.bulan === latest)
        })()

    // Outline number for an anggaran row. For ANG- snapshot rows the outline is
    // carried in `nama` (the kode may be a sequence index for legacy rows).
    const outlineOf = (a) => (a.kode && a.kode.startsWith('ANG-') ? a.nama : a.kode)
    // Verbatim Excel label for a row, when present (only set on uploaded snapshots).
    const excelNameOf = (a) => {
      const n = a && a.nama_excel != null ? String(a.nama_excel).trim() : ''
      // Guard against legacy rows that stored the outline number in nama_excel.
      return n && !/^\d+(\.\d+)*$/.test(n) ? n : ''
    }

    // Collect rows keyed by outline → { anggaran_awal, namaExcel }. De-duplicates
    // and keeps the first non-empty anggaran / Excel label seen.
    const collectOutlines = (rows) => {
      const m = new Map()
      for (const a of rows) {
        const outline = outlineOf(a)
        if (!/^\d+\.\d+/.test(String(outline || ''))) continue
        const ang = a.anggaran_awal || 0
        const namaExcel = excelNameOf(a)
        const prev = m.get(outline)
        if (!prev) m.set(outline, { anggaran_awal: ang, namaExcel })
        else {
          if (ang && !prev.anggaran_awal) prev.anggaran_awal = ang
          if (namaExcel && !prev.namaExcel) prev.namaExcel = namaExcel
        }
      }
      return m
    }

    // Build canonical line items from snapshot rows. Display label priority:
    // verbatim Excel label (when a lampiran was uploaded) → curated URAIAN map →
    // raw outline number.
    const buildFromRows = (rows, uraian) => {
      return [...collectOutlines(rows).entries()].map(([outline, info]) => ({
        kode: outline,
        nama: info.namaExcel || uraian[outline] || outline,
        kategori: catKey,
        is_total: 0,
        anggaran_awal: info.anggaran_awal,
      }))
    }

    let items = []
    if (catKey === 'penerimaan') {
      // Penerimaan lines from the snapshot, named via URAIAN_PENERIMAAN.
      items = buildFromRows(templateRows, URAIAN_PENERIMAAN)
      // Inject group headers
      Object.entries(GROUP_PENERIMAAN).forEach(([groupCode, groupName]) => {
        if (!items.some(i => i.kode === groupCode)) {
          items.push({
            kode: groupCode,
            nama: groupName,
            kategori: 'penerimaan',
            is_total: 0,
            anggaran_awal: 0,
          })
        }
      })
    } else if (catKey === 'bebanLainnya') {
      // Beban di Luar Operasional (80xxx) has no RKA budget rows — build the
      // canonical line items straight from the URAIAN map so the outlines always
      // render; realisasi is filled in dynamically from posted journals below.
      items = Object.entries(URAIAN_LAINNYA).map(([kode, nama]) => ({
        kode, nama, kategori: 'bebanLainnya', is_total: 0, anggaran_awal: 0,
      }))
      Object.entries(GROUP_LAINNYA).forEach(([groupCode, groupName]) => {
        if (!items.some(i => i.kode === groupCode)) {
          items.push({ kode: groupCode, nama: groupName, kategori: 'bebanLainnya', is_total: 0, anggaran_awal: 0 })
        }
      })
    } else if (catKey === 'bebanOperasional') {
      // Snapshot-driven 3-level structure (group → sub-group → rincian). When the
      // selected period has loaded Beban Operasional rows (from an uploaded
      // lampiran), render exactly those outlines so the report mirrors the Excel;
      // otherwise fall back to the hardcoded RKA template so un-loaded months
      // still show the full structure. Labels come from the URAIAN/SUBGROUP maps
      // (single source of truth), falling back to the outline number for any new
      // line not yet mapped. Sub-group/group headers are aggregated bottom-up.
      if (periodRows.length) {
        items = [...collectOutlines(periodRows).entries()].map(([outline, info]) => ({
          kode: outline,
          nama: info.namaExcel || URAIAN_OPERASIONAL[outline] || SUBGROUP_OPERASIONAL[outline] || outline,
          kategori: 'bebanOperasional', is_total: 0, anggaran_awal: info.anggaran_awal,
        }))
      } else {
        // Fallback: full structure from the hardcoded maps.
        items = []
        Object.entries(LEAF_OPERASIONAL).forEach(([kode, { nama, ang }]) =>
          items.push({ kode, nama, kategori: 'bebanOperasional', is_total: 0, anggaran_awal: ang }))
        Object.entries(SUBGROUP_OPERASIONAL).forEach(([kode, nama]) => {
          if (!items.some(i => i.kode === kode)) items.push({ kode, nama, kategori: 'bebanOperasional', is_total: 0, anggaran_awal: 0 })
        })
      }
      // Inject level-1 group headers (always from the map).
      Object.entries(GROUP_OPERASIONAL).forEach(([kode, nama]) => {
        if (!items.some(i => i.kode === kode)) items.push({ kode, nama, kategori: 'bebanOperasional', is_total: 0, anggaran_awal: 0 })
      })
    } else {
      // bebanUmum / bebanInvestasi — snapshot-driven from templateRows, named via
      // the relevant URAIAN map so every outline in the uploaded lampiran renders.
      const uraian = catKey === 'bebanUmum' ? URAIAN_UMUM
                   : catKey === 'bebanInvestasi' ? URAIAN_INVESTASI
                   : URAIAN_OPERASIONAL
      items = buildFromRows(templateRows, uraian)

      // Inject outline group headers to construct a proper nested tree
      const groups = catKey === 'bebanUmum' ? GROUP_UMUM :
                     catKey === 'bebanInvestasi' ? GROUP_INVESTASI :
                     catKey === 'bebanOperasional' ? GROUP_OPERASIONAL : {}
      
      Object.entries(groups).forEach(([groupCode, groupName]) => {
        if (!items.some(i => i.kode === groupCode)) {
          items.push({
            kode: groupCode,
            nama: groupName,
            kategori: catKey,
            is_total: 0,
            anggaran_awal: 0,
          })
        }
      })
    }

    // Filter out total lines, as total row is drawn dynamically at the bottom of the table
    const filteredItems = items.filter(item => 
      !item.is_total && 
      !String(item.kode).toUpperCase().includes('TOTAL') && 
      !String(item.nama).toUpperCase().includes('TOTAL') &&
      !String(item.kode).toUpperCase().startsWith('UMM') &&
      !String(item.kode).toUpperCase().startsWith('INV') &&
      !String(item.kode).toUpperCase().startsWith('OPS')
    )

    // Sort outline codes numerically
    return filteredItems.sort((a, b) => {
      return a.kode.localeCompare(b.kode, undefined, { numeric: true, sensitivity: 'base' })
    })
  }, [anggaranAll, catKey, periodMonths])

  // extractAccountCode / categoryKeyForCode / resolveOutline / getInvestasiOutline
  // come from lraOutline.js (shared with NPD & AppContext) — no local copies.

  // Use pre-computed values from the Excel data directly (already period-specific)
  // For periods after April 2026, compute dynamically from actual journal entries.
  const lraData = useMemo(() => {
    // Beban Investasi renders the lampiran " Investasi" layout verbatim (groups →
    // programs → lettered rincian rows + per-group Total + grand TOTAL INVESTASI)
    // with per-period values: the latest audited month's anggaran rows carry the
    // official cumulative per rincian (Jan–May lampiran), and journal-driven
    // months after it (e.g. Juni upload) are layered on via getInvestasiOutline.
    if (catKey === 'bebanInvestasi') {
      const modes = state.periodModes || {}
      const minMonth = Math.min(...periodMonths)
      const maxMonth = Math.max(...periodMonths)
      const rowsByMonth = new Map()
      anggaranAll.forEach(a => {
        if (a.kategori !== 'bebanInvestasi' || a.is_total) return
        const m = a.bulan || 0
        if (!rowsByMonth.has(m)) rowsByMonth.set(m, [])
        rowsByMonth.get(m).push(a)
      })
      const monthAudited = (m) => modes[`2026-${String(m).padStart(2, '0')}`] !== 'jurnal' &&
        (rowsByMonth.get(m) || []).some(a => (a.bulan_ini || 0) !== 0 || (a.realisasi || 0) !== 0 || (a.sd_bln_lalu || 0) !== 0)
      // April's leaf template rows are keyed INV.x with the lampiran text in
      // nama — match by outline number first, then by normalized label.
      const norm = (s) => String(s || '').toLowerCase().replace(/^\s*[a-z]\.\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim()
      const recOf = (m, kode, nama) => {
        const rows = rowsByMonth.get(m) || []
        return rows.find(a => ((a.kode || '').startsWith('ANG-') ? a.nama : a.kode) === kode)
            || rows.find(a => norm(a.nama_excel || a.nama) === norm(nama))
      }
      // Net journal movement per outline per month (debit adds, kredit
      // subtracts; 12300 ADP resolves to null and is excluded — the lampiran
      // realizes investment on capitalization, not on progress payments).
      const jByOutline = new Map()
      expandJournals(allJournals).forEach(j => {
        if (!j.tanggal || !j.tanggal.startsWith('2026')) return
        const m = parseInt(j.tanggal.split('-')[1], 10)
        ;[[extractAccountCode(j.akun_debit), +1, parseFloat(j.debit) || 0, j.akun_debit],
          [extractAccountCode(j.akun_kredit), -1, parseFloat(j.kredit) || 0, j.akun_kredit]
        ].forEach(([code, sign, amt, acct]) => {
          if (!code || !amt) return
          const outline = getInvestasiOutline(code, subAkunDesc(acct, j.keterangan))
          if (!outline) return
          if (!jByOutline.has(outline)) jByOutline.set(outline, {})
          const bucket = jByOutline.get(outline)
          bucket[m] = (bucket[m] || 0) + sign * amt
        })
      })
      const jSum = (kode, from, to) => {
        const bucket = jByOutline.get(kode) || {}
        let s = 0
        for (let m = from; m <= to; m++) s += bucket[m] || 0
        return s
      }
      // Cumulative realization through month m = official figure of the latest
      // audited month ≤ m + routed journals of the months after it.
      const cumAt = (kode, nama, m) => {
        if (m <= 0) return 0
        for (let k = m; k >= 1; k--) {
          if (!monthAudited(k)) continue
          const rec = recOf(k, kode, nama)
          return ((rec && (rec.realisasi || 0)) || 0) + jSum(kode, k + 1, m)
        }
        return jSum(kode, 1, m)
      }
      const getVals = (kode, nama) => {
        const before = cumAt(kode, nama, minMonth - 1)
        return { sdBlnLalu: before, bulanIni: cumAt(kode, nama, maxMonth) - before }
      }
      return buildInvestasiItems(getVals)
    }
    const REAL_EXCEL_PERIODS = ['2026-01', '2026-02', '2026-03', '2026-04']
    // A MONTH is "audited" for the category when its anggaran rows carry real
    // realization figures (loaded from the official lampiran) — presence of rows
    // alone is not enough: a bad upload can leave value-less rows that froze the
    // month at nol (kendala 07-07-2026). The explicit period mode wins: a month
    // set to 'jurnal' is journal-driven no matter what rows linger.
    const modeOfMonth = (m) => (state.periodModes || {})[`2026-${String(m).padStart(2, '0')}`]
    const monthHasAuditedValues = (m) => modeOfMonth(m) !== 'jurnal' && anggaranAll.some(a =>
      a.bulan === m && a.kategori === catKey &&
      ((a.bulan_ini || 0) !== 0 || (a.realisasi || 0) !== 0 || (a.sd_bln_lalu || 0) !== 0)
    )
    const hasAuditedForCategory = periodMonths.some(monthHasAuditedValues)
    const isDynamic = !REAL_EXCEL_PERIODS.includes(yearMonth) && !hasAuditedForCategory
    const expandedJournals = isDynamic ? expandJournals(allJournals) : []
    // Overlay set for audited periods: user journals (JV-/JRN-) on audited
    // months, plus ALL posted journals of months WITHOUT audited figures — a
    // journal-driven month (e.g. Juni via template import, XL-/JV- alike) exists
    // only in its journals, so it must contribute fully to triwulan/semester
    // totals instead of vanishing behind the JV- filter (kendala 07-07-2026).
    const deltaExpanded = !isDynamic ? expandJournals((allJournals || []).filter(j => {
      if (!(j.status === 'posted' || j.status === undefined)) return false
      if (isDeltaJournal(j)) return true
      const m = parseInt(String(j.tanggal || '').split('-')[1], 10)
      return Number.isFinite(m) && m > 4 && !monthHasAuditedValues(m)
    })) : []

    const getRecordOutlineNum = (r) => {
      return r.kode.startsWith('ANG-') ? r.nama : r.kode
    }

    // Step 1: Map database data onto the master outline template
    const resolvedItems = masterBudgetItems.map(item => {
      const matchingRecords = anggaranAll.filter(a => 
        periodMonths.includes(a.bulan) &&
        a.kategori === catKey &&
        getRecordOutlineNum(a) === item.kode
      )

      let sdBlnLalu = 0
      let bulanIni = 0
      let realisasi = 0
      let anggaran = item.anggaran_awal || 0
      let targetBulanRec = 0
      // Journal-only delta on THIS outline (kept separate so a parent header can
      // re-add its own posted-journal delta after children are aggregated — a
      // journal mapped to a parent outline must not be lost in the roll-up).
      let jSdBlnLalu = 0
      let jBulanIni = 0

      const firstMonth = Math.min(...periodMonths)
      const lastMonth = Math.max(...periodMonths)

      matchingRecords.forEach(r => {
        bulanIni += (r.bulan_ini || 0)
        if (r.bulan === firstMonth) {
          sdBlnLalu = r.sd_bln_lalu || 0
        }
        if (r.bulan === lastMonth) {
          realisasi = r.realisasi || 0
          anggaran = r.anggaran_awal || 0
          targetBulanRec = r.target_bulan || 0
        }
      })

      // Step 2: Overlay user journal deltas for static periods
      if (!isDynamic && deltaExpanded.length > 0) {
        const isPendapatan = catKey === 'penerimaan'
        const minMonth = Math.min(...periodMonths)
        
        deltaExpanded.forEach(j => {
          if (!j.tanggal || !j.tanggal.startsWith('2026')) return
          const jMonth = parseInt(j.tanggal.split('-')[1], 10)
          
          let amount = 0
          const debitCode = extractAccountCode(j.akun_debit)
          const kreditCode = extractAccountCode(j.akun_kredit)
          const debitDesc = subAkunDesc(j.akun_debit, j.keterangan)
          const kreditDesc = subAkunDesc(j.akun_kredit, j.keterangan)

          if (isPendapatan) {
            // Only revenue-class accounts (4x/7x) may move a penerimaan outline:
            // beban outlines share the same numbering (e.g. "1.1" is both
            // Pengelolaan Pasar AND Gaji), so an ungated beban debit silently
            // SUBTRACTED from penerimaan (kendala 07-07-2026: 1.1 tampil
            // Rp 320 jt padahal jurnal pendapatan Rp 500 jt).
            if (kreditCode && /^[47]/.test(kreditCode) && (resolveWithSubPriority(resolveOutline, kreditCode, j.akun_kredit, j.keterangan) === item.kode)) {
              amount += (j.kredit ? parseFloat(j.kredit) || 0 : 0)
            }
            if (debitCode && /^[47]/.test(debitCode) && (resolveWithSubPriority(resolveOutline, debitCode, j.akun_debit, j.keterangan) === item.kode)) {
              amount -= (j.debit ? parseFloat(j.debit) || 0 : 0)
            }
            // Cash-basis special (official LRA): outline 1.6 "Pendapatan
            // Pengelolaan Lain-lain" = CREDITS to Piutang Usaha (collections).
            // The lampiran reads DATA LAMPIRAN NERACA!G15 — credits only.
            if (item.kode === CASH_BASIS_PIUTANG_OUTLINE && kreditCode === CASH_BASIS_PIUTANG_CODE) {
              amount += (j.kredit ? parseFloat(j.kredit) || 0 : 0)
            }
          } else {
            if (catKey === 'bebanInvestasi') {
              const outline = getInvestasiOutline(debitCode, debitDesc)
              if (outline && outline === item.kode) {
                amount += (j.debit ? parseFloat(j.debit) || 0 : 0)
              }
              const krOutline = getInvestasiOutline(kreditCode, kreditDesc)
              if (krOutline && krOutline === item.kode) {
                amount -= (j.kredit ? parseFloat(j.kredit) || 0 : 0)
              }
            } else {
              if (debitCode && categoryKeyForCode(debitCode) === catKey && (resolveWithSubPriority(resolveOutline, debitCode, j.akun_debit, j.keterangan) === item.kode)) {
                amount += (j.debit ? parseFloat(j.debit) || 0 : 0)
              }
              if (kreditCode && categoryKeyForCode(kreditCode) === catKey && (resolveWithSubPriority(resolveOutline, kreditCode, j.akun_kredit, j.keterangan) === item.kode)) {
                amount -= (j.kredit ? parseFloat(j.kredit) || 0 : 0)
              }
              // Cash-basis Beban Pokok (official LRA §IV): realizes inventory
              // PURCHASES (debits to 11401/11402), not the accrual COGS 51xxx.
              if (catKey === 'bebanOperasional' && debitCode && CASH_BASIS_BEBAN_POKOK[debitCode] === item.kode) {
                amount += (j.debit ? parseFloat(j.debit) || 0 : 0)
              }
            }
          }

          if (amount !== 0) {
            if (periodMonths.includes(jMonth)) {
              bulanIni += amount
              jBulanIni += amount
            } else if (jMonth < minMonth) {
              sdBlnLalu += amount
              jSdBlnLalu += amount
            }
          }
        })
      }

      // Step 3: Compute dynamically for periods after April 2026.
      // Use the AUDITED cumulative through April (from the anggaran table) as the
      // canonical Jan–Apr figure, then layer posted journals for months ≥ 5 on
      // top. This guarantees the "Sd Periode Ini" (akumulasi) correctly sums all
      // prior months instead of trying (and failing) to rebuild Jan–Apr from raw
      // journals. Bucketing per period also makes multi-month presets (e.g. TW III
      // = 7+8+9) accumulate properly.
      if (isDynamic) {
        let sumLalu = 0
        let sumIni = 0
        const isPendapatan = catKey === 'penerimaan'
        const minMonth = Math.min(...periodMonths)

        // Audited cumulative for this outline: prefer the LATEST audited month
        // BEFORE the period (e.g. May's lampiran LRA carries the Jan–May
        // kumulatif "Sd bln lalu") — seeding only from April silently dropped
        // May whenever May's journals aren't in the DB. A month is usable when
        // it isn't in 'jurnal' mode and has a real anggaran row for this
        // outline. Falls back to the legacy April block (Tahunan/TW views keep
        // their exact previous behavior).
        const modes = state.periodModes || {}
        let seedBulan = 4
        let auditedRec = null
        for (let m = minMonth - 1; m >= 4 && !auditedRec; m--) {
          if (modes[`2026-${String(m).padStart(2, '0')}`] === 'jurnal') continue
          const rec = anggaranAll.find(a =>
            a.bulan === m && a.kategori === catKey && getRecordOutlineNum(a) === item.kode
          )
          if (rec && ((rec.realisasi || 0) !== 0 || (rec.sd_bln_lalu || 0) !== 0 || (rec.bulan_ini || 0) !== 0)) {
            auditedRec = rec; seedBulan = m
          }
        }
        if (!auditedRec) {
          auditedRec = anggaranAll.find(a =>
            a.bulan === 4 && a.kategori === catKey && getRecordOutlineNum(a) === item.kode
          )
          seedBulan = 4
        }
        const auditedCum = auditedRec ? (auditedRec.realisasi || 0) : 0
        if (auditedCum !== 0) {
          // The audited block covers months 1..seedBulan. If the period starts
          // after it, it belongs to "s/d periode lalu"; if the period overlaps
          // it (e.g. Tahunan), it belongs to "periode ini".
          if (minMonth > seedBulan) sumLalu += auditedCum
          else sumIni += auditedCum
        }

        expandedJournals.forEach(j => {
          if (!j.tanggal || !j.tanggal.startsWith('2026')) return
          const jMonth = parseInt(j.tanggal.split('-')[1], 10)
          // Skip months already inside the audited cumulative block above.
          if (jMonth <= seedBulan) return

          let amount = 0
          const debitCode = extractAccountCode(j.akun_debit)
          const kreditCode = extractAccountCode(j.akun_kredit)
          const debitDesc = subAkunDesc(j.akun_debit, j.keterangan)
          const kreditDesc = subAkunDesc(j.akun_kredit, j.keterangan)

          if (isPendapatan) {
            // Same 4x/7x gate as the audited-overlay above — beban accounts must
            // never move a penerimaan outline that shares its number.
            if (kreditCode && /^[47]/.test(kreditCode) && (resolveWithSubPriority(resolveOutline, kreditCode, j.akun_kredit, j.keterangan) === item.kode)) {
              amount += (j.kredit ? parseFloat(j.kredit) || 0 : 0)
            }
            if (debitCode && /^[47]/.test(debitCode) && (resolveWithSubPriority(resolveOutline, debitCode, j.akun_debit, j.keterangan) === item.kode)) {
              amount -= (j.debit ? parseFloat(j.debit) || 0 : 0)
            }
            // Cash-basis special: penerimaan 1.6 = credits to Piutang Usaha
            // (collections) — official lampiran convention (spec §9).
            if (item.kode === CASH_BASIS_PIUTANG_OUTLINE && kreditCode === CASH_BASIS_PIUTANG_CODE) {
              amount += (j.kredit ? parseFloat(j.kredit) || 0 : 0)
            }
          } else {
            if (catKey === 'bebanInvestasi') {
              const outline = getInvestasiOutline(debitCode, debitDesc)
              if (outline && outline === item.kode) {
                amount += (j.debit ? parseFloat(j.debit) || 0 : 0)
              }
              const krOutline = getInvestasiOutline(kreditCode, kreditDesc)
              if (krOutline && krOutline === item.kode) {
                amount -= (j.kredit ? parseFloat(j.kredit) || 0 : 0)
              }
            } else {
              if (debitCode && categoryKeyForCode(debitCode) === catKey && (resolveWithSubPriority(resolveOutline, debitCode, j.akun_debit, j.keterangan) === item.kode)) {
                amount += (j.debit ? parseFloat(j.debit) || 0 : 0)
              }
              if (kreditCode && categoryKeyForCode(kreditCode) === catKey && (resolveWithSubPriority(resolveOutline, kreditCode, j.akun_kredit, j.keterangan) === item.kode)) {
                amount -= (j.kredit ? parseFloat(j.kredit) || 0 : 0)
              }
              // Cash-basis Beban Pokok: purchases (debits 11401/11402), not 51xxx.
              if (catKey === 'bebanOperasional' && debitCode && CASH_BASIS_BEBAN_POKOK[debitCode] === item.kode) {
                amount += (j.debit ? parseFloat(j.debit) || 0 : 0)
              }
            }
          }

          if (amount !== 0) {
            if (periodMonths.includes(jMonth)) {
              sumIni += amount
            } else if (jMonth < minMonth) {
              sumLalu += amount
            }
          }
        })

        sdBlnLalu = sumLalu
        bulanIni = sumIni
      }

      realisasi = sdBlnLalu + bulanIni
      // Use the audited monthly target from the lampiran (col 6) when available —
      // some items are spread /12, others are budgeted once (=annual). Fall back to
      // anggaran/12 only when no per-month target was loaded.
      const targetBulan = targetBulanRec > 0 ? targetBulanRec : (anggaran > 0 ? anggaran / 12 : 0)
      // Capaian % per official LRA formula: Bulan ini / Target bulan * 100.
      const persen = targetBulan > 0 ? (bulanIni / targetBulan * 100) : 0
      
      return { ...item, anggaran, sdBlnLalu, bulanIni, realisasi, targetBulan, persen, jSdBlnLalu, jBulanIni }
    })

    // Step 4: Build tree hierarchy and set node children/depth info
    let hierarchyData = []
    try {
      hierarchyData = buildFlatHierarchy(resolvedItems)
    } catch (e) {
      hierarchyData = resolvedItems.map(d => ({ ...d, _depth: 0, _hasChildren: false }))
    }

    // Step 5: Perform bottom-up sum aggregation for parent group headers
    const finalItems = hierarchyData.map(item => {
      if (item._hasChildren) {
        const isDescendant = (parent, child) => {
          return String(child).startsWith(String(parent) + '.')
        }
        const desc = hierarchyData.filter(child => !child._hasChildren && isDescendant(item.kode, child.kode))
        
        const anggaran = desc.reduce((s, d) => s + d.anggaran, 0)
        // Children carry their own journal deltas; re-add THIS header's own
        // journal delta (a posting mapped directly to the parent outline) so new
        // journals on a parent line still move the report.
        //
        // EXCEPTION — audited Beban Investasi (snapshot + delta): the " Investasi"
        // sheet keeps every realization on its DETAIL rincian rows and leaves the
        // level-2 parent cells at 0, so the "(2) minus template" baseline parks a
        // parent-level cancellation on that 0 cell (e.g. 1.5 = (2)0 − Δ). The
        // journal delta then re-adds +Δ on the same parent. Using the parent's
        // FULL own movement (snapshot −Δ + journal +Δ = 0) instead of the
        // journal-only delta nets that cancellation correctly, so the header
        // equals Σ(children) == (2) instead of double-counting +Δ. For every
        // other category (and dynamic months) the level-2 parent snapshot is 0,
        // so item.bulanIni === jBulanIni and this is a no-op.
        const useFullOwn = catKey === 'bebanInvestasi' && !isDynamic
        const ownSdBlnLalu = useFullOwn ? (item.sdBlnLalu || 0) : (item.jSdBlnLalu || 0)
        const ownBulanIni = useFullOwn ? (item.bulanIni || 0) : (item.jBulanIni || 0)
        const sdBlnLalu = desc.reduce((s, d) => s + d.sdBlnLalu, 0) + ownSdBlnLalu
        const bulanIni = desc.reduce((s, d) => s + d.bulanIni, 0) + ownBulanIni
        const realisasi = sdBlnLalu + bulanIni
        const targetBulan = desc.reduce((s, d) => s + d.targetBulan, 0)
        const persen = targetBulan > 0 ? (bulanIni / targetBulan * 100) : 0

        return {
          ...item,
          anggaran,
          sdBlnLalu,
          bulanIni,
          realisasi,
          targetBulan,
          persen,
        }
      }
      return item
    })

    // ── Kendala #2: surface deltas that map to NO outline ───────────────────
    // A posted journal whose expense/revenue account does not resolve to a
    // specific LRA outline (e.g. posted to a descriptive parent like
    // "61140 Beban Umum Lain-lain" with a keterangan that matches no keyword)
    // was previously dropped silently — so the transaction never showed in the
    // LRA. Collect any such category-matching delta into a visible
    // "(Belum Terpetakan)" leaf so finance always sees the amount (and can fix
    // the account/keterangan). Mirrors the Laba Rugi unmapped handling.
    //
    // Scope: uses the SAME journal set as the attribution above (dynamic =
    // posted journals for months > 4; static = user JV-/JRN- deltas). Audited
    // Jan–Apr periods with no user delta produce an empty set → no row → the
    // report stays byte-identical to before. bebanInvestasi returns early above.
    if (catKey !== 'bebanInvestasi') {
      const minMonth = Math.min(...periodMonths)
      const isPendapatan = catKey === 'penerimaan'
      const srcJournals = isDynamic ? expandedJournals : deltaExpanded
      let uSd = 0, uIni = 0
      srcJournals.forEach(j => {
        if (!j.tanggal || !j.tanggal.startsWith('2026')) return
        const jMonth = parseInt(j.tanggal.split('-')[1], 10)
        // Months whose figures come from an audited lampiran are already fully
        // inside the seed — their BASELINE journals must not re-enter through
        // the unmapped guard (prod Mei carries 278 baseline journals; a few
        // resolve to no outline and double-counted Rp 2,156 jt on top of the
        // official May cumulative). Jan–Apr stays hardcoded as the floor.
        if (isDynamic && (jMonth <= 4 || monthHasAuditedValues(jMonth))) return
        let amount = 0
        const debitCode = extractAccountCode(j.akun_debit)
        const kreditCode = extractAccountCode(j.akun_kredit)
        const debitDesc = subAkunDesc(j.akun_debit, j.keterangan)
        const kreditDesc = subAkunDesc(j.akun_kredit, j.keterangan)
        if (isPendapatan) {
          if (kreditCode && /^[47]/.test(kreditCode) && resolveWithSubPriority(resolveOutline, kreditCode, j.akun_kredit, j.keterangan) == null) amount += (parseFloat(j.kredit) || 0)
          if (debitCode && /^[47]/.test(debitCode) && resolveWithSubPriority(resolveOutline, debitCode, j.akun_debit, j.keterangan) == null) amount -= (parseFloat(j.debit) || 0)
        } else {
          // 6113x (Beban Penyusutan) is DELIBERATELY outside the cash-basis LRA
          // (official lampiran excludes depreciation) — not an unmapped error.
          if (debitCode && !/^6113/.test(debitCode) && categoryKeyForCode(debitCode) === catKey && resolveWithSubPriority(resolveOutline, debitCode, j.akun_debit, j.keterangan) == null) amount += (parseFloat(j.debit) || 0)
          if (kreditCode && !/^6113/.test(kreditCode) && categoryKeyForCode(kreditCode) === catKey && resolveWithSubPriority(resolveOutline, kreditCode, j.akun_kredit, j.keterangan) == null) amount -= (parseFloat(j.kredit) || 0)
        }
        if (amount !== 0) {
          if (periodMonths.includes(jMonth)) uIni += amount
          else if (jMonth < minMonth) uSd += amount
        }
      })
      if (Math.abs(uSd) > 0.0001 || Math.abs(uIni) > 0.0001) {
        finalItems.push({
          kode: '99.99',
          nama: '(Belum Terpetakan — periksa akun/keterangan jurnal)',
          kategori: catKey,
          is_total: 0,
          anggaran: 0,
          sdBlnLalu: uSd,
          bulanIni: uIni,
          realisasi: uSd + uIni,
          targetBulan: 0,
          persen: 0,
          _depth: 0,
          _hasChildren: false,
          _unmapped: true,
        })
      }
    }

    return finalItems
  }, [masterBudgetItems, allJournals, yearMonth, periodMonths, catKey, anggaranAll, state.periodModes])

  const toggleCollapse = (kode) => setCollapsed(prev => ({ ...prev, [kode]: !prev[kode] }))

  function LRATable({ data, title }) {
    const leafItems = data.filter(d => !d._hasChildren)
    const totalAnggaran = leafItems.reduce((s, d) => s + d.anggaran, 0)
    const totalRealisasi = leafItems.reduce((s, d) => s + d.realisasi, 0)
    const totalBulanIni = leafItems.reduce((s, d) => s + d.bulanIni, 0)
    const totalSdBlnLalu = leafItems.reduce((s, d) => s + d.sdBlnLalu, 0)
    const totalTargetBulan = leafItems.reduce((s, d) => s + (d.targetBulan || 0), 0)
    const totalSelisih = totalAnggaran - totalRealisasi
    const totalPersen = totalTargetBulan > 0 ? (totalBulanIni / totalTargetBulan * 100) : 0

    // Track which parents are collapsed
    const visibleData = []
    const collapsedParents = new Set()

    data.forEach(item => {
      const kode = String(item.kode)
      // Check if any parent is collapsed
      const isHidden = [...collapsedParents].some(pk => kode.startsWith(pk + '.'))
      if (isHidden) return

      if (item._hasChildren && collapsed[kode]) {
        collapsedParents.add(kode)
      }
      visibleData.push(item)
    })

    return (
      <table>
        <thead>
          <tr>
            <th style={{width:'8%'}}>No</th>
            <th style={{width:'30%'}}>Program / Kegiatan</th>
            <th className="text-right" style={{width:'13%'}}>Anggaran 1 Thn</th>
            <th className="text-right" style={{width:'11%'}}>Target/Bln</th>
            <th className="text-right" style={{width:'10%'}}>Sd Periode Lalu</th>
            <th className="text-right" style={{width:'10%'}}>Periode Ini</th>
            <th className="text-right" style={{width:'10%'}}>Sd Periode Ini</th>
            <th className="text-right" style={{width:'5%'}}>%</th>
            <th style={{width:'8%'}}>Progress</th>
          </tr>
        </thead>
        <tbody>
          {visibleData.map((item) => {
            const kode = String(item.kode)
            const depth = item._depth || 0
            const isHeader = item._hasChildren
            const isCollapsed = collapsed[kode]
            const persen = item.persen || 0
            const isOver = persen > 100

            return (
              <tr key={kode} style={{
                fontWeight: depth === 0 ? 700 : depth === 1 && isHeader ? 600 : 400,
                background: depth === 0 ? 'var(--bg-secondary)' : depth === 1 && isHeader ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderTop: depth === 0 ? '2px solid var(--border)' : undefined,
                color: item.is_total ? 'var(--primary)' : undefined,
                fontSize: 12,
              }}>
                <td className="mono" style={{ paddingLeft: 8 + depth * 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {isHeader && (
                      <span style={{ cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }} onClick={() => toggleCollapse(kode)}>
                        {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      </span>
                    )}
                    {kode}
                  </div>
                </td>
                <td style={{ paddingLeft: 8 + depth * 12, fontWeight: depth <= 1 && isHeader ? 600 : 400 }}>
                  {item.nama}
                </td>
                <td className="text-right mono">{item.anggaran ? formatRupiah(item.anggaran) : '-'}</td>
                <td className="text-right mono">{item.targetBulan ? formatRupiah(Math.round(item.targetBulan)) : '-'}</td>
                <td className="text-right mono">{item.sdBlnLalu ? formatRupiah(item.sdBlnLalu) : '-'}</td>
                <td className="text-right mono" style={{ fontWeight: 600 }}>{item.bulanIni ? formatRupiah(item.bulanIni) : '-'}</td>
                <td className="text-right mono" style={{ fontWeight: 600, color: isOver ? 'var(--danger)' : item.realisasi > 0 ? 'var(--success)' : undefined }}>
                  {item.realisasi ? formatRupiah(item.realisasi) : '-'}
                </td>
                <td className="text-right" style={{ fontSize: 11, color: isOver ? 'var(--danger)' : undefined }}>
                  {item.anggaran > 0 ? persen.toFixed(1) + '%' : '-'}
                </td>
                <td>
                  {item.anggaran > 0 && !isHeader && (
                    <div style={{ background: 'var(--border-light)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(persen, 100)}%`, height: '100%', borderRadius: 4, background: isOver ? 'var(--danger)' : persen > 80 ? 'var(--warning)' : 'var(--success)', transition: 'width 0.5s ease' }} />
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
          <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: 'var(--border-light)', fontSize: 13 }}>
            <td colSpan={2}>TOTAL {title}</td>
            <td className="text-right mono">{formatRupiah(totalAnggaran)}</td>
            <td className="text-right mono">{formatRupiah(Math.round(totalAnggaran / 12))}</td>
            <td className="text-right mono">{formatRupiah(totalSdBlnLalu)}</td>
            <td className="text-right mono">{formatRupiah(totalBulanIni)}</td>
            <td className="text-right mono" style={{ color: totalSelisih >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatRupiah(totalRealisasi)}</td>
            <td className="text-right">{totalPersen.toFixed(1)}%</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    )
  }

  // Penerimaan table that mirrors the official RKA "Laporan Realisasi Anggaran —
  // Penerimaan" template: numbered columns, a grouped "Realisasi" header, a per-
  // group subtotal ("Total"), plus "TOTAL PENDAPATAN USAHA" (groups I+II) and the
  // grand "TOTAL PENDAPATAN".
  function PenerimaanTable({ data }) {
    // Format a number the way the template does: thousands separators, no decimals.
    const fmt = (n) => (Number(n) || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    // Percentages use 2 decimals with a comma (e.g. 15,32 / 0,00).
    const fmtPct = (n) => (Number(n) || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    // A right-aligned money cell with the "Rp" label kept to the left, matching the
    // split-column look of the template.
    const Money = ({ value, bold, dark }) => (
      <td className="text-right mono" style={{ fontWeight: bold ? 700 : 400, whiteSpace: 'nowrap', color: dark ? '#1E293B' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: dark ? '#64748B' : 'var(--text-muted)' }}>Rp</span>
          <span>{fmt(value)}</span>
        </div>
      </td>
    )

    // Split the flat hierarchy into top-level groups (I, II, III) and their leaves.
    const groups = data.filter(d => d._depth === 0 && d._hasChildren)
    const leavesOf = (groupKode) => data.filter(d => !d._hasChildren && String(d.kode).startsWith(groupKode + '.'))

    const sumRows = (rows) => rows.reduce((acc, r) => ({
      anggaran: acc.anggaran + (r.anggaran || 0),
      targetBulan: acc.targetBulan + (r.targetBulan || 0),
      sdBlnLalu: acc.sdBlnLalu + (r.sdBlnLalu || 0),
      bulanIni: acc.bulanIni + (r.bulanIni || 0),
      realisasi: acc.realisasi + (r.realisasi || 0),
    }), { anggaran: 0, targetBulan: 0, sdBlnLalu: 0, bulanIni: 0, realisasi: 0 })

    const COLOR_GROUP = 'rgba(59,130,246,0.12)'
    const COLOR_TOTAL = '#FEF9C3' // soft yellow, like the template subtotal rows

    // Build the ordered list of render rows.
    const rows = []
    const usahaGroups = [] // accumulate group I + II for "TOTAL PENDAPATAN USAHA"

    // Leading "Pendapatan" caption row.
    rows.push({ type: 'caption', label: 'Pendapatan' })

    groups.forEach(group => {
      const leaves = leavesOf(group.kode)
      const subtotal = sumRows(leaves)
      const isUsaha = group.kode === '1' || group.kode === '2'
      if (isUsaha) usahaGroups.push(...leaves)

      rows.push({ type: 'group', kode: group.kode, nama: group.nama })
      leaves.forEach(leaf => rows.push({ type: 'leaf', item: leaf }))
      rows.push({ type: 'subtotal', label: 'Total', values: subtotal })

      // After group II, emit the combined "TOTAL PENDAPATAN USAHA".
      if (group.kode === '2') {
        rows.push({ type: 'grandtotal', label: 'TOTAL PENDAPATAN USAHA', values: sumRows(usahaGroups) })
      }
    })

    // Final grand total across every leaf.
    const allLeaves = data.filter(d => !d._hasChildren)
    rows.push({ type: 'grandtotal', label: 'TOTAL PENDAPATAN', values: sumRows(allLeaves) })

    const headStyle = { fontSize: 11, lineHeight: 1.25, verticalAlign: 'middle', textAlign: 'center' }
    const numStyle = { fontSize: 9, fontWeight: 400, color: 'var(--text-muted)', display: 'block' }

    return (
      <table style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...headStyle, width: '24%' }}>Program dan Kegiatan<span style={numStyle}>(3)</span></th>
            <th rowSpan={2} style={{ ...headStyle, width: '10%' }}>Kinerja Indikator<span style={numStyle}>(4)</span></th>
            <th rowSpan={2} style={{ ...headStyle, width: '11%' }}>Target 1 Tahun<span style={numStyle}>(5)</span></th>
            <th rowSpan={2} style={{ ...headStyle, width: '10%' }}>Target {monthLabel}<span style={numStyle}>(6) = (5)/12</span></th>
            <th colSpan={3} style={{ ...headStyle }}>Realisasi</th>
            <th rowSpan={2} style={{ ...headStyle, width: '7%' }}>Capaian %<span style={numStyle}>(10) = (8)/(6)*100</span></th>
            <th rowSpan={2} style={{ ...headStyle, width: '11%' }}>Selisih target jumlah<span style={numStyle}>(11) = (5)-(9)</span></th>
            <th rowSpan={2} style={{ ...headStyle, width: '7%' }}>Deviasi<span style={numStyle}>(12) = (9)/(5)*100</span></th>
          </tr>
          <tr>
            <th style={{ ...headStyle, width: '10%' }}>Sd bln lalu<span style={numStyle}>(7)</span></th>
            <th style={{ ...headStyle, width: '10%' }}>Bulan ini<span style={numStyle}>(8)</span></th>
            <th style={{ ...headStyle, width: '10%' }}>Sd Bulan ini<span style={numStyle}>(9) = (7)+(8)</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            if (row.type === 'caption') {
              return (
                <tr key={idx} style={{ fontWeight: 700 }}>
                  <td colSpan={10} style={{ paddingLeft: 12 }}>{row.label}</td>
                </tr>
              )
            }
            if (row.type === 'group') {
              return (
                <tr key={idx} style={{ background: COLOR_GROUP, fontWeight: 700 }}>
                  <td colSpan={10}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 20, height: 20, borderRadius: 4, background: 'var(--primary)',
                        color: 'white', fontSize: 11, padding: '0 5px'
                      }}>{row.kode}</span>
                      {row.nama.replace(/^[IVX]+\.\s*/, '')}
                    </div>
                  </td>
                </tr>
              )
            }
            if (row.type === 'leaf') {
              const it = row.item
              const selisih = (it.anggaran || 0) - (it.realisasi || 0)
              const deviasi = it.anggaran > 0 ? (it.realisasi / it.anggaran * 100) : 0
              return (
                <tr key={idx} style={{ fontSize: 12 }}>
                  <td style={{ paddingLeft: 20 }}>
                    <span className="mono" style={{ color: 'var(--text-muted)', marginRight: 6 }}>{it.kode}</span>
                    {it.nama}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Jumlah Pendapatan</td>
                  <Money value={it.anggaran} />
                  <Money value={it.targetBulan} />
                  <Money value={it.sdBlnLalu} />
                  <Money value={it.bulanIni} />
                  <Money value={it.realisasi} />
                  <td className="text-right">{fmtPct(it.persen)}</td>
                  <Money value={selisih} />
                  <td className="text-right">{fmtPct(deviasi)}</td>
                </tr>
              )
            }
            // subtotal / grandtotal rows
            const v = row.values
            const selisih = v.anggaran - v.realisasi
            const deviasi = v.anggaran > 0 ? (v.realisasi / v.anggaran * 100) : 0
            const capaian = v.targetBulan > 0 ? (v.bulanIni / v.targetBulan * 100) : 0
            const isGrand = row.type === 'grandtotal'
            return (
              <tr key={idx} style={{ background: COLOR_TOTAL, fontWeight: 700, fontSize: isGrand ? 12.5 : 12, color: '#1E293B' }}>
                <td colSpan={2} style={{ textAlign: isGrand ? 'left' : 'right', paddingRight: 12, paddingLeft: 12, color: '#1E293B' }}>{row.label}</td>
                <Money value={v.anggaran} bold dark />
                <Money value={v.targetBulan} bold dark />
                <Money value={v.sdBlnLalu} bold dark />
                <Money value={v.bulanIni} bold dark />
                <Money value={v.realisasi} bold dark />
                <td className="text-right" style={{ color: '#1E293B' }}>{fmtPct(capaian)}</td>
                <Money value={selisih} bold dark />
                <td className="text-right" style={{ color: '#1E293B' }}>{fmtPct(deviasi)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  // Generic LRA detail table mirroring the official RKA sheet layout (e.g.
  // "Beban Operasional"/"Beban Umum"): numbered nested groups, a grouped
  // "Realisasi" header, per-group "Total" subtotals, and a grand total. Works at
  // any nesting depth. `kinerja` = the Kinerja Indikator label.
  function LRADetailTable({ data, title, kinerja }) {
    const fmt = (n) => (Number(n) || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    const fmtPct = (n) => (Number(n) || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const Money = ({ value, bold, dark }) => (
      <td className="text-right mono" style={{ fontWeight: bold ? 700 : 400, whiteSpace: 'nowrap', color: dark ? '#1E293B' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: dark ? '#64748B' : 'var(--text-muted)' }}>Rp</span>
          <span>{fmt(value)}</span>
        </div>
      </td>
    )
    const sumRows = (rows) => rows.reduce((a, r) => ({
      anggaran: a.anggaran + (r.anggaran || 0), targetBulan: a.targetBulan + (r.targetBulan || 0),
      sdBlnLalu: a.sdBlnLalu + (r.sdBlnLalu || 0), bulanIni: a.bulanIni + (r.bulanIni || 0), realisasi: a.realisasi + (r.realisasi || 0),
    }), { anggaran: 0, targetBulan: 0, sdBlnLalu: 0, bulanIni: 0, realisasi: 0 })

    const parentKodeOf = (k) => { const s = String(k); const i = s.lastIndexOf('.'); return i < 0 ? null : s.slice(0, i) }
    const byKode = {}; data.forEach(d => { byKode[d.kode] = d })
    const childrenMap = {}
    data.forEach(d => { const p = parentKodeOf(d.kode); if (p) (childrenMap[p] = childrenMap[p] || []).push(d) })
    const isLeafParent = (k) => (childrenMap[k] || []).length > 0 && childrenMap[k].every(c => !c._hasChildren)

    const renderRows = [{ type: 'caption' }]
    // Beban Operasional shows an intermediate "Jumlah Beban Operasional Perpasaran"
    // subtotal (groups I+II+III) just before the "Beban Pokok" group (IV), mirroring
    // the lampiran.
    const isOps = title === 'BEBAN OPERASIONAL'

    // Beban Investasi mirrors the " Investasi" lampiran layout EXACTLY: each
    // top-level program (depth 0) is a header row, its sub-programs (1.x) and the
    // detail rincian rows (1.x.y) are value rows, and a SINGLE "Total" row closes
    // each program (Σ of that program's leaf rows = the program roll-up). There
    // are no intermediate per-1.x subtotals — the Excel only totals at the
    // program boundary and once more at the grand "TOTAL INVESTASI".
    const isInvestasi = title === 'BEBAN INVESTASI'
    // Map: kode of a program's LAST descendant (in render order) → the program
    // (depth-0) node, so we can drop the program Total right after it.
    const programTotalAfter = {}
    if (isInvestasi) {
      data.filter(d => (d._depth || 0) === 0 && d._hasChildren).forEach(g => {
        const descs = data.filter(d => String(d.kode).startsWith(String(g.kode) + '.'))
        if (descs.length) programTotalAfter[descs[descs.length - 1].kode] = g
      })
    }

    data.forEach(node => {
      if (isOps && node._hasChildren && (node._depth || 0) === 0 && String(node.kode) === '4') {
        const perpasaranLeaves = data.filter(d => !d._hasChildren && /^[123]\./.test(String(d.kode)))
        renderRows.push({ type: 'subtotalbar', label: 'Jumlah Beban Operasional Perpasaran', values: sumRows(perpasaranLeaves) })
      }

      if (isInvestasi) {
        // Only the top-level program is a header; every line below it (sub-program
        // 1.x and detail rincian 1.x.y) renders as a value row so the budget and
        // realization show on each line exactly like the lampiran.
        const isTopGroup = (node._depth || 0) === 0 && node._hasChildren
        renderRows.push({ type: isTopGroup ? 'group' : 'leaf', node })
        if (programTotalAfter[node.kode]) renderRows.push({ type: 'total', node: programTotalAfter[node.kode] })
        return
      }

      renderRows.push({ type: node._hasChildren ? 'group' : 'leaf', node })
      if (!node._hasChildren) {
        const p = parentKodeOf(node.kode)
        const parent = byKode[p]
        if (parent && isLeafParent(p)) {
          const sibs = childrenMap[p]
          if (sibs[sibs.length - 1].kode === node.kode) renderRows.push({ type: 'total', node: parent })
        }
      }
    })
    // Investasi: sum the top-level program roll-ups — a journal that resolved
    // only to a program outline (no rincian text in the upload) lives on that
    // program's header row and would be lost by a leaves-only sum.
    renderRows.push({ type: 'grandtotal', label: `TOTAL ${title}`, values: sumRows(isInvestasi ? data.filter(d => (d._depth || 0) === 0 && d._hasChildren) : data.filter(d => !d._hasChildren)) })

    const COLOR_GROUP = 'rgba(59,130,246,0.12)'
    const COLOR_TOTAL = '#FEF9C3'
    const headStyle = { fontSize: 11, lineHeight: 1.25, verticalAlign: 'middle', textAlign: 'center' }
    const numStyle = { fontSize: 9, fontWeight: 400, color: 'var(--text-muted)', display: 'block' }
    const valuesOf = (n) => ({ anggaran: n.anggaran || 0, targetBulan: n.targetBulan || 0, sdBlnLalu: n.sdBlnLalu || 0, bulanIni: n.bulanIni || 0, realisasi: n.realisasi || 0 })

    return (
      <table style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...headStyle, width: '24%' }}>Program dan Kegiatan<span style={numStyle}>(3)</span></th>
            <th rowSpan={2} style={{ ...headStyle, width: '10%' }}>Kinerja Indikator<span style={numStyle}>(4)</span></th>
            <th rowSpan={2} style={{ ...headStyle, width: '11%' }}>Anggaran 1 Tahun<span style={numStyle}>(5)</span></th>
            <th rowSpan={2} style={{ ...headStyle, width: '10%' }}>Anggaran {monthLabel}<span style={numStyle}>(6) = (5)/12</span></th>
            <th colSpan={3} style={{ ...headStyle }}>Realisasi</th>
            <th rowSpan={2} style={{ ...headStyle, width: '7%' }}>Capaian %<span style={numStyle}>(10) = (8)/(6)*100</span></th>
            <th rowSpan={2} style={{ ...headStyle, width: '11%' }}>Selisih target jumlah<span style={numStyle}>(11) = (5)-(9)</span></th>
            <th rowSpan={2} style={{ ...headStyle, width: '7%' }}>Deviasi<span style={numStyle}>(12) = (9)/(5)*100</span></th>
          </tr>
          <tr>
            <th style={{ ...headStyle }}>Sd bln lalu<span style={numStyle}>(7)</span></th>
            <th style={{ ...headStyle }}>Bulan ini<span style={numStyle}>(8)</span></th>
            <th style={{ ...headStyle }}>Sd Bulan ini<span style={numStyle}>(9) = (7)+(8)</span></th>
          </tr>
        </thead>
        <tbody>
          {renderRows.map((row, idx) => {
            if (row.type === 'caption') return (
              <tr key={idx} style={{ fontWeight: 700 }}><td colSpan={10} style={{ paddingLeft: 12 }}>{title}</td></tr>
            )
            if (row.type === 'group') {
              const depth = row.node._depth || 0
              return (
                <tr key={idx} style={{ background: depth === 0 ? COLOR_GROUP : 'rgba(59,130,246,0.05)', fontWeight: depth === 0 ? 700 : 600 }}>
                  <td colSpan={10}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 + depth * 18 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 20, borderRadius: 4, background: depth === 0 ? 'var(--primary)' : 'var(--text-muted)', color: 'white', fontSize: 11, padding: '0 5px' }}>{row.node.kode}</span>
                      {String(row.node.nama).replace(/^[IVX]+\.\s*/, '')}
                    </div>
                  </td>
                </tr>
              )
            }
            if (row.type === 'leaf') {
              const it = row.node, depth = it._depth || 0
              const selisih = (it.anggaran || 0) - (it.realisasi || 0)
              const deviasi = it.anggaran > 0 ? (it.realisasi / it.anggaran * 100) : 0
              // For Beban Investasi, the sub-program lines (1.x — the lampiran's
              // "Jumlah Biaya" rows) are emphasized so they stand apart from the
              // indented detail rincian rows beneath them.
              const isSubProgram = isInvestasi && depth === 1
              return (
                <tr key={idx} style={{ fontSize: 12, fontWeight: isSubProgram ? 600 : 400, background: isSubProgram ? 'rgba(59,130,246,0.04)' : undefined }}>
                  <td style={{ paddingLeft: 20 + depth * 14 }}>
                    <span className="mono" style={{ color: 'var(--text-muted)', marginRight: 6 }}>{it.kode}</span>{it.nama}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{kinerja}</td>
                  <Money value={it.anggaran} /><Money value={it.targetBulan} /><Money value={it.sdBlnLalu} />
                  <Money value={it.bulanIni} /><Money value={it.realisasi} />
                  <td className="text-right">{fmtPct(it.persen)}</td>
                  <Money value={selisih} />
                  <td className="text-right">{fmtPct(deviasi)}</td>
                </tr>
              )
            }
            const v = row.type === 'total' ? valuesOf(row.node) : row.values
            const selisih = v.anggaran - v.realisasi
            const deviasi = v.anggaran > 0 ? (v.realisasi / v.anggaran * 100) : 0
            const capaian = v.targetBulan > 0 ? (v.bulanIni / v.targetBulan * 100) : 0
            const isGrand = row.type === 'grandtotal'
            const isBar = row.type === 'subtotalbar'
            const label = row.type === 'total' ? 'Total' : row.label
            return (
              <tr key={idx} style={{ background: isBar ? '#E0E7FF' : COLOR_TOTAL, fontWeight: 700, fontSize: isGrand || isBar ? 12.5 : 12, color: '#1E293B' }}>
                <td colSpan={2} style={{ textAlign: isBar ? 'left' : 'right', paddingRight: 12, paddingLeft: 12, color: '#1E293B' }}>{label}</td>
                <Money value={v.anggaran} bold dark /><Money value={v.targetBulan} bold dark /><Money value={v.sdBlnLalu} bold dark />
                <Money value={v.bulanIni} bold dark /><Money value={v.realisasi} bold dark />
                <td className="text-right" style={{ color: '#1E293B' }}>{fmtPct(capaian)}</td>
                <Money value={selisih} bold dark />
                <td className="text-right" style={{ color: '#1E293B' }}>{fmtPct(deviasi)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  function RekapTable({ data, title }) {
    const leafItems = data.filter(d => !d._hasChildren)
    // Investasi: total via the top-level program roll-ups — realization that
    // resolved only to a program outline (no rincian text in the upload) sits
    // on the program header row and a leaves-only sum would drop it.
    const totalItems = title === 'BEBAN INVESTASI'
      ? data.filter(d => (d._depth || 0) === 0 && d._hasChildren)
      : leafItems
    const totalAnggaran = totalItems.reduce((s, d) => s + d.anggaran, 0)
    const totalRealisasi = totalItems.reduce((s, d) => s + d.realisasi, 0)

    const visibleData = []
    const collapsedParents = new Set()

    data.forEach(item => {
      const kode = String(item.kode)
      const isHidden = [...collapsedParents].some(pk => kode.startsWith(pk + '.'))
      if (isHidden) return

      if (item._hasChildren && collapsed[kode]) {
        collapsedParents.add(kode)
      }
      visibleData.push(item)
    })

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
          <div className="kpi-card" style={{ textAlign: 'center' }}>
            <div className="kpi-label" style={{ justifyContent: 'center' }}>Total Anggaran</div>
            <div className="kpi-value" style={{ color: 'var(--primary)' }}>{formatRupiah(totalAnggaran)}</div>
          </div>
          <div className="kpi-card" style={{ textAlign: 'center' }}>
            <div className="kpi-label" style={{ justifyContent: 'center' }}>Total Realisasi</div>
            <div className="kpi-value" style={{ color: 'var(--success)' }}>{formatRupiah(totalRealisasi)}</div>
          </div>
          <div className="kpi-card" style={{ textAlign: 'center' }}>
            <div className="kpi-label" style={{ justifyContent: 'center' }}>Sisa Anggaran</div>
            <div className="kpi-value" style={{ color: (totalAnggaran - totalRealisasi) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatRupiah(totalAnggaran - totalRealisasi)}
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{width:'15%'}}>No/Kode</th>
              <th style={{width:'35%'}}>Uraian</th>
              <th className="text-right" style={{width:'15%'}}>Anggaran</th>
              <th className="text-right" style={{width:'15%'}}>Realisasi Sd Periode Ini</th>
              <th className="text-right" style={{width:'10%'}}>%</th>
              <th className="text-center" style={{width:'10%'}}>Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleData.map((item) => {
              const kode = String(item.kode)
              const depth = item._depth || 0
              const isHeader = item._hasChildren
              const isCollapsed = collapsed[kode]
              const pct = item.persen || 0
              const status = pct >= 100 ? 'Terealisasi' : pct >= 75 ? 'Hampir' : pct >= 50 ? 'Berjalan' : pct > 0 ? 'Rendah' : 'Belum'
              const badge = pct >= 100 ? 'green' : pct >= 75 ? 'blue' : pct >= 50 ? 'orange' : 'red'

              return (
                <tr key={kode} style={{
                  fontWeight: depth === 0 ? 700 : depth === 1 && isHeader ? 600 : 400,
                  background: depth === 0 ? 'var(--bg-secondary)' : depth === 1 && isHeader ? 'rgba(255,255,255,0.02)' : 'transparent',
                  borderTop: depth === 0 ? '2px solid var(--border)' : undefined,
                  color: item.is_total ? 'var(--primary)' : undefined,
                  fontSize: 12,
                }}>
                  <td className="mono" style={{ paddingLeft: 8 + depth * 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isHeader && (
                        <span style={{ cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }} onClick={() => toggleCollapse(kode)}>
                          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        </span>
                      )}
                      {kode}
                    </div>
                  </td>
                  <td style={{ paddingLeft: 8 + depth * 12, fontWeight: depth <= 1 && isHeader ? 600 : 400 }}>
                    {item.nama}
                  </td>
                  <td className="text-right mono">{item.anggaran ? formatRupiah(item.anggaran) : '-'}</td>
                  <td className="text-right mono">{item.realisasi ? formatRupiah(item.realisasi) : '-'}</td>
                  <td className="text-right">{item.anggaran > 0 ? pct.toFixed(1) + '%' : '-'}</td>
                  <td className="text-center">{!isHeader && item.anggaran > 0 && <span className={`badge ${badge}`}>{status}</span>}</td>
                </tr>
              )
            })}
            <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: 'var(--border-light)', fontSize: 13 }}>
              <td colSpan={2}>JUMLAH {title}</td>
              <td className="text-right mono">{formatRupiah(totalAnggaran)}</td>
              <td className="text-right mono">{formatRupiah(totalRealisasi)}</td>
              <td className="text-right">{totalAnggaran > 0 ? (totalRealisasi / totalAnggaran * 100).toFixed(1) : 0}%</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  function getActiveTitle() {
    if (activeTab.includes('penerimaan')) return 'PENERIMAAN'
    if (activeTab.includes('investasi')) return 'BEBAN INVESTASI'
    if (activeTab.includes('beban-ops')) return 'BEBAN OPERASIONAL'
    if (activeTab.includes('beban-umum')) return 'BEBAN UMUM'
    return ''
  }

  const isRekap = activeTab.startsWith('rekap')
  const subtitle = isRekap
    ? `Rekapitulasi ${getActiveTitle()} — Per Bulan ${monthLabel} 2026`
    : `Tabel ${getActiveTitle()} — Periode ${monthLabel} 2026`

  function handleExport() {
    const title = getActiveTitle()
    const rows = lraData.filter(d => !d._hasChildren).map(d => [
      d.kode, d.nama,
      d.anggaran, Math.round(d.targetBulan),
      d.sdBlnLalu, d.bulanIni, d.realisasi,
      d.persen.toFixed(1) + '%'
    ])
    const ws = XLSX.utils.aoa_to_sheet([
      [`LRA ${title} — ${monthLabel} 2026`], [],
      ['No/Kode', 'Program / Kegiatan', 'Anggaran 1 Thn', 'Target/Bln', 'Sd Bln Lalu', 'Bulan Ini', 'Sd Bln Ini', '%'],
      ...rows
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `LRA ${title}`)
    XLSX.writeFile(wb, `LRA_${title}_${selectedMonth}.xlsx`)
  }

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Laporan Realisasi Anggaran</h1>
          <p>LRA — Sesuai Standar Akuntansi Keuangan Entitas Privat (SAK EP)</p>
        </div>
        <button className="btn btn-outline" onClick={() => printReport('LRA — Perumda Pasar Baiman')}>
          <Printer size={16} /> Cetak Laporan
        </button>
      </div>

      {/* Month Selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <Calendar size={16} color="var(--primary)" />
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Periode:</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {MONTHS.map(m => (
              <button
                key={m.value}
                onClick={() => setSelectedMonth(m.value)}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  border: m.isAudit ? '1px solid var(--primary)' : '1px solid transparent',
                  background: selectedMonth === m.value ? 'var(--primary)' : 'var(--border-light)',
                  color: selectedMonth === m.value ? 'white' : 'var(--text-muted)',
                  fontWeight: selectedMonth === m.value || m.isAudit ? 600 : 400,
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
              >
                {m.label}
                {m.isAudit && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, background: 'var(--success)', borderRadius: '50%', border: '2px solid var(--bg-primary)' }} />}
              </button>
            ))}
          </div>
        </div>
        {/* TW / Semester / Tahunan Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Presets:</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PERIOD_PRESETS.map(p => (
                    <button key={p.value} onClick={() => setSelectedMonth(p.value)} style={{
                        padding: '4px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                        border: '1px solid var(--border)',
                        background: selectedMonth === p.value ? 'var(--primary)' : 'transparent',
                        color: selectedMonth === p.value ? 'white' : 'var(--text-muted)',
                        fontWeight: selectedMonth === p.value ? 600 : 400,
                        transition: 'all 0.2s'
                    }}>
                        {p.label}
                    </button>
                ))}
            </div>
        </div>
        {!MONTHS.find(m => m.value === selectedMonth)?.isAudit && !PERIOD_PRESETS.find(p => p.value === selectedMonth) && (
          <div style={{ fontSize: 11, color: 'var(--warning)', paddingLeft: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>✅ Data audit tersedia untuk bulan Januari – April 2026 (641 jurnal dari 4 bulan).</span>
          </div>
        )}
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {lraTabs.map(tab => (
          <button key={tab.id} className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setActiveTab(tab.id)}>
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="report-doc">
        <ReportHeader
          title={`LAPORAN REALISASI ANGGARAN — ${getActiveTitle()}`}
          subtitle={subtitle}
          onPrint={() => printReport(`LRA ${getActiveTitle()}`)}
          onExport={handleExport}
        />
        <div className="report-doc-body lra-report-body">
          {isRekap
            ? <RekapTable data={lraData} title={getActiveTitle()} />
            : activeTab === 'penerimaan'
              ? <PenerimaanTable data={lraData} />
              : <LRADetailTable data={lraData} title={getActiveTitle()} kinerja="Jumlah Biaya" />
          }
        </div>
      </div>
    </div>
  )
}
