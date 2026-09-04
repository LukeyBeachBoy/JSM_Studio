import { useTranslation } from 'react-i18next'
import keymapStyles from '../Keymap.module.css'
import {
  DEFAULT_HAPTIC_BINDING,
  HAPTIC_EFFECTS,
  HAPTIC_GAIN_MAX,
  HAPTIC_GAIN_MIN,
  HAPTIC_SIDES,
  formatHapticBinding,
  parseHapticBinding,
  type HapticEffect,
  type HapticSide,
} from '../../utils/hapticBindings'

type HapticOutputPickerProps = {
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}

// The three fields the controller actually takes -- which actuator, which
// effect, how loud -- rather than asking anyone to spell HAPTIC_BOTH_TONE_N6.
export function HapticOutputPicker({ value, disabled, onChange }: HapticOutputPickerProps) {
  const { t } = useTranslation()
  const binding = parseHapticBinding(value) ?? DEFAULT_HAPTIC_BINDING

  const update = (patch: Partial<typeof binding>) => {
    onChange(formatHapticBinding({ ...binding, ...patch }))
  }

  return (
    <div className={keymapStyles.hapticPicker} data-capture-ignore="true">
      <label className={keymapStyles.hapticField}>
        <span>{t('keymap.hapticSide')}</span>
        <select
          className="app-select"
          value={binding.side}
          disabled={disabled}
          onChange={(event) => update({ side: event.target.value as HapticSide })}
        >
          {HAPTIC_SIDES.map(side => (
            <option key={side} value={side}>{t(`keymap.hapticSide_${side}`)}</option>
          ))}
        </select>
      </label>

      <label className={keymapStyles.hapticField}>
        <span>{t('keymap.hapticEffect')}</span>
        <select
          className="app-select"
          value={binding.effect}
          disabled={disabled}
          onChange={(event) => update({ effect: event.target.value as HapticEffect })}
        >
          {HAPTIC_EFFECTS.map(effect => (
            <option key={effect} value={effect}>{t(`keymap.hapticEffect_${effect}`)}</option>
          ))}
        </select>
      </label>

      <label className={keymapStyles.hapticField}>
        <span>{t('keymap.hapticGain')}</span>
        <input
          type="number"
          min={HAPTIC_GAIN_MIN}
          max={HAPTIC_GAIN_MAX}
          step={1}
          value={binding.gain}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value)
            update({ gain: Number.isFinite(next) ? next : 0 })
          }}
        />
      </label>

      <p className={keymapStyles.hapticHint}>
        {t('keymap.hapticHint')} <code>{formatHapticBinding(binding)}</code>
      </p>
    </div>
  )
}
