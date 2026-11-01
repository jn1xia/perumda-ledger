// CalkReports.jsx
// Catatan atas Laporan Keuangan and Laporan Perubahan Ekuitas, in two views:
//  • 'periode' — the selected 2026 period beside 31 Desember 2025 (Audited),
//    figures from the Neraca / Laba Rugi the Laporan page shows (src/utils/calk.js);
//  • 'audit'   — the audited 2025 notes as printed by the auditor.
import { Printer, Download } from 'lucide-react'
import { formatRupiah } from '../../data/sampleData.js'
import { printReport, exportReportDoc, exportReportTable, reportTableOf } from '../../utils/exportUtils.js'
import { CALK_NARASI_2025 } from '../../data/calkNarasi2025.js'
import { AUDIT_2025, CATATAN_2025, LABA_RUGI_2025 } from '../../data/laporanAudit2025.js'
import { labaRugiSections } from '../../utils/calk.js'

const headerBtn = { color: 'white', borderColor: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 8 }
const h3Style = { color: 'var(--primary)', margin: '24px 0 10px', fontSize: 15, borderBottom: '2px solid var(--primary)', paddingBottom: 6 }
const h4Style = { fontSize: 14, margin: '14px 0 6px' }
const pStyle = { color: 'var(--text-secondary)', lineHeight: 1.65, margin: '6px 0', fontSize: 13 }
const noteStyle = { ...pStyle, fontSize: 12, fontStyle: 'italic' }

// Figures: "-" for none or zero, as the audited report prints them.
const money = (v) => (v == null ? '—' : v === 0 ? '-' : formatRupiah(v))
function Num({ v, bold, muted }) {
  return (
    <td className="text-right mono" data-v={typeof v === 'number' ? v : ''}
      style={{ fontWeight: bold ? 700 : 400, color: typeof v === 'number' && v < 0 ? 'var(--danger)' : muted ? 'var(--text-muted)' : undefined, whiteSpace: 'nowrap' }}>
      {money(v)}
    </td>
  )
}
const totalRow = { fontWeight: 700, borderTop: '2px solid var(--border)', background: 'var(--border-light)' }

function ViewSwitch({ mode, onMode, periodLabel }) {
  const btn = (m, text) => (
    <button key={m} className={`btn btn-sm ${mode === m ? 'btn-primary' : 'btn-outline'}`} onClick={() => onMode(m)}>{text}</button>
  )
  return (
    <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Tampilan:</span>
      {btn('periode', `${periodLabel} + pembanding 2025 (Audited)`)}
      {btn('audit', 'Laporan Audit 2025')}
    </div>
  )
}

// ── Narrative blocks (notes 1–3) ──────────────────────────────────────────────
const OL_TYPE = { '1': '1', a: 'a', i: 'i' }
function Narasi({ blocks, mode, akhir }) {
  const fill = (t) => String(t).replace(/\{akhir\}/g, akhir)
  return blocks.filter(b => !b.only || b.only === mode).map((b, i) => {
    if (b.h) return <h3 key={i} style={h3Style}>{b.h}</h3>
    if (b.h2) return <h4 key={i} style={h4Style}>{b.h2}</h4>
    if (b.sub) return <p key={i} style={{ ...pStyle, fontWeight: 600, color: 'var(--text)' }}>{b.sub}</p>
    if (b.p) return <p key={i} style={b.only ? noteStyle : pStyle}>{fill(b.p)}</p>
    if (b.ol) return (
      <ol key={i} type={OL_TYPE[b.style] || '1'} style={{ ...pStyle, paddingLeft: 26 }}>
        {b.ol.map((t, k) => <li key={k} style={{ margin: '3px 0' }}>{fill(t)}</li>)}
      </ol>
    )
    if (b.kv) return (
      <table key={i} style={{ fontSize: 13, margin: '6px 0 10px', maxWidth: 720 }}>
        <tbody>{b.kv.map(([k, v], j) => <tr key={j}><td style={{ width: 300, color: 'var(--text-secondary)' }}>{k}</td><td>: {v}</td></tr>)}</tbody>
      </table>
    )
    if (b.tbl) return (
      <table key={i} style={{ fontSize: 13, margin: '6px 0 10px', maxWidth: 560 }}>
        <thead><tr>{b.tbl.head.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{b.tbl.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
      </table>
    )
    return null
  })
}

// ── Notes with figures: the period beside 2025 ────────────────────────────────
function CompareTable({ note, curHead, prevHead }) {
  return (
    <table style={{ fontSize: 13 }}>
      <thead><tr><th>Uraian</th><th className="text-right" style={{ width: 210 }}>{curHead}</th><th className="text-right" style={{ width: 210 }}>{prevHead}</th></tr></thead>
      <tbody>
        {note.rows.map((r, i) => <tr key={i}><td style={{ paddingLeft: 20 }}>{r.label}</td><Num v={r.cur} /><Num v={r.prev} muted /></tr>)}
        <tr style={totalRow}><td>{note.total.label}</td><Num v={note.total.cur} bold /><Num v={note.total.prev} bold /></tr>
      </tbody>
    </table>
  )
}

function AsetTetapTable({ note, endHead }) {
  const line = (r, i, indent = 20) => (
    <tr key={i}><td style={{ paddingLeft: indent }}>{r.label}</td><Num v={r.prev} muted /><Num v={r.mutasi} /><Num v={r.cur} /></tr>
  )
  const sub = (t) => <tr style={{ fontWeight: 600, borderTop: '1px solid var(--border)' }}><td>{t.label}</td><Num v={t.prev} bold /><Num v={t.mutasi} bold /><Num v={t.cur} bold /></tr>
  return (
    <table style={{ fontSize: 13 }}>
      <thead><tr><th>Kelompok</th><th className="text-right" style={{ width: 200 }}>{AUDIT_2025.kolom}</th><th className="text-right" style={{ width: 180 }}>Mutasi</th><th className="text-right" style={{ width: 200 }}>{endHead}</th></tr></thead>
      <tbody>
        <tr><td colSpan={4} style={{ fontWeight: 700 }}>NILAI PEROLEHAN</td></tr>
        {note.perolehan.map((r, i) => line(r, `p${i}`))}
        {sub(note.totalPerolehan)}
        <tr><td colSpan={4} style={{ fontWeight: 700 }}>AKUMULASI PENYUSUTAN DAN AMORTISASI</td></tr>
        {note.akumulasi.map((r, i) => line(r, `a${i}`))}
        {sub(note.totalAkumulasi)}
        <tr style={totalRow}><td>{note.total.label}</td><Num v={note.total.prev} bold /><Num v={note.total.mutasi} bold /><Num v={note.total.cur} bold /></tr>
      </tbody>
    </table>
  )
}

function LainLainTable({ note, curHead, prevHead }) {
  const block = (sub, title) => (
    <>
      <tr><td colSpan={3} style={{ fontWeight: 700 }}>{title}</td></tr>
      {sub.rows.map((r, i) => <tr key={`${title}${i}`}><td style={{ paddingLeft: 20 }}>{r.label}</td><Num v={r.cur} /><Num v={r.prev} muted /></tr>)}
      <tr style={{ fontWeight: 600, borderTop: '1px solid var(--border)' }}><td>{sub.total.label}</td><Num v={sub.total.cur} bold /><Num v={sub.total.prev} bold /></tr>
    </>
  )
  return (
    <table style={{ fontSize: 13 }}>
      <thead><tr><th>Uraian</th><th className="text-right" style={{ width: 210 }}>{curHead}</th><th className="text-right" style={{ width: 210 }}>{prevHead}</th></tr></thead>
      <tbody>
        {block(note.pendapatan, 'Pendapatan lain-lain:')}
        {block(note.beban, 'Beban lain-lain:')}
        <tr style={totalRow}><td>{note.total.label}</td><Num v={note.total.cur} bold /><Num v={note.total.prev} bold /></tr>
      </tbody>
    </table>
  )
}

function PeriodNotes({ notes, endHead, flowHead }) {
  return notes.map(note => (
    <div key={note.id} style={{ marginBottom: 18 }}>
      <h3 style={h3Style}>{note.no}. {note.title}</h3>
      {note.kind === 'asetTetap' ? <AsetTetapTable note={note} endHead={endHead} />
        : note.kind === 'lainLain' ? <LainLainTable note={note} curHead={flowHead} prevHead={AUDIT_2025.kolomArus} />
          : note.kind === 'labaRugi' ? <CompareTable note={note} curHead={flowHead} prevHead={AUDIT_2025.kolomArus} />
            : <CompareTable note={note} curHead={endHead} prevHead={AUDIT_2025.kolom} />}
      {note.id === 'asetTetap' && <p style={noteStyle}>Mutasi = saldo akhir periode dikurangi saldo 31 Desember 2025. Rincian penambahan per aset ada di modul Aset Tetap dan lampiran Daftar Aset Tetap di bawah.</p>}
    </div>
  ))
}

// ── The audited 2025 notes as printed ─────────────────────────────────────────
function SingleTable({ rows, total, head = AUDIT_2025.kolom }) {
  return (
    <table style={{ fontSize: 13 }}>
      <thead><tr><th>Uraian</th><th className="text-right" style={{ width: 220 }}>{head}</th></tr></thead>
      <tbody>
        {rows.map((r, i) => r.grup
          ? <tr key={i}><td colSpan={2} style={{ fontWeight: 600 }}>{r.grup}</td></tr>
          : <tr key={i} style={r.sub ? { fontWeight: 600 } : undefined}><td style={{ paddingLeft: r.sub ? 12 : r.indent ? 36 : 20 }}>{r.label}</td><Num v={r.value} bold={r.sub} /></tr>)}
        {total && <tr style={totalRow}><td>{total.label}</td><Num v={total.value} bold /></tr>}
      </tbody>
    </table>
  )
}

// The auditor lists expenses largest first, "… lainnya" / "… lain-lain" last.
const byAmountOtherLast = (rows) => [...rows].sort((a, b) => {
  const oa = /lain(nya|-lain)$/i.test(a.label), ob = /lain(nya|-lain)$/i.test(b.label)
  return oa !== ob ? (oa ? 1 : -1) : (b.value || 0) - (a.value || 0)
})

function AuditNotes() {
  const c = CATATAN_2025
  const lr = labaRugiSections(LABA_RUGI_2025.map(([label, value]) => ({ label, value })))
  const kasRows = []
  let lastGrup = null
  c.kas.rincian.forEach(r => { if (r.grup !== lastGrup) { kasRows.push({ grup: r.grup }); lastGrup = r.grup } kasRows.push({ label: r.label, value: r.value, indent: true }) })
  const at = c.asetTetap
  const mutasiTable = (title, rows, total) => (
    <>
      <tr><td colSpan={6} style={{ fontWeight: 700 }}>{title}</td></tr>
      {rows.map((r, i) => <tr key={`${title}${i}`}><td style={{ paddingLeft: 20 }}>{r[0]}</td>{r.slice(1).map((v, k) => <Num key={k} v={v} />)}</tr>)}
      <tr style={{ fontWeight: 600, borderTop: '1px solid var(--border)' }}><td>{total}</td>{[1, 2, 3, 4, 5].map(k => <Num key={k} v={rows.reduce((s, r) => s + r[k], 0)} bold />)}</tr>
    </>
  )
  const P = ({ t }) => <p style={pStyle}>{t}</p>
  return (
    <>
      <h3 style={h3Style}>4. KAS DAN SETARA KAS</h3>
      <SingleTable rows={kasRows} total={{ label: 'Jumlah Kas dan Setara', value: c.kas.jumlah }} />
      {c.kas.keterangan.map((t, i) => <P key={i} t={t} />)}

      <h3 style={h3Style}>5. PIUTANG USAHA</h3>
      <SingleTable rows={[{ grup: 'Piutang usaha' }, ...c.piutang.rincian.map(r => ({ ...r, indent: true }))]} total={{ label: 'Jumlah Piutang Usaha', value: c.piutang.jumlah }} />
      <p style={pStyle}>Piutang usaha per 31 Desember 2025 berdasarkan umur sebagai berikut:</p>
      <table style={{ fontSize: 13, maxWidth: 560 }}>
        <thead><tr><th>Umur</th><th className="text-right">Rp.</th><th className="text-right">%</th></tr></thead>
        <tbody>
          {c.piutang.umur.map((u, i) => <tr key={i}><td>{u[0]}</td><Num v={u[1]} /><td className="text-right">{u[2]}</td></tr>)}
          <tr style={totalRow}><td>Jumlah</td><Num v={c.piutang.jumlah} bold /><td className="text-right">100,00%</td></tr>
        </tbody>
      </table>
      {c.piutang.keterangan.map((t, i) => <P key={i} t={t} />)}

      <h3 style={h3Style}>6. PERSEDIAAN</h3>
      <SingleTable rows={c.persediaan.rincian} total={{ label: 'Jumlah Persediaan', value: c.persediaan.jumlah }} />

      <h3 style={h3Style}>7. BIAYA DIBAYAR DIMUKA</h3>
      <SingleTable rows={c.biayaDibayarDimuka.rincian} total={{ label: 'Jumlah Biaya Dibayar Dimuka', value: c.biayaDibayarDimuka.jumlah }} />
      {c.biayaDibayarDimuka.keterangan.map((t, i) => <P key={i} t={t} />)}

      <h3 style={h3Style}>8. ASET TETAP</h3>
      <p style={pStyle}>Rincian aset tetap 31 Desember 2025 terdiri dari:</p>
      <table style={{ fontSize: 12.5 }}>
        <thead><tr><th>Kelompok</th><th className="text-right">Saldo awal</th><th className="text-right">Penambahan</th><th className="text-right">Pengurangan</th><th className="text-right">Penyesuaian</th><th className="text-right">Saldo akhir</th></tr></thead>
        <tbody>
          {mutasiTable('NILAI PEROLEHAN', at.perolehan, 'Sub jumlah')}
          {mutasiTable('AKUMULASI PENYUSUTAN', at.akumulasi, 'Jumlah')}
          <tr style={totalRow}><td>Nilai Tercatat</td><Num v={at.nilaiTercatatAwal} bold /><td /><td /><td /><Num v={at.nilaiTercatat} bold /></tr>
        </tbody>
      </table>
      {at.keterangan.slice(0, 1).map((t, i) => <P key={i} t={t} />)}
      {at.penambahan.map(g => (
        <div key={g.kelompok}>
          <p style={{ ...pStyle, fontWeight: 600 }}>*Penambahan {g.kelompok.toLowerCase()} sejumlah {formatRupiah(g.jumlah)} terdiri dari:</p>
          <table style={{ fontSize: 12.5, maxWidth: 760 }}>
            <thead><tr><th style={{ width: 40 }}>No.</th><th>Keterangan</th><th>Tanggal Perolehan</th><th className="text-right">Nilai (Rp)</th></tr></thead>
            <tbody>
              {g.rows.map((r, i) => <tr key={i}><td>{i + 1}.</td><td>{r[0]}</td><td>{r[1]}</td><Num v={r[2]} /></tr>)}
              <tr style={totalRow}><td /><td>Jumlah</td><td /><Num v={g.jumlah} bold /></tr>
            </tbody>
          </table>
        </div>
      ))}
      {at.keterangan.slice(1).map((t, i) => <P key={i} t={t} />)}
      <p style={pStyle}>Beban penyusutan dialokasikan sebagai berikut:</p>
      <SingleTable rows={at.penyusutan.map(([label, value]) => ({ label, value }))} total={{ label: 'Jumlah', value: at.penyusutan.reduce((s, r) => s + r[1], 0) }} head="2025" />

      <h3 style={h3Style}>10. MODAL SAHAM</h3>
      {c.modal.keterangan.map((t, i) => <P key={i} t={t} />)}
      <table style={{ fontSize: 13 }}>
        <thead><tr><th>Nama Barang</th><th>Lokasi</th><th className="text-right">Luas (M2)</th><th className="text-right">Nilai Nominal</th></tr></thead>
        <tbody>
          {c.modal.penyertaan.map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1]}</td><td className="text-right">{r[2]}</td><Num v={r[3]} /></tr>)}
          <tr style={totalRow}><td colSpan={3}>Jumlah</td><Num v={c.modal.penyertaanJumlah} bold /></tr>
        </tbody>
      </table>
      <p style={pStyle}>Tambahan modal belum disahkan:</p>
      <SingleTable rows={c.modal.tambahan.map(([label, value]) => ({ label, value }))} total={{ label: 'Jumlah', value: c.modal.tambahanJumlah }} head="2025" />

      <h3 style={h3Style}>11. PENDAPATAN</h3>
      <table style={{ fontSize: 13 }}>
        <thead><tr><th>Uraian</th><th className="text-right" style={{ width: 220 }}>{AUDIT_2025.kolom}</th></tr></thead>
        <tbody>
          {c.pendapatan.grup.map(g => [
            <tr key={g.label}><td style={{ fontWeight: 600 }}>- {g.label}</td><td /></tr>,
            ...g.rows.map((r, i) => <tr key={`${g.label}${i}`}><td style={{ paddingLeft: 36 }}>{r[0]}</td><Num v={r[1]} /></tr>),
            <tr key={`${g.label}-sub`} style={{ fontWeight: 600 }}><td style={{ paddingLeft: 20 }}>Sub jumlah</td><Num v={g.jumlah} bold /></tr>,
          ])}
          <tr style={totalRow}><td>Jumlah Pendapatan</td><Num v={c.pendapatan.jumlah} bold /></tr>
        </tbody>
      </table>
      <p style={{ ...pStyle, fontWeight: 600 }}>* Surat perjanjian kerja sama parkir Perusahaan Umum Daerah Pasar Baiman</p>
      <table style={{ fontSize: 12.5 }}>
        <thead><tr><th style={{ width: 40 }}>No.</th><th>Nama Petugas Parkir</th><th>No. SPK</th><th>Tanggal SPK</th><th className="text-right">Nominal Distribusi Per Bulan</th><th>Jangka Waktu</th></tr></thead>
        <tbody>
          {c.pendapatan.parkir.map((r, i) => <tr key={i}><td>{i + 1}.</td><td>{r[0]}</td><td className="mono">{r[1]}</td><td>{r[2]}</td><Num v={r[3]} /><td>{c.pendapatan.parkirJangka}</td></tr>)}
          <tr style={totalRow}><td /><td colSpan={3}>TOTAL</td><Num v={c.pendapatan.parkirJumlah} bold /><td /></tr>
        </tbody>
      </table>

      <h3 style={h3Style}>12. BEBAN POKOK PENJUALAN</h3>
      <SingleTable rows={c.bebanPokok.rincian.map(([label, value]) => ({ label, value }))} total={{ label: 'Jumlah Beban Pokok Penjualan', value: c.bebanPokok.jumlah }} />

      <h3 style={h3Style}>13. BEBAN UMUM DAN ADMINISTRASI</h3>
      <SingleTable rows={byAmountOtherLast(lr.bebanUmum.rows)} total={{ label: 'Jumlah Beban Umum dan Administrasi', value: lr.bebanUmum.total }} />
      {c.bebanUmum.keterangan.map((t, i) => <P key={i} t={t} />)}

      <h3 style={h3Style}>14. BEBAN OPERASIONAL DAN BISNIS</h3>
      <SingleTable rows={byAmountOtherLast(lr.bebanOperasional.rows.filter(r => r.value))} total={{ label: 'Jumlah Beban Operasional', value: lr.bebanOperasional.total }} />

      <h3 style={h3Style}>15. PENDAPATAN (BEBAN) LAIN-LAIN</h3>
      <SingleTable
        rows={[{ grup: 'Pendapatan lain-lain:' }, ...lr.pendapatanLain.rows, { label: 'Sub jumlah', value: lr.pendapatanLain.total, sub: true },
          { grup: 'Beban lain-lain:' }, ...byAmountOtherLast(lr.bebanLain.rows), { label: 'Sub jumlah', value: lr.bebanLain.total, sub: true }]}
        total={{ label: 'Jumlah', value: lr.pendapatanLain.total - lr.bebanLain.total }} />

      <h3 style={h3Style}>16. TANGGAL PENYELESAIAN LAPORAN KEUANGAN</h3>
      <P t={`Direksi dan Dewan Komisaris bertanggung jawab atas penyajian dan pengungkapan laporan keuangan untuk tahun yang berakhir 31 Desember 2025 yang diselesaikan pada tanggal ${AUDIT_2025.tanggalPenyelesaian}.`} />
    </>
  )
}

// Daftar aset tetap from the Aset Tetap module (snake_case fields, as the API
// returns them — the old CALK read camelCase names and showed Rp 0,00).
function DaftarAsetTetap({ assets }) {
  const groups = {}
  for (const a of assets || []) (groups[a.kategori || 'Lainnya'] = groups[a.kategori || 'Lainnya'] || []).push(a)
  const perolehan = (a) => Number(a.nilai_perolehan) || 0
  const akum = (a) => Number(a.nilai_penyusutan) || 0
  const buku = (a) => (a.nilai_buku != null ? Number(a.nilai_buku) : perolehan(a) - akum(a))
  const totals = (list) => [list.reduce((s, a) => s + perolehan(a), 0), list.reduce((s, a) => s + akum(a), 0), list.reduce((s, a) => s + buku(a), 0)]
  const all = Object.values(groups).flat()
  if (!all.length) return <p style={noteStyle}>Modul Aset Tetap belum berisi aset.</p>
  return (
    <table style={{ fontSize: 12.5 }}>
      <thead><tr><th>Kode</th><th>Nama Aset</th><th>Tgl Perolehan</th><th className="text-right">Nilai Perolehan</th><th className="text-right">Akum. Penyusutan</th><th className="text-right">Nilai Buku</th></tr></thead>
      <tbody>
        {Object.entries(groups).map(([kat, list]) => {
          const [p, a, b] = totals(list)
          return [
            <tr key={kat} style={{ background: 'var(--bg-secondary)' }}><td colSpan={6} style={{ fontWeight: 700 }}>{kat}</td></tr>,
            ...list.map(x => <tr key={x.kode}><td className="mono">{x.kode}</td><td>{x.nama}</td><td>{x.tgl_perolehan || ''}</td><Num v={perolehan(x)} /><Num v={-akum(x)} /><Num v={buku(x)} /></tr>),
            <tr key={`${kat}-t`} style={{ fontWeight: 600 }}><td colSpan={3} style={{ paddingLeft: 20 }}>Jumlah {kat}</td><Num v={p} bold /><Num v={-a} bold /><Num v={b} bold /></tr>,
          ]
        })}
        {(() => { const [p, a, b] = totals(all); return <tr style={totalRow}><td colSpan={3}>JUMLAH ASET TETAP</td><Num v={p} bold /><Num v={-a} bold /><Num v={b} bold /></tr> })()}
      </tbody>
    </table>
  )
}

/**
 * The CALK tab. `notes` from buildCalkNotes; `available` says whether the
 * period has Neraca / Laba Rugi rows to show.
 */
export function CalkReport({ mode, onMode, notes, available, periodLabel, endText, assets }) {
  const audit = mode === 'audit'
  const akhir = audit ? AUDIT_2025.akhir : endText
  const subtitle = audit
    ? 'Untuk Tahun yang Berakhir pada Tanggal 31 Desember 2025 — Laporan Audit'
    : `Untuk Periode ${periodLabel} — dengan pembanding ${AUDIT_2025.kolom}`
  return (
    <div className="report-doc">
      <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div className="company">PERUSAHAAN UMUM DAERAH (PERUMDA) PASAR BAIMAN</div><h2>CATATAN ATAS LAPORAN KEUANGAN</h2><div className="period">{subtitle}</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" style={headerBtn} onClick={() => printReport(`CALK ${audit ? '2025 (Audited)' : periodLabel}`)}><Printer size={14} /> Cetak Laporan</button>
          <button className="btn btn-outline" style={headerBtn} onClick={(e) => exportReportDoc(e.currentTarget.closest('.report-doc').querySelector('.report-doc-body'), {
            filename: `CALK_${audit ? '2025_Audited' : periodLabel}`.replace(/\s+/g, '_'), sheetName: 'CALK',
            titleLines: ['PERUSAHAAN UMUM DAERAH (PERUMDA) PASAR BAIMAN', 'CATATAN ATAS LAPORAN KEUANGAN', subtitle],
          })}><Download size={14} /> Unduh Excel (.xlsx)</button>
        </div>
      </div>
      <div className="report-doc-body" style={{ fontSize: 14 }}>
        <ViewSwitch mode={mode} onMode={onMode} periodLabel={periodLabel} />
        {audit ? (
          <div style={{ background: 'var(--primary-light)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 8 }}>
            <p style={{ margin: 0 }}><strong>Laporan Auditor Independen:</strong> {AUDIT_2025.auditor}, {AUDIT_2025.tanggalLaporan}. Opini: <strong>{AUDIT_2025.opini}</strong>.</p>
            <p style={{ margin: '6px 0 2px' }}>Basis pengecualian:</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>{AUDIT_2025.pengecualian.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        ) : (
          <div className="no-print" style={{ background: available ? 'var(--primary-light)' : 'rgba(245,158,11,0.12)', padding: '10px 16px', borderRadius: 'var(--radius-sm)', fontSize: 12.5, marginBottom: 8 }}>
            {available
              ? <>Angka periode diambil otomatis dari Neraca dan Laba Rugi yang tampil untuk {periodLabel} (laporan resmi yang diunggah, atau lampiran bulanan + jurnal). Kolom 2025 dari laporan audit {AUDIT_2025.tanggalLaporan.replace('Surabaya, ', '')}.</>
              : <>Periode ini belum punya Neraca / Laba Rugi dari lampiran: kolom periode kosong (—). Kolom 2025 tetap dari laporan audit.</>}
          </div>
        )}

        <Narasi blocks={CALK_NARASI_2025} mode={audit ? 'audit' : 'periode'} akhir={akhir} />

        {audit ? <AuditNotes /> : (
          <>
            <PeriodNotes notes={notes} endHead={endText} flowHead={periodLabel} />
            <h3 style={h3Style}>16. TANGGAL PENYELESAIAN LAPORAN KEUANGAN</h3>
            <p style={pStyle}>Catatan ini disusun otomatis dari data aplikasi untuk periode yang berakhir {endText}. Tanggal penyelesaian laporan keuangan diisi saat laporan tahunan disahkan Direksi.</p>
            <h3 style={h3Style}>LAMPIRAN — DAFTAR ASET TETAP</h3>
            <DaftarAsetTetap assets={assets} />
          </>
        )}
      </div>
    </div>
  )
}

/** Laporan Perubahan Ekuitas: 2025 as audited, then the year so far. */
export function PerubahanEkuitasReport({ data, periodLabel, available }) {
  const { rows, check } = data
  const title = 'LAPORAN PERUBAHAN EKUITAS'
  return (
    <div className="report-doc">
      <div className="report-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div className="company">PERUSAHAAN UMUM DAERAH (PERUMDA) PASAR BAIMAN</div><h2>{title}</h2><div className="period">Untuk Periode {periodLabel} — dengan tahun 2025 (Audited)</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" style={headerBtn} onClick={() => printReport(`Perubahan Ekuitas ${periodLabel}`)}><Printer size={14} /> Cetak Laporan</button>
          <button className="btn btn-outline" style={headerBtn} onClick={(e) => exportReportTable(reportTableOf(e), {
            filename: `Perubahan_Ekuitas_${periodLabel}`.replace(/\s+/g, '_'), sheetName: 'Perubahan Ekuitas',
            titleLines: ['PERUSAHAAN UMUM DAERAH (PERUMDA) PASAR BAIMAN', title, `Untuk Periode ${periodLabel}`],
          })}><Download size={14} /> Unduh Excel (.xlsx)</button>
        </div>
      </div>
      <div className="report-doc-body">
        <table>
          <thead><tr><th>Keterangan</th><th className="text-right">Modal Saham</th><th className="text-right">Tambahan Modal Disetor</th><th className="text-right">Saldo Laba</th><th className="text-right">Jumlah Ekuitas</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={r.kind === 'saldo' ? { fontWeight: 700, background: 'var(--border-light)' } : undefined}>
                <td style={{ paddingLeft: r.kind === 'saldo' ? 12 : 28 }}>{r.label}</td>
                <Num v={r.modal} bold={r.kind === 'saldo'} /><Num v={r.disetor} bold={r.kind === 'saldo'} />
                <Num v={r.saldoLaba} bold={r.kind === 'saldo'} /><Num v={r.jumlah} bold={r.kind === 'saldo'} />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="no-print" style={{ fontSize: 12, marginTop: 10, color: 'var(--text-muted)' }}>
          {!available && 'Periode ini belum punya Neraca dari lampiran: baris 2026 dihitung dari saldo akun ekuitas dan laba rugi jurnal. '}
          {check && (Math.abs(check.selisih) < 1
            ? <span style={{ color: 'var(--success)' }}>✓ Saldo akhir sama dengan Jumlah Ekuitas di Neraca ({formatRupiah(check.neraca)}).</span>
            : <span style={{ color: 'var(--danger)' }}>✗ Selisih {formatRupiah(check.selisih)} dengan Jumlah Ekuitas di Neraca ({formatRupiah(check.neraca)}).</span>)}
          {' '}Tahun 2025 sesuai laporan audit; laba (rugi) 2026 = perubahan saldo laba sejak 31 Desember 2025.
        </div>
      </div>
    </div>
  )
}
