import { useEffect, useRef, useState } from 'react'

// Everything the controller can reach once AppNavigation.txt has turned it into
// a keyboard: arrows move focus, Enter activates (native), Escape closes the
// topmost dialog, Page Up/Down switch pages. Kept deliberately DOM-level -- no
// spatial-navigation library, no per-component wiring -- so every page,
// including ones added later, is operable without doing anything special.

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'password', 'number', 'tel'])

const isVisible = (element: HTMLElement) => {
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

const topmostOverlay = () => {
  const overlays = document.querySelectorAll<HTMLElement>('.modal-overlay')
  return overlays.length ? overlays[overlays.length - 1] : null
}

// Radix popovers (Select lists, dropdown menus and their submenus) run their own
// roving focus, typeahead and Escape handling. While one is open this hook keeps
// its hands off the keyboard entirely, or the two would fight over every arrow
// press and focus would jump out of the open list.
const radixPopoverOpen = () => Boolean(document.querySelector('[data-radix-popper-content-wrapper]'))

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

const focusablesIn = (scope: ParentNode) =>
  Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible)

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

export function useKeyboardNav({ onPageStep, onEscape, activePage, contentSelector = '.main-pane' }: Options) {
  const [modalOpen, setModalOpen] = useState(false)
  const skipNextPageFocus = useRef(true)
  const pageFocus = useRef(new Map<unknown, number>())
  const activePageRef = useRef(activePage)
  activePageRef.current = activePage
  useEffect(() => {
    const remember = () => {
      const content = document.querySelector(contentSelector)
      if (!content) return
      const index = focusablesIn(content).indexOf(document.activeElement as HTMLElement)
      if (index >= 0) pageFocus.current.set(activePageRef.current, index)
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [contentSelector])

  // Only react to CHANGES in activePage, not the initial mount -- a fresh
  // launch shouldn't yank focus into the page before anyone has touched a
  // controller.
  useEffect(() => {
    if (skipNextPageFocus.current) {
      skipNextPageFocus.current = false
      return
    }
    const content = document.querySelector<HTMLElement>(contentSelector)
    if (!content) return
    const focusContent = () => {
      const items = focusablesIn(content)
      const first = items[pageFocus.current.get(activePage) ?? 0] ?? items[0]
      first?.focus({ preventScroll: true })
      return Boolean(first)
    }
    if (focusContent()) return
    const observer = new MutationObserver(() => { if (focusContent()) observer.disconnect() })
    observer.observe(content, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [activePage, contentSelector])

  // Track dialogs by watching the DOM rather than threading state through every
  // modal owner. When one opens, put focus inside it so the first D-pad press
  // lands somewhere sensible instead of behind the overlay.
  useEffect(() => {
    let lastOverlay: HTMLElement | null = null
    const returnFocus = new Map<HTMLElement, HTMLElement>()
    const update = () => {
      const overlay = topmostOverlay()
      setModalOpen(Boolean(overlay))
      if (overlay && overlay !== lastOverlay) {
        const active = document.activeElement as HTMLElement | null
        if (active) returnFocus.set(overlay, active)
        if (!active || !overlay.contains(active)) {
          const first = focusablesIn(overlay).find(element => !element.classList.contains('ghost-btn')) ?? focusablesIn(overlay)[0]
          first?.focus({ preventScroll: true })
        }
      }
      if (lastOverlay && !lastOverlay.isConnected) {
        const previous = returnFocus.get(lastOverlay)
        if (previous?.isConnected) previous.focus()
        returnFocus.delete(lastOverlay)
      }
      lastOverlay = overlay
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (radixPopoverOpen()) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const inputType = tag === 'INPUT' ? (target as HTMLInputElement).type : ''
      const isTextEntry =
        (tag === 'INPUT' && TEXT_INPUT_TYPES.has(inputType)) || tag === 'TEXTAREA' || Boolean(target?.isContentEditable)
      // Radix triggers and sliders take arrows themselves: on a closed Select the
      // arrows open the list, and on a slider they step the value.
      const usesArrowsNatively =
        tag === 'SELECT' ||
        inputType === 'range' ||
        inputType === 'radio' ||
        target?.getAttribute('role') === 'combobox' ||
        target?.getAttribute('role') === 'slider' ||
        target?.hasAttribute('aria-haspopup')

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
          if (isTextEntry) { target?.blur(); return }
          const details = target?.closest('details[open]') as HTMLDetailsElement | null
          if (details) { event.preventDefault(); details.open = false; details.querySelector('summary')?.focus(); return }
          if (onEscape?.()) event.preventDefault()
          return
        }
        case 'PageUp':
        case 'PageDown': {
          if (isTextEntry) return
          event.preventDefault()
          onPageStep(event.key === 'PageDown' ? 1 : -1)
          return
        }
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          if ((isTextEntry && inputType !== 'number') || (usesArrowsNatively && (event.key === 'ArrowLeft' || event.key === 'ArrowRight'))) return
          const scope: ParentNode = topmostOverlay() ?? document
          const focusables = focusablesIn(scope)
          if (!focusables.length) return
          const current = document.activeElement as HTMLElement | null
          const next = current && focusables.includes(current)
            ? directionalTarget(current, focusables, event.key)
            : focusables[0]
          if (next) {
            event.preventDefault()
            next.focus()
            next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }
          return
        }
        default:
          return
      }
    }
    const direction = (event: Event) => {
      const current = document.activeElement as HTMLElement
      const next = directionalTarget(current, focusablesIn(topmostOverlay() ?? document), (event as CustomEvent<string>).detail)
      next?.focus(); next?.scrollIntoView({ block: 'nearest' })
    }
    window.addEventListener('jsm:navigate-direction', direction)
    window.addEventListener('keydown', handler)
    return () => { window.removeEventListener('keydown', handler); window.removeEventListener('jsm:navigate-direction', direction) }
  }, [onPageStep, onEscape])

  return { modalOpen }
}

// Prefer candidates in the same visual row/column, then the closest diagonal.
// Never wrap from a page edge to an unrelated control at the opposite edge.
export function directionalTarget(current: HTMLElement, candidates: HTMLElement[], direction: string) {
  const from = current.getBoundingClientRect()
  const horizontal = direction === 'ArrowLeft' || direction === 'ArrowRight'
  const sign = direction === 'ArrowLeft' || direction === 'ArrowUp' ? -1 : 1
  const x = from.left + from.width / 2, y = from.top + from.height / 2
  let best: HTMLElement | undefined, score = Infinity
  for (const candidate of candidates) {
    if (candidate === current) continue
    const to = candidate.getBoundingClientRect()
    const dx = to.left + to.width / 2 - x, dy = to.top + to.height / 2 - y
    const forward = (horizontal ? dx : dy) * sign
    if (forward <= 1) continue
    const cross = Math.abs(horizontal ? dy : dx)
    const overlap = horizontal ? to.top < from.bottom && to.bottom > from.top : to.left < from.right && to.right > from.left
    const distance = forward + cross * 3 + (overlap ? 0 : 1000)
    if (distance < score) { score = distance; best = candidate }
  }
  return best
}
