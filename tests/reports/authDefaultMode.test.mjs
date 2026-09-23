// Default mode of the forced password change: ENFORCE_PASSWORD_CHANGE unset.
//
// At the owner's request (23-09-2026) the default passwords keep working as
// before while the current round of fixes is finished: a default-password login
// gets full access plus the reminder banner, a new user may be created without a
// password (falls back to the default) and an admin may reset to the default.
// Setting ENFORCE_PASSWORD_CHANGE=1 on the server turns the gate on — pinned by
// authForcedChange.test.mjs.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const projRoot = path.dirname(testsDir)
const PORT = 3984
const API = `http://localhost:${PORT}/api`
const DEFAULT_PW = 'perumda2026'
let proc, tmpDb

before(async () => {
  tmpDb = path.join(os.tmpdir(), `perumda_authdefault_${Date.now()}.db`)
  fs.copyFileSync(path.join(projRoot, 'server', 'perumda_ledger.db'), tmpDb)
  const env = { ...process.env, PORT: String(PORT), DB_PATH: tmpDb, NODE_ENV: 'test', JWT_SECRET: 'test' }
  for (const k of ['ALLOW_HEADER_ROLE', 'DISABLE_RBAC', 'SEED_USER_PASSWORD', 'ENFORCE_PASSWORD_CHANGE']) delete env[k]
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

test('a default-password login works as before: full access, reminder only', async () => {
  const s = await login('staff_keuangan', DEFAULT_PW)
  assert.equal(s.status, 200)
  assert.equal(s.body.mustChangePassword, true, 'the reminder banner still shows')
  assert.equal(s.body.passwordChangeEnforced, false)
  for (const p of ['/journals', '/coa', '/reports/neraca?period=2026-04', '/giro'])
    assert.equal((await call('GET', p, s.cookie)).status, 200, p)
  const me = await (await call('GET', '/auth/me', s.cookie)).json()
  assert.equal(me.passwordChangeEnforced, false)

  // A token from before the flag existed is not looked up either.
  const { default: jwt } = await import('jsonwebtoken')
  const legacy = `perumda_session=${jwt.sign({ username: 'staff_umum', role: 'staff_umum' }, 'test', { expiresIn: 3600 })}`
  assert.equal((await call('GET', '/journals', legacy)).status, 200)
})

test('admins can again create a user without a password and reset to the default', async () => {
  const admin = await login('manager_it', DEFAULT_PW)
  const created = await call('POST', '/users', admin.cookie, { username: 'kasir.lama', role: 'kasir_pasar' })
  assert.equal(created.status, 201, 'blank password falls back to the default, as before')
  const k = await login('kasir.lama', DEFAULT_PW)
  assert.equal(k.status, 200)
  assert.equal(k.body.mustChangePassword, true)

  const reset = await call('POST', '/users/kasir.lama/reset-password', admin.cookie, { newPassword: DEFAULT_PW })
  assert.equal(reset.status, 200, 'reset to the default is allowed again')

  // Changing a password still has to change it.
  const same = await call('POST', '/auth/change-password', k.cookie, { oldPassword: DEFAULT_PW, newPassword: DEFAULT_PW })
  assert.equal(same.status, 400)
})
