# Daily bookkeeping in the app — summary

25 November 2026.
- Full plan: [`2026-11-25-daily-bookkeeping-plan.md`](2026-11-25-daily-bookkeeping-plan.md).
- Mockup: [`mockups/2026-11-25-daily-bookkeeping.html`](mockups/2026-11-25-daily-bookkeeping.html).

## What changes

From **1 January 2027**:
- Keuangan record every transaction in the app as a voucher, instead of in the Excel
  JURNAL sheet.
- The SPV Akuntansi or Manajer Keuangan checks it and posts it in the app.
- The monthly reports come straight from the app, in today's lampiran layout.

## Why

Today the same reports are calculated twice:
- the workbook groups by account name and Sub Akun text;
- the app groups by account code and fixed rules.

The two drift apart every month. With entry in the app there is **one calculation**. Each
line shows where it lands in the reports while it is being typed, so a wrong line is
caught that day, not at month end.

## What Keuangan will see

- **The menu** is grouped by task: Kerja harian, Tutup bulan, Laporan, Data induk. Unused
  modules are hidden.
- **One working month** applies to every page.
- **A month page** shows five steps (input → approved → checked → reconciled → locked and
  reported) and what needs action today.
- **Voucher entry:**
  - Kas/Bank Masuk/Keluar and Memorial.
  - No. Bukti is filled in; the cash or bank side is filled in automatically.
  - Each line shows its LRA line, its Laba Rugi line and the budget left.
  - Sub Akun and Kategori are chosen from lists.
  - The SOP signer shows by amount, with an "already signed" tick.
  - Templates, "copy last voucher" and keyboard shortcuts.
- **An approval list** for the SPV / Manajer:
  - approve in bulk, or return with a note;
  - nobody approves their own entry;
  - the app records who approved.
- **Personal logins** for everyone in Keuangan.

## Decided

- Bookkeeping in the app (B).
- Keuangan staff only, for now.
- Approvals inside Keuangan; the SOP signatures stay on paper.
- The current app is reshaped in releases.
- The mockup is accepted.

## Timeline

| When | Release |
|---|---|
| Now → 22 Dec (go/no-go), live by 31 Dec | **R1**: logins, voucher entry, approval list, voucher list, Sub Akun list, working month and month page, new menu, groundwork for 2027, file checks for the last two Excel months, a check of the report rules against June–October, practice copy and training |
| January → about 10 Feb | **R2**: RKAP 2027, reports for 2027, "JURNAL untuk Excel" export and "Bandingkan saja", month close, lampiran download, the full file checker |
| February → March | **R3**: second comparison month, reports in one place, final opening balances, **Excel off from March** |
| Later, if wanted | Reports on a phone, entry by the kasir, SOP approvals in the app |

If R1 isn't ready on 22 December:
- the start moves to 1 February;
- January closes in Excel as today.

## Changeover without typing twice

In January and February:
1. Keuangan type only in the app.
2. At month end the app exports the JURNAL in the workbook's own columns.
3. Keuangan paste it into their usual workbook, which calculates the lampiran as always.
4. They upload it with **"Bandingkan saja"**, and the app compares its own reports with it
   line by line.

Excel stops once two months match.

## Data checks

The data checker planned on 24 November stays, adapted to daily entry:
- **At entry.** The voucher form refuses what the file checker used to catch: an
  unbalanced voucher, a Sub Akun or Kategori not on the list, a line with no report
  line, a duplicate No. Bukti.
- **On every uploaded file ("Cek Berkas").** This covers the November and December 2026
  lampiran, the changeover workbooks and the RKAP 2027 workbook. It checks:
  - the file's shape;
  - that every JURNAL row was read and the rows add up to the JURNAL totals;
  - the workbook's report line against the app's, for every row;
  - that the lampiran's own statements tie.

  Rows lost while reading block the upload. "Cek saja" checks a file without loading it.
- **At month close.** Cek Data and the bell; during the changeover, "Bandingkan saja".
- **Before March.** One check of the app's report rules against June–October 2026, run
  from the live copy, so the rules are right before they become the only calculation.

## Biggest risk

The app is built around 2026: month lists, quarter presets, budget numbering. Making it
year-aware comes first in R1.

## Needed from you

1. **RKAP 2027:** when it will be final, and the file.
2. **Names and roles** of the Keuangan staff, the SPV Akuntansi and the Manajer Keuangan,
   for the personal logins.
3. **Voucher numbering:** one running number per year, or a series per type?
4. **Confirm my calls:**
   - new Sub Akun only via Data Induk (from 2027);
   - "already signed" must be ticked before approval;
   - the month can be locked only when the earlier steps are clear;
   - the changeover via the JURNAL export.
5. **Keuangan's open answers K3 and K5:** the market codes in Kategori, and the
   Investasi parents.
6. **Upload rule:** block an upload when rows are lost while reading the file
   (recommended), or only warn?
