// calk.js
// Catatan atas Laporan Keuangan (CALK) and Laporan Perubahan Ekuitas, built
// from the SAME Neraca and Laba Rugi rows the Laporan page shows for a period
// (an uploaded official report, or the monthly snapshots plus journals), next
// to the audited 2025 figures (src/data/laporanAudit2025.js). Bagian Keuangan
// asked for both to be automatic for the annual report; SAK EP also requires
// the comparative year that the 2025 audit report lacked.
import reconcileAlias from './reconcileAlias.json' with { type: 'json' }
import { normLabel } from './reportDelta.js'
import { NERACA_2025, LABA_RUGI_2025, EKUITAS_2025 } from '../data/laporanAudit2025.js'

const MONTH_NAMES = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/** '2026-03' → '31 Maret 2026'. */
export function periodEndText(yearMonth) {
  const [y, m] = String(yearMonth || '').split('-').map(Number)
  if (!y || !m) return ''
  return `${new Date(Date.UTC(y, m, 0)).getUTCDate()} ${MONTH_NAMES[m]} ${y}`
}

/** Months 3, 6 → '1 Januari – 30 Juni 2026'; the year → 'Tahun 2026'. */
export function periodSpanText(months, year = 2026) {
  const first = Math.min(...months), last = Math.max(...months)
  if (first === 1 && last === 12) return `Tahun ${year}`
  return `1 ${MONTH_NAMES[first]} – ${periodEndText(`${year}-${String(last).padStart(2, '0')}`)}`
}

// ── Neraca lines → account groups ─────────────────────────────────────────────
// A Neraca line is the account code it stands for (reconcileAlias, code →
// lampiran label). Lines of 2025 and 2026 meet on that code, so a renamed line
// ("Modal Perumda Pasar Baiman" → "… Banjarmasin") stays one line.
const CODE_OF_LABEL = new Map()
for (const [code, label] of Object.entries(reconcileAlias)) {
  const k = normLabel(label)
  if (!CODE_OF_LABEL.has(k)) CODE_OF_LABEL.set(k, code)
}
const LABEL_SYNONYMS = {
  'modal perumda pasar baiman': '31000',
  '(laba) rugi periode berjalan': '34000',
  'laba (rugi) periode berjalan': '34000',
}
export function neracaCode(label) {
  const n = normLabel(label)
  return LABEL_SYNONYMS[n] || CODE_OF_LABEL.get(n) || null
}

const GROUP_OF_CODE = [
  ['kas', /^111/], ['piutang', /^112/], ['persediaan', /^11[34]/], ['dibayarDimuka', /^115/],
  ['asetTetap', /^1[23]/], ['liabilitas', /^2/], ['ekuitas', /^3/],
]
const groupOf = (code) => (GROUP_OF_CODE.find(([, re]) => re.test(code)) || [null])[0]
const isTotalLabel = (label) => /^(jumlah|jumah|total|nilai buku)\b/i.test(String(label || '').trim())
// Section headings decide where an unmapped line ("… (Belum Terpetakan)") goes.
const SECTION_OF_HEADING = [
  [/^aset lancar/i, 'dibayarDimuka'], [/^aset tidak lancar|^aset lainnya/i, 'asetTetap'],
  [/^kewajiban|^liabilitas/i, 'liabilitas'], [/^ekuitas|^kekayaan pemda/i, 'ekuitas'],
]

/** Neraca rows → { group: [{ key, label, value }] } in row order, totals left out. */
export function neracaGroups(rows) {
  const out = {}
  let section = null
  for (const r of rows || []) {
    const label = String(r.label || '').trim()
    if (!label || isTotalLabel(label)) continue
    const value = typeof r.value === 'number' ? r.value : null
    const heading = SECTION_OF_HEADING.find(([re]) => re.test(label))
    if (heading && value == null) { section = heading[1]; continue }
    const code = neracaCode(label)
    const group = code ? groupOf(code) : (value != null ? section : null)
    if (!group) continue
    const key = code || `L:${normLabel(label)}`
    const list = out[group] || (out[group] = [])
    const hit = list.find(x => x.key === key)
    if (hit) { if (value != null) hit.value = (hit.value || 0) + value }
    else list.push({ key, label, value })
  }
  return out
}

// ── Laba Rugi sections ─────────────────────────────────────────────────────────
// A section runs from its heading (a line without a figure) to its total line.
const LR_SECTIONS = [
  ['pendapatan', /^pendapatan usaha$/, /^jumlah pendapatan usaha$/],
  ['bebanPokok', /^beban pokok penjualan$/, /^ju(ml|m)?ah beban pokok/],
  ['bebanUmum', /^beban umum dan administrasi$/, /^ju(ml|m)ah beban umum/],
  ['bebanOperasional', /^beban operasional dan bisnis$/, /^ju(ml|m)ah beban operasional/],
  ['pendapatanLain', /^pendapatan lain-lain$/, /^jumlah pendapatan lain-lain/],
  ['bebanLain', /^beban lain-lain$/, /^ju(ml|m)ah beban (non operasional|lain-lain)/],
]

/** Laba Rugi rows → { section: { rows: [{ key, label, value }], total } }. */
export function labaRugiSections(rows) {
  const out = {}
  let cur = null
  for (const r of rows || []) {
    const label = String(r.label || '').trim()
    const n = normLabel(label)
    const value = typeof r.value === 'number' ? r.value : null
    if (value == null) {
      const s = LR_SECTIONS.find(([, start]) => start.test(n))
      if (s) { cur = { id: s[0], end: s[2] }; out[cur.id] = { rows: [], total: null }; continue }
    }
    if (!cur) continue
    if (cur.end.test(n)) { out[cur.id].total = value; cur = null; continue }
    if (value == null) continue
    const list = out[cur.id].rows
    const nth = list.filter(x => normLabel(x.label) === n).length
    list.push({ key: `${n}#${nth}`, label, value })
  }
  return out
}

const NERACA_2025_ROWS = NERACA_2025.map(([label, value]) => ({ label, value }))
const LABA_RUGI_2025_ROWS = LABA_RUGI_2025.map(([label, value]) => ({ label, value }))

// Lines of one note: the period's lines in their order, then 2025-only lines;
// a line with no figure in either year is left out.
function pairLines(curList, prevList) {
  const prevByKey = new Map((prevList || []).map(x => [x.key, x]))
  const rows = []
  for (const c of curList || []) {
    const p = prevByKey.get(c.key)
    rows.push({ label: c.label, cur: c.value, prev: p ? p.value : null })
    prevByKey.delete(c.key)
  }
  for (const p of prevByKey.values()) rows.push({ label: p.label, cur: curList ? null : undefined, prev: p.value })
  return rows.filter(r => (r.cur || 0) !== 0 || (r.prev || 0) !== 0)
}
const sum = (rows, k) => rows.reduce((s, r) => s + (typeof r[k] === 'number' ? r[k] : 0), 0)
const totalOf = (rows, haveCur) => ({ cur: haveCur ? sum(rows, 'cur') : undefined, prev: sum(rows, 'prev') })

/**
 * Notes 4–15 with figures for a period: [{ no, id, title, kind, rows, total,
 * … }]. `neraca` / `labaRugi` are the rows the Laporan page shows (label,
 * value); null when the period has none (its column then reads "—"). Every
 * row carries cur (the period) and prev (31 Desember 2025, audited).
 */
export function buildCalkNotes({ neraca = null, labaRugi = null } = {}) {
  const n26 = neraca ? neracaGroups(neraca) : null
  const n25 = neracaGroups(NERACA_2025_ROWS)
  const l26 = labaRugi ? labaRugiSections(labaRugi) : null
  const l25 = labaRugiSections(LABA_RUGI_2025_ROWS)
  const haveN = !!n26, haveL = !!l26

  const balance = (no, id, title, totalLabel) => {
    const rows = pairLines(haveN ? n26[id] || [] : null, n25[id] || [])
    return { no, id, title, kind: 'neraca', rows, total: { label: totalLabel, ...totalOf(rows, haveN) } }
  }
  const flow = (no, id, title, totalLabel) => {
    const rows = pairLines(haveL ? (l26[id] || { rows: [] }).rows : null, (l25[id] || { rows: [] }).rows)
    const cur = haveL ? (l26[id] && l26[id].total != null ? l26[id].total : sum(rows, 'cur')) : undefined
    return { no, id, title, kind: 'labaRugi', rows, total: { label: totalLabel, cur, prev: l25[id] ? l25[id].total : sum(rows, 'prev') } }
  }

  // Aset tetap: cost lines, then accumulated depreciation / amortisation, with
  // the movement since 31 December 2025.
  const at = pairLines(haveN ? n26.asetTetap || [] : null, n25.asetTetap || [])
    .map(r => ({ ...r, mutasi: haveN ? (r.cur || 0) - (r.prev || 0) : undefined }))
  const perolehan = at.filter(r => !/^akumulasi/i.test(r.label))
  const akumulasi = at.filter(r => /^akumulasi/i.test(r.label))
  const subtotal = (rows, label) => {
    const t = totalOf(rows, haveN)
    return { label, ...t, mutasi: haveN ? t.cur - t.prev : undefined }
  }
  const asetTetap = {
    no: 8, id: 'asetTetap', title: 'ASET TETAP', kind: 'asetTetap',
    perolehan, akumulasi,
    totalPerolehan: subtotal(perolehan, 'Jumlah nilai perolehan'),
    totalAkumulasi: subtotal(akumulasi, 'Jumlah akumulasi penyusutan dan amortisasi'),
    total: subtotal(at, 'Nilai Tercatat'),
  }

  const pendLain = flow(15, 'pendapatanLain', 'PENDAPATAN (BEBAN) LAIN-LAIN', 'Sub jumlah pendapatan lain-lain')
  const bebanLain = flow(15, 'bebanLain', '', 'Sub jumlah beban lain-lain')
  const lainLain = {
    no: 15, id: 'lainLain', title: 'PENDAPATAN (BEBAN) LAIN-LAIN', kind: 'lainLain',
    pendapatan: pendLain, beban: bebanLain,
    total: {
      label: 'Jumlah',
      cur: haveL ? (pendLain.total.cur || 0) - (bebanLain.total.cur || 0) : undefined,
      prev: (pendLain.total.prev || 0) - (bebanLain.total.prev || 0),
    },
  }

  return [
    balance(4, 'kas', 'KAS DAN SETARA KAS', 'Jumlah Kas dan Setara Kas'),
    balance(5, 'piutang', 'PIUTANG USAHA', 'Jumlah Piutang Usaha'),
    balance(6, 'persediaan', 'PERSEDIAAN', 'Jumlah Persediaan'),
    balance(7, 'dibayarDimuka', 'BIAYA DIBAYAR DIMUKA', 'Jumlah Biaya Dibayar Dimuka'),
    asetTetap,
    balance(9, 'liabilitas', 'LIABILITAS', 'Jumlah Liabilitas'),
    balance(10, 'ekuitas', 'EKUITAS', 'Jumlah Ekuitas'),
    flow(11, 'pendapatan', 'PENDAPATAN', 'Jumlah Pendapatan'),
    flow(12, 'bebanPokok', 'BEBAN POKOK PENJUALAN', 'Jumlah Beban Pokok Penjualan'),
    flow(13, 'bebanUmum', 'BEBAN UMUM DAN ADMINISTRASI', 'Jumlah Beban Umum dan Administrasi'),
    flow(14, 'bebanOperasional', 'BEBAN OPERASIONAL DAN BISNIS', 'Jumlah Beban Operasional'),
    lainLain,
  ]
}

// ── Laporan Perubahan Ekuitas ──────────────────────────────────────────────────
// Equity at the end of the period from its Neraca: Modal (31000), Modal
// Disetor (32000), Saldo Laba = periode lalu (33000) + periode berjalan
// (34000), Koreksi Ekuitas (35000), and any unmapped equity line ("Ekuitas
// Lainnya (Belum Terpetakan)") so the statement ties to the Neraca. The year's
// laba (rugi) is the change in Saldo Laba since 31 December 2025 — however
// the Neraca splits lalu / berjalan for a quarter or a semester. A Neraca
// without the Modal line is not a usable balance sheet: null.
export function equityAt(neraca) {
  const v = {}
  let jumlah = null, lainnya = 0, inEkuitas = false
  for (const r of neraca || []) {
    const label = String(r.label || '').trim()
    if (/^ekuitas$|^kekayaan pemda/i.test(label) && r.value == null) { inEkuitas = true; continue }
    if (typeof r.value !== 'number') continue
    if (/^jumlah ekuitas$/i.test(label)) { jumlah = r.value; inEkuitas = false; continue }
    const code = neracaCode(label)
    if (code && /^3/.test(code)) v[code] = (v[code] || 0) + r.value
    else if (!code && inEkuitas && !isTotalLabel(label)) lainnya += r.value
  }
  if (!v['31000']) return null
  return {
    modal: v['31000'],
    disetor: v['32000'] || 0,
    saldoLaba: (v['33000'] || 0) + (v['34000'] || 0),
    koreksi: v['35000'] || 0,
    lainnya,
    jumlah,
  }
}

/**
 * Rows of the Laporan Perubahan Ekuitas: 2025 as audited, then the period
 * from 1 January 2026 to its end. `akhir` is equityAt(neraca) of the period
 * (null → 2025 only). Columns: modal, disetor, saldoLaba, jumlah.
 */
export function buildPerubahanEkuitas({ akhir = null, spanText = '', endText = '' } = {}) {
  const line = (label, modal, disetor, saldoLaba, kind) =>
    ({ label, modal, disetor, saldoLaba, jumlah: modal + disetor + saldoLaba, kind })
  const e = EKUITAS_2025
  const rows = [
    line(e.awal.label, e.awal.modal, e.awal.disetor, e.awal.saldoLaba, 'saldo'),
    ...e.mutasi.map(m => line(m.label, m.modal, m.disetor, m.saldoLaba, 'mutasi')),
    line(e.akhir.label, e.akhir.modal, e.akhir.disetor, e.akhir.saldoLaba, 'saldo'),
  ]
  let check = null
  if (akhir) {
    const dModal = akhir.modal - e.akhir.modal
    const dDisetor = akhir.disetor - e.akhir.disetor
    if (dModal || dDisetor) rows.push(line('Tambahan modal', dModal, dDisetor, 0, 'mutasi'))
    if (akhir.koreksi) rows.push(line('Koreksi ekuitas', 0, 0, akhir.koreksi, 'mutasi'))
    if (akhir.lainnya) rows.push(line('Ekuitas lainnya (belum terpetakan)', 0, 0, akhir.lainnya, 'mutasi'))
    const laba = akhir.saldoLaba - e.akhir.saldoLaba
    rows.push(line(`${laba < 0 ? 'Rugi' : 'Laba'} periode berjalan (${spanText})`, 0, 0, laba, 'mutasi'))
    const end = line(`Saldo ${endText}`, akhir.modal, akhir.disetor, akhir.saldoLaba + akhir.koreksi + (akhir.lainnya || 0), 'saldo')
    rows.push(end)
    if (akhir.jumlah != null) check = { neraca: akhir.jumlah, selisih: end.jumlah - akhir.jumlah }
  }
  return { rows, check }
}
