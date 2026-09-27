import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from '../icons/Icon'
import styles from './Lane.module.css'

// The open binding card's lanes (binding card refresh 3c): Commands,
// Modeshifts and Layer actions, each a tinted panel in its concept's colour
// with a header, its rows and one add button. An empty lane is its header and
// add button only.

export type Concept = 'command' | 'shift' | 'layer'

const ICONS: Record<Concept, IconName> = { command: 'command', shift: 'modeshift', layer: 'layer' }

type LaneProps = {
  concept: Concept
  label: string
  count: number
  /** The rows, one per command, shift or layer action. */
  children?: ReactNode
  /** The add buttons under the rows. */
  footer?: ReactNode
  /** Commands lane: Add command and Capture a key side by side. */
  twoUpFooter?: boolean
}

export function Lane({ concept, label, count, children, footer, twoUpFooter }: LaneProps) {
  return (
    <section className={styles.lane} data-concept={concept} aria-label={label}>
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true"><Icon name={ICONS[concept]} size={16} /></span>
        <span className={styles.label}>{label}</span>
        {count > 0 && <span className={styles.count}>{count}</span>}
      </header>
      {children}
      {footer && <div className={twoUpFooter ? styles.footerTwoUp : styles.footer}>{footer}</div>}
    </section>
  )
}

type AddButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  'data-pad-keys'?: string
  concept: Concept
  label: string
  hints: string
}

/** "+ Add command": a console button with a solid "+" cap in the lane's colour. */
export const LaneAddButton = forwardRef<HTMLButtonElement, AddButtonProps>(function LaneAddButton({ concept, label, hints, ...rest }, ref) {
  // Rest props, so the button can be a menu's trigger (Radix merges its own).
  return (
    <button ref={ref} type="button" {...rest} className={styles.add} data-concept={concept} data-hints={hints}>
      <span className={styles.addCap} aria-hidden="true">+</span>
      {label}
    </button>
  )
})

/** The lane's neutral console button beside Add: "Capture a key" with its glyph. */
export function LaneSideButton({ glyph, label, onClick, hints }: { glyph: ReactNode; label: string; onClick: () => void; hints: string }) {
  return (
    <button type="button" className={styles.side} onClick={onClick} data-hints={hints}>
      {glyph}
      {label}
    </button>
  )
}

/** Shared row styles, for the rows each lane draws. */
export const laneStyles = styles

/**
 * After any add (2f): the new row keeps focus and glows in its lane's colour
 * for a moment. Call `expect()` just before the write; the first id that was
 * not there before is the new row, focused through `focusSelector`.
 */
export function useJustAdded(ids: string[], focusSelector: (id: string) => string) {
  const before = useRef<Set<string> | null>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const key = ids.join('|')
  useEffect(() => {
    if (!before.current) return
    const fresh = ids.find(id => !before.current!.has(id))
    if (!fresh) return
    before.current = null
    setJustAdded(fresh)
    requestAnimationFrame(() => {
      const target = [...document.querySelectorAll<HTMLElement>(focusSelector(fresh))].find(element => element.offsetParent !== null)
      target?.focus()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  // The grow (160ms) and the glow fading over 900ms.
  useEffect(() => {
    if (!justAdded) return
    const timer = setTimeout(() => setJustAdded(null), 1100)
    return () => clearTimeout(timer)
  }, [justAdded])
  return { justAdded, expect: () => { before.current = new Set(ids) } }
}
