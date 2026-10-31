import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CameraService, classifyCameraError } from '../src/camera/CameraService'
import { DetectionService, type DetectorModel } from '../src/camera/DetectionService'
import { isFreshFrame, stabilizeDetections, type DetectionFrame } from '../src/camera/detections'
import { imageSide, transformBox } from '../src/camera/geometry'
import { describeFrame, resolveTarget } from '../src/camera/i18n'

const frame = (time = 1000, session = 'session-a'): DetectionFrame => ({
  cameraSessionId: session, frameTimestamp: time, completedAt: time + 40, width: 1280, height: 720,
  detections: [{ label: 'chair', score: .85, bbox: [100, 200, 100, 200], cameraSessionId: session, frameTimestamp: time }],
})
function streamFixture() {
  let stopped = 0
  const listeners = new Map<string, () => void>()
  const track = { stop: () => { stopped++ }, getSettings: () => ({ deviceId: 'test-camera', facingMode: 'environment' }), addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) }
  return { stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream, stopped: () => stopped, listeners }
}
function videoFixture() {
  const callbacks = new Map<number, VideoFrameRequestCallback>()
  let serial = 0
  const element = { readyState: 2, videoWidth: 1280, videoHeight: 720, currentTime: 0, muted: false, playsInline: false, srcObject: null, play: async () => {}, pause: () => {}, requestVideoFrameCallback: (callback: VideoFrameRequestCallback) => { callbacks.set(++serial, callback); return serial }, cancelVideoFrameCallback: (id: number) => callbacks.delete(id) }
  return { element: element as unknown as HTMLVideoElement, callbacks, present: (time: number) => { element.currentTime = time; const next = callbacks.entries().next().value; if (next) { callbacks.delete(next[0]); next[1](performance.now(), { mediaTime: time } as VideoFrameCallbackMetadata) } } }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

test('overlay transforms preserve letterboxing, cover cropping, mirroring and rotation', () => {
  expect(transformBox([100, 100, 200, 100], { width: 1280, height: 720 }, { width: 640, height: 400 })).toEqual([50, 70, 100, 50])
  expect(transformBox([100, 100, 200, 100], { width: 1280, height: 720 }, { width: 640, height: 400 }, { mirrored: true })).toEqual([490, 70, 100, 50])
  expect(transformBox([0, 0, 1280, 720], { width: 1280, height: 720 }, { width: 400, height: 400 }, { fit: 'cover' })[0]).toBeCloseTo(-155.555)
  expect(transformBox([10, 20, 30, 40], { width: 100, height: 200 }, { width: 200, height: 100 }, { rotation: 90 })).toEqual([140, 10, 40, 30])
  expect(transformBox([10, 20, 30, 40], { width: 100, height: 200 }, { width: 200, height: 100 }, { rotation: 270 })).toEqual([20, 60, 40, 30])
  expect(imageSide([100, 0, 100, 100], 1280)).toBe('left')
  expect(imageSide([100, 0, 100, 100], 1280, true)).toBe('right')
  expect(imageSide([500, 0, 200, 100], 1280)).toBe('center')
})

test('stale, future and other-session results cannot be used; smoothing never retains missing objects', () => {
  expect(isFreshFrame(frame(), 'session-a', 2500)).toBe(true)
  expect(isFreshFrame(frame(), 'session-a', 2501)).toBe(false)
  expect(isFreshFrame(frame(), 'session-b', 1001)).toBe(false)
  expect(isFreshFrame(frame(), 'session-a', 999)).toBe(false)
  expect(isFreshFrame(frame(), null, 1100)).toBe(false)
  expect(stabilizeDetections([], frame(), 1200)).toEqual([])
  expect(resolveTarget('wheelchair')).toBe(null)
  expect(resolveTarget('nurse')).toBe(null)
  expect(resolveTarget('silla')).toBe('chair')
  expect(describeFrame(frame(), 'person', false, 'en')).toBe('No supported target was detected in the latest frame.')
  expect(describeFrame(frame(), 'chair', true, 'en')).toContain('right side')
})

test('one permission request owns the gate; stop disposes tracks from a late grant', async () => {
  const request = deferred<MediaStream>()
  const fixture = streamFixture()
  const video = videoFixture().element
  const requests: MediaStreamConstraints[] = []
  const service = new CameraService({ secure: true, mediaDevices: { getUserMedia: constraints => { requests.push(constraints); return request.promise }, enumerateDevices: async () => [] } })
  const first = service.start(video)
  const duplicate = service.start(video)
  expect(first).toBe(duplicate)
  expect(service.getSnapshot().phase).toBe('requesting')
  service.stop()
  expect(service.start(video)).toBe(first)
  request.resolve(fixture.stream)
  await first
  expect(requests).toHaveLength(1)
  expect(requests[0].audio).toBe(false)
  expect(fixture.stopped()).toBe(1)
  expect(video.srcObject).toBe(null)
  expect(service.getSnapshot().sessionId).toBe(null)
  expect(service.getSnapshot().phase).toBe('idle')
  service.dispose()
})

test('camera stop/restart and hidden document release each stream with intentional resume', async () => {
  const fixtures = [streamFixture(), streamFixture()]
  let calls = 0
  const video = videoFixture().element
  const service = new CameraService({ secure: true, mediaDevices: { getUserMedia: async () => fixtures[calls++].stream, enumerateDevices: async () => [] } })
  let hidden = false
  let onVisibility: (() => void) | undefined
  const fakeDocument = { get hidden() { return hidden }, addEventListener: (_: string, fn: () => void) => { onVisibility = fn }, removeEventListener: () => { onVisibility = undefined } } as unknown as Document
  service.watchVisibility(fakeDocument)
  await service.start(video)
  const session = service.getSnapshot().sessionId
  expect(service.getSnapshot().phase).toBe('active')
  expect(video.muted && video.playsInline).toBe(true)
  service.setAnalysisPaused(true)
  expect(service.getSnapshot().phase).toBe('paused')
  expect(fixtures[0].stopped()).toBe(0)
  hidden = true
  onVisibility!()
  expect(fixtures[0].stopped()).toBe(1)
  expect(service.getSnapshot().hidden).toBe(true)
  expect(service.getSnapshot().sessionId).toBe(null)
  hidden = false
  onVisibility!()
  expect(calls).toBe(1)
  await service.start(video)
  expect(service.getSnapshot().sessionId).not.toBe(session)
  service.dispose()
  expect(fixtures[1].stopped()).toBe(1)
  expect(fixtures.every(item => item.listeners.size === 0)).toBe(true)
  expect(onVisibility).toBeUndefined()
})

test('optional device enumeration cannot stop an otherwise usable camera', async () => {
  const fixture = streamFixture()
  const service = new CameraService({ secure: true, mediaDevices: { getUserMedia: async () => fixture.stream, enumerateDevices: () => { throw new Error('Optional browser API blocked') } } })
  await service.start(videoFixture().element)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(service.getSnapshot().phase).toBe('active')
  expect(fixture.stopped()).toBe(0)
  service.dispose()
  expect(fixture.stopped()).toBe(1)
})

test('delayed model loading remains visible and late completion is disposed after exit', async () => {
  const pending = deferred<{ model: DetectorModel; backend: string }>()
  let disposed = false
  const service = new DetectionService(() => pending.promise, 1500, 1)
  const started = service.start(videoFixture().element, 'delayed-model')
  await expect.poll(() => service.getSnapshot().error).toBe('model-delay')
  service.dispose()
  pending.resolve({ model: { detect: async () => [], dispose: () => { disposed = true } }, backend: 'test-fixture' })
  await started
  expect(disposed).toBe(true)
  expect(service.getSnapshot().frame).toBe(null)
})

test('secure context, denied permission and hardware failures are explicit', async () => {
  const secure = new CameraService({ secure: false })
  await secure.start(videoFixture().element)
  expect(secure.getSnapshot().error).toBe('insecure')
  secure.dispose()
  const denied = new CameraService({ secure: true, mediaDevices: { getUserMedia: async () => { throw new DOMException('Test fixture', 'NotAllowedError') }, enumerateDevices: async () => [] } })
  await denied.start(videoFixture().element)
  expect(denied.getSnapshot().phase).toBe('error')
  expect(denied.getSnapshot().error).toBe('denied')
  expect(classifyCameraError(new DOMException('', 'NotReadableError'))).toBe('busy')
  expect(classifyCameraError(new DOMException('', 'NotFoundError'))).toBe('missing')
  expect(classifyCameraError(new DOMException('', 'OverconstrainedError'))).toBe('constraints')
  denied.dispose()
})

test('model load failure is visible and late-loaded models are disposed', async () => {
  const failed = new DetectionService(async () => { throw new Error('Test network failure') })
  await failed.start(videoFixture().element, 'session-test')
  expect(failed.getSnapshot().modelState).toBe('error')
  expect(failed.getSnapshot().error).toBe('model-load')
  failed.dispose()
  const pending = deferred<{ model: DetectorModel; backend: string }>()
  let disposals = 0
  const delayed = new DetectionService(() => pending.promise)
  const loading = delayed.start(videoFixture().element, 'session-test')
  delayed.dispose()
  pending.resolve({ model: { detect: async () => [], dispose: () => { disposals++ } }, backend: 'test-fixture' })
  await loading
  expect(disposals).toBe(1)
})

test('analysis has one request in flight, uses 640px input, and expires frozen results', async () => {
  const originalDocument = globalThis.document
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: () => {} }) } as unknown as HTMLCanvasElement
  globalThis.document = { createElement: () => canvas } as unknown as Document
  const pending = deferred<{ class: string; score: number; bbox: [number, number, number, number] }[]>()
  let calls = 0, disposals = 0
  const service = new DetectionService(async () => ({ model: { detect: () => { calls++; return pending.promise }, dispose: () => { disposals++ } }, backend: 'test-fixture' }), 200)
  const video = videoFixture()
  try {
    await service.start(video.element, 'session-test')
    video.present(1)
    video.present(2)
    expect(calls).toBe(1)
    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(360)
    expect(video.callbacks.size).toBe(0)
    pending.resolve([{ class: 'chair', score: .8, bbox: [50, 50, 100, 100] }])
    await expect.poll(() => service.getSnapshot().frame?.detections.length).toBe(1)
    expect(service.getSnapshot().frame!.detections[0].bbox).toEqual([100, 100, 200, 200])
    await expect.poll(() => service.getSnapshot().stale).toBe(true)
    expect(service.getSnapshot().frame).toBe(null)
    service.dispose()
    expect(video.callbacks.size).toBe(0)
    expect(disposals).toBe(1)
  } finally { service.dispose(); globalThis.document = originalDocument }
})

test('disposing during inference suppresses the result and delays disposal until inference ends', async () => {
  const originalDocument = globalThis.document
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => {} }) }) } as unknown as Document
  const pending = deferred<[]>()
  let disposed = false
  const service = new DetectionService(async () => ({ model: { detect: () => pending.promise, dispose: () => { disposed = true } }, backend: 'test-fixture' }))
  const video = videoFixture()
  try {
    await service.start(video.element, 'test')
    video.present(1)
    service.dispose()
    expect(disposed).toBe(false)
    pending.resolve([])
    await expect.poll(() => disposed).toBe(true)
    expect(service.getSnapshot().frame).toBe(null)
    expect(video.callbacks.size).toBe(0)
  } finally { service.dispose(); globalThis.document = originalDocument }
})

test('fallback scheduler uses advancing video time and never repeatedly analyzes a frozen frame', async () => {
  const originalDocument = globalThis.document
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => {} }) }) } as unknown as Document
  let calls = 0
  const service = new DetectionService(async () => ({ model: { detect: async () => { calls++; return [] }, dispose: () => {} }, backend: 'test-fixture' }), 200)
  const video = videoFixture().element
  Object.defineProperty(video, 'requestVideoFrameCallback', { value: undefined })
  try {
    await service.start(video, 'fallback-session')
    await expect.poll(() => calls).toBe(1)
    await expect.poll(() => service.getSnapshot().stale).toBe(true)
    expect(calls).toBe(1)
    video.currentTime = 1
    await expect.poll(() => calls).toBe(2)
    service.setPaused(true)
    expect(service.getSnapshot().frame).toBe(null)
  } finally { service.dispose(); globalThis.document = originalDocument }
})

test('replacement model warmup waits for retired camera inference instead of competing with it', async () => {
  const originalDocument = globalThis.document
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => {} }) }) } as unknown as Document
  const pending = deferred<[]>()
  let nextLoads = 0
  const previous = new DetectionService(async () => ({ model: { detect: () => pending.promise, dispose: () => {} }, backend: 'test-fixture' }))
  const next = new DetectionService(async () => { nextLoads++; return { model: { detect: async () => [], dispose: () => {} }, backend: 'test-fixture' } })
  try {
    const video = videoFixture()
    await previous.start(video.element, 'old-camera')
    video.present(1)
    previous.dispose()
    const nextStart = next.start(videoFixture().element, 'new-camera')
    expect(nextLoads).toBe(0)
    pending.resolve([])
    await nextStart
    expect(nextLoads).toBe(1)
    expect(next.getSnapshot().frame).toBe(null)
  } finally { previous.dispose(); next.dispose(); globalThis.document = originalDocument }
})

test('camera UI requests permission only on start and keeps blocked-camera alternatives available', async ({ page }) => {
  await page.addInitScript(() => {
    let requests = 0
    Object.defineProperty(window, '__cameraTestRequests', { get: () => requests })
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => { requests++; throw new DOMException('Test fixture: permission blocked', 'NotAllowedError') }, enumerateDevices: async () => [] }, configurable: true })
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true })
  })
  await page.goto('/#camera')
  await expect(page.getByRole('heading', { name: 'Camera assistance', exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __cameraTestRequests: number }).__cameraTestRequests)).toBe(0)
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Camera permission was blocked' })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __cameraTestRequests: number }).__cameraTestRequests)).toBe(1)
  await page.getByLabel('Search supported objects').fill('wheelchair')
  await page.getByRole('button', { name: 'Find an object', exact: true }).click()
  await expect(page.getByText('This camera tool does not recognize that target.', { exact: false })).toBeVisible()
  await expect(page.getByText('Browser speech is unavailable. Use the visible text.')).toBeVisible()
  expect((await new AxeBuilder({ page }).include('.camera-page').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Read a sign', exact: true }).click()
  await expect(page.getByLabel('Choose photo', { exact: true })).toBeAttached()
})

test('camera UI model network failure is visible; generated test stream stops and restarts', async ({ page }) => {
  await page.addInitScript(() => {
    const fixture = { tracks: [] as MediaStreamTrack[], requests: 0 }
    Object.defineProperty(window, '__cameraFixture', { value: fixture })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => {
        fixture.requests++
        const canvas = document.createElement('canvas')
        canvas.width = 320; canvas.height = 180
        canvas.getContext('2d')!.fillRect(0, 0, 320, 180)
        const stream = canvas.captureStream(10)
        fixture.tracks.push(...stream.getTracks())
        return stream
      }, enumerateDevices: async () => [],
    } })
  })
  await page.route('**/tfjs-models/**', route => route.abort())
  await page.goto('/#camera')
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.locator('.camera-state')).toContainText('active')
  await expect(page.getByRole('alert').filter({ hasText: 'The object model could not load' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as { __cameraFixture: { tracks: MediaStreamTrack[] } }).__cameraFixture.tracks.every(track => track.readyState === 'ended'))).toBe(true)
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.locator('.camera-state')).toContainText('active')
  expect(await page.evaluate(() => (window as unknown as { __cameraFixture: { requests: number } }).__cameraFixture.requests)).toBe(2)
  await page.getByRole('button', { name: 'Open map', exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as { __cameraFixture: { tracks: MediaStreamTrack[] } }).__cameraFixture.tracks.every(track => track.readyState === 'ended'))).toBe(true)
})

test('camera UI remains readable in Spanish with large text, high contrast and a narrow screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('carenori-interface-settings-v1', JSON.stringify({ language: 'es', largeText: true, highContrast: true, reducedMotion: true, simplified: true }))
  })
  await page.goto('/#camera')
  await expect(page.getByRole('heading', { name: 'Asistencia con cámara', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Iniciar cámara', exact: true })).toBeVisible()
  await expect(page.getByText('La asistencia con cámara puede no detectar objetos. No determina si un camino es seguro.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  expect((await new AxeBuilder({ page }).include('.camera-page').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('camera-spanish-large-mobile.png'), fullPage: true })
})
