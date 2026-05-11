import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Jurnal from './pages/Jurnal.jsx'
import BukuBesar from './pages/BukuBesar.jsx'
import COA from './pages/COA.jsx'
import AsetTetap from './pages/AsetTetap.jsx'
import Persediaan from './pages/Persediaan.jsx'
import BBMPrabayar from './pages/BBMPrabayar.jsx'
import AnggaranRealisasi from './pages/AnggaranRealisasi.jsx'
import AnggaranVsRealisasi from './pages/AnggaranVsRealisasi.jsx'
import AuditRecap from './pages/AuditRecap.jsx'
import Laporan from './pages/Laporan.jsx'
import RekonsiliasiBank from './pages/RekonsiliasiBank.jsx'
import Pengaturan from './pages/Pengaturan.jsx'
import Piutang from './pages/Piutang.jsx'
import Hutang from './pages/Hutang.jsx'
import LRA from './pages/LRA.jsx'
import ImportData from './pages/ImportData.jsx'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
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
        <Route path="/anggaran" element={<AnggaranVsRealisasi />} />
        <Route path="/audit-recap" element={<AuditRecap />} />
        <Route path="/laporan" element={<Laporan />} />
        <Route path="/lra" element={<LRA />} />
        <Route path="/rekonsiliasi-bank" element={<RekonsiliasiBank />} />
        <Route path="/import-data" element={<ImportData />} />
        <Route path="/pengaturan" element={<Pengaturan />} />
      </Routes>
    </Layout>
  )
}

export default App
