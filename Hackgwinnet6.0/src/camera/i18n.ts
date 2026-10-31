import type { CameraError, CameraPhase } from './CameraService'
import type { DetectionFrame, SupportedTarget } from './detections'
import { imageSide } from './geometry'

const es: Record<string, string> = {
  'Camera assistance': 'Asistencia con cámara', 'Your visit': 'Su visita',
  'Read signs, find supported objects, and prepare a question.': 'Lea letreros, encuentre objetos compatibles y prepare una pregunta.',
  'Help me communicate': 'Ayúdame a comunicarme', 'Open map': 'Abrir mapa', 'Selected place': 'Lugar seleccionado',
  'Camera assistance can miss objects. It does not determine whether a path is safe.': 'La asistencia con cámara puede no detectar objetos. No determina si un camino es seguro.',
  'Start camera': 'Iniciar cámara', 'Resume camera': 'Reanudar cámara', 'Stop camera': 'Detener cámara', 'Pause analysis': 'Pausar análisis', 'Resume analysis': 'Reanudar análisis',
  'Camera device': 'Dispositivo de cámara', 'Switch camera': 'Cambiar cámara', 'Camera preview': 'Vista de cámara',
  'Live preview': 'Vista en vivo', 'Camera is off': 'La cámara está apagada', 'Camera state': 'Estado de la cámara',
  'Camera released while the app was hidden. Resume when you are ready.': 'Se liberó la cámara al ocultar la aplicación. Reanude cuando esté listo.',
  'Waiting for camera permission. A pending browser prompt cannot be canceled here; Stop will release any stream it later grants.': 'Esperando permiso de cámara. No se puede cancelar aquí un aviso pendiente del navegador; Detener liberará cualquier transmisión que se autorice después.',
  'Video only. Frames are processed on this device and are not saved or uploaded. Starting object analysis downloads a model; sign reading downloads language data. Network access is needed for uncached assets.': 'Solo video. Las imágenes se procesan en este dispositivo y no se guardan ni se suben. El análisis descarga un modelo; la lectura descarga datos de idioma. Los recursos sin caché necesitan conexión.',
  'Objects': 'Objetos', 'Read a sign': 'Leer un letrero', 'QR checkpoint': 'Punto de control QR', 'Camera tools': 'Herramientas de cámara',
  'Describe this view': 'Describir esta vista', 'Find an object': 'Buscar un objeto', 'Find a person in view': 'Buscar una persona en la imagen',
  'Object to find': 'Objeto a buscar', 'Search supported objects': 'Buscar objetos compatibles', 'Use a listed object, map search, sign reading, or typed assistance. This camera tool does not recognize that target.': 'Use un objeto de la lista, el mapa, la lectura de letreros o la comunicación escrita. Esta herramienta no reconoce ese objetivo.',
  'Supported targets in this tool': 'Objetivos compatibles con esta herramienta',
  'This tool uses a selected subset of COCO-SSD classes. A chair is not a wheelchair. It does not identify roles, doors, ramps, stairs, medical conditions, or safe walking space.': 'Esta herramienta usa un subconjunto de clases de COCO-SSD. Una silla no es una silla de ruedas. No identifica roles, puertas, rampas, escaleras, condiciones médicas ni espacio seguro para caminar.',
  'Current observations': 'Observaciones actuales', 'Model observations · COCO-SSD': 'Observaciones del modelo · COCO-SSD', 'No supported target was detected in the latest frame.': 'No se detectó ningún objetivo compatible en la imagen más reciente.',
  'Start the camera to analyze its view.': 'Inicie la cámara para analizar su vista.', 'Loading object model…': 'Cargando modelo de objetos…', 'Waiting for a new camera frame…': 'Esperando una nueva imagen de cámara…',
  'Analysis delayed. Previous observations are no longer current.': 'Análisis retrasado. Las observaciones anteriores ya no son actuales.', 'Analysis paused. The camera preview remains on.': 'Análisis pausado. La vista de la cámara sigue activa.',
  'Read observations aloud': 'Leer observaciones en voz alta', 'Stop speaking': 'Detener voz', 'Score': 'Puntuación', 'Frame age': 'Edad de la imagen',
  'Scores are model outputs, not calibrated probabilities or safety guarantees. Image positions refer to the displayed camera view.': 'Las puntuaciones son resultados del modelo, no probabilidades calibradas ni garantías de seguridad. Las posiciones corresponden a la imagen que se muestra.',
  'Suggested next action': 'Siguiente acción sugerida', 'Ask staff to confirm the route': 'Pedir al personal que confirme la ruta',
  'Prepare a message': 'Preparar un mensaje', 'Could you help me find reception?': '¿Podría ayudarme a encontrar la recepción?',
  'Camera diagnostics': 'Diagnóstico de cámara', 'Model state': 'Estado del modelo', 'Backend': 'Motor', 'Input resolution': 'Resolución de entrada', 'Inference duration': 'Duración de inferencia', 'Completed analyses / second': 'Análisis completados / segundo', 'Latest result age': 'Edad del último resultado', 'Session ID': 'ID de sesión', 'Frame timestamp': 'Hora de la imagen', 'Stale threshold': 'Umbral de antigüedad',
  'Not measured': 'Sin medir', 'Not loaded': 'Sin cargar', 'No result': 'Sin resultado',
  'Inference duration and result age are measured separately. End-to-end camera latency is not measured.': 'La duración de inferencia y la edad del resultado se miden por separado. No se mide la latencia total de la cámara.',
  'The object model could not load. Check your connection and retry analysis. You can still use the camera preview, sign reading, and typed communication.': 'No se pudo cargar el modelo. Compruebe su conexión y reintente el análisis. Puede seguir usando la cámara, la lectura de letreros y la comunicación escrita.',
  'Object analysis failed. Retry analysis or use sign reading and typed communication.': 'Falló el análisis de objetos. Reintente o use la lectura de letreros y la comunicación escrita.',
  'Retry analysis': 'Reintentar análisis', 'Browser speech is unavailable. Use the visible text.': 'La voz del navegador no está disponible. Use el texto visible.',
  'left': 'izquierda', 'center': 'centro', 'right': 'derecha', 'idle': 'inactiva', 'requesting': 'solicitando permiso', 'starting': 'iniciando', 'active': 'activa', 'paused': 'pausada', 'unavailable': 'no disponible', 'error': 'error', 'loading': 'cargando', 'ready': 'listo',
}
export function cameraText(language: 'en' | 'es', text: string) { return language === 'es' ? es[text] ?? text : text }
const labels: Record<SupportedTarget, string> = { person: 'persona', chair: 'silla', bench: 'banco', backpack: 'mochila', handbag: 'bolso', bottle: 'botella', cup: 'taza', book: 'libro', laptop: 'computadora portátil', 'cell phone': 'teléfono celular' }
export function targetLabel(target: SupportedTarget, language: 'en' | 'es') { return language === 'es' ? labels[target] : target }
export function resolveTarget(value: string): SupportedTarget | null {
  const normalized = value.trim().toLocaleLowerCase()
  for (const [en, es] of Object.entries(labels)) if (normalized === en || normalized === es) return en as SupportedTarget
  return null
}
export function describeFrame(frame: DetectionFrame, target: SupportedTarget | null, mirrored: boolean, language: 'en' | 'es') {
  const detections = frame.detections.filter(item => !target || item.label === target).slice(0, 4)
  if (!detections.length) return cameraText(language, 'No supported target was detected in the latest frame.')
  return detections.map(item => {
    const side = imageSide(item.bbox, frame.width, mirrored)
    return language === 'es'
      ? `Se detectó ${targetLabel(item.label, language)} en ${side === 'center' ? 'el centro' : `la ${cameraText(language, side)}`} de la imagen.`
      : `A ${item.label} was detected ${side === 'center' ? 'near the center' : `on the ${side} side`} of the camera view.`
  }).join(' ')
}
export function cameraErrorText(error: CameraError, language: 'en' | 'es') {
  const copy: Record<CameraError, [string, string]> = {
    insecure: ['Camera access requires HTTPS or localhost. Open the deployed HTTPS app in its own tab.', 'La cámara necesita HTTPS o localhost. Abra la aplicación HTTPS en su propia pestaña.'],
    unsupported: ['Camera access is unavailable in this browser or editor preview. Open the deployed HTTPS app in a supported browser tab.', 'La cámara no está disponible en este navegador o vista del editor. Abra la aplicación HTTPS en un navegador compatible.'],
    denied: ['Camera permission was blocked. Allow camera access in browser settings, then try again. An embedded editor may require opening the deployed HTTPS app in its own tab.', 'Se bloqueó el permiso. Permita la cámara en la configuración del navegador y reintente. En un editor integrado, abra la aplicación HTTPS en su propia pestaña.'],
    missing: ['No camera was found. Connect a camera and try again, or choose a photo in Read a sign.', 'No se encontró cámara. Conecte una y reintente, o elija una foto en Leer un letrero.'],
    busy: ['The camera could not be opened. It may be in use by another app. Close that app or choose another camera.', 'No se pudo abrir la cámara. Otra aplicación puede estar usándola. Cierre esa aplicación o elija otra cámara.'],
    constraints: ['That camera configuration is unavailable. Choose another camera or restart with the default camera.', 'Esa configuración no está disponible. Elija otra cámara o reinicie con la predeterminada.'],
    preview: ['The camera did not provide a usable video frame. Stop, check camera permissions, and try again in a deployed HTTPS tab.', 'La cámara no proporcionó una imagen utilizable. Detenga, compruebe los permisos y reintente en una pestaña HTTPS.'],
    ended: ['The camera stopped providing video. Reconnect it and intentionally start the camera again.', 'La cámara dejó de transmitir. Reconéctela e iníciela de nuevo.'],
    unknown: ['The camera could not start. Check the device and browser permission, then try again in a deployed HTTPS tab.', 'No se pudo iniciar la cámara. Compruebe el dispositivo y los permisos, y reintente en una pestaña HTTPS.'],
  }
  return copy[error][language === 'es' ? 1 : 0]
}
export function cameraPhaseText(phase: CameraPhase, language: 'en' | 'es') { return cameraText(language, phase) }
