// periodReport.js
// Official period reports (laporan Triwulan / Semester / Tahunan) as Bagian
// Keuangan prepares them in Excel: visible sheets "NERACA TW I 2026", "LABA
// RUGI SEMESTER I 2026", "ARUS KAS TW III 2026" … plus the LRA tables
// (Penerimaan, Investasi, Beban Umum, Beban Operasional) in the period layout.
// Parsed in the browser (and in node tests) into one self-contained pack that
// the server stores under its period key ("2026-TW1") and the report pages
// render exactly as uploaded.
//
// A pack never touches the monthly data. These workbooks also carry hidden
// copies of monthly sheets ("JURNAL JAN 2026", "NERACA JAN", …); before this
// module existed, Jurnal → Import Excel read those as monthly lampiran and
// replaced January's journals (and July–September's for TW III).
import * as XLSX from 'xlsx'

export const PERIOD_REPORT_DEFS = [
  { code: 'TW1', preset: 'tw1', label: 'Triwulan I', months: [1, 2, 3] },
  { code: 'TW2', preset: 'tw2', label: 'Triwulan II', months: [4, 5, 6] },
  { code: 'TW3', preset: 'tw3', label: 'Triwulan III', months: [7, 8, 9] },
  { code: 'TW4', preset: 'tw4', label: 'Triwulan IV', months: [10, 11, 12] },
  { code: 'S1', preset: 's1', label: 'Semester I', months: [1, 2, 3, 4, 5, 6] },
  { code: 'S2', preset: 's2', label: 'Semester II', months: [7, 8, 9, 10, 11, 12] },
  { code: 'THN', preset: 'tahun', label: 'Tahunan', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
]

export const PERIOD_KEY_RE = /^(\d{4})-(TW[1-4]|S[12]|THN)$/

const defOfCode = (code) => PERIOD_REPORT_DEFS.find(d => d.code === code) || null

/** Storage key of a period preset ('tw1' → '2026-TW1'), or null for a month. */
export function periodReportKey(preset, year = 2026) {
  const d = PERIOD_REPORT_DEFS.find(x => x.preset === preset)
  return d ? `${year}-${d.code}` : null
}

/** { year, code, preset, label, months } of a key like '2026-S1', or null. */
export function parsePeriodKey(key) {
  const m = String(key || '').match(PERIOD_KEY_RE)
  if (!m) return null
  const d = defOfCode(m[2])
  return d ? { year: Number(m[1]), ...d } : null
}

/** 'Triwulan I 2026' for '2026-TW1'. */
export function periodReportLabel(key) {
  const p = parsePeriodKey(key)
  return p ? `${p.label} ${p.year}` : String(key || '')
}

const ROMAN = { I: 1, II: 2, III: 3, IV: 4 }
const REPORT_OF_PREFIX = (p) => (/^NERACA$/.test(p) ? 'neraca' : /^LABA/.test(p) ? 'labaRugi' : 'arusKas')
// "<REPORT> <PERIOD> <YEAR>": TW I…IV / TRIWULAN I…IV / TW 1…4, SEMESTER I/II /
// SMT I/II, TAHUN / TAHUNAN. Month names never match, and neither do the
// hidden template tabs without a year ("NERACA TW1", "LR S1").
const SHEET_NAME_RE = /^(NERACA|LABA\s*\(?RUGI\)?|ARUS\s+KAS)\s+(TW|TRIWULAN|SEMESTER|SMT|TAHUN|TAHUNAN)\s*(IV|III|II|I|[1-4])?\s+(\d{4})$/

/** { report, code, year } for an official period report sheet name, else null. */
export function parsePeriodSheetName(name) {
  const u = String(name || '').trim().toUpperCase().replace(/\s+/g, ' ')
  const m = u.match(SHEET_NAME_RE)
  if (!m) return null
  const [, prefix, kind, numTok, year] = m
  const num = numTok ? (ROMAN[numTok] || Number(numTok)) : null
  let code = null
  if (kind === 'TW' || kind === 'TRIWULAN') code = num >= 1 && num <= 4 ? `TW${num}` : null
  else if (kind === 'SEMESTER' || kind === 'SMT') code = num === 1 || num === 2 ? `S${num}` : null
  else code = num == null ? 'THN' : null
  return code ? { report: REPORT_OF_PREFIX(prefix), code, year: Number(year) } : null
}

/** Whether a sheet is hidden in the workbook (unknown visibility = visible). */
export function isSheetHidden(workbook, name) {
  const i = (workbook.SheetNames || []).indexOf(name)
  const meta = workbook.Workbook && workbook.Workbook.Sheets && workbook.Workbook.Sheets[i]
  return !!(meta && meta.Hidden)
}

/**
 * Official period reports present in a workbook: [{ key, code, year, preset,
 * label, sheets: { neraca, labaRugi, arusKas } }]. Only VISIBLE sheets count —
 * the division's monthly workbooks keep hidden templates of every period.
 * A pack needs at least its Neraca or its Laba Rugi.
 */
export function detectPeriodPacks(workbook) {
  const byKey = new Map()
  for (const name of workbook.SheetNames || []) {
    const p = parsePeriodSheetName(name)
    if (!p || isSheetHidden(workbook, name)) continue
    const key = `${p.year}-${p.code}`
    if (!byKey.has(key)) {
      const d = defOfCode(p.code)
      byKey.set(key, { key, code: p.code, year: p.year, preset: d.preset, label: `${d.label} ${p.year}`, sheets: {} })
    }
    const e = byKey.get(key)
    if (!e.sheets[p.report]) e.sheets[p.report] = name
  }
  return [...byKey.values()].filter(e => e.sheets.neraca || e.sheets.labaRugi)
}

// ── Cell access ──────────────────────────────────────────────────────────────
// Rows of cell objects indexed by ABSOLUTE column (0 = column A), whatever the
// sheet's used range starts at: the ARUS KAS sheets start at column B. Read
// within bounds — a stray format can stretch a used range to the whole sheet
// (A1:XFD1048576); the report tables sit in the first rows and columns.
const MAX_ROWS = 3000
const MAX_COLS = 80
function readGrid(ws) {
  if (!ws || !ws['!ref']) return []
  const range = XLSX.utils.decode_range(ws['!ref'])
  const lastRow = Math.min(range.e.r, range.s.r + MAX_ROWS - 1)
  const lastCol = Math.min(range.e.c, MAX_COLS - 1)
  const rows = []
  for (let r = range.s.r; r <= lastRow; r++) {
    const row = []
    for (let c = 0; c <= lastCol; c++) {
      row.push(c < range.s.c ? null : (ws[XLSX.utils.encode_cell({ r, c })] || null))
    }
    rows.push(row)
  }
  return rows
}

// Text of a cell as Excel shows it. Outline numbers typed as numbers keep their
// displayed form ("1.10", not 1.1).
function text(cell) {
  if (!cell || cell.v == null || cell.t === 'e') return ''
  if (cell.t === 's') return String(cell.v).replace(/\s+/g, ' ').trim()
  return String(cell.w != null ? cell.w : cell.v).replace(/\s+/g, ' ').trim()
}

const num = (cell) => (cell && cell.t === 'n' && Number.isFinite(cell.v) ? cell.v : null)

// ── Neraca / Laba Rugi / Arus Kas ────────────────────────────────────────────
// A column header names a period ("Triwulan I", "Semester I", "Desember 2025",
// "Tahun 2026"); the line below may add "(Audited)".
const PERIOD_HEAD_RE = /\b(triwulan|semester|tahun|januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\b|\b20\d\d\b/i
const TITLE_LINE_RE = /untuk periode|berakhir|^laporan\b|perusahaan/i
const SIGNATURE_RE = /^(direktur|mengetahui|disetujui|dibuat oleh|diperiksa)/i

/**
 * One statement sheet → { company, title, subtitle, columns: [current,
 * comparison], rows: [{ label, depth, values: [current, comparison] }] }.
 * Columns come from the header line, so the comparison is whatever the
 * division chose: "Desember 2025 (Audited)" for TW I / Semester I, the
 * previous quarter for TW II–IV.
 */
export function parseStatementSheet(ws) {
  const grid = readGrid(ws)
  let hdr = -1, cols = []
  for (let i = 0; i < Math.min(grid.length, 30) && hdr < 0; i++) {
    const hits = []
    grid[i].forEach((cell, c) => {
      const t = text(cell)
      if (c >= 2 && cell && cell.t === 's' && t.length <= 40 && PERIOD_HEAD_RE.test(t) && !TITLE_LINE_RE.test(t)) hits.push(c)
    })
    if (hits.length) { hdr = i; cols = hits.slice(0, 2) }
  }
  if (hdr < 0) return null

  // Header labels, with the "(Audited)" line below when present.
  const next = grid[hdr + 1] || []
  const subUsed = cols.some(c => next[c] && next[c].t === 's' && text(next[c]))
  const columns = cols.map(c => [text(grid[hdr][c]), subUsed ? text(next[c]) : ''].filter(Boolean).join(' '))

  // Title lines above the header.
  let company = '', title = '', subtitle = ''
  for (let i = 0; i < hdr; i++) {
    const t = grid[i].map(text).filter(Boolean).filter(s => !/^\d+(\.\d+)*$/.test(s)).join(' ')
    if (!t) continue
    if (/perusahaan/i.test(t)) company = t
    else if (/untuk periode|berakhir/i.test(t)) subtitle = t
    else if (/^laporan\b/i.test(t) && company) title = t
    else if (/^laporan\b/i.test(t) && !title) title = t
  }

  const firstValCol = Math.min(...cols)
  const rows = []
  let minDepth = Infinity
  for (let i = hdr + (subUsed ? 2 : 1); i < grid.length; i++) {
    const r = grid[i]
    if (r.some(cell => SIGNATURE_RE.test(text(cell)))) break
    let label = '', lc = -1
    for (let c = 0; c < firstValCol; c++) {
      const t = text(r[c])
      if (t && r[c].t === 's') { label = t; lc = c; break }
    }
    if (!label) continue
    minDepth = Math.min(minDepth, lc)
    rows.push({ label, depth: lc, values: cols.map(c => num(r[c])) })
  }
  rows.forEach(row => { row.depth -= minDepth })
  return { company, title, subtitle, columns, rows }
}

// ── LRA tables (period layout) ───────────────────────────────────────────────
// Header line holds "Program dan Kegiatan", "Kinerja", the budget columns, the
// Realisasi group, Capaian / Selisih / Deviasi and "Penjelasan …"; then a
// sub-header line ("Triwulan Sebelumnya" | "Triwulan I" | "Sd Triwulan I", or
// a single "Semester I"), the column numbers "(1)…(13)" and the formula line
// ("(5)/4", "(7)+(8)", …). The quarterly sheets carry three realisasi columns,
// the semester sheets one.
const isNumMarker = (t) => /^\(\d+\)$/.test(t)
const isFormula = (t) => /^\(\d+\)\s*[-+*/]/.test(t) || /^\(\d+\)\s*\/\s*\d+$/.test(t)
const normGroup = (t) => (/^reali/i.test(t) ? 'Realisasi' : t)

function lraColumns(grid, h, kinerjaCol, noteCol) {
  // Lines below the header: sub-header, numbers, formulas (in that order).
  let numRow = -1
  for (let i = h + 1; i <= h + 3 && i < grid.length; i++) {
    if (grid[i].filter(cell => isNumMarker(text(cell))).length >= 3) { numRow = i; break }
  }
  const sub = numRow > h + 1 ? grid[h + 1] : []
  const nums = numRow >= 0 ? grid[numRow] : []
  const forms = numRow >= 0 && grid[numRow + 1] && grid[numRow + 1].some(cell => isFormula(text(cell))) ? grid[numRow + 1] : []
  const dataStart = (forms.length ? numRow + 2 : numRow >= 0 ? numRow + 1 : h + 2)

  const end = noteCol > kinerjaCol ? noteCol : grid[h].length
  const valueCols = []
  for (let c = kinerjaCol + 1; c < end; c++) {
    if (numRow >= 0 ? isNumMarker(text(nums[c])) : text(grid[h][c])) valueCols.push(c)
  }
  let groupHead = ''
  const columns = valueCols.map(c => {
    const hd = text(grid[h][c]), sb = text(sub[c])
    let label, group = null
    if (sb === '%') { label = `${hd} %`; groupHead = '' }
    else if (sb) { if (hd) groupHead = hd; group = normGroup(groupHead || hd); label = sb }
    else { label = hd; groupHead = '' }
    return { col: c, label, group, num: text(nums[c]), formula: text(forms[c]) }
  })
  // Roles, for the rekap view and the exports.
  const realCols = columns.filter(cm => cm.group === 'Realisasi')
  columns.forEach((cm, i) => {
    if (i === 0) cm.role = 'anggaran'
    else if (i === 1) cm.role = 'target'
    else if (cm.group === 'Realisasi') {
      const k = realCols.indexOf(cm)
      cm.role = realCols.length === 3 ? ['prev', 'current', 'cumulative'][k] : (k === realCols.length - 1 ? 'current' : `real${k}`)
    } else if (/^capaian/i.test(cm.label)) cm.role = 'capaian'
    else if (/^selisih/i.test(cm.label)) cm.role = 'selisih'
    else if (/^deviasi/i.test(cm.label)) cm.role = 'deviasi'
    else cm.role = `col${i}`
  })
  return { columns, dataStart }
}

/**
 * One LRA sheet in the period layout → { title, columns, kinerjaLabel, rows }.
 * Rows keep the sheet's order and kind: division / caption / group / item /
 * detail (lettered Investasi rincian) / total / grandtotal / note, with the
 * outline number, the name, the Kinerja Indikator, the values by column and
 * the "Penjelasan dan Tindak Lanjut" text.
 */
export function parseLraTable(ws) {
  const grid = readGrid(ws)
  const h = grid.findIndex((r, i) => i < 25 && r.some(cell => /^program\b/i.test(text(cell))))
  if (h < 0) return null
  const head = grid[h]
  const programCol = head.findIndex(cell => /^program\b/i.test(text(cell)))
  const kinerjaCol = head.findIndex(cell => /^kinerja/i.test(text(cell)))
  if (kinerjaCol <= programCol) return null
  const noteCol = head.findIndex(cell => /^penjelasan/i.test(text(cell)))
  const { columns, dataStart } = lraColumns(grid, h, kinerjaCol, noteCol)
  if (columns.length < 3) return null

  // Title: the last title line above the header, without its section number.
  let title = ''
  for (let i = 0; i < h; i++) {
    const t = grid[i].map(text).filter(Boolean).join(' ').replace(/^\d+(\.\d+)*\s+/, '')
    if (t) title = t
  }

  const rows = []
  for (let i = dataStart; i < grid.length; i++) {
    const r = grid[i]
    let c0 = -1
    for (let c = 0; c < kinerjaCol; c++) if (text(r[c])) { c0 = c; break }
    if (c0 < 0) continue
    if (r.some(cell => SIGNATURE_RE.test(text(cell)))) break
    const values = columns.map(cm => num(r[cm.col]))
    const hasValues = values.some(v => v != null && v !== 0)
    const hasNumbers = values.some(v => v != null)
    const kinerja = text(r[kinerjaCol])
    const penjelasan = noteCol >= 0 ? text(r[noteCol]) : ''
    if (c0 < programCol) {
      // "No | Divisi | Program": the division line opening the table.
      const parts = []
      for (let c = c0 + 1; c < kinerjaCol; c++) if (text(r[c])) parts.push(text(r[c]))
      rows.push({ kind: 'division', outline: '', nama: parts.join(' — '), kinerja: '', values, penjelasan, depth: 0 })
      continue
    }
    const first = text(r[c0])
    let outline = '', nama = first
    const solo = first.match(/^(\d+(?:\.\d+)*)\.?$/)
    const inline = first.match(/^(\d+(?:\.\d+)*)\.\s+(.+)$/)
    if (solo) {
      outline = solo[1]
      nama = ''
      for (let c = c0 + 1; c < kinerjaCol; c++) if (text(r[c])) { nama = text(r[c]); break }
    } else if (inline) {
      outline = inline[1]; nama = inline[2]
    }
    let kind
    if (/^\*/.test(nama)) kind = 'note'
    else if (!outline && /^total$/i.test(nama)) kind = 'total'
    else if (!outline && /^(total|jumlah)\b/i.test(nama)) kind = 'grandtotal'
    else if (outline) kind = (kinerja || hasValues) ? 'item' : 'group'
    // Un-numbered lines with figures ("a. Penataan ruang…" under an Investasi
    // item, "Piutang Bapok (Bulan Sebelumnya)") are value rows even at zero.
    else kind = hasNumbers || kinerja || /^[a-z]\.\s/i.test(nama) ? 'detail' : 'caption'
    rows.push({ kind, outline, nama, kinerja, values, penjelasan, depth: c0 - programCol })
  }
  return { title, columns, kinerjaLabel: [text(head[kinerjaCol]), text((grid[h + 1] || [])[kinerjaCol])].filter(Boolean).join(' '), rows }
}

// LRA sheets of a period workbook (trimmed, lower-case names; visible first).
const LRA_SHEETS = [
  { kategori: 'penerimaan', names: ['penerimaan'] },
  { kategori: 'bebanInvestasi', names: ['investasi', 'beban investasi'] },
  { kategori: 'bebanUmum', names: ['beban umum'] },
  { kategori: 'bebanOperasional', names: ['beban operasional'] },
]

function findLraSheet(workbook, names) {
  const hits = (workbook.SheetNames || []).filter(n => names.includes(String(n).trim().toLowerCase()))
  return hits.find(n => !isSheetHidden(workbook, n)) || hits[0] || null
}

// "Triwulan I" must not match "Triwulan II"; the year reads "Tahun" or "Tahunan".
const titleHasPeriod = (title, label) => {
  const pattern = label === 'Tahunan' ? 'tahun(?:an)?' : label.replace(/\s+/g, '\\s+')
  return new RegExp(`\\b${pattern}(?![A-Z])`, 'i').test(String(title || ''))
}

/**
 * The pack for one period key of a workbook: { version, key, code, year,
 * preset, label, fileName, company, reports: { neraca, labaRugi, arusKas },
 * lra: { penerimaan, bebanInvestasi, bebanUmum, bebanOperasional }, warnings }.
 * When the workbook holds several periods, an LRA table belongs to the one
 * its title names ("Laporan Penerimaan Triwulan I").
 */
export function extractPeriodPack(workbook, key, { fileName = '' } = {}) {
  const packs = detectPeriodPacks(workbook)
  const det = packs.find(p => p.key === key)
  if (!det) throw new Error(`Laporan ${periodReportLabel(key)} tidak ditemukan di berkas ini`)
  const def = defOfCode(det.code)
  const warnings = []

  const reports = {}
  for (const report of ['neraca', 'labaRugi', 'arusKas']) {
    const sheet = det.sheets[report]
    const names = { neraca: 'NERACA', labaRugi: 'LABA RUGI', arusKas: 'ARUS KAS' }
    if (!sheet) { warnings.push(`Sheet ${names[report]} ${def.label.toUpperCase()} ${det.year} tidak ditemukan`); continue }
    const parsed = parseStatementSheet(workbook.Sheets[sheet])
    const nonZero = parsed ? parsed.rows.filter(r => r.values[0] != null && r.values[0] !== 0).length : 0
    if (!parsed || nonZero < 5) { warnings.push(`Sheet "${sheet}" tidak memuat angka yang terbaca — dilewati`); continue }
    reports[report] = { sheet, ...parsed }
  }

  const lra = {}
  for (const d of LRA_SHEETS) {
    const sheet = findLraSheet(workbook, d.names)
    if (!sheet) continue
    const table = parseLraTable(workbook.Sheets[sheet])
    if (!table || !table.rows.some(r => r.kind === 'item')) continue
    // A workbook of several periods assigns each table by its title
    // ("Laporan Penerimaan Triwulan I"). A one-period workbook takes every
    // table; it only warns when neither the title nor the column headers name
    // the period (Beban Umum's title has none, its "Anggaran Triwulan I" does).
    const byTitle = titleHasPeriod(table.title, def.label)
    if (packs.length > 1 && !byTitle) continue
    if (!byTitle && !titleHasPeriod(table.columns.map(c => c.label).join(' | '), def.label)) {
      warnings.push(`Sheet "${sheet.trim()}" tidak menyebut ${def.label} di judul maupun kolomnya — periksa isinya`)
    }
    lra[d.kategori] = { sheet, ...table }
  }

  const company = (reports.labaRugi || reports.neraca || reports.arusKas || {}).company || ''
  return {
    version: 1, key, code: det.code, year: det.year, preset: det.preset, label: det.label,
    fileName, company, reports, lra, warnings,
  }
}

/** Whether a pack carries enough to stand as the official report. */
export function isUsablePeriodPack(pack) {
  return !!(pack && pack.reports && (pack.reports.neraca || pack.reports.labaRugi))
}

/**
 * Rekap rows of an official LRA table, as the division's "Rekap …" sheets
 * show them: every outline line with Anggaran 1 Tahun, Target periode,
 * Realisasi periode and %, plus the Total lines.
 */
export function lraRekapRows(table) {
  if (!table) return []
  const idx = (role) => table.columns.findIndex(c => c.role === role)
  const ia = idx('anggaran'), it = idx('target'), ir = idx('current'), ip = idx('capaian')
  const pick = (r, i) => (i >= 0 ? r.values[i] : null)
  return table.rows
    .filter(r => ['group', 'item', 'detail', 'total', 'grandtotal'].includes(r.kind))
    .map(r => ({
      kind: r.kind, outline: r.outline, nama: r.nama, depth: r.depth,
      anggaran: pick(r, ia), target: pick(r, it), realisasi: pick(r, ir), persen: pick(r, ip),
    }))
}
