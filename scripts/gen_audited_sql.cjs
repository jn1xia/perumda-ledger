/**
 * gen_audited_sql.cjs — emit SQL for one period's audited snapshot to stdout.
 * Parses the lampiran locally (so the constrained prod machine never loads XLSX)
 * and prints DELETE/INSERT statements + the JV->XL rebase, wrapped in a tx.
 *
 *   node scripts/gen_audited_sql.cjs 2026-06 > /tmp/juni.sql
 */
const path = require('path');
const XLSX = require('xlsx');
const ri = require('./import_report_data.cjs');

const period = String(process.argv[2] || '').trim();
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) { console.error('Usage: node scripts/gen_audited_sql.cjs YYYY-MM'); process.exit(1); }
const src = (ri.SOURCES || []).find(s => s.period === period);
if (!src) { console.error(`No source for ${period}`); process.exit(1); }
const bulan = parseInt(period.split('-')[1], 10);
const wb = XLSX.readFile(path.join(src.dir || ri.FILES_DIR, src.file));

const q = v => v == null ? 'NULL' : (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const out = [];
out.push('BEGIN TRANSACTION;');
out.push('PRAGMA defer_foreign_keys = ON;');
const xl = `XL-${period}-`;
out.push(`UPDATE journal_lines SET journal_id = '${xl}' || substr(journal_id, 9) WHERE journal_id LIKE 'JV-2026-%' AND substr(tanggal,1,7)='${period}';`);
out.push(`UPDATE journals SET id = '${xl}' || substr(id, 9) WHERE id LIKE 'JV-2026-%' AND substr(tanggal,1,7)='${period}';`);

const nWs = wb.Sheets[src.neracaSheet];
if (nWs) {
  out.push(`DELETE FROM report_neraca WHERE period='${period}';`);
  ri.parseNeraca(nWs).forEach(r =>
    out.push(`INSERT INTO report_neraca (period,sort_order,label,value,depth) VALUES ('${period}',${r.order},${q(r.label)},${q(r.value)},${r.depth});`));
}
const cWs = src.cfSheet && wb.Sheets[src.cfSheet];
if (cWs) {
  out.push(`DELETE FROM report_arus_kas WHERE period='${period}';`);
  ri.parseArusKas(cWs, src.cfValCol || 2).forEach(r =>
    out.push(`INSERT INTO report_arus_kas (period,sort_order,label,value,is_section) VALUES ('${period}',${r.order},${q(r.label)},${q(r.value)},${r.isSection ? 1 : 0});`));
}
const lWs = src.lrSheet && wb.Sheets[src.lrSheet];
if (lWs) {
  out.push(`DELETE FROM report_laba_rugi WHERE period='${period}';`);
  ri.parseLabaRugi(lWs, src.lrValCol || 9).forEach(r =>
    out.push(`INSERT INTO report_laba_rugi (period,sort_order,label,value,depth) VALUES ('${period}',${r.order},${q(r.label)},${q(r.value)},${r.depth});`));
}
const lraSheets = Array.isArray(src.lraSheets) ? src.lraSheets : [];
lraSheets.forEach(ls => {
  const ws = wb.Sheets[ls.sheet];
  if (!ws) return;
  out.push(`DELETE FROM anggaran WHERE kategori='${ls.kategori}' AND bulan=${bulan};`);
  ri.parsePenerimaan(ws).forEach(r => {
    const o = String(r.outline || '').trim();
    if (!/^\d+\.\d+/.test(o)) return;
    out.push(`INSERT INTO anggaran (kode,nama,kategori,bulan,anggaran_awal,target_bulan,sd_bln_lalu,bulan_ini,realisasi,persentase,is_total) VALUES ('ANG-${ls.kategori}-${o}',${q(o)},'${ls.kategori}',${bulan},${Number(r.anggaran) || 0},${Number(r.target) || 0},${Number(r.sdBlnLalu) || 0},${Number(r.bulanIni) || 0},${Number(r.realisasi) || 0},${Number(r.persen) || 0},0);`);
  });
});
out.push('COMMIT;');
process.stdout.write(out.join('\n') + '\n');
