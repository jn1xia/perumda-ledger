const fs = require('fs');

// Read the actual sample data
const sampleDataPath = './src/data/sampleData.js';
const content = fs.readFileSync(sampleDataPath, 'utf-8');

// Quick and dirty extraction of journals and saldoAwal
let journals = [];
let coaTree = [];

try {
  // Use a hack to load the module
  const moduleCode = content.replace(/export const/g, 'exports.').replace(/export {.*?}/, '');
  const m = new module.constructor();
  m.paths = module.paths;
  m._compile(moduleCode, sampleDataPath);
  
  journals = m.exports.jurnalData || [];
  coaTree = m.exports.coaData || [];
} catch (e) {
  console.error("Error loading sample data:", e);
}

function flattenCOA(nodes, result = []) {
  nodes.forEach(n => {
    result.push({
      code: n.code, name: n.name, type: n.type, category: n.category,
      saldoAwal: n.saldoAwal || 0,
      defaultSide: n.defaultSide || 'D'
    })
    if (n.children) flattenCOA(n.children, result)
  })
  return result
}
const coaFlat = flattenCOA(coaTree);

function analyzePeriod(monthStr) { // '2026-01' or '2026-04'
  const postedJournals = journals.filter(j => j.status === 'posted' || j.status === 'approved');
  
  // Laba Rugi filtering: strict exact month
  const lrJournals = postedJournals.filter(j => j.tanggal && j.tanggal.startsWith(monthStr));
  
  // Neraca filtering: up to end of selected month
  const nJournals = postedJournals.filter(j => j.tanggal && j.tanggal <= `${monthStr}-31`);

  function calculateBalance(codePrefix, isNeraca) {
    let total = 0;
    const jList = isNeraca ? nJournals : lrJournals;
    
    // Sum from COA saldo awal (only for Neraca usually, but let's see how the app does it)
    if (isNeraca) {
      coaFlat.filter(c => c.code.startsWith(codePrefix)).forEach(c => {
        const dSide = codePrefix.startsWith('1') || codePrefix.startsWith('5') || codePrefix.startsWith('6') || codePrefix.startsWith('8') ? 'D' : 'K';
        // wait, the app calculates saldo awal.
        if (dSide === 'D') {
          total += c.saldoAwal;
        } else {
          total += c.saldoAwal; // Wait, app assumes saldoAwal is absolute value and adds it.
        }
      });
    }

    // Sum from journals
    jList.forEach(j => {
      const codeD = j.akunDebit ? j.akunDebit.split(' ')[0] : '';
      const codeK = j.akunKredit ? j.akunKredit.split(' ')[0] : '';
      
      const dSide = codePrefix.startsWith('1') || codePrefix.startsWith('5') || codePrefix.startsWith('6') || codePrefix.startsWith('8') ? 'D' : 'K';

      if (codeD.startsWith(codePrefix)) {
        if (dSide === 'D') total += j.debit; else total -= j.debit;
      }
      if (codeK.startsWith(codePrefix)) {
        if (dSide === 'K') total += j.kredit; else total -= j.kredit;
      }
    });
    return total;
  }

  // Pendapatan (4) - Beban (6)
  const pendapatan = calculateBalance('4', false);
  const beban = calculateBalance('6', false);
  const labaRugi = pendapatan - beban;

  // Aset (1)
  const aset = calculateBalance('1', true);
  // Kewajiban (2)
  const kewajiban = calculateBalance('2', true);
  // Ekuitas (3) (base)
  const ekuitasBase = calculateBalance('3', true);
  
  const totalEkuitas = ekuitasBase + labaRugi; // roughly, wait Laba Ditahan needs all previous months.

  console.log(`\n=== Period: ${monthStr} ===`);
  console.log(`Pendapatan (4): ${pendapatan.toLocaleString('id-ID')}`);
  console.log(`Beban (6):      ${beban.toLocaleString('id-ID')}`);
  console.log(`Laba/Rugi:      ${labaRugi.toLocaleString('id-ID')}`);
  console.log(`Aset (1):       ${aset.toLocaleString('id-ID')}`);
  console.log(`Kewajiban (2):  ${kewajiban.toLocaleString('id-ID')}`);
  console.log(`Ekuitas Base(3):${ekuitasBase.toLocaleString('id-ID')}`);
  console.log(`Laba Rugi:      ${labaRugi.toLocaleString('id-ID')}`);
  console.log(`Neraca Check: Aset(${aset}) - (Kewajiban+Ekuitas+LR)(${kewajiban+ekuitasBase+labaRugi}) = ${aset - (kewajiban+ekuitasBase+labaRugi)}`);
}

analyzePeriod('2026-01');
analyzePeriod('2026-04');
