/**
 * PERUMDA PASAR BANJARMASIN — Role & Approval Configuration
 *
 * Sesuai dengan:
 *   - SOP Dokumen Permintaan
 *   - SOP Pembayaran Barang dan Jasa
 *   - SOP Penyampaian Laporan Keuangan
 *   - SOP Rekonsiliasi Bulanan
 *
 * Struktur organisasi:
 *   Dewan Pengawas
 *   Direktur Utama
 *   ├── Direktur Bisnis & Operasional
 *   │   ├── Divisi Bisnis (Manager Bisnis, SPV, Kepala Gudang, Kasir, Staff)
 *   │   ├── Divisi Operasional (Manager Ops, SPV, Staff)
 *   │   └── Kepala Pasar Zona 1/2/3 (Koordinator, Kasir+Admin, Staff Penagihan)
 *   ├── Direktur Umum & Keuangan
 *   │   ├── Divisi Keuangan (Manager Keuangan, SPV, Staff Keuangan & Perpajakan)
 *   │   └── Divisi Umum (Manager Umum, Manager IT, Sekretaris, SPV, Staff)
 *   └── SPI (Satuan Pengawas Internal)
 */

// ─── Canonical role values (used in DB, API headers, localStorage) ───────────
export const ROLE = {
  // Governance
  DEWAN_PENGAWAS:     'dewan_pengawas',
  DIREKTUR_UTAMA:     'direktur_utama',

  // Direktorat Bisnis & Operasional
  DIREKTUR_BISNIS:    'direktur_bisnis_operasional',
  MGR_BISNIS:         'manager_bisnis',
  SPV_BISNIS:         'spv_bisnis',
  SPV_PEMASARAN:      'spv_pemasaran',
  KEPALA_GUDANG:      'kepala_gudang',
  KASIR_BISNIS:       'kasir_bisnis',
  STAFF_BISNIS:       'staff_bisnis',

  MGR_OPERASIONAL:    'manager_operasional',
  SPV_PENAGIHAN:      'spv_penagihan',
  SPV_SARPRAS:        'spv_sarpras',
  STAFF_OPERASIONAL:  'staff_operasional',

  KEPALA_PASAR:       'kepala_pasar',       // Zona 1/2/3 — differentiated by divisi field
  KOORDINATOR_PASAR:  'koordinator_pasar',
  KASIR_PASAR:        'kasir_pasar',
  STAFF_PENAGIHAN:    'staff_penagihan',

  // Direktorat Umum & Keuangan
  DIREKTUR_UMUM_KEU:  'direktur_umum_keuangan',
  MGR_KEUANGAN:       'manager_keuangan',
  SPV_ANGGARAN:       'spv_anggaran',
  SPV_AKUNTANSI:      'spv_akuntansi',
  STAFF_KEUANGAN:     'staff_keuangan',     // includes Perpajakan

  MGR_UMUM:           'manager_umum',
  MGR_IT:             'manager_it',
  SEKRETARIS:         'sekretaris',
  SPV_HUKUM:          'spv_hukum',
  SPV_UMUM:           'spv_umum',
  STAFF_UMUM:         'staff_umum',         // PBJ, Hukum, CS&GA, Keamanan

  // SPI
  SPI:                'spi',
  STAFF_SPI:          'staff_spi',

  // System
  ADMIN:              'admin',
  SUPER_ADMIN:        'super_admin',
}

// ─── Human-readable label + divisi + hak akses singkat ───────────────────────
export const ROLE_META = [
  // ── Governance ──
  { value: ROLE.DEWAN_PENGAWAS,    label: 'Dewan Pengawas',              divisi: 'Governance',         desc: 'Pengawas tertinggi — lihat semua laporan' },
  { value: ROLE.DIREKTUR_UTAMA,    label: 'Direktur Utama',              divisi: 'Direksi',            desc: 'Approve semua — termasuk > Rp 50 jt (SOP Pembayaran)' },

  // ── Direktorat Bisnis & Operasional ──
  { value: ROLE.DIREKTUR_BISNIS,   label: 'Direktur Bisnis & Operasional', divisi: 'Direksi',          desc: 'Approve operasional & bisnis' },
  { value: ROLE.MGR_BISNIS,        label: 'Manager Bisnis',               divisi: 'Divisi Bisnis',     desc: 'Approve permintaan divisi bisnis < Rp 1 jt' },
  { value: ROLE.SPV_BISNIS,        label: 'SPV Pengelolaan & Pengembangan Bisnis', divisi: 'Divisi Bisnis', desc: 'Input transaksi bisnis, lihat laporan' },
  { value: ROLE.SPV_PEMASARAN,     label: 'SPV Pemasaran',                divisi: 'Divisi Bisnis',     desc: 'Input piutang & SO, lihat laporan' },
  { value: ROLE.KEPALA_GUDANG,     label: 'Kepala Gudang',                divisi: 'Divisi Bisnis',     desc: 'Kelola persediaan & aset gudang' },
  { value: ROLE.KASIR_BISNIS,      label: 'Kasir (Bisnis)',               divisi: 'Divisi Bisnis',     desc: 'Input voucher kas, cetak, lihat laporan' },
  { value: ROLE.STAFF_BISNIS,      label: 'Staff/Admin Bisnis',           divisi: 'Divisi Bisnis',     desc: 'Input data, lihat laporan terbatas' },

  { value: ROLE.MGR_OPERASIONAL,   label: 'Manager Operasional',          divisi: 'Divisi Operasional', desc: 'Approve permintaan operasional < Rp 1 jt' },
  { value: ROLE.SPV_PENAGIHAN,     label: 'SPV Penagihan & Pemberdayaan Pedagang', divisi: 'Divisi Operasional', desc: 'Kelola piutang & penagihan' },
  { value: ROLE.SPV_SARPRAS,       label: 'SPV Pemeliharaan SarPras & Lingkungan', divisi: 'Divisi Operasional', desc: 'Input PO, kelola aset & pemeliharaan' },
  { value: ROLE.STAFF_OPERASIONAL, label: 'Staff/Admin Operasional',      divisi: 'Divisi Operasional', desc: 'Input data operasional' },

  { value: ROLE.KEPALA_PASAR,      label: 'Kepala Pasar (Zona)',          divisi: 'Pasar',             desc: 'Kelola transaksi & laporan zona pasar' },
  { value: ROLE.KOORDINATOR_PASAR, label: 'Koordinator Kebersihan & Keamanan', divisi: 'Pasar',       desc: 'Input laporan operasional pasar' },
  { value: ROLE.KASIR_PASAR,       label: 'Kasir + Admin Pasar',          divisi: 'Pasar',             desc: 'Input voucher kas, cetak, lihat laporan pasar' },
  { value: ROLE.STAFF_PENAGIHAN,   label: 'Staff Penagihan Pasar',        divisi: 'Pasar',             desc: 'Input penagihan & piutang pasar' },

  // ── Direktorat Umum & Keuangan ──
  { value: ROLE.DIREKTUR_UMUM_KEU, label: 'Direktur Umum & Keuangan',    divisi: 'Direksi',           desc: 'Approve pembayaran > Rp 1 jt (SOP Pembayaran)' },
  { value: ROLE.MGR_KEUANGAN,      label: 'Manager Keuangan',             divisi: 'Divisi Keuangan',   desc: 'Approve pembayaran, kunci periode, verifikasi rekon' },
  { value: ROLE.SPV_ANGGARAN,      label: 'SPV Perencanaan & Anggaran',   divisi: 'Divisi Keuangan',   desc: 'Kelola anggaran, LRA, input jurnal' },
  { value: ROLE.SPV_AKUNTANSI,     label: 'SPV Akuntansi & Pelaporan',    divisi: 'Divisi Keuangan',   desc: 'Senior Accounting — closing jurnal, rekon, laporan' },
  { value: ROLE.STAFF_KEUANGAN,    label: 'Staff Keuangan & Perpajakan',  divisi: 'Divisi Keuangan',   desc: 'Input jurnal, piutang/hutang, e-Faktur' },

  { value: ROLE.MGR_UMUM,          label: 'Manager Umum',                 divisi: 'Divisi Umum',       desc: 'Approve permintaan umum < Rp 1 jt' },
  { value: ROLE.MGR_IT,            label: 'Manager IT',                   divisi: 'Divisi Umum',       desc: 'Akses sistem, backup & restore, user management' },
  { value: ROLE.SEKRETARIS,        label: 'Sekretaris',                   divisi: 'Divisi Umum',       desc: 'Lihat laporan, cetak dokumen' },
  { value: ROLE.SPV_HUKUM,         label: 'SPV Hukum',                    divisi: 'Divisi Umum',       desc: 'Lihat laporan hukum & kontrak' },
  { value: ROLE.SPV_UMUM,          label: 'SPV Umum',                     divisi: 'Divisi Umum',       desc: 'Input permintaan umum & PBJ' },
  { value: ROLE.STAFF_UMUM,        label: 'Staff Umum',                   divisi: 'Divisi Umum',       desc: 'Input data & dokumen umum' },

  // ── SPI ──
  { value: ROLE.SPI,               label: 'SPI (Satuan Pengawas Internal)', divisi: 'SPI',             desc: 'Audit — lihat semua data read-only, akses audit log' },
  { value: ROLE.STAFF_SPI,         label: 'Staff SPI',                    divisi: 'SPI',               desc: 'Audit read-only, akses laporan' },

  // ── System ──
  { value: ROLE.ADMIN,             label: 'Admin Sistem',                 divisi: 'IT/Sistem',         desc: 'Akses penuh + user management' },
  { value: ROLE.SUPER_ADMIN,       label: 'Super Admin',                  divisi: 'IT/Sistem',         desc: 'Akses penuh + unlock periode + reset data' },
]

// ─── Role groupings for RBAC ──────────────────────────────────────────────────

/** Semua role — bisa baca data dasar */
export const ALL_ROLES = ROLE_META.map(r => r.value)

/** Role yang bisa membaca data keuangan */
export const FINANCE_READ = [
  ROLE.DEWAN_PENGAWAS, ROLE.DIREKTUR_UTAMA, ROLE.DIREKTUR_BISNIS,
  ROLE.DIREKTUR_UMUM_KEU, ROLE.MGR_KEUANGAN, ROLE.SPV_ANGGARAN,
  ROLE.SPV_AKUNTANSI, ROLE.STAFF_KEUANGAN, ROLE.MGR_BISNIS,
  ROLE.MGR_OPERASIONAL, ROLE.KEPALA_PASAR, ROLE.SPI, ROLE.STAFF_SPI,
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
]

/** Role yang bisa input jurnal & voucher (Staff Accounting ke atas) */
export const JOURNAL_WRITE = [
  ROLE.STAFF_KEUANGAN, ROLE.SPV_AKUNTANSI, ROLE.SPV_ANGGARAN,
  ROLE.MGR_KEUANGAN, ROLE.ADMIN, ROLE.SUPER_ADMIN,
]

/** Role yang bisa input voucher kas (Kasir) */
export const VOUCHER_INPUT = [
  ROLE.KASIR_BISNIS, ROLE.KASIR_PASAR, ROLE.STAFF_KEUANGAN,
  ROLE.SPV_AKUNTANSI, ROLE.MGR_KEUANGAN, ROLE.ADMIN, ROLE.SUPER_ADMIN,
]

/**
 * APPROVAL HIERARCHY (SOP Pembayaran Barang & Jasa):
 *
 *  < Rp 1.000.000   → Manajer Departemen
 *  > Rp 1.000.000   → Direktur Umum & Keuangan
 *  > Rp 50.000.000  → Direktur Utama
 *
 * SOP Laporan Keuangan — closing cycle:
 *   Tgl 1: Rekonsiliasi  → Staff Accounting
 *   Tgl 2: Closing Jurnal → Senior Accounting (SPV Akuntansi)
 *   Tgl 2-3: Penyusunan Draft → Manager Keuangan
 *   Tgl 4: Review & Verifikasi → Direktur Umum & Keuangan
 *   Tgl 5: Penyajian Laporan → Selesai
 */
export const APPROVAL_THRESHOLDS = {
  MANAGER:  1_000_000,    // < 1 jt: Manajer Departemen cukup
  DIREKTUR: 50_000_000,   // > 50 jt: Direktur Utama
}

/** Role yang bisa approve jurnal/voucher (SOP: Manager ke atas) */
export const APPROVE_ROLES = [
  ROLE.MGR_BISNIS, ROLE.MGR_OPERASIONAL, ROLE.KEPALA_PASAR,
  ROLE.MGR_KEUANGAN, ROLE.MGR_UMUM,
  ROLE.DIREKTUR_BISNIS, ROLE.DIREKTUR_UMUM_KEU, ROLE.DIREKTUR_UTAMA,
  ROLE.SPV_AKUNTANSI,   // Senior Accounting juga bisa approve jurnal
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
]

/** Role yang bisa approve pembayaran > Rp 1 jt (Direktur Umum & Keuangan ke atas) */
export const APPROVE_HIGH = [
  ROLE.DIREKTUR_UMUM_KEU, ROLE.DIREKTUR_UTAMA,
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
]

/** Role yang bisa approve pembayaran > Rp 50 jt (Direktur Utama saja) */
export const APPROVE_VERY_HIGH = [
  ROLE.DIREKTUR_UTAMA, ROLE.SUPER_ADMIN,
]

/** Role yang bisa kunci periode (Manager Keuangan ke atas) */
export const LOCK_ROLES = [
  ROLE.MGR_KEUANGAN, ROLE.SPV_AKUNTANSI,
  ROLE.DIREKTUR_UMUM_KEU, ROLE.DIREKTUR_UTAMA,
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
]

/** Role yang bisa buka kunci periode — hanya admin level */
export const UNLOCK_ROLES = [ROLE.ADMIN, ROLE.SUPER_ADMIN]

/** Role yang bisa kelola COA & master data */
export const COA_WRITE = [
  ROLE.SPV_AKUNTANSI, ROLE.MGR_KEUANGAN, ROLE.ADMIN, ROLE.SUPER_ADMIN,
]

/** Role yang bisa kelola piutang */
export const AR_WRITE = [
  ROLE.SPV_PENAGIHAN, ROLE.STAFF_PENAGIHAN, ROLE.KASIR_PASAR,
  ROLE.STAFF_KEUANGAN, ROLE.SPV_AKUNTANSI, ROLE.ADMIN, ROLE.SUPER_ADMIN,
]

/** Role yang bisa kelola hutang / PO */
export const AP_WRITE = [
  ROLE.SPV_SARPRAS, ROLE.SPV_UMUM, ROLE.STAFF_UMUM,
  ROLE.STAFF_KEUANGAN, ROLE.SPV_AKUNTANSI, ROLE.ADMIN, ROLE.SUPER_ADMIN,
]

/** Role yang bisa kelola persediaan / gudang */
export const INVENTORY_WRITE = [
  ROLE.KEPALA_GUDANG, ROLE.STAFF_BISNIS, ROLE.KOORDINATOR_PASAR,
  ROLE.STAFF_KEUANGAN, ROLE.ADMIN, ROLE.SUPER_ADMIN,
]

/** Role yang bisa kelola e-Faktur & pajak */
export const TAX_WRITE = [
  ROLE.STAFF_KEUANGAN, ROLE.SPV_AKUNTANSI, ROLE.ADMIN, ROLE.SUPER_ADMIN,
]

/** Role yang bisa input giro */
export const GIRO_WRITE = [
  ROLE.KASIR_BISNIS, ROLE.KASIR_PASAR, ROLE.STAFF_KEUANGAN,
  ROLE.SPV_AKUNTANSI, ROLE.ADMIN, ROLE.SUPER_ADMIN,
]

/** Role yang bisa backup/restore & user management (IT level) */
export const SYSTEM_ADMIN = [ROLE.MGR_IT, ROLE.ADMIN, ROLE.SUPER_ADMIN]

/** Read-only auditor roles */
export const AUDIT_READ = [ROLE.SPI, ROLE.STAFF_SPI, ROLE.DEWAN_PENGAWAS]

/**
 * SOP Rekonsiliasi Bulanan — timeline:
 *   Tgl 1: Pengumpulan data → Staff Akuntansi
 *   Tgl 1-3: Identifikasi & Investigasi selisih → Staff Akuntansi
 *   Tgl 3-4: Jurnal Koreksi → Senior Akuntansi (SPV Akuntansi)
 *   Tgl 4: Verifikasi akhir → Manager Keuangan
 *   Tgl 5: Otorisasi & Arsip → Direktur Umum & Keuangan
 *
 * Kebijakan selisih:
 *   Immaterial (< Rp 50.000): sesuaikan langsung oleh Staff Akuntansi
 *   Material: lapor ke Direksi untuk diaudit
 */
export const REKON_THRESHOLDS = {
  IMMATERIAL: 50_000,  // < 50 rb: staff akuntansi bisa sesuaikan langsung
}

// ─── Helper: get label from role value ───────────────────────────────────────
export function getRoleLabel(roleValue) {
  return ROLE_META.find(r => r.value === roleValue)?.label || roleValue
}

export function getRoleDivisi(roleValue) {
  return ROLE_META.find(r => r.value === roleValue)?.divisi || '-'
}

export function getRoleDesc(roleValue) {
  return ROLE_META.find(r => r.value === roleValue)?.desc || ''
}

/** Group ROLE_META by divisi */
export const ROLES_BY_DIVISI = ROLE_META.reduce((acc, r) => {
  if (!acc[r.divisi]) acc[r.divisi] = []
  acc[r.divisi].push(r)
  return acc
}, {})

/** Check if a role can approve a payment of a given amount */
export function canApproveAmount(role, amount) {
  if (amount < APPROVAL_THRESHOLDS.MANAGER) {
    // Any Manager or above
    return APPROVE_ROLES.includes(role)
  }
  if (amount < APPROVAL_THRESHOLDS.DIREKTUR) {
    // Direktur Umum & Keuangan or above
    return APPROVE_HIGH.includes(role)
  }
  // >= 50 jt: Direktur Utama only
  return APPROVE_VERY_HIGH.includes(role)
}

/** Return the minimum required approver label for a given amount */
export function requiredApproverLabel(amount) {
  if (amount < APPROVAL_THRESHOLDS.MANAGER)  return 'Manajer Departemen'
  if (amount < APPROVAL_THRESHOLDS.DIREKTUR) return 'Direktur Umum & Keuangan'
  return 'Direktur Utama'
}
