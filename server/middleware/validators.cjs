// Shared validators + error mappers used across all UAT modules (3-12).
//
// Keeping these in one place so test plans stay consistent: same regex,
// same error codes, same Indonesian messages.

const db = require('../db/database.cjs');

// ---------- Generic helpers ----------

const CODE_REGEX = /^[A-Za-z0-9._\- ]{1,50}$/;
const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/; // YYYY-MM

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && !v.trim());
}

function validateRequired(fields, body) {
  for (const f of fields) {
    if (isBlank(body && body[f])) return `Field "${f}" wajib diisi`;
  }
  return null;
}

function validateCodeFormat(code, label = 'kode') {
  if (isBlank(code)) return `Field "${label}" wajib diisi`;
  if (!CODE_REGEX.test(String(code).trim())) {
    return `Format ${label} tidak valid (hanya boleh huruf, angka, titik, strip, underscore, atau spasi; maks 50 karakter)`;
  }
  return null;
}

function validatePeriod(period) {
  if (isBlank(period)) return 'Field "period" wajib diisi (format YYYY-MM)';
  if (!PERIOD_REGEX.test(String(period).trim())) {
    return 'Format period tidak valid (harus YYYY-MM, contoh: 2026-01)';
  }
  return null;
}

function validatePositiveNumber(value, label = 'nominal') {
  if (value === undefined || value === null || value === '') {
    return `Field "${label}" wajib diisi`;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return `Field "${label}" harus berupa angka`;
  if (n < 0) return `Field "${label}" tidak boleh negatif`;
  return null;
}

// ---------- COA helpers ----------

const ALLOWED_COA_TYPES = new Set(['posting', 'parent', 'asset', 'liability', 'equity', 'revenue', 'expense']);

function validateCoaType(type) {
  if (isBlank(type)) return null; // optional, defaults to 'posting'
  if (!ALLOWED_COA_TYPES.has(String(type).toLowerCase())) {
    return `Tipe akun "${type}" tidak diizinkan. Tipe valid: ${[...ALLOWED_COA_TYPES].join(', ')}`;
  }
  return null;
}

function coaCodeExists(code) {
  return new Promise((resolve, reject) => {
    db.get('SELECT 1 AS x FROM coa WHERE code = ?', [code], (err, row) => {
      if (err) return reject(err);
      resolve(!!row);
    });
  });
}

// ---------- Period-lock helpers ----------

function isPeriodLocked(period) {
  return new Promise((resolve, reject) => {
    db.get('SELECT 1 AS x FROM locked_periods WHERE period = ?', [period], (err, row) => {
      if (err) return reject(err);
      resolve(!!row);
    });
  });
}

function dateToPeriod(dateStr) {
  // Accept YYYY-MM-DD or YYYY-MM, return YYYY-MM.
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

// ---------- SQLite error → friendly Indonesian ----------

function mapSqliteError(err, context) {
  const msg = (err && err.message) || '';
  if (/UNIQUE constraint failed/i.test(msg)) {
    return { status: 409, body: { error: 'Data dengan kode/ID tersebut sudah ada', code: 'DUPLICATE_KEY', detail: msg } };
  }
  if (/NOT NULL constraint failed/i.test(msg)) {
    return { status: 400, body: { error: 'Field wajib tidak boleh kosong', code: 'NOT_NULL', detail: msg } };
  }
  if (/FOREIGN KEY constraint failed/i.test(msg)) {
    return { status: 409, body: { error: 'Data terkait masih ada, tidak bisa dihapus', code: 'FK_VIOLATION', detail: msg } };
  }
  return { status: 500, body: { error: msg || `Gagal memproses ${context || 'permintaan'}`, code: 'DB_ERROR' } };
}

module.exports = {
  CODE_REGEX,
  PERIOD_REGEX,
  ALLOWED_COA_TYPES,
  isBlank,
  validateRequired,
  validateCodeFormat,
  validatePeriod,
  validatePositiveNumber,
  validateCoaType,
  coaCodeExists,
  isPeriodLocked,
  dateToPeriod,
  mapSqliteError,
};
