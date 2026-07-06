const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();

function extractFromSheet(ws) {
  const ref = ws['!ref'];
  if (!ref) return {};
  const range = XLSX.utils.decode_range(ref);
  const rowMap = {};
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({r:R,c:C})];
      if (!cell) continue;
      if (!rowMap[R]) rowMap[R] = {};
      rowMap[R][C] = cell.v;
    }
  }
  return rowMap;
}

function findValue(rowMap, labelRegex) {
  for (const [rStr, cols] of Object.entries(rowMap)) {
    const colEntries = Object.entries(cols).map(([c,v]) => [parseInt(c), v]).sort((a,b)=>a[0]-b[0]);
    const labelIdx = colEntries.findIndex(([c,v]) => typeof v === 'string' && labelRegex.test(v));
    if (labelIdx === -1) continue;
    const numCol = colEntries.slice(labelIdx+1).find(([c,v]) => typeof v === 'number');
    if (numCol) return numCol[1];
  }
  return null;
}

const nerDefs = [
  { code: '11101', rx: /^Kas Kecil/i, isDr: true },
  { code: '11103', rx: /^Kas Bank Kalsel/i, isDr: true },
  { code: '11104', rx: /^Bank BNI$/i, isDr: true },
  { code: '11106', rx: /^Bank BNI Bisnis/i, isDr: true },
  { code: '11107', rx: /^Bank BNI Tapcash/i, isDr: true },
  { code: '11300', rx: /^Piutang Usaha/i, isDr: true },
  { code: '11401', rx: /Gerai Inflasi/i, isDr: true },
  { code: '11402', rx: /Gas LPG/i, isDr: true },
  { code: '11500', rx: /BBM Dibayar di Muka/i, isDr: true },
  { code: '12101', rx: /^Tanah /i, isDr: true },
  { code: '12102.1', rx: /^Bangunan$/i, isDr: true },
  { code: '12102.2', rx: /^Akumulasi Penyusutan Bangunan/i, isDr: false },
  { code: '12103.1', rx: /^Mesin$/i, isDr: true },
  { code: '12103.2', rx: /^Akumulasi Penyusutan Mesin/i, isDr: false },
  { code: '12104.1', rx: /^Instalasi Listrik/i, isDr: true },
  { code: '12104.2', rx: /^Akumulasi Penyusutan Instalasi Listrik/i, isDr: false },
  { code: '12105.1', rx: /^Peralatan/i, isDr: true },
  { code: '12105.2', rx: /^Akumulasi Penyusutan Peralatan/i, isDr: false },
  { code: '12106.1', rx: /^Kendaraan/i, isDr: true },
  { code: '12106.2', rx: /^Akumulasi Penyusutan Kendaraan/i, isDr: false },
  { code: '12300', rx: /^Aset Dalam Penyelesaian/i, isDr: true },
  { code: '21200', rx: /^Utang Usaha/i, isDr: false },
  { code: '21500', rx: /^Pendapatan Diterima Dimuka/i, isDr: false },
  { code: '22300', rx: /^Utang Daerah/i, isDr: false },
];

const months = [
  {
    key: 'feb', month: '2026-02', thru: '2026-02-28',
    file: 'src/FILES/LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx',
    nerSheet: 'NERACA FEB 2026'
  },
  {
    key: 'mar', month: '2026-03', thru: '2026-03-31',
    file: 'src/FILES/LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx',
    nerSheet: 'NERACA MARET 2026'
  },
  {
    key: 'apr', month: '2026-04', thru: '2026-04-30',
    file: 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx',
    nerSheet: 'NERACA APRIL 2026'
  }
];

const db = new sqlite3.Database('server/perumda_ledger.db');

db.serialize(() => {
  // Delete existing SUM-Neraca for Feb/Mar/Apr (will recreate)
  db.run("DELETE FROM journals WHERE id LIKE 'SUM-Neraca-2026-02-%'");
  db.run("DELETE FROM journals WHERE id LIKE 'SUM-Neraca-2026-03-%'");
  db.run("DELETE FROM journals WHERE id LIKE 'SUM-Neraca-2026-04-%'");

  db.all('SELECT code, saldo_awal FROM coa', (e1, coa) => {
    const saldoMap = {};
    coa.forEach(c => saldoMap[c.code] = c.saldo_awal || 0);

    db.all("SELECT * FROM journals WHERE status='posted'", (e2, J) => {
      const stmt = db.prepare('INSERT INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?,?,?,?,?,?,?,?)');
      let totalInserted = 0;

      months.forEach(m => {
        const wb = XLSX.readFile(m.file);
        const nerRm = extractFromSheet(wb.Sheets[m.nerSheet]);
        const thruJ = J.filter(j => j.tanggal <= m.thru);

        nerDefs.forEach(def => {
          const target = findValue(nerRm, def.rx) || 0;
          const isDr = def.isDr;
          const actual = (saldoMap[def.code]||0) + thruJ.reduce((s,j) => {
            const dc = (j.akun_debit||'').split(' ')[0];
            const kc = (j.akun_kredit||'').split(' ')[0];
            if(isDr){ if(dc===def.code)s+=j.debit||0; if(kc===def.code)s-=j.kredit||0; }
            else{ if(kc===def.code)s+=j.kredit||0; if(dc===def.code)s-=j.debit||0; }
            return s;
          }, 0);

          const diff = target - actual;
          if (Math.abs(diff) < 0.5) return;

          let dAcc, kAcc;
          if (isDr) {
            if (diff > 0) { dAcc = def.code + ' Penyesuaian LAMPIRAN'; kAcc = '11999 Kliring Bulanan'; }
            else          { dAcc = '11999 Kliring Bulanan'; kAcc = def.code + ' Penyesuaian LAMPIRAN'; }
          } else {
            if (diff > 0) { dAcc = '11999 Kliring Bulanan'; kAcc = def.code + ' Penyesuaian LAMPIRAN'; }
            else          { dAcc = def.code + ' Penyesuaian LAMPIRAN'; kAcc = '11999 Kliring Bulanan'; }
          }

          const amt = Math.abs(diff);
          const lastDay = m.thru;
          stmt.run('SUM-Neraca-' + m.month + '-' + def.code, lastDay, dAcc, kAcc, amt, amt,
            '[' + m.key.toUpperCase() + '] Penyesuaian Neraca LAMPIRAN ' + def.code, 'posted');
          totalInserted++;
          
          // Update J array so next month's calculation sees this adjustment
          J.push({
            id: 'SUM-Neraca-' + m.month + '-' + def.code,
            tanggal: lastDay,
            akun_debit: dAcc, akun_kredit: kAcc,
            debit: amt, kredit: amt,
            status: 'posted'
          });
        });

        console.log(m.key.toUpperCase() + ': processed');
      });

      stmt.finalize(() => {
        console.log('✅ Inserted ' + totalInserted + ' Neraca adjustment journals for Feb/Mar/Apr');
      });
    });
  });
});
