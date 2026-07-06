/**
 * EnvBanner.jsx
 *
 * Shows a fixed "QA / TESTING" ribbon when the app is built or served in QA mode
 * (Vite env `VITE_APP_ENV === 'qa'`). In production builds the env var is unset,
 * so this renders nothing and has zero effect on the production app.
 */
const APP_ENV = import.meta.env.VITE_APP_ENV || 'production'

export default function EnvBanner() {
  if (APP_ENV !== 'qa') return null

  return (
    <div
      role="status"
      aria-label="Lingkungan QA"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        height: 26,
        lineHeight: '26px',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 1,
        color: '#fff',
        background: 'repeating-linear-gradient(45deg,#b45309,#b45309 12px,#92400e 12px,#92400e 24px)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      QA / TESTING — data terisolasi, bukan produksi
    </div>
  )
}
