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

test('62110 Beban PPN dan PPH lands on the same L/R row as the 80000>Pajak reroute', async () => {
  const { attributeDelta, composeLabaRugi } = await import('../../src/utils/reportDelta.js')
  // New style: direct 62110 journal (reklasifikasi PPN/PPh, fix WA 20-07-2026).
  const direct = attributeDelta([{ id: 'A', tanggal: '2026-07-31', debit: 1000000, kredit: 1000000,
    akun_debit: '62110 - Beban PPN dan PPH', akun_kredit: '11103 - Bank Kalsel' }])
  assert.equal(direct.lrSec.pajak, 1000000, '62110 goes to the pajak bucket, not generic ops')
  assert.equal(direct.lrSec.ops, 0)
  assert.equal(direct.lrLeaf['beban ppn dan pph'], 1000000, 'leaf lands on the Beban PPN dan PPH row')
  // Legacy style: 80000 > Pajak Penghasilan (June convention) — same destination.
  const legacy = attributeDelta([{ id: 'B', tanggal: '2026-06-30', debit: 1000000, kredit: 1000000,
    akun_debit: '80000 Beban di Luar Operasional > Pajak Penghasilan', akun_kredit: '11103 - Bank Kalsel' }])
  assert.equal(legacy.lrSec.pajak, 1000000)
  assert.equal(legacy.lrLeaf['beban ppn dan pph'], 1000000)
  // Both compose identically: the row sits INSIDE Jumlah Beban Operasional (June layout).
  const cd = composeLabaRugi(direct.lrSec), cl = composeLabaRugi(legacy.lrSec)
  assert.equal(cd.ops, 1000000)
  assert.equal(cd.pajak, cl.pajak)
  assert.equal(cd.setelahPajak, cl.setelahPajak)
})
