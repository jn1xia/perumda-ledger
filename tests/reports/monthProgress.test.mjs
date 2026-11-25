// Beranda Bulan (plan 2026-11-25, Task 10): where the month stands — counts
// per step, what needs action, when the month can be locked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthProgress } from '../../src/utils/monthProgress.js'

const v = (no, status, amount, extra = {}) => ({
  id: `VC-2026-${no}`, voucher_type: extra.type || 'KK', voucher_no: no, tanggal: extra.tanggal || '2026-11-26',
  status, debit: amount, kredit: amount, sop_signed: extra.signed ? 1 : 0, created_by: extra.by || 'staff_keuangan',
})
const month = [
  v('0001', 'draft', 1000), v('0002', 'draft', 2000),
  v('0003', 'pending', 62500000), v('0004', 'pending', 4500000, { signed: true }), v('0005', 'pending', 31850000, { type: 'BM', tanggal: '2026-11-25' }),
  v('0006', 'posted', 1), v('0007', 'posted', 1), v('0008', 'posted', 1), v('0009', 'posted', 1), v('0010', 'posted', 1),
  { id: 'XL-2026-10-U0001', tanggal: '2026-10-31', status: 'posted', debit: 5, kredit: 5 },
]

test('counts per status for the month; journals of other months stay out', () => {
  const p = monthProgress(month, '2026-11', { lockedPeriods: [], openFindings: 2 })
  assert.equal(p.vouchers, 10)
  assert.equal(p.drafts, 2)
  assert.equal(p.pending, 3)
  assert.equal(p.posted, 5)
  assert.equal(p.pendingAmount, 62500000 + 4500000 + 31850000)
  assert.equal(p.oldestPending, '2026-11-25')
})

test('a payment from Rp 1 jt submitted without the tick needs action; receipts do not', () => {
  const p = monthProgress(month, '2026-11', { lockedPeriods: [], openFindings: 2 })
  assert.deepEqual(p.unsignedBig.map(j => j.voucher_no), ['0003'])
})

test('the month cannot be locked while drafts, vouchers waiting or findings remain', () => {
  const p = monthProgress(month, '2026-11', { lockedPeriods: [], openFindings: 2 })
  const lock = p.steps.find(s => s.key === 'lock')
  assert.equal(lock.done, false)
  assert.equal(lock.text, 'Bisa dikunci setelah langkah 1–3 selesai')
  assert.deepEqual(p.steps.map(s => s.key), ['input', 'approve', 'check', 'reconcile', 'lock'])
})

test('everything posted and no findings: "Bisa dikunci"; a locked month says so', () => {
  const posted = month.map(j => ({ ...j, status: 'posted' }))
  assert.equal(monthProgress(posted, '2026-11', { lockedPeriods: [], openFindings: 0 }).steps.find(s => s.key === 'lock').text, 'Bisa dikunci')
  const locked = monthProgress(posted, '2026-11', { lockedPeriods: ['2026-11'], openFindings: 0 })
  assert.equal(locked.locked, true)
  assert.equal(locked.steps.find(s => s.key === 'lock').done, true)
})
