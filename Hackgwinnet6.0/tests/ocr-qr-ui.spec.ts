import { expect, test, type Page } from '@playwright/test'
import { expectAccessible, expectNoOverflow } from './helpers'

async function openSign(page: Page) {
  await page.goto('/#camera')
  await page.getByRole('button', { name: 'Read a sign', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Read a sign', exact: true })).toBeVisible()
}

async function uploadPrintedFixture(page: Page, text = 'RECEPTION') {
  // Authored, synthetic sign pixels. This is real OCR inference, not a physical camera test.
  const base64 = await page.evaluate(sign => {
    const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 400
    const context = canvas.getContext('2d')!
    context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'black'; context.textAlign = 'center'; context.font = 'bold 100px Arial'
    context.fillText(sign, 700, 225)
    return canvas.toDataURL('image/png').split(',')[1]
  }, text)
  await page.getByLabel('Choose photo', { exact: true }).setInputFiles({ name: 'synthetic-test-sign.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })
  await expect(page.getByRole('button', { name: 'Start recognition', exact: true })).toBeEnabled()
}

test('QR manual fallback requires confirmation and retains only a labeled last checkpoint in this session', async ({ page }) => {
  await page.goto('/#camera')
  await page.getByRole('button', { name: 'QR checkpoint', exact: true }).click()
  await expect(page.getByText('Controlled demo only.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Scan checkpoint', exact: true })).toBeDisabled()
  await page.getByLabel('Manual checkpoint ID or payload', { exact: true }).fill('https://example.com/')
  await page.getByRole('button', { name: 'Look up checkpoint', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Checkpoint not found')
  await page.getByLabel('Manual checkpoint ID or payload', { exact: true }).fill('reception')
  await page.getByRole('button', { name: 'Look up checkpoint', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Last confirmed checkpoint', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Confirm starting checkpoint', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Last confirmed checkpoint', exact: true })).toBeVisible()
  await expect(page.getByText('Manual entry + confirmation', { exact: false })).toBeVisible()
  await expect(page.locator('.qr-confirmed time')).toHaveAttribute('datetime', /^20\d\d-/)
  await page.getByRole('button', { name: 'Objects', exact: true }).click()
  await page.getByRole('button', { name: 'QR checkpoint', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Last confirmed checkpoint', exact: true })).toBeVisible()
  const saved = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  expect(saved).not.toContain('reception')
  await expectAccessible(page)
  await page.setViewportSize({ width: 390, height: 844 }); await expectNoOverflow(page)
  await page.reload()
  await page.getByRole('button', { name: 'QR checkpoint', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Last confirmed checkpoint', exact: true })).toHaveCount(0)
})

test('photo crop is keyboard-editable, rejects PDFs and does not load OCR until explicitly requested', async ({ page }) => {
  const workers: string[] = []; page.on('worker', worker => workers.push(worker.url()))
  await openSign(page)
  await page.getByLabel('Choose photo', { exact: true }).setInputFiles({ name: 'test.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') })
  await expect(page.getByRole('alert')).toContainText('does not read PDF')
  await uploadPrintedFixture(page)
  await page.getByText('Crop photo', { exact: true }).click()
  await page.getByLabel('Left edge', { exact: true }).fill('10')
  await page.getByLabel('Right edge', { exact: true }).fill('90')
  await expect(page.locator('.ocr-photo canvas')).toHaveAttribute('width', '1120')
  expect(workers.filter(url => url.includes('ocr.worker'))).toEqual([])
  await expectAccessible(page)
  await page.setViewportSize({ width: 390, height: 844 }); await expectNoOverflow(page)
  await page.getByRole('button', { name: 'Retake / clear photo', exact: true }).click()
  await expect(page.locator('.ocr-photo')).toHaveCount(0)
})

test('actual QR decoder scans synthetic shared stream frames without requesting a second camera', async ({ page }) => {
  await page.goto('/#camera')
  await page.getByRole('button', { name: 'QR checkpoint', exact: true }).click()
  await page.evaluate(async () => {
    // Explicit browser test fixture: canvas stream, not a real camera or physical location.
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 640
    const context = canvas.getContext('2d')!
    const image = new Image(); image.src = '/demo-checkpoints/reception.png'; await image.decode()
    let showLabel = false
    const draw = () => { context.fillStyle = 'white'; context.fillRect(0, 0, 640, 640); if (showLabel) context.drawImage(image, 100, 100, 440, 440) }
    draw()
    const stream = canvas.captureStream(10)
    const timer = setInterval(draw, 100)
    const fixture = { calls: 0, stream, show: () => { showLabel = true }, dispose: () => { clearInterval(timer); stream.getTracks().forEach(track => track.stop()) } }
    Object.assign(window, { __qrFixture: fixture })
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { fixture.calls += 1; return stream } })
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', { configurable: true, value: async () => [] })
  })
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Scan checkpoint', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Scan checkpoint', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Stop QR scanning', exact: true })).toBeEnabled()
  // Allow several expected NotFoundException results on blank frames first.
  await page.waitForTimeout(900)
  await expect(page.locator('.vision-tool').getByRole('alert')).toHaveCount(0)
  await page.evaluate(() => (window as unknown as { __qrFixture: { show: () => void } }).__qrFixture.show())
  await expect(page.getByRole('heading', { name: 'Review starting checkpoint', exact: true })).toBeVisible()
  await expect(page.locator('.qr-confirm')).toContainText('Reception')
  const beforeStop = await page.evaluate(() => {
    const fixture = (window as unknown as { __qrFixture: { calls: number; stream: MediaStream } }).__qrFixture
    return { calls: fixture.calls, states: fixture.stream.getTracks().map(track => track.readyState) }
  })
  expect(beforeStop).toEqual({ calls: 1, states: ['live'] })
  await page.getByRole('button', { name: 'Confirm starting checkpoint', exact: true }).click()
  await expect(page.locator('.qr-confirmed')).toContainText('QR scan + confirmation')
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as { __qrFixture: { stream: MediaStream } }).__qrFixture.stream.getTracks().map(track => track.readyState))).toEqual(['ended'])
  await page.evaluate(() => (window as unknown as { __qrFixture: { dispose: () => void } }).__qrFixture.dispose())
})

test('blocked OCR assets show an error and allow cancellation/retry without storing the photo', async ({ page, context }) => {
  await context.route('**/vision/tesseract/**', route => route.abort('failed'))
  await openSign(page); await uploadPrintedFixture(page)
  await page.getByRole('button', { name: 'Start recognition', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(/Recognition failed|worker could not start/)
  await expect(page.getByRole('button', { name: 'Start recognition', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain('RECEPTION')
})

test('cancelling initial OCR loading terminates the worker tree and leaves retry available', async ({ page, context }) => {
  await context.route('**/vision/tesseract/**', () => { /* Intentionally hold a test request until cancelled. */ })
  await openSign(page); await uploadPrintedFixture(page)
  await page.getByRole('button', { name: 'Start recognition', exact: true }).click()
  await expect.poll(() => page.workers().length).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Cancel processing', exact: true }).click()
  await expect(page.getByText('Recognition cancelled. The local photo is ready to retry.', { exact: true })).toBeVisible()
  await expect.poll(() => page.workers().length).toBe(0)
  await expect(page.getByRole('button', { name: 'Start recognition', exact: true })).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Review recognized text', exact: true })).toHaveCount(0)
})

test('real English and Spanish OCR on synthetic photo fixtures connects reviewed question and place search @network', async ({ page }) => {
  test.skip(process.env.RUN_VISION_NETWORK_TESTS !== '1', 'Opt in with RUN_VISION_NETWORK_TESTS=1; downloads official OCR language assets. Synthetic pixels, not hardware validation.')
  test.setTimeout(180_000)
  await openSign(page); await uploadPrintedFixture(page)
  await page.getByRole('button', { name: 'Start recognition', exact: true }).click()
  await expect(page.getByLabel('Recognized text — review and edit', { exact: true })).toHaveValue(/RECEPTION/i, { timeout: 120_000 })
  await page.screenshot({ path: 'artifacts/ocr-english-synthetic-fixture.png', fullPage: true })
  await uploadPrintedFixture(page, 'RECEPCIÓN')
  await page.getByRole('combobox', { name: 'Recognition language', exact: true }).selectOption('spa')
  await page.getByRole('button', { name: 'Start recognition', exact: true }).click()
  await expect(page.getByLabel('Recognized text — review and edit', { exact: true })).toHaveValue(/RECEPCI[ÓO]N/i, { timeout: 120_000 })
  await page.screenshot({ path: 'artifacts/ocr-spanish-synthetic-fixture.png', fullPage: true })
  const reviewed = page.getByLabel('Recognized text — review and edit', { exact: true })
  await reviewed.fill('Grady Memorial Hospital')
  await page.getByLabel('Question about this sign', { exact: true }).fill('Could you help me find reception?')
  await page.getByRole('button', { name: 'Add a question', exact: true }).click()
  await expect(page.getByText('Question added to your visit plan.', { exact: true })).toBeVisible()
  await page.getByText('Search a place named on this sign', { exact: true }).click()
  await reviewed.evaluate((element: HTMLTextAreaElement) => { element.focus(); element.setSelectionRange(0, element.value.length) })
  await page.getByRole('button', { name: 'Use selected text as place name', exact: true }).click()
  await expect(page.getByLabel('Place name to search', { exact: true })).toHaveValue('Grady Memorial Hospital')
  await page.getByRole('button', { name: 'Review place search', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Grady Memorial Hospital')
  await page.getByRole('button', { name: 'Confirm place search', exact: true }).click()
  await expect(page).toHaveURL(/#explore$/)
  await expect(page.getByRole('heading', { name: 'Places & access', exact: true })).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search loaded places', exact: true })).toHaveValue('Grady Memorial Hospital')
})
