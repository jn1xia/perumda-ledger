// Daily bookkeeping vouchers (/api/book, plan 2026-11-25 Task 3) against a REAL
// server on a scratch copy of the dev DB, with real logins: staff enter, the
// SPV / Manajer Keuangan post or return, nobody posts their own voucher, from
// Rp 1 jt the paper signature must be ticked, numbers are unique per year.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const projRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const PORT = 3991
const API = `http://localhost:${PORT}/api`
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
let proc
let tmpDb
const jar = {}

async function login(username) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'perumda2026' }) })
  assert.equal(r.status, 200, `login ${username}`)
  const cookie = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).map(c => String(c).split(';')[0]).join('; ')
  return cookie
}
const as = (user, method, url, body) => fetch(`${API}${url}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(user === 'header-admin' ? { 'X-User-Role': 'admin' } : { Cookie: jar[user] }) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
})
const json = async (r) => { try { return await r.json() } catch { return null } }

before(async () => {
  tmpDb = path.join(os.tmpdir(), `perumda_book_${Date.now()}.db`)
  fs.copyFileSync(path.join(projRoot, 'server', 'perumda_ledger.db'), tmpDb)
  const env = { ...process.env, PORT: String(PORT), DB_PATH: tmpDb, NODE_ENV: 'test', ALLOW_HEADER_ROLE: '1' }
  delete env.ENFORCE_PASSWORD_CHANGE
  proc = spawn(process.execPath, [path.join(projRoot, 'server', 'index.cjs')], { env, stdio: 'ignore' })
  let up = false
  for (let i = 0; i < 60 && !up; i++) {
    try { const r = await fetch(`${API}/coa`, { headers: { 'X-User-Role': 'admin' } }); up = r.ok } catch { /* not up yet */ }
    if (!up) await sleep(500)
  }
  if (!up) throw new Error('server did not start')
  for (const u of ['staff_keuangan', 'spv_akuntansi', 'manager_keuangan', 'kasir_pasar']) jar[u] = await login(u)
})

after(() => {
  if (proc) proc.kill()
  setTimeout(() => { try { fs.unlinkSync(tmpDb) } catch { /* ignore */ } }, 1000)
})

const kk = (no, over = {}) => ({
  voucher_type: 'KK', voucher_no: no, tanggal: '2027-01-14', cash_account: '11101', party: 'RM Sari Rasa',
  keterangan: 'Konsumsi dan ATK rapat koordinasi',
  lines: [{ akun_code: '61060', jumlah: 1250000, keterangan: 'Konsumsi rapat' }, { akun_code: '61040', jumlah: 350000, keterangan: 'ATK rapat' }],
  sop_signed: 0,
  ...over,
})
let v1

test('staff save a Kas Keluar draft; the cash leg is added and the author recorded', async () => {
  const r = await as('staff_keuangan', 'POST', '/book/vouchers', kk('0001'))
  const b = await json(r)
  assert.equal(r.status, 201, JSON.stringify(b))
  assert.equal(b.status, 'draft')
  assert.match(b.id, /^VC-2027-\d{4}$/)
  v1 = b.id
  const j = await json(await as('staff_keuangan', 'GET', `/journals/${v1}`))
  assert.equal(j.created_by, 'staff_keuangan')
  assert.equal(j.voucher_type, 'KK')
  assert.equal(j.voucher_no, '0001')
  assert.equal(j.bukti, '0001')
  assert.equal(j.debit, 1600000)
  const cash = j.journal_lines.find(l => l.akun_code === '11101')
  assert.equal(cash.kredit, 1600000)
})

test('the same No. Bukti in the same year is refused with the form\'s words', async () => {
  const r = await as('staff_keuangan', 'POST', '/book/vouchers', kk('0001'))
  const b = await json(r)
  assert.equal(r.status, 400)
  assert.equal(b.problems[0].message, 'No. Bukti 0001 sudah dipakai. Nomor berikutnya yang kosong: 0002.')
  const n = await json(await as('staff_keuangan', 'GET', '/book/next-voucher-no?year=2027'))
  assert.equal(n.next, '0002')
})

test('two saves of the same number at the same moment: one is kept, one refused', async () => {
  const [a, b] = await Promise.all([
    as('staff_keuangan', 'POST', '/book/vouchers', kk('0050')),
    as('staff_keuangan', 'POST', '/book/vouchers', kk('0050')),
  ])
  assert.deepEqual([a.status, b.status].sort(), [201, 400])
  const bad = await json(a.status === 400 ? a : b)
  assert.match(bad.problems[0].message, /^No\. Bukti 0050 sudah dipakai\./)
})

test('staff submit; staff cannot post', async () => {
  const r = await as('staff_keuangan', 'POST', `/book/vouchers/${v1}/submit`)
  assert.equal(r.status, 200)
  assert.equal((await json(r)).status, 'pending')
  assert.equal((await as('staff_keuangan', 'POST', `/book/vouchers/${v1}/post`)).status, 403)
})

test('from Rp 1 jt the paper signature must be ticked before posting', async () => {
  const r = await as('spv_akuntansi', 'POST', `/book/vouchers/${v1}/post`)
  const b = await json(r)
  assert.equal(r.status, 409)
  assert.equal(b.code, 'SOP_NOT_SIGNED')
})

test('the SPV returns it with a note; the note is required', async () => {
  assert.equal((await as('spv_akuntansi', 'POST', `/book/vouchers/${v1}/return`, { note: ' ' })).status, 400)
  const r = await as('spv_akuntansi', 'POST', `/book/vouchers/${v1}/return`, { note: 'Mohon centang tanda tangan Direktur Umum & Keuangan' })
  assert.equal(r.status, 200)
  const j = await json(await as('staff_keuangan', 'GET', `/journals/${v1}`))
  assert.equal(j.status, 'returned')
  assert.equal(j.returned_by, 'spv_akuntansi')
  assert.equal(j.returned_note, 'Mohon centang tanda tangan Direktur Umum & Keuangan')
})

test('the author fixes it and submits; the SPV posts; who approved is recorded', async () => {
  const r = await as('staff_keuangan', 'PUT', `/book/vouchers/${v1}`, { ...kk('0001'), sop_signed: 1, submit: true })
  assert.equal(r.status, 200, JSON.stringify(await json(r.clone())))
  assert.equal((await json(r)).status, 'pending')
  const p = await as('spv_akuntansi', 'POST', `/book/vouchers/${v1}/post`)
  assert.equal(p.status, 200)
  const j = await json(await as('staff_keuangan', 'GET', `/journals/${v1}`))
  assert.equal(j.status, 'posted')
  assert.equal(j.approved_by, 'spv_akuntansi')
  assert.ok(j.approved_at)
  assert.equal(j.sop_signed, 1)
})

test('a posted voucher cannot be edited or deleted', async () => {
  assert.equal((await as('staff_keuangan', 'PUT', `/book/vouchers/${v1}`, kk('0001'))).status, 409)
  assert.equal((await as('staff_keuangan', 'DELETE', `/book/vouchers/${v1}`)).status, 409)
})

test('nobody posts their own voucher', async () => {
  const c = await json(await as('spv_akuntansi', 'POST', '/book/vouchers', kk('0003', { lines: [{ akun_code: '61040', jumlah: 500000, keterangan: 'ATK' }], submit: true })))
  assert.equal(c.status, 'pending')
  const own = await as('spv_akuntansi', 'POST', `/book/vouchers/${c.id}/post`)
  assert.equal(own.status, 403)
  assert.equal((await json(own)).code, 'SELF_APPROVAL_FORBIDDEN')
  assert.equal((await as('manager_keuangan', 'POST', `/book/vouchers/${c.id}/post`)).status, 200)
})

test('another Keuangan user may edit a draft; a kasir may not', async () => {
  const d = await json(await as('staff_keuangan', 'POST', '/book/vouchers', kk('0004')))
  assert.equal((await as('manager_keuangan', 'PUT', `/book/vouchers/${d.id}`, kk('0004', { keterangan: 'Diperbaiki manajer' }))).status, 200)
  assert.equal((await as('kasir_pasar', 'PUT', `/book/vouchers/${d.id}`, kk('0004'))).status, 403)
  assert.equal((await as('staff_keuangan', 'DELETE', `/book/vouchers/${d.id}`)).status, 200)
})

test('a voucher dated in a locked month is refused', async () => {
  const lock = await as('header-admin', 'POST', '/periods/locks', { period: '2026-10', reason: 'uji' })
  assert.ok([200, 201].includes(lock.status), `lock ${lock.status}`)
  const r = await as('staff_keuangan', 'POST', '/book/vouchers', kk('0005', { tanggal: '2026-10-15' }))
  assert.equal(r.status, 400)
  assert.equal((await json(r)).problems[0].message, 'Tanggal 15/10/2026 masuk bulan Oktober 2026, yang sudah dikunci.')
})

test('the Sub Akun list: SPV adds; unknown or missing Sub Akun is refused; the seed reads journal lines', async () => {
  assert.equal((await as('staff_keuangan', 'POST', '/book/sub-akun', { account_code: '61060', name: 'Beban Makan Minum Rapat' })).status, 403)
  assert.equal((await as('spv_akuntansi', 'POST', '/book/sub-akun', { account_code: '61060', name: 'Beban Makan Minum Rapat' })).status, 201)
  assert.equal((await as('spv_akuntansi', 'POST', '/book/sub-akun', { account_code: '61060', name: 'Beban Makan Minum Rapat' })).status, 409)
  const unknown = await as('staff_keuangan', 'POST', '/book/vouchers', kk('0006', { lines: [{ akun_code: '61060', sub_akun: 'Beban Makan Siang', jumlah: 100000 }] }))
  assert.equal(unknown.status, 400)
  assert.equal((await json(unknown)).problems[0].message, 'Baris 1: Sub Akun "Beban Makan Siang" belum ada di daftar. Minta SPV menambahkannya di Data Induk.')
  const missing = await as('staff_keuangan', 'POST', '/book/vouchers', kk('0006', { lines: [{ akun_code: '61060', jumlah: 100000 }] }))
  assert.equal((await json(missing)).problems[0].message, 'Baris 1: Sub Akun belum dipilih.')

  const jr = await as('header-admin', 'POST', '/journals', {
    tanggal: '2026-11-20', keterangan: 'uji seed', debit: 100, kredit: 100, status: 'pending',
    akun_debit: '61070', akun_kredit: '11101',
    lines: [{ akun_code: '61070', akun_name: 'Beban Perlengkapan dan Pemeliharaan Kantor', sub_akun: 'Beban ATK Lapangan', debit: 100, kredit: 0 }, { akun_code: '11101', akun_name: 'Kas Kecil', debit: 0, kredit: 100 }],
  })
  assert.equal(jr.status, 201)
  const seed = await json(await as('spv_akuntansi', 'POST', '/book/sub-akun/seed'))
  assert.ok(seed.added >= 1, JSON.stringify(seed))
  const rows = await json(await as('staff_keuangan', 'GET', '/book/sub-akun'))
  assert.ok(rows.some(r => r.account_code === '61070' && r.name === 'Beban ATK Lapangan'))
})
