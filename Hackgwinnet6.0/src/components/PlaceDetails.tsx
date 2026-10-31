import { useRef, useState } from 'react'
import { useApp } from '../state/AppContext'
import { campusRepository } from '../navigation/repository'
import { translate } from '../i18n'
import type { AccessibilityFeature, DataMode, FeatureKey, Place, ReportKind, SourceMetadata } from '../navigation/types'

export function SourceDetails({ source }: { source: SourceMetadata }) {
  const { t } = useApp()
  return <dl className="source-details"><div><dt>{t('Source')}</dt><dd>{source.url?.startsWith('https://') ? <a href={source.url} target="_blank" rel="noreferrer">{t(source.name)} ↗</a> : t(source.name)}</dd></div><div><dt>{t('Source updated')}</dt><dd>{source.updatedAt ?? t('Not provided')}</dd></div><div><dt>{t('Retrieved')}</dt><dd>{source.retrievedAt ?? t('Not retrieved from a public service')}</dd></div><div><dt>{t('Field inspected')}</dt><dd>{source.inspectedAt ?? t('No inspection date provided')}</dd></div></dl>
}
const keyLabels: [FeatureKey, string][] = [['wheelchair', 'Wheelchair access'], ['stepFree', 'Step-free access'], ['writtenCommunication', 'Written communication']]
export function PlaceDetails({ place, mode, onRoute, onSaved, onBackToResults }: { place: Place; mode: DataMode; onRoute: (nodeId: string) => void; onSaved: () => void; onBackToResults: () => void }) {
  const { t, language, addQuestion, setMessage, setCommunicationOpen, notify } = useApp()
  const [reportKind, setReportKind] = useState<ReportKind>('blocked_ramp')
  const [note, setNote] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [noteError, setNoteError] = useState('')
  const noteInput = useRef<HTMLTextAreaElement>(null)
  const features = campusRepository.getFeatures(place.id, mode)
  const allFeatures: AccessibilityFeature[] = [...features, ...keyLabels.filter(([key]) => !features.some(feature => feature.key === key)).map(([key, label]) => ({ id: `missing-${key}`, placeId: place.id, key, label, labelEs: translate('es', label), state: 'unknown' as const, source: { name: 'No feature record in this source' } }))]
  const name = language === 'es' ? place.nameEs : place.name
  const ask = (feature?: AccessibilityFeature) => {
    const en = feature ? `At ${place.name}, what should I know about ${feature.label.toLowerCase()}?` : `Where is the step-free entrance for ${place.name}?`
    const es = feature ? `En ${place.nameEs}, ¿qué debo saber sobre ${feature.labelEs.toLowerCase()}?` : `¿Dónde está la entrada sin escalones de ${place.nameEs}?`
    addQuestion(en, `access-${place.id}-${feature?.key ?? 'entrance'}`, undefined, { en, es }, { name: place.name, nameEs: place.nameEs, fictional: place.fictional })
  }
  const reports = campusRepository.listReports(mode).filter(report => report.targetId === place.id)
  const documents = mode === 'demo' ? campusRepository.getDocuments().filter(document => document.placeId === place.id) : []
  return <section className="panel place-detail" aria-labelledby="selected-place-title">
    <p className="eyebrow">{t('SELECTED NAVIGATION STOP')}</p><h2 id="selected-place-title" tabIndex={-1}>{name}</h2>
    <button className="text-link" onClick={onBackToResults}>{t('Back to place results')}</button>
    <span className="badge">{t(place.fictional ? 'Fictional demo' : 'Public source record')}</span>
    {place.address && <p>{place.address}</p>}
    <p className="muted">{language === 'es' ? place.notesEs ?? place.notes : place.notes}</p>
    {place.coordinateKind === 'center' && <p className="access-warning">{t('This point is a mapped area center, not an entrance. Door-level directions are unavailable.')}</p>}
    {mode === 'public' && <p className="small-note">{t('Public records may be incomplete or outdated. No accessible route is computed for this place.')}</p>}
    <SourceDetails source={place.source} />
    {place.officialSource && <details><summary>{t('Official name and address source')}</summary><SourceDetails source={place.officialSource} /><p className="small-note">{t('The official name and address match this OpenStreetMap building. Its center is not an entrance. Retrieval is not an access inspection.')}</p></details>}
    {mode === 'public' && <a className="text-link" href={`https://www.openstreetmap.org/?mlat=${place.coordinates[1]}&mlon=${place.coordinates[0]}#map=18/${place.coordinates[1]}/${place.coordinates[0]}`} target="_blank" rel="noreferrer">{t('Open in external map')} ↗</a>}
    {documents.map(document => <details key={document.id}><summary>{language === 'es' ? document.titleEs : document.title}</summary><p className="preserve-lines small-note">{language === 'es' ? document.contentEs : document.content}</p></details>)}
    <h3>{t('Individual access features')}</h3><p className="small-note">{t('A yes applies only to that feature. It does not describe every room or promise assistance or equipment availability.')}</p>
    <ul className="feature-records">{allFeatures.map(feature => <li key={feature.id}><div className="feature-heading"><strong>{language === 'es' ? feature.labelEs : feature.label}</strong><span className={`feature-state feature-${feature.state}`}>{t(({ yes: 'Yes', no: 'No', limited: 'Limited', unknown: 'Unknown' })[feature.state])}</span></div>{(feature.description || feature.descriptionEs) && <p className="small-note">{language === 'es' ? feature.descriptionEs ?? feature.description : feature.description}</p>}<details><summary>{t('Feature source & dates')}</summary><SourceDetails source={feature.source} /></details>{feature.state !== 'yes' && <button className="text-link" onClick={() => ask(feature)}>{t('Add a question about this')}<span className="sr-only">: {language === 'es' ? feature.labelEs : feature.label}</span></button>}</li>)}</ul>
    {place.osm && <details><summary>{t('Original OpenStreetMap tags')} · {place.osm.type}/{place.osm.id}</summary><dl className="original-tags">{Object.entries(place.osm.tags).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details>}
    <div className="button-row">{mode === 'demo' && place.routeNodeId && <button className="btn btn-primary" onClick={() => onRoute(place.routeNodeId!)}>{t('Route to this place')}</button>}<button className="btn btn-secondary" onClick={() => ask()}>{t('Add an entrance question')}</button><button className="btn btn-secondary" onClick={() => { setMessage(t('Where is the step-free entrance for {place}?', { place: name })); setCommunicationOpen(true) }}>{t('Show an entrance question')}</button></div>
    <details className="barrier-form"><summary>{t('Report a barrier locally')}</summary><form className="stack" onSubmit={event => {
      event.preventDefault()
      setReportMessage('')
      if (!note.trim()) { setNoteError('Write a short note about the barrier before saving.'); noteInput.current?.focus(); return }
      setNoteError('')
      try {
        campusRepository.addReport({ mode, targetId: place.id, kind: reportKind, note })
        setNote(''); setReportMessage('Report saved in this browser only. Unverified; not sent or published.'); onSaved(); notify('Local barrier report saved.')
      } catch (error) {
        setReportMessage(error instanceof Error && error.message === 'Local report storage is full. Clear old reports before adding another.' ? error.message : 'The report could not be saved. Browser storage may be unavailable.')
      }
    }}><p>{t('Target')}: <strong>{name}</strong></p><p id="report-privacy-note" className="small-note">{t('Do not include patient names, medical details or other identifying information. Reports stay in this browser and do not change source records or route closures.')}</p><label>{t('Barrier type')}<select className="input" value={reportKind} onChange={e => setReportKind(e.target.value as ReportKind)}>{([['blocked_ramp', 'Blocked ramp'], ['lift_problem', 'Apparent lift problem'], ['inaccurate_information', 'Inaccurate information'], ['unmapped_feature', 'Unmapped access feature']] as const).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label><label>{t('Short note')}<textarea ref={noteInput} className="input" required maxLength={500} rows={3} value={note} aria-invalid={!!noteError} aria-describedby={`report-privacy-note${noteError ? ' report-note-error' : ''}`} onChange={e => { setNote(e.target.value); if (noteError) setNoteError(''); setReportMessage('') }} /></label>{noteError && <p id="report-note-error" className="access-warning" role="alert">{t(noteError)}</p>}<button className="btn btn-secondary" type="submit">{t('Save local report')}</button><p role="status">{t(reportMessage)}</p></form></details>
    {reports.length > 0 && <div className="local-reports"><h3>{t('Unverified local reports')}</h3>{reports.map(report => <div key={report.id}><strong>{t(({ blocked_ramp: 'Blocked ramp', lift_problem: 'Apparent lift problem', inaccurate_information: 'Inaccurate information', unmapped_feature: 'Unmapped access feature' })[report.kind])}</strong><p>{report.note}</p><p className="small-note">{t('Saved locally')}: {report.createdAt}</p></div>)}</div>}
  </section>
}

