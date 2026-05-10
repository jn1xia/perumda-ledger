import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options
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
