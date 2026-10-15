// Official period reports (laporan Triwulan / Semester / Tahunan): sheet-name
// detection, the hidden-monthly-sheet rule that keeps these workbooks from
// overwriting months, and the parsers for the statements and the LRA tables in
// the quarterly and semester layouts. Run: npm run test:reports
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as XLSX from 'xlsx/xlsx.mjs'
import {
  parsePeriodSheetName, periodReportKey, parsePeriodKey, periodReportLabel,
  detectPeriodPacks, parseStatementSheet, parseLraTable, extractPeriodPack, lraRekapRows, isUsablePeriodPack,
} from '../../src/utils/periodReport.js'
import { detectLampiranPeriods } from '../../src/utils/reportSnapshot.js'

if (typeof XLSX.set_fs === 'function') XLSX.set_fs(fs)

// A row with values at the given (0-based) columns.
const R = (cells) => { const a = []; for (const [c, v] of Object.entries(cells)) a[Number(c)] = v; return a }
const serial = (iso) => Date.UTC(...iso.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0))) / 86400000 + 25569

// "NERACA TW I 2026" as the division lays it out: labels in B–E, the period in
// I, the comparison in K with "(Audited)" below, a helper column in L.
function neracaSheet(cur = 'Triwulan I', cmp = 'Desember 2025', audited = true) {
  return XLSX.utils.aoa_to_sheet([
    R({ 0: '2.2', 1: 'LAPORAN NERACA' }),
    [],
    R({ 1: 'PERUSAHAAN UMUM DAERAH PASAR BAIMAN (PERUMDA)' }),
    R({ 1: 'LAPORAN POSISI KEUANGAN' }),
    R({ 1: `Untuk Periode ${cur} Tahun 2026` }),
    [],
    R({ 8: cur, 10: cmp }),
    audited ? R({ 10: '(Audited)' }) : [],
    R({ 1: 'ASET' }),
    R({ 2: 'Aset Lancar:' }),
    R({ 3: 'Kas Kecil  - Kantor', 8: 14920321, 10: 12596759 }),
    R({ 3: 'Kas Bank Kalsel', 8: 5705487045.55, 10: 3286441619 }),
    R({ 3: 'Bank BNI', 8: 6770222581, 10: 9495417362, 11: 12584848778.55 }),
    R({ 3: 'Piutang Usaha', 8: 536341310, 10: 893920566 }),
    R({ 3: 'Perlengkapan', 8: 0, 10: 0 }),
    R({ 4: 'Jumlah Aset Lancar', 8: 13161470008.55, 9: 0, 10: 14203890602 }),
    R({ 3: 'Nilai Buku', 8: 847421121824.65, 10: 848074382277 }),
    R({ 3: 'Nilai Buku', 8: 1109769642.52, 10: 962003157 }),
    R({ 4: 'JUMLAH ASET', 8: 861692361475.72, 10: 863240276036 }),
    R({ 8: 0, 10: 0 }),
    R({ 8: 'DIREKTUR UTAMA,' }),
    R({ 3: 'Baris setelah tanda tangan', 8: 1 }),
  ])
}

function labaRugiSheet(cur = 'Triwulan I', cmp = 'Desember 2025') {
  return XLSX.utils.aoa_to_sheet([
    R({ 0: '2.3', 1: 'LAPORAN LABA (RUGI)' }),
    R({ 1: 'PERUSAHAAN UMUM DAERAH PASAR BAIMAN (PERUMDA)' }),
    R({ 1: 'LAPORAN LABA (RUGI)' }),
    R({ 1: `Untuk Periode ${cur} Tahun 2026` }),
    R({ 9: cur, 11: cmp }),
    R({ 11: '(Audited)' }),
    R({ 1: 'PENDAPATAN' }),
    R({ 2: 'PENDAPATAN USAHA' }),
    R({ 3: 'Pendapatan Bisnis Utama', 9: 1409731753, 11: 7050268015 }),
    R({ 3: 'Pendapatan Pengembangan Bisnis Lainnya', 9: 497346900, 11: 3151384220 }),
    R({ 4: 'JUMLAH PENDAPATAN USAHA', 9: 1907078653, 10: 0, 11: 10201652235 }),
    R({ 3: 'Beban Gaji', 9: 528060299, 11: 2024662135 }),
    R({ 3: 'Beban Kelengkapan Pegawai', 9: 0, 11: 37826500 }),
    R({ 3: 'Beban Kelengkapan Pegawai', 9: 4875000, 11: 37953875 }),
    R({ 1: 'LABA (RUGI) BERSIH SETELAH PAJAK', 9: -1567656566.29, 11: -2518823964 }),
    R({ 1: '*Laporan Keuangan Perumda ini menggunakan metode Accrual Basis' }),
  ])
}

// ARUS KAS sheets start at column B (used range B1:…).
function arusKasSheet(cur = 'Triwulan I', cmp = 'Desember 2025') {
  return XLSX.utils.aoa_to_sheet([
    R({ 0: 'PERUSAHAAN UMUM DAERAH PASAR BAIMAN (PERUMDA)' }),
    R({ 0: 'LAPORAN ARUS KAS' }),
    R({ 0: `Untuk Periode ${cur} Tahun 2026` }),
    [],
    R({ 2: cur, 4: cmp }),
    R({ 4: '(Audited)' }),
    R({ 0: 'Arus Kas dari Aktivitas Operasi' }),
    R({ 1: 'Laba (Rugi) Sebelum Pajak', 2: -1567656566.29, 4: -2518823964 }),
    R({ 1: 'Penyusutan Aset Tetap', 2: 878445666.83, 4: 3263863381 }),
    R({ 1: 'Piutang Usaha', 2: 357579256, 4: -893920566 }),
    R({ 0: 'Kenaikan (Penurunan) Bersih Kas dan Setara Kas', 2: -647677625.45, 4: 13232526404 }),
    R({ 0: 'Kas dan Setara kas Akhir Periode', 2: 12584848778.55, 4: 13232526404 }),
    R({ 2: 'DIREKTUR UTAMA,' }),
  ], { origin: 'B1' })
}

// "Penerimaan" in the quarterly layout: three realisasi columns.
function penerimaanTwSheet(period = 'Triwulan I') {
  const ws = XLSX.utils.aoa_to_sheet([
    R({ 0: '2.1', 1: 'LAPORAN REALISASI RENCANA KERJA ANGGARAN 2026' }),
    R({ 0: '2.1.1', 1: `Laporan Penerimaan ${period}` }),
    [],
    R({ 0: 'No', 1: 'Divisi', 2: 'Program dan Kegiatan', 5: 'Kinerja', 6: 'Target 1 Tahun', 7: `Target ${period}`, 8: 'Realiasasi', 11: 'Capaian', 12: 'Selisih target jumlah', 13: 'Deviasi', 14: 'Penjelasan dan Tindak Lanjut' }),
    R({ 5: 'Indikator', 8: 'Triwulan Sebelumnya', 9: period, 10: `Sd ${period}`, 11: '%' }),
    R({ 0: '(1)', 1: '(2)', 2: '(3)', 5: '(4)', 6: '(5)', 7: '(6)', 8: '(7)', 9: '(8)', 10: '(9)', 11: '(10)', 12: '(11)', 13: '(12)', 14: '(13)' }),
    R({ 7: '(5)/4', 10: '(7)+(8)', 11: '(8)/(6)*100', 12: '(5)-(9)', 13: '(9)/(5)*100' }),
    R({ 0: 1, 1: 'Bisnis dan Operasional', 2: 'Pendapatan' }),
    R({ 2: '1.', 3: 'Bisnis Utama', 14: 'Data terlampir' }),
    R({ 3: '1.1', 4: 'Pengelolaan Pasar dari Toko/Kios, Bak dan Los (Bulanan)', 5: 'Jumlah Pendapatan', 6: 8632194723, 7: 2158048680.75, 8: 0, 9: 1013538545, 10: 1013538545, 11: 46.97, 12: 7618656178, 13: 11.74 }),
    R({ 3: 'placeholder', 4: 'Fasilitas Umum', 5: 'Jumlah Pendapatan', 6: 100000000, 7: 25000000, 8: 0, 9: 0, 10: 0, 11: 0, 12: 100000000, 13: 0 }),
    R({ 4: 'Total', 6: 8732194723, 7: 2183048680.75, 8: 0, 9: 1013538545, 10: 1013538545, 11: 46.43, 12: 7718656178, 13: 11.61 }),
    R({ 2: '2.', 3: 'Pendapatan Operasional Lainnya', 7: 0 }),
    R({ 2: '3. Pendapatan Jasa Bunga' }),
    R({ 3: '3.1', 4: 'Pendapatan Bunga dan Jasa Giro', 5: 'Jumlah Pendapatan', 6: 128980253, 7: 32245063.25, 8: 0, 9: 52388776.44, 10: 52388776.44, 11: 162.5, 12: 76591476.56, 13: 40.62 }),
    R({ 4: 'TOTAL PENDAPATAN', 6: 8861174976, 7: 2215293743.99, 8: 0, 9: 1065927321.44, 10: 1065927321.44, 11: 48.12, 12: 7795247654.56, 13: 12.03 }),
    [],
    R({ 4: '*Laporan Realisasi Rencana Kerja Anggaran ini menggunakan metode pencatatan Cash Basis' }),
  ])
  // An outline typed as a number keeps its displayed text: 1.10, not 1.1.
  ws.D11 = { t: 'n', v: 1.1, w: '1.10' }
  return ws
}

// "Beban Operasional" in the semester layout: one realisasi column, three
// outline levels, a helper column right of "Penjelasan".
function opsSemesterSheet(period = 'Semester I') {
  return XLSX.utils.aoa_to_sheet([
    R({ 0: `2.1.3 Beban Operasional dan Bisnis ${period}` }),
    [],
    R({ 0: 'No', 1: 'Divisi', 2: 'Program dan Kegiatan', 6: 'Kinerja', 7: 'Anggaran 1 Tahun', 8: `Anggaran ${period}`, 9: 'Realiasi', 10: 'Capaian', 11: 'Selisih target jumlah', 12: 'Deviasi', 13: 'Penjelasan dan Tindak Lanjut' }),
    R({ 6: 'Indikator', 9: period, 10: '%' }),
    R({ 0: '(1)', 1: '(2)', 2: '(3)', 6: '(4)', 7: '(5)', 8: '(6)', 9: '(7)', 10: '(8)', 11: '(9)', 12: '(10)', 13: '(11)' }),
    R({ 8: '(5)/2', 10: '(7)/(6)*100', 11: '(5)-(7)', 12: '(7)/(5)*100' }),
    R({ 0: 3, 1: 'Bisnis dan Operasional', 2: 'Beban Operasional' }),
    R({ 2: 1, 5: 'Beban Pemeliharaan' }),
    R({ 3: '1.1', 5: 'Pemeliharaan Kendaraan Operasional' }),
    R({ 4: '1.1.1', 5: 'Pajak Mobil Operasional', 6: 'Jumlah Biaya', 7: 25000000, 8: 25000000, 9: 0, 10: 0, 11: 25000000, 12: 0 }),
    R({ 4: '1.1.2', 5: 'Parkir Mobil Operasional', 6: 'Jumlah Biaya', 7: 3000000, 8: 1500000, 9: 1160000, 10: 77.33, 11: 1840000, 12: 38.67 }),
    R({ 5: 'Total', 7: 28000000, 8: 26500000, 9: 1160000, 10: 4.38, 11: 26840000, 12: 4.14, 15: 26840000 }),
    R({ 5: 'TOTAL BEBAN OPERASIONAL PERPASARAN', 7: 28000000, 8: 26500000, 9: 1160000, 10: 4.38, 11: 26840000, 12: 4.14 }),
  ])
}

// "Investasi": lettered rincian rows under an item, zeros included.
function investasiSheet(period = 'Triwulan I') {
  return XLSX.utils.aoa_to_sheet([
    R({ 0: `2.1.2 Investasi Bulan ${period}` }),
    [],
    R({ 0: 'No', 1: 'Divisi', 2: 'Program dan Kegiatan', 5: 'Kinerja', 6: 'Anggaran 1 Tahun', 7: 'Anggaran Tahunan 2026', 8: 'Realisasi', 11: 'Capaian', 12: 'Selisih target jumlah', 13: 'Deviasi', 14: 'Penjelasan dan Tindak Lanjut' }),
    R({ 5: 'Indikator', 8: 'Triwulan Sebelumnya', 9: period, 10: `Sd ${period}`, 11: '%' }),
    R({ 0: '(1)', 1: '(2)', 2: '(3)', 5: '(4)', 6: '(5)', 7: '(6)', 8: '(7)', 9: '(8)', 10: '(9)', 11: '(10)', 12: '(11)', 13: '(12)', 14: '(13)' }),
    R({ 7: '(5)/12', 10: '(7)+(8)', 11: '(8)/(6)*100', 12: '(5)-(9)', 13: '(9)/(5)*100' }),
    R({ 0: 2, 1: 'Bisnis dan Operasional', 2: 'Beban Investasi' }),
    R({ 2: '1', 4: 'Program Operasional Pengelolaan Pasar' }),
    R({ 3: '1.3', 4: 'Perbaikan dan Pengadaan Sarana Pengelolaan Pasar', 5: 'Jumlah Biaya', 6: 1500000000, 7: 1500000000, 8: 0, 9: 0, 10: 0, 11: 0, 12: 1500000000, 13: 0 }),
    R({ 4: 'a. Pengadaan Mobil/Truck Box/Pickup/Freezer Box', 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0 }),
    R({ 4: 'c. Pengadaan Bak/Kontainer Truck', 5: 'Jumlah Biaya', 6: 200000000, 7: 200000000, 8: 0, 9: 177000000, 10: 177000000, 11: 88.5, 12: 23000000, 13: 88.5 }),
    R({ 4: 'Total', 6: 1700000000, 7: 1700000000, 8: 0, 9: 177000000, 10: 177000000, 11: 10.41, 12: 1523000000, 13: 10.41 }),
  ])
}

function journalSheet(iso) {
  return XLSX.utils.aoa_to_sheet([
    ['No. Akun', 'Tgl', 'Bukti', 'Akun', 'Sub Akun', 'D', 'K', 'Keterangan'],
    [11101, serial(iso), '001', 'Kas Kecil', '', 100000, '', 'Setor kas'],
    [41001, serial(iso), '001', 'Pendapatan', '', '', 100000, 'Setor kas'],
  ])
}

// Sheets in order, with the names in `hidden` hidden as Excel saves them.
function workbook(sheets, hidden = []) {
  const wb = XLSX.utils.book_new()
  for (const [name, ws] of sheets) XLSX.utils.book_append_sheet(wb, ws, name)
  wb.Workbook = { Sheets: wb.SheetNames.map(name => ({ name, Hidden: hidden.includes(name) ? 1 : 0 })) }
  return wb
}

const tw1Workbook = (hidden = ['JURNAL JAN 2026', 'NERACA TW II 2026', 'Beban Investasi']) => workbook([
  ['NERACA TW I 2026', neracaSheet()],
  ['LABA RUGI TW I 2026', labaRugiSheet()],
  ['ARUS KAS TW I 2026', arusKasSheet()],
  ['Penerimaan', penerimaanTwSheet()],
  ['Beban Investasi', investasiSheet('Triwulan IV')],
  [' Investasi', investasiSheet()],
  ['JURNAL JAN 2026', journalSheet('2026-01-15')],
  ['NERACA TW II 2026', neracaSheet('Triwulan II', 'Triwulan I', false)],
], hidden)

test('period sheet names: TW / Triwulan, Semester, Tahun(an) — never months or yearless templates', () => {
  const cases = {
    'NERACA TW I 2026': { report: 'neraca', code: 'TW1', year: 2026 },
    'LABA RUGI TW II 2026': { report: 'labaRugi', code: 'TW2', year: 2026 },
    'ARUS KAS TW III 2026': { report: 'arusKas', code: 'TW3', year: 2026 },
    ' neraca  triwulan iv 2026 ': { report: 'neraca', code: 'TW4', year: 2026 },
    'NERACA TW 2 2026': { report: 'neraca', code: 'TW2', year: 2026 },
    'LABA RUGI SEMESTER I 2026': { report: 'labaRugi', code: 'S1', year: 2026 },
    'ARUS KAS SEMESTER II 2026': { report: 'arusKas', code: 'S2', year: 2026 },
    'NERACA TAHUNAN 2026': { report: 'neraca', code: 'THN', year: 2026 },
    'LABA (RUGI) TAHUN 2026': { report: 'labaRugi', code: 'THN', year: 2026 },
  }
  for (const [name, want] of Object.entries(cases)) assert.deepEqual(parsePeriodSheetName(name), want, name)
  for (const name of ['NERACA SEPTEMBER 2026', 'NERACA TW3', 'LR TW1', 'NERACA TW V 2026', 'NERACA SEMESTER III 2026', 'NERACA TAHUN I 2026', 'JURNAL JAN 2026', 'Penerimaan']) {
    assert.equal(parsePeriodSheetName(name), null, name)
  }
})

test('period keys map to the presets and months', () => {
  assert.equal(periodReportKey('tw1'), '2026-TW1')
  assert.equal(periodReportKey('tahun'), '2026-THN')
  assert.equal(periodReportKey('sep'), null)
  assert.deepEqual(parsePeriodKey('2026-S2').months, [7, 8, 9, 10, 11, 12])
  assert.equal(parsePeriodKey('2026-S2').preset, 's2')
  assert.equal(parsePeriodKey('2026-07'), null)
  assert.equal(periodReportLabel('2026-THN'), 'Tahunan 2026')
})

test('a period workbook is detected from its visible report sheets only', () => {
  const packs = detectPeriodPacks(tw1Workbook())
  assert.deepEqual(packs.map(p => p.key), ['2026-TW1'], 'the hidden NERACA TW II 2026 template does not count')
  assert.deepEqual(packs[0].sheets, { neraca: 'NERACA TW I 2026', labaRugi: 'LABA RUGI TW I 2026', arusKas: 'ARUS KAS TW I 2026' })
  assert.equal(packs[0].preset, 'tw1')
  // A monthly lampiran carries no period report.
  const monthly = workbook([['NERACA SEPTEMBER 2026', neracaSheet('September 2026')], ['JURNAL SEPTEMBER 2026', journalSheet('2026-09-10')]])
  assert.deepEqual(detectPeriodPacks(monthly), [])
})

test('hidden monthly JURNAL tabs of a period workbook are not monthly lampiran (no overwrite of January)', () => {
  assert.deepEqual(detectLampiranPeriods(tw1Workbook()), [], 'TW I with its hidden JURNAL JAN 2026')
  // The same tab made visible is a monthly lampiran inside the file.
  assert.deepEqual(detectLampiranPeriods(tw1Workbook(['NERACA TW II 2026'])).map(p => p.period), ['2026-01'])
  // Without a period report, a hidden JURNAL tab still counts — monthly uploads are unchanged.
  const monthly = workbook([['JURNAL MARET 2026', journalSheet('2026-03-05')]], ['JURNAL MARET 2026'])
  assert.deepEqual(detectLampiranPeriods(monthly).map(p => p.period), ['2026-03'])
})

test('Neraca: both columns as headed, labels and depth, helper columns and the signature block left out', () => {
  const r = parseStatementSheet(neracaSheet())
  assert.deepEqual(r.columns, ['Triwulan I', 'Desember 2025 (Audited)'])
  assert.equal(r.company, 'PERUSAHAAN UMUM DAERAH PASAR BAIMAN (PERUMDA)')
  assert.equal(r.title, 'LAPORAN POSISI KEUANGAN')
  assert.equal(r.subtitle, 'Untuk Periode Triwulan I Tahun 2026')
  assert.deepEqual(r.rows.slice(0, 3), [
    { label: 'ASET', depth: 0, values: [null, null] },
    { label: 'Aset Lancar:', depth: 1, values: [null, null] },
    { label: 'Kas Kecil - Kantor', depth: 2, values: [14920321, 12596759] },
  ])
  assert.deepEqual(r.rows.find(x => x.label === 'Bank BNI').values, [6770222581, 9495417362])
  assert.deepEqual(r.rows.filter(x => x.label === 'Nilai Buku').map(x => x.values[0]), [847421121824.65, 1109769642.52])
  assert.equal(r.rows[r.rows.length - 1].label, 'JUMLAH ASET')
})

test('Arus Kas sheet starting at column B; a header without "(Audited)"', () => {
  const r = parseStatementSheet(arusKasSheet('Triwulan II', 'Triwulan I'))
  assert.deepEqual(r.columns, ['Triwulan II', 'Triwulan I (Audited)'])
  const noAudit = XLSX.utils.aoa_to_sheet([
    R({ 0: 'LAPORAN ARUS KAS' }),
    R({ 2: 'Triwulan II', 4: 'Triwulan I' }),
    R({ 1: 'Laba (Rugi) Sebelum Pajak', 2: 74091452.31, 4: -1567656566.29 }),
  ], { origin: 'B1' })
  const r2 = parseStatementSheet(noAudit)
  assert.deepEqual(r2.columns, ['Triwulan II', 'Triwulan I'])
  assert.deepEqual(r2.rows, [{ label: 'Laba (Rugi) Sebelum Pajak', depth: 0, values: [74091452.31, -1567656566.29] }])
  assert.deepEqual(r.rows.find(x => /Akhir Periode/.test(x.label)).values, [12584848778.55, 13232526404])
})

test('LRA quarterly layout: columns, roles and formulas; row kinds, outlines and Penjelasan', () => {
  const t = parseLraTable(penerimaanTwSheet())
  assert.equal(t.title, 'Laporan Penerimaan Triwulan I')
  assert.equal(t.kinerjaLabel, 'Kinerja Indikator')
  assert.deepEqual(t.columns.map(c => c.role), ['anggaran', 'target', 'prev', 'current', 'cumulative', 'capaian', 'selisih', 'deviasi'])
  assert.deepEqual(t.columns.map(c => c.label), ['Target 1 Tahun', 'Target Triwulan I', 'Triwulan Sebelumnya', 'Triwulan I', 'Sd Triwulan I', 'Capaian %', 'Selisih target jumlah', 'Deviasi'])
  assert.deepEqual(t.columns.map(c => c.group), [null, null, 'Realisasi', 'Realisasi', 'Realisasi', null, null, null])
  assert.equal(t.columns[1].num, '(6)')
  assert.equal(t.columns[1].formula, '(5)/4')
  assert.equal(t.columns[4].formula, '(7)+(8)')
  assert.deepEqual(t.rows.map(r => r.kind), ['division', 'group', 'item', 'item', 'total', 'group', 'group', 'item', 'grandtotal', 'note'])
  assert.equal(t.rows[0].nama, 'Bisnis dan Operasional — Pendapatan')
  assert.deepEqual([t.rows[1].outline, t.rows[1].nama, t.rows[1].penjelasan], ['1', 'Bisnis Utama', 'Data terlampir'])
  assert.deepEqual(t.rows[2].values, [8632194723, 2158048680.75, 0, 1013538545, 1013538545, 46.97, 7618656178, 11.74])
  assert.equal(t.rows[3].outline, '1.10', 'numeric outline keeps its displayed text')
  assert.equal(t.rows[5].kind, 'group', '"2." with a stray 0 in the target column is still a group')
  assert.deepEqual([t.rows[6].outline, t.rows[6].nama], ['3', 'Pendapatan Jasa Bunga'])
  assert.equal(t.rows[8].nama, 'TOTAL PENDAPATAN')
})

test('LRA semester layout: one realisasi column; three outline levels; helper column ignored', () => {
  const t = parseLraTable(opsSemesterSheet())
  assert.equal(t.title, 'Beban Operasional dan Bisnis Semester I')
  assert.deepEqual(t.columns.map(c => c.role), ['anggaran', 'target', 'current', 'capaian', 'selisih', 'deviasi'])
  assert.deepEqual(t.columns.map(c => c.label), ['Anggaran 1 Tahun', 'Anggaran Semester I', 'Semester I', 'Capaian %', 'Selisih target jumlah', 'Deviasi'])
  assert.equal(t.columns[1].formula, '(5)/2')
  assert.deepEqual(t.rows.map(r => [r.kind, r.outline, r.depth]), [
    ['division', '', 0], ['group', '1', 0], ['group', '1.1', 1], ['item', '1.1.1', 2], ['item', '1.1.2', 2], ['total', '', 3], ['grandtotal', '', 3],
  ])
  assert.equal(t.rows[1].nama, 'Beban Pemeliharaan')
  assert.deepEqual(t.rows[5].values, [28000000, 26500000, 1160000, 4.38, 26840000, 4.14])
})

test('Investasi: lettered rincian rows are value rows even at zero', () => {
  const t = parseLraTable(investasiSheet())
  assert.deepEqual(t.rows.map(r => r.kind), ['division', 'group', 'item', 'detail', 'detail', 'total'])
  assert.equal(t.rows[3].nama, 'a. Pengadaan Mobil/Truck Box/Pickup/Freezer Box')
  assert.equal(t.columns[1].label, 'Anggaran Tahunan 2026')
})

test('a whole TW I pack: statements, LRA tables (visible sheet first), no warnings', () => {
  const pack = extractPeriodPack(tw1Workbook(), '2026-TW1', { fileName: 'LAMPIRAN_LAPORAN_TRIWULAN_I.xlsx' })
  assert.equal(pack.key, '2026-TW1')
  assert.equal(pack.label, 'Triwulan I 2026')
  assert.equal(pack.preset, 'tw1')
  assert.equal(pack.fileName, 'LAMPIRAN_LAPORAN_TRIWULAN_I.xlsx')
  assert.equal(pack.company, 'PERUSAHAAN UMUM DAERAH PASAR BAIMAN (PERUMDA)')
  assert.deepEqual(Object.keys(pack.reports), ['neraca', 'labaRugi', 'arusKas'])
  assert.deepEqual(Object.keys(pack.lra), ['penerimaan', 'bebanInvestasi'])
  assert.equal(pack.lra.bebanInvestasi.sheet, ' Investasi', 'the visible sheet wins over the hidden "Beban Investasi"')
  assert.deepEqual(pack.warnings, [])
  assert.ok(isUsablePeriodPack(pack))
  // Same occurrence order for repeated labels.
  assert.deepEqual(pack.reports.labaRugi.rows.filter(r => r.label === 'Beban Kelengkapan Pegawai').map(r => r.values[1]), [37826500, 37953875])
  assert.throws(() => extractPeriodPack(tw1Workbook(), '2026-TW2'), /tidak ditemukan/)
})

test('a workbook of several periods assigns each LRA table by its title', () => {
  const wb = workbook([
    ['NERACA TW IV 2026', neracaSheet('Triwulan IV', 'Triwulan III', false)],
    ['LABA RUGI TW IV 2026', labaRugiSheet('Triwulan IV', 'Triwulan III')],
    ['NERACA TAHUN 2026', neracaSheet('Tahun 2026', 'Desember 2025')],
    ['LABA RUGI TAHUN 2026', labaRugiSheet('Tahun 2026', 'Desember 2025')],
    ['Penerimaan', penerimaanTwSheet('Triwulan IV')],
  ])
  assert.deepEqual(detectPeriodPacks(wb).map(p => p.key), ['2026-TW4', '2026-THN'])
  assert.deepEqual(Object.keys(extractPeriodPack(wb, '2026-TW4').lra), ['penerimaan'])
  assert.deepEqual(Object.keys(extractPeriodPack(wb, '2026-THN').lra), [], 'the TW IV table does not go to the year')
})

test('a statement sheet without figures is left out with a warning', () => {
  const empty = XLSX.utils.aoa_to_sheet([R({ 8: 'Triwulan I', 10: 'Desember 2025' }), R({ 1: 'ASET' }), R({ 3: 'Kas', 8: 0 })])
  const wb = workbook([['NERACA TW I 2026', empty], ['LABA RUGI TW I 2026', labaRugiSheet()]])
  const pack = extractPeriodPack(wb, '2026-TW1')
  assert.deepEqual(Object.keys(pack.reports), ['labaRugi'])
  assert.match(pack.warnings.join(' | '), /NERACA TW I 2026.*dilewati/)
  assert.match(pack.warnings.join(' | '), /ARUS KAS .* tidak ditemukan/)
})

test('rekap rows: Anggaran, period target, period realisasi and capaian of every line', () => {
  const rows = lraRekapRows(parseLraTable(penerimaanTwSheet()))
  assert.deepEqual(rows.find(r => r.outline === '1.1'), {
    kind: 'item', outline: '1.1', nama: 'Pengelolaan Pasar dari Toko/Kios, Bak dan Los (Bulanan)', depth: 1,
    anggaran: 8632194723, target: 2158048680.75, realisasi: 1013538545, persen: 46.97,
  })
  assert.deepEqual(rows.map(r => r.kind), ['group', 'item', 'item', 'total', 'group', 'group', 'item', 'grandtotal'])
  const semester = lraRekapRows(parseLraTable(opsSemesterSheet()))
  assert.equal(semester.find(r => r.outline === '1.1.2').realisasi, 1160000)
})

test('a used range stretched to the whole sheet (A1:XFD1048576) still parses, quickly', () => {
  const ws = neracaSheet()
  const normal = parseStatementSheet(ws)
  ws['!ref'] = 'A1:XFD1048576'
  const t0 = Date.now()
  const r = parseStatementSheet(ws)
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`)
  assert.deepEqual(r, normal)
})
