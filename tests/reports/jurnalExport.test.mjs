// "JURNAL untuk Excel" (plan 2026-11-25 §6, brought into release 1 on
// 26 Nov 2026): the month's posted vouchers in the columns of Keuangan's own
// JURNAL sheet (October 2026 workbook: data from row 4, A No. Akun, B Tgl,
// C No. Bukti, D Akun, E Sub Akun, F Debit, G Kredit, H Keterangan,
// I Kategori). The workbook's report sheets read D, E, F and G, so names must
// be spelled as the workbook spells them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { jurnalUntukExcel, jurnalWorkbook, excelSerial, JURNAL_COLUMNS } from '../../src/utils/jurnalExport.js'

const line = (code, name, debit, kredit, extra = {}) => ({ akun_code: code, akun_name: name, debit, kredit, sub_akun: extra.sub || '', keterangan: extra.ket || '', kategori: extra.kat || '' })
const voucher = (no, tanggal, status, lines, extra = {}) => ({
  id: `VC-${tanggal.slice(0, 4)}-${no}`, voucher_type: extra.type || 'KK', voucher_no: no, bukti: no, tanggal, status,
  keterangan: extra.ket || 'Belanja', debit: lines.reduce((s, l) => s + l.debit, 0), kredit: lines.reduce((s, l) => s + l.kredit, 0), lines,
})
// An uploaded Excel journal (no voucher_type): the workbook's own spelling.
const excel = { id: 'XL-2026-10-0001', tanggal: '2026-10-03', status: 'posted', baseline: 1, lines: [
  line('61040', 'Beban Alat Tulis Kantor', 50000, 0, { sub: 'Beban ATK' }), line('11101', 'Kas Kecil', 0, 50000),
] }
const COA = new Map([['61040', 'Beban ATK Kantor (nama COA aplikasi)'], ['11101', 'Kas Kecil'], ['11104', 'Bank BNI'], ['41001', 'Pendapatan Sewa Kios'], ['61999', 'Beban Lain Kantor']])
const opts = { coaName: (c) => COA.get(String(c)) || '' }

const JOURNALS = [
  excel,
  voucher('0002', '2026-11-27', 'posted', [line('61040', 'x', 350000, 0, { sub: 'Beban ATK', ket: 'ATK rapat' }), line('11101', 'x', 0, 350000)]),
  voucher('0001', '2026-11-26', 'posted', [
    line('11104', 'x', 31850000, 0), line('41001', 'x', 0, 31850000, { sub: 'Sewa Kios Pasar Baru', ket: 'Setoran sewa' }),
  ], { type: 'BM', ket: 'Setoran sewa minggu 4' }),
  voucher('0003', '2026-11-28', 'pending', [line('61040', 'x', 20000, 0, { sub: 'Beban ATK' }), line('11101', 'x', 0, 20000)]),
  voucher('0004', '2026-11-29', 'draft', [line('61040', 'x', 75000, 0, { sub: 'Beban ATK' }), line('11101', 'x', 0, 75000)]),
  voucher('0001', '2026-12-01', 'posted', [line('61040', 'x', 1000, 0, { sub: 'Beban ATK' }), line('11101', 'x', 0, 1000)]),
  voucher('0005', '2026-11-30', 'posted', [line('61999', 'x', 5000, 0, { sub: 'Biaya Tak Terduga', kat: '' }), line('11101', 'x', 0, 5000)]),
]

test('the month\'s posted vouchers only, one row per line, by date and number', () => {
  const r = jurnalUntukExcel(JOURNALS, '2026-11', opts)
  assert.deepEqual(r.rows.map(x => `${x.bukti} ${x.akun_code} ${x.debit}/${x.kredit}`), [
    '0001 11104 31850000/0', '0001 41001 0/31850000',
    '0002 61040 350000/0', '0002 11101 0/350000',
    '0005 61999 5000/0', '0005 11101 0/5000',
  ])
  assert.equal(r.vouchers, 3)
  assert.equal(r.debit, 32205000)
  assert.equal(r.kredit, 32205000)
  assert.deepEqual(r.notPosted.map(v => `${v.voucher_no} ${v.status}`), ['0003 pending', '0004 draft'])
})

test('a line keeps its own description, else the voucher\'s; Sub Akun and Kategori as entered', () => {
  const r = jurnalUntukExcel(JOURNALS, '2026-11', opts)
  const sewa = r.rows.find(x => x.akun_code === '41001')
  assert.equal(sewa.keterangan, 'Setoran sewa')
  assert.equal(sewa.sub_akun, 'Sewa Kios Pasar Baru')
  assert.equal(r.rows.find(x => x.akun_code === '11104').keterangan, 'Setoran sewa minggu 4')
})

test('names as the Excel book spells them; spellings the book has never used are listed', () => {
  const r = jurnalUntukExcel(JOURNALS, '2026-11', opts)
  assert.equal(r.rows.find(x => x.akun_code === '61040').akun_name, 'Beban Alat Tulis Kantor', 'the workbook\'s spelling, not the COA\'s')
  assert.equal(r.rows.find(x => x.akun_code === '61999').akun_name, 'Beban Lain Kantor', 'never in the book: the COA name')
  assert.deepEqual(r.newNames.map(n => `${n.akun_code} ${n.akun_name}`), ['11104 Bank BNI', '41001 Pendapatan Sewa Kios', '61999 Beban Lain Kantor'])
  assert.deepEqual(r.newSubs.map(n => `${n.akun_code} ${n.sub_akun}`), ['41001 Sewa Kios Pasar Baru', '61999 Biaya Tak Terduga'])
  assert.deepEqual(r.bySub.find(s => s.akun_code === '61040'), { akun_code: '61040', akun_name: 'Beban Alat Tulis Kantor', sub_akun: 'Beban ATK', debit: 350000, kredit: 0 })
})

// Parkir: the workbook booked it on 42001 "Pendapatan Bisnis Lainnya" until
// April and on 41000 from October. A November voucher on 42001 was "used
// before", yet the November workbook (a copy of October's) no longer reads it.
test('a Sub Akun that the latest Excel month books under another account is flagged', () => {
  const xl = (id, tanggal, code, name, sub) => ({ id, tanggal, status: 'posted', lines: null, journal_lines: [line(code, name, 0, 100, { sub }), line('11101', 'Kas Kecil', 100, 0)] })
  const js = [
    xl('XL-2026-04-B.03-152', '2026-04-30', '42001', 'Pendapatan Bisnis Lainnya', 'Pendapatan Parkir'),
    xl('XL-2026-10-0007', '2026-10-31', '41000', 'Pendapatan Usaha', 'Pendapatan Parkir'),
    voucher('0003', '2026-11-27', 'posted', [line('11104', 'x', 31850000, 0), line('42001', 'x', 0, 31850000, { sub: 'Pendapatan Parkir', ket: 'Setoran parkir' })], { type: 'BM' }),
  ]
  const r = jurnalUntukExcel(js, '2026-11', opts)
  assert.equal(r.rows.find(x => x.akun_code === '42001').akun_name, 'Pendapatan Bisnis Lainnya', 'read from journal_lines when lines is empty')
  assert.deepEqual(r.newSubs, [])
  assert.equal(r.latestExcelYm, '2026-10')
  assert.deepEqual(r.moved, [{ akun_code: '42001', akun_name: 'Pendapatan Bisnis Lainnya', sub_akun: 'Pendapatan Parkir', excelAccounts: ['41000 Pendapatan Usaha'] }])
  assert.deepEqual(jurnalUntukExcel(JOURNALS, '2026-11', opts).moved, [], 'same account as the latest month: nothing to flag')
  const wb = XLSX.read(XLSX.write(jurnalWorkbook(XLSX, r, '2026-11'), { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
  const sum = XLSX.utils.sheet_to_json(wb.Sheets.Ringkasan, { header: 1 }).map(row => row.join(' | '))
  assert.ok(sum.some(s => /JURNAL Oktober 2026/.test(s) && /lain/.test(s)), 'the Ringkasan names the month')
  assert.ok(sum.some(s => /42001.*Pendapatan Parkir.*41000 Pendapatan Usaha/.test(s)))
})

test('Excel serial dates: 1 Oct 2026 is 46296, as in the October workbook', () => {
  assert.equal(excelSerial('2026-10-01'), 46296)
  assert.equal(excelSerial('2026-11-26'), 46352)
})

test('the file: "JURNAL dari aplikasi" in columns A–I ready to paste, and a Ringkasan', () => {
  const r = jurnalUntukExcel(JOURNALS, '2026-11', opts)
  const wb = XLSX.read(XLSX.write(jurnalWorkbook(XLSX, r, '2026-11'), { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true })
  assert.deepEqual(wb.SheetNames, ['JURNAL dari aplikasi', 'Ringkasan'])
  const ws = wb.Sheets['JURNAL dari aplikasi']
  assert.deepEqual(JURNAL_COLUMNS, ['No. Akun', 'Tgl', 'No. Bukti', 'Akun', 'Sub Akun', 'Debit', 'Kredit', 'Keterangan', 'Kategori'])
  assert.deepEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1', 'I1'].map(a => ws[a].v), JURNAL_COLUMNS)
  assert.equal(ws.A2.t, 'n'); assert.equal(ws.A2.v, 11104)
  assert.equal(ws.B2.t, 'n'); assert.equal(ws.B2.v, 46352); assert.equal(ws.B2.z, 'dd/mm/yyyy')
  assert.equal(ws.C2.t, 's'); assert.equal(ws.C2.v, '0001')
  assert.equal(ws.D2.v, 'Bank BNI')
  assert.equal(ws.F2.v, 31850000)
  assert.equal(ws.G2, undefined, 'the other side stays empty, as in the workbook')
  assert.equal(ws.G3.v, 31850000)
  assert.equal(ws.E3.v, 'Sewa Kios Pasar Baru')
  assert.equal(ws['!ref'], 'A1:I7')
  const sum = XLSX.utils.sheet_to_json(wb.Sheets.Ringkasan, { header: 1 }).map(row => row.join(' | '))
  assert.ok(sum.some(s => /November 2026/.test(s)))
  assert.ok(sum.some(s => /0003.*diajukan/.test(s)), 'unposted vouchers are named')
  assert.ok(sum.some(s => /61999.*Beban Lain Kantor/.test(s)), 'new spellings are named')
})
