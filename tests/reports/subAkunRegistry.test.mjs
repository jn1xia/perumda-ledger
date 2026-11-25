// Sub Akun overrides (plan 2026-11-25, Task 4): the SPV can say a Sub Akun is
// read on another account in the reports ("Listrik Pasar Hanyar" under 61050 →
// 51002 Beban Pokok Listrik). It applies to journals from 2027-01-01 only, so
// no 2026 number can move.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setSubAkunOverrides, overrideFor } from '../../src/utils/subAkunRegistry.js'
import { reportLineAccount } from '../../src/utils/lraOutline.js'

const ROWS = [
  { account_code: '61050', name: 'Listrik Pasar Hanyar', report_code: '51002', active: 1 },
  { account_code: '61050', name: 'Listrik Lama', report_code: '51002', active: 0 },
  { account_code: '61060', name: 'Beban Makan Minum Rapat', report_code: null, active: 1 },
]
const coaName = (c) => ({ '51002': 'Beban Pokok Listrik' }[c] || '')

test('a 2027 line on an overridden Sub Akun is read on the chosen account', () => {
  setSubAkunOverrides(ROWS, coaName)
  assert.deepEqual(reportLineAccount('61050', 'Listrik Pasar Hanyar', '', '2027-01-15'), { code: '51002', name: 'Beban Pokok Listrik' })
  assert.deepEqual(overrideFor('61050', 'listrik pasar hanyar ', '2027-03-01'), { code: '51002', name: 'Beban Pokok Listrik' })
})

test('2026 lines never take an override', () => {
  setSubAkunOverrides(ROWS, coaName)
  assert.equal(reportLineAccount('61050', 'Listrik Pasar Hanyar', '', '2026-10-15'), null)
  assert.equal(overrideFor('61050', 'Listrik Pasar Hanyar', '2026-12-31'), null)
})

test('inactive rows and rows without a report account give no override', () => {
  setSubAkunOverrides(ROWS, coaName)
  assert.equal(overrideFor('61050', 'Listrik Lama', '2027-01-15'), null)
  assert.equal(overrideFor('61060', 'Beban Makan Minum Rapat', '2027-01-15'), null)
})

test('the July 2026 Antasari electricity rule still applies', () => {
  setSubAkunOverrides([], coaName)
  assert.deepEqual(reportLineAccount('61050', 'Beban Listrik', 'Pembayaran listrik Pasar Antasari', '2026-07-10'), { code: '51002', name: 'Beban Pokok Listrik' })
  assert.equal(reportLineAccount('61050', 'Listrik Pasar Hanyar', '', '2027-01-15'), null)
})
