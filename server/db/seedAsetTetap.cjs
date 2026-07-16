/**
 * Seed the Aset Tetap register (assets table) from the division's
 * DAFTAR AKTIVA TETAP sheet — the audited-2025 rebased register shipped in the
 * June full bundle (rapat lanjutan ke-12, 16-07-2026; docs/MAPPING_INVESTASI_JULI_2026.md §3).
 *
 * Section layout of the sheet (I. TANAH … VI. INSTALASI LISTRIK) differs from
 * the April file the old seedActualData.cjs #34 importer knew (it had no MESIN
 * or INSTALASI LISTRIK sections), so this is the canonical register importer.
 *
 * Usage:
 *   node server/db/seedAsetTetap.cjs [--file <xlsx>] [--dry-run] [--keep]
 *     --file     workbook containing "DAFTAR AKTIVA TETAP"
 *                (default: src/FILES/LAMPIRAN LAPORAN KEUANGAN JUNI 2026.xlsx)
 *     --dry-run  parse + reconciliation report only, no DB writes
 *     --keep     upsert on top of existing rows instead of replacing the
 *                register (default REPLACES the assets table — old AT-### ids
 *                from earlier seeds would otherwise linger as duplicates)
 *   DB_PATH=<file> targets another database, same convention as the server.
 */
const path = require('path');
const XLSX = require('xlsx');

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, dflt) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };

const FILE = opt('--file', path.join(__dirname, '..', '..', 'src', 'FILES', 'LAMPIRAN LAPORAN KEUANGAN JUNI 2026.xlsx'));
const DRY = flag('--dry-run');
const KEEP = flag('--keep');

// Section header (col A) → kategori + deterministic kode prefix. The register
// keys assets by section + running number, so re-runs stay idempotent.
const SECTIONS = [
  [/^I\.\s*TANAH/i, 'Tanah', 'TANAH'],
  [/^II\.\s*BANGUNAN/i, 'Bangunan', 'BANGUNAN'],
  [/^III\.\s*MESIN/i, 'Mesin', 'MESIN'],
  [/^IV\.\s*PERALATAN/i, 'Peralatan', 'PERALATAN'],
  [/^V\.\s*KENDARAAN/i, 'Kendaraan', 'KENDARAAN'],
  [/^VI\.\s*INSTALASI/i, 'Instalasi Listrik', 'LISTRIK'],
];

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function toIsoDate(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && v > 20000) return new Date(EXCEL_EPOCH + v * 86400000).toISOString().slice(0, 10);
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return String(v);
}

function umurManfaat(rate) {
  if (!rate) return '';
  if (Math.abs(rate - 0.05) < 0.005) return '20 tahun';
  if (Math.abs(rate - 0.25) < 0.005) return '4 tahun';
  if (rate > 0.11 && rate < 0.14) return '8 tahun';
  return `${Math.round(100 / (rate * 100))} tahun`;
}

function parseRegister(file) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets['DAFTAR AKTIVA TETAP'];
  if (!ws) throw new Error('Sheet "DAFTAR AKTIVA TETAP" tidak ditemukan di ' + file);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const n = (v) => Number(v) || 0;

  const assets = [];
  let current = null; // [kategori, prefix]
  let jumlahAsetSheet = null;
  for (const r of rows) {
    if (!r) continue;
    const a = r[0], name = String(r[1] || '').trim();
    const aStr = String(a || '').trim();
    const sec = SECTIONS.find(([re]) => re.test(aStr));
    if (sec) { current = [sec[1], sec[2]]; continue; }
    if (String(r[2] || '').trim() === 'JUMLAH ASET') { jumlahAsetSheet = n(r[4]); continue; }
    if (!current) continue;
    const no = Number(a);
    if (!Number.isFinite(no) || no <= 0 || !name) continue; // totals / marker rows
    const [kategori, prefix] = current;
    assets.push({
      kode: `AT-${prefix}-${String(no).padStart(2, '0')}`,
      nama: name,
      detail: r[2] != null ? String(r[2]).trim() : '',
      kategori,
      tgl_perolehan: toIsoDate(r[3]),
      nilai_perolehan: n(r[4]),
      penyusutan_per_tahun: n(r[6]),
      penyusutan_per_bulan: n(r[7]),
      beban_penyusutan_2025: n(r[8]),
      nilai_penyusutan: n(r[9]),          // akumulasi penyusutan 2025 (audited)
      nilai_buku: n(r[10]),               // nilai buku 2025 (audited)
      beban_penyusutan_maret_2026: n(r[11]),
      akum_penyusutan_maret_2026: n(r[12]),
      nilai_buku_maret_2026: n(r[13]),
      umur_manfaat: umurManfaat(n(r[5])),
      // KIB notes only exist on the TANAH block (first free-text cell right of
      // the value columns); other sections carry the "Penambahan 2026" side
      // table in those columns — never ingest it.
      keterangan: kategori === 'Tanah'
        ? String(r.slice(14).find(v => typeof v === 'string' && v.trim()) || '').trim()
        : '',
    });
  }
  return { assets, jumlahAsetSheet };
}

function report(assets, jumlahAsetSheet) {
  const perKat = new Map();
  for (const a of assets) {
    const k = perKat.get(a.kategori) || { count: 0, perolehan: 0, akum2025: 0 };
    k.count++; k.perolehan += a.nilai_perolehan; k.akum2025 += a.nilai_penyusutan;
    perKat.set(a.kategori, k);
  }
  let tot = 0;
  console.log('\nRegister per kategori (perolehan / akumulasi 2025 audited):');
  for (const [k, v] of perKat) {
    tot += v.perolehan;
    console.log(`  ${k.padEnd(18)} ${String(v.count).padStart(3)} baris  ${v.perolehan.toLocaleString('id-ID').padStart(20)}  /  ${Math.round(v.akum2025).toLocaleString('id-ID')}`);
  }
  console.log(`  ${'TOTAL'.padEnd(18)} ${String(assets.length).padStart(3)} baris  ${tot.toLocaleString('id-ID').padStart(20)}`);
  if (jumlahAsetSheet != null) {
    const drift = tot - jumlahAsetSheet;
    if (Math.abs(drift) > 0.5) {
      console.log(`  ⚠️ Baris JUMLAH ASET di sheet = ${jumlahAsetSheet.toLocaleString('id-ID')} (selisih ${drift.toLocaleString('id-ID')})`);
      console.log('     Formula baris-total sheet tidak selalu = penjumlahan baris rinciannya (pola yang sama didokumentasikan');
      console.log('     di docs/EXCEL_FLAWS_JUNI_2026.md); baris rincian per aset adalah sumber kebenaran yang dimuat.');
    } else {
      console.log(`  ✅ Cocok dengan baris JUMLAH ASET sheet (${jumlahAsetSheet.toLocaleString('id-ID')})`);
    }
  }
}

async function main() {
  console.log('📋 Membaca register:', FILE);
  const { assets, jumlahAsetSheet } = parseRegister(FILE);
  if (!assets.length) throw new Error('Tidak ada baris aset yang terbaca — cek format sheet');
  report(assets, jumlahAsetSheet);

  if (DRY) { console.log('\n--dry-run: tidak ada perubahan database.'); return; }

  const db = require('./database.cjs');
  const { initDatabase } = require('./schema.cjs');
  await initDatabase();
  const run = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (e) { e ? reject(e) : resolve(this.changes || 0); }));

  await run('BEGIN TRANSACTION');
  try {
    if (!KEEP) {
      const removed = await run('DELETE FROM assets');
      console.log(`\n🗑  ${removed} baris register lama dihapus (pakai --keep untuk upsert tanpa hapus)`);
    }
    for (const a of assets) {
      await run(
        `INSERT OR REPLACE INTO assets (kode, nama, detail, kategori, tgl_perolehan, nilai_perolehan,
           penyusutan_per_tahun, penyusutan_per_bulan, beban_penyusutan_2025, nilai_penyusutan, nilai_buku,
           beban_penyusutan_maret_2026, akum_penyusutan_maret_2026, nilai_buku_maret_2026, umur_manfaat, keterangan)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [a.kode, a.nama, a.detail, a.kategori, a.tgl_perolehan, a.nilai_perolehan,
         a.penyusutan_per_tahun, a.penyusutan_per_bulan, a.beban_penyusutan_2025, a.nilai_penyusutan, a.nilai_buku,
         a.beban_penyusutan_maret_2026, a.akum_penyusutan_maret_2026, a.nilai_buku_maret_2026, a.umur_manfaat, a.keterangan]);
    }
    await run('COMMIT');
  } catch (e) {
    await run('ROLLBACK').catch(() => {});
    throw e;
  }
  console.log(`✅ ${assets.length} baris aset tetap dimuat ke tabel assets`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error('❌', e.message); process.exit(1); });
}
module.exports = { parseRegister };
