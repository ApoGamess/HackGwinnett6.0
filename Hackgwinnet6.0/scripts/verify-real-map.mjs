// Optional network/browser evidence, kept separate from deterministic regression tests.
import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' })
const evidence = { checkedAt: new Date().toISOString(), errors: [], network: [], networkFailures: [], twoDimensional: false, threeDimensional: false, discovery: '' }
page.on('pageerror', error => evidence.errors.push(error.message))
page.on('response', response => { if (/openfreemap|overpass-api/.test(response.url())) evidence.network.push({ status: response.status(), url: response.url() }) })
page.on('requestfailed', request => { if (/openfreemap|overpass-api/.test(request.url())) evidence.networkFailures.push({ url: request.url(), failure: request.failure()?.errorText }) })
try {
  await page.goto('http://127.0.0.1:4173/#explore')
  await page.locator('.navigation-map[data-map-mode="public"][data-map-ready="true"]').waitFor({ timeout: 25000 })
  await page.locator('.place-result').filter({ hasText: 'Grady Memorial Hospital' }).click()
  await page.locator('.navigation-map').screenshot({ path: 'artifacts/carenori-grady-real-2d.png' })
  evidence.twoDimensional = true
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await page.locator('[data-building-volumes="true"]').waitFor({ timeout: 20000 })
  await page.locator('.navigation-map').screenshot({ path: 'artifacts/carenori-grady-real-3d.png' })
  evidence.threeDimensional = true
  await page.getByRole('button', { name: 'Search this area', exact: true }).click()
  await page.getByRole('button', { name: 'Search this area', exact: true }).waitFor({ timeout: 25000 })
  evidence.discovery = await page.locator('.public-search').innerText()
  evidence.publicPlaceCount = await page.locator('.place-result').count()
} catch (error) { evidence.errors.push(error.message); await page.screenshot({ path: 'artifacts/carenori-grady-real-failure.png', fullPage: true }) }
finally {
  await writeFile('artifacts/real-map-browser-evidence.json', JSON.stringify(evidence, null, 2) + '\n')
  await browser.close()
}
console.log(JSON.stringify({ twoDimensional: evidence.twoDimensional, threeDimensional: evidence.threeDimensional, publicPlaceCount: evidence.publicPlaceCount, discovery: evidence.discovery, errors: evidence.errors }))
