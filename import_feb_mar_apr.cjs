/**
 * import_feb_mar_apr.cjs  (v2 — fixed sequential pairing)
 * 
 * Imports February, March, and April 2026 journals.
 * Key fix: Within a batch journal (B.03), split into individual transactions
 *          by watching for Debit→Kredit→Debit transitions.
 */
const XLSX = require('xlsx');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const DIR     = path.join(__dirname, 'src/FILES');

const MONTHS = [
  {
    month: '2026-02', label: 'February',
    file: 'LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx',
    jSheet: 'JURNAL FEB 2026',
    expected: { p41: 462831403, p42: 152976000, bpp: 26039000, b61: 730877129, b62: 324519938 }
  },
  {
    month: '2026-03', label: 'March',
    file: 'LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx',
    jSheet: 'JURNAL MARET 2026',
    expected: { bpp: 47457900, b61: 846859406, b62: 510477567 }
  },
  {
    month: '2026-04', label: 'April',
    file: 'LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx',
    jSheet: 'JURNAL APRIL 2026',
    expected: { bpp: 170972200, b61: 738619007, b62: 355240641 }
  },
];

// ─── DB helpers ───────────────────────────────────────────────────────────────
function dbRun(db, sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function(e) { e ? rej(e) : res(this) }));
}
function dbGet(db, sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
}
function num(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function xlDate(val, fallback) {
  if (typeof val === 'number' && val > 40000) {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  return fallback + '-15';
}

// ─── Account code resolution ──────────────────────────────────────────────────
const VALID_CODE_RE = /^\d{4,6}(\.\d+)?$/;
const VALID_PREFIX_RE = /^(11|12|13|21|22|31|32|33|34|41|42|43|51|61|62|70|71|80|81)\d/;

function isValidAcctCode(raw) {
  return VALID_CODE_RE.test(raw) && VALID_PREFIX_RE.test(raw);
}

// Name → expected account prefix category
function nameCategory(name) {
  const n = name.toLowerCase();
  if (n.includes('pendapatan')) return '4';
  if (n.includes('bank ') || n.includes('kas ') || n.startsWith('kas')) return '11';
  if (n.includes('bbm dibayar') || n.includes('bbm di muka')) return '115';
  if (n.includes('piutang usaha')) return '112';
  if (n.includes('persediaan')) return '114';
  if (n.includes('akumulasi penyusutan')) return '12';
  if (n.includes('utang') || n.includes('biaya yang masih')) return '2';
  if (n.includes('beban pokok')) return '51';
  if (n.includes('beban penyusutan')) return '6113';
  if (n.includes('beban') || n.includes('biaya')) return '6';
  return null;
}

// Force name lookup if code category doesn't match name category
function needsNameLookup(code, name) {
  if (!isValidAcctCode(code)) return true; // not a valid code at all
  const cat = nameCategory(name);
  if (!cat) return false; // can't determine from name, keep code
  return !code.startsWith(cat); // code prefix doesn't match what name implies
}

const NAME_TO_CODE = {
  'bank kalsel': '11103', 'bank bni bisnis': '11106',
  'bank bni tapcash': '11107', 'bank bni': '11104', 'kas kecil': '11101',
  'bbm dibayar di muka': '11501', 'piutang usaha': '11201',
  'persediaan barang dagang': '11401', 'persediaan barang dagang (gas lpg)': '11402',
  'utang daerah': '21000', 'biaya yang masih harus dibayar': '21500',
  'pendapatan bisnis utama': '41000', 'pendapatan bisnis lainnya': '42000',
  'pendapatan pengembangan bisnis lainnya': '42000',
  'pendapatan di luar operasional': '70000',
  'beban di luar operasional': '80000',
  'beban pokok penjualan (bapok & gerai inflasi)': '51010',
  'beban pokok penjualan (gas lpg)': '51020',
  'beban pokok penjualan': '51010',
  'akumulasi penyusutan bangunan': '12102.2', 'akumulasi penyusutan kendaraan': '12201.2',
  'akumulasi penyusutan mesin': '12202.2', 'akumulasi penyusutan instalasi listrik': '12203.2',
  'akumulasi penyusutan peralatan': '12204.2', 'beban penyusutan aktiva tetap': '61130',
};

const KEYWORD_MAP = [
  ['bank kalsel', '11103'], ['bank bni bisnis', '11106'],
  ['bank bni tapcash', '11107'], ['bank bni', '11104'],
  ['kas kecil', '11101'], ['bbm dibayar', '11501'],
  ['piutang usaha', '11201'], ['utang daerah', '21000'],
  ['persediaan barang dagang (gas', '11402'], ['persediaan barang dagang', '11401'],
  ['pendapatan pengelolaan', '41000'], ['pendapatan sewa', '41000'],
  ['pendapatan pemeliharaan', '41000'], ['pendapatan denda', '41000'],
  ['pendapatan sampah', '41000'], ['pendapatan keamanan', '41000'],
  ['pendapatan bisnis utama', '41000'],
  ['pendapatan parkir', '42000'], ['pendapatan bisnis lainnya', '42000'],
  ['pendapatan iklan', '42000'], ['pendapatan pusat', '42000'],
  ['pendapatan sewa tempat', '42000'], ['pendapatan studio', '42000'],
  ['pendapatan gerai', '42000'], ['pendapatan air minum', '42000'],
  ['pendapatan gas lpg', '42000'],
  ['pendapatan bunga', '70000'], ['pendapatan lebih setor', '70000'],
  ['pendapatan lain', '70000'],
  ['beban pajak bank', '80000'], ['beban administrasi bank', '80000'],
  ['beban lain', '80003'], ['beban di luar', '80000'],
  ['akumulasi penyusutan kendaraan', '12201.2'], ['akumulasi penyusutan bangunan', '12102.2'],
  ['akumulasi penyusutan mesin', '12202.2'], ['akumulasi penyusutan peralatan', '12204.2'],
  ['akumulasi penyusutan instalasi', '12203.2'], ['beban penyusutan', '61130'],
];

function resolveCode(codeRaw, name, coaLookup) {
  if (!needsNameLookup(codeRaw, name)) return codeRaw;
  
  const nk = name.toLowerCase().trim();
  if (NAME_TO_CODE[nk]) return NAME_TO_CODE[nk];
  if (coaLookup[nk]) return coaLookup[nk];
  for (const [kw, code] of KEYWORD_MAP) {
    if (nk.includes(kw)) return code;
  }
  return codeRaw;
}

// ─── Parse journal sheet ──────────────────────────────────────────────────────
// Returns flat list of journal entries using sequential debit/credit pairing
function parseJournal(ws, month, coaLookup) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const hIdx = rows.findIndex(r => r.some(c => String(c||'').toLowerCase().trim() === 'tgl'));
  if (hIdx < 0) return [];
  
  // Build a flat list of resolved account lines
  const lines = [];
  let curDate = null, curJNo = null;
  
  rows.slice(hIdx + 1).forEach(r => {
    const dateVal = r[1];
    const jNo = String(r[2] || '').trim();
    const codeRaw = String(r[0] || '').trim();
    const name = String(r[3] || '').trim();
    const subAkun = String(r[4] || '').trim();
    const dVal = num(r[5]);
    const kVal = num(r[6]);
    const ket = String(r[7] || '').trim();
    
    if (typeof dateVal === 'number' && dateVal > 40000) curDate = dateVal;
    if (jNo && /^[A-Z]\.\d+/.test(jNo)) curJNo = jNo;
    
    if (!name || (dVal === 0 && kVal === 0)) return;
    
    const resolvedCode = resolveCode(codeRaw, name, coaLookup);
    const fullAkun = resolvedCode ? `${resolvedCode} ${name}${subAkun ? ' > ' + subAkun : ''}` : name;
    
    lines.push({ date: curDate, jNo: curJNo, akun: fullAkun, code: resolvedCode, d: dVal, k: kVal, ket });
  });
  
  // Sequential pairing: split into transactions by watching D→K→D transitions
  const entries = [];
  let txDebits = [], txKredits = [];
  let txDate = null, txJNo = null;
  
  const flushTx = () => {
    if (txDebits.length === 0 && txKredits.length === 0) return;
    const tanggal = xlDate(txDate, month);
    const baseId = `XL-${month}-${txJNo || 'XX'}`;
    
    if (txDebits.length > 0 && txKredits.length > 0) {
      txDebits.forEach(dl => {
        txKredits.slice(0, 1).forEach(kl => {
          entries.push({ id: `${baseId}-${entries.length}`, tanggal, status: 'posted',
            akun_debit: dl.akun, akun_kredit: kl.akun, debit: dl.d, kredit: dl.d,
            keterangan: dl.ket || kl.ket });
        });
        txKredits.slice(1).forEach(kl => {
          entries.push({ id: `${baseId}-${entries.length}`, tanggal, status: 'posted',
            akun_debit: dl.akun, akun_kredit: kl.akun, debit: kl.k, kredit: kl.k,
            keterangan: dl.ket || kl.ket });
        });
      });
    } else {
      [...txDebits, ...txKredits].forEach(l => {
        entries.push({ id: `${baseId}-s${entries.length}`, tanggal, status: 'posted',
          akun_debit: l.d > 0 ? l.akun : '', akun_kredit: l.k > 0 ? l.akun : '',
          debit: l.d, kredit: l.k, keterangan: l.ket });
      });
    }
    txDebits = []; txKredits = [];
  };
  
  lines.forEach(l => {
    const key = `${l.date}|${l.jNo}`;
    const prevKey = `${txDate}|${txJNo}`;
    
    // New journal entry (date/jNo changed) → flush previous
    if (key !== prevKey && (txDebits.length > 0 || txKredits.length > 0)) {
      flushTx();
    }
    txDate = l.date; txJNo = l.jNo;
    
    if (l.d > 0) {
      // Starting a new debit → if we already had credits, this is a new transaction
      if (txKredits.length > 0) flushTx();
      txDate = l.date; txJNo = l.jNo;
      txDebits.push(l);
    } else if (l.k > 0) {
      txKredits.push(l);
    }
  });
  flushTx(); // final flush
  
  return entries;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== PERUMDA LEDGER — Feb/Mar/Apr Import (v2) ===\n');
  
  const db = new sqlite3.Database(DB_PATH);
  
  const coaRows = await new Promise((res, rej) => db.all('SELECT code, name FROM coa', (e, r) => e ? rej(e) : res(r)));
  const coaLookup = {};
  coaRows.forEach(r => { coaLookup[(r.name||'').toLowerCase().trim()] = r.code; });
  console.log(`COA name lookup: ${Object.keys(coaLookup).length} entries\n`);
  
  let grandTotal = 0;
  
  for (const cfg of MONTHS) {
    console.log(`── ${cfg.label} (${cfg.month}) ──────────────────────`);
    
    const del = await dbRun(db, `DELETE FROM journals WHERE id LIKE 'XL-${cfg.month}-%'`);
    console.log(`   Cleared ${del.changes} existing entries`);
    
    try {
      const wb = XLSX.readFile(path.join(DIR, cfg.file));
      const ws = wb.Sheets[cfg.jSheet];
      if (!ws) { console.log(`   ❌ Sheet "${cfg.jSheet}" not found!`); continue; }
      
      const entries = parseJournal(ws, cfg.month, coaLookup);
      console.log(`   Parsed ${entries.length} entries`);
      
      let inserted = 0;
      for (const e of entries) {
        try {
          await dbRun(db,
            `INSERT OR REPLACE INTO journals (id, tanggal, akun_debit, akun_kredit, debit, kredit, keterangan, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [e.id, e.tanggal, e.akun_debit, e.akun_kredit, e.debit, e.kredit, e.keterangan, e.status]
          );
          inserted++;
        } catch(err) {
          console.log(`   Insert error: ${err.message} (${e.id})`);
        }
      }
      console.log(`   ✓ Inserted ${inserted} entries`);
      grandTotal += inserted;
      
    } catch(err) {
      console.log(`   ❌ ERROR: ${err.message}\n${err.stack}`);
      continue;
    }
    
    // Validate vs expected
    const rows = await new Promise((res, rej) =>
      db.all(`SELECT * FROM journals WHERE tanggal LIKE '${cfg.month}%' AND status='posted'`, (e, r) => e ? rej(e) : res(r))
    );
    
    function sumJ(prefix, isDebit) {
      return rows.reduce((s, j) => {
        const pCode = isDebit ? (j.akun_debit||'').split(' ')[0] : (j.akun_kredit||'').split(' ')[0];
        const pAmt  = isDebit ? j.debit : j.kredit;
        const oCode = isDebit ? (j.akun_kredit||'').split(' ')[0] : (j.akun_debit||'').split(' ')[0];
        const oAmt  = isDebit ? j.kredit : j.debit;
        if (pCode?.startsWith(prefix)) s += (pAmt || 0);
        if (oCode?.startsWith(prefix)) s -= (oAmt || 0);
        return s;
      }, 0);
    }
    
    const p41 = sumJ('41', false), p42 = sumJ('42', false);
    const bpp = sumJ('51', true);
    const b61 = sumJ('61', true), b62 = sumJ('62', true);
    const laba = (p41 + p42) - bpp - b61 - b62;
    
    const exp = cfg.expected;
    const chk = (lbl, actual, expected) => {
      if (expected == null) return;
      const ok = Math.abs(actual - expected) / Math.max(Math.abs(expected), 1) < 0.02 ? '✅' : '⚠️';
      console.log(`   ${ok} ${lbl.padEnd(28)}${Math.round(actual).toLocaleString().padStart(18)} | Expected: ${expected.toLocaleString()}`);
    };
    
    if (exp.p41) chk('Pendapatan Utama (41)', p41, exp.p41);
    if (exp.p42) chk('Pendapatan Lainnya (42)', p42, exp.p42);
    chk('BPP', bpp, exp.bpp);
    chk('Beban Admin (61)', b61, exp.b61);
    chk('Beban Ops (62)', b62, exp.b62);
    console.log(`   ℹ LABA USAHA: ${Math.round(laba).toLocaleString()}`);
    console.log('');
  }
  
  const total = await dbGet(db, "SELECT COUNT(*) as cnt FROM journals WHERE status='posted'");
  console.log(`════════════════════════════════════════`);
  console.log(`Imported this run    : ${grandTotal}`);
  console.log(`Total posted journals: ${total.cnt}`);
  console.log(`════════════════════════════════════════`);
  
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
