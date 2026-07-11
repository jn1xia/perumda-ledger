# Formula Specification — LAMPIRAN LAPORAN KEUANGAN JUNI 2026

**Purpose.** This document explains, sheet by sheet, exactly how the division's Excel workbook
(`LAMPIRAN LAPORAN KEUANGAN JUNI 2026.xlsx`) turns the June journal into the published reports
(Neraca, Laba Rugi, Arus Kas, LRA/realisasi), so the Perumda Ledger app can reproduce the same
numbers from the same uploaded journal (`JURNAL JUNI(1).xlsx`).

**Audit date:** 2026-07-10. Every number below was re-derived from the raw journal in Python and
compared against the workbook's cached values. The workbook's published reports are internally
consistent (Neraca balances, Arus Kas ties to Neraca cash), but they rely on several manual
workarounds and hardcodes documented in §8.

---

## 1. Verdict on the upload file

`JURNAL JUNI(1).xlsx` (sheet `JURNAL JUNI 2026`) and the `JURNAL JUNI 2026` sheet inside the
lampiran workbook are **row-for-row identical** in every value that drives the reports:

| Check | Result |
|---|---|
| Journal lines with account code | 426 in both |
| Lines with amounts | 408 (18 lines are Rp 0 placeholders, see §3.4) |
| Total Debit = Total Kredit | **7,028,324,987.1605** in both |
| Per-account D/K totals | 0 differences |
| Code, date, Akun name, Sub Akun name per row | 0 differences (byte-exact, incl. trailing spaces) |
| Only difference | Upload file's `Keterangan` column (H) is empty on all 426 rows; lampiran has text on 326 rows. Voucher no. (col C) identical (306 rows). |

**Conclusion: any difference between the app's reports and the lampiran is caused by the app's
computation/mapping logic (or its opening balances), never by the uploaded rows.** The
delete-June-then-upload flow re-creates exactly the data the division used.

---

## 2. Workbook dataflow (big picture)

```
JURNAL JUNI 2026  (426 lines, June only)
   │
   │  SUMIF by *Akun name* (journal col D)          SUMIF/SUMIFS by *Sub Akun name* (journal col E)
   ▼                                                 ▼
DATA LAMPIRAN NERACA                             DATA LAMPIRAN LABA RUGI 2026
(per-account trial balance:                      (per-sub-account monthly matrix,
 saldo awal + D − K = saldo akhir)                only the "Juni" column pair is live)
   │                                                 │
   ├──────────────┬──────────────┐                   ├───────────────┬────────────
   ▼              ▼              ▼                   ▼               ▼
NERACA JUNI    LABA RUGI     ARUS KAS            Penerimaan      Beban Umum / Beban
2026           JUNI 2026     JUNI 2026           (+ Rekap)       Operasional / Investasi
(accrual)      (June only)   (indirect,          [LRA, cash      (+ Rekap)  [LRA, cash basis]
               │             from Neraca          basis]
               └── J79 feeds  helper cols)
                   Neraca equity
```

Two aggregation keys exist and they are **not interchangeable**:

* **Neraca accounts** are aggregated by the **Akun name** (journal column D).
* **P&L detail, the tax split, and all LRA lines** are aggregated by the **Sub Akun name**
  (journal column E).

The workbook never joins on the numeric code in journal column A. That matters because the codes
in the journal are group-level and in two places contradict the account tables (§3.3, §8.6).

Month chaining: each month the division copies the workbook, pastes last month's Neraca numbers
into the "Mei 2026" column (column K of `NERACA JUNI 2026`, plain values), replaces the journal
sheet with the current month's journal, and updates a few hardcodes (LRA "s.d. bulan lalu"
column, tax rows). There is no year-to-date journal in this file.

---

## 3. Sheet `JURNAL JUNI 2026` (the source)

### 3.1 Layout

| Col | Content | Notes |
|---|---|---|
| A | Account code | Text or number; group-level (see 3.3); dotted codes for assets (`12102.1`, `12102.2`, …) |
| B | Tgl | real dates, 2026-06-01 … 2026-06-30 |
| C | Voucher/No. bukti | e.g. `008`; 306 of 426 rows |
| D | **Akun** (account name) | join key for Neraca-level SUMIFs |
| E | **Sub Akun** (sub-account name) | join key for P&L/LRA SUMIFs; empty on many cash-side lines |
| F | D (debit amount) | |
| G | K (credit amount) | |
| H | Keterangan | description; not used by any formula |
| I | Kategori | header exists, no data |

Headers on row 3; data rows 4–429. **All report SUMIFs read the window rows 1–731** — if a month's
journal ever exceeds 728 data lines, the Excel silently under-counts (§8.8).

### 3.2 Data quality facts (June)

* Every (Tgl, Voucher) group balances: debit = kredit. No orphan amounts, no rows with amounts
  but no code.
* Names appear consistently: each code always carries the same Akun name (49 distinct
  code+name combos, list in §9).
* Three Sub Akun names carry a **trailing space** and must match byte-exactly if you join by
  name: `'Beban Jilid Laporan '`, `'Beban Pembuatan Souvenir Perumda '`, `'Pendapatan Ramayana '`.
  (The annex sheet's name lists contain the same trailing spaces, so the SUMIFs match. An app
  should `trim()` **both** sides of every name join.)

### 3.3 Code semantics (critical for a code-based app)

* Revenue is journaled at **group codes** `41000` / `42000`; the detail lives only in Sub Akun.
* Non-operating items are journaled at **group codes** `70000` / `80000`:
  * `70000 Pendapatan di Luar Operasional` — all 4 lines are interest income
    (Sub Akun `Pendapatan Bunga`), total **K 18,502,909.05**.
  * `80000 Beban di Luar Operasional` — total **D 427,587,282.01**, which the workbook splits
    **by Sub Akun** into:
    * `Beban Pajak Bank` → 3,700,583.01
    * `Beban Administrasi Bank` → 189,900
    * `Beban Kerugian Persediaan` → 329,000
    * **`Pajak Penghasilan` → 423,367,799** (3 rows: 364,112,437 + 4,610,648 + 54,644,714) —
      the workbook treats this as account **99999 Pajak Penghasilan**, *not* as Beban di Luar
      Operasional, even though the journal's column A says 80000.
* Liability code conflict: the journal (and the `COA` sheet) use **21500 = Biaya yang Masih
  Harus Dibayar** and **21600 = Pendapatan Diterima Dimuka**, but `DATA LAMPIRAN NERACA`'s own
  code column says 21500 = Utang Daerah, 21600 = PDD, 21700 = Biaya YMHD. The Excel survives
  because it joins by name; **an app keyed on a 21500=Utang-Daerah table would move
  Rp 488,840,600 to the wrong Neraca line.** Follow the journal/COA-sheet convention.

### 3.4 The 18 zero-amount rows

All dated 2026-06-30, always a (bank, pendapatan-sub-akun) pair with empty D/K. They are
placeholders for revenue streams that happened to be zero this month (e.g. *Pendapatan Layanan
Pengiriman*). They contribute nothing; the import must accept them (import as 0 or skip — both
give identical reports).

---

## 4. Sheet `DATA LAMPIRAN NERACA` (per-account trial balance)

One row per account, rows 6–105. Columns:

| Col | Meaning | Formula (representative row 6, Kas Kecil) |
|---|---|---|
| B | account code (see caveat §3.3) | value |
| C | account name | value — **the SUMIF key** |
| D | normal balance `D`/`K` | value |
| E | **SALDO AWAL** = last month's closing | `='NERACA JUNI 2026'!K13` (points at the May column of the Neraca sheet) |
| F | June debits | `=SUMIF('JURNAL JUNI 2026'!$D$1:$F$731, C6, 'JURNAL JUNI 2026'!$F$1:$F$731)` |
| G | June credits | `=SUMIF('JURNAL JUNI 2026'!$D$1:$G$731, C6, 'JURNAL JUNI 2026'!$G$1:$G$731)` |
| H | **SALDO AKHIR** | `=E+F−G` for D-normal rows; `=E−F+G` for K-normal rows (46, 49, 50, 62, 63, 95…99) |
| I/J | side checks (`Saldo Sebenarnya` = bank statement, selisih) | manual |

Special rows:

* **Row 51 `Biaya yang Masih Harus Dibayar` (K-normal) wrongly uses the D-normal formula**
  `H51 = E51+F51−G51` → **−488,840,600** (sign flipped). The Neraca works around it by
  referencing `G51` directly (§5). Correct value: **+488,840,600**.
* Row 58 `Saldo Laba (Rugi) Periode Lalu`: `H58 = E58 + E59` — i.e. *May's* retained earnings
  plus *May's* monthly result. This is the equity roll-forward rule.
* Row 59 `Laba (Rugi) Periode Berjalan`: `H59 = I106` (June **pre-tax** profit, see below) —
  note the published Neraca does **not** use this cell; it uses the after-tax result from the
  Laba Rugi sheet.
* Rows 95–105 (non-operating + tax): `F` uses `SUMIFS(F-range, E-range(Sub Akun), name)` —
  matching **Sub Akun**, not Akun. Row 95's income figure is read from the *header-level* credit
  SUMIF (`I95 = SUM(F95:H95)` → 18,502,909.05).
* Row 106 **June pre-tax profit**:
  `I106 = I61 + I95 − I65 − I69 − I84 − I100`
  = Pendapatan (1,290,289,465) + Pend. luar ops (18,502,909.05) − BPP (189,138,200)
  − Beban adm&umum (743,330,990.1005) − Beban ops (338,921,203) − Beban luar ops (4,219,483.01)
  = **33,182,497.9395**. (After PPh 423,367,799 → −390,185,301.0605, which is what the reports
  show as the June result.)
* Cell `I42 = SUM(H6:H42)` = **Jumlah Aset 866,015,868,530.02** (header rows contribute 0).
* Cell `I60 = SUM(H45:H60)` is the workbook's own liabilities+equity check and is **broken**
  (865,461,555,129.02): off by −977,681,200 (row-51 sign bug ×2) and +423,367,799 (H59 is
  pre-tax). The published Neraca bypasses both problems.

**App rule:** `closing(account) = opening(account) ± (D − K)` with the sign from the account's
normal balance; opening = May's published Neraca figure; PPh rows must be classified by Sub Akun.

---

## 5. Sheet `NERACA JUNI 2026` (published balance sheet, accrual)

Column I = Juni (formulas), column K = Mei (pasted values), columns L/M = helper deltas used by
Arus Kas. Line map (row → source → June value):

| Row | Line | Source formula | Juni 2026 | Mei 2026 (col K) |
|---|---|---|---:|---:|
| 13 | Kas Kecil | `='DATA LAMPIRAN NERACA'!H6` | 10,932,615 | 23,529,440 |
| 14 | Kas Pendapatan Belum Setor | `=[84]des!F6` (broken ext. link → 0) | 0 | 0 |
| 15 | Kas Bank Kalsel | `=DLN!H8` | 6,806,187,798.87 | 6,321,630,612.83 |
| 16 | Bank BNI | `=DLN!H9` | 8,913,626,899 | 8,000,941,421 |
| 17 | Investasi Jangka Pendek | `=DLN!H10` | 0 | 0 |
| 18 | Bank BNI Bisnis | `=DLN!H11` | 206,989,852 | 123,696,497 |
| 19 | Bank BNI Tapcash | `=DLN!H12` | 53,110,935 | 53,119,090 |
| 20 | Bank BSI | `=DLN!H13` | 35,948,000 | 30,983,000 |
| 21 | Piutang Usaha | `=DLN!H15` | 344,711,240 | 403,062,651 |
| 22 | Perlengkapan | `=DLN!H19` | 0 | 0 |
| 23 | Persediaan (Bapok/Gerai Inflasi) | `=DLN!H20` | 64,011,250 | 57,460,250 |
| 24 | Persediaan (Gas LPG) | `=DLN!H21` | 46,500,000 | 47,720,000 |
| 25 | BBM Dibayar di Muka | `=DLN!H22` | 31,400,000 | 22,100,000 |
| 27 | **Jumlah Aset Lancar** `=SUM(I13:I25)` | | **16,513,418,589.87** | 15,084,242,961.83 |
| 30 | Tanah | `=DLN!H26` | 786,424,200,000 | 786,424,200,000 |
| 31 | Bangunan | `=DLN!H27` | 65,946,028,418 | 65,522,933,418 |
| 32 | Ak. Peny. Bangunan | `=DLN!H28` | −4,854,509,850.121666 | −4,581,497,627.541666 |
| 34 | **Nilai Buku Properti Investasi** `=SUM(I30:I32)` | | **847,515,718,567.8783** | 847,365,635,790.4584 |
| 37/38 | Mesin / Ak.Peny. | `=DLN!H32/H33` | 59,310,000 / −7,413,750 | 59,310,000 / −6,795,937.50 |
| 39/40 | Instalasi Listrik / Ak.Peny. | `=DLN!H34/H35` | 49,196,330 / −1,266,430.229167 | 14,033,500 / −819,593.458333 |
| 41/42 | Peralatan / Ak.Peny. | `=DLN!H36/H37` | 833,460,567 / −73,616,327.996 | 829,610,567 / −36,768,059.829667 |
| 43/44 | Kendaraan / Ak.Peny. | `=DLN!H30/H31` | 355,905,800 / −29,658,816.50 | 355,905,800 / −25,951,464.416667 |
| 45 | **Nilai Buku Aset Tetap** `=SUM(I37:I44)` | | **1,185,917,372.2748** | 1,188,524,811.7953 |
| 47 | Aset Dalam Penyelesaian | `=DLN!H38` | 800,814,000 | 99,280,000 |
| 50 | Aset Tidak Berwujud | `=[84]okt!F32` (broken → 0) | 0 | 0 |
| 51 | **Jumlah Aset Tidak Lancar** `=I34+I45+I50+I47` | | **849,502,449,940.1531** | 848,653,440,602.2537 |
| 53 | **JUMLAH ASET** `=I27+I51` | | **866,015,868,530.0231** | 863,737,683,564.0836 |
| 57 | Dana Talangan | `=[84]des!F40` (broken → 0) | 0 | 0 |
| 58 | Utang Usaha | `=DLN!H46` | 21,000,000 | 32,712,000 |
| 59 | Utang Daerah | `=DLN!H49` | 19,742,006 | 19,742,006 |
| 60 | Pendapatan Diterima Dimuka | `=DLN!H50` | 3,739,575,002 | 1,548,333,335 |
| 61 | Biaya yang Masih Harus Dibayar | **`=DLN!G51`** (workaround for the row-51 sign bug — reads the raw June *credit*; correct only while opening balance and June debits are both 0) | 488,840,600 | 0 |
| 64 | Utang Bank | `=[84]okt!F43` (broken → 0) | 0 | 0 |
| 66 | **JUMLAH KEWAJIBAN** `=SUM(I57:I65)` | | **4,269,157,608** | 1,600,787,341 |
| 70 | Modal Perumda | `=DLN!H56` | 850,759,100,000 | 850,759,100,000 |
| 71 | Modal Disetor | `=DLN!H57` | 15,000,000,000 | 15,000,000,000 |
| 72 | Saldo Laba (Rugi) Periode Lalu | **`=K72+K73`** (May's saldo lalu + May's monthly result) | −3,622,203,776.916666 | −3,237,908,077.13 |
| 73 | (Laba) Rugi Periode Berjalan | **`='LABA RUGI JUNI 2026'!J79`** (June-only, after tax) | −390,185,301.0605 | −384,295,699.786667 |
| 74 | Koreksi Ekuitas | `=DLN!H60` | 0 | 0 |
| 75 | **JUMLAH EKUITAS** `=SUM(I70:I74)` | | **861,746,710,922.0228** | 862,136,896,223.0834 |
| 77 | **JUMLAH KEWAJIBAN DAN EKUITAS** `=I75+I66` | | **866,015,868,530.0228** | 863,737,683,564.0834 |
| 79 | balance check `=I77−I53` | | **0** ✔ | 0 ✔ |

**Equity roll-forward rule (the thing an app most often gets wrong):**

```
SaldoLabaPeriodeLalu(Juni) = SaldoLabaPeriodeLalu(Mei) + LabaPeriodeBerjalan(Mei)
LabaPeriodeBerjalan(Juni)  = June-only after-tax result   (NOT year-to-date)
```

Helper columns (used by Arus Kas): for **asset** rows `L/M = K − I` (May − Juni; decrease = cash
in); for **liability** rows `L/M = I − K` (Juni − May; increase = cash in). `M61 = I61 − K61`.

---

## 6. Sheet `LABA RUGI JUNI 2026` (published income statement — **June single month**)

Column J = Juni, column L = Mei (values). All account lines read `DATA LAMPIRAN NERACA` column H
(which for P&L accounts equals the June journal movement since E is empty):

| Row | Line | Source | Juni |
|---|---|---|---:|
| 13 | Pendapatan Bisnis Utama | `=DLN!H62` | 923,617,078 |
| 14 | Pendapatan Pengembangan Bisnis Lainnya | `=DLN!H63` | 366,672,387 |
| 15 | **Jumlah Pendapatan Usaha** | `=J13+J14` | **1,290,289,465** |
| 18 | BPP (Bapok & Gerai Inflasi) | `=DLN!H66` | 183,038,200 |
| 19 | BPP (Gas LPG) | `=DLN!H67` | 6,100,000 |
| 20 | **Jumlah BPP** | `=SUM` | **189,138,200** |
| 21 | **Laba (Rugi) Bruto** | `=J15−J20` | **1,101,151,265** |
| 25–39 | Beban Umum & Administrasi lines | `=DLN!H70…H83` (Gaji 179,037,684; Tunjangan 62,007,444; Kelengkapan 4,060,000; ATK 8,663,900; Telepon/Listrik 7,178,813; Konsumsi Rapat 12,094,665; Perlengkapan Kantor 3,435,800; BBM 92,400,000; Perjalanan Dinas 7,869,513; Diklat 1,800,000; Sewa Kendaraan 31,799,999; Jasa Profesional 6,000,000; **Penyusutan 314,632,492.1005**; Umum Lainnya 12,350,680) | |
| 40 | **Jumlah Beban Umum & Adm.** | `=SUM(J25:J39)` | **743,330,990.1005** |
| 43–52 | Beban Operasional & Bisnis lines | `=DLN!H85…H94` (Pemel. Kendaraan 11,454,000; Pemel. Pasar 61,941,820; Barang Cetakan 684,500; Honor TK/HL 193,911,479; Tunj. Peg. Ops 23,929,404; Insentif 6,700,000; Keamanan 40,300,000; others 0) | subtotal 338,921,203 |
| 53 | **Beban PPN dan PPH** | **hardcoded `423367799`** (should be `=DLN!H105`) | 423,367,799 |
| 54 | **Jumlah Beban Operasional & Bisnis** | `=SUM(J43:J53)` | **762,289,002** |
| 56 | **Jumlah Beban Usaha** | `=J40+J54` | **1,505,619,992.1005** |
| 58 | **Laba (Rugi) Usaha** | `=J21−J56` | **−404,468,727.1005** |
| 62 | Pendapatan Bunga Bank | `=DLN!I95` | 18,502,909.05 |
| 65 | Jumlah Pendapatan Lain-lain | | 18,502,909.05 |
| 67 | Beban Pajak Bank | `=DLN!H101` | 3,700,583.01 |
| 68 | Beban Administrasi Bank | `=DLN!H102` | 189,900 |
| 70 | Beban Kerugian Persediaan | `=DLN!H104` | 329,000 |
| 73 | **Jumlah Beban Non Operasional** | `=SUM(J67:J71)` | **4,219,483.01** |
| 75 | Jumlah Pendapatan dan (Beban Lain-lain) | `=J65−J73` | 14,283,426.04 |
| 77 | **Laba (Rugi) Bersih Sebelum Pajak** | `=J58+J75` | **−390,185,301.0605** |
| 78 | Beban Pajak Penghasilan | **hardcoded `0`** (May had 67,028,943 here) | 0 |
| 79 | **Laba (Rugi) Bersih Setelah Pajak** | `=J77−J78` | **−390,185,301.0605** |
| 81 | **EBITDA** | `=J79−J62+J67+J38+J53` | **333,012,664.00** |

**June's tax presentation is a manual choice**: the whole June PPh (423,367,799 — an annual/PPh
final settlement paid in June) was placed **inside Beban Operasional (row 53)** and the dedicated
tax row 78 was zeroed. In May the same workbook did the opposite (row 53 = 0, row 78 =
67,028,943). Net income and EBITDA are identical either way (EBITDA adds back both J53 and J78's
effect), but **rows 54/56/58/77 only match the lampiran if the app puts PPh in the same place**.
Recommendation for the app: keep PPh as its own component (account 99999 via Sub Akun
`Pajak Penghasilan`) and render it in the June-report position (operating section, "Beban PPN dan
PPH") for period 2026-06, since that is the shape of the official June book.

---

## 7. Sheet `ARUS KAS JUNI 2026` (indirect method)

Column D = Juni, F = Mei (values). Every line and its source:

| Row | Line | Source | Juni |
|---|---|---|---:|
| 9 | Laba (Rugi) Sebelum Pajak | `='LABA RUGI JUNI 2026'!J77` (label is misleading: June's J77 already includes the PPh because of the row-53 presentation) | −390,185,301.0605 |
| 10 | Penyusutan Aset Tetap (add back) | `=LR!J38` | +314,632,492.1005 |
| 13 | Δ Piutang Usaha | `=NERACA!M21` = Mei − Juni | +58,351,411 |
| 14 | Δ Perlengkapan | `=NERACA!M22` | 0 |
| 15 | Δ Aset Dalam Penyelesaian | `=NERACA!L47` = Mei − Juni | −701,534,000 |
| 16 | Δ Persediaan Bapok | `=NERACA!M23` | −6,551,000 |
| 17 | Δ Persediaan LPG | `=NERACA!M24` | +1,220,000 |
| 18 | Δ BBM Dibayar di Muka | `=NERACA!M25` | −9,300,000 |
| 19 | Δ Utang Usaha | `=NERACA!M58` = Juni − Mei | −11,712,000 |
| 20 | Δ Utang Daerah | `=NERACA!M59` | 0 |
| 21 | Δ Biaya yang Masih Harus Dibayar | `=NERACA!M61` | +488,840,600 |
| 22 | Pajak Penghasilan | `=−LR!J78` | 0 (May: −67,028,943) |
| 23 | Δ Pendapatan Diterima Dimuka | `=NERACA!M60` | +2,191,241,667 |
| 24 | **Arus kas dari aktivitas operasi** | `=SUM(D9:D23)` | **1,935,003,869.04** |
| 27 | Pembelian Aset Tetap | `=NERACA!L39+L41+L31` = −(ΔInstalasi + ΔPeralatan + ΔBangunan) | **−462,107,830** |
| 28 | Pengadaan Aset Tidak Berwujud | `='[222]NERACA OKT'!…` (broken ext. link → 0) | 0 |
| 29 | **Arus kas untuk investasi** | | **−462,107,830** |
| 32/33 | Utang Bank / Penyetoran Modal | hardcoded 0 | 0 |
| 34 | **Arus kas pendanaan** | | **0** |
| 36 | **Kenaikan bersih kas** | `=D24+D29+D34` | **1,472,896,039.04** |
| 37 | Kas dan Setara Kas Periode Sebelumnya | `=SUM(NERACA!J13:K20)` (May cash rows) | 14,553,900,060.83 |
| 38 | Koreksi Kas | broken ext. link → 0 | 0 |
| 39 | **Kas dan Setara Kas Akhir Periode** | `=D36+D37+D38` | **16,026,796,099.87** |
| 43/44 | tie-out: `D43=SUM(NERACA!I13:I20)`; `D44=D39−D43` | | D44 = **0** ✔ |

Sign conventions to encode in the app:

* Asset working-capital lines: `Mei − Juni` (a decrease is positive cash).
* Liability lines: `Juni − Mei` (an increase is positive cash).
* Capex = −(increase of gross Bangunan + Instalasi Listrik + Peralatan). June:
  423,095,000 + 35,162,830 + 3,850,000. (Depreciation is excluded because Δ uses **gross**
  cost lines, not the akumulasi rows; Aset Dalam Penyelesaian sits in *operating* per the
  division's format — replicate as-is.)
* Cash scope for rows 37/39/43: the eight cash & bank accounts (Neraca rows 13–20).

---

## 8. Sheet `DATA LAMPIRAN LABA RUGI 2026` (sub-account matrix — feeds all LRA sheets)

* One row per **Sub Akun** (rows 3–163, column A = sub-code, column B = name — the SUMIF key).
* Column pairs per month: D/E = "Juni" (the live one), F/G…Z/AA = legacy Feb–Des pairs whose
  SUMIF ranges point at journal row-slices (rows 732–4569) that no longer exist in this
  monthly file — they all return 0 and are dead weight. AB = Total (sums all K-pairs minus
  D-pairs), AD = "S2".
* Live June formulas: `D<r> = SUMIF(JURNAL!$E$1:$F$731, B<r>, JURNAL!$F$1:$F$731)` (debits by
  Sub Akun); `E<r> = SUMIF(JURNAL!$E$4:$G$731, B<r>, JURNAL!$G$4:$G$731)` (credits). Some later
  rows' credit range starts at `$E$330` instead — harmless for this data (all revenue-side
  credits sit in the 30-June batch, rows 330–429) but a trap if row order changes.
* Header rows aggregate children: e.g. `E3 (41000) = SUM(E4:E12) − SUM(D4:D12)` =
  **923,617,078**; row 153 (`Pendapatan di Luar Operasional`) `E153 = SUM(E154:E157)` =
  18,502,909.05; row 158 (`80000`) `D158 = SUM(D159:D163)` = 427,587,282.01 **including row 163
  `99999 Pajak Penghasilan` = 423,367,799**.
* Legacy typo: row-4's Desember pair overlaps November's range (rows 3140–3146 double-counted)
  — dead code today, do not replicate.

**App rule:** June "bulan ini" for any LRA line = Σ debit (or credit − debit for revenue) of the
journal lines whose **Sub Akun** equals that line's name (trimmed).

---

## 9. LRA sheets (cash-basis realization vs. budget)

Four detail sheets + four `Rekap` mirrors. All follow the same column scheme:

| Col | Meaning | Formula |
|---|---|---|
| G (or H) | Anggaran 1 Tahun | hardcoded budget (RKA) |
| H (or I) | Anggaran bulan Juni | `=G/12` for monthly items, `=G` for one-shot/annual items (THR, pakaian, souvenir…) |
| I (or J) | Realisasi s.d. bulan lalu | **hardcoded** — carried over from May's workbook |
| J (or K) | **Realisasi bulan ini** | reference into `DATA LAMPIRAN LABA RUGI 2026` (D column for beban, E or E−D for pendapatan) or `DATA LAMPIRAN NERACA` F/G for special lines |
| K (or L) | Realisasi s.d. bulan ini | `= I + J` |
| L (M) | Capaian % bulan | `= J/H*100` |
| M (N) | Selisih | `= G − K` |
| N (O) | Deviasi % | `= K/G*100` |

Sheet specifics and June control totals:

* **`Penerimaan`** ("2.1.1 Laporan Penerimaan Bulan Juni", *cash basis*):
  * Bisnis Utama rows use `E−D` of the annex; line **1.6 Pendapatan Pengelolaan Lain-lain**
    = `'DATA LAMPIRAN NERACA'!G15` = the June **credits to Piutang Usaha (11201)** =
    **58,351,411** — i.e. receivable collections count as cash-basis receipts.
  * Line 1.8 Pendapatan Ramayana = 189,833,333 (Sub Akun `'Pendapatan Ramayana '`, trailing space).
  * Totals bulan ini: Bisnis Utama **981,968,489**; Ops Lainnya **366,672,387**;
    Pendapatan usaha **1,348,640,876**; + Bunga/Jasa Giro **18,502,909.05**
    (annex `E154`) → **TOTAL PENDAPATAN 1,367,143,785.05**.
* **`Beban Umum`** ("2.1.4"): rows map to annex D-cells (D31…D112). TOTAL BEBAN UMUM bulan ini
  **J100 = 428,698,498** = accrual Beban Umum & Adm (743,330,990.1005) **minus depreciation**
  (314,632,492.1005) — depreciation is non-cash and has no RKA line.
* **`Beban Operasional `** (note trailing space in sheet name; "2.1.3"): K-column from annex
  D115…; section 4 (Beban Pokok) rows are **hardcoded** to the month's inventory *purchases*
  (cash view): K61 = **194,798,200** = 11401 debits 189,918,200 + 11402 debits 4,880,000, K62=0.
  TOTAL bulan ini **K64 = 533,719,403** = ops beban 338,921,203 + purchases 194,798,200.
* **` Investasi`** (leading space; "2.1.2"): month figures partly hardcoded, partly
  `='DATA LAMPIRAN NERACA'!F34` -style (gross asset debits). TOTAL bulan ini
  **J61 = 462,107,830** (= Bangunan 423,095,000 + Instalasi 35,162,830 + Peralatan 3,850,000 —
  ties to the Arus Kas investing line).
* PPh, pajak/adm bank do **not** appear in any LRA sheet (non-RKA items).
* `Rekap Penerimaan` / `Rekap Beban Umum` / `Rekap Beban Operasional ` / `Rekap Investasi`
  contain no new logic — every cell references the corresponding detail sheet.

**App rule:** LRA bulan-ini comes from Sub-Akun sums (plus the two cash-basis specials:
piutang collections into Penerimaan 1.6, and inventory purchases as Beban Pokok). LRA kumulatif
= May kumulatif (stored) + bulan ini. Never derive kumulatif by re-summing the *accrual* P&L.

---

## 10. Other sheets

* **`COA`** — flat code→name list. This is the authoritative code table that matches the journal
  (21500 = Biaya YMHD, 21600 = PDD, 22300 = Utang Daerah, 70000–70004, 80000–80004, 99999).
  Also contains the RKA program list (rows 219+). Keep the app's COA in sync with this sheet.
* **`DAFTAR AKTIVA TETAP`** — fixed-asset register (title says "PER 30 JUNI 2025", stale).
  Source of the monthly depreciation journal: June's 61130 entries (314,632,492.1005 total)
  credit the five akumulasi accounts (Bangunan 273,012,222.58; Kendaraan 3,707,352.0833;
  Mesin 617,812.50; Instalasi 446,836.7708; Peralatan 36,848,268.1663). Column O contains 51
  `#REF!` scratch cells — ignore.
* **`RASIO`** — ratio template whose input cells (G47…) were never filled for June →
  `#DIV/0!`/`#VALUE!` on J47/J51/J55/J61/J65. Not a data problem.
* **Hidden sheets** (`NERACA JAN…DES`, `LR PERIOD *`, `CF *`, `TW*`, `S1/S2`, `(THN)`,
  `PENYUSUTAN *`, `LPE`, `CALK`, `Cut Off`, `NERACA AWAL`, `Sub Akun`, `Akun Utama`,
  `Rekap Akun & Saldo`) — the division's archive of prior months and annual/consolidation
  machinery. They are not part of the June publishing path and several contain `#REF!`.
* **External links**: the workbook defines **111** external-workbook references (mostly ancient
  audit-template junk). Two are *live* in June formulas: `[84]` (…LAPORAN PERUMDA 2025…xlsx) in
  Neraca rows 14/50/57/64 and `[222]NERACA OKT` in Arus Kas rows 28/38. All currently resolve to
  cached 0. **Never recalc this workbook without those files present** — and the app should treat
  those four Neraca lines + two CF lines as constants 0 for June.

---

## 11. Defects found in the workbook (ranked)

| # | Where | Defect | June impact |
|---|---|---|---|
| 1 | `DATA LAMPIRAN NERACA` H51 | K-normal account uses D-normal formula → −488,840,600 | None on published Neraca (worked around via `G51`), but breaks the sheet's own L+E check `I60`; **will produce a wrong Neraca in any month where Biaya YMHD has an opening balance or a debit** |
| 2 | `LABA RUGI` J53/J78 | PPh hardcoded into the operating section, tax row zeroed; opposite of May's presentation | Subtotals (J54/J56/J58/J77) are only reproducible if the app mirrors the same placement per month |
| 3 | `NERACA` I14/I50/I57/I64, `ARUS KAS` D28/D38 | Live formulas into missing external workbooks `[84]`/`[222]` | Cached 0 today; any recalc without those files → stale/#REF |
| 4 | `Beban Operasional ` K61/K62, all LRA I-columns, `LABA RUGI` J53 | Hardcoded month values instead of formulas | Values are correct for June but silently go stale when the template is reused |
| 5 | `DATA LAMPIRAN NERACA` rows 14/15 | Duplicate rows `' Piutang Usaha'` (leading space, 11200) and `'Piutang Usaha'` (11201) | Excel's untrimmed SUMIF keeps them apart; an app that trims **and** keeps both rows would double-count 58,351,411 |
| 6 | Code tables | `DATA LAMPIRAN NERACA` codes (21500/21600/21700) contradict `COA` + journal (21500/21600, no 21700); annex sub-codes shift too (70001 = header there, = Pendapatan Bunga in DLN) | Name-joins hide it; a code-keyed app must adopt the **COA-sheet** convention |
| 7 | Journal / annex names | Trailing-space names (`'Pendapatan Ramayana '` etc.) | Must trim consistently on both sides of every join |
| 8 | All SUMIF ranges | Fixed window rows 1–731 of the journal | A month with > ~728 journal lines would silently under-report in Excel; the app has no such limit — expect Excel↔app diffs in that scenario, Excel being the wrong one |
| 9 | `RASIO`, `DAFTAR AKTIVA TETAP`, hidden sheets | `#DIV/0!`, `#VALUE!`, 300+ `#REF!` | Cosmetic/legacy; not in the publishing path |
| 10 | `DATA LAMPIRAN NERACA` I8 vs H8 | Bank Kalsel ledger 6,806,187,798.87 vs statement 6,806,187,799.69 (−0.82) | Known unreconciled Rp 0.82; the ledger figure is what's published |

---

## 12. June 2026 acceptance checksums (what the app must output)

Store decimals — several figures carry fractional rupiah from depreciation
(…,492.1005) and bank interest (….05). Integer rounding per line will not tie.

**Neraca 30-06-2026:** Aset Lancar 16,513,418,589.87 · NB Properti Investasi 847,515,718,567.88
· NB Aset Tetap 1,185,917,372.27 · ADP 800,814,000 · **Total Aset 866,015,868,530.02** ·
Kewajiban 4,269,157,608 (Utang Usaha 21,000,000; Utang Daerah 19,742,006; PDD 3,739,575,002;
Biaya YMHD 488,840,600) · Ekuitas 861,746,710,922.02 (Modal 850,759,100,000 + 15,000,000,000;
Saldo lalu −3,622,203,776.92; Berjalan −390,185,301.06) · **balance diff 0**.

**Laba Rugi Juni (single month):** Pendapatan usaha 1,290,289,465 · BPP 189,138,200 · Bruto
1,101,151,265 · Beban Umum&Adm 743,330,990.1005 · Beban Ops (incl. PPh line) 762,289,002 ·
Laba usaha −404,468,727.1005 · Lain-lain net +14,283,426.04 · **Sebelum pajak −390,185,301.0605**
· Pajak (row) 0 · **Setelah pajak −390,185,301.0605** · **EBITDA 333,012,664.00**.

**Arus Kas Juni:** Operasi **1,935,003,869.04** · Investasi **−462,107,830** · Pendanaan 0 ·
Kenaikan **1,472,896,039.04** · Kas awal 14,553,900,060.83 · **Kas akhir 16,026,796,099.87**
(= Σ Neraca cash rows 13–20).

**LRA bulan Juni:** Penerimaan total **1,367,143,785.05** (bisnis utama 981,968,489 — incl.
piutang collections 58,351,411 and Ramayana 189,833,333; ops lainnya 366,672,387; bunga
18,502,909.05) · Beban Umum **428,698,498** · Beban Operasional **533,719,403** (338,921,203 ops
+ 194,798,200 purchases) · Investasi **462,107,830**.

**Journal integrity:** 426 lines, D = K = 7,028,324,987.1605, every (Tgl, voucher) group balanced.

---

## 13. Fix plan for the Perumda Ledger app

The uploaded data is proven identical to the division's book (§1), so the fixes are all on the
computation side. In dependency order:

1. **Normalize on import** (`excelParsers.js` / `reportSnapshot.js`):
   `trim()` Akun and Sub Akun names; keep zero-amount lines (or drop — equivalent); keep dotted
   asset codes as strings; don't reject empty Keterangan (already fixed for NULL-keterangan
   crash). Never re-derive the account from the code table alone — store both code and the two
   names on every journal line.

2. **Account resolution = COA-sheet convention + Sub-Akun overrides.** Build one shared resolver
   (extend `lraOutline.js`) used by ledger, Neraca, L/R, AK and LRA:
   * default: journal code (group level is fine);
   * override by Sub Akun for the non-operating block: `Pajak Penghasilan` → 99999,
     `Beban Pajak Bank` → 80001, `Beban Administrasi Bank` → 80002, `Beban Kerugian
     Persediaan` → 80004, `Pendapatan Bunga` → 70001;
   * map 21500 → Biaya yang Masih Harus Dibayar, 21600 → PDD (per COA sheet — verify the app's
     seeded COA (`sampleData.js` / DB) agrees; the earlier "unknown COA codes 11108, 21600"
     consistency warnings indicate it may not).

3. **Neraca engine (journal mode):** `closing = MayClosing ± (D − K)` per normal-balance side.
   May closing comes from the May audited snapshot (Neraca column K values above are the
   authority). Equity: `saldoLalu(Jun) = saldoLalu(Mei) + berjalan(Mei)`;
   `berjalan(Jun) = June-only after-tax result`. The four external-link lines (Kas Pendapatan
   Belum Setor, Aset Tidak Berwujud, Dana Talangan, Utang Bank) are 0.

4. **Laba Rugi engine:** June-only movements (not YTD). Reproduce the row map of §6 including
   the PPh placement rule: PPh (Sub Akun `Pajak Penghasilan`) rendered as "Beban PPN dan PPH"
   inside Beban Operasional for 2026-06, tax row 0. Suggest making the placement a per-period
   flag so months like May (tax row) also reproduce. Assert EBITDA per the J81 formula.

5. **Arus Kas engine:** implement §7 literally (it reduces to: net income + depreciation +
   Δworking-capital with the stated signs; capex = Δgross of the three asset lines; cash scope =
   the 8 cash/bank accounts; final tie `kasAkhir == Σ neraca cash` must be asserted, mirroring
   the workbook's own D44 = 0 check).

6. **LRA engine:** bulan-ini strictly by Sub Akun (§8), plus the cash-basis specials:
   Penerimaan 1.6 = credits to 11201; Beban Pokok section = debits to 11401/11402; exclude
   depreciation, PPh and bank charges. Kumulatif = stored May kumulatif + bulan ini (never
   re-sum accrual P&L). The May kumulatif figures are the LRA I-columns of this workbook —
   load them once as the May LRA snapshot.

7. **Delete-then-upload flow hardening:** deleting a month's journals must delete **only** that
   month's journals + derived snapshots for that month (`clearReports` path) and must never
   touch the prior month's snapshot (the opening balances) or `period_status` of other months.
   After upload, recompute June in journal mode from the May baseline. (Most of this exists
   since the 07-07/07-08 rounds — verify Neraca/AK now read the May snapshot as opening.)

8. **Regression tests** (`tests/reports/`): pin §12's checksum table against the real fixture
   (`JURNAL JUNI(1).xlsx` — same content as the existing division fixture) for all four reports,
   not just L/R; add the equity-rollforward and kasAkhir-tie assertions; add a test that a
   deliberately misplaced PPh (classified as 80000) fails the L/R subtotals — this is the
   regression that silently produced "different values" before.

**Priority if you only fix three things:** (2) Sub-Akun overrides incl. PPh→99999 and the 21500
mapping, (3) opening balances + equity roll-forward, (5)/(6) the AK/LRA sign & cash-basis rules —
together they account for every way this workbook's numbers can diverge from a naive
code-keyed, YTD, accrual-only recomputation.
