/**
 * ImportExcelButton — drop-in trigger button for any module.
 * Usage:
 *   <ImportExcelButton moduleType="jurnal" onImport={handleImport} />
 */
import React, { useState } from 'react'
import { FileUp } from 'lucide-react'
import ExcelImportModal from './ExcelImportModal.jsx'

export default function ImportExcelButton({ moduleType, onImport, label, style }) {
  const [open, setOpen] = useState(false)

  const handleImport = async (data, detectedType) => {
    if (typeof onImport !== 'function') throw new Error('onImport callback tidak tersedia')
    const result = await onImport(data, detectedType)
    return result || `${data.length} baris berhasil diimport.`
  }

  return (
    <>
      <button
        className="btn btn-outline"
        style={{ display: 'flex', alignItems: 'center', gap: 6, ...style }}
        onClick={() => setOpen(true)}
        title={`Import ${moduleType} dari Excel`}
      >
        <FileUp size={15} />
        {label || 'Import Excel'}
      </button>

      {open && (
        <ExcelImportModal
          moduleType={moduleType}
          onImport={handleImport}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
