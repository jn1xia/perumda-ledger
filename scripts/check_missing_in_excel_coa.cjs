const XLSX = require('xlsx')
const path = require('path')
const DIR = path.join(__dirname, '..', 'src', 'Mei Data')
const wb = XLSX.readFile(path.join(DIR, 'LAMPIRAN LAPORAN KEUANGAN MEI 2026 NEW  (1).xlsx'))
const coa = XLSX.utils.sheet_to_json(wb.Sheets['COA'], { header: 1, defval: null })
const map = {}
coa.forEach(r => { if (r[0] != null) map[String(r[0]).trim()] = r[1] })
console.log('Are the 4 app-missing codes present in the OFFICIAL Excel COA?')
;['21600','62100','11108','52000','51000'].forEach(c => console.log(`  ${c} => ${map[c] || '(NOT in Excel COA either)'}`))
