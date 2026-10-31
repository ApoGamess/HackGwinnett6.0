import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, MapPin, Search, LocateFixed } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { campusRepository } from '../navigation/repository'
import { getCachedPublicPlaces, searchPublicPlaces } from '../navigation/overpass'
import { GRADY_CENTER, gradyPublicSeed } from '../navigation/publicSeed'
import { LocationSession, manualStartingPoint, type LocationFix } from '../navigation/geolocation'
import { mapProviders, optionalGoogleProvider } from '../navigation/mapProvider'
import { computeRoute, DEFAULT_ROUTE_PROFILE } from '../navigation/route'
import { RoutePlanner } from '../components/RoutePlanner'
import { PlaceDetails } from '../components/PlaceDetails'
import { MapBoundary } from '../components/MapBoundary'
import type { DataMode, FeatureKey, PlaceCategory, PublicRecords } from '../navigation/types'
import './Navigation.css'

const NavigationMap = lazy(() => import('../components/NavigationMap').then(module => ({ default: module.NavigationMap })))
const categories: [PlaceCategory, string][] = [['healthcare', 'Healthcare'], ['pharmacy', 'Pharmacies'], ['entrance', 'Entrances'], ['ramp', 'Ramps'], ['elevator', 'Elevators'], ['parking', 'Parking'], ['dropoff', 'Drop-off'], ['restroom', 'Restrooms'], ['waiting', 'Waiting / rest areas'], ['quiet', 'Quiet areas'], ['assistance', 'Assistance desks'], ['reception', 'Reception'], ['consultation', 'Consultation rooms'], ['stairs', 'Stairs']]
const featureFilters: [FeatureKey, string][] = [['stepFree', 'Step-free access'], ['accessibleRestroom', 'Accessible restroom'], ['accessibleParking', 'Accessible parking'], ['writtenCommunication', 'Written communication'], ['quiet', 'Quiet waiting'], ['wheelchairAssistance', 'Wheelchair assistance']]
const cityCenters: Record<string, [number, number]> = { 'Grady Memorial Hospital': GRADY_CENTER, Berlin: [13.388, 52.517], London: [-0.1276, 51.5072], 'New York': [-73.9857, 40.7484] }
export default function Explore() {
  const { t, language, navigate, preferences, dataMode: mode, setDataMode, navigationPlace, setNavigationPlace, closedElevators, setClosedElevators, routeProfile, setRouteProfile, routeSelection, setRouteSelection, setMessage, setCommunicationOpen, notify, pendingPlaceQuery, setPendingPlaceQuery } = useApp()
  const [view, setView] = useState<'list' | '2d' | '3d'>(preferences.simplified ? 'list' : '2d')
  const [floor, setFloor] = useState<0 | 1>(0)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<PlaceCategory | ''>('')
  const [featureKeys, setFeatureKeys] = useState<FeatureKey[]>([])
  const [revision, setRevision] = useState(0)
  const [orientationKey, setOrientationKey] = useState(0)
  const [mapError, setMapError] = useState('')
  const [searchCenter, setSearchCenter] = useState<[number, number]>(GRADY_CENTER)
  const [explicitCenter, setExplicitCenter] = useState<[number, number]>(GRADY_CENTER)
  const [longitude, setLongitude] = useState(String(GRADY_CENTER[0]))
  const [latitude, setLatitude] = useState(String(GRADY_CENTER[1]))
  const [searchStatus, setSearchStatus] = useState('')
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [position, setPosition] = useState<LocationFix | null>(null)
  const [cachedOffer, setCachedOffer] = useState<{ records: PublicRecords; center: [number, number] } | null>(null)
  const [loadedSearchCenter, setLoadedSearchCenter] = useState<[number, number] | null>(null)
  const [detailsFocusRequest, setDetailsFocusRequest] = useState(0)
  const selectedPlaceButton = useRef<HTMLButtonElement | null>(null)
  const request = useRef<AbortController | null>(null)
  const locationRequest = useRef(0)
  const locationSession = useRef<LocationSession | null>(null)
  useEffect(() => () => { request.current?.abort(); locationSession.current?.stop(); locationRequest.current += 1 }, [])
  useEffect(() => {
    const hide = () => { if (document.hidden) { locationSession.current?.stop(); locationRequest.current += 1; setTracking(false); setLocating(false) } }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [])
  useEffect(() => { if (pendingPlaceQuery) { setDataMode('public'); setQuery(pendingPlaceQuery); setCategory(''); setFeatureKeys([]); setPendingPlaceQuery('') } }, [pendingPlaceQuery, setDataMode, setPendingPlaceQuery])
  useEffect(() => { if (detailsFocusRequest) document.getElementById('selected-place-title')?.focus() }, [detailsFocusRequest])
  const places = useMemo(() => campusRepository.listPlaces(mode, { query, categories: category ? [category] : undefined, featureKeys, floor: mode === 'demo' ? floor : undefined }), [mode, query, category, featureKeys, floor, revision])
  const selected = navigationPlace && navigationPlace.fictional === (mode === 'demo') ? campusRepository.getPlace(navigationPlace.id, mode) : undefined
  const route = useMemo(() => mode === 'demo' && routeSelection.active ? computeRoute(routeSelection.start, routeSelection.destination, routeProfile, closedElevators) : null, [mode, routeSelection, routeProfile, closedElevators])
  const onViewportChange = useCallback((center: [number, number]) => { if (mode === 'public') setSearchCenter(center) }, [mode])
  const onMapError = useCallback((message: string) => { setMapError(message); setView('list') }, [])
  const selectPlace = (id: string, button?: HTMLButtonElement) => { const place = campusRepository.getPlace(id, mode); if (place) { selectedPlaceButton.current = button ?? null; setNavigationPlace(place); setDetailsFocusRequest(previous => previous + 1) } }
  const backToResults = () => { if (selectedPlaceButton.current?.isConnected) selectedPlaceButton.current.focus(); else document.getElementById('place-results-title')?.focus() }
  const cancelSearch = () => { request.current?.abort(); request.current = null; setSearching(false) }
  const stopLocation = () => { locationSession.current?.stop(); locationRequest.current += 1; setLocating(false); setTracking(false) }
  const changeMode = (next: DataMode) => { if (next === mode) return; cancelSearch(); stopLocation(); setDataMode(next); setNavigationPlace(null); setQuery(''); setCategory(''); setFeatureKeys([]); setMapError(''); setSearchStatus(''); setSearchError(''); setCachedOffer(null) }
  const moveCenter = (center: [number, number]) => {
    cancelSearch(); stopLocation()
    if (center[0] === GRADY_CENTER[0] && center[1] === GRADY_CENTER[1]) campusRepository.importPublic(gradyPublicSeed)
    else campusRepository.clearPublic()
    setRevision(previous => previous + 1); setNavigationPlace(null); setLoadedSearchCenter(null); setCachedOffer(null)
    setSearchCenter(center); setExplicitCenter([...center]); setLongitude(String(center[0])); setLatitude(String(center[1])); setSearchError(''); setSearchStatus('Area selected. Choose Search this area to retrieve records.')
  }
  const search = async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller
    const requestedCenter: [number, number] = [...searchCenter]
    setSearching(true); setSearchError(''); setCachedOffer(null); setSearchStatus('Searching public records…')
    try {
      const records = await searchPublicPlaces({ center: requestedCenter, radiusMeters: 800, signal: controller.signal })
      if (controller.signal.aborted || request.current !== controller) return
      campusRepository.importPublic(records); setRevision(previous => previous + 1); setNavigationPlace(null); setLoadedSearchCenter(requestedCenter)
      setSearchStatus(records.places.length ? records.cached ? 'Public records loaded from the short-lived cache.' : 'Public records retrieved. Review each source and its unknowns.' : 'No public records were returned for this area.')
    } catch {
      if (!controller.signal.aborted) {
        setSearchError('Public search failed. Check your connection or try another area later. No demo records were substituted.')
        const cached = getCachedPublicPlaces({ center: requestedCenter, radiusMeters: 800 })
        setCachedOffer(cached ? { records: cached, center: requestedCenter } : null); setSearchStatus('')
      }
    } finally { if (request.current === controller) { setSearching(false); request.current = null } }
  }
  const locate = () => {
    if (!navigator.geolocation) { setSearchError('Location is unavailable. Choose a city or enter coordinates instead.'); return }
    stopLocation(); setPosition(previous => previous?.source === 'browser' ? null : previous)
    setLocating(true); setTracking(true); setSearchError(''); const id = ++locationRequest.current
    locationSession.current ??= new LocationSession(navigator.geolocation)
    locationSession.current.start(fix => {
      if (id !== locationRequest.current) return
      setPosition(fix); setLocating(false); setSearchCenter(fix.coordinates); setExplicitCenter([...fix.coordinates]); setLongitude(String(fix.coordinates[0])); setLatitude(String(fix.coordinates[1]))
    }, () => { if (id !== locationRequest.current) return; stopLocation(); setSearchError('Location was not available or permission was denied. Choose a city or enter coordinates instead.') })
  }
  const find = (value: PlaceCategory) => { setCategory(value); setQuery(''); setFeatureKeys([]); if (mode === 'demo') setFloor(campusRepository.listPlaces('demo', { categories: [value] })[0]?.floor === 1 ? 1 : 0); notify('Place filter updated. Choose a result to read its access details.') }
  const reports = campusRepository.listReports(mode)
  return <>
    <div className="page-heading"><div><p className="eyebrow">{t('A CLEARER WAY TO YOUR VISIT')}</p><h1 tabIndex={-1}>{t('Places & access')}</h1><p className="page-description">{t('Find the details that matter. Keep questions close. Move at your own pace.')}</p></div><button className="btn btn-secondary" onClick={() => navigate('care')}>{t('Back to my visit plan')}<ArrowRight size={17} aria-hidden="true" /></button></div>
    <div className="data-mode-controls" role="group" aria-label={t('Data mode')}><button className={`mode-card ${mode === 'public' ? 'selected' : ''}`} aria-pressed={mode === 'public'} onClick={() => changeMode('public')}><span className="mode-symbol"><Search size={22} aria-hidden="true" /></span><span><strong>{t('Explore public places')}</strong><small>{t('OpenStreetMap records · internet required')}</small></span></button><button className={`mode-card ${mode === 'demo' ? 'selected' : ''}`} aria-pressed={mode === 'demo'} onClick={() => changeMode('demo')}><span className="mode-symbol"><MapPin size={22} aria-hidden="true" /></span><span><strong>{t('Try the demo campus')}</strong><small>{t('Fictional places · computed local routes')}</small></span></button></div>
    <div className="mode-notice"><strong>{t(mode === 'demo' ? 'Fictional campus — not real directions' : 'Public exploration · source records, not verified access')}</strong><p>{t(mode === 'demo' ? 'Local coordinates and building heights are fictional. Floors are illustrative, not an indoor survey or GPS position.' : 'Map tiles send the viewed area to OpenFreeMap. Search coordinates go to Overpass only when you search. Using location can reveal that area to the map provider. No location history is stored.')}</p></div>
    <div className="context-actions" aria-label={t('Useful access actions')}><button className="btn btn-primary" onClick={() => navigate('camera')}>{t('Camera assistance')}</button><button className="btn btn-secondary" onClick={() => find('restroom')}>{t('Find a restroom')}</button><button className="btn btn-secondary" onClick={() => find('entrance')}>{t('Find an entrance')}</button><button className="btn btn-secondary" onClick={() => find('quiet')}>{t('Find a quiet area')}</button><button className="btn btn-secondary" onClick={() => { setMessage(t('Is wheelchair assistance or a loan wheelchair available? Where should I ask?')); setCommunicationOpen(true) }}>{t('Ask for wheelchair assistance')}</button></div>
    {mode === 'public' && <section className="panel public-search" aria-labelledby="public-search-title">
      <h2 id="public-search-title">{t('Choose an exploration area')}</h2>
      <p className="small-note">{t('Initial view: Grady Memorial Hospital, Atlanta. This is an exploration area, not your detected location. Searches cover 800 m and run only when requested.')}</p>
      <div className="button-row">{Object.keys(cityCenters).map(city => <button className="btn btn-secondary" key={city} onClick={() => moveCenter(cityCenters[city])}>{t(city)}</button>)}
        <button className="btn btn-secondary" disabled={tracking} onClick={locate}><LocateFixed size={17} aria-hidden="true" />{t(locating ? 'Requesting location…' : 'Use my location')}</button>
        {tracking && <button className="btn btn-secondary" onClick={stopLocation}>{t('Stop tracking')}</button>}
      </div>
      {position && <div className="location-status" role="status"><strong>{t(position.source === 'manual' ? 'Selected starting point' : tracking ? 'Live browser location' : 'Last browser location — tracking stopped')}</strong>
        <p>{t('Location source')}: {t(position.source === 'browser' ? 'Browser geolocation' : 'Manual selection')} · {position.coordinates[1].toFixed(5)}, {position.coordinates[0].toFixed(5)}</p>
        <p>{t('Accuracy radius')}: {position.accuracyMeters === null ? t('Not measured for a selected point') : t('{meters} m', { meters: Math.round(position.accuracyMeters) })} · {t('Updated')}: {new Date(position.updatedAt).toLocaleTimeString(language === 'es' ? 'es' : 'en')}</p>
        <p className="small-note">{t('This point does not identify a floor, room or doorway. It is separate from your selected destination.')}</p>
        <button className="text-link" onClick={() => { stopLocation(); setPosition(null) }}>{t('Clear starting point')}</button>
      </div>}
      <details><summary>{t('Enter map coordinates')}</summary><form className="coordinate-fields" onSubmit={event => {
        event.preventDefault(); const lng = Number(longitude), lat = Number(latitude)
        if (!longitude.trim() || !latitude.trim() || !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 85) { setSearchError('Enter longitude from −180 to 180 and latitude from −85 to 85.'); return }
        cancelSearch(); stopLocation(); setSearchError(''); setCachedOffer(null)
        setSearchCenter([lng, lat]); setExplicitCenter([lng, lat]); setPosition(manualStartingPoint([lng, lat]))
      }}><label>{t('Longitude')}<input className="input" type="number" step="any" min="-180" max="180" required value={longitude} onChange={e => setLongitude(e.target.value)} /></label><label>{t('Latitude')}<input className="input" type="number" step="any" min="-85" max="85" required value={latitude} onChange={e => setLatitude(e.target.value)} /></label><button className="btn btn-secondary" type="submit">{t('Set selected starting point')}</button></form></details>
      <p className="small-note">{t('Search center')}: {searchCenter[1].toFixed(5)}, {searchCenter[0].toFixed(5)}</p>
      <div className="button-row"><button className="btn btn-primary" disabled={searching} onClick={search}><Search size={18} aria-hidden="true" />{t(searching ? 'Searching…' : 'Search this area')}</button>{searching && <button className="btn btn-secondary" onClick={() => { cancelSearch(); setSearchStatus('Search cancelled.'); }}>{t('Cancel search')}</button>}</div>
      <p role="status">{t(searchStatus)}</p>{searchError && <p role="alert" className="access-warning">{t(searchError)}</p>}
      {cachedOffer && <div className="access-warning"><p>{t('Cached public records available. Retrieved')}: {cachedOffer.records.retrievedAt}. {t('A cached snapshot is not live data.')}</p><button className="btn btn-secondary" onClick={() => { campusRepository.importPublic(cachedOffer.records); setRevision(previous => previous + 1); setLoadedSearchCenter(cachedOffer.center); setNavigationPlace(null); setSearchStatus('Showing dated cached public records.'); setCachedOffer(null) }}>{t('Use dated cached records')}</button></div>}
      <details><summary>{t('Map provider')}</summary><p>{mapProviders[0].name} · {t('No API key required')}</p><button disabled className="btn btn-secondary">Google photorealistic 3D</button><p className="small-note">{t(optionalGoogleProvider.reason)}</p></details>
    </section>}
    <section className="panel explore-filters" aria-label={t('Filter places')}><div className="filter-fields"><label>{t('Search loaded places')}<input className="input" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Name or category')} /></label><label>{t('Place category')}<select className="input" value={category} onChange={e => setCategory(e.target.value as PlaceCategory | '')}><option value="">{t('All categories')}</option>{categories.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label></div><details><summary>{t('Filter by documented access features')}</summary><p className="small-note">{t('These filters require an explicit yes for every selected feature. Limited, no and unknown records are excluded from filtered results.')}</p><div className="feature-filter-options">{featureFilters.map(([key, label]) => <label key={key} className="inline-check"><input type="checkbox" checked={featureKeys.includes(key)} onChange={e => setFeatureKeys(previous => e.target.checked ? [...previous, key] : previous.filter(value => value !== key))} />{t(label)}</label>)}</div></details>{(preferences.stepFree || preferences.communication) && <p className="small-note">{t('Your access preferences stay in your visit plan. Review individual records; preferences do not turn unknown data into a match.')}</p>}</section>
    <div className="view-toolbar"><div className="segmented-controls" role="group" aria-label={t('Map or list view')}>{(['list', '2d', '3d'] as const).map(value => <button aria-pressed={view === value} key={value} onClick={() => { setView(value); if (value !== 'list') setMapError('') }}>{t(value === 'list' ? 'List' : value === '2d' ? '2D' : '3D')}</button>)}</div>{mode === 'demo' && <div className="segmented-controls" role="group" aria-label={t('Campus floor')}>{([0, 1] as const).map(value => <button key={value} aria-pressed={floor === value} onClick={() => setFloor(value)}>{t(value === 0 ? 'Ground floor' : 'Upper floor')}</button>)}</div>}{view !== 'list' && <button className="text-link" onClick={() => setOrientationKey(previous => previous + 1)}>{t('Reset orientation')}</button>}</div>
    {mapError && <p role="alert" className="access-warning">{t('Map unavailable. The list, source details, communication and demo text directions remain available.')} {t(mapError)}</p>}
    {view !== 'list' && <MapBoundary onError={onMapError}><Suspense fallback={<p role="status">{t('Loading interactive map…')}</p>}><NavigationMap mode={mode} places={[...places]} selectedId={selected?.id} onSelect={id => selectPlace(id)} view={view} floor={floor} route={route} nodes={[...campusRepository.getNodes()]} edges={campusRepository.getEdges()} center={mode === 'public' ? explicitCenter : undefined} onViewportChange={onViewportChange} onError={onMapError} resetKey={orientationKey} position={position} /></Suspense></MapBoundary>}
    <div className="explore-results-heading"><h2 id="place-results-title" tabIndex={-1}>{t(mode === 'public' ? 'Loaded public places' : 'Places in this view')} <span className="count-badge">{places.length}</span></h2><p className="small-note">{t('The list offers the same selection and details as the map.')}</p></div>
    {mode === 'public' && campusRepository.listPlaces('public').length > 0 && <p className="small-note public-results-origin">{t(loadedSearchCenter ? 'These records come from your most recent completed search. Moving the map does not refresh them.' : 'Saved public source snapshot. Retrieval dates are shown in each record; this is not live access information.')}{loadedSearchCenter && <> {t('Searched center')}: {loadedSearchCenter[1].toFixed(5)}, {loadedSearchCenter[0].toFixed(5)}.</>}</p>}
    <div className="button-row results-shortcuts">{mode === 'demo' && <button className="text-link" onClick={() => document.getElementById('route-title')?.focus()}>{t('Go to demo route planner')}</button>}{selected && <button className="text-link" onClick={() => document.getElementById('selected-place-title')?.focus()}>{t('Go to selected place details')}</button>}</div>
    <div className="explore-layout"><div className="stack"><div className="place-results" aria-label={t('Place results')}>{!places.length && <div className="panel"><h3>{t('No places to show')}</h3><p>{t(mode === 'public' && !campusRepository.listPlaces('public').length ? 'Choose an area and search public records. Demo places are never included here.' : 'Try another category, floor or feature filter. Missing data is not a positive access claim.')}</p><button className="text-link" onClick={() => { setQuery(''); setCategory(''); setFeatureKeys([]) }}>{t('Clear filters')}</button></div>}{places.map(place => <button className={`place-result ${selected?.id === place.id ? 'selected' : ''}`} aria-pressed={selected?.id === place.id} key={place.id} aria-controls={selected ? "selected-place-title" : undefined} onClick={event => selectPlace(place.id, event.currentTarget)}><span className="place-category">{t(categories.find(([value]) => value === place.category)?.[1] ?? place.category)}{place.floor !== null ? ` · ${mode === 'demo' ? t(place.floor === 0 ? 'Ground floor' : 'Upper floor') : t('Floor {floor}', { floor: place.floor })}` : ''}</span><strong>{language === 'es' ? place.nameEs : place.name}</strong><span className="small-note">{t(place.fictional ? 'Fictional demo' : 'OpenStreetMap · access details may be unknown')}</span><span className="text-link">{t('Read access details')}<ArrowRight size={16} aria-hidden="true" /></span></button>)}</div>{mode === 'demo' && <RoutePlanner result={route} />}</div><aside className="stack" aria-label={t('Place information')}>{selected ? <PlaceDetails key={selected.id} place={selected} mode={mode} onBackToResults={backToResults} onRoute={nodeId => { setRouteSelection(previous => ({ ...previous, destination: nodeId, active: true })); document.getElementById('route-title')?.focus(); notify('Demo route recalculated. Text directions are in the route panel.') }} onSaved={() => setRevision(previous => previous + 1)} /> : <section className="panel selection-prompt"><MapPin size={30} aria-hidden="true" /><h2>{t('Choose a place to see what is known')}</h2><p>{t('Read each feature, its source and what remains unknown. Add useful questions directly to your visit plan.')}</p></section>}
    <section className="panel data-controls"><h2>{t('Local data & privacy')}</h2><p className="small-note">{t('Your messages, questions and visit details stay in session memory. Only reports you explicitly save persist in local browser storage, separately from source records.')}</p><p>{t('Unverified reports in this mode')}: {reports.length}</p>{reports.length > 0 && <details><summary>{t('Review saved local reports')}</summary>{reports.map(report => <div className="saved-report" key={report.id}><strong>{report.targetName}</strong><p>{report.note}</p><small>{t('Unverified · browser only')} · {report.createdAt}</small></div>)}</details>}{mode === 'demo' ? <button className="btn btn-secondary" onClick={() => { try { campusRepository.clearReports('demo'); setClosedElevators([]); setRouteSelection({ start: 'parking', destination: 'consultation', active: false }); setRouteProfile({ ...DEFAULT_ROUTE_PROFILE }); setRevision(previous => previous + 1); notify('Demo data reset. Elevators reopened and demo reports cleared. Your personal visit plan is unchanged.'); } catch { notify('The report could not be saved. Browser storage may be unavailable.') } }}>{t('Reset demo data')}</button> : reports.length > 0 && <button className="btn btn-secondary" onClick={() => { try { campusRepository.clearReports('public'); setRevision(previous => previous + 1); notify('Public-place local reports cleared. Source records are unchanged.'); } catch { notify('The report could not be saved. Browser storage may be unavailable.') } }}>{t('Clear public-place local reports')}</button>}<p className="small-note">{t('Use Reset session to clear personal visit content. Demo data and local reports have separate controls.')}</p>{mode === 'demo' && <details><summary>{t('About this demo dataset')}</summary><p className="small-note">{language === 'es' ? campusRepository.getMetadata().disclosureEs : campusRepository.getMetadata().disclosure}</p></details>}</section></aside></div>
  </>
}



