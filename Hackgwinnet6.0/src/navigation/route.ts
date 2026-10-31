import { campusRepository } from './repository'
import type { ExcludedEdge, RouteEdge, RouteNode, RouteProfile, RouteResult } from './types'

/** Demonstration test values only: not medical advice or legal accessibility thresholds. */
export const DEFAULT_ROUTE_PROFILE: RouteProfile = Object.freeze({ minWidthCm: 95, maxInclinePercent: 6, maxKerbCm: 2, allowedSurfaces: Object.freeze(['paved', 'concrete', 'asphalt', 'tiles']) })

function exclusion(edge: RouteEdge, profile: RouteProfile, closedElevators: readonly ('A' | 'B')[]): ExcludedEdge | null {
  const result = (code: ExcludedEdge['code'], reason: string, reasonEs: string) => ({ edgeId: edge.id, code, reason, reasonEs })
  if (edge.kind === 'stairs') return result('stairs', 'Stairs are excluded by the strict demo profile.', 'El perfil estricto de ejemplo excluye las escaleras.')
  const closedByDemo = edge.elevatorId && closedElevators.includes(edge.elevatorId)
  if (edge.open === false || closedByDemo) return result('closed', closedByDemo ? `Elevator ${edge.elevatorId} is closed by a DEMO control.` : 'This segment is marked closed in the demo data.', closedByDemo ? `El ascensor ${edge.elevatorId} está cerrado por un control de DEMOSTRACIÓN.` : 'Este tramo figura como cerrado en los datos de ejemplo.')
  if (edge.open !== true || edge.widthCm == null || edge.inclinePercent == null || edge.kerbCm == null || !edge.surface) return result('unknown', 'Required access information is unknown; this segment is excluded.', 'Falta información de accesibilidad necesaria; este tramo está excluido.')
  if (![edge.widthCm, edge.inclinePercent, edge.kerbCm, edge.distanceMeters].every(Number.isFinite) || edge.widthCm <= 0 || edge.kerbCm < 0 || edge.distanceMeters <= 0) return result('invalid', 'The segment has invalid required measurements.', 'El tramo tiene medidas necesarias no válidas.')
  if (edge.widthCm < profile.minWidthCm) return result('width', `Width ${edge.widthCm} cm is below your selected minimum ${profile.minWidthCm} cm.`, `El ancho de ${edge.widthCm} cm es inferior al mínimo elegido de ${profile.minWidthCm} cm.`)
  if (Math.abs(edge.inclinePercent) > profile.maxInclinePercent) return result('incline', `Incline ${Math.abs(edge.inclinePercent)}% exceeds your selected maximum ${profile.maxInclinePercent}%.`, `La pendiente del ${Math.abs(edge.inclinePercent)}% supera el máximo elegido del ${profile.maxInclinePercent}%.`)
  if (edge.kerbCm > profile.maxKerbCm) return result('kerb', `Kerb ${edge.kerbCm} cm exceeds your selected maximum ${profile.maxKerbCm} cm.`, `El bordillo de ${edge.kerbCm} cm supera el máximo elegido de ${profile.maxKerbCm} cm.`)
  if (!profile.allowedSurfaces.includes(edge.surface)) return result('surface', `The ${edge.surface} surface is outside your selected surfaces.`, `La superficie «${edge.surface}» no está entre las superficies elegidas.`)
  return null
}

/** Dijkstra over supported graph edges. Unknown measurements never become positive claims. */
export function computeGraphRoute(nodes: readonly RouteNode[], edges: readonly RouteEdge[], startId: string, endId: string, profile: RouteProfile = DEFAULT_ROUTE_PROFILE, closedElevators: readonly ('A' | 'B')[] = []): RouteResult {
  const excluded: ExcludedEdge[] = []
  const noRoute = (reason = 'The available data does not support a route under these constraints.', reasonEs = 'Los datos disponibles no permiten establecer una ruta con estas condiciones.'): RouteResult => ({ status: 'unavailable', nodeIds: [], edgeIds: [], totalMeters: 0, directions: [], excluded, reason, reasonEs })
  if (![profile.minWidthCm, profile.maxInclinePercent, profile.maxKerbCm].every(Number.isFinite) || profile.minWidthCm <= 0 || profile.maxInclinePercent < 0 || profile.maxKerbCm < 0 || !profile.allowedSurfaces.length) return noRoute('Enter valid width, incline, kerb and surface constraints.', 'Introduce condiciones válidas de ancho, pendiente, bordillo y superficie.')
  const byId = new Map(nodes.map(node => [node.id, node]))
  if (!byId.has(startId) || !byId.has(endId)) return noRoute('Choose a start and destination from the fictional campus graph.', 'Elige un inicio y un destino del grafo del campus ficticio.')
  const adjacency = new Map<string, { to: string; edge: RouteEdge }[]>(nodes.map(node => [node.id, []]))
  edges.forEach(edge => {
    const unsupported = exclusion(edge, profile, closedElevators)
    if (unsupported) { excluded.push(unsupported); return }
    if (!byId.has(edge.from) || !byId.has(edge.to)) {
      excluded.push({ edgeId: edge.id, code: 'invalid', reason: 'The segment refers to a missing graph node.', reasonEs: 'El tramo hace referencia a un nodo que falta en el grafo.' }); return
    }
    adjacency.get(edge.from)?.push({ to: edge.to, edge })
    if (edge.bidirectional) adjacency.get(edge.to)?.push({ to: edge.from, edge })
  })
  const distance = new Map<string, number>([[startId, 0]])
  const previous = new Map<string, { nodeId: string; edge: RouteEdge }>()
  const unvisited = new Set(nodes.map(node => node.id))
  while (unvisited.size) {
    let current: string | undefined
    let best = Infinity
    unvisited.forEach(id => { const value = distance.get(id) ?? Infinity; if (value < best) { current = id; best = value } })
    if (!current) break
    if (current === endId) break
    unvisited.delete(current)
    for (const { to, edge } of adjacency.get(current) ?? []) {
      if (!unvisited.has(to)) continue
      const candidate = best + edge.distanceMeters
      if (candidate < (distance.get(to) ?? Infinity)) { distance.set(to, candidate); previous.set(to, { nodeId: current, edge }) }
    }
  }
  const totalMeters = distance.get(endId)
  if (totalMeters === undefined) return noRoute()
  const nodeIds = [endId]
  const routeEdges: RouteEdge[] = []
  let cursor = endId
  while (cursor !== startId) {
    const step = previous.get(cursor)
    if (!step) return noRoute()
    routeEdges.unshift(step.edge); nodeIds.unshift(step.nodeId); cursor = step.nodeId
  }
  const directions = routeEdges.map((edge, index) => {
    const from = byId.get(nodeIds[index])!
    const to = byId.get(nodeIds[index + 1])!
    return {
      edgeId: edge.id, fromId: from.id, toId: to.id, floor: from.floor, toFloor: to.floor, distanceMeters: edge.distanceMeters,
      text: edge.kind === 'elevator' ? `Take elevator ${edge.elevatorId} from floor ${from.floor} to floor ${to.floor}.` : `From ${from.name}, continue to ${to.name}.`,
      textEs: edge.kind === 'elevator' ? `Toma el ascensor ${edge.elevatorId} de la planta ${from.floor} a la planta ${to.floor}.` : `Desde ${from.nameEs}, continúa hasta ${to.nameEs}.`,
    }
  })
  return { status: 'ok', nodeIds, edgeIds: routeEdges.map(edge => edge.id), totalMeters, directions, excluded }
}

export function computeRoute(startId: string, endId: string, profile: RouteProfile = DEFAULT_ROUTE_PROFILE, closedElevators: readonly ('A' | 'B')[] = []): RouteResult {
  return computeGraphRoute(campusRepository.getNodes(), campusRepository.getEdges(), startId, endId, profile, closedElevators)
}
