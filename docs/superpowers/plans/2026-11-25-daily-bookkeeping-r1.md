# Daily Bookkeeping — Release 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keuangan staff enter vouchers in the app. An SPV Akuntansi or Manajer Keuangan posts them or returns them. The month has a page of its own. The checks show what is wrong at entry and at upload. 2026 report numbers do not move.

**Architecture:** The app is reshaped in place, keeping the stack.
- **Rules.** Voucher rules are pure ESM (`src/utils/voucherRules.js`). The form and the server both use them; the server loads them with a dynamic `import()`.
- **Endpoints.** New ones live in `server/routes/book.cjs`, mounted at `/api/book`.
- **Year guard.** One choke point in `AppContext` hands the old 2026 report pages only 2026 journals (`state.journals`). The new screens use `state.journalsAll`.
- **Database.** Columns and tables are only added, all nullable, so the previous build still runs on the migrated database.

**Tech Stack:** React 18 + Vite 5, Express 5 (CJS), SQLite (`sqlite3`), `node --test`, Playwright for the end-to-end simulation.

**Spec:** `docs/superpowers/specs/2026-11-25-daily-bookkeeping-plan.md` (R1 in §8; screens in §5; checks in §5.11). Mockup: `docs/superpowers/specs/mockups/2026-11-25-daily-bookkeeping.html`.

## Global Constraints

- **2026 must not move.** Every 2026 report (Neraca, Laba Rugi, Arus Kas, LRA, NPD, Buku Besar for each 2026 month and period) shows the same numbers before and after this release.
- **Database changes are only additions.** New columns are nullable or have defaults; there are no renames or drops (`docs/ROLLBACK.md`: going back needs no database restore).
- **Voucher types:** KK Kas Keluar · KM Kas Masuk · BK Bank Keluar · BM Bank Masuk · JM Memorial.
- **Voucher statuses:** `draft` → `pending` (diajukan) → `posted`. `pending` can also go to `returned` (dikembalikan), then back to `pending`. Reports read only `posted`.
- **No. Bukti:** one running number per year, 4 digits ("0188"), unique per year, editable while draft or returned.
- **SOP signer by amount:**
  - under Rp 1.000.000: "Manajer";
  - Rp 1.000.000 up to under Rp 50.000.000: "Direktur Umum & Keuangan";
  - Rp 50.000.000 and above: "Direktur Utama".
  - From Rp 1.000.000 the "sudah ditandatangani" tick is required before posting.
- **Posting in the app:** roles `spv_akuntansi`, `manager_keuangan`, `admin`, `super_admin`; the amount does not decide. Nobody posts their own voucher; `admin` / `super_admin` are exempt, as in the existing journal approve.
- **Writing the Sub Akun list:** the COA_WRITE roles (`spv_akuntansi`, `manager_keuangan`, `admin`, `super_admin`).
- **Sub Akun override (`report_code`):** applies only to journals dated from `2027-01-01`.
- **RKAP numbering:** for 2027 dates it is version 2 (the revised 2026 numbering) until RKAP 2027 is loaded (R2).
- **Exact Indonesian messages** (spec §5.11):
  - "No. Bukti {no} sudah dipakai. Nomor berikutnya yang kosong: {next}."
  - "Tanggal {dd/mm/yyyy} masuk bulan {Bulan YYYY}, yang sudah dikunci."
  - "Baris {n}: Sub Akun belum dipilih."
  - "Baris {n}, {code} {name}: pilih Kategori, BAPOK atau GERAI."
  - "Debit dan kredit belum seimbang — selisih Rp {x}."
  - "Belum dicentang: SPV tidak bisa menyetujui voucher ini sebelum dicentang."
  - "Total yang terbaca tidak sama dengan total JURNAL (baris 2) … Unggahan ditahan sampai diperbaiki."
- **Dates on the new screens:** "14 Jan 2027" (`formatTanggal`).

## Review Focus

1. **A 2027 voucher in a 2026 report.** Several old pages pick journals by month number only (LRA.jsx, NPDReport.jsx, LabaRugiReports.jsx, journalFilters.js). The 2026 pages must never receive a 2027 journal. Test in Task 1; checked again in the simulation.
2. **Two people saving the same No. Bukti at the same moment.** The unique index refuses the second save with the "sudah dipakai" message, not a 500. Test in Task 3.
3. **A returned voucher edited by someone else, or a posted one edited at all.** Only the author (or admin / SPV) edits `draft` / `returned`; posted is read-only. Test in Task 3.
4. **A JURNAL sheet whose row-2 formula covers fewer rows than the data** (`SUM(F4:F543)` with data to row 560). That is a warning that names the rows, not a block. Test in Task 13.
5. **A Memorial voucher with cash lines, or a KK voucher whose line is itself a cash account.** It balances and gets the right Arus Kas type. Test in Task 2.

---

### Task 1: Year guard and the RKAP version by year

**Files:**
- Create: `src/utils/bookYear.js`
- Modify: `src/context/AppContext.jsx` (provider value), `src/utils/lraOutline.js` (`rkapVersion`), `src/components/Findings/useFindings.js`
- Test: `tests/reports/bookYear.test.mjs`

**Interfaces:**
- Produces:
  - `LEGACY_BOOK_YEAR = 2026`;
  - `yearOf(tanggal: string): number|null`;
  - `legacyView(journals: Journal[]): Journal[]` (keeps year ≤ 2026 and undated);
  - `rkapVersion(months, year = 2026)` (2 for every month when `year > 2026`);
  - in the context, `state.journals` (≤ 2026) and `state.journalsAll` (all).

- [ ] **Step 1: Failing tests.**
  - `legacyView([{tanggal:'2026-12-31'},{tanggal:'2027-01-05'},{}])` keeps the first and the third.
  - `rkapVersion([1], 2027) === 2`, `rkapVersion([1]) === 1`, `rkapVersion([9]) === 2`.
- [ ] **Step 2:** `node --test tests/reports/bookYear.test.mjs` → FAIL (module missing).
- [ ] **Step 3: Implement.**
  - Create `bookYear.js`.
  - Change `rkapVersion` to take the optional `year`.
  - In `AppProvider`: `const view = useMemo(() => ({ ...state, journals: legacyView(state.journals), journalsAll: state.journals }), [state])`, and pass `state: view`.
  - In `useFindings`: read `state.journalsAll || state.journals`.
- [ ] **Step 4:** `npm run test:reports` → all pass.
- [ ] **Step 5: Commit.**

### Task 2: Voucher rules (pure, shared by the form and the server)

**Files:**
- Create: `src/utils/voucherRules.js`
- Test: `tests/reports/voucherRules.test.mjs`

**Interfaces:**
- Consumes:
  - from `lraOutline.js`: `resolveOutline`, `resolveWithSubPriority`, `cashBasisPokokOutline`, `categoryKeyForCode`, `lrRevenueGroup`, `rkapVersion`, `isOutOfScopeRevenue`;
  - `src/data/rkapRevisi2026.json`, `src/utils/lrAlias.json`, `src/utils/reconcileAlias.json`.
- Produces:
  - `VOUCHER_TYPES`: `{ KK|KM|BK|BM|JM: { label, cashSide: 'debit'|'kredit'|null, bank: boolean, tipe } }`.
  - `sopSigner(amount): string`.
  - `needsSignatureTick(amount): boolean`.
  - `nextVoucherNo(usedNos: string[]): string`.
  - `lineDestination(line, { tanggal, counterCodes }): { lra: {kategori, outline, nama, anggaran}|null, lr: string|null, neraca: string|null, need: null|'kategori', text: string }`.
  - `buildVoucherJournal(v, { coaName: (code)=>string }): JournalPayload`. It adds the cash/bank leg for KK/KM/BK/BM and sets `tipe_transaksi` (KK/BK pengeluaran, KM/BM pendapatan, JM transfer).
  - `voucherProblems(v, { coaCodes: Set<string>, subAkunByCode: Map<string,string[]>, lockedPeriods: string[], usedNos: string[] }): Array<{ field, line?, message, blocking: true }>`.

- [ ] **Step 1: Failing tests.**
  - `lineDestination({akun_code:'61060', akun_name:'Beban Konsumsi Rapat dan Tamu', sub_akun:'Beban Makan Minum Rapat'}, {tanggal:'2027-01-14'})` returns:
    - `lra` `{kategori:'bebanUmum', outline:'6.1', nama:'Makan Minum Rapat'}`;
    - `lr === 'Beban Konsumsi Rapat dan Tamu'`.
  - `42001` on 2027-01-12 → `lra.outline '1.9'`, `lr 'Pendapatan Bisnis Utama'`.
  - `11401` with no Kategori and counter `11101` → `need 'kategori'`. With `kategori:'GERAI'` → `lra.outline '4.2'`.
  - `nextVoucherNo(['0186','0187'])==='0188'` and `nextVoucherNo([])==='0001'`.
  - `sopSigner(999999)==='Manajer'`, `sopSigner(1000000)==='Direktur Umum & Keuangan'`, `sopSigner(50000000)==='Direktur Utama'`.
  - `buildVoucherJournal` for a KK on cash 11101 with lines 1.250.000 + 350.000:
    - the last line is `{akun_code:'11101', kredit:1600000}`;
    - `debit===kredit===1600000`;
    - `tipe_transaksi==='pengeluaran'`.
  - `voucherProblems` returns the exact messages for:
    - No. Bukti '0187' already used;
    - tanggal '2026-12-05' with '2026-12' locked;
    - line 2 without Sub Akun when the account has Sub Akun in the list;
    - 11401 without Kategori;
    - a JM where debit ≠ kredit.
  - Review Focus 5: a JM line on 11101 balances, and its `tipe_transaksi` is `'transfer'`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
  - LRA name and budget come from `rkapRevisi2026.json[kategori]`, matched by outline.
  - The Laba Rugi line: for 41/42 the alias key comes from `lrRevenueGroup(code, tanggal)`; otherwise the longest `lrAlias` prefix.
  - The Neraca line: `reconcileAlias[code]`.
  - The Rupiah amount in messages is formatted id-ID with no decimals.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit.**

### Task 3: Server — migrations, `/api/book` endpoints, Sub Akun seed

**Files:**
- Modify: `server/db/schema.cjs`, `server/config/rbac.cjs` (`BOOK_APPROVE`), `server/index.cjs` (call `seedSubAkun()`), `server/routes/api.cjs` (`router.use('/book', …)`)
- Create: `server/routes/book.cjs`, `server/db/subAkunSeed.cjs`
- Test: `tests/reports/bookVouchers.test.mjs` (real server on a scratch DB copy; logs in as `staff_keuangan` and `spv_akuntansi` with the default password)

**Interfaces:**
- **New `journals` columns:**
  - `voucher_type TEXT`, `voucher_no TEXT`, `voucher_year INTEGER`;
  - `party TEXT`, `cash_account TEXT`;
  - `submitted_at TEXT`;
  - `approved_by TEXT`, `approved_at TEXT`;
  - `returned_by TEXT`, `returned_at TEXT`, `returned_note TEXT`;
  - `sop_signed INTEGER DEFAULT 0`.
- **Unique index:** `ux_journals_voucher_no ON journals(voucher_year, voucher_no) WHERE voucher_no IS NOT NULL AND voucher_no <> ''`.
- **Table `sub_akun`:** `id`, `account_code`, `name`, `report_code`, `active` (default 1), `source`, `updated_by`, `updated_at`; `UNIQUE(account_code, name)`.
- **`subAkunSeed.seedSubAkun(): Promise<number>`:** `INSERT OR IGNORE` of the distinct non-empty `(akun_code, sub_akun)` pairs from `journal_lines`.
- **Endpoints (`/api/book`):**

  | Method and path | Who | Returns |
  |---|---|---|
  | `GET /sub-akun` | all | rows |
  | `POST /sub-akun` | COA_WRITE | 201, or 409 if it exists |
  | `PUT /sub-akun/:id` | COA_WRITE | the row |
  | `POST /sub-akun/seed` | COA_WRITE | `{added}` |
  | `GET /next-voucher-no?year=` | JOURNAL_WRITE | `{next}` |
  | `POST /vouchers` | JOURNAL_WRITE | `{ voucher_type, voucher_no, tanggal, party, keterangan, cash_account, lines, sop_signed, submit }` → 201 `{ id:'VC-<year>-<nnnn>', status }`, or 400 `{ error, problems }` |
  | `PUT /vouchers/:id` | author / BOOK_APPROVE / admin | only for `draft` / `returned` |
  | `POST /vouchers/:id/submit` | JOURNAL_WRITE | |
  | `POST /vouchers/:id/post` | BOOK_APPROVE | 403 `SELF_APPROVAL_FORBIDDEN`; 409 `SOP_NOT_SIGNED`; 409 `PERIOD_LOCKED`; 409 `NOT_PENDING` |
  | `POST /vouchers/:id/return` | BOOK_APPROVE | `{note}` is required |
  | `DELETE /vouchers/:id` | author / admin | `draft` / `returned` only |

- [ ] **Step 1: Failing integration tests.**
  1. Staff create a KK draft → 201, status `draft`, and `journal_lines` include the 11101 credit.
  2. The same No. Bukti again → 400, and `problems[0].message` starts with "No. Bukti 0001 sudah dipakai".
  3. Submit → `pending`.
  4. Staff post → 403.
  5. SPV posts a pending Rp 1.600.000 voucher with `sop_signed:0` → 409 `SOP_NOT_SIGNED`.
  6. SPV returns it with a note → `returned` with `returned_note`.
  7. Staff fix it (`sop_signed:1`) and submit; SPV posts → `posted`, `approved_by === 'spv_akuntansi'`.
  8. SPV creates and submits their own voucher, then posts it → 403 `SELF_APPROVAL_FORBIDDEN`.
  9. Another user (`manager_keuangan`) edits a staff draft → allowed. `kasir_pasar` gets 403.
  10. A posted voucher cannot be edited (409).
  11. `POST /sub-akun/seed` → `added ≥ 0`. `GET /sub-akun` lists a pair created through `/journals` lines.
  12. Two parallel POSTs with the same number → one 201 and one 400 (Review Focus 2).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
  - The validation calls `voucherProblems` from `src/utils/voucherRules.js`, loaded once with `await import()`.
  - `usedNos` come from the vouchers of that year, excluding the one being edited.
  - A unique-index conflict on insert maps to the same 400 "sudah dipakai" problem.
  - The id counter is `counters.next('nextVoucher' + year)`.
- [ ] **Step 4:** `npm run test:reports` → PASS.
- [ ] **Step 5: Commit.**

### Task 4: Sub Akun overrides in the reports (2027 only)

**Files:**
- Create: `src/utils/subAkunRegistry.js`
- Modify: `src/utils/lraOutline.js` (`reportLineAccount`)
- Test: `tests/reports/subAkunRegistry.test.mjs`

**Interfaces:**
- Produces:
  - `setSubAkunOverrides(rows: SubAkunRow[])`;
  - `overrideFor(code, sub, tanggal): string|null`;
  - `reportLineAccount` returns `overrideFor(...)` first when it is not null.

- [ ] **Step 1: Failing tests.** With `{account_code:'61050', name:'Listrik Pasar Hanyar', report_code:'51002', active:1}`:
  - `reportLineAccount('61050','Listrik Pasar Hanyar','', '2027-01-15') === '51002'`;
  - `reportLineAccount('61050','Listrik Pasar Hanyar','', '2026-10-15') === '61050'`;
  - an inactive row gives no override.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** PASS, together with all of `npm run test:reports`.
- [ ] **Step 5: Commit.**

### Task 5: Client data — API wrappers, working month, voucher actions

**Files:**
- Create: `src/utils/workingMonth.js`
- Modify: `src/services/api.js`, `src/context/AppContext.jsx`
- Test: `tests/reports/workingMonth.test.mjs`

**Interfaces:**
- **API wrappers:**
  - `apiGetSubAkun`, `apiCreateSubAkun`, `apiUpdateSubAkun`, `apiSeedSubAkun`;
  - `apiNextVoucherNo(year)`;
  - `apiCreateVoucher(body)`, `apiUpdateVoucher(id, body)`, `apiSubmitVoucher(id)`, `apiPostVoucher(id)`, `apiReturnVoucher(id, note)`, `apiDeleteVoucher(id)`.
- **`workingMonth.js`:**
  - `monthOptions({ now, lockedPeriods, periodModes }): [{ value:'YYYY-MM', label:'Januari 2027', state:'terbuka'|'dikunci'|'dari Excel' }]`, for 2026-01 … the December after `now`'s year;
  - `defaultWorkingMonth(now): 'YYYY-MM'`;
  - `formatTanggal('2027-01-14') === '14 Jan 2027'`;
  - `bulanLabel('2027-01') === 'Januari 2027'`.
- **Context:**
  - `state.subAkun`;
  - `state.workingMonth`, kept in `localStorage['perumda-working-month']`;
  - actions: `setWorkingMonth(ym)`, `saveVoucher(body, { id, submit })`, `submitVoucher(id)`, `postVoucher(id)`, `returnVoucher(id, note)`, `deleteVoucher(id)`, `saveSubAkun(row)`.
  - After `subAkun` loads it calls `setSubAkunOverrides`.

- [ ] **Step 1: Failing tests.**
  - `formatTanggal`.
  - `bulanLabel`.
  - `monthOptions` marks a locked month `dikunci`, an audited 2026 month `dari Excel`, and 2027-01 `terbuka`.
  - `defaultWorkingMonth(new Date('2027-01-14'))==='2027-01'`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit.**

### Task 6: Menu, working month, search, routes

**Files:**
- Create: `src/components/Layout/navItems.js`
- Modify: `src/components/Layout/Sidebar.jsx`, `src/components/Layout/TopBar.jsx`, `src/App.jsx`, `src/data/roles.js` (`MODULE_ROLES`)
- Test: `tests/reports/navItems.test.mjs`

**Interfaces:**
- `NAV_GROUPS` (as spec §5.1).
- `menuFor(role): [{ group, items:[{path, label, icon}] }]`.
- **Routes:**
  - `/home` → BerandaBulan;
  - `/dashboard` → old Dashboard;
  - `/input-voucher`, `/daftar-voucher`, `/persetujuan`, `/sub-akun`;
  - `/konsistensi` keeps its page, with the menu label "Cek Data".
- `MODULE_ROLES`:
  - `/persetujuan`: BOOK_APPROVE;
  - `/input-voucher` and `/daftar-voucher`: JOURNAL_WRITE ∪ APPROVE_ROLES ∪ AUDIT_READ;
  - `/sub-akun`: COA_WRITE ∪ JOURNAL_WRITE (read for staff).
- The top bar search navigates to `/daftar-voucher?q=<text>`.

- [ ] **Step 1: Failing tests.**
  - `menuFor('staff_keuangan')` has the groups Kerja harian / Tutup bulan / Laporan / Data induk, no `/persetujuan`, and no Lainnya.
  - `menuFor('super_admin')` has Lainnya with `/piutang`.
  - `canAccessPath('staff_keuangan','/persetujuan') === false`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**
  - The Sidebar renders `menuFor(role)`, with counts for Persetujuan (pending vouchers) and Cek Data (open findings).
  - The TopBar holds the working-month select (`monthOptions`) and the search.
- [ ] **Step 4:** PASS. `npm run build` succeeds.
- [ ] **Step 5: Commit.**

### Task 7: Input Voucher page

**Files:**
- Create: `src/pages/InputVoucher.jsx`

**Interfaces:**
- Consumes: Task 2 rules; Task 5 `saveVoucher` / `apiNextVoucherNo` / `state.subAkun` / `state.workingMonth`.

**Layout** (mockup "Input Voucher"):
- the type tabs;
- No. Bukti (prefilled from `apiNextVoucherNo`), Tanggal, the cash/bank account (11xxx with a Neraca alias, for KK/KM/BK/BM), Dibayar kepada / Diterima dari, Keterangan;
- lines: Akun search over COA posting accounts; Sub Akun select from `state.subAkun` for that account; Kategori chips only when `lineDestination(...).need === 'kategori'`; Keterangan; Jumlah. For JM, a debit and a kredit column instead of Jumlah;
- under each line, the `lineDestination(...).text`;
- the summary card: total, balance, SOP signer, "sudah ditandatangani", "Masuk ke laporan";
- the problem box listing `voucherProblems`.

**Behaviour:**
- *Ajukan* is disabled while problems exist.
- `?id=` loads a draft or returned voucher for editing and shows the return note.
- "Salin voucher terakhir" copies the user's last voucher of the same type.
- Ctrl+S saves the draft; Ctrl+Enter submits; Enter in the last Jumlah adds a row.

- [ ] **Step 1: Build.** `npm run build` succeeds.
- [ ] **Step 2: Verify** in the simulation (Task #18 of the session): a right voucher saves and submits; each wrong case shows its message and keeps *Ajukan* disabled.
- [ ] **Step 3: Commit.**

### Task 8: Persetujuan page

**Files:**
- Create: `src/pages/Persetujuan.jsx`

**Layout** (mockup "Persetujuan"):
- pending vouchers, oldest first;
- filters: semua / ada temuan / tanda tangan belum dikonfirmasi / ≥ Rp 50 jt;
- for each: report lines (`lineDestination`), SOP signer and tick, author, findings (`checkBook` for its month, matched by No. Bukti);
- tick several → "Setujui & posting";
- "Kembalikan dengan catatan" (note required);
- a detail panel for the selected voucher.

Server answers (403 / 409) show as messages.

- [ ] **Step 1: Build.** `npm run build` succeeds.
- [ ] **Step 2: Verify** in the simulation.
- [ ] **Step 3: Commit.**

### Task 9: Daftar Voucher page

**Files:**
- Create: `src/pages/DaftarVoucher.jsx`

**Contents:**
- the working month's journals from `state.journalsAll`, 50 per page;
- filters: status (draft / diajukan / dikembalikan / diposting) and type;
- search `?q=` on No. Bukti, keterangan, account and Sub Akun;
- columns No. Bukti · Tanggal ("14 Jan 2027") · Jenis · Keterangan · Jumlah · Status · Diinput;
- actions: Edit (draft / returned, author or SPV), Hapus (draft, author), Detail;
- 2026 months are read-only (lampiran journals).

- [ ] **Step 1: Build.** `npm run build` succeeds.
- [ ] **Step 2: Verify** in the simulation.
- [ ] **Step 3: Commit.**

### Task 10: Beranda Bulan

**Files:**
- Create: `src/utils/monthProgress.js`, `src/pages/BerandaBulan.jsx`
- Test: `tests/reports/monthProgress.test.mjs`

**Interfaces:**
- `monthProgress(journalsAll, ym, { lockedPeriods, openFindings, today }): { vouchers, drafts, pending, pendingAmount, oldestPending, returned, posted, unsignedBig: Voucher[], locked, steps: [{key:'input'|'approve'|'check'|'reconcile'|'lock', done:boolean, text}] }`.

- [ ] **Step 1: Failing tests.** For a month with 2 drafts, 3 pending (one Rp 62.500.000 unsigned), 5 posted and 2 open findings:
  - the counts;
  - `unsignedBig.length === 1`;
  - `steps.find(s=>s.key==='lock').done === false`;
  - with everything posted and no findings, the lock step reads "Bisa dikunci".
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement** `monthProgress`, and the page as in the mockup:
  - the steps;
  - "Perlu tindakan";
  - Kas & Bank from all journals with COA `saldo_awal` (accounts 111xx);
  - the month's penerimaan and beban realisation ("anggaran 2027 belum dimuat" when the year has no RKAP);
  - the last vouchers.
- [ ] **Step 4:** PASS. The build succeeds.
- [ ] **Step 5: Commit.**

### Task 11: Akun & Sub Akun page

**Files:**
- Create: `src/pages/SubAkun.jsx`

**Contents:**
- Sub Akun grouped by account, each with its report line (`lineDestination`) and a usage count;
- search;
- for COA_WRITE roles:
  - add a Sub Akun to an account;
  - rename it;
  - set "ikut baris laporan akun …" (`report_code`, a COA posting code);
  - active / inactive;
- a "Muat dari jurnal 2026" button (`apiSeedSubAkun`);
- read-only for staff.

- [ ] **Step 1: Build.** The build succeeds.
- [ ] **Step 2: Verify** in the simulation: an SPV adds "Listrik Pasar Hanyar" under 61050; staff can then pick it in a voucher.
- [ ] **Step 3: Commit.**

### Task 12: Voucher findings (Cek Data, the bell)

**Files:**
- Modify: `src/utils/journalChecks.js`
- Test: `tests/reports/journalChecks.test.mjs` (new cases)

**Interfaces:**
- `checkBook` also runs `checkVoucherNumbers(journals)` and `checkVoucherStatus(journals, today)` on vouchers (journals with `voucher_type`).
  - A duplicate No. Bukti → `salah`, "No. Bukti {no} dipakai {n} kali".
  - A gap → `info`, "Nomor bukti {no} tidak ada".
  - A pending voucher ≥ Rp 1 jt without the tick → `periksa`, "Tanda tangan belum dikonfirmasi".
  - A draft older than 3 days → `info`, "Draf {no} belum diajukan sejak {d}".
- `checkPending`:
  - leaves drafts out;
  - for vouchers, its action reads "Buka Persetujuan".

- [ ] **Step 1: Failing tests** for each of the four.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** PASS, together with the existing journalChecks tests.
- [ ] **Step 5: Commit.**

### Task 13: Cek Berkas L1–L2 in the import dialog

**Files:**
- Create: `src/utils/fileChecks.js`
- Modify: `src/utils/reportSnapshot.js` (export `journalSheetLayout(data)` and use it in `parseJournalSheet`), `src/components/ExcelImport/ExcelImportModal.jsx`
- Test: `tests/reports/fileChecks.test.mjs`

**Interfaces:**
- `checkJournalSheet(ws, { period }): { rowsRead, readTotals:{debit,kredit}, sheetTotals:{debit,kredit,row,range}|null, skipped:[{row, reason, debit, kredit}], outside:[{row, tanggal}], beyond:[row], blocking:boolean, items:[{level:'Berkas'|'Baris', status:'ok'|'warn'|'block', text}] }`.
- **Skip reasons:**
  - "No. Akun #N/A";
  - "jumlah berupa teks";
  - "tanpa tanggal";
  - "tanpa akun".
- **Blocking:**
  - the read totals differ from the row-2 totals over the formula's range by more than Rp 1;
  - rows after the range are a warning only.

- [ ] **Step 1: Failing tests** on workbooks built with `XLSX.utils.aoa_to_sheet` in the October layout (row 2 totals in F/G, row 3 header `Tgl` / `Akun` / `Sub Akun` / `Keterangan` / `Kategori`, data from row 4):
  - **(a) a clean sheet:** `blocking:false`, and the totals match.
  - **(b) a text amount:** row 6 with "1.000.000" as text → skipped "jumlah berupa teks", and blocking.
  - **(c) an #N/A code:** a row whose No. Akun is `#N/A` with no account name → skipped "No. Akun #N/A".
  - **(d) data beyond the formula range:** F2 `SUM(F4:F5)` with data in rows 4–7 → `beyond` = [6, 7], a warning, not blocking.
  - **(e) a date outside the month:** a 2026-10 date on a `NOVEMBER 2026` sheet → `outside` holds its row.
  - The existing `reportSnapshot` tests still pass.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**
  - The dialog shows "Cek Berkas" above "Hasil pemeriksaan", for every JURNAL sheet of the file.
  - While `blocking`, the Muat buttons are disabled and labelled "Muat · perbaiki baris yang hilang dulu".
- [ ] **Step 4:** PASS. The build succeeds.
- [ ] **Step 5: Commit.**

### Task 14: Small fixes and documentation

**Files:**
- Modify:
  - `src/pages/Jurnal.jsx`: the column header "No. Akun" → "No. Bukti";
  - `CLAUDE.md`: a "Pembukuan harian" section covering statuses, endpoints, the year guard, Sub Akun overrides, Cek Berkas and the new tests;
  - the spec STATUS line.

- [ ] **Step 1: Edit.**
- [ ] **Step 2:** `npm run test:reports` and `npm run build` → green.
- [ ] **Step 3: Commit.**

## Not in this release (spec §8, R2 and later)

These come later:
- the RKAP 2027 upload;
- year-aware Laporan / LRA / NPD for 2027 months;
- the opening-balance table;
- "JURNAL untuk Excel" and "Bandingkan saja";
- Cek Berkas L3–L4;
- bank reconciliation reshaped;
- Kunci bulan on the month page (R1 links to the existing lock);
- Unduh lampiran;
- reports in one place;
- the June–October rule check (scripted analysis, run separately).
