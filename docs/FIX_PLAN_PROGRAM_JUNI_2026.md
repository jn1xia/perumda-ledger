# Fix Plan — Make Journal-Mode Reports Match the Official Lampiran (Juni 2026)

> **STATUS 2026-07-11: IMPLEMENTED & VERIFIED.** All phases below are done
> (`lraOutline.js` reroute incl. revenue streams, alias maps, `composeLabaRugi`,
> equity roll-forward, `buildArusKasIndirectRows`, LRA cash-basis rules + the
> latest-audited-month cumulative seed). 26/26 tests pass incl.
> `tests/reports/juneLampiranAcceptance.test.mjs` pinning every spec §12 figure;
> verified live in the app against the June DB state (Neraca / L/R / Arus Kas /
> LRA all match the lampiran line by line). Remaining: deploy to Fly + the
> division re-runs their delete-June → upload flow.

**Scope.** The production flow is: user deletes all June journals → uploads
`JURNAL JUNI(1).xlsx` → the app computes June reports in *journal mode* (no frozen snapshot).
The uploaded data is proven byte-identical to the division's own book
(see `docs/FORMULA_SPEC_LAMPIRAN_JUNI_2026.md` §1), so every remaining difference is an
app computation/mapping issue. This plan lists them with file-level fixes, in build order.

**Companion documents.**
* `docs/FORMULA_SPEC_LAMPIRAN_JUNI_2026.md` — how every Excel sheet computes (the target semantics).
* `docs/EXCEL_FLAWS_JUNI_2026.md` — defects in the Excel itself (what NOT to blindly replicate).

**Definition of done.** With a clean June (delete-all + re-upload of the division file), the
app's Neraca / Laba Rugi / Arus Kas / LRA for 2026-06 reproduce the acceptance checksums in
spec §12, line by line — not just bottom lines.

---

## 0. Current-state diagnosis (what the code does today vs the lampiran)

Verified against `src/pages/Laporan.jsx`, `src/utils/reportDelta.js`, `src/utils/lrAlias.json`,
`src/utils/reconcileAlias.json`, `src/utils/lraOutline.js` on 2026-07-10.

### D1. PPh is invisible as tax — every L/R subtotal shifts by Rp 423.367.799

June's income tax is journaled under **code 80000** with only Sub Akun = `Pajak Penghasilan`
(3 rows: 364,112,437 + 4,610,648 + 54,644,714). The engines bucket by code prefix:

* `Laporan.jsx:352` `dynBebanNonOps = sumJByPrefix('8', …)` → PPh lands in **Beban Non-Ops**.
* `Laporan.jsx:364` `dynPajakPenghasilan = sumJByPrefix('99', …)` → **0** (no 99xxx code exists in the file).
* `reportDelta.js:203` same story in `attributeDelta` (`/^8/` → `bebanNonOps`, `/^9/` → `pajak` never fires).

Resulting June L/R (app) vs lampiran:

| Line | App today | Lampiran | Δ |
|---|---:|---:|---:|
| Jumlah Beban Operasional dan Bisnis | 338,921,203 | 762,289,002 | −423,367,799 |
| Laba (Rugi) Usaha | +18,899,071.90 | −404,468,727.10 | +423,367,799 |
| Jumlah Beban Non Operasional | 427,587,282.01 | 4,219,483.01 | +423,367,799 |
| Jumlah Pendapatan dan (Beban Lain-lain) | −409,084,372.96 | +14,283,426.04 | −423,367,799 |
| Laba Bersih Sebelum/Setelah Pajak | −390,185,301.06 | −390,185,301.06 | 0 (by accident) |

The bottom line and EBITDA currently match **by luck**: `Laporan.jsx:383`'s
`/pajak/i` regex on the account string (`"80000 - Beban di Luar Operasional > Pajak
Penghasilan"`) sweeps the PPh into `dynBebanPajakBank` (427,068,382.01 — itself a wrong number
for that line), which happens to cancel in the EBITDA formula. The overlay path
(`buildLabaRugiRows`, used for multi-month views) has **no** such luck: its `bunga` gate is
`/^70001/` and `pajakBank` gate `/^80001/` (`reportDelta.js:202-203`), both 0 for June-style
data → its EBITDA is off by ~427jt.

### D2. Neraca alias map is stale — June deltas land on wrong lines or "Belum Terpetakan"

`src/utils/reconcileAlias.json` today:

* **Bank lines shifted by one code.** It maps `11105→Bank BNI Bisnis`, `11106→Bank BNI
  Tapcash`, `11107→Bank BSI`. Per the 2026 COA (and the June journal): `11105 = Investasi
  Jangka Pendek`, `11106 = Bank BNI Bisnis`, `11107 = Bank BNI Tapcash`, `11108 = Bank BSI`.
  → June's BNI Bisnis movement (+83,293,355) displays on the **Tapcash** row, Tapcash
  (−8,155) on the **BSI** row, BSI (+4,965,000) is **unmapped**.
* **Liability codes are legacy** (`21001/21002/21003/22001`) — the June file uses `21200`
  (Utang Usaha), `21500` (Biaya yang Masih Harus Dibayar), `21600` (Pendapatan Diterima
  Dimuka). None resolve → the Utang Usaha (−11,712,000), Biaya YMHD (+488,840,600) and PDD
  (+2,191,241,667) deltas move **only the JUMLAH KEWAJIBAN total**, while the individual
  lines keep showing May's values. There is also **no Neraca row/label at all** for "Biaya
  yang Masih Harus Dibayar" to receive the delta if the baseline (May) rows don't contain it
  (May value was 0 — check the snapshot actually has the row; the lampiran does, row 61).
* **Fixed-asset lines incomplete.** Only `12102.1` (Bangunan) and `12300` (ADP) are mapped.
  June also moves `12203.1` Instalasi Listrik (+35,162,830), `12204.1` Peralatan
  (+3,850,000) and credits all five akumulasi accounts (`12102.2/12201.2/12202.2/12203.2/
  12204.2`, total −314,632,492.10) → all pile into "Aset Tidak Lancar Lainnya (Belum
  Terpetakan)" instead of their lampiran lines.

### D3. Equity roll-forward not implemented

`buildNeracaRows` adds the whole P/L delta to the "(Laba) Rugi Periode Berjalan" row
(`reportDelta.js:382`) on top of the May baseline. June result (app):

* Saldo Laba Periode Lalu = −3,237,908,077.13 (May's value, unchanged)
* Periode Berjalan = −384,295,699.79 + (−390,185,301.06) = **−774,481,000.85**

Lampiran (`NERACA` I72/I73): Saldo Lalu **−3,622,203,776.92** (= May lalu + May berjalan),
Berjalan **−390,185,301.06** (June only). Total ekuitas identical — the two lines are wrong.

### D4. Arus Kas: wrong activity split and wrong report shape for journal-mode months

* `arusKasActivity` (`reportDelta.js:117`) sends **all** `1[23]` counter-accounts to
  *investasi*. The lampiran puts **Aset Dalam Penyelesaian (12300)** in the *operasi*
  section (spec §7 row 15) and defines *investasi* as only the gross Bangunan + Instalasi +
  Peralatan additions. June effect if classified the app's way: operasi ≈ 2,636,537,869
  (lampiran: **1,935,003,869.04**), investasi ≈ −1,163,641,830 (lampiran: **−462,107,830**).
  Net change matches; both sections are off by 701,534,000.
* For a month with no snapshot, the AK view falls back to a dynamic direct-style
  presentation — the division compares against their **indirect-method** layout (laba
  sebelum pajak + penyusutan + working-capital changes). Line-by-line comparison fails even
  when totals agree.

### D5. LRA cash-basis specials missing

* **Penerimaan 1.6 "Pendapatan Pengelolaan Lain-lain"** = June **credits to Piutang Usaha
  11201** (collections) = 58,351,411 in the lampiran. The app has no rule that turns a
  piutang credit into an LRA receipt → line shows 0 and TOTAL PENDAPATAN is short by the
  same amount (lampiran total bulan-ini: 1,367,143,785.05).
* **Beban Pokok section (Beban Operasional LRA)** = **inventory purchases** (debits to
  11401/11402) = 194,798,200 in the lampiran — not the accrual COGS 51000/51001
  (189,138,200). If the app maps 51xxx there, it's Rp 5,660,000 short.
* Depreciation (61130) must stay **out** of LRA Beban Umum (lampiran total 428,698,498 =
  accrual 743,330,990.10 − 314,632,492.10). Verify it isn't swept into an unmapped bucket.

### D6. Leaf-label gaps in `lrAlias.json`

No entries for `51000/51001` (BPP leaf rows), `70001`/Pendapatan Bunga Bank, `80001–80004`
(Beban Pajak Bank / Administrasi Bank / Lain-lain / Kerugian Persediaan) or a "Beban PPN dan
PPH" line — so even after reclassification those leaves won't move in overlay views; amounts
appear only in subtotals or "(Belum Terpetakan)" rows.

---

## 1. Work plan

Order matters: tests first, then the resolver everything else depends on, then per-report fixes.

### Phase 0 — Pin the acceptance numbers (red tests first)

*Files:* `tests/reports/june-lampiran-acceptance.test.mjs` (new), fixture = the real upload
file (add `tests/fixtures/JURNAL JUNI 2026 (426-lines).xlsx` from `JURNAL JUNI(1).xlsx` if the
existing 115-journal fixture differs in shape).

Assert, for period 2026-06 in journal mode (May snapshot as baseline):

* L/R: all §12 figures **including subtotals** (Beban Ops 762,289,002; Laba Usaha
  −404,468,727.1005; Beban Non-Ops 4,219,483.01; EBITDA 333,012,664).
* Neraca: the 4 kewajiban lines, the 5 bank lines, Instalasi/Peralatan/akumulasi lines,
  Saldo Lalu −3,622,203,776.92 / Berjalan −390,185,301.0605, totals, balance diff 0.
* AK: operasi 1,935,003,869.04 / investasi −462,107,830 / kas akhir 16,026,796,099.87 and
  the tie `kasAkhir == Σ` of the 8 Neraca cash lines.
* LRA: penerimaan 1,367,143,785.05 (with 1.6 = 58,351,411), beban umum 428,698,498, beban
  ops 533,719,403, investasi 462,107,830.

These fail today (except L/R bottom line) — that's the point. Everything below turns them green.

### Phase 1 — One shared "effective account" resolver (kills D1, feeds D4–D6)

*Files:* `src/utils/lraOutline.js` (export), used by `reportDelta.js` `codeOf()` and
`Laporan.jsx` `sumJByPrefix`/`getJLineItems`.

`codeOf()` already re-routes when the Sub Akun after `" > "` starts with a digit. Extend with
a **name→code table for the header-coded accounts** (trimmed, case-insensitive match on the
text after `" > "`):

| Parent code | Sub Akun contains | Effective code |
|---|---|---|
| 80000 | `pajak penghasilan` | **99999** |
| 80000 | `pajak bank` | 80001 |
| 80000 | `administrasi bank` | 80002 |
| 80000 | `kerugian persediaan` | 80004 |
| 80000 | anything else | 80003 |
| 70000 | `bunga` / `jasa giro` | 70001 |
| 70000 | `penjualan aset` | 70002 |

Then delete the two ad-hoc regex blocks in `Laporan.jsx:370-387` and read
`dynPendapatanBungaBank` / `dynBebanPajakBank` / `dynPajakPenghasilan` from the same buckets
as `attributeDelta` (effective-code prefixes `70001`, `80001`, `99`). After this phase the
overlay and dynamic paths agree, `lrSec.pajak` carries 423,367,799, and `bebanNonOps` drops
to 4,219,483.01.

**Guardrail test:** a journal explicitly coded `99999` and one coded `80000 > Pajak
Penghasilan` must produce identical reports.

### Phase 2 — Repair the alias maps (kills D2, D6)

*Files:* `src/utils/reconcileAlias.json`, `src/utils/lrAlias.json`.

`reconcileAlias.json` — replace wholesale with the 2026 COA → lampiran-label map:

```json
{
  "11101": "Kas Kecil  - Kantor",
  "11102": "Kas Pendapatan Belum Setor",
  "11103": "Kas Bank Kalsel",
  "11104": "Bank BNI",
  "11105": "Investasi Jangka Pendek",
  "11106": "Bank BNI Bisnis",
  "11107": "Bank BNI Tapcash",
  "11108": "Bank BSI",
  "11201": "Piutang Usaha",
  "11301": "Perlengkapan",
  "11401": "Persediaan Barang Dagang (Bapok dan Gerai Inflasi)",
  "11402": "Persediaan Barang Dagang (Gas LPG)",
  "11501": "BBM Dibayar di Muka",
  "12101": "Tanah ",
  "12102.1": "Bangunan",
  "12102.2": "Akumulasi Penyusutan Bangunan",
  "12201.1": "Kendaraan",
  "12201.2": "Akumulasi Penyusutan Kendaraan",
  "12202.1": "Mesin",
  "12202.2": "Akumulasi Penyusutan Mesin",
  "12203.1": "Instalasi Listrik",
  "12203.2": "Akumulasi Penyusutan Instalasi Listrik",
  "12204.1": "Peralatan",
  "12204.2": "Akumulasi Penyusutan Peralatan",
  "12300": "Aset Dalam Penyelesaian",
  "13101.1": "Aset Tidak Berwujud",
  "21100": "Dana Talangan",
  "21200": "Utang Usaha",
  "21400": "Utang Pajak",
  "21500": "Biaya yang Masih Harus Dibayar",
  "21600": "Pendapatan Diterima Dimuka",
  "22100": "Utang Bank",
  "22300": "Utang Daerah",
  "31000": "Modal Perumda Pasar Banjarmasin",
  "32000": "Modal Disetor",
  "33000": "Saldo Laba (Rugi) Periode Lalu",
  "35000": "Koreksi Ekuitas"
}
```

Notes: label strings must equal the lampiran row labels **exactly** (`"Kas Kecil  - Kantor"`
has two spaces; `"Tanah "` has a trailing space in the lampiran — prefer normalizing the
matcher to `trim().replace(/\s+/g,' ')` on both sides instead of encoding whitespace here).
Keep the legacy `21001/21002/21003/22001` keys **in addition** if older imported data still
uses them. If the May baseline lacks a "Biaya yang Masih Harus Dibayar" row, `buildNeracaRows`
must be able to append an unmapped-style leaf **with the proper label** rather than the generic
"(Belum Terpetakan)".

`lrAlias.json` — add:

```json
{
  "51000": "Beban Pokok Penjualan (Bapok & Gerai Inflasi)",
  "51001": "Beban Pokok Penjualan (Gas LPG)",
  "70001": "Pendapatan Bunga Bank",
  "80001": "Beban Pajak Bank",
  "80002": "Beban Administrasi Bank",
  "80003": "Beban Lain-lain",
  "80004": "Beban Kerugian Persediaan",
  "99999": "Beban PPN dan PPH"
}
```

(Keep `"99"`/`"99999"` consistent with whatever label Phase 3 decides to render.)

### Phase 3 — L/R presentation of PPh (kills the D1 subtotal diffs)

*Files:* `src/pages/Laporan.jsx` (dynamic L/R render + `dyn*` math),
`src/utils/reportDelta.js` (`buildLabaRugiRows` totals).

The lampiran's June layout puts PPh **inside** "JUMAH BEBAN OPERASIONAL DAN BISNIS" as the
row `Beban PPN dan PPH` and zeroes the `Beban Pajak Penghasilan` row below laba-sebelum-pajak
(May did the opposite). Decision: **follow the division's June layout for journal-mode
months** — it is their official format for months computed from a journal upload, and it is
what acceptance will be judged against:

* `jumlahBebanOps = ops + pajak` (render a `Beban PPN dan PPH` leaf inside the ops section);
* `labaSebelumPajak` therefore already includes PPh; tax row renders 0;
* `setelahPajak = sebelumPajak`;
* `EBITDA = setelahPajak − bunga + pajakBank + penyusutan + pajak` (equals lampiran J81).

Implement once, in a small pure helper (e.g. `composeLabaRugi(lrSec)` in `reportDelta.js`)
consumed by both the dyn path and `buildLabaRugiRows`, so the two views can never diverge
again. If the division later reverts to the May-style layout, the helper takes a
`taxPlacement: 'ops' | 'taxRow'` flag — default `'ops'`; both placements keep
`setelahPajak` and EBITDA identical, so the flag is presentation-only.

### Phase 4 — Equity roll-forward (kills D3)

*Files:* `src/utils/reportDelta.js` (`buildNeracaRows`), `src/pages/Laporan.jsx`
(pass month-split info).

Rule (spec §5): when overlaying journal months onto a baseline snapshot of month *B*:

```
saldoLalu(view)   = saldoLalu(B) + berjalan(B) + Σ P/L of journal months < lastMonth
berjalan(view)    = P/L of lastMonth only (after tax)
```

Concretely: `attributeDelta` gains a per-month P/L split (it already has `nSec.pl`; group by
`ymOfJournal`). `buildNeracaRows` then: add `plOlderMonths` to the "Saldo Laba (Rugi) Periode
Lalu" row **plus** the baseline's own "berjalan" value (move it), and set the "berjalan" row
to `berjalan(baseline-month) is folded away; current month P/L only`. For the standard case
(baseline = May, view = June) this yields exactly I72/I73. Ekuitas total is unchanged by
construction — assert that in the test.

### Phase 5 — Arus Kas: indirect-method builder for journal-mode months (kills D4)

*Files:* `src/utils/reportDelta.js` (new `buildArusKasIndirect(baselineNeracaRows,
journalsByMonth, lrSec)`), `src/pages/Laporan.jsx` (use it when the period's months are in
journal mode).

Build the report exactly per spec §7 (all inputs already exist in the app):

1. `labaSebelumPajak` from the Phase-3 composition (June: −390,185,301.0605 — note it
   already contains PPh in the June layout, mirroring the lampiran).
2. `+ penyusutan` (61130 bucket).
3. Working-capital deltas from account movements (journal deltas by effective code):
   assets `−Δ` (11201, 11301, **12300 ADP**, 11401, 11402, 11501), liabilities `+Δ`
   (21200, 22300, 21500, 21600), `− tax row` (0 in June layout).
4. Investasi = −Σ debits to gross fixed-asset lines `12102.1, 1220x.1, 12203.1, 12204.1`
   (12300 excluded — it lives in operasi). Pendanaan = movements on 22100/3xxxx.
5. Kas awal = Σ of the 8 cash lines from the baseline Neraca; kas akhir = awal + kenaikan.
6. **Assert the tie** kasAkhir == Σ cash lines of the computed Neraca (the lampiran's own
   D44 = 0 check); render a warning banner if it ever breaks instead of publishing silently.

Update `arusKasActivity` so `12300 → 'operasi'` (division convention) for the overlay path
too, keeping both AK paths consistent.

### Phase 6 — LRA cash-basis specials (kills D5)

*Files:* `src/utils/lraOutline.js`, `src/pages/LRA.jsx`.

* Add a rule: **credits to 11201** (effective code) → penerimaan outline `1.6`
  ("Pendapatan Pengelolaan Lain-lain"). June: 58,351,411.
* Beban Pokok rows of the Beban Operasional LRA (`4.1`/`4.2`): source from **debits to
  11401 / 11402** (purchases; June: 189,918,200 + 4,880,000), not 51xxx. Keep 51xxx feeding
  the accrual L/R only.
* Exclude 61130 (and 8xxxx/99999) from every LRA beban bucket; assert Beban Umum bulan-ini
  = 428,698,498 for June.
* Cumulative rule stays: kumulatif = stored prior-month kumulatif + bulan-ini (already the
  app's baseline+delta model) — never re-derive from the accrual P/L.

### Phase 7 — Flow hardening + Konsistensi

*Files:* `server/routes/api.cjs`, `src/pages/Konsistensi.jsx`.

* Verify (test, not assumption) that "Hapus Semua" for June + re-upload: deletes only June
  journals + June report rows + June `ANG-` rows; leaves May snapshot, May `period_status`
  and May anggaran untouched; sets June `period_status = 'jurnal'`.
* Add the §12 checksums for 2026-06 to `/reports/consistency` as a named check-set ("Juni
  2026 vs lampiran resmi") so the finance division can self-verify after every re-upload,
  including the two structural ties: Neraca balance diff = 0 and kasAkhir = Σ kas Neraca.
* Import banner: surface counts (426 rows, 18 zero-amount rows kept, D=K total) so the user
  can compare against the division's file immediately at upload time.

### Phase 8 — Rollout

1. `npm run test:reports` green (old 19 + new acceptance suite).
2. Local E2E with the real file: delete June → upload → screenshot-compare the four reports
   against the lampiran (line-by-line, not totals).
3. Deploy to Fly; run prod remediation: backup (`POST /api/system/backup`), delete/re-upload
   June per the division's normal flow, then `GET /api/reports/consistency?period=2026-06`.
4. Hand the division `docs/EXCEL_FLAWS_JUNI_2026.md` (their workbook has real defects the
   app deliberately does **not** replicate — H51 sign bug, broken external links; see that doc).

---

## 2. Priority / effort

| Phase | Fixes | Effort | Risk if skipped |
|---|---|---|---|
| 1 (resolver) | D1 root cause | S | L/R subtotals wrong by 423jt; EBITDA wrong in overlay views |
| 2 (aliases) | D2, D6 | S | Neraca lines show wrong banks; kewajiban lines frozen at May values |
| 4 (equity) | D3 | M | Saldo lalu / berjalan wrong on every journal-mode Neraca |
| 5 (arus kas) | D4 | M–L | AK sections off by 701jt; shape not comparable to lampiran |
| 6 (LRA) | D5 | M | Penerimaan short 58.3jt; beban pokok short 5.66jt |
| 3 (presentation) | D1 layout | S | Bottom line right, subtotal layout differs |
| 0/7/8 | regression safety | M | The "often happened" recurrence risk |

S ≈ ≤half day, M ≈ 1 day, L ≈ 2+ days.

**Do not** "fix" the app toward the Excel's own defects: the H51 sign bug, the `=G51`
workaround, the hardcoded LRA cells and the broken `[84]/[222]` links are Excel flaws
(see the flaws doc) — the app must compute the *correct* value that those cells merely
happen to display for June.
