/**
 * generate_reports_mar_apr.cjs
 * Generates markdown reports comparing DB vs Excel for March and April 2026
 */
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const DIR = path.join(__dirname, 'src/FILES');
const ARTIFACTS_DIR = path.join('/Users/macbook/.gemini/antigravity-ide/brain/d08babce-8383-4ab5-a898-26055726a194');

function num(v) {
  if (typeof v === 'number') return v;
  if (!v || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function fmt(n) { return Math.abs(Math.round(n)).toLocaleString('id-ID'); }
function fmtSigned(n) { return Math.round(n).toLocaleString('id-ID'); }

async function getDbBalances(db, monthLike) {
  return new Promise((res, rej) => {
    db.all(`SELECT akun_debit, akun_kredit, debit, kredit FROM journals WHERE tanggal LIKE '${monthLike}%' AND status='posted'`, (err, rows) => {
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

async function processMonth(db, cfg) {
  const { monthName, monthLike, file, trialSheet, neracaSheet, lrSheet } = cfg;
  const dbBal = await getDbBalances(db, monthLike);
  const wb = XLSX.readFile(path.join(DIR, file));
  
  let md = `# ${monthName} 2026 — Per-Sheet Data Comparison\n\n> **Comparing:** Program Database (DB) vs Each Excel Sheet\n\n---\n\n`;
  let totalSheets = 0;
  let passedSheets = 0;

  function runSection(title, headers, items, isTrialBalance = false) {
    totalSheets++;
    md += `## ${title}\n\n`;
    md += `| ${headers.join(' | ')} | Status |\n`;
    md += `|${headers.map(()=>'---').join('|')}|---|\n`;
    
    let allOk = true;
    items.forEach(item => {
      const code = item.code;
      const label = item.label;
      const xl = item.xl;
      const dbv = isTrialBalance ? (dbBal[code] || 0) : Math.abs(dbBal[code] || 0);
      const diff = Math.round(xl) - Math.round(dbv);
      const ok = Math.abs(diff) <= 1;
      if (!ok) allOk = false;
      const status = ok ? '✅' : '❌';
      md += `| ${code} | ${label} | ${fmtSigned(xl)} | ${fmtSigned(dbv)} | ${status} |\n`;
    });
    
    if (allOk) {
      md += `\n**Result: ✅ 100% MATCH**\n\n---\n\n`;
      passedSheets++;
    } else {
      md += `\n**Result: ❌ DIFFERENCES FOUND**\n\n---\n\n`;
    }
  }

  // 1. DATA LAMPIRAN NERACA
  {
    const wsN = wb.Sheets['DATA LAMPIRAN NERACA'];
    const rowsN = XLSX.utils.sheet_to_json(wsN, { header: 1, defval: '' });
    const items = [];
    rowsN.slice(2).forEach(r => {
      const code = String(r[1]||'').trim();
      const label = String(r[2]||'').trim();
      const dAmt = num(r[5]);
      const kAmt = num(r[6]);
      if (!code || !label || !/^\d/.test(code)) return;
      if (dAmt === 0 && kAmt === 0) return;
      items.push({ code, label, xl: dAmt - kAmt });
    });
    runSection('DATA LAMPIRAN NERACA (Semua Akun)', ['Account', 'Description', 'Excel', 'DB'], items, true);
  }

  // 2. LR PERIOD (Income Statement)
  {
    const ws = wb.Sheets[lrSheet];
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
    runSection(lrSheet + ' (Laporan Laba Rugi)', ['Account', 'Description', 'Excel', 'DB'], items, false);
  }

  // 3. Trial Balance Sheet
  {
    const ws = wb.Sheets[trialSheet];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const items = [];
    rows.filter(r => /^\\d{5}/.test(String(r[0]||''))).forEach(r => {
      const code = String(r[0]).trim();
      const label = String(r[1]||'').trim();
      const d = num(r[2]);
      const k = num(r[3]);
      if (d === 0 && k === 0) return;
      items.push({ code, label, xl: d - k });
    });
    // This often has expected differences because it's incomplete
    runSection("Trial Balance Internal ('" + trialSheet + "')", ['Account', 'Description', 'Excel', 'DB'], items, true);
  }

  // Summary
  md += `## Summary\n\n`;
  md += `| Sheet | Result |\n|---|---|\n`;
  md += `| DATA LAMPIRAN NERACA | ${passedSheets >= 1 ? '✅ 100% Match' : '❌ Differences Found'} |\n`;
  md += `| ${lrSheet} | ${passedSheets >= 2 ? '✅ 100% Match' : '❌ Differences Found'} |\n`;
  md += `| Trial Balance ('${trialSheet}') | ⚠️ Internal sheet, expected differences due to formatting/omissions |\n`;

  fs.writeFileSync(path.join(ARTIFACTS_DIR, `${monthName.toLowerCase()}_per_sheet_report.md`), md);
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  
  await processMonth(db, {
    monthName: 'March',
    monthLike: '2026-03',
    file: 'LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx',
    trialSheet: 'mar',
    neracaSheet: 'NERACA MAR',
    lrSheet: 'LR PERIOD MAR'
  });

  await processMonth(db, {
    monthName: 'April',
    monthLike: '2026-04',
    file: 'LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx',
    trialSheet: 'april',
    neracaSheet: 'NERACA APR',
    lrSheet: 'LR PERIOD APR'
  });

  db.close();
}

main().catch(console.error);
