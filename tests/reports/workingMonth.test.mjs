// Working month and dates on the daily-bookkeeping screens (plan 2026-11-25,
// Task 5): one month chosen once for every new page; dates "14 Jan 2027".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatTanggal, bulanLabel, defaultWorkingMonth, monthOptions, normalizeLocked } from '../../src/utils/workingMonth.js'

test('dates read "14 Jan 2027"', () => {
  assert.equal(formatTanggal('2027-01-14'), '14 Jan 2027')
  assert.equal(formatTanggal('2026-08-05'), '05 Agu 2026')
  assert.equal(formatTanggal(''), '-')
})

test('a month reads "Januari 2027"', () => {
  assert.equal(bulanLabel('2027-01'), 'Januari 2027')
  assert.equal(bulanLabel('2026-12'), 'Desember 2026')
})

test('the default working month is the calendar month', () => {
  assert.equal(defaultWorkingMonth(new Date('2027-01-14T08:00:00')), '2027-01')
  assert.equal(defaultWorkingMonth(new Date('2026-11-25T08:00:00')), '2026-11')
})

test('locked periods: only YYYY-MM entries count, as on the server', () => {
  assert.deepEqual(normalizeLocked(['2026-10', 'Januari 2026', { period: '2026-09' }]), ['2026-10', '2026-09'])
})

test('the month list: 2026 from Excel, locked months, 2027 open, through the next December', () => {
  const opts = monthOptions({ now: new Date('2026-11-25T08:00:00'), lockedPeriods: ['2026-10'], periodModes: { '2026-09': 'audited' } })
  assert.equal(opts[0].value, '2026-01')
  assert.equal(opts[opts.length - 1].value, '2027-12')
  const by = Object.fromEntries(opts.map(o => [o.value, o]))
  assert.equal(by['2026-10'].state, 'dikunci')
  assert.equal(by['2026-09'].state, 'dari Excel')
  assert.equal(by['2026-07'].state, 'dari Excel')
  assert.equal(by['2027-01'].state, 'terbuka')
  assert.equal(by['2027-01'].label, 'Januari 2027')
})
