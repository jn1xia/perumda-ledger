// Month-end adjustment that ties the Buku Besar to the official Neraca of a
// snapshot month (journal ADJ-NRC-ALL-<period>, POST /api/reports/reconcile-ledger).
//
// Rules (live data, November 2026, see tests/reports/ledgerReconcile.test.mjs):
// - A balance is measured the way the Buku Besar shows it (AppContext.computeLedger):
//   saldo awal + (debit − kredit) for asset/expense accounts (1, 5, 6, 8),
//   saldo awal + (kredit − debit) for liabilities, equity and revenue (2, 3, 4, 7).
//   The old code used debit − kredit for every account, which turned liability
//   balances negative and parked twice their amount in Koreksi Ekuitas.
// - Journal books loaded from a lampiran (JV-<YYYY>-<MM>-U<n>) are inside the
//   later official Neraca, so they count. Only journals typed in the app
//   (JV-2026-<n>, JRN-…, vouchers VC-<year>-<nnnn>) float on top of the
//   snapshot, as in every report.
// - Saldo Laba (33xxx) and Laba Periode Berjalan (34xxx) are left alone: the
//   ledger keeps the year's result in the revenue and expense accounts (no
//   closing entries), so the Neraca's split cannot be posted onto them.
// - The net of all adjustments goes to Koreksi Ekuitas (35000).

const JOURNAL_BOOK_RE = /^JV-\d{4}-\d{2}-U\d+$/i;
const NOT_ADJUSTED = /^(33|34)/;

/** True when a journal belongs to what the official Neraca already holds. */
function tiesToSnapshot(id) {
  const s = String(id || '');
  if (/^(JV|JRN|VC)-/i.test(s)) return JOURNAL_BOOK_RE.test(s);
  return true;
}

const isDebitNormal = (code) => /^[1568]/.test(String(code));

/** Balance of `code` (and codes under it) as the Buku Besar shows it. */
function ledgerSaldo(code, saldoAwal, postings) {
  const c = String(code);
  const dn = isDebitNormal(c);
  let s = Number(saldoAwal) || 0;
  for (const p of postings || []) {
    if (!String(p.code || '').startsWith(c)) continue;
    const d = Number(p.debit) || 0, k = Number(p.kredit) || 0;
    s += dn ? d - k : k - d;
  }
  return s;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Adjustment lines for one month.
 * @param coa       posting accounts [{ code, name, saldo_awal }]
 * @param neraca    the month's Neraca rows [{ label, value }]
 * @param postings  posted lines up to the month end, without this month's
 *                  adjustment [{ id, code, debit, kredit }]; lines of journals
 *                  typed in the app (see tiesToSnapshot) are left out here
 * @param alias     COA code → Neraca label (src/utils/reconcileAlias.json)
 * @returns {{ lines: Array<{akun_code, akun_name, debit, kredit, keterangan}>, adjusted: number, plug: number }}
 */
function computeReconcileLines({ coa, neraca, postings, alias = {}, suspenseCode = '35000' }) {
  const byName = new Map();
  for (const r of neraca || []) {
    if (r.value == null) continue;
    const k = norm(r.label);
    if (!byName.has(k)) byName.set(k, Number(r.value));
  }
  const labels = [...byName.keys()];
  const nameCount = {};
  for (const a of coa || []) { const k = norm(a.name); nameCount[k] = (nameCount[k] || 0) + 1; }
  // Alias (by code) first; else the exact name; else the name as the prefix of
  // exactly one Neraca label. Duplicate names are skipped (no guess).
  const target = (a) => {
    const lbl = alias[String(a.code)];
    if (lbl && byName.has(norm(lbl))) return byName.get(norm(lbl));
    const nn = norm(a.name);
    if (nameCount[nn] > 1) return null;
    if (byName.has(nn)) return byName.get(nn);
    const cands = labels.filter(l => l.startsWith(nn));
    if (cands.length === 1) return byName.get(cands[0]);
    // An account with a known Neraca line that this official Neraca leaves out
    // has a balance of 0 there (the lampiran omits empty lines). April 2026:
    // the summary journal put Rp 1.703.166.668 of Pendapatan Diterima Dimuka on
    // 21500, which no Neraca of January–May shows.
    return lbl ? 0 : null;
  };

  const tied = (postings || []).filter(p => p.id == null || tiesToSnapshot(p.id));
  const lines = [];
  for (const a of coa || []) {
    const code = String(a.code);
    if (!/^[123]/.test(code) || code === suspenseCode || NOT_ADJUSTED.test(code)) continue;
    const t = target(a);
    if (t == null) continue;
    const delta = Math.round((t - ledgerSaldo(code, a.saldo_awal, tied)) * 100) / 100;
    if (Math.abs(delta) < 1) continue;
    // Raise a debit-side balance with a debit, a kredit-side balance with a kredit.
    const raiseByDebit = isDebitNormal(code) === (delta > 0);
    lines.push({ akun_code: code, akun_name: a.name,
      debit: raiseByDebit ? Math.abs(delta) : 0, kredit: raiseByDebit ? 0 : Math.abs(delta),
      keterangan: `Penyesuaian ${a.name} ke Neraca` });
  }
  const adjusted = lines.length;
  const dSum = lines.reduce((s, l) => s + l.debit, 0);
  const kSum = lines.reduce((s, l) => s + l.kredit, 0);
  const plug = Math.round((dSum - kSum) * 100) / 100;
  if (adjusted && Math.abs(plug) >= 0.01) {
    const susp = (coa || []).find(a => String(a.code) === suspenseCode) || { code: suspenseCode, name: 'Koreksi Ekuitas' };
    lines.push({ akun_code: susp.code, akun_name: susp.name,
      debit: plug < 0 ? Math.abs(plug) : 0, kredit: plug > 0 ? Math.abs(plug) : 0,
      keterangan: 'Selisih rekonsiliasi (plug)' });
  }
  return { lines, adjusted, plug };
}

module.exports = { computeReconcileLines, tiesToSnapshot, ledgerSaldo, isDebitNormal };
