import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, ShieldCheck, Lock } from 'lucide-react'
import { apiGetConsistency } from '../services/api.js'
import { formatRupiah } from '../data/sampleData.js'

// ── CEK KONSISTENSI ──────────────────────────────────────────────────────────
// Self-check per bulan: jurnal seimbang, tidak ada yang pending, semua kode
// akun dikenal, mode laporan cocok dengan datanya, dan (untuk bulan audited)
// snapshot vs Buku Besar. Selisih tampil DI SINI dengan angkanya — bukan
// ditemukan belakangan lewat perbandingan manual dengan Excel.

const MONTHS_ID = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const YEAR = 2026

const STATUS_STYLE = {
  ok:    { icon: CheckCircle2, color: 'var(--success, #059669)', bg: 'rgba(16,185,129,0.08)', label: 'OK' },
  warn:  { icon: AlertTriangle, color: 'var(--warning, #d97706)', bg: 'rgba(251,191,36,0.10)', label: 'Perlu dicek' },
  error: { icon: XCircle, color: 'var(--danger, #dc2626)', bg: 'rgba(239,68,68,0.08)', label: 'Bermasalah' },
}

function ModeChip({ mode }) {
  const audited = mode === 'audited'
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 12,
      background: audited ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)',
      color: audited ? 'var(--success, #059669)' : 'var(--primary, #4f46e5)' }}>
      {audited ? 'AUDITED (snapshot resmi)' : 'JURNAL (dihitung dari Buku Besar)'}
    </span>
  )
}

export default function Konsistensi() {
  const now = new Date()
  const defaultMonth = now.getFullYear() === YEAR ? now.getMonth() + 1 : 6
  const [month, setMonth] = useState(defaultMonth)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const period = `${YEAR}-${String(month).padStart(2, '0')}`

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await apiGetConsistency(period)
      setData(r)
    } catch (e) {
      setError(e.message || 'Gagal memuat pemeriksaan')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])

  const checks = (data && data.checks) || []
  const worst = checks.some(c => c.status === 'error') ? 'error' : (checks.some(c => c.status === 'warn') ? 'warn' : 'ok')

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={22} /> Cek Konsistensi Data</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 0' }}>
            Pemeriksaan otomatis: jurnal ↔ laporan ↔ snapshot untuk satu bulan. Hijau = konsisten; kuning/merah = ada yang perlu ditindak.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-select" style={{ width: 'auto' }} value={month} onChange={e => setMonth(parseInt(e.target.value, 10))}>
            {MONTHS_ID.slice(1).map((m, i) => <option key={m} value={i + 1}>{m} {YEAR}</option>)}
          </select>
          <button className="btn btn-outline" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'eim-spin' : undefined} /> Periksa Ulang
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 16, color: 'var(--danger)', marginBottom: 16 }}>Gagal memuat: {error}</div>
      )}

      {data && (
        <>
          <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{MONTHS_ID[month]} {YEAR}</div>
            <ModeChip mode={data.mode} />
            {data.locked && (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Lock size={13} /> Periode terkunci
              </span>
            )}
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Jurnal: <strong>{data.journals?.posted ?? 0}</strong> posted{(data.journals?.pending ?? 0) > 0 ? <> · <strong style={{ color: 'var(--warning, #d97706)' }}>{data.journals.pending} pending</strong></> : null}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: STATUS_STYLE[worst].color }}>
              {worst === 'ok' ? '✔ Semua pemeriksaan lulus' : worst === 'warn' ? '⚠ Ada yang perlu dicek' : '✘ Ada masalah data'}
            </span>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {checks.map((c, i) => {
              const s = STATUS_STYLE[c.status] || STATUS_STYLE.warn
              const Icon = s.icon
              return (
                <div key={c.id || i} style={{ display: 'flex', gap: 12, padding: '12px 16px', background: c.status !== 'ok' ? s.bg : undefined, borderBottom: '1px solid var(--border-light)' }}>
                  <Icon size={18} style={{ color: s.color, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{c.detail}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, fontWeight: 700, color: s.color, flexShrink: 0 }}>{s.label}</span>
                </div>
              )
            })}
            {!checks.length && !loading && (
              <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Tidak ada hasil pemeriksaan.</div>
            )}
          </div>

          {data.ledger_class_totals && Object.keys(data.ledger_class_totals).length > 0 && (
            <div className="card" style={{ padding: 16, marginTop: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Ringkasan Buku Besar bulan ini (dari jurnal posted)</div>
              <table style={{ fontSize: 13 }}>
                <tbody>
                  {[['pendUsaha', 'Pendapatan Usaha (4x)'], ['bpp', 'Beban Pokok Penjualan (51)'], ['bebanUmum', 'Beban Umum & Administrasi (61)'],
                    ['bebanOps', 'Beban Operasional (62)'], ['pendLain', 'Pendapatan Lain-lain (7x)'], ['bebanLain', 'Beban Lain-lain (8x)']].map(([k, label]) => (
                    data.ledger_class_totals[k] !== undefined ? (
                      <tr key={k}>
                        <td style={{ padding: '4px 16px 4px 0', color: 'var(--text-secondary)' }}>{label}</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{formatRupiah(data.ledger_class_totals[k] || 0)}</td>
                      </tr>
                    ) : null
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
