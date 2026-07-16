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
  // Lampiran 2026: keamanan APH = 1.4.1 (grup 1.4 Pemeliharaan Keamanan dan
  // Ketertiban) — the legacy 4.1.1 slot now belongs to Beban Pokok, and the old
  // mapping silently dropped every 62100 journal from the LRA (Juni: 40,3 jt).
  assert.equal(resolveOutline('62100'), '1.4.1')
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

test('investasi keyword routing (leaf-level, per lampiran " Investasi")', () => {
  // Rincian leaves — the lampiran carries realization on the lettered rows.
  assert.equal(getInvestasiOutline('12204.1', 'pengadaan cctv pasar'), '1.3.4')
  assert.equal(getInvestasiOutline('12203.1', 'Pemasangan Panel MCB 3 Phase Videotron Pasar Antasari'), '1.3.6')
  assert.equal(getInvestasiOutline('12102.1', 'Pekerjaan Revitalisasi Gedung di Pasar Antasari'), '1.5.2')
  assert.equal(getInvestasiOutline('12102.1', 'Perbaikan Gudang Gas Elpiji'), '2.1')
  assert.equal(getInvestasiOutline('12204.1', 'Pembelian Kulkas 1 Pintu Merk Sharp'), '6.2')
  // 12300 ADP: progress payments are NOT belanja modal realisasi (division
  // convention — Juni's 701,5 jt ADP appears in no Investasi line).
  assert.equal(getInvestasiOutline('12300', 'pengembangan sistem informasi akuntansi'), null)
  // Akumulasi penyusutan contra accounts never route to investasi.
  assert.equal(getInvestasiOutline('12204.2', 'Akumulasi Penyusutan Peralatan'), null)

  // Mapping rapat 16-07-2026 — keywords proven by the June register's
  // "Penambahan Bangunan 2026" table (keterangan → lampiran " Investasi" row):
  assert.equal(getInvestasiOutline('12102.1', 'Perbaikan Atap Pasar Baru'), '1.5.1')
  assert.equal(getInvestasiOutline('12102.1', 'Perbaikan Fasilitas Kantor,Dapur,dll (Kantor letak di Pasar Baru)'), '6.1')
  assert.equal(getInvestasiOutline('12102.1', 'Pengadaan Taman Antasari'), '1.5.2')
  assert.equal(getInvestasiOutline('12203.1', 'Pemasangan Listrik Baru di Pasar Antasari 23.000 VA'), '1.3.6')
  assert.equal(getInvestasiOutline('12203.1', 'Penambahan Penerangan Pasar Pandu'), '1.6.2')
  assert.equal(getInvestasiOutline('12202.1', 'Pengadaan Mesin Isi Ulang Air Galon'), '4.5')
  assert.equal(getInvestasiOutline('13101.1', 'Pengembangan Sistem Informasi Akuntansi'), '5.1')
  assert.equal(getInvestasiOutline('13101.2', 'Amortisasi Aset Tidak Berwujud'), null)
})
