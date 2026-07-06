const XLSX = require('xlsx')
const path = require('path')
const sqlite3 = require('sqlite3')
const DIR = path.join(__dirname, '..', 'src', 'Mei Data')

// Collect template codes + names + debit/kredit totals
const twb = XLSX.readFile(path.join(DIR, 'template_jurnal (2).xlsx'))
const trows = XLSX.utils.sheet_to_json(twb.Sheets['Jurnal Transaksi'], { header: 1, defval: null })
const codeInfo = {}
for (let i = 1; i < trows.length; i++) {
  const r = trows[i]; if (!r) continue
  const code = r[1] != null ? String(r[1]).trim() : ''
  const name = r[2]
  const d = Number(r[4]) || 0, k = Number(r[5]) || 0
  if (d === 0 && k === 0) continue
  if (!codeInfo[code]) codeInfo[code] = { name, d: 0, k: 0 }
  codeInfo[code].d += d; codeInfo[code].k += k
}

const db = new sqlite3.Database(path.join(__dirname, '..', 'server', 'perumda_ledger.qa.db'))
db.all('SELECT code, name, category, type FROM coa', (err, coaRows) => {
  if (err) { console.error(err); process.exit(1) }
  const coa = {}
  coaRows.forEach(r => { coa[String(r.code).trim()] = r })
  console.log(`App COA accounts: ${coaRows.length}`)
  console.log(`Distinct journal codes: ${Object.keys(codeInfo).length}\n`)
  console.log('CODE | jurnal name | D total | K total | in app COA? | app name | category')
  const missing = []
  Object.entries(codeInfo).sort((a,b)=> (b[1].d+b[1].k)-(a[1].d+a[1].k)).forEach(([code, info]) => {
    const hit = coa[code]
    const status = hit ? `YES` : 'MISSING'
    if (!hit) missing.push({ code, ...info })
    console.log(`${code} | ${String(info.name).slice(0,38)} | ${info.d.toLocaleString('id-ID')} | ${info.k.toLocaleString('id-ID')} | ${status} | ${hit ? String(hit.name).slice(0,30) : '-'} | ${hit ? hit.category : '-'}`)
  })
  console.log(`\n===== MISSING CODES (in journal, not in app COA): ${missing.length} =====`)
  let mD = 0, mK = 0
  missing.forEach(m => { mD += m.d; mK += m.k; console.log(`  ${m.code} "${m.name}"  D=${m.d.toLocaleString('id-ID')} K=${m.k.toLocaleString('id-ID')}`) })
  console.log(`  TOTAL missing  D=${mD.toLocaleString('id-ID')}  K=${mK.toLocaleString('id-ID')}`)
  db.close()
})
