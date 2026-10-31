import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import QRCode from 'qrcode'

const root = fileURLToPath(new URL('../', import.meta.url))
const seed = JSON.parse(await fs.readFile(path.join(root, 'src/navigation/checkpoints.json'), 'utf8'))
const output = path.join(root, 'public/demo-checkpoints')
await fs.mkdir(output, { recursive: true })
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const cards = []
for (const checkpoint of seed.checkpoints) {
  const payload = `carenori:v1:${seed.siteId}:${checkpoint.id}:r${seed.revision}`
  const svg = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 440 })
  await fs.writeFile(path.join(output, `${checkpoint.id}.svg`), svg)
  await QRCode.toFile(path.join(output, `${checkpoint.id}.png`), payload, { errorCorrectionLevel: 'M', margin: 4, width: 440 })
  cards.push(`<article><p class="demo">CARENORI · DEMO / DEMOSTRACIÓN</p><h2>${escape(checkpoint.name)} <small lang="es">${escape(checkpoint.nameEs)}</small></h2><img src="${escape(checkpoint.id)}.svg" width="240" height="240" alt="QR for demo checkpoint ${escape(checkpoint.name)}"><p>Manual ID / ID manual: <strong>${escape(checkpoint.id)}</strong></p><code>${escape(payload)}</code><p>Not installed at Grady. Not proof of location.<br><span lang="es">No instalado en Grady. No demuestra ubicación.</span></p></article>`)
}
await fs.writeFile(path.join(output, 'labels.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CareNori printable demo checkpoints</title><style>
*{box-sizing:border-box}body{font:17px/1.4 system-ui,sans-serif;color:#132820;max-width:1000px;margin:2rem auto;padding:1rem}h1{font-size:1.8rem}h2{margin:.4rem 0;font-size:1.5rem}small{display:block;font-weight:400}header{margin-bottom:1rem}.labels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}article{border:2px solid #132820;border-radius:12px;padding:1rem;text-align:center;break-inside:avoid}article img{width:60%;height:auto;image-rendering:pixelated}.demo{font-weight:750;letter-spacing:.04em}code{font-size:.75rem;overflow-wrap:anywhere}button{padding:.8rem 1rem;font:inherit;border:2px solid;background:white;border-radius:8px;cursor:pointer}button:focus-visible{outline:4px solid #176752;outline-offset:3px}@media(max-width:600px){.labels{grid-template-columns:1fr}}@media print{@page{size:A4 portrait;margin:10mm}body{margin:0;padding:0;font-size:10pt}header h1{font-size:16pt}header p{font-size:9pt}button{display:none}.labels{gap:8mm}article{padding:4mm}article img{width:40mm;height:40mm}h2{font-size:14pt}code{font-size:7pt}}
</style></head><body><header><h1>CareNori controlled demo checkpoints</h1><p>These synthetic labels are <strong>not installed at Grady Memorial Hospital</strong>. Site ${escape(seed.siteId)}, revision ${seed.revision}. Print at 100% scale with the white QR margins intact. Get venue permission before placing labels. Keep IDs readable for manual entry.</p><p>Before a real pilot, survey and record segment widths, slopes, surfaces, closures and sources; replace the authored demo graph and dataset revision, then physically verify every label and constraint. Scanning a copied QR does not prove location. This is not continuous positioning.</p><button id="print">Print labels / Imprimir etiquetas</button></header><main class="labels">${cards.join('\n')}</main><script src="print.js"></script></body></html>`)
await fs.writeFile(path.join(output, 'print.js'), "document.getElementById('print').addEventListener('click', () => window.print())\n")
console.log(`Generated ${seed.checkpoints.length} synthetic QR labels in public/demo-checkpoints; no physical installation asserted.`)
