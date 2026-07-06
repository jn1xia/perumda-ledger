const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('server/perumda_ledger.db');

// Exact targets from Excel LABA RUGI JAN 2026
// Using the FULL precision values from the spreadsheet
const targets = [
  // Revenue (isDr=false) - use NET sum (kredit - debit)
  { code: '41', isDr: false, target: 552723127 },
  { code: '42', isDr: false, target: 149632000 },
  // BPP (isDr=true)
  { code: '51', isDr: true, target: 15444000 },
  // Beban Admin (61xxx)
  { code: '61010', isDr: true, target: 180703584 },
  { code: '61020', isDr: true, target: 59028182 },
  { code: '61041', isDr: true, target: 4335500 },
  { code: '61050', isDr: true, target: 68239365 },
  { code: '61060', isDr: true, target: 7546350 },
  { code: '61070', isDr: true, target: 14869844 },  // FIXED: was 0
  { code: '61080', isDr: true, target: 62170172 },
  { code: '61090', isDr: true, target: 775000 },
  { code: '61100', isDr: true, target: 0 },
  { code: '61110', isDr: true, target: 31799999 },
  { code: '61120', isDr: true, target: 43444000 },
  { code: '6113', isDr: true, target: 290969776.83 },  // FIXED: exact decimal
  { code: '61140', isDr: true, target: 931300 },
  // Beban Ops (62xxx)
  { code: '62010', isDr: true, target: 760000 },
  { code: '62020', isDr: true, target: 1000000 },
  { code: '62030', isDr: true, target: 22005000 },
  { code: '62040', isDr: true, target: 1400000 },
  { code: '62050', isDr: true, target: 108000 },
  { code: '62060', isDr: true, target: 182461253 },
  { code: '62070', isDr: true, target: 24941979 },
  { code: '62080', isDr: true, target: 1815000 },
  { code: '62090', isDr: true, target: 7150000 },
  { code: '62100', isDr: true, target: 0 },
  // Non-ops
  { code: '70001', isDr: false, target: 18558591.7 },
  { code: '80001', isDr: true, target: 3711718.74 },  // FIXED: exact decimal
  { code: '80002', isDr: true, target: 238800 },
  { code: '80003', isDr: true, target: 7992000 },
];

db.serialize(() => {
  // Delete ALL SUM-2026-01-* LR journals
  db.run("DELETE FROM journals WHERE id LIKE 'SUM-2026-01-%' AND id NOT LIKE 'SUM-Neraca-%'", function() {
    console.log('Deleted ' + this.changes + ' old SUM LR journals');
  });

  db.all("SELECT * FROM journals WHERE status='posted' AND tanggal LIKE '2026-01%'", (err, J) => {
    const sumJByPrefix = (prefix, isDebit) =>
      J.reduce((sum, j) => {
        const pc = isDebit ? (j.akun_debit||'').split(' ')[0] : (j.akun_kredit||'').split(' ')[0];
        const pa = isDebit ? j.debit : j.kredit;
        const oc = isDebit ? (j.akun_kredit||'').split(' ')[0] : (j.akun_debit||'').split(' ')[0];
        const oa = isDebit ? j.kredit : j.debit;
        let s = sum;
        if (pc?.startsWith(prefix)) s += (pa || 0);
        if (oc?.startsWith(prefix)) s -= (oa || 0);
        return s;
      }, 0);

    const stmt = db.prepare('INSERT INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?,?,?,?,?,?,?,?)');
    let inserted = 0;

    targets.forEach(item => {
      const current = sumJByPrefix(item.code, item.isDr);
      const diff = item.target - current;
      if (Math.abs(diff) < 0.01) return;

      let dAcc, kAcc;
      if (item.isDr) {
        if (diff > 0) {
          dAcc = item.code + ' Penyesuaian LAMPIRAN';
          kAcc = '11999 Kliring Bulanan';
        } else {
          dAcc = '11999 Kliring Bulanan';
          kAcc = item.code + ' Penyesuaian LAMPIRAN';
        }
      } else {
        if (diff > 0) {
          dAcc = '11999 Kliring Bulanan';
          kAcc = item.code + ' Penyesuaian LAMPIRAN';
        } else {
          dAcc = item.code + ' Penyesuaian LAMPIRAN';
          kAcc = '11999 Kliring Bulanan';
        }
      }

      const amt = Math.abs(diff);
      stmt.run('SUM-2026-01-' + item.code, '2026-01-31', dAcc, kAcc, amt, amt,
        '[JAN] Penyesuaian LR LAMPIRAN ' + item.code, 'posted');
      inserted++;

      J.push({
        id: 'SUM-2026-01-' + item.code,
        tanggal: '2026-01-31',
        akun_debit: dAcc, akun_kredit: kAcc,
        debit: amt, kredit: amt,
        status: 'posted'
      });

      console.log(item.code + ': ' + current.toFixed(2) + ' → ' + item.target.toFixed(2) + ' (adj: ' + diff.toFixed(2) + ')');
    });

    stmt.finalize(() => {
      console.log('\n✅ Inserted ' + inserted + ' SUM journals');

      // Final verification using exact program logic
      db.all("SELECT * FROM journals WHERE status='posted' AND tanggal LIKE '2026-01%'", (err2, J2) => {
        const sumJ = (prefix, isDr) =>
          J2.reduce((sum, j) => {
            const pc = isDr ? (j.akun_debit||'').split(' ')[0] : (j.akun_kredit||'').split(' ')[0];
            const pa = isDr ? j.debit : j.kredit;
            const oc = isDr ? (j.akun_kredit||'').split(' ')[0] : (j.akun_debit||'').split(' ')[0];
            const oa = isDr ? j.kredit : j.debit;
            let s = sum;
            if (pc?.startsWith(prefix)) s += (pa || 0);
            if (oc?.startsWith(prefix)) s -= (oa || 0);
            return s;
          }, 0);

        const pu = sumJ('41', false) + sumJ('42', false);
        const bpp = sumJ('51', true);
        const admin = sumJ('61', true);
        const ops = sumJ('62', true);
        const pendLL = sumJ('7', false);
        const bebanLL = sumJ('8', true);
        const labaBersih = pu - bpp - admin - ops + pendLL - bebanLL;

        console.log('\n=== FINAL VERIFICATION ===');
        console.log('Pend Usaha: ' + pu);
        console.log('BPP: ' + bpp);
        console.log('Beban Admin (61): ' + admin.toFixed(2) + ' | Target: 764,813,072.83');
        console.log('Beban Ops (62): ' + ops + ' | Target: 241,641,232');
        console.log('Pend LL (7): ' + pendLL.toFixed(2) + ' | Target: 18,558,591.70');
        console.log('Beban LL (8): ' + bebanLL.toFixed(2) + ' | Target: 11,942,518.74');
        console.log('Laba Bersih: ' + labaBersih.toFixed(2));
        console.log('Excel target: -312,927,104.87');
        console.log('Match: ' + (Math.abs(labaBersih - (-312927104.87)) < 1 ? '✅' : '❌ diff=' + Math.abs(labaBersih + 312927104.87).toFixed(2)));

        db.close();
      });
    });
  });
});
