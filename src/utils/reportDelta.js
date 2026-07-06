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
import lrAliasMap from './lrAlias.json' with { type: 'json' }
import neracaAliasMap from './reconcileAlias.json' with { type: 'json' }

const DELTA_ID_RE = /^(JV|JRN)-/i

/** True when a journal was entered by the user (not part of the Excel import). */
export function isDeltaJournal(j) {
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
  const gt = s.indexOf(' > ')
  if (gt >= 0) {
    const sub = s.slice(gt + 3).trim()
    const m = sub.match(/^(\d[\d.]*)/)
    if (m) return m[1]
  }
  return s.split(/\s+/)[0] || ''
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
  const lrLeaf = {}, nLeaf = {}
  const lrSec = { pendUsaha: 0, bpp: 0, admin: 0, ops: 0, pendLain: 0, bebanNonOps: 0, pajak: 0, penyusutan: 0, bunga: 0, pajakBank: 0, unmappedPendUsaha: 0, unmappedAdmin: 0, unmappedOps: 0 }
  const nSec = { asetLancar: 0, asetTidakLancar: 0, kewajiban: 0, ekuitasDirect: 0, pl: 0, unmappedAsetLancar: 0, unmappedAsetTidakLancar: 0 }
  const ak = { operasi: 0, investasi: 0, pendanaan: 0, cash: 0 }
  const unmapped = []
  const add = (m, k, v) => { if (k) m[k] = (m[k] || 0) + v }

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
    else if (/^51/.test(c)) { lrSec.bpp += natural }
    else if (/^61/.test(c)) {
      lrSec.admin += natural; lrLeafOr('Admin')
      if (/^6113/.test(c)) lrSec.penyusutan += natural
    }
    else if (/^62/.test(c)) { lrSec.ops += natural; lrLeafOr('Ops') }
    else if (/^7/.test(c)) { lrSec.pendLain += natural; if (/^70001/.test(c)) lrSec.bunga += natural }
    else if (/^8/.test(c)) { lrSec.bebanNonOps += natural; if (/^80001/.test(c)) lrSec.pajakBank += natural }
    else if (/^9/.test(c)) { lrSec.pajak += natural; add(lrLeaf, lrLineForCode(c), natural) }

    // — Neraca —
    const sec = neracaSection(c)
    if (sec === 'asetLancar') { nSec.asetLancar += natural; const lbl = neracaLineForCode(c); if (lbl) add(nLeaf, lbl, natural); else { nSec.unmappedAsetLancar += natural; unmapped.push({ report: 'neraca', code: c, amt: natural, keterangan: leg.j.keterangan }) } }
    else if (sec === 'asetTidakLancar') { nSec.asetTidakLancar += natural; const lbl = neracaLineForCode(c); if (lbl) add(nLeaf, lbl, natural); else { nSec.unmappedAsetTidakLancar += natural; unmapped.push({ report: 'neraca', code: c, amt: natural, keterangan: leg.j.keterangan }) } }
    else if (sec === 'kewajiban') { nSec.kewajiban += natural; add(nLeaf, neracaLineForCode(c), natural) }
    else if (sec === 'ekuitas') { nSec.ekuitasDirect += natural; add(nLeaf, neracaLineForCode(c), natural) }
    else { nSec.pl += (/^[47]/.test(c) ? natural : -natural) } // P/L → "(Laba) Rugi Periode Berjalan"
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
  return { lrLeaf, nLeaf, lrSec, nSec, ak, unmapped }
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
export function buildLabaRugiRows(baseRows, journals) {
  if (!journals || !journals.length) return (baseRows || []).map(r => ({ ...r }))
  const A = attributeDelta(journals)
  const s = A.lrSec
  const pendUsaha = s.pendUsaha, bpp = s.bpp, admin = s.admin, ops = s.ops
  const pendLain = s.pendLain, bebanNonOps = s.bebanNonOps, pajak = s.pajak
  const bruto = pendUsaha - bpp
  const bebanUsaha = admin + ops
  const labaUsaha = bruto - bebanUsaha
  const netLainLain = pendLain - bebanNonOps
  const sebelumPajak = labaUsaha + netLainLain
  const setelahPajak = sebelumPajak - pajak
  const ebitda = sebelumPajak - s.bunga + s.pajakBank + s.penyusutan
  const totalMap = [
    ['JUMLAH PENDAPATAN USAHA', pendUsaha],
    ['JUMLAH BEBAN POKOK PENJUALAN', bpp],
    ['LABA (RUGI) BRUTO', bruto],
    ['JUMLAH BEBAN UMUM DAN ADMINISTRASI', admin],
    ['BEBAN OPERASIONAL DAN BISNIS', ops],
    ['BEBAN USAHA', bebanUsaha],
    ['LABA (RUGI) USAHA', labaUsaha],
    ['JUMLAH PENDAPATAN LAIN-LAIN', pendLain],
    ['BEBAN NON OPERASIONAL', bebanNonOps],
    ['JUMLAH PENDAPATAN DAN (BEBAN LAIN-LAIN)', netLainLain],
    ['BERSIH SEBELUM PAJAK', sebelumPajak],
    ['BERSIH SETELAH PAJAK', setelahPajak],
    ['EBITDA', ebitda],
  ]
  // A section's JUMLAH may include an amount from an account that has no Excel
  // detail line (unmapped). To keep JUMLAH == Σ of its visible leaves, emit a
  // "(Belum Terpetakan)" leaf carrying that amount, inserted just before the
  // matching subtotal. Only emitted when nonzero, so reports with no unmapped
  // delta stay byte-identical to before.
  const unmappedLeaf = [
    { kw: 'JUMLAH PENDAPATAN USAHA', amt: A.lrSec.unmappedPendUsaha || 0, label: 'Pendapatan Usaha Lainnya (Belum Terpetakan)' },
    { kw: 'JUMLAH BEBAN UMUM DAN ADMINISTRASI', amt: A.lrSec.unmappedAdmin || 0, label: 'Beban Umum dan Administrasi Lainnya (Belum Terpetakan)' },
    { kw: 'BEBAN OPERASIONAL DAN BISNIS', amt: A.lrSec.unmappedOps || 0, label: 'Beban Operasional dan Bisnis Lainnya (Belum Terpetakan)' },
  ]
  const out = []
  for (const r of (baseRows || [])) {
    const row = { ...r }
    const upper = String(r.label || '').toUpperCase()
    if (isLrTotal(r.label)) {
      const extra = unmappedLeaf.find(u => u.amt && upper.includes(u.kw))
      if (extra) out.push({ ...r, label: extra.label, value: extra.amt, _delta: extra.amt, _unmapped: true })
      const hit = totalMap.find(([kw]) => upper.includes(kw))
      if (hit) { row.value = (row.value || 0) + hit[1]; if (hit[1]) row._delta = hit[1] }
      out.push(row)
      continue
    }
    if (r.value == null) { out.push(row); continue }
    if (A.lrLeaf[r.label] != null) { row.value = (row.value || 0) + A.lrLeaf[r.label]; row._delta = A.lrLeaf[r.label] }
    out.push(row)
  }
  return out
}

/**
 * Overlay delta onto baseline Neraca rows. Subtotals (Aset Lancar / Tidak
 * Lancar) and grand totals are derived from the same section sums as the
 * leaves so the sheet stays internally consistent and balanced.
 */
export function buildNeracaRows(baseRows, journals) {
  if (!journals || !journals.length) return (baseRows || []).map(r => ({ ...r }))
  const A = attributeDelta(journals)
  const lancar = A.nSec.asetLancar, tidakLancar = A.nSec.asetTidakLancar
  const aset = lancar + tidakLancar
  const kewajiban = A.nSec.kewajiban
  const ekuitas = A.nSec.ekuitasDirect + A.nSec.pl
  const unmappedLancar = A.nSec.unmappedAsetLancar || 0
  const unmappedTidakLancar = A.nSec.unmappedAsetTidakLancar || 0
  let lastLeafDepth = 0
  const out = []
  for (const r of (baseRows || [])) {
    const row = { ...r }
    const label = String(r.label || ''), upper = label.toUpperCase()
    if (r.value == null) { out.push(row); continue }
    if (/jumlah aset lancar/i.test(label)) {
      // Visible leaf carrying any current-asset amount with no Excel line, so
      // "Jumlah Aset Lancar" == Σ of its visible leaves (and the sheet still
      // balances, since the grand total already includes this amount).
      if (unmappedLancar) out.push({ ...r, label: 'Aset Lancar Lainnya (Belum Terpetakan)', value: unmappedLancar, depth: lastLeafDepth, _delta: unmappedLancar, _unmapped: true })
      row.value += lancar; if (lancar) row._delta = lancar; out.push(row); continue
    }
    if (/jumlah aset tidak lancar/i.test(label)) {
      if (unmappedTidakLancar) out.push({ ...r, label: 'Aset Tidak Lancar Lainnya (Belum Terpetakan)', value: unmappedTidakLancar, depth: lastLeafDepth, _delta: unmappedTidakLancar, _unmapped: true })
      row.value += tidakLancar; if (tidakLancar) row._delta = tidakLancar; out.push(row); continue
    }
    if (upper.startsWith('JUMLAH ')) {
      if (upper.includes('KEWAJIBAN DAN')) row.value += kewajiban + ekuitas
      else if (upper.includes('ASET')) row.value += aset
      else if (upper.includes('KEWAJIBAN')) row.value += kewajiban
      else if (upper.includes('EKUITAS')) row.value += ekuitas
      out.push(row); continue
    }
    if (/berjalan/i.test(label)) { row.value += A.nSec.pl; if (A.nSec.pl) row._delta = A.nSec.pl; lastLeafDepth = row.depth || 0; out.push(row); continue }
    if (A.nLeaf[label] != null) { row.value += A.nLeaf[label]; row._delta = A.nLeaf[label] }
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
