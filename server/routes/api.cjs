const db = require('../db/database.cjs');
const express = require('express');
const path = require('path');
const XLSX = require('xlsx');
const router = express.Router();
const counters = require('./counters.cjs');
const { requireRole, getRole } = require('../middleware/auth.cjs');
const { logAudit } = require('../db/auditLog.cjs');
// Audited report snapshot config + parsers (reused from the build-time importer).
const reportImport = require('../../scripts/import_report_data.cjs');
const {
  validateCodeFormat,
  validateRequired,
  validateCoaType,
  validatePeriod,
  validatePositiveNumber,
  isPeriodLocked,
  dateToPeriod,
  coaCodeExists,
  mapSqliteError: mapSqliteErrorShared,
} = require('../middleware/validators.cjs');

// =============================================================
// === ROLE CONSTANTS — Perumda Pasar Banjarmasin Org Structure =
// === Sesuai: SOP Dokumen Permintaan, SOP Pembayaran B&J,     =
// ===         SOP Laporan Keuangan, SOP Rekonsiliasi Bulanan  =
// =============================================================

// SOP Pembayaran Barang & Jasa — batas otoritas:
//   < Rp  1.000.000  : Manajer Departemen
//   > Rp  1.000.000  : Direktur Umum & Keuangan
//   > Rp 50.000.000  : Direktur Utama
const APPROVAL_THRESHOLD_MANAGER  =  1_000_000;
const APPROVAL_THRESHOLD_DIREKTUR = 50_000_000;

// Semua jabatan aktif dalam sistem
const ALL_ROLES = [
  // Governance
  'dewan_pengawas', 'direktur_utama',
  // Direktorat Bisnis & Operasional
  'direktur_bisnis_operasional',
  'manager_bisnis', 'spv_bisnis', 'spv_pemasaran',
  'kepala_gudang', 'kasir_bisnis', 'staff_bisnis',
  'manager_operasional', 'spv_penagihan', 'spv_sarpras', 'staff_operasional',
  'kepala_pasar', 'koordinator_pasar', 'kasir_pasar', 'staff_penagihan',
  // Direktorat Umum & Keuangan
  'direktur_umum_keuangan',
  'manager_keuangan', 'spv_anggaran', 'spv_akuntansi', 'staff_keuangan',
  'manager_umum', 'manager_it', 'sekretaris', 'spv_hukum', 'spv_umum', 'staff_umum',
  // SPI
  'spi', 'staff_spi',
  // System
  'admin', 'super_admin',
  // ── Legacy aliases (backward-compat, map to new roles) ──
  'akuntan', 'auditor', 'manajer_keuangan', 'direktur', 'kasir',
  'staff_gudang', 'staff_pembelian', 'staff_pajak',
];

// Role groupings
// Finance read: semua yang bisa lihat laporan keuangan
const _FIN_READ = ALL_ROLES; // semua bisa baca (RBAC halus di endpoint sensitif)

// Finance write: staff keuangan ke atas
const _FIN = [
  'staff_keuangan', 'spv_akuntansi', 'spv_anggaran', 'manager_keuangan',
  'direktur_umum_keuangan', 'direktur_utama',
  'admin', 'super_admin',
  'akuntan', // legacy alias
];

// Inventory / gudang
const _SG = [
  'kepala_gudang', 'koordinator_pasar', 'staff_bisnis',
  'staff_keuangan', 'spv_akuntansi',
  'admin', 'super_admin',
  'staff_gudang', // legacy
];

// Purchasing / PO (PBJ — Pengadaan Barang & Jasa)
const _SP = [
  'spv_sarpras', 'spv_umum', 'staff_umum', 'manager_umum',
  'staff_keuangan', 'spv_akuntansi', 'manager_keuangan',
  'admin', 'super_admin',
  'staff_pembelian', // legacy
];

// Penagihan / AR
const _SPN = [
  'spv_penagihan', 'staff_penagihan', 'kasir_pasar', 'kepala_pasar',
  'staff_keuangan', 'spv_akuntansi',
  'admin', 'super_admin',
  'staff_penagihan', // legacy duplicate ok
];

// Pajak / E-Faktur
const _SPJ = [
  'staff_keuangan', 'spv_akuntansi', 'manager_keuangan',
  'admin', 'super_admin',
  'staff_pajak', // legacy
];

// Kasir (voucher kas)
const _KS = [
  'kasir_bisnis', 'kasir_pasar', 'kasir_pasar',
  'staff_keuangan', 'spv_akuntansi',
  'admin', 'super_admin',
  'kasir', // legacy
];

// Legacy read — semua role boleh baca data transaksi
const _LEGACY_ROLES_READ = ALL_ROLES;

const _LEGACY_PATHS = [
  { rx: /^\/piutang(\/.*)?$/,           writeRoles: _SPN,  readRoles: _LEGACY_ROLES_READ, requiredFields: ['tanggal'], numericFields: ['jumlah','terbayar','sisa'] },
  { rx: /^\/hutang(\/.*)?$/,            writeRoles: _SP,   readRoles: _LEGACY_ROLES_READ, requiredFields: ['tanggal'], numericFields: ['jumlah','terbayar','sisa'] },
  { rx: /^\/assets(\/.*)?$/,            writeRoles: _FIN,  readRoles: _LEGACY_ROLES_READ, requiredFields: ['nama'],    numericFields: ['nilai_perolehan','penyusutan_per_tahun','nilai_buku'] },
  { rx: /^\/inventory(\/.*)?$/,         writeRoles: _SG,   readRoles: _LEGACY_ROLES_READ, requiredFields: ['kode','nama'], numericFields: ['stok_awal','masuk','keluar','stok_akhir','harga_satuan'] },
  { rx: /^\/bbm(\/.*)?$/,               writeRoles: _SG,   readRoles: _LEGACY_ROLES_READ, requiredFields: ['tanggal'], numericFields: ['volume','harga','total'] },
  { rx: /^\/giro(\/.*)?$/,              writeRoles: _KS,   readRoles: _LEGACY_ROLES_READ, requiredFields: ['noGiro','tanggal'], numericFields: ['jumlah'] },
  { rx: /^\/pelanggan(\/.*)?$/,         writeRoles: _SPN,  readRoles: _LEGACY_ROLES_READ, requiredFields: ['nama'],    numericFields: [] },
  { rx: /^\/supplier(\/.*)?$/,          writeRoles: _SP,   readRoles: _LEGACY_ROLES_READ, requiredFields: ['nama'],    numericFields: [] },
  { rx: /^\/efaktur(\/.*)?$/,           writeRoles: _SPJ,  readRoles: _LEGACY_ROLES_READ, requiredFields: ['tanggal'], numericFields: ['dpp','ppn'] },
  { rx: /^\/sales-orders(\/.*)?$/,      writeRoles: _SPN,  readRoles: _LEGACY_ROLES_READ, requiredFields: ['tanggal'], numericFields: ['total'] },
  { rx: /^\/purchase-orders(\/.*)?$/,   writeRoles: _SP,   readRoles: _LEGACY_ROLES_READ, requiredFields: ['tanggal'], numericFields: ['total'] },
  { rx: /^\/rekonsiliasi(\/.*)?$/,      writeRoles: _FIN,  readRoles: _LEGACY_ROLES_READ, requiredFields: ['tanggal'], numericFields: ['jumlah'] },
  { rx: /^\/anggaran(\/.*)?$/,          writeRoles: _FIN,  readRoles: _LEGACY_ROLES_READ, requiredFields: ['kode','nama'], numericFields: ['anggaran_awal','target_bulan','realisasi'] },
];

router.use((req, res, next) => {
  const cfg = _LEGACY_PATHS.find((p) => p.rx.test(req.path));
  if (!cfg) return next();
  if (process.env.DISABLE_RBAC === '1') return next();

  const isWrite = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  const allowed = isWrite ? cfg.writeRoles : cfg.readRoles;
  const role = (req.headers['x-user-role'] || '').toString().trim().toLowerCase();
  if (!role) {
    return res.status(401).json({ error: 'Akses ditolak: header X-User-Role wajib disertakan', code: 'AUTH_MISSING_ROLE' });
  }
  if (role !== 'super_admin' && role !== 'admin' && !allowed.includes(role)) {
    return res.status(403).json({ error: `Access Denied: peran "${role}" tidak diizinkan untuk endpoint ini`, code: 'AUTH_FORBIDDEN', requiredRoles: allowed });
  }

  if (isWrite && req.method !== 'DELETE') {
    const body = req.body || {};
    if (req.method === 'POST') {
      for (const f of cfg.requiredFields) {
        const v = body[f];
        if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
          return res.status(400).json({ error: `Field "${f}" wajib diisi`, code: 'VALIDATION_FAILED' });
        }
      }
    }
    for (const f of cfg.numericFields) {
      if (body[f] === undefined || body[f] === null || body[f] === '') continue;
      const n = Number(body[f]);
      if (!Number.isFinite(n)) {
        return res.status(400).json({ error: `Field "${f}" harus berupa angka`, code: 'VALIDATION_FAILED' });
      }
      if (n < 0) {
        return res.status(400).json({ error: `Field "${f}" tidak boleh negatif`, code: 'VALIDATION_FAILED' });
      }
    }
  }
  next();
});

// COA-specific override of mapSqliteError: keeps the original "Kode akun sudah terdaftar"
// message for TC-2-06 backward compatibility.
function mapSqliteError(err, context) {
  const msg = (err && err.message) || '';
  if (/UNIQUE constraint failed: coa\.code/i.test(msg)) {
    return { status: 409, body: { error: 'Kode akun sudah terdaftar', code: 'DUPLICATE_KEY', detail: msg } };
  }
  return mapSqliteErrorShared(err, context);
}

function validateCoaPayload(body, { requireCode = true } = {}) {
  if (requireCode) {
    const codeErr = validateCodeFormat(body && body.code, 'code');
    if (codeErr) return codeErr;
  }
  if (!body || !body.name || !String(body.name).trim()) {
    return 'Field "name" wajib diisi';
  }
  // Module 3: validate type against allow-list
  const typeErr = validateCoaType(body.type);
  if (typeErr) return typeErr;
  return null;
}

// === JOURNALS ===
const JOURNAL_READ_ROLES = ALL_ROLES; // semua jabatan bisa baca jurnal sesuai kebutuhan operasional

router.get('/journals', requireRole(JOURNAL_READ_ROLES), (req, res) => {
  // Module 9/10: support filters ?month=YYYY-MM, ?from=YYYY-MM-DD&to=YYYY-MM-DD,
  // ?account=<code>, ?status=, ?bukti_prefix=
  const { month, from, to, account, status, bukti_prefix } = req.query || {};
  const where = [];
  const params = [];
  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) {
      return res.status(400).json({ error: 'Format month tidak valid (YYYY-MM)', code: 'VALIDATION_FAILED' });
    }
    where.push("substr(tanggal,1,7) = ?");
    params.push(month);
  }
  if (from && to) {
    if (from > to) {
      return res.status(400).json({ error: 'Rentang tanggal tidak valid (from > to)', code: 'VALIDATION_FAILED' });
    }
    where.push('tanggal BETWEEN ? AND ?');
    params.push(from, to);
  } else if (from) {
    where.push('tanggal >= ?'); params.push(from);
  } else if (to) {
    where.push('tanggal <= ?'); params.push(to);
  }
  if (account) {
    where.push('(akun_debit = ? OR akun_kredit = ?)');
    params.push(account, account);
  }
  if (status) {
    where.push('status = ?'); params.push(status);
  }
  if (bukti_prefix) {
    where.push('bukti LIKE ?'); params.push(`${bukti_prefix}%`);
  }
  const sql = `SELECT * FROM journals ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY tanggal DESC, created_at DESC`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // Attach journal_lines for each journal
    if (rows.length === 0) return res.json(rows);
    const ids = rows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    db.all(`SELECT * FROM journal_lines WHERE journal_id IN (${placeholders}) ORDER BY journal_id, line_order`, ids, (err2, allLines) => {
      if (err2) {
        // Fallback: return without lines if table doesn't exist yet
        return res.json(rows.map(r => ({ ...r, journal_lines: [] })));
      }
      const linesByJournal = {};
      (allLines || []).forEach(l => {
        if (!linesByJournal[l.journal_id]) linesByJournal[l.journal_id] = [];
        linesByJournal[l.journal_id].push(l);
      });
      res.json(rows.map(r => ({ ...r, journal_lines: linesByJournal[r.id] || [] })));
    });
  });
});

// Module 10: summary aggregation (totals, by-account, by-status)
router.get('/journals/summary', requireRole(JOURNAL_READ_ROLES), (req, res) => {
  const { month, from, to } = req.query || {};
  const where = [];
  const params = [];
  if (month) { where.push("substr(tanggal,1,7) = ?"); params.push(month); }
  if (from && to) {
    if (from > to) return res.status(400).json({ error: 'Rentang tanggal tidak valid (from > to)', code: 'VALIDATION_FAILED' });
    where.push('tanggal BETWEEN ? AND ?'); params.push(from, to);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  db.get(`SELECT COUNT(*) AS count, COALESCE(SUM(debit),0) AS total_debit, COALESCE(SUM(kredit),0) AS total_kredit FROM journals ${w}`, params, (err, totals) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all(`SELECT akun_debit AS account, COUNT(*) AS count, SUM(debit) AS debit, SUM(kredit) AS kredit FROM journals ${w} GROUP BY akun_debit ORDER BY count DESC LIMIT 100`, params, (err2, byAccount) => {
      if (err2) return res.status(500).json({ error: err2.message });
      const selisih = (totals.total_debit || 0) - (totals.total_kredit || 0);
      res.json({
        totals,
        balanced: Math.abs(selisih) < 0.01,
        selisih,
        by_account_top: byAccount,
      });
    });
  });
});

router.get('/journals/:id', requireRole(JOURNAL_READ_ROLES), (req, res) => {
  db.get("SELECT * FROM journals WHERE id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.json(null);
    // Attach journal_lines
    db.all('SELECT * FROM journal_lines WHERE journal_id = ? ORDER BY line_order', [req.params.id], (err2, lines) => {
      if (err2) return res.json({ ...row, journal_lines: [] });
      res.json({ ...row, journal_lines: lines || [] });
    });
  });
});

// === JOURNAL ROLE GROUPS — SOP Laporan Keuangan ===
// Tgl 1-2: Staff Akuntansi input jurnal; Tgl 2: Senior Akuntansi closing
const JOURNAL_WRITE_ROLES = [
  'staff_keuangan', 'spv_akuntansi', 'spv_anggaran', 'manager_keuangan',
  'admin', 'super_admin',
  'akuntan', // legacy alias
];

// Helper: validate a journal/voucher payload's balance + COA + period-lock + numeric inputs.
// `opts.skipPeriodLock` allows callers (e.g. seed/bulk) to bypass.
async function validateJournalPayload(body, { skipPeriodLock = false, allowZero = false } = {}) {
  if (!body) return 'Body kosong';

  // Required fields
  const reqErr = validateRequired(['tanggal', 'akun_debit', 'akun_kredit'], body);
  if (reqErr) return reqErr;

  // Date format
  const period = dateToPeriod(body.tanggal);
  if (!period) return 'Format tanggal tidak valid (harus YYYY-MM-DD)';

  // Numeric input validation
  const debit = Number(body.debit !== undefined ? body.debit : body.kredit);
  const kredit = Number(body.kredit !== undefined ? body.kredit : body.debit);
  if (!Number.isFinite(debit) || !Number.isFinite(kredit)) {
    return 'Nominal debit/kredit harus berupa angka';
  }
  if (debit < 0 || kredit < 0) {
    return 'Nominal tidak boleh negatif';
  }
  if (!allowZero && debit === 0 && kredit === 0) {
    return 'Nominal harus lebih dari 0';
  }

  // Balance check (single-line: debit must equal kredit; multi-line: sum lines)
  if (Array.isArray(body.lines) && body.lines.length > 0) {
    let dSum = 0, kSum = 0;
    for (const ln of body.lines) {
      const d = Number(ln.debit) || 0;
      const k = Number(ln.kredit) || 0;
      if (d < 0 || k < 0) return 'Nominal pada baris jurnal tidak boleh negatif';
      dSum += d;
      kSum += k;
    }
    if (Math.abs(dSum - kSum) > 0.01) {
      return `Jurnal tidak seimbang: total debit ${dSum} ≠ total kredit ${kSum} (selisih ${dSum - kSum})`;
    }
  } else if (Math.abs(debit - kredit) > 0.01) {
    return `Jurnal tidak seimbang: debit ${debit} ≠ kredit ${kredit}`;
  }

  // COA existence (skip for legacy free-text accounts that contain ' - ' / ' > ')
  // Real codes are short; we only enforce existence if account looks like a code (no space after first 5 chars).
  // To stay strict per TC-8-07, require COA existence unless the value contains ' - ' or ' > ' (legacy display strings)
  const looksLegacy = (s) => /[>]/.test(s) || /\s-\s/.test(s);
  for (const acctField of ['akun_debit', 'akun_kredit']) {
    const v = String(body[acctField] || '').trim();
    if (!v) continue;
    if (looksLegacy(v)) continue; // grandfather in legacy seed format
    const exists = await coaCodeExists(v);
    if (!exists) {
      return `Kode akun "${v}" tidak ditemukan di COA`;
    }
  }

  // Period lock check
  if (!skipPeriodLock) {
    const locked = await isPeriodLocked(period);
    if (locked) {
      return `Periode ${period} sudah dikunci, tidak bisa input/ubah jurnal`;
    }
  }

  return null;
}

// Sync the normalized journal_lines table from a journal's `lines` JSON array.
// Only rewrites lines when a `lines` array is provided (multi-line form entries).
// Legacy 2-account journals (no lines) are left without journal_lines rows; the
// UI synthesizes those on the fly.
function syncJournalLines(journalId, body, cb) {
  let lines = body.lines;
  if (typeof lines === 'string') {
    try { lines = JSON.parse(lines); } catch { lines = null; }
  }
  db.run('DELETE FROM journal_lines WHERE journal_id = ?', [journalId], () => {
    if (!Array.isArray(lines) || lines.length === 0) return cb && cb();
    const stmt = db.prepare(`INSERT INTO journal_lines
      (journal_id, line_order, tanggal, bukti, akun_code, akun_name, sub_akun, debit, kredit, keterangan)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    lines.forEach((l, i) => {
      stmt.run([
        journalId, i, body.tanggal || '', body.bukti || '',
        l.akun_code || '', l.akun_name || '', l.sub_akun || '',
        Number(l.debit) || 0, Number(l.kredit) || 0,
        l.keterangan != null ? l.keterangan : (body.keterangan || ''),
      ]);
    });
    stmt.finalize(() => cb && cb());
  });
}

router.post('/journals', requireRole(JOURNAL_WRITE_ROLES), async (req, res) => {
  // Backward compat: if body has only debit OR only kredit, mirror them.
  if (req.body && req.body.debit !== undefined && req.body.kredit === undefined) {
    req.body.kredit = req.body.debit;
  }
  if (req.body && req.body.kredit !== undefined && req.body.debit === undefined) {
    req.body.debit = req.body.kredit;
  }

  // Skip period lock when this looks like a seed/bulk call (no role in production flow).
  const skipLock = req.headers['x-bulk-seed'] === '1';
  let validationError;
  try {
    validationError = await validateJournalPayload(req.body, { skipPeriodLock: skipLock });
  } catch (e) {
    return res.status(500).json({ error: e.message, code: 'VALIDATION_ERROR' });
  }
  if (validationError) {
    return res.status(400).json({ error: validationError, code: 'VALIDATION_FAILED' });
  }

  const { id, tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti, kode_anggaran, lines, tipe_transaksi } = req.body;
  let journalId = id;
  if (!id) {
    const nextNum = await counters.next('nextJournal');
    journalId = `JRN-2026-${String(nextNum).padStart(3, '0')}`;
  }
  const debitVal = debit !== undefined ? Number(debit) : (kredit !== undefined ? Number(kredit) : 0);
  const kreditVal = kredit !== undefined ? Number(kredit) : (debit !== undefined ? Number(debit) : 0);
  const linesJson = lines == null ? null : (typeof lines === 'string' ? lines : JSON.stringify(lines));
  db.run(`
    INSERT OR REPLACE INTO journals (id, tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti, kode_anggaran, lines, tipe_transaksi, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
   `, [journalId, tanggal, keterangan || '', debitVal, kreditVal, status || 'pending', akun_debit, akun_kredit, bukti || '', kode_anggaran || null, linesJson, tipe_transaksi || 'transfer'], function(err) {
     if (err) {
       const m = mapSqliteError(err, 'penyimpanan jurnal');
       return res.status(m.status).json(m.body);
     }
     const created = { id: journalId, ...req.body };
     logAudit({ entity: 'journal', entityId: journalId, action: 'CREATE', actorRole: getRole(req), after: created });
     syncJournalLines(journalId, { ...req.body, tanggal }, () => res.status(201).json(created));
   });
 });

router.post('/journals/bulk', (req, res) => {
  const journals = req.body.journals;
  
  if (!Array.isArray(journals)) {
    return res.status(400).json({ error: 'Expected an array of journals' });
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO journals (id, tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti, kode_anggaran, lines, tipe_transaksi, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    
    Promise.all(journals.map(j => {
      return new Promise((resolve, reject) => {
        const debitVal = j.debit !== undefined ? j.debit : (j.kredit !== undefined ? j.kredit : 0);
        const kreditVal = j.kredit !== undefined ? j.kredit : (j.debit !== undefined ? j.debit : 0);
        // Never store NULL text fields: a NULL keterangan/tanggal from a template
        // upload crashes list filters in the UI (e.g. keterangan.toLowerCase()).
        stmt.run([j.id, j.tanggal || '', j.keterangan || '', debitVal, kreditVal, j.status || 'pending', j.akun_debit || '', j.akun_kredit || '', j.bukti || '', j.kode_anggaran || null, j.lines || null, j.tipe_transaksi || 'transfer'], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }))
    .then(() => {
      stmt.finalize();
      db.run("COMMIT", () => {
        // Sync journal_lines for each journal that has lines data
        let pending = journals.length;
        const finish = () => { pending--; if (pending <= 0) res.json({ success: true, count: journals.length }); };
        journals.forEach(j => {
          if (j.lines) {
            const linesData = typeof j.lines === 'string' ? (() => { try { return JSON.parse(j.lines) } catch { return null } })() : j.lines;
            if (Array.isArray(linesData) && linesData.length > 0) {
              syncJournalLines(j.id, { ...j, lines: linesData }, finish);
            } else { finish(); }
          } else { finish(); }
        });
      });
    })
    .catch(err => {
      stmt.finalize();
      db.run("ROLLBACK", () => {
        res.status(500).json({ error: err.message || "Bulk insert failed" });
      });
    });
  });
});

router.put('/journals/:id', requireRole(JOURNAL_WRITE_ROLES), async (req, res) => {
  // Mirror debit/kredit if one missing
  if (req.body && req.body.debit !== undefined && req.body.kredit === undefined) {
    req.body.kredit = req.body.debit;
  }
  if (req.body && req.body.kredit !== undefined && req.body.debit === undefined) {
    req.body.debit = req.body.kredit;
  }

  // Existence check + capture before-snapshot for audit
  db.get('SELECT * FROM journals WHERE id = ?', [req.params.id], async (selErr, before) => {
    if (selErr) {
      const m = mapSqliteError(selErr, 'pencarian jurnal');
      return res.status(m.status).json(m.body);
    }
    if (!before) {
      return res.status(404).json({ error: 'Jurnal tidak ditemukan', code: 'NOT_FOUND' });
    }

    // TC-6-06 / TC-6-09: cannot edit POSTED voucher/journal nor a locked period
    if (before.status === 'posted') {
      return res.status(409).json({
        error: 'Voucher/jurnal sudah disetujui (POSTED), tidak bisa diedit',
        code: 'ALREADY_POSTED',
      });
    }
    const beforePeriod = dateToPeriod(before.tanggal);
    if (beforePeriod) {
      const lockedBefore = await isPeriodLocked(beforePeriod);
      if (lockedBefore) {
        return res.status(409).json({
          error: `Periode ${beforePeriod} sudah dikunci, tidak bisa diubah`,
          code: 'PERIOD_LOCKED',
        });
      }
    }

    let validationError;
    try {
      validationError = await validateJournalPayload({ ...before, ...req.body }, {});
    } catch (e) {
      return res.status(500).json({ error: e.message, code: 'VALIDATION_ERROR' });
    }
    if (validationError) {
      return res.status(400).json({ error: validationError, code: 'VALIDATION_FAILED' });
    }

    const { tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti, lines, tipe_transaksi } = req.body;
    const debitVal = debit !== undefined ? Number(debit) : Number(before.debit);
    const kreditVal = kredit !== undefined ? Number(kredit) : Number(before.kredit);
    const linesJson = lines == null ? before.lines : (typeof lines === 'string' ? lines : JSON.stringify(lines));
    db.run(`
      UPDATE journals SET tanggal = ?, keterangan = ?, debit = ?, kredit = ?, status = ?,
        akun_debit = ?, akun_kredit = ?, bukti = ?, lines = ?, tipe_transaksi = ?, updated_at = datetime('now') WHERE id = ?
    `, [
      tanggal || before.tanggal,
      keterangan !== undefined ? keterangan : before.keterangan,
      debitVal, kreditVal,
      status || before.status,
      akun_debit || before.akun_debit,
      akun_kredit || before.akun_kredit,
      bukti !== undefined ? bukti : before.bukti,
      linesJson,
      tipe_transaksi || before.tipe_transaksi || 'transfer',
      req.params.id,
    ], function(err) {
      if (err) {
        const m = mapSqliteError(err, 'perubahan jurnal');
        return res.status(m.status).json(m.body);
      }
      const after = { id: req.params.id, ...req.body };
      logAudit({ entity: 'journal', entityId: req.params.id, action: 'UPDATE', actorRole: getRole(req), before, after });
      if (req.body.lines !== undefined) {
        syncJournalLines(req.params.id, {
          tanggal: tanggal || before.tanggal,
          bukti: bukti !== undefined ? bukti : before.bukti,
          keterangan: keterangan !== undefined ? keterangan : before.keterangan,
          lines: req.body.lines,
        }, () => res.json(after));
      } else {
        res.json(after);
      }
    });
  });
});

router.delete('/journals/:id', requireRole(JOURNAL_WRITE_ROLES), (req, res) => {
  db.get('SELECT * FROM journals WHERE id = ?', [req.params.id], async (selErr, before) => {
    if (selErr) {
      const m = mapSqliteError(selErr, 'pencarian jurnal');
      return res.status(m.status).json(m.body);
    }
    if (!before) {
      return res.status(404).json({ error: 'Jurnal tidak ditemukan', code: 'NOT_FOUND' });
    }
    const period = dateToPeriod(before.tanggal);
    if (period && (await isPeriodLocked(period))) {
      return res.status(409).json({
        error: `Periode ${period} sudah dikunci, tidak bisa hapus jurnal`,
        code: 'PERIOD_LOCKED',
      });
    }
    db.run('DELETE FROM journals WHERE id = ?', [req.params.id], function(err) {
      if (err) {
        const m = mapSqliteError(err, 'penghapusan jurnal');
        return res.status(m.status).json(m.body);
      }
      logAudit({ entity: 'journal', entityId: req.params.id, action: 'DELETE', actorRole: getRole(req), before });
      res.json({ deleted: true, id: req.params.id });
    });
  });
});

router.delete('/journals', requireRole(JOURNAL_WRITE_ROLES), async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'Month parameter required (YYYY-MM)' });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) {
    return res.status(400).json({ error: 'Format month tidak valid (YYYY-MM)', code: 'VALIDATION_FAILED' });
  }
  if (await isPeriodLocked(month)) {
    return res.status(409).json({
      error: `Periode ${month} sudah dikunci, tidak bisa hapus jurnal`,
      code: 'PERIOD_LOCKED',
    });
  }
  db.run("DELETE FROM journals WHERE substr(tanggal, 1, 7) = ?", [month], function(err) {
    if (err) {
      const m = mapSqliteError(err, 'penghapusan jurnal bulk');
      return res.status(m.status).json(m.body);
    }
    logAudit({ entity: 'journal', entityId: month, action: 'DELETE_MONTH', actorRole: getRole(req), before: { deleted: this.changes } });
    res.json({ deleted: this.changes });
  });
});

// === JOURNAL APPROVE — SOP Pembayaran B&J: Manajer → Direktur → Dirut ===
// Semua manajer ke atas bisa approve; threshold cek di frontend
const JOURNAL_APPROVE_ROLES = [
  // Manager level (approve < 1 jt)
  'manager_bisnis', 'manager_operasional', 'kepala_pasar', 'manager_keuangan', 'manager_umum',
  // Direktur level (approve > 1 jt)
  'direktur_bisnis_operasional', 'direktur_umum_keuangan', 'direktur_utama',
  // Senior Accounting (closing jurnal per SOP Laporan Keuangan)
  'spv_akuntansi',
  // System
  'admin', 'super_admin',
  // Legacy
  'akuntan', 'manajer_keuangan', 'direktur',
];
router.post('/journals/approve/:id', requireRole(JOURNAL_APPROVE_ROLES), (req, res) => {
  db.run("UPDATE journals SET status = 'posted', updated_at = datetime('now') WHERE id = ?", [req.params.id], function(err) {
    if (err) {
      const m = mapSqliteError(err, 'persetujuan jurnal');
      return res.status(m.status).json(m.body);
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Jurnal tidak ditemukan', code: 'NOT_FOUND' });
    }
    logAudit({ entity: 'journal', entityId: req.params.id, action: 'APPROVE', actorRole: getRole(req) });
    res.json({ id: req.params.id, status: 'posted' });
  });
});

router.post('/journals/unapprove/:id', requireRole(JOURNAL_APPROVE_ROLES), (req, res) => {
  db.run("UPDATE journals SET status = 'pending', updated_at = datetime('now') WHERE id = ?", [req.params.id], function(err) {
    if (err) {
      const m = mapSqliteError(err, 'pembatalan persetujuan');
      return res.status(m.status).json(m.body);
    }
    logAudit({ entity: 'journal', entityId: req.params.id, action: 'UNAPPROVE', actorRole: getRole(req) });
    res.json({ id: req.params.id, status: 'pending' });
  });
});

// === COA ===
// READ allowed for any authenticated role (akuntan, auditor, manajer, direktur, admin, kasir).
const COA_READ_ROLES = ALL_ROLES;
const COA_WRITE_ROLES = [
  'spv_akuntansi', 'manager_keuangan',
  'admin', 'super_admin',
  'akuntan', // legacy
];

router.get('/coa', requireRole(COA_READ_ROLES), (req, res) => {
  db.all("SELECT * FROM coa ORDER BY code", (err, rows) => {
    if (err) {
      const m = mapSqliteError(err, 'pembacaan COA');
      return res.status(m.status).json(m.body);
    }
    res.json(rows);
  });
});

router.post('/coa', requireRole(COA_WRITE_ROLES), (req, res) => {
  const validationError = validateCoaPayload(req.body, { requireCode: true });
  if (validationError) {
    return res.status(400).json({ error: validationError, code: 'VALIDATION_FAILED' });
  }
  const { code, name, type, category, parent_code, saldo_awal, kode_sortir, kode_departemen } = req.body;
  const trimmedCode = String(code).trim();
  db.run(`
    INSERT INTO coa (code, name, type, category, parent_code, saldo_awal, kode_sortir, kode_departemen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [trimmedCode, String(name).trim(), type || 'posting', category, parent_code, saldo_awal || 0, kode_sortir, kode_departemen], function(err) {
    if (err) {
      const m = mapSqliteError(err, 'penambahan akun');
      return res.status(m.status).json(m.body);
    }
    const created = { id: this.lastID, ...req.body, code: trimmedCode };
    logAudit({ entity: 'coa', entityId: trimmedCode, action: 'CREATE', actorRole: getRole(req), after: created });
    res.status(201).json(created);
  });
});

router.put('/coa/:code', requireRole(COA_WRITE_ROLES), (req, res) => {
  const targetCode = req.params.code;
  const validationError = validateCoaPayload(req.body, { requireCode: false });
  if (validationError) {
    return res.status(400).json({ error: validationError, code: 'VALIDATION_FAILED' });
  }
  db.get("SELECT * FROM coa WHERE code = ?", [targetCode], (selErr, before) => {
    if (selErr) {
      const m = mapSqliteError(selErr, 'pencarian akun');
      return res.status(m.status).json(m.body);
    }
    if (!before) {
      return res.status(404).json({ error: 'Akun tidak ditemukan', code: 'NOT_FOUND' });
    }
    const { name, type, category, parent_code, saldo_awal, kode_sortir, kode_departemen } = req.body;
    db.run(`
      UPDATE coa SET name = ?, type = ?, category = ?, parent_code = ?, saldo_awal = ?, kode_sortir = ?, kode_departemen = ?
      WHERE code = ?
    `, [name, type, category, parent_code, saldo_awal, kode_sortir, kode_departemen, targetCode], function(err) {
      if (err) {
        const m = mapSqliteError(err, 'perubahan akun');
        return res.status(m.status).json(m.body);
      }
      const after = { code: targetCode, ...req.body };
      logAudit({ entity: 'coa', entityId: targetCode, action: 'UPDATE', actorRole: getRole(req), before, after });
      res.json(after);
    });
  });
});

router.delete('/coa/:code', requireRole(COA_WRITE_ROLES), (req, res) => {
  const targetCode = req.params.code;

  // Step 1: existence check.
  db.get("SELECT * FROM coa WHERE code = ?", [targetCode], (selErr, row) => {
    if (selErr) {
      const m = mapSqliteError(selErr, 'pencarian akun');
      return res.status(m.status).json(m.body);
    }
    if (!row) {
      return res.status(404).json({ error: 'Akun tidak ditemukan', code: 'NOT_FOUND' });
    }

    // Step 2: referential integrity — block delete if account is in use.
    db.get(
      `SELECT
         (SELECT COUNT(*) FROM journals WHERE akun_debit = ? OR akun_kredit = ?) AS journal_count,
         (SELECT COUNT(*) FROM coa WHERE parent_code = ?) AS child_count`,
      [targetCode, targetCode, targetCode],
      (refErr, counts) => {
        if (refErr) {
          const m = mapSqliteError(refErr, 'pengecekan referensi');
          return res.status(m.status).json(m.body);
        }
        const jCount = counts ? counts.journal_count : 0;
        const cCount = counts ? counts.child_count : 0;
        if (jCount > 0) {
          return res.status(409).json({
            error: `Akun memiliki riwayat transaksi (${jCount} jurnal terkait), tidak bisa dihapus`,
            code: 'REF_INTEGRITY_JOURNAL',
            journalCount: jCount,
          });
        }
        if (cCount > 0) {
          return res.status(409).json({
            error: `Akun masih memiliki ${cCount} sub-akun (parent), tidak bisa dihapus`,
            code: 'REF_INTEGRITY_CHILDREN',
            childCount: cCount,
          });
        }

        // Step 3: safe to delete.
        db.run("DELETE FROM coa WHERE code = ?", [targetCode], function(err) {
          if (err) {
            const m = mapSqliteError(err, 'penghapusan akun');
            return res.status(m.status).json(m.body);
          }
          if (this.changes === 0) {
            return res.status(404).json({ error: 'Akun tidak ditemukan', code: 'NOT_FOUND' });
          }
          logAudit({ entity: 'coa', entityId: targetCode, action: 'DELETE', actorRole: getRole(req), before: row });
          res.json({ deleted: true, code: targetCode });
        });
      }
    );
  });
});

// === ASSETS ===
router.get('/assets', (req, res) => {
  db.all("SELECT * FROM assets ORDER BY kategori, nama", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/assets', async (req, res) => {
  const { kode, nama, detail, kategori, tgl_perolehan, nilai_perolehan, penyusutan_per_tahun,
          penyusutan_per_bulan, beban_penyusutan_2025, nilai_penyusutan, nilai_buku,
          beban_penyusutan_maret_2026, akum_penyusutan_maret_2026, nilai_buku_maret_2026,
          umur_manfaat, keterangan } = req.body;
  let assetCode = kode;
  if (!kode) {
    const nextNum = await counters.next('nextAsset');
    assetCode = `AT-${String(nextNum).padStart(3, '0')}`;
  }
  db.run(`
    INSERT OR REPLACE INTO assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [assetCode, nama, detail, kategori, tgl_perolehan, nilai_perolehan, penyusutan_per_tahun,
      penyusutan_per_bulan, beban_penyusutan_2025, nilai_penyusutan, nilai_buku,
      beban_penyusutan_maret_2026, akum_penyusutan_maret_2026, nilai_buku_maret_2026,
      umur_manfaat, keterangan], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ kode: assetCode, ...req.body });
  });
});

router.put('/assets/:kode', (req, res) => {
  const { nama, detail, kategori, tgl_perolehan, nilai_perolehan, penyusutan_per_tahun,
          penyusutan_per_bulan, beban_penyusutan_2025, nilai_penyusutan, nilai_buku,
          beban_penyusutan_maret_2026, akum_penyusutan_maret_2026, nilai_buku_maret_2026,
          umur_manfaat, keterangan } = req.body;
  db.run(`
    UPDATE assets SET nama = ?, detail = ?, kategori = ?, tgl_perolehan = ?, nilai_perolehan = ?, 
    penyusutan_per_tahun = ?, penyusutan_per_bulan = ?, beban_penyusutan_2025 = ?, nilai_penyusutan = ?, 
    nilai_buku = ?, beban_penyusutan_maret_2026 = ?, akum_penyusutan_maret_2026 = ?, nilai_buku_maret_2026 = ?, 
    umur_manfaat = ?, keterangan = ? WHERE kode = ?
  `, [nama, detail, kategori, tgl_perolehan, nilai_perolehan, penyusutan_per_tahun,
      penyusutan_per_bulan, beban_penyusutan_2025, nilai_penyusutan, nilai_buku,
      beban_penyusutan_maret_2026, akum_penyusutan_maret_2026, nilai_buku_maret_2026,
      umur_manfaat, keterangan, req.params.kode], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ kode: req.params.kode, ...req.body });
  });
});

router.delete('/assets/:kode', (req, res) => {
  db.run("DELETE FROM assets WHERE kode = ?", [req.params.kode], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === INVENTORY ===
router.get('/inventory', (req, res) => {
  db.all("SELECT * FROM inventory", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/inventory', (req, res) => {
  const { kode, nama, satuan, stok_awal, masuk, keluar, stok_akhir, harga_satuan, nilai_total } = req.body;
  // Use named columns to be resilient to schema drift (created_at/updated_at have defaults).
  db.run(
    `INSERT OR REPLACE INTO inventory (kode, nama, satuan, stok_awal, masuk, keluar, stok_akhir, harga_satuan, nilai_total, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [kode, nama, satuan, stok_awal, masuk, keluar, stok_akhir, harga_satuan, nilai_total],
    function (err) {
      if (err) {
        const m = mapSqliteErrorShared(err, 'penambahan inventory');
        return res.status(m.status).json(m.body);
      }
      logAudit({ entity: 'inventory', entityId: kode, action: 'CREATE', actorRole: getRole(req), after: req.body });
      res.json({ kode, ...req.body });
    }
  );
});

router.delete('/inventory/:kode', (req, res) => {
  db.run("DELETE FROM inventory WHERE kode = ?", [req.params.kode], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === BBM ===
router.get('/bbm', (req, res) => {
  db.all("SELECT * FROM bbm ORDER BY tanggal DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/bbm', async (req, res) => {
  const { id, tanggal, tipe, keterangan, volume, harga, total } = req.body;
  let bbmId = id;
  if (!id) {
    const nextNum = await counters.next('nextBBM');
    bbmId = `BBM-${String(nextNum).padStart(3, '0')}`;
  }
  db.run(`
    INSERT OR REPLACE INTO bbm (id, tanggal, tipe, keterangan, volume, harga, total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [bbmId, tanggal, tipe, keterangan, volume, harga, total], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: bbmId, ...req.body });
  });
});

router.delete('/bbm/:id', (req, res) => {
  db.run("DELETE FROM bbm WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === PIUTANG ===
router.get('/piutang', (req, res) => {
  db.all("SELECT * FROM piutang ORDER BY tanggal DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/piutang', async (req, res) => {
  const { id, no_faktur, tanggal, jatuh_tempo, pelanggan, keterangan, jumlah, terbayar, sisa, status } = req.body;
  let piId = id;
  if (!id) {
    const nextNum = await counters.next('nextPiutang');
    piId = `PI-${String(nextNum).padStart(3, '0')}`;
  }
  db.run(`
    INSERT OR REPLACE INTO piutang VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [piId, no_faktur, tanggal, jatuh_tempo, pelanggan, keterangan, jumlah, terbayar, sisa, status], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: piId, ...req.body });
  });
});

router.put('/piutang/:id', (req, res) => {
  // Partial-update friendly: missing fields fall back to current row values.
  db.get('SELECT * FROM piutang WHERE id = ?', [req.params.id], (selErr, before) => {
    if (selErr) return res.status(500).json({ error: selErr.message });
    if (!before) return res.status(404).json({ error: 'piutang tidak ditemukan', code: 'NOT_FOUND' });
    const merged = { ...before, ...req.body };
    db.run(
      `UPDATE piutang SET no_faktur = ?, tanggal = ?, jatuh_tempo = ?, pelanggan = ?,
        keterangan = ?, jumlah = ?, terbayar = ?, sisa = ?, status = ? WHERE id = ?`,
      [merged.no_faktur, merged.tanggal, merged.jatuh_tempo, merged.pelanggan,
       merged.keterangan, merged.jumlah, merged.terbayar, merged.sisa, merged.status, req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logAudit({ entity: 'piutang', entityId: req.params.id, action: 'UPDATE', actorRole: getRole(req), before, after: merged });
        res.json({ id: req.params.id, ...merged });
      }
    );
  });
});

router.delete('/piutang/:id', (req, res) => {
  db.run("DELETE FROM piutang WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === HUTANG ===
router.get('/hutang', (req, res) => {
  db.all("SELECT * FROM hutang ORDER BY tanggal DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/hutang', async (req, res) => {
  const { id, no_faktur, tanggal, jatuh_tempo, supplier, keterangan, jumlah, terbayar, sisa, status } = req.body;
  let huId = id;
  if (!id) {
    const nextNum = await counters.next('nextHutang');
    huId = `HU-${String(nextNum).padStart(3, '0')}`;
  }
  db.run(`
    INSERT OR REPLACE INTO hutang VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [huId, no_faktur, tanggal, jatuh_tempo, supplier, keterangan, jumlah, terbayar, sisa, status], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: huId, ...req.body });
  });
});

router.put('/hutang/:id', (req, res) => {
  db.get('SELECT * FROM hutang WHERE id = ?', [req.params.id], (selErr, before) => {
    if (selErr) return res.status(500).json({ error: selErr.message });
    if (!before) return res.status(404).json({ error: 'hutang tidak ditemukan', code: 'NOT_FOUND' });
    const merged = { ...before, ...req.body };
    db.run(
      `UPDATE hutang SET no_faktur = ?, tanggal = ?, jatuh_tempo = ?, supplier = ?,
        keterangan = ?, jumlah = ?, terbayar = ?, sisa = ?, status = ? WHERE id = ?`,
      [merged.no_faktur, merged.tanggal, merged.jatuh_tempo, merged.supplier,
       merged.keterangan, merged.jumlah, merged.terbayar, merged.sisa, merged.status, req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logAudit({ entity: 'hutang', entityId: req.params.id, action: 'UPDATE', actorRole: getRole(req), before, after: merged });
        res.json({ id: req.params.id, ...merged });
      }
    );
  });
});

router.delete('/hutang/:id', (req, res) => {
  db.run("DELETE FROM hutang WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === ANGGARAN ===
router.get('/anggaran', (req, res) => {
  db.all("SELECT * FROM anggaran ORDER BY kategori, id", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/anggaran', (req, res) => {
  const { kode, nama, kategori, bulan, anggaran_awal, target_bulan, realisasi, persentase } = req.body;
  db.run(
    `INSERT OR REPLACE INTO anggaran (kode, nama, kategori, bulan, anggaran_awal, target_bulan, realisasi, persentase)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [kode, nama, kategori || null, bulan || 0, anggaran_awal || 0, target_bulan || 0, realisasi || 0, persentase || 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit({ entity: 'anggaran', entityId: kode, action: 'CREATE', actorRole: getRole(req), after: req.body });
      res.json({ kode, ...req.body });
    }
  );
});

router.delete('/anggaran/:kode', (req, res) => {
  db.run("DELETE FROM anggaran WHERE kode = ?", [req.params.kode], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

router.post('/fix-anggaran', (req, res) => {
  // Only seed if table is completely empty — never overwrite existing per-month data
  db.get('SELECT COUNT(*) as cnt FROM anggaran', (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row.cnt > 0) return res.json({ success: true, count: row.cnt, message: 'Skipped — data already exists' });
    try {
      const sampleData = require('../../src/data/sampleData.json');
      const data = sampleData['anggaran'];
      if (!data || data.length === 0) return res.json({ success: true, count: 0 });
      
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO anggaran (kode, nama, kategori, anggaran_awal, target_bulan, sd_bln_lalu, bulan_ini, realisasi, persentase, is_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      let pending = data.length;
      let hasError = null;
      data.forEach((item, index) => {
        if (!item.kode || item.kode === '') item.kode = `ANG-${item.kategori || 'cat'}-${index}`;
        stmt.run(
          item.kode, item.nama, item.kategori,
          item.anggaran_awal || 0, item.target_bulan || 0, item.sd_bln_lalu || 0,
          item.bulan_ini || 0, item.realisasi || 0, item.persentase || 0, item.is_total || 0,
          (err) => {
            if (err) hasError = err;
            pending--;
            if (pending === 0) {
              stmt.finalize();
              if (hasError) res.status(500).json({ error: hasError.message });
              else res.json({ success: true, count: data.length });
            }
          }
        );
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// === REKONSILIASI ===
router.get('/rekonsiliasi', (req, res) => {
  db.all("SELECT * FROM rekonsiliasi ORDER BY tanggal DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/rekonsiliasi', (req, res) => {
  const { tanggal, keterangan, ref, jumlah, tipe } = req.body;
  db.run(`
    INSERT INTO rekonsiliasi (tanggal, keterangan, ref, jumlah, tipe) VALUES (?, ?, ?, ?, ?)
  `, [tanggal, keterangan, ref, jumlah, tipe || 'buku'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, ...req.body });
  });
});

router.delete('/rekonsiliasi/:id', (req, res) => {
  db.run("DELETE FROM rekonsiliasi WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// === PENGATURAN ===
router.get('/pengaturan', (req, res) => {
  db.all("SELECT * FROM pengaturan", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = {};
    rows.forEach(r => {
      try { settings[r.key] = JSON.parse(r.value); } catch(e) { settings[r.key] = r.value; }
    });
    res.json(settings);
  });
});

router.put('/pengaturan', (req, res) => {
  const stmt = db.prepare("INSERT OR REPLACE INTO pengaturan (key, value) VALUES (?, ?)");
  const entries = Object.entries(req.body);
  let completed = 0;
  let hasError = null;

  if (entries.length === 0) {
    stmt.finalize();
    return res.json({ success: true, updated: [] });
  }

  entries.forEach(([key, value]) => {
    stmt.run(key, JSON.stringify(value), (err) => {
      if (err) hasError = err;
      completed++;
      if (completed === entries.length) {
        stmt.finalize();
        if (hasError) {
          res.status(500).json({ error: hasError.message });
        } else {
          res.json({ success: true, updated: Object.keys(req.body) });
        }
      }
    });
  });
});

// === LOCKED PERIODS ===
router.get('/locked-periods', (req, res) => {
  db.all("SELECT period FROM locked_periods", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.period));
  });
});

router.post('/locked-periods', (req, res) => {
  const { period } = req.body;
  db.run("INSERT OR IGNORE INTO locked_periods (period) VALUES (?)", [period], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ period, locked: true });
  });
});

router.delete('/locked-periods/:period', (req, res) => {
  db.run("DELETE FROM locked_periods WHERE period = ?", [req.params.period], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ unlocked: true });
  });
});

// === RESET DATA ===
router.post('/reset', (req, res) => {
  db.serialize(() => {
    db.run("BEGIN TRANSACTION", (err) => {
      if (err) return res.status(500).json({ error: err.message });

      const tables = [
        'journals', 'coa', 'assets', 'inventory', 'bbm',
        'piutang', 'hutang', 'anggaran', 'rekonsiliasi',
        'pengaturan', 'locked_periods'
      ];

      let completed = 0;
      let hasError = false;

      tables.forEach(table => {
        db.run(`DELETE FROM ${table}`, (err) => {
          if (err) {
            hasError = err;
          }
          completed++;
          if (completed === tables.length) {
            if (hasError) {
              db.run("ROLLBACK", () => {
                res.status(500).json({ error: hasError.message });
              });
            } else {
              db.run("UPDATE counters SET value = 0 WHERE key IN ('nextJournal', 'nextAsset', 'nextBBM', 'nextPiutang', 'nextHutang')", (err2) => {
                if (err2) {
                  db.run("ROLLBACK", () => {
                    res.status(500).json({ error: err2.message });
                  });
                  return;
                }
                db.run("COMMIT", (err3) => {
                  if (err3) return res.status(500).json({ error: err3.message });
                  res.json({ success: true, message: 'All data reset' });
                });
              });
            }
          }
        });
      });
    });
  });
});

// === RESET MONTHLY DATA (across all modules) ===
// Deletes every record tied to a given month (period = 'YYYY-MM'):
// journals + journal_lines, all transactional modules dated in that month,
// and the audited report snapshots (Neraca / Arus Kas / Laba Rugi) for it.
router.post('/reset-month', requireRole(JOURNAL_WRITE_ROLES), async (req, res) => {
  const period = String(req.body && req.body.period ? req.body.period : '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return res.status(400).json({ error: 'Format periode harus YYYY-MM (contoh: 2026-05)', code: 'VALIDATION_FAILED' });
  }

  const run = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (e) { e ? reject(e) : resolve(this.changes || 0); }));

  // Tables keyed by a `tanggal` (YYYY-MM-DD) date column.
  const dateTables = ['bbm', 'piutang', 'hutang', 'giro', 'rekonsiliasi',
    'sales_orders', 'purchase_orders', 'efaktur', 'inventory_transfers', 'stock_opname'];
  // Reference report snapshots keyed by a `period` (YYYY-MM) column.
  const reportTables = ['report_neraca', 'report_arus_kas', 'report_laba_rugi'];

  const deleted = {};
  try {
    await run('BEGIN TRANSACTION');
    // journal_lines first (FK to journals); cover both the line's own date and its parent.
    deleted.journal_lines = await run(
      "DELETE FROM journal_lines WHERE substr(tanggal,1,7)=? OR journal_id IN (SELECT id FROM journals WHERE substr(tanggal,1,7)=?)",
      [period, period]);
    deleted.journals = await run("DELETE FROM journals WHERE substr(tanggal,1,7)=?", [period]);
    for (const t of dateTables) {
      try { deleted[t] = await run(`DELETE FROM ${t} WHERE substr(tanggal,1,7)=?`, [period]); }
      catch (_) { deleted[t] = 0; } // tolerate older DBs lacking a table/column
    }
    for (const t of reportTables) {
      try { deleted[t] = await run(`DELETE FROM ${t} WHERE period=?`, [period]); }
      catch (_) { deleted[t] = 0; }
    }
    await run('COMMIT');
  } catch (e) {
    await run('ROLLBACK').catch(() => {});
    const m = mapSqliteError(e, 'reset data bulanan');
    return res.status(m.status || 500).json(m.body || { error: e.message });
  }

  const total = Object.values(deleted).reduce((s, n) => s + n, 0);
  try { logAudit({ entity: 'period', entityId: period, action: 'RESET_MONTH', actorRole: getRole(req), after: { deleted, total } }); } catch (_) {}
  res.json({ success: true, period, total, deleted });
});

// Load LRA category rows (Penerimaan / Beban Umum / Investasi — same layout) into
// the anggaran table for a period, so the LRA view renders the official audited
// figures. `kategori` is the LRA category key (penerimaan/bebanUmum/bebanInvestasi).
async function loadLraToAnggaran(run, kategori, period, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const bulan = parseInt(period.split('-')[1], 10);
  await run("DELETE FROM anggaran WHERE kategori=? AND bulan=?", [kategori, bulan]);
  let n = 0;
  for (const r of rows) {
    const outline = String(r.outline || '').trim();
    if (!/^\d+(\.\d+)*$/.test(outline)) continue;
    await run(
      `INSERT INTO anggaran (kode,nama,nama_excel,kategori,bulan,anggaran_awal,target_bulan,sd_bln_lalu,bulan_ini,realisasi,persentase,is_total)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`,
      [`ANG-${kategori}-${outline}`, outline, (r.nama != null ? String(r.nama) : ''), kategori, bulan,
       Number(r.anggaran) || 0, Number(r.target) || 0, Number(r.sdBlnLalu) || 0,
       Number(r.bulanIni) || 0, Number(r.realisasi) || 0, Number(r.persen) || 0]);
    n++;
  }
  return n;
}

// === AUDITED REPORT SNAPSHOT ===
// Which periods are audited (render the frozen Excel figures). We key this off
// report_laba_rugi presence: audited months carry a full snapshot incl. Laba
// Rugi, whereas projection-only months (e.g. future CF placeholders) do not.
router.get('/reports/audited-periods', (req, res) => {
  db.all("SELECT DISTINCT period FROM report_laba_rugi ORDER BY period", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(r => r.period));
  });
});

// Load the official audited report snapshot (Neraca + Arus Kas + Laba Rugi, as
// configured) for a period straight from the bundled lampiran Excel, and demote
// that month's user-uploaded (JV-) journals to baseline (XL-) so the snapshot is
// not double-counted by the delta overlay. This is the one-click equivalent of
// the manual reset+reupload reconciliation.
router.post('/reports/load-audited', requireRole(JOURNAL_WRITE_ROLES), async (req, res) => {
  const period = String(req.body && req.body.period ? req.body.period : '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return res.status(400).json({ error: 'Format periode harus YYYY-MM (contoh: 2026-05)', code: 'VALIDATION_FAILED' });
  }
  const src = (reportImport.SOURCES || []).find(s => s.period === period);
  if (!src) {
    return res.status(404).json({ error: `Tidak ada sumber laporan audited terkonfigurasi untuk periode ${period}`, code: 'NOT_FOUND' });
  }

  let wb;
  try {
    // MEMORY-LEAN PARSE: read ONLY the sheets this endpoint consumes (Neraca,
    // Arus Kas, Laba Rugi, and each LRA category sheet) with dense storage, so we
    // never parse the whole multi-sheet "(2)" workbook into memory on the
    // 512 MB VM. The workbook is freed right after parsing (see below).
    const neededSheets = [
      src.neracaSheet, src.cfSheet, src.lrSheet,
      ...(Array.isArray(src.lraSheets)
        ? src.lraSheets.map(s => s.sheet)
        : (src.penerimaanSheet ? [src.penerimaanSheet] : [])),
    ].filter(Boolean);
    wb = XLSX.readFile(path.join(src.dir || reportImport.FILES_DIR, src.file), { sheets: neededSheets, dense: true });
  } catch (e) {
    return res.status(500).json({ error: `Gagal membaca file lampiran: ${e.message}` });
  }

  const run = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (e) { e ? reject(e) : resolve(this.changes || 0); }));

  const baselinePrefix = `XL-${period}-`;
  const loaded = { neraca: 0, arus_kas: 0, laba_rugi: 0, penerimaan: 0, journals_rebased: 0 };
  try {
    await run('BEGIN TRANSACTION');
    await run('PRAGMA defer_foreign_keys = ON'); // allow id rebase without FK errors mid-transaction

    // Demote this month's delta journals to baseline so they don't overlay the snapshot.
    loaded.journals_rebased = await run(
      "UPDATE journal_lines SET journal_id = ? || substr(journal_id, 9) WHERE journal_id LIKE 'JV-2026-%' AND substr(tanggal,1,7)=?", [baselinePrefix, period]);
    await run("UPDATE journals SET id = ? || substr(id, 9) WHERE id LIKE 'JV-2026-%' AND substr(tanggal,1,7)=?", [baselinePrefix, period]);

    // NERACA
    const nWs = wb.Sheets[src.neracaSheet];
    if (nWs) {
      await run("DELETE FROM report_neraca WHERE period=?", [period]);
      const rows = reportImport.parseNeraca(nWs);
      for (const r of rows) {
        await run('INSERT INTO report_neraca (period, sort_order, label, value, depth) VALUES (?, ?, ?, ?, ?)', [period, r.order, r.label, r.value, r.depth]);
      }
      loaded.neraca = rows.length;
    }
    // ARUS KAS
    const cWs = src.cfSheet && wb.Sheets[src.cfSheet];
    if (cWs) {
      await run("DELETE FROM report_arus_kas WHERE period=?", [period]);
      const rows = reportImport.parseArusKas(cWs, src.cfValCol || 2);
      for (const r of rows) {
        await run('INSERT INTO report_arus_kas (period, sort_order, label, value, is_section) VALUES (?, ?, ?, ?, ?)', [period, r.order, r.label, r.value, r.isSection ? 1 : 0]);
      }
      loaded.arus_kas = rows.length;
    }
    // LABA RUGI (only if a sheet is configured for this period)
    const lWs = src.lrSheet && wb.Sheets[src.lrSheet];
    if (lWs) {
      await run("DELETE FROM report_laba_rugi WHERE period=?", [period]);
      const rows = reportImport.parseLabaRugi(lWs, src.lrValCol || 9);
      for (const r of rows) {
        await run('INSERT INTO report_laba_rugi (period, sort_order, label, value, depth) VALUES (?, ?, ?, ?, ?)', [period, r.order, r.label, r.value, r.depth]);
      }
      loaded.laba_rugi = rows.length;
    }

    // PENERIMAAN / BEBAN UMUM / INVESTASI (LRA realization) → anggaran table
    const lraSheets = Array.isArray(src.lraSheets) ? src.lraSheets
      : (src.penerimaanSheet ? [{ sheet: src.penerimaanSheet, kategori: 'penerimaan' }] : []);
    loaded.lra = {};
    for (const ls of lraSheets) {
      const lWs = wb.Sheets[ls.sheet];
      if (!lWs) continue;
      // Pick the parser by category layout:
      //   bebanOperasional → 3-level parseBebanOperasional
      //   bebanInvestasi   → 3-level parseInvestasi (detail rincian rows)
      //   else (penerimaan / bebanUmum) → flat parsePenerimaan
      const parse = ls.kategori === 'bebanOperasional' ? reportImport.parseBebanOperasional
        : ls.kategori === 'bebanInvestasi' ? reportImport.parseInvestasi
        : reportImport.parsePenerimaan;
      loaded.lra[ls.kategori] = await loadLraToAnggaran(run, ls.kategori, period, parse(lWs));
    }

    await run('COMMIT');
  } catch (e) {
    await run('ROLLBACK').catch(() => {});
    const m = mapSqliteError(e, 'muat snapshot audited');
    return res.status(m.status || 500).json(m.body || { error: e.message });
  } finally {
    // Free the parsed workbook ASAP — identical data is now in the DB. Helps the
    // 512 MB VM reclaim the (2) workbook's cells before the next request.
    wb = null;
    if (typeof global.gc === 'function') { try { global.gc(); } catch (_) { /* noop */ } }
  }

  try { logAudit({ entity: 'period', entityId: period, action: 'LOAD_AUDITED_SNAPSHOT', actorRole: getRole(req), after: loaded }); } catch (_) {}
  res.json({ success: true, period, loaded });
});

// Save an audited report snapshot supplied by the client (parsed from an uploaded
// lampiran Excel). Lets brand-new months be loaded without a redeploy. Body:
// { period, neraca:[{order,label,value,depth}], arusKas:[{order,label,value,isSection}], labaRugi:[{order,label,value,depth}] }
router.post('/reports/snapshot', requireRole(JOURNAL_WRITE_ROLES), async (req, res) => {
  const body = req.body || {};
  const period = String(body.period || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return res.status(400).json({ error: 'Format periode harus YYYY-MM (contoh: 2026-05)', code: 'VALIDATION_FAILED' });
  }
  const neraca = Array.isArray(body.neraca) ? body.neraca : [];
  const arusKas = Array.isArray(body.arusKas) ? body.arusKas : [];
  const labaRugi = Array.isArray(body.labaRugi) ? body.labaRugi : [];
  const penerimaan = Array.isArray(body.penerimaan) ? body.penerimaan : [];
  const lra = (body.lra && typeof body.lra === 'object') ? body.lra : (penerimaan.length ? { penerimaan } : {});
  const lraKeys = Object.keys(lra).filter(k => Array.isArray(lra[k]) && lra[k].length);
  const uploadedJournals = Array.isArray(body.journals) ? body.journals : [];
  if (neraca.length === 0 && arusKas.length === 0 && labaRugi.length === 0 && lraKeys.length === 0 && uploadedJournals.length === 0) {
    return res.status(400).json({ error: 'Tidak ada data laporan yang dikirim', code: 'VALIDATION_FAILED' });
  }

  const run = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (e) { e ? reject(e) : resolve(this.changes || 0); }));
  const baselinePrefix = `XL-${period}-`; // e.g. XL-2026-07-
  const loaded = { neraca: 0, arus_kas: 0, laba_rugi: 0, penerimaan: 0, journals_rebased: 0, journals: 0 };
  try {
    await run('BEGIN TRANSACTION');
    await run('PRAGMA defer_foreign_keys = ON'); // allow id rebase without FK errors mid-transaction
    if (uploadedJournals.length) {
      // The uploaded lampiran carries the period's complete journal set, so it
      // becomes the single source of truth: replace every journal for the month
      // with the uploaded baseline entries (XL- ids → counted in the ledger but
      // not double-counted by the report delta overlay).
      await run("DELETE FROM journal_lines WHERE substr(tanggal,1,7)=?", [period]);
      await run("DELETE FROM journals WHERE substr(tanggal,1,7)=?", [period]);
      for (const j of uploadedJournals) {
        const linesArr = typeof j.lines === 'string'
          ? (() => { try { return JSON.parse(j.lines); } catch { return null; } })()
          : (Array.isArray(j.lines) ? j.lines : null);
        const linesJson = linesArr ? JSON.stringify(linesArr) : null;
        await run(
          `INSERT OR REPLACE INTO journals (id, tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti, kode_anggaran, lines, tipe_transaksi, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [j.id, j.tanggal, j.keterangan || '', Number(j.debit) || 0, Number(j.kredit) || 0,
           j.status || 'posted', j.akun_debit || '', j.akun_kredit || '', j.bukti || '', null,
           linesJson, j.tipe_transaksi || 'transfer']);
        if (linesArr && linesArr.length) {
          for (let i = 0; i < linesArr.length; i++) {
            const l = linesArr[i];
            await run(
              `INSERT INTO journal_lines (journal_id, line_order, tanggal, bukti, akun_code, akun_name, sub_akun, debit, kredit, keterangan)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [j.id, i, j.tanggal || '', j.bukti || '', l.akun_code || '', l.akun_name || '', l.sub_akun || '',
               Number(l.debit) || 0, Number(l.kredit) || 0, l.keterangan != null ? l.keterangan : (j.keterangan || '')]);
          }
        }
      }
      loaded.journals = uploadedJournals.length;
    } else {
      // No journals supplied: demote this month's delta journals to baseline so
      // the snapshot isn't double-counted.
      loaded.journals_rebased = await run(
        "UPDATE journal_lines SET journal_id = ? || substr(journal_id, 9) WHERE journal_id LIKE 'JV-2026-%' AND substr(tanggal,1,7)=?", [baselinePrefix, period]);
      await run("UPDATE journals SET id = ? || substr(id, 9) WHERE id LIKE 'JV-2026-%' AND substr(tanggal,1,7)=?", [baselinePrefix, period]);
    }

    if (neraca.length) {
      await run('DELETE FROM report_neraca WHERE period=?', [period]);
      for (const r of neraca) {
        await run('INSERT INTO report_neraca (period, sort_order, label, value, depth) VALUES (?, ?, ?, ?, ?)',
          [period, Number(r.order) || 0, String(r.label || ''), (r.value == null ? null : Number(r.value)), Number(r.depth) || 0]);
      }
      loaded.neraca = neraca.length;
    }
    if (arusKas.length) {
      await run('DELETE FROM report_arus_kas WHERE period=?', [period]);
      for (const r of arusKas) {
        await run('INSERT INTO report_arus_kas (period, sort_order, label, value, is_section) VALUES (?, ?, ?, ?, ?)',
          [period, Number(r.order) || 0, String(r.label || ''), (r.value == null ? null : Number(r.value)), r.isSection ? 1 : 0]);
      }
      loaded.arus_kas = arusKas.length;
    }
    if (labaRugi.length) {
      await run('DELETE FROM report_laba_rugi WHERE period=?', [period]);
      for (const r of labaRugi) {
        await run('INSERT INTO report_laba_rugi (period, sort_order, label, value, depth) VALUES (?, ?, ?, ?, ?)',
          [period, Number(r.order) || 0, String(r.label || ''), (r.value == null ? null : Number(r.value)), Number(r.depth) || 0]);
      }
      loaded.laba_rugi = labaRugi.length;
    }
    loaded.lra = {};
    for (const kat of lraKeys) {
      loaded.lra[kat] = await loadLraToAnggaran(run, kat, period, lra[kat]);
    }
    await run('COMMIT');
  } catch (e) {
    await run('ROLLBACK').catch(() => {});
    const m = mapSqliteError(e, 'simpan snapshot laporan');
    return res.status(m.status || 500).json(m.body || { error: e.message });
  }

  try { logAudit({ entity: 'period', entityId: period, action: 'SAVE_REPORT_SNAPSHOT', actorRole: getRole(req), after: loaded }); } catch (_) {}
  res.json({ success: true, period, loaded });
});

// Reconcile the general ledger (Buku Besar) to the Neraca snapshot for a period:
// posts ONE compound adjusting journal (ADJ-NRC-ALL-<period>) so every balance-sheet
// account's posted-ledger balance equals its Neraca figure. The net difference is
// parked in the suspense account 35000 (Koreksi Ekuitas). Idempotent. No-op when no
// Neraca snapshot exists for the period.
router.post('/reports/reconcile-ledger', requireRole(JOURNAL_WRITE_ROLES), async (req, res) => {
  const period = String(req.body && req.body.period ? req.body.period : '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return res.status(400).json({ error: 'Format periode harus YYYY-MM', code: 'VALIDATION_FAILED' });
  }
  const SUSPENSE = '35000';
  const adjId = `ADJ-NRC-ALL-${period}`;
  const [y, m] = period.split('-').map(Number);
  const periodEnd = `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const all = (sql, p = []) => new Promise((resolve, reject) => db.all(sql, p, (e, r) => e ? reject(e) : resolve(r || [])));
  const run = (sql, p = []) => new Promise((resolve, reject) => db.run(sql, p, function (e) { e ? reject(e) : resolve(this.changes || 0); }));

  try {
    const neraca = await all('SELECT label, value FROM report_neraca WHERE period=? AND value IS NOT NULL', [period]);
    if (neraca.length === 0) return res.json({ success: true, period, reconciled: false, reason: 'no_snapshot' });

    const coa = await all("SELECT code, name, saldo_awal FROM coa WHERE type='posting'");
    const suspense = coa.find(a => String(a.code) === SUSPENSE);
    if (!suspense) return res.json({ success: true, period, reconciled: false, reason: 'no_suspense_account' });

    const neracaByName = new Map();
    for (const r of neraca) { const k = norm(r.label); if (!neracaByName.has(k)) neracaByName.set(k, Number(r.value)); }
    // Neraca labels are often more descriptive than COA names (e.g. COA "Kas Kecil"
    // vs Neraca "Kas Kecil - Kantor"). Rule: exact match, else the account name must
    // be a prefix of EXACTLY ONE Neraca label ("kas kecil*"). 0 or >1 → skip (no guess).
    const neracaLeaf = [...neracaByName.entries()].map(([nn, value]) => ({ nn, value }));
    const findTarget = (nn) => {
      if (neracaByName.has(nn)) return neracaByName.get(nn);
      const cands = neracaLeaf.filter(r => r.nn.startsWith(nn));
      return cands.length === 1 ? cands[0].value : null;
    };
    // Explicit alias map (COA code → exact Neraca label) for accounts whose names
    // differ too much to match automatically (e.g. "Bank Kalsel - 3204661684" →
    // "Kas Bank Kalsel"). Takes precedence over name matching.
    let NERACA_ALIAS = {};
    try { NERACA_ALIAS = require('../../src/utils/reconcileAlias.json') || {}; } catch (_) { NERACA_ALIAS = {}; }
    const aliasTarget = (code) => {
      const lbl = NERACA_ALIAS[String(code)];
      if (!lbl) return null;
      const v = neracaByName.get(norm(lbl));
      return v == null ? null : v;
    };
    // Count COA names so we can skip ambiguous (duplicate-named) accounts that would
    // otherwise both match the same Neraca row and double-count.
    const nameCount = {};
    for (const a of coa) { const k = norm(a.name); nameCount[k] = (nameCount[k] || 0) + 1; }

    // Gather posted postings up to period end (exclude the adjustment itself, AND
    // exclude user delta journals JV-/JRN- so the reconcile ties only the AUDITED
    // BASELINE to the snapshot — user deltas then float on top in every report).
    const lineRows = await all(
      `SELECT jl.akun_code AS code, jl.debit AS debit, jl.kredit AS kredit
       FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
       WHERE j.status='posted' AND j.id != ? AND j.tanggal <= ?
         AND j.id NOT LIKE 'JV-%' AND j.id NOT LIKE 'JRN-%'`, [adjId, periodEnd]);
    const flatRows = await all(
      `SELECT j.akun_debit, j.akun_kredit, j.debit, j.kredit
       FROM journals j
       WHERE j.status='posted' AND j.id != ? AND j.tanggal <= ?
         AND j.id NOT LIKE 'JV-%' AND j.id NOT LIKE 'JRN-%'
         AND j.id NOT IN (SELECT DISTINCT journal_id FROM journal_lines)`, [adjId, periodEnd]);

    // Aggregate signed movement per exact account code.
    const move = {}; // code -> debit-kredit (debit-normal signed)
    const addMove = (code, d, k) => { const c = String(code || '').split(' ')[0]; if (!c) return; move[c] = (move[c] || 0) + (Number(d) || 0) - (Number(k) || 0); };
    for (const r of lineRows) addMove(r.code, r.debit, 0), addMove(r.code, 0, r.kredit);
    for (const r of flatRows) { addMove(r.akun_debit, r.debit, 0); addMove(r.akun_kredit, 0, r.kredit); }
    const moveCodes = Object.keys(move);

    // Signed ledger saldo for an account = saldo_awal + Σ movement of codes that startWith it (mirrors computeLedger).
    const saldoOf = (code, saldoAwal) => {
      let s = Number(saldoAwal) || 0;
      for (const c of moveCodes) if (c.startsWith(code)) s += move[c];
      return s;
    };

    const lines = [];
    let adjusted = 0;
    for (const a of coa) {
      const cls = String(a.code)[0];
      if (!['1', '2', '3'].includes(cls)) continue;
      if (String(a.code) === SUSPENSE) continue;
      const key = norm(a.name);
      // Alias (by code) wins and bypasses the duplicate-name skip; else name match.
      let target = aliasTarget(a.code);
      if (target == null) {
        if (nameCount[key] > 1) continue; // ambiguous (duplicate) name — skip
        target = findTarget(key);
      }
      if (target == null) continue;
      // Buku Besar shows a debit-normal running saldo (saldo_awal + Σ(debit−kredit)).
      // The adjustment simply moves that displayed saldo to the Neraca figure.
      const cur = saldoOf(a.code, a.saldo_awal);
      const delta = target - cur;
      if (Math.abs(delta) < 1) continue;
      lines.push({ akun_code: a.code, akun_name: a.name,
        debit: delta > 0 ? Math.abs(delta) : 0, kredit: delta < 0 ? Math.abs(delta) : 0,
        keterangan: `Penyesuaian ${a.name} ke Neraca` });
      adjusted++;
    }

    if (lines.length === 0) {
      // Nothing to adjust — remove any stale adjustment so it stays clean.
      await run('DELETE FROM journal_lines WHERE journal_id=?', [adjId]);
      await run('DELETE FROM journals WHERE id=?', [adjId]);
      return res.json({ success: true, period, reconciled: false, adjusted: 0, reason: 'already_matched' });
    }

    const dSum = lines.reduce((s, l) => s + l.debit, 0);
    const kSum = lines.reduce((s, l) => s + l.kredit, 0);
    const plug = Math.round((dSum - kSum) * 100) / 100;
    if (Math.abs(plug) >= 1) {
      lines.push({ akun_code: suspense.code, akun_name: suspense.name,
        debit: plug < 0 ? Math.abs(plug) : 0, kredit: plug > 0 ? Math.abs(plug) : 0,
        keterangan: 'Selisih rekonsiliasi (plug)' });
    }
    const totalAmt = lines.reduce((s, l) => s + l.debit, 0);
    const firstD = lines.find(l => l.debit > 0);
    const firstK = lines.find(l => l.kredit > 0);

    await run('BEGIN IMMEDIATE TRANSACTION');
    await run('DELETE FROM journal_lines WHERE journal_id=?', [adjId]);
    await run('DELETE FROM journals WHERE id=?', [adjId]);
    await run(
      `INSERT INTO journals (id, tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti, kode_anggaran, lines, tipe_transaksi, updated_at)
       VALUES (?, ?, ?, ?, ?, 'posted', ?, ?, ?, NULL, ?, 'transfer', datetime('now'))`,
      [adjId, periodEnd, `Rekonsiliasi Buku Besar ke Neraca ${period} (${adjusted} akun)`,
       totalAmt, totalAmt,
       firstD ? `${firstD.akun_code} - ${firstD.akun_name}` : '',
       firstK ? `${firstK.akun_code} - ${firstK.akun_name}` : '',
       adjId, JSON.stringify(lines)]);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await run(
        `INSERT INTO journal_lines (journal_id, line_order, tanggal, bukti, akun_code, akun_name, sub_akun, debit, kredit, keterangan)
         VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?)`,
        [adjId, i, periodEnd, adjId, l.akun_code, l.akun_name, l.debit, l.kredit, l.keterangan]);
    }
    await run('COMMIT');

    try { logAudit({ entity: 'period', entityId: period, action: 'RECONCILE_LEDGER', actorRole: getRole(req), after: { adjusted, plug } }); } catch (_) {}
    res.json({ success: true, period, reconciled: true, adjusted, plug });
  } catch (e) {
    await run('ROLLBACK').catch(() => {});
    const mm = mapSqliteError(e, 'rekonsiliasi buku besar ke neraca');
    return res.status(mm.status || 500).json(mm.body || { error: e.message });
  }
});


// period, demote that month's user-uploaded (JV-) journals to baseline (XL-) so the
// reports keep matching the snapshot (Excel) and are never double-counted. Safe no-op
// when no snapshot exists (reports then compute dynamically from journals as usual).
router.post('/reports/reconcile-month', requireRole(JOURNAL_WRITE_ROLES), async (req, res) => {
  const period = String(req.body && req.body.period ? req.body.period : '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return res.status(400).json({ error: 'Format periode harus YYYY-MM (contoh: 2026-05)', code: 'VALIDATION_FAILED' });
  }
  const get = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (e, row) => e ? reject(e) : resolve(row)));
  const run = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (e) { e ? reject(e) : resolve(this.changes || 0); }));

  try {
    const nCount = await get("SELECT COUNT(*) AS c FROM report_neraca WHERE period=?", [period]);
    const lCount = await get("SELECT COUNT(*) AS c FROM report_laba_rugi WHERE period=?", [period]);
    const hasSnapshot = ((nCount && nCount.c) || 0) + ((lCount && lCount.c) || 0) > 0;
    if (!hasSnapshot) {
      return res.json({ success: true, period, reconciled: false, hasSnapshot: false, rebased: 0 });
    }
    const baselinePrefix = `XL-${period}-`;
    let rebased = 0;
    await run('BEGIN TRANSACTION');
    await run('PRAGMA defer_foreign_keys = ON');
    rebased = await run(
      "UPDATE journal_lines SET journal_id = ? || substr(journal_id, 9) WHERE journal_id LIKE 'JV-2026-%' AND substr(tanggal,1,7)=?", [baselinePrefix, period]);
    await run("UPDATE journals SET id = ? || substr(id, 9) WHERE id LIKE 'JV-2026-%' AND substr(tanggal,1,7)=?", [baselinePrefix, period]);
    await run('COMMIT');
    try { logAudit({ entity: 'period', entityId: period, action: 'RECONCILE_MONTH', actorRole: getRole(req), after: { rebased } }); } catch (_) {}
    res.json({ success: true, period, reconciled: rebased > 0, hasSnapshot: true, rebased });
  } catch (e) {
    await run('ROLLBACK').catch(() => {});
    const m = mapSqliteError(e, 'rekonsiliasi bulanan');
    return res.status(m.status || 500).json(m.body || { error: e.message });
  }
});




// === GIRO (#22) ===
router.get('/giro', (req, res) => {
  db.all("SELECT * FROM giro ORDER BY tanggal DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.post('/giro', async (req, res) => {
  const { id, noGiro, tanggal, jatuhTempo, tipe, pihak, bank, jumlah, status, keterangan } = req.body;
  let giroId = id;
  if (!giroId) {
    const nextNum = await counters.next('nextGiro');
    giroId = `GR-${String(nextNum).padStart(4, '0')}`;
  }
  db.run(`INSERT OR REPLACE INTO giro (id, noGiro, tanggal, jatuhTempo, tipe, pihak, bank, jumlah, status, keterangan, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [giroId, noGiro, tanggal, jatuhTempo || '', tipe || 'masuk', pihak || '', bank || '', jumlah || 0, status || 'belum', keterangan || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: giroId, ...req.body });
    });
});

router.put('/giro/:id', (req, res) => {
  const { noGiro, tanggal, jatuhTempo, tipe, pihak, bank, jumlah, status, keterangan } = req.body;
  db.run(`UPDATE giro SET noGiro=?, tanggal=?, jatuhTempo=?, tipe=?, pihak=?, bank=?, jumlah=?, status=?, keterangan=?, updated_at=datetime('now') WHERE id=?`,
    [noGiro, tanggal, jatuhTempo, tipe, pihak, bank, jumlah, status, keterangan, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: req.params.id, ...req.body });
    });
});

router.delete('/giro/:id', (req, res) => {
  db.run("DELETE FROM giro WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: req.params.id });
  });
});

// === PELANGGAN MASTER (#11) ===
router.get('/pelanggan', (req, res) => {
  db.all("SELECT * FROM pelanggan ORDER BY nama", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
router.post('/pelanggan', async (req, res) => {
  const { id, kode, nama, alamat, kota, telepon, npwp, email, kontak, keterangan } = req.body;
  let pid = id || `PLG-${String(await counters.next('nextPelanggan')).padStart(4, '0')}`;
  db.run(`INSERT OR REPLACE INTO pelanggan (id, kode, nama, alamat, kota, telepon, npwp, email, kontak, keterangan) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [pid, kode || pid, nama, alamat, kota, telepon, npwp, email, kontak, keterangan], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: pid, ...req.body });
    });
});
router.put('/pelanggan/:id', (req, res) => {
  const { kode, nama, alamat, kota, telepon, npwp, email, kontak, keterangan } = req.body;
  db.run(`UPDATE pelanggan SET kode=?, nama=?, alamat=?, kota=?, telepon=?, npwp=?, email=?, kontak=?, keterangan=? WHERE id=?`,
    [kode, nama, alamat, kota, telepon, npwp, email, kontak, keterangan, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: req.params.id, ...req.body });
    });
});
router.delete('/pelanggan/:id', (req, res) => {
  db.run("DELETE FROM pelanggan WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: req.params.id });
  });
});

// === SUPPLIER MASTER (#14) ===
router.get('/supplier', (req, res) => {
  db.all("SELECT * FROM supplier ORDER BY nama", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
router.post('/supplier', async (req, res) => {
  const { id, kode, nama, alamat, kota, telepon, npwp, email, kontak, keterangan } = req.body;
  let sid = id || `SUP-${String(await counters.next('nextSupplier')).padStart(4, '0')}`;
  db.run(`INSERT OR REPLACE INTO supplier (id, kode, nama, alamat, kota, telepon, npwp, email, kontak, keterangan) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [sid, kode || sid, nama, alamat, kota, telepon, npwp, email, kontak, keterangan], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: sid, ...req.body });
    });
});
router.put('/supplier/:id', (req, res) => {
  const { kode, nama, alamat, kota, telepon, npwp, email, kontak, keterangan } = req.body;
  db.run(`UPDATE supplier SET kode=?, nama=?, alamat=?, kota=?, telepon=?, npwp=?, email=?, kontak=?, keterangan=? WHERE id=?`,
    [kode, nama, alamat, kota, telepon, npwp, email, kontak, keterangan, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: req.params.id, ...req.body });
    });
});
router.delete('/supplier/:id', (req, res) => {
  db.run("DELETE FROM supplier WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: req.params.id });
  });
});

// === PURCHASE ORDERS (#19) ===
router.get('/purchase-orders', (req, res) => {
  db.all("SELECT * FROM purchase_orders ORDER BY tanggal DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
router.post('/purchase-orders', async (req, res) => {
  const { id, noPO, tanggal, supplier_id, supplier_nama, status, total, keterangan, items } = req.body;
  let poId = id || `PO-${String(await counters.next('nextPO')).padStart(4, '0')}`;
  db.run(`INSERT OR REPLACE INTO purchase_orders (id, noPO, tanggal, supplier_id, supplier_nama, status, total, keterangan, items, updated_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`,
    [poId, noPO || poId, tanggal, supplier_id, supplier_nama, status || 'draft', total || 0, keterangan, items ? JSON.stringify(items) : null], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: poId, ...req.body });
    });
});
router.put('/purchase-orders/:id', (req, res) => {
  const { noPO, tanggal, supplier_id, supplier_nama, status, total, keterangan, items } = req.body;
  db.run(`UPDATE purchase_orders SET noPO=?, tanggal=?, supplier_id=?, supplier_nama=?, status=?, total=?, keterangan=?, items=?, updated_at=datetime('now') WHERE id=?`,
    [noPO, tanggal, supplier_id, supplier_nama, status, total, keterangan, items ? JSON.stringify(items) : null, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: req.params.id, ...req.body });
    });
});
router.delete('/purchase-orders/:id', (req, res) => {
  db.run("DELETE FROM purchase_orders WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: req.params.id });
  });
});

// === E-FAKTUR (#24) ===
router.get('/efaktur', (req, res) => {
  db.all("SELECT * FROM efaktur ORDER BY tanggal DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
router.post('/efaktur', async (req, res) => {
  const { id, noFaktur, tanggal, tipe, npwpLawan, namaLawan, alamatLawan, dpp, ppn, status, keterangan, ref_id } = req.body;
  let eid = id || `EF-${String(await counters.next('nextEFaktur')).padStart(4, '0')}`;
  db.run(`INSERT OR REPLACE INTO efaktur (id, noFaktur, tanggal, tipe, npwpLawan, namaLawan, alamatLawan, dpp, ppn, status, keterangan, ref_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [eid, noFaktur, tanggal, tipe || 'keluaran', npwpLawan, namaLawan, alamatLawan, dpp || 0, ppn || 0, status || 'draft', keterangan, ref_id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: eid, ...req.body });
    });
});
router.delete('/efaktur/:id', (req, res) => {
  db.run("DELETE FROM efaktur WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: req.params.id });
  });
});

// === SALES ORDERS (#20) ===
router.get('/sales-orders', (req, res) => {
  db.all("SELECT * FROM sales_orders ORDER BY tanggal DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
router.post('/sales-orders', async (req, res) => {
  const { id, noSO, tanggal, pelanggan_id, pelanggan_nama, pembayaran, status, total, keterangan, items } = req.body;
  let soId = id || `SO-${String(await counters.next('nextSO')).padStart(4, '0')}`;
  db.run(`INSERT OR REPLACE INTO sales_orders (id, noSO, tanggal, pelanggan_id, pelanggan_nama, pembayaran, status, total, keterangan, items, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
    [soId, noSO || soId, tanggal, pelanggan_id, pelanggan_nama, pembayaran||'tunai', status||'draft', total||0, keterangan, items ? JSON.stringify(items) : null], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: soId, ...req.body });
    });
});
router.put('/sales-orders/:id', (req, res) => {
  const { noSO, tanggal, pelanggan_id, pelanggan_nama, pembayaran, status, total, keterangan, items } = req.body;
  db.run(`UPDATE sales_orders SET noSO=?, tanggal=?, pelanggan_id=?, pelanggan_nama=?, pembayaran=?, status=?, total=?, keterangan=?, items=?, updated_at=datetime('now') WHERE id=?`,
    [noSO, tanggal, pelanggan_id, pelanggan_nama, pembayaran, status, total, keterangan, items ? JSON.stringify(items) : null, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: req.params.id, ...req.body });
    });
});
router.delete('/sales-orders/:id', (req, res) => {
  db.run("DELETE FROM sales_orders WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: req.params.id });
  });
});

// =============================================================
// === MODULE 4: DEPARTEMEN MASTER (CRUD) ======================
// =============================================================

const DEPT_READ_ROLES = ALL_ROLES;
const DEPT_WRITE_ROLES = [
  'spv_akuntansi', 'manager_keuangan', 'manager_umum',
  'admin', 'super_admin',
  'akuntan', // legacy
];

router.get('/departemen', requireRole(DEPT_READ_ROLES), (req, res) => {
  db.all('SELECT * FROM departemen ORDER BY kode', (err, rows) => {
    if (err) {
      const m = mapSqliteErrorShared(err, 'pembacaan departemen');
      return res.status(m.status).json(m.body);
    }
    res.json(rows);
  });
});

router.post('/departemen', requireRole(DEPT_WRITE_ROLES), (req, res) => {
  const { kode, nama, keterangan } = req.body || {};
  const codeErr = validateCodeFormat(kode, 'kode');
  if (codeErr) return res.status(400).json({ error: codeErr, code: 'VALIDATION_FAILED' });
  if (!nama || !String(nama).trim()) {
    return res.status(400).json({ error: 'Field "nama" wajib diisi', code: 'VALIDATION_FAILED' });
  }
  if (String(kode).length > 50) {
    return res.status(400).json({ error: 'Kode departemen melebihi 50 karakter', code: 'VALIDATION_FAILED' });
  }
  db.run('INSERT INTO departemen (kode, nama, keterangan) VALUES (?, ?, ?)',
    [String(kode).trim(), String(nama).trim(), keterangan || null],
    function(err) {
      if (err) {
        // Override duplicate message for friendliness
        if (/UNIQUE constraint failed/i.test(err.message)) {
          return res.status(409).json({ error: 'Kode departemen sudah ada', code: 'DUPLICATE_KEY' });
        }
        const m = mapSqliteErrorShared(err, 'penambahan departemen');
        return res.status(m.status).json(m.body);
      }
      const created = { kode: String(kode).trim(), nama: String(nama).trim(), keterangan: keterangan || null };
      logAudit({ entity: 'departemen', entityId: created.kode, action: 'CREATE', actorRole: getRole(req), after: created });
      res.status(201).json(created);
    });
});

router.put('/departemen/:kode', requireRole(DEPT_WRITE_ROLES), (req, res) => {
  const { nama, keterangan } = req.body || {};
  if (!nama || !String(nama).trim()) {
    return res.status(400).json({ error: 'Field "nama" wajib diisi', code: 'VALIDATION_FAILED' });
  }
  db.get('SELECT * FROM departemen WHERE kode = ?', [req.params.kode], (selErr, before) => {
    if (selErr) {
      const m = mapSqliteErrorShared(selErr, 'pencarian departemen');
      return res.status(m.status).json(m.body);
    }
    if (!before) return res.status(404).json({ error: 'Departemen tidak ditemukan', code: 'NOT_FOUND' });
    db.run('UPDATE departemen SET nama = ?, keterangan = ? WHERE kode = ?',
      [String(nama).trim(), keterangan || null, req.params.kode],
      function(err) {
        if (err) {
          const m = mapSqliteErrorShared(err, 'perubahan departemen');
          return res.status(m.status).json(m.body);
        }
        const after = { kode: req.params.kode, nama, keterangan };
        logAudit({ entity: 'departemen', entityId: req.params.kode, action: 'UPDATE', actorRole: getRole(req), before, after });
        res.json(after);
      });
  });
});

router.delete('/departemen/:kode', requireRole(DEPT_WRITE_ROLES), (req, res) => {
  db.get('SELECT * FROM departemen WHERE kode = ?', [req.params.kode], (selErr, row) => {
    if (selErr) {
      const m = mapSqliteErrorShared(selErr, 'pencarian departemen');
      return res.status(m.status).json(m.body);
    }
    if (!row) return res.status(404).json({ error: 'Departemen tidak ditemukan', code: 'NOT_FOUND' });
    // Referential check: any journal/COA referencing this dept code?
    db.get(
      `SELECT
         (SELECT COUNT(*) FROM journals WHERE kode_anggaran = ?) AS journal_count,
         (SELECT COUNT(*) FROM coa WHERE kode_departemen = ?) AS coa_count`,
      [req.params.kode, req.params.kode],
      (refErr, counts) => {
        if (refErr) {
          const m = mapSqliteErrorShared(refErr, 'pengecekan referensi');
          return res.status(m.status).json(m.body);
        }
        const total = (counts.journal_count || 0) + (counts.coa_count || 0);
        if (total > 0) {
          return res.status(409).json({
            error: `Departemen masih digunakan (${counts.journal_count} jurnal, ${counts.coa_count} akun), tidak bisa dihapus`,
            code: 'REF_INTEGRITY',
            references: counts,
          });
        }
        db.run('DELETE FROM departemen WHERE kode = ?', [req.params.kode], function(err) {
          if (err) {
            const m = mapSqliteErrorShared(err, 'penghapusan departemen');
            return res.status(m.status).json(m.body);
          }
          logAudit({ entity: 'departemen', entityId: req.params.kode, action: 'DELETE', actorRole: getRole(req), before: row });
          res.json({ deleted: true, kode: req.params.kode });
        });
      });
  });
});

// =============================================================
// === MODULES 5-7: VOUCHERS (input, edit, print) ==============
// =============================================================
// A voucher is a journal whose `bukti` starts with "VC-". Status flows:
//   DRAFT  → POSTED (via /vouchers/:id/approve)
// Edits are only allowed when status === 'pending' (DRAFT) and period unlocked.

// SOP Pembayaran B&J:
//   Step 2: Admin/Unit Terkait mengajukan (Kasir/Staff input voucher)
//   Step 4: Manajer Keuangan dan Direksi memberi otorisasi
const VOUCHER_READ_ROLES = ALL_ROLES;
const VOUCHER_WRITE_ROLES = [
  'kasir_bisnis', 'kasir_pasar', 'staff_keuangan', 'spv_akuntansi',
  'admin', 'super_admin',
  'kasir', 'akuntan', // legacy
];
const VOUCHER_APPROVE_ROLES = [
  // Manager level (< 1 jt)
  'manager_bisnis', 'manager_operasional', 'kepala_pasar', 'manager_keuangan', 'manager_umum',
  // Direktur level (> 1 jt per SOP)
  'direktur_bisnis_operasional', 'direktur_umum_keuangan', 'direktur_utama',
  // Senior Accounting
  'spv_akuntansi',
  'admin', 'super_admin',
  'akuntan', 'manajer_keuangan', 'direktur', // legacy
];
const VOUCHER_PRINT_ROLES = ALL_ROLES;

function rowToVoucher(row) {
  if (!row) return null;
  let lines = [];
  try { lines = row.lines ? JSON.parse(row.lines) : []; } catch (_) {}
  return {
    id: row.id,
    bukti: row.bukti,
    tanggal: row.tanggal,
    keterangan: row.keterangan,
    debit: row.debit,
    kredit: row.kredit,
    status: row.status,
    akun_debit: row.akun_debit,
    akun_kredit: row.akun_kredit,
    kode_anggaran: row.kode_anggaran,
    lines,
    created_at: row.created_at,
    updated_at: row.updated_at,
    print_count: row.bukti ? Number(String(row.bukti).match(/\(printed:(\d+)\)/)?.[1] || 0) : 0,
  };
}

router.get('/vouchers', requireRole(VOUCHER_READ_ROLES), (req, res) => {
  const { month, status } = req.query || {};
  const where = ["bukti LIKE 'VC-%'"];
  const params = [];
  if (month) { where.push("substr(tanggal,1,7) = ?"); params.push(month); }
  if (status) { where.push('status = ?'); params.push(status); }
  db.all(`SELECT * FROM journals WHERE ${where.join(' AND ')} ORDER BY tanggal DESC, id DESC`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(rowToVoucher));
  });
});

router.get('/vouchers/:id', requireRole(VOUCHER_READ_ROLES), (req, res) => {
  db.get("SELECT * FROM journals WHERE id = ? AND bukti LIKE 'VC-%'", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Voucher tidak ditemukan', code: 'NOT_FOUND' });
    res.json(rowToVoucher(row));
  });
});

router.post('/vouchers', requireRole(VOUCHER_WRITE_ROLES), async (req, res) => {
  // Mirror debit/kredit
  if (req.body.debit !== undefined && req.body.kredit === undefined) req.body.kredit = req.body.debit;
  if (req.body.kredit !== undefined && req.body.debit === undefined) req.body.debit = req.body.kredit;

  let validationError;
  try {
    validationError = await validateJournalPayload(req.body, {});
  } catch (e) {
    return res.status(500).json({ error: e.message, code: 'VALIDATION_ERROR' });
  }
  if (validationError) return res.status(400).json({ error: validationError, code: 'VALIDATION_FAILED' });

  const nextNum = await counters.next('nextVoucher');
  const voucherId = `VC-2026-${String(nextNum).padStart(3, '0')}`;
  const debitVal = Number(req.body.debit);
  const kreditVal = Number(req.body.kredit);
  const linesJson = req.body.lines == null ? null : (typeof req.body.lines === 'string' ? req.body.lines : JSON.stringify(req.body.lines));

  db.run(`
    INSERT INTO journals (id, tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti, kode_anggaran, lines, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, datetime('now'))
  `, [
    voucherId,
    req.body.tanggal,
    req.body.keterangan || '',
    debitVal,
    kreditVal,
    req.body.akun_debit,
    req.body.akun_kredit,
    voucherId, // bukti = same as id for VC-* vouchers
    req.body.kode_anggaran || null,
    linesJson,
  ], function(err) {
    if (err) {
      const m = mapSqliteError(err, 'penambahan voucher');
      return res.status(m.status).json(m.body);
    }
    const created = { id: voucherId, bukti: voucherId, status: 'pending', ...req.body };
    logAudit({ entity: 'voucher', entityId: voucherId, action: 'CREATE', actorRole: getRole(req), after: created });
    res.status(201).json(created);
  });
});

router.put('/vouchers/:id', requireRole(VOUCHER_WRITE_ROLES), async (req, res) => {
  if (req.body.debit !== undefined && req.body.kredit === undefined) req.body.kredit = req.body.debit;
  if (req.body.kredit !== undefined && req.body.debit === undefined) req.body.debit = req.body.kredit;

  db.get("SELECT * FROM journals WHERE id = ? AND bukti LIKE 'VC-%'", [req.params.id], async (selErr, before) => {
    if (selErr) {
      const m = mapSqliteErrorShared(selErr, 'pencarian voucher');
      return res.status(m.status).json(m.body);
    }
    if (!before) return res.status(404).json({ error: 'Voucher tidak ditemukan', code: 'NOT_FOUND' });
    if (before.status === 'posted') {
      return res.status(409).json({ error: 'Voucher sudah disetujui (POSTED), tidak bisa diedit', code: 'ALREADY_POSTED' });
    }
    const beforePeriod = dateToPeriod(before.tanggal);
    if (beforePeriod && (await isPeriodLocked(beforePeriod))) {
      return res.status(409).json({ error: `Periode ${beforePeriod} sudah dikunci`, code: 'PERIOD_LOCKED' });
    }

    // TC-6-08: empty lines → reject
    if (Array.isArray(req.body.lines) && req.body.lines.length === 0) {
      return res.status(400).json({ error: 'Voucher tidak boleh kosong (minimal 1 baris)', code: 'VALIDATION_FAILED' });
    }

    let validationError;
    try {
      validationError = await validateJournalPayload({ ...before, ...req.body }, {});
    } catch (e) {
      return res.status(500).json({ error: e.message, code: 'VALIDATION_ERROR' });
    }
    if (validationError) return res.status(400).json({ error: validationError, code: 'VALIDATION_FAILED' });

    const debitVal = req.body.debit !== undefined ? Number(req.body.debit) : Number(before.debit);
    const kreditVal = req.body.kredit !== undefined ? Number(req.body.kredit) : Number(before.kredit);
    const linesJson = req.body.lines == null ? before.lines : (typeof req.body.lines === 'string' ? req.body.lines : JSON.stringify(req.body.lines));

    db.run(`
      UPDATE journals SET tanggal = ?, keterangan = ?, debit = ?, kredit = ?,
        akun_debit = ?, akun_kredit = ?, kode_anggaran = ?, lines = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [
      req.body.tanggal || before.tanggal,
      req.body.keterangan !== undefined ? req.body.keterangan : before.keterangan,
      debitVal, kreditVal,
      req.body.akun_debit || before.akun_debit,
      req.body.akun_kredit || before.akun_kredit,
      req.body.kode_anggaran !== undefined ? req.body.kode_anggaran : before.kode_anggaran,
      linesJson,
      req.params.id,
    ], function(err) {
      if (err) {
        const m = mapSqliteError(err, 'perubahan voucher');
        return res.status(m.status).json(m.body);
      }
      const after = { id: req.params.id, ...req.body };
      logAudit({ entity: 'voucher', entityId: req.params.id, action: 'UPDATE', actorRole: getRole(req), before, after });
      res.json(after);
    });
  });
});

router.post('/vouchers/:id/approve', requireRole(VOUCHER_APPROVE_ROLES), (req, res) => {
  db.get("SELECT * FROM journals WHERE id = ? AND bukti LIKE 'VC-%'", [req.params.id], async (selErr, row) => {
    if (selErr) {
      const m = mapSqliteErrorShared(selErr, 'pencarian voucher');
      return res.status(m.status).json(m.body);
    }
    if (!row) return res.status(404).json({ error: 'Voucher tidak ditemukan', code: 'NOT_FOUND' });
    if (row.status === 'posted') {
      return res.status(409).json({ error: 'Voucher sudah POSTED', code: 'ALREADY_POSTED' });
    }
    const period = dateToPeriod(row.tanggal);
    if (period && (await isPeriodLocked(period))) {
      return res.status(409).json({ error: `Periode ${period} sudah dikunci`, code: 'PERIOD_LOCKED' });
    }
    db.run("UPDATE journals SET status = 'posted', updated_at = datetime('now') WHERE id = ?", [req.params.id], function(err) {
      if (err) {
        const m = mapSqliteError(err, 'persetujuan voucher');
        return res.status(m.status).json(m.body);
      }
      logAudit({ entity: 'voucher', entityId: req.params.id, action: 'APPROVE', actorRole: getRole(req) });
      res.json({ id: req.params.id, status: 'posted' });
    });
  });
});

// Module 7: Print voucher (POSTED only). Returns a structured document payload
// for the frontend / CLI to render to PDF. Tracks copy count via voucher_prints table.
router.get('/vouchers/:id/print', requireRole(VOUCHER_PRINT_ROLES), (req, res) => {
  db.get("SELECT * FROM journals WHERE id = ? AND bukti LIKE 'VC-%'", [req.params.id], (selErr, row) => {
    if (selErr) {
      const m = mapSqliteErrorShared(selErr, 'pencarian voucher');
      return res.status(m.status).json(m.body);
    }
    if (!row) return res.status(404).json({ error: 'Voucher tidak ditemukan', code: 'NOT_FOUND' });
    if (row.status !== 'posted') {
      return res.status(409).json({ error: 'Voucher belum final (DRAFT), tidak bisa dicetak', code: 'NOT_POSTED' });
    }

    // Track print count using the voucher_prints log table (lazy-create)
    db.run(`CREATE TABLE IF NOT EXISTS voucher_prints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_id TEXT NOT NULL,
      printed_by TEXT,
      printed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
      db.get('SELECT COUNT(*) AS c FROM voucher_prints WHERE voucher_id = ?', [req.params.id], (cErr, cRow) => {
        const prevCount = cRow ? cRow.c : 0;
        db.run('INSERT INTO voucher_prints (voucher_id, printed_by) VALUES (?, ?)', [req.params.id, getRole(req)], () => {
          let lines = [];
          try { lines = row.lines ? JSON.parse(row.lines) : []; } catch (_) {}
          res.json({
            voucher: rowToVoucher(row),
            paper_size: 'A4',
            signature_blocks: [
              { role: 'Pembuat', name: '' },
              { role: 'Pemeriksa', name: '' },
              { role: 'Direktur', name: '' },
            ],
            watermark: prevCount > 0 ? 'COPY' : null,
            print_count: prevCount + 1,
            generated_at: new Date().toISOString(),
            generated_by: getRole(req),
          });
        });
      });
    });
  });
});

// =============================================================
// === MODULES 11-12: PERIOD LOCK / UNLOCK (enhanced) ==========
// =============================================================
// Replaces the bare-minimum locked_periods routes that existed before.
// Note: the pre-existing GET/POST/DELETE /locked-periods are below this block;
// they remain for backwards compat but new clients should use these enhanced routes.

// SOP Laporan Keuangan — Tgl 2 Closing Jurnal: SPV Akuntansi kunci periode
// SOP Rekonsiliasi — Tgl 5: Otorisasi & Arsip oleh CFO / Direktur
const LOCK_LIST_ROLES = ALL_ROLES;
const LOCK_LOCK_ROLES = [
  'spv_akuntansi', 'manager_keuangan',
  'direktur_umum_keuangan', 'direktur_utama',
  'admin', 'super_admin',
  'manajer_keuangan', // legacy
];
const LOCK_UNLOCK_ROLES = ['admin', 'super_admin', 'direktur_utama']; // hanya level paling tinggi

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

router.get('/periods/locks', requireRole(LOCK_LIST_ROLES), (req, res) => {
  db.all('SELECT * FROM locked_periods ORDER BY period DESC', (err, rows) => {
    if (err) {
      const m = mapSqliteErrorShared(err, 'pembacaan periode');
      return res.status(m.status).json(m.body);
    }
    res.json(rows);
  });
});

router.post('/periods/locks', requireRole(LOCK_LOCK_ROLES), (req, res) => {
  const { period, reason } = req.body || {};
  const periodErr = validatePeriod(period);
  if (periodErr) return res.status(400).json({ error: periodErr, code: 'VALIDATION_FAILED' });

  const now = currentPeriod();
  if (period === now) {
    return res.status(409).json({ error: 'Tidak bisa kunci periode aktif (bulan berjalan)', code: 'CURRENT_PERIOD' });
  }
  if (period > now) {
    return res.status(409).json({ error: 'Tidak bisa kunci periode mendatang', code: 'FUTURE_PERIOD' });
  }

  db.get('SELECT * FROM locked_periods WHERE period = ?', [period], (selErr, existing) => {
    if (selErr) {
      const m = mapSqliteErrorShared(selErr, 'pengecekan periode');
      return res.status(m.status).json(m.body);
    }
    if (existing && !existing.unlocked_at) {
      return res.status(409).json({ error: `Periode ${period} sudah terkunci`, code: 'ALREADY_LOCKED' });
    }
    const role = getRole(req);
    if (existing) {
      // re-lock (after a previous unlock cycle) — clear unlock columns
      db.run(
        `UPDATE locked_periods SET locked_by = ?, locked_at = datetime('now'),
          unlock_reason = NULL, unlocked_by = NULL, unlocked_at = NULL WHERE period = ?`,
        [role, period],
        function(err) {
          if (err) {
            const m = mapSqliteErrorShared(err, 'kunci periode');
            return res.status(m.status).json(m.body);
          }
          logAudit({ entity: 'period', entityId: period, action: 'RELOCK', actorRole: role, after: { reason: reason || null } });
          res.json({ period, locked: true, reason: reason || null });
        }
      );
    } else {
      db.run(
        `INSERT INTO locked_periods (period, locked_by, locked_at) VALUES (?, ?, datetime('now'))`,
        [period, role],
        function(err) {
          if (err) {
            const m = mapSqliteErrorShared(err, 'kunci periode');
            return res.status(m.status).json(m.body);
          }
          logAudit({ entity: 'period', entityId: period, action: 'LOCK', actorRole: role, after: { reason: reason || null } });
          res.status(201).json({ period, locked: true, reason: reason || null });
        }
      );
    }
  });
});

router.post('/periods/unlock', requireRole(LOCK_UNLOCK_ROLES), (req, res) => {
  const { period, reason } = req.body || {};
  const periodErr = validatePeriod(period);
  if (periodErr) return res.status(400).json({ error: periodErr, code: 'VALIDATION_FAILED' });
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: 'Alasan (reason) wajib diisi untuk membuka kunci periode', code: 'VALIDATION_FAILED' });
  }
  db.get('SELECT * FROM locked_periods WHERE period = ?', [period], (selErr, row) => {
    if (selErr) {
      const m = mapSqliteErrorShared(selErr, 'pengecekan periode');
      return res.status(m.status).json(m.body);
    }
    if (!row || row.unlocked_at) {
      return res.status(409).json({ error: 'Periode tidak dalam status terkunci', code: 'NOT_LOCKED' });
    }
    const role = getRole(req);
    db.run(
      `DELETE FROM locked_periods WHERE period = ?`,
      [period],
      function(err) {
        if (err) {
          const m = mapSqliteErrorShared(err, 'buka kunci periode');
          return res.status(m.status).json(m.body);
        }
        logAudit({ entity: 'period', entityId: period, action: 'UNLOCK', actorRole: role, before: row, after: { reason } });
        res.json({ period, unlocked: true, reason });
      }
    );
  });
});

// === EXPORT ===
router.get('/export', (req, res) => {
  db.all("SELECT * FROM journals", (err, journals) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all("SELECT * FROM coa", (err2, coa) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ journals, coa });
    });
  });
});

// =============================================================
// === MODULES 13-36 GENERIC RESOURCES (mounted via factory) ===
// =============================================================

const { mountResource } = require('../middleware/resourceHandler.cjs');

// Common role groups reused by Modules 13-36
const ALL_READ = ['akuntan', 'auditor', 'manajer_keuangan', 'direktur', 'admin', 'kasir', 'super_admin', 'staff_gudang', 'staff_pembelian', 'staff_penagihan', 'staff_pajak'];
const FIN_WRITE = ['akuntan', 'admin', 'super_admin'];
const STAFF_GUDANG_WRITE = ['staff_gudang', 'akuntan', 'admin', 'super_admin'];
const STAFF_PEMBELIAN_WRITE = ['staff_pembelian', 'akuntan', 'admin', 'super_admin'];
const STAFF_PENAGIHAN_WRITE = ['staff_penagihan', 'akuntan', 'admin', 'super_admin'];
const STAFF_PAJAK_WRITE = ['staff_pajak', 'akuntan', 'admin', 'super_admin'];
const KASIR_WRITE = ['kasir', 'akuntan', 'admin', 'super_admin'];
const ADMIN_ONLY_WRITE = ['admin', 'super_admin'];

// Helper used by refCheck closures
function refCount(sql, params, label) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve({ count: row && row.c ? row.c : 0, label });
    });
  });
}

// ----- Module 13: Jenis Jurnal -----
mountResource(router, {
  name: 'jenis-jurnal',
  table: 'jenis_jurnal',
  pkField: 'prefix',
  readRoles: ALL_READ,
  writeRoles: FIN_WRITE,
  requiredFields: ['prefix', 'nama'],
  numericFields: ['next_value'],
  orderBy: 'prefix',
  refCheck: (id) => refCount(
    `SELECT COUNT(*) c FROM journals WHERE bukti LIKE ? OR id LIKE ?`,
    [`${id}%`, `${id}%`],
    'jurnal terkait'
  ),
});

// ----- Module 27: Inventory Transfers -----
mountResource(router, {
  name: 'inventory-transfers',
  table: 'inventory_transfers',
  pkField: 'id',
  readRoles: ALL_READ,
  writeRoles: STAFF_GUDANG_WRITE,
  requiredFields: ['id', 'tanggal', 'kode_barang', 'dari_lokasi', 'ke_lokasi', 'qty'],
  numericFields: ['qty'],
  orderBy: 'tanggal DESC',
});

// ----- Module 28: Stock Opname -----
// `selisih` may legitimately be negative (qty_fisik < qty_sistem = shortage),
// so we exclude it from the non-negative numeric validator. We still validate
// that it's numeric via the explicit list.
mountResource(router, {
  name: 'stock-opname',
  table: 'stock_opname',
  pkField: 'id',
  readRoles: ALL_READ,
  writeRoles: ['auditor', 'staff_gudang', 'akuntan', 'admin', 'super_admin'],
  requiredFields: ['id', 'tanggal', 'kode_barang'],
  numericFields: ['qty_sistem', 'qty_fisik'],
  orderBy: 'tanggal DESC',
});

// ----- Module 36: Users -----
mountResource(router, {
  name: 'users',
  table: 'users',
  pkField: 'username',
  readRoles: ADMIN_ONLY_WRITE,
  writeRoles: ADMIN_ONLY_WRITE,
  requiredFields: ['username', 'role'],
  orderBy: 'username',
});

// ----- Module 35: Backup log -----
mountResource(router, {
  name: 'backups',
  table: 'backups',
  pkField: 'id',
  readRoles: ADMIN_ONLY_WRITE,
  writeRoles: ADMIN_ONLY_WRITE,
  requiredFields: ['filename'],
  numericFields: ['size_bytes'],
  orderBy: 'created_at DESC',
});

// ----- Module 22: Piutang period closings -----
mountResource(router, {
  name: 'piutang-closings',
  table: 'piutang_closings',
  pkField: 'id',
  readRoles: ALL_READ,
  writeRoles: FIN_WRITE,
  requiredFields: ['period'],
  numericFields: ['total_saldo'],
  orderBy: 'period DESC',
});

// =============================================================
// === HARDENED CRUD wrappers around legacy CRUD endpoints =====
// =============================================================
// We keep the legacy /piutang, /hutang, /assets, /inventory, /bbm, /giro,
// /pelanggan, /supplier, /efaktur, /sales-orders, /purchase-orders,
// /rekonsiliasi, /anggaran handlers for back-compat, but mount additional
// "/v2" namespaces that follow the strict UAT contract (RBAC + validation +
// audit + ref-integrity).
//
// To avoid clashes we use distinct route prefixes (e.g. `/piutang-v2`) but
// also enforce RBAC on the existing routes via app-level middleware that
// inspects the path.

// (legacy RBAC middleware moved earlier — see top of file)

// =============================================================
// === REPORT ENDPOINTS (Modules 14-19, 24, 33, 34) ============
// =============================================================
// All reports are read-only aggregations against `journals` + `coa`.

// ----- Module 14: Buku Besar (general ledger by account) -----
router.get('/reports/buku-besar', requireRole(ALL_READ), (req, res) => {
  const { account, from, to, month } = req.query || {};
  const where = [];
  const params = [];
  if (account) { where.push('(akun_debit = ? OR akun_kredit = ?)'); params.push(account, account); }
  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) return res.status(400).json({ error: 'Format month tidak valid', code: 'VALIDATION_FAILED' });
    where.push("substr(tanggal,1,7) = ?"); params.push(month);
  }
  if (from && to) {
    if (from > to) return res.status(400).json({ error: 'Rentang tanggal tidak valid (from > to)', code: 'VALIDATION_FAILED' });
    where.push('tanggal BETWEEN ? AND ?'); params.push(from, to);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  // Seed the running balance with the account's opening balance (saldo_awal),
  // matching the Excel buku besar. Debit-normal accounts (Aset/Beban/HPP) carry
  // a positive opening; credit-normal (Kewajiban/Ekuitas/Pendapatan) negative in
  // this debit−kredit running convention.
  const runLedger = (seed) => {
    db.all(`SELECT * FROM journals ${w} ORDER BY tanggal ASC`, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      let running = seed;
      const out = rows.map((r) => {
        const d = Number(r.debit) || 0;
        const k = Number(r.kredit) || 0;
        if (account) {
          const delta = (r.akun_debit === account ? d : 0) - (r.akun_kredit === account ? k : 0);
          running += delta;
        } else {
          running += d - k;
        }
        return { ...r, running_balance: running };
      });
      res.json({
        account: account || null,
        from: from || null,
        to: to || null,
        opening_balance: seed,
        count: out.length,
        ending_balance: running,
        rows: out,
      });
    });
  };

  if (account) {
    db.get('SELECT saldo_awal, category FROM coa WHERE code = ?', [account], (e, acc) => {
      if (e) return res.status(500).json({ error: e.message });
      const sa = Number(acc && acc.saldo_awal) || 0;
      const creditNormal = acc && (acc.category === 'Kewajiban' || acc.category === 'Ekuitas' || acc.category === 'Pendapatan');
      runLedger(creditNormal ? -sa : sa);
    });
  } else {
    runLedger(0);
  }
});

// ----- Module 15: Neraca (Balance Sheet) -----
router.get('/reports/neraca', requireRole(ALL_READ), (req, res) => {
  const { period } = req.query || {};
  const cutoffDate = period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period)
    ? `${period}-31`
    : '2099-12-31';

  db.all('SELECT * FROM coa', [], (err, accounts) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all(
      `SELECT akun_debit, akun_kredit, SUM(debit) AS d, SUM(kredit) AS k
       FROM journals WHERE tanggal <= ?
       GROUP BY akun_debit, akun_kredit`,
      [cutoffDate],
      (err2, mutations) => {
        if (err2) return res.status(500).json({ error: err2.message });

        const balanceByCode = {};
        const isCreditNormal = (cat) => cat === 'Kewajiban' || cat === 'Ekuitas' || cat === 'Pendapatan';
        for (const a of accounts) {
          balanceByCode[a.code] = { ...a, debit: 0, kredit: 0, balance: Number(a.saldo_awal) || 0 };
        }
        for (const m of mutations) {
          // Journal account fields are stored as "CODE name" (or "CODE - name");
          // extract the leading code token to match the COA.
          const dCode = String(m.akun_debit || '').split(' ')[0];
          const kCode = String(m.akun_kredit || '').split(' ')[0];
          // Debit-normal (Aset/Beban/HPP): balance += debit − kredit.
          // Credit-normal (Kewajiban/Ekuitas/Pendapatan): balance += kredit − debit.
          if (balanceByCode[dCode]) {
            const row = balanceByCode[dCode];
            row.debit += Number(m.d) || 0;
            row.balance += isCreditNormal(row.category) ? -(Number(m.d) || 0) : (Number(m.d) || 0);
          }
          if (balanceByCode[kCode]) {
            const row = balanceByCode[kCode];
            row.kredit += Number(m.k) || 0;
            row.balance += isCreditNormal(row.category) ? (Number(m.k) || 0) : -(Number(m.k) || 0);
          }
        }
        const grouped = { Aset: [], Kewajiban: [], Ekuitas: [] };
        let totalAset = 0, totalKewajiban = 0, totalEkuitas = 0;
        // Current-period net income (Pendapatan − Beban − HPP) is part of equity
        // but is not posted to an equity account — inject it so the sheet balances.
        let labaBerjalan = 0;
        for (const code of Object.keys(balanceByCode)) {
          const row = balanceByCode[code];
          if (row.category === 'Aset') { grouped.Aset.push(row); totalAset += row.balance; }
          else if (row.category === 'Kewajiban') { grouped.Kewajiban.push(row); totalKewajiban += row.balance; }
          else if (row.category === 'Ekuitas') { grouped.Ekuitas.push(row); totalEkuitas += row.balance; }
          else if (row.category === 'Pendapatan') { labaBerjalan += row.balance; }
          else if (row.category === 'Beban' || row.category === 'HPP') { labaBerjalan -= row.balance; }
        }
        if (Math.abs(labaBerjalan) > 0.0001) {
          const plRow = { code: '34000', name: 'Laba (Rugi) Periode Berjalan', category: 'Ekuitas', balance: labaBerjalan, debit: 0, kredit: 0 };
          grouped.Ekuitas.push(plRow);
          totalEkuitas += labaBerjalan;
        }
        res.json({
          period: period || 'all',
          cutoff_date: cutoffDate,
          aset: grouped.Aset,
          kewajiban: grouped.Kewajiban,
          ekuitas: grouped.Ekuitas,
          totals: {
            total_aset: totalAset,
            total_kewajiban: totalKewajiban,
            total_ekuitas: totalEkuitas,
            laba_berjalan: labaBerjalan,
            balanced: Math.abs(totalAset - (totalKewajiban + totalEkuitas)) < 1,
          },
        });
      }
    );
  });
});

// ----- Module 16: Neraca Saldo (Trial Balance) -----
router.get('/reports/neraca-saldo', requireRole(ALL_READ), (req, res) => {
  const { period } = req.query || {};
  const where = [];
  const params = [];
  if (period) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return res.status(400).json({ error: 'Format period tidak valid', code: 'VALIDATION_FAILED' });
    where.push("substr(tanggal,1,7) <= ?"); params.push(period);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  db.all(
    `SELECT akun_debit AS akun, SUM(debit) AS debit, 0 AS kredit FROM journals ${w} GROUP BY akun_debit
     UNION ALL
     SELECT akun_kredit AS akun, 0 AS debit, SUM(kredit) AS kredit FROM journals ${w} GROUP BY akun_kredit`,
    [...params, ...params],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const acc = {};
      for (const r of rows) {
        // Re-key by the leading code token so "CODE name" journal entries merge
        // with the COA opening balances (which are keyed by bare code).
        const code = String(r.akun || '').split(' ')[0];
        if (!acc[code]) acc[code] = { akun: code, debit: 0, kredit: 0 };
        acc[code].debit += Number(r.debit) || 0;
        acc[code].kredit += Number(r.kredit) || 0;
      }
      // Seed each account with its opening balance (saldo_awal) on the correct
      // side so the trial balance matches the Excel (which carries SALDO AWAL).
      db.all('SELECT code, saldo_awal, category FROM coa', [], (e2, coaRows) => {
        if (e2) return res.status(500).json({ error: e2.message });
        for (const c of (coaRows || [])) {
          const sa = Number(c.saldo_awal) || 0;
          if (!sa) continue;
          if (!acc[c.code]) acc[c.code] = { akun: c.code, debit: 0, kredit: 0 };
          const creditNormal = c.category === 'Kewajiban' || c.category === 'Ekuitas' || c.category === 'Pendapatan';
          if (creditNormal) acc[c.code].kredit += sa; else acc[c.code].debit += sa;
        }
        const list = Object.values(acc).sort((a, b) => a.akun.localeCompare(b.akun));
        const totalDebit = list.reduce((s, r) => s + r.debit, 0);
        const totalKredit = list.reduce((s, r) => s + r.kredit, 0);
        res.json({
          period: period || 'all',
          rows: list,
          totals: { total_debit: totalDebit, total_kredit: totalKredit, balanced: Math.abs(totalDebit - totalKredit) < 1, selisih: totalDebit - totalKredit },
        });
      });
    }
  );
});

// ----- Module 17: Rugi Laba (P&L) -----
router.get('/reports/rugi-laba', requireRole(ALL_READ), (req, res) => {
  const { period, from, to } = req.query || {};
  const where = ["c.category IN ('Pendapatan','Beban','HPP')"];
  const params = [];
  if (month_param_valid(period)) { where.push("substr(j.tanggal,1,7) = ?"); params.push(period); }
  if (from && to) {
    if (from > to) return res.status(400).json({ error: 'Rentang tanggal tidak valid', code: 'VALIDATION_FAILED' });
    where.push('j.tanggal BETWEEN ? AND ?'); params.push(from, to);
  }
  const w = 'WHERE ' + where.join(' AND ');
  db.all(
    `SELECT c.code, c.name, c.category,
            SUM(CASE WHEN j.akun_debit = c.code THEN j.debit ELSE 0 END) AS total_debit,
            SUM(CASE WHEN j.akun_kredit = c.code THEN j.kredit ELSE 0 END) AS total_kredit
     FROM coa c LEFT JOIN journals j ON (j.akun_debit = c.code OR j.akun_kredit = c.code) ${w}
     GROUP BY c.code, c.name, c.category`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const pendapatan = rows.filter((r) => r.category === 'Pendapatan');
      const beban = rows.filter((r) => r.category === 'Beban');
      const hpp = rows.filter((r) => r.category === 'HPP');
      const totalPendapatan = pendapatan.reduce((s, r) => s + (Number(r.total_kredit) || 0), 0);
      const totalBeban = beban.reduce((s, r) => s + (Number(r.total_debit) || 0), 0);
      const totalHpp = hpp.reduce((s, r) => s + (Number(r.total_debit) || 0), 0);
      const labaKotor = totalPendapatan - totalHpp;
      const labaBersih = labaKotor - totalBeban;
      res.json({
        period: period || 'all',
        from: from || null, to: to || null,
        pendapatan, beban, hpp,
        totals: { total_pendapatan: totalPendapatan, total_beban: totalBeban, total_hpp: totalHpp, laba_kotor: labaKotor, laba_bersih: labaBersih },
      });
    }
  );
});

function month_param_valid(p) { return p && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p)); }

// ----- Module 18: HPP (Cost of Goods Sold subset) -----
router.get('/reports/hpp', requireRole(ALL_READ), (req, res) => {
  const { period } = req.query || {};
  const params = [];
  let w = "WHERE c.category = 'HPP'";
  if (month_param_valid(period)) { w += " AND substr(j.tanggal,1,7) = ?"; params.push(period); }
  db.all(
    `SELECT c.code, c.name, SUM(CASE WHEN j.akun_debit = c.code THEN j.debit ELSE 0 END) AS biaya
     FROM coa c LEFT JOIN journals j ON (j.akun_debit = c.code OR j.akun_kredit = c.code)
     ${w} GROUP BY c.code, c.name`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const total = rows.reduce((s, r) => s + (Number(r.biaya) || 0), 0);
      res.json({ period: period || 'all', rows, total_hpp: total });
    }
  );
});

// ----- Module 19: Lacak Kilat (drill-down) -----
router.get('/reports/lacak/:account', requireRole(ALL_READ), (req, res) => {
  db.get('SELECT * FROM coa WHERE code = ?', [req.params.account], (err, acc) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!acc) return res.status(404).json({ error: 'Akun tidak ditemukan', code: 'NOT_FOUND' });
    db.all(
      'SELECT * FROM journals WHERE akun_debit = ? OR akun_kredit = ? ORDER BY tanggal DESC LIMIT 500',
      [req.params.account, req.params.account],
      (err2, rows) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ account: acc, count: rows.length, journals: rows });
      }
    );
  });
});

// ----- Module 21: Piutang SOA (Statement of Account per pelanggan) -----
router.get('/reports/piutang-soa/:pelanggan', requireRole(ALL_READ), (req, res) => {
  db.all(
    'SELECT * FROM piutang WHERE pelanggan = ? ORDER BY tanggal',
    [req.params.pelanggan],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const totalJumlah = rows.reduce((s, r) => s + (Number(r.jumlah) || 0), 0);
      const totalTerbayar = rows.reduce((s, r) => s + (Number(r.terbayar) || 0), 0);
      const totalSisa = rows.reduce((s, r) => s + (Number(r.sisa) || 0), 0);
      res.json({ pelanggan: req.params.pelanggan, count: rows.length, totals: { totalJumlah, totalTerbayar, totalSisa }, rows });
    }
  );
});

// ----- Module 24: Hutang Aging -----
router.get('/reports/hutang-aging', requireRole(ALL_READ), (req, res) => {
  const today = new Date();
  db.all('SELECT * FROM hutang', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const aged = rows.map((r) => {
      const due = r.jatuh_tempo ? new Date(r.jatuh_tempo) : null;
      let daysOverdue = 0;
      if (due) daysOverdue = Math.floor((today - due) / 86400000);
      let bucket = 'current';
      if (daysOverdue > 0 && daysOverdue <= 30) bucket = '1-30';
      else if (daysOverdue > 30 && daysOverdue <= 60) bucket = '31-60';
      else if (daysOverdue > 60 && daysOverdue <= 90) bucket = '61-90';
      else if (daysOverdue > 90) bucket = '90+';
      buckets[bucket] += Number(r.sisa) || 0;
      return { ...r, days_overdue: daysOverdue, aging_bucket: bucket };
    });
    res.json({ as_of: today.toISOString().slice(0, 10), buckets, count: aged.length, rows: aged });
  });
});

// ----- Module 33: Anggaran vs Realisasi (LRA) -----
router.get('/reports/anggaran-realisasi', requireRole(ALL_READ), (req, res) => {
  const { period } = req.query || {};
  db.all('SELECT * FROM anggaran', [], (err, anggaran) => {
    if (err) return res.status(500).json({ error: err.message });
    const where = [];
    const params = [];
    if (month_param_valid(period)) { where.push("substr(tanggal,1,7) = ?"); params.push(period); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    db.all(
      `SELECT kode_anggaran, SUM(debit) AS realisasi FROM journals ${w} GROUP BY kode_anggaran`,
      params,
      (err2, realisasi) => {
        if (err2) return res.status(500).json({ error: err2.message });
        const realByKode = Object.fromEntries(realisasi.map((r) => [r.kode_anggaran, Number(r.realisasi) || 0]));
        const out = anggaran.map((a) => {
          const realisasi = realByKode[a.kode] || 0;
          const pagu = Number(a.anggaran_awal) || 0;
          const persentase = pagu > 0 ? (realisasi / pagu) * 100 : 0;
          return { ...a, realisasi, persentase, status: persentase > 100 ? 'OVER' : (persentase > 90 ? 'WARN' : 'OK') };
        });
        res.json({ period: period || 'all', count: out.length, rows: out });
      }
    );
  });
});

// ----- Module 34: Rekonsiliasi Bank summary -----
router.get('/reports/rekonsiliasi', requireRole(ALL_READ), (req, res) => {
  const { period } = req.query || {};
  const where = [];
  const params = [];
  if (month_param_valid(period)) { where.push("substr(tanggal,1,7) = ?"); params.push(period); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  db.all(`SELECT * FROM rekonsiliasi ${w} ORDER BY tanggal DESC`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const sum = { buku: 0, bank: 0 };
    for (const r of rows) {
      const t = (r.tipe || 'buku').toLowerCase();
      if (t === 'bank') sum.bank += Number(r.jumlah) || 0;
      else sum.buku += Number(r.jumlah) || 0;
    }
    res.json({ period: period || 'all', count: rows.length, sum, selisih: sum.buku - sum.bank, rows });
  });
});

// =============================================================
// === MODULE 35: Backup & Restore data API ====================
// =============================================================
const fs = require('fs');
const pathMod = require('path');

router.post('/system/backup', requireRole(ADMIN_ONLY_WRITE), (req, res) => {
  const dbPath = pathMod.join(__dirname, '..', 'perumda_ledger.db');
  const backupDir = pathMod.join(__dirname, '..', 'backups');
  try {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${ts}.db`;
    const dest = pathMod.join(backupDir, filename);
    fs.copyFileSync(dbPath, dest);
    const stat = fs.statSync(dest);
    db.run(
      'INSERT INTO backups (filename, size_bytes, created_by, notes) VALUES (?, ?, ?, ?)',
      [filename, stat.size, getRole(req), req.body && req.body.notes ? req.body.notes : null],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logAudit({ entity: 'backup', entityId: filename, action: 'CREATE', actorRole: getRole(req), after: { filename, size: stat.size } });
        res.status(201).json({ id: this.lastID, filename, size_bytes: stat.size, path: dest });
      }
    );
  } catch (e) {
    res.status(500).json({ error: e.message, code: 'BACKUP_FAILED' });
  }
});

router.post('/system/restore/:filename', requireRole(ADMIN_ONLY_WRITE), (req, res) => {
  // Restore is destructive — for safety we only validate the file exists; actual swap requires server restart.
  const filename = req.params.filename;
  if (!/^backup_[\w.\-]+\.db$/.test(filename)) {
    return res.status(400).json({ error: 'Format filename backup tidak valid', code: 'VALIDATION_FAILED' });
  }
  const backupDir = pathMod.join(__dirname, '..', 'backups');
  const src = pathMod.join(backupDir, filename);
  if (!fs.existsSync(src)) {
    return res.status(404).json({ error: 'File backup tidak ditemukan', code: 'NOT_FOUND' });
  }
  logAudit({ entity: 'backup', entityId: filename, action: 'RESTORE_REQUEST', actorRole: getRole(req) });
  res.json({ filename, validated: true, message: 'Backup file valid; lakukan restart server untuk menyelesaikan restore' });
});

// =============================================================
// === LEGACY READ HELPERS (export + detail) ===================
// =============================================================
// The original /piutang, /hutang, /assets, etc. handlers only expose list +
// create + (sometimes) update + delete. UAT modules 20/23/25/29/30/32 need
// detail (`GET /:id`) and export (`GET /export`) endpoints. Add them here
// for every legacy resource using a uniform mapping.

const _LEGACY_TABLE_MAP = {
  piutang: { table: 'piutang', pk: 'id' },
  hutang: { table: 'hutang', pk: 'id' },
  assets: { table: 'assets', pk: 'kode' },
  inventory: { table: 'inventory', pk: 'kode' },
  bbm: { table: 'bbm', pk: 'id' },
  giro: { table: 'giro', pk: 'id' },
  pelanggan: { table: 'pelanggan', pk: 'id' },
  supplier: { table: 'supplier', pk: 'id' },
  efaktur: { table: 'efaktur', pk: 'id' },
  'sales-orders': { table: 'sales_orders', pk: 'id' },
  'purchase-orders': { table: 'purchase_orders', pk: 'id' },
  rekonsiliasi: { table: 'rekonsiliasi', pk: 'id' },
  anggaran: { table: 'anggaran', pk: 'kode' },
};

for (const [resource, meta] of Object.entries(_LEGACY_TABLE_MAP)) {
  // /export → list (RBAC handled by upstream middleware)
  router.get(`/${resource}/export`, (req, res) => {
    db.all(`SELECT * FROM ${meta.table}`, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });
  // /:id → detail
  router.get(`/${resource}/:id`, (req, res) => {
    db.get(`SELECT * FROM ${meta.table} WHERE ${meta.pk} = ?`, [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: `${resource} tidak ditemukan`, code: 'NOT_FOUND' });
      res.json(row);
    });
  });
}

// Some legacy resources don't have a PUT handler. Register a generic PUT for them.
const _LEGACY_NEEDS_PUT = ['inventory', 'bbm', 'efaktur'];
for (const resource of _LEGACY_NEEDS_PUT) {
  const meta = _LEGACY_TABLE_MAP[resource];
  router.put(`/${resource}/:id`, (req, res) => {
    db.get(`SELECT * FROM ${meta.table} WHERE ${meta.pk} = ?`, [req.params.id], (selErr, before) => {
      if (selErr) return res.status(500).json({ error: selErr.message });
      if (!before) return res.status(404).json({ error: `${resource} tidak ditemukan`, code: 'NOT_FOUND' });
      const cols = Object.keys(before).filter((c) => c !== meta.pk && c in (req.body || {}));
      if (cols.length === 0) return res.status(400).json({ error: 'Tidak ada field yang bisa diupdate', code: 'VALIDATION_FAILED' });
      const sets = cols.map((c) => `${c} = ?`).join(', ');
      const vals = cols.map((c) => req.body[c]);
      db.run(
        `UPDATE ${meta.table} SET ${sets} WHERE ${meta.pk} = ?`,
        [...vals, req.params.id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          logAudit({ entity: resource, entityId: req.params.id, action: 'UPDATE', actorRole: getRole(req), before, after: req.body });
          res.json({ [meta.pk]: req.params.id, ...req.body });
        }
      );
    });
  });
}

// =============================================================
// === MODULE 36: roles whoami (check current role) ============
// =============================================================
router.get('/whoami', (req, res) => {
  const role = (req.headers['x-user-role'] || '').toString().trim().toLowerCase() || null;
  res.json({ role, authenticated: !!role });
});

// =============================================================
// === REFERENCE REPORT DATA (Neraca & Arus Kas from Excel) ====
// =============================================================
router.get('/reports/ref-neraca', (req, res) => {
  const { period } = req.query || {};
  if (!period) return res.status(400).json({ error: 'period required (YYYY-MM)' });
  db.all('SELECT * FROM report_neraca WHERE period = ? ORDER BY sort_order', [period], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/reports/ref-arus-kas', (req, res) => {
  const { period } = req.query || {};
  if (!period) return res.status(400).json({ error: 'period required (YYYY-MM)' });
  db.all('SELECT * FROM report_arus_kas WHERE period = ? ORDER BY sort_order', [period], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/reports/ref-laba-rugi', (req, res) => {
  const { period } = req.query || {};
  if (!period) return res.status(400).json({ error: 'period required (YYYY-MM)' });
  db.all('SELECT * FROM report_laba_rugi WHERE period = ? ORDER BY sort_order', [period], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

module.exports = router;
