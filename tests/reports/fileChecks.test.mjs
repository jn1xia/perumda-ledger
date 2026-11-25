// Cek Berkas L1–L2 (plan 2026-11-25, Task 13; spec §5.11): before a JURNAL
// sheet is loaded, every row is read or explained, the rows read must add up
// to the sheet's own row-2 totals, and rows dated from the start of daily
// bookkeeping are stopped (they belong in the app; loading both double counts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx/xlsx.mjs'
import { checkJournalSheet } from '../../src/utils/fileChecks.js'
import { extractJournals } from '../../src/utils/reportSnapshot.js'

const serial = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse('1899-12-30T00:00:00Z')) / 86400000)
const HEAD = ['', 'Tgl', '', 'Akun', 'Sub Akun', '', '', 'Keterangan', 'Kategori']
// The October lampiran layout: row 2 totals in F/G (=SUM(F4:Fn)), row 3 header, data from row 4.
function sheet(rows, { totals, range } = {}) {
  const d = rows.reduce((s, r) => s + (typeof r[5] === 'number' ? r[5] : 0), 0)
  const k = rows.reduce((s, r) => s + (typeof r[6] === 'number' ? r[6] : 0), 0)
  const [td, tk] = totals || [d, k]
  const ws = XLSX.utils.aoa_to_sheet([['', '', '', '', '', '', '', '', ''], ['', '', '', '', '', td, tk, td - tk], HEAD, ...rows])
  const to = range || 3 + rows.length
  ws.F2.f = `SUM(F4:F${to})`
  ws.G2.f = `SUM(G4:G${to})`
  return ws
}
const row = (code, iso, name, debit, kredit, ket = 'x') => [code, serial(iso), '001', name, '', debit, kredit, ket, '']
const opts = { period: '2026-11', startDate: '2027-01-01' }

test('a clean sheet: every row read, totals match the JURNAL row 2', () => {
  const r = checkJournalSheet(sheet([row(61070, '2026-11-10', 'Beban Perlengkapan', 1000, ''), row(11101, '2026-11-10', 'Kas Kecil', '', 1000)]), opts)
  assert.equal(r.blocking, false)
  assert.equal(r.rowsRead, 2)
  assert.deepEqual(r.readTotals, { debit: 1000, kredit: 1000 })
  assert.equal(r.sheetTotals.row, 2)
  assert.ok(r.items.some(i => i.status === 'ok' && /Total terbaca sama dengan total JURNAL \(baris 2\)/.test(i.text)))
})

test('an amount typed as text is lost: the row is named and the upload is stopped', () => {
  const rows = [
    row(61070, '2026-11-10', 'Beban Perlengkapan', 1000, ''), row(11101, '2026-11-10', 'Kas Kecil', '', 1000),
    row(61040, '2026-11-11', 'Beban ATK', '1.000.000', ''), row(11101, '2026-11-11', 'Kas Kecil', '', 1000000),
  ]
  const r = checkJournalSheet(sheet(rows, { totals: [1001000, 1001000] }), opts)
  assert.deepEqual(r.skipped.map(s => [s.row, s.reason]), [[6, 'jumlah berupa teks']])
  assert.equal(r.blocking, true)
  const block = r.items.find(i => i.status === 'block')
  assert.match(block.text, /^Total yang terbaca tidak sama dengan total JURNAL \(baris 2\)\. Debit terbaca Rp 1\.000, di Excel Rp 1\.001\.000 \(selisih Rp 1\.000\.000\)/)
  assert.match(block.text, /Unggahan ditahan sampai diperbaiki\.$/)
})

test('No. Akun #N/A: without a name the row is skipped, with a name it loads without a code', () => {
  const ws = sheet([
    row(61070, '2026-11-10', 'Beban Perlengkapan', 1500, ''),
    row('', '2026-11-10', '', '', 500),
    row('', '2026-11-10', 'Kas Kecil', '', 1000),
  ], { totals: [1500, 1500] })
  ws.A5 = { t: 'e', v: 42, w: '#N/A' }
  ws.A6 = { t: 'e', v: 42, w: '#N/A' }
  const r = checkJournalSheet(ws, opts)
  assert.deepEqual(r.skipped.map(s => [s.row, s.reason]), [[5, 'No. Akun #N/A']])
  assert.deepEqual(r.noCode, [6])
  assert.equal(r.blocking, true, 'the skipped 500 is missing from the totals')
})

test('rows after the row-2 formula range warn, they do not block', () => {
  const rows = [
    row(61070, '2026-11-10', 'Beban Perlengkapan', 1000, ''), row(11101, '2026-11-10', 'Kas Kecil', '', 1000),
    row(61040, '2026-11-12', 'Beban ATK', 200, ''), row(11101, '2026-11-12', 'Kas Kecil', '', 200),
  ]
  const r = checkJournalSheet(sheet(rows, { totals: [1000, 1000], range: 5 }), opts)
  assert.deepEqual(r.beyond, [6, 7])
  assert.equal(r.blocking, false)
  assert.ok(r.items.some(i => i.status === 'warn' && /hanya sampai baris 5; baris 6, 7 tidak ikut total Excel/.test(i.text)))
})

test('a date outside the sheet\'s month is named', () => {
  const r = checkJournalSheet(sheet([row(61070, '2026-10-31', 'Beban Perlengkapan', 1000, ''), row(11101, '2026-11-01', 'Kas Kecil', '', 1000)]), opts)
  assert.deepEqual(r.outside, [4])
  assert.ok(r.items.some(i => i.status === 'warn' && /bertanggal di luar November 2026: baris 4/.test(i.text)))
})

test('rows dated from the start of daily bookkeeping are stopped', () => {
  const r = checkJournalSheet(sheet([row(61070, '2026-11-24', 'Beban Perlengkapan', 1000, ''), row(11101, '2026-11-26', 'Kas Kecil', '', 1000)]), { period: '2026-11', startDate: '2026-11-25' })
  assert.deepEqual(r.fromStart, [5])
  assert.equal(r.blocking, true)
  assert.ok(r.items.some(i => i.status === 'block' && /mulai 25\/11\/2026/.test(i.text)))
})

test('the importer still reads the same rows (shared row rule)', () => {
  const ws = sheet([row(61070, '2026-11-10', 'Beban Perlengkapan', 1000, ''), row(11101, '2026-11-10', 'Kas Kecil', '', 1000)])
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'JURNAL NOVEMBER 2026')
  const js = extractJournals(wb, '2026-11')
  assert.equal(js.length, 1)
  assert.equal(js[0].debit, 1000)
})
