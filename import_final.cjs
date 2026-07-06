/**
 * import_final.cjs  
 * Definitive import combining:
 * - DATA LAMPIRAN (leaf accounts) → Revenue (41/42xxx) + BebanU (61xxx)
 * - LABA RUGI sheet (J-column aggregated) → BPP (51xxx) + BebanO (62xxx) + Non-op
 */
const xlsx = require('xlsx');
const db = require('./server/db/database.cjs');

// Accounts to always skip (group-level parents)
const ALWAYS_SKIP = new Set(['41000','42000','51000','61000','62000','70000','80000']);

// LABA RUGI sheet row → account code mapping (column J = current month)
const LR_ROW_MAP = {
  19: { code: '51010', name: 'Beban Pokok Penjualan (Bapok & Gerai Inflasi)', type: 'expense', contra: '11301 - Persediaan Barang' },
  20: { code: '51020', name: 'Beban Pokok Penjualan (Gas LPG)', type: 'expense', contra: '11301 - Persediaan Barang' },
  44: { code: '62011', name: 'Beban Pemeliharaan Kendaraan Operasional', type: 'expense', contra: '11103 - Bank Kalsel' },
  45: { code: '62021', name: 'Beban Pemeliharaan Bangunan Pasar', type: 'expense', contra: '11103 - Bank Kalsel' },
  46: { code: '62031', name: 'Beban Pemeliharaan Kebersihan Pasar', type: 'expense', contra: '11103 - Bank Kalsel' },
  47: { code: '62041', name: 'Beban Pelayanan dan Pemasaran', type: 'expense', contra: '11103 - Bank Kalsel' },
  48: { code: '62051', name: 'Beban Barang Cetakan', type: 'expense', contra: '11103 - Bank Kalsel' },
  49: { code: '62061', name: 'Beban Honor Tenaga Kontrak dan Harian Lepas', type: 'expense', contra: '11103 - Bank Kalsel' },
  50: { code: '62071', name: 'Beban Tunjangan Pegawai Operasional', type: 'expense', contra: '11103 - Bank Kalsel' },
  51: { code: '62081', name: 'Beban Kelengkapan Pegawai Operasional', type: 'expense', contra: '11103 - Bank Kalsel' },
  52: { code: '62091', name: 'Beban Insentif dan Kesejahteraan Pegawai', type: 'expense', contra: '11103 - Bank Kalsel' },
  61: { code: '70001', name: 'Pendapatan Bunga Bank', type: 'revenue', contra: '11103 - Bank Kalsel' },
  62: { code: '70002', name: 'Pendapatan Lebih Setor', type: 'revenue', contra: '11103 - Bank Kalsel' },
  63: { code: '70003', name: 'Pendapatan Lain-lain', type: 'revenue', contra: '11103 - Bank Kalsel' },
  66: { code: '80001', name: 'Beban Pajak Bank', type: 'expense', contra: '11103 - Bank Kalsel' },
  67: { code: '80002', name: 'Beban Administrasi Bank', type: 'expense', contra: '11103 - Bank Kalsel' },
  70: { code: '80003', name: 'Beban Lain-lain', type: 'expense', contra: '11103 - Bank Kalsel' },
};

function getAccountType(code) {
  const c = String(code).trim();
  if (c.startsWith('41') || c.startsWith('42')) return 'revenue';
  if (c.startsWith('51')) return 'bpp';
  if (c.startsWith('61')) return 'beban_umum';
  if (c.startsWith('62')) return 'beban_ops';
  if (c.startsWith('70')) return 'pendapatan_lain';
  if (c.startsWith('80')) return 'beban_lain';
  return null;
}

// Parse DATA LAMPIRAN for revenue (41/42) and BebanU (61) leaf accounts only
function parseDataLampiranLeaves(file) {
  const wb = xlsx.readFile(file, { raw: true });
  const ws = wb.Sheets['DATA LAMPIRAN LABA RUGI 2026'];
  if (!ws) return [];
  const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  const entries = [];

  data.slice(2).forEach(row => {
    const code = String(row[0] || '').trim();
    const name = String(row[1] || '').trim();
    if (!code || !name || code.length < 4) return;
    if (ALWAYS_SKIP.has(code)) return; // Skip group parents

    const type = getAccountType(code);
    // Only process revenue (41/42) and BebanU (61) from DATA LAMPIRAN
    if (type !== 'revenue' && type !== 'beban_umum') return;

    const d = row[3]; // Debit (current month)
    const k = row[4]; // Kredit (current month)

    let amount = 0;
    let isLeaf = false;

    if (type === 'revenue') {
      // Leaf if col3 (D) is numeric (typeof === 'number')
      if (typeof d === 'number') {
        isLeaf = true;
        amount = (typeof k === 'number' ? k : 0) - d; // Net kredit
      }
    } else {
      // Expense: Leaf if col4 (K) is numeric
      if (typeof k === 'number') {
        isLeaf = true;
        amount = d - k; // Net debit
      }
    }

    if (!isLeaf || Math.abs(amount) < 1) return;
    
    const contra = type === 'revenue' 
      ? '11103 - Bank Kalsel' 
      : (code.startsWith('6113') ? '12300 - Akumulasi Penyusutan' : '11103 - Bank Kalsel');
    
    entries.push({ code, name, type, amount, contra });
  });

  return entries;
}

// Parse LABA RUGI sheet column J for BPP and BebanO line items
function parseLRSheet(file, sheetName) {
  const wb = xlsx.readFile(file);
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const entries = [];

  Object.entries(ws).filter(([k]) => !k.startsWith('!')).forEach(([addr, cell]) => {
    const col = addr.replace(/[0-9]/g, '');
    const row = parseInt(addr.replace(/[A-Z]/g, ''));
    if (col !== 'J') return; // Only column J = current month
    
    const v = cell.v;
    if (typeof v !== 'number' || Math.abs(v) < 100) return;
    if (!LR_ROW_MAP[row]) return;
    
    const mapping = LR_ROW_MAP[row];
    entries.push({
      code: mapping.code,
      name: mapping.name,
      type: mapping.type,
      amount: Math.abs(v),
      contra: mapping.contra,
    });
  });

  return entries;
}

const MONTHS = [
  { file: './src/FILES/DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx', lr: 'LABA RUGI JAN 2026', tanggal: '2026-01-31', m: '01', label: 'JAN' },
  { file: './src/FILES/LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx', lr: 'LABA RUGI FEB 2026', tanggal: '2026-02-28', m: '02', label: 'FEB' },
  { file: './src/FILES/LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx', lr: 'LABA RUGI MARET 2026', tanggal: '2026-03-31', m: '03', label: 'MAR' },
  { file: './src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx', lr: 'LABA RUGI APRIL 2026', tanggal: '2026-04-30', m: '04', label: 'APR' },
];

const EX = {
  '01': { rev: 702355127, bpp: 15444000, bu: 764813073, bo: 241641232 },
  '02': { rev: 615807403, bpp: 26039000, bu: 730877129, bo: 324519938 },
  '03': { rev: 588916123, bpp: 47457900, bu: 846859406, bo: 510477567 },
  '04': { rev: 2100317854, bpp: 170972200, bu: 738619007, bo: 355240641 },
};

async function importMonth(config) {
  const { file, lr, tanggal, m, label } = config;
  console.log(`\n=== Processing ${label} ===`);

  // Get leaf entries from DATA LAMPIRAN (revenue + BebanU)
  const dlEntries = parseDataLampiranLeaves(file);
  // Get aggregated entries from LABA RUGI sheet (BPP + BebanO + Non-op)
  const lrEntries = parseLRSheet(file, lr);

  const allEntries = [...dlEntries, ...lrEntries];
  
  const tot = (type) => allEntries.filter(e=>e.type===type).reduce((s,e)=>s+e.amount,0);
  const rev = tot('revenue');
  const bpp = tot('bpp');
  const bu = tot('beban_umum');
  const bo = tot('beban_ops');
  const ex = EX[m];
  const s = (v,e)=> e ? (Math.abs(v/e-1)<0.02?'✅':Math.abs(v/e-1)<0.10?`⚠️${((v/e-1)*100).toFixed(0)}%`:`❌${(v/e).toFixed(2)}×`) : '';
  const M = v => (v/1e6).toFixed(1)+'M';

  console.log(`  Revenue : ${M(rev)} ${s(rev,ex.rev)} | exp:${M(ex.rev)}`);
  console.log(`  BPP     : ${M(bpp)} ${s(bpp,ex.bpp)} | exp:${M(ex.bpp)}`);
  console.log(`  BebanU  : ${M(bu)} ${s(bu,ex.bu)} | exp:${M(ex.bu)}`);
  console.log(`  BebanO  : ${M(bo)} ${s(bo,ex.bo)} | exp:${M(ex.bo)}`);
  console.log(`  Entries : ${allEntries.length} (${dlEntries.length} DL + ${lrEntries.length} LR)`);

  return new Promise(resolve => {
    db.run(`DELETE FROM journals WHERE strftime('%m',tanggal)=? AND id NOT LIKE 'SA-%'`, [m], function() {
      console.log(`  Cleared ${this.changes} old entries`);
      if (allEntries.length === 0) { resolve(); return; }

      const stmt = db.prepare(`INSERT OR REPLACE INTO journals 
        (id, tanggal, keterangan, debit, kredit, akun_debit, akun_kredit, status) 
        VALUES (?,?,?,?,?,?,?,?)`);

      allEntries.forEach((e, idx) => {
        const id = `LRF-${label}-${String(idx+1).padStart(4,'0')}`;
        const akunFull = `${e.code} - ${e.name}`;
        const isExpense = e.type !== 'revenue' && e.type !== 'pendapatan_lain';
        const akun_d = isExpense ? akunFull : e.contra;
        const akun_k = isExpense ? e.contra : akunFull;
        stmt.run(id, tanggal, e.name.slice(0,200), e.amount, e.amount, akun_d, akun_k, 'posted');
      });

      stmt.finalize(() => {
        console.log(`  Inserted ${allEntries.length} entries`);
        resolve();
      });
    });
  });
}

async function run() {
  for (const config of MONTHS) await importMonth(config);

  await new Promise(r => setTimeout(r, 1000));
  db.all(`SELECT strftime('%m',tanggal) as m,
    SUM(CASE WHEN akun_kredit LIKE '41%' OR akun_kredit LIKE '42%' THEN kredit ELSE 0 END) as pend,
    SUM(CASE WHEN akun_debit LIKE '51%' THEN debit ELSE 0 END) as bpp,
    SUM(CASE WHEN akun_debit LIKE '61%' THEN debit ELSE 0 END) as bu,
    SUM(CASE WHEN akun_debit LIKE '62%' THEN debit ELSE 0 END) as bo
    FROM journals WHERE strftime('%Y',tanggal)='2026' AND strftime('%m',tanggal) IN ('01','02','03','04')
    AND id NOT LIKE 'SA-%'
    GROUP BY m ORDER BY m`, (err, r) => {
    if (err) { console.error(err.message); return; }
    const s=(v,ex)=>Math.abs(v/ex-1)<0.02?'✅':Math.abs(v/ex-1)<0.10?`⚠️${((v/ex-1)*100).toFixed(0)}%`:`❌${(v/ex).toFixed(2)}×`;
    const M=v=>(v/1e6).toFixed(1);
    console.log('\n========== FINAL DB VERIFICATION ==========');
    r.forEach(row => {
      const ex = EX[row.m];
      const laba = row.pend - row.bpp - row.bu - row.bo;
      const exLaba = ex.rev - ex.bpp - ex.bu - ex.bo;
      console.log(`${row.m}: Rev=${M(row.pend)}M ${s(row.pend,ex.rev)} | BPP=${M(row.bpp)}M ${s(row.bpp,ex.bpp)} | BU=${M(row.bu)}M ${s(row.bu,ex.bu)} | BO=${M(row.bo)}M ${s(row.bo,ex.bo)} | Laba=${M(laba)}M(ex:${M(exLaba)}M)`);
    });
    process.exit(0);
  });
}

run();
