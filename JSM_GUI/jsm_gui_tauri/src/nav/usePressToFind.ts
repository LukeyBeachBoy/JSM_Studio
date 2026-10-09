import { useCallback, useEffect, useRef, useState } from 'react'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { getPressedControllerCommandSet } from '../utils/controllerStatus'
import { inputPage, normalizePreviewInput } from '../utils/inputNavigation'

// "Find a button": press a real button to jump to its row (console v2,
// ButtonList). It only ever runs in an explicit, temporary listen mode -- the
// "Find a button" card on Buttons, or right after a new configuration asks to
// change a button. Outside it nothing on the controller moves the app: holding
// the pad squeezes the grip sensors and rests thumbs on the pads, and those
// used to jump the page as if they had been pressed on purpose.
//
// While listening, navigation pauses (body[data-pad-listening]) the way it
// does while a binding captures a key; the first deliberate press -- a
// button, paddle, pad click or trigger pull -- jumps to its row and ends it.
// B, Escape or the timeout cancel.

export const LISTEN_MS = 8000
/** How far a trigger is pulled before it counts as a press. */
const TRIGGER_PRESS = 0.6

type Options = {
  device?: TelemetryDevice
  /** The page on screen. */
  page: string
  /** Go to an input's page (the shell's tab). */
  onPage: (page: 'buttons' | 'triggers' | 'joysticks' | 'touchpad') => void
}

/** Contact, not a press: a thumb on a stick or pad, a hand round the grips. */
const CONTACT = new Set(['LTOUCH', 'RTOUCH', 'TOUCH', 'GRIP_L', 'GRIP_R'])
/** Inputs that are contact on this controller as well (the 2026 Steam
 *  Controller's grip sensors and left pad touch). */
const STEAM_CONTROLLER_2026 = 24 // utils/controllerStatus CONTROLLER_TYPES
const contactOn = (device?: TelemetryDevice) => device?.type === STEAM_CONTROLLER_2026 || device?.status?.leftGrip || device?.status?.rightGrip
  ? new Set(['MISC4', 'MISC5', 'MISC6']) : new Set<string>()

/** What is pressed on purpose, by input name. */
export const deliberatePresses = (device?: TelemetryDevice) => {
  const status = device?.status ? { ...device.status, leftPad: device.status.leftPad && { ...device.status.leftPad, touched: false }, rightPad: device.status.rightPad && { ...device.status.rightPad, touched: false } } : undefined
  const raw = [...getPressedControllerCommandSet(device && status ? { ...device, status } : device)]
  const contact = contactOn(device)
  const pressed = new Set(raw.filter(command => !CONTACT.has(command)).map(normalizePreviewInput).filter(command => !contact.has(command)))
  if ((device?.status?.triggers?.left ?? 0) >= TRIGGER_PRESS) pressed.add('ZL')
  if ((device?.status?.triggers?.right ?? 0) >= TRIGGER_PRESS) pressed.add('ZR')
  return pressed
}

/** Focus an input's row without opening it: the row says what it does; A opens it. */
const focusRow = (command: string) => {
  const attempt = (tries: number) => {
    const row = document.querySelector<HTMLElement>(`.main-pane [data-input-command="${CSS.escape(command)}"]`)
    if (!row) { if (tries > 0) setTimeout(() => attempt(tries - 1), 80); return }
    const target = row.matches('details') ? row.querySelector<HTMLElement>(':scope > summary') : row.querySelector<HTMLElement>('button:not([disabled]), summary, [tabindex="0"]') ?? row
    target?.scrollIntoView({ block: 'center' })
    target?.focus({ preventScroll: true })
    window.dispatchEvent(new Event('jsm:interaction-hint'))
  }
  attempt(12)
}

export function usePressToFind({ page, device, onPage }: Options) {
  /** When listening ends (ms since epoch), or null when not listening. */
  const [until, setUntil] = useState<number | null>(null)
  const listening = until !== null
  const previous = useRef<Set<string>>(new Set())
  // A press counts only once everything has been let go since listening
  // began: the A that asked to listen may reach this hook's telemetry after
  // navigation (which reads its own) has already acted on it.
  const ready = useRef(false)
  const latest = useRef({ page, onPage, listening })
  latest.current = { page, onPage, listening }

  const stop = useCallback(() => setUntil(null), [])
  const listen = useCallback(() => setUntil(Date.now() + LISTEN_MS), [])

  // Navigation pauses while listening; Escape or the timeout stops it.
  useEffect(() => {
    if (until === null) return
    ready.current = false
    document.body.dataset.padListening = 'true'
    document.body.dataset.padListeningMessage = 'Press any button to jump to its row · B or Esc cancels'
    window.dispatchEvent(new Event('jsm:interaction-hint'))
    const timer = setTimeout(stop, Math.max(0, until - Date.now()))
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stop() } }
    window.addEventListener('keydown', onKey, true)
    return () => {
      delete document.body.dataset.padListening
      delete document.body.dataset.padListeningMessage
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey, true)
      window.dispatchEvent(new Event('jsm:interaction-hint'))
    }
  }, [until, stop])

  useEffect(() => {
    const pressed = deliberatePresses(device)
    // Not listening: only keep track, so a button already held when listening
    // starts never counts as fresh.
    if (!latest.current.listening) { previous.current = pressed; return }
    if (!ready.current) {
      if (pressed.size === 0) ready.current = true
      previous.current = pressed
      return
    }
    const fresh = [...pressed].filter(command => !previous.current.has(command))
    previous.current = pressed
    if (!fresh.length) return
    // B cancels (as the banner says); it never finds itself.
    if (fresh.includes('E')) { setUntil(null); return }
    const command = fresh[0]
    setUntil(null)
    const target = inputPage(command)
    if (target !== latest.current.page) latest.current.onPage(target)
    focusRow(command)
  }, [device])

  return { listening, until, listen, stop }
}
