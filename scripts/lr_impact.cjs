const XLSX = require('xlsx')
const path = require('path')
const sqlite3 = require('sqlite3')
const DIR = path.join(__dirname, '..', 'src', 'Mei Data')

const twb = XLSX.readFile(path.join(DIR, 'template_jurnal (2).xlsx'))
const trows = XLSX.utils.sheet_to_json(twb.Sheets['Jurnal Transaksi'], { header: 1, defval: null })

const db = new sqlite3.Database(path.join(__dirname, '..', 'server', 'perumda_ledger.qa.db'))
db.all('SELECT code, name, category FROM coa', (err, coaRows) => {
  const coa = {}
  coaRows.forEach(r => { coa[String(r.code).trim()] = r })
  const catNorm = (c) => String(c || '').trim().toLowerCase()

  // Aggregate journal net by app category. For P&L: Pendapatan = K-D, Beban/HPP = D-K.
  let pendapatan = 0, beban = 0, hpp = 0
  let orphanBeban = 0, orphanHpp = 0, orphanOther = 0
  const orphanList = {}
  for (let i = 1; i < trows.length; i++) {
    const r = trows[i]; if (!r) continue
    const code = r[1] != null ? String(r[1]).trim() : ''
    const d = Number(r[4]) || 0, k = Number(r[5]) || 0
    if (d === 0 && k === 0) continue
    const acc = coa[code]
    if (!acc) {
      // classify orphan by code prefix for reporting
      if (code.startsWith('5')) orphanHpp += (d - k)
      else if (code.startsWith('6') || code.startsWith('8')) orphanBeban += (d - k)
      else orphanOther += (d - k)
      orphanList[code] = (orphanList[code] || 0) + (d - k)
      continue
    }
    const cat = catNorm(acc.category)
    if (cat === 'pendapatan') pendapatan += (k - d)
    else if (cat === 'beban') beban += (d - k)
    else if (cat === 'hpp') hpp += (d - k)
  }

  console.log('=== May P&L derived from the journal, using APP COA categories ===')
  console.log('Pendapatan (recognized):      ', pendapatan.toLocaleString('id-ID'))
  console.log('HPP (recognized):             ', hpp.toLocaleString('id-ID'))
  console.log('Beban (recognized):           ', beban.toLocaleString('id-ID'))
  const labaApp = pendapatan - hpp - beban
  console.log('→ Laba/(Rugi) [app-recognized]:', labaApp.toLocaleString('id-ID'))
  console.log('\n--- ORPHANED (codes not in app COA) ---')
  Object.entries(orphanList).forEach(([c, v]) => console.log(`  ${c}: net ${v.toLocaleString('id-ID')}`))
  console.log('  orphan HPP (5xxxx):  ', orphanHpp.toLocaleString('id-ID'))
  console.log('  orphan Beban (6/8):  ', orphanBeban.toLocaleString('id-ID'))
  console.log('  orphan Other:        ', orphanOther.toLocaleString('id-ID'))

  console.log('\n=== If orphans WERE mapped (full P&L) ===')
  const labaFull = pendapatan - (hpp + orphanHpp) - (beban + orphanBeban)
  console.log('→ Laba/(Rugi) [full]:          ', labaFull.toLocaleString('id-ID'))

  console.log('\n=== OFFICIAL Excel "LR PERIOD MEI" (col9, Mei) ===')
  console.log('  JUMLAH PENDAPATAN USAHA:      980.439.333')
  console.log('  JUMLAH BEBAN POKOK PENJUALAN: 122.494.620')
  console.log('  JUMLAH BEBAN USAHA:           1.190.443.891,347')
  console.log('  LABA (RUGI) BERSIH sblm pajak: -317.266.756,787')
  db.close()
})
