# Why the data mismatches every month, and a checker for the uploaded data

> **STATUS 2026-11-24: DRAFT plan — nothing built.** Part A (simulation) can start
> from the copy of live; only its parse step needs the June–September workbooks.
> Part B (checker) needs the owner's answers in §5.

Owner, 24 November 2026: *"I have this data mismatch problem every month. Simulate,
help me find the issue (plan it first, not yet code change needed)"* and *"I want to
add some kind of error parsing checker that checks the data, plan it first."*

---

## 1. What we know

### 1.1 Every month since June had differences, each from a different place

| Month | What differed (fixed since) | Class |
|---|---|---|
| June | PPh booked as `80000 > Pajak Penghasilan` read as non-operating; Neraca alias map stale ("Belum Terpetakan"); equity roll-forward; Arus Kas shape; LRA cash-basis rules missing; Laba Rugi line labels | 3, 4 |
| July | Bank account number typed into No. Akun ("511473 …"): Laba Rugi off by Rp 206.989.852; Antasari electricity on 61050; tab "JURNAL JUNI" holding July rows; No. Akun contradicting Nama Akun | 1, 2, 3 |
| August | Pendapatan Listrik needed its own line; Kegiatan Kelembagaan / outsourcing honor lines; current liabilities under the wrong heading | 3, 4 |
| September | Revised RKAP (new and renumbered lines); Kategori BAPOK/GERAI; Investasi realised when paid; Parkir moved to Bisnis Utama; June–August journal books counted twice in the Neraca; an un-numbered LRA line dropped; hidden JURNAL tabs in TW files replacing months | 1, 2, 3, 4 |
| October | File uploaded without voucher numbers and Kategori; Parkir on a new Sub Akun `41000 > Pendapatan Parkir`; a receivable reclass read as a receipt; electricity reroute too broad; refunds not netted; a "Nilai Buku" subtotal; new account 11204; target ÷ 4 | 1, 3, 4, 5 |
| November (found by us) | Buku Besar never matched the Neraca (adjustment sign; journal books left out) — fixed and re-run on live 24 Nov | 4 |

Classes: **1** file shape / upload process · **2** rows lost or misread when parsing ·
**3** mapping drift (the Excel changed, the app's rules lag) · **4** app computation bug ·
**5** inconsistency inside the Excel (typed numbers, broken formulas, restatements) ·
**6** process after upload (pending approvals, mode, reconciliation).

### 1.2 The root cause, as far as the evidence goes

The same reports are produced twice, by two different methods, and nothing compares
them when a file comes in:

- **Keuangan's workbook** groups by **name text**: `DATA LAMPIRAN NERACA` sums the
  JURNAL sheet by account name (`SUMIF(JURNAL!D…)`), `DATA LAMPIRAN LABA RUGI GL`
  sums it by **Sub Akun** text, and each LRA cell is a formula that points at GL rows
  (Penerimaan 1.9 "bulan ini" = `GL!E15 − GL!D15`, GL row 15 = "Pendapatan Parkir").
  When Keuangan adds a Sub Akun, a GL row and a formula, the Excel follows at once.
- **The app** groups by **account code** plus keyword rules written in code
  (`lraOutline.js`), learned from the previous month's workbook. A new Sub Akun, account
  or Kategori value lands on a default line without a word.

So every month the Excel moves first, the app follows after someone compares totals by
eye, and the cycle repeats. Classes 1, 2 and 5 add to it because the upload accepts
whatever file arrives and says nothing about rows it could not read.

### 1.3 Pilot (24 Nov, scratch script, October lampiran)

The workbook carries its own answer key, and a checker can read it:

| Check | Rules live until 16 Nov | Current rules |
|---|---|---|
| Σ parsed debit/kredit = JURNAL row 2 (`=SUM(F4:F543)` / `G`) | OK (5.072.354.067,78) | OK |
| Penerimaan "bulan ini" typed instead of formula | 1.6 = 52.897.348 | same |
| Each revenue line: Excel's LRA line (Sub Akun → GL row → formula) vs the app's | **Pendapatan Parkir: Excel 1.9, app 1.1, Rp 127.400.000** | 13 of 13 agree |

That is the October Parkir difference, caught from the file alone, before anything was
loaded or compared.

The October statements also tie to each other, to the rupiah: the Neraca balances
(865.284.224.538,25); the Laba Rugi year-to-date result equals the Neraca's
"(Laba) Rugi Periode Berjalan" (−526.174.783,94); and the Arus Kas closing cash equals the
Neraca's nine cash and bank lines (15.777.648.719,43). The September comparison column ties
the same way. These three ties become L4 checks.

---

## 2. Goals

- G1. Know, per month, how much of the mismatch comes from each class (Part A).
- G2. At upload, before loading, tell Keuangan what the app cannot read the way their
  workbook does — rows, amounts, the line it lands on — and stop uploads that would
  lose money (Part B).
- G3. Keep a record of every upload (file, who, when, what the checks said).

Non-goals: rewriting the Excel; making the app copy the Excel's mistakes; blocking on
anything that is only unusual. Anti-goal: a check that is red every month for reasons
nobody can fix.

---

## 3. Part A — Simulation (no code change; scratch harness)

**Inputs.** Live today has January–May audited, **June–August as journal books**,
**September–October as lampiran**, and the official **TW I, TW II, Semester I and TW III**
packs. So steps 2–4 can start now from the 24 Nov copy of live:
- June–August: compare the app's own computation with the official TW II, Semester I
  and TW III packs.
- September–October: load their stored journal rows as a journal book on a scratch copy,
  then compare with their stored report sheets. This is what Keuangan's "Trial Oktober" did.

Step 1 reads the workbook itself. October is done. For June–September it needs the
workbooks as Keuangan sent them, plus the journal-only files actually uploaded.

**Per month M, in order (state carried from M−1, as on live):**

1. **Parse check** (the pilot, extended): JURNAL row accounting and row-2 totals;
   per account vs `DATA LAMPIRAN NERACA`; per Sub Akun vs `DATA LAMPIRAN LABA RUGI GL`;
   the Excel's mapping read from the formulas of all four LRA sheets and the Laba Rugi
   sheet vs the app's mapping, per line; typed numbers; GL rows no formula uses.
2. **Replay** on a local copy: upload the file as Keuangan did (and as a full lampiran),
   approve, reconcile.
3. **Diff**: every line of Neraca, Laba Rugi, Arus Kas, the four LRA tables and NPD
   against the lampiran sheets.
4. **Attribute** each difference to its journal rows (via step 1's mapping table) and
   give it a class (1–6).

**Output.** A month × class table (count and rupiah), the list of differences with their
rows, and for each one: would the Part B checker have flagged it at upload (yes / no /
which level), or does it need an app fix. This confirms or refutes §1.2 and sizes Part B.

**Effort.** About a day. Steps 2–4 run first, from the live copy; step 1 follows as the
workbooks arrive. Step 1 for October is done (§1.3).

---

## 4. Part B — "Cek Berkas": a checker for the uploaded data (proposal)

**Where.** Jurnal → Import Excel, before Muat, as a section of the existing
"Hasil pemeriksaan"; plus a **Cek saja** button (check without loading) so Keuangan can
run it before sending the file. Results saved in an upload log; open problems reach the
bell and Cek Konsistensi through the existing findings.

**Levels.**

| Level | Checks | Catches class |
|---|---|---|
| L1 Berkas | sheets found / missing / hidden; tab name vs row dates; mode chosen (lampiran, journal book, period report) and why; a journal-only file for a month that expects a lampiran | 1 |
| L2 Baris | every JURNAL row read or skipped, with the reason (no date, no amount, `#N/A` No. Akun, text number, date outside the month); Σ parsed = row-2 totals; balanced; codes in COA | 2 |
| L3 Pemetaan | per account vs `DATA LAMPIRAN NERACA`; per Sub Akun vs `DATA LAMPIRAN LABA RUGI GL`; **Excel's line vs the app's line for every row** (from the LRA / Laba Rugi formulas); GL rows no line uses; SUMIF windows shorter than the JURNAL | 3, 5 |
| L4 Lampiran | Neraca balances; Laba Rugi year-to-date result = the Neraca's "(Laba) Rugi Periode Berjalan"; Arus Kas closing cash = the Neraca's cash and bank lines (all three hold in October, §1.3); LRA (7)+(8)=(9) and parents = Σ rows; typed numbers where the column is otherwise formulas | 5 |
| L5 Hasil (later) | after loading a lampiran month: the app's own computation vs its report sheets, line by line (the "Hasil Trial" of the 15 Nov design, Phase 3) | 4 |

**Severity.** The upload is blocked only where money would be lost:
- parsed totals ≠ JURNAL row 2 (rows lost while reading the file);
- unbalanced journals (this already blocks).

Everything else warns, as today, with its severity (salah / periksa / info). That
includes a code outside the COA: a new account is fixed by adding it to the COA, not by
refusing the file.

**Upload log.** Table `upload_log`: file name, size, hash, uploaded by, time, month(s),
mode, check counts, the full check report (JSON). Shown in Pengaturan and linked from the
month in Cek Konsistensi.

**Approaches.**

| | Approach | Catches | Cost / risk |
|---|---|---|---|
| A | **Cek Berkas L1–L4 at upload** (recommended first) | 1, 2, 3, 5 before loading | Medium. Pure functions over the workbook; the pilot proves L2/L3. Depends on the workbook keeping its DATA LAMPIRAN / GL sheets; when a sheet is missing the level says so and skips. |
| B | **L5 trial diff after loading** | also 4 | Medium–large: the LRA computation has to move out of `LRA.jsx` first. Next step after A. |
| C | **Use the Excel's mapping as the app's mapping** each month | removes 3 at the source | Large and fragile: ties the app to the workbook layout and does not work for a journal-only month. Only if A shows drift every month, and then as an opt-in "Terapkan pemetaan lampiran". |

Recommendation: A now, B next, C not yet.

---

## 5. Decisions needed

- O1. When parsed totals differ from the JURNAL row-2 totals, should the upload be
  **blocked** (recommended) or only warned?
- O2. Order: run the simulation first (one day, tells which checks matter) or build A
  straight away (the pilot already shows L2/L3 are worth it)?
- O3. The June–September workbooks as Keuangan sent them, and the journal-only files
  actually uploaded. Only the simulation's parse step needs them.

## 6. Left to the builder

Exact Indonesian wording; layout of the report in the dialog; whether the upload log
keeps the file itself (recommended: no, only the hash and the report).
