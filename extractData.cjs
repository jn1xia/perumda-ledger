const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ============================================================
// STEP 1: Extract COA from April file (canonical source)
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
    if (c === '99999') return 'Beban';
    return 'Lainnya';
  }

  const parentCodes = new Set([
    '10000','11000','11100','11200','11300','11400','11500',
    '12000','12100','12200','12300','13000',
    '20000','21000','22000',
    '30000',
    '40000','41000','42000',
    '50000',
    '60000','61000','61010','61020','61030','61040','61050','61060','61070','61080','61090','61100','61110','61120','61130','61140',
    '62000','62010','62020','62030','62040','62050','62060','62070','62080','62090',
    '70000','80000'
  ]);

  // Build lookup: name -> code for mapping January journals
  const nameToCode = {};
  accounts.forEach(a => { nameToCode[a.name.toLowerCase()] = a.code; });

  return { accounts, nameToCode };
}

// ============================================================
// STEP 2: Extract Saldo Awal from April file (authoritative source)
// These represent Jan 1, 2026 opening balances per audit
// ============================================================
function extractSaldoAwal() {
  const wbApr = XLSX.readFile(path.join(__dirname, 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx'));
  const ws = wbApr.Sheets['Rekap Akun & Saldo (thn)'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const saldos = {};
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    const code = row[0];
    const name = row[1];
    const defaultSide = row[2];
    const saldoAwal = row[3]; // Jan 1 opening balance
    const debetYTD = row[4] || 0; // YTD D (Jan-Apr)
    const kreditYTD = row[5] || 0; // YTD K (Jan-Apr)
    const saldoAkhir = row[6]; // April 30 ending balance

    if (!code || !name) continue;
    const codeStr = String(code);
    if (!codeStr.match(/^\d/)) continue;

    saldos[codeStr] = {
      code: codeStr,
      name: String(name).trim(),
      defaultSide: defaultSide || 'D',
      saldoAwal: typeof saldoAwal === 'number' ? saldoAwal : 0,
      debetYTD: Number(debetYTD),
      kreditYTD: Number(kreditYTD),
      saldoAkhir: typeof saldoAkhir === 'number' ? saldoAkhir : 0,
    };
  }
  return saldos;
}

// ============================================================
// STEP 3: Extract April journals
// ============================================================
function extractAprilJurnal() {
  const wbApr = XLSX.readFile(path.join(__dirname, 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx'));
  const ws = wbApr.Sheets['JURNAL APRIL 2026'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const entries = [];
  let id = 1;

  // Format: AkunCode(0), No(1), Tgl(2), AkunName(3), SubAkun(4), D(5), K(6), Keterangan(7)
  for (let i = 3; i < Math.min(raw.length, 203); i += 2) {
    const debitRow = raw[i];
    const creditRow = raw[i + 1];
    if (!debitRow || !creditRow) continue;

    const akunDebitCode = debitRow[0];
    const dateSN = debitRow[2]; // Tanggal is column 2
    const bukti = debitRow[2] || '';
    const akunDebitName = debitRow[3] || '';
    const subAkunDebit = debitRow[4] || '';
    const debitAmt = debitRow[5] || 0;
    const keterangan = debitRow[7] || '';

    const akunKreditCode = creditRow[0];
    const akunKreditName = creditRow[3] || '';
    const kreditAmt = creditRow[6] || 0;

    if (!akunDebitCode || !akunKreditCode || (!debitAmt && !kreditAmt)) continue;

    let tanggal = '2026-04-01';
    if (typeof dateSN === 'number' && dateSN > 40000) {
      const d = new Date((dateSN - 25569) * 86400 * 1000);
      tanggal = d.toISOString().split('T')[0];
    }

    const numId = String(id).padStart(3, '0');
    entries.push({
      id: `JV-2026-${numId}`,
      tanggal,
      keterangan: String(keterangan).trim(),
      debit: Number(debitAmt) || Number(kreditAmt) || 0,
      kredit: Number(kreditAmt) || Number(debitAmt) || 0,
      status: 'posted',
      akunDebit: `${akunDebitCode} - ${akunDebitName}`,
      akunKredit: `${akunKreditCode} - ${akunKreditName}`,
      bukti: bukti
    });
    id++;
  }
  return entries;
}

// ============================================================
// STEP 4: Extract January journals
// Uses A.02, A.03, etc. codes -> map to standard via name lookup
// ============================================================
function extractJanuaryJurnal(nameToCode) {
  const wbJan = XLSX.readFile(path.join(__dirname, 'src/FILES/DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx'));
  const ws = wbJan.Sheets['JURNAL JAN 2026'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Format: Tgl(0), No.Akun(1), Akun(2), Sub Akun(3), D(4), K(5), Keterangan(6)
  // Groups by date serial number
  
  const entries = [];
  let id = 17; // Continue after April entries (57 + some buffer)

  // Group rows by date (col 0 = Tgl)
  const dateGroups = [];
  let currentDate = null;
  let currentRows = [];

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
  if (currentRows.length > 0) {
    dateGroups.push({ dateSN: currentDate, rows: currentRows });
  }

  console.log(`January: ${dateGroups.length} transaction groups found`);

  dateGroups.forEach((group, gidx) => {
    let tanggal = '2026-01-01';
    if (typeof group.dateSN === 'number' && group.dateSN > 40000) {
      const d = new Date((group.dateSN - 25569) * 86400 * 1000);
      tanggal = d.toISOString().split('T')[0];
    }

    // Within each group, pair debits with credits
    // Multiple rows can form legs of one or more transactions
    // Strategy: collect all debit rows and credit rows, then pair them
    const debits = [];
    const credits = [];

    group.rows.forEach(r => {
      const accName = r[2] || ''; // Column 2 = Akun name
      const debitAmt = r[4] || 0; // Column 4 = D
      const kreditAmt = r[5] || 0; // Column 5 = K
      const keterangan = r[6] || ''; // Column 6 = Keterangan

      // Look up standard COA code by name
      const stdCode = nameToCode[accName.toLowerCase()];

      if (debitAmt > 0) {
        debits.push({
          name: accName,
          code: stdCode,
          amount: Number(debitAmt),
          keterangan: String(keterangan).trim()
        });
      }
      if (kreditAmt > 0) {
        credits.push({
          name: accName,
          code: stdCode,
          amount: Number(kreditAmt),
          keterangan: String(keterangan).trim()
        });
      }
    });

    const totalD = debits.reduce((s, d) => s + d.amount, 0);
    const totalK = credits.reduce((s, c) => s + c.amount, 0);

    if (Math.abs(totalD - totalK) > 1) {
      // Try to handle unbalanced groups by using the credit total
      console.log(`  Group ${gidx} (${tanggal}): D=${totalD}, K=${totalK} - adjusting`);
    }

    // Create paired entries
    if (debits.length === 1 && credits.length === 1) {
      // Simple 1:1 pair
      const d = debits[0];
      const c = credits[0];
      entries.push({
        id: `JV-2026-${String(id++).padStart(3, '0')}`,
        tanggal,
        keterangan: d.keterangan || c.keterangan || `${d.name}`,
        debit: d.amount,
        kredit: c.amount,
        status: 'posted',
        akunDebit: d.code ? `${d.code} - ${d.name}` : d.name,
        akunKredit: c.code ? `${c.code} - ${c.name}` : c.name,
        bukti: `JAN-${gidx + 1}`
      });
    } else if (debits.length >= 1 && credits.length === 1) {
      // Multi-debit single credit: split into individual entries
      debits.forEach(d => {
        entries.push({
          id: `JV-2026-${String(id++).padStart(3, '0')}`,
          tanggal,
          keterangan: d.keterangan || group.rows[0][6] || d.name,
          debit: d.amount,
          kredit: d.amount,
          status: 'posted',
          akunDebit: d.code ? `${d.code} - ${d.name}` : d.name,
          akunKredit: credits[0].code ? `${credits[0].code} - ${credits[0].name}` : credits[0].name,
          bukti: `JAN-${gidx + 1}`
        });
      });
    } else if (debits.length === 1 && credits.length > 1) {
      credits.forEach(c => {
        entries.push({
          id: `JV-2026-${String(id++).padStart(3, '0')}`,
          tanggal,
          keterangan: c.keterangan || group.rows[0][6] || c.name,
          debit: c.amount,
          kredit: c.amount,
          status: 'posted',
          akunDebit: debits[0].code ? `${debits[0].code} - ${debits[0].name}` : debits[0].name,
          akunKredit: c.code ? `${c.code} - ${c.name}` : c.name,
          bukti: `JAN-${gidx + 1}`
        });
      });
    } else if (debits.length > 1 && credits.length > 1) {
      // Multiple debits and credits - try to pair by amount
      const usedCredits = new Set();
      debits.forEach(d => {
        let matched = false;
        credits.forEach((c, ci) => {
          if (!usedCredits.has(ci) && Math.abs(c.amount - d.amount) < 1) {
            entries.push({
              id: `JV-2026-${String(id++).padStart(3, '0')}`,
              tanggal,
              keterangan: d.keterangan || group.rows[0][6] || d.name,
              debit: d.amount,
              kredit: c.amount,
              status: 'posted',
              akunDebit: d.code ? `${d.code} - ${d.name}` : d.name,
              akunKredit: c.code ? `${c.code} - ${c.name}` : c.name,
              bukti: `JAN-${gidx + 1}`
            });
            usedCredits.add(ci);
            matched = true;
          }
        });
        if (!matched) {
          // Use first available credit
          const ci = credits.findIndex((_, idx) => !usedCredits.has(idx));
          if (ci >= 0) {
            entries.push({
              id: `JV-2026-${String(id++).padStart(3, '0')}`,
              tanggal,
              keterangan: d.keterangan || group.rows[0][6] || d.name,
              debit: d.amount,
              kredit: d.amount,
              status: 'posted',
              akunDebit: d.code ? `${d.code} - ${d.name}` : d.name,
              akunKredit: credits[ci].code ? `${credits[ci].code} - ${credits[ci].name}` : credits[ci].name,
              bukti: `JAN-${gidx + 1}`
            });
            usedCredits.add(ci);
          }
        }
      });
    } else {
      console.log(`  Skipping group ${gidx} (${tanggal}): ${debits.length} debits, ${credits.length} credits`);
    }
  });

  console.log(`January: ${entries.length} journal entries extracted`);
  return entries;
}

// ============================================================
// STEP 5: Extract assets from April file
// ============================================================
function extractAset() {
  const wbApr = XLSX.readFile(path.join(__dirname, 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx'));
  const ws = wbApr.Sheets['DAFTAR AKTIVA TETAP'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const assets = [];
  let currentKategori = '';

  for (let i = 5; i < raw.length; i++) {
    const row = raw[i];
    const no = row[0];
    const nama = row[1] || '';

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

    const tglPerolehanSN = row[3];
    const hargaPerolehan = Number(row[4]) || 0;
    const penyPerTahun = Number(row[6]) || 0;
    const penyPerBulan = Number(row[7]) || 0;
    const bebanPeny2025 = Number(row[8]) || 0;
    const akumPeny2025 = Number(row[9]) || 0;
    const nilaiBuku2025 = Number(row[10]) || 0;
    const bebanPenyMaret2026 = Number(row[11]) || 0;
    const akumPenyMaret2026 = Number(row[12]) || 0;
    const nilaiBukuMaret2026 = Number(row[13]) || 0;
    const ket = row[20] || '';

    let tglPerolehan = '2025-01-01';
    if (typeof tglPerolehanSN === 'number' && tglPerolehanSN > 30000) {
      const d = new Date((tglPerolehanSN - 25569) * 86400 * 1000);
      tglPerolehan = d.toISOString().split('T')[0];
    }

    assets.push({
      kode: `AT-${String(assets.length + 1).padStart(3, '0')}`,
      nama: nama.trim(),
      detail: String(row[2] || '').trim(),
      kategori: currentKategori || 'Peralatan',
      tglPerolehan,
      nilaiPerolehan: hargaPerolehan,
      penyusutanPerTahun: penyPerTahun,
      penyusutanPerBulan: penyPerBulan,
      bebanPenyusutan2025: bebanPeny2025,
      nilaiPenyusutan: akumPeny2025,
      nilaiBuku: nilaiBuku2025,
      bebanPenyusutanMaret2026: bebanPenyMaret2026,
      akumPenyusutanMaret2026: akumPenyMaret2026,
      nilaiBukuMaret2026: nilaiBukuMaret2026,
      umurManfaat: currentKategori === 'Tanah' ? '-' : (currentKategori === 'Bangunan' ? '20 tahun' : '8 tahun'),
      keterangan: String(ket).trim()
    });
  }
  return assets;
}

// ============================================================
// RUN ALL EXTRACTIONS
// ============================================================
console.log('=== Starting extraction ===\n');

const { accounts: coaData, nameToCode } = extractCOA();
console.log(`COA accounts: ${coaData.length}`);
console.log(`Name-to-code mappings: ${Object.keys(nameToCode).length}`);

const saldoAwalData = extractSaldoAwal();
console.log(`Saldo Awal accounts: ${Object.keys(saldoAwalData).length}`);

const jurnalAprData = extractAprilJurnal();
console.log(`April Journal entries: ${jurnalAprData.length}`);

const jurnalJanData = extractJanuaryJurnal(nameToCode);
console.log(`January Journal entries: ${jurnalJanData.length}`);

// Combine journals (January first, then April)
const allJournals = [...jurnalJanData, ...jurnalAprData];
console.log(`Combined Journal entries: ${allJournals.length}`);

const asetData = extractAset();
console.log(`Assets: ${asetData.length}`);

// Write extracted data
const output = {
  coaData,
  jurnalJanData,
  jurnalAprData,
  allJournals,
  saldoAwalData,
  asetData,
};

fs.writeFileSync(
  path.join(__dirname, 'src/data/extractedData.json'),
  JSON.stringify(output, null, 2)
);

console.log('\nData extracted to src/data/extractedData.json');

// Print sample January journals
console.log('\n=== Sample January Journals ===');
allJournals.slice(0, 5).forEach(j => {
  console.log(`${j.id} | ${j.tanggal} | ${j.akunDebit} ${j.debit} | ${j.akunKredit} ${j.kredit} | ${j.keterangan}`);
});

console.log('\n=== Sample April Journals ===');
const janCount = jurnalJanData.length;
allJournals.slice(janCount, janCount + 5).forEach(j => {
  console.log(`${j.id} | ${j.tanggal} | ${j.akunDebit} ${j.debit} | ${j.akunKredit} ${j.kredit} | ${j.keterangan}`);
});