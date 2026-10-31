// One explicit, bounded OSM query. No Nominatim, autocomplete, retries or bulk requests.
// Review the official page before accepting new seed data; retrieval is not inspection.
import { readFile, writeFile } from 'node:fs/promises'
const target = new URL('../src/navigation/public-seed.json', import.meta.url)
const previous = JSON.parse(await readFile(target, 'utf8'))
const response = await fetch(`${previous.endpoint}?${new URLSearchParams({ data: previous.query })}`, {
  headers: { 'User-Agent': 'CareNori-public-seed-import/1.0 (single public hospital record)' },
  signal: AbortSignal.timeout(30000),
})
if (!response.ok) throw Error(`Overpass HTTP ${response.status}; saved seed unchanged.`)
const raw = await response.json()
const element = raw.elements?.find(item => item.type === 'way' && item.id === 270880941)
if (!element || element.tags?.name !== 'Grady Memorial Hospital' || element.tags['addr:housenumber'] !== '80'
  || element.tags['addr:city'] !== 'Atlanta' || element.tags['addr:postcode'] !== '30303'
  || element.tags['addr:street'] !== 'Jesse Hill Junior Drive Southeast'
  || !Number.isFinite(element.center?.lon) || !Number.isFinite(element.center?.lat)
  || Math.abs(element.center.lon) > 180 || Math.abs(element.center.lat) > 85) throw Error('OSM name/address/coordinates did not match; saved seed unchanged.')
const official = await fetch(previous.official.url, { signal: AbortSignal.timeout(30000) })
if (!official.ok) throw Error('Official location unavailable; saved seed unchanged.')
const html = await official.text()
if (!/Grady Memorial Hospital/i.test(html) || !/80\s+Jesse Hill/i.test(html) || !html.includes('30303')) throw Error('Official name/address cross-check failed; saved seed unchanged.')
const retrievedAt = new Date().toISOString()
const next = { ...previous, datasetRevision: `grady-osm-${retrievedAt.slice(0, 10)}`, retrievedAt,
  official: { ...previous.official, retrievedAt },
  elements: [{ type: element.type, id: element.id, timestamp: element.timestamp, version: element.version, center: element.center, tags: element.tags }],
}
await writeFile(target, JSON.stringify(next, null, 2) + '\n')
console.log('Updated one public Grady source record; no accessibility or inspection claims added.')
