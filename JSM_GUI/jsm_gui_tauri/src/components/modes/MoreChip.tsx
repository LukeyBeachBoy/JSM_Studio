import type { MouseEvent } from 'react'
import styles from './MoreChip.module.css'

// A small "⋯" in a card's own corner (Layers cards, the Menus rail): the mouse's
// way to the X / Y actions the footer offers the pad. It shows on hover and
// focus, covers no content, and opens the same row menu a right-click does
// (ui/console ContextActions reads the card's data-hints), so there is one list
// of actions, declared once.

type Props = {
  /** What the menu is for, for the screen reader: "More for Vehicles". */
  label: string
  className?: string
}

export function MoreChip({ label, className }: Props) {
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const chip = event.currentTarget
    const box = chip.getBoundingClientRect()
    // Opened from the card the chip belongs to, at the chip, as a right-click there would.
    const card = chip.parentElement?.querySelector<HTMLElement>('[data-hints]') ?? chip
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left, clientY: box.bottom + 4 }))
  }
  return <button type="button" className={`${styles.chip} ${className ?? ''}`.trim()} tabIndex={-1} data-nav-skip aria-label={label} data-caption={label}
    onClick={open} onContextMenu={open} onPointerDown={event => event.stopPropagation()}>⋯</button>
}
