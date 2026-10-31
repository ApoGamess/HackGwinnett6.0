import workerUrl from 'tesseract.js/dist/worker.min.js?url'
import type { Worker as TesseractWorker } from 'tesseract.js'
import type { OcrLanguage } from './ocr'

let engine: TesseractWorker | null = null
let currentLanguage: OcrLanguage | null = null
let busy = false

// No image URLs, console logging, uploads or persistence. Only PNG bytes enter here.
self.onmessage = async (event: MessageEvent<{ type: string; bytes: ArrayBuffer; language: OcrLanguage; corePath: string }>) => {
  if (event.data.type !== 'recognize' || busy) return
  busy = true
  try {
    const { bytes, language, corePath } = event.data
    if (language !== 'eng' && language !== 'spa') throw new Error('Unsupported language')
    if (!engine || currentLanguage !== language) {
      await engine?.terminate(); engine = null
      const { createWorker } = await import('tesseract.js')
      engine = await createWorker(language, 1, {
        workerPath: new URL(workerUrl, self.location.href).href,
        workerBlobURL: false,
        corePath,
        langPath: `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${language}@1.0.0/4.0.0_best_int`,
        // Only public model files may be cached. Recognition images/text remain in RAM.
        cacheMethod: 'write',
        logger: message => self.postMessage({ type: 'progress', status: message.status, progress: message.progress }),
        errorHandler: () => self.postMessage({ type: 'error' }),
      })
      currentLanguage = language
    }
    const { data } = await engine.recognize(new Blob([bytes], { type: 'image/png' }), {}, { text: true })
    self.postMessage({ type: 'result', text: data.text, confidence: data.confidence })
  } catch {
    await engine?.terminate(); engine = null; currentLanguage = null
    self.postMessage({ type: 'error' })
  } finally { busy = false }
}
