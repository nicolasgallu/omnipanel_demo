import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mockApiPlugin } from './src/mock/server'

// VITE_USE_MOCK=1  -> the dev server serves a local in-memory mock of /api/*
// (no backend, no DB needed). Otherwise /api is proxied to the Flask backend.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const useMock = env.VITE_USE_MOCK === '1'

  return {
    build: { sourcemap: true },
    plugins: [react(), tailwindcss(), mockApiPlugin({ enabled: useMock })],
    server: {
      port: 5173,
      proxy: useMock
        ? undefined
        : {
            '/api': {
              target: env.VITE_API_PROXY || 'http://localhost:8080',
              changeOrigin: true,
            },
          },
    },
  }
})
