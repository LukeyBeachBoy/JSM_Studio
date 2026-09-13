// The true shape of a controller's touchpad.
//
// A Steam Controller pad is square; a DualSense pad is roughly twice as wide as
// it is tall; an original Steam Controller's two pads are square as well. Drawing
// any of them as a fixed rectangle puts the region boundaries somewhere other
// than where the finger actually is -- the overlay and the editor preview both
// have to match the hardware or they lie about what a touch will select.
//
// The dimensions come from the driver via JoyShockMapper's telemetry
// (`GetTouchpadDimension`), so nothing here is keyed on a specific controller.
// The fallbacks exist only for "no controller connected yet".

/** Aspect ratio as width / height. 1 is square, 2 is twice as wide as tall. */
export type PadAspect = number

/**
 * Squareish, and the shape of every pad on the controllers this app is mainly
 * used with. Only used when nothing has reported real dimensions yet, so a
 * preview has something sane to draw before a controller is plugged in.
 */
export const FALLBACK_PAD_ASPECT: PadAspect = 1

type DeviceLike = {
  touchpadWidth?: number
  touchpadHeight?: number
} | null | undefined

/**
 * The pad aspect for a device, or the fallback when it has no touchpad or the
 * driver would not report one. Clamped: a driver reporting something absurd
 * should not produce a menu a hundred times wider than it is tall.
 */
export function padAspect(device: DeviceLike): PadAspect {
  const width = device?.touchpadWidth ?? 0
  const height = device?.touchpadHeight ?? 0
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return FALLBACK_PAD_ASPECT
  }
  return Math.min(4, Math.max(0.25, width / height))
}

/** The first connected device that actually reports a touchpad. */
export function padAspectFromDevices(devices: DeviceLike[] | undefined): PadAspect {
  const withPad = devices?.find(d => (d?.touchpadWidth ?? 0) > 0 && (d?.touchpadHeight ?? 0) > 0)
  return padAspect(withPad)
}

/**
 * A menu's on-screen box. `size` in a config is the menu's WIDTH; the height
 * follows the pad's aspect, so a stored layout keeps the same physical shape
 * whatever it is drawn on.
 */
export function menuBox(size: number, aspect: PadAspect) {
  return { width: Math.round(size), height: Math.round(size / aspect) }
}

/**
 * Turn a stored fractional placement into screen pixels.
 *
 * Position is the menu's CENTRE as a fraction of the monitor work area, so the
 * same config lands in the same visual spot on a 1080p and a 4K screen. The box
 * is then clamped so a menu near an edge stays fully on screen rather than being
 * half cut off -- which is what "close enough on a wildly different aspect
 * ratio" has to mean in practice.
 */
export function placeMenu(
  placement: { x: number; y: number; size: number },
  aspect: PadAspect,
  area: { x: number; y: number; width: number; height: number },
  scale = 1
) {
  const box = menuBox(placement.size * scale, aspect)
  const width = Math.min(box.width, area.width)
  const height = Math.min(box.height, area.height)
  const left = area.x + placement.x * area.width - width / 2
  const top = area.y + placement.y * area.height - height / 2
  return {
    x: Math.round(Math.min(area.x + area.width - width, Math.max(area.x, left))),
    y: Math.round(Math.min(area.y + area.height - height, Math.max(area.y, top))),
    width,
    height,
  }
}

/** The inverse of placeMenu's centring, for turning a drag into a placement. */
export function placementFromScreen(
  centreX: number,
  centreY: number,
  area: { x: number; y: number; width: number; height: number }
) {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  return {
    x: clamp01(area.width > 0 ? (centreX - area.x) / area.width : 0.5),
    y: clamp01(area.height > 0 ? (centreY - area.y) / area.height : 0.5),
  }
}
