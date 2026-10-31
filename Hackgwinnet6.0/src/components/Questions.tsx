import { useEffect, useId, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpRight, Check, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { accommodationQuestions, providers } from '../data/mockData'
import type { AccessFeature } from '../types'

const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

export function Questions({ visit = false, compact = false }: { visit?: boolean; compact?: boolean }) {
  const { questions, addQuestion, updateQuestion, removeQuestion, toggleQuestion, updateQuestionNote, toggleQuestionPriority, moveQuestion, setMessage, setCommunicationOpen, questionText, preferences, selectedProvider, selectedStatements, appointment, t, language } = useApp()
  const [newQuestion, setNewQuestion] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [showAll, setShowAll] = useState(!compact)
  const [formError, setFormError] = useState<'new' | 'edit' | null>(null)
  const uid = useId()
  const addRef = useRef<HTMLTextAreaElement>(null)
  const editRefs = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocus = useRef<string | null>(null)
  useEffect(() => {
    if (!pendingFocus.current) return
    if (pendingFocus.current === 'add') addRef.current?.focus()
    else (editRefs.current.get(pendingFocus.current) ?? addRef.current)?.focus()
    pendingFocus.current = null
  }, [questions, editingId])

  const suggestions: { id: string; text: string; reason: string; providerId?: string }[] = []
  const features: AccessFeature[] = ['stepFree', 'communication', 'quiet']
  features.forEach(feature => {
    if (preferences[feature] || selectedStatements.includes(feature)) suggestions.push({ id: `request-${feature}`, text: accommodationQuestions[feature], reason: 'Based on an access request you selected.' })
    if (selectedProvider && !selectedProvider.features.includes(feature) && !selectedProvider.unavailableFeatures?.includes(feature)) {
      suggestions.push({ id: `accommodation-${selectedProvider.id}-${feature}`, text: accommodationQuestions[feature], providerId: selectedProvider.id, reason: 'This information is not specified by the sample clinic.' })
    }
  })
  if (selectedStatements.includes('extraTime')) suggestions.push({ id: 'request-extra-time', text: 'Can you allow me extra time to respond?', reason: 'Based on an access request you selected.' })
  if (selectedStatements.includes('oneStep')) suggestions.push({ id: 'request-one-step', text: 'Could you explain one step at a time?', reason: 'Based on an access request you selected.' })
  if (!appointment?.date || !appointment?.time) suggestions.push({ id: 'appointment-date', text: 'What date and time is my appointment?', reason: 'Your appointment date or time has not been added.' })
  if (!appointment?.address) suggestions.push({ id: 'appointment-location', text: 'Where should I go for my appointment?', reason: 'Your appointment location has not been added.' })
  if (!appointment || appointment.source === 'user') suggestions.push({ id: 'appointment-documents', text: 'What documents should I bring?', reason: 'What to bring has not been confirmed from a sample letter.' })
  const uniqueSuggestions = suggestions.filter((suggestion, index) => suggestions.findIndex(item => item.text === suggestion.text) === index)
  const alreadyAdded = (suggestion: typeof suggestions[number]) => questions.some(question => question.id === suggestion.id || question.sourceIds?.includes(suggestion.id) || ((!question.providerId || !suggestion.providerId || question.providerId === suggestion.providerId) && (normalized(question.text) === normalized(suggestion.text) || normalized(question.sourceText ?? '') === normalized(suggestion.text) || normalized(questionText(question)) === normalized(t(suggestion.text)))))
  const duplicateText = (text: string, excludeId?: string) => questions.some(question => question.id !== excludeId && (normalized(question.text) === normalized(text) || normalized(questionText(question)) === normalized(text)))
  const visibleQuestions = showAll ? questions : questions.filter(question => !question.discussed).sort((first, second) => Number(!!second.priority) - Number(!!first.priority)).slice(0, 3)

  return <section className="panel questions-panel" aria-labelledby={`${uid}-title`}>
    <div className="section-heading"><div><p className="eyebrow">{t('ROOM FOR YOUR VOICE')}</p><h2 id={`${uid}-title`} tabIndex={-1}>{t('My questions')}</h2></div><span className="count-badge">{t('{count} discussed', { count: questions.filter(question => question.discussed).length })}</span></div>
    <p className="muted">{t(preferences.simplified ? 'Add what you want to ask. You can use it during your visit.' : visit ? 'Take your time. Choose a question to show or speak.' : 'Keep what matters to you close at hand. These come with you into visit mode.')}</p>
    <ul className="question-list">{visibleQuestions.map((question, visibleIndex) => {
      const index = questions.findIndex(item => item.id === question.id)
      const displayText = questionText(question)
      return <li className={`question-item ${question.priority ? 'priority-question' : ''}`} key={question.id}>
        {editingId === question.id ? <form className="stack" onSubmit={event => {
          event.preventDefault()
          if (!draft.trim()) return
          if (duplicateText(draft, question.id)) { setFormError('edit'); return }
          pendingFocus.current = question.id; updateQuestion(question.id, draft); setEditingId(null); setFormError(null)
        }}>
          <label htmlFor={`${uid}-edit`} className="field-label">{t('Edit question')}</label>
          <textarea id={`${uid}-edit`} autoFocus rows={3} className="input" value={draft} maxLength={500} onChange={event => { setDraft(event.target.value); setFormError(null) }} aria-invalid={formError === 'edit'} aria-describedby={formError === 'edit' ? `${uid}-edit-error` : undefined} />
          {formError === 'edit' && <p id={`${uid}-edit-error`} className="form-error" role="alert">{t('Another question already has that text.')}</p>}
          <div className="button-row"><button className="btn btn-primary" disabled={!draft.trim()} type="submit">{t('Save question')}</button><button className="btn btn-ghost" type="button" onClick={() => { pendingFocus.current = question.id; setEditingId(null); setFormError(null) }}>{t('Cancel')}</button></div>
        </form> : <>
          <div className="question-text"><span className="question-number" aria-hidden="true">{String(visibleIndex + 1).padStart(2, '0')}</span><p>{displayText}</p></div>
          {question.navigationSource && <p className="small-note">{t(question.navigationSource.fictional ? 'Fictional campus question' : 'Question about a public source record')}: {language === 'es' ? question.navigationSource.nameEs : question.navigationSource.name}</p>}
          {question.providerId && <p className="small-note">{t('For {name}', { name: providers.find(provider => provider.id === question.providerId)?.name ?? t('the original clinic') })}{question.providerId !== selectedProvider?.id && ` · ${t('From another clinic in your plan; check whether it still applies.')}`}</p>}
          <div className="question-actions">
            <button ref={element => { if (element) editRefs.current.set(question.id, element); else editRefs.current.delete(question.id) }} className="text-link" aria-label={t('Use question: {text}', { text: displayText })} onClick={() => { setMessage(displayText); setCommunicationOpen(true) }}>{t('Use question')} <ArrowUpRight size={16} aria-hidden="true" /></button>
            <button className={`btn btn-ghost btn-small ${question.priority ? 'selected' : ''}`} aria-pressed={!!question.priority} aria-label={`${t(question.priority ? 'Priority' : 'Make priority')}: ${displayText}`} onClick={() => toggleQuestionPriority(question.id)}><Star size={16} aria-hidden="true" fill={question.priority ? 'currentColor' : 'none'} />{t(question.priority ? 'Priority' : 'Make priority')}</button>
          </div>
          <label className="check-row discussed-control"><input type="checkbox" aria-label={`${t(question.discussed ? 'Discussed' : 'Mark as discussed')}: ${displayText}`} checked={question.discussed} onChange={() => { if (!showAll && !question.discussed) pendingFocus.current = 'add'; toggleQuestion(question.id) }} /><span>{t(question.discussed ? 'Discussed' : 'Mark as discussed')}{question.discussed && <Check size={14} aria-hidden="true" />}</span></label>
          <details className="question-options" open={visit || !!question.note || undefined}>
            <summary>{t('Edit, reorder or add a note')}</summary>
            <div className="button-row question-management">
              <button className="btn btn-ghost btn-small" aria-label={t('Edit question: {text}', { text: displayText })} onClick={() => { setDraft(displayText); setEditingId(question.id); setFormError(null) }}><Pencil size={16} aria-hidden="true" />{t('Edit')}</button>
              {showAll ? <><button className="btn btn-ghost btn-small" disabled={index === 0} aria-label={`${t('Move up')}: ${displayText}`} onClick={() => moveQuestion(question.id, 'up')}><ArrowUp size={16} aria-hidden="true" />{t('Move up')}</button>
              <button className="btn btn-ghost btn-small" disabled={index === questions.length - 1} aria-label={`${t('Move down')}: ${displayText}`} onClick={() => moveQuestion(question.id, 'down')}><ArrowDown size={16} aria-hidden="true" />{t('Move down')}</button></> : <button className="btn btn-ghost btn-small" onClick={() => setShowAll(true)}>{t('View all questions to reorder')}</button>}
              <button className="btn btn-ghost btn-small" aria-label={t('Remove question: {text}', { text: displayText })} onClick={() => { pendingFocus.current = questions[index + 1]?.id ?? questions[index - 1]?.id ?? 'add'; removeQuestion(question.id) }}><Trash2 size={16} aria-hidden="true" />{t('Remove')}</button>
            </div>
            <div className="question-note"><label htmlFor={`${uid}-note-${question.id}`} className="field-label">{t('A note for me')} <span className="muted">{t('(optional)')}</span></label><textarea id={`${uid}-note-${question.id}`} aria-label={`${t('A note for me')} ${t('(optional)')}: ${displayText}`} rows={2} className="input" value={question.note} maxLength={2000} onChange={event => updateQuestionNote(question.id, event.target.value)} placeholder={t('Anything you want to remember…')} /></div>
          </details>
        </>}
      </li>
    })}</ul>
    {!questions.length && <p className="empty-state">{t('No questions yet. Add what you would like to ask.')}</p>}
    {!!questions.length && !visibleQuestions.length && <p className="empty-state">{t('All your questions are marked as discussed. View all to review or reopen them.')}</p>}
    {compact && questions.length > 0 && <button className="text-link" aria-expanded={showAll} onClick={() => setShowAll(previous => !previous)}>{t(showAll ? 'Show fewer questions' : 'View all {count} questions', { count: questions.length })}</button>}
    <form className="add-item" onSubmit={event => {
      event.preventDefault()
      if (!newQuestion.trim()) return
      if (duplicateText(newQuestion)) { setFormError('new'); return }
      addQuestion(newQuestion); setNewQuestion(''); setFormError(null); setShowAll(true); addRef.current?.focus()
    }}>
      <label htmlFor={`${uid}-new`} className="field-label">{t('Add a question')}</label>
      <textarea id={`${uid}-new`} ref={addRef} className="input" rows={2} maxLength={500} value={newQuestion} onChange={event => { setNewQuestion(event.target.value); setFormError(null) }} placeholder={t('What would make your visit easier?')} aria-invalid={formError === 'new'} aria-describedby={formError === 'new' ? `${uid}-new-error` : undefined} />
      {formError === 'new' && <p id={`${uid}-new-error`} className="form-error" role="alert">{t('That question is already in your visit plan.')}</p>}
      <button type="submit" className="btn btn-secondary" disabled={!newQuestion.trim()}><Plus size={17} aria-hidden="true" />{t('Add question')}</button>
    </form>
    {!visit && <details className="question-suggestions">
      <summary>{t('Suggested questions')} <span className="count-badge">{uniqueSuggestions.length}</span></summary>
      <p className="small-note">{t('Prewritten suggestions based on your selected requests and missing visit information. You decide what to add; these are not clinical advice.')}</p>
      {uniqueSuggestions.length ? <ul className="suggestion-list">{uniqueSuggestions.map(suggestion => <li key={suggestion.id}><p>{t(suggestion.text)}</p><p className="small-note">{t(suggestion.reason)}</p><button className="btn btn-secondary btn-small" disabled={alreadyAdded(suggestion)} onClick={() => addQuestion(suggestion.text, suggestion.id, suggestion.providerId)} aria-label={`${t(alreadyAdded(suggestion) ? 'Already in my questions' : 'Add to my questions')}: ${t(suggestion.text)}`}>{alreadyAdded(suggestion) ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{t(alreadyAdded(suggestion) ? 'Already in my questions' : 'Add to my questions')}</button></li>)}</ul> : <p className="empty-state">{t('No additional suggestions right now. You can always write your own question.')}</p>}
    </details>}
  </section>
}



