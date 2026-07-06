const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('server/perumda_ledger.db');

// Pendapatan Pengelolaan Lain-lain (Cash Basis) - bulan ini values from Excel
const pendLainlain = {
  '2026-02': { amount: 116286059, date: '2026-02-28' },
  '2026-03': { amount: 92272741, date: '2026-03-31' },
  '2026-04': { amount: 71213213, date: '2026-04-30' },
};

db.serialize(() => {
  // Delete existing CASH-PEN entries for Feb/Mar/Apr
  db.run("DELETE FROM journals WHERE id LIKE 'CASH-PEN-2026-02%'");
  db.run("DELETE FROM journals WHERE id LIKE 'CASH-PEN-2026-03%'");
  db.run("DELETE FROM journals WHERE id LIKE 'CASH-PEN-2026-04%'");

  const stmt = db.prepare('INSERT INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?,?,?,?,?,?,?,?)');

  Object.entries(pendLainlain).forEach(([month, data]) => {
    const label = month.replace('2026-', '').toUpperCase();
    
    // Journal 1: Record cash receipt - kredit 41060
    // Penerimaan report (kredit-only sum) picks this up
    stmt.run(
      'CASH-PEN-' + month + '-41060',
      data.date,
      '11999 Kliring Penerimaan',
      '41060 Pendapatan Pengelolaan Lain-lain',
      data.amount, data.amount,
      '[' + label + '] Pendapatan Pengelolaan Lain-lain (Cash Basis)',
      'posted'
    );

    // Journal 2: Reverse P&L impact - debit 41060
    // LABA RUGI uses NET (kredit-debit), so this cancels the +amount
    // Penerimaan uses kredit-only, so this doesn't affect it
    stmt.run(
      'CASH-PEN-' + month + '-41060-REV',
      data.date,
      '41060 Pendapatan Pengelolaan Lain-lain (Accrual Reversal)',
      '11999 Kliring Penerimaan',
      data.amount, data.amount,
      '[' + label + '] Reversal LR - Pendapatan Lain-lain sudah diakui sebelumnya',
      'posted'
    );
  });

  stmt.finalize(() => {
    console.log('✅ Inserted 6 Penerimaan adjustment journals for Feb/Mar/Apr');

    // Verify all months
    db.all("SELECT * FROM journals WHERE status='posted'", (err, J) => {
      ['2026-01', '2026-02', '2026-03', '2026-04'].forEach(month => {
        const mJ = J.filter(j => j.tanggal?.startsWith(month));
        
        const penK41 = mJ.reduce((s,j) => {
          const c = (j.akun_kredit||'').split(' ')[0];
          return s + (c.startsWith('41') ? (j.kredit||0) : 0);
        }, 0);
        const penK42 = mJ.reduce((s,j) => {
          const c = (j.akun_kredit||'').split(' ')[0];
          return s + (c.startsWith('42') ? (j.kredit||0) : 0);
        }, 0);
        
        const lrNet41 = mJ.reduce((s,j) => {
          const kc = (j.akun_kredit||'').split(' ')[0];
          const dc = (j.akun_debit||'').split(' ')[0];
          if (kc.startsWith('41')) s += (j.kredit||0);
          if (dc.startsWith('41')) s -= (j.debit||0);
          return s;
        }, 0);
        
        console.log(month + ':');
        console.log('  Penerimaan total (41+42 kredit): ' + Math.round(penK41+penK42).toLocaleString());
        console.log('  LABA RUGI 41 NET: ' + Math.round(lrNet41).toLocaleString());
      });
      
      db.close();
    });
  });
});
