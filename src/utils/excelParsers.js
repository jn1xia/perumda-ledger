/**
 * excelParsers.js
 * Module-specific Excel parsers — matches LAMPIRAN LAPORAN KEUANGAN format.
 *
 * Journal sheet format  : Tgl | No.Akun | Akun | SubAkun | D | K | Keterangan
 * Neraca Saldo format   : Akun | Default | SaldoAwal | D | K | SaldoAkhir
 * COA format            : KodeAkun | NamaAkun
 * Generic modules       : flexible header detection
 */
import * as XLSX from 'xlsx'

// ─── Date helpers ─────────────────────────────────────────────────────────────
function parseExcelDate(val, fallback = '2026-01-01') {
  if (!val && val !== 0) return fallback
  if (typeof val === 'number' && val > 40000) {
    return new Date((val - 25569) * 86400 * 1000).toISOString().split('T')[0]
  }
  if (typeof val === 'string') {
    const trimmed = val.trim()
    // dd/mm/yyyy or dd-mm-yyyy
    const m = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
    if (m) {
      const yr = m[3].length === 2 ? '20' + m[3] : m[3]
      return `${yr}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
    }
    // yyyy-mm-dd already
    if (trimmed.match(/^\d{4}-\d{2}-\d{2}/)) return trimmed.split('T')[0]
  }
  return fallback
}

function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return Math.abs(val)
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 0 : Math.abs(n)
}

function normalizeHeader(h) {
  return String(h || '').toLowerCase().replace(/[\s.\-_]+/g, '')
}

// ─── Detect sheet type by header patterns ─────────────────────────────────────
export function detectSheetType(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false })
  // Find the header row (first row with >2 non-empty cells)
  const headerRowIdx = rows.findIndex(r => r.filter(Boolean).length >= 2)
  if (headerRowIdx < 0) return { type: 'unknown', headerRowIdx: 0, rows }

  const headers = rows[headerRowIdx].map(normalizeHeader)
  const sample  = rows.slice(headerRowIdx).filter(r => r.filter(Boolean).length >= 2)

  if (headers.some(h => h.includes('keterangan') || h.includes('subakun')) &&
      headers.some(h => h === 'd' || h.includes('debet') || h.includes('debit')))
    return { type: 'jurnal', headerRowIdx, headers, sample }

  if (headers.some(h => h.includes('saldoawal') || h.includes('saldoakhir')) &&
      headers.some(h => h.includes('akun') || h.includes('default')))
    return { type: 'neraca_saldo', headerRowIdx, headers, sample }

  if ((headers[0]?.includes('akun') || headers[0]?.match(/^\d{5}/)) &&
      headers.length <= 3)
    return { type: 'coa', headerRowIdx, headers, sample }

  if (headers.some(h => h.includes('pelanggan') || h.includes('customer') || h.includes('piutang')))
    return { type: 'piutang', headerRowIdx, headers, sample }

  if (headers.some(h => h.includes('supplier') || h.includes('vendor') || h.includes('hutang')))
    return { type: 'hutang', headerRowIdx, headers, sample }

  if (headers.some(h => h.includes('perolehan') || h.includes('aset') || h.includes('aktiva')))
    return { type: 'aset', headerRowIdx, headers, sample }

  if (headers.some(h => h.includes('stok') || h.includes('persediaan') || h.includes('barang')))
    return { type: 'persediaan', headerRowIdx, headers, sample }

  if (headers.some(h => h.includes('anggaran') || h.includes('rka') || h.includes('realisasi')))
    return { type: 'anggaran', headerRowIdx, headers, sample }

  return { type: 'unknown', headerRowIdx, headers, sample }
}

// Derive the Arus Kas transaction type when the upload has no explicit Tipe column.
// Rule: keterangan mengandung "beban" → pengeluaran, "pendapatan" → pendapatan;
// fallback ke kelas akun (beban/HPP di debit → pengeluaran, pendapatan di kredit →
// pendapatan); selain itu → transfer.
function deriveTipe(ket, lines) {
  const k = String(ket || '').toLowerCase()
  if (k.includes('beban')) return 'pengeluaran'
  if (k.includes('pendapatan')) return 'pendapatan'
  const ls = Array.isArray(lines) ? lines : []
  const onDebit = ls.filter(l => (Number(l.debit) || 0) > 0).map(l => String(l.akun_code || ''))
  const onKredit = ls.filter(l => (Number(l.kredit) || 0) > 0).map(l => String(l.akun_code || ''))
  if (onDebit.some(c => /^[568]/.test(c))) return 'pengeluaran'   // beban/HPP di sisi debit
  if (onKredit.some(c => /^[47]/.test(c))) return 'pendapatan'    // pendapatan di sisi kredit
  return 'transfer'
}

// ─── parseJurnal ──────────────────────────────────────────────────────────────
// Format: Tgl | No.Akun | Akun | Sub Akun | D | K | Keterangan | Tipe
// Groups rows into journal entries with proper `lines` arrays.
// Consecutive rows sharing the same date + keterangan are merged into one entry.
export function parseJurnal(worksheet, month = null) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false })

  // Find header row
  const hIdx = rows.findIndex(r => {
    const h = r.map(normalizeHeader)
    return h.some(x => x === 'd' || x.includes('debet') || x.includes('debit')) &&
           h.some(x => x === 'k' || x.includes('kredit'))
  })
  if (hIdx < 0) throw new Error('Header kolom D/K tidak ditemukan')

  const headers = rows[hIdx].map(normalizeHeader)

  const iTgl   = headers.findIndex(h => h.includes('tgl') || h.includes('tanggal'))
  const iD     = headers.findIndex(h => h === 'd' || h.includes('debet') || h.includes('debit'))
  const iK     = headers.findIndex(h => h === 'k' || h.includes('kredit'))
  const iKet   = headers.findIndex(h => h.includes('ket') || h.includes('desc'))
  const iSub   = headers.findIndex(h => h.includes('subakun') || h === 'sub')
  // Name column = the descriptive "Akun" / "Nama Akun" column (never the Sub Akun column).
  const iNama  = headers.findIndex((h, idx) => idx !== iSub && (h === 'akun' || h.includes('namaakun') || h.includes('nama')))
  // Code column = an EXPLICIT code header only ("No. Akun" / "Kode" / "Kode Akun").
  // We deliberately do NOT match a bare "akun" here — that is the name column.
  let iNoAkun  = headers.findIndex(h => h.includes('noakun') || h.includes('kodeakun') || h.includes('koderek') || h === 'kode')
  const iTipe  = headers.findIndex(h => h.includes('tipe') || h.includes('type'))

  // Fallback: when there is no explicit code-column header (e.g. an unlabeled
  // leading code column, as in some LAMPIRAN journal exports), auto-detect the
  // column whose values look like account codes (e.g. 51000, 12102.1),
  // excluding the date / amount / name / sub / keterangan columns.
  if (iNoAkun < 0 || iNoAkun === iNama) {
    const used = new Set([iTgl, iD, iK, iKet, iNama, iSub, iTipe].filter(x => x >= 0))
    const codeRe = /^\d{4,6}(\.\d+)?$/
    const probe = rows.slice(hIdx + 1).filter(r => r.filter(Boolean).length >= 2).slice(0, 50)
    const ncols = probe.reduce((m, r) => Math.max(m, r.length), 0)
    let best = -1, bestHits = 0
    for (let c = 0; c < ncols; c++) {
      if (used.has(c)) continue
      let hits = 0, total = 0
      for (const r of probe) {
        const v = r[c]
        if (v === '' || v === null || v === undefined) continue
        total++
        if (codeRe.test(String(v).trim())) hits++
      }
      if (total > 0 && hits / total >= 0.6 && hits > bestHits) { bestHits = hits; best = c }
    }
    if (best >= 0) iNoAkun = best
  }

  // Parse all data rows — track rows that look like data but can't be read
  const candidateRows = rows.slice(hIdx + 1)
  const skipped = []      // rows dropped entirely (no readable Debit/Kredit)
  const incomplete = []   // rows that DO import but have empty expected cells
  const isEmptyCell = (v) => v === '' || v === null || v === undefined || !String(v).trim()
  const dataRows = candidateRows.filter((r, idx) => {
    const nonEmpty = r.filter(v => v !== '' && v !== null && v !== undefined).length
    if (nonEmpty === 0) return false // truly blank row → ignore silently
    const d = parseNum(r[iD]), k = parseNum(r[iK])
    const ok = (d > 0 || k > 0) && nonEmpty >= 2
    if (!ok) {
      // Row has content but no readable debit/kredit amount → report it
      const tglRaw = r[iTgl] >= 0 ? r[iTgl] : r[0]
      const ketRaw = String(iKet >= 0 ? r[iKet] : r[r.length - 1] || '').trim()
      skipped.push({
        excelRow: hIdx + 2 + idx, // 1-based incl. header
        tanggal: tglRaw || '',
        keterangan: ketRaw,
        d: String(r[iD] ?? ''),
        k: String(r[iK] ?? ''),
        raw: r.filter(Boolean).join(' | ').slice(0, 120),
      })
    } else {
      // Row WILL import, but flag any empty cells in expected columns so the
      // user can review before committing (e.g. missing date / account / keterangan).
      const missing = []
      if (iTgl >= 0 && isEmptyCell(r[iTgl]))     missing.push('Tanggal')
      if (iNoAkun >= 0 && isEmptyCell(r[iNoAkun])) missing.push('No. Akun')
      if (iNama >= 0 && isEmptyCell(r[iNama]))   missing.push('Nama Akun')
      if (iKet >= 0 && isEmptyCell(r[iKet]))     missing.push('Keterangan')
      if (missing.length > 0) {
        const ketRaw = String(iKet >= 0 ? r[iKet] : r[r.length - 1] || '').trim()
        incomplete.push({
          excelRow: hIdx + 2 + idx,
          tanggal: (iTgl >= 0 ? r[iTgl] : r[0]) || '',
          keterangan: ketRaw,
          missing,
          d: String(r[iD] ?? ''),
          k: String(r[iK] ?? ''),
        })
      }
    }
    return ok
  })

  // Group rows by transaction: consecutive rows with same date+keterangan form one journal
  const groups = []
  let currentGroup = null

  dataRows.forEach(row => {
    const tgl = parseExcelDate(row[iTgl] || row[0])
    const ket = String(iKet >= 0 ? row[iKet] : row[row.length - 1] || '').trim()
    const tipe = iTipe >= 0 ? String(row[iTipe] || '').trim().toLowerCase() : ''
    const code = String(iNoAkun >= 0 ? row[iNoAkun] : row[1] || '').trim()
    const nama = String(iNama >= 0 ? row[iNama] : row[2] || '').trim()
    const sub  = iSub >= 0 ? String(row[iSub] || '').trim() : ''
    const d = parseNum(row[iD])
    const k = parseNum(row[iK])

    const groupKey = `${tgl}||${ket}`
    
    if (!currentGroup || currentGroup.key !== groupKey) {
      currentGroup = { key: groupKey, tgl, ket, tipe, lines: [] }
      groups.push(currentGroup)
    }
    // Override tipe if this row specifies one
    if (tipe && !currentGroup.tipe) currentGroup.tipe = tipe

    currentGroup.lines.push({
      akun_code: code,
      akun_name: nama,
      sub_akun: sub,
      debit: d > 0 ? d : 0,
      kredit: k > 0 ? k : 0,
      keterangan: ket,
    })
  })

  // Convert groups to journal entries
  const entries = groups.map(g => {
    const totalD = g.lines.reduce((s, l) => s + l.debit, 0)
    const totalK = g.lines.reduce((s, l) => s + l.kredit, 0)
    const dLines = g.lines.filter(l => l.debit > 0)
    const kLines = g.lines.filter(l => l.kredit > 0)
    
    // Build akun_debit/akun_kredit from first debit/kredit lines
    const firstD = dLines[0]
    const firstK = kLines[0]
    const acctStr = (l) => l ? `${l.akun_code} - ${l.akun_name}${l.sub_akun ? ' > ' + l.sub_akun : ''}` : ''

    return {
      tanggal: g.tgl,
      keterangan: g.ket || (firstD?.akun_name || firstK?.akun_name || ''),
      debit: totalD,
      kredit: totalK,
      akun_debit: acctStr(firstD),
      akun_kredit: acctStr(firstK),
      // Use the explicit Tipe column when present; otherwise derive it from the
      // keterangan ("beban" → pengeluaran, "pendapatan" → pendapatan), falling back
      // to account class, else "transfer".
      tipe_transaksi: g.tipe || deriveTipe(g.ket, g.lines),
      lines: g.lines,
      status: 'pending',
    }
  })

  // Filter by month if specified
  const finalEntries = month ? entries.filter(e => e.tanggal?.startsWith(month)) : entries
  // Attach skipped-row diagnostics so the UI can warn the user.
  Object.defineProperty(finalEntries, 'skipped', { value: skipped, enumerable: false })
  // Attach incomplete-row diagnostics (rows imported but with empty expected cells).
  Object.defineProperty(finalEntries, 'incomplete', { value: incomplete, enumerable: false })
  return finalEntries
}

// ─── parseSaldoAwal ───────────────────────────────────────────────────────────
// Format: Akun | Default | SaldoAwal | D | K | SaldoAkhir
export function parseSaldoAwal(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false })
  const hIdx = rows.findIndex(r => {
    const h = r.map(normalizeHeader)
    return h.some(x => x.includes('saldoawal') || x.includes('saldo'))
  })
  const dataStart = hIdx >= 0 ? hIdx + 1 : 0
  const result = []
  rows.slice(dataStart).forEach(r => {
    const code = String(r[0] || '').trim()
    if (!code.match(/^\d{4,}/)) return // skip non-account rows
    const name = String(r[1] || '').trim()
    const saldoAwal = parseNum(r[2])
    const d = parseNum(r[3])
    const k = parseNum(r[4])
    const saldoAkhir = parseNum(r[5]) || saldoAwal + d - k
    result.push({ kode: code, nama: name, saldo_awal: saldoAwal, debit: d, kredit: k, saldo_akhir: saldoAkhir })
  })
  return result
}

// ─── parseCOA ─────────────────────────────────────────────────────────────────
export function parseCOA(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false })
  const result = []
  rows.forEach(r => {
    const code = String(r[0] || '').trim()
    if (!code.match(/^\d{4,}/)) return
    const name = String(r[1] || r[2] || '').trim()
    if (!name) return
    result.push({ code, name, type: code.startsWith('1') ? 'asset' : code.startsWith('2') ? 'liability' : code.startsWith('3') ? 'equity' : code.startsWith('4') ? 'revenue' : 'expense' })
  })
  return result
}

// ─── parsePiutang ─────────────────────────────────────────────────────────────
export function parsePiutang(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false })
  const hIdx = rows.findIndex(r => r.filter(Boolean).length >= 2)
  const headers = (rows[hIdx] || []).map(normalizeHeader)
  const iName = headers.findIndex(h => h.includes('pelanggan') || h.includes('nama') || h.includes('customer'))
  const iJml  = headers.findIndex(h => h.includes('jumlah') || h.includes('nominal') || h.includes('amount'))
  const iJT   = headers.findIndex(h => h.includes('jatuhtempo') || h.includes('jt') || h.includes('duedate'))
  const iTgl  = headers.findIndex(h => h.includes('tanggal') || h.includes('tgl') || h.includes('date'))
  const iStatus = headers.findIndex(h => h.includes('status'))
  return rows.slice(hIdx + 1).filter(r => r.filter(Boolean).length >= 2 && parseNum(r[iJml] >= 0 ? r[iJml] : r[2]) > 0).map(r => ({
    pelanggan:   String(r[iName >= 0 ? iName : 0] || '').trim(),
    tanggal:     parseExcelDate(r[iTgl >= 0 ? iTgl : 1]),
    jumlah:      parseNum(r[iJml >= 0 ? iJml : 2]),
    sisa:        parseNum(r[iJml >= 0 ? iJml : 2]),
    jatuh_tempo: parseExcelDate(r[iJT >= 0 ? iJT : 3]),
    status:      String(r[iStatus >= 0 ? iStatus : -1] || 'belum lunas').toLowerCase().trim() || 'belum lunas',
    keterangan:  ''
  }))
}

// ─── parseHutang ─────────────────────────────────────────────────────────────
export function parseHutang(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false })
  const hIdx = rows.findIndex(r => r.filter(Boolean).length >= 2)
  const headers = (rows[hIdx] || []).map(normalizeHeader)
  const iName = headers.findIndex(h => h.includes('supplier') || h.includes('vendor') || h.includes('nama'))
  const iJml  = headers.findIndex(h => h.includes('jumlah') || h.includes('nominal') || h.includes('amount'))
  const iJT   = headers.findIndex(h => h.includes('jatuhtempo') || h.includes('jt') || h.includes('duedate'))
  const iTgl  = headers.findIndex(h => h.includes('tanggal') || h.includes('tgl') || h.includes('date'))
  const iStatus = headers.findIndex(h => h.includes('status'))
  return rows.slice(hIdx + 1).filter(r => r.filter(Boolean).length >= 2 && parseNum(r[iJml >= 0 ? iJml : 2]) > 0).map(r => ({
    supplier:    String(r[iName >= 0 ? iName : 0] || '').trim(),
    tanggal:     parseExcelDate(r[iTgl >= 0 ? iTgl : 1]),
    jumlah:      parseNum(r[iJml >= 0 ? iJml : 2]),
    sisa:        parseNum(r[iJml >= 0 ? iJml : 2]),
    jatuh_tempo: parseExcelDate(r[iJT >= 0 ? iJT : 3]),
    status:      String(r[iStatus >= 0 ? iStatus : -1] || 'belum lunas').toLowerCase().trim() || 'belum lunas',
    keterangan:  ''
  }))
}

// ─── parseAset ───────────────────────────────────────────────────────────────
export function parseAset(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false })
  const hIdx = rows.findIndex(r => r.filter(Boolean).length >= 3)
  const headers = (rows[hIdx] || []).map(normalizeHeader)
  const iKode  = headers.findIndex(h => h.includes('kode') || h === 'no' || h.includes('nomor'))
  const iNama  = headers.findIndex(h => h.includes('nama') || h.includes('deskripsi') || h.includes('uraian'))
  const iKat   = headers.findIndex(h => h.includes('kategori') || h.includes('jenis') || h.includes('group'))
  const iTgl   = headers.findIndex(h => h.includes('perolehan') || h.includes('tanggal') || h.includes('tgl'))
  const iNilai = headers.findIndex(h => h.includes('nilaiperolehan') || h.includes('harga') || h.includes('nilai'))
  const iPeny  = headers.findIndex(h => h.includes('penyusutan') || h.includes('depresiasi') || h.includes('akumulasi'))
  const iBuku  = headers.findIndex(h => h.includes('nilaibuku') || h.includes('bukuthn') || h.includes('buku'))
  return rows.slice(hIdx + 1).filter(r => r.filter(Boolean).length >= 2 && String(r[iNama >= 0 ? iNama : 1] || '').trim()).map((r, idx) => ({
    kode:             String(r[iKode >= 0 ? iKode : 0] || `AST-${String(idx+1).padStart(3,'0')}`).trim(),
    nama:             String(r[iNama >= 0 ? iNama : 1] || '').trim(),
    kategori:         String(r[iKat >= 0 ? iKat : 2] || 'Peralatan').trim(),
    tanggal_perolehan:parseExcelDate(r[iTgl >= 0 ? iTgl : 3]),
    nilai_perolehan:  parseNum(r[iNilai >= 0 ? iNilai : 4]),
    nilai_penyusutan: parseNum(r[iPeny >= 0 ? iPeny : 5]),
    nilai_buku:       parseNum(r[iBuku >= 0 ? iBuku : 6]) || (parseNum(r[iNilai >= 0 ? iNilai : 4]) - parseNum(r[iPeny >= 0 ? iPeny : 5])),
    metode_penyusutan:'garis lurus',
    umur_ekonomis:    5,
    status:           'aktif'
  }))
}

// ─── parsePersediaan ─────────────────────────────────────────────────────────
export function parsePersediaan(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false })
  const hIdx = rows.findIndex(r => r.filter(Boolean).length >= 2)
  const headers = (rows[hIdx] || []).map(normalizeHeader)
  const iKode  = headers.findIndex(h => h.includes('kode') || h === 'no')
  const iNama  = headers.findIndex(h => h.includes('nama') || h.includes('barang') || h.includes('uraian'))
  const iSatuan= headers.findIndex(h => h.includes('satuan') || h.includes('unit') || h.includes('uom'))
  const iStok  = headers.findIndex(h => h.includes('stok') || h.includes('qty') || h.includes('jumlah'))
  const iHarga = headers.findIndex(h => h.includes('harga') || h.includes('nilai') || h.includes('hargasatuan'))
  return rows.slice(hIdx + 1).filter(r => r.filter(Boolean).length >= 2 && String(r[iNama >= 0 ? iNama : 1] || '').trim()).map((r, idx) => ({
    kode:         String(r[iKode >= 0 ? iKode : 0] || `PRD-${String(idx+1).padStart(3,'0')}`).trim(),
    nama:         String(r[iNama >= 0 ? iNama : 1] || '').trim(),
    satuan:       String(r[iSatuan >= 0 ? iSatuan : 2] || 'unit').trim(),
    stok:         parseNum(r[iStok >= 0 ? iStok : 3]),
    harga_satuan: parseNum(r[iHarga >= 0 ? iHarga : 4]),
    kategori:     'Persediaan',
    status:       'aktif'
  }))
}

// ─── parseAnggaran ────────────────────────────────────────────────────────────
export function parseAnggaran(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false })
  const hIdx = rows.findIndex(r => r.filter(Boolean).length >= 2)
  const headers = (rows[hIdx] || []).map(normalizeHeader)
  const iKat   = headers.findIndex(h => h.includes('kategori') || h.includes('uraian') || h.includes('nama'))
  const iSub   = headers.findIndex(h => h.includes('sub') || h.includes('rincian'))
  const iAng   = headers.findIndex(h => h.includes('anggaran') || h.includes('rka') || h.includes('pagu'))
  const iReal  = headers.findIndex(h => h.includes('realisasi') || h.includes('actual'))
  return rows.slice(hIdx + 1).filter(r => r.filter(Boolean).length >= 2 && (parseNum(r[iAng >= 0 ? iAng : 2]) > 0)).map(r => ({
    kategori:     String(r[iKat >= 0 ? iKat : 0] || '').trim(),
    sub_kategori: String(r[iSub >= 0 ? iSub : 1] || '').trim(),
    anggaran_awal:parseNum(r[iAng >= 0 ? iAng : 2]),
    realisasi:    parseNum(r[iReal >= 0 ? iReal : 3]),
    tahun:        new Date().getFullYear(),
    bulan:        new Date().getMonth() + 1
  }))
}

// ─── Auto-parse any sheet ─────────────────────────────────────────────────────
export function autoParse(worksheet, hint = null) {
  const detection = detectSheetType(worksheet)
  const type = hint || detection.type
  switch (type) {
    case 'jurnal':       { const data = parseJurnal(worksheet); return { type, data, skipped: data.skipped || [], incomplete: data.incomplete || [] } }
    case 'neraca_saldo': return { type, data: parseSaldoAwal(worksheet) }
    case 'coa':          return { type, data: parseCOA(worksheet) }
    case 'piutang':      return { type, data: parsePiutang(worksheet) }
    case 'hutang':       return { type, data: parseHutang(worksheet) }
    case 'aset':         return { type, data: parseAset(worksheet) }
    case 'persediaan':   return { type, data: parsePersediaan(worksheet) }
    case 'anggaran':     return { type, data: parseAnggaran(worksheet) }
    default:             return { type: 'unknown', data: [] }
  }
}
