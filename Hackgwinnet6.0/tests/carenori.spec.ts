import { expect, test } from '@playwright/test'
import { expectAccessible, expectNoOverflow } from './helpers'

const routes = ['care', 'preferences', 'providers', 'letter', 'access', 'visit', 'after', 'summary']
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Keep tests silent; verify actual speech invocation in the focused journey suite.
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, speak() {}, getVoices() { return [{ lang: 'en-US', localService: true }] }, addEventListener() {}, removeEventListener() {} } })
  })
})

test('empty workspace has intentional entries and communication without onboarding', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('My care · CareNori')
  await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link')).toHaveText(['My care', 'Places & access', 'Camera assistance', 'Preferences'])
  await expect(page.getByRole('button', { name: 'Start my visit plan', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Explore a sample visit', exact: true })).toBeVisible()
  await expect(page.locator('.question-item')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(/MediPath|AccessScan|CareBridge|CareAccess|Avenyvo/i)
  const trigger = page.getByRole('button', { name: 'Help me communicate', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Help me communicate', exact: true })
  await dialog.getByRole('textbox', { name: 'Your message', exact: true }).fill('Please give me a moment.')
  await dialog.getByRole('button', { name: 'Show message', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'My message', exact: true })).toContainText('Please give me a moment.')
  await page.keyboard.press('Escape')
  await expect(dialog.getByRole('button', { name: 'Show message', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page.getByRole('button', { name: 'Start my visit plan', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Find a clinic', exact: true })).toBeVisible()
})

test('language and simplified view preserve typed work, reset respects scope and refresh persists only settings', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Add a question', { exact: true }).fill('Where can my friend wait?')
  await page.getByRole('button', { name: 'Add question', exact: true }).click()
  await page.getByRole('button', { name: 'Simplified view', exact: true }).click()
  await page.getByLabel('Language', { exact: true }).selectOption('es')
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect(page.getByRole('heading', { name: 'Mi atención', exact: true })).toBeVisible()
  await expect(page.locator('.question-item')).toContainText('Where can my friend wait?')
  await expect(page.getByRole('button', { name: 'Mostrar vista completa', exact: true })).toBeVisible()
  await page.getByLabel('Idioma', { exact: true }).selectOption('en')
  await page.getByRole('button', { name: 'Reset session', exact: true }).first().click()
  await page.getByRole('button', { name: 'Keep my progress', exact: true }).click()
  await expect(page.locator('.question-item')).toHaveCount(1)
  const storage = await page.evaluate(() => ({ ...localStorage }))
  expect(JSON.stringify(storage)).not.toContain('Where can my friend wait')
  expect(Object.keys(storage)).toEqual(['carenori-interface-settings-v1'])
  await page.reload()
  await expect(page.locator('.question-item')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Show full view', exact: true })).toBeVisible()
})

test('sample entry keeps questions through explicit sample confirmation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore a sample visit', exact: true }).click()
  await page.getByLabel('Add a question', { exact: true }).fill('My own question')
  await page.getByRole('button', { name: 'Add question', exact: true }).click()
  await expect(page.locator('.question-item')).toContainText('My own question')
  await expect(page.getByRole('region', { name: 'Current visit', exact: true })).toContainText('No booking')
  await page.getByRole('button', { name: 'Review my appointment letter', exact: true }).click()
  await page.getByRole('button', { name: 'Review and add to my visit', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Review appointment information', exact: true })
  await review.getByRole('button', { name: 'Confirm and add to my visit', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Current visit', exact: true })).toContainText('Fictional sample appointment')
  await expect(page.getByRole('button', { name: 'Open visit mode', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reset session', exact: true }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reset session', exact: true }).click()
  await expect(page.locator('.question-item')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Current visit', exact: true })).toContainText('No clinic selected')
})

for (const setting of ['standard', 'large-contrast-spanish']) {
  for (const route of routes) test(`accessible ${route} ${setting}`, async ({ page }) => {
    if (setting !== 'standard') await page.addInitScript(() => localStorage.setItem('carenori-interface-settings-v1', JSON.stringify({ language: 'es', largeText: true, highContrast: true, reducedMotion: true })))
    await page.goto(`/#${route}`)
    await expect(page.locator('h1')).toBeVisible()
    if (route === 'letter') {
      await page.getByRole('button', { name: setting === 'standard' ? 'Open sample letter' : 'Abrir carta de ejemplo', exact: true }).click()
    }
    await expectAccessible(page)
    await expectNoOverflow(page)
  })
}

for (const width of [320, 390, 768]) test(`all routes reflow at ${width}px with enlarged text`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => localStorage.setItem('carenori-interface-settings-v1', JSON.stringify({ largeText: true, highContrast: true })))
  for (const route of routes) {
    await page.goto(`/#${route}`)
    await expect(page.locator('h1')).toBeVisible()
    await expectNoOverflow(page)
  }
})

test('keyboard skip link, trapped dialogs, source review and print layout', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
  await page.getByRole('button', { name: 'Help me communicate', exact: true }).click()
  await expectAccessible(page)
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Prepare my visit summary', exact: true }).first().click()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.sidebar')).toBeHidden()
  await expect(page.locator('.topbar')).toBeHidden()
  await expect(page.locator('.print-area')).toBeVisible()
  await page.pdf({ path: 'artifacts/carenori-visit-pack.pdf', format: 'A4', printBackground: true })
})

test('rendered desktop mobile and Spanish screenshots', async ({ page }) => {
  await page.goto('/')
  await page.screenshot({ path: 'artifacts/carenori-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Explore a sample visit', exact: true }).click()
  await page.getByRole('button', { name: 'Review my appointment letter', exact: true }).click()
  await page.screenshot({ path: 'artifacts/carenori-letter.png', fullPage: true })
  await page.getByLabel('Language', { exact: true }).selectOption('es')
  await page.screenshot({ path: 'artifacts/carenori-spanish.png', fullPage: true })
  await page.getByLabel('Idioma', { exact: true }).selectOption('en')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#care')
  await page.screenshot({ path: 'artifacts/carenori-mobile.png', fullPage: true })
})

