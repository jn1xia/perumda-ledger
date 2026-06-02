import React, { useState, useRef, useCallback } from 'react'
import { Upload, X, FileSpreadsheet, ChevronDown, CheckCircle2, AlertCircle, Loader2, Info } from 'lucide-react'
import * as XLSX from 'xlsx'
import { detectSheetType, autoParse } from '../../utils/excelParsers.js'
import './ExcelImportModal.css'

// ─── MODULE CONFIG ─────────────────────────────────────────────────────────────
const MODULE_CONFIG = {
  jurnal:      { label: 'Jurnal Transaksi', icon: '📝', sheetHints: ['jurnal', 'journal', 'transaksi'], parseType: 'jurnal',
    columns: ['Tanggal','No.Akun','Akun','Sub Akun','D','K','Keterangan','Tipe (pendapatan/pengeluaran/transfer)'] },
  piutang:     { label: 'Piutang (AR)', icon: '💳', sheetHints: ['piutang', 'receivable', 'ar'], parseType: 'piutang',
    columns: ['Pelanggan','Tanggal','Jumlah (Rp)','Jatuh Tempo','Status'] },
  hutang:      { label: 'Hutang (AP)', icon: '💸', sheetHints: ['hutang', 'payable', 'ap'], parseType: 'hutang',
    columns: ['Supplier','Tanggal','Jumlah (Rp)','Jatuh Tempo','Status'] },
  aset:        { label: 'Aset Tetap', icon: '🏗️', sheetHints: ['aset', 'asset', 'aktiva'], parseType: 'aset',
    columns: ['Kode','Nama Aset','Kategori','Tgl Perolehan','Nilai Perolehan (Rp)','Penyusutan (Rp)','Nilai Buku (Rp)'] },
  persediaan:  { label: 'Persediaan', icon: '📦', sheetHints: ['persediaan', 'stok', 'inventory', 'barang'], parseType: 'persediaan',
    columns: ['Kode','Nama','Satuan','Stok','Harga Satuan (Rp)'] },
  anggaran:    { label: 'Anggaran (RKA)', icon: '📋', sheetHints: ['anggaran', 'rka', 'budget'], parseType: 'anggaran',
    columns: ['Kategori','Sub Kategori','Anggaran (Rp)','Realisasi (Rp)'] },
  coa:         { label: 'Chart of Accounts', icon: '📒', sheetHints: ['coa', 'akun', 'account'], parseType: 'coa',
    columns: ['Kode Akun','Nama Akun','Tipe'] },
  neraca_saldo:{ label: 'Neraca Saldo / Saldo Awal', icon: '⚖️', sheetHints: ['jan','feb','mar','apr','data lampiran','saldo'], parseType: 'neraca_saldo',
    columns: ['Kode','Nama Akun','Saldo Awal','Debit','Kredit','Saldo Akhir'] },
}

const TEMPLATE_ROWS = {
  jurnal:      [
    // Transaksi sederhana (pendapatan): 1 debit + 1 kredit, tanggal & keterangan sama
    ['2026-06-15','11101','Kas Kecil','Penerimaan Kas Kecil','500000','','Penerimaan retribusi pasar','pendapatan'],
    ['2026-06-15','41001','Pendapatan Retribusi','','','500000','Penerimaan retribusi pasar','pendapatan'],
    // Transaksi sederhana (pengeluaran)
    ['2026-06-16','61040','Beban Alat Tulis Kantor','Beban ATK','75000','','Pembelian ATK','pengeluaran'],
    ['2026-06-16','11101','Kas Kecil','Pengeluaran Kas Kecil','','75000','Pembelian ATK','pengeluaran'],
    // Transaksi multi-baris: beberapa Debit, satu Kredit (K = jumlah seluruh D).
    // Samakan Tanggal + Keterangan agar baris-baris ini tergabung jadi 1 jurnal.
    ['2026-06-17','80003','Beban Lain Lain','Beban Lain Lain','7992000','','Pengembalian uang tena & admin bank','pengeluaran'],
    ['2026-06-17','80002','Beban di Luar Operasional','Beban Administrasi Bank','6500','','Pengembalian uang tena & admin bank','pengeluaran'],
    ['2026-06-17','11103','Bank Kalsel','','','7998500','Pengembalian uang tena & admin bank','pengeluaran'],
  ],
  piutang:     [['PT Maju Bersama','2026-01-10','5000000','2026-02-10','belum lunas'],['UD Sukses','2026-01-15','2500000','2026-02-15','belum lunas']],
  hutang:      [['PT Suplai Jaya','2026-01-05','8000000','2026-02-05','belum lunas'],['CV Makmur','2026-01-12','3500000','2026-02-12','belum lunas']],
  aset:        [['AST-001','Kendaraan Operasional','Kendaraan','2023-01-01','150000000','30000000','120000000'],['AST-002','Komputer & Printer','Peralatan','2022-06-01','25000000','10000000','15000000']],
  persediaan:  [['PRD-001','Karcis Retribusi','lembar','5000','500'],['PRD-002','Alat Tulis Kantor','paket','10','75000']],
  anggaran:    [['Pendapatan','Retribusi Pasar','1200000000','850000000'],['Beban Operasional','Listrik & Air','36000000','28000000']],
  coa:         [['11101','Kas Kecil - Kantor','asset'],['41101','Pendapatan Retribusi','revenue'],['61101','Beban ATK','expense']],
  neraca_saldo:[['11101','Kas Kecil - Kantor','500000','200000','150000','550000'],['41101','Pendapatan Retribusi','0','0','5000000','5000000']],
}

// ─── Download template ─────────────────────────────────────────────────────────
function downloadTemplate(moduleType) {
  const cfg  = MODULE_CONFIG[moduleType]
  if (!cfg) return
  const ws   = XLSX.utils.aoa_to_sheet([cfg.columns, ...(TEMPLATE_ROWS[moduleType] || [])])
  const wb   = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, cfg.label.slice(0, 31))
  XLSX.writeFile(wb, `template_${moduleType}.xlsx`)
}

// ─── Preview table component ───────────────────────────────────────────────────
function PreviewTable({ data, moduleType }) {
  if (!data?.length) return <div className="eim-empty">Tidak ada data valid ditemukan</div>
  const cfg = MODULE_CONFIG[moduleType]
  const keys = Object.keys(data[0])
  return (
    <div className="eim-table-wrap">
      <table className="eim-table">
        <thead><tr>{keys.map(k => <th key={k}>{k}</th>)}</tr></thead>
        <tbody>
          {data.slice(0, 8).map((row, i) => (
            <tr key={i}>{keys.map(k => <td key={k}>{String(row[k] ?? '')}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {data.length > 8 && <div className="eim-more">… dan {data.length - 8} baris lainnya</div>}
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function ExcelImportModal({ moduleType, onImport, onClose, title }) {
  const cfg       = MODULE_CONFIG[moduleType] || {}
  const fileRef   = useRef(null)
  const [step, setStep]           = useState('upload')   // upload | preview | importing | done | error
  const [wb, setWb]               = useState(null)
  const [sheets, setSheets]       = useState([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [parsedData, setParsedData]       = useState([])
  const [detectedType, setDetectedType]   = useState(moduleType)
  const [error, setError]         = useState(null)
  const [result, setResult]       = useState(null)
  const [dragOver, setDragOver]   = useState(false)
  const [fileName, setFileName]   = useState('')

  // ── Parse selected sheet ────────────────────────────────────────────────────
  const parseSheet = useCallback((workbook, sheetName, hint) => {
    try {
      const ws   = workbook.Sheets[sheetName]
      const det  = detectSheetType(ws)
      const type = hint || det.type
      setDetectedType(type)
      const parsed = autoParse(ws, type)
      setParsedData(parsed.data || [])
      setStep('preview')
      setError(null)
    } catch (e) {
      setError('Gagal parse sheet: ' + e.message)
    }
  }, [])

  // ── Handle file ─────────────────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file) return
    setFileName(file.name)
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array', cellDates: false })
        setWb(workbook)
        setSheets(workbook.SheetNames)

        // Auto-detect best sheet
        const hints  = cfg.sheetHints || []
        const best   = workbook.SheetNames.find(s =>
          hints.some(h => s.toLowerCase().includes(h))
        ) || workbook.SheetNames[0]
        setSelectedSheet(best)
        parseSheet(workbook, best, moduleType)
      } catch (err) {
        setError('Gagal membaca file: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [cfg, moduleType, parseSheet])

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }

  // ── Do import ───────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!parsedData.length) return
    setStep('importing')
    try {
      const res = await onImport(parsedData, detectedType)
      setResult(res)
      setStep('done')
    } catch (e) {
      setError(e.message)
      setStep('error')
    }
  }

  return (
    <div className="eim-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="eim-modal">
        {/* Header */}
        <div className="eim-header">
          <div className="eim-header-left">
            <span className="eim-icon">{cfg.icon || '📊'}</span>
            <div>
              <div className="eim-title">{title || `Import ${cfg.label || moduleType} dari Excel`}</div>
              <div className="eim-subtitle">Format: LAMPIRAN LAPORAN KEUANGAN Perumda</div>
            </div>
          </div>
          <button className="eim-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="eim-body">
          {/* Step: upload */}
          {step === 'upload' && (
            <>
              <div className={`eim-dropzone ${dragOver ? 'eim-dropzone--over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}>
                <FileSpreadsheet size={40} className="eim-drop-icon" />
                <div className="eim-drop-text">Drag & drop file Excel di sini</div>
                <div className="eim-drop-sub">atau klik untuk memilih file (.xlsx, .xls)</div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files[0])} />
              </div>
              {error && <div className="eim-error"><AlertCircle size={14} /> {error}</div>}

              {/* Template download */}
              <div className="eim-template-box">
                <Info size={14} />
                <span>Belum punya template? </span>
                <button className="eim-template-btn" onClick={() => downloadTemplate(moduleType)}>
                  Download Template Excel
                </button>
                {cfg.columns && (
                  <span className="eim-cols"> — Kolom: {cfg.columns.join(', ')}</span>
                )}
              </div>
            </>
          )}

          {/* Step: preview */}
          {step === 'preview' && (
            <>
              {/* Sheet picker */}
              <div className="eim-sheet-row">
                <span className="eim-sheet-label">📄 File: <strong>{fileName}</strong></span>
                <div className="eim-select-wrap">
                  <select className="eim-select" value={selectedSheet}
                    onChange={e => { setSelectedSheet(e.target.value); parseSheet(wb, e.target.value, moduleType) }}>
                    {sheets.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={14} className="eim-select-icon" />
                </div>
              </div>

              {/* Detected type badge */}
              <div className="eim-type-badge">
                Terdeteksi sebagai: <strong>{MODULE_CONFIG[detectedType]?.label || detectedType}</strong>
                &nbsp;— <strong>{parsedData.length}</strong> baris siap import
              </div>

              {error && <div className="eim-error"><AlertCircle size={14} /> {error}</div>}

              <PreviewTable data={parsedData} moduleType={detectedType} />

              <div className="eim-actions">
                <button className="eim-btn eim-btn-outline" onClick={() => { setStep('upload'); setParsedData([]) }}>
                  ← Ganti File
                </button>
                <button className="eim-btn eim-btn-primary" onClick={handleImport} disabled={!parsedData.length}>
                  <Upload size={15} /> Import {parsedData.length} Baris
                </button>
              </div>
            </>
          )}

          {/* Step: importing */}
          {step === 'importing' && (
            <div className="eim-center">
              <Loader2 size={40} className="eim-spin" />
              <div className="eim-loading-text">Mengimpor {parsedData.length} baris data…</div>
            </div>
          )}

          {/* Step: done */}
          {step === 'done' && (
            <div className="eim-center">
              <CheckCircle2 size={48} className="eim-success-icon" />
              <div className="eim-done-text">Import Berhasil!</div>
              {result && <div className="eim-result-msg">{result}</div>}
              <button className="eim-btn eim-btn-primary" style={{ marginTop: 20 }} onClick={onClose}>
                Selesai
              </button>
            </div>
          )}

          {/* Step: error */}
          {step === 'error' && (
            <div className="eim-center">
              <AlertCircle size={48} className="eim-error-icon" />
              <div className="eim-done-text" style={{ color: 'var(--danger)' }}>Import Gagal</div>
              <div className="eim-result-msg">{error}</div>
              <button className="eim-btn eim-btn-outline" style={{ marginTop: 20 }} onClick={() => setStep('preview')}>
                Coba Lagi
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
