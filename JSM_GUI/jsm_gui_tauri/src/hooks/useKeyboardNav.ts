import { useEffect, useState } from 'react'

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
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false
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

const focusablesIn = (scope: ParentNode) =>
  Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible)

type Options = {
  onPageStep: (delta: 1 | -1) => void
  /** Called on Escape when no dialog is open. Return true if something was closed. */
  onEscape?: () => boolean
}

export function useKeyboardNav({ onPageStep, onEscape }: Options) {
  const [modalOpen, setModalOpen] = useState(false)

  // Track dialogs by watching the DOM rather than threading state through every
  // modal owner. When one opens, put focus inside it so the first D-pad press
  // lands somewhere sensible instead of behind the overlay.
  useEffect(() => {
    let lastOverlay: HTMLElement | null = null
    const update = () => {
      const overlay = topmostOverlay()
      setModalOpen(Boolean(overlay))
      if (overlay && overlay !== lastOverlay) {
        const active = document.activeElement as HTMLElement | null
        if (!active || !overlay.contains(active)) {
          const first = focusablesIn(overlay).find(element => !element.classList.contains('ghost-btn')) ?? focusablesIn(overlay)[0]
          first?.focus({ preventScroll: true })
        }
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
          if (isTextEntry) return
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
          if (isTextEntry || usesArrowsNatively) return
          const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight'
          const scope: ParentNode = topmostOverlay() ?? document
          const focusables = focusablesIn(scope)
          if (!focusables.length) return
          const current = document.activeElement as HTMLElement | null
          const index = current ? focusables.indexOf(current) : -1
          const next =
            index < 0
              ? focusables[0]
              : focusables[(index + (forward ? 1 : -1) + focusables.length) % focusables.length]
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
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onPageStep, onEscape])

  return { modalOpen }
}
