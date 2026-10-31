export type OcrLanguage = 'eng' | 'spa'
export interface OcrProgress { status: string; progress: number }
export interface OcrResult { text: string; confidence: number; uncertain: boolean }
export interface CropPercent { left: number; top: number; right: number; bottom: number }
export const FULL_CROP: CropPercent = { left: 0, top: 0, right: 100, bottom: 100 }
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024
export const MAX_SNAPSHOT_EDGE = 2400

export function cropRectangle(width: number, height: number, crop: CropPercent) {
  if (![width, height, crop.left, crop.top, crop.right, crop.bottom].every(Number.isFinite) || width < 1 || height < 1) throw new Error('Invalid image dimensions or crop.')
  const left = Math.max(0, Math.min(width - 1, Math.floor(width * crop.left / 100)))
  const top = Math.max(0, Math.min(height - 1, Math.floor(height * crop.top / 100)))
  const right = Math.max(left + 1, Math.min(width, Math.ceil(width * crop.right / 100)))
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil(height * crop.bottom / 100)))
  return { left, top, width: right - left, height: bottom - top }
}

export function createSnapshot(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): HTMLCanvasElement {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth < 1 || sourceHeight < 1) throw new Error('A usable image frame is not available yet.')
  const scale = Math.min(1, MAX_SNAPSHOT_EDGE / Math.max(sourceWidth, sourceHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceWidth * scale)); canvas.height = Math.max(1, Math.round(sourceHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image processing is unavailable in this browser.')
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function drawCrop(source: HTMLCanvasElement, target: HTMLCanvasElement, crop: CropPercent): void {
  const rectangle = cropRectangle(source.width, source.height, crop)
  target.width = rectangle.width; target.height = rectangle.height
  const context = target.getContext('2d')
  if (!context) throw new Error('Image processing is unavailable in this browser.')
  context.drawImage(source, rectangle.left, rectangle.top, rectangle.width, rectangle.height, 0, 0, target.width, target.height)
}

export function snapshotBytes(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob) { reject(new Error('The photo could not be prepared.')); return }
    void blob.arrayBuffer().then(resolve, reject)
  }, 'image/png'))
}

export function assessOcrResult(text: string, confidence: number): OcrResult {
  const clean = text.trim()
  const score = Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0
  // A conservative review cue, not a calibrated probability or semantic validation.
  return { text: clean, confidence: score, uncertain: !clean || score < 70 }
}

interface PendingOcr {
  resolve: (result: OcrResult) => void
  reject: (error: Error) => void
  onProgress: (progress: OcrProgress) => void
}

/** One reusable worker per sign-reading panel. The supervisor owns its Tesseract child;
 * termination also ends initialization/downloads, before createWorker has resolved. */
export class OcrService {
  private worker: Worker | null = null
  private pending: PendingOcr | null = null
  private timeout: ReturnType<typeof setTimeout> | null = null
  constructor(private readonly workerFactory: () => Worker = () => new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' }), private readonly corePath?: string) {}

  recognize(bytes: ArrayBuffer, language: OcrLanguage, onProgress: (progress: OcrProgress) => void): Promise<OcrResult> {
    if (this.pending) return Promise.reject(new Error('Recognition is already running.'))
    if (!this.worker) {
      const worker = this.workerFactory()
      this.worker = worker
      worker.onmessage = (event: MessageEvent<{ type: string; text?: string; confidence?: number; status?: string; progress?: number }>) => {
        const data = event.data
        if (this.worker !== worker || !this.pending) return
        if (data.type === 'progress') this.pending.onProgress({ status: data.status ?? '', progress: Math.max(0, Math.min(1, data.progress ?? 0)) })
        else if (data.type === 'result') {
          const pending = this.pending; this.pending = null; this.clearTimeout()
          pending.resolve(assessOcrResult(data.text ?? '', data.confidence ?? 0))
        } else if (data.type === 'error') this.fail(new Error('Recognition failed. Check the language-data download, then retry with a clear photo.'))
      }
      worker.onerror = () => { if (this.worker === worker) this.fail(new Error('The OCR worker could not start. Check network access and browser worker permissions.')) }
      worker.onmessageerror = () => { if (this.worker === worker) this.fail(new Error('The OCR worker returned unreadable data. Please retry.')) }
    }
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, onProgress }
      this.timeout = setTimeout(() => this.fail(new Error('Recognition timed out. Check the connection for language downloads and try a smaller photo.')), 120_000)
      try { this.worker!.postMessage({ type: 'recognize', bytes, language, corePath: this.corePath ?? new URL(`${import.meta.env.BASE_URL}vision/tesseract/`, window.location.origin).href }, [bytes]) }
      catch { this.fail(new Error('The photo could not be sent to the local OCR worker.')) }
    })
  }

  cancel(): void { this.fail(new DOMException('Recognition cancelled.', 'AbortError')) }
  dispose(): void { this.cancel() }
  private clearTimeout() { if (this.timeout) clearTimeout(this.timeout); this.timeout = null }
  private fail(error: Error) {
    this.clearTimeout()
    this.worker?.terminate(); this.worker = null
    const pending = this.pending; this.pending = null
    pending?.reject(error)
  }
}
