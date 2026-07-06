import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

// Resolve the current user role for RBAC headers.
// Priority: explicit window.__USER_ROLE__ → localStorage('userRole') → 'admin'
// (the default keeps the existing UX functional until proper login is wired).
function getCurrentUserRole() {
  if (typeof window !== 'undefined') {
    if (window.__USER_ROLE__) return String(window.__USER_ROLE__);
    try {
      const stored = window.localStorage && window.localStorage.getItem('userRole');
      if (stored) return stored;
    } catch (_) { /* ignore storage errors (e.g. SSR/sandbox) */ }
  }
  return 'admin';
}

// Hard ceiling for a single API request. Long audited-snapshot / report loads
// can legitimately take a while, so this is generous (120s) — it exists only so
// a genuinely hung request rejects with a clear error (instead of leaving modals
// spinning forever), not to cut off normal long operations.
const FETCH_TIMEOUT_MS = 120000;

async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  // Abort the request if it exceeds FETCH_TIMEOUT_MS. Respect any AbortSignal the
  // caller already passed by not overriding it.
  const controller = (typeof AbortController !== 'undefined' && !options.signal)
    ? new AbortController() : null;
  let timer = null;
  if (controller) {
    timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  }
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Role': getCurrentUserRole(),
      ...(options.headers || {}),
    },
    ...(controller ? { signal: controller.signal } : {}),
  };

  try {
    const res = await fetch(url, config);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return await res.json();
  } catch (err) {
    // Surface a clear, actionable message on timeout so callers can close modals.
    if (err && (err.name === 'AbortError')) {
      const e = new Error(`Permintaan ke server melebihi batas waktu (${Math.round(FETCH_TIMEOUT_MS / 1000)} detik) dan dibatalkan. Coba lagi.`);
      e.code = 'TIMEOUT';
      console.error('API timeout:', endpoint);
      throw e;
    }
    console.error('API error:', endpoint, err.message);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Journals
export const apiGetJournals = () => fetchAPI('/journals');
export const apiGetJournal = (id) => fetchAPI(`/journals/${id}`);
export const apiCreateJournal = (data) => fetchAPI('/journals', { method: 'POST', body: JSON.stringify(data) });
export const apiCreateJournalsBulk = (data) => fetchAPI('/journals/bulk', { method: 'POST', body: JSON.stringify({ journals: data }) });
export const apiUpdateJournal = (id, data) => fetchAPI(`/journals/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const apiDeleteJournal = (id) => fetchAPI(`/journals/${id}`, { method: 'DELETE' });
export const apiDeleteJournalsByMonth = (month) => fetchAPI(`/journals?month=${month}`, { method: 'DELETE' });
export const apiApproveJournal = (id) => fetchAPI(`/journals/approve/${id}`, { method: 'POST' });
export const apiUnapproveJournal = (id) => fetchAPI(`/journals/unapprove/${id}`, { method: 'POST' });

// COA
export const apiGetCOA = () => fetchAPI('/coa');
export const apiCreateCOA = (data) => fetchAPI('/coa', { method: 'POST', body: JSON.stringify(data) });
export const apiUpdateCOA = (code, data) => fetchAPI(`/coa/${code}`, { method: 'PUT', body: JSON.stringify(data) });
export const apiDeleteCOA = (code) => fetchAPI(`/coa/${code}`, { method: 'DELETE' });

// Assets
export const apiGetAssets = () => fetchAPI('/assets');
export const apiCreateAsset = (data) => fetchAPI('/assets', { method: 'POST', body: JSON.stringify(data) });
export const apiUpdateAsset = (kode, data) => fetchAPI(`/assets/${kode}`, { method: 'PUT', body: JSON.stringify(data) });
export const apiDeleteAsset = (kode) => fetchAPI(`/assets/${kode}`, { method: 'DELETE' });

// Inventory
export const apiGetInventory = () => fetchAPI('/inventory');
export const apiUpsertInventory = (data) => fetchAPI('/inventory', { method: 'POST', body: JSON.stringify(data) });
export const apiDeleteInventory = (kode) => fetchAPI(`/inventory/${kode}`, { method: 'DELETE' });

// BBM
export const apiGetBBM = () => fetchAPI('/bbm');
export const apiCreateBBM = (data) => fetchAPI('/bbm', { method: 'POST', body: JSON.stringify(data) });
export const apiDeleteBBM = (id) => fetchAPI(`/bbm/${id}`, { method: 'DELETE' });

// Piutang
export const apiGetPiutang = () => fetchAPI('/piutang');
export const apiCreatePiutang = (data) => fetchAPI('/piutang', { method: 'POST', body: JSON.stringify(data) });
export const apiUpdatePiutang = (id, data) => fetchAPI(`/piutang/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const apiDeletePiutang = (id) => fetchAPI(`/piutang/${id}`, { method: 'DELETE' });

// Hutang
export const apiGetHutang = () => fetchAPI('/hutang');
export const apiCreateHutang = (data) => fetchAPI('/hutang', { method: 'POST', body: JSON.stringify(data) });
export const apiUpdateHutang = (id, data) => fetchAPI(`/hutang/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const apiDeleteHutang = (id) => fetchAPI(`/hutang/${id}`, { method: 'DELETE' });

// Anggaran
export const apiGetAnggaran = () => fetchAPI('/anggaran');
export const apiFixAnggaran = () => fetchAPI('/fix-anggaran', { method: 'POST' });
export const apiUpsertAnggaran = (data) => fetchAPI('/anggaran', { method: 'POST', body: JSON.stringify(data) });
export const apiDeleteAnggaran = (kode) => fetchAPI(`/anggaran/${kode}`, { method: 'DELETE' });

// Rekonsiliasi
export const apiGetRekonsiliasi = () => fetchAPI('/rekonsiliasi');
export const apiAddRekonItem = (data) => fetchAPI('/rekonsiliasi', { method: 'POST', body: JSON.stringify(data) });
export const apiDeleteRekonItem = (id) => fetchAPI(`/rekonsiliasi/${id}`, { method: 'DELETE' });

// Pengaturan
export const apiGetPengaturan = () => fetchAPI('/pengaturan');
export const apiUpdatePengaturan = (data) => fetchAPI('/pengaturan', { method: 'PUT', body: JSON.stringify(data) });

// Locked Periods
export const apiGetLockedPeriods = () => fetchAPI('/locked-periods');
export const apiLockPeriod = (period) => fetchAPI('/locked-periods', { method: 'POST', body: JSON.stringify({ period }) });
export const apiUnlockPeriod = (period) => fetchAPI(`/locked-periods/${period}`, { method: 'DELETE' });

// Giro
export const apiGetGiro = () => fetchAPI('/giro');
export const apiCreateGiro = (data) => fetchAPI('/giro', { method: 'POST', body: JSON.stringify(data) });
export const apiUpdateGiro = (id, data) => fetchAPI(`/giro/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const apiDeleteGiro = (id) => fetchAPI(`/giro/${id}`, { method: 'DELETE' });

// Pelanggan Master (#11)
export const apiGetPelanggan = () => fetchAPI('/pelanggan');
export const apiCreatePelanggan = (data) => fetchAPI('/pelanggan', { method: 'POST', body: JSON.stringify(data) });
export const apiUpdatePelanggan = (id, data) => fetchAPI(`/pelanggan/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const apiDeletePelanggan = (id) => fetchAPI(`/pelanggan/${id}`, { method: 'DELETE' });

// Supplier Master (#14)
export const apiGetSupplier = () => fetchAPI('/supplier');
export const apiCreateSupplier = (data) => fetchAPI('/supplier', { method: 'POST', body: JSON.stringify(data) });
export const apiUpdateSupplier = (id, data) => fetchAPI(`/supplier/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const apiDeleteSupplier = (id) => fetchAPI(`/supplier/${id}`, { method: 'DELETE' });

// Purchase Orders (#19)
export const apiGetPO = () => fetchAPI('/purchase-orders');
export const apiCreatePO = (data) => fetchAPI('/purchase-orders', { method: 'POST', body: JSON.stringify(data) });
export const apiUpdatePO = (id, data) => fetchAPI(`/purchase-orders/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const apiDeletePO = (id) => fetchAPI(`/purchase-orders/${id}`, { method: 'DELETE' });

// E-Faktur (#24)
export const apiGetEFaktur = () => fetchAPI('/efaktur');
export const apiCreateEFaktur = (data) => fetchAPI('/efaktur', { method: 'POST', body: JSON.stringify(data) });
export const apiDeleteEFaktur = (id) => fetchAPI(`/efaktur/${id}`, { method: 'DELETE' });

// Sales Orders (#20)
export const apiGetSO = () => fetchAPI('/sales-orders');
export const apiCreateSO = (data) => fetchAPI('/sales-orders', { method: 'POST', body: JSON.stringify(data) });
export const apiUpdateSO = (id, data) => fetchAPI(`/sales-orders/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const apiDeleteSO = (id) => fetchAPI(`/sales-orders/${id}`, { method: 'DELETE' });

// Stock Opname (#21)
export const apiGetStockOpname = () => fetchAPI('/stock-opname');
export const apiCreateStockOpname = (data) => fetchAPI('/stock-opname', { method: 'POST', body: JSON.stringify(data) });
export const apiDeleteStockOpname = (id) => fetchAPI(`/stock-opname/${id}`, { method: 'DELETE' });

// Users (#2)
export const apiGetUsers = () => fetchAPI('/users');
export const apiCreateUser = (data) => fetchAPI('/users', { method: 'POST', body: JSON.stringify(data) });
export const apiUpdateUser = (username, data) => fetchAPI(`/users/${username}`, { method: 'PUT', body: JSON.stringify(data) });
export const apiDeleteUser = (username) => fetchAPI(`/users/${username}`, { method: 'DELETE' });

// Departemen / Cost Center (#27)
export const apiGetDepartemen = () => fetchAPI('/departemen');
export const apiCreateDepartemen = (data) => fetchAPI('/departemen', { method: 'POST', body: JSON.stringify(data) });
export const apiUpdateDepartemen = (kode, data) => fetchAPI(`/departemen/${kode}`, { method: 'PUT', body: JSON.stringify(data) });
export const apiDeleteDepartemen = (kode) => fetchAPI(`/departemen/${kode}`, { method: 'DELETE' });

// Reset
export const apiResetAll = () => fetchAPI('/reset', { method: 'POST' });
// Reset a single month across all modules (journals, lines, transactional data, report snapshots)
export const apiResetMonth = (period) => fetchAPI('/reset-month', { method: 'POST', body: JSON.stringify({ period }) });
// Load the audited report snapshot (Neraca/Arus Kas/Laba Rugi) for a period from the bundled lampiran
export const apiLoadAudited = (period) => fetchAPI('/reports/load-audited', { method: 'POST', body: JSON.stringify({ period }) });
// Periods that have an audited Neraca snapshot loaded
export const apiGetAuditedPeriods = () => fetchAPI('/reports/audited-periods');
// Save an audited report snapshot parsed client-side from an uploaded lampiran
export const apiSaveReportSnapshot = (payload) => fetchAPI('/reports/snapshot', { method: 'POST', body: JSON.stringify(payload) });
// Reconcile a month to its existing snapshot (re-baseline that month's JV- journals to XL-)
export const apiReconcileMonth = (period) => fetchAPI('/reports/reconcile-month', { method: 'POST', body: JSON.stringify({ period }) });
// Reconcile Buku Besar (ledger) to the Neraca snapshot — posts a compound adjusting journal
export const apiReconcileLedger = (period) => fetchAPI('/reports/reconcile-ledger', { method: 'POST', body: JSON.stringify({ period }) });

// Export
export const apiExportAll = () => fetchAPI('/export');

// Reference report data (from Excel)
export const apiGetRefNeraca = (period) => fetchAPI(`/reports/ref-neraca?period=${period}`);
export const apiGetRefArusKas = (period) => fetchAPI(`/reports/ref-arus-kas?period=${period}`);
export const apiGetRefLabaRugi = (period) => fetchAPI(`/reports/ref-laba-rugi?period=${period}`);

// Health check
export const apiCheckHealth = () => fetch(`${API_BASE.replace('/api', '')}/health`).then(r => r.json());

// Hook for monitoring API status
export function useAPI() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    checkServer();
    const interval = setInterval(checkServer, 30000);
    return () => clearInterval(interval);
  }, []);

  async function checkServer() {
    try {
      await fetch(`${API_BASE.replace('/api', '')}/health`);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }

  return { online, refetch: checkServer };
}
