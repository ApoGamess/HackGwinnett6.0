import { useEffect, useId, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { providers } from '../data/mockData'

export function Preparation() {
  const { tasks, toggleTask, addTask, updateTask, removeTask, selectedProvider, appointment, taskText, t, preferences } = useApp()
  const [newTask, setNewTask] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [formError, setFormError] = useState<'new' | 'edit' | null>(null)
  const uid = useId()
  const addRef = useRef<HTMLInputElement>(null)
  const editRefs = useRef(new Map<string, HTMLButtonElement>())
  const focusTarget = useRef<string | null>(null)
  useEffect(() => { if (focusTarget.current) { (editRefs.current.get(focusTarget.current) ?? addRef.current)?.focus(); focusTarget.current = null } }, [tasks, editing])
  const done = tasks.filter(task => task.done).length
  const visibleTasks = showAll ? tasks : tasks.slice(0, 4)
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  const duplicateText = (text: string, excludeId?: string) => tasks.some(task => task.id !== excludeId && (normalize(task.text) === normalize(text) || normalize(taskText(task)) === normalize(text)))

  return <section className="panel preparation-panel" aria-labelledby={`${uid}-title`}>
    <div className="section-heading"><div><p className="eyebrow">{t('A LITTLE PREPARATION')}</p><h2 id={`${uid}-title`} tabIndex={-1}>{t('My preparation')}</h2></div><span className="count-badge">{t('{done} of {total} done', { done, total: tasks.length })}</span></div>
    <p className="muted">{t('{done} of {total} preparation tasks completed.', { done, total: tasks.length })}</p>
    {!preferences.simplified && <p className="small-note">{t('Edit this list to make it yours.')}</p>}
    <div className="progress-track" role="progressbar" aria-label={t('Preparation completed')} aria-valuemin={0} aria-valuemax={tasks.length || 1} aria-valuenow={done} aria-valuetext={t('{done} of {total} preparation tasks completed.', { done, total: tasks.length })}><span style={{ width: `${tasks.length ? done / tasks.length * 100 : 0}%` }} /></div>
    {!tasks.length && <p className="empty-state">{t('Your checklist is empty. Add anything you want to remember.')}</p>}
    <ul className="task-list">{visibleTasks.map((task, index) => <li key={task.id}>
      {editing === task.id ? <form className="stack" onSubmit={event => {
        event.preventDefault()
        if (!draft.trim()) return
        if (duplicateText(draft, task.id)) { setFormError('edit'); return }
        updateTask(task.id, draft); focusTarget.current = task.id; setEditing(null); setFormError(null)
      }}>
        <label htmlFor={`${uid}-edit-task`} className="field-label">{t('Edit preparation item')}</label>
        <input id={`${uid}-edit-task`} className="input" autoFocus value={draft} maxLength={250} onChange={event => { setDraft(event.target.value); setFormError(null) }} aria-invalid={formError === 'edit'} aria-describedby={formError === 'edit' ? `${uid}-edit-error` : undefined} />
        {formError === 'edit' && <p id={`${uid}-edit-error`} className="form-error" role="alert">{t('Another preparation item already has that text.')}</p>}
        <div className="button-row"><button className="btn btn-primary" type="submit" disabled={!draft.trim()}>{t('Save item')}</button><button className="btn btn-ghost" type="button" onClick={() => { focusTarget.current = task.id; setEditing(null); setFormError(null) }}>{t('Cancel')}</button></div>
      </form> : <>
        <div className="task-main">
          <label className={`check-row ${task.done ? 'completed' : ''}`}><input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} /><span>{taskText(task)}</span></label>
          <div className="task-actions"><button className="btn btn-ghost btn-small" ref={element => { if (element) editRefs.current.set(task.id, element); else editRefs.current.delete(task.id) }} aria-label={t('Edit item: {text}', { text: taskText(task) })} onClick={() => { setDraft(taskText(task)); setEditing(task.id); setFormError(null) }}><Pencil size={15} aria-hidden="true" />{t('Edit')}</button><button className="btn btn-ghost btn-small" aria-label={t('Remove item: {text}', { text: taskText(task) })} onClick={() => { focusTarget.current = visibleTasks[index + 1]?.id ?? visibleTasks[index - 1]?.id ?? 'add'; removeTask(task.id) }}><Trash2 size={15} aria-hidden="true" />{t('Remove')}</button></div>
        </div>
        {(task.source !== 'starter' || task.userEdited) && <p className="small-note provenance">{task.source !== 'starter' && t(task.source === 'letter' ? 'From your sample appointment letter.' : 'Added by you.')}{task.userEdited && task.source !== 'user' && ` ${t('Wording edited by you.')}`}</p>}
        {task.providerId && (task.providerId !== selectedProvider?.id || (task.letterId && task.letterId !== appointment?.letterId)) && <p className="small-note provenance">{t('From {source} — check whether this still applies.', { source: task.providerId !== selectedProvider?.id ? providers.find(provider => provider.id === task.providerId)?.name ?? t('your previous clinic') : t('an earlier sample letter') })}</p>}
      </>}
    </li>)}</ul>
    {tasks.length > 4 && <button className="text-link view-all-tasks" aria-expanded={showAll} onClick={() => setShowAll(previous => !previous)}>{t(showAll ? 'Show fewer preparation tasks' : 'View all {count} preparation tasks', { count: tasks.length })}</button>}
    <form className="add-item" onSubmit={event => {
      event.preventDefault()
      if (!newTask.trim()) return
      if (duplicateText(newTask)) { setFormError('new'); return }
      addTask(newTask); setNewTask(''); setFormError(null); setShowAll(true); addRef.current?.focus()
    }}>
      <label className="field-label" htmlFor={`${uid}-new-task`}>{t('Add a preparation item')}</label>
      <div className="inline-form"><input id={`${uid}-new-task`} ref={addRef} className="input" value={newTask} maxLength={250} onChange={event => { setNewTask(event.target.value); setFormError(null) }} placeholder={t('Something to remember…')} aria-invalid={formError === 'new'} aria-describedby={formError === 'new' ? `${uid}-new-error` : undefined} /><button className="btn btn-secondary" type="submit" disabled={!newTask.trim()} aria-label={t('Add preparation item')}><Plus size={18} aria-hidden="true" />{t('Add')}</button></div>
      {formError === 'new' && <p id={`${uid}-new-error`} className="form-error" role="alert">{t('That preparation item is already in your checklist.')}</p>}
    </form>
  </section>
}
