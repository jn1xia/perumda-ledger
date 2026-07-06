const XLSX = require('xlsx')
const path = require('path')
const DIR = path.join(__dirname, '..', 'src', 'Mei Data')
const wb = XLSX.readFile(path.join(DIR, 'LAMPIRAN LAPORAN KEUANGAN MEI 2026 NEW  (1).xlsx'))

// COA sheet
const coa = XLSX.utils.sheet_to_json(wb.Sheets['COA'], { header: 1, defval: null })
console.log('===== COA (first 20) =====')
coa.slice(0, 20).forEach((r, i) => console.log(i, JSON.stringify(r)))

// Build code->name map, search the codes seen in jurnal
const codeName = {}
coa.forEach(r => { if (r[0] != null) codeName[String(r[0]).trim()] = r[1] })
console.log('\n-- lookups --')
;['51000','61140','62050','61060','61050','11101','46143'].forEach(c => console.log(c, '=>', codeName[c]))

// JURNAL MEI 2026 — show explicit columns for rows 3..14
console.log('\n===== JURNAL MEI 2026 columns (rows 3-14) =====')
const jm = XLSX.utils.sheet_to_json(wb.Sheets['JURNAL MEI 2026'], { header: 1, defval: null })
console.log('col idx:    0=code? 1=Tgl 3=Akun 4=SubAkun 5=D 6=K 7=Ket')
jm.slice(3, 15).forEach((r, i) => console.log(i + 3, 'c0=', r[0], '| c1=', r[1], '| c3=', r[3], '| c5(D)=', r[5], '| c6(K)=', r[6]))
