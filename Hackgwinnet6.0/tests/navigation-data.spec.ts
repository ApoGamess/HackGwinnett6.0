import { expect, test } from '@playwright/test'
import seedJson from '../src/navigation/seed.json' with { type: 'json' }
import { NavigationRepository, REPORTS_STORAGE_KEY, campusRepository } from '../src/navigation/repository'
import { computeGraphRoute, computeRoute, DEFAULT_ROUTE_PROFILE } from '../src/navigation/route'
import { buildOverpassQuery, clearPublicCache, MAX_PUBLIC_ELEMENTS, MAX_RESPONSE_BYTES, parseOverpassResponse, PublicSearchError, searchPublicPlaces } from '../src/navigation/overpass'
import type { FeatureKey, NavigationSeed, RouteEdge } from '../src/navigation/types'

const seed = seedJson as unknown as NavigationSeed
const retrievedAt = '2026-10-31T12:00:00.000Z'
const fixture = { elements: [
  { type: 'way', id: 100, center: { lon: 13.388, lat: 52.517 }, timestamp: '2025-01-03T10:00:00Z', tags: { amenity: 'clinic', name: 'Public clinic', 'check_date': '2025-06-01', 'wheelchair:description': 'Please ask about the side entrance.' } },
  { type: 'node', id: 101, lon: 13.3881, lat: 52.5171, timestamp: '2025-02-02T10:00:00Z', tags: { entrance: 'yes', wheelchair: 'yes', 'survey:date': '2025-01-02' } },
  { type: 'node', id: 102, lon: 13.3882, lat: 52.5172, tags: { amenity: 'toilets', wheelchair: 'limited', 'wheelchair:description': 'Restricted turning area.' } },
  { type: 'node', id: 103, lon: 13.3883, lat: 52.5173, tags: { highway: 'elevator', name: 'Mapped elevator' } },
] }
function memoryStorage() {
  const records = new Map<string, string>()
  return { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value) }, removeItem: (key: string) => { records.delete(key) }, records }
}
const originalFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = originalFetch; clearPublicCache() })

test('replacement seed has exact required table counts, stable IDs and valid foreign keys', () => {
  expect([seed.places.length, seed.accessibility_features.length, seed.route_nodes.length, seed.route_edges.length, seed.communication_phrases.length, seed.sample_documents.length, seed.accessibility_reports.length]).toEqual([18, 30, 19, 23, 24, 1, 0])
  expect(seed.metadata.originalStarterAvailable).toBe(false)
  expect(seed.metadata.origin).toBe('authored_replacement')
  expect(seed.metadata.disclosure).toContain('route_demo.py were not used')
  const placeIds = new Set(seed.places.map(place => place.id))
  const nodeIds = new Set(seed.route_nodes.map(node => node.id))
  expect(placeIds.size).toBe(18); expect(nodeIds.size).toBe(19)
  expect(new Set(seed.route_edges.map(edge => edge.id)).size).toBe(23)
  expect(new Set(seed.communication_phrases.map(phrase => phrase.id)).size).toBe(24)
  expect(seed.places.every(place => place.fictional && place.routeNodeId && nodeIds.has(place.routeNodeId))).toBe(true)
  expect(seed.accessibility_features.every(feature => placeIds.has(feature.placeId) && ['yes', 'no', 'limited', 'unknown'].includes(feature.state))).toBe(true)
  expect(seed.route_edges.every(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.distanceMeters > 0)).toBe(true)
  expect(seed.sample_documents.every(document => placeIds.has(document.placeId) && document.fictional)).toBe(true)
  expect(seed.communication_phrases.every(phrase => phrase.text.trim() && phrase.textEs.trim() && phrase.group && phrase.groupEs)).toBe(true)
  expect(Object.isFrozen(campusRepository.getNodes())).toBe(true)
  expect(Object.isFrozen(campusRepository.getPlace('demo-parking', 'demo'))).toBe(true)
})

test('Dijkstra computes A, then B, then no supported route; distances sum actual graph edges', () => {
  const direct = computeRoute('parking', 'consultation')
  const alternate = computeRoute('parking', 'consultation', DEFAULT_ROUTE_PROFILE, ['A'])
  const blocked = computeRoute('parking', 'consultation', DEFAULT_ROUTE_PROFILE, ['A', 'B'])
  expect(direct.status).toBe('ok'); expect(direct.edgeIds).toContain('elevator-a'); expect(direct.edgeIds).not.toContain('elevator-b')
  expect(alternate.status).toBe('ok'); expect(alternate.edgeIds).toContain('elevator-b'); expect(alternate.edgeIds).not.toContain('elevator-a')
  expect(alternate.totalMeters).toBeGreaterThan(direct.totalMeters)
  expect(direct.totalMeters).toBe(176); expect(alternate.totalMeters).toBe(242)
  for (const result of [direct, alternate]) {
    const length = result.edgeIds.reduce((sum, id) => sum + seed.route_edges.find(edge => edge.id === id)!.distanceMeters, 0)
    expect(result.totalMeters).toBe(length)
    expect(result.nodeIds).toHaveLength(result.edgeIds.length + 1)
    expect(result.directions.map(direction => direction.edgeId)).toEqual(result.edgeIds)
    expect(result.directions.some(direction => direction.floor !== direction.toFloor)).toBe(true)
    expect(result.edgeIds.every(id => seed.route_edges.find(edge => edge.id === id)?.kind !== 'stairs')).toBe(true)
  }
  expect(blocked.status).toBe('unavailable')
  expect(blocked.reason).toBe('The available data does not support a route under these constraints.')
  expect(blocked.nodeIds).toEqual([]); expect(blocked.edgeIds).toEqual([])
  expect(blocked.excluded.filter(edge => edge.code === 'closed').map(edge => edge.edgeId)).toEqual(['elevator-a', 'elevator-b'])
  expect(blocked.excluded.some(edge => edge.code === 'stairs')).toBe(true)
  expect(blocked.excluded.some(edge => edge.code === 'unknown')).toBe(true)
})

test('strict routing rejects unknown measurements, closed segments and every selected numeric/surface constraint', () => {
  const base = seed.route_edges.find(edge => edge.id === 'elevator-a')!
  const nodes = seed.route_nodes.filter(node => [base.from, base.to].includes(node.id))
  const cases: [Partial<RouteEdge>, string][] = [[{ widthCm: null }, 'unknown'], [{ inclinePercent: null }, 'unknown'], [{ kerbCm: null }, 'unknown'], [{ surface: null }, 'unknown'], [{ open: null }, 'unknown'], [{ open: false }, 'closed'], [{ widthCm: 80 }, 'width'], [{ inclinePercent: -9 }, 'incline'], [{ kerbCm: 5 }, 'kerb'], [{ surface: 'gravel' }, 'surface'], [{ kind: 'stairs' }, 'stairs'], [{ distanceMeters: -1 }, 'invalid']]
  for (const [patch, code] of cases) {
    const result = computeGraphRoute(nodes, [{ ...base, ...patch }], base.from, base.to)
    expect(result.status, code).toBe('unavailable')
    expect(result.excluded[0]?.code).toBe(code)
  }
  expect(computeRoute('parking', 'consultation', { ...DEFAULT_ROUTE_PROFILE, minWidthCm: 200 }).status).toBe('unavailable')
  expect(computeRoute('parking', 'consultation', { ...DEFAULT_ROUTE_PROFILE, allowedSurfaces: [] }).status).toBe('unavailable')
  expect(computeRoute('missing', 'consultation').status).toBe('unavailable')
  expect(computeGraphRoute(nodes, [{ ...base, open: false }], base.from, base.to).excluded[0]?.reason).toContain('marked closed in the demo data')
  expect(computeGraphRoute(nodes, [{ ...base, widthCm: undefined } as unknown as RouteEdge], base.from, base.to).excluded[0]?.code).toBe('unknown')
})

test('routing honors one-way segments and describes a reversed elevator journey accurately', () => {
  const elevator = seed.route_edges.find(edge => edge.id === 'elevator-a')!
  const nodes = seed.route_nodes.filter(node => [elevator.from, elevator.to].includes(node.id))
  const oneWay = { ...elevator, bidirectional: false }
  expect(computeGraphRoute(nodes, [oneWay], elevator.from, elevator.to).status).toBe('ok')
  expect(computeGraphRoute(nodes, [oneWay], elevator.to, elevator.from).status).toBe('unavailable')
  const reverse = computeGraphRoute(nodes, [elevator], elevator.to, elevator.from)
  expect(reverse.nodeIds).toEqual([elevator.to, elevator.from])
  expect(reverse.totalMeters).toBe(elevator.distanceMeters)
  expect(reverse.directions[0]).toMatchObject({ fromId: elevator.to, toId: elevator.from, floor: 1, toFloor: 0 })
  expect(reverse.directions[0].text).toContain('from floor 1 to floor 0')
  const samePlace = computeGraphRoute(nodes, [elevator], elevator.from, elevator.from)
  expect(samePlace.status).toBe('ok'); expect(samePlace.totalMeters).toBe(0); expect(samePlace.directions).toEqual([])
})

test('public importer preserves unknowns, partial access, comments, centers and distinct source dates', () => {
  const records = parseOverpassResponse(fixture, retrievedAt)
  const clinic = records.places.find(place => place.id === 'osm-way-100')!
  expect(clinic.fictional).toBe(false); expect(clinic.coordinateKind).toBe('center'); expect(clinic.providerId).toBeUndefined(); expect(clinic.routeNodeId).toBeUndefined()
  expect(clinic.source.updatedAt).toBe('2025-01-03T10:00:00Z'); expect(clinic.source.retrievedAt).toBe(retrievedAt)
  expect(clinic.source.inspectedAt).toBeUndefined()
  expect(clinic.osm?.tags.check_date).toBe('2025-06-01')
  expect(clinic.notes).toContain('Please ask about the side entrance.')
  expect(records.features.find(feature => feature.placeId === clinic.id && feature.key === 'wheelchair')?.state).toBe('unknown')
  expect(records.features.find(feature => feature.placeId === 'osm-node-102' && feature.key === 'accessibleRestroom')?.state).toBe('limited')
  expect(records.places.find(place => place.id === 'osm-node-101')?.source.inspectedAt).toBe('2025-01-02')
  expect(records.features.find(feature => feature.placeId === 'osm-node-103' && feature.key === 'elevator')?.description).toContain('current operating status is unknown')
  expect(records.places.every(place => !place.providerId && !place.routeNodeId)).toBe(true)
})

test('public tag interpretation preserves conflicting access and does not invent absent ramps', () => {
  const tags: Record<string, string>[] = [
    { highway: 'steps', 'ramp:wheelchair': 'no' },
    { entrance: 'yes', wheelchair: 'yes', step_count: '3', 'ramp:wheelchair': 'no' },
    { entrance: 'yes', wheelchair: 'yes', 'ramp:portable': 'yes' },
    { amenity: 'parking', 'capacity:disabled': 'yes' },
    { amenity: 'parking', 'capacity:disabled': 'no' },
    { highway: 'steps', 'ramp:wheelchair': 'yes', step_count: '8' },
    { amenity: 'clinic', wheelchair: 'designated', bench: 'designated', 'ramp:wheelchair': 'designated' },
  ]
  const records = parseOverpassResponse({ elements: tags.map((value, index) => ({ type: 'node', id: 200 + index, lon: 13.388, lat: 52.517, tags: value })) }, retrievedAt)
  const state = (id: number, key: FeatureKey) => records.features.find(feature => feature.placeId === `osm-node-${id}` && feature.key === key)?.state
  expect(records.places.some(place => place.id === 'osm-node-200')).toBe(false)
  expect(state(201, 'stepFree')).toBe('unknown'); expect(state(201, 'ramp')).toBe('no')
  expect(state(202, 'stepFree')).toBe('unknown')
  expect(state(203, 'accessibleParking')).toBe('yes'); expect(state(204, 'accessibleParking')).toBe('no')
  expect(records.places.find(place => place.id === 'osm-node-205')?.category).toBe('ramp')
  expect(state(205, 'ramp')).toBe('yes'); expect(state(205, 'stepFree')).toBe('unknown')
  expect(state(206, 'wheelchair')).toBe('yes'); expect(state(206, 'seating')).toBe('unknown'); expect(state(206, 'ramp')).toBe('unknown')
  expect(records.places.find(place => place.id === 'osm-node-201')?.osm?.tags.step_count).toBe('3')
})

test('impossible source dates remain unknown and raw survey tags stay inspectable', () => {
  const invalid = parseOverpassResponse({ elements: [{ ...fixture.elements[0], timestamp: '2025-02-31T10:00:00Z', tags: { amenity: 'clinic', 'survey:date': '2025-02-31' } }] }, retrievedAt).places[0]
  expect(invalid.source.updatedAt).toBeUndefined(); expect(invalid.source.inspectedAt).toBeUndefined()
  expect(invalid.source.retrievedAt).toBe(retrievedAt); expect(invalid.osm?.tags['survey:date']).toBe('2025-02-31')
  const leapDay = parseOverpassResponse({ elements: [{ ...fixture.elements[0], tags: { amenity: 'clinic', 'survey:date': '2024-02-29' } }] }, retrievedAt).places[0]
  expect(leapDay.source.inspectedAt).toBe('2024-02-29')
})

test('repository separates modes, deduplicates OSM imports, filters only explicit yes and never attaches nearby entrances', () => {
  const repo = new NavigationRepository(seed, null)
  expect(repo.listPlaces('public')).toEqual([])
  const records = parseOverpassResponse({ elements: [...fixture.elements, fixture.elements[0]] }, retrievedAt)
  repo.importPublic(records); repo.importPublic(records)
  expect(repo.listPlaces('public')).toHaveLength(4)
  expect(repo.listPlaces('demo')).toHaveLength(18)
  expect(repo.listPlaces('public').every(place => !place.fictional)).toBe(true)
  expect(repo.listPlaces('public', { featureKeys: ['wheelchair'] }).map(place => place.id)).toEqual(['osm-node-101'])
  expect(repo.getFeatureState('demo-healthcare', 'wheelchairLoan', 'demo')).toBe('unknown')
  expect(() => repo.importPublic({ ...records, places: [seed.places[0]] })).toThrow(/public OSM/)
  expect(() => repo.importPublic({ ...records, places: [{ ...records.places[0], providerId: 'nearby-clinic' }] })).toThrow(/public OSM/)
  expect(() => repo.importPublic({ ...records, places: [{ ...records.places[0], coordinateKind: 'node' }] })).toThrow(/public OSM/)
  expect(() => repo.importPublic({ ...records, features: [{ ...records.features[0], id: 'demo-feature' }] })).toThrow(/identity/)
  expect(repo.listPlaces('public')).toHaveLength(4)
  repo.importPublic(parseOverpassResponse({ elements: [] }, retrievedAt))
  expect(repo.listPlaces('public')).toHaveLength(0); expect(repo.listPlaces('demo')).toHaveLength(18)
})

test('reports persist explicitly as local unverified records and cannot mutate source access or close routes', () => {
  const storage = memoryStorage()
  const repo = new NavigationRepository(seed, storage)
  const before = repo.getFeatureState('demo-elevator-a', 'elevator', 'demo')
  const report = repo.addReport({ mode: 'demo', targetId: 'demo-elevator-a', kind: 'lift_problem', note: 'The doors appear blocked in this fictional test.' })
  expect(report.status).toBe('unverified_local'); expect(report.targetName).toBe('Elevator A')
  expect([...storage.records.keys()]).toEqual([REPORTS_STORAGE_KEY])
  expect(repo.getFeatureState('demo-elevator-a', 'elevator', 'demo')).toBe(before)
  expect(computeRoute('parking', 'consultation').edgeIds).toContain('elevator-a')
  expect(new NavigationRepository(seed, storage).listReports('demo')).toHaveLength(1)
  expect(repo.listReports('public')).toHaveLength(0)
  repo.clearReports('demo'); expect(repo.listReports()).toHaveLength(0)
  const unavailable = new NavigationRepository(seed, { getItem: () => null, setItem: () => { throw new Error('blocked') }, removeItem: () => {} })
  expect(() => unavailable.addReport({ mode: 'demo', targetId: 'demo-ramp', kind: 'blocked_ramp', note: 'Test barrier.' })).toThrow(/not saved/)
  expect(unavailable.listReports()).toHaveLength(0)
})

test('Overpass query bounds are validated and public payloads reject oversized/incomplete responses', () => {
  expect(buildOverpassQuery({ center: [13.388, 52.517], radiusMeters: 800 })).toContain('(around:800,52.517,13.388)')
  expect(buildOverpassQuery({ center: [13.388, 52.517] })).toContain('out meta center')
  expect(() => buildOverpassQuery({ center: [13, 52], radiusMeters: 1501 })).toThrow(PublicSearchError)
  expect(() => buildOverpassQuery({ center: [Infinity, 52] })).toThrow(PublicSearchError)
  expect(() => buildOverpassQuery({ bbox: [-180, -85, 180, 85] })).toThrow(PublicSearchError)
  expect(() => buildOverpassQuery({ bbox: [-180, 0, 180, 0.001] })).toThrow(PublicSearchError)
  expect(() => buildOverpassQuery({ bbox: [-179.999, 0, 179.999, 0.001] })).toThrow(PublicSearchError)
  expect(() => buildOverpassQuery({ bbox: [13.38, 52.51, 13.39, 52.52] })).not.toThrow()
  expect(() => parseOverpassResponse({ elements: [], remark: 'timeout' })).toThrow(/incomplete/)
  expect(() => parseOverpassResponse({ wrong: [] })).toThrow(/validated/)
  expect(() => parseOverpassResponse({ elements: Array(MAX_PUBLIC_ELEMENTS + 1).fill(fixture.elements[0]) })).toThrow(/too much data/)
})

test('public fetch is explicit, cached without refreshing source dates, cancellable and honest on failures', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify(fixture), { headers: { 'content-type': 'application/json' } }) }
  expect(calls).toBe(0)
  const first = await searchPublicPlaces({ center: [13.388, 52.517], radiusMeters: 800 })
  const cached = await searchPublicPlaces({ center: [13.388, 52.517], radiusMeters: 800 })
  expect(calls).toBe(1); expect(first.cached).toBe(false); expect(cached.cached).toBe(true); expect(cached.retrievedAt).toBe(first.retrievedAt)
  clearPublicCache()
  globalThis.fetch = async () => new Response('unavailable', { status: 503 })
  await expect(searchPublicPlaces({ center: [13.388, 52.517] })).rejects.toThrow(/unavailable/)
  globalThis.fetch = async () => new Response('{}', { headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) } })
  await expect(searchPublicPlaces({ center: [13.388, 52.517] })).rejects.toThrow(/too much data/)
  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }))
  const controller = new AbortController()
  const pending = searchPublicPlaces({ center: [13.388, 52.517], signal: controller.signal })
  controller.abort()
  await expect(pending).rejects.toHaveProperty('name', 'AbortError')
})

test('a late response after cancellation cannot be returned or populate the public cache', async () => {
  let calls = 0
  let respond!: (response: Response) => void
  globalThis.fetch = async () => { calls += 1; return new Promise(resolve => { respond = resolve }) }
  const controller = new AbortController()
  const pending = searchPublicPlaces({ center: [13.388, 52.517], signal: controller.signal })
  controller.abort()
  respond(new Response(JSON.stringify(fixture)))
  await expect(pending).rejects.toHaveProperty('name', 'AbortError')
  globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify(fixture)) }
  const next = await searchPublicPlaces({ center: [13.388, 52.517] })
  expect(calls).toBe(2); expect(next.cached).toBe(false)
})

test('streamed oversized responses are stopped even without a content-length header', async () => {
  let cancelled = false
  globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1)) },
    cancel() { cancelled = true },
  }))
  await expect(searchPublicPlaces({ center: [13.388, 52.517] })).rejects.toThrow(/too much data/)
  expect(cancelled).toBe(true)
})
