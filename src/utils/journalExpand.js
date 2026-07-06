/**
 * journalExpand.js
 *
 * Multi-line journal support for report aggregation.
 *
 * Reports across the app aggregate journals using the legacy 2-account model
 * (akun_debit / akun_kredit / debit / kredit). Multi-line journals created via
 * the Jurnal form store their detail in a `lines` JSON array. To make those
 * multi-line entries flow into the 2-account-based report calculations without
 * rewriting every aggregation, we expand each multi-line journal into one
 * "half-record" per posting line:
 *   - a debit line  -> { akun_debit: "<code name [> sub]>", debit: amt, akun_kredit: '', kredit: 0 }
 *   - a kredit line -> { akun_kredit: "<code name [> sub]>", kredit: amt, akun_debit: '', debit: 0 }
 *
 * Per-account SUM aggregations (which is what every report does) produce
 * identical results to a normal 2-account journal for the single-line case,
 * and correct per-account results for the multi-line case.
 *
 * IMPORTANT: only journals that carry a non-empty `lines` JSON array are
 * expanded. Imported/legacy journals (lines == null) pass through untouched,
 * so existing report figures are unaffected.
 */

export function parseJournalLines(j) {
  if (!j) return null;
  let lines = j.journal_lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    lines = j.lines;
    if (typeof lines === 'string') {
      try { lines = JSON.parse(lines); } catch { lines = null; }
    }
  }
  return Array.isArray(lines) && lines.length > 0 ? lines : null;
}

// Build the "CODE NAME [> SUBAKUN]" account string for an expanded posting line.
// The sub_akun is appended VERBATIM after " > " so that, when it was chosen from
// the full COA and carries its own leading numeric code (e.g. "41008 - Pendapatan
// Ramayana"), the downstream extractors (reportDelta.codeOf /
// lraOutline.extractAccountCode) can recover that sub-code and attribute the
// movement to the sub-account instead of the parent. Free-text sub_akun names
// (no leading digit) leave attribution on the parent code — unchanged behavior.
function lineAccountString(l) {
  const code = String(l.akun_code || '').trim();
  const name = String(l.akun_name || '').trim();
  const base = [code, name].filter(Boolean).join(' ').trim();
  const sub = l.sub_akun != null ? String(l.sub_akun).trim() : '';
  return sub ? `${base} > ${sub}` : base;
}

/**
 * Expand an array of journals so multi-line (form `lines`) entries become
 * per-posting half-records. Single-line / legacy journals pass through.
 */
export function expandJournals(journals) {
  const out = [];
  for (const j of journals || []) {
    const lines = parseJournalLines(j);
    if (!lines) { out.push(j); continue; }
    lines.forEach((l, i) => {
      const acct = lineAccountString(l);
      const d = Number(l.debit) || 0;
      const k = Number(l.kredit) || 0;
      if (d > 0) {
        out.push({ ...j, journal_lines: undefined, lines: undefined, akun_debit: acct, akun_kredit: '', debit: d, kredit: 0, keterangan: l.keterangan || j.keterangan, _expandedFrom: j.id, _expandKey: `${j.id}-d${i}` });
      }
      if (k > 0) {
        out.push({ ...j, journal_lines: undefined, lines: undefined, akun_kredit: acct, akun_debit: '', debit: 0, kredit: k, keterangan: l.keterangan || j.keterangan, _expandedFrom: j.id, _expandKey: `${j.id}-k${i}` });
      }
    });
  }
  return out;
}
