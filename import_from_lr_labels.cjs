/**
 * import_from_lr_labels.cjs
 * Reads directly from LABA RUGI sheets (by text label, not row number)
 * Handles row-position shifts between months correctly.
 * This is the AUTHORITATIVE import script matching the Excel LABA RUGI reports.
 */
const xlsx = require('xlsx');
const db = require('./server/db/database.cjs');

// ============ LABEL → ACCOUNT MAPPING ============
// BebanU: label keywords → account code
const BEBAN_U_MAP = [
  { kw: ['Beban Gaji'], code: '61010', name: 'Beban Gaji', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Tunjangan Pegawai Umum', 'Tunjangan Pegawai Umum'], code: '61020', name: 'Beban Tunjangan Pegawai Umum', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Perlengkapan', 'Beban Kelengkapan Pegawai'], code: '61030', name: 'Beban Kelengkapan Pegawai', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Alat Tulis Kantor', 'Alat Tulis Kantor'], code: '61040', name: 'Beban Alat Tulis Kantor', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Telepon', 'Telepon/Listrik', 'Telepon.Listrik'], code: '61050', name: 'Beban Telepon/Listrik/Air/Wifi', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Konsumsi Rapat', 'Konsumsi Rapat'], code: '61060', name: 'Beban Konsumsi Rapat dan Tamu', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Perlengkapan & Pemeliharaan', 'Perlengkapan.*Pemeliharaan'], code: '61070', name: 'Beban Perlengkapan & Pemeliharaan Kantor', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Bahan Bakar', 'Bahan Bakar Minyak'], code: '61080', name: 'Beban Bahan Bakar Minyak', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Perjalanan Dinas', 'Perjalanan Dinas'], code: '61090', name: 'Beban Perjalanan Dinas', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Pendidikan', 'Pelatihan dan Bimtek', 'Pendidikan.*Pelatihan'], code: '61100', name: 'Beban Pendidikan dan Pelatihan', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Sewa Kendaraan', 'Sewa Kendaraan'], code: '61110', name: 'Beban Sewa Kendaraan', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Jasa Profesional', 'Jasa Profesional', 'konsultan'], code: '61120', name: 'Beban Jasa Profesional/Konsultan', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Penyusutan Aktiva Tetap', 'Penyusutan Aktiva'], code: '61130', name: 'Beban Penyusutan Aktiva Tetap', contra: '12300 - Akumulasi Penyusutan' },
  { kw: ['Beban Umum Lainnya', 'Umum Lainnya'], code: '61140', name: 'Beban Umum Lainnya', contra: '11103 - Bank Kalsel' },
];

// BebanO: label keywords → account code
const BEBAN_O_MAP = [
  { kw: ['Beban Pemeliharaan Kendaraan Operasional', 'Pemeliharaan Kendaraan'], code: '62010', name: 'Beban Pemeliharaan Kendaraan Operasional', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Pemeliharaan Pasar', 'Pemeliharaan Pasar'], code: '62020', name: 'Beban Pemeliharaan Pasar', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Pemeliharaan Kebersihan', 'Kebersihan Pasar'], code: '62030', name: 'Beban Pemeliharaan Kebersihan Pasar', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Pelayanan dan Pemasaran', 'Pelayanan dan Pemasaran'], code: '62040', name: 'Beban Pelayanan dan Pemasaran', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Barang Cetakan', 'Barang Cetakan'], code: '62050', name: 'Beban Barang Cetakan', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Gaji dan Honor Tenaga', 'Honor Tenaga Kontrak', 'Harian Lepas'], code: '62060', name: 'Beban Honor Tenaga Kontrak dan Harian Lepas', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Tunjangan Pegawai Operasional', 'Tunjangan Pegawai Operasional'], code: '62070', name: 'Beban Tunjangan Pegawai Operasional', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Kelengkapan Pegawai'], code: '62080', name: 'Beban Kelengkapan Pegawai Operasional', contra: '11103 - Bank Kalsel' },
  { kw: ['Beban Insentif', 'Kesejahteraan Pegawai'], code: '62090', name: 'Beban Insentif/Kesejahteraan Pegawai', contra: '11103 - Bank Kalsel' },
  { kw: ['Keamanan dan Ketertiban', 'Keamanan Pasar', 'Ketertiban Pasar'], code: '62095', name: 'Beban Pemeliharaan Keamanan dan Ketertiban Pasar', contra: '11103 - Bank Kalsel' },
];

function matchMap(label, mapArr) {
  const ln = label.toLowerCase();
  for (const m of mapArr) {
    if (m.kw.some(k => ln.includes(k.toLowerCase()))) return m;
  }
  return null;
}

function readLRSheet(file, sheetName) {
  const wb = xlsx.readFile(file);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet ${sheetName} not found in ${file}`);

  // Collect all row data: text labels and J-column values
  const rowData = {};
  Object.entries(ws).filter(([k]) => !k.startsWith('!')).forEach(([addr, cell]) => {
    const col = addr.replace(/[0-9]/g, '');
    const row = parseInt(addr.replace(/[A-Z]/g, ''));
    if (!rowData[row]) rowData[row] = { labels: [], jVal: null };

    if (['B','C','D','E'].includes(col)) {
      const v = String(cell.v || '').trim();
      if (v.length > 3) rowData[row].labels.push(v);
    }
    if (col === 'J' && typeof cell.v === 'number') {
      rowData[row].jVal = cell.v;
    }
  });

  // Build section-aware list of (label, value, rowNum) tuples
  const items = [];
  Object.entries(rowData).sort(([a],[b]) => +a - +b).forEach(([rowStr, { labels, jVal }]) => {
    const row = +rowStr;
    if (labels.length > 0) {
      items.push({ row, label: labels[labels.length-1], jVal });
    }
  });

  return items;
}

function extractEntries(items) {
  const entries = [];
  let section = 'none'; // Track section: pendapatan, bpp, beban_u, beban_o, nonop

  for (const { row, label, jVal } of items) {
    const lu = label.toUpperCase();
    // Section detectors
    if (lu.includes('BEBAN UMUM DAN ADMINISTRASI')) { section = 'beban_u'; continue; }
    if (lu.includes('BEBAN OPERASIONAL DAN BISNIS')) { section = 'beban_o'; continue; }
    if (lu.includes('BEBAN POKOK PENJUALAN') && !lu.includes('JUMLAH') && !lu.includes('(')) { section = 'bpp'; continue; }
    if (lu.includes('PENDAPATAN USAHA') || lu.includes('PENDAPATAN BISNIS')) {
      if (!lu.includes('JUMLAH')) section = 'pendapatan';
    }
    if (lu.includes('PENDAPATAN LAIN') || lu.includes('BEBAN LAIN-LAIN')) { section = 'nonop'; }
    if (lu.includes('LABA') || lu.includes('EBITDA')) { section = 'summary'; }

    if (jVal === null || Math.abs(jVal) < 1) continue;
    const amount = Math.abs(jVal);

    if (lu.includes('JUMLAH') || lu.includes('JUMAH')) continue; // Skip totals rows

    switch(section) {
      case 'pendapatan': {
        if (label.includes('Bisnis Utama') || label.includes('Pendapatan Bisnis Utama')) {
          entries.push({ code: '41000', name: 'Pendapatan Bisnis Utama', amount, isExpense: false, contra: '11103 - Bank Kalsel' });
        } else if (label.includes('Bisnis Lainnya') || label.includes('Pengembangan Bisnis')) {
          entries.push({ code: '42000', name: 'Pendapatan Pengembangan Bisnis Lainnya', amount, isExpense: false, contra: '11103 - Bank Kalsel' });
        }
        break;
      }
      case 'bpp': {
        if (label.toLowerCase().includes('gas lpg') || label.toLowerCase().includes('lpg')) {
          entries.push({ code: '51020', name: 'Beban Pokok Penjualan Gas LPG', amount, isExpense: true, contra: '11301 - Persediaan Barang' });
        } else if (label.toLowerCase().includes('bapok') || label.toLowerCase().includes('pokok') || label.toLowerCase().includes('gerai')) {
          entries.push({ code: '51010', name: 'Beban Pokok Penjualan Bapok', amount, isExpense: true, contra: '11301 - Persediaan Barang' });
        }
        break;
      }
      case 'beban_u': {
        const match = matchMap(label, BEBAN_U_MAP);
        if (match) {
          entries.push({ code: match.code, name: match.name, amount, isExpense: true, contra: match.contra });
        }
        break;
      }
      case 'beban_o': {
        const match = matchMap(label, BEBAN_O_MAP);
        if (match) {
          entries.push({ code: match.code, name: match.name, amount, isExpense: true, contra: match.contra });
        }
        break;
      }
      case 'nonop': {
        if (label.toLowerCase().includes('pendapatan bunga')) {
          entries.push({ code: '70001', name: 'Pendapatan Bunga Bank', amount, isExpense: false, contra: '11103 - Bank Kalsel' });
        } else if (label.toLowerCase().includes('lebih setor')) {
          entries.push({ code: '70002', name: 'Pendapatan Lebih Setor', amount, isExpense: false, contra: '11103 - Bank Kalsel' });
        } else if (label.toLowerCase().includes('pajak bank')) {
          entries.push({ code: '80001', name: 'Beban Pajak Bank', amount, isExpense: true, contra: '11103 - Bank Kalsel' });
        } else if (label.toLowerCase().includes('administrasi bank')) {
          entries.push({ code: '80002', name: 'Beban Administrasi Bank', amount, isExpense: true, contra: '11103 - Bank Kalsel' });
        } else if (label.toLowerCase().includes('beban lain')) {
          entries.push({ code: '80003', name: 'Beban Lain-lain', amount, isExpense: true, contra: '11103 - Bank Kalsel' });
        }
        break;
      }
    }
  }
  return entries;
}

const MONTHS = [
  { file: './src/FILES/DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx', lr: 'LABA RUGI JAN 2026', tanggal: '2026-01-31', m: '01', label: 'JAN' },
  { file: './src/FILES/LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx', lr: 'LABA RUGI FEB 2026', tanggal: '2026-02-28', m: '02', label: 'FEB' },
  { file: './src/FILES/LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx', lr: 'LABA RUGI MARET 2026', tanggal: '2026-03-31', m: '03', label: 'MAR' },
  { file: './src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx', lr: 'LABA RUGI APRIL 2026', tanggal: '2026-04-30', m: '04', label: 'APR' },
];

const EX = {
  '01': { rev: 702355127, bpp: 15444000, bu: 764813073, bo: 241641232 },
  '02': { rev: 615807403, bpp: 26039000, bu: 730877129, bo: 324519938 },
  '03': { rev: 588916123, bpp: 47457900, bu: 846859406, bo: 510477567 },
  '04': { rev: 2100317854, bpp: 170972200, bu: 738619007, bo: 355240641 },
};

async function importMonth(config) {
  const { file, lr, tanggal, m, label } = config;
  console.log(`\n=== Processing ${label} ===`);

  const items = readLRSheet(file, lr);
  const entries = extractEntries(items);

  // Verification totals
  const tot = (pfx) => entries.filter(e=>e.code.startsWith(pfx)).reduce((s,e)=>s+e.amount,0);
  const rev = tot('41') + tot('42');
  const bpp = tot('51');
  const bu = tot('61');
  const bo = tot('62');
  const ex = EX[m];
  const M = v => (v/1e6).toFixed(1)+'M';
  const s = (v,e)=>e?(Math.abs(v/e-1)<0.01?'✅':Math.abs(v/e-1)<0.05?`⚠️${((v/e-1)*100).toFixed(1)}%`:`❌${(v/e).toFixed(2)}×`):'';

  console.log(`  Revenue : ${M(rev)} ${s(rev,ex.rev)} | exp:${M(ex.rev)}`);
  console.log(`  BPP     : ${M(bpp)} ${s(bpp,ex.bpp)} | exp:${M(ex.bpp)}`);
  console.log(`  BebanU  : ${M(bu)} ${s(bu,ex.bu)} | exp:${M(ex.bu)}`);
  console.log(`  BebanO  : ${M(bo)} ${s(bo,ex.bo)} | exp:${M(ex.bo)}`);
  console.log(`  Entries : ${entries.length}`);

  return new Promise(resolve => {
    db.run(`DELETE FROM journals WHERE strftime('%m',tanggal)=? AND id NOT LIKE 'SA-%'`, [m], function() {
      console.log(`  Cleared ${this.changes} old entries`);
      if (entries.length === 0) { resolve(); return; }

      const stmt = db.prepare(`INSERT OR REPLACE INTO journals 
        (id, tanggal, keterangan, debit, kredit, akun_debit, akun_kredit, status) VALUES (?,?,?,?,?,?,?,?)`);

      entries.forEach((e, idx) => {
        const id = `LRX-${label}-${String(idx+1).padStart(4,'0')}`;
        const akunFull = `${e.code} - ${e.name}`;
        const akun_d = e.isExpense ? akunFull : e.contra;
        const akun_k = e.isExpense ? e.contra : akunFull;
        stmt.run(id, tanggal, e.name.slice(0,200), e.amount, e.amount, akun_d, akun_k, 'posted');
      });

      stmt.finalize(() => {
        console.log(`  Inserted ${entries.length} entries`);
        resolve();
      });
    });
  });
}

async function run() {
  for (const config of MONTHS) await importMonth(config);

  await new Promise(r => setTimeout(r, 800));
  db.all(`SELECT strftime('%m',tanggal) as m,
    SUM(CASE WHEN akun_kredit LIKE '41%' OR akun_kredit LIKE '42%' THEN kredit ELSE 0 END) as rev,
    SUM(CASE WHEN akun_debit LIKE '51%' THEN debit ELSE 0 END) as bpp,
    SUM(CASE WHEN akun_debit LIKE '61%' THEN debit ELSE 0 END) as bu,
    SUM(CASE WHEN akun_debit LIKE '62%' THEN debit ELSE 0 END) as bo
    FROM journals WHERE strftime('%Y',tanggal)='2026' AND strftime('%m',tanggal) IN ('01','02','03','04')
    AND id NOT LIKE 'SA-%' GROUP BY m ORDER BY m`, (err, r) => {
    if (err) { console.error(err.message); return; }
    const s=(v,ex)=>Math.abs(v/ex-1)<0.01?'✅':Math.abs(v/ex-1)<0.05?`⚠️${((v/ex-1)*100).toFixed(1)}%`:`❌${(v/ex).toFixed(2)}×`;
    const M=v=>(v/1e6).toFixed(2);
    console.log('\n========== FINAL VERIFICATION ==========');
    r.forEach(row => {
      const ex = EX[row.m];
      const laba = row.rev - row.bpp - row.bu - row.bo;
      const exLaba = ex.rev - ex.bpp - ex.bu - ex.bo;
      const ok = Math.abs(laba/exLaba-1) < 0.02;
      console.log(`${row.m}: Rev=${M(row.rev)}M ${s(row.rev,ex.rev)} | BPP=${M(row.bpp)}M ${s(row.bpp,ex.bpp)} | BU=${M(row.bu)}M ${s(row.bu,ex.bu)} | BO=${M(row.bo)}M ${s(row.bo,ex.bo)}`);
      console.log(`    Laba=${M(laba)}M (Excel:${M(exLaba)}M) ${ok?'✅':'⚠️'}`);
    });
    process.exit(0);
  });
}

run();
