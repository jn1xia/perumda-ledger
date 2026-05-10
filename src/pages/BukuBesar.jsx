import { useState, useMemo } from 'react'
import { useApp, computeLedger } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'

export default function BukuBesar() {
  const { state } = useApp()
  const postingAccounts = state.coaFlat.filter(a => a.type === 'posting')
  const [selectedAkun, setSelectedAkun] = useState(postingAccounts[0]?.code || '11101')

  const selectedAccount = postingAccounts.find(a => a.code === selectedAkun)
  const ledgerEntries = useMemo(() => computeLedger(state.journals, selectedAkun), [state.journals, selectedAkun])

  const totalDebit = ledgerEntries.reduce((s, e) => s + e.debit, 0)
  const totalKredit = ledgerEntries.reduce((s, e) => s + e.kredit, 0)
  const saldoAkhir = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].saldo : 0

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Buku Besar</h1>
        <p>General Ledger — Dihitung otomatis dari jurnal yang sudah di-posting</p>
      </div>

      <div className="toolbar">
        <div className="period-selector">
          <label>Akun:</label>
          <select className="form-select" style={{ width: 'auto', minWidth: 280 }} value={selectedAkun} onChange={e => setSelectedAkun(e.target.value)}>
            {postingAccounts.map(a => (
              <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Debit</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{formatRupiah(totalDebit)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Kredit</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{formatRupiah(totalKredit)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Saldo Akhir</div>
          <div className="kpi-value" style={{ fontSize: 18, color: saldoAkhir >= 0 ? 'var(--primary)' : 'var(--danger)' }}>{formatRupiah(saldoAkhir)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">{selectedAkun} — {selectedAccount?.name || ''}</div>
            <div className="card-subtitle">{ledgerEntries.length} transaksi ditemukan</div>
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Ref</th>
                <th>Keterangan</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Kredit</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {ledgerEntries.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Tidak ada transaksi untuk akun ini</td></tr>
              )}
              {ledgerEntries.map((row, i) => (
                <tr key={i}>
                  <td>{row.tanggal}</td>
                  <td className="mono">{row.ref}</td>
                  <td>{row.keterangan}</td>
                  <td className="text-right mono">{row.debit ? formatRupiah(row.debit) : '-'}</td>
                  <td className="text-right mono">{row.kredit ? formatRupiah(row.kredit) : '-'}</td>
                  <td className="text-right mono" style={{ fontWeight: 600, color: row.saldo >= 0 ? 'var(--text)' : 'var(--danger)' }}>{formatRupiah(row.saldo)}</td>
                </tr>
              ))}
              {ledgerEntries.length > 0 && (
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td colSpan={3}>TOTAL</td>
                  <td className="text-right mono">{formatRupiah(totalDebit)}</td>
                  <td className="text-right mono">{formatRupiah(totalKredit)}</td>
                  <td className="text-right mono" style={{ color: saldoAkhir >= 0 ? 'var(--primary)' : 'var(--danger)' }}>{formatRupiah(saldoAkhir)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
