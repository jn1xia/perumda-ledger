// Beranda Bulan — where the working month stands and the next step (spec
// 2026-11-25 §5.2; mockup "Beranda Bulan"): five steps, what needs action,
// the month's figures, the last vouchers.
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import useFindings from '../components/Findings/useFindings.js'
import { monthProgress } from '../utils/monthProgress.js'
import { bulanLabel, formatTanggal, normalizeLocked } from '../utils/workingMonth.js'
import { dailyBookStart } from '../utils/bookYear.js'
import { VOUCHER_TYPES, isCashCode, sopSigner } from '../utils/voucherRules.js'
import { formatRupiah } from '../data/sampleData.js'
import { Plus, CheckCircle2, AlertTriangle, FilePlus2, ShieldCheck } from 'lucide-react'

const linesOf = (j) => { let l = j.lines; if (typeof l === 'string') { try { l = JSON.parse(l) } catch { l = [] } } return Array.isArray(l) ? l : [] }
const codeOf = (s) => String(s || '').trim().split(/\s+/)[0]
const STATUS = { draft: ['Draf', 'gray'], pending: ['Menunggu', 'warn'], returned: ['Dikembalikan', 'bad'], posted: ['Diposting', 'ok'] }

/** Postings of a journal as [code, debit, kredit] (multi-line or the legacy pair). */
function postings(j) {
  const ls = linesOf(j)
  if (ls.length) return ls.map(l => [String(l.akun_code || ''), Number(l.debit) || 0, Number(l.kredit) || 0])
  const a = Number(j.debit) || Number(j.kredit) || 0
  return [[codeOf(j.akun_debit), a, 0], [codeOf(j.akun_kredit), 0, a]]
}

export default function BerandaBulan() {
  const { state } = useApp()
  const navigate = useNavigate()
  const { openByMonth } = useFindings()
  const ym = state.workingMonth
  const startDate = dailyBookStart(state.pengaturan)
  const role = state.session?.role || ''
  const me = state.session?.username || ''
  const approver = ['spv_akuntansi', 'manager_keuangan', 'admin', 'super_admin'].includes(role)
  const openFindings = (openByMonth[ym] || []).length
  const p = useMemo(() => monthProgress(state.journalsAll || [], ym, { lockedPeriods: state.lockedPeriods, openFindings }), [state.journalsAll, ym, state.lockedPeriods, openFindings])
  const locked = normalizeLocked(state.lockedPeriods).includes(ym)
  const beforeStart = ym < startDate.slice(0, 7)

  // Figures: cash and bank at the end of the month (saldo awal + every posted
  // line up to then), the month's revenue and expenses (posted lines).
  const figures = useMemo(() => {
    const end = `${ym}-31`
    const cash = new Map((state.coaFlat || []).filter(a => /^\d{5}$/.test(String(a.code)) && isCashCode(a.code)).map(a => [String(a.code), Number(a.saldo_awal ?? a.saldoAwal) || 0]))
    let pendapatan = 0, beban = 0
    for (const j of state.journalsAll || []) {
      if (j.status !== 'posted') continue
      const t = String(j.tanggal || '')
      if (t > end) continue
      for (const [code, d, k] of postings(j)) {
        if (cash.has(code)) cash.set(code, cash.get(code) + d - k)
        if (t.startsWith(ym)) {
          if (/^[47]/.test(code)) pendapatan += k - d
          else if (/^[568]/.test(code)) beban += d - k
        }
      }
    }
    return { kasBank: [...cash.values()].reduce((s, x) => s + x, 0), pendapatan, beban }
  }, [state.journalsAll, state.coaFlat, ym])

  const last = (state.journalsAll || []).filter(j => j.voucher_type && String(j.tanggal).startsWith(ym))
    .sort((a, b) => String(b.voucher_no || '').localeCompare(String(a.voucher_no || ''))).slice(0, 6)
  const myDrafts = p.draftList.filter(j => j.created_by === me)
  const myReturned = p.returnedList.filter(j => j.created_by === me)
  const STEP = {
    input: ['Input transaksi', '/input-voucher', 'Input voucher'],
    approve: ['Diperiksa & diposting', approver ? '/persetujuan' : '/daftar-voucher', approver ? 'Buka persetujuan' : 'Lihat daftar'],
    check: ['Cek data', `/konsistensi?bulan=${ym}`, 'Lihat temuan'],
    reconcile: ['Rekonsiliasi', '/rekonsiliasi-bank', 'Rekonsiliasi'],
    lock: ['Kunci & laporan', '/jurnal', 'Kunci periode'],
  }

  return (
    <div className="db-page" id="beranda-bulan">
      <div className="db-head">
        <div>
          <h1>{bulanLabel(ym)} <span className={`db-chip ${locked ? 'gray' : beforeStart ? 'gray' : 'ok'}`} style={{ verticalAlign: 'middle' }}>{locked ? 'Dikunci' : beforeStart ? 'Dari Excel' : 'Terbuka'}</span></h1>
          <p>{beforeStart
            ? <>Bulan ini dibukukan lewat Excel. Pembukuan harian di aplikasi mulai {formatTanggal(startDate)}.</>
            : <>Pembukuan harian di aplikasi sejak {formatTanggal(startDate)}. Pilih bulan lain di atas.</>}</p>
        </div>
        {!beforeStart && !locked && <button type="button" className="btn btn-primary" onClick={() => navigate('/input-voucher')}><Plus size={15} /> Input voucher</button>}
      </div>

      <div className="db-card">
        <h2>Posisi bulan ini</h2>
        <div className="bb-steps">
          {p.steps.map((s, i) => (
            <div key={s.key} className={`bb-step ${s.done ? 'done' : ''}`} data-step={s.key}>
              <div className="bb-n">{s.done ? '✓' : i + 1}</div>
              <h3>{STEP[s.key][0]}</h3>
              <p>{s.text}</p>
              <Link className="bb-link" to={STEP[s.key][1]}>{STEP[s.key][2]} →</Link>
            </div>
          ))}
        </div>
      </div>

      <div className="bb-grid">
        <div className="db-card">
          <h2>Perlu tindakan</h2>
          <ul className="bb-todo">
            {p.pending > 0 && (
              <li><span className="bb-ic p"><CheckCircle2 size={15} /></span><div><b>{p.pending} voucher menunggu persetujuan</b><small>{formatRupiah(p.pendingAmount)} · paling lama sejak {formatTanggal(p.oldestPending)}</small></div>{approver && <Link to="/persetujuan">Buka</Link>}</li>
            )}
            {p.unsignedBig.map(j => (
              <li key={j.id}><span className="bb-ic d"><AlertTriangle size={15} /></span><div><b>Voucher {j.voucher_no} ({formatRupiah(Math.max(j.debit, j.kredit))}): tanda tangan {sopSigner(Math.max(j.debit, j.kredit))} belum dikonfirmasi</b><small>{j.keterangan} · diinput {j.created_by || '—'}</small></div>{approver && <Link to="/persetujuan">Lihat</Link>}</li>
            ))}
            {myReturned.length > 0 && (
              <li><span className="bb-ic d"><AlertTriangle size={15} /></span><div><b>{myReturned.length} voucher Anda dikembalikan</b><small>{myReturned.map(j => `${j.voucher_no}: ${j.returned_note}`).join(' · ')}</small></div><Link to="/daftar-voucher">Perbaiki</Link></li>
            )}
            {myDrafts.length > 0 && (
              <li><span className="bb-ic w"><FilePlus2 size={15} /></span><div><b>{myDrafts.length} draf Anda belum diajukan</b><small>{myDrafts.map(j => j.voucher_no).join(', ')}</small></div><Link to="/daftar-voucher">Lanjutkan</Link></li>
            )}
            {openFindings > 0 && (
              <li><span className="bb-ic w"><ShieldCheck size={15} /></span><div><b>{openFindings} temuan</b><small>{(openByMonth[ym] || []).slice(0, 3).map(f => f.title).join(' · ')}</small></div><Link to={`/konsistensi?bulan=${ym}`}>Lihat</Link></li>
            )}
            {p.pending === 0 && !p.unsignedBig.length && !myReturned.length && !myDrafts.length && !openFindings && (
              <li><span className="bb-ic ok"><CheckCircle2 size={15} /></span><div><b>Tidak ada yang menunggu.</b><small>{p.vouchers ? 'Semua voucher bulan ini sudah diposting.' : 'Belum ada voucher di bulan ini.'}</small></div></li>
            )}
          </ul>
        </div>
        <div className="db-card">
          <h2>Angka bulan ini <span className="db-muted" style={{ fontWeight: 500, fontSize: 12.5 }}>yang sudah diposting</span></h2>
          <div className="bb-kpi"><span className="db-sec">Kas &amp; Bank akhir bulan</span><b className="db-num">{formatRupiah(figures.kasBank)}</b></div>
          <div className="bb-kpi"><span className="db-sec">Pendapatan bulan ini</span><b className="db-num">{formatRupiah(figures.pendapatan)}</b></div>
          <div className="bb-kpi"><span className="db-sec">Beban bulan ini</span><b className="db-num">{formatRupiah(figures.beban)}</b></div>
          <p className="db-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Realisasi terhadap anggaran: lihat LRA.</p>
        </div>
      </div>

      <div className="db-card">
        <div className="db-head" style={{ marginBottom: 4 }}><h2>Voucher terakhir</h2><Link to="/daftar-voucher">Semua voucher {bulanLabel(ym)} →</Link></div>
        {last.length === 0 ? <div className="db-muted" style={{ padding: '6px 0' }}>Belum ada voucher di bulan ini.</div> : (
          <div className="db-tw">
            <table className="db-table">
              <thead><tr><th>No. Bukti</th><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th className="r">Jumlah</th><th>Status</th></tr></thead>
              <tbody>{last.map(j => (
                <tr key={j.id}><td className="db-num">{j.voucher_no}</td><td className="db-num">{formatTanggal(j.tanggal)}</td><td>{VOUCHER_TYPES[j.voucher_type]?.label}</td><td>{j.keterangan}</td><td className="r db-num">{formatRupiah(Math.max(Number(j.debit) || 0, Number(j.kredit) || 0))}</td><td><span className={`db-chip ${(STATUS[j.status] || [])[1] || 'gray'}`}>{(STATUS[j.status] || [j.status])[0]}</span></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
