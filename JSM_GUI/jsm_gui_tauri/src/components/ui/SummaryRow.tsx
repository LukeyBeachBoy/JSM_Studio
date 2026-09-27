import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../icons/Icon'
import { SettingOrigins } from '../SettingOrigin'
import { useSettingOriginInfo } from '../keymap/settingOriginInfo'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { ConfigBaseline } from '../../hooks/configContext'
import adjustStyles from './SummaryRowAdjust.module.css'

// The summary row (console refinement 1d, §5): label, one line under it, the
// value on the right and a chevron when it opens something. One focusable
// element per row -- no buttons, switches or selects inside it -- so the pad
// stops once per setting. What A does depends on the row:
//
//   onActivate  opens something (a sheet, a view, another page)
//   toggle      flips it
//   adjust      enters adjust mode: Left/Right step the value (or cycle the
//               choices), A keeps it, B puts back where it started
//
// Y is Use Default (the origin's reset, or onUseDefault) and X is What's
// this? (the help text, shown under the row) -- the face buttons that
// replace the inline Reset and "?" buttons rows used to carry.

export type SummaryRowSize = 'sheet' | 'page' | 'settings' | 'tile'

export type RowAdjust =
  | {
      kind: 'number'
      value: number
      min: number
      max: number
      /** The coarse step Left/Right take by default. */
      step: number
      /** X toggles to this while adjusting (Shift+arrow takes one). Defaults
       *  to 1 for a whole-number step and a tenth of the step otherwise. */
      fineStep?: number
      onChange: (value: number) => void
      /** B while adjusting; defaults to writing back the starting value. */
      onRevert?: (start: number) => void
      /** Adjusting ended with the value kept (A, or focus moving on). */
      onCommit?: (value: number) => void
    }
  | {
      kind: 'choice'
      value: string
      options: { value: string; label: string }[]
      onChange: (value: string) => void
      onRevert?: (start: string) => void
      onCommit?: (value: string) => void
    }
  | {
      /** A value the row moves itself (a menu's position): every arrow is its. */
      kind: 'custom'
      onBegin: () => void
      onArrow: (key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => void
      onEnd: (revert: boolean) => void
      /** The right stick while adjusting, per sample (resize). */
      onStick?: (dx: number, dy: number) => void
    }

type SummaryRowProps = {
  label: ReactNode
  /** The second line: what the setting does. Replaced by the origin when the value is not Default. */
  hint?: ReactNode
  /** The JSM key, for the origin line and Use Default. */
  setting?: string
  value?: ReactNode
  /** Numbers read in Geist Mono. */
  mono?: boolean
  size?: SummaryRowSize
  /** Defaults to true when A opens something. */
  chevron?: boolean
  /** A row that unfolds rows under it: the chevron turns down while open. */
  expanded?: boolean
  onActivate?: () => void
  toggle?: { on: boolean; onChange: (next: boolean) => void }
  adjust?: RowAdjust
  /** A bar under the row showing where the value sits, 0..1 (1d). */
  progress?: number
  /** X: What's this? */
  help?: ReactNode
  /** X: a row's own contextual action instead of help (Next region). */
  onX?: { label: string; run: () => void }
  /** Y: overrides the origin's own reset. */
  onUseDefault?: () => void
  /** What Y is called here ("JSM default" on Studio's global settings). */
  defaultLabel?: string
  /** Shown under the row while adjusting (a live meter, per-side values). */
  adjustDetail?: ReactNode
  /** A leading icon (Home tiles, menus). */
  icon?: ReactNode
  disabled?: boolean
  /** Why the row does nothing right now; A says so instead of acting. */
  reason?: string
  /** Extra hints the row declares, before its own. */
  hints?: string
  className?: string
  id?: string
  /** Attributes the shell looks for (data-input-command and friends). */
  data?: Record<`data-${string}`, string | undefined>
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const roundTo = (value: number, step: number) => {
  const digits = Math.max(0, (String(step).split('.')[1] ?? '').length)
  return Number(value.toFixed(digits))
}
const fineStepOf = (adjust: Extract<RowAdjust, { kind: 'number' }>) =>
  adjust.fineStep ?? (Number.isInteger(adjust.step) ? 1 : roundTo(adjust.step / 10, adjust.step / 10))
// What a typed value may contain: digits, one point, a leading minus.
const TYPED_KEY = /^[0-9.,-]$/

/** The origin line (§4 2c): "Overrides FPS Template", "Changed in the
 *  Vehicles layer" or "From FPS Template". A value the configuration simply
 *  sets, with nothing behind it, says nothing: naming the configuration being
 *  edited tells no one anything. */
function useOriginLine(setting?: string): { text: string; tone: 'changed' | 'inherited' } | null {
  const info = useSettingOriginInfo(setting)
  const context = useContext(SettingOrigins)
  if (!info || info.kind === 'own') return null
  if (info.kind === 'override') {
    if (context.layer) return { text: `Changed in the ${context.layer} layer`, tone: 'changed' }
    return { text: info.sourceName ? `Overrides ${info.sourceName}` : 'Overrides the template', tone: 'changed' }
  }
  if (info.kind === 'inherited' && info.sourceName) return { text: `From ${info.sourceName}`, tone: 'inherited' }
  return null
}

export function SummaryRow(props: SummaryRowProps) {
  const {
    label, hint, setting, value, mono, size = 'page', onActivate, toggle, adjust, progress, help,
    onUseDefault, adjustDetail, icon, disabled, reason, className, id, data,
  } = props
  const ref = useRef<HTMLButtonElement>(null)
  const helpId = useId()
  const [adjusting, setAdjusting] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // Adjusting a number: X swaps the coarse step for the fine one, and typing
  // replaces the value outright (Enter or A keeps it, Esc drops the typing).
  const [fine, setFine] = useState(false)
  const [typed, setTyped] = useState<string | null>(null)
  const numberAdjust = adjust?.kind === 'number' ? adjust : undefined
  const fineStep = numberAdjust ? fineStepOf(numberAdjust) : undefined
  const hasFine = numberAdjust !== undefined && fineStep !== undefined && fineStep < numberAdjust.step
  const start = useRef<number | string | null>(null)
  // B puts the configuration back exactly as it was: writing the starting
  // value would turn a setting that was unset (showing its default) into one
  // set to that default, and leave the file dirty for nothing.
  const baseline = useContext(ConfigBaseline)
  const snapshot = useRef<string | null>(null)
  const origin = useOriginLine(setting)
  const info = useSettingOriginInfo(setting)
  const resetToDefault = onUseDefault ?? (info?.canReset && info.reset ? info.reset : undefined)
  const chevron = props.chevron ?? Boolean(onActivate)
  const announce = () => window.dispatchEvent(new Event('jsm:interaction-hint'))

  const beginAdjust = () => {
    if (!adjust) return
    if (adjust.kind === 'custom') { adjust.onBegin(); setAdjusting(true); announce(); return }
    start.current = adjust.value
    snapshot.current = baseline.onChange ? baseline.text : null
    setFine(false)
    setTyped(null)
    setAdjusting(true)
    announce()
  }
  // The typed value, clamped, or undefined while it is not a number yet.
  const typedValue = () => {
    if (typed === null || !numberAdjust) return undefined
    const parsed = Number.parseFloat(typed.replace(',', '.'))
    return Number.isFinite(parsed) ? clamp(parsed, numberAdjust.min, numberAdjust.max) : undefined
  }
  const applyTyped = () => {
    const value = typedValue()
    setTyped(null)
    if (value !== undefined && numberAdjust && value !== numberAdjust.value) numberAdjust.onChange(value)
    return value
  }
  const endAdjust = (revert: boolean) => {
    if (!adjust) return
    if (adjust.kind === 'custom') { adjust.onEnd(revert); setAdjusting(false); announce(); return }
    const kept = !revert && adjust.kind === 'number' ? applyTyped() : (setTyped(null), undefined)
    setFine(false)
    if (revert && start.current !== null && start.current !== adjust.value && !adjust.onRevert && snapshot.current !== null && baseline.onChange) {
      baseline.onChange(snapshot.current)
    } else if (revert && start.current !== null && start.current !== adjust.value) {
      if (adjust.kind === 'number') {
        if (adjust.onRevert) adjust.onRevert(start.current as number); else adjust.onChange(start.current as number)
      } else if (adjust.onRevert) adjust.onRevert(start.current as string); else adjust.onChange(start.current as string)
    } else if (!revert) {
      if (adjust.kind === 'number') adjust.onCommit?.(kept ?? adjust.value)
      else adjust.onCommit?.(adjust.value)
    }
    start.current = null
    snapshot.current = null
    setAdjusting(false)
    announce()
  }
  const stepAdjust = (direction: 1 | -1, fineOnce = false) => {
    if (!adjust || adjust.kind === 'custom') return
    if (adjust.kind === 'number') {
      // An arrow after typing keeps what was typed; the next arrow steps from it.
      if (typed !== null) { applyTyped(); return }
      const step = (fine || fineOnce) && fineStep !== undefined ? fineStep : adjust.step
      const next = roundTo(clamp(adjust.value + direction * step, adjust.min, adjust.max), step)
      if (next !== adjust.value) adjust.onChange(next)
      return
    }
    const index = adjust.options.findIndex(option => option.value === adjust.value)
    const next = adjust.options[clamp((index < 0 ? 0 : index) + direction, 0, adjust.options.length - 1)]
    if (next && next.value !== adjust.value) adjust.onChange(next.value)
  }

  const activate = () => {
    if (disabled || reason) return
    if (adjust) { if (adjusting) endAdjust(false); else beginAdjust(); return }
    if (toggle) { toggle.onChange(!toggle.on); return }
    onActivate?.()
  }
  const secondary = (button: 'X' | 'Y') => {
    if (button === 'X' && adjusting && hasFine) { setFine(value => !value); announce(); return true }
    if (button === 'X' && props.onX) { props.onX.run(); return true }
    if (button === 'X' && help) { setHelpOpen(open => !open); return true }
    if (button === 'Y' && resetToDefault && !disabled) { if (adjusting) endAdjust(false); resetToDefault(); return true }
    return false
  }

  // X and Y from the pad arrive as a jsm:pad event on the focused element.
  const latest = useRef(secondary)
  latest.current = secondary
  const latestAdjust = useRef(adjust)
  latestAdjust.current = adjust
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const onPad = (event: Event) => {
      const button = (event as CustomEvent<PadEventDetail>).detail.button
      if ((button === 'X' || button === 'Y') && latest.current(button)) event.preventDefault()
    }
    // The right stick while a custom value is being adjusted (nav/useControllerNavigation).
    const onStick = (event: Event) => {
      const detail = (event as CustomEvent<{ dx: number; dy: number }>).detail
      const current = latestAdjust.current
      if (current?.kind === 'custom' && current.onStick) { current.onStick(detail.dx, detail.dy); event.preventDefault() }
    }
    element.addEventListener(PAD_EVENT, onPad)
    element.addEventListener('jsm:stick-adjust', onStick)
    return () => { element.removeEventListener(PAD_EVENT, onPad); element.removeEventListener('jsm:stick-adjust', onStick) }
  }, [])

  const choiceLabel = adjust?.kind === 'choice' ? adjust.options.find(option => option.value === adjust.value)?.label : undefined
  const shownValue = typed !== null
    ? <span className={adjustStyles.typed}>{typed}</span>
    : value ?? (toggle ? (toggle.on ? 'On' : 'Off') : choiceLabel ?? (adjust?.kind === 'number' ? String(adjust.value) : undefined))
  // The bar is the 1d fine-tuning look; plain rows (2c, 2e) have none.
  const bar = progress === undefined ? undefined : progress
  // A row that names its own A (Arrange) keeps that name.
  const ownsA = /(^|;)A:/.test(props.hints ?? '')
  const hints = [
    adjusting ? undefined : props.hints,
    props.onX && !adjusting ? `X:${props.onX.label}` : undefined,
    adjusting && hasFine ? `X:${fine ? 'Coarse steps' : 'Fine steps'}` : undefined,
    reason || ownsA ? (adjusting ? 'A:Drop;B:Put back' : undefined) : adjusting ? (typed !== null ? 'A:Keep;B:Clear typing' : 'A:Keep;B:Put back') : adjust ? 'A:Adjust' : toggle ? 'A:Turn on / off' : props.expanded !== undefined ? (props.expanded ? 'A:Fold' : 'A:Unfold') : onActivate ? 'A:Open' : undefined,
    !adjusting && !disabled && resetToDefault ? `Y:${props.defaultLabel ?? 'Use Default'}` : undefined,
    !adjusting && help && !props.onX ? `X:${helpOpen ? 'Hide help' : 'What’s this?'}` : undefined,
    // Only when the caller has not named B itself (1h): "A:Bind;B:Back" plus
    // this drew B twice in the capsule.
    adjusting || /(^|;)B:/.test(props.hints ?? '') ? undefined : 'B:Back',
  ].filter(Boolean).join(';')

  return (
    <div className={`summary-row-wrap${className ? ` ${className}` : ''}`} data-size={size}>
      <button
        ref={ref}
        type="button"
        id={id}
        className="summary-row"
        data-size={size}
        data-adjusting={adjusting ? 'true' : undefined}
        data-stick-adjust={adjust?.kind === 'custom' && adjust.onStick ? 'true' : undefined}
        aria-expanded={props.expanded}
        data-hints={hints}
        data-reason={reason}
        aria-disabled={disabled || reason ? true : undefined}
        aria-pressed={toggle ? toggle.on : undefined}
        aria-describedby={helpOpen ? helpId : undefined}
        {...data}
        onClick={activate}
        onBlur={() => { if (adjusting) endAdjust(false) }}
        onKeyDown={event => {
          if (adjusting && adjust?.kind === 'custom') {
            if (event.key.startsWith('Arrow')) { event.preventDefault(); event.stopPropagation(); adjust.onArrow(event.key as 'ArrowUp'); return }
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); endAdjust(true); return }
          }
          // Typing a number on a number row enters it exactly, adjusting or not.
          if (numberAdjust && !disabled && !reason && !event.ctrlKey && !event.metaKey && !event.altKey) {
            if (TYPED_KEY.test(event.key)) {
              event.preventDefault(); event.stopPropagation()
              if (!adjusting) beginAdjust()
              setTyped(previous => (previous ?? '') + event.key)
              return
            }
            if (adjusting && event.key === 'Backspace') {
              event.preventDefault(); event.stopPropagation()
              setTyped(previous => (previous ?? String(numberAdjust.value)).slice(0, -1))
              return
            }
            if (adjusting && event.key === 'Escape' && typed !== null) {
              event.preventDefault(); event.stopPropagation()
              setTyped(null)
              return
            }
          }
          if (adjusting) {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault(); event.stopPropagation()
              stepAdjust(event.key === 'ArrowRight' ? 1 : -1, event.shiftKey)
              return
            }
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); endAdjust(true); return }
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') endAdjust(false)
          }
          if (event.ctrlKey || event.metaKey || event.altKey) return
          const key = event.key.toLowerCase()
          if ((key === 'x' || key === 'y') && secondary(key.toUpperCase() as 'X' | 'Y')) event.preventDefault()
        }}
      >
        {icon && <span className="summary-row__icon" aria-hidden="true">{icon}</span>}
        <span className="summary-row__text">
          <span className="summary-row__label">{label}</span>
          {origin
            ? <span className="summary-row__hint" data-tone={origin.tone}>{origin.text}</span>
            : hint && <span className="summary-row__hint">{hint}</span>}
        </span>
        {shownValue !== undefined && shownValue !== '' && (
          <span className="summary-row__value" data-mono={mono ? 'true' : undefined}>
            {adjusting && adjust?.kind !== 'custom' && <span className="summary-row__step" aria-hidden="true"
              onPointerDown={event => { event.preventDefault(); stepAdjust(-1) }} onClick={event => event.stopPropagation()}><Icon name="chevronDown" size={14} /></span>}
            {shownValue}
            {adjusting && adjust?.kind !== 'custom' && <span className="summary-row__step summary-row__step--next" aria-hidden="true"
              onPointerDown={event => { event.preventDefault(); stepAdjust(1) }} onClick={event => event.stopPropagation()}><Icon name="chevronDown" size={14} /></span>}
          </span>
        )}
        {chevron && <span className="summary-row__chevron" data-open={props.expanded ? 'true' : undefined} aria-hidden="true"><Icon name="chevronRight" size={18} /></span>}
        {bar !== undefined && (
          <span className="summary-row__bar" aria-hidden="true"><span style={{ width: `${clamp(bar, 0, 1) * 100}%` }} /></span>
        )}
      </button>
      {adjusting && adjustDetail && <div className="summary-row__detail">{adjustDetail}</div>}
      {adjusting && numberAdjust && (
        <div className={adjustStyles.caption} aria-live="polite">
          {hasFine && <span className={adjustStyles.stepSize} data-fine={fine ? 'true' : undefined}>{fine ? 'Fine' : 'Coarse'} steps of {fine ? fineStep : numberAdjust.step}</span>}
          <span className={adjustStyles.typeHint}>{typed !== null ? `Enter keeps ${typed || '…'} · Esc clears` : 'Type a number to set it exactly'}{hasFine && typed === null ? ' · Shift+arrow for one fine step' : ''}</span>
        </div>
      )}
      {helpOpen && help && <div id={helpId} className="summary-row__help" role="note">{help}</div>}
    </div>
  )
}

/**
 * A row that unfolds the rows it summarises beneath it (the sub-list 2e
 * opens on A, in place of an always-visible row of tiles). B inside the
 * unfolded rows folds them and returns to the row, rather than closing the
 * sheet around them.
 */
export function ExpandRow(props: Omit<SummaryRowProps, 'onActivate' | 'expanded' | 'toggle' | 'adjust'> & { children: ReactNode; defaultOpen?: boolean }) {
  const { children, defaultOpen = false, ...row } = props
  const [open, setOpen] = useState(defaultOpen)
  const wrap = useRef<HTMLDivElement>(null)
  const fold = () => {
    setOpen(false)
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLElement>(':scope > .summary-row-wrap > .summary-row')?.focus())
  }
  return (
    <div ref={wrap} className="expand-row">
      <SummaryRow {...row} expanded={open} onActivate={() => setOpen(value => !value)} />
      {open && (
        <div className="expand-row__children" onKeyDown={event => {
          if (event.key !== 'Escape' || event.defaultPrevented) return
          event.preventDefault()
          event.stopPropagation()
          fold()
        }}>{children}</div>
      )}
    </div>
  )
}

/** An eyebrow over a group of rows (§5: 11px, .12em, 600, text-3, uppercase). */
export function RowGroup({ title, children, aside }: { title?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="row-group">
      {title && <div className="row-group__title"><span className="eyebrow">{title}</span>{aside && <span className="row-group__aside">{aside}</span>}</div>}
      <div className="row-group__rows">{children}</div>
    </div>
  )
}
