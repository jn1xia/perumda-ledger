const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');

const db = new sqlite3.Database('server/perumda_ledger.db');

const excelFile = 'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026/DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026.xlsx';
const wb = XLSX.readFile(excelFile);

const ws = wb.Sheets['LR PERIOD JAN'];
const excelLR = {};
if (ws) {
  for (let r=1; r<100; r++) {
    const d = ws['D'+r] ? ws['D'+r].v : '';
    const h = ws['H'+r] ? ws['H'+r].v : null;
    const i = ws['I'+r] ? ws['I'+r].v : null;
    const j = ws['J'+r] ? ws['J'+r].v : null;
    const k = ws['K'+r] ? ws['K'+r].v : null;
    
    let val = null;
    if (typeof h === 'number') val = h;
    else if (typeof i === 'number') val = i;
    else if (typeof j === 'number') val = j;
    else if (typeof k === 'number') val = k;
    
    if (d && typeof d === 'string' && val !== null) {
      excelLR[d.trim()] = val;
    }
  }
}

// Fetch DB data for January
db.all("SELECT * FROM journals WHERE status='posted' AND tanggal LIKE '2026-01-%'", [], (err, rows) => {
    let dbMap = {};
    rows.forEach(r => {
        if (!r.id.startsWith('SA-')) {
            const debCode = r.akun_debit ? r.akun_debit.split(' ')[0] : '';
            const kreCode = r.akun_kredit ? r.akun_kredit.split(' ')[0] : '';
            const deb = r.akun_debit ? r.akun_debit.replace(/^\S+\s*-\s*/, '') : '';
            const kre = r.akun_kredit ? r.akun_kredit.replace(/^\S+\s*-\s*/, '') : '';
            
            // Only care about P&L accounts (4, 5, 6, 7, 8)
            if (debCode.match(/^[45678]/)) dbMap[deb] = (dbMap[deb] || 0) + (r.debit || 0);
            if (kreCode.match(/^[45678]/)) dbMap[kre] = (dbMap[kre] || 0) + (r.kredit || 0); // Both increase their respective balances for reporting
        }
    });

    console.log("=== LABA RUGI JANUARI ===");
    let allKeys = Object.keys(excelLR);
    let mdTable = "| Akun / Keterangan | Nilai Excel | Nilai Program | Selisih |\n|---|---|---|---|\n";
    
    for (let key of allKeys) {
        if (key.includes('JUMLAH') || key.includes('LABA') || key.includes('EBITDA')) continue;
        let eVal = excelLR[key];
        
        // find matching key in dbMap
        let dbVal = 0;
        let foundKey = null;
        for (let dk in dbMap) {
            if (dk.toLowerCase() === key.toLowerCase() || dk.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(dk.toLowerCase())) {
                dbVal += dbMap[dk];
                foundKey = dk;
            }
        }
        
        let selisih = Math.abs(eVal - dbVal);
        let eStr = eVal.toLocaleString('id-ID');
        let dStr = dbVal.toLocaleString('id-ID');
        let sStr = selisih === 0 ? "✅ SAMA" : selisih.toLocaleString('id-ID');
        
        mdTable += `| ${key} | Rp ${eStr} | Rp ${dStr} | ${sStr} |\n`;
    }
    
    console.log(mdTable);
});
