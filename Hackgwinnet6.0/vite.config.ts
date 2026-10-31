import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  server: {
    // Test reports and documentation should not reset an in-memory demo through HMR.
    watch: { ignored: ['**/test-results*/**', '**/playwright-report/**', '**/artifacts/**', '**/tests/**', '**/.publish/**', '**/README.md', '**/playwright.config.ts'] },
  },
})

