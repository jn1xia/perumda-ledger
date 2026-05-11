/**
 * regenerateData.cjs — Master Data Compiler
 * Compiles ALL 4 Excel audit files (Jan–Apr 2026) into one sampleData.json
 * 
 * Sources:
 *  1. COA → from April Excel "COA" sheet (most up-to-date)
 *  2. Saldo Awal → from April "DATA LAMPIRAN NERACA" (audited LAI 2025)
 *  3. Journals → from ALL 4 files' JURNAL sheets (Jan, Feb, Mar, Apr)
 *  4. Assets → from April "DAFTAR AKTIVA TETAP"
 *  5. Anggaran → from April budget sheets (Penerimaan, Investasi, Umum, Ops)
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DIR = path.join(__dirname, 'src/FILES');
const FILES = {
  jan: path.join(DIR, 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx'),
  feb: path.join(DIR, 'LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx'),
  mar: path.join(DIR, 'LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx'),
  apr: path.join(DIR, 'LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx'),
};

// Load all workbooks
console.log('Loading workbooks...');
const WB = {};
for (const [key, filepath] of Object.entries(FILES)) {
  if (!fs.existsSync(filepath)) { console.log(`⚠️  ${key}: file not found, skipping`); continue; }
  WB[key] = XLSX.readFile(filepath);
  console.log(`  ✓ ${key}: ${WB[key].SheetNames.length} sheets`);
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
function snToDate(sn) {
  if (!sn || typeof sn !== 'number' || sn < 40000) return null;
  const d = new Date((sn - 25569) * 86400 * 1000);
  return d.toISOString().split('T')[0];
}

function getCategory(code) {
  const c = String(code);
  if (c.startsWith('1')) return 'Aset';
  if (c.startsWith('2')) return 'Kewajiban';
  if (c.startsWith('3')) return 'Ekuitas';
  if (c.startsWith('4')) return 'Pendapatan';
  if (c.startsWith('5')) return 'HPP';
  if (c.startsWith('6')) return 'Beban';
  if (c.startsWith('7')) return 'Pendapatan';
  if (c.startsWith('8')) return 'Beban';
  if (c.startsWith('9')) return 'Beban';
  return 'Lainnya';
}

// ═══════════════════════════════════════════════════════════════════
// 1. COA — from April "COA" sheet (most complete)
// ═══════════════════════════════════════════════════════════════════
console.log('\n=== Extracting COA ===');
const wsCOA = WB.apr.Sheets['COA'];
const rawCOA = XLSX.utils.sheet_to_json(wsCOA, { header: 1, defval: '' });

// Saldo Awal from April "DATA LAMPIRAN NERACA"
const wsNeraca = WB.apr.Sheets['DATA LAMPIRAN NERACA'];
const rawNeraca = wsNeraca ? XLSX.utils.sheet_to_json(wsNeraca, { header: 1, defval: '' }) : [];
const saldoAwalMap = {};
rawNeraca.forEach(r => {
  const code = String(r[1]).trim();
  if (code.match(/^\d/)) {
    const sa = typeof r[4] === 'number' ? r[4] : 0;
    saldoAwalMap[code] = sa;
  }
});

// Hierarchy parents
const hierarchyParents = [
  { code: '1', name: 'ASET', type: 'parent', category: 'Aset', parent_code: null },
  { code: '11', name: 'Aset Lancar', type: 'parent', category: 'Aset', parent_code: '1' },
  { code: '12', name: 'Aset Tidak Lancar', type: 'parent', category: 'Aset', parent_code: '1' },
  { code: '13', name: 'Aset Lainnya', type: 'parent', category: 'Aset', parent_code: '1' },
  { code: '2', name: 'KEWAJIBAN', type: 'parent', category: 'Kewajiban', parent_code: null },
  { code: '21', name: 'Kewajiban Jangka Pendek', type: 'parent', category: 'Kewajiban', parent_code: '2' },
  { code: '22', name: 'Kewajiban Jangka Panjang', type: 'parent', category: 'Kewajiban', parent_code: '2' },
  { code: '3', name: 'EKUITAS', type: 'parent', category: 'Ekuitas', parent_code: null },
  { code: '4', name: 'PENDAPATAN', type: 'parent', category: 'Pendapatan', parent_code: null },
  { code: '41', name: 'Pendapatan Bisnis Utama', type: 'parent', category: 'Pendapatan', parent_code: '4' },
  { code: '42', name: 'Pendapatan Bisnis Lainnya', type: 'parent', category: 'Pendapatan', parent_code: '4' },
  { code: '5', name: 'BEBAN POKOK PENJUALAN', type: 'parent', category: 'HPP', parent_code: null },
  { code: '6', name: 'BEBAN', type: 'parent', category: 'Beban', parent_code: null },
  { code: '61', name: 'Beban Administrasi & Umum', type: 'parent', category: 'Beban', parent_code: '6' },
  { code: '62', name: 'Beban Operasional dan Bisnis', type: 'parent', category: 'Beban', parent_code: '6' },
  { code: '7', name: 'PENDAPATAN DAN BEBAN LAIN-LAIN', type: 'parent', category: 'Pendapatan', parent_code: null },
  { code: '8', name: 'BEBAN LAIN', type: 'parent', category: 'Beban', parent_code: null },
  { code: '9', name: 'PAJAK', type: 'parent', category: 'Beban', parent_code: null },
];

const coaAccounts = [...hierarchyParents.map((p, i) => ({ id: i + 1, ...p, saldo_awal: 0 }))];
let idCounter = hierarchyParents.length + 1;
const parentCodeSet = new Set(hierarchyParents.map(h => h.code));

// Header-to-parent mapping
const headerParents = {
  'Aktiva Lancar': '11', 'Properti Investasi': '12', 'Aset Tetap': '12', 'Aset Lainnya': '13',
  'Kewajiban Jangka Pendek': '21', 'Kewajiban Jangka Panjang': '22',
  'Pendapatan Bisnis Utama': '41', 'Pendapatan Bisnis Lainnya': '42',
  'Beban Administrasi & Umum': '61', 'Beban Operasional dan Bisnis': '62',
};
let currentParent = '11';

rawCOA.forEach(r => {
  const code = r[0], name = String(r[1] || '').trim();
  if (!name) return;
  if (!code || code === '') {
    if (headerParents[name]) currentParent = headerParents[name];
    return;
  }
  const codeStr = String(code);
  if (parentCodeSet.has(codeStr)) return;
  
  let pc = currentParent;
  if (codeStr.length >= 5) pc = codeStr.substring(0, 2);
  if (codeStr.includes('.')) pc = codeStr.split('.')[0].substring(0, 2);
  if (!parentCodeSet.has(pc)) pc = codeStr.substring(0, 1);

  coaAccounts.push({
    id: idCounter++, code: codeStr, name, type: 'posting',
    category: getCategory(codeStr), parent_code: pc,
    saldo_awal: saldoAwalMap[codeStr] || 0,
  });
});

console.log(`  COA: ${coaAccounts.length} accounts (${hierarchyParents.length} parents + ${coaAccounts.length - hierarchyParents.length} posting)`);
console.log(`  Saldo Awal: ${coaAccounts.filter(a => a.saldo_awal !== 0).length} accounts with non-zero values`);

// Build name→code map for lookups
const nameToCode = {};
coaAccounts.filter(a => a.type === 'posting').forEach(a => {
  nameToCode[a.name.toLowerCase().trim()] = a.code;
});

// ═══════════════════════════════════════════════════════════════════
// 2. JOURNALS — from ALL 4 files using consecutive D/K row pairing
// ═══════════════════════════════════════════════════════════════════
console.log('\n=== Extracting Journals ===');

/**
 * Unified journal extractor.
 * Excel format:
 *   Jan:         col0=date, col1=bukti, col2=accName, col3=subAkun, col4=D, col5=K, col6=ket
 *   Feb/Mar/Apr: col0=accCode, col1=date, col2=bukti, col3=accName, col4=subAkun, col5=D, col6=K, col7=ket
 * 
 * Entries come as consecutive row pairs: a Debit row followed by its Credit row.
 */
function extractJournals(ws, isJan) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  
  // Step 1: Parse all valid rows
  const rows = [];
  for (let i = 3; i < raw.length; i++) {
    const r = raw[i];
    let accCode, dateSN, bukti, accName, sub, d, k, ket;
    
    if (isJan) {
      dateSN = r[0]; bukti = String(r[1] || ''); accName = String(r[2] || '').trim();
      sub = String(r[3] || '').trim();
      d = typeof r[4] === 'number' ? r[4] : 0;
      k = typeof r[5] === 'number' ? r[5] : 0;
      ket = String(r[6] || '').trim();
      accCode = '';
    } else {
      accCode = r[0]; dateSN = r[1]; bukti = String(r[2] || '');
      accName = String(r[3] || '').trim(); sub = String(r[4] || '').trim();
      d = typeof r[5] === 'number' ? r[5] : 0;
      k = typeof r[6] === 'number' ? r[6] : 0;
      ket = String(r[7] || '').trim();
    }
    
    if (!accName || (d === 0 && k === 0)) continue;
    
    // Resolve date — use the row's own date, or inherit from the previous row
    let tanggal = snToDate(dateSN);
    if (!tanggal && rows.length > 0) tanggal = rows[rows.length - 1].tanggal;
    if (!tanggal) continue;
    
    const codeStr = accCode ? String(accCode) : '';
    rows.push({
      codeStr, tanggal, bukti, accName, sub, d, k, ket,
      type: d > 0 ? 'D' : 'K',
      label: (codeStr ? codeStr + ' - ' : '') + accName + (sub ? ' > ' + sub : ''),
    });
  }
  
  // Step 2: Pair consecutive D→K rows into journal entries
  const entries = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].type === 'D') {
      // Collect consecutive D rows
      const debits = [rows[i]];
      let j = i + 1;
      while (j < rows.length && rows[j].type === 'D' && rows[j].ket === rows[i].ket) {
        debits.push(rows[j]); j++;
      }
      // Collect consecutive K rows that follow
      const credits = [];
      while (j < rows.length && rows[j].type === 'K') {
        credits.push(rows[j]); j++;
        // Stop if the next row is a D (new entry)
        if (j < rows.length && rows[j].type === 'D') break;
      }
      
      if (credits.length > 0) {
        // Pair debits with credits
        if (debits.length === 1 && credits.length === 1) {
          entries.push({
            tanggal: debits[0].tanggal,
            keterangan: debits[0].ket || credits[0].ket || debits[0].accName,
            akun_debit: debits[0].label, akun_kredit: credits[0].label,
            debit: debits[0].d, kredit: credits[0].k,
            status: 'posted', bukti: debits[0].bukti,
          });
        } else {
          // Multi-line: create one entry per debit, distribute credits
          debits.forEach((dr, di) => {
            const cr = credits[Math.min(di, credits.length - 1)];
            entries.push({
              tanggal: dr.tanggal,
              keterangan: dr.ket || cr.ket || dr.accName,
              akun_debit: dr.label, akun_kredit: cr.label,
              debit: dr.d, kredit: cr.k,
              status: 'posted', bukti: dr.bukti,
            });
          });
        }
        i = j;
      } else {
        i++; // orphan D, skip
      }
    } else {
      i++; // orphan K, skip
    }
  }
  return entries;
}

// Extract from all 4 months
const allJournals = [];
let jid = 1;

const monthConfigs = [
  { key: 'jan', sheet: 'JURNAL JAN 2026',   prefix: 'JAN', isJan: true,  label: 'January' },
  { key: 'feb', sheet: 'JURNAL FEB 2026',   prefix: 'FEB', isJan: false, label: 'February' },
  { key: 'mar', sheet: 'JURNAL MARET 2026', prefix: 'MAR', isJan: false, label: 'March' },
  { key: 'apr', sheet: 'JURNAL APRIL 2026', prefix: 'APR', isJan: false, label: 'April' },
];

monthConfigs.forEach(({ key, sheet, prefix, isJan, label }) => {
  if (!WB[key]) return;
  const ws = WB[key].Sheets[sheet];
  if (!ws) { console.log(`  ${label}: sheet "${sheet}" not found`); return; }
  const entries = extractJournals(ws, isJan);
  entries.forEach(e => { e.id = prefix + '-' + String(jid++).padStart(4, '0'); allJournals.push(e); });
  console.log(`  ${label}: ${entries.length} journals`);
});

console.log(`  TOTAL JOURNALS: ${allJournals.length}`);

// ═══════════════════════════════════════════════════════════════════
// 3. ASSETS — from April "DAFTAR AKTIVA TETAP"
// ═══════════════════════════════════════════════════════════════════
console.log('\n=== Extracting Assets ===');
const wsAset = WB.apr.Sheets['DAFTAR AKTIVA TETAP'];
const rawAset = XLSX.utils.sheet_to_json(wsAset, { header: 1, defval: '' });
const assets = [];
let curKat = 'Peralatan';

for (let i = 4; i < rawAset.length; i++) {
  const r = rawAset[i];
  const col0 = String(r[0] || '').trim();
  const nama = String(r[1] || '').trim();
  
  // Detect category headers like "I. TANAH", "II. BANGUNAN", etc.
  if (col0.match(/^[IVX]+\.\s/i)) {
    const upper = col0.toUpperCase();
    if (upper.includes('TANAH')) curKat = 'Tanah';
    else if (upper.includes('BANGUNAN')) curKat = 'Bangunan';
    else if (upper.includes('KENDARAAN')) curKat = 'Kendaraan';
    else if (upper.includes('MESIN')) curKat = 'Mesin';
    else if (upper.includes('INSTALASI')) curKat = 'Instalasi Listrik';
    else if (upper.includes('PERALATAN')) curKat = 'Peralatan';
    continue;
  }
  
  // Skip non-data rows (headers, totals, etc.)
  if (typeof r[0] !== 'number' || !nama) continue;
  if (nama.toUpperCase().includes('JUMLAH') || nama.toUpperCase().includes('TOTAL')) continue;
  
  const tgl = snToDate(r[3]) || '2025-01-01';
  assets.push({
    kode: 'AT-' + String(assets.length + 1).padStart(3, '0'),
    nama, detail: String(r[2] || '').trim(), kategori: curKat, tgl_perolehan: tgl,
    nilai_perolehan: Number(r[4]) || 0, penyusutan_per_tahun: Number(r[6]) || 0,
    penyusutan_per_bulan: Number(r[7]) || 0, beban_penyusutan_2025: Number(r[8]) || 0,
    nilai_penyusutan: Number(r[9]) || 0, nilai_buku: Number(r[10]) || 0,
    beban_penyusutan_maret_2026: Number(r[11]) || 0, akum_penyusutan_maret_2026: Number(r[12]) || 0,
    nilai_buku_maret_2026: Number(r[13]) || 0,
    umur_manfaat: curKat === 'Tanah' ? '-' : (curKat === 'Bangunan' ? '20 tahun' : '8 tahun'),
    keterangan: String(r[20] || '').trim(),
  });
}
console.log(`  Assets: ${assets.length} (${[...new Set(assets.map(a=>a.kategori))].join(', ')})`);

// ═══════════════════════════════════════════════════════════════════
// 4. ANGGARAN — from April budget sheets
// ═══════════════════════════════════════════════════════════════════
console.log('\n=== Extracting Anggaran ===');
function extractBudget(wb, sheetName, category) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const data = [];
  for (let i = 4; i < raw.length; i++) {
    const r = raw[i];
    const name = String(r[3] || '').trim();
    const anggaran = Number(r[6]) || 0;
    const sdIni = Number(r[10]) || 0;
    if (!name || (anggaran === 0 && sdIni === 0)) continue;
    if (name.toLowerCase().includes('ttd') || name.toLowerCase().includes('direktur')) continue;
    data.push({
      kode: String(r[1] || r[2] || '').trim(),
      nama: name, kategori: category,
      anggaran_awal: anggaran, target_bulan: Number(r[7]) || 0,
      sd_bln_lalu: Number(r[8]) || 0, bulan_ini: Number(r[9]) || 0,
      realisasi: sdIni, sisa: anggaran - sdIni, persentase: Number(r[11]) || 0,
      is_total: name.toUpperCase().includes('JUMLAH') || name.toUpperCase().includes('TOTAL') ? 1 : 0,
    });
  }
  return data;
}

const allAnggaran = [
  ...extractBudget(WB.apr, 'Penerimaan', 'penerimaan'),
  ...extractBudget(WB.apr, 'Beban Investasi', 'bebanInvestasi'),
  ...extractBudget(WB.apr, 'Beban Umum', 'bebanUmum'),
  ...extractBudget(WB.apr, 'Beban Operasional ', 'bebanOperasional'),
];
console.log(`  Anggaran: ${allAnggaran.length} items`);

// ═══════════════════════════════════════════════════════════════════
// 5. OUTPUT
// ═══════════════════════════════════════════════════════════════════
const output = {
  journals: allJournals,
  coa: coaAccounts,
  assets,
  anggaran: allAnggaran,
  rekonsiliasi: [],
  pengaturan: { namaPerusahaan: 'Perumda Pasar Baiman', npwp: '01.234.567.8-901.000', kota: 'Banjarmasin' },
};

const outPath = path.join(__dirname, 'src/data/sampleData.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log('\n' + '═'.repeat(60));
console.log('✅ Master Data compiled to ' + outPath);
console.log('═'.repeat(60));
console.log(`  COA:      ${coaAccounts.length} accounts (${coaAccounts.filter(a => a.saldo_awal !== 0).length} with saldo awal)`);
console.log(`  Journals: ${allJournals.length} (Jan-Apr 2026)`);
console.log(`  Assets:   ${assets.length}`);
console.log(`  Anggaran: ${allAnggaran.length}`);
console.log('═'.repeat(60));
