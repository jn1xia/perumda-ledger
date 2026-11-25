// Year guard for daily bookkeeping (plan 2026-11-25, Task 1). The 2026 report
// pages pick journals by month number only (LRA.jsx, NPDReport.jsx,
// LabaRugiReports.jsx …), so a January 2027 voucher would land in January 2026.
// The context hands those pages only the 2026 books; new screens use all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LEGACY_BOOK_YEAR, yearOf, legacyView, DAILY_BOOK_START_DEFAULT, dailyBookStart } from '../../src/utils/bookYear.js'
import { rkapVersion } from '../../src/utils/lraOutline.js'

test('the legacy report year is 2026', () => {
  assert.equal(LEGACY_BOOK_YEAR, 2026)
})

test('yearOf reads the year of a YYYY-MM-DD date, null when there is none', () => {
  assert.equal(yearOf('2027-01-14'), 2027)
  assert.equal(yearOf('2026-12-31'), 2026)
  assert.equal(yearOf(''), null)
  assert.equal(yearOf(undefined), null)
})

test('the 2026 pages see 2026 (and undated) journals, never a 2027 voucher', () => {
  const js = [{ id: 'a', tanggal: '2026-12-31' }, { id: 'b', tanggal: '2027-01-05' }, { id: 'c' }]
  assert.deepEqual(legacyView(js).map(j => j.id), ['a', 'c'])
  assert.deepEqual(legacyView(null), [])
})

test('2027 months read the revised RKAP numbering; 2026 keeps its own switch in September', () => {
  assert.equal(rkapVersion([1], 2027), 2)
  assert.equal(rkapVersion([1]), 1)
  assert.equal(rkapVersion([9]), 2)
  assert.equal(rkapVersion([1, 2, 3], 2026), 1)
})

test('the start of daily bookkeeping: a setting, 25 November 2026 by default', () => {
  assert.equal(DAILY_BOOK_START_DEFAULT, '2026-11-25')
  assert.equal(dailyBookStart({ pembukuan_harian_mulai: '2026-12-01' }), '2026-12-01')
  assert.equal(dailyBookStart({}), '2026-11-25')
  assert.equal(dailyBookStart(null), '2026-11-25')
  assert.equal(dailyBookStart({ pembukuan_harian_mulai: '1/12/2026' }), '2026-11-25', 'not a date: the default')
})
