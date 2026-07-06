const XLSX = require('xlsx');
const path = require('path');

const files = [
  { file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx', month: 'Januari' },
  { file: 'LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx', month: 'Februari' },
  { file: 'LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx', month: 'Maret' },
  { file: 'LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx', month: 'April' },
];

files.forEach(({ file, month }) => {
  const fp = path.join(__dirname, '..', 'src', 'FILES', file);
  try {
    const wb = XLSX.readFile(fp);
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${month}: ${file}`);
    console.log(`Sheets: ${wb.SheetNames.join(', ')}`);
    
    // Find Neraca sheet
    const neracaSheet = wb.SheetNames.find(s => 
      s.toLowerCase().includes('neraca') && !s.toLowerCase().includes('saldo')
    );
    if (neracaSheet) {
      console.log(`\n--- ${neracaSheet} ---`);
      const ws = wb.Sheets[neracaSheet];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      data.forEach((row, i) => {
        // Only show rows with content
        const hasContent = row.some(c => c !== '' && c !== null && c !== undefined);
        if (hasContent) console.log(`  ${i}: ${JSON.stringify(row)}`);
      });
    }
    
    // Find Arus Kas sheet
    const arusSheet = wb.SheetNames.find(s => s.toLowerCase().includes('arus'));
    if (arusSheet) {
      console.log(`\n--- ${arusSheet} ---`);
      const ws = wb.Sheets[arusSheet];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      data.forEach((row, i) => {
        const hasContent = row.some(c => c !== '' && c !== null && c !== undefined);
        if (hasContent) console.log(`  ${i}: ${JSON.stringify(row)}`);
      });
    }
  } catch (e) {
    console.log(`${month}: ERROR - ${e.message}`);
  }
});
