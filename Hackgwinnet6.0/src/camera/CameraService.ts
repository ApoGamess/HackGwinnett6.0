export type CameraPhase = 'idle' | 'requesting' | 'starting' | 'active' | 'paused' | 'unavailable' | 'error'
export type CameraError = 'insecure' | 'unsupported' | 'denied' | 'missing' | 'busy' | 'constraints' | 'preview' | 'ended' | 'unknown'
export interface CameraSnapshot {
  phase: CameraPhase
  sessionId: string | null
  devices: { id: string; label: string }[]
  deviceId: string
  mirrored: boolean
  width: number
  height: number
  error: CameraError | null
  hidden: boolean
  permissionPending: boolean
}
export const initialCameraSnapshot = (): CameraSnapshot => ({ phase: 'idle', sessionId: null, devices: [], deviceId: '', mirrored: false, width: 0, height: 0, error: null, hidden: false, permissionPending: false })
export function classifyCameraError(error: unknown): CameraError {
  const name = error instanceof Error || (error && typeof error === 'object' && 'name' in error) ? String(error.name) : ''
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied'
    : name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'missing'
    : name === 'NotReadableError' || name === 'TrackStartError' ? 'busy'
    : name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError' ? 'constraints' : 'unknown'
}
type CameraEnvironment = { mediaDevices?: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'>; secure: boolean }

/** The single owner of the camera. OCR and QR receive its preview, never its stream ownership. */
export class CameraService {
  private snapshot = initialCameraSnapshot()
  private listeners = new Set<(snapshot: CameraSnapshot) => void>()
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private generation = 0
  private pending: Promise<void> | null = null
  private cancelReady: (() => void) | null = null
  private trackCleanup: (() => void) | null = null
  private visibilityCleanup: (() => void) | null = null
  constructor(private environment: CameraEnvironment = { mediaDevices: navigator.mediaDevices, secure: window.isSecureContext }) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: (snapshot: CameraSnapshot) => void) => {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => { this.listeners.delete(listener) }
  }
  private update(patch: Partial<CameraSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach(listener => listener(this.snapshot))
  }
  watchVisibility(document: Document) {
    this.visibilityCleanup?.()
    const onVisibility = () => { if (document.hidden && (this.stream || this.pending)) this.stop(true) }
    document.addEventListener('visibilitychange', onVisibility)
    this.visibilityCleanup = () => document.removeEventListener('visibilitychange', onVisibility)
  }
  start(video: HTMLVideoElement, deviceId?: string): Promise<void> {
    // getUserMedia cannot be aborted. A stopped request still owns this gate until
    // permission settles, and its eventual tracks will be stopped immediately.
    if (this.pending) return this.pending
    this.stop()
    if (!this.environment.secure) { this.update({ phase: 'unavailable', error: 'insecure' }); return Promise.resolve() }
    if (!this.environment.mediaDevices?.getUserMedia) { this.update({ phase: 'unavailable', error: 'unsupported' }); return Promise.resolve() }
    const generation = this.generation
    this.video = video
    this.update({ phase: 'requesting', permissionPending: true, error: null, hidden: false })
    this.pending = this.open(video, generation, deviceId).finally(() => {
      this.pending = null
      this.update({ permissionPending: false })
    })
    return this.pending
  }
  private async open(video: HTMLVideoElement, generation: number, deviceId?: string) {
    const media = this.environment.mediaDevices!
    let acquired: MediaStream | null = null
    try {
      try {
        acquired = await media.getUserMedia({ audio: false, video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 1280 }, height: { ideal: 720 } } })
      } catch (error) {
        if (generation !== this.generation) return
        if (classifyCameraError(error) !== 'constraints' || deviceId) throw error
        acquired = await media.getUserMedia({ video: true, audio: false })
      }
      if (generation !== this.generation) { acquired.getTracks().forEach(track => track.stop()); return }
      this.stream = acquired
      this.update({ phase: 'starting', permissionPending: false })
      const track = acquired.getVideoTracks()[0]
      if (!track) throw new DOMException('No video track', 'NotFoundError')
      const settings = track.getSettings()
      const ended = () => { this.stop(); this.update({ phase: 'error', error: 'ended' }) }
      track.addEventListener('ended', ended)
      this.trackCleanup = () => track.removeEventListener('ended', ended)
      video.muted = true
      video.playsInline = true
      video.srcObject = acquired
      await video.play()
      if (generation !== this.generation) return
      const ready = await this.waitForFrame(video, generation)
      if (!ready || generation !== this.generation) return
      this.update({ phase: 'active', sessionId: crypto.randomUUID(), width: video.videoWidth, height: video.videoHeight, deviceId: settings.deviceId ?? deviceId ?? '', mirrored: settings.facingMode === 'user' })
      // Device labels are exposed only after permission. Enumeration failure does
      // not discard an otherwise usable stream.
      void Promise.resolve().then(() => media.enumerateDevices?.() ?? []).then(devices => {
        if (generation === this.generation) this.update({ devices: devices.filter(device => device.kind === 'videoinput').map((device, index) => ({ id: device.deviceId, label: device.label || `Camera ${index + 1}` })) })
      }).catch(() => { /* Camera switching is optional on browsers without enumeration. */ })
    } catch (error) {
      if (generation !== this.generation) return
      const code = this.snapshot.phase === 'starting' && classifyCameraError(error) === 'unknown' ? 'preview' : classifyCameraError(error)
      this.stop()
      this.update({ phase: code === 'missing' ? 'unavailable' : 'error', error: code })
    }
  }
  private waitForFrame(video: HTMLVideoElement, generation: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let settled = false
      const cleanup = () => { clearInterval(timer); clearTimeout(timeout); this.cancelReady = null }
      const finish = (ready: boolean) => { if (settled) return; settled = true; cleanup(); resolve(ready) }
      const timer = setInterval(() => {
        if (generation !== this.generation) finish(false)
        else if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) finish(true)
      }, 40)
      const timeout = setTimeout(() => { if (!settled) { settled = true; cleanup(); reject(new Error('No usable camera frame')) } }, 12_000)
      this.cancelReady = () => finish(false)
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) finish(true)
    })
  }
  setAnalysisPaused(paused: boolean) {
    if (this.stream && (this.snapshot.phase === 'active' || this.snapshot.phase === 'paused')) this.update({ phase: paused ? 'paused' : 'active' })
  }
  stop(hidden = false) {
    this.generation++
    this.cancelReady?.()
    this.trackCleanup?.()
    this.trackCleanup = null
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
    if (this.video) { this.video.pause(); this.video.srcObject = null }
    this.video = null
    this.update({ phase: hidden ? 'paused' : 'idle', sessionId: null, width: 0, height: 0, hidden, error: null })
  }
  dispose() {
    this.stop()
    this.visibilityCleanup?.()
    this.visibilityCleanup = null
    this.listeners.clear()
  }
}
