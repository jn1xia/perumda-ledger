// ─── extractNPD.cjs ───────────────────────────────────────────────────────────
// Extracts all NPD (Nota Pencairan Dana) data from Excel files and seeds
// them into the database via API.
// Run: ~/.nvm/versions/node/v24.15.0/bin/node extractNPD.cjs
// ─────────────────────────────────────────────────────────────────────────────

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname,
  'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026');

const CATEGORIES = {
  'Beban Investasi': 'Investasi',
  'Beban Operasional dan Bisnis': 'Beban Operasional',
  'Beban Umum dan Keuangan': 'Beban Umum & Administrasi',
};

function parseNPDFile(filePath, kategori) {
  const wb = XLSX.readFile(filePath);
  const fileName = path.basename(filePath, '.xlsx').replace(/^NPD /, '').replace(/^Beban /, '');
  const results = [];

  for (const sheetName of wb.SheetNames) {
    if (sheetName.startsWith('~')) continue;
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Detect month from sheet name
    const monthMap = { 'JANUARI': 1, 'FEBRUARI': 2, 'MARET': 3, 'APRIL': 4, 'MEI': 5,
      'JUNI': 6, 'JULI': 7, 'AGUSTUS': 8, 'SEPTEMBER': 9, 'OKTOBER': 10, 'NOVEMBER': 11, 'DESEMBER': 12 };
    const bulan = monthMap[sheetName.toUpperCase()] || 0;
    if (!bulan) continue;

    // Extract NPD header info
    let npdNomor = '', subKegiatan = '', tahun = 2026, jumlahDiminta = 0, jumlahDibayarkan = 0;
    let tanggal = `2026-${String(bulan).padStart(2, '0')}-01`;
    let ppn = 0, pph = 0, potongan = 0;

    for (let i = 0; i < Math.min(raw.length, 45); i++) {
      const row = raw[i];
      const r0 = String(row[0] || '').trim();
      if (r0.startsWith('Nomor')) npdNomor = r0.replace(/^Nomor\s*:\s*/, '');
      if (r0.includes('Sub Kegiatan')) subKegiatan = String(row[4] || '').trim();
      if (r0.includes('Tahun Anggaran') && typeof row[4] === 'number') tahun = row[4];
      if (r0.includes('Jumlah Yang Diminta') && typeof row[4] === 'number') jumlahDiminta = row[4];
      if (r0.includes('PPN') && typeof row[4] === 'number') ppn = row[4];
      if (r0.includes('PPh') && typeof row[4] === 'number') pph = row[4];
      if (r0.includes('Jumlah Potongan') && typeof row[4] === 'number') potongan = row[4];
      if (r0.includes('Jumlah yang dibayarkan') && typeof row[4] === 'number') jumlahDibayarkan = row[4];

      // Detect date from signature line
      if (String(row[9] || '').includes('Banjarmasin,')) {
        const dateStr = String(row[9]).replace(/Banjarmasin,\s*/, '').trim();
        const parts = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
        if (parts) {
          const mNames = { 'januari':1,'februari':2,'maret':3,'april':4,'mei':5,'juni':6,
            'juli':7,'agustus':8,'september':9,'oktober':10,'november':11,'desember':12 };
          const mn = mNames[parts[2].toLowerCase()];
          if (mn) tanggal = `${parts[3]}-${String(mn).padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
        }
      }
    }

    // Extract line items from the table
    const lineItems = [];
    let headerRow = -1;
    for (let i = 0; i < raw.length; i++) {
      if (String(raw[i][0]).toUpperCase() === 'NO' && String(raw[i][2] || '').includes('Uraian')) {
        headerRow = i; break;
      }
    }

    if (headerRow >= 0) {
      for (let i = headerRow + 1; i < raw.length; i++) {
        const row = raw[i];
        const kode = String(row[1] || '').trim();
        const uraian = String(row[2] || '').trim();
        if (!uraian || uraian === 'JUMLAH' || uraian.startsWith('Jumlah')) continue;
        // Skip separator rows
        const anggaranVal = row[6];
        if (typeof anggaranVal === 'string' && anggaranVal.includes('---')) continue;
        if (!kode && typeof row[0] === 'number') continue; // category header row

        const anggaran = typeof anggaranVal === 'number' ? anggaranVal : 0;
        const akumulasi = typeof row[7] === 'number' ? row[7] : (typeof row[8] === 'number' ? row[8] : 0);

        // Detect pencairan column (varies: col 8, 9, or 10 depending on format)
        let pencairan = 0;
        for (let c = 8; c <= 10; c++) {
          const label = String(raw[headerRow]?.[c] || '').toLowerCase();
          if (label.includes('pencairan saat ini') || label.includes('pencairan')) {
            pencairan = typeof row[c] === 'number' ? row[c] : 0;
            break;
          }
        }
        if (pencairan === 0) pencairan = typeof row[9] === 'number' ? row[9] : 0;

        const sisa = typeof row[10] === 'number' ? row[10] : (typeof row[9] === 'number' ? row[9] : 0);

        if (anggaran > 0 || pencairan > 0) {
          lineItems.push({ kode, uraian, anggaran, akumulasi, pencairan, sisa });
        }
      }
    }

    results.push({
      npdNomor, subKegiatan, kategori, fileName, bulan, tahun, tanggal,
      jumlahDiminta, jumlahDibayarkan, ppn, pph, potongan, lineItems
    });
  }
  return results;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
console.log('=== Extracting NPD Data ===\n');
const allNPD = [];

for (const [dir, kat] of Object.entries(CATEGORIES)) {
  const dirPath = path.join(BASE, dir);
  if (!fs.existsSync(dirPath)) { console.log(`Skipping ${dir} (not found)`); continue; }

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.xlsx') && !f.startsWith('~'));
  for (const file of files) {
    try {
      const npds = parseNPDFile(path.join(dirPath, file), kat);
      allNPD.push(...npds);
      console.log(`  ${file}: ${npds.length} month(s), ${npds.reduce((s,n) => s+n.lineItems.length, 0)} line items`);
    } catch (e) {
      console.error(`  ERROR ${file}: ${e.message}`);
    }
  }
}

console.log(`\nTotal NPD records: ${allNPD.length}`);
console.log(`Total line items: ${allNPD.reduce((s,n) => s+n.lineItems.length, 0)}`);

// Summary by category
const byCat = {};
allNPD.forEach(n => {
  if (!byCat[n.kategori]) byCat[n.kategori] = { count: 0, total: 0 };
  byCat[n.kategori].count++;
  byCat[n.kategori].total += n.jumlahDiminta;
});
console.log('\nBy Category:');
for (const [k,v] of Object.entries(byCat)) {
  console.log(`  ${k}: ${v.count} NPDs, Total Rp ${v.total.toLocaleString('id-ID')}`);
}

// Write output
const outputPath = path.join(__dirname, 'src/data/npdData.json');
fs.writeFileSync(outputPath, JSON.stringify(allNPD, null, 2));
console.log(`\nData written to ${outputPath}`);
