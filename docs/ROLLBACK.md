# Rollback — going back to the build before the daily-bookkeeping release

Prepared 25 November 2026, before release 1 of
[`2026-11-25-daily-bookkeeping-plan.md`](superpowers/specs/2026-11-25-daily-bookkeeping-plan.md).

## What is backed up

| What | Where |
|---|---|
| **Live code** | `main` commit **79a72e6** ("Buku Besar: tie every balance-sheet account to the official Neraca correctly"). The live bundle `assets/index--oYlj18A.js` is the build of exactly this commit. |
| **Live build (image)** | `registry.fly.io/perumda-ledger-scs9va:deployment-01M87JBHN5PJ38XY2V7N1CG85J` (digest `sha256:29151f39d6416dcf7b1fe212483bf75aa73dc22749f976113e063d9484e5c50e`). Deployed by Fly Deploy run 45476252781 on 24 Nov 2026, machine `4d895d35f549d8`. |
| **Live database** | `/app/data/backups/backup_2026-11-25T19-28-10-010Z.db` (4.3 MB), taken 25 Nov 2026 19:28 UTC with the note "Sebelum rilis Pembukuan Harian R1". |

**Deployed 26 November 2026, 07:08 UTC:**
- Release 1 is `main` 097cb41, bundle `assets/index-yG3YA6du.js`, Fly Deploy run #47
  (45772881823, success).
- Taken just before it: `/app/data/backups/backup_2026-11-26T07-06-18-397Z.db` (4.3 MB),
  noted "Sebelum deploy rilis Pembukuan Harian R1".
- After it, October and January Laporan and LRA read exactly as before.
- Going back still means redeploying the 79a72e6 image below.

**The backup tag was not created.** This working session could not push a git tag
(`live-backup-2026-11-25`), because it may only push to its own branch. To have one:
1. On GitHub open *Releases → Draft a new release*.
2. Choose a new tag `live-backup-2026-11-25`.
3. Set the target to commit `79a72e6`.
4. Save it as a draft or publish it.

The image above is the exact build either way.

**The database backup does not stay forever.**
- Backups rotate: the newest 14 are kept, and the app makes one each day it is used.
- So the backup above disappears after about two weeks of use.
- Right before the deploy, take a fresh backup and a volume snapshot (step 0 below).

## Step 0 — just before deploying the new release

On your own computer, where `flyctl` is logged in:

```bash
# 1. Fresh database backup through the app (super_admin)
#    Pengaturan → Data & Backup → Backup sekarang   (or POST /api/system/backup)

# 2. Volume snapshot (survives backup rotation)
~/.fly/bin/flyctl volumes list --app perumda-ledger-scs9va
~/.fly/bin/flyctl volumes snapshots create <volume-id>

# 3. Note the release that is live now
~/.fly/bin/flyctl releases --app perumda-ledger-scs9va --image | head -3
```

## Going back

The new release only **adds** database columns and tables, all of them nullable. The old
code ignores them. **Going back to the old code does not need a database restore**
unless you also want to throw away what was entered after the deploy.

### A. Redeploy the old image (fastest, exact build, about 2 minutes)

```bash
~/.fly/bin/flyctl deploy --app perumda-ledger-scs9va \
  --image registry.fly.io/perumda-ledger-scs9va:deployment-01M87JBHN5PJ38XY2V7N1CG85J
~/.fly/bin/flyctl releases --app perumda-ledger-scs9va   # the top line is the new (old) release
```

Then open https://perumda-ledger-scs9va.fly.dev and check that the page loads
`assets/index--oYlj18A.js` (View source).

### B. Redeploy the old code from GitHub

1. Make sure the tag `live-backup-2026-11-25` exists (see above).
2. Actions → **Fly Deploy** → *Run workflow*.
3. Under "Use workflow from", choose *Tags* → `live-backup-2026-11-25` → *Run*.

### C. Revert on main

Revert the release's merge commit on `main` (`git revert -m 1 <merge-sha>`) and push.
The push to `main` deploys automatically.

**Note.** A later push to `main` deploys again over A or B. After rolling back, hold
further pushes to `main` until the problem is fixed.

### If vouchers were entered before going back

The old code leaves vouchers in the database:
- **Posted vouchers** are posted journals to the old code, so they stay in every report.
  Nothing entered is lost.
- **Draft, pending and returned vouchers** show in the old Jurnal page with those
  statuses. Do not approve them there: the old page has none of the voucher checks.
- **Month-wide deletes.** In the old code these delete a month's vouchers along with its
  other journals:
  - Jurnal → *Hapus Semua*;
  - resetting a month;
  - *Muat Snapshot Laporan Audited*.

  Avoid them on months with vouchers until the new release is back.
- **Deploying the new release again** picks the vouchers up as they were.

## Restoring the database (only if the data must go back too)

This throws away everything entered after the backup was taken. Do it at a quiet time.

```bash
~/.fly/bin/flyctl ssh console --app perumda-ledger-scs9va
# inside the machine:
ls -la /app/data/backups/
cp /app/data/perumda_ledger.db /app/data/backups/before_restore_$(date +%Y%m%d%H%M).db
cp /app/data/backups/backup_2026-11-25T19-28-10-010Z.db /app/data/perumda_ledger.db
exit
~/.fly/bin/flyctl machine restart 4d895d35f549d8 --app perumda-ledger-scs9va
```

Or restore from the volume snapshot taken in step 0. A snapshot restores into a new
volume (`flyctl volumes create … --snapshot-id <id>`), which then has to be attached in
place of the current one. That is the slower route, for when the volume itself is lost.
