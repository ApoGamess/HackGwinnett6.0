import { defineConfig } from '@playwright/test'
// Pure service checks need neither a browser nor a preview server.
export default defineConfig({ testDir: '.', testMatch: 'camera.spec.ts', grepInvert: /camera UI/, workers: 1, reporter: 'list' })
