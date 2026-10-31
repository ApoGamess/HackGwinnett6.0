export interface LocationFix {
  coordinates: [number, number]
  source: 'browser' | 'manual'
  accuracyMeters: number | null
  updatedAt: number
}

/** Owns one watcher and one latest fix, never a location history. */
export class LocationSession {
  private watchId: number | null = null
  private generation = 0
  constructor(private readonly geolocation: Pick<Geolocation, 'watchPosition' | 'clearWatch'>) {}
  start(onFix: (fix: LocationFix) => void, onError: (error: GeolocationPositionError) => void) {
    this.stop()
    const generation = this.generation
    this.watchId = this.geolocation.watchPosition(position => {
      if (generation !== this.generation) return
      const { longitude, latitude, accuracy } = position.coords
      if (![longitude, latitude, accuracy, position.timestamp].every(Number.isFinite) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || accuracy < 0) return
      onFix({ coordinates: [longitude, latitude], accuracyMeters: accuracy, updatedAt: position.timestamp, source: 'browser' })
    }, error => { if (generation === this.generation) onError(error) }, { maximumAge: 0, timeout: 15000, enableHighAccuracy: false })
  }
  stop() {
    this.generation += 1
    if (this.watchId !== null) this.geolocation.clearWatch(this.watchId)
    this.watchId = null
  }
}

export function manualStartingPoint(coordinates: [number, number], updatedAt = Date.now()): LocationFix {
  if (!coordinates.every(Number.isFinite) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 85) throw new Error('Invalid starting coordinates.')
  return { coordinates: [...coordinates], source: 'manual', accuracyMeters: null, updatedAt }
}
