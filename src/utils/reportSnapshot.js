// reportSnapshot.js
// Browser-side parsers for the official LAMPIRAN report sheets (Neraca, Arus Kas,
// Laba Rugi), mirroring scripts/import_report_data.cjs so an uploaded lampiran can
// be turned into an audited snapshot for any month — no redeploy needed.
import * as XLSX from 'xlsx'

const MONTHS_ID = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
// Sheet-name tokens used across the lampiran files for each month (uppercased).
const MONTH_TOKENS = {
  1: ['JAN', 'JANUARI'], 2: ['FEB', 'FEBRUARI'], 3: ['MARET', 'MAR'], 4: ['APRIL', 'APR'],
  5: ['MEI'], 6: ['JUNI', 'JUN'], 7: ['JULI', 'JUL'], 8: ['AGUSTUS', 'AGT', 'AGS'],
  9: ['SEPTEMBER', 'SEP'], 10: ['OKTOBER', 'OKT'], 11: ['NOVEMBER', 'NOV'], 12: ['DESEMBER', 'DES'],
}

export function periodMonthLabel(period) {
  const m = parseInt(String(period).split('-')[1], 10)
  const y = String(period).split('-')[0]
  return `${MONTHS_ID[m] || ''} ${y}`.trim()
}

// Find the audited sheet (current-year layout) for a prefix + period.
// Prefers an exact "<PREFIX> <TOKEN> <YEAR>" match.
function findSheet(wb, prefix, period) {
  const [year, mm] = String(period).split('-')
  const month = parseInt(mm, 10)
  const tokens = MONTH_TOKENS[month] || []
  const names = wb.SheetNames
  for (const tok of tokens) {
    const exact = `${prefix} ${tok} ${year}`.toUpperCase()
    const hit = names.find(n => n.trim().toUpperCase() === exact)
    if (hit) return hit
  }
  // Fallback: starts with prefix, contains a token, and ends with the year.
  for (const tok of tokens) {
    const hit = names.find(n => {
      const u = n.trim().toUpperCase()
      return u.startsWith(prefix + ' ') && u.includes(tok) && u.endsWith(year)
    })
    if (hit) return hit
  }
  return null
}

// --- NERACA: value in column 8 ---
function parseNeraca(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const rows = []; let order = 0
  for (const row of data) {
    let label = '', value = null, depth = 0
    for (let c = 0; c < Math.min(row.length, 8); c++) {
      if (typeof row[c] === 'string' && row[c].trim()) { label = row[c].trim(); depth = c; break }
    }
    if (!label) continue
    if (label.includes('PERUSAHAAN') || label.includes('LAPORAN') || label.includes('Untuk Periode') ||
        label.includes('Berakhir') || label.match(/^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4}$/) ||
        label.match(/^\(Audited\)$/) || label === 'Rp' || label === 'Rp.') continue
    if (typeof row[8] === 'number') value = row[8]
    rows.push({ order: order++, label, value, depth })
  }
  return rows
}

// --- ARUS KAS: section in col0, item in col1, value in valCol (2) ---
function parseArusKas(ws, valCol = 2) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const rows = []; let order = 0
  for (const row of data) {
    let label = '', value = null, isSection = false
    if (typeof row[0] === 'string' && row[0].trim() && row[0].trim() !== ' ') {
      label = row[0].trim(); isSection = true; value = typeof row[valCol] === 'number' ? row[valCol] : null
    } else if (typeof row[1] === 'string' && row[1].trim() && row[1].trim() !== ' ') {
      label = row[1].trim(); value = typeof row[valCol] === 'number' ? row[valCol] : null
    }
    if (!label) continue
    if (label.includes('PERUSAHAAN') || label.includes('LAPORAN ARUS') || label.includes('Untuk Periode') ||
        label.includes('Audited') || label.includes('2025') || label.includes('2026')) {
      if (!label.includes('Arus Kas')) continue
    }
    rows.push({ order: order++, label, value, isSection })
  }
  return rows
}

// --- LABA RUGI: label before valCol, value in valCol (9) ---
function parseLabaRugi(ws, valCol = 9) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const rows = []; let order = 0
  for (const row of data) {
    let label = '', value = null, depth = 0
    for (let c = 0; c < Math.min(row.length, valCol); c++) {
      if (typeof row[c] === 'string' && row[c].trim()) { label = row[c].trim(); depth = c; break }
    }
    if (!label) continue
    if (label.includes('PERUSAHAAN') || label.includes('LAPORAN LABA') || label.includes('Untuk Periode') ||
        label.includes('Berakhir') || label.match(/^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4}$/) ||
        label.match(/^\(Audited\)$/) || label === 'Rp' || label === 'Rp.' || label === '2.3' || label.startsWith('*')) continue
    if (typeof row[valCol] === 'number') value = row[valCol]
    rows.push({ order: order++, label, value, depth })
  }
  return rows
}

// --- PENERIMAAN (LRA revenue realization): leaf rows with outline in col 3 ---
function parsePenerimaan(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const rows = []
  for (const r of data) {
    const o = r[3] == null ? '' : String(r[3]).trim()
    if (!/^\d+\.\d+$/.test(o)) continue
    rows.push({
      outline: o,
      nama: String(r[4] || '').trim(),
      anggaran: Number(r[6]) || 0,
      target: Number(r[7]) || 0,
      sdBlnLalu: Number(r[8]) || 0,
      bulanIni: Number(r[9]) || 0,
      realisasi: Number(r[10]) || 0,
      persen: Number(r[11]) || 0,
    })
  }
  return rows
}

// Convert an Excel date serial to "YYYY-MM-DD". Falls back to the 1st of the period.
function excelSerialToDate(sn, period) {
  if (typeof sn === 'number' && sn > 40000) {
    return new Date(Math.round((sn - 25569) * 86400 * 1000)).toISOString().split('T')[0]
  }
  return `${period}-01`
}

// --- JURNAL sheet: single-line postings (one account per row) grouped by
// date + bukti into double-entry transactions. Column layout is detected from
// the header row ("Tgl"/"Akun"/"Sub Akun"/"Keterangan"); the account code sits
// in the first column and the two value columns immediately follow "Sub Akun".
function parseJournalSheet(ws, period) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  let hdr = -1
  for (let i = 0; i < Math.min(data.length, 15); i++) {
    if ((data[i] || []).some(c => String(c).trim().toLowerCase() === 'tgl')) { hdr = i; break }
  }
  if (hdr < 0) return []
  const head = data[hdr].map(c => String(c).trim().toLowerCase())
  const tglCol = head.indexOf('tgl')
  const akunCol = head.indexOf('akun')
  const subCol = head.findIndex(c => c === 'sub akun')
  const ketCol = head.findIndex(c => c === 'keterangan')
  const codeCol = 0
  const buktiCol = akunCol > 0 ? akunCol - 1 : tglCol + 1
  const debitCol = subCol >= 0 ? subCol + 1 : 5
  const kreditCol = subCol >= 0 ? subCol + 2 : 6
  const ketC = ketCol >= 0 ? ketCol : kreditCol + 1

  // Group consecutive posting rows by date + bukti (voucher).
  const groups = []; let cur = null
  for (let i = hdr + 1; i < data.length; i++) {
    const r = data[i]; if (!r) continue
    const dateSN = r[tglCol]
    const code = r[codeCol]
    const debit = Number(r[debitCol]) || 0
    const kredit = Number(r[kreditCol]) || 0
    if (!(typeof dateSN === 'number' && dateSN > 40000)) continue
    // Keep posting rows whose No. Akun cell is empty as long as they carry an
    // account NAME and an amount — dropping them silently unbalances the
    // imported month (e.g. Mei 2026: "Utang Usaha"/"Bank BNI" kredit rows have
    // no code and the baseline lost Rp 14.089.878 of kredit).
    if (!code && !String(r[akunCol] || '').trim()) continue
    if (debit === 0 && kredit === 0) continue
    const bukti = String(r[buktiCol] == null ? '' : r[buktiCol]).trim()
    const key = `${dateSN}|${bukti}`
    if (!cur || (bukti && key !== cur.key)) { cur = { key, dateSN, bukti, rows: [] }; groups.push(cur) }
    cur.rows.push({
      akun_code: String(code == null ? '' : code).trim(),
      akun_name: String(r[akunCol] || '').trim(),
      sub_akun: String(r[subCol] || '').trim(),
      debit, kredit,
      keterangan: String(r[ketC] || '').trim(),
    })
  }

  const acctStr = (l) => [l.akun_code, l.akun_name].filter(Boolean).join(' ')
  let seq = 0
  return groups.map(g => {
    const tanggal = excelSerialToDate(g.dateSN, period)
    const lines = g.rows.map(l => ({
      akun_code: l.akun_code,
      akun_name: l.akun_name,
      sub_akun: (l.sub_akun && l.sub_akun !== l.akun_name) ? l.sub_akun : '',
      debit: l.debit,
      kredit: l.kredit,
      keterangan: l.keterangan,
    }))
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
    const totalKredit = lines.reduce((s, l) => s + l.kredit, 0)
    const firstD = lines.find(l => l.debit > 0)
    const firstK = lines.find(l => l.kredit > 0)
    const ket = (lines.find(l => l.keterangan) || {}).keterangan || ''
    seq++
    // Arus Kas type from keterangan ("beban" → pengeluaran, "pendapatan" →
    // pendapatan), with account-class fallback, else transfer.
    const ketLow = String(ket || '').toLowerCase()
    let tipe = 'transfer'
    if (ketLow.includes('beban')) tipe = 'pengeluaran'
    else if (ketLow.includes('pendapatan')) tipe = 'pendapatan'
    else if (lines.some(l => (l.debit || 0) > 0 && /^[568]/.test(String(l.akun_code)))) tipe = 'pengeluaran'
    else if (lines.some(l => (l.kredit || 0) > 0 && /^[47]/.test(String(l.akun_code)))) tipe = 'pendapatan'
    return {
      id: `XL-${period}-U${String(seq).padStart(4, '0')}`,
      tanggal,
      bukti: g.bukti,
      keterangan: ket,
      // Imported journals require approval before they post to the ledger.
      status: 'pending',
      akun_debit: firstD ? acctStr(firstD) : '',
      akun_kredit: firstK ? acctStr(firstK) : '',
      debit: totalDebit,
      kredit: totalKredit,
      lines,
      tipe_transaksi: tipe,
    }
  })
}

/** Extract baseline journals from the lampiran's JURNAL sheet for a period. */
export function extractJournals(workbook, period) {
  const sheet = findSheet(workbook, 'JURNAL', period)
  if (!sheet) return []
  return parseJournalSheet(workbook.Sheets[sheet], period)
}

// --- BEBAN OPERASIONAL: 3-level sheet (group col2 / sub-group col3 / rincian col4),
// name col5, values: anggaran col7, target/bulan col8, sd bln lalu col9, bulan ini
// col10, sd bln ini col11, % col12. "Total" rows are skipped (app re-aggregates).
function parseBebanOperasional(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const rows = []
  for (const r of data) {
    if (!r) continue
    const sub = r[3] == null ? '' : String(r[3]).trim()
    const leaf = r[4] == null ? '' : String(r[4]).trim()
    let outline = ''
    if (/^\d+\.\d+\.\d+$/.test(leaf)) outline = leaf
    else if (/^\d+\.\d+$/.test(sub)) outline = sub
    else continue
    const nama = String(r[5] || '').trim()
    if (!nama || nama.toLowerCase() === 'total') continue
    rows.push({
      outline, nama,
      anggaran: Number(r[7]) || 0,
      target: Number(r[8]) || 0,
      sdBlnLalu: Number(r[9]) || 0,
      bulanIni: Number(r[10]) || 0,
      realisasi: Number(r[11]) || 0,
      persen: Number(r[12]) || 0,
    })
  }
  return rows
}

/**
 * INVESTASI (LRA capital expenditure) — a 3-level sheet like Beban Operasional but
 * where the level-3 detail rows are lettered ("a. …", "b. …") with NO outline
 * number. Layout: group number in col2, item outline (X.Y) in col3, name in col4,
 * values anggaran col6 / target col7 / sd-bln-lalu col8 / bulan-ini col9 /
 * realisasi col10 / % col11. Detail rows sit under their item with an empty col3;
 * we synthesise a stable X.Y.N outline for each so their realisasi is captured
 * (the item row itself usually carries 0 and is recomputed as the sum of details).
 */
function parseInvestasi(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const rows = []
  let curItem = null
  let subSeq = 0
  const num = (v) => Number(v) || 0
  for (const r of data) {
    if (!r) continue
    const itemOutline = r[3] == null ? '' : String(r[3]).trim()
    const name = r[4] == null ? '' : String(r[4]).trim()
    const grp = r[2]

    // Group header row (single number in col2, e.g. "1") — reset item context.
    if ((typeof grp === 'number') || (typeof grp === 'string' && /^\d+$/.test(String(grp).trim()))) {
      curItem = null
    }
    // Total / grand-total rows — skip and reset context.
    if (/^total/i.test(name)) { curItem = null; continue }

    // Item row (X.Y).
    if (/^\d+\.\d+$/.test(itemOutline)) {
      curItem = itemOutline
      subSeq = 0
      rows.push({ outline: itemOutline, nama: name, anggaran: num(r[6]), target: num(r[7]), sdBlnLalu: num(r[8]), bulanIni: num(r[9]), realisasi: num(r[10]), persen: num(r[11]) })
      continue
    }
    // Lettered detail row under the current item — synthesise X.Y.N.
    if (!itemOutline && curItem && name && typeof r[6] === 'number') {
      subSeq++
      rows.push({ outline: `${curItem}.${subSeq}`, nama: name, anggaran: num(r[6]), target: num(r[7]), sdBlnLalu: num(r[8]), bulanIni: num(r[9]), realisasi: num(r[10]), persen: num(r[11]) })
    }
  }
  return rows
}

/**
 * Whether parsed report rows carry enough real numbers to be trusted as an
 * official snapshot. A genuine lampiran sheet (Neraca / Laba Rugi / Arus Kas)
 * always yields dozens of nonzero values; a "control" workbook whose layout
 * differs (values in other columns, formulas referencing external files)
 * parses into labels with null/0 values. Saving such rows as the frozen
 * snapshot silently zeroes the month's reports (kendala 07-07-2026: Beban
 * Gaji 0 di L/R padahal Buku Besar Rp 179 jt), so uploads that fail this
 * check are treated as journal-only imports instead.
 */
export function hasReportValues(rows, minNonZero = 5) {
  return (rows || []).filter(r => typeof r.value === 'number' && r.value !== 0).length >= minNonZero
}

/** Keep only LRA categories whose parsed rows carry real realization/budget numbers. */
export function filterValidLra(lra, minNonZero = 3) {
  const out = {}
  for (const [kat, rows] of Object.entries(lra || {})) {
    const withVals = (rows || []).filter(r =>
      (Number(r.anggaran) || 0) !== 0 || (Number(r.realisasi) || 0) !== 0 ||
      (Number(r.bulanIni) || 0) !== 0 || (Number(r.sdBlnLalu) || 0) !== 0)
    if (withVals.length >= minNonZero) out[kat] = rows
  }
  return out
}

/**
 * Classify what an uploaded workbook actually is for a period:
 *   'snapshot' — official lampiran: valid NERACA + LABA RUGI report sheets →
 *                freeze reports to the sheets, journals load as baseline (XL-).
 *   'jurnal'   — journal book only (JURNAL sheet without readable official
 *                report sheets) → journals load as live JV- entries and the
 *                month's reports are computed from the journals.
 *   null       — nothing usable for this period.
 */
export function classifySnapshot(snap) {
  if (!snap) return null
  if (hasReportValues(snap.neraca) && hasReportValues(snap.labaRugi)) return 'snapshot'
  if ((snap.journals || []).length) return 'jurnal'
  return null
}

/**
 * Detect which periods a workbook covers as a "lampiran" — i.e. it contains a
 * `JURNAL <MONTH> <YEAR>` sheet. Returns [{ period, label, sheet }]. Used by the
 * import modal to decide between the snapshot+baseline flow and a plain template.
 */
export function detectLampiranPeriods(workbook) {
  const out = []
  for (const name of workbook.SheetNames || []) {
    const u = String(name).trim().toUpperCase()
    const m = u.match(/^JURNAL\s+([A-Z]+)\s+(\d{4})$/)
    if (!m) continue
    const tok = m[1], year = m[2]
    let month = null
    for (const [num, toks] of Object.entries(MONTH_TOKENS)) {
      if (toks.includes(tok)) { month = num; break }
    }
    if (!month) continue
    const period = `${year}-${String(month).padStart(2, '0')}`
    if (!out.some(o => o.period === period)) out.push({ period, label: periodMonthLabel(period), sheet: name })
  }
  return out
}

/**
 * Extract the audited snapshot (Neraca + Arus Kas + Laba Rugi + Penerimaan/LRA)
 * plus the underlying journals for a period from an uploaded lampiran workbook.
 * Returns { period, neraca, arusKas, labaRugi, penerimaan, lra, journals, sheets, warnings }.
 */
export function extractSnapshot(workbook, period) {
  const sheets = {
    neraca: findSheet(workbook, 'NERACA', period),
    arusKas: findSheet(workbook, 'ARUS KAS', period),
    labaRugi: findSheet(workbook, 'LABA RUGI', period),
    jurnal: findSheet(workbook, 'JURNAL', period),
    penerimaan: workbook.SheetNames.find(n => n.trim().toLowerCase() === 'penerimaan') || null,
  }
  const warnings = []
  const neraca = sheets.neraca ? parseNeraca(workbook.Sheets[sheets.neraca]) : []
  const arusKas = sheets.arusKas ? parseArusKas(workbook.Sheets[sheets.arusKas], 2) : []
  const labaRugi = sheets.labaRugi ? parseLabaRugi(workbook.Sheets[sheets.labaRugi], 9) : []
  const penerimaan = sheets.penerimaan ? parsePenerimaan(workbook.Sheets[sheets.penerimaan]) : []
  const journals = sheets.jurnal ? parseJournalSheet(workbook.Sheets[sheets.jurnal], period) : []

  // LRA category sheets (Penerimaan / Beban Umum / Investasi) share the same layout.
  const findByName = (name) => workbook.SheetNames.find(n => n.trim().toLowerCase() === name) || null
  const lraDefs = [
    { kategori: 'penerimaan', name: 'penerimaan' },
    { kategori: 'bebanUmum', name: 'beban umum' },
    { kategori: 'bebanInvestasi', name: 'investasi' },
  ]
  const lra = {}
  for (const d of lraDefs) {
    const sn = findByName(d.name)
    if (sn) {
      // Investasi uses the 3-level lettered-detail layout; others are flat X.Y.
      const rows = d.kategori === 'bebanInvestasi'
        ? parseInvestasi(workbook.Sheets[sn])
        : parsePenerimaan(workbook.Sheets[sn])
      if (rows.length) lra[d.kategori] = rows
    }
  }
  // Beban Operasional uses a 3-level layout (group → sub-group → rincian) with the
  // value columns shifted, so it needs a dedicated parser.
  const opSheet = workbook.SheetNames.find(n => n.trim().toLowerCase() === 'beban operasional')
  if (opSheet) { const rows = parseBebanOperasional(workbook.Sheets[opSheet]); if (rows.length) lra.bebanOperasional = rows }
  if (!sheets.neraca) warnings.push(`Sheet NERACA ${periodMonthLabel(period)} tidak ditemukan`)
  if (!sheets.arusKas) warnings.push(`Sheet ARUS KAS ${periodMonthLabel(period)} tidak ditemukan`)
  if (!sheets.labaRugi) warnings.push(`Sheet LABA RUGI ${periodMonthLabel(period)} tidak ditemukan`)
  if (!sheets.jurnal) warnings.push(`Sheet JURNAL ${periodMonthLabel(period)} tidak ditemukan — jurnal tidak diimpor`)
  return { period, neraca, arusKas, labaRugi, penerimaan, lra, journals, sheets, warnings }
}
