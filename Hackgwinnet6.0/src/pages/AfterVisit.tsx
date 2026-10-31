import { useId, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Check, Pencil, Plus, Printer, Trash2 } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { Questions } from '../components/Questions'
import type { FollowUp } from '../types'

export default function AfterVisit() {
  const { visitNotes, setVisitNotes, questions, followUps, addFollowUp, updateFollowUp, removeFollowUp, toggleFollowUp, navigate, t, language } = useApp()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const clearForm = () => { setEditingId(null); setTitle(''); setDueDate(''); setNote(''); setError('') }
  const editTask = (task: FollowUp) => { setEditingId(task.id); setTitle(task.title); setDueDate(task.dueDate || ''); setNote(task.note || ''); setError(''); titleRef.current?.focus() }
  const saveTask = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) { setError('Enter a task title.'); titleRef.current?.focus(); return }
    const normalized = title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
    if (followUps.some(task => task.id !== editingId && task.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase() === normalized)) { setError('A follow-up task with this title already exists. Edit it below.'); return }
    if (editingId) updateFollowUp(editingId, { title: title.trim(), dueDate, note: note.trim() })
    else addFollowUp(title.trim(), dueDate, note.trim())
    clearForm()
    titleRef.current?.focus()
  }
  return <div className="stack">
    <button className="back-link" onClick={() => navigate('care')}><ArrowLeft size={18} aria-hidden="true" />{t('Back to my care')}</button>
    <div className="page-heading"><div><p className="eyebrow">{t('A LITTLE SPACE TO REFLECT')}</p><h1 tabIndex={-1}>{t('After my visit')}</h1><p className="page-description">{t('Keep your notes, unanswered questions, and next steps together.')}</p></div><button className="btn btn-primary" onClick={() => navigate('summary')}><Printer size={18} aria-hidden="true" />{t('Prepare my visit summary')}</button></div>
    <div className="journey-columns">
      <div className="stack">
        <section className="panel stack" aria-labelledby="after-notes-title"><h2 id="after-notes-title">{t('Notes for me')}</h2><label className="field-label" htmlFor="after-notes">{t('Optional typed notes')}</label><textarea id="after-notes" className="input" rows={6} maxLength={6000} value={visitNotes} onChange={event => setVisitNotes(event.target.value)} placeholder={t('What do you want to remember?')} /><p className="small-note">{t('These notes stay in this session. Choose whether to include them in your printed summary.')}</p></section>
        <section className="panel stack" aria-labelledby={`${id}-followups`}><div className="section-heading"><h2 id={`${id}-followups`}>{t('My follow-up tasks')}</h2><span className="count-badge">{t('{done} of {total} complete', { done: followUps.filter(task => task.done).length, total: followUps.length })}</span></div><p className="muted">{t('Add steps you choose yourself. CareNori does not generate medical instructions.')}</p>
          <p className="notice">{t('These are in-app tasks. No email, push notification, or background alert is scheduled in this prototype.')}</p>
          <form className="stack" onSubmit={saveTask} noValidate><h3>{t(editingId ? 'Edit follow-up task' : 'Add a follow-up task')}</h3>
            <div><label className="field-label" htmlFor={`${id}-title`}>{t('Task title')}</label><input ref={titleRef} id={`${id}-title`} className="input" required maxLength={250} value={title} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={event => { setTitle(event.target.value); setError('') }} /></div>
            <div><label className="field-label" htmlFor={`${id}-due`}>{t('Due date (optional)')}</label><input type="date" id={`${id}-due`} className="input" value={dueDate} onChange={event => setDueDate(event.target.value)} /></div>
            <div><label className="field-label" htmlFor={`${id}-note`}>{t('Note (optional)')}</label><textarea id={`${id}-note`} className="input" rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></div>
            {error && <p id={`${id}-error`} className="field-error" role="alert">{t(error)}</p>}
            <div className="button-row"><button type="submit" className="btn btn-secondary"><Plus size={18} aria-hidden="true" />{t(editingId ? 'Save task' : 'Add follow-up task')}</button>{editingId && <button type="button" className="btn btn-ghost" onClick={() => { clearForm(); titleRef.current?.focus() }}>{t('Cancel editing')}</button>}</div>
          </form>
          {followUps.length ? <ul className="followup-list">{followUps.map(task => <li key={task.id} className={`followup-item ${task.done ? 'is-complete' : ''}`}><label className="check-row"><input type="checkbox" checked={task.done} onChange={() => toggleFollowUp(task.id)} aria-label={t(task.done ? 'Reopen task: {title}' : 'Complete task: {title}', { title: task.title })} /><span>{task.title}</span></label>
            <p className="small-note">{task.done ? <><Check size={15} aria-hidden="true" /> {t('Completed')}</> : t('To do')}{task.dueDate && <> · {t('Due')} <time dateTime={task.dueDate}>{new Date(`${task.dueDate}T12:00:00`).toLocaleDateString(language === 'es' ? 'es-US' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time></>}</p>
            {task.note && <p className="preserve-lines">{task.note}</p>}
            <div className="button-row"><button className="text-link" aria-label={t('Edit task: {title}', { title: task.title })} onClick={() => editTask(task)}><Pencil size={16} aria-hidden="true" />{t('Edit')}</button><button className="text-link" aria-label={t('Remove task: {title}', { title: task.title })} onClick={() => { removeFollowUp(task.id); if (editingId === task.id) clearForm(); titleRef.current?.focus() }}><Trash2 size={16} aria-hidden="true" />{t('Remove')}</button></div>
          </li>)}</ul> : <p className="empty-state">{t('No follow-up tasks yet. Add one when you have a next step to remember.')}</p>}
        </section>
      </div>
      <div className="stack"><p className="notice">{t('{count} questions have not been marked as discussed. Keep them here or add a new question.', { count: questions.filter(question => !question.discussed).length })}</p><Questions visit /></div>
    </div>
  </div>
}


