const XLSX = require('xlsx')
const path = require('path')

const DIR = path.join(__dirname, '..', 'src', 'Mei Data')
const files = ['LAMPIRAN LAPORAN KEUANGAN MEI 2026 NEW  (1).xlsx', 'template_jurnal (2).xlsx']

for (const f of files) {
  console.log('\n══════════════════════════════════════════════════')
  console.log('FILE:', f)
  console.log('══════════════════════════════════════════════════')
  const wb = XLSX.readFile(path.join(DIR, f))
  wb.SheetNames.forEach((name, i) => {
    const ws = wb.Sheets[name]
    const ref = ws['!ref'] || 'EMPTY'
    const range = ref !== 'EMPTY' ? XLSX.utils.decode_range(ref) : null
    const rows = range ? range.e.r - range.s.r + 1 : 0
    const cols = range ? range.e.c - range.s.c + 1 : 0
    console.log(`  [${i}] "${name}"  — ${rows} rows x ${cols} cols  (ref ${ref})`)
  })
}
