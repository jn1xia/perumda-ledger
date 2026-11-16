# October fixes and in-app findings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six app-side October differences and give Bagian Keuangan a findings list (import dialog, bell, Cek Konsistensi) that names what the app could not interpret with certainty.

**Architecture:** Report fixes go into the existing pure utilities (`lraOutline.js`, `reportDelta.js`, `journalExpand.js`) with the two page call sites adjusted. Findings come from a new pure module `src/utils/journalChecks.js`, run in the browser on a parsed book before upload and on the stored journals of a month afterwards. Only acknowledgements ("sudah dicek") are stored, in a new `finding_acks` table.

**Tech Stack:** React 18 + Vite, Express 5 (CJS), SQLite, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-15-trial-differences-and-notifications-design.md` — Phase 1 items 1–6 and Phase 2. Phase 1 items 7–8 (Investasi placement, 4.1–4.4 target) wait for Keuangan (spec §9 K1–K4) and are out of scope.

## Global Constraints

- `npm run test:reports` stays green (115 tests before this work).
- June–September figures do not move. Every rule change is limited by date or by voucher shape so earlier months are untouched.
- Findings never block an upload. Only the existing unbalanced-journal rejection blocks.
- Severity words in the UI: **salah**, **periksa**, **info**. All text Indonesian.
- Findings for stored months only from `2026-06` (`FINDINGS_FROM`): January–May are audited backfill and would list structural noise forever (spec anti-goal).
- Currency in UI via `formatRupiah`.

## Review Focus

1. A month with no journals, or a book of one voucher → no crash, no findings except what applies.
2. Journals from the app form (`JV-2026-<n>`, no voucher number) must not trigger "nomor voucher kosong" for a month that is otherwise a book with voucher numbers.
3. Credit to 11201 in a voucher that debits both kas and 11204 → still a receipt (only receivable-only vouchers are reclasses).
4. Acknowledged finding whose rows change (amount differs) → reappears (key includes the amount).
5. Bell with the API unreachable or acks failing to load → shows the computed count, no crash.

---

### Task 1: Laba Rugi line items net of the opposite leg

**Files:** Modify `src/utils/reportDelta.js` (new export), `src/pages/Laporan.jsx:554-570` (use it). Test: `tests/reports/october2026.test.mjs`.

**Interfaces:** Produces `lineItemsByPrefix(journals, prefix, isDebit, alias) → [{ code, name, amount }]`, sorted by code; `amount` = primary-side amounts minus opposite-side amounts on the same code (same rule as `sumJByPrefix`).

- [ ] Test `lineItemsByPrefix nets a refund`: debit 61090 30.742.234 and credit 61090 222.192 → one item `{ code: '61090', amount: 30520042 }`.
- [ ] Implement; replace `getJLineItems` in `Laporan.jsx` with a call to it.

### Task 2: Neraca "Nilai Buku" takes only its own block

**Files:** Modify `src/utils/reportDelta.js` `buildNeracaRows`. Test as above.

- [ ] Test `Nilai Buku after Aset Dalam Penyelesaian`: base rows [Aset Tetap header, Peralatan 100, Nilai Buku 100, Aset Dalam Penyelesaian 149.139.700, Aset Lainnya header (value null), Aset Tidak Berwujud 70.000.000, Akumulasi Amortisasi −2.916.666,67, Nilai Buku 67.083.333,33, Jumlah Aset Tidak Lancar …]; journals: ADP credit 149.139.700 / Bangunan debit, amortisation 1.458.333,33 → second Nilai Buku = 65.625.000.
- [ ] Reset `runningDelta = 0` on a heading row (`value == null`).

### Task 3: Antasari electricity reroute for July 2026 only

**Files:** `src/utils/lraOutline.js` (`REPORT_LINE_REROUTE` gains `months: ['2026-07']`; `reportLineAccount(code, sub, desc, tanggal)`), `src/utils/journalExpand.js:77` (pass `j.tanggal`).

- [ ] Tests: July "Pembayaran Listrik Pasar Antasari Bulan Juli 2026" → 51002; October "Pembayaran Listrik Kantor Antasari" (2026-10-05) → null; no date → null.

### Task 4: Parkir booked on 41000

**Files:** `src/utils/lraOutline.js` `HEADER_SUBAKUN_REROUTE['41000']` gains `[/parkir/i, '42001']` before `/antasari/`.

- [ ] Tests: `effectiveSubCode('41000','Pendapatan Parkir') === '42001'`; `resolveOutline(extractAccountCode('41000 Pendapatan Bisnis Utama > Pendapatan Parkir'), '', 2) === '1.9'`; `lrRevenueGroup('42001','2026-10-31') === '41'`.

### Task 5: Receivable reclass is not a receipt

**Files:** `src/utils/lraOutline.js` (new `isPiutangReceipt(j)`), `src/pages/LRA.jsx:1050,1165`.

**Interfaces:** `isPiutangReceipt(j) → boolean` for a half-record crediting 11201: false when every code in `j._counterCodes` starts with `112`; true otherwise (including no counter codes).

- [ ] Tests: counter `['11204']` → false; `['11104']` → true; `['11104','11204']` → true; `[]` → true.
- [ ] Use it in both LRA call sites.

### Task 6: 11204 Piutang Bisnis Lainnya

**Files:** `src/utils/reconcileAlias.json` (`"11204": "Piutang Bisnis Lainnya"`), `src/utils/reportDelta.js` `buildArusKasIndirectRows` (row "Piutang Bisnis Lainnya" for 11204 right after Piutang Usaha, only when non-zero).

- [ ] Tests: Neraca from a base without the line + D 11204 3.946.880 → row "Piutang Bisnis Lainnya" 3.946.880, no "(Belum Terpetakan)"; Arus Kas → row "Piutang Bisnis Lainnya" −3.946.880, no "Penyesuaian Lainnya".

### Task 7: October acceptance on the local copy of live data

Not a unit test: reload October on two local copies (the book as uploaded on 10 Nov, and the book with voucher numbers and Kategori), scrape, compare with the lampiran (scripts in the session scratchpad).

- [ ] Expected (both books): spec §7 acceptance figures, except Investasi (out of scope). All four LRA tables, Laba Rugi, Neraca and Arus Kas otherwise line-equal.
- [ ] June–September: LRA tables before/after identical (scrape each month on the untouched copy and on the new build).

### Task 8: Findings engine

**Files:** Create `src/utils/journalChecks.js`; modify `src/utils/lraOutline.js` (new `explainSubAkun(code, sub) → { routed: boolean, code }` for header accounts). Test: `tests/reports/journalChecks.test.mjs`, fixture `tests/fixtures/jurnal_oktober_2026.json` (the JURNAL sheet rows as an array of arrays, built into a workbook in the test and parsed with `extractSnapshot`).

**Interfaces:** Produces
- `checkBook(journals, { period, coa, earlierJournals = [], lra = null }) → Finding[]`
- `Finding = { key, check, severity: 'salah'|'periksa'|'info', title, detail, action, amount, rows: [{ tanggal, bukti, akun, debit, kredit, keterangan }] }`
- `findingsByMonth(journals, { coa, from = FINDINGS_FROM }) → { [period]: Finding[] }`
- `FINDINGS_FROM = '2026-06'`

Checks (ids): `bukti-kosong` (periksa: no voucher number on any journal-book line; or under half while the previous book had over half), `inv-tanpa-kategori` (periksa: 21500 debit paid from 111xx, no investment asset in the journal, no INV Kategori), `kategori-asing` (periksa: Kategori not BAPOK/GERAI/INV), `pokok-tanpa-kategori` (info: 11401/11402 debit without Kategori), `subakun-asing` (periksa: header account 41000/42000/70000/80000 whose sub akun matches no rule), `akun-baru` (info; periksa when the code has no Neraca/Laba Rugi line), `akun-tak-dikenal` (salah: code not in COA), `reklasifikasi` (info: journal without a cash leg whose legs are all 112xx, or all fixed assets 12xxx/13xxx), `koreksi-beban` (info: credit to 5/6/8 or debit to 4/7 not from a reversal of the whole journal), `lampiran-tidak-jumlah` (periksa: an LRA row with |(7)+(8)−(9)| > 1, or a parent ≠ sum of its children on (9)).

- [ ] Tests with the October fixture: book without voucher/Kategori → `bukti-kosong` (241 journals), `inv-tanpa-kategori` 3 rows Rp 74.569.850; book with them → `kategori-asing` for "1.5 E PASAR MALABAR" and "1.5 F PASAR HARUM MANIS", no `bukti-kosong`; both → `reklasifikasi` 23.471.435 and 87.953.600, `koreksi-beban` 222.192, `akun-baru` 11204 and 51003 when earlier journals do not use them; `subakun-asing` for `41000 > Pendapatan Contoh Baru`; lampiran LRA rows of October → `lampiran-tidak-jumlah` on Investasi 1.3 and 1.5.
- [ ] A clean synthetic book → `[]`.

### Task 9: Acknowledgements

**Files:** `server/db/schema.cjs` (table `finding_acks(period TEXT, finding_key TEXT, note TEXT, set_by TEXT, set_at DATETIME, PRIMARY KEY(period, finding_key))`), `server/routes/api.cjs` (`GET /reports/finding-acks` ALL_READ; `POST` {period, key, note} and `DELETE /reports/finding-acks?period=&key=` JOURNAL_WRITE_ROLES; audit log), `src/services/api.js` (`apiGetFindingAcks`, `apiAckFinding`, `apiUnackFinding`). Test: `tests/reports/findingAcks.test.mjs` (server flow like `periodReportServer.test.mjs`).

- [ ] Tests: post → listed; post again → replaced; delete → gone; bad period → 400; kasir → 403 on POST.

### Task 10: Import dialog "Hasil pemeriksaan"

**Files:** `src/components/ExcelImport/ExcelImportModal.jsx` (new prop `existingJournals`; block on the lampiran and preview steps; also show the lampiran path's unknown codes), `src/components/ExcelImport/ImportExcelButton.jsx` (pass through), `src/pages/Jurnal.jsx:729` (pass `state.journals`).

- [ ] Block grouped by severity, each finding expandable to its rows; nothing shown for a clean book; Muat button unchanged.

### Task 11: Bell and Cek Konsistensi

**Files:** `src/components/Layout/TopBar.jsx` (badge = open salah+periksa findings across months ≥ FINDINGS_FROM; panel per month linking `/konsistensi?bulan=<m>`), `src/pages/Konsistensi.jsx` (read `?bulan=`; "Temuan jurnal" block with rows and "Tandai sudah dicek" / "Batalkan"), shared hook `src/components/Findings/useFindings.js` (computes from `state.journals` + `state.coaFlat`, loads acks).

- [ ] No badge when zero; ack removes the finding from the count; failure to load acks → findings still shown.

### Task 12: Docs, full verification, commit

- [ ] CLAUDE.md: new rules and the findings section. `npm run test:reports`, `npm run build`, browser check on the local copy (import dialog for both October books, bell, Konsistensi, ack round-trip). Commit and push the working branch (no deploy).
