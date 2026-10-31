import { useState } from 'react'
import { ArrowLeft, Camera, Eye, MapPin, Pencil } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { Communication } from '../components/Communication'
import { Questions } from '../components/Questions'
import { Modal } from '../components/Modal'

export default function VisitMode() {
  const { accessStatements, selectedStatements, visitNotes, setVisitNotes, appointment, navigate, t } = useApp()
  const [showRequests, setShowRequests] = useState(false)
  const statements = accessStatements.filter(statement => selectedStatements.includes(statement.id))
  return <div className="visit-mode stack">
    <div className="button-row"><button className="back-link" onClick={() => navigate('care')}><ArrowLeft size={18} aria-hidden="true" />{t('Exit visit mode')}</button><button className="btn btn-secondary" onClick={() => navigate('after')}>{t('After my visit')}</button></div>
    <div className="page-heading"><div><p className="eyebrow">{t('YOUR VOICE, AT YOUR PACE')}</p><h1 tabIndex={-1}>{t('Visit mode')}</h1><p className="page-description">{t('Show a message, use a question, or make a note.')}</p></div>{appointment?.source === 'sample' && <span className="badge">{t('Fictional sample appointment')}</span>}</div>
    <div className="button-row"><button className="btn btn-secondary" onClick={() => navigate('explore')}><MapPin size={18} aria-hidden="true" />{t('Places & access')}</button><button className="btn btn-secondary" onClick={() => navigate('camera')}><Camera size={18} aria-hidden="true" />{t('Open camera assistance')}</button></div>
    <div className="visit-mode-layout"><div className="stack">
      <section className="panel" aria-labelledby="visit-message-title"><h2 id="visit-message-title">{t('Make yourself heard')}</h2><Communication /></section>
      <section className="panel sharing-panel" aria-labelledby="sharing-title"><div className="section-heading"><h2 id="sharing-title">{t('My selected access statements')}</h2><Eye size={21} aria-hidden="true" /></div>
        <p className="muted">{t('Only the statements you selected for your access card appear here.')}</p>
        {statements.length ? <ul className="access-statements">{statements.map(statement => <li key={statement.id}>{statement.custom ? statement.text : t(statement.text)}</li>)}</ul> : <p className="empty-state">{t('No statements selected. You can still use all communication tools.')}</p>}
        <div className="button-row"><button className="btn btn-secondary" disabled={!statements.length} onClick={() => setShowRequests(true)}><Eye size={18} aria-hidden="true" />{t('Show selected statements')}</button><button className="text-link" onClick={() => navigate('access')}><Pencil size={16} aria-hidden="true" />{t('Edit my access card')}</button></div>
      </section>
      <section className="panel visit-note" aria-labelledby="visit-note-title"><h2 id="visit-note-title">{t('Notes for me')}</h2><label className="field-label" htmlFor="during-visit-notes">{t('Optional typed notes')}</label><textarea id="during-visit-notes" className="input" rows={5} maxLength={6000} value={visitNotes} onChange={event => setVisitNotes(event.target.value)} placeholder={t('What do you want to remember?')} /><p className="small-note">{t('These notes stay in this session. Choose whether to include them in your printed summary.')}</p></section>
    </div><Questions visit /></div>
    {showRequests && <Modal title={t('My access requests')} onClose={() => setShowRequests(false)}><ul className="shared-requests">{statements.map(statement => <li key={statement.id}>{statement.custom ? statement.text : t(statement.text)}</li>)}</ul><p className="muted">{t('These are my requests. Please let me know what is possible.')}</p><button className="btn btn-secondary" onClick={() => setShowRequests(false)}>{t('Back to visit mode')}</button></Modal>}
  </div>
}

