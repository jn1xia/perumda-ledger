// Integration test: "sudah dicek" on a finding (/api/reports/finding-acks)
// against a REAL server process on a scratch copy of the dev DB.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const projRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const PORT = 3987
const API = `http://localhost:${PORT}/api`
const hdr = (role = 'admin') => ({ 'Content-Type': 'application/json', 'X-User-Role': role })

let proc
let tmpDb

before(async () => {
  tmpDb = path.join(os.tmpdir(), `perumda_acks_${Date.now()}.db`)
  fs.copyFileSync(path.join(projRoot, 'server', 'perumda_ledger.db'), tmpDb)
  proc = spawn(process.execPath, [path.join(projRoot, 'server', 'index.cjs')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: tmpDb, NODE_ENV: 'test', ALLOW_HEADER_ROLE: '1' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${API}/coa`, { headers: hdr() }); if (r.ok) return } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('server did not start')
})

after(() => {
  if (proc) proc.kill()
  setTimeout(() => { try { fs.unlinkSync(tmpDb) } catch { /* ignore */ } }, 1000)
})

const KEY = 'reklasifikasi:2026-10-31:12204.1+12102.1:87953600'
const list = async () => (await fetch(`${API}/reports/finding-acks`, { headers: hdr('kasir') })).json()
const post = (body, role = 'admin') => fetch(`${API}/reports/finding-acks`, { method: 'POST', headers: hdr(role), body: JSON.stringify(body) })

test('an acknowledgement is stored, replaced and removed', async () => {
  let r = await post({ period: '2026-10', key: KEY, note: 'sudah dicek' })
  assert.equal(r.status, 200)
  let rows = await list()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].period, '2026-10')
  assert.equal(rows[0].finding_key, KEY)
  assert.equal(rows[0].note, 'sudah dicek')

  r = await post({ period: '2026-10', key: KEY, note: 'pemindahan aset, sesuai' })
  assert.equal(r.status, 200)
  rows = await list()
  assert.equal(rows.length, 1, 'same finding → replaced')
  assert.equal(rows[0].note, 'pemindahan aset, sesuai')

  r = await fetch(`${API}/reports/finding-acks?period=2026-10&key=${encodeURIComponent(KEY)}`, { method: 'DELETE', headers: hdr() })
  assert.equal(r.status, 200)
  assert.equal((await list()).length, 0)
})

test('a bad period or empty key is rejected; reading roles cannot write', async () => {
  assert.equal((await post({ period: '2026-13', key: KEY })).status, 400)
  assert.equal((await post({ period: '2026-10', key: '' })).status, 400)
  assert.equal((await post({ period: '2026-10', key: KEY }, 'kasir')).status, 403)
  assert.equal((await list()).length, 0)
})
