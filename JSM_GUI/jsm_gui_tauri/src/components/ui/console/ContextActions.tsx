import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ButtonGlyph } from '../../glyphs/ButtonGlyph'
import { useShell } from '../../../shell/ShellContext'
import { declaredHints } from '../../../shell/HintCapsule'
import { PAD_EVENT } from '../../../nav/useControllerNavigation'
import styles from './ContextActions.module.css'

// Every control can be pointed at (console v2): whatever the footer offers on X or Y
// for a row ("Hold & double-tap", "Copy · clear · name", "Use Default", "Try it",
// "More"…) a mouse reaches too, by right-clicking the row (and the footer's X / Y
// are buttons). Choosing one does exactly what the pad's button does: the row hears
// the same `jsm:pad` event, or the same key where it answers the keyboard's X / Y.
// There is no hover button: it covered the row's own content.
//
// Mounted once, in App. A row opts in by declaring the actions in data-hints, as it
// already does for the footer; nothing else to do per row.

type Action = { button: 'X' | 'Y'; label: string }

/** The X / Y actions a row declares, with the element that declared them. */
function actionsFor(start: Element | null): { target: HTMLElement; actions: Action[] } | null {
  for (let element = start?.closest<HTMLElement>('[data-hints]') ?? null; element; element = element.parentElement?.closest<HTMLElement>('[data-hints]') ?? null) {
    const actions = declaredHints(element).filter((hint): hint is { button: 'X' | 'Y'; label: string } => hint.button === 'X' || hint.button === 'Y')
    if (actions.length) return { target: element, actions }
  }
  return null
}

/** What a pad's X or Y does to this row: send it the pad event, or the key it answers. */
function perform(target: HTMLElement, button: 'X' | 'Y') {
  const focusable = target.matches('button, summary, input, select, textarea, [tabindex]') ? target : target.querySelector<HTMLElement>('button, summary, [tabindex]') ?? target
  focusable.focus({ preventScroll: true })
  const event = new CustomEvent(PAD_EVENT, { detail: { button }, bubbles: true, cancelable: true })
  const receiver = (document.activeElement as HTMLElement | null) ?? target
  receiver.dispatchEvent(event)
  if (event.defaultPrevented) return
  const keyed = receiver.closest<HTMLElement>('[data-pad-keys]') ?? target.closest<HTMLElement>('[data-pad-keys]')
  if (keyed?.dataset.padKeys?.includes(button)) keyed.dispatchEvent(new KeyboardEvent('keydown', { key: button.toLowerCase(), bubbles: true, cancelable: true }))
}

export function ContextActions() {
  const { family } = useShell()
  const glyphFamily = family === 'generic' ? undefined : family
  const [menu, setMenu] = useState<{ x: number; y: number; target: HTMLElement; actions: Action[] } | null>(null)

  useEffect(() => {
    const onContext = (event: MouseEvent) => {
      const found = actionsFor(event.target instanceof Element ? event.target : null)
      if (!found || (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]'))) return
      event.preventDefault()
      setMenu({ x: Math.min(event.clientX, window.innerWidth - 260), y: Math.min(event.clientY, window.innerHeight - 40 - found.actions.length * 44), target: found.target, actions: found.actions })
    }
    const onScroll = () => setMenu(null)
    window.addEventListener('contextmenu', onContext)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('contextmenu', onContext)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [])

  // The open menu closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!menu) return
    const close = (event: Event) => { if (!(event.target instanceof Element && event.target.closest('[data-context-actions]'))) setMenu(null) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMenu(null) } }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', onKey, true) }
  }, [menu])

  if (!menu) return null
  return createPortal(
    <div className={styles.menu} role="menu" data-context-actions="" style={{ left: menu.x, top: menu.y }} aria-label="Row actions">
      {menu.actions.map(action => (
        <button key={action.button} type="button" role="menuitem" className={styles.item}
          onClick={() => { const { target } = menu; setMenu(null); perform(target, action.button) }}>
          <ButtonGlyph button={action.button} size={22} family={glyphFamily} />
          <span>{action.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  )
}
