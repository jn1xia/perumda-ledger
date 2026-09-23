import { useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { apiChangePassword } from '../services/api.js'

// Reminder shown above the app for a session flagged must_change_password while
// the server does NOT enforce the change (ENFORCE_PASSWORD_CHANGE off): the
// default password keeps working and the password can be changed inline.
export function PasswordReminderBanner() {
  const { state, dispatch } = useApp()
  const session = state.session
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!session || !session.mustChangePassword) return null

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) return setError('Password baru minimal 8 karakter.')
    if (newPassword === oldPassword) return setError('Password baru harus berbeda dari password lama.')
    if (newPassword !== confirm) return setError('Konfirmasi password tidak cocok.')
    setBusy(true)
    try {
      await apiChangePassword(oldPassword, newPassword)
      // Clear the flag on the client session so the banner disappears.
      dispatch({ type: 'LOGIN', payload: { ...session, mustChangePassword: false } })
    } catch (err) {
      setError(err.message || 'Gagal mengubah password.')
      setBusy(false)
    }
  }

  return (
    <div style={{
      background: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.35)',
      padding: '10px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
    }}>
      <KeyRound size={16} color="#B45309" />
      <span style={{ fontSize: 13, color: '#92400E', fontWeight: 600 }}>
        Ganti password default Anda untuk mengamankan akun.
      </span>
      <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input className="form-input" type="password" placeholder="Password lama" autoComplete="current-password"
          value={oldPassword} onChange={e => setOld(e.target.value)} style={{ height: 32, fontSize: 13, maxWidth: 150 }} />
        <input className="form-input" type="password" placeholder="Password baru (min. 8)" autoComplete="new-password"
          value={newPassword} onChange={e => setNew(e.target.value)} style={{ height: 32, fontSize: 13, maxWidth: 170 }} />
        <input className="form-input" type="password" placeholder="Konfirmasi" autoComplete="new-password"
          value={confirm} onChange={e => setConfirm(e.target.value)} style={{ height: 32, fontSize: 13, maxWidth: 150 }} />
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Ganti Password'}
        </button>
      </form>
      {error && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>}
    </div>
  )
}

// Full-screen gate for a session flagged must_change_password (seeded default
// or admin reset) while the server enforces the change (ENFORCE_PASSWORD_CHANGE=1):
// every call except /api/auth/* is refused, so this screen is the only way on.
export default function ForcePasswordChange() {
  const { state, dispatch, refreshData, logout } = useApp()
  const session = state.session
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!session || !session.mustChangePassword) return null

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!oldPassword) return setError('Password lama wajib diisi.')
    if (newPassword.length < 8) return setError('Password baru minimal 8 karakter.')
    if (newPassword === oldPassword) return setError('Password baru harus berbeda dari password lama.')
    if (newPassword !== confirm) return setError('Konfirmasi password tidak cocok.')
    setBusy(true)
    try {
      await apiChangePassword(oldPassword, newPassword)
      // The server has swapped the cookie for an unrestricted session: clear the
      // flag, then load the data this session was not allowed to read before.
      dispatch({ type: 'LOGIN', payload: { ...session, mustChangePassword: false } })
      await refreshData('all')
    } catch (err) {
      setError(err.message || 'Gagal mengubah password.')
      setBusy(false)
    }
  }

  const label = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#374151' }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)', padding: 24,
    }}>
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #1D4ED8 100%)', padding: '24px 32px', color: 'white', display: 'flex', alignItems: 'center', gap: 12 }}>
          <KeyRound size={28} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Ganti Password Terlebih Dahulu</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Akun: {session.username}</div>
          </div>
        </div>

        <form onSubmit={submit} style={{ padding: '24px 32px' }}>
          <p style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.6, marginTop: 0, marginBottom: 18 }}>
            Akun ini masih memakai password bawaan atau password hasil reset. Demi keamanan data
            keuangan, aplikasi baru dapat dipakai setelah password diganti dengan password milik Anda sendiri.
          </p>

          <div style={{ marginBottom: 14 }}>
            <label style={label} htmlFor="pw-old">Password lama</label>
            <input id="pw-old" className="form-input" type="password" autoComplete="current-password" autoFocus
              value={oldPassword} onChange={e => setOld(e.target.value)} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={label} htmlFor="pw-new">Password baru <span style={{ fontWeight: 400, color: '#6B7280' }}>(min. 8 karakter)</span></label>
            <input id="pw-new" className="form-input" type="password" autoComplete="new-password"
              value={newPassword} onChange={e => setNew(e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={label} htmlFor="pw-confirm">Ulangi password baru</label>
            <input id="pw-confirm" className="form-input" type="password" autoComplete="new-password"
              value={confirm} onChange={e => setConfirm(e.target.value)} />
          </div>

          {error && (
            <div role="alert" style={{
              padding: '10px 14px', borderRadius: 8, background: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.3)', color: '#DC2626', fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy}
            style={{ width: '100%', justifyContent: 'center', padding: '12px 0', fontSize: 15 }}>
            {busy ? 'Menyimpan…' : 'Ganti Password & Masuk'}
          </button>
          <button type="button" className="btn btn-outline" onClick={logout} disabled={busy}
            style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}>
            <LogOut size={16} style={{ marginRight: 6 }} /> Keluar
          </button>
        </form>
      </div>
    </div>
  )
}
