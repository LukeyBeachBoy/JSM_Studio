import type { Dispatch, SetStateAction } from 'react'
import { SummaryRow } from './ui/SummaryRow'
import { modeNumberFields, readModeNumber, writeModeNumber } from '../utils/sourceModeSettings'
import { readVirtualSetting, writeVirtualSetting, VIRTUAL_STICK_FIELDS, writeVirtualStickNumber, type VirtualStickTarget } from '../utils/virtualStickSettings'
import { VirtualStickProbe } from './VirtualStickProbe'

export type SourceModeConfig = { configText?: string; onConfigTextChange?: Dispatch<SetStateAction<string>>; sourceAxisKey?: 'LEFT_STICK_AXIS' | 'RIGHT_STICK_AXIS' }

export function SourceAxisTuning({ configText: text = '', onConfigTextChange: setText, sourceAxisKey, disabled }: SourceModeConfig & { disabled?: boolean }) {
  if (!setText || !sourceAxisKey) return null
  const values = (readVirtualSetting(text, sourceAxisKey) ?? 'STANDARD STANDARD').split(/\s+/)
  if (values.length === 1) values.push(values[0])
  return <>{['Horizontal', 'Vertical'].map((label, index) => <SummaryRow key={label} setting={sourceAxisKey} label={`${label} source direction`} value={values[index] === 'INVERTED' ? 'Inverted' : 'Normal'} disabled={disabled}
    helpDialog help={index === 0
      ? 'Normal preserves left and right. Inverted swaps left and right before the selected source mode processes the physical stick. Left and right sticks can be configured independently.'
      : 'Normal preserves up and down. Inverted swaps up and down before the selected source mode processes the physical stick. Left and right sticks can be configured independently.'}
    adjust={{ kind: 'choice', value: values[index], options: [{ value: 'STANDARD', label: 'Normal' }, { value: 'INVERTED', label: 'Inverted' }], onChange: next => setText(previous => writeVirtualSetting(previous, sourceAxisKey, values.map((value, i) => i === index ? next : value).join(' '))) }} />)}</>
}

export function SourceModeTuning({ mode, configText: text = '', onConfigTextChange: setText, disabled }: SourceModeConfig & { mode: string; disabled?: boolean }) {
  if (!setText) return null
  const target: VirtualStickTarget | null = mode.startsWith('LEFT_') ? 'LEFT_STICK' : mode.startsWith('RIGHT_') ? 'RIGHT_STICK' : null
  const controller = readVirtualSetting(text, 'VIRTUAL_CONTROLLER') ?? 'NONE'
  const choice = (key: string, label: string, help: string, fallback: string, options: { value: string; label: string }[]) => {
    const value = readVirtualSetting(text, key) ?? fallback
    return <SummaryRow key={key} setting={key} label={label} helpDialog help={help} value={options.find(option => option.value === value)?.label ?? value}
      disabled={disabled} adjust={{ kind: 'choice', value, options, onChange: next => setText(previous => writeVirtualSetting(previous, key, next)) }} />
  }
  return <div data-source-mode-tuning={mode}>
    {target && controller === 'NONE' && <p role="status">This mode requires a virtual controller. Enable Xbox or DS4 output in the controller output settings.</p>}
    {mode.includes('_ANGLE_TO_') && <p>Source direction sets one virtual axis. Position around the circle determines output; stick distance controls engagement.</p>}
    {mode.endsWith('_WIND_X') && <p>Rotate the source to accumulate steering on the virtual horizontal axis.</p>}
    {modeNumberFields(mode).map(meta => {
      const value = readModeNumber(text, meta)
      return <SummaryRow key={meta.key + (meta.axis ?? '')} setting={meta.key} label={meta.label} helpDialog help={meta.help} value={`${value}${meta.unit ? ' ' + meta.unit : ''}`}
        disabled={disabled} adjust={{ kind: 'number', value, min: meta.min, max: meta.max, step: meta.step,
          onChange: next => setText(previous => writeModeNumber(previous, meta, next, text)) }} />
    })}
    {mode === 'HYBRID_AIM' && <>
      {choice('RETURN_DEADZONE_IS_ACTIVE', 'Suppress return movement', 'Avoids unwanted aim when returning the source to centre.', 'ON', [{ value: 'ON', label: 'On' }, { value: 'OFF', label: 'Off' }])}
      {choice('EDGE_PUSH_IS_ACTIVE', 'Continuous aim at the edge', 'Keeps the camera turning while holding the source at its outer edge.', 'ON', [{ value: 'ON', label: 'On' }, { value: 'OFF', label: 'Off' }])}
    </>}
    {['FLICK', 'FLICK_ONLY', 'ROTATE_ONLY'].includes(mode) && <>
      {choice('FLICK_STICK_OUTPUT', 'Flick output', 'Send camera turn commands through the mouse or a virtual joystick. Virtual output requires a measured maximum game turn rate.', 'MOUSE', [{ value: 'MOUSE', label: 'Mouse' }, { value: 'LEFT_STICK', label: 'Left virtual stick' }, { value: 'RIGHT_STICK', label: 'Right virtual stick' }])}
      {['LEFT_STICK', 'RIGHT_STICK'].includes(readVirtualSetting(text, 'FLICK_STICK_OUTPUT') ?? '') && <SummaryRow setting="VIRTUAL_STICK_CALIBRATION" label="Maximum game turn rate" value={`${readVirtualSetting(text, 'VIRTUAL_STICK_CALIBRATION') ?? 360} Â°/s`} help="Measured camera speed at full game stick tilt; shared with gyro-to-joystick tuning."
        disabled={disabled} adjust={{ kind: 'number', value: Number(readVirtualSetting(text, 'VIRTUAL_STICK_CALIBRATION') ?? 360), min: 1, max: 20000, step: 30, fineStep: 1, onChange: next => setText(previous => writeVirtualSetting(previous, 'VIRTUAL_STICK_CALIBRATION', next)) }} />}
      {controller === 'NONE' && ['LEFT_STICK', 'RIGHT_STICK'].includes(readVirtualSetting(text, 'FLICK_STICK_OUTPUT') ?? '') && <p role="status">Virtual flick output requires Xbox or DS4 output.</p>}
      {['LEFT_STICK', 'RIGHT_STICK'].includes(readVirtualSetting(text, 'FLICK_STICK_OUTPUT') ?? '') && <VirtualStickProbe text={text} target={readVirtualSetting(text, 'FLICK_STICK_OUTPUT') as VirtualStickTarget} disabled={disabled} setText={setText} />}
    </>}
    {target && ['LEFT_STICK', 'RIGHT_STICK'].includes(mode) && <VirtualStickProbe text={text} target={target} disabled={disabled} setText={setText} />}
    {target && Object.entries(VIRTUAL_STICK_FIELDS).filter(([key]) => !mode.endsWith('_STEER_X') || key !== 'VIRTUAL_SCALE').map(([key, meta]) => {
      const value = Number(readVirtualSetting(text, target + '_' + key) ?? meta.default)
      return <SummaryRow key={key} setting={target + '_' + key} label={meta.label} helpDialog help={meta.help} value={`${Number((value * meta.factor).toFixed(3))}${meta.unit}`} disabled={disabled}
        adjust={{ kind: 'number', value: value * meta.factor, min: meta.min * meta.factor, max: meta.max * meta.factor, step: meta.step * meta.factor,
          onChange: next => setText(previous => writeVirtualStickNumber(previous, target, key as keyof typeof VIRTUAL_STICK_FIELDS, next / meta.factor, text)) }} />
    })}
  </div>
}
