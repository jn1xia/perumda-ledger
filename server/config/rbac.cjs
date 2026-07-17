// =============================================================================
// SERVER-SIDE RBAC CONFIG — single source of truth
// =============================================================================
//
// Mirrors src/data/roles.js on the backend. Before this module the server had
// THREE divergent copies of the role groups (the ALL_ROLES/_FIN/_SG… block, the
// per-module *_ROLES constants, and the legacy ALL_READ/FIN_WRITE set) which had
// drifted apart — e.g. the report endpoints allowed only legacy role names, so
// every new canonical role (staff_keuangan, manager_keuangan, direktur_utama, …)
// got a 403. Everything now derives from the groups defined here.
//
// Legacy aliases (akuntan, auditor, manajer_keuangan, direktur, kasir,
// staff_gudang, staff_pembelian, staff_pajak) are kept in the groups for
// backward compatibility with any session/token still carrying an old role.
//
// Approval authority (SOP Pembayaran Barang & Jasa):
//   < Rp  1.000.000  → Manajer Departemen
//   > Rp  1.000.000  → Direktur Umum & Keuangan
//   > Rp 50.000.000  → Direktur Utama

// ─── Canonical roles ─────────────────────────────────────────────────────────
const ROLE = {
  DEWAN_PENGAWAS: 'dewan_pengawas',
  DIREKTUR_UTAMA: 'direktur_utama',
  DIREKTUR_BISNIS: 'direktur_bisnis_operasional',
  MGR_BISNIS: 'manager_bisnis',
  SPV_BISNIS: 'spv_bisnis',
  SPV_PEMASARAN: 'spv_pemasaran',
  KEPALA_GUDANG: 'kepala_gudang',
  KASIR_BISNIS: 'kasir_bisnis',
  STAFF_BISNIS: 'staff_bisnis',
  MGR_OPERASIONAL: 'manager_operasional',
  SPV_PENAGIHAN: 'spv_penagihan',
  SPV_SARPRAS: 'spv_sarpras',
  STAFF_OPERASIONAL: 'staff_operasional',
  KEPALA_PASAR: 'kepala_pasar',
  KOORDINATOR_PASAR: 'koordinator_pasar',
  KASIR_PASAR: 'kasir_pasar',
  STAFF_PENAGIHAN: 'staff_penagihan',
  DIREKTUR_UMUM_KEU: 'direktur_umum_keuangan',
  MGR_KEUANGAN: 'manager_keuangan',
  SPV_ANGGARAN: 'spv_anggaran',
  SPV_AKUNTANSI: 'spv_akuntansi',
  STAFF_KEUANGAN: 'staff_keuangan',
  MGR_UMUM: 'manager_umum',
  MGR_IT: 'manager_it',
  SEKRETARIS: 'sekretaris',
  SPV_HUKUM: 'spv_hukum',
  SPV_UMUM: 'spv_umum',
  STAFF_UMUM: 'staff_umum',
  SPI: 'spi',
  STAFF_SPI: 'staff_spi',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
};

// ─── Legacy aliases (old role names still accepted) ──────────────────────────
const LEGACY_ROLES = [
  'akuntan', 'auditor', 'manajer_keuangan', 'direktur', 'kasir',
  'staff_gudang', 'staff_pembelian', 'staff_pajak',
];

// Every role the system recognises (canonical + legacy).
const ALL_ROLES = [...Object.values(ROLE), ...LEGACY_ROLES];

// System / IT administration (user management, backup/restore).
// Fix: manager_it now included (SOP: "Manager IT — akses sistem, backup &
// restore, user management"); previously admin/super_admin only.
const SYSTEM_ADMIN = [ROLE.ADMIN, ROLE.SUPER_ADMIN, ROLE.MGR_IT];

// Whole-database reset — the single most destructive action.
const SUPER_ADMIN_ONLY = [ROLE.SUPER_ADMIN];

// Finance / accounting write (journals, closings, anggaran, rekonsiliasi, assets).
const FINANCE_WRITE = [
  ROLE.STAFF_KEUANGAN, ROLE.SPV_AKUNTANSI, ROLE.SPV_ANGGARAN, ROLE.MGR_KEUANGAN,
  ROLE.DIREKTUR_UMUM_KEU, ROLE.DIREKTUR_UTAMA,
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
  'akuntan', // legacy
];

// Journal input (Staff Accounting → Manager Keuangan).
const JOURNAL_WRITE = [
  ROLE.STAFF_KEUANGAN, ROLE.SPV_AKUNTANSI, ROLE.SPV_ANGGARAN, ROLE.MGR_KEUANGAN,
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
  'akuntan', // legacy
];

// Approve journals / vouchers (Manager and above, plus Senior Accounting).
const APPROVE = [
  ROLE.MGR_BISNIS, ROLE.MGR_OPERASIONAL, ROLE.KEPALA_PASAR, ROLE.MGR_KEUANGAN, ROLE.MGR_UMUM,
  ROLE.DIREKTUR_BISNIS, ROLE.DIREKTUR_UMUM_KEU, ROLE.DIREKTUR_UTAMA,
  ROLE.SPV_AKUNTANSI,
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
  'akuntan', 'manajer_keuangan', 'direktur', // legacy
];

// COA & master chart write.
const COA_WRITE = [
  ROLE.SPV_AKUNTANSI, ROLE.MGR_KEUANGAN, ROLE.ADMIN, ROLE.SUPER_ADMIN,
  'akuntan', // legacy
];

// Departemen / cost-center write.
const DEPT_WRITE = [
  ROLE.SPV_AKUNTANSI, ROLE.MGR_KEUANGAN, ROLE.MGR_UMUM, ROLE.ADMIN, ROLE.SUPER_ADMIN,
  'akuntan', // legacy
];

// Cash voucher input (Kasir).
const VOUCHER_WRITE = [
  ROLE.KASIR_BISNIS, ROLE.KASIR_PASAR, ROLE.STAFF_KEUANGAN, ROLE.SPV_AKUNTANSI,
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
  'kasir', 'akuntan', // legacy
];

// Giro input.
const GIRO_WRITE = [
  ROLE.KASIR_BISNIS, ROLE.KASIR_PASAR, ROLE.STAFF_KEUANGAN, ROLE.SPV_AKUNTANSI,
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
  'kasir', // legacy
];

// Inventory / warehouse (persediaan, transfers, stock opname).
const INVENTORY_WRITE = [
  ROLE.KEPALA_GUDANG, ROLE.KOORDINATOR_PASAR, ROLE.STAFF_BISNIS,
  ROLE.STAFF_KEUANGAN, ROLE.SPV_AKUNTANSI,
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
  'staff_gudang', 'auditor', // legacy
];

// Purchasing / PO / hutang (PBJ — Pengadaan Barang & Jasa).
const PURCHASING_WRITE = [
  ROLE.SPV_SARPRAS, ROLE.SPV_UMUM, ROLE.STAFF_UMUM, ROLE.MGR_UMUM,
  ROLE.STAFF_KEUANGAN, ROLE.SPV_AKUNTANSI, ROLE.MGR_KEUANGAN,
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
  'staff_pembelian', // legacy
];

// AR / penagihan / piutang / pelanggan / SO.
const AR_WRITE = [
  ROLE.SPV_PENAGIHAN, ROLE.STAFF_PENAGIHAN, ROLE.KASIR_PASAR, ROLE.KEPALA_PASAR,
  ROLE.STAFF_KEUANGAN, ROLE.SPV_AKUNTANSI,
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
];

// Tax / e-Faktur.
const TAX_WRITE = [
  ROLE.STAFF_KEUANGAN, ROLE.SPV_AKUNTANSI, ROLE.MGR_KEUANGAN,
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
  'staff_pajak', // legacy
];

// Lock a period (Senior Accounting / Manager Keuangan and above).
const LOCK_ROLES = [
  ROLE.SPV_AKUNTANSI, ROLE.MGR_KEUANGAN, ROLE.DIREKTUR_UMUM_KEU, ROLE.DIREKTUR_UTAMA,
  ROLE.ADMIN, ROLE.SUPER_ADMIN,
  'manajer_keuangan', // legacy
];

// Unlock a period (highest authority only).
const UNLOCK_ROLES = [ROLE.ADMIN, ROLE.SUPER_ADMIN, ROLE.DIREKTUR_UTAMA];

// Read access — every authenticated role may read data/reports. (Fix: the old
// ALL_READ listed only legacy names, 403-ing every canonical role.)
const ALL_READ = ALL_ROLES;

// ─── Approval thresholds (SOP Pembayaran) ────────────────────────────────────
const APPROVAL_THRESHOLDS = {
  MANAGER: 1_000_000,   // < 1 jt: any Manager+ may approve
  DIREKTUR: 50_000_000, // >= 50 jt: Direktur Utama only
};

// > 1 jt: Direktur Umum & Keuangan and above.
const APPROVE_HIGH = [
  ROLE.DIREKTUR_UMUM_KEU, ROLE.DIREKTUR_UTAMA, ROLE.ADMIN, ROLE.SUPER_ADMIN,
];

// >= 50 jt: Direktur Utama only.
const APPROVE_VERY_HIGH = [ROLE.DIREKTUR_UTAMA, ROLE.SUPER_ADMIN];

/** True if `role` may approve a payment/journal of `amount` rupiah. */
function canApproveAmount(role, amount) {
  const amt = Number(amount) || 0;
  if (amt < APPROVAL_THRESHOLDS.MANAGER) return APPROVE.includes(role);
  if (amt < APPROVAL_THRESHOLDS.DIREKTUR) return APPROVE_HIGH.includes(role);
  return APPROVE_VERY_HIGH.includes(role);
}

/** Label of the minimum approver required for `amount`. */
function requiredApproverLabel(amount) {
  const amt = Number(amount) || 0;
  if (amt < APPROVAL_THRESHOLDS.MANAGER) return 'Manajer Departemen';
  if (amt < APPROVAL_THRESHOLDS.DIREKTUR) return 'Direktur Umum & Keuangan';
  return 'Direktur Utama';
}

module.exports = {
  ROLE,
  LEGACY_ROLES,
  ALL_ROLES,
  ALL_READ,
  SYSTEM_ADMIN,
  SUPER_ADMIN_ONLY,
  FINANCE_WRITE,
  JOURNAL_WRITE,
  APPROVE,
  COA_WRITE,
  DEPT_WRITE,
  VOUCHER_WRITE,
  GIRO_WRITE,
  INVENTORY_WRITE,
  PURCHASING_WRITE,
  AR_WRITE,
  TAX_WRITE,
  LOCK_ROLES,
  UNLOCK_ROLES,
  APPROVAL_THRESHOLDS,
  APPROVE_HIGH,
  APPROVE_VERY_HIGH,
  canApproveAmount,
  requiredApproverLabel,
};
