/**
 * /api/ai-context
 * Returns rich data context for the AI assistant:
 *   - All tables from the SQLite database
 *   - Parsed summaries of Excel files in src/FILES/
 */
const express = require('express')
const router  = express.Router()
const path    = require('path')
const fs      = require('fs')
const XLSX    = require('xlsx')
const { requireRole } = require('../middleware/auth.cjs')
const RBAC = require('../config/rbac.cjs')

// DB — better-sqlite3 instance exported directly
const db = require('../db/database.cjs')

// ─── Parse one Excel file → compact summary ───────────────────────────────────
function parseExcelSummary(filePath) {
  try {
    const wb       = XLSX.readFile(filePath, { sheetRows: 500 })
    const sheets   = {}
    for (const name of wb.SheetNames) {
      const ws  = wb.Sheets[name]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false })
      // Take first 3 rows as headers, count data rows, sample first 5 data rows
      const headers  = raw.slice(0, 3)
      const dataRows = raw.slice(3)
      sheets[name] = {
        headers,
        totalRows: dataRows.length,
        sample:    dataRows.slice(0, 5)
      }
    }
    return { sheetNames: wb.SheetNames, sheets }
  } catch (e) {
    return { error: e.message }
  }
}

// ─── GET /api/ai-context ──────────────────────────────────────────────────────
// Dumps every table + Excel summaries — restrict to authenticated roles.
router.get('/', requireRole(RBAC.ALL_READ), async (req, res) => {
  try {
    // 1. Database tables
    const journals  = db.prepare('SELECT * FROM journals  ORDER BY tanggal DESC LIMIT 500').all()
    const coa       = db.prepare('SELECT * FROM coa       ORDER BY code').all()
    const assets    = db.prepare('SELECT * FROM assets    ORDER BY kode').all()
    const piutang   = db.prepare('SELECT * FROM piutang   ORDER BY id').all()
    const hutang    = db.prepare('SELECT * FROM hutang    ORDER BY id').all()
    const inventory = db.prepare('SELECT * FROM inventory ORDER BY kode').all()
    const anggaran  = db.prepare('SELECT * FROM anggaran  ORDER BY kategori').all()
    const pengaturan = (() => {
      const rows = db.prepare('SELECT key, value FROM pengaturan').all()
      const obj  = {}
      rows.forEach(r => { try { obj[r.key] = JSON.parse(r.value) } catch { obj[r.key] = r.value } })
      return obj
    })()

    // 2. Excel files in src/FILES/
    const filesDir   = path.join(__dirname, '..', '..', 'src', 'FILES')
    const excelFiles = []
    if (fs.existsSync(filesDir)) {
      const entries = fs.readdirSync(filesDir)
      for (const name of entries) {
        if (!name.match(/\.(xlsx|xls)$/i)) continue
        const filePath = path.join(filesDir, name)
        const stat     = fs.statSync(filePath)
        // Only parse files < 12 MB to avoid timeout
        if (stat.size > 12 * 1024 * 1024) {
          excelFiles.push({ name, sizeBytes: stat.size, skipped: true, reason: 'File terlalu besar (>12 MB)' })
          continue
        }
        const summary = parseExcelSummary(filePath)
        excelFiles.push({ name, sizeBytes: stat.size, ...summary })
      }
    }

    // 3. Quick financial calculations from journals
    const posted = journals.filter(j => j.status === 'posted')
    const sumJ   = (prefix, isDebit) => posted.reduce((s, j) => {
      const code = isDebit ? String(j.akun_debit || '').split(' ')[0] : String(j.akun_kredit || '').split(' ')[0]
      return s + (code.startsWith(prefix) ? (isDebit ? j.debit : j.kredit) || 0 : 0)
    }, 0)

    const pu     = sumJ('41', false) + sumJ('42', false)
    const bpp    = sumJ('51', true)
    const ba     = sumJ('61', true)
    const bo     = sumJ('62', true)
    const pn     = sumJ('7',  false)
    const bn     = sumJ('8',  true)
    const lu     = pu - bpp - ba - bo
    const lb     = lu + pn - bn

    const financials = {
      pendapatanUsaha: pu, bpp, bebanAdmin: ba, bebanOps: bo,
      pendapatanNonOps: pn, bebanNonOps: bn,
      labaUsaha: lu, labaBersihSebelumPajak: lb,
      totalDebitPosted:  posted.reduce((s, j) => s + (j.debit  || 0), 0),
      totalKreditPosted: posted.reduce((s, j) => s + (j.kredit || 0), 0),
    }

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      db: {
        journals:  { count: journals.length,  posted: posted.length, data: journals.slice(0, 200) },
        coa:       { count: coa.length,       data: coa },
        assets:    { count: assets.length,    data: assets },
        piutang:   { count: piutang.length,   data: piutang },
        hutang:    { count: hutang.length,    data: hutang },
        inventory: { count: inventory.length, data: inventory },
        anggaran:  { count: anggaran.length,  data: anggaran },
        pengaturan
      },
      financials,
      excelFiles,
    })
  } catch (err) {
    console.error('[AI Context Error]', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── GET /api/ai-context/files ── list available Excel files ─────────────────
router.get('/files', (req, res) => {
  const filesDir = path.join(__dirname, '..', '..', 'src', 'FILES')
  if (!fs.existsSync(filesDir)) return res.json({ files: [] })
  const files = fs.readdirSync(filesDir)
    .filter(n => n.match(/\.(xlsx|xls)$/i))
    .map(n => {
      const stat = fs.statSync(path.join(filesDir, n))
      return { name: n, sizeBytes: stat.size, sizeMB: (stat.size / 1024 / 1024).toFixed(1) }
    })
  res.json({ files })
})

// ─── GET /api/ai-context/files/:name ── parse one specific Excel file ────────
router.get('/files/:name', (req, res) => {
  const filesDir = path.join(__dirname, '..', '..', 'src', 'FILES')
  const name     = req.params.name
  // Sanitise: no path traversal
  if (name.includes('..') || name.includes('/')) return res.status(400).json({ error: 'Invalid filename' })
  const filePath = path.join(filesDir, name)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' })
  const stat = fs.statSync(filePath)
  if (stat.size > 15 * 1024 * 1024) return res.status(413).json({ error: 'File too large' })
  const summary = parseExcelSummary(filePath)
  res.json({ name, sizeBytes: stat.size, ...summary })
})

module.exports = router
