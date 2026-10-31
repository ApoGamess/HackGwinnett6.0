import { useId, useRef, useState } from 'react'
import { Maximize2, MessageSquare, Plus, Square, Volume2 } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { useSpeech } from '../hooks/useSpeech'
import { campusRepository } from '../navigation/repository'
import { translate } from '../i18n'
import { Modal } from './Modal'
import { TwoWayConversation } from './TwoWayConversation'
import './Communication.css'

export function Communication({ includeQuestions = false }: { includeQuestions?: boolean }) {
  const { message, setMessage, questions, questionText, addQuestion, preferences, language, t, navigationPlace, dataMode, closedElevators } = useApp()
  const speech = useSpeech(language)
  const [displayText, setDisplayText] = useState<string | null>(null)
  const [view, setView] = useState<'message' | 'conversation'>('message')
  const [purpose, setPurpose] = useState('all')
  const id = useId()
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const phrases = campusRepository.getPhrases()
  const groups = [...new Map(phrases.map(phrase => [phrase.group, { name: phrase.group, nameEs: phrase.groupEs }])).values()]
  const currentPlace = navigationPlace?.fictional === (dataMode === 'demo') ? navigationPlace : null
  const contextual: { id: string; en: string; es: string; providerId?: string; source: { name: string; nameEs: string; fictional: boolean } }[] = []
  if (currentPlace) {
    const source = { name: currentPlace.name, nameEs: currentPlace.nameEs, fictional: currentPlace.fictional }
    const template = currentPlace.category === 'entrance' ? 'Is this entrance step-free: {place}?' : 'Where is the step-free entrance for {place}?'
    contextual.push({ id: `navigation-question-${currentPlace.id}-entrance`, en: translate('en', template, { place: currentPlace.name }), es: translate('es', template, { place: currentPlace.nameEs }), providerId: currentPlace.providerId, source })
    const help = 'Can you help me find {place}?'
    contextual.push({ id: `navigation-question-${currentPlace.id}-find`, en: translate('en', help, { place: currentPlace.name }), es: translate('es', help, { place: currentPlace.nameEs }), providerId: currentPlace.providerId, source })
  }
  if (dataMode === 'demo' && closedElevators.length) {
    const template = closedElevators.includes('A') && closedElevators.includes('B')
      ? 'Both elevators are closed in this demo. Can you help me find another option?'
      : closedElevators.includes('A')
      ? 'Elevator A is unavailable in this demo. Where can I find another elevator?'
      : 'Elevator B is unavailable in this demo. Where can I find another elevator?'
    contextual.push({ id: `navigation-question-demo-elevators-${[...closedElevators].sort().join('-')}`, en: template, es: translate('es', template), source: { name: 'Fictional campus', nameEs: translate('es', 'Fictional campus'), fictional: true } })
  }
  const selectMessage = (text: string) => { speech.stop(); setMessage(text); messageRef.current?.focus() }
  // Showing a previous turn must never replace the message being drafted.
  const displayTurn = (text: string) => { speech.stop(); setDisplayText(text) }
  const voiceSelector = <div className="communication-voice"><label className="field-label" htmlFor={`${id}-voice`}>{t('Reading voice')}</label><select id={`${id}-voice`} className="input" value={speech.selectedVoiceId} disabled={!speech.supported || !speech.availableVoices.length} onChange={event => speech.selectVoice(event.target.value)}><option value="">{t('Browser default voice')}</option>{speech.availableVoices.map(voice => <option key={speech.voiceId(voice)} value={speech.voiceId(voice)}>{voice.name} ({voice.lang})</option>)}</select>{speech.supported && !speech.availableVoices.length && <p className="small-note">{t('No matching voices are listed yet. The browser may provide one when you choose Speak; otherwise use the text display.')}</p>}</div>

  return <div className="communication stack">
    <div className="communication-view-switch" role="group" aria-label={t('Communication view')}><button className="btn btn-secondary" aria-pressed={view === 'message'} onClick={() => { speech.stop(); setView('message') }}>{t('Message board')}</button><button className="btn btn-secondary" aria-pressed={view === 'conversation'} onClick={() => { speech.stop(); setView('conversation') }}><MessageSquare size={18} aria-hidden="true" />{t('Two-way conversation')}</button></div>
    {view === 'conversation' ? <TwoWayConversation onDisplay={displayTurn} /> : <>
      <p className="muted">{t('Choose a phrase or use your own words. Review your message, then choose how to share it.')}</p>
      <div><label className="field-label" htmlFor={`${id}-message`}>{t('Your message')}</label><textarea ref={messageRef} id={`${id}-message`} className="input message-input" rows={3} maxLength={1500} value={message} onChange={event => { if (speech.speaking) speech.stop(); setMessage(event.target.value) }} placeholder={t('What would you like someone to know?')} /></div>
      {voiceSelector}
      <div className="button-row"><button className="btn btn-primary" disabled={!message.trim()} onClick={() => displayTurn(message)}><Maximize2 size={18} aria-hidden="true" />{t('Show message')}</button><button className="btn btn-secondary" disabled={!message.trim() || !speech.supported} onClick={() => speech.speak(message)}><Volume2 size={18} aria-hidden="true" />{t('Speak')}</button><button className="btn btn-ghost" disabled={!speech.speaking} onClick={speech.stop}><Square size={15} aria-hidden="true" />{t('Stop')}</button></div>
      <p className="speech-status" role="status">{t(!speech.supported ? 'Speech is unavailable in this browser. Show message still works in large text.' : speech.status || 'Nothing is spoken automatically. Your message is always available as text.')}</p>
      {preferences.readAloud && <p className="small-note">{t('Read-aloud support is on. Use Speak whenever you want to hear your message.')}</p>}
      {!!contextual.length && <section className="communication-context stack" aria-labelledby={`${id}-context`}><h3 id={`${id}-context`}>{t('Questions for this location')}</h3><p className="small-note">{currentPlace ? t('Based on your selected location: {place}', { place: language === 'es' ? currentPlace.nameEs : currentPlace.name }) : t('Based on the fictional demo elevator controls.')}</p><ul className="communication-context-list">{contextual.map(suggestion => <li key={suggestion.id}><button className="phrase-button" aria-pressed={message === (language === 'es' ? suggestion.es : suggestion.en)} onClick={() => selectMessage(language === 'es' ? suggestion.es : suggestion.en)}>{language === 'es' ? suggestion.es : suggestion.en}</button><button className="text-link" onClick={() => addQuestion(suggestion.en, suggestion.id, suggestion.providerId, { en: suggestion.en, es: suggestion.es }, suggestion.source)} aria-label={t('Add to visit questions: {text}', { text: language === 'es' ? suggestion.es : suggestion.en })}><Plus size={16} aria-hidden="true" />{t('Add to my visit questions')}</button></li>)}</ul></section>}
      <section className="stack" aria-labelledby={`${id}-phrases`}><div><h3 id={`${id}-phrases`}>{t('Quick phrases')}</h3><p className="small-note">{t('24 bilingual phrases. Choose a purpose or open a group, then review your selection above.')}</p></div>
        <div className="phrase-purpose"><label className="field-label" htmlFor={`${id}-purpose`}>{t('Phrase purpose')}</label><select id={`${id}-purpose`} className="input" value={purpose} onChange={event => setPurpose(event.target.value)}><option value="all">{t('All purposes')}</option>{groups.map(group => <option key={group.name} value={group.name}>{language === 'es' ? group.nameEs : group.name}</option>)}</select></div>
        <div className="phrase-groups">{groups.filter(group => purpose === 'all' || purpose === group.name).map(group => <details className="phrase-group" key={group.name} open={purpose !== 'all' || groups.indexOf(group) < 2}><summary>{language === 'es' ? group.nameEs : group.name}</summary><div className="phrase-grid">{phrases.filter(phrase => phrase.group === group.name).map(phrase => <button className="phrase-button" key={phrase.id} aria-pressed={message === (language === 'es' ? phrase.textEs : phrase.text)} onClick={() => selectMessage(language === 'es' ? phrase.textEs : phrase.text)}>{language === 'es' ? phrase.textEs : phrase.text}</button>)}</div></details>)}</div>
        <p className="small-note phrase-provenance">{t('Authored demo phrases. The referenced starter phrase file was not supplied.')}</p>
      </section>
      {includeQuestions && <section aria-labelledby={`${id}-questions`}><h3 id={`${id}-questions`}>{t('Prepared questions')}</h3>{questions.length ? <div className="phrase-grid">{[...questions].sort((a, b) => Number(b.priority) - Number(a.priority)).map(question => <button key={question.id} className="phrase-button" aria-pressed={message === questionText(question)} onClick={() => selectMessage(questionText(question))}>{questionText(question)}{question.priority && <span className="small-note">{t('Priority')}</span>}{question.discussed && <span className="small-note">{t('Discussed')}</span>}</button>)}</div> : <p className="muted">{t('Questions you add to your visit will be available here.')}</p>}</section>}
    </>}
    <p className="small-note">{t('Speech uses your browser’s voice service; availability and processing depend on your browser and device. CareNori does not use a microphone or send messages.')}</p>
    {displayText !== null && <Modal title={t('My message')} onClose={() => { speech.stop(); setDisplayText(null) }}><p className="large-message">{displayText}</p><div className="button-row"><button className="btn btn-primary" disabled={!speech.supported} onClick={() => speech.speak(displayText)}><Volume2 size={18} aria-hidden="true" />{t('Speak')}</button><button className="btn btn-secondary" disabled={!speech.speaking} onClick={speech.stop}>{t('Stop')}</button><button className="btn btn-ghost" onClick={() => { speech.stop(); setDisplayText(null) }}>{t('Back to my message')}</button></div><p role="status" className="small-note">{t(!speech.supported ? 'Speech is unavailable. Please use the text above.' : speech.status)}</p></Modal>}
  </div>
}



