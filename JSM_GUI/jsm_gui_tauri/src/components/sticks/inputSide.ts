import { useSyncExternalStore } from 'react'

// Which stick, trigger or pad the Sticks / Triggers / Trackpads tabs show
// (console v2: the rail selects one input at a time instead of scroll-spying
// one long column). A tiny store outside React so the shell's rail (App), the
// pages and deep links (navigateInput, press-to-find) all agree on it.

export type InputSidePage = 'joysticks' | 'triggers' | 'touchpad'
export type InputSide = 'left' | 'right'

let sides: Readonly<Record<InputSidePage, InputSide>> = { joysticks: 'left', triggers: 'left', touchpad: 'left' }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(listener => listener())
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export const getInputSide = (page: InputSidePage) => sides[page]
export function setInputSide(page: InputSidePage, side: InputSide) {
  if (sides[page] === side) return
  sides = { ...sides, [page]: side }
  emit()
}
export const useInputSide = (page: InputSidePage) => useSyncExternalStore(subscribe, () => sides[page], () => sides[page])
/** Every page's side at once (the shell's rail). */
export const useInputSides = () => useSyncExternalStore(subscribe, () => sides, () => sides)

/** The side an input belongs to, for a deep link: L3 and LUP are the left
 *  stick, ZR the right trigger, RT4 and RIGHT_PAD the right pad. */
export function sideOfInput(command: string): { page: InputSidePage; side: InputSide } | null {
  const upper = command.toUpperCase()
  if (/^Z[LR]F?$/.test(upper)) return { page: 'triggers', side: upper[1] === 'L' ? 'left' : 'right' }
  if (/^ZL_MODE$|^LEFT_TRIGGER/.test(upper)) return { page: 'triggers', side: 'left' }
  if (/^ZR_MODE$|^RIGHT_TRIGGER/.test(upper)) return { page: 'triggers', side: 'right' }
  if (/^[LR](3|UP|DOWN|LEFT|RIGHT|RING|TOUCH)$/.test(upper)) return { page: 'joysticks', side: upper[0] === 'L' && upper !== 'LEFT' ? 'left' : 'right' }
  if (/^[LR]M\d+$/.test(upper)) return { page: 'joysticks', side: upper[0] === 'L' ? 'left' : 'right' }
  if (/^(LEFT|RIGHT)_STICK/.test(upper)) return { page: 'joysticks', side: upper.startsWith('LEFT') ? 'left' : 'right' }
  if (/^(LEFT_PAD|LT\d+|MISC4|MISC3|LEFT_(TOUCHPAD|GRID|TOUCH))/.test(upper)) return { page: 'touchpad', side: 'left' }
  if (/^(RIGHT_PAD|RT\d+|TOUCH|MISC2|RIGHT_(TOUCHPAD|GRID|TOUCH))/.test(upper)) return { page: 'touchpad', side: 'right' }
  return null
}

/** Point the page at the input's side before a deep link looks for its row. */
export function revealInputSide(command: string) {
  const found = sideOfInput(command)
  if (found) setInputSide(found.page, found.side)
}

// A request to open a page's Fine-tune once it is on screen ("Trackpad feel"
// on Home, `jsm:open-sheet` 'mouseFeel'): the page may not be mounted yet, so
// it is parked here and taken by the page when it mounts.
type FineTuneRequest = { page: InputSidePage; group?: string }
let pending: FineTuneRequest | null = null
export function requestFineTune(page: InputSidePage, group?: string) {
  pending = { page, group }
  emit()
}
export function takeFineTuneRequest(page: InputSidePage): FineTuneRequest | null {
  if (!pending || pending.page !== page) return null
  const request = pending
  pending = null
  return request
}
export const useFineTuneRequestVersion = () => useSyncExternalStore(subscribe, () => pending, () => pending)

// A request to open one stick's Mode shift for one held button (a chord's
// "Also shifts" row, a stick mode shift chip on a binding sheet, Controller
// action ▸ Stick mode shift). Parked the same way: the Sticks page opens its
// Mode shift sub-page, and the list there opens the editor for `trigger`
// (adding the shift first when `create` is set and it is not there yet).
export type ModeshiftRequest = { page: 'joysticks'; side: InputSide; trigger: string; create?: boolean }
let pendingShift: ModeshiftRequest | null = null
export function requestModeshift(request: ModeshiftRequest) {
  pendingShift = { ...request, trigger: request.trigger.toUpperCase() }
  // A binding sheet (a <details> row) asked for it: close it on the way out.
  document.querySelectorAll<HTMLDetailsElement>('details[data-input-command][open]').forEach(row => { row.open = false })
  sides = { ...sides, [request.page]: request.side }
  emit()
  window.dispatchEvent(new CustomEvent('jsm:open-page', { detail: request.page }))
}
/** The request for this page and side, left in place for the list to take. */
export const peekModeshiftRequest = (page: InputSidePage, side: InputSide) =>
  pendingShift && pendingShift.page === page && pendingShift.side === side ? pendingShift : null
export function takeModeshiftRequest(page: InputSidePage, side: InputSide): ModeshiftRequest | null {
  const request = peekModeshiftRequest(page, side)
  if (request) pendingShift = null
  return request
}
export const useModeshiftRequestVersion = () => useSyncExternalStore(subscribe, () => pendingShift, () => pendingShift)
