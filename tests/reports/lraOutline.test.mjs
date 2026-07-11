// Pin the shared account → outline mapping (single source of truth after the
// LRA.jsx/NPDReport.jsx local copies were removed) and exercise it against the
// division's real June journal book.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx/xlsx.mjs'
import {
  resolveOutline, categoryKeyForCode, extractAccountCode, getInvestasiOutline,
  subAkunDesc, ledgerGroupPrefixes,
} from '../../src/utils/lraOutline.js'
import { extractJournals } from '../../src/utils/reportSnapshot.js'

if (typeof XLSX.set_fs === 'function') XLSX.set_fs(fs)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DIVISI_JUNI = path.join(root, 'fixtures', 'JURNAL JUNI 2026 (divisi).xlsx')

test('key outline resolutions stay stable', () => {
  assert.equal(resolveOutline('41001'), '1.1')
  assert.equal(resolveOutline('41009'), '1.5')
  assert.equal(resolveOutline('41000'), '1.1')
  assert.equal(resolveOutline('61011'), '1.1')
  assert.equal(resolveOutline('61010', 'Gaji Direksi'), '1.1')
  assert.equal(resolveOutline('61010', 'Gaji Pokok Karyawan'), '1.2')
  assert.equal(resolveOutline('61010'), null, 'ambiguous descriptive parent without keywords stays unmapped')
  assert.equal(resolveOutline('61150'), '13.10')
  assert.equal(resolveOutline('61140', 'Souvenir plakat'), '13.10')
  assert.equal(resolveOutline('62100'), '4.1.1')
})

test('category separation (outline numbers are reused across categories)', () => {
  assert.equal(categoryKeyForCode('61011'), 'bebanUmum')
  assert.equal(categoryKeyForCode('62011'), 'bebanOperasional')
  assert.equal(categoryKeyForCode('12204.1'), 'bebanInvestasi')
  assert.equal(categoryKeyForCode('80002'), 'bebanLainnya')
  assert.equal(categoryKeyForCode('41001'), null, 'revenue has no expense category')
})

test('extractAccountCode keeps dotted asset codes intact (division June file uses them)', () => {
  assert.equal(extractAccountCode('12203.1 Instalasi Listrik'), '12203.1')
  assert.equal(extractAccountCode('61011 Beban Gaji > Gaji Direksi'), '61011')
  assert.equal(extractAccountCode('41000 Pendapatan > 41008 - Ramayana'), '41008')
})

test('ledger group parents aggregate their decade of leaves', () => {
  assert.deepEqual(ledgerGroupPrefixes('61060'), ['6106'])
  assert.deepEqual(ledgerGroupPrefixes('61140'), ['6114', '6115'])
  assert.deepEqual(ledgerGroupPrefixes('41000'), ['410'])
  assert.equal(ledgerGroupPrefixes('61061'), null)
})

test('every revenue line of the division June book resolves to a penerimaan outline', () => {
  const wb = XLSX.readFile(DIVISI_JUNI)
  const journals = extractJournals(wb, '2026-06')
  let revenue = 0, resolved = 0
  for (const j of journals) {
    for (const l of j.lines || []) {
      if (!/^4/.test(String(l.akun_code))) continue
      revenue += l.kredit
      const outline = resolveOutline(l.akun_code, subAkunDesc(`${l.akun_code} ${l.akun_name}${l.sub_akun ? ' > ' + l.sub_akun : ''}`, l.keterangan))
      if (outline) resolved += l.kredit
    }
  }
  assert.equal(revenue, 923617078 + 366672387)
  assert.equal(resolved, revenue, 'no revenue may drop out of the LRA (kendala 07-07-2026: 380jt vs 923jt)')
})

test('investasi keyword routing', () => {
  assert.equal(getInvestasiOutline('12204.1', 'pengadaan cctv pasar'), '1.3')
  assert.equal(getInvestasiOutline('12300', 'pengembangan sistem informasi akuntansi'), '5.1')
})
