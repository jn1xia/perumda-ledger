# October 2026 trial differences, and showing input problems inside the app

> **STATUS 2026-11-15: DRAFT — findings verified, design proposed, nothing built.**
> Waiting for the owner's approval of the approach (§6) and the decisions in §9.

Bagian Keuangan, 10 November 2026: *"Trial Oktober ada yang perbedaan — dimana kita melihat
notifikasi misal kita ada yang salah input jurnal / ada kesalahan?"* The owner asked for a plan
so this does not repeat every month.

**Sources.** `LAMPIRAN LAPORAN KEUANGAN OKTOBER 2026.xlsx` (as sent by Keuangan); a read-only
copy of the live data taken 15 November 2026 (GET requests only, nothing changed on live),
rebuilt as a local database; the code on `main` (commit `11bdb29`, the version live runs).
All comparisons below were made on that local copy.

---

## 1. Summary

1. October is on live as a **journal book** (`period_status` 2026-10: mode `jurnal`, source
   `upload-jurnal`, by `super_admin`, 10 Nov 2026 03:10 UTC = 11:10 WITA): 241 journals,
   540 lines, D = K = Rp 5.072.354.067,78, all posted. Every October report is therefore
   computed by the app from the journal.
2. Those 540 lines are the same rows as the lampiran's `JURNAL OKTOBER 2026` sheet, **but the
   uploaded book had no voucher numbers and no Kategori**: 0 of 241 journals carry a `bukti`,
   0 of 540 lines a `kategori`. The lampiran has a voucher number on 408 rows and a Kategori on
   15. Blanking those two columns in the lampiran's sheet reproduces the live journals exactly
   (same 241 groups, same order).
3. With that data the app differs from the lampiran on nine points (§2.2). They fall into four
   classes: columns lost in the upload, bookings that were new in October and that the app's
   fixed rules do not know, three app bugs, and inconsistencies inside the lampiran itself.
4. **The app said nothing about any of it.** The import dialog showed no warning, *Cek
   Konsistensi* shows October all green, and the bell in the top bar is a static icon with a
   permanent red dot and nothing behind it (§2.4). There is currently nowhere to "see the
   notification".
5. Loading the lampiran file itself through Jurnal → Import Excel (the normal path, snapshot
   mode) gives **no differences** except two parent rows where the lampiran contradicts itself
   (§2.3 test C).

Bottom lines are equal in every state: Laba (Rugi) Bersih −526.174.783,94; Jumlah Aset
865.284.224.538,25.

---

## 2. What happened in October

### 2.1 How the month was loaded

| Month on live | Mode | Journals with a voucher number | Lines with a Kategori |
|---|---|---:|---:|
| June – August | journal book | 115/115, 133/133, 172/172 | 0 (column not read yet) |
| September | lampiran (snapshot) | 182/243 | 23 |
| **October** | **journal book** | **0/241** | **0** |

Without voucher numbers the importer groups rows only by date and balance, so 14 vouchers were
split into several journals (220 vouchers in the lampiran → 241 journals on live). The rule for
Investasi from September ("realised when paid": a payment of 21500 counts when the same voucher
holds an investment asset, or its Kategori is INV) depends on both lost columns.

Which file was uploaded on 10 November, and by whom, is not known from the data (the import
does not record the file name). The lampiran file as sent classifies as a full lampiran and
would have loaded in snapshot mode.

### 2.2 Differences: app (live state, journal mode) vs lampiran, October "bulan ini"

| # | Where | App | Lampiran | Cause | Class |
|---|---|---:|---:|---|---|
| 1 | LRA Penerimaan 1.1 / 1.9 Parkir | 442.274.650 / 0 | 314.874.650 / 127.400.000 | Parkir was booked on `41000 > Pendapatan Parkir` for the first time (until September: `42000 > …Parkir` / 42001). No rule knows that sub akun, and an unknown sub akun of 41000 falls silently on 1.1. | new booking, rule gap |
| 2 | LRA Penerimaan 1.6 | 76.368.783 | 52.897.348 (typed by hand) | 1 Oct reclass `D 11204 Piutang Bisnis Lainnya / K 11201 Piutang Usaha` 23.471.435. The app counts every credit to 11201 as a receipt. | new kind of journal, rule too crude |
| 3 | LRA Investasi, total | 164.349.500 | 326.872.950 | (a) −50.399.500: "Pelunasan Akses Jalan Baru Pasar Harum Manis" (21500) not recognised, voucher 076 was split. (b) −24.170.350: two "Pelunasan 50% … Logo" payments (21500), voucher split and Kategori INV lost. (c) −87.953.600: the 31 Oct reclass Bangunan → Peralatan, which the lampiran counts as new realisation on 6.2 and the app nets (−87.953.600 on line 1.5, +87.953.600 on 6.2). | (a)(b) lost columns; (c) see §2.5 |
| 4 | LRA 4.3 / 5.3; Laba Rugi Beban Pokok Listrik / Beban Telepon-Listrik | 156.693.776 / 5.515.579 | 156.489.162 / 5.720.193 | "Pembayaran Listrik **Kantor** Antasari" Rp 204.614 on `61050 > Beban Listrik` is moved to Beban Pokok Listrik by the reroute written for July's Pasar Antasari bill; the rule has no date and matches "listrik … antasari". | app rule too broad |
| 5 | Laba Rugi, Beban Perjalanan Dinas | 30.742.234 | 30.520.042 | Refund credited to 61090, Rp 222.192 ("Pengembalian SPPD …"). Line items add debits only (`getJLineItems`), section totals net (`sumJByPrefix`), so the app's lines do not add up to its own total. | app bug |
| 6 | Neraca, "Nilai Buku" of Aset Lainnya | −83.514.700 | 65.625.000 | Aset Dalam Penyelesaian fell by 149.139.700 (capitalised). In `buildNeracaRows` its delta stays in `runningDelta` and is added to the next "Nilai Buku" subtotal. Jumlah rows are right. | app bug |
| 7 | Neraca / Arus Kas wording | "Aset Lancar Lainnya (Belum Terpetakan)" / "Penyesuaian Lainnya" 3.946.880 | "Piutang Bisnis Lainnya" | Account 11204 is new in October and missing from the line maps. | new account, map gap |
| 8 | LRA target column, 4.1 – 4.4 | (5)/12 | (5)/4 | The lampiran's formula changed in October (`=H67/4`); its header still says (5)/12. | Keuangan to confirm |
| 9 | Laba Rugi wording | app labels | lampiran labels | A journal-mode month uses the app's layout ("Pendapatan Bisnis Lainnya", "LABA BRUTO", no zero rows). | cosmetic |

### 2.3 Controlled tests on local copies

| Test | Load | Result |
|---|---|---|
| A | The lampiran's JURNAL sheet as a journal book **with** voucher numbers and Kategori | 220 journals. Investasi total 164.349.500 → **238.919.350**; the gap to the lampiran is exactly the reclass 87.953.600 (3c). Placement still differs: app 1.5.5 Malabar and 1.6.1 Akses Jalan, lampiran 1.3.5 Papan Nama and 1.5.6 Harum Manis. Points 1, 2, 4 – 8 unchanged. |
| C | The full lampiran through Jurnal → Import Excel (snapshot) | LRA, NPD, Laba Rugi, Neraca, Arus Kas equal the lampiran on every line. Only difference: Investasi parent rows 1.3 and 1.5 "Sd bln lalu", where the app shows the sum of the children (870.454.080 / 1.430.801.530) and the lampiran a stale figure (806.670.830 / 1.494.584.780). |

Import dialog in both tests: mode, sheet name, the Muat button — no warning of any kind.

### 2.4 What the app tells the user today

| Signal | What it covers | October |
|---|---|---|
| Bell, top bar | nothing: `TopBar.jsx` renders a static `<Bell>` with a fixed badge, no handler | permanent red dot |
| Import dialog | account number vs account name conflicts; the server's `unknown_codes` is computed but not shown on the lampiran path | nothing shown |
| Jurnal → Cek Selisih | total D = K, AR/AP module vs journal, unbalanced journals | balanced |
| Cek Konsistensi | per month: balanced, approved, codes in COA, mode vs snapshot; audited months only: snapshot vs Buku Besar on three totals | all green; in journal mode there is nothing to compare with |
| Sidebar dot | standing invariants, the same for every month | red: "11 akun … tidak terdaftar di COA dan masih bersaldo: 11999 −4.203.137.641,51 …". A comment in `api.cjs` already notes this finding "went unread for seven months". |
| "(Belum Terpetakan)" rows | Neraca, LRA expenses | point 7 only, inside the report |
| Audit Recap | static text | — |

### 2.5 Inconsistencies inside the lampiran

1. **Investasi parents 1.3 and 1.5: (7) + (8) ≠ (9), off by 63.783.250.** "Sd bln lalu" was
   restated by hand on the leaves (+63.783.250 on 1.3.e Papan Nama, −39.612.900 on 1.5.b
   Antasari, −24.170.350 on 1.5.e Malabar); the parents still show September's figures.
2. **6.2 Pengadaan Perlengkapan Kantor, bulan ini 89.453.600** = 1.500.000 purchase +
   87.953.600 from the reclass journal ("Reklasifikasi Aset dari Kapitalisasi Aset Bangunan
   menjadi Aset Peralatan"). The same 87.953.600 is also in 1.3.e "Sd bln ini". TOTAL INVESTASI
   s.d. Oktober, 3.280.601.900, is therefore probably overstated by 87.953.600; the app with
   voucher numbers gives 3.192.648.300. To be confirmed by Keuangan.
3. The Kategori on the logo capitalisation rows says "1.5 E PASAR MALABAR"; the LRA sheet puts
   the payments on 1.3.e.
4. Typed numbers where formulas used to be: Penerimaan 1.6 (52.897.348), Beban Operasional 4.1
   (454.296.650), 4.2 left blank.
5. Formula slips on `Beban Operasional`: I65 refers to `I640`; L65 leaves out L64.

---

## 3. Root cause

**Per item:** §2.2.

**Underneath all of them:** the app interprets every journal row with fixed rules, and when a
row does not fit a rule it falls back without saying so — a default line
(`resolveOutline('41000', <any unknown sub akun>)` returns `1.1`), an ignored Kategori value, a
generic label. Nothing records how a row was interpreted. In a journal-mode month the app also
has no second figure to check itself against, so its own check reports "OK". Each month's new
bookings therefore surface only when Keuangan compares totals by eye, and only the developer
can trace a difference back to rows.

Every journal-side difference in October coincides with something that was **new that month**
and could have been listed at upload:

| New in October | Difference |
|---|---|
| sub akun `41000 > Pendapatan Parkir` (the only new sub akun) | 1 |
| account 11204 (new code); voucher debiting and crediting receivables only | 2, 7 |
| no voucher numbers, no Kategori (earlier books had them) | 3a, 3b |
| voucher debiting and crediting fixed assets only (reclass) | 3c |
| credit to an expense account (the only one) | 5 |
| Kategori values "1.5 E PASAR MALABAR", "1.5 F PASAR HARUM MANIS" | 3 (placement) |

---

## 4. Goals, non-goals, anti-goals

**Goals**

- G1. October in journal mode equals the lampiran on every line, except lines where the
  lampiran is wrong or undecided (§2.5, §9).
- G2. At upload, the app lists what it could not interpret with certainty, in Keuangan's terms:
  the rows, the amount, the report line it will land on, what to do.
- G3. One place shows the open findings per month (the bell). It shows nothing when nothing is
  open.
- G4. When the lampiran's report sheets are available, the app shows its own computation beside
  them, line by line, with the journal rows behind each line.
- G5. No fallback is silent.

**Non-goals**

- Changing how an official (snapshot) month is displayed.
- A general rule editor. New accounting conventions still need a rule from the developer; the
  app will say so in the finding.
- Notifications outside the app (WhatsApp, e-mail).

**Anti-goals**

- A list that is always red. Each finding must be about this month's data and must be
  resolvable (fix the file, map it, or mark it checked with a reason); a normal month ends at
  zero. The current sidebar dot is the example to avoid.
- Blocking an upload for something that is only unusual. Only real errors block (unbalanced
  journals, as today).
- Making the app reproduce a mistake in the Excel in order to "match".

---

## 5. Constraints

- Reports are computed in the browser: `LRA.jsx` (2.086 lines), `Laporan.jsx` (1.753),
  `NPDReport.jsx`; mapping rules live in `src/utils/lraOutline.js`, the single source of truth.
  The server stores journals, snapshots and budgets (SQLite, one Fly machine).
- `expandJournals` is the one place every posting line passes on its way to a report.
- `npm run test:reports` (115 tests) pins June – September figures and must stay green.
- An upload replaces the month's journals. Journals of Rp 50 juta or more need Direktur Utama
  or super_admin to approve.
- Keuangan's file is the lampiran workbook: sheet `JURNAL <BULAN> <TAHUN>` with No. Akun
  (a VLOOKUP), Tgl, voucher number (no header), Akun, Sub Akun, debit, kredit, Keterangan,
  Kategori.

---

## 6. Approaches considered

| | Approach | Catches | Cost and risk |
|---|---|---|---|
| A | **Checks at upload + a findings list.** Look for what is new or missing in the book: new account, new sub akun, new Kategori value, missing voucher numbers or Kategori, vouchers with no cash leg, credits to expenses. | October: items 1, 2, 3, 5, 7 flagged on the day of the upload. Not app bugs (4, 6), and it does not prove a report is right. | Small to medium. New pure module; no change to report figures. |
| B | **Automatic trial comparison.** For a month whose lampiran is loaded, compute the reports from the journal as well and list every line where the two differ, with the rows behind it. | Everything, including app bugs and mistakes in the Excel (§2.5). Needs the lampiran's report sheets, which exist as long as Keuangan still prepares the Excel. | Medium to large. The month computation of the LRA has to move out of `LRA.jsx` into a pure function. |
| C | **Mapping in data, editable by Keuangan.** | Only "new sub akun → existing line" (item 1). Most monthly changes so far were not simple mappings (cash-basis rules, Investasi when paid, reclass). | Large and risky: it changes the mapping every report reads. |

**Recommendation: A, then B.** A tells the user at upload, before any comparing. B then proves
the month and explains what is left. C only later and only as a narrow override ("put this sub
akun on that line"), if A shows it is needed often.

---

## 7. Proposed design

### Phase 0 — October now, no code

- Reload October on live from the lampiran file itself. As a full lampiran the reports equal
  the lampiran at once. (Owner's decision, §9.)
- Ask Keuangan to upload the lampiran workbook rather than a separate journal file, and to keep
  the voucher number and Kategori columns filled.

### Phase 1 — Fix what October exposed

Each with a test pinned to the October figures (`tests/reports/october2026.test.mjs`, fixture
= the 540 journal lines as JSON plus the lampiran figures).

| # | Change | Where |
|---|---|---|
| 1 | `41000 > …Parkir` reads as 42001: LRA 1.9; Laba Rugi group stays Bisnis Utama (`lrRevenueGroup`). | `HEADER_SUBAKUN_REROUTE['41000']` |
| 2 | A credit to 11201 whose voucher debits only receivable accounts (112xx) is a reclass, not a receipt. June – September are unchanged: every credit to 11201 there sits in a voucher that debits kas/bank. | `LRA.jsx` (two call sites of `CASH_BASIS_PIUTANG_CODE`) |
| 3 | The Pasar Antasari electricity reroute applies to July 2026 only. | `REPORT_LINE_REROUTE`, `reportLineAccount`, `expandJournals` (pass the date) |
| 4 | Laba Rugi line items are net of the opposite leg, like the totals. | `Laporan.jsx` `getJLineItems` |
| 5 | Reset the running delta at a section heading, so a line between two blocks no longer leaks into the next "Nilai Buku". | `reportDelta.js` `buildNeracaRows` |
| 6 | 11204 Piutang Bisnis Lainnya: own line after Piutang Usaha in the Neraca, own line in Arus Kas. | `reconcileAlias.json`, Arus Kas builder |
| 7 | Investasi: a Kategori that names a line ("1.5 F …" = 1.5.6) on any row of a voucher decides the line of that voucher's payment; an amount that reaches a parent with no detail line is shown as its own "(belum ada rincian)" row, so a parent always equals its children. Reclass between asset accounts: per Keuangan's answer (§9 K2). | `lraOutline.js` `investasiLegOutline`, `LRA.jsx` |
| 8 | Target column of 4.1 – 4.4: per Keuangan's answer (§9 K4). | `lraTemplate.js` |

**Acceptance (journal mode, book with voucher numbers and Kategori):** Penerimaan 1.1
314.874.650, 1.6 52.897.348, 1.9 127.400.000, total 1.579.220.129; Beban Operasional 4.3
156.489.162, total 1.030.319.447; Beban Umum 5.3 5.720.193, total 491.191.722; Laba Rugi Beban
Pokok Listrik 156.489.162, Beban Telepon/Listrik/Air/Wifi/Website 10.472.951, Beban Perjalanan
Dinas 30.520.042, Laba Bersih −526.174.783,94; Neraca Nilai Buku (Aset Lainnya) 65.625.000,
Piutang Bisnis Lainnya 3.946.880, Jumlah Aset 865.284.224.538,25; NPD Beban Operasional
1.030.319.447 and Beban Umum 491.191.722; Investasi per §9.

### Phase 2 — Checks at upload and a findings list (the answer to "dimana notifikasinya")

**Engine.** A pure module `src/utils/journalChecks.js`:
`checkBook(journals, { coa, earlierJournals, rkap }) → findings[]`. It runs on the parsed book
before it is loaded and on the stored journals of a month afterwards. It lives in the browser
because the mapping rules do; it gets unit tests like the other utilities. `lraOutline.js`
gains `explainOutline(code, sub, rkap) → { outline, via }` with `via` = `code` | `sub-rule` |
`keyword` | `default`, so "landed on a default" is a fact the check can read rather than guess.

**A finding** = check id, severity, the rows (date, voucher, account, amount, keterangan), the
effect ("masuk ke LRA 1.1, bukan 1.9"), what to do, and a stable key.

| Check | Fires when | October |
|---|---|---|
| Voucher numbers missing | none in the book, or far fewer than the previous book | 0 of 241 (September 182 of 243) |
| Kategori missing where needed | a payment of 21500 from kas/bank with no Kategori and no asset in its voucher; purchases 11401/11402 with no Kategori (information: stays on 4.1) | 3 payments, Rp 74.569.850 |
| Kategori not understood | value is not BAPOK, GERAI, INV or a line code | "1.5 E PASAR MALABAR", "1.5 F PASAR HARUM MANIS" (September: "3026970000") |
| Sub akun not recognised | header account whose sub akun matches no rule → names the default line | `41000 > Pendapatan Parkir`, Rp 127.400.000 → 1.1 |
| Account used for the first time | code absent from every earlier month → where each report will show it | 11204 → "(Belum Terpetakan)"; 51003 → 4.4 (fine) |
| Voucher with no cash leg inside one class | receivable ↔ receivable, asset ↔ asset | 23.471.435; 87.953.600 |
| Credit to expense / debit to revenue | refund or correction | 61090, Rp 222.192 |
| Investasi without a detail line | an asset purchase or payment that reaches only a parent line | — |
| Existing | number vs name conflict; code not in COA (now also shown on the lampiran path); unbalanced (blocks); pending, with those needing Direktur Utama counted separately | — |
| Lampiran sheets, when present | parent ≠ sum of children; (7) + (8) ≠ (9) | Investasi 1.3 and 1.5, 63.783.250 |

Severity has three levels: **salah** (a report is wrong until fixed), **periksa** (a report
line depends on it), **info**. Info items can be marked "sudah dicek" with a note.

**Where it shows**

1. *Import dialog.* A "Hasil pemeriksaan" block between detection and the Muat button, grouped
   by severity, each item opening to its rows. Only "salah" of the blocking kind stops the
   upload.
2. *Bell.* The number of open findings in unlocked months; a panel listing them by month, each
   linking to the month in Cek Konsistensi. No badge at zero. Replaces the static icon.
3. *Cek Konsistensi.* A "Temuan jurnal" block above today's integrity checks, with the row
   tables and the "sudah dicek" action.
4. *Journal form (Buat Jurnal).* The same checks on the journal being typed, shown before
   saving ("sub akun ini belum punya baris LRA").

**Storage.** Findings are computed, not stored, so they are always current. "Earlier months"
for the new-account and new-sub-akun checks are the journals already in the app
(`state.journals`). Only acknowledgements are stored: table
`finding_acks (period, finding_key, note, set_by, set_at)`, `GET/POST /api/reports/finding-acks`,
writable by the roles that may write journals.

Phase 2 changes no report figure, so it can ship on its own.

**The standing red dot.** The "akun bantu/kliring menggantung" error (11999 and ten others) has
to be resolved or reclassified separately, otherwise the new list inherits a permanent red
item. Needs its own look at the data; not designed here.

### Phase 3 — Automatic trial comparison

No new upload mode. A month loaded from a full lampiran already holds both the lampiran's
figures (snapshot tables, LRA rows) and the journal (baseline `XL-` journals). The app computes
the month from the journal as if it were a journal book and compares. For that computation the
month's baseline journals count as live journals on top of the previous month's figures
(previous snapshot for the Neraca and Arus Kas, previous "Sd bln ini" for the LRA); the
displayed official figures do not change.

- *Per report page* (Laporan, LRA, NPD), for a snapshot month: the switch "Lihat hitungan
  aplikasi", as the Triwulan / Semester views already have, plus a comparison view: Lampiran |
  Aplikasi | Selisih, differing lines first.
- *Hasil Trial* (new page, one month): every differing line of the four LRA tables, Laba Rugi,
  Neraca and Arus Kas; a click lists the journal rows the app counted on that line; where a
  Phase 2 finding touches the same rows, it is shown as the explanation.
- *Bell:* one entry per month with differences, for example "Oktober: 6 baris berbeda dari
  lampiran".
- "Sd bln lalu" is compared too, which shows a restatement of earlier months (§2.5 item 1).

**Technical core and main risk.** The LRA month computation is inside `LRA.jsx`. It moves to a
pure module (`src/utils/lraCompute.js`) used by the page, the comparison and tests. Guard:
before the move, capture every LRA table of every month from the local copy of the live data
(the scraper used for this investigation); after the move the output must be identical.
Laba Rugi, Neraca and Arus Kas already have pure builders in `reportDelta.js`.

### Phase 4 — optional, later

A narrow override from a finding: "petakan sub akun ini ke baris …", stored in the database,
restricted by role, logged. Only if Phase 2 shows it is needed often.

---

## 8. Definition of done

- Phase 1: the October acceptance figures; 115 existing tests green; June – September LRA
  tables identical before and after.
- Phase 2: loading the October book as it was uploaded on 10 November lists the findings of the
  table in §7 in the import dialog; a clean book lists none; the bell shows the count and
  reaches zero when each finding is fixed or marked checked.
- Phase 3: for October loaded from the lampiran, Hasil Trial lists exactly the differences that
  remain after Phase 1 (expected: the Investasi items of §2.5 and whatever Keuangan decides in
  §9), each with its rows.

---

## 9. Decisions needed

**Owner**

- O1. Approach and order (§6): A then B; Phase 1 first.
- O2. Reload October on live from the lampiran — by whom, and as official figures (snapshot) or
  as a journal book with voucher numbers and Kategori.
- O3. Which file was uploaded on 10 November (it had no voucher numbers and no Kategori), so
  the instruction to Keuangan fits what they actually do.

**Keuangan** (through the owner)

- K1. Logos / papan nama, Rp 87.953.600 in total: line 1.3.e (as the October LRA sheet) or
  1.5.e Malabar (as the Kategori says)? Should September's figures be restated as the October
  sheet does?
- K2. A reclass between asset accounts (Bangunan → Peralatan): a move between LRA lines (total
  unchanged), or new realisation as 6.2 shows now? See §2.5 item 2.
- K3. Kategori for Investasi: may the app take a line code written in that column ("1.5 F …")
  as the instruction for the payment of the same voucher?
- K4. Target of 4.1 – 4.4: (5)/4 as the formula, or (5)/12 as the header?
- K5. Confirm §2.5 items 1 and 2 (parents 1.3 / 1.5; the total).

---

## 10. Left to the builder

- Exact wording of findings in Indonesian; layout of the bell panel and the Hasil Trial page.
- Thresholds of the "voucher numbers missing" check (proposal: none at all, or under half
  while the previous book had over half).
- Whether `explainOutline` wraps `resolveOutline` or replaces its internals.
- The fixture format for the October test (journal lines as JSON; the 8,6 MB workbook does not
  go into the repository).
