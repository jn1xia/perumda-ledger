const XLSX = require('xlsx')
const path = require('path')
const DIR = path.join(__dirname, '..', 'src', 'Mei Data')
const wb = XLSX.readFile(path.join(DIR, 'LAMPIRAN LAPORAN KEUANGAN MEI 2026 NEW  (1).xlsx'))

function findLabeled(sheet, keywords, maxCols = 30) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null })
  console.log(`\n===== ${sheet} — rows matching keywords =====`)
  rows.forEach((r, i) => {
    if (!r) return
    const label = r.map(c => (typeof c === 'string' ? c : '')).join(' ').toLowerCase()
    if (keywords.some(k => label.includes(k))) {
      // print non-null cells with their column index
      const cells = []
      for (let c = 0; c < Math.min(r.length, maxCols); c++) {
        if (r[c] != null && r[c] !== '') cells.push(`[${c}]${typeof r[c] === 'number' ? r[c].toLocaleString('id-ID') : r[c]}`)
      }
      console.log(i, cells.join('  '))
    }
  })
}

findLabeled('LABA RUGI MEI 2026', ['jumlah pendapatan','total pendapatan','jumlah beban','total beban','laba','rugi','pendapatan usaha','beban usaha','beban pokok'])
findLabeled('NERACA MEI 2026', ['jumlah aset','total aset','jumlah aktiva','jumlah kewajiban','jumlah liabilitas','jumlah ekuitas','total ekuitas','jumlah kewajiban dan ekuitas'])
