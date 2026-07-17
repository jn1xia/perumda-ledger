// Integration test: the journal-book upload flow end-to-end against a REAL
// server process on a scratch copy of the dev DB. Covers period_status writes,
// clearReports cleanup, journal validation, period locks, and the consistency
// endpoint — the exact pipeline of the 07-07-2026 kendala.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx/xlsx.mjs'
import { extractSnapshot, classifySnapshot } from '../../src/utils/reportSnapshot.js'

if (typeof XLSX.set_fs === 'function') XLSX.set_fs(fs)
const testsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const projRoot = path.dirname(testsDir)
const PORT = 3977
const API = `http://localhost:${PORT}/api`
const HDR = { 'Content-Type': 'application/json', 'X-User-Role': 'admin' }
const DIVISI_JUNI = path.join(testsDir, 'fixtures', 'JURNAL JUNI 2026 (divisi).xlsx')

let proc
let tmpDb

before(async () => {
  tmpDb = path.join(os.tmpdir(), `perumda_test_${Date.now()}.db`)
  fs.copyFileSync(path.join(projRoot, 'server', 'perumda_ledger.db'), tmpDb)
  proc = spawn(process.execPath, [path.join(projRoot, 'server', 'index.cjs')], {
    // ALLOW_HEADER_ROLE=1 lets this integration test keep authenticating via the
    // X-User-Role header (production uses the session cookie instead).
    env: { ...process.env, PORT: String(PORT), DB_PATH: tmpDb, NODE_ENV: 'test', ALLOW_HEADER_ROLE: '1' },
    stdio: 'ignore',
  })
  // Wait for the API to come up.
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${API}/coa`, { headers: HDR }); if (r.ok) return } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('server did not start')
})

after(() => {
  if (proc) proc.kill()
  // Give the process a beat to release the DB file, then clean up.
  setTimeout(() => { try { fs.unlinkSync(tmpDb) } catch { /* ignore */ } }, 1000)
})

test('journal-book upload: clearReports wipes the frozen month and imports live JV- journals', async () => {
  const wb = XLSX.readFile(DIVISI_JUNI)
  const snap = extractSnapshot(wb, '2026-06')
  assert.equal(classifySnapshot(snap), 'jurnal')
  const journals = snap.journals.map(j => ({ ...j, id: String(j.id).replace(/^XL-/, 'JV-') }))

  const r = await fetch(`${API}/reports/snapshot`, {
    method: 'POST', headers: HDR,
    body: JSON.stringify({ period: '2026-06', journals, clearReports: true }),
  })
  const body = await r.json()
  assert.equal(r.status, 200, JSON.stringify(body))
  assert.equal(body.loaded.journals, 115)
  assert.equal(body.loaded.mode, 'jurnal')

  // Frozen data gone → the month computes from journals everywhere.
  const lr = await (await fetch(`${API}/reports/ref-laba-rugi?period=2026-06`, { headers: HDR })).json()
  assert.equal(lr.length, 0, 'stale June snapshot must be cleared')
  const status = await (await fetch(`${API}/reports/period-status`, { headers: HDR })).json()
  const june = status.find(s => s.period === '2026-06')
  assert.equal(june && june.mode, 'jurnal')
})

test('unbalanced journals are rejected with specifics', async () => {
  const r = await fetch(`${API}/reports/snapshot`, {
    method: 'POST', headers: HDR,
    body: JSON.stringify({
      period: '2026-06', clearReports: true,
      journals: [{ id: 'JV-2026-06-U9999', tanggal: '2026-06-15', debit: 100, kredit: 90, akun_debit: '61011 Beban Gaji', akun_kredit: '11103 Bank', status: 'pending' }],
    }),
  })
  assert.equal(r.status, 400)
  const body = await r.json()
  assert.equal(body.code, 'UNBALANCED_JOURNALS')
})

test('locked periods block wholesale month replacement', async () => {
  const lock = await fetch(`${API}/periods/locks`, { method: 'POST', headers: HDR, body: JSON.stringify({ period: '2026-06' }) })
  assert.ok(lock.ok, 'lock request should succeed: ' + lock.status)
  const r = await fetch(`${API}/reports/snapshot`, {
    method: 'POST', headers: HDR,
    body: JSON.stringify({ period: '2026-06', clearReports: true, journals: [] }),
  })
  assert.equal(r.status, 423)
  const unlock = await fetch(`${API}/periods/unlock`, {
    method: 'POST', headers: { ...HDR, 'X-User-Role': 'super_admin' },
    body: JSON.stringify({ period: '2026-06', reason: 'test cleanup' }),
  })
  assert.ok(unlock.ok, 'unlock should succeed: ' + unlock.status)
})

test('consistency endpoint reports the month coherently after approval', async () => {
  // Approve all pending June journals (Approve Semua).
  const all = await (await fetch(`${API}/journals`, { headers: HDR })).json()
  const pending = all.filter(j => j.status === 'pending' && String(j.tanggal || '').startsWith('2026-06'))
  for (const j of pending) {
    const a = await fetch(`${API}/journals/approve/${encodeURIComponent(j.id)}`, { method: 'POST', headers: HDR })
    assert.ok(a.ok, `approve ${j.id}: ${a.status}`)
  }

  const c = await (await fetch(`${API}/reports/consistency?period=2026-06`, { headers: HDR })).json()
  assert.equal(c.mode, 'jurnal')
  assert.equal(c.journals.pending, 0)
  const balance = c.checks.find(ch => ch.id === 'balance')
  assert.equal(balance.status, 'ok', balance.detail)
  const modeCheck = c.checks.find(ch => ch.id === 'mode')
  assert.equal(modeCheck.status, 'ok', modeCheck.detail)
  // The ledger class totals must match the division's video figures.
  assert.equal(Math.round(c.ledger_class_totals.pendUsaha), 923617078 + 366672387)
  assert.equal(Math.round(c.ledger_class_totals.bebanUmum), 743330990)
})
