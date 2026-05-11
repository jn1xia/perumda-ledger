const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// ========== EXTRACT ALL DATA ==========

// COA from April (authoritative)
const wbApr = XLSX.readFile(path.join(__dirname, 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx'));
const wsAprCOA = wbApr.Sheets['COA'];
const rawAprCOA = XLSX.utils.sheet_to_json(wsAprCOA, { header: 1, defval: '' });
// ========== SALDO AWAL ==========
const wsAprSaldo = wbApr.Sheets['Rekap Akun & Saldo (thn)'];
const rawAprSaldo = XLSX.utils.sheet_to_json(wsAprSaldo, { header: 1, defval: '' });
const saldoAwalMap = {};
for (let i = 1; i < rawAprSaldo.length; i++) {
  const r = rawAprSaldo[i];
  const code = r[0];
  if (!code || !String(code).match(/^\d/)) continue;
  saldoAwalMap[String(code)] = {
    code: String(code), name: String(r[1]||'').trim(),
    saldoAwal: typeof r[3] === 'number' ? r[3] : 0,
    saldoAkhir: typeof r[6] === 'number' ? r[6] : 0,
  };
}

// COA accounts extraction
const coaAccounts = [];
for (let i = 0; i < rawAprCOA.length; i++) {
  const [code, name] = rawAprCOA[i];
  if (!code || code === '' || typeof name !== 'string' || !name) continue;
  if (typeof code === 'number' && code < 10) continue;
  if (typeof code === 'string' && code.match(/^\d\.\d/)) continue;
  const codeStr = String(code);
  if (!codeStr.match(/^\d{4,5}(\.\d)?$/)) continue;
  coaAccounts.push({ 
    code: codeStr, 
    name: name.trim(),
    category: getCategory(codeStr),
    type: 'posting',
    saldo_awal: saldoAwalMap[codeStr] ? saldoAwalMap[codeStr].saldoAwal : 0
  });
}

function getCategory(code) {
  const c = String(code);
  if (c.startsWith('1')) return 'Aset';
  if (c.startsWith('2')) return 'Kewajiban';
  if (c.startsWith('3')) return 'Ekuitas';
  if (c.startsWith('4')) return 'Pendapatan';
  if (c.startsWith('5')) return 'HPP';
  if (c.startsWith('6')) return 'Beban';
  if (c.startsWith('7')) return 'Pendapatan';
  if (c.startsWith('8')) return 'Beban';
  if (c === '99999') return 'Beban';
  return 'Lainnya';
}

function buildCOATree(flatAccounts, saldoAwal) {
  const hierarchy = {
    '1': { name: 'ASET', cat: 'Aset', sub: { '11': 'Aset Lancar', '12': 'Aset Tidak Lancar', '13': 'Aset Lainnya' }},
    '2': { name: 'KEWAJIBAN', cat: 'Kewajiban', sub: { '21': 'Kewajiban Jangka Pendek', '22': 'Kewajiban Jangka Panjang' }},
    '3': { name: 'EKUITAS', cat: 'Ekuitas', sub: {} },
    '4': { name: 'PENDAPATAN', cat: 'Pendapatan', sub: { '41': 'Pendapatan Bisnis Utama', '42': 'Pendapatan Bisnis Lainnya' }},
    '5': { name: 'BEBAN POKOK PENJUALAN', cat: 'HPP', sub: {} },
    '6': { name: 'BEBAN', cat: 'Beban', sub: { '61': 'Beban Administrasi & Umum', '62': 'Beban Operasional dan Bisnis' }},
    '7': { name: 'PENDAPATAN LUAR OPERASIONAL', cat: 'Pendapatan', sub: {} },
    '8': { name: 'BEBAN LUAR OPERASIONAL', cat: 'Beban', sub: {} },
    '9': { name: 'PAJAK', cat: 'Beban', sub: {} },
  };
  function salAwal(code) { const s = saldoAwal[code]; return s ? s.saldoAwal : 0; }
  const tree = [];
  const groups = {};
  flatAccounts.forEach(a => { (groups[a.code.charAt(0)] = groups[a.code.charAt(0)] || []).push(a); });
  Object.keys(hierarchy).forEach(prefix => {
    const h = hierarchy[prefix];
    const accts = groups[prefix] || [];
    if (accts.length === 0 && prefix !== '9') return;
    const node = { code: prefix, name: h.name, type: 'parent', category: h.cat, children: [] };
    if (Object.keys(h.sub).length > 0) {
      Object.keys(h.sub).forEach(sp => {
        const sa = accts.filter(a => a.code.startsWith(sp));
        if (sa.length === 0) return;
        node.children.push({ code: sp, name: h.sub[sp], type: 'parent', category: h.cat,
          children: sa.map(a => ({ code: a.code, name: a.name, type: 'posting', category: h.cat, saldoAwal: salAwal(a.code) }))
        });
      });
    } else {
      node.children = accts.map(a => ({ code: a.code, name: a.name, type: 'posting', category: h.cat, saldoAwal: salAwal(a.code) }));
    }
    if (prefix === '9') node.children = [{ code: '99999', name: 'Pajak Penghasilan', type: 'posting', category: 'Beban', saldoAwal: 0 }];
    tree.push(node);
  });
  return tree;
}

// (saldoAwalMap used above)
const saldoAwal = saldoAwalMap; 

// ========== APRIL JOURNALS ==========
// Column structure (confirmed): col0=akunCode, col1=dateSN(Tgl), col2=bukti(No.), col3=akunName, col4=subAkun, col5=D, col6=K, col7=keterangan
const wsAprJurnal = wbApr.Sheets['JURNAL APRIL 2026'];
const rawAprJurnal = XLSX.utils.sheet_to_json(wsAprJurnal, { header: 1, defval: '' });

const aprJournals = [];
let jid = 1;

// Group by date serial (col 1), then by bukti within date
const dateGroups = {};
for (let i = 3; i < rawAprJurnal.length; i++) {
  const r = rawAprJurnal[i];
  const dateSN = r[1]; // Tgl is col 1
  if (!dateSN || typeof dateSN !== 'number') continue;
  const accName = r[3] || '';
  if (!accName || accName === 'Tgl') continue;
  const debit = Number(r[5]) || 0;
  const kredit = Number(r[6]) || 0;
  if (!debit && !kredit) continue;

  if (!dateGroups[dateSN]) dateGroups[dateSN] = [];
  dateGroups[dateSN].push({
    accCode: r[0], accName, sub: r[4] || '', debit, kredit,
    bukti: String(r[2] || ''), ket: String(r[7] || '').trim(),
  });
}

// Convert date serial to string
function snToDate(sn) {
  const d = new Date((sn - 25569) * 86400 * 1000);
  return d.toISOString().split('T')[0];
}

Object.keys(dateGroups).sort((a,b) => a-b).forEach(dateSN => {
  const rows = dateGroups[dateSN];
  const tanggal = snToDate(Number(dateSN));
  const buktiMap = {};
  rows.forEach(r => {
    const key = r.bukti;
    if (!buktiMap[key]) buktiMap[key] = [];
    buktiMap[key].push(r);
  });

  Object.values(buktiMap).forEach(buktiRows => {
    // Each bukti group has at least a debit and credit row
    const debits = buktiRows.filter(r => r.debit > 0);
    const credits = buktiRows.filter(r => r.kredit > 0);

    if (debits.length === 0 || credits.length === 0) return;

    const addEntry = (dRow, cRow, ket) => {
      aprJournals.push({
        id: 'JV-2026-' + String(jid++).padStart(3, '0'),
        tanggal,
        keterangan: ket || dRow.accName,
        debit: dRow.debit, kredit: cRow.kredit, status: 'posted',
        akun_debit: dRow.accCode + ' - ' + dRow.accName,
        akun_kredit: cRow.accCode + ' - ' + cRow.accName,
        bukti: dRow.bukti
      });
    };

    if (debits.length === 1 && credits.length === 1) {
      addEntry(debits[0], credits[0], buktiRows[0].ket || debits[0].accName);
    } else if (debits.length >= 1 && credits.length === 1) {
      debits.forEach(d => {
        // Find the matching sub-account keterangan or use parent ket
        const ket = buktiRows[0].ket || d.accName;
        addEntry(d, credits[0], ket);
      });
    } else if (debits.length === 1 && credits.length > 1) {
      credits.forEach(c => addEntry(debits[0], c, buktiRows[0].ket || debits[0].accName));
    } else {
      // Try to pair by amount
      const used = new Set();
      debits.forEach(d => {
        let found = false;
        credits.forEach((c, ci) => {
          if (!used.has(ci) && Math.abs(c.kredit - d.debit) < 1 && !found) {
            addEntry(d, c, buktiRows[0].ket || d.accName);
            used.add(ci);
            found = true;
          }
        });
        if (!found) {
          const ci = credits.findIndex((_, i) => !used.has(i));
          if (ci >= 0) { addEntry(d, credits[ci], buktiRows[0].ket || d.accName); used.add(ci); }
        }
      });
    }
  });
});

console.log('April journals extracted:', aprJournals.length);

// ========== JANUARY JOURNALS ==========
const wbJan = XLSX.readFile(path.join(__dirname, 'src/FILES/DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026(1).xlsx'));
const wsJanJurnal = wbJan.Sheets['JURNAL JAN 2026'];
const rawJanJurnal = XLSX.utils.sheet_to_json(wsJanJurnal, { header: 1, defval: '' });

// Build name->code map
const nameToCode = {};
coaAccounts.forEach(a => { nameToCode[a.name.toLowerCase()] = a.code; });
nameToCode['beban lain lain'] = '80000';
nameToCode['bank bni tapcash'] = '11101';

function janLookup(name) {
  const key = name.toLowerCase().trim();
  if (nameToCode[key]) return nameToCode[key];
  for (const [n, c] of Object.entries(nameToCode)) {
    if (n.includes(key) || key.includes(n)) return c;
  }
  return null;
}

// Group by date serial (col 0)
const janDateGroups = {};
for (let i = 3; i < rawJanJurnal.length; i++) {
  const r = rawJanJurnal[i];
  const dateSN = r[0];
  if (!dateSN || typeof dateSN !== 'number') continue;
  const name = r[2] || '';
  if (!name) continue;
  const debit = Number(r[4]) || 0;
  const kredit = Number(r[5]) || 0;
  if (!debit && !kredit) continue;

  if (!janDateGroups[dateSN]) janDateGroups[dateSN] = [];
  janDateGroups[dateSN].push({ name, debit, kredit, ket: String(r[6]||'').trim() });
}

const janJournals = [];
Object.keys(janDateGroups).sort((a,b) => a-b).forEach(dateSN => {
  const rows = janDateGroups[dateSN];
  const tanggal = snToDate(Number(dateSN));
  const debits = rows.filter(r => r.debit > 0).map(r => ({ ...r, code: janLookup(r.name) || '11101' }));
  const credits = rows.filter(r => r.kredit > 0).map(r => ({ ...r, code: janLookup(r.name) || '11101' }));

  if (debits.length === 0 || credits.length === 0) return;

  const addEntry = (d, c, ket) => {
    janJournals.push({
      id: 'JAN-' + String(jid++).padStart(3, '0'), tanggal,
      keterangan: ket || d.name, debit: d.debit, kredit: c.kredit, status: 'posted',
      akun_debit: d.code + ' - ' + d.name, akun_kredit: c.code + ' - ' + c.name,
      bukti: 'JAN'
    });
  };

  if (debits.length === 1 && credits.length === 1) {
    addEntry(debits[0], credits[0], debits[0].ket || credits[0].ket);
  } else if (debits.length >= 1 && credits.length === 1) {
    debits.forEach(d => addEntry(d, credits[0], d.ket));
  } else if (debits.length === 1 && credits.length > 1) {
    credits.forEach(c => addEntry(debits[0], c, c.ket));
  } else {
    const used = new Set();
    debits.forEach(d => {
      let found = false;
      credits.forEach((c, ci) => {
        if (!used.has(ci) && Math.abs(c.kredit - d.debit) < 1 && !found) {
          addEntry(d, c, d.ket); used.add(ci); found = true;
        }
      });
      if (!found) {
        const ci = credits.findIndex((_, i) => !used.has(i));
        if (ci >= 0) { addEntry(d, credits[ci], d.ket); used.add(ci); }
      }
    });
  }
});

console.log('January journals extracted:', janJournals.length);

// Combine
const combinedJournals = [...janJournals, ...aprJournals];
console.log('Total combined journals:', combinedJournals.length);

// ========== ASSETS ==========
const wsAprAset = wbApr.Sheets['DAFTAR AKTIVA TETAP'];
const rawAprAset = XLSX.utils.sheet_to_json(wsAprAset, { header: 1, defval: '' });
const assets = [];
let curKategori = '';
for (let i = 5; i < rawAprAset.length; i++) {
  const r = rawAprAset[i];
  const no = r[0];
  const nama = r[1] || '';
  if (typeof no === 'string' && no.match(/^[IV]+\./)) {
    if (no.includes('TANAH')) curKategori = 'Tanah';
    else if (no.includes('BANGUNAN')) curKategori = 'Bangunan';
    else if (no.includes('KENDARAAN')) curKategori = 'Kendaraan';
    else if (no.includes('MESIN')) curKategori = 'Mesin';
    else if (no.includes('INSTALASI')) curKategori = 'Instalasi Listrik';
    else if (no.includes('PERALATAN')) curKategori = 'Peralatan';
    continue;
  }
  if (typeof no !== 'number' || !nama) continue;
  const tglSN = r[3];
  let tgl = '2025-01-01';
  if (typeof tglSN === 'number' && tglSN > 30000) {
    const dt = new Date((tglSN - 25569) * 86400 * 1000);
    tgl = dt.toISOString().split('T')[0];
  }
  assets.push({
    kode: 'AT-' + String(assets.length+1).padStart(3,'0'),
    nama: nama.trim(), detail: String(r[2]||'').trim(),
    kategori: curKategori || 'Peralatan',
    tgl_perolehan: tgl,
    nilai_perolehan: Number(r[4])||0,
    penyusutan_per_tahun: Number(r[6])||0,
    penyusutan_per_bulan: Number(r[7])||0,
    beban_penyusutan_2025: Number(r[8])||0,
    nilai_penyusutan: Number(r[9])||0,
    nilai_buku: Number(r[10])||0,
    beban_penyusutan_maret_2026: Number(r[11])||0,
    akum_penyusutan_maret_2026: Number(r[12])||0,
    nilai_buku_maret_2026: Number(r[13])||0,
    umur_manfaat: curKategori === 'Tanah' ? '-' : (curKategori === 'Bangunan' ? '20 tahun' : '8 tahun'),
    keterangan: String(r[20]||'').trim()
  });
}

// ========== COMPUTE HELPERS ==========
function computeBal(code, journals) {
  let mov = 0;
  journals.forEach(j => {
    const dc = j.akun_debit.split(' ')[0];
    const kc = j.akun_kredit.split(' ')[0];
    if (dc === code) mov += j.debit;
    if (kc === code) mov -= j.kredit;
  });
  const sa = saldoAwal[code] ? saldoAwal[code].saldoAwal : 0;
  if (['3','4','5','7'].includes(String(code).charAt(0))) return sa - mov;
  return sa + mov;
}

function monthlyCompute(journals) {
  const inc = Array(12).fill(0), exp = Array(12).fill(0);
  journals.forEach(j => {
    const m = new Date(j.tanggal).getMonth();
    if (m < 0 || m > 11) return;
    const dc = j.akun_debit.split(' ')[0];
    const kc = j.akun_kredit.split(' ')[0];
    if (dc.match(/^[47]/)) inc[m] += j.debit;
    if (kc.match(/^[47]/)) inc[m] -= j.kredit;
    if (dc.match(/^[5689]/)) exp[m] += j.debit;
    if (kc.match(/^[5689]/)) exp[m] -= j.kredit;
  });
  return { inc, exp };
}

const { inc: mi, exp: me } = monthlyCompute(combinedJournals);
const mnp = mi.map((v,i) => v + me[i]);

const kasBank = computeBal('11103', combinedJournals) + computeBal('11104', combinedJournals) + computeBal('11106', combinedJournals);
const totalPendApr = mi[3];
const totalBebApr = me[3];
const pendPendek = combinedJournals.filter(j => new Date(j.tanggal).getMonth()===3 && j.akun_debit.split(' ')[0].startsWith('41')).reduce((s,j) => s+j.debit, 0);
const pendLain = totalPendApr - pendPendek;

console.log('\n=== COMPUTED VALUES ===');
console.log('totalPendApr:', totalPendApr);
console.log('totalBebApr:', totalBebApr);
console.log('kasBank:', kasBank);
console.log('Monthly Income:', mi);
console.log('Monthly Expense:', me);
console.log('Monthly Net:', mnp);

// ========== BUILD OUTPUT ==========
const L = [];
L.push('// ===== AUTO-GENERATED FROM EXCEL DATA =====');
L.push('// Source: LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx + JANUARI 2026.xlsx');
L.push('// Generated: ' + new Date().toISOString());
L.push('// DO NOT EDIT MANUALLY - Re-run generateSampleData.cjs to update');
L.push('');
L.push('// ===== DATA VERSION =====');
L.push('export const DATA_VERSION = 4');
L.push('');
L.push('// ===== DASHBOARD DATA =====');
L.push('export const dashboardKPIs = [');
L.push('  {');
L.push('    label: "Kas & Bank", value: "Rp ' + (kasBank/1e6).toFixed(1).replace(/\.0$/,'') + 'M",');
L.push('    subs: [');
L.push('      { code: "11101", name: "Kas Kecil", amount: "' + ((saldoAwal['11101']?.saldoAwal||0)/1e6).toFixed(1) + 'M" },');
L.push('      { code: "11103", name: "Bank Kalsel", amount: "' + ((saldoAwal['11103']?.saldoAwal||0)/1e6).toFixed(1) + 'M" },');
L.push('      { code: "11104", name: "Bank BNI", amount: "' + ((saldoAwal['11104']?.saldoAwal||0)/1e6).toFixed(1) + 'M" },');
L.push('      { code: "11106", name: "BNI Bisnis", amount: "' + ((saldoAwal['11106']?.saldoAwal||0)/1e6).toFixed(1) + 'M" },');
L.push('    ]');
L.push('  },');
L.push('  {');
L.push('    label: "Piutang Usaha", value: "Rp ' + (computeBal('11201',combinedJournals)/1e6).toFixed(1) + 'M",');
L.push('    trend: { value: "-", direction: "down", vs: "vs bulan lalu" },');
L.push('    subs: [{ code: "11201", name: "Piutang Usaha", amount: "" }]');
L.push('  },');
L.push('  {');
L.push('    label: "Total Pendapatan (Apr)", value: "Rp ' + (totalPendApr/1e6).toFixed(1).replace(/\.0$/,'') + 'M",');
L.push('    trend: { value: "74.6%", direction: "up", vs: "capaian vs target" },');
L.push('    subs: [');
L.push('      { code: "41000", name: "Pend. Bisnis Utama", amount: "' + (pendPendek/1e6).toFixed(1) + 'M" },');
L.push('      { code: "42000", name: "Pend. Bisnis Lainnya", amount: "' + (pendLain/1e6).toFixed(1) + 'M" },');
L.push('    ]');
L.push('  },');
L.push('  {');
L.push('    label: "BBM Dibayar di Muka", value: "Rp ' + (computeBal('11501',combinedJournals)/1e6).toFixed(1) + 'M",');
L.push('    trend: { value: "-", direction: "down", vs: "vs bulan lalu" },');
L.push('    subs: [{ code: "11501", name: "BBM Prabayar", amount: "" }]');
L.push('  },');
L.push(']');
L.push('');

L.push('export const dashboardAlerts = [');
L.push("  { type: 'info', title: 'Data Periode Januari - April 2026', desc: 'Data berdasarkan Lampiran Laporan Keuangan Januari dan April 2026' },");
L.push("  { type: 'success', title: 'Saldo Awal sesuai LAI Perumda 2025', desc: 'Saldo awal tahun 2026 mengacu laporan audited 2025' }");
L.push(']');
L.push('');

// Charts
const bbmMon = [0,0,0,0];
combinedJournals.forEach(j => { const m = new Date(j.tanggal).getMonth(); if(m>=0&&m<=3&&j.akun_debit.split(' ')[0]==='11501') bbmMon[m]+=j.debit; });
const bumMon = [0,0,0,0];
combinedJournals.forEach(j => { const m = new Date(j.tanggal).getMonth(); if(m>=0&&m<=3){const dc=j.akun_debit.split(' ')[0]; if(dc.startsWith('61')||dc.startsWith('8')) bumMon[m]+=j.debit;} });

L.push('// ===== CHART DATA =====');
L.push('export const bbmChartData = {');
L.push("  labels: ['Jan', 'Feb', 'Mar', 'Apr'],");
L.push('  datasets: [{');
L.push("    label: 'BBM Realisasi',");
L.push('    data: [' + bbmMon.join(', ') + '],');
L.push("    borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.4, fill: true, pointRadius: 5, pointBackgroundColor: '#3B82F6'");
L.push('  }]');
L.push('}');
L.push('');

L.push('export const trenBebanData = {');
L.push("  labels: ['Jan', 'Feb', 'Mar', 'Apr'],");
L.push('  datasets: [{');
L.push("    label: 'Beban Umum & Administrasi',");
L.push('    data: [' + bumMon.join(', ') + '],');
L.push("    backgroundColor: '#E54D42', borderRadius: 6");
L.push('  }]');
L.push('}');
L.push('');

L.push('export const komposisiBebanData = {');
L.push("  labels: ['Beban Umum', 'Beban Operasional', 'Beban Investasi'],");
L.push('  datasets: [{');
L.push("    data: [1939609216, 1691792478, 611088325],");
L.push("    backgroundColor: ['#E54D42', '#F59E0B', '#8B5CF6'], borderWidth: 0, cutout: '65%'");
L.push('  }]');
L.push('}');
L.push('');

L.push('export const trenLabaBersihData = {');
L.push("  labels: ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026'],");
L.push('  datasets: [');
L.push('    { label: "Laba/Rugi Berjalan", data: [' + mnp.slice(0,4).join(', ') + '], borderColor: "#1E293B", backgroundColor: "rgba(30,41,59,0.05)", tension: 0.4, fill: false, pointRadius: 5, pointBackgroundColor: "#1E293B" },');
L.push('    { label: "Pendapatan", data: [' + mi.slice(0,4).join(', ') + '], borderColor: "#10B981", backgroundColor: "rgba(16,185,129,0.05)", tension: 0.4, borderDash: [5, 5], fill: false, pointRadius: 5, pointBackgroundColor: "#10B981" }');
L.push('  ]');
L.push('}');
L.push('');

L.push('export const pendapatanVsBebanData = {');
L.push("  labels: ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026'],");
L.push('  datasets: [');
L.push('    { label: "Pendapatan", data: [' + mi.slice(0,4).join(', ') + '], backgroundColor: "#10B981", borderRadius: 6 },');
L.push('    { label: "Total Beban", data: [' + me.slice(0,4).join(', ') + '], backgroundColor: "#E54D42", borderRadius: 6 }');
L.push('  ]');
L.push('}');
L.push('');

L.push('export const trenSaldoKasData = {');
L.push("  labels: ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026'],");
L.push('  datasets: [{');
L.push("    label: 'Saldo Kas & Bank',");
L.push('    data: [' + [kasBank, kasBank, kasBank, kasBank].join(', ') + '],');
L.push("    borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.08)', tension: 0.4, fill: true, pointRadius: 5, pointBackgroundColor: '#10B981'");
L.push('  }]');
L.push('}');
L.push('');

L.push('// ===== COA DATA =====');
L.push('export const coaData = ' + JSON.stringify(buildCOATree(coaAccounts, saldoAwal), null, 2));
L.push('');
L.push('// ===== JOURNAL DATA =====');
L.push('export const jurnalData = ' + JSON.stringify(combinedJournals, null, 2));
L.push('');
L.push('export const bukuBesarData = []');
L.push('');

// ========== ANGGARAN ==========
function extractBudgetSheet(wb, sheetName, category) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const data = [];
  
  for (let i = 4; i < raw.length; i++) {
    const r = raw[i];
    // We expect Anggaran in col 6, Target in col 7, etc. (based on index analysis)
    const name = String(r[3] || '').trim();
    const anggaran = Number(r[6]) || 0;
    const sdIni = Number(r[10]) || 0;
    
    if (!name || (anggaran === 0 && sdIni === 0)) continue;
    if (name.toLowerCase().includes('ttd') || name.toLowerCase().includes('direktur')) continue;

    data.push({
      kode: String(r[1] || r[2] || '').trim(),
      nama: name,
      kategori: category,
      anggaran_awal: anggaran,
      target_bulan: Number(r[7]) || 0,
      sd_bln_lalu: Number(r[8]) || 0,
      bulan_ini: Number(r[9]) || 0,
      realisasi: sdIni,
      sisa: anggaran - sdIni,
      persentase: Number(r[11]) || 0,
      is_total: name.toUpperCase().includes('JUMLAH') || name.toUpperCase().includes('TOTAL') ? 1 : 0
    });
  }
  return data;
}

const anggaranCategories = {
  penerimaan: extractBudgetSheet(wbApr, 'Penerimaan', 'penerimaan'),
  bebanInvestasi: extractBudgetSheet(wbApr, 'Beban Investasi', 'bebanInvestasi'),
  bebanUmum: extractBudgetSheet(wbApr, 'Beban Umum', 'bebanUmum'),
  bebanOperasional: extractBudgetSheet(wbApr, 'Beban Operasional ', 'bebanOperasional')
};

// Combine for flat table if needed
const allAnggaran = [
  ...anggaranCategories.penerimaan,
  ...anggaranCategories.bebanInvestasi,
  ...anggaranCategories.bebanUmum,
  ...anggaranCategories.bebanOperasional
];

L.push('// ===== ASET TETAP DATA =====');
L.push('export const asetTetapData = ' + JSON.stringify(assets, null, 2));
L.push('');

L.push('export const persediaanData = [');
L.push("  { kode: 'INV-001', nama: 'Solar (Liter)', satuan: 'Liter', stokAwal: 2500, masuk: 500, keluar: 380, stokAkhir: 2620, hargaSatuan: 7500, nilaiTotal: 19650000 },");
L.push("  { kode: 'INV-002', nama: 'Kunci Kios Cadangan', satuan: 'Unit', stokAwal: 50, masuk: 20, keluar: 8, stokAkhir: 62, hargaSatuan: 45000, nilaiTotal: 2790000 },");
L.push("  { kode: 'INV-003', nama: 'Lampu LED 18W', satuan: 'Unit', stokAwal: 120, masuk: 50, keluar: 35, stokAkhir: 135, hargaSatuan: 32000, nilaiTotal: 4320000 },");
L.push(']');
L.push('');

const labaBersihApr = totalPendApr + totalBebApr;
L.push('// ===== LAPORAN KPI =====');
L.push('export const laporanKPIs = [');
L.push("  { label: 'Total Pendapatan', value: '" + Number(totalPendApr).toLocaleString('id-ID') + "', trend: '-', direction: 'up', vs: 'Apr 2026', color: 'green' },");
L.push("  { label: 'Total Beban', value: '" + Number(-totalBebApr).toLocaleString('id-ID') + "', trend: '-', direction: 'down', vs: 'Apr 2026', color: 'red' },");
L.push("  { label: 'Laba Bersih', value: '" + Number(labaBersihApr).toLocaleString('id-ID') + "', trend: '-', direction: '" + (labaBersihApr >= 0 ? 'up' : 'down') + "', vs: 'Apr 2026', color: '" + (labaBersihApr >= 0 ? 'green' : 'red') + "' },");
L.push("  { label: 'Total Aset', value: '" + Number(2838656749.03).toLocaleString('id-ID') + "', trend: '-', direction: 'up', vs: 'Apr 2026', color: 'blue' },");
L.push(']');
L.push('');
L.push('export const anggaranCategories = ' + JSON.stringify(anggaranCategories, null, 2));
L.push('export const anggaranData = ' + JSON.stringify(allAnggaran, null, 2));
L.push('');

L.push('export const rekonsiliasiData = {');
L.push('  saldoBank: ' + (saldoAwal['11103'] ? saldoAwal['11103'].saldoAwal : 0) + ',');
L.push('  saldoBuku: ' + ((saldoAwal['11103'] ? saldoAwal['11103'].saldoAwal : 0) - 5400000) + ',');
L.push('  selisih: 5400000,');
L.push('  items: [');
L.push("    { tanggal: '2026-04-25', keterangan: 'Transfer masuk belum tercatat', ref: 'CR-0425', jumlah: 3200000, tipe: 'bank' },");
L.push("    { tanggal: '2026-04-27', keterangan: 'Cek belum cair', ref: 'CK-4521', jumlah: -1800000, tipe: 'buku' },");
L.push("    { tanggal: '2026-04-28', keterangan: 'Biaya admin bank', ref: 'BA-0428', jumlah: -150000, tipe: 'bank' },");
L.push("    { tanggal: '2026-04-30', keterangan: 'Bunga deposito', ref: 'INT-0430', jumlah: 4150000, tipe: 'bank' },");
L.push('  ]');
L.push('}');
L.push('');

L.push('export const formatRupiah = (num) => {');
L.push("  if (num === 0) return 'Rp 0'");
L.push('  const abs = Math.abs(num)');
L.push("  const formatted = abs.toLocaleString('id-ID')");
L.push("  return `${num < 0 ? '-' : ''}Rp ${formatted}`");
L.push('}');
L.push('');

L.push('// ===== PERIOD DEFINITIONS =====');
L.push('export const PERIOD_OPTIONS = [');
L.push("  { value: 'jan', label: 'Januari', months: [1] },");
L.push("  { value: 'feb', label: 'Februari', months: [2] },");
L.push("  { value: 'mar', label: 'Maret', months: [3] },");
L.push("  { value: 'apr', label: 'April', months: [4] },");
L.push("  { value: 'mei', label: 'Mei', months: [5] },");
L.push("  { value: 'jun', label: 'Juni', months: [6] },");
L.push("  { value: 'tw1', label: 'Triwulan I (Jan-Mar)', months: [1,2,3] },");
L.push("  { value: 'tw2', label: 'Triwulan II (Apr-Jun)', months: [4,5,6] },");
L.push("  { value: 's1', label: 'Semester I (Jan-Jun)', months: [1,2,3,4,5,6] },");
L.push("  { value: 'tahun', label: 'Laporan Tahunan', months: [1,2,3,4,5,6,7,8,9,10,11,12] },");
L.push(']');

fs.writeFileSync(path.join(__dirname, 'src/data/sampleData.js'), L.join('\n'));

// Also write JSON for server-side seeding
const jsonOutput = {
  journals: combinedJournals,
  coa: coaAccounts,
  assets: assets,
  anggaran: allAnggaran,
  rekonsiliasi: [],
  pengaturan: {
    namaPerusahaan: 'Perumda Pasar Baiman',
    npwp: '01.234.567.8-901.000',
    kota: 'Banjarmasin'
  }
};

fs.writeFileSync(path.join(__dirname, 'src/data/sampleData.json'), JSON.stringify(jsonOutput, null, 2));

console.log('\nDone! Journals: ' + combinedJournals.length + ' | Assets: ' + assets.length);
console.log('JSON data written to src/data/sampleData.json');
console.log('\n=== Jan first 3 ===');
janJournals.slice(0,3).forEach(j => console.log(j.id, j.tanggal, j.akun_debit.split(' ')[0], j.debit, j.akun_kredit.split(' ')[0], j.kredit, j.keterangan.substring(0,30)));
console.log('\n=== Apr first 5 ===');
aprJournals.slice(0,5).forEach(j => console.log(j.id, j.tanggal, j.akun_debit.split(' ')[0], j.debit, j.akun_kredit.split(' ')[0], j.kredit, j.keterangan.substring(0,30)));
console.log('\n=== Last 3 combined ===');
combinedJournals.slice(-3).forEach(j => console.log(j.id, j.tanggal, j.akun_debit.split(' ')[0], j.debit, j.akun_kredit.split(' ')[0], j.kredit, j.keterangan.substring(0,30)));