// TOUCHPAD_MODE = MOUSE_AREA: a trackpad as a map of one rectangle of the
// screen. This is the TypeScript side of the mapper's TouchAreaMapping.h --
// the same value format, the same sanitising and the same finger-to-screen
// arithmetic -- so the editor's preview, the picker's ghost and the mapper
// agree about where a touch puts the cursor. tests/mouse_area_regression.cjs
// compiles the real header and checks the two against each other.

/** A rectangle as fractions of the screen the game is on, y down. */
export type MouseArea = { x: number; y: number; w: number; h: number }

/**
 * How a pad whose shape differs from the area's is laid over it.
 *   STRETCH  the whole pad is the whole area (Steam's behaviour; the default).
 *   UNIFORM  the same travel per millimetre both ways: the pad is scaled to
 *            cover the area and centred, its spare travel clamping at the edge.
 */
export type MouseAreaFit = 'STRETCH' | 'UNIFORM'

export const MOUSE_AREA_FITS: readonly MouseAreaFit[] = ['STRETCH', 'UNIFORM']

/** The Pad fit choices, as the editor's rows show them. */
export const MOUSE_AREA_FIT_OPTIONS: { value: MouseAreaFit; label: string }[] = [
  { value: 'STRETCH', label: 'Stretch to fill' },
  { value: 'UNIFORM', label: 'Keep pad shape' },
]

/** The mapper's default: the whole screen. */
export const DEFAULT_MOUSE_AREA: MouseArea = { x: 0, y: 0, w: 1, h: 1 }

const MIN_SIZE = 0.005

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Mirrors touch_area::sanitize: corners in range, a minimum size, NaN-proof. */
export function sanitizeMouseArea(area: MouseArea): MouseArea {
  if (![area.x, area.y, area.w, area.h].every(Number.isFinite)) return { ...DEFAULT_MOUSE_AREA }
  const x = clamp01(area.x)
  const y = clamp01(area.y)
  let w = Math.min(1 - x, Math.max(MIN_SIZE, area.w))
  let h = Math.min(1 - y, Math.max(MIN_SIZE, area.h))
  let left = x
  let top = y
  if (w < MIN_SIZE) { left = 1 - MIN_SIZE; w = MIN_SIZE }
  if (h < MIN_SIZE) { top = 1 - MIN_SIZE; h = MIN_SIZE }
  return { x: left, y: top, w, h }
}

/** "x y w h" from a config line; null for anything that is not four numbers. */
export function parseMouseArea(raw: string | null | undefined): MouseArea | null {
  const parts = (raw ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length !== 4) return null
  const numbers = parts.map(part => Number(part))
  if (!numbers.every(Number.isFinite)) return null
  const [x, y, w, h] = numbers
  return { x, y, w, h }
}

/** The config value, written as the mapper writes it (four places). */
export function formatMouseArea(area: MouseArea): string {
  const a = sanitizeMouseArea(area)
  return [a.x, a.y, a.w, a.h].map(v => v.toFixed(4)).join(' ')
}

export function normalizeMouseAreaFit(raw: string | null | undefined): MouseAreaFit {
  return (raw ?? '').trim().toUpperCase() === 'UNIFORM' ? 'UNIFORM' : 'STRETCH'
}

const pct = (v: number) => `${Math.round(v * 100)}%`

/** "38% × 7% at 31%, 90%" -- what a row shows for the area. */
export function describeMouseArea(area: MouseArea | null | undefined): string {
  if (!area) return 'Whole screen'
  const a = sanitizeMouseArea(area)
  if (a.x === 0 && a.y === 0 && a.w >= 1 && a.h >= 1) return 'Whole screen'
  return `${pct(a.w)} × ${pct(a.h)} at ${pct(a.x)}, ${pct(a.y)}`
}

/** The area in pixels on a screen of the given size. */
export function mouseAreaPixels(area: MouseArea, screenWidth: number, screenHeight: number) {
  const a = sanitizeMouseArea(area)
  return {
    x: Math.round(a.x * screenWidth),
    y: Math.round(a.y * screenHeight),
    width: Math.round(a.w * screenWidth),
    height: Math.round(a.h * screenHeight),
  }
}

/**
 * Where a finger at (u, v) -- the pad's 0..1 position, y down -- puts the
 * cursor, as fractions of the screen. Mirrors touch_area::map exactly,
 * including the fallback to STRETCH for shapes that make no sense.
 */
export function mapTouchToArea(
  u: number,
  v: number,
  rect: MouseArea,
  fit: MouseAreaFit,
  padAspect: number,
  screenAspect: number
): { x: number; y: number } {
  const area = sanitizeMouseArea(rect)
  u = clamp01(u)
  v = clamp01(v)
  const shapesKnown = Number.isFinite(padAspect) && padAspect > 0 && Number.isFinite(screenAspect) && screenAspect > 0
  if (fit === 'STRETCH' || !shapesKnown) {
    return { x: area.x + u * area.w, y: area.y + v * area.h }
  }
  const areaW = area.w * screenAspect
  const areaH = area.h
  const scale = Math.max(areaW / padAspect, areaH)
  const padW = scale * padAspect
  const padH = scale
  const centreX = area.x * screenAspect + areaW * 0.5
  const centreY = area.y + areaH * 0.5
  let px = centreX + (u - 0.5) * padW
  let py = centreY + (v - 0.5) * padH
  px = Math.min(area.x * screenAspect + areaW, Math.max(area.x * screenAspect, px))
  py = Math.min(area.y + areaH, Math.max(area.y, py))
  return { x: px / screenAspect, y: py }
}

/**
 * The pad's footprint over the area under UNIFORM, as screen fractions: the
 * rectangle the whole pad would cover before clamping. Drawn by the picker so
 * the user can see which part of the pad is dead travel. Under STRETCH the
 * footprint is the area itself.
 */
export function padFootprint(rect: MouseArea, fit: MouseAreaFit, padAspect: number, screenAspect: number): MouseArea {
  const area = sanitizeMouseArea(rect)
  const shapesKnown = Number.isFinite(padAspect) && padAspect > 0 && Number.isFinite(screenAspect) && screenAspect > 0
  if (fit === 'STRETCH' || !shapesKnown) return area
  const areaW = area.w * screenAspect
  const scale = Math.max(areaW / padAspect, area.h)
  const padW = (scale * padAspect) / screenAspect
  const padH = scale
  return { x: area.x + area.w / 2 - padW / 2, y: area.y + area.h / 2 - padH / 2, w: padW, h: padH }
}
