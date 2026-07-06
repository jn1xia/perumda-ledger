const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();

const FILES = {
  jan: { path: 'src/FILES/File Data Aplicasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026/DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026.xlsx', lrSheet: 'LABA RUGI JAN 2026', neracaSheet: 'NERACA JAN 2026', akSheet: 'ARUS KAS 2026', aktSheet: 'DAFTAR AKTIVA TETAP', penySheet: 'PENYUSUTAN PERALATAN' },
  feb: { path: 'src/FILES/LAMPIRAN LAPORAN KEUANGAN FEBRUARI 2026.xlsx',   lrSheet: 'LABA RUGI FEB 2026',   neracaSheet: 'NERACA FEB 2026',   akSheet: 'ARUS KAS 2026',      aktSheet: 'DAFTAR AKTIVA TETAP', penySheet: 'PENYUSUTAN PERALATAN' },
  mar: { path: 'src/FILES/LAMPIRAN LAPORAN KEUANGAN MARET 2026.xlsx',      lrSheet: 'LABA RUGI MARET 2026', neracaSheet: 'NERACA MARET 2026', akSheet: 'ARUS KAS MARET 2026', aktSheet: 'DAFTAR AKTIVA TETAP', penySheet: 'PENYUSUTAN PERALATAN' },
  apr: { path: 'src/FILES/LAMPIRAN LAPORAN KEUANGAN APRIL 2026.xlsx',      lrSheet: 'LABA RUGI APRIL 2026', neracaSheet: 'NERACA APRIL 2026', akSheet: 'ARUS KAS APRIL 2026', aktSheet: 'DAFTAR AKTIVA TETAP', penySheet: 'PENYUSUTAN PERALATAN' },
};

// Fix jan path
const fs = require('fs');
if (!fs.existsSync(FILES.jan.path)) {
  FILES.jan.path = 'src/FILES/File Data Aplikasi Keuangan NPD (Nota Pencairan Dana) Perumda Pasar Banjarmasin 2026/DRAFT AUDITED - LAMPIRAN LAPORAN BULAN JANUARI 2026.xlsx';
}

function loadWb(f) { return XLSX.readFile(f.path); }
function rows(wb, name) {
  const ws = wb.Sheets[name]; if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
}

// Get numeric value by row index (0-based) and preferred column
function numAt(ws_rows, rowIdx, colIdx) {
  const row = ws_rows[rowIdx];
  if (!row) return null;
  // Try specified col first, then scan
  if (colIdx !== undefined && typeof row[colIdx] === 'number') return row[colIdx];
  return row.find(c => typeof c === 'number') ?? null;
}

// Build label->value map from a LR-style sheet
function lrMap(wb, sheetName) {
  const m = {};
  rows(wb, sheetName).forEach(row => {
    // label is the first non-empty string cell
    const lbl = row.map(c => String(c||'').trim()).find(c => c.length > 2 && isNaN(c));
    const val = row.find(c => typeof c === 'number');
    if (lbl && val !== undefined) {
      m[lbl] = (m[lbl] === undefined) ? val : m[lbl]; // keep first occurrence
    }
  });
  return m;
}

// Build label->value map from a Neraca-style sheet
function neracaMap(wb, sheetName) {
  const m = {};
  rows(wb, sheetName).forEach(row => {
    const lbl = String(row[0]||row[1]||'').trim();
    const val = row.find(c => typeof c === 'number');
    if (lbl && val !== undefined) m[lbl] = val;
  });
  return m;
}

// Normalise label for fuzzy matching
const norm = s => String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/\s+/g,'');

function getVal(map, ...aliases) {
  for (const a of aliases) {
    const k = Object.keys(map).find(k => norm(k).includes(norm(a)) || norm(a).includes(norm(k)));
    if (k !== undefined) return map[k];
  }
  return null;
}

// Database connection
const db = new sqlite3.Database('server/perumda_ledger.db');

const MONTHS = { jan:'2026-01', feb:'2026-02', mar:'2026-03', apr:'2026-04' };
const MONTH_LABELS = { jan:'JANUARI', feb:'FEBRUARI', mar:'MARET', apr:'APRIL' };

function getProg(month, cb) {
  db.all("SELECT * FROM journals WHERE status='posted' AND tanggal LIKE '"+month+"%'", (err, J) => {
    const sumD = p => J.reduce((s,j) => s+((j.akun_debit||'').split(' ')[0].startsWith(p)?(j.debit||0):0), 0);
    const sumK = p => J.reduce((s,j) => s+((j.akun_kredit||'').split(' ')[0].startsWith(p)?(j.kredit||0):0), 0);
    const bungaBank = J.reduce((s,j) => { const c=(j.akun_kredit||'').split(' ')[0]; const n=j.akun_kredit||''; return s+((c==='70001'||(c==='70000'&&/bunga/i.test(n)))?(j.kredit||0):0); }, 0);
    const pajakBank = J.reduce((s,j) => { const c=(j.akun_debit||'').split(' ')[0]; const n=j.akun_debit||''; return s+((c==='80001'||(c==='80000'&&/pajak/i.test(n)))?(j.debit||0):0); }, 0);
    const adminBank = J.reduce((s,j) => { const c=(j.akun_debit||'').split(' ')[0]; const n=j.akun_debit||''; return s+((c==='80002'||(c==='80000'&&/admin/i.test(n)))?(j.debit||0):0); }, 0);

    const lr = {
      pendBisnis: sumK('41'), pendPengembangan: sumK('42'),
      bppBapok: sumD('51010'), bppLPG: sumD('51020'),
      bpp: sumD('51'),
      gaji: sumD('61010'), tunjangan: sumD('61020'), kelengkapanUm: sumD('61030'),
      atk: sumD('61041'), listrik: sumD('61050'), konsumsi: sumD('61060'),
      perlengkapan: sumD('61070'), bbm: sumD('61080'), perjalanan: sumD('61090'),
      pendidikan: sumD('61100'), sewa: sumD('61110'), jasa: sumD('61120'),
      penyusutan: sumD('6113'), umLain: sumD('61140'),
      bebanAdmin: sumD('61'),
      pemKendaraan: sumD('62010'), pemPasar: sumD('62020'), kebersihan: sumD('62030'),
      pelayanan: sumD('62040'), cetakan: sumD('62050'), honor: sumD('62060'),
      tunjanganOps: sumD('62070'), kelengkapanOps: sumD('62080'),
      insentif: sumD('62090'), keamanan: sumD('62100'),
      bebanOps: sumD('62'),
      pendNonOps: sumK('7'), bebanNonOps: sumD('8'),
      bungaBank, pajakBank, adminBank,
      bebanLain: sumD('80003'),
    };
    lr.pendUsaha = lr.pendBisnis + lr.pendPengembangan;
    lr.labaUsaha = lr.pendUsaha - lr.bpp - lr.bebanAdmin - lr.bebanOps;
    lr.labaBersih = lr.labaUsaha + lr.pendNonOps - lr.bebanNonOps;
    lr.ebitda = lr.labaBersih - lr.bungaBank + lr.pajakBank + lr.penyusutan;
    cb(lr);
  });
}

// Get YTD prog data (cumulative for Neraca)
function getProgYTD(month, cb) {
  const allMonths = Object.values(MONTHS).filter(m => m <= month);
  db.all("SELECT * FROM journals WHERE status='posted' AND tanggal <= '"+month+"-31'", (err, J) => {
    // Get COA saldo_awal
    db.all("SELECT code, name, saldo_awal FROM coa", (err2, coa) => {
      const saldoMap = {};
      (coa||[]).forEach(c => { saldoMap[c.code] = c.saldo_awal||0; });
      
      const netMove = (code, debitPlus) => {
        return J.reduce((s,j) => {
          const dc = (j.akun_debit||'').split(' ')[0];
          const kc = (j.akun_kredit||'').split(' ')[0];
          if (debitPlus) {
            if (dc === code || dc.startsWith(code+'.')) s += j.debit||0;
            if (kc === code || kc.startsWith(code+'.')) s -= j.kredit||0;
          } else {
            if (kc === code || kc.startsWith(code+'.')) s += j.kredit||0;
            if (dc === code || dc.startsWith(code+'.')) s -= j.debit||0;
          }
          return s;
        }, 0);
      };

      const acctBal = (code, isDebitNormal) => {
        const saldo = saldoMap[code] || 0;
        return saldo + netMove(code, isDebitNormal);
      };

      const n = {
        kasKecil: acctBal('11101', true),
        kasBelumSetor: acctBal('11102', true),
        bankKalsel: acctBal('11103', true),
        bankBNI: acctBal('11104', true),
        bankBNIBisnis: acctBal('11106', true),
        bankTapcash: acctBal('11107', true),
        piutang: acctBal('11201', true),
        persediaanBapok: acctBal('11401', true),
        persediaanLPG: acctBal('11402', true),
        bbmDibayar: acctBal('11501', true),
        tanah: acctBal('12101', true),
        bangunan: acctBal('12102.1', true),
        akmPenyBangunan: acctBal('12102.2', false),
        kendaraan: acctBal('12201.1', true),
        akmPenyKendaraan: acctBal('12201.2', false),
        mesin: acctBal('12202.1', true),
        akmPenyMesin: acctBal('12202.2', false),
        instalasi: acctBal('12203.1', true),
        akmPenyInstalasi: acctBal('12203.2', false),
        peralatan: acctBal('12204.1', true),
        akmPenyPeralatan: acctBal('12204.2', false),
        adp: acctBal('12300', true),
        utangUsaha: acctBal('21200', false),
        utangDaerah: acctBal('22300', false),
        biayaMhd: acctBal('21500', false),
        modalPerumda: saldoMap['31000'] || 850759100000,
        modalDisetor: saldoMap['32000'] || 15000000000,
        saldoLabaLalu: saldoMap['33000'] || 0,
      };
      cb(n);
    });
  });
}

// ─── Main comparison logic ──────────────────────────────────────────────────────

const R = (v) => v === null || v === undefined ? 'N/A' : Math.round(v).toLocaleString('id-ID');
const DIFF = (e, p) => {
  if (e === null || e === undefined) return '[Excel: N/A]';
  const diff = (p||0) - (e||0);
  if (Math.abs(diff) < 1) return '✅ MATCH';
  return '❌ SELISIH ' + (diff>0?'+':'') + Math.round(diff).toLocaleString('id-ID') + '  (P=' + R(p) + ' | E=' + R(e) + ')';
};

function runAll(results) {
  const lines = [];
  const push = s => lines.push(s);

  Object.entries(FILES).forEach(([key, f]) => {
    const month = MONTHS[key];
    const lbl   = MONTH_LABELS[key];
    const prog  = results.lr[key];
    const progN = results.neraca[key];
    const wb    = results.wb[key];
    const exLR  = lrMap(wb, f.lrSheet);
    const exN   = neracaMap(wb, f.neracaSheet);

    // ──────────────────────────────────────────────────
    push('\n' + '═'.repeat(70));
    push('  SHEET: LABA RUGI — ' + lbl);
    push('═'.repeat(70));

    const lrRows = [
      ['Pendapatan Bisnis Utama (41xxx)',          getVal(exLR,'Pendapatan Bisnis Utama'),               prog.pendBisnis],
      ['Pendapatan Pengembangan Bisnis (42xxx)',   getVal(exLR,'Pengembangan Bisnis'),                   prog.pendPengembangan],
      ['JUMLAH PENDAPATAN USAHA',                 getVal(exLR,'JUMLAH PENDAPATAN USAHA'),               prog.pendUsaha],
      ['BPP Bapok & Gerai Inflasi',               getVal(exLR,'Bapok'),                                 prog.bppBapok],
      ['BPP Gas LPG',                             getVal(exLR,'Gas LPG'),                               prog.bppLPG],
      ['JUMLAH BPP',                              getVal(exLR,'JUMLAH BEBAN POKOK'),                    prog.bpp],
      ['Beban Gaji',                              getVal(exLR,'Beban Gaji'),                            prog.gaji],
      ['Beban Tunjangan Pegawai Umum',            getVal(exLR,'Tunjangan Pegawai Umum'),                prog.tunjangan],
      ['Beban Kelengkapan Pegawai (Umum)',        getVal(exLR,'Beban Kelengkapan Pegawai'),             prog.kelengkapanUm],
      ['Beban Alat Tulis Kantor',                 getVal(exLR,'Alat Tulis Kantor'),                     prog.atk],
      ['Beban Telepon/Listrik/Air/Wifi',          getVal(exLR,'Telepon'),                               prog.listrik],
      ['Beban Konsumsi Rapat dan Tamu',           getVal(exLR,'Konsumsi Rapat'),                        prog.konsumsi],
      ['Beban Perlengkapan & Pemeliharaan Kantor',getVal(exLR,'Perlengkapan & Pemeliharaan Kantor'),    prog.perlengkapan],
      ['Beban Bahan Bakar Minyak',                getVal(exLR,'Bahan Bakar Minyak'),                   prog.bbm],
      ['Beban Perjalanan Dinas',                  getVal(exLR,'Perjalanan Dinas'),                      prog.perjalanan],
      ['Beban Pendidikan & Pelatihan',            getVal(exLR,'Pendidikan'),                            prog.pendidikan],
      ['Beban Sewa Kendaraan',                    getVal(exLR,'Sewa Kendaraan'),                        prog.sewa],
      ['Beban Jasa Profesional',                  getVal(exLR,'Jasa Profesional'),                      prog.jasa],
      ['Beban Penyusutan Aktiva Tetap',           getVal(exLR,'Penyusutan Aktiva Tetap'),               prog.penyusutan],
      ['Beban Umum Lainnya',                      getVal(exLR,'Umum Lainnya'),                          prog.umLain],
      ['JUMLAH BEBAN UMUM & ADMINISTRASI (61xx)', getVal(exLR,'JUMLAH BEBAN UMUM DAN ADMINISTRASI'),   prog.bebanAdmin],
      ['Beban Pemeliharaan Kendaraan Ops',        getVal(exLR,'Pemeliharaan Kendaraan Operasional'),   prog.pemKendaraan],
      ['Beban Pemeliharaan Pasar',                getVal(exLR,'Pemeliharaan Pasar'),                   prog.pemPasar],
      ['Beban Pemeliharaan Kebersihan',           getVal(exLR,'Kebersihan'),                            prog.kebersihan],
      ['Beban Pelayanan & Pemasaran',             getVal(exLR,'Pelayanan'),                             prog.pelayanan],
      ['Beban Barang Cetakan',                    getVal(exLR,'Barang Cetakan'),                        prog.cetakan],
      ['Beban Honor Tenaga Kontrak',              getVal(exLR,'Honor Tenaga Kontrak'),                  prog.honor],
      ['Beban Tunjangan Pegawai Ops',             getVal(exLR,'Tunjangan Pegawai Operasional'),        prog.tunjanganOps],
      ['Beban Kelengkapan Pegawai (Ops)',         getVal(exLR,'Kelengkapan Pegawai'),                   prog.kelengkapanOps],
      ['Beban Insentif/Kesejahteraan',            getVal(exLR,'Insentif'),                              prog.insentif],
      ['Beban Keamanan & Ketertiban',             getVal(exLR,'Keamanan'),                              prog.keamanan],
      ['JUMLAH BEBAN OPERASIONAL (62xx)',         getVal(exLR,'JUMAH BEBAN OPERASIONAL','JUMLAH BEBAN OPERASIONAL'), prog.bebanOps],
      ['JUMLAH BEBAN USAHA',                      getVal(exLR,'JUMAH BEBAN USAHA','JUMLAH BEBAN USAHA'), prog.bebanAdmin + prog.bebanOps],
      ['LABA (RUGI) USAHA',                       getVal(exLR,'LABA (RUGI) USAHA','RUGI USAHA'),       prog.labaUsaha],
      ['Pendapatan Bunga Bank',                   getVal(exLR,'Pendapatan Bunga'),                     prog.bungaBank],
      ['Beban Pajak Bank',                        getVal(exLR,'Pajak Bank'),                           prog.pajakBank],
      ['Beban Administrasi Bank',                 getVal(exLR,'Administrasi Bank'),                    prog.adminBank],
      ['Beban Lain-lain',                         getVal(exLR,'Beban Lain-lain'),                      prog.bebanLain],
      ['JUMLAH BEBAN NON OPERASIONAL',            getVal(exLR,'BEBAN NON OPERASIONAL','BEBAN NON OPS'),prog.bebanNonOps],
      ['LABA (RUGI) BERSIH',                      getVal(exLR,'LABA (RUGI) BERSIH SETELAH PAJAK','BERSIH SETELAH PAJAK'), prog.labaBersih],
      ['EBITDA',                                  getVal(exLR,'EBITDA'),                               prog.ebitda],
    ];

    lrRows.forEach(([name, exV, pV]) => {
      push('  ' + name.padEnd(42) + ' | ' + DIFF(exV, pV));
    });

    // ──────────────────────────────────────────────────
    push('\n' + '═'.repeat(70));
    push('  SHEET: NERACA — ' + lbl);
    push('═'.repeat(70));

    const neracaRows = [
      ['Kas Kecil',                               getVal(exN,'Kas Kecil'),                 progN.kasKecil],
      ['Bank Kalsel',                             getVal(exN,'Bank Kalsel'),               progN.bankKalsel],
      ['Bank BNI',                                getVal(exN,'Bank BNI'),                  progN.bankBNI],
      ['Bank BNI Bisnis',                         getVal(exN,'Bank BNI Bisnis'),           progN.bankBNIBisnis],
      ['Bank BNI Tapcash',                        getVal(exN,'Tapcash'),                   progN.bankTapcash],
      ['Piutang Usaha',                           getVal(exN,'Piutang Usaha'),             progN.piutang],
      ['Persediaan Bapok & Gerai',                getVal(exN,'Bapok'),                     progN.persediaanBapok],
      ['Persediaan Gas LPG',                      getVal(exN,'Gas LPG'),                   progN.persediaanLPG],
      ['BBM Dibayar di Muka',                     getVal(exN,'BBM Dibayar'),               progN.bbmDibayar],
      ['Tanah',                                   getVal(exN,'Tanah'),                     progN.tanah],
      ['Bangunan',                                getVal(exN,'Bangunan'),                  progN.bangunan],
      ['Akm. Penyusutan Bangunan',                getVal(exN,'Akumulasi Penyusutan Bangunan'), progN.akmPenyBangunan],
      ['Mesin',                                   getVal(exN,'Mesin'),                     progN.mesin],
      ['Instalasi Listrik',                       getVal(exN,'Instalasi Listrik'),         progN.instalasi],
      ['Peralatan',                               getVal(exN,'Peralatan'),                 progN.peralatan],
      ['Akm. Penyusutan Peralatan',               getVal(exN,'Akumulasi Penyusutan Peralatan'), progN.akmPenyPeralatan],
      ['Kendaraan',                               getVal(exN,'Kendaraan'),                 progN.kendaraan],
      ['Aset Dalam Penyelesaian',                 getVal(exN,'Aset Dalam Penyelesaian'),   progN.adp],
      ['Utang Usaha',                             getVal(exN,'Utang Usaha'),               progN.utangUsaha],
      ['Utang Daerah',                            getVal(exN,'Utang Daerah'),              progN.utangDaerah],
      ['Modal Perumda',                           getVal(exN,'Modal Perumda'),             progN.modalPerumda],
      ['Modal Disetor',                           getVal(exN,'Modal Disetor'),             progN.modalDisetor],
      ['Saldo Laba (Rugi) Periode Lalu',          getVal(exN,'Saldo Laba (Rugi) Periode Lalu'), progN.saldoLabaLalu],
      ['Laba (Rugi) Periode Berjalan',            getVal(exN,'(Laba) Rugi Periode Berjalan','Laba (Rugi) Periode Berjalan'), prog.labaBersih],
    ];

    neracaRows.forEach(([name, exV, pV]) => {
      push('  ' + name.padEnd(42) + ' | ' + DIFF(exV, pV));
    });

    // ──────────────────────────────────────────────────
    push('\n' + '═'.repeat(70));
    push('  SHEET: ARUS KAS — ' + lbl);
    push('═'.repeat(70));
    push('  [Program uses direct method from account movements; Excel uses indirect method]');
    push('  Key items from Excel:');
    const exAK = lrMap(wb, f.akSheet);
    [
      'Penyusutan Aset Tetap',
      'Arus Kas dari Kegiatan Operasi',
      'Kas Akhir Periode',
    ].forEach(k => {
      const v = getVal(exAK, k);
      push('    ' + k + ': ' + R(v));
    });

    // ──────────────────────────────────────────────────
    push('\n' + '═'.repeat(70));
    push('  SHEET: BEBAN UMUM (Realisasi 61xxx) — ' + lbl);
    push('═'.repeat(70));
    const buRows = [
      ['Beban Gaji (61010)',             prog.gaji],
      ['Beban Tunjangan Umum (61020)',   prog.tunjangan],
      ['Beban Kelengkapan (61030)',      prog.kelengkapanUm],
      ['Beban ATK (61041)',              prog.atk],
      ['Beban Listrik/Tel (61050)',      prog.listrik],
      ['Beban Konsumsi (61060)',         prog.konsumsi],
      ['Beban Perlengkapan (61070)',     prog.perlengkapan],
      ['Beban BBM (61080)',              prog.bbm],
      ['Beban Perjalanan (61090)',       prog.perjalanan],
      ['Beban Pendidikan (61100)',       prog.pendidikan],
      ['Beban Sewa (61110)',             prog.sewa],
      ['Beban Jasa Profesional (61120)', prog.jasa],
      ['Beban Penyusutan (6113x)',       prog.penyusutan],
      ['Beban Umum Lain (61140)',        prog.umLain],
      ['TOTAL 61xxx',                   prog.bebanAdmin],
    ];
    buRows.forEach(([n, p]) => push('  ' + n.padEnd(42) + ' | Prog: ' + R(p)));

    push('\n' + '═'.repeat(70));
    push('  SHEET: BEBAN OPERASIONAL (Realisasi 62xxx) — ' + lbl);
    push('═'.repeat(70));
    const bopsRows = [
      ['Pemeliharaan Kendaraan (62010)',  prog.pemKendaraan],
      ['Pemeliharaan Pasar (62020)',      prog.pemPasar],
      ['Kebersihan Pasar (62030)',        prog.kebersihan],
      ['Pelayanan & Pemasaran (62040)',   prog.pelayanan],
      ['Barang Cetakan (62050)',          prog.cetakan],
      ['Honor Kontrak (62060)',           prog.honor],
      ['Tunjangan Ops (62070)',           prog.tunjanganOps],
      ['Kelengkapan Ops (62080)',         prog.kelengkapanOps],
      ['Insentif (62090)',                prog.insentif],
      ['Keamanan (62100)',                prog.keamanan],
      ['TOTAL 62xxx',                    prog.bebanOps],
    ];
    bopsRows.forEach(([n, p]) => push('  ' + n.padEnd(42) + ' | Prog: ' + R(p)));

  }); // end forEach month

  console.log(lines.join('\n'));
}

// Load all workbooks and run
const wbs = {};
Object.entries(FILES).forEach(([k,f]) => { wbs[k] = loadWb(f); });

const progLR = {}, progN = {};
let pending = Object.keys(MONTHS).length * 2;

Object.entries(MONTHS).forEach(([key, month]) => {
  getProg(month, lr => {
    progLR[key] = lr;
    if (--pending === 0) doRun();
  });
  // Get neraca YTD
  const endDate = { '2026-01':'2026-01-31','2026-02':'2026-02-28','2026-03':'2026-03-31','2026-04':'2026-04-30' }[month];
  getProgYTD(endDate, n => {
    progN[key] = n;
    if (--pending === 0) doRun();
  });
});

function doRun() {
  runAll({ lr: progLR, neraca: progN, wb: wbs });
  db.close();
}
