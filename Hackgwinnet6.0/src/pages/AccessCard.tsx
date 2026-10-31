import { useId, useRef, useState } from 'react'
import { ArrowLeft, Maximize2, Pencil, Plus, Printer, Trash2 } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { Modal } from '../components/Modal'

export default function AccessCard() {
  const { accessStatements, selectedStatements, toggleAccessStatement, addAccessStatement, updateAccessStatement, removeAccessStatement, navigate, t } = useApp()
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [display, setDisplay] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const selected = accessStatements.filter(statement => selectedStatements.includes(statement.id))
  const content = <><p className="eyebrow">CareNori</p><h2>{t('My access card')}</h2><p>{t('These are my requests. Please let me know what is possible.')}</p>{selected.length ? <ul className="shared-requests">{selected.map(statement => <li key={statement.id}>{statement.custom ? statement.text : t(statement.text)}</li>)}</ul> : <p className="muted">{t('Select a statement to see it here.')}</p>}<p className="small-note">{t('A personal communication aid. Not a medical identity card or an official document.')}</p></>
  return <div className="stack">
    <button className="back-link print-exclude" onClick={() => navigate('care')}><ArrowLeft size={18} aria-hidden="true" />{t('Back to my care')}</button>
    <div className="page-heading print-exclude"><div><p className="eyebrow">{t('ON YOUR TERMS')}</p><h1 tabIndex={-1}>{t('My access card')}</h1><p className="page-description">{t('Choose what you want staff to know. You control what is shown.')}</p></div></div>
    <div className="journey-columns">
      <section className="panel stack print-exclude" aria-labelledby={`${id}-choose`}><h2 id={`${id}-choose`}>{t('Choose statements to display')}</h2><p className="muted">{t('Access requests are separate from app display settings. Select only what you want to share.')}</p>
        <fieldset className="plain-fieldset"><legend className="sr-only">{t('Access statements')}</legend><div className="stack">{accessStatements.map(statement => <div className="access-choice" key={statement.id}><label className="check-row"><input type="checkbox" checked={selectedStatements.includes(statement.id)} onChange={() => toggleAccessStatement(statement.id)} /><span>{statement.custom ? statement.text : t(statement.text)}</span></label>{statement.custom && <div className="button-row"><button className="text-link" aria-label={t('Edit statement: {text}', { text: statement.text })} onClick={() => { setEditingId(statement.id); setDraft(statement.text); setError(''); inputRef.current?.focus() }}><Pencil size={16} aria-hidden="true" />{t('Edit')}</button><button className="text-link" aria-label={t('Remove statement: {text}', { text: statement.text })} onClick={() => { removeAccessStatement(statement.id); if (editingId === statement.id) { setEditingId(null); setDraft(''); setError('') }; inputRef.current?.focus() }}><Trash2 size={16} aria-hidden="true" />{t('Remove')}</button></div>}</div>)}</div></fieldset>
        <form className="stack" onSubmit={event => { event.preventDefault(); const text = draft.trim(); if (!text) { setError('Write a statement first.'); return }; const saved = editingId ? updateAccessStatement(editingId, text) : addAccessStatement(text); if (!saved) { setError('That statement is already available. Select it above.'); return }; setEditingId(null); setDraft(''); setError(''); inputRef.current?.focus() }}>
          <label className="field-label" htmlFor={`${id}-statement`}>{t(editingId ? 'Edit my statement' : 'Write my own statement')}</label><textarea ref={inputRef} id={`${id}-statement`} className="input" rows={3} maxLength={500} value={draft} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={event => { setDraft(event.target.value); setError('') }} />
          {error && <p id={`${id}-error`} role="alert" className="field-error">{t(error)}</p>}
          <div className="button-row"><button type="submit" className="btn btn-secondary"><Plus size={18} aria-hidden="true" />{t(editingId ? 'Save statement' : 'Add my statement')}</button>{editingId && <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setDraft(''); setError(''); inputRef.current?.focus() }}>{t('Cancel')}</button>}</div><p className="small-note">{t('New statements are added to the list. Select them when you are ready to share.')}</p>
        </form>
      </section>
      <div className="stack"><p className="eyebrow print-exclude">{t('PREVIEW — ONLY SELECTED STATEMENTS')}</p><section className="panel access-preview print-area" aria-label={t('Access card preview')}>{content}</section>
        <div className="button-row print-exclude"><button className="btn btn-primary" disabled={!selected.length} onClick={() => setDisplay(true)}><Maximize2 size={18} aria-hidden="true" />{t('Show in large text')}</button><button className="btn btn-secondary" disabled={!selected.length} onClick={() => window.print()}><Printer size={18} aria-hidden="true" />{t('Print access card')}</button></div>
        <p className="small-note print-exclude">{t('Printed copies and saved PDFs are outside the app. Resetting your session will not remove them.')}</p>
        <button className="text-link print-exclude" onClick={() => navigate('visit')}>{t('Open visit mode')}</button>
      </div>
    </div>
    {display && <Modal title={t('My access card')} onClose={() => setDisplay(false)}><div className="access-large">{content}</div><button className="btn btn-secondary" onClick={() => setDisplay(false)}>{t('Back to my card')}</button></Modal>}
  </div>
}


