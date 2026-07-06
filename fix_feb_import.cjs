/**
 * fix_feb_import.cjs
 * Re-imports February 2026 journal with corrected account code resolution.
 * 
 * Problem: The JURNAL FEB 2026 B.03 period-end batch has:
 *   - Sequential row counters in col0 instead of real account codes
 *   - Code 61140 misused for bank/income/piutang accounts
 *   - Codes 561510/611547 for penyusutan (should be 61130/12xxx.2)
 * 
 * Fix: Resolve account code from col3 (account name) via COA name lookup
 *      when col0 is not a valid 4-6 digit account code.
 */
const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const DIR = path.join(__dirname, 'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026');
const FEB_FILE = 'DRAFT AUDITED -LAMPIRAN LAPORAN BULAN FEBRUARI 2026.xlsx';
const FEB_SHEET = 'JURNAL FEB 2026';

function dbRun(db, sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function(e) { e ? rej(e) : res(this) }));
}
function dbGet(db, sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
}

function num(v) {
  if (typeof v === 'number') return v;
  if (!v || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function xlDate(val, fallback) {
  if (!val && val !== 0) return fallback + '-01';
  if (typeof val === 'number' && val > 40000) {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  return fallback + '-01';
}

// Build name → code lookup from COA (and common aliases)
function buildCOALookup(db) {
  return new Promise((res) => {
    db.all('SELECT code, name FROM coa', (e, rows) => {
      const byName = {};
      rows.forEach(r => { byName[(r.name||'').toLowerCase().trim()] = r.code; });
      res(byName);
    });
  });
}

// Known name → code mappings for accounts not always in COA
const FIXED_NAME_MAP = {
  'bank kalsel': '11103',
  'bank bni bisnis': '11106',
  'bank bni tapcash': '11107',
  'bank bni': '11104',
  'kas kecil': '11101',
  'bbm dibayar di muka': '11501',
  'piutang usaha': '11201',
  'persediaan barang dagang': '11401',
  'persediaan barang dagang (gas lpg)': '11402',
  'utang daerah': '21000',
  'pendapatan bisnis utama': '41000',
  'pendapatan bisnis lainnya': '42000',
  'pendapatan pengembangan bisnis lainnya': '42000',
  'pendapatan di luar operasional': '70000',
  'beban di luar operasional': '80000',
  'beban pokok penjualan (bapok & gerai inflasi)': '51010',
  'beban pokok penjualan (gas lpg)': '51020',
  'akumulasi penyusutan bangunan': '12102.2',
  'akumulasi penyusutan kendaraan': '12201.2',
  'akumulasi penyusutan mesin': '12202.2',
  'akumulasi penyusutan instalasi listrik': '12203.2',
  'akumulasi penyusutan peralatan': '12204.2',
  'beban penyusutan aktiva tetap': '61130',
};

// Determine if col0 is a valid account code (4-6 digits, known COA prefix)
function isValidCode(raw) {
  if (!raw) return false;
  // Must be 4-6 chars and start with known account prefix
  return /^\d{4,6}(\.\d+)?$/.test(raw) && /^(11|12|13|21|22|31|32|33|34|41|42|43|51|61|62|70|80)\d/.test(raw);
}

// Misused codes that must be resolved by name instead
const FORCE_NAME_LOOKUP = new Set(['61140', '561510', '611547']);

function resolveCode(codeRaw, name, nameLookup) {
  const nameKey = (name || '').toLowerCase().trim();
  
  // Force name lookup for known misused codes
  if (FORCE_NAME_LOOKUP.has(codeRaw) || !isValidCode(codeRaw)) {
    // Try fixed map first (exact match)
    if (FIXED_NAME_MAP[nameKey]) return FIXED_NAME_MAP[nameKey];
    
    // Try substring matches in fixed map
    for (const [k, v] of Object.entries(FIXED_NAME_MAP)) {
      if (nameKey.includes(k) || k.includes(nameKey.split(' ').slice(0,2).join(' '))) return v;
    }
    
    // Try COA name lookup
    if (nameLookup[nameKey]) return nameLookup[nameKey];
    
    // Partial match in COA
    for (const [k, v] of Object.entries(nameLookup)) {
      if (nameKey && k.includes(nameKey)) return v;
    }
    
    // Last resort: specific keyword detection
    if (nameKey.includes('bank kalsel')) return '11103';
    if (nameKey.includes('bank bni bisnis')) return '11106';
    if (nameKey.includes('bank bni tapcash')) return '11107';
    if (nameKey.includes('bank bni')) return '11104';
    if (nameKey.includes('kas kecil')) return '11101';
    if (nameKey.includes('bbm dibayar')) return '11501';
    if (nameKey.includes('piutang usaha')) return '11201';
    if (nameKey.includes('utang')) return '21000';
    if (nameKey.includes('persediaan')) return '11401';
    if (nameKey.includes('pendapatan bisnis utama') || nameKey.includes('pendapatan pengelolaan') || 
        nameKey.includes('pendapatan sewa') || nameKey.includes('pendapatan pemeliharaan') ||
        nameKey.includes('pendapatan denda') || nameKey.includes('pendapatan sampah') ||
        nameKey.includes('pendapatan keamanan')) return '41000';
    if (nameKey.includes('pendapatan parkir') || nameKey.includes('pendapatan bisnis lainnya') || 
        nameKey.includes('pendapatan iklan') || nameKey.includes('pendapatan pusat') ||
        nameKey.includes('pendapatan sewa tempat') || nameKey.includes('pendapatan studio') ||
        nameKey.includes('pendapatan gerai') || nameKey.includes('pendapatan air') ||
        nameKey.includes('pendapatan gas lpg')) return '42000';
    if (nameKey.includes('pendapatan bunga') || nameKey.includes('pendapatan lain')) return '70000';
    if (nameKey.includes('beban pajak') || nameKey.includes('beban administrasi bank') ||
        nameKey.includes('beban lain') || nameKey.includes('beban di luar')) return '80000';
    if (nameKey.includes('penyusutan') && nameKey.includes('beban')) return '61130';
    if (nameKey.includes('akumulasi penyusutan kendaraan')) return '12201.2';
    if (nameKey.includes('akumulasi penyusutan bangunan')) return '12102.2';
    if (nameKey.includes('akumulasi penyusutan mesin')) return '12202.2';
    if (nameKey.includes('akumulasi penyusutan peralatan')) return '12204.2';
    if (nameKey.includes('akumulasi penyusutan instalasi')) return '12203.2';
    
    return codeRaw; // fallback
  }
  
  return codeRaw; // code is valid, use as-is
}

async function main() {
  console.log('=== FEB 2026 JOURNAL RE-IMPORT ===\n');
  
  const db = new sqlite3.Database(DB_PATH);
  const nameLookup = await buildCOALookup(db);
  console.log(`COA name lookup: ${Object.keys(nameLookup).length} entries`);
  
  // Delete existing Feb XL- entries
  const del = await dbRun(db, "DELETE FROM journals WHERE id LIKE 'XL-2026-02-%'");
  console.log(`Deleted ${del.changes} existing Feb XL- entries\n`);
  
  // Read Excel
  const wb = XLSX.readFile(path.join(DIR, FEB_FILE));
  const ws = wb.Sheets[FEB_SHEET];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  
  // Find header row
  const hIdx = rows.findIndex(r => r.some(c => String(c||'').toLowerCase().includes('tgl')));
  const dataRows = rows.slice(hIdx + 1);
  console.log(`Total data rows: ${dataRows.length}`);
  
  let curDate = null, curJNo = null;
  const groups = [];
  let curGroup = null;
  
  dataRows.forEach(r => {
    if (r[1] && typeof r[1] === 'number' && r[1] > 40000) curDate = r[1];
    if (r[2] && String(r[2]).match(/^B\./)) curJNo = String(r[2]).trim();
    
    const codeRaw = String(r[0] || '').trim();
    const name    = String(r[3] || '').trim();
    const subAkun = String(r[4] || '').trim();
    const dVal    = num(r[5]);
    const kVal    = num(r[6]);
    const ket     = String(r[7] || '').trim();
    
    if (!name || (dVal === 0 && kVal === 0)) return;
    
    const resolvedCode = resolveCode(codeRaw, name, nameLookup);
    const fullAkun = resolvedCode ? `${resolvedCode} ${name}` : name;
    const fullAkunWithSub = subAkun ? `${fullAkun} > ${subAkun}` : fullAkun;
    
    const key = `${curDate}|${curJNo}`;
    if (!curGroup || curGroup.key !== key) {
      curGroup = { key, date: curDate, no: curJNo, lines: [] };
      groups.push(curGroup);
    }
    curGroup.lines.push({ akun: fullAkunWithSub, d: dVal, k: kVal, ket });
  });
  
  console.log(`Groups found: ${groups.length}`);
  
  // Pair debits with credits
  const entries = [];
  groups.forEach(g => {
    const debitLines = g.lines.filter(l => l.d > 0);
    const kreditLines = g.lines.filter(l => l.k > 0);
    
    if (debitLines.length > 0 && kreditLines.length > 0) {
      // Pair each debit with the most relevant kredit (or first kredit)
      debitLines.forEach(dl => {
        const kl = kreditLines[0]; // simple: pair with first kredit
        entries.push({
          id: `XL-2026-02-${g.no || 'XX'}-${entries.length}`,
          tanggal: xlDate(g.date, '2026-02'),
          akun_debit: dl.akun,
          akun_kredit: kl.akun,
          debit: dl.d,
          kredit: dl.d,
          keterangan: dl.ket || kl.ket,
          status: 'posted'
        });
      });
      kreditLines.slice(1).forEach(kl => {
        const dl = debitLines[0];
        entries.push({
          id: `XL-2026-02-${g.no || 'XX'}-k${entries.length}`,
          tanggal: xlDate(g.date, '2026-02'),
          akun_debit: dl.akun,
          akun_kredit: kl.akun,
          debit: kl.k,
          kredit: kl.k,
          keterangan: dl.ket || kl.ket,
          status: 'posted'
        });
      });
    } else {
      // Single-sided: store as-is
      g.lines.forEach(l => {
        if (l.d > 0 || l.k > 0) {
          entries.push({
            id: `XL-2026-02-${g.no || 'XX'}-s${entries.length}`,
            tanggal: xlDate(g.date, '2026-02'),
            akun_debit: l.d > 0 ? l.akun : '',
            akun_kredit: l.k > 0 ? l.akun : '',
            debit: l.d,
            kredit: l.k,
            keterangan: l.ket,
            status: 'posted'
          });
        }
      });
    }
  });
  
  console.log(`Entries to insert: ${entries.length}`);
  
  // Insert
  let inserted = 0;
  for (const e of entries) {
    try {
      await dbRun(db, `INSERT OR REPLACE INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.tanggal, e.akun_debit, e.akun_kredit, e.debit, e.kredit, e.keterangan, e.status]);
      inserted++;
    } catch(err) {
      console.log('Insert error:', err.message, e.id);
    }
  }
  console.log(`\nInserted: ${inserted} entries`);
  
  // Validate
  console.log('\n=== VALIDATION vs Excel ===');
  function chk(label, actual, expected) {
    const ok = Math.abs(actual - expected) < 2000000 ? '✅' : '⚠️';
    console.log(ok + ' ' + label.padEnd(30) + Math.round(actual).toLocaleString().padStart(18) + ' | Excel: ' + expected.toLocaleString());
  }
  
  const p41 = await dbGet(db, "SELECT SUM(kredit) as t FROM journals WHERE akun_kredit LIKE '41%' AND tanggal LIKE '2026-02%' AND status='posted'");
  const p42 = await dbGet(db, "SELECT SUM(kredit) as t FROM journals WHERE akun_kredit LIKE '42%' AND tanggal LIKE '2026-02%' AND status='posted'");
  const bpp = await dbGet(db, "SELECT SUM(debit) as t FROM journals WHERE akun_debit LIKE '51%' AND tanggal LIKE '2026-02%' AND status='posted'");
  const b61d = await dbGet(db, "SELECT SUM(debit) as t FROM journals WHERE akun_debit LIKE '61%' AND tanggal LIKE '2026-02%' AND status='posted'");
  const b61k = await dbGet(db, "SELECT SUM(kredit) as t FROM journals WHERE akun_kredit LIKE '61%' AND tanggal LIKE '2026-02%' AND status='posted'");
  const b62d = await dbGet(db, "SELECT SUM(debit) as t FROM journals WHERE akun_debit LIKE '62%' AND tanggal LIKE '2026-02%' AND status='posted'");
  const b62k = await dbGet(db, "SELECT SUM(kredit) as t FROM journals WHERE akun_kredit LIKE '62%' AND tanggal LIKE '2026-02%' AND status='posted'");
  
  const p41v = p41.t || 0;
  const p42v = p42.t || 0;
  const bppv = bpp.t || 0;
  const b61v = (b61d.t || 0) - (b61k.t || 0);
  const b62v = (b62d.t || 0) - (b62k.t || 0);
  
  chk('Pend Bisnis Utama (41)', p41v, 462831403);
  chk('Pend Bisnis Lainnya (42)', p42v, 152976000);
  chk('BPP', bppv, 26039000);
  chk('Beban Admin (61)', b61v, 733937129);
  chk('Beban Ops (62)', b62v, 321459938);
  
  const labaUsaha = (p41v + p42v) - bppv - b61v - b62v;
  chk('LABA USAHA', labaUsaha, -465628664);
  
  db.close();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
