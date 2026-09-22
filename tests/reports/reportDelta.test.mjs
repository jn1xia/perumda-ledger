// Regression tests for the report overlay math (reportDelta.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDeltaJournal, deltaJournals, buildLabaRugiRows, codeOf, isDebitNormal } from '../../src/utils/reportDelta.js'

test('isDeltaJournal prefers the explicit baseline column over the id prefix', () => {
  // Column present → it decides, whatever the prefix says.
  assert.equal(isDeltaJournal({ id: 'XL-2026-06-U0001', baseline: 0 }), true,
    'a live journal stays a delta even with an XL- id')
  assert.equal(isDeltaJournal({ id: 'JV-2026-001', baseline: 1 }), false,
    'a demoted journal stops overlaying even with a JV- id')
  // Column absent/NULL → prefix fallback (rows predating the migration).
  assert.equal(isDeltaJournal({ id: 'JV-2026-001' }), true)
  assert.equal(isDeltaJournal({ id: 'JRN-2026-002', baseline: null }), true)
  assert.equal(isDeltaJournal({ id: 'XL-2026-06-U0001' }), false)
  assert.equal(isDeltaJournal({ id: 'ADJ-NRC-ALL-2026-06' }), false)
})

test('deltaJournals keeps only posted user journals', () => {
  const out = deltaJournals([
    { id: 'JV-2026-001', status: 'posted', debit: 10, kredit: 10, akun_debit: '61011 Beban Gaji', akun_kredit: '11103 Bank' },
    { id: 'JV-2026-002', status: 'pending', debit: 5, kredit: 5, akun_debit: '61011 Beban Gaji', akun_kredit: '11103 Bank' },
    { id: 'XL-2026-06-U0001', status: 'posted', baseline: 1, debit: 7, kredit: 7, akun_debit: '61011 Beban Gaji', akun_kredit: '11103 Bank' },
  ])
  assert.deepEqual(out.map(j => j.id), ['JV-2026-001'])
})

test('buildLabaRugiRows moves the leaf line and every affected total exactly once', () => {
  const base = [
    { label: 'Pendapatan Bisnis Utama', value: 100 },
    { label: 'JUMLAH PENDAPATAN USAHA', value: 100 },
    { label: 'Beban Gaji', value: 40 },
    { label: 'JUMLAH BEBAN UMUM DAN ADMINISTRASI', value: 40 },
    { label: 'LABA (RUGI) USAHA', value: 60 },
  ]
  const journals = [
    { id: 'JV-2026-101', status: 'posted', debit: 25, kredit: 0, akun_debit: '61011 Beban Gaji', akun_kredit: '' },
    { id: 'JV-2026-101b', status: 'posted', debit: 0, kredit: 25, akun_debit: '', akun_kredit: '41001 Pendapatan Sewa Kios' },
  ]
  const rows = buildLabaRugiRows(base, journals)
  const val = (lbl) => rows.find(r => r.label === lbl).value
  assert.equal(val('JUMLAH PENDAPATAN USAHA'), 125)
  assert.equal(val('JUMLAH BEBAN UMUM DAN ADMINISTRASI'), 65)
  assert.equal(val('LABA (RUGI) USAHA'), 60, 'delta nets to zero on laba usaha (25 revenue − 25 expense)')
})

test('codeOf prefers a coded sub-akun and keeps plain codes', () => {
  assert.equal(codeOf('41000 Pendapatan Pengelolaan > 41008 - Pendapatan Ramayana'), '41008')
  assert.equal(codeOf('61011 Beban Gaji > Gaji Direksi'), '61011')
  assert.equal(codeOf('11103 Bank Kalsel'), '11103')
})

test('normal balance classes', () => {
  assert.equal(isDebitNormal('11103'), true)
  assert.equal(isDebitNormal('41000'), false)
  assert.equal(isDebitNormal('61011'), true)
  assert.equal(isDebitNormal('99999'), true)
})

test('62110 Beban PPN dan PPH: same bucket as 99999 — row inside ops AND added back in EBITDA', async () => {
  // Konvensi divisi (konfirmasi Bu Nisha 21-07, laporan cetak resmi): EBITDA
  // menambahkan balik baris "Beban PPN dan PPH" apa pun akunnya (Excel J81 =
  // …+J53). Reklas ke 62110 memindahkan LETAK AKUN, bukan rumus EBITDA —
  // EBITDA Juni tetap 333.012.664, bukan −90.355.135.
  const { attributeDelta, composeLabaRugi } = await import('../../src/utils/reportDelta.js')
  const direct = attributeDelta([{ id: 'A', tanggal: '2026-07-31', debit: 1000000, kredit: 1000000,
    akun_debit: '62110 - Beban PPN dan PPH', akun_kredit: '11103 - Bank Kalsel' }])
  assert.equal(direct.lrSec.pajak, 1000000, '62110 goes to the pajak bucket')
  assert.equal(direct.lrSec.ops, 0)
  assert.equal(direct.lrLeaf['beban ppn dan pph'], 1000000, 'leaf lands on the Beban PPN dan PPH row')
  const cd = composeLabaRugi(direct.lrSec)
  assert.equal(cd.ops, 1000000, 'row sits inside Jumlah Beban Operasional')
  assert.equal(cd.ebitda, cd.setelahPajak + 1000000, '62110 IS added back in EBITDA')
  // Legacy style: 80000 > Pajak Penghasilan (99999 reroute) — identical everywhere.
  const legacy = attributeDelta([{ id: 'B', tanggal: '2026-06-30', debit: 1000000, kredit: 1000000,
    akun_debit: '80000 Beban di Luar Operasional > Pajak Penghasilan', akun_kredit: '11103 - Bank Kalsel' }])
  assert.equal(legacy.lrSec.pajak, 1000000)
  assert.equal(legacy.lrLeaf['beban ppn dan pph'], 1000000)
  const cl = composeLabaRugi(legacy.lrSec)
  assert.equal(cl.ops, cd.ops)
  assert.equal(cl.ebitda, cd.ebitda, 'both booking styles compose identically')
  // The v2 reclass trio (buku Juni v2): 62110 D + 99999 D + 99999 K — the row
  // nets to the reclassed amount and stays added back in EBITDA.
  const { expandJournals } = await import('../../src/utils/journalExpand.js')
  const reklas = attributeDelta(expandJournals([{
    id: 'C', tanggal: '2026-06-30', baseline: 0, status: 'posted',
    lines: [
      { akun_code: '80000', akun_name: 'Beban di Luar Operasional', sub_akun: 'Pajak Penghasilan', debit: 423367799, kredit: 0 },
      { akun_code: '11103', akun_name: 'Bank Kalsel', debit: 0, kredit: 423367799 },
      { akun_code: '62110', akun_name: 'Beban PPN dan PPH', debit: 423367799, kredit: 0 },
      { akun_code: '80000', akun_name: 'Beban di Luar Operasional', sub_akun: 'Pajak Penghasilan', debit: 0, kredit: 423367799 },
    ],
  }]))
  assert.equal(reklas.lrSec.pajak, 423367799, '62110 D + (99999 D − 99999 K) = the reclassed amount')
  assert.equal(reklas.lrLeaf['beban ppn dan pph'], 423367799, 'single row amount (no double count)')
  const cr = composeLabaRugi(reklas.lrSec)
  assert.equal(cr.ops, 423367799)
  assert.equal(cr.ebitda, cr.setelahPajak + 423367799, 'EBITDA adds the row back — the 333.012.664 convention')
})

test('a bank ACCOUNT NUMBER in No. Akun never lands in a report bucket (511473 → Beban Pokok)', async () => {
  // Kendala 24-07-2026: the division's July book carried an inter-bank transfer
  // whose No. Akun held the bank ACCOUNT NUMBERS (461436 / 511473) instead of
  // COA codes. "511473".startsWith('51') filed the credit under Beban Pokok
  // while "461436" matched no revenue prefix, so the transfer's two legs no
  // longer cancelled and Laba Rugi was overstated by Rp 206.989.852.
  const { attributeDelta, composeLabaRugi } = await import('../../src/utils/reportDelta.js')
  const { expandJournals } = await import('../../src/utils/journalExpand.js')
  const { isValidAccountCode } = await import('../../src/utils/lraOutline.js')

  assert.equal(isValidAccountCode('51000'), true)
  assert.equal(isValidAccountCode('12102.1'), true)
  assert.equal(isValidAccountCode('99999'), true, 'the Sub-Akun reroute code stays valid')
  assert.equal(isValidAccountCode('511473'), false, 'a 6-digit bank account number is not a COA code')
  assert.equal(isValidAccountCode('461436'), false)

  const journals = expandJournals([{
    id: 'JV-TRANSFER', tanggal: '2026-07-02', status: 'posted', baseline: 0,
    lines: [
      // real revenue + real BPP, so the buckets have known good values
      { akun_code: '11104', akun_name: 'Bank BNI', debit: 10000000, kredit: 0 },
      { akun_code: '41000', akun_name: 'Pendapatan Bisnis Utama', debit: 0, kredit: 10000000 },
      { akun_code: '51000', akun_name: 'Beban Pokok Penjualan', debit: 1230000, kredit: 0 },
      { akun_code: '11401', akun_name: 'Persediaan', debit: 0, kredit: 1230000 },
      // the mistyped inter-bank transfer (bank account numbers, not COA codes)
      { akun_code: '461436', akun_name: 'Bank BNI', debit: 206989852, kredit: 0 },
      { akun_code: '511473', akun_name: 'Bank BNI Bisnis', debit: 0, kredit: 206989852 },
    ],
  }])

  const A = attributeDelta(journals)
  const c = composeLabaRugi(A.lrSec)
  assert.equal(c.bpp, 1230000, 'the 511473 credit must NOT reduce Beban Pokok')
  assert.equal(c.pendUsaha, 10000000, 'the 461436 debit must NOT touch revenue')
  assert.equal(c.bruto, 10000000 - 1230000)

  // The amounts are not silently dropped — they are reported for correction.
  const flagged = (A.unmapped || []).filter(u => u.section === 'KodeTidakValid').map(u => u.code).sort()
  assert.deepEqual(flagged, ['461436', '511473'])
})

test('13101.2 amortisasi reaches its own Neraca row, not "(Belum Terpetakan)"', async () => {
  // Rekap 22-09-2026 butir 3.3: the August Neraca showed "Aset Tidak Lancar
  // Lainnya (Belum Terpetakan) −Rp 1.458.333,33". The cause was not the account
  // NAME — attribution is by CODE, and reconcileAlias.json had no entry for
  // 13101.2, so every amortisation credit (pair of 61136 since 9 Sep) fell into
  // the unmapped bucket.
  const { buildNeracaRows, neracaLineForCode } = await import('../../src/utils/reportDelta.js')
  const { expandJournals } = await import('../../src/utils/journalExpand.js')
  assert.equal(neracaLineForCode('13101.2'), 'Akumulasi Amortisasi Aset Tidak Berwujud')

  // May lampiran layout: an intangible row but no amortisation row yet.
  const MAY = [
    { label: 'Aset Dalam Penyelesaian', value: 99280000 },
    { label: 'Aset Tidak Berwujud', value: 0 },
    { label: 'Jumlah Aset Tidak Lancar', value: 1000000000 },
    { label: 'JUMLAH ASET', value: 1000000000 },
    { label: 'Utang Usaha', value: 0 },
    { label: 'JUMLAH KEWAJIBAN', value: 0 },
    { label: 'Modal Disetor', value: 1000000000 },
    { label: 'Saldo Laba (Rugi) Periode Lalu', value: 0 },
    { label: '(Laba) Rugi Periode Berjalan', value: 0 },
    { label: 'JUMLAH EKUITAS', value: 1000000000 },
    { label: 'JUMLAH KEWAJIBAN DAN EKUITAS', value: 1000000000 },
  ]
  const AMORT = 1458333.33
  const amortAgustus = expandJournals([{
    id: 'JV-2026-08-AMORT', tanggal: '2026-08-31', status: 'posted', baseline: 0,
    debit: AMORT, kredit: AMORT,
    akun_debit: '61136 Beban Amortisasi Aset Tidak Berwujud',
    akun_kredit: '13101.2 Amortisasi Aset Tidak Berwujud',
  }])

  const rows = buildNeracaRows(MAY, amortAgustus, { baseYM: '2026-05', viewYM: '2026-08' })
  const labels = rows.map(r => r.label)
  assert.ok(!labels.some(l => /Belum Terpetakan/i.test(l)), `no unmapped leaf expected, got ${labels.join(' | ')}`)
  const i = labels.indexOf('Akumulasi Amortisasi Aset Tidak Berwujud')
  assert.ok(i > labels.indexOf('Aset Tidak Berwujud') && i < labels.indexOf('Jumlah Aset Tidak Lancar'),
    'the new row sits inside Aset Tidak Lancar, before its total')
  const val = (lbl) => rows.find(r => r.label === lbl).value
  assert.ok(Math.abs(val('Akumulasi Amortisasi Aset Tidak Berwujud') + AMORT) < 0.005)
  assert.ok(Math.abs(val('Jumlah Aset Tidak Lancar') - (1000000000 - AMORT)) < 0.005)
  assert.ok(Math.abs(val('JUMLAH ASET') - val('JUMLAH KEWAJIBAN DAN EKUITAS')) < 0.005, 'still balanced')

  // A later baseline that already carries the row: the delta moves that row, no duplicate.
  const withRow = [
    ...MAY.slice(0, 2),
    { label: 'Akumulasi Amortisasi Aset Tidak Berwujud', value: -AMORT },
    ...MAY.slice(2),
  ]
  const rows2 = buildNeracaRows(withRow, amortAgustus, { baseYM: '2026-07', viewYM: '2026-08' })
  const amortRows = rows2.filter(r => r.label === 'Akumulasi Amortisasi Aset Tidak Berwujud')
  assert.equal(amortRows.length, 1)
  assert.ok(Math.abs(amortRows[0].value + 2 * AMORT) < 0.005)
})

test('a liability code with no Neraca line shows as its own row instead of hiding in the total', async () => {
  // Before: add(nLeaf, null, …) dropped the leaf, so JUMLAH KEWAJIBAN moved with
  // no row explaining it (visible rows no longer summed to the total). Relevant
  // as soon as the division creates "Giro Keluar Belum Jatuh Tempo", whose code
  // is not decided yet and so cannot be in reconcileAlias.json.
  const { buildNeracaRows } = await import('../../src/utils/reportDelta.js')
  const { expandJournals } = await import('../../src/utils/journalExpand.js')
  const BASE = [
    { label: 'Kas Bank Kalsel', value: 1000 },
    { label: 'Jumlah Aset Lancar', value: 1000 },
    { label: 'JUMLAH ASET', value: 1000 },
    { label: 'Utang Usaha', value: 100 },
    { label: 'Utang Daerah', value: 0 },
    { label: 'JUMLAH KEWAJIBAN', value: 100 },
    { label: 'Modal Disetor', value: 900 },
    { label: 'JUMLAH EKUITAS', value: 900 },
    { label: 'JUMLAH KEWAJIBAN DAN EKUITAS', value: 1000 },
  ]
  // Giro keluar diterbitkan untuk melunasi utang usaha.
  const j = expandJournals([{ id: 'JV-GIRO-1', tanggal: '2026-09-10', status: 'posted', debit: 40, kredit: 40,
    akun_debit: '21200 Utang Usaha', akun_kredit: '21800 Giro Keluar Belum Jatuh Tempo' }])
  const rows = buildNeracaRows(BASE, j, { baseYM: '2026-05', viewYM: '2026-09' })
  const labels = rows.map(r => r.label)
  const iRow = labels.indexOf('Kewajiban Lainnya (Belum Terpetakan)')
  assert.ok(iRow > 0 && iRow < labels.indexOf('JUMLAH KEWAJIBAN'), labels.join(' | '))
  const row = rows[iRow]
  assert.equal(row.value, 40)
  assert.equal(row._unmapped, true, 'rendered like the asset-side unmapped leaf')
  const val = (lbl) => rows.find(r => r.label === lbl).value
  assert.equal(val('Utang Usaha') + val('Utang Daerah') + row.value, val('JUMLAH KEWAJIBAN'))
})
