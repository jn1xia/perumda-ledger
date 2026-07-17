// RBAC regression matrix — spins a real server on a scratch DB copy and pins
// role × endpoint → HTTP status. Guards against the role-drift class of bug
// (e.g. report endpoints that used to 403 every canonical role) and the
// unguarded-route class (reset/export/locks that used to accept anyone).
//
// Uses ALLOW_HEADER_ROLE=1 so cases can assert many roles concisely via the
// X-User-Role header (production authenticates via the session cookie instead).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const projRoot = path.dirname(testsDir);
const PORT = 3971;
const API = `http://localhost:${PORT}/api`;
let proc, tmpDb;

before(async () => {
  tmpDb = path.join(os.tmpdir(), `perumda_rbac_${Date.now()}.db`);
  fs.copyFileSync(path.join(projRoot, 'server', 'perumda_ledger.db'), tmpDb);
  proc = spawn(process.execPath, [path.join(projRoot, 'server', 'index.cjs')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: tmpDb, NODE_ENV: 'test', ALLOW_HEADER_ROLE: '1', JWT_SECRET: 'test' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${API}/journals`, { headers: { 'X-User-Role': 'admin' } }); if (r.ok) return; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
});

after(() => {
  if (proc) proc.kill();
  setTimeout(() => { try { fs.unlinkSync(tmpDb); } catch { /* ignore */ } }, 1000);
});

function call(method, p, role, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (role) headers['X-User-Role'] = role;
  return fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

// [label, method, path, role|null, expectedStatus, body?]
const CASES = [
  // Reports readable by every authenticated role (the drift bug: these used to 403).
  ['neraca staff_keuangan', 'GET', '/reports/neraca?period=2026-04', 'staff_keuangan', 200],
  ['neraca manager_keuangan', 'GET', '/reports/neraca?period=2026-04', 'manager_keuangan', 200],
  ['neraca direktur_utama', 'GET', '/reports/neraca?period=2026-04', 'direktur_utama', 200],
  ['neraca spi', 'GET', '/reports/neraca?period=2026-04', 'spi', 200],
  ['neraca no-role', 'GET', '/reports/neraca?period=2026-04', null, 401],

  // Previously-unguarded routes now require auth.
  ['export no-role', 'GET', '/export', null, 401],
  ['export auditor', 'GET', '/export', 'auditor', 200],
  ['ai-context no-role', 'GET', '/ai-context', null, 401],
  ['ref-neraca no-role', 'GET', '/reports/ref-neraca?period=2026-04', null, 401],

  // Whole-DB reset: super_admin only (never assert the 200 — it would wipe).
  ['reset no-role', 'POST', '/reset', null, 401],
  ['reset manager_keuangan', 'POST', '/reset', 'manager_keuangan', 403],

  // Period locks (legacy routes were unguarded).
  ['lock no-role', 'POST', '/locked-periods', null, 401, { period: '2099-01' }],
  ['lock kasir_bisnis', 'POST', '/locked-periods', 'kasir_bisnis', 403, { period: '2099-01' }],
  ['lock manager_keuangan', 'POST', '/locked-periods', 'manager_keuangan', 200, { period: '2099-01' }],
  ['unlock staff_keuangan', 'DELETE', '/locked-periods/2099-01', 'staff_keuangan', 403],
  ['unlock super_admin', 'DELETE', '/locked-periods/2099-01', 'super_admin', 200],

  // User administration: SYSTEM_ADMIN only.
  ['users manager_it', 'GET', '/users', 'manager_it', 200],
  ['users staff_keuangan', 'GET', '/users', 'staff_keuangan', 403],
  ['users no-role', 'GET', '/users', null, 401],

  // COA write: only COA_WRITE roles (kasir denied; read allowed for all).
  ['coa read kasir_bisnis', 'GET', '/coa', 'kasir_bisnis', 200],
  ['coa write kasir_bisnis', 'POST', '/coa', 'kasir_bisnis', 403, { code: '99999', name: 'X', type: 'posting' }],
];

test('RBAC matrix: role × endpoint → status', async () => {
  const failures = [];
  for (const [label, method, p, role, expected, body] of CASES) {
    const res = await call(method, p, role, body);
    if (res.status !== expected) failures.push(`${label}: expected ${expected}, got ${res.status}`);
  }
  assert.equal(failures.length, 0, '\n' + failures.join('\n'));
});
