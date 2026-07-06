import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Supports a dedicated QA mode (`vite --mode qa`) that reads `.env.qa`:
//   VITE_APP_ENV=qa        → shows the QA banner
//   VITE_DEV_PORT=5174     → QA dev server port (keeps prod-local dev on 5173)
//   VITE_API_URL=…3002/api → QA frontend talks to the QA API server (port 3002)
// Production / default dev behaviour is unchanged when these are not set.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devPort = Number(env.VITE_DEV_PORT) || 5173
  const apiProxy = env.VITE_API_PROXY || 'http://localhost:3001'

  return {
    plugins: [react()],
    server: {
      port: devPort,
      open: true,
      proxy: {
        '/api': {
          target: apiProxy,
          changeOrigin: true,
        },
      },
    },
  }
})
