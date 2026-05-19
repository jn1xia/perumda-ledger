import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './context/AppContext.jsx'
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

function App() {
  const { state } = useApp()
  const isLoggedIn = !!state.session

  // Not logged in → show Login page for all routes
  if (!isLoggedIn) {
    return <Login />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/login" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<Dashboard />} />
        <Route path="/jurnal" element={<Jurnal />} />
        <Route path="/buku-besar" element={<BukuBesar />} />
        <Route path="/coa" element={<COA />} />
        <Route path="/piutang" element={<Piutang />} />
        <Route path="/hutang" element={<Hutang />} />
        <Route path="/aset-tetap" element={<AsetTetap />} />
        <Route path="/persediaan" element={<Persediaan />} />
        <Route path="/bbm-prabayar" element={<BBMPrabayar />} />
        <Route path="/anggaran-realisasi" element={<AnggaranRealisasi />} />
        <Route path="/anggaran" element={<AnggaranRealisasi />} />
        <Route path="/audit-recap" element={<AuditRecap />} />
        <Route path="/laporan" element={<Laporan />} />
        <Route path="/lra" element={<LRA />} />
        <Route path="/rekonsiliasi-bank" element={<RekonsiliasiBank />} />
        <Route path="/import-data" element={<ImportData />} />
        <Route path="/pengaturan" element={<Pengaturan />} />
        <Route path="/voucher" element={<Voucher />} />
        <Route path="/giro" element={<Giro />} />
        <Route path="/master-data" element={<MasterData />} />
        <Route path="/pembelian" element={<Pembelian />} />
        <Route path="/efaktur" element={<EFaktur />} />
        <Route path="/penjualan" element={<Penjualan />} />
        <Route path="/npd" element={<NPDReport />} />
      </Routes>
    </Layout>
  )
}

export default App
