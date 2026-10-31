export interface QrScanCallbacks { onResult: (text: string) => void; onError: (error: Error) => void }
export interface QrDecoder { decodeFromCanvas: (canvas: HTMLCanvasElement) => { getText: () => string } }

/** Reads copies of frames only; CameraService remains the sole stream owner. */
export class QrScanner {
  private generation = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private canvas: HTMLCanvasElement | null = null
  constructor(private readonly loadDecoder: () => Promise<QrDecoder> = async () => {
    const { BrowserQRCodeReader } = await import('@zxing/browser')
    return new BrowserQRCodeReader()
  }) {}

  async start(video: HTMLVideoElement, callbacks: QrScanCallbacks): Promise<void> {
    this.stop()
    const generation = this.generation
    try {
      const reader = await this.loadDecoder()
      if (generation !== this.generation) return
      const canvas = document.createElement('canvas')
      this.canvas = canvas
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('QR image processing is unavailable in this browser.')
      let lastTime = -1
      let missedFrames = 0
      const scan = () => {
        if (generation !== this.generation) return
        if (document.hidden) { this.stop(); callbacks.onError(new Error('QR scanning stopped while this page was hidden.')); return }
        if (video.readyState < 2 || !video.videoWidth || video.currentTime === lastTime) {
          missedFrames += 1
          if (missedFrames >= 40) { this.stop(); callbacks.onError(new Error('No new camera frames. Restart the camera, then scan again.')); return }
          this.timer = setTimeout(scan, 250); return
        }
        missedFrames = 0; lastTime = video.currentTime
        const scale = Math.min(1, 960 / video.videoWidth)
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        try {
          context.drawImage(video, 0, 0, canvas.width, canvas.height)
          const result = reader.decodeFromCanvas(canvas).getText()
          this.stop(); callbacks.onResult(result); return
        } catch (error) {
          // ZXing reports expected absence/damaged symbols as these exception names.
          const name = error && typeof error === 'object' && 'getKind' in error && typeof error.getKind === 'function'
            ? error.getKind() : error instanceof Error ? error.name : ''
          if (!['NotFoundException', 'ChecksumException', 'FormatException'].includes(name)) {
            this.stop(); callbacks.onError(new Error('QR decoding failed. Try a clearer view or enter the checkpoint manually.')); return
          }
        }
        this.timer = setTimeout(scan, 300)
      }
      scan()
    } catch { if (generation === this.generation) { this.stop(); callbacks.onError(new Error('The QR decoder could not load. Check the connection or enter the checkpoint manually.')) } }
  }

  stop(): void {
    this.generation += 1
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.canvas) { this.canvas.width = 0; this.canvas.height = 0; this.canvas = null }
  }
}
