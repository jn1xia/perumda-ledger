// Sub Akun list for daily bookkeeping: every (account, Sub Akun) pair used in
// the journals so far. Idempotent (INSERT OR IGNORE on UNIQUE(account_code,
// name)); runs at every start and from Data Induk ("Muat dari jurnal"). A
// renamed or deactivated Sub Akun keeps a row (an old name as source
// 'diganti', inactive), so the seed never brings it back.
// A Sub Akun equal to its account name is the account itself, not a Sub Akun.
const db = require('./database.cjs');

function seedSubAkun() {
  return new Promise((resolve) => {
    db.run(
      `INSERT OR IGNORE INTO sub_akun (account_code, name, source, active)
       SELECT DISTINCT TRIM(akun_code), TRIM(sub_akun), 'jurnal', 1
         FROM journal_lines
        WHERE TRIM(COALESCE(sub_akun, '')) <> ''
          AND TRIM(COALESCE(akun_code, '')) <> ''
          AND TRIM(sub_akun) <> TRIM(COALESCE(akun_name, ''))`,
      function (err) {
        if (err) {
          console.error('[sub_akun] seed failed:', err.message);
          return resolve(0);
        }
        resolve(this.changes || 0);
      }
    );
  });
}

module.exports = { seedSubAkun };
