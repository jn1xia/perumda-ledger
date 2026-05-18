import { useState, useMemo } from 'react'
import { Download, Search } from 'lucide-react'
import { useApp, computeLedger } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { exportCSV } from '../utils/exportUtils.js'

export default function BukuBesar() {
  const { state } = useApp()
  const postingAccounts = state.coaFlat.filter(a => a.type === 'posting')
  const [selectedAkun, setSelectedAkun] = useState(postingAccounts[0]?.code || '11101')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [search, setSearch]       = useState('')

  const selectedAccount = postingAccounts.find(a => a.code === selectedAkun)

  // All ledger entries for the selected account
  const allEntries = useMemo(
    () => computeLedger(state.journals, selectedAkun),
    [state.journals, selectedAkun]
  )

  // Apply date range + keyword filter
  const ledgerEntries = useMemo(() => {
    let rows = allEntries
    if (dateFrom) rows = rows.filter(r => r.tanggal >= dateFrom)
    if (dateTo)   rows = rows.filter(r => r.tanggal <= dateTo)
    if (search)   rows = rows.filter(r =>
      (r.keterangan || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.ref || '').toLowerCase().includes(search.toLowerCase())
    )
    return rows
  }, [allEntries, dateFrom, dateTo, search])

  const totalDebit  = ledgerEntries.reduce((s, e) => s + e.debit, 0)
  const totalKredit = ledgerEntries.reduce((s, e) => s + e.kredit, 0)
  const saldoAkhir  = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].saldo : 0

  function handleExport() {
    exportCSV(
      `BukuBesar_${selectedAkun}_${new Date().toISOString().split('T')[0]}`,
      ['Tanggal', 'Ref', 'Keterangan', 'Debit', 'Kredit', 'Saldo'],
      ledgerEntries.map(r => [r.tanggal, r.ref, r.keterangan, r.debit || '', r.kredit || '', r.saldo])
    )
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1>Buku Besar</h1>
        <p>General Ledger — Dihitung otomatis dari jurnal yang sudah di-posting</p>
      </div>

      {/* ── Toolbar ── */}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="period-selector">
          <label>Akun:</label>
          <select
            className="form-select"
            style={{ width: 'auto', minWidth: 280 }}
            value={selectedAkun}
            onChange={e => setSelectedAkun(e.target.value)}
          >
            {postingAccounts.map(a => (
              <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
            ))}
          </select>
        </div>

        <div className="period-selector" style={{ gap: 6 }}>
          <label>Dari:</label>
          <input
            className="form-input"
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{ width: 150 }}
          />
          <label>s/d:</label>
          <input
            className="form-input"
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{ width: 150 }}
          />
          {(dateFrom || dateTo) && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => { setDateFrom(''); setDateTo('') }}
              title="Reset filter tanggal"
            >
              ✕ Reset
            </button>
          )}
        </div>

        <div className="search-box" style={{ position: 'relative', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)' }} />
          <input
            className="form-input"
            placeholder="Cari keterangan / ref..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 30, width: 220 }}
          />
          <button className="btn btn-outline" onClick={handleExport} title="Unduh CSV">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
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
          <div className="kpi-value" style={{ fontSize: 18, color: saldoAkhir >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
            {formatRupiah(saldoAkhir)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Jumlah Transaksi</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{ledgerEntries.length}</div>
          {allEntries.length !== ledgerEntries.length && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              dari {allEntries.length} total
            </div>
          )}
        </div>
      </div>

      {/* ── Ledger Table ── */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">{selectedAkun} — {selectedAccount?.name || ''}</div>
            <div className="card-subtitle">
              {ledgerEntries.length} transaksi
              {(dateFrom || dateTo) && ` · Filter: ${dateFrom || '—'} s/d ${dateTo || '—'}`}
            </div>
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
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    Tidak ada transaksi
                    {(dateFrom || dateTo || search) ? ' yang cocok dengan filter' : ' untuk akun ini'}
                  </td>
                </tr>
              )}
              {ledgerEntries.map((row, i) => (
                <tr key={i}>
                  <td>{row.tanggal}</td>
                  <td className="mono">{row.ref}</td>
                  <td>{row.keterangan}</td>
                  <td className="text-right mono">{row.debit ? formatRupiah(row.debit) : '-'}</td>
                  <td className="text-right mono">{row.kredit ? formatRupiah(row.kredit) : '-'}</td>
                  <td
                    className="text-right mono"
                    style={{ fontWeight: 600, color: row.saldo >= 0 ? 'var(--text)' : 'var(--danger)' }}
                  >
                    {formatRupiah(row.saldo)}
                  </td>
                </tr>
              ))}
              {ledgerEntries.length > 0 && (
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td colSpan={3}>TOTAL</td>
                  <td className="text-right mono">{formatRupiah(totalDebit)}</td>
                  <td className="text-right mono">{formatRupiah(totalKredit)}</td>
                  <td
                    className="text-right mono"
                    style={{ color: saldoAkhir >= 0 ? 'var(--primary)' : 'var(--danger)' }}
                  >
                    {formatRupiah(saldoAkhir)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
