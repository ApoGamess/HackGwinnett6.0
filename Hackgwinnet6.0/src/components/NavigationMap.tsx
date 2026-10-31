import { useEffect, useId, useRef, useState } from 'react'
import { Map as LibreMap, AttributionControl, LngLatBounds, setWorkerUrl, type GeoJSONSource, type LayerSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useApp } from '../state/AppContext'
import { createDemoStyle, demoFloorHeight, emptyCollection, pathFeatures, placeFeatures, publicMapStyle, routeFeatures } from '../navigation/mapStyle'
import type { DataMode, Place, RouteEdge, RouteNode, RouteResult } from '../navigation/types'
import type { LocationFix } from '../navigation/geolocation'
import { GRADY_CENTER } from '../navigation/publicSeed'

// Official Vite worker setup: bundled locally, including for the offline demo.
setWorkerUrl(workerUrl)

export interface NavigationMapProps {
  mode: DataMode
  places: readonly Place[]
  selectedId?: string
  onSelect: (id: string) => void
  view: '2d' | '3d'
  floor: 0 | 1
  route: RouteResult | null
  nodes: readonly RouteNode[]
  edges?: readonly RouteEdge[]
  /** An explicit user area/location action, never the selected place coordinate. */
  center?: [number, number]
  onViewportChange: (center: [number, number]) => void
  onError: (message: string) => void
  resetKey: number
  position?: LocationFix | null
}

/** Tiny locally generated marker textures; no sprite/font/image requests in demo. */
function pinImage(selected: boolean) {
  const size = 64; const pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const distance = Math.hypot(x - 31.5, y - 31.5)
    const color = distance < 15 ? (selected ? [166, 70, 27] : [18, 94, 83]) : distance < 21 ? [255, 255, 255] : distance < 25 ? [27, 52, 47] : [0, 0, 0]
    const index = (y * size + x) * 4
    pixels[index] = color[0]; pixels[index + 1] = color[1]; pixels[index + 2] = color[2]; pixels[index + 3] = distance < 25 ? 255 : 0
  }
  return { width: size, height: size, data: pixels }
}

function updateGeoJSON(map: LibreMap, id: string, data: ReturnType<typeof emptyCollection>) {
  const source = map.getSource(id) as GeoJSONSource | undefined
  source?.setData(data)
}

export function preparePublicBuildings(map: LibreMap) {
  // Inspected https://tiles.openfreemap.org/styles/liberty on 2026-10-31:
  // openmaptiles / building; building-3d uses render_height/render_min_height.
  // Re-check the loaded style so a configured replacement does not invent fields.
  const style = map.getStyle()
  let building = style.layers.find(layer => layer.type === 'fill-extrusion' && 'source-layer' in layer && layer['source-layer'] === 'building')
  // Only use the documented OpenFreeMap schema for a missing extrusion layer.
  // A custom provider's unknown fields never receive invented fallback heights.
  if (!building) {
    const flat = style.layers.find(layer => layer.type === 'fill' && layer['source-layer'] === 'building')
    const source = flat && 'source' in flat ? style.sources[flat.source] : undefined
    if (flat && 'source' in flat && source?.type === 'vector' && source.url?.startsWith('https://tiles.openfreemap.org/')) {
      const label = style.layers.find(layer => layer.type === 'symbol')?.id
      const layer: LayerSpecification = { id: 'carenori-public-buildings', type: 'fill-extrusion', source: flat.source, 'source-layer': 'building', minzoom: 14,
        filter: ['all', ['!', ['has', 'hide_3d']], ['>', ['get', 'render_height'], 0]],
        paint: { 'fill-extrusion-height': ['get', 'render_height'], 'fill-extrusion-base': ['get', 'render_min_height'], 'fill-extrusion-color': '#cfcfca', 'fill-extrusion-opacity': 0.8 } }
      map.addLayer(layer, label)
      building = layer
    }
  }
  if (!building || !('source' in building) || typeof building.source !== 'string' || !style.sources[building.source]) return
  if (!map.getLayer('carenori-building-footprints')) map.addLayer({ id: 'carenori-building-footprints', type: 'fill', source: building.source, 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': '#cfcfca', 'fill-outline-color': '#aaaFA9' } }, building.id)
}

function setPerspective(map: LibreMap, props: NavigationMapProps) {
  const pitch = props.view === '3d' ? 55 : 0
  if (Math.abs(map.getPitch() - pitch) > 0.1) map.jumpTo({ pitch })
  if (!map.getLayer('carenori-places')) return
  if (props.mode === 'public') {
    if (props.view === '3d' && map.getZoom() < 15) map.jumpTo({ zoom: 16 })
    map.getStyle().layers.filter(layer => layer.type === 'fill-extrusion').forEach(layer => map.setLayoutProperty(layer.id, 'visibility', props.view === '3d' ? 'visible' : 'none'))
    if (map.getLayer('carenori-building-footprints')) map.setLayoutProperty('carenori-building-footprints', 'visibility', props.view === '2d' ? 'visible' : 'none')
  } else {
    map.setFilter('demo-floor-slab', ['==', ['get', 'floor'], props.floor])
    map.setPaintProperty('demo-floor-slab', 'fill-extrusion-base', props.view === '3d' ? ['get', 'base'] : 0)
    map.setPaintProperty('demo-floor-slab', 'fill-extrusion-height', props.view === '3d' ? ['+', ['get', 'base'], 0.25] : 0.25)
    map.setLayoutProperty('carenori-route-ribbon', 'visibility', props.view === '3d' ? 'visible' : 'none')
    map.setLayoutProperty('carenori-route-line', 'visibility', props.view === '2d' ? 'visible' : 'none')
    // Upper-floor paths exist only on the selected schematic deck in 3D.
    map.setLayoutProperty('carenori-demo-paths', 'visibility', props.view === '2d' || props.floor === 0 ? 'visible' : 'none')
  }
  map.setLayoutProperty('carenori-places', 'symbol-height-offset', props.mode === 'demo' && props.view === '3d' ? ['+', ['*', ['get', 'floor'], demoFloorHeight], 0.7] : 0)
}

function updateMapData(map: LibreMap, props: NavigationMapProps) {
  updateGeoJSON(map, 'carenori-places', placeFeatures(props.places, props.mode, props.floor))
  map.setLayoutProperty('carenori-places', 'icon-image', ['case', ['==', ['get', 'id'], props.selectedId ?? ''], 'carenori-pin-selected', 'carenori-pin'])
  if (props.mode === 'demo') {
    const geometry = routeFeatures(props.route, props.nodes, props.floor)
    updateGeoJSON(map, 'carenori-route-lines', geometry.lines)
    updateGeoJSON(map, 'carenori-route-ribbons', geometry.ribbons)
    updateGeoJSON(map, 'carenori-demo-paths', pathFeatures(props.nodes, props.edges ?? [], props.floor))
  }
  updateGeoJSON(map, 'carenori-location', { type: 'FeatureCollection', features: props.mode === 'public' && props.position ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: props.position.coordinates } }] : [] })
  setPerspective(map, props)
}

export function NavigationMap(props: NavigationMapProps) {
  const { t, language, preferences } = useApp()
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LibreMap | null>(null)
  const initializedMap = useRef<LibreMap | null>(null)
  const attributionRef = useRef<AttributionControl | null>(null)
  const latest = useRef(props); latest.current = props
  const translator = useRef(t); translator.current = t
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [buildingsVisible, setBuildingsVisible] = useState(false)
  const hintId = useId()

  useEffect(() => {
    if (!container.current) return
    let disposed = false
    let loaded = false
    let map: LibreMap | null = null
    const report = (message: string) => {
      if (disposed) return
      setError(previous => previous === message ? previous : message)
      latest.current.onError(message)
    }
    setReady(false); setError('')
    try {
      const demo = props.mode === 'demo'
      map = new LibreMap({
        container: container.current,
        style: demo ? createDemoStyle() : publicMapStyle,
        center: demo ? [0.00005, 0.00005] : props.center ?? GRADY_CENTER,
        zoom: demo ? 17.8 : 16.4,
        minZoom: demo ? 16 : 3,
        maxZoom: 21,
        pitch: props.view === '3d' ? 55 : 0,
        maxPitch: 65,
        attributionControl: false,
        renderWorldCopies: false,
        canvasContextAttributes: { antialias: true },
        reduceMotion: preferences.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      })
      mapRef.current = map
      const attribution = new AttributionControl({ compact: false, ...(demo ? { customAttribution: translator.current('Fictional campus — not real directions') } : {}) })
      attributionRef.current = attribution
      map.addControl(attribution, 'bottom-right')
      const canvas = map.getCanvas()
      canvas.setAttribute('aria-label', translator.current('Interactive map. Use the equivalent place list for all actions.'))
      canvas.setAttribute('aria-describedby', hintId)
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); report('The map display is unavailable. Use List for the same places and actions.') })
      map.on('error', () => report(demo ? 'The demo map could not render. Use List and text directions.' : 'Public map tiles or style could not load. Use List; fictional places have not been substituted.'))
      map.on('moveend', () => {
        if (!map || disposed) return
        const position = map.getCenter()
        latest.current.onViewportChange([position.lng, position.lat])
        if (container.current) container.current.dataset.pitch = String(Math.round(map.getPitch()))
      })
      map.on('idle', () => {
        if (!map || demo || disposed) return
        const layers = map.getStyle().layers.filter(layer => layer.type === 'fill-extrusion').map(layer => layer.id)
        const rendered = layers.length ? map.queryRenderedFeatures({ layers }) : []
        setBuildingsVisible(rendered.some(feature => Number(feature.properties.render_height) > 0))
      })
      map.on('style.load', () => {
        if (!map || disposed) return
        loaded = true
        try {
          if (!demo) preparePublicBuildings(map)
          if (!map.hasImage('carenori-pin')) map.addImage('carenori-pin', pinImage(false), { pixelRatio: 2 })
          if (!map.hasImage('carenori-pin-selected')) map.addImage('carenori-pin-selected', pinImage(true), { pixelRatio: 2 })
          if (map.getSource('carenori-places')) return
          map.addSource('carenori-places', { type: 'geojson', data: placeFeatures(latest.current.places, latest.current.mode, latest.current.floor) })
          map.addSource('carenori-location', { type: 'geojson', data: emptyCollection() })
          map.addLayer({ id: 'carenori-location', type: 'circle', source: 'carenori-location', paint: { 'circle-radius': 10, 'circle-color': '#175ca4', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } })
          if (demo) {
            for (const source of ['carenori-demo-paths', 'carenori-route-lines', 'carenori-route-ribbons']) map.addSource(source, { type: 'geojson', data: emptyCollection() })
            const layers: LayerSpecification[] = [
              { id: 'carenori-demo-paths', type: 'line', source: 'carenori-demo-paths', paint: { 'line-color': '#738e85', 'line-width': 3, 'line-dasharray': [2, 2] } },
              { id: 'carenori-route-line', type: 'line', source: 'carenori-route-lines', paint: { 'line-color': '#6b26a2', 'line-width': 7 }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
              { id: 'carenori-route-ribbon', type: 'fill-extrusion', source: 'carenori-route-ribbons', paint: { 'fill-extrusion-color': '#6b26a2', 'fill-extrusion-base': ['+', ['*', ['get', 'floor'], demoFloorHeight], 0.3], 'fill-extrusion-height': ['+', ['*', ['get', 'floor'], demoFloorHeight], 0.7], 'fill-extrusion-opacity': 1 } },
            ]
            layers.forEach(layer => map!.addLayer(layer))
          }
          map.addLayer({ id: 'carenori-places', type: 'symbol', source: 'carenori-places', layout: { 'icon-image': 'carenori-pin', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': 1, 'symbol-height-offset': 0 } })
          initializedMap.current = map
          updateMapData(map, latest.current)
          setReady(true)
        } catch { report('The map display is unavailable. Use List for the same places and actions.') }
      })
      map.on('click', 'carenori-places', event => { const id = event.features?.[0]?.properties?.id; if (typeof id === 'string') latest.current.onSelect(id) })
      map.on('mouseenter', 'carenori-places', () => { if (map) map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'carenori-places', () => { if (map) map.getCanvas().style.cursor = '' })
    } catch { report('The map display is unavailable. Use List for the same places and actions.') }
    const timer = window.setTimeout(() => { if (!loaded) report('The map has not loaded. Use List or try the map again when your connection is available.') }, 20000)
    const observer = new ResizeObserver(() => map?.resize())
    if (container.current) observer.observe(container.current)
    return () => { disposed = true; window.clearTimeout(timer); observer.disconnect(); map?.remove(); mapRef.current = null; initializedMap.current = null; attributionRef.current = null }
    // Recreate only for an explicit data-mode change. Camera/data updates stay local.
  }, [props.mode, hintId, preferences.reducedMotion])

  useEffect(() => {
    const map = mapRef.current
    // Effects in a mode-changing render can still see the previous ready=true.
    // Only update the exact map whose custom sources/layers have finished loading.
    if (!ready || !map || initializedMap.current !== map) return
    updateMapData(map, props)
  }, [ready, props.places, props.selectedId, props.mode, props.floor, props.route, props.nodes, props.edges, props.view, props.position])

  useEffect(() => {
    if (!props.center || !mapRef.current || props.mode === 'demo') return
    mapRef.current.jumpTo({ center: props.center })
  }, [props.center?.[0], props.center?.[1], props.mode])
  useEffect(() => { mapRef.current?.jumpTo({ bearing: 0, pitch: latest.current.view === '3d' ? 55 : 0 }) }, [props.resetKey])
  useEffect(() => { mapRef.current?.getCanvas().setAttribute('aria-label', t('Interactive map. Use the equivalent place list for all actions.')) }, [language, t])
  useEffect(() => {
    const map = mapRef.current
    if (!map || props.mode !== 'demo') return
    if (attributionRef.current) map.removeControl(attributionRef.current)
    const attribution = new AttributionControl({ compact: false, customAttribution: translator.current('Fictional campus — not real directions') })
    map.addControl(attribution, 'bottom-right'); attributionRef.current = attribution
  }, [language, props.mode])

  const zoom = (difference: number) => {
    const map = mapRef.current
    if (map) map.jumpTo({ zoom: Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + difference)) })
  }
  const fitResults = () => {
    const map = mapRef.current
    if (!map || !props.places.length) return
    const bounds = new LngLatBounds()
    props.places.forEach(place => bounds.extend(place.coordinates))
    map.fitBounds(bounds, { padding: 65, maxZoom: 17, duration: 0 })
  }
  return <section className="navigation-map" aria-label={t(props.mode === 'demo' ? 'Fictional campus map' : 'Public places map')} data-map-mode={props.mode} data-map-view={props.view} data-map-ready={ready}>
    <div className="map-zoom-controls button-row"><button className="btn btn-secondary" disabled={!ready} onClick={() => zoom(1)}>{t('Zoom in')}</button><button className="btn btn-secondary" disabled={!ready} onClick={() => zoom(-1)}>{t('Zoom out')}</button><button className="btn btn-secondary" disabled={!ready || !props.places.length} onClick={fitResults}>{t('Fit to results')}</button><p id={hintId} className="small-note">{t('Pan with arrow keys or drag. Use the place list for equivalent actions.')}</p></div>
    {error && <p className="inline-notice" role="status">{t(error)}</p>}
    {!ready && !error && <p role="status">{t('Loading map…')}</p>}
    <div ref={container} className="map-canvas" />
    <p className="small-note">{t(props.mode === 'demo' ? props.floor === 1 ? 'Upper floor only. The raised route is fictional indoor geometry, not a street path or GPS position.' : 'Ground floor only. Coordinates and building heights are fictional and are not real directions.' : '3D uses real geographic footprints with provider height estimates, including defaults where surveyed heights are missing. It is not photorealistic imagery or an indoor survey.')}</p>
    {props.mode === 'public' && props.view === '3d' && ready && <p className="small-note" role="status" data-building-volumes={buildingsVisible}>{t(buildingsVisible ? 'Building volumes are rendered in this view.' : 'No building volumes are visible yet. Zoom in or wait for map tiles; tilting alone does not create 3D geometry.')}</p>}
  </section>
}

export default NavigationMap
