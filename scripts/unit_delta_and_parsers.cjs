#!/usr/bin/env node
/* eslint-disable */
/**
 * unit_delta_and_parsers.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * UNIT TESTS  —  Spec: perbaikan-laporan-juni-2026  (TASK 6)
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 *
 * Focused unit tests for the robust delta-overlay machinery, the LRA outline
 * mapping, the snapshot parsers, and report-level consistency. No jest/vitest is
 * installed, so this follows the established project convention: a standalone
 * CommonJS harness that loads the ESM source modules via dynamic import()
 * (the same pattern as scripts/explore_overlay_delta.cjs and
 * tests/preserve_layout_export.spec.cjs).
 *
 * Covers:
 *   1. src/utils/reportDelta.js
 *        - isDebitNormal(code) for every account class (incl. class 9 — the
 *          previously mis-signed case)
 *        - lrLineForCode / neracaLineForCode label resolution + child→sub-group
 *          fallback + unmapped → null
 *        - attributeDelta(journals): section sums, leaf maps, Arus Kas activity
 *          classification, and the unmapped list
 *   2. src/utils/lraOutline.js
 *        - resolveOutline / resolveOperasionalOutline (leaf vs ambiguous parent)
 *        - resolveBebanOpsOutline / buildBebanOpsRows (unmapped parent, real leaf)
 *   3. scripts/import_report_data.cjs parsers vs the official Excel
 *        "(2)" reference (parseNeraca / parseLabaRugi / parseArusKas /
 *        parseBebanOperasional / parseInvestasi) — key totals match (2) within
 *        Rp 1, and the 3-level " Investasi" sheet yields detail rincian rows
 *   4. Consistency on the (2)-derived snapshot AND after a delta overlay:
 *        each JUMLAH == Σ of its visible leaves (incl. any "(Belum Terpetakan)"
 *        leaf), and Neraca balances within Rp 1
 *   5. Sub-akun numeric re-attribution (full-COA sub-akun picker): codeOf /
 *        extractAccountCode follow a numeric sub-code (e.g. 41008 under parent
 *        41000 → outline 1.8) but keep the parent code for free-text sub_akun
 *        names (existing-data / "(2)" reconciliation invariance)
 *
 * Run:  node scripts/unit_delta_and_parsers.cjs
 * Exit: 0 when all unit cases pass, 1 on any failure.
 */
'use strict';

const path = require('path');
const XLSX = require('xlsx');
const reportImport = require('./import_report_data.cjs');

// ── Reference Excel (2) — NOTE the DOUBLE space before "(2)" ───────────────
const REF2_FILE = path.join(__dirname, '..', 'src', 'FILES', 'LAMPIRAN LAPORAN KEUANGAN JUNI 2026  (2).xlsx');
const SHEETS = {
  neraca: 'NERACA JUNI 2026',
  arusKas: 'ARUS KAS JUNI 2026',
  labaRugi: 'LABA RUGI JUNI 2026',
  bebanOps: 'Beban Operasional ', // trailing space is intentional
};
const TOL = 1; // Rp 1 rounding tolerance (Expected Behavior 2.1–2.4)

// ── tiny assert harness ────────────────────────────────────────────────────
const results = [];
function check(name, cond, detail) {
  const ok = !!cond;
  results.push({ name, ok });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  (${detail})` : ''}`);
  return ok;
}
const eq = (a, b) => a === b;
const approx = (a, b, tol = TOL) => Math.abs((a || 0) - (b || 0)) <= tol;
function section(title) { console.log(`\n${title}`); }

// Sum the contiguous run of leaf rows (value != null, not a JUMLAH/total)
// immediately preceding a subtotal row — i.e. that subtotal's direct children.
const isTotalLabel = (label) => {
  const u = String(label || '').toUpperCase();
  return u.includes('JUMLAH') || u.includes('JUMAH') || u.startsWith('LABA') || u.startsWith('EBITDA') || u.includes('NILAI BUKU');
};
function precedingLeafSum(rows, idx) {
  let sum = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.value == null) break;
    if (isTotalLabel(r.label)) break;
    sum += r.value || 0;
  }
  return sum;
}
const rowVal = (rows, re) => { const r = rows.find(x => re.test(String(x.label))); return r ? r.value : undefined; };

// ════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('═'.repeat(78));
  console.log(' UNIT TESTS — atribusi delta, pemetaan LRA, parser & konsistensi');
  console.log(' Spec: perbaikan-laporan-juni-2026 / Task 6 (Req 2.1–2.4)');
  console.log('═'.repeat(78));

  const RD = await import('../src/utils/reportDelta.js'); // reportDelta.js
  const LO = await import('../src/utils/lraOutline.js');  // lraOutline.js
  const JE = await import('../src/utils/journalExpand.js'); // journalExpand.js (multi-line expansion)

  // ───────────────────────────────────────────────────────────────────────
  section('1. src/utils/reportDelta.js — delta attribution helpers');

  // 1.1 isDebitNormal for every account class (incl. class 9, previously broken)
  section('1.1 isDebitNormal(code) — all classes');
  check('1.1.1 class 1 (asset) is debit-normal', RD.isDebitNormal('11103') === true);
  check('1.1.2 class 2 (liability) is credit-normal', RD.isDebitNormal('21001') === false);
  check('1.1.3 class 3 (equity) is credit-normal', RD.isDebitNormal('31000') === false);
  check('1.1.4 class 4 (revenue) is credit-normal', RD.isDebitNormal('41001') === false);
  check('1.1.5 class 5 (HPP) is debit-normal', RD.isDebitNormal('51001') === true);
  check('1.1.6 class 6 (beban) is debit-normal', RD.isDebitNormal('61010') === true);
  check('1.1.7 class 7 (pendapatan lain) is credit-normal', RD.isDebitNormal('70001') === false);
  check('1.1.8 class 8 (beban non-ops) is debit-normal', RD.isDebitNormal('80001') === true);
  check('1.1.9 class 9 (PAJAK PENGHASILAN) is debit-normal [previously broken]',
    RD.isDebitNormal('99999') === true);

  // 1.2 lrLineForCode — exact, child→sub-group fallback, class-level, unmapped
  section('1.2 lrLineForCode(code)');
  check('1.2.1 child 62013 → sub-group 62010 label "Beban Pemeliharaan Kendaraan Operasional"',
    RD.lrLineForCode('62013') === 'Beban Pemeliharaan Kendaraan Operasional', RD.lrLineForCode('62013'));
  check('1.2.2 child 61012 → sub-group 61010 label "Beban Gaji"',
    RD.lrLineForCode('61012') === 'Beban Gaji', RD.lrLineForCode('61012'));
  check('1.2.3 class-level 41005 → "Pendapatan Bisnis Utama" (41)',
    RD.lrLineForCode('41005') === 'Pendapatan Bisnis Utama', RD.lrLineForCode('41005'));
  check('1.2.4 class-level 42010 → "Pendapatan Pengembangan Bisnis Lainnya" (42)',
    RD.lrLineForCode('42010') === 'Pendapatan Pengembangan Bisnis Lainnya', RD.lrLineForCode('42010'));
  check('1.2.5 exact 99999 → "Beban Pajak Penghasilan"',
    RD.lrLineForCode('99999') === 'Beban Pajak Penghasilan', RD.lrLineForCode('99999'));
  check('1.2.6 unmapped 11103 → null', RD.lrLineForCode('11103') === null, String(RD.lrLineForCode('11103')));

  // 1.3 neracaLineForCode — exact match only, unmapped → null
  section('1.3 neracaLineForCode(code)');
  check('1.3.1 11103 → "Kas Bank Kalsel"', RD.neracaLineForCode('11103') === 'Kas Bank Kalsel', RD.neracaLineForCode('11103'));
  check('1.3.2 11201 → "Piutang Usaha"', RD.neracaLineForCode('11201') === 'Piutang Usaha', RD.neracaLineForCode('11201'));
  check('1.3.3 22001 → "Utang Bank"', RD.neracaLineForCode('22001') === 'Utang Bank', RD.neracaLineForCode('22001'));
  check('1.3.4 unmapped 11203 → null', RD.neracaLineForCode('11203') === null, String(RD.neracaLineForCode('11203')));
  // NEW ("(2) minus template" model): capex accounts the 17–20 June template uses
  // now resolve to their exact (2) Neraca lines (were previously unmapped).
  check('1.3.5 12102.1 → "Bangunan" [newly mapped]', RD.neracaLineForCode('12102.1') === 'Bangunan', RD.neracaLineForCode('12102.1'));
  check('1.3.6 12300 → "Aset Dalam Penyelesaian" [newly mapped]', RD.neracaLineForCode('12300') === 'Aset Dalam Penyelesaian', RD.neracaLineForCode('12300'));

  // 1.4 attributeDelta — section sums, leaf maps, Arus Kas activity, unmapped
  section('1.4 attributeDelta(journals) — small journal set');
  // A: beban gaji 61010 paid from bank 11103 (cash, operasi)
  // B: pemeliharaan truck 62013 paid from bank 11103 (cash, operasi)
  // C: piutang lain-lain 11203 (unmapped current asset) from revenue 41005
  const JV = [
    { id: 'JV-1', akun_debit: '61010 Beban Gaji', akun_kredit: '11103 Bank Kalsel', debit: 10000000, kredit: 10000000, keterangan: 'gaji' },
    { id: 'JV-2', akun_debit: '62013 Beban Pemeliharaan Mobil Truck', akun_kredit: '11103 Bank Kalsel', debit: 9000000, kredit: 9000000, keterangan: 'servis truck' },
    { id: 'JV-3', akun_debit: '11203 Piutang Lain-lain', akun_kredit: '41005 Pendapatan Pengelolaan Lain-lain', debit: 5000000, kredit: 5000000, keterangan: 'piutang pengelolaan' },
  ];
  const A = RD.attributeDelta(JV);
  // section sums (P/L)
  check('1.4.1 lrSec.admin (61) == +10.000.000', A.lrSec.admin === 10000000, String(A.lrSec.admin));
  check('1.4.2 lrSec.ops (62) == +9.000.000', A.lrSec.ops === 9000000, String(A.lrSec.ops));
  check('1.4.3 lrSec.pendUsaha (41) == +5.000.000', A.lrSec.pendUsaha === 5000000, String(A.lrSec.pendUsaha));
  // leaf maps (by code-resolved label)
  check('1.4.4 lrLeaf["Beban Gaji"] == +10.000.000', A.lrLeaf['Beban Gaji'] === 10000000, String(A.lrLeaf['Beban Gaji']));
  check('1.4.5 lrLeaf["Beban Pemeliharaan Kendaraan Operasional"] == +9.000.000',
    A.lrLeaf['Beban Pemeliharaan Kendaraan Operasional'] === 9000000, String(A.lrLeaf['Beban Pemeliharaan Kendaraan Operasional']));
  check('1.4.6 lrLeaf["Pendapatan Bisnis Utama"] == +5.000.000',
    A.lrLeaf['Pendapatan Bisnis Utama'] === 5000000, String(A.lrLeaf['Pendapatan Bisnis Utama']));
  // Neraca section sums
  check('1.4.7 nSec.asetLancar == −14.000.000 (−10M −9M cash +5M piutang)',
    A.nSec.asetLancar === -14000000, String(A.nSec.asetLancar));
  check('1.4.8 nLeaf["Kas Bank Kalsel"] == −19.000.000', A.nLeaf['Kas Bank Kalsel'] === -19000000, String(A.nLeaf['Kas Bank Kalsel']));
  check('1.4.9 nSec.pl (profit impact) == −14.000.000 (−10M −9M beban +5M pendapatan)',
    A.nSec.pl === -14000000, String(A.nSec.pl));
  // Arus Kas activity classification
  check('1.4.10 ak.operasi == −19.000.000', A.ak.operasi === -19000000, String(A.ak.operasi));
  check('1.4.11 ak.investasi == 0', A.ak.investasi === 0, String(A.ak.investasi));
  check('1.4.12 ak.pendanaan == 0', A.ak.pendanaan === 0, String(A.ak.pendanaan));
  check('1.4.13 ak.cash == −19.000.000', A.ak.cash === -19000000, String(A.ak.cash));
  // unmapped list — 11203 has no Neraca line and must NOT vanish
  check('1.4.14 nSec.unmappedAsetLancar == +5.000.000', A.nSec.unmappedAsetLancar === 5000000, String(A.nSec.unmappedAsetLancar));
  check('1.4.15 unmapped list flags 11203 (no silent drop)',
    A.unmapped.some(u => u.code === '11203' && u.report === 'neraca' && u.amt === 5000000),
    JSON.stringify(A.unmapped));

  // 1.5 attributeDelta — Arus Kas activity split for MULTI-LINE journals.
  // Multi-line (form `lines`) journals are run through expandJournals first, so
  // a cash leg's own half-record has an EMPTY counter account. The fix groups
  // the expanded legs back by their originating journal and classifies the net
  // cash by the journal's NON-cash legs. (Pre-fix, all of these collapsed into
  // Aktivitas Operasi because arusKasActivity('') defaults to 'operasi'.)
  section('1.5 attributeDelta — multi-line journal Arus Kas classification');

  // (a) 2-line: Dr 12102.1 (fixed asset) / Cr 11103 (cash) → INVESTASI (not Operasi)
  const mlInvest = JE.expandJournals([{
    id: 'JV-ML-1', status: 'posted', keterangan: 'beli aset tetap',
    lines: [
      { akun_code: '12102.1', akun_name: 'Peralatan Kantor', debit: 15000000, kredit: 0 },
      { akun_code: '11103', akun_name: 'Bank Kalsel', debit: 0, kredit: 15000000 },
    ],
  }]);
  const Ainv = RD.attributeDelta(mlInvest);
  check('1.5.1 (a) Dr 12102.1 / Cr 11103 → ak.investasi == −15.000.000', Ainv.ak.investasi === -15000000, String(Ainv.ak.investasi));
  check('1.5.2 (a) ak.operasi == 0 (NOT collapsed into Operasi)', Ainv.ak.operasi === 0, String(Ainv.ak.operasi));
  check('1.5.3 (a) ak.cash == −15.000.000 (net cash preserved)', Ainv.ak.cash === -15000000, String(Ainv.ak.cash));
  check('1.5.4 (a) split sums to net cash', (Ainv.ak.operasi + Ainv.ak.investasi + Ainv.ak.pendanaan) === Ainv.ak.cash,
    `${Ainv.ak.operasi + Ainv.ak.investasi + Ainv.ak.pendanaan} vs ${Ainv.ak.cash}`);

  // (b) 2-line financing: Dr 11103 (cash) / Cr 22001 (utang bank) → PENDANAAN
  const mlFinance = JE.expandJournals([{
    id: 'JV-ML-2', status: 'posted', keterangan: 'pencairan pinjaman bank',
    lines: [
      { akun_code: '11103', akun_name: 'Bank Kalsel', debit: 20000000, kredit: 0 },
      { akun_code: '22001', akun_name: 'Utang Bank', debit: 0, kredit: 20000000 },
    ],
  }]);
  const Afin = RD.attributeDelta(mlFinance);
  check('1.5.5 (b) Dr 11103 / Cr 22001 → ak.pendanaan == +20.000.000', Afin.ak.pendanaan === 20000000, String(Afin.ak.pendanaan));
  check('1.5.6 (b) ak.operasi == 0', Afin.ak.operasi === 0, String(Afin.ak.operasi));
  check('1.5.7 (b) ak.cash == +20.000.000', Afin.ak.cash === 20000000, String(Afin.ak.cash));

  // (c) multi-leg: Dr 12102.1 (investasi) 6M + Dr 62013 (operasi) 4M / Cr 11103 (cash) 10M
  //     → split proportionally across activities, summing to net cash −10M.
  const mlMixed = JE.expandJournals([{
    id: 'JV-ML-3', status: 'posted', keterangan: 'pembelian aset + biaya pemeliharaan tunai',
    lines: [
      { akun_code: '12102.1', akun_name: 'Peralatan Kantor', debit: 6000000, kredit: 0 },
      { akun_code: '62013', akun_name: 'Beban Pemeliharaan Mobil Truck', debit: 4000000, kredit: 0 },
      { akun_code: '11103', akun_name: 'Bank Kalsel', debit: 0, kredit: 10000000 },
    ],
  }]);
  const Amix = RD.attributeDelta(mlMixed);
  check('1.5.8 (c) investasi share == −6.000.000', Amix.ak.investasi === -6000000, String(Amix.ak.investasi));
  check('1.5.9 (c) operasi share == −4.000.000', Amix.ak.operasi === -4000000, String(Amix.ak.operasi));
  check('1.5.10 (c) pendanaan share == 0', Amix.ak.pendanaan === 0, String(Amix.ak.pendanaan));
  check('1.5.11 (c) ak.cash == −10.000.000', Amix.ak.cash === -10000000, String(Amix.ak.cash));
  check('1.5.12 (c) operasi+investasi+pendanaan == net cash', (Amix.ak.operasi + Amix.ak.investasi + Amix.ak.pendanaan) === Amix.ak.cash,
    `${Amix.ak.operasi + Amix.ak.investasi + Amix.ak.pendanaan} vs ${Amix.ak.cash}`);

  // (d) plain single-line operating journal still classifies to OPERASI (unchanged).
  const slOps = JE.expandJournals([{
    id: 'JV-SL-1', status: 'posted', akun_debit: '62013 Beban Pemeliharaan Mobil Truck', akun_kredit: '11103 Bank Kalsel',
    debit: 7000000, kredit: 7000000, keterangan: 'servis truck tunai',
  }]);
  const Aops = RD.attributeDelta(slOps);
  check('1.5.13 (d) single-line Dr 62013 / Cr 11103 → ak.operasi == −7.000.000', Aops.ak.operasi === -7000000, String(Aops.ak.operasi));
  check('1.5.14 (d) ak.investasi == 0 && ak.pendanaan == 0', Aops.ak.investasi === 0 && Aops.ak.pendanaan === 0, `${Aops.ak.investasi}/${Aops.ak.pendanaan}`);
  check('1.5.15 (d) ak.cash == −7.000.000', Aops.ak.cash === -7000000, String(Aops.ak.cash));

  // (e) KNOWN LIMITATION: a cash leg whose journal has no non-cash sibling (a
  //     compound entry imported as a separate one-leg journal) falls back to
  //     Operasi without crashing.
  const orphanCash = JE.expandJournals([{
    id: 'JV-ORPHAN-1', status: 'posted', akun_debit: '', akun_kredit: '11103 Bank Kalsel',
    debit: 0, kredit: 3000000, keterangan: 'kas keluar tanpa pasangan',
  }]);
  const Aorphan = RD.attributeDelta(orphanCash);
  check('1.5.16 (e) unpaired cash leg falls back to Operasi (no crash)', Aorphan.ak.operasi === -3000000 && Aorphan.ak.cash === -3000000,
    `operasi=${Aorphan.ak.operasi} cash=${Aorphan.ak.cash}`);

  // ───────────────────────────────────────────────────────────────────────
  section('2. src/utils/lraOutline.js — LRA outline mapping');

  // 2.1 resolveOutline / resolveOperasionalOutline
  section('2.1 resolveOutline / resolveOperasionalOutline');
  check('2.1.1 leaf 62013 → "1.1.3"', LO.resolveOutline('62013') === '1.1.3', String(LO.resolveOutline('62013')));
  check('2.1.2 ambiguous parent 62010 (no keyword) → null (NOT "1.1.1")',
    LO.resolveOutline('62010', '') === null, String(LO.resolveOutline('62010', '')));
  check('2.1.3 parent 62010 + keyword "truck" → "1.1.3"',
    LO.resolveOutline('62010', 'servis mobil truck operasional') === '1.1.3',
    String(LO.resolveOutline('62010', 'servis mobil truck operasional')));
  check('2.1.4 resolveOperasionalOutline("62010","") === null', LO.resolveOperasionalOutline('62010', '') === null);
  check('2.1.5 resolveOperasionalOutline("62010","truck") === "1.1.3"', LO.resolveOperasionalOutline('62010', 'truck') === '1.1.3');
  // NEW ("(2) minus template"): aggregate Beban Operasional codes ending in 0 that
  // have a DIRECT outline entry resolve to it (they are real lines, not ambiguous
  // descriptive parents) — while genuinely-ambiguous parents (62010) stay null.
  check('2.1.6 62020 (no keyword) → "1.2.1" [direct outline, not unmapped]', LO.resolveOutline('62020', '') === '1.2.1', String(LO.resolveOutline('62020', '')));
  check('2.1.7 62100 (no keyword) → "4.1.1" [direct outline, not unmapped]', LO.resolveOutline('62100', '') === '4.1.1', String(LO.resolveOutline('62100', '')));

  // 2.2 resolveBebanOpsOutline / buildBebanOpsRows
  section('2.2 resolveBebanOpsOutline / buildBebanOpsRows');
  check('2.2.1 resolveBebanOpsOutline("62010","") → unmapped (parent, no keyword)',
    LO.resolveBebanOpsOutline('62010', '').unmapped === true, JSON.stringify(LO.resolveBebanOpsOutline('62010', '')));
  check('2.2.2 resolveBebanOpsOutline("62013") → outline "1.1.3"',
    LO.resolveBebanOpsOutline('62013', '').outline === '1.1.3', JSON.stringify(LO.resolveBebanOpsOutline('62013', '')));
  check('2.2.3 resolveBebanOpsOutline("62010","truck") → outline "1.1.3"',
    LO.resolveBebanOpsOutline('62010', 'truck').outline === '1.1.3', JSON.stringify(LO.resolveBebanOpsOutline('62010', 'truck')));
  // NEW: codes ending in 0 with a DIRECT outline entry resolve (62020→1.2.1,
  // 62100→4.1.1) instead of being forced to "unmapped" by the trailing 0; the
  // genuinely-ambiguous parent 62010 (no keyword) still returns unmapped (2.2.1).
  check('2.2.3a resolveBebanOpsOutline("62020","") → outline "1.2.1" (direct, not unmapped)',
    LO.resolveBebanOpsOutline('62020', '').outline === '1.2.1', JSON.stringify(LO.resolveBebanOpsOutline('62020', '')));
  check('2.2.3b resolveBebanOpsOutline("62100","") → outline "4.1.1" (direct, not unmapped)',
    LO.resolveBebanOpsOutline('62100', '').outline === '4.1.1', JSON.stringify(LO.resolveBebanOpsOutline('62100', '')));

  const baseOps = [
    { outline: '1.1.1', nama: 'Pajak Mobil Operasional', bulanIni: 500000 },
    { outline: '1.1.3', nama: 'Pemeliharaan Mobil Truck', bulanIni: 1000000 },
  ];
  const opsJournals = [
    { id: 'JV-10', akun_debit: '62013 Beban Pemeliharaan Mobil Truck', debit: 2000000, keterangan: 'servis truck' },
    { id: 'JV-11', akun_debit: '62010 Beban Pemeliharaan Kendaraan Operasional', debit: 800000, keterangan: 'pemeliharaan rutin' },
  ];
  const opsRes = LO.buildBebanOpsRows(baseOps, opsJournals);
  check('2.2.4 buildBebanOpsRows: real leaf 62013 attributes to 1.1.3 (1.000.000 + 2.000.000)',
    opsRes.rows['1.1.3'].value === 3000000, String(opsRes.rows['1.1.3'].value));
  check('2.2.5 buildBebanOpsRows: ambiguous parent 62010 NOT dumped on first child 1.1.1 (stays 500.000)',
    opsRes.rows['1.1.1'].value === 500000, String(opsRes.rows['1.1.1'].value));
  check('2.2.6 buildBebanOpsRows: ambiguous parent 62010 reported as unmapped (no silent drop)',
    opsRes.unmapped.some(u => u.code === '62010' && u.amt === 800000), JSON.stringify(opsRes.unmapped));

  // ───────────────────────────────────────────────────────────────────────
  section('3. scripts/import_report_data.cjs — snapshot parsers vs (2)');
  let wb;
  try {
    wb = XLSX.readFile(REF2_FILE);
  } catch (e) {
    check('3.0 reference Excel (2) is readable', false, e.message);
    return finish();
  }
  check('3.0 reference Excel (2) is readable', true, path.basename(REF2_FILE));

  // 3.1 parseNeraca — key totals + balance (officially audited (2) figures)
  section('3.1 parseNeraca');
  const neraca = reportImport.parseNeraca(wb.Sheets[SHEETS.neraca]);
  const jumlahAset = rowVal(neraca, /^JUMLAH ASET$/);
  const jumlahKwjEkuitas = rowVal(neraca, /^JUMLAH KEWAJIBAN DAN EKUITAS$/);
  check('3.1.1 JUMLAH ASET == Rp 864.057.003.031,08 (2)', approx(jumlahAset, 864057003031.08), String(jumlahAset));
  check('3.1.2 Neraca balances: JUMLAH ASET == JUMLAH KEWAJIBAN DAN EKUITAS (≤ Rp 1)',
    approx(jumlahAset, jumlahKwjEkuitas), `${jumlahAset} vs ${jumlahKwjEkuitas}`);

  // 3.2 parseLabaRugi — key totals (2)
  section('3.2 parseLabaRugi');
  const lr = reportImport.parseLabaRugi(wb.Sheets[SHEETS.labaRugi], 9);
  check('3.2.1 JUMLAH PENDAPATAN USAHA == Rp 411.628.132 (2)',
    approx(rowVal(lr, /JUMLAH PENDAPATAN USAHA/), 411628132), String(rowVal(lr, /JUMLAH PENDAPATAN USAHA/)));
  check('3.2.2 JUMLAH BEBAN UMUM DAN ADMINISTRASI == Rp 98.251.556 (2)',
    approx(rowVal(lr, /JUMLAH BEBAN UMUM DAN ADMIN/), 98251556), String(rowVal(lr, /JUMLAH BEBAN UMUM DAN ADMIN/)));
  check('3.2.3 LABA (RUGI) BERSIH SETELAH PAJAK == −Rp 157.809.133 (2)',
    approx(rowVal(lr, /BERSIH SETELAH PAJAK/), -157809133), String(rowVal(lr, /BERSIH SETELAH PAJAK/)));

  // 3.3 parseArusKas — key total (2)
  section('3.3 parseArusKas');
  const ak = reportImport.parseArusKas(wb.Sheets[SHEETS.arusKas], 2);
  check('3.3.1 Kas dan Setara kas Akhir Periode == Rp 13.564.197.197,83 (2)',
    approx(rowVal(ak, /Akhir Periode/i), 13564197197.83), String(rowVal(ak, /Akhir Periode/i)));

  // 3.4 parseBebanOperasional — row count + Σ bulan_ini (rincian) vs (2)
  section('3.4 parseBebanOperasional');
  const bo = reportImport.parseBebanOperasional(wb.Sheets[SHEETS.bebanOps]);
  check('3.4.1 returns 40 outline rows', bo.length === 40, `rows=${bo.length}`);
  const rincianSum = bo.filter(r => /^\d+\.\d+\.\d+$/.test(r.outline)).reduce((s, r) => s + r.bulanIni, 0);
  check('3.4.2 Σ bulan_ini (rincian 3-level) == Rp 102.375.224 (2) "Beban Operasional dan Bisnis"',
    approx(rincianSum, 102375224), String(rincianSum));

  // 3.5 parseInvestasi — 3-level " Investasi" sheet (NOTE the leading space).
  // Detail rincian rows are synthesized as child outlines (1.1.1, 1.3.6, …) with
  // their verbatim Excel labels; "Total" / "TOTAL INVESTASI" rows are skipped.
  section('3.5 parseInvestasi ( Investasi — 3-level, detail rincian rows)');
  const inv = reportImport.parseInvestasi(wb.Sheets[' Investasi']);
  check('3.5.1 includes synthesized detail (level-3) rows', inv.some(r => /^\d+\.\d+\.\d+$/.test(r.outline)), `rows=${inv.length}`);
  check('3.5.2 still includes the level-2 sub-item rows (e.g. 1.5, 6.1)',
    inv.some(r => r.outline === '1.5') && inv.some(r => r.outline === '6.1'));
  check('3.5.3 detail rows carry the VERBATIM Excel label (1.3.6 = "f. Pengadaan Instalasi Listrik Pasar")',
    (inv.find(r => r.outline === '1.3.6') || {}).nama === 'f. Pengadaan Instalasi Listrik Pasar',
    (inv.find(r => r.outline === '1.3.6') || {}).nama);
  check('3.5.4 NO "Total" / "TOTAL INVESTASI" summary rows leak in',
    !inv.some(r => /^total/i.test(String(r.nama || ''))));
  // Group-1 detail bulan_ini sums to the (2) "Total" of group 1 (parents=0 in the sheet).
  const inv1Detail = inv.filter(r => /^1\.\d+\.\d+$/.test(r.outline)).reduce((s, r) => s + r.bulanIni, 0);
  check('3.5.5 Σ group-1 detail bulan_ini == Rp 199.867.735 (2) group-1 "Total"',
    approx(inv1Detail, 199867735), String(inv1Detail));

  // ───────────────────────────────────────────────────────────────────────
  section('4. Consistency — (2) snapshot AND after delta overlay');

  // 4.1 baseline Neraca balances (already from (2))
  section('4.1 baseline (2) consistency');
  check('4.1.1 baseline Neraca balances (JUMLAH ASET == JUMLAH KEWAJIBAN DAN EKUITAS)',
    approx(jumlahAset, jumlahKwjEkuitas), `${jumlahAset} vs ${jumlahKwjEkuitas}`);

  // 4.2 after a balanced delta overlay, Neraca still balances
  section('4.2 Neraca overlay (buildNeracaRows) stays balanced');
  // mapped balanced journal: piutang usaha (11201, mapped) from revenue 41005
  const balancedJV = [
    { id: 'JV-20', akun_debit: '11201 Piutang Usaha', akun_kredit: '41005 Pendapatan Pengelolaan Lain-lain', debit: 7000000, kredit: 7000000, keterangan: 'piutang usaha' },
  ];
  const nOverlay = RD.buildNeracaRows(neraca, balancedJV);
  const aset2 = rowVal(nOverlay, /^JUMLAH ASET$/);
  const kwjEk2 = rowVal(nOverlay, /^JUMLAH KEWAJIBAN DAN EKUITAS$/);
  check('4.2.1 overlay added +7.000.000 to JUMLAH ASET', approx(aset2 - jumlahAset, 7000000), String(aset2 - jumlahAset));
  check('4.2.2 Neraca still balances after overlay (≤ Rp 1)', approx(aset2, kwjEk2), `${aset2} vs ${kwjEk2}`);

  // 4.3 unmapped current-asset overlay → visible "(Belum Terpetakan)" leaf; subtotal consistent
  section('4.3 Neraca overlay with an UNMAPPED current asset (11203)');
  const unmappedJV = [
    { id: 'JV-21', akun_debit: '11203 Piutang Lain-lain', akun_kredit: '41005 Pendapatan Pengelolaan Lain-lain', debit: 5000000, kredit: 5000000, keterangan: 'piutang lain-lain' },
  ];
  const nUnmapped = RD.buildNeracaRows(neraca, unmappedJV);
  const belumLeaf = nUnmapped.find(r => /Belum Terpetakan/i.test(String(r.label)));
  check('4.3.1 emits a "(Belum Terpetakan)" current-asset leaf', !!belumLeaf, belumLeaf ? String(belumLeaf.value) : 'none');
  check('4.3.2 "(Belum Terpetakan)" leaf carries the unmapped +5.000.000', belumLeaf && belumLeaf.value === 5000000, belumLeaf ? String(belumLeaf.value) : 'n/a');
  // Jumlah Aset Lancar must equal baseline + full section delta (incl. the unmapped amount)
  const lancarBase = rowVal(neraca, /jumlah aset lancar/i);
  const lancarNew = rowVal(nUnmapped, /jumlah aset lancar/i);
  check('4.3.3 Jumlah Aset Lancar moved by +5.000.000 (unmapped amount included, not dropped)',
    approx(lancarNew - lancarBase, 5000000), String(lancarNew - lancarBase));
  const idxLancar = nUnmapped.findIndex(r => /jumlah aset lancar/i.test(String(r.label)));
  check('4.3.4 Jumlah Aset Lancar == Σ of its visible leaves (incl. "(Belum Terpetakan)")',
    approx(nUnmapped[idxLancar].value, precedingLeafSum(nUnmapped, idxLancar)),
    `${nUnmapped[idxLancar].value} vs Σleaves=${precedingLeafSum(nUnmapped, idxLancar)}`);
  // Balance preserved even with unmapped account
  check('4.3.5 Neraca still balances with the unmapped account (≤ Rp 1)',
    approx(rowVal(nUnmapped, /^JUMLAH ASET$/), rowVal(nUnmapped, /^JUMLAH KEWAJIBAN DAN EKUITAS$/)),
    `${rowVal(nUnmapped, /^JUMLAH ASET$/)} vs ${rowVal(nUnmapped, /^JUMLAH KEWAJIBAN DAN EKUITAS$/)}`);

  // 4.4 Laba Rugi overlay consistency: mapped leaf moves with total; unmapped 61 → "(Belum Terpetakan)"
  section('4.4 Laba Rugi overlay (buildLabaRugiRows) consistency');
  const lrJV = [
    // mapped: 61012 → "Beban Gaji" leaf
    { id: 'JV-30', akun_debit: '61012 Beban Gaji Pokok', akun_kredit: '11103 Bank Kalsel', debit: 4000000, kredit: 4000000, keterangan: 'gaji' },
    // unmapped 61 account (group 61990 not in lrAlias) → surfaced as unmapped admin leaf
    { id: 'JV-31', akun_debit: '61999 Beban Umum Tak Terdaftar', akun_kredit: '11103 Bank Kalsel', debit: 3000000, kredit: 3000000, keterangan: 'beban tak terpetakan' },
  ];
  const lrOverlay = RD.buildLabaRugiRows(lr, lrJV);
  const gajiBase = rowVal(lr, /^Beban Gaji$/);
  const gajiNew = rowVal(lrOverlay, /^Beban Gaji$/);
  check('4.4.1 mapped leaf "Beban Gaji" moved by +4.000.000', approx(gajiNew - gajiBase, 4000000), String(gajiNew - gajiBase));
  const admBase = rowVal(lr, /JUMLAH BEBAN UMUM DAN ADMIN/);
  const admNew = rowVal(lrOverlay, /JUMLAH BEBAN UMUM DAN ADMIN/);
  check('4.4.2 JUMLAH BEBAN UMUM DAN ADMINISTRASI moved by +7.000.000 (4M mapped + 3M unmapped)',
    approx(admNew - admBase, 7000000), String(admNew - admBase));
  const lrBelum = lrOverlay.find(r => /Belum Terpetakan/i.test(String(r.label)) && /Administrasi/i.test(String(r.label)));
  check('4.4.3 unmapped 61 surfaces a "(Belum Terpetakan)" admin leaf of +3.000.000 (no silent drop)',
    !!lrBelum && lrBelum.value === 3000000, lrBelum ? String(lrBelum.value) : 'none');
  // subtotal == Σ visible leaves (mapped leaf delta + unmapped leaf) for the admin block
  const idxAdm = lrOverlay.findIndex(r => /JUMLAH BEBAN UMUM DAN ADMIN/i.test(String(r.label)));
  check('4.4.4 JUMLAH BEBAN UMUM DAN ADMINISTRASI == Σ of its visible leaves',
    approx(lrOverlay[idxAdm].value, precedingLeafSum(lrOverlay, idxAdm)),
    `${lrOverlay[idxAdm].value} vs Σleaves=${precedingLeafSum(lrOverlay, idxAdm)}`);

  // ───────────────────────────────────────────────────────────────────────
  section('5. Sub-akun numeric re-attribution (ISSUE 4b — full-COA sub-akun picker)');
  // When a Sub Akun chosen from the full COA carries a leading numeric code,
  // attribution follows that SUB-code; a free-text (name-only) sub_akun keeps the
  // PARENT code so existing journals + the "(2)" reconciliation are byte-identical.

  // 5.1 reportDelta.codeOf — numeric sub re-attributes; name-only keeps parent.
  section('5.1 reportDelta.codeOf');
  check('5.1.1 numeric sub-akun → sub-code (41008)',
    RD.codeOf('41000 Pendapatan Pengelolaan Pasar > 41008 - Pendapatan Ramayana') === '41008',
    RD.codeOf('41000 Pendapatan Pengelolaan Pasar > 41008 - Pendapatan Ramayana'));
  check('5.1.2 dotted numeric sub-akun → sub-code (12203.1)',
    RD.codeOf('12203 Instalasi > 12203.1 - Penambahan Instalasi Listrik Pasar') === '12203.1',
    RD.codeOf('12203 Instalasi > 12203.1 - Penambahan Instalasi Listrik Pasar'));
  check('5.1.3 name-only sub-akun → PARENT code (41000) [existing-data invariance]',
    RD.codeOf('41000 Pendapatan Pengelolaan Pasar > Pendapatan Ramayana') === '41000',
    RD.codeOf('41000 Pendapatan Pengelolaan Pasar > Pendapatan Ramayana'));
  check('5.1.4 no sub-akun → leading code (61010) [unchanged]',
    RD.codeOf('61010 Beban Gaji') === '61010', RD.codeOf('61010 Beban Gaji'));

  // 5.2 lraOutline.extractAccountCode — same numeric-sub gate.
  section('5.2 lraOutline.extractAccountCode + resolveOutline');
  check('5.2.1 extractAccountCode numeric sub-akun → 41008',
    LO.extractAccountCode('41000 Pendapatan > 41008 - Pendapatan Ramayana') === '41008',
    LO.extractAccountCode('41000 Pendapatan > 41008 - Pendapatan Ramayana'));
  check('5.2.2 extractAccountCode name-only sub-akun → parent 41000',
    LO.extractAccountCode('41000 Pendapatan > Pendapatan Ramayana') === '41000',
    LO.extractAccountCode('41000 Pendapatan > Pendapatan Ramayana'));
  // The whole point: a journal that picks 41008 as sub-akun under parent 41000
  // attributes to OUTLINE 1.8 (41008), NOT 1.1 (41000).
  check('5.2.3 sub-akun 41008 under parent 41000 → LRA outline "1.8" (not 1.1)',
    LO.resolveOutline(LO.extractAccountCode('41000 Pendapatan > 41008 - Pendapatan Ramayana')) === '1.8',
    LO.resolveOutline(LO.extractAccountCode('41000 Pendapatan > 41008 - Pendapatan Ramayana')));
  check('5.2.4 name-only sub-akun under 41000 → LRA outline "1.1" (parent, unchanged)',
    LO.resolveOutline(LO.extractAccountCode('41000 Pendapatan > Pendapatan Ramayana')) === '1.1',
    LO.resolveOutline(LO.extractAccountCode('41000 Pendapatan > Pendapatan Ramayana')));
  // 41009 (newly seeded "Pendapatan Perizinan") is mapped to outline 1.5.
  check('5.2.5 sub-akun 41009 (Pendapatan Perizinan) → LRA outline "1.5"',
    LO.resolveOutline(LO.extractAccountCode('41000 Pendapatan > 41009 - Pendapatan Perizinan')) === '1.5',
    LO.resolveOutline(LO.extractAccountCode('41000 Pendapatan > 41009 - Pendapatan Perizinan')));

  // 5.3 Multi-line journal expansion preserves the sub-akun so attribution follows it.
  section('5.3 expandJournals + attributeDelta — sub-akun re-attribution end-to-end');
  // A revenue receipt booked to parent 41000 but with the sub-akun 41008 picked
  // from the full COA. expandJournals must keep "… > 41008 - …" so codeOf reads 41008.
  const subNumeric = JE.expandJournals([{
    id: 'JV-SUB-1', status: 'posted', keterangan: 'pendapatan ramayana',
    lines: [
      { akun_code: '11103', akun_name: 'Bank Kalsel', debit: 6000000, kredit: 0 },
      { akun_code: '41000', akun_name: 'Pendapatan Pengelolaan Pasar', sub_akun: '41008 - Pendapatan Ramayana', debit: 0, kredit: 6000000 },
    ],
  }]);
  const kredLeg = subNumeric.find(j => j.kredit > 0);
  check('5.3.1 expanded kredit leg carries the numeric sub-akun string',
    /> 41008 - Pendapatan Ramayana$/.test(String(kredLeg.akun_kredit)), kredLeg.akun_kredit);
  check('5.3.2 codeOf(expanded kredit leg) === 41008 (sub-code, not parent 41000)',
    RD.codeOf(kredLeg.akun_kredit) === '41008', RD.codeOf(kredLeg.akun_kredit));

  // Name-only sub-akun (existing data): attribution stays on the parent code.
  const subName = JE.expandJournals([{
    id: 'JV-SUB-2', status: 'posted', keterangan: 'pendapatan ramayana (legacy)',
    lines: [
      { akun_code: '11103', akun_name: 'Bank Kalsel', debit: 6000000, kredit: 0 },
      { akun_code: '41000', akun_name: 'Pendapatan Pengelolaan Pasar', sub_akun: 'Pendapatan Ramayana', debit: 0, kredit: 6000000 },
    ],
  }]);
  const kredLeg2 = subName.find(j => j.kredit > 0);
  check('5.3.3 name-only sub-akun → codeOf keeps parent 41000 (byte-identical legacy behavior)',
    RD.codeOf(kredLeg2.akun_kredit) === '41000', RD.codeOf(kredLeg2.akun_kredit));

  finish();
}

function finish() {
  const failed = results.filter(r => !r.ok);
  console.log('\n' + '─'.repeat(78));
  console.log(`RESULT: ${results.length - failed.length}/${results.length} unit checks passed.`);
  if (failed.length) {
    console.log('FAILED checks:');
    failed.forEach(r => console.log(`  - ${r.name}`));
    console.log('\nUnit tests FAILED.');
    process.exit(1);
  }
  console.log('\nAll unit tests PASSED.');
  process.exit(0);
}

main().catch((e) => {
  console.error('\nTest harness error:', e && e.stack ? e.stack : e);
  process.exit(2);
});
