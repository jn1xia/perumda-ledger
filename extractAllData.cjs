const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIG: All monthly Excel files and their journal sheet names
// ============================================================
const MONTHLY_FILES = [
  {
    month: 1, yearMonth: '2026-01', label: 'Januari',
    file: 'src/FILES/DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx',
    journalSheet: 'JURNAL JAN 2026',
    format: 'jan' // special format: col0=date, col1=accCode, col2=accName etc.
  },
  {
    month: 2, yearMonth: '2026-02', label: 'Februari',
    file: 'src/FILES/LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx',
    journalSheet: 'JURNAL FEB 2026',
    format: 'std' // col0=accCode, col1=date, col2=bukti, col3=accName, col4=subAcc, col5=D, col6=K, col7=ket
  },
  {
    month: 3, yearMonth: '2026-03', label: 'Maret',
    file: 'src/FILES/LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx',
    journalSheet: 'JURNAL MARET 2026',
    format: 'std'
  },
  {
    month: 4, yearMonth: '2026-04', label: 'April',
    file: 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx',
    journalSheet: 'JURNAL APRIL 2026',
    format: 'std'
  },
];

// ============================================================
// STEP 1: Extract COA from April file
// ============================================================
function extractCOA() {
  const wbApr = XLSX.readFile(path.join(__dirname, 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx'));
  const ws = wbApr.Sheets['COA'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const accounts = [];
  for (let i = 0; i < raw.length; i++) {
    const [code, name] = raw[i];
    if (!code || code === '' || typeof name !== 'string' || !name) continue;
    if (typeof code === 'number' && code < 10) continue;
    if (typeof code === 'string' && code.match(/^\d\.\d/)) continue;
    const codeStr = String(code);
    if (!codeStr.match(/^\d{4,5}(\.\d)?$/)) continue;
    accounts.push({ code: codeStr, name: name.trim() });
  }

  const nameToCode = {};
  accounts.forEach(a => { nameToCode[a.name.toLowerCase()] = a.code; });
  return { accounts, nameToCode };
}

// ============================================================
// STEP 2: Extract Saldo Awal from April file
// ============================================================
function extractSaldoAwal() {
  const wbApr = XLSX.readFile(path.join(__dirname, 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx'));
  const ws = wbApr.Sheets['Rekap Akun & Saldo (thn)'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const saldos = {};
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    const code = row[0], name = row[1], defaultSide = row[2];
    const saldoAwal = row[3], debetYTD = row[4] || 0, kreditYTD = row[5] || 0, saldoAkhir = row[6];
    if (!code || !name) continue;
    const codeStr = String(code);
    if (!codeStr.match(/^\d/)) continue;
    saldos[codeStr] = {
      code: codeStr, name: String(name).trim(), defaultSide: defaultSide || 'D',
      saldoAwal: typeof saldoAwal === 'number' ? saldoAwal : 0,
      debetYTD: Number(debetYTD), kreditYTD: Number(kreditYTD),
      saldoAkhir: typeof saldoAkhir === 'number' ? saldoAkhir : 0,
    };
  }
  return saldos;
}

// ============================================================
// STEP 3: Extract journals from ALL months
// ============================================================
function dateSerialToISO(dateSN, fallbackYearMonth) {
  if (typeof dateSN === 'number' && dateSN > 40000) {
    const d = new Date((dateSN - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  return fallbackYearMonth + '-01';
}

function extractStdJournals(filePath, sheetName, yearMonth, idStart) {
  const wb = XLSX.readFile(path.join(__dirname, filePath));
  const ws = wb.Sheets[sheetName];
  if (!ws) { console.log(`  Sheet "${sheetName}" not found in ${filePath}`); return { entries: [], nextId: idStart }; }
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  
  // Format: col0=accountCode, col1=dateSerial, col2=buktiNo, col3=accountName, col4=subAccount, col5=D, col6=K, col7=ket
  // Group rows by bukti number (col2) to handle multi-leg transactions
  const entries = [];
  let id = idStart;
  
  const buktiGroups = {};
  for (let i = 3; i < raw.length; i++) {
    const r = raw[i];
    const accCode = r[0];
    if (!accCode || typeof accCode !== 'number' || accCode < 10000) continue;
    const bukti = String(r[2] || 'UNK');
    const dateSN = r[1];
    if (!buktiGroups[bukti]) buktiGroups[bukti] = { dateSN, rows: [] };
    buktiGroups[bukti].rows.push(r);
  }
  
  Object.entries(buktiGroups).forEach(([bukti, group]) => {
    const tanggal = dateSerialToISO(group.dateSN, yearMonth);
    const debits = [], credits = [];
    
    group.rows.forEach(r => {
      const accCode = r[0], accName = r[3] || '', debitAmt = Number(r[5]) || 0, kreditAmt = Number(r[6]) || 0, ket = r[7] || '';
      if (debitAmt > 0) debits.push({ code: accCode, name: accName, amount: debitAmt, ket: String(ket).trim() });
      if (kreditAmt > 0) credits.push({ code: accCode, name: accName, amount: kreditAmt, ket: String(ket).trim() });
    });
    
    const createEntry = (d, c) => ({
      id: `JV-${yearMonth.replace('-','')}-${String(id++).padStart(4, '0')}`,
      tanggal,
      keterangan: d.ket || c.ket || d.name,
      debit: d.amount,
      kredit: c.amount,
      status: 'posted',
      akun_debit: `${d.code} - ${d.name}`,
      akun_kredit: `${c.code} - ${c.name}`,
      bukti
    });
    
    if (debits.length === 1 && credits.length === 1) {
      entries.push(createEntry(debits[0], credits[0]));
    } else if (debits.length >= 1 && credits.length === 1) {
      debits.forEach(d => entries.push(createEntry(d, credits[0])));
    } else if (debits.length === 1 && credits.length > 1) {
      credits.forEach(c => entries.push(createEntry(debits[0], c)));
    } else if (debits.length > 1 && credits.length > 1) {
      const usedCredits = new Set();
      debits.forEach(d => {
        let ci = credits.findIndex((c, idx) => !usedCredits.has(idx) && Math.abs(c.amount - d.amount) < 1);
        if (ci < 0) ci = credits.findIndex((_, idx) => !usedCredits.has(idx));
        if (ci >= 0) { entries.push(createEntry(d, credits[ci])); usedCredits.add(ci); }
      });
    }
  });
  
  return { entries, nextId: id };
}

function extractJanJournals(filePath, sheetName, nameToCode, idStart) {
  const wb = XLSX.readFile(path.join(__dirname, filePath));
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  
  // Jan format: col0=date, col1=accCode, col2=accName, col3=subAcc, col4=D, col5=K, col6=ket
  const entries = [];
  let id = idStart;
  
  // Group by date serial
  const dateGroups = [];
  let currentDate = null, currentRows = [];
  for (let i = 3; i < raw.length; i++) {
    const row = raw[i];
    const dateSN = row[0];
    if (!dateSN || typeof dateSN !== 'number') continue;
    if (currentDate !== null && dateSN !== currentDate) {
      dateGroups.push({ dateSN: currentDate, rows: currentRows });
      currentRows = [];
    }
    currentDate = dateSN;
    currentRows.push(row);
  }
  if (currentRows.length > 0) dateGroups.push({ dateSN: currentDate, rows: currentRows });
  
  dateGroups.forEach((group) => {
    const tanggal = dateSerialToISO(group.dateSN, '2026-01');
    const debits = [], credits = [];
    
    group.rows.forEach(r => {
      const accName = r[2] || '';
      const debitAmt = r[4] || 0;
      const kreditAmt = r[5] || 0;
      const keterangan = r[6] || '';
      const stdCode = nameToCode[accName.toLowerCase()];
      
      if (debitAmt > 0) debits.push({ name: accName, code: stdCode, amount: Number(debitAmt), keterangan: String(keterangan).trim() });
      if (kreditAmt > 0) credits.push({ name: accName, code: stdCode, amount: Number(kreditAmt), keterangan: String(keterangan).trim() });
    });
    
    // Pair debits with credits
    const createEntry = (d, c) => ({
      id: `JV-202601-${String(id++).padStart(4, '0')}`,
      tanggal,
      keterangan: d.keterangan || c.keterangan || d.name,
      debit: d.amount,
      kredit: c.amount,
      status: 'posted',
      akun_debit: d.code ? `${d.code} - ${d.name}` : d.name,
      akun_kredit: c.code ? `${c.code} - ${c.name}` : c.name,
      bukti: ''
    });
    
    if (debits.length === 1 && credits.length === 1) {
      entries.push(createEntry(debits[0], credits[0]));
    } else if (debits.length >= 1 && credits.length === 1) {
      debits.forEach(d => entries.push(createEntry(d, credits[0])));
    } else if (debits.length === 1 && credits.length > 1) {
      credits.forEach(c => entries.push(createEntry(debits[0], c)));
    } else if (debits.length > 1 && credits.length > 1) {
      const usedCredits = new Set();
      debits.forEach(d => {
        let ci = credits.findIndex((c, idx) => !usedCredits.has(idx) && Math.abs(c.amount - d.amount) < 1);
        if (ci < 0) ci = credits.findIndex((_, idx) => !usedCredits.has(idx));
        if (ci >= 0) { entries.push(createEntry(d, credits[ci])); usedCredits.add(ci); }
      });
    }
  });
  
  return { entries, nextId: id };
}

// ============================================================
// STEP 4: Extract Anggaran from all Rekap sheets
// ============================================================
function extractAnggaran(filePath) {
  const wb = XLSX.readFile(path.join(__dirname, filePath));
  const result = { investasi: [], umum: [], operasional: [] };
  
  // Rekap Beban Investasi
  const wsInv = wb.Sheets['Rekap Beban Investasi'];
  if (wsInv) {
    const raw = XLSX.utils.sheet_to_json(wsInv, { header: 1, defval: '' });
    for (let i = 4; i < raw.length; i++) {
      const r = raw[i];
      const uraian = r[2] || '';
      const paguTahun = Number(r[3]) || 0;
      const paguPeriod = Number(r[4]) || 0;
      const realisasi = Number(r[5]) || 0;
      const pct = Number(r[6]) || 0;
      if (!uraian || paguTahun === 0) continue;
      result.investasi.push({ kode: r[1] || '', uraian: String(uraian).trim(), paguTahun, paguPeriod, realisasi, pct });
    }
  }
  
  // Rekap Beban Umum
  const wsUmum = wb.Sheets['Rekap Beban Umum'];
  if (wsUmum) {
    const raw = XLSX.utils.sheet_to_json(wsUmum, { header: 1, defval: '' });
    for (let i = 4; i < raw.length; i++) {
      const r = raw[i];
      const uraian = r[4] || '';
      const paguTahun = Number(r[5]) || 0;
      const paguPeriod = Number(r[6]) || 0;
      const realisasi = Number(r[7]) || 0;
      const pct = Number(r[8]) || 0;
      if (!uraian || paguTahun === 0) continue;
      result.umum.push({ kode: r[3] || '', uraian: String(uraian).trim(), paguTahun, paguPeriod, realisasi, pct });
    }
  }
  
  // Rekap Beban Operasional
  const wsOps = wb.Sheets['Rekap Beban Operasional '];
  if (wsOps) {
    const raw = XLSX.utils.sheet_to_json(wsOps, { header: 1, defval: '' });
    for (let i = 4; i < raw.length; i++) {
      const r = raw[i];
      const uraian = r[4] || '';
      const paguTahun = Number(r[5]) || 0;
      const paguPeriod = Number(r[6]) || 0;
      const realisasi = Number(r[7]) || 0;
      const pct = Number(r[8]) || 0;
      if (!uraian || paguTahun === 0) continue;
      result.operasional.push({ kode: r[3] || '', uraian: String(uraian).trim(), paguTahun, paguPeriod, realisasi, pct });
    }
  }
  
  return result;
}

// ============================================================
// STEP 5: Extract assets
// ============================================================
function extractAset() {
  const wbApr = XLSX.readFile(path.join(__dirname, 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx'));
  const ws = wbApr.Sheets['DAFTAR AKTIVA TETAP'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const assets = [];
  let currentKategori = '';
  for (let i = 5; i < raw.length; i++) {
    const row = raw[i];
    const no = row[0], nama = row[1] || '';
    if (typeof no === 'string' && no.match(/^[IV]+\./)) {
      if (no.includes('TANAH')) currentKategori = 'Tanah';
      else if (no.includes('BANGUNAN')) currentKategori = 'Bangunan';
      else if (no.includes('KENDARAAN')) currentKategori = 'Kendaraan';
      else if (no.includes('MESIN')) currentKategori = 'Mesin';
      else if (no.includes('INSTALASI')) currentKategori = 'Instalasi Listrik';
      else if (no.includes('PERALATAN')) currentKategori = 'Peralatan';
      continue;
    }
    if (typeof no !== 'number' || !nama) continue;
    const tglSN = row[3];
    let tglPerolehan = '2025-01-01';
    if (typeof tglSN === 'number' && tglSN > 30000) {
      const d = new Date((tglSN - 25569) * 86400 * 1000);
      tglPerolehan = d.toISOString().split('T')[0];
    }
    assets.push({
      kode: `AT-${String(assets.length + 1).padStart(3, '0')}`,
      nama: nama.trim(), detail: String(row[2] || '').trim(), kategori: currentKategori || 'Peralatan',
      tglPerolehan, nilaiPerolehan: Number(row[4]) || 0,
      penyusutanPerTahun: Number(row[6]) || 0, penyusutanPerBulan: Number(row[7]) || 0,
      bebanPenyusutan2025: Number(row[8]) || 0, nilaiPenyusutan: Number(row[9]) || 0,
      nilaiBuku: Number(row[10]) || 0,
      umurManfaat: currentKategori === 'Tanah' ? '-' : (currentKategori === 'Bangunan' ? '20 tahun' : '8 tahun'),
    });
  }
  return assets;
}

// ============================================================
// RUN ALL EXTRACTIONS
// ============================================================
console.log('=== Starting Full Extraction (All Months) ===\n');

const { accounts: coaData, nameToCode } = extractCOA();
console.log(`COA accounts: ${coaData.length}`);

const saldoAwalData = extractSaldoAwal();
console.log(`Saldo Awal accounts: ${Object.keys(saldoAwalData).length}`);

// Extract journals for ALL months
const allJournals = [];
const journalsByMonth = {};
let globalId = 1;

MONTHLY_FILES.forEach(mf => {
  console.log(`\nExtracting ${mf.label} journals from ${mf.journalSheet}...`);
  let result;
  if (mf.format === 'jan') {
    result = extractJanJournals(mf.file, mf.journalSheet, nameToCode, globalId);
  } else {
    result = extractStdJournals(mf.file, mf.journalSheet, mf.yearMonth, globalId);
  }
  globalId = result.nextId;
  journalsByMonth[mf.yearMonth] = result.entries;
  allJournals.push(...result.entries);
  console.log(`  ${mf.label}: ${result.entries.length} journal entries`);
});

console.log(`\nTotal journal entries: ${allJournals.length}`);

// Extract anggaran from April file (most recent / complete)
console.log('\nExtracting Anggaran...');
const anggaranByFile = {};
MONTHLY_FILES.forEach(mf => {
  const ang = extractAnggaran(mf.file);
  anggaranByFile[mf.yearMonth] = ang;
  console.log(`  ${mf.label}: Investasi=${ang.investasi.length}, Umum=${ang.umum.length}, Ops=${ang.operasional.length}`);
});

// Use April anggaran as the master (most complete)
const anggaranMaster = anggaranByFile['2026-04'];

const asetData = extractAset();
console.log(`\nAssets: ${asetData.length}`);

// Write combined output
const output = {
  coaData,
  saldoAwalData,
  allJournals,
  journalsByMonth,
  anggaranMaster,
  anggaranByFile,
  asetData,
};

fs.writeFileSync(
  path.join(__dirname, 'src/data/extractedAllData.json'),
  JSON.stringify(output, null, 2)
);

console.log('\n=== Data extracted to src/data/extractedAllData.json ===');
console.log(`File size: ${(fs.statSync(path.join(__dirname, 'src/data/extractedAllData.json')).size / 1024 / 1024).toFixed(2)} MB`);

// Summary
console.log('\n=== SUMMARY ===');
console.log(`COA: ${coaData.length} accounts`);
console.log(`Saldo Awal: ${Object.keys(saldoAwalData).length} accounts`);
Object.entries(journalsByMonth).forEach(([ym, j]) => console.log(`Journals ${ym}: ${j.length} entries`));
console.log(`Total Journals: ${allJournals.length}`);
console.log(`Assets: ${asetData.length}`);
console.log(`Anggaran Investasi: ${anggaranMaster.investasi.length} items`);
console.log(`Anggaran Umum: ${anggaranMaster.umum.length} items`);
console.log(`Anggaran Operasional: ${anggaranMaster.operasional.length} items`);
