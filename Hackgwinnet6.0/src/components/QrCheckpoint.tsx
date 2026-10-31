import { useEffect, useId, useRef, useState } from 'react'
import { QrCode, Square } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { checkpoints, lookupManualCheckpoint, validateCheckpointPayload, type Checkpoint, type CheckpointValidation } from '../navigation/checkpoints'
import { QrScanner } from '../vision/qr'
import type { CameraToolProps } from './SignReader'
import { Button } from './ui'
import './VisionTools.css'

export function QrCheckpoint({ video, onBusyChange }: CameraToolProps) {
  const { language, lastConfirmedCheckpoint, setLastConfirmedCheckpoint, setDataMode, setRouteSelection, navigate } = useApp()
  const tr = (en: string, es: string) => language === 'es' ? es : en
  const id = useId()
  const scanner = useRef<QrScanner | null>(null)
  const operation = useRef(0)
  const busyCallback = useRef(onBusyChange); busyCallback.current = onBusyChange
  const [scanning, setScanning] = useState(false)
  const [candidate, setCandidate] = useState<{ checkpoint: Checkpoint; method: 'qr' | 'manual' } | null>(null)
  const [manual, setManual] = useState('entrance')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  useEffect(() => { busyCallback.current?.(scanning) }, [scanning])
  useEffect(() => () => { operation.current += 1; scanner.current?.stop(); busyCallback.current?.(false) }, [])
  useEffect(() => { operation.current += 1; scanner.current?.stop(); setScanning(false) }, [video])

  const accept = (validation: CheckpointValidation, method: 'qr' | 'manual') => {
    setScanning(false); setFeedback('')
    if (validation.ok) { setCandidate({ checkpoint: validation.checkpoint, method }); setError('') }
    else {
      setCandidate(null)
      const errors = {
        format: tr('This is not an allowed CareNori checkpoint label. No link was opened.', 'Esta no es una etiqueta de punto CareNori permitida. No se abrió ningún enlace.'),
        site: tr('This site is not in the local checkpoint repository.', 'Este sitio no está en el repositorio local de puntos.'),
        revision: tr('This label revision is not supported by the local dataset. Ask the pilot organizer to check the label.', 'La revisión de esta etiqueta no coincide con los datos locales. Pide al organizador que revise la etiqueta.'),
        checkpoint: tr('Checkpoint not found. Choose one of the four demo labels.', 'No se encontró el punto. Elige una de las cuatro etiquetas de demostración.'),
      }
      setError(errors[validation.reason])
    }
  }
  const stop = () => { operation.current += 1; scanner.current?.stop(); setScanning(false); setFeedback(tr('QR scanning stopped.', 'Escaneo QR detenido.')) }
  const scan = () => {
    if (!video) return
    const current = ++operation.current
    setScanning(true); setCandidate(null); setError(''); setFeedback('')
    scanner.current ??= new QrScanner()
    void scanner.current.start(video, {
      onResult: text => { if (current === operation.current) accept(validateCheckpointPayload(text), 'qr') },
      onError: failure => { if (current === operation.current) { setScanning(false); setError(tr(failure.message, 'Se detuvo el escaneo. Revisa la cámara y la conexión, o introduce el punto manualmente.')) } },
    })
  }

  return <section className="vision-tool" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>{tr('QR checkpoints', 'Puntos QR')}</h2>
    <p className="vision-warning"><strong>{tr('Controlled demo only.', 'Solo demostración controlada.')}</strong> {tr('These synthetic labels are not installed at Grady. No surveyed hospital route or room position is available.', 'Estas etiquetas sintéticas no están instaladas en Grady. No hay rutas hospitalarias medidas ni posición de habitaciones.')}</p>
    <p>{tr('Scan a prepared label using the current camera. Review its name before confirming a starting checkpoint. A copied QR does not independently prove your location.', 'Escanea una etiqueta preparada con la cámara actual. Revisa el nombre antes de confirmar un punto de partida. Un QR copiado no demuestra por sí solo tu ubicación.')}</p>
    <div className="vision-actions"><Button onClick={scan} disabled={!video || scanning}><QrCode size={18} aria-hidden="true" />{tr('Scan checkpoint', 'Escanear punto')}</Button><Button variant="secondary" onClick={stop} disabled={!scanning}><Square size={18} aria-hidden="true" />{tr('Stop QR scanning', 'Detener escaneo QR')}</Button><a className="btn btn-secondary" href={`${import.meta.env.BASE_URL}demo-checkpoints/labels.html`} target="_blank" rel="noreferrer">{tr('Printable demo QR labels', 'Etiquetas QR de demostración para imprimir')}</a></div>
    {scanning && <p role="status">{tr('Scanning current camera frames. Hold the label in view while stationary.', 'Escaneando imágenes actuales de la cámara. Mantén la etiqueta visible sin caminar.')}</p>}
    {!video && <p>{tr('Start the camera above to scan, or enter a checkpoint manually.', 'Inicia la cámara arriba para escanear, o introduce un punto manualmente.')}</p>}
    <form className="qr-manual" onSubmit={event => { event.preventDefault(); stop(); accept(lookupManualCheckpoint(manual), 'manual') }}><label htmlFor={`${id}-manual`}>{tr('Manual checkpoint ID or payload', 'ID o contenido del punto manual')}<input id={`${id}-manual`} list={`${id}-choices`} value={manual} maxLength={160} onChange={event => setManual(event.target.value)} /></label><datalist id={`${id}-choices`}>{checkpoints.map(checkpoint => <option key={checkpoint.id} value={checkpoint.id}>{language === 'es' ? checkpoint.nameEs : checkpoint.name}</option>)}</datalist><Button type="submit" variant="secondary" disabled={!manual.trim()}>{tr('Look up checkpoint', 'Buscar punto')}</Button></form>
    <p className="muted">{tr('Demo IDs: entrance, reception, waiting, help-desk.', 'IDs de demostración: entrance, reception, waiting, help-desk.')}</p>
    {error && <p className="vision-error" role="alert">{error}</p>}
    {feedback && <p role="status">{feedback}</p>}
    {candidate && <div className="qr-confirm"><h3>{tr('Review starting checkpoint', 'Revisar punto de partida')}</h3><p><strong>{language === 'es' ? candidate.checkpoint.nameEs : candidate.checkpoint.name}</strong> · {tr('Demo', 'Demostración')} · r{candidate.checkpoint.revision}</p><p>{tr('Confirm only if you intend to use this demo checkpoint. This does not start live location tracking.', 'Confirma solo si deseas usar este punto de demostración. Esto no inicia seguimiento de ubicación.')}</p><div className="vision-actions"><Button onClick={() => { setLastConfirmedCheckpoint({ checkpoint: candidate.checkpoint, method: candidate.method, confirmedAt: new Date().toISOString() }); setCandidate(null); setFeedback(tr('Demo checkpoint confirmed for this session.', 'Punto de demostración confirmado para esta sesión.')) }}>{tr('Confirm starting checkpoint', 'Confirmar punto de partida')}</Button><Button variant="secondary" onClick={() => setCandidate(null)}>{tr('Cancel', 'Cancelar')}</Button></div></div>}
    {lastConfirmedCheckpoint && <div className="qr-confirmed"><h3>{tr('Last confirmed checkpoint', 'Último punto confirmado')}</h3><p><strong>{language === 'es' ? lastConfirmedCheckpoint.checkpoint.nameEs : lastConfirmedCheckpoint.checkpoint.name}</strong> · {tr('Demo', 'Demostración')}</p><p><time dateTime={lastConfirmedCheckpoint.confirmedAt}>{new Date(lastConfirmedCheckpoint.confirmedAt).toLocaleString(language === 'es' ? 'es' : 'en')}</time> · {lastConfirmedCheckpoint.method === 'qr' ? tr('QR scan + confirmation', 'Escaneo QR + confirmación') : tr('Manual entry + confirmation', 'Entrada manual + confirmación')}</p><p>{tr('This is a past confirmation, not continuous position. The demo graph is authored and has not been surveyed.', 'Esta es una confirmación anterior, no una posición continua. El grafo de demostración fue creado y no se ha medido.')}</p><div className="vision-actions"><Button variant="secondary" onClick={() => { setDataMode('demo'); setRouteSelection(previous => ({ ...previous, start: lastConfirmedCheckpoint.checkpoint.routeNodeId, active: false })); navigate('explore') }}>{tr('Open demo route from checkpoint', 'Abrir ruta de demostración desde el punto')}</Button><Button variant="secondary" onClick={() => setLastConfirmedCheckpoint(null)}>{tr('Clear checkpoint', 'Borrar punto')}</Button></div></div>}
    <details className="vision-details"><summary>{tr('Prepare an authorized pilot', 'Preparar un piloto autorizado')}</summary><p>{tr('With venue permission, place each printed label at its named, checked location. Before real routing, survey each segment, record measurements and sources, replace the demo graph and revision, then physically verify labels and route constraints. These supplied labels remain a synthetic demo.', 'Con permiso del lugar, coloca cada etiqueta impresa en su ubicación nombrada y comprobada. Antes de usar rutas reales, mide cada tramo, registra medidas y fuentes, reemplaza el grafo y la revisión de demostración y verifica físicamente las etiquetas y restricciones. Estas etiquetas siguen siendo una demostración sintética.')}</p></details>
  </section>
}
