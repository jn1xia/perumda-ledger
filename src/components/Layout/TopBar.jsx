import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, Search, Bell, Moon, Sun, LogOut, User, ChevronDown } from 'lucide-react'
import { useApp } from '../../context/AppContext.jsx'
import { getRoleLabel, getRoleDivisi } from '../../data/roles.js'
import useFindings from '../Findings/useFindings.js'
import { monthLabel } from '../../utils/journalChecks.js'

export default function TopBar() {
  const { state, dispatch, logout } = useApp()
  const [dark, setDark] = useState(() => localStorage.getItem('perumda-theme') === 'dark')
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showFindings, setShowFindings] = useState(false)
  const { openByMonth, openCount } = useFindings()
  const navigate = useNavigate()

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

  useEffect(() => {
    if (!showFindings) return
    const handler = () => setShowFindings(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showFindings])

  function handleLogout() {
    if (!confirm('Keluar dari sistem? Sesi Anda akan diakhiri.')) return
    logout()
  }

  const roleLabel = session ? getRoleLabel(session.role) : 'Tamu'
  const divisi    = session ? getRoleDivisi(session.role) : ''
  const username  = session?.username || ''

  return (
    // Own stacking layer above the page content, so the bell panel and the user
    // menu open on top of the cards (below modals and the mobile sidebar).
    <header className="topbar" style={{ position: 'relative', zIndex: 150 }}>
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

        {/* Bell: open journal findings (journalChecks) per month — Cek Konsistensi */}
        <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button className="topbar-btn" id="btn-findings" title={openCount ? `${openCount} temuan jurnal perlu diperiksa` : 'Tidak ada temuan jurnal'} onClick={() => setShowFindings(v => !v)}>
            <Bell size={20} />
            {openCount > 0 && (
              <span className="topbar-badge" style={{ top: 0, right: 0, minWidth: 16, height: 16, width: 'auto', padding: '0 4px', borderRadius: 8, fontSize: 10, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                {openCount > 99 ? '99+' : openCount}
              </span>
            )}
          </button>
          {showFindings && (
            <div id="findings-panel" style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 9999, width: 380, maxWidth: '90vw',
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
            }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', fontWeight: 700, fontSize: 13 }}>
                Temuan jurnal {openCount ? `(${openCount})` : ''}
              </div>
              {openCount === 0 ? (
                <div style={{ padding: '14px', fontSize: 13, color: 'var(--text-muted)' }}>Tidak ada temuan yang perlu diperiksa.</div>
              ) : (
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {Object.entries(openByMonth).sort(([a], [b]) => b.localeCompare(a)).map(([ym, list]) => (
                    <button key={ym} type="button" onClick={() => { setShowFindings(false); navigate(`/konsistensi?bulan=${ym}`) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{monthLabel(ym)}</span><span style={{ color: list.some(f => f.severity === 'salah') ? 'var(--danger)' : 'var(--warning)' }}>{list.length} temuan</span>
                      </div>
                      {list.slice(0, 3).map(f => (
                        <div key={f.key} style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>• {f.title}</div>
                      ))}
                      {list.length > 3 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>… dan {list.length - 3} lainnya</div>}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                Klik bulan untuk melihat baris jurnalnya di Cek Konsistensi. Info tidak dihitung.
              </div>
            </div>
          )}
        </div>

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
              background: 'var(--card)', border: '1px solid var(--border)',
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
