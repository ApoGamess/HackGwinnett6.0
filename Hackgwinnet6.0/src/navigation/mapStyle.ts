import type { FeatureCollection, LineString, Point, Polygon } from 'geojson'
import type { StyleSpecification } from 'maplibre-gl'
import { demoBuildings } from './repository'
import type { Place, RouteEdge, RouteNode, RouteResult } from './types'

/** Official OpenFreeMap no-key vector style; may be overridden at build time. */
export const publicMapStyle = import.meta.env.VITE_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/liberty'
export const demoFloorHeight = 4
export const emptyCollection = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] })

/** No tiles, glyphs, sprites or external sources: demo [0,0] is not a location. */
export function createDemoStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      'demo-buildings': { type: 'geojson', data: demoBuildings },
    },
    layers: [
      { id: 'demo-background', type: 'background', paint: { 'background-color': '#e8efed' } },
      { id: 'demo-building-footprint', type: 'fill', source: 'demo-buildings', filter: ['==', ['get', 'floor'], 0], paint: { 'fill-color': '#c9d9d5', 'fill-outline-color': '#5b7670', 'fill-opacity': 0.55 } },
      // A thin slab makes the selected fictional level explicit; it is not a floor plan.
      { id: 'demo-floor-slab', type: 'fill-extrusion', source: 'demo-buildings', filter: ['==', ['get', 'floor'], 0], paint: { 'fill-extrusion-color': '#bfd5cf', 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['+', ['get', 'base'], 0.25], 'fill-extrusion-opacity': 0.75 } },
    ],
  }
}

export function placeFeatures(places: readonly Place[], mode: 'public' | 'demo', floor: number): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: places.filter(place => place.fictional === (mode === 'demo') && (mode !== 'demo' || place.floor === null || place.floor === floor)).map(place => ({ type: 'Feature', id: place.id, properties: { id: place.id, floor: place.floor ?? 0 }, geometry: { type: 'Point', coordinates: place.coordinates } })) }
}

function segmentPolygon(from: RouteNode, to: RouteNode, halfWidthMeters: number): Polygon | null {
  const dx = to.localMeters[0] - from.localMeters[0]
  const dy = to.localMeters[1] - from.localMeters[1]
  const length = Math.hypot(dx, dy)
  if (!length) return null
  const ox = -dy / length * halfWidthMeters / 111320
  const oy = dx / length * halfWidthMeters / 111320
  const a = from.coordinates; const b = to.coordinates
  return { type: 'Polygon', coordinates: [[[a[0] + ox, a[1] + oy], [b[0] + ox, b[1] + oy], [b[0] - ox, b[1] - oy], [a[0] - ox, a[1] - oy], [a[0] + ox, a[1] + oy]]] }
}

/** Every highlighted segment is an edge in the computed node sequence. Vertical
 * elevator transitions have no street line; the text directions explain them. */
export function routeFeatures(route: RouteResult | null, nodes: readonly RouteNode[], floor: number): { lines: FeatureCollection<LineString>; ribbons: FeatureCollection<Polygon> } {
  const lines: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] }
  const ribbons: FeatureCollection<Polygon> = { type: 'FeatureCollection', features: [] }
  if (route?.status !== 'ok') return { lines, ribbons }
  const byId = new Map(nodes.map(node => [node.id, node]))
  route.nodeIds.slice(1).forEach((id, index) => {
    const from = byId.get(route.nodeIds[index]); const to = byId.get(id)
    if (!from || !to || from.floor !== floor || to.floor !== floor) return
    const properties = { floor, edgeId: route.edgeIds[index] }
    lines.features.push({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: [from.coordinates, to.coordinates] } })
    const geometry = segmentPolygon(from, to, 1.2)
    if (geometry) ribbons.features.push({ type: 'Feature', properties, geometry })
  })
  return { lines, ribbons }
}

export function pathFeatures(nodes: readonly RouteNode[], edges: readonly RouteEdge[], floor: number): FeatureCollection<LineString> {
  const byId = new Map(nodes.map(node => [node.id, node]))
  return { type: 'FeatureCollection', features: edges.flatMap(edge => {
    const from = byId.get(edge.from); const to = byId.get(edge.to)
    if (!from || !to || from.floor !== floor || to.floor !== floor || edge.kind === 'stairs') return []
    return [{ type: 'Feature' as const, properties: { floor }, geometry: { type: 'LineString' as const, coordinates: [from.coordinates, to.coordinates] } }]
  }) }
}
