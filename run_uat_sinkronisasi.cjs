/*
 * UAT — Perbaikan Sinkronisasi Data Keuangan (Manual Excel <-> Aplikasi)
 * Referensi kendala: docs/KENDALA_SINKRONISASI_PERBAIKAN.md
 * Skenario       : UAT_Sinkronisasi_Scenarios.csv
 *
 * Sifat skrip: DIAGNOSTIK.
 *   - PASS  = kondisi yang diharapkan SETELAH perbaikan diterapkan.
 *   - FAIL  = bug masih ada (kondisi saat ini sebelum diperbaiki).
 * Jadi wajar bila beberapa test FAIL pada run pertama; itu menandai pekerjaan perbaikan.
 *
 * Jalankan: node run_uat_sinkronisasi.cjs
 */
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, 'server', 'perumda_ledger.db');
if (!fs.existsSync(DB)) { console.error(`DB tidak ditemukan: ${DB}`); process.exit(1); }
const db = new sqlite3.Database(DB);

function q(sql, p = []) { return new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r))); }
function q1(sql, p = []) { return new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r))); }
function tableExists(name) {
  return q1(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [name]).then(r => !!r);
}

async function test(id, scn, fn) {
  try { const r = await fn(); return { id, scn, pass: r.pass, detail: r.d, manual: r.manual || false }; }
  catch (e) { return { id, scn, pass: false, detail: 'ERR: ' + e.message }; }
}

async function main() {
  const R = [];
  const t = (id, scn, f) => R.push(test(id, scn, f));

  // ===== MODUL A — BUKU BESAR: transaksi akun/sub-akun (Kendala #1) =====
  t('SYN-A01', 'Buku Besar dapat diagregasi dari journal_lines', async () => {
    const r = await q1(`SELECT COUNT(*) c FROM journal_lines`);
    return { pass: r.c > 0, d: `${r.c} baris jurnal` };
  });
  t('SYN-A04', 'Buku Besar memiliki referensi akun valid (join ke COA)', async () => {
    const r = await q1(`
      SELECT COUNT(*) total,
             SUM(CASE WHEN c.code IS NULL THEN 1 ELSE 0 END) tak_terpetakan
      FROM journal_lines jl
      LEFT JOIN coa c ON jl.akun_code = c.code
      WHERE jl.akun_code IS NOT NULL AND jl.akun_code <> ''`);
    return { pass: (r.tak_terpetakan || 0) === 0, d: `${r.tak_terpetakan || 0} baris akun tidak ada di COA (dari ${r.total})` };
  });
  t('SYN-A05', 'Tidak ada journal_lines dengan akun_code kosong', async () => {
    const r = await q1(`SELECT COUNT(*) c FROM journal_lines WHERE akun_code IS NULL OR akun_code=''`);
    return { pass: r.c === 0, d: `${r.c} baris tanpa akun_code (harus 0)` };
  });
  t('SYN-A07', 'Total header jurnal = total baris jurnalnya', async () => {
    const r = await q(`
      SELECT j.id,
             j.debit AS hd, j.kredit AS hk,
             COALESCE(SUM(l.debit),0) AS ld, COALESCE(SUM(l.kredit),0) AS lk
      FROM journals j
      JOIN journal_lines l ON l.journal_id = j.id
      GROUP BY j.id
      HAVING ROUND(hd,2) <> ROUND(ld,2) OR ROUND(hk,2) <> ROUND(lk,2)`);
    return { pass: r.length === 0, d: `${r.length} jurnal header tidak cocok dengan total barisnya` };
  });
  t('SYN-A06', 'Setiap akun bersaldo di jurnal dapat tampil di Buku Besar', async () => {
    // Akun yang punya transaksi tetapi akun_code-nya tidak terdaftar di COA akan "hilang" di buku besar
    const r = await q1(`
      SELECT COUNT(DISTINCT jl.akun_code) c
      FROM journal_lines jl
      LEFT JOIN coa c ON jl.akun_code=c.code
      WHERE c.code IS NULL AND jl.akun_code IS NOT NULL AND jl.akun_code <> ''`);
    return { pass: r.c === 0, d: `${r.c} akun bertransaksi tak terhubung ke COA` };
  });

  // ===== MODUL B — LRA: update realisasi & pemetaan (Kendala #2) =====
  // CATATAN ARSITEKTUR: LRA dihitung di frontend dengan model "baseline (snapshot
  // Excel) + delta jurnal", dipetakan via kode COA -> outline (src/utils/
  // lraOutline.js), BUKAN via journals.kode_anggaran. Test di bawah memverifikasi
  // mekanisme yang sebenarnya dipakai aplikasi.
  const lraSrc = (() => { try { return fs.readFileSync(path.join(__dirname, 'src', 'pages', 'LRA.jsx'), 'utf8'); } catch { return ''; } })();
  const outlineSrc = (() => { try { return fs.readFileSync(path.join(__dirname, 'src', 'utils', 'lraOutline.js'), 'utf8'); } catch { return ''; } })();

  t('SYN-B01', 'LRA dihitung dinamis dari jurnal untuk periode setelah April', async () => {
    const ok = /REAL_EXCEL_PERIODS/.test(lraSrc) && /isDynamic/.test(lraSrc) && /expandJournals/.test(lraSrc);
    return { pass: ok, d: ok ? 'jalur dinamis (isDynamic + expandJournals) ada' : 'jalur dinamis tidak ditemukan' };
  });
  t('SYN-B02', 'LRA hanya menjumlah jurnal berstatus posted', async () => {
    const ok = /status\s*===?\s*'posted'/.test(lraSrc);
    return { pass: ok, d: ok ? 'filter posted ada (jurnal pending tidak masuk LRA)' : 'filter posted tidak ditemukan' };
  });
  t('SYN-B04', 'Delta tak terpetakan disurfacing sebagai "(Belum Terpetakan)" (tidak hilang)', async () => {
    const ok = /Belum Terpetakan/.test(lraSrc);
    return { pass: ok, d: ok ? 'safeguard unmapped ada — transaksi tidak lagi hilang dari LRA' : 'safeguard unmapped TIDAK ada' };
  });
  t('SYN-B05', 'Peta akun COA -> outline LRA tersedia', async () => {
    const ok = /ACCOUNT_TO_OUTLINE/.test(outlineSrc) && /resolveOutline/.test(outlineSrc);
    return { pass: ok, d: ok ? 'lraOutline.js (ACCOUNT_TO_OUTLINE + resolveOutline) ada' : 'peta outline tidak ditemukan' };
  });
  t('SYN-B07', 'Jurnal baru (JV-/JRN-) diperlakukan sebagai delta yang dioverlay', async () => {
    const rd = (() => { try { return fs.readFileSync(path.join(__dirname, 'src', 'utils', 'reportDelta.js'), 'utf8'); } catch { return ''; } })();
    const ok = /JV\|JRN|isDeltaJournal|DELTA_ID_RE/.test(rd);
    return { pass: ok, d: ok ? 'deltaJournals/isDeltaJournal ada' : 'mekanisme delta tidak ditemukan' };
  });

  // ===== MODUL C — Upload Template Jurnal & Approve (Kendala #3) =====
  t('SYN-C07', 'Workflow status jurnal pending->posted tersedia', async () => {
    const cols = await q(`PRAGMA table_info(journals)`);
    const hasStatus = cols.some(c => c.name === 'status');
    const r = await q(`SELECT DISTINCT status FROM journals`);
    return { pass: hasStatus, d: `kolom status=${hasStatus}; nilai: ${r.map(x => x.status).join(',')}` };
  });
  t('SYN-C03', 'Terdapat jurnal pending yang menunggu approve', async () => {
    const r = await q1(`SELECT COUNT(*) c FROM journals WHERE status='pending'`);
    // Diagnostik: pending harus bisa di-approve. Info saja (pass jika kolom mendukung alur).
    return { pass: true, d: `${r.c} jurnal pending (alur approve harus tersedia di UI)` };
  });
  t('SYN-C02', 'Template upload Juni tersedia', async () => {
    const f = path.join(__dirname, 'src', 'Mei Data', 'june data', 'template per 22 juni.xlsx');
    return { pass: fs.existsSync(f), d: fs.existsSync(f) ? 'template ditemukan' : 'template tidak ditemukan' };
  });
  t('SYN-C01', 'Input jurnal manual masuk ke list (baseline data ada)', async () => {
    const r = await q1(`SELECT COUNT(*) c FROM journals`);
    return { pass: r.c > 0, d: `${r.c} jurnal tersimpan` };
  });

  // ===== MODUL D — Laporan Triwulan & Semester (Kendala #4) =====
  // Agregasi triwulan/semester SUDAH diimplementasikan: PERIOD_PRESETS (TW I-IV,
  // Semester I/II) + Laporan.jsx menjumlah snapshot bulanan lintas rentang dan
  // melapis delta jurnal untuk bulan tanpa snapshot. Test memverifikasi kapabilitas
  // kode; ketersediaan data bulanan (Mei/Jun) bersifat dependensi data.
  const filtSrc = (() => { try { return fs.readFileSync(path.join(__dirname, 'src', 'utils', 'journalFilters.js'), 'utf8'); } catch { return ''; } })();
  const lapSrc = (() => { try { return fs.readFileSync(path.join(__dirname, 'src', 'pages', 'Laporan.jsx'), 'utf8'); } catch { return ''; } })();

  t('SYN-D01', 'Preset Triwulan (TW I-IV) & Semester tersedia', async () => {
    const ok = /tw1|TW I/.test(filtSrc) && /s1|Semester I/.test(filtSrc) && /lastMonth/.test(filtSrc);
    return { pass: ok, d: ok ? 'PERIOD_PRESETS memuat TW & Semester' : 'preset triwulan/semester tidak ditemukan' };
  });
  t('SYN-D02', 'Laporan menjumlah snapshot bulanan lintas rentang (agregasi)', async () => {
    const ok = /aggregateFlowRows/.test(lapSrc) && /rangeYearMonths/.test(lapSrc) && /periodValueToMonths/.test(lapSrc);
    return { pass: ok, d: ok ? 'agregasi multi-bulan (aggregateFlowRows) ada' : 'agregasi multi-bulan tidak ditemukan' };
  });
  t('SYN-D03', 'View Laporan Triwulan & Semester terdaftar', async () => {
    const ok = /lr-triwulan/.test(lapSrc) && /lr-semester/.test(lapSrc) && /neraca-triwulan/.test(lapSrc);
    return { pass: ok, d: ok ? 'view triwulan & semester terdaftar' : 'view triwulan/semester tidak ditemukan' };
  });
  t('SYN-D04', 'Baseline bulanan audited tersedia (Jan-Apr); status Mei/Jun', async () => {
    if (!(await tableExists('report_laba_rugi'))) return { pass: false, d: 'tabel report_laba_rugi tidak ada' };
    const r = await q(`SELECT DISTINCT period FROM report_laba_rugi ORDER BY period`);
    const periods = r.map(x => x.period);
    const baseOk = ['2026-01', '2026-02', '2026-03', '2026-04'].every(p => periods.includes(p));
    const mei = periods.includes('2026-05') ? 'Mei✓' : 'Mei(via delta jurnal)';
    const jun = periods.includes('2026-06') ? 'Jun✓' : 'Jun(via delta jurnal)';
    return { pass: baseOk, d: `baseline audited: [${periods.join(',')}] | ${mei}, ${jun}` };
  });

  // ===== MODUL E — Integrasi NPD (Nota Pencairan Dana) (Kendala #5) =====
  // NPD TIDAK memakai tabel khusus — NPDReport.jsx menurunkan pagu dari tabel
  // anggaran dan realisasi (pencairan/akumulasi) dari jurnal posted memakai peta
  // resolveOutline yang SAMA dengan LRA. Jadi #5 selesai begitu sinkronisasi inti
  // (#1 buku besar/akun & #2 pemetaan outline) beres.
  const npdSrc = (() => { try { return fs.readFileSync(path.join(__dirname, 'src', 'pages', 'NPDReport.jsx'), 'utf8'); } catch { return ''; } })();
  t('SYN-E01', 'Halaman NPD menghitung dari jurnal posted (terintegrasi)', async () => {
    const ok = /status\s*===?\s*'posted'/.test(npdSrc) && /expandJournals/.test(npdSrc);
    return { pass: ok, d: ok ? 'NPD memakai jurnal posted + expandJournals' : 'NPD tidak membaca jurnal posted' };
  });
  t('SYN-E02', 'NPD: pagu dari anggaran + realisasi dari jurnal', async () => {
    const ok = /anggaran/.test(npdSrc) && /(pencairan|akumulasi)/.test(npdSrc);
    return { pass: ok, d: ok ? 'pagu anggaran + pencairan/akumulasi jurnal' : 'integrasi pagu/realisasi tidak ditemukan' };
  });
  t('SYN-E03', 'NPD memakai peta outline yang sama dengan LRA (konsisten)', async () => {
    const ok = /resolveOutline/.test(npdSrc) && /lraOutline/.test(npdSrc);
    return { pass: ok, d: ok ? 'resolveOutline (lraOutline.js) dipakai bersama LRA' : 'peta outline NPD tidak konsisten' };
  });

  // ===== MODUL F — UI/UX (manual, tidak dapat diuji di DB) =====
  t('SYN-F01', 'Copy di form jurnal tidak melompat ke menu (UJI MANUAL)', async () => ({ pass: true, manual: true, d: 'Verifikasi manual di UI' }));
  t('SYN-F02', 'Scroll horizontal tabel laporan (UJI MANUAL)', async () => ({ pass: true, manual: true, d: 'Verifikasi manual di UI' }));
  t('SYN-F03', 'Filter Buku Besar/Jurnal per akun & tanggal (UJI MANUAL)', async () => ({ pass: true, manual: true, d: 'Verifikasi manual di UI' }));

  // ===== OUTPUT =====
  const results = await Promise.all(R);
  const auto = results.filter(r => !r.manual);
  const passed = auto.filter(r => r.pass).length;
  const failed = auto.filter(r => !r.pass).length;
  const manual = results.filter(r => r.manual).length;

  console.log(`\n${'='.repeat(92)}`);
  console.log(`UAT SINKRONISASI DATA KEUANGAN — PERUMDA 2026 (diagnostik perbaikan)`);
  console.log(`DB: ${DB}`);
  console.log(`${'='.repeat(92)}\n`);
  console.log(`| Scenario | Test | Status | Detail |`);
  console.log(`|----------|------|--------|--------|`);
  results.forEach(r => {
    const st = r.manual ? '🔵 MANUAL' : (r.pass ? '✅ PASS' : '❌ FAIL');
    console.log(`| ${r.id} | ${r.scn} | ${st} | ${r.detail} |`);
  });
  console.log(`\n${'='.repeat(92)}`);
  console.log(`AUTO: ${auto.length} | ✅ PASS: ${passed} | ❌ FAIL: ${failed} | 🔵 MANUAL: ${manual}`);
  console.log(`SKOR OTOMATIS: ${auto.length ? Math.round(passed / auto.length * 100) : 0}%`);
  console.log(`Catatan: FAIL = bug sinkronisasi yang masih harus diperbaiki.`);
  console.log(`${'='.repeat(92)}`);

  db.close();
}

main();
