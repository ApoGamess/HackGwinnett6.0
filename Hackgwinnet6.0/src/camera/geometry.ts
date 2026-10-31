export type Box = [number, number, number, number]
export type ImageSide = 'left' | 'center' | 'right'
/** Pixel boxes -> CSS pixels. SVG uses CSS-pixel viewBox, so DPR needs no scaling.
 * Rotation is normally already applied by HTMLVideoElement (videoWidth/Height).
 * The optional rotation is for an explicitly rotated presentation only. */
export function transformBox(box: Box, source: { width: number; height: number }, viewport: { width: number; height: number }, options: { fit?: 'contain' | 'cover'; mirrored?: boolean; rotation?: 0 | 90 | 180 | 270 } = {}): Box {
  if (source.width <= 0 || source.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return [0, 0, 0, 0]
  const rotation = options.rotation ?? 0
  const [x, y, w, h] = box
  const rotated: Box = rotation === 90 ? [source.height - y - h, x, h, w]
    : rotation === 180 ? [source.width - x - w, source.height - y - h, w, h]
    : rotation === 270 ? [y, source.width - x - w, h, w] : box
  const sw = rotation === 90 || rotation === 270 ? source.height : source.width
  const sh = rotation === 90 || rotation === 270 ? source.width : source.height
  const scale = (options.fit === 'cover' ? Math.max : Math.min)(viewport.width / sw, viewport.height / sh)
  const dx = (viewport.width - sw * scale) / 2
  const dy = (viewport.height - sh * scale) / 2
  return [dx + (options.mirrored ? sw - rotated[0] - rotated[2] : rotated[0]) * scale, dy + rotated[1] * scale, rotated[2] * scale, rotated[3] * scale]
}
export function imageSide(box: Box, width: number, mirrored = false): ImageSide {
  const raw = (box[0] + box[2] / 2) / width
  const center = mirrored ? 1 - raw : raw
  return center < 1 / 3 ? 'left' : center > 2 / 3 ? 'right' : 'center'
}
