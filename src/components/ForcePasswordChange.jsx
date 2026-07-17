import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { apiChangePassword } from '../services/api.js'

// Shown when the session is flagged must_change_password (seeded/reset accounts).
// Lets the user rotate the default password inline; hides once done.
export default function ForcePasswordChange() {
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
