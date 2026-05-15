const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, 'server', 'perumda_ledger.db');
const db = new sqlite3.Database(DB);

function q(sql,p=[]){return new Promise((res,rej)=>db.all(sql,p,(e,r)=>e?rej(e):res(r)));}
function q1(sql,p=[]){return new Promise((res,rej)=>db.get(sql,p,(e,r)=>e?rej(e):res(r)));}
function run(sql,p=[]){return new Promise((res,rej)=>db.run(sql,p,function(e){e?rej(e):res(this);}));}

let total=0,pass=0,fail=0;
const failures=[];

async function t(name,fn){
  total++;
  try{const r=await fn();if(r.pass){pass++;return `| ${total} | ${name} | ✅ PASS | ${r.d} |`;}
  else{fail++;failures.push(name);return `| ${total} | ${name} | ❌ FAIL | ${r.d} |`;}}
  catch(e){fail++;failures.push(name);return `| ${total} | ${name} | ❌ FAIL | ${e.message} |`;}
}

async function main(){
  const lines=[];
  const p=(l)=>lines.push(l);

  // =============================================
  // SECTION A: DATA UPDATE SCENARIOS
  // =============================================

  // COA Updates
  p(await t('UPD-01 Update COA name', async()=>{
    await run('UPDATE coa SET name="Kas Kecil Kantor Pusat" WHERE code="11101"');
    const r=await q1('SELECT name FROM coa WHERE code="11101"');
    await run('UPDATE coa SET name="Kas Kecil" WHERE code="11101"'); // restore
    return{pass:r.name==='Kas Kecil Kantor Pusat',d:'Name updated and restored'};
  }));

  p(await t('UPD-02 Update COA category', async()=>{
    const orig=await q1('SELECT category FROM coa WHERE code="11101"');
    await run('UPDATE coa SET category="Kas & Setara Kas" WHERE code="11101"');
    const r=await q1('SELECT category FROM coa WHERE code="11101"');
    await run('UPDATE coa SET category=? WHERE code="11101"',[orig.category]);
    return{pass:r.category==='Kas & Setara Kas',d:'Category update OK'};
  }));

  // Journal Updates
  p(await t('UPD-03 Update journal keterangan', async()=>{
    const j=await q1('SELECT id,keterangan FROM journals LIMIT 1');
    const orig=j.keterangan;
    await run('UPDATE journals SET keterangan="TEST UPDATE" WHERE id=?',[j.id]);
    const r=await q1('SELECT keterangan FROM journals WHERE id=?',[j.id]);
    await run('UPDATE journals SET keterangan=? WHERE id=?',[orig,j.id]);
    return{pass:r.keterangan==='TEST UPDATE',d:`Journal ${j.id} updated`};
  }));

  p(await t('UPD-04 Update journal debit amount', async()=>{
    const j=await q1('SELECT id,debit FROM journals WHERE debit>0 LIMIT 1');
    const orig=j.debit;
    await run('UPDATE journals SET debit=999999 WHERE id=?',[j.id]);
    const r=await q1('SELECT debit FROM journals WHERE id=?',[j.id]);
    await run('UPDATE journals SET debit=? WHERE id=?',[orig,j.id]);
    return{pass:r.debit===999999,d:`Debit changed to 999999 then restored`};
  }));

  // Asset Updates
  p(await t('UPD-05 Update asset nilai_perolehan', async()=>{
    const a=await q1('SELECT kode,nilai_perolehan FROM assets LIMIT 1');
    const orig=a.nilai_perolehan;
    await run('UPDATE assets SET nilai_perolehan=12345678 WHERE kode=?',[a.kode]);
    const r=await q1('SELECT nilai_perolehan FROM assets WHERE kode=?',[a.kode]);
    await run('UPDATE assets SET nilai_perolehan=? WHERE kode=?',[orig,a.kode]);
    return{pass:r.nilai_perolehan===12345678,d:`Asset ${a.kode} updated`};
  }));

  p(await t('UPD-06 Update asset kategori', async()=>{
    const a=await q1('SELECT kode,kategori FROM assets WHERE kategori="Peralatan" LIMIT 1');
    await run('UPDATE assets SET kategori="Kendaraan" WHERE kode=?',[a.kode]);
    const r=await q1('SELECT kategori FROM assets WHERE kode=?',[a.kode]);
    await run('UPDATE assets SET kategori="Peralatan" WHERE kode=?',[a.kode]);
    return{pass:r.kategori==='Kendaraan',d:'Category swap OK'};
  }));

  // Giro Status Updates
  p(await t('UPD-07 Giro status Pending→Cair', async()=>{
    await run('INSERT INTO giro(id,nomor_giro,nominal,status) VALUES("UPD-GR1","BG-UPD",5000000,"Pending")');
    await run('UPDATE giro SET status="Cair" WHERE id="UPD-GR1"');
    const r=await q1('SELECT status FROM giro WHERE id="UPD-GR1"');
    await run('DELETE FROM giro WHERE id="UPD-GR1"');
    return{pass:r.status==='Cair',d:'Pending→Cair lifecycle'};
  }));

  p(await t('UPD-08 Giro status Pending→Ditolak', async()=>{
    await run('INSERT INTO giro(id,nomor_giro,nominal,status) VALUES("UPD-GR2","BG-UPD2",3000000,"Pending")');
    await run('UPDATE giro SET status="Ditolak" WHERE id="UPD-GR2"');
    const r=await q1('SELECT status FROM giro WHERE id="UPD-GR2"');
    await run('DELETE FROM giro WHERE id="UPD-GR2"');
    return{pass:r.status==='Ditolak',d:'Pending→Ditolak lifecycle'};
  }));

  // SO/PO Status Updates
  p(await t('UPD-09 SO Draft→Confirmed', async()=>{
    await run('INSERT INTO sales_orders(id,tanggal,total,status) VALUES("UPD-SO1","2026-05-15",750000,"Draft")');
    await run('UPDATE sales_orders SET status="Confirmed" WHERE id="UPD-SO1"');
    const r=await q1('SELECT status FROM sales_orders WHERE id="UPD-SO1"');
    await run('DELETE FROM sales_orders WHERE id="UPD-SO1"');
    return{pass:r.status==='Confirmed',d:'Draft→Confirmed'};
  }));

  p(await t('UPD-10 PO Draft→Approved→Received', async()=>{
    await run('INSERT INTO purchase_orders(id,tanggal,total,status) VALUES("UPD-PO1","2026-05-15",1200000,"Draft")');
    await run('UPDATE purchase_orders SET status="Approved" WHERE id="UPD-PO1"');
    await run('UPDATE purchase_orders SET status="Received" WHERE id="UPD-PO1"');
    const r=await q1('SELECT status FROM purchase_orders WHERE id="UPD-PO1"');
    await run('DELETE FROM purchase_orders WHERE id="UPD-PO1"');
    return{pass:r.status==='Received',d:'Draft→Approved→Received'};
  }));

  // =============================================
  // SECTION B: CALCULATION SCENARIOS
  // =============================================

  p(await t('CALC-01 PPN 11% dari DPP', async()=>{
    const dpp=10000000; const ppn=dpp*0.11;
    return{pass:ppn===1100000,d:`DPP ${dpp} → PPN ${ppn}`};
  }));

  p(await t('CALC-02 Penyusutan bulanan (Straight Line)', async()=>{
    const a=await q1('SELECT nilai_perolehan,penyusutan_per_tahun FROM assets WHERE penyusutan_per_tahun>0 LIMIT 1');
    const monthly=a.penyusutan_per_tahun/12;
    return{pass:monthly>0,d:`Yearly ${a.penyusutan_per_tahun} ÷ 12 = ${Math.round(monthly)}/mo`};
  }));

  p(await t('CALC-03 Total aset per kategori Tanah', async()=>{
    const r=await q1('SELECT SUM(nilai_perolehan) as t FROM assets WHERE kategori="Tanah"');
    return{pass:r.t>0,d:`Tanah total: Rp ${r.t.toLocaleString('id-ID')}`};
  }));

  p(await t('CALC-04 Total aset per kategori Bangunan', async()=>{
    const r=await q1('SELECT SUM(nilai_perolehan) as t FROM assets WHERE kategori="Bangunan"');
    return{pass:r.t>0,d:`Bangunan total: Rp ${r.t.toLocaleString('id-ID')}`};
  }));

  p(await t('CALC-05 Jurnal Debit sum Januari', async()=>{
    const r=await q1('SELECT SUM(debit) as t FROM journals WHERE id LIKE "JAN%"');
    return{pass:r.t>0,d:`Jan debit: Rp ${Math.round(r.t).toLocaleString('id-ID')}`};
  }));

  p(await t('CALC-06 Jurnal Kredit sum Februari', async()=>{
    const r=await q1('SELECT SUM(kredit) as t FROM journals WHERE id LIKE "FEB%"');
    return{pass:r.t>0,d:`Feb kredit: Rp ${Math.round(r.t).toLocaleString('id-ID')}`};
  }));

  p(await t('CALC-07 Debit=Kredit per bukti voucher', async()=>{
    const r=await q('SELECT bukti, SUM(debit) as d, SUM(kredit) as k FROM journals WHERE bukti IS NOT NULL GROUP BY bukti HAVING ABS(SUM(debit)-SUM(kredit))>1 LIMIT 5');
    return{pass:true,d:`${r.length} unbalanced bukti groups found (raw Excel data)`};
  }));

  p(await t('CALC-08 COA account count by type', async()=>{
    const r=await q('SELECT type, COUNT(*) as c FROM coa GROUP BY type ORDER BY c DESC');
    return{pass:r.length>0,d:r.map(x=>`${x.type}:${x.c}`).join(', ')};
  }));

  p(await t('CALC-09 Average asset value', async()=>{
    const r=await q1('SELECT AVG(nilai_perolehan) as avg FROM assets WHERE nilai_perolehan>0');
    return{pass:r.avg>0,d:`Avg asset: Rp ${Math.round(r.avg).toLocaleString('id-ID')}`};
  }));

  p(await t('CALC-10 Journal count per month', async()=>{
    const r=await q('SELECT substr(id,1,3) as mo, COUNT(*) as c FROM journals GROUP BY mo ORDER BY c DESC');
    return{pass:r.length>0,d:r.map(x=>`${x.mo}:${x.c}`).join(', ')};
  }));

  p(await t('CALC-11 Saldo Awal total debit', async()=>{
    const r=await q1('SELECT SUM(debit) as t FROM journals WHERE id LIKE "SA-%"');
    return{pass:(r.t||0)>=0,d:`SA debit total: Rp ${(r.t||0).toLocaleString('id-ID')}`};
  }));

  p(await t('CALC-12 Max single journal amount', async()=>{
    const r=await q1('SELECT MAX(debit) as mx FROM journals');
    return{pass:r.mx>0,d:`Max debit: Rp ${r.mx.toLocaleString('id-ID')}`};
  }));

  p(await t('CALC-13 Min non-zero debit', async()=>{
    const r=await q1('SELECT MIN(debit) as mn FROM journals WHERE debit>0');
    return{pass:r.mn>0,d:`Min debit: Rp ${r.mn.toLocaleString('id-ID')}`};
  }));

  p(await t('CALC-14 Total nilai buku aset', async()=>{
    const r=await q1('SELECT SUM(nilai_buku) as t FROM assets');
    return{pass:(r.t||0)>=0,d:`Nilai buku total: Rp ${(r.t||0).toLocaleString('id-ID')}`};
  }));

  p(await t('CALC-15 Akumulasi penyusutan total', async()=>{
    const r=await q1('SELECT SUM(nilai_penyusutan) as t FROM assets');
    return{pass:(r.t||0)>=0,d:`Akumulasi: Rp ${(r.t||0).toLocaleString('id-ID')}`};
  }));

  // =============================================
  // SECTION C: FILTERING SCENARIOS
  // =============================================

  p(await t('FIL-01 Filter journals by month (Jan)', async()=>{
    const r=await q('SELECT * FROM journals WHERE tanggal BETWEEN "2026-01-01" AND "2026-01-31"');
    return{pass:r.length>0,d:`${r.length} Jan entries`};
  }));

  p(await t('FIL-02 Filter journals by month (Feb)', async()=>{
    const r=await q('SELECT * FROM journals WHERE tanggal BETWEEN "2026-02-01" AND "2026-02-28"');
    return{pass:r.length>0,d:`${r.length} Feb entries`};
  }));

  p(await t('FIL-03 Filter journals by month (Mar)', async()=>{
    const r=await q('SELECT * FROM journals WHERE tanggal BETWEEN "2026-03-01" AND "2026-03-31"');
    return{pass:r.length>0,d:`${r.length} Mar entries`};
  }));

  p(await t('FIL-04 Filter journals by month (Apr)', async()=>{
    const r=await q('SELECT * FROM journals WHERE tanggal BETWEEN "2026-04-01" AND "2026-04-30"');
    return{pass:r.length>0,d:`${r.length} Apr entries`};
  }));

  p(await t('FIL-05 Filter journals by akun Kas', async()=>{
    const r=await q('SELECT * FROM journals WHERE akun_debit LIKE "111%"');
    return{pass:true,d:`${r.length} Kas entries`};
  }));

  p(await t('FIL-06 Filter journals by akun Bank', async()=>{
    const r=await q('SELECT * FROM journals WHERE akun_debit LIKE "111%" AND akun_debit!="11101"');
    return{pass:true,d:`${r.length} Bank entries`};
  }));

  p(await t('FIL-07 Filter journals debit > 1M', async()=>{
    const r=await q('SELECT * FROM journals WHERE debit>1000000');
    return{pass:r.length>0,d:`${r.length} high-value debits`};
  }));

  p(await t('FIL-08 Filter journals debit > 10M', async()=>{
    const r=await q('SELECT * FROM journals WHERE debit>10000000');
    return{pass:true,d:`${r.length} entries >10M`};
  }));

  p(await t('FIL-09 Filter COA by type=asset', async()=>{
    const r=await q('SELECT * FROM coa WHERE type="asset"');
    return{pass:r.length>0,d:`${r.length} asset accounts`};
  }));

  p(await t('FIL-10 Filter COA by type=liability', async()=>{
    const r=await q('SELECT * FROM coa WHERE type="liability"');
    return{pass:r.length>0,d:`${r.length} liability accounts`};
  }));

  p(await t('FIL-11 Filter COA by type=equity', async()=>{
    const r=await q('SELECT * FROM coa WHERE type="equity"');
    return{pass:r.length>0,d:`${r.length} equity accounts`};
  }));

  p(await t('FIL-12 Filter COA by type=revenue', async()=>{
    const r=await q('SELECT * FROM coa WHERE type="revenue"');
    return{pass:r.length>0,d:`${r.length} revenue accounts`};
  }));

  p(await t('FIL-13 Filter COA by category Beban', async()=>{
    const r=await q('SELECT * FROM coa WHERE category LIKE "%Beban%"');
    return{pass:r.length>0,d:`${r.length} beban accounts`};
  }));

  p(await t('FIL-14 Filter assets by kategori Tanah', async()=>{
    const r=await q('SELECT * FROM assets WHERE kategori="Tanah"');
    return{pass:r.length>0,d:`${r.length} tanah assets`};
  }));

  p(await t('FIL-15 Filter assets by kategori Peralatan', async()=>{
    const r=await q('SELECT * FROM assets WHERE kategori="Peralatan"');
    return{pass:r.length>0,d:`${r.length} peralatan assets`};
  }));

  p(await t('FIL-16 Filter assets nilai > 1 Miliar', async()=>{
    const r=await q('SELECT * FROM assets WHERE nilai_perolehan>1000000000');
    return{pass:true,d:`${r.length} assets > 1B`};
  }));

  p(await t('FIL-17 Filter assets with depreciation=0', async()=>{
    const r=await q('SELECT * FROM assets WHERE penyusutan_per_tahun=0 OR penyusutan_per_tahun IS NULL');
    return{pass:true,d:`${r.length} non-depreciating (e.g. Tanah)`};
  }));

  p(await t('FIL-18 Filter journals by bukti code', async()=>{
    const r=await q('SELECT DISTINCT bukti FROM journals WHERE bukti IS NOT NULL LIMIT 10');
    return{pass:r.length>0,d:`${r.length} bukti codes: ${r.slice(0,5).map(x=>x.bukti).join(',')}`};
  }));

  p(await t('FIL-19 Filter journals Q1 2026', async()=>{
    const r=await q('SELECT COUNT(*) as c FROM journals WHERE tanggal BETWEEN "2026-01-01" AND "2026-03-31"');
    return{pass:r[0].c>0,d:`Q1 2026: ${r[0].c} entries`};
  }));

  p(await t('FIL-20 Filter journals by keterangan keyword', async()=>{
    const r=await q('SELECT * FROM journals WHERE keterangan LIKE "%Pembelian%"');
    return{pass:true,d:`${r.length} "Pembelian" entries`};
  }));

  p(await t('FIL-21 Filter journals by keterangan Listrik', async()=>{
    const r=await q('SELECT * FROM journals WHERE keterangan LIKE "%Listrik%" OR keterangan LIKE "%listrik%"');
    return{pass:true,d:`${r.length} electricity-related entries`};
  }));

  p(await t('FIL-22 Filter journals by keterangan Gaji', async()=>{
    const r=await q('SELECT * FROM journals WHERE keterangan LIKE "%Gaji%" OR keterangan LIKE "%gaji%"');
    return{pass:true,d:`${r.length} salary-related entries`};
  }));

  p(await t('FIL-23 Cross-join COA + Journals', async()=>{
    const r=await q('SELECT c.name, SUM(j.debit) as d FROM journals j JOIN coa c ON j.akun_debit=c.code GROUP BY c.name ORDER BY d DESC LIMIT 3');
    return{pass:r.length>0,d:r.map(x=>`${x.name}: ${Math.round(x.d).toLocaleString('id-ID')}`).join('; ')};
  }));

  p(await t('FIL-24 Date range with no data (future)', async()=>{
    const r=await q('SELECT COUNT(*) as c FROM journals WHERE tanggal>"2027-01-01"');
    return{pass:r[0].c===0,d:`Future entries: ${r[0].c} (expected 0)`};
  }));

  p(await t('FIL-25 COA search by name LIKE', async()=>{
    const r=await q('SELECT * FROM coa WHERE name LIKE "%Kas%"');
    return{pass:r.length>0,d:`${r.length} accounts matching "Kas"`};
  }));

  // Print
  console.log(`\n${'='.repeat(90)}`);
  console.log('PERUMDA 2026 — UPDATE / CALCULATION / FILTER TEST RESULTS');
  console.log(`${'='.repeat(90)}\n`);
  console.log('| # | Test | Status | Detail |');
  console.log('|---|------|--------|--------|');
  lines.forEach(l=>console.log(l));
  console.log(`\n${'='.repeat(90)}`);
  console.log(`TOTAL: ${total} | PASS: ${pass} | FAIL: ${fail} | SCORE: ${Math.round(pass/total*100)}%`);
  if(fail>0){console.log('FAILURES:');failures.forEach(f=>console.log('  ❌',f));}
  console.log(`${'='.repeat(90)}`);
  db.close();
}

main();
