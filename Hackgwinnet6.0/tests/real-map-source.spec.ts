import { expect, test } from '@playwright/test'
import seed from '../src/navigation/public-seed.json' with { type: 'json' }
import evidence from '../docs/grady-building-evidence.json' with { type: 'json' }
import { GRADY_CENTER, GRADY_PLACE_ID, gradyPublicSeed } from '../src/navigation/publicSeed'
import { NavigationRepository } from '../src/navigation/repository'
import { LocationSession, manualStartingPoint, type LocationFix } from '../src/navigation/geolocation'
import { clearPublicCache, getCachedPublicPlaces, searchPublicPlaces } from '../src/navigation/overpass'

test('Grady public seed has official address cross-check, OSM coordinates and honest source dates', () => {
  expect(gradyPublicSeed.places).toHaveLength(1)
  const place = gradyPublicSeed.places[0]
  expect(place).toMatchObject({ id: GRADY_PLACE_ID, name: 'Grady Memorial Hospital', coordinates: GRADY_CENTER, fictional: false, coordinateKind: 'center', floor: null })
  expect(place.address).toBe('80 Jesse Hill Jr Drive SE, Atlanta, GA 30303')
  expect(place.source.url).toBe('https://www.openstreetmap.org/way/270880941')
  expect(place.officialSource?.url).toBe(seed.official.url)
  expect(place.source.inspectedAt).toBeUndefined()
  expect(place.source.updatedAt).toBe('2020-12-23T03:32:07Z')
  expect(gradyPublicSeed.features.every(feature => feature.state === 'unknown')).toBe(true)
  const repo = new NavigationRepository(undefined, null)
  repo.importPublic(gradyPublicSeed); repo.importPublic(gradyPublicSeed)
  expect(repo.listPlaces('public', { query: 'grady' })).toHaveLength(1)
  expect(repo.listPlaces('demo').some(candidate => candidate.id === place.id)).toBe(false)
  expect(repo.getNodes().some(node => node.coordinates[0] === GRADY_CENTER[0])).toBe(false)
})

test('actual source evidence documents building volumes and provider estimates rather than invented hospital heights', () => {
  expect(evidence.buildingsInTile).toBeGreaterThan(0)
  expect(evidence.positiveRenderHeights).toBeGreaterThan(0)
  expect(evidence.hospitalAreaFootprints[0].properties.render_height).toBe(5)
  expect(evidence.caveat).toContain('no height or building:levels tag')
  expect(seed.elements[0].tags).not.toHaveProperty('height')
  expect(evidence.buildingLayers.filter(layer => layer.type === 'fill-extrusion')).toHaveLength(1)
})

test('geolocation owns one watcher, ignores late callbacks, validates fixes and labels manual positions', () => {
  const fixes: LocationFix[] = [], cleared: number[] = []
  let onPosition!: PositionCallback
  const session = new LocationSession({ watchPosition: success => { onPosition = success; return 42 }, clearWatch: id => cleared.push(id) })
  session.start(fix => fixes.push(fix), () => {})
  const deliver = onPosition
  deliver({ coords: { longitude: -84.38, latitude: 33.75, accuracy: 38 }, timestamp: 123456 } as GeolocationPosition)
  expect(fixes[0]).toMatchObject({ source: 'browser', accuracyMeters: 38, updatedAt: 123456 })
  session.stop(); deliver({ coords: { longitude: 0, latitude: 0, accuracy: 1 }, timestamp: 123457 } as GeolocationPosition)
  expect(cleared).toEqual([42]); expect(fixes).toHaveLength(1)
  const selected = manualStartingPoint(GRADY_CENTER, 123458)
  expect(selected).toMatchObject({ source: 'manual', accuracyMeters: null, updatedAt: 123458 })
  expect(() => manualStartingPoint([500, 20])).toThrow()
})

test('a failed refresh preserves dated public cache and never silently returns it as live', async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now
  let time = originalNow()
  Date.now = () => time
  clearPublicCache()
  try {
    globalThis.fetch = async () => new Response(JSON.stringify(seed))
    const first = await searchPublicPlaces({ center: GRADY_CENTER, radiusMeters: 800 })
    time += 6 * 60_000
    globalThis.fetch = async () => new Response('unavailable', { status: 503 })
    await expect(searchPublicPlaces({ center: GRADY_CENTER, radiusMeters: 800 })).rejects.toThrow()
    const cached = getCachedPublicPlaces({ center: GRADY_CENTER, radiusMeters: 800 })
    expect(cached).toMatchObject({ cached: true, stale: true, retrievedAt: first.retrievedAt })
    expect(getCachedPublicPlaces({ center: [0, 0], radiusMeters: 800 })).toBeNull()
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; clearPublicCache() }
})

test('real initial hospital remains usable in list mode and local search makes no discovery request', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('carenori-interface-settings-v1', JSON.stringify({ simplified: true })))
  let discoveryCalls = 0
  await page.route('https://overpass-api.de/**', route => { discoveryCalls++; return route.abort() })
  await page.goto('/#explore')
  await expect(page.getByRole('button', { name: /Explore public places/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('searchbox', { name: 'Search loaded places' }).fill('Grady')
  await page.locator('.place-result').click()
  await expect(page.locator('.place-detail')).toContainText(seed.official.address)
  await expect(page.locator('.place-detail')).toContainText('mapped area center, not an entrance')
  await expect(page.getByRole('link', { name: /Open in external map/ })).toHaveAttribute('href', /mlat=33.7517332/)
  expect(discoveryCalls).toBe(0)
})

test('manual starting point is explicit and live watcher stops on user action and navigation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('carenori-interface-settings-v1', JSON.stringify({ simplified: true }))
    const state = window as Window & { locationStarts: number; locationStops: number }
    state.locationStarts = 0; state.locationStops = 0
    Object.defineProperty(navigator, 'geolocation', { value: {
      watchPosition(success: (position: unknown) => void) { state.locationStarts++; setTimeout(() => success({ coords: { longitude: -84.38, latitude: 33.75, accuracy: 42 }, timestamp: Date.now() }), 20); return state.locationStarts },
      clearWatch() { state.locationStops++ },
    } })
  })
  await page.goto('/#explore')
  expect(await page.evaluate(() => (window as Window & { locationStarts: number }).locationStarts)).toBe(0)
  await page.locator('.place-result').filter({ hasText: 'Grady Memorial Hospital' }).click()
  await page.getByRole('button', { name: 'Use my location', exact: true }).click()
  await expect(page.locator('.location-status')).toContainText('42 m')
  await expect(page.locator('.location-status')).toContainText('Live browser location')
  await page.getByRole('button', { name: 'Stop tracking' }).click()
  await expect(page.locator('.location-status')).toContainText('tracking stopped')
  await page.getByText('Enter map coordinates', { exact: true }).click()
  await page.getByRole('button', { name: 'Set selected starting point' }).click()
  await expect(page.locator('.location-status')).toContainText('Selected starting point')
  await expect(page.locator('.location-status')).not.toContainText('Live browser location')
  await expect(page.locator('.place-detail')).toContainText('Grady Memorial Hospital')
  await page.getByRole('button', { name: 'Use my location', exact: true }).click()
  await page.getByRole('button', { name: 'Camera assistance', exact: true }).click()
  expect(await page.evaluate(() => (window as Window & { locationStops: number }).locationStops)).toBe(2)
})

test('restarting location waits for a new fix before showing a live location', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('carenori-interface-settings-v1', JSON.stringify({ simplified: true }))
    Object.defineProperty(navigator, 'geolocation', { value: {
      watchPosition(success: (position: unknown) => void) {
        (window as Window & { deliverLocation?: () => void }).deliverLocation = () => success({ coords: { longitude: -84.38, latitude: 33.75, accuracy: 42 }, timestamp: Date.now() })
        return 1
      }, clearWatch() {},
    } })
  })
  await page.goto('/#explore')
  await page.getByRole('button', { name: 'Use my location', exact: true }).click()
  await page.evaluate(() => (window as Window & { deliverLocation?: () => void }).deliverLocation?.())
  await expect(page.locator('.location-status')).toContainText('Live browser location')
  await page.getByRole('button', { name: 'Stop tracking' }).click()
  await page.getByRole('button', { name: 'Use my location', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Requesting location…', exact: true })).toBeVisible()
  await expect(page.locator('.location-status')).toHaveCount(0)
  await page.evaluate(() => (window as Window & { deliverLocation?: () => void }).deliverLocation?.())
  await expect(page.locator('.location-status')).toContainText('Live browser location')
})

test('restoring stale cached records restores their search origin and clears the previous destination', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('carenori-interface-settings-v1', JSON.stringify({ simplified: true }))
    const originalNow = Date.now
    const state = window as Window & { cacheTestOffset: number }
    state.cacheTestOffset = 0
    Date.now = () => originalNow() + state.cacheTestOffset
  })
  let requests = 0
  await page.route('https://overpass-api.de/api/interpreter?*', route => {
    requests++
    return requests === 1 ? route.fulfill({ json: seed }) : requests === 2
      ? route.fulfill({ json: { elements: [{ type: 'node', id: 777, lon: 13.388, lat: 52.517, tags: { amenity: 'clinic', name: 'Other area clinic' } }] } })
      : route.fulfill({ status: 503, body: 'Unavailable' })
  })
  await page.goto('/#explore')
  await page.getByRole('button', { name: 'Search this area', exact: true }).click()
  await expect(page.locator('.public-results-origin')).toContainText('33.75173, -84.38207')
  await page.getByText('Enter map coordinates', { exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Longitude', exact: true }).fill('13.388')
  await page.getByRole('spinbutton', { name: 'Latitude', exact: true }).fill('52.517')
  await page.getByRole('button', { name: 'Set selected starting point' }).click()
  await page.getByRole('button', { name: 'Search this area', exact: true }).click()
  await page.locator('.place-result').filter({ hasText: 'Other area clinic' }).click()
  await expect(page.locator('.public-results-origin')).toContainText('52.51700, 13.38800')
  await page.getByRole('spinbutton', { name: 'Longitude', exact: true }).fill(String(GRADY_CENTER[0]))
  await page.getByRole('spinbutton', { name: 'Latitude', exact: true }).fill(String(GRADY_CENTER[1]))
  await page.getByRole('button', { name: 'Set selected starting point' }).click()
  await page.evaluate(() => { (window as Window & { cacheTestOffset: number }).cacheTestOffset = 6 * 60_000 })
  await page.getByRole('button', { name: 'Search this area', exact: true }).click()
  await page.getByRole('button', { name: 'Use dated cached records' }).click()
  await expect(page.locator('.public-results-origin')).toContainText('33.75173, -84.38207')
  await expect(page.locator('.place-results')).toContainText('Grady Memorial Hospital')
  await page.getByRole('button', { name: 'Back to my visit plan', exact: true }).click()
  await expect(page.locator('.exploration-entry').first()).not.toContainText('Other area clinic')
})
