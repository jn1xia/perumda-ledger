# Daily bookkeeping in the app — plan

> **STATUS 2026-11-25: plan for the owner's review. Nothing built yet.**
>
> **Owner's decisions (24–25 November 2026):**
> - Bookkeeping moves into the app day by day (option **B**).
> - For now, only **Keuangan staff** enter.
> - For now, approvals stay **inside Keuangan**.
> - The app is **reshaped in place**, in releases (option **1**).
> - The mockup is accepted.
>
> Calls I made myself are marked **(my call)**; please confirm or change them.
>
> **Mockup:** [`mockups/2026-11-25-daily-bookkeeping.html`](mockups/2026-11-25-daily-bookkeeping.html).
>
> **Background:**
> - [`2026-11-24-ui-ux-audit.md`](2026-11-24-ui-ux-audit.md) (UI/UX check);
> - [`2026-11-24-monthly-mismatch-and-data-checker-design.md`](2026-11-24-monthly-mismatch-and-data-checker-design.md)
>   (why the reports differ every month).

## 1. Intent

Bagian Keuangan should feel that the app is the natural place to do the bookkeeping,
not an extra step after Excel.

Today Keuangan keep the books in an Excel workbook (the JURNAL sheet plus formula
sheets) and upload it once a month. Every one of the 1,968 journals on live arrived that
way; **none were typed in the app**. Two problems follow:

- **The same reports are calculated twice, by two methods.** The workbook groups by
  account name and Sub Akun text; the app groups by account code and fixed rules. The two
  drift apart every month, and someone finds the gap by eye.
- **The app is a catalogue of 24 modules for one monthly job.** Half the menu holds no
  data. The monthly routine is spread over five pages, each opening on a different month,
  and on an office laptop the main buttons sit off-screen.

When Keuangan record each transaction in the app as it happens, there is **one
calculation**. The form shows where each line will land in the reports at the moment it
is typed. A wrong line is caught that day, not at the end of the month.

## 2. Goals, non-goals, anti-goals

**Goals**
- G1. Keuangan staff record every transaction in the app as a voucher, from 1 January 2027.
- G2. The SPV Akuntansi or Manajer Keuangan checks and posts each voucher in the app. The
  app records who entered it, who approved it, and when.
- G3. Each voucher line shows its report destination before it is saved: the LRA line, the
  Laba Rugi line and the budget left. Where the account alone cannot decide the line,
  the form asks.
- G4. One working month for the whole app, and a month page that shows where the month
  stands and the next step.
- G5. The monthly output that goes out is unchanged: the lampiran in today's layout.
- G6. A safe changeover: for January and February 2027 the app's reports are checked
  against Keuangan's workbook before Excel is dropped.

**Non-goals (for now)**
- Entry by the kasir at the markets, and entry on a phone.
- Running the SOP approvals (Direktur Umum & Keuangan, Direktur Utama) inside the app.
  Those signatures stay on paper.
- A new look or a rewrite. Option 1 keeps the stack, the style and the report rules.
- Reviving the unused modules (Piutang, Hutang, Persediaan, BBM, PO/SO, E-Faktur).

**Anti-goals (a failure even if it "works")**
- Keuangan have to type everything twice during the changeover.
- Any report changes its numbers for 2026 because of this work.
- A Sub Akun or Kategori can be typed freely and silently land on the wrong line.
- Starting on 1 January with a first release that is not ready. A late start is better
  than a bad one (§9).

## 3. Constraints and facts

- **Time.** About five weeks to 1 January 2027, including Christmas and New Year.
- **Volume.**

  | | Per month (2026) |
  |---|---|
  | Journals | 115–280 |
  | Journal lines | 285–595 |

  That is roughly 5–15 vouchers (15–30 lines) a working day, for a few people.
- **Voucher numbers.**
  - The workbook uses a running number in "No. Bukti" (532, 540 …).
  - About a quarter of the September–October journals have none.
- **Kategori.**
  - It is used on few lines: BAPOK and GERAI (Beban Pokok 4.1 / 4.2) and INV.
  - A few lines carry market codes such as "1.5 F PASAR HARUM MANIS". The app cannot read
    those (question K3 to Keuangan is still open).
- **Accounts and Sub Akun.**
  - Keuangan book at the group account with a Sub Akun text, for example
    `61060 Beban Konsumsi Rapat dan Tamu › Beban Makan Minum Rapat`.
  - The report rules read that text: `lraOutline.resolveWithSubPriority`,
    `HEADER_SUBAKUN_REROUTE`, `cashBasisPokokOutline`, `investasiLegOutline`,
    `reportLineAccount`.
- **The app is built around 2026.** This is the biggest technical risk.
  - `journalFilters.MONTHS` and `PERIOD_PRESETS` are fixed to 2026.
  - `rkapVersion` looks only at the month number, so January–August 2027 would use the
    old 2026 numbering.
  - The LRA seeds from "audited April".
  - "2026" appears 20–40 times in each of LRA.jsx, Laporan.jsx, lraOutline.js and
    api.cjs.
- **What already exists and gets reused:**
  - **Vouchers:** the Voucher page (KM / KK / BM / BK / JU / JM groups, journals with
    `bukti LIKE 'VC-%'`).
  - **Approvals:**
    - the SOP limits `APPROVAL_THRESHOLDS` with `canApproveAmount` and
      `requiredApproverLabel`;
    - approve / unapprove endpoints with a self-approval guard;
    - `journals.created_by`.
  - **Users and periods:** user management in Pengaturan → Pengguna; period locks.
  - **Checks:** the journal findings (`journalChecks.checkBook`, `finding_acks`, the
    bell, Cek Konsistensi).
  - **Reports:**
    - the report rules and aliases (`lraOutline.js`, `lrAlias.json`,
      `reconcileAlias.json`, `rkapRevisi2026.json`);
    - the per-page Excel exports.
- **What is missing:**
  - who approved, and when (no `approved_by` / `approved_at`);
  - personal logins (today there is one shared account per role);
  - No. Bukti and Kategori on the entry forms;
  - a Sub Akun master list;
  - an RKAP per year;
  - opening balances per year;
  - an upload that compares without loading.

## 4. Approaches considered

| | Approach | Trade-off | Decision |
|---|---|---|---|
| 1 | **Reshape the current app in releases**: same app, report rules and look; daily-work screens first, structure tidied around them | Usable soonest, lowest risk, keeps the report rules tuned all year; the old code's weight stays and gets slimmed as each page is touched | **Chosen by the owner** |
| 2 | New workspace beside the old screens, old pages under "Lainnya" until retired | Cleanest and fastest feel, but two looks side by side for months, more to finish by 1 January, and report screens rebuilt or wrapped, each a new mismatch risk | Not chosen |
| 3 | Full rewrite | Cannot be ready for January; reopens every report rule settled in 2026 | Dropped |

## 5. The design

The mockup shows §5.1–§5.4.

### 5.1 Menu and the working month

**Menu, grouped by task** (staff see only what their role uses):

| Group | Items |
|---|---|
| — | Beranda Bulan |
| Kerja harian | Input Voucher · Daftar Voucher · Persetujuan (count) |
| Tutup bulan | Cek Data (count) · Rekonsiliasi |
| Laporan | Laporan Keuangan · LRA & NPD |
| Data induk | Akun & Sub Akun · Anggaran (RKAP) · Aset Tetap |
| — | Pengaturan · Lainnya |

- **Lainnya** holds the unused modules. It is shown to admin only.
- **Removed from the menu:**
  - Import Data: one import stays, in Daftar Voucher, for the changeover and archive.
  - Audit Recap: a developer checklist.
  - Anggaran vs Realisasi: covered by LRA & NPD.
  - The Panduan Pengguna tab moves to the user menu.

**The working month**
- It sits in the top bar ("Januari 2027 · Terbuka"), is chosen once, and applies to every
  page.
- The list shows each month's state: open, locked, or "from Excel" for 2026.
- The list also offers the period views: TW, Semester, Tahun.
- It replaces the per-page month bars.

**The bell and Cek Data become one signal.** The red dot on Cek Konsistensi merges into
the bell's count.

### 5.2 Beranda Bulan (home)

- **The month in five steps**, each with its count and a link:
  1. Input transaksi
  2. Diperiksa & diposting
  3. Cek data
  4. Rekonsiliasi
  5. Kunci & laporan

  Step 5 ("Kunci bulan") is available only when steps 1–4 are clear: no drafts, nothing
  waiting, findings handled, bank reconciled. **(my call)**
- **Perlu tindakan:**
  - vouchers waiting, and the oldest one;
  - vouchers whose signature isn't confirmed;
  - drafts;
  - findings.
- **The month's figures:** Kas & Bank, and penerimaan / beban against the month's budget.
- **Masa transisi card** (January–February 2027 only), see §6.
- **Last vouchers**, with their status.

### 5.3 Input Voucher

**Voucher types**

| Code | Type |
|---|---|
| KK | Kas Keluar |
| KM | Kas Masuk |
| BK | Bank Keluar |
| BM | Bank Masuk |
| JM | Memorial (both sides typed) |

For KK / KM / BK / BM the cash or bank account is chosen once ("Dibayar dari" /
"Diterima di"). The opposite side is filled in automatically.

The Arus Kas type comes from the voucher type, so staff are not asked for it:
- KM / BM: receipt;
- KK / BK: payment;
- JM: non-cash, unless a cash line is present.

**Header fields**
- **No. Bukti**: the next number, which can be changed to match the paper. A duplicate is
  refused; a gap is shown on the month page. **(my call:** one running number per year
  for all types, as the workbook does today. See question O3.)
- **Tanggal**: must fall in an open month.
- **Dibayar kepada / Diterima dari**
- **Keterangan**

**Lines:** Akun · Sub Akun · Keterangan baris · Jumlah.
- Akun is a search over code and name. Sub Akun is a list from the Sub Akun master
  (§5.6).
- Under each line, the form shows where it lands, using the same rules the reports use:
  - the LRA line;
  - the Laba Rugi line;
  - for a cash or bank account, its Neraca line;
  - the budget left on that LRA line.
- **Where the account and Sub Akun cannot decide the line, the form asks.**
  - Kategori BAPOK / GERAI on 11401.
  - An investment line on 12xxx, 12300 and 21500. The market lines that today hide in
    Kategori become a choice from the LRA Investasi lines.
- **(my call)** A new Sub Akun cannot be typed in a voucher. The SPV adds it in Data
  Induk, together with its report line. This is the control that stops silent
  mismatches; the cost is a short wait the first time a new kind of expense appears.

**Bukti fisik (SOP)**
- From the amount the form shows which signature the paper needs:
  - under Rp 1 jt: Manajer;
  - Rp 1 jt up to Rp 50 jt: Direktur Umum & Keuangan;
  - Rp 50 jt and above: Direktur Utama.
- A tick says the paper is signed. A scan can be attached; it is optional.

**Speed**
- "Salin voucher terakhir".
- Templates (salaries, electricity and water, vehicle rent, parking deposit; the builder
  derives the list from the 2026 journals).
- Keyboard-first: Tab moves between fields, Enter adds a row, Ctrl+S saves the draft,
  Ctrl+Enter submits.

**Actions**
- *Simpan draf.*
- *Simpan & ajukan ke SPV.* The voucher must balance; required choices must be made.

### 5.4 Persetujuan (SPV Akuntansi, Manajer Keuangan)

**The list of submitted vouchers** shows:
- number, date, type, description and amount;
- the report lines;
- the SOP signer, and whether the tick is set;
- who entered it;
- findings.

Filters: all · with a finding · signature not confirmed · Rp 50 jt and above.

**Actions**
- **Setujui & posting** for one or many. A posted voucher goes into Buku Besar and every
  report.
- **Kembalikan dengan catatan.** The voucher goes back to its author, with the note, as
  "dikembalikan".

**Rules**
- Nobody approves their own voucher. The server already has this guard; with personal
  logins it starts to mean something.
- **(my call)** A voucher that needs a director's signature cannot be approved until the
  author has ticked "already signed".
- The app saves `approved_by` and `approved_at` on every posting, and the same for
  returns and un-approvals.

### 5.5 Daftar Voucher (today's Jurnal page, reshaped)

- It shows the working month only, split into pages (50 per page).
- Filters: status (draft, submitted, returned, posted) and type.
- Search: number, account, text.
- The columns are labelled correctly ("No. Bukti", not "No. Akun"). Dates are written
  "14 Jan 2027". Zero amounts are blank.
- The main actions sit on screen at 1366 px. Lock and "Cek Selisih" move to the month
  page.
- The Excel import stays here, for the changeover (§6) and for archives.

### 5.6 Data induk

**Akun & Sub Akun** — a new master list: one row per Sub Akun with:
- its group account and name;
- its report lines: LRA category and outline, Laba Rugi line, and an optional reroute;
- a status (active or inactive).

How the list is built and kept:
- It is seeded from every Sub Akun used in 2026, with the line the current rules give
  it.
- Variants of the same name (case, spacing, typos) are merged during the review.
- The SPV reviews it once, so Keuangan confirm the mapping a single time instead of
  month after month.
- **(my call)** The list governs vouchers dated from 1 January 2027. 2026 keeps the coded
  rules, so a change made during the review cannot move a 2026 number. That is tested.

**Kategori** — a short list: BAPOK, GERAI, INV, plus the LRA Investasi lines. It is the
same for the form and the reports.

**Anggaran (RKAP)** — an RKAP per year:
- lines with outline, name, annual budget and monthly target;
- uploaded from Keuangan's RKAP workbook;
- revisions are uploaded the same way and take effect from their month;
- it replaces the budget rows that today come from each month's lampiran.

### 5.7 Closing the month

- **Cek Data:**
  - the journal findings, run on typed vouchers;
  - new checks for a missing No. Bukti, a gap or duplicate in the numbers, a signature not
    confirmed, and a draft older than 3 days.
- **Rekonsiliasi:**
  - bank by bank, statement balance against ledger balance with differences explained
    (the existing Rekonsiliasi Bank page, reshaped);
  - the Buku Besar ↔ Neraca adjustment (`ADJ-NRC`) is not used from 2027, because the
    app's Neraca is the official one.
- **Kunci bulan** (Manajer Keuangan):
  - it locks the month (existing locks);
  - unlocking needs super_admin and a reason, which is logged.
- **Laporan:**
  - the reports for the month and its periods (TW, Semester, Tahun);
  - **Unduh lampiran**: one workbook in today's lampiran layout (Neraca, Laba Rugi,
    Arus Kas, the four LRA sheets, NPD, CALK). The October 2026 lampiran is the
    reference layout.

### 5.8 Year 2027 groundwork (required before the first month-end)

- **Year-aware periods.**
  - The working month carries its year.
  - Month lists and TW / Semester / Tahun presets are built per year (replacing the
    fixed 2026 `MONTHS` / `PERIOD_PRESETS`).
  - The default month is the latest open month.
- **Opening balances 2027.**
  - An opening-balance entry per balance-sheet account (1xxxx, 2xxxx, 3xxxx) dated
    1 January 2027.
  - The 2026 result is closed into Saldo Laba (Rugi) Tahun Lalu. Revenue and expense
    accounts start 2027 at zero.
  - COA `saldo_awal` stays as the 2026 opening balance.
  - It is provisional from the latest 2026 Neraca available, and replaced when the
    December 2026 Neraca is final (and again after the 2026 audit, if adjusted).
  - The month page shows "saldo awal sementara" until then.
- **LRA / NPD for 2027.**
  - Realisation starts at zero on 1 January, with the RKAP 2027 lines and targets.
  - NPD takes its pagu from the same RKAP rows.
  - No "audited April" seed.
  - The RKAP version is chosen by year and month, not by month number alone.
- **Rules with dates** (Parkir from 2026-08, Investasi option B from 2026-09, the July
  reroute) already compare `YYYY-MM` and carry forward. Each gets a 2027 test.
- **Loading.**
  - The app loads the working year's journals, not all of them, and only once (today
    every login downloads all journals twice, 2 × 2.6 MB).
  - Earlier years load on demand.

### 5.9 Users and roles

| Role | Who | Can |
|---|---|---|
| `staff_keuangan` | each staff member, personal login | enter, edit own drafts and returned vouchers, view reports |
| `spv_akuntansi` | SPV, personal login | the above + approve / return, Sub Akun and Kategori lists |
| `manager_keuangan` | Manajer Keuangan, personal login | the above + lock the month, RKAP upload |
| `admin` / `super_admin` | system | user management, unlock, backups |

- The shared role accounts (one login per role today) are retired for Keuangan.
- Every voucher records `created_by`, `submitted_at`, `approved_by` / `approved_at` and
  `returned_by` / `returned_note`.
- Passwords must be changed on first login. The forced change already exists; it is
  switched on (`ENFORCE_PASSWORD_CHANGE=1`).

### 5.10 Fixes from the UI/UX check, done along the way

- The top bar search works: vouchers, accounts, No. Bukti, text.
- The Jurnal column label is corrected; dates are unambiguous; the journal list is split
  into pages.
- No text under 12 px. Labels are in Indonesian: no "Check AR/AP", "Financial
  Statements", "Refresh".
- One "Unduh Excel" name everywhere.
- A loss shows as a loss (no green up-arrow).
- The out-of-date "Data audit tersedia Januari – April" note goes.
- The stale defaults go with it: NPD opening on January, Anggaran vs Realisasi on April,
  Cek Konsistensi on an empty month.

### 5.11 Data checks (the 24 November checker, adapted to daily entry)

The checker planned on 24 November
([`2026-11-24-monthly-mismatch-and-data-checker-design.md`](2026-11-24-monthly-mismatch-and-data-checker-design.md))
still applies, in three places.

**1. At entry (new with daily bookkeeping).** Most of what the file checker looked for
cannot happen with typed vouchers, because the form refuses it:
- the voucher must balance;
- account, Sub Akun and Kategori come from lists, so nothing is misread or silently
  unmapped;
- every line must resolve to a report line before the voucher can be submitted;
- No. Bukti must be unique in the year, and the date must fall in an open month.

**2. On every uploaded file: "Cek Berkas".** Files still arrive:
- the November and December 2026 lampiran, the last Excel months. December also sets the
  2027 opening balances;
- the changeover workbooks for January and February 2027 (§6);
- the RKAP 2027 workbook.

Every upload, and a **"Cek saja"** button that checks without loading, runs the levels of
the 24 November plan:

| Level | Checks | On a problem |
|---|---|---|
| L1 File | sheets found, missing or hidden; tab name against the row dates; which mode it will load in and why | warn |
| L2 Rows | every JURNAL row read or explained (no date, no amount, `#N/A` code, text number); the rows read add up to the JURNAL row-2 totals; balanced; codes in the COA | **rows lost while reading: block** (O1 in §10); the rest: warn |
| L3 Mapping | for every row, the workbook's report line (read from its DATA LAMPIRAN and LRA formulas) against the app's line; GL rows no line uses; typed numbers; SUMIF ranges shorter than the JURNAL | warn, with the rows and rupiah |
| L4 Lampiran | Neraca balances; Laba Rugi year-to-date = the Neraca's period result; Arus Kas closing cash = the Neraca's cash and bank lines; LRA columns and parent lines add up | warn |
| RKAP file | every line has an outline; the lines add up to the totals; monthly targets add up to the annual budget | block if the totals don't add up |

The 24 November pilot tried L2–L4 on the October file. The totals matched, the check on
the revenue lines caught the Parkir line (Rp 127.400.000), and all three statement ties
held. The expense lines still have to be added to L3. Results show in the import dialog
and are kept in the upload log.

**3. After posting and at month close.**
- The journal findings (Cek Data and the bell) run on typed vouchers, with the voucher
  checks of §5.7.
- During the changeover, "Bandingkan saja" (L5 of the 24 November plan) compares the
  app's reports with the workbook line by line (§6).

**Rule check before the rules become official (my call).** From March 2027 the app's
report rules are the only calculation. During R1, the simulation of the 24 November plan
(Part A, steps 2–4) runs once. It uses the copy of live and needs no new files:
- June–August against the official TW II, Semester I and TW III reports;
- September and October recomputed from their stored journals against their lampiran.

Any rule it shows to be wrong is fixed before the Sub Akun list is seeded from those
rules (§5.6).

## 6. Changeover (January–February 2027)

The changeover has to prove the app's reports without making Keuangan type everything
twice **(my call)**:

1. From 1 January, Keuangan type **only in the app**.
2. At month end the app exports **"JURNAL untuk Excel"**: the month's posted lines in the
   workbook's own JURNAL columns (Tanggal, No. Akun, Nama Akun, Sub Akun, Keterangan, D,
   K, Kategori, No. Bukti).
3. Keuangan paste it into their usual workbook. The workbook calculates the lampiran with
   its own formulas, as always.
4. They upload that workbook with **"Bandingkan saja"**: compare only, nothing is loaded.
   The app compares the workbook with its own reports line by line: Neraca, Laba Rugi,
   Arus Kas, the four LRA tables and NPD. For each difference it names the voucher lines
   behind it. This is the "Cek Berkas" / trial-compare work of the 24 November plan,
   reused.
5. **Excel stops from March** if January and February match, or every difference is
   explained and fixed. Until then the workbook's lampiran remains the official one if
   the two disagree.

Without this, an uploaded lampiran would load as a snapshot and double the typed
vouchers. "Bandingkan saja" prevents that.

**Before 1 January**
- A practice copy of the app (the existing QA mode, on a separate address, with a copy of
  the data).
- About two hours of training per person.
- Each staff member enters a few real December vouchers there. Nothing goes to live.
- November and December 2026 close in Excel as today.

## 7. Data changes (proposal; details left to the builder)

**`journals`** gets:
- `voucher_type` (KK/KM/BK/BM/JM) and `voucher_no` (unique per year);
- `status`: draft · submitted · returned · posted;
- `submitted_at`, `approved_by`, `approved_at`, `returned_by`, `returned_note`;
- `sop_signed` (0/1) and `attachment`.

**New tables**
- **`sub_akun`**: account_code, name, lra_kategori, lra_outline, lr_line, reroute, active,
  updated_by.
- **`kategori`**: code, label, applies_to, lra_outline.
- **`rkap`**: year, version, from_month, kategori, outline, nama, anggaran, target_bulanan.
- **`opening_balance`**: year, account_code, amount, source (provisional / final),
  set_by, set_at.
- **`upload_log`**, from the 24 November plan.

**Users** stay in the existing table. Personal accounts are added through Pengguna.

**Rule:** 2026 data and 2026 reports do not change. Every new column is nullable, and
2026 rows read as before.

## 8. Releases

| Release | When | Contents |
|---|---|---|
| **R1: Start of daily entry** | now → 22 Dec (go/no-go), live by 31 Dec | personal logins and approval records; Input Voucher (§5.3) with report line, lists, SOP tick, templates; Persetujuan (§5.4); Daftar Voucher (§5.5); Sub Akun master + Kategori list (§5.6, seeded and reviewed); working month with year, Beranda Bulan, new menu (§5.1–5.2); year-aware periods and 2027 opening balances, provisional (§5.8); search and the UI fixes on these screens; **Cek Berkas L1–L2** with the block on lost rows, for the November and December 2026 uploads (§5.11); the June–October **rule check** (§5.11); practice copy and training |
| **R2: First month-end** | January → ~10 Feb | RKAP 2027 upload, plus LRA / NPD / Laporan for 2027 months (§5.8); "JURNAL untuk Excel" export and "Bandingkan saja" (§6); Cek Data checks for vouchers; bank reconciliation reshaped; Kunci bulan; Unduh lampiran (§5.7); **Cek Berkas L3–L4** and the RKAP file check (§5.11); upload log |
| **R3: Excel off** | February → March | second compare month; reports in one place (Laporan and LRA & NPD keep only the tabs that are used; the rest of the 31 go); final opening balances once December 2026 / the audit is final; retire the monthly Excel import |
| **R4: Later, if wanted** | after March | reports readable on a phone for managers; kasir entry; SOP approvals in the app |

**If R1 is not ready on 22 December:**
- daily entry starts on 1 February;
- January is closed in Excel as today;
- the changeover becomes February–March.

**Order inside R1:**
1. year-aware periods;
2. data changes and logins;
3. Sub Akun master;
4. Input Voucher;
5. Persetujuan;
6. Beranda and menu.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Five weeks is tight for R1 | Go/no-go on 22 December; February fallback; R1 holds only what daily entry needs |
| The 2026 hard-wiring breaks 2027 screens | Year groundwork first in R1; tests for every report rule with January 2027 dates |
| 2026 report numbers change by accident | Snapshot tests of the 2026 reports (Neraca, Laba Rugi, LRA, NPD for each month and period) before and after every release |
| Staff find typing slower than Excel | Keyboard-first form, templates, copy-last; measure time per voucher in the practice copy and fix before go-live |
| Report differences with no Excel to catch them | Two compare months (§6); Sub Akun master reviewed once; the form shows each line's destination |
| Opening balances change after the 2026 audit | Provisional opening balance clearly marked; one replace step, logged |
| Data loss | Existing backups made daily, plus one before every release |

## 10. Open questions for the owner (they change what gets built)

1. **RKAP 2027.**
   - When is it final, and in what file?
   - Without it, January's LRA / NPD show realisation with no budget, and the form
     shows "anggaran belum dimuat".
2. **Who logs in.** The names and roles of the Keuangan staff, the SPV Akuntansi and the
   Manajer Keuangan, so personal accounts can be made before training.
3. **Voucher numbering.**
   - One running number per year for all types (my call), or a series per type
     (KK-001, BM-001 …)?
   - It has to match the paper vouchers.
4. **Confirm my calls:**
   - Sub Akun only via Data Induk, with the list governing from 2027;
   - signature tick required before approval;
   - "Kunci bulan" only when steps 1–4 are clear;
   - the changeover via the JURNAL export instead of double typing.
5. **Keuangan's open answers (K1–K5)** still affect the Sub Akun / Kategori seeding.
   Above all: K3 (the market codes in Kategori) and K5 (the Investasi 1.3 / 1.5 parents).
6. **Rows lost while reading a file** (L2 in §5.11): block the upload (recommended), or
   only warn? This is decision O1 of the 24 November plan.

## 11. Left to the builder

- Exact Indonesian wording and layout details within the mockup's design.
- The page size, the keyboard shortcuts and the template list.
- How "Bandingkan saja" shows its differences.
- Where the practice copy runs, and where scans are stored and how large they may be.
- Splitting the large page files as they are touched.
- Moving the LRA computation out of `LRA.jsx`, if R2 needs it for the comparison.
