import seed from './public-seed.json' with { type: 'json' }
import { parseOverpassResponse } from './overpass'
import type { PublicRecords } from './types'

/** A dated public snapshot; never evidence of a current inspection or user location. */
export const gradyPublicSeed: PublicRecords = parseOverpassResponse(seed, seed.retrievedAt)
export const GRADY_PLACE_ID = 'osm-way-270880941'
export const GRADY_CENTER: [number, number] = [seed.elements[0].center.lon, seed.elements[0].center.lat]
const grady = gradyPublicSeed.places.find(place => place.id === GRADY_PLACE_ID)!
grady.address = seed.official.address
grady.officialSource = { name: 'Grady Health — official location', url: seed.official.url, retrievedAt: seed.official.retrievedAt }
grady.datasetRevision = seed.datasetRevision
grady.notes = 'Initial exploration area only. CareNori is not affiliated with Grady and has no surveyed indoor deployment here. Access details are unknown unless explicitly sourced.'
grady.notesEs = 'Solo es una zona inicial de exploración. CareNori no está afiliado a Grady ni tiene aquí una instalación interior topografiada. Los detalles de acceso se desconocen si no hay una fuente explícita.'
gradyPublicSeed.cached = true
