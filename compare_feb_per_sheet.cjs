/**
 * compare_feb_per_sheet.cjs
 * Detailed comparison of February 2026 database data vs each Excel sheet.
 */
const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const DIR = path.join(__dirname, 'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026');
const FEB_FILE = 'DRAFT AUDITED -LAMPIRAN LAPORAN BULAN FEBRUARI 2026.xlsx';

function num(v) {
  if (typeof v === 'number') return v;
  if (!v || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function fmt(n) { return Math.round(n).toLocaleString('id-ID'); }
function sep(char='-', len=90) { return char.repeat(len); }

async function getDbBalances(db) {
  return new Promise((res, rej) => {
    db.all(`SELECT akun_debit, akun_kredit, debit, kredit FROM journals WHERE tanggal LIKE '2026-02%' AND status='posted'`, (err, rows) => {
      if (err) return rej(err);
      const b = {};
      rows.forEach(r => {
        const d = r.akun_debit ? String(r.akun_debit).split(' ')[0] : null;
        const k = r.akun_kredit ? String(r.akun_kredit).split(' ')[0] : null;
        if (d) b[d] = (b[d]||0) + num(r.debit);
        if (k) b[k] = (b[k]||0) - num(r.kredit);
      });
      res(b);
    });
  });
}

function compareAndPrint(sheetName, xlData, dbBal, matchFn) {
  console.log('\n' + sep('='));
  console.log(`SHEET: ${sheetName}`);
  console.log(sep('='));

  let allMatch = true;
  const rows = [];
  xlData.forEach(({ label, code, xlVal }) => {
    const dbVal = matchFn ? matchFn(code, dbBal) : (dbBal[code]||0);
    const diff = Math.round(xlVal) - Math.round(dbVal);
    const status = Math.abs(diff) <= 1 ? '✅ MATCH' : '❌ DIFF';
    if (Math.abs(diff) > 1) allMatch = false;
    rows.push({ label, code, xlVal: Math.round(xlVal), dbVal: Math.round(dbVal), diff, status });
  });

  if (rows.length === 0) {
    console.log('  (No comparable data found in this sheet)');
    return;
  }

  console.log(
    'Account'.padEnd(12) + ' ' +
    'Description'.padEnd(40) + ' ' +
    'Excel'.padStart(17) + ' ' +
    'DB'.padStart(17) + ' ' +
    'Diff'.padStart(15) + ' ' +
    'Status'
  );
  console.log(sep('-'));

  rows.forEach(({ label, code, xlVal, dbVal, diff, status }) => {
    const c = String(code||'').padEnd(12);
    const l = label.slice(0,39).padEnd(40);
    const x = fmt(xlVal).padStart(17);
    const d = fmt(dbVal).padStart(17);
    const df = fmt(diff).padStart(15);
    console.log(`${c} ${l} ${x} ${d} ${df} ${status}`);
  });

  console.log(sep('-'));
  console.log(`Result: ${allMatch ? '✅ ALL MATCH' : '❌ HAS DIFFERENCES'} (${rows.length} accounts checked)`);
}

// ── Sheet Parsers ────────────────────────────────────────────────────────────

function parseLabaRugiLampiran(wb) {
  const ws = wb.Sheets['DATA LAMPIRAN LABA RUGI 2026'];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // Row 0: months (col 3=Jan, col 5=Feb, ...)
  // Row 1: D/K headers
  // Data starts row 2. For Feb: col 5 = K (credit/income), col 4 for the  offset but we want net
  const out = [];
  rows.slice(2).forEach(r => {
    const code = String(r[0]||'').trim();
    const label = String(r[1]||'').trim();
    const febD = num(r[4]); // Feb Debit
    const febK = num(r[5]); // Feb Kredit
    if (!code || !label) return;
    if (febD === 0 && febK === 0) return;
    out.push({ code, label, xlVal: febK - febD }); // income/expense: K-D = net credit position
  });
  return out;
}

function parseNeracaLampiran(wb) {
  const ws = wb.Sheets['DATA LAMPIRAN NERACA'];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const out = [];
  rows.slice(2).forEach(r => {
    const code = String(r[1]||'').trim();
    const label = String(r[2]||'').trim();
    const dAmt = num(r[5]);
    const kAmt = num(r[6]);
    if (!code || !label || !/^\d/.test(code)) return;
    if (dAmt === 0 && kAmt === 0) return;
    out.push({ code, label, xlVal: dAmt - kAmt }); // trial balance: D-K
  });
  return out;
}

function parseNeracaFeb(wb) {
  // NERACA FEB 2026 — balance sheet presentation. We look for account totals
  const ws = wb.Sheets['NERACA FEB 2026'];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const out = [];
  // This sheet has formatted data — find rows with named accounts and 2 numeric columns
  const NAMED = [
    { match: /kas kecil/i,    code: '11101', label: 'Kas Kecil' },
    { match: /bank kalsel/i,  code: '11103', label: 'Bank Kalsel' },
    { match: /bank bni bisnis/i, code: '11106', label: 'Bank BNI Bisnis' },
    { match: /bank bni tapcash/i, code: '11107', label: 'Bank BNI Tapcash' },
    { match: /^bank bni(?! bisnis)(?! tapcash)/i, code: '11104', label: 'Bank BNI' },
    { match: /piutang usaha/i, code: '11201', label: 'Piutang Usaha' },
    { match: /persediaan.*bapok/i, code: '11401', label: 'Persediaan Bapok' },
    { match: /persediaan.*gas/i, code: '11402', label: 'Persediaan Gas LPG' },
    { match: /bbm dibayar/i,  code: '11501', label: 'BBM Dibayar di Muka' },
    { match: /utang biaya/i,  code: '21500', label: 'Utang Biaya' },
  ];
  rows.forEach(r => {
    const text = r.map(c => String(c||'').trim()).join(' ');
    for (const { match, code, label } of NAMED) {
      if (match.test(text)) {
        // find the last numeric column (Feb balance)
        const nums = r.map(num).filter(n => Math.abs(n) > 100);
        if (nums.length > 0) {
          const xlVal = nums[nums.length - 1];
          out.push({ code, label, xlVal });
        }
      }
    }
  });
  return out;
}

function parseLrPeriodFeb(wb) {
  const ws = wb.Sheets['LR PERIOD FEB'];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const LABELS = [
    { match: /pendapatan bisnis utama/i,     code: '41000', label: 'Pendapatan Bisnis Utama' },
    { match: /pendapatan.*bisnis lain/i,     code: '42000', label: 'Pendapatan Bisnis Lainnya' },
    { match: /beban gaji/i,                  code: '61010', label: 'Beban Gaji' },
    { match: /beban tunjangan.*umum/i,       code: '61020', label: 'Beban Tunjangan Pegawai Umum' },
    { match: /beban uang makan/i,            code: '61030', label: 'Beban Uang Makan' },
    { match: /beban lembur/i,                code: '61040', label: 'Beban Lembur' },
    { match: /beban transport/i,             code: '61050', label: 'Beban Transport' },
    { match: /beban bbm/i,                   code: '61060', label: 'Beban BBM' },
    { match: /beban listrik/i,               code: '61070', label: 'Beban Listrik' },
    { match: /beban atk/i,                   code: '61080', label: 'Beban ATK' },
    { match: /beban rapat/i,                 code: '61090', label: 'Beban Rapat' },
    { match: /beban telepon/i,               code: '61100', label: 'Beban Telepon/Internet' },
    { match: /beban premi/i,                 code: '61110', label: 'Beban Premi BPJS' },
    { match: /beban penyusutan/i,            code: '61130', label: 'Beban Penyusutan' },
    { match: /beban jasa.*manajemen/i,       code: '61140', label: 'Beban Jasa Manajemen' },
    { match: /beban gaji.*op/i,              code: '62010', label: 'Beban Gaji Operasional' },
    { match: /beban tunjangan.*op/i,         code: '62020', label: 'Beban Tunjangan Operasional' },
    { match: /beban perlengkapan/i,          code: '62030', label: 'Beban Perlengkapan' },
    { match: /beban seragam/i,               code: '62040', label: 'Beban Seragam' },
    { match: /beban mck/i,                   code: '62050', label: 'Beban MCK' },
    { match: /beban pemeliharaan.*aset/i,    code: '62060', label: 'Beban Pemeliharaan Aset' },
    { match: /beban pemeliharaan.*listrik/i, code: '62070', label: 'Beban Pemeliharaan Listrik' },
    { match: /beban air/i,                   code: '62090', label: 'Beban Air' },
    { match: /beban.*keamanan/i,             code: '62100', label: 'Beban Keamanan' },
    { match: /pendapatan.*luar/i,            code: '70001', label: 'Pendapatan di Luar Operasional' },
    { match: /beban.*di luar/i,              code: '80001', label: 'Beban di Luar Operasional' },
  ];
  const out = [];
  rows.forEach(r => {
    const text = r.map(c => String(c||'')).join(' ');
    for (const { match, code, label } of LABELS) {
      if (match.test(text) && !out.some(o => o.code === code)) {
        const nums = r.map(num).filter(n => Math.abs(n) > 100);
        if (nums.length > 0) out.push({ code, label, xlVal: nums[0] });
      }
    }
  });
  return out;
}

function parseArusKas(wb) {
  const ws = wb.Sheets['ARUS KAS 2026'];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const ITEMS = [
    { match: /penyusutan aset tetap/i,    code: '61130', label: 'Penyusutan Aset Tetap' },
    { match: /piutang usaha/i,            code: '11201', label: 'Piutang Usaha' },
    { match: /persediaan.*bapok/i,        code: '11401', label: 'Persediaan Bapok' },
    { match: /bbm dibayar/i,              code: '11501', label: 'BBM Dibayar di Muka' },
    { match: /utang biaya/i,              code: '21500', label: 'Utang Biaya' },
  ];
  const out = [];
  rows.forEach(r => {
    const text = r.map(c => String(c||'')).join(' ');
    for (const { match, code, label } of ITEMS) {
      if (match.test(text) && !out.some(o => o.code === code)) {
        const nums = r.filter(c => typeof c === 'number' && Math.abs(c) > 100);
        if (nums.length >= 2) out.push({ code, label, xlVal: nums[1] }); // col 1 = Jan, col 2 = Feb
        else if (nums.length === 1) out.push({ code, label, xlVal: nums[0] });
      }
    }
  });
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  const dbBal = await getDbBalances(db);
  const wb = XLSX.readFile(path.join(DIR, FEB_FILE));

  console.log('\n' + sep('*'));
  console.log('  FEBRUARY 2026 — PER-SHEET DATA COMPARISON: DATABASE vs EXCEL');
  console.log(sep('*'));
  console.log('Comparing DB journal entries (Feb 2026) vs each Excel sheet.\n');

  // 1. DATA LAMPIRAN LABA RUGI 2026
  const lrData = parseLabaRugiLampiran(wb);
  if (lrData && lrData.length) {
    // DB stores income as negative (credit) so xlVal (K-D) should match -dbBal for income/expense
    compareAndPrint('DATA LAMPIRAN LABA RUGI 2026', lrData, dbBal, (code, db) => {
      // Income (4xxxx) in DB is negative, expense (5/6/7/8xxxx) is positive
      const raw = db[code] || 0;
      // For income/revenue, DB = negative = credit normal. We flip to absolute for reporting match.
      if (/^[45678]/.test(code)) return Math.abs(raw);
      return raw;
    });
  } else {
    console.log('\n' + sep('='));
    console.log('SHEET: DATA LAMPIRAN LABA RUGI 2026');
    console.log(sep('='));
    console.log('  (February column is empty in this sheet — data not populated by finance team)');
  }

  // 2. DATA LAMPIRAN NERACA
  const neracaData = parseNeracaLampiran(wb);
  if (neracaData) {
    compareAndPrint('DATA LAMPIRAN NERACA', neracaData, dbBal, (code, db) => db[code]||0);
  }

  // 3. NERACA FEB 2026 (Balance Sheet Presentation)
  const neracaFeb = parseNeracaFeb(wb);
  if (neracaFeb && neracaFeb.length) {
    compareAndPrint('NERACA FEB 2026', neracaFeb, dbBal, (code, db) => Math.abs(db[code]||0));
  }

  // 4. LR PERIOD FEB (Income Statement)
  const lrPeriodFeb = parseLrPeriodFeb(wb);
  if (lrPeriodFeb && lrPeriodFeb.length) {
    compareAndPrint('LR PERIOD FEB', lrPeriodFeb, dbBal, (code, db) => Math.abs(db[code]||0));
  }

  // 5. ARUS KAS 2026 (Cash Flow)
  const arusKas = parseArusKas(wb);
  if (arusKas && arusKas.length) {
    compareAndPrint('ARUS KAS 2026 (Feb column)', arusKas, dbBal, (code, db) => Math.abs(db[code]||0));
  }

  // 6. LAPORAN PERUBAHAN EKUITAS — just read and describe
  console.log('\n' + sep('='));
  console.log('SHEET: LAPORAN PERUBAHAN EKUITAS');
  console.log(sep('='));
  const wsLPE = wb.Sheets['LAPORAN PERUBAHAN EKUITAS'];
  const lpeRows = XLSX.utils.sheet_to_json(wsLPE, { header: 1, defval: '' });
  const lpeData = lpeRows.filter(r => r.some(c => typeof c === 'number' && c > 1000));
  lpeData.slice(0, 8).forEach(r => {
    const label = r.find(c => typeof c === 'string' && c.length > 3) || '';
    const nums = r.filter(c => typeof c === 'number' && Math.abs(c) > 1000);
    if (label || nums.length) {
      console.log('  ' + String(label).padEnd(55) + nums.map(n => fmt(n).padStart(20)).join(''));
    }
  });
  console.log('\n  ℹ️  NOTE: This sheet contains static 2025 template data, not dynamic Feb 2026 data.');

  db.close();
}

main().catch(console.error);
