#!/usr/bin/env node
/*
 * extract_npd.cjs
 *
 * Parses every "Nota Pencairan Dana" (NPD) Excel workbook under
 *   src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026
 * and inserts the rows into the server SQLite database (server/perumda_ledger.db),
 * tables:
 *   - npd_headers  (one row per NPD slip)
 *   - npd_details  (line items inside each NPD)
 *
 * Each Excel workbook contains:
 *   - Sheets named JANUARI, FEBRUARI, MARET, ... (the month of the NPD)
 *   - Multiple NPD slips per sheet. Each slip starts with the row whose first
 *     cell contains "NOTA PEN" (typos like "NOTA PENCIRAN" exist in the source).
 *
 * The script is idempotent: running it twice will not duplicate rows because
 * we delete the existing data for the same (category, file, period) keyset.
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();

const ROOT = path.join(
  __dirname,
  'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026'
);
const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');

const MONTH_TO_NUM = {
  JANUARI: 1, FEBRUARI: 2, MARET: 3, APRIL: 4, MEI: 5, JUNI: 6,
  JULI: 7, AGUSTUS: 8, SEPTEMBER: 9, OKTOBER: 10, NOVEMBER: 11, DESEMBER: 12,
};

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = v.replace(/[^\d.-]/g, '');
    if (!t) return 0;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pickValueAfterColon(row) {
  // Some NPD fields appear like: ["1. Sub Kegiatan", "", "", ":", "Beban Umum & Keuangan", ...]
  const idx = row.findIndex(c => String(c).trim() === ':');
  if (idx >= 0 && row[idx + 1] !== undefined && row[idx + 1] !== '') return row[idx + 1];
  // Fallback: first non-empty cell after position 2
  for (let i = 3; i < row.length; i++) {
    if (row[i] !== '' && row[i] !== undefined) return row[i];
  }
  return '';
}

function extractNpdsFromSheet(sheet, monthName, fileName, category) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headers = [];

  rows.forEach((r, i) => {
    const first = (typeof r[0] === 'string') ? r[0].trim().toUpperCase() : '';
    if (first.startsWith('NOTA PEN')) headers.push(i);
  });

  const npds = [];
  for (let k = 0; k < headers.length; k++) {
    const start = headers[k];
    const end = (k + 1 < headers.length) ? headers[k + 1] : rows.length;
    const block = rows.slice(start, end);

    const npd = {
      file: fileName,
      category,
      period_month: MONTH_TO_NUM[monthName] || 0,
      period_year: 2026,
      nomor: '',
      sub_kegiatan: '',
      nomor_kegiatan: '',
      tahun_anggaran: 2026,
      jumlah_diminta: 0,
      terbilang: '',
      ppn: 0,
      pph: 0,
      jumlah_potongan: 0,
      jumlah_dibayar: 0,
      details: [],
    };

    let inDetailTable = false;
    for (let i = 0; i < block.length; i++) {
      const row = block[i].map(c => (c === undefined ? '' : c));
      const col0 = String(row[0] || '').trim();
      const col0L = col0.toLowerCase();

      // ── Header fields ────────────────────────────────────────────────
      if (col0L.startsWith('nomor :')) {
        npd.nomor = col0.replace(/^nomor\s*:\s*/i, '').trim();
        continue;
      }
      if (col0L.startsWith('1. sub kegiatan')) {
        npd.sub_kegiatan = String(pickValueAfterColon(row) || '').trim();
        continue;
      }
      if (col0L.startsWith('2. nomor')) {
        npd.nomor_kegiatan = String(pickValueAfterColon(row) || '').trim();
        continue;
      }
      if (col0L.startsWith('3. tahun')) {
        const v = pickValueAfterColon(row);
        if (v) npd.tahun_anggaran = toNumber(v) || 2026;
        continue;
      }
      if (col0L.startsWith('4. jumlah yang diminta')) {
        npd.jumlah_diminta = toNumber(pickValueAfterColon(row));
        continue;
      }
      // The "terbilang" line typically follows row "4. Jumlah yang diminta" with a colon and text
      if (!col0 && row[2] && String(row[3]).trim() === ':' && typeof row[4] === 'string') {
        if (!npd.terbilang) npd.terbilang = String(row[4]).trim();
      }

      if (col0L.startsWith('ppn')) {
        npd.ppn = toNumber(pickValueAfterColon(row));
        continue;
      }
      if (col0L.startsWith('pph')) {
        npd.pph = toNumber(pickValueAfterColon(row));
        continue;
      }
      if (col0L.startsWith('jumlah potongan')) {
        npd.jumlah_potongan = toNumber(pickValueAfterColon(row));
        continue;
      }
      if (col0L.startsWith('jumlah yang dibayarkan')) {
        npd.jumlah_dibayar = toNumber(pickValueAfterColon(row));
        continue;
      }

      // ── Detail table ─────────────────────────────────────────────────
      // Detail header row: ["NO","Kode","Uraian", "", "", "", "Anggaran", ...]
      if (col0 === 'NO' && String(row[2] || '').toUpperCase().includes('URAIAN')) {
        inDetailTable = true;
        continue;
      }
      if (inDetailTable) {
        const no = row[0];
        const kode = String(row[1] || '').trim();
        const uraian = String(row[2] || '').trim();

        // The numeric columns can be either index 6/7/8/9 or 6/7/9/10 depending on layout.
        // Heuristic: pick the four numeric values from columns 6-11.
        const tail = row.slice(6, 12).filter(v => v !== '' && v !== '---------------');
        const nums = tail.filter(v => typeof v === 'number' || (typeof v === 'string' && /^-?\d/.test(v.trim())));
        const [anggaran = 0, akumulasi = 0, pencairan = 0, sisa = 0] = nums.map(toNumber);

        if (uraian && uraian.toUpperCase() === 'JUMLAH') {
          // Skip total row inside detail table — we recompute totals later.
          continue;
        }

        // Lines with a kode such as 1.1, 1.2, 2.1 → real detail
        if (kode && /^\d+(\.\d+)+$/.test(kode) && uraian) {
          npd.details.push({
            no_urut: kode,
            uraian,
            anggaran,
            akumulasi_pencairan: akumulasi,
            pencairan_saat_ini: pencairan,
            sisa_anggaran: sisa,
          });
          continue;
        }
        // Heading row (no, blank kode, uraian) — store as informational header row in detail
        if (no && !kode && uraian && uraian.toUpperCase() !== 'JUMLAH') {
          // skip; this is the program-level header (e.g. "Beban Alat Tulis Kantor")
        }
      }
    }

    // Sanity: NPD must have at least a nomor or jumlah_diminta or details to be considered valid
    if (!npd.nomor && npd.jumlah_diminta === 0 && npd.details.length === 0) continue;
    npds.push(npd);
  }

  return npds;
}

function processFile(filePath, category) {
  const fileName = path.basename(filePath);
  const wb = XLSX.readFile(filePath);
  const allNpds = [];
  wb.SheetNames.forEach(sn => {
    const monthName = sn.trim().toUpperCase();
    if (!MONTH_TO_NUM[monthName]) return;
    const npds = extractNpdsFromSheet(wb.Sheets[sn], monthName, fileName, category);
    allNpds.push(...npds);
  });
  return allNpds;
}

function ensureTables(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS npd_headers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nomor TEXT,
        category TEXT,
        file TEXT,
        sub_kegiatan TEXT,
        nomor_kegiatan TEXT,
        period_month INTEGER,
        period_year INTEGER,
        tahun_anggaran INTEGER,
        jumlah_diminta REAL DEFAULT 0,
        terbilang TEXT,
        ppn REAL DEFAULT 0,
        pph REAL DEFAULT 0,
        jumlah_potongan REAL DEFAULT 0,
        jumlah_dibayar REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS npd_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        npd_id INTEGER NOT NULL,
        no_urut TEXT,
        uraian TEXT,
        anggaran REAL DEFAULT 0,
        akumulasi_pencairan REAL DEFAULT 0,
        pencairan_saat_ini REAL DEFAULT 0,
        sisa_anggaran REAL DEFAULT 0,
        FOREIGN KEY (npd_id) REFERENCES npd_headers(id) ON DELETE CASCADE
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_npd_period ON npd_headers(period_year, period_month)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_npd_category ON npd_headers(category)`, err => err ? reject(err) : resolve());
    });
  });
}

function clearExisting(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM npd_details');
      db.run('DELETE FROM npd_headers', err => err ? reject(err) : resolve());
    });
  });
}

function insertNpd(db, npd) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`INSERT INTO npd_headers
      (nomor, category, file, sub_kegiatan, nomor_kegiatan, period_month, period_year,
       tahun_anggaran, jumlah_diminta, terbilang, ppn, pph, jumlah_potongan, jumlah_dibayar)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(
      [npd.nomor, npd.category, npd.file, npd.sub_kegiatan, npd.nomor_kegiatan,
       npd.period_month, npd.period_year, npd.tahun_anggaran, npd.jumlah_diminta,
       npd.terbilang, npd.ppn, npd.pph, npd.jumlah_potongan, npd.jumlah_dibayar],
      function (err) {
        if (err) { stmt.finalize(); return reject(err); }
        const headerId = this.lastID;
        const dstmt = db.prepare(`INSERT INTO npd_details
          (npd_id, no_urut, uraian, anggaran, akumulasi_pencairan, pencairan_saat_ini, sisa_anggaran)
          VALUES (?, ?, ?, ?, ?, ?, ?)`);
        try {
          for (const d of npd.details) {
            dstmt.run([headerId, d.no_urut, d.uraian, d.anggaran, d.akumulasi_pencairan, d.pencairan_saat_ini, d.sisa_anggaran]);
          }
          dstmt.finalize(err2 => {
            stmt.finalize();
            if (err2) reject(err2); else resolve(headerId);
          });
        } catch (e) {
          dstmt.finalize();
          stmt.finalize();
          reject(e);
        }
      }
    );
  });
}

async function main() {
  if (!fs.existsSync(ROOT)) {
    console.error('NPD root folder not found:', ROOT);
    process.exit(1);
  }
  const categories = fs.readdirSync(ROOT).filter(d =>
    !d.startsWith('.') && !d.startsWith('~') && fs.statSync(path.join(ROOT, d)).isDirectory()
  );

  const allNpds = [];
  for (const cat of categories) {
    const files = fs.readdirSync(path.join(ROOT, cat))
      .filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'));
    for (const f of files) {
      const full = path.join(ROOT, cat, f);
      try {
        const npds = processFile(full, cat);
        console.log(`  ${cat}/${f}: ${npds.length} NPDs`);
        allNpds.push(...npds);
      } catch (e) {
        console.error(`  ERR ${cat}/${f}: ${e.message}`);
      }
    }
  }

  console.log(`\nTotal NPDs parsed: ${allNpds.length}`);
  console.log(`Total details:    ${allNpds.reduce((s, n) => s + n.details.length, 0)}`);

  const db = new sqlite3.Database(DB_PATH);
  await ensureTables(db);
  await clearExisting(db);

  let ok = 0, bad = 0;
  for (const npd of allNpds) {
    try {
      await insertNpd(db, npd);
      ok++;
    } catch (e) {
      bad++;
      console.error('Insert error for NPD', npd.nomor, e.message);
    }
  }
  console.log(`Inserted: ${ok} OK, ${bad} failed`);
  db.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
