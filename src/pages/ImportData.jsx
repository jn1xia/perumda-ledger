import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import * as XLSX from 'xlsx'
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, FileText, Database, RefreshCw } from 'lucide-react'
import * as api from '../services/api.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function excelDate(sn, fallback = '2026-01-01') {
  if (typeof sn === 'number' && sn > 40000) return new Date((sn - 25569) * 86400 * 1000).toISOString().split('T')[0]
  return fallback
}
function getCategory(code) {
  const c = String(code)
  if (c.startsWith('1')) return 'Aset'
  if (c.startsWith('2')) return 'Kewajiban'
  if (c.startsWith('3')) return 'Ekuitas'
  if (c.startsWith('4')) return 'Pendapatan'
  if (c.startsWith('5')) return 'HPP'
  if (c.startsWith('6') || c.startsWith('8') || c === '99999') return 'Beban'
  if (c.startsWith('7')) return 'Pendapatan'
  return 'Lainnya'
}

// ─── Parsers ──────────────────────────────────────────────────────────────────
function parseCOA(wb) {
  const ws = wb.Sheets['COA']
  if (!ws) return null
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const accounts = []
  for (const row of raw) {
    const [code, name] = row
    if (!code || typeof name !== 'string' || !name) continue
    const cs = String(code)
    if (!cs.match(/^\d{4,5}(\.\d)?$/)) continue
    accounts.push({ code: cs, name: name.trim(), type: 'posting', category: getCategory(cs), saldo_awal: 0 })
  }
  return accounts.length > 0 ? accounts : null
}

function parseSaldoAwal(wb) {
  const ws = wb.Sheets['Rekap Akun & Saldo (thn)']
  if (!ws) return null
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const saldos = {}
  for (let i = 1; i < raw.length; i++) {
    const [code, name, side, saldoAwal] = raw[i]
    if (!code || !name) continue
    const cs = String(code)
    if (!cs.match(/^\d/)) continue
    saldos[cs] = { code: cs, name: String(name).trim(), saldo_awal: typeof saldoAwal === 'number' ? saldoAwal : 0 }
  }
  return Object.keys(saldos).length > 0 ? saldos : null
}

function parseAnggaran(wb) {
  const sheets = ['Penerimaan', 'Investasi', 'Beban Umum', 'Beban Operasional']
  const catMap = { 'Penerimaan': 'Penerimaan', 'Investasi': 'Investasi', 'Beban Umum': 'Beban Umum & Administrasi', 'Beban Operasional': 'Beban Operasional' }
  const items = []
  for (const sn of sheets) {
    const ws = wb.Sheets[sn]
    if (!ws) continue
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    for (let i = 2; i < raw.length; i++) {
      const row = raw[i]
      const kode = row[0], nama = row[1], anggaran = row[2]
      if (!kode || !nama || typeof anggaran !== 'number') continue
      items.push({ kode: String(kode).trim(), nama: String(nama).trim(), kategori: catMap[sn] || sn, anggaran_awal: anggaran, target_bulan: Math.round(anggaran / 12), realisasi: 0, bulan: 0 })
    }
  }
  return items.length > 0 ? items : null
}

function parseAset(wb) {
  const ws = wb.Sheets['DAFTAR AKTIVA TETAP']
  if (!ws) return null
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const assets = []
  let kat = 'Peralatan'
  for (let i = 5; i < raw.length; i++) {
    const row = raw[i], no = row[0], nama = row[1] || ''
    if (typeof no === 'string' && no.match(/^[IV]+\./)) {
      if (no.includes('TANAH')) kat = 'Tanah'
      else if (no.includes('BANGUNAN')) kat = 'Bangunan'
      else if (no.includes('KENDARAAN')) kat = 'Kendaraan'
      else if (no.includes('MESIN')) kat = 'Mesin'
      else if (no.includes('PERALATAN')) kat = 'Peralatan'
      continue
    }
    if (typeof no !== 'number' || !nama) continue
    assets.push({
      kode: `AT-${String(assets.length + 1).padStart(3, '0')}`,
      nama: nama.trim(), detail: String(row[2] || '').trim(), kategori: kat,
      tgl_perolehan: excelDate(row[3], '2025-01-01'),
      nilai_perolehan: Number(row[4]) || 0, penyusutan_per_tahun: Number(row[6]) || 0,
      penyusutan_per_bulan: Number(row[7]) || 0, beban_penyusutan_2025: Number(row[8]) || 0,
      nilai_penyusutan: Number(row[9]) || 0, nilai_buku: Number(row[10]) || 0,
      umur_manfaat: kat === 'Tanah' ? '-' : (kat === 'Bangunan' ? '20 tahun' : '8 tahun'),
      keterangan: String(row[20] || '').trim()
    })
  }
  return assets.length > 0 ? assets : null
}

function parseJurnal(wb, coaFlat) {
  // Try multiple sheet name patterns
  const sheetPatterns = ['JURNAL APRIL 2026', 'JURNAL JAN 2026', 'JURNAL FEBRUARI 2026', 'JURNAL MARET 2026']
  const nameToCode = {}
  ;(coaFlat || []).forEach(a => { nameToCode[a.name.toLowerCase()] = a.code })

  const entries = []
  for (const sn of wb.SheetNames) {
    if (!sn.toUpperCase().startsWith('JURNAL')) continue
    const ws = wb.Sheets[sn]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    // Detect format by checking column structure
    const isAprilFormat = raw[3] && typeof raw[3][5] === 'number' // col 5 = debit
    if (isAprilFormat) {
      for (let i = 3; i < Math.min(raw.length, 500); i += 2) {
        const dr = raw[i], cr = raw[i + 1]
        if (!dr || !cr) continue
        const adc = dr[0], adn = dr[3] || '', da = dr[5] || 0, ket = dr[7] || ''
        const akc = cr[0], akn = cr[3] || '', ka = cr[6] || 0
        if (!adc || !akc || (!da && !ka)) continue
        entries.push({
          tanggal: excelDate(dr[2], '2026-04-01'), keterangan: String(ket).trim(),
          debit: Number(da) || Number(ka) || 0, kredit: Number(ka) || Number(da) || 0, status: 'posted',
          akun_debit: `${adc} - ${adn}`, akun_kredit: `${akc} - ${akn}`, bukti: String(dr[2] || '')
        })
      }
    } else {
      // January-style format: Tgl(0), No.Akun(1), Akun(2), Sub(3), D(4), K(5), Ket(6)
      const groups = []; let curDate = null, curRows = []
      for (let i = 3; i < raw.length; i++) {
        const d = raw[i][0]
        if (!d || typeof d !== 'number') continue
        if (curDate !== null && d !== curDate) { groups.push({ dateSN: curDate, rows: curRows }); curRows = [] }
        curDate = d; curRows.push(raw[i])
      }
      if (curRows.length > 0) groups.push({ dateSN: curDate, rows: curRows })
      groups.forEach((g, gi) => {
        const tanggal = excelDate(g.dateSN, '2026-01-01')
        const debits = [], credits = []
        g.rows.forEach(r => {
          const name = r[2] || '', code = nameToCode[name.toLowerCase()], da = r[4] || 0, ka = r[5] || 0
          if (da > 0) debits.push({ name, code, amount: Number(da), ket: r[6] || '' })
          if (ka > 0) credits.push({ name, code, amount: Number(ka), ket: r[6] || '' })
        })
        if (debits.length === 1 && credits.length === 1) {
          const d = debits[0], c = credits[0]
          entries.push({ tanggal, keterangan: d.ket || c.ket || d.name, debit: d.amount, kredit: c.amount, status: 'posted',
            akun_debit: d.code ? `${d.code} - ${d.name}` : d.name, akun_kredit: c.code ? `${c.code} - ${c.name}` : c.name, bukti: `${sn.slice(7,10)}-${gi+1}` })
        } else {
          debits.forEach(d => {
            const c = credits[0] || { name: 'Unknown', code: '' }
            entries.push({ tanggal, keterangan: d.ket || d.name, debit: d.amount, kredit: d.amount, status: 'posted',
              akun_debit: d.code ? `${d.code} - ${d.name}` : d.name, akun_kredit: c.code ? `${c.code} - ${c.name}` : c.name, bukti: `${sn.slice(7,10)}-${gi+1}` })
          })
        }
      })
    }
  }
  return entries.length > 0 ? entries : null
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ImportData() {
  const { state, dispatch, refreshData } = useApp()
  const [file, setFile] = useState(null)
  const [importMode, setImportMode] = useState('standard')
  const [errors, setErrors] = useState([])
  const [success, setSuccess] = useState(false)
  const [importing, setImporting] = useState(false)
  // Multi-entity parsed results
  const [parsed, setParsed] = useState({ coa: null, saldoAwal: null, anggaran: null, aset: null, jurnal: null })
  const [selected, setSelected] = useState({ coa: true, saldoAwal: true, anggaran: true, aset: true, jurnal: true })
  // Standard mode
  const [parsedData, setParsedData] = useState([])

  const handleDownloadTemplate = () => {
    const wsData = [
      ['Tanggal', 'Bukti', 'Keterangan', 'Akun Debit', 'Akun Kredit', 'Debit', 'Kredit'],
      ['2026-05-01', 'JV-001', 'Contoh Jurnal', '11101 - Bank BNI', '41000 - Pendapatan', 1000000, 1000000]
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Jurnal')
    XLSX.writeFile(wb, 'Template_Import_Jurnal.xlsx')
  }

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0]
    if (!uploadedFile) return
    setFile(uploadedFile)
    setSuccess(false); setErrors([]); setParsedData([]); setParsed({ coa: null, saldoAwal: null, anggaran: null, aset: null, jurnal: null })

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })

        if (importMode === 'audit') {
          const coa = parseCOA(wb)
          const saldoAwal = parseSaldoAwal(wb)
          const anggaran = parseAnggaran(wb)
          const aset = parseAset(wb)
          const jurnal = parseJurnal(wb, state.coaFlat)
          if (!coa && !saldoAwal && !anggaran && !aset && !jurnal) {
            setErrors(['Tidak ada data yang dapat dikenali dari file ini. Pastikan file mengandung sheet COA, Jurnal, Anggaran, atau Aktiva Tetap.'])
          } else {
            setParsed({ coa, saldoAwal, anggaran, aset, jurnal })
          }
        } else {
          const ws = wb.Sheets[wb.SheetNames[0]]
          const data = XLSX.utils.sheet_to_json(ws)
          let parseErrors = [], items = []
          data.forEach((row, index) => {
            if (!row['Tanggal'] || !row['Akun Debit'] || !row['Akun Kredit']) { parseErrors.push(`Baris ${index + 2}: Kehilangan kolom wajib`); return }
            items.push({ tanggal: row['Tanggal'], bukti: row['Bukti'] || '-', keterangan: row['Keterangan'] || '',
              akun_debit: String(row['Akun Debit']).trim(), akun_kredit: String(row['Akun Kredit']).trim(),
              debit: Number(row['Debit']) || 0, kredit: Number(row['Kredit']) || 0, status: 'draft' })
          })
          if (parseErrors.length > 0) setErrors(parseErrors)
          else setParsedData(items)
        }
      } catch (err) { setErrors(['Gagal membaca file Excel: ' + err.message]) }
    }
    reader.readAsBinaryString(uploadedFile)
  }

  const handleImportStandard = () => {
    if (parsedData.length === 0) return
    dispatch({ type: 'ADD_BULK_JOURNALS', payload: parsedData })
    setSuccess(true); setParsedData([]); setFile(null)
  }

  const handleImportAudit = async () => {
    setImporting(true); setErrors([])
    const results = []
    try {
      // 1. COA
      if (selected.coa && parsed.coa) {
        for (const acc of parsed.coa) {
          const sa = parsed.saldoAwal?.[acc.code]
          try { await api.apiCreateCOA({ ...acc, saldo_awal: sa?.saldo_awal || acc.saldo_awal || 0 }) } catch (e) {
            if (!e.message.includes('sudah terdaftar')) throw e
            // Update saldo awal if account exists
            if (sa) try { await api.apiUpdateCOA(acc.code, { ...acc, saldo_awal: sa.saldo_awal }) } catch {}
          }
        }
        results.push(`✅ COA: ${parsed.coa.length} akun`)
      }
      // 2. Saldo Awal (update existing COA)
      if (selected.saldoAwal && parsed.saldoAwal && !selected.coa) {
        for (const [code, sa] of Object.entries(parsed.saldoAwal)) {
          try { await api.apiUpdateCOA(code, { saldo_awal: sa.saldo_awal }) } catch {}
        }
        results.push(`✅ Saldo Awal: ${Object.keys(parsed.saldoAwal).length} akun`)
      }
      // 3. Anggaran
      if (selected.anggaran && parsed.anggaran) {
        for (const a of parsed.anggaran) {
          try { await api.apiUpsertAnggaran(a) } catch {}
        }
        results.push(`✅ Anggaran: ${parsed.anggaran.length} item`)
      }
      // 4. Aset
      if (selected.aset && parsed.aset) {
        for (const a of parsed.aset) {
          try { await api.apiCreateAsset(a) } catch {}
        }
        results.push(`✅ Aset Tetap: ${parsed.aset.length} aset`)
      }
      // 5. Jurnal
      if (selected.jurnal && parsed.jurnal) {
        const chunks = []; const chunk = 50
        for (let i = 0; i < parsed.jurnal.length; i += chunk) chunks.push(parsed.jurnal.slice(i, i + chunk))
        for (const ch of chunks) {
          try { await api.apiCreateJournalsBulk(ch) } catch {}
        }
        results.push(`✅ Jurnal: ${parsed.jurnal.length} entri`)
      }

      await refreshData('all')
      setSuccess(true)
      setErrors(results)
      setParsed({ coa: null, saldoAwal: null, anggaran: null, aset: null, jurnal: null })
      setFile(null)
    } catch (err) {
      setErrors([...results, `❌ Error: ${err.message}`])
    } finally { setImporting(false) }
  }

  const hasAuditData = parsed.coa || parsed.saldoAwal || parsed.anggaran || parsed.aset || parsed.jurnal
  const counts = {
    coa: parsed.coa?.length || 0,
    saldoAwal: parsed.saldoAwal ? Object.keys(parsed.saldoAwal).length : 0,
    anggaran: parsed.anggaran?.length || 0,
    aset: parsed.aset?.length || 0,
    jurnal: parsed.jurnal?.length || 0,
  }

  return (
    <div className="page-container animate-in">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Import Data</h1>
          <p className="page-subtitle">Upload data dari Excel — otomatis terisi ke seluruh laporan</p>
        </div>
        {importMode === 'standard' && (
          <button className="btn btn-outline" onClick={handleDownloadTemplate}><Download size={16} /> Unduh Template</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button className={`btn ${importMode === 'standard' ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setImportMode('standard'); setFile(null); setParsedData([]); setParsed({ coa: null, saldoAwal: null, anggaran: null, aset: null, jurnal: null }) }}>
          <FileSpreadsheet size={16} /> Format Template Standar
        </button>
        <button className={`btn ${importMode === 'audit' ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setImportMode('audit'); setFile(null); setParsedData([]); setParsed({ coa: null, saldoAwal: null, anggaran: null, aset: null, jurnal: null }) }}>
          <Database size={16} /> Lampiran Laporan Keuangan (Full Import)
        </button>
      </div>

      {importMode === 'audit' && (
        <div className="card" style={{ padding: 16, marginBottom: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}><Database size={16} color="var(--primary)" /> Mode Full Import</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Upload file Excel Lampiran Laporan Keuangan (Jan/Feb/Mar/Apr 2026). Sistem akan otomatis mengekstrak <strong>COA, Saldo Awal, Anggaran, Aset Tetap, dan Jurnal</strong> — semua data langsung tersinkron ke seluruh modul laporan.
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 24, padding: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '48px 24px', background: 'var(--bg-subtle)' }}>
          <FileSpreadsheet size={48} color="var(--primary)" style={{ marginBottom: 16 }} />
          <h3 style={{ marginBottom: 8 }}>Pilih File Excel</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24, textAlign: 'center', maxWidth: 500 }}>
            {importMode === 'standard'
              ? "Unggah file .xlsx sesuai format template. Maksimal 1000 baris per upload."
              : "Unggah file Lampiran Laporan Keuangan. Sistem akan mendeteksi semua sheet dan mengekstrak data."}
          </p>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            <Upload size={16} /> Telusuri File
            <input type="file" accept=".xlsx, .xls" style={{ display: 'none' }} onChange={handleFileUpload} />
          </label>
          {file && <div style={{ marginTop: 16, fontWeight: 500 }}>File terpilih: {file.name}</div>}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="card" style={{ padding: 24, borderLeft: `4px solid ${success ? 'var(--success)' : 'var(--danger)'}`, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: success ? 'var(--success)' : 'var(--danger)', marginBottom: 12, fontWeight: 600 }}>
            {success ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />} {success ? 'Import Selesai' : 'Perhatian'}
          </div>
          <ul style={{ margin: 0, paddingLeft: 24, color: 'var(--text-secondary)' }}>
            {errors.map((e, i) => <li key={i} style={{ marginBottom: 4 }}>{e}</li>)}
          </ul>
        </div>
      )}

      {success && errors.length === 0 && (
        <div className="card" style={{ padding: 24, borderLeft: '4px solid var(--success)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <CheckCircle2 size={24} color="var(--success)" />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Import Berhasil!</div>
            <div style={{ color: 'var(--text-secondary)' }}>Data telah berhasil ditambahkan dan tersinkron ke seluruh laporan.</div>
          </div>
        </div>
      )}

      {/* Audit mode: show detected data entities */}
      {importMode === 'audit' && hasAuditData && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title">Data Terdeteksi</h3>
            <button className="btn btn-primary" onClick={handleImportAudit} disabled={importing}>
              {importing ? <><RefreshCw size={16} className="spin" /> Mengimpor...</> : <><CheckCircle2 size={16} /> Import Semua Data Terpilih</>}
            </button>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {[
                { key: 'coa', label: 'Chart of Accounts', icon: '📊' },
                { key: 'saldoAwal', label: 'Saldo Awal', icon: '💰' },
                { key: 'anggaran', label: 'Anggaran (RKA)', icon: '📋' },
                { key: 'aset', label: 'Aktiva Tetap', icon: '🏗️' },
                { key: 'jurnal', label: 'Jurnal Transaksi', icon: '📝' },
              ].map(item => {
                const count = counts[item.key]
                const available = count > 0
                return (
                  <label key={item.key} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                    borderRadius: 10, border: `1px solid ${available ? 'var(--primary)' : 'var(--border)'}`,
                    background: available && selected[item.key] ? 'rgba(var(--primary-rgb, 99,102,241), 0.08)' : 'var(--bg-secondary)',
                    opacity: available ? 1 : 0.5, cursor: available ? 'pointer' : 'default'
                  }}>
                    <input type="checkbox" checked={available && selected[item.key]} disabled={!available}
                      onChange={() => setSelected(s => ({ ...s, [item.key]: !s[item.key] }))} />
                    <span style={{ fontSize: 20 }}>{item.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{available ? `${count} item` : 'Tidak ditemukan'}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Standard mode preview */}
      {importMode === 'standard' && parsedData.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title">Preview Data ({parsedData.length} baris ditemukan)</h3>
            <button className="btn btn-primary" onClick={handleImportStandard}><CheckCircle2 size={16} /> Simpan ke Jurnal</button>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Tanggal</th><th>Bukti</th><th>Akun Debit</th><th>Akun Kredit</th><th>Keterangan</th><th className="text-right">Debit</th><th className="text-right">Kredit</th></tr></thead>
              <tbody>
                {parsedData.slice(0, 15).map((row, i) => (
                  <tr key={i}><td>{row.tanggal}</td><td>{row.bukti}</td><td>{row.akun_debit}</td><td>{row.akun_kredit}</td><td>{row.keterangan}</td>
                    <td className="text-right mono">{(row.debit).toLocaleString('id-ID')}</td><td className="text-right mono">{(row.kredit).toLocaleString('id-ID')}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedData.length > 15 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-subtle)' }}>Menampilkan 15 dari {parsedData.length} baris...</div>}
        </div>
      )}
    </div>
  )
}
