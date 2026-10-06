import { useTranslation } from 'react-i18next'
import { HAPTIC_EFFECT_CHOICES, type HapticEffect } from '../../utils/hapticBindings'
import { AppSelect } from './AppSelect'

type Props = {
  value: HapticEffect | 'AUTOMATIC'
  disabled?: boolean
  ariaLabel?: string
  includeAdaptive?: boolean
  adaptiveLabel?: string
  onChange: (effect: HapticEffect | 'AUTOMATIC') => void
}

// Share the firmware effect list and labels with the binding output picker.
export function HapticEffectSelect({ value, disabled, ariaLabel, includeAdaptive, adaptiveLabel = "Adaptive (grips)", onChange }: Props) {
  const { t } = useTranslation()
  return <AppSelect className="app-select" aria-label={ariaLabel} value={value} disabled={disabled} onChange={event => onChange(event.target.value as Props['value'])}>
    {includeAdaptive && <option value="AUTOMATIC">{adaptiveLabel}</option>}
    {HAPTIC_EFFECT_CHOICES.map(effect => <option key={effect} value={effect}>{t(`keymap.hapticEffect_${effect}`)}</option>)}
    {value !== 'AUTOMATIC' && !HAPTIC_EFFECT_CHOICES.some(effect => effect === value) && <option value={value} disabled>{t(`keymap.hapticEffect_${value}`)} (imported)</option>}
  </AppSelect>
}
