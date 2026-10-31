import type { AccessibilityFeature, AccessState, FeatureKey, Place, PlaceCategory, PublicRecords, SourceMetadata } from './types'

// OSM's documented query syntax and feature meanings:
// https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL
// https://wiki.openstreetmap.org/wiki/Key:wheelchair
// https://wiki.openstreetmap.org/wiki/Key:entrance
// https://wiki.openstreetmap.org/wiki/Tag:highway%3Delevator
// https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dtoilets
// https://wiki.openstreetmap.org/wiki/Key:ramp
// https://wiki.openstreetmap.org/wiki/Key:capacity:disabled
// The `out ... center` coordinate of a way/relation is a display center, never an entrance.
export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'
export const MAX_RADIUS_METERS = 1500
export const MAX_PUBLIC_ELEMENTS = 1500
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const CACHE_MS = 5 * 60 * 1000
const TIMEOUT_MS = 20000
const MIN_REQUEST_INTERVAL_MS = 1500
export interface PublicSearchOptions {
  center?: readonly [number, number]
  radiusMeters?: number
  /** West, south, east, north. Antimeridian crossing is deliberately unsupported. */
  bbox?: readonly [number, number, number, number]
  signal?: AbortSignal
}
export class PublicSearchError extends Error {
  constructor(public readonly code: 'bounds' | 'network' | 'timeout' | 'response' | 'size', message: string, public readonly messageEs: string) { super(message); this.name = 'PublicSearchError' }
}
const invalidArea = () => new PublicSearchError('bounds', 'Choose a valid area no wider than 3 km, or a radius from 100 to 1500 m.', 'Elige una zona de no más de 3 km de ancho o un radio de entre 100 y 1500 m.')
const badResponse = () => new PublicSearchError('response', 'The public data response could not be validated. No sample data has been substituted.', 'No se pudo validar la respuesta de datos públicos. No se sustituyó por datos de ejemplo.')
const tooLarge = () => new PublicSearchError('size', 'This area returned too much data. Search a smaller area.', 'Esta zona devolvió demasiados datos. Busca en una zona más pequeña.')

export function straightLineMeters(first: readonly [number, number], second: readonly [number, number]): number {
  const radians = Math.PI / 180
  const latitude = (second[1] - first[1]) * radians
  const longitude = (second[0] - first[0]) * radians
  const a = Math.sin(latitude / 2) ** 2 + Math.cos(first[1] * radians) * Math.cos(second[1] * radians) * Math.sin(longitude / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}
const validCoordinates = (coords: readonly number[]) => coords.length === 2 && coords.every(Number.isFinite) && Math.abs(coords[0]) <= 180 && Math.abs(coords[1]) <= 85
export function buildOverpassQuery(options: Omit<PublicSearchOptions, 'signal'>): string {
  let area: string
  if (options.bbox) {
    if (options.center || options.bbox.length !== 4) throw invalidArea()
    const [west, south, east, north] = options.bbox
    // Haversine uses the shortest spherical arc. A nearly world-wide longitude
    // span can otherwise look like a tiny box across the antimeridian.
    if (!validCoordinates([west, south]) || !validCoordinates([east, north]) || west >= east || south >= north || east - west > 180
      || straightLineMeters([west, south], [east, north]) > MAX_RADIUS_METERS * 2) throw invalidArea()
    area = `(${south},${west},${north},${east})`
  } else {
    const radius = options.radiusMeters ?? 750
    if (!options.center || !validCoordinates(options.center) || !Number.isFinite(radius) || radius < 100 || radius > MAX_RADIUS_METERS) throw invalidArea()
    area = `(around:${Math.round(radius)},${options.center[1]},${options.center[0]})`
  }
  // Nearby facilities remain independent records; no nearest-entrance relationship is inferred.
  const selectors = [
    '["amenity"~"^(hospital|clinic|doctors|pharmacy)$"]', '["healthcare"]', '["building"="hospital"]', '["entrance"]',
    '["highway"="elevator"]', '["amenity"="toilets"]', '["amenity"="parking"]', '["amenity"="parking_space"]["parking_space"="drop_off"]',
    '["amenity"="parking_space"]["parking_space"="disabled"]', '["ramp:wheelchair"~"^(yes|limited)$"]', '["amenity"="bench"]',
    '["amenity"="reception_desk"]', '["information"="office"]',
  ]
  return `[out:json][timeout:15][maxsize:10000000];(${selectors.map(selector => `nwr${selector}${area};`).join('')});out meta center;`
}

const featureLabels: Record<FeatureKey, [string, string]> = {
  wheelchair: ['Wheelchair access', 'Acceso para silla de ruedas'], stepFree: ['Step-free entrance or path', 'Entrada o camino sin escalones'], ramp: ['Ramp', 'Rampa'],
  elevator: ['Elevator listed', 'Ascensor registrado'], accessibleParking: ['Accessible parking', 'Estacionamiento accesible'], accessibleRestroom: ['Accessible restroom', 'Baño accesible'],
  quiet: ['Quiet waiting option', 'Opción de espera tranquila'], seating: ['Seating', 'Asientos'], writtenCommunication: ['Written communication', 'Comunicación escrita'],
  wheelchairAssistance: ['Wheelchair assistance', 'Asistencia con silla de ruedas'], wheelchairLoan: ['Wheelchair loan availability', 'Disponibilidad de préstamo de sillas de ruedas'],
}
const categoryNames: Partial<Record<PlaceCategory, [string, string]>> = {
  healthcare: ['Unnamed healthcare facility', 'Centro de salud sin nombre'], pharmacy: ['Unnamed pharmacy', 'Farmacia sin nombre'], entrance: ['Unnamed entrance', 'Entrada sin nombre'],
  elevator: ['Elevator', 'Ascensor'], restroom: ['Restroom', 'Baño'], parking: ['Parking', 'Estacionamiento'], ramp: ['Ramp', 'Rampa'], waiting: ['Seating area', 'Zona de asientos'],
}
function categoryFor(tags: Record<string, string>): PlaceCategory | undefined {
  if (tags.amenity === 'pharmacy' || tags.healthcare === 'pharmacy') return 'pharmacy'
  if (tags.healthcare && !['no', 'proposed'].includes(tags.healthcare) || ['hospital', 'clinic', 'doctors'].includes(tags.amenity) || tags.building === 'hospital') return 'healthcare'
  if (tags.entrance && !['no', 'exit'].includes(tags.entrance)) return 'entrance'
  if (tags.highway === 'elevator') return 'elevator'
  if (tags.amenity === 'toilets') return 'restroom'
  if (tags.amenity === 'parking_space' && tags.parking_space === 'drop_off') return 'dropoff'
  if (tags.amenity === 'parking' || tags.amenity === 'parking_space') return 'parking'
  if (tags.amenity === 'reception_desk') return 'reception'
  if (tags.information === 'office') return 'assistance'
  // A tag explicitly recording an absent ramp must never create a ramp pin.
  if (['yes', 'limited'].includes(tags['ramp:wheelchair'])) return 'ramp'
  if (tags.amenity === 'bench') return 'waiting'
  return undefined
}
const accessState = (value: string | undefined, allowDesignated = false): AccessState => value === 'yes' || (allowDesignated && value === 'designated') ? 'yes' : value === 'no' ? 'no' : value === 'limited' ? 'limited' : 'unknown'
function statesFor(tags: Record<string, string>, category: PlaceCategory): Record<FeatureKey, AccessState> {
  const wheelchair = accessState(tags.wheelchair, true)
  const ramp = accessState(tags['ramp:wheelchair'])
  const stepCount = /^\d+$/.test(tags.step_count ?? '') ? Number(tags.step_count) : null
  const capacity = /^\d+$/.test(tags['capacity:disabled'] ?? '') ? Number(tags['capacity:disabled']) : null
  // Preserve contradictory source tags without turning an ambiguous entrance into
  // a positive step-free claim. A portable ramp also requires more information.
  const stepFree: AccessState = stepCount === 0 ? 'yes'
    : stepCount !== null && stepCount > 0 ? ramp === 'yes' || wheelchair === 'yes' ? 'unknown' : 'no'
      : category === 'entrance' && wheelchair === 'yes' && tags['ramp:portable'] !== 'yes' ? 'yes' : 'unknown'
  return {
    wheelchair,
    stepFree,
    ramp, elevator: category === 'elevator' ? 'yes' : 'unknown',
    accessibleParking: tags.parking_space === 'disabled' || (capacity !== null && capacity > 0) || tags['capacity:disabled'] === 'yes' ? 'yes' : capacity === 0 || tags['capacity:disabled'] === 'no' ? 'no' : 'unknown',
    accessibleRestroom: category === 'restroom' ? wheelchair : accessState(tags['toilets:wheelchair']),
    quiet: 'unknown', seating: tags.amenity === 'bench' ? 'yes' : accessState(tags.bench),
    writtenCommunication: 'unknown', wheelchairAssistance: 'unknown', wheelchairLoan: 'unknown',
  }
}
function sourceDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || !Number.isFinite(Date.parse(value))) return undefined
  // Date.parse normalizes impossible dates such as February 31. Do not expose
  // these as real source edit or field-survey dates.
  const day = value.slice(0, 10)
  return new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day ? value : undefined
}

/** Pure validated import. All original string tags remain available to the detail view. */
export function parseOverpassResponse(raw: unknown, retrievedAt = new Date().toISOString()): PublicRecords {
  if (!raw || typeof raw !== 'object' || !('elements' in raw) || !Array.isArray(raw.elements)) throw badResponse()
  if ('remark' in raw && raw.remark) throw new PublicSearchError('response', 'The public service returned incomplete results. Try a smaller area.', 'El servicio público devolvió resultados incompletos. Prueba una zona más pequeña.')
  if (raw.elements.length > MAX_PUBLIC_ELEMENTS) throw tooLarge()
  const places = new Map<string, Place>()
  const features = new Map<string, AccessibilityFeature>()
  for (const candidate of raw.elements) {
    if (!candidate || typeof candidate !== 'object') continue
    const element = candidate as Record<string, unknown>
    if (!['node', 'way', 'relation'].includes(String(element.type)) || !Number.isSafeInteger(element.id) || Number(element.id) <= 0 || !element.tags || typeof element.tags !== 'object' || Array.isArray(element.tags)) continue
    const tags = Object.fromEntries(Object.entries(element.tags).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    const category = categoryFor(tags)
    if (!category) continue
    const coordinateSource = element.type === 'node' ? element : element.center && typeof element.center === 'object' ? element.center as Record<string, unknown> : null
    if (!coordinateSource || typeof coordinateSource.lon !== 'number' || typeof coordinateSource.lat !== 'number') continue
    const coordinates: [number, number] = [coordinateSource.lon, coordinateSource.lat]
    if (!validCoordinates(coordinates)) continue
    const type = element.type as 'node' | 'way' | 'relation'
    const id = `osm-${type}-${element.id}`
    const source: SourceMetadata = {
      name: 'OpenStreetMap contributors', url: `https://www.openstreetmap.org/${type}/${element.id}`, retrievedAt,
      ...(sourceDate(element.timestamp) ? { updatedAt: sourceDate(element.timestamp) } : {}),
      // A source survey tag is separate from retrieval/update dates. check_date is preserved raw;
      // it may describe a remote check and is not asserted to be a field inspection.
      ...(sourceDate(tags['survey:date']) ? { inspectedAt: sourceDate(tags['survey:date']) } : {}),
    }
    const notes = ['wheelchair:description', 'wheelchair:description:en', 'description', 'note', 'fixme'].filter(key => tags[key]).map(key => `${key}: ${tags[key]}`).join('\n')
    const name = tags.name || tags['name:en'] || categoryNames[category]?.[0] || 'Unnamed public place'
    const place: Place = {
      id, name, nameEs: tags['name:es'] || tags.name || tags['name:en'] || categoryNames[category]?.[1] || name, category, coordinates,
      floor: /^-?\d+(?:\.\d+)?$/.test(tags.level ?? '') ? Number(tags.level) : null,
      fictional: false, source, osm: { type, id: Number(element.id), tags }, coordinateKind: type === 'node' ? 'node' : 'center',
      ...(notes ? { notes, notesEs: notes } : {}),
    }
    places.set(id, place)
    const values = statesFor(tags, category)
    ;(Object.keys(featureLabels) as FeatureKey[]).forEach(key => {
      const featureId = `${id}:${key}`
      features.set(featureId, {
        id: featureId, placeId: id, key, label: featureLabels[key][0], labelEs: featureLabels[key][1], state: values[key], source,
        description: values[key] === 'unknown' ? 'Not specified by the supported source tags. Ask the facility.' : key === 'elevator' ? 'An elevator is mapped. Its current operating status is unknown.' : 'Describes the source tags for this individual feature, not the whole facility. Check details before relying on it.',
        descriptionEs: values[key] === 'unknown' ? 'Las etiquetas admitidas no especifican esta información. Pregunta al centro.' : key === 'elevator' ? 'Hay un ascensor en el mapa. Se desconoce su estado de funcionamiento actual.' : 'Describe las etiquetas de esta característica, no de todo el centro. Consulta los detalles antes de confiar en ella.',
      })
    })
  }
  return { places: [...places.values()], features: [...features.values()], retrievedAt, cached: false }
}

const searchCache = new Map<string, { expires: number; records: PublicRecords }>()
let lastRequestAt = 0
let activeRequest = false
export function clearPublicCache() { searchCache.clear(); lastRequestAt = 0 }
/** Stale public records are offered explicitly after failure, never called live. */
export function getCachedPublicPlaces(options: PublicSearchOptions): PublicRecords | null {
  const entry = searchCache.get(buildOverpassQuery(options))
  return entry ? { ...structuredClone(entry.records), cached: true, stale: entry.expires <= Date.now() } : null
}

/** Called only by an explicit UI action. No automatic retries or movement listeners. */
export async function searchPublicPlaces(options: PublicSearchOptions): Promise<PublicRecords> {
  const query = buildOverpassQuery(options)
  if (options.signal?.aborted) throw new DOMException('Search cancelled.', 'AbortError')
  const cached = getCachedPublicPlaces(options)
  if (cached && !cached.stale) return cached
  if (activeRequest) throw new PublicSearchError('network', 'A public search is already in progress. Wait or cancel it before trying again.', 'Ya hay una búsqueda pública en curso. Espera o cancélala antes de volver a intentarlo.')
  activeRequest = true
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, TIMEOUT_MS)
  const ensureActive = () => { if (controller.signal.aborted) throw new DOMException('Search cancelled.', 'AbortError') }
  try {
    const delay = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt))
    if (delay) await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new DOMException('Search cancelled.', 'AbortError')) }
      const timer = setTimeout(() => { controller.signal.removeEventListener('abort', cancel); resolve() }, delay)
      controller.signal.addEventListener('abort', cancel, { once: true })
    })
    ensureActive()
    lastRequestAt = Date.now()
    // Only the bounded geographic selectors go to the official endpoint. Typed
    // visit notes and the local name filter never become public search queries.
    const response = await fetch(`${OVERPASS_ENDPOINT}?${new URLSearchParams({ data: query })}`, { signal: controller.signal })
    ensureActive()
    if (!response.ok) throw new PublicSearchError('network', 'Public place search is unavailable. Try again later or choose the clearly labeled demo campus.', 'La búsqueda de lugares públicos no está disponible. Inténtalo más tarde o elige el campus de ejemplo identificado como ficticio.')
    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (contentLength > MAX_RESPONSE_BYTES) { controller.abort(); throw tooLarge() }
    let text: string
    if (response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let size = 0
      let result = ''
      while (true) {
        const chunk = await reader.read()
        ensureActive()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw tooLarge() }
        result += decoder.decode(chunk.value, { stream: true })
      }
      text = result + decoder.decode()
    } else {
      text = await response.text()
      ensureActive()
      if (new TextEncoder().encode(text).length > MAX_RESPONSE_BYTES) throw tooLarge()
    }
    let raw: unknown
    try { raw = JSON.parse(text) } catch { throw badResponse() }
    const records = parseOverpassResponse(raw)
    ensureActive()
    searchCache.delete(query)
    searchCache.set(query, { expires: Date.now() + CACHE_MS, records: structuredClone(records) })
    while (searchCache.size > 6) searchCache.delete(searchCache.keys().next().value!)
    return records
  } catch (error) {
    if (options.signal?.aborted) throw new DOMException('Search cancelled.', 'AbortError')
    if (timedOut) throw new PublicSearchError('timeout', 'Public place search timed out. No results were substituted. Try a smaller area.', 'La búsqueda de lugares públicos agotó el tiempo. No se sustituyeron los resultados. Prueba una zona más pequeña.')
    if (error instanceof PublicSearchError) throw error
    throw new PublicSearchError('network', 'The public data service could not be reached. Your local demo is still available separately.', 'No se pudo conectar con el servicio de datos públicos. La demostración local sigue disponible por separado.')
  } finally { activeRequest = false; clearTimeout(timeout); options.signal?.removeEventListener('abort', abort) }
}
