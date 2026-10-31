import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Camera, MessageCircle, Pause, Play, Square, Volume2 } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { useSpeech } from '../hooks/useSpeech'
import { Button, PageHeading } from '../components/ui'
import { CameraService, initialCameraSnapshot } from '../camera/CameraService'
import { DetectionService, initialAnalysisSnapshot } from '../camera/DetectionService'
import { isFreshFrame, STALE_RESULT_MS, SUPPORTED_TARGETS, type SupportedTarget } from '../camera/detections'
import { imageSide, transformBox } from '../camera/geometry'
import { cameraErrorText, cameraPhaseText, cameraText, describeFrame, resolveTarget, targetLabel } from '../camera/i18n'
import './CameraAssistance.css'

const SignReader = lazy(() => import('../components/SignReader').then(module => ({ default: module.SignReader })))
const QrCheckpoint = lazy(() => import('../components/QrCheckpoint').then(module => ({ default: module.QrCheckpoint })))

export default function CameraAssistance() {
  const { language, navigationPlace, navigate, setCommunicationOpen, setMessage, t } = useApp()
  const c = (text: string) => cameraText(language, text)
  const [cameraService] = useState(() => new CameraService())
  const [camera, setCamera] = useState(initialCameraSnapshot)
  const [analysis, setAnalysis] = useState(initialAnalysisSnapshot)
  const [mode, setMode] = useState<'objects' | 'sign' | 'qr'>('objects')
  const [busy, setBusy] = useState(false)
  const [modelRevision, setModelRevision] = useState(0)
  const [target, setTarget] = useState<SupportedTarget>('chair')
  const [query, setQuery] = useState('')
  const [unsupported, setUnsupported] = useState(false)
  const [requestedTarget, setRequestedTarget] = useState<SupportedTarget | null | undefined>(undefined)
  const [viewport, setViewport] = useState({ width: 640, height: 400 })
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const video = useRef<HTMLVideoElement>(null)
  const view = useRef<HTMLDivElement>(null)
  const detector = useRef<DetectionService | null>(null)
  const lastSpoken = useRef({ text: '', time: 0 })
  const speech = useSpeech(language)
  const hasStream = !!camera.sessionId
  const analysisPaused = camera.phase === 'paused' || mode !== 'objects' || busy
  const fresh = !analysisPaused && isFreshFrame(analysis.frame, camera.sessionId) && (!dimensions.width || analysis.frame.width === dimensions.width && analysis.frame.height === dimensions.height)
  const frame = fresh ? analysis.frame : null
  const observation = frame && requestedTarget !== undefined ? describeFrame(frame, requestedTarget, camera.mirrored, language) : ''
  const onBusyChange = useCallback((value: boolean) => setBusy(value), [])

  useEffect(() => {
    const unsubscribe = cameraService.subscribe(setCamera)
    cameraService.watchVisibility(document)
    return () => { unsubscribe(); cameraService.dispose() }
  }, [cameraService])
  useEffect(() => {
    if (!camera.sessionId || !video.current || mode !== 'objects') { setAnalysis(initialAnalysisSnapshot()); return }
    const service = new DetectionService()
    detector.current = service
    const unsubscribe = service.subscribe(setAnalysis)
    service.setPaused(camera.phase === 'paused')
    void service.start(video.current, camera.sessionId)
    return () => { unsubscribe(); service.dispose(); detector.current = null }
  }, [camera.sessionId, mode, modelRevision])
  useEffect(() => { detector.current?.setPaused(analysisPaused) }, [analysisPaused])
  useEffect(() => {
    const element = view.current
    if (!element) return
    const resize = () => { const rect = element.getBoundingClientRect(); setViewport({ width: rect.width, height: rect.height }) }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if ((!fresh || mode !== 'objects') && speech.speaking) speech.stop()
  }, [fresh, mode, speech.speaking])
  useEffect(() => { setRequestedTarget(undefined); setBusy(false) }, [camera.sessionId, mode])
  const start = () => { if (video.current) { setRequestedTarget(undefined); void cameraService.start(video.current) } }
  const stop = () => { speech.stop(); cameraService.stop(); setRequestedTarget(undefined) }
  const describe = (selected: SupportedTarget | null) => {
    if (!isFreshFrame(analysis.frame, camera.sessionId) || analysisPaused) return
    setRequestedTarget(selected)
    setUnsupported(false)
  }
  const find = () => {
    const selected = query.trim() ? resolveTarget(query) : target
    if (!selected) { setUnsupported(true); setRequestedTarget(undefined); return }
    setTarget(selected)
    describe(selected)
  }
  const sayObservation = () => {
    // Re-check at the click, not merely at render time; stale speech is suppressed.
    if (!isFreshFrame(analysis.frame, camera.sessionId) || analysisPaused || requestedTarget === undefined) return
    const text = describeFrame(analysis.frame, requestedTarget, camera.mirrored, language)
    if (lastSpoken.current.text === text && Date.now() - lastSpoken.current.time < 2000) return
    lastSpoken.current = { text, time: Date.now() }
    speech.speak(text) // useSpeech cancels any queued utterance before speaking.
  }
  const unavailable = analysis.error === 'model-delay' ? (language === 'es' ? 'La descarga del modelo está tardando. Puedes detener la cámara y usar lectura de letreros o comunicación escrita. El modelo se liberará si llega después de salir; recargar la página borra el plan de esta sesión.' : 'The model download is taking longer than expected. You can stop the camera and use sign reading or typed communication. A model arriving after you leave is released; reloading the page clears this session’s plan.')
    : analysis.error ? c(analysis.error === 'model-load' ? 'The object model could not load. Check your connection and retry analysis. You can still use the camera preview, sign reading, and typed communication.' : 'Object analysis failed. Retry analysis or use sign reading and typed communication.')
    : !hasStream ? c('Start the camera to analyze its view.')
    : analysisPaused ? c('Analysis paused. The camera preview remains on.')
    : analysis.stale ? c('Analysis delayed. Previous observations are no longer current.')
    : analysis.modelState === 'loading' ? c('Loading object model…') : c('Waiting for a new camera frame…')

  return <div className="camera-page">
    <PageHeading eyebrow={c('Your visit')} title={c('Camera assistance')} description={c('Read signs, find supported objects, and prepare a question.')}>
      <Button variant="secondary" onClick={() => setCommunicationOpen(true)}><MessageCircle size={18} aria-hidden="true" />{c('Help me communicate')}</Button>
    </PageHeading>
    <div className="camera-context"><span>{navigationPlace ? `${c('Selected place')}: ${navigationPlace.name}${navigationPlace.fictional ? ` · ${t('Demo')}` : ''}` : c('Your visit')}</span><Button variant="ghost" onClick={() => navigate('explore')}>{c('Open map')}</Button></div>
    <p className="camera-limitation">{c('Camera assistance can miss objects. It does not determine whether a path is safe.')}</p>
    <section className="camera-shell" aria-label={c('Camera preview')}>
      <div className="camera-view" ref={view}>
        <video ref={video} autoPlay muted playsInline aria-label={c('Camera preview')} className={camera.mirrored ? 'camera-mirrored' : ''} onResize={() => { if (video.current) setDimensions({ width: video.current.videoWidth, height: video.current.videoHeight }) }} />
        {!hasStream && <div className="camera-placeholder"><Camera size={40} aria-hidden="true" /><span>{camera.phase === 'requesting' || camera.phase === 'starting' ? cameraPhaseText(camera.phase, language) : c('Camera is off')}</span></div>}
        {frame && <svg className="camera-boxes" viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-hidden="true">
          {frame.detections.map((item, index) => {
            const [x, y, width, height] = transformBox(item.bbox, frame, viewport, { mirrored: camera.mirrored })
            const highlighted = requestedTarget === item.label
            return <g key={`${item.label}-${index}`} className={highlighted ? 'camera-target-box' : ''}>
              <rect x={x} y={y} width={width} height={height} />
              <text x={Math.max(4, x + 5)} y={Math.max(18, y + 19)}>{targetLabel(item.label, language)} · {item.score.toFixed(2)}</text>
            </g>
          })}
        </svg>}
      </div>
      <div className="camera-controls">
        <p className="camera-state" role="status">{c('Camera state')}: <strong>{cameraPhaseText(camera.phase, language)}</strong></p>
        <div className="camera-actions">
          <Button onClick={start} disabled={hasStream || camera.permissionPending || camera.phase === 'starting'}><Play size={17} aria-hidden="true" />{c(camera.hidden ? 'Resume camera' : 'Start camera')}</Button>
          <Button variant="secondary" onClick={() => cameraService.setAnalysisPaused(camera.phase !== 'paused')} disabled={!hasStream || mode !== 'objects'}><Pause size={17} aria-hidden="true" />{c(camera.phase === 'paused' ? 'Resume analysis' : 'Pause analysis')}</Button>
          <Button variant="secondary" onClick={stop} disabled={!hasStream && !camera.permissionPending && camera.phase !== 'starting'}><Square size={16} aria-hidden="true" />{c('Stop camera')}</Button>
        </div>
        {camera.devices.length > 1 && <label className="camera-device">{c('Camera device')}<select aria-label={c('Switch camera')} value={camera.deviceId} disabled={camera.permissionPending || camera.phase === 'starting'} onChange={event => { speech.stop(); if (video.current) void cameraService.start(video.current, event.target.value) }}>{camera.devices.map(device => <option key={device.id} value={device.id}>{device.label}</option>)}</select></label>}
        {camera.permissionPending && <p>{c('Waiting for camera permission. A pending browser prompt cannot be canceled here; Stop will release any stream it later grants.')}</p>}
        {camera.hidden && <p role="status">{c('Camera released while the app was hidden. Resume when you are ready.')}</p>}
        {camera.error && <p role="alert" className="camera-error">{cameraErrorText(camera.error, language)}</p>}
        <p className="camera-privacy">{c('Video only. Frames are processed on this device and are not saved or uploaded. Starting object analysis downloads a model; sign reading downloads language data. Network access is needed for uncached assets.')}</p>
      </div>
    </section>
    <div className="camera-modes" role="group" aria-label={c('Camera tools')}>
      {(['objects', 'sign', 'qr'] as const).map(item => <Button key={item} variant={mode === item ? 'primary' : 'secondary'} aria-pressed={mode === item} onClick={() => { speech.stop(); setMode(item) }}>{c(item === 'objects' ? 'Objects' : item === 'sign' ? 'Read a sign' : 'QR checkpoint')}</Button>)}
    </div>
    {mode === 'objects' ? <div className="camera-object-layout">
      <section className="camera-panel" aria-labelledby="camera-find-title">
        <h2 id="camera-find-title">{c('Find an object')}</h2>
        <label>{c('Object to find')}<select value={target} onChange={event => { setTarget(event.target.value as SupportedTarget); setQuery(''); setUnsupported(false) }}>{SUPPORTED_TARGETS.map(label => <option key={label} value={label}>{targetLabel(label, language)}</option>)}</select></label>
        <label>{c('Search supported objects')}<input value={query} onChange={event => { setQuery(event.target.value); setUnsupported(false) }} onKeyDown={event => { if (event.key === 'Enter') find() }} /></label>
        <div className="camera-actions"><Button onClick={find}>{c('Find an object')}</Button><Button variant="secondary" disabled={!frame} onClick={() => describe(null)}>{c('Describe this view')}</Button><Button variant="secondary" disabled={!frame} onClick={() => { setTarget('person'); setQuery(''); describe('person') }}>{c('Find a person in view')}</Button></div>
        {unsupported && <p role="status" className="camera-error">{c('Use a listed object, map search, sign reading, or typed assistance. This camera tool does not recognize that target.')}</p>}
        <p className="camera-note">{c('This tool uses a selected subset of COCO-SSD classes. A chair is not a wheelchair. It does not identify roles, doors, ramps, stairs, medical conditions, or safe walking space.')}</p>
      </section>
      <section className="camera-panel" aria-labelledby="camera-observations-title">
        <p className="eyebrow">{c('Model observations · COCO-SSD')}</p><h2 id="camera-observations-title">{c('Current observations')}</h2>
        {!frame && <p role={analysis.error ? 'alert' : 'status'}>{unavailable}</p>}
        {analysis.error && analysis.error !== 'model-delay' && <Button variant="secondary" onClick={() => setModelRevision(value => value + 1)}>{c('Retry analysis')}</Button>}
        {frame && <>
          {frame.detections.length ? <ul className="camera-result-list">{frame.detections.map((item, index) => <li key={`${item.label}-${index}`}><strong>{targetLabel(item.label, language)}</strong><span>{c(imageSide(item.bbox, frame.width, camera.mirrored))} · {c('Score')} {item.score.toFixed(2)}</span></li>)}</ul> : <p>{c('No supported target was detected in the latest frame.')}</p>}
          <p className="camera-note">{c('Frame age')}: {Math.max(0, Date.now() - frame.frameTimestamp)} ms</p>
        </>}
        {observation && <p className="camera-observation" role="status">{observation}</p>}
        <div className="camera-actions"><Button variant="secondary" onClick={sayObservation} disabled={!observation || !speech.supported}><Volume2 size={17} aria-hidden="true" />{c('Read observations aloud')}</Button><Button variant="ghost" disabled={!speech.speaking} onClick={speech.stop}>{c('Stop speaking')}</Button></div>
        {!speech.supported && <p>{c('Browser speech is unavailable. Use the visible text.')}</p>}
        {speech.status && <p role="status">{t(speech.status)}</p>}
        <p className="camera-note">{c('Scores are model outputs, not calibrated probabilities or safety guarantees. Image positions refer to the displayed camera view.')}</p>
      </section>
    </div> : <Suspense fallback={<p role="status">{c('loading')}…</p>}>{mode === 'sign' ? <SignReader video={hasStream ? video.current : null} onBusyChange={onBusyChange} /> : <QrCheckpoint video={hasStream ? video.current : null} onBusyChange={onBusyChange} />}</Suspense>}
    <section className="camera-next"><div><p className="eyebrow">{c('Suggested next action')}</p><h2>{c('Ask staff to confirm the route')}</h2></div><Button variant="secondary" onClick={() => { speech.stop(); setMessage(c('Could you help me find reception?')); setCommunicationOpen(true) }}>{c('Prepare a message')}</Button></section>
    <details className="camera-diagnostics"><summary>{c('Camera diagnostics')}</summary><dl>
      <div><dt>{c('Camera state')}</dt><dd>{cameraPhaseText(camera.phase, language)}</dd></div><div><dt>{c('Model state')}</dt><dd>{c(analysis.modelState)}</dd></div><div><dt>{c('Backend')}</dt><dd>{analysis.backend || c('Not loaded')}</dd></div>
      <div><dt>{c('Input resolution')}</dt><dd>{analysis.inputWidth ? `${analysis.inputWidth} × ${analysis.inputHeight}` : c('Not measured')}</dd></div><div><dt>{c('Inference duration')}</dt><dd>{analysis.inferenceMs === null ? c('Not measured') : `${Math.round(analysis.inferenceMs)} ms`}</dd></div><div><dt>{c('Completed analyses / second')}</dt><dd>{analysis.analysesPerSecond.toFixed(1)}</dd></div>
      <div><dt>{c('Latest result age')}</dt><dd>{analysis.lastFrameTimestamp === null ? c('No result') : `${Date.now() - analysis.lastFrameTimestamp} ms`}</dd></div><div><dt>{c('Stale threshold')}</dt><dd>{STALE_RESULT_MS} ms</dd></div><div><dt>{c('Session ID')}</dt><dd>{camera.sessionId ?? '—'}</dd></div><div><dt>{c('Frame timestamp')}</dt><dd>{analysis.lastFrameTimestamp ? new Date(analysis.lastFrameTimestamp).toLocaleTimeString(language) : '—'}</dd></div>
    </dl><p>{c('Inference duration and result age are measured separately. End-to-end camera latency is not measured.')}</p>{analysis.error && <p>{unavailable}</p>}</details>
  </div>
}
