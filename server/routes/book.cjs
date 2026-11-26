// /api/book — daily bookkeeping: vouchers typed in the app and the Sub Akun list.
//
// A voucher is a journal row with voucher_type set (KK/KM/BK/BM/JM), status
// draft → pending (diajukan) → posted, or pending → returned → pending.
// Validation and the posted journal come from src/utils/voucherRules.js — the
// same module the Input Voucher form uses — so the server refuses exactly what
// the form shows. Posting is inside Keuangan (RBAC.BOOK_APPROVE) whatever the
// amount; from Rp 1 jt the author must tick that the paper voucher is signed.
// Spec: docs/superpowers/specs/2026-11-25-daily-bookkeeping-plan.md §5.3–§5.4.
const express = require('express');
const db = require('../db/database.cjs');
const counters = require('./counters.cjs');
const { requireRole, getRole, getUser } = require('../middleware/auth.cjs');
const { logAudit } = require('../db/auditLog.cjs');
const { dateToPeriod } = require('../middleware/validators.cjs');
const RBAC = require('../config/rbac.cjs');
const { seedSubAkun } = require('../db/subAkunSeed.cjs');

const router = express.Router();

let rulesPromise = null;
const rules = () => (rulesPromise = rulesPromise || import('../../src/utils/voucherRules.js'));

const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r || []))));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { return e ? rej(e) : res(this); }));

const PRIVILEGED = new Set(['admin', 'super_admin']);
const actorOf = (req) => {
  const u = getUser(req) || {};
  return { username: u.username || null, role: u.role || getRole(req) };
};
const isBookApprover = (role) => RBAC.BOOK_APPROVE.includes(role);
const yearOfDate = (t) => { const m = /^(\d{4})-\d{2}-\d{2}$/.exec(String(t || '')); return m ? Number(m[1]) : null; };
const DUP_RE = /UNIQUE constraint failed: journals\.voucher_year, journals\.voucher_no/i;

/**
 * What voucherProblems needs, read from the database. Also loads the Sub Akun
 * overrides ("Ikut baris laporan akun") into the shared rules, as the browser
 * does, so a line that takes its report line from its Sub Akun is accepted
 * here exactly as the form shows it.
 */
async function checkContext(year, excludeId) {
  const [coa, subs, locks, used, start] = await Promise.all([
    all('SELECT code, name FROM coa'),
    all('SELECT account_code, name, report_code, active FROM sub_akun WHERE active = 1'),
    all('SELECT period FROM locked_periods'),
    all("SELECT voucher_no FROM journals WHERE voucher_year = ? AND voucher_no IS NOT NULL AND voucher_no <> '' AND id <> ?", [year, excludeId || '']),
    get("SELECT value FROM pengaturan WHERE key = 'pembukuan_harian_mulai'").catch(() => null),
  ]);
  let startSetting = null;
  try { startSetting = start ? JSON.parse(start.value) : null; } catch { startSetting = start ? start.value : null; }
  const R = await rules();
  const names = new Map(coa.map(r => [String(r.code), r.name || '']));
  const subAkunByCode = new Map();
  for (const s of subs) {
    const k = String(s.account_code);
    if (!subAkunByCode.has(k)) subAkunByCode.set(k, []);
    subAkunByCode.get(k).push(s.name);
  }
  const coaName = (c) => names.get(String(c)) || '';
  const startDate = R.dailyBookStart({ pembukuan_harian_mulai: startSetting });
  R.setSubAkunOverrides(subs, coaName, startDate);
  return {
    coaCodes: new Set(names.keys()),
    coaName,
    subAkunByCode,
    lockedPeriods: locks.map(r => r.period),
    usedNos: used.map(r => r.voucher_no),
    startDate,
  };
}

async function duplicateProblem(no, year, excludeId) {
  const R = await rules();
  const used = (await checkContext(year, excludeId)).usedNos;
  return [{ field: 'voucher_no', message: `No. Bukti ${no} sudah dipakai. Nomor berikutnya yang kosong: ${R.nextVoucherNo(used)}.`, blocking: true }];
}

async function writeLines(journalId, j) {
  await run('DELETE FROM journal_lines WHERE journal_id = ?', [journalId]);
  let i = 0;
  for (const l of j.lines) {
    await run(`INSERT INTO journal_lines
      (journal_id, line_order, tanggal, bukti, akun_code, akun_name, sub_akun, debit, kredit, keterangan, kategori)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [journalId, i++, j.tanggal, j.bukti, l.akun_code, l.akun_name, l.sub_akun || '', l.debit, l.kredit, l.keterangan || '', l.kategori || null]);
  }
}

const voucherRow = (id) => get('SELECT * FROM journals WHERE id = ? AND voucher_type IS NOT NULL', [id]);
const isLocked = async (tanggal) => !!(await get('SELECT 1 AS x FROM locked_periods WHERE period = ?', [dateToPeriod(tanggal)]));
const fail = (res, status, code, error, extra = {}) => res.status(status).json({ error, code, ...extra });

// ── Vouchers ────────────────────────────────────────────────────────────────

router.get('/next-voucher-no', requireRole(RBAC.JOURNAL_WRITE), async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const R = await rules();
    const used = (await checkContext(year)).usedNos;
    res.json({ year, next: R.nextVoucherNo(used) });
  } catch (e) { fail(res, 500, 'SERVER_ERROR', e.message); }
});

router.post('/vouchers', requireRole(RBAC.JOURNAL_WRITE), async (req, res) => {
  const body = req.body || {};
  const year = yearOfDate(body.tanggal);
  try {
    const R = await rules();
    const ctx = await checkContext(year);
    const problems = R.voucherProblems(body, ctx);
    if (problems.length) return fail(res, 400, 'VOUCHER_INVALID', problems[0].message, { problems });
    const j = R.buildVoucherJournal(body, { coaName: ctx.coaName });
    const seq = await counters.next(`nextVoucher${year}`);
    const id = `VC-${year}-${String(seq).padStart(4, '0')}`;
    const actor = actorOf(req);
    const status = body.submit ? 'pending' : 'draft';
    try {
      await run(`INSERT INTO journals
        (id, tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti, lines, tipe_transaksi, baseline, created_by, updated_at,
         voucher_type, voucher_no, voucher_year, party, cash_account, submitted_at, sop_signed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)`,
      [id, j.tanggal, j.keterangan, j.debit, j.kredit, status, j.akun_debit, j.akun_kredit, j.bukti, JSON.stringify(j.lines), j.tipe_transaksi,
        actor.username, j.voucher_type, j.voucher_no, j.voucher_year, j.party, j.cash_account, body.submit ? new Date().toISOString() : null, j.sop_signed]);
    } catch (e) {
      if (DUP_RE.test(e.message)) {
        const p = await duplicateProblem(j.voucher_no, year);
        return fail(res, 400, 'VOUCHER_INVALID', p[0].message, { problems: p });
      }
      throw e;
    }
    await writeLines(id, j);
    logAudit({ entity: 'voucher', entityId: id, action: 'CREATE', actorRole: actor.role, actorUser: actor.username, after: { ...j, status } });
    res.status(201).json({ id, status, ...j });
  } catch (e) { fail(res, 500, 'SERVER_ERROR', e.message); }
});

/** The author, a Keuangan approver or admin may change a draft or returned voucher. */
function mayEdit(row, actor) {
  if (PRIVILEGED.has(actor.role) || isBookApprover(actor.role)) return true;
  return !!actor.username && row.created_by === actor.username;
}

router.put('/vouchers/:id', requireRole(RBAC.JOURNAL_WRITE), async (req, res) => {
  const body = req.body || {};
  try {
    const row = await voucherRow(req.params.id);
    if (!row) return fail(res, 404, 'NOT_FOUND', 'Voucher tidak ditemukan');
    const actor = actorOf(req);
    if (!['draft', 'returned'].includes(row.status)) return fail(res, 409, 'NOT_EDITABLE', 'Voucher sudah diajukan atau diposting, tidak bisa diubah.');
    if (!mayEdit(row, actor)) return fail(res, 403, 'FORBIDDEN', 'Hanya penginput, SPV atau Manajer Keuangan yang bisa mengubah voucher ini.');
    if (await isLocked(row.tanggal)) return fail(res, 409, 'PERIOD_LOCKED', `Periode ${dateToPeriod(row.tanggal)} sudah dikunci.`);
    const year = yearOfDate(body.tanggal);
    const R = await rules();
    const ctx = await checkContext(year, row.id);
    const problems = R.voucherProblems(body, ctx);
    if (problems.length) return fail(res, 400, 'VOUCHER_INVALID', problems[0].message, { problems });
    const j = R.buildVoucherJournal(body, { coaName: ctx.coaName });
    const status = body.submit ? 'pending' : row.status;
    try {
      await run(`UPDATE journals SET tanggal = ?, keterangan = ?, debit = ?, kredit = ?, status = ?, akun_debit = ?, akun_kredit = ?,
        bukti = ?, lines = ?, tipe_transaksi = ?, voucher_type = ?, voucher_no = ?, voucher_year = ?, party = ?, cash_account = ?,
        sop_signed = ?, submitted_at = ?, updated_at = datetime('now') WHERE id = ?`,
      [j.tanggal, j.keterangan, j.debit, j.kredit, status, j.akun_debit, j.akun_kredit, j.bukti, JSON.stringify(j.lines), j.tipe_transaksi,
        j.voucher_type, j.voucher_no, j.voucher_year, j.party, j.cash_account, j.sop_signed,
        body.submit ? new Date().toISOString() : row.submitted_at, row.id]);
    } catch (e) {
      if (DUP_RE.test(e.message)) {
        const p = await duplicateProblem(j.voucher_no, year, row.id);
        return fail(res, 400, 'VOUCHER_INVALID', p[0].message, { problems: p });
      }
      throw e;
    }
    await writeLines(row.id, j);
    logAudit({ entity: 'voucher', entityId: row.id, action: body.submit ? 'UPDATE_SUBMIT' : 'UPDATE', actorRole: actor.role, actorUser: actor.username, before: row, after: { ...j, status } });
    res.json({ id: row.id, status, ...j });
  } catch (e) { fail(res, 500, 'SERVER_ERROR', e.message); }
});

router.post('/vouchers/:id/submit', requireRole(RBAC.JOURNAL_WRITE), async (req, res) => {
  try {
    const row = await voucherRow(req.params.id);
    if (!row) return fail(res, 404, 'NOT_FOUND', 'Voucher tidak ditemukan');
    const actor = actorOf(req);
    if (!['draft', 'returned'].includes(row.status)) return fail(res, 409, 'NOT_EDITABLE', 'Voucher sudah diajukan atau diposting.');
    if (!mayEdit(row, actor)) return fail(res, 403, 'FORBIDDEN', 'Hanya penginput, SPV atau Manajer Keuangan yang bisa mengajukan voucher ini.');
    if (await isLocked(row.tanggal)) return fail(res, 409, 'PERIOD_LOCKED', `Periode ${dateToPeriod(row.tanggal)} sudah dikunci.`);
    await run("UPDATE journals SET status = 'pending', submitted_at = ?, updated_at = datetime('now') WHERE id = ?", [new Date().toISOString(), row.id]);
    logAudit({ entity: 'voucher', entityId: row.id, action: 'SUBMIT', actorRole: actor.role, actorUser: actor.username });
    res.json({ id: row.id, status: 'pending' });
  } catch (e) { fail(res, 500, 'SERVER_ERROR', e.message); }
});

router.post('/vouchers/:id/post', requireRole(RBAC.BOOK_APPROVE), async (req, res) => {
  try {
    const row = await voucherRow(req.params.id);
    if (!row) return fail(res, 404, 'NOT_FOUND', 'Voucher tidak ditemukan');
    const actor = actorOf(req);
    if (row.status !== 'pending') return fail(res, 409, 'NOT_PENDING', 'Hanya voucher yang diajukan yang bisa diposting.');
    if (await isLocked(row.tanggal)) return fail(res, 409, 'PERIOD_LOCKED', `Periode ${dateToPeriod(row.tanggal)} sudah dikunci.`);
    const R = await rules();
    // Your own voucher: a warning on record unless Pengaturan forbids it
    // (R.selfPostPolicy; admin / super_admin are never refused).
    const own = !!actor.username && row.created_by === actor.username;
    if (own && !PRIVILEGED.has(actor.role)) {
      const s = await get('SELECT value FROM pengaturan WHERE key = ?', [R.SELF_POST_KEY]).catch(() => null);
      let v = null;
      try { v = s ? JSON.parse(s.value) : null; } catch { v = s ? s.value : null; }
      if (R.selfPostPolicy({ [R.SELF_POST_KEY]: v }) === 'larang') {
        return fail(res, 403, 'SELF_APPROVAL_FORBIDDEN', 'Anda tidak dapat menyetujui voucher yang Anda buat sendiri (pemisahan tugas).');
      }
    }
    const amount = Math.max(Number(row.debit) || 0, Number(row.kredit) || 0);
    if (R.needsSignatureTick(amount, row.voucher_type) && !Number(row.sop_signed)) {
      return fail(res, 409, 'SOP_NOT_SIGNED', `Tanda tangan ${R.sopSigner(amount)} pada bukti fisik belum dikonfirmasi. Kembalikan ke penginput.`);
    }
    await run("UPDATE journals SET status = 'posted', approved_by = ?, approved_at = ?, updated_at = datetime('now') WHERE id = ?",
      [actor.username || actor.role, new Date().toISOString(), row.id]);
    logAudit({ entity: 'voucher', entityId: row.id, action: 'POST', actorRole: actor.role, actorUser: actor.username, ...(own ? { after: { self_approved: true } } : {}) });
    res.json({ id: row.id, status: 'posted', ...(own ? { warnings: [R.selfPostWarning(row.voucher_no, actor.username)] } : {}) });
  } catch (e) { fail(res, 500, 'SERVER_ERROR', e.message); }
});

router.post('/vouchers/:id/return', requireRole(RBAC.BOOK_APPROVE), async (req, res) => {
  try {
    const note = String((req.body && req.body.note) || '').trim();
    if (!note) return fail(res, 400, 'NOTE_REQUIRED', 'Catatan pengembalian wajib diisi.');
    const row = await voucherRow(req.params.id);
    if (!row) return fail(res, 404, 'NOT_FOUND', 'Voucher tidak ditemukan');
    if (row.status !== 'pending') return fail(res, 409, 'NOT_PENDING', 'Hanya voucher yang diajukan yang bisa dikembalikan.');
    const actor = actorOf(req);
    await run("UPDATE journals SET status = 'returned', returned_by = ?, returned_at = ?, returned_note = ?, updated_at = datetime('now') WHERE id = ?",
      [actor.username || actor.role, new Date().toISOString(), note, row.id]);
    logAudit({ entity: 'voucher', entityId: row.id, action: 'RETURN', actorRole: actor.role, actorUser: actor.username, after: { note } });
    res.json({ id: row.id, status: 'returned', returned_note: note });
  } catch (e) { fail(res, 500, 'SERVER_ERROR', e.message); }
});

router.delete('/vouchers/:id', requireRole(RBAC.JOURNAL_WRITE), async (req, res) => {
  try {
    const row = await voucherRow(req.params.id);
    if (!row) return fail(res, 404, 'NOT_FOUND', 'Voucher tidak ditemukan');
    const actor = actorOf(req);
    if (!['draft', 'returned'].includes(row.status)) return fail(res, 409, 'NOT_EDITABLE', 'Voucher sudah diajukan atau diposting, tidak bisa dihapus.');
    if (!PRIVILEGED.has(actor.role) && !(actor.username && row.created_by === actor.username)) {
      return fail(res, 403, 'FORBIDDEN', 'Hanya penginput yang bisa menghapus draf ini.');
    }
    if (await isLocked(row.tanggal)) return fail(res, 409, 'PERIOD_LOCKED', `Periode ${dateToPeriod(row.tanggal)} sudah dikunci.`);
    await run('DELETE FROM journal_lines WHERE journal_id = ?', [row.id]);
    await run('DELETE FROM journals WHERE id = ?', [row.id]);
    logAudit({ entity: 'voucher', entityId: row.id, action: 'DELETE', actorRole: actor.role, actorUser: actor.username, before: row });
    res.json({ deleted: true, id: row.id });
  } catch (e) { fail(res, 500, 'SERVER_ERROR', e.message); }
});

// ── Sub Akun list ───────────────────────────────────────────────────────────

router.get('/sub-akun', requireRole(RBAC.ALL_ROLES), async (req, res) => {
  try {
    res.json(await all('SELECT * FROM sub_akun ORDER BY account_code, name'));
  } catch (e) { fail(res, 500, 'SERVER_ERROR', e.message); }
});

const codeExists = async (code) => !!(await get('SELECT 1 AS x FROM coa WHERE code = ?', [String(code || '')]));

router.post('/sub-akun', requireRole(RBAC.COA_WRITE), async (req, res) => {
  try {
    const account = String((req.body && req.body.account_code) || '').trim();
    const name = String((req.body && req.body.name) || '').trim();
    const reportCode = String((req.body && req.body.report_code) || '').trim() || null;
    if (!account || !name) return fail(res, 400, 'VALIDATION_FAILED', 'Akun dan nama Sub Akun wajib diisi.');
    if (!(await codeExists(account))) return fail(res, 400, 'VALIDATION_FAILED', `Kode akun ${account} tidak ada di COA.`);
    if (reportCode && !(await codeExists(reportCode))) return fail(res, 400, 'VALIDATION_FAILED', `Kode akun ${reportCode} tidak ada di COA.`);
    const actor = actorOf(req);
    try {
      const r = await run("INSERT INTO sub_akun (account_code, name, report_code, active, source, updated_by, updated_at) VALUES (?, ?, ?, 1, 'manual', ?, datetime('now'))",
        [account, name, reportCode, actor.username || actor.role]);
      logAudit({ entity: 'sub_akun', entityId: String(r.lastID), action: 'CREATE', actorRole: actor.role, actorUser: actor.username, after: { account, name, reportCode } });
      res.status(201).json(await get('SELECT * FROM sub_akun WHERE id = ?', [r.lastID]));
    } catch (e) {
      if (/UNIQUE constraint failed/i.test(e.message)) return fail(res, 409, 'DUPLICATE_KEY', `Sub Akun "${name}" sudah ada di akun ${account}.`);
      throw e;
    }
  } catch (e) { fail(res, 500, 'SERVER_ERROR', e.message); }
});

router.put('/sub-akun/:id', requireRole(RBAC.COA_WRITE), async (req, res) => {
  try {
    const row = await get('SELECT * FROM sub_akun WHERE id = ?', [req.params.id]);
    if (!row) return fail(res, 404, 'NOT_FOUND', 'Sub Akun tidak ditemukan');
    const b = req.body || {};
    const name = b.name !== undefined ? String(b.name).trim() : row.name;
    const reportCode = b.report_code !== undefined ? (String(b.report_code || '').trim() || null) : row.report_code;
    const active = b.active !== undefined ? (b.active ? 1 : 0) : row.active;
    if (!name) return fail(res, 400, 'VALIDATION_FAILED', 'Nama Sub Akun wajib diisi.');
    if (reportCode && !(await codeExists(reportCode))) return fail(res, 400, 'VALIDATION_FAILED', `Kode akun ${reportCode} tidak ada di COA.`);
    const actor = actorOf(req);
    const renamed = name !== row.name;
    try {
      // Renaming back to a name this list keeps as an old name: that row goes.
      if (renamed) await run("DELETE FROM sub_akun WHERE account_code = ? AND name = ? AND active = 0 AND source = 'diganti'", [row.account_code, name]);
      await run("UPDATE sub_akun SET name = ?, report_code = ?, active = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?",
        [name, reportCode, active, actor.username || actor.role, row.id]);
    } catch (e) {
      if (/UNIQUE constraint failed/i.test(e.message)) return fail(res, 409, 'DUPLICATE_KEY', `Sub Akun "${name}" sudah ada di akun ${row.account_code}.`);
      throw e;
    }
    // The journals keep the old name, and the seed (every start, and "Muat dari
    // jurnal") adds every Sub Akun the journals use. An old name still in the
    // journals stays as an inactive row, so it does not come back as active.
    if (renamed) {
      const used = await get('SELECT 1 AS x FROM journal_lines WHERE TRIM(akun_code) = ? AND TRIM(sub_akun) = ? LIMIT 1', [row.account_code, row.name]);
      if (used) {
        await run("INSERT OR IGNORE INTO sub_akun (account_code, name, report_code, active, source, updated_by, updated_at) VALUES (?, ?, NULL, 0, 'diganti', ?, datetime('now'))",
          [row.account_code, row.name, actor.username || actor.role]);
      }
    }
    logAudit({ entity: 'sub_akun', entityId: String(row.id), action: 'UPDATE', actorRole: actor.role, actorUser: actor.username, before: row, after: { name, reportCode, active } });
    res.json(await get('SELECT * FROM sub_akun WHERE id = ?', [row.id]));
  } catch (e) { fail(res, 500, 'SERVER_ERROR', e.message); }
});

router.post('/sub-akun/seed', requireRole(RBAC.COA_WRITE), async (req, res) => {
  try {
    res.json({ added: await seedSubAkun() });
  } catch (e) { fail(res, 500, 'SERVER_ERROR', e.message); }
});

module.exports = router;
