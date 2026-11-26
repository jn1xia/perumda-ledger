# Deploy checklist — daily bookkeeping, release 1

Release 1 of [the daily-bookkeeping plan](superpowers/specs/2026-11-25-daily-bookkeeping-plan.md)
is on branch `ccr-aca37a95-phqg4w`, on top of what is live (`main` 79a72e6).

Checked on 26 November 2026:
- `npm run test:reports`: 224 tests pass. The build passes.
- The use-case simulation on a copy of live data passes all 24 steps. It covers vouchers,
  approval and return, wrong data, Cek Berkas and Sub Akun, and confirms the 2026 reports
  do not change.
- The browser checks of 26 November pass:
  - posting your own voucher (warning, the Pengaturan switch, the Cek Data note);
  - "JURNAL untuk Excel" (download and Ringkasan);
  - its rows pasted into the real October workbook, which the app's importer reads back
    in the right columns.
- Live still serves the 79a72e6 build (`assets/index--oYlj18A.js`), so
  [ROLLBACK.md](ROLLBACK.md) still applies.

## 1. Decided (owner, 25–26 November 2026)

**Entry in the app from now.**
- Where: Pengaturan → Voucher Setup → *Pembukuan harian di aplikasi dimulai*. The
  default is 25 November 2026.
- If the deploy is later, set it to the go-live day, so the days before stay in Excel.
- Vouchers dated before the start are refused. An Excel JURNAL with rows dated from the
  start cannot be loaded, so nothing is counted twice.
- November is the changeover month (section 5).

**The workbook stays the official lampiran for now.**
- It stays official until "Bandingkan saja" has passed once. That comparison of a
  workbook with the app is in release 2.
- The vouchers go into the workbook with **JURNAL untuk Excel** (Daftar Voucher), so
  nothing is typed twice.

**One person enters and approves for now.**
- Posting your own voucher is allowed with a warning, and noted once a month in Cek
  Data.
- That person's account needs a posting role: SPV Akuntansi or Manajer Keuangan (or
  admin).
- When there are separate approvers, tick Pengaturan → Voucher Setup → *Larang
  menyetujui voucher yang diinput sendiri*.
- Accounts still on the default password should change it.
  `flyctl secrets set ENFORCE_PASSWORD_CHANGE=1 -a perumda-ledger-scs9va` makes the change
  compulsory. Setting it restarts the app once, so do it before the deploy.

## 2. Just before the deploy

1. Do [ROLLBACK.md](ROLLBACK.md) step 0: a fresh backup in the app, a volume snapshot, and
   a note of the live release.
2. Write down three October 2026 figures:
   - the Laba Rugi result;
   - total assets in the Neraca;
   - the LRA Penerimaan total.
3. Optional: create the GitHub tag `live-backup-2026-11-25` on 79a72e6 (see ROLLBACK.md).
4. Pick a quiet moment. The app restarts during the deploy for a minute or two, so nobody
   should be uploading a file.

## 3. The deploy

1. Fast-forward `main` to the branch head and push it, or merge the branch on GitHub.
2. The push runs the **Fly Deploy** action, which takes about 3 minutes.
3. At its first start the server adds the new columns, the `sub_akun` table and the
   voucher-number index. These changes only add things.
4. It also fills the Sub Akun list from the Sub Akun used in journals. On the
   25 November copy that was 165 Sub Akun under 49 accounts.

## 4. Just after the deploy (about 15 minutes)

1. If the deploy is after 25 November, set the start date to the go-live day.
2. Check that the site loads a new bundle (not `index--oYlj18A.js`) and that
   `flyctl status` shows the machine healthy.
3. Check that the three October figures are unchanged.
4. The SPV Akuntansi goes through Akun & Sub Akun. A voucher line can only pick from
   this list. Renames and deactivations stay after a restart.
   - Deactivate the pairs the workbook no longer uses. Example: **42001 › Pendapatan
     Parkir**. Since October the workbook books parking on **41000 › Pendapatan
     Parkir**, so a voucher on 42001 is missed by its formulas.
   - JURNAL untuk Excel flags such rows.
5. Practise with a draft voucher, then delete it in Daftar Voucher (only a draft or a
   returned voucher can be deleted).
   - Do not post practice vouchers.
   - If one gets posted: Jurnal → *Batalkan Approve*, then Persetujuan → *Kembalikan*,
     then delete it.

## 5. Month end with the workbook

**November (changeover month):**
1. Rows dated before the start date are typed in the workbook, as before.
2. Upload the November workbook to the app *before* pasting anything (Jurnal & Impor
   Excel). This loads the Excel part, and the app adds its vouchers on top.
3. Set the working month to November. In Daftar Voucher, click **JURNAL untuk Excel**.
4. Copy rows 2 to the end of the sheet "JURNAL dari aplikasi". Paste them at column A,
   below the last row of sheet JURNAL NOVEMBER 2026.
5. Extend the totals in F2 and G2 to the new last row. They grow by the Ringkasan's
   Total Debit and Total Kredit.
6. Work through the Ringkasan lists before printing the lampiran:
   - vouchers not yet posted;
   - names the workbook has never used;
   - Sub Akun the last month booked on another account.
7. Do not upload the workbook again after pasting. Those rows are already in the app,
   and Cek Berkas holds the file.

**December onward:** steps 3–7, once nothing is typed in Excel any more.

**One-time workbook fix (found on 26 November in the October workbook):**
- Three Sub Akun end with a space in the JURNAL sheet and in DATA LAMPIRAN LABA RUGI GL
  2026: "Beban Banjarbakula ", "Beban Jilid Laporan ", "Pendapatan Ramayana ".
- The app stores names without the trailing space, so pasted rows with these Sub Akun
  would be left out of the Laba Rugi.
- Fix: in the whole workbook, Find & Replace each name with the trailing space by the
  name without it.

## 6. What users will notice

- **Menu and home page.**
  - The menu is grouped by task.
  - The home page is Beranda Bulan, with the working month in the top bar.
  - The old modules are under Lainnya, which only admin sees.
- **Voucher flow.**
  - Input Voucher → *Ajukan* → Persetujuan (SPV Akuntansi or Manajer Keuangan) →
    posted into the Buku Besar and the reports.
  - A returned voucher shows on its author's Beranda with the note.
- **Your own voucher in Persetujuan.** It is marked "voucher Anda". Posting it shows a
  warning, and Cek Data keeps one note per month.
- **Signature tick.** A payment voucher (KK, BK) from Rp 1 jt needs the tick "bukti fisik
  sudah ditandatangani" before it can be posted. The signatures stay on paper.
- **Cek Berkas.** Import Excel checks the file first and holds it when:
  - rows are lost while reading (the rows read do not add up to the JURNAL's row-2
    totals); or
  - it has rows dated from the start date.
- **Daftar Voucher.** It has **JURNAL untuk Excel**.
- **Jurnal page.** A voucher row opens in Daftar Voucher. Posting happens in Persetujuan.

## 7. Not in release 1

**Needed before the January 2027 report (end of January 2027):**
- Laporan, LRA, NPD and Buku Besar for 2027 months.
  - These pages read 2026 only.
  - In the meantime, vouchers dated 2027 are kept, numbered per year, and shown on the
    new screens.
- 2027 opening balances and the RKAP 2027 upload.

**Release 2 (plan §8):**
- "Bandingkan saja".
- Cek Berkas L3–L4: the workbook's own report lines and the ties between its statements.
  Release 1 checks only the file's rows and totals (L1–L2).
- Kunci bulan and Unduh lampiran.
- The reshaped bank reconciliation.

**Left out of release 1 (my calls):**
- **Rule check.** The June–October rule check (a script run on the copy of live). It
  should run before Excel stops.
- **Templates and scans.** Templates and scan upload are not there; only "Salin voucher
  terakhir" is.
- **Drafts.** A draft is saved only when it has no problems, so an unfinished voucher
  cannot be parked.
- **Signature tick on receipts.** The tick covers payments (KK, BK) only. Covering
  receipts too is one setting: `PAYMENT_TYPES` in `src/utils/voucherRules.js`.
- **"Ada temuan".** On Persetujuan it counts only salah and periksa findings.
- **Period locks.** Voucher rules honour locks stored as `YYYY-MM`. The old Jurnal page
  stores locks as a label ("Januari 2026"); the server never enforced those, and still
  does not.
- **Old Voucher page.** It stays under Lainnya for admin. Vouchers made there are plain
  journals, without Persetujuan or any checks.
- **Old Jurnal approval.** Only vouchers got the warning. The old Jurnal page's Approve
  still refuses approving a journal you created yourself, as before (admin and
  super_admin are exempt).
