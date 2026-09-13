import { settingHelp } from '../utils/settingHelp'
import { HelpButton } from './HelpButton'
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Slider } from './ui/Slider'
import styles from './NumberField.module.css'

export type NumberFieldProps = {
  label: ReactNode
  /** Config text value. '' / undefined means "not set" (placeholder shows the default). */
  value: string | number | undefined | null
  onChange: (value: string) => void
  min?: number
  max?: number
  /** Fine increment; the slider's default step and what arrow keys use in fine mode. */
  step?: number
  /** Coarse increment; defaults to 10x the fine step. */
  coarseStep?: number
  /** Where the slider sits while the value is unset. Falls back to min. */
  defaultValue?: number
  unit?: string
  placeholder?: string
  hint?: ReactNode
  disabled?: boolean
  /** 'stacked' (label row, then slider) or 'inline' (everything on one row, for dense lists). */
  layout?: 'stacked' | 'inline'
  className?: string
  id?: string
}

const toNumber = (value: NumberFieldProps['value']) => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : undefined
}

const decimalsOf = (step: number) => {
  const text = String(step)
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}

const clamp = (value: number, min?: number, max?: number) => {
  let next = value
  if (min !== undefined) next = Math.max(min, next)
  if (max !== undefined) next = Math.min(max, next)
  return next
}

/**
 * The one numeric control: label + right-aligned inline value on the top row,
 * a full-width slider beneath, and a coarse/fine toggle so the slider (and
 * arrow keys) can move in big or small increments. Every numeric setting in
 * the app goes through this so they all look and behave the same, and so a
 * controller mapped to arrow keys can drive them.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  coarseStep,
  defaultValue,
  unit,
  placeholder,
  hint,
  disabled = false,
  layout = 'stacked',
  className = '',
  id,
}: NumberFieldProps) {
  const { t } = useTranslation()
  const help = hint ?? (typeof label === 'string' ? settingHelp(label) : undefined)
  const autoId = useId()
  const inputId = id ?? autoId
  const [coarse, setCoarse] = useState(false)
  const [draft, setDraft] = useState<string>(value === undefined || value === null ? '' : String(value))
  const [editing, setEditing] = useState(false)

  // Keep the text box in sync with upstream changes (slider, other controls),
  // but never clobber what the user is mid-way through typing.
  useEffect(() => {
    if (!editing) setDraft(value === undefined || value === null ? '' : String(value))
  }, [value, editing])

  const fine = step
  const big = coarseStep ?? fine * 10
  const activeStep = coarse ? big : fine
  const decimals = decimalsOf(fine)
  const numeric = toNumber(value)
  const sliderValue = numeric ?? defaultValue ?? min ?? 0
  // Stretch the track to cover a value that came from outside our range (a
  // config file, a calculator dialog). Otherwise the slider clamps it on mount
  // and silently rewrites the user's setting.
  const sliderMin = Math.min(min ?? Math.min(0, sliderValue), sliderValue)
  const sliderMax = Math.max(max ?? Math.max((min ?? 0) + fine * 100, sliderValue), sliderValue)

  const commitNumber = (next: number) => {
    const clamped = clamp(next, sliderMin, sliderMax)
    // Trim a decimal tail ('1.5000' -> '1.5'), but never trailing zeros of a
    // whole number ('18000' must not become '18').
    const text = clamped.toFixed(decimals).replace(/\.(\d*?)0+$/, (_, keep: string) => (keep ? `.${keep}` : ''))
    onChange(text || '0')
  }

  const commitDraft = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed === '') {
      onChange('')
      return
    }
    const parsed = Number.parseFloat(trimmed)
    if (!Number.isFinite(parsed)) {
      setDraft(value === undefined || value === null ? '' : String(value))
      return
    }
    commitNumber(parsed)
  }

  const nudge = (direction: 1 | -1) => {
    const base = numeric ?? defaultValue ?? min ?? 0
    commitNumber(base + direction * activeStep)
  }

  const handleTextKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      nudge(event.key === 'ArrowUp' ? 1 : -1)
    } else if (event.key === 'Enter') {
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      setDraft(value === undefined || value === null ? '' : String(value))
      setEditing(false)
      event.currentTarget.blur()
    }
  }

  return (
    <div
      className={`${styles.field} ${layout === 'inline' ? styles.inline : ''} ${disabled ? styles.disabled : ''} ${className}`.trim()}
      data-capture-ignore="true"
    >
      <div className={styles.head}>
        {/* The help button belongs to the label, not to the row: left on its
            own in a space-between row it drifts out to the middle, away from
            the thing it explains. */}
        <span className={styles.labelGroup}>
          <label className={styles.label} htmlFor={inputId}>
            {label}
          </label>
          {help && <HelpButton title={typeof label === 'string' ? label : 'Setting help'}>{help}</HelpButton>}
        </span>
        <span className={styles.valueWrap}>
          <input
            id={inputId}
            className={styles.valueInput}
            type="text"
            inputMode="decimal"
            value={draft}
            placeholder={placeholder ?? (defaultValue !== undefined ? String(defaultValue) : undefined)}
            disabled={disabled}
            onFocus={(event) => {
              setEditing(true)
              requestAnimationFrame(() => event.target.select())
            }}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={handleTextKey}
            aria-label={typeof label === 'string' ? label : undefined}
          />
          {unit && <span className={styles.unit}>{unit}</span>}
        </span>
      </div>
      <div className={styles.track}>
        <Slider
          className={styles.slider}
          value={sliderValue}
          onValueChange={commitNumber}
          min={sliderMin}
          max={sliderMax}
          step={activeStep}
          disabled={disabled}
          ariaLabel={typeof label === 'string' ? label : undefined}
        />
        <button
          type="button"
          className={`${styles.stepToggle} ${coarse ? styles.stepToggleCoarse : ''}`}
          onClick={() => setCoarse(prev => !prev)}
          disabled={disabled}
          title={coarse ? t('numberField.coarseTitle', { step: big }) : t('numberField.fineTitle', { step: fine })}
          aria-pressed={coarse}
        >
          {coarse ? t('numberField.coarse') : t('numberField.fine')}
        </button>
      </div>

    </div>
  )
}
