import { useState } from 'react'
import { LogIn, Eye, EyeOff, Building2, Shield } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { ROLE_META, ROLES_BY_DIVISI, getRoleLabel } from '../data/roles.js'

// Demo password — in production replace with bcrypt-validated server-side auth
const DEMO_PASSWORD = 'perumda2026'

export default function Login() {
  const { dispatch } = useApp()
  const [username, setUsername]         = useState('')
  const [password, setPassword]         = useState('')
  const [showPass, setShowPass]         = useState(false)
  const [selectedRole, setSelectedRole] = useState('')
  const [error, setError]               = useState('')
  const [loading, setLoading]           = useState(false)

  // Group roles by divisi for display
  const divisiKeys = Object.keys(ROLES_BY_DIVISI)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')

    if (!username.trim()) return setError('Username wajib diisi.')
    if (!password)        return setError('Password wajib diisi.')
    if (!selectedRole)    return setError('Pilih jabatan/role terlebih dahulu.')

    setLoading(true)
    try {
      // Simple validation — check against users list in state or use demo password
      // In production this hits POST /api/auth/login with bcrypt verification
      await new Promise(r => setTimeout(r, 400)) // simulate network

      if (password !== DEMO_PASSWORD) {
        setError('Password salah. Hubungi Admin Sistem untuk reset password.')
        setLoading(false)
        return
      }

      // Persist session
      const session = {
        username: username.trim().toLowerCase(),
        role: selectedRole,
        roleLabel: getRoleLabel(selectedRole),
        loginAt: new Date().toISOString(),
      }
      try {
        localStorage.setItem('session', JSON.stringify(session))
        localStorage.setItem('userRole', selectedRole)
      } catch { /* ignore storage errors */ }
      window.__USER_ROLE__ = selectedRole

      dispatch({ type: 'LOGIN', payload: session })
    } catch (err) {
      setError('Gagal login: ' + err.message)
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)',
      padding: 24,
    }}>
      <div style={{
        background: 'white',
        borderRadius: 16,
        width: '100%',
        maxWidth: 460,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1E3A5F 0%, #1D4ED8 100%)',
          padding: '28px 32px',
          textAlign: 'center',
          color: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
            <Building2 size={32} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.3 }}>PERUMDA PASAR BAIMAN</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Sistem Keuangan Terintegrasi 2026</div>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{ padding: '28px 32px' }}>
          {/* Username */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#374151' }}>
              Username
            </label>
            <input
              className="form-input"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="contoh: sari.keuangan"
              autoComplete="username"
              autoFocus
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#374151' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Jabatan / Role */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#374151' }}>
              Jabatan / Role *
            </label>
            <select
              className="form-select"
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
            >
              <option value="">— Pilih Jabatan —</option>
              {divisiKeys.map(divisi => (
                <optgroup key={divisi} label={divisi}>
                  {ROLES_BY_DIVISI[divisi].map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {selectedRole && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Shield size={11} />
                {ROLE_META.find(r => r.value === selectedRole)?.desc}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, background: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.3)', color: '#DC2626',
              fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px 0', fontSize: 15 }}
            disabled={loading}
          >
            {loading
              ? <><span style={{ marginRight: 8 }}>⏳</span> Memverifikasi...</>
              : <><LogIn size={18} style={{ marginRight: 8 }} /> Masuk</>
            }
          </button>

          {/* Demo hint */}
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
            fontSize: 12, color: '#3B82F6', lineHeight: 1.6,
          }}>
            <strong>Demo:</strong> Password <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 3 }}>perumda2026</code> berlaku untuk semua akun.
            Hubungi <strong>Admin Sistem / Manager IT</strong> untuk reset password produksi.
          </div>
        </form>

        {/* Footer */}
        <div style={{ padding: '14px 32px', background: '#F9FAFB', borderTop: '1px solid #E5E7EB', fontSize: 11, color: '#9CA3AF', textAlign: 'center' }}>
          Perumda Pasar Banjarmasin © 2026 · SOP berlaku mulai 1 Januari 2026
        </div>
      </div>
    </div>
  )
}
