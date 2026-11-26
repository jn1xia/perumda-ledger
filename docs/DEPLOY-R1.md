# Deploy checklist — daily bookkeeping, release 1

Release 1 of [the daily-bookkeeping plan](superpowers/specs/2026-11-25-daily-bookkeeping-plan.md)
is on branch `ccr-aca37a95-phqg4w`, on top of what is live (`main` 79a72e6). Checked on
26 November 2026:

- `npm run test:reports`: 217 tests pass. The build passes.
- The use-case simulation on a copy of live data passes all 24 steps. It covers vouchers,
  approval and return, wrong data, Cek Berkas and Sub Akun, and confirms the 2026 reports
  do not change.
- Live still serves the 79a72e6 build (`assets/index--oYlj18A.js`), so
  [ROLLBACK.md](ROLLBACK.md) still applies.

## 1. Decide before the deploy

**Start date: 1 Desember 2026 recommended.**
- Where: Pengaturan → Voucher Setup → *Mulai pembukuan harian*. The default, 25 November
  2026, has already passed.
- Vouchers dated before the start are refused. An Excel JURNAL with rows dated from the
  start cannot be loaded, so nothing is counted twice.
- A month boundary keeps each month in one place:
  - November closes in Excel, and its lampiran loads as usual.
  - From 1 December, Keuangan type in the app.
- A start inside November splits that month:
  - a November workbook that holds the later days cannot be loaded;
  - a workbook that stops at the start gives only part of the official November.

**December 2026: keep the workbook as well (recommended).**
- December is the year-end the auditor sees.
- "Bandingkan saja" compares a workbook with the app line by line. It is in release 2.
- Until it has passed once, the December workbook stays the official lampiran (plan §6).
  The app's December is checked against it in January.
- Do not upload the December workbook into the app. Cek Berkas holds it because of its
  rows dated from the start, and that hold is what prevents double counting.
- Typing December twice can be avoided by bringing the "JURNAL untuk Excel" export
  forward from release 2.

**Personal logins.**
- Everyone who enters or posts vouchers needs their own account (Pengaturan → Pengguna):
  - staff enter vouchers;
  - SPV Akuntansi and Manajer Keuangan post them.
- Two things depend on personal accounts: the rule that nobody posts their own voucher,
  and the record of who entered and who posted.
- Accounts still on the default password should change it. `ENFORCE_PASSWORD_CHANGE=1`
  makes the change compulsory at the next login.
- Setting it restarts the app once, so set it before the deploy:
  `flyctl secrets set ENFORCE_PASSWORD_CHANGE=1 -a perumda-ledger-scs9va`.

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

1. Set Pengaturan → Voucher Setup → *Mulai pembukuan harian* to the date chosen in
   section 1.
2. Check that the site loads a new bundle (not `index--oYlj18A.js`) and that
   `flyctl status` shows the machine healthy.
3. Check that the three October figures are unchanged.
4. The SPV Akuntansi goes through Akun & Sub Akun.
   - A voucher line can only pick from this list.
   - Renames and deactivations stay after a restart.
5. Practise with a draft voucher, then delete it in Daftar Voucher (only a draft or a
   returned voucher can be deleted).
   - Do not post practice vouchers.
   - If one gets posted: Jurnal → *Batalkan Approve*, then Persetujuan → *Kembalikan*,
     then delete it.

## 5. What users will notice

- **Menu and home page.**
  - The menu is grouped by task.
  - The home page is Beranda Bulan, with the working month in the top bar.
  - The old modules are under Lainnya, which only admin sees.
- **Voucher flow.**
  - Input Voucher → *Ajukan* → Persetujuan (SPV Akuntansi or Manajer Keuangan) →
    posted into the Buku Besar and the reports.
  - A returned voucher shows on its author's Beranda with the note.
- **Signature tick.** A payment voucher (KK, BK) from Rp 1 jt needs the tick "bukti fisik
  sudah ditandatangani" before it can be posted. The signatures stay on paper.
- **Cek Berkas.** Import Excel checks the file first and holds it when:
  - rows are lost while reading (the rows read do not add up to the JURNAL's row-2
    totals); or
  - it has rows dated from the start date.
- **Jurnal page.** A voucher row opens in Daftar Voucher. Posting happens in Persetujuan.

## 6. Not in release 1

**Needed before the January 2027 report (end of January 2027):**
- Laporan, LRA, NPD and Buku Besar for 2027 months.
  - These pages read 2026 only.
  - In the meantime, vouchers dated 2027 are kept, numbered per year, and shown on the
    new screens.
- 2027 opening balances and the RKAP 2027 upload.

**Release 2 (plan §8):**
- "JURNAL untuk Excel" and "Bandingkan saja".
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
