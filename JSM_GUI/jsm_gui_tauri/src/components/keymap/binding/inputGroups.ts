import { inputDisplayName } from '../../../keymap/inputNames'
import type { ControllerVisualFamily } from '../../../utils/controllerStatus'

// The inputs a binding can be paired with, grouped like the controller
// (console v2, BindingWhileHolding step 1): what a thumb or finger can hold
// while it presses something else comes first; the face buttons, D-pad and
// system buttons (which also move around the screen) are "Everything else".

export type InputGroup = { key: string; label: string; commands: string[]; rest?: boolean }

export const HOLD_GROUPS: InputGroup[] = [
  { key: 'grips', label: 'Back grips', commands: ['LSL', 'LSR', 'RSR', 'RSL', 'LMINI', 'RMINI', 'MISC6', 'MISC5'] },
  { key: 'shoulders', label: 'Bumpers, triggers', commands: ['L', 'R', 'ZL', 'ZLF', 'ZR', 'ZRF'] },
  { key: 'sticks', label: 'Sticks', commands: ['L3', 'R3', 'LTOUCH', 'RTOUCH'] },
  { key: 'pads', label: 'Trackpads', commands: ['MISC3', 'MISC2', 'TOUCH', 'MISC4'] },
  { key: 'face', label: 'Face', commands: ['S', 'E', 'W', 'N'], rest: true },
  { key: 'dpad', label: 'D-pad', commands: ['UP', 'DOWN', 'LEFT', 'RIGHT'], rest: true },
  { key: 'system', label: 'System', commands: ['-', '+', 'HOME', 'CAPTURE', 'MIC', 'MISC1'], rest: true },
  { key: 'edges', label: 'Edges and rings', commands: ['LRING', 'RRING', 'TRING'], rest: true },
]

/** Directions a Stick diagonal pairs (BindingMore: "Pick the two directions"). */
export const DIRECTION_GROUPS: InputGroup[] = [
  { key: 'dpad', label: 'D-pad', commands: ['UP', 'RIGHT', 'DOWN', 'LEFT'] },
  { key: 'left', label: 'Left stick', commands: ['LUP', 'LRIGHT', 'LDOWN', 'LLEFT'] },
  { key: 'right', label: 'Right stick', commands: ['RUP', 'RRIGHT', 'RDOWN', 'RLEFT'] },
]

/** What a cap says: "LT full", "Left pad click", "L touch". */
export function capLabel(command: string, family: ControllerVisualFamily) {
  const upper = command.toUpperCase()
  if (upper === 'ZLF') return `${inputDisplayName('ZL', family)} full`
  if (upper === 'ZRF') return `${inputDisplayName('ZR', family)} full`
  if (upper === 'MISC3') return 'Left pad click'
  if (upper === 'MISC2') return 'Right pad click'
  if (upper === 'LTOUCH') return 'L touch'
  if (upper === 'RTOUCH') return 'R touch'
  if (upper === 'TOUCH') return 'Touch'
  if (upper === 'MISC4') return 'Left pad touch'
  return inputDisplayName(upper, family)
}

/** The inputs offered, grouped; anything the options hold that no group names goes in "Other". */
export function groupOptions(groups: InputGroup[], options: { value: string; label: string; disabled?: boolean }[], offered: (value: string) => boolean) {
  const byValue = new Map(options.filter(option => !option.disabled).map(option => [option.value.toUpperCase(), option]))
  const placed = new Set(groups.flatMap(group => group.commands))
  const grouped = groups.map(group => ({ ...group, items: group.commands.filter(value => byValue.has(value) && offered(value)) }))
  const other = [...byValue.keys()].filter(value => !placed.has(value) && offered(value))
  return [...grouped, { key: 'other', label: 'Other', commands: other, rest: true, items: other }].filter(group => group.items.length > 0)
}

/** Optional hardware: offered only when the connected pad reports it. */
export const OPTIONAL_INPUTS = new Set(['LMINI', 'RMINI', 'MISC1', 'MISC2', 'MISC3', 'MISC4', 'MISC5', 'MISC6', 'LSL', 'LSR', 'RSL', 'RSR', 'MIC'])
