// voucherRules.js — daily bookkeeping vouchers: types, the report line a voucher
// line lands on, the journal a voucher posts, and the problems that block it.
//
// Pure functions, shared by the Input Voucher form (immediate feedback) and the
// server (/api/book/vouchers, which loads this module with import()) so both
// refuse exactly the same things. The report line comes from the same rules
// the reports use (lraOutline.js, rkapRevisi2026.json, lrAlias.json,
// reconcileAlias.json): what the form shows is what the LRA will show.
// Spec: docs/superpowers/specs/2026-11-25-daily-bookkeeping-plan.md §5.3, §5.11.
import {
  resolveOutline, resolveWithSubPriority, cashBasisPokokOutline, categoryKeyForCode,
  lrRevenueGroup, rkapVersion, isOutOfScopeRevenue, investasiLegOutline,
  effectiveSubCode, reportLineAccount,
} from './lraOutline.js'
import { yearOf } from './bookYear.js'
import RKAP_ROWS from '../data/rkapRevisi2026.json' with { type: 'json' }
import LR_ALIAS from './lrAlias.json' with { type: 'json' }
import NERACA_ALIAS from './reconcileAlias.json' with { type: 'json' }

/** Voucher types: the side the cash/bank account takes and the Arus Kas type. */
export const VOUCHER_TYPES = {
  KK: { label: 'Kas Keluar', cashSide: 'kredit', bank: false, tipe: 'pengeluaran' },
  KM: { label: 'Kas Masuk', cashSide: 'debit', bank: false, tipe: 'pendapatan' },
  BK: { label: 'Bank Keluar', cashSide: 'kredit', bank: true, tipe: 'pengeluaran' },
  BM: { label: 'Bank Masuk', cashSide: 'debit', bank: true, tipe: 'pendapatan' },
  JM: { label: 'Memorial', cashSide: null, bank: false, tipe: 'transfer' },
}

const SIGN_MANAGER_BELOW = 1_000_000
const SIGN_DIRUT_FROM = 50_000_000

/** Who signs the paper voucher under the SOP (Pembayaran Barang & Jasa). */
export function sopSigner(amount) {
  const a = Number(amount) || 0
  if (a < SIGN_MANAGER_BELOW) return 'Manajer'
  if (a < SIGN_DIRUT_FROM) return 'Direktur Umum & Keuangan'
  return 'Direktur Utama'
}

/** From Rp 1 jt a director signs: the "sudah ditandatangani" tick is required. */
export function needsSignatureTick(amount) {
  return (Number(amount) || 0) >= SIGN_MANAGER_BELOW
}

/** The next free running number (four digits) after the numbers in use. */
export function nextVoucherNo(usedNos) {
  let max = 0
  for (const n of usedNos || []) {
    const v = parseInt(String(n || '').replace(/^\D+/, ''), 10)
    if (Number.isFinite(v) && v > max) max = v
  }
  return String(max + 1).padStart(4, '0')
}

/** Kas and bank accounts (11105 is a short-term investment, not cash). */
export const isCashCode = (code) => /^111/.test(String(code || '')) && String(code) !== '11105'

// Purchases whose Beban Pokok line (4.1 or 4.2 Gerai Inflasi) only the
// Kategori decides (lraOutline.cashBasisPokokOutline): the form asks.
const POKOK_KATEGORI_CODES = new Set(['11401', '11402', '51000', '51001'])

const KATEGORI_LABEL = {
  penerimaan: 'Penerimaan', bebanUmum: 'Beban Umum', bebanOperasional: 'Beban Operasional',
  bebanInvestasi: 'Investasi', bebanLainnya: 'Beban Lain-lain',
}
const KATEGORI_TEXT = 'Pilih Kategori: BAPOK → LRA Beban Operasional 4.1 · GERAI → LRA Beban Operasional 4.2.'

function lrLineOf(code, tanggal) {
  const c = String(code || '')
  const grp = lrRevenueGroup(c, tanggal)
  if (grp) return LR_ALIAS[grp] || null
  for (let n = c.length; n >= 2; n--) {
    const hit = LR_ALIAS[c.slice(0, n)]
    if (hit) return hit
  }
  return null
}

/**
 * Where one voucher line lands in the reports.
 * @param line { akun_code, akun_name, sub_akun, kategori, keterangan, debit, kredit }
 * @param opts.tanggal 'YYYY-MM-DD'; opts.counterCodes the voucher's other account codes
 * @returns { lra: {kategori, outline, nama, anggaran}|null, lr, neraca, need: null|'kategori', text }
 */
export function lineDestination(line, { tanggal = '', counterCodes = [] } = {}) {
  const code = String((line && line.akun_code) || '').trim()
  const name = String((line && line.akun_name) || '').trim()
  const sub = String((line && line.sub_akun) || '').trim()
  const desc = String((line && line.keterangan) || '').trim()
  const kat = String((line && line.kategori) || '').trim().toUpperCase()
  const isDebit = (Number(line && line.debit) || 0) > 0
  const year = yearOf(tanggal) || 2026
  const month = parseInt(String(tanggal).slice(5, 7), 10) || 1
  const rkap = rkapVersion([month], year)

  // The account the reports read: a group code named in its Sub Akun
  // (41000 > Pendapatan Parkir → 42001), then report-only reroutes.
  // As expandJournals: report reroutes on the booked account first (they
  // include the Sub Akun overrides from Data Induk), else the group code read
  // through its Sub Akun.
  const moved = reportLineAccount(code, sub, desc, tanggal)
  const eff = moved ? moved.code : (effectiveSubCode(code, sub) || code)

  let lra = null
  let need = null
  if (POKOK_KATEGORI_CODES.has(eff) && isDebit) {
    if (kat !== 'BAPOK' && kat !== 'GERAI') need = 'kategori'
    else {
      const o = cashBasisPokokOutline(eff, { _kategori: kat, _counterCodes: counterCodes })
      if (o) lra = { kategori: 'bebanOperasional', outline: o }
    }
  } else if (/^51/.test(eff) && isDebit) {
    const o = cashBasisPokokOutline(eff, { _kategori: kat, _counterCodes: counterCodes })
    if (o) lra = { kategori: 'bebanOperasional', outline: o }
  } else if (/^[47]/.test(eff)) {
    if (!isOutOfScopeRevenue(eff)) {
      const o = resolveOutline(eff, `${sub} ${desc}`.trim(), rkap)
      if (o) lra = { kategori: 'penerimaan', outline: o }
    }
  } else if (/^1[23]/.test(eff) || eff === '21500') {
    const o = investasiLegOutline(eff, desc, rkap, { tanggal, _journalCodes: [...counterCodes, code], _kategori: kat })
    if (o) lra = { kategori: 'bebanInvestasi', outline: o }
  } else if (/^[68]/.test(eff)) {
    const acct = sub ? `${eff} - ${name} > ${sub}` : `${eff} - ${name}`
    const o = resolveWithSubPriority(resolveOutline, eff, acct, desc, rkap)
    const k = categoryKeyForCode(eff)
    if (o && k) lra = { kategori: k, outline: o }
  }
  if (lra) {
    const row = (RKAP_ROWS[lra.kategori] || []).find(r => r.outline === lra.outline)
    lra.nama = row ? row.nama : null
    lra.anggaran = row ? row.anggaran : null
  }

  const lr = /^[45678]/.test(eff) ? lrLineOf(eff, tanggal) : null
  const neraca = /^[123]/.test(code) ? (NERACA_ALIAS[code] || null) : null

  let text = ''
  if (need === 'kategori') text = KATEGORI_TEXT
  else if (lra) {
    text = `Masuk ke LRA ${KATEGORI_LABEL[lra.kategori] || lra.kategori} ${lra.outline}${lra.nama ? ` ${lra.nama}` : ''}`
    if (lr) text += ` · Laba Rugi: ${lr}`
  } else if (lr) text = `Laba Rugi: ${lr} · tidak masuk LRA`
  else if (neraca) text = `Neraca: ${neraca}`
  return { lra, lr, neraca, need, text }
}

const num = (n) => Number(n) || 0
const round2 = (n) => Math.round(n * 100) / 100

/**
 * The journal a voucher posts: the lines as typed plus, for Kas/Bank vouchers,
 * the cash/bank line for the total. `coaName(code)` gives account names.
 */
export function buildVoucherJournal(v, { coaName = () => '' } = {}) {
  const type = VOUCHER_TYPES[v.voucher_type] || VOUCHER_TYPES.JM
  const nameOf = (code, fallback) => coaName(String(code)) || fallback || ''
  const ket = v.keterangan || ''
  const mapLine = (l, debit, kredit) => ({
    akun_code: String(l.akun_code || '').trim(),
    akun_name: nameOf(l.akun_code, l.akun_name),
    sub_akun: l.sub_akun || '',
    debit, kredit,
    keterangan: l.keterangan || ket,
    ...(l.kategori ? { kategori: String(l.kategori).toUpperCase() } : {}),
  })
  let lines
  let tipe = type.tipe
  if (type.cashSide) {
    const typed = (v.lines || []).map(l => {
      const a = num(l.jumlah)
      return type.cashSide === 'kredit' ? mapLine(l, a, 0) : mapLine(l, 0, a)
    })
    const total = round2(typed.reduce((s, l) => s + l.debit + l.kredit, 0))
    const cash = {
      akun_code: String(v.cash_account || ''), akun_name: nameOf(v.cash_account), sub_akun: '',
      debit: type.cashSide === 'debit' ? total : 0, kredit: type.cashSide === 'kredit' ? total : 0,
      keterangan: ket,
    }
    lines = type.cashSide === 'debit' ? [cash, ...typed] : [...typed, cash]
    if (typed.length && typed.every(l => isCashCode(l.akun_code))) tipe = 'transfer'
  } else {
    lines = (v.lines || []).map(l => mapLine(l, num(l.debit), num(l.kredit)))
  }
  const debit = round2(lines.reduce((s, l) => s + l.debit, 0))
  const kredit = round2(lines.reduce((s, l) => s + l.kredit, 0))
  const firstD = lines.find(l => l.debit > 0)
  const firstK = lines.find(l => l.kredit > 0)
  const label = (l) => (l ? [l.akun_code, l.akun_name].filter(Boolean).join(' ') : '')
  return {
    tanggal: v.tanggal,
    keterangan: ket || ((lines.find(l => l.keterangan) || {}).keterangan || ''),
    bukti: String(v.voucher_no || '').trim(),
    debit, kredit,
    akun_debit: label(firstD), akun_kredit: label(firstK),
    lines,
    tipe_transaksi: tipe,
    voucher_type: v.voucher_type,
    voucher_no: String(v.voucher_no || '').trim(),
    voucher_year: yearOf(v.tanggal),
    party: v.party || '',
    cash_account: type.cashSide ? String(v.cash_account || '') : null,
    sop_signed: v.sop_signed ? 1 : 0,
  }
}

const BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const rupiah = (n) => Math.round(n).toLocaleString('id-ID')

/**
 * Everything that blocks saving or submitting a voucher, in the words the
 * form shows (spec §5.11). [] when the voucher can go.
 * @param ctx.coaCodes Set of posting codes; ctx.coaName(code) → name
 * @param ctx.subAkunByCode Map code → [Sub Akun names on the list]
 * @param ctx.lockedPeriods ['YYYY-MM']; ctx.usedNos other vouchers' numbers this year
 */
export function voucherProblems(v, { coaCodes = new Set(), coaName = () => '', subAkunByCode = new Map(), lockedPeriods = [], usedNos = [] } = {}) {
  const out = []
  const add = (field, message, line) => out.push({ field, ...(line ? { line } : {}), message, blocking: true })
  const type = VOUCHER_TYPES[v.voucher_type] || VOUCHER_TYPES.JM
  const no = String(v.voucher_no || '').trim()
  if (!no) add('voucher_no', 'No. Bukti belum diisi.')
  else if ((usedNos || []).some(u => String(u || '').trim() === no)) {
    add('voucher_no', `No. Bukti ${no} sudah dipakai. Nomor berikutnya yang kosong: ${nextVoucherNo(usedNos)}.`)
  }
  const tg = String(v.tanggal || '')
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tg)
  if (!m) add('tanggal', 'Tanggal belum diisi.')
  else if ((lockedPeriods || []).includes(`${m[1]}-${m[2]}`)) {
    add('tanggal', `Tanggal ${m[3]}/${m[2]}/${m[1]} masuk bulan ${BULAN[Number(m[2])]} ${m[1]}, yang sudah dikunci.`)
  }
  if (type.cashSide) {
    const cash = String(v.cash_account || '').trim()
    if (!cash) add('cash_account', 'Pilih akun kas/bank.')
    else if (!coaCodes.has(cash)) add('cash_account', `Akun kas/bank ${cash} tidak ada di COA.`)
  }
  const lines = v.lines || []
  if (!lines.length) add('lines', 'Voucher belum punya baris.')
  const counterCodes = [v.cash_account, ...lines.map(l => l.akun_code)].filter(Boolean).map(String)
  lines.forEach((l, i) => {
    const n = i + 1
    const code = String(l.akun_code || '').trim()
    if (!code) { add('line', `Baris ${n}: akun belum dipilih.`, n); return }
    const known = coaCodes.has(code)
    if (!known) add('line', `Baris ${n}: kode akun ${code} tidak ada di COA.`, n)
    const amount = type.cashSide ? num(l.jumlah) : Math.max(num(l.debit), num(l.kredit))
    if (!(amount > 0)) add('line', `Baris ${n}: jumlah harus lebih dari 0.`, n)
    if (!known) return
    const name = coaName(code) || l.akun_name || ''
    const sub = String(l.sub_akun || '').trim()
    const list = subAkunByCode.get(code) || []
    // The Sub Akun decides the report line of a group account: while it is
    // missing or unknown, "no report line" would only repeat the same problem.
    let subProblem = false
    if (sub && !list.includes(sub)) { subProblem = true; add('line', `Baris ${n}: Sub Akun "${sub}" belum ada di daftar. Minta SPV menambahkannya di Data Induk.`, n) }
    else if (!sub && list.length) { subProblem = true; add('line', `Baris ${n}: Sub Akun belum dipilih.`, n) }
    const side = type.cashSide === 'kredit' ? { debit: amount, kredit: 0 }
      : type.cashSide === 'debit' ? { debit: 0, kredit: amount }
      : { debit: num(l.debit), kredit: num(l.kredit) }
    const d = lineDestination({ ...l, akun_name: name, ...side }, { tanggal: tg, counterCodes: counterCodes.filter(c => c !== code) })
    if (d.need === 'kategori') add('line', `Baris ${n}, ${code} ${name}: pilih Kategori, BAPOK atau GERAI.`, n)
    else if (!subProblem && type.cashSide && /^[45678]/.test(code) && !d.lra && !isOutOfScopeRevenue(code)) {
      add('line', `Baris ${n}: ${code} ${name} belum punya baris laporan.`, n)
    }
  })
  if (!type.cashSide && lines.length) {
    const diff = lines.reduce((s, l) => s + num(l.debit) - num(l.kredit), 0)
    if (Math.abs(diff) > 0.005) add('lines', `Debit dan kredit belum seimbang — selisih Rp ${rupiah(Math.abs(diff))}.`)
  }
  return out
}
