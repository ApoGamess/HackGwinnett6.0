import { expect, test } from '@playwright/test'

test('NETWORK TEST FIXTURE: actual COCO model loads and infers on generated blank video, then releases tracks', async ({ page }) => {
  test.skip(process.env.CARENORI_NETWORK_TESTS !== '1', 'Opt in to remote model downloads with CARENORI_NETWORK_TESTS=1. This is not a physical-device test.')
  test.setTimeout(180_000)
  await page.addInitScript(() => {
    const testState = { tracks: [] as MediaStreamTrack[], requests: 0, timers: [] as ReturnType<typeof setInterval>[] }
    Object.defineProperty(window, '__cameraFixture', { value: testState })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => {
        testState.requests++
        const canvas = document.createElement('canvas')
        canvas.width = 640; canvas.height = 360
        const ctx = canvas.getContext('2d')!
        let value = 0
        const paint = () => { ctx.fillStyle = value++ % 2 ? '#eee' : '#fff'; ctx.fillRect(0, 0, 640, 360) }
        paint()
        testState.timers.push(setInterval(paint, 100))
        const stream = canvas.captureStream(10)
        testState.tracks.push(...stream.getTracks())
        return stream
      }, enumerateDevices: async () => [],
    } })
  })
  await page.goto('/#camera')
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.locator('.camera-state')).toContainText('active')
  await page.getByText('Camera diagnostics', { exact: true }).click()
  await expect(page.locator('.camera-diagnostics').getByText('ready', { exact: true })).toBeVisible({ timeout: 150_000 })
  await expect(page.locator('.camera-diagnostics dl > div').filter({ has: page.getByText('Inference duration', { exact: true }) }).locator('dd')).toContainText(/\d+ ms/, { timeout: 60_000 })
  await expect(page.locator('.camera-diagnostics dl > div').filter({ has: page.getByText('Input resolution', { exact: true }) }).locator('dd')).toHaveText('640 × 360')
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click()
  await expect(page.locator('.camera-state')).toContainText('idle')
  expect(await page.evaluate(() => {
    const fixture = (window as unknown as { __cameraFixture: { tracks: MediaStreamTrack[]; requests: number; timers: ReturnType<typeof setInterval>[] } }).__cameraFixture
    fixture.timers.forEach(clearInterval)
    return { requests: fixture.requests, ended: fixture.tracks.every(track => track.readyState === 'ended') }
  })).toEqual({ requests: 1, ended: true })
})
