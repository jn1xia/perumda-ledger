import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { canAccessPath } from '../../data/roles.js'
import { apiGetHealth } from '../../services/api.js'
import { LayoutDashboard, BookOpen, BookText, ListTree, Building2, Package, Fuel, TrendingUp, FileText, Landmark, Settings, X, ArrowUpRight, ArrowDownRight, ClipboardList, ShieldCheck, FileCheck, CreditCard, Users, ShoppingCart, Receipt, ShoppingBag, Banknote } from 'lucide-react'

const navItems = [
  { path: '/home', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/jurnal', label: 'Jurnal', icon: BookOpen },
  { path: '/voucher', label: 'Voucher', icon: FileCheck },
  { path: '/buku-besar', label: 'Buku Besar', icon: BookText },
  { path: '/coa', label: 'COA', icon: ListTree },
  { path: '/master-data', label: 'Master Data', icon: Users },
  { path: '/piutang', label: 'Piutang', icon: ArrowUpRight },
  { path: '/hutang', label: 'Hutang', icon: ArrowDownRight },
  { path: '/giro', label: 'Giro', icon: CreditCard },
  { path: '/pembelian', label: 'Pembelian (PO)', icon: ShoppingCart },
  { path: '/penjualan', label: 'Penjualan (SO)', icon: ShoppingBag },
  { path: '/aset-tetap', label: 'Aset Tetap', icon: Building2 },
  { path: '/persediaan', label: 'Persediaan', icon: Package },
  { path: '/bbm-prabayar', label: 'BBM Prabayar', icon: Fuel },
  { path: '/efaktur', label: 'E-Faktur PPN', icon: Receipt },
  { path: '/anggaran-realisasi', label: 'Anggaran vs Realisasi', icon: TrendingUp },
  { path: '/npd', label: 'NPD (Pencairan Dana)', icon: Banknote },
  { path: '/audit-recap', label: 'Audit Recap', icon: ShieldCheck },
  { path: '/lra', label: 'LRA', icon: ClipboardList },
  { path: '/laporan', label: 'Laporan', icon: FileText },
  { path: '/konsistensi', label: 'Cek Konsistensi', icon: ShieldCheck },
  { path: '/rekonsiliasi-bank', label: 'Rekonsiliasi Bank', icon: Landmark },
  { path: '/import-data', label: 'Import Data', icon: BookOpen },
  { path: '/pengaturan', label: 'Pengaturan', icon: Settings },
]

export default function Sidebar() {
  const { state, dispatch } = useApp()
  const location = useLocation()
  const role = state.session?.role
  const visibleNav = navItems.filter(item => canAccessPath(role, item.path))

  // Indikator Cek Konsistensi. Pemeriksaannya sudah lama ada, tetapi harus
  // dibuka manual per bulan — akibatnya temuan nyata (akun 11999 bersaldo
  // −Rp 4,2 miliar) tersimpan di layar itu tanpa dibaca selama tujuh bulan.
  // Titik kecil di sini membuatnya terlihat tanpa perlu diingat.
  const [health, setHealth] = useState(null)
  useEffect(() => {
    let alive = true
    apiGetHealth()
      .then(r => { if (alive) setHealth(r) })
      .catch(() => { /* indikator bersifat tambahan — jangan ganggu navigasi */ })
    return () => { alive = false }
  }, [])

  const dotColor = health && health.status === 'error' ? 'var(--danger, #dc2626)'
    : health && health.status === 'warn' ? 'var(--warning, #d97706)' : null
  const dotTitle = health && dotColor
    ? `${health.counts.error} bermasalah, ${health.counts.warn} perlu dicek — buka Cek Konsistensi`
    : undefined

  return (
    <>
      {state.sidebarMobileOpen && <div className="modal-overlay" style={{zIndex:150}} onClick={() => dispatch({type:'CLOSE_MOBILE_SIDEBAR'})} />}
      <aside className={`sidebar ${state.sidebarCollapsed ? 'collapsed' : ''} ${state.sidebarMobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">P</div>
          <span className="sidebar-logo-text">Perumda Ledger</span>
          <button className="sidebar-close" onClick={() => dispatch({type:'CLOSE_MOBILE_SIDEBAR'})}>
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {visibleNav.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => dispatch({type:'CLOSE_MOBILE_SIDEBAR'})}
              title={state.sidebarCollapsed ? item.label : undefined}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.path === '/konsistensi' && dotColor && (
                <span
                  title={dotTitle}
                  style={{
                    marginLeft: 'auto', flexShrink: 0, width: 9, height: 9,
                    borderRadius: '50%', background: dotColor,
                    boxShadow: '0 0 0 3px color-mix(in srgb, currentColor 12%, transparent)',
                  }}
                />
              )}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
