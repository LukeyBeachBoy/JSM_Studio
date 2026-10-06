import type { Dispatch, SetStateAction } from 'react'
import { SummaryRow } from './ui/SummaryRow'
import { DEADZONE_PROBE_HELP, readVirtualSetting, writeVirtualSetting, type VirtualStickTarget } from '../utils/virtualStickSettings'

export function VirtualStickProbe({ text, target, prefix = '', disabled, setText }: {
  text: string; target: VirtualStickTarget; prefix?: string; disabled?: boolean; setText: Dispatch<SetStateAction<string>>
}) {
  const key = target + '_DEADZONE_PROBE'
  const value = readVirtualSetting(text, key, prefix) ?? 'ON'
  return <SummaryRow setting={key} label="Deadzone test signal" value={value === 'ON' ? 'On' : 'Off'}
    helpDialog help={DEADZONE_PROBE_HELP} disabled={disabled}
    adjust={{ kind: 'choice', value, options: [{ value: 'OFF', label: 'Off' }, { value: 'ON', label: 'On' }],
      onChange: next => setText(previous => writeVirtualSetting(previous, key, next, prefix)) }} />
}
