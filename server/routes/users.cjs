// User administration — /api/users/*  (SYSTEM_ADMIN only)
//
// Replaces the generic CRUD resource for users, which could not hash passwords.
// Handles account provisioning with a bcrypt password, password resets, and
// activate/deactivate, plus safeguards so an admin can't lock everyone out.

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database.cjs');
const RBAC = require('../config/rbac.cjs');
const { requireRole, getUser } = require('../middleware/auth.cjs');
const { logAudit } = require('../db/auditLog.cjs');

const router = express.Router();
const ADMIN = RBAC.SYSTEM_ADMIN;
const ADMIN_LEVEL = ['admin', 'super_admin'];
const USERNAME_RE = /^[a-z0-9_.]+$/;

const get = (sql, p) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const all = (sql, p) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p) => new Promise((res, rej) => db.run(sql, p, function (e) { return e ? rej(e) : res(this); }));

const publicUser = (u) => u && ({
  username: u.username, nama: u.nama, role: u.role,
  aktif: Number(u.aktif) === 0 ? 0 : 1,
  must_change_password: Number(u.must_change_password) === 1 ? 1 : 0,
  last_login: u.last_login || null,
});

// Count OTHER active admin-level accounts (excludes `exceptUser`). Used to block
// the last admin from being removed/demoted/deactivated.
async function otherActiveAdmins(exceptUser) {
  const rows = await all(
    `SELECT username FROM users WHERE aktif = 1 AND role IN ('admin','super_admin') AND username <> ?`,
    [exceptUser]
  );
  return rows.length;
}

// LIST
router.get('/', requireRole(ADMIN), async (req, res) => {
  try {
    const rows = await all('SELECT username, nama, role, aktif, must_change_password, last_login FROM users ORDER BY username', []);
    res.json(rows.map(publicUser));
  } catch (e) { res.status(500).json({ error: e.message, code: 'INTERNAL' }); }
});

// DETAIL
router.get('/:username', requireRole(ADMIN), async (req, res) => {
  try {
    const u = await get('SELECT username, nama, role, aktif, must_change_password, last_login FROM users WHERE username = ?', [req.params.username]);
    if (!u) return res.status(404).json({ error: 'User tidak ditemukan', code: 'NOT_FOUND' });
    res.json(publicUser(u));
  } catch (e) { res.status(500).json({ error: e.message, code: 'INTERNAL' }); }
});

// CREATE
router.post('/', requireRole(ADMIN), async (req, res) => {
  try {
    const username = String((req.body && req.body.username) || '').trim().toLowerCase();
    const role = String((req.body && req.body.role) || '').trim().toLowerCase();
    const nama = String((req.body && req.body.nama) || '').trim();
    const aktif = Number(req.body && req.body.aktif) === 0 ? 0 : 1;
    // Optional initial password; falls back to the seed default (forced change).
    const password = String((req.body && req.body.password) || '') || (process.env.SEED_USER_PASSWORD || 'perumda2026');

    if (!username || !USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Username hanya huruf kecil, angka, titik, atau garis bawah', code: 'VALIDATION_FAILED' });
    }
    if (!RBAC.ALL_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role "${role}" tidak dikenal`, code: 'VALIDATION_FAILED' });
    }
    const existing = await get('SELECT username FROM users WHERE username = ?', [username]);
    if (existing) return res.status(409).json({ error: `Username "${username}" sudah dipakai`, code: 'DUPLICATE_KEY' });

    const hash = await bcrypt.hash(password, 10);
    await run(
      'INSERT INTO users (username, nama, role, aktif, must_change_password, password_hash) VALUES (?, ?, ?, ?, 1, ?)',
      [username, nama || username, role, aktif, hash]
    );
    const actor = getUser(req) || {};
    logAudit({ entity: 'user', entityId: username, action: 'CREATE', actorRole: actor.role, actorUser: actor.username, after: { username, role, aktif } });
    res.status(201).json({ ...publicUser({ username, nama: nama || username, role, aktif, must_change_password: 1 }) });
  } catch (e) { res.status(500).json({ error: e.message, code: 'INTERNAL' }); }
});

// UPDATE (nama / role / aktif — never password here)
router.put('/:username', requireRole(ADMIN), async (req, res) => {
  try {
    const username = req.params.username;
    const before = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (!before) return res.status(404).json({ error: 'User tidak ditemukan', code: 'NOT_FOUND' });

    const nama = req.body.nama !== undefined ? String(req.body.nama).trim() : before.nama;
    const role = req.body.role !== undefined ? String(req.body.role).trim().toLowerCase() : before.role;
    const aktif = req.body.aktif !== undefined ? (Number(req.body.aktif) === 0 ? 0 : 1) : Number(before.aktif);
    if (!RBAC.ALL_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role "${role}" tidak dikenal`, code: 'VALIDATION_FAILED' });
    }

    // Last-admin protection: don't let the only active admin be demoted or disabled.
    const wasAdmin = ADMIN_LEVEL.includes(before.role) && Number(before.aktif) === 1;
    const staysAdmin = ADMIN_LEVEL.includes(role) && aktif === 1;
    if (wasAdmin && !staysAdmin && (await otherActiveAdmins(username)) === 0) {
      return res.status(409).json({ error: 'Tidak bisa menonaktifkan/menurunkan admin aktif terakhir', code: 'LAST_ADMIN' });
    }

    await run('UPDATE users SET nama = ?, role = ?, aktif = ? WHERE username = ?', [nama, role, aktif, username]);
    const actor = getUser(req) || {};
    logAudit({ entity: 'user', entityId: username, action: 'UPDATE', actorRole: actor.role, actorUser: actor.username,
      before: { role: before.role, aktif: before.aktif }, after: { role, aktif } });
    res.json(publicUser({ username, nama, role, aktif, must_change_password: before.must_change_password }));
  } catch (e) { res.status(500).json({ error: e.message, code: 'INTERNAL' }); }
});

// RESET PASSWORD
router.post('/:username/reset-password', requireRole(ADMIN), async (req, res) => {
  try {
    const username = req.params.username;
    const newPassword = String((req.body && req.body.newPassword) || '');
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password baru minimal 8 karakter', code: 'VALIDATION_FAILED' });
    const u = await get('SELECT username FROM users WHERE username = ?', [username]);
    if (!u) return res.status(404).json({ error: 'User tidak ditemukan', code: 'NOT_FOUND' });
    const hash = await bcrypt.hash(newPassword, 10);
    await run('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE username = ?', [hash, username]);
    const actor = getUser(req) || {};
    logAudit({ entity: 'user', entityId: username, action: 'RESET_PASSWORD', actorRole: actor.role, actorUser: actor.username });
    res.json({ ok: true, username });
  } catch (e) { res.status(500).json({ error: e.message, code: 'INTERNAL' }); }
});

// DELETE
router.delete('/:username', requireRole(ADMIN), async (req, res) => {
  try {
    const username = req.params.username;
    const actor = getUser(req) || {};
    if (actor.username && actor.username === username) {
      return res.status(409).json({ error: 'Anda tidak bisa menghapus akun Anda sendiri', code: 'SELF_DELETE' });
    }
    const before = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (!before) return res.status(404).json({ error: 'User tidak ditemukan', code: 'NOT_FOUND' });
    if (ADMIN_LEVEL.includes(before.role) && Number(before.aktif) === 1 && (await otherActiveAdmins(username)) === 0) {
      return res.status(409).json({ error: 'Tidak bisa menghapus admin aktif terakhir', code: 'LAST_ADMIN' });
    }
    await run('DELETE FROM users WHERE username = ?', [username]);
    logAudit({ entity: 'user', entityId: username, action: 'DELETE', actorRole: actor.role, actorUser: actor.username, before: { role: before.role } });
    res.json({ deleted: true, username });
  } catch (e) { res.status(500).json({ error: e.message, code: 'INTERNAL' }); }
});

module.exports = router;
