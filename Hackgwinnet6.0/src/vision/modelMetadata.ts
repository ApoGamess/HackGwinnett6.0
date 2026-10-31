/** Public asset metadata only; never contains camera frames or results. */
export interface ModelMetadata {
  id: string
  purpose: string
  packageVersion: string
  codeLicense: string
  assetSource: string
  assetLicense: string
  localProcessing: true
}
export const modelMetadata: readonly ModelMetadata[] = Object.freeze([
  { id: 'coco-ssd-lite-mobilenet-v2', purpose: 'Supported generic objects, without identity or roles', packageVersion: '2.2.3 / TensorFlow.js 4.22.0', codeLicense: 'Apache-2.0', assetSource: 'https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd', assetLicense: 'Apache-2.0 (TensorFlow model distribution); COCO dataset has separate image/annotation terms', localProcessing: true },
  { id: 'tesseract-eng-spa', purpose: 'User-requested English or Spanish image OCR', packageVersion: 'Tesseract.js 6.0.1 / core 6.1.2 / language data 1.0.0', codeLicense: 'Apache-2.0', assetSource: 'https://github.com/naptha/tessdata', assetLicense: 'Apache-2.0 (Tesseract traineddata)', localProcessing: true },
  { id: 'zxing-qr', purpose: 'Allowlisted CareNori checkpoint decoding (no learned model)', packageVersion: '@zxing/browser 0.1.5', codeLicense: 'MIT (browser wrapper); Apache-2.0 (@zxing/library)', assetSource: 'https://github.com/zxing-js/browser', assetLicense: 'No model weights', localProcessing: true },
])
