export type PadPoint = { x: number; y: number }

/** Matches TouchpadRotation.h: clockwise in SDL's y-down frame, then clamp
 * along the point's ray so rotation never turns a corner touch into a lift. */
export function rotatePadPoint(point: PadPoint, degrees: number): PadPoint {
  if (![point.x, point.y, degrees].every(Number.isFinite) ||
    Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || degrees === 0) return point
  const radians = degrees * Math.PI / 180
  let x = point.x * Math.cos(radians) - point.y * Math.sin(radians)
  let y = point.x * Math.sin(radians) + point.y * Math.cos(radians)
  const extent = Math.max(Math.abs(x), Math.abs(y))
  if (extent > 1) { x /= extent; y /= extent }
  return { x, y }
}
