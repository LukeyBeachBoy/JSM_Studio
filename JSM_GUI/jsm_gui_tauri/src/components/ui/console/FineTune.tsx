import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { ButtonGlyph } from '../../glyphs/ButtonGlyph'
import { useShell } from '../../../shell/ShellContext'
import { directionalTarget, NAV_SKIP_SELECTOR } from '../../../hooks/useKeyboardNav'
import styles from './FineTune.module.css'

// Fine-tune (console v2, V7: StickFineTuneAim, TriggersFineTune, GyroFineTune,
// TrackpadsFineTune…): a rail of groups, each with a one-line status, and one
// open group of three or four settings beside a live visual. Never a wall of
// settings: the rest of a group sits behind an "Advanced" row in its content.
//
// Use it inside a SubPage with stepLabel "Group" and onStep={step}: LT / RT move
// through the groups and land on the open group's first setting. Moving along
// the rail with the D-pad opens each group as it is reached; A on a rail item
// goes into its settings.

export type FineTuneGroup = {
  id: string
  label: string
  /** The one line under the label: "Default · 360°/s", "Off", "Ignore 15% · full past 90%". */
  status: ReactNode
  /** A third line under the status: what the group holds ("Cutoff speed, fade back in, keep-moving floor"). */
  detail?: ReactNode
  /** The group's status is a change from the default or the base (drawn in the accent). */
  changed?: boolean
  /** Shown as the open group's heading; defaults to the label. */
  title?: string
  description?: ReactNode
  /** The 3–4 settings: ValueRow, SegmentedRow, SummaryRow… */
  content: ReactNode
  /** The live visual beside them (470px column). */
  visual?: ReactNode
}

type FineTuneProps = {
  groups: FineTuneGroup[]
  active: string
  onActive: (id: string) => void
  /** Under the rail: a note that applies to every group ("Speed is shared by both sticks"). */
  railNote?: ReactNode
  /** What LT / RT step, over the rail: "Group" (default) or "Part". */
  railLabel?: string
}

/** The group LT / RT reach from `active`, wrapping. */
export const stepGroup = (groups: { id: string }[], active: string, direction: -1 | 1) => {
  const index = Math.max(0, groups.findIndex(group => group.id === active))
  return groups[(index + direction + groups.length) % groups.length]?.id ?? active
}

const FOCUSABLE = 'button:not([disabled]), [tabindex="0"], input:not([disabled]), select:not([disabled]), summary'

/**
 * The D-pad stays inside the rail, the settings and the visual: a sideways
 * move with nothing that way in here is an edge, not a jump to the sub-page's
 * header chip above (UX review, I12). Up and Down keep to their column
 * (data-nav-region on the rail and the content).
 */
function clampSideways(root: HTMLElement | null, event: KeyboardEvent<HTMLDivElement>) {
  if (!root || event.defaultPrevented || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
  const active = document.activeElement as HTMLElement | null
  if (!active || !root.contains(active) || active.matches('[data-arrows="horizontal"], input, textarea, select')) return
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(item => item.getClientRects().length > 0 && !item.matches(NAV_SKIP_SELECTOR) && !item.closest('[aria-hidden="true"]'))
  if (!directionalTarget(active, items, event.key)) event.preventDefault()
}

export function FineTune({ groups, active, onActive, railNote, railLabel = 'Group' }: FineTuneProps) {
  const { family } = useShell()
  const content = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const open = groups.find(group => group.id === active) ?? groups[0]
  // A group opened from outside the rail (LT / RT) puts focus on its first
  // setting; one reached by moving along the rail leaves focus on the rail.
  const fromRail = useRef(false)
  // On opening, focus goes into the open group's first setting even though the
  // sub-page's focus trap first landed on its rail item.
  const opened = useRef(false)
  useEffect(() => {
    const first = !opened.current
    opened.current = true
    if (fromRail.current) { fromRail.current = false; return }
    const active = document.activeElement
    // Stepped with LT / RT while focus was on the rail: focus follows to the
    // open group's rail item, so the rail, the focused item and the footer agree.
    if (!first && active && rail.current?.contains(active)) {
      rail.current.querySelector<HTMLElement>(`[data-group="${CSS.escape(open?.id ?? '')}"]`)?.focus({ preventScroll: true })
      return
    }
    requestAnimationFrame(() => {
      // Not while another sub-page has been stacked over this one (a link that opens
      // Fine-tune and its Advanced at once): focus belongs to the top one.
      const layer = content.current?.closest('[data-subpage]')
      const layers = document.querySelectorAll('[data-subpage]')
      if (layer && layers[layers.length - 1] !== layer) return
      content.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true })
    })
  }, [open?.id])

  if (!open) return null
  return (
    <div ref={root} className={styles.fineTune} onKeyDown={event => clampSideways(root.current, event)}>
      {/* Each column is its own D-pad region: Down past the last setting stops there
          instead of spilling into the rail (whose onFocus would open that group). */}
      <nav ref={rail} className={styles.rail} aria-label="Groups" data-nav-region="fine-tune-rail">
        <span className={styles.railKeys} aria-hidden="true"><ButtonGlyph button="LT" size={20} family={family === 'generic' ? undefined : family} />{railLabel}<ButtonGlyph button="RT" size={20} family={family === 'generic' ? undefined : family} /></span>
        {groups.map(group => (
          <button key={group.id} type="button" className={styles.group} data-group={group.id} aria-current={group.id === open.id ? 'true' : undefined}
            // A sub-page opened on a given group lands on it, not on the rail's first.
            data-autofocus={group.id === open.id ? '' : undefined}
            data-hints="A:Open;B:Back"
            onFocus={() => { if (group.id !== open.id) { fromRail.current = true; onActive(group.id) } }}
            onClick={() => { if (group.id !== open.id) onActive(group.id); requestAnimationFrame(() => content.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()) }}>
            <span className={styles.groupLabel}>{group.label}</span>
            <span className={styles.groupStatus} data-changed={group.changed ? 'true' : undefined}>{group.status}</span>
            {group.detail && <span className={styles.groupDetail}>{group.detail}</span>}
          </button>
        ))}
        {railNote && <div className={styles.railNote}>{railNote}</div>}
      </nav>
      <section className={styles.panel} data-has-visual={open.visual ? 'true' : undefined} aria-label={open.title ?? open.label}>
        <div ref={content} className={styles.content} data-nav-region="fine-tune-content">
          <header className={styles.heading}>
            <h1>{open.title ?? open.label}</h1>
            {open.description && <p>{open.description}</p>}
          </header>
          <div className={styles.rows}>{open.content}</div>
        </div>
        {open.visual && <aside className={styles.visual}>{open.visual}</aside>}
      </section>
    </div>
  )
}

/** Advanced (StickAdvanced, TriggersAdvanced): two or more parts side by side,
 *  each a small group of its own; LT / RT move between them. */
export type AdvancedPart = { id: string; eyebrow: string; title: string; description?: ReactNode; content: ReactNode }

export function AdvancedParts({ parts, active, onActive }: { parts: AdvancedPart[]; active: string; onActive: (id: string) => void }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = root.current?.querySelector<HTMLElement>(`[data-part="${CSS.escape(active)}"]`)
    if (!node || node.contains(document.activeElement)) return
    requestAnimationFrame(() => node.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true }))
  }, [active])
  return (
    <div ref={root} className={styles.parts} style={{ ['--parts' as string]: Math.min(parts.length, 3) }}>
      {parts.map((part, index) => (
        <section key={part.id} className={styles.part} data-part={part.id} data-current={part.id === active ? 'true' : undefined}
          onFocus={() => { if (part.id !== active) onActive(part.id) }}>
          <div className={styles.partEyebrow}>{index + 1} · {part.eyebrow}</div>
          <h2>{part.title}</h2>
          {part.description && <p>{part.description}</p>}
          <div className={styles.rows}>{part.content}</div>
        </section>
      ))}
    </div>
  )
}
