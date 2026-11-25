// The menu grouped by task (plan 2026-11-25, Task 6; spec §5.1): staff see
// the work they do, the unused modules sit under "Lainnya" for admin only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { menuFor, NAV_GROUPS } from '../../src/components/Layout/navItems.js'
import { canAccessPath } from '../../src/data/roles.js'

const paths = (menu) => menu.flatMap(g => g.items.map(i => i.path))
const groups = (menu) => menu.map(g => g.group)

test('staff see Kerja harian, Tutup bulan, Laporan and Data induk — no approvals, no Lainnya', () => {
  const m = menuFor('staff_keuangan')
  for (const g of ['Kerja harian', 'Tutup bulan', 'Laporan', 'Data induk']) assert.ok(groups(m).includes(g), g)
  assert.ok(!groups(m).includes('Lainnya'))
  assert.ok(paths(m).includes('/input-voucher'))
  assert.ok(paths(m).includes('/daftar-voucher'))
  assert.ok(!paths(m).includes('/persetujuan'))
  assert.ok(!paths(m).includes('/piutang'))
  assert.equal(m[0].items[0].path, '/home')
})

test('the SPV Akuntansi sees Persetujuan', () => {
  assert.ok(paths(menuFor('spv_akuntansi')).includes('/persetujuan'))
  assert.ok(paths(menuFor('manager_keuangan')).includes('/persetujuan'))
})

test('admin and super_admin also get Lainnya with the unused modules', () => {
  const m = menuFor('super_admin')
  const lain = m.find(g => g.group === 'Lainnya')
  assert.ok(lain)
  assert.ok(lain.items.some(i => i.path === '/piutang'))
  assert.ok(lain.items.some(i => i.path === '/dashboard'))
})

test('page access follows the menu', () => {
  assert.equal(canAccessPath('staff_keuangan', '/persetujuan'), false)
  assert.equal(canAccessPath('spv_akuntansi', '/persetujuan'), true)
  assert.equal(canAccessPath('staff_keuangan', '/input-voucher'), true)
  assert.equal(canAccessPath('kasir_pasar', '/input-voucher'), false)
})

test('every menu path appears once', () => {
  const all = NAV_GROUPS.flatMap(g => g.items.map(i => i.path))
  assert.equal(new Set(all).size, all.length)
})
