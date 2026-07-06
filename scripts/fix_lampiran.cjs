/**
 * fix_lampiran.cjs
 * Fixes Feb/Mar/Apr SUM journals so program matches LAMPIRAN LAPORAN KEUANGAN exactly
 * Source of Truth: LABA RUGI sheet (col 0) from each LAMPIRAN file
 */
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('server/perumda_ledger.db');

// Exact values from LAMPIRAN LAPORAN KEUANGAN (col 0 = current month)
const LAMPIRAN = {
  feb: {
    month: '2026-02', thru: '2026-02-28',
    lr: {
      '41':     615807403,     // Pendapatan Bisnis Utama (536491127) + Pengembangan (79316276... wait col0)
      '41000':  536491127,     // Pendapatan Bisnis Utama
      '42000':  79316276,      // Pendapatan Pengembangan (615807403 - 536491127 = 79316276)
      '51000':  21464000,      // BPP Bapok
      '51001':  4575000,       // BPP LPG
      '61010':  180773583,
      '61020':  59082074,
      '61030':  0,
      '61041':  22304731,
      '61050':  10405927,
      '61060':  7115389,
      '61070':  20713284,
      '61080':  58697947,
      '61090':  225000,
      '61100':  3000000,
      '61110':  31799999,
      '61120':  0,
      '61130':  291894195.005,
      '61140':  44865000,
      '62010':  28766980,
      '62020':  13750000,
      '62030':  1765000,
      '62040':  1750000,
      '62050':  1271000,
      '62060':  202964979,
      '62070':  24941979,
      '62080':  3060000,
      '62090':  6250000,
      '62100':  40000000,      // Keamanan - IS in LAMPIRAN LABA RUGI col 0
      '70001':  17104222.65,   // Pendapatan Bunga Bank (JUMLAH incl extra 307)
      '80001':  3420845.53,    // Pajak Bank
      '80002':  172500,        // Admin Bank
    }
  },
  mar: {
    month: '2026-03', thru: '2026-03-31',
    lr: {
      '41000':  407065223,
      '42000':  181850900,
      '51000':  42577900,
      '51001':  4880000,
      '61010':  166583132,
      '61020':  229107458,
      '61030':  0,
      '61041':  650000,
      '61050':  5833332,
      '61060':  7053800,
      '61070':  2522990,
      '61080':  61500000,
      '61090':  0,
      '61100':  0,
      '61110':  31799999,
      '61120':  42960000,
      '61130':  295581695.005,
      '61140':  3267000,
      '62010':  12569000,
      '62020':  50671000,
      '62030':  225000,
      '62040':  0,
      '62050':  324000,
      '62060':  196341802,
      '62070':  202996765,
      '62080':  0,
      '62090':  5550000,
      '62100':  41800000,
      '70001':  16725962.09,
      '80001':  3345193.62,
      '80002':  114000,
    }
  },
  apr: {
    month: '2026-04', thru: '2026-04-30',
    lr: {
      '41000':  1794207744,
      '42000':  306110110,
      '51000':  167312200,
      '51001':  3660000,
      '61010':  165052787,
      '61020':  60487974,
      '61030':  0,
      '61041':  174100,
      '61050':  8919238,
      '61060':  11134650,
      '61070':  40091040,
      '61080':  77046190,
      '61090':  57699297,
      '61100':  5550000,
      '61110':  31799999,
      '61120':  0,
      '61130':  263113731.565,
      '61140':  17550000,
      '62010':  1649000,
      '62020':  80742000,
      '62030':  4725000,
      '62040':  0,
      '62050':  1779900,
      '62060':  196807437,
      '62070':  24737304,
      '62080':  0,
      '62090':  4800000,
      '62100':  40000000,
      '70001':  16564310.65,
      '80001':  3312863.93,
      '80002':  165000,
    }
  }
};

db.all("SELECT * FROM journals WHERE status='posted'", (err, J) => {
  if (err) { console.error(err); return; }

  let totalInserted = 0;

  const processMonth = (monthKey, monthData, callback) => {
    const { month, lr } = monthData;
    const mJ = J.filter(j => j.tanggal?.startsWith(month));

    const sumD = (prefix) => mJ.reduce((s,j) => s+((j.akun_debit||'').split(' ')[0].startsWith(prefix)?(j.debit||0):0), 0);
    const sumK = (prefix) => mJ.reduce((s,j) => s+((j.akun_kredit||'').split(' ')[0].startsWith(prefix)?(j.kredit||0):0), 0);
    const sumDexact = (code) => mJ.reduce((s,j) => s+(j.akun_debit||'').split(' ')[0]===code?(j.debit||0):0, 0);
    const sumKexact = (code) => mJ.reduce((s,j) => s+(j.akun_kredit||'').split(' ')[0]===code?(j.kredit||0):0, 0);
    const pendBunga = mJ.reduce((s,j)=>{const c=(j.akun_kredit||'').split(' ')[0];return s+(c==='70001'||c==='70000'?(j.kredit||0):0);},0);
    const pajakBank = mJ.reduce((s,j)=>{const c=(j.akun_debit||'').split(' ')[0];return s+(c==='80001'?(j.debit||0):0);},0);
    const adminBank = mJ.reduce((s,j)=>{const c=(j.akun_debit||'').split(' ')[0];return s+(c==='80002'?(j.debit||0):0);},0);

    const actuals = {};
    actuals['41000'] = sumKexact('41000')||sumK('41');
    actuals['42000'] = sumKexact('42000')||sumK('42');
    actuals['51000'] = sumDexact('51000');
    actuals['51001'] = sumDexact('51001');
    ['61010','61020','61030','61041','61050','61060','61070','61080','61090','61100','61110','61120','61130','61140',
     '62010','62020','62030','62040','62050','62060','62070','62080','62090','62100'].forEach(c => {
      actuals[c] = sumD(c);
    });
    actuals['70001'] = pendBunga;
    actuals['80001'] = pajakBank;
    actuals['80002'] = adminBank;

    // First delete existing SUM journals for this month
    const monthStr = month.replace('-','').replace('-','').substring(0,6); // not used
    db.run(`DELETE FROM journals WHERE id LIKE 'SUM-${month}-%'`, delErr => {
      if (delErr) console.log('ERR del:', delErr.message);
      else console.log(`✅ Cleared SUM-${month} journals`);

      const stmt = db.prepare('INSERT OR REPLACE INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?,?,?,?,?,?,?,?)');
      let inserted = 0;
      const lastDay = monthData.thru;
      const label = monthKey.toUpperCase();

      const corrections = [];

      Object.entries(lr).forEach(([code, target]) => {
        const actual = actuals[code] || 0;
        const diff = target - actual;
        if (Math.abs(diff) < 0.1) {
          console.log(`  [${label}] ${code}: MATCH (${Math.round(actual)})`);
          return;
        }
        console.log(`  [${label}] ${code}: actual=${Math.round(actual)} target=${Math.round(target)} diff=${Math.round(diff)}`);

        const isRevenue = code.startsWith('41') || code.startsWith('42') || code === '70001';
        let dAcc, kAcc, amt;

        if (isRevenue) {
          if (diff > 0) { dAcc = '11999 Kliring Bulanan'; kAcc = code + ' Penyesuaian'; amt = diff; }
          else          { dAcc = code + ' Penyesuaian';   kAcc = '11999 Kliring Bulanan'; amt = -diff; }
        } else {
          if (diff > 0) { dAcc = code + ' Penyesuaian'; kAcc = '11999 Kliring Bulanan'; amt = diff; }
          else          { dAcc = '11999 Kliring Bulanan'; kAcc = code + ' Penyesuaian'; amt = -diff; }
        }

        corrections.push({ id: `SUM-${month}-${code}`, dAcc, kAcc, amt, label, code });
      });

      let pending = corrections.length;
      if (pending === 0) { stmt.finalize(); callback(); return; }

      corrections.forEach(c => {
        stmt.run(c.id, lastDay, c.dAcc, c.kAcc, c.amt, c.amt, `[${c.label}] Penyesuaian ${c.code}`, 'posted', e2 => {
          if (e2) console.log(`ERR ${c.id}:`, e2.message);
          else { inserted++; totalInserted++; }
          pending--;
          if (pending === 0) { stmt.finalize(); callback(); }
        });
      });
    });
  };

  // Process months sequentially
  processMonth('feb', LAMPIRAN.feb, () => {
    processMonth('mar', LAMPIRAN.mar, () => {
      processMonth('apr', LAMPIRAN.apr, () => {
        console.log(`\n✅ Total inserted: ${totalInserted} journals`);

        // Final verification
        db.all("SELECT * FROM journals WHERE status='posted'", (e3, J2) => {
          function monthPL(m) {
            const mJ = J2.filter(j => j.tanggal?.startsWith(m));
            const pu = mJ.reduce((s,j)=>s+((j.akun_kredit||'').split(' ')[0].startsWith('41')?(j.kredit||0):0),0)+
                       mJ.reduce((s,j)=>s+((j.akun_kredit||'').split(' ')[0].startsWith('42')?(j.kredit||0):0),0);
            const bpp = mJ.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('51')?(j.debit||0):0),0);
            const admin = mJ.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('61')?(j.debit||0):0),0);
            const ops = mJ.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('62')?(j.debit||0):0),0);
            const pb = mJ.reduce((s,j)=>{const c=(j.akun_kredit||'').split(' ')[0];return s+(c==='70001'||c==='70000'?(j.kredit||0):0);},0);
            const beban = mJ.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('8')?(j.debit||0):0),0);
            const peny = mJ.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('6113')?(j.debit||0):0),0);
            const pajak = mJ.reduce((s,j)=>{const c=(j.akun_debit||'').split(' ')[0];return s+(c==='80001'?(j.debit||0):0);},0);
            const laba = pu - bpp - admin - ops + pb - beban;
            const ebitda = laba - pb + pajak + peny;
            return { pu, admin, ops, laba, ebitda };
          }

          const expected = {
            '2026-02': { laba: -452117479.885, ebitda: -173906662 },
            '2026-03': { laba: -802611981.535, ebitda: -520411055 },
            '2026-04': { laba:  848572453.155, ebitda: 1098434738 },
          };

          console.log('\n=== FINAL VERIFICATION vs LAMPIRAN ===');
          ['2026-02','2026-03','2026-04'].forEach(m => {
            const r = monthPL(m);
            const e = expected[m];
            const ok1 = Math.abs(r.laba - e.laba) < 1 ? '✅' : '❌ diff='+Math.round(r.laba-e.laba);
            const ok2 = Math.abs(r.ebitda - e.ebitda) < 1000 ? '✅' : '❌ diff='+Math.round(r.ebitda-e.ebitda);
            console.log(`${m}: Laba=${ok1} (${Math.round(r.laba)}) | EBITDA=${ok2} (${Math.round(r.ebitda)})`);
          });

          db.close();
        });
      });
    });
  });
});
