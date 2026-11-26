// Findings ("Hasil pemeriksaan") for a journal book: what the app could not
// interpret with certainty, listed at upload and behind the bell. Pinned to
// the October 2026 book (spec docs/superpowers/specs/2026-11-15-…-design.md §7).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { octoberJournals } from '../fixtures/octoberBook.mjs'
import { checkBook, findingsByMonth, FINDINGS_FROM } from '../../src/utils/journalChecks.js'

const closeTo = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`)
const byCheck = (findings, check) => findings.filter(f => f.check === check)

const line = (akun_code, debit, kredit, extra = {}) => ({ akun_code, akun_name: extra.name || akun_code, sub_akun: extra.sub || '', debit, kredit, keterangan: extra.ket || 'x', ...(extra.kategori ? { kategori: extra.kategori } : {}) })
const jr = (id, tanggal, bukti, lines, status = 'posted') => ({ id, tanggal, bukti, status, keterangan: lines[0].keterangan, debit: lines.reduce((s, l) => s + l.debit, 0), kredit: lines.reduce((s, l) => s + l.kredit, 0), lines })

// September-like earlier book: voucher numbers on 3 of 4, using every code of
// the October book except 11204 and 51003.
function earlierBook() {
  const codes = [...new Set(octoberJournals().flatMap(j => j.lines.map(l => l.akun_code)))].filter(c => c !== '11204' && c !== '51003')
  const out = codes.map((c, i) => jr(`XL-2026-09-U${String(i + 1).padStart(4, '0')}`, '2026-09-15', i % 4 === 3 ? '' : String(100 + i), [line(c, 1000, 0), line('11101', 0, 1000)]))
  return out
}
const COA = [...new Set(octoberJournals().flatMap(j => j.lines.map(l => l.akun_code)))].map(code => ({ code, name: code }))
const opts = (extra = {}) => ({ period: '2026-10', coa: COA, earlierJournals: earlierBook(), ...extra })

test('the book as uploaded on 10 November: voucher numbers missing', () => {
  const f = byCheck(checkBook(octoberJournals({ withBukti: false }), opts()), 'bukti-kosong')
  assert.equal(f.length, 1)
  assert.equal(f[0].severity, 'periksa')
  assert.match(f[0].detail, /0 dari 241/)
})

test('the book as uploaded: three Investasi payments without Kategori INV', () => {
  const f = byCheck(checkBook(octoberJournals({ withBukti: false }), opts()), 'inv-tanpa-kategori')
  assert.equal(f.length, 1)
  assert.equal(f[0].rows.length, 3)
  closeTo(f[0].amount, 74569850, 0.005, 'pembayaran 21500')
})

test('the lampiran book: no voucher or Investasi findings, two Kategori values the app does not read', () => {
  const all = checkBook(octoberJournals(), opts())
  assert.equal(byCheck(all, 'bukti-kosong').length, 0)
  assert.equal(byCheck(all, 'inv-tanpa-kategori').length, 0)
  const values = byCheck(all, 'kategori-asing').map(f => f.value).sort()
  assert.deepEqual(values, ['1.5 E PASAR MALABAR', '1.5 F PASAR HARUM MANIS'])
})

test('reclasses without a cash leg: receivables 23.471.435 and fixed assets 87.953.600', () => {
  for (const withBukti of [true, false]) {
    const f = byCheck(checkBook(octoberJournals({ withBukti }), opts()), 'reklasifikasi')
    const amounts = f.map(x => x.amount).sort((a, b) => a - b)
    assert.deepEqual(amounts, [23471435, 87953600], `withBukti=${withBukti}`)
  }
})

test('a credit to an expense account (SPPD refund 222.192) is listed', () => {
  const f = byCheck(checkBook(octoberJournals(), opts()), 'koreksi-beban')
  assert.equal(f.length, 1)
  closeTo(f[0].amount, 222192, 0.005, 'refund')
  assert.equal(f[0].severity, 'info')
})

test('accounts used for the first time: 11204 and 51003', () => {
  const f = byCheck(checkBook(octoberJournals(), opts()), 'akun-baru')
  assert.deepEqual(f.map(x => x.value).sort(), ['11204', '51003'])
  assert.ok(f.every(x => x.severity === 'info'), 'both have a report line')
})

test('an account with no Neraca line is periksa', () => {
  const book = [jr('XL-2026-10-U0001', '2026-10-02', '001', [line('11999', 500, 0), line('11101', 0, 500)])]
  const f = byCheck(checkBook(book, { period: '2026-10', coa: [{ code: '11999' }, { code: '11101' }], earlierJournals: earlierBook() }), 'akun-baru')
  assert.equal(f.length, 1)
  assert.equal(f[0].severity, 'periksa')
})

test('a sub akun no rule knows on a header account names the line it falls on', () => {
  const book = [...octoberJournals(), jr('XL-2026-10-U0999', '2026-10-30', '999', [line('11104', 5000000, 0), line('41000', 0, 5000000, { sub: 'Pendapatan Contoh Baru' })])]
  const f = byCheck(checkBook(book, opts({ coa: [...COA, { code: '41000' }] })), 'subakun-asing')
  assert.equal(f.length, 1)
  assert.equal(f[0].value, '41000 > Pendapatan Contoh Baru')
  assert.match(f[0].detail, /1\.1/)
  assert.equal(byCheck(checkBook(octoberJournals(), opts()), 'subakun-asing').length, 0, 'every October sub akun is known (Parkir included)')
})

test('a code missing from the COA is salah', () => {
  const f = byCheck(checkBook(octoberJournals(), opts({ coa: COA.filter(a => a.code !== '11204') })), 'akun-tak-dikenal')
  assert.equal(f.length, 1)
  assert.equal(f[0].severity, 'salah')
  assert.equal(f[0].value, '11204')
})

test('lampiran LRA rows whose figures do not add up (Investasi 1.3 Oktober)', () => {
  const lra = { bebanInvestasi: [
    { outline: '1.3', nama: 'Perbaikan dan Pengadaan Sarana Pengelolaan Pasar', sdBlnLalu: 806670830, bulanIni: 32517350, realisasi: 902971430 },
    { outline: '1.3.2', nama: 'b. APAR', sdBlnLalu: 0, bulanIni: 0, realisasi: 0 },
    { outline: '1.3.3', nama: 'c. Bak/Kontainer', sdBlnLalu: 177000000, bulanIni: 0, realisasi: 177000000 },
    { outline: '1.3.4', nama: 'd. CCTV', sdBlnLalu: 132216000, bulanIni: 0, realisasi: 132216000 },
    { outline: '1.3.5', nama: 'e. Papan Nama', sdBlnLalu: 63783250, bulanIni: 24170350, realisasi: 87953600 },
    { outline: '1.3.6', nama: 'f. Instalasi Listrik', sdBlnLalu: 497454830, bulanIni: 8347000, realisasi: 505801830 },
  ] }
  const f = byCheck(checkBook([], { period: '2026-10', lra }), 'lampiran-tidak-jumlah')
  assert.equal(f.length, 1, 'one finding for line 1.3')
  assert.match(f[0].detail, /1\.3/)
  assert.equal(f[0].severity, 'periksa')
})

test('a lampiran group heading without figures is not checked against its rows', () => {
  const lra = { bebanOperasional: [
    { outline: '1.1', nama: 'Pemeliharaan Kendaraan Operasional', sdBlnLalu: 0, bulanIni: 0, realisasi: 0 },
    { outline: '1.1.1', nama: 'Pajak Mobil Operasional', sdBlnLalu: 0, bulanIni: 0, realisasi: 0 },
    { outline: '1.1.3', nama: 'Pemeliharaan Mobil Truck', sdBlnLalu: 97131826, bulanIni: 10973800, realisasi: 108105626 },
  ] }
  assert.deepEqual(checkBook([], { period: '2026-10', lra }), [])
})

test('an unknown Sub Akun whose lines net to zero still shows the amounts moved', () => {
  const book = [jr('XL-2026-08-U0001', '2026-08-17', '001', [line('80000', 5020000, 0, { sub: 'Beban Lain lain' }), line('11101', 0, 5020000)]),
    jr('XL-2026-08-U0002', '2026-08-18', '002', [line('11101', 5020000, 0), line('80000', 0, 5020000, { sub: 'Beban Lain lain' })])]
  const f = byCheck(checkBook(book, { period: '2026-08' }), 'subakun-asing')[0]
  assert.equal(f.amount, 10040000)
  assert.match(f.detail, /5\.020\.000/)
})

test('a clean book and an empty book list nothing', () => {
  const clean = [jr('XL-2026-10-U0001', '2026-10-02', '001', [line('61040', 228000, 0, { ket: 'ATK' }), line('11101', 0, 228000, { ket: 'ATK' })])]
  const earlier = [jr('XL-2026-09-U0001', '2026-09-02', '001', [line('61040', 1, 0), line('11101', 0, 1)])]
  const coa = [{ code: '61040' }, { code: '11101' }]
  assert.deepEqual(checkBook(clean, { period: '2026-10', coa, earlierJournals: earlier }), [])
  assert.deepEqual(checkBook([], { period: '2026-10', coa, earlierJournals: earlier }), [])
})

test('the acknowledgement key changes when the amount changes', () => {
  const a = byCheck(checkBook(octoberJournals(), opts()), 'koreksi-beban')[0]
  const book = octoberJournals()
  const j = book.find(x => x.lines.some(l => l.akun_code === '61090' && l.kredit === 222192))
  j.lines = j.lines.map(l => (l.kredit === 222192 ? { ...l, kredit: 222000 } : l.debit === 222192 ? { ...l, debit: 222000 } : l))
  const b = byCheck(checkBook(book, opts()), 'koreksi-beban')[0]
  assert.notEqual(a.key, b.key)
})

test('findingsByMonth: from June 2026, app-form journals do not count as a book without voucher numbers, pending listed', () => {
  assert.equal(FINDINGS_FROM, '2026-06')
  const may = jr('XL-2026-05-0001', '2026-05-10', '', [line('61040', 1, 0), line('11101', 0, 1)])
  const book = [1, 2, 3].map(i => jr(`JV-2026-11-U000${i}`, '2026-11-0' + i, String(i), [line('61040', 10, 0), line('11101', 0, 10)]))
  const form = jr('JV-2026-301', '2026-11-20', '', [line('61040', 99, 0), line('11101', 0, 99)], 'pending')
  const res = findingsByMonth([may, ...earlierBook(), ...book, form], { coa: [...COA, { code: '61040' }] })
  assert.ok(!('2026-05' in res), 'May is not checked')
  const nov = res['2026-11'] || []
  assert.equal(byCheck(nov, 'bukti-kosong').length, 0)
  const pend = byCheck(nov, 'belum-approve')
  assert.equal(pend.length, 1)
  assert.equal(pend[0].rows.length, 1)
})

// ── Vouchers typed in the app (plan 2026-11-25, Task 12) ─────────────────────
const vc = (no, tanggal, status, amount, extra = {}) => ({
  id: `VC-2026-${no}`, tanggal, bukti: no, voucher_no: no, voucher_type: 'KK', status,
  keterangan: extra.ket || 'Belanja', debit: amount, kredit: amount, sop_signed: extra.signed ? 1 : 0,
  lines: [line('61040', amount, 0, { sub: 'Beban ATK' }), line('11101', 0, amount)],
})
const vOpts = { period: '2026-11', coa: COA.concat([{ code: '61040' }, { code: '11101' }]), today: '2026-11-30' }

test('a missing number in the run of vouchers is info: "Nomor bukti 0176 tidak ada"', () => {
  const f = byCheck(checkBook([vc('0175', '2026-11-25', 'posted', 1000), vc('0177', '2026-11-26', 'posted', 1000)], vOpts), 'voucher-terlewat')
  assert.equal(f.length, 1)
  assert.equal(f[0].severity, 'info')
  assert.equal(f[0].title, 'Nomor bukti 0176 tidak ada')
})

test('a No. Bukti used twice is wrong', () => {
  const f = byCheck(checkBook([vc('0180', '2026-11-25', 'posted', 1000), { ...vc('0180', '2026-11-26', 'posted', 2000), id: 'VC-2026-x' }], vOpts), 'voucher-ganda')
  assert.equal(f.length, 1)
  assert.equal(f[0].severity, 'salah')
  assert.equal(f[0].title, 'No. Bukti 0180 dipakai 2 kali')
})

test('a submitted voucher from Rp 1 jt without the signature tick is to check', () => {
  const f = byCheck(checkBook([vc('0184', '2026-11-26', 'pending', 62500000), vc('0185', '2026-11-26', 'pending', 4500000, { signed: true })], vOpts), 'ttd-belum')
  assert.equal(f.length, 1)
  assert.equal(f[0].severity, 'periksa')
  assert.equal(f[0].title, 'Tanda tangan belum dikonfirmasi')
  assert.equal(f[0].rowCount, 1)
})

test('a draft older than three days is info', () => {
  const f = byCheck(checkBook([vc('0168', '2026-11-25', 'draft', 1000), vc('0190', '2026-11-29', 'draft', 1000)], vOpts), 'draf-lama')
  assert.equal(f.length, 1)
  assert.equal(f[0].severity, 'info')
  assert.equal(f[0].title, 'Draf 0168 belum diajukan sejak 25 Nov 2026')
})

test('vouchers approved by the person who entered them: one info finding for the month (owner, 26 Nov 2026)', () => {
  const by = (j, created, approved) => ({ ...j, created_by: created, approved_by: approved })
  const f = byCheck(checkBook([
    by(vc('0191', '2026-11-26', 'posted', 1000), 'spv_akuntansi', 'spv_akuntansi'),
    by(vc('0192', '2026-11-27', 'posted', 2500), 'spv_akuntansi', 'spv_akuntansi'),
    by(vc('0193', '2026-11-27', 'posted', 9000), 'staff_keuangan', 'spv_akuntansi'),
    by(vc('0194', '2026-11-28', 'pending', 7000), 'spv_akuntansi', null),
  ], vOpts), 'disetujui-sendiri')
  assert.equal(f.length, 1)
  assert.equal(f[0].severity, 'info')
  assert.equal(f[0].title, '2 voucher disetujui oleh penginputnya sendiri')
  assert.equal(f[0].rowCount, 2)
  assert.deepEqual(f[0].rows.map(r => r.bukti), ['0191', '0192'])
  assert.equal(byCheck(checkBook([by(vc('0195', '2026-11-26', 'posted', 1000), 'staff_keuangan', 'spv_akuntansi')], vOpts), 'disetujui-sendiri').length, 0)
})

test('vouchers waiting point to Persetujuan; drafts are not "belum di-approve"', () => {
  const f = byCheck(checkBook([vc('0186', '2026-11-27', 'pending', 3946880, { signed: true }), vc('0187', '2026-11-29', 'draft', 1000)], { ...vOpts, includePending: true }), 'belum-approve')
  assert.equal(f.length, 1)
  assert.equal(f[0].title, '1 jurnal belum di-approve')
  assert.match(f[0].action, /Persetujuan/)
})
