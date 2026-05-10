const db = require('../db/database.cjs');

let cache = {};

// Atomically increment and return the next value for a counter key
// Uses a single upsert statement: inserts 1 if missing, otherwise increments and returns new value
function next(key) {
  return new Promise((resolve, reject) => {
    db.get(
      `INSERT INTO counters (key, value) VALUES (?, 1)
       ON CONFLICT(key) DO UPDATE SET value = value + 1
       RETURNING value`,
      [key],
      (err, row) => {
        if (err) return reject(err);
        cache[key] = row.value;
        resolve(row.value);
      }
    );
  });
}

// Read current counter value without incrementing (for display)
function getCurrent(key) {
  return new Promise((resolve, reject) => {
    if (cache[key] !== undefined) {
      return resolve(cache[key]);
    }
    db.get("SELECT value FROM counters WHERE key = ?", [key], (err, row) => {
      if (err) return reject(err);
      const val = row ? row.value : 1;
      cache[key] = val;
      resolve(val);
    });
  });
}

module.exports = { next, getCurrent };
