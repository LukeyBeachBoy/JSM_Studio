// The app's on-screen keyboard (components/TextEntryOverlay.tsx), asked for
// when the pad presses A on one of the app's own text fields (console v2), or
// by a control that has no field of its own (a value row typing a number, a
// binding's Rename) through requestValueEntry.

export const TEXT_ENTRY_EVENT = 'jsm:text-entry'

export type TextEntryRequest = {
  /** A field to type into: Done writes the value into it the way typing does. */
  element?: HTMLInputElement | HTMLTextAreaElement
  /** No field: the starting text, and what Done hands back. */
  value?: string
  onDone?: (value: string) => void
  /** The overlay's header (TextEntry.dc.html): "Name this action", and above
   *  it what it is for, "A button · Press sends Space". */
  title?: string
  eyebrow?: string
  /** A line under the field ("Shown on the Layout tab and the overlay"). */
  hint?: string
  /** Words offered above the keys ("Jump", "Jump · vault"…). */
  suggestions?: string[]
  /** Digits first, for numbers. */
  numeric?: boolean
  /** The input this is for (a JSM name, "S"), drawn as its glyph in the header. */
  input?: string
  /** The footer's left side ("Wardogs · A button · Name"). */
  where?: string
}

/** Held pad buttons, sent while they change (nav/useControllerNavigation):
 *  the on-screen keyboard reads LT for a capital, R3 to move, RB to resize. */
export const PAD_HELD_EVENT = 'jsm:pad-held'
export type PadHeldDetail = { held: string[] }

/** Fields the overlay types into: text-like inputs and textareas, not secrets. */
export const TEXT_ENTRY_SELECTOR = 'input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="email"], input[type="number"], textarea'

/** Ask for the keyboard; true when it opened (the overlay claims the event). */
export const requestTextEntry = (element: Element | null) => {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return false
  if (!element.matches(TEXT_ENTRY_SELECTOR) || element.readOnly || element.disabled) return false
  const event = new CustomEvent<TextEntryRequest>(TEXT_ENTRY_EVENT, { detail: { element, numeric: element.type === 'number' }, cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

/** The keyboard for a value with no field: Done calls onDone with the text. */
export const requestValueEntry = (request: Omit<TextEntryRequest, 'element'> & { onDone: (value: string) => void }) => {
  const event = new CustomEvent<TextEntryRequest>(TEXT_ENTRY_EVENT, { detail: request, cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}
