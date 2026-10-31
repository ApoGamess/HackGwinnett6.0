export type DataMode = 'public' | 'demo'
export type AccessState = 'yes' | 'no' | 'limited' | 'unknown'
export type PlaceCategory = 'healthcare' | 'pharmacy' | 'entrance' | 'ramp' | 'elevator' | 'parking' | 'dropoff' | 'restroom' | 'waiting' | 'quiet' | 'assistance' | 'reception' | 'consultation' | 'stairs'
export type FeatureKey = 'wheelchair' | 'stepFree' | 'ramp' | 'elevator' | 'accessibleParking' | 'accessibleRestroom' | 'quiet' | 'seating' | 'writtenCommunication' | 'wheelchairAssistance' | 'wheelchairLoan'
export interface SourceMetadata {
  name: string
  url?: string
  updatedAt?: string
  retrievedAt?: string
  inspectedAt?: string
}
export interface Place {
  id: string
  name: string
  nameEs: string
  category: PlaceCategory
  coordinates: [number, number]
  /** Null means that a floor was not specified in the source. */
  floor: number | null
  fictional: boolean
  source: SourceMetadata
  providerId?: string
  routeNodeId?: string
  notes?: string
  notesEs?: string
  address?: string
  officialSource?: SourceMetadata
  datasetRevision?: string
  osm?: { type: 'node' | 'way' | 'relation'; id: number; tags: Record<string, string> }
  /** A way/relation center never identifies a door. */
  coordinateKind?: 'demo' | 'node' | 'center'
}
export interface AccessibilityFeature {
  id: string
  placeId: string
  key: FeatureKey
  label: string
  labelEs: string
  state: AccessState
  description?: string
  descriptionEs?: string
  source: SourceMetadata
}
export interface RouteNode {
  id: string
  name: string
  nameEs: string
  coordinates: [number, number]
  /** Authored local meters; never a geographic survey or GPS position. */
  localMeters: [number, number]
  floor: number
}
export interface RouteEdge {
  id: string
  from: string
  to: string
  distanceMeters: number
  kind: 'path' | 'corridor' | 'ramp' | 'elevator' | 'stairs'
  floor: number
  bidirectional: boolean
  elevatorId?: 'A' | 'B'
  open: boolean | null
  widthCm: number | null
  inclinePercent: number | null
  kerbCm: number | null
  surface: string | null
  source: SourceMetadata
}
export interface RouteProfile {
  minWidthCm: number
  maxInclinePercent: number
  maxKerbCm: number
  allowedSurfaces: readonly string[]
}
export interface RouteDirection {
  edgeId: string
  fromId: string
  toId: string
  floor: number
  toFloor: number
  distanceMeters: number
  text: string
  textEs: string
}
export interface ExcludedEdge {
  edgeId: string
  reason: string
  reasonEs: string
  code: 'stairs' | 'closed' | 'unknown' | 'width' | 'incline' | 'kerb' | 'surface' | 'invalid'
}
export interface RouteResult {
  status: 'ok' | 'unavailable'
  nodeIds: string[]
  edgeIds: string[]
  totalMeters: number
  directions: RouteDirection[]
  excluded: ExcludedEdge[]
  reason?: string
  reasonEs?: string
}
export interface CommunicationPhrase {
  id: string
  group: string
  groupEs: string
  text: string
  textEs: string
}
export interface SampleDocument {
  id: string
  placeId: string
  title: string
  titleEs: string
  content: string
  contentEs: string
  fictional: true
}
export type ReportKind = 'blocked_ramp' | 'lift_problem' | 'inaccurate_information' | 'unmapped_feature'
export interface AccessibilityReport {
  id: string
  mode: DataMode
  targetId: string
  targetName: string
  kind: ReportKind
  note: string
  createdAt: string
  status: 'unverified_local'
}
export interface ReportInput { mode: DataMode; targetId: string; kind: ReportKind; note: string }
export interface PlaceFilters {
  query?: string
  categories?: readonly PlaceCategory[]
  featureKeys?: readonly FeatureKey[]
  floor?: number
}
export interface PublicRecords {
  places: Place[]
  features: AccessibilityFeature[]
  retrievedAt: string
  cached?: boolean
  stale?: boolean
}
export interface SeedMetadata {
  schemaVersion: number
  name: string
  nameEs: string
  origin: 'authored_replacement'
  originalStarterAvailable: false
  disclosure: string
  disclosureEs: string
  coordinateSystem: string
  persistence: string
  generatedAt: string
}
export interface NavigationSeed {
  places: Place[]
  accessibility_features: AccessibilityFeature[]
  route_nodes: RouteNode[]
  route_edges: RouteEdge[]
  communication_phrases: CommunicationPhrase[]
  sample_documents: SampleDocument[]
  accessibility_reports: AccessibilityReport[]
  metadata: SeedMetadata
}
