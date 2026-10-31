import { useEffect, useId, useRef, useState } from 'react'
import { Camera, Copy, MessageSquare, Search, Square, Volume2 } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { useSpeech } from '../hooks/useSpeech'
import { createSnapshot, drawCrop, FULL_CROP, MAX_PHOTO_BYTES, OcrService, snapshotBytes, type CropPercent, type OcrLanguage, type OcrProgress, type OcrResult } from '../vision/ocr'
import { Modal } from './Modal'
import { Button } from './ui'
import './VisionTools.css'

export interface CameraToolProps { video: HTMLVideoElement | null; onBusyChange?: (busy: boolean) => void }

export function SignReader({ video, onBusyChange }: CameraToolProps) {
  const { language, t, addQuestion, setMessage, setCommunicationOpen, navigationPlace, setPendingPlaceQuery, setDataMode, navigate } = useApp()
  const tr = (en: string, es: string) => language === 'es' ? es : en
  const id = useId()
  const service = useRef<OcrService | null>(null)
  const sourceRef = useRef<HTMLCanvasElement | null>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const operation = useRef(0)
  const busyCallback = useRef(onBusyChange); busyCallback.current = onBusyChange
  const [source, setSource] = useState<HTMLCanvasElement | null>(null)
  const [crop, setCrop] = useState<CropPercent>({ ...FULL_CROP })
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>(language === 'es' ? 'spa' : 'eng')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [result, setResult] = useState<OcrResult | null>(null)
  const [text, setText] = useState('')
  const [question, setQuestion] = useState('')
  const [placeQuery, setPlaceQuery] = useState('')
  const [confirmSearch, setConfirmSearch] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const speech = useSpeech(ocrLanguage === 'spa' ? 'es' : 'en')

  useEffect(() => { busyCallback.current?.(busy) }, [busy])
  useEffect(() => () => {
    operation.current += 1
    service.current?.dispose(); service.current = null
    if (sourceRef.current) { sourceRef.current.width = 0; sourceRef.current.height = 0 }
    busyCallback.current?.(false)
  }, [])
  useEffect(() => {
    if (source && previewRef.current) {
      try { drawCrop(source, previewRef.current, crop) } catch { setError(tr('The crop could not be displayed. Retake the image.', 'No se pudo mostrar el recorte. Vuelve a tomar la imagen.')) }
    }
  }, [source, crop])

  const cancel = () => {
    operation.current += 1; service.current?.cancel(); setBusy(false); setProgress(null)
    setFeedback(tr('Recognition cancelled. The local photo is ready to retry.', 'Reconocimiento cancelado. La foto local está lista para reintentar.'))
  }
  useEffect(() => {
    const hidden = () => { if (document.hidden) { operation.current += 1; service.current?.cancel(); setBusy(false); setProgress(null) } }
    document.addEventListener('visibilitychange', hidden)
    return () => document.removeEventListener('visibilitychange', hidden)
  }, [])

  const replaceSource = (next: HTMLCanvasElement | null) => {
    speech.stop()
    if (sourceRef.current) { sourceRef.current.width = 0; sourceRef.current.height = 0 }
    sourceRef.current = next; setSource(next); setCrop({ ...FULL_CROP }); setResult(null)
    setText(''); setQuestion(''); setPlaceQuery(''); setError(''); setFeedback('')
  }
  const capture = () => {
    if (!video || video.readyState < 2 || video.videoWidth < 1) {
      setError(tr('Start the camera and wait for a visible frame, or choose a photo.', 'Inicia la cámara y espera una imagen visible, o elige una foto.')); return
    }
    try { replaceSource(createSnapshot(video, video.videoWidth, video.videoHeight)) }
    catch { setError(tr('This frame could not be captured. Try again.', 'No se pudo capturar esta imagen. Inténtalo de nuevo.')) }
  }
  const choosePhoto = async (file?: File) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/bmp'].includes(file.type)) {
      setError(tr('Choose a JPEG, PNG, WebP or BMP photo. This tool does not read PDF files.', 'Elige una foto JPEG, PNG, WebP o BMP. Esta herramienta no lee archivos PDF.')); return
    }
    if (file.size > MAX_PHOTO_BYTES) { setError(tr('Choose a photo smaller than 20 MB.', 'Elige una foto de menos de 20 MB.')); return }
    const current = ++operation.current
    setBusy(true); setError(''); setProgress(null)
    let bitmap: ImageBitmap | null = null
    let objectUrl: string | null = null
    try {
      let imageSource: ImageBitmap | HTMLImageElement
      let width: number; let height: number
      if (typeof createImageBitmap === 'function') {
        bitmap = await createImageBitmap(file); imageSource = bitmap; width = bitmap.width; height = bitmap.height
      } else {
        objectUrl = URL.createObjectURL(file)
        const image = new Image(); image.src = objectUrl
        await image.decode(); imageSource = image; width = image.naturalWidth; height = image.naturalHeight
      }
      if (current !== operation.current) return
      if (width * height > 32_000_000) throw new Error('oversize')
      replaceSource(createSnapshot(imageSource, width, height))
    } catch {
      if (current === operation.current) setError(tr('This photo could not be opened. Choose a smaller, clear image.', 'No se pudo abrir esta foto. Elige una imagen más pequeña y clara.'))
    } finally {
      bitmap?.close(); if (objectUrl) URL.revokeObjectURL(objectUrl)
      if (current === operation.current) setBusy(false)
    }
  }
  const recognize = async () => {
    if (!source || !previewRef.current || busy) return
    const current = ++operation.current
    setBusy(true); setError(''); setFeedback(''); setResult(null); setText(''); setQuestion(''); setPlaceQuery('')
    speech.stop()
    setProgress({ status: 'preparing image', progress: 0 })
    try {
      const bytes = await snapshotBytes(previewRef.current)
      if (current !== operation.current) return
      service.current ??= new OcrService()
      const recognized = await service.current.recognize(bytes, ocrLanguage, value => { if (current === operation.current) setProgress(value) })
      if (current !== operation.current) return
      setResult(recognized); setText(recognized.text)
      if (recognized.text) setQuestion(tr('Could you help me understand this sign?', '¿Podría ayudarme a entender este letrero?'))
      setFeedback(tr('Recognition finished. Review and correct the text before using it.', 'Reconocimiento terminado. Revisa y corrige el texto antes de usarlo.'))
    } catch (failure) {
      if (current === operation.current && !(failure instanceof DOMException && failure.name === 'AbortError')) {
        setError(tr(failure instanceof Error ? failure.message : 'Recognition failed. Please retry.', 'Falló el reconocimiento. Revisa la conexión para descargar los datos de idioma y vuelve a intentar con una foto clara.'))
      }
    } finally { if (current === operation.current) { setBusy(false); setProgress(null) } }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setFeedback(tr('Reviewed text copied.', 'Texto revisado copiado.')) }
    catch { setError(tr('Copy is unavailable. Select the reviewed text and copy it with your keyboard.', 'No se puede copiar. Selecciona el texto revisado y cópialo con el teclado.')) }
  }
  const selectPlaceText = () => {
    const element = textRef.current
    const selected = element ? text.slice(element.selectionStart, element.selectionEnd).trim() : ''
    if (!selected) { setFeedback(tr('Select the place name in the reviewed text, or type it below.', 'Selecciona el nombre del lugar en el texto revisado, o escríbelo abajo.')); return }
    setPlaceQuery(selected.slice(0, 160)); setFeedback('')
  }
  const updateCrop = (key: keyof CropPercent, value: number) => {
    if (!Number.isFinite(value)) return
    setCrop(previous => {
      const next = { ...previous, [key]: Math.max(0, Math.min(100, value)) }
      if (key === 'left') next.left = Math.min(next.left, next.right - 1)
      if (key === 'right') next.right = Math.max(next.right, next.left + 1)
      if (key === 'top') next.top = Math.min(next.top, next.bottom - 1)
      if (key === 'bottom') next.bottom = Math.max(next.bottom, next.top + 1)
      return next
    })
  }
  const statusLabels: Record<string, string> = {
    'preparing image': tr('Preparing local photo', 'Preparando foto local'),
    'loading tesseract core': tr('Loading OCR engine', 'Cargando motor OCR'),
    'initializing tesseract': tr('Initializing OCR engine', 'Iniciando motor OCR'),
    'loading language traineddata': tr('Loading language data', 'Cargando datos de idioma'),
    'initializing api': tr('Preparing recognition', 'Preparando reconocimiento'),
    'recognizing text': tr('Recognizing text', 'Reconociendo texto'),
  }

  return <section className="vision-tool" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>{tr('Read a sign', 'Leer un letrero')}</h2>
    <p>{tr('Capture a still photo or choose an image. Recognition happens on this device; photos and text are not saved or uploaded.', 'Captura una foto o elige una imagen. El reconocimiento ocurre en este dispositivo; las fotos y el texto no se guardan ni se suben.')}</p>
    <p className="muted">{tr('English/Spanish model data downloads on first use. Full offline operation has not been verified. This is image OCR, not PDF extraction.', 'Los datos de inglés/español se descargan en el primer uso. No se ha verificado el funcionamiento totalmente sin conexión. Esto es OCR de imágenes, no extracción de PDF.')}</p>
    <div className="vision-actions">
      <Button onClick={capture} disabled={!video || busy}><Camera size={18} aria-hidden="true" />{tr('Capture photo', 'Capturar foto')}</Button>
      <label className="vision-file-label" htmlFor={`${id}-photo`}>{tr('Choose photo', 'Elegir foto')}<input id={`${id}-photo`} type="file" accept="image/jpeg,image/png,image/webp,image/bmp" disabled={busy} onChange={event => { void choosePhoto(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
    </div>
    {source && <>
      <figure className="ocr-photo"><canvas ref={previewRef} role="img" aria-label={tr('Local photo with the selected crop', 'Foto local con el recorte seleccionado')} /><figcaption>{tr('Selected crop. Adjust the percentages with the keyboard or number controls.', 'Recorte seleccionado. Ajusta los porcentajes con el teclado o los controles numéricos.')}</figcaption></figure>
      <details className="vision-details"><summary>{tr('Crop photo', 'Recortar foto')}</summary><fieldset disabled={busy}><legend>{tr('Crop boundaries (%)', 'Límites de recorte (%)')}</legend><div className="crop-controls">
        {(['left', 'top', 'right', 'bottom'] as const).map(key => <label key={key} htmlFor={`${id}-${key}`}><span>{({ left: tr('Left edge', 'Borde izquierdo'), top: tr('Top edge', 'Borde superior'), right: tr('Right edge', 'Borde derecho'), bottom: tr('Bottom edge', 'Borde inferior') })[key]}</span><input id={`${id}-${key}`} type="number" min={key === 'right' || key === 'bottom' ? 1 : 0} max={key === 'left' || key === 'top' ? 99 : 100} step="1" value={crop[key]} onChange={event => updateCrop(key, event.currentTarget.valueAsNumber)} /></label>)}
      </div><Button variant="secondary" onClick={() => setCrop({ ...FULL_CROP })}>{tr('Use full photo', 'Usar foto completa')}</Button></fieldset></details>
      <div className="vision-actions"><label htmlFor={`${id}-language`}>{tr('Recognition language', 'Idioma de reconocimiento')}<select id={`${id}-language`} value={ocrLanguage} disabled={busy} onChange={event => setOcrLanguage(event.target.value as OcrLanguage)}><option value="eng">English</option><option value="spa">Español</option></select></label><Button onClick={() => { void recognize() }} disabled={busy}>{tr('Start recognition', 'Iniciar reconocimiento')}</Button><Button variant="secondary" disabled={busy} onClick={() => replaceSource(null)}>{tr('Retake / clear photo', 'Repetir / borrar foto')}</Button></div>
    </>}
    {busy && <div className="ocr-progress" role="status"><p>{progress ? statusLabels[progress.status] ?? tr('Processing photo', 'Procesando foto') : tr('Opening photo', 'Abriendo foto')}{progress ? ` · ${Math.round(progress.progress * 100)}%` : ''}</p>{progress && <progress max="1" value={progress.progress} aria-label={tr('Current OCR stage progress', 'Progreso de la etapa actual de OCR')} />}<Button variant="secondary" onClick={cancel}>{tr('Cancel processing', 'Cancelar procesamiento')}</Button></div>}
    {error && <p className="vision-error" role="alert">{error}</p>}
    {feedback && <p role="status">{feedback}</p>}
    {result && <div className="ocr-review">
      <h3>{tr('Review recognized text', 'Revisar el texto reconocido')}</h3>
      {result.uncertain && <p className="vision-warning">{tr('Recognition was uncertain. Improve lighting or framing while stationary and retake the photo. Missing words have not been filled in.', 'El reconocimiento fue incierto. Mejora la luz o el encuadre sin caminar y vuelve a tomar la foto. No se han completado las palabras faltantes.')}</p>}
      <p>{tr('OCR can misread even clear signs. Confirm important words with staff; this text does not establish a safe route.', 'El OCR puede leer mal incluso letreros claros. Confirma las palabras importantes con el personal; este texto no establece una ruta segura.')}</p>
      <label htmlFor={`${id}-text`}>{tr('Recognized text — review and edit', 'Texto reconocido — revisar y editar')}</label>
      <textarea ref={textRef} id={`${id}-text`} rows={6} value={text} maxLength={12000} onChange={event => { speech.stop(); setText(event.target.value) }} />
      <div className="vision-actions"><Button variant="secondary" disabled={!text.trim() || !speech.supported} onClick={() => speech.speak(text)}><Volume2 size={18} aria-hidden="true" />{tr('Read aloud', 'Leer en voz alta')}</Button><Button variant="secondary" disabled={!speech.speaking} onClick={speech.stop}><Square size={18} aria-hidden="true" />{tr('Stop speaking', 'Detener voz')}</Button><Button variant="secondary" disabled={!text.trim()} onClick={() => { void copy() }}><Copy size={18} aria-hidden="true" />{tr('Copy text', 'Copiar texto')}</Button><Button variant="secondary" disabled={!text.trim()} onClick={() => { setMessage(text.slice(0, 1500)); setCommunicationOpen(true) }}><MessageSquare size={18} aria-hidden="true" />{tr('Show in communication', 'Mostrar en comunicación')}</Button></div>
      {!speech.supported && <p>{tr('Read aloud is unavailable in this browser. Reviewed text remains usable.', 'La lectura en voz alta no está disponible en este navegador. Puedes usar el texto revisado.')}</p>}
      {speech.status && <p role="status">{t(speech.status)}</p>}
      <label htmlFor={`${id}-question`}>{tr('Question about this sign', 'Pregunta sobre este letrero')}</label><textarea id={`${id}-question`} rows={2} value={question} maxLength={1500} onChange={event => setQuestion(event.target.value)} />
      <Button disabled={!question.trim()} onClick={() => { addQuestion(question, undefined, undefined, undefined, navigationPlace ? { name: navigationPlace.name, nameEs: navigationPlace.nameEs, fictional: navigationPlace.fictional } : undefined); setFeedback('') }}>{tr('Add a question', 'Añadir una pregunta')}</Button>
      <details className="vision-details"><summary>{tr('Search a place named on this sign', 'Buscar un lugar mencionado en este letrero')}</summary><p>{tr('Select only the public place name in the reviewed text, then use it below. Do not include appointment details or clinical text.', 'Selecciona solo el nombre público del lugar en el texto revisado y úsalo abajo. No incluyas detalles de citas ni texto clínico.')}</p><Button variant="secondary" onClick={selectPlaceText}>{tr('Use selected text as place name', 'Usar el texto seleccionado como nombre')}</Button><label htmlFor={`${id}-place`}>{tr('Place name to search', 'Nombre del lugar a buscar')}</label><input id={`${id}-place`} value={placeQuery} maxLength={160} onChange={event => setPlaceQuery(event.target.value)} /><Button disabled={!placeQuery.trim()} onClick={() => setConfirmSearch(true)}><Search size={18} aria-hidden="true" />{tr('Review place search', 'Revisar búsqueda del lugar')}</Button></details>
    </div>}
    {confirmSearch && <Modal title={tr('Confirm place search', 'Confirmar búsqueda del lugar')} onClose={() => setConfirmSearch(false)}><p>{tr('Search saved public places for this reviewed name?', '¿Buscar en lugares públicos guardados este nombre revisado?')}</p><p className="vision-search-review">{placeQuery.trim()}</p><p>{tr('Only the reviewed name is passed to the map. Public discovery requires a separate Search this area action. Your photo and other recognized text stay here.', 'Solo se pasa el nombre revisado al mapa. La búsqueda pública requiere una acción separada de Buscar en esta zona. La foto y el resto del texto reconocido permanecen aquí.')}</p><div className="vision-actions"><Button onClick={() => { setPendingPlaceQuery(placeQuery.trim()); setDataMode('public'); setConfirmSearch(false); navigate('explore') }}>{tr('Confirm place search', 'Confirmar búsqueda del lugar')}</Button><Button variant="secondary" onClick={() => setConfirmSearch(false)}>{tr('Cancel', 'Cancelar')}</Button></div></Modal>}
  </section>
}
