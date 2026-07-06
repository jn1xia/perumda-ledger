/**
 * import_neraca_feb_mar_apr.cjs
 * 
 * Imports Feb, Mar, Apr 2026 P&L account movements from each file's 
 * "DATA LAMPIRAN NERACA" sheet — which contains EXACT monthly figures.
 * 
 * Creates one journal entry per account per month (summary-level).
 * This guarantees LR totals match the Excel reports exactly.
 * 
 * Entry IDs: SUM-2026-MM-<code>
 */
const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const DIR     = path.join(__dirname, 'src/FILES');

const MONTHS = [
  {
    month: '2026-02', label: 'February',
    file: 'LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx',
    nerSheet: 'DATA LAMPIRAN NERACA',
    lrSheet: 'LABA RUGI FEB 2026',
    expected: { p: 615807403, bpp: 26039000, b61: 730877129, b62: 324519938 }
  },
  {
    month: '2026-03', label: 'March',
    file: 'LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx',
    nerSheet: 'DATA LAMPIRAN NERACA',
    lrSheet: 'LABA RUGI MARET 2026',
    expected: { p: 588916123, bpp: 47457900, b61: 846859406, b62: 510477567 }
  },
  {
    month: '2026-04', label: 'April',
    file: 'LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx',
    nerSheet: 'DATA LAMPIRAN NERACA',
    lrSheet: 'LABA RUGI APRIL 2026',
    expected: { p: null, bpp: 170972200, b61: 738619007, b62: 355240641 }
  },
];

function dbRun(db, sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function(e) { e ? rej(e) : res(this) }));
}
function dbGet(db, sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
}

// P&L account prefixes — we only want income/expense accounts, not balance sheet
const PL_PREFIXES = ['41','42','43','51','61','62','70','71','80','81'];
// For debit-normal accounts: net = D - K
// For credit-normal accounts: net = K - D
const CREDIT_NORMAL = ['41','42','43','70','71']; // income accounts

// Counterpart accounts for journal entries (clearing account)
const BANK_DEBIT  = '11103 Bank Kalsel'; // debit side for income collection
const BANK_KREDIT = '11103 Bank Kalsel'; // credit side for expense payment

async function main() {
  console.log('=== PERUMDA LEDGER — Feb/Mar/Apr Import (from NERACA) ===\n');
  
  const db = new sqlite3.Database(DB_PATH);
  let grandTotal = 0;
  
  for (const cfg of MONTHS) {
    console.log(`── ${cfg.label} (${cfg.month}) ──────────────────────`);
    
    // Delete existing SUM- entries for this month
    const del = await dbRun(db, `DELETE FROM journals WHERE id LIKE 'SUM-${cfg.month}-%'`);
    // Also delete any XL- entries from this month (previous import attempts)
    const del2 = await dbRun(db, `DELETE FROM journals WHERE id LIKE 'XL-${cfg.month}-%'`);
    console.log(`   Cleared ${del.changes} SUM- + ${del2.changes} XL- entries`);
    
    try {
      const wb = XLSX.readFile(path.join(DIR, cfg.file));
      const ns = wb.Sheets[cfg.nerSheet];
      if (!ns) { console.log(`   ❌ Sheet "${cfg.nerSheet}" not found!`); continue; }
      
      const rows = XLSX.utils.sheet_to_json(ns, { header: 1, defval: '' });
      
      // Row 1: header row (Akun | Default | Saldo Awal | D | K | Saldo Akhir | ...)
      // col1 = account code, col2 = account name, col4 = saldo_awal, col5 = D, col6 = K, col7 = saldo_akhir
      // Actually from inspection: col1=code(numeric), col2=name, col4=saldo_awal, col5=D, col6=K
      
      const entries = [];
      const lastDay = cfg.month === '2026-02' ? '2026-02-28' : cfg.month === '2026-03' ? '2026-03-31' : '2026-04-30';
      
      rows.slice(2).forEach(r => {
        const rawCode = String(r[1] || '').trim();
        const name    = String(r[2] || '').trim();
        const dAmt    = Number(r[5] || 0);
        const kAmt    = Number(r[6] || 0);
        
        if (!rawCode || !name) return;
        if (dAmt === 0 && kAmt === 0) return;
        
        // Only process P&L accounts
        const prefix = rawCode.slice(0, 2);
        if (!PL_PREFIXES.includes(prefix)) return;
        
        // Compute net amount
        const isCredit = CREDIT_NORMAL.includes(prefix);
        const netAmt = isCredit ? (kAmt - dAmt) : (dAmt - kAmt);
        if (Math.abs(netAmt) < 1) return;
        
        const fullAkun = `${rawCode} ${name}`;
        const id = `SUM-${cfg.month}-${rawCode}`;
        
        if (isCredit) {
          // Income account: Debit Bank / Credit Income
          entries.push({
            id, tanggal: lastDay, status: 'posted',
            akun_debit: BANK_DEBIT, akun_kredit: fullAkun,
            debit: netAmt, kredit: netAmt,
            keterangan: `[Bulan ${cfg.label}] ${name}`
          });
        } else {
          // Expense account: Debit Expense / Credit Bank
          entries.push({
            id, tanggal: lastDay, status: 'posted',
            akun_debit: fullAkun, akun_kredit: BANK_KREDIT,
            debit: netAmt, kredit: netAmt,
            keterangan: `[Bulan ${cfg.label}] ${name}`
          });
        }
      });
      
      console.log(`   Parsed ${entries.length} account entries from NERACA`);
      
      let inserted = 0;
      for (const e of entries) {
        try {
          await dbRun(db,
            `INSERT OR REPLACE INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [e.id, e.tanggal, e.akun_debit, e.akun_kredit, e.debit, e.kredit, e.keterangan, e.status]
          );
          inserted++;
        } catch(err) {
          console.log(`   Insert error: ${err.message} (${e.id})`);
        }
      }
      console.log(`   ✓ Inserted ${inserted} entries`);
      grandTotal += inserted;
      
    } catch(err) {
      console.log(`   ❌ ERROR: ${err.message}`);
      continue;
    }
    
    // Validate
    const rows = await new Promise((res, rej) =>
      db.all(`SELECT * FROM journals WHERE tanggal LIKE '${cfg.month}%' AND status='posted'`, (e, r) => e ? rej(e) : res(r))
    );
    
    function sumJ(prefix, isDebit) {
      return rows.reduce((s, j) => {
        const pCode = isDebit ? (j.akun_debit||'').split(' ')[0] : (j.akun_kredit||'').split(' ')[0];
        const pAmt  = isDebit ? j.debit : j.kredit;
        const oCode = isDebit ? (j.akun_kredit||'').split(' ')[0] : (j.akun_debit||'').split(' ')[0];
        const oAmt  = isDebit ? j.kredit : j.debit;
        if (pCode?.startsWith(prefix)) s += (pAmt || 0);
        if (oCode?.startsWith(prefix)) s -= (oAmt || 0);
        return s;
      }, 0);
    }
    
    const p41 = sumJ('41', false), p42 = sumJ('42', false);
    const bpp = sumJ('51', true);
    const b61 = sumJ('61', true), b62 = sumJ('62', true);
    const p7  = sumJ('7', false);
    const b8  = sumJ('8', true);
    const laba = (p41 + p42) - bpp - b61 - b62;
    
    const exp = cfg.expected;
    const chk = (lbl, actual, expected) => {
      if (expected == null) { console.log(`   ℹ ${lbl.padEnd(28)}${Math.round(actual).toLocaleString().padStart(18)}`); return; }
      const ok = Math.abs(actual - expected) < 100 ? '✅' : '⚠️';
      console.log(`   ${ok} ${lbl.padEnd(28)}${Math.round(actual).toLocaleString().padStart(18)} | Expected: ${expected.toLocaleString()}`);
    };
    
    chk('Pendapatan (41+42)', p41+p42, exp.p);
    chk('BPP', bpp, exp.bpp);
    chk('Beban Admin (61)', b61, exp.b61);
    chk('Beban Ops (62)', b62, exp.b62);
    chk('LABA USAHA', laba, null);
    chk('Pendapatan Non-ops (7)', p7, null);
    chk('Beban Non-ops (8)', b8, null);
    console.log('');
  }
  
  // Final summary
  const total = await dbGet(db, "SELECT COUNT(*) as cnt FROM journals WHERE status='posted'");
  console.log(`════════════════════════════════════════`);
  console.log(`Imported this run    : ${grandTotal}`);
  console.log(`Total posted journals: ${total.cnt}`);
  console.log(`════════════════════════════════════════`);
  
  // Quick Jan check to ensure not broken
  const jan = await new Promise((res, rej) =>
    db.all("SELECT * FROM journals WHERE tanggal LIKE '2026-01%' AND status='posted'", (e, r) => e ? rej(e) : res(r))
  );
  function sumJ2(prefix, isDebit, rows) {
    return rows.reduce((s, j) => {
      const pCode = isDebit ? (j.akun_debit||'').split(' ')[0] : (j.akun_kredit||'').split(' ')[0];
      const pAmt  = isDebit ? j.debit : j.kredit;
      const oCode = isDebit ? (j.akun_kredit||'').split(' ')[0] : (j.akun_debit||'').split(' ')[0];
      const oAmt  = isDebit ? j.kredit : j.debit;
      if (pCode?.startsWith(prefix)) s += (pAmt || 0);
      if (oCode?.startsWith(prefix)) s -= (oAmt || 0);
      return s;
    }, 0);
  }
  const jan41 = sumJ2('41', false, jan), jan42 = sumJ2('42', false, jan);
  const janBpp = sumJ2('51', true, jan), jan61 = sumJ2('61', true, jan), jan62 = sumJ2('62', true, jan);
  console.log('\nJanuary sanity check:');
  console.log(`  Pendapatan: ${Math.round(jan41+jan42).toLocaleString()} | Expected: 702,355,127`);
  console.log(`  Beban Admin: ${Math.round(jan61).toLocaleString()} | Expected: 764,813,073`);
  console.log(`  Beban Ops: ${Math.round(jan62).toLocaleString()} | Expected: 241,641,232`);
  
  db.close();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
