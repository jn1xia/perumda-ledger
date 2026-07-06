# Perbaikan Laporan Juni 2026 — Bugfix Design

## Overview

Empat laporan keuangan Juni 2026 — **LRA (bagian Beban Operasional)**, **Laporan Laba Rugi**, **Neraca**, dan **Laporan Arus Kas** — menampilkan angka yang berbeda secara material dari Excel acuan resmi **"LAMPIRAN LAPORAN KEUANGAN JUNI 2026 (2)"** (`src/FILES/LAMPIRAN LAPORAN KEUANGAN JUNI 2026  (2).xlsx`).

Aplikasi memakai arsitektur **Snapshot + Delta**: bulan teraudit dirender dari _snapshot_ Excel beku (tabel `report_neraca` / `report_laba_rugi` / `report_arus_kas` dan tabel `anggaran` untuk LRA), lalu jurnal yang diinput pengguna (id berawalan `JV-`/`JRN-`) ditumpuk sebagai _delta_ di atas snapshot tersebut (`src/utils/reportDelta.js`, `src/pages/Laporan.jsx`, `src/pages/LRA.jsx`). LRA memakai mesin terpisah berbasis pemetaan _outline_ (`src/utils/lraOutline.js`).

**Strategi perbaikan (mengikuti umpan balik pengguna): jadikan _overlay delta yang robust_ sebagai mekanisme UTAMA dan BERKELANJUTAN.** Pengguna **tidak** ingin mengunggah/`re-baseline` snapshot Excel baru setiap kali menambah jurnal. Yang diinginkan: setelah baseline yang benar ada, **setiap jurnal baru yang di-posting otomatis mengalir ke keempat laporan**, ter-atribusi ke baris yang tepat **beserta seluruh subtotal/total induknya**, dan cocok dengan apa yang **akan** dihitung Excel — **tanpa** perlu baseline baru.

Karena itu fokus utama dokumen ini adalah membuat overlay delta **andal**: memetakan jurnal ke baris rinci (bukan hanya total bucket), arah tanda (debit/kredit) yang benar, outline LRA yang benar, propagasi ke semua subtotal/total tepat satu kali (tanpa _double-count_, Neraca tetap seimbang), serta perlakuan yang jelas untuk akun yang belum terpetakan (tidak boleh hilang diam-diam).

Mekanisme **snapshot + `load-audited` tetap dipertahankan utuh dan tetap dipakai SAAT DIPERLUKAN**, namun diposisikan sebagai operasi **setup satu kali / sesekali**, bukan rutinitas per-jurnal:
1. **Sekali** untuk mengoreksi baseline Juni yang terbukti **basi** — snapshot Juni saat ini dimuat dari berkas **interim** `src/Mei Data/june data/LAMPIRAN LAPORAN KEUANGAN JUNI 2026 .xlsx`, bukan dari Excel acuan `(2)`. Sebelum baseline dikoreksi, laporan sudah menyimpang walau tanpa delta.
2. **Sesekali** setiap kali ada Excel teraudit resmi BARU diterbitkan (mis. revisi audit bulan berikutnya).

Selain itu, sebagai bagian dari koreksi baseline (paritas dengan tiga laporan lain), **Beban Operasional dimuat ke snapshot LRA** agar LRA berhenti menghitung Beban Operasional secara dinamis dan ikut memakai pola snapshot + delta.

Terakhir, dokumen ini juga merancang fitur **scroll horizontal** untuk semua laporan: kontainer `.report-doc` saat ini memakai `overflow: hidden` (`src/index.css`) sehingga kolom yang melebihi lebar area terpotong tanpa cara menggulir, terutama ketika beberapa laporan ditampilkan berdampingan.

## Glossary

- **Bug_Condition (C)**: Kondisi yang memicu bug. Cabang **numerik utama (ongoing)**: di atas baseline yang sudah benar, sebuah jurnal posted menghasilkan nilai render yang berbeda dari `baseline + delta-ter-atribusi-benar` (setara hitungan Excel) — mis. baris rincian tidak bergerak (hanya total bucket), tanda salah, outline LRA salah, alias tidak ada, total ≠ jumlah leaf, Neraca tak seimbang, atau jurnal hilang diam-diam. Cabang **numerik setup**: snapshot Juni belum bersumber dari `(2)` dan/atau Beban Operasional belum ada di snapshot LRA. Cabang **tampilan**: lebar tabel laporan melebihi lebar kontainer sehingga terpotong tanpa scroll horizontal.
- **Property (P)**: Perilaku benar — untuk jurnal posted apa pun di atas baseline benar, `renderValue(L) == baseline(L) + correctlyAttributedDelta(L)` (≤ Rp 1) pada baris rinci maupun seluruh induknya, Neraca tetap seimbang, setiap total = jumlah leaf penyusunnya (tanpa double-count), dan tidak ada jurnal yang hilang diam-diam; serta setiap laporan lebar dapat digulir horizontal.
- **Preservation**: Perilaku yang harus tetap sama — bulan Jan–Mei tidak berubah; Juni tanpa jurnal pengguna sama persis dengan `(2)` (setelah re-baseline setup); baris/akun yang tak disentuh jurnal tetap; cetak/ekspor dan scroll vertikal tetap berfungsi.
- **Snapshot / Baseline**: Angka Excel beku per periode di `report_neraca` / `report_laba_rugi` / `report_arus_kas` dan di tabel `anggaran` (baris `ANG-<kategori>-<outline>`) untuk LRA.
- **Delta (overlay)**: Jurnal yang diinput pengguna (`isDeltaJournal`, id `JV-`/`JRN-`) yang ditumpuk di atas snapshot tanpa mengubah snapshot. Jurnal baseline import berawalan `XL-`/`SUM-`/`ADJ-`/`CAS-` tidak dihitung sebagai delta.
- **Atribusi delta**: Proses menempatkan delta sebuah jurnal ke baris laporan yang benar. Saat ini dua jalur terpisah dan rapuh: **total bucket** via `deltaByPrefix(set, prefix, isDebit)` (per prefix kode akun) dan **baris leaf** via `deltaByName` (cocok nama akun ter-lowercase) atau peta alias (`reconcileAlias.json` untuk Neraca, `lrAlias.json` untuk Laba Rugi).
- **applyNeracaDelta / applyLabaRugiDelta**: Fungsi lokal di `src/pages/Laporan.jsx` yang menumpuk delta ke baris snapshot Neraca/Laba Rugi (total via bucket, leaf via nama/alias, subtotal Neraca via akumulator `acc`).
- **SOURCES**: Konfigurasi periode → berkas lampiran + nama sheet di `scripts/import_report_data.cjs`. Dipakai oleh `POST /reports/load-audited` (`server/routes/api.cjs`) dan CLI `scripts/load_audited_period.cjs` untuk memuat snapshot audited + men-_demote_ `JV-`→`XL-`.
- **resolveOutline / resolveOperasionalOutline**: Fungsi di `src/utils/lraOutline.js` (dan salinan lokal di `src/pages/LRA.jsx`) yang memetakan kode akun COA (+ keterangan) ke nomor outline LRA (mis. `1.1.1`).
- **isDynamic (LRA)**: Penanda di `lraData` (`src/pages/LRA.jsx`); `true` → kategori dihitung dinamis dari jurnal, `false` → memakai snapshot anggaran + delta. Ditentukan oleh `hasAuditedForCategory` (ada baris `anggaran` untuk periode+kategori).
- **.report-doc / .report-doc-body**: Kontainer kartu laporan dan badan tabelnya di `src/index.css`; titik perbaikan untuk scroll horizontal.

## Bug Details

### Bug Condition

Bug **angka** terbagi dua sebab yang berbeda sifatnya:

- **(Utama, berkelanjutan) Atribusi delta yang rapuh.** Bahkan di atas baseline yang BENAR, sebuah jurnal `JV-` yang di-posting tidak terjamin tercermin dengan benar pada laporan. Penyebabnya: total laporan digeser per **bucket prefix** (`deltaByPrefix`) sementara baris rinci hanya digeser bila **nama akun cocok** (`deltaByName`) atau ada **alias** (`reconcileAlias.json`/`lrAlias.json`) — sehingga sering hanya **total** yang bergerak dan baris rinci tidak; subtotal Neraca (akumulator `acc`) bisa tak konsisten dengan total bucket; tanda bisa salah untuk kode di luar pola `/^[1568]/`/`/^[2347]/` (mis. akun 9); LRA memetakan akun induk ke "anak pertama" yang salah (`62010` → `1.1.1`); Arus Kas hanya menggeser "Kenaikan/Akhir Periode" tanpa mengklasifikasikan ke aktivitas yang benar; dan jurnal yang akunnya tak terpetakan **hilang diam-diam** dari baris rinci.
- **(Setup, sekali) Baseline snapshot basi.** Snapshot Juni dimuat dari berkas interim, bukan `(2)`; dan Beban Operasional belum ada di snapshot LRA sehingga LRA menghitungnya dinamis. Akibatnya laporan menyimpang dari `(2)` bahkan sebelum ada delta.

Bug **tampilan** muncul ketika lebar tabel laporan melebihi lebar kontainer `.report-doc`/`.report-doc-body`; karena `.report-doc { overflow: hidden }` dan badan laporan tidak memiliki `overflow-x`, kolom terpotong tanpa cara menggulir horizontal.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = {
           period,             // mis. '2026-06'
           baselineState,      // sumber & kelengkapan snapshot periode
           postedDeltaJournals,// jurnal posted JV-/JRN- (mis. 17–20 Juni 2026)
           reportType,         // 'lra-beban-operasional' | 'laba-rugi' | 'neraca' | 'arus-kas'
           viewportWidth       // lebar area tampil (untuk cabang tampilan)
         }
  OUTPUT: boolean

  // --- Cabang 1a (UTAMA/ongoing): overlay delta salah atribusi di atas baseline BENAR ---
  deltaMisattributed := EXISTS d IN input.postedDeltaJournals,
      EXISTS line L IN lines(input.reportType) SUCH THAT
        renderedValue(L, correctBaseline, d)
          != correctBaseline(L) + correctlyAttributedDelta(L, d)
      // sebab: leaf tak bergerak (hanya bucket), tanda salah, outline LRA salah,
      //        alias tak ada, total != sum(leaf), Neraca tak seimbang, double-count,
      //        atau jurnal tak terpetakan hilang diam-diam

  // --- Cabang 1b (SETUP/sekali): baseline snapshot belum benar ---
  staleBaseline := (input.period == '2026-06')
    AND ( snapshotSource('2026-06') != officialExcel('(2)')
          OR NOT lraSnapshotHasCategory('2026-06', 'bebanOperasional') )

  numericBug := deltaMisattributed OR staleBaseline

  // --- Cabang 2: laporan lebar terpotong tanpa scroll horizontal ---
  layoutBug := (renderedTableWidth(input.reportType) > input.viewportWidth)
    AND NOT horizontalScrollAvailable(input.reportType)

  RETURN numericBug OR layoutBug
END FUNCTION
```

### Examples

Nilai diverifikasi pada investigasi awal dari DB QA (`server/perumda_ledger.qa.db`, snapshot 2026-06 aktif) dan dari berkas Excel Juni. "Aplikasi (snapshot)" = nilai snapshot tersimpan; "Excel (2)" = acuan resmi.

**Contoh atribusi delta rapuh (kondisi utama — dari kode terverifikasi):**
- **Leaf tidak bergerak, hanya total:** `applyLabaRugiDelta` menggeser "JUMLAH BEBAN UMUM DAN ADMINISTRASI" via bucket `deltaByPrefix(set,'61',true)`, tetapi baris rinci beban hanya bergeser jika nama akun jurnal sama persis dengan label Excel atau ada di `lrAlias.json` (hanya 1 entri: `61140`). Untuk akun 61 lain, total naik tetapi baris rincinya tidak → total ≠ jumlah baris.
- **Neraca subtotal tak konsisten:** `applyNeracaDelta` menghitung "Jumlah Aset Lancar" dari akumulator `acc` (hanya delta leaf yang cocok nama/alias), sedangkan "JUMLAH ASET" dari bucket `dN.aset`. Delta aset lancar yang tak cocok nama jatuh ke "Jumlah Aset Tidak Lancar" (`dN.aset − lancarDelta`) → salah klasifikasi lancar/tidak-lancar walau grand total benar.
- **Arus Kas tak terklasifikasi:** untuk delta, hanya baris yang cocok `/kenaikan|akhir periode/i` yang ditambah `cashDeltaLR`; aktivitas Operasi/Investasi/Pendanaan tidak ikut bergerak.
- **Outline LRA salah:** `resolveOperasionalOutline('62010', keterangan tanpa kata kunci)` → `null`, lalu `resolveOutline` jatuh ke `ACCOUNT_TO_OUTLINE['62010'] = '1.1.1'` (anak pertama), sehingga delta nyangkut di baris rincian yang salah.
- **Alias nyaris kosong:** `reconcileAlias.json` hanya 5 entri, `lrAlias.json` 1 entri → mayoritas akun tidak punya jembatan kode→label, jadi baris rincinya tak pernah bergerak oleh delta.

**Contoh baseline basi (kondisi setup — investigasi awal):**
- **Laba Rugi — Jumlah Beban Umum dan Administrasi**: Aplikasi `Rp 78.113.422` vs Excel `(2)` `Rp 98.251.556` → selisih ± Rp 20,1 juta.
- **Laba Rugi — Jumlah Beban Operasional dan Bisnis**: Aplikasi `Rp 88.641.984` vs Excel `(2)` `Rp 102.375.224` → selisih ± Rp 13,7 juta.
- **Laba Rugi — Jumlah Pendapatan Usaha**: Aplikasi `Rp 0` vs Excel `(2)` `Rp 411.628.132`.
- **Laba Rugi — Laba (Rugi) Bersih Setelah Pajak**: Aplikasi `−Rp 166.805.406` vs Excel `(2)` `−Rp 157.809.133`.
- **Neraca — Jumlah Aset**: Aplikasi `Rp 864.002.895.758,08` vs Excel `(2)` `Rp 864.057.003.031,08`; **Jumlah Aset Lancar** `Rp 14.699.574.325,83` vs `Rp 14.246.220.598,83`.
- **Arus Kas — Saldo Kas Akhir Periode**: Aplikasi `Rp 14.067.517.024,83` vs Excel `(2)` `Rp 13.564.197.197,83` (saldo awal identik `Rp 14.553.900.060,83`).
- **LRA Beban Operasional — Sd Periode Ini (akumulasi)**: sheet baseline `Rp 1.520.521.362` vs Excel `(2)` `Rp 1.534.254.602`; ditambah LRA Beban Operasional dihitung dinamis (`isDynamic == true`) karena tak ada baris snapshot `bebanOperasional` bulan 6.

**Tampilan (edge/feature case):** ketika laporan multi-kolom (mis. LRA 9 kolom, atau dua laporan berdampingan) lebih lebar dari area, kolom kanan terpotong dan tidak ada scrollbar horizontal.

Catatan: snapshot tersimpan **cocok persis** dengan berkas interim `src/Mei Data/june data/LAMPIRAN LAPORAN KEUANGAN JUNI 2026 .xlsx`, membuktikan snapshot dimuat dari berkas tersebut, bukan dari `(2)`.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Laporan bulan teraudit lain (Januari–Mei 2026) SHALL CONTINUE TO menampilkan nilai yang sama dengan lampiran Excel masing-masing bulan (tidak boleh ikut berubah oleh perbaikan Juni atau oleh perbaikan overlay delta).
- Juni 2026 **tanpa** jurnal pengguna SHALL CONTINUE TO menampilkan seluruh laporan sama persis dengan snapshot Excel resmi (setelah re-baseline setup, ini berarti sama dengan `(2)`).
- Baris/akun yang **tidak** disentuh oleh jurnal pengguna SHALL CONTINUE TO menampilkan nilainya tanpa perubahan.
- Jurnal baseline import (`XL-`/`SUM-`/`ADJ-`/`CAS-`) SHALL CONTINUE TO tidak dihitung sebagai delta (tidak boleh dobel atas snapshot).
- Cetak Laporan (`printReport`) dan Unduh Excel (`exportLabaRugi`, `exportNeraca`, `exportArusKas`, `exportFullReport`) SHALL CONTINUE TO menghasilkan keluaran berfungsi yang memuat seluruh kolom.
- Scroll **vertikal** di dalam laporan (via `.content`) dan header tabel yang menempel (`thead th { position: sticky }`) SHALL CONTINUE TO berfungsi.
- Laporan yang cukup sempit untuk muat di area tampilan SHALL CONTINUE TO ditampilkan tanpa scrollbar horizontal yang tidak perlu.

**Scope:**
Semua masukan yang TIDAK memenuhi Bug Condition harus benar-benar tidak terpengaruh oleh perbaikan ini, mencakup:
- Periode selain `2026-06` (Januari–Mei dan proyeksi bulan setelahnya yang belum teraudit).
- Baris laporan yang nilainya sudah cocok dengan `(2)` dan tidak disentuh delta.
- Laporan yang lebarnya muat di viewport (tidak memicu scroll horizontal).

_Catatan: perilaku benar (nilai yang seharusnya) didefinisikan pada bagian Correctness Properties (Property 1–3). Bagian ini fokus pada apa yang TIDAK boleh berubah._

## Hypothesized Root Cause

Berdasarkan bukti dari kode dan data, ada **dua kelas** akar masalah. Sesuai umpan balik pengguna, kelas (A) — robustnya overlay delta — adalah **fokus utama berkelanjutan**, sedangkan kelas (B) — baseline — adalah **koreksi setup sekali**.

### A. Overlay delta tidak andal (PRIMER — mekanisme berkelanjutan)

Inilah yang membuat pengguna terpaksa re-baseline tiap menambah jurnal. Bukti dari kode:

1. **Total bergerak per bucket, baris rinci per nama → keduanya bisa tak konsisten.**
   - Di `src/pages/Laporan.jsx`, `applyLabaRugiDelta` menggeser baris total (`JUMLAH …`, `LABA …`, `EBITDA`) dari bucket `deltaByPrefix(set, prefix, isDebit)` (mis. `dLR.admin = deltaByPrefix(set,'61',true)`). Baris **leaf** hanya digeser bila `nameMapLR[label.toLowerCase()]` cocok (`deltaByName`) atau `lrAliasDeltaByLabel` (via `lrAlias.json`). Bila tak cocok → **total naik tetapi baris rinci diam**, sehingga `total ≠ Σ leaf`.
   - `applyNeracaDelta` serupa: subtotal "Jumlah Aset Lancar"/"Tidak Lancar" dari akumulator `acc` (hanya leaf yang cocok), grand total dari bucket `dN.*`. Delta leaf tak-cocok jatuh ke subtotal yang salah.

2. **Peta alias nyaris kosong.** `src/utils/reconcileAlias.json` hanya 5 entri; `src/utils/lrAlias.json` hanya 1 entri (`61140`). Mayoritas kode COA tak punya jembatan kode→label Excel, jadi baris rincinya tak pernah bergerak oleh delta.

3. **Pencocokan berbasis nama (lowercase) rapuh.** `deltaByName` memakai nama akun ter-lowercase/ter-trim sebagai kunci. Jika nama akun jurnal ≠ label baris Excel (singkatan, ejaan, tambahan nomor rekening), pencocokan gagal → delta tak menempel ke baris.

4. **Tanda (debit/kredit-normal) berbasis digit pertama, ada celah.** `deltaByName`/alias memakai `/^[1568]/` (debit-normal: aset/HPP/beban/beban non-ops) → +debit/−kredit, dan `/^[2347]/` (kredit-normal) → +kredit/−debit. Kode di luar kedua pola (mis. `9x` pajak penghasilan) jatuh ke cabang `−1` (kredit-normal) → arah bisa salah.

5. **Outline LRA jatuh ke "anak pertama" yang salah.** `resolveOperasionalOutline('62010', ket)` mengembalikan `null` bila `keterangan` tak memuat kata kunci; lalu `resolveOutline` memakai `ACCOUNT_TO_OUTLINE['62010'] = '1.1.1'`. Jadi jurnal pada akun induk Beban Operasional nyangkut di baris rincian `1.1.1`, bukan baris yang benar.

6. **Arus Kas tak mengklasifikasikan delta.** Saat render Arus Kas (`refArusKasData.map`), delta hanya ditambahkan ke baris yang cocok `/kenaikan|akhir periode/i` sebesar `cashDeltaLR` (net 111). Aktivitas Operasi/Investasi/Pendanaan tidak ikut bergerak.

7. **Akun tak terpetakan hilang diam-diam.** Tidak ada indikator "unmapped"; bila sebuah jurnal tak cocok nama/alias/outline, dampaknya hanya muncul di total bucket (atau tidak sama sekali untuk LRA), tanpa peringatan ke pengguna.

### B. Baseline snapshot perlu dikoreksi (SETUP — sekali / sesekali)

1. **Snapshot baseline Juni basi / salah sumber (terbukti).**
   - `SOURCES` untuk `2026-06` di `scripts/import_report_data.cjs` menunjuk `dir: JUNI_DIR` (`src/Mei Data/june data`) dan `file: 'LAMPIRAN LAPORAN KEUANGAN JUNI 2026 .xlsx'` — berkas **interim**.
   - `POST /reports/load-audited` / `scripts/load_audited_period.cjs` membaca berkas itu, mengisi `report_*` + `anggaran`, dan men-_demote_ jurnal `JV-` bulan tsb menjadi `XL-` (baseline).
   - Verifikasi: nilai di DB **identik** dengan berkas interim dan **berbeda material** dari `(2)`. Maka laporan menyimpang **independen** dari delta apa pun. Koreksi: muat ulang dari `(2)` — **sekali**.

2. **Beban Operasional tidak dimuat ke snapshot LRA → LRA dinamis (terbukti).**
   - `lraSheets` Juni di `SOURCES` hanya `Penerimaan`, `Beban Umum`, ` Investasi` — **tanpa** `Beban Operasional `. Selain itu kedua jalur muat (`server/routes/api.cjs` dan `scripts/load_audited_period.cjs`) memakai `reportImport.parsePenerimaan` (layout datar `^\d+\.\d+$`) yang **tidak** bisa mem-parse layout 3-level Beban Operasional; parser 3-level `parseBebanOperasional` ada di `src/utils/reportSnapshot.js` (ESM sisi-browser) namun **tidak** tersedia di modul CommonJS `scripts/import_report_data.cjs` yang dipakai jalur muat.
   - Akibat: tak ada baris `anggaran` `bebanOperasional` bulan 6 → `hasAuditedForCategory == false` → `isDynamic == true` untuk Beban Operasional → LRA menghitung dinamis, tidak match `(2)`.

### Mengapa fokus pada A

Mengoreksi baseline (B) saja akan membuat laporan cocok `(2)` **hari ini**, tetapi **jurnal berikutnya** yang di-posting akan kembali salah atribusi (A) dan memaksa pengguna re-baseline lagi — persis keluhan pengguna. Karena itu (A) wajib diperbaiki agar overlay delta dapat dipercaya sebagai mekanisme tetap; (B) cukup dijalankan sekali untuk menyetel titik awal yang benar (dan diulang hanya bila ada Excel audited resmi baru).

**Reposisi opsi perbaikan:**

| Opsi | Peran | Memperbaiki | Catatan |
|------|-------|-------------|---------|
| **Overlay delta robust** (dulu "Opsi B") | **PRIMER, berkelanjutan** | Atribusi baris+total yang benar untuk setiap jurnal baru tanpa re-baseline | Perlu peta alias berbasis kode COA, tanda benar, outline LRA benar, propagasi induk tepat satu kali, indikator unmapped, klasifikasi Arus Kas |
| **Re-baseline snapshot** (dulu "Opsi A") | **Setup sekali / sesekali** | Titik awal Juni = `(2)`; dipakai ulang saat Excel audited baru terbit | Pertahankan `load-audited`/snapshot utuh; bukan rutinitas per-jurnal |
| **Muat Beban Operasional ke snapshot LRA** (dulu "Opsi C") | **Setup (paritas LRA)** | LRA Beban Operasional berbasis snapshot + delta seperti 3 laporan lain (`isDynamic=false`) | Perlu parser 3-level di jalur muat CommonJS + entry `lraSheets` |

## Correctness Properties

Property 1: Bug Condition — Overlay Delta Akurat di Atas Baseline yang Benar (mekanisme utama)

_For any_ jurnal posted (atau himpunan jurnal) yang ditumpuk di atas baseline yang benar — kondisi di mana isBugCondition terpenuhi pada cabang `deltaMisattributed` — sistem yang sudah diperbaiki SHALL merender, untuk setiap baris `L` pada keempat laporan (LRA Beban Operasional, Laba Rugi, Neraca, Arus Kas), nilai `renderValue(L) = baseline(L) + correctlyAttributedDelta(L)` yang sama dengan hitungan setara-Excel dalam toleransi ≤ Rp 1, dengan: (a) delta menempel ke **baris leaf yang benar** (dipetakan via kode akun COA yang stabil), (b) **arah tanda** sesuai saldo normal akun, (c) **outline LRA** yang benar (tanpa fallback "anak pertama" `1.1.1` yang salah), (d) setiap **subtotal/total induk** ikut bergerak **tepat satu kali** sehingga `total == Σ leaf` (tanpa double-count) dan Neraca tetap seimbang (Jumlah Aset = Jumlah Kewajiban + Ekuitas), serta (e) jurnal yang akunnya **belum terpetakan tidak hilang diam-diam** (dipetakan via kode COA atau ditandai sebagai "unmapped"). Semua ini berlaku **tanpa** memerlukan re-baseline.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation — Bulan Lain, Juni Tanpa Delta (= `(2)`), dan Baris Tak Terdampak

_For any_ input di mana bug condition TIDAK terpenuhi (isBugCondition mengembalikan false) — yaitu periode Januari–Mei 2026, atau Juni tanpa jurnal pengguna (setelah re-baseline setup), atau baris yang tidak disentuh jurnal pengguna — sistem yang sudah diperbaiki SHALL menghasilkan hasil yang sama dengan perilaku resmi/semula: cocok dengan lampiran Excel masing-masing bulan, Juni tanpa delta sama persis `(2)`, dan baris tak terdampak stabil. Perbaikan overlay delta tidak boleh menggeser baris/total ketika tidak ada delta yang relevan.

**Validates: Requirements 3.1, 3.2, 3.3**

Property 3: Bug Condition — Scroll Horizontal untuk Laporan Lebar

_For any_ input di mana bug condition terpenuhi pada cabang tampilan (lebar tabel > lebar viewport), tata letak yang sudah diperbaiki SHALL menyediakan scroll horizontal sehingga seluruh kolom dapat dilihat tanpa terpotong, termasuk ketika dua laporan atau lebih ditampilkan berdampingan.

**Validates: Requirements 2.5, 2.6**

Property 4: Preservation — Laporan Sempit, Cetak/Ekspor, dan Scroll Vertikal

_For any_ input di mana bug condition pada cabang tampilan TIDAK terpenuhi (lebar tabel ≤ viewport, atau aksi cetak/ekspor, atau scroll vertikal), tata letak yang sudah diperbaiki SHALL menghasilkan perilaku yang sama dengan semula: tanpa scrollbar horizontal yang tidak perlu, keluaran cetak/ekspor tetap memuat seluruh kolom, dan scroll vertikal tetap didukung.

**Validates: Requirements 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Perubahan diurutkan sesuai prioritas umpan balik: **(1) overlay delta robust (primer/ongoing)**, **(2) re-baseline setup sekali**, **(3) Beban Operasional ke snapshot LRA (paritas setup)**, **(4) scroll horizontal (tampilan)**.

**1. Overlay delta yang robust — mekanisme UTAMA & berkelanjutan.**

**Tujuan**: setelah baseline benar, setiap jurnal `JV-`/`JRN-` yang di-posting otomatis ter-atribusi benar ke baris rinci + seluruh induknya di keempat laporan, setara hitungan Excel, **tanpa** re-baseline.

**File**: `src/utils/reportDelta.js`, `src/utils/reconcileAlias.json`, `src/utils/lrAlias.json`, `src/utils/lraOutline.js`, `src/pages/Laporan.jsx`, `src/pages/LRA.jsx`

**Specific Changes**:
1. **Pemetaan berbasis kode COA (bukan nama lowercase).** Jadikan **kode akun COA** kunci utama atribusi baris. Untuk Neraca/Laba Rugi, perkaya `reconcileAlias.json` dan `lrAlias.json` menjadi peta **lengkap** `kodeCOA → label baris Excel persis` untuk seluruh akun yang dapat muncul di jurnal, dan utamakan jalur alias-by-code dibanding `deltaByName`. Sediakan helper resolusi label berbasis kode di `reportDelta.js` agar `applyNeracaDelta`/`applyLabaRugiDelta` menempel ke baris leaf yang benar.
2. **Tanda saldo normal yang benar.** Bakukan klasifikasi debit/kredit-normal per kode akun (mis. fungsi `isDebitNormal(code)`) yang menangani seluruh kelas akun termasuk yang kini terlewat (akun `9x` pajak, dll.), lalu pakai di `deltaByPrefix`/`deltaByName`/alias agar setiap jurnal menggeser baris ke arah yang benar.
3. **Outline LRA yang benar (tanpa fallback "anak pertama").** Perbaiki `resolveOperasionalOutline` dan `ACCOUNT_TO_OUTLINE` di `src/utils/lraOutline.js` (serta salinan lokal di `src/pages/LRA.jsx`) agar akun induk seperti `62010` **tidak** memetakan ke `1.1.1`. Untuk akun induk yang ambigu tanpa `keterangan` deskriptif, petakan ke outline induk/agregat yang tepat atau tandai unmapped — jangan diam-diam ke anak pertama.
4. **Propagasi ke leaf + seluruh induk, tepat satu kali.** Pastikan satu delta menggeser baris leaf **dan** setiap subtotal/total induknya konsisten: setiap total = jumlah leaf penyusunnya, tanpa double-count. Untuk Neraca, samakan basis perhitungan subtotal (`acc`) dan grand total agar tidak ada delta leaf tak-cocok yang "bocor" ke subtotal yang salah; Neraca harus tetap seimbang setelah overlay.
5. **Klasifikasi Arus Kas.** Selain menggeser "Kenaikan/Penurunan Kas" dan "Saldo Kas Akhir Periode" sebesar `cashDeltaLR`, atribusikan dampak kas delta ke **aktivitas yang benar** (Operasi/Investasi/Pendanaan) sesuai kode lawan akun kas, agar struktur Arus Kas konsisten dengan hitungan Excel.
6. **Perlakuan akun belum terpetakan (graceful).** Jika sebuah jurnal memiliki akun tanpa label Excel yang cocok, **jangan** hilangkan diam-diam: petakan via kode COA bila mungkin, atau **surface indikator "unmapped"** (mis. baris/badge atau peringatan) agar pengguna tahu ada delta yang belum tertampung — tetap menjaga keseimbangan total.

**2. Re-baseline snapshot Juni ke Excel acuan `(2)` — SETUP SEKALI / SESEKALI.**

**Tujuan**: menyetel titik awal Juni yang benar (Juni tanpa delta = `(2)`). Bukan rutinitas per-jurnal. Diulang hanya bila terbit Excel teraudit resmi baru. **Logika snapshot/`load-audited` dipertahankan utuh dan tetap berfungsi.**

**File**: `scripts/import_report_data.cjs` (+ jalankan `load-audited`)

**Specific Changes**:
1. **Arahkan sumber Juni ke berkas acuan**: ubah `dir`/`file` entri `SOURCES` `2026-06` agar menunjuk `src/FILES/LAMPIRAN LAPORAN KEUANGAN JUNI 2026  (2).xlsx` (atau standarisasi/salin `(2)` ke lokasi sumber Juni). Pertahankan nama sheet (`NERACA JUNI 2026`, `ARUS KAS JUNI 2026`, `LABA RUGI JUNI 2026`).
2. **Muat ulang snapshot (sekali)**: jalankan `DB_PATH=server/perumda_ledger.qa.db node scripts/load_audited_period.cjs 2026-06` (atau `POST /reports/load-audited { period: '2026-06' }`) untuk menulis ulang `report_*` + `anggaran` Juni dari `(2)`.
3. **Status jurnal yang sudah tercermin di `(2)`**: endpoint/CLI `load-audited` sudah men-_demote_ `JV-`/`JRN-` bulan itu menjadi `XL-` agar tidak dihitung ganda; verifikasi langkah ini berjalan untuk Juni. Jurnal yang **benar-benar** baru (di luar `(2)`) tetap `JV-` agar mengalir sebagai delta melalui mekanisme robust di poin 1 — **tanpa** perlu baseline lagi.
4. **Reusabilitas**: dokumentasikan bahwa langkah 1–3 inilah prosedur ketika ada Excel audited resmi baru (ganti sumber → `load-audited`), sehingga snapshot tetap menjadi alat setup yang sah dan terpakai saat diperlukan.

**3. Muat Beban Operasional ke snapshot LRA — paritas setup.**

**File**: `scripts/import_report_data.cjs`, `server/routes/api.cjs`, `scripts/load_audited_period.cjs`

**Specific Changes**:
1. **Tambah parser 3-level di modul CommonJS**: tambahkan `parseBebanOperasional` (port dari `src/utils/reportSnapshot.js`: group col2 / sub col3 / rincian col4; nama col5; anggaran col7, target col8, sd_bln_lalu col9, bulan_ini col10, realisasi col11, % col12) ke `scripts/import_report_data.cjs` dan ekspor.
2. **Tambah entri `lraSheets`** Juni: `{ sheet: 'Beban Operasional ', kategori: 'bebanOperasional' }` (perhatikan spasi di belakang nama sheet).
3. **Wire ke KEDUA jalur muat**: di `server/routes/api.cjs` (loop `lraSheets`, ~baris 1348) dan `scripts/load_audited_period.cjs` (~baris 91), pakai `parseBebanOperasional` untuk kategori `bebanOperasional` (bukan `parsePenerimaan`) sebelum `loadLraToAnggaran(run, 'bebanOperasional', period, rows)`. (`loadLraToAnggaran` di api.cjs sudah menerima outline multi-level `^\d+(\.\d+)*$`.)
4. **Konsekuensi otomatis di klien**: dengan adanya baris `anggaran` `bebanOperasional` bulan 6, `hasAuditedForCategory` di `src/pages/LRA.jsx` menjadi `true`, `isDynamic` → `false`, sehingga LRA Beban Operasional memakai snapshot + delta (robust) seperti tiga laporan lainnya. Tidak perlu mengubah logika `lraData`.

**4. Scroll horizontal untuk semua laporan (fitur tampilan).**

**File**: `src/index.css`

**Fungsi/Objek**: aturan `.report-doc` dan `.report-doc-body`

**Specific Changes**:
1. **Aktifkan scroll horizontal pada badan laporan**: tambahkan `overflow-x: auto;` pada `.report-doc-body` (badan yang memuat `<table>` langsung, tanpa pembungkus `.table-container`). Kontainer luar `.report-doc { overflow: hidden }` tetap dipertahankan untuk kliping sudut membulat; scrollbar muncul di dalam badan, bukan terpotong.
2. **Jaga keterbacaan**: pertahankan `width: 100%` pada `table` namun pastikan tabel multi-kolom memakai lebar konten (mis. `min-width` wajar atau `white-space: nowrap` pada header) sehingga melebar dan memicu scroll alih-alih meremas kolom.
3. **Pertahankan cetak/ekspor**: di blok `@media print`, set `.report-doc-body { overflow: visible !important; }` agar seluruh kolom ikut tercetak (tidak terpotong oleh area scroll).
4. **Tradeoff sticky header**: karena CSS menggabungkan `overflow-x` dan `overflow-y` (mengeset salah satu ke `auto` membuat sumbu lain menjadi `auto`), `thead th { position: sticky; top: 0 }` akan menjadi relatif terhadap `.report-doc-body`. Scroll vertikal halaman (via `.content`) tetap berfungsi (Req 3.6 terpenuhi). Jika sticky header pada scroll halaman ingin dipertahankan persis, alternatifnya membungkus tabel dalam wrapper scroll khusus per laporan (perubahan JSX lintas komponen) — di luar lingkup minimal CSS ini dan dicatat sebagai opsi lanjutan.

## Testing Strategy

### Validation Approach

Strategi pengujian dua fase: pertama, munculkan _counterexample_ yang menunjukkan bug pada kode/data yang **belum** diperbaiki — terutama **atribusi delta yang salah di atas baseline benar** (fokus utama), di samping baseline basi, LRA dinamis, dan laporan lebar terpotong; kedua, verifikasi bahwa overlay delta robust menghasilkan `baseline + delta-ter-atribusi-benar` (setara Excel) untuk jurnal apa pun **tanpa re-baseline**, baseline setup cocok `(2)`, dan scroll horizontal tersedia — tanpa meregresi bulan lain, cetak/ekspor, dan scroll vertikal.

### Exploratory Bug Condition Checking

**Goal**: Memunculkan counterexample yang menunjukkan bug SEBELUM perbaikan, dan mengonfirmasi/menolak hipotesis akar masalah (terutama kelas A — overlay delta). Bila tertolak, hipotesis dirumuskan ulang.

**Test Plan**: (i) Untuk kelas A, mulai dari baseline yang sudah benar (muat `(2)` ke DB uji), lalu suntik satu/beberapa jurnal `JV-` dan bandingkan render aplikasi terhadap hitungan setara-Excel yang dikomputasi independen (`baseline + delta` yang dipetakan via kode COA). (ii) Untuk kelas B, bandingkan snapshot DB Juni terhadap `(2)` tanpa delta. Jalankan pada kode/data belum diperbaiki.

**Test Cases**:
1. **Delta leaf vs total (Laba Rugi)**: posting jurnal beban `61xxx` yang namanya ≠ label Excel dan tak ada di `lrAlias.json`; amati total "JUMLAH BEBAN UMUM…" bergerak tetapi baris rinci diam → `total ≠ Σ leaf` (gagal pada kode belum diperbaiki).
2. **Subtotal Neraca salah klasifikasi**: posting jurnal aset lancar yang tak cocok nama/alias; amati "Jumlah Aset Lancar" tidak bergerak sedangkan "Jumlah Aset Tidak Lancar"/grand total bergerak (gagal).
3. **Outline LRA salah**: posting jurnal pada akun induk `62010` tanpa kata kunci `keterangan`; amati delta nyangkut di `1.1.1` (gagal).
4. **Arus Kas tak terklasifikasi**: posting jurnal kas operasional; amati hanya "Kenaikan/Akhir Periode" bergerak, aktivitas Operasi/Investasi/Pendanaan tidak (gagal).
5. **Akun unmapped hilang**: posting jurnal pada akun tanpa alias/outline; amati tidak ada baris rinci yang bergerak dan tidak ada indikator unmapped (gagal).
6. **Baseline basi (setup)**: bandingkan `report_neraca`/`report_laba_rugi`/`report_arus_kas` Juni terhadap sheet `(2)` (gagal — selisih material), dan pastikan tak ada baris `anggaran` `ANG-bebanOperasional-*` bulan 6 → `isDynamic == true`.
7. **Edge — tampilan**: render laporan multi-kolom pada viewport sempit / dua laporan berdampingan; amati kolom terpotong tanpa scrollbar horizontal (gagal pada CSS belum diperbaiki).

**Expected Counterexamples**:
- Untuk jurnal di atas baseline benar: `renderValue(L) ≠ baseline(L) + delta-ter-atribusi-benar` pada banyak baris → membuktikan overlay delta belum andal (penyebab utama keharusan re-baseline).
- Snapshot Juni cocok berkas interim, berbeda dari `(2)` → baseline basi.
- LRA Beban Operasional dihitung dinamis → tidak match `(2)`.
- Kemungkinan penyebab: alias nyaris kosong; pencocokan nama rapuh; tanda salah untuk kode tertentu; fallback outline `1.1.1`; Arus Kas tak terklasifikasi; sumber `SOURCES` Juni salah berkas; `lraSheets` tanpa Beban Operasional + parser salah; `.report-doc` `overflow: hidden` tanpa `overflow-x` pada badan.

### Fix Checking

**Goal**: Memverifikasi bahwa untuk semua input yang memenuhi bug condition, fungsi yang diperbaiki menghasilkan perilaku yang diharapkan — terutama: **untuk jurnal apa pun di atas baseline benar, render = baseline + delta-ter-atribusi-benar (setara Excel), total konsisten, tanpa double-count, Neraca seimbang, tidak ada drop diam-diam** — serta baseline setup cocok `(2)` dan scroll horizontal tersedia.

**Pseudocode:**
```
FUNCTION expectedBehavior(result)
  // result = laporan Juni setelah perbaikan (baseline benar + overlay delta robust) + status tata letak

  // (Utama) overlay delta akurat untuk jurnal arbitrer di atas baseline benar
  deltaOK :=
    FOR ALL posted journal d, FOR ALL line L in 4 reports:
        ABS( renderValue(L, d) - (baseline(L) + correctlyAttributedDelta(L, d)) ) <= 1
    AND FOR ALL total T: value(T) == SUM(leaf penyusun T)      // tanpa double-count
    AND neracaBalanced(result)                                  // Aset == Kewajiban + Ekuitas
    AND signCorrect(d) AND outlineCorrect(d)                    // arah & outline LRA benar
    AND noSilentDrop(d)                                         // unmapped ditandai, bukan hilang

  // (Setup) baseline Juni tanpa delta == (2)
  baselineOK :=
    FOR ALL line L in {LRA Beban Operasional, Laba Rugi, Neraca, Arus Kas}:
        ABS(value(L, noDelta) - officialExcelValue('2026-06', L)) <= 1

  layoutOK :=
    FOR ALL report R with renderedTableWidth(R) > viewportWidth:
        horizontalScrollAvailable(R) == true

  RETURN deltaOK AND baselineOK AND layoutOK
END FUNCTION

FOR ALL input WHERE isBugCondition(input) DO
  result := renderReportsFixed(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Memverifikasi bahwa untuk semua input yang TIDAK memenuhi bug condition, fungsi yang diperbaiki menghasilkan hasil yang sama dengan fungsi semula (termasuk: tanpa delta relevan, overlay tidak menggeser apa pun).

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT renderReportsOriginal(input) == renderReportsFixed(input)
END FOR
```

**Testing Approach**: Property-based testing direkomendasikan untuk preservation checking karena:
- Menghasilkan banyak kasus uji otomatis di seluruh domain (periode Jan–Mei, beragam baris/akun, beragam lebar viewport).
- Menangkap edge case yang mungkin terlewat oleh unit test manual.
- Memberi jaminan kuat bahwa perilaku tidak berubah untuk seluruh input non-bug.

**Test Plan**: Amati perilaku pada kode/data **sebelum** perbaikan untuk bulan Jan–Mei, untuk Juni tanpa delta, dan untuk aksi cetak/ekspor + scroll vertikal; lalu tulis property-based test yang menangkap perilaku tersebut dan pastikan tetap sama setelah perbaikan.

**Test Cases**:
1. **Bulan lain tidak berubah**: Untuk setiap periode Januari–Mei, nilai `report_*` dan render laporan sama persis sebelum vs sesudah perbaikan (termasuk perbaikan overlay delta).
2. **Juni tanpa delta = `(2)`**: Tanpa jurnal `JV-`/`JRN-`, seluruh laporan Juni sama dengan `(2)`.
3. **Tanpa delta relevan, overlay diam**: Untuk baris/akun yang tidak disentuh jurnal, nilai tidak bergeser oleh perbaikan overlay.
4. **Cetak/Ekspor**: Hasil `printReport`/`exportLabaRugi`/`exportNeraca`/`exportArusKas`/`exportFullReport` tetap berfungsi dan memuat seluruh kolom.
5. **Scroll vertikal & laporan sempit**: Scroll vertikal halaman tetap berfungsi; laporan yang muat di viewport tidak memunculkan scrollbar horizontal.

### Unit Tests

- Resolusi atribusi delta: helper kode-COA→label (alias) mengembalikan label baris Excel yang benar untuk akun yang relevan; `isDebitNormal(code)` benar untuk seluruh kelas akun (termasuk `9x`).
- Pemetaan LRA: `resolveOutline`/`resolveOperasionalOutline` untuk kode akun (termasuk induk `62010`) mengembalikan outline yang benar dan **tidak** jatuh ke `1.1.1`.
- Parser snapshot: `parseNeraca`/`parseArusKas`/`parseLabaRugi`/`parseBebanOperasional` terhadap sheet `(2)` menghasilkan total yang sama dengan `(2)`.
- `loadLraToAnggaran` untuk `bebanOperasional` menulis baris `ANG-bebanOperasional-<outline>` bulan 6 sehingga `hasAuditedForCategory` menjadi true.
- Keseimbangan Neraca dan konsistensi total (JUMLAH == Σ leaf) pada hasil snapshot `(2)` dan setelah overlay delta.

### Property-Based Tests

- **(Utama)** Untuk jurnal `JV-` acak di Juni di atas baseline benar, untuk himpunan baris acak pada keempat laporan: `ABS(renderValue(L) − (baseline(L) + correctlyAttributedDelta(L))) <= 1`, `total == Σ leaf` (tanpa double-count), Neraca seimbang, tanda & outline benar, dan unmapped ditandai (Property 1).
- Untuk periode acak Jan–Mei dan baris acak: nilai sebelum == sesudah perbaikan; dan tanpa delta relevan, overlay tidak menggeser baris (Property 2).
- Untuk lebar viewport & jumlah kolom acak: `renderedWidth > viewport ⇒ horizontalScrollAvailable` dan `renderedWidth <= viewport ⇒ tidak ada scrollbar horizontal` (Property 3 & 4).

### Integration Tests

- **Alur tanpa re-baseline (utama)**: dari baseline `(2)` Juni, tambah satu/beberapa jurnal `JV-` → buka Laba Rugi/Neraca/Arus Kas/LRA → hanya baris + seluruh induk terkait yang bergeser tepat sebesar delta (setara Excel), Neraca seimbang, total = Σ leaf; **tidak** perlu memuat Excel baru.
- **Alur setup**: muat snapshot `(2)` untuk Juni (sekali) → seluruh nilai tanpa delta cocok `(2)` (≤ Rp 1).
- **Akun unmapped**: tambah jurnal pada akun tanpa pemetaan → indikator "unmapped" muncul; total tetap seimbang (tidak hilang diam-diam).
- **Tata letak**: render laporan lebar dan dua laporan berdampingan → scroll horizontal tersedia; lalu Cetak Laporan & Unduh Excel → seluruh kolom termuat; scroll vertikal tetap berfungsi.
- **Regresi lintas bulan**: berpindah antar Januari–Mei dan Juni tidak mengubah angka bulan teraudit lain.
