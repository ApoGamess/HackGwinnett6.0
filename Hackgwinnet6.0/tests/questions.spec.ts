import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectAccessible, expectNoOverflow } from './helpers'

async function addQuestion(page: Page, text: string, spanish = false) {
  await page.getByRole('textbox', { name: spanish ? 'Añadir una pregunta' : 'Add a question', exact: true }).fill(text)
  await page.getByRole('button', { name: spanish ? 'Añadir pregunta' : 'Add question', exact: true }).click()
}
async function openOptions(question: Locator) {
  const details = question.locator('.question-options')
  if (await details.getAttribute('open') === null) await details.locator('summary').click()
}

test('questions support duplicate validation, priority, ordering, notes, shared visit use and removal', async ({ page }) => {
  await page.goto('/')
  const first = 'Can my friend join me?'
  const second = 'Where should I check in?'
  const third = 'Is there somewhere to sit?'
  await addQuestion(page, first)
  await addQuestion(page, second)
  await addQuestion(page, third)
  const list = page.locator('.question-list')
  await addQuestion(page, `  ${first}  `)
  await expect(page.getByRole('alert')).toHaveText('That question is already in your visit plan.')
  await expect(list.locator('.question-item')).toHaveCount(3)
  await page.getByRole('textbox', { name: 'Add a question', exact: true }).fill('')

  const secondRow = list.locator('.question-item').filter({ has: page.locator('.question-text p', { hasText: second }) })
  await secondRow.getByRole('button', { name: `Make priority: ${second}`, exact: true }).click()
  await expect(secondRow.getByRole('button', { name: `Priority: ${second}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await openOptions(secondRow)
  await secondRow.getByRole('button', { name: `Move up: ${second}`, exact: true }).click()
  await expect(list.locator('.question-text p')).toHaveText([second, first, third])
  await expect(secondRow.getByRole('button', { name: `Move up: ${second}`, exact: true })).toBeDisabled()
  await secondRow.getByRole('button', { name: `Move down: ${second}`, exact: true }).click()
  await expect(list.locator('.question-text p')).toHaveText([first, second, third])
  await secondRow.getByRole('textbox', { name: `A note for me (optional): ${second}`, exact: true }).fill('Ask at reception before sitting down.')
  await secondRow.getByRole('checkbox', { name: `Mark as discussed: ${second}`, exact: true }).check()
  await expect(secondRow.getByRole('checkbox', { name: `Discussed: ${second}`, exact: true })).toBeChecked()

  const firstRow = list.locator('.question-item').filter({ has: page.locator('.question-text p', { hasText: first }) })
  await openOptions(firstRow)
  await firstRow.getByRole('button', { name: `Edit question: ${first}`, exact: true }).click()
  await page.getByRole('textbox', { name: 'Edit question', exact: true }).fill(second)
  await page.getByRole('button', { name: 'Save question', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Another question already has that text.')
  const edited = 'Can my friend stay with me?'
  await page.getByRole('textbox', { name: 'Edit question', exact: true }).fill(edited)
  await page.getByRole('button', { name: 'Save question', exact: true }).click()
  await expect(page.getByRole('button', { name: `Use question: ${edited}`, exact: true })).toBeFocused()

  await page.getByRole('button', { name: 'During my visit', exact: true }).click()
  await expect(page.locator('.question-text p')).toHaveText([edited, second, third])
  await expect(page.getByRole('checkbox', { name: `Discussed: ${second}`, exact: true })).toBeChecked()
  await expect(page.getByRole('textbox', { name: `A note for me (optional): ${second}`, exact: true })).toHaveValue('Ask at reception before sitting down.')
  await page.getByRole('button', { name: `Use question: ${edited}`, exact: true }).click()
  const communication = page.getByRole('dialog', { name: 'Help me communicate', exact: true })
  await expect(communication.getByRole('textbox', { name: 'Your message', exact: true })).toHaveValue(edited)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: `Remove question: ${edited}`, exact: true }).click()
  await expect(page.locator('.question-item')).toHaveCount(2)
  await expect(page.getByRole('button', { name: `Use question: ${second}`, exact: true })).toBeFocused()
})

test('suggestion edits retain identity and compact priority/discussion preserves keyboard focus', async ({ page }) => {
  await page.goto('/')
  await page.locator('.question-suggestions summary').click()
  const suggested = 'What date and time is my appointment?'
  await page.getByRole('button', { name: `Add to my questions: ${suggested}`, exact: true }).click()
  await expect(page.getByRole('button', { name: `Already in my questions: ${suggested}`, exact: true })).toBeDisabled()
  const row = page.locator('.question-item').first()
  await openOptions(row)
  await row.getByRole('button', { name: `Edit question: ${suggested}`, exact: true }).click()
  await page.getByRole('textbox', { name: 'Edit question', exact: true }).fill('Please confirm the appointment time with me.')
  await page.getByRole('button', { name: 'Save question', exact: true }).click()
  await expect(page.getByRole('button', { name: `Already in my questions: ${suggested}`, exact: true })).toBeDisabled()
  await addQuestion(page, 'My second question')
  await page.getByRole('button', { name: 'Make priority: My second question', exact: true }).click()
  await page.getByRole('button', { name: 'Show fewer questions', exact: true }).click()
  await expect(page.locator('.question-text p').first()).toHaveText('My second question')
  // The row leaves the compact list immediately; verify its stored state after reopening all.
  await page.getByRole('checkbox', { name: 'Mark as discussed: My second question', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Add a question', exact: true })).toBeFocused()
  await expect(page.locator('.question-item')).toHaveCount(1)
  await page.getByRole('button', { name: 'View all 2 questions', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Discussed: My second question', exact: true })).toBeChecked()
  await page.getByLabel('Language', { exact: true }).selectOption('es')
  await expect(page.locator('.question-text p').first()).toHaveText('Please confirm the appointment time with me.')
  await expect(page.getByRole('button', { name: 'Ya está en mis preguntas: ¿Qué día y a qué hora es mi cita?', exact: true })).toBeDisabled()
})

for (const language of ['en', 'es'] as const) test(`populated questions and open controls pass accessibility in ${language}`, async ({ page }) => {
  if (language === 'es') await page.addInitScript(() => localStorage.setItem('carenori-interface-settings-v1', JSON.stringify({ language: 'es' })))
  await page.goto('/')
  await addQuestion(page, 'My written question stays as written.', language === 'es')
  await addQuestion(page, 'Another question for my visit.', language === 'es')
  const rows = page.locator('.question-item')
  await openOptions(rows.nth(0))
  await openOptions(rows.nth(1))
  await rows.nth(0).getByRole('button', { name: language === 'en' ? 'Make priority: My written question stays as written.' : 'Marcar como prioritaria: My written question stays as written.', exact: true }).click()
  await rows.nth(0).getByRole('textbox').fill('Keep this private optional note unchanged.')
  await rows.nth(1).getByRole('checkbox').check()
  await page.locator('.question-suggestions summary').click()
  const suggestion = language === 'en' ? 'Add to my questions: What documents should I bring?' : 'Añadir a mis preguntas: ¿Qué documentos debo llevar?'
  await page.getByRole('button', { name: suggestion, exact: true }).click()
  await openOptions(rows.nth(2))
  await expectAccessible(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoOverflow(page)
  await expectAccessible(page)
  const editLabel = language === 'en' ? 'Edit question: My written question stays as written.' : 'Editar pregunta: My written question stays as written.'
  await rows.nth(0).getByRole('button', { name: editLabel, exact: true }).click()
  await expectAccessible(page)
})
