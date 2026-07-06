import { useState, useMemo, useEffect } from 'react'
import { Download, Search, Scale } from 'lucide-react'
import { useApp, computeLedger } from '../context/AppContext.jsx'
import { formatRupiah } from '../data/sampleData.js'
import { exportCSV } from '../utils/exportUtils.js'
import { expandJournals } from '../utils/journalExpand.js'
import { MONTHS, periodValueToYearMonth, periodValueToLabel } from '../utils/journalFilters.js'
import reconcileAlias from '../utils/reconcileAlias.json'
import * as api from '../services/api.js'
import SearchableSelect from '../components/UI/SearchableSelect.jsx'

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const lastDayOfPeriod = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

export default function BukuBesar() {
  const { state, refreshData } = useApp()
  const postingAccounts = state.coaFlat.filter(a => a.type === 'posting')

  // Searchable account options — label/value are the displayed "code — name" string
  const akunOptions = useMemo(
    () => postingAccounts.map(a => ({ label: `${a.code} — ${a.name}`, value: `${a.code} — ${a.name}` })),
    [postingAccounts]
  )

  const [akunDisplay, setAkunDisplay] = useState(
    postingAccounts[0] ? `${postingAccounts[0].code} — ${postingAccounts[0].name}` : ''
  )
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [search, setSearch]       = useState('')

  // Resolve the selected account from the display string
  const selectedAccount = postingAccounts.find(a => `${a.code} — ${a.name}` === akunDisplay)
  const selectedAkun = selectedAccount?.code || ''

  // All ledger entries for the selected account
  const allEntries = useMemo(
    () => computeLedger(state.journals, selectedAkun, selectedAccount?.saldo_awal ?? selectedAccount?.saldoAwal ?? 0),
    [state.journals, selectedAkun, selectedAccount]
  )

  // Apply date range + keyword filter. Reconciliation adjustments (ADJ-NRC-*,
  // dated month-end) are ALWAYS kept so the running Saldo Akhir ties to the Neraca
  // even when the date filter ends before month-end.
  const ledgerEntries = useMemo(() => {
    const isRecon = (r) => /^ADJ-NRC/i.test(String(r.ref || ''))
    let rows = allEntries.filter(r => {
      if (isRecon(r)) return true
      if (dateFrom && r.tanggal < dateFrom) return false
      if (dateTo && r.tanggal > dateTo) return false
      return true
    })
    if (search) rows = rows.filter(r =>
      (r.keterangan || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.ref || '').toLowerCase().includes(search.toLowerCase())
    )
    return rows
  }, [allEntries, dateFrom, dateTo, search])

  const totalDebit  = ledgerEntries.reduce((s, e) => s + e.debit, 0)
  const totalKredit = ledgerEntries.reduce((s, e) => s + e.kredit, 0)
  const saldoAkhir  = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].saldo : 0

  // ── Reconcile to Neraca (Balance Sheet) ──────────────────────────────────────
  const [reconMonth, setReconMonth] = useState('jun')
  const [refNeraca, setRefNeraca] = useState([])
  const [reconBusy, setReconBusy] = useState(false)
  const reconYM = periodValueToYearMonth(reconMonth)
  const reconLabel = periodValueToLabel(reconMonth)
  const SUSPENSE_CODE = '35000' // Koreksi Ekuitas

  useEffect(() => {
    if (!reconYM) return
    api.apiGetRefNeraca(reconYM).then(r => setRefNeraca(Array.isArray(r) ? r : [])).catch(() => setRefNeraca([]))
  }, [reconYM])

  const accClass = selectedAkun ? String(selectedAkun)[0] : ''
  const isBalanceSheetAcc = ['1', '2', '3'].includes(accClass)
  const adjId = `ADJ-NRC-${selectedAkun}-${reconYM}`
  const adjAllId = `ADJ-NRC-ALL-${reconYM}`

  // Posted journals, expanded once, for ledger-balance math.
  const expandedPosted = useMemo(
    () => expandJournals(state.journals).filter(j => j.status === 'posted'),
    [state.journals]
  )

  // Signed ledger balance (debit-normal arithmetic) for an account as of the period
  // end. Excludes the reconciliation entry AND user delta journals (JV-/JRN-) so we
  // reconcile only the audited baseline; deltas float on top.
  function calcSaldo(code, saldoAwal, periodEnd, excludeId) {
    let saldo = saldoAwal || 0
    for (const j of expandedPosted) {
      if (!j.tanggal || j.tanggal > periodEnd) continue
      const jid = j._expandedFrom || j.id
      if (excludeId && jid === excludeId) continue
      if (/^(JV|JRN)-/i.test(String(jid))) continue
      const dc = (j.akun_debit || '').split(' ')[0]
      const kc = (j.akun_kredit || '').split(' ')[0]
      if (dc.startsWith(code)) saldo += (j.debit || 0)
      if (kc.startsWith(code)) saldo -= (j.kredit || 0)
    }
    return saldo
  }

  // Build a normalized-name → Neraca value index for the selected period.
  const neracaByName = useMemo(() => {
    const m = new Map()
    for (const r of refNeraca) {
      if (r.value == null) continue
      const k = normName(r.label)
      if (!m.has(k)) m.set(k, Number(r.value))
    }
    return m
  }, [refNeraca])

  // Match the selected account to a Neraca snapshot row: alias (by code) wins, then
  // exact, else the account name must be a prefix of exactly one Neraca label.
  const neracaRow = useMemo(() => {
    if (!selectedAccount) return null
    const aliasLbl = reconcileAlias[String(selectedAccount.code)]
    if (aliasLbl) { const v = neracaByName.get(normName(aliasLbl)); if (v != null) return { value: v } }
    const nn = normName(selectedAccount.name)
    if (neracaByName.has(nn)) return { value: neracaByName.get(nn) }
    const cands = [...neracaByName.entries()].filter(([k]) => k.startsWith(nn))
    return cands.length === 1 ? { value: cands[0][1] } : null
  }, [neracaByName, selectedAccount])

  // Signed ledger balance as of period end for the selected account.
  const ledgerSaldoAsOf = useMemo(() => {
    if (!selectedAkun) return 0
    return calcSaldo(selectedAkun, selectedAccount?.saldo_awal ?? selectedAccount?.saldoAwal ?? 0, lastDayOfPeriod(reconYM), adjId)
  }, [expandedPosted, selectedAkun, selectedAccount, reconYM, adjId])

  // Buku Besar shows a debit-normal running saldo; reconciliation moves it to the
  // Neraca figure directly (no sign flip — the displayed number ties to Neraca).
  const neracaTarget = neracaRow ? Number(neracaRow.value) : null
  const ledgerInNeracaConvention = ledgerSaldoAsOf
  const selisih = neracaTarget != null ? (neracaTarget - ledgerInNeracaConvention) : 0
  const canReconcile = isBalanceSheetAcc && neracaTarget != null && Math.abs(selisih) >= 1

  async function handleReconcile() {
    if (!canReconcile) return
    const suspense = postingAccounts.find(a => a.code === SUSPENSE_CODE)
    if (!suspense) { alert(`Akun suspense ${SUSPENSE_CODE} (Koreksi Ekuitas) tidak ditemukan di COA.`); return }
    const delta = neracaTarget - ledgerSaldoAsOf
    if (Math.abs(delta) < 1) return
    const acctStr = `${selectedAccount.code} - ${selectedAccount.name}`
    const suspStr = `${suspense.code} - ${suspense.name}`
    const amt = Math.abs(delta)
    // delta>0 → increase displayed saldo → debit the account; else credit it.
    const akun_debit = delta > 0 ? acctStr : suspStr
    const akun_kredit = delta > 0 ? suspStr : acctStr
    if (!confirm(`Posting penyesuaian rekonsiliasi ${reconLabel} untuk ${acctStr}?\n\n` +
      `Saldo Neraca: ${formatRupiah(neracaTarget)}\nSaldo Buku Besar: ${formatRupiah(ledgerInNeracaConvention)}\nSelisih: ${formatRupiah(selisih)}\n\n` +
      `Jurnal: D ${akun_debit} / K ${akun_kredit} sebesar ${formatRupiah(amt)} (offset ke ${suspStr}).`)) return
    setReconBusy(true)
    try {
      await api.apiCreateJournal({
        id: adjId,
        tanggal: lastDayOfPeriod(reconYM),
        keterangan: `Penyesuaian rekonsiliasi Buku Besar ke Neraca ${reconLabel} — ${selectedAccount.name}`,
        debit: amt, kredit: amt,
        akun_debit, akun_kredit,
        bukti: adjId, status: 'posted', tipe_transaksi: 'transfer',
      })
      if (typeof refreshData === 'function') await refreshData('journals')
      alert(`✅ Penyesuaian diposting. Saldo Buku Besar ${selectedAccount.name} kini ${formatRupiah(neracaTarget)} sesuai Neraca ${reconLabel}.`)
    } catch (e) {
      alert('Gagal posting penyesuaian: ' + (e.message || e))
    } finally {
      setReconBusy(false)
    }
  }

  // Reconcile EVERY balance-sheet account to the Neraca snapshot via the server
  // (single source of truth, same logic used after journal approval).
  async function handleReconcileAll() {
    if (refNeraca.length === 0) { alert(`Belum ada snapshot Neraca untuk ${reconLabel} 2026.`); return }
    if (!confirm(`Rekonsiliasi SEMUA akun neraca ke Neraca ${reconLabel} 2026?\n\n` +
      `Setiap akun neraca akan disamakan dengan snapshot Neraca dalam 1 jurnal majemuk. ` +
      `Selisih bersih diparkir di akun ${SUSPENSE_CODE} Koreksi Ekuitas. Aman dijalankan ulang.`)) return
    setReconBusy(true)
    try {
      const r = await api.apiReconcileLedger(reconYM)
      if (typeof refreshData === 'function') await refreshData('all')
      if (r && r.reconciled) {
        alert(`✅ Rekonsiliasi selesai. ${r.adjusted} akun kini sama dengan Neraca ${reconLabel}. Plug ${formatRupiah(r.plug || 0)} di akun ${SUSPENSE_CODE} Koreksi Ekuitas.`)
      } else if (r && r.reason === 'already_matched') {
        alert(`Semua akun neraca sudah sesuai dengan Neraca ${reconLabel}.`)
      } else {
        alert(`Tidak ada snapshot Neraca untuk ${reconLabel} 2026.`)
      }
    } catch (e) {
      alert('Gagal rekonsiliasi semua akun: ' + (e.message || e))
    } finally {
      setReconBusy(false)
    }
  }


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
          <div style={{ width: 320 }}>
            <SearchableSelect
              value={akunDisplay}
              onChange={setAkunDisplay}
              options={akunOptions}
              placeholder="Cari akun (kode / nama)..."
            />
          </div>
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

      {/* ── Reconcile to Neraca ── */}
      {isBalanceSheetAcc && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderLeft: '3px solid var(--primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Scale size={16} color="var(--primary)" />
            <strong style={{ fontSize: 13 }}>Rekonsiliasi ke Neraca</strong>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Periode:</span>
            <select className="form-select" style={{ width: 'auto' }} value={reconMonth} onChange={e => setReconMonth(e.target.value)}>
              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label} 2026</option>)}
            </select>
            <button className="btn btn-outline btn-sm" onClick={handleReconcileAll} disabled={reconBusy || refNeraca.length === 0} title="Sesuaikan semua akun neraca ke snapshot Neraca">
              <Scale size={14} /> {reconBusy ? 'Memproses…' : 'Rekonsiliasi Semua Akun'}
            </button>
            {neracaTarget == null ? (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Akun ini tidak ditemukan di Neraca {reconLabel} (atau belum ada snapshot).
              </span>
            ) : (
              <>
                <span style={{ fontSize: 12 }}>Neraca: <strong>{formatRupiah(neracaTarget)}</strong></span>
                <span style={{ fontSize: 12 }}>Buku Besar: <strong>{formatRupiah(ledgerInNeracaConvention)}</strong></span>
                <span style={{ fontSize: 12 }}>Selisih: <strong style={{ color: Math.abs(selisih) < 1 ? 'var(--success)' : 'var(--danger)' }}>{formatRupiah(selisih)}</strong></span>
                {canReconcile ? (
                  <button className="btn btn-primary btn-sm" onClick={handleReconcile} disabled={reconBusy} style={{ marginLeft: 'auto' }}>
                    <Scale size={14} /> {reconBusy ? 'Memposting…' : 'Posting Penyesuaian'}
                  </button>
                ) : (
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>✓ Sudah sesuai Neraca</span>
                )}
              </>
            )}
          </div>
          {canReconcile && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Penyesuaian akan diposting per {lastDayOfPeriod(reconYM)} dengan lawan akun <strong>{SUSPENSE_CODE} Koreksi Ekuitas</strong>. Aman dijalankan ulang (idempotent).
            </div>
          )}
        </div>
      )}

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
              {ledgerEntries.some(r => /^ADJ-NRC/i.test(r.ref || '')) && ' · termasuk penyesuaian rekonsiliasi ke Neraca (akhir bulan) — Saldo Akhir = saldo audited'}
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
