// The October 2026 book (lampiran JURNAL OKTOBER 2026, cached values) as the
// app stores it after a journal-book upload: posted, live (JV-) journals.
// withBukti: false blanks the voucher-number and Kategori columns, which is the
// book uploaded on live on 10-11-2026 (241 journals instead of 220).
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx/xlsx.mjs'
import { extractSnapshot } from '../../src/utils/reportSnapshot.js'

const JURNAL = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'jurnal_oktober_2026.json'), 'utf8'))

export function octoberJournals({ withBukti = true, ids = 'JV' } = {}) {
  const rows = withBukti ? JURNAL.rows : JURNAL.rows.map((r, i) => (i < 3 ? r : r.map((c, k) => (k === 2 || k === 8 ? null : c))))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), JURNAL.sheet)
  return extractSnapshot(wb, '2026-10').journals.map(j => ({ ...j, id: ids === 'JV' ? j.id.replace(/^XL-/, 'JV-') : j.id, status: 'posted', baseline: ids === 'JV' ? 0 : 1 }))
}
