// jurnalExport.js — "JURNAL untuk Excel" (plan 2026-11-25 §6; brought into
// release 1 on 26 Nov 2026). The month's posted vouchers in the columns of
// Keuangan's own JURNAL sheet, so pasted at column A below the last row the
// workbook calculates its lampiran as always:
//   A No. Akun · B Tgl · C No. Bukti · D Akun · E Sub Akun · F Debit ·
//   G Kredit · H Keterangan · I Kategori
// (October 2026 workbook: data from row 4; A is the workbook's VLOOKUP of the
// name and holds a number; C is text.) The workbook's report sheets read D, E,
// F and G (DATA LAMPIRAN …: SUMIFS on the account name and Sub Akun), so a
// name must be spelled exactly as the workbook spells it: names come from the
// uploaded Excel journals, and spellings the workbook has never used are listed.
import { bulanLabel, formatTanggal } from './workingMonth.js'

export const JURNAL_COLUMNS = ['No. Akun', 'Tgl', 'No. Bukti', 'Akun', 'Sub Akun', 'Debit', 'Kredit', 'Keterangan', 'Kategori']
export const JURNAL_SHEET = 'JURNAL dari aplikasi'

// A journal's lines: the `lines` JSON, else the stored journal_lines (643 of
// the 1803 Excel journals on the 25 November copy carry only journal_lines).
const linesOf = (j) => {
  let l = j && j.lines
  if (typeof l === 'string') { try { l = JSON.parse(l) } catch { l = [] } }
  if (Array.isArray(l) && l.length) return l
  return j && Array.isArray(j.journal_lines) ? j.journal_lines : []
}
// Rows that came from an uploaded JURNAL sheet: a lampiran month (XL-) or a
// month loaded as a journal book (JV-<YYYY>-<MM>-U<n>).
const fromExcel = (j) => j && !j.voucher_type && (/^XL-/i.test(String(j.id || '')) || /^JV-\d{4}-\d{2}-U\d+$/i.test(String(j.id || '')))
const STATUS = { draft: 'draf', pending: 'diajukan', returned: 'dikembalikan' }
const byDateNo = (a, b) => String(a.tanggal || '').localeCompare(String(b.tanggal || ''))
  || String(a.voucher_no || a.bukti || '').localeCompare(String(b.voucher_no || b.bukti || ''))
  || String(a.id || '').localeCompare(String(b.id || ''))
const round2 = (n) => Math.round(n * 100) / 100

/**
 * Account names and Sub Akun as the Excel book spells them (the latest upload
 * wins), and which accounts the latest uploaded month books each Sub Akun on
 * (the next month's workbook is a copy of it, with its formulas).
 */
export function excelSpellings(journals) {
  const names = new Map()
  const subs = new Set()
  const book = (journals || []).filter(fromExcel).sort(byDateNo)
  const latestYm = book.reduce((m, j) => { const ym = String(j.tanggal || '').slice(0, 7); return ym > m ? ym : m }, '')
  const latestSubs = new Map() // Sub Akun → Map(code → name) in the latest month
  for (const j of book) for (const l of linesOf(j)) {
    const code = String(l.akun_code || '').trim()
    if (!code) continue
    const name = String(l.akun_name || '').trim()
    if (name) names.set(code, name)
    const sub = String(l.sub_akun || '').trim()
    if (!sub) continue
    subs.add(`${code}|${sub}`)
    if (String(j.tanggal || '').slice(0, 7) === latestYm) {
      const m = latestSubs.get(sub) || new Map()
      m.set(code, name)
      latestSubs.set(sub, m)
    }
  }
  return { names, subs, latestYm, latestSubs }
}

/**
 * The month's posted vouchers, one row per journal line (the cash / bank leg
 * included), by date, number and line order.
 * @param journals  every journal (state.journalsAll): the vouchers, and the
 *                  uploaded Excel journals for the workbook's spellings
 * @param ym        'YYYY-MM'
 */
export function jurnalUntukExcel(journals, ym, { coaName = () => '' } = {}) {
  const { names, subs, latestYm, latestSubs } = excelSpellings(journals)
  const month = (journals || []).filter(j => j && j.voucher_type && String(j.tanggal || '').slice(0, 7) === ym)
  const posted = month.filter(j => j.status === 'posted').sort(byDateNo)
  const rows = []
  for (const j of posted) {
    for (const l of linesOf(j)) {
      const code = String(l.akun_code || '').trim()
      const debit = Number(l.debit) || 0
      const kredit = Number(l.kredit) || 0
      if (!code || (!debit && !kredit)) continue
      rows.push({
        akun_code: code,
        tanggal: String(j.tanggal),
        bukti: String(j.voucher_no || j.bukti || ''),
        akun_name: names.get(code) || coaName(code) || String(l.akun_name || ''),
        sub_akun: String(l.sub_akun || '').trim(),
        debit, kredit,
        keterangan: String(l.keterangan || j.keterangan || '').trim(),
        kategori: String(l.kategori || '').trim().toUpperCase(),
        voucher_id: j.id,
      })
    }
  }
  const newNames = new Map()
  const newSubs = new Map()
  const moved = new Map()
  const bySub = new Map()
  for (const r of rows) {
    if (!names.has(r.akun_code)) newNames.set(r.akun_code, { akun_code: r.akun_code, akun_name: r.akun_name })
    if (r.sub_akun && !subs.has(`${r.akun_code}|${r.sub_akun}`)) newSubs.set(`${r.akun_code}|${r.sub_akun}`, { akun_code: r.akun_code, akun_name: r.akun_name, sub_akun: r.sub_akun })
    // The latest month books this Sub Akun on another account (Parkir: 42001
    // until April, 41000 from October): its formulas may not read this row.
    const there = r.sub_akun ? latestSubs.get(r.sub_akun) : null
    if (there && !there.has(r.akun_code)) {
      moved.set(`${r.akun_code}|${r.sub_akun}`, { akun_code: r.akun_code, akun_name: r.akun_name, sub_akun: r.sub_akun,
        excelAccounts: [...there].map(([c, n]) => `${c} ${n}`.trim()).sort() })
    }
    const k = `${r.akun_code}|${r.sub_akun}`
    const s = bySub.get(k) || { akun_code: r.akun_code, akun_name: r.akun_name, sub_akun: r.sub_akun, debit: 0, kredit: 0 }
    s.debit = round2(s.debit + r.debit); s.kredit = round2(s.kredit + r.kredit)
    bySub.set(k, s)
  }
  const byCode = (a, b) => a.akun_code.localeCompare(b.akun_code) || String(a.sub_akun || '').localeCompare(String(b.sub_akun || ''))
  return {
    ym,
    rows,
    vouchers: posted.length,
    debit: round2(rows.reduce((s, r) => s + r.debit, 0)),
    kredit: round2(rows.reduce((s, r) => s + r.kredit, 0)),
    notPosted: month.filter(j => j.status !== 'posted').sort(byDateNo)
      .map(j => ({ voucher_no: String(j.voucher_no || j.bukti || ''), status: j.status, tanggal: j.tanggal })),
    newNames: [...newNames.values()].sort(byCode),
    newSubs: [...newSubs.values()].sort(byCode),
    latestExcelYm: latestYm,
    moved: [...moved.values()].sort(byCode),
    bySub: [...bySub.values()].sort(byCode),
  }
}

/** Excel's serial day number for 'YYYY-MM-DD' (1900 date system), whatever the time zone. */
export function excelSerial(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}

const amountFormat = (v) => (Number.isInteger(v) ? '#,##0' : '#,##0.00')

/**
 * The workbook to download: "JURNAL dari aplikasi" (header + rows, columns
 * A–I) and "Ringkasan" (totals, how to paste, what to check). `XLSX` is the
 * SheetJS module (passed in so the page and the tests share this code).
 */
export function jurnalWorkbook(XLSX, result, ym = result.ym) {
  const data = result.rows.map(r => [
    /^\d+$/.test(r.akun_code) ? Number(r.akun_code) : r.akun_code,
    excelSerial(r.tanggal),
    r.bukti || null,
    r.akun_name || null,
    r.sub_akun || null,
    r.debit || null,
    r.kredit || null,
    r.keterangan || null,
    r.kategori || null,
  ])
  const ws = XLSX.utils.aoa_to_sheet([JURNAL_COLUMNS, ...data])
  for (let i = 1; i <= data.length; i++) {
    const b = ws[XLSX.utils.encode_cell({ r: i, c: 1 })]
    if (b) b.z = 'dd/mm/yyyy'
    for (const c of [5, 6]) {
      const x = ws[XLSX.utils.encode_cell({ r: i, c })]
      if (x && x.t === 'n') x.z = amountFormat(x.v)
    }
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: JURNAL_COLUMNS.length - 1 } })
  ws['!cols'] = [9, 11, 10, 34, 34, 15, 15, 48, 10].map(wch => ({ wch }))

  const label = bulanLabel(ym)
  const aoa = [
    [`JURNAL untuk Excel — ${label}`],
    [`Voucher yang sudah diposting di aplikasi, dalam kolom sheet JURNAL ${label.toUpperCase()}.`],
    [],
    ['Voucher', result.vouchers],
    ['Baris', result.rows.length],
    ['Total Debit', result.debit],
    ['Total Kredit', result.kredit],
    [],
    ['Cara memakai'],
    [`1. Salin baris 2 sampai terakhir dari sheet "${JURNAL_SHEET}" (kolom A sampai I).`],
    ['2. Tempel di sheet JURNAL bulan ini, kolom A, di bawah baris terakhir.'],
    ['3. Perpanjang rumus total di baris 2 (F2 dan G2) sampai baris terakhir: totalnya naik sebesar Total Debit dan Total Kredit di atas.'],
    ['4. Rumus lampiran membaca Akun (kolom D) dan Sub Akun (kolom E) persis sama, termasuk spasi di akhir. Cocokkan dengan daftar di bawah.'],
    ['5. Jangan unggah workbook ini ke aplikasi setelah ditempel: baris ini sudah ada di aplikasi, dan Cek Berkas menahannya.'],
  ]
  if (result.notPosted.length) {
    aoa.push([], ['Belum diposting, tidak ikut:'])
    for (const v of result.notPosted) aoa.push([v.voucher_no, STATUS[v.status] || v.status, formatTanggal(v.tanggal)])
  }
  if (result.newNames.length) {
    aoa.push([], ['Akun yang belum pernah ada di JURNAL Excel (nama dari COA aplikasi; pastikan sama dengan sheet COA workbook):'])
    for (const n of result.newNames) aoa.push([Number(n.akun_code) || n.akun_code, n.akun_name])
  }
  if (result.newSubs.length) {
    aoa.push([], ['Sub Akun yang belum pernah ada di JURNAL Excel (pastikan rumus lampiran membacanya):'])
    for (const n of result.newSubs) aoa.push([Number(n.akun_code) || n.akun_code, n.akun_name, n.sub_akun])
  }
  if ((result.moved || []).length) {
    const latest = bulanLabel(result.latestExcelYm)
    aoa.push([], [`Sub Akun yang di JURNAL ${latest} dicatat di akun lain (rumus workbook bisa tidak membaca baris ini; periksa akunnya):`])
    for (const m of result.moved) aoa.push([Number(m.akun_code) || m.akun_code, m.akun_name, m.sub_akun, `JURNAL ${latest}: ${m.excelAccounts.join(', ')}`])
  }
  aoa.push([], ['Jumlah per Akun dan Sub Akun (untuk dicocokkan setelah ditempel):'], ['No. Akun', 'Akun', 'Sub Akun', 'Debit', 'Kredit'])
  for (const s of result.bySub) aoa.push([Number(s.akun_code) || s.akun_code, s.akun_name, s.sub_akun || null, s.debit || null, s.kredit || null])
  const sum = XLSX.utils.aoa_to_sheet(aoa)
  Object.keys(sum).forEach(addr => {
    const cell = sum[addr]
    if (addr[0] !== '!' && cell && cell.t === 'n' && !/^A/.test(addr)) cell.z = amountFormat(cell.v)
  })
  sum['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 36 }, { wch: 16 }, { wch: 16 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, JURNAL_SHEET)
  XLSX.utils.book_append_sheet(wb, sum, 'Ringkasan')
  return wb
}
