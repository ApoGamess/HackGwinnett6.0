import { useId, useRef, useState } from 'react'
import { Maximize2, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../state/AppContext'

export function TwoWayConversation({ onDisplay }: { onDisplay: (text: string) => void }) {
  const { conversation, addConversationTurn, clearConversation, message, setMessage, conversationSpeaker: speaker, setConversationSpeaker: setSpeaker, staffDraft, setStaffDraft, t } = useApp()
  const [confirmClear, setConfirmClear] = useState(false)
  const [status, setStatus] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const clearRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const draft = speaker === 'me' ? message : staffDraft
  const setDraft = speaker === 'me' ? setMessage : setStaffDraft

  return <section className="two-way-conversation stack" aria-labelledby={`${id}-title`}>
    <div><h3 id={`${id}-title`}>{t('Two-way typed conversation')}</h3><p className="muted">{t('Pass the screen to staff so they can type a reply. Both sides use this device; nothing is sent to anyone.')}</p></div>
    {conversation.length ? <ol className="conversation-turns" aria-label={t('Typed conversation')}>{conversation.map(turn => <li key={turn.id} className={`conversation-turn conversation-turn-${turn.speaker}`}>
      <span className="conversation-speaker">{t(turn.speaker === 'me' ? 'Me' : 'Staff (typed on this device)')}</span>
      <p className="preserve-lines">{turn.text}</p>
      <button className="text-link" onClick={() => onDisplay(turn.text)} aria-label={t('Show conversation turn: {text}', { text: turn.text })}><Maximize2 size={16} aria-hidden="true" />{t('Show in large text')}</button>
    </li>)}</ol> : <p className="conversation-empty">{t('No conversation yet. Add your message, then invite staff to type their reply.')}</p>}
    <form className="stack" onSubmit={event => {
      event.preventDefault()
      if (!draft.trim()) return
      addConversationTurn(speaker, draft)
      setDraft('')
      setStatus(speaker === 'me' ? 'Your turn was added to this screen.' : 'The typed staff reply was added to this screen.')
      inputRef.current?.focus()
    }}>
      <div><label className="field-label" htmlFor={`${id}-speaker`}>{t('Who is typing?')}</label><select id={`${id}-speaker`} className="input" value={speaker} onChange={event => setSpeaker(event.target.value as 'me' | 'staff')}><option value="me">{t('Me')}</option><option value="staff">{t('Staff (on this device)')}</option></select></div>
      <div><label className="field-label" htmlFor={`${id}-text`}>{t(speaker === 'me' ? 'Your conversation message' : 'Staff reply')}</label><textarea ref={inputRef} id={`${id}-text`} className="input" rows={3} maxLength={1500} value={draft} onChange={event => setDraft(event.target.value)} /></div>
      <button type="submit" className="btn btn-primary" disabled={!draft.trim()}><Plus size={18} aria-hidden="true" />{t(speaker === 'me' ? 'Add my turn' : 'Add typed staff reply')}</button>
    </form>
    <p className="small-note" role="status">{t(status)}</p>
    <p className="small-note">{t('Conversation turns stay in memory during this session, including when you change screens. Refreshing or resetting your personal session clears them.')}</p>
    {!!conversation.length && <button ref={clearRef} className="text-link" onClick={() => setConfirmClear(true)}><Trash2 size={16} aria-hidden="true" />{t('Clear typed conversation')}</button>}
    {confirmClear && <div className="conversation-clear notice stack"><h4>{t('Clear this typed conversation?')}</h4><p>{t('This removes the conversation turns. Your current draft and visit questions stay.')}</p><div className="button-row"><button autoFocus className="btn btn-secondary" onClick={() => { setConfirmClear(false); clearRef.current?.focus() }}>{t('Keep conversation')}</button><button className="btn btn-primary" onClick={() => { clearConversation(); setConfirmClear(false); setStatus('Typed conversation cleared.'); inputRef.current?.focus() }}>{t('Clear conversation now')}</button></div></div>}
  </section>
}

