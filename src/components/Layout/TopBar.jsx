import { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { Menu, Search, Bell, Moon, Sun } from 'lucide-react'

export default function TopBar() {
  const { state, dispatch } = useApp()
  const [dark, setDark] = useState(() => {
    return localStorage.getItem('perumda-theme') === 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('perumda-theme', dark ? 'dark' : 'light')
  }, [dark])

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
        <button className="theme-toggle" onClick={() => setDark(d => !d)} title={dark ? 'Light Mode' : 'Dark Mode'} id="theme-toggle-btn">
          {dark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button className="topbar-btn" id="notifications-btn">
          <Bell size={20} />
          <span className="topbar-badge"></span>
        </button>
        <button className="topbar-user" id="user-profile-btn">
          Akuntan
        </button>
      </div>
    </header>
  )
}
