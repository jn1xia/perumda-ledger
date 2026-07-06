const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('server/perumda_ledger.db');

const targets = {
  feb: {
    month: '2026-02', thru: '2026-02-28',
    lr: {
      '41000': 449943403,
      '42000': 165864000,
      '51000': 21464000,
      '51001': 4575000,
      '61010': 180773583,
      '61020': 59082074,
      '61041': 22304731,
      '61050': 10405927,
      '61060': 7115389,
      '61070': 20713284,
      '61080': 58697947,
      '61090': 225000,
      '61100': 3000000,
      '61110': 31799999,
      '61130': 291894195,
      '61140': 44865000,
      '62010': 28766980,
      '62020': 13750000,
      '62030': 1765000,
      '62040': 1750000,
      '62050': 1271000,
      '62060': 202964979,
      '62070': 24941979,
      '62080': 3060000,
      '62090': 6250000,
      '62100': 40000000,
      '70001': 17104223,
      '80001': 3420846,
      '80002': 172500,
    }
  },
  mar: {
    month: '2026-03', thru: '2026-03-31',
    lr: {
      '41000': 407065223,
      '42000': 181850900,
      '51000': 42577900,
      '51001': 4880000,
      '61010': 166583132,
      '61020': 229107458,
      '61041': 650000,
      '61050': 5833332,
      '61060': 7053800,
      '61070': 2522990,
      '61080': 61500000,
      '61110': 31799999,
      '61120': 42960000,
      '61130': 295581695,
      '61140': 3267000,
      '62010': 12569000,
      '62020': 50671000,
      '62030': 225000,
      '62050': 324000,
      '62060': 196341802,
      '62070': 202996765,
      '62090': 5550000,
      '62100': 41800000,
      '70001': 16725962,
      '80001': 3345194,
      '80002': 114000,
    }
  },
  apr: {
    month: '2026-04', thru: '2026-04-30',
    lr: {
      '41000': 1794207744,
      '42000': 306110110,
      '51000': 167312200,
      '51001': 3660000,
      '61010': 165052787,
      '61020': 60487974,
      '61041': 174100,
      '61050': 8919238,
      '61060': 11134650,
      '61070': 40091040,
      '61080': 77046190,
      '61090': 57699297,
      '61100': 5550000,
      '61110': 31799999,
      '61130': 263113732,
      '61140': 17550000,
      '62010': 1649000,
      '62020': 80742000,
      '62030': 4725000,
      '62050': 1779900,
      '62060': 196807437,
      '62070': 24737304,
      '62090': 4800000,
      '62100': 40000000,
      '70001': 16564311,
      '80001': 3312864,
      '80002': 165000,
    }
  }
};

db.serialize(() => {
  // First, clear all existing SUM journals for these months
  db.run("DELETE FROM journals WHERE id LIKE 'SUM-2026-02-%'");
  db.run("DELETE FROM journals WHERE id LIKE 'SUM-2026-03-%'");
  db.run("DELETE FROM journals WHERE id LIKE 'SUM-2026-04-%'");

  const stmt = db.prepare('INSERT INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?,?,?,?,?,?,?,?)');

  let totalInserted = 0;

  Object.entries(targets).forEach(([monthKey, data]) => {
    Object.entries(data.lr).forEach(([code, amt]) => {
      if (amt === 0) return;
      
      const isRevenue = code.startsWith('4') || code === '70001';
      let dAcc, kAcc;

      if (isRevenue) {
        dAcc = '11999 Kliring Bulanan';
        kAcc = code + ' Penyesuaian LAMPIRAN';
      } else {
        dAcc = code + ' Penyesuaian LAMPIRAN';
        kAcc = '11999 Kliring Bulanan';
      }

      const id = "SUM-" + data.month + "-" + code;
      const desc = "[" + monthKey.toUpperCase() + "] Penyesuaian LAMPIRAN " + code;
      stmt.run(id, data.thru, dAcc, kAcc, amt, amt, desc, 'posted');
      totalInserted++;
    });
  });

  stmt.finalize(() => {
    console.log("✅ Re-inserted " + totalInserted + " exact LAMPIRAN SUM journals");
  });
});

setTimeout(() => {
  db.all("SELECT * FROM journals WHERE status='posted'", (err, J) => {
    ['2026-02', '2026-03', '2026-04'].forEach(m => {
      const mJ = J.filter(j => j.tanggal?.startsWith(m));
      const pu = mJ.reduce((s,j)=>s+((j.akun_kredit||'').split(' ')[0].startsWith('41')?(j.kredit||0):0),0)+
                 mJ.reduce((s,j)=>s+((j.akun_kredit||'').split(' ')[0].startsWith('42')?(j.kredit||0):0),0);
      const bpp = mJ.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('51')?(j.debit||0):0),0);
      const admin = mJ.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('61')?(j.debit||0):0),0);
      const ops = mJ.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('62')?(j.debit||0):0),0);
      const pb = mJ.reduce((s,j)=>{const c=(j.akun_kredit||'').split(' ')[0];return s+(c==='70001'||c==='70000'?(j.kredit||0):0);},0);
      const beban = mJ.reduce((s,j)=>s+((j.akun_debit||'').split(' ')[0].startsWith('8')?(j.debit||0):0),0);
      const laba = pu - bpp - admin - ops + pb - beban;
      console.log(m + ": Laba=" + laba.toLocaleString());
    });
    db.close();
  });
}, 1000);
