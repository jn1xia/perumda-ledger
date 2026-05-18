import { useState, useEffect } from 'react'
import { Menu, Search, Bell, Moon, Sun, LogOut, User, ChevronDown } from 'lucide-react'
import { useApp } from '../../context/AppContext.jsx'
import { getRoleLabel, getRoleDivisi } from '../../data/roles.js'

export default function TopBar() {
  const { state, dispatch } = useApp()
  const [dark, setDark] = useState(() => localStorage.getItem('perumda-theme') === 'dark')
  const [showUserMenu, setShowUserMenu] = useState(false)

  const session = state.session

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('perumda-theme', dark ? 'dark' : 'light')
  }, [dark])

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return
    const handler = () => setShowUserMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showUserMenu])

  function handleLogout() {
    if (!confirm('Keluar dari sistem? Sesi Anda akan diakhiri.')) return
    dispatch({ type: 'LOGOUT' })
  }

  const roleLabel = session ? getRoleLabel(session.role) : 'Tamu'
  const divisi    = session ? getRoleDivisi(session.role) : ''
  const username  = session?.username || ''

  return (
    <header className="topbar">
      <button className="topbar-menu-btn" onClick={() => {
        if (window.innerWidth <= 1024) {
          dispatch({ type: 'TOGGLE_MOBILE_SIDEBAR' })
        } else {
          dispatch({ type: 'TOGGLE_SIDEBAR' })
        }
      }}>
        <Menu size={20} />
      </button>

      <div className="topbar-search">
        <Search />
        <input type="text" placeholder="Cari akun, kode, atau transaksi..." id="global-search" />
      </div>

      <div className="topbar-actions">
        <button className="theme-toggle" onClick={() => setDark(d => !d)} title={dark ? 'Light Mode' : 'Dark Mode'}>
          {dark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <button className="topbar-btn">
          <Bell size={20} />
          <span className="topbar-badge"></span>
        </button>

        {/* User info + dropdown */}
        <div style={{ position: 'relative' }} onClick={e => { e.stopPropagation(); setShowUserMenu(v => !v) }}>
          <button
            className="topbar-user"
            style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 10, cursor: 'pointer' }}
          >
            <User size={16} />
            <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {username || roleLabel}
            </span>
            <ChevronDown size={14} />
          </button>

          {showUserMenu && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 9999,
              background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              minWidth: 220, overflow: 'hidden',
            }}>
              {/* User info header */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{username}</div>
                <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, marginTop: 2 }}>{roleLabel}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{divisi}</div>
              </div>

              {/* SOP info */}
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Login: {session?.loginAt ? new Date(session.loginAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                </div>
              </div>

              {/* Logout */}
              <button
                onClick={handleLogout}
                style={{
                  width: '100%', padding: '10px 16px', background: 'none', border: 'none',
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                  color: 'var(--danger)', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <LogOut size={14} /> Keluar (Logout)
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
