// End-to-end verification for the new "Beban di Luar Operasional" (80xxx) category.
// Drives the real QA UI: logs in via injected session, checks LRA + NPD render
// the seeded journal (JV-TEST-LLO-001, June 2026).
import { chromium } from 'playwright'

const BASE = process.env.QA_URL || 'http://localhost:3002'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'} — ${name}${detail ? ` (${detail})` : ''}`)
}

const session = JSON.stringify({
  username: 'qa.verifier', role: 'admin', roleLabel: 'Admin', loginAt: new Date().toISOString(),
})

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
await ctx.addInitScript((s) => {
  localStorage.setItem('session', s)
  localStorage.setItem('userRole', 'admin')
}, session)
const page = await ctx.newPage()

try {
  // ── LRA ──────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/lra`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: 'Beban Lain-lain', exact: true }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Juni', exact: true }).first().click()
  await page.waitForTimeout(800)

  const lraText = await page.locator('body').innerText()
  check('LRA shows "Beban di Luar Operasional" group', /Beban di Luar Operasional/.test(lraText))
  check('LRA shows Beban Lain-lain realisasi Rp 7.992.000,00', lraText.includes('7.992.000,00'))
  check('LRA shows Beban Administrasi Bank realisasi Rp 6.500,00', lraText.includes('6.500,00'))
  await page.screenshot({ path: 'scripts/verify_lra_lainnya.png', fullPage: true })

  // ── NPD ──────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/npd`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Juni', exact: true }).first().click()
  await page.waitForTimeout(800)

  const npdText = await page.locator('body').innerText()
  check('NPD shows "Beban di Luar Operasional" document', /Beban di Luar Operasional/.test(npdText))
  check('NPD shows pencairan Rp 7.998.500,00', npdText.includes('7.998.500,00'))
  await page.screenshot({ path: 'scripts/verify_npd_lainnya.png', fullPage: true })

  // ── Negative: make sure it did NOT leak into Beban Umum ────────────────────
  await page.goto(`${BASE}/lra`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Beban Umum', exact: true }).click()
  await page.getByRole('button', { name: 'Juni', exact: true }).first().click()
  await page.waitForTimeout(800)
  const umumText = await page.locator('body').innerText()
  check('No leak into Beban Umum (no 7.992.000,00 there)', !umumText.includes('7.992.000,00'))
} catch (e) {
  check('E2E run completed without errors', false, e.message)
} finally {
  await browser.close()
}

const failed = results.filter(r => !r.ok)
console.log(`\n${failed.length === 0 ? '🎉 ALL CHECKS PASSED' : `⚠️  ${failed.length} CHECK(S) FAILED`} (${results.length - failed.length}/${results.length})`)
process.exit(failed.length === 0 ? 0 : 1)
