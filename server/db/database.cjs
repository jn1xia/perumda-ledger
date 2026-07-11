const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'perumda_ledger.db');

// Create/connect to SQLite database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at', DB_PATH);
  }
});

// Enable foreign keys
db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");
});

module.exports = db;
// The resolved DB file location — backup/restore must use THIS path (on Fly the
// DB lives on the mounted volume via DB_PATH, not next to the source tree).
module.exports.DB_PATH = DB_PATH;
