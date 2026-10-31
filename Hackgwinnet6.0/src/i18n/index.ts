import type { Language } from '../types'
import { coreEs } from './core'
import { shellEs } from './shell'
import { discoveryEs } from './discovery'
import { journeyEs } from './journey'
import { navigationEs } from './navigation'
import { navigationMapEs } from './navigationMap'

export type TranslationValues = Record<string, string | number>
const spanish: Record<string, string> = { ...coreEs, ...shellEs, ...discoveryEs, ...journeyEs, ...navigationEs, ...navigationMapEs }

/** Only prewritten interface/sample text belongs here; never pass user content. */
export function translate(language: Language, text: string, values: TranslationValues = {}): string {
  const template = language === 'es' ? spanish[text] ?? text : text
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] === undefined ? match : String(values[key]))
}
