import { expect, test } from '@playwright/test'

test('map: actual local WebGL view pans, zooms, selects pins and changes between 2D and 3D without remote demo tiles', async ({ page }) => {
  const external: string[] = []
  const errors: string[] = []
  page.on('request', request => { const url = request.url(); if (url.startsWith('https://')) external.push(url) })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#explore')
  await page.getByRole('button', { name: /Try the demo campus/ }).click()
  external.length = 0
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await expect(page.locator('.navigation-map[data-map-mode="demo"]')).toHaveAttribute('data-map-ready', 'true')
  const canvas = page.locator('.map-canvas canvas')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  // Projection of the authored reception node [0,0] from the explicit demo center.
  const offset = 512 * 2 ** 17.8 / 360 * 0.00005
  await canvas.click({ position: { x: box!.width / 2 - offset, y: box!.height / 2 + offset } })
  await expect(page.locator('.place-detail')).toBeVisible()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await canvas.focus()
  await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-pitch', '55')
  await page.locator('.navigation-map').screenshot({ path: 'artifacts/carenori-demo-map-3d.png' })
  await page.getByRole('button', { name: /Try the demo campus/ }).click()
  await page.getByRole('button', { name: 'Compute demo route', exact: true }).click()
  await page.getByRole('button', { name: 'Upper floor', exact: true }).click()
  await expect(page.locator('.navigation-map')).toContainText('Upper floor only.')
  await page.locator('.navigation-map').screenshot({ path: 'artifacts/carenori-demo-map-upper-route.png' })
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-pitch', '0')
  await page.getByRole('button', { name: 'Reset orientation', exact: true }).click()
  await expect(page.getByRole('button', { name: '2D', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test('map: WebGL failure offers the same demo list and computed text directions', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (context: string, ...args: unknown[]) {
      if (context.includes('webgl')) return null
      return original.apply(this, [context, ...args] as never)
    } as typeof original
  })
  await page.goto('/#explore')
  await expect(page.getByRole('alert').filter({ hasText: 'Map unavailable.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.place-results .place-result')).not.toHaveCount(0)
  await page.getByRole('button', { name: /Try the demo campus/ }).click()
  await page.getByRole('button', { name: 'Compute demo route', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Ordered route directions' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Help me communicate', exact: true }).first()).toBeVisible()
})

test('map: public style failure stays visible and never substitutes fictional pins', async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', request => request.abort('failed'))
  await page.goto('/#explore')
  await page.getByRole('button', { name: /Explore public places/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Public map tiles or style could not load.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.place-results .place-result')).toHaveCount(1)
  await expect(page.locator('.place-results')).toContainText('Grady Memorial Hospital')
  await expect(page.locator('.place-results')).not.toContainText('Fictional demo')
})

test('map: changing data modes after a map loads does not update a discarded style', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  // A deterministic blank public style exercises the map lifecycle without network tiles.
  await page.route('https://tiles.openfreemap.org/styles/liberty', route => route.fulfill({
    json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f0f0f0' } }] },
  }))
  await page.goto('/#explore')
  await expect(page.locator('.navigation-map')).toHaveAttribute('data-map-ready', 'true')
  await page.getByRole('button', { name: /Explore public places/ }).click()
  await expect(page.locator('.navigation-map[data-map-mode="public"]')).toHaveAttribute('data-map-ready', 'true')
  await page.getByRole('button', { name: /Try the demo campus/ }).click()
  await expect(page.locator('.navigation-map[data-map-mode="demo"]')).toHaveAttribute('data-map-ready', 'true')
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-pitch', '55')
  expect(errors).toEqual([])
})

test('map: a failed optional map bundle preserves the list and communication tools', async ({ page }) => {
  await page.route('**/assets/NavigationMap-*.js', route => route.abort('failed'))
  await page.goto('/#explore')
  await expect(page.getByRole('alert').filter({ hasText: 'Map unavailable.' })).toBeVisible()
  await expect(page.locator('.place-results .place-result')).not.toHaveCount(0)
  await page.getByRole('button', { name: /Try the demo campus/ }).click()
  await page.getByRole('button', { name: 'Compute demo route', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Ordered route directions' })).toBeVisible()
  await page.getByRole('button', { name: 'Help me communicate', exact: true }).first().click()
  await expect(page.getByRole('dialog', { name: 'Help me communicate' })).toBeVisible()
})
