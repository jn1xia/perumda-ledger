// Trial Oktober 2026 (Bagian Keuangan, 10-11-2026): the app's journal-mode
// reports differed from the lampiran on lines where the program, not the
// journal, was wrong. Fixture: the lampiran's JURNAL OKTOBER 2026 sheet
// (cached values) and the September Neraca snapshot on live.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { octoberJournals } from '../fixtures/octoberBook.mjs'
import { expandJournals } from '../../src/utils/journalExpand.js'
import {
  reportLineAccount, effectiveSubCode, extractAccountCode, resolveOutline, lrRevenueGroup,
  isPiutangReceipt,
} from '../../src/utils/lraOutline.js'
import { buildNeracaRows, buildArusKasIndirectRows, lineItemsByPrefix, attributeDelta, composeLabaRugi } from '../../src/utils/reportDelta.js'

const fixtures = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'fixtures')
const SEP_NERACA = JSON.parse(fs.readFileSync(path.join(fixtures, 'neraca_september_2026.json'), 'utf8')).rows

const closeTo = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`)
const expanded = () => expandJournals(octoberJournals())

test('the October fixture parses into the lampiran book (220 vouchers) and the uploaded one (241)', () => {
  assert.equal(octoberJournals().length, 220)
  assert.equal(octoberJournals({ withBukti: false }).length, 241)
})

test('Laba Rugi line items are net of a refund on the same account (Perjalanan Dinas)', () => {
  const items = lineItemsByPrefix(expanded(), '61', true)
  const pd = items.find(i => i.code === '61090')
  closeTo(pd.amount, 30520042, 0.005, 'Beban Perjalanan Dinas = 30.742.234 − refund 222.192')
  assert.equal(pd.name, 'Beban Perjalanan Dinas')
})

test('the Pasar Antasari electricity reroute applies to July 2026 only', () => {
  assert.deepEqual(reportLineAccount('61050', 'Beban Listrik', 'Pembayaran Listrik Pasar Antasari Bulan Juli 2026', '2026-07-20'), { code: '51002', name: 'Beban Pokok Listrik' })
  assert.equal(reportLineAccount('61050', 'Beban Listrik', 'Pembayaran Listrik Kantor Antasari', '2026-10-05'), null)
  assert.equal(reportLineAccount('61050', 'Beban Listrik', 'Pembayaran Listrik Pasar Antasari'), null, 'no date → no reroute')
  const items = lineItemsByPrefix(expanded(), '61', true)
  closeTo(items.find(i => i.code === '61050').amount, 10472951, 0.005, 'Beban Telepon/Listrik/Air/Wifi/Website keeps the office power')
  closeTo(lineItemsByPrefix(expanded(), '51', true).find(i => i.code === '51002').amount, 156489162, 0.005, 'Beban Pokok Listrik')
})

test('Parkir booked on 41000 > Pendapatan Parkir reads as 42001 (LRA 1.9, Bisnis Utama)', () => {
  assert.equal(effectiveSubCode('41000', 'Pendapatan Parkir'), '42001')
  const code = extractAccountCode('41000 Pendapatan Bisnis Utama > Pendapatan Parkir')
  assert.equal(code, '42001')
  assert.equal(resolveOutline(code, '', 2), '1.9')
  assert.equal(lrRevenueGroup(code, '2026-10-31'), '41')
})

test('a reclass between receivable accounts is not a receipt on LRA 1.6', () => {
  assert.equal(isPiutangReceipt({ _counterCodes: ['11204'] }), false)
  assert.equal(isPiutangReceipt({ _counterCodes: ['11104'] }), true)
  assert.equal(isPiutangReceipt({ _counterCodes: ['11104', '11204'] }), true, 'cash leg present → receipt')
  assert.equal(isPiutangReceipt({ _counterCodes: [] }), true)
  assert.equal(isPiutangReceipt({}), true)
  const receipts = expanded()
    .filter(j => extractAccountCode(j.akun_kredit) === '11201' && isPiutangReceipt(j))
    .reduce((s, j) => s + j.kredit, 0)
  closeTo(receipts, 52897348, 0.005, 'Penerimaan 1.6 bulan ini (lampiran)')
})

test('October Neraca: Nilai Buku of Aset Lainnya and Piutang Bisnis Lainnya as the lampiran', () => {
  const rows = buildNeracaRows(SEP_NERACA, expanded(), { baseYM: '2026-09', viewYM: '2026-10' })
  const nilaiBuku = rows.filter(r => /^nilai buku/i.test(r.label)).map(r => r.value)
  closeTo(nilaiBuku[2], 65625000, 0.01, 'Nilai Buku (Aset Tidak Berwujud)')
  closeTo(nilaiBuku[1], 1812387874.82, 0.01, 'Nilai Buku (Aset Tetap)')
  const pbl = rows.find(r => r.label === 'Piutang Bisnis Lainnya')
  assert.ok(pbl, 'Piutang Bisnis Lainnya has its own line')
  closeTo(pbl.value, 3946880, 0.005, 'Piutang Bisnis Lainnya')
  assert.ok(!rows.some(r => /Belum Terpetakan/.test(r.label)), 'nothing unmapped')
  closeTo(rows.find(r => r.label === 'JUMLAH ASET').value, 865284224538.25, 0.05, 'Jumlah Aset')
})

test('October Arus Kas: Piutang Bisnis Lainnya on its own line, nothing left over', () => {
  const E = expanded()
  const A = attributeDelta(E)
  const lr = composeLabaRugi(A.lrSec)
  closeTo(lr.sebelumPajak, -526174783.94, 0.01, 'Laba (Rugi) sebelum pajak (lampiran)')
  const amortisasi = lineItemsByPrefix(E, '61136', true)[0].amount
  const ak = buildArusKasIndirectRows({
    journals: E, labaSebelumPajak: lr.sebelumPajak, penyusutan: A.lrSec.penyusutan - amortisasi, amortisasi, pajakRow: 0, kasAwal: 0,
  })
  const pbl = ak.rows.find(r => r.label === 'Piutang Bisnis Lainnya')
  assert.ok(pbl, 'row present')
  closeTo(pbl.value, -3946880, 0.005, 'Piutang Bisnis Lainnya')
  closeTo(ak.residual, 0, 0.005, 'no Penyesuaian Lainnya')
  assert.ok(!ak.rows.some(r => r.label === 'Penyesuaian Lainnya'))
})

test('the 11204 Arus Kas line is omitted in a month that does not use it', () => {
  const ak = buildArusKasIndirectRows({ journals: [], labaSebelumPajak: 0 })
  assert.ok(!ak.rows.some(r => r.label === 'Piutang Bisnis Lainnya'))
})
