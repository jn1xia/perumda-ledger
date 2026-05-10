import { useApp } from '../../context/AppContext.jsx'
import { Menu, Search, Bell } from 'lucide-react'

export default function TopBar() {
  const { state, dispatch } = useApp()

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
