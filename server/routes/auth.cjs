// Authentication endpoints — /api/auth/*
//
//   POST /api/auth/login            { username, password } → sets session cookie
//   POST /api/auth/logout           clears the session cookie
//   GET  /api/auth/me               current session { username, role, ... }
//   POST /api/auth/change-password  { oldPassword, newPassword }
//
// Passwords are verified with bcrypt against users.password_hash. The session is
// a signed JWT in an httpOnly cookie (see middleware/auth.cjs). Role is taken
// from the user record — the client never chooses it.

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db/database.cjs');
const { logAudit } = require('../db/auditLog.cjs');
const {
  signToken,
  cookieOptions,
  getUser,
  COOKIE_NAME,
} = require('../middleware/auth.cjs');

const router = express.Router();

// Promisified single-row query.
function getRow(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function runSql(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); });
  });
}

// Throttle login attempts to blunt credential stuffing / brute force.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.', code: 'RATE_LIMITED' },
});

// Generic auth failure — never reveal whether the username or the password was
// the problem.
const BAD_CREDS = { error: 'Username atau password salah', code: 'AUTH_BAD_CREDENTIALS' };

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const username = String((req.body && req.body.username) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password wajib diisi', code: 'VALIDATION_FAILED' });
    }

    const user = await getRow('SELECT * FROM users WHERE lower(username) = ?', [username]);
    if (!user || !user.password_hash) {
      logAudit({ entity: 'auth', entityId: username, action: 'LOGIN_FAILED', actorRole: null });
      return res.status(401).json(BAD_CREDS);
    }
    if (Number(user.aktif) === 0) {
      logAudit({ entity: 'auth', entityId: username, action: 'LOGIN_DISABLED', actorRole: user.role });
      return res.status(403).json({ error: 'Akun dinonaktifkan. Hubungi Admin Sistem.', code: 'AUTH_DISABLED' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      logAudit({ entity: 'auth', entityId: username, action: 'LOGIN_FAILED', actorRole: user.role });
      return res.status(401).json(BAD_CREDS);
    }

    const token = signToken({ username: user.username, role: user.role });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    await runSql("UPDATE users SET last_login = datetime('now') WHERE username = ?", [user.username]).catch(() => {});
    logAudit({ entity: 'auth', entityId: user.username, action: 'LOGIN', actorRole: user.role });

    res.json({
      username: user.username,
      nama: user.nama || user.username,
      role: user.role,
      mustChangePassword: Number(user.must_change_password) === 1,
    });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(500).json({ error: 'Gagal memproses login', code: 'INTERNAL' });
  }
});

router.post('/logout', (req, res) => {
  const user = getUser(req);
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  if (user) logAudit({ entity: 'auth', entityId: user.username, action: 'LOGOUT', actorRole: user.role });
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Belum login', code: 'AUTH_REQUIRED' });
  try {
    const row = await getRow('SELECT username, nama, role, aktif, must_change_password, last_login FROM users WHERE username = ?', [user.username]);
    if (row) {
      // Cookie is valid but the account was since disabled → reject.
      if (Number(row.aktif) === 0) {
        res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
        return res.status(403).json({ error: 'Akun dinonaktifkan', code: 'AUTH_DISABLED' });
      }
      return res.json({
        username: row.username,
        nama: row.nama || row.username,
        role: row.role,
        mustChangePassword: Number(row.must_change_password) === 1,
        lastLogin: row.last_login || null,
      });
    }
    // Header-role sessions (ALLOW_HEADER_ROLE) have no user row.
    res.json({ username: user.username, role: user.role, mustChangePassword: false });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membaca sesi', code: 'INTERNAL' });
  }
});

router.post('/change-password', async (req, res) => {
  const user = getUser(req);
  if (!user || !user.username) return res.status(401).json({ error: 'Belum login', code: 'AUTH_REQUIRED' });
  const oldPassword = String((req.body && req.body.oldPassword) || '');
  const newPassword = String((req.body && req.body.newPassword) || '');
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password baru minimal 8 karakter', code: 'VALIDATION_FAILED' });
  }
  try {
    const row = await getRow('SELECT * FROM users WHERE username = ?', [user.username]);
    if (!row || !row.password_hash) return res.status(404).json({ error: 'Akun tidak ditemukan', code: 'NOT_FOUND' });
    const ok = await bcrypt.compare(oldPassword, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Password lama salah', code: 'AUTH_BAD_CREDENTIALS' });
    const hash = await bcrypt.hash(newPassword, 10);
    await runSql('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE username = ?', [hash, user.username]);
    logAudit({ entity: 'auth', entityId: user.username, action: 'CHANGE_PASSWORD', actorRole: user.role });
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] change-password error:', err.message);
    res.status(500).json({ error: 'Gagal mengubah password', code: 'INTERNAL' });
  }
});

module.exports = router;
