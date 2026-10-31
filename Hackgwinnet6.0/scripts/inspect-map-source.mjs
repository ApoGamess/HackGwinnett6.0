// Read-only evidence capture. MapLibre supplies the vector tile decoders used here.
// Run explicitly: node scripts/inspect-map-source.mjs
import { writeFile } from 'node:fs/promises'
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import seed from '../src/navigation/public-seed.json' with { type: 'json' }

const styleUrl = 'https://tiles.openfreemap.org/styles/liberty'
const style = await fetch(styleUrl).then(response => { if (!response.ok) throw Error(`Style HTTP ${response.status}`); return response.json() })
const buildings = style.layers.filter(layer => layer['source-layer'] === 'building')
const sourceId = buildings.find(layer => layer.type === 'fill-extrusion')?.source
if (!sourceId || style.sources[sourceId]?.type !== 'vector') throw Error('No documented vector building source.')
const source = await fetch(style.sources[sourceId].url).then(response => response.json())
const { lon, lat } = seed.elements[0].center
const z = 14, n = 2 ** z
const x = Math.floor((lon + 180) / 360 * n)
const y = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n)
const tileUrl = source.tiles[0].replace('{z}', z).replace('{x}', x).replace('{y}', y)
const response = await fetch(tileUrl)
if (!response.ok) throw Error(`Tile HTTP ${response.status}`)
const tile = new VectorTile(new PbfReader(new Uint8Array(await response.arrayBuffer())))
const layer = tile.layers.building
if (!layer) throw Error('No building layer in hospital tile.')
const records = Array.from({ length: layer.length }, (_, index) => {
  const feature = layer.feature(index), geometry = feature.toGeoJSON(x, y, z).geometry
  return { id: feature.id, properties: feature.properties, geometry }
})
// The building id and geometry permit a later visual cross-check, without saving a whole basemap.
function contains(ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const hospital = records.flatMap(record => {
  const polygons = record.geometry.type === 'MultiPolygon' ? record.geometry.coordinates : [record.geometry.coordinates]
  return polygons.filter(polygon => contains(polygon[0]) && !polygon.slice(1).some(contains)).map(coordinates => ({
    properties: record.properties, geometry: { type: 'Polygon', coordinates },
  }))
})
const summary = {
  sourceCheckedAt: new Date().toISOString(), styleUrl, sourceId, tileUrl,
  tile: { z, x, y }, buildingLayers: buildings,
  buildingsInTile: records.length,
  positiveRenderHeights: records.filter(record => Number(record.properties.render_height) > 0 && !record.properties.hide_3d).length,
  hospitalAreaFootprints: hospital,
  caveat: 'render_height/render_min_height are provider visualization estimates, possibly derived from levels or defaults. Original Grady OSM way has no height or building:levels tag. This is geographic footprint geometry, not photorealism or a survey.',
  source: 'https://openmaptiles.org/docs/schema/#building',
}
await writeFile(new URL('../docs/grady-building-evidence.json', import.meta.url), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ buildingsInTile: summary.buildingsInTile, positiveRenderHeights: summary.positiveRenderHeights, hospitalAreaFootprints: hospital.map(item => item.properties), tileUrl }))
