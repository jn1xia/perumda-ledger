// Regresi untuk tiga perbaikan 20 Sep 2026:
//   1. Kartu Dashboard "Kas & Bank" memakai definisi kas yang sama dengan
//      Laporan Arus Kas (kelas 111), jadi Bank BSI (11108) tidak hilang lagi.
//   2. Periode Dashboard diturunkan dari data, bukan di-hardcode ke April.
//   3. Modul Giro tidak boleh memposting ke 11108 (Bank BSI).
import test from 'node:test'
import assert from 'node:assert/strict'
import { CASH_PREFIX_RE, isCashCode, deltaCash, codeOf } from '../../src/utils/reportDelta.js'
import { resolveGiroAccounts, GIRO_ACCOUNT_SPEC } from '../../src/utils/giroAccounts.js'
import { expandJournals } from '../../src/utils/journalExpand.js'

// COA Perumda yang relevan (sesuai produksi per 20 Sep 2026).
const COA = [
  { code: '11100', name: 'Kas Setara Kas', saldo_awal: 0 },
  { code: '11101', name: 'Kas Kecil', saldo_awal: 12596759 },
  { code: '11102', name: 'Kas Pendapatan Belum Setor', saldo_awal: 0 },
  { code: '11103', name: 'Bank Kalsel - 3204661684', saldo_awal: 3286441619 },
  { code: '11104', name: 'Bank BNI', saldo_awal: 9495417362 },
  { code: '11105', name: 'Investasi Jangka Pendek', saldo_awal: 0 },
  { code: '11106', name: 'Bank BNI Bisnis', saldo_awal: 396704489 },
  { code: '11107', name: 'Bank BNI Tapcash', saldo_awal: 41366175 },
  { code: '11108', name: 'Bank BSI', saldo_awal: 0 },
  { code: '11201', name: 'Piutang Usaha', saldo_awal: 0 },
  { code: '11501', name: 'BBM Dibayar di Muka', saldo_awal: 0 },
  { code: '21200', name: 'Utang Usaha', saldo_awal: 0 },
]

test('kas & setara kas mencakup seluruh kelas 111, termasuk 11108 Bank BSI', () => {
  for (const c of ['11100', '11101', '11102', '11103', '11104', '11105', '11106', '11107', '11108'])
    assert.equal(isCashCode(c), true, `${c} harus dihitung sebagai kas`)
  // Bukan kas.
  for (const c of ['11201', '11501', '12101', '21200', '41001'])
    assert.equal(isCashCode(c), false, `${c} tidak boleh dihitung sebagai kas`)
  assert.equal(CASH_PREFIX_RE.test('11108'), true)
})

test('deltaCash tetap identik dengan implementasi lama (startsWith 111 inline)', () => {
  const journals = [
    { tanggal: '2026-08-01', debit: 1000, kredit: 1000, akun_debit: '11108 Bank BSI', akun_kredit: '41001 Pendapatan Sewa Kios' },
    { tanggal: '2026-08-02', debit: 250, kredit: 250, akun_debit: '61111 Beban Sewa Mobil', akun_kredit: '11103 Bank Kalsel' },
    { tanggal: '2026-08-03', debit: 700, kredit: 700, akun_debit: '11201 Piutang Usaha', akun_kredit: '41002 Pendapatan Lain' },
    { tanggal: '2026-08-04', debit: 90, kredit: 90, akun_debit: '11104 Bank BNI', akun_kredit: '11103 Bank Kalsel' },
  ]
  const legacy = journals.reduce((sum, j) => {
    const dc = codeOf(j.akun_debit), kc = codeOf(j.akun_kredit)
    let s = sum
    if (dc.startsWith('111')) s += (j.debit || 0)
    if (kc.startsWith('111')) s -= (j.kredit || 0)
    return s
  }, 0)
  assert.equal(deltaCash(journals), legacy)
  assert.equal(deltaCash(journals), 1000 - 250 + 90 - 90) // BSI masuk hitungan
})

// Replika logika kartu "Kas & Bank" di Dashboard.jsx.
function kasBankCard(coaFlat, journals) {
  const posted = expandJournals(journals).filter(j => j.status === 'posted')
  const map = new Map()
  const bump = (code, amt) => { if (isCashCode(code)) map.set(code, (map.get(code) || 0) + amt) }
  for (const a of coaFlat) bump(String(a.code || ''), Number(a.saldo_awal) || 0)
  for (const j of posted) {
    bump(codeOf(j.akun_debit), Number(j.debit) || 0)
    bump(codeOf(j.akun_kredit), -(Number(j.kredit) || 0))
  }
  const total = [...map.values()].reduce((s, v) => s + v, 0)
  const subs = [...map.entries()].filter(([, v]) => v !== 0)
  return { total, subs }
}

test('kartu Kas & Bank: total selalu sama dengan jumlah rincian yang tampil', () => {
  const journals = [
    { id: 'A', status: 'posted', tanggal: '2026-05-28', debit: 70376200, kredit: 70376200, akun_debit: '11108 Bank BSI', akun_kredit: '11103 Bank Kalsel' },
    { id: 'B', status: 'posted', tanggal: '2026-08-10', debit: 5000000, kredit: 5000000, akun_debit: '11104 Bank BNI', akun_kredit: '41001 Pendapatan Sewa Kios' },
    { id: 'C', status: 'pending', tanggal: '2026-08-11', debit: 999, kredit: 999, akun_debit: '11104 Bank BNI', akun_kredit: '41001 Pendapatan Sewa Kios' },
  ]
  const { total, subs } = kasBankCard(COA, journals)
  assert.equal(subs.reduce((s, [, v]) => s + v, 0), total, 'rincian harus menjumlah ke total kartu')
  // Bank BSI wajib muncul sebagai baris rincian.
  assert.ok(subs.some(([c]) => c === '11108'), '11108 Bank BSI harus muncul di rincian')
  // Jurnal pending tidak ikut.
  assert.equal(total, 12596759 + 3286441619 + 9495417362 + 396704489 + 41366175 + 5000000)
})

// Replika penurunan periode berjalan di Dashboard.jsx.
const deriveMonth = (posted) => posted.reduce((m, j) => {
  const t = String(j.tanggal || '')
  if (!t.startsWith('2026-')) return m
  const n = Number(t.slice(5, 7))
  return Number.isFinite(n) && n > m ? n : m
}, 0) || 1

test('periode Dashboard mengikuti bulan jurnal posted terakhir', () => {
  const posted = [
    { status: 'posted', tanggal: '2026-04-30' },
    { status: 'posted', tanggal: '2026-08-28' },
    { status: 'posted', tanggal: '2026-07-31' },
  ]
  assert.equal(deriveMonth(posted), 8, 'harus Agustus, bukan April yang di-hardcode')
  assert.equal(deriveMonth([]), 1, 'buku kosong jatuh ke Januari, bukan NaN')
  assert.equal(deriveMonth([{ tanggal: '2025-12-31' }]), 1, 'tahun lain diabaikan')
})

test('modul Giro tidak pernah memakai 11108 (Bank BSI) sebagai akun giro', () => {
  const { akun, missing } = resolveGiroAccounts(COA)
  // Akun giro belum ada di COA Perumda -> harus dilaporkan kurang, bukan diarang.
  assert.equal(akun.giroMasukBelum, null)
  assert.equal(akun.giroKeluarBelum, null)
  assert.deepEqual(missing, ['Giro Masuk Belum Jatuh Tempo', 'Giro Keluar Belum Jatuh Tempo'])
  // Tidak satu pun akun yang ter-resolve boleh menunjuk 11108.
  for (const [key, v] of Object.entries(akun))
    assert.ok(!String(v || '').startsWith('11108'), `${key} tidak boleh menunjuk 11108 Bank BSI`)
})

test('akun baku giro diresolusi dari COA dengan nama yang benar', () => {
  const { akun } = resolveGiroAccounts(COA)
  assert.equal(akun.bank, '11103 - Bank Kalsel - 3204661684', 'nama harus diambil dari COA, bukan ditulis ulang')
  assert.equal(akun.piutang, '11201 - Piutang Usaha')
  assert.equal(akun.hutang, '21200 - Utang Usaha', '21101 tidak ada di COA; harus jatuh ke 21200')
})

test('kalau akun giro sudah dibuat, resolver memakainya', () => {
  // Kode contoh saja — penomorannya keputusan bagian keuangan.
  const coa = [...COA,
    { code: '11202', name: 'Giro Masuk Belum Jatuh Tempo' },
    { code: '21800', name: 'Giro Keluar Belum Jatuh Tempo' },
  ]
  const { akun, missing, misplaced } = resolveGiroAccounts(coa)
  assert.deepEqual(missing, [])
  assert.deepEqual(misplaced, [])
  assert.equal(akun.giroMasukBelum, '11202 - Giro Masuk Belum Jatuh Tempo')
  assert.equal(akun.giroKeluarBelum, '21800 - Giro Keluar Belum Jatuh Tempo')
})

test('akun giro di kelompok yang salah tidak dipakai (11109 akan terhitung sebagai kas)', () => {
  // Usulan rekap 22-09: Giro Masuk = 11109. Kelas 111 adalah Kas & Setara Kas
  // bagi Dashboard dan Arus Kas (isCashCode), jadi giro yang belum cair akan
  // dihitung sebagai uang di bank sejak DITERIMA.
  const coa = [...COA,
    { code: '11109', name: 'Giro Masuk Belum Jatuh Tempo' },
    { code: '31500', name: 'Giro Keluar Belum Jatuh Tempo' },
  ]
  assert.equal(isCashCode('11109'), true)
  const { akun, missing, misplaced } = resolveGiroAccounts(coa)
  assert.equal(akun.giroMasukBelum, null)
  assert.equal(akun.giroKeluarBelum, null)
  assert.deepEqual(missing, ['Giro Masuk Belum Jatuh Tempo', 'Giro Keluar Belum Jatuh Tempo'])
  assert.deepEqual(misplaced.map(m => [m.label, m.code]), [
    ['Giro Masuk Belum Jatuh Tempo', '11109'],
    ['Giro Keluar Belum Jatuh Tempo', '31500'],
  ])
  assert.ok(misplaced.every(m => m.hint), 'setiap penolakan menyebut kelompok yang benar')
})

test('setiap kunci di GIRO_ACCOUNT_SPEC punya label untuk pesan error', () => {
  for (const [k, spec] of Object.entries(GIRO_ACCOUNT_SPEC))
    assert.ok(spec.label && typeof spec.label === 'string', `${k} butuh label`)
})
