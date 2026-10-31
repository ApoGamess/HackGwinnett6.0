import { expect, test, type Page } from '@playwright/test'

async function showPage(page: Page, hash: string, heading: string) {
  await page.evaluate(next => { window.location.hash = next }, hash)
  await expect(page.getByRole('heading', { name: heading, level: 1, exact: true })).toBeVisible()
}

test('communication works without setup and only speaks after an explicit action', async ({ page }) => {
  await page.addInitScript(() => {
    const observed = window as Window & { spokenMessages?: string[] }
    observed.spokenMessages = []
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ lang: 'en-US', localService: true, name: 'Test voice' }],
      cancel: () => {},
      speak: (utterance: SpeechSynthesisUtterance) => observed.spokenMessages?.push(utterance.text),
    } })
  })
  await page.goto('/#visit')
  await expect(page.getByRole('heading', { level: 1, name: 'Visit mode', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Please give me more time.', exact: true }).click()
  await expect(page.getByLabel('Your message', { exact: true })).toHaveValue('Please give me more time.')
  expect(await page.evaluate(() => (window as Window & { spokenMessages: string[] }).spokenMessages)).toEqual([])
  await page.getByRole('button', { name: 'Show message', exact: true }).click()
  const message = page.getByRole('dialog', { name: 'My message', exact: true })
  await expect(message).toContainText('Please give me more time.')
  expect(await page.evaluate(() => (window as Window & { spokenMessages: string[] }).spokenMessages)).toEqual([])
  // A real SpeechSynthesisVoice cannot be constructed in tests, so keep the
  // browser default language path for the explicit playback request.
  await page.evaluate(() => { window.speechSynthesis.getVoices = () => [] })
  await message.getByRole('button', { name: 'Speak', exact: true }).click()
  expect(await page.evaluate(() => (window as Window & { spokenMessages: string[] }).spokenMessages)).toEqual(['Please give me more time.'])
  await message.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(message.getByRole('status')).toContainText('Read aloud stopped.')
  await message.getByRole('button', { name: 'Back to my message', exact: true }).click()
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('es')
  await expect(page.getByRole('button', { name: 'Por favor, deme más tiempo.', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Leer en voz alta', exact: true }).click()
})

test('access card requires selection, allows editing and keeps language changes separate from custom text', async ({ page }) => {
  await page.goto('/#access')
  const preview = page.getByRole('region', { name: 'Access card preview', exact: true })
  await expect(preview).toContainText('Select a statement to see it here.')
  await page.getByLabel('Write my own statement', { exact: true }).fill('Please face me while we talk.')
  await page.getByRole('button', { name: 'Add my statement', exact: true }).click()
  await expect(preview).not.toContainText('Please face me while we talk.')
  await page.getByRole('checkbox', { name: 'Please face me while we talk.', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Please give me extra time to respond.', exact: true }).check()
  await expect(preview).toContainText('Please face me while we talk.')
  await page.getByRole('button', { name: 'Edit statement: Please face me while we talk.', exact: true }).click()
  await page.getByLabel('Edit my statement', { exact: true }).fill('Please face me when speaking.')
  await page.getByRole('button', { name: 'Save statement', exact: true }).click()
  await expect(preview).toContainText('Please face me when speaking.')
  await expect(preview).not.toContainText('Please face me while we talk.')
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('es')
  await expect(page.getByRole('region', { name: 'Vista previa de la tarjeta de acceso', exact: true })).toContainText('Please face me when speaking.')
  await expect(page.getByRole('region', { name: 'Vista previa de la tarjeta de acceso', exact: true })).toContainText('Por favor, deme más tiempo para responder.')
})

test('follow-up tasks support add, duplicate checks, complete, reopen, edit and remove', async ({ page }) => {
  await page.goto('/#after')
  await page.getByLabel('Task title', { exact: true }).fill('Call the clinic with my question')
  await page.getByLabel('Due date (optional)', { exact: true }).fill('2026-12-15')
  await page.getByLabel('Note (optional)', { exact: true }).fill('Use the number on my appointment letter.')
  await page.getByRole('button', { name: 'Add follow-up task', exact: true }).click()
  const tasks = page.locator('.followup-list')
  await expect(tasks).toContainText('December 15, 2026')
  await expect(tasks).toContainText('Use the number on my appointment letter.')
  await page.getByLabel('Task title', { exact: true }).fill('Call the clinic with my question')
  await page.getByRole('button', { name: 'Add follow-up task', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already exists')
  await expect(tasks.locator('li')).toHaveCount(1)
  await page.getByRole('checkbox', { name: 'Complete task: Call the clinic with my question', exact: true }).check()
  await expect(tasks).toContainText('Completed')
  await page.getByRole('checkbox', { name: 'Reopen task: Call the clinic with my question', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Edit task: Call the clinic with my question', exact: true }).click()
  await page.getByLabel('Task title', { exact: true }).fill('Ask about the next appointment')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(tasks).toContainText('Ask about the next appointment')
  await expect(tasks).not.toContainText('Call the clinic with my question')
  await page.getByRole('button', { name: 'Remove task: Ask about the next appointment', exact: true }).click()
  await expect(page.getByText('No follow-up tasks yet. Add one when you have a next step to remember.', { exact: true })).toBeVisible()
})

test('summary excludes all notes and access statements until selected and prints only the preview', async ({ page }) => {
  await page.goto('/#access')
  await page.getByRole('checkbox', { name: 'I prefer written communication.', exact: true }).check()
  await showPage(page, '#after', 'After my visit')
  await page.getByLabel('Optional typed notes', { exact: true }).fill('Private visit note.')
  await page.getByLabel('Task title', { exact: true }).fill('My next step')
  await page.getByLabel('Note (optional)', { exact: true }).fill('Private follow-up note.')
  await page.getByRole('button', { name: 'Add follow-up task', exact: true }).click()
  await page.getByRole('button', { name: 'Prepare my visit summary', exact: true }).click()
  const preview = page.getByRole('article', { name: 'Visit summary preview', exact: true })
  await expect(page.getByRole('checkbox', { name: 'Optional notes', exact: true })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Selected access statements', exact: true })).not.toBeChecked()
  await expect(preview).not.toContainText('Private visit note.')
  await expect(preview).not.toContainText('Private follow-up note.')
  await expect(preview).not.toContainText('I prefer written communication.')
  await expect(preview).toContainText('My next step')
  await page.getByRole('checkbox', { name: 'Optional notes', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Selected access statements', exact: true }).check()
  await expect(preview).toContainText('Private visit note.')
  await expect(preview).toContainText('Private follow-up note.')
  await expect(preview).toContainText('I prefer written communication.')
  await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printInvoked = 'true' } })
  await page.getByRole('button', { name: 'Print selected summary', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-print-invoked', 'true')
  await page.emulateMedia({ media: 'print' })
  await expect(preview).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print selected summary', exact: true })).not.toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).not.toBeVisible()
  await page.emulateMedia({ media: 'screen' })
  await showPage(page, '#care', 'My care')
  await showPage(page, '#summary', 'Prepare my visit summary')
  await expect(page.getByRole('checkbox', { name: 'Optional notes', exact: true })).not.toBeChecked()
})



test('missing voices and speech errors keep a visible text fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ lang: 'es-ES', localService: true, name: 'Spanish test voice' }],
      cancel: () => {},
      speak: (utterance: SpeechSynthesisUtterance) => utterance.onerror?.({ error: 'synthesis-failed' } as SpeechSynthesisErrorEvent),
    } })
  })
  await page.goto('/#visit')
  await page.getByRole('button', { name: 'Please explain that again.', exact: true }).click()
  await page.getByRole('button', { name: 'Speak', exact: true }).click()
  await expect(page.locator('.speech-status')).toContainText('No voice is available for the selected language.')
  await expect(page.getByLabel('Your message', { exact: true })).toHaveValue('Please explain that again.')
  await page.evaluate(() => { window.speechSynthesis.getVoices = () => [] })
  await page.getByRole('button', { name: 'Speak', exact: true }).click()
  await expect(page.locator('.speech-status')).toContainText('Read aloud failed. Your message is still available as text.')
  await page.getByRole('button', { name: 'Show message', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'My message', exact: true })).toContainText('Please explain that again.')
})


