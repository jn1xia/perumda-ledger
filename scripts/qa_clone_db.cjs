#!/usr/bin/env node
/**
 * qa_clone_db.cjs
 *
 * Seeds the local QA database from the current local dev database so QA testing
 * starts as an exact, ISOLATED copy of your known-good local data. Nothing here
 * touches production (Fly) — it only operates on files under server/.
 *
 * Source:  server/perumda_ledger.db        (your local dev DB)
 * Target:  server/perumda_ledger.qa.db      (the QA DB, used by `npm run qa:*`)
 *
 * Copies the SQLite main file plus its -wal / -shm sidecars (if present) so any
 * pending WAL data is preserved and SQLite can recover cleanly.
 *
 * Usage:
 *   node scripts/qa_clone_db.cjs            # clone only if QA DB is missing
 *   node scripts/qa_clone_db.cjs --force    # overwrite an existing QA DB
 */

const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const SRC = path.join(SERVER_DIR, 'perumda_ledger.db');
const DST = path.join(SERVER_DIR, 'perumda_ledger.qa.db');
const force = process.argv.includes('--force');

const SIDE = ['', '-wal', '-shm'];

function copyIfExists(srcBase, dstBase) {
  let copied = 0;
  for (const ext of SIDE) {
    const s = srcBase + ext;
    const d = dstBase + ext;
    if (fs.existsSync(s)) {
      fs.copyFileSync(s, d);
      copied++;
    } else if (fs.existsSync(d)) {
      // Remove a stale sidecar so the QA DB isn't left in an inconsistent state
      fs.unlinkSync(d);
    }
  }
  return copied;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('❌ Source DB not found:', SRC);
    console.error('   Run the app locally once (npm run server) to create it,');
    console.error('   or the QA server will seed a fresh DB on first boot.');
    process.exit(1);
  }

  if (fs.existsSync(DST) && !force) {
    console.log('ℹ️  QA DB already exists:', DST);
    console.log('   Use `npm run qa:db:reset` (or add --force) to overwrite it.');
    return;
  }

  const n = copyIfExists(SRC, DST);
  console.log(`✅ QA DB seeded from local dev DB (${n} file(s) copied)`);
  console.log('   Target:', DST);
}

main();
