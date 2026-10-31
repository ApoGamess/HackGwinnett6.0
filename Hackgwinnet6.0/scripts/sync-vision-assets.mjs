import { mkdir, readdir, copyFile, readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'node_modules/tesseract.js-core')
const destination = resolve(root, 'public/vision/tesseract')
const metadata = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'))
if (metadata.version !== '6.1.2') throw new Error(`Review the OCR assets before using core ${metadata.version}`)
await mkdir(destination, { recursive: true })
const assets = (await readdir(source)).filter(name => /^tesseract-core(?:-simd)?(?:-lstm)?\.wasm(?:\.js)?$/.test(name))
if (assets.length !== 8) throw new Error('Expected all four matching Tesseract WASM / loader pairs')
await Promise.all([...assets, 'LICENSE'].map(name => copyFile(resolve(source, name), resolve(destination, name))))
await writeFile(resolve(destination, 'manifest.json'), JSON.stringify({
  package: metadata.name, version: metadata.version, license: metadata.license,
  source: 'https://github.com/naptha/tesseract.js-core', assets,
}, null, 2) + '\n')
console.log(`Prepared ${assets.length} matched Tesseract core ${metadata.version} assets.`)
