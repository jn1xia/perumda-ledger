const fs = require('fs');
const path = require('path');

const modules = [
  { id: 1, name: "Buku Besar - Saldo Awal", keywords: ["Saldo Awal", "Budget", "12 Bulan", "Januari", "Desember"] },
  { id: 2, name: "Buku Besar - Perkiraan (COA)", keywords: ["COA", "Akun Level 3", "Akun Induk", "Kode Sortir", "Beban Pemeliharaan"] },
  { id: 3, name: "Buku Besar - Type Perkiraan", keywords: ["Tipe KAS", "Tipe BANK", "Tipe PIUTANG", "Klasifikasi Laporan", "Filter Tipe"] },
  { id: 4, name: "Buku Besar - Departemen", keywords: ["Departemen", "Pasar Antasari", "Pasar Baru", "DIV01", "Pusat"] },
  { id: 5, name: "Voucher - Input Voucher", keywords: ["Voucher Kas", "Kas Keluar", "Bukti Pembayaran", "Multi-line", "DRAFT"] },
  { id: 6, name: "Voucher - Edit Voucher", keywords: ["Edit Nominal", "Ubah Akun", "Voucher Disetujui", "Hapus Baris", "Revisi Voucher"] },
  { id: 7, name: "Voucher - Cetak Voucher", keywords: ["Print A4", "Format PDF", "Tanda Tangan Direktur", "Nomor Urut", "Cetak Ulang"] },
  { id: 8, name: "Jurnal - Entry Jurnal", keywords: ["Jurnal Memorial", "Debit Kredit", "Balance", "Keterangan Jurnal", "Simpan Jurnal"] },
  { id: 9, name: "Jurnal - Cetak Jurnal Memorial", keywords: ["Cetak Jurnal", "Export CSV", "Filter Tanggal", "Daftar Transaksi", "Print Jurnal"] },
  { id: 10, name: "Jurnal - Laporan Jurnal", keywords: ["Laporan Jurnal", "Total Debit", "Total Kredit", "Filter Akun", "Data Jutaan Baris"] },
  { id: 11, name: "Jurnal - Kunci Transaksi", keywords: ["Tutup Buku", "Kunci Periode", "Batas Tanggal", "Tolak Input", "Penguncian Akhir Bulan"] },
  { id: 12, name: "Jurnal - Buka Kunci Transaksi", keywords: ["Buka Periode", "Revisi Audit", "Super Admin", "Buka Kunci", "Audit Trail"] },
  { id: 13, name: "Jurnal - Jenis Jurnal", keywords: ["Prefix Jurnal", "Auto Numbering", "Jenis Kas Masuk", "Jenis Kas Keluar", "Format ID"] },
  { id: 14, name: "Laporan Buku Besar", keywords: ["Buku Besar", "Running Balance", "Mutasi Akun", "Filter 3 Periode", "Saldo Akhir"] },
  { id: 15, name: "Laporan Neraca", keywords: ["Neraca", "Aset vs Kewajiban", "YTD", "Tahun Lalu", "Laba Tahun Berjalan"] },
  { id: 16, name: "Laporan Neraca Saldo", keywords: ["Neraca Saldo", "Trial Balance", "Debit = Kredit", "Extract Saldo", "Seimbang"] },
  { id: 17, name: "Laporan Rugi Laba", keywords: ["Laba Rugi", "Budget vs Realisasi", "Pendapatan Sewa", "Defisit", "Profitabilitas"] },
  { id: 18, name: "Laporan HPP", keywords: ["HPP", "Beban Langsung", "Biaya Perbaikan", "Harga Pokok", "Komponen Biaya"] },
  { id: 19, name: "Laporan Lacak Kilat", drill: true, keywords: ["Drill-Down", "Double Click", "Lacak Jurnal", "Popup Rincian", "Telusuri Transaksi"] },
  { id: 20, name: "Piutang - Induk & Transaksi", keywords: ["Piutang Sewa", "Pedagang Kios", "Faktur Baru", "Sales Order", "Integrasi Jurnal"] },
  { id: 21, name: "Piutang - Statement of Account (SOA)", keywords: ["SOA", "Surat Tagihan", "Daftar Tunggakan", "Cetak Tagihan", "Filter Pedagang"] },
  { id: 22, name: "Piutang - Proses Akhir Periode", keywords: ["Tutup Piutang", "Pindah Saldo", "Awal Bulan", "Roll Over", "Beban Server"] },
  { id: 23, name: "Hutang - Transaksi Hutang", keywords: ["Tagihan Vendor", "Purchase Order", "Hutang Kontraktor", "Termin 30 Hari", "Integrasi AP"] },
  { id: 24, name: "Hutang - Laporan Umur Hutang", keywords: ["Umur Hutang", "Aging AP", "Jatuh Tempo Hari Ini", "Cash Flow", "Daftar Vendor"] },
  { id: 25, name: "Inventory - Master Barang & Lokasi", keywords: ["Karcis Retribusi", "Gudang Utama", "Kode Barcode", "Sapu Lidi", "Harga Jual 0"] },
  { id: 26, name: "Inventory - Terima & Keluar Barang", keywords: ["Terima Barang", "Keluarkan Karcis", "Moving Average", "Stok Minus", "Jual Karcis"] },
  { id: 27, name: "Inventory - Antar Lokasi", keywords: ["Pindah Gudang", "Transfer Stok", "Gudang A ke B", "Mutasi Internal", "Total Neraca Sama"] },
  { id: 28, name: "Inventory - Stock Opname", keywords: ["Stock Opname", "Audit Fisik", "Selisih Stok", "Stok Merah", "Export Opname"] },
  { id: 29, name: "Giro Masuk / Keluar", keywords: ["Bilyet Giro", "Cek Mundur", "Status Cair", "Giro Ditolak", "Bank Kalsel"] },
  { id: 30, name: "Aktiva Tetap - Penyusutan", keywords: ["Aset Komputer", "Kendaraan Dinas", "Umur 4 Tahun", "Batch Penyusutan", "Nilai Buku 0"] },
  { id: 31, name: "Produksi - Assembling", keywords: ["Assembling", "Paket Promosi", "BOM", "Harga Pokok Barang Jadi", "Rakitan"] },
  { id: 32, name: "E-Faktur PPN", keywords: ["PPN 11%", "DPP", "Faktur Keluaran", "Export DJP CSV", "Kurang Bayar PPN"] },
  { id: 33, name: "Anggaran vs Realisasi (LRA)", keywords: ["Serapan LRA", "Pagu Anggaran", "Persentase Merah", "Beban Operasional", "Agregasi Otomatis"] },
  { id: 34, name: "Rekonsiliasi Bank", keywords: ["Rekonsiliasi Bank", "Rekening Koran", "Tickmark", "Selisih 0", "Biaya Admin Bank"] },
  { id: 35, name: "Backup & Restore Data", keywords: ["Backup Database", "Restore .db", "File Unduhan", "Kerusakan Data", "Jam 12 Malam"] },
  { id: 36, name: "Pengaturan User / Keamanan", keywords: ["Role Viewer", "RBAC", "Tombol Edit Hilang", "Login Expired", "Reset SuperAdmin"] }
];

const actors = ["Akuntan", "Kasir", "Manajer Keuangan", "Staff Gudang", "Staff Penagihan", "Staff Pembelian", "Staff Pajak", "Direktur", "Auditor", "Admin IT"];
const verbs = ["menginput", "mengedit", "menghapus", "memfilter", "mencetak", "mengekspor", "melihat", "mengunci", "menyetujui"];

function getRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateScenarios() {
  let csvContent = "Modul_ID|Modul_Name|Scenario_ID|Tester_POV|Test_Description|Expected_Result|Test_Type\n";
  let count = 0;

  for (const mod of modules) {
    for (let i = 1; i <= 50; i++) {
      count++;
      const isPositive = i <= 25;
      const type = isPositive ? "Positive" : "Negative";
      
      const actor = getRandom(actors);
      const verb = getRandom(verbs);
      const kw1 = getRandom(mod.keywords);
      const kw2 = getRandom(mod.keywords);

      let desc = "";
      let expected = "";

      if (isPositive) {
        if (i % 5 === 0) {
          desc = `Sebagai ${actor}, saya ${verb} ${kw1} untuk memastikan integrasi data berjalan normal.`;
          expected = `Sistem berhasil memproses ${kw1} tanpa error dan data tersimpan ke database.`;
        } else if (i % 5 === 1) {
          desc = `Sebagai ${actor}, saya ingin mengekspor/mencetak dokumen ${kw1} ke format PDF/CSV.`;
          expected = `Sistem mengunduh file ${kw1} yang dapat dibaca jelas tanpa format yang rusak.`;
        } else if (i % 5 === 2) {
          desc = `Sebagai ${actor}, saya memfilter tabel ${mod.name} menggunakan parameter ${kw2}.`;
          expected = `Sistem hanya menampilkan baris data yang relevan dengan ${kw2}.`;
        } else if (i % 5 === 3) {
          desc = `Sebagai ${actor}, saya melakukan klik pada ${kw1} untuk melihat detail rinciannya.`;
          expected = `Sistem memunculkan informasi rinci mengenai ${kw1} sesuai otorisasi saya.`;
        } else {
          desc = `Sebagai ${actor}, saya memperbarui data ${kw2} yang sudah ada di modul ${mod.name}.`;
          expected = `Data berhasil diperbarui dan histori perubahan tercatat di sistem.`;
        }
      } else {
        // Negative Scenarios
        if (i % 5 === 0) {
          desc = `Sebagai ${actor}, saya mencoba menyisipkan data duplikat untuk ${kw1} yang sudah ada.`;
          expected = `Sistem MENOLAK operasi dan memunculkan peringatan "Data ${kw1} Sudah Ada".`;
        } else if (i % 5 === 1) {
          desc = `Sebagai ${actor}, saya mengosongkan kolom wajib (NULL) pada form ${kw1}.`;
          expected = `Sistem MENCEGAH penyimpanan dan menyorot kolom wajib tersebut dengan warna merah.`;
        } else if (i % 5 === 2) {
          desc = `Sebagai ${actor}, saya mencoba menghapus ${kw2} yang sudah memiliki riwayat transaksi/jurnal.`;
          expected = `Sistem MENOLAK penghapusan untuk menjaga integritas data relasional.`;
        } else if (i % 5 === 3) {
          desc = `Sebagai ${actor}, saya memasukkan angka ekstrem/negatif pada field nominal di ${kw1}.`;
          expected = `Sistem MEMBLOKIR angka tidak masuk akal tersebut dengan validasi batas limit.`;
        } else {
          desc = `Sebagai ${actor} dengan hak akses terbatas, saya mencoba memaksa masuk ke menu setting ${kw2}.`;
          expected = `Sistem me-redirect saya ke halaman peringatan "Access Denied".`;
        }
      }

      // Add specific logic for Perumda Context to make it highly tailored
      if (mod.name.includes("E-Faktur") && i === 1) desc = `Sebagai Staff Pajak, saya mengekspor CSV E-Faktur untuk diupload ke DJP.`, expected = `File CSV terbentuk dengan header FK, FG_PENGGANTI yang 100% kompatibel dengan DJP.`;
      if (mod.name.includes("Stock Opname") && i === 1) desc = `Sebagai Auditor, saya memasukkan selisih stok fisik Karcis Retribusi sebesar -50.`, expected = `Sistem meng-generate laporan selisih berwarna merah.`;
      if (mod.name.includes("LRA") && i === 1) desc = `Sebagai Direktur, saya melihat serapan Anggaran Pemeliharaan Pasar Antasari bulan April.`, expected = `Grafik serapan anggaran (progress bar) menunjukkan persentase riil.`;

      csvContent += `${mod.id}|${mod.name}|SCN-${String(count).padStart(4,'0')}|${actor}|${desc}|${expected}|${type}\n`;
    }
  }

  const outputPath = path.join(__dirname, 'UAT_1800_Scenarios_Perumda_2026.csv');
  fs.writeFileSync(outputPath, csvContent);
  console.log(`✅ Berhasil men-generate 1.800 skenario UAT ke: ${outputPath}`);
}

generateScenarios();
