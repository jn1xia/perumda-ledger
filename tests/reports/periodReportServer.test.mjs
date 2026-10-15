// Integration test: official period reports (/api/reports/period-reports)
// against a REAL server process on a scratch copy of the dev DB — saving,
// replacing and deleting a Triwulan report never touches the monthly data, the
// payload is validated, and a period whose months are all locked is closed.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const projRoot = path.dirname(testsDir)
const PORT = 3986
const API = `http://localhost:${PORT}/api`
const HDR = { 'Content-Type': 'application/json', 'X-User-Role': 'admin' }

let proc
let tmpDb

before(async () => {
  tmpDb = path.join(os.tmpdir(), `perumda_period_${Date.now()}.db`)
  fs.copyFileSync(path.join(projRoot, 'server', 'perumda_ledger.db'), tmpDb)
  proc = spawn(process.execPath, [path.join(projRoot, 'server', 'index.cjs')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: tmpDb, NODE_ENV: 'test', ALLOW_HEADER_ROLE: '1' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${API}/coa`, { headers: HDR }); if (r.ok) return } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('server did not start')
})

after(() => {
  if (proc) proc.kill()
  setTimeout(() => { try { fs.unlinkSync(tmpDb) } catch { /* ignore */ } }, 1000)
})

// A pack as periodReport.extractPeriodPack builds it (trimmed).
const pack = (key = '2026-TW1', label = 'Triwulan I 2026') => ({
  version: 1, key, code: key.split('-')[1], year: 2026, preset: 'tw1', label,
  fileName: 'LAMPIRAN_LAPORAN_TRIWULAN_I.xlsx', company: 'PERUSAHAAN UMUM DAERAH PASAR BAIMAN (PERUMDA)',
  reports: {
    neraca: {
      sheet: 'NERACA TW I 2026', title: 'LAPORAN POSISI KEUANGAN', subtitle: 'Untuk Periode Triwulan I Tahun 2026',
      columns: ['Triwulan I', 'Desember 2025 (Audited)'],
      rows: [{ label: 'ASET', depth: 0, values: [null, null] }, { label: 'Kas Kecil - Kantor', depth: 2, values: [14920321, 12596759] }],
    },
    labaRugi: {
      sheet: 'LABA RUGI TW I 2026', title: 'LAPORAN LABA (RUGI)', subtitle: 'Untuk Periode Triwulan I Tahun 2026',
      columns: ['Triwulan I', 'Desember 2025 (Audited)'],
      rows: [{ label: 'Pendapatan Bisnis Utama', depth: 2, values: [1409731753, 7050268015] }],
    },
  },
  lra: {
    penerimaan: {
      sheet: 'Penerimaan', title: 'Laporan Penerimaan Triwulan I', kinerjaLabel: 'Kinerja Indikator',
      columns: [{ col: 6, label: 'Target 1 Tahun', group: null, num: '(5)', formula: '', role: 'anggaran' }],
      rows: [{ kind: 'item', outline: '1.1', nama: 'Pengelolaan Pasar', kinerja: 'Jumlah Pendapatan', values: [8632194723], penjelasan: '', depth: 1 }],
    },
  },
  warnings: [],
})

const get = async (p, headers = HDR) => { const r = await fetch(`${API}${p}`, { headers }); return { status: r.status, body: await r.json() } }
const send = async (method, p, body, headers = HDR) => {
  const r = await fetch(`${API}${p}`, { method, headers, body: body == null ? undefined : JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}

// What a period report must never change.
async function monthlyFingerprint() {
  const journals = (await get('/journals')).body
  const anggaran = (await get('/anggaran')).body
  const neraca = await Promise.all(['2026-01', '2026-02', '2026-03'].map(p => get(`/reports/ref-neraca?period=${p}`)))
  const status = (await get('/reports/period-status')).body
  return {
    journals: journals.length,
    journalIds: journals.map(j => j.id).sort().join(','),
    anggaran: anggaran.length,
    neraca: neraca.map(r => r.body.length),
    status: JSON.stringify(status),
  }
}

test('saving and replacing an official TW report keeps every monthly table as it was', async () => {
  const before = await monthlyFingerprint()

  const saved = await send('POST', '/reports/period-reports', { key: '2026-TW1', fileName: 'TW1.xlsx', data: pack() })
  assert.equal(saved.status, 200, JSON.stringify(saved.body))
  assert.equal(saved.body.replaced, false)
  assert.deepEqual(saved.body.reports, ['neraca', 'labaRugi'])
  assert.deepEqual(saved.body.lra, ['penerimaan'])

  const list = (await get('/reports/period-reports')).body
  const row = list.find(r => r.period_key === '2026-TW1')
  assert.ok(row, 'listed')
  assert.equal(row.label, 'Triwulan I 2026')
  assert.equal(row.file_name, 'TW1.xlsx')
  assert.equal(row.set_by, 'admin')
  assert.equal(row.data, undefined, 'the list carries no report data')

  const one = await get('/reports/period-reports/2026-TW1')
  assert.equal(one.status, 200)
  assert.deepEqual(one.body.data, pack(), 'returned exactly as uploaded')

  const again = await send('POST', '/reports/period-reports', { key: '2026-TW1', fileName: 'TW1 revisi.xlsx', data: pack() })
  assert.equal(again.status, 200)
  assert.equal(again.body.replaced, true)
  assert.equal((await get('/reports/period-reports')).body.filter(r => r.period_key === '2026-TW1').length, 1)

  assert.deepEqual(await monthlyFingerprint(), before, 'journals, anggaran, monthly snapshots and period modes unchanged')
})

test('a bad key, a mismatched pack or one without Neraca and Laba Rugi is rejected', async () => {
  for (const key of ['2026-09', '2026-TW5', 'TW1', '']) {
    const r = await send('POST', '/reports/period-reports', { key, data: pack() })
    assert.equal(r.status, 400, key)
  }
  const mismatch = await send('POST', '/reports/period-reports', { key: '2026-TW2', data: pack() })
  assert.equal(mismatch.status, 400)
  assert.match(mismatch.body.error, /tidak sama/)
  const noStatements = pack('2026-S1', 'Semester I 2026')
  noStatements.reports = { arusKas: { columns: ['Semester I'], rows: [{ label: 'Kas', depth: 0, values: [1] }] } }
  const r = await send('POST', '/reports/period-reports', { key: '2026-S1', data: noStatements })
  assert.equal(r.status, 400)
  assert.match(r.body.error, /Neraca atau Laba Rugi/)
  const emptyRows = pack('2026-S1', 'Semester I 2026')
  emptyRows.reports.labaRugi.rows = []
  assert.equal((await send('POST', '/reports/period-reports', { key: '2026-S1', data: emptyRows })).status, 400)
  assert.equal((await get('/reports/period-reports/2026-S2')).status, 404)
  assert.equal((await get('/reports/period-reports/abc')).status, 400)
})

test('read for every finance role, write for journal writers only', async () => {
  const auditor = { ...HDR, 'X-User-Role': 'auditor' }
  assert.equal((await get('/reports/period-reports', auditor)).status, 200)
  assert.equal((await send('POST', '/reports/period-reports', { key: '2026-TW3', data: pack('2026-TW3', 'Triwulan III 2026') }, auditor)).status, 403)
  assert.equal((await send('DELETE', '/reports/period-reports/2026-TW1', null, auditor)).status, 403)
})

test('a period with every month locked is closed; unlocking one month opens it again', async () => {
  for (const p of ['2026-01', '2026-02', '2026-03']) {
    const r = await send('POST', '/periods/locks', { period: p, reason: 'tutup buku' })
    assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body))
  }
  const blocked = await send('POST', '/reports/period-reports', { key: '2026-TW1', data: pack() })
  assert.equal(blocked.status, 423)
  assert.equal(blocked.body.code, 'PERIOD_LOCKED')
  assert.equal((await send('DELETE', '/reports/period-reports/2026-TW1')).status, 423)
  // TW II shares no month with the locks.
  assert.equal((await send('POST', '/reports/period-reports', { key: '2026-TW2', data: pack('2026-TW2', 'Triwulan II 2026') })).status, 200)

  assert.equal((await send('POST', '/periods/unlock', { period: '2026-02', reason: 'revisi laporan TW I' })).status, 200)
  assert.equal((await send('POST', '/reports/period-reports', { key: '2026-TW1', data: pack() })).status, 200)
  const del = await send('DELETE', '/reports/period-reports/2026-TW1')
  assert.equal(del.status, 200, JSON.stringify(del.body))
  assert.equal((await get('/reports/period-reports/2026-TW1')).status, 404)
  assert.equal((await send('DELETE', '/reports/period-reports/2026-TW1')).status, 404)
  for (const p of ['2026-01', '2026-03']) await send('POST', '/periods/unlock', { period: p, reason: 'selesai uji' })
})
