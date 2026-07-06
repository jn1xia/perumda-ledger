const XLSX = require('xlsx')
const path = require('path')
const DIR = path.join(__dirname, '..', 'src', 'Mei Data')

function dump(file, sheet, headRows = 8) {
  const wb = XLSX.readFile(path.join(DIR, file))
  const ws = wb.Sheets[sheet]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  console.log(`\n===== ${file} :: "${sheet}" (${rows.length} rows) =====`)
  console.log('-- first', headRows, 'rows --')
  rows.slice(0, headRows).forEach((r, i) => console.log(i, JSON.stringify(r)))
  return rows
}

// Imported template
dump('template_jurnal (2).xlsx', 'Jurnal Transaksi', 12)

// Official May journal
dump('LAMPIRAN LAPORAN KEUANGAN MEI 2026 NEW  (1).xlsx', 'JURNAL MEI 2026', 12)
