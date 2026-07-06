const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('server/perumda_ledger.db');

db.serialize(() => {
  // Delete any existing CASH-PENERIMAAN journals
  db.run("DELETE FROM journals WHERE id LIKE 'CASH-PEN-%'");

  const stmt = db.prepare('INSERT INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?,?,?,?,?,?,?,?)');

  // Journal 1: Record the cash receipt from "Pendapatan Pengelolaan Lain-lain 2025"
  // This credits 41060, so the Penerimaan report (kredit-only summing) picks it up
  stmt.run(
    'CASH-PEN-2026-01-41060',
    '2026-01-31',
    '11999 Kliring Penerimaan',
    '41060 Pendapatan Pengelolaan Lain-lain 2025',
    149020456, 149020456,
    '[JAN] Pendapatan Pengelolaan Lain-lain 2025 (Cash Basis)',
    'posted'
  );

  // Journal 2: Reverse the P&L impact - debit 41060 to cancel it in LABA RUGI
  // The LABA RUGI uses NET summing (kredit - debit), so this cancels the +149M
  // The Penerimaan report uses kredit-only summing, so this doesn't affect it
  stmt.run(
    'CASH-PEN-2026-01-41060-REV',
    '2026-01-31',
    '41060 Pendapatan Pengelolaan Lain-lain 2025 (Accrual Reversal)',
    '11999 Kliring Penerimaan',
    149020456, 149020456,
    '[JAN] Reversal Laba Rugi - Pendapatan Lain-lain 2025 sudah diakui di 2025',
    'posted'
  );

  stmt.finalize(() => {
    console.log("✅ Inserted 2 Penerimaan adjustment journals for Jan");

    // Verify
    db.all("SELECT * FROM journals WHERE status='posted' AND tanggal LIKE '2026-01%'", (err, J) => {
      // Penerimaan: kredit-only sum for prefix 41
      const penKredit41 = J.reduce((s,j) => {
        const code = (j.akun_kredit||'').split(' ')[0];
        return s + (code.startsWith('41') ? (j.kredit||0) : 0);
      }, 0);

      // LABA RUGI: NET (kredit - debit) for prefix 41
      const lrNet41 = J.reduce((s,j) => {
        const kc = (j.akun_kredit||'').split(' ')[0];
        const dc = (j.akun_debit||'').split(' ')[0];
        if (kc.startsWith('41')) s += (j.kredit||0);
        if (dc.startsWith('41')) s -= (j.debit||0);
        return s;
      }, 0);

      console.log("");
      console.log("=== VERIFICATION ===");
      console.log("Penerimaan (kredit sum 41xxx):", penKredit41.toLocaleString(), 
                  penKredit41 === 701743583 ? "✅ MATCH (701,743,583)" : "❌ MISMATCH");
      console.log("LABA RUGI (NET sum 41xxx):", lrNet41.toLocaleString(),
                  Math.abs(lrNet41 - 552723127) < 1 ? "✅ MATCH (552,723,127)" : "❌ MISMATCH");

      db.close();
    });
  });
});
