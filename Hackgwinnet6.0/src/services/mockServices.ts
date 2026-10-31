import { providers } from '../data/mockData'
import { discoveryEs } from '../i18n/discovery'
import type { AccessFeature, AppointmentLetter, Provider } from '../types'

function sampleText(text: string, language: 'en' | 'es', values: Record<string, string> = {}) {
  return (language === 'es' ? discoveryEs[text] ?? text : text).replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`)
}

// Deliberately local, fictional data. No provider service or availability feed.
export function searchProviders(query: string, features: AccessFeature[], language: 'en' | 'es' = 'en'): Provider[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase()
  const needle = normalize(query)
  return providers.filter(provider => normalize([provider.name, provider.specialty, provider.area, provider.address, sampleText(provider.specialty, language), sampleText(provider.area, language)].join(' ')).includes(needle) && features.every(feature => provider.features.includes(feature)))
}

export function getSampleLetter(provider: Provider = providers[0], variant: 'original' | 'updated' = 'original', language: 'en' | 'es' = 'en'): AppointmentLetter {
  const rawDate = variant === 'updated' ? '10 December 2026' : '3 December 2026'
  const date = sampleText(rawDate, language)
  const time = variant === 'updated' ? '2:00 PM' : '10:30 AM'
  const arrivalTime = variant === 'updated' ? '1:45 PM' : '10:15 AM'
  const appointmentKey = variant === 'updated' ? '2026-12-10-1400' : '2026-12-03-1030'
  const letterId = `sample-letter-${provider.id}-${appointmentKey}`
  const arrival = sampleText(provider.arrival, language)
  const values = { clinic: provider.name, address: provider.address, date, time, arrivalTime, arrival }
  const original = '{clinic}\n{address}\n\nSAMPLE APPOINTMENT LETTER\nFictional administrative information\n\nDear visitor,\n\nYour sample appointment at {clinic} is scheduled for {date} at {time}. Please arrive 15 minutes early, at {arrivalTime}, to check in.\n\n{arrival}\n\nPlease bring your appointment letter and a photo ID, if you have one. You are welcome to bring written questions and tell reception about any communication or access needs.\n\nKind regards,\nThe reception team\n\nThis is a fictional letter for demonstration. No appointment has been booked.'
  const summary = 'Your sample appointment is at {clinic} on {date} at {time}. Arrive at {arrivalTime}. {arrival} Bring your appointment letter and a photo ID, if you have one. You can bring written questions and share any access needs with reception. This is a prewritten demo summary. No appointment has been booked.'
  return {
    id: letterId, providerId: provider.id,
    clinicName: provider.name, date, time, arrivalTime, address: provider.address, arrival,
    original: sampleText(original, language, values), summary: sampleText(summary, language, values),
    tasks: [
      { id: `letter-${provider.id}-bring`, providerId: provider.id, letterId, text: sampleText('Bring my appointment letter', language), done: false, source: 'letter' },
      { id: `letter-${provider.id}-id`, providerId: provider.id, letterId, text: sampleText('Bring a photo ID, if I have one', language), done: false, source: 'letter' },
      { id: `letter-${provider.id}-arrival-${appointmentKey}`, providerId: provider.id, letterId, text: sampleText('Plan to arrive by {time} on {date}', language, {time: arrivalTime, date}), textKey: 'Plan to arrive by {time} on {date}', textValues: {time: arrivalTime, date: rawDate}, done: false, source: 'letter' },
      { id: `letter-${provider.id}-access`, providerId: provider.id, letterId, text: sampleText('Tell reception about my access needs', language), done: false, source: 'letter' },
    ],
  }
}

/** Localize only a recognized prewritten sample; never translate user documents. */
export function localizeSampleLetter(letter: AppointmentLetter, language: 'en' | 'es'): AppointmentLetter {
  const provider = providers.find(item => item.id === letter.providerId)
  if (!provider) return letter
  const variant = letter.id === getSampleLetter(provider, 'updated').id ? 'updated' : 'original'
  if (letter.id !== getSampleLetter(provider, variant).id) return letter
  return getSampleLetter(provider, variant, language)
}
