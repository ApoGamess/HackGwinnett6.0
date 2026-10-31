import { useState } from 'react'
import { ArrowLeft, Check, MapPin, Search, SlidersHorizontal } from 'lucide-react'
import { Modal } from '../components/Modal'
import { accommodationQuestions, featureLabels, providers } from '../data/mockData'
import { searchProviders } from '../services/mockServices'
import { useApp } from '../state/AppContext'
import type { AccessFeature, Provider } from '../types'
import './VisitViews.css'

const features: AccessFeature[] = ['stepFree', 'quiet', 'communication']
const accessNames: Record<AccessFeature, string> = {
  stepFree: 'Step-free entry', quiet: 'Quiet waiting options', communication: 'Communication support',
}

export default function FindCare() {
  const { preferences, selectedProvider, appointment, activeLetter, questions, addQuestion, addProvider, navigate, t, language } = useApp()
  const profileFilters = () => features.filter(feature => preferences[feature])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<AccessFeature[]>(profileFilters)
  const [details, setDetails] = useState<Provider | null>(null)
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const results = searchProviders(query, filters, language)
  const comparison = providers.filter(provider => compareIds.includes(provider.id))
  const clearFilters = () => { setQuery(''); setFilters([]) }

  function selectProvider(provider: Provider) {
    setDetails(null)
    if ((appointment && appointment.providerId !== provider.id) || (activeLetter && activeLetter.providerId !== provider.id)) {
      setPendingProvider(provider)
      return
    }
    addProvider(provider)
    navigate('care')
  }

  function confirmProvider() {
    if (!pendingProvider) return
    addProvider(pendingProvider)
    setPendingProvider(null)
    navigate('care')
  }

  function accessInformation(provider: Provider) {
    return <ul className="find-access-list">
      {features.map(feature => {
        const listed = provider.features.includes(feature)
        const unavailable = provider.unavailableFeatures?.includes(feature)
        const questionId = `accommodation-${provider.id}-${feature}`
        const added = questions.some(question => question.id === questionId || question.sourceIds?.includes(questionId))
        return <li key={feature}>
          <p><strong>{t(accessNames[feature])}</strong><span className={`access-status ${listed ? 'access-listed' : unavailable ? 'access-unavailable' : 'access-unknown'}`}>{t(listed ? 'Listed in the fictional sample' : unavailable ? 'Not available in the fictional sample' : 'Not specified')}</span></p>
          {!listed && !unavailable && <button className="text-link" onClick={() => addQuestion(accommodationQuestions[feature], questionId, provider.id)} disabled={added} aria-label={`${t(added ? 'Question added to my visit' : 'Add this to my questions')}: ${t(featureLabels[feature])} · ${provider.name}`}>
            {added && <Check size={16} aria-hidden="true" />}{t(added ? 'Question added to my visit' : 'Add this to my questions')}
          </button>}
        </li>
      })}
    </ul>
  }

  return <div className="focused-view stack">
    <button className="back-link text-link" onClick={() => navigate('care')}><ArrowLeft size={17} aria-hidden="true" />{t('Back to My care')}</button>
    <header className="page-heading"><div><p className="eyebrow">{t('BEFORE MY VISIT')}</p><h1 tabIndex={-1}>{t('Find care')}</h1><p className="muted">{t('Explore three fictional clinics. Compare practical details and bring your questions into the same visit plan.')}</p></div><span className="badge">{t('Fictional sample directory')}</span></header>

    <section className="panel stack" aria-labelledby="care-search-heading">
      <div className="section-heading"><h2 id="care-search-heading">{t('What would make your visit easier?')}</h2><SlidersHorizontal size={22} aria-hidden="true" /></div>
      <div><label className="field-label" htmlFor="clinic-search">{t('Search sample clinics')}</label><input className="input" id="clinic-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Clinic, type of care, or neighborhood')} /></div>
      <fieldset className="find-filter-fieldset"><legend>{t('Show clinics with these listed accommodations')}</legend><div className="find-filter-options">{features.map(feature => <label className="preference-chip" key={feature}><input type="checkbox" checked={filters.includes(feature)} onChange={() => setFilters(current => current.includes(feature) ? current.filter(item => item !== feature) : [...current, feature])} /><span>{t(featureLabels[feature])}</span></label>)}</div></fieldset>
      <p className="muted secondary-copy">{t('Filters start with your access requests and change this search only. Unknown information does not count as a match.')}</p>
      {filters.length > 0 && <div className="selected-filters" aria-label={t('Selected filters')}>{filters.map(feature => <button className="badge" key={feature} onClick={() => setFilters(current => current.filter(item => item !== feature))} aria-label={t('Remove filter: {filter}', { filter: t(featureLabels[feature]) })}>{t(featureLabels[feature])}<span aria-hidden="true"> ×</span></button>)}</div>}
      <div className="button-row"><button className="text-link" onClick={() => setFilters(profileFilters())}>{t('Use my access requests')}</button><button className="text-link" onClick={clearFilters}>{t('Reset search and filters')}</button></div>
    </section>

    {comparison.length > 0 && <section className="panel stack" aria-labelledby="compare-heading"><div className="section-heading"><div><p className="eyebrow">{t('SIDE BY SIDE')}</p><h2 id="compare-heading">{t('Compare sample clinics')}</h2><p className="muted" role="status">{t('{count} of 2 clinics selected for comparison.', { count: comparison.length })}</p></div><button className="text-link" onClick={() => setCompareIds([])}>{t('Clear comparison')}</button></div>{comparison.length === 1 && <p className="inline-notice">{t('Choose one more clinic below to compare access and arrival information.')}</p>}<div className="find-comparison-grid">{comparison.map(provider => <article className="stack comparison-provider" key={provider.id}><div className="section-heading"><h3>{provider.name}</h3><button className="text-link" onClick={() => setCompareIds(current => current.filter(id => id !== provider.id))} aria-label={t('Remove {clinic} from comparison', { clinic: provider.name })}>{t('Remove')}</button></div>{accessInformation(provider)}<div><h4>{t('Arrival information')}</h4><p>{t(provider.arrival)}</p></div><button className="btn btn-secondary" onClick={() => selectProvider(provider)}>{t('Use this clinic in my visit plan')}</button></article>)}</div></section>}

    <section aria-labelledby="clinic-results-heading" className="stack">
      <div className="section-heading"><div><h2 id="clinic-results-heading">{t('Sample clinic options')}</h2><p className="muted" role="status">{t('{count} of 3 sample clinics match your search and selected filters.', { count: results.length })}</p></div><p className="muted">{t('Compare up to 2 clinics')}</p></div>
      <div className="provider-list">{results.map(provider => <article className={`panel provider-card stack${selectedProvider?.id === provider.id ? ' find-selected-provider' : ''}`} key={provider.id} aria-labelledby={`clinic-${provider.id}`}>
        <div className="section-heading find-provider-heading"><div><p className="eyebrow">{t(provider.specialty)}</p><h3 id={`clinic-${provider.id}`}>{provider.name}</h3><p className="muted find-location"><MapPin size={16} aria-hidden="true" />{t(provider.area)}</p></div>{selectedProvider?.id === provider.id && <span className="badge"><Check size={15} aria-hidden="true" />{t('In my visit plan')}</span>}</div>
        <p className="secondary-copy">{t(provider.description)}</p>{accessInformation(provider)}
        <label className="check-row comparison-picker"><input type="checkbox" checked={compareIds.includes(provider.id)} disabled={compareIds.length >= 2 && !compareIds.includes(provider.id)} onChange={() => setCompareIds(current => current.includes(provider.id) ? current.filter(id => id !== provider.id) : current.length < 2 ? [...current, provider.id] : current)} /><span>{t('Compare {clinic}', { clinic: provider.name })}</span></label>
        <div className="button-row find-provider-actions"><button className="text-link" onClick={() => setDetails(provider)} aria-label={`${t('View clinic details')}: ${provider.name}`}>{t('View clinic details')}</button><button className="btn btn-primary" onClick={() => selectProvider(provider)}>{t(selectedProvider?.id === provider.id ? 'Return to my visit plan' : 'Use this clinic in my visit plan')}</button></div>
      </article>)}</div>
      {results.length === 0 && <div className="panel empty-state"><Search size={27} aria-hidden="true" /><h3>{t('No matching sample clinics')}</h3><p className="muted">{t('Try a different search or remove a filter. You can ask a clinic about an accommodation that is not listed.')}</p><button className="btn btn-secondary" onClick={clearFilters}>{t('Show all sample clinics')}</button></div>}
    </section>
    <p className="inline-notice">{t('Sample accessibility information is fictional and unverified. Choosing a clinic adds it to your plan; it does not create or confirm an appointment.')}</p>

    {details && <Modal title={details.name} onClose={() => setDetails(null)}><div className="stack"><span className="badge">{t('Fictional clinic')} · {t(details.specialty)}</span><p>{t(details.description)}</p><div><h3>{t('Sample location')}</h3><p>{details.address}</p></div><div><h3>{t('Sample accessibility information')}</h3>{accessInformation(details)}</div><div><h3>{t('Arriving at the clinic')}</h3><p>{t(details.arrival)}</p></div><p className="muted">{t('These sample listings are not verified. Check directly with a clinic about any access arrangements.')}</p><button className="btn btn-primary" onClick={() => selectProvider(details)}>{t('Use this clinic in my visit plan')}</button></div></Modal>}
    {pendingProvider && <Modal title={t('Change your clinic?')} onClose={() => setPendingProvider(null)}><div className="stack"><p>{t('You are changing to {clinic}.', { clinic: pendingProvider.name })}</p>{appointment && <p>{t('The confirmed appointment for {clinic} will be cleared from this visit. No new appointment will be created.', { clinic: appointment.clinicName })}</p>}{activeLetter && <p>{t('The open sample letter will be closed because it belongs to a different clinic.')}</p>}<p>{t('Your access requests, questions, preparation tasks, and reviewed documents will be kept with their original clinic labels. They do not become instructions from the new clinic.')}</p><div className="button-row"><button className="btn btn-secondary" onClick={() => setPendingProvider(null)}>{t('Keep current clinic')}</button><button className="btn btn-primary" onClick={confirmProvider}>{t('Change clinic')}</button></div></div></Modal>}
  </div>
}

