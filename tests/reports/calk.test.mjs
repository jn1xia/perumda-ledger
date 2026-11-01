// CALK and Laporan Perubahan Ekuitas: the audited 2025 figures tie to the
// auditor's totals, a period's notes pair its Neraca / Laba Rugi lines with
// 2025, and the equity statement rolls 2025 forward to the period's Neraca.
// Run: npm run test:reports
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUDIT_2025, NERACA_2025, LABA_RUGI_2025, CATATAN_2025, EKUITAS_2025 } from '../../src/data/laporanAudit2025.js'
import { CALK_NARASI_2025 } from '../../src/data/calkNarasi2025.js'
import {
  buildCalkNotes, buildPerubahanEkuitas, equityAt, labaRugiSections, neracaGroups, neracaCode,
  periodEndText, periodSpanText,
} from '../../src/utils/calk.js'

const n25 = Object.fromEntries(NERACA_2025)
const sumOf = (list, k = 'value') => list.reduce((s, x) => s + (Array.isArray(x) ? x[1] : x[k]), 0)
const noteOf = (notes, id) => notes.find(n => n.id === id)

test('the audited 2025 figures tie to the auditor\'s totals', () => {
  const g = neracaGroups(NERACA_2025.map(([label, value]) => ({ label, value })))
  const t = (id) => sumOf(g[id] || [])
  assert.equal(t('kas'), CATATAN_2025.kas.jumlah)
  assert.equal(sumOf(CATATAN_2025.kas.rincian), 13232526404)
  assert.equal(t('piutang'), CATATAN_2025.piutang.jumlah)
  assert.equal(sumOf(CATATAN_2025.piutang.rincian), 893920566)
  assert.equal(t('persediaan'), 66692820)
  assert.equal(t('dibayarDimuka'), 10750812)
  assert.equal(t('kas') + t('piutang') + t('persediaan') + t('dibayarDimuka'), n25['Jumlah Aset Lancar'])
  assert.equal(t('asetTetap'), CATATAN_2025.asetTetap.nilaiTercatat)
  assert.equal(t('asetTetap'), n25['Jumlah Aset Tidak Lancar'])
  assert.equal(n25['Jumlah Aset Lancar'] + n25['Jumlah Aset Tidak Lancar'], n25['JUMLAH ASET'])
  assert.equal(t('ekuitas'), n25['JUMLAH EKUITAS'])
  assert.equal(t('liabilitas'), 0)

  // Aset tetap movement: saldo awal + penambahan − pengurangan + penyesuaian = saldo akhir.
  for (const r of [...CATATAN_2025.asetTetap.perolehan, ...CATATAN_2025.asetTetap.akumulasi]) {
    assert.equal(r[1] + r[2] - r[3] + r[4], r[5], r[0])
  }
  const perolehan = sumOf(CATATAN_2025.asetTetap.perolehan.map(r => [r[0], r[5]]))
  const akumulasi = sumOf(CATATAN_2025.asetTetap.akumulasi.map(r => [r[0], r[5]]))
  assert.equal(perolehan, 852300248815)
  assert.equal(akumulasi, 3263863381)
  assert.equal(perolehan - akumulasi, CATATAN_2025.asetTetap.nilaiTercatat)
  for (const grp of CATATAN_2025.asetTetap.penambahan) {
    assert.equal(grp.rows.reduce((s, r) => s + r[2], 0), grp.jumlah, grp.kelompok)
    assert.equal(CATATAN_2025.asetTetap.perolehan.find(r => r[0] === grp.kelompok)[2], grp.jumlah, grp.kelompok)
  }

  // Laba Rugi sections and the year's result.
  const l = labaRugiSections(LABA_RUGI_2025.map(([label, value]) => ({ label, value })))
  for (const id of ['pendapatan', 'bebanPokok', 'bebanUmum', 'bebanOperasional', 'pendapatanLain', 'bebanLain']) {
    assert.equal(sumOf(l[id].rows), l[id].total, id)
  }
  assert.equal(l.pendapatan.total - l.bebanPokok.total - l.bebanUmum.total - l.bebanOperasional.total
    + l.pendapatanLain.total - l.bebanLain.total, -2518823964)
  for (const g of CATATAN_2025.pendapatan.grup) assert.equal(sumOf(g.rows), g.jumlah, g.label)
  assert.equal(sumOf(CATATAN_2025.pendapatan.grup.map(g => [g.label, g.jumlah])), l.pendapatan.total)
  assert.equal(CATATAN_2025.pendapatan.parkir.reduce((s, r) => s + r[3], 0), CATATAN_2025.pendapatan.parkirJumlah)
  assert.equal(sumOf(CATATAN_2025.modal.penyertaan.map(r => [r[0], r[3]])), CATATAN_2025.modal.penyertaanJumlah)

  // Perubahan Ekuitas 2025.
  const e = EKUITAS_2025
  for (const k of ['modal', 'disetor', 'saldoLaba']) {
    assert.equal(e.awal[k] + e.mutasi.reduce((s, m) => s + m[k], 0), e.akhir[k], k)
  }
  assert.equal(e.akhir.modal + e.akhir.disetor + e.akhir.saldoLaba, e.jumlah)
  assert.equal(e.jumlah, n25['JUMLAH EKUITAS'])
})

test('narrative notes: every block is well formed; {akhir} only where the reporting date belongs', () => {
  const kinds = ['h', 'h2', 'sub', 'p', 'ol', 'kv', 'tbl']
  for (const b of CALK_NARASI_2025) assert.ok(kinds.some(k => k in b), JSON.stringify(b).slice(0, 80))
  const withAkhir = CALK_NARASI_2025.filter(b => JSON.stringify(b).includes('{akhir}'))
  assert.equal(withAkhir.length, 1)
  assert.ok(CALK_NARASI_2025.some(b => b.kv && b.kv.some(([k, v]) => k === 'NPWP' && v === '0287-5807-5773-10000')))
  assert.deepEqual(CALK_NARASI_2025.filter(b => b.h).map(b => b.h.slice(0, 2)), ['1.', '2.', '3.'])
})

test('neraca lines meet 2025 by account code: renamed lines, new accounts, unmapped lines', () => {
  assert.equal(neracaCode('Modal Perumda Pasar Baiman'), '31000')
  assert.equal(neracaCode('Modal Perumda Pasar Banjarmasin'), '31000')
  assert.equal(neracaCode('Kas Kecil  - Kantor'), '11101')
  const neraca = [
    { label: 'ASET', value: null }, { label: 'Aset Lancar:', value: null },
    { label: 'Kas Kecil  - Kantor', value: 14920321 },
    { label: 'Kas Bank Kalsel', value: 5705487045.55 },
    { label: 'Bank BNI', value: 6770222581 },
    { label: 'Bank Mandiri Taspen', value: 1000000 },
    { label: 'Piutang Usaha', value: 536341310 },
    { label: 'Aset Lancar Lainnya (Belum Terpetakan)', value: 2500 },
    { label: 'Jumlah Aset Lancar', value: 13161470008.55 },
    { label: 'Aset Tidak Lancar - Properti Investasi:', value: null },
    { label: 'Tanah', value: 786424200000 },
    { label: 'Bangunan', value: 65034430388 },
    { label: 'Akumulasi Penyusutan Bangunan', value: -4037508563.35 },
    { label: 'Nilai Buku', value: 847421121824.65 },
    { label: 'KEWAJIBAN', value: null },
    { label: 'Utang Daerah', value: 19742006 },
    { label: 'Kewajiban Lainnya (Belum Terpetakan)', value: 100 },
    { label: 'JUMLAH KEWAJIBAN', value: 19742106 },
    { label: 'EKUITAS', value: null },
    { label: 'Modal Perumda Pasar Banjarmasin', value: 850759100000 },
    { label: 'Modal Disetor', value: 15000000000 },
  ]
  const notes = buildCalkNotes({ neraca, labaRugi: null })
  const kas = noteOf(notes, 'kas')
  assert.deepEqual(kas.rows.map(r => [r.label, r.cur, r.prev]), [
    ['Kas Kecil  - Kantor', 14920321, 12596759],
    ['Kas Bank Kalsel', 5705487045.55, 3286441619],
    ['Bank BNI', 6770222581, 9495417362],
    ['Bank Mandiri Taspen', 1000000, null],
    ['Bank BNI Bisnis', null, 396704489],
    ['Bank BNI Tapcash', null, 41366175],
  ], 'new account kept; 2025-only lines follow; zero lines left out')
  assert.equal(kas.total.prev, 13232526404)
  assert.equal(kas.total.cur, 14920321 + 5705487045.55 + 6770222581 + 1000000)
  // An unmapped line lands in the note of its Neraca section.
  assert.ok(noteOf(notes, 'dibayarDimuka').rows.some(r => /Belum Terpetakan/.test(r.label) && r.cur === 2500))
  assert.deepEqual(noteOf(notes, 'liabilitas').rows.map(r => r.label), ['Utang Daerah', 'Kewajiban Lainnya (Belum Terpetakan)'])
  const ek = noteOf(notes, 'ekuitas')
  assert.equal(ek.rows[0].label, 'Modal Perumda Pasar Banjarmasin')
  assert.equal(ek.rows[0].prev, 850759100000, 'renamed modal line meets its 2025 figure')
  const at = noteOf(notes, 'asetTetap')
  assert.deepEqual(at.perolehan.find(r => r.label === 'Bangunan'), { label: 'Bangunan', cur: 65034430388, prev: 64874760388, mutasi: 159670000 })
  assert.equal(at.totalAkumulasi.prev, -3263863381)
  assert.equal(at.total.prev, 849036385434)
  // Laba Rugi notes without a Laba Rugi: the period column is empty, 2025 stays.
  const pend = noteOf(notes, 'pendapatan')
  assert.equal(pend.total.cur, undefined)
  assert.equal(pend.total.prev, 10201652235)
})

test('laba rugi notes: sections by heading, repeated lines kept apart, the PPh line inside operasional', () => {
  const lr = [
    { label: 'PENDAPATAN USAHA', value: null },
    { label: 'Pendapatan Bisnis Utama', value: 1409731753 },
    { label: 'Pendapatan Pengembangan Bisnis Lainnya', value: 497346900 },
    { label: 'JUMLAH PENDAPATAN USAHA', value: 1907078653 },
    { label: 'BEBAN UMUM DAN ADMINISTRASI', value: null },
    { label: 'Beban Gaji', value: 528060299 },
    { label: 'Beban Kelengkapan Pegawai', value: 0 },
    { label: 'JUMLAH BEBAN UMUM DAN ADMINISTRASI', value: 528060299 },
    { label: 'BEBAN OPERASIONAL DAN BISNIS', value: null },
    { label: 'Beban Kelengkapan Pegawai', value: 4875000 },
    { label: 'Beban PPN dan PPH', value: 1000000 },
    { label: 'JUMAH BEBAN OPERASIONAL DAN BISNIS', value: 5875000 },
    { label: 'PENDAPATAN LAIN-LAIN', value: null },
    { label: 'Pendapatan Bunga Bank', value: 52388776.44 },
    { label: 'Pendapatan Lain-lain', value: 307 },
    { label: 'JUMLAH PENDAPATAN LAIN-LAIN', value: 52389083.44 },
    { label: 'BEBAN LAIN-LAIN', value: null },
    { label: 'Beban Pajak Bank', value: 10477757.89 },
    { label: 'Beban Lain-lain', value: 7992000 },
    { label: 'JUMAH BEBAN NON OPERASIONAL', value: 18469757.89 },
  ]
  const notes = buildCalkNotes({ neraca: null, labaRugi: lr })
  const umum = noteOf(notes, 'bebanUmum')
  assert.deepEqual(umum.rows.find(r => r.label === 'Beban Kelengkapan Pegawai'), { label: 'Beban Kelengkapan Pegawai', cur: 0, prev: 37826500 })
  const ops = noteOf(notes, 'bebanOperasional')
  assert.deepEqual(ops.rows.find(r => r.label === 'Beban Kelengkapan Pegawai'), { label: 'Beban Kelengkapan Pegawai', cur: 4875000, prev: 37953875 })
  assert.equal(ops.rows.find(r => r.label === 'Beban PPN dan PPH').prev, null)
  assert.equal(ops.total.cur, 5875000)
  assert.equal(ops.total.prev, 3401201975)
  const lain = noteOf(notes, 'lainLain')
  assert.deepEqual(lain.pendapatan.rows.find(r => r.label === 'Pendapatan Lain-lain'), { label: 'Pendapatan Lain-lain', cur: 307, prev: 504815982 }, 'the line, not the heading')
  assert.equal(lain.total.cur, 52389083.44 - 18469757.89)
  assert.equal(lain.total.prev, -54148469)
  // A section absent from the period reads 0 for the period, 2025 kept.
  assert.equal(noteOf(notes, 'bebanPokok').total.cur, 0)
  assert.equal(noteOf(notes, 'bebanPokok').total.prev, 1591069930)
})

test('perubahan ekuitas: 2025 as audited, then the year to the period end from its Neraca', () => {
  const only2025 = buildPerubahanEkuitas({})
  assert.deepEqual(only2025.rows.map(r => [r.label, r.jumlah]), [
    ['Saldo 01 Januari 2025', 850759100000],
    ['Tambahan modal belum di sahkan', 15000000000],
    ['Rugi tahun berjalan', -2518823964],
    ['Saldo 31 Desember 2025', 863240276036],
  ])
  assert.equal(only2025.check, null)

  // Neraca TW I 2026 (official): lalu = 2025, berjalan = Januari–Maret.
  const tw1 = [
    { label: 'Modal Perumda Pasar Baiman', value: 850759100000 },
    { label: 'Modal Disetor', value: 15000000000 },
    { label: 'Saldo Laba (Rugi) Periode Lalu', value: -2518823964 },
    { label: '(Laba) Rugi Periode Berjalan', value: -1567656566.29 },
    { label: 'Koreksi Ekuitas', value: 0 },
    { label: 'JUMLAH EKUITAS', value: 861672619469.71 },
  ]
  const r1 = buildPerubahanEkuitas({ akhir: equityAt(tw1), spanText: periodSpanText([1, 3]), endText: periodEndText('2026-03') })
  const tail = r1.rows.slice(4)
  assert.deepEqual(tail.map(r => r.label), ['Rugi periode berjalan (1 Januari – 31 Maret 2026)', 'Saldo 31 Maret 2026'])
  assert.ok(Math.abs(tail[0].saldoLaba - -1567656566.29) < 0.005)
  assert.ok(Math.abs(r1.check.selisih) < 0.01)

  // Neraca TW II 2026 (official) splits lalu = 2025 + TW I, berjalan = TW II:
  // the year to June is the Semester I loss of the division's own S1 report.
  const tw2 = [
    { label: 'Modal Perumda Pasar Baiman', value: 850759100000 },
    { label: 'Modal Disetor', value: 15000000000 },
    { label: 'Saldo Laba (Rugi) Periode Lalu', value: -4086480530.29 },
    { label: '(Laba) Rugi Periode Berjalan', value: 74091452.31 },
    { label: 'Koreksi Ekuitas', value: 0 },
    { label: 'JUMLAH EKUITAS', value: 861746710922.02 },
  ]
  const r2 = buildPerubahanEkuitas({ akhir: equityAt(tw2), spanText: periodSpanText([1, 6]), endText: periodEndText('2026-06') })
  const laba = r2.rows.find(r => /periode berjalan/.test(r.label))
  assert.ok(Math.abs(laba.saldoLaba - -1493565113.98) < 0.005)
  assert.ok(Math.abs(r2.check.selisih) < 0.01)

  // An unmapped equity line keeps the statement tied to the Neraca.
  const withOther = [
    { label: 'EKUITAS', value: null },
    ...tw1.filter(r => r.label !== 'JUMLAH EKUITAS'),
    { label: 'Ekuitas Lainnya (Belum Terpetakan)', value: 1000000 },
    { label: 'JUMLAH EKUITAS', value: 861673619469.71 },
  ]
  const r4 = buildPerubahanEkuitas({ akhir: equityAt(withOther), spanText: periodSpanText([1, 3]), endText: periodEndText('2026-03') })
  assert.ok(r4.rows.some(r => r.label === 'Ekuitas lainnya (belum terpetakan)' && r.jumlah === 1000000))
  assert.ok(Math.abs(r4.check.selisih) < 0.01)
  // A Neraca without its Modal line (an empty template month) is not used.
  assert.equal(equityAt([{ label: 'Modal Perumda Pasar Baiman', value: 0 }, { label: 'JUMLAH EKUITAS', value: -308049696.57 }]), null)

  // A capital injection and a correction get their own rows.
  const r3 = buildPerubahanEkuitas({
    akhir: { modal: 850759100000, disetor: 20000000000, saldoLaba: -3000000000, koreksi: -1000, jumlah: null },
    spanText: periodSpanText([1, 12]), endText: periodEndText('2026-12'),
  })
  assert.deepEqual(r3.rows.slice(4).map(r => [r.label, r.jumlah]), [
    ['Tambahan modal', 5000000000],
    ['Koreksi ekuitas', -1000],
    ['Rugi periode berjalan (Tahun 2026)', -481176036],
    ['Saldo 31 Desember 2026', 867759099000],
  ])
})

test('period texts', () => {
  assert.equal(periodEndText('2026-02'), '28 Februari 2026')
  assert.equal(periodEndText('2026-12'), '31 Desember 2026')
  assert.equal(periodSpanText([1, 9]), '1 Januari – 30 September 2026')
  assert.equal(periodSpanText([1, 12]), 'Tahun 2026')
  assert.equal(AUDIT_2025.kolom, '31 Des 2025 (Audited)')
})
