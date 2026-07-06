const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('server/perumda_ledger.db');

// The Penerimaan sheet (Cash Basis) for January includes:
// Item 1.7: "Pendapatan Pengelolaan Lain-lain 2025" = 149,020,456
// This is cash received in Jan 2026 from 2025 revenue.
// It appears in the Penerimaan (cash basis) report but NOT in LABA RUGI (accrual basis).
//
// Solution:
// 1. Add a journal crediting 41060 (Pendapatan Pengelolaan Lain-lain) for 149,020,456
//    → This makes the Penerimaan report pick it up (it sums prefix '41')
// 2. The LABA RUGI uses sumJByPrefix which is NET (kredit - debit for revenue)
//    → We need to add a counter-journal that debits 41060 to cancel it out in LABA RUGI
//    → BUT both journals would cancel each other in LABA RUGI... 
//    → Actually we need a different approach: tag this as a non-P&L cash receipt
//
// Better approach: use account 41060 for the cash receipt and add a SUM reversal
// that debits 41060 to zero out the P&L impact. But the Penerimaan report also uses
// sumJByPrefix... so it would also be zeroed out.
//
// Cleanest approach: The Penerimaan report sums ALL kredit where prefix='41'.
// The LABA RUGI also sums kredit - debit where prefix='41'.
// We need Penerimaan to show 701,743,583 and LABA RUGI to show 552,723,127.
//
// Since both use the same prefix-based logic, we can't differentiate using journals alone.
// Instead, we'll add a special line item in the Penerimaan report component for this
// "Pendapatan Lain-lain 2025" item.
//
// For now, this script will verify current state and log what needs to be done.

db.all("SELECT * FROM journals WHERE status='posted' AND tanggal LIKE '2026-01%'", (err, J) => {
  // Current Penerimaan total (prefix 41 kredit)
  const sumK41 = J.reduce((s,j) => {
    const code = (j.akun_kredit||'').split(' ')[0];
    return s + (code.startsWith('41') ? (j.kredit||0) : 0);
  }, 0);
  
  // Current LABA RUGI (NET: kredit - debit for prefix 41)
  const net41 = J.reduce((s,j) => {
    const kc = (j.akun_kredit||'').split(' ')[0];
    const dc = (j.akun_debit||'').split(' ')[0];
    if (kc.startsWith('41')) s += (j.kredit||0);
    if (dc.startsWith('41')) s -= (j.debit||0);
    return s;
  }, 0);
  
  console.log('Current 41xxx kredit sum (for Penerimaan):', sumK41);
  console.log('Current 41xxx NET (for LABA RUGI):', net41);
  console.log('Target Penerimaan Bisnis Utama:', 701743583);
  console.log('Target LABA RUGI Bisnis Utama:', 552723127);
  console.log('Diff to add for Penerimaan:', 701743583 - sumK41);
  
  db.close();
});
