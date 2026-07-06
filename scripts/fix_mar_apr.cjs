// Fix March and April Neraca + Arus Kas from the correct primary sheets
const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'perumda_ledger.db');
const FILES_DIR = path.join(__dirname, '..', 'src', 'FILES');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve(this) }));
}
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

// Parse NERACA from primary sheet (col 8 = current month value)
function parseNeraca(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const rows = [];
  let orderNum = 0;

  data.forEach((row) => {
    let label = '', value = null, depth = 0;

    for (let col = 0; col < Math.min(row.length, 8); col++) {
      if (typeof row[col] === 'string' && row[col].trim()) {
        label = row[col].trim();
        depth = col;
        break;
      }
    }

    if (!label) return;
    // Skip header rows
    if (
      label.includes('PERUSAHAAN') || label.includes('LAPORAN') ||
      label.includes('Untuk Periode') || label.includes('Berakhir') ||
      label.includes('Januari') || label.includes('Februari') ||
      label.includes('Maret') || label.includes('April') ||
      label.includes('Desember') || label.includes('Audited')
    ) return;

    // Value is at column 8
    if (typeof row[8] === 'number') {
      value = row[8];
    }

    rows.push({ order: orderNum++, label, value, depth });
  });

  return rows;
}

// Parse Arus Kas from primary sheet (col 2 = current month value)
function parseArusKas(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const rows = [];
  let orderNum = 0;

  data.forEach((row) => {
    let label = '', value = null, isSection = false;

    if (typeof row[0] === 'string' && row[0].trim() && row[0].trim() !== ' ') {
      label = row[0].trim();
      isSection = true;
      value = typeof row[2] === 'number' ? row[2] : null;
    } else if (typeof row[1] === 'string' && row[1].trim() && row[1].trim() !== ' ') {
      label = row[1].trim();
      value = typeof row[2] === 'number' ? row[2] : null;
    }

    if (!label) return;
    // Skip headers
    if (
      label.includes('PERUSAHAAN') || label.includes('LAPORAN ARUS') ||
      label.includes('Untuk Periode') || label.includes('Audited') ||
      label.includes('2025') || label === 'Maret 2026' || label === 'April 2026' ||
      label === 'Februari 2026' || label === ' '
    ) {
      if (!label.includes('Arus Kas')) return;
    }

    rows.push({ order: orderNum++, label, value, isSection });
  });

  return rows;
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);

  const toFix = [
    {
      period: '2026-03',
      file: 'LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx',
      neracaSheet: 'NERACA MARET 2026',
      arusKasSheet: 'ARUS KAS MARET 2026',
    },
    {
      period: '2026-04',
      file: 'LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx',
      neracaSheet: 'NERACA APRIL 2026',
      arusKasSheet: 'ARUS KAS APRIL 2026',
    },
  ];

  for (const { period, file, neracaSheet, arusKasSheet } of toFix) {
    console.log(`\n=== Processing ${period} from ${file} ===`);
    const wb = XLSX.readFile(path.join(FILES_DIR, file));

    // --- NERACA ---
    const wsNeraca = wb.Sheets[neracaSheet];
    const neracaRows = parseNeraca(wsNeraca);
    await run(db, 'DELETE FROM report_neraca WHERE period = ?', [period]);
    for (const r of neracaRows) {
      await run(db, 'INSERT INTO report_neraca (period, sort_order, label, value, depth) VALUES (?, ?, ?, ?, ?)',
        [period, r.order, r.label, r.value, r.depth]);
    }
    console.log(`  ✅ Neraca ${period}: ${neracaRows.length} rows`);

    // Verify sample
    const sample = await all(db, 'SELECT label, value FROM report_neraca WHERE period = ? ORDER BY sort_order LIMIT 10', [period]);
    sample.forEach(r => console.log(`     ${r.label}: ${r.value}`));

    // --- ARUS KAS ---
    const wsCF = wb.Sheets[arusKasSheet];
    const cfRows = parseArusKas(wsCF);
    await run(db, 'DELETE FROM report_arus_kas WHERE period = ?', [period]);
    for (const r of cfRows) {
      await run(db, 'INSERT INTO report_arus_kas (period, sort_order, label, value, is_section) VALUES (?, ?, ?, ?, ?)',
        [period, r.order, r.label, r.value, r.isSection ? 1 : 0]);
    }
    console.log(`  ✅ Arus Kas ${period}: ${cfRows.length} rows`);

    // Verify sample
    const cfSample = await all(db, 'SELECT label, value, is_section FROM report_arus_kas WHERE period = ? ORDER BY sort_order', [period]);
    cfSample.forEach(r => console.log(`     [${r.is_section ? '🔵' : '  '}] ${r.label}: ${r.value}`));
  }

  // Update seed JSON
  console.log('\n📦 Updating seed_report_data.json...');
  const neraca = await all(db, 'SELECT period, sort_order, label, value, depth FROM report_neraca ORDER BY period, sort_order');
  const arusKas = await all(db, 'SELECT period, sort_order, label, value, is_section FROM report_arus_kas ORDER BY period, sort_order');
  require('fs').writeFileSync(
    path.join(__dirname, '..', 'server', 'seed_report_data.json'),
    JSON.stringify({ neraca, arusKas }, null, 0)
  );
  console.log(`✅ seed_report_data.json updated: ${neraca.length} neraca + ${arusKas.length} arus kas rows`);

  db.close();
}

main().catch(console.error);
