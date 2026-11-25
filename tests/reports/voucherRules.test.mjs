// Voucher rules shared by the Input Voucher form and the server (plan
// 2026-11-25, Task 2). Expected report lines are what the report rules
// (lraOutline.js, rkapRevisi2026.json, lrAlias.json) give today.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  VOUCHER_TYPES, sopSigner, needsSignatureTick, nextVoucherNo,
  lineDestination, buildVoucherJournal, voucherProblems,
} from '../../src/utils/voucherRules.js'

const COA = {
  '11101': 'Kas Kecil', '11104': 'Bank BNI', '11401': 'Persediaan Barang Dagang',
  '42001': 'Pendapatan Parkir', '61040': 'Beban Alat Tulis Kantor',
  '61060': 'Beban Konsumsi Rapat dan Tamu', '61090': 'Beban Perjalanan Dinas',
  '61131': 'Beban Penyusutan Gedung', '12201': 'Gedung Kantor',
}
const coaName = (c) => COA[c] || ''
const ctx = (over = {}) => ({
  coaCodes: new Set(Object.keys(COA)),
  coaName,
  subAkunByCode: new Map([
    ['61060', ['Beban Makan Minum Rapat', 'Beban Makan Minum Kunjungan Tamu/Sosialisasi Pedagang']],
    ['61040', ['Beban ATK']],
  ]),
  lockedPeriods: [], usedNos: [],
  ...over,
})
const KK = (over = {}) => ({
  voucher_type: 'KK', voucher_no: '0187', tanggal: '2027-01-14', cash_account: '11101',
  keterangan: 'Konsumsi dan ATK rapat koordinasi kepala pasar',
  lines: [
    { akun_code: '61060', sub_akun: 'Beban Makan Minum Rapat', keterangan: 'Konsumsi rapat koordinasi', jumlah: 1250000 },
    { akun_code: '61040', sub_akun: 'Beban ATK', keterangan: 'ATK rapat', jumlah: 350000 },
  ],
  ...over,
})

test('voucher types: cash side and Arus Kas type', () => {
  assert.deepEqual(Object.keys(VOUCHER_TYPES), ['KK', 'KM', 'BK', 'BM', 'JM'])
  assert.equal(VOUCHER_TYPES.KK.cashSide, 'kredit')
  assert.equal(VOUCHER_TYPES.BM.cashSide, 'debit')
  assert.equal(VOUCHER_TYPES.JM.cashSide, null)
  assert.equal(VOUCHER_TYPES.KK.label, 'Kas Keluar')
})

test('SOP signer by amount; the tick is needed from Rp 1 jt', () => {
  assert.equal(sopSigner(999999), 'Manajer')
  assert.equal(sopSigner(1000000), 'Direktur Umum & Keuangan')
  assert.equal(sopSigner(49999999), 'Direktur Umum & Keuangan')
  assert.equal(sopSigner(50000000), 'Direktur Utama')
  assert.equal(needsSignatureTick(999999), false)
  assert.equal(needsSignatureTick(1000000), true)
})

test('next No. Bukti: one running number per year, four digits', () => {
  assert.equal(nextVoucherNo([]), '0001')
  assert.equal(nextVoucherNo(['0186', '0187']), '0188')
  assert.equal(nextVoucherNo(['9', '0010', '999A']), '1000')
})

test('a line shows where it lands: LRA line, Laba Rugi line', () => {
  const d = lineDestination({ akun_code: '61060', akun_name: 'Beban Konsumsi Rapat dan Tamu', sub_akun: 'Beban Makan Minum Rapat', debit: 1250000 }, { tanggal: '2027-01-14' })
  assert.equal(d.lra.kategori, 'bebanUmum')
  assert.equal(d.lra.outline, '6.1')
  assert.equal(d.lra.nama, 'Makan Minum Rapat')
  assert.equal(d.lra.anggaran, 25000000)
  assert.equal(d.lr, 'Beban Konsumsi Rapat dan Tamu')
  assert.equal(d.need, null)
  assert.match(d.text, /^Masuk ke LRA Beban Umum 6\.1 Makan Minum Rapat · Laba Rugi: Beban Konsumsi Rapat dan Tamu$/)
})

test('Pendapatan Parkir in 2027 is LRA 1.9 and Pendapatan Bisnis Utama', () => {
  const d = lineDestination({ akun_code: '42001', akun_name: 'Pendapatan Parkir', kredit: 31850000 }, { tanggal: '2027-01-12' })
  assert.equal(d.lra.kategori, 'penerimaan')
  assert.equal(d.lra.outline, '1.9')
  assert.equal(d.lr, 'Pendapatan Bisnis Utama')
})

test('a purchase of 11401 asks for Kategori; GERAI is 4.2, BAPOK 4.1', () => {
  const base = { akun_code: '11401', akun_name: 'Persediaan Barang Dagang', debit: 4500000 }
  const none = lineDestination(base, { tanggal: '2027-01-14', counterCodes: ['11101'] })
  assert.equal(none.need, 'kategori')
  assert.match(none.text, /BAPOK → LRA Beban Operasional 4\.1/)
  assert.equal(lineDestination({ ...base, kategori: 'GERAI' }, { tanggal: '2027-01-14', counterCodes: ['11101'] }).lra.outline, '4.2')
  assert.equal(lineDestination({ ...base, kategori: 'BAPOK' }, { tanggal: '2027-01-14', counterCodes: ['11101'] }).lra.outline, '4.1')
})

test('a cash account shows its Neraca line', () => {
  const d = lineDestination({ akun_code: '11101', akun_name: 'Kas Kecil', kredit: 100 }, { tanggal: '2027-01-14' })
  assert.equal(d.lra, null)
  assert.equal(d.neraca, 'Kas Kecil - Kantor')
})

test('a KK voucher gets the cash leg and is a payment for Arus Kas', () => {
  const j = buildVoucherJournal(KK(), { coaName })
  const last = j.lines[j.lines.length - 1]
  assert.equal(last.akun_code, '11101')
  assert.equal(last.kredit, 1600000)
  assert.equal(j.debit, 1600000)
  assert.equal(j.kredit, 1600000)
  assert.equal(j.tipe_transaksi, 'pengeluaran')
  assert.equal(j.bukti, '0187')
  assert.equal(j.voucher_type, 'KK')
  assert.equal(j.voucher_year, 2027)
  assert.equal(j.akun_debit, '61060 Beban Konsumsi Rapat dan Tamu')
  assert.equal(j.akun_kredit, '11101 Kas Kecil')
  assert.equal(j.lines[0].akun_name, 'Beban Konsumsi Rapat dan Tamu')
})

test('a BM voucher debits the bank and is a receipt', () => {
  const j = buildVoucherJournal({ voucher_type: 'BM', voucher_no: '0181', tanggal: '2027-01-12', cash_account: '11104', keterangan: 'Setoran parkir minggu 2', lines: [{ akun_code: '42001', jumlah: 31850000 }] }, { coaName })
  assert.equal(j.lines[0].akun_code, '11104')
  assert.equal(j.lines[0].debit, 31850000)
  assert.equal(j.lines[1].kredit, 31850000)
  assert.equal(j.tipe_transaksi, 'pendapatan')
})

test('a cash-to-cash KK (deposit into the bank) balances and is a transfer', () => {
  const j = buildVoucherJournal({ voucher_type: 'KK', voucher_no: '0190', tanggal: '2027-01-15', cash_account: '11101', keterangan: 'Setor kas ke BNI', lines: [{ akun_code: '11104', jumlah: 1000000 }] }, { coaName })
  assert.equal(j.debit, j.kredit)
  assert.equal(j.tipe_transaksi, 'transfer')
})

test('a Memorial voucher keeps its own debit and kredit and is a transfer', () => {
  const j = buildVoucherJournal({ voucher_type: 'JM', voucher_no: '0191', tanggal: '2027-01-31', keterangan: 'Penyusutan gedung', lines: [{ akun_code: '61131', debit: 500000 }, { akun_code: '12201', kredit: 500000 }] }, { coaName })
  assert.equal(j.lines.length, 2)
  assert.equal(j.debit, 500000)
  assert.equal(j.kredit, 500000)
  assert.equal(j.tipe_transaksi, 'transfer')
  const withCash = buildVoucherJournal({ voucher_type: 'JM', voucher_no: '0192', tanggal: '2027-01-31', keterangan: 'Koreksi', lines: [{ akun_code: '11101', debit: 10 }, { akun_code: '61090', kredit: 10 }] }, { coaName })
  assert.equal(withCash.debit, withCash.kredit)
  assert.equal(withCash.tipe_transaksi, 'transfer')
})

test('a correct voucher has no problems', () => {
  assert.deepEqual(voucherProblems(KK(), ctx()), [])
})

test('the problems the form shows, with the exact words', () => {
  const p = voucherProblems(KK({
    tanggal: '2026-12-05',
    lines: [
      { akun_code: '61060', sub_akun: 'Beban Makan Minum Rapat', jumlah: 1250000 },
      { akun_code: '61040', sub_akun: '', jumlah: 350000 },
      { akun_code: '11401', jumlah: 4500000 },
    ],
  }), ctx({ lockedPeriods: ['2026-12'], usedNos: ['0186', '0187'] })).map(x => x.message)
  assert.deepEqual(p, [
    'No. Bukti 0187 sudah dipakai. Nomor berikutnya yang kosong: 0188.',
    'Tanggal 05/12/2026 masuk bulan Desember 2026, yang sudah dikunci.',
    'Baris 2: Sub Akun belum dipilih.',
    'Baris 3, 11401 Persediaan Barang Dagang: pilih Kategori, BAPOK atau GERAI.',
  ])
})

test('a Sub Akun that is not on the list is refused', () => {
  const p = voucherProblems(KK({ lines: [{ akun_code: '61060', sub_akun: 'Beban Makan Siang', jumlah: 100 }] }), ctx())
  assert.deepEqual(p.map(x => x.message), ['Baris 1: Sub Akun "Beban Makan Siang" belum ada di daftar. Minta SPV menambahkannya di Data Induk.'])
})

test('an unbalanced Memorial voucher and other blocking mistakes', () => {
  const jm = voucherProblems({ voucher_type: 'JM', voucher_no: '0193', tanggal: '2027-01-31', lines: [{ akun_code: '61131', debit: 550000 }, { akun_code: '12201', kredit: 500000 }] }, ctx())
  assert.deepEqual(jm.map(x => x.message), ['Debit dan kredit belum seimbang — selisih Rp 50.000.'])
  const bad = voucherProblems({ voucher_type: 'KK', voucher_no: '', tanggal: '', cash_account: '', lines: [{ akun_code: '99999', jumlah: 0 }] }, ctx()).map(x => x.message)
  assert.deepEqual(bad, [
    'No. Bukti belum diisi.',
    'Tanggal belum diisi.',
    'Pilih akun kas/bank.',
    'Baris 1: kode akun 99999 tidak ada di COA.',
    'Baris 1: jumlah harus lebih dari 0.',
  ])
  assert.deepEqual(voucherProblems({ voucher_type: 'KK', voucher_no: '0194', tanggal: '2027-01-14', cash_account: '11101', lines: [] }, ctx()).map(x => x.message), ['Voucher belum punya baris.'])
  assert.ok(voucherProblems(KK(), ctx()).every(x => x.blocking !== false))
})

test('daily bookkeeping starts on a date: earlier vouchers are refused (they are in Excel)', () => {
  const msg = 'Tanggal 20/11/2026 sebelum pembukuan harian dimulai (25/11/2026). Transaksi sebelum tanggal itu dicatat lewat Excel.'
  assert.deepEqual(voucherProblems(KK({ tanggal: '2026-11-20' }), ctx({ startDate: '2026-11-25' })).map(x => x.message), [msg])
  assert.deepEqual(voucherProblems(KK({ tanggal: '2026-11-20' }), ctx()).map(x => x.message), [msg], 'default start: 25 November 2026')
  assert.deepEqual(voucherProblems(KK({ tanggal: '2026-11-25' }), ctx()), [])
  assert.deepEqual(voucherProblems(KK({ tanggal: '2026-11-20' }), ctx({ startDate: '2026-11-01' })), [])
  const locked = voucherProblems(KK({ tanggal: '2026-10-15' }), ctx({ lockedPeriods: ['2026-10'] })).map(x => x.message)
  assert.deepEqual(locked, ['Tanggal 15/10/2026 masuk bulan Oktober 2026, yang sudah dikunci.'], 'a locked month says so, once')
})
