import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Search, X } from 'lucide-react'

/**
 * SearchableSelect — A dropdown with search/predictive text
 * Shows filtered suggestions as you type, with keyboard navigation.
 */
export default function SearchableSelect({ value, onChange, options, placeholder = 'Ketik untuk mencari...', label }) {
  const [query, setQuery] = useState(value || '')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const wrapperRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Sync external value
  useEffect(() => {
    setQuery(value || '')
  }, [value])

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Filter options based on query
  const filtered = useMemo(() => {
    if (!query.trim()) return options.slice(0, 50)
    const q = query.toLowerCase()
    return options.filter(opt => {
      const label = typeof opt === 'string' ? opt : opt.label
      return label.toLowerCase().includes(q)
    }).slice(0, 50)
  }, [query, options])

  // Scroll highlighted item into view
  useEffect(() => {
    if (listRef.current && highlightIdx >= 0) {
      const items = listRef.current.children
      if (items[highlightIdx]) {
        items[highlightIdx].scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightIdx])

  function handleInputChange(e) {
    const val = e.target.value
    setQuery(val)
    onChange(val)
    setIsOpen(true)
    setHighlightIdx(-1)
  }

  function handleSelect(opt) {
    const val = typeof opt === 'string' ? opt : opt.value
    setQuery(val)
    onChange(val)
    setIsOpen(false)
    setHighlightIdx(-1)
  }

  function handleKeyDown(e) {
    if (!isOpen && e.key === 'ArrowDown') {
      setIsOpen(true)
      return
    }
    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault()
      handleSelect(filtered[highlightIdx])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  function handleClear() {
    setQuery('')
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-muted)', pointerEvents: 'none',
        }} />
        <input
          ref={inputRef}
          className="form-input"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          style={{ paddingLeft: 34, paddingRight: query ? 34 : 12 }}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 2, display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isOpen && filtered.length > 0 && (
        <div
          ref={listRef}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
            maxHeight: 240, overflowY: 'auto',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '0 0 8px 8px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            marginTop: -1,
          }}
        >
          {filtered.map((opt, i) => {
            const label = typeof opt === 'string' ? opt : opt.label
            const val = typeof opt === 'string' ? opt : opt.value
            const isHighlighted = i === highlightIdx
            const matchStart = label.toLowerCase().indexOf(query.toLowerCase())

            return (
              <div
                key={val + i}
                onClick={() => handleSelect(opt)}
                onMouseEnter={() => setHighlightIdx(i)}
                style={{
                  padding: '8px 14px', cursor: 'pointer', fontSize: 13,
                  transition: 'background 0.1s',
                  background: isHighlighted ? 'var(--primary-alpha)' : 'transparent',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border-light, rgba(255,255,255,0.05))' : 'none',
                }}
              >
                {query && matchStart >= 0 ? (
                  <span>
                    {label.substring(0, matchStart)}
                    <strong style={{ color: 'var(--primary)' }}>
                      {label.substring(matchStart, matchStart + query.length)}
                    </strong>
                    {label.substring(matchStart + query.length)}
                  </span>
                ) : (
                  label
                )}
              </div>
            )
          })}
        </div>
      )}

      {isOpen && filtered.length === 0 && query.trim() && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '0 0 8px 8px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          marginTop: -1,
        }}>
          Tidak ditemukan "{query}"
        </div>
      )}
    </div>
  )
}
