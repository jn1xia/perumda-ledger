// fileChecks.js — "Cek Berkas" levels L1–L2 for a JURNAL sheet, before it is
// loaded (spec 2026-11-25 §5.11; checker plan 2026-11-24 §4).
//
// L1 Berkas: the rows' dates against the sheet's month; rows dated from the
//   start of daily bookkeeping (those transactions belong in the app — loading
//   them again would count them twice) stop the upload.
// L2 Baris: every row read or explained (no date, amount typed as text, No.
//   Akun #N/A, no account); the rows read must add up to the sheet's own
//   row-2 totals (=SUM(F4:Fn)) over the formula's range, else rows were lost
//   while reading and the upload stops. Rows after the range only warn.
// "Read" means exactly what the importer loads (reportSnapshot.isPostingRow).
import * as XLSX from 'xlsx/xlsx.mjs'
import { journalSheetLayout, isPostingRow, excelSerialToDate } from './reportSnapshot.js'
import { bulanLabel } from './workingMonth.js'

const rupiah = (n) => Math.round(Number(n) || 0).toLocaleString('id-ID')
const dmy = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}` }
const listRows = (rows, max = 12) => rows.slice(0, max).join(', ') + (rows.length > max ? ` dan ${rows.length - max} lainnya` : '')
const cellAt = (ws, r, c) => ws[XLSX.utils.encode_cell({ r, c })]
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v)

function rangeOf(cell) {
  const m = /SUM\(\s*\$?[A-Z]+\$?(\d+)\s*:\s*\$?[A-Z]+\$?(\d+)\s*\)/i.exec(String((cell && cell.f) || ''))
  return m ? { from: Number(m[1]), to: Number(m[2]) } : null
}

/**
 * Check one JURNAL sheet.
 * @param ws a SheetJS worksheet
 * @param opts.period 'YYYY-MM' the sheet is for (dates outside it are named)
 * @param opts.startDate 'YYYY-MM-DD' daily bookkeeping starts (rows from it are stopped)
 */
export function checkJournalSheet(ws, { period = '', startDate = '' } = {}) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const L = journalSheetLayout(data)
  const out = {
    found: !!L,
    rowsRead: 0, readTotals: { debit: 0, kredit: 0 }, sheetTotals: null,
    skipped: [], noCode: [], outside: [], fromStart: [], beyond: [], blocking: false, items: [],
  }
  if (!L) {
    out.items.push({ level: 'Berkas', status: 'warn', text: 'Baris judul JURNAL (kolom "Tgl") tidak ditemukan; sheet ini tidak bisa diperiksa.' })
    return out
  }

  // Row-2 totals: the last row above the header with numbers in both value columns.
  for (let i = L.hdr - 1; i >= 0; i--) {
    const r = data[i] || []
    if (isNumber(r[L.debitCol]) && isNumber(r[L.kreditCol])) {
      out.sheetTotals = { debit: r[L.debitCol], kredit: r[L.kreditCol], row: i + 1, range: rangeOf(cellAt(ws, i, L.debitCol)) }
      break
    }
  }
  const range = out.sheetTotals && out.sheetTotals.range
  const inRange = { debit: 0, kredit: 0 }

  for (let i = L.hdr + 1; i < data.length; i++) {
    const r = data[i] || []
    const rowNo = i + 1
    const codeCell = cellAt(ws, i, L.codeCol)
    const codeIsError = !!(codeCell && codeCell.t === 'e')
    const name = String(r[L.akunCol] || '').trim()
    const dRaw = r[L.debitCol]
    const kRaw = r[L.kreditCol]
    const textAmount = [dRaw, kRaw].some(v => typeof v === 'string' && v.trim() !== '' && !Number.isFinite(Number(v)))
    const numAmount = (Number(dRaw) || 0) !== 0 || (Number(kRaw) || 0) !== 0
    if (isPostingRow(r, L)) {
      const debit = Number(dRaw) || 0
      const kredit = Number(kRaw) || 0
      out.rowsRead++
      out.readTotals.debit += debit
      out.readTotals.kredit += kredit
      if (!range || (rowNo >= range.from && rowNo <= range.to)) { inRange.debit += debit; inRange.kredit += kredit } else out.beyond.push(rowNo)
      if (codeIsError) out.noCode.push(rowNo)
      const tanggal = excelSerialToDate(r[L.tglCol], period || '2026-01')
      if (period && tanggal.slice(0, 7) !== period) out.outside.push(rowNo)
      if (startDate && tanggal >= startDate) out.fromStart.push(rowNo)
      if (textAmount) out.skipped.push({ row: rowNo, reason: 'jumlah berupa teks', part: true })
      continue
    }
    if (!numAmount && !textAmount) continue // empty or a heading
    const dated = isNumber(r[L.tglCol]) && r[L.tglCol] > 40000
    const reason = textAmount && !numAmount ? 'jumlah berupa teks'
      : !dated ? 'tanpa tanggal'
      : codeIsError && !name ? 'No. Akun #N/A'
      : 'tanpa akun'
    out.skipped.push({ row: rowNo, reason, debit: Number(dRaw) || 0, kredit: Number(kRaw) || 0 })
  }
  out.skipped = out.skipped.filter(s => !s.part).concat(out.skipped.filter(s => s.part).map(({ part, ...s }) => s))
  out.readTotals = { debit: Math.round(out.readTotals.debit * 100) / 100, kredit: Math.round(out.readTotals.kredit * 100) / 100 }

  // L1 Berkas
  if (out.fromStart.length) {
    out.items.push({ level: 'Berkas', status: 'block', text: `${out.fromStart.length} baris bertanggal mulai ${dmy(startDate)}, saat pembukuan harian di aplikasi sudah berjalan: baris ${listRows(out.fromStart)}. Transaksi itu dicatat di aplikasi; hapus dari file agar tidak terhitung dua kali.` })
  }
  if (out.outside.length) {
    out.items.push({ level: 'Berkas', status: 'warn', text: `${out.outside.length} baris bertanggal di luar ${bulanLabel(period)}: baris ${listRows(out.outside)}.` })
  }
  // L2 Baris
  const skippedText = out.skipped.map(s => `baris ${s.row} ${s.reason}`)
  out.items.push(out.skipped.length
    ? { level: 'Baris', status: 'warn', text: `${out.rowsRead} baris dibaca, ${out.skipped.length} dilewati: ${listRows(skippedText, 8).replace(/, /g, ' · ')}.` }
    : { level: 'Baris', status: 'ok', text: `${out.rowsRead} baris dibaca, tidak ada yang dilewati.` })
  if (out.noCode.length) {
    out.items.push({ level: 'Baris', status: 'warn', text: `No. Akun #N/A pada baris ${listRows(out.noCode)}: dimuat dengan nama akun saja, tanpa kode. Perbaiki nama akun di Excel agar kodenya terbaca.` })
  }
  if (out.sheetTotals) {
    const st = out.sheetTotals
    const lost = Math.abs(inRange.debit - st.debit) > 1 || Math.abs(inRange.kredit - st.kredit) > 1
    if (lost) {
      const side = Math.abs(inRange.debit - st.debit) > 1 ? ['Debit', inRange.debit, st.debit] : ['Kredit', inRange.kredit, st.kredit]
      out.items.push({ level: 'Baris', status: 'block', text: `Total yang terbaca tidak sama dengan total JURNAL (baris ${st.row}). ${side[0]} terbaca Rp ${rupiah(side[1])}, di Excel Rp ${rupiah(side[2])} (selisih Rp ${rupiah(Math.abs(side[2] - side[1]))}): ada baris yang hilang saat dibaca. Unggahan ditahan sampai diperbaiki.` })
    } else {
      out.items.push({ level: 'Baris', status: 'ok', text: `Total terbaca sama dengan total JURNAL (baris ${st.row}): Rp ${rupiah(st.debit)}.` })
    }
    if (out.beyond.length && range) {
      out.items.push({ level: 'Baris', status: 'warn', text: `Rumus total di baris ${st.row} hanya sampai baris ${range.to}; baris ${listRows(out.beyond)} tidak ikut total Excel.` })
    }
  } else {
    out.items.push({ level: 'Baris', status: 'warn', text: 'Baris total JURNAL (baris 2) tidak ditemukan; jumlah tidak bisa dicocokkan dengan Excel.' })
  }
  out.blocking = out.items.some(i => i.status === 'block')
  return out
}
