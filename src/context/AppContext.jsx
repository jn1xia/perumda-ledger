import { createContext, useContext, useReducer, useEffect, useCallback, useState } from 'react';
import * as api from '../services/api';
import { ROLE } from '../data/roles.js';
import { expandJournals } from '../utils/journalExpand.js';
import { extractAccountCode, ledgerGroupPrefixes } from '../utils/lraOutline.js';

// ─── Counter helper ───────────────────────────────────────────────────────────
// Compute the next sequence number from a list of records, ignoring any id whose
// trailing segment is not a clean integer (e.g. legacy "JV-2026-NaN" or codes
// like "XL-2026-01-A.05-4"). Without this guard a single bad id (parseInt→NaN)
// poisons Math.max and every new id becomes "...-NaN", overwriting each other.
function nextSeqFromIds(records, key = 'id') {
  let max = 0
  for (const r of records || []) {
    const raw = String(r?.[key] ?? '')
    if (!raw.startsWith('JV-') && !raw.startsWith('JRN-')) continue
    const tail = raw.split('-').pop()
    const n = parseInt(tail, 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return max + 1
}

// ─── Session helpers ──────────────────────────────────────────────────────────
function loadSession() {
  try {
    const raw = localStorage.getItem('session')
    if (raw) {
      const s = JSON.parse(raw)
      if (s && s.role && s.username) return s
    }
  } catch { /* ignore */ }
  return null
}

function applySessionToWindow(session) {
  if (!session) return
  window.__USER_ROLE__ = session.role
  try { localStorage.setItem('userRole', session.role) } catch { /* ignore */ }
}

const AppContext = createContext();

// Minified sample data for offline fallback (basic COA structure)
const FALLBACK_COA = [
  { code: '1', name: 'ASET', type: 'parent', category: 'Aset', children: [
    { code: '11101', name: 'Kas Kecil', type: 'posting', category: 'Aset', saldo_awal: 0 },
    { code: '11103', name: 'Bank Kalsel', type: 'posting', category: 'Aset', saldo_awal: 3168070140.65 },
    { code: '11104', name: 'Bank BNI', type: 'posting', category: 'Aset', saldo_awal: 626551894 },
    { code: '11106', name: 'BNI Bisnis', type: 'posting', category: 'Aset', saldo_awal: 146947861 }
  ]}
];

function flattenCOA(nodes, result = []) {
  nodes.forEach(n => {
    const kodeSortir = n.kode_sortir ?? n.kodeSortir ?? '';
    const saldoAwal = n.saldo_awal ?? n.saldoAwal ?? 0;
    const kodeDepartemen = n.kode_departemen ?? n.kodeDepartemen ?? '';
    result.push({
      code: n.code, name: n.name, type: n.type, category: n.category,
      parent_code: n.parent_code ?? null,
      // expose both snake_case (API) and camelCase (UI) so all consumers work
      kode_sortir: kodeSortir, saldo_awal: saldoAwal, kode_departemen: kodeDepartemen,
      kodeSortir, saldoAwal, kodeDepartemen,
    });
    if (n.children) flattenCOA(n.children, result);
  });
  return result;
}

// Load state from database via API
async function loadStateFromAPI() {
  try {
    // Skip fix-anggaran — real per-month data is already in DB from Excel imports
    // await api.apiFixAnggaran().catch(console.error);
    const [journals, coa, assets, inventory, bbm, piutang, hutang, anggaran, rekonsiliasi, pengaturan, lockedPeriods, giro, pelangganData, supplierData, poData, efakturData, soData, stockOpnameData, usersData, departemenData] = await Promise.all([
      api.apiGetJournals(),
      api.apiGetCOA(),
      api.apiGetAssets(),
      api.apiGetInventory(),
      api.apiGetBBM(),
      api.apiGetPiutang(),
      api.apiGetHutang(),
      api.apiGetAnggaran(),
      api.apiGetRekonsiliasi(),
      api.apiGetPengaturan(),
      api.apiGetLockedPeriods(),
      api.apiGetGiro().catch(() => []),
      api.apiGetPelanggan().catch(() => []),
      api.apiGetSupplier().catch(() => []),
      api.apiGetPO().catch(() => []),
      api.apiGetEFaktur().catch(() => []),
      api.apiGetSO().catch(() => []),
      api.apiGetStockOpname().catch(() => []),
      api.apiGetUsers().catch(() => []),
      api.apiGetDepartemen().catch(() => []),
    ]);

    // Get counters
    const coaTree = coa.length > 0 ? buildCOATree(coa) : FALLBACK_COA;
    const coaFlat = flattenCOA(coaTree);

    return {
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      currentPeriod: 'April 2026',
      showComparison: true,
      journals: Array.isArray(journals) ? journals : [],
      coaTree,
      coaFlat,
      assets: Array.isArray(assets) ? assets : [],
      inventory: Array.isArray(inventory) ? inventory : [],
      bbmTransactions: Array.isArray(bbm) ? bbm : [],
      piutang: Array.isArray(piutang) ? piutang : [],
      hutang: Array.isArray(hutang) ? hutang : [],
      anggaran: Array.isArray(anggaran) ? anggaran : [],
      anggaranCategories: Array.isArray(anggaran) ? anggaran.reduce((acc, item) => {
        if (!acc[item.kategori]) acc[item.kategori] = [];
        acc[item.kategori].push(item);
        return acc;
      }, {}) : {},
      rekonsiliasi: Array.isArray(rekonsiliasi) ? { items: rekonsiliasi, selisih: 0, saldoBank: 0, saldoBuku: 0 } : { items: [], selisih: 0, saldoBank: 0, saldoBuku: 0 },
      pengaturan: typeof pengaturan === 'object' && pengaturan !== null ? pengaturan : {},
      lockedPeriods: Array.isArray(lockedPeriods) ? lockedPeriods : [],
      giro: Array.isArray(giro) ? giro : [],
      pelangganMaster: Array.isArray(pelangganData) ? pelangganData : [],
      supplierMaster: Array.isArray(supplierData) ? supplierData : [],
      purchaseOrders: Array.isArray(poData) ? poData : [],
      efaktur: Array.isArray(efakturData) ? efakturData : [],
      salesOrders: Array.isArray(soData) ? soData : [],
      stockOpname: Array.isArray(stockOpnameData) ? stockOpnameData : [],
      users: Array.isArray(usersData) ? usersData : [],
      departemen: Array.isArray(departemenData) ? departemenData : [],
      session: loadSession(),
      nextJournalNum: nextSeqFromIds(journals),
      nextAssetNum: Math.max(0, ...assets.map(a => parseInt(a.kode.split('-').pop() || '0'))) + 1,
      nextBBMNum: Math.max(0, ...bbm.map(b => parseInt(b.id.split('-').pop() || '0'))) + 1,
      nextPiutangNum: Math.max(0, ...piutang.map(p => parseInt(p.id.split('-').pop() || '0'))) + 1,
      nextHutangNum: Math.max(0, ...hutang.map(h => parseInt(h.id.split('-').pop() || '0'))) + 1,
      nextGiroNum: Math.max(0, ...giro.map(g => parseInt(g.id.split('-').pop() || '0'))) + 1,
      nextPelangganNum: Math.max(0, ...pelangganData.map(p => parseInt(p.id.split('-').pop() || '0'))) + 1,
      nextSupplierNum: Math.max(0, ...supplierData.map(s => parseInt(s.id.split('-').pop() || '0'))) + 1,
      nextPONum: Math.max(0, ...poData.map(p => parseInt(p.id.split('-').pop() || '0'))) + 1,
      nextEFakturNum: Math.max(0, ...efakturData.map(e => parseInt(e.id.split('-').pop() || '0'))) + 1,
      nextSONum: Math.max(0, ...soData.map(s => parseInt(s.id.split('-').pop() || '0'))) + 1,
    };
  } catch (err) {
    console.error('Failed to load from API, using fallback:', err.message);
    return null;
  }
}

// Build COA tree from flat list
function buildCOATree(flat) {
  const map = {};
  const roots = [];

  flat.forEach(acc => {
    map[acc.code] = { ...acc, children: [] };
  });

  flat.forEach(acc => {
    const parent = acc.parent_code ? map[acc.parent_code] : null;
    if (parent) {
      // Linked to an existing parent → nest as child
      parent.children.push(map[acc.code]);
    } else {
      // No parent_code, or parent_code points to a missing account →
      // keep it as a top-level root so it is never silently dropped.
      roots.push(map[acc.code]);
    }
  });

  return roots.length > 0 ? roots : flat.map(a => ({ ...a, children: [] }));
}

// Create empty initial state
function createEmptyState() {
  return {
    sidebarCollapsed: false,
    sidebarMobileOpen: false,
    currentPeriod: 'April 2026',
    showComparison: true,
    journals: [],
    coaTree: FALLBACK_COA,
    coaFlat: flattenCOA(FALLBACK_COA),
    assets: [],
    inventory: [],
    bbmTransactions: [],
    piutang: [],
    hutang: [],
    anggaran: [],
    anggaranCategories: {},
    rekonsiliasi: { items: [], selisih: 0 },
    pengaturan: { geminiApiKey: 'AIzaSyDdt8Cjf1zOThYhGxU-5cM7tSHLBGO2rIE', geminiModel: 'gemini-1.5-flash' },
    lockedPeriods: [],
    giro: [],
    pelangganMaster: [],
    supplierMaster: [],
    purchaseOrders: [],
    efaktur: [],
    salesOrders: [],
    stockOpname: [],
    users: [],
    departemen: [],
    session: loadSession(),   // { username, role, roleLabel, loginAt } | null
    nextJournalNum: 1,
    nextAssetNum: 1,
    nextBBMNum: 1,
    nextPiutangNum: 1,
    nextHutangNum: 1,
    nextGiroNum: 1,
    nextPelangganNum: 1,
    nextSupplierNum: 1,
    nextPONum: 1,
    nextEFakturNum: 1,
    nextSONum: 1,
  };
}

// Reducer - same as before but without localStorage
function reducer(state, action) {
  let newState;

  switch (action.type) {
    // === UI: SIDEBAR ===
    case 'TOGGLE_SIDEBAR': {
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    }

    case 'TOGGLE_MOBILE_SIDEBAR': {
      return { ...state, sidebarMobileOpen: !state.sidebarMobileOpen };
    }

    case 'CLOSE_MOBILE_SIDEBAR': {
      return { ...state, sidebarMobileOpen: false };
    }

    // === JOURNALS ===
    case 'SET_STATE': {
      return { ...state, ...action.payload };
    }

    case 'ADD_JOURNAL': {
      const num = String(state.nextJournalNum).padStart(3, '0');
      const journal = { ...action.payload, id: `JV-2026-${num}` };
      newState = { ...state, journals: [...state.journals, journal], nextJournalNum: state.nextJournalNum + 1 };
      // Persist to API — refreshData will be called by the component
      api.apiCreateJournal(journal).catch(console.error);
      return newState;
    }

    case 'ADD_BULK_JOURNALS': {
      let stateNext = state.nextJournalNum;
      const newJournals = action.payload.map(j => {
        const id = `JV-2026-${String(stateNext).padStart(3, '0')}`;
        stateNext++;
        return { ...j, id };
      });
      const finalJournals = [...state.journals, ...newJournals];
      // Persist to API using bulk insert
      api.apiCreateJournalsBulk(newJournals).catch(console.error);
      return { ...state, journals: finalJournals, nextJournalNum: stateNext };
    }

    case 'UPDATE_JOURNAL': {
      const journals = state.journals.map(j => j.id === action.payload.id ? { ...j, ...action.payload } : j);
      api.apiUpdateJournal(action.payload.id, action.payload).catch(console.error);
      return { ...state, journals };
    }

    case 'DELETE_JOURNAL': {
      const journals = state.journals.filter(j => j.id !== action.payload);
      api.apiDeleteJournal(action.payload).catch(console.error);
      return { ...state, journals };
    }

    case 'DELETE_JOURNALS_BY_MONTH': {
      const targetMonth = action.payload;
      const journals = state.journals.filter(j => {
        if (!j.tanggal) return true;
        return !j.tanggal.startsWith(targetMonth);
      });
      api.apiDeleteJournalsByMonth(targetMonth).catch(console.error);
      return { ...state, journals };
    }

    case 'APPROVE_JOURNAL': {
      const journals = state.journals.map(j => j.id === action.payload ? { ...j, status: 'posted' } : j);
      api.apiApproveJournal(action.payload).catch(console.error);
      return { ...state, journals };
    }

    case 'UNAPPROVE_JOURNAL': {
      const journals = state.journals.map(j => j.id === action.payload ? { ...j, status: 'pending' } : j);
      api.apiUnapproveJournal(action.payload).catch(console.error);
      return { ...state, journals };
    }

    case 'REFRESH_JOURNALS': {
      return { ...state, journals: action.payload, nextJournalNum: nextSeqFromIds(action.payload) };
    }

    // === COA ===
    case 'ADD_ACCOUNT': {
      const a = action.payload.account || {};
      let parentCode = action.payload.parent_code ?? action.payload.parentCode ?? null;
      // If no parent was chosen, derive it from the code prefix so the new
      // account nests under its natural group (e.g. 41009 → 41) instead of
      // becoming a stray top-level root. Walk shorter prefixes until one
      // matches an existing account; null only if nothing matches.
      if (!parentCode && a.code) {
        let prefix = String(a.code);
        while (prefix.length > 1) {
          prefix = prefix.slice(0, -1);
          if (state.coaFlat.some(x => x.code === prefix)) { parentCode = prefix; break; }
        }
      }
      // Normalize to the camelCase shape the UI tree renders with…
      const account = {
        code: a.code,
        name: a.name,
        type: a.type || 'posting',
        category: a.category,
        kodeSortir: a.kodeSortir ?? a.kode_sortir ?? '',
        saldoAwal: Number(a.saldoAwal ?? a.saldo_awal ?? 0),
        kodeDepartemen: a.kodeDepartemen ?? a.kode_departemen ?? '',
        parent_code: parentCode || null,
      };
      const coaTree = addAccountToTree(state.coaTree, parentCode, account);
      const coaFlat = flattenCOA(coaTree);
      // …but persist to the API in the snake_case shape the server expects.
      api.apiCreateCOA({
        code: account.code,
        name: account.name,
        type: account.type,
        category: account.category,
        parent_code: parentCode || null,
        saldo_awal: account.saldoAwal,
        kode_sortir: account.kodeSortir,
        kode_departemen: account.kodeDepartemen,
      }).catch(console.error);
      return { ...state, coaTree, coaFlat };
    }

    case 'UPDATE_ACCOUNT': {
      const u = action.payload.updates || {};
      const updates = {
        name: u.name,
        category: u.category,
        kodeSortir: u.kodeSortir ?? u.kode_sortir,
        saldoAwal: u.saldoAwal != null ? Number(u.saldoAwal) : undefined,
        kodeDepartemen: u.kodeDepartemen ?? u.kode_departemen,
      };
      const coaTree = updateAccountInTree(state.coaTree, action.payload.code, updates);
      const coaFlat = flattenCOA(coaTree);
      api.apiUpdateCOA(action.payload.code, {
        name: updates.name,
        category: updates.category,
        saldo_awal: updates.saldoAwal,
        kode_sortir: updates.kodeSortir,
        kode_departemen: updates.kodeDepartemen,
      }).catch(console.error);
      return { ...state, coaTree, coaFlat };
    }

    case 'DELETE_ACCOUNT': {
      const coaTree = removeAccountFromTree(state.coaTree, action.payload);
      const coaFlat = flattenCOA(coaTree);
      api.apiDeleteCOA(action.payload).catch(console.error);
      return { ...state, coaTree, coaFlat };
    }

    // === ASSETS ===
    case 'ADD_ASSET': {
      const num = String(state.nextAssetNum).padStart(3, '0');
      const asset = { ...action.payload, kode: `AT-${num}` };
      newState = { ...state, assets: [...state.assets, asset], nextAssetNum: state.nextAssetNum + 1 };
      api.apiCreateAsset(asset).catch(console.error);
      return newState;
    }

    case 'UPDATE_ASSET': {
      const assets = state.assets.map(a => a.kode === action.payload.kode ? { ...a, ...action.payload } : a);
      api.apiUpdateAsset(action.payload.kode, action.payload).catch(console.error);
      return { ...state, assets };
    }

    case 'DELETE_ASSET': {
      const assets = state.assets.filter(a => a.kode !== action.payload);
      api.apiDeleteAsset(action.payload).catch(console.error);
      return { ...state, assets };
    }

    // === INVENTORY ===
    case 'ADD_INVENTORY': {
      const inventory = [...state.inventory, action.payload];
      api.apiUpsertInventory(action.payload).catch(console.error);
      return { ...state, inventory };
    }

    case 'UPDATE_INVENTORY': {
      const inventory = state.inventory.map(i => i.kode === action.payload.kode ? { ...i, ...action.payload } : i);
      api.apiUpsertInventory(action.payload).catch(console.error);
      return { ...state, inventory };
    }

    case 'DELETE_INVENTORY': {
      const inventory = state.inventory.filter(i => i.kode !== action.payload);
      api.apiDeleteInventory(action.payload).catch(console.error);
      return { ...state, inventory };
    }

    // === BBM ===
    case 'ADD_BBM': {
      const num = String(state.nextBBMNum).padStart(3, '0');
      const bbm = { ...action.payload, id: `BBM-${num}` };
      const bbmTransactions = [...state.bbmTransactions, bbm];
      api.apiCreateBBM(bbm).catch(console.error);
      return { ...state, bbmTransactions, nextBBMNum: state.nextBBMNum + 1 };
    }

    case 'DELETE_BBM': {
      const bbmTransactions = state.bbmTransactions.filter(b => b.id !== action.payload);
      api.apiDeleteBBM(action.payload).catch(console.error);
      return { ...state, bbmTransactions };
    }

    // === PIUTANG ===
    case 'ADD_PIUTANG': {
      const num = String(state.nextPiutangNum).padStart(3, '0');
      const pi = { ...action.payload, id: `PI-${num}` };
      const piutang = [...state.piutang, pi];
      api.apiCreatePiutang(pi).catch(console.error);
      return { ...state, piutang, nextPiutangNum: state.nextPiutangNum + 1 };
    }

    case 'UPDATE_PIUTANG': {
      const piutang = state.piutang.map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p);
      api.apiUpdatePiutang(action.payload.id, action.payload).catch(console.error);
      return { ...state, piutang };
    }

    case 'DELETE_PIUTANG': {
      const piutang = state.piutang.filter(p => p.id !== action.payload);
      api.apiDeletePiutang(action.payload).catch(console.error);
      return { ...state, piutang };
    }

    // === HUTANG ===
    case 'ADD_HUTANG': {
      const num = String(state.nextHutangNum).padStart(3, '0');
      const hu = { ...action.payload, id: `HU-${num}` };
      const hutang = [...state.hutang, hu];
      api.apiCreateHutang(hu).catch(console.error);
      return { ...state, hutang, nextHutangNum: state.nextHutangNum + 1 };
    }

    case 'UPDATE_HUTANG': {
      const hutang = state.hutang.map(h => h.id === action.payload.id ? { ...h, ...action.payload } : h);
      api.apiUpdateHutang(action.payload.id, action.payload).catch(console.error);
      return { ...state, hutang };
    }

    case 'DELETE_HUTANG': {
      const hutang = state.hutang.filter(h => h.id !== action.payload);
      api.apiDeleteHutang(action.payload).catch(console.error);
      return { ...state, hutang };
    }

    // === ANGGARAN ===
    case 'UPDATE_ANGGARAN': {
      const anggaran = state.anggaran.map(a => a.kode === action.payload.kode ? { ...a, ...action.payload } : a);
      api.apiUpsertAnggaran(action.payload).catch(console.error);
      return { ...state, anggaran };
    }

    case 'ADD_ANGGARAN': {
      const anggaran = [...state.anggaran, action.payload];
      api.apiUpsertAnggaran(action.payload).catch(console.error);
      return { ...state, anggaran };
    }

    case 'DELETE_ANGGARAN': {
      const anggaran = state.anggaran.filter(a => a.kode !== action.payload);
      api.apiDeleteAnggaran(action.payload).catch(console.error);
      return { ...state, anggaran };
    }

    // === REKONSILIASI ===
    case 'RESOLVE_REKON_ITEM': {
      const rekonsiliasi = {
        ...state.rekonsiliasi,
        items: state.rekonsiliasi.items.filter((_, i) => i !== action.payload),
        selisih: state.rekonsiliasi.items.reduce((s, item, i) => i === action.payload ? s : s + item.jumlah, 0)
      };
      const itemToDelete = state.rekonsiliasi.items[action.payload];
      if (itemToDelete && itemToDelete.id) {
        api.apiDeleteRekonItem(itemToDelete.id).catch(console.error);
      }
      return { ...state, rekonsiliasi };
    }

    case 'ADD_REKON_ITEM': {
      const item = action.payload;
      const rekonsiliasi = {
        ...state.rekonsiliasi,
        items: [...state.rekonsiliasi.items, item],
        selisih: state.rekonsiliasi.selisih + item.jumlah
      };
      api.apiAddRekonItem(item).catch(console.error);
      return { ...state, rekonsiliasi };
    }

    case 'UPDATE_REKON_SALDO': {
      return { ...state, rekonsiliasi: { ...state.rekonsiliasi, ...action.payload } };
    }

    // === PENGATURAN ===
    case 'UPDATE_PENGATURAN': {
      const pengaturan = { ...state.pengaturan, ...action.payload };
      api.apiUpdatePengaturan(action.payload).catch(console.error);
      return { ...state, pengaturan };
    }

    // === JOURNAL LOCKING ===
    case 'LOCK_PERIOD': {
      const lockedPeriods = [...new Set([...state.lockedPeriods, action.payload])];
      api.apiLockPeriod(action.payload).catch(console.error);
      return { ...state, lockedPeriods };
    }

    case 'UNLOCK_PERIOD': {
      const lockedPeriods = state.lockedPeriods.filter(p => p !== action.payload);
      api.apiUnlockPeriod(action.payload).catch(console.error);
      return { ...state, lockedPeriods };
    }

    // === COPY JOURNAL ===
    case 'COPY_JOURNAL': {
      const src = state.journals.find(j => j.id === action.payload);
      if (!src) return state;
      const num = String(state.nextJournalNum).padStart(3, '0');
      const copy = { ...src, id: `JV-2026-${num}`, tanggal: new Date().toISOString().split('T')[0], status: 'pending', keterangan: `[Copy] ${src.keterangan}` };
      newState = { ...state, journals: [...state.journals, copy], nextJournalNum: state.nextJournalNum + 1 };
      api.apiCreateJournal(copy).catch(console.error);
      return newState;
    }

    // === RESET DATA ===
    case 'RESET_DATA': {
      api.apiResetAll().catch(console.error);
      return createEmptyState();
    }

    // === GIRO ===
    case 'ADD_GIRO': {
      const num = String(state.nextGiroNum).padStart(4, '0');
      const g = { ...action.payload, id: `GR-${num}` };
      api.apiCreateGiro(g).catch(console.error);
      return { ...state, giro: [...state.giro, g], nextGiroNum: state.nextGiroNum + 1 };
    }

    case 'UPDATE_GIRO': {
      const giro = state.giro.map(g => g.id === action.payload.id ? { ...g, ...action.payload } : g);
      api.apiUpdateGiro(action.payload.id, action.payload).catch(console.error);
      return { ...state, giro };
    }

    case 'DELETE_GIRO': {
      const giro = state.giro.filter(g => g.id !== action.payload);
      api.apiDeleteGiro(action.payload).catch(console.error);
      return { ...state, giro };
    }

    // === PELANGGAN MASTER (#11) ===
    case 'ADD_PELANGGAN': {
      const num = String(state.nextPelangganNum).padStart(4, '0');
      const p = { ...action.payload, id: `PLG-${num}` };
      api.apiCreatePelanggan(p).catch(console.error);
      return { ...state, pelangganMaster: [...state.pelangganMaster, p], nextPelangganNum: state.nextPelangganNum + 1 };
    }
    case 'UPDATE_PELANGGAN': {
      const pelangganMaster = state.pelangganMaster.map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p);
      api.apiUpdatePelanggan(action.payload.id, action.payload).catch(console.error);
      return { ...state, pelangganMaster };
    }
    case 'DELETE_PELANGGAN': {
      const pelangganMaster = state.pelangganMaster.filter(p => p.id !== action.payload);
      api.apiDeletePelanggan(action.payload).catch(console.error);
      return { ...state, pelangganMaster };
    }

    // === SUPPLIER MASTER (#14) ===
    case 'ADD_SUPPLIER': {
      const num = String(state.nextSupplierNum).padStart(4, '0');
      const s = { ...action.payload, id: `SUP-${num}` };
      api.apiCreateSupplier(s).catch(console.error);
      return { ...state, supplierMaster: [...state.supplierMaster, s], nextSupplierNum: state.nextSupplierNum + 1 };
    }
    case 'UPDATE_SUPPLIER': {
      const supplierMaster = state.supplierMaster.map(s => s.id === action.payload.id ? { ...s, ...action.payload } : s);
      api.apiUpdateSupplier(action.payload.id, action.payload).catch(console.error);
      return { ...state, supplierMaster };
    }
    case 'DELETE_SUPPLIER': {
      const supplierMaster = state.supplierMaster.filter(s => s.id !== action.payload);
      api.apiDeleteSupplier(action.payload).catch(console.error);
      return { ...state, supplierMaster };
    }

    // === PURCHASE ORDERS (#19) ===
    case 'ADD_PO': {
      const num = String(state.nextPONum).padStart(4, '0');
      const po = { ...action.payload, id: `PO-${num}` };
      api.apiCreatePO(po).catch(console.error);
      return { ...state, purchaseOrders: [...state.purchaseOrders, po], nextPONum: state.nextPONum + 1 };
    }
    case 'UPDATE_PO': {
      const purchaseOrders = state.purchaseOrders.map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p);
      api.apiUpdatePO(action.payload.id, action.payload).catch(console.error);
      return { ...state, purchaseOrders };
    }
    case 'DELETE_PO': {
      const purchaseOrders = state.purchaseOrders.filter(p => p.id !== action.payload);
      api.apiDeletePO(action.payload).catch(console.error);
      return { ...state, purchaseOrders };
    }

    // === E-FAKTUR (#24) ===
    case 'ADD_EFAKTUR': {
      const num = String(state.nextEFakturNum).padStart(4, '0');
      const ef = { ...action.payload, id: `EF-${num}` };
      api.apiCreateEFaktur(ef).catch(console.error);
      return { ...state, efaktur: [...state.efaktur, ef], nextEFakturNum: state.nextEFakturNum + 1 };
    }
    case 'DELETE_EFAKTUR': {
      const efaktur = state.efaktur.filter(e => e.id !== action.payload);
      api.apiDeleteEFaktur(action.payload).catch(console.error);
      return { ...state, efaktur };
    }

    // === SALES ORDERS (#20) ===
    case 'ADD_SO': {
      const num = String(state.nextSONum).padStart(4, '0');
      const so = { ...action.payload, id: `SO-${num}` };
      api.apiCreateSO(so).catch(console.error);
      return { ...state, salesOrders: [...state.salesOrders, so], nextSONum: state.nextSONum + 1 };
    }
    case 'UPDATE_SO': {
      const salesOrders = state.salesOrders.map(s => s.id === action.payload.id ? { ...s, ...action.payload } : s);
      api.apiUpdateSO(action.payload.id, action.payload).catch(console.error);
      return { ...state, salesOrders };
    }
    case 'DELETE_SO': {
      const salesOrders = state.salesOrders.filter(s => s.id !== action.payload);
      api.apiDeleteSO(action.payload).catch(console.error);
      return { ...state, salesOrders };
    }

    // === STOCK OPNAME (#21) ===
    case 'ADD_STOCK_OPNAME': {
      const stockOpname = [...(state.stockOpname || []), action.payload];
      api.apiCreateStockOpname(action.payload).catch(console.error);
      return { ...state, stockOpname };
    }
    case 'DELETE_STOCK_OPNAME': {
      const stockOpname = (state.stockOpname || []).filter(s => s.id !== action.payload);
      api.apiDeleteStockOpname(action.payload).catch(console.error);
      return { ...state, stockOpname };
    }

    // === USERS (#2) ===
    case 'ADD_USER': {
      const users = [...(state.users || []), action.payload];
      api.apiCreateUser(action.payload).catch(console.error);
      return { ...state, users };
    }
    case 'UPDATE_USER': {
      const users = (state.users || []).map(u => u.username === action.payload.username ? { ...u, ...action.payload } : u);
      api.apiUpdateUser(action.payload.username, action.payload).catch(console.error);
      return { ...state, users };
    }
    case 'DELETE_USER': {
      const users = (state.users || []).filter(u => u.username !== action.payload);
      api.apiDeleteUser(action.payload).catch(console.error);
      return { ...state, users };
    }

    // === DEPARTEMEN (#27) ===
    case 'ADD_DEPARTEMEN': {
      const departemen = [...(state.departemen || []), action.payload];
      api.apiCreateDepartemen(action.payload).catch(console.error);
      return { ...state, departemen };
    }
    case 'UPDATE_DEPARTEMEN': {
      const departemen = (state.departemen || []).map(d => d.kode === action.payload.kode ? { ...d, ...action.payload } : d);
      api.apiUpdateDepartemen(action.payload.kode, action.payload).catch(console.error);
      return { ...state, departemen };
    }
    case 'DELETE_DEPARTEMEN': {
      const departemen = (state.departemen || []).filter(d => d.kode !== action.payload);
      api.apiDeleteDepartemen(action.payload).catch(console.error);
      return { ...state, departemen };
    }
    case 'SET_DEPARTEMEN': {
      return { ...state, departemen: action.payload };
    }

    // === SESSION / AUTH ===
    case 'LOGIN': {
      const session = action.payload  // { username, role, roleLabel, loginAt }
      applySessionToWindow(session)
      try { localStorage.setItem('session', JSON.stringify(session)) } catch { /* ignore */ }
      return { ...state, session }
    }
    case 'LOGOUT': {
      window.__USER_ROLE__ = null
      try {
        localStorage.removeItem('session')
        localStorage.removeItem('userRole')
      } catch { /* ignore */ }
      return { ...state, session: null }
    }

    default:
      return state;
  }
}

// Helper functions for tree operations
function addAccountToTree(tree, parent_code, newAccount) {
  if (!parent_code) return [...tree, newAccount];
  return tree.map(node => {
    if (node.code === parent_code) {
      return { ...node, type: 'parent', children: [...(node.children || []), newAccount] };
    }
    if (node.children) {
      return { ...node, children: addAccountToTree(node.children, parent_code, newAccount) };
    }
    return node;
  });
}

function removeAccountFromTree(tree, code) {
  return tree.filter(n => n.code !== code).map(node => {
    if (node.children) return { ...node, children: removeAccountFromTree(node.children, code) };
    return node;
  });
}

function updateAccountInTree(tree, code, updates) {
  return tree.map(node => {
    if (node.code === code) return { ...node, ...updates };
    if (node.children) return { ...node, children: updateAccountInTree(node.children, code, updates) };
    return node;
  });
}

let initialState = createEmptyState();

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [initialized, setInitialized] = useState(false);

  // Apply stored session to window on mount (so API headers get correct role immediately)
  useEffect(() => {
    const session = loadSession()
    if (session) applySessionToWindow(session)
  }, []);

  // Refresh specific data from server (call after mutations to sync UI with DB)
  const refreshData = useCallback(async (entity = 'all') => {
    try {
      if (entity === 'journals' || entity === 'all') {
        const journals = await api.apiGetJournals();
        dispatch({ type: 'REFRESH_JOURNALS', payload: Array.isArray(journals) ? journals : [] });
      }
      if (entity === 'all') {
        const apiState = await loadStateFromAPI();
        if (apiState) dispatch({ type: 'SET_STATE', payload: apiState });
      }
    } catch (err) {
      console.error('Refresh failed:', err.message);
    }
  }, []);

  // === Async journal action helpers ===
  // These await the API call before refreshing, so the UI is always in sync
  // with the database without relying on fragile setTimeout delays.
  const addJournal = useCallback(async (entry) => {
    try {
      await api.apiCreateJournal(entry);
    } catch (err) {
      console.error('addJournal failed:', err.message);
    }
    await refreshData('journals');
  }, [refreshData]);

  const updateJournal = useCallback(async (id, entry) => {
    try {
      await api.apiUpdateJournal(id, entry);
    } catch (err) {
      console.error('updateJournal failed:', err.message);
    }
    await refreshData('journals');
  }, [refreshData]);

  const deleteJournal = useCallback(async (id) => {
    try {
      await api.apiDeleteJournal(id);
    } catch (err) {
      console.error('deleteJournal failed:', err.message);
    }
    await refreshData('journals');
  }, [refreshData]);

  // Bulk delete a list of journal ids; single refresh at the end.
  const deleteJournals = useCallback(async (ids) => {
    for (const id of ids || []) {
      try {
        await api.apiDeleteJournal(id);
      } catch (err) {
        console.error('deleteJournals failed:', id, err.message);
      }
    }
    await refreshData('journals');
  }, [refreshData]);

  // Delete EVERY journal in a month (YYYY-MM) — one bulk API call.
  const deleteJournalsByMonth = useCallback(async (month) => {
    try {
      await api.apiDeleteJournalsByMonth(month);
    } catch (err) {
      console.error('deleteJournalsByMonth failed:', err.message);
    }
    await refreshData('journals');
  }, [refreshData]);

  const approveJournal = useCallback(async (id) => {
    try {
      await api.apiApproveJournal(id);
    } catch (err) {
      console.error('approveJournal failed:', err.message);
    }
    await refreshData('journals');
  }, [refreshData]);

  const unapproveJournal = useCallback(async (id) => {
    try {
      await api.apiUnapproveJournal(id);
    } catch (err) {
      console.error('unapproveJournal failed:', err.message);
    }
    await refreshData('journals');
  }, [refreshData]);

  const copyJournal = useCallback(async (id) => {
    const src = state.journals.find(j => j.id === id);
    if (!src) return;
    const num = String(state.nextJournalNum).padStart(3, '0');
    const copy = {
      ...src,
      id: `JV-2026-${num}`,
      tanggal: new Date().toISOString().split('T')[0],
      status: 'pending',
      keterangan: `[Copy] ${src.keterangan}`,
    };
    try {
      await api.apiCreateJournal(copy);
    } catch (err) {
      console.error('copyJournal failed:', err.message);
    }
    await refreshData('journals');
  }, [refreshData, state.journals, state.nextJournalNum]);

  // Bulk add (e.g. multi-line voucher) — persists all then refreshes once.
  // Propagates errors to the caller so a failed/partial upload surfaces in the
  // UI (the import modal shows it, the voucher form alerts) instead of silently
  // "succeeding" with no journals to approve. The UI is still refreshed first so
  // any rows that DID persist appear.
  const addJournals = useCallback(async (entries) => {
    let failure = null;
    try {
      // Use bulk endpoint when available; fall back to sequential creates
      if (typeof api.apiCreateJournalsBulk === 'function') {
        await api.apiCreateJournalsBulk(entries);
      } else {
        for (const e of entries) {
          // eslint-disable-next-line no-await-in-loop
          await api.apiCreateJournal(e);
        }
      }
    } catch (err) {
      failure = err;
      console.error('addJournals failed:', err.message);
    }
    await refreshData('journals');
    if (failure) throw failure;
  }, [refreshData]);

  // Load initial data from API on mount
  useEffect(() => {
    async function loadInitialData() {
      try {
        const apiState = await loadStateFromAPI();
        if (apiState) {
          initialState = apiState;
        } else {
          // API unavailable - use empty state with sample data fallback
          console.warn('API unavailable, using empty state');
          initialState = createEmptyState();
        }

        // For now, wrap with a full state reset
        dispatch({ type: 'SET_STATE', payload: initialState });
        setInitialized(true);
      } catch (err) {
        console.error('Failed to initialize:', err);
        initialState = createEmptyState();
        dispatch({ type: 'SET_STATE', payload: initialState });
        setInitialized(true);
      }
    }

    loadInitialData();
  }, []);

  if (!initialized) {
    return <div style={{ padding: 20 }}>Loading application...</div>;
  }

  return (
    <AppContext.Provider value={{
      state,
      dispatch,
      refreshData,
      addJournal,
      updateJournal,
      deleteJournal,
      deleteJournals,
      deleteJournalsByMonth,
      approveJournal,
      unapproveJournal,
      copyJournal,
      addJournals,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

// === HELPER: Compute Buku Besar from journals ===
export function computeLedger(journals, akunCode, saldoAwal = 0) {
  // Expand multi-line (form `lines`) journals into per-posting half-records so
  // each account's ledger shows every line that touches it.
  journals = expandJournals(journals);
  // Attribute each half-record to its REAL account: when a line's Sub Akun was
  // chosen from the full COA it carries its own leading code (e.g.
  // "61140 Beban Umum > 61141 - Kegiatan Kelembagaan") and the movement belongs
  // to the SUB-account (61141), consistent with LRA/NPD attribution
  // (lraOutline.extractAccountCode / reportDelta.codeOf). Free-text sub-akun
  // names keep the parent code, and legacy "CODE - NAME" strings match as before.
  // Group parents (e.g. 61060 Beban Konsumsi Rapat dan Tamu) must also pick up
  // their leaf accounts (61061..61065) — the COA numbers groups as <prefix>0,
  // so the parent code is NOT a plain string prefix of its children and a
  // startsWith-only match rendered an empty ledger for those groups.
  const groupPrefixes = ledgerGroupPrefixes(akunCode);
  const matchesAccount = (acctStr) => {
    const code = extractAccountCode(acctStr);
    if (!code) return false;
    if (code.startsWith(akunCode)) return true;
    return groupPrefixes ? groupPrefixes.some(p => code.startsWith(p)) : false;
  };
  const entries = journals
    .filter(j => j.status === 'posted')
    .filter(j => matchesAccount(j.akun_debit) || matchesAccount(j.akun_kredit))
    .sort((a, b) => String(a.tanggal || '').localeCompare(String(b.tanggal || '')));

  // Seed the running balance with the account's opening balance (saldo awal),
  // matching the Excel buku besar which always carries SALDO AWAL forward.
  // Debit-normal = Aset(1), BPP/HPP(5), Beban(6), Beban non-operasional(8).
  const isDebitNormal = /^[1568]/.test(String(akunCode));
  let saldo = Number(saldoAwal) || 0;
  return entries.map(j => {
    const isDebit = matchesAccount(j.akun_debit);
    const debit = isDebit ? j.debit : 0;
    const kredit = isDebit ? 0 : j.kredit;
    saldo += (isDebitNormal ? debit - kredit : kredit - debit);
    return { tanggal: j.tanggal, ref: j.id, keterangan: j.keterangan, debit, kredit, saldo };
  });
}

// === HELPER: Auto-compute Cash Flow from journals ===
export function computeCashFlow(journals) {
  const posted = expandJournals(journals).filter(j => j.status === 'posted');
  // Cash & bank accounts are the 111xx group only (Kas Kecil … Bank/Tapcash,
  // incl. Investasi Jangka Pendek). 112xx is Piutang (receivables), NOT cash —
  // matches the Excel lampiran "Kas dan Setara Kas" definition.
  const isCashAccount = (code) => code.startsWith('111');

  const operasional = { masuk: 0, keluar: 0, items: [] };
  const investasi = { masuk: 0, keluar: 0, items: [] };
  const pendanaan = { masuk: 0, keluar: 0, items: [] };

  posted.forEach(j => {
    const debitCode = (j.akun_debit || '').split(' ')[0];
    const kreditCode = (j.akun_kredit || '').split(' ')[0];
    const isCashDebit = isCashAccount(debitCode);
    const isCashKredit = isCashAccount(kreditCode);

    if (!isCashDebit && !isCashKredit) return;

    const amount = j.debit || j.kredit || 0;
    const isCashIn = isCashDebit;
    const otherCode = isCashIn ? kreditCode : debitCode;

    // Use tipe_transaksi from the journal if available (new feature)
    const tipe = j.tipe_transaksi || j._journal?.tipe_transaksi;
    
    let category;
    if (tipe === 'pendapatan' || tipe === 'pengeluaran') {
      // Explicitly classified → always operasional
      category = operasional;
    } else if (otherCode.startsWith('4') || otherCode.startsWith('6') || otherCode.startsWith('21') || otherCode.startsWith('112')) {
      category = operasional;
    } else if (otherCode.startsWith('12') || otherCode.startsWith('114')) {
      category = investasi;
    } else if (otherCode.startsWith('3') || otherCode.startsWith('22')) {
      category = pendanaan;
    } else {
      category = operasional;
    }

    if (isCashIn) {
      category.masuk += amount;
    } else {
      category.keluar += amount;
    }
    category.items.push({
      keterangan: j.keterangan,
      jumlah: isCashIn ? amount : -amount,
      ref: j.id,
      tanggal: j.tanggal,
      tipe_transaksi: tipe || 'transfer',
    });
  });

  return {
    operasional: { ...operasional, netto: operasional.masuk - operasional.keluar },
    investasi: { ...investasi, netto: investasi.masuk - investasi.keluar },
    pendanaan: { ...pendanaan, netto: pendanaan.masuk - pendanaan.keluar },
    totalNetto: (operasional.masuk - operasional.keluar) + (investasi.masuk - investasi.keluar) + (pendanaan.masuk - pendanaan.keluar)
  };
}
