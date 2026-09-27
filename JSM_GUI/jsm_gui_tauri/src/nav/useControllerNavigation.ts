import { useEffect, useRef } from 'react'
import { desktopBridge } from '../platform/desktopBridge'
import { getPressedControllerCommandSet } from '../utils/controllerStatus'
import type { TelemetrySample } from '../hooks/useTelemetry'
import { PadNavigator, type NavAction, type PadButton } from './padNavigator'
import { NAV_SKIP_SELECTOR, pageEntryTarget } from '../hooks/useKeyboardNav'
import { isStudioNavigationProfile } from '../utils/appliedProfile'
import { restingAnchor } from './navAnchor'
import { cancelScroll, ensureVisible, watchManualScroll } from './scroller'
import { padFeedback } from './feedback'

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
  // Studio's own AutoLoad rule (JSM Studio.txt), which loads AppNavigation.
  return !/(^|[/])AutoLoad[/][^/]+$/i.test(activeProfile.trim())
}

export function useControllerNavigation(options: Options) {
  const latest = useRef(options)
  latest.current = options

  // Which input moved focus last decides which ring shows (HANDOFF.md,
  // "Focus model": hover fill, keyboard outline, controller fill + ring).
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => { if (event.isTrusted) setInputSource('keyboard') }
    const mouse = (event: PointerEvent) => { if (event.isTrusted && (event.type === 'pointerdown' || event.movementX || event.movementY)) setInputSource('mouse') }
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
      const host = popover ?? (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.shell-scroll, .modal-card, .drawer') ?? document.querySelector<HTMLElement>('.shell-scroll')
      // The stick is the person steering: any jump in flight gives way.
      if (host?.matches('.shell-scroll')) cancelScroll(host)
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
      if (action.kind === 'exitTest') { if (testing) onExitTest(); return }
      if (action.kind === 'scroll') { scroll(action.dx, action.dy); return }
      // A capture is waiting for a key: nothing but the hold-B escape may
      // reach it, or A would be captured as Enter.
      if (document.body.dataset.bindingCapture === 'true' && action.kind !== 'hold') return
      setInputSource('controller')
      if (action.kind === 'move') {
        const before = snapshot()
        moveFocus(action.direction)
        padFeedback(changedSince(before) ? 'move' : 'edge')
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
          if (sendKey('Escape') || changedSince(before)) padFeedback('back')
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
          // An open picker or dialog steps its own categories; it hears LB/RB
          // as a pad event. Otherwise they step the page's sections.
          if (overlayOpen()) { if (sendPad(action.button)) padFeedback('section', side) }
          else padFeedback(onSectionStep(action.button === 'LB' ? -1 : 1) === false ? 'edge' : 'section', side)
          return
        }
        case 'LT':
        case 'RT': {
          if (overlayOpen()) return
          const side = action.button === 'LT' ? 'left' : 'right'
          padFeedback(onPageStep(action.button === 'LT' ? -1 : 1) === false ? 'edge' : 'page', side)
          return
        }
        case 'VIEW':
          padFeedback('titleBar')
          void goHome()
          return
        case 'MENU': {
          if (overlayOpen()) return
          padFeedback(latest.current.onMenu() === false ? 'edge' : 'titleBar', 'right')
          return
        }
      }
    }

    const moveFocus = (direction: keyof typeof ARROWS) => {
      const key = ARROWS[direction]
      const active = document.activeElement as HTMLElement | null
      const resting = restingAnchor()
      if ((!active || active === document.body) && !resting) { enterPage(); return }
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

    const dispose = desktopBridge.onTelemetrySample(payload => {
      const { enabled, testing } = latest.current
      // Only while Studio is in front, and only while the navigation profile
      // (or a test of the configuration) owns the pad; otherwise the profile
      // is live and reading it here would act twice.
      if ((!enabled && !testing) || document.hidden || !document.hasFocus()) { navigator.reset(true); return }
      const sample = payload as TelemetrySample | null
      if (!testing && padOwnedElsewhere(sample?.activeProfile)) { navigator.reset(true); return }
      const device = sample?.devices?.find(candidate => candidate.status)
      if (!device?.status) { navigator.reset(true); return }
      const status = device.status
      const pressedSince = (status as { pressedSince?: unknown }).pressedSince
      const actions = navigator.update({
        buttons: getPressedControllerCommandSet(device),
        pressedSince: typeof pressedSince === 'number' ? getPressedControllerCommandSet({ ...device, status: { ...status, buttons: pressedSince } }) : undefined,
        leftStick: status.leftStick,
        rightStick: status.rightStick,
        triggers: status.triggers,
      }, performance.now(), testing)
      for (const action of actions) perform(action)
    })
    const host = document.querySelector<HTMLElement>('.shell-scroll')
    const unwatch = host ? watchManualScroll(host) : undefined
    return () => { dispose?.(); unwatch?.() }
  }, [])
}
