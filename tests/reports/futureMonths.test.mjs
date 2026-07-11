// Forward-looking acceptance: JULY (and any later month) entered on top of a
// journal-mode June must produce correct reports. June has NO snapshot, so the
// Neraca baseline stays May and the overlay spans TWO journal months — the
// exact shape of every future month until the division sends a new audited
// lampiran. Synthetic July journals exercise each rule the division's data
// uses: header-coded PPh, depreciation, piutang collection, capex, and paying
// off Biaya yang Masih Harus Dibayar (the case where the division's own Excel
// workaround formula =G51 would break — the app must get it right).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx/xlsx.mjs'
import { extractJournals } from '../../src/utils/reportSnapshot.js'
import { expandJournals } from '../../src/utils/journalExpand.js'
import {
  attributeDelta, composeLabaRugi, buildNeracaRows, buildArusKasIndirectRows, deltaCash,
} from '../../src/utils/reportDelta.js'

if (typeof XLSX.set_fs === 'function') XLSX.set_fs(fs)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DIVISI_JUNI = path.join(root, 'fixtures', 'JURNAL JUNI 2026 (divisi).xlsx')

const closeTo = (actual, expected, tol = 0.02, msg = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: got ${actual}, expected ${expected} (±${tol})`)

function juneExpanded() {
  const wb = XLSX.readFile(DIVISI_JUNI)
  return expandJournals(extractJournals(wb, '2026-06').map(j => ({ ...j, status: 'posted', baseline: 0 })))
}

// Synthetic July book — one journal per engine rule.
const JULY = expandJournals([
  { id: 'JV-2026-07-T1', tanggal: '2026-07-05', status: 'posted', baseline: 0, debit: 100000000, kredit: 100000000,
    akun_debit: '11103 Bank Kalsel', akun_kredit: '41000 Pendapatan Bisnis Utama > Pendapatan Pengelolaan Pasar Toko/Kios, Bak, dan Los (Bulanan)' },
  { id: 'JV-2026-07-T2', tanggal: '2026-07-10', status: 'posted', baseline: 0, debit: 40000000, kredit: 40000000,
    akun_debit: '61010 Beban Gaji', akun_kredit: '11103 Bank Kalsel' },
  { id: 'JV-2026-07-T3', tanggal: '2026-07-15', status: 'posted', baseline: 0, debit: 10000000, kredit: 10000000,
    akun_debit: '80000 Beban di Luar Operasional > Pajak Penghasilan', akun_kredit: '11103 Bank Kalsel' },
  { id: 'JV-2026-07-T4', tanggal: '2026-07-31', status: 'posted', baseline: 0, debit: 5000000, kredit: 5000000,
    akun_debit: '61130 Beban Penyusutan Aktiva Tetap', akun_kredit: '12102.2 Akumulasi Penyusutan Bangunan' },
  { id: 'JV-2026-07-T5', tanggal: '2026-07-20', status: 'posted', baseline: 0, debit: 20000000, kredit: 20000000,
    akun_debit: '11103 Bank Kalsel', akun_kredit: '11201 Piutang Usaha' },
  { id: 'JV-2026-07-T6', tanggal: '2026-07-25', status: 'posted', baseline: 0, debit: 488840600, kredit: 488840600,
    akun_debit: '21500 Biaya yang Masih Harus Dibayar', akun_kredit: '11103 Bank Kalsel' },
  { id: 'JV-2026-07-T7', tanggal: '2026-07-28', status: 'posted', baseline: 0, debit: 15000000, kredit: 15000000,
    akun_debit: '12204.1 Peralatan', akun_kredit: '11103 Bank Kalsel' },
])

// July-only P/L: 100jt − 40jt − 5jt − 10jt(PPh) = +45jt
const JULY_PL = 45000000

const MAY_NERACA = [
  { label: 'Kas Kecil  - Kantor', value: 23529440 },
  { label: 'Kas Bank Kalsel', value: 6321630612.83 },
  { label: 'Bank BNI', value: 8000941421 },
  { label: 'Investasi Jangka Pendek', value: 0 },
  { label: 'Bank BNI Bisnis', value: 123696497 },
  { label: 'Bank BNI Tapcash', value: 53119090 },
  { label: 'Bank BSI', value: 30983000 },
  { label: 'Piutang Usaha', value: 403062651 },
  { label: 'Persediaan Barang Dagang (Bapok dan Gerai Inflasi)', value: 57460250 },
  { label: 'Persediaan Barang Dagang (Gas LPG)', value: 47720000 },
  { label: 'BBM Dibayar di Muka', value: 22100000 },
  { label: 'Jumlah Aset Lancar', value: 15084242961.83 },
  { label: 'Tanah ', value: 786424200000 },
  { label: 'Bangunan', value: 65522933418 },
  { label: 'Akumulasi Penyusutan Bangunan', value: -4581497627.541666 },
  { label: 'Nilai Buku', value: 847365635790.4584 },
  { label: 'Mesin', value: 59310000 },
  { label: 'Akumulasi Penyusutan Mesin', value: -6795937.5 },
  { label: 'Instalasi Listrik', value: 14033500 },
  { label: 'Akumulasi Penyusutan Instalasi Listrik', value: -819593.4583333335 },
  { label: 'Peralatan', value: 829610567 },
  { label: 'Akumulasi Penyusutan Peralatan', value: -36768059.829666674 },
  { label: 'Kendaraan', value: 355905800 },
  { label: 'Akumulasi Penyusutan Kendaraan', value: -25951464.416666664 },
  { label: 'Nilai Buku ', value: 1188524811.7953331 },
  { label: 'Aset Dalam Penyelesaian', value: 99280000 },
  { label: 'Jumlah Aset Tidak Lancar', value: 848653440602.2537 },
  { label: 'JUMLAH ASET', value: 863737683564.0836 },
  { label: 'Utang Usaha', value: 32712000 },
  { label: 'Utang Daerah', value: 19742006 },
  { label: 'Pendapatan Diterima Dimuka', value: 1548333335 },
  { label: 'JUMLAH KEWAJIBAN', value: 1600787341 },
  { label: 'Modal Perumda Pasar Banjarmasin', value: 850759100000 },
  { label: 'Modal Disetor', value: 15000000000 },
  { label: 'Saldo Laba (Rugi) Periode Lalu', value: -3237908077.1299996 },
  { label: '(Laba) Rugi Periode Berjalan', value: -384295699.78666663 },
  { label: 'JUMLAH EKUITAS', value: 862136896223.0834 },
  { label: 'JUMLAH KEWAJIBAN DAN EKUITAS', value: 863737683564.0834 },
]

test('JULY Neraca: two journal months stack on the May baseline with correct roll-forward', () => {
  const delta = [...juneExpanded(), ...JULY]
  const rows = buildNeracaRows(MAY_NERACA, delta, { baseYM: '2026-05', viewYM: '2026-07' })
  const val = (lbl) => rows.find(r => r.label === lbl)?.value
  // Equity: May berjalan AND June's result both roll into saldo lalu; berjalan = July only.
  closeTo(val('Saldo Laba (Rugi) Periode Lalu'),
    -3237908077.1299996 + -384295699.78666663 + -390185301.0605, 0.05,
    'saldo lalu = May lalu + May berjalan + June result')
  closeTo(val('(Laba) Rugi Periode Berjalan'), JULY_PL, 0.02, 'berjalan = July result only')
  // Balance-sheet chaining: June value ± July movements.
  closeTo(val('Kas Bank Kalsel'), 6806187798.87 + 100000000 - 40000000 - 10000000 + 20000000 - 488840600 - 15000000, 0.02, 'Bank Kalsel')
  closeTo(val('Piutang Usaha'), 344711240 - 20000000, 0.02, 'Piutang')
  closeTo(val('Peralatan'), 833460567 + 15000000, 0.02, 'Peralatan')
  closeTo(val('Akumulasi Penyusutan Bangunan'), -4854509850.121666 - 5000000, 0.02, 'Ak. Peny. Bangunan')
  // Biaya YMHD: June credit 488.840.600 fully paid in July → back to 0. (The
  // division's own Excel =G51 workaround would show 488.840.600 here — wrong.)
  const bymhd = rows.find(r => r.label === 'Biaya yang Masih Harus Dibayar')
  closeTo(bymhd ? bymhd.value : 0, 0, 0.02, 'Biaya YMHD nets to 0 after payment')
  // Sheet still balances.
  closeTo(val('JUMLAH KEWAJIBAN DAN EKUITAS') - val('JUMLAH ASET'), 0, 0.05, 'balance')
})

test('JULY Arus Kas: kas awal chains through snapshot-less June; statement ties', () => {
  const expanded = juneExpanded()
  const juneCash = deltaCash(expanded)
  closeTo(juneCash, 1472896039.04, 0.05, 'June net cash movement')
  const kasAwal = 14553900060.83 + juneCash // May cash + June movements = June kas akhir
  closeTo(kasAwal, 16026796099.87, 0.05, 'July kas awal == June kas akhir')

  const A = attributeDelta(JULY)
  const c = composeLabaRugi(A.lrSec)
  const ak = buildArusKasIndirectRows({ journals: JULY, labaSebelumPajak: c.sebelumPajak, penyusutan: A.lrSec.penyusutan, pajakRow: 0, kasAwal })
  // operasi = 45jt + 5jt penyusutan + 20jt piutang − 488.840.600 BYMHD payment
  closeTo(ak.operasi, 45000000 + 5000000 + 20000000 - 488840600, 0.02, 'operasi')
  closeTo(ak.investasi, -15000000, 0.02, 'investasi (capex only)')
  closeTo(ak.residual, 0, 0.02, 'no uncovered movements')
  closeTo(ak.kasAkhir, kasAwal + ak.kenaikan, 0.02, 'kas akhir = awal + kenaikan')
  closeTo(ak.kenaikan, deltaCash(JULY), 0.02, 'kenaikan == actual July cash movement')
})

test('JULY Laba Rugi composition (PPh via 80000 Sub Akun, division layout)', () => {
  const c = composeLabaRugi(attributeDelta(JULY).lrSec)
  closeTo(c.pendUsaha, 100000000, 0.02, 'pendapatan')
  closeTo(c.admin, 45000000, 0.02, 'beban umum (gaji + penyusutan)')
  closeTo(c.ops, 10000000, 0.02, 'beban ops = PPh line only')
  closeTo(c.pajak, 10000000, 0.02, 'PPh recognized from 80000 > Pajak Penghasilan')
  closeTo(c.setelahPajak, JULY_PL, 0.02, 'laba bersih')
  closeTo(c.ebitda, JULY_PL + 5000000 + 10000000, 0.02, 'EBITDA adds back depreciation + PPh')
})

test('a NEW unknown Sub Akun name still lands in the right class (no crash, no loss)', () => {
  // Future data will contain names the keyword tables have never seen. They
  // must fall back to the parent code's class so no rupiah ever disappears.
  const j = expandJournals([
    { id: 'JV-2026-07-N1', tanggal: '2026-07-30', status: 'posted', baseline: 0, debit: 7000000, kredit: 7000000,
      akun_debit: '11103 Bank Kalsel', akun_kredit: '42000 Pendapatan Bisnis Lainnya > Pendapatan Sewa ATM Center' },
    { id: 'JV-2026-07-N2', tanggal: '2026-07-30', status: 'posted', baseline: 0, debit: 3000000, kredit: 3000000,
      akun_debit: '80000 Beban di Luar Operasional > Denda Keterlambatan Vendor', akun_kredit: '11103 Bank Kalsel' },
  ])
  const c = composeLabaRugi(attributeDelta(j).lrSec)
  closeTo(c.pendUsaha, 7000000, 0.02, 'unknown revenue stream stays in pendapatan usaha')
  closeTo(c.bebanNonOps, 3000000, 0.02, 'unknown 80000 item stays in beban non-ops (NOT tax)')
  closeTo(c.pajak, 0, 0.02, 'no accidental PPh classification')
})
