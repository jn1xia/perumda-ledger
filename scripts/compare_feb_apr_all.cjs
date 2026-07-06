const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();

const config = {
  feb: {
    file: 'src/FILES/LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx',
    lr: 'LABA RUGI FEB 2026', ner: 'NERACA FEB 2026',
    pen: 'Penerimaan', rpen: 'Rekap Penerimaan',
    bu: 'Rekap Beban Umum', bo: 'Rekap Beban Operasional ',
    bi: 'Rekap Beban Investasi',
    lrp: 'LR PERIOD FEB', nerp: 'NERACA FEB',
    month: '2026-02', thru: '2026-02-28'
  },
  mar: {
    file: 'src/FILES/LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx',
    lr: 'LABA RUGI MARET 2026', ner: 'NERACA MARET 2026',
    pen: 'Penerimaan', rpen: 'Rekap Penerimaan',
    bu: 'Rekap Beban Umum', bo: 'Rekap Beban Operasional ',
    bi: 'Rekap Beban Investasi',
    lrp: 'LR PERIOD MAR', nerp: 'NERACA MAR',
    month: '2026-03', thru: '2026-03-31'
  },
  apr: {
    file: 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx',
    lr: 'LABA RUGI APRIL 2026', ner: 'NERACA APRIL 2026',
    pen: 'Penerimaan', rpen: 'Rekap Penerimaan',
    bu: 'Rekap Beban Umum', bo: 'Rekap Beban Operasional ',
    bi: 'Rekap Beban Investasi',
    lrp: 'LR PERIOD APR', nerp: 'NERACA APR',
    month: '2026-04', thru: '2026-04-30'
  }
};

function extractFromSheet(ws) {
  const ref = ws['!ref'];
  if (!ref) return {};
  const range = XLSX.utils.decode_range(ref);
  const rowMap = {};
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({r:R,c:C})];
      if (!cell) continue;
      if (!rowMap[R]) rowMap[R] = {};
      rowMap[R][C] = cell.v;
    }
  }
  return rowMap;
}

function findValue(rowMap, labelRegex) {
  for (const [rStr, cols] of Object.entries(rowMap)) {
    const colEntries = Object.entries(cols).map(([c,v]) => [parseInt(c), v]).sort((a,b)=>a[0]-b[0]);
    const labelIdx = colEntries.findIndex(([c,v]) => typeof v === 'string' && labelRegex.test(v));
    if (labelIdx === -1) continue;
    const numCol = colEntries.slice(labelIdx+1).find(([c,v]) => typeof v === 'number');
    if (numCol) return numCol[1];
  }
  return null;
}

// Extract Penerimaan details
function extractPenerimaan(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  const items = [];
  let totalBU = null, totalPBL = null, totalPU = null, totalBunga = null, totalAll = null;
  rows.forEach((r) => {
    const label = r.slice(0,6).find(c => typeof c === 'string' && c.length > 5) || '';
    const nums = r.filter(c => typeof c === 'number');
    // Find "Realisasi Bulan ini" column (usually last numeric before percentage)
    if (/Total.*Bisnis Utama|^Total$/i.test(label) && r.some(c => typeof c === 'string' && /Bisnis Utama/i.test(c))) {
      // skip
    }
    if (/TOTAL PENDAPATAN USAHA/i.test(label)) totalPU = nums.length > 0 ? nums[nums.length-1] : null;
    if (/TOTAL PENDAPATAN\s*$/i.test(label)) totalAll = nums.length > 0 ? nums[nums.length-1] : null;
  });
  return { totalPU, totalAll };
}

// Extract Rekap Penerimaan totals
function extractRekapPenerimaan(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  let totalBU = null, totalPBL = null, totalPU = null, bunga = null, totalAll = null;
  rows.forEach(r => {
    const allStr = r.map(c => String(c)).join(' ');
    const nums = r.filter(c => typeof c === 'number');
    if (/^TOTAL$/i.test(String(r[1]||'').trim()) && nums.length >= 1) {
      if (totalBU === null) totalBU = nums.find((n,i) => i >= 2) || nums[nums.length-2] || nums[0];
      else if (totalPBL === null) totalPBL = nums.find((n,i) => i >= 2) || nums[nums.length-2] || nums[0];
    }
    if (/TOTAL PENDAPATAN USAHA/i.test(allStr)) totalPU = nums.length > 1 ? nums[nums.length-2] : nums[0];
    if (/TOTAL PENDAPATAN\s*$/i.test(allStr) && !/USAHA/i.test(allStr)) totalAll = nums.length > 1 ? nums[nums.length-2] : nums[0];
    if (/Bunga.*Giro|Jasa Giro/i.test(allStr)) bunga = nums.length > 1 ? nums[nums.length-2] : nums[0];
  });
  return { totalBU, totalPBL, totalPU, bunga, totalAll };
}

// Extract Rekap Beban totals
function extractRekapBeban(ws) {
  if (!ws) return { total: null };
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  let total = null;
  rows.forEach(r => {
    const allStr = r.map(c => String(c)).join(' ');
    if (/TOTAL BEBAN|Total Beban|TOTAL INVESTASI/i.test(allStr)) {
      const nums = r.filter(c => typeof c === 'number');
      if (nums.length >= 1) total = nums[nums.length-2] || nums[nums.length-1];
    }
  });
  return { total };
}

const lrDefs = [
  { code: '41000', rx: /Pendapatan Bisnis Utama/i },
  { code: '42000', rx: /Pendapatan Pengembangan Bisnis Lainnya/i },
  { code: '51000', rx: /Beban Pokok Penjualan \(Bapok/i },
  { code: '51001', rx: /Beban Pokok Penjualan \(Gas LPG/i },
  { code: '61010', rx: /^Beban Gaji$/i },
  { code: '61020', rx: /Beban Tunjangan Pegawai Umum/i },
  { code: '61041', rx: /Beban Alat Tulis Kantor/i },
  { code: '61050', rx: /Beban Telepon\/Listrik\/Air/i },
  { code: '61060', rx: /Beban Konsumsi Rapat dan Tamu/i },
  { code: '61070', rx: /Beban Perlengkapan & Pemeliharaan Kantor/i },
  { code: '61080', rx: /Beban Bahan Bakar Minyak/i },
  { code: '61090', rx: /Beban Perjalanan Dinas/i },
  { code: '61100', rx: /Beban Pendidikan, Pelatihan/i },
  { code: '61110', rx: /Beban Sewa Kendaraan/i },
  { code: '61120', rx: /Beban Jasa Profesional/i },
  { code: '61130', rx: /Beban Penyusutan Aktiva/i },
  { code: '61140', rx: /Beban Umum Lainnya/i },
  { code: '62010', rx: /Beban Pemeliharaan Kendaraan/i },
  { code: '62020', rx: /Beban Pemeliharaan Pasar/i },
  { code: '62030', rx: /Beban Pemeliharaan Kebersihan Pasar/i },
  { code: '62040', rx: /Beban Pelayanan dan Pemasaran/i },
  { code: '62050', rx: /Beban Barang Cetakan/i },
  { code: '62060', rx: /Beban Gaji dan Honor Tenaga Kontrak/i },
  { code: '62070', rx: /Beban Tunjangan Pegawai Operasional/i },
  { code: '62080', rx: /Beban Kelengkapan Pegawai Operasional/i },
  { code: '62090', rx: /Beban Insentif\/Kesejahteraan/i },
  { code: '62100', rx: /Beban Pemeliharaan Keamanan dan Ketertiban/i },
  { code: '70001', rx: /Pendapatan Bunga Bank/i },
  { code: '80001', rx: /Beban Pajak Bank/i },
  { code: '80002', rx: /Beban Administrasi Bank/i },
];

const nerDefs = [
  { code: '11101', rx: /^Kas Kecil/i, isDr: true },
  { code: '11103', rx: /^Kas Bank Kalsel/i, isDr: true },
  { code: '11104', rx: /^Bank BNI$/i, isDr: true },
  { code: '11106', rx: /^Bank BNI Bisnis/i, isDr: true },
  { code: '11107', rx: /^Bank BNI Tapcash/i, isDr: true },
  { code: '11300', rx: /^Piutang Usaha/i, isDr: true },
  { code: '11401', rx: /Gerai Inflasi/i, isDr: true },
  { code: '11402', rx: /Gas LPG/i, isDr: true },
  { code: '11500', rx: /BBM Dibayar di Muka/i, isDr: true },
  { code: '12101', rx: /^Tanah /i, isDr: true },
  { code: '12102.1', rx: /^Bangunan$/i, isDr: true },
  { code: '12102.2', rx: /^Akumulasi Penyusutan Bangunan/i, isDr: false },
  { code: '12103.1', rx: /^Mesin$/i, isDr: true },
  { code: '12103.2', rx: /^Akumulasi Penyusutan Mesin/i, isDr: false },
  { code: '12104.1', rx: /^Instalasi Listrik/i, isDr: true },
  { code: '12104.2', rx: /^Akumulasi Penyusutan Instalasi Listrik/i, isDr: false },
  { code: '12105.1', rx: /^Peralatan/i, isDr: true },
  { code: '12105.2', rx: /^Akumulasi Penyusutan Peralatan/i, isDr: false },
  { code: '12106.1', rx: /^Kendaraan/i, isDr: true },
  { code: '12106.2', rx: /^Akumulasi Penyusutan Kendaraan/i, isDr: false },
  { code: '12300', rx: /^Aset Dalam Penyelesaian/i, isDr: true },
  { code: '21200', rx: /^Utang Usaha/i, isDr: false },
  { code: '21500', rx: /^Pendapatan Diterima Dimuka/i, isDr: false },
  { code: '22300', rx: /^Utang Daerah/i, isDr: false },
];

// MAIN
const db = new sqlite3.Database('server/perumda_ledger.db');
db.all('SELECT code, saldo_awal FROM coa', (e1, coa) => {
  const saldoMap = {};
  coa.forEach(c => saldoMap[c.code] = c.saldo_awal || 0);

  db.all("SELECT * FROM journals WHERE status='posted'", (e2, J) => {
    
    const output = [];
    
    Object.entries(config).forEach(([k, c]) => {
      const wb = XLSX.readFile(c.file);
      output.push('============================================================');
      output.push('  ' + k.toUpperCase() + ' — ' + c.file.split('/').pop());
      output.push('============================================================');
      
      // --- LABA RUGI ---
      const lrRm = extractFromSheet(wb.Sheets[c.lr]);
      const mJ = J.filter(j => j.tanggal?.startsWith(c.month));
      
      const netPrefix = (prefix, journalSet) => journalSet.reduce((s,j) => {
        const kc = (j.akun_kredit||'').split(' ')[0];
        const dc = (j.akun_debit||'').split(' ')[0];
        if (kc.startsWith(prefix)) s += (j.kredit||0);
        if (dc.startsWith(prefix)) s -= (j.debit||0);
        return s;
      }, 0);
      
      const netDPrefix = (prefix, journalSet) => journalSet.reduce((s,j) => {
        const dc = (j.akun_debit||'').split(' ')[0];
        const kc = (j.akun_kredit||'').split(' ')[0];
        if (dc.startsWith(prefix)) s += (j.debit||0);
        if (kc.startsWith(prefix)) s -= (j.kredit||0);
        return s;
      }, 0);

      output.push('\n--- LABA RUGI ' + k.toUpperCase() + ' ---');
      let lrMatch = 0, lrDiff = 0;
      lrDefs.forEach(def => {
        const target = findValue(lrRm, def.rx) || 0;
        let actual;
        if (def.code.startsWith('4') || def.code === '70001') {
          actual = netPrefix(def.code, mJ);
        } else {
          actual = netDPrefix(def.code, mJ);
        }
        const d = Math.abs(target - actual);
        if (d < 1) { lrMatch++; }
        else {
          lrDiff++;
          output.push(def.code + ' | Excel=' + Math.round(target).toLocaleString() + ' | Prog=' + Math.round(actual).toLocaleString() + ' | Diff=' + Math.round(d).toLocaleString() + ' ❌');
        }
      });
      output.push('LR: ' + lrMatch + ' match, ' + lrDiff + ' diff');

      // --- NERACA ---
      const nerRm = extractFromSheet(wb.Sheets[c.ner]);
      const thruJ = J.filter(j => j.tanggal <= c.thru);
      
      output.push('\n--- NERACA ' + k.toUpperCase() + ' ---');
      let nerMatch = 0, nerDiffCnt = 0;
      nerDefs.forEach(def => {
        const target = findValue(nerRm, def.rx) || 0;
        const isDr = def.isDr;
        const actual = (saldoMap[def.code]||0) + thruJ.reduce((s,j) => {
          const dc = (j.akun_debit||'').split(' ')[0];
          const kc = (j.akun_kredit||'').split(' ')[0];
          if(isDr){ if(dc===def.code)s+=j.debit||0; if(kc===def.code)s-=j.kredit||0; }
          else{ if(kc===def.code)s+=j.kredit||0; if(dc===def.code)s-=j.debit||0; }
          return s;
        }, 0);
        const d = Math.abs(target - actual);
        if (d < 1) { nerMatch++; }
        else {
          nerDiffCnt++;
          output.push(def.code + ' | Excel=' + Math.round(target).toLocaleString() + ' | Prog=' + Math.round(actual).toLocaleString() + ' | Diff=' + Math.round(d).toLocaleString() + ' ❌');
        }
      });
      output.push('Neraca: ' + nerMatch + ' match, ' + nerDiffCnt + ' diff');

      // --- PENERIMAAN ---
      output.push('\n--- PENERIMAAN ' + k.toUpperCase() + ' ---');
      const penWs = wb.Sheets[c.pen];
      if (penWs) {
        const penRows = XLSX.utils.sheet_to_json(penWs, {header:1, defval:''});
        let exTotalPU = null, exTotalAll = null;
        penRows.forEach(r => {
          const allStr = r.map(x => String(x)).join('|');
          const nums = r.filter(x => typeof x === 'number');
          if (/TOTAL PENDAPATAN USAHA/i.test(allStr) && nums.length >= 1) exTotalPU = nums[nums.length-1];
          if (/TOTAL PENDAPATAN\s*$/i.test(allStr) && !/USAHA/i.test(allStr) && nums.length >= 1) exTotalAll = nums[nums.length-1];
        });
        const progK41 = mJ.reduce((s,j) => {
          const c2 = (j.akun_kredit||'').split(' ')[0];
          return s + (c2.startsWith('41') ? (j.kredit||0) : 0);
        }, 0);
        const progK42 = mJ.reduce((s,j) => {
          const c2 = (j.akun_kredit||'').split(' ')[0];
          return s + (c2.startsWith('42') ? (j.kredit||0) : 0);
        }, 0);
        const progPU = progK41 + progK42;
        
        if (exTotalPU !== null) {
          const d = Math.abs(exTotalPU - progPU);
          output.push('Total Pend Usaha: Excel=' + Math.round(exTotalPU).toLocaleString() + ' | Prog=' + Math.round(progPU).toLocaleString() + (d < 1 ? ' ✅' : ' ❌ Diff=' + Math.round(d).toLocaleString()));
        } else {
          output.push('Total Pend Usaha: Excel=N/A (empty) | Prog=' + Math.round(progPU).toLocaleString());
        }
      } else {
        output.push('Sheet not found');
      }

      // --- BEBAN UMUM ---
      output.push('\n--- BEBAN UMUM ' + k.toUpperCase() + ' ---');
      const progBU = netDPrefix('61', mJ);
      output.push('Program Beban Umum (61 NET): ' + Math.round(progBU).toLocaleString());

      // --- BEBAN OPERASIONAL ---
      output.push('\n--- BEBAN OPERASIONAL ' + k.toUpperCase() + ' ---');
      const progBO = netDPrefix('62', mJ);
      const progBPP = netDPrefix('51', mJ);
      output.push('Program Beban Ops (62 NET): ' + Math.round(progBO).toLocaleString());
      output.push('Program BPP (51 NET): ' + Math.round(progBPP).toLocaleString());
      output.push('Program Total Ops+BPP: ' + Math.round(progBO + progBPP).toLocaleString());

      output.push('');
    });

    console.log(output.join('\n'));
    db.close();
  });
});
