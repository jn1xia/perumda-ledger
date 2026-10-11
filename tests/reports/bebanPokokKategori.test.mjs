// Beban Pokok 4.1 / 4.2 from the JURNAL "Kategori" column (BAPOK / GERAI).
// The lampiran September 2026 (version of 7 October) splits Beban Pokok with
// that column: GERAI 182.700.300 = LRA 4.2 bulan ini, BAPOK 372.391.080 = 4.1.
// Run: npm run test:reports
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as XLSX from 'xlsx/xlsx.mjs'
import { extractJournals } from '../../src/utils/reportSnapshot.js'
import { expandJournals } from '../../src/utils/journalExpand.js'
import { cashBasisPokokOutline, extractAccountCode, isGeraiKategori } from '../../src/utils/lraOutline.js'

if (typeof XLSX.set_fs === 'function') XLSX.set_fs(fs)

// Excel serials: 46269 = 2026-09-04 … 46295 = 2026-09-30.
const HEADER = ['', 'Tgl', '', 'Akun', 'Sub Akun', '', '', 'Keterangan', 'Kategori']
const SEPTEMBER_ROWS = [
  // GERAI purchases (lampiran rows 116, 219) → 4.2
  [11401, 46269, '038', 'Persediaan Barang Dagang (Bapok dan Gerai Inflasi)', '', 71702500, '', 'Pembelian Minyak Goreng Gerai Inflasi', 'GERAI'],
  [11103, 46269, '038', 'Bank Kalsel', '', '', 71702500, 'Pembelian Minyak Goreng Gerai Inflasi', ''],
  [11401, 46276, '083', 'Persediaan Barang Dagang (Bapok dan Gerai Inflasi)', '', 20449800, '', 'Pembelian Gula Tk. Busu Hadar Gerai Inflasi', 'GERAI'],
  [11103, 46276, '083', 'Bank Kalsel', '', '', 20449800, 'Pembelian Gula Tk. Busu Hadar Gerai Inflasi', ''],
  // BAPOK purchase (row 318) and LPG purchase → 4.1
  [11401, 46287, '122', 'Persediaan Barang Dagang (Bapok dan Gerai Inflasi)', '', 130928280, '', 'Pembelian Telur Ayam Ras @23.700/5.524,40kg', 'BAPOK'],
  [11103, 46287, '122', 'Bank Kalsel', '', '', 130928280, 'Pembelian Telur Ayam Ras @23.700/5.524,40kg', ''],
  [11402, 46287, '123', 'Persediaan Barang Dagang (Gas LPG)', '', 9455000, '', 'Pembelian Gas LPG', 'BAPOK'],
  [11103, 46287, '123', 'Bank Kalsel', '', '', 9455000, 'Pembelian Gas LPG', ''],
  // Direct cash 51000 tagged BAPOK (row 164) → 4.1
  [51000, 46274, '058', 'Beban Pokok Penjualan (Bapok & Gerai Inflasi)', '', 161600, '', 'Pengadaan Telur Ayam Tambahan', 'BAPOK'],
  [11101, 46274, '058', 'Kas Kecil', '', '', 161600, 'Pengadaan Telur Ayam Tambahan', ''],
  // Month-end COGS recognition credits inventory: not a cash outflow, never counted
  [51000, 46295, '', 'Beban Pokok Penjualan (Bapok & Gerai Inflasi)', '', 462486807, '', '', ''],
  [11401, 46295, '', 'Persediaan Barang Dagang (Bapok dan Gerai Inflasi)', '', '', 462486807, '', ''],
  // Listrik keeps 4.3 whatever its Kategori
  [51002, 46280, '100', 'Beban Pokok Listrik', '', 165453636, '', 'Pembayaran Listrik Antasari', 'GERAI'],
  [11103, 46280, '100', 'Bank Kalsel', '', '', 165453636, 'Pembayaran Listrik Antasari', ''],
]

function workbook(rows, header = HEADER) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'JURNAL SEPTEMBER 2026')
  return wb
}

function pokokByOutline(journals) {
  const sums = {}
  for (const j of expandJournals(journals.map(x => ({ ...x, status: 'posted' })))) {
    const code = extractAccountCode(j.akun_debit)
    if (!code || !j.debit) continue
    const outline = cashBasisPokokOutline(code, j)
    if (outline) sums[outline] = (sums[outline] || 0) + j.debit
  }
  return sums
}

test('the JURNAL "Kategori" column reaches every posting line', () => {
  const journals = extractJournals(workbook(SEPTEMBER_ROWS), '2026-09')
  const lines = journals.flatMap(j => j.lines)
  const gerai = lines.find(l => l.debit === 71702500)
  assert.equal(gerai.kategori, 'GERAI')
  assert.equal(lines.find(l => l.debit === 130928280).kategori, 'BAPOK')
  assert.ok(!('kategori' in lines.find(l => l.kredit === 71702500)), 'a blank Kategori adds no key')
  const lower = extractJournals(workbook([[11401, 46269, '038', 'Persediaan', '', 5, '', 'x', ' gerai '], [11103, 46269, '038', 'Bank', '', '', 5, 'x', '']]), '2026-09')
  assert.equal(lower[0].lines[0].kategori, 'GERAI', 'trimmed and upper-cased')
})

test('September: GERAI purchases realize on 4.2, BAPOK and untagged on 4.1', () => {
  const sums = pokokByOutline(extractJournals(workbook(SEPTEMBER_ROWS), '2026-09'))
  assert.equal(sums['4.2'], 71702500 + 20449800)
  assert.equal(sums['4.1'], 130928280 + 9455000 + 161600)
  assert.equal(sums['4.3'], 165453636, 'Listrik stays 4.3 even when tagged GERAI')
  assert.equal(Object.keys(sums).length, 3, 'the month-end COGS recognition (51000 / K 11401) stays out')
})

test('a JURNAL sheet without a Kategori column keeps every purchase on 4.1', () => {
  const rows = SEPTEMBER_ROWS.map(r => r.slice(0, 8))
  const journals = extractJournals(workbook(rows, HEADER.slice(0, 8)), '2026-09')
  assert.ok(journals.every(j => j.lines.every(l => !('kategori' in l))))
  const sums = pokokByOutline(journals)
  assert.equal(sums['4.1'], 71702500 + 20449800 + 130928280 + 9455000 + 161600)
  assert.equal(sums['4.2'], undefined)
})

test('cashBasisPokokOutline: Kategori moves only the 4.1 bucket', () => {
  assert.equal(cashBasisPokokOutline('11401', { _kategori: 'GERAI' }), '4.2')
  assert.equal(cashBasisPokokOutline('11402', { _kategori: 'GERAI' }), '4.2')
  assert.equal(cashBasisPokokOutline('11401', { _kategori: 'BAPOK' }), '4.1')
  assert.equal(cashBasisPokokOutline('11401', { _kategori: 'INV' }), '4.1')
  assert.equal(cashBasisPokokOutline('11401', {}), '4.1')
  assert.equal(cashBasisPokokOutline('11401', null), '4.1')
  assert.equal(cashBasisPokokOutline('51000', { _counterCodes: ['11101'], _kategori: 'GERAI' }), '4.2')
  assert.equal(cashBasisPokokOutline('51000', { _counterCodes: ['11401'], _kategori: 'GERAI' }), null, 'accrual COGS stays out')
  assert.equal(cashBasisPokokOutline('51002', { _counterCodes: ['11103'], _kategori: 'GERAI' }), '4.3')
  assert.equal(cashBasisPokokOutline('51003', { _counterCodes: ['11101'], _kategori: 'GERAI' }), '4.4')
  assert.equal(cashBasisPokokOutline('62020', { _kategori: 'GERAI' }), null)
  assert.equal(isGeraiKategori('Gerai Inflasi'), true)
  assert.equal(isGeraiKategori(''), false)
  assert.equal(isGeraiKategori(null), false)
})

test('expandJournals carries the Kategori from journal_lines rows (null when blank)', () => {
  const j = {
    id: 'JV-2026-09-U0001', tanggal: '2026-09-04', status: 'posted', keterangan: 'Pembelian Minyak Goreng Gerai Inflasi',
    journal_lines: [
      { akun_code: '11401', akun_name: 'Persediaan Barang Dagang', sub_akun: '', debit: 71702500, kredit: 0, keterangan: '', kategori: 'GERAI' },
      { akun_code: '11103', akun_name: 'Bank Kalsel', sub_akun: '', debit: 0, kredit: 71702500, keterangan: '', kategori: null },
    ],
  }
  const [d, k] = expandJournals([j])
  assert.equal(d._kategori, 'GERAI')
  assert.equal(k._kategori, '')
  assert.equal(cashBasisPokokOutline(extractAccountCode(d.akun_debit), d), '4.2')
})
