// Generic CRUD resource handler.
//
// Mounts a uniform set of REST endpoints for a single SQLite table that
// satisfies the standard 10-TC pattern used by Modules 13-36:
//
//   POST   /<resource>           → create (P1)        → 201 + audit_log
//   GET    /<resource>           → list+filter (P2)   → 200
//   GET    /<resource>/export    → bulk export (P3)   → 200 [array]
//   GET    /<resource>/:id       → drill-down (P4)    → 200 / 404
//   PUT    /<resource>/:id       → update (P5)        → 200 + audit_log
//   DELETE /<resource>/:id       → delete (N3)        → 200 / 409 if in use
//
// Negatives:
//   N1 duplicate              → 409 (UNIQUE constraint)
//   N2 missing required field → 400 (validateRequired)
//   N3 delete-in-use          → 409 (refCheck)
//   N4 negative numeric       → 400 (numericFields)
//   N5 unauthorized role      → 401 / 403 (RBAC middleware)
//
// Usage (see api.cjs):
//   mountResource(router, {
//     name: 'jenis-jurnal', table: 'jenis_jurnal', pkField: 'prefix',
//     readRoles: [...], writeRoles: [...],
//     requiredFields: ['prefix','nama'],
//     numericFields: ['next_value'],
//     refCheck: (id) => db.get(`SELECT COUNT(*)... FROM journals WHERE bukti LIKE ?`, [`${id}%`]),
//   });

const db = require('../db/database.cjs');
const { requireRole, getRole } = require('./auth.cjs');
const { logAudit } = require('../db/auditLog.cjs');
const { validateRequired, mapSqliteError } = require('./validators.cjs');

function mountResource(router, opts) {
  const {
    name,
    table,
    pkField = 'id',
    readRoles,
    writeRoles,
    requiredFields = [],
    numericFields = [],
    refCheck = null,
    /** Generate a new PK when client doesn't supply one. async (req)=>string */
    generatePk = null,
    /** Map row → public response (e.g. parse JSON columns) */
    serialize = (row) => row,
    orderBy = null,
  } = opts;

  if (!name || !table) {
    throw new Error('mountResource requires {name, table}');
  }

  function validateNumericFields(body) {
    for (const f of numericFields) {
      if (body[f] === undefined || body[f] === null || body[f] === '') continue;
      const n = Number(body[f]);
      if (!Number.isFinite(n)) {
        return `Field "${f}" harus berupa angka`;
      }
      if (n < 0) {
        return `Field "${f}" tidak boleh negatif`;
      }
      if (Math.abs(n) > 1e15) {
        return `Field "${f}" melebihi batas wajar`;
      }
    }
    return null;
  }

  function pickColumns(body, allowed) {
    const out = {};
    for (const k of Object.keys(body || {})) {
      if (allowed.has(k)) out[k] = body[k];
    }
    return out;
  }

  // --- LIST ---
  router.get(`/${name}`, requireRole(readRoles), (req, res) => {
    const order = orderBy ? ` ORDER BY ${orderBy}` : '';
    const filters = [];
    const params = [];
    // Generic LIKE-search via ?q=
    if (req.query && req.query.q) {
      const like = `%${req.query.q}%`;
      filters.push(`(${requiredFields.map((f) => `${f} LIKE ?`).join(' OR ') || '0=1'})`);
      requiredFields.forEach(() => params.push(like));
    }
    const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
    db.all(`SELECT * FROM ${table}${where}${order}`, params, (err, rows) => {
      if (err) {
        const m = mapSqliteError(err, `pembacaan ${name}`);
        return res.status(m.status).json(m.body);
      }
      res.json(rows.map(serialize));
    });
  });

  // --- EXPORT (alias of list, but always returns array even if filtered) ---
  router.get(`/${name}/export`, requireRole(readRoles), (req, res) => {
    db.all(`SELECT * FROM ${table}${orderBy ? ' ORDER BY ' + orderBy : ''}`, [], (err, rows) => {
      if (err) {
        const m = mapSqliteError(err, `export ${name}`);
        return res.status(m.status).json(m.body);
      }
      res.json(rows.map(serialize));
    });
  });

  // --- DETAIL ---
  router.get(`/${name}/:id`, requireRole(readRoles), (req, res) => {
    db.get(`SELECT * FROM ${table} WHERE ${pkField} = ?`, [req.params.id], (err, row) => {
      if (err) {
        const m = mapSqliteError(err, `pencarian ${name}`);
        return res.status(m.status).json(m.body);
      }
      if (!row) return res.status(404).json({ error: `${name} tidak ditemukan`, code: 'NOT_FOUND' });
      res.json(serialize(row));
    });
  });

  // --- CREATE ---
  router.post(`/${name}`, requireRole(writeRoles), async (req, res) => {
    const body = req.body || {};

    const reqErr = validateRequired(requiredFields, body);
    if (reqErr) return res.status(400).json({ error: reqErr, code: 'VALIDATION_FAILED' });

    const numErr = validateNumericFields(body);
    if (numErr) return res.status(400).json({ error: numErr, code: 'VALIDATION_FAILED' });

    // Auto-generate PK if missing
    let pkValue = body[pkField];
    if (!pkValue) {
      if (generatePk) {
        try { pkValue = await generatePk(req); body[pkField] = pkValue; }
        catch (e) { return res.status(500).json({ error: e.message, code: 'PK_GEN_FAILED' }); }
      } else if (pkField !== 'id') {
        return res.status(400).json({ error: `Field "${pkField}" wajib diisi`, code: 'VALIDATION_FAILED' });
      }
    }

    const cols = Object.keys(body);
    if (cols.length === 0) return res.status(400).json({ error: 'Body kosong', code: 'VALIDATION_FAILED' });
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map((k) => body[k]);

    db.run(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
      values,
      function (err) {
        if (err) {
          const m = mapSqliteError(err, `penambahan ${name}`);
          return res.status(m.status).json(m.body);
        }
        const created = { ...body };
        if (pkField === 'id' && !created.id) created.id = this.lastID;
        logAudit({ entity: name, entityId: created[pkField], action: 'CREATE', actorRole: getRole(req), after: created });
        res.status(201).json(created);
      }
    );
  });

  // --- UPDATE ---
  router.put(`/${name}/:id`, requireRole(writeRoles), (req, res) => {
    const body = req.body || {};
    const numErr = validateNumericFields(body);
    if (numErr) return res.status(400).json({ error: numErr, code: 'VALIDATION_FAILED' });

    db.get(`SELECT * FROM ${table} WHERE ${pkField} = ?`, [req.params.id], (selErr, before) => {
      if (selErr) {
        const m = mapSqliteError(selErr, `pencarian ${name}`);
        return res.status(m.status).json(m.body);
      }
      if (!before) return res.status(404).json({ error: `${name} tidak ditemukan`, code: 'NOT_FOUND' });

      // Build the SET clause from the columns that exist on the row + were provided in body.
      const updatableCols = Object.keys(before).filter((k) => k !== pkField && k in body);
      if (updatableCols.length === 0) {
        return res.status(400).json({ error: 'Tidak ada field yang bisa diupdate', code: 'VALIDATION_FAILED' });
      }

      // Required fields (when provided as empty) must not blank out.
      for (const f of requiredFields) {
        if (f in body && (body[f] === null || body[f] === undefined || (typeof body[f] === 'string' && !body[f].trim()))) {
          return res.status(400).json({ error: `Field "${f}" wajib diisi`, code: 'VALIDATION_FAILED' });
        }
      }

      const setSql = updatableCols.map((c) => `${c} = ?`).join(', ');
      const values = updatableCols.map((c) => body[c]);

      db.run(
        `UPDATE ${table} SET ${setSql} WHERE ${pkField} = ?`,
        [...values, req.params.id],
        function (err) {
          if (err) {
            const m = mapSqliteError(err, `perubahan ${name}`);
            return res.status(m.status).json(m.body);
          }
          const after = { [pkField]: req.params.id, ...body };
          logAudit({ entity: name, entityId: req.params.id, action: 'UPDATE', actorRole: getRole(req), before, after });
          res.json(after);
        }
      );
    });
  });

  // --- DELETE (with optional in-use check) ---
  router.delete(`/${name}/:id`, requireRole(writeRoles), (req, res) => {
    db.get(`SELECT * FROM ${table} WHERE ${pkField} = ?`, [req.params.id], async (selErr, row) => {
      if (selErr) {
        const m = mapSqliteError(selErr, `pencarian ${name}`);
        return res.status(m.status).json(m.body);
      }
      if (!row) return res.status(404).json({ error: `${name} tidak ditemukan`, code: 'NOT_FOUND' });

      if (refCheck) {
        try {
          const used = await refCheck(req.params.id);
          if (used && used.count > 0) {
            return res.status(409).json({
              error: `${name} masih digunakan (${used.count} ${used.label || 'referensi'}), tidak bisa dihapus`,
              code: 'REF_INTEGRITY',
              count: used.count,
            });
          }
        } catch (e) {
          return res.status(500).json({ error: e.message, code: 'REF_CHECK_FAILED' });
        }
      }

      db.run(`DELETE FROM ${table} WHERE ${pkField} = ?`, [req.params.id], function (err) {
        if (err) {
          const m = mapSqliteError(err, `penghapusan ${name}`);
          return res.status(m.status).json(m.body);
        }
        logAudit({ entity: name, entityId: req.params.id, action: 'DELETE', actorRole: getRole(req), before: row });
        res.json({ deleted: true, [pkField]: req.params.id });
      });
    });
  });
}

module.exports = { mountResource };
