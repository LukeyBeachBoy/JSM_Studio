import type { Dispatch, SetStateAction } from 'react'
import { ExpandRow, SummaryRow } from './ui/SummaryRow'
import { SettingPrefix } from './SettingOrigin'
import { TRIGGER_EFFECTS, defaultTriggerEffect, parseTriggerEffect, readTriggerCalibration, triggerEffectProblem, writeTriggerEffect, type TriggerEffectMode } from '../utils/adaptiveTriggers'
import { readVirtualSetting, writeVirtualSetting } from '../utils/virtualStickSettings'

export function AdaptiveTriggerEditor({ text, setText, side, disabled }: { text: string; setText: Dispatch<SetStateAction<string>>; side: 'LEFT' | 'RIGHT'; disabled?: boolean }) {
  const key = side + '_TRIGGER_EFFECT'
  const raw = readVirtualSetting(text, key)
  const effect = parseTriggerEffect(raw)
  const meta = effect && TRIGGER_EFFECTS[effect.mode]
  const problem = effect && triggerEffectProblem(effect)
  return <ExpandRow label={`${side === 'LEFT' ? 'Left' : 'Right'} adaptive effect`} setting={key} value={meta ? meta.label : 'Imported effect'} hint="DualSense resistance and pulses" help="Effects apply only to DualSense hardware. Choose Automatic resistance for JSM’s digital-threshold feedback; custom effects override that behaviour. Left and right are independent.">
    <SummaryRow setting={key} label="Effect" value={meta ? meta.label : raw} disabled={disabled}
      adjust={{ kind: 'choice', value: effect?.mode ?? '', options: Object.entries(TRIGGER_EFFECTS).map(([value, definition]) => ({ value, label: definition.label, description: definition.help })), onChange: value => setText(previous => writeTriggerEffect(previous, side, defaultTriggerEffect(value as TriggerEffectMode))) }} />
    {meta && <p>{meta.help}</p>}
    {(!effect || problem) && <p role="status">{problem ?? 'This imported effect is preserved. Choose a supported effect to edit its parameters.'}</p>}
    {effect && meta && meta.fields.map((field, index) => <SummaryRow key={index} setting={key} label={field.label} value={`${effect.values[index]}${'unit' in field ? field.unit : ''}`} disabled={disabled}
      adjust={{ kind: 'number', value: effect.values[index], min: field.min, max: field.max, step: 1,
        onChange: value => setText(previous => writeTriggerEffect(previous, side, { mode: effect.mode, values: effect.values.map((old, i) => i === index ? value : old) })) }} />)}
    <SettingPrefix prefix=""><ExpandRow label="Resistance calibration" hint="Automatic resistance only; applies to the whole profile" value="Start and travel">
      {(['OFFSET', 'RANGE'] as const).map(field => <SummaryRow key={field} setting={side + '_TRIGGER_' + field} label={field === 'OFFSET' ? 'Resistance start offset' : 'Resistance travel range'} value={`${readTriggerCalibration(text, side, field)} / 255`} disabled={disabled}
        help="Native calibration byte value used by automatic resistance. The hardware calibration workflow writes these values; manual adjustment is available here. These calibration variables cannot be changed by a held input."
        adjust={{ kind: 'number', value: readTriggerCalibration(text, side, field), min: 0, max: 255, step: 1, onChange: value => setText(previous => writeVirtualSetting(previous, side + '_TRIGGER_' + field, value)) }} />)}
    </ExpandRow></SettingPrefix>
  </ExpandRow>
}
