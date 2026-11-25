// navItems.js — the menu, grouped by task (spec 2026-11-25 §5.1). Pure data and
// one function, so tests can check what each role sees. Icons are names; the
// Sidebar maps them to lucide-react components.
import { canAccessPath, ROLE } from '../../data/roles.js'

export const NAV_GROUPS = [
  { group: null, items: [
    { path: '/home', label: 'Beranda Bulan', icon: 'home' },
  ] },
  { group: 'Kerja harian', items: [
    { path: '/input-voucher', label: 'Input Voucher', icon: 'file-plus' },
    { path: '/daftar-voucher', label: 'Daftar Voucher', icon: 'list' },
    { path: '/persetujuan', label: 'Persetujuan', icon: 'check', count: 'pending' },
  ] },
  { group: 'Tutup bulan', items: [
    { path: '/konsistensi', label: 'Cek Data', icon: 'shield', count: 'findings' },
    { path: '/rekonsiliasi-bank', label: 'Rekonsiliasi Bank', icon: 'scale' },
    // The monthly Excel upload until Excel stops (November–December 2026 and
    // the January–February 2027 overlap).
    { path: '/jurnal', label: 'Jurnal & Impor Excel', icon: 'book-open' },
  ] },
  { group: 'Laporan', items: [
    { path: '/laporan', label: 'Laporan Keuangan', icon: 'file-text' },
    { path: '/lra', label: 'LRA', icon: 'clipboard' },
    { path: '/npd', label: 'NPD', icon: 'banknote' },
    { path: '/buku-besar', label: 'Buku Besar', icon: 'book' },
  ] },
  { group: 'Data induk', items: [
    { path: '/sub-akun', label: 'Akun & Sub Akun', icon: 'database' },
    { path: '/coa', label: 'COA', icon: 'list-tree' },
    { path: '/aset-tetap', label: 'Aset Tetap', icon: 'building' },
  ] },
  { group: null, items: [
    { path: '/pengaturan', label: 'Pengaturan', icon: 'settings' },
  ] },
  // Modules with no data on live (UI/UX check, 24 Nov 2026) and the old pages:
  // admin only, until each is either put to use or removed.
  { group: 'Lainnya', adminOnly: true, items: [
    { path: '/dashboard', label: 'Dashboard (lama)', icon: 'dashboard' },
    { path: '/voucher', label: 'Voucher (lama)', icon: 'file-check' },
    { path: '/master-data', label: 'Master Data', icon: 'users' },
    { path: '/piutang', label: 'Piutang', icon: 'arrow-up-right' },
    { path: '/hutang', label: 'Hutang', icon: 'arrow-down-right' },
    { path: '/giro', label: 'Giro', icon: 'credit-card' },
    { path: '/pembelian', label: 'Pembelian (PO)', icon: 'cart' },
    { path: '/penjualan', label: 'Penjualan (SO)', icon: 'bag' },
    { path: '/persediaan', label: 'Persediaan', icon: 'package' },
    { path: '/bbm-prabayar', label: 'BBM Prabayar', icon: 'fuel' },
    { path: '/efaktur', label: 'E-Faktur PPN', icon: 'receipt' },
    { path: '/anggaran-realisasi', label: 'Anggaran vs Realisasi', icon: 'trending-up' },
    { path: '/audit-recap', label: 'Audit Recap', icon: 'shield' },
    { path: '/import-data', label: 'Import Data', icon: 'book-open' },
  ] },
]

const isAdmin = (role) => role === ROLE.ADMIN || role === ROLE.SUPER_ADMIN

/** The menu a role sees: groups with the items it may open; Lainnya for admin only. */
export function menuFor(role) {
  return NAV_GROUPS
    .filter(g => !g.adminOnly || isAdmin(role))
    .map(g => ({ ...g, items: g.items.filter(i => canAccessPath(role, i.path)) }))
    .filter(g => g.items.length)
}
