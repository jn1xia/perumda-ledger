# Auth, Hierarchy & Authorization — Review and Improvement Plan

**Project:** Perumda Ledger (Perumda Pasar Banjarmasin)
**Scope:** User login, role hierarchy, and API authorization
**Status:** Proposed — not yet implemented
**Last updated:** 2026-07-17

---

## TL;DR

The app has a well-designed **role model on paper** (30+ roles matching the real
org structure, SOP-based approval thresholds) but **no real authentication
behind it**. Login is entirely client-side with one shared hardcoded password,
users pick their own role from a dropdown, and the server trusts whatever role
the browser claims in an `X-User-Role` header. Several destructive endpoints
(`/api/reset`, `/api/journals/bulk`, period locks, full data export) have **no
guard at all**, and a role-name drift means most of the newer roles get `403` on
every report. Anyone who can reach the URL can wipe or export the whole ledger
with one `curl` command.

The design is good. The enforcement is not. This document records what exists
today and a phased plan to close the gaps.

---

## How login & authorization work today

### Login — `src/pages/Login.jsx`
- Password is checked against a hardcoded constant `DEMO_PASSWORD = 'perumda2026'`
  (line 7) — the same for every account, and **displayed as a hint on the login
  screen itself**.
- Username is free text, never validated against anything.
- The user **selects their own role** from a dropdown — anyone can pick
  `super_admin`.
- No API call is made. There is **no `/api/auth/login` endpoint** on the server.
- The resulting session `{username, role, roleLabel, loginAt}` is stored in
  `localStorage` with no expiry and restored on reload
  (`src/context/AppContext.jsx:25`).

### Authorization — `server/middleware/auth.cjs`
- Every API call sends an `X-User-Role` header (`src/services/api.js:40`).
- `requireRole()` checks that header string against an allow-list. The entire
  RBAC layer is bypassable by typing a header:
  `curl -H "X-User-Role: super_admin" …`.
- `admin` / `super_admin` bypass **every** check unconditionally (line 39).
- `DISABLE_RBAC=1` turns all checks off.
- If `localStorage` is empty, the client silently defaults to **`admin`**
  (`src/services/api.js:17`).

### The `users` table is decorative
- `server/db/schema.cjs:359` defines
  `users (username, nama, role, aktif, last_login, created_at)` — **no password
  column** — and nothing in the login flow ever reads it.
- `aktif = 0` does not block anyone; `last_login` is never updated.

### The hierarchy itself is well modeled — `src/data/roles.js`
- Encodes the full org chart (Dewan Pengawas → Direktur Utama → two direktorats
  → divisions → SPI).
- SOP approval thresholds: `< Rp 1 jt` manager, `> Rp 1 jt` Direktur Umum &
  Keuangan, `> Rp 50 jt` Direktur Utama.
- Per-capability role groups (`JOURNAL_WRITE`, `COA_WRITE`, `LOCK_ROLES`,
  `AUDIT_READ`, …) and helpers (`canApproveAmount`, `requiredApproverLabel`).
- The server has route guards for journals / COA / vouchers / locks and a
  resource-level RBAC wrapper for legacy paths (`server/routes/api.cjs:129`).

---

## Specific holes found

Ranked by severity, with source locations.

### 1. Completely unauthenticated destructive endpoints
No `requireRole`, and not covered by the legacy-path middleware:
- `POST /api/reset` (`server/routes/api.cjs:1196`) — **wipes the entire
  database**, callable by anyone with no headers.
- `POST /api/journals/bulk` (`api.cjs:435`) — bulk-insert journals, no auth.
- `GET /api/export` (`api.cjs:2657`) — full data dump of every table.
- `GET/PUT /api/pengaturan` (`api.cjs:1134,1145`), `POST /api/fix-anggaran`
  (`api.cjs:1068`).
- `GET /api/ai-context` (`server/routes/aiContext.cjs`) — dumps all tables +
  Excel summaries, no auth.
- Report reads: `/reports/audited-periods`, `/reports/period-status`,
  `/reports/consistency`, `/reports/ref-*`.

### 2. Period locking is effectively unprotected
Two generations of lock endpoints coexist:
- **New, guarded**: `/periods/locks`, `/periods/unlock` — unlock restricted to
  `admin` / `super_admin` / `direktur_utama` (`api.cjs:2554`).
- **Old, bare**: `/locked-periods` GET/POST/DELETE (`api.cjs:1173–1191`) with
  **no guard whatsoever**.

The frontend calls the **old** ones (`src/services/api.js:130-131`), so in
practice any role — or nobody — can lock and unlock accounting periods,
defeating the closing control entirely.

### 3. Role-name drift breaks the new hierarchy
- Report endpoints (`/reports/buku-besar`, `/neraca`, `/rugi-laba`, …) are
  guarded by `ALL_READ` (`api.cjs:2674`), which contains **only legacy role
  names** (`akuntan`, `manajer_keuangan`, `direktur`…). Every new canonical role
  — `staff_keuangan`, `manager_keuangan`, `direktur_utama`, `dewan_pengawas`,
  `spi` — gets `403` on all reports. Masked today only because everyone
  effectively runs as `admin`.
- `ADMIN_ONLY_WRITE` (`api.cjs:2681`) guards `/users` CRUD but excludes
  `manager_it`, even though `roles.js` says Manager IT does user management
  (`SYSTEM_ADMIN` group).
- There are **three divergent copies** of role groups on the server
  (`ALL_ROLES`/`_FIN`/`_SG`… at line 37+, per-module lists like
  `JOURNAL_WRITE_ROLES`, and the legacy `ALL_READ`/`FIN_WRITE` set) plus a
  **fourth** in the frontend `roles.js`.

### 4. Approval thresholds are client-side only
- `canApproveAmount()` (the `< 1 jt` / `50 jt` SOP hierarchy) is enforced in
  `Jurnal.jsx:560` — the browser. The server's `/journals/approve/:id`
  (`api.cjs:668`) only checks role membership: a `manager_bisnis` can approve a
  Rp 100 jt journal via `curl`.
- Journal approve/unapprove **don't check period locks** (voucher approve does,
  `api.cjs:2480`).
- Nothing prevents someone approving a journal **they created themselves** (no
  separation of duties — the creator isn't even recorded).

### 5. No per-person accountability
`audit_log` records only `actor_role` (`server/db/auditLog.cjs:19`) — never the
username — so you can't tell *who* did anything. Logins / failed logins aren't
audited (there is no server login to audit).

### 6. No frontend gating
`Sidebar.jsx` has zero role checks and `App.jsx` mounts every route for any
logged-in user — an SPI auditor sees every input screen. UX relies on server
`403`s, which are themselves broken/bypassable.

### 7. Misc hardening gaps
Wide-open `cors()` (`server/index.cjs:12`), no helmet, no login rate-limiting,
stale role list in the `auth.cjs` doc comment.

---

## Improvement plan

Phased so each stage is deployable on its own. Stack-fitting choices —
`bcryptjs` + `jsonwebtoken` + `cookie-parser` + `express-rate-limit`, all
pure-JS, no native builds, safe on the Fly remote builder.

### Phase 0 — Stop the bleeding (a few hours, no schema change)
1. Add `requireRole` to every unguarded route:
   - `/reset` → `super_admin` only
   - `/journals/bulk` → `JOURNAL_WRITE_ROLES`
   - `/export`, `/pengaturan` GET, `/ai-context`, `/reports/ref-*`,
     `/reports/period-status`, `/reports/audited-periods`,
     `/reports/consistency` → all roles
   - `/pengaturan` PUT and `/fix-anggaran` → finance write
2. Delete the legacy `/locked-periods` routes and point `src/services/api.js` at
   `/periods/locks` + `/periods/unlock`. (Lower-risk alternative: keep the old
   paths but guard them with `LOCK_LOCK_ROLES` / `LOCK_UNLOCK_ROLES`.)
3. Fix role drift: replace `ALL_READ` with `ALL_ROLES`, add canonical names to
   `FIN_WRITE`, add `manager_it` to the system-admin list. Best done by
   extracting **one** `server/config/rbac.cjs` that mirrors the groups in
   `src/data/roles.js` and deleting the three server-side copies.
4. Remove the `'admin'` default fallback in `getCurrentUserRole()`
   (`src/services/api.js:17`) — no session should mean `401`, not silent admin.

### Phase 1 — Real authentication (1–2 days)
1. **Schema**: `ALTER TABLE users ADD COLUMN password_hash TEXT`, plus
   `must_change_password INTEGER DEFAULT 1`. Seed one real admin; migrate
   existing rows with temp passwords.
2. **Endpoints** in a new `server/routes/auth.cjs`:
   - `POST /api/auth/login` — verify bcrypt hash, check `aktif = 1`, update
     `last_login`, audit the event.
   - `POST /api/auth/logout`
   - `GET /api/auth/me`
   - `POST /api/auth/change-password`
   - Rate-limit login.
3. **Session**: signed JWT `{username, role}` with an 8–12h expiry, delivered as
   an `httpOnly` `SameSite=Lax` cookie (the SPA is same-origin in production, so
   no CORS complexity; in dev, proxy `/api` through Vite).
4. **Middleware**: rewrite `getRole(req)` to read the verified token and set
   `req.user = {username, role}`. The `requireRole` contract stays identical, so
   **no route handler changes** — exactly the migration path the `auth.cjs`
   header comment promised. Keep `X-User-Role` honored only behind an env flag
   (`ALLOW_HEADER_ROLE=1`) for one transition release, then remove it.
5. **Frontend**: `Login.jsx` calls the real endpoint; **delete the role
   dropdown** — role comes from the server's user record, users don't choose it.
   Remove the demo-password hint. `AppContext` stores the server-returned
   session; a `401` anywhere redirects to login.

### Phase 2 — Enforce the hierarchy server-side (2–3 days)
1. Port `canApproveAmount()` to the server and enforce it inside
   `/journals/approve/:id` and `/vouchers/:id/approve` — reject with the required
   approver level (e.g. *"butuh persetujuan Direktur Utama untuk > Rp 50 jt"*).
   Add the missing period-lock check to journal approve/unapprove.
2. **Separation of duties**: record `created_by` (username, now available from
   the token) on journals/vouchers; forbid approving your own entry; restrict
   `unapprove` to `spv_akuntansi`+ per the closing SOP.
3. **Audit**: add `actor_user` to `audit_log`, log logins / failed logins, and
   log when the `admin` bypass fires.
4. **Frontend gating**: one module→roles map (derived from the shared RBAC
   config) driving Sidebar visibility, route guards, and a
   `hasPermission(role, 'journal:write')` helper for buttons — SPI / Dewan
   Pengawas become genuinely read-only in the UI.
5. **User management page** (Pengaturan): `admin` / `manager_it` can create users
   with an initial password, reset passwords, deactivate accounts; guard against
   deactivating/demoting the last active admin.

### Phase 3 — Hardening (nice-to-have, ~1 day)
- Helmet + same-origin CORS in production.
- `Secure` cookie flag on Fly.
- Failed-login lockout / backoff.
- Forced password change on first login.
- An audit-log viewer page for SPI.
- `DISABLE_RBAC` refused when `NODE_ENV=production`.
- A supertest matrix (role × endpoint → expected status) so the RBAC table can
  never silently regress again.
- Optional per-zone data scoping for `kepala_pasar` / `kasir_pasar` (the
  `divisi` field is already contemplated in `roles.js`).

---

## Recommended sequencing

The single highest-leverage first step is **Phase 0** — it's small, needs no
migration, and closes the "anyone can `POST /api/reset`" hole today. **Phase 1**
is the prerequisite for everything hierarchy-related actually meaning anything,
since no permission model matters while the client declares its own role.
Phases 2–3 build the SOP-accurate controls and hardening on top of a real
identity.

---

## Key file reference

| Concern | File |
|---|---|
| RBAC middleware | `server/middleware/auth.cjs` |
| Legacy resource RBAC wrapper | `server/routes/api.cjs:129` |
| Server role groups (3 copies) | `server/routes/api.cjs:37+`, `:291`, `:2674` |
| Route guards | `server/routes/api.cjs` (`requireRole(...)`) |
| Client role header | `src/services/api.js:17,40` |
| Login screen | `src/pages/Login.jsx` |
| Session state / reducer | `src/context/AppContext.jsx:25,717` |
| Role hierarchy model | `src/data/roles.js` |
| Users table schema | `server/db/schema.cjs:359` |
| Audit trail helper | `server/db/auditLog.cjs` |
