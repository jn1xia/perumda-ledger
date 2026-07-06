import { useRef } from 'react'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'

export default function Modal({ title, onClose, children, footer, width = 560 }) {
  // Close on overlay click ONLY when the press started on the overlay itself.
  // Selecting/copying text inside the modal often ends with the mouse released
  // over the overlay; the browser then fires `click` on the overlay (common
  // ancestor of mousedown/mouseup), which used to close the form mid-input —
  // reported by finance as "copy teks → terlempar kembali ke menu Jurnal".
  const pressStartedOnOverlay = useRef(false)

  const modalContent = (
    <div
      className="modal-overlay"
      onMouseDown={e => { pressStartedOnOverlay.current = e.target === e.currentTarget }}
      onClick={e => {
        if (e.target === e.currentTarget && pressStartedOnOverlay.current) onClose()
        pressStartedOnOverlay.current = false
      }}
    >
      <div className="modal" style={{ maxWidth: width }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null

  return createPortal(modalContent, document.body)
}
