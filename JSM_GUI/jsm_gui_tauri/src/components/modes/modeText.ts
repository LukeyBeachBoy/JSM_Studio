import type { TFunction } from 'i18next'
import { inputDefinitions, overrideInput, readableSetting, visibleOverrideKeys, type ConfigLayer } from '../../utils/layers'
import { inputDisplayName, inputLongName } from '../../keymap/inputNames'
import { parseBindingExpression } from '../../utils/keymap'
import { commandForValue, commandNameKey } from '../../utils/bindingCommands'
import { describeBinding } from '../../utils/bindingDescription'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'

// Words for what a mode changes (ModeChanges.dc.html): "A button · Handbrake ·
// X · Default: Jump · Space", for the cards, the change list and the review.

const definition = (command: string) => inputDefinitions.find(input => input.command === command.replace(/^!/, '').toUpperCase())

/** "A button", "Right bumper", "Left back, upper" — the spoken name. */
export function inputLong(command: string, family: ControllerVisualFamily, t: TFunction) {
  if (command === 'LEFT_PAD') return 'Left pad'
  if (command === 'RIGHT_PAD') return family === 'steam' ? 'Right pad' : 'Touchpad'
  const button = definition(command)
  if (!button) return inputDisplayName(command, family)
  if (family === 'steam' && button.steam && /^(L|R)(4|5)$/.test(button.steam)) return `${button.steam.startsWith('L') ? 'Left' : 'Right'} back, ${button.steam.endsWith('4') ? 'upper' : 'lower'}`
  return inputLongName(button, family, t)
}

const LED = /^LIGHT_BAR\s*=\s*x([0-9a-f]{6})$/i

/** What a value does, with its action name when it has one: "Handbrake · X". */
export function describeValue(key: string, value: string | undefined, entries: Readonly<Record<string, string>>, t: TFunction): string {
  if (value === undefined) return 'Not set'
  const physical = key.split(',')[0]
  const isInput = !!overrideInput(key) && !/_(MODE|SENS|SIZE|SHAPE|DEADZONE|ROTATION)/.test(key.split(',').pop() ?? '')
  if (/(?:^|,)LIGHT_BAR$/.test(key)) return `Light ${value.replace(/^x/i, '#')}`
  if (!isInput) {
    const words = value.replace(/#.*$/, '').trim()
    if (!words) return 'Not set'
    return /^-?[\d.]+(?:\s+-?[\d.]+)*$/.test(words) ? words : words.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase())
  }
  const tokens = parseBindingExpression(value)?.tokens ?? []
  if (!tokens.length || value.trim().toUpperCase() === 'NONE') return 'Nothing'
  const commands = tokens.map(token => ({ ...commandForValue(key, token.raw || token.value), outputValue: token.value, sourceLine: key }))
  const parts = commands.map(command => {
    const name = entries[`# @label ${commandNameKey(command, commands)}`]
    const color = LED.exec(command.outputValue)?.[1]
    const what = color ? `Light #${color}` : describeBinding(command.outputValue, t)
    return name ? `${name} · ${what}` : what
  })
  const label = entries[`# @label ${physical}`]
  return parts.length === 1 && label && !parts[0].includes(label) ? `${label} · ${parts[0]}` : parts.join(', ')
}

/** Just the action's name, for a card's short list: "Handbrake", or what it sends. */
export function shortValue(key: string, value: string, entries: Readonly<Record<string, string>>, t: TFunction) {
  const physical = key.split(',')[0]
  const label = entries[`# @label ${physical}`] ?? Object.entries(entries).find(([k]) => k.startsWith(`# @label ${physical}::`))?.[1]
  return label || describeValue(key, value, entries, t)
}

export type ModeChangeRow = {
  key: string
  /** The input it is on, or null for a setting ("Right pad sensitivity"). */
  input: string | null
  name: string
  value: string
  short: string
  defaultValue: string
  /** The keys "Use Default" removes: the override and its names. */
  keys: string[]
}

/** One row per thing the mode changes, inputs first in the order of the pad. */
export function modeChangeRows(layer: ConfigLayer, defaults: Readonly<Record<string, string>>, family: ControllerVisualFamily, t: TFunction): ModeChangeRow[] {
  const entries = { ...defaults, ...layer.overrides }
  const order = new Map(inputDefinitions.map((input, index) => [input.command, index]))
  return visibleOverrideKeys(layer.overrides).filter(key => !/^#\s*@icon\s/i.test(key)).map(key => {
    const value = layer.overrides[key]
    const input = overrideInput(key)
    const physical = key.split(',')[0]
    const keys = [key, ...Object.keys(layer.overrides).filter(item => item === `# @label ${physical}` || item.startsWith(`# @label ${physical}::`) || item === `# @icon ${physical}`)]
    const shift = key.includes(',') ? ` with ${inputDisplayName(key.split(',')[0], family)} held` : ''
    const name = key.startsWith('# @overlay') ? 'On-screen menu layout'
      : input && (key === input || key.split(',').pop() === input) ? `${inputLong(input, family, t)}${shift}`
      : `${readableSetting(key.split(',').pop() ?? key)}${shift}`
    return {
      key, input, name, keys,
      value: describeValue(key, value, entries, t),
      short: shortValue(key, value, entries, t),
      defaultValue: describeValue(key, defaults[key], defaults, t),
    }
  }).sort((a, b) => (a.input ? order.get(a.input) ?? 500 : 1000) - (b.input ? order.get(b.input) ?? 500 : 1000))
}

/** "A, RB and the left stick". */
export const listWords = (items: string[]) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
