/**
 * reportDelta.js
 *
 * "Baseline + delta" support for the official Excel-snapshot reports
 * (Neraca, Laba Rugi, Arus Kas, LRA) for the audited months.
 *
 * Those reports render a frozen Excel snapshot so they always match the
 * official lampiran exactly. The downside is that a journal the user enters
 * after the import was NOT reflected. To fix that without losing the exact
 * Excel baseline, we treat user-entered journals as a DELTA that is layered
 * on top of the Excel figures.
 *
 * A journal counts as a user "delta" entry when its id is NOT part of the
 * original Excel/seed import. Imported journals use prefixes XL-, SUM-, ADJ-,
 * CAS-; journals created through the app use JV- / JRN-.
 *
 * ── ROBUST OVERLAY (perbaikan-laporan-juni-2026, Fix Implementation §1) ──
 * The attribution of a journal delta to report lines is done HERE, in pure,
 * importable functions, so that BOTH the React render path (Laporan.jsx /
 * LRA.jsx) and the offline test harness (scripts/explore_overlay_delta.cjs)
 * run the SAME code. Attribution is driven by the STABLE COA account code
 * (not by fragile lower-cased name matching): each delta moves the correct
 * leaf line AND every parent subtotal/total exactly once, in the direction
 * dictated by the account's normal balance, keeping the Neraca balanced and
 * surfacing accounts that have no Excel line as "unmapped" rather than
 * silently dropping them.
 */

import { expandJournals } from './journalExpand.js'
import { effectiveSubCode, isValidAccountCode } from './lraOutline.js'
import lrAliasMap from './lrAlias.json' with { type: 'json' }
import neracaAliasMap from './reconcileAlias.json' with { type: 'json' }

/**
 * Normalize a report line label for matching: trim, collapse whitespace,
 * lower-case. The lampiran labels carry stray double/trailing spaces
 * ("Kas Kecil  - Kantor", "Tanah ") that must not break line attribution.
 */
export function normLabel(label) {
  return String(label || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

const DELTA_ID_RE = /^(JV|JRN)-/i

/**
 * True when a journal was entered by the user (not part of the Excel import).
 * The DB now carries this explicitly as `journals.baseline` (1 = belongs to an
 * audited month's official book, already inside the frozen snapshot; 0 = live
 * user entry) — the id prefix is only a fallback for rows that predate the
 * column (or local sample data). Prefixes are display-only from here on.
 */
export function isDeltaJournal(j) {
  const b = j?.baseline
  if (b !== undefined && b !== null) return !Number(b)
  return DELTA_ID_RE.test(String(j?.id || ''))
}

/**
 * Posted, expanded, user-entered journals. Pass already-period-filtered
 * journals to keep the same period scope as the report (YTD vs MTD).
 */
export function deltaJournals(journals) {
  const delta = (journals || []).filter(j => isDeltaJournal(j) && (j.status === 'posted' || j.status === undefined))
  return expandJournals(delta)
}

/**
 * Extract the COA account code from a journal account string of the form
 * "CODE NAME [> SUBAKUN]".
 *
 * ── Sub-akun re-attribution (perumda full-COA sub-akun picker) ──
 * When the Sub Akun was chosen from the full COA it carries its own leading
 * numeric code (e.g. parent "41000 Pendapatan … > 41008 - Pendapatan Ramayana").
 * In that case the SUB-code (41008) is the real account the line affects, so we
 * return it instead of the parent. The gate is STRICT: the part after " > " must
 * begin with a digit. Existing journals store a free-text NAME after " > " (none
 * start with a digit), so they keep resolving to the parent code and the audited
 * "(2)" reconciliation stays byte-identical.
 */
export function codeOf(acctStr) {
  const s = String(acctStr || '').trim()
  if (!s) return ''
  const parent = s.split(/\s+/)[0] || ''
  const gt = s.indexOf(' > ')
  if (gt >= 0) {
    const sub = s.slice(gt + 3).trim()
    const m = sub.match(/^(\d[\d.]*)/)
    if (m) return m[1]
    // Free-text Sub Akun on a header code (70000/80000): the division journals
    // the real account only in the Sub Akun (incl. PPh as "80000 … > Pajak
    // Penghasilan" → 99999). Same reroute table as lraOutline so every report
    // classifies these identically. Spec §3.3.
    const rerouted = effectiveSubCode(parent, sub)
    if (rerouted) return rerouted
  }
  return parent
}

// ─────────────────────────────────────────────────────────────────────────
// Normal balance & section classification (by stable COA code)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Normal balance of an account class — gives a delta its correct SIGN.
 *   1            → Aset (debit-normal)
 *   2, 3         → Kewajiban / Ekuitas (credit-normal)
 *   4, 7         → Pendapatan (credit-normal)
 *   5, 6, 8, 9   → HPP / Beban / Beban non-ops / Pajak penghasilan (debit-normal)
 * Class 9 (pajak penghasilan) used to be unhandled by the old /^[1568]/ vs
 * /^[2347]/ tests and was mis-signed; it is debit-normal here.
 */
export function isDebitNormal(code) {
  const c = String(code || '')
  if (/^1/.test(c)) return true
  if (/^[23]/.test(c)) return false
  if (/^[47]/.test(c)) return false
  if (/^[5689]/.test(c)) return true
  return true
}

/** Which Neraca section an account belongs to (by code). */
export function neracaSection(code) {
  const c = String(code || '')
  if (/^11/.test(c)) return 'asetLancar'       // kas/bank/piutang/persediaan/dibayar dimuka
  if (/^1[23]/.test(c)) return 'asetTidakLancar' // aset tetap / aset lain
  if (/^2/.test(c)) return 'kewajiban'
  if (/^3/.test(c)) return 'ekuitas'
  return 'laba'                                  // 4/5/6/7/8/9 → "(Laba) Rugi Periode Berjalan"
}

/** Which Arus Kas activity a cash counter-account belongs to (by code). */
export function arusKasActivity(counterCode) {
  const c = String(counterCode || '')
  // Division format (lampiran Arus Kas): "investasi" is ONLY the gross fixed /
  // intangible asset additions; Aset Dalam Penyelesaian (12300) sits in the
  // OPERASI section ("Perubahan di dalam Aset dan Kewajiban"). Spec §7.
  if (/^123/.test(c)) return 'operasi'                 // Aset Dalam Penyelesaian
  if (/^1[23]/.test(c)) return 'investasi'             // fixed/intangible asset
  if (/^22/.test(c) || /^3/.test(c)) return 'pendanaan' // utang bank / modal
  return 'operasi'                                      // expenses, revenue, receivables, tax, payables
}

// ─────────────────────────────────────────────────────────────────────────
// Code → exact Excel line label resolution (preferred over name matching)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Resolve a COA code to its Laba Rugi line label.
 * Tries the exact code, then the sub-group (child → parent, e.g. 62013→62010,
 * 61012→61010), then the account class (41/42). Returns null when unmapped.
 */
export function lrLineForCode(code) {
  const c = String(code || '')
  if (lrAliasMap[c]) return lrAliasMap[c]
  const group = c.length >= 5 ? c.slice(0, 4) + '0' : c
  if (lrAliasMap[group]) return lrAliasMap[group]
  if (lrAliasMap[c.slice(0, 2)]) return lrAliasMap[c.slice(0, 2)]
  return null
}

/** Resolve a COA code to its Neraca line label (exact code match). */
export function neracaLineForCode(code) {
  const c = String(code || '')
  return neracaAliasMap[c] || null
}

// ─────────────────────────────────────────────────────────────────────────
// Single-pass attribution of a set of delta journals
// ─────────────────────────────────────────────────────────────────────────

/**
 * Attribute a set of (already expanded) delta journals to report sections,
 * leaves and activities — by stable COA code and normal-balance sign — in a
 * single pass. Each journal leg moves its own account in its natural
 * direction; parents/totals are derived from the section sums so a total is
 * always the sum of its leaves (no double-count). Accounts with no Excel line
 * are tracked as "unmapped" instead of being silently dropped.
 */
export function attributeDelta(journals) {
  const lrLeaf = {}, nLeaf = {}, nLeafMeta = {}
  const lrSec = { pendUsaha: 0, bpp: 0, admin: 0, ops: 0, pendLain: 0, bebanNonOps: 0, pajak: 0, penyusutan: 0, bunga: 0, pajakBank: 0, unmappedPendUsaha: 0, unmappedAdmin: 0, unmappedOps: 0 }
  const nSec = { asetLancar: 0, asetTidakLancar: 0, kewajiban: 0, ekuitasDirect: 0, pl: 0, plByMonth: {}, unmappedAsetLancar: 0, unmappedAsetTidakLancar: 0 }
  const ak = { operasi: 0, investasi: 0, pendanaan: 0, cash: 0 }
  const unmapped = []
  const add = (m, k, v) => { if (k) m[normLabel(k)] = (m[normLabel(k)] || 0) + v }

  const legs = []
  for (const j of (journals || [])) {
    if (j.debit) legs.push({ j, code: codeOf(j.akun_debit), amt: j.debit, side: 'D' })
    if (j.kredit) legs.push({ j, code: codeOf(j.akun_kredit), amt: j.kredit, side: 'K' })
  }

  // Stable per-journal group key. `expandJournals` splits a multi-line journal
  // into one-sided half-records that all share `_expandedFrom` (the original
  // journal id); single-line / legacy journals are not expanded and their two
  // legs reference the SAME journal object (so the object itself is a safe key).
  const journalKey = (j) => (j && j._expandedFrom != null ? j._expandedFrom : (j && j.id != null ? j.id : j))

  for (const leg of legs) {
    const c = leg.code
    // A value that is not a well-formed account code (typically a bank ACCOUNT
    // NUMBER typed into "No. Akun", e.g. 511473) must never be classified by
    // prefix — /^51/ would file it under Beban Pokok. Park it as unmapped so the
    // amount stays visible for correction instead of corrupting a report line.
    if (c && !isValidAccountCode(c)) {
      unmapped.push({ report: 'kode', section: 'KodeTidakValid', code: c, amt: leg.amt, keterangan: leg.j.keterangan })
      continue
    }
    // natural-direction movement of THIS account
    const natural = (leg.side === 'D' ? (isDebitNormal(c) ? +1 : -1) : (isDebitNormal(c) ? -1 : +1)) * leg.amt

    // Resolve a P/L leaf by code; when unmapped, fold the amount into the
    // section's "unmapped" accumulator (so a visible "(Belum Terpetakan)" leaf
    // can carry it later) and flag it on the `unmapped` list. This keeps a
    // section's JUMLAH == Σ of its visible leaves even for accounts with no
    // Excel detail line.
    const lrLeafOr = (secKey) => {
      const lbl = lrLineForCode(c)
      if (lbl) add(lrLeaf, lbl, natural)
      else { lrSec['unmapped' + secKey] += natural; unmapped.push({ report: 'labaRugi', section: secKey, code: c, amt: natural, keterangan: leg.j.keterangan }) }
    }

    // — Laba Rugi (P/L classes 4,5,6,7,8,9) —
    if (/^4/.test(c)) { lrSec.pendUsaha += natural; lrLeafOr('PendUsaha') }
    else if (/^51/.test(c)) { lrSec.bpp += natural; add(lrLeaf, lrLineForCode(c), natural) }
    else if (/^61/.test(c)) {
      lrSec.admin += natural; lrLeafOr('Admin')
      if (/^6113/.test(c)) lrSec.penyusutan += natural
    }
    // 62110 Beban PPN dan PPH → the pajak bucket, same as the 99999 PPh
    // reroute. Reklasifikasi (buku Juni v2) moved the ACCOUNT into Beban
    // Operasional, but the division's EBITDA convention is unchanged
    // (confirmed Bu Nisha 21-07: EBITDA Juni tetap 333.012.664): the
    // "Beban PPN dan PPH" row — wherever booked — IS added back in EBITDA
    // (Excel J81 = …+J53). ops = s.ops + pajak keeps the row inside
    // Jumlah Beban Operasional, so subtotals are identical either way.
    else if (/^62110/.test(c)) { lrSec.pajak += natural; add(lrLeaf, lrLineForCode(c), natural) }
    else if (/^62/.test(c)) { lrSec.ops += natural; lrLeafOr('Ops') }
    else if (/^7/.test(c)) { lrSec.pendLain += natural; add(lrLeaf, lrLineForCode(c), natural); if (/^70001/.test(c)) lrSec.bunga += natural }
    else if (/^8/.test(c)) { lrSec.bebanNonOps += natural; add(lrLeaf, lrLineForCode(c), natural); if (/^80001/.test(c)) lrSec.pajakBank += natural }
    else if (/^9/.test(c)) { lrSec.pajak += natural; add(lrLeaf, lrLineForCode(c), natural) }

    // — Neraca — (nLeafMeta remembers the display label + section per line so
    // buildNeracaRows can EMIT a new leaf row when the baseline month has no
    // row for it — e.g. May's snapshot has no "Biaya yang Masih Harus Dibayar"
    // row because May's balance was 0, but June credits it 488.840.600.)
    const sec = neracaSection(c)
    const remember = (lbl) => { if (lbl) nLeafMeta[normLabel(lbl)] = { label: lbl, section: sec } }
    if (sec === 'asetLancar') { nSec.asetLancar += natural; const lbl = neracaLineForCode(c); if (lbl) { add(nLeaf, lbl, natural); remember(lbl) } else { nSec.unmappedAsetLancar += natural; unmapped.push({ report: 'neraca', code: c, amt: natural, keterangan: leg.j.keterangan }) } }
    else if (sec === 'asetTidakLancar') { nSec.asetTidakLancar += natural; const lbl = neracaLineForCode(c); if (lbl) { add(nLeaf, lbl, natural); remember(lbl) } else { nSec.unmappedAsetTidakLancar += natural; unmapped.push({ report: 'neraca', code: c, amt: natural, keterangan: leg.j.keterangan }) } }
    else if (sec === 'kewajiban') { nSec.kewajiban += natural; const lbl = neracaLineForCode(c); add(nLeaf, lbl, natural); remember(lbl) }
    else if (sec === 'ekuitas') { nSec.ekuitasDirect += natural; const lbl = neracaLineForCode(c); add(nLeaf, lbl, natural); remember(lbl) }
    else {
      // P/L → "(Laba) Rugi Periode Berjalan". Also bucketed per month so the
      // Neraca overlay can roll earlier months' results into "Saldo Laba (Rugi)
      // Periode Lalu" (division convention: berjalan = CURRENT month only).
      const plAmt = (/^[47]/.test(c) ? natural : -natural)
      nSec.pl += plAmt
      const ym = String(leg.j.tanggal || '').slice(0, 7)
      nSec.plByMonth[ym] = (nSec.plByMonth[ym] || 0) + plAmt
    }
  }

  // — Arus Kas: classify each journal's NET cash movement by its NON-cash legs —
  // A cash leg (111x) cannot be classified by reading the counter-account off
  // its OWN record: `expandJournals` splits a multi-line journal into one-sided
  // half-records, so the cash half's `akun_kredit`/`akun_debit` is '' and naive
  // per-leg classification collapses everything into 'operasi'. Instead we group
  // the legs back by their originating journal, net the cash legs, and attribute
  // that net movement across activities according to the journal's NON-cash legs
  // (split proportionally by amount when they span several activities). A.ak.cash
  // (the net total) is identical to the simple sum either way, so the bottom
  // line is preserved; only the activity split is made correct.
  //
  // Single-line journals group to a single key with exactly one non-cash leg, so
  // they classify exactly as before (counter-account drives the activity).
  const byJournal = new Map()
  for (const leg of legs) {
    const k = journalKey(leg.j)
    if (!byJournal.has(k)) byJournal.set(k, [])
    byJournal.get(k).push(leg)
  }
  const AK_ORDER = ['operasi', 'investasi', 'pendanaan']
  for (const grp of byJournal.values()) {
    const cashLegs = grp.filter(l => /^111/.test(l.code))
    if (!cashLegs.length) continue
    const netCash = cashLegs.reduce((s, l) => s + (l.side === 'D' ? +l.amt : -l.amt), 0)
    ak.cash += netCash
    if (!netCash) continue

    // Weight the journal's non-cash legs by activity (by amount).
    const weight = { operasi: 0, investasi: 0, pendanaan: 0 }
    let totalW = 0
    for (const l of grp) {
      if (/^111/.test(l.code)) continue
      weight[arusKasActivity(l.code)] += l.amt
      totalW += l.amt
    }

    if (totalW <= 0) {
      // KNOWN LIMITATION: some compound entries were imported as SEPARATE journal
      // ids (one leg each), so a cash leg can have no non-cash sibling to classify
      // by. Keep the historical fallback (operasi) rather than crash or try to
      // heuristically re-pair distinct journal ids.
      ak.operasi += netCash
      continue
    }

    // Split the net cash across the touched activities proportionally by weight.
    // The last touched activity absorbs the rounding remainder so the parts sum
    // back to netCash exactly (keeping A.ak.cash == operasi+investasi+pendanaan).
    const touched = AK_ORDER.filter(a => weight[a] > 0)
    let assigned = 0
    touched.forEach((a, i) => {
      const share = (i === touched.length - 1) ? (netCash - assigned) : (netCash * weight[a] / totalW)
      assigned += share
      ak[a] += share
    })
  }
  return { lrLeaf, nLeaf, nLeafMeta, lrSec, nSec, ak, unmapped }
}

// ─────────────────────────────────────────────────────────────────────────
// Report builders — overlay a set of delta journals on baseline Excel rows
// ─────────────────────────────────────────────────────────────────────────

const isLrTotal = (label) => {
  const u = String(label || '').toUpperCase()
  return u.includes('JUMLAH') || u.includes('JUMAH') || u.startsWith('LABA') || u.startsWith('EBITDA')
}

/**
 * Overlay delta onto baseline Laba Rugi rows ([{ label, value, ... }]).
 * Totals are derived from section sums; leaves move by code-resolved label.
 */
/**
 * Compose Laba Rugi totals from section sums — division June-2026 layout:
 * PPh badan is presented INSIDE "Jumlah Beban Operasional dan Bisnis" as the
 * row "Beban PPN dan PPH" (lampiran J53) and the tax row below laba-sebelum-
 * pajak shows 0 — so "sebelum pajak" already includes the tax and
 * setelahPajak == sebelumPajak. EBITDA = J79 − J62 + J67 + J38 + J53 (lampiran
 * J81) — adds back depreciation, bank tax AND the PPh line. Both this and the
 * legacy tax-row placement yield identical setelahPajak/EBITDA; only the
 * subtotal placement differs, and June's official book uses this one.
 */
export function composeLabaRugi(s) {
  const pendUsaha = s.pendUsaha, bpp = s.bpp, admin = s.admin
  const pendLain = s.pendLain, bebanNonOps = s.bebanNonOps, pajak = s.pajak
  const ops = s.ops + pajak                      // "Beban PPN dan PPH" row lives here
  const bruto = pendUsaha - bpp
  const bebanUsaha = admin + ops
  const labaUsaha = bruto - bebanUsaha
  const netLainLain = pendLain - bebanNonOps
  const sebelumPajak = labaUsaha + netLainLain   // already net of PPh (June layout)
  const setelahPajak = sebelumPajak              // tax row shows 0
  const ebitda = setelahPajak - s.bunga + s.pajakBank + s.penyusutan + pajak
  return { pendUsaha, bpp, bruto, admin, ops, bebanUsaha, labaUsaha, pendLain, bebanNonOps, netLainLain, sebelumPajak, setelahPajak, pajak, ebitda }
}

export function buildLabaRugiRows(baseRows, journals) {
  if (!journals || !journals.length) return (baseRows || []).map(r => ({ ...r }))
  const A = attributeDelta(journals)
  const c = composeLabaRugi(A.lrSec)
  const totalMap = [
    ['JUMLAH PENDAPATAN USAHA', c.pendUsaha],
    ['JUMLAH BEBAN POKOK PENJUALAN', c.bpp],
    ['LABA (RUGI) BRUTO', c.bruto],
    ['JUMLAH BEBAN UMUM DAN ADMINISTRASI', c.admin],
    ['BEBAN OPERASIONAL DAN BISNIS', c.ops],
    ['BEBAN USAHA', c.bebanUsaha],
    ['LABA (RUGI) USAHA', c.labaUsaha],
    ['JUMLAH PENDAPATAN LAIN-LAIN', c.pendLain],
    ['BEBAN NON OPERASIONAL', c.bebanNonOps],
    ['JUMLAH PENDAPATAN DAN (BEBAN LAIN-LAIN)', c.netLainLain],
    ['BERSIH SEBELUM PAJAK', c.sebelumPajak],
    ['BERSIH SETELAH PAJAK', c.setelahPajak],
    ['EBITDA', c.ebitda],
  ]
  // A section's JUMLAH may include an amount from an account that has no Excel
  // detail line (unmapped). To keep JUMLAH == Σ of its visible leaves, emit a
  // "(Belum Terpetakan)" leaf carrying that amount, inserted just before the
  // matching subtotal. Only emitted when nonzero, so reports with no unmapped
  // delta stay byte-identical to before.
  // The PPh delta is carried inside the ops subtotal ("Beban PPN dan PPH" row,
  // June lampiran layout). When the baseline has no such row, emit one so the
  // subtotal still equals the sum of its visible leaves.
  const hasPphRow = (baseRows || []).some(r => normLabel(r.label) === 'beban ppn dan pph')
  // The PPN/PPH row can carry BOTH the 99999 PPh-badan reroute (c.pajak) and
  // 62110 opex postings — the leaf accumulator has the combined amount, so use
  // it (not c.pajak alone) when the baseline lacks the row.
  const pphLeafAmt = A.lrLeaf[normLabel('Beban PPN dan PPH')] || 0
  const unmappedLeaf = [
    { kw: 'JUMLAH PENDAPATAN USAHA', amt: A.lrSec.unmappedPendUsaha || 0, label: 'Pendapatan Usaha Lainnya (Belum Terpetakan)' },
    { kw: 'JUMLAH BEBAN UMUM DAN ADMINISTRASI', amt: A.lrSec.unmappedAdmin || 0, label: 'Beban Umum dan Administrasi Lainnya (Belum Terpetakan)' },
    { kw: 'BEBAN OPERASIONAL DAN BISNIS', amt: A.lrSec.unmappedOps || 0, label: 'Beban Operasional dan Bisnis Lainnya (Belum Terpetakan)' },
    { kw: 'BEBAN OPERASIONAL DAN BISNIS', amt: hasPphRow ? 0 : pphLeafAmt, label: 'Beban PPN dan PPH' },
  ]
  const out = []
  for (const r of (baseRows || [])) {
    const row = { ...r }
    const upper = String(r.label || '').toUpperCase()
    if (isLrTotal(r.label)) {
      for (const extra of unmappedLeaf.filter(u => u.amt && upper.includes(u.kw)))
        out.push({ ...r, label: extra.label, value: extra.amt, _delta: extra.amt, _unmapped: extra.label !== 'Beban PPN dan PPH' })
      const hit = totalMap.find(([kw]) => upper.includes(kw))
      if (hit) { row.value = (row.value || 0) + hit[1]; if (hit[1]) row._delta = hit[1] }
      out.push(row)
      continue
    }
    if (r.value == null) { out.push(row); continue }
    const leafDelta = A.lrLeaf[normLabel(r.label)]
    if (leafDelta != null) { row.value = (row.value || 0) + leafDelta; row._delta = leafDelta }
    out.push(row)
  }
  return out
}

/**
 * Overlay delta onto baseline Neraca rows. Subtotals (Aset Lancar / Tidak
 * Lancar) and grand totals are derived from the same section sums as the
 * leaves so the sheet stays internally consistent and balanced.
 *
 * Equity roll-forward (division convention, lampiran NERACA I72/I73):
 *   SaldoLabaPeriodeLalu(view) = SaldoLalu(baseline) + Berjalan(baseline)
 *                                + Σ P/L of journal months BEFORE the view month
 *   (Laba) Rugi Periode Berjalan(view) = P/L of the view month ONLY
 * Applied when opts { baseYM, viewYM } are given and viewYM > baseYM (i.e. the
 * baseline snapshot is an EARLIER month). Without opts — or when the view IS
 * the baseline month (small JV corrections on an audited month) — the old
 * behavior stands: the whole P/L delta lands on the "berjalan" row. Total
 * ekuitas is identical either way; only the split between the two lines moves.
 */
export function buildNeracaRows(baseRows, journals, opts = {}) {
  if (!journals || !journals.length) return (baseRows || []).map(r => ({ ...r }))
  const A = attributeDelta(journals)
  const lancar = A.nSec.asetLancar, tidakLancar = A.nSec.asetTidakLancar
  const aset = lancar + tidakLancar
  const kewajiban = A.nSec.kewajiban
  const ekuitas = A.nSec.ekuitasDirect + A.nSec.pl
  const unmappedLancar = A.nSec.unmappedAsetLancar || 0
  const unmappedTidakLancar = A.nSec.unmappedAsetTidakLancar || 0

  // Equity roll-forward split
  const { baseYM, viewYM } = opts
  const rollforward = !!(baseYM && viewYM && viewYM > baseYM)
  let plCurrent = A.nSec.pl, plOlder = 0, baseBerjalan = 0
  if (rollforward) {
    plCurrent = 0; plOlder = 0
    for (const [ym, v] of Object.entries(A.nSec.plByMonth || {})) {
      if (ym === viewYM) plCurrent += v
      else plOlder += v            // deltas on baseline/interim months roll into saldo lalu
    }
    const bRow = (baseRows || []).find(r => /berjalan/i.test(String(r.label || '')) && r.value != null)
    baseBerjalan = bRow ? (bRow.value || 0) : 0
  }

  // Leaf lines with a KNOWN label but no row in the baseline month (e.g. May's
  // snapshot omits "Biaya yang Masih Harus Dibayar" because its May balance was
  // 0, yet June credits it 488.840.600): emit them as new rows just before
  // their section total so every total == Σ of its visible leaves.
  const baseNorm = new Set((baseRows || []).map(r => normLabel(r.label)))
  const missing = { asetLancar: [], asetTidakLancar: [], kewajiban: [], ekuitas: [] }
  for (const [key, delta] of Object.entries(A.nLeaf)) {
    if (!delta || baseNorm.has(key)) continue
    const meta = A.nLeafMeta[key]
    if (meta && missing[meta.section]) missing[meta.section].push({ label: meta.label, value: delta })
  }
  const emitMissing = (list, lastLeafDepth, out) => {
    for (const m of list.splice(0)) out.push({ label: m.label, value: m.value, depth: lastLeafDepth, _delta: m.value })
  }

  let lastLeafDepth = 0
  // Running sum of leaf deltas since the last subtotal — feeds the Neraca's
  // intermediate "Nilai Buku" rows (properti investasi / aset tetap groups)
  // so they stay equal to the sum of the leaves above them.
  let runningDelta = 0
  const out = []
  for (const r of (baseRows || [])) {
    const row = { ...r }
    const label = String(r.label || ''), upper = label.toUpperCase()
    if (r.value == null) { out.push(row); continue }
    if (/jumlah aset lancar/i.test(label)) {
      // Visible leaf carrying any current-asset amount with no Excel line, so
      // "Jumlah Aset Lancar" == Σ of its visible leaves (and the sheet still
      // balances, since the grand total already includes this amount).
      emitMissing(missing.asetLancar, lastLeafDepth, out)
      if (unmappedLancar) out.push({ ...r, label: 'Aset Lancar Lainnya (Belum Terpetakan)', value: unmappedLancar, depth: lastLeafDepth, _delta: unmappedLancar, _unmapped: true })
      row.value += lancar; if (lancar) row._delta = lancar; runningDelta = 0; out.push(row); continue
    }
    if (/jumlah aset tidak lancar/i.test(label)) {
      emitMissing(missing.asetTidakLancar, lastLeafDepth, out)
      if (unmappedTidakLancar) out.push({ ...r, label: 'Aset Tidak Lancar Lainnya (Belum Terpetakan)', value: unmappedTidakLancar, depth: lastLeafDepth, _delta: unmappedTidakLancar, _unmapped: true })
      row.value += tidakLancar; if (tidakLancar) row._delta = tidakLancar; runningDelta = 0; out.push(row); continue
    }
    if (upper.startsWith('JUMLAH ')) {
      if (upper.includes('KEWAJIBAN DAN')) row.value += kewajiban + ekuitas
      else if (upper.includes('ASET')) row.value += aset
      else if (upper.includes('KEWAJIBAN')) { emitMissing(missing.kewajiban, lastLeafDepth, out); row.value += kewajiban }
      else if (upper.includes('EKUITAS')) { emitMissing(missing.ekuitas, lastLeafDepth, out); row.value += ekuitas }
      runningDelta = 0
      out.push(row); continue
    }
    if (/^nilai buku/i.test(normLabel(label))) {
      row.value += runningDelta; if (runningDelta) row._delta = runningDelta
      runningDelta = 0
      out.push(row); continue
    }
    if (/periode lalu/i.test(label) && rollforward) {
      // Roll the baseline month's own result (and any interim months) forward.
      const shift = baseBerjalan + plOlder + (A.nLeaf[normLabel(label)] || 0)
      row.value += shift; if (shift) row._delta = shift
      lastLeafDepth = row.depth || 0; out.push(row); continue
    }
    if (/berjalan/i.test(label)) {
      if (rollforward) {
        // Replace: berjalan = current-month result only (baseline's rolled away).
        const delta = plCurrent - baseBerjalan
        row.value = plCurrent; if (delta) row._delta = delta
      } else {
        row.value += A.nSec.pl; if (A.nSec.pl) row._delta = A.nSec.pl
      }
      lastLeafDepth = row.depth || 0; out.push(row); continue
    }
    const leafDelta = A.nLeaf[normLabel(label)]
    if (leafDelta != null) { row.value += leafDelta; row._delta = leafDelta; runningDelta += leafDelta }
    lastLeafDepth = row.depth || 0
    out.push(row)
  }
  return out
}

/**
 * Overlay delta onto baseline Arus Kas rows. The cash impact is classified
 * into the correct activity (Operasi/Investasi/Pendanaan) by the counter
 * account, and the net change / ending cash move by the total cash delta.
 */
export function buildArusKasRows(baseRows, journals) {
  if (!journals || !journals.length) return (baseRows || []).map(r => ({ ...r }))
  const A = attributeDelta(journals)
  const { operasi, investasi, pendanaan, cash } = A.ak
  return (baseRows || []).map(r => {
    const out = { ...r }
    const l = String(r.label || '')
    if (/Diperoleh dari\s+Aktivitas Operasi/i.test(l)) { out.value = (out.value || 0) + operasi; if (operasi) out._delta = operasi }
    else if (/Digunakan untuk\s+Aktivitas Investasi/i.test(l)) { out.value = (out.value || 0) + investasi; if (investasi) out._delta = investasi }
    else if (/Aktivitas Pendanaan/i.test(l) && /Diperoleh|Digunakan/i.test(l)) { out.value = (out.value || 0) + pendanaan; if (pendanaan) out._delta = pendanaan }
    else if (/kenaikan|akhir periode/i.test(l)) { out.value = (out.value || 0) + cash; if (cash) out._delta = cash }
    return out
  })
}

/**
 * Build the division-format INDIRECT-method Arus Kas for journal-mode months
 * (lampiran ARUS KAS layout, spec §7):
 *   laba sebelum pajak + penyusutan + Δ working capital → operasi
 *   −Δ gross fixed assets → investasi ; utang bank / modal → pendanaan
 * Working-capital / asset lines all reduce to −(D−K movement) of the account:
 * an asset decrease and a liability increase are both cash inflows. Movements
 * on accounts not covered by any line are surfaced as one "Penyesuaian
 * Lainnya" row (operasi) so the statement ALWAYS ties: kasAkhir == kasAwal +
 * actual net cash movement — the workbook's own D44=0 check.
 *
 * @param journals  expanded, posted journals of the period (journal-mode months)
 * @param labaSebelumPajak  P/L result per the June layout (already net of PPh)
 * @param penyusutan  depreciation expense of the period (add-back)
 * @param pajakRow  amount shown on the L/R tax row (0 in the June layout)
 * @param kasAwal  cash & bank total at the start of the period
 */
export function buildArusKasIndirectRows({ journals, labaSebelumPajak = 0, penyusutan = 0, pajakRow = 0, kasAwal = 0 }) {
  const mov = {}
  for (const j of (journals || [])) {
    if (j.debit) { const c = codeOf(j.akun_debit); if (c) mov[c] = (mov[c] || 0) + j.debit }
    if (j.kredit) { const c = codeOf(j.akun_kredit); if (c) mov[c] = (mov[c] || 0) - j.kredit }
  }
  const m = (codes) => (Array.isArray(codes) ? codes : [codes]).reduce((s, c) => s + (mov[c] || 0), 0)
  // Division line = −(net D−K movement): asset decrease / liability increase = cash in.
  const line = (codes) => -m(codes)

  const WC = [
    ['Piutang Usaha', ['11201', '11202', '11203']],
    ['Perlengkapan', ['11301']],
    ['Aset dalam penyelesaian', ['12300']],
    ['Persediaan Barang Dagang (Bahan Pokok)', ['11401']],
    ['Persediaan Barang Dagang (Gas LPG)', ['11402']],
    ['BBM Dibayar di Muka', ['11501', '11502']],
    ['Utang Usaha', ['21200', '21001']],
    ['Utang Daerah', ['22300', '21002']],
    ['Biaya yang Masih Harus Dibayar', ['21500']],
    ['Pendapatan Diterima Dimuka', ['21600', '21003']],
  ]
  const INVESTASI_TETAP = ['12101', '12102.1', '12201.1', '12202.1', '12203.1', '12204.1']
  const INVESTASI_ATB = ['13101.1', '13200']
  const PENDANAAN_BANK = ['22100', '22001', '22200']
  const PENDANAAN_MODAL = ['31000', '32000']

  const wcRows = WC.map(([label, codes]) => ({ label, value: line(codes) }))
  const pajakLine = -(pajakRow || 0)
  const beliAset = line(INVESTASI_TETAP)
  const beliATB = line(INVESTASI_ATB)
  const utangBank = line(PENDANAAN_BANK)
  const setorModal = line(PENDANAAN_MODAL)

  let operasi = labaSebelumPajak + penyusutan + pajakLine + wcRows.reduce((s, r) => s + r.value, 0)
  const investasi = beliAset + beliATB
  const pendanaan = utangBank + setorModal

  // Tie to the actual cash movement; park any uncovered account movement in
  // one visible adjustment row instead of silently un-tying the statement.
  const cash = Object.entries(mov).reduce((s, [c, v]) => s + (String(c).startsWith('111') ? v : 0), 0)
  const residual = cash - (operasi + investasi + pendanaan)
  const residualRow = Math.abs(residual) > 0.005 ? { label: 'Penyesuaian Lainnya', value: residual } : null
  if (residualRow) operasi += residual

  const kenaikan = operasi + investasi + pendanaan
  const kasAkhir = kasAwal + kenaikan

  const rows = [
    { label: 'Arus Kas dari Aktivitas Operasi', value: null, header: true },
    { label: 'Laba (Rugi) Sebelum Pajak', value: labaSebelumPajak },
    { label: 'Penyusutan Aset Tetap', value: penyusutan },
    { label: 'Perubahan di dalam Aset dan Kewajiban:', value: null, header: true },
    ...wcRows.slice(0, 9),
    { label: 'Pajak Penghasilan', value: pajakLine },
    ...wcRows.slice(9),
    ...(residualRow ? [residualRow] : []),
    { label: 'Arus Kas Diperoleh dari Aktivitas Operasi', value: operasi, subtotal: true },
    { label: 'Arus Kas dari Aktivitas Investasi', value: null, header: true },
    { label: 'Pembelian Aset Tetap', value: beliAset },
    { label: 'Pengadaan Aset Tidak Berwujud', value: beliATB },
    { label: 'Arus Kas Digunakan untuk Aktivitas Investasi', value: investasi, subtotal: true },
    { label: 'Arus Kas dari Aktivitas Pendanaan', value: null, header: true },
    { label: 'Utang Bank', value: utangBank },
    { label: 'Penyetoran Modal', value: setorModal },
    { label: 'Arus Kas Diperoleh dari (Digunakan untuk) Aktivitas Pendanaan', value: pendanaan, subtotal: true },
    { label: 'Kenaikan (Penurunan) Bersih Kas dan Setara Kas', value: kenaikan, subtotal: true },
    { label: 'Kas dan Setara Kas Periode Sebelumnya', value: kasAwal },
    { label: 'Kas dan Setara Kas Akhir Periode', value: kasAkhir, subtotal: true },
  ]
  return { rows, operasi, investasi, pendanaan, kenaikan, kasAwal, kasAkhir, residual, cash }
}

// ─────────────────────────────────────────────────────────────────────────
// Legacy bucket helpers (kept for callers that still use them)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Net movement for accounts whose code starts with `prefix`.
 * isDebit=true  -> debit-normal accounts (assets, expenses): debit − kredit
 * isDebit=false -> credit-normal accounts (liab, equity, revenue): kredit − debit
 */
export function deltaByPrefix(expandedDelta, prefix, isDebit) {
  return (expandedDelta || []).reduce((sum, j) => {
    const primaryCode = codeOf(isDebit ? j.akun_debit : j.akun_kredit)
    const primaryAmt = isDebit ? (j.debit || 0) : (j.kredit || 0)
    const offsetCode = codeOf(isDebit ? j.akun_kredit : j.akun_debit)
    const offsetAmt = isDebit ? (j.kredit || 0) : (j.debit || 0)
    let s = sum
    if (primaryCode.startsWith(prefix)) s += primaryAmt
    if (offsetCode.startsWith(prefix)) s -= offsetAmt
    return s
  }, 0)
}

/** Net cash (111) movement: +inflow (debit) − outflow (kredit). 112=Piutang is NOT cash. */
export function deltaCash(expandedDelta) {
  return (expandedDelta || []).reduce((sum, j) => {
    const dc = codeOf(j.akun_debit)
    const kc = codeOf(j.akun_kredit)
    let s = sum
    if (dc.startsWith('111')) s += (j.debit || 0)
    if (kc.startsWith('111')) s -= (j.kredit || 0)
    return s
  }, 0)
}

/** Net delta per account NAME (lower-cased, trimmed) for best-effort line matching. */
export function deltaByName(expandedDelta) {
  const map = {}
  const add = (acctStr, amt, sign) => {
    if (!acctStr || !amt) return
    let name = acctStr.replace(/^\S+\s*-?\s*/, '').split(' > ')[0].trim()
    if (!name) name = acctStr.trim()
    const key = name.toLowerCase()
    map[key] = (map[key] || 0) + sign * amt
  }
  ;(expandedDelta || []).forEach(j => {
    const dCode = codeOf(j.akun_debit)
    const kCode = codeOf(j.akun_kredit)
    if (j.debit) add(j.akun_debit, j.debit, isDebitNormal(dCode) ? +1 : -1)
    if (j.kredit) add(j.akun_kredit, j.kredit, isDebitNormal(kCode) ? -1 : +1)
  })
  return map
}

/**
 * Overlay name-matched deltas onto a copy of Excel ref rows ({ label, value }).
 */
export function overlayByName(refRows, nameMap) {
  let matched = 0
  const used = {}
  const rows = (refRows || []).map(r => {
    const label = String(r.label || '')
    const upper = label.toUpperCase()
    const isTotalish = upper.includes('JUMLAH') || upper.includes('JUMAH') || upper.startsWith('LABA') || upper.includes('EBITDA')
    if (r.value == null || isTotalish) return { ...r }
    const key = label.toLowerCase().trim()
    if (nameMap[key] != null && !used[key]) {
      used[key] = true
      matched += nameMap[key]
      return { ...r, value: r.value + nameMap[key], _delta: nameMap[key] }
    }
    return { ...r }
  })
  return { rows, matched, used }
}

export const fmtSigned = (n, formatRupiah) =>
  (n >= 0 ? '+' : '−') + formatRupiah(Math.abs(n))
