import type { Box } from './geometry'
export const STALE_RESULT_MS = 1500
// Explicit product subset of the installed COCO-SSD 2.2.3 class list. Chairs are
// never relabeled wheelchairs, and a person label conveys no role or identity.
export const SUPPORTED_TARGETS = ['person', 'chair', 'bench', 'backpack', 'handbag', 'bottle', 'cup', 'book', 'laptop', 'cell phone'] as const
export type SupportedTarget = typeof SUPPORTED_TARGETS[number]
export interface Detection {
  label: SupportedTarget
  score: number
  bbox: Box
  cameraSessionId: string
  frameTimestamp: number
}
export interface DetectionFrame {
  detections: Detection[]
  cameraSessionId: string
  frameTimestamp: number
  completedAt: number
  width: number
  height: number
}
export function isSupportedTarget(value: string): value is SupportedTarget { return (SUPPORTED_TARGETS as readonly string[]).includes(value) }
export function isFreshFrame(frame: DetectionFrame | null, sessionId: string | null, now = Date.now(), threshold = STALE_RESULT_MS): frame is DetectionFrame {
  return !!frame && !!sessionId && frame.cameraSessionId === sessionId && now >= frame.frameTimestamp && now - frame.frameTimestamp <= threshold
}
export function stabilizeDetections(current: Detection[], previous: DetectionFrame | null, now: number): Detection[] {
  // Smooth only current matched boxes; never carry a missing object forward.
  if (!previous || now - previous.frameTimestamp > 700) return current
  return current.map(item => {
    const prior = previous.detections.find(candidate => {
      if (candidate.label !== item.label || candidate.cameraSessionId !== item.cameraSessionId) return false
      const [ax, ay, aw, ah] = item.bbox, [bx, by, bw, bh] = candidate.bbox
      const overlap = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx)) * Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by))
      return overlap / (aw * ah + bw * bh - overlap) > 0.6
    })
    return prior ? { ...item, bbox: item.bbox.map((coordinate, index) => coordinate * 0.8 + prior.bbox[index] * 0.2) as Box } : item
  })
}
