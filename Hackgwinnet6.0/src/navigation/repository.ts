import importedSeed from './seed.json' with { type: 'json' }
import { gradyPublicSeed } from './publicSeed'
import type { AccessibilityFeature, AccessibilityReport, AccessState, DataMode, FeatureKey, NavigationSeed, Place, PlaceFilters, PublicRecords, ReportInput } from './types'

export const REPORTS_STORAGE_KEY = 'carenori-local-barrier-reports-v1'
type ReportStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(child => freeze(child))
    Object.freeze(value)
  }
  return value
}
const clone = <T,>(value: T): T => structuredClone(value)
const states: AccessState[] = ['yes', 'no', 'limited', 'unknown']
const featureKeys: FeatureKey[] = ['wheelchair', 'stepFree', 'ramp', 'elevator', 'accessibleParking', 'accessibleRestroom', 'quiet', 'seating', 'writtenCommunication', 'wheelchairAssistance', 'wheelchairLoan']
const reportKinds = ['blocked_ramp', 'lift_problem', 'inaccurate_information', 'unmapped_feature']
const normalized = (text: string) => text.trim().toLocaleLowerCase()
function defaultStorage(): ReportStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

/** Read-only JSON data; the browser does not query SQLite. Public imports remain in memory. */
export class NavigationRepository {
  private readonly seed: NavigationSeed
  private publicPlaces: readonly Place[] = []
  private publicFeatures: readonly AccessibilityFeature[] = []
  private reports: readonly AccessibilityReport[] = []
  private readonly storage: ReportStorage | null

  constructor(seed: NavigationSeed = importedSeed as unknown as NavigationSeed, storage: ReportStorage | null = defaultStorage()) {
    this.seed = freeze(clone(seed))
    this.storage = storage
    try {
      const raw: unknown = JSON.parse(storage?.getItem(REPORTS_STORAGE_KEY) ?? '[]')
      if (Array.isArray(raw)) this.reports = freeze(raw.filter((item): item is AccessibilityReport => {
        if (!item || typeof item !== 'object') return false
        const report = item as Partial<AccessibilityReport>
        return typeof report.id === 'string' && typeof report.targetId === 'string' && typeof report.targetName === 'string'
          && typeof report.note === 'string' && report.note.length <= 600 && typeof report.createdAt === 'string'
          && (report.mode === 'public' || report.mode === 'demo') && report.status === 'unverified_local'
          && typeof report.kind === 'string' && reportKinds.includes(report.kind)
      }).slice(0, 100))
    } catch { this.reports = [] }
  }

  listPlaces(mode: DataMode, filters: PlaceFilters = {}): readonly Place[] {
    const needle = normalized(filters.query ?? '')
    const all = mode === 'demo' ? this.seed.places : this.publicPlaces
    return Object.freeze(all.filter(place => (!needle || normalized(`${place.name} ${place.nameEs} ${place.category} ${place.notes ?? ''} ${place.notesEs ?? ''}`).includes(needle))
      && (!filters.categories?.length || filters.categories.includes(place.category))
      && (filters.floor === undefined || place.floor === filters.floor)
      && (!filters.featureKeys?.length || filters.featureKeys.every(key => this.getFeatureState(place.id, key, mode) === 'yes'))))
  }
  getPlace(id: string, mode: DataMode): Place | undefined { return this.listPlaces(mode).find(place => place.id === id) }
  getFeatures(placeId: string, mode: DataMode): readonly AccessibilityFeature[] {
    return Object.freeze((mode === 'demo' ? this.seed.accessibility_features : this.publicFeatures).filter(feature => feature.placeId === placeId))
  }
  getFeatureState(placeId: string, key: FeatureKey, mode: DataMode): AccessState { return this.getFeatures(placeId, mode).find(feature => feature.key === key)?.state ?? 'unknown' }
  getNodes() { return this.seed.route_nodes as readonly NavigationSeed['route_nodes'][number][] }
  getEdges() { return this.seed.route_edges as readonly NavigationSeed['route_edges'][number][] }
  getPhrases() { return this.seed.communication_phrases as readonly NavigationSeed['communication_phrases'][number][] }
  getDocuments() { return this.seed.sample_documents as readonly NavigationSeed['sample_documents'][number][] }
  getMetadata() { return this.seed.metadata }

  /** Each explicit area search replaces current results; dedupe by OSM type/id. Never merge demo records. */
  importPublic(records: PublicRecords): number {
    const places = new Map<string, Place>()
    records.places.forEach(place => {
      if (place.fictional !== false || !place.osm || !['node', 'way', 'relation'].includes(place.osm.type)
        || !Number.isSafeInteger(place.osm.id) || place.osm.id <= 0 || place.routeNodeId || place.providerId
        || place.coordinateKind !== (place.osm.type === 'node' ? 'node' : 'center')
        || !Array.isArray(place.coordinates) || place.coordinates.length !== 2
        || !place.coordinates.every(Number.isFinite) || Math.abs(place.coordinates[0]) > 180 || Math.abs(place.coordinates[1]) > 90) {
        throw new Error('Only validated public OSM records can be imported into public mode.')
      }
      const id = `osm-${place.osm.type}-${place.osm.id}`
      if (place.id !== id) throw new Error('Public record identity must match its OSM type and ID.')
      const savedPublic = gradyPublicSeed.places.find(saved => saved.id === id)
      places.set(id, clone(savedPublic ? { ...savedPublic, ...place, officialSource: savedPublic.officialSource, address: savedPublic.address, datasetRevision: savedPublic.datasetRevision } : place))
    })
    const features = new Map<string, AccessibilityFeature>()
    records.features.forEach(feature => {
      if (!places.has(feature.placeId) || !states.includes(feature.state) || !featureKeys.includes(feature.key)
        || feature.id !== `${feature.placeId}:${feature.key}`) throw new Error('A public feature must refer to a public place and preserve a supported feature identity and access state.')
      features.set(`${feature.placeId}:${feature.key}`, clone(feature))
    })
    this.publicPlaces = freeze([...places.values()])
    this.publicFeatures = freeze([...features.values()])
    return this.publicPlaces.length
  }
  clearPublic() { this.publicPlaces = []; this.publicFeatures = [] }
  listReports(mode?: DataMode): readonly AccessibilityReport[] { return Object.freeze(this.reports.filter(report => !mode || report.mode === mode)) }
  addReport(input: ReportInput): AccessibilityReport {
    const target = this.getPlace(input.targetId, input.mode)
    if (!target) throw new Error('Choose a place from the active mode before saving a report.')
    if (!reportKinds.includes(input.kind)) throw new Error('Choose a supported report type.')
    const note = input.note.trim()
    if (!note || note.length > 600) throw new Error('Enter a note between 1 and 600 characters.')
    if (this.reports.length >= 100) throw new Error('Local report storage is full. Clear old reports before adding another.')
    const report: AccessibilityReport = { id: crypto.randomUUID(), mode: input.mode, targetId: target.id, targetName: target.name, kind: input.kind, note, createdAt: new Date().toISOString(), status: 'unverified_local' }
    const next = [...this.reports, report]
    this.persistReports(next)
    this.reports = freeze(next)
    return report
  }
  clearReports(mode?: DataMode) {
    const next = mode ? this.reports.filter(report => report.mode !== mode) : []
    this.persistReports(next)
    this.reports = freeze(next)
  }
  private persistReports(reports: readonly AccessibilityReport[]) {
    if (!this.storage) throw new Error('Local storage is unavailable. Your report changes were not saved.')
    try { this.storage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports)) }
    catch { throw new Error('Local storage is unavailable. Your report changes were not saved.') }
  }
}

export const campusRepository = new NavigationRepository()
campusRepository.importPublic(gradyPublicSeed)
export const metersToCoordinates = ([x, y]: readonly [number, number]): [number, number] => [x / 111320, y / 111320]
const shell = [[-55, -20], [85, -20], [85, 80], [-55, 80], [-55, -20]] as [number, number][]
/** Authored schematic volumes. These are not surveys or indoor floor plans. */
export const demoBuildings = {
  type: 'FeatureCollection' as const,
  features: [0, 1].map(floor => ({
    type: 'Feature' as const,
    properties: { id: `fictional-floor-${floor}`, name: 'Fictional campus schematic', floor, height: (floor + 1) * 4, base: floor * 4 },
    geometry: { type: 'Polygon' as const, coordinates: [shell.map(metersToCoordinates)] },
  })),
}
