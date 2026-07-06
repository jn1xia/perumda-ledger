# CLAUDE.md — Perumda Ledger

Accounting web app for **Perumda Pasar Banjarmasin** (municipal market company, South Kalimantan).
36 modules covering the full accounting cycle: COA → Journals → Reports → NPD.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 (SPA) |
| Backend | Express 5 (CJS), Node 20 |
| Database | SQLite 3 via `sqlite3` npm package |
| Runtime | Single process — server serves both API (`/api`) and static dist |
| Deploy | Fly.io — app `perumda-ledger-scs9va`, region `sin` (Singapore) |
| Auth | Role-based via `X-User-Role` header; default role `admin` |

---

## Project Layout

```
src/
  pages/          — one file per module (COA.jsx, Jurnal.jsx, LRA.jsx, NPDReport.jsx …)
  components/
    ExcelImport/  — ExcelImportModal.jsx + ImportExcelButton.jsx
    UI/           — Modal, SearchableSelect
    Layout/       — Sidebar, AppLayout
  context/
    AppContext.jsx — global useReducer store (all state lives here)
  data/
    sampleData.js — formatRupiah, PERIOD_OPTIONS, COA fallback tree, sample journals
    sampleData.json, npdAnggaran.json, npdData.json, extractedData*.json
  utils/
    excelParsers.js   — parseJurnal, parseSaldoAwal, autoParse
    journalExpand.js  — expandJournals (multi-line → half-records for reports)
    journalFilters.js — MONTHS, PERIOD_PRESETS, periodValueToMonths
    lraOutline.js     — ACCOUNT_TO_OUTLINE, resolveOutline, categoryKeyForCode (shared)
    reportDelta.js    — deltaJournals (overlay user journals onto audited months)
    treeUtils.js      — COA tree helpers
  services/
    api.js            — all fetchAPI wrappers (apiGetJournals, apiCreateCOA …)

server/
  index.cjs         — Express entry point, mounts /api router + serves dist/
  routes/api.cjs    — ALL REST endpoints (journals, coa, anggaran, reports …)
  middleware/
    auth.cjs        — requireRole, getRole
    validators.cjs  — validateCoaPayload, validateCodeFormat, ALLOWED_COA_TYPES
  db/
    database.cjs    — singleton SQLite connection (DB_PATH env var)
    schema.cjs      — CREATE TABLE statements + migrations
    seed.cjs        — seeds COA + anggaran from sampleData.js on first boot
```

---

## Key Conventions

### State
- **Single global store** in `AppContext.jsx` via `useReducer`. No Redux.
- State loaded from API on mount via `loadStateFromAPI()`.
- Mutations: dispatch action → reducer updates state → fire-and-forget `api.apiXxx()` call.
- `refreshData('journals')` / `refreshData('all')` re-syncs from DB after bulk operations.

### Journals
- Shape: `{ id, tanggal:"YYYY-MM-DD", keterangan, debit, kredit, status:"posted"|"pending", akun_debit:"code - name", akun_kredit, tipe_transaksi, lines?:JSON }`
- Multi-line journals (from form) store detail in `lines` JSON array.
- **Always call `expandJournals(journals)`** before per-account aggregation — this explodes multi-line entries into half-records so legacy 2-account reports work correctly.
- Only `status === 'posted'` journals appear in LRA / NPD / Buku Besar.

### COA
- Tree in `state.coaTree`, flat array in `state.coaFlat`.
- `flattenCOA` emits both snake_case (`saldo_awal`, `kode_sortir`) and camelCase (`saldoAwal`, `kodeSortir`) — use either.
- `buildCOATree` never drops accounts: orphans (missing parent) become top-level roots.
- `ADD_ACCOUNT` reducer auto-derives `parentCode` from code prefix if none selected (e.g. `41009` → parent `41`).
- API `POST /coa` requires `code`, `name`; `type` must be in `ALLOWED_COA_TYPES` = `posting|parent|asset|liability|equity|revenue|expense`.

### Currency
- Always use `formatRupiah(num)` from `src/data/sampleData.js`.
- Format: `Rp 4.890.435,23` — exactly **2 decimal places**, id-ID locale (`.` thousands, `,` decimal).

### Reports — outline mapping (LRA / NPD)
- `src/utils/lraOutline.js` is the **single source of truth** for account → outline mapping.
- Both `LRA.jsx` and `NPDReport.jsx` import from it — do not duplicate the maps.
- Key function: `resolveOutline(accountCode, keterangan)` → outline string like `"11.1"`.
- `categoryKeyForCode(code)` → `"bebanUmum"` | `"bebanOperasional"` | `"bebanInvestasi"` | null.
- Adding a new account to reports = add it to `ACCOUNT_TO_OUTLINE` in `lraOutline.js` **and** in `LRA.jsx`'s local copy (LRA keeps its own copy for the `penerimaan` section).

### LRA computation
- **Audited months (Jan–Apr)**: reads from `state.anggaran` table + `deltaJournals` overlay.
- **Dynamic months (May+)**: seeds cumulative from audited April (`anggaran.realisasi @ bulan=4`), then adds posted journal amounts for months ≥ 5 via `expandJournals` + `resolveOutline`.
- `masterBudgetItems` = April anggaran rows (non-`ANG-` prefixed) = the row template. If a line has no April budget row it won't render even if journals exist.
- Multi-month presets (`tw3` = [7,8,9]) via `periodValueToMonths(value)` from `journalFilters.js`.

### NPD
- Built from `state.anggaran` (pagu/budget) + `state.journals` (actuals via journal bridge).
- Months **with** journal activity: actuals computed from journals via `expandJournals` + `resolveOutline`.
- Months **without** journal activity: falls back to precomputed `anggaran` figures (no regression).
- `getUraian` / `getGroup` map outline codes to display labels inside `NPDReport.jsx`.

### Excel Import
- `parseJurnal(ws)` returns an array with two non-enumerable diagnostic properties:
  - `.skipped` — rows dropped (no readable D/K); shown as yellow "baris dilewati" banner.
  - `.incomplete` — rows imported but with empty expected cells (Tanggal/No. Akun/Nama Akun/Keterangan); shown as separate yellow "ada kolom kosong" banner.
- `autoParse(ws, hint)` wraps all parsers and returns `{ type, data, skipped, incomplete }`.

---

## Account Code Ranges

| Prefix | Category | Example |
|---|---|---|
| `1xxxx` | Aset | `11101` Kas Kecil |
| `2xxxx` | Kewajiban | `21101` Hutang Usaha |
| `3xxxx` | Ekuitas | `31001` Modal |
| `41xxx` | Pendapatan Bisnis Utama | `41001` Pendapatan Sewa Kios |
| `42xxx` | Pendapatan Bisnis Lainnya | `42001` Pendapatan Parkir |
| `61xxx` | Beban Umum | `61111` Beban Sewa Mobil Operasional |
| `62xxx` | Beban Operasional | `62011` Beban Pajak Mobil |
| `12xxx` | Aset Tetap / Investasi | `12204` Peralatan Kantor |
| `70001` | Pendapatan Bunga | — |

**Important mappings:**
- `41009` → outline `1.5` (Pendapatan Perizinan, parent: `41`)
- `61110`/`61111` → outline `11.1` (Beban Sewa Kendaraan/Mobil Operasional)
- `41006` → outline `1.5` (legacy Pendapatan Perizinan)

---

## Roles & Permissions

```
kasir            → voucher input/print, view reports
akuntan          → all transactions, approve, reports
spv_akuntansi    → approve, COA write
manajer_keuangan → approve, lock periods, reports  (also: manager_keuangan)
direktur         → approve, reports
auditor          → read-only all
staff_gudang     → inventory
staff_pajak      → e-faktur
admin            → full access incl. COA write, backup
super_admin      → full access + unlock periods
```

Default role when no session: `admin` (sent as `X-User-Role: admin` header).

---

## API Base Routes

All under `/api` — served by `server/routes/api.cjs`.

```
GET/POST        /journals          list / create
PUT/DELETE      /journals/:id
POST            /journals/bulk
POST            /journals/approve/:id
POST            /journals/unapprove/:id

GET/POST        /coa               list / create
PUT/DELETE      /coa/:code

GET             /anggaran          budget rows (shape: {kode,nama,kategori,bulan,anggaran_awal,sd_bln_lalu,bulan_ini,realisasi})

GET/POST        /piutang
GET/POST        /hutang
GET/POST        /assets
GET/POST        /inventory
GET/POST        /bbm
GET/POST        /giro
GET/POST        /vouchers
POST            /vouchers/:id/approve

GET             /reports/buku-besar
GET             /reports/neraca
GET             /reports/neraca-saldo
GET             /reports/rugi-laba
GET             /reports/anggaran-realisasi

POST            /periods/locks     lock a period
POST            /periods/unlock    unlock (admin only)
POST            /system/backup
```

---

## Database

- **Production** (Fly.io): mounted volume `/app/data/perumda_ledger.db`
- **Local dev**: `server/perumda_ledger.db` (or `DB_PATH` env var)
- Schema: `server/db/schema.cjs`
- Seed: `server/db/seed.cjs` — runs on first boot if DB is empty

Key tables: `journals`, `coa`, `anggaran`, `assets`, `inventory`, `piutang`, `hutang`, `bbm`, `giro`, `vouchers` (view over journals with `bukti LIKE 'VC-%'`), `locked_periods`, `audit_log`, `departemen`, `pelanggan`, `supplier`, `purchase_orders`, `sales_orders`, `efaktur`.

---

## Dev & Build Commands

```bash
# needs nvm — activate first:
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"

npm run dev        # Vite dev server (frontend only, port 5173)
npm run server     # Express API server (port 3001)
npm run build      # Production build → dist/
npm run db:init    # Re-seed the database

# Deploy to Fly (remote build):
~/.fly/bin/flyctl deploy --remote-only
~/.fly/bin/flyctl releases --app perumda-ledger-scs9va   # check latest version
~/.fly/bin/flyctl status  --app perumda-ledger-scs9va    # check machine health
```

Production URL: **https://perumda-ledger-scs9va.fly.dev**

---

## Anggaran (Budget) Row Shape

```js
{
  kode:        "11.1" | "ANG-bebanUmum-84",   // "ANG-" prefix = legacy Excel import
  nama:        "11.1" | "Sewa Mobil Operasional",
  kategori:    "penerimaan" | "bebanUmum" | "bebanOperasional" | "bebanInvestasi",
  bulan:       1–12,
  anggaran_awal: 370000000,
  sd_bln_lalu:   95399997,   // cumulative through prior month (audited)
  bulan_ini:     31799999,   // this month actual (audited)
  realisasi:     127199996,  // sd_bln_lalu + bulan_ini
  is_total:      0 | 1,
}
```

`masterBudgetItems` in LRA filters to **non-`ANG-`** rows from April (bulan=4) as the canonical template. If a budget row only exists as `ANG-` prefixed it will still be found via `outlineOf(r) = r.kode.startsWith('ANG-') ? r.nama : r.kode`.

---

## Common Gotchas

1. **Journal not in LRA/NPD** — check: (a) status is `posted`, (b) `resolveOutline(accountCode)` returns a valid outline, (c) a template row for that outline exists in the April `anggaran` table for that `kategori`.
2. **New account vanishes on reload** — `buildCOATree` is fine; check the API call didn't 403/409. Use `curl -H "X-User-Role: admin" /api/coa` to verify persistence.
3. **COA add with no parent selected** — reducer now auto-derives parent from code prefix. If the prefix group doesn't exist in the tree, account becomes a root node (visible but not nested).
4. **Deploy appears to hang** — normal. The terminal is held by the remote build. Check `flyctl releases` after ~3 minutes to confirm the new version number.
5. **formatRupiah returns unexpected decimals** — function always returns exactly 2 decimal places. If you see 0 or 3 decimals, the caller is not using `formatRupiah`.
6. **`!` in shell node -e scripts** — zsh history expansion fires. Write to a `.mjs` / `.cjs` file and run it instead.
