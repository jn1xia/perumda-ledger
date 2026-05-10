import { useApp } from '../../context/AppContext.jsx'
import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'

export default function Layout({ children }) {
  const { state } = useApp()

  return (
    <div className="app-layout">
      <Sidebar />
      <div className={`main-wrapper ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar />
        <main className="content">
          {children}
        </main>
      </div>
    </div>
  )
}
