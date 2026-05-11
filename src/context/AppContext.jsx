import { createContext, useContext, useReducer, useEffect, useCallback, useState } from 'react';
import * as api from '../services/api';

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
    result.push({
      code: n.code, name: n.name, type: n.type, category: n.category,
      kode_sortir: n.kode_sortir || '', saldo_awal: n.saldo_awal || 0,
      kode_departemen: n.kode_departemen || ''
    });
    if (n.children) flattenCOA(n.children, result);
  });
  return result;
}

// Load state from database via API
async function loadStateFromAPI() {
  try {
    await api.apiFixAnggaran().catch(console.error); // Force fix LRA data
    const [journals, coa, assets, inventory, bbm, piutang, hutang, anggaran, rekonsiliasi, pengaturan, lockedPeriods] = await Promise.all([
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
      api.apiGetLockedPeriods()
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
      nextJournalNum: Math.max(0, ...journals.map(j => parseInt(j.id.split('-').pop() || '0'))) + 1,
      nextAssetNum: Math.max(0, ...assets.map(a => parseInt(a.kode.split('-').pop() || '0'))) + 1,
      nextBBMNum: Math.max(0, ...bbm.map(b => parseInt(b.id.split('-').pop() || '0'))) + 1,
      nextPiutangNum: Math.max(0, ...piutang.map(p => parseInt(p.id.split('-').pop() || '0'))) + 1,
      nextHutangNum: Math.max(0, ...hutang.map(h => parseInt(h.id.split('-').pop() || '0'))) + 1,
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
    if (acc.parent_code) {
      const parent = map[acc.parent_code];
      if (parent) parent.children.push(map[acc.code]);
    } else if (acc.code.length <= 2) {
      roots.push(map[acc.code]);
    }
  });

  return roots.length > 0 ? roots : flat.filter(a => !a.parent_code).map(a => ({ ...a, children: [] }));
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
    pengaturan: {},
    lockedPeriods: [],
    nextJournalNum: 1,
    nextAssetNum: 1,
    nextBBMNum: 1,
    nextPiutangNum: 1,
    nextHutangNum: 1,
  };
}

// Reducer - same as before but without localStorage
function reducer(state, action) {
  let newState;

  switch (action.type) {
    // === JOURNALS ===
    case 'SET_STATE': {
      return { ...state, ...action.payload };
    }

    case 'ADD_JOURNAL': {
      const num = String(state.nextJournalNum).padStart(3, '0');
      const journal = { ...action.payload, id: `JV-2026-${num}` };
      newState = { ...state, journals: [...state.journals, journal], nextJournalNum: state.nextJournalNum + 1 };
      // Persist to API
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

    // === COA ===
    case 'ADD_ACCOUNT': {
      const coaTree = addAccountToTree(state.coaTree, action.payload.parent_code, action.payload.account);
      const coaFlat = flattenCOA(coaTree);
      api.apiCreateCOA(action.payload.account).catch(console.error);
      return { ...state, coaTree, coaFlat };
    }

    case 'UPDATE_ACCOUNT': {
      const coaTree = updateAccountInTree(state.coaTree, action.payload.code, action.payload.updates);
      const coaFlat = flattenCOA(coaTree);
      api.apiUpdateCOA(action.payload.code, action.payload.updates).catch(console.error);
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
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

// === HELPER: Compute Buku Besar from journals ===
export function computeLedger(journals, akunCode) {
  const entries = journals
    .filter(j => j.status === 'posted')
    .filter(j => j.akun_debit?.startsWith(akunCode) || j.akun_kredit?.startsWith(akunCode))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  let saldo = 0;
  const isDebitNormal = String(akunCode).startsWith('1') || String(akunCode).startsWith('6');
  return entries.map(j => {
    const isDebit = j.akun_debit.startsWith(akunCode);
    const debit = isDebit ? j.debit : 0;
    const kredit = isDebit ? 0 : j.kredit;
    saldo += (isDebitNormal ? debit - kredit : kredit - debit);
    return { tanggal: j.tanggal, ref: j.id, keterangan: j.keterangan, debit, kredit, saldo };
  });
}

// === HELPER: Auto-compute Cash Flow from journals ===
export function computeCashFlow(journals) {
  const posted = journals.filter(j => j.status === 'posted');
  const cashAccounts = ['11101', '11103', '11104', '11106', '11107'];

  const operasional = { masuk: 0, keluar: 0, items: [] };
  const investasi = { masuk: 0, keluar: 0, items: [] };
  const pendanaan = { masuk: 0, keluar: 0, items: [] };

  posted.forEach(j => {
    const debitCode = (j.akun_debit || '').split(' ')[0];
    const kreditCode = (j.akun_kredit || '').split(' ')[0];
    const isCashDebit = cashAccounts.some(c => debitCode.startsWith(c));
    const isCashKredit = cashAccounts.some(c => kreditCode.startsWith(c));

    if (!isCashDebit && !isCashKredit) return;

    const amount = j.debit;
    const isCashIn = isCashDebit;
    const otherCode = isCashIn ? kreditCode : debitCode;

    let category;
    if (otherCode.startsWith('4') || otherCode.startsWith('6') || otherCode.startsWith('21') || otherCode.startsWith('112')) {
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
      tanggal: j.tanggal
    });
  });

  return {
    operasional: { ...operasional, netto: operasional.masuk - operasional.keluar },
    investasi: { ...investasi, netto: investasi.masuk - investasi.keluar },
    pendanaan: { ...pendanaan, netto: pendanaan.masuk - pendanaan.keluar },
    totalNetto: (operasional.masuk - operasional.keluar) + (investasi.masuk - investasi.keluar) + (pendanaan.masuk - pendanaan.keluar)
  };
}
