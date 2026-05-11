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

export function exportPerubahanEkuitas() {
  exportXLSX('Perubahan_Ekuitas',
    ['Keterangan', 'Modal Disetor', 'Laba Ditahan', 'Total Ekuitas'],
    [
      ['Saldo Awal (1 Jan 2026)', 9022869053, 0, 9022869053],
      ['Penambahan Modal', '-', '-', '-'],
      ['Rugi Bersih Periode Berjalan', '-', -135601817, -135601817],
      ['Dividen', '-', '-', '-'],
      ['Saldo Akhir (31 Jan 2026)', 9022869053, -135601817, 8887267236],
    ],
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
