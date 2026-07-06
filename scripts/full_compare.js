const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();

const janFile = 'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026/DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026.xlsx';
const febFile = 'src/FILES/LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx';
const marFile = 'src/FILES/LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx';
const aprFile = 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx';

const wbJ = XLSX.readFile(janFile);
const wbF = XLSX.readFile(febFile);
const wbM = XLSX.readFile(marFile);
const wbA = XLSX.readFile(aprFile);

function sheetRows(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

// Extract LR as key-value map (label -> first_numeric_value in row)
function extractLR(wb, sheetName) {
  const result = [];
  sheetRows(wb, sheetName).forEach((row, i) => {
    const label = [row[0], row[1]].map(c => String(c||'').trim()).filter(Boolean).join(' ').trim();
    const nums = row.filter(c => typeof c === 'number');
    if (label && nums.length > 0) {
      result.push({ row: i+1, label, val: nums[0], allNums: nums });
    }
  });
  return result;
}

// Extract Neraca as key-value map
function extractNeraca(wb, sheetName) {
  const result = [];
  sheetRows(wb, sheetName).forEach((row, i) => {
    const label = String(row[0]||row[1]||'').trim();
    const nums = row.filter(c => typeof c === 'number');
    if (label && nums.length > 0) {
      result.push({ row: i+1, label, val: nums[0], allNums: nums });
    }
  });
  return result;
}

// Extract Beban detail (sub-items with name and realization amount)
function extractBebanDetail(wb, sheetName) {
  const result = [];
  sheetRows(wb, sheetName).forEach((row, i) => {
    const nonEmpty = row.filter(c => c !== '');
    if (nonEmpty.length < 3) return;
    const name = nonEmpty.find(c => typeof c === 'string' && String(c).trim().length > 5);
    const nums = nonEmpty.filter(c => typeof c === 'number' && c > 0);
    if (name && nums.length >= 1) {
      result.push({ row: i+1, name: String(name).trim(), nums });
    }
  });
  return result;
}

// Extract Penerimaan/Rekap
function extractPenerimaan(wb, sheetName) {
  return extractBebanDetail(wb, sheetName);
}

// Program DB data
const db = new sqlite3.Database('server/perumda_ledger.db');

function getProgData(month, cb) {
  db.all("SELECT * FROM journals WHERE status='posted' AND tanggal LIKE '" + month + "%'", (err, journals) => {
    const sumD = (prefix) => journals.reduce((s,j) => s + ((j.akun_debit||'').split(' ')[0].startsWith(prefix) ? (j.debit||0) : 0), 0);
    const sumK = (prefix) => journals.reduce((s,j) => s + ((j.akun_kredit||'').split(' ')[0].startsWith(prefix) ? (j.kredit||0) : 0), 0);

    // LR breakdown
    const lr = {
      pendBisnis: sumK('41'),
      pendPengembangan: sumK('42'),
      pendUsaha: sumK('41') + sumK('42'),
      bppBapok: sumD('51010') || sumD('511'),
      bppLPG: sumD('51020') || sumD('512'),
      bpp: sumD('51'),
      bebanGaji: sumD('61010'),
      bebanTunjangan: sumD('61020'),
      bebanKelengkapan: sumD('61030'),
      bebanATK: sumD('61041'),
      bebanListrik: sumD('61050'),
      bebanKonsumsi: sumD('61060'),
      bebanPerlengkapan: sumD('61070'),
      bebanBBM: sumD('61080'),
      bebanPerjalanan: sumD('61090'),
      bebanPendidikan: sumD('61100'),
      bebanSewa: sumD('61110'),
      bebanJasa: sumD('61120'),
      bebanPenyusutan: sumD('6113'),
      bebanUmumLain: sumD('61140'),
      bebanAdmin: sumD('61'),
      bebanPemKendaraan: sumD('62010'),
      bebanPemPasar: sumD('62020'),
      bebanKebersihan: sumD('62030'),
      bebanPelayanan: sumD('62040'),
      bebanCetakan: sumD('62050'),
      bebanHonor: sumD('62060'),
      bebanTunjanganOps: sumD('62070'),
      bebanKelengkapanOps: sumD('62080'),
      bebanInsentif: sumD('62090'),
      bebanKeamanan: sumD('62100'),
      bebanOps: sumD('62'),
      pendBunga: journals.reduce((s,j) => {
        const c=(j.akun_kredit||'').split(' ')[0]; const n=j.akun_kredit||'';
        return s+((c==='70001'||(c==='70000'&&/bunga/i.test(n)))?(j.kredit||0):0);
      }, 0),
      bebanPajakBank: journals.reduce((s,j) => {
        const c=(j.akun_debit||'').split(' ')[0]; const n=j.akun_debit||'';
        return s+((c==='80001'||(c==='80000'&&/pajak/i.test(n)))?(j.debit||0):0);
      }, 0),
      bebanAdminBank: journals.reduce((s,j) => {
        const c=(j.akun_debit||'').split(' ')[0]; const n=j.akun_debit||'';
        return s+((c==='80002'||(c==='80000'&&/admin/i.test(n)))?(j.debit||0):0);
      }, 0),
      bebanLainLain: sumD('80003'),
      bebanNonOps: sumD('8'),
      pendNonOps: sumK('7'),
    };
    lr.labaUsaha = lr.pendUsaha - lr.bpp - lr.bebanAdmin - lr.bebanOps;
    lr.labaBersih = lr.labaUsaha + lr.pendNonOps - lr.bebanNonOps;
    lr.ebitda = lr.labaBersih - lr.pendBunga + lr.bebanPajakBank + lr.bebanPenyusutan;
    cb(lr);
  });
}

const months = ['2026-01','2026-02','2026-03','2026-04'];
const monthLabel = {'2026-01':'JANUARI','2026-02':'FEBRUARI','2026-03':'MARET','2026-04':'APRIL'};
let done = 0;
const progData = {};

months.forEach(m => {
  getProgData(m, lr => {
    progData[m] = lr;
    done++;
    if (done === 4) {
      printAllComparisons();
      db.close();
    }
  });
});

function fmtN(n) {
  if (n === undefined || n === null) return 'N/A';
  return n.toLocaleString('id-ID');
}

function chk(e, p) {
  if (e === undefined || e === null) return '(Excel: N/A)';
  const diff = (p||0) - (e||0);
  if (Math.abs(diff) < 0.1) return 'MATCH';
  return 'DIFF: Prog=' + fmtN(p) + ' Excel=' + fmtN(e) + ' selisih=' + fmtN(diff);
}

function printLRComparison(month, wb, lrSheetName) {
  const p = progData[month];
  const exRows = extractLR(wb, lrSheetName);
  const ex = {};
  exRows.forEach(r => { ex[r.label] = r.val; });

  const label = monthLabel[month];
  console.log('\n====================================================');
  console.log('LABA RUGI - ' + label);
  console.log('====================================================');

  const rows = [
    ['Pendapatan Bisnis Utama',             ex['Pendapatan Bisnis Utama'],                          p.pendBisnis],
    ['Pendapatan Pengembangan Bisnis Lainnya', ex['Pendapatan Pengembangan Bisnis Lainnya'],        p.pendPengembangan],
    ['JUMLAH PENDAPATAN USAHA',             ex['JUMLAH PENDAPATAN USAHA'],                          p.pendUsaha],
    ['BPP (Bapok & Gerai Inflasi)',         ex['Beban Pokok Penjualan (Bapok & Gerai Inflasi)'],    p.bppBapok],
    ['BPP (Gas LPG)',                       ex['Beban Pokok Penjualan (Gas LPG)'],                  p.bppLPG],
    ['JUMLAH BPP',                          ex['JUMLAH BEBAN POKOK PENJUALAN'],                     p.bpp],
    ['Beban Gaji',                          ex['Beban Gaji'],                                       p.bebanGaji],
    ['Beban Tunjangan Pegawai Umum',        ex['Beban Tunjangan Pegawai Umum'],                     p.bebanTunjangan],
    ['Beban Kelengkapan Pegawai',           ex['Beban Kelengkapan Pegawai'],                        p.bebanKelengkapan],
    ['Beban ATK',                           ex['Beban Alat Tulis Kantor'],                          p.bebanATK],
    ['Beban Listrik/Tel/Air',               ex['Beban Telepon/Listrik/Air/Wifi/Website'],           p.bebanListrik],
    ['Beban Konsumsi',                      ex['Beban Konsumsi Rapat dan Tamu'],                    p.bebanKonsumsi],
    ['Beban Perlengkapan Kantor',           ex['Beban Perlengkapan & Pemeliharaan Kantor'],         p.bebanPerlengkapan],
    ['Beban BBM',                           ex['Beban Bahan Bakar Minyak'],                        p.bebanBBM],
    ['Beban Perjalanan Dinas',              ex['Beban Perjalanan Dinas'],                           p.bebanPerjalanan],
    ['Beban Pendidikan/Pelatihan',          ex['Beban Pendidikan, Pelatihan dan Bimtek'],           p.bebanPendidikan],
    ['Beban Sewa Kendaraan',                ex['Beban Sewa Kendaraan'],                             p.bebanSewa],
    ['Beban Jasa Profesional',              ex['Beban Jasa Profesional/konsultan/tenaga ahli'],     p.bebanJasa],
    ['Beban Penyusutan',                    ex['Beban Penyusutan Aktiva Tetap'],                    p.bebanPenyusutan],
    ['Beban Umum Lainnya',                  ex['Beban Umum Lainnya'],                               p.bebanUmumLain],
    ['JUMLAH BEBAN UMUM',                   ex['JUMLAH BEBAN UMUM DAN ADMINISTRASI'],               p.bebanAdmin],
    ['Beban Pemeliharaan Kendaraan',        ex['Beban Pemeliharaan Kendaraan Operasional'],         p.bebanPemKendaraan],
    ['Beban Pemeliharaan Pasar',            ex['Beban Pemeliharaan Pasar'],                         p.bebanPemPasar],
    ['Beban Kebersihan',                    ex['Beban Pemeliharaan Kebersihan Pasar'],               p.bebanKebersihan],
    ['Beban Pelayanan & Pemasaran',         ex['Beban Pelayanan dan Pemasaran'],                    p.bebanPelayanan],
    ['Beban Barang Cetakan',                ex['Beban Barang Cetakan'],                             p.bebanCetakan],
    ['Beban Honor Kontrak',                 ex['Beban Gaji dan Honor Tenaga Kontrak dan Harian Lepas'], p.bebanHonor],
    ['Beban Tunjangan Ops',                 ex['Beban Tunjangan Pegawai Operasional'],              p.bebanTunjanganOps],
    ['Beban Kelengkapan Ops',               ex['Beban Kelengkapan Pegawai'],                        p.bebanKelengkapanOps],
    ['Beban Insentif',                      ex['Beban Insentif/Kesejahteraan Pegawai'],             p.bebanInsentif],
    ['Beban Keamanan',                      ex['Beban Pemeliharaan Keamanan dan Ketertiban Pasar'], p.bebanKeamanan],
    ['JUMLAH BEBAN OPS',                    ex['JUMAH BEBAN OPERASIONAL DAN BISNIS'],               p.bebanOps],
    ['JUMLAH BEBAN USAHA',                  ex['JUMAH BEBAN USAHA'],                                p.bebanAdmin + p.bebanOps],
    ['LABA (RUGI) USAHA',                   ex['LABA (RUGI) USAHA'],                               p.labaUsaha],
    ['Pendapatan Bunga Bank',               ex['Pendapatan Bunga Bank'],                            p.pendBunga],
    ['Beban Pajak Bank',                    ex['Beban Pajak Bank'],                                 p.bebanPajakBank],
    ['Beban Administrasi Bank',             ex['Beban Administrasi Bank'],                          p.bebanAdminBank],
    ['Beban Lain-lain',                     ex['Beban Lain-lain'],                                  p.bebanLainLain],
    ['JUMLAH BEBAN NON OPS',                ex['JUMAH BEBAN NON OPERASIONAL'],                      p.bebanNonOps],
    ['LABA (RUGI) BERSIH',                  ex['LABA (RUGI) BERSIH SETELAH PAJAK'],                 p.labaBersih],
    ['EBITDA',                              ex['EBITDA (Earning Before Interest Tax Depreciation Amortization)'], p.ebitda],
  ];

  let hasIssue = false;
  rows.forEach(([name, exVal, progVal]) => {
    const status = chk(exVal, progVal);
    const flag = status !== 'MATCH' ? ' <<<' : '';
    if (flag) hasIssue = true;
    console.log('  ' + name.padEnd(40) + ' | Excel: ' + String(fmtN(exVal)).padStart(20) + ' | ' + status + flag);
  });
  if (!hasIssue) console.log('  >> ALL ROWS MATCH PERFECTLY');
}

function printAllComparisons() {
  printLRComparison('2026-01', wbJ, 'LABA RUGI JAN 2026');
  printLRComparison('2026-02', wbF, 'LABA RUGI FEB 2026');
  printLRComparison('2026-03', wbM, 'LABA RUGI MARET 2026');
  printLRComparison('2026-04', wbA, 'LABA RUGI APRIL 2026');
}
