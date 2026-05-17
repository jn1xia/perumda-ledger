/**
 * Populate empty tables with realistic sample data for Perumda Pasar Banjarmasin
 * Tables: departemen, pelanggan, supplier, giro, efaktur
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'server', 'perumda_ledger.db');
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function populate() {
  console.log('🚀 Populating empty tables with sample data...\n');

  // === DEPARTEMEN ===
  const departemen = [
    ['DIV01', 'Pasar Antasari', 'Unit Pasar Antasari'],
    ['DIV02', 'Pasar Baru', 'Unit Pasar Baru'],
    ['DIV03', 'Pasar Kuripan', 'Unit Pasar Kuripan'],
    ['DIV04', 'Pasar Cemara', 'Unit Pasar Cemara'],
    ['DIV05', 'Pasar Pekapuran', 'Unit Pasar Pekapuran'],
    ['PUSAT', 'Kantor Pusat', 'Kantor Pusat Perumda'],
    ['KEU', 'Divisi Keuangan', 'Bagian Keuangan & Akuntansi'],
    ['SDM', 'Divisi SDM & Umum', 'Sumber Daya Manusia'],
    ['TEK', 'Divisi Teknik', 'Pemeliharaan & Infrastruktur'],
    ['PEN', 'Divisi Penagihan', 'Penagihan Retribusi & Sewa'],
  ];
  let deptCount = 0;
  for (const [kode, nama, keterangan] of departemen) {
    try {
      await run('INSERT OR IGNORE INTO departemen (kode, nama, keterangan) VALUES (?, ?, ?)', [kode, nama, keterangan]);
      deptCount++;
    } catch (e) { /* skip duplicates */ }
  }
  console.log(`  ✅ Departemen: ${deptCount} records inserted`);

  // === PELANGGAN ===
  const pelanggan = [
    ['PLG-0001', 'PLG-0001', 'Hj. Siti Aminah', 'Kios A-01 Pasar Antasari', 'Banjarmasin', '08115001001', '63.001.001.0-711.000', 'aminah@email.com', 'Hj. Siti', 'Pedagang Kios Pakaian'],
    ['PLG-0002', 'PLG-0002', 'H. Ahmad Rizal', 'Kios B-05 Pasar Baru', 'Banjarmasin', '08115001002', '63.002.002.0-711.000', null, 'H. Ahmad', 'Pedagang Sembako'],
    ['PLG-0003', 'PLG-0003', 'Ibu Fatimah', 'Los C-12 Pasar Antasari', 'Banjarmasin', '08115001003', null, null, 'Fatimah', 'Pedagang Sayur & Buah'],
    ['PLG-0004', 'PLG-0004', 'Bpk. Darmawan', 'Kios D-08 Pasar Kuripan', 'Banjarmasin', '08115001004', '63.004.004.0-711.000', null, 'Darmawan', 'Pedagang Elektronik'],
    ['PLG-0005', 'PLG-0005', 'CV Berkah Jaya', 'Ruko E-01 Pasar Baru', 'Banjarmasin', '08115001005', '63.005.005.0-711.000', 'berkah@email.com', 'Pak Hasan', 'Penyewa Ruko'],
    ['PLG-0006', 'PLG-0006', 'Ibu Rahmah', 'Los F-03 Pasar Cemara', 'Banjarmasin', '08115001006', null, null, 'Rahmah', 'Pedagang Ikan'],
    ['PLG-0007', 'PLG-0007', 'Bpk. Suriansyah', 'Kios G-10 Pasar Pekapuran', 'Banjarmasin', '08115001007', '63.007.007.0-711.000', null, 'Suriansyah', 'Pedagang Kelontong'],
    ['PLG-0008', 'PLG-0008', 'UD Makmur Sentosa', 'Kios H-02 Pasar Antasari', 'Banjarmasin', '08115001008', '63.008.008.0-711.000', 'makmur@email.com', 'Pak Joko', 'Pedagang Plastik'],
  ];
  let plgCount = 0;
  for (const p of pelanggan) {
    try {
      await run('INSERT OR IGNORE INTO pelanggan (id, kode, nama, alamat, kota, telepon, npwp, email, kontak, keterangan) VALUES (?,?,?,?,?,?,?,?,?,?)', p);
      plgCount++;
    } catch (e) { /* skip */ }
  }
  console.log(`  ✅ Pelanggan: ${plgCount} records inserted`);

  // === SUPPLIER ===
  const supplier = [
    ['SUP-0001', 'SUP-0001', 'PT Percetakan Karcis Banjar', 'Jl. A. Yani KM 5, Banjarmasin', 'Banjarmasin', '05113251001', '63.101.101.0-711.000', 'karcis@email.com', 'Pak Rahmat', 'Supplier Karcis Retribusi'],
    ['SUP-0002', 'SUP-0002', 'CV Bersih Berkilau', 'Jl. Belitung No. 10', 'Banjarmasin', '05113251002', '63.102.102.0-711.000', null, 'Ibu Wati', 'Jasa Kebersihan Pasar'],
    ['SUP-0003', 'SUP-0003', 'PT PLN (Persero) Kalsel', 'Jl. Jend. Sudirman', 'Banjarmasin', '05113251003', '63.103.103.0-711.000', 'pln@email.com', 'CS PLN', 'Tagihan Listrik Pasar'],
    ['SUP-0004', 'SUP-0004', 'PDAM Bandarmasih', 'Jl. A. Yani KM 2', 'Banjarmasin', '05113251004', '63.104.104.0-711.000', null, 'CS PDAM', 'Tagihan Air Pasar'],
    ['SUP-0005', 'SUP-0005', 'CV Bangun Konstruksi', 'Jl. Veteran No. 15', 'Banjarmasin', '05113251005', '63.105.105.0-711.000', 'bangun@email.com', 'Pak Andi', 'Kontraktor Pemeliharaan Gedung'],
    ['SUP-0006', 'SUP-0006', 'UD Alat Tulis Borneo', 'Jl. Pasar Baru No. 8', 'Banjarmasin', '05113251006', null, null, 'Pak Udin', 'Supplier ATK & Perlengkapan Kantor'],
  ];
  let supCount = 0;
  for (const s of supplier) {
    try {
      await run('INSERT OR IGNORE INTO supplier (id, kode, nama, alamat, kota, telepon, npwp, email, kontak, keterangan) VALUES (?,?,?,?,?,?,?,?,?,?)', s);
      supCount++;
    } catch (e) { /* skip */ }
  }
  console.log(`  ✅ Supplier: ${supCount} records inserted`);

  // === GIRO ===
  const giro = [
    ['GR-0001', 'BG-2026-001', '2026-03-15', '2026-04-15', 'masuk', 'H. Ahmad Rizal', 'Bank Kalsel', 15000000, 'cair', 'Pembayaran sewa kios semester 1'],
    ['GR-0002', 'BG-2026-002', '2026-03-20', '2026-05-20', 'masuk', 'CV Berkah Jaya', 'Bank BRI', 25000000, 'belum', 'Pembayaran sewa ruko'],
    ['GR-0003', 'BG-2026-003', '2026-04-01', '2026-05-01', 'keluar', 'CV Bersih Berkilau', 'Bank Kalsel', 8500000, 'cair', 'Pembayaran jasa kebersihan'],
    ['GR-0004', 'BG-2026-004', '2026-04-10', '2026-06-10', 'masuk', 'Bpk. Darmawan', 'Bank Mandiri', 12000000, 'belum', 'Pembayaran retribusi kuartal 2'],
    ['GR-0005', 'BG-2026-005', '2026-04-15', '2026-05-15', 'keluar', 'CV Bangun Konstruksi', 'Bank Kalsel', 35000000, 'belum', 'Termin 1 renovasi Pasar Antasari'],
    ['GR-0006', 'BG-2026-006', '2026-02-10', '2026-03-10', 'masuk', 'UD Makmur Sentosa', 'Bank BNI', 7500000, 'ditolak', 'Giro ditolak - saldo tidak cukup'],
  ];
  let giroCount = 0;
  for (const g of giro) {
    try {
      await run('INSERT OR IGNORE INTO giro (id, noGiro, tanggal, jatuhTempo, tipe, pihak, bank, jumlah, status, keterangan) VALUES (?,?,?,?,?,?,?,?,?,?)', g);
      giroCount++;
    } catch (e) { /* skip */ }
  }
  console.log(`  ✅ Giro: ${giroCount} records inserted`);

  // === E-FAKTUR ===
  const efaktur = [
    ['EF-0001', '010.000-26.00000001', '2026-01-15', 'keluaran', '63.001.001.0-711.000', 'Hj. Siti Aminah', 'Kios A-01 Pasar Antasari', 5000000, 550000, 'final', 'Sewa kios Januari 2026'],
    ['EF-0002', '010.000-26.00000002', '2026-02-15', 'keluaran', '63.002.002.0-711.000', 'H. Ahmad Rizal', 'Kios B-05 Pasar Baru', 3500000, 385000, 'final', 'Sewa kios Februari 2026'],
    ['EF-0003', '010.000-26.00000003', '2026-03-15', 'keluaran', '63.005.005.0-711.000', 'CV Berkah Jaya', 'Ruko E-01 Pasar Baru', 12000000, 1320000, 'final', 'Sewa ruko Kuartal 1 2026'],
    ['EF-0004', '010.000-26.00000004', '2026-04-01', 'masukan', '63.105.105.0-711.000', 'CV Bangun Konstruksi', 'Jl. Veteran No. 15', 35000000, 3850000, 'draft', 'Renovasi Pasar Antasari termin 1'],
    ['EF-0005', '010.000-26.00000005', '2026-04-10', 'keluaran', '63.004.004.0-711.000', 'Bpk. Darmawan', 'Kios D-08 Pasar Kuripan', 4200000, 462000, 'final', 'Sewa kios April 2026'],
    ['EF-0006', '010.000-26.00000006', '2026-04-15', 'masukan', '63.103.103.0-711.000', 'PT PLN Kalsel', 'Jl. Sudirman', 18500000, 2035000, 'final', 'Tagihan listrik Pasar Q1 2026'],
  ];
  let efCount = 0;
  for (const e of efaktur) {
    try {
      await run('INSERT OR IGNORE INTO efaktur (id, noFaktur, tanggal, tipe, npwpLawan, namaLawan, alamatLawan, dpp, ppn, status, keterangan) VALUES (?,?,?,?,?,?,?,?,?,?,?)', e);
      efCount++;
    } catch (e2) { /* skip */ }
  }
  console.log(`  ✅ E-Faktur: ${efCount} records inserted`);

  // === SUMMARY ===
  db.close(() => {
    console.log('\n📊 Population Summary');
    console.log(`  Departemen : ${deptCount}`);
    console.log(`  Pelanggan  : ${plgCount}`);
    console.log(`  Supplier   : ${supCount}`);
    console.log(`  Giro       : ${giroCount}`);
    console.log(`  E-Faktur   : ${efCount}`);
    console.log(`  Total      : ${deptCount + plgCount + supCount + giroCount + efCount}`);
    console.log('\n🏆 All empty tables populated successfully!');
  });
}

populate().catch(err => {
  console.error('💥 Error:', err.message);
  db.close();
});
