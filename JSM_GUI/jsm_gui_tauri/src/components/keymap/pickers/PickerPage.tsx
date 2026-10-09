import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { SubPage } from '../../ui/console'
import { ButtonGlyph } from '../../glyphs/ButtonGlyph'
import { InputGlyph } from '../../glyphs/InputGlyph'
import { useShell } from '../../../shell/ShellContext'
import { PAD_EVENT, type PadEventDetail } from '../../../nav/useControllerNavigation'
import type { Hint } from '../../../shell/hintLabels'
import styles from './Pickers.module.css'

// One full-screen picker (console v2: KeyPicker, PickerFamily, ControllerActions*,
// IconPicker), built on the kit's SubPage so the footer, the focus trap, B and
// LT / RT behave as on every other sub-page. The picker draws its own header in
// the body (SubPage `bare`): the input's glyph, "A button · Press sends", the
// title, and on the right the one extra way in ("Or press it on a real
// keyboard [X]", "Search every action [Y]"). Groups sit under it and step with
// LT / RT; the content and an optional aside fill the rest.

export type PickerGroup = { id: string; label: string; count?: string | number }

type PickerPageProps = {
  onClose: () => void
  /** The input being bound (a JSM name), drawn as its glyph. */
  input?: string
  /** A picture instead of the input's glyph (the icon picker's item). */
  lead?: ReactNode
  eyebrow: string
  title: string
  /** The footer's left side: "Wardogs · A button · Press". */
  where: string
  headerAction?: { label: string; /** The footer's word for it: "Listen for a key", "Search". */ hint: string; button: 'X' | 'Y'; icon: ReactNode; onPress: () => void }
  groups?: PickerGroup[]
  group?: string
  onGroup?: (id: string) => void
  /** What LT / RT step: "Group", "Category", "Xbox or DS4". */
  stepLabel?: string
  /** Right of the group tabs ("Thousands of game icons · showing the first 160"). */
  groupNote?: ReactNode
  aside?: ReactNode
  /** The aside's width; 380 by default (ControllerActions), 340 for icons. */
  asideWidth?: number
  /** X, Y, MENU and the other buttons the page answers itself; true claims it. */
  onPad?: (button: string) => boolean
  hints?: Hint[]
  backLabel?: string
  /** data-picker on the page, for tests and the playground. */
  kind: string
  children: ReactNode
}

export function PickerPage({ onClose, input, lead, eyebrow, title, where, headerAction, groups, group, onGroup, stepLabel, groupNote, aside, asideWidth = 380, onPad, hints, backLabel, kind, children }: PickerPageProps) {
  const { family } = useShell()
  const root = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const latest = useRef(onPad)
  latest.current = onPad
  const glyphFamily = family === 'generic' ? undefined : family

  // X / Y / Menu reach the page as pad events from whatever has focus inside it
  // (the keyboard's x and y arrive the same way, through the shell's bridge).
  useEffect(() => {
    const node = root.current
    if (!node) return
    const handle = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (latest.current?.(button)) event.preventDefault()
    }
    node.addEventListener(PAD_EVENT, handle)
    return () => node.removeEventListener(PAD_EVENT, handle)
  }, [])

  const step = groups && groups.length > 1 && onGroup ? (direction: -1 | 1) => {
    const at = Math.max(0, groups.findIndex(item => item.id === group))
    onGroup(groups[(at + direction + groups.length) % groups.length].id)
  } : undefined

  // The footer's buttons for the page; a tile names A itself.
  const extra: Hint[] = [
    ...(headerAction ? [{ button: headerAction.button, label: headerAction.hint }] : []),
    ...(hints ?? []),
  ]

  return (
    <SubPage open bare onClose={onClose} trail={[]} title={title} where={where} stepLabel={step ? stepLabel ?? 'Group' : undefined}
      onStep={step ?? (() => {})} hints={extra} backLabel={backLabel}>
      <div ref={root} className={styles.page} data-picker={kind} aria-labelledby={titleId}
        style={{ ['--aside-w' as string]: `${asideWidth}px` }}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          // The keyboard's [ and ] already arrive as LT / RT; PgUp / PgDn do
          // nothing inside a sub-page (D3), so they never reach the page behind.
          if (event.key === 'PageUp' || event.key === 'PageDown') event.preventDefault()
        }}>
        <header className={styles.header}>
          <span className={styles.lead} aria-hidden="true">{lead ?? (input ? <InputGlyph command={input} family={family} size={48} /> : null)}</span>
          <div className={styles.titles}>
            <span className={styles.eyebrow}>{eyebrow}</span>
            <h2 id={titleId} className={styles.title}>{title}</h2>
          </div>
          {headerAction && (
            <button type="button" className={styles.headerAction} tabIndex={-1} onClick={headerAction.onPress} data-nav-skip>
              <span className={styles.headerActionIcon} aria-hidden="true">{headerAction.icon}</span>
              {headerAction.label}
              <ButtonGlyph button={headerAction.button} size={30} family={glyphFamily} />
            </button>
          )}
        </header>
        {groups && groups.length > 1 && (
          <nav className={styles.groups} aria-label={`${title} groups`}>
            <ButtonGlyph button="LT" size={26} family={glyphFamily} className={styles.stepGlyph} />
            {groups.map(item => (
              <button key={item.id} type="button" className={styles.groupTab} data-category={item.id} aria-pressed={item.id === group}
                tabIndex={-1} data-nav-skip onClick={() => onGroup?.(item.id)}>
                {item.label}{item.count !== undefined && <i className={styles.count}>{item.count}</i>}
              </button>
            ))}
            <ButtonGlyph button="RT" size={26} family={glyphFamily} className={styles.stepGlyph} />
            {groupNote && <span className={styles.groupNote}>{groupNote}</span>}
          </nav>
        )}
        <div className={styles.body} data-aside={aside ? 'true' : undefined}>
          <div className={styles.main}>{children}</div>
          {aside && <aside className={styles.aside} aria-live="polite">{aside}</aside>}
        </div>
      </div>
    </SubPage>
  )
}

/** A section header inside a picker: "TURN GYRO ON OR OFF · Wins over the Gyro tab…". */
export function PickerSection({ label, caption, children }: { label: string; caption?: ReactNode; children?: ReactNode }) {
  return (
    <div className={styles.section} data-section={label}>
      <div className={styles.sectionHead}><span className={styles.lbl}>{label}</span>{caption && <span className={styles.sectionCaption}>{caption}</span>}</div>
      {children}
    </div>
  )
}

/** The aside's common parts (ControllerActions*): "Selected", art, name, scope, text. */
export function PickerAside({ eyebrow = 'Selected', art, name, scope, children, note, noteTone }: {
  eyebrow?: string; art?: ReactNode; name: ReactNode; scope?: ReactNode; children?: ReactNode; note?: ReactNode; noteTone?: 'warn' | 'quiet'
}) {
  return (
    <>
      <span className={styles.lbl}>{eyebrow}</span>
      {art && <div className={styles.asideArt}>{art}</div>}
      <div className={styles.asideName}>
        <span className={styles.asideTitle}>{name}</span>
        {scope && <span className={styles.asideScope}>{scope}</span>}
      </div>
      {children}
      {note && <span className={styles.asideNote} data-tone={noteTone ?? 'quiet'}>{note}</span>}
    </>
  )
}

/** Focus the first of `selectors` that exists inside `scope`, after paint. */
export const focusFirst = (scope: HTMLElement | null, ...selectors: string[]) => {
  requestAnimationFrame(() => {
    if (!scope) return
    for (const selector of selectors) {
      const target = scope.querySelector<HTMLElement>(selector)
      if (target) { target.focus({ preventScroll: false }); return }
    }
  })
}

/** Keep focus in the picker's content when its group changes (the old tiles unmount). */
export function useRefocusOn(scope: React.RefObject<HTMLElement | null>, key: unknown, selectors: string[]) {
  const initial = useRef(key)
  const changed = useRef(false)
  useEffect(() => {
    // On open: the current choice, else the first tile. On a group change: the
    // first tile of the new group, so the pad is never left on nothing.
    // (StrictMode runs this twice on mount with the same key: still opening.)
    if (key !== initial.current) changed.current = true
    focusFirst(scope.current, ...(changed.current ? selectors.slice(1) : selectors))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
