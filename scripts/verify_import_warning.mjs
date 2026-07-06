// Verifies the new COA-existence warning in the journal importer.
// Generates a tiny journal xlsx with an UNKNOWN code (99999) + a known code,
// then drives the QA UI import preview and asserts the warning banner appears.
import { chromium } from 'playwright'
import XLSX from 'xlsx'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = 'http://localhost:3002'
const file = path.join(__dirname, 'tmp_unknown_code_jurnal.xlsx')

// Build the test file
const aoa = [
  ['Tanggal', 'No.Akun', 'Akun', 'Sub Akun', 'D', 'K', 'Keterangan', 'Tipe (pendapatan/pengeluaran/transfer)'],
  ['2026-06-12', '61040', 'Beban Alat Tulis Kantor', '', 100000, '', 'Beli ATK uji', 'pengeluaran'],
  ['2026-06-12', '11101', 'Kas Kecil', '', '', 100000, 'Beli ATK uji', 'pengeluaran'],
  ['2026-06-13', '88888', 'Akun Tidak Terdaftar', '', 50000, '', 'Transaksi kode asing', 'pengeluaran'],
  ['2026-06-13', '11101', 'Kas Kecil', '', '', 50000, 'Transaksi kode asing', 'pengeluaran'],
]
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Jurnal Transaksi')
XLSX.writeFile(wb, file)

const results = []
const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? '✅ PASS' : '❌ FAIL'} — ${n}${d ? ` (${d})` : ''}`) }

const session = JSON.stringify({ username: 'qa', role: 'admin', roleLabel: 'Admin', loginAt: new Date().toISOString() })
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
await ctx.addInitScript((s) => { localStorage.setItem('session', s); localStorage.setItem('userRole', 'admin') }, session)
const page = await ctx.newPage()
try {
  await page.goto(`${BASE}/jurnal`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Import Excel' }).click()
  await page.waitForTimeout(400)
  await page.setInputFiles('input[type="file"]', file)
  await page.waitForTimeout(1200)
  const text = await page.locator('body').innerText()
  check('Preview reached ("baris siap import")', /baris siap import/i.test(text))
  check('Warning: kode akun tidak ada di Bagan Akun', /kode akun tidak ada di Bagan Akun/i.test(text))
  check('Lists unknown code 88888', text.includes('88888'))
  check('Does NOT flag known code 61040', !/61040.*tidak ada/i.test(text))
  await page.screenshot({ path: 'scripts/verify_import_warning.png', fullPage: true })
} catch (e) {
  check('run without errors', false, e.message)
} finally {
  await browser.close()
}
const failed = results.filter(r => !r).length
console.log(`\n${failed === 0 ? '🎉 ALL PASSED' : `⚠️ ${failed} FAILED`} (${results.length - failed}/${results.length})`)
process.exit(failed === 0 ? 0 : 1)
