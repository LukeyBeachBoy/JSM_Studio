import { useContext, useEffect, useMemo, useRef, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react'
import { Sheet } from '../ui/Sheet'
import { OpenRow } from '../ui/console'
import { SubPage } from '../ui/console'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { getKeymapValue, removeKeymapEntry } from '../../utils/keymap'
import { writeVirtualSetting } from '../../utils/virtualStickSettings'
import { layerEntries } from '../../utils/layers'
import { SettingOrigins } from '../SettingOrigin'
import { setInputSide, type InputSide, type InputSidePage } from './inputSide'
import styles from './P4.module.css'

// Pieces the Sticks, Triggers and Trackpads pages share (console v2, P4).

export type SetText = Dispatch<SetStateAction<string>>

/** A number from the configuration, or the fallback when it is unset or not a number. */
export function readNumber(text: string, key: string, fallback: number, index = 0) {
  const raw = getKeymapValue(text, key)
  const value = Number.parseFloat((raw ?? '').trim().split(/\s+/)[index] ?? '')
  return Number.isFinite(value) ? value : fallback
}

/** The raw value, upper-cased and trimmed ('' when unset). */
export const readWord = (text: string, key: string) => (getKeymapValue(text, key) ?? '').trim().toUpperCase()

/** Is the key set in the configuration (and so a change from the default)? */
export const isSet = (text: string, ...keys: string[]) => keys.some(key => getKeymapValue(text, key) !== undefined)

/** Write one key; '' or null removes it, so the default applies again. */
export function writeKey(setText: SetText | undefined, key: string, value: string | number | null | (string | number)[]) {
  if (!setText) return
  // writeVirtualSetting keeps the line's own note ("# measured guard").
  setText(previous => value === null || value === '' ? removeKeymapEntry(previous, key) : writeVirtualSetting(previous, key, Array.isArray(value) ? value.join(' ') : value))
}

/** Several keys at once, in one undo step. */
export function writeKeys(setText: SetText | undefined, values: Record<string, string | number | null>) {
  if (!setText) return
  setText(previous => Object.entries(values).reduce((next, [key, value]) => value === null || value === '' ? removeKeymapEntry(next, key) : writeVirtualSetting(next, key, value), previous))
}

let inheritedProbe: (key: string) => boolean = () => false

/** A page calls this once: it tells writeChoice which keys a base this
 *  configuration includes (or the Default layer a mode sits on) already sets. */
export function useInheritedKeys() {
  const context = useContext(SettingOrigins)
  const entries = useMemo(() => layerEntries(context.base), [context.base])
  inheritedProbe = key => Object.prototype.hasOwnProperty.call(entries, key)
}

/**
 * Picking a named choice (a preset card, a segment) that is the default. Left
 * alone the line is removed, so the default applies again; but when the base
 * sets that key to something else, removing it would hand the base's value
 * straight back and the choice would do nothing. Then the default is written
 * out. "Use Default" (Y) is a different thing and keeps removing the line.
 */
export function writeChoice(setText: SetText | undefined, values: Record<string, string | number | null>, defaults: Record<string, string | number>) {
  writeKeys(setText, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, (value === null || value === '') && defaults[key] !== undefined && inheritedProbe(key) ? defaults[key] : value])))
}

export const percent = (fraction: number, digits = 0) => `${Number((fraction * 100).toFixed(digits))}%`
export const round = (value: number, digits = 3) => Number(value.toFixed(digits))

/**
 * Y on a front page opens its "More…" menu (console v2: Y always opens a menu
 * of the rest). Rows that answer Y themselves (Use Default on a value row)
 * claim it first; this only hears a Y nothing else took.
 */
export function usePadButton(ref: RefObject<HTMLElement | null>, button: 'X' | 'Y', run: (() => void) | undefined) {
  const latest = useRef(run)
  latest.current = run
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const onPad = (event: Event) => {
      const detail = (event as CustomEvent<PadEventDetail>).detail
      if (detail.button !== button || event.defaultPrevented || !latest.current) return
      event.preventDefault()
      latest.current()
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [ref, button])
}

export type MoreItem = { id: string; label: string; hint?: string; value?: ReactNode; onSelect: () => void; unavailable?: string }

/** The Y menu: a side sheet of rows, each opening something. */
export function MoreMenu({ open, onClose, eyebrow, title, items }: { open: boolean; onClose: () => void; eyebrow: string; title: string; items: MoreItem[] }) {
  return (
    <Sheet open={open} onClose={onClose} eyebrow={eyebrow} title={title} width={520}
      hints={[{ button: 'A', label: 'Open' }, { button: 'B', label: 'Close' }]}>
      <div className={styles.moreList} data-more-menu="">
        {items.map(item => (
          <OpenRow key={item.id} label={item.label} hint={item.hint} value={item.value} disabled={item.unavailable}
            data={{ 'data-more-item': item.id }}
            onOpen={() => { onClose(); requestAnimationFrame(item.onSelect) }} />
        ))}
      </div>
    </Sheet>
  )
}

/** Mode shift for a stick, trigger or pad (D11): the input's own changes
 *  while another button is held, on a sub-page of their own. */
export function WhileHoldingPage({ open, onClose, trail, children }: { open: boolean; onClose: () => void; trail: string[]; children: ReactNode }) {
  return (
    <SubPage open={open} onClose={onClose} trail={trail} title="Mode shift" backLabel={`Back to ${trail[trail.length - 1] ?? 'page'}`}>
      <div className={styles.whileHolding}>
        <p className={styles.lede}>Hold a button and this changes until you let go.</p>
        {children}
      </div>
    </SubPage>
  )
}

let pendingReveal: string | null = null

/** Find an input's real row, on the page or in an open sub-page, and focus it. */
function focusRealRow(command: string) {
  let tries = 30
  const attempt = () => {
    const row = document.querySelector<HTMLElement>(`[data-subpage] [data-input-command="${CSS.escape(command)}"]:not([data-side-proxy]), .main-pane [data-input-command="${CSS.escape(command)}"]:not([data-side-proxy])`)
    if (!row) { if (tries-- > 0) requestAnimationFrame(attempt); return }
    const target = row.matches('details') ? row.querySelector<HTMLElement>(':scope > summary') : row.querySelector<HTMLElement>('button:not([disabled]), summary, [tabindex="0"]') ?? row
    target?.scrollIntoView({ block: 'center' })
    target?.focus({ preventScroll: true })
  }
  requestAnimationFrame(attempt)
}

/**
 * Deep links and press-to-find look for an input's row by `data-input-command`
 * in the page. Only one stick (or trigger, or pad) is drawn at a time, and some
 * inputs live in a sub-page, so each gets an invisible stand-in: focusing it
 * switches the page to that side and opens what holds the input (`reveal`),
 * then moves focus to the real row once it is drawn.
 */
export function InputSideProxies({ page, side, commands, reveal }: { page: InputSidePage; side: InputSide; commands: Record<InputSide, string[]>; reveal?: Record<string, () => void> }) {
  const other: InputSide = side === 'left' ? 'right' : 'left'
  const revealRef = useRef(reveal)
  revealRef.current = reveal
  useEffect(() => {
    if (!pendingReveal) return
    const command = pendingReveal
    pendingReveal = null
    revealRef.current?.[command]?.()
    focusRealRow(command)
  }, [side])
  return (
    <div className={styles.proxies} aria-hidden="true">
      {commands[other].map(command => (
        <button key={command} type="button" tabIndex={-1} aria-label={command} data-nav-skip="" data-input-command={command} data-side-proxy=""
          onFocus={() => { pendingReveal = command; setInputSide(page, other); focusRealRow(command) }} />
      ))}
      {Object.keys(reveal ?? {}).map(command => (
        <button key={command} type="button" tabIndex={-1} aria-label={command} data-nav-skip="" data-input-command={command} data-side-proxy=""
          onFocus={() => { reveal?.[command]?.(); focusRealRow(command) }} />
      ))}
    </div>
  )
}

/** The live chip on a visual: "● live 226 °/s". */
export function LiveChip({ children }: { children: ReactNode }) {
  return <span className={styles.liveChip}><span aria-hidden="true">●</span> {children}</span>
}

/** A live-visual panel: title, chip, the picture, a legend and a caption. */
export function VisualPanel({ title, chip, children, legend, caption }: { title: ReactNode; chip?: ReactNode; children: ReactNode; legend?: { mark: ReactNode; label: ReactNode; detail?: ReactNode }[]; caption?: ReactNode }) {
  return (
    <div className={styles.visual}>
      <header className={styles.visualHead}><b>{title}</b>{chip && <LiveChip>{chip}</LiveChip>}</header>
      <div className={styles.visualArt}>{children}</div>
      {legend && legend.length > 0 && (
        <ul className={styles.legend}>
          {legend.map((item, index) => <li key={index}><span className={styles.legendMark} aria-hidden="true">{item.mark}</span><span><b>{item.label}</b>{item.detail && <small>{item.detail}</small>}</span></li>)}
        </ul>
      )}
      {caption && <p className={styles.visualCaption}>{caption}</p>}
    </div>
  )
}

/** A small sub-heading inside a group ("Speed", "Coming back to centre"). */
export const SubHead = ({ children }: { children: ReactNode }) => <div className={styles.subHead}>{children}</div>

/** A one-line note under a group's rows. */
export const Note = ({ children, tone }: { children: ReactNode; tone?: 'warn' }) => <p className={styles.note} data-tone={tone}>{children}</p>

/**
 * When the rail switches stick, trigger or pad (LT / RT), the page is redrawn
 * for the other side; focus goes to that side's current card, the way it
 * lands on a page's chosen item. Only when focus was on this page already.
 */
export function useFocusCurrentCard(ref: RefObject<HTMLElement | null>, key: string) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const node = ref.current
      const active = document.activeElement
      if (!node || (active && active !== document.body && !node.contains(active))) return
      if (active instanceof HTMLElement && active.matches('[role="radio"][data-current="true"]')) return
      if (active && active !== document.body && !active.matches('[role="radio"]')) return
      node.querySelector<HTMLElement>('[role="radio"][data-current="true"]')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [ref, key])
}
