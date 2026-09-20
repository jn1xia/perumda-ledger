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

import { normalizeName } from './coaResolve.js'

export const GIRO_ACCOUNT_SPEC = {
  giroMasukBelum:  { label: 'Giro Masuk Belum Jatuh Tempo',  byName: ['Giro Masuk Belum Jatuh Tempo'] },
  giroKeluarBelum: { label: 'Giro Keluar Belum Jatuh Tempo', byName: ['Giro Keluar Belum Jatuh Tempo'] },
  bank:            { label: 'Bank Kalsel',   byCode: ['11103'] },
  piutang:         { label: 'Piutang Usaha', byCode: ['11201'] },
  hutang:          { label: 'Utang Usaha',   byCode: ['21200', '21101'] },
}

/**
 * Cari setiap akun giro di COA.
 * @param {Array<{code:string,name:string}>} coaFlat
 * @returns {{ akun: Record<string,string|null>, missing: string[] }}
 *   `akun[key]` berisi string "kode - nama" yang dibangun dari baris COA yang
 *   benar-benar ada (jadi kode dan nama selalu cocok dengan COA), atau null.
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
  for (const [key, spec] of Object.entries(GIRO_ACCOUNT_SPEC)) {
    let hit = null
    for (const c of spec.byCode || []) { if (byCode.has(c)) { hit = byCode.get(c); break } }
    if (!hit) for (const n of spec.byName || []) { const m = byName.get(normalizeName(n)); if (m) { hit = m; break } }
    akun[key] = hit ? `${hit.code} - ${hit.name}` : null
    if (!hit) missing.push(spec.label)
  }
  return { akun, missing }
}
