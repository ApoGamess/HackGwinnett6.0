import seed from './checkpoints.json' with { type: 'json' }

export interface Checkpoint {
  id: string
  name: string
  nameEs: string
  routeNodeId: string
  siteId: string
  revision: number
  fictional: true
  physicallyInstalled: false
  surveyed: false
}

export interface ConfirmedCheckpoint {
  checkpoint: Checkpoint
  confirmedAt: string
  method: 'qr' | 'manual'
}

export const checkpointSite = Object.freeze(seed)
export const checkpoints: readonly Checkpoint[] = Object.freeze(seed.checkpoints.map(checkpoint => Object.freeze({
  ...checkpoint, siteId: seed.siteId, revision: seed.revision,
  fictional: true as const, physicallyInstalled: false as const, surveyed: false as const,
})))

/** Data, never a link or executable instruction. Only this exact local dataset is allowed. */
export function checkpointPayload(checkpoint: Checkpoint): string {
  return `carenori:v1:${checkpoint.siteId}:${checkpoint.id}:r${checkpoint.revision}`
}

export type CheckpointValidation = { ok: true; checkpoint: Checkpoint } | { ok: false; reason: 'format' | 'site' | 'revision' | 'checkpoint' }
export function validateCheckpointPayload(input: unknown): CheckpointValidation {
  if (typeof input !== 'string' || input.length > 160) return { ok: false, reason: 'format' }
  const match = /^carenori:v1:([a-z0-9-]{1,48}):([a-z0-9-]{1,48}):r([1-9][0-9]{0,5})$/.exec(input)
  if (!match) return { ok: false, reason: 'format' }
  if (match[1] !== seed.siteId) return { ok: false, reason: 'site' }
  if (Number(match[3]) !== seed.revision) return { ok: false, reason: 'revision' }
  const checkpoint = checkpoints.find(item => item.id === match[2])
  return checkpoint ? { ok: true, checkpoint } : { ok: false, reason: 'checkpoint' }
}

/** Manual short IDs resolve to the same allowlisted repository, never to public places. */
export function lookupManualCheckpoint(input: string): CheckpointValidation {
  const trimmed = input.trim()
  if (trimmed.startsWith('carenori:')) return validateCheckpointPayload(trimmed)
  const checkpoint = checkpoints.find(item => item.id === trimmed.toLowerCase())
  return checkpoint ? { ok: true, checkpoint } : { ok: false, reason: 'checkpoint' }
}
