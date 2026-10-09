import { useEffect, useRef, type ReactNode } from 'react'
import keymapStyles from '../Keymap.module.css'

/** A list of collapsed binding rows. Console v2 (03) dropped the Extras /
 *  Output column header borrowed from tables: each row says what it does. */
export function BindingList({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  // LT / RT (or [ ], or the rail) stepping to this list's section puts the pad
  // on its first row (UX review 2026-10-09, L2): stepping used to scroll while
  // focus stayed on a row now off-screen, and A opened that one.
  useEffect(() => {
    const onPicked = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      const anchor = root.current?.closest<HTMLElement>('[id^="mapping-section-"]')
      if (!id || !anchor || anchor.id !== id) return
      // Only while the pad is on the list (not inside an open sheet or dialog).
      const active = document.activeElement
      if (active && active !== document.body && !active.closest('.main-pane')) return
      if (active?.closest('[data-focus-trap="true"], .modal-overlay')) return
      const first = root.current?.querySelector<HTMLElement>('details > summary, button:not([disabled]), [tabindex="0"]')
      // After the scroll has landed, so the move reads as one motion.
      window.setTimeout(() => { if (first?.isConnected) first.focus({ preventScroll: true }) }, 60)
    }
    window.addEventListener('jsm:section-picked', onPicked)
    return () => window.removeEventListener('jsm:section-picked', onPicked)
  }, [])
  return (
    <div ref={root} className={keymapStyles.bindingColumnsWrap}>
      <div className={keymapStyles.keymapGrid}>{children}</div>
    </div>
  )
}
