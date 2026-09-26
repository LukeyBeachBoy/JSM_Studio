// Where the pad's next move starts from.
//
// Usually that is the focused element, but not always:
//
// - B leaves a text field by blurring it. Focus goes to <body>, and the next
//   D-pad press used to restart from the first control on the page. The field
//   stays the anchor (and keeps the ring) until something else takes focus.
// - The mouse -- a real one, or the trackpad/gyro mouse of a global chord --
//   hovering a control marks it, silently, as where the pad continues from.
//   Point at a setting, pick the pad back up, and Up/Down walk its neighbours.
// - The page title-bar round trip (View) comes back to the last control used
//   in the page, however focus got to the title bar.

let anchor: HTMLElement | null = null
let hovered = false
let pageAnchor: HTMLElement | null = null

const usable = (element: HTMLElement | null): element is HTMLElement => {
  if (!element?.isConnected) return false
  if (element.closest('[hidden], [inert], [aria-hidden="true"]') || element.matches(':disabled')) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/** Focus moved: that element is the anchor now. */
export function noteFocus(element: HTMLElement) {
  anchor = element
  hovered = false
  if (element.closest('.shell-scroll')) pageAnchor = element
}

/** The pointer is over a control that is not focused. */
export function noteHover(element: HTMLElement) {
  if (element === document.activeElement) { hovered = false; return }
  anchor = element
  hovered = true
  if (element.closest('.shell-scroll')) pageAnchor = element
}

/**
 * The element a directional move starts from. The focused element, unless the
 * mouse has since pointed at another control, or nothing is focused and the
 * last anchor is still on screen.
 */
export function navOrigin(): HTMLElement | null {
  const active = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  if (hovered && usable(anchor)) return anchor
  if (active) return active
  return usable(anchor) ? anchor : null
}

/** The anchor that is not focused, if the pad should resume from it. */
export const restingAnchor = () => {
  const active = document.activeElement
  if (!usable(anchor) || anchor === active) return null
  return hovered || !active || active === document.body ? anchor : null
}

/** The last control used inside the page, for coming back from the title bar. */
export const lastPageControl = () => (usable(pageAnchor) ? pageAnchor : null)
