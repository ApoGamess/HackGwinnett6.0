import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Camera, HeartHandshake, House, Info, MapPin, MessageSquare, RotateCcw, Settings2 } from 'lucide-react'
import { useApp } from './state/AppContext'
import { Modal } from './components/Modal'
import { Communication } from './components/Communication'
import Home from './pages/Home'
import Preferences from './pages/Preferences'
import FindCare from './pages/FindCare'
import ReviewLetter from './pages/ReviewLetter'
import VisitMode from './pages/VisitMode'
import AccessCard from './pages/AccessCard'
import AfterVisit from './pages/AfterVisit'
import VisitSummary from './pages/VisitSummary'
import Explore from './pages/Explore'
import type { Page } from './types'
import { CameraBoundary } from './components/CameraBoundary'

const CameraAssistance = lazy(() => import('./pages/CameraAssistance'))

const titles: Record<Page, string> = { care: 'My care', preferences: 'Preferences', providers: 'Find care', letter: 'Appointment information', visit: 'Visit mode', access: 'My access card', after: 'After my visit', summary: 'My visit summary', explore: 'Places & access', camera: 'Camera assistance' }
export default function App() {
  const { page, setPage, navigate, preferences, setPreference, language, setLanguage, t, communicationOpen, setCommunicationOpen, announcement, resetDemo, resetKey, journey, setJourney } = useApp()
  const [resetOpen, setResetOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const inVisit = page === 'visit'
  const activeStage = page === 'visit' ? 'during' : page === 'after' ? 'after' : ['care', 'providers', 'letter'].includes(page) ? 'before' : journey
  const previousView = useRef({ page, resetKey })
  useEffect(() => {
    const sync = () => { const candidate = window.location.hash.slice(1); setPage(Object.hasOwn(titles, candidate) ? candidate as Page : 'care') }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [setPage])
  useEffect(() => {
    if (previousView.current.page === page && previousView.current.resetKey === resetKey) return
    previousView.current = { page, resetKey }
    mainRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [page, resetKey])
  useEffect(() => { document.title = `${t(titles[page])} · CareNori`; document.documentElement.lang = language }, [page, language, t])
  useEffect(() => {
    document.documentElement.classList.toggle('large-text', preferences.largeText)
    document.documentElement.classList.toggle('high-contrast', preferences.highContrast)
    document.documentElement.classList.toggle('reduced-motion', preferences.reducedMotion)
    document.documentElement.classList.toggle('simplified', preferences.simplified)
  }, [preferences])
  const nav = (mobile = false) => <nav className={mobile ? 'mobile-nav' : ''} aria-label={t(mobile ? 'Mobile navigation' : 'Main navigation')}>
    <a href="#care" className={`nav-item ${!['preferences', 'explore', 'camera'].includes(page) ? 'active' : ''}`} aria-current={!['preferences', 'explore', 'camera'].includes(page) ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate('care') }}><House size={20} aria-hidden="true" />{t('My care')}</a>
    <a href="#explore" className={`nav-item ${page === 'explore' ? 'active' : ''}`} aria-current={page === 'explore' ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate('explore') }}><MapPin size={20} aria-hidden="true" />{t('Places & access')}</a>
    <a href="#camera" className={`nav-item ${page === 'camera' ? 'active' : ''}`} aria-current={page === 'camera' ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate('camera') }}><Camera size={20} aria-hidden="true" />{t('Camera assistance')}</a>
    <a href="#preferences" className={`nav-item ${page === 'preferences' ? 'active' : ''}`} aria-current={page === 'preferences' ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate('preferences') }}><Settings2 size={20} aria-hidden="true" />{t('Preferences')}</a>
  </nav>
  return <div className={`app-shell ${inVisit ? 'visit-shell' : ''}`}>
    <a href="#main-content" className="skip-link" onClick={event => { event.preventDefault(); mainRef.current?.focus() }}>{t('Skip to main content')}</a>
    {!inVisit && <aside className="sidebar">
      <a href="#care" className="brand" onClick={e => { e.preventDefault(); navigate('care') }}><span className="brand-lockup"><span className="brand-mark"><HeartHandshake size={25} aria-hidden="true" /></span>CareNori</span><small>{t('Find care. Understand it. Be heard.')}</small></a>
      <p className="nav-label">{t('YOUR SPACE')}</p>{nav()}
      <div className="sidebar-bottom"><div className="support-note secondary-detail"><span className="support-symbol" aria-hidden="true">✳</span><h2>{t('A little preparation.')}<br />{t('More room for you.')}</h2><p>{t('Move at your own pace. Every step is optional.')}</p></div><button className="reset-button" onClick={() => setResetOpen(true)}><RotateCcw size={17} aria-hidden="true" />{t('Reset session')}</button><p className="session-label">{t('A PRIVATE, IN-SESSION PLAN')}</p></div>
    </aside>}
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-context">{inVisit ? <button className="btn btn-secondary" onClick={() => { setJourney('before'); navigate('care') }}><ArrowLeft size={17} aria-hidden="true" />{t('Exit visit mode')}</button> : <><span className="mobile-brand">CareNori</span><span className="desktop-context">{t('Your care workspace')}<span aria-hidden="true">/</span><strong>{t(titles[page])}</strong></span></>}</div>
        <div className="header-actions"><label className="language-control"><span className="sr-only">{t('Language')}</span><select aria-label={t('Language')} value={language} onChange={e => setLanguage(e.target.value as 'en' | 'es')}><option value="en">English</option><option value="es">Español</option></select></label><button className="btn btn-communicate" onClick={() => setCommunicationOpen(true)} aria-haspopup="dialog"><MessageSquare size={19} aria-hidden="true" />{t('Help me communicate')}<ArrowUpRight size={16} className="communication-arrow" aria-hidden="true" /></button><button className="icon-button mobile-reset" aria-label={t('Reset session')} onClick={() => setResetOpen(true)}><RotateCcw size={19} aria-hidden="true" /></button></div>
      </header>
      {!inVisit && nav(true)}
      <div className="prototype-banner"><Info size={17} aria-hidden="true" /><p>{t('Prototype. Public records are unverified; demo campus, sample clinics and letters are fictional. No bookings or medical advice.')}</p></div>
      <main ref={mainRef} id="main-content" tabIndex={-1} className="main-content">
        <div className="workspace-tools"><span className="session-indicator"><span aria-hidden="true" />{t('Session only · refresh clears your work')}</span><button className="text-link" aria-pressed={preferences.simplified} onClick={() => setPreference('simplified', !preferences.simplified)}>{t(preferences.simplified ? 'Show full view' : 'Simplified view')}</button></div>
        {page !== 'preferences' && <nav className="journey-nav" aria-label={t('Visit journey')}>
          {[['before', 'Before my visit', 'care'], ['during', 'During my visit', 'visit'], ['after', 'After my visit', 'after']].map(([stage, label, target], index) => <button key={stage} aria-current={(stage === activeStage) ? 'step' : undefined} onClick={() => { setJourney(stage as 'before' | 'during' | 'after'); navigate(target as Page) }}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{t(label)}<span className="journey-line" aria-hidden="true" /></button>)}
        </nav>}
        {announcement && <p className="persistent-status" role="status">{t(announcement)}</p>}
        <div key={resetKey}>{page === 'care' ? <Home /> : page === 'explore' ? <Explore /> : page === 'camera' ? <CameraBoundary><Suspense fallback={<p role="status">{t('Loading camera assistance…')}</p>}><CameraAssistance /></Suspense></CameraBoundary> : page === 'preferences' ? <Preferences /> : page === 'providers' ? <FindCare /> : page === 'letter' ? <ReviewLetter /> : page === 'access' ? <AccessCard /> : page === 'after' ? <AfterVisit /> : page === 'summary' ? <VisitSummary /> : <VisitMode />}</div>
      </main>
      <footer className="workspace-footer"><span>CareNori</span><p>{t('Visit content stays in memory. Refresh clears your plan. Display settings, language and explicitly saved local barrier reports stay in this browser.')}</p></footer>
    </div>
    {communicationOpen && <Modal title={t('Help me communicate')} onClose={() => setCommunicationOpen(false)}><Communication includeQuestions /></Modal>}
    {resetOpen && <Modal title={t('Reset this session?')} onClose={() => setResetOpen(false)}><p>{t('This deletes your current clinic, appointment details, documents and filenames, tasks, questions, notes, messages, and access requests. Your interface settings and language stay the same.')}</p><p className="muted">{t('Printed or downloaded copies are outside this app and cannot be removed by resetting.')}</p><div className="button-row"><button className="btn btn-secondary" onClick={() => setResetOpen(false)}>{t('Keep my progress')}</button><button className="btn btn-primary" onClick={() => { setResetOpen(false); resetDemo() }}>{t('Reset session')}</button></div></Modal>}
  </div>
}



