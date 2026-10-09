import { useContext, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useSettingOriginInfo } from '../../keymap/settingOriginInfo'
import { SettingOrigins } from '../../SettingOrigin'
import { PAD_EVENT, type PadEventDetail } from '../../../nav/useControllerNavigation'
import { requestValueEntry } from '../../../nav/textEntry'
import styles from './Rows.module.css'
import { ConfigName } from '../../ConfigName'

// Rows whose value the D-pad changes directly (console v2 Kit: "Whole row is the
// control · Rumble ◂ Medium ▸ · Turn speed 2.3×"). No A-to-start step: Left and
// Right change the value while the row has focus, and the footer says "◂ ▸".
//
//   ValueRow      a number. Shift+arrow (keyboard) is the fine step; A types a
//                 number on the on-screen keyboard; Y is Use Default. `hero`
//                 draws the big value, the Default pill and a bar (Speed).
//   SegmentedRow  a few named choices, all visible ("Quick start · Even ·
//                 Precise centre · Custom"); ◂ ▸ moves between them.
//
// Both read where the value comes from (`setting`, the JSM key) for the
// "Default" pill, "Changed in this mode" and Y's reset, like SummaryRow. X is
// the row's own action when it has one (onX: "Try it", "Feel it").

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const roundTo = (value: number, step: number) => Number(value.toFixed(Math.max(0, (String(step).split('.')[1] ?? '').length)))

/** "Default", "Changed in Vehicles", "From FPS base", or nothing. */
function useOriginTag(setting?: string): { text: string; tone: 'default' | 'changed' | 'inherited' } | null {
  const info = useSettingOriginInfo(setting)
  const context = useContext(SettingOrigins)
  if (!setting) return null
  if (!info || info.kind === 'default') return { text: 'Default', tone: 'default' }
  if (info.kind === 'override') return { text: context.layer ? `Changed in ${context.layer}` : info.sourceName ? `Changed from ${info.sourceName}` : 'Changed', tone: 'changed' }
  if (info.kind === 'inherited') return { text: info.sourceName ? `From ${info.sourceName}` : 'Inherited', tone: 'inherited' }
  // Set in this file with nothing underneath: "Changed", so the chip can be the mouse's reset.
  if (info.kind === 'own') return { text: 'Changed', tone: 'changed' }
  return null
}

type RowAction = { label: string; run: () => void }

/**
 * A row's data-hints: the page's extra hints ("Y:More;LT/RT:Other stick") go
 * before the row's own, so a button the row answers itself (Y is Use Default
 * on a value row) is what the footer names. B comes last: the page's ("B:Layout"
 * on a front), else "Back" -- and nothing inside a sub-page, whose one back
 * label ("Back to Sticks") then reads on every row.
 */
const rowHints = (own: string[], extra: string | undefined, inSubPage: boolean) => {
  const parts = extra ? extra.split(';').filter(Boolean) : []
  const back = parts.find(part => part.startsWith('B:'))
  const claimed = new Set(own.filter(Boolean).map(part => part.split(':')[0]))
  return [...parts.filter(part => !part.startsWith('B:') && !claimed.has(part.split(':')[0])), ...own, back ?? (inSubPage ? '' : 'B:Back')].filter(Boolean).join(';')
}

/** Whether the row sits in a sub-page (ui/console SubPage), whose footer names B itself. */
function useInSubPage(ref: React.RefObject<HTMLElement | null>) {
  const [inside, setInside] = useState(false)
  useEffect(() => { setInside(Boolean(ref.current?.closest('[data-subpage]'))) }, [ref])
  return inside
}

/** A click on a chip, stepper or segment acts on its row and leaves focus on the row (so the footer keeps the row's caption). */
const holdRow = (ref: React.RefObject<HTMLElement | null>) => (event: React.MouseEvent) => { event.preventDefault(); ref.current?.focus({ preventScroll: true }) }

/** The origin tag ("Default", "Changed in Vehicles"): a button that resets the row where there is something to reset. */
function OriginChip({ origin, reset, disabled, hold }: { origin: ReturnType<typeof useOriginTag>; reset?: () => void; disabled?: boolean; hold: (event: React.MouseEvent) => void }) {
  if (!origin) return null
  if (!reset || origin.tone === 'default' || disabled) return <span className={styles.tag} data-tone={origin.tone}>{origin.text}</span>
  return (
    <button type="button" tabIndex={-1} data-nav-skip="" className={`${styles.tag} ${styles.tagButton}`} data-tone={origin.tone} aria-label="Use Default"
      data-hover-text="Use Default" onMouseDown={hold} onClick={reset}>
      <span>{origin.text}</span>
    </button>
  )
}

function useRowPad(ref: React.RefObject<HTMLElement | null>, handlers: { X?: () => boolean; Y?: () => boolean }) {
  const latest = useRef(handlers)
  latest.current = handlers
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const onPad = (event: Event) => {
      const button = (event as CustomEvent<PadEventDetail>).detail.button
      if ((button === 'X' || button === 'Y') && latest.current[button]?.()) event.preventDefault()
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [ref])
}

type ValueRowProps = {
  label: ReactNode
  hint?: ReactNode
  /** The JSM key, for the Default pill and Y's reset. */
  setting?: string
  /** A global value (Settings): the key is only shown with Show config
   *  names; no origin tag or reset from the configuration being edited. */
  global?: boolean
  value: number
  min: number
  max: number
  step: number
  /** Shift+arrow; defaults to a tenth of the step. */
  fineStep?: number
  /** How the value reads: "360°/s", "2.3×", "15%". */
  format?: (value: number) => string
  onChange: (value: number) => void
  /** Y: overrides the origin's reset. */
  onReset?: () => void
  onX?: RowAction
  /** The big variant: large value, pill and bar (StickFineTuneAim "Turn speed"). */
  hero?: boolean
  /** Under the row: "A full push turns you 360° every second." */
  caption?: ReactNode
  disabled?: string
  id?: string
  data?: Record<`data-${string}`, string | undefined>
  /** More hints before B: "LT/RT:Other stick". */
  extraHints?: string
}

export function ValueRow({ label, hint, setting, value, min, max, step, fineStep, format = v => String(v), onChange, onReset, onX, hero, caption, disabled, id, data, extraHints, global }: ValueRowProps) {
  const ref = useRef<HTMLDivElement>(null)
  const hold = holdRow(ref)
  const inSubPage = useInSubPage(ref)
  const info = useSettingOriginInfo(global ? undefined : setting)
  const origin = useOriginTag(global ? undefined : setting)
  const reset = onReset ?? (info?.canReset && info.reset ? info.reset : undefined)
  const fine = fineStep ?? (Number.isInteger(step) ? 1 : roundTo(step / 10, step / 10))
  const move = (direction: 1 | -1, small: boolean) => {
    if (disabled) return
    const by = small ? fine : step
    const next = roundTo(clamp(value + direction * by, min, max), by)
    if (next !== value) onChange(next)
  }
  const type = () => {
    if (disabled) return
    requestValueEntry({
      title: typeof label === 'string' ? label : 'Value', value: String(value), numeric: true,
      hint: `${format(min)} to ${format(max)}`,
      onDone: text => { const parsed = Number.parseFloat(text.replace(',', '.')); if (Number.isFinite(parsed)) onChange(clamp(parsed, min, max)) },
    })
  }
  // With a mouse (console v2: every control can be pointed at): click the value to type
  // it into the row, and click or drag the bar to set it.
  const [typing, setTyping] = useState<string | null>(null)
  const commitTyped = () => {
    if (typing === null) return
    const parsed = Number.parseFloat(typing.replace(',', '.'))
    setTyping(null)
    if (Number.isFinite(parsed)) { const next = clamp(parsed, min, max); if (next !== value) onChange(next) }
  }
  const setFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || max <= min) return
    const box = event.currentTarget.getBoundingClientRect()
    const along = clamp((event.clientX - box.left) / Math.max(1, box.width), 0, 1)
    const next = roundTo(clamp(min + along * (max - min), min, max), fine < step ? fine : step)
    // A bar sets in whole steps unless Shift asks for the fine one.
    const stepped = event.shiftKey ? next : roundTo(clamp(Math.round((next - min) / step) * step + min, min, max), step)
    if (stepped !== value) onChange(stepped)
  }
  useRowPad(ref, { X: onX ? () => { onX.run(); return true } : undefined, Y: reset ? () => { reset(); return true } : undefined })
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); move(event.key === 'ArrowRight' ? 1 : -1, event.shiftKey) }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); type() }
    else if ((event.key === 'y' || event.key === 'Y') && reset) { event.preventDefault(); reset() }
    else if ((event.key === 'x' || event.key === 'X') && onX) { event.preventDefault(); onX.run() }
  }
  const fraction = max > min ? clamp((value - min) / (max - min), 0, 1) : 0
  return (
    <div ref={ref} id={id} className={styles.row} data-hero={hero ? 'true' : undefined} data-arrows="horizontal" tabIndex={0} role="slider"
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={format(value)} aria-disabled={disabled ? 'true' : undefined}
      data-reason={disabled} {...data}
      data-hints={rowHints([`MOVE:Adjust`, 'A:Type a number', onX ? `X:${onX.label}` : '', reset ? 'Y:Use Default' : ''], extraHints, inSubPage)}
      data-caption={typeof caption === 'string' ? caption : typeof hint === 'string' ? hint : undefined}
      onKeyDown={onKeyDown}>
      <div className={styles.main}>
        <span className={styles.labelBlock}>
          <span className={styles.label}>{label}{setting && <ConfigName name={setting} />}</span>
          {hint && <span className={styles.hint}>{hint}</span>}
        </span>
        <span className={styles.valueBlock}>
          <OriginChip origin={origin} reset={reset} disabled={Boolean(disabled)} hold={hold} />
          <button type="button" tabIndex={-1} data-nav-skip="" className={styles.stepper} aria-hidden="true" onMouseDown={hold} onClick={() => move(-1, false)}>◂</button>
          {typing === null
            ? <b className={styles.value} data-clickable={disabled ? undefined : 'true'} title={undefined} data-caption="Click to type a number"
                onClick={() => { if (!disabled) setTyping(String(value)) }}>{format(value)}</b>
            : <input className={styles.valueInput} type="text" inputMode="decimal" aria-label={typeof label === 'string' ? label : 'Value'} autoFocus value={typing}
                onChange={event => setTyping(event.target.value)} onFocus={event => event.currentTarget.select()} onBlur={commitTyped}
                onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); commitTyped(); ref.current?.focus() } else if (event.key === 'Escape') { event.preventDefault(); setTyping(null); ref.current?.focus() } }} />}
          <button type="button" tabIndex={-1} data-nav-skip="" className={styles.stepper} aria-hidden="true" onMouseDown={hold} onClick={() => move(1, false)}>▸</button>
        </span>
      </div>
      {max > min && (
        <div className={styles.bar} data-compact={hero ? undefined : 'true'} aria-hidden="true" data-disabled={disabled ? 'true' : undefined}
          onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); setFromPointer(event) }}
          onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setFromPointer(event) }}>
          <span style={{ width: `${fraction * 100}%` }} />
        </div>
      )}
      {caption && <div className={styles.caption}>{caption}</div>}
    </div>
  )
}

export type Segment = { value: string; label: string; caption?: string }

type SegmentedRowProps = {
  label: ReactNode
  hint?: ReactNode
  setting?: string
  /** A global value (Settings): the key is only shown with Show config
   *  names; no origin tag or reset from the configuration being edited. */
  global?: boolean
  value: string
  options: Segment[]
  onChange: (value: string) => void
  onReset?: () => void
  onX?: RowAction
  disabled?: string
  id?: string
  data?: Record<`data-${string}`, string | undefined>
  /** More hints before B. */
  extraHints?: string
  /** The origin tag, when the choice is made of more than one JSM key (Gyro's
   *  GYRO_ON / GYRO_OFF) and no single `setting` says where it comes from. */
  originTag?: { text: string; tone: 'changed' | 'inherited' } | null
}

export function SegmentedRow({ label, hint, setting, value, options, onChange, onReset, onX, disabled, id, data, extraHints, global, originTag }: SegmentedRowProps) {
  const ref = useRef<HTMLDivElement>(null)
  const hold = holdRow(ref)
  const inSubPage = useInSubPage(ref)
  const info = useSettingOriginInfo(global ? undefined : setting)
  const keyed = useOriginTag(global ? undefined : setting)
  const origin = originTag === undefined ? keyed : originTag
  const reset = onReset ?? (info?.canReset && info.reset ? info.reset : undefined)
  const index = options.findIndex(option => option.value === value)
  const move = (direction: 1 | -1) => {
    if (disabled) return
    const next = options[clamp((index < 0 ? 0 : index) + direction, 0, options.length - 1)]
    if (next && next.value !== value) onChange(next.value)
  }
  useRowPad(ref, { X: onX ? () => { onX.run(); return true } : undefined, Y: reset ? () => { reset(); return true } : undefined })
  const current = options[index]
  return (
    <div ref={ref} id={id} className={styles.row} data-arrows="horizontal" tabIndex={0} role="radiogroup" aria-label={typeof label === 'string' ? label : undefined}
      aria-disabled={disabled ? 'true' : undefined} data-reason={disabled} {...data}
      data-hints={rowHints(['MOVE:Change', onX ? `X:${onX.label}` : '', reset ? 'Y:Use Default' : ''], extraHints, inSubPage)}
      data-caption={current?.caption ?? (typeof hint === 'string' ? hint : undefined)}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); move(event.key === 'ArrowRight' ? 1 : -1) }
        else if ((event.key === 'y' || event.key === 'Y') && reset) { event.preventDefault(); reset() }
        else if ((event.key === 'x' || event.key === 'X') && onX) { event.preventDefault(); onX.run() }
      }}>
      <div className={styles.main}>
        <span className={styles.labelBlock}>
          <span className={styles.label}>{label}{setting && <ConfigName name={setting} />}</span>
          {(current?.caption ?? hint) && <span className={styles.hint}>{current?.caption ?? hint}</span>}
        </span>
        {origin && origin.tone !== 'default' && <OriginChip origin={origin} reset={reset} disabled={Boolean(disabled)} hold={hold} />}
      </div>
      <div className={styles.segments} aria-hidden="true">
        {options.map(option => (
          <button key={option.value} type="button" tabIndex={-1} data-nav-skip="" className={styles.segment} data-current={option.value === value ? 'true' : undefined}
            onMouseDown={hold} onClick={() => { if (!disabled) onChange(option.value) }}>{option.label}</button>
        ))}
      </div>
    </div>
  )
}

/** A row that opens something (a fold row: "While holding another button… · None ▸",
 *  "Fine-tune · Default ▸", "Advanced ▸"). The whole row is the button. */
export function OpenRow({ label, hint, value, onOpen, icon, disabled, id, hints, data, setting }: {
  label: ReactNode; hint?: ReactNode; value?: ReactNode; onOpen: () => void; icon?: ReactNode; disabled?: string; id?: string; hints?: string
  /** The JSM key it sets, shown beside the label with Show config names (V12). */
  setting?: string
  data?: Record<`data-${string}`, string | undefined>
}) {
  const [pressed, setPressed] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const inSubPage = useInSubPage(ref)
  return (
    <button ref={ref} type="button" id={id} className={`${styles.row} ${styles.open}`} aria-disabled={disabled ? 'true' : undefined} data-reason={disabled} {...data}
      data-pressed={pressed ? 'true' : undefined} data-hints={hints ?? rowHints(disabled ? [] : ['A:Open'], undefined, inSubPage)}
      data-caption={typeof hint === 'string' ? hint : undefined}
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
      onClick={() => { if (!disabled) onOpen() }}>
      <div className={styles.main}>
        {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
        <span className={styles.labelBlock}>
          <span className={styles.label}>{label}{setting && <ConfigName name={setting} />}</span>
          {hint && <span className={styles.hint}>{hint}</span>}
        </span>
        <span className={styles.valueBlock}>
          {value !== undefined && <span className={styles.openValue}>{value}</span>}
          <span className={styles.chevron} aria-hidden="true">▸</span>
        </span>
      </div>
    </button>
  )
}

/**
 * A switch row (GyroSteadiness "Steady while clicking", Trackpads "Click
 * required"): the whole row is the switch; A, a click, ◂ or ▸ flip it in one
 * press; Y goes back to the default.
 */
export function SwitchRow({ label, hint, on, onChange, onReset, disabled, setting, id, caption, extraHints, data }: {
  label: ReactNode; hint?: ReactNode; on: boolean; onChange: (next: boolean) => void; onReset?: () => void
  disabled?: string; setting?: string; id?: string; caption?: string
  /** More hints before B: "Y:More;LT/RT:Other pad". */
  extraHints?: string
  data?: Record<`data-${string}`, string | undefined>
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const inSubPage = useInSubPage(ref)
  useRowPad(ref, { Y: onReset ? () => { onReset(); return true } : undefined })
  const flip = () => { if (!disabled) onChange(!on) }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); event.stopPropagation()
      const next = event.key === 'ArrowRight'
      if (!disabled && next !== on) onChange(next)
    } else if ((event.key === 'y' || event.key === 'Y') && onReset) { event.preventDefault(); onReset() }
  }
  return (
    <button ref={ref} type="button" id={id} role="switch" aria-checked={on} className={`${styles.row} ${styles.switchRow}`}
      aria-disabled={disabled ? 'true' : undefined} data-reason={disabled} data-arrows="horizontal" data-setting={setting} {...data}
      data-hints={rowHints(['A:' + (on ? 'Turn off' : 'Turn on'), onReset ? 'Y:Use Default' : ''], extraHints, inSubPage)}
      data-caption={caption ?? (typeof hint === 'string' ? `${typeof label === 'string' ? label : ''} · ${hint}` : undefined)}
      onClick={flip} onKeyDown={onKeyDown}>
      <span className={styles.main}>
        <span className={styles.labelBlock}>
          <span className={styles.label}>{label}{setting && <ConfigName name={setting} />}</span>
          {hint && <span className={styles.hint}>{hint}</span>}
        </span>
        <span className={styles.switch} data-on={on ? 'true' : undefined} aria-hidden="true"><span /></span>
      </span>
    </button>
  )
}
