import { getKeymapValue } from './keymap'
import { readGyroSpeed as readTurnSpeed, writeTurnSpeed } from './gyroSpeed'
import type { HomeQuickTune } from '../components/HomePage'
import { parseGyroActivation } from './gyroActivation'
import { inputDisplayName } from '../keymap/inputNames'
import type { ControllerVisualFamily } from './controllerStatus'

// Home's words for a configuration (console v2, Home.dc.html): the summary
// line under the game's name ("Shooter · gyro aim on right grip · trackpad
// menus · 3 modes") and the Quick tune read-outs ("Gyro is on · While holding
// right grip", "Right trackpad · Mouse, 4 click zones"). Plain words read
// from the file; nothing here writes.

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** "Right grip", "R4": the input as the connected controller names it. */
const inputName = (command: string, family: ControllerVisualFamily) => {
  const name = inputDisplayName(command, family)
  return name && name !== command ? name : command
}

/** When gyro is on, as Home says it: "Always", "While holding right grip". */
export function describeGyroOn(text: string, family: ControllerVisualFamily): string {
  const activation = parseGyroActivation(text)
  switch (activation.mode) {
    case 'always_off': return 'Off'
    case 'hold_on': return `While holding ${lower(inputName(activation.button, family))}`
    case 'hold_off': return `Except while holding ${lower(inputName(activation.button, family))}`
    default: return 'Always'
  }
}

const GRID_ZONES: Record<string, number> = { FOUR_WAY: 4, EIGHT_WAY: 8, TWO_WAY: 2, GRID_2X2: 4, GRID_3X3: 9 }

/** One trackpad's mode in words: "Mouse, 4 click zones", "Menu, 8 slices". */
export function describeTrackpad(text: string, side: 'LEFT' | 'RIGHT' | ''): string {
  const prefix = side ? `${side}_` : ''
  const mode = (getKeymapValue(text, `${prefix}TOUCHPAD_MODE`) ?? getKeymapValue(text, 'TOUCHPAD_MODE') ?? '').toUpperCase()
  const shape = (getKeymapValue(text, `${prefix}GRID_SHAPE`) ?? '').toUpperCase()
  const zones = GRID_ZONES[shape] ?? (shape.match(/(\d+)/)?.[1] ? Number(shape.match(/(\d+)/)![1]) : undefined)
  const zoneText = zones ? `${zones} click zones` : 'click zones'
  switch (mode) {
    case 'MOUSE': return zones ? `Mouse, ${zoneText}` : 'Mouse'
    case 'GRID_AND_STICK': return zones ? `Buttons, ${zones} zones` : 'Buttons and touch stick'
    case 'MOUSE_AREA': return 'Mouse area'
    case 'MOUSE_RING': return 'Mouse ring'
    case 'TOUCH_STICK': case 'STICK': return 'Touch stick'
    case 'RADIAL_MENU': case 'MENU': return 'Menu'
    case 'NONE': return 'Not used'
    case '': return 'Not set'
    default: return lower(mode.replace(/_/g, ' ')).replace(/^./, c => c.toUpperCase())
  }
}

const stickMode = (text: string, side: 'LEFT' | 'RIGHT') => (getKeymapValue(text, `${side}_STICK_MODE`) ?? '').toUpperCase()

/** The summary line: what kind of setup it is, and what stands out. */
export function summarizeConfiguration(text: string, modeCount: number, family: ControllerVisualFamily): string {
  const parts: string[] = []
  const right = stickMode(text, 'RIGHT')
  const left = stickMode(text, 'LEFT')
  const gyro = parseGyroActivation(text)
  const gyroAim = gyro.mode !== 'always_off' && Boolean(getKeymapValue(text, 'GYRO_SENS') ?? getKeymapValue(text, 'MIN_GYRO_SENS') ?? getKeymapValue(text, 'IN_GAME_SENS') ?? getKeymapValue(text, 'GYRO_OUTPUT') ?? gyro.button)
  const mouseLook = /MOUSE|AIM|FLICK|HYBRID/.test(right) || gyroAim
  const usesWasd = ['W', 'A', 'S', 'D'].every(key => new RegExp(`=\\s*${key}\\b`, 'i').test(text))
  const virtual = (getKeymapValue(text, 'VIRTUAL_CONTROLLER') ?? '').toUpperCase()
  if (virtual === 'XBOX' || virtual === 'DS4') parts.push(virtual === 'DS4' ? 'Games see a DualShock 4' : 'Games see an Xbox pad')
  else if (mouseLook && (usesWasd || gyroAim)) parts.push('Shooter')
  else if (mouseLook) parts.push('Mouse and keyboard')
  else parts.push('Keyboard')
  if (gyroAim) {
    if (gyro.mode === 'hold_on') parts.push(`gyro aim on ${lower(inputName(gyro.button, family))}`)
    else if (gyro.mode === 'hold_off') parts.push('gyro aim, off while held')
    else parts.push('gyro aim')
  }
  if (/FLICK/.test(right)) parts.push('flick stick')
  const padMenus = ['LEFT', 'RIGHT', ''].some(side => /GRID|MENU/.test((getKeymapValue(text, `${side ? `${side}_` : ''}TOUCHPAD_MODE`) ?? '').toUpperCase()))
  if (padMenus) parts.push('trackpad menus')
  if (/RADIAL_MENU/.test(right + left)) parts.push('stick menu')
  if (modeCount > 0) parts.push(`${modeCount} ${modeCount === 1 ? 'layer' : 'layers'}`)
  return parts.join(' · ')
}

/** Gyro speed as Home shows it: the Gyro page's turn speed (utils/gyroSpeed).
 *  With speed-up on it is the slow end, and the fast end moves with it. */
export function readHomeGyroSpeed(text: string): number {
  return readTurnSpeed(text).base
}

/** Set it the way the Gyro page's Turn speed does. */
export function writeGyroSpeed(text: string, value: number): string {
  return writeTurnSpeed(text, value)
}

/** Home's three Quick tune tiles. */
export function homeQuickTune(text: string, family: ControllerVisualFamily, twoPads: boolean): HomeQuickTune {
  const state = readTurnSpeed(text)
  const speed = Number(state.base.toFixed(2))
  const rightMode = (getKeymapValue(text, 'RIGHT_TOUCHPAD_MODE') ?? '').toUpperCase()
  const leftMode = (getKeymapValue(text, 'LEFT_TOUCHPAD_MODE') ?? '').toUpperCase()
  // The pad that does the most: the right one unless only the left is set.
  const side: 'LEFT' | 'RIGHT' | '' = !twoPads ? '' : rightMode || !leftMode ? 'RIGHT' : 'LEFT'
  return {
    gyroSpeed: speed,
    gyroSpeedNote: state.mode === 'accel' ? 'Speed-up is on' : undefined,
    gyroOn: describeGyroOn(text, family),
    pad: { label: side === 'LEFT' ? 'Left trackpad' : side === 'RIGHT' ? 'Right trackpad' : 'Trackpad', value: describeTrackpad(text, side) },
  }
}
