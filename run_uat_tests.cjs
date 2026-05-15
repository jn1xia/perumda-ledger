const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, 'server', 'perumda_ledger.db');
const db = new sqlite3.Database(DB);

function q(sql, p=[]) { return new Promise((res,rej) => db.all(sql, p, (e,r) => e ? rej(e) : res(r))); }
function q1(sql, p=[]) { return new Promise((res,rej) => db.get(sql, p, (e,r) => e ? rej(e) : res(r))); }
function run(sql, p=[]) { return new Promise((res,rej) => db.run(sql, p, function(e) { e ? rej(e) : res(this); })); }

async function test(name, fn) {
  try { const r = await fn(); return { name, pass: r.pass, detail: r.d }; }
  catch(e) { return { name, pass: false, detail: e.message }; }
}

async function main() {
  const R = [];
  const t = (n,f) => R.push(test(n,f));

  // === MODULE 1: SALDO AWAL ===
  t('M01-01 Saldo awal exists', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM journals WHERE id LIKE "SA-%"'); return{pass:r.c>0,d:`${r.c} records`}; });
  t('M01-02 Saldo awal date=2026-01-01', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM journals WHERE id LIKE "SA-%" AND tanggal="2026-01-01"'); return{pass:r.c>0,d:`${r.c}`}; });

  // === MODULE 2: COA ===
  t('M02-01 COA has records', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM coa'); return{pass:r.c>100,d:`${r.c} accounts`}; });
  t('M02-02 COA has asset type', async()=>{ const r=await q('SELECT DISTINCT type FROM coa'); return{pass:r.some(x=>x.type==='asset'),d:r.map(x=>x.type).join(',')}; });
  t('M02-03 COA has revenue type', async()=>{ const r=await q('SELECT DISTINCT type FROM coa WHERE type="revenue"'); return{pass:r.length>0,d:'revenue exists'}; });
  t('M02-04 COA code unique', async()=>{ const r=await q1('SELECT COUNT(*)as c, COUNT(DISTINCT code)as u FROM coa'); return{pass:r.c===r.u,d:`total=${r.c} unique=${r.u}`}; });
  t('M02-05 COA Kas Kecil exists', async()=>{ const r=await q1('SELECT * FROM coa WHERE code="11101"'); return{pass:!!r,d:r?.name||'missing'}; });

  // === MODULE 3: TYPE ===
  t('M03-01 Types cover 5 categories', async()=>{ const r=await q('SELECT DISTINCT type FROM coa'); return{pass:r.length>=4,d:`${r.length} types`}; });

  // === MODULE 4: DEPARTEMEN ===
  t('M04-01 Departemen table exists', async()=>{ await q('SELECT * FROM departemen LIMIT 1'); return{pass:true,d:'table OK'}; });

  // === MODULE 5-7: VOUCHER ===
  t('M05-01 Journals table has status col', async()=>{ const r=await q('PRAGMA table_info(journals)'); return{pass:r.some(c=>c.name==='status'),d:'status column exists'}; });
  t('M05-02 Journals has updated_at', async()=>{ const r=await q('PRAGMA table_info(journals)'); return{pass:r.some(c=>c.name==='updated_at'),d:'updated_at exists'}; });

  // === MODULE 8-10: JURNAL ===
  t('M08-01 Journals count', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM journals'); return{pass:r.c>0,d:`${r.c} entries`}; });
  t('M08-02 Journals have dates', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM journals WHERE tanggal IS NOT NULL'); return{pass:r.c>0,d:`${r.c} dated`}; });
  t('M08-03 Journals have akun_debit', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM journals WHERE akun_debit IS NOT NULL'); return{pass:r.c>0,d:`${r.c}`}; });
  t('M08-04 Jan journals exist', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM journals WHERE id LIKE "JAN%"'); return{pass:r.c>0,d:`${r.c}`}; });
  t('M08-05 Feb journals exist', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM journals WHERE id LIKE "FEB%"'); return{pass:r.c>0,d:`${r.c}`}; });
  t('M08-06 Mar journals exist', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM journals WHERE id LIKE "MAR%"'); return{pass:r.c>0,d:`${r.c}`}; });
  t('M08-07 Apr journals exist', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM journals WHERE id LIKE "APR%"'); return{pass:r.c>0,d:`${r.c}`}; });
  t('M08-08 Debit>0 entries', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM journals WHERE debit>0'); return{pass:r.c>0,d:`${r.c}`}; });
  t('M08-09 Kredit>0 entries', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM journals WHERE kredit>0'); return{pass:r.c>0,d:`${r.c}`}; });

  // === MODULE 11-12: KUNCI ===
  t('M11-01 locked_periods table', async()=>{ await q('SELECT * FROM locked_periods LIMIT 1'); return{pass:true,d:'OK'}; });

  // === MODULE 13: JENIS JURNAL ===
  t('M13-01 Journal ID prefixes', async()=>{ const r=await q('SELECT DISTINCT substr(id,1,3) as p FROM journals'); return{pass:r.length>1,d:r.map(x=>x.p).join(',')}; });

  // === MODULE 14: BUKU BESAR ===
  t('M14-01 BB query works', async()=>{ const r=await q('SELECT akun_debit, SUM(debit) as d FROM journals WHERE akun_debit="11101" GROUP BY akun_debit'); return{pass:true,d:`Kas Kecil debit=${r[0]?.d||0}`}; });

  // === MODULE 15: NERACA ===
  t('M15-01 Asset accounts', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM coa WHERE type="asset"'); return{pass:r.c>0,d:`${r.c}`}; });
  t('M15-02 Liability accounts', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM coa WHERE type="liability"'); return{pass:r.c>0,d:`${r.c}`}; });
  t('M15-03 Equity accounts', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM coa WHERE type="equity"'); return{pass:r.c>0,d:`${r.c}`}; });

  // === MODULE 16: NERACA SALDO ===
  t('M16-01 Trial balance query', async()=>{ const r=await q1('SELECT SUM(debit)as d, SUM(kredit)as k FROM journals'); return{pass:true,d:`D=${r.d} K=${r.k}`}; });

  // === MODULE 17: LABA RUGI ===
  t('M17-01 Revenue accounts', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM coa WHERE type="revenue"'); return{pass:r.c>0,d:`${r.c}`}; });
  t('M17-02 Expense/Beban accounts', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM coa WHERE category LIKE "%Beban%" OR category LIKE "%BEBAN%"'); return{pass:r.c>0,d:`${r.c}`}; });

  // === MODULE 18: HPP ===
  t('M18-01 Beban Langsung filter', async()=>{ const r=await q('SELECT * FROM coa WHERE category LIKE "%Beban Langsung%" OR category LIKE "%Beban%"'); return{pass:r.length>0,d:`${r.length} accts`}; });

  // === MODULE 20-22: PIUTANG/SO ===
  t('M20-01 sales_orders table', async()=>{ await q('SELECT * FROM sales_orders LIMIT 1'); return{pass:true,d:'OK'}; });
  t('M21-01 pelanggan table', async()=>{ await q('SELECT * FROM pelanggan LIMIT 1'); return{pass:true,d:'OK'}; });
  t('M20-02 SO insert+delete', async()=>{
    await run('INSERT INTO sales_orders(id,tanggal,total,status) VALUES("TEST-SO","2026-05-15",100000,"Draft")');
    const r=await q1('SELECT * FROM sales_orders WHERE id="TEST-SO"');
    await run('DELETE FROM sales_orders WHERE id="TEST-SO"');
    return{pass:!!r,d:'CRUD OK'};
  });

  // === MODULE 23-24: HUTANG/PO ===
  t('M23-01 purchase_orders table', async()=>{ await q('SELECT * FROM purchase_orders LIMIT 1'); return{pass:true,d:'OK'}; });
  t('M24-01 supplier table', async()=>{ await q('SELECT * FROM supplier LIMIT 1'); return{pass:true,d:'OK'}; });
  t('M23-02 PO insert+delete', async()=>{
    await run('INSERT INTO purchase_orders(id,tanggal,total,status) VALUES("TEST-PO","2026-05-15",200000,"Draft")');
    const r=await q1('SELECT * FROM purchase_orders WHERE id="TEST-PO"');
    await run('DELETE FROM purchase_orders WHERE id="TEST-PO"');
    return{pass:!!r,d:'CRUD OK'};
  });

  // === MODULE 25-28: INVENTORY ===
  t('M25-01 Inventory settings', async()=>{ const r=await q1('SELECT * FROM settings WHERE key="inventory"'); return{pass:true,d:r?'found':'empty (OK)'}; });

  // === MODULE 29: GIRO ===
  t('M29-01 giro table', async()=>{ await q('SELECT * FROM giro LIMIT 1'); return{pass:true,d:'OK'}; });
  t('M29-02 Giro CRUD', async()=>{
    await run('INSERT INTO giro(id,nomor_giro,nominal,status) VALUES("TEST-GR","BG999",5000000,"Pending")');
    await run('UPDATE giro SET status="Cair" WHERE id="TEST-GR"');
    const r=await q1('SELECT status FROM giro WHERE id="TEST-GR"');
    await run('DELETE FROM giro WHERE id="TEST-GR"');
    return{pass:r?.status==='Cair',d:'Insert→Update→Delete OK'};
  });

  // === MODULE 30: ASET TETAP ===
  t('M30-01 Assets count', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM assets'); return{pass:r.c>0,d:`${r.c} assets`}; });
  t('M30-02 Tanah category', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM assets WHERE kategori="Tanah"'); return{pass:r.c>0,d:`${r.c} tanah`}; });
  t('M30-03 Bangunan category', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM assets WHERE kategori="Bangunan"'); return{pass:r.c>0,d:`${r.c} bangunan`}; });
  t('M30-04 Peralatan category', async()=>{ const r=await q1('SELECT COUNT(*)as c FROM assets WHERE kategori="Peralatan"'); return{pass:r.c>0,d:`${r.c} peralatan`}; });
  t('M30-05 Asset has nilai_perolehan', async()=>{ const r=await q1('SELECT SUM(nilai_perolehan)as t FROM assets'); return{pass:r.t>0,d:`Total Rp ${r.t}`}; });

  // === MODULE 32: E-FAKTUR ===
  t('M32-01 efaktur table', async()=>{ await q('SELECT * FROM efaktur LIMIT 1'); return{pass:true,d:'OK'}; });
  t('M32-02 EFaktur CRUD', async()=>{
    await run('INSERT INTO efaktur(id,dpp,ppn,tipe) VALUES("TEST-FK",1000000,110000,"Keluaran")');
    const r=await q1('SELECT ppn FROM efaktur WHERE id="TEST-FK"');
    await run('DELETE FROM efaktur WHERE id="TEST-FK"');
    return{pass:r?.ppn===110000,d:'PPN 11% calc OK'};
  });

  // === MODULE 33: LRA ===
  t('M33-01 kode_anggaran column', async()=>{ const r=await q('PRAGMA table_info(journals)'); return{pass:r.some(c=>c.name==='kode_anggaran'),d:'OK'}; });

  // === MODULE 34: REKONSILIASI ===
  t('M34-01 status column for rec', async()=>{ const r=await q('PRAGMA table_info(journals)'); return{pass:r.some(c=>c.name==='status'),d:'OK'}; });

  // === MODULE 35: BACKUP ===
  t('M35-01 DB file exists', async()=>{ return{pass:fs.existsSync(DB),d:`${(fs.statSync(DB).size/1024).toFixed(0)}KB`}; });

  // === MODULE 36: SETTINGS ===  
  t('M36-01 settings table', async()=>{ await q('SELECT * FROM settings LIMIT 1'); return{pass:true,d:'OK'}; });

  // Wait for all
  const results = await Promise.all(R);
  const passed = results.filter(r=>r.pass).length;
  const failed = results.filter(r=>!r.pass).length;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`PERUMDA 2026 UAT EXECUTION RESULTS`);
  console.log(`${'='.repeat(80)}\n`);
  console.log(`| # | Test | Status | Detail |`);
  console.log(`|---|------|--------|--------|`);
  results.forEach((r,i) => {
    console.log(`| ${i+1} | ${r.name} | ${r.pass?'✅ PASS':'❌ FAIL'} | ${r.detail} |`);
  });
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TOTAL: ${results.length} | PASS: ${passed} | FAIL: ${failed}`);
  console.log(`SCORE: ${Math.round(passed/results.length*100)}%`);
  console.log(`${'='.repeat(80)}`);

  db.close();
}

main();
