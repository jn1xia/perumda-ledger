/**
 * regenerateData.cjs
 * Complete re-extraction of COA, Journals, Assets, Anggaran from Excel
 * Outputs: src/data/sampleData.json (for server seeding)
 * 
 * Key fixes:
 * - COA matches Excel exactly (headers + posting accounts)
 * - Saldo awal from "Rekap Akun & Saldo (thn)" sheet
 * - Proper hierarchy with parent_code assignments
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const APR_FILE = path.join(__dirname, 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx');
const JAN_FILE = path.join(__dirname, 'src/FILES/DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx');

const wbApr = XLSX.readFile(APR_FILE);
const wbJan = XLSX.readFile(JAN_FILE);

// ═══════════════════════════════════════════════════════════════════
// 1. COA - EXACT match from Excel "COA" sheet
// ═══════════════════════════════════════════════════════════════════
const wsCOA = wbApr.Sheets['COA'];
const rawCOA = XLSX.utils.sheet_to_json(wsCOA, { header: 1, defval: '' });

// Get Saldo Awal from "DATA LAMPIRAN NERACA" (audited values)
const wsNeraca = wbApr.Sheets['DATA LAMPIRAN NERACA'];
const rawNeraca = wsNeraca ? XLSX.utils.sheet_to_json(wsNeraca, { header: 1, defval: '' }) : [];
const saldoAwalMap = {};
rawNeraca.forEach(r => {
  const code = String(r[1]).trim(); // col1 = account code
  if (code.match(/^\d/)) {
    const saldoAwal = typeof r[4] === 'number' ? r[4] : 0; // col4 = SALDO AWAL
    saldoAwalMap[code] = { saldoAwal };
  }
});
// Also get from "Rekap Akun & Saldo (thn)" for codes not in DATA LAMPIRAN
const wsRekap = wbApr.Sheets['Rekap Akun & Saldo (thn)'];
const rawRekap = wsRekap ? XLSX.utils.sheet_to_json(wsRekap, { header: 1, defval: '' }) : [];
rawRekap.forEach(r => {
  const code = String(r[0]).trim();
  if (code.match(/^\d/) && !saldoAwalMap[code]) {
    saldoAwalMap[code] = {
      saldoAwal: typeof r[3] === 'number' ? r[3] : 0,
    };
  }
});

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

// Map header names to parent codes
const headerToParentCode = {
  'ASET': '1',
  'Aktiva Lancar': '11',
  'Properti Investasi': '12',
  'Aset Tetap': '12',
  'Aset Lainnya': '13',
  'KEWAJIBAN': '2',
  'Kewajiban Jangka Pendek': '21',
  'Kewajiban Jangka Panjang': '22',
  'EKUITAS': '3',
  'PENDAPATAN': '4',
  'Pendapatan Bisnis Utama': '41',
  'Pendapatan Bisnis Lainnya': '42',
  'BEBAN': '6',
  'Beban Administrasi & Umum': '61',
  'Beban Operasional dan Bisnis': '62',
  'PENDAPATAN DAN BEBAN LAIN-LAIN': '7',
  'BEBAN LAIN': '8',
  'BBM Pra Bayar': '11',
};

// Build COA list - preserve all headers and posting accounts
const coaAccounts = [];
let currentParentCode = '';
let idCounter = 1;

// First add hierarchy parents
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

// Add hierarchy parents first
hierarchyParents.forEach(p => {
  coaAccounts.push({ id: idCounter++, ...p, saldo_awal: 0 });
});

// Now process the raw COA from Excel
rawCOA.forEach(r => {
  const code = r[0];
  const name = String(r[1] || '').trim();
  if (!name) return;
  
  if (!code || code === '') {
    // Header row - update current parent code
    currentParentCode = headerToParentCode[name] || currentParentCode;
    return;
  }
  
  const codeStr = String(code);
  
  // Determine parent code based on the code prefix
  let parent_code = currentParentCode;
  if (codeStr.length >= 5) {
    // 5-digit codes: parent = first 2 digits
    parent_code = codeStr.substring(0, 2);
  } else if (codeStr.includes('.')) {
    // Codes like 12102.1: parent = first 2 digits
    parent_code = codeStr.split('.')[0].substring(0, 2);
    if (codeStr.split('.')[0].length >= 4) {
      parent_code = codeStr.split('.')[0].substring(0, 2);
    }
  }
  
  const sal = saldoAwalMap[codeStr];
  
  coaAccounts.push({
    id: idCounter++,
    code: codeStr,
    name: name,
    type: 'posting',
    category: getCategory(codeStr),
    parent_code: parent_code,
    saldo_awal: sal ? sal.saldoAwal : 0,
  });
});

console.log('COA accounts extracted:', coaAccounts.length);
console.log('  - Hierarchy parents:', hierarchyParents.length);
console.log('  - Posting accounts:', coaAccounts.filter(a => a.type === 'posting').length);

// ═══════════════════════════════════════════════════════════════════
// 2. JOURNALS - from both January and April
// ═══════════════════════════════════════════════════════════════════
function snToDate(sn) {
  const d = new Date((sn - 25569) * 86400 * 1000);
  return d.toISOString().split('T')[0];
}

// Build name->code map for January lookups
const nameToCode = {};
coaAccounts.filter(a => a.type === 'posting').forEach(a => {
  nameToCode[a.name.toLowerCase()] = a.code;
});
// Manual overrides for common mismatches
nameToCode['beban lain lain'] = '80000';
nameToCode['bank bni tapcash'] = '11101';

function janLookup(name) {
  const key = name.toLowerCase().trim();
  if (nameToCode[key]) return nameToCode[key];
  for (const [n, c] of Object.entries(nameToCode)) {
    if (n.includes(key) || key.includes(n)) return c;
  }
  return null;
}

// APRIL JOURNALS
const wsAprJurnal = wbApr.Sheets['JURNAL APRIL 2026'];
const rawAprJurnal = XLSX.utils.sheet_to_json(wsAprJurnal, { header: 1, defval: '' });
const aprJournals = [];
let jid = 1;

const dateGroups = {};
for (let i = 3; i < rawAprJurnal.length; i++) {
  const r = rawAprJurnal[i];
  const dateSN = r[1];
  if (!dateSN || typeof dateSN !== 'number') continue;
  const accName = r[3] || '';
  if (!accName || accName === 'Tgl') continue;
  const debit = Number(r[5]) || 0;
  const kredit = Number(r[6]) || 0;
  if (!debit && !kredit) continue;
  if (!dateGroups[dateSN]) dateGroups[dateSN] = [];
  dateGroups[dateSN].push({
    accCode: r[0], accName, sub: r[4] || '', debit, kredit,
    bukti: String(r[2] || ''), ket: String(r[7] || '').trim(),
  });
}

Object.keys(dateGroups).sort((a,b) => a-b).forEach(dateSN => {
  const rows = dateGroups[dateSN];
  const tanggal = snToDate(Number(dateSN));
  const buktiMap = {};
  rows.forEach(r => { const key = r.bukti; if (!buktiMap[key]) buktiMap[key] = []; buktiMap[key].push(r); });

  Object.values(buktiMap).forEach(buktiRows => {
    const debits = buktiRows.filter(r => r.debit > 0);
    const credits = buktiRows.filter(r => r.kredit > 0);
    if (debits.length === 0 || credits.length === 0) return;

    const addEntry = (dRow, cRow, ket) => {
      aprJournals.push({
        id: 'JV-2026-' + String(jid++).padStart(3, '0'),
        tanggal, keterangan: ket || dRow.accName,
        debit: dRow.debit, kredit: cRow.kredit, status: 'posted',
        akun_debit: dRow.accCode + ' - ' + dRow.accName,
        akun_kredit: cRow.accCode + ' - ' + cRow.accName,
        bukti: dRow.bukti
      });
    };

    if (debits.length === 1 && credits.length === 1) {
      addEntry(debits[0], credits[0], buktiRows[0].ket || debits[0].accName);
    } else if (debits.length >= 1 && credits.length === 1) {
      debits.forEach(d => addEntry(d, credits[0], buktiRows[0].ket || d.accName));
    } else if (debits.length === 1 && credits.length > 1) {
      credits.forEach(c => addEntry(debits[0], c, buktiRows[0].ket || debits[0].accName));
    } else {
      const used = new Set();
      debits.forEach(d => {
        let found = false;
        credits.forEach((c, ci) => {
          if (!used.has(ci) && Math.abs(c.kredit - d.debit) < 1 && !found) {
            addEntry(d, c, buktiRows[0].ket || d.accName); used.add(ci); found = true;
          }
        });
        if (!found) {
          const ci = credits.findIndex((_, i) => !used.has(i));
          if (ci >= 0) { addEntry(d, credits[ci], buktiRows[0].ket || d.accName); used.add(ci); }
        }
      });
    }
  });
});
console.log('April journals:', aprJournals.length);

// JANUARY JOURNALS
const wsJanJurnal = wbJan.Sheets['JURNAL JAN 2026'];
const rawJanJurnal = XLSX.utils.sheet_to_json(wsJanJurnal, { header: 1, defval: '' });
const janDateGroups = {};
for (let i = 3; i < rawJanJurnal.length; i++) {
  const r = rawJanJurnal[i];
  const dateSN = r[0];
  if (!dateSN || typeof dateSN !== 'number') continue;
  const name = r[2] || '';
  if (!name) continue;
  const debit = Number(r[4]) || 0;
  const kredit = Number(r[5]) || 0;
  if (!debit && !kredit) continue;
  if (!janDateGroups[dateSN]) janDateGroups[dateSN] = [];
  janDateGroups[dateSN].push({ name, debit, kredit, ket: String(r[6]||'').trim() });
}

const janJournals = [];
Object.keys(janDateGroups).sort((a,b) => a-b).forEach(dateSN => {
  const rows = janDateGroups[dateSN];
  const tanggal = snToDate(Number(dateSN));
  const debits = rows.filter(r => r.debit > 0).map(r => ({ ...r, code: janLookup(r.name) || '11101' }));
  const credits = rows.filter(r => r.kredit > 0).map(r => ({ ...r, code: janLookup(r.name) || '11101' }));
  if (debits.length === 0 || credits.length === 0) return;

  const addEntry = (d, c, ket) => {
    janJournals.push({
      id: 'JAN-' + String(jid++).padStart(3, '0'),
      tanggal, keterangan: ket || d.name,
      debit: d.debit, kredit: c.kredit, status: 'posted',
      akun_debit: d.code + ' - ' + d.name,
      akun_kredit: c.code + ' - ' + c.name,
      bukti: 'JAN'
    });
  };

  if (debits.length === 1 && credits.length === 1) {
    addEntry(debits[0], credits[0], debits[0].ket || credits[0].ket);
  } else if (debits.length >= 1 && credits.length === 1) {
    debits.forEach(d => addEntry(d, credits[0], d.ket));
  } else if (debits.length === 1 && credits.length > 1) {
    credits.forEach(c => addEntry(debits[0], c, c.ket));
  } else {
    const used = new Set();
    debits.forEach(d => {
      let found = false;
      credits.forEach((c, ci) => {
        if (!used.has(ci) && Math.abs(c.kredit - d.debit) < 1 && !found) {
          addEntry(d, c, d.ket); used.add(ci); found = true;
        }
      });
      if (!found) {
        const ci = credits.findIndex((_, i) => !used.has(i));
        if (ci >= 0) { addEntry(d, credits[ci], d.ket); used.add(ci); }
      }
    });
  }
});
console.log('January journals:', janJournals.length);

const combinedJournals = [...janJournals, ...aprJournals];
console.log('Total journals:', combinedJournals.length);

// ═══════════════════════════════════════════════════════════════════
// 3. ASSETS from "DAFTAR AKTIVA TETAP"
// ═══════════════════════════════════════════════════════════════════
const wsAset = wbApr.Sheets['DAFTAR AKTIVA TETAP'];
const rawAset = XLSX.utils.sheet_to_json(wsAset, { header: 1, defval: '' });
const assets = [];
let curKategori = '';
for (let i = 5; i < rawAset.length; i++) {
  const r = rawAset[i];
  const no = r[0], nama = r[1] || '';
  if (typeof no === 'string' && no.match(/^[IV]+\./)) {
    if (nama.includes('TANAH') || no.includes('TANAH')) curKategori = 'Tanah';
    else if (nama.includes('BANGUNAN') || no.includes('BANGUNAN')) curKategori = 'Bangunan';
    else if (nama.includes('KENDARAAN') || no.includes('KENDARAAN')) curKategori = 'Kendaraan';
    else if (nama.includes('MESIN') || no.includes('MESIN')) curKategori = 'Mesin';
    else if (nama.includes('INSTALASI') || no.includes('INSTALASI')) curKategori = 'Instalasi Listrik';
    else if (nama.includes('PERALATAN') || no.includes('PERALATAN')) curKategori = 'Peralatan';
    continue;
  }
  if (typeof no !== 'number' || !nama) continue;
  const tglSN = r[3];
  let tgl = '2025-01-01';
  if (typeof tglSN === 'number' && tglSN > 30000) {
    const dt = new Date((tglSN - 25569) * 86400 * 1000);
    tgl = dt.toISOString().split('T')[0];
  }
  assets.push({
    kode: 'AT-' + String(assets.length + 1).padStart(3, '0'),
    nama: nama.trim(), detail: String(r[2] || '').trim(),
    kategori: curKategori || 'Peralatan',
    tgl_perolehan: tgl,
    nilai_perolehan: Number(r[4]) || 0,
    penyusutan_per_tahun: Number(r[6]) || 0,
    penyusutan_per_bulan: Number(r[7]) || 0,
    beban_penyusutan_2025: Number(r[8]) || 0,
    nilai_penyusutan: Number(r[9]) || 0,
    nilai_buku: Number(r[10]) || 0,
    beban_penyusutan_maret_2026: Number(r[11]) || 0,
    akum_penyusutan_maret_2026: Number(r[12]) || 0,
    nilai_buku_maret_2026: Number(r[13]) || 0,
    umur_manfaat: curKategori === 'Tanah' ? '-' : (curKategori === 'Bangunan' ? '20 tahun' : '8 tahun'),
    keterangan: String(r[20] || '').trim()
  });
}
console.log('Assets:', assets.length);

// ═══════════════════════════════════════════════════════════════════
// 4. ANGGARAN from multiple sheets
// ═══════════════════════════════════════════════════════════════════
function extractBudgetSheet(wb, sheetName, category) {
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
      anggaran_awal: anggaran,
      target_bulan: Number(r[7]) || 0,
      sd_bln_lalu: Number(r[8]) || 0,
      bulan_ini: Number(r[9]) || 0,
      realisasi: sdIni,
      sisa: anggaran - sdIni,
      persentase: Number(r[11]) || 0,
      is_total: name.toUpperCase().includes('JUMLAH') || name.toUpperCase().includes('TOTAL') ? 1 : 0
    });
  }
  return data;
}

const allAnggaran = [
  ...extractBudgetSheet(wbApr, 'Penerimaan', 'penerimaan'),
  ...extractBudgetSheet(wbApr, 'Beban Investasi', 'bebanInvestasi'),
  ...extractBudgetSheet(wbApr, 'Beban Umum', 'bebanUmum'),
  ...extractBudgetSheet(wbApr, 'Beban Operasional ', 'bebanOperasional'),
];
console.log('Anggaran items:', allAnggaran.length);

// ═══════════════════════════════════════════════════════════════════
// 5. OUTPUT
// ═══════════════════════════════════════════════════════════════════
const jsonOutput = {
  journals: combinedJournals,
  coa: coaAccounts,
  assets: assets,
  anggaran: allAnggaran,
  rekonsiliasi: [],
  pengaturan: {
    namaPerusahaan: 'Perumda Pasar Baiman',
    npwp: '01.234.567.8-901.000',
    kota: 'Banjarmasin'
  }
};

const outPath = path.join(__dirname, 'src/data/sampleData.json');
fs.writeFileSync(outPath, JSON.stringify(jsonOutput, null, 2));
console.log('\n✅ Written to', outPath);
console.log('  Journals:', combinedJournals.length);
console.log('  COA:', coaAccounts.length);
console.log('  Assets:', assets.length);
console.log('  Anggaran:', allAnggaran.length);

// Verify COA sample
console.log('\n--- COA Sample (first 10 posting) ---');
coaAccounts.filter(a => a.type === 'posting').slice(0, 10).forEach(a => {
  console.log(`  [${a.code}] ${a.name} | parent: ${a.parent_code} | saldoAwal: ${a.saldo_awal}`);
});
