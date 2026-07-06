/**
 * import_from_lampiran.cjs
 * Imports P&L data directly from DATA LAMPIRAN LABA RUGI 2026 sheet
 * in each monthly Excel file, using only LEAF accounts (not parent totals).
 */
const xlsx = require('xlsx');
const db = require('./server/db/database.cjs');

const MONTHS = [
  { file: './src/FILES/DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx', tanggal: '2026-01-31', m: '01', label: 'JAN' },
  { file: './src/FILES/LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx', tanggal: '2026-02-28', m: '02', label: 'FEB' },
  { file: './src/FILES/LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx', tanggal: '2026-03-31', m: '03', label: 'MAR' },
  { file: './src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx', tanggal: '2026-04-30', m: '04', label: 'APR' },
];

// COA type determination based on code prefix
function getAccountType(code) {
  const c = String(code).trim();
  if (c.startsWith('41') || c.startsWith('42')) return 'revenue';   // Pendapatan Usaha
  if (c.startsWith('51')) return 'bpp';                               // Beban Pokok
  if (c.startsWith('61')) return 'beban_umum';                       // Beban Umum
  if (c.startsWith('62')) return 'beban_ops';                        // Beban Operasional
  if (c.startsWith('70')) return 'pendapatan_lain';                  // Pendapatan Non-Operasional
  if (c.startsWith('80')) return 'beban_lain';                       // Beban Non-Operasional
  return null;
}

// Get contra account for journal entry kredit/debit
function getContra(type, accountCode) {
  if (type === 'revenue') return '11103 - Bank Kalsel'; // Revenue: D:Bank K:Revenue
  if (type === 'bpp') return '11301 - Persediaan Barang'; // BPP: D:BPP K:Inventory
  if (type === 'pendapatan_lain') return '11103 - Bank Kalsel';
  if (type === 'beban_lain') return '11103 - Bank Kalsel';
  // Penyusutan: D:Beban Penyusutan K:Akumulasi
  if (accountCode && (String(accountCode).startsWith('6113') || String(accountCode).startsWith('61130') || String(accountCode).startsWith('61131') || String(accountCode).startsWith('61132') || String(accountCode).startsWith('61133') || String(accountCode).startsWith('61134'))) {
    return '12300 - Akumulasi Penyusutan';
  }
  return '11103 - Bank Kalsel'; // All other expenses: D:Expense K:Bank
}

function parseDataLampiran(file, label) {
  const wb = xlsx.readFile(file, { raw: true });
  const ws = wb.Sheets['DATA LAMPIRAN LABA RUGI 2026'];
  if (!ws) { console.error(`No DATA LAMPIRAN sheet in ${file}`); return []; }
  const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  
  const entries = [];
  
  data.slice(2).forEach((row, i) => {
    const code = String(row[0] || '').trim();
    const name = String(row[1] || '').trim();
    if (!code || !name || code.length < 4) return;
    
    const type = getAccountType(code);
    if (!type) return;
    
    // col3 = D (Debit), col4 = K (Kredit) for current month
    const d = row[3]; // Debit amount
    const k = row[4]; // Kredit amount
    
    // Determine if this is a LEAF or PARENT row
    // Parent rows: the "opposite" field is "" (empty string, from SUM formula)
    // Leaf rows: the "opposite" field is 0 (numeric zero) or a number
    
    let amount = 0;
    let isLeaf = false;
    
    if (type === 'revenue' || type === 'pendapatan_lain') {
      // Revenue: kredit side is K (col4). Leaf if col3 (D) is numeric (0 or number)
      // Parent if col3 = "" (empty string)
      if (typeof d === 'number') {
        isLeaf = true;
        const kVal = typeof k === 'number' ? k : 0;
        const dVal = typeof d === 'number' ? d : 0;
        amount = kVal - dVal; // Net kredit (positive = revenue)
      }
    } else {
      // Expense: debit side is D (col3). Leaf if col4 (K) is numeric
      // Parent if col4 = "" (empty string)
      if (typeof k === 'number') {
        isLeaf = true;
        const dVal = typeof d === 'number' ? d : 0;
        const kVal = typeof k === 'number' ? k : 0;
        amount = dVal - kVal; // Net debit (positive = expense)
      }
    }
    
    if (!isLeaf || Math.abs(amount) < 1) return; // Skip parents and zero-amount leaves
    
    entries.push({ code, name, type, amount, isDebit: type !== 'revenue' && type !== 'pendapatan_lain' });
  });
  
  console.log(`  ${label}: parsed ${entries.length} leaf entries`);
  return entries;
}

async function importMonth(config) {
  const { file, tanggal, m, label } = config;
  console.log(`\nProcessing ${label} (${tanggal})...`);
  
  const leafEntries = parseDataLampiran(file, label);
  
  // Show totals by type
  const byType = {};
  leafEntries.forEach(e => {
    if (!byType[e.type]) byType[e.type] = 0;
    byType[e.type] += e.amount;
  });
  
  const expectedTotals = {
    '01': { revenue: 702355127, bpp: 15444000, beban_umum: 764813073, beban_ops: 241641232 },
    '02': { revenue: 615807403, bpp: 26039000, beban_umum: 730877129, beban_ops: 324519938 },
    '03': { revenue: 588916123, bpp: 47457900, beban_umum: 846859406, beban_ops: 510477567 },
    '04': { revenue: 2100317854, bpp: 170972200, beban_umum: 738619007, beban_ops: 355240641 },
  };
  
  const exp = expectedTotals[m];
  const M = v => (v/1e6).toFixed(1)+'M';
  const s = (v,ex) => ex && Math.abs(v/ex-1)<0.03?'✅':ex?`⚠️${((v/ex-1)*100).toFixed(0)}%`:'';
  const rev = byType.revenue || 0;
  const bpp = byType.bpp || 0;
  const bu = byType.beban_umum || 0;
  const bo = byType.beban_ops || 0;
  
  console.log(`  Revenue:  ${M(rev)} ${s(rev, exp?.revenue)} (exp: ${M(exp?.revenue||0)})`);
  console.log(`  BPP:      ${M(bpp)} ${s(bpp, exp?.bpp)} (exp: ${M(exp?.bpp||0)})`);
  console.log(`  BebanU:   ${M(bu)} ${s(bu, exp?.beban_umum)} (exp: ${M(exp?.beban_umum||0)})`);
  console.log(`  BebanO:   ${M(bo)} ${s(bo, exp?.beban_ops)} (exp: ${M(exp?.beban_ops||0)})`);
  
  return new Promise(resolve => {
    // Delete all non-SA existing entries for this month
    db.run(`DELETE FROM journals WHERE strftime('%m',tanggal)=? AND id NOT LIKE 'SA-%'`, [m], function() {
      console.log(`  Cleared ${this.changes} old entries for month ${m}`);
      
      if (leafEntries.length === 0) { resolve(); return; }
      
      const stmt = db.prepare(`INSERT OR REPLACE INTO journals 
        (id, tanggal, keterangan, debit, kredit, akun_debit, akun_kredit, status) 
        VALUES (?,?,?,?,?,?,?,?)`);
      
      let inserted = 0;
      leafEntries.forEach((e, idx) => {
        const id = `LR-${label}-${String(idx+1).padStart(4,'0')}`;
        const contra = getContra(e.type, e.code);
        const akunFull = `${e.code} - ${e.name}`;
        const d = e.isDebit ? Math.abs(e.amount) : Math.abs(e.amount);
        const k = Math.abs(e.amount);
        const akun_d = e.isDebit ? akunFull : contra;
        const akun_k = e.isDebit ? contra : akunFull;
        
        stmt.run(id, tanggal, e.name.slice(0,200), d, k, akun_d, akun_k, 'posted', (err) => {
          if (!err) inserted++;
        });
      });
      
      stmt.finalize(() => {
        console.log(`  Inserted ${inserted} entries`);
        resolve();
      });
    });
  });
}

async function run() {
  for (const config of MONTHS) {
    await importMonth(config);
  }
  
  // Final verification
  await new Promise(r => setTimeout(r, 1000));
  
  db.all(`SELECT strftime('%m',tanggal) as m,
    SUM(CASE WHEN akun_kredit LIKE '41%' OR akun_kredit LIKE '42%' OR akun_kredit LIKE '70%' THEN kredit ELSE 0 END) as pend,
    SUM(CASE WHEN akun_debit LIKE '51%' THEN debit ELSE 0 END) as bpp,
    SUM(CASE WHEN akun_debit LIKE '61%' THEN debit ELSE 0 END) as bu,
    SUM(CASE WHEN akun_debit LIKE '62%' THEN debit ELSE 0 END) as bo,
    SUM(CASE WHEN akun_debit LIKE '80%' THEN debit ELSE 0 END) as beban_lain,
    SUM(CASE WHEN akun_kredit LIKE '70%' THEN kredit ELSE 0 END) as pend_lain
    FROM journals WHERE strftime('%Y',tanggal)='2026' AND strftime('%m',tanggal) IN ('01','02','03','04')
    AND id NOT LIKE 'SA-%'
    GROUP BY m ORDER BY m`, (e, r) => {
    if (e) { console.error(e.message); return; }
    
    const EX = {
      '01': [702355127, 15444000, 764813073, 241641232],
      '02': [615807403, 26039000, 730877129, 324519938],
      '03': [588916123, 47457900, 846859406, 510477567],
      '04': [2100317854, 170972200, 738619007, 355240641],
    };
    const s=(v,ex)=>Math.abs(v/ex-1)<0.02?'✅':Math.abs(v/ex-1)<0.10?`⚠️${((v/ex-1)*100).toFixed(0)}%`:`❌${(v/ex).toFixed(2)}×`;
    const M=v=>(v/1e6).toFixed(1);
    
    console.log('\n========== FINAL ACCURACY CHECK ==========');
    console.log('Bulan | Pendapatan         | BPP       | Beban Umum         | Beban Ops');
    r.forEach(row => {
      const ex = EX[row.m];
      const laba = row.pend - row.bpp - row.bu - row.bo + row.pend_lain - row.beban_lain;
      const exLaba = ex[0] - ex[1] - ex[2] - ex[3];
      console.log(`  ${row.m}  | ${M(row.pend)}M ${s(row.pend,ex[0])} | ${M(row.bpp)}M ${s(row.bpp,ex[1])} | ${M(row.bu)}M ${s(row.bu,ex[2])} | ${M(row.bo)}M ${s(row.bo,ex[3])} | Laba: ${M(laba)}M (ex:${M(exLaba)}M)`);
    });
    process.exit(0);
  });
}

run();
