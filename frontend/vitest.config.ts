import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Configuración de tests aislada de vite.config.ts a propósito:
// NO cargamos el plugin de mock (src/mock/server) ni Tailwind. Solo el plugin
// de React y el entorno jsdom, más el setup de jest-dom.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['@testing-library/jest-dom/vitest'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
