import type { TFunction } from 'i18next'
import { getKeymapValue } from '../../utils/keymap'
import { parseBindingLabels } from '../../utils/bindingLabels'
import { describeBinding } from '../../utils/bindingDescription'
import { stickModeName } from './stickModes'
import { padStatus } from '../trackpads/padModes'
import { TRIGGER_MODE_NAMES, isGamepadTriggerMode } from '../triggers/triggerModes'
import type { InputSide, InputSidePage } from './inputSide'

// The shell's rail on the Sticks, Triggers and Trackpads tabs (console v2): one
// item per stick, trigger or pad with its one-line status ("Left stick ·
// Moving", "Right trigger · Fire · left mouse", "Left pad · Zones · 4-way").

export type InputRailItem = { id: string; side: InputSide | 'single'; label: string; status: string }

const firstBinding = (text: string, command: string) => {
  const raw = getKeymapValue(text, command)
  return raw ? raw.trim() : ''
}

export function inputRailItems(page: InputSidePage, text: string, t: TFunction, twoPads: boolean, deviceType?: number): InputRailItem[] {
  if (page === 'joysticks') {
    const sides: InputSide[] = deviceType === 25 ? ['left'] : ['left', 'right']
    return sides.map(side => {
      const mode = getKeymapValue(text, `${side === 'left' ? 'LEFT' : 'RIGHT'}_STICK_MODE`) ?? ''
      const directional = !mode.trim() || mode.trim().toUpperCase() === 'NO_MOUSE'
      const prefix = side === 'left' ? 'L' : 'R'
      const boundDirections = ['UP', 'DOWN', 'LEFT', 'RIGHT'].map(direction => firstBinding(text, prefix + direction)).filter(binding => binding && binding.toUpperCase() !== 'NONE')
      const modeLabel = directional && !boundDirections.length ? 'Directions · not bound' : stickModeName(mode)
      const wheel = mode.trim().toUpperCase() === 'RADIAL_MENU' ? ` · ${getKeymapValue(text, `${side === 'left' ? 'LEFT' : 'RIGHT'}_STICK_MENU_SIZE`) ?? 8} slices` : ''
      return { id: `stick-${side}`, side, label: deviceType === 25 ? 'Analog stick' : side === 'left' ? 'Left stick' : 'Right stick', status: `${modeLabel}${wheel}` }
    })
  }
  if (page === 'triggers') {
    const labels = parseBindingLabels(text)
    return (['left', 'right'] as const).map(side => {
      const mode = (getKeymapValue(text, side === 'left' ? 'ZL_MODE' : 'ZR_MODE') ?? '').trim().toUpperCase()
      const half = side === 'left' ? 'ZL' : 'ZR'
      const binding = firstBinding(text, half)
      const status = isGamepadTriggerMode(mode) ? TRIGGER_MODE_NAMES.GAMEPAD.label
        : [labels[half], binding ? describeBinding(binding, t).toLowerCase() : ''].filter(Boolean).join(' · ') || TRIGGER_MODE_NAMES[mode || 'NO_FULL']?.label || 'Unbound'
      return { id: `trigger-${side}`, side, label: side === 'left' ? 'Left trigger' : 'Right trigger', status }
    })
  }
  if (!twoPads) return [{ id: 'trackpad-single', side: 'single', label: 'Touchpad', status: padStatus(text, 'single') }]
  return (['left', 'right'] as const).map(side => ({ id: `trackpad-${side}`, side, label: side === 'left' ? 'Left pad' : 'Right pad', status: padStatus(text, side) }))
}
