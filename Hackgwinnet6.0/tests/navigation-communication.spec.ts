import { expect, test, type Page } from '@playwright/test'

async function changePage(page: Page, hash: string) {
  await page.evaluate(next => { location.hash = next }, hash)
}

async function mockVoices(page: Page, blocked = false) {
  await page.addInitScript(({ blocked }) => {
    const observed = window as Window & { spoken?: { text: string; voice: string; lang: string }[] }
    observed.spoken = []
    class TestUtterance {
      text: string
      lang = ''
      voice: { name: string } | null = null
      rate = 1
      onend: (() => void) | null = null
      onerror: ((event: { error: string }) => void) | null = null
      constructor(text: string) { this.text = text }
    }
    const voices = [
      { name: 'English voice one', voiceURI: 'test-en-1', lang: 'en-US', localService: true },
      { name: 'English voice two', voiceURI: 'test-en-2', lang: 'en-GB', localService: false },
      { name: 'Voz en español', voiceURI: 'test-es-1', lang: 'es-ES', localService: true },
    ]
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: TestUtterance })
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => voices,
      cancel: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      speak: (utterance: TestUtterance) => {
        observed.spoken?.push({ text: utterance.text, voice: utterance.voice?.name ?? '', lang: utterance.lang })
        if (blocked) utterance.onerror?.({ error: 'not-allowed' })
      },
    } })
  }, { blocked })
}

test('24 repository phrases are grouped, previewed and read only on request with the selected voice', async ({ page }) => {
  await mockVoices(page)
  await page.goto('/#visit')
  await expect(page.locator('.phrase-groups .phrase-button')).toHaveCount(24)
  await page.getByLabel('Phrase purpose', { exact: true }).selectOption('Finding my way')
  await expect(page.locator('.phrase-groups .phrase-button')).toHaveCount(4)
  await page.getByRole('button', { name: 'Where is the step-free entrance?', exact: true }).click()
  await expect(page.getByLabel('Your message', { exact: true })).toHaveValue('Where is the step-free entrance?')
  expect(await page.evaluate(() => (window as Window & { spoken: unknown[] }).spoken)).toHaveLength(0)
  await page.getByLabel('Reading voice', { exact: true }).selectOption('test-en-2')
  expect(await page.evaluate(() => (window as Window & { spoken: unknown[] }).spoken)).toHaveLength(0)
  await page.getByRole('button', { name: 'Show message', exact: true }).click()
  const display = page.getByRole('dialog', { name: 'My message', exact: true })
  await expect(display).toContainText('Where is the step-free entrance?')
  await display.getByRole('button', { name: 'Speak', exact: true }).click()
  expect(await page.evaluate(() => (window as Window & { spoken: unknown[] }).spoken)).toEqual([{ text: 'Where is the step-free entrance?', voice: 'English voice two', lang: 'en-GB' }])
  await display.getByRole('button', { name: 'Stop', exact: true }).click()
  await display.getByRole('button', { name: 'Back to my message', exact: true }).click()
  await page.getByLabel('Your message', { exact: true }).fill('Keep my own wording.')
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('es')
  await expect(page.getByLabel('Su mensaje', { exact: true })).toHaveValue('Keep my own wording.')
  await expect(page.getByRole('button', { name: '¿Dónde está la entrada sin escalones?', exact: true })).toBeVisible()
  await expect(page.getByLabel('Voz de lectura', { exact: true }).locator('option')).toHaveCount(2)
  await page.getByRole('button', { name: '¿Dónde está la entrada sin escalones?', exact: true }).click()
  await page.getByRole('button', { name: 'Leer en voz alta', exact: true }).click()
  expect(await page.evaluate(() => (window as Window & { spoken: { text: string; lang: string }[] }).spoken.at(-1))).toMatchObject({ text: '¿Dónde está la entrada sin escalones?', lang: 'es-ES' })
})

test('two-way typed replies stay in the personal session across screens and never enter storage', async ({ page }) => {
  await page.goto('/#visit')
  await page.getByRole('button', { name: 'Two-way conversation', exact: true }).click()
  await page.getByLabel('Your conversation message', { exact: true }).fill('Please point me toward reception.')
  await page.getByRole('button', { name: 'Add my turn', exact: true }).click()
  await page.getByLabel('Who is typing?', { exact: true }).selectOption('staff')
  await page.getByLabel('Staff reply', { exact: true }).fill('I can show you the reception desk.')
  await page.getByRole('button', { name: 'Add typed staff reply', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Typed conversation', exact: true }).locator('li')).toHaveCount(2)
  await changePage(page, '#care')
  await page.getByRole('button', { name: 'Help me communicate', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Help me communicate', exact: true })
  await dialog.getByRole('button', { name: 'Two-way conversation', exact: true }).click()
  await expect(dialog).toContainText('Please point me toward reception.')
  await expect(dialog).toContainText('I can show you the reception desk.')
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('Please point me toward reception.')
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain('I can show you the reception desk.')
  await dialog.getByRole('button', { name: 'Show conversation turn: I can show you the reception desk.', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'My message', exact: true })).toContainText('I can show you the reception desk.')
  await page.getByRole('button', { name: 'Back to my message', exact: true }).click()
  await dialog.getByRole('button', { name: 'Clear typed conversation', exact: true }).click()
  await dialog.getByRole('button', { name: 'Keep conversation', exact: true }).click()
  await expect(dialog.getByRole('list', { name: 'Typed conversation', exact: true }).locator('li')).toHaveCount(2)
  await dialog.getByRole('button', { name: 'Clear typed conversation', exact: true }).click()
  await dialog.getByRole('button', { name: 'Clear conversation now', exact: true }).click()
  await expect(dialog).toContainText('No conversation yet.')
})

test('unsupported or blocked speech leaves typed display immediately usable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: undefined }))
  await page.goto('/#visit')
  await page.getByLabel('Your message', { exact: true }).fill('I can use this screen without audio.')
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeDisabled()
  await expect(page.locator('.speech-status')).toContainText('Speech is unavailable')
  await page.getByRole('button', { name: 'Show message', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'My message', exact: true })).toContainText('I can use this screen without audio.')
})

test('browser speech denial is explained without losing the message', async ({ page }) => {
  await mockVoices(page, true)
  await page.goto('/#visit')
  await page.getByRole('button', { name: 'I would prefer to type.', exact: true }).click()
  await page.getByRole('button', { name: 'Speak', exact: true }).click()
  await expect(page.locator('.speech-status')).toContainText('Your browser blocked speech.')
  await expect(page.getByLabel('Your message', { exact: true })).toHaveValue('I would prefer to type.')
  await page.getByRole('button', { name: 'Two-way conversation', exact: true }).click()
  await expect(page.getByLabel('Your conversation message', { exact: true })).toHaveValue('I would prefer to type.')
})

test('displaying a staff turn preserves both drafts, which stay private across communication screens and reset', async ({ page }) => {
  await mockVoices(page)
  await page.goto('/#visit')
  await page.getByRole('button', { name: 'Two-way conversation', exact: true }).click()
  await page.getByLabel('Who is typing?', { exact: true }).selectOption('staff')
  await page.getByLabel('Staff reply', { exact: true }).fill('Reception is on this floor.')
  await page.getByRole('button', { name: 'Add typed staff reply', exact: true }).click()
  await page.getByLabel('Staff reply', { exact: true }).fill('PRIVATE-STAFF-DRAFT')
  await page.getByLabel('Who is typing?', { exact: true }).selectOption('me')
  await page.getByLabel('Your conversation message', { exact: true }).fill('PRIVATE-MY-DRAFT')
  const showTurn = page.getByRole('button', { name: 'Show conversation turn: Reception is on this floor.', exact: true })
  await showTurn.click()
  const display = page.getByRole('dialog', { name: 'My message', exact: true })
  await expect(display).toContainText('Reception is on this floor.')
  await display.getByRole('button', { name: 'Speak', exact: true }).click()
  expect(await page.evaluate(() => (window as Window & { spoken: { text: string }[] }).spoken.at(-1)?.text)).toBe('Reception is on this floor.')
  await display.getByRole('button', { name: 'Back to my message', exact: true }).click()
  await expect(showTurn).toBeFocused()
  await expect(page.getByLabel('Your conversation message', { exact: true })).toHaveValue('PRIVATE-MY-DRAFT')
  await page.getByLabel('Who is typing?', { exact: true }).selectOption('staff')
  await page.getByRole('button', { name: 'Message board', exact: true }).click()
  await expect(page.getByLabel('Your message', { exact: true })).toHaveValue('PRIVATE-MY-DRAFT')
  await page.getByRole('button', { name: 'Two-way conversation', exact: true }).click()
  await expect(page.getByLabel('Staff reply', { exact: true })).toHaveValue('PRIVATE-STAFF-DRAFT')

  await changePage(page, '#care')
  await page.getByRole('button', { name: 'Help me communicate', exact: true }).first().click()
  const help = page.getByRole('dialog', { name: 'Help me communicate', exact: true })
  await help.getByRole('button', { name: 'Two-way conversation', exact: true }).click()
  await expect(help.getByLabel('Staff reply', { exact: true })).toHaveValue('PRIVATE-STAFF-DRAFT')
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
  expect(storage).not.toContain('PRIVATE-')
  await help.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Reset session', exact: true }).click()
  await page.getByRole('dialog', { name: 'Reset this session?', exact: true }).getByRole('button', { name: 'Reset session', exact: true }).click()
  await page.getByRole('button', { name: 'Help me communicate', exact: true }).first().click()
  await expect(help.getByLabel('Your message', { exact: true })).toHaveValue('')
  await help.getByRole('button', { name: 'Two-way conversation', exact: true }).click()
  await expect(help).toContainText('No conversation yet.')
  await expect(help.getByLabel('Who is typing?', { exact: true })).toHaveValue('me')
  await help.getByLabel('Who is typing?', { exact: true }).selectOption('staff')
  await expect(help.getByLabel('Staff reply', { exact: true })).toHaveValue('')
})

test('access card duplicate validation retains the draft and announces the error in either interface language', async ({ page }) => {
  await page.goto('/#access')
  const draft = page.getByLabel('Write my own statement', { exact: true })
  await draft.fill('I prefer   typing.')
  await page.getByRole('button', { name: 'Add my statement', exact: true }).click()
  await expect(draft).toHaveValue('I prefer   typing.')
  await expect(draft).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert')).toContainText('That statement is already available.')
  await expect(page.getByRole('checkbox')).toHaveCount(7)
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('es')
  await page.locator('textarea').fill('I prefer typing.')
  await page.locator('form button[type="submit"]').click()
  await expect(page.locator('textarea')).toHaveValue('I prefer typing.')
  await expect(page.locator('textarea')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert')).toHaveText('Esa frase ya está disponible. Selecciónela arriba.')
  await expect(page.getByRole('checkbox')).toHaveCount(7)
})


test('demo closure and selected-place questions enter the same plan and do not become public status claims', async ({ page }) => {
  await page.goto('/#explore')
  await page.getByRole('button', { name: /Try the demo campus/ }).click()
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await page.getByRole('button', { name: /Step-free side entrance/ }).click()
  await page.getByRole('checkbox', { name: 'Close elevator A', exact: true }).check()
  await page.getByRole('button', { name: 'Help me communicate', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Help me communicate', exact: true })
  const context = dialog.getByRole('region', { name: 'Questions for this location', exact: true })
  await expect(context).toContainText('Step-free side entrance')
  const phrase = 'Elevator A is unavailable in this demo. Where can I find another elevator?'
  await context.getByRole('button', { name: phrase, exact: true }).click()
  await expect(dialog.getByLabel('Your message', { exact: true })).toHaveValue(phrase)
  await context.getByRole('button', { name: 'Add to visit questions: ' + phrase, exact: true }).click()
  await context.getByRole('button', { name: 'Add to visit questions: ' + phrase, exact: true }).click()
  await expect(dialog.getByRole('region', { name: 'Prepared questions', exact: true }).getByRole('button')).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('es')
  await page.getByRole('button', { name: 'Ayúdame a comunicarme', exact: true }).click()
  const spanish = page.getByRole('dialog', { name: 'Ayúdame a comunicarme', exact: true })
  await expect(spanish.getByRole('region', { name: 'Preguntas preparadas', exact: true })).toContainText('El ascensor A no está disponible en esta demostración.')
  await page.keyboard.press('Escape')
  await page.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption('en')
  await page.getByRole('button', { name: /Explore public places/ }).click()
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await page.getByRole('button', { name: 'Help me communicate', exact: true }).first().click()
  await expect(page.locator('.communication-context')).toHaveCount(0)
})


test('editing a demo question keeps its fictional source on a questions-only printed summary', async ({ page }) => {
  await page.goto('/#explore')
  await page.getByRole('button', { name: /Try the demo campus/ }).click()
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Close elevator A', exact: true }).check()
  await page.getByRole('button', { name: 'Help me communicate', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Help me communicate', exact: true })
  const original = 'Elevator A is unavailable in this demo. Where can I find another elevator?'
  await dialog.getByRole('button', { name: 'Add to visit questions: ' + original, exact: true }).click()
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await changePage(page, '#visit')
  await page.getByRole('button', { name: 'Edit question: ' + original, exact: true }).click()
  await page.getByLabel('Edit question', { exact: true }).fill('Where should I go next?')
  await page.getByRole('button', { name: 'Save question', exact: true }).click()
  await changePage(page, '#summary')
  for (const section of ['Appointment details', 'Preparation checklist', 'Follow-up tasks']) {
    await page.getByRole('checkbox', { name: section, exact: true }).uncheck()
  }
  const preview = page.getByRole('article', { name: 'Visit summary preview', exact: true })
  await expect(preview).toContainText('Where should I go next?')
  await expect(preview).toContainText('Fictional campus question: Fictional campus')
  await expect(preview).toContainText('Contains fictional sample information.')
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('es')
  const spanish = page.getByRole('article', { name: 'Vista previa del resumen de visita', exact: true })
  await expect(spanish).toContainText('Where should I go next?')
  await expect(spanish).toContainText('Pregunta sobre el campus ficticio: Campus ficticio')
})

