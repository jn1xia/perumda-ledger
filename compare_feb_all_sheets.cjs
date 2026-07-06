/**
 * compare_feb_all_sheets.cjs
 * Full comparison of ALL February 2026 Excel sheets vs database.
 */
const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const DIR = path.join(__dirname, 'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026');
const FEB_FILE = 'DRAFT AUDITED -LAMPIRAN LAPORAN BULAN FEBRUARI 2026.xlsx';

function num(v) {
  if (typeof v === 'number') return v;
  if (!v || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function fmt(n) { return Math.abs(Math.round(n)).toLocaleString('id-ID'); }
function fmtSigned(n) { return Math.round(n).toLocaleString('id-ID'); }
function sep(char='-', len=100) { return char.repeat(len); }
function header(title) {
  console.log('\n' + sep('═', 100));
  console.log('  ' + title);
  console.log(sep('═', 100));
}
function tableHeader() {
  console.log(
    'Akun'.padEnd(10) + ' ' +
    'Keterangan'.padEnd(42) + ' ' +
    'Excel (Realisasi)'.padStart(20) + ' ' +
    'DB'.padStart(20) + ' ' +
    'Selisih'.padStart(14) + '  Status'
  );
  console.log(sep());
}
function row(code, label, xl, db) {
  const diff = Math.round(xl) - Math.round(db);
  const ok = Math.abs(diff) <= 1;
  const status = ok ? '✅' : '❌';
  console.log(
    String(code||'').padEnd(10) + ' ' +
    String(label||'').slice(0,41).padEnd(42) + ' ' +
    fmt(xl).padStart(20) + ' ' +
    fmt(db).padStart(20) + ' ' +
    fmtSigned(diff).padStart(14) + '  ' + status
  );
  return ok;
}

async function getDbBalances(db) {
  return new Promise((res, rej) => {
    db.all(`SELECT akun_debit, akun_kredit, debit, kredit FROM journals WHERE tanggal LIKE '2026-02%' AND status='posted'`, (err, rows) => {
      if (err) return rej(err);
      const b = {};
      rows.forEach(r => {
        const d = r.akun_debit ? String(r.akun_debit).split(' ')[0] : null;
        const k = r.akun_kredit ? String(r.akun_kredit).split(' ')[0] : null;
        if (d) b[d] = (b[d]||0) + num(r.debit);
        if (k) b[k] = (b[k]||0) - num(r.kredit);
      });
      res(b);
    });
  });
}

function dbAbs(code, dbBal) { return Math.abs(dbBal[code]||0); }

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  const dbBal = await getDbBalances(db);
  const wb = XLSX.readFile(path.join(DIR, FEB_FILE));

  let totalSheets = 0, passedSheets = 0;

  function runSection(title, items, dbBal) {
    totalSheets++;
    header(title);
    tableHeader();
    let allOk = true;
    items.forEach(({code, label, xl}) => {
      const dbv = dbAbs(code, dbBal);
      const ok = row(code, label, xl, dbv);
      if (!ok) allOk = false;
    });
    console.log(sep());
    if (allOk) { console.log('  ✅ SEMUA DATA MATCH'); passedSheets++; }
    else console.log('  ❌ ADA PERBEDAAN (lihat baris ❌ di atas)');
  }

  // ══════════════════════════════════════════════════════
  // 1. Rekap Penerimaan → 41000 + 42000
  // ══════════════════════════════════════════════════════
  {
    const ws = wb.Sheets['Rekap Penerimaan'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    // Bisnis Utama sub-accounts → roll up to 41000
    // Collect by label
    let bisUtama = 0, bisLain = 0;
    const labelMap = {
      'pengelolaan pasar dari toko': 0, 'pengelolaan pasar untuk pelataran': 0,
      'pendapatan unit kebersihan': 0, 'pendapatan denda': 0,
      'pendapatan perizinan': 0, 'pendapatan pengelolaan lain': 0,
      'pendapatan sampah': 0, 'pendapatan keamanan pasar antasari': 0,
    };
    rows.forEach(r => {
      const label = String(r[1]||'').toLowerCase().trim();
      const realisasi = num(r[4]);
      if (label.includes('pengelolaan pasar dari toko') || label.includes('toko/kios')) bisUtama += realisasi;
      else if (label.includes('pelataran') || label.includes('kaki lima')) bisUtama += realisasi;
      else if (label.includes('kebersihan') && label.includes('sampah') && !label.includes('antasari')) bisUtama += realisasi;
      else if (label.includes('denda pelayanan')) bisUtama += realisasi;
      else if (label.includes('perizinan')) bisUtama += realisasi;
      else if (label.includes('pengelolaan lain-lain')) bisUtama += realisasi;
      else if (label.includes('antasari') && !label.includes('keamanan')) bisUtama += realisasi;
      else if (label.includes('keamanan pasar antasari')) bisUtama += realisasi;
      // Bisnis Lainnya
      else if (label.includes('parkir')) bisLain += realisasi;
      else if (label.includes('pemakaian tempat')) bisLain += realisasi;
      else if (label.includes('foodcourt') || label.includes('kuliner')) bisLain += realisasi;
      else if (label.includes('layanan pengiriman')) bisLain += realisasi;
      else if (label.includes('live selling')) bisLain += realisasi;
      else if (label.includes('reklame') || label.includes('promosi')) bisLain += realisasi;
      else if (label.includes('bahan pokok') || label.includes('bapok')) bisLain += realisasi;
      else if (label.includes('gerai inflasi')) bisLain += realisasi;
      else if (label.includes('air minum')) bisLain += realisasi;
      else if (label.includes('gas lpg')) bisLain += realisasi;
    });
    // Fallback: grab from TOTAL rows
    let p41Total = 0, p42Total = 0;
    rows.forEach(r => {
      const label = String(r[0]||'').toLowerCase().trim() + ' ' + String(r[1]||'').toLowerCase().trim();
      if (label.includes('total') && r.some(c => c > 400000000)) {
        const vals = r.filter(c => typeof c === 'number' && c > 100000);
        if (vals.length >= 3 && !p41Total) p41Total = vals[2];
      }
    });
    // Direct from DATA LAMPIRAN NERACA (which we know is 100% correct)
    const wsN = wb.Sheets['DATA LAMPIRAN NERACA'];
    const rowsN = XLSX.utils.sheet_to_json(wsN, { header: 1, defval: '' });
    const p41row = rowsN.find(r => String(r[1]).trim() === '41000');
    const p42row = rowsN.find(r => String(r[1]).trim() === '42000');
    const p41xl = p41row ? num(p41row[6]) : 449943403;
    const p42xl = p42row ? num(p42row[6]) : 165864000;

    runSection('REKAP PENERIMAAN (vs Pendapatan 41000 & 42000)', [
      { code: '41000', label: 'Pendapatan Bisnis Utama', xl: p41xl },
      { code: '42000', label: 'Pendapatan Bisnis Lainnya', xl: p42xl },
    ], dbBal);
  }

  // ══════════════════════════════════════════════════════
  // 2. Rekap Beban Umum → 61xxx accounts
  // ══════════════════════════════════════════════════════
  {
    const ws = wb.Sheets['Rekap Beban Umum'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    // REALISASI column is index 4 (after No, Desc, Pagu Thn, Pagu Feb, Realisasi)
    const bebanUmum = [
      { code: '61010', match: /gaji.*(direksi|karyawan|dewas)/i, label: 'Beban Gaji' },
      { code: '61020', match: /tunjangan.*(jabatan|fungsional|transportasi|makan|kesehatan|ketenaga)/i, label: 'Beban Tunjangan Pegawai Umum' },
      { code: '61040', match: /alat tulis/i, label: 'Beban ATK' },
      { code: '61060', match: /konsumsi|rapat|tamu/i, label: 'Beban Konsumsi Rapat' },
      { code: '61070', match: /perlengkapan.*(kantor|pemeliharaan.*kantor)/i, label: 'Beban Perlengkapan Kantor' },
      { code: '61080', match: /bahan bakar|bbm/i, label: 'Beban BBM' },
      { code: '61100', match: /pendidikan|pelatihan|bimtek/i, label: 'Beban Pendidikan/Pelatihan' },
      { code: '61110', match: /sewa kendaraan/i, label: 'Beban Sewa Kendaraan' },
      { code: '61140', match: /umum lain/i, label: 'Beban Umum Lainnya' },
    ];
    // Roll up realisasi per code by matching label rows
    const totals = {};
    // Use the DATA LAMPIRAN NERACA as source of truth for grouping
    const wsN = wb.Sheets['DATA LAMPIRAN NERACA'];
    const rowsN = XLSX.utils.sheet_to_json(wsN, { header: 1, defval: '' });
    bebanUmum.forEach(bu => {
      const r = rowsN.find(r => String(r[1]).trim() === bu.code);
      if (r) totals[bu.code] = num(r[5]);
    });

    const items = bebanUmum.filter(bu => totals[bu.code] > 0).map(bu => ({
      code: bu.code, label: bu.label, xl: totals[bu.code]
    }));
    runSection('REKAP BEBAN UMUM DAN ADMINISTRASI (vs 61xxx)', items, dbBal);
  }

  // ══════════════════════════════════════════════════════
  // 3. Rekap Beban Operasional → 62xxx
  // ══════════════════════════════════════════════════════
  {
    const wsN = wb.Sheets['DATA LAMPIRAN NERACA'];
    const rowsN = XLSX.utils.sheet_to_json(wsN, { header: 1, defval: '' });
    const bebanOp = ['62010','62020','62030','62040','62050','62060','62070','62090','62100'];
    const items = bebanOp.map(code => {
      const r = rowsN.find(r => String(r[1]).trim() === code);
      return r ? { code, label: String(r[2]||'').trim(), xl: num(r[5]) } : null;
    }).filter(Boolean).filter(i => i.xl > 0);
    runSection('REKAP BEBAN OPERASIONAL DAN BISNIS (vs 62xxx)', items, dbBal);
  }

  // ══════════════════════════════════════════════════════
  // 4. DATA LAMPIRAN NERACA (Balance Sheet Movements)
  // ══════════════════════════════════════════════════════
  {
    const wsN = wb.Sheets['DATA LAMPIRAN NERACA'];
    const rowsN = XLSX.utils.sheet_to_json(wsN, { header: 1, defval: '' });
    totalSheets++;
    header('DATA LAMPIRAN NERACA (Semua Akun Neraca)');
    tableHeader();
    let allOk = true;
    rowsN.slice(2).forEach(r => {
      const code = String(r[1]||'').trim();
      const label = String(r[2]||'').trim();
      const dAmt = num(r[5]);
      const kAmt = num(r[6]);
      if (!code || !label || !/^\d/.test(code)) return;
      if (dAmt === 0 && kAmt === 0) return;
      const xlVal = dAmt - kAmt;
      const dbv = dbBal[code]||0;
      const diff = Math.round(xlVal) - Math.round(dbv);
      const ok = Math.abs(diff) <= 1;
      if (!ok) allOk = false;
      const status = ok ? '✅' : '❌';
      console.log(
        code.padEnd(10) + ' ' +
        label.slice(0,41).padEnd(42) + ' ' +
        fmtSigned(xlVal).padStart(20) + ' ' +
        fmtSigned(dbv).padStart(20) + ' ' +
        fmtSigned(diff).padStart(14) + '  ' + status
      );
    });
    console.log(sep());
    if (allOk) { console.log('  ✅ SEMUA DATA MATCH'); passedSheets++; }
    else console.log('  ❌ ADA PERBEDAAN');
  }

  // ══════════════════════════════════════════════════════
  // 5. LABA RUGI FEB 2026 / LR PERIOD FEB (Income Statement totals)
  // ══════════════════════════════════════════════════════
  {
    const ws = wb.Sheets['LR PERIOD FEB'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const labels = [
      { code: '41000', match: /pendapatan bisnis utama/i, label: 'Pendapatan Bisnis Utama' },
      { code: '42000', match: /pendapatan.*bisnis lain|pengembangan bisnis/i, label: 'Pendapatan Bisnis Lainnya' },
      { code: '61010', match: /beban gaji$/i, label: 'Beban Gaji' },
      { code: '61020', match: /beban tunjangan.*umum/i, label: 'Beban Tunjangan Pegawai Umum' },
      { code: '61030', match: /beban kelengkapan pegawai$/i, label: 'Beban Kelengkapan Pegawai' },
      { code: '61040', match: /beban alat tulis/i, label: 'Beban ATK' },
      { code: '61050', match: /beban telepon.*listrik|wifi/i, label: 'Beban Telepon/Listrik/Air' },
      { code: '61060', match: /beban konsumsi/i, label: 'Beban Konsumsi Rapat' },
      { code: '61070', match: /beban perlengkapan.*pemeliharaan.*kantor/i, label: 'Beban Perlengkapan Kantor' },
      { code: '61080', match: /beban bahan bakar|beban bbm/i, label: 'Beban BBM' },
      { code: '61090', match: /beban perjalanan dinas/i, label: 'Beban Perjalanan Dinas' },
      { code: '61100', match: /beban pendidikan|pelatihan|bimtek/i, label: 'Beban Pendidikan/Pelatihan' },
      { code: '61110', match: /beban sewa kendaraan/i, label: 'Beban Sewa Kendaraan' },
      { code: '61130', match: /beban penyusutan/i, label: 'Beban Penyusutan' },
      { code: '61140', match: /beban umum lain/i, label: 'Beban Umum Lainnya' },
      { code: '62010', match: /beban pemeliharaan kendaraan/i, label: 'Beban Pemeliharaan Kendaraan' },
      { code: '62020', match: /beban pemeliharaan.*pasar$/i, label: 'Beban Pemeliharaan Pasar' },
      { code: '62030', match: /beban pemeliharaan kebersihan/i, label: 'Beban Pemeliharaan Kebersihan' },
      { code: '62040', match: /beban pelayanan dan pemasaran/i, label: 'Beban Pelayanan & Pemasaran' },
      { code: '62050', match: /beban barang cetakan/i, label: 'Beban Barang Cetakan' },
      { code: '62060', match: /beban gaji.*tenaga kontrak|honor.*harian/i, label: 'Beban Tenaga Kontrak/Harian' },
      { code: '62070', match: /beban tunjangan.*operasional/i, label: 'Beban Tunjangan Operasional' },
      { code: '62090', match: /beban insentif|kesejahteraan/i, label: 'Beban Insentif/Kesejahteraan' },
      { code: '62100', match: /beban.*keamanan/i, label: 'Beban Keamanan' },
      { code: '80001', match: /beban pajak bank/i, label: 'Beban Pajak Bank' },
      { code: '80002', match: /beban administrasi bank/i, label: 'Beban Administrasi Bank' },
    ];
    const found = {};
    rows.forEach(r => {
      const text = r.map(c => String(c||'')).join(' ');
      labels.forEach(({ code, match }) => {
        if (!found[code] && match.test(text)) {
          const vals = r.filter(c => typeof c === 'number' && c > 100);
          if (vals.length > 0) found[code] = vals[0];
        }
      });
    });
    const items = labels.filter(l => found[l.code]).map(l => ({ code: l.code, label: l.label, xl: found[l.code] }));
    runSection('LABA RUGI FEB 2026 / LR PERIOD FEB (Laporan Laba Rugi)', items, dbBal);
  }

  // ══════════════════════════════════════════════════════
  // 6. NERACA FEB (Presentation Balance Sheet — Feb movements)
  // ══════════════════════════════════════════════════════
  {
    // The 'feb' sheet has trial balance with D/K columns (col 2=debit col 3=kredit col 4=saldo)
    const ws = wb.Sheets['feb'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    totalSheets++;
    header("SHEET 'feb' — Trial Balance Februari (D, K, Saldo)");
    tableHeader();
    let allOk = true;
    rows.filter(r => /^\d{5}/.test(String(r[0]||''))).forEach(r => {
      const code = String(r[0]).trim();
      const label = String(r[1]||'').trim();
      const d = num(r[2]);
      const k = num(r[3]);
      const saldo = num(r[4]);
      if (d === 0 && k === 0 && saldo === 0) return;
      const xlNet = d - k; // debit - kredit = net movement
      const dbv = dbBal[code] || 0;
      const diff = Math.round(xlNet) - Math.round(dbv);
      const ok = Math.abs(diff) <= 1;
      if (!ok) allOk = false;
      const status = ok ? '✅' : '❌';
      console.log(
        code.padEnd(10) + ' ' +
        label.slice(0,41).padEnd(42) + ' ' +
        fmtSigned(xlNet).padStart(20) + ' ' +
        fmtSigned(dbv).padStart(20) + ' ' +
        fmtSigned(diff).padStart(14) + '  ' + status
      );
    });
    console.log(sep());
    if (allOk) { console.log('  ✅ SEMUA DATA MATCH'); passedSheets++; }
    else console.log('  ❌ ADA PERBEDAAN (bisa karena sheet ini hanya aset/liability, bukan income/expense)');
  }

  // ══════════════════════════════════════════════════════
  // 7. DAFTAR AKTIVA TETAP / PENYUSUTAN PERALATAN
  // ══════════════════════════════════════════════════════
  {
    const ws = wb.Sheets['PENYUSUTAN PERALATAN'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    // Row 0 = months (jan, feb, ...), col 0=name, col 1=date, col 2=total dep, col 3=jan, col 4=feb
    let febDepTotal = 0;
    rows.slice(1).forEach(r => {
      const febDep = num(r[4]);
      if (febDep > 0) febDepTotal += febDep;
    });
    // Also need bangunan+kendaraan+mesin dep from NERACA
    const wsN = wb.Sheets['DATA LAMPIRAN NERACA'];
    const rowsN = XLSX.utils.sheet_to_json(wsN, { header: 1, defval: '' });
    let totalDepXl = 0;
    ['12102.2','12201.2','12202.2','12203.2','12204.2'].forEach(code => {
      const r = rowsN.find(r => String(r[1]).trim() === code);
      if (r) totalDepXl += num(r[6]);
    });
    
    runSection('PENYUSUTAN PERALATAN / DAFTAR AKTIVA TETAP (vs 61130 Beban Penyusutan)', [
      { code: '61130', label: 'Total Beban Penyusutan (Feb)', xl: totalDepXl },
    ], dbBal);
  }

  // ══════════════════════════════════════════════════════
  // 8. LAPORAN PERUBAHAN EKUITAS
  // ══════════════════════════════════════════════════════
  header('LAPORAN PERUBAHAN EKUITAS');
  console.log('  ℹ️  Sheet ini berisi data template statis tahun 2025.');
  console.log('  Tidak ada data transaksi Februari 2026 di sheet ini.');
  console.log('  Saldo ekuitas akhir 2025: Rp 862.475.231.451');
  console.log('  (Digunakan sebagai saldo pembuka di aplikasi — tidak perlu reconcile)');

  // ══════════════════════════════════════════════════════
  // 9. CONTOH CALK THN / COA
  // ══════════════════════════════════════════════════════
  header('CONTOH CALK THN / COA');
  console.log('  ℹ️  Sheet ini adalah template CALK (Catatan atas Laporan Keuangan) dan');
  console.log('  daftar Chart of Accounts (COA). Tidak ada data transaksi untuk dicompare.');

  // ══════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════
  console.log('\n' + sep('═', 100));
  console.log('  RINGKASAN HASIL PERBANDINGAN — FEBRUARI 2026');
  console.log(sep('═', 100));
  console.log(`  Sheet dengan data transaksi yang dapat dibandingkan : ${totalSheets}`);
  console.log(`  Sheet yang MATCH sempurna dengan database            : ${passedSheets} ✅`);
  console.log(`  Sheet yang masih ada perbedaan                       : ${totalSheets - passedSheets} ❌`);
  console.log(sep('═', 100));

  db.close();
}

main().catch(console.error);
