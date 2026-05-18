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

async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Role': getCurrentUserRole(),
      ...(options.headers || {}),
    },
  };

  try {
    const res = await fetch(url, config);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return await res.json();
  } catch (err) {
    console.error('API error:', endpoint, err.message);
    throw err;
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

// Export
export const apiExportAll = () => fetchAPI('/export');

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
