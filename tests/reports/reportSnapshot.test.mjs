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
  assert.equal(journals.length, 115, 'the division file carries 115 journals')

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
