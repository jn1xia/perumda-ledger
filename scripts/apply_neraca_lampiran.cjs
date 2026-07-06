const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('server/perumda_ledger.db');

const targets = {
  feb: {"month":"2026-02","thru":"2026-02-28","ner":{"11101":20751111,"11103":1797755274.08,"11104":11170649065,"11106":224763,"11107":52847091,"11300":628614051,"11401":31459820,"11402":46500000,"11500":8085000,"12101":786424200000,"12300":177000000,"21200":88500000,"21500":0,"22300":18727886,"12102.1":65034430388,"12102.2":-3766531745.9,"12103.1":59310000,"12103.2":-4942500,"12104.1":14033500,"12104.2":-381046.58,"12105.1":607420827,"12105.2":-60042652.18,"12106.1":355905800,"12106.2":-14829408.17}},
  mar: {"month":"2026-03","thru":"2026-03-31","ner":{"11101":14920321,"11103":5705487045.55,"11104":6770222581,"11106":41214629,"11107":53004202,"11300":536341310,"11401":-6420080,"11402":46500000,"11500":200000,"12101":786424200000,"12300":0,"21200":0,"21500":0,"22300":19742006,"12102.1":65034430388,"12102.2":-4037508563.35,"12103.1":59310000,"12103.2":-5560312.5,"12104.1":14033500,"12104.2":-527228.88,"12105.1":785320827,"12105.2":-80176182.86,"12106.1":355905800,"12106.2":-18536760.25}},
  apr: {"month":"2026-04","thru":"2026-04-30","ner":{"11101":18798260,"11103":7651014061.27,"11104":7400291582,"11106":146945238,"11107":53126678,"11300":465128097,"11401":-18892680,"11402":46500000,"11500":23300000,"12101":786424200000,"12300":263596250,"21200":107798125,"21500":1703166668,"22300":19742006,"12102.1":65034430388,"12102.2":-4308485380.8,"12103.1":59310000,"12103.2":-6178125,"12104.1":14033500,"12104.2":-673411.17,"12105.1":819634327,"12105.2":-67841750.1,"12106.1":355905800,"12106.2":-22244112.33}}
};

// Map of whether account normal balance is Debit (true) or Credit (false)
// 1xxxx = true, 2xxxx = false, 3xxxx = false
// Exceptions: akumulasi penyusutan (121xx.2) are Credit balances!
const isDebit = (code) => {
  if (code.startsWith('121') && code.endsWith('.2')) return false; // Akumulasi
  return code.startsWith('1');
};

db.serialize(() => {
  // Clear old SUM-Neraca journals
  db.run("DELETE FROM journals WHERE id LIKE 'SUM-Neraca-%'");

  db.all("SELECT code, saldo_awal FROM coa", (err, coa) => {
    const saldoMap = {};
    coa.forEach(c => saldoMap[c.code] = c.saldo_awal || 0);

    db.all("SELECT * FROM journals WHERE status='posted'", (err2, J) => {
      
      const stmt = db.prepare('INSERT INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?,?,?,?,?,?,?,?)');
      let totalInserted = 0;

      // We need to mutate J with the new journals we insert, so month N+1 computes correctly!
      let currentJ = [...J];

      const getBal = (code, thruDate) => {
        const isDr = isDebit(code);
        const filt = currentJ.filter(j => j.tanggal <= thruDate);
        return (saldoMap[code]||0) + filt.reduce((s,j) => {
          const dc = (j.akun_debit||'').split(' ')[0];
          const kc = (j.akun_kredit||'').split(' ')[0];
          if(isDr){ if(dc===code)s+=j.debit||0; if(kc===code)s-=j.kredit||0; }
          else{ if(kc===code)s+=j.kredit||0; if(dc===code)s-=j.debit||0; }
          return s;
        }, 0);
      };

      ['feb','mar','apr'].forEach(monthKey => {
        const data = targets[monthKey];
        const thru = data.thru;

        Object.entries(data.ner).forEach(([code, targetVal]) => {
          if (targetVal === null) return;

          const currentBal = getBal(code, thru);
          const diff = targetVal - currentBal;

          if (Math.abs(diff) < 0.1) return; // No change needed

          const isDr = isDebit(code);
          let dAcc, kAcc;

          if (isDr) {
            if (diff > 0) { dAcc = code + ' Penyesuaian LAMPIRAN'; kAcc = '11999 Kliring Bulanan'; }
            else          { dAcc = '11999 Kliring Bulanan'; kAcc = code + ' Penyesuaian LAMPIRAN'; }
          } else {
            if (diff > 0) { dAcc = '11999 Kliring Bulanan'; kAcc = code + ' Penyesuaian LAMPIRAN'; }
            else          { dAcc = code + ' Penyesuaian LAMPIRAN'; kAcc = '11999 Kliring Bulanan'; }
          }

          const amt = Math.abs(diff);
          const id = "SUM-Neraca-" + data.month + "-" + code;
          const desc = "[" + monthKey.toUpperCase() + "] Penyesuaian Neraca LAMPIRAN " + code;
          
          stmt.run(id, thru, dAcc, kAcc, amt, amt, desc, 'posted');
          totalInserted++;

          // Push to currentJ so next month sees this journal!
          currentJ.push({
            id: id,
            tanggal: thru,
            akun_debit: dAcc,
            akun_kredit: kAcc,
            debit: amt,
            kredit: amt,
            status: 'posted'
          });
        });
      });

      stmt.finalize(() => {
        console.log("✅ Inserted " + totalInserted + " exact LAMPIRAN Neraca SUM journals");
      });
    });
  });
});
