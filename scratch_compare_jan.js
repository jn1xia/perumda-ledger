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
    const j = ws['J'+r] ? ws['J'+r].v : null;
    const k = ws['K'+r] ? ws['K'+r].v : null;
    
    let val = null;
    if (typeof h === 'number') val = h;
    else if (typeof j === 'number') val = j;
    else if (typeof k === 'number') val = k;
    
    if (d && typeof d === 'string' && val !== null) {
      excelLR[d.trim()] = val;
    }
  }
}

const wsNeraca = wb.Sheets['NERACA JAN'];
const excelNeraca = {};
if (wsNeraca) {
  for (let r=1; r<150; r++) {
    const a = wsNeraca['A'+r] ? wsNeraca['A'+r].v : '';
    const d = wsNeraca['D'+r] ? wsNeraca['D'+r].v : null;
    const e = wsNeraca['E'+r] ? wsNeraca['E'+r].v : null;
    const f = wsNeraca['F'+r] ? wsNeraca['F'+r].v : null;
    const i = wsNeraca['I'+r] ? wsNeraca['I'+r].v : null;
    const j = wsNeraca['J'+r] ? wsNeraca['J'+r].v : null;
    const k = wsNeraca['K'+r] ? wsNeraca['K'+r].v : null;
    
    if (a && typeof a === 'string') {
        let val = null;
        if (typeof d === 'number') val = d;
        else if (typeof e === 'number') val = e;
        else if (typeof f === 'number') val = f;
        
        let val2 = null;
        if (typeof i === 'number') val2 = i;
        else if (typeof j === 'number') val2 = j;
        else if (typeof k === 'number') val2 = k;

        if (val !== null) excelNeraca[a.trim()] = val;
        if (val2 !== null) excelNeraca[a.trim() + '_KREDIT'] = val2; // for liabilities
    }
  }
}

// Fetch DB data for January
db.all("SELECT * FROM journals WHERE status='posted' AND tanggal LIKE '2026-01-%'", [], (err, rows) => {
    let dbMap = {};
    rows.forEach(r => {
        if (!r.id.startsWith('SA-')) {
            const deb = r.akun_debit ? r.akun_debit.replace(/^\S+\s*-\s*/, '') : '';
            const kre = r.akun_kredit ? r.akun_kredit.replace(/^\S+\s*-\s*/, '') : '';
            if (deb) dbMap[deb] = (dbMap[deb] || 0) + r.debit;
            if (kre) dbMap[kre] = (dbMap[kre] || 0) - r.kredit; // assuming credit is negative or we can track it
        }
    });

    console.log("=== LABA RUGI JANUARI ===");
    for (let key in excelLR) {
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
        console.log(`${key.padEnd(45)} | EXCEL: ${eVal.toLocaleString('id-ID').padStart(20)} | DB: ${Math.abs(dbVal).toLocaleString('id-ID').padStart(20)} | DIFF: ${Math.abs(eVal - Math.abs(dbVal)).toLocaleString('id-ID')}`);
    }
    
});
