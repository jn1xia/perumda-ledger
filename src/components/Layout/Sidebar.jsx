import { useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { menuFor } from './navItems.js'
import useFindings from '../Findings/useFindings.js'
import {
  Home, FilePlus2, List, CheckCircle2, ShieldCheck, Scale, BookOpen, FileText, ClipboardList,
  Banknote, BookText, Database, ListTree, Building2, Settings, LayoutDashboard, FileCheck, Users,
  ArrowUpRight, ArrowDownRight, CreditCard, ShoppingCart, ShoppingBag, Package, Fuel, Receipt,
  TrendingUp, X,
} from 'lucide-react'

const ICONS = {
  home: Home, 'file-plus': FilePlus2, list: List, check: CheckCircle2, shield: ShieldCheck, scale: Scale,
  'book-open': BookOpen, 'file-text': FileText, clipboard: ClipboardList, banknote: Banknote, book: BookText,
  database: Database, 'list-tree': ListTree, building: Building2, settings: Settings, dashboard: LayoutDashboard,
  'file-check': FileCheck, users: Users, 'arrow-up-right': ArrowUpRight, 'arrow-down-right': ArrowDownRight,
  'credit-card': CreditCard, cart: ShoppingCart, bag: ShoppingBag, package: Package, fuel: Fuel,
  receipt: Receipt, 'trending-up': TrendingUp,
}

// Menu grouped by task (spec 2026-11-25 §5.1). Counts: vouchers waiting for
// approval, and open journal findings — the same number as the bell (one
// signal; the old health dot on Cek Konsistensi is gone).
export default function Sidebar() {
  const { state, dispatch } = useApp()
  const location = useLocation()
  const role = state.session?.role
  const menu = useMemo(() => menuFor(role), [role])
  const { openCount } = useFindings()
  const pending = useMemo(
    () => (state.journalsAll || []).filter(j => j.voucher_type && j.status === 'pending').length,
    [state.journalsAll],
  )
  const counts = { pending, findings: openCount }

  return (
    <>
      {state.sidebarMobileOpen && <div className="modal-overlay" style={{ zIndex: 150 }} onClick={() => dispatch({ type: 'CLOSE_MOBILE_SIDEBAR' })} />}
      <aside className={`sidebar ${state.sidebarCollapsed ? 'collapsed' : ''} ${state.sidebarMobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">P</div>
          <span className="sidebar-logo-text">Perumda Ledger</span>
          <button className="sidebar-close" onClick={() => dispatch({ type: 'CLOSE_MOBILE_SIDEBAR' })} aria-label="Tutup menu">
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {menu.map((g, gi) => (
            <div key={g.group || `g${gi}`} className="nav-group">
              {g.group && <div className="nav-group-label">{g.group}</div>}
              {g.items.map(item => {
                const Icon = ICONS[item.icon] || FileText
                const n = item.count ? counts[item.count] : 0
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                    onClick={() => dispatch({ type: 'CLOSE_MOBILE_SIDEBAR' })}
                    title={state.sidebarCollapsed ? item.label : undefined}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                    {n > 0 && <span className="nav-count" title={item.count === 'pending' ? `${n} voucher menunggu persetujuan` : `${n} temuan perlu diperiksa`}>{n > 99 ? '99+' : n}</span>}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
