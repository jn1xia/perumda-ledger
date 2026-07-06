/**
 * reimport_all_journals.cjs
 * 
 * Re-imports ALL journal data (Jan–Apr 2026) from Excel files,
 * storing EVERY ROW from the Excel exactly as-is in `journal_lines`.
 * 
 * Each Excel row → one journal_lines entry (flat, no grouping).
 * Parent journal entries group related lines for report compatibility.
 */
const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'server', 'perumda_ledger.db');
const DIR = path.join(__dirname, 'src/FILES');

// ─── Config ───────────────────────────────────────────────────────────────────
const MONTHS = [
  {
    month: '2026-01', label: 'Januari',
    file: 'DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx',
    sheet: 'JURNAL JAN 2026',
    format: 'jan', // col: [date, buktiNo, akunName, subAkun, D, K, ket]
  },
  {
    month: '2026-02', label: 'Februari',
    file: 'LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx',
    sheet: 'JURNAL FEB 2026',
    format: 'std', // col: [akunCode, date, buktiNo, akunName, subAkun, D, K, ket]
  },
  {
    month: '2026-03', label: 'Maret',
    file: 'LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx',
    sheet: 'JURNAL MARET 2026',
    format: 'std',
  },
  {
    month: '2026-04', label: 'April',
    file: 'LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx',
    sheet: 'JURNAL APRIL 2026',
    format: 'std',
  },
];

// ─── DB helpers ───────────────────────────────────────────────────────────────
function dbRun(db, sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function(e) { e ? rej(e) : res(this) }));
}
function dbAll(db, sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
}
function dbGet(db, sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
}

function xlDate(val, fallbackMonth) {
  if (typeof val === 'number' && val > 40000) {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  return fallbackMonth + '-01';
}

// ─── COA name → code lookup ───────────────────────────────────────────────────
function buildCOALookup(db) {
  return new Promise((res, rej) => {
    db.all('SELECT code, name FROM coa', (e, rows) => {
      if (e) return rej(e);
      const nameToCode = {};
      rows.forEach(r => {
        nameToCode[r.name.toLowerCase().trim()] = r.code;
      });
      res(nameToCode);
    });
  });
}

// Full name→code map for January (no codes in Excel rows)
const NAME_TO_CODE = {
  'bank kalsel': '11103', 'bank bni bisnis': '11106', 'bank bni': '11104',
  'bank bni tapcash': '11107', 'kas kecil': '11101',
  'kas pendapatan belum setor': '11102',
  'piutang usaha': '11201', 'penyisihan piutang usaha': '11202',
  'piutang lain-lain': '11203', 'perlengkapan': '11301',
  'persediaan barang dagang': '11401', 'persediaan barang dagang (gas lpg)': '11402',
  'investasi jangka pendek': '11105', 'bbm dibayar di muka': '11501',
  'tanah': '12101', 'bangunan': '12102.1',
  'akumulasi penyusutan bangunan': '12102.2',
  'kendaraan': '12201.1', 'akumulasi penyusutan kendaraan': '12201.2',
  'mesin': '12202.1', 'akumulasi penyusutan mesin': '12202.2',
  'instalasi listrik': '12203.1', 'akumulasi penyusutan instalasi listrik': '12203.2',
  'peralatan': '12204.1', 'akumulasi penyusutan peralatan': '12204.2',
  'aset dalam penyelesaian': '12300',
  'aset tidak berwujud': '13101.1', 'amortisasi aset tidak berwujud': '13101.2',
  'aset lain-lain': '13200',
  'dana talangan': '21100', 'utang usaha': '21200', 'utang pegawai': '21300',
  'utang pajak': '21400', 'biaya yang masih harus dibayar': '21500',
  'utang bank': '22100', 'utang pembiayaan': '22200', 'utang daerah': '22300',
  'modal perumda pasar baiman': '31000', 'modal disetor': '32000',
  'saldo laba (rugi) tahun lalu': '33000', 'laba (rugi) periode berjalan': '34000',
  'koreksi ekuitas': '35000',
  'pendapatan bisnis utama': '41000',
  'pendapatan pengelolaan pasar toko/kios, bak, dan los (bulanan)': '41001',
  'pendapatan pengelolaan pasar pkl (harian)': '41002',
  'pendapatan pemeliharaan kebersihan pasar (sampah)': '41003',
  'pendapatan denda pelayanan pasar': '41004',
  'pendapatan pengelolaan lain-lain': '41005',
  'pendapatan sampah/kebersihan antasari': '41006',
  'pendapatan keamanan pasar antasari': '41007',
  'pendapatan ramayana': '41008',
  'pendapatan operasional lainnya': '42000', 'pendapatan bisnis lainnya': '42000',
  'pendapatan pengembangan bisnis lainnya': '42000',
  'pendapatan parkir': '42001',
  'pendapatan sewa tempat event khusus/rakyat/ruang kreasi': '42002',
  'pendapatan sewa tempat wisata kuliner (fooodcourt)': '42003',
  'pendapatan layanan pengiriman barang': '42004',
  'pendapatan sewa tempat studio live selling': '42005',
  'pendapatan iklan/reklame/promosi': '42006',
  'pendapatan wisata kuliner pasar cemara': '42007',
  'pendapatan perdagangan bahan pokok dan penting': '42008',
  'pendapatan gerai inflasi': '42009',
  'penjualan air minum isi ulang': '42010',
  'penjualan gas lpg': '42011',
  'beban pokok penjualan': '51000',
  'beban pokok penjualan (bapok & gerai inflasi)': '51000',
  'beban pokok penjualan (gas lpg)': '51000',
  'beban umum dan administrasi': '61000',
  'beban gaji': '61010', 'beban gaji pokok direksi': '61011',
  'beban gaji pokok pegawai tetap': '61012', 'beban honor dewas': '61013',
  'beban tunjangan pegawai umum': '61020',
  'beban tunjangan jabatan': '61021', 'beban tunjangan fungsional': '61022',
  'beban tunjangan fungsional (kordinator)': '61022',
  'beban tunjangan transportasi': '61023', 'beban tunjangan makan': '61024',
  'beban tunjangan kesehatan (jkn)': '61025',
  'beban tunjangan ketenagakerjaan (jkk & jkm)': '61026',
  'beban tunjangan  hari raya keagamaan (thr)': '61027',
  'beban tunjangan hari raya keagamaan (thr)': '61027',
  'beban tunjangan representatif direktur': '61028',
  'beban tunjangan pajak penghasilan': '61029',
  'beban kelengkapan pegawai': '61030',
  'beban alat tulis kantor': '61040',
  'beban benda pos': '61042', 'beban stempel': '61043',
  'beban telepon/listrik/air/wifi/website': '61050',
  'beban telepon': '61051', 'beban air': '61052', 'beban listrik': '61053',
  'beban wifi/internet': '61054', 'beban website dan aplikasi (server)': '61055',
  'beban konsumsi rapat dan tamu': '61060',
  'beban makan minum rapat': '61061',
  'beban makan minum kunjungan tamu/ sosialisasi pedagang': '61062',
  'beban makan minum kunjungan tamu/sosialisasi pedagang': '61062',
  'beban makan minum aktivitas lapangan': '61063',
  'beban makan minum kegiatan kantor': '61064',
  'beban makan minum kegiatan kebersihan/ penyegelan/ insidentil lainnya': '61065',
  'beban perlengkapan dan pemeliharaan kantor': '61070',
  'beban pemeliharaan perlengkapan dan peralatan kantor': '61071',
  'beban pemeliharaan instalasi listrik dan air': '61072',
  'beban pemeliharaan bangunan gedung kantor': '61073',
  'beban bahan bakar minyak': '61080',
  'beban bbm direksi': '61081', 'beban bbm mobil keliling': '61082',
  'beban bbm truck': '61083', 'beban bbm pick up': '61084',
  'beban bbm genset dan mesin pencacah': '61085', 'beban bbm ketua dewas': '61086',
  'beban perjalanan dinas': '61090', 'karyawan': '61091',
  'beban perjalanan dinas dewan pengawas': '61092',
  'beban pendidikan, pelatihan, dan bimbingan teknik': '61100',
  'beban diklat/bimtek/direksi dan pegawai': '61101',
  'beban diklat/bimtek dewan pengawas': '61102',
  'beban diklat/bimtek/pelatihan pedagang': '61103',
  'beban sewa kendaraan': '61110', 'beban sewa mobil operasional': '61111',
  'beban jasa profesional/konsultan/tenaga ahli': '61120',
  'beban konsultan rencana bisnis': '61121',
  'beban seleksi pegawai': '61122',
  'beban audit laporan keuangan / pendampingan kap': '61123',
  'beban kajian penyesuaian tarif': '61124',
  'beban pendataan pedagang': '61125',
  'beban penyusutan aktiva tetap': '61130',
  'beban penyusutan bangunan': '61131', 'beban penyusutan kendaraan': '61132',
  'beban penyusutan mesin': '61133', 'beban penyusutan instalasi listrik': '61134',
  'beban penyusutan peralatan': '61135',
  'beban umum lain-lain': '61140',
  'beban kegiatan kelembagaan': '61141',
  'beban honorarium narasumber': '61142',
  'beban bingkisan lebaran untuk karyawan': '61143',
  'beban transportasi rapat': '61144',
  'beban jilid laporan': '61145', 'beban parkir karyawan': '61146',
  'beban pembuatan video profil perumda': '61147',
  'beban kegiatan 17 agustusan': '61148',
  'beban buka puasa bersama': '61149',
  'beban pembuatan souvenir perumda': '61150',
  'beban sayembara logo perusahaan': '61151',
  'beban kegiatan olahraga karyawan': '61152',
  'beban peringatan hari jadi kota banjarmasin (tanglong / jukung hias)': '61153',
  'beban peringatan hut perumda ke 1': '61154',
  'beban operasional dan bisnis': '62000',
  'beban pemeliharaan kendaraan operasional': '62010',
  'beban pajak mobil operasional': '62011', 'beban parkir mobil operasional': '62012',
  'beban pemeliharaan mobil truck': '62013', 'beban pemeliharaan mobil pick up': '62014',
  'beban pemeliharaan mobil keliling': '62015', 'beban pemeliharaan tossa': '62016',
  'beban pemeliharaan bangunan pasar': '62020',
  'beban pemeliharaan bangunan pasar (insidentil dan pengecatan)': '62021',
  'beban pemeliharaan kebersihan pasar': '62030',
  'alat dan bahan penyegelan': '62031', 'alat dan bahan kebersihan pasar': '62032',
  'beban pelayanan dan pemasaran': '62040',
  'beban cetak dokumen perjanjian sewa': '62041', 'beban cetak segel': '62042',
  'beban cetak karcis retribusi harian': '62043',
  'beban barang cetakan': '62050', 'beban cetak spanduk': '62051',
  'beban honor tenaga kontrak dan harian lepas': '62060',
  'beban gaji dan honor tenaga kontrak dan harian lepas': '62060',
  'beban honor tenaga outsorching/kontrak': '62061',
  'beban honor tenaga harian lepas': '62062',
  'beban tunjangan pegawai operasional': '62070',
  'beban tunjangan kesehatan (thl)': '62071',
  'beban tunjangan ketenagakerjaan (jkk & jkm) - thl': '62072',
  'beban tunjangan hari raya thl': '62073',
  'beban kelengkapan pegawai operasional': '62080',
  'beban atribut penagihan (rompi + topi)': '62081',
  'beban baju petugas kebersihan': '62082', 'beban atribut petugas kebersihan': '62083',
  'beban cetak id card + pin perumda': '62084',
  'beban atribut petugas parkir (baju + topi)': '62085',
  'beban petugas keamanan (29)': '62086',
  'beban insentif/ kesejahteraan pegawai': '62090', 'beban insentif/kesejahteraan pegawai': '62090',
  'beban lembur karyawan': '62091',
  'beban lembur tenaga kontrak (sopir, satpam, ob)': '62092',
  'beban lembur tenaga harian lepas': '62093',
  'beban insentif bagian penagihan': '62094',
  'pendapatan di luar operasional': '70000',
  'pendapatan bunga': '70001', 'pendapatan penjualan aset': '70002',
  'pendapatan selisih lebih': '70003', 'pendapatan lain-lain': '70004',
  'beban di luar operasional': '80000',
  'beban bunga bank': '80001', 'beban administrasi bank': '80002',
  'beban lain-lain': '80003', 'beban lain lain': '80003',
  'pajak penghasilan': '99999',
};

const KEYWORD_MAP = [
  ['bank kalsel', '11103'], ['bank bni bisnis', '11106'],
  ['bank bni tapcash', '11107'], ['bank bni', '11104'],
  ['kas kecil', '11101'], ['kas pendapatan', '11102'],
  ['piutang usaha', '11201'], ['piutang lain', '11203'],
  ['persediaan barang dagang (gas', '11402'], ['persediaan barang dagang', '11401'],
  ['bbm dibayar', '11501'], ['perlengkapan', '11301'],
  ['aset dalam', '12300'], ['instalasi listrik', '12203.1'],
  ['akumulasi penyusutan bangunan', '12102.2'],
  ['akumulasi penyusutan kendaraan', '12201.2'],
  ['akumulasi penyusutan mesin', '12202.2'],
  ['akumulasi penyusutan peralatan', '12204.2'],
  ['akumulasi penyusutan instalasi', '12203.2'],
  ['utang daerah', '22300'], ['utang pajak', '21400'],
  ['biaya yang masih', '21500'], ['utang usaha', '21200'],
  ['beban administrasi bank', '80002'],
  ['beban lain lain', '80003'], ['beban lain-lain', '80003'],
  ['beban di luar operasional', '80000'],
  ['beban pokok penjualan', '51000'],
];

function resolveCode(rawCode, name, coaNameToCode) {
  const codeStr = String(rawCode || '').trim();
  if (codeStr && /^\d{4,6}(\.\d+)?$/.test(codeStr)) return codeStr;
  const nk = (name || '').toLowerCase().trim();
  if (NAME_TO_CODE[nk]) return NAME_TO_CODE[nk];
  if (coaNameToCode[nk]) return coaNameToCode[nk];
  for (const [kw, code] of KEYWORD_MAP) {
    if (nk.includes(kw)) return code;
  }
  return codeStr || '';
}

// ─── Parse ALL rows from January sheet ────────────────────────────────────────
// Jan: [date, buktiNo, akunName, subAkun, D, K, ket]
function parseJanSheet(ws, coaNameToCode) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const hIdx = rows.findIndex(r => String(r[0] || '').toLowerCase().trim() === 'tgl');
  if (hIdx < 0) { console.log('   ❌ No header row found'); return []; }

  const lines = [];
  let curDate = null;
  let curBukti = '';

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const dateSN = r[0];
    const bukti = String(r[1] || '').trim();
    const akunName = String(r[2] || '').trim();
    const subAkun = String(r[3] || '').trim();
    const dRaw = r[4];
    const kRaw = r[5];
    const ket = String(r[6] || '').trim();

    if (typeof dateSN === 'number' && dateSN > 40000) curDate = dateSN;
    if (bukti && /^[A-Z]\.\d+/.test(bukti)) curBukti = bukti;

    if (!akunName) continue;

    // Determine D and K values — preserve distinction between blank and 0
    const dVal = (dRaw === '' || dRaw === null || dRaw === undefined) ? null : Number(dRaw);
    const kVal = (kRaw === '' || kRaw === null || kRaw === undefined) ? null : Number(kRaw);
    const code = resolveCode('', akunName, coaNameToCode);

    lines.push({
      date: curDate,
      bukti: curBukti,
      akunCode: code,
      akunName,
      subAkun,
      debit: dVal,      // null = blank in Excel, 0 = actual zero
      kredit: kVal,
      ket,
    });
  }
  return lines;
}

// ─── Parse ALL rows from Standard sheet (Feb, Mar, Apr) ───────────────────────
// Std: [akunCode, date, buktiNo, akunName, subAkun, D, K, ket]
function parseStdSheet(ws, coaNameToCode) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const hIdx = rows.findIndex(r => r.some(c => String(c || '').toLowerCase().trim() === 'tgl'));
  if (hIdx < 0) { console.log('   ❌ No header row found'); return []; }

  const lines = [];
  let curDate = null;
  let curBukti = '';

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const rawCode = String(r[0] || '').trim();
    const dateSN = r[1];
    const bukti = String(r[2] || '').trim();
    const akunName = String(r[3] || '').trim();
    const subAkun = String(r[4] || '').trim();
    const dRaw = r[5];
    const kRaw = r[6];
    const ket = String(r[7] || '').trim();

    if (typeof dateSN === 'number' && dateSN > 40000) curDate = dateSN;
    if (bukti && /^[A-Z]\.\d+/.test(bukti)) curBukti = bukti;

    if (!akunName) continue;

    const dVal = (dRaw === '' || dRaw === null || dRaw === undefined) ? null : Number(dRaw);
    const kVal = (kRaw === '' || kRaw === null || kRaw === undefined) ? null : Number(kRaw);
    const code = resolveCode(rawCode, akunName, coaNameToCode);

    lines.push({
      date: curDate,
      bukti: curBukti,
      akunCode: code,
      akunName,
      subAkun,
      debit: dVal,
      kredit: kVal,
      ket,
    });
  }
  return lines;
}

// ─── Group flat lines into transaction groups for parent journal entries ──────
// Transactions group: consecutive debits + credits
function groupIntoTransactions(lines) {
  const transactions = [];
  let currentTx = { lines: [], date: null, bukti: '' };

  const flush = () => {
    if (currentTx.lines.length === 0) return;
    transactions.push(currentTx);
    currentTx = { lines: [], date: null, bukti: '' };
  };

  for (const line of lines) {
    const d = line.debit !== null ? line.debit : 0;
    const k = line.kredit !== null ? line.kredit : 0;

    if (d > 0 || (d === 0 && k === 0 && line.debit !== null)) {
      // Debit line (or zero-debit line) — if we already have credits, start new tx
      if (currentTx.lines.some(l => (l.kredit !== null && l.kredit >= 0 && l.debit === null))) {
        flush();
      }
      if (!currentTx.date) currentTx.date = line.date;
      if (!currentTx.bukti) currentTx.bukti = line.bukti;
      currentTx.lines.push(line);
    } else if (k >= 0 && line.kredit !== null) {
      // Credit line
      if (!currentTx.date) currentTx.date = line.date;
      if (!currentTx.bukti) currentTx.bukti = line.bukti;
      currentTx.lines.push(line);
    } else {
      currentTx.lines.push(line);
    }
  }
  flush();
  return transactions;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  REIMPORT ALL JOURNALS (Exact Excel Row Storage)');
  console.log('═══════════════════════════════════════════════════\n');

  const db = new sqlite3.Database(DB_PATH);

  // Drop and recreate journal_lines to ensure clean schema
  await dbRun(db, `DROP TABLE IF EXISTS journal_lines`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS journal_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_id TEXT NOT NULL,
    line_order INTEGER NOT NULL DEFAULT 0,
    tanggal TEXT,
    bukti TEXT,
    akun_code TEXT,
    akun_name TEXT NOT NULL,
    sub_akun TEXT,
    debit REAL,
    kredit REAL,
    keterangan TEXT,
    FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE
  )`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_jlines_journal ON journal_lines(journal_id)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_jlines_tanggal ON journal_lines(tanggal)`);

  const coaNameToCode = await buildCOALookup(db);
  console.log(`COA lookup: ${Object.keys(coaNameToCode).length} entries\n`);

  let grandTotalTx = 0;
  let grandTotalLines = 0;

  for (const cfg of MONTHS) {
    console.log(`── ${cfg.label} (${cfg.month}) ──────────────────────`);

    // Clear existing data for this month
    const existingIds = await dbAll(db, `SELECT id FROM journals WHERE id LIKE 'XL-${cfg.month}-%'`);
    if (existingIds.length > 0) {
      for (const row of existingIds) {
        await dbRun(db, `DELETE FROM journal_lines WHERE journal_id = ?`, [row.id]);
      }
      const del = await dbRun(db, `DELETE FROM journals WHERE id LIKE 'XL-${cfg.month}-%'`);
      console.log(`   Cleared ${del.changes} existing entries`);
    }

    // Read Excel
    let wb, ws;
    try {
      wb = XLSX.readFile(path.join(DIR, cfg.file));
      ws = wb.Sheets[cfg.sheet];
      if (!ws) { console.log(`   ❌ Sheet "${cfg.sheet}" not found!`); continue; }
    } catch (err) {
      console.log(`   ❌ Error reading file: ${err.message}`);
      continue;
    }

    // Parse ALL rows (including zero-value)
    let rawLines;
    if (cfg.format === 'jan') {
      rawLines = parseJanSheet(ws, coaNameToCode);
    } else {
      rawLines = parseStdSheet(ws, coaNameToCode);
    }
    console.log(`   Total Excel rows parsed: ${rawLines.length}`);

    // Group into transactions for parent journal entries
    const transactions = groupIntoTransactions(rawLines, cfg.month);
    console.log(`   Transaction groups: ${transactions.length}`);

    // Insert
    let inserted = 0;
    let linesInserted = 0;

    for (let txIdx = 0; txIdx < transactions.length; txIdx++) {
      const tx = transactions[txIdx];
      const tanggal = xlDate(tx.date, cfg.month);
      const bukti = tx.bukti || '';
      const txId = `XL-${cfg.month}-${bukti || 'X'}-${txIdx}`;

      const sumD = tx.lines.reduce((s, l) => s + (l.debit !== null ? l.debit : 0), 0);
      const sumK = tx.lines.reduce((s, l) => s + (l.kredit !== null ? l.kredit : 0), 0);

      const ket = tx.lines[0]?.ket || '';
      const firstDebit = tx.lines.find(l => l.debit !== null && l.debit >= 0) || {};
      const firstCredit = tx.lines.find(l => l.kredit !== null && l.kredit >= 0) || {};

      const akunDebitStr = firstDebit.akunCode
        ? `${firstDebit.akunCode} ${firstDebit.akunName}${firstDebit.subAkun ? ' > ' + firstDebit.subAkun : ''}`
        : firstDebit.akunName || '';
      const akunKreditStr = firstCredit.akunCode
        ? `${firstCredit.akunCode} ${firstCredit.akunName}${firstCredit.subAkun ? ' > ' + firstCredit.subAkun : ''}`
        : firstCredit.akunName || '';

      try {
        await dbRun(db,
          `INSERT OR REPLACE INTO journals (id, tanggal, keterangan, debit, kredit, status, akun_debit, akun_kredit, bukti, updated_at)
           VALUES (?, ?, ?, ?, ?, 'posted', ?, ?, ?, datetime('now'))`,
          [txId, tanggal, ket, sumD, sumK, akunDebitStr, akunKreditStr, bukti]
        );
        inserted++;

        // Insert each Excel row as a journal_line
        for (let lineIdx = 0; lineIdx < tx.lines.length; lineIdx++) {
          const ln = tx.lines[lineIdx];
          const lineTanggal = xlDate(ln.date, cfg.month);

          await dbRun(db,
            `INSERT INTO journal_lines (journal_id, line_order, tanggal, bukti, akun_code, akun_name, sub_akun, debit, kredit, keterangan)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [txId, lineIdx, lineTanggal, ln.bukti || bukti, ln.akunCode, ln.akunName,
             ln.subAkun || null, ln.debit, ln.kredit, ln.ket || null]
          );
          linesInserted++;
        }
      } catch (err) {
        console.log(`   Insert error: ${err.message} (${txId})`);
      }
    }

    console.log(`   ✓ Inserted ${inserted} transactions, ${linesInserted} lines`);
    grandTotalTx += inserted;
    grandTotalLines += linesInserted;

    // Validate
    const stats = await dbGet(db,
      `SELECT COUNT(*) as cnt, COALESCE(SUM(debit),0) as sumD, COALESCE(SUM(kredit),0) as sumK 
       FROM journals WHERE id LIKE 'XL-${cfg.month}-%'`
    );
    const lineStats = await dbGet(db,
      `SELECT COUNT(*) as cnt FROM journal_lines WHERE journal_id LIKE 'XL-${cfg.month}-%'`
    );
    console.log(`   📊 DB: ${stats.cnt} txns, ${lineStats.cnt} lines, D=${Math.round(stats.sumD).toLocaleString()}, K=${Math.round(stats.sumK).toLocaleString()}`);
    console.log('');
  }

  // Grand summary
  const totalAll = await dbGet(db, "SELECT COUNT(*) as cnt FROM journals WHERE id LIKE 'XL-%'");
  const totalLines = await dbGet(db, "SELECT COUNT(*) as cnt FROM journal_lines WHERE journal_id LIKE 'XL-%'");

  console.log('═══════════════════════════════════════════════════');
  console.log(`  GRAND TOTAL`);
  console.log(`  Transactions: ${grandTotalTx}`);
  console.log(`  Lines (Excel rows): ${grandTotalLines}`);
  console.log(`  DB Journals:  ${totalAll.cnt}`);
  console.log(`  DB Lines:     ${totalLines.cnt}`);
  console.log('═══════════════════════════════════════════════════');

  db.close();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
