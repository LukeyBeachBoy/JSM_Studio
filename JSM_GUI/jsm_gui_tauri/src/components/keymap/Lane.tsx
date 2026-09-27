import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from '../icons/Icon'
import { freshId, rowIndex } from './laneRows'
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
  /** The lane's colour where the concept has more than one: a layer lane
   *  wears the colour of the first layer it names. */
  hue?: string
}

export const Lane = forwardRef<HTMLElement, LaneProps>(function Lane({ concept, label, count, children, footer, twoUpFooter, hue }, ref) {
  return (
    <section ref={ref} className={styles.lane} data-concept={concept} aria-label={label} style={hue ? { ['--hue' as string]: hue } : undefined}>
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true"><Icon name={ICONS[concept]} size={16} /></span>
        <span className={styles.label}>{label}</span>
        {count > 0 && <span className={styles.count}>{count}</span>}
      </header>
      {children}
      {footer && <div className={twoUpFooter ? styles.footerTwoUp : styles.footer}>{footer}</div>}
    </section>
  )
})

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
export function LaneSideButton({ glyph, label, onClick, hints, capturing }: { glyph: ReactNode; label: string; onClick: () => void; hints: string; capturing?: boolean }) {
  return (
    <button type="button" className={styles.side} onClick={onClick} data-hints={hints} data-capturing={capturing ? 'true' : undefined} aria-pressed={capturing ? true : undefined}>
      {glyph}
      {label}
    </button>
  )
}

/** Shared row styles, for the rows each lane draws. */
export const laneStyles = styles

/** How long an expected add may take to show up before it is forgotten. */
const EXPECT_TIMEOUT_MS = 1000

/**
 * After any add (2f): the new row keeps focus and glows in its lane's colour
 * for a moment. Call `expect()` just before the write; the first id that was
 * not there before is the new row, focused through `focusSelector`.
 *
 * The expectation lasts for one change of the rows, or a second, whichever
 * comes first. A write that fails, or that replaces a row rather than adding
 * one, must not leave it waiting for the next unrelated change (a layer
 * switch, an undo) and hand that change the glow and the focus.
 */
export function useJustAdded(ids: string[], focusSelector: (id: string) => string) {
  const before = useRef<Set<string> | null>(null)
  const forget = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const key = ids.join('|')
  useEffect(() => {
    if (!before.current) return
    const fresh = freshId(before.current, ids)
    before.current = null
    if (forget.current) { clearTimeout(forget.current); forget.current = null }
    if (!fresh) return
    setJustAdded(fresh)
    requestAnimationFrame(() => {
      const target = [...document.querySelectorAll<HTMLElement>(focusSelector(fresh))].find(element => element.offsetParent !== null)
      target?.focus()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => () => { if (forget.current) clearTimeout(forget.current) }, [])
  // The grow (160ms) and the glow fading over 900ms.
  useEffect(() => {
    if (!justAdded) return
    const timer = setTimeout(() => setJustAdded(null), 1100)
    return () => clearTimeout(timer)
  }, [justAdded])
  const expect = () => {
    before.current = new Set(ids)
    if (forget.current) clearTimeout(forget.current)
    forget.current = setTimeout(() => { before.current = null; forget.current = null }, EXPECT_TIMEOUT_MS)
  }
  return { justAdded, expect }
}

/**
 * Remove a row (2f): it collapses, then the removal is written, then focus
 * goes to the row that took its place, or the lane's Add button when it was
 * the last. Rows are re-keyed by a removal, so this goes by position in the
 * lane, not by element.
 *
 * From a row's sheet, close the sheet first and pass `afterClose`: the shell
 * hands focus back to the row's cog when the sheet leaves the DOM, which
 * must have happened before this moves focus on, or the two moves race and
 * the cog that wins is on the row about to go.
 */
export function removeRow(row: HTMLElement | null | undefined, remove: () => void, options: { afterClose?: boolean } = {}) {
  if (options.afterClose) {
    // The sheet unmounts on the next commit; the focus return is a mutation
    // observer on that. Two frames later both have happened.
    requestAnimationFrame(() => requestAnimationFrame(() => removeRow(row, remove)))
    return
  }
  const lane = row?.closest<HTMLElement>('section[data-concept]')
  if (!row || !lane) { remove(); return }
  const index = rowIndex(lane, row)
  let done = false
  const finish = () => {
    if (done) return
    done = true
    remove()
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // A removal that did not happen leaves the row: show it again.
      if (row.isConnected) delete row.dataset.removing
      const rows = [...lane.querySelectorAll<HTMLElement>('[data-kind]')]
      const target = rows[index] ?? null
      const focusable = target?.querySelector<HTMLElement>('button:not(:disabled)') ?? lane.querySelector<HTMLElement>('button[data-concept]')
      focusable?.focus()
    }))
  }
  row.addEventListener('animationend', finish, { once: true })
  row.dataset.removing = 'true'
  // Reduced motion, or no animation at all: do not wait for one.
  setTimeout(finish, 260)
}
