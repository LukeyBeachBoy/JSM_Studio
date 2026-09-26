import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import keymapStyles from '../Keymap.module.css'

type Props = {
  /** "#rrggbb" or null for JoyShockMapper's default. */
  value: string | null
  onChange: (color: string | null) => void
  disabled?: boolean
}

// A row of presets the pad can walk with Left/Right and pick with A, plus a
// hex field for anything else. The native colour picker was mouse-only.
const PRESETS: { name: string; hex: string }[] = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Red', hex: '#ff3b30' },
  { name: 'Orange', hex: '#ff9500' },
  { name: 'Yellow', hex: '#ffd60a' },
  { name: 'Green', hex: '#34c759' },
  { name: 'Cyan', hex: '#32ade6' },
  { name: 'Blue', hex: '#0a84ff' },
  { name: 'Purple', hex: '#af52de' },
  { name: 'Pink', hex: '#ff2d55' },
]

const normalize = (text: string) => {
  const hex = text.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`
  if (/^[0-9a-f]{3}$/.test(hex)) return `#${hex.split('').map(c => c + c).join('')}`
  return null
}

export function LightBarPicker({ value, onChange, disabled }: Props) {
  const { t } = useTranslation()
  const current = value ? value.toLowerCase() : null
  const [draft, setDraft] = useState(current ? current.slice(1) : '')
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setDraft(current ? current.slice(1) : '') }, [current, editing])
  const commit = () => {
    setEditing(false)
    if (draft.trim() === '') { onChange(null); return }
    const next = normalize(draft)
    if (next) onChange(next)
    else setDraft(current ? current.slice(1) : '')
  }
  return (
    <div className={keymapStyles.lightBarPicker} data-capture-ignore="true">
      <div className={keymapStyles.lightBarSwatches} role="radiogroup" aria-label={t('keymap.lightBarColor')}>
        {PRESETS.map(preset => (
          <button
            key={preset.hex}
            type="button"
            role="radio"
            aria-checked={current === preset.hex}
            aria-label={preset.name}
            title={preset.name}
            className={keymapStyles.lightBarSwatch}
            style={{ background: preset.hex }}
            disabled={disabled}
            data-hints="A:Choose colour;B:Back"
            onClick={() => onChange(current === preset.hex ? null : preset.hex)}
          />
        ))}
      </div>
      <label className={keymapStyles.lightBarHex}>
        <span aria-hidden="true">#</span>
        <input
          type="text"
          inputMode="text"
          maxLength={6}
          value={draft}
          placeholder="ffffff"
          aria-label={t('keymap.lightBarHex', 'Light bar colour, hex')}
          disabled={disabled}
          onFocus={() => setEditing(true)}
          onChange={event => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setDraft(current ? current.slice(1) : ''); event.currentTarget.blur() } }}
        />
      </label>
      {current && (
        <button type="button" className={keymapStyles.lightBarClearBtn} disabled={disabled} onClick={() => onChange(null)} data-hints="A:Use default;B:Back">
          {t('common.clear')}
        </button>
      )}
    </div>
  )
}
