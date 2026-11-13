import { useState } from 'react'
import { ActionPicker, type ActionPickerProps, type Category } from '../ActionPicker'
import { KeyPicker, KeyComboPicker } from './KeyPicker'
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
  { kind: 'menu', label: 'Virtual menu', caption: 'On-screen wheel, grid or hotbar' },
  { kind: 'mode', label: 'Switch layer', caption: 'Vehicles, map, comms…' },
  { kind: 'controller', label: 'Controller action', caption: 'Gyro, rumble, light' },
  { kind: 'config', label: 'Load a config', caption: 'Another layout' },
  { kind: 'command', label: 'Command', caption: 'Any JSM command' },
]

const PICKERS = {
  key: KeyPicker, mouse: MousePicker, gamepad: GamepadPicker, menu: MenuPicker,
  mode: ModePicker, controller: ControllerActionPicker, config: ConfigPicker, command: CommandPicker,
} as const

/** One searchable catalogue for every binding kind. Parameter editors remain
 * available as explicit refinements and return here without stacking a second
 * catalogue on top of the first. */
const INITIAL_CATEGORY: Record<SendKind, Category> = {
  key: 'Common', mouse: 'Mouse', gamepad: 'Gamepad', menu: 'Virtual menus',
  mode: 'Layers', controller: 'Gyro', config: 'Configurations', command: 'Custom',
}
const CATEGORY_KIND = (category: Category): SendKind =>
  category === 'Mouse' ? 'mouse' : category === 'Gamepad' ? 'gamepad'
    : category === 'Virtual menus' ? 'menu' : category === 'Layers' ? 'mode'
    : category === 'Configurations' ? 'config' : category === 'Custom' ? 'command'
    : ['Gyro', 'Calibrate', 'Rumble', 'Light', 'Other'].includes(category) ? 'controller' : 'key'

export function KindPicker({ kind, ...props }: ActionPickerProps & { kind: SendKind }) {
  const [customizing, setCustomizing] = useState<SendKind | null>(null)
  const [category, setCategory] = useState<Category | undefined>(props.command.outputValue ? undefined : INITIAL_CATEGORY[kind])
  if (customizing) {
    const Picker = customizing === 'key' ? KeyComboPicker : PICKERS[customizing]
    return <Picker {...props} initialCategory={category} onNavigate={props.onClose}
      onClose={() => setCustomizing(null)}
      onBack={() => setCustomizing(null)}
      onSelect={patch => { props.onSelect(patch); props.onClose() }}
      onSelectCombo={props.onSelectCombo ? keys => { props.onSelectCombo?.(keys); props.onClose() } : undefined}
      onAddStickShift={props.onAddStickShift ? (stick, mode) => { props.onAddStickShift?.(stick, mode); props.onClose() } : undefined}
      onAddHeldLed={props.onAddHeldLed ? (color, brightness) => { props.onAddHeldLed?.(color, brightness); props.onClose() } : undefined}
      onAddLayerAction={props.onAddLayerAction ? (layer, verb, release) => { props.onAddLayerAction?.(layer, verb, release); props.onClose() } : undefined}
      onCapture={props.onCapture ? () => { props.onClose(); props.onCapture?.() } : undefined} />
  }
  return <ActionPicker {...props} initialCategory={category}
    onCategoryChange={setCategory}
    onCustomize={next => { setCategory(next); setCustomizing(CATEGORY_KIND(next)) }} />
}
