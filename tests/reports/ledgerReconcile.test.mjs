// The month-end adjustment that ties the Buku Besar to the official Neraca
// (ADJ-NRC-ALL-<period>). Live data, November 2026: it computed every account
// as debit − kredit while the Buku Besar shows liabilities and equity as
// kredit − debit (Pendapatan Diterima Dimuka read −3.584.741.669 against a
// Neraca of 5.466.316.670), and it left out the June–August journal books the
// September Neraca already holds (Bank BNI off by exactly their 2.795.483.188).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { computeReconcileLines, tiesToSnapshot, ledgerSaldo } = require('../../server/lib/ledgerReconcile.cjs')

const COA = [
  { code: '11104', name: 'Bank BNI', saldo_awal: 100 },
  { code: '21600', name: 'Pendapatan Diterima Dimuka', saldo_awal: 0 },
  { code: '33000', name: 'Saldo Laba (Rugi) Tahun Lalu', saldo_awal: -50 },
  { code: '34000', name: 'Laba (Rugi) Periode Berjalan', saldo_awal: 0 },
  { code: '35000', name: 'Koreksi Ekuitas', saldo_awal: 0 },
]
const ALIAS = { '11104': 'Bank BNI', '21600': 'Pendapatan Diterima Dimuka' }
const post = (id, code, debit, kredit) => ({ id, code, debit, kredit })
// A journal book (August), the September lampiran journals, one journal typed in the app.
const POSTINGS = [
  post('JV-2026-08-U0001', '11104', 30, 0), post('JV-2026-08-U0001', '21600', 0, 30),
  post('XL-2026-09-U0001', '11104', 20, 0), post('XL-2026-09-U0001', '21600', 0, 20),
  post('JV-2026-12', '11104', 5, 0), post('JV-2026-12', '41000', 0, 5),
]
const neraca = (rows) => rows.map(([label, value]) => ({ label, value }))

test('journal books tie to the snapshot; journals typed in the app float on top', () => {
  assert.equal(tiesToSnapshot('JV-2026-08-U0001'), true)
  assert.equal(tiesToSnapshot('XL-2026-09-U0001'), true)
  assert.equal(tiesToSnapshot('SUM-2026-02-3'), true)
  assert.equal(tiesToSnapshot('JV-2026-12'), false)
  assert.equal(tiesToSnapshot('JRN-2026-5'), false)
})

test('balances follow each account’s own side, as the Buku Besar shows them', () => {
  const tied = POSTINGS.filter(p => tiesToSnapshot(p.id))
  assert.equal(ledgerSaldo('11104', 100, tied), 150)
  assert.equal(ledgerSaldo('21600', 0, tied), 50, 'liability: kredit − debit')
})

test('a ledger that already matches the Neraca needs no adjustment', () => {
  const r = computeReconcileLines({ coa: COA, alias: ALIAS, postings: POSTINGS, neraca: neraca([['Bank BNI', 150], ['Pendapatan Diterima Dimuka', 50]]) })
  assert.deepEqual(r.lines, [])
})

test('a liability below the Neraca is credited, an asset below it debited, the net to Koreksi Ekuitas', () => {
  const r = computeReconcileLines({ coa: COA, alias: ALIAS, postings: POSTINGS, neraca: neraca([['Bank BNI', 160], ['Pendapatan Diterima Dimuka', 65]]) })
  const by = Object.fromEntries(r.lines.map(l => [l.akun_code, l]))
  assert.deepEqual([by['11104'].debit, by['11104'].kredit], [10, 0])
  assert.deepEqual([by['21600'].debit, by['21600'].kredit], [0, 15])
  assert.deepEqual([by['35000'].debit, by['35000'].kredit], [5, 0], 'plug balances the journal')
  assert.equal(r.adjusted, 2)
  const d = r.lines.reduce((s, l) => s + l.debit, 0), k = r.lines.reduce((s, l) => s + l.kredit, 0)
  assert.equal(d, k)
})

test('Saldo Laba and Laba Periode Berjalan are never adjusted (the ledger keeps the year in the revenue and expense accounts)', () => {
  const r = computeReconcileLines({ coa: COA, alias: ALIAS, postings: POSTINGS,
    neraca: neraca([['Bank BNI', 150], ['Pendapatan Diterima Dimuka', 50], ['Saldo Laba (Rugi) Tahun Lalu', -900], ['Laba (Rugi) Periode Berjalan', -40]]) })
  assert.deepEqual(r.lines, [])
})

test('an account whose Neraca line is absent from the official Neraca is brought to 0 (April 2026: 21500 carried 1.672.142.456 that the Neraca does not have)', () => {
  const coa = [...COA, { code: '21500', name: 'Biaya yang Masih Harus Dibayar', saldo_awal: 0 }]
  const alias = { ...ALIAS, '21500': 'Biaya yang Masih Harus Dibayar' }
  const postings = [...POSTINGS, post('SUM-Neraca-2026-04-21500', '21500', 0, 1672142456), post('SUM-Neraca-2026-04-21500', '11104', 1672142456, 0)]
  const r = computeReconcileLines({ coa, alias, postings, neraca: neraca([['Bank BNI', 150], ['Pendapatan Diterima Dimuka', 50]]) })
  const by = Object.fromEntries(r.lines.map(l => [l.akun_code, l]))
  assert.deepEqual([by['21500'].debit, by['21500'].kredit], [1672142456, 0])
  assert.deepEqual([by['11104'].debit, by['11104'].kredit], [0, 1672142456])
  assert.ok(!by['35000'], 'the two cancel')
})

test('LRA and NPD leave out the reconciliation journals (an adjustment on 11401 or 12300 is not spending)', async () => {
  const { withoutLedgerReconciliation } = await import('../../src/utils/reportDelta.js')
  const js = [{ id: 'ADJ-NRC-ALL-2026-02' }, { id: 'ADJ-NRC-11401-2026-03' }, { id: 'XL-2026-09-U0001' }, { id: 'ADJ-UTANG-DAERAH-JAN' }, { id: 'JV-2026-12' }]
  assert.deepEqual(withoutLedgerReconciliation(js).map(j => j.id), ['XL-2026-09-U0001', 'ADJ-UTANG-DAERAH-JAN', 'JV-2026-12'])
})
