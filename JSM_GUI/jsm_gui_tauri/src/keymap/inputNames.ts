import type { TFunction } from 'i18next'
import { controllerButtonLabel, type ControllerVisualFamily } from '../utils/controllerStatus'
import { getButtonDescription, FACE_BUTTONS, DPAD_BUTTONS, BUMPER_BUTTONS, TRIGGER_BUTTONS, CENTER_BUTTONS, PADDLE_BUTTONS, MINI_BUTTONS, TOUCH_BUTTONS, TOUCH_STICK_BUTTONS, LEFT_STICK_BUTTONS, RIGHT_STICK_BUTTONS, MISC_BUTTONS, type ButtonDefinition } from './schema'

// The long, spoken name of an input for a binding row's subtitle (Buttons
// Content, Configuration Pages 15a/15d): "A button", "Left bumper", "D-pad
// up", "Left trigger soft pull". The short name (A, LB, LT) is what the glyph
// badge says; the description in the schema is the raw, dual-family one
// ("South / Bottom", "Left bumper (L1 / LB)") and reads as a manual rather
// than as a label.
const FIXED_NAMES: Record<string, string> = {
  UP: 'D-pad up', RIGHT: 'D-pad right', DOWN: 'D-pad down', LEFT: 'D-pad left',
  L: 'Left bumper', R: 'Right bumper',
  ZL: 'Left trigger soft pull', ZLF: 'Left trigger full pull',
  ZR: 'Right trigger soft pull', ZRF: 'Right trigger full pull',
  L3: 'Left stick click', R3: 'Right stick click',
  LUP: 'Left stick up', LDOWN: 'Left stick down', LLEFT: 'Left stick left', LRIGHT: 'Left stick right',
  RUP: 'Right stick up', RDOWN: 'Right stick down', RLEFT: 'Right stick left', RRIGHT: 'Right stick right',
  LRING: 'Left stick ring', RRING: 'Right stick ring',
  LTOUCH: 'Left stick touch', RTOUCH: 'Right stick touch',
  TUP: 'Touch stick up', TDOWN: 'Touch stick down', TLEFT: 'Touch stick left', TRIGHT: 'Touch stick right', TRING: 'Touch stick ring',
  TOUCH: 'Touch contact', CAPTURE: 'Touchpad click',
  MIC: 'Microphone button',
}

const STEAM_NAMES: Record<string, string> = {
  '+': 'Menu button', '-': 'View button', HOME: 'Steam button', MISC1: 'Quick Access button',
  MISC2: 'Right pad click', MISC3: 'Left pad click', MISC5: 'Right grip', MISC6: 'Left grip',
}

const FACE = new Set(['N', 'E', 'S', 'W'])
const PADDLES = new Set(['LSL', 'LSR', 'RSL', 'RSR'])

export function inputLongName(button: ButtonDefinition, family: ControllerVisualFamily, t: TFunction): string {
  const command = button.command.toUpperCase()
  if (FACE.has(command)) return `${controllerButtonLabel(button, family)} button`
  if (PADDLES.has(command)) return controllerButtonLabel(button, family)
  if (family === 'steam' && STEAM_NAMES[command]) return STEAM_NAMES[command]
  if (FIXED_NAMES[command]) return FIXED_NAMES[command]
  const region = command.match(/^(LT|RT|T|LM|RM)(\d+)$/)
  if (region) {
    const [, prefix, index] = region
    const where = prefix === 'LT' ? 'Left pad region' : prefix === 'RT' ? 'Right pad region' : prefix === 'LM' ? 'Left stick segment' : prefix === 'RM' ? 'Right stick segment' : 'Region'
    return `${where} ${index}`
  }
  if (command === '+' || command === '-' || command === 'HOME') return `${controllerButtonLabel(button, family)} button`
  return getButtonDescription(button, t)
}

/** The short name the glyph badge and the hint capsule use: A, LB, L4, R3.
 *  The back paddles are L4 / R4 / L5 / R5 on every pad: that is what players
 *  call them, where JoyShockMapper's LSL / RSR (Joy-Con SL / SR) and the
 *  families' own names (L SL, R Paddle 1) read as jargon. */
export function inputShortName(button: ButtonDefinition, family: ControllerVisualFamily): string {
  const command = button.command.toUpperCase()
  const region = command.match(/^(LT|RT|T|LM|RM)(\d+)$/)
  if (region) return command
  if (PADDLES.has(command) && button.steam) return button.steam
  return controllerButtonLabel(button, family).split(' · ')[0]
}

const ALL_INPUTS = [...FACE_BUTTONS, ...DPAD_BUTTONS, ...BUMPER_BUTTONS, ...TRIGGER_BUTTONS, ...CENTER_BUTTONS, ...PADDLE_BUTTONS, ...MINI_BUTTONS, ...TOUCH_BUTTONS, ...TOUCH_STICK_BUTTONS, ...LEFT_STICK_BUTTONS, ...RIGHT_STICK_BUTTONS, ...MISC_BUTTONS]

/** The short name for a raw JSM input name, for text that only has the name:
 *  "RSL" reads "R5", "L" reads "LB" on an Xbox pad, a chord "LSL+R" reads
 *  "L4 + RB". Anything that is not an input comes back unchanged. */
export function inputDisplayName(command: string, family: ControllerVisualFamily): string {
  const raw = command.trim()
  // "!X": the input released (utils/released.ts), a modeshift or layer that
  // holds while it is up.
  if (raw.length > 1 && raw.startsWith('!') && !raw.includes(',')) return `${inputDisplayName(raw.slice(1), family)} released`
  // A lone + or - is the button; an interior + joins a chord, a comma a modeshift.
  if (raw.length > 1 && raw.includes(',')) return raw.split(',').map(part => inputDisplayName(part, family)).join(', ')
  const chord = raw.length > 1 ? raw.match(/^(.+?)\+(.+)$/) : null
  if (chord) return `${inputDisplayName(chord[1], family)} + ${inputDisplayName(chord[2], family)}`
  const upper = raw.toUpperCase()
  const button = ALL_INPUTS.find(b => b.command === upper)
  return button ? inputShortName(button, family) : raw
}
