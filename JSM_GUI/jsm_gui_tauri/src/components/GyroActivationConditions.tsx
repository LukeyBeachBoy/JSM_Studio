import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { ExpandRow, SummaryRow } from './ui/SummaryRow'
import { SettingPrefix } from './SettingOrigin'
import { InputGlyph } from './glyphs/InputGlyph'
import { buildModifierOptions, resolveModifierOptionLabel } from '../utils/modifierOptions'
import { controllerVisualFamily } from '../utils/controllerStatus'
import { gyroConditions, gyroConditionValue, parseGyroActivation, writeGyroActivation, parseTiltActivation, writeTiltActivation, type GyroCondition } from '../utils/gyroActivation'

export function GyroActivationConditions({ text, setText, prefix = '', source = 'gyro', deviceType, gridCommands = [], disabled }: { text: string; setText: Dispatch<SetStateAction<string>>; prefix?: string; source?: 'gyro' | 'tilt'; deviceType?: number; gridCommands?: string[]; disabled?: boolean }) {
  const { t } = useTranslation()
  const parse = source === 'tilt' ? parseTiltActivation : parseGyroActivation
  const save = source === 'tilt' ? writeTiltActivation : writeGyroActivation
  const current = parse(text, prefix)
  const combined = gyroConditions(current.button)
  const family = controllerVisualFamily(deviceType)
  const inputs = buildModifierOptions(gridCommands.length > 0, gridCommands.length, gridCommands).filter(option => !option.disabled && !['LEFT_STICK', 'RIGHT_STICK', 'NONE'].includes(option.value))
    .map(option => ({ value: option.value, label: resolveModifierOptionLabel(option, t, family).split(/\s+—\s+/)[0] }))
  const enabled = ['hold_on', 'hold_off'].includes(current.mode)
  const write = (match: 'ANY' | 'ALL', conditions: GyroCondition[]) => {
    const value = gyroConditionValue(match, conditions)
    if (value) setText(previous => save(previous, current.mode, value, prefix))
  }
  return <SettingPrefix prefix={prefix}><ExpandRow label={source === 'tilt' ? 'Tilt activation conditions' : 'Activation conditions'} value={combined ? `${combined.match === 'ANY' ? 'Any' : 'All'} of ${combined.conditions.length} inputs` : 'Single input'} hint="Combine touch, Grip Sense and buttons" help="Any activates when one condition matches. All requires every condition. Each input can match while touched/held or while released. The native engine evaluates this; the configurator does not process input.">
    <SummaryRow label="Use several inputs" disabled={disabled || !enabled} hint={enabled ? `${source === 'tilt' ? 'Tilt' : 'Gyro'} enables or suppresses according to these conditions` : 'Choose an activation mode that uses an input first'}
      toggle={{ on: Boolean(combined), onChange: next => {
        if (next) {
          const first = current.button && !['LEFT_STICK', 'RIGHT_STICK'].includes(current.button) ? current.button : 'MISC5'
          write('ANY', [{ input: first, released: false }, { input: first === 'MISC6' ? 'MISC5' : 'MISC6', released: false }])
        }
        else if (combined) setText(previous => save(previous, current.mode, combined.conditions[0].input, prefix))
      } }} />
    {combined && <>
      <SummaryRow label="Conditions required" disabled={disabled} adjust={{ kind: 'choice', value: combined.match, options: [{ value: 'ANY', label: 'Any input' }, { value: 'ALL', label: 'All inputs' }], onChange: match => write(match as 'ANY' | 'ALL', combined.conditions) }} />
      {combined.conditions.map((condition, index) => <div key={index}>
        <SummaryRow label={<><InputGlyph command={condition.input} family={family} size={20} /> Condition {index + 1}</>} disabled={disabled} value={inputs.find(option => option.value === condition.input)?.label ?? condition.input}
          adjust={{ kind: 'choice', value: condition.input, options: inputs, onChange: input => write(combined.match, combined.conditions.map((old, i) => i === index ? { ...old, input } : old)) }} />
        <SummaryRow label={`Condition ${index + 1} matches while`} disabled={disabled} adjust={{ kind: 'choice', value: condition.released ? 'released' : 'held', options: [{ value: 'held', label: 'Touched or held' }, { value: 'released', label: 'Released' }], onChange: value => write(combined.match, combined.conditions.map((old, i) => i === index ? { ...old, released: value === 'released' } : old)) }} />
        <SummaryRow label={`Remove condition ${index + 1}`} disabled={disabled || combined.conditions.length <= 1} onActivate={() => write(combined.match, combined.conditions.filter((_, i) => i !== index))} />
      </div>)}
      <SummaryRow label="Add activation input" disabled={disabled || combined.conditions.length >= 16} onActivate={() => write(combined.match, [...combined.conditions, { input: inputs.find(option => !combined.conditions.some(old => old.input === option.value))?.value ?? 'R3', released: false }])} />
    </>}
  </ExpandRow></SettingPrefix>
}
