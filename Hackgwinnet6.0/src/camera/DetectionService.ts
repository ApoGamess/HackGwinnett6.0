import { isFreshFrame, isSupportedTarget, STALE_RESULT_MS, stabilizeDetections, type DetectionFrame } from './detections'
import type { Box } from './geometry'

export type ModelState = 'idle' | 'loading' | 'ready' | 'error'
export interface AnalysisSnapshot {
  modelState: ModelState
  backend: string
  frame: DetectionFrame | null
  lastFrameTimestamp: number | null
  inferenceMs: number | null
  analysesPerSecond: number
  inputWidth: number
  inputHeight: number
  stale: boolean
  paused: boolean
  error: string
}
export const initialAnalysisSnapshot = (): AnalysisSnapshot => ({ modelState: 'idle', backend: '', frame: null, lastFrameTimestamp: null, inferenceMs: null, analysesPerSecond: 0, inputWidth: 0, inputHeight: 0, stale: false, paused: false, error: '' })
export interface DetectorModel {
  detect(input: HTMLCanvasElement, maxNumBoxes?: number, minScore?: number): Promise<{ class: string; score: number; bbox: Box }[]>
  dispose(): void
}
export type ModelLoader = () => Promise<{ model: DetectorModel; backend: string }>
// A retired service may still be awaiting GPU work after a camera switch. Drop
// frames in its replacement until that work settles; never queue another detect.
let activeInference: symbol | null = null
const idleWaiters = new Set<() => void>()
function releaseInference(owner: symbol) {
  if (activeInference === owner) { activeInference = null; [...idleWaiters].forEach(wake => wake()) }
}
async function loadCocoModel(): Promise<{ model: DetectorModel; backend: string }> {
  // TFJS's official package registers both webgl and cpu backends. Model URLs are
  // supplied by the pinned COCO package; no custom asset URL is invented here.
  const tf = await import('@tensorflow/tfjs')
  try { if (!await tf.setBackend('webgl')) throw new Error('WebGL unavailable'); await tf.ready() }
  catch { await tf.setBackend('cpu'); await tf.ready() }
  if (!tf.getBackend()) { await tf.setBackend('cpu'); await tf.ready() }
  const coco = await import('@tensorflow-models/coco-ssd')
  return { model: await coco.load({ base: 'lite_mobilenet_v2' }), backend: tf.getBackend() }
}

/** New-frame scheduling, no queue, bounded work. Dispose waits for active detect. */
export class DetectionService {
  private snapshot = initialAnalysisSnapshot()
  private listeners = new Set<(value: AnalysisSnapshot) => void>()
  private model: DetectorModel | null = null
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private sessionId: string | null = null
  private closed = false
  private loading = false
  private epoch = 0
  private inFlight = false
  private frameCallback: number | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private freshnessTimer: ReturnType<typeof setInterval> | null = null
  private previousMediaTime = -1
  private lastStarted = 0
  private intervalMs = 333
  private startedAt = 0
  private completedTimes: number[] = []
  private pendingFrameTimestamp: number | null = null
  private cancelWait: (() => void) | null = null
  constructor(private loader: ModelLoader = loadCocoModel, private staleMs = STALE_RESULT_MS, private modelNoticeMs = 30_000) {}
  getSnapshot = () => this.snapshot
  subscribe(listener: (value: AnalysisSnapshot) => void) {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => { this.listeners.delete(listener) }
  }
  private update(patch: Partial<AnalysisSnapshot>) {
    if (this.closed) return
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach(listener => listener(this.snapshot))
  }
  async start(video: HTMLVideoElement, sessionId: string) {
    if (this.closed || this.loading || this.model) return
    this.video = video
    this.sessionId = sessionId
    this.loading = true
    this.startedAt = Date.now()
    this.freshnessTimer = setInterval(() => this.expire(), 150)
    this.update({ modelState: 'loading', error: '' })
    let loadingOwner: symbol | null = null
    try {
      // COCO load includes a warm-up inference. It shares the same slot as video
      // inference, including across a quick camera stop/restart or mode switch.
      while (activeInference !== null && !this.closed) {
        await new Promise<void>(resolve => {
          const wake = () => { idleWaiters.delete(wake); this.cancelWait = null; resolve() }
          this.cancelWait = wake
          idleWaiters.add(wake)
        })
      }
      if (this.closed) return
      loadingOwner = Symbol('model-warmup')
      activeInference = loadingOwner
      const { model, backend } = await this.loader()
      if (this.closed) { try { model.dispose() } catch { /* A torn-down backend cannot be reused. */ } return }
      this.model = model
      this.canvas = document.createElement('canvas')
      this.update({ modelState: 'ready', backend, error: '' })
      this.schedule()
    } catch {
      this.update({ modelState: 'error', error: 'model-load' })
    } finally {
      if (loadingOwner !== null) releaseInference(loadingOwner)
      this.loading = false
    }
  }
  setPaused(paused: boolean) {
    if (paused === this.snapshot.paused || this.closed) return
    this.epoch++
    this.cancelSchedule()
    this.update({ paused, frame: null, stale: false, lastFrameTimestamp: null, analysesPerSecond: 0 })
    this.completedTimes = []
    if (!paused) { this.startedAt = Date.now(); this.previousMediaTime = -1; this.schedule() }
  }
  private expire() {
    if (this.closed || this.snapshot.paused) return
    const now = Date.now()
    // The official COCO loader does not expose AbortSignal. Keep stream Stop
    // usable and explain a slow download; dispose any model arriving after exit.
    if (this.loading && now - this.startedAt > this.modelNoticeMs) {
      this.update({ error: 'model-delay' })
    }
    const frame = this.snapshot.frame
    const completed = this.completedTimes.filter(time => time >= now - 5000)
    this.completedTimes = completed
    const rate = completed.length / Math.max(1, Math.min(5, (now - this.startedAt) / 1000))
    const stale = frame ? !isFreshFrame(frame, this.sessionId, now, this.staleMs)
      : this.snapshot.stale || (this.pendingFrameTimestamp !== null && now - this.pendingFrameTimestamp > this.staleMs)
    this.update({ ...(stale ? { frame: null } : {}), stale, analysesPerSecond: rate })
  }
  private cancelSchedule() {
    if (this.frameCallback !== null) this.video?.cancelVideoFrameCallback?.(this.frameCallback)
    this.frameCallback = null
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }
  private schedule() {
    if (this.closed || this.snapshot.paused || !this.model || !this.video || this.inFlight || this.frameCallback !== null || this.timer !== null || this.snapshot.error) return
    const video = this.video
    if (typeof video.requestVideoFrameCallback === 'function') {
      this.frameCallback = video.requestVideoFrameCallback((_, metadata) => {
        this.frameCallback = null
        void this.analyze(metadata.mediaTime)
      })
    } else {
      // currentTime is checked in analyze: frozen frames are never reclassified.
      this.timer = setTimeout(() => { this.timer = null; void this.analyze(video.currentTime) }, 100)
    }
  }
  private async analyze(mediaTime: number) {
    const video = this.video, model = this.model, canvas = this.canvas, sessionId = this.sessionId
    if (this.closed || this.snapshot.paused || this.inFlight || !video || !model || !canvas || !sessionId) return
    if (activeInference !== null) { this.schedule(); return }
    const now = performance.now()
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight || mediaTime === this.previousMediaTime || now - this.lastStarted < this.intervalMs) { this.schedule(); return }
    const width = video.videoWidth, height = video.videoHeight
    const scale = Math.min(1, 640 / width)
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) { this.update({ modelState: 'error', error: 'canvas', frame: null }); return }
    this.inFlight = true
    const inferenceOwner = Symbol('camera-inference')
    activeInference = inferenceOwner
    this.lastStarted = now
    this.previousMediaTime = mediaTime
    const epoch = this.epoch
    const frameTimestamp = Date.now()
    this.pendingFrameTimestamp = frameTimestamp
    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const started = performance.now()
      const raw = await model.detect(canvas, 20, 0.5)
      const inferenceMs = performance.now() - started
      const completedAt = Date.now()
      // Leave headroom for the preview, input and other UI. Slow devices reduce
      // their analysis frequency instead of accumulating requests.
      this.intervalMs = Math.min(2500, Math.max(333, inferenceMs * 1.5))
      if (this.closed || epoch !== this.epoch || this.snapshot.paused || video.videoWidth !== width || video.videoHeight !== height) return
      const detections = raw.filter(item => isSupportedTarget(item.class) && Number.isFinite(item.score) && item.score >= 0.5 && item.bbox.every(Number.isFinite) && item.bbox[2] > 0 && item.bbox[3] > 0).map(item => ({
        label: item.class as import('./detections').SupportedTarget,
        score: item.score,
        bbox: [item.bbox[0] * width / canvas.width, item.bbox[1] * height / canvas.height, item.bbox[2] * width / canvas.width, item.bbox[3] * height / canvas.height] as Box,
        cameraSessionId: sessionId, frameTimestamp,
      }))
      const frame: DetectionFrame = { cameraSessionId: sessionId, frameTimestamp, completedAt, width, height, detections: stabilizeDetections(detections, this.snapshot.frame, frameTimestamp) }
      const fresh = isFreshFrame(frame, sessionId, completedAt, this.staleMs)
      this.completedTimes.push(completedAt)
      this.update({ frame: fresh ? frame : null, stale: !fresh, lastFrameTimestamp: frameTimestamp, inferenceMs, inputWidth: canvas.width, inputHeight: canvas.height })
    } catch {
      this.update({ modelState: 'error', error: 'inference', frame: null })
    } finally {
      releaseInference(inferenceOwner)
      this.pendingFrameTimestamp = null
      this.inFlight = false
      if (this.closed) this.releaseModel()
      else this.schedule()
    }
  }
  private releaseModel() {
    try { this.model?.dispose() } catch { /* Context loss can invalidate a model before cleanup. */ }
    this.model = null
    if (this.canvas) { this.canvas.width = 0; this.canvas.height = 0 }
    this.canvas = null
  }
  dispose() {
    this.closed = true
    this.epoch++
    this.cancelWait?.()
    this.cancelSchedule()
    if (this.freshnessTimer !== null) clearInterval(this.freshnessTimer)
    this.freshnessTimer = null
    if (!this.inFlight) this.releaseModel()
    this.video = null
    this.sessionId = null
    this.listeners.clear()
  }
}
