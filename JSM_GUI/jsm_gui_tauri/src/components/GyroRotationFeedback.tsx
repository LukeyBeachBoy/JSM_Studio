import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { SummaryRow } from './ui/SummaryRow'
import { HAPTIC_EFFECT_CHOICES } from '../utils/hapticBindings'
import { previewHaptic } from '../utils/hapticPreview'
import { readVirtualSetting, writeVirtualSetting } from '../utils/virtualStickSettings'

type Props = { text: string; setText: Dispatch<SetStateAction<string>>; prefix: string; deviceType?: number; disabled?: boolean }
export function GyroRotationFeedback({ text, setText, prefix, deviceType, disabled }: Props) {
  const { t } = useTranslation()
  const read = (key: string, fallback: string) => readVirtualSetting(text, key, prefix) ?? fallback
  const strength = Number(read('GYRO_HAPTIC_INTENSITY', '0'))
  const interval = Number(read('GYRO_HAPTIC_INTERVAL', '15'))
  const effect = read('GYRO_HAPTIC_EFFECT', 'TICK')
  const side = read('GYRO_HAPTIC_SIDE', '3')
  const write = (key: string, value: string | number) => setText(previous => writeVirtualSetting(previous, key, value, prefix))
  const effects = HAPTIC_EFFECT_CHOICES.map(value => ({ value: String(value), label: t(`keymap.hapticEffect_${value}`) }))
  if (!effects.some(option => option.value === effect)) effects.push({ value: effect, label: 'Imported firmware effect' })
  return <div data-gyro-rotation-feedback>
    <p className="sheet-note">Feel a pulse as you turn through a chosen angle. Uses the selected aim axes before sensitivity; disabled gyro and trackball coast stay quiet.</p>
    {deviceType !== undefined && deviceType !== 24 && <p role="status">Rotation feedback uses Steam Controller haptic actuators. This controller does not support it.</p>}
    <SummaryRow size="sheet" label="Feedback strength" setting="GYRO_HAPTIC_INTENSITY" disabled={disabled} value={strength > 0 ? `${strength}%` : 'Off'}
      adjust={{ kind: 'number', value: strength, min: 0, max: 100, step: 5, fineStep: 1, onChange: value => write('GYRO_HAPTIC_INTENSITY', value) }} />
    {strength > 0 && <>
      <SummaryRow size="sheet" label="Rotation between pulses" setting="GYRO_HAPTIC_INTERVAL" disabled={disabled} value={`${interval}°`}
        adjust={{ kind: 'number', value: interval, min: 0.1, max: 3600, step: 1, fineStep: 0.1, onChange: value => write('GYRO_HAPTIC_INTERVAL', value) }} />
      <SummaryRow size="sheet" label="Feedback effect" setting="GYRO_HAPTIC_EFFECT" disabled={disabled}
        adjust={{ kind: 'choice', value: effect, options: effects, onChange: value => write('GYRO_HAPTIC_EFFECT', value) }}
        onX={{ label: 'Preview', run: () => previewHaptic(effect, strength, side === '1' ? 'left' : side === '2' ? 'right' : 'both') }} />
      <SummaryRow size="sheet" label="Feedback actuator" setting="GYRO_HAPTIC_SIDE" disabled={disabled}
        adjust={{ kind: 'choice', value: side, options: [{ value: '1', label: 'Left pad' }, { value: '2', label: 'Right pad' }, { value: '3', label: 'Both pads' }], onChange: value => write('GYRO_HAPTIC_SIDE', value) }} />
    </>}
  </div>
}
