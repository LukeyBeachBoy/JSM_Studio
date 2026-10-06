import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import keymapStyles from '../Keymap.module.css'
import styles from './LightBarPicker.module.css'
import { LightBarPopover } from './LightBarPopover'
import { LIGHT_BAR_PRESETS, normalizeHex } from './lightBarColor'

type Props = {
  /** "#rrggbb" or null for JoyShockMapper's default. */
  value: string | null
  onChange: (color: string | null) => void
  disabled?: boolean
  allowClear?: boolean
  defaultColor?: string
}

const PencilGlyph = () => (
  <svg className={styles.pencil} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 13l.8-3.2L10.6 3l2.4 2.4-6.8 6.8L3 13z" />
    <path d="M9.4 4.2l2.4 2.4" />
  </svg>
)

/**
 * A row of preset swatches plus one "custom" swatch (TODO-47). The presets
 * are a radiogroup the pad walks with Left/Right and picks with A; nothing
 * else shows until the custom swatch opens the popover with the wall, the
 * sliders and the hex field. A custom colour then collapses back into that
 * swatch, which shows the colour and a pencil, and reopens the editor.
 */
export function LightBarPicker({ value, onChange, disabled, allowClear = true, defaultColor = '#ffffff' }: Props) {
  const { t } = useTranslation()
  const current = value ? value.toLowerCase() : null
  const effective = normalizeHex(current ?? defaultColor) ?? '#ffffff'
  const preset = LIGHT_BAR_PRESETS.find(entry => entry.hex === effective)
  const [open, setOpen] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const customRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  const close = () => {
    setOpen(false)
    customRef.current?.focus({ preventScroll: true })
  }
  const customLabel = t('keymap.lightBarCustom', 'Custom')
  return (
    <div className={keymapStyles.lightBarPicker} data-capture-ignore="true">
      <div ref={rowRef} className={keymapStyles.lightBarSwatches} role="radiogroup" aria-label={t('keymap.lightBarColor')}>
        {LIGHT_BAR_PRESETS.map(entry => (
          <button
            key={entry.hex}
            type="button"
            role="radio"
            aria-checked={effective === entry.hex}
            aria-label={entry.name}
            title={entry.name}
            className={keymapStyles.lightBarSwatch}
            style={{ background: entry.hex }}
            disabled={disabled}
            data-hints="A:Choose colour;B:Back"
            onClick={() => onChange(entry.hex)}
          />
        ))}
        <button
          ref={customRef}
          type="button"
          role="radio"
          aria-checked={!preset}
          aria-label={customLabel}
          title={preset ? customLabel : `${customLabel} ${effective}`}
          className={`${keymapStyles.lightBarSwatch} ${styles.custom}`}
          style={preset ? undefined : { background: effective }}
          disabled={disabled}
          data-color-custom
          data-color={preset ? undefined : effective}
          data-open={open ? 'true' : undefined}
          data-hints={preset ? 'A:Custom colour;B:Back' : 'A:Edit colour;B:Back'}
          onClick={() => setOpen(true)}
        >
          {preset ? <span className={styles.plus} aria-hidden="true">+</span> : <PencilGlyph />}
        </button>
      </div>
      {allowClear && current && (
        <button type="button" className={keymapStyles.lightBarClearBtn} disabled={disabled} onClick={() => onChange(null)} data-hints="A:Use default;B:Back">
          Use default color
        </button>
      )}
      {open && !disabled && (
        <LightBarPopover anchor={rowRef.current} color={effective} onChange={onChange} onClose={close} />
      )}
    </div>
  )
}
