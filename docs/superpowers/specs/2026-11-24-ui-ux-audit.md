# UI/UX check — November 2026

> **STATUS 2026-11-24: findings only.** The revamp design follows once the owner
> settles what Keuangan will use the app for (§5). No code changed.

Owner, 24 November 2026: *"check the ui ux too, check and plan if we need to revamp so the
user felt more natural when using it."*

## 1. How it was checked

- The build of `main` (79a72e6), run locally on a copy of live (24 November). Nothing on
  live was touched.
- Screens checked:
  - an office laptop (1366 × 768), a wider laptop (1440 × 900) and a phone (390 × 844);
  - light and dark themes.
- What was walked through:
  - all 24 menu pages, the 31 Laporan tabs and the 9 LRA tabs;
  - the journal form;
  - the import dialog with the October lampiran;
  - the bell;
  - first load on a slow connection (a "Fast 3G" network profile).
- Data checks: what each module holds, where the journals come from, and what each role
  sees in the menu.

## 2. How the app is used today (live data)

- There are 1,968 journals, and **none were typed in the app**. They come from:
  - 1,383 from the lampiran (`XL-`);
  - 420 from the June–August journal books;
  - 160 from the January–April backfill (`SUM-`, `CASH-`, `ADJ-`);
  - 5 ledger reconciliations.
- Modules with no records:
  - Voucher
  - Piutang
  - Hutang
  - Persediaan
  - BBM Prabayar
  - Pembelian (PO)
  - Penjualan (SO)
  - Departemen
  - Rekonsiliasi Bank

  Giro, E-Faktur, Pelanggan and Supplier hold 6–8 rows each. Aset Tetap holds 134.
- Accounts are per role (the username is the role name). The June–October uploads on live
  were made as `super_admin`.

So the app's real job today is to:
1. receive the month's Excel;
2. check it;
3. approve it;
4. tie the ledger;
5. show and export the reports (Laporan, LRA, NPD, CALK).

## 3. Findings

### 3.1 Structure: a catalogue of 24 modules for one monthly job

- **The menu.** It has 24 flat items in no task order. `staff_keuangan` sees 23 of them;
  `kasir_pasar` sees 13, including LRA, Audit Recap and Cek Konsistensi.
- **Odd or hidden pages.**
  - Half the menu holds no data (§2).
  - "Audit Recap" is a developer checklist ("Implemented").
  - The user guide ("Panduan Pengguna") is a tab inside Pengaturan.
- **The same thing in several places.**
  - Import: Jurnal → Import Excel, and the Import Data page.
  - Budget against actual: LRA, Anggaran vs Realisasi, and eight tabs under
    Laporan → Anggaran.
  - Warnings: the red dot on Cek Konsistensi (the health check) and the bell (journal
    findings).

### 3.2 The monthly routine is scattered, and each page picks its own month

| Step | Page | Opens on |
|---|---|---|
| Upload, approve | Jurnal | all months, 4,856 lines |
| Tie the ledger | Buku Besar → Rekonsiliasi Semua Akun | no account chosen; "Akun ini tidak ditemukan di Neraca Juni" |
| Check | Cek Konsistensi | November 2026: an empty month, headed "Ada masalah data" while every check listed is OK |
| Reports | Laporan, LRA | Oktober |
| | NPD | Januari |
| | Anggaran vs Realisasi | April |
| | Rekonsiliasi Bank | Januari |

No screen says where a month stands: uploaded, checked, approved, reconciled or reported.

### 3.3 Layout on ordinary screens

- **Jurnal at 1366 × 768 (also at 1440 × 900).** The page is 1,660 px wide, so these sit
  off-screen to the right:
  - Buat Jurnal
  - Approve Semua
  - the bell
  - the user menu (logout)

  On the page where the journals are worked, the notifications cannot be seen.
- **Other pages wider than the screen:**

  | Page | Width |
  |---|---|
  | LRA | 1,956 px |
  | Aset Tetap | 1,842 px |
  | Anggaran vs Realisasi | 1,471 px |
  | Laporan | 1,455 px |

- **Laporan.** The report itself starts about 870 px down, below a 768 px screen. Above it
  sit:
  - 4 cards;
  - 12 month buttons;
  - 7 presets;
  - 6 groups;
  - up to 8 tabs.
- **Cards.** "Rp" wraps onto its own line, and Total Aset is cut off.
- **The floating AI button** covers the last column of tables.

### 3.4 Reports page (Laporan)

- **31 tabs in 6 groups.**
  - Some are empty (Neraca per 3 Bln, Lacak Kilat).
  - Some repeat the presets (L/R per 3 Bln and per Semester vs TW / Semester).
  - Some are jargon: Lacak Kilat, Laporan Sortir, MTD/YTD.
- **The same four cards on every tab.**
- **Repeated actions.** "Export Laporan Lengkap (.xlsx)" and "Unduh Excel (.xlsx)", and two
  "Cetak Laporan" buttons.
- **Out-of-date month status.**
  - A note still says *"Data audit tersedia untuk bulan Januari – April 2026 (641 jurnal)"*.
  - Only January–April carry the "audited" dot.
  - In fact May, September and October are official snapshots too, and June–August are
    journal books. The month bar does not show this.
- **Colour.** Laba Bersih −Rp 526 jt is shown with a green up-arrow.

### 3.5 Jurnal page

- **No paging.** It opens on all months: 4,856 lines and 9,846 buttons, about 3.7 s to show.
- **Mislabelled column.** "No. Akun" shows the voucher number (A.02, A.03 …).
- **Dates.** "2/1/2026" does not say which part is the day.
- **Clutter.** "0" is shown on zero amounts. Kunci Periode, Cek Selisih and Check AR/AP sit
  in one row with the main actions.
- **The journal form.**
  - It has no No. Bukti or Kategori field, yet the reports need Kategori (4.1 / 4.2,
    INV) and the findings flag a missing voucher number.
  - "Selisih Rp 0,00" shows in red on an empty form.

### 3.6 Small things that cost trust

- The search box in the top bar does nothing (nothing listens to it).
- **Small text.**
  - Jurnal: 4,673 of 28,458 text elements are under 12 px.
  - LRA uses 9 px text.
- **Mixed languages.** Dashboard, Financial Statements, General Ledger, Chart of Accounts,
  Compliance & Audit Recap, Check AR/AP, Export CSV, Refresh, Presets, Live data,
  posted / pending.
- **The import dialog** is dark even in the light theme, and its buttons sit below a long
  findings list.
- **Waiting.**
  - Reading the October workbook takes 23 s.
  - First load on a slow line takes 9 s to the login screen and 16 s after login.
  - Each login downloads all journals twice (2 × 2.6 MB) plus 0.3 MB of budget rows.
- **The password reminder banner** runs under the sidebar. It only shows for default
  passwords.

### 3.7 Phone

Only Dashboard, Audit Recap, Cek Konsistensi and Import Data fit 390 px. The other 20
pages are wider than the screen (Jurnal 1,385 px, LRA 1,680 px). Tables and the month bar
need sideways scrolling.

### 3.8 What works

- One consistent visual style (colours, cards, type), in light and dark.
- The journal form: debit and kredit blocks with a live balance.
- The import check ("Hasil pemeriksaan") and the bell panel: grouped by month, each
  linking to its rows.
- The report headers name the company and the period, and each report exports to Excel.

## 4. Verdict

Revamp the structure and the flow, not the look:

- Choose the working month once, for every page.
- Make the home screen show where the month stands and the next step:
  upload → check → approve → tie the ledger → reports.
- Put all reports in one place and keep only the tabs that are used.
- Name menu items after tasks, and per role hide the modules nobody uses.
- Fix §3.5 and §3.6 along the way.

## 5. Open for the owner

What the app is for, for Keuangan, over the next year:

- **A. Monthly close.** Excel stays the working tool. This is what the data shows today.
- **B. Daily bookkeeping in the app.**
- **C. Both:** A first, then B.

The answer sets what the home screen, the menu and the journal screens become.
