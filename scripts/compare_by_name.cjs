const XLSX = require('xlsx')
const path = require('path')
const DIR = path.join(__dirname, '..', 'src', 'Mei Data')
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase()

function byName(rows, { nameCol, dCol, kCol, startRow }) {
  const m = {}
  for (let i = startRow; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue
    const d = Number(r[dCol]) || 0, k = Number(r[kCol]) || 0
    if (d === 0 && k === 0) continue
    const name = norm(r[nameCol])
    if (!m[name]) m[name] = { d: 0, k: 0, raw: r[nameCol] }
    m[name].d += d; m[name].k += k
  }
  return m
}

const twb = XLSX.readFile(path.join(DIR, 'template_jurnal (2).xlsx'))
const trows = XLSX.utils.sheet_to_json(twb.Sheets['Jurnal Transaksi'], { header: 1, defval: null })
const tpl = byName(trows, { nameCol: 2, dCol: 4, kCol: 5, startRow: 1 })

const mwb = XLSX.readFile(path.join(DIR, 'LAMPIRAN LAPORAN KEUANGAN MEI 2026 NEW  (1).xlsx'))
const mrows = XLSX.utils.sheet_to_json(mwb.Sheets['JURNAL MEI 2026'], { header: 1, defval: null })
const off = byName(mrows, { nameCol: 3, dCol: 5, kCol: 6, startRow: 3 })

const names = new Set([...Object.keys(tpl), ...Object.keys(off)])
const diffs = []
names.forEach(n => {
  const t = tpl[n] || { d: 0, k: 0 }
  const o = off[n] || { d: 0, k: 0 }
  const dd = t.d - o.d, dk = t.k - o.k
  if (Math.abs(dd) > 0.5 || Math.abs(dk) > 0.5) diffs.push({ name: (t.raw || o.raw), td: t.d, od: o.d, dd, tk: t.k, ok: o.k, dk })
})
diffs.sort((a, b) => (Math.abs(b.dd) + Math.abs(b.dk)) - (Math.abs(a.dd) + Math.abs(a.dk)))
console.log(`Accounts (by name) with mismatched D or K: ${diffs.length} of ${names.size} names\n`)
diffs.slice(0, 25).forEach(d => {
  console.log(`• ${d.name}`)
  if (Math.abs(d.dd) > 0.5) console.log(`    Debit : template=${d.td.toLocaleString('id-ID')}  official=${d.od.toLocaleString('id-ID')}  diff=${d.dd.toLocaleString('id-ID')}`)
  if (Math.abs(d.dk) > 0.5) console.log(`    Kredit: template=${d.tk.toLocaleString('id-ID')}  official=${d.ok.toLocaleString('id-ID')}  diff=${d.dk.toLocaleString('id-ID')}`)
})
console.log(`\nNames only in template: ${[...Object.keys(tpl)].filter(n => !off[n]).length}`)
console.log(`Names only in official: ${[...Object.keys(off)].filter(n => !tpl[n]).length}`)
