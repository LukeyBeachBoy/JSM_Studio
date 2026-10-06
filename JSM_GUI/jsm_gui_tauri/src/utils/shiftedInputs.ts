import { inputDisplayName } from '../keymap/inputNames'
import type { ControllerVisualFamily } from './controllerStatus'

// What a modeshift changes, counted the way a person reads it (binding card
// refresh 2g, "L4 held · 3 inputs shifted"). A shift that turns the right pad
// into a 2x2 grid writes the pad's mode, its grid size and every region cell it
// blanks -- LEFT,RIGHT_TOUCHPAD_MODE, LEFT,RIGHT_GRID_SIZE, LEFT,RT2 = NONE ...
// LEFT,RT25 -- but it changes one input: the right trackpad. The cells are what
// the new layout adds, not inputs of their own, and a pad's settings are the pad.

const SIDED_PAD = /^(LEFT|RIGHT)_(TOUCHPAD|GRID|TOUCH)_/
const SIDED_STICK = /^(LEFT|RIGHT)_(STICK|RING)_/
const STICK_DIRECTION = /^([LR])(UP|DOWN|LEFT|RIGHT|RING)$/

/** The input a modeshift's target key belongs to: a pad for its regions and
 *  settings, a stick for its menu segments and settings, the gyro for gyro
 *  settings, and the button itself for a button. */
export function shiftedInputOf(target: string): string {
  const key = target.trim().toUpperCase()
  const region = /^([LR]?)([TM])\d+$/.exec(key)
  if (region) {
    const side = region[1] === 'L' ? 'LEFT' : region[1] === 'R' ? 'RIGHT' : ''
    if (region[2] === 'M') return side ? `${side}_STICK` : key
    return side ? `${side}_PAD` : 'TOUCHPAD'
  }
  const pad = SIDED_PAD.exec(key)
  if (pad) return `${pad[1]}_PAD`
  const stick = SIDED_STICK.exec(key)
  if (stick) return `${stick[1]}_STICK`
  const direction = STICK_DIRECTION.exec(key)
  if (direction) return direction[1] === 'L' ? 'LEFT_STICK' : 'RIGHT_STICK'
  if (/^T(UP|DOWN|LEFT|RIGHT|RING)$/.test(key) || /^(TOUCHPAD|GRID|TOUCH)_/.test(key)) return 'TOUCHPAD'
  if (/^STICK_/.test(key)) return 'STICKS'
  if (/GYRO|^ONE_EURO|^ROLL_/.test(key)) return 'GYRO'
  if (key === 'ZL_MODE') return 'ZL'
  if (key === 'ZR_MODE') return 'ZR'
  if (/^TRIGGER_/.test(key)) return 'TRIGGERS'
  return key
}

/** The distinct inputs a set of modeshift targets changes. */
export const shiftedInputs = (targets: Iterable<string>) => [...new Set([...targets].map(shiftedInputOf))]

const GROUP_NAMES: Record<string, string> = {
  LEFT_PAD: 'Left trackpad', RIGHT_PAD: 'Right trackpad', TOUCHPAD: 'Touchpad',
  LEFT_STICK: 'Left stick', RIGHT_STICK: 'Right stick', STICKS: 'Sticks',
  GYRO: 'Gyro', TRIGGERS: 'Triggers',
}

/** "Right trackpad", or the button's own name on this controller. `short`
 *  for a narrow tile: "Right pad". */
export const shiftedInputName = (input: string, family: ControllerVisualFamily, short = false) =>
  (short ? SHORT_NAMES[input] : undefined) ?? GROUP_NAMES[input] ?? inputDisplayName(input, family)
const SHORT_NAMES: Record<string, string> = { LEFT_PAD: 'Left pad', RIGHT_PAD: 'Right pad' }

// Where to open a group's editor (App's navigateInput), and the glyph it wears.
const GROUP_TARGETS: Record<string, string> = { STICKS: 'L3', GYRO: 'GYRO_SENS', TRIGGERS: 'ZL', TOUCHPAD: 'TOUCH' }
export const shiftedInputTarget = (input: string) => GROUP_TARGETS[input] ?? input
const GROUP_GLYPHS: Record<string, string> = { STICKS: 'LEFT_STICK', TRIGGERS: 'ZL', TOUCHPAD: 'TOUCH' }
export const shiftedInputGlyph = (input: string) => GROUP_GLYPHS[input] ?? input

// The Overview's words for pad and stick modes (OverviewPage PAD_MODES).
const MODE_WORDS: Record<string, string> = { GRID_AND_STICK: 'Button pad', MOUSE: 'Mouse', MOUSE_AREA: 'Mouse area', PS_TOUCHPAD: 'PlayStation touchpad', NO_MOUSE: 'directions', RADIAL_MENU: 'Radial menu', SCROLL_WHEEL: 'Scroll wheel', MOUSE_RING: 'Mouse ring' }
const words = (value: string) => MODE_WORDS[value.toUpperCase()] ?? value.replace(/_/g, ' ').toLowerCase()

/**
 * What a shift does to one input, in a line: "Button pad · 2×2 grid · region 1 → F3"
 * for a pad, the bound output for a button. `changes` are the shift's own
 * assignments for that input (target key → value); `describe` says an output
 * the way the rest of the app does. Regions the shift clears are left out:
 * they are what shapes the new layout, not changes worth reading.
 */
export function describeShiftedInput(input: string, changes: [string, string][], describe: (value: string) => string): string {
  const parts: string[] = []
  for (const [key, raw] of changes) {
    const value = raw.split('#')[0].trim()
    const upper = key.toUpperCase()
    const region = /^[LR]?[TM](\d+)$/.exec(upper)
    if (region) {
      if (value && value.toUpperCase() !== 'NONE') parts.push(`region ${region[1]} → ${describe(value)}`)
      continue
    }
    if (upper === input || shiftedInputOf(upper) !== input || !/_/.test(upper)) { parts.push(describe(value)); continue }
    const setting = upper.replace(/^(LEFT|RIGHT)_/, '')
    if (/(TOUCHPAD|STICK)_MODE$/.test(setting) && !/TOUCH_STICK/.test(setting)) parts.unshift(words(value))
    else if (/GRID_SIZE$/.test(setting)) parts.push(`${value.trim().split(/\s+/).join('×')} grid`)
    else if (/GRID_REQUIRES_CLICK$/.test(setting)) parts.push(value.toUpperCase() === 'OFF' ? 'no click needed' : 'click to press')
    else if (/TOUCH_STICK_MODE$/.test(setting)) parts.push(`touch stick: ${words(value)}`)
    else parts.push(`${setting.replace(/_/g, ' ').toLowerCase()}: ${words(value)}`)
  }
  return parts.join(' · ')
}
