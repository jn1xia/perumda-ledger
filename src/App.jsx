import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './context/AppContext.jsx'
import { canAccessPath } from './data/roles.js'
import Layout from './components/Layout/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Jurnal from './pages/Jurnal.jsx'
import BukuBesar from './pages/BukuBesar.jsx'
import COA from './pages/COA.jsx'
import AsetTetap from './pages/AsetTetap.jsx'
import Persediaan from './pages/Persediaan.jsx'
import BBMPrabayar from './pages/BBMPrabayar.jsx'
import AnggaranRealisasi from './pages/AnggaranRealisasi.jsx'
import AuditRecap from './pages/AuditRecap.jsx'
import Laporan from './pages/Laporan.jsx'
import RekonsiliasiBank from './pages/RekonsiliasiBank.jsx'
import Pengaturan from './pages/Pengaturan.jsx'
import Piutang from './pages/Piutang.jsx'
import Hutang from './pages/Hutang.jsx'
import LRA from './pages/LRA.jsx'
import ImportData from './pages/ImportData.jsx'
import Voucher from './pages/Voucher.jsx'
import Giro from './pages/Giro.jsx'
import MasterData from './pages/MasterData.jsx'
import Pembelian from './pages/Pembelian.jsx'
import EFaktur from './pages/EFaktur.jsx'
import Penjualan from './pages/Penjualan.jsx'
import NPDReport from './pages/NPDReport.jsx'
import Konsistensi from './pages/Konsistensi.jsx'
import AiAssistant from './components/AiAssistant/AiAssistant.jsx'
import EnvBanner from './components/EnvBanner.jsx'
import ForcePasswordChange from './components/ForcePasswordChange.jsx'

const IS_QA = (import.meta.env.VITE_APP_ENV || 'production') === 'qa'

// Route table — guarded uniformly against the current role. Paths not listed in
// MODULE_ROLES (dashboards/reports) are allowed for everyone via canAccessPath.
const ROUTES = [
  { path: '/home', element: <Dashboard /> },
  { path: '/jurnal', element: <Jurnal /> },
  { path: '/buku-besar', element: <BukuBesar /> },
  { path: '/coa', element: <COA /> },
  { path: '/piutang', element: <Piutang /> },
  { path: '/hutang', element: <Hutang /> },
  { path: '/aset-tetap', element: <AsetTetap /> },
  { path: '/persediaan', element: <Persediaan /> },
  { path: '/bbm-prabayar', element: <BBMPrabayar /> },
  { path: '/anggaran-realisasi', element: <AnggaranRealisasi /> },
  { path: '/anggaran', element: <AnggaranRealisasi /> },
  { path: '/audit-recap', element: <AuditRecap /> },
  { path: '/laporan', element: <Laporan /> },
  { path: '/lra', element: <LRA /> },
  { path: '/konsistensi', element: <Konsistensi /> },
  { path: '/rekonsiliasi-bank', element: <RekonsiliasiBank /> },
  { path: '/import-data', element: <ImportData /> },
  { path: '/pengaturan', element: <Pengaturan /> },
  { path: '/voucher', element: <Voucher /> },
  { path: '/giro', element: <Giro /> },
  { path: '/master-data', element: <MasterData /> },
  { path: '/pembelian', element: <Pembelian /> },
  { path: '/efaktur', element: <EFaktur /> },
  { path: '/penjualan', element: <Penjualan /> },
  { path: '/npd', element: <NPDReport /> },
]

function App() {
  const { state } = useApp()
  const isLoggedIn = !!state.session
  const role = state.session?.role

  // Not logged in → show Login page for all routes
  if (!isLoggedIn) {
    return (
      <>
        <EnvBanner />
        <div style={IS_QA ? { paddingTop: 26 } : undefined}>
          <Login />
        </div>
      </>
    )
  }

  return (
    <>
    <EnvBanner />
    <ForcePasswordChange />
    <div style={IS_QA ? { paddingTop: 26 } : undefined}>
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/login" element={<Navigate to="/home" replace />} />
        {ROUTES.map(r => (
          <Route
            key={r.path}
            path={r.path}
            element={canAccessPath(role, r.path) ? r.element : <Navigate to="/home" replace />}
          />
        ))}
      </Routes>
    </Layout>
    </div>
    <AiAssistant />
    </>
  )
}

export default App
