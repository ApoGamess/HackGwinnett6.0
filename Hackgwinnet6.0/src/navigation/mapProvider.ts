/** Provider boundary: only a verified implementation may become selectable. */
export type MapProvider = 'openfreemap'
export const DEFAULT_MAP_PROVIDER: MapProvider = 'openfreemap'
export const mapProviders = [{ id: DEFAULT_MAP_PROVIDER, name: 'MapLibre / OpenFreeMap', available: true }] as const
// Google photorealistic 3D is deliberately absent without an authorized, tested setup.
// A key alone is not evidence of API activation, eligibility, restrictions or billing.
export const optionalGoogleProvider = {
  available: false,
  reason: 'Google photorealistic 3D requires a separately configured and tested Google Maps project.',
  documentation: 'https://developers.google.com/maps/documentation/javascript/3d/overview',
} as const
