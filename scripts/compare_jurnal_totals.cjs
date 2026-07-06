const XLSX = require('xlsx')
const path = require('path')
const DIR = path.join(__dirname, '..', 'src', 'Mei Data')

const serialToDate = (s) => {
  if (typeof s !== 'number') return s
  const d = XLSX.SSF.parse_date_code(s)
  return d ? `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}` : s
}

function analyze(label, rows, { codeCol, dateCol, dCol, kCol, startRow }) {
  let totalD = 0, totalK = 0, n = 0
  const months = {}
  const byCode = {}
  for (let i = startRow; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    const d = Number(r[dCol]) || 0
    const k = Number(r[kCol]) || 0
    if (d === 0 && k === 0) continue
    n++
    totalD += d; totalK += k
    const dt = serialToDate(r[dateCol])
    const m = (typeof dt === 'string' && dt.length >= 7) ? dt.slice(0,7) : 'other'
    months[m] = (months[m] || 0) + 1
    const code = r[codeCol] != null ? String(r[codeCol]).trim() : '(none)'
    if (!byCode[code]) byCode[code] = { d: 0, k: 0 }
    byCode[code].d += d; byCode[code].k += k
  }
  console.log(`\n===== ${label} =====`)
  console.log(`lines with amount: ${n}`)
  console.log(`total Debit:  ${totalD.toLocaleString('id-ID')}`)
  console.log(`total Kredit: ${totalK.toLocaleString('id-ID')}`)
  console.log(`balance diff: ${(totalD - totalK).toLocaleString('id-ID')}`)
  console.log(`months:`, JSON.stringify(months))
  return { totalD, totalK, byCode, n }
}

// template_jurnal: Tanggal=0, No.Akun=1, Akun=2, Sub=3, D=4, K=5, Ket=6
const twb = XLSX.readFile(path.join(DIR, 'template_jurnal (2).xlsx'))
const trows = XLSX.utils.sheet_to_json(twb.Sheets['Jurnal Transaksi'], { header: 1, defval: null })
const tpl = analyze('template_jurnal (IMPORTED to app)', trows, { codeCol: 1, dateCol: 0, dCol: 4, kCol: 5, startRow: 1 })

// JURNAL MEI 2026: code=0, Tgl=1, Akun=3, Sub=4, D=5, K=6, Ket=7
const mwb = XLSX.readFile(path.join(DIR, 'LAMPIRAN LAPORAN KEUANGAN MEI 2026 NEW  (1).xlsx'))
const mrows = XLSX.utils.sheet_to_json(mwb.Sheets['JURNAL MEI 2026'], { header: 1, defval: null })
const off = analyze('JURNAL MEI 2026 (official)', mrows, { codeCol: 0, dateCol: 1, dCol: 5, kCol: 6, startRow: 3 })

// Per-code comparison (debit side, expense-ish)
console.log('\n===== PER-CODE DEBIT comparison (top differences) =====')
const codes = new Set([...Object.keys(tpl.byCode), ...Object.keys(off.byCode)])
const diffs = []
codes.forEach(c => {
  const t = tpl.byCode[c]?.d || 0
  const o = off.byCode[c]?.d || 0
  if (Math.abs(t - o) > 0.5) diffs.push({ code: c, template: t, official: o, diff: t - o })
})
diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
diffs.slice(0, 30).forEach(d => console.log(`${d.code}: template=${d.template.toLocaleString('id-ID')} official=${d.official.toLocaleString('id-ID')} diff=${d.diff.toLocaleString('id-ID')}`))
