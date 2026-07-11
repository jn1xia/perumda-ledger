// Acceptance tests: with the division's real June upload, the journal-mode
// report engines must reproduce the official lampiran figures line by line —
// docs/FORMULA_SPEC_LAMPIRAN_JUNI_2026.md §12 is the source of every expected
// number here. These are the values the finance division compares against.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx/xlsx.mjs'
import { extractJournals } from '../../src/utils/reportSnapshot.js'
import { expandJournals } from '../../src/utils/journalExpand.js'
import {
  attributeDelta, composeLabaRugi, buildNeracaRows, buildArusKasIndirectRows, codeOf,
} from '../../src/utils/reportDelta.js'
import { resolveOutline, effectiveSubCode, extractAccountCode, CASH_BASIS_BEBAN_POKOK } from '../../src/utils/lraOutline.js'

if (typeof XLSX.set_fs === 'function') XLSX.set_fs(fs)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DIVISI_JUNI = path.join(root, 'fixtures', 'JURNAL JUNI 2026 (divisi).xlsx')

const closeTo = (actual, expected, tol = 0.02, msg = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: got ${actual}, expected ${expected} (±${tol})`)

function juneExpanded() {
  const wb = XLSX.readFile(DIVISI_JUNI)
  const journals = extractJournals(wb, '2026-06').map(j => ({ ...j, status: 'posted', baseline: 0 }))
  return expandJournals(journals)
}

// ── The May 2026 closing Neraca (lampiran column K) — the June baseline ──────
// Labels carry the lampiran's whitespace quirks on purpose: attribution must
// survive them (normLabel matching).
const MAY_NERACA = [
  { label: 'ASET', value: null },
  { label: 'Kas Kecil  - Kantor', value: 23529440 },
  { label: 'Kas Pendapatan Belum Setor', value: 0 },
  { label: 'Kas Bank Kalsel', value: 6321630612.83 },
  { label: 'Bank BNI', value: 8000941421 },
  { label: 'Investasi Jangka Pendek', value: 0 },
  { label: 'Bank BNI Bisnis', value: 123696497 },
  { label: 'Bank BNI Tapcash', value: 53119090 },
  { label: 'Bank BSI', value: 30983000 },
  { label: 'Piutang Usaha', value: 403062651 },
  { label: 'Perlengkapan', value: 0 },
  { label: 'Persediaan Barang Dagang (Bapok dan Gerai Inflasi)', value: 57460250 },
  { label: 'Persediaan Barang Dagang (Gas LPG)', value: 47720000 },
  { label: 'BBM Dibayar di Muka', value: 22100000 },
  { label: 'Jumlah Aset Lancar', value: 15084242961.83 },
  { label: 'Tanah ', value: 786424200000 },
  { label: 'Bangunan', value: 65522933418 },
  { label: 'Akumulasi Penyusutan Bangunan', value: -4581497627.541666 },
  { label: 'Nilai Buku', value: 847365635790.4584 },
  { label: 'Mesin', value: 59310000 },
  { label: 'Akumulasi Penyusutan Mesin', value: -6795937.5 },
  { label: 'Instalasi Listrik', value: 14033500 },
  { label: 'Akumulasi Penyusutan Instalasi Listrik', value: -819593.4583333335 },
  { label: 'Peralatan', value: 829610567 },
  { label: 'Akumulasi Penyusutan Peralatan', value: -36768059.829666674 },
  { label: 'Kendaraan', value: 355905800 },
  { label: 'Akumulasi Penyusutan Kendaraan', value: -25951464.416666664 },
  { label: 'Nilai Buku ', value: 1188524811.7953331 },
  { label: 'Aset Dalam Penyelesaian', value: 99280000 },
  { label: 'Aset Tidak Berwujud', value: 0 },
  { label: 'Jumlah Aset Tidak Lancar', value: 848653440602.2537 },
  { label: 'JUMLAH ASET', value: 863737683564.0836 },
  { label: 'Dana Talangan', value: 0 },
  { label: 'Utang Usaha', value: 32712000 },
  { label: 'Utang Daerah', value: 19742006 },
  { label: 'Pendapatan Diterima Dimuka', value: 1548333335 },
  { label: 'Biaya yang Masih Harus Dibayar', value: 0 },
  { label: 'Utang Bank', value: 0 },
  { label: 'JUMLAH KEWAJIBAN', value: 1600787341 },
  { label: 'Modal Perumda Pasar Banjarmasin', value: 850759100000 },
  { label: 'Modal Disetor', value: 15000000000 },
  { label: 'Saldo Laba (Rugi) Periode Lalu', value: -3237908077.1299996 },
  { label: '(Laba) Rugi Periode Berjalan', value: -384295699.78666663 },
  { label: 'Koreksi Ekuitas', value: 0 },
  { label: 'JUMLAH EKUITAS', value: 862136896223.0834 },
  { label: 'JUMLAH KEWAJIBAN DAN EKUITAS', value: 863737683564.0834 },
]

test('sub-akun reroute: PPh journaled under 80000 classifies as 99999', () => {
  assert.equal(effectiveSubCode('80000', 'Pajak Penghasilan'), '99999')
  assert.equal(effectiveSubCode('80000', 'Beban Pajak Bank'), '80001')
  assert.equal(effectiveSubCode('80000', 'Beban Administrasi Bank'), '80002')
  assert.equal(effectiveSubCode('80000', 'Beban Kerugian Persediaan'), '80004')
  assert.equal(effectiveSubCode('70000', 'Pendapatan Bunga'), '70001')
  assert.equal(codeOf('80000 Beban di Luar Operasional > Pajak Penghasilan'), '99999')
  assert.equal(codeOf('70000 Pendapatan di Luar Operasional > Pendapatan Bunga'), '70001')
  assert.equal(extractAccountCode('80000 Beban di Luar Operasional > Pajak Penghasilan'), '99999')
  // Explicit 99999 and the header-coded form must classify identically.
  const mk = (acct) => expandJournals([{ id: 'T-1', tanggal: '2026-06-15', status: 'posted', debit: 100, kredit: 100, akun_debit: acct, akun_kredit: '11103 Bank Kalsel' }])
  const a = composeLabaRugi(attributeDelta(mk('99999 Pajak Penghasilan')).lrSec)
  const b = composeLabaRugi(attributeDelta(mk('80000 Beban di Luar Operasional > Pajak Penghasilan')).lrSec)
  assert.deepEqual(a, b)
})

test('LABA RUGI Juni matches the lampiran, subtotal by subtotal (spec §12)', () => {
  const A = attributeDelta(juneExpanded())
  const c = composeLabaRugi(A.lrSec)
  closeTo(c.pendUsaha, 1290289465, 0.02, 'Jumlah Pendapatan Usaha')
  closeTo(c.bpp, 189138200, 0.02, 'Jumlah BPP')
  closeTo(c.bruto, 1101151265, 0.02, 'Laba Bruto')
  closeTo(c.admin, 743330990.1005, 0.02, 'Jumlah Beban Umum & Administrasi')
  closeTo(c.ops, 762289002, 0.02, 'Jumlah Beban Operasional (incl. Beban PPN dan PPH)')
  closeTo(c.pajak, 423367799, 0.02, 'Beban PPN dan PPH (PPh via Sub Akun)')
  closeTo(c.bebanUsaha, 1505619992.1005, 0.02, 'Jumlah Beban Usaha')
  closeTo(c.labaUsaha, -404468727.1005, 0.02, 'Laba (Rugi) Usaha')
  closeTo(c.pendLain, 18502909.05, 0.02, 'Pendapatan Lain-lain')
  closeTo(c.bebanNonOps, 4219483.01, 0.02, 'Beban Non Operasional (PPh excluded!)')
  closeTo(c.netLainLain, 14283426.04, 0.02, 'Pendapatan dan (Beban Lain-lain)')
  closeTo(c.sebelumPajak, -390185301.0605, 0.02, 'Laba Bersih Sebelum Pajak')
  closeTo(c.setelahPajak, -390185301.0605, 0.02, 'Laba Bersih Setelah Pajak')
  closeTo(c.ebitda, 333012664, 0.02, 'EBITDA (lampiran J81)')
  closeTo(A.lrSec.penyusutan, 314632492.1005, 0.02, 'Penyusutan')
  closeTo(A.lrSec.bunga, 18502909.05, 0.02, 'Pendapatan Bunga Bank')
  closeTo(A.lrSec.pajakBank, 3700583.01, 0.02, 'Beban Pajak Bank')
})

test('NERACA Juni = May baseline + June journals, incl. equity roll-forward (spec §12)', () => {
  const rows = buildNeracaRows(MAY_NERACA, juneExpanded(), { baseYM: '2026-05', viewYM: '2026-06' })
  const val = (lbl) => rows.find(r => r.label === lbl)?.value
  closeTo(val('Kas Kecil  - Kantor'), 10932615, 0.02, 'Kas Kecil')
  closeTo(val('Kas Bank Kalsel'), 6806187798.87, 0.02, 'Bank Kalsel')
  closeTo(val('Bank BNI'), 8913626899, 0.02, 'Bank BNI')
  closeTo(val('Bank BNI Bisnis'), 206989852, 0.02, 'Bank BNI Bisnis (alias shift fixed)')
  closeTo(val('Bank BNI Tapcash'), 53110935, 0.02, 'Bank BNI Tapcash')
  closeTo(val('Bank BSI'), 35948000, 0.02, 'Bank BSI (was unmapped)')
  closeTo(val('Piutang Usaha'), 344711240, 0.02, 'Piutang Usaha')
  closeTo(val('Persediaan Barang Dagang (Bapok dan Gerai Inflasi)'), 64011250, 0.02, 'Persediaan Bapok')
  closeTo(val('Persediaan Barang Dagang (Gas LPG)'), 46500000, 0.02, 'Persediaan LPG')
  closeTo(val('BBM Dibayar di Muka'), 31400000, 0.02, 'BBM Dibayar di Muka')
  closeTo(val('Jumlah Aset Lancar'), 16513418589.87, 0.05, 'Jumlah Aset Lancar')
  closeTo(val('Bangunan'), 65946028418, 0.02, 'Bangunan')
  closeTo(val('Akumulasi Penyusutan Bangunan'), -4854509850.121666, 0.02, 'Ak. Peny. Bangunan')
  closeTo(val('Nilai Buku'), 847515718567.8783, 0.05, 'Nilai Buku Properti Investasi')
  closeTo(val('Instalasi Listrik'), 49196330, 0.02, 'Instalasi Listrik')
  closeTo(val('Peralatan'), 833460567, 0.02, 'Peralatan')
  closeTo(val('Akumulasi Penyusutan Peralatan'), -73616327.996, 0.02, 'Ak. Peny. Peralatan')
  closeTo(val('Nilai Buku '), 1185917372.2748332, 0.05, 'Nilai Buku Aset Tetap')
  closeTo(val('Aset Dalam Penyelesaian'), 800814000, 0.02, 'Aset Dalam Penyelesaian')
  closeTo(val('Jumlah Aset Tidak Lancar'), 849502449940.1531, 0.05, 'Jumlah Aset Tidak Lancar')
  closeTo(val('JUMLAH ASET'), 866015868530.02, 0.05, 'JUMLAH ASET')
  closeTo(val('Utang Usaha'), 21000000, 0.02, 'Utang Usaha (code 21200)')
  closeTo(val('Utang Daerah'), 19742006, 0.02, 'Utang Daerah')
  closeTo(val('Pendapatan Diterima Dimuka'), 3739575002, 0.02, 'PDD (code 21600)')
  closeTo(val('Biaya yang Masih Harus Dibayar'), 488840600, 0.02, 'Biaya YMHD (code 21500!)')
  closeTo(val('JUMLAH KEWAJIBAN'), 4269157608, 0.05, 'JUMLAH KEWAJIBAN')
  // Equity roll-forward: May's berjalan folds into saldo lalu; berjalan = June only.
  closeTo(val('Saldo Laba (Rugi) Periode Lalu'), -3622203776.916666, 0.05, 'Saldo Laba Periode Lalu (I72)')
  closeTo(val('(Laba) Rugi Periode Berjalan'), -390185301.0605, 0.05, 'Laba Periode Berjalan (I73)')
  closeTo(val('JUMLAH EKUITAS'), 861746710922.0228, 0.05, 'JUMLAH EKUITAS')
  // The balance check the lampiran itself carries (I79 = 0).
  closeTo(val('JUMLAH KEWAJIBAN DAN EKUITAS') - val('JUMLAH ASET'), 0, 0.05, 'Neraca balance')
})

test('a known account absent from the baseline month is EMITTED as a new Neraca row', () => {
  // May's snapshot may omit "Biaya yang Masih Harus Dibayar" entirely (its May
  // balance was 0). The June credit of 488.840.600 must still appear as a
  // visible row — not just inside JUMLAH KEWAJIBAN.
  const baseline = MAY_NERACA.filter(r => r.label !== 'Biaya yang Masih Harus Dibayar')
  const rows = buildNeracaRows(baseline, juneExpanded(), { baseYM: '2026-05', viewYM: '2026-06' })
  const row = rows.find(r => r.label === 'Biaya yang Masih Harus Dibayar')
  assert.ok(row, 'row must be emitted')
  closeTo(row.value, 488840600, 0.02, 'Biaya YMHD emitted leaf')
  const idx = rows.indexOf(row)
  const totalIdx = rows.findIndex(r => String(r.label).toUpperCase() === 'JUMLAH KEWAJIBAN')
  assert.ok(idx < totalIdx, 'emitted before JUMLAH KEWAJIBAN')
  closeTo(rows[totalIdx].value, 4269157608, 0.05, 'JUMLAH KEWAJIBAN still exact')
})

test('ARUS KAS Juni (indirect) matches the lampiran and ties to the Neraca cash (spec §12)', () => {
  const expanded = juneExpanded()
  const A = attributeDelta(expanded)
  const c = composeLabaRugi(A.lrSec)
  const ak = buildArusKasIndirectRows({
    journals: expanded,
    labaSebelumPajak: c.sebelumPajak,
    penyusutan: A.lrSec.penyusutan,
    pajakRow: 0,
    kasAwal: 14553900060.83, // Σ May cash rows (lampiran D37)
  })
  closeTo(ak.operasi, 1935003869.04, 0.05, 'Arus kas operasi (D24)')
  closeTo(ak.investasi, -462107830, 0.05, 'Arus kas investasi (D29)')
  closeTo(ak.pendanaan, 0, 0.02, 'Arus kas pendanaan (D34)')
  closeTo(ak.kenaikan, 1472896039.04, 0.05, 'Kenaikan bersih kas (D36)')
  closeTo(ak.kasAkhir, 16026796099.87, 0.05, 'Kas akhir periode (D39)')
  closeTo(ak.residual, 0, 0.05, 'no uncovered movements (lampiran D44 = 0)')
  const rowVal = (lbl) => ak.rows.find(r => r.label === lbl)?.value
  closeTo(rowVal('Piutang Usaha'), 58351411, 0.02, 'Δ Piutang (D13)')
  closeTo(rowVal('Aset dalam penyelesaian'), -701534000, 0.02, 'Δ ADP (D15 — operasi, not investasi)')
  closeTo(rowVal('Biaya yang Masih Harus Dibayar'), 488840600, 0.02, 'Δ Biaya YMHD (D21)')
  closeTo(rowVal('Pendapatan Diterima Dimuka'), 2191241667, 0.02, 'Δ PDD (D23)')
  closeTo(rowVal('Pembelian Aset Tetap'), -462107830, 0.02, 'Capex = Δ gross Bangunan+Instalasi+Peralatan (D27)')
})

test('LRA Penerimaan bulan-ini per outline matches the lampiran J-column (spec §9)', () => {
  // Revenue is journaled at 41000/42000 with the stream named in Sub Akun —
  // the reroute must land each stream on its official Penerimaan row.
  const byOutline = {}
  for (const j of juneExpanded()) {
    if (!j.kredit) continue
    const code = extractAccountCode(j.akun_kredit)
    if (!code || !/^4/.test(code)) continue
    const o = resolveOutline(code)
    if (o) byOutline[o] = (byOutline[o] || 0) + j.kredit
  }
  const EXPECT = {
    '1.1': 537480892, '1.2': 47840000, '1.3': 98966000, '1.4': 5146853,
    '1.7': 44350000, '1.8': 189833333,
    '2.1': 128360000, '2.2': 15979867, '2.3': 9900000, '2.6': 3436020,
    '2.7': 195911500, '2.8': 4995000, '2.9': 690000, '2.10': 7400000,
  }
  for (const [o, v] of Object.entries(EXPECT)) closeTo(byOutline[o] || 0, v, 0.02, `Penerimaan ${o}`)
  const total = Object.values(byOutline).reduce((s, v) => s + v, 0)
  closeTo(total, 1290289465, 0.02, 'Σ pendapatan usaha across outlines (no stream lost)')
})

test('LRA cash-basis specials: piutang collections, purchases, depreciation excluded (spec §9)', () => {
  const expanded = juneExpanded()
  // Penerimaan 1.6 = credits to 11201 (collections) — lampiran J15 = 58.351.411.
  let piutangCollections = 0
  let purchases = 0
  for (const j of expanded) {
    if (j.kredit && codeOf(j.akun_kredit) === '11201') piutangCollections += j.kredit
    if (j.debit && CASH_BASIS_BEBAN_POKOK[extractAccountCode(j.akun_debit)]) purchases += j.debit
  }
  closeTo(piutangCollections, 58351411, 0.02, 'Penerimaan 1.6 (piutang collections)')
  // Beban Pokok LRA = inventory purchases (K61+K62 = 194.798.200), not accrual COGS.
  closeTo(purchases, 194798200, 0.02, 'Beban Pokok bulan ini (purchases 11401/11402)')
  // Depreciation stays OUT of the cash-basis LRA (Beban Umum 428.698.498 = 743.330.990,10 − 314.632.492,10).
  assert.equal(resolveOutline('61130'), null, '61130 must not resolve to any LRA outline')
  assert.equal(resolveOutline('61130', 'Penyusutan Juni 2026'), null)
})
