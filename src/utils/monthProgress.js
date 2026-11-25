// monthProgress.js — where a month of daily bookkeeping stands (Beranda Bulan,
// spec 2026-11-25 §5.2): vouchers per status, what needs action, and whether
// the month can be locked. Pure: the page passes the journals and counts.
import { needsSignatureTick } from './voucherRules.js'
import { normalizeLocked } from './workingMonth.js'

const amountOf = (j) => Math.max(Number(j.debit) || 0, Number(j.kredit) || 0)

/**
 * @param journals all journals (state.journalsAll)
 * @param ym 'YYYY-MM'
 * @param opts.lockedPeriods locked months; opts.openFindings open salah + periksa findings of the month
 */
export function monthProgress(journals, ym, { lockedPeriods = [], openFindings = 0 } = {}) {
  const inMonth = (journals || []).filter(j => String((j && j.tanggal) || '').startsWith(ym))
  const vs = inMonth.filter(j => j.voucher_type)
  const by = (s) => vs.filter(j => j.status === s)
  const drafts = by('draft')
  const pending = by('pending')
  const returned = by('returned')
  const posted = by('posted')
  const unsignedBig = pending.filter(j => needsSignatureTick(amountOf(j), j.voucher_type) && !Number(j.sop_signed))
  const oldest = pending.map(j => String(j.tanggal || '')).filter(Boolean).sort()[0] || null
  const locked = normalizeLocked(lockedPeriods).includes(ym)
  const clear = drafts.length === 0 && pending.length === 0 && returned.length === 0 && Number(openFindings) === 0

  const steps = [
    { key: 'input', done: vs.length > 0 && drafts.length === 0 && returned.length === 0,
      text: `${vs.length} voucher · ${drafts.length} draf belum diajukan${returned.length ? ` · ${returned.length} dikembalikan` : ''}` },
    { key: 'approve', done: vs.length > 0 && pending.length === 0,
      text: `${posted.length} diposting · ${pending.length} menunggu persetujuan` },
    { key: 'check', done: Number(openFindings) === 0,
      text: Number(openFindings) ? `${openFindings} temuan perlu dilihat` : 'Tidak ada temuan terbuka' },
    { key: 'reconcile', done: false,
      text: 'Rekonsiliasi bank dan Buku Besar di akhir bulan' },
    { key: 'lock', done: locked,
      text: locked ? 'Bulan sudah dikunci' : (clear ? 'Bisa dikunci' : 'Bisa dikunci setelah langkah 1–3 selesai') },
  ]
  return {
    journals: inMonth.length,
    vouchers: vs.length,
    drafts: drafts.length,
    pending: pending.length,
    returned: returned.length,
    posted: posted.length,
    pendingAmount: pending.reduce((s, j) => s + amountOf(j), 0),
    oldestPending: oldest,
    unsignedBig,
    draftList: drafts,
    returnedList: returned,
    locked,
    steps,
  }
}
