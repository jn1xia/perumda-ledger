// =============================================================================
// Auto-journal helpers — used by Pembelian (#19), Penjualan (#20), and Stock
// Opname (#21) to keep the general ledger in sync with operational modules.
//
// Default account codes follow the live COA imported from the Perumda Excel
// (see src/data/extractedDataJan.json). Codes can be overridden per-deployment
// by editing the relevant fields in `state.pengaturan` (kept simple — no separate
// settings UI yet).
// =============================================================================

export const DEFAULT_AUTO_JOURNAL_ACCOUNTS = {
  // Cash & Bank
  kas: '11101 - Kas Kecil',
  bank: '11103 - Bank Kalsel',
  // Receivable / Payable
  piutangUsaha: '11201 - Piutang Usaha',
  utangUsaha: '21200 - Utang Usaha',
  // Inventory & adjustment
  persediaan: '13101 - Persediaan',
  bebanPenyesuaianPersediaan: '61901 - Beban Penyesuaian Persediaan',
  // Revenue
  pendapatanPenjualan: '41101 - Pendapatan Penjualan',
};

// Resolve an auto-journal account code from pengaturan or fall back to default.
export function resolveAutoAccount(pengaturan, key) {
  const overrides = (pengaturan && pengaturan.autoJournalAccounts) || {};
  return overrides[key] || DEFAULT_AUTO_JOURNAL_ACCOUNTS[key];
}

// =============================================================================
// #19 — Build journal entry for "PO received"
//   D: Persediaan (inventory), K: Utang Usaha (AP)
// Returns: { journal, hutang } — caller dispatches both.
// =============================================================================
export function buildPurchaseReceiveEntries(po, pengaturan) {
  const akunDebit = resolveAutoAccount(pengaturan, 'persediaan');
  const akunKredit = resolveAutoAccount(pengaturan, 'utangUsaha');
  const tanggal = po.tanggal || new Date().toISOString().split('T')[0];
  const total = Number(po.total) || 0;

  const journal = {
    tanggal,
    keterangan: `[${po.noPO}] Penerimaan barang dari ${po.supplier_nama || 'supplier'}`,
    akun_debit: akunDebit,
    akun_kredit: akunKredit,
    debit: total,
    kredit: total,
    status: 'pending',
    bukti: po.noPO,
  };

  // AP record so the Hutang module reflects the new payable
  const dueDate = new Date(tanggal);
  dueDate.setDate(dueDate.getDate() + 30); // default 30-day terms
  const hutang = {
    no_faktur: po.noPO,
    tanggal,
    jatuh_tempo: dueDate.toISOString().split('T')[0],
    supplier: po.supplier_nama || '',
    keterangan: `Auto dari PO ${po.noPO}`,
    jumlah: total,
    terbayar: 0,
    sisa: total,
    status: 'belum',
  };

  return { journal, hutang };
}

// Build inventory increments from PO line items.
// Returns array of {kode, qty, harga} only for items whose `kode` matches
// an existing inventory record. Items without a kode are skipped — operator
// can add them to master persediaan later.
export function buildInventoryIncrements(po, existingInventory = []) {
  const items = Array.isArray(po.items)
    ? po.items
    : (typeof po.items === 'string' ? JSON.parse(po.items || '[]') : []);
  const updates = [];
  for (const it of items) {
    if (!it || !it.kode) continue;
    const inv = existingInventory.find(x => x.kode === it.kode);
    if (!inv) continue;
    const masuk = (Number(inv.masuk) || 0) + (Number(it.qty) || 0);
    const stokAkhir = Number(inv.stokAwal || 0) + masuk - Number(inv.keluar || 0);
    const nilaiTotal = stokAkhir * Number(inv.hargaSatuan || it.harga || 0);
    updates.push({ ...inv, masuk, stokAkhir, nilaiTotal });
  }
  return updates;
}

// =============================================================================
// #20 — Build journal entries for "SO confirmed"
//   Tunai: D Kas/Bank, K Pendapatan
//   Kredit: D Piutang Usaha, K Pendapatan + create Piutang record
// =============================================================================
export function buildSalesEntries(so, pengaturan) {
  const tanggal = so.tanggal || new Date().toISOString().split('T')[0];
  const total = Number(so.total) || 0;
  const isCredit = so.pembayaran === 'kredit';
  const akunDebit = isCredit
    ? resolveAutoAccount(pengaturan, 'piutangUsaha')
    : resolveAutoAccount(pengaturan, 'bank');
  const akunKredit = resolveAutoAccount(pengaturan, 'pendapatanPenjualan');

  const journal = {
    tanggal,
    keterangan: `[${so.noSO}] Penjualan ${isCredit ? 'kredit' : 'tunai'} ke ${so.pelanggan_nama || 'pelanggan'}`,
    akun_debit: akunDebit,
    akun_kredit: akunKredit,
    debit: total,
    kredit: total,
    status: 'pending',
    bukti: so.noSO,
  };

  let piutang = null;
  if (isCredit) {
    const dueDate = new Date(tanggal);
    dueDate.setDate(dueDate.getDate() + 30);
    piutang = {
      no_faktur: so.noSO,
      tanggal,
      jatuh_tempo: dueDate.toISOString().split('T')[0],
      pelanggan: so.pelanggan_nama || '',
      keterangan: `Auto dari SO ${so.noSO}`,
      jumlah: total,
      terbayar: 0,
      sisa: total,
      status: 'belum',
    };
  }

  return { journal, piutang };
}

// Build inventory decrements from SO line items.
export function buildInventoryDecrements(so, existingInventory = []) {
  const items = Array.isArray(so.items)
    ? so.items
    : (typeof so.items === 'string' ? JSON.parse(so.items || '[]') : []);
  const updates = [];
  for (const it of items) {
    if (!it || !it.kode) continue;
    const inv = existingInventory.find(x => x.kode === it.kode);
    if (!inv) continue;
    const keluar = (Number(inv.keluar) || 0) + (Number(it.qty) || 0);
    const stokAkhir = Number(inv.stokAwal || 0) + Number(inv.masuk || 0) - keluar;
    const nilaiTotal = stokAkhir * Number(inv.hargaSatuan || 0);
    updates.push({ ...inv, keluar, stokAkhir, nilaiTotal });
  }
  return updates;
}

// =============================================================================
// #21 — Build adjustment entry from a stock opname row.
// Selisih > 0 (lebih)   → D Persediaan, K Beban Penyesuaian (gain)
// Selisih < 0 (kurang)  → D Beban Penyesuaian, K Persediaan (loss)
// =============================================================================
export function buildStockOpnameAdjustment(opname, pengaturan, hargaSatuan) {
  const selisih = Number(opname.selisih) || 0;
  if (selisih === 0) return null;
  const tanggal = opname.tanggal || new Date().toISOString().split('T')[0];
  const nilai = Math.abs(selisih * (Number(hargaSatuan) || 0));
  if (nilai === 0) return null;

  const persediaan = resolveAutoAccount(pengaturan, 'persediaan');
  const beban = resolveAutoAccount(pengaturan, 'bebanPenyesuaianPersediaan');

  const positif = selisih > 0;
  return {
    tanggal,
    keterangan: `[OPNAME] ${positif ? 'Lebih' : 'Kurang'} stok ${opname.kode_barang} (${selisih > 0 ? '+' : ''}${selisih} unit)`,
    akun_debit: positif ? persediaan : beban,
    akun_kredit: positif ? beban : persediaan,
    debit: nilai,
    kredit: nilai,
    status: 'pending',
    bukti: opname.id ? String(opname.id) : `OPN-${tanggal.replace(/-/g, '')}`,
  };
}

// Apply an opname adjustment to inventory (set stokAkhir to qty_fisik).
export function applyOpnameToInventory(inv, qty_fisik) {
  const fisik = Number(qty_fisik) || 0;
  const stokAwal = Number(inv.stokAwal) || 0;
  const masuk = Number(inv.masuk) || 0;
  // Adjust `keluar` so stokAkhir == qty_fisik (preserves stokAwal/masuk semantics)
  const keluar = stokAwal + masuk - fisik;
  const nilaiTotal = fisik * Number(inv.hargaSatuan || 0);
  return { ...inv, keluar, stokAkhir: fisik, nilaiTotal };
}
