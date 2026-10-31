import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { BrowserQRCodeReader } from '@zxing/browser'
import { checkpointPayload, checkpoints, checkpointSite, lookupManualCheckpoint, validateCheckpointPayload } from '../src/navigation/checkpoints'
import { assessOcrResult, cropRectangle, FULL_CROP, OcrService } from '../src/vision/ocr'
import seed from '../src/navigation/seed.json' with { type: 'json' }

const require = createRequire(import.meta.url)
const { PNG } = require('pngjs')

test('QR payload validation rejects external URLs, instructions, foreign sites and revisions', () => {
  for (const input of ['', 'https://example.com/?checkpoint=entrance', 'javascript:alert(1)', '<script>bad()</script>', {}, null, 'carenori:v1:demo-controlled:entrance:r1\n', 'carenori:v1:demo-controlled:%65ntrance:r1', 'carenori:v1:demo-controlled:entrance:r01']) expect(validateCheckpointPayload(input).ok).toBe(false)
  expect(validateCheckpointPayload('carenori:v1:grady:entrance:r1')).toEqual({ ok: false, reason: 'site' })
  expect(validateCheckpointPayload('carenori:v1:demo-controlled:entrance:r2')).toEqual({ ok: false, reason: 'revision' })
  expect(validateCheckpointPayload('carenori:v1:demo-controlled:operating-room:r1')).toEqual({ ok: false, reason: 'checkpoint' })
  expect(validateCheckpointPayload('a'.repeat(161))).toEqual({ ok: false, reason: 'format' })
  for (const checkpoint of checkpoints) expect(validateCheckpointPayload(checkpointPayload(checkpoint))).toEqual({ ok: true, checkpoint })
})

test('checkpoint seed stays synthetic with stable demo graph links and manual lookup', () => {
  expect(checkpointSite).toMatchObject({ schemaVersion: 1, fictional: true, physicallyInstalled: false, surveyed: false, revision: 1 })
  expect(checkpoints.map(checkpoint => checkpoint.id)).toEqual(['entrance', 'reception', 'waiting', 'help-desk'])
  expect(checkpoints.every(checkpoint => checkpoint.fictional && !checkpoint.surveyed && !checkpoint.physicallyInstalled && seed.route_nodes.some(node => node.id === checkpoint.routeNodeId))).toBe(true)
  expect(lookupManualCheckpoint(' RECEPTION ')).toEqual({ ok: true, checkpoint: checkpoints[1] })
  expect(lookupManualCheckpoint(checkpointPayload(checkpoints[2]))).toEqual({ ok: true, checkpoint: checkpoints[2] })
  expect(lookupManualCheckpoint('Grady').ok).toBe(false)
})

test('actual ZXing browser decoder reads all generated printable PNG fixtures', () => {
  // Synthetic generated pixels, not camera-device validation. Decoder is unmocked.
  const reader = new BrowserQRCodeReader()
  for (const checkpoint of checkpoints) {
    const png = PNG.sync.read(readFileSync(path.join(process.cwd(), 'public/demo-checkpoints', `${checkpoint.id}.png`)))
    const canvas = { width: png.width, height: png.height, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(png.data) }) }) } as unknown as HTMLCanvasElement
    const decoded = reader.decodeFromCanvas(canvas).getText()
    expect(decoded).toBe(checkpointPayload(checkpoint))
    expect(validateCheckpointPayload(decoded)).toEqual({ ok: true, checkpoint })
  }
})

test('crop uses image dimensions, clamps boundaries and rejects invalid dimensions', () => {
  expect(cropRectangle(1920, 1080, FULL_CROP)).toEqual({ left: 0, top: 0, width: 1920, height: 1080 })
  expect(cropRectangle(1000, 600, { left: 10, top: 20, right: 90, bottom: 80 })).toEqual({ left: 100, top: 120, width: 800, height: 360 })
  expect(cropRectangle(100, 200, { left: -20, top: -1, right: 102, bottom: 150 })).toEqual({ left: 0, top: 0, width: 100, height: 200 })
  expect(cropRectangle(100, 200, { left: 100, top: 100, right: 0, bottom: 0 })).toEqual({ left: 99, top: 199, width: 1, height: 1 })
  expect(() => cropRectangle(0, 20, FULL_CROP)).toThrow()
  expect(() => cropRectangle(20, NaN, FULL_CROP)).toThrow()
})

test('OCR review cue does not complete missing words or treat empty/high-invalid scores as certain', () => {
  expect(assessOcrResult('  Recep...  ', 62)).toEqual({ text: 'Recep...', confidence: 62, uncertain: true })
  expect(assessOcrResult('', 99).uncertain).toBe(true)
  expect(assessOcrResult('RECEPTION', NaN).uncertain).toBe(true)
  expect(assessOcrResult('RECEPTION', 90)).toEqual({ text: 'RECEPTION', confidence: 90, uncertain: false })
})

test('OCR service reuses worker, bounds concurrent work, propagates real progress and terminates on cancel/error', async () => {
  const workers: { terminated: boolean; onmessage: ((event: { data: unknown }) => void) | null; onerror: (() => void) | null; onmessageerror: (() => void) | null; postMessage: () => void; terminate: () => void }[] = []
  const factory = () => {
    const worker = { terminated: false, onmessage: null, onerror: null, onmessageerror: null, postMessage: () => {}, terminate() { this.terminated = true } }
    workers.push(worker)
    return worker as unknown as Worker
  }
  const service = new OcrService(factory, 'https://example.test/vision/tesseract/')
  const progress: unknown[] = []
  const first = service.recognize(new ArrayBuffer(8), 'eng', value => progress.push(value))
  await expect(service.recognize(new ArrayBuffer(8), 'eng', () => {})).rejects.toThrow('already running')
  workers[0].onmessage!({ data: { type: 'progress', status: 'recognizing text', progress: .42 } })
  workers[0].onmessage!({ data: { type: 'result', text: 'RECEPTION', confidence: 92 } })
  expect(await first).toMatchObject({ text: 'RECEPTION', confidence: 92 })
  expect(progress).toEqual([{ status: 'recognizing text', progress: .42 }])
  const second = service.recognize(new ArrayBuffer(8), 'eng', () => {})
  expect(workers).toHaveLength(1)
  service.cancel()
  await expect(second).rejects.toHaveProperty('name', 'AbortError')
  expect(workers[0].terminated).toBe(true)
  // Even a late posted result cannot restore a cancelled result.
  workers[0].onmessage!({ data: { type: 'result', text: 'STALE', confidence: 100 } })
  const third = service.recognize(new ArrayBuffer(8), 'spa', () => {})
  expect(workers).toHaveLength(2)
  workers[0].onmessage!({ data: { type: 'result', text: 'STALE AFTER RESTART', confidence: 100 } })
  workers[1].onerror!()
  await expect(third).rejects.toThrow('could not start')
  expect(workers[1].terminated).toBe(true)
  service.dispose()
})
