import { useEffect, useRef } from 'react'
import { desktopBridge } from '../platform/desktopBridge'
import { getPressedControllerCommandSet } from '../utils/controllerStatus'
import type { TelemetrySample } from '../hooks/useTelemetry'
import { PadNavigator, type NavAction, type PadButton } from './padNavigator'

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
  onPageStep: (delta: 1 | -1) => void
  onSectionStep: (delta: 1 | -1) => void
  onExitTest: () => void
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
)).filter(element => element.getClientRects().length > 0 && !element.closest('[inert], [aria-hidden="true"]'))

// Things A presses rather than types into.
const CLICKABLE = 'button, a[href], summary, [role="button"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="tab"], [role="switch"], input[type="checkbox"], input[type="radio"], label'

// Keep what the pad lands on 96px clear of the top and of the capsule.
const CLEAR_TOP = 96
const CLEAR_BOTTOM = 44 + 16 + 16
const keepInView = (element: HTMLElement) => {
  const host = element.closest<HTMLElement>('.shell-scroll')
  if (!host) return
  const view = host.getBoundingClientRect()
  const box = element.getBoundingClientRect()
  if (box.height > view.height - CLEAR_TOP - CLEAR_BOTTOM) return
  if (box.top < view.top + CLEAR_TOP) host.scrollBy({ top: box.top - (view.top + CLEAR_TOP) })
  else if (box.bottom > view.bottom - CLEAR_BOTTOM) host.scrollBy({ top: box.bottom - (view.bottom - CLEAR_BOTTOM) })
}

export function useControllerNavigation(options: Options) {
  const latest = useRef(options)
  latest.current = options
  const titleBarReturn = useRef<HTMLElement | null>(null)

  // Which input moved focus last decides which ring shows (HANDOFF.md,
  // "Focus model": hover fill, keyboard outline, controller fill + ring).
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => { if (event.isTrusted) setInputSource('keyboard') }
    const mouse = (event: PointerEvent) => { if (event.isTrusted && (event.type === 'pointerdown' || event.movementX || event.movementY)) setInputSource('mouse') }
    const follow = (event: FocusEvent) => {
      if (document.body.dataset.inputSource === 'controller' && event.target instanceof HTMLElement) keepInView(event.target)
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
      const first = page && focusables(page)[0]
      first?.focus()
      return Boolean(first)
    }

    const activate = () => {
      const active = document.activeElement as HTMLElement | null
      if (!active || active === document.body) { enterPage(); return }
      if (sendKey('Enter', active)) return
      if (active.matches(CLICKABLE)) active.click()
    }

    const toggleTitleBar = () => {
      const bar = document.querySelector<HTMLElement>('.titlebar')
      if (!bar) return
      const active = document.activeElement as HTMLElement | null
      if (active && bar.contains(active)) {
        const back = titleBarReturn.current
        titleBarReturn.current = null
        if (back?.isConnected) back.focus()
        else enterPage()
        return
      }
      titleBarReturn.current = active && active !== document.body ? active : null
      focusables(bar)[0]?.focus()
    }

    const scroll = (dx: number, dy: number) => {
      const popover = document.querySelector<HTMLElement>('[data-radix-popper-content-wrapper] [role="menu"], [data-radix-popper-content-wrapper] [role="listbox"]')
      const host = popover ?? (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.shell-scroll, .modal-card, .drawer') ?? document.querySelector<HTMLElement>('.shell-scroll')
      host?.scrollBy({ left: dx, top: dy })
    }

    const perform = (action: NavAction) => {
      const { onPageStep, onSectionStep, onExitTest, testing } = latest.current
      if (action.kind === 'exitTest') { if (testing) onExitTest(); return }
      if (action.kind === 'scroll') { scroll(action.dx, action.dy); return }
      // A capture is waiting for a key: nothing but the hold-B escape may
      // reach it, or A would be captured as Enter.
      if (document.body.dataset.bindingCapture === 'true' && action.kind !== 'hold') return
      setInputSource('controller')
      if (action.kind === 'move') {
        const active = document.activeElement
        if (!active || active === document.body) { enterPage(); return }
        sendKey(ARROWS[action.direction])
        return
      }
      if (action.kind === 'hold') {
        // The escape that always works: capture listens for Escape on window.
        sendKey('Escape', window.document.body)
        return
      }
      switch (action.button) {
        case 'A': activate(); return
        case 'B': sendKey('Escape'); return
        case 'X':
        case 'Y': {
          if (sendPad(action.button)) return
          // Elements that already answer the keyboard's X or Y say so with
          // data-pad-keys; the pad then sends them the same letter.
          const active = document.activeElement as HTMLElement | null
          const keyed = active?.closest<HTMLElement>('[data-pad-keys]')
          if (keyed?.dataset.padKeys?.includes(action.button)) { sendKey(action.button.toLowerCase(), active ?? keyed); return }
          // Unclaimed X on a switch or checkbox toggles it.
          if (action.button === 'X' && active?.matches('[role="switch"], [aria-pressed], input[type="checkbox"]')) active.click()
          return
        }
        case 'LB':
        case 'RB':
          // An open picker or dialog steps its own categories; it hears LB/RB
          // as a pad event. Otherwise they step the page's sections.
          if (overlayOpen()) sendPad(action.button)
          else onSectionStep(action.button === 'LB' ? -1 : 1)
          return
        case 'LT':
        case 'RT':
          if (!overlayOpen()) onPageStep(action.button === 'LT' ? -1 : 1)
          return
        case 'VIEW':
          if (!overlayOpen()) toggleTitleBar()
          return
        case 'MENU': {
          if (overlayOpen()) return
          const actions = document.querySelector('.page-header__actions')
          const first = actions && focusables(actions)[0]
          first?.focus()
          return
        }
      }
    }

    const dispose = desktopBridge.onTelemetrySample(payload => {
      const { enabled, testing } = latest.current
      // Only while Studio is in front, and only while the navigation profile
      // (or a test of the configuration) owns the pad; otherwise the profile
      // is live and reading it here would act twice.
      if ((!enabled && !testing) || document.hidden || !document.hasFocus()) { navigator.reset(); return }
      const device = (payload as TelemetrySample | null)?.devices?.find(candidate => candidate.status)
      if (!device?.status) { navigator.reset(); return }
      const status = device.status
      const actions = navigator.update({
        buttons: getPressedControllerCommandSet(device),
        leftStick: status.leftStick,
        rightStick: status.rightStick,
        triggers: status.triggers,
      }, performance.now(), testing)
      for (const action of actions) perform(action)
    })
    return () => { dispose?.() }
  }, [])
}
