// giroAccounts.js
// Resolusi akun untuk jurnal otomatis modul Giro.
//
// Modul Giro dulu memakai string akun yang di-hardcode, dan tiga di antaranya
// salah terhadap COA Perumda yang sebenarnya:
//
//   '11108 - Giro Masuk Belum Jatuh Tempo'  -> 11108 adalah **Bank BSI**
//                                              (rekening kerja sama pasar murah,
//                                              dibuka Mei 2026, saldo riil).
//   '21102 - Giro Keluar Belum Jatuh Tempo' -> 21102 tidak ada di COA.
//   '21101 - Hutang Usaha'                  -> 21101 tidak ada; yang benar
//                                              21200 Utang Usaha.
//
// Akibatnya setiap giro masuk yang dicairkan akan tercatat di buku besar Bank
// BSI. Sampai sekarang belum ada jurnal giro yang diposting, jadi belum ada
// data yang rusak — tetapi jebakannya harus ditutup sebelum modul ini dipakai.
//
// Akun giro sendiri BELUM ADA di COA Perumda dan penomorannya adalah keputusan
// bagian keuangan, jadi modul ini tidak mengarang kode: akun dicari di COA
// (lewat kode untuk akun baku, lewat nama untuk akun giro) dan kalau tidak
// ketemu, posting diblokir dengan menyebutkan akun mana yang kurang.
//
// Nomornya bebas, KELOMPOKNYA tidak. Giro masuk yang belum cair adalah tagihan,
// bukan kas: kalau diberi kode 111xx (usulan rekap 22-09 adalah 11109), kartu
// Kas & Bank dan Laporan Arus Kas — yang menghitung seluruh kelas 111 sebagai
// kas — akan mencatat uang masuk saat giro DITERIMA, bukan saat cair. Giro
// keluar adalah kewajiban (kelas 2). Akun dengan nama yang cocok tetapi di
// kelompok yang salah tidak dipakai, dan alasannya disebutkan.

import { normalizeName } from './coaResolve.js'
import { isCashCode } from './reportDelta.js'

export const GIRO_ACCOUNT_SPEC = {
  giroMasukBelum: {
    label: 'Giro Masuk Belum Jatuh Tempo', byName: ['Giro Masuk Belum Jatuh Tempo'],
    kelompok: { ok: c => /^1/.test(c) && !isCashCode(c), hint: 'aset lancar di luar kelompok 111 Kas & Setara Kas (mis. kelompok piutang 112xx), karena giro yang belum cair belum menjadi kas' },
  },
  giroKeluarBelum: {
    label: 'Giro Keluar Belum Jatuh Tempo', byName: ['Giro Keluar Belum Jatuh Tempo'],
    kelompok: { ok: c => /^2/.test(c), hint: 'kewajiban jangka pendek (kelompok 2xxxx)' },
  },
  bank:            { label: 'Bank Kalsel',   byCode: ['11103'] },
  piutang:         { label: 'Piutang Usaha', byCode: ['11201'] },
  hutang:          { label: 'Utang Usaha',   byCode: ['21200', '21101'] },
}

/**
 * Cari setiap akun giro di COA.
 * @param {Array<{code:string,name:string}>} coaFlat
 * @returns {{ akun: Record<string,string|null>, missing: string[],
 *             misplaced: Array<{label:string, code:string, hint:string}> }}
 *   `akun[key]` berisi string "kode - nama" yang dibangun dari baris COA yang
 *   benar-benar ada (jadi kode dan nama selalu cocok dengan COA), atau null.
 *   `missing` memuat label setiap akun yang tidak bisa dipakai; `misplaced`
 *   menjelaskan yang namanya ada di COA tetapi kodenya di kelompok yang salah.
 */
export function resolveGiroAccounts(coaFlat) {
  const byCode = new Map()
  const byName = new Map()
  for (const a of coaFlat || []) {
    const code = String(a?.code ?? '').trim()
    if (!code) continue
    if (!byCode.has(code)) byCode.set(code, a)
    const nk = normalizeName(a?.name)
    if (nk && !byName.has(nk)) byName.set(nk, a)
  }
  const akun = {}
  const missing = []
  const misplaced = []
  for (const [key, spec] of Object.entries(GIRO_ACCOUNT_SPEC)) {
    let hit = null
    for (const c of spec.byCode || []) { if (byCode.has(c)) { hit = byCode.get(c); break } }
    if (!hit) for (const n of spec.byName || []) { const m = byName.get(normalizeName(n)); if (m) { hit = m; break } }
    if (hit && spec.kelompok && !spec.kelompok.ok(String(hit.code).trim())) {
      misplaced.push({ label: spec.label, code: String(hit.code).trim(), hint: spec.kelompok.hint })
      hit = null
    }
    akun[key] = hit ? `${hit.code} - ${hit.name}` : null
    if (!hit) missing.push(spec.label)
  }
  return { akun, missing, misplaced }
}
