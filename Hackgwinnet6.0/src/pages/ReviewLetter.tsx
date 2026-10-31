import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowLeft, FileText, FileUp, Square, Volume2, Type } from 'lucide-react'
import { Modal } from '../components/Modal'
import { accommodationQuestions, featureLabels, providers } from '../data/mockData'
import { useSpeech } from '../hooks/useSpeech'
import { getSampleLetter, localizeSampleLetter } from '../services/mockServices'
import { useApp } from '../state/AppContext'
import type { AccessFeature, Appointment, AppointmentLetter } from '../types'
import './VisitViews.css'

const detailFields = [
  ['clinicName', 'Clinic'], ['date', 'Date'], ['time', 'Appointment time'],
  ['arrivalTime', 'Arrive by'], ['address', 'Address'], ['arrival', 'Arrival instructions'],
] as const
const accessFeatures: AccessFeature[] = ['stepFree', 'communication', 'quiet']
type DetailKey = typeof detailFields[number][0]

function dateInput(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (value === '3 December 2026' || value === '3 de diciembre de 2026') return '2026-12-03'
  if (value === '10 December 2026' || value === '10 de diciembre de 2026') return '2026-12-10'
  return ''
}
function timeInput(value: string) {
  if (/^\d{2}:\d{2}$/.test(value)) return value
  const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  return match ? `${String(Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0)).padStart(2, '0')}:${match[2]}` : ''
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function LetterDetails({ letter }: { letter: AppointmentLetter | Appointment }) {
  const { t } = useApp()
  return <dl className="detail-grid review-details">{detailFields.map(([key, label]) => <div key={key}><dt>{t(label)}</dt><dd>{letter[key] || t('Not confirmed')}</dd></div>)}</dl>
}

export default function ReviewLetter() {
  const { selectedProvider, appointment, updateAppointment, activeLetter, openLetter, confirmLetter, tasks, questions, addQuestion, fileInfo, setFileInfo, navigate, notify, preferences, t, language } = useApp()
  const [sampleProviderId, setSampleProviderId] = useState(activeLetter?.providerId ?? selectedProvider?.id ?? providers[0].id)
  const [variant, setVariant] = useState<'original' | 'updated'>(() => activeLetter?.id === getSampleLetter(providers.find(provider => provider.id === activeLetter?.providerId), 'updated').id ? 'updated' : 'original')
  const [reviewLetter, setReviewLetter] = useState<AppointmentLetter | null>(null)
  const [selectedTasks, setSelectedTasks] = useState<string[]>([])
  const [conflictChoice, setConflictChoice] = useState<'keep' | 'letter' | ''>('')
  const [fileError, setFileError] = useState('')
  const [mobilePane, setMobilePane] = useState<'original' | 'explanation'>('explanation')
  const [largeReader, setLargeReader] = useState(false)
  const [editing, setEditing] = useState<Appointment | null>(null)
  const [editingNew, setEditingNew] = useState(false)
  const [detailErrors, setDetailErrors] = useState<Partial<Record<DetailKey, string>>>({})
  const editInitial = useRef<Appointment | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const { supported, speaking, status, speak, stop } = useSpeech(language)
  const letter = activeLetter ? localizeSampleLetter(activeLetter, language) : null
  const reviewDisplay = reviewLetter ? localizeSampleLetter(reviewLetter, language) : null
  const letterProvider = providers.find(provider => provider.id === letter?.providerId)
  const unknownFeatures = letterProvider ? accessFeatures.filter(feature => !letterProvider.features.includes(feature) && !letterProvider.unavailableFeatures?.includes(feature)) : []
  const sampleField = (key: 'date' | 'arrival') => appointment && appointment.source === 'sample' && !(appointment.editedFields?.includes(key) ?? appointment.userEdited) ? t(appointment[key]) : appointment?.[key] ?? ''
  const appointmentDisplay = appointment ? { ...appointment, date: sampleField('date'), arrival: sampleField('arrival') } : null

  function conflictsWithCurrent(candidate: AppointmentLetter) {
    return Boolean((selectedProvider && selectedProvider.id !== candidate.providerId) || (appointment && detailFields.some(([key]) => appointment[key] !== candidate[key])))
  }
  const conflict = reviewLetter ? conflictsWithCurrent(reviewLetter) : false

  function loadSample() {
    if (speaking) stop()
    setFileError('')
    openLetter(providers.find(provider => provider.id === sampleProviderId), variant)
  }
  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!(file.type === 'application/pdf' || file.type.startsWith('image/') || /\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|heic|heif|avif)$/i.test(file.name))) {
      setFileError('Please choose a PDF or image file, such as a PNG or JPG.')
      return
    }
    if (speaking) stop()
    setFileError('')
    // Store only the filename in shared memory. Never read the file contents.
    setFileInfo({ name: file.name })
  }
  function beginReview() {
    if (!activeLetter) return
    if (speaking) stop()
    setReviewLetter(activeLetter)
    setSelectedTasks(activeLetter.tasks.map(task => task.id))
    setConflictChoice('')
  }
  function finishReview(event: FormEvent) {
    event.preventDefault()
    if (!reviewLetter || (conflict && !conflictChoice)) return
    if (conflict && conflictChoice === 'keep') notify('Your current visit is unchanged. No details or tasks from this letter were added.')
    else confirmLetter(reviewLetter, selectedTasks)
    setReviewLetter(null)
    navigate('care')
  }
  function saveDetails(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    const errors: Partial<Record<DetailKey, string>> = {}
    if (!editing.clinicName.trim()) errors.clinicName = 'Enter the clinic or service name.'
    if (!validDate(editing.date)) errors.date = 'Enter a valid appointment date.'
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(editing.time)) errors.time = 'Enter a valid appointment time.'
    if (editing.arrivalTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(editing.arrivalTime)) errors.arrivalTime = 'Enter a valid arrival time, or leave it blank.'
    setDetailErrors(errors)
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => document.getElementById(`edit-${Object.keys(errors)[0]}`)?.focus())
      return
    }
    const changes: Partial<Appointment> = {}
    detailFields.forEach(([key]) => { if (editingNew || editing[key] !== editInitial.current?.[key]) changes[key] = editing[key].trim() })
    if (editingNew) {
      changes.source = 'user'
      changes.providerId = selectedProvider && editing.clinicName.trim() === selectedProvider.name ? selectedProvider.id : ''
    } else if (changes.clinicName && changes.clinicName !== selectedProvider?.name) changes.providerId = ''
    if (Object.keys(changes).length > 0) updateAppointment(changes)
    setEditing(null)
    if (editingNew) navigate('care')
  }
  function beginEditing() {
    const draft: Appointment = appointmentDisplay ? {
      ...appointmentDisplay, date: dateInput(appointmentDisplay.date), time: timeInput(appointmentDisplay.time), arrivalTime: timeInput(appointmentDisplay.arrivalTime),
    } : { letterId: '', providerId: selectedProvider?.id ?? '', clinicName: selectedProvider?.name ?? '', date: '', time: '', arrivalTime: '', address: selectedProvider?.address ?? '', arrival: '', source: 'user' }
    editInitial.current = { ...draft }
    setEditingNew(!appointment)
    setDetailErrors({})
    setEditing(draft)
  }
  const sourceLabel = (source: AppointmentLetter) => t('From your sample appointment letter · {clinic} · {date}', { clinic: source.clinicName, date: source.date })

  return <div className="focused-view stack">
    <button className="back-link text-link" onClick={() => navigate('care')}><ArrowLeft size={17} aria-hidden="true" />{t('Back to My care')}</button>
    <header className="page-heading"><div><p className="eyebrow">{t('BEFORE MY VISIT')}</p><h1 tabIndex={-1}>{t('Appointment information')}</h1><p className="muted">{t('Read at your own pace. Check the source, then choose what belongs in your visit plan.')}</p></div></header>

    {appointmentDisplay ? <section className="panel stack" aria-labelledby="confirmed-details-heading"><div className="section-heading"><div><p className="eyebrow">{t(appointment?.source === 'sample' ? 'FICTIONAL SAMPLE APPOINTMENT' : 'DETAILS ENTERED BY YOU')}</p><h2 id="confirmed-details-heading">{t('Details in my visit plan')}</h2></div><button className="btn btn-secondary" onClick={beginEditing}>{t('Edit confirmed details')}</button></div><LetterDetails letter={appointmentDisplay} /><p className="muted">{t('Editing your plan does not change the original letter or contact the clinic.')}</p></section> : <section className="panel stack" aria-labelledby="enter-details-heading"><div><h2 id="enter-details-heading">{t('Already have appointment details?')}</h2><p className="muted">{t('Enter the information you have. It stays in this session and is not verified with the clinic.')}</p></div><div><button className="btn btn-primary" onClick={beginEditing}>{t('Enter my appointment details')}</button></div></section>}

    <section className="panel review-start" aria-labelledby="sample-letter-heading">
      <div className="stack"><div><h2 id="sample-letter-heading">{t('Explore a sample appointment letter')}</h2><p className="muted">{t('Choose a fictional clinic. The updated version lets you review a change in appointment details.')}</p></div>
        <div className="review-selectors"><div><label className="field-label" htmlFor="sample-clinic">{t('Sample clinic')}</label><select className="input" id="sample-clinic" value={sampleProviderId} onChange={event => setSampleProviderId(event.target.value)}>{providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></div><div><label className="field-label" htmlFor="sample-version">{t('Sample letter version')}</label><select className="input" id="sample-version" value={variant} onChange={event => setVariant(event.target.value as 'original' | 'updated')}><option value="original">{t('Original appointment')}</option><option value="updated">{t('Updated appointment time')}</option></select></div></div>
        <div><button className="btn btn-primary" onClick={loadSample}><FileText size={18} aria-hidden="true" />{t('Open sample letter')}</button></div>
      </div>
      <div className="review-upload stack"><FileUp size={25} aria-hidden="true" /><h3>{t('Have your own document?')}</h3><p className="muted">{t('Choose a PDF or image to see the file selection experience. Its contents are not read or uploaded.')}</p><input ref={fileInput} className="review-file-input" type="file" accept="application/pdf,image/*" aria-label={t('Choose a PDF or image document')} aria-describedby={fileError ? 'file-error' : undefined} aria-invalid={Boolean(fileError)} onChange={chooseFile} tabIndex={-1} /><div><button className="btn btn-secondary" aria-describedby={fileError ? 'file-error' : undefined} onClick={() => fileInput.current?.click()}>{t('Choose a file')}</button></div><p className="muted">{t('Only its filename is kept, for this session.')}</p></div>
    </section>
    {fileError && <p id="file-error" className="inline-notice" role="alert">{t(fileError)}</p>}
    {fileInfo && <section className="inline-notice review-file-notice" aria-label={t('Selected file')}><div><p><strong>{t('Selected file:')} <span className="review-filename">{fileInfo.name}</span></strong></p><p>{t('Document processing is not connected in this prototype. Try the sample appointment letter.')}</p>{letter && <p>{t('The letter below is a separate fictional sample. It was not extracted from your selected file.')}</p>}</div><button className="btn btn-secondary" onClick={() => { setFileInfo(null); setFileError('') }}>{t('Remove selected file')}</button></section>}

    {letter && activeLetter ? <>
      <div className="section-heading"><div><h2>{t('Sample letter from {clinic}', { clinic: letter.clinicName })}</h2><p className="muted">{t(language === 'es' ? 'Prewritten Spanish translation of fictional sample content.' : 'Prewritten fictional content. Review it before updating your plan.')}</p></div><span className="badge">{t('Sample document')}</span></div>
      {conflictsWithCurrent(activeLetter) && <div className="inline-notice"><p><strong>{t('This letter differs from your current visit.')}</strong> {t('Your current clinic and appointment stay unchanged until you review the differences and choose which information to keep.')}</p></div>}
      <div className="button-row"><button className="btn btn-secondary" aria-pressed={largeReader} onClick={() => setLargeReader(current => !current)}><Type size={18} aria-hidden="true" />{t(largeReader ? 'Use standard document text' : 'Use larger document text')}</button></div>
      <div className="review-mobile-controls button-row" role="group" aria-label={t('Document reading view')}><button className={`btn ${mobilePane === 'original' ? 'btn-primary' : 'btn-secondary'}`} aria-controls="original-letter-panel" aria-pressed={mobilePane === 'original'} onClick={() => setMobilePane('original')}>{t('Original sample')}</button><button className={`btn ${mobilePane === 'explanation' ? 'btn-primary' : 'btn-secondary'}`} aria-controls="explanation-panel" aria-pressed={mobilePane === 'explanation'} onClick={() => setMobilePane('explanation')}>{t('Explanation')}</button></div>
      <div className={`review-reader-grid${largeReader ? ' review-large-text' : ''}`}>
        <section id="original-letter-panel" className="panel stack review-pane" data-mobile-hidden={mobilePane !== 'original'} aria-labelledby="original-letter-heading"><div><p className="eyebrow">{t('SOURCE')}</p><h3 id="original-letter-heading">{t('Original sample letter')}</h3></div><pre className="letter-original review-original">{letter.original}</pre><span className="review-source">{sourceLabel(letter)}</span></section>
        <section id="explanation-panel" className="panel stack review-pane" data-mobile-hidden={mobilePane !== 'explanation'} aria-labelledby="plain-explanation-heading"><div><p className="eyebrow">{t('PREWRITTEN EXPLANATION')}</p><h3 id="plain-explanation-heading">{t('In plain language')}</h3><p className="muted">{t('This explanation was written for the prototype. No document analysis or AI service is connected.')}</p></div>
          <section className="stack"><h4>{t('When and where')}</h4><LetterDetails letter={letter} /></section>
          <section><h4>{t('What to bring')}</h4><ul className="review-preparation-list">{letter.tasks.slice(0, 2).map(task => <li key={task.id}>{task.text}<span className="review-source">{sourceLabel(letter)}</span></li>)}</ul></section>
          <section><h4>{t('What to do before arriving')}</h4><ul className="review-preparation-list">{letter.tasks.slice(2).map(task => <li key={task.id}>{task.text}<span className="review-source">{sourceLabel(letter)}</span></li>)}</ul></section>
          <section className="stack"><h4>{t('Information to check')}</h4><p>{t('This letter does not confirm that access arrangements have been made. Ask the clinic about your specific requests.')}</p>{unknownFeatures.map(feature => {
            const id = `accommodation-${letter.providerId}-${feature}`
            const added = questions.some(question => question.id === id || question.sourceIds?.includes(id))
            return <div className="inline-notice" key={feature}><p>{t('{feature} is not specified in this sample clinic listing.', { feature: t(featureLabels[feature]) })}</p><button className="text-link" disabled={added} onClick={() => addQuestion(accommodationQuestions[feature], id, letter.providerId)}>{t(added ? 'Question added to my visit' : 'Add this to my questions')}</button></div>
          })}</section>
          <div className="review-audio">{preferences.readAloud && <p className="inline-notice">{t('Read-aloud support is on. Choose Read explanation aloud to listen. Nothing plays automatically.')}</p>}<div className="button-row"><button className="btn btn-secondary" onClick={() => speak(`${letter.summary} ${t('This letter does not confirm that access arrangements have been made. Ask the clinic about your specific requests.')}`)} disabled={!supported || speaking}><Volume2 size={18} aria-hidden="true" />{t('Read explanation aloud')}</button><button className="btn btn-ghost" onClick={stop} disabled={!speaking}><Square size={15} aria-hidden="true" />{t('Stop')}</button></div>{!supported && <p className="muted">{t('Read-aloud is unavailable in this browser. The complete explanation is available as text above.')}</p>}<p className="muted" role="status">{t(status)}</p><p className="muted">{t('Speech availability and processing depend on your browser and device.')}</p></div>
          <button className="btn btn-primary" onClick={beginReview}>{t('Review and add to my visit')}</button><p className="muted">{t('You will confirm the details and preparation items first. No appointment is booked.')}</p>
        </section>
      </div>
    </> : <section className="panel empty-state" aria-labelledby="letter-empty-heading"><FileText size={30} aria-hidden="true" /><h2 id="letter-empty-heading">{t(fileInfo ? 'Your file has not been processed' : 'Review information at your own pace')}</h2><p className="muted">{t(fileInfo ? 'No preview or explanation is available for your file. You can deliberately open a fictional sample above.' : 'Open a sample letter to see its original text, explanation, and arrival instructions together.')}</p></section>}

    {reviewLetter && reviewDisplay && <Modal title={t('Review appointment information')} onClose={() => setReviewLetter(null)}><form className="stack" onSubmit={finishReview}>
      <p>{t('These details come from the fictional sample letter for {clinic}. Confirm your choice before updating the visit plan.', { clinic: reviewDisplay.clinicName })}</p>
      {conflict ? <><div className="inline-notice"><p><strong>{t('Choose which information to keep.')}</strong> {t('This sample letter conflicts with your current visit. Nothing has been changed.')}</p></div><div className="review-comparison"><section className="stack"><h3>{t('Current visit')}</h3><dl className="review-details">{detailFields.map(([key, label]) => <div key={key}><dt>{t(label)}</dt><dd>{appointmentDisplay?.[key] ?? (key === 'clinicName' ? selectedProvider?.name : key === 'address' ? selectedProvider?.address : null) ?? t('Not confirmed')}</dd></div>)}</dl></section><section className="stack"><h3>{t('From this letter')}</h3><LetterDetails letter={reviewDisplay} /></section></div><fieldset className="review-choice"><legend>{t('Which information should your visit use?')}</legend><label className="check-row"><input type="radio" name="letter-conflict" value="keep" checked={conflictChoice === 'keep'} onChange={() => setConflictChoice('keep')} /><span><strong>{t('Keep current visit')}</strong><small>{t('Keep the current clinic and appointment. Do not add this letter or its tasks.')}</small></span></label><label className="check-row"><input type="radio" name="letter-conflict" value="letter" checked={conflictChoice === 'letter'} onChange={() => setConflictChoice('letter')} /><span><strong>{t('Use this letter')}</strong><small>{t('Use the clinic and appointment above. Keep existing questions, documents, and preparation with their original source labels.')}</small></span></label></fieldset></> : <LetterDetails letter={reviewDisplay} />}
      <fieldset className="review-task-options" disabled={conflict && conflictChoice !== 'letter'}><legend>{t('Preparation items to add')}</legend><p className="muted">{t('Choose the items you want. Items already in your checklist will not be duplicated.')}</p>{reviewDisplay.tasks.map(task => <label className="check-row" key={task.id}><input type="checkbox" checked={selectedTasks.includes(task.id)} onChange={() => setSelectedTasks(current => current.includes(task.id) ? current.filter(id => id !== task.id) : [...current, task.id])} /><span>{task.text}<small>{sourceLabel(reviewDisplay)}</small>{tasks.some(existing => existing.id === task.id || existing.sourceIds?.includes(task.id)) && <small>{t('Already in your preparation checklist')}</small>}</span></label>)}</fieldset>
      <div className="button-row"><button className="btn btn-secondary" type="button" onClick={() => setReviewLetter(null)}>{t('Cancel')}</button><button className="btn btn-primary" type="submit" disabled={conflict && !conflictChoice}>{t(conflictChoice === 'keep' ? 'Keep current visit' : 'Confirm and add to my visit')}</button></div><p className="muted">{t('This updates your prototype plan only. No appointment is booked.')}</p>
    </form></Modal>}
    {editing && <Modal title={t(editingNew ? 'Enter my appointment details' : 'Edit confirmed details')} onClose={() => setEditing(null)}><form className="stack" onSubmit={saveDetails} noValidate>
      <p className="inline-notice">{t(editingNew ? 'These details are entered by you, not confirmed by the clinic. Saving them does not book an appointment.' : 'Changes are entered by you. The original sample letter stays unchanged, and no appointment is booked or changed with the clinic.')}</p>
      <p className="muted">{t('Clinic, date, and appointment time are required. Other fields are optional.')}</p>
      {detailFields.map(([key, label]) => <div key={key}><label className="field-label" htmlFor={`edit-${key}`}>{t(label)}</label><input className="input" id={`edit-${key}`} type={key === 'date' ? 'date' : key === 'time' || key === 'arrivalTime' ? 'time' : 'text'} value={editing[key]} required={['clinicName', 'date', 'time'].includes(key)} maxLength={key === 'arrival' ? 600 : 200} aria-invalid={Boolean(detailErrors[key])} aria-describedby={detailErrors[key] ? `edit-${key}-error` : undefined} onChange={event => { setEditing(current => current ? { ...current, [key]: event.target.value } : current); setDetailErrors(current => ({ ...current, [key]: undefined })) }} />{detailErrors[key] && <p id={`edit-${key}-error`} className="form-error" role="alert">{t(detailErrors[key]!)}</p>}</div>)}
      <div className="button-row"><button className="btn btn-secondary" type="button" onClick={() => setEditing(null)}>{t('Cancel')}</button><button className="btn btn-primary" type="submit">{t('Save visit details')}</button></div>
    </form></Modal>}
  </div>
}

