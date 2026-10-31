import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

export async function expectNoOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
  expect(sizes.content, 'No horizontal page overflow').toBeLessThanOrEqual(sizes.width + 1)
  for (const dialog of await page.getByRole('dialog').all()) expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
}
export async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  if (result.violations.length) await test.info().attach('axe-violations', { body: JSON.stringify(result.violations, null, 2), contentType: 'application/json' })
  expect(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))).toEqual([])
}
