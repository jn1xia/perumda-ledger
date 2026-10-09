// Line template of the LRA tables (Penerimaan / Beban Umum / Beban Operasional /
// Investasi): which outlines a period's table renders, with their names and
// budgets.
//
// The template normally comes from uploaded lampiran rows (the anggaran table):
// the period's own rows, else the latest loaded month before it. Under the RKAP
// revised in September 2026 that fallback can be a month BEFORE the revision —
// e.g. September loaded as a journal book only — whose rows lack the revision's
// new lines (1.2.2 Banjarbakula, 4.3 Beban Pokok Listrik, …) and carry the old
// budgets. The revision's own lines then lead: rkapRevisi2026.json holds them as
// the app parses them from the lampiran September 2026 (every row of
// filterValidLra(extractSnapshot(wb, '2026-09').lra): outline, nama, anggaran,
// target).
import RKAP_REVISI_2026 from '../data/rkapRevisi2026.json' with { type: 'json' }
import { RKAP_V2_FROM_MONTH, rkapOutlineFor } from './lraOutline.js'

/**
 * The revised RKAP's rows for an LRA category, shaped like the anggaran rows an
 * upload of the lampiran September 2026 writes (realization fields empty).
 */
export function rkapRevisiRows(kategori) {
  return (RKAP_REVISI_2026[kategori] || []).map(r => ({
    kode: `ANG-${kategori}-${r.outline}`,
    nama: r.outline,
    nama_excel: r.nama,
    kategori,
    bulan: RKAP_V2_FROM_MONTH,
    anggaran_awal: r.anggaran,
    target_bulan: r.target,
    sd_bln_lalu: 0,
    bulan_ini: 0,
    realisasi: 0,
    is_total: 0,
  }))
}

/**
 * Rows that define an LRA table's lines for a period.
 * `periodRows`: the category's rows loaded for the period's months.
 * `templateRows`: those, else the latest loaded month before the period (April
 * is the floor — a lampiran can add lines mid-year, e.g. 12.1 Konsultan in Mei).
 * Under the revised RKAP (`rkap` 2) a template without any row of the revision
 * takes the revision's own rows instead; an older row is kept only for a line
 * the revision does not have, so no realization loses its line. (Keeping the
 * older rows of the same lines would let an old budget fill a line the
 * revision budgets at 0, e.g. 13.6 Biaya Parkir Karyawan.)
 */
export function lraTemplateRows(anggaranAll, kategori, periodMonths, rkap = 1) {
  const rows = (anggaranAll || []).filter(a => a.kategori === kategori && !a.is_total)
  const periodRows = rows.filter(a => periodMonths.includes(a.bulan))
  let templateRows = periodRows
  if (!templateRows.length) {
    const before = rows.filter(a => a.bulan >= 4 && a.bulan < Math.min(...periodMonths))
    if (before.length) {
      const latest = Math.max(...before.map(a => a.bulan))
      templateRows = before.filter(a => a.bulan === latest)
    }
  }
  if (rkap >= 2 && !templateRows.some(a => (a.bulan || 0) >= RKAP_V2_FROM_MONTH)) {
    const revised = rkapRevisiRows(kategori)
    const lines = new Set(revised.map(r => r.nama))
    const outlineOf = (a) => (a.kode && String(a.kode).startsWith('ANG-') ? a.nama : a.kode)
    templateRows = [...revised, ...templateRows.filter(a => !lines.has(rkapOutlineFor(kategori, outlineOf(a), a.bulan, 2)))]
  }
  return { periodRows, templateRows }
}
