import { useId, useState } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { providers } from '../data/mockData'
import type { Appointment, PreparationTask } from '../types'
import { computeRoute } from '../navigation/route'

type Section = 'appointment' | 'access' | 'preparation' | 'questions' | 'notes' | 'followups' | 'navigation'
const sectionLabels: Record<Section, string> = {
  appointment: 'Appointment details',
  access: 'Selected access statements',
  preparation: 'Preparation checklist',
  questions: 'Questions',
  notes: 'Optional notes',
  followups: 'Follow-up tasks',
  navigation: 'Selected place & demo route',
}

export default function VisitSummary() {
  const { appointment, selectedProvider, accessStatements, selectedStatements, tasks, taskText, questions, questionText, visitNotes, followUps, navigate, t, language, navigationPlace, dataMode, routeSelection, routeProfile, closedElevators } = useApp()
  // Sharing notes and access requests always requires a fresh explicit choice.
  const [sections, setSections] = useState<Record<Section, boolean>>({ appointment: true, access: false, preparation: true, questions: true, notes: false, followups: true, navigation: false })
  const route = dataMode === 'demo' && routeSelection.active ? computeRoute(routeSelection.start, routeSelection.destination, routeProfile, closedElevators) : null
  const id = useId()
  const selected = accessStatements.filter(statement => selectedStatements.includes(statement.id))
  const hasSections = Object.values(sections).some(Boolean)
  const isSampleTask = (task: PreparationTask) => task.source === 'letter' || !!task.letterId || !!task.sourceIds?.some(source => source.startsWith('letter-'))
  const includesSample = (sections.navigation && (!!navigationPlace?.fictional || !!route)) || (sections.appointment && (!!selectedProvider || appointment?.source === 'sample'))
    || (sections.preparation && tasks.some(isSampleTask))
    || (sections.questions && questions.some(question => !!question.providerId || !!question.navigationSource?.fictional))
    || (sections.notes && questions.some(question => !!question.note.trim() && (!!question.providerId || !!question.navigationSource?.fictional)))
  const appointmentText = (field: keyof Appointment, value: string) => appointment?.source === 'sample' && !(appointment.editedFields?.includes(field) ?? appointment.userEdited) ? t(value) : value
  const clinicLabel = (providerId: string) => t('For fictional clinic: {clinic}', { clinic: providers.find(provider => provider.id === providerId)?.name ?? t('Original clinic') })
  const hasNotes = !!visitNotes.trim() || questions.some(question => !!question.note.trim()) || followUps.some(task => !!task.note?.trim())
  const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(language === 'es' ? 'es-US' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  return <div className="stack">
    <button className="back-link print-exclude" onClick={() => navigate('care')}><ArrowLeft size={18} aria-hidden="true" />{t('Back to my care')}</button>
    <div className="page-heading print-exclude"><div><p className="eyebrow">{t('YOUR PLAN, YOUR CHOICE')}</p><h1 tabIndex={-1}>{t('Prepare my visit summary')}</h1><p className="page-description">{t('Choose what to include, review the preview, then print.')}</p></div></div>
    <section className="panel stack print-exclude" aria-labelledby={`${id}-sections`}><h2 id={`${id}-sections`}>{t('Choose sections')}</h2><p className="muted">{t('Access statements and notes are not included unless you select them. Review every section before printing.')}</p>
      <fieldset className="plain-fieldset"><legend className="sr-only">{t('Sections to include in my summary')}</legend><div className="summary-sections">{(Object.keys(sectionLabels) as Section[]).map(section => <label className="check-row" key={section}><input type="checkbox" checked={sections[section]} onChange={event => setSections(previous => ({ ...previous, [section]: event.target.checked }))} /><span>{t(sectionLabels[section])}</span></label>)}</div></fieldset>
      <p className="notice">{t('Printed copies and saved PDFs are outside the app. Resetting your session will not remove them.')}</p>
      <div className="button-row"><button className="btn btn-primary" disabled={!hasSections} onClick={() => window.print()}><Printer size={18} aria-hidden="true" />{t('Print selected summary')}</button><p className="small-note">{t('Your browser may offer Save as PDF. Nothing is emailed or published.')}</p></div>
    </section>
    <p className="eyebrow print-exclude">{t('PRINT PREVIEW')}</p>
    <article className="panel summary-preview print-area" aria-label={t('Visit summary preview')}>
      <header><p className="eyebrow">CareNori</p><h2>{t('My visit summary')}</h2><p>{t('Personal planning copy — CareNori prototype')}</p>{includesSample && <p className="notice sample-label">{t('Contains fictional sample information. No appointment has been booked by CareNori.')}</p>}</header>
      {!hasSections && <p className="empty-state">{t('Select at least one section to prepare your summary.')}</p>}
      {sections.appointment && <section><h3>{t('Appointment details')}</h3>{appointment ? <><p className="source-label">{t(appointment.source === 'sample' ? appointment.userEdited ? 'Edited from a fictional sample appointment.' : 'Fictional sample appointment.' : 'User-entered appointment details. This is not a booking confirmation.')}</p><dl className="detail-grid"><div><dt>{t('Clinic')}</dt><dd>{appointment.clinicName}</dd></div><div><dt>{t('Date')}</dt><dd>{appointmentText('date', appointment.date) || t('Not entered')}</dd></div><div><dt>{t('Time')}</dt><dd>{appointmentText('time', appointment.time) || t('Not entered')}</dd></div><div><dt>{t('Arrive by')}</dt><dd>{appointmentText('arrivalTime', appointment.arrivalTime) || t('Not entered')}</dd></div><div><dt>{t('Address')}</dt><dd>{appointment.address || t('Not entered')}</dd></div>{appointment.arrival && <div><dt>{t('Arrival information')}</dt><dd>{appointmentText('arrival', appointment.arrival)}</dd></div>}</dl></> : selectedProvider ? <><p>{selectedProvider.name}</p><p className="source-label">{t('Fictional clinic added to your plan. No appointment details have been confirmed.')}</p></> : <p>{t('No clinic or appointment details added.')}</p>}</section>}
      {sections.access && <section><h3>{t('Selected access statements')}</h3>{selected.length ? <><ul>{selected.map(statement => <li key={statement.id}>{statement.custom ? statement.text : t(statement.text)}</li>)}</ul><p className="small-note">{t('These are my requests. Please let me know what is possible.')}</p></> : <p>{t('No access statements selected.')}</p>}</section>}
      {sections.preparation && <section><h3>{t('Preparation checklist')}</h3>{tasks.length ? <ul className="summary-list">{tasks.map(task => <li key={task.id}><span>{t(task.done ? 'Completed' : 'To do')}: {taskText(task)}</span>{isSampleTask(task) && <small className="source-label">{t('From your sample appointment letter.')}</small>}{task.providerId && <small className="source-label">{clinicLabel(task.providerId)}</small>}</li>)}</ul> : <p>{t('No preparation tasks added.')}</p>}</section>}
      {sections.questions && <section><h3>{t('Questions')}</h3>{questions.length ? <ol className="summary-list">{questions.map(question => <li key={question.id}><p>{questionText(question)}</p><p className="small-note">{question.priority && <>{t('Priority')} · </>}{t(question.discussed ? 'Discussed' : 'Not yet discussed')}</p>{question.navigationSource && <small className="source-label">{t(question.navigationSource.fictional ? 'Fictional campus question' : 'Question about a public source record')}: {language === 'es' ? question.navigationSource.nameEs : question.navigationSource.name}</small>}{question.providerId && <small className="source-label">{clinicLabel(question.providerId)}</small>}</li>)}</ol> : <p>{t('No questions added.')}</p>}</section>}
      {sections.notes && <section><h3>{t('Optional notes')}</h3>{hasNotes ? <>{visitNotes.trim() && <div><h4>{t('Visit notes')}</h4><p className="preserve-lines">{visitNotes}</p></div>}{questions.filter(question => question.note.trim()).map(question => <div key={question.id} className="question-note-summary"><h4>{questionText(question)}</h4>{question.navigationSource && <small className="source-label">{t(question.navigationSource.fictional ? 'Fictional campus question' : 'Question about a public source record')}: {language === 'es' ? question.navigationSource.nameEs : question.navigationSource.name}</small>}{question.providerId && <small className="source-label">{clinicLabel(question.providerId)}</small>}<p className="preserve-lines">{question.note}</p></div>)}{followUps.filter(task => task.note?.trim()).map(task => <div key={task.id} className="question-note-summary"><h4>{task.title}</h4><p className="preserve-lines">{task.note}</p></div>)}</> : <p>{t('No notes added.')}</p>}</section>}
      {sections.followups && <section><h3>{t('Follow-up tasks')}</h3><p className="small-note">{t('User-entered tasks. No notifications are scheduled.')}</p>{followUps.length ? <ul className="summary-list">{followUps.map(task => <li key={task.id}>{t(task.done ? 'Completed' : 'To do')}: {task.title}{task.dueDate && <p className="small-note">{t('Due')}: <time dateTime={task.dueDate}>{formatDate(task.dueDate)}</time></p>}</li>)}</ul> : <p>{t('No follow-up tasks added.')}</p>}</section>}
      {sections.navigation && <section><h3>{t('Selected place & demo route')}</h3>{navigationPlace ? <><p>{language === 'es' ? navigationPlace.nameEs : navigationPlace.name}</p><p className="small-note">{t(navigationPlace.fictional ? 'Fictional campus — not real directions' : 'Public records may be incomplete or outdated. No accessible route is computed for this place.')}</p><p className="small-note">{t('Source')}: {t(navigationPlace.source.name)}</p></> : <p>{t('No navigation stop selected.')}</p>}{route?.status === 'ok' && <><p>{t('Supported demo route')} · {route.totalMeters} m</p><ol>{route.directions.map(direction => <li key={direction.edgeId}>{language === 'es' ? direction.textEs : direction.text} · {direction.distanceMeters} m</li>)}</ol></>}{route?.status === 'unavailable' && <p>{t('The available data does not support a route under these constraints.')}</p>}</section>}
      <footer><p className="small-note">{t('A personal planning aid. This is not an official medical record or medical advice.')}</p></footer>
    </article>
  </div>
}




