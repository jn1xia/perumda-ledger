/**
 * Seed: Import actual Perumda data from Excel files
 * #30 COA, #32 Journals (Jan-Apr), #33 Saldo Awal, #34 Aset Tetap
 * Usage: node server/db/seedActualData.cjs
 */
const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '..', 'perumda_ledger.db');
const FILES_DIR = path.join(__dirname, '..', '..', 'src', 'FILES');
const APRIL_FILE = path.join(FILES_DIR, 'LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); });
  });
}

async function main() {
  console.log('🚀 Starting data import...');
  const db = new sqlite3.Database(DB_PATH);
  const wb = XLSX.readFile(APRIL_FILE);

  // ========== 1. COA (#30) ==========
  console.log('\n📊 Importing COA...');
  const coaRows = XLSX.utils.sheet_to_json(wb.Sheets['COA'], { header: 1 });
  let coaCount = 0, currentType = 'asset', currentCat = '';
  const typeMap = { 'ASET':'asset','KEWAJIBAN':'liability','EKUITAS':'equity','PENDAPATAN':'revenue','BEBAN':'expense','BEBAN USAHA':'expense','BEBAN LAIN-LAIN':'expense','PAJAK':'expense' };

  for (const row of coaRows) {
    const code = row[0], name = (row[1]||'').toString().trim();
    if (!name) continue;
    if (!code) { if (typeMap[name]) currentType = typeMap[name]; currentCat = name; continue; }
    if (code && name) {
      await run(db, `INSERT OR REPLACE INTO coa (code, name, type, category) VALUES (?,?,?,?)`,
        [String(code), name, currentType, currentCat]);
      coaCount++;
    }
  }
  console.log(`   ✅ ${coaCount} COA accounts`);

  // ========== 2. JOURNALS (#32) ==========
  console.log('\n📖 Importing Journals...');
  const jFiles = [
    { file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx', sheet: 'JURNAL JAN 2026', month: '01' },
    { file: 'LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx', sheet: 'JURNAL FEB 2026', month: '02' },
    { file: 'LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx', sheet: 'JURNAL MARET 2026', month: '03' },
    { file: 'LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx', sheet: 'JURNAL APRIL 2026', month: '04' },
  ];

  let totalJ = 0;
  for (const { file, sheet, month } of jFiles) {
    const jwb = XLSX.readFile(path.join(FILES_DIR, file));
    const ws = jwb.Sheets[sheet];
    if (!ws) { console.log(`   ⚠️ "${sheet}" not found`); continue; }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    let count = 0;

    // Journals come in pairs (debit line + credit line with same bukti + keterangan)
    // Format: [akun_code, date_serial, bukti, akun_nama, sub_akun, debit, kredit, keterangan]
    for (let i = 3; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      const akunCode = String(row[0]);
      if (!/^\d{4,6}$/.test(akunCode)) continue;

      let tanggal;
      if (typeof row[1] === 'number') {
        const d = XLSX.SSF.parse_date_code(row[1]);
        tanggal = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
      } else { tanggal = `2026-${month}-01`; }

      const bukti = row[2] ? String(row[2]).trim() : '';
      const akunNama = row[3] ? String(row[3]).trim() : '';
      const subAkun = row[4] ? String(row[4]).trim() : '';
      const debit = Number(row[5]) || 0;
      const kredit = Number(row[6]) || 0;
      const ket = row[7] ? String(row[7]).trim() : '';
      if (debit === 0 && kredit === 0) continue;

      const id = `JRN-${month}-${String(count + 1).padStart(5, '0')}`;
      const fullKet = ket || (subAkun ? `${akunNama} - ${subAkun}` : akunNama);

      // Use akun_debit for debit entries, akun_kredit for credit entries
      await run(db, `INSERT OR IGNORE INTO journals (id, tanggal, bukti, akun_debit, akun_kredit, keterangan, debit, kredit) VALUES (?,?,?,?,?,?,?,?)`,
        [id, tanggal, bukti, debit > 0 ? akunCode : null, kredit > 0 ? akunCode : null, fullKet, debit, kredit]);
      count++;
    }
    console.log(`   📅 ${sheet}: ${count} entries`);
    totalJ += count;
  }
  console.log(`   ✅ Total: ${totalJ} journal entries`);

  // ========== 3. ASET TETAP (#34) ==========
  console.log('\n🏢 Importing Fixed Assets...');
  const atRows = XLSX.utils.sheet_to_json(wb.Sheets['DAFTAR AKTIVA TETAP'], { header: 1 });
  let ac = 0, curKat = 'Lain-lain';
  const katMap = { 'I. TANAH':'Tanah','II. BANGUNAN':'Bangunan','III. PERALATAN':'Peralatan','IV. KENDARAAN':'Kendaraan','V. INVENTARIS':'Inventaris' };

  for (let i = 5; i < atRows.length; i++) {
    const row = atRows[i];
    if (!row || row.length < 2) continue;
    const first = String(row[0]||'').trim(), name = String(row[1]||'').trim();
    for (const [p, k] of Object.entries(katMap)) { if (first === p || first.startsWith(p.split(' ')[0])) curKat = k; }

    const rn = Number(row[0]);
    if (!rn || rn !== Math.floor(rn) || !name) continue;
    if (name.includes('SUB TOTAL') || name.includes('TOTAL') || name.startsWith('Jumlah')) continue;

    const nilaiP = Number(row[4]) || 0;
    const penyThn = Number(row[6]) || 0;
    const penyBln = Number(row[7]) || 0;
    const beban2025 = Number(row[8]) || 0;
    const akum2025 = Number(row[9]) || 0;
    const nilaiBuku = Number(row[10]) || 0;
    const bebanMar = Number(row[11]) || 0;
    const akumMar = Number(row[12]) || 0;
    const nbMar = Number(row[13]) || 0;

    let tgl = null;
    if (row[3] && typeof row[3] === 'number') {
      try { const d = XLSX.SSF.parse_date_code(row[3]); tgl = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`; } catch(e){}
    }

    const kode = `AST-${String(ac + 1).padStart(4, '0')}`;
    const detail = row[2] ? String(row[2]).trim() : '';
    const ket = row[20] ? String(row[20]).trim() : '';

    await run(db, `INSERT OR REPLACE INTO assets (kode, nama, detail, kategori, tgl_perolehan, nilai_perolehan, penyusutan_per_tahun, penyusutan_per_bulan, beban_penyusutan_2025, nilai_penyusutan, nilai_buku, beban_penyusutan_maret_2026, akum_penyusutan_maret_2026, nilai_buku_maret_2026, keterangan) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [kode, name, detail, curKat, tgl, nilaiP, penyThn, penyBln, beban2025, akum2025, nilaiBuku, bebanMar, akumMar, nbMar, [detail, ket].filter(Boolean).join(' — ')]);
    ac++;
  }
  console.log(`   ✅ ${ac} fixed assets`);

  // ========== 4. SALDO AWAL (#33) ==========
  console.log('\n💰 Importing Opening Balances...');
  const saSheet = wb.Sheets['Rekap Akun & Saldo (thn)'];
  let saCount = 0;
  if (saSheet) {
    const saRows = XLSX.utils.sheet_to_json(saSheet, { header: 1 });
    for (const row of saRows) {
      if (!row || !row[0]) continue;
      const code = String(row[0]).trim();
      if (!/^\d{5}$/.test(code)) continue; // Only 5-digit leaf accounts
      const name = String(row[1]||'').trim();
      // Col layout: [code, name, D/K, debitTotal, kreditTotal, saldo, ...]
      // Try saldo (col 5), then debit total (col 3)
      const saldo = Number(row[5]) || Number(row[3]) || 0;
      if (saldo === 0) continue;

      const isDebit = code.startsWith('1')||code.startsWith('5')||code.startsWith('6')||code.startsWith('7')||code.startsWith('8');
      const id = `SA-${String(saCount + 1).padStart(5, '0')}`;
      await run(db, `INSERT OR IGNORE INTO journals (id, tanggal, bukti, akun_debit, akun_kredit, keterangan, debit, kredit) VALUES (?,?,?,?,?,?,?,?)`,
        [id, '2026-01-01', 'SA', isDebit ? code : null, isDebit ? null : code, `Saldo Awal 2026 — ${name}`, isDebit ? Math.abs(saldo) : 0, isDebit ? 0 : Math.abs(saldo)]);
      saCount++;
    }
    console.log(`   ✅ ${saCount} opening balance entries`);
  } else {
    console.log('   ⚠️ Sheet not found, trying COA saldo_awal...');
    // Fallback: update COA saldo_awal from Cut Off sheet
    const coSheet = wb.Sheets['Cut Off'];
    if (coSheet) {
      const coRows = XLSX.utils.sheet_to_json(coSheet, { header: 1 });
      for (const row of coRows) {
        if (!row[0] || !/^\d{4,6}$/.test(String(row[0]))) continue;
        const saldo = Number(row[2]) || Number(row[3]) || 0;
        if (saldo !== 0) {
          await run(db, `UPDATE coa SET saldo_awal = ? WHERE code = ?`, [saldo, String(row[0])]);
          saCount++;
        }
      }
      console.log(`   ✅ ${saCount} COA opening balances updated`);
    }
  }

  db.close();
  console.log('\n🎉 All imports completed!');
}

main().catch(err => { console.error('❌ Error:', err.message, err.stack); process.exit(1); });
