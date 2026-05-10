import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import * as XLSX from 'xlsx'
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, FileText } from 'lucide-react'

export default function ImportData() {
  const { state, dispatch } = useApp()
  const [file, setFile] = useState(null)
  const [parsedData, setParsedData] = useState([])
  const [errors, setErrors] = useState([])
  const [success, setSuccess] = useState(false)
  const [importMode, setImportMode] = useState('standard') // 'standard' or 'audit'

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

  // Parses the specific JURNAL APRIL 2026 format
  const parseAprilAudit = (wb) => {
    const ws = wb.Sheets['JURNAL APRIL 2026']
    if (!ws) return { err: "Sheet 'JURNAL APRIL 2026' tidak ditemukan." }
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const entries = []
    
    for (let i = 3; i < Math.min(raw.length, 500); i += 2) {
      const debitRow = raw[i]; const creditRow = raw[i + 1]
      if (!debitRow || !creditRow) continue
      const akunDebitCode = debitRow[0]; const dateSN = debitRow[2]
      const bukti = debitRow[2] || ''; const akunDebitName = debitRow[3] || ''
      const debitAmt = debitRow[5] || 0; const keterangan = debitRow[7] || ''
      const akunKreditCode = creditRow[0]; const akunKreditName = creditRow[3] || ''
      const kreditAmt = creditRow[6] || 0
      
      if (!akunDebitCode || !akunKreditCode || (!debitAmt && !kreditAmt)) continue
      
      let tanggal = '2026-04-01'
      if (typeof dateSN === 'number' && dateSN > 40000) {
        tanggal = new Date((dateSN - 25569) * 86400 * 1000).toISOString().split('T')[0]
      }
      
      entries.push({
        tanggal, keterangan: String(keterangan).trim(),
        debit: Number(debitAmt) || Number(kreditAmt) || 0,
        kredit: Number(kreditAmt) || Number(debitAmt) || 0,
        status: 'draft',
        akun_debit: `${akunDebitCode} - ${akunDebitName}`,
        akun_kredit: `${akunKreditCode} - ${akunKreditName}`,
        bukti: String(bukti)
      })
    }
    return { data: entries }
  }

  // Parses the specific JURNAL JAN 2026 format
  const parseJanAudit = (wb) => {
    const ws = wb.Sheets['JURNAL JAN 2026']
    if (!ws) return { err: "Sheet 'JURNAL JAN 2026' tidak ditemukan." }
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    
    // Build name-to-code mapping from existing global state
    const nameToCode = {}
    state.coaFlat.forEach(a => { nameToCode[a.name.toLowerCase()] = a.code })
    
    const entries = []
    const dateGroups = []
    let currentDate = null; let currentRows = []
    
    for (let i = 3; i < raw.length; i++) {
      const dateSN = raw[i][0]
      if (!dateSN || typeof dateSN !== 'number') continue
      if (currentDate !== null && dateSN !== currentDate) {
        dateGroups.push({ dateSN: currentDate, rows: currentRows }); currentRows = []
      }
      currentDate = dateSN; currentRows.push(raw[i])
    }
    if (currentRows.length > 0) dateGroups.push({ dateSN: currentDate, rows: currentRows })
    
    dateGroups.forEach((group, gidx) => {
      let tanggal = '2026-01-01'
      if (typeof group.dateSN === 'number' && group.dateSN > 40000) {
        tanggal = new Date((group.dateSN - 25569) * 86400 * 1000).toISOString().split('T')[0]
      }
      const debits = []; const credits = []
      group.rows.forEach(r => {
        const accName = r[2] || ''; const stdCode = nameToCode[accName.toLowerCase()]
        const debitAmt = r[4] || 0; const kreditAmt = r[5] || 0
        if (debitAmt > 0) debits.push({ name: accName, code: stdCode, amount: Number(debitAmt), ket: r[6] || '' })
        if (kreditAmt > 0) credits.push({ name: accName, code: stdCode, amount: Number(kreditAmt), ket: r[6] || '' })
      })
      
      // Attempt 1:1, 1:N pairing (simplified from node script for frontend safety)
      if (debits.length === 1 && credits.length === 1) {
        entries.push({
          tanggal, keterangan: debits[0].ket || credits[0].ket || debits[0].name,
          debit: debits[0].amount, kredit: credits[0].amount, status: 'draft',
          akun_debit: debits[0].code ? `${debits[0].code} - ${debits[0].name}` : debits[0].name,
          akun_kredit: credits[0].code ? `${credits[0].code} - ${credits[0].name}` : credits[0].name,
          bukti: `JAN-${gidx + 1}`
        })
      } else {
        // Just extract individual rows if complex mapping
        debits.forEach(d => {
          entries.push({
            tanggal, keterangan: d.ket || d.name, debit: d.amount, kredit: d.amount, status: 'draft',
            akun_debit: d.code ? `${d.code} - ${d.name}` : d.name,
            akun_kredit: credits[0] ? (credits[0].code ? `${credits[0].code} - ${credits[0].name}` : credits[0].name) : 'Unknown',
            bukti: `JAN-${gidx + 1}`
          })
        })
      }
    })
    return { data: entries }
  }

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0]
    if (!uploadedFile) return
    setFile(uploadedFile)
    setSuccess(false); setErrors([]); setParsedData([])

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        
        if (importMode === 'audit') {
          // Detect which audit file this is
          if (wb.SheetNames.includes('JURNAL APRIL 2026')) {
            const res = parseAprilAudit(wb)
            if (res.err) setErrors([res.err])
            else setParsedData(res.data)
          } else if (wb.SheetNames.includes('JURNAL JAN 2026')) {
            const res = parseJanAudit(wb)
            if (res.err) setErrors([res.err])
            else setParsedData(res.data)
          } else {
            setErrors(["Format file tidak dikenali. Pastikan file mengandung sheet 'JURNAL APRIL 2026' atau 'JURNAL JAN 2026'."])
          }
        } else {
          // Standard Mode
          const ws = wb.Sheets[wb.SheetNames[0]]
          const data = XLSX.utils.sheet_to_json(ws)
          let parseErrors = []; let parsed = []
          
          data.forEach((row, index) => {
            if (!row['Tanggal'] || !row['Akun Debit'] || !row['Akun Kredit']) {
              parseErrors.push(`Baris ${index + 2}: Kehilangan kolom wajib`)
              return
            }
            parsed.push({
              tanggal: row['Tanggal'], bukti: row['Bukti'] || '-', keterangan: row['Keterangan'] || '',
              akun_debit: String(row['Akun Debit']).trim(), akun_kredit: String(row['Akun Kredit']).trim(),
              debit: Number(row['Debit']) || 0, kredit: Number(row['Kredit']) || 0, status: 'draft'
            })
          })
          if (parseErrors.length > 0) setErrors(parseErrors)
          else setParsedData(parsed)
        }
      } catch (err) {
        setErrors(['Gagal membaca file Excel. Pastikan formatnya benar.'])
      }
    }
    reader.readAsBinaryString(uploadedFile)
  }

  const handleImport = () => {
    if (parsedData.length === 0) return
    dispatch({ type: 'ADD_BULK_JOURNALS', payload: parsedData })
    setSuccess(true); setParsedData([]); setFile(null)
  }

  return (
    <div className="page-container animate-in">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Import Data Jurnal</h1>
          <p className="page-subtitle">Upload data jurnal secara massal melalui Excel</p>
        </div>
        {importMode === 'standard' && (
          <button className="btn btn-outline" onClick={handleDownloadTemplate}>
            <Download size={16} /> Unduh Template
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button className={`btn ${importMode === 'standard' ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setImportMode('standard'); setFile(null); setParsedData([]) }}>
          <FileSpreadsheet size={16} /> Format Template Standar
        </button>
        <button className={`btn ${importMode === 'audit' ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setImportMode('audit'); setFile(null); setParsedData([]) }}>
          <FileText size={16} /> Format Lampiran Audit (Jan/Apr 2026)
        </button>
      </div>

      <div className="card" style={{ marginBottom: 24, padding: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '48px 24px', background: 'var(--bg-subtle)' }}>
          <FileSpreadsheet size={48} color="var(--primary)" style={{ marginBottom: 16 }} />
          <h3 style={{ marginBottom: 8 }}>Pilih File Excel {importMode === 'audit' && '(Laporan Audit)'}</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24, textAlign: 'center', maxWidth: 500 }}>
            {importMode === 'standard' 
              ? "Unggah file .xlsx atau .xls sesuai dengan format template. Maksimal 1000 baris per upload."
              : "Unggah file mentah Laporan Keuangan (DRAFT AUDITED JANUARI 2026 atau LAMPIRAN APRIL 2026). Sistem akan otomatis mendeteksi sheet dan mengekstrak jurnal."}
          </p>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            <Upload size={16} /> Telusuri File
            <input type="file" accept=".xlsx, .xls" style={{ display: 'none' }} onChange={handleFileUpload} />
          </label>
          {file && <div style={{ marginTop: 16, fontWeight: 500 }}>File terpilih: {file.name}</div>}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="card" style={{ padding: 24, borderLeft: '4px solid var(--danger)', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--danger)', marginBottom: 12, fontWeight: 600 }}>
            <AlertCircle size={20} /> Terdapat Kesalahan pada File
          </div>
          <ul style={{ margin: 0, paddingLeft: 24, color: 'var(--text-secondary)' }}>
            {errors.map((e, i) => <li key={i} style={{ marginBottom: 4 }}>{e}</li>)}
          </ul>
        </div>
      )}

      {success && (
        <div className="card" style={{ padding: 24, borderLeft: '4px solid var(--success)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <CheckCircle2 size={24} color="var(--success)" />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Import Berhasil!</div>
            <div style={{ color: 'var(--text-secondary)' }}>Data jurnal telah berhasil ditambahkan ke dalam sistem (Status: Draft).</div>
          </div>
        </div>
      )}

      {parsedData.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title">Preview Data ({parsedData.length} baris ditemukan)</h3>
            <button className="btn btn-primary" onClick={handleImport}>
              <CheckCircle2 size={16} /> Simpan ke Jurnal
            </button>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Bukti</th>
                  <th>Akun Debit</th>
                  <th>Akun Kredit</th>
                  <th>Keterangan</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.slice(0, 15).map((row, i) => (
                  <tr key={i}>
                    <td>{row.tanggal}</td>
                    <td>{row.bukti}</td>
                    <td>{row.akun_debit}</td>
                    <td>{row.akun_kredit}</td>
                    <td>{row.keterangan}</td>
                    <td className="text-right mono">{(row.debit).toLocaleString('id-ID')}</td>
                    <td className="text-right mono">{(row.kredit).toLocaleString('id-ID')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedData.length > 15 && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-subtle)' }}>
              Menampilkan 15 dari {parsedData.length} baris...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
