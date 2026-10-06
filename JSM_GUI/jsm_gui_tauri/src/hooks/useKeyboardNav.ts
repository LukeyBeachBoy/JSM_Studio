import { useEffect, useRef, useState } from 'react'
import { navOrigin, noteFocus, noteHover } from '../nav/navAnchor'
import { CLEAR_BOTTOM, CLEAR_TOP, cancelScroll, ensureVisible, scrollDestination } from '../nav/scroller'
import { navBox } from '../nav/navBox'

// Everything the controller can reach once AppNavigation.txt has turned it into
// a keyboard: arrows move focus, Enter activates (native), Escape closes the
// topmost dialog, Page Up/Down switch pages. Kept deliberately DOM-level -- no
// spatial-navigation library, no per-component wiring -- so every page,
// including ones added later, is operable without doing anything special.

// tabindex="-1" is how the shell marks a control as mouse-only (the brand
// mark, the window controls): the arrow walk never lands on one.
const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'summary:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'password', 'number', 'tel'])

// Runs for every focusable on the page on every move, so it has to be cheap:
// checkVisibility answers display/visibility/content-visibility without a
// getComputedStyle per element, which on a long page was most of the cost of
// a D-pad press.
const isVisible = (element: HTMLElement) => {
  if (element.closest('[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"], [data-disabled]') || element.matches(':disabled')) return false
  const details = element.closest('details:not([open])')
  if (details && !details.querySelector(':scope > summary')?.contains(element)) return false
  if (typeof element.checkVisibility === 'function') {
    if (!element.checkVisibility({ checkVisibilityCSS: true })) return false
  } else {
    const style = getComputedStyle(element)
    if (style.visibility === 'hidden' || style.display === 'none') return false
  }
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

const topmostOverlay = () => {
  // Dialogs, and the navigation drawer, which traps focus the same way.
  const overlays = document.querySelectorAll<HTMLElement>('.modal-overlay, [data-focus-trap="true"]')
  return overlays.length ? overlays[overlays.length - 1] : null
}

// Radix popovers (Select lists, dropdown menus and their submenus) run their own
// roving focus, typeahead and Escape handling. While one is open this hook keeps
// its hands off the keyboard entirely, or the two would fight over every arrow
// press and focus would jump out of the open list.
const radixPopoverOpen = () => Boolean(document.querySelector('[data-radix-popper-content-wrapper]'))
const navigationSuspended = () =>
 document.body.dataset.bindingCapture === 'true' || Boolean(document.activeElement?.closest('[data-navigation-suspended="true"]'))

/**
 * Whether something already owns Escape.
 *
 * A dialog and an open Radix list both close on Escape and handle it
 * themselves. Anything else that wants Escape -- a transient mode like the
 * binding clipboard, which should end before the row it was copied from
 * closes -- has to claim the key before this hook folds the surrounding
 * details away, and must stand down while one of those is up.
 */
export const escapeIsClaimed = () => Boolean(topmostOverlay()) || radixPopoverOpen()

/** Fold the nearest disclosure in the current focus scope, then return to its opener. */
const closeDisclosure = (target: HTMLElement | null, overlay: HTMLElement | null) => {
  const origin = target && target !== document.body ? target : navOrigin()
  for (let node = origin; node && node !== overlay; node = node.parentElement) {
    // A portal can leave a resting page anchor behind the active sheet.
    if (overlay && !overlay.contains(node)) return false
    if (node instanceof HTMLDetailsElement && node.open) {
      node.open = false
      node.querySelector<HTMLElement>(':scope > summary')?.focus({ preventScroll: true })
      return true
    }
    if (node.hasAttribute('data-nav-disclosure')) {
      const trigger = Array.from(node.querySelectorAll<HTMLElement>('[data-nav-disclosure-trigger][aria-expanded="true"]'))
        .find(element => element.closest('[data-nav-disclosure]') === node)
      if (trigger) {
        // Go through React's toggle so controlled disclosures stay in sync.
        trigger.click()
        trigger.focus({ preventScroll: true })
        return true
      }
    }
  }
  return false
}

/**
 * Focusable, but not a stop on the arrow walk: the "?" help buttons beside
 * section headings and labels. They are the first control on most pages, so
 * the first D-pad press used to land on one and the next presses walked down
 * the column of them past every row; the pad reaches help through Y instead.
 * Tab and the mouse still reach them.
 */
export const NAV_SKIP_SELECTOR = '.help-button, [data-nav-skip]'

/**
 * Reachable, but never where the pad lands on entering a page (HANDOFF.md,
 * "Focus model": the page scope starts at the first row of the current
 * section). Toolbars, the page header's actions and section shortcuts like
 * "Bind to WASD" are one Up away from that row instead of in front of it.
 */
const ENTRY_SKIP_SELECTOR = '[data-nav-entry-skip], [role="toolbar"], .page-header__actions, [data-nav-entry-skip] *'

/** The first control a page should be entered at, from its focusables in order. */
export const pageEntryTarget = (items: HTMLElement[]) => items.find(element => !element.closest(ENTRY_SKIP_SELECTOR)) ?? items[0]

const focusablesIn = (scope: ParentNode) =>
  Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(element => !element.matches(NAV_SKIP_SELECTOR) && isVisible(element))

// Where focus was on the page being shown, for Down from the page tabs.
// Forgotten when the page is left: a page always opens at its top.
type Remembered = { element: HTMLElement }

type Options = {
  onPageStep: (delta: 1 | -1) => void
  /** Called on Escape when no dialog is open. Return true if something was closed. */
  onEscape?: () => boolean
  /**
   * Identifies which primary page is showing. Sidebar buttons, the page's own
   * tabs, and toolbar controls all come before the content in DOM order, so
   * without this a controller that just switched page (a sidebar press, or
   * ZL/ZR via onPageStep) is left focused wherever it was before -- often
   * nowhere -- and the next D-pad press restarts the walk from the very first
   * sidebar item instead of landing in the page just switched to. Changing
   * this value moves focus into that page's content, the same way opening a
   * dialog already does below.
   */
  activePage?: unknown
  /** Content region to focus into on an activePage change. Defaults to '.main-pane'. */
  contentSelector?: string
}

// How long a newly shown page must go without its structure changing before
// the pad lands in it, and the most it will wait for that (or for data it is
// still loading) before landing anyway.
const SETTLE_QUIET_MS = 90
const SETTLE_MAX_MS = 1200

export function useKeyboardNav({ onPageStep, onEscape, activePage, contentSelector = '.main-pane' }: Options) {
  const [modalOpen, setModalOpen] = useState(false)
  // The page focus was last moved into. Starts as the mounted page so a fresh
  // launch never yanks focus into the content -- and so StrictMode's second
  // effect run does not either: a boolean "skip once" flag was consumed by the
  // first run and let the second one through, focusing the first filter chip
  // on launch.
  const focusedPage = useRef(activePage)
  const pageFocus = useRef(new Map<unknown, Remembered>())
  const verticalPath = useRef<{ from: HTMLElement; to: HTMLElement; key: string; overlay: HTMLElement | null; page: unknown }[]>([])
  const activePageRef = useRef(activePage)
  activePageRef.current = activePage

  // Remember where focus is in the page.
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || target === document.body) return
      noteFocus(target)
      if (topmostOverlay()) return
      const content = document.querySelector(contentSelector)
      if (!content?.contains(target)) return
      pageFocus.current.set(activePageRef.current, { element: target })
    }
    // The mouse pointing at a control makes it where the pad continues from
    // (it does not take focus; clicking still does).
    // Only a pointer that actually moved counts: the browser also reports
    // "over" when the page scrolls under a resting cursor, and scrolling with
    // the right stick must not quietly move the pad's starting point.
    let lastOver: Element | null = null
    const hover = (event: PointerEvent) => {
      if (!event.isTrusted || event.pointerType === 'touch' || (!event.movementX && !event.movementY)) return
      const target = event.target instanceof Element ? event.target : null
      if (target === lastOver) return
      lastOver = target
      if (!target || topmostOverlay() && !topmostOverlay()!.contains(target)) return
      let control = target.closest<HTMLElement>(FOCUSABLE_SELECTOR)
      if (control?.matches(NAV_SKIP_SELECTOR)) control = null
      // Pointing at a setting row's label or description means its control.
      if (!control) {
        const row = target.closest<HTMLElement>('.setting-row, [data-nav-row]')
        control = row ? focusablesIn(row)[0] ?? null : null
      }
      if (control && control.closest('.shell-scroll, [data-focus-scope], .modal-overlay, [data-focus-trap="true"]')) noteHover(control)
    }
    document.addEventListener('focusin', remember)
    document.addEventListener('pointermove', hover, true)
    return () => {
      document.removeEventListener('focusin', remember)
      document.removeEventListener('pointermove', hover, true)
    }
  }, [contentSelector])

  // Only react to CHANGES in activePage, not the initial mount -- a fresh
  // launch shouldn't yank focus into the page before anyone has touched a
  // controller.
  //
  // Focus lands once, on the right control, after the page has settled: not
  // while it is still sliding in (the ring shook as it chased the animation),
  // and not before its data has loaded (it landed on one control, then the
  // rows arrived above it and the remembered one turned up a second later).
  useEffect(() => {
    if (focusedPage.current === activePage) return
    focusedPage.current = activePage
    const content = document.querySelector<HTMLElement>(contentSelector)
    if (!content) return
    const scrollHost = content.closest<HTMLElement>('.shell-scroll')
    cancelScroll(scrollHost)
    if (scrollHost) scrollHost.scrollTop = 0
    const started = performance.now()
    let lastChange = started
    let done = false
    // A page always opens at its top, on its first control. Returning to
    // where it was left scrolled the page after it had drawn -- Trackpads
    // jumping down a moment after it opened -- so that is forgotten too.
    pageFocus.current.delete(activePage)
    const loading = () => Boolean(content.querySelector('.lazy-panel-fallback, [aria-busy="true"]'))
    const pick = () => pageEntryTarget(focusablesIn(content)) ?? null
    const land = () => {
      if (done) return true
      // Moved while it settled (a section picked, the wheel, the stick): land
      // in what is on screen and leave the page where it was taken.
      const moved = Boolean(scrollHost && scrollDestination(scrollHost) > 1)
      const target = moved ? visibleEntry('ArrowDown') ?? pick() : pick()
      if (!target) return false
      done = true
      target.focus({ preventScroll: true })
      if (!moved) ensureVisible(target, { smooth: false })
      return true
    }
    // Anything the person does first wins: a press that already moved focus
    // is not overridden when the page settles. Not only into the page: Up to
    // the page tabs, or Menu opening the Configuration menu, in the moment
    // before the page settled used to be undone by the landing, which pulled
    // focus back into the page -- behind the menu's scrim.
    const claimed = (event: FocusEvent) => {
      if (event.target instanceof Node && event.target !== document.body) done = true
    }
    document.addEventListener('focusin', claimed)
    const observer = new MutationObserver(() => { lastChange = performance.now() })
    observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy'] })
    let frame = 0
    const tick = () => {
      if (done) return
      const now = performance.now()
      const final = now - started >= SETTLE_MAX_MS
      // Most of the page's slide-in (--dur-3, 240ms) has played by then; the
      // ring follows the rest.
      const settled = now - lastChange >= SETTLE_QUIET_MS && now - started >= 160 && !loading()
      if ((settled || final) && land()) return
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      done = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('focusin', claimed)
    }
  }, [activePage, contentSelector])

  // Track dialogs by watching the DOM rather than threading state through every
  // modal owner. When one opens, put focus inside it so the first D-pad press
  // lands somewhere sensible instead of behind the overlay. The live preview
  // mutates the DOM continuously, so a mutation only does work when the
  // topmost overlay actually changed -- and then at once, so focus is back
  // on its opener the moment a dialog closes.
  useEffect(() => {
    let lastOverlay: HTMLElement | null = null
    const returnFocus = new Map<HTMLElement, { element: HTMLElement; input?: string }>()
    const update = () => {
      const overlay = topmostOverlay()
      setModalOpen(Boolean(overlay))
      if (overlay && overlay !== lastOverlay) {
        const active = document.activeElement as HTMLElement | null
        if (active && !returnFocus.has(overlay)) returnFocus.set(overlay, { element: active, input: active.closest<HTMLElement>('[data-input-command]')?.dataset.inputCommand })
        if (!active || !overlay.contains(active)) {
          const items = focusablesIn(overlay)
          const preferred = overlay.querySelector<HTMLElement>('[data-autofocus]')
          const first = (preferred && items.includes(preferred) ? preferred : null) ?? items.find(element => !element.classList.contains('ghost-btn')) ?? items[0]
          first?.focus({ preventScroll: true })
        }
      }
      if (lastOverlay && !lastOverlay.isConnected) {
        const previous = returnFocus.get(lastOverlay)
        returnFocus.delete(lastOverlay)
        const replaced = overlay && overlay !== lastOverlay && previous && !overlay.contains(previous.element)
        if (replaced) {
          // Closed by opening another in its place (the Configuration menu's
          // "Values & inheritance" opens a dialog as the menu closes): focus
          // stays in the new one. Handing it back to the menu's opener here
          // pulled it out from under the dialog, behind the scrim. The new
          // one returns there instead, since what it was opened from -- an
          // item of the closed menu -- is gone.
          const opened = returnFocus.get(overlay)
          if (!opened || opened.element === document.body || !opened.element.isConnected || lastOverlay.contains(opened.element)) returnFocus.set(overlay, previous)
        } else if (previous?.element.isConnected) previous.element.focus({ preventScroll: true })
        else if (previous?.input) document.querySelector<HTMLElement>(`details[data-input-command="${CSS.escape(previous.input)}"] > summary`)?.focus()
      }
      lastOverlay = overlay
    }
    update()
    const observer = new MutationObserver(() => {
      if (topmostOverlay() !== lastOverlay || (lastOverlay && !lastOverlay.isConnected)) update()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    // One directional move, from wherever the pad is (see navAnchor).
    const move = (key: string) => {
      const origin = navOrigin()
      const overlay = topmostOverlay()
      const path = verticalPath.current
      const last = path[path.length - 1]
      const vertical = key === 'ArrowUp' || key === 'ArrowDown'
      if (!vertical || (last && (last.to !== origin || last.overlay !== overlay || last.page !== activePageRef.current))) path.length = 0
      // Rows with several controls have ambiguous geometry on the return trip.
      // Retrace the actual vertical path instead of choosing another column.
      const previous = path[path.length - 1]
      let next: HTMLElement | undefined
      if (overlay) {
        const items = focusablesIn(overlay)
        next = origin && items.includes(origin) ? directionalTarget(origin, items, key) : items[0]
      } else {
        next = shellTarget(origin, key, pageFocus.current.get(activePageRef.current)?.element)
      }
      if (!next) return false
      if (vertical && previous && previous.key !== key && previous.from.isConnected && isVisible(previous.from) &&
        directionalTarget(origin!, [previous.from], key) === previous.from &&
        Math.abs(navBox(previous.from).top - navBox(next).top) <= 8) {
        path.pop()
        previous.from.focus({ preventScroll: true })
        if (!ensureVisible(previous.from)) previous.from.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        return true
      }
      if (previous && previous.key !== key) path.length = 0
      if (vertical && origin && next !== origin) {
        path.push({ from: origin, to: next, key, overlay, page: activePageRef.current })
        if (path.length > 100) path.shift()
      }
      next.focus({ preventScroll: true })
      if (!ensureVisible(next)) next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      return true
    }

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || navigationSuspended()) return
      if (radixPopoverOpen()) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const inputType = tag === 'INPUT' ? (target as HTMLInputElement).type : ''
      const isTextEntry =
        (tag === 'INPUT' && TEXT_INPUT_TYPES.has(inputType)) || tag === 'TEXTAREA' || Boolean(target?.isContentEditable)
      // A single-line field only uses Left/Right for its caret; Up/Down may
      // leave it, or the pad would be stuck in a search box until B blurred it.
      const isMultilineEntry = tag === 'TEXTAREA' || Boolean(target?.isContentEditable)
      // Sliders and native selects step their value with Left/Right, so those
      // stay with the control. A closed Radix trigger (Select, menu) opens on
      // Down/Enter only; Left/Right on it walk to its neighbours, which is
      // how the title bar's segments are meant to be stepped through.
      const usesArrowsNatively =
        tag === 'SELECT' ||
        inputType === 'range' ||
        inputType === 'radio' ||
        target?.getAttribute('role') === 'slider'

      switch (event.key) {
        case 'Tab': {
          const overlay = topmostOverlay()
          if (!overlay) return
          const items = focusablesIn(overlay)
          const index = items.indexOf(document.activeElement as HTMLElement)
          if (items.length && (index < 0 || (!event.shiftKey && index === items.length - 1) || (event.shiftKey && index === 0))) {
            event.preventDefault()
            items[event.shiftKey ? items.length - 1 : 0].focus()
          }
          return
        }
        case 'Escape': {
          const overlay = topmostOverlay()
          if (closeDisclosure(target, overlay)) { event.preventDefault(); return }
          if (overlay) {
            const close = overlay.querySelector<HTMLElement>(
              '[data-modal-close], .modal-header .ghost-btn, .modal-actions .ghost-btn'
            )
            if (close) {
              event.preventDefault()
              close.click()
            }
            return
          }
          // Leaving a field keeps it as the anchor: the ring stays on it and
          // the next move continues from it (nav/navAnchor.ts).
          if (isTextEntry) { target?.blur(); return }
          if (onEscape?.()) event.preventDefault()
          return
        }
        case 'PageUp':
        case 'PageDown': {
          if (isTextEntry || topmostOverlay()) return
          event.preventDefault()
          onPageStep(event.key === 'PageDown' ? 1 : -1)
          return
        }
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
          if (isMultilineEntry || (isTextEntry && inputType !== 'number' && horizontal) || (usesArrowsNatively && horizontal)) return
          if (move(event.key)) event.preventDefault()
          return
        }
        default:
          return
      }
    }
    // A control that keeps the arrow keys for itself (a slider not being
    // adjusted, a field the pad is in) hands the move over by event.
    const direction = (event: Event) => {
      if (navigationSuspended() || radixPopoverOpen()) return
      // Composite previews own directions even when pointer hover caused the
      // controller to use this route instead of dispatching a keyboard event.
      const focused = document.activeElement as HTMLElement | null
      if (focused?.matches('[data-nav-skip][role="button"]') && focused.closest('[data-preview-navigation]')) {
        focused.dispatchEvent(new KeyboardEvent('keydown', { key: (event as CustomEvent<string>).detail, bubbles: true, cancelable: true }))
        return
      }
      move((event as CustomEvent<string>).detail)
    }
    window.addEventListener('jsm:navigate-direction', direction)
    window.addEventListener('keydown', handler)
    return () => { window.removeEventListener('keydown', handler); window.removeEventListener('jsm:navigate-direction', direction) }
  }, [onPageStep, onEscape])

  return { modalOpen }
}

// ---- The shell's focus scopes (HANDOFF.md, "Focus model"): 1 title bar,
// 2 page tabs, 3 sections, 4 page. Arrows move within a scope; the crossings
// between scopes are fixed rather than left to geometry, or Down from a tab
// would land in the section list because it starts higher than the page's
// first row, and Left from a row would pick whichever section item was level
// with it instead of the current one.
//
//   title bar   Down -> the selected tab
//   page tabs   Up -> title bar (nearest horizontally) · Down -> the page,
//               at the row remembered for it
//   sections    Up/Down within · Right -> the page
//   page        Up past the top -> the selected tab · Left past the edge ->
//               the current section · Down/Right never leave
type ShellScope = 'titlebar' | 'page-tabs' | 'sections' | 'page'

const scopeOf = (element: HTMLElement | null): ShellScope | null => {
  const declared = element?.closest<HTMLElement>('[data-focus-scope]')?.dataset.focusScope
  if (declared === 'titlebar' || declared === 'page-tabs' || declared === 'sections') return declared
  return element?.closest('.shell-scroll') ? 'page' : null
}

const scopeRoot = (scope: ShellScope) =>
  document.querySelector<HTMLElement>(scope === 'page' ? '.shell-scroll' : `[data-focus-scope="${scope}"]`)

const withinScope = (scope: ShellScope) => { const root = scopeRoot(scope); return root ? focusablesIn(root) : [] }

/**
 * How much of `element` shows in the page's viewport (between the top margin
 * and the capsule), measured where the page is headed rather than mid-scroll.
 */
const shownFraction = (element: HTMLElement, host: HTMLElement) => {
  const view = host.getBoundingClientRect()
  const box = element.getBoundingClientRect()
  const pending = scrollDestination(host) - host.scrollTop
  const top = Math.max(box.top - pending, view.top), bottom = Math.min(box.bottom - pending, view.bottom - CLEAR_BOTTOM / 2)
  return box.height > 0 ? Math.max(0, bottom - top) / box.height : 0
}

/**
 * Entering the page where it is scrolled to. After LB/RB, the right stick or
 * the wheel have moved the page away from the focused control, the next move
 * starts in what is on screen now instead of dragging the page back: Down and
 * Right from the top of the view, Up from the bottom, Left from the left.
 */
const visibleEntry = (key: string) => {
  const host = scopeRoot('page')
  if (!host) return undefined
  const shown = withinScope('page').filter(element => shownFraction(element, host) > 0.6)
  if (!shown.length) return undefined
  const pending = scrollDestination(host) - host.scrollTop
  const view = host.getBoundingClientRect()
  const clearTop = view.top + Math.min(CLEAR_TOP, view.height / 4)
  const rows = shown.map(element => ({ element, box: element.getBoundingClientRect() }))
  if (key === 'ArrowUp') return rows.reduce((best, row) => row.box.bottom > best.box.bottom + 1 || (Math.abs(row.box.bottom - best.box.bottom) <= 1 && row.box.left < best.box.left) ? row : best).element
  // Prefer the first control below the top margin, so a section heading
  // brought to the top by LB/RB is entered at its own first row.
  const below = rows.filter(row => row.box.top - pending >= clearTop - 24)
  const pool = below.length ? below : rows
  return pool.reduce((best, row) => row.box.top < best.box.top - 1 || (Math.abs(row.box.top - best.box.top) <= 1 && row.box.left < best.box.left) ? row : best).element
}

/** The page's remembered row, else its first control. */
const pageEntry = (remembered?: HTMLElement) => {
  const items = withinScope('page')
  const host = scopeRoot('page')
  if (remembered && items.includes(remembered) && (!host || shownFraction(remembered, host) > 0.3)) return remembered
  return (host && visibleEntry('ArrowDown')) || pageEntryTarget(items)
}

const selectedTab = () =>
  document.querySelector<HTMLElement>('[data-focus-scope="page-tabs"] [aria-current="page"], [data-focus-scope="page-tabs"] .page-tabs__drawer-button')
  ?? withinScope('page-tabs')[0]

const currentSection = () =>
  document.querySelector<HTMLElement>('[data-focus-scope="sections"] [aria-current="true"]') ?? withinScope('sections')[0]

export function shellTarget(current: HTMLElement | null, key: string, remembered?: HTMLElement): HTMLElement | undefined {
  const scope = current ? scopeOf(current) : null
  // Nothing focused, or something outside the shell's scopes: enter the page.
  if (!current || !scope) return pageEntry(remembered)
  const within = () => directionalTarget(current, withinScope(scope), key)
  switch (scope) {
    case 'titlebar':
      return key === 'ArrowDown' ? selectedTab() : key === 'ArrowUp' ? undefined : within()
    case 'page-tabs':
      if (key === 'ArrowDown') return pageEntry(remembered)
      if (key === 'ArrowUp') return directionalTarget(current, withinScope('titlebar'), key) ?? withinScope('titlebar')[0]
      return within()
    case 'sections':
      return key === 'ArrowRight' ? pageEntry(remembered) : key === 'ArrowLeft' ? undefined : within()
    case 'page': {
      // Scrolled away from: start from what is on screen.
      const host = scopeRoot('page')
      if (host && shownFraction(current, host) < 0.3) {
        const entry = visibleEntry(key)
        if (entry) return entry
      }
      const next = within()
      if (next) return next
      if (key === 'ArrowUp') return selectedTab()
      if (key === 'ArrowLeft') return currentSection()
      return undefined
    }
  }
}

// Up and Down keep to the column, Left and Right to the row: a move goes to
// the nearest control straight ahead -- one whose box shares some of the
// current one's width (Up/Down) or height (Left/Right) -- and only when there
// is none to a control wholly past the current one's edge, the nearest
// diagonally. Never wrap from a page edge to an unrelated control at the
// opposite edge.
//
// The walk used to take whichever control was nearest ahead, lane or not, so
// columns whose rows were a few pixels out of step (the Overview's binding
// cards, the Documentation topics beside the article's links) were walked as
// a zigzag between them, and a Left from the leftmost column slid down to
// whatever narrower control sat below it. Boxes are navBox's (nav/navBox.ts),
// the ones the ring is drawn round: a setting row's control is measured as
// its row, so walking a list of rows whose controls sit at different places
// along them is still straight down.
//
// A container marked data-nav-region (a list beside its detail panel, one of
// two setting columns) keeps Up and Down inside it: the walk down a list never
// jumps into the panel beside it because one of the panel's buttons happens to
// sit a little nearer than the next list item. At its end the walk carries on
// straight past it, never into the column beside it. Left and Right cross
// freely.
export function directionalTarget(current: HTMLElement, candidates: HTMLElement[], direction: string) {
  const horizontal = direction === 'ArrowLeft' || direction === 'ArrowRight'
  const region = horizontal ? null : current.closest<HTMLElement>('[data-nav-region]')
  if (region) {
    const inside = candidates.filter(candidate => candidate.closest('[data-nav-region]') === region)
    const next = nearestIn(current, inside, direction)
    if (next) return next
    const edge = region.getBoundingClientRect()
    const past = candidates.filter(candidate => {
      if (region.contains(candidate)) return false
      const box = navBox(candidate)
      return direction === 'ArrowDown' ? box.top >= edge.bottom - 1 : box.bottom <= edge.top + 1
    })
    return nearestIn(current, past, direction, true)
  }
  // From outside any region, a region is entered like anything else.
  return nearestIn(current, candidates, direction)
}

function nearestIn(current: HTMLElement, candidates: HTMLElement[], direction: string, straightOnly = false) {
  const from = navBox(current)
  const horizontal = direction === 'ArrowLeft' || direction === 'ArrowRight'
  const sign = direction === 'ArrowLeft' || direction === 'ArrowUp' ? -1 : 1
  const x = from.left + from.width / 2, y = from.top + from.height / 2
  let straight: HTMLElement | undefined, straightScore = Infinity
  let diagonal: HTMLElement | undefined, diagonalScore = Infinity
  const fromHeader = Boolean(current.closest('.page-header'))
  const fromRegion = current.closest('[data-nav-region]')
  const boxes = new Map<HTMLElement, DOMRect>()
  const boxOf = (element: HTMLElement) => { let box = boxes.get(element); if (!box) { box = navBox(element); boxes.set(element, box) } return box }
  for (const candidate of candidates) {
    if (candidate === current) continue
    const to = boxOf(candidate)
    const forward = (horizontal ? to.left + to.width / 2 - x : to.top + to.height / 2 - y) * sign
    if (forward <= 1) continue
    // How much the two boxes share across the direction of travel; negative
    // is the gap between them.
    const overlap = horizontal
      ? Math.min(to.bottom, from.bottom) - Math.max(to.top, from.top)
      : Math.min(to.right, from.right) - Math.max(to.left, from.left)
    if (overlap > 1) {
      // Straight ahead: the nearest wins. Of two level with each other (a
      // full-width row above a pair of buttons), the one more squarely ahead,
      // then the first in reading order.
      const across = horizontal ? Math.min(to.height, from.height) : Math.min(to.width, from.width)
      const score = forward - 4 * Math.min(1, overlap / Math.max(1, across))
      if (score < straightScore) { straightScore = score; straight = candidate }
      continue
    }
    if (straightOnly) continue
    // Diagonally: only a control wholly past this one's edge, or a Left from
    // the leftmost column would land on a narrower control below it whose
    // centre happens to sit further left.
    const clear = horizontal
      ? (sign > 0 ? to.left >= from.right - 4 : to.right <= from.left + 4)
      : (sign > 0 ? to.top >= from.bottom - 4 : to.bottom <= from.top + 4)
    if (!clear) continue
    // The page header's actions are one Up from the page's first row, not a
    // step sideways from anywhere in it: Left and Right leave the row for them
    // (or come out of them) only when they are level with it. Otherwise Right
    // from the Configurations list reached Import, above, instead of the
    // selected configuration's actions beside it.
    if (horizontal && Boolean(candidate.closest('.page-header')) !== fromHeader) continue
    // Nor does a step sideways pass rows of this column on the way: Left from
    // a left-stick row dropped to the right stick's wheel, a section further
    // down, past every row between. Entering a declared column
    // (data-nav-region: a list's detail panel, Home's Studio tiles, the
    // Documentation article) is what the column beside is for, from any row.
    const intoRegion = candidate.closest('[data-nav-region]')
    if (horizontal && (!intoRegion || intoRegion === fromRegion)) {
      const toY = to.top + to.height / 2
      const low = Math.min(y, toY) + 2, high = Math.max(y, toY) - 2
      const passes = candidates.some(other => {
        if (other === current || other === candidate) return false
        const box = boxOf(other), middle = box.top + box.height / 2
        return middle > low && middle < high && Math.min(box.right, from.right) - Math.max(box.left, from.left) > 1
      })
      if (passes) continue
    }
    // Up and Down read the page as rows: the nearest row wins and the sideways
    // gap only breaks ties (the page header's actions are one Up from its
    // first row wherever they sit). Left and Right take the column beside at
    // the height nearest this row: from a Documentation topic, the link level
    // with it rather than whichever link sat furthest left, rows below.
    const score = forward - overlap * (horizontal ? 8 : 0.2)
    if (score < diagonalScore) { diagonalScore = score; diagonal = candidate }
  }
  return straight ?? diagonal
}
