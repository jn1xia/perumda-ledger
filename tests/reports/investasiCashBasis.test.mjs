// Investasi realized when PAID from September 2026 (option B, chosen by Bagian
// Keuangan on 11 October 2026); January–August stay realized on
// capitalization (option A, the July convention). Run: npm run test:reports
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as XLSX from 'xlsx/xlsx.mjs'
import { extractJournals } from '../../src/utils/reportSnapshot.js'
import { expandJournals } from '../../src/utils/journalExpand.js'
import { investasiLegOutline, isInvestasiVoucher, extractAccountCode, subAkunDesc } from '../../src/utils/lraOutline.js'

if (typeof XLSX.set_fs === 'function') XLSX.set_fs(fs)

const HEADER = ['', 'Tgl', '', 'Akun', 'Sub Akun', '', '', 'Keterangan', 'Kategori']
// Excel serials: 46273 = 2026-09-08, 46281 = 2026-09-16, 46287 = 2026-09-22.
// `shift` moves the vouchers back by whole days (31 → August).
const LOGO1 = 'Pembelian Logo "Perumda Pasar Banjarmasin" Pasar Malabar'
const LOGO2 = 'DP 50% Pembelian Logo "Banjarmasin Maju Sejahtera" Pasar Malabar'
const PENGAKUAN = 'Pengakuan Aset Pelunasan Pengerjaan Pasar Harum Manis'
// The three investment vouchers of JURNAL SEPTEMBER 2026 (version of 7 October).
const vouchers = (shift = 0) => [
  // 053: half of a logo paid now, the other half accrued on 21500
  ['12300', 46273 - shift, '053', 'Aset Dalam Penyelesaian', '', 27854200, '', LOGO1, 'INV'],
  [80000, 46273 - shift, '053', 'Beban di Luar Operasional', 'Beban Administrasi Bank', 2500, '', 'admin bank', ''],
  [21500, 46273 - shift, '053', 'Biaya yang Masih Harus Dibayar', '', '', 13927100, LOGO1, ''],
  [11103, 46273 - shift, '053', 'Bank Kalsel', '', '', 13929600, `${LOGO1}+admin`, ''],
  // 104: adendum paid, accrual paid off, construction in progress capitalized
  ['12102.1', 46281 - shift, '104', 'Bangunan', '', 34336000, '', 'Addedum Pekerjaan Pasar Harum Manis', ''],
  [11103, 46281 - shift, '104', 'Bank Kalsel', '', '', 34336000, 'Addedum Pekerjaan Pasar Harum Manis', ''],
  [21500, 46281 - shift, '104', 'Biaya yang Masih Harus Dibayar', '', 432017600, '', 'Pelunasan Pengerjaan Pasar Harum Manis', ''],
  [11103, 46281 - shift, '104', 'Bank Kalsel', '', '', 432017600, 'Pelunasan Pengerjaan Pasar Harum Manis', ''],
  ['12102.1', 46281 - shift, '104', 'Bangunan', '', 617168000, '', PENGAKUAN, '1.5 f Pasar Harum Manis'],
  ['12300', 46281 - shift, '104', 'Aset Dalam Penyelesaian', '', '', 617168000, PENGAKUAN, ''],
  // 130: DP 50% of another logo, the rest accrued
  ['12300', 46287 - shift, '130', 'Aset Dalam Penyelesaian', '', 20486500, '', LOGO2, 'INV'],
  [80000, 46287 - shift, '130', 'Beban di Luar Operasional', 'Beban Administrasi Bank', 2500, '', 'admin bank', ''],
  [21500, 46287 - shift, '130', 'Biaya yang Masih Harus Dibayar', '', '', 10243250, LOGO2, ''],
  [11103, 46287 - shift, '130', 'Bank Kalsel', '', '', 10245750, `${LOGO2}+admin`, ''],
]

const MONTH = { '2026-08': 'AGUSTUS', '2026-09': 'SEPTEMBER', '2026-10': 'OKTOBER' }
function journalsOf(rows, period) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...rows]), `JURNAL ${MONTH[period]} 2026`)
  return extractJournals(wb, period)
}

// Net investasi per outline, legs as the LRA reads them (debit +, kredit −).
function investasi(journals, rkap = 2) {
  const sums = {}
  for (const j of expandJournals(journals.map(x => ({ ...x, status: 'posted' })))) {
    for (const [acct, sign, amt] of [[j.akun_debit, 1, j.debit], [j.akun_kredit, -1, j.kredit]]) {
      const code = extractAccountCode(acct)
      if (!code || !amt) continue
      const outline = investasiLegOutline(code, subAkunDesc(acct, j.keterangan), rkap, j)
      if (outline) sums[outline] = (sums[outline] || 0) + sign * amt
    }
  }
  return sums
}

test('September 2026: investasi realizes when paid, as in the lampiran', () => {
  const sums = investasi(journalsOf(vouchers(), '2026-09'))
  assert.equal(sums['1.5.5'], 13927100 + 10243250, '1.5.5 Malabar 24.170.350: the paid halves')
  assert.equal(sums['1.5.6'], 34336000 + 432017600, '1.5.6 Harum Manis 466.353.600: adendum + pelunasan')
  assert.equal(Object.keys(sums).length, 2, 'bank, admin and the capitalization (12102 ← 12300) add nothing')
})

test('January–August keep the July convention: realized when capitalized', () => {
  const sums = investasi(journalsOf(vouchers(31), '2026-08'), 1)
  assert.equal(sums['1.5'], 34336000 + 617168000, 'adendum + capitalization (no Harum Manis line before the RKAP revisi: program 1.5)')
  assert.equal(sums['1.5.5'], undefined, 'payments into 12300 do not realize')
  assert.equal(Object.keys(sums).length, 1)
})

test('21500 counts only inside an investment voucher', () => {
  const oktober = 46304 // 2026-10-09
  const rows = [
    // accrual and payment of an ordinary maintenance cost: never investasi
    [62020, oktober, '201', 'Beban Pemeliharaan Bangunan Pasar', '', 5000000, '', 'Pemeliharaan Pasar Antasari', ''],
    [21500, oktober, '201', 'Biaya yang Masih Harus Dibayar', '', '', 5000000, 'Pemeliharaan Pasar Antasari', ''],
    [21500, oktober + 1, '202', 'Biaya yang Masih Harus Dibayar', '', 5000000, '', 'Pelunasan Pemeliharaan Pasar Antasari', ''],
    [11103, oktober + 1, '202', 'Bank Kalsel', '', '', 5000000, 'Pelunasan Pemeliharaan Pasar Antasari', ''],
    // a pelunasan in a voucher of its own, marked INV by the division
    [21500, oktober + 2, '203', 'Biaya yang Masih Harus Dibayar', '', 150000000, '', 'Pelunasan Pembangunan Pasar Kupu-Kupu', 'INV'],
    [11103, oktober + 2, '203', 'Bank Kalsel', '', '', 150000000, 'Pelunasan Pembangunan Pasar Kupu-Kupu', ''],
  ]
  const sums = investasi(journalsOf(rows, '2026-10'))
  assert.deepEqual(sums, { '1.5.8': 150000000 })
})

test('a two-account journal (no lines) follows the same rules', () => {
  const pay = { id: 'JV-2026-10-001', tanggal: '2026-10-12', keterangan: 'Termin 1 Pembangunan Pasar Lima',
    debit: 250000000, kredit: 250000000, akun_debit: '12300 Aset Dalam Penyelesaian', akun_kredit: '11103 Bank Kalsel' }
  assert.equal(investasiLegOutline('12300', pay.keterangan, 2, pay), '1.5.9', 'payment into 12300 from September')
  assert.equal(investasiLegOutline('11103', pay.keterangan, 2, pay), null)
  assert.equal(investasiLegOutline('12300', pay.keterangan, 2, { ...pay, tanggal: '2026-08-12' }), null, 'August: option A')
  const accrual = { ...pay, akun_debit: '12300 Aset Dalam Penyelesaian', akun_kredit: '21500 Biaya yang Masih Harus Dibayar' }
  assert.equal(isInvestasiVoucher(accrual), true)
  assert.equal(investasiLegOutline('21500', pay.keterangan, 2, accrual), '1.5.9', 'its accrual nets the payment out')
  assert.equal(isInvestasiVoucher({ ...pay, akun_debit: '21500 Biaya yang Masih Harus Dibayar' }), false)
})
