// Simple audit-trail helper.
//
// Writes one row per CRUD action on master/transaction tables.
// Schema is created lazily on first call so we don't need to touch
// the main schema bootstrap.

const db = require('./database.cjs');

let initialized = false;

function ensureTable(cb) {
  if (initialized) return cb && cb();
  db.run(
    `CREATE TABLE IF NOT EXISTS audit_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       entity TEXT NOT NULL,
       entity_id TEXT,
       action TEXT NOT NULL,
       actor_role TEXT,
       before_json TEXT,
       after_json TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
     )`,
    (err) => {
      if (!err) initialized = true;
      cb && cb(err);
    }
  );
}

function logAudit({ entity, entityId, action, actorRole, before, after }) {
  ensureTable(() => {
    db.run(
      `INSERT INTO audit_log (entity, entity_id, action, actor_role, before_json, after_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entity,
        entityId == null ? null : String(entityId),
        action,
        actorRole || null,
        before == null ? null : JSON.stringify(before),
        after == null ? null : JSON.stringify(after),
      ],
      (err) => {
        if (err) console.error('[audit_log] insert failed:', err.message);
      }
    );
  });
}

module.exports = { logAudit, ensureTable };
