/* eslint-disable */
const path = require('path');
const XLSX = require('xlsx');
const RI = require('./import_report_data.cjs');
const REF2 = path.join(__dirname, '..', 'src', 'FILES', 'LAMPIRAN LAPORAN KEUANGAN JUNI 2026  (2).xlsx');
const wb = XLSX.readFile(REF2);
const neraca = RI.parseNeraca(wb.Sheets['NERACA JUNI 2026']);
const lr = RI.parseLabaRugi(wb.Sheets['LABA RUGI JUNI 2026'], 9);
const ak = RI.parseArusKas(wb.Sheets['ARUS KAS JUNI 2026'], 2);

console.log('===== NERACA (idx | depth | value!=null? | label | value) =====');
neraca.forEach((r, i) => {
  console.log(`${String(i).padStart(3)} d${r.depth} ${r.value==null?'   ':'VAL'} | ${r.label}  ::  ${r.value}`);
});
console.log('\n===== LABA RUGI =====');
lr.forEach((r, i) => {
  console.log(`${String(i).padStart(3)} d${r.depth} ${r.value==null?'   ':'VAL'} | ${r.label}  ::  ${r.value}`);
});
console.log('\n===== ARUS KAS =====');
ak.forEach((r, i) => {
  console.log(`${String(i).padStart(3)} ${r.isSection?'SEC':'   '} ${r.value==null?'   ':'VAL'} | ${r.label}  ::  ${r.value}`);
});
