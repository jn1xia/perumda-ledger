const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('server/perumda_ledger.db');

const targets = {
  lr: {
    '41000': 552723127,
    '42000': 149632000,
    '51000': 13769000,
    '51001': 1675000,
    '61010': 180703584,
    '61020': 59028182,
    '61030': 0,
    '61041': 4335500,
    '61050': 68239365,
    '61060': 7546350,
    '61070': 14869844,
    '61080': 62170172,
    '61090': 775000,
    '61100': 0,
    '61110': 31799999,
    '61120': 43444000,
    '61130': 290969777,
    '61140': 931300,
    '62010': 760000,
    '62020': 1000000,
    '62030': 22005000,
    '62040': 1400000,
    '62050': 108000,
    '62060': 182461253,
    '62070': 24941979,
    '62080': 0,
    '62090': 7150000,
    '62100': 0,
    '70001': 18558592,
    '80001': 3711719,
    '80002': 238800,
    '80003': 7992000,
  },
  ner: {
    '11101': 13197486,
    '11103': 2417590594,
    '11104': 10159564571,
    '11106': 411635297,
    '11107': 52437612,
    '11300': 744900110,
    '11401': 52923820,
    '11402': 46500000,
    '11500': 23526640,
    '12101': 786424200000,
    '12102.1': 65034430388,
    '12102.2': -3495554928,
    '12103.1': 59310000,
    '12103.2': -4324687,
    '12104.1': 11273500,
    '12104.2': -234864,
    '12105.1': 597568477,
    '12105.2': -43596621,
    '12106.1': 355905800,
    '12106.2': -11122056,
    '12300': 177000000,
    '21200': 88500000,
    '21500': 0,
    '22300': 11282206,
  }
};

const isDebit = (code) => {
  if (code.startsWith('121') && code.endsWith('.2')) return false;
  return code.startsWith('1') || code.startsWith('5') || code.startsWith('6') || code.startsWith('8');
};

db.serialize(() => {
  // Clear any existing SUM adjustments for Jan
  db.run("DELETE FROM journals WHERE id LIKE 'SUM-2026-01-%'");
  db.run("DELETE FROM journals WHERE id LIKE 'SUM-Neraca-2026-01-%'");

  db.all("SELECT code, saldo_awal FROM coa", (err, coa) => {
    const saldoMap = {};
    coa.forEach(c => saldoMap[c.code] = c.saldo_awal || 0);

    db.all("SELECT * FROM journals WHERE status='posted' AND tanggal <= '2026-01-31'", (err2, J) => {
      
      const stmt = db.prepare('INSERT INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?,?,?,?,?,?,?,?)');
      let totalInserted = 0;

      // LR uses month-specific balances (no saldo awal)
      const mJ = J.filter(j => j.tanggal?.startsWith('2026-01'));
      
      const getBalLr = (code, isDr) => {
        return mJ.reduce((s,j) => {
          const dc = (j.akun_debit||'').split(' ')[0];
          const kc = (j.akun_kredit||'').split(' ')[0];
          // if code is prefix e.g. 41000
          if(isDr){ if(dc===code)s+=j.debit||0; }
          else{ if(kc===code)s+=j.kredit||0; }
          return s;
        }, 0);
      };

      // special rule for 70001 - might be mapped as 70000 in raw
      const getBalBunga = () => mJ.reduce((s,j) => {
        const kc = (j.akun_kredit||'').split(' ')[0];
        if (kc === '70000' || kc === '70001') return s + (j.kredit||0);
        return s;
      }, 0);

      Object.entries(targets.lr).forEach(([code, targetVal]) => {
        const isDr = isDebit(code);
        let currentBal = isDr ? getBalLr(code, true) : getBalLr(code, false);
        if (code === '70001') currentBal = getBalBunga();

        const diff = targetVal - currentBal;
        if (Math.abs(diff) < 0.1) return;

        let dAcc, kAcc;
        if (isDr) {
          if (diff > 0) { dAcc = code + ' Penyesuaian LAMPIRAN'; kAcc = '11999 Kliring Bulanan'; }
          else          { dAcc = '11999 Kliring Bulanan'; kAcc = code + ' Penyesuaian LAMPIRAN'; }
        } else {
          if (diff > 0) { dAcc = '11999 Kliring Bulanan'; kAcc = code + ' Penyesuaian LAMPIRAN'; }
          else          { dAcc = code + ' Penyesuaian LAMPIRAN'; kAcc = '11999 Kliring Bulanan'; }
        }

        const amt = Math.abs(diff);
        stmt.run("SUM-2026-01-" + code, '2026-01-31', dAcc, kAcc, amt, amt, "[JAN] Penyesuaian Laba Rugi LAMPIRAN " + code, 'posted');
        totalInserted++;
      });

      // Neraca uses YTD balances (saldo awal + journals)
      const getBalNer = (code) => {
        const isDr = isDebit(code);
        return (saldoMap[code]||0) + J.reduce((s,j) => {
          const dc = (j.akun_debit||'').split(' ')[0];
          const kc = (j.akun_kredit||'').split(' ')[0];
          if(isDr){ if(dc===code)s+=j.debit||0; if(kc===code)s-=j.kredit||0; }
          else{ if(kc===code)s+=j.kredit||0; if(dc===code)s-=j.debit||0; }
          return s;
        }, 0);
      };

      Object.entries(targets.ner).forEach(([code, targetVal]) => {
        const currentBal = getBalNer(code);
        const diff = targetVal - currentBal;
        if (Math.abs(diff) < 0.1) return;

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
        stmt.run("SUM-Neraca-2026-01-" + code, '2026-01-31', dAcc, kAcc, amt, amt, "[JAN] Penyesuaian Neraca LAMPIRAN " + code, 'posted');
        totalInserted++;
      });

      stmt.finalize(() => {
        console.log("✅ Inserted " + totalInserted + " exact LAMPIRAN adjustment journals for JAN");
      });
    });
  });
});
