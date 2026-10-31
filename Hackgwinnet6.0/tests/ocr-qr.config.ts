import { defineConfig } from '@playwright/test'

// Isolated port for parallel implementation verification; the normal suite also
// discovers ocr-qr-*.spec.ts from the repository's standard Playwright config.
export default defineConfig({
  testDir: '.', testMatch: /ocr-qr-.*\.spec\.ts/, workers: 1, timeout: 45_000,
  expect: { timeout: 10_000 }, reporter: [['list']], outputDir: '../test-results-ocr-qr',
  use: { browserName: 'chromium', channel: 'msedge', baseURL: 'http://127.0.0.1:4177', viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' },
  webServer: { command: `${process.platform === 'win32' ? 'npm.cmd' : 'npm'} run preview -- --port 4177 --strictPort`, url: 'http://127.0.0.1:4177', reuseExistingServer: true, timeout: 60_000 },
})
