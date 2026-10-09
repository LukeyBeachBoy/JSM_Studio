import { useState } from 'react'
import { ActionPicker, type ActionPickerProps } from '../ActionPicker'
import { KeyPicker } from './KeyPicker'
import { MousePicker } from './MousePicker'
import { GamepadPicker } from './GamepadPicker'
import { MenuPicker } from './MenuPicker'
import { ModePicker } from './ModePicker'
import { ControllerActionPicker } from './ControllerActionPicker'
import { ConfigPicker } from './ConfigPicker'
import { CommandPicker } from './CommandPicker'

// The binding sheet's eight "sends" kinds (console v2, BindingSheet: "<Press>
// sends"), each with its own full-screen picker: Keyboard key (KeyPicker),
// Mouse, Gamepad button, Open a menu, Switch mode, Controller action, Load a
// config, Command (design/console-v2/designs/KeyPicker, PickerFamily,
// ControllerActions*).
//
// THE CONTRACT (design/console-v2/IMPLEMENTATION.md §5): the binding sheet opens
// <KindPicker kind=… {...ActionPickerProps} /> and gets onSelect(patch) /
// onClose() back, exactly as from ActionPicker. Y on any of them opens "Search
// every action" (the ActionPicker), which returns through the same callbacks.

export type SendKind = 'key' | 'mouse' | 'gamepad' | 'menu' | 'mode' | 'controller' | 'config' | 'command'

export const SEND_KINDS: { kind: SendKind; label: string; caption: string }[] = [
  { kind: 'key', label: 'Keyboard key', caption: 'Space' },
  { kind: 'mouse', label: 'Mouse', caption: 'Clicks and wheel' },
  { kind: 'gamepad', label: 'Gamepad button', caption: 'For pad games' },
  { kind: 'menu', label: 'Open a menu', caption: 'Wheel, grid or hotbar' },
  { kind: 'mode', label: 'Switch layer', caption: 'Vehicles, map, comms…' },
  { kind: 'controller', label: 'Controller action', caption: 'Gyro, rumble, light' },
  { kind: 'config', label: 'Load a config', caption: 'Another layout' },
  { kind: 'command', label: 'Command', caption: 'Any JSM command' },
]

const PICKERS = {
  key: KeyPicker, mouse: MousePicker, gamepad: GamepadPicker, menu: MenuPicker,
  mode: ModePicker, controller: ControllerActionPicker, config: ConfigPicker, command: CommandPicker,
} as const

export function KindPicker({ kind, ...props }: ActionPickerProps & { kind: SendKind }) {
  const [searching, setSearching] = useState(false)
  const Picker = PICKERS[kind]
  if (searching) {
    // Search every action (Y): the whole catalogue, with its search box open.
    // B there comes back to this kind's picker; a choice closes both.
    const done = <A extends unknown[]>(run?: (...args: A) => void) => run ? (...args: A) => { run(...args); props.onClose() } : undefined
    return <ActionPicker {...props} startWithSearch onClose={() => setSearching(false)}
      onSelect={patch => { props.onSelect(patch); setSearching(false); props.onClose() }}
      onAddStickShift={done(props.onAddStickShift)} onAddHeldLed={done(props.onAddHeldLed)} onAddLayerAction={done(props.onAddLayerAction)}
      onCapture={props.onCapture ? () => { props.onClose(); props.onCapture?.() } : undefined} />
  }
  return <Picker {...props} onSearch={() => setSearching(true)} />
}
