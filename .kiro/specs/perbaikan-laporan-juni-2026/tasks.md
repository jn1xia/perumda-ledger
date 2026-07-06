# Implementation Plan

> Catatan tooling pengujian: proyek ini **belum** memiliki test runner formal (tidak ada jest/vitest) maupun pustaka property-based (fast-check). Ikuti konvensi yang sudah ada: tulis pengujian sebagai skrip `.cjs` mandiri (pola `compare_*.cjs` / `check_reports.cjs`) yang dijalankan dengan `node <skrip>.cjs`, membaca DB QA `server/perumda_ledger.qa.db` (set `DB_PATH=server/perumda_ledger.qa.db`) dan mem-parse Excel acuan dengan `xlsx`. Untuk pengujian property-based, terapkan sampling acak di dalam skrip (loop atas baris/periode/jurnal/lebar viewport acak) — `fast-check` boleh ditambahkan bila diinginkan. Untuk pengujian tata letak (scroll/cetak), gunakan `playwright` yang sudah tersedia di devDependencies.
>
> Penekanan (sesuai design revisi): mekanisme UTAMA & berkelanjutan adalah **overlay delta yang robust** — setelah baseline benar, setiap jurnal `JV-`/`JRN-` baru harus otomatis mengalir benar ke keempat laporan **tanpa** re-baseline. Karena itu pengujian bug-condition primer menghitung **nilai setara-Excel secara independen** sebagai `baseline + delta-ter-atribusi-via-kode-COA`, lalu membandingkannya dengan render aplikasi. Re-baseline snapshot tetap dipertahankan namun diposisikan sebagai **setup sekali/sesekali** (dipakai ulang saat terbit Excel teraudit resmi baru).
>
> Berkas acuan: `src/FILES/LAMPIRAN LAPORAN KEUANGAN JUNI 2026  (2).xlsx` (perhatikan dua spasi sebelum `(2)`). Sheet: `NERACA JUNI 2026`, `ARUS KAS JUNI 2026`, `LABA RUGI JUNI 2026`, `Beban Operasional ` (ada spasi di belakang), `Penerimaan`, `Beban Umum`, ` Investasi`.

- [x] 1. Tulis exploratory bug-condition test — overlay delta akurat di atas baseline yang benar (mekanisme utama)
  - **Property 1: Bug Condition** - Overlay Delta Akurat di Atas Baseline yang Benar
  - **CRITICAL**: Test ini HARUS GAGAL pada kode yang belum diperbaiki — kegagalan membuktikan overlay delta belum andal (penyebab utama pengguna terpaksa re-baseline tiap menambah jurnal).
  - **DO NOT attempt to fix the test or the code when it fails** — biarkan gagal; ini hasil yang benar untuk tahap ini.
  - **NOTE**: Test ini meng-encode perilaku yang diharapkan (Expected Behavior Property 1). Test yang sama akan dipakai ulang untuk memvalidasi perbaikan di task 5.5.
  - **GOAL**: Memunculkan counterexample bahwa untuk jurnal `JV-`/`JRN-` yang di-posting di atas baseline yang BENAR, `renderValue(L) ≠ baseline(L) + correctlyAttributedDelta(L)` pada banyak baris/total keempat laporan — yakni overlay delta salah atribusi (bukan sekadar baseline basi).
  - **Susun baseline yang benar dulu (prasyarat & sekaligus bukti cabang setup)**: ke DB uji, muat snapshot Juni dari Excel acuan `(2)` (`report_neraca`/`report_laba_rugi`/`report_arus_kas` + `anggaran`). Sebagai bagian dari ini, **dokumentasikan cabang setup `staleBaseline`** (design Exploratory Test Case 6): sebelum dimuat dari `(2)`, snapshot Juni cocok berkas interim `src/Mei Data/june data/LAMPIRAN LAPORAN KEUANGAN JUNI 2026 .xlsx` dan berbeda material dari `(2)`, serta belum ada baris `anggaran` `ANG-bebanOperasional-*` bulan 6 (`isDynamic == true`). Ini hanya prasyarat; assertion UTAMA test ini ada pada overlay delta di bawah.
  - **Scoped PBT Approach**: bug deterministik. Pakai dua lapis: (a) jangkar pada counterexample konkret dari design (Exploratory Test Cases 1–5) untuk reproducibility; (b) generalisasi sebagai property atas sampel jurnal/baris acak.
  - Tulis skrip `.cjs` (mis. `scripts/explore_overlay_delta.cjs`) yang: (i) di atas baseline `(2)`, menyuntik satu/beberapa jurnal `JV-` (lihat jurnal 17–20 Juni 2026); (ii) menghitung **`expectedExcelEquivalent(L) = baseline(L) + correctlyAttributedDelta(L)`** secara independen — atribusi delta via **kode akun COA** (bukan nama ter-lowercase), arah tanda menurut saldo normal, outline LRA benar; (iii) merender keempat laporan via jalur aplikasi (`applyNeracaDelta`/`applyLabaRugiDelta` di `src/pages/Laporan.jsx`, klasifikasi Arus Kas via `deltaCash`/`cashDeltaLR`, dan LRA `deltaExpanded` di `src/pages/LRA.jsx`); lalu (iv) membandingkan.
  - Property yang diuji (Bug Condition cabang `deltaMisattributed`): untuk setiap baris/total `L`, `ABS(renderValue(L) − expectedExcelEquivalent(L)) <= 1`, DAN `total == Σ leaf` (tanpa double-count), DAN Neraca seimbang (Jumlah Aset == Jumlah Kewajiban + Ekuitas), DAN tidak ada jurnal yang hilang diam-diam (akun unmapped tertandai, bukan didrop).
  - Jangkar konkret yang harus memunculkan kegagalan pada kode belum diperbaiki (design Exploratory Test Cases 1–5):
    1. **Leaf vs total (Laba Rugi)**: jurnal beban `61xxx` yang namanya ≠ label Excel dan tak ada di `lrAlias.json` → `applyLabaRugiDelta` menggeser total bucket (`deltaByPrefix(set,'61',true)`) tetapi baris rinci diam → `total ≠ Σ leaf`.
    2. **Subtotal Neraca salah klasifikasi**: jurnal aset lancar tak cocok nama/alias → `applyNeracaDelta` tak menambah "Jumlah Aset Lancar" (akumulator `acc`), delta jatuh ke "Tidak Lancar"/grand total.
    3. **Outline LRA salah**: jurnal pada akun induk `62010` tanpa kata kunci `keterangan` → nyangkut di `1.1.1` (fallback `ACCOUNT_TO_OUTLINE['62010']`).
    4. **Arus Kas tak terklasifikasi**: jurnal kas operasional → hanya baris `/kenaikan|akhir periode/i` bergerak (`cashDeltaLR`); aktivitas Operasi/Investasi/Pendanaan tidak.
    5. **Akun unmapped hilang**: jurnal pada akun tanpa alias/outline → tak ada baris rinci bergerak & tak ada indikator unmapped.
  - Jalankan pada kode BELUM diperbaiki.
  - **EXPECTED OUTCOME**: Test GAGAL (membuktikan overlay delta belum andal). Dokumentasikan counterexample (baris yang gagal + sebabnya: leaf diam, tanda salah, outline `1.1.1`, Arus Kas tak terklasifikasi, atau drop diam-diam) untuk konfirmasi akar masalah kelas A.
  - Tandai task selesai bila test ditulis, dijalankan, dan kegagalan terdokumentasi.
  - _Requirements: 1.1, 1.2, 1.3, 1.4 (mengekspos); Expected Behavior 2.1, 2.2, 2.3, 2.4_

- [x] 2. Tulis exploratory bug-condition test — laporan lebar terpotong tanpa scroll horizontal
  - **Property 3: Bug Condition** - Scroll Horizontal untuk Laporan Lebar
  - **CRITICAL**: Test ini HARUS GAGAL pada CSS yang belum diperbaiki (`.report-doc { overflow: hidden }`, badan tanpa `overflow-x`).
  - **DO NOT attempt to fix the test or the code when it fails**.
  - **NOTE**: Test ini meng-encode Expected Behavior tata letak; dipakai ulang untuk validasi di task 5.6.
  - **GOAL**: Menunjukkan kolom kanan terpotong tanpa scrollbar horizontal saat tabel lebih lebar dari kontainer (mis. LRA 9 kolom, atau dua laporan berdampingan).
  - **Scoped PBT Approach**: jangkar pada kasus konkret (LRA 9 kolom pada viewport sempit; dua laporan berdampingan) + property atas lebar viewport/jumlah kolom acak.
  - Tulis test `playwright` (mis. `tests/explore_layout_scroll.spec.js`) yang merender laporan pada viewport sempit dan memeriksa: `renderedTableWidth(report) > viewportWidth` DAN `horizontalScrollAvailable(report) == false` (mis. `scrollWidth > clientWidth` pada `.report-doc-body` tetapi tidak ada mekanisme scroll).
  - Property: untuk lebar viewport acak `w` dan laporan dengan `renderedWidth > w`, scroll horizontal TIDAK tersedia (pada kode belum diperbaiki).
  - Jalankan pada CSS BELUM diperbaiki.
  - **EXPECTED OUTCOME**: Test GAGAL (kolom terpotong, tidak ada scroll). Dokumentasikan elemen yang terpotong.
  - Tandai task selesai bila test ditulis, dijalankan, dan kegagalan terdokumentasi.
  - _Requirements: 1.5, 1.6 (mengekspos); Expected Behavior 2.5, 2.6_

- [x] 3. Tulis preservation property test — bulan lain, Juni tanpa delta, baris tak terdampak (SEBELUM perbaikan)
  - **Property 2: Preservation** - Bulan Lain, Juni Tanpa Delta, dan Baris Tak Terdampak
  - **IMPORTANT**: Ikuti metodologi observation-first — amati perilaku pada kode/data BELUM diperbaiki, lalu kunci sebagai baseline.
  - Observasi & rekam pada data belum diperbaiki: untuk setiap periode Januari–Mei 2026, nilai `report_neraca`/`report_laba_rugi`/`report_arus_kas` dan render laporan (snapshot harus tetap cocok dengan lampiran Excel masing-masing bulan).
  - Tulis property-based test `.cjs` (mis. `scripts/preserve_numeric.cjs`) yang: (a) untuk sampel acak periode Jan–Mei dan baris acak, merekam nilai baseline ke berkas snapshot (mis. JSON) dan menegaskan nilai tidak berubah; (b) untuk Juni TANPA jurnal `JV-`/`JRN-`, seluruh laporan = snapshot Excel resmi; (c) **tanpa delta relevan, overlay diam** (design Preservation Test Case 3) — untuk baris/akun yang tidak disentuh jurnal, `applyNeracaDelta`/`applyLabaRugiDelta`/overlay LRA TIDAK boleh menggeser nilai.
  - Sertakan kasus "baris tak terdampak": baris/akun yang tidak disentuh jurnal 17–20 Juni harus stabil.
  - Jalankan pada kode BELUM diperbaiki.
  - **EXPECTED OUTCOME**: Test LULUS (mengonfirmasi baseline yang harus dipertahankan). Simpan snapshot baseline untuk dibandingkan setelah perbaikan.
  - Tandai task selesai bila test ditulis, dijalankan, dan lulus pada kode belum diperbaiki.
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Tulis preservation property test — laporan sempit, cetak/ekspor, scroll vertikal (SEBELUM perbaikan)
  - **Property 4: Preservation** - Laporan Sempit, Cetak/Ekspor, dan Scroll Vertikal
  - **IMPORTANT**: Ikuti metodologi observation-first untuk perilaku tata letak & ekspor.
  - Observasi pada kode belum diperbaiki: (a) laporan yang muat di viewport TIDAK memunculkan scrollbar horizontal; (b) `printReport` dan `exportLabaRugi`/`exportNeraca`/`exportArusKas`/`exportFullReport` menghasilkan keluaran berfungsi memuat seluruh kolom; (c) scroll vertikal halaman (via `.content`) + sticky `thead th` berfungsi.
  - Tulis test `playwright` + unit test ekspor (mis. `tests/preserve_layout_export.spec.js`) yang: untuk lebar viewport acak ≥ lebar tabel, tegaskan TIDAK ada scrollbar horizontal; verifikasi hasil ekspor (jumlah kolom/sheet) dan kemampuan scroll vertikal.
  - Jalankan pada kode BELUM diperbaiki.
  - **EXPECTED OUTCOME**: Test LULUS (baseline tata letak/ekspor yang harus dipertahankan).
  - Tandai task selesai bila test ditulis, dijalankan, dan lulus pada kode belum diperbaiki.
  - _Requirements: 3.4, 3.5, 3.6_

- [x] 5. Perbaikan laporan Juni 2026 (overlay delta robust [utama] + re-baseline setup + LRA Beban Operasional + scroll horizontal)

  - [x] 5.1 Overlay delta yang robust — mekanisme UTAMA & berkelanjutan (prioritas pertama)
    - **Tujuan**: setelah baseline benar, setiap jurnal `JV-`/`JRN-` yang di-posting otomatis ter-atribusi benar ke baris rinci + seluruh induknya di keempat laporan, setara hitungan Excel, **tanpa** re-baseline. Cermin design "Fix Implementation" bagian 1.
    - **File**: `src/utils/reportDelta.js`, `src/utils/reconcileAlias.json`, `src/utils/lrAlias.json`, `src/utils/lraOutline.js`, `src/pages/Laporan.jsx`, `src/pages/LRA.jsx`.
    - **(1) Pemetaan berbasis kode COA (bukan nama lowercase).** Jadikan **kode akun COA** kunci utama atribusi baris. Lengkapi `src/utils/reconcileAlias.json` (kini 5 entri) dan `src/utils/lrAlias.json` (kini 1 entri: `61140`) menjadi peta **lengkap** `kodeCOA → label baris Excel persis` untuk seluruh akun yang dapat muncul di jurnal. Tambahkan helper resolusi label berbasis kode di `src/utils/reportDelta.js` dan utamakan jalur alias-by-code dibanding `deltaByName` (yang memakai nama ter-lowercase) di `applyNeracaDelta`/`applyLabaRugiDelta` (`src/pages/Laporan.jsx`).
    - **(2) Tanda saldo normal yang benar.** Tambah helper `isDebitNormal(code)` di `src/utils/reportDelta.js` yang menangani SELURUH kelas akun, termasuk yang kini terlewat (akun `9x` pajak penghasilan, dll.), lalu pakai di `deltaByPrefix`/`deltaByName`/jalur alias menggantikan pola rapuh `/^[1568]/` (debit-normal) & `/^[2347]/` (kredit-normal) agar setiap jurnal menggeser baris ke arah yang benar.
    - **(3) Outline LRA yang benar (tanpa fallback "anak pertama").** Perbaiki `resolveOperasionalOutline` dan `ACCOUNT_TO_OUTLINE` di `src/utils/lraOutline.js` **dan salinan lokalnya** di `src/pages/LRA.jsx` (lokal: `ACCOUNT_TO_OUTLINE` ~baris 266, `resolveOperasionalOutline` ~baris 558, `resolveOutline` ~baris 827) agar akun induk seperti `62010` **tidak** memetakan ke `1.1.1`. Untuk akun induk ambigu tanpa `keterangan` deskriptif, petakan ke outline induk/agregat yang tepat atau tandai unmapped — jangan diam-diam ke anak pertama. (Catatan: `NPDReport.jsx` mengimpor dari `lraOutline.js`, jadi perbaikan shared otomatis konsisten untuk NPD.)
    - **(4) Propagasi ke leaf + seluruh induk, tepat satu kali.** Pastikan satu delta menggeser baris leaf **dan** setiap subtotal/total induknya konsisten: setiap total = jumlah leaf penyusunnya, tanpa double-count. Di `src/pages/Laporan.jsx`, samakan basis perhitungan subtotal Neraca (akumulator `acc`/`lancarDelta` di `applyNeracaDelta`) dengan grand total bucket (`dN.*`) agar tak ada delta leaf tak-cocok yang "bocor" ke subtotal salah; Neraca harus tetap seimbang setelah overlay.
    - **(5) Klasifikasi Arus Kas.** Selain menggeser "Kenaikan/Penurunan Kas" dan "Saldo Kas Akhir Periode" sebesar `cashDeltaLR` (`deltaCash`), atribusikan dampak kas delta ke **aktivitas yang benar** (Operasi/Investasi/Pendanaan) sesuai kode lawan akun kas pada render Arus Kas (`refArusKasData.map`) di `src/pages/Laporan.jsx`, agar struktur Arus Kas konsisten dengan hitungan Excel.
    - **(6) Perlakuan akun belum terpetakan (graceful).** Jika jurnal punya akun tanpa label Excel yang cocok, **jangan** hilangkan diam-diam: petakan via kode COA bila mungkin, atau **surface indikator "unmapped"** (mis. baris/badge atau peringatan) agar pengguna tahu ada delta yang belum tertampung — tetap menjaga keseimbangan total.
    - _Bug_Condition: isBugCondition(input) — deltaMisattributed: di atas baseline BENAR, EXISTS L: renderedValue(L,d) ≠ baseline(L) + correctlyAttributedDelta(L,d) (leaf diam/hanya bucket, tanda salah, outline `1.1.1`, alias kosong, total ≠ Σ leaf, Neraca tak seimbang, double-count, atau drop diam-diam)_
    - _Expected_Behavior: expectedBehavior(result) — deltaOK: untuk jurnal posted apa pun, `ABS(renderValue(L) − (baseline(L) + correctlyAttributedDelta(L))) ≤ 1`, total == Σ leaf (tanpa double-count), neracaBalanced, signCorrect, outlineCorrect, noSilentDrop — **tanpa** re-baseline_
    - _Preservation: tanpa delta relevan overlay tidak menggeser baris/total; bulan Jan–Mei & Juni tanpa delta tetap = lampiran/`(2)`_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.2 Re-baseline snapshot Juni 2026 ke Excel acuan `(2)` — SETUP SEKALI / SESEKALI
    - **Peran**: menyetel titik awal Juni yang benar (Juni tanpa delta = `(2)`). **Bukan rutinitas per-jurnal**; diulang hanya bila terbit Excel teraudit resmi BARU (mis. revisi audit bulan berikutnya). **Logika snapshot/`load-audited` dipertahankan utuh dan tetap dipakai saat diperlukan.**
    - Ubah entri `SOURCES` untuk `period: '2026-06'` di `scripts/import_report_data.cjs` agar `dir`/`file` menunjuk `src/FILES/LAMPIRAN LAPORAN KEUANGAN JUNI 2026  (2).xlsx` (alih-alih `JUNI_DIR` + berkas interim `LAMPIRAN LAPORAN KEUANGAN JUNI 2026 .xlsx`), atau standarisasi/salin `(2)` ke lokasi sumber Juni. Pertahankan nama sheet `NERACA JUNI 2026`, `ARUS KAS JUNI 2026`, `LABA RUGI JUNI 2026`.
    - Muat ulang snapshot (sekali) ke DB aktif: `DB_PATH=server/perumda_ledger.qa.db node scripts/load_audited_period.cjs 2026-06` (atau `POST /reports/load-audited { period: '2026-06' }`) untuk menulis ulang `report_neraca`/`report_laba_rugi`/`report_arus_kas` + `anggaran` Juni dari `(2)`.
    - Status jurnal yang sudah tercermin di `(2)`: pastikan jalur `load-audited` men-_demote_ jurnal `JV-`/`JRN-` bulan tsb menjadi baseline `XL-` agar tidak dihitung ganda. Jurnal yang **benar-benar** baru (di luar `(2)`) tetap `JV-` agar mengalir sebagai delta via mekanisme robust di 5.1 — **tanpa** perlu baseline lagi.
    - Reusabilitas: catat bahwa langkah ganti-sumber → `load-audited` inilah prosedur resmi saat ada Excel teraudit baru, sehingga snapshot tetap alat setup yang sah dan terpakai bila diperlukan.
    - _Bug_Condition: isBugCondition(input) — staleBaseline untuk period '2026-06' (snapshotSource ≠ officialExcel `(2)`) → appValue ≠ refValue `(2)` > Rp 1 bahkan tanpa delta_
    - _Expected_Behavior: expectedBehavior(result) — baselineOK: ABS(value(L, noDelta) − officialExcelValue('2026-06', L)) ≤ 1 untuk seluruh baris Neraca/LR/Arus Kas; neracaBalanced; totalsConsistent_
    - _Preservation: bulan Jan–Mei tidak berubah; Juni tanpa delta = `(2)`; baris tak terdampak stabil; logika `load-audited`/snapshot tetap utuh_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.3 Muat Beban Operasional ke snapshot LRA — paritas setup
    - **Peran**: LRA Beban Operasional ikut pola snapshot + delta (robust) seperti tiga laporan lain (`isDynamic=false`), berhenti menghitung dinamis. Bagian dari koreksi baseline setup.
    - Tambah parser 3-level `parseBebanOperasional` (port dari `src/utils/reportSnapshot.js`, ~baris 230: group col2 / sub col3 / rincian col4; nama col5; anggaran col7, target col8, sd_bln_lalu col9, bulan_ini col10, realisasi col11, % col12) ke modul CommonJS `scripts/import_report_data.cjs` dan ekspor.
    - Tambah entri `lraSheets` untuk Juni di `scripts/import_report_data.cjs`: `{ sheet: 'Beban Operasional ', kategori: 'bebanOperasional' }` (perhatikan spasi di belakang nama sheet).
    - Wire ke **KEDUA** jalur muat: di `server/routes/api.cjs` (loop `lraSheets` ~baris 1348, kini selalu `reportImport.parsePenerimaan(lWs)` di ~baris 1351) dan `scripts/load_audited_period.cjs` (loop `lraSheets` ~baris 88, kini `reportImport.parsePenerimaan(ws)` di ~baris 91) — pakai `parseBebanOperasional` untuk kategori `bebanOperasional` (bukan `parsePenerimaan`) sebelum `loadLraToAnggaran(..., 'bebanOperasional', period, rows)`. (`loadLraToAnggaran` di `server/routes/api.cjs` sudah menerima outline multi-level.)
    - Verifikasi konsekuensi klien: setelah baris `ANG-bebanOperasional-<outline>` bulan 6 tertulis, `hasAuditedForCategory` di `src/pages/LRA.jsx` (~baris 857) menjadi `true` dan `isDynamic` → `false` (~baris 860). Tidak perlu mengubah logika `lraData`/`resolvedItems`.
    - _Bug_Condition: isBugCondition(input) — staleBaseline cabang `NOT lraSnapshotHasCategory('2026-06','bebanOperasional')` → reportType 'lra-beban-operasional' dihitung dinamis (isDynamic==true), tak match `(2)`_
    - _Expected_Behavior: expectedBehavior(result) — LRA Beban Operasional value(L) cocok sheet `Beban Operasional ` `(2)` (≤ Rp 1); isDynamic==false sehingga overlay delta robust (5.1) berlaku_
    - _Preservation: kategori LRA lain (penerimaan/bebanUmum/bebanInvestasi) dan bulan lain tidak berubah_
    - _Requirements: 2.1_

  - [x] 5.4 Tambahkan scroll horizontal untuk semua laporan (fitur tampilan)
    - Di `src/index.css`, tambahkan `overflow-x: auto;` pada `.report-doc-body` (badan yang memuat `<table>` langsung). Pertahankan `.report-doc { overflow: hidden }` untuk kliping sudut membulat (scrollbar muncul di dalam badan, bukan terpotong).
    - Jaga keterbacaan: pertahankan `table { width: 100% }` namun pastikan tabel multi-kolom memakai lebar konten (mis. `min-width` wajar atau `white-space: nowrap` pada header) agar melebar & memicu scroll, bukan meremas kolom.
    - Di blok `@media print`, set `.report-doc-body { overflow: visible !important; }` agar seluruh kolom ikut tercetak.
    - Catat tradeoff sticky header: karena `overflow-x` mengubah sumbu lain menjadi `auto`, `thead th { position: sticky; top: 0 }` menjadi relatif terhadap `.report-doc-body`; scroll vertikal halaman via `.content` tetap berfungsi (Req 3.6). Wrapper scroll per-laporan adalah opsi lanjutan di luar lingkup CSS minimal ini.
    - _Bug_Condition: isBugCondition(input) — layoutBug: renderedTableWidth > viewportWidth AND NOT horizontalScrollAvailable_
    - _Expected_Behavior: expectedBehavior(result) — layoutOK: untuk semua laporan renderedWidth > viewport, horizontalScrollAvailable == true (termasuk dua laporan berdampingan)_
    - _Preservation: laporan sempit tanpa scrollbar tak perlu; cetak/ekspor memuat seluruh kolom; scroll vertikal tetap berfungsi_
    - _Requirements: 2.5, 2.6_

  - [x] 5.5 Verifikasi exploratory test overlay delta (task 1) kini LULUS
    - **Property 1: Expected Behavior** - Overlay Delta Akurat di Atas Baseline yang Benar
    - **IMPORTANT**: Jalankan ULANG test yang SAMA dari task 1 — JANGAN menulis test baru. Test itu meng-encode Expected Behavior.
    - Jalankan `scripts/explore_overlay_delta.cjs` terhadap DB QA: baseline `(2)` + jurnal `JV-` yang disuntik.
    - **EXPECTED OUTCOME**: Test LULUS — untuk setiap baris/total `L` keempat laporan, `ABS(renderValue(L) − (baseline(L) + correctlyAttributedDelta(L))) ≤ 1`; total == Σ leaf (tanpa double-count); Neraca seimbang; tanda & outline benar; akun unmapped tertandai (tidak hilang). Mengonfirmasi overlay delta kini andal **tanpa** re-baseline.
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.6 Verifikasi exploratory test tata letak (task 2) kini LULUS
    - **Property 3: Expected Behavior** - Scroll Horizontal untuk Laporan Lebar
    - **IMPORTANT**: Jalankan ULANG test yang SAMA dari task 2 — JANGAN menulis test baru.
    - Build CSS (`npm run build`) lalu jalankan `tests/explore_layout_scroll.spec.js`.
    - **EXPECTED OUTCOME**: Test LULUS — laporan lebar (termasuk dua laporan berdampingan) dapat digulir horizontal, seluruh kolom terlihat.
    - _Requirements: 2.5, 2.6_

  - [x] 5.7 Verifikasi preservation test angka (task 3) tetap LULUS
    - **Property 2: Preservation** - Bulan Lain, Juni Tanpa Delta, dan Baris Tak Terdampak
    - **IMPORTANT**: Jalankan ULANG test yang SAMA dari task 3 — JANGAN menulis test baru.
    - Jalankan `scripts/preserve_numeric.cjs`; bandingkan dengan snapshot baseline yang direkam di task 3.
    - **EXPECTED OUTCOME**: Test LULUS — Jan–Mei tidak berubah, Juni tanpa delta = `(2)`, baris tak terdampak stabil, dan tanpa delta relevan overlay tidak menggeser baris (tanpa regresi).
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 5.8 Verifikasi preservation test tata letak/ekspor (task 4) tetap LULUS
    - **Property 4: Preservation** - Laporan Sempit, Cetak/Ekspor, dan Scroll Vertikal
    - **IMPORTANT**: Jalankan ULANG test yang SAMA dari task 4 — JANGAN menulis test baru.
    - Jalankan `tests/preserve_layout_export.spec.js`.
    - **EXPECTED OUTCOME**: Test LULUS — laporan sempit tanpa scrollbar tak perlu, cetak/ekspor memuat seluruh kolom, scroll vertikal tetap berfungsi (tanpa regresi).
    - _Requirements: 3.4, 3.5, 3.6_

- [x] 6. Unit tests (atribusi delta, pemetaan LRA, parser & konsistensi)
  - Tulis unit test `.cjs` (mis. `scripts/unit_delta_and_parsers.cjs`).
  - Resolusi atribusi delta: helper kode-COA→label (alias) di `src/utils/reportDelta.js` mengembalikan label baris Excel yang benar untuk akun relevan; `isDebitNormal(code)` benar untuk SELURUH kelas akun (termasuk `9x`).
  - Pemetaan LRA: `resolveOutline`/`resolveOperasionalOutline` (di `src/utils/lraOutline.js` dan salinan lokal `src/pages/LRA.jsx`) untuk kode akun — termasuk induk `62010` — mengembalikan outline yang benar dan **tidak** jatuh ke `1.1.1`.
  - Parser snapshot: `parseNeraca`/`parseArusKas`/`parseLabaRugi`/`parseBebanOperasional` terhadap sheet `(2)` → total sama dengan `(2)`.
  - `loadLraToAnggaran` untuk `bebanOperasional` menulis baris `ANG-bebanOperasional-<outline>` bulan 6 → `hasAuditedForCategory` menjadi `true`.
  - Keseimbangan Neraca (Jumlah Aset == Jumlah Kewajiban + Ekuitas) dan konsistensi total (JUMLAH == Σ leaf) pada hasil snapshot `(2)` **dan setelah overlay delta**.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 7. Property-based tests (fix checking + preservation checking menyeluruh)
  - **(Utama)** Untuk jurnal `JV-` acak di Juni **di atas baseline benar**, untuk himpunan baris acak pada keempat laporan: `ABS(renderValue(L) − (baseline(L) + correctlyAttributedDelta(L))) <= 1`, `total == Σ leaf` (tanpa double-count), Neraca seimbang, tanda & outline benar, dan akun unmapped tertandai (Property 1).
  - Untuk periode acak Jan–Mei dan baris acak: nilai sebelum == sesudah perbaikan; dan tanpa delta relevan, overlay tidak menggeser baris (Property 2).
  - Untuk lebar viewport & jumlah kolom acak: `renderedWidth > viewport ⇒ horizontalScrollAvailable` dan `renderedWidth <= viewport ⇒ tidak ada scrollbar horizontal` (Property 3 & 4).
  - Terapkan via sampling acak di skrip `.cjs`/`playwright` (atau tambahkan `fast-check` bila diinginkan).
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 8. Integration tests (alur penuh & regresi lintas bulan)
  - **Alur tanpa re-baseline (utama)**: dari baseline `(2)` Juni, tambah satu/beberapa jurnal `JV-` → buka tab Laba Rugi/Neraca/Arus Kas/LRA → hanya baris + seluruh induk terkait yang bergeser tepat sebesar delta (setara Excel), Neraca seimbang, total == Σ leaf; **tidak** perlu memuat Excel baru.
  - **Alur setup**: muat snapshot `(2)` untuk Juni (sekali) → seluruh nilai tanpa delta cocok `(2)` (≤ Rp 1).
  - **Akun unmapped**: tambah jurnal pada akun tanpa pemetaan → indikator "unmapped" muncul; total tetap seimbang (tidak hilang diam-diam).
  - **Tata letak (playwright)**: render laporan lebar dan dua laporan berdampingan → scroll horizontal tersedia; lalu Cetak Laporan & Unduh Excel → seluruh kolom termuat; scroll vertikal tetap berfungsi.
  - **Regresi lintas bulan**: berpindah antar Januari–Mei dan Juni tidak mengubah angka bulan teraudit lain.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 9. Checkpoint — pastikan semua test lulus
  - Jalankan ulang seluruh test (task 1–4 sesuai status pasca-perbaikan, 5.5–5.8, 6, 7, 8) dan `npm run build`.
  - Pastikan: exploratory bug-condition test (1 overlay delta, 2 tata letak) kini LULUS setelah perbaikan; preservation test (3, 4) tetap LULUS; unit/property-based/integration test LULUS.
  - Verifikasi inti mekanisme utama: setelah 5.1, jurnal `JV-` baru di atas baseline benar mengalir benar ke keempat laporan **tanpa** re-baseline (overlay delta andal).
  - Bila ada pertanyaan atau hasil tak terduga, tanyakan ke pengguna sebelum melanjutkan.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
