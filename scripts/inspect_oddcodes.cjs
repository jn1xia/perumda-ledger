const XLSX = require('xlsx')
const path = require('path')
const DIR = path.join(__dirname, '..', 'src', 'Mei Data')
const mwb = XLSX.readFile(path.join(DIR, 'LAMPIRAN LAPORAN KEUANGAN MEI 2026 NEW  (1).xlsx'))
const rows = XLSX.utils.sheet_to_json(mwb.Sheets['JURNAL MEI 2026'], { header: 1, defval: null })

const odd = ['461436','761658','361362','261288','1161954','811695','1061880']
console.log('Rows where col0 is an odd code (full 8 cols):')
let shown = 0
for (let i = 0; i < rows.length && shown < 25; i++) {
  const r = rows[i]
  if (!r) continue
  const c0 = r[0] != null ? String(r[0]).trim() : ''
  if (odd.includes(c0)) {
    console.log(i, JSON.stringify(r.slice(0, 8)))
    shown++
  }
}

// Also show a window around the first odd-code occurrence to see context
const firstIdx = rows.findIndex(r => r && odd.includes(String(r[0]).trim()))
console.log('\nContext around first odd code (row', firstIdx, '):')
for (let i = Math.max(0, firstIdx - 4); i < firstIdx + 4; i++) {
  console.log(i, JSON.stringify((rows[i] || []).slice(0, 8)))
}
