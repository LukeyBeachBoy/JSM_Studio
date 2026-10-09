import { useEffect, useRef } from 'react'
import { desktopBridge } from '../platform/desktopBridge'
import { getPressedControllerCommandSet } from '../utils/controllerStatus'
import type { TelemetrySample } from '../hooks/useTelemetry'
import { PadNavigator, type NavAction, type PadButton } from './padNavigator'
import { NAV_SKIP_SELECTOR, pageEntryTarget } from '../hooks/useKeyboardNav'
import { isStudioNavigationProfile } from '../utils/appliedProfile'
import { restingAnchor } from './navAnchor'
import { activeScrollHost, cancelScroll, ensureVisible, watchManualScroll } from './scroller'
import { padFeedback as feelPad } from './feedback'
import { PAD_HELD_EVENT, requestTextEntry } from './textEntry'

// Held buttons, by JSM command, as the on-screen keyboard names them.
const HELD_NAMES: Record<string, string> = { S: 'A', E: 'B', W: 'X', N: 'Y', L: 'LB', R: 'RB', ZL: 'LT', ZR: 'RT', L3: 'L3', R3: 'R3', '-': 'VIEW', '+': 'MENU' }

// Studio reads the pad itself while its window has focus: the navigation
// profile maps nothing to keys, so the applied configuration is paused and
// every standard button is free here (HANDOFF.md, "native controller
// navigation"). This hook is the DOM half: it feeds telemetry to PadNavigator
// and turns its actions into focus moves, activation and scrolling. The live
// preview reads the same telemetry independently, so drawing never waits on
// navigation or the other way round.
//
// Movement and Back go through synthetic key events so every existing handler
// (useKeyboardNav's spatial focus, Radix menus and selects, dialogs) responds
// exactly as it does to the keyboard. X and Y have no keyboard meaning; they
// arrive as a `jsm:pad` event that components can claim by calling
// preventDefault().

export type PadEventDetail = { button: PadButton }
export const PAD_EVENT = 'jsm:pad'

/**
 * A pad press made with the mouse: the footer's hints are buttons, and a
 * click on one does exactly what that button on the pad does (dispatch this
 * on window with { button }, or { exitTest: true } for View + Menu). Unlike
 * the pad itself it neither claims the input source nor rumbles.
 */
export type VirtualPadDetail = { button: PadButton } | { exitTest: true }
/** Leave Test mode now, whatever asked (the banner's button, the status chip). */
export const requestExitTest = () => pressPadButton({ exitTest: true })
export const VIRTUAL_PAD_EVENT = 'jsm:pad-press'
export const pressPadButton = (detail: VirtualPadDetail) => { window.dispatchEvent(new CustomEvent<VirtualPadDetail>(VIRTUAL_PAD_EVENT, { detail })) }

type Options = {
  /** Studio has the controller: mapping, AutoLoad and the navigation rule are on. */
  enabled: boolean
  testing: boolean
  /** True when the page changed (false at either end), for the haptic. */
  onPageStep: (delta: 1 | -1) => boolean | void
  /** True when the section changed (false at either end), for the haptic. */
  onSectionStep: (delta: 1 | -1) => boolean | void
  onExitTest: () => void
  /** View: Home, from anywhere (console refinement D10). */
  onHome: () => void
  /** Menu: the Configuration menu, where there is a configuration to act on. */
  onMenu: () => boolean | void
  /** Menu tapped: save (what the title bar's status chip does). */
  onSave: () => boolean | void
}

export type InputSource = 'controller' | 'keyboard' | 'mouse'
export const setInputSource = (source: InputSource) => {
  if (document.body.dataset.inputSource !== source) document.body.dataset.inputSource = source
}

const KEY_CODES: Record<string, string> = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Enter: 'Enter', Escape: 'Escape' }
const ARROWS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } as const

/** Dispatch a key the way the keyboard would; true if a handler claimed it. */
const sendKey = (key: string, target: Element = document.activeElement ?? document.body) => {
  const init = { key, code: KEY_CODES[key] ?? key, bubbles: true, cancelable: true, composed: true }
  const down = new KeyboardEvent('keydown', init)
  target.dispatchEvent(down)
  target.dispatchEvent(new KeyboardEvent('keyup', init))
  return down.defaultPrevented
}

const sendPad = (button: PadButton, target: Element = document.activeElement ?? document.body) => {
  const event = new CustomEvent<PadEventDetail>(PAD_EVENT, { detail: { button }, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

const overlayOpen = () => Boolean(document.querySelector('.modal-overlay, [data-focus-trap="true"], [data-radix-popper-content-wrapper]'))

const focusables = (scope: ParentNode) => Array.from(scope.querySelectorAll<HTMLElement>(
  'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
)).filter(element => element.getClientRects().length > 0 && !element.closest('[inert], [aria-hidden="true"]') && !element.matches(NAV_SKIP_SELECTOR))

// Things A presses rather than types into.
const CLICKABLE = 'button, a[href], summary, [role="button"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="tab"], [role="switch"], input[type="checkbox"], input[type="radio"], label'

// Controls that keep the arrow keys for something the pad does not need (a
// caret, a native value step): from the pad, every direction on them moves
// focus instead. A slider being adjusted is not one of these -- it is asked
// for Left/Right on purpose -- and it decides for itself what Up/Down do.
const ARROW_KEEPERS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [role="slider"], [contenteditable="true"]'

/**
 * Whether the mapper is running something other than Studio's navigation
 * profile: a global chord's configuration while its buttons are held, a
 * composed layer, or a configuration loaded some other way. The pad is then
 * driving that configuration -- the trackpad or gyro mouse, triggers clicking
 * -- and reading it here as well would act twice: RT clicking the mouse also
 * turned the page. An empty path means the mapper has not said; keep reading.
 */
const padOwnedElsewhere = (activeProfile: unknown) => {
  if (typeof activeProfile !== 'string' || !activeProfile.trim()) return false
  if (isStudioNavigationProfile(activeProfile)) return false
  // Studio's own AutoLoad rule (JSM Evolved.txt), which loads AppNavigation.
  return !/(^|[/])AutoLoad[/][^/]+$/i.test(activeProfile.trim())
}

export function useControllerNavigation(options: Options) {
  const latest = useRef(options)
  latest.current = options
  // Windows SendInput output is trusted too. Keep physical controller activity
  // independent of navigation ownership, including while a chord runs mappings.
  const controllerOutputUntil = useRef(0)

  // Which input moved focus last decides which ring shows (HANDOFF.md,
  // "Focus model": hover fill, keyboard outline, controller fill + ring).
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => { if (event.isTrusted && performance.now() > controllerOutputUntil.current) setInputSource('keyboard') }
    const mouse = (event: PointerEvent) => { if (event.isTrusted && performance.now() > controllerOutputUntil.current && (event.type === 'pointerdown' || event.movementX || event.movementY)) setInputSource('mouse') }
    const follow = (event: FocusEvent) => {
      if (document.body.dataset.inputSource === 'controller' && event.target instanceof HTMLElement) ensureVisible(event.target)
    }
    window.addEventListener('keydown', keyboard, true)
    window.addEventListener('pointerdown', mouse, true)
    window.addEventListener('pointermove', mouse, true)
    document.addEventListener('focusin', follow)
    return () => {
      window.removeEventListener('keydown', keyboard, true)
      window.removeEventListener('pointerdown', mouse, true)
      window.removeEventListener('pointermove', mouse, true)
      document.removeEventListener('focusin', follow)
    }
  }, [])

  useEffect(() => {
    const navigator = new PadNavigator()
    // A press from the footer (VIRTUAL_PAD_EVENT): no rumble, and the input in
    // use stays the mouse.
    let virtual = false
    const padFeedback: typeof feelPad = (...args) => { if (!virtual) feelPad(...args) }

    const enterPage = () => {
      const page = document.querySelector('.main-pane') ?? document.querySelector('.shell-scroll')
      const first = page && pageEntryTarget(focusables(page))
      first?.focus()
      return Boolean(first)
    }

    const activate = () => {
      const active = document.activeElement as HTMLElement | null
      if (!active || active === document.body) {
        // A field left with B is still where the pad is: A goes back into it.
        const resting = restingAnchor()
        if (resting) resting.focus()
        else enterPage()
        return
      }
      // A on one of the app's text fields opens the on-screen keyboard
      // (console v2); the physical keyboard still types into it directly.
      if (requestTextEntry(active)) return
      if (sendKey('Enter', active)) return
      if (active.matches(CLICKABLE)) active.click()
    }

    // View is Home from anywhere: whatever is open over the page (a menu, a
    // sheet, a dialog) is closed first, the way B would close it, so Home is
    // never reached with something half-open behind it. Up still reaches
    // the title bar.
    // React takes the closed layer off the page a moment after B, so each
    // step waits a frame before looking again.
    const nextFrame = () => new Promise<void>(resolve => setTimeout(resolve, 20))
    const goHome = async () => {
      for (let guard = 0; guard < 6 && overlayOpen(); guard++) {
        const count = document.querySelectorAll('.modal-overlay, [data-focus-trap="true"], [data-radix-popper-content-wrapper]').length
        sendKey('Escape')
        await nextFrame()
        // Nothing closed: something open will not go (capture, a busy dialog).
        if (overlayOpen() && document.querySelectorAll('.modal-overlay, [data-focus-trap="true"], [data-radix-popper-content-wrapper]').length >= count) return
      }
      if (!overlayOpen()) latest.current.onHome()
    }

    const scroll = (dx: number, dy: number) => {
      // A value being moved by hand (a menu's position) takes the right stick
      // for itself: it resizes rather than scrolling the page.
      const moving = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-adjusting="true"][data-stick-adjust="true"]')
      if (moving) { moving.dispatchEvent(new CustomEvent('jsm:stick-adjust', { detail: { dx, dy }, cancelable: true })); return }
      const popover = document.querySelector<HTMLElement>('[data-radix-popper-content-wrapper] [role="menu"], [data-radix-popper-content-wrapper] [role="listbox"]')
      const host = popover ?? activeScrollHost()
      // The stick is the person steering: any jump in flight gives way.
      cancelScroll(host)
      host?.scrollBy({ left: dx, top: dy })
    }

    // What a press changed, so the pad only feels something when something
    // happened: focus moved, a value stepped, a list or dialog opened or
    // closed. A press that went nowhere gets the dull "edge" instead.
    const snapshot = () => {
      const active = document.activeElement as HTMLElement | null
      return [
        active,
        active?.getAttribute('aria-valuenow'),
        active?.getAttribute('aria-checked'),
        document.querySelectorAll('[data-radix-popper-content-wrapper], .modal-overlay, [data-focus-trap="true"], details[open]').length,
      ]
    }
    const changedSince = (before: unknown[]) => snapshot().some((value, index) => value !== before[index])

    const perform = (action: NavAction) => {
      const { onPageStep, onSectionStep, onExitTest, testing } = latest.current
      if (action.kind === 'exitTest') {
        // The New configuration wizard's Try it reads the pad itself (hold A /
        // X / B): a B tap there is a test press, and the wizard ends the test.
        if (action.button === 'B' && document.body.dataset.testCapture === 'true') return
        if (testing) onExitTest()
        return
      }
      if (action.kind === 'scroll') { setInputSource('controller'); scroll(action.dx, action.dy); return }
      // A capture is waiting for a key: nothing but the hold-B escape may
      // reach it, or A would be captured as Enter.
      if (document.body.dataset.bindingCapture === 'true' && action.kind !== 'hold') return
      // "Press it now" (nav/usePressToFind.ts) is waiting for any button.
      if (document.body.dataset.padListening === 'true') return
      if (!virtual) setInputSource('controller')
      if (action.kind === 'move') {
        const before = snapshot()
        moveFocus(action.direction)
        padFeedback(changedSince(before) ? 'move' : 'edge')
        return
      }
      if (action.kind === 'hold' && action.button === 'MENU') {
        padFeedback(latest.current.onMenu() === false ? 'edge' : 'titleBar', 'right')
        return
      }
      if (action.kind === 'hold') {
        // The escape that always works: capture listens for Escape on window.
        sendKey('Escape', window.document.body)
        padFeedback('back', 'both')
        return
      }
      switch (action.button) {
        case 'A': {
          const active = document.activeElement
          activate()
          if (active && active !== document.body) padFeedback('select')
          return
        }
        case 'B': {
          const before = snapshot()
          // Nothing to go back from (Home): the dull edge, not silence.
          padFeedback(sendKey('Escape') || changedSince(before) ? 'back' : 'edge')
          return
        }
        case 'X':
        case 'Y': {
          const before = snapshot()
          const claimed = padButton(action.button)
          if (claimed || changedSince(before)) padFeedback('select')
          return
        }
        case 'LB':
        case 'RB': {
          const side = action.button === 'LB' ? 'left' : 'right'
          // Console convention (console v2, V1): the bumpers change tabs. An
          // open picker or dialog steps its own categories; it hears LB/RB as
          // a pad event instead.
          if (overlayOpen()) { if (sendPad(action.button)) padFeedback('section', side) }
          else padFeedback(onPageStep(action.button === 'LB' ? -1 : 1) === false ? 'edge' : 'page', side)
          return
        }
        case 'LT':
        case 'RT': {
          // The triggers step the page's sections (the rail). An open picker
          // or dialog hears them as a pad event instead (the action picker's
          // groups), as it does the bumpers.
          const side = action.button === 'LT' ? 'left' : 'right'
          if (overlayOpen()) { if (sendPad(action.button)) padFeedback('section', side); return }
          padFeedback(onSectionStep(action.button === 'LT' ? -1 : 1) === false ? 'edge' : 'section', side)
          return
        }
        case 'VIEW':
          padFeedback('titleBar')
          void goHome()
          return
        case 'MENU': {
          // A tap saves, from anywhere -- a sub-page can still claim Menu for
          // itself first (Review changes: ☰ Save). Holding it opens the menu.
          if (overlayOpen() && sendPad('MENU')) { padFeedback('select'); return }
          padFeedback(latest.current.onSave() === false ? 'edge' : 'select', 'right')
          return
        }
      }
    }

    const moveFocus = (direction: keyof typeof ARROWS) => {
      const key = ARROWS[direction]
      const active = document.activeElement as HTMLElement | null
      const resting = restingAnchor()
      if ((!active || active === document.body) && !resting) { enterPage(); return }
      // Console v2 rows whose value Left / Right change directly (ui/console
      // ValueRow, SegmentedRow): those two arrows are theirs; Up / Down move on.
      if (active?.matches('[data-arrows="horizontal"]') && (key === 'ArrowLeft' || key === 'ArrowRight')) { sendKey(key); return }
      const picker = document.querySelector('[data-radix-popper-content-wrapper]')
      // Moving on from a hovered control or a field left with B, or out of
      // a control that would otherwise eat the arrow (Up on a value field
      // used to change its value instead of moving).
      if (!picker && (resting || (active?.matches(ARROW_KEEPERS) && !active.closest('[data-adjusting="true"]')))) {
        window.dispatchEvent(new CustomEvent('jsm:navigate-direction', { detail: key }))
        return
      }
      sendKey(key)
    }

    /** X and Y: true if something answered them. */
    const padButton = (button: 'X' | 'Y') => {
      if (sendPad(button)) return true
      // Elements that already answer the keyboard's X or Y say so with
      // data-pad-keys; the pad then sends them the same letter.
      const active = document.activeElement as HTMLElement | null
      const keyed = active?.closest<HTMLElement>('[data-pad-keys]')
      if (keyed?.dataset.padKeys?.includes(button)) return sendKey(button.toLowerCase(), active ?? keyed)
      // Unclaimed X on a switch or checkbox toggles it.
      if (button === 'X' && active?.matches('[role="switch"], [aria-pressed], input[type="checkbox"]')) { active.click(); return true }
      return false
    }

    // The keyboard does everything the pad does, with the keys the hints name
    // when it is in use (nav/inputSource.ts): X and Y reach the same
    // handlers as the pad's (Show affected, Search, Use Default...), [ and ]
    // step sections as LB/RB do, Home goes Home as View does, and M opens the
    // Configuration menu as Menu does. Enter, Esc, the arrows and PgUp/PgDn
    // already were keys. Only keys nothing else took, and never while typing.
    const TYPED = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"]), textarea, select, [contenteditable="true"]'
    // M is the keyboard's Menu: a tap (released before the key repeats) saves,
    // holding it opens the Configuration menu.
    let mDown = false, mHeld = false
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'm' || !mDown) return
      mDown = false
      if (!mHeld) latest.current.onSave()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.isTrusted && event.repeat && mDown && event.key.toLowerCase() === 'm') {
        event.preventDefault()
        if (!mHeld) { mHeld = true; latest.current.onMenu() }
        return
      }
      if (!event.isTrusted || event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return
      if (document.body.dataset.bindingCapture === 'true') return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest(TYPED)) return
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (key === 'x' || key === 'y') {
        if (padButton(key === 'x' ? 'X' : 'Y')) event.preventDefault()
        return
      }
      // Console v2 (V1): [ and ] are LT/RT, PgUp/PgDn LB/RB. Inside a dialog
      // they reach it as those buttons; [ and ] fall back to LB/RB where the
      // dialog only steps with the bumpers (the action picker's categories).
      if (key === '[' || key === ']') {
        if (overlayOpen()) {
          if (sendPad(key === '[' ? 'LT' : 'RT') || sendPad(key === '[' ? 'LB' : 'RB')) event.preventDefault()
          return
        }
        event.preventDefault()
        latest.current.onSectionStep(key === '[' ? -1 : 1)
        return
      }
      if ((key === 'PageUp' || key === 'PageDown') && overlayOpen()) {
        if (sendPad(key === 'PageUp' ? 'LB' : 'RB')) event.preventDefault()
        return
      }
      if (overlayOpen()) {
        // A sub-page or dialog can claim Menu (Review changes: ☰ Save); otherwise
        // M still saves from inside it, as the pad's Menu does.
        if (key === 'm' && sendPad('MENU')) { event.preventDefault(); return }
        if (key !== 'm') return
      }
      if (key === 'Home') { event.preventDefault(); latest.current.onHome(); return }
      if (key === 'm') { event.preventDefault(); mDown = true; mHeld = false }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)

    const onVirtual = (event: Event) => {
      const detail = (event as CustomEvent<VirtualPadDetail>).detail
      if (!detail) return
      virtual = true
      try {
        if ('exitTest' in detail) perform({ kind: 'exitTest' })
        else perform({ kind: 'press', button: detail.button })
      } finally { virtual = false }
    }
    window.addEventListener(VIRTUAL_PAD_EVENT, onVirtual)

    let heldKey = ''
    const dispose = desktopBridge.onTelemetrySample(payload => {
      const { enabled, testing } = latest.current
      const sample = payload as TelemetrySample | null
      const physicalActivity = sample?.devices?.some(device => {
        const status = device.status
        return status && ((status.buttons ?? 0) !== 0 || status.leftPad?.touched || status.rightPad?.touched ||
          Math.hypot(status.leftStick.x, status.leftStick.y) > 0.25 || Math.hypot(status.rightStick.x, status.rightStick.y) > 0.25 ||
          status.triggers.left > 0.15 || status.triggers.right > 0.15)
      })
      if (physicalActivity && !document.hidden && document.hasFocus()) {
        setInputSource('controller')
        // A short release tail covers the telemetry/OS event ordering gap.
        // Idle controllers do not stop real keyboard/mouse use taking over.
        controllerOutputUntil.current = performance.now() + 120
      }
      // Only while Studio is in front, and only while the navigation profile
      // (or a test of the configuration) owns the pad; otherwise the profile
      // is live and reading it here would act twice.
      if ((!enabled && !testing) || document.hidden || !document.hasFocus()) { navigator.reset(true); return }
      const device = sample?.devices?.find(candidate => candidate.status)
      if (!testing && !overlayOpen() && padOwnedElsewhere(device?.activeProfile ?? sample?.activeProfile)) { navigator.reset(true); return }
      if (!device?.status) { navigator.reset(true); return }
      const status = device.status
      // An entered radial preview reads the full stick angle before page
      // navigation reduces it to a direction or scroll command.
      const preview = testing ? null : (document.activeElement as HTMLElement | null)?.closest('[data-preview-navigation]')
      const previewStick = new CustomEvent('jsm:preview-stick', { detail: { leftStick: status.leftStick, rightStick: status.rightStick }, cancelable: true })
      preview?.dispatchEvent(previewStick)
      const pressedSince = (status as { pressedSince?: unknown }).pressedSince
      const actions = navigator.update({
        buttons: getPressedControllerCommandSet(device),
        pressedSince: typeof pressedSince === 'number' ? getPressedControllerCommandSet({ ...device, status: { ...status, buttons: pressedSince } }) : undefined,
        leftStick: previewStick.defaultPrevented ? { x: 0, y: 0 } : status.leftStick,
        rightStick: previewStick.defaultPrevented ? { x: 0, y: 0 } : status.rightStick,
        triggers: status.triggers,
      }, performance.now(), testing)
      for (const action of actions) perform(action)
      // What is held, for an overlay that reads a hold rather than a press
      // (the on-screen keyboard: LT for a capital, L3 caps, R3 move, RB resize).
      if (!testing && overlayOpen()) {
        const down = getPressedControllerCommandSet(device)
        const held = Object.entries(HELD_NAMES).filter(([command]) => down.has(command)).map(([, name]) => name)
        if (status.triggers.left > 0.48 && !held.includes('LT')) held.push('LT')
        if (status.triggers.right > 0.48 && !held.includes('RT')) held.push('RT')
        const key = held.sort().join(',')
        if (key !== heldKey) { heldKey = key; window.dispatchEvent(new CustomEvent(PAD_HELD_EVENT, { detail: { held } })) }
      } else heldKey = ''
    })
    const host = document.querySelector<HTMLElement>('.shell-scroll')
    const unwatch = host ? watchManualScroll(host) : undefined
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener(VIRTUAL_PAD_EVENT, onVirtual); dispose?.(); unwatch?.() }
  }, [])
}
