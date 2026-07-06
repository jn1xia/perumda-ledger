#!/usr/bin/env node
// Compare PRODUCTION (Fly) journal-computed reports vs Excel-snapshot (ref-*) reports,
// per month. Flags reports whose journal-derived totals don't match the Excel snapshot.
const https = require('https');
const BASE = 'https://perumda-ledger-scs9va.fly.dev';
const PERIODS = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'];

function get(pathname) {
  return new Promise((resolve, reject) => {
    https.get(BASE + pathname, { headers: { 'X-User-Role': 'admin' } }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json from ' + pathname + ': ' + d.slice(0,200))); } });
    }).on('error', reject);
  });
}

const fmt = n => (n === null || n === undefined) ? '       (none)' : Math.round(n).toLocaleString('id-ID');
const near = (a, b) => Math.abs((a||0) - (b||0)) < 1;

// pull a value out of a ref report by exact (trimmed, case-insensitive) label
function refVal(rows, label) {
  const want = label.toLowerCase().trim();
  const hit = rows.find(r => String(r.label||'').toLowerCase().trim() === want);
  return hit ? hit.value : undefined;
}
// pull first row whose label contains all given substrings
function refValContains(rows, ...subs) {
  const hit = rows.find(r => { const l = String(r.label||'').toLowerCase(); return subs.every(s => l.includes(s.toLowerCase())); });
  return hit ? hit.value : undefined;
}

(async () => {
  const results = [];
  for (const p of PERIODS) {
    const [neraca, rl, refN, refRL] = await Promise.all([
      get(`/api/reports/neraca?period=${p}`),
      get(`/api/reports/rugi-laba?period=${p}`),
      get(`/api/reports/ref-neraca?period=${p}`),
      get(`/api/reports/ref-laba-rugi?period=${p}`),
    ]);

    // computed (from journals)
    const cAset = neraca.totals.total_aset;
    const cKew  = neraca.totals.total_kewajiban;
    const cEku  = neraca.totals.total_ekuitas;
    const cPasiva = cKew + cEku;
    const cPend = rl.totals.total_pendapatan;
    const cBeban = rl.totals.total_beban + rl.totals.total_hpp;
    const cLaba = rl.totals.laba_bersih;

    // reference (from Excel snapshot)
    const rAset = refVal(refN, 'JUMLAH ASET');
    const rKew  = refVal(refN, 'JUMLAH KEWAJIBAN');
    const rEku  = refVal(refN, 'JUMLAH EKUITAS');
    const rPasiva = refValContains(refN, 'jumlah kewajiban dan ekuitas');
    const rPend = refVal(refRL, 'JUMLAH PENDAPATAN USAHA');
    const rLaba = refValContains(refRL, 'laba', 'bersih', 'setelah');

    results.push({ p,
      aset:[cAset,rAset], kew:[cKew,rKew], eku:[cEku,rEku], pasiva:[cPasiva,rPasiva],
      pend:[cPend,rPend], laba:[cLaba,rLaba],
      balancedComputed: neraca.totals.balanced });
  }

  const metrics = [
    ['NERACA  Total Aset', 'aset'],
    ['NERACA  Total Kewajiban', 'kew'],
    ['NERACA  Total Ekuitas', 'eku'],
    ['NERACA  Kewajiban+Ekuitas', 'pasiva'],
    ['L/R     Total Pendapatan', 'pend'],
    ['L/R     Laba Bersih', 'laba'],
  ];

  for (const r of results) {
    console.log('\n================ PERIOD ' + r.p + '  (computed neraca balanced=' + r.balancedComputed + ') ================');
    console.log('Metric                       | Journal-computed     | Excel snapshot (ref) | Match');
    console.log('-----------------------------|----------------------|----------------------|------');
    for (const [name, key] of metrics) {
      const [c, ref] = r[key];
      const m = (ref === undefined || ref === null) ? 'n/a' : (near(c, ref) ? 'OK' : 'DIFF');
      console.log(
        name.padEnd(28) + ' | ' +
        fmt(c).padStart(20) + ' | ' +
        fmt(ref).padStart(20) + ' | ' + m
      );
    }
  }

  // Summary of mismatches
  console.log('\n\n================ SUMMARY: reports that DO NOT match Excel ================');
  for (const r of results) {
    const bad = [];
    for (const [name, key] of metrics) {
      const [c, ref] = r[key];
      if (ref !== undefined && ref !== null && !near(c, ref)) {
        bad.push(name.trim() + ' (Δ ' + fmt((c||0)-(ref||0)) + ')');
      }
    }
    if (bad.length) console.log(r.p + ': ' + bad.join('; '));
    else console.log(r.p + ': all matched');
  }
})().catch(e => { console.error(e); process.exit(1); });
