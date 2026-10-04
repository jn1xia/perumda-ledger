// Regression tests for the Excel import/classification pipeline, pinned to the
// division's REAL files (tests/fixtures + src/FILES). Run: npm run test:reports
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx/xlsx.mjs'
import {
  extractSnapshot, extractJournals, classifySnapshot, detectLampiranPeriods,
  hasReportValues, filterValidLra, dominantJournalPeriod,
} from '../../src/utils/reportSnapshot.js'

if (typeof XLSX.set_fs === 'function') XLSX.set_fs(fs)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const FIX = path.join(root, 'fixtures')
const FILES = path.join(path.dirname(root), 'src', 'FILES')

const DIVISI_JUNI = path.join(FIX, 'JURNAL JUNI 2026 (divisi).xlsx')
// Full-bundle June lampiran re-sent by the division after the 16 Jul 2026
// meeting (rapat lanjutan ke-12) — same book, canonical filename.
const LAMPIRAN_JUNI2 = path.join(FILES, 'LAMPIRAN LAPORAN KEUANGAN JUNI 2026.xlsx')

test('journal-book upload (JURNAL JUNI divisi) classifies as jurnal mode', () => {
  const wb = XLSX.readFile(DIVISI_JUNI)
  const periods = detectLampiranPeriods(wb)
  assert.deepEqual(periods.map(p => p.period), ['2026-06'])
  const snap = extractSnapshot(wb, '2026-06')
  assert.equal(classifySnapshot(snap), 'jurnal',
    'a journal book without readable official report sheets must NOT be saved as a frozen snapshot')
  assert.equal(hasReportValues(snap.labaRugi), false)
  assert.deepEqual(Object.keys(filterValidLra(snap.lra)), [])
})

test('journal-book journals parse balanced with the known division totals', () => {
  const wb = XLSX.readFile(DIVISI_JUNI)
  const journals = extractJournals(wb, '2026-06')
  // 166 entries (115 before 04-10-2026): rows without a voucher number no
  // longer ride on the voucher above once that voucher balances or the date
  // changes — see the next test. Totals below are unchanged.
  assert.equal(journals.length, 166, 'the division file carries 166 journal entries')

  let d = 0, k = 0
  const byCode = {}
  for (const j of journals) {
    d += j.debit; k += j.kredit
    assert.ok(Math.abs(j.debit - j.kredit) <= 0.01, `journal ${j.id} must balance (D ${j.debit} vs K ${j.kredit})`)
    for (const l of j.lines || []) {
      byCode[l.akun_code] = byCode[l.akun_code] || { d: 0, k: 0 }
      byCode[l.akun_code].d += l.debit
      byCode[l.akun_code].k += l.kredit
    }
  }
  assert.ok(Math.abs(d - k) <= 0.01, 'month must balance overall')
  // The figures the division cross-checked on video (07-07-2026):
  assert.equal(byCode['41000'].k, 923617078, 'Pendapatan Bisnis Utama = Buku Besar video figure')
  assert.equal(byCode['61010'].d, 179037684, 'Beban Gaji = Buku Besar video figure')
  assert.equal(byCode['42000'].k, 366672387)
})

test('a row without voucher number starts its own entry once the voucher above balances', () => {
  // JURNAL JUNI: month-end and ad-hoc rows carry no No. Bukti. They used to be
  // appended to the voucher above them — so voucher 063 "Pembayaran Service
  // Printer Kantor" (Rp 100.000) also held the Rp 364.112.437 PPh payment, and
  // a 1 June bank fee was filed under 30 June.
  const journals = extractJournals(XLSX.readFile(DIVISI_JUNI), '2026-06')
  const v063 = journals.filter(j => j.bukti === '063')
  assert.equal(v063.length, 1)
  assert.equal(v063[0].debit, 100000, 'voucher 063 is the printer service only')
  const pph = journals.find(j => j.lines.some(l => l.akun_code === '80000' && l.debit === 364112437))
  assert.ok(pph && pph.bukti === '' && pph.keterangan === 'Pajak Penghasilan Perumda')
  assert.equal(pph.tanggal, '2026-06-15')
  const fee = journals.find(j => j.lines.some(l => l.akun_code === '80000' && l.debit === 15000))
  assert.equal(fee.tanggal, '2026-06-01', 'keeps its own date instead of the 30 June voucher above it')
  for (const j of journals) assert.ok(Math.abs(j.debit - j.kredit) <= 0.01, `entry ${j.id} ${j.tanggal} ${j.bukti} must balance`)

  // A continuation row still joins its voucher while the voucher is unbalanced,
  // and a row on a later date starts a new entry even inside an open voucher.
  const ws = XLSX.utils.aoa_to_sheet([
    ['', 'Tgl', '', 'Akun', 'Sub Akun', '', '', 'Keterangan'],
    [62020, 46294, '177', 'Beban Pemeliharaan Bangunan Pasar', '', 825000, '', 'Upah'],
    [80000, 46294, '', 'Beban di Luar Operasional', 'Beban Administrasi Bank', 2500, '', 'admin bank'],
    [11103, 46294, '177', 'Bank Kalsel', '', '', 827500, 'Upah'],
    [61136, 46295, '', 'Beban Amortisasi Aset Tidak Berwujud', '', 1458333.33, '', ''],
    ['13101.2', 46295, '', 'Akumulasi Amortisasi Aset Tidak Berwujud', '', '', 1458333.33, ''],
    [61130, 46295, '', 'Beban Penyusutan Aktiva Tetap', 'Beban Penyusutan Bangunan', 274940172.16, '', ''],
    ['12102.2', 46295, '', 'Akumulasi Penyusutan Bangunan', '', '', 274940172.16, ''],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'JURNAL SEPTEMBER 2026')
  const sep = extractJournals(wb, '2026-09')
  assert.deepEqual(sep.map(j => [j.tanggal, j.bukti, j.lines.length]), [
    ['2026-09-29', '177', 3],
    ['2026-09-30', '', 2],
    ['2026-09-30', '', 2],
  ])
  assert.equal(sep[1].keterangan, 'Beban Amortisasi Aset Tidak Berwujud', 'a blank entry is named after its account')
  assert.equal(sep[2].keterangan, 'Beban Penyusutan Bangunan', '…or its Sub Akun')
})

test('official lampiran still classifies as snapshot mode', () => {
  const wb = XLSX.readFile(LAMPIRAN_JUNI2)
  const snap = extractSnapshot(wb, '2026-06')
  assert.equal(classifySnapshot(snap), 'snapshot')
  assert.ok(hasReportValues(snap.neraca), 'neraca sheet carries real values')
  assert.ok(hasReportValues(snap.labaRugi), 'laba rugi sheet carries real values')
  assert.ok(snap.journals.length > 0, 'baseline journals parse from the JURNAL sheet')
})

test('hasReportValues rejects label-only / stray-value rows', () => {
  assert.equal(hasReportValues([]), false)
  assert.equal(hasReportValues([{ label: 'EBITDA', value: 210 }]), false, 'a single stray numeric must not qualify')
  assert.equal(hasReportValues([
    { label: 'a', value: 1 }, { label: 'b', value: 2 }, { label: 'c', value: 3 },
    { label: 'd', value: 4 }, { label: 'e', value: 5 },
  ]), true)
})

test('mislabeled JURNAL tab is imported by ROW DATES, not the tab name (July rows on a "JUNI" tab)', () => {
  // A journal book whose tab is still named "JURNAL JUNI 2026" but whose rows
  // are all dated in July. Importing it as June would wipe June and file July's
  // rows under June — the importer must follow the transaction dates instead.
  const JUL1 = 46204 // 2026-07-01 as an Excel serial
  const aoa = [
    ['', '', '', '', '', '', '', '', ''],
    [null, 'Tgl', null, 'Akun', 'Sub Akun', 'D', 'K', 'Keterangan', null],
    ['61060', JUL1, '001', 'Beban Konsumsi Rapat', 'Makan Minum', 300000, null, 'Konsumsi rapat', null],
    ['11101', JUL1, '001', 'Kas Kecil', null, null, 300000, 'Konsumsi rapat', null],
    ['61040', JUL1 + 2, '002', 'Beban ATK', 'ATK', 150000, null, 'ATK', null],
    ['11101', JUL1 + 2, '002', 'Kas Kecil', null, null, 150000, 'ATK', null],
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'JURNAL JUNI 2026')

  // Row dates win over the tab name.
  assert.equal(dominantJournalPeriod(wb.Sheets['JURNAL JUNI 2026']), '2026-07')
  const detected = detectLampiranPeriods(wb)
  assert.deepEqual(detected.map(p => p.period), ['2026-07'], 'detected period follows the row dates')
  assert.equal(detected[0].namePeriod, '2026-06')
  assert.equal(detected[0].mismatch, true, 'the name/date disagreement is flagged for the UI')

  // June is NEVER in the candidate list → the upload flow cannot overwrite June.
  assert.ok(!detected.some(p => p.period === '2026-06'))

  // extractJournals for the CORRECT (row-date) period finds the mislabeled tab.
  const july = extractJournals(wb, '2026-07')
  assert.equal(july.length, 2)
  assert.ok(july.every(j => j.tanggal.startsWith('2026-07')))
})
