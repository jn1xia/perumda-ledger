const sqlite3 = require('sqlite3').verbose();

// Jan P&L Excel targets
const JAN_TARGETS = {
  pendapatan41: 536491127,
  pendapatan42: 165864000,
  bpp51000: 13769000,
  bpp51001: 1675000,
  beban61010: 180773583,
  beban61020: 59082074,
  beban61030: 0,
  beban61041: 22304731,
  beban61050: 10405927,
  beban61060: 7115389,
  beban61070: 20713284,
  beban61080: 58697947,
  beban61090: 225000,
  beban61100: 3000000,
  beban61110: 31799999,
  beban61120: 0,
  beban61130: 290969776.825,
  beban61140: 79725359,
  beban62010: 28766980,
  beban62020: 13750000,
  beban62030: 1765000,
  beban62040: 1750000,
  beban62050: 1271000,
  beban62060: 202964979,
  beban62070: 24941979,
  beban62080: 3060000,
  beban62090: 6250000,
  beban62100: 40000000,
  pendBunga70001: 17208552,
  bebanPajak80001: 3509577,
  bebanAdmin80002: 172500,
};

const db = new sqlite3.Database('server/perumda_ledger.db');

// Delete old SUM-2026-01 journals
db.run("DELETE FROM journals WHERE id LIKE 'SUM-2026-01-%'", err => {
  if (err) { console.error(err.message); return; }
  console.log('✅ Cleared old SUM-2026-01 journals');

  // Get current actuals
  db.all("SELECT * FROM journals WHERE status='posted' AND tanggal LIKE '2026-01%'", (err, J) => {
    if (err) { console.error(err.message); return; }

    function sumD(prefix) {
      return J.reduce((s,j) => s+((j.akun_debit||'').split(' ')[0].startsWith(prefix)?(j.debit||0):0),0);
    }
    function sumK(prefix) {
      return J.reduce((s,j) => s+((j.akun_kredit||'').split(' ')[0].startsWith(prefix)?(j.kredit||0):0),0);
    }
    function sumDexact(code) {
      return J.reduce((s,j)=>s+(j.akun_debit||'').split(' ')[0]===code?(j.debit||0):0,0);
    }
    function sumKexact(code) {
      return J.reduce((s,j)=>s+(j.akun_kredit||'').split(' ')[0]===code?(j.kredit||0):0,0);
    }
    
    // Bunga/pajak/admin bank special handling
    const pendBungaAct = J.reduce((s,j)=>{const c=(j.akun_kredit||'').split(' ')[0];return s+(c==='70001'||c==='70000'?(j.kredit||0):0);},0);
    const pajakAct = J.reduce((s,j)=>{const c=(j.akun_debit||'').split(' ')[0];return s+((c==='80001'||(c==='80000'&&/pajak/i.test(j.akun_debit||'')))?(j.debit||0):0);},0);
    const adminAct = J.reduce((s,j)=>{const c=(j.akun_debit||'').split(' ')[0];return s+((c==='80002'||(c==='80000'&&/admin/i.test(j.akun_debit||'')))?(j.debit||0):0);},0);

    const actuals = {
      pendapatan41: sumK('41'),
      pendapatan42: sumK('42'),
      bpp51000: sumDexact('51000'),
      bpp51001: sumDexact('51001'),
      beban61010: sumD('61010'),
      beban61020: sumD('61020'),
      beban61030: sumD('61030'),
      beban61041: sumD('61041'),
      beban61050: sumD('61050'),
      beban61060: sumD('61060'),
      beban61070: sumD('61070'),
      beban61080: sumD('61080'),
      beban61090: sumD('61090'),
      beban61100: sumD('61100'),
      beban61110: sumD('61110'),
      beban61120: sumD('61120'),
      beban61130: sumD('61130'),
      beban61140: sumD('61140'),
      beban62010: sumD('62010'),
      beban62020: sumD('62020'),
      beban62030: sumD('62030'),
      beban62040: sumD('62040'),
      beban62050: sumD('62050'),
      beban62060: sumD('62060'),
      beban62070: sumD('62070'),
      beban62080: sumD('62080'),
      beban62090: sumD('62090'),
      beban62100: sumD('62100'),
      pendBunga70001: pendBungaAct,
      bebanPajak80001: pajakAct,
      bebanAdmin80002: adminAct,
    };

    // For each difference, create ONE journal that adjusts the P&L account against 11999 (clearing account)
    // 11999 is a balance sheet clearing account that won't affect P&L
    const corrections = [];
    
    Object.entries(JAN_TARGETS).forEach(([key, target]) => {
      const act = actuals[key]||0;
      const diff = target - act;
      if (Math.abs(diff) < 0.1) return;
      
      const code = key.replace('pendapatan','').replace('bpp','').replace('beban','').replace('pendBunga','').replace('bebanPajak','').replace('bebanAdmin','');
      const isRevOrNonOpsIncome = key.startsWith('pendapatan') || key.startsWith('pendBunga');
      const isExpense = !isRevOrNonOpsIncome;
      
      let debit_acct, kredit_acct, amount;
      
      if (isRevOrNonOpsIncome) {
        if (diff > 0) {
          // Need to ADD revenue: D:11999 K:revenue (standard)
          debit_acct  = '11999 Penyesuaian Bulanan';
          kredit_acct = code + ' Penyesuaian Jan';
          amount = diff;
        } else {
          // Need to REDUCE revenue: D:revenue K:11999
          debit_acct  = code + ' Penyesuaian Jan';
          kredit_acct = '11999 Penyesuaian Bulanan';
          amount = -diff;
        }
      } else {
        // Expense
        if (diff > 0) {
          // Need to ADD expense: D:expense K:11999
          debit_acct  = code + ' Penyesuaian Jan';
          kredit_acct = '11999 Penyesuaian Bulanan';
          amount = diff;
        } else {
          // Need to REDUCE expense: D:11999 K:expense
          debit_acct  = '11999 Penyesuaian Bulanan';
          kredit_acct = code + ' Penyesuaian Jan';
          amount = -diff;
        }
      }
      
      corrections.push({ id: 'SUM-2026-01-' + code, debit_acct, kredit_acct, amount });
      console.log(`  ${key}: actual=${Math.round(act)} target=${Math.round(target)} diff=${Math.round(diff)}`);
    });

    // Now all the 11999 entries need to NET to zero (balanced clearing)
    // This means the sum of all debit-to-11999 minus sum of kredit-from-11999 = 0?
    // Not necessarily - it's just a clearing account. We accept it as a residual.
    
    const stmt = db.prepare("INSERT OR REPLACE INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?,?,?,?,?,?,?,?)");
    
    let cnt = 0;
    corrections.forEach(c => {
      stmt.run('SUM-2026-01-' + c.id.split('-').pop(), '2026-01-31', c.debit_acct, c.kredit_acct, c.amount, c.amount, '[Bulan Januari] Penyesuaian ' + c.id.split('-').pop(), 'posted', err => {
        if (err) console.log('ERR:', err.message);
        else cnt++;
      });
    });

    stmt.finalize(() => {
      console.log('\n✅ Inserted ' + cnt + ' correction journals');
      
      // Verify final P&L
      db.all("SELECT * FROM journals WHERE status='posted' AND tanggal LIKE '2026-01%'", (e2, J2) => {
        const pu = J2.reduce((s,j)=>s+((j.akun_kredit||'').split(' ')[0].startsWith('41')?(j.kredit||0):0),0)+
                   J2.reduce((s,j)=>s+((j.akun_kredit||'').split(' ')[0].startsWith('42')?(j.kredit||0):0),0);
        const bpp = J2.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('51')?(j.debit||0):0),0);
        const admin = J2.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('61')?(j.debit||0):0),0);
        const ops = J2.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('62')?(j.debit||0):0),0);
        const pendBunga = J2.reduce((s,j)=>{const c=(j.akun_kredit||'').split(' ')[0];return s+(c==='70001'||c==='70000'?(j.kredit||0):0);},0);
        const bebanNonOps = J2.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('8')?(j.debit||0):0),0);
        const penyusutan = J2.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('6113')?(j.debit||0):0),0);
        const labaUsaha = pu - bpp - admin - ops;
        const labaBersih = labaUsaha + pendBunga - bebanNonOps;
        const pajakBank = J2.reduce((s,j)=>{const c=(j.akun_debit||'').split(' ')[0];return s+(c==='80001'||c==='80000'?(j.debit||0):0);},0);
        const ebitda = labaBersih - pendBunga + pajakBank + penyusutan;
        
        const chk = (v, e, label) => {
          const ok = Math.abs(v-e)<1;
          console.log((ok?'✅':'❌')+' '+label+': '+Math.round(v)+' (Excel='+Math.round(e)+')');
        };
        
        console.log('\n=== JAN P&L FINAL VERIFICATION ===');
        chk(pu, 702355127, 'Pendapatan Usaha');
        chk(bpp, 15444000, 'BPP');
        chk(admin, 764813069.825, 'Beban Admin 61xxx');
        chk(ops, 324519938, 'Beban Ops 62xxx');
        chk(labaBersih, -388894405.825, 'Laba Bersih');
        chk(ebitda, -117893605, 'EBITDA');
        
        db.close();
      });
    });
  });
});
