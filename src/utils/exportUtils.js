import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

// === XLSX Export (using file-saver for reliable browser downloads) ===
export function exportXLSX(filename, headers, rows, sheetName = 'Data') {
  try {
    const data = [headers, ...rows]
    const ws = XLSX.utils.aoa_to_sheet(data)

    // Auto-size columns
    const colWidths = headers.map((h, i) => {
      let max = String(h).length
      rows.forEach(row => {
        const cellLen = String(row[i] ?? '').length
        if (cellLen > max) max = cellLen
      })
      return { wch: Math.min(max + 2, 40) }
    })
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)

    // Write workbook to array buffer
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

    // Use file-saver for reliable cross-browser download
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' })
    saveAs(blob, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`)
  } catch (err) {
    console.error('Export XLSX error:', err)
    alert('Gagal mengekspor file Excel. Error: ' + err.message)
  }
}

// Legacy alias for any old CSV calls
export function exportCSV(filename, headers, rows) {
  exportXLSX(filename, headers, rows)
}

// Number of a report cell as displayed — "Rp 4.890.435,23", "-Rp 1.000,00",
// "1.234.567", "46,97" or "46,97%" — else null (the cell stays text).
export function parseDisplayNumber(text) {
  const t = String(text == null ? '' : text).replace(/ /g, ' ').trim()
  const m = t.match(/^(-)?\s*(?:Rp\.?\s*)?(-)?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*%?$/)
  if (!m) return null
  const n = Number(m[3].replace(/\./g, '') + (m[4] ? `.${m[4]}` : ''))
  return (m[1] || m[2]) ? -n : n
}

// Text of a table cell with its parts spaced ("1.1" + "Gaji Direksi" →
// "1.1 Gaji Direksi", "Rp" + "1.000" → "Rp 1.000"); no layout needed.
function cellText(node) {
  const parts = []
  node.childNodes.forEach(n => {
    if (n.nodeType === 3) parts.push(n.textContent)
    else if (n.nodeType === 1) parts.push(` ${cellText(n)} `)
  })
  return parts.join('').replace(/\s+/g, ' ').trim()
}

/**
 * Export a report table exactly as displayed (header rows, merged cells, every
 * row on screen) to .xlsx. Amount cells become numbers: a cell's `data-v`
 * when present, else its displayed text when it is a figure. Lets the
 * "Unduh Excel" buttons export the report the user sees instead of a fixed
 * layout.
 */
export function exportReportTable(table, { filename = 'Laporan', sheetName = 'Laporan', titleLines = [] } = {}) {
  try {
    if (!table) throw new Error('tabel laporan tidak ditemukan')
    const aoa = titleLines.filter(Boolean).map(t => [t])
    if (aoa.length) aoa.push([])
    const merges = []
    const taken = new Set()
    const firstRow = aoa.length
    table.querySelectorAll('tr').forEach(tr => {
      const r = aoa.length
      const out = []
      let c = 0
      Array.from(tr.children).forEach(td => {
        while (taken.has(`${r},${c}`)) { out[c] = ''; c++ }
        const text = cellText(td)
        let value = text
        if (td.dataset && td.dataset.v != null && td.dataset.v !== '') {
          const n = Number(td.dataset.v)
          value = Number.isFinite(n) ? n : text
        } else {
          // A figure — but the first column holds labels ("2026", outline
          // numbers), so there only an amount written with "Rp" counts.
          const n = parseDisplayNumber(text)
          if (n != null && (c > 0 || /^-?\s*Rp/.test(text))) value = n
        }
        out[c] = value
        const cs = Math.max(1, td.colSpan || 1), rs = Math.max(1, td.rowSpan || 1)
        if (cs > 1 || rs > 1) merges.push({ s: { r, c }, e: { r: r + rs - 1, c: c + cs - 1 } })
        for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) if (dr || dc) taken.add(`${r + dr},${c + dc}`)
        c += cs
      })
      aoa.push(out)
    })
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!merges'] = merges
    const width = Math.max(...aoa.slice(firstRow).map(r => r.length), 1)
    ws['!cols'] = Array.from({ length: width }, (_, i) => {
      let max = 8
      aoa.slice(firstRow).forEach(row => {
        const v = row[i]
        const len = typeof v === 'number' ? 16 : String(v ?? '').length
        if (len > max) max = len
      })
      return { wch: Math.min(max + 2, i === 0 ? 60 : 24) }
    })
    // Amounts with thousands separators and up to two decimals.
    Object.keys(ws).forEach(addr => {
      const cell = ws[addr]
      if (addr[0] !== '!' && cell && cell.t === 'n') cell.z = Number.isInteger(cell.v) ? '#,##0' : '#,##0.00'
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' })
    saveAs(blob, `${String(filename).replace(/[\\/:*?"<>|]+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`)
  } catch (err) {
    console.error('Export XLSX error:', err)
    alert('Gagal mengekspor file Excel. Error: ' + err.message)
  }
}

/** The report table of the document the clicked button sits in. */
export function reportTableOf(event) {
  const doc = event && event.currentTarget && event.currentTarget.closest('.report-doc')
  return doc ? doc.querySelector('.report-doc-body table') : null
}

// === Print Report ===
export function printReport(title) {
  document.title = title || 'Laporan Keuangan'
  window.print()
}

// === Export helpers per report type ===
export function exportLabaRugi() {
  exportXLSX('Laporan_Laba_Rugi',
    ['Akun', 'Jan 2026', 'Des 2025', 'Selisih'],
    [
      ['PENDAPATAN', '', '', ''],
      ['  Pendapatan Sewa Kios', 95375000, 180000000, '-47.0%'],
      ['  Pendapatan Retribusi', 28500000, 42000000, '-32.1%'],
      ['  Pendapatan Parkir', 11500000, 35000000, '-67.1%'],
      ['Total Pendapatan', 135375000, 257000000, '-47.3%'],
      ['', '', '', ''],
      ['BEBAN OPERASIONAL', '', '', ''],
      ['  Beban Gaji', 45000000, 45000000, '0.0%'],
      ['  Beban Penyusutan', 270976817, 270976817, '0.0%'],
      ['  Beban Listrik', 4500000, 4200000, '+7.1%'],
      ['Total Beban', 270976817, 323376817, '-16.2%'],
      ['', '', '', ''],
      ['RUGI BERSIH', -135601817, -66376817, '+104.3%'],
    ],
    'Laba Rugi'
  )
}

export function exportNeraca() {
  exportXLSX('Neraca',
    ['Akun', 'Jumlah'],
    [
      ['ASET', ''],
      ['  Kas & Bank', 5846500000],
      ['  Piutang Usaha', 285000000],
      ['  BBM Dibayar di Muka', 40800000],
      ['  Aset Tetap (neto)', 8355625000],
      ['  Akum. Penyusutan', -1484657764],
      ['Total Aset', 9043267236],
      ['', ''],
      ['KEWAJIBAN', ''],
      ['  Utang Usaha', 120000000],
      ['  Utang Pajak', 36000000],
      ['Total Kewajiban', 156000000],
      ['', ''],
      ['EKUITAS', ''],
      ['  Modal Disetor', 9022869053],
      ['  Laba Ditahan', 0],
      ['  Laba/Rugi Berjalan', -135601817],
      ['Total Ekuitas', 8887267236],
      ['', ''],
      ['Total Kewajiban + Ekuitas', 9043267236],
    ],
    'Neraca'
  )
}

export function exportNeracaSaldo(rows) {
  exportXLSX('Neraca_Saldo',
    ['Kode', 'Nama Akun', 'Debit', 'Kredit'],
    rows.map(r => [r.code, r.name, r.debit || '', r.kredit || '']),
    'Neraca Saldo'
  )
}

export function exportPerubahanEkuitas(rows) {
  exportXLSX('Perubahan_Ekuitas',
    ['Keterangan', 'Modal', 'Laba Ditahan', 'Total Ekuitas'],
    (rows && rows.length) ? rows : [['(tidak ada data)', '-', '-', '-']],
    'Perubahan Ekuitas'
  )
}

export function exportArusKas(cashFlow) {
  const rows = []
  rows.push(['AKTIVITAS OPERASIONAL', ''])
  cashFlow.operasional.items.forEach(i => rows.push([`  ${i.keterangan}`, i.jumlah]))
  rows.push(['Arus Kas Bersih Operasional', cashFlow.operasional.netto])
  rows.push(['', ''])
  rows.push(['AKTIVITAS INVESTASI', ''])
  cashFlow.investasi.items.forEach(i => rows.push([`  ${i.keterangan}`, i.jumlah]))
  rows.push(['Arus Kas Bersih Investasi', cashFlow.investasi.netto])
  rows.push(['', ''])
  rows.push(['AKTIVITAS PENDANAAN', ''])
  cashFlow.pendanaan.items.forEach(i => rows.push([`  ${i.keterangan}`, i.jumlah]))
  rows.push(['Arus Kas Bersih Pendanaan', cashFlow.pendanaan.netto])
  rows.push(['', ''])
  rows.push(['KENAIKAN/(PENURUNAN) KAS BERSIH', cashFlow.totalNetto])
  exportXLSX('Arus_Kas', ['Keterangan', 'Jumlah'], rows, 'Arus Kas')
}

export function exportAnalisis() {
  exportXLSX('Analisis_Rasio',
    ['Rasio', 'Formula', 'Nilai', 'Interpretasi'],
    [
      ['Current Ratio', 'Aset Lancar / Kewajiban Lancar', '39.59x', 'Sangat Baik'],
      ['Debt to Equity', 'Total Utang / Total Ekuitas', '1.76%', 'Rendah'],
      ['Net Profit Margin', 'Laba Bersih / Pendapatan', '-100.2%', 'Rugi'],
      ['Return on Assets', 'Laba Bersih / Total Aset', '-1.50%', 'Negatif'],
      ['Return on Equity', 'Laba Bersih / Total Ekuitas', '-1.53%', 'Negatif'],
      ['Cash Ratio', 'Kas & Bank / Kewajiban Lancar', '37.48x', 'Sangat Baik'],
    ],
    'Analisis Rasio'
  )
}
