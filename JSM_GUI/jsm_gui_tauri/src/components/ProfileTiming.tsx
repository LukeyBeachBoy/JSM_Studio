import { useContext, useState, type Dispatch, type SetStateAction } from 'react'
import { AdvancedDisclosure } from './AdvancedDisclosure'
import { SummaryRow } from './ui/SummaryRow'
import { usePreferences } from '../platform/preferenceStore'
import { getKeymapValue } from '../utils/keymap'
import { readVirtualSetting, writeVirtualSetting } from '../utils/virtualStickSettings'
import { timingMilliseconds, type TimingKey } from '../utils/timing'
import { showToast } from '../utils/toast'
import { SettingOrigins } from './SettingOrigin'

const FIELDS: { key: TimingKey; label: string; fallback: number; hint: string; shared: 'holdPressMs' | 'dblPressMs' | 'simPressMs' | 'turboPeriodMs' | 'defaultPollingMs'; chordable: boolean }[] = [
  { key: 'HOLD_PRESS_TIME', label: 'Hold time', fallback: 150, shared: 'holdPressMs', chordable: true, hint: 'Tap becomes hold after this delay; turbo starts here too.' },
  { key: 'DBL_PRESS_WINDOW', label: 'Double-press window', fallback: 150, shared: 'dblPressMs', chordable: true, hint: 'Time allowed for the second press.' },
  { key: 'TURBO_PERIOD', label: 'Turbo interval', fallback: 80, shared: 'turboPeriodMs', chordable: true, hint: 'Time between repeated actions while turbo is held.' },
  { key: 'SIM_PRESS_WINDOW', label: 'Simultaneous-press window', fallback: 50, shared: 'simPressMs', chordable: false, hint: 'Time allowed for both inputs to start a simultaneous binding.' },
  { key: 'TICK_TIME', label: 'Polling interval', fallback: 3, shared: 'defaultPollingMs', chordable: false, hint: 'Controller read interval. Applies to every connected controller.' },
]
type Props = {
  text: string; setText: Dispatch<SetStateAction<string>>; disabled?: boolean
  modifiers: { value: string; label: string; disabled?: boolean }[]
}

/** Ordinary profile assignments and native setting chords; no separate timing store. */
export function ProfileTiming({ text, setText, modifiers, disabled }: Props) {
  const { runtime } = usePreferences()
  const origins = useContext(SettingOrigins)
  const [modifier, setModifier] = useState('')
  const prefix = modifier ? `${modifier},` : ''
  const choices = [{ value: '', label: 'This configuration' }, ...modifiers.filter(option => !option.disabled).map(option => ({ value: option.value, label: `While ${option.label} is held` }))]
  // Preserve imported conditions even when the current hardware picker lacks them.
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([^=\s,]+),(?:HOLD_PRESS_TIME|DBL_PRESS_WINDOW|TURBO_PERIOD)\s*=/i.exec(line)
    if (match && !choices.some(option => option.value === match[1])) choices.push({ value: match[1], label: `Imported condition: ${match[1]}` })
  }
  const read = (field: typeof FIELDS[number]) => timingMilliseconds(readVirtualSetting(text, field.key, prefix) ?? '') ?? runtime?.[field.shared] ?? field.fallback
  const simWindow = timingMilliseconds(getKeymapValue(text, 'SIM_PRESS_WINDOW') ?? '') ?? runtime?.simPressMs ?? 50
  const holdTime = read(FIELDS[0])
  return <AdvancedDisclosure label="Configuration timing" summary="Press timing and held-input overrides">
    <p className="sheet-note">Use shared Timing defaults, or tune this configuration. Held overrides affect the controller’s bindings while that input is held.</p>
    <SummaryRow label="Timing context" disabled={disabled}
      adjust={{ kind: 'choice', value: modifier, options: choices, onChange: setModifier }} />
    {holdTime <= simWindow && <p role="status">Hold time must be longer than the simultaneous-press window ({simWindow} ms). The engine rejects shorter hold assignments.</p>}
    {FIELDS.filter(field => !modifier || field.chordable).map(field => {
      const value = read(field)
      const own = getKeymapValue(origins.own, prefix + field.key) !== undefined
      const inherited = getKeymapValue(origins.base, prefix + field.key) !== undefined
      const minimum = field.key === 'TICK_TIME' ? 1 : 0
      return <SummaryRow key={field.key} setting={prefix + field.key} label={field.label} hint={`${field.hint} ${own ? 'Configuration override.' : inherited ? 'Inherited timing.' : modifier ? 'Uses base timing.' : 'Uses shared timing.'}`}
        disabled={disabled} value={`${value} ms`} defaultLabel={origins.layer ? 'Use Default' : inherited ? 'Use inherited' : modifier ? 'Use base timing' : 'Use shared timing'}
        onUseDefault={own ? () => {
          if ((origins.layer || inherited) && origins.reset) origins.reset(prefix + field.key)
          else setText(previous => writeVirtualSetting(previous, field.key, '', prefix))
        } : undefined}
        adjust={{ kind: 'number', value, min: minimum, max: field.key === 'TICK_TIME' ? 100 : Math.max(5000, value), step: 1, fineStep: field.key === 'TICK_TIME' ? 1 : 0.1,
          onChange: next => {
            if (field.key === 'HOLD_PRESS_TIME' && next <= simWindow) { showToast(`Hold time must exceed ${simWindow} ms`, 'error'); return }
            const native = field.key === 'TICK_TIME' ? Math.round(next) : Number(next.toFixed(4))
            setText(previous => writeVirtualSetting(previous, field.key, native, prefix))
          } }} />
    })}
    {modifier && <p className="sheet-note">Simultaneous timing and polling use the configuration’s base values. Their native consumers do not support held overrides.</p>}
  </AdvancedDisclosure>
}
