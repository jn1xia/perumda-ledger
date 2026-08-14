// ── AUTOMATIC BACKUP ─────────────────────────────────────────────────────────
// Until now the only way a backup ever happened was somebody pressing the button
// in Pengaturan (POST /system/backup). Nothing scheduled one, so the live ledger
// could go weeks with no copy at all.
//
// Scheduling here has to work around how the app is hosted. fly.toml sets
// `auto_stop_machines = true` with `min_machines_running = 0`, so the VM is shut
// down whenever nobody is using the app — a plain daily timer would simply never
// fire on a quiet day. What does reliably happen is that the machine boots the
// first time somebody opens the app. So the trigger is:
//
//   • shortly after boot, if today has no backup yet, and
//   • every BACKUP_INTERVAL_HOURS while the process happens to stay alive.
//
// Net effect: every day the app is used gets exactly one backup, and a day
// nobody touches it needs none (the data cannot have changed).
//
// NOTE ON OFF-SITE COPIES. Backups land in BACKUP_DIR, which defaults to a
// folder on the SAME Fly volume as the live database — that protects against a
// bad write or a wrong import, but NOT against losing the volume. Point
// BACKUP_DIR at a second mount, or add an upload step here, to survive that.

const fs = require('fs');
const pathMod = require('path');
const db = require('./database.cjs');

const BOOT_DELAY_MS = 30 * 1000;                                          // let the app finish starting
const INTERVAL_HOURS = parseFloat(process.env.BACKUP_INTERVAL_HOURS || '24');
const KEEP = parseInt(process.env.BACKUP_KEEP || '14', 10);

function liveDbPath() {
  return db.DB_PATH || pathMod.join(__dirname, '..', 'perumda_ledger.db');
}
function backupDir() {
  return process.env.BACKUP_DIR || pathMod.join(pathMod.dirname(liveDbPath()), 'backups');
}

/** Newest-first list of backup files currently on disk. */
function listBackups() {
  const dir = backupDir();
  try {
    return fs.readdirSync(dir)
      .filter(f => /^backup_[\w.\-]+\.db$/.test(f))
      .map(f => ({ f, mtime: fs.statSync(pathMod.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch (_) {
    return [];
  }
}

/** Drop everything past the newest KEEP files so the volume cannot fill up. */
function rotate() {
  for (const { f } of listBackups().slice(KEEP)) {
    try { fs.unlinkSync(pathMod.join(backupDir(), f)); } catch (_) { /* already gone */ }
    db.run('DELETE FROM backups WHERE filename = ?', [f], () => {});
  }
}

/** True when a backup file was already written today (local time). */
function hasBackupToday() {
  const today = new Date().toDateString();
  return listBackups().some(b => new Date(b.mtime).toDateString() === today);
}

/**
 * Copy the live database into BACKUP_DIR and record it in the `backups` table.
 * Resolves with the row info, or null when skipped because today already has one.
 */
function runBackup({ force = false, notes = 'otomatis' } = {}) {
  return new Promise((resolve) => {
    try {
      if (!force && hasBackupToday()) return resolve(null);
      const dir = backupDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
      const dest = pathMod.join(dir, filename);
      fs.copyFileSync(liveDbPath(), dest);
      const size = fs.statSync(dest).size;
      db.run(
        'INSERT INTO backups (filename, size_bytes, created_by, notes) VALUES (?, ?, ?, ?)',
        [filename, size, 'system', notes],
        (err) => {
          if (err) console.error('[backup] tercatat gagal:', err.message);
          rotate();
          console.log(`[backup] ${filename} (${(size / 1048576).toFixed(1)} MB)`);
          resolve({ filename, size_bytes: size, path: dest });
        }
      );
    } catch (e) {
      console.error('[backup] GAGAL:', e.message);
      resolve(null);
    }
  });
}

/** Arm the boot-time and interval backups. Safe to call once at startup. */
function startAutoBackup() {
  if (process.env.DISABLE_AUTO_BACKUP === '1') {
    console.log('[backup] otomatis dimatikan (DISABLE_AUTO_BACKUP=1)');
    return;
  }
  const boot = setTimeout(() => { runBackup({ notes: 'otomatis (saat start)' }); }, BOOT_DELAY_MS);
  if (boot.unref) boot.unref();

  const every = setInterval(() => { runBackup({ notes: 'otomatis (berkala)' }); },
    Math.max(1, INTERVAL_HOURS) * 3600 * 1000);
  if (every.unref) every.unref();

  console.log(`[backup] otomatis aktif — saat start, lalu tiap ${INTERVAL_HOURS} jam, simpan ${KEEP} terbaru`);
}

module.exports = { startAutoBackup, runBackup, listBackups, hasBackupToday, backupDir, rotate };
