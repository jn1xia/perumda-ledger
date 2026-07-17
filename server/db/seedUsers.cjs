// Seeds real user accounts with bcrypt password hashes.
//
// The app previously had NO real users — login was a client-side password check
// and the role came from a dropdown. This seeds one account per canonical role
// (username === role) so every role remains reachable for demo/QA, but now via
// real credentials. Every seeded account starts with must_change_password = 1.
//
// Idempotent:
//   • existing accounts are never overwritten (INSERT OR IGNORE)
//   • pre-existing rows with no password_hash are backfilled with the default
//     (so a production users table that predates auth becomes usable, with a
//     forced password change)
//
// Default password: env SEED_USER_PASSWORD, else 'perumda2026' (matches the old
// demo hint). All seeded accounts share it until first login forces a change.

const db = require('./database.cjs');
const bcrypt = require('bcryptjs');
const RBAC = require('../config/rbac.cjs');

function prettyName(role) {
  return role
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function seedUsers() {
  return new Promise((resolve) => {
    const password = process.env.SEED_USER_PASSWORD || 'perumda2026';
    // All seeded accounts share the same default password, so one hash suffices.
    const hash = bcrypt.hashSync(password, 10);
    const roles = Object.values(RBAC.ROLE); // canonical roles only

    db.serialize(() => {
      // Backfill any pre-existing rows that have no usable password.
      db.run(
        "UPDATE users SET password_hash = ?, must_change_password = 1 WHERE password_hash IS NULL OR password_hash = ''",
        [hash],
        (err) => { if (err) console.error('[seedUsers] backfill error:', err.message); }
      );

      const stmt = db.prepare(
        'INSERT OR IGNORE INTO users (username, nama, role, aktif, must_change_password, password_hash) VALUES (?, ?, ?, 1, 1, ?)'
      );
      roles.forEach((role) => stmt.run(role, prettyName(role), role, hash));
      stmt.finalize((err) => {
        if (err) console.error('[seedUsers] insert error:', err.message);
        db.get('SELECT COUNT(*) AS c FROM users', (e, row) => {
          const src = process.env.SEED_USER_PASSWORD ? 'env SEED_USER_PASSWORD' : "'perumda2026'";
          console.log(`Users ready: ${row ? row.c : '?'} accounts (default password ${src}, forced change on first login).`);
          resolve();
        });
      });
    });
  });
}

module.exports = { seedUsers };

// Allow standalone run: `node server/db/seedUsers.cjs`
if (require.main === module) {
  const { initDatabase } = require('./schema.cjs');
  initDatabase().then(seedUsers).then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
