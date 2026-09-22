// Forced password change — rekap 22-09-2026 butir 3.4 ("super_admin masih
// memakai kata sandi bawaan").
//
// Seeded accounts start on the default password with must_change_password = 1,
// but the flag only drove a banner: the default password opened a full session.
// The repository is public, so that password is public too. This pins the gate:
// a flagged session can reach /api/auth/* and nothing else until the password is
// changed, the change cannot keep a default, and new accounts get no default.
//
// Cookie auth only (no ALLOW_HEADER_ROLE) — this is the production path.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const projRoot = path.dirname(testsDir)
const PORT = 3983
const API = `http://localhost:${PORT}/api`
const DEFAULT_PW = 'perumda2026'
let proc, tmpDb

before(async () => {
  tmpDb = path.join(os.tmpdir(), `perumda_auth_${Date.now()}.db`)
  fs.copyFileSync(path.join(projRoot, 'server', 'perumda_ledger.db'), tmpDb)
  const env = { ...process.env, PORT: String(PORT), DB_PATH: tmpDb, NODE_ENV: 'test', JWT_SECRET: 'test' }
  delete env.ALLOW_HEADER_ROLE
  delete env.DISABLE_RBAC
  delete env.SEED_USER_PASSWORD
  proc = spawn(process.execPath, [path.join(projRoot, 'server', 'index.cjs')], { env, stdio: 'ignore' })
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${API}/auth/me`); if (r.status === 401) return } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('server did not start')
})

after(() => {
  if (proc) proc.kill()
  setTimeout(() => { try { fs.unlinkSync(tmpDb) } catch { /* ignore */ } }, 1000)
})

const sessionCookie = (res) => {
  const c = (res.headers.getSetCookie?.() || []).find(s => s.startsWith('perumda_session='))
  return c ? c.split(';')[0] : null
}
const call = (method, p, cookie, body) => fetch(`${API}${p}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: body ? JSON.stringify(body) : undefined,
})
async function login(username, password) {
  const r = await call('POST', '/auth/login', null, { username, password })
  return { status: r.status, body: await r.json(), cookie: sessionCookie(r) }
}

test('a default-password session can only change its password', async () => {
  const s = await login('staff_keuangan', DEFAULT_PW)
  assert.equal(s.status, 200)
  assert.equal(s.body.mustChangePassword, true)
  assert.ok(s.cookie, 'login still issues a session cookie')

  for (const p of ['/journals', '/coa', '/reports/neraca?period=2026-04', '/giro', '/users']) {
    const r = await call('GET', p, s.cookie)
    assert.equal(r.status, 403, `${p} must be closed before the change`)
    assert.equal((await r.json()).code, 'PASSWORD_CHANGE_REQUIRED', p)
  }
  const me = await call('GET', '/auth/me', s.cookie)
  assert.equal(me.status, 200, '/auth/me stays reachable (the app needs it to show the change screen)')
  assert.equal((await me.json()).mustChangePassword, true)
})

test('the new password cannot be the old one or a known default', async () => {
  const s = await login('spv_akuntansi', DEFAULT_PW)
  const same = await call('POST', '/auth/change-password', s.cookie, { oldPassword: DEFAULT_PW, newPassword: DEFAULT_PW })
  assert.equal(same.status, 400)
  const short = await call('POST', '/auth/change-password', s.cookie, { oldPassword: DEFAULT_PW, newPassword: 'pendek' })
  assert.equal(short.status, 400)
  const r = await call('GET', '/journals', s.cookie)
  assert.equal(r.status, 403, 'a rejected change leaves the session restricted')
})

test('changing the password opens the app on the same browser, and /me resyncs another one', async () => {
  const a = await login('manager_keuangan', DEFAULT_PW)
  const b = await login('manager_keuangan', DEFAULT_PW) // second browser, same account

  const ch = await call('POST', '/auth/change-password', a.cookie, { oldPassword: DEFAULT_PW, newPassword: 'Laporan-Agustus-2026' })
  assert.equal(ch.status, 200)
  const fresh = sessionCookie(ch)
  assert.ok(fresh, 'the change swaps the cookie for an unrestricted one')
  assert.equal((await call('GET', '/journals', fresh)).status, 200)

  // The other browser still holds a restricted token until it reloads.
  assert.equal((await call('GET', '/journals', b.cookie)).status, 403)
  const me = await call('GET', '/auth/me', b.cookie)
  assert.equal((await me.json()).mustChangePassword, false)
  const resynced = sessionCookie(me)
  assert.ok(resynced, '/auth/me reissues the cookie when the flag changed')
  assert.equal((await call('GET', '/journals', resynced)).status, 200)

  // And the old default no longer logs in.
  assert.equal((await login('manager_keuangan', DEFAULT_PW)).status, 401)
  const again = await login('manager_keuangan', 'Laporan-Agustus-2026')
  assert.equal(again.status, 200)
  assert.equal(again.body.mustChangePassword, false)
})

test('a new account needs its own initial password (no silent default)', async () => {
  const s = await login('manager_it', DEFAULT_PW)
  const ch = await call('POST', '/auth/change-password', s.cookie, { oldPassword: DEFAULT_PW, newPassword: 'Admin-Sistem-2026' })
  const admin = sessionCookie(ch)
  assert.ok(admin)

  const none = await call('POST', '/users', admin, { username: 'kasir.baru', role: 'kasir_pasar' })
  assert.equal(none.status, 400, 'no password → rejected, instead of falling back to the public default')
  const dflt = await call('POST', '/users', admin, { username: 'kasir.baru', role: 'kasir_pasar', password: DEFAULT_PW })
  assert.equal(dflt.status, 400, 'the published default is not an acceptable initial password')
  const ok = await call('POST', '/users', admin, { username: 'kasir.baru', role: 'kasir_pasar', password: 'Awal-Kasir-2026' })
  assert.equal(ok.status, 201)

  const k = await login('kasir.baru', 'Awal-Kasir-2026')
  assert.equal(k.body.mustChangePassword, true, 'the owner still changes it on first login')

  const reset = await call('POST', '/users/kasir.baru/reset-password', admin, { newPassword: DEFAULT_PW })
  assert.equal(reset.status, 400, 'an admin reset cannot hand out the default either')
})

test('a token signed before the flag existed is checked against the account', async () => {
  // Sessions opened before this deploy carry { username, role } only and stay
  // valid for up to 12 h. Without a lookup they would walk past the gate.
  const { default: jwt } = await import('jsonwebtoken')
  const legacy = (username, role) => `perumda_session=${jwt.sign({ username, role }, 'test', { expiresIn: 3600 })}`

  // Still on the default password → blocked, like a fresh default login.
  const flagged = legacy('staff_umum', 'staff_umum')
  const r = await call('GET', '/journals', flagged)
  assert.equal(r.status, 403)
  assert.equal((await r.json()).code, 'PASSWORD_CHANGE_REQUIRED')

  // Password already changed → the old token keeps working (no forced logout).
  const s = await login('spv_umum', DEFAULT_PW)
  await call('POST', '/auth/change-password', s.cookie, { oldPassword: DEFAULT_PW, newPassword: 'Umum-Spv-2026' })
  assert.equal((await call('GET', '/journals', legacy('spv_umum', 'spv_umum'))).status, 200)

  // /auth/me swaps a legacy token for one that carries the answer.
  const me = await call('GET', '/auth/me', flagged)
  assert.equal((await me.json()).mustChangePassword, true)
  const swapped = sessionCookie(me)
  assert.ok(swapped, 'legacy token is re-issued')
  const claims = jwt.decode(decodeURIComponent(swapped.split('=')[1]))
  assert.equal(claims.mcp, 1)
})
