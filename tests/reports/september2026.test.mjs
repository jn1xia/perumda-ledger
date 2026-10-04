// Lampiran September 2026 (Bagian Keuangan, 04-10-2026): revised RKAP with new
// lines and a renumbered Penerimaan, the COA sheet as the naming standard, and
// the amortisasi journal 61136 / 13101.2. Periods ending January–August must
// keep their numbering and figures; September onward reads everything in the
// revised numbering.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx/xlsx.mjs'
import {
  rkapVersion, rkapOutlineFor, resolveOutline, resolveWithSubPriority, extractAccountCode,
  getInvestasiOutline, cashBasisPokokOutline, isOutOfScopeRevenue, ledgerGroupPrefixes,
} from '../../src/utils/lraOutline.js'
import { extractJournals } from '../../src/utils/reportSnapshot.js'
import { expandJournals } from '../../src/utils/journalExpand.js'
import { buildLabaRugiRows, buildNeracaRows, buildArusKasIndirectRows } from '../../src/utils/reportDelta.js'

if (typeof XLSX.set_fs === 'function') XLSX.set_fs(fs)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DIVISI_JUNI = path.join(root, 'fixtures', 'JURNAL JUNI 2026 (divisi).xlsx')

const R = (code, acct, ket, rkap) => resolveWithSubPriority(resolveOutline, code, acct, ket, rkap)

test('a period ending in or after September 2026 uses the revised RKAP numbering', () => {
  assert.equal(rkapVersion([8]), 1)
  assert.equal(rkapVersion([1, 2, 3, 4, 5, 6]), 1)
  assert.equal(rkapVersion([9]), 2)
  assert.equal(rkapVersion([7, 8, 9]), 2, 'TW III ends in September')
  assert.equal(rkapVersion(10), 2)
})

test('anggaran rows of earlier months are translated into the revised numbering', () => {
  // Penerimaan: Parkir 2.1 → 1.9, Listrik 1.9 → 1.11, section 2 up one line.
  assert.equal(rkapOutlineFor('penerimaan', '2.1', 8, 2), '1.9')
  assert.equal(rkapOutlineFor('penerimaan', '1.9', 8, 2), '1.11')
  assert.equal(rkapOutlineFor('penerimaan', '2.10', 4, 2), '2.9')
  assert.equal(rkapOutlineFor('penerimaan', '1.1', 4, 2), '1.1')
  // Rows already on the revision, and reports before it, stay as they are.
  assert.equal(rkapOutlineFor('penerimaan', '1.9', 9, 2), '1.9')
  assert.equal(rkapOutlineFor('penerimaan', '2.1', 8, 1), '2.1')
  // Investasi: Modal Kerja moved from 7 to 8; other categories keep numbers.
  assert.equal(rkapOutlineFor('bebanInvestasi', '7.1', 4, 2), '8.1')
  assert.equal(rkapOutlineFor('bebanUmum', '2.1', 4, 2), '2.1')
  assert.equal(rkapOutlineFor('bebanOperasional', '1.2.1', 8, 2), '1.2.1')
})

test('Penerimaan accounts land on the revised lines from September, unchanged before', () => {
  const cases = [
    // code, January–August, September onward
    ['42001', '2.1', '1.9'],   // Parkir
    ['41010', '1.9', '1.11'],  // Listrik
    ['42002', '2.2', '2.1'],   // Event
    ['42007', '2.2', '2.1'],   // Wisata Kuliner Cemara rides the Event line
    ['42008', '2.7', '2.6'],   // Bahan Pokok
    ['42011', '2.10', '2.9'],  // Gas LPG
    ['41001', '1.1', '1.1'],
    ['41009', '1.5', '1.5'],
    ['70001', '3.1', '3.1'],
  ]
  for (const [code, v1, v2] of cases) {
    assert.equal(resolveOutline(code), v1, `${code} before September`)
    assert.equal(resolveOutline(code, '', 2), v2, `${code} from September`)
  }
  // New accounts exist only in the revision.
  assert.equal(resolveOutline('41011', '', 2), '1.10')
  assert.equal(resolveOutline('42012', '', 2), '2.10')
  assert.equal(resolveOutline('42013', '', 2), '2.11')
  assert.equal(resolveOutline('42014', '', 2), '2.12')
  assert.equal(resolveOutline('41011'), null, 'no such line before the revision')
})

test('revenue journaled at 41000/42000/70000 reaches the new accounts through its Sub Akun', () => {
  assert.equal(extractAccountCode('41000 Pendapatan Bisnis Utama > Pendapatan Fasilitas Umum'), '41011')
  assert.equal(extractAccountCode('41000 Pendapatan Bisnis Utama > Pendapatan Fasilitas Umum Pasar Antasari'), '41011')
  assert.equal(extractAccountCode('42000 Pendapatan Bisnis Lainnya > Penyewaan Lahan SPKLU'), '42012')
  assert.equal(extractAccountCode('42000 Pendapatan Bisnis Lainnya > Bioskop'), '42013')
  assert.equal(extractAccountCode('42000 Pendapatan Bisnis Lainnya > Produk Hasil Pengelolaan Sampah'), '42014')
  // Existing streams are untouched.
  assert.equal(extractAccountCode('42000 Pendapatan Bisnis Lainnya > Pendapatan Parkir'), '42001')
  assert.equal(extractAccountCode('42000 Pendapatan Bisnis Lainnya > Pendapatan Pusat Grosir Bahan Pokok'), '42008')
  assert.equal(extractAccountCode('41000 Pendapatan Bisnis Utama > Pendapatan Keamanan Pasar Antasari'), '41007')
  assert.equal(extractAccountCode('41000 Pendapatan Bisnis Utama > Pendapatan Pemeliharaan Kebersihan Pasar (Sampah)'), '41003')
  // JURNAL September: "70000 > Pendapatan Lain lain" (Reward Program Mahar BSI)
  // is 70004, outside the LRA like Selisih Lebih — it used to count as 3.1 Bunga.
  assert.equal(extractAccountCode('70000 Pendapatan di Luar Operasional > Pendapatan Lain lain'), '70004')
  assert.equal(extractAccountCode('70000 Pendapatan di Luar Operasional > Pendapatan Bunga'), '70001')
  assert.ok(isOutOfScopeRevenue('70004') && isOutOfScopeRevenue('70003') && isOutOfScopeRevenue('70002'))
  assert.ok(!isOutOfScopeRevenue('70001'))
})

test('Beban Umum 13.15–13.17 and Beban Operasional 1.2.x / 3.5.x from September', () => {
  const lain = '61140 Beban Umum Lain-lain'
  assert.equal(R('61140', `${lain} > Beban Kompensasi Karyawan`, 'x', 2), '13.15')
  assert.equal(R('61140', `${lain} > Beban Fasilitas Perubahan Perda No 3`, 'Rapat pembahasan', 2), '13.16')
  assert.equal(R('61140', `${lain} > Beban Legalisasi Aset Pasar Kuripan dan Batuah (Jasa Notaris, BPHTB, BPN, dll)`, '', 2), '13.17')
  assert.equal(R('61140', `${lain} > Beban Kompensasi Karyawan`, 'x', 1), null, 'no such line before the revision')
  assert.equal(R('61140', `${lain} > Beban Peringatan Hari Jadi Kota Banjarmasin (Tanglong / Jukung Hias)`, 'Lomba Street Fotografi', 2), '13.13')
  // Renamed COA leaves keep their line: 61032 PSL → PSR Direksi, 61033 PDH →
  // Seragam Karyawan, 61102 Diklat Dewas → "… Dewan Pengawas dan Direksi".
  assert.equal(R('61030', '61030 Beban Kelengkapan Pegawai Kantor > Beban PSR Direksi', '', 2), '3.2')
  assert.equal(R('61030', '61030 Beban Kelengkapan Pegawai Kantor > Beban Seragam Karyawan', '', 2), '3.3')
  assert.equal(R('61100', '61100 Beban Pendidikan > Beban Diklat/Bimtek Dewan Pengawas dan Direksi', '', 2), '10.2')
  assert.equal(R('61100', '61100 Beban Pendidikan > Beban Diklat/Bimtek Karyawan', '', 2), '10.1')
  assert.equal(resolveOutline('61155', '', 2), '13.15')
  assert.equal(resolveOutline('61157', '', 2), '13.17')

  const bangunan = '62020 Beban Pemeliharaan Bangunan Pasar'
  // JURNAL September: 33.864.000 TPAS Banjarbakula, 300.000 Pengelolaan Sampah,
  // everything else on 1.2.1 — the lampiran's 10.960.000 / 33.864.000 / 300.000.
  assert.equal(R('62020', `${bangunan} > Beban Banjarbakula`, 'TPAS Banjarbakula Agustus 2026', 2), '1.2.2')
  assert.equal(R('62020', `${bangunan} > Beban Pengelolaan Sampah`, 'Pengisian BBM Truck', 2), '1.2.3')
  assert.equal(R('62020', bangunan, 'Upah Mengoperasikan Panel Listrik', 2), '1.2.1')
  assert.equal(R('62020', `${bangunan} > Beban Banjarbakula`, 'TPAS', 1), '1.2.1', 'before the revision everything stays on 1.2.1')
  assert.equal(resolveOutline('62022', '', 2), '1.2.2')
  assert.equal(resolveOutline('62023', '', 2), '1.2.3')
  assert.equal(resolveOutline('62121', '', 2), '3.5.1')
  assert.equal(resolveOutline('62122', '', 2), '3.5.2')
  assert.equal(R('62120', '62120 Beban Marketing dan Komunikasi > Beban Retensi Pedagang', '', 2), '3.5.2')
  assert.equal(resolveOutline('62101'), '1.4.1', 'leaf of 62100 Keamanan, same line in both')
  assert.equal(resolveOutline('62101', '', 2), '1.4.1')
  // COA leaf 62042 "Beban Cetak Segel dan Sewa Toko": 'segel' wins over 'sewa'.
  assert.equal(R('62040', '62040 Beban Pelayanan dan Pemasaran > Beban Cetak Segel dan Sewa Toko', 'Pembelian Stiker "Penyegelan Toko/Kios"', 2), '2.1.2')
  assert.equal(R('62040', '62040 Beban Pelayanan dan Pemasaran', 'Cetak dokumen perjanjian sewa', 1), '2.1.1')
  assert.deepEqual(ledgerGroupPrefixes('62100'), ['6210'])
  assert.deepEqual(ledgerGroupPrefixes('62120'), ['6212'])
})

test('Beban Pokok Listrik and Mesin Galon are their own cash-basis lines 4.3 / 4.4', () => {
  // "Pembayaran Listrik Antasari" 165.453.636 = LRA September 4.3 bulan ini.
  assert.equal(cashBasisPokokOutline('51002', { _counterCodes: ['11103'] }), '4.3')
  assert.equal(cashBasisPokokOutline('51003', { _counterCodes: ['11101'] }), '4.4')
  assert.equal(cashBasisPokokOutline('51000', { _counterCodes: ['11401'] }), null, 'accrual COGS stays out')
})

test('Investasi rincian of the revision (Harum Manis, Pandu, Kupu-Kupu, Pasar Lima, Bioskop, mesin sampah)', () => {
  const g = (code, ket) => [getInvestasiOutline(code, ket), getInvestasiOutline(code, ket, 2)]
  assert.deepEqual(g('12102.1', 'Addedum Pekerjaan Pasar Harum Manis'), ['1.5', '1.5.6'])
  assert.deepEqual(g('12102.1', 'Revitalisasi Pasar Pandu sebagai pusat kuliner'), ['1.5', '1.5.7'])
  assert.deepEqual(g('12102.1', 'Pembangunan Pasar Kupu-Kupu'), ['1.5', '1.5.8'])
  assert.deepEqual(g('12102.1', 'Pembangunan Pasar Lima'), ['1.5', '1.5.9'])
  assert.deepEqual(g('12102.1', 'Relokasi pedagang kawasan Pasar Sudimampir'), ['1.5', '1.5.5'])
  // The 1.6 works still win over market names.
  assert.deepEqual(g('12102.1', 'Penambahan penerangan Pasar Pandu'), ['1.6.2', '1.6.2'])
  assert.deepEqual(g('12102.1', 'Perbaikan akses jalan Pasar Lima'), ['1.6.1', '1.6.1'])
  assert.deepEqual(g('12102.1', 'Perbaikan Atap Pasar Baru'), ['1.5.1', '1.5.1'])
  assert.deepEqual(g('12202.1', 'Pembelian Mesin Pencacah Sampah'), ['1.3', '7.1'])
  assert.deepEqual(g('12204.1', 'Proyektor Bioskop Mini'), ['6.2', '4.7'])
  assert.deepEqual(g('12204.1', 'Pembelian Layar Tripod Projector'), ['6.2', '6.2'])
  assert.deepEqual(g('12203.1', 'Pasang Baru Daya 33000 VA di Pasar Harum Manis'), ['1.3.6', '1.3.6'])
  assert.equal(getInvestasiOutline('13101.2', 'Akumulasi Amortisasi', 2), null)
  assert.equal(getInvestasiOutline('12300', 'DP 50% Pembelian Logo Pasar Malabar', 2), null, 'ADP stays out (July convention)')
})

test('a September report reads earlier months in the revised numbering, same amounts', () => {
  // The division renumbered the whole year: September's "Sd bln lalu" for 1.9
  // Parkir is the Jan–Aug Parkir figure. Routing June's real book with the
  // revised numbering must move every stream line-for-line, losing nothing.
  const wb = XLSX.readFile(DIVISI_JUNI)
  const exp = expandJournals(extractJournals(wb, '2026-06').map(j => ({ ...j, status: 'posted' })))
  const by = { 1: {}, 2: {} }
  for (const j of exp) {
    if (!j.kredit) continue
    const code = extractAccountCode(j.akun_kredit)
    if (!code || !/^4/.test(code)) continue
    for (const v of [1, 2]) {
      const o = R(code, j.akun_kredit, j.keterangan, v)
      if (o) by[v][o] = (by[v][o] || 0) + j.kredit
    }
  }
  const translated = {}
  for (const [o, amt] of Object.entries(by[1])) {
    const o2 = rkapOutlineFor('penerimaan', o, 6, 2)
    translated[o2] = (translated[o2] || 0) + amt
  }
  assert.deepEqual(by[2], translated)
  assert.equal(by[1]['2.1'], 128360000, 'June Parkir on 2.1 (lampiran Juni)')
  assert.equal(by[2]['1.9'], 128360000, '…is 1.9 Parkir in a September report')
})

test('Laba Rugi: new September lines keep their own row, also on an older skeleton', () => {
  const j = (dCode, dName, kCode, kName, amt, tanggal = '2026-09-30') =>
    ({ id: `JV-x-${dCode}`, tanggal, status: 'posted', akun_debit: `${dCode} ${dName}`, akun_kredit: `${kCode} ${kName}`, debit: amt, kredit: amt })
  const journals = [
    j('51002', 'Beban Pokok Listrik', '11103', 'Bank Kalsel', 165453636),
    j('61136', 'Beban Amortisasi Aset Tidak Berwujud', '13101.2', 'Akumulasi Amortisasi Aset Tidak Berwujud', 1458333.33),
    j('62110', 'Beban PPN dan PPH', '11103', 'Bank Kalsel', 65640097),
  ]
  // An August-style skeleton: no Beban Pokok Listrik / Amortisasi rows, and the
  // PPN row under its September name "Beban PPN".
  const base = [
    { label: 'BEBAN POKOK PENJUALAN', value: null },
    { label: 'Beban Pokok Penjualan (Bapok & Gerai Inflasi)', value: 0 },
    { label: 'Beban Pokok Penjualan (Gas LPG)', value: 0 },
    { label: 'JUMLAH BEBAN POKOK PENJUALAN', value: 0 },
    { label: 'Beban Penyusutan Aktiva Tetap', value: 0 },
    { label: 'Beban Umum Lainnya', value: 0 },
    { label: 'JUMLAH BEBAN UMUM DAN ADMINISTRASI', value: 0 },
    { label: 'Beban Pemeliharaan Keamanan dan Ketertiban Pasar', value: 0 },
    { label: 'Beban PPN', value: 0 },
    { label: 'JUMAH BEBAN OPERASIONAL DAN BISNIS', value: 0 },
  ]
  const rows = buildLabaRugiRows(base, journals)
  const at = (label) => rows.findIndex(r => r.label === label)
  const val = (label) => rows[at(label)].value
  assert.equal(val('Beban Pokok Listrik'), 165453636)
  assert.ok(at('Beban Pokok Listrik') < at('JUMLAH BEBAN POKOK PENJUALAN'), 'inside Beban Pokok Penjualan')
  assert.equal(val('Beban Pokok Penjualan (Bapok & Gerai Inflasi)'), 0, 'not on the Bapok line any more')
  assert.equal(val('Beban Amortisasi Aset Tidak Berwujud'), 1458333.33)
  assert.equal(val('Beban Penyusutan Aktiva Tetap'), 0, 'not on Penyusutan any more')
  assert.ok(at('Beban Amortisasi Aset Tidak Berwujud') < at('JUMLAH BEBAN UMUM DAN ADMINISTRASI'))
  assert.equal(val('Beban PPN'), 65640097, '"Beban PPN dan PPH" is the same row as "Beban PPN"')
  assert.equal(at('Beban PPN dan PPH'), -1, 'no duplicate PPN row')
  assert.ok(rows.every(r => !r._unmapped), 'nothing parked as Belum Terpetakan')
  assert.equal(val('JUMLAH BEBAN POKOK PENJUALAN'), 165453636)
})

test('Neraca: Bank Mandiri Taspen and the new liabilities get named rows', () => {
  const base = [
    { label: 'Bank BSI', value: 70376200 },
    { label: 'Jumlah Aset Lancar', value: 70376200 },
    { label: 'Jumlah Aset Tidak Lancar', value: 0 },
    { label: 'JUMLAH ASET', value: 70376200 },
    { label: 'Kewajiban  Jangka Pendek', value: null },
    { label: 'Utang Usaha', value: 0 },
    { label: 'Kewajiban Jangka Panjang', value: null },
    { label: 'Utang Bank', value: 0 },
    { label: 'JUMLAH KEWAJIBAN', value: 0 },
    { label: 'Modal Disetor', value: 70376200 },
    { label: 'JUMLAH EKUITAS', value: 70376200 },
    { label: 'JUMLAH KEWAJIBAN DAN EKUITAS', value: 70376200 },
  ]
  const journals = [
    // JURNAL September: "Setoran Awal Pembukaan Rekening Giro Mandiri Taspen".
    { id: 'JV-1', tanggal: '2026-09-17', status: 'posted', akun_debit: '11109 Bank Mandiri Taspen', akun_kredit: '21300 Utang Pegawai', debit: 1000000, kredit: 1000000 },
  ]
  const rows = buildNeracaRows(base, journals)
  const row = (l) => rows.find(r => r.label === l)
  assert.equal(row('Bank Mandiri Taspen').value, 1000000)
  assert.ok(!row('Bank Mandiri Taspen')._unmapped)
  assert.equal(row('Utang Pegawai').value, 1000000)
  assert.ok(rows.indexOf(row('Utang Pegawai')) < rows.findIndex(r => r.label === 'Kewajiban Jangka Panjang'), 'a current liability')
  assert.ok(!rows.some(r => /Belum Terpetakan/.test(r.label)))
})

test('Arus Kas: amortisasi is its own add-back row, as in the lampiran since August', () => {
  const journals = [
    { tanggal: '2026-09-30', akun_debit: '61136 Beban Amortisasi Aset Tidak Berwujud', akun_kredit: '', debit: 1458333.33, kredit: 0 },
    { tanggal: '2026-09-30', akun_debit: '', akun_kredit: '13101.2 Akumulasi Amortisasi Aset Tidak Berwujud', debit: 0, kredit: 1458333.33 },
  ]
  const ak = buildArusKasIndirectRows({ journals, labaSebelumPajak: -1458333.33, penyusutan: 0, amortisasi: 1458333.33, kasAwal: 0 })
  const row = ak.rows.find(r => r.label === 'Amortisasi Aset Tidak Berwujud')
  assert.equal(row.value, 1458333.33)
  assert.ok(!ak.rows.some(r => r.label === 'Penyesuaian Lainnya'), 'the statement ties without an adjustment row')
  assert.equal(ak.kasAkhir, 0)
  // Without amortisasi the layout is unchanged.
  const none = buildArusKasIndirectRows({ journals: [], kasAwal: 0 })
  assert.ok(!none.rows.some(r => r.label === 'Amortisasi Aset Tidak Berwujud'))
})
