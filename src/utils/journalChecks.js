// journalChecks.js — "Hasil pemeriksaan" for a journal book.
//
// The reports read every posting line through fixed rules (lraOutline.js,
// reportDelta.js). When a line does not fit a rule they fall back without a
// word: an unknown Sub Akun lands on a default line, a Kategori value is
// ignored, a voucher split by missing numbers escapes the Investasi rule. The
// October 2026 trial differences all came from such lines. These checks list
// them — at upload (import dialog) and afterwards per month (bell, Cek
// Konsistensi) — with the rows, the amount and what to do.
//
// Pure functions: no state, no I/O. A finding's `key` includes its amount, so
// an acknowledgement ("sudah dicek") lapses when the rows change.
// Spec: docs/superpowers/specs/2026-11-15-trial-differences-and-notifications-design.md §7.

import { parseJournalLines } from './journalExpand.js'
import {
  explainSubAkun, resolveOutline, rkapVersion, isInvestasiVoucher, INVESTASI_CASH_FROM, AUC_CODE,
} from './lraOutline.js'
import { needsSignatureTick } from './voucherRules.js'
import { formatTanggal } from './workingMonth.js'
import { formatRupiah } from '../data/sampleData.js'
import neracaAlias from './reconcileAlias.json' with { type: 'json' }

/** First month the bell and Cek Konsistensi check (January–May are audited backfill). */
export const FINDINGS_FROM = '2026-06'

/** Severity, worst first. Only `salah` and `periksa` count on the bell. */
export const SEVERITY_ORDER = ['salah', 'periksa', 'info']

const MONTHS_ID = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
export const monthLabel = (period) => {
  const [y, m] = String(period || '').split('-')
  return `${MONTHS_ID[parseInt(m, 10)] || ''} ${y || ''}`.trim()
}

const KATEGORI_NAMES = { penerimaan: 'Penerimaan', bebanUmum: 'Beban Umum', bebanOperasional: 'Beban Operasional', bebanInvestasi: 'Investasi' }
const UNDERSTOOD_KATEGORI = /\b(BAPOK|GERAI|INV)\b/i
const BOOK_ID_RE = /^(XL|JV)-\d{4}-\d{2}-U\d+$/i
const MAX_ROWS = 50

/** A journal of a monthly book (uploaded), not one typed in the app's form. */
const isBookJournal = (j) => !j || !j.id || BOOK_ID_RE.test(String(j.id))
const amt = (n) => Math.round((Number(n) || 0) * 100) / 100
const linesOf = (j) => (parseJournalLines(j) || []).map(l => ({
  code: String(l.akun_code == null ? '' : l.akun_code).trim(),
  name: String(l.akun_name || '').trim(),
  sub: String(l.sub_akun || '').trim(),
  debit: Number(l.debit) || 0,
  kredit: Number(l.kredit) || 0,
  keterangan: String(l.keterangan || j.keterangan || '').trim(),
  kategori: String(l.kategori || '').trim(),
}))
const rowOf = (j, l) => ({
  tanggal: j.tanggal || '', bukti: String(j.bukti || '').trim(),
  akun: [l.code, l.name].filter(Boolean).join(' ') + (l.sub && l.sub !== l.name ? ` > ${l.sub}` : ''),
  debit: l.debit, kredit: l.kredit, keterangan: l.keterangan,
})

function finding(f) {
  return { amount: null, rows: [], value: null, ...f, rows: (f.rows || []).slice(0, MAX_ROWS), rowCount: (f.rows || []).length }
}

function bookStats(journals) {
  const book = (journals || []).filter(isBookJournal)
  return { total: book.length, withBukti: book.filter(j => String(j.bukti || '').trim()).length }
}

// The latest earlier month that holds a book (≥ 5 book journals).
function previousBook(earlierJournals, period) {
  const byMonth = {}
  for (const j of earlierJournals || []) {
    const ym = String(j.tanggal || '').slice(0, 7)
    if (ym && ym < period) (byMonth[ym] = byMonth[ym] || []).push(j)
  }
  const months = Object.keys(byMonth).sort().reverse()
  for (const ym of months) {
    const st = bookStats(byMonth[ym])
    if (st.total >= 5) return { period: ym, ...st }
  }
  return null
}

function checkBukti(journals, period, earlierJournals) {
  const st = bookStats(journals)
  if (st.total < 5) return []
  const prev = previousBook(earlierJournals, period)
  const ratio = st.withBukti / st.total
  if (!(st.withBukti === 0 || (ratio < 0.5 && prev && prev.withBukti / prev.total > 0.5))) return []
  const prevText = prev ? ` (${monthLabel(prev.period)}: ${prev.withBukti} dari ${prev.total})` : ''
  return [finding({
    key: `bukti-kosong:${period}:${st.withBukti}/${st.total}`, check: 'bukti-kosong', severity: 'periksa',
    title: 'Nomor voucher kosong',
    detail: `${st.withBukti} dari ${st.total} jurnal punya nomor voucher${prevText}. Tanpa nomor voucher, baris-baris satu voucher terpisah menjadi beberapa jurnal, sehingga aturan yang membaca satu voucher utuh (pembayaran investasi 21500, Kategori) tidak berjalan.`,
    action: 'Isi nomor voucher di sheet JURNAL (kolom sesudah Tgl), lalu unggah ulang bulan ini.',
  })]
}

function checkInvestasiPayments(journals, period) {
  if (period < INVESTASI_CASH_FROM) return []
  const rows = []; let total = 0
  for (const j of journals) {
    const lines = linesOf(j)
    const codes = lines.map(l => l.code).filter(Boolean)
    if (!lines.some(l => /^111/.test(l.code) && l.kredit)) continue
    for (const l of lines) {
      if (l.code !== '21500' || !l.debit) continue
      if (isInvestasiVoucher({ _journalCodes: codes, _kategori: l.kategori })) continue
      rows.push(rowOf(j, l)); total += l.debit
    }
  }
  if (!rows.length) return []
  return [finding({
    key: `inv-tanpa-kategori:${period}:${rows.length}:${amt(total)}`, check: 'inv-tanpa-kategori', severity: 'periksa',
    title: 'Pembayaran Biaya yang Masih Harus Dibayar (21500) tanpa tanda investasi',
    detail: `${rows.length} pembayaran 21500 dari kas/bank sebesar ${formatRupiah(total)} tidak dihitung di LRA Investasi: vouchernya tidak memuat akun aset investasi dan Kategori-nya bukan INV.`,
    action: 'Bila pembayaran ini untuk proyek investasi, isi Kategori INV atau satukan dengan voucher pengakuan asetnya (nomor voucher sama). Bila bukan, tandai sudah dicek.',
    amount: total, rows,
  })]
}

function checkKategori(journals, period) {
  const odd = {}, pokok = []; let pokokTotal = 0
  for (const j of journals) {
    for (const l of linesOf(j)) {
      if (l.kategori && !UNDERSTOOD_KATEGORI.test(l.kategori)) {
        const v = l.kategori.toUpperCase()
        ;(odd[v] = odd[v] || []).push(rowOf(j, l))
      }
      if (period >= '2026-09' && !l.kategori && l.debit && (l.code === '11401' || l.code === '11402')) {
        pokok.push(rowOf(j, l)); pokokTotal += l.debit
      }
    }
  }
  const out = Object.entries(odd).map(([v, rows]) => finding({
    key: `kategori-asing:${v}:${rows.length}`, check: 'kategori-asing', severity: 'periksa', value: v,
    title: `Kategori "${v}" tidak dibaca aplikasi`,
    detail: `Aplikasi hanya membaca BAPOK, GERAI dan INV di kolom Kategori. Nilai ini ada di ${rows.length} baris dan tidak memengaruhi laporan.`,
    action: 'Ganti dengan BAPOK, GERAI atau INV bila itu maksudnya. Bila nilai ini harus menentukan baris LRA, beri tahu tim aplikasi.',
    rows,
  }))
  if (pokok.length) out.push(finding({
    key: `pokok-tanpa-kategori:${period}:${pokok.length}:${amt(pokokTotal)}`, check: 'pokok-tanpa-kategori', severity: 'info',
    title: 'Pembelian persediaan tanpa Kategori',
    detail: `${pokok.length} pembelian 11401/11402 (${formatRupiah(pokokTotal)}) tanpa BAPOK/GERAI: dihitung di LRA 4.1 Beban Pokok Perdagangan Bahan Pokok.`,
    action: 'Isi GERAI pada pembelian untuk Gerai Inflasi (LRA 4.2).',
    amount: pokokTotal, rows: pokok,
  }))
  return out
}

function checkSubAkun(journals, period) {
  const rkap = rkapVersion([parseInt(period.split('-')[1], 10) || 1])
  const groups = {}
  for (const j of journals) {
    for (const l of linesOf(j)) {
      const ex = explainSubAkun(l.code, l.sub)
      if (!ex.header || ex.code || !(l.debit || l.kredit)) continue
      const value = `${l.code} > ${l.sub || '(tanpa Sub Akun)'}`
      const g = groups[value] = groups[value] || { code: l.code, sub: l.sub, rows: [], debit: 0, kredit: 0 }
      g.rows.push(rowOf(j, l)); g.debit += l.debit; g.kredit += l.kredit
    }
  }
  return Object.entries(groups).map(([value, g]) => {
    const outline = /^[47]/.test(g.code) ? resolveOutline(g.code, g.sub, rkap) : null
    const moved = [g.debit && `debit ${formatRupiah(g.debit)}`, g.kredit && `kredit ${formatRupiah(g.kredit)}`].filter(Boolean).join(', ')
    return finding({
      key: `subakun-asing:${value}:${amt(g.debit)}:${amt(g.kredit)}`, check: 'subakun-asing', severity: 'periksa', value,
      title: `Sub Akun tidak dikenali: ${value}`,
      detail: `Aplikasi tidak mengenali Sub Akun ini pada akun ${g.code}; nilainya (${moved}) dihitung pada baris bawaan${outline ? ` LRA ${outline}` : ` akun ${g.code}`}.`,
      action: 'Samakan ejaan Sub Akun dengan bulan sebelumnya. Bila ini jenis pendapatan/beban baru, minta tim aplikasi menambahkan barisnya.',
      amount: g.debit + g.kredit, rows: g.rows,
    })
  })
}

function checkAccounts(journals, { coa, earlierJournals }) {
  const out = []
  const used = {}
  for (const j of journals) for (const l of linesOf(j)) {
    if (!l.code) continue
    ;(used[l.code] = used[l.code] || { name: l.name, rows: [] }).rows.push(rowOf(j, l))
  }
  if (Array.isArray(coa) && coa.length) {
    const known = new Set(coa.map(a => String(a.code)))
    for (const [code, u] of Object.entries(used)) {
      if (known.has(code)) continue
      out.push(finding({
        key: `akun-tak-dikenal:${code}:${u.rows.length}`, check: 'akun-tak-dikenal', severity: 'salah', value: code,
        title: `Kode akun ${code} tidak ada di COA`,
        detail: `${u.rows.length} baris memakai kode ${code}${u.name ? ` (${u.name})` : ''} yang tidak terdaftar di Bagan Akun: nilainya tidak masuk Neraca/Laba Rugi.`,
        action: 'Perbaiki No. Akun di Excel, atau tambahkan akun ini di menu COA, lalu unggah ulang.',
        rows: u.rows,
      }))
    }
  }
  const earlier = new Set()
  for (const j of earlierJournals || []) for (const l of linesOf(j)) if (l.code) earlier.add(l.code)
  if (earlier.size) {
    for (const [code, u] of Object.entries(used)) {
      if (earlier.has(code)) continue
      const balance = /^[123]/.test(code)
      const line = balance ? neracaAlias[code] : null
      const unmapped = balance && !line
      out.push(finding({
        key: `akun-baru:${code}`, check: 'akun-baru', severity: unmapped ? 'periksa' : 'info', value: code,
        title: `Akun baru dipakai: ${code}${u.name ? ` ${u.name}` : ''}`,
        detail: unmapped
          ? 'Akun ini dipakai pertama kali dan belum punya baris di Neraca: nilainya tampil sebagai "(Belum Terpetakan)".'
          : `Akun ini dipakai pertama kali${line ? `; di Neraca tampil sebagai "${line}"` : ''}.`,
        action: unmapped ? 'Minta tim aplikasi menambahkan baris Neraca untuk akun ini.' : 'Periksa laporan bulan ini pada baris akun tersebut.',
        rows: u.rows,
      }))
    }
  }
  return out
}

function checkReclass(journals) {
  const out = []
  for (const j of journals) {
    const lines = linesOf(j).filter(l => l.code && (l.debit || l.kredit))
    if (lines.length < 2 || lines.some(l => /^111/.test(l.code))) continue
    const codes = [...new Set(lines.map(l => l.code))]
    const total = lines.reduce((s, l) => s + l.debit, 0)
    const rows = lines.map(l => rowOf(j, l))
    if (codes.every(c => /^112/.test(c))) {
      out.push(finding({
        key: `reklasifikasi:${j.tanggal}:${codes.join('+')}:${amt(total)}`, check: 'reklasifikasi', severity: 'info',
        title: 'Pemindahan antar akun piutang',
        detail: `Jurnal tanpa kas antara akun piutang (${codes.join(', ')}), ${formatRupiah(total)}: tidak dihitung sebagai penerimaan di LRA 1.6.`,
        action: 'Tidak ada yang perlu dilakukan bila memang pemindahan saldo piutang.',
        amount: total, rows,
      }))
    } else if (codes.every(c => /^1[23]/.test(c)) && !codes.includes(AUC_CODE) && !codes.some(c => /\.2$/.test(c))) {
      out.push(finding({
        key: `reklasifikasi:${j.tanggal}:${codes.join('+')}:${amt(total)}`, check: 'reklasifikasi', severity: 'periksa',
        title: 'Pemindahan antar akun aset tetap',
        detail: `Jurnal tanpa kas antara akun aset (${codes.join(', ')}), ${formatRupiah(total)}. Di LRA Investasi aplikasi memindahkan nilainya dari baris aset asal ke baris aset tujuan; total investasi tidak bertambah.`,
        action: 'Bila lampiran menghitungnya sebagai realisasi baru, beri tahu tim aplikasi.',
        amount: total, rows,
      }))
    }
  }
  return out
}

function checkCorrections(journals) {
  const out = []
  for (const j of journals) for (const l of linesOf(j)) {
    const expenseCredit = l.kredit && /^[568]/.test(l.code)
    const revenueDebit = l.debit && /^[47]/.test(l.code)
    if (!expenseCredit && !revenueDebit) continue
    const a = expenseCredit ? l.kredit : l.debit
    out.push(finding({
      key: `koreksi:${j.tanggal}:${l.code}:${amt(a)}`, check: 'koreksi-beban', severity: 'info',
      title: expenseCredit ? `Kredit ke akun beban ${l.code}` : `Debit ke akun pendapatan ${l.code}`,
      detail: `${formatRupiah(a)} ${expenseCredit ? 'mengurangi beban' : 'mengurangi pendapatan'} ${l.name || l.code} di Laba Rugi dan LRA (pengembalian / koreksi).`,
      action: 'Pastikan ini memang pengembalian atau koreksi, bukan salah sisi Debit/Kredit.',
      amount: a, rows: [rowOf(j, l)],
    }))
  }
  return out
}

function checkLampiranLra(lra) {
  const out = []
  for (const [kat, rows] of Object.entries(lra || {})) {
    for (const r of rows || []) {
      const issues = []
      const d = (Number(r.sdBlnLalu) || 0) + (Number(r.bulanIni) || 0) - (Number(r.realisasi) || 0)
      if (Math.abs(d) > 1) issues.push(`(7) + (8) ≠ (9), selisih ${formatRupiah(d)}`)
      const depth = String(r.outline).split('.').length
      const kids = rows.filter(c => String(c.outline).startsWith(`${r.outline}.`) && String(c.outline).split('.').length === depth + 1)
      // A group heading carries no figures of its own (Beban Operasional 1.1
      // "Pemeliharaan Kendaraan Operasional"): only a parent with figures is
      // checked against its rows (Investasi 1.3 / 1.5, Oktober 2026).
      const hasFigures = ['sdBlnLalu', 'bulanIni', 'realisasi'].some(f => Math.abs(Number(r[f]) || 0) > 0)
      if (kids.length && hasFigures) {
        for (const [f, label] of [['sdBlnLalu', 's.d. bulan lalu (7)'], ['realisasi', 's.d. bulan ini (9)']]) {
          const sum = kids.reduce((s, c) => s + (Number(c[f]) || 0), 0)
          if (Math.abs((Number(r[f]) || 0) - sum) > 1) issues.push(`${label} ${formatRupiah(r[f])} ≠ jumlah rinciannya ${formatRupiah(sum)}`)
        }
      }
      if (!issues.length) continue
      out.push(finding({
        key: `lampiran:${kat}:${r.outline}:${issues.join('|')}`, check: 'lampiran-tidak-jumlah', severity: 'periksa', value: `${kat} ${r.outline}`,
        title: `Lampiran ${KATEGORI_NAMES[kat] || kat} ${r.outline}: angka tidak menjumlah`,
        detail: `${r.outline} ${r.nama || ''}: ${issues.join('; ')}.`,
        action: 'Perbaiki rumus/angka di sheet LRA lampiran. Aplikasi menampilkan jumlah dari rinciannya.',
      }))
    }
  }
  return out
}

function checkPending(journals) {
  const pending = journals.filter(j => j.status === 'pending')
  if (!pending.length) return []
  // Vouchers typed in the app wait in Persetujuan (posted inside Keuangan,
  // whatever the amount); uploaded journals in the Jurnal page.
  const vouchers = pending.filter(isVoucher).length
  const big = pending.filter(j => !isVoucher(j) && (Number(j.debit) || Number(j.kredit) || 0) >= 50000000).length
  return [finding({
    key: `belum-approve:${pending.length}:${big}`, check: 'belum-approve', severity: 'periksa',
    title: `${pending.length} jurnal belum di-approve`,
    detail: `Jurnal pending belum masuk Buku Besar dan laporan.${big ? ` ${big} di antaranya Rp 50 juta ke atas: hanya Direktur Utama atau super_admin yang dapat meng-approve.` : ''}`,
    action: vouchers === pending.length
      ? 'Buka menu Persetujuan: SPV Akuntansi atau Manajer Keuangan memposting atau mengembalikan voucher.'
      : vouchers
        ? 'Voucher: buka menu Persetujuan. Jurnal hasil unggahan: buka menu Jurnal, klik Approve Semua.'
        : 'Buka menu Jurnal, klik Approve Semua dan tunggu sampai selesai.',
    rows: pending.map(j => ({ tanggal: j.tanggal, bukti: String(j.bukti || ''), akun: j.akun_debit || '', debit: Number(j.debit) || 0, kredit: Number(j.kredit) || 0, keterangan: j.keterangan || '' })),
  })]
}

// ── Vouchers typed in the app (daily bookkeeping) ─────────────────────────
const isVoucher = (j) => !!(j && j.voucher_type)
const voucherNo = (j) => String((j && (j.voucher_no || j.bukti)) || '').trim()
const vRow = (j) => ({ tanggal: j.tanggal, bukti: voucherNo(j), akun: j.akun_debit || '', debit: Number(j.debit) || 0, kredit: Number(j.kredit) || 0, keterangan: j.keterangan || '' })

/** No. Bukti used twice (salah) and numbers missing from the month's run (info). */
function checkVoucherNumbers(journals, period) {
  const vs = journals.filter(isVoucher).filter(j => voucherNo(j))
  const out = []
  const byNo = new Map()
  for (const j of vs) { const n = voucherNo(j); byNo.set(n, [...(byNo.get(n) || []), j]) }
  for (const [no, list] of byNo) {
    if (list.length < 2) continue
    out.push(finding({
      key: `voucher-ganda:${period}:${no}:${list.length}`, check: 'voucher-ganda', severity: 'salah',
      title: `No. Bukti ${no} dipakai ${list.length} kali`,
      detail: 'Satu nomor bukti hanya untuk satu voucher.',
      action: 'Ubah nomor salah satu voucher sesuai bukti fisiknya.',
      rows: list.map(vRow),
    }))
  }
  const nums = [...new Set(vs.map(j => parseInt(voucherNo(j), 10)).filter(Number.isFinite))].sort((a, b) => a - b)
  if (nums.length >= 2) {
    const width = Math.max(4, ...vs.map(j => voucherNo(j).length))
    const have = new Set(nums)
    const missing = []
    for (let n = nums[0] + 1; n < nums[nums.length - 1] && missing.length < 200; n++) if (!have.has(n)) missing.push(String(n).padStart(width, '0'))
    if (missing.length) {
      out.push(finding({
        key: `voucher-terlewat:${period}:${missing.join(',')}`, check: 'voucher-terlewat', severity: 'info',
        title: missing.length === 1 ? `Nomor bukti ${missing[0]} tidak ada` : `${missing.length} nomor bukti tidak ada`,
        detail: `Nomor yang tidak ada di antara voucher bulan ini: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' …' : ''}.`,
        action: 'Batal? Catat sebagai batal agar urutan lengkap. Belum diinput? Input vouchernya.',
      }))
    }
  }
  return out
}

const daysBetween = (a, b) => Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)

/** Submitted from Rp 1 jt without the signature tick (periksa); drafts older than 3 days and self-approved vouchers (info). */
function checkVoucherStatus(journals, period, today) {
  const vs = journals.filter(isVoucher)
  const out = []
  const unsigned = vs.filter(j => j.status === 'pending' && needsSignatureTick(Math.max(Number(j.debit) || 0, Number(j.kredit) || 0), j.voucher_type) && !Number(j.sop_signed))
  if (unsigned.length) {
    out.push(finding({
      key: `ttd-belum:${period}:${unsigned.map(voucherNo).join(',')}`, check: 'ttd-belum', severity: 'periksa',
      title: 'Tanda tangan belum dikonfirmasi',
      detail: 'Voucher Rp 1 juta ke atas yang diajukan tanpa centang "bukti fisik sudah ditandatangani". SPV tidak bisa mempostingnya.',
      action: 'Kembalikan ke penginput, atau minta penginput mencentang setelah bukti fisik ditandatangani.',
      rows: unsigned.map(vRow),
    }))
  }
  const old = vs.filter(j => j.status === 'draft' && /^\d{4}-\d{2}-\d{2}$/.test(String(j.tanggal || '')) && daysBetween(j.tanggal, today) > 3)
  if (old.length) {
    const first = old[0]
    out.push(finding({
      key: `draf-lama:${period}:${old.map(voucherNo).join(',')}`, check: 'draf-lama', severity: 'info',
      title: old.length === 1 ? `Draf ${voucherNo(first)} belum diajukan sejak ${formatTanggal(first.tanggal)}` : `${old.length} draf belum diajukan lebih dari 3 hari`,
      detail: 'Draf belum masuk Persetujuan, jadi belum masuk Buku Besar dan laporan.',
      action: 'Lengkapi lalu ajukan, atau hapus bila batal.',
      rows: old.map(vRow),
    }))
  }
  // Posting your own voucher is allowed for now (one person enters and
  // approves, owner 26 Nov 2026); the month keeps one note of it for the SOP.
  const self = vs.filter(j => j.status === 'posted' && j.approved_by && j.created_by && j.approved_by === j.created_by)
  if (self.length) {
    const total = self.reduce((s, j) => s + Math.max(Number(j.debit) || 0, Number(j.kredit) || 0), 0)
    out.push(finding({
      key: `disetujui-sendiri:${period}:${self.length}:${total}`, check: 'disetujui-sendiri', severity: 'info',
      title: `${self.length} voucher disetujui oleh penginputnya sendiri`,
      detail: `Penginput dan penyetuju orang yang sama (${[...new Set(self.map(j => j.approved_by))].join(', ')}). SOP: penyetuju sebaiknya orang lain.`,
      action: 'Bila sudah ada penyetuju lain: Pengaturan → Voucher Setup → larang menyetujui voucher atau jurnal sendiri.',
      rows: self.map(vRow),
    }))
  }
  // Journals follow the same rule (approve endpoint records approved_by).
  const selfJ = journals.filter(j => !isVoucher(j) && j.status === 'posted' && j.approved_by && j.created_by && j.approved_by === j.created_by)
  if (selfJ.length) {
    const total = selfJ.reduce((s, j) => s + Math.max(Number(j.debit) || 0, Number(j.kredit) || 0), 0)
    out.push(finding({
      key: `jurnal-disetujui-sendiri:${period}:${selfJ.length}:${total}`, check: 'jurnal-disetujui-sendiri', severity: 'info',
      title: `${selfJ.length} jurnal disetujui oleh pembuatnya sendiri`,
      detail: `Pembuat dan penyetuju orang yang sama (${[...new Set(selfJ.map(j => j.approved_by))].join(', ')}). SOP: penyetuju sebaiknya orang lain.`,
      action: 'Bila sudah ada penyetuju lain: Pengaturan → Voucher Setup → larang menyetujui voucher atau jurnal sendiri.',
      rows: selfJ.map(j => ({ tanggal: j.tanggal, bukti: String(j.bukti || j.id || ''), akun: j.akun_debit || '', debit: Number(j.debit) || 0, kredit: Number(j.kredit) || 0, keterangan: j.keterangan || '' })),
    }))
  }
  return out
}

const bySeverity = (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)

/**
 * Findings for one month's book.
 * @param journals  the book: parsed upload entries ({ lines }) or stored journals ({ journal_lines | lines })
 * @param opts.period  'YYYY-MM'
 * @param opts.coa  [{ code }] — when given, codes outside it are `salah`
 * @param opts.earlierJournals  journals of earlier months (first use of an account, previous book)
 * @param opts.lra  the lampiran's LRA rows per kategori (extractSnapshot(...).lra), when uploaded
 * @param opts.includePending  list journals still pending (stored months)
 * @param opts.today  'YYYY-MM-DD' for the age of drafts (default: today)
 */
export function checkBook(journals, { period, coa = [], earlierJournals = [], lra = null, includePending = false, today = new Date().toISOString().slice(0, 10) } = {}) {
  const book = (journals || []).filter(Boolean)
  const p = period || String((book[0] || {}).tanggal || '').slice(0, 7)
  const out = [
    ...checkBukti(book, p, earlierJournals),
    ...checkInvestasiPayments(book, p),
    ...checkKategori(book, p),
    ...checkSubAkun(book, p),
    ...checkAccounts(book, { coa, earlierJournals }),
    ...checkReclass(book),
    ...checkCorrections(book),
    ...(lra ? checkLampiranLra(lra) : []),
    ...(includePending ? checkPending(book) : []),
    ...checkVoucherNumbers(book, p),
    ...checkVoucherStatus(book, p, today),
  ]
  return out.sort(bySeverity)
}

/**
 * Findings per stored month from `from` on → { 'YYYY-MM': Finding[] }; months
 * without findings are left out.
 */
export function findingsByMonth(journals, { coa = [], from = FINDINGS_FROM } = {}) {
  const byMonth = {}
  for (const j of journals || []) {
    const ym = String(j.tanggal || '').slice(0, 7)
    if (/^\d{4}-\d{2}$/.test(ym)) (byMonth[ym] = byMonth[ym] || []).push(j)
  }
  const out = {}
  for (const ym of Object.keys(byMonth).sort()) {
    if (ym < from) continue
    const earlierJournals = (journals || []).filter(j => String(j.tanggal || '').slice(0, 7) < ym)
    const f = checkBook(byMonth[ym], { period: ym, coa, earlierJournals, includePending: true })
    if (f.length) out[ym] = f
  }
  return out
}

/** Bell count: open (not acknowledged) salah + periksa findings. `acks` = Set of `${period}|${key}`. */
export function openCount(byMonth, acks = new Set()) {
  let n = 0
  for (const [ym, list] of Object.entries(byMonth || {})) {
    for (const f of list) if (f.severity !== 'info' && !acks.has(`${ym}|${f.key}`)) n++
  }
  return n
}
