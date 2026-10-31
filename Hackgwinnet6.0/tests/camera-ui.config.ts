import { defineConfig } from '@playwright/test'
// Isolated preview avoids colliding with the repository's full QA suite.
export default defineConfig({
  testDir: '.', testMatch: ['camera.spec.ts', 'camera-network.spec.ts'],
  workers: 1, timeout: 45_000, reporter: 'list', outputDir: '../test-results-camera',
  use: { browserName: 'chromium', channel: 'msedge', baseURL: 'http://127.0.0.1:4181', viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' },
  webServer: { command: 'npm.cmd run preview -- --port 4181 --strictPort', url: 'http://127.0.0.1:4181', reuseExistingServer: true, timeout: 60_000 },
})
