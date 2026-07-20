// ─── lraOutline.js ──────────────────────────────────────────────────────────
// Shared bridge that maps a COA account code (+ optional keterangan) to the
// LRA/NPD outline number (e.g. "11.1"). Used by BOTH LRA and NPD so the two
// reports never drift apart.

export const ACCOUNT_TO_OUTLINE = {
  // Beban Umum (61xxx) — leaf accounts
  '61011': '1.1', '61012': '1.2', '61013': '1.3',
  '61021': '2.1', '61022': '2.2', '61023': '2.3', '61024': '2.4', '61025': '2.5',
  '61026': '2.6', '61027': '2.7', '61028': '2.8', '61029': '2.9',
  '61031': '3.1', '61032': '3.2', '61033': '3.3', '61034': '3.4', '61035': '3.5', '61036': '3.6',
  '61041': '4.1', '61042': '4.2', '61043': '4.3',
  '61051': '5.1', '61052': '5.2', '61053': '5.3', '61054': '5.4', '61055': '5.5',
  '61061': '6.1', '61062': '6.2', '61063': '6.3', '61064': '6.4', '61065': '6.4',
  '61071': '7.1', '61072': '7.2', '61073': '7.3',
  '61081': '8.1', '61082': '8.2', '61083': '8.3', '61084': '8.4', '61085': '8.5', '61086': '8.6',
  '61091': '9.1', '61092': '9.2',
  '61101': '10.1', '61102': '10.2', '61103': '10.3',
  '61111': '11.1',  // Sewa Kendaraan
  '61121': '12.1', '61122': '12.2', '61123': '12.3', '61124': '12.4', '61125': '12.5',
  '61141': '13.1', '61142': '13.2', '61143': '13.3', '61144': '13.4', '61145': '13.5',
  '61146': '13.6', '61147': '13.7', '61148': '13.8', '61149': '13.9', '61150': '13.10',
  '61151': '13.11', '61152': '13.12', '61153': '13.13', '61154': '13.14',

  // Beban Umum — parent/group accounts (when user picks a group instead of leaf)
  // NOTE: 61130 (Beban Penyusutan Aktiva Tetap) is deliberately ABSENT — the LRA
  // is cash-basis and the official lampiran excludes depreciation entirely
  // (Beban Umum LRA Juni 428.698.498 = accrual 743.330.990,10 − penyusutan
  // 314.632.492,10). Mapping it to an outline inflated the LRA.
  '61010': '1.1', '61020': '2.1', '61030': '3.1', '61040': '4.1', '61050': '5.1',
  '61060': '6.1', '61070': '7.1', '61080': '8.1', '61090': '9.1', '61100': '10.1',
  '61110': '11.1', '61120': '12.1', '61140': '13.1',

  // Beban Operasional (62xxx) — leaf accounts
  '62011': '1.1.1', '62012': '1.1.2', '62013': '1.1.3', '62014': '1.1.4', '62015': '1.1.5', '62016': '1.1.6',
  '62021': '1.2.1', '62031': '1.3.1', '62032': '1.3.2',
  '62041': '2.1.1', '62042': '2.1.2', '62043': '2.1.3', '62051': '2.2.1',
  '62061': '3.1.1', '62062': '3.1.2',
  '62073': '3.2.1', '62072': '3.2.2', '62071': '3.2.3',
  '62081': '3.3.1', '62082': '3.3.2', '62083': '3.3.3', '62084': '3.3.4', '62085': '3.3.5', '62086': '3.3.6',
  '62091': '3.4.1', '62092': '3.4.2', '62093': '3.4.3', '62094': '3.4.4',
  // 62100 Kerjasama Pengamanan Pasar dengan APH: the current lampiran outline
  // numbers this 1.4.1 (group 1.4 Pemeliharaan Keamanan dan Ketertiban); the
  // legacy RKA numbered it 4.1.1 — that slot is now Beban Pokok's, so the old
  // mapping silently dropped every keamanan journal from the LRA.
  '62100': '1.4.1',

  // Beban Operasional — parent/group accounts
  '62010': '1.1.1', '62020': '1.2.1', '62030': '1.3.1', '62040': '2.1.1', '62050': '2.2.1',
  '62060': '3.1.1', '62070': '3.2.1', '62080': '3.3.1', '62090': '3.4.1',

  // Penerimaan — leaf accounts
  '41001': '1.1', '41002': '1.2', '41003': '1.3', '41004': '1.4',
  '41006': '1.3', // 41006 Pendapatan Sampah/Kebersihan Antasari → outline 1.3 (Unit Kebersihan/Sampah)
  '41005': '1.6', '41007': '1.7', '41008': '1.8', '41009': '1.5', // 41009 Pendapatan Perizinan → outline 1.5

  '42001': '2.1', '42002': '2.2', '42003': '2.3', '42004': '2.4', '42005': '2.5',
  '42006': '2.6', '42007': '2.2', '42008': '2.7', '42009': '2.8', '42010': '2.9', '42011': '2.10',
  '70001': '3.1',

  // Penerimaan — parent/group accounts
  '41000': '1.1', '42000': '2.1', '70000': '3.1',

  // Beban di Luar Operasional (80xxx) — non-operational expenses (no RKA budget)
  '80001': '1.1', // Beban Bunga Bank / Beban Pajak Bank
  '80002': '1.2', // Beban Administrasi Bank
  '80003': '1.3', // Beban Lain-lain
  '80004': '1.3', // Beban Kerugian Persediaan (shown with lain-lain)
  '80000': '1.1', // parent fallback
}

// ─── Header-coded journals: Sub Akun decides the real account ────────────────
// The finance division journals every non-operating item at the GROUP code
// (70000 / 80000) and distinguishes the real account only in the Sub Akun text
// — including Pajak Penghasilan (PPh badan, account 99999!), which is journaled
// as "80000 Beban di Luar Operasional > Pajak Penghasilan". The official Excel
// splits these by Sub Akun name (DATA LAMPIRAN NERACA rows 95–105 use SUMIFS on
// the Sub Akun column); an app that buckets by the leading code alone puts the
// whole June PPh (Rp 423.367.799) into Beban Non-Operasional and shifts every
// Laba Rugi subtotal. See docs/FORMULA_SPEC_LAMPIRAN_JUNI_2026.md §3.3.
const HEADER_SUBAKUN_REROUTE = {
  '80000': [
    [/pajak\s*penghasilan/i, '99999'],
    [/pajak\s*bank/i, '80001'],
    [/administrasi\s*bank|admin\s*bank/i, '80002'],
    [/kerugian\s*persediaan/i, '80004'],
  ],
  '70000': [
    [/bunga|jasa\s*giro/i, '70001'],
    [/penjualan\s*aset/i, '70002'],
    [/selisih\s*lebih/i, '70003'],
  ],
  // Revenue is journaled at the group codes 41000/42000 with the income stream
  // named only in the Sub Akun; the official LRA Penerimaan realizes each
  // stream on its own outline row (annex DATA LAMPIRAN LABA RUGI per-sub-akun
  // SUMIFs). Order matters: more specific keywords first.
  '41000': [
    [/keamanan[^]*antasari|antasari[^]*keamanan/i, '41007'],
    [/antasari/i, '41006'],
    [/toko|kios|bulanan/i, '41001'],
    [/pkl|pelataran|kaki\s*lima|harian/i, '41002'],
    [/kebersihan|sampah/i, '41003'],
    [/denda/i, '41004'],
    [/perizinan/i, '41009'],
    [/pengelolaan\s*lain/i, '41005'],
    [/keamanan/i, '41007'],
    [/ramayana/i, '41008'],
  ],
  '42000': [
    [/parkir/i, '42001'],
    [/event|kreasi/i, '42002'],
    [/cemara/i, '42007'],
    [/kuliner|fo+dcourt/i, '42003'],
    [/pengiriman/i, '42004'],
    [/live\s*selling|studio/i, '42005'],
    [/reklame|iklan|promosi/i, '42006'],
    [/bahan\s*pokok|grosir/i, '42008'],
    [/inflasi/i, '42009'],
    [/air\s*minum|isi\s*ulang/i, '42010'],
    [/lpg|gas/i, '42011'],
  ],
}

/**
 * Effective account code for a header-coded posting: given the parent code and
 * the free-text Sub Akun, return the real account code (e.g. 80000 +
 * "Pajak Penghasilan" → 99999) or null when no reroute applies.
 */
export function effectiveSubCode(parentCode, subText) {
  const rules = HEADER_SUBAKUN_REROUTE[String(parentCode || '')]
  if (!rules || !subText) return null
  const s = String(subText)
  for (const [re, code] of rules) if (re.test(s)) return code
  return null
}

// Route a fixed-asset posting to its lampiran " Investasi" outline. Returns the
// LEAF rincian outline (e.g. '1.5.2', '1.3.6') when the asset code + keterangan
// identify one, a program outline ('1.3', '1.5') as fallback, or null when the
// posting is not belanja-modal realisasi at all. 12300 Aset Dalam Penyelesaian
// is deliberately null: the division's lampiran counts only CAPITALIZED assets
// as realized investment (June: ADP progress payments flow to AK operasi and
// appear in no Investasi line; the capitalization journal 12102 ← 12300 carries
// the realization instead).
export function getInvestasiOutline(accCode, keterangan = '') {
  const code = String(accCode)
  const desc = String(keterangan).toLowerCase()

  // Akumulasi penyusutan / amortisasi contra-accounts (12102.2 … 12204.2,
  // 13101.2) are depreciation, not belanja modal — never a realization (their
  // credits used to bleed in as negative investasi).
  if (/^1[23]\d{3}\.2(?!\d)/.test(code)) return null

  if (code.startsWith('12102')) {
    // Bangunan — program by location/purpose (lampiran rincian rows). The KAP
    // convention keeps the journal itself generic ("Bangunan pada Bank Kalsel",
    // rapat 16-07-2026), so the keterangan keyword IS the RKA routing. Order is
    // load-bearing: 'kantor' outranks 'pasar baru' ("Perbaikan Fasilitas
    // Kantor … (Kantor letak di Pasar Baru)" = lampiran 6.1 182.700.000), and
    // the 1.6 road/lighting works outrank market names (RKA words them as
    // "akses jalan Pasar Lima/Cemara/Jahri Saleh", "penerangan Pasar Pandu…").
    if (desc.includes('gudang')) return '2.1'
    if (desc.includes('kantor')) return '6.1'
    if (desc.includes('akses jalan') || desc.includes('pedestrian')) return '1.6.1'
    if (desc.includes('penerangan')) return '1.6.2'
    if (desc.includes('food court') || desc.includes('foodcourt')) return '4.2'
    if (desc.includes('gerai inflasi')) return '4.3'
    if (desc.includes('sni') || desc.includes('percontohan')) return '1.1'
    if (desc.includes('tungging')) return '1.4.1'
    if (desc.includes('cemara')) return '1.4.2'
    // 'pasar baru' per the June register: "Perbaikan Atap Pasar Baru"
    // 193.596.250 sits on lampiran " Investasi" 1.5.a (Pasar Baru Permai Dasar).
    if (desc.includes('baru permai') || desc.includes('pasar baru') || desc.includes('acp') || desc.includes('neon box')) return '1.5.1'
    if (desc.includes('antasari')) return '1.5.2'
    if (desc.includes('teluk dalam')) return '1.5.3'
    if (desc.includes('kuripan')) return '1.5.4'
    if (desc.includes('malabar')) return '1.5.5'
    return '1.5'
  }
  // COA: 12201 = Kendaraan, 12202 = Mesin (see the akumulasi 12201.2/12202.2
  // rows in the division's journals).
  if (code.startsWith('12201')) return '1.3.1'
  if (code.startsWith('12202')) {
    if (desc.includes('pemadam') || desc.includes('apar')) return '1.3.2'
    // RKA 4.5 "Mesin isi ulang air galon" (2025 precedent: "MESIN DEPOT AIR
    // MINUM" was the only Mesin asset).
    if (desc.includes('galon') || desc.includes('isi ulang') || desc.includes('depo air') || desc.includes('depot air')) return '4.5'
    return '1.3'
  }
  if (code.startsWith('12203')) {
    if (desc.includes('tungging') || desc.includes('lampu halaman')) return '1.4.1'
    if (desc.includes('penerangan') || desc.includes('lampu jalan')) return '1.6.2'
    return '1.3.6'
  }
  if (code.startsWith('12204')) {
    if (desc.includes('studio') || desc.includes('live') || desc.includes('kamera') || desc.includes('selling')) return '3.1'
    if (desc.includes('cctv')) return '1.3.4'
    if (desc.includes('papan nama')) return '1.3.5'
    if (desc.includes('bak ') || desc.includes('kontainer')) return '1.3.3'
    if (desc.includes('galon')) return '4.5'
    if (desc.includes('lpg') || desc.includes('tabung gas')) return '4.6'
    if (desc.includes('tap kartu') || desc.includes('pembayaran digital') || desc.includes('edc')) return '5.2'
    if (desc.includes('gerai inflasi')) return '4.3'
    if (desc.includes('pengiriman')) return '3.2'
    if (desc.includes('retribusi') || desc.includes('karcis') || desc.includes('timbangan')) return '1.3'
    return '6.2'
  }
  // 13101 Aset Tidak Berwujud — RKA program 5 (Pengembangan TI): the 49jt
  // "Pengembangan sistem informasi akuntansi" realisasi (lampiran 5.1) is
  // capitalized software, journaled on 13101.1. 13101.2 amortisasi is already
  // filtered by the .2 guard above.
  if (code.startsWith('13101')) {
    if (desc.includes('pembayaran') || desc.includes('tap kartu')) return '5.2'
    return '5.1'
  }
  return null
}

export function resolveUmumOutline(accountCode, keterangan = '') {
  const code = String(accountCode)
  const desc = String(keterangan).toLowerCase()

  if (code === '61050') {
    if (desc.includes('telpon') || desc.includes('telepon')) return '5.1'
    if (desc.includes('air') || desc.includes('pdam')) return '5.2'
    if (desc.includes('listrik') || desc.includes('pln')) return '5.3'
    if (desc.includes('wifi') || desc.includes('internet') || desc.includes('indihome') || desc.includes('biznet')) return '5.4'
    if (desc.includes('website') || desc.includes('aplikasi') || desc.includes('domain') || desc.includes('hosting')) return '5.5'
    return null
  }
  if (code === '61080') {
    if (desc.includes('mobil operasional') || (desc.includes('mobil') && !desc.includes('keliling') && !desc.includes('dewas') && !desc.includes('pengawas'))) return '8.1'
    if (desc.includes('keliling')) return '8.2'
    if (desc.includes('truck') || desc.includes('truk')) return '8.3'
    if (desc.includes('pickup') || desc.includes('pick up')) return '8.4'
    if (desc.includes('genset') || desc.includes('mesin') || desc.includes('cacah')) return '8.5'
    if (desc.includes('pengawas') || desc.includes('dewas') || desc.includes('ketua')) return '8.6'
    // "BBM Direksi" rides the mobil operasional (lampiran Juni: 8.1 carries it).
    if (desc.includes('direksi')) return '8.1'
    return null
  }
  if (code === '61010') {
    if (desc.includes('direksi') || desc.includes('direktur')) return '1.1'
    if (desc.includes('karyawan') || desc.includes('pegawai') || desc.includes('pokok')) return '1.2'
    if (desc.includes('pengawas') || desc.includes('dewas')) return '1.3'
    return null
  }
  if (code === '61020') {
    if (desc.includes('jabatan')) return '2.1'
    if (desc.includes('fungsional') || desc.includes('koordinator')) return '2.2'
    if (desc.includes('transport')) return '2.3'
    if (desc.includes('makan')) return '2.4'
    if (desc.includes('kesehatan') || desc.includes('jkn') || desc.includes('bpjs kes')) return '2.5'
    if (desc.includes('ketenagakerjaan') || desc.includes('jkk') || desc.includes('jkm') || desc.includes('jht') || desc.includes('bpjs ket')) return '2.6'
    if (desc.includes('hari raya') || desc.includes('thr')) return '2.7'
    if (desc.includes('representatif') || desc.includes('representasi')) return '2.8'
    if (desc.includes('pajak') || desc.includes('pph') || desc.includes('pph 21') || desc.includes('pph21')) return '2.9'
    return null
  }
  if (code === '61030') {
    if (desc.includes('adat direksi')) return '3.1'
    if (desc.includes('psl')) return '3.2'
    // sasirangan BEFORE the pdh/karyawan catch-all: the RKA row 3.4 name is
    // "Kain sasirangan (karyawan + Direksi + Dewas)" — the parenthetical
    // 'karyawan' must not drag it onto 3.3 (Juli 2026: U0017 Rp 5.000.000).
    if (desc.includes('sasirangan')) return '3.4'
    if (desc.includes('pdh') || desc.includes('karyawan')) return '3.3'
    if (desc.includes('adat ketua') || desc.includes('adat dewas') || desc.includes('adat dewan')) return '3.5'
    if (desc.includes('loket') || desc.includes('seragam loket')) return '3.6'
    return null
  }
  if (code === '61040') {
    // The division journals plain stationery as Sub Akun "Beban ATK" (an alias
    // that exists in no COA row — see docs/EXCEL_FLAWS_JUNI_2026.md C9); it
    // belongs on the official LRA row 4.1 "Beban alat tulis kantor".
    if (desc.includes('atk') || desc.includes('alat tulis')) return '4.1'
    if (desc.includes('pos') || desc.includes('benda pos') || desc.includes('meterai') || desc.includes('paket') || desc.includes('surat')) return '4.2'
    if (desc.includes('stempel')) return '4.3'
    return null
  }
  if (code === '61060') {
    if (desc.includes('rapat')) return '6.1'
    if (desc.includes('tamu') || desc.includes('kunjungan') || desc.includes('sosialisasi')) return '6.2'
    if (desc.includes('lapangan') || desc.includes('aktivitas')) return '6.3'
    if (desc.includes('kegiatan') || desc.includes('kantor') || desc.includes('rutin')) return '6.4'
    return null
  }
  if (code === '61070') {
    if (desc.includes('instalasi') || desc.includes('listrik') || desc.includes('air') || desc.includes('pipa') || desc.includes('kabel')) return '7.2'
    if (desc.includes('bangunan') || desc.includes('gedung') || desc.includes('asuransi') || desc.includes('renovasi') || desc.includes('atap')) return '7.3'
    if (desc.includes('perlengkapan') || desc.includes('peralatan') || desc.includes('atk') || desc.includes('alat tulis')) return '7.1'
    return null
  }
  if (code === '61090') {
    if (desc.includes('pengawas') || desc.includes('dewas') || desc.includes('dewan')) return '9.2'
    // Lampiran 9.1 = "Karyawan dan Direksi" (division journals Sub Akun
    // "Karyawan", keterangan "SPPD Dirut ke Jakarta" etc.).
    if (desc.includes('karyawan') || desc.includes('direksi') || desc.includes('dirut') || desc.includes('sppd')) return '9.1'
    return null
  }
  if (code === '61100') {
    if (desc.includes('pengawas') || desc.includes('dewas')) return '10.2'
    if (desc.includes('pedagang')) return '10.3'
    // Lampiran 10.1 = "Diklat/Bimtek Direksi dan Karyawan".
    if (desc.includes('direksi') || desc.includes('karyawan') || desc.includes('pegawai') || desc.includes('diklat') || desc.includes('bimtek') || desc.includes('pelatihan')) return '10.1'
    return null
  }
  if (code === '61120') {
    if (desc.includes('konsultan') || desc.includes('rencana bisnis')) return '12.1'
    if (desc.includes('seleksi') || desc.includes('pegawai') || desc.includes('rekrutmen')) return '12.2'
    if (desc.includes('audit') || desc.includes('kap') || desc.includes('laporan keuangan') || desc.includes('akuntan')) return '12.3'
    if (desc.includes('tarif') || desc.includes('penyesuaian') || desc.includes('kajian')) return '12.4'
    if (desc.includes('pendataan') || desc.includes('pedagang')) return '12.5'
    return null
  }
  if (code === '61140') {
    if (desc.includes('narasumber') || desc.includes('pemateri')) return '13.2'
    if (desc.includes('bingkisan') || desc.includes('lebaran') || desc.includes('parcel')) return '13.3'
    if (desc.includes('transport') || desc.includes('rapat')) return '13.4'
    if (desc.includes('jilid') || desc.includes('laporan') || desc.includes('print') || desc.includes('cetak')) return '13.5'
    if (desc.includes('parkir')) return '13.6'
    if (desc.includes('video') || desc.includes('profil')) return '13.7'
    if (desc.includes('17') || desc.includes('agustus') || desc.includes('lomba') || desc.includes('kemerdekaan')) return '13.8'
    if (desc.includes('buka puasa') || desc.includes('ramadhan') || desc.includes('bukber')) return '13.9'
    if (desc.includes('souvenir') || desc.includes('cinderamata') || desc.includes('plakat') || desc.includes('akrilik')) return '13.10'
    if (desc.includes('logo') || desc.includes('sayembara')) return '13.11'
    if (desc.includes('olahraga') || desc.includes('senam') || desc.includes('futsal') || desc.includes('badminton')) return '13.12'
    if (desc.includes('hari jadi') || desc.includes('tanglong') || desc.includes('jukung') || desc.includes('banjarmasin')) return '13.13'
    if (desc.includes('hut') || desc.includes('ulang tahun') || desc.includes('peringatan')) return '13.14'
    return null
  }
  return null
}

export function resolveOperasionalOutline(accountCode, keterangan = '') {
  const code = String(accountCode)
  const desc = String(keterangan).toLowerCase()

  if (code === '62010') {
    if (desc.includes('pajak')) return '1.1.1'
    if (desc.includes('parkir')) return '1.1.2'
    if (desc.includes('truck') || desc.includes('truk')) return '1.1.3'
    if (desc.includes('pickup') || desc.includes('pick up') || desc.includes('bak')) return '1.1.4'
    if (desc.includes('keliling')) return '1.1.5'
    if (desc.includes('tossa') || desc.includes('roda 3') || desc.includes('motor')) return '1.1.6'
    return null
  }
  if (code === '62030') {
    if (desc.includes('segel') || desc.includes('penyegelan')) return '1.3.1'
    if (desc.includes('bersih') || desc.includes('kebersihan') || desc.includes('sapu') || desc.includes('alat') || desc.includes('bahan')) return '1.3.2'
    return null
  }
  if (code === '62040') {
    if (desc.includes('sewa') || desc.includes('perjanjian') || desc.includes('kontrak sewa')) return '2.1.1'
    if (desc.includes('segel')) return '2.1.2'
    if (desc.includes('karcis') || desc.includes('retribusi') || desc.includes('harian')) return '2.1.3'
    return null
  }
  if (code === '62060') {
    if (desc.includes('harian') || desc.includes('lepas') || desc.includes('thl')) return '3.1.2'
    return null
  }
  if (code === '62070') {
    if (desc.includes('thr') || desc.includes('hari raya')) return '3.2.1'
    if (desc.includes('ketenagakerjaan') || desc.includes('jkk') || desc.includes('jkm') || desc.includes('bpjs ket')) return '3.2.2'
    if (desc.includes('kesehatan') || desc.includes('jkn') || desc.includes('bpjs kes')) return '3.2.3'
    return null
  }
  if (code === '62080') {
    if (desc.includes('rompi') || desc.includes('penagihan')) return '3.3.1'
    if (desc.includes('baju') || desc.includes('pakaian')) {
      if (desc.includes('kebersihan')) return '3.3.2'
      if (desc.includes('parkir')) return '3.3.5'
    }
    if (desc.includes('kebersihan') || desc.includes('menyapu')) return '3.3.3'
    if (desc.includes('id card') || desc.includes('pin') || desc.includes('name tag')) return '3.3.4'
    if (desc.includes('parkir') || desc.includes('juru parkir')) return '3.3.5'
    if (desc.includes('keamanan') || desc.includes('security') || desc.includes('satpam')) return '3.3.6'
    return null
  }
  if (code === '62090') {
    if (desc.includes('kontrak') || desc.includes('sopir') || desc.includes('satpam') || desc.includes('ob') || desc.includes('driver') || desc.includes('security') || desc.includes('office boy')) return '3.4.2'
    if (desc.includes('harian') || desc.includes('lepas') || desc.includes('thl')) return '3.4.3'
    if (desc.includes('insentif') || desc.includes('penagihan') || desc.includes('tagih')) return '3.4.4'
    if (desc.includes('lembur')) return '3.4.1'
    return null
  }
  return null
}

/**
 * Extract the COA account code from a journal account string ("CODE NAME
 * [> SUBAKUN]"). When the Sub Akun (after " > ") was chosen from the full COA it
 * carries its own leading numeric code; that sub-code is the real account and is
 * returned instead of the parent. STRICTLY gated on a numeric sub-code so the
 * legacy free-text sub_akun names (never start with a digit) keep resolving to
 * the parent code and existing LRA attribution is unchanged.
 */
export function extractAccountCode(accountString) {
  if (!accountString) return null
  const s = String(accountString)
  // Keep dotted sub-codes intact (e.g. "12203.1 - Instalasi Listrik" → 12203.1);
  // the trailing \d alternative stops a capture from ending on the dot itself.
  const parentMatch = s.match(/^(\d[\d.]*\d|\d)/)
  const parent = parentMatch ? parentMatch[1] : null
  const gt = s.indexOf(' > ')
  if (gt >= 0) {
    const sub = s.slice(gt + 3).trim()
    const sm = sub.match(/^(\d[\d.]*\d|\d)/)
    if (sm) return sm[1]
    // Free-text Sub Akun on a header code (70000/80000): the Sub Akun names the
    // real account (division convention — PPh is journaled as 80000 > Pajak
    // Penghasilan). Reroute so classification matches the official Excel.
    const rerouted = effectiveSubCode(parent, sub)
    if (rerouted) return rerouted
  }
  return parent
}

/**
 * Combine the free-text Sub Akun of a journal account string with the journal
 * keterangan into one descriptor for the keyword resolvers. The finance form
 * lets the user pick a parent account (e.g. "61140 Beban Umum Lain-lain") plus
 * a Sub Akun ("Souvenir"); the sub-akun choice is the strongest signal of which
 * outline row the posting belongs to, so it must participate in the
 * description-based resolution — otherwise the journal ends up unmapped even
 * though the user classified it explicitly (Juni 2026 finding: Souvenir /
 * Perlengkapan postings missing from the LRA).
 * Coded sub-akun ("61150 - Beban Souvenir") already resolve via their own code
 * in extractAccountCode, so including their label here is harmless.
 */
export function subAkunDesc(accountString, keterangan = '') {
  const s = String(accountString || '')
  const gt = s.indexOf(' > ')
  if (gt >= 0) {
    const sub = s.slice(gt + 3).trim()
    if (sub) return `${sub} ${keterangan || ''}`
  }
  return keterangan || ''
}

/**
 * Resolve with the Sub Akun as the FIRST-priority signal: when the journal
 * carries a free-text Sub Akun that names a leaf ("Beban Tunjangan
 * Fungsional", "Beban Makan Minum Kegiatan Kantor"), that explicit choice must
 * win over keywords that happen to appear in the keterangan. June 2026
 * verification: three postings landed one row off because the combined
 * sub+keterangan text hit an earlier keyword — "Tunjangan Jabatan Koordiantor"
 * (sub: Fungsional) → 2.1 not 2.2, "Sosialisasi …" (sub: Kegiatan Kantor)
 * → 6.2 not 6.4, "Pembelian Kabel 3 Meter" (sub: Perlengkapan) → 7.2 not 7.1.
 * Coded subs ("61150 - …") are skipped: extractAccountCode already resolved
 * them to the leaf code. Falls back to the combined text so keterangan-only
 * journals keep resolving exactly as before.
 */
export function resolveWithSubPriority(resolver, code, accountString, keterangan = '') {
  const s = String(accountString || '')
  const gt = s.indexOf(' > ')
  if (gt >= 0) {
    const sub = s.slice(gt + 3).trim()
    if (sub && !/^\d/.test(sub)) {
      const o = resolver(code, sub)
      if (o) return o
    }
  }
  return resolver(code, subAkunDesc(accountString, keterangan))
}

/**
 * Parent/group accounts that carry a description-based resolver (resolveUmum*
 * / resolveOperasional*). When such a parent is used WITHOUT a descriptive
 * keterangan, its resolver returns null and we must NOT silently fall back to
 * the first child leaf (e.g. 62010 → "1.1.1"); it is left UNMAPPED instead.
 */
export const DESCRIPTIVE_PARENT_CODES = new Set([
  '61010', '61020', '61030', '61040', '61050', '61060', '61070', '61080',
  '61090', '61100', '61120', '61140',
  '62010', '62030', '62040', '62060', '62070', '62080', '62090',
])

/**
 * Resolve an account code to an LRA/NPD outline number.
 * Tries description-based overrides for parent accounts, then the exact code,
 * then progressively shorter prefixes (e.g. 61050 → 6105 → 610 → 61 → 6).
 *
 * Ambiguous descriptive parents (DESCRIPTIVE_PARENT_CODES) whose keterangan
 * matched no keyword resolve to null (unmapped) rather than the wrong
 * first-child leaf — the leaf codes themselves (e.g. 62013) still resolve via
 * ACCOUNT_TO_OUTLINE.
 */
export function resolveOutline(accountCode, keterangan = '') {
  if (!accountCode) return null
  const code = String(accountCode)
  const umumOutline = resolveUmumOutline(code, keterangan)
  if (umumOutline) return umumOutline
  const operasionalOutline = resolveOperasionalOutline(code, keterangan)
  if (operasionalOutline) return operasionalOutline
  if (DESCRIPTIVE_PARENT_CODES.has(code)) return null
  if (ACCOUNT_TO_OUTLINE[code]) return ACCOUNT_TO_OUTLINE[code]
  let prefix = code
  while (prefix.length > 1) {
    prefix = prefix.slice(0, -1)
    if (ACCOUNT_TO_OUTLINE[prefix]) return ACCOUNT_TO_OUTLINE[prefix]
  }
  return null
}

/**
 * Resolve a Beban Operasional (62xxx) account code to its outline number for
 * DELTA attribution, distinguishing the "ambiguous parent" case.
 * Returns { outline } when resolved, or { unmapped: true } when the account is
 * an ambiguous parent (so the delta is surfaced as unmapped, never dumped on
 * the first-child leaf 1.1.1).
 */
export function resolveBebanOpsOutline(accountCode, keterangan = '') {
  const c = String(accountCode || '')
  const op = resolveOperasionalOutline(c, keterangan)
  if (op) return { outline: op }
  // A genuinely-ambiguous descriptive parent (carries a keyword-based resolver,
  // e.g. 62010) with no matching keyword stays unmapped — never silently dumped
  // on its first-child leaf.
  if (DESCRIPTIVE_PARENT_CODES.has(c)) return { unmapped: true }
  // Any other code with a DIRECT outline entry resolves, even if it ends in 0:
  // codes like 62020→1.2.1 and 62100→1.4.1 are real aggregate lines in the Excel
  // outline (not ambiguous parents), so a trailing 0 must NOT force "unmapped".
  if (ACCOUNT_TO_OUTLINE[c]) return { outline: ACCOUNT_TO_OUTLINE[c] }
  return { unmapped: true }
}

/**
 * Overlay a set of (already expanded) delta journals onto the snapshot rows of
 * the LRA "Beban Operasional" report (rows: [{ outline, nama, bulanIni }]).
 * Returns { rows: { outline -> { outline, nama, value } }, unmapped: [...] }.
 * Only debit legs of 62xxx accounts move the report; ambiguous parents are
 * collected in `unmapped` instead of being attributed to the wrong leaf.
 */
export function buildBebanOpsRows(baseRows, journals) {
  const rows = {}
  ;(baseRows || []).forEach(r => { rows[r.outline] = { outline: r.outline, nama: r.nama, value: r.bulanIni } })
  const unmapped = []
  for (const j of (journals || [])) {
    const dCode = extractAccountCode(j.akun_debit)
    if (!dCode || !j.debit) continue
    // Cash-basis Beban Pokok (official LRA §IV): the lampiran realizes inventory
    // PURCHASES (debits to 11401/11402), not the accrual COGS 51xxx — June:
    // 189.918.200 + 4.880.000 = 194.798.200 vs accrual 189.138.200.
    const pokok = CASH_BASIS_BEBAN_POKOK[dCode]
    if (pokok) { if (rows[pokok]) rows[pokok].value += j.debit; continue }
    if (!/^62/.test(dCode)) continue
    const spOutline = resolveWithSubPriority(resolveOperasionalOutline, dCode, j.akun_debit, j.keterangan)
    const res = spOutline ? { outline: spOutline } : resolveBebanOpsOutline(dCode, subAkunDesc(j.akun_debit, j.keterangan))
    if (res.outline && rows[res.outline]) rows[res.outline].value += j.debit
    else if (res.unmapped) unmapped.push({ code: dCode, amt: j.debit, keterangan: j.keterangan })
  }
  return { rows, unmapped }
}

// ─── Cash-basis LRA specials (official lampiran conventions) ─────────────────
// Penerimaan outline 1.6 "Pendapatan Pengelolaan Lain-lain" = CREDITS to
// Piutang Usaha 11201 (receivable collections count as cash-basis receipts;
// the Excel reads DATA LAMPIRAN NERACA!G15 — credits only, debits ignored).
// Beban Pokok outlines 4.1/4.2 = DEBITS to the inventory accounts (purchases).
export const CASH_BASIS_PIUTANG_CODE = '11201'
export const CASH_BASIS_PIUTANG_OUTLINE = '1.6'
// Division convention per the June book (confirmed 17-07-2026): ALL inventory
// purchases — bapok 11401 AND gas LPG 11402 — realize on LRA row 4.1 (Beban
// Pokok Perdagangan Bahan Pokok dan penting); 4.2 (Gerai Inflasi) carries only
// audited-month figures. 11402 used to map to 4.2 and sat one row off the book.
export const CASH_BASIS_BEBAN_POKOK = { '11401': '4.1', '11402': '4.1' }

/**
 * Group parents for the Buku Besar (General Ledger): selecting one of these in
 * the account picker must aggregate its child leaf accounts too, mirroring the
 * finance division's Excel where the buku besar is a per-COA-group summary.
 * The COA numbers groups as <prefix>0 with leaves <prefix>1..9 (e.g. 61060
 * Beban Konsumsi Rapat dan Tamu → 61061..61065) — note the parent code is NOT
 * a string prefix of its children, which is why plain startsWith matching
 * showed an empty ledger for these groups (Juni 2026 finding).
 */
export const GROUP_PARENT_CODES = new Set([
  ...DESCRIPTIVE_PARENT_CODES,
  '61110', '61130', '62020', '62050',
  '41000', '42000', '70000', '80000',
])

/**
 * Prefixes of the account codes belonging to a group parent's ledger, or null
 * when the code is not a known group parent (leaf accounts match exactly).
 */
export function ledgerGroupPrefixes(code) {
  const c = String(code || '')
  if (!GROUP_PARENT_CODES.has(c)) return null
  if (c === '61140') return ['6114', '6115'] // outline group 13.x spans 61141–61154
  if (c === '41000' || c === '42000' || c === '70000' || c === '80000') return [c.slice(0, 3)] // whole revenue class
  return [c.slice(0, -1)] // decade group: 61060 → 6106x
}

/** Which NPD/LRA category an expense account code belongs to. */
export function categoryKeyForCode(code) {
  const c = String(code || '')
  if (c.startsWith('61')) return 'bebanUmum'
  if (c.startsWith('62')) return 'bebanOperasional'
  if (c.startsWith('12') || c.startsWith('13')) return 'bebanInvestasi'
  if (c.startsWith('80')) return 'bebanLainnya'
  return null
}
