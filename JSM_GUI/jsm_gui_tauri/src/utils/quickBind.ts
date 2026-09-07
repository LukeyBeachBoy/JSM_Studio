import { keyName } from '../constants/configKeys'
import { isDirectionalStickMode } from '../constants/sticks'
import { getKeymapValue, removeKeymapEntry, setBindingLine, updateKeymapEntry } from './keymap'
import {
  toVirtualControllerToken,
  type VirtualControllerLogicalOutput,
  type VirtualControllerType,
} from './virtualController'

export type VirtualControllerScheme = Exclude<VirtualControllerType, 'NONE'>

/**
 * The physical inputs a plain gamepad passthrough covers, and the virtual output
 * each one stands in for. Deliberately only the inputs a virtual pad actually
 * has: ViGEm exposes no paddles or extra buttons, so LSL/RSR/MISC* keep whatever
 * they were bound to rather than being cleared to nothing.
 */
const GAMEPAD_PASSTHROUGH_INPUTS: { input: string; logical: VirtualControllerLogicalOutput }[] = [
  { input: 'S', logical: 'faceSouth' },
  { input: 'E', logical: 'faceEast' },
  { input: 'W', logical: 'faceWest' },
  { input: 'N', logical: 'faceNorth' },
  { input: 'L', logical: 'leftBumper' },
  { input: 'R', logical: 'rightBumper' },
  { input: 'L3', logical: 'leftStickClick' },
  { input: 'R3', logical: 'rightStickClick' },
  { input: '-', logical: 'back' },
  { input: '+', logical: 'start' },
  { input: 'HOME', logical: 'home' },
  { input: 'UP', logical: 'dpadUp' },
  { input: 'DOWN', logical: 'dpadDown' },
  { input: 'LEFT', logical: 'dpadLeft' },
  { input: 'RIGHT', logical: 'dpadRight' },
  // Xbox has no pad click, so toVirtualControllerToken drops this one there.
  { input: 'CAPTURE', logical: 'padClick' },
]

// The triggers pass through as analog rather than as digital bindings, so the
// game reads a real trigger axis. JSM warns that feeding a trigger from both an
// analog mode and a digital binding at once is undefined, so the digital soft
// and full pull bindings come off when the analog mode goes on.
const DIGITAL_TRIGGER_INPUTS = ['ZL', 'ZLF', 'ZR', 'ZRF']

export type GamepadPassthroughBinding = { input: string; token: string }

export const buildGamepadPassthroughBindings = (scheme: VirtualControllerScheme): GamepadPassthroughBinding[] =>
  GAMEPAD_PASSTHROUGH_INPUTS.flatMap(({ input, logical }) => {
    const token = toVirtualControllerToken(logical, scheme)
    return token ? [{ input, token }] : []
  })

/**
 * Binds the whole controller straight through to a virtual Xbox/DS4 pad: every
 * button to its counterpart, both triggers to the analog trigger modes, and both
 * sticks to the virtual sticks. Anything a virtual pad has no equivalent for
 * (paddles, trackpad regions, gyro) is left exactly as it was.
 */
export const applyGamepadPassthrough = (text: string, scheme: VirtualControllerScheme) => {
  let next = updateKeymapEntry(text, keyName.VIRTUAL_CONTROLLER, [scheme])
  buildGamepadPassthroughBindings(scheme).forEach(({ input, token }) => {
    next = setBindingLine(next, input, token)
  })
  DIGITAL_TRIGGER_INPUTS.forEach(input => {
    next = removeKeymapEntry(next, input)
  })
  const leftTrigger = toVirtualControllerToken('leftTriggerDigital', scheme)
  const rightTrigger = toVirtualControllerToken('rightTriggerDigital', scheme)
  if (leftTrigger) next = updateKeymapEntry(next, keyName.ZL_MODE, [leftTrigger])
  if (rightTrigger) next = updateKeymapEntry(next, keyName.ZR_MODE, [rightTrigger])
  next = updateKeymapEntry(next, keyName.LEFT_STICK_MODE, ['LEFT_STICK'])
  next = updateKeymapEntry(next, keyName.RIGHT_STICK_MODE, ['RIGHT_STICK'])
  return next
}

export type DirectionalSetId = 'dpad' | 'leftStick' | 'rightStick' | 'touchStick'

type DirectionalSet = {
  /** Up, down, left and right, in that order. */
  inputs: [string, string, string, string]
  /**
   * The stick mode that has to be a digital one for these directions to fire at
   * all. Left out for inputs that are always digital, like the d-pad.
   */
  stickModeKey?: string
}

const DIRECTIONAL_SETS: Record<DirectionalSetId, DirectionalSet> = {
  dpad: { inputs: ['UP', 'DOWN', 'LEFT', 'RIGHT'] },
  leftStick: { inputs: ['LUP', 'LDOWN', 'LLEFT', 'LRIGHT'], stickModeKey: keyName.LEFT_STICK_MODE },
  rightStick: { inputs: ['RUP', 'RDOWN', 'RLEFT', 'RRIGHT'], stickModeKey: keyName.RIGHT_STICK_MODE },
  touchStick: { inputs: ['TUP', 'TDOWN', 'TLEFT', 'TRIGHT'] },
}

/** Up, down, left, right -- matching DirectionalSet's input order. */
export const WASD_KEYS = ['W', 'S', 'A', 'D'] as const

export const getDirectionalSetInputs = (setId: DirectionalSetId) => DIRECTIONAL_SETS[setId].inputs

/**
 * Points a four-way directional at WASD. Diagonals need nothing of their own:
 * holding two directions at once sends both keys, which is exactly the eight-way
 * movement a game reads off WASD.
 */
export const applyWasdBindings = (text: string, setId: DirectionalSetId) => {
  const set = DIRECTIONAL_SETS[setId]
  let next = set.inputs.reduce((carry, input, index) => setBindingLine(carry, input, WASD_KEYS[index]), text)
  // A stick in an analog mode never sends its direction commands, so the
  // bindings we just wrote would sit there doing nothing. Clearing the mode
  // rather than writing NO_MOUSE leaves the stick on JSM's own default, which is
  // NO_MOUSE -- and which is the entry the mode picker shows as its default.
  if (set.stickModeKey && !isDirectionalStickMode(getKeymapValue(next, set.stickModeKey))) {
    next = removeKeymapEntry(next, set.stickModeKey)
  }
  return next
}

/** Whether pointing this set at WASD would also have to change a stick's mode. */
export const wasdBindingChangesStickMode = (text: string, setId: DirectionalSetId) => {
  const { stickModeKey } = DIRECTIONAL_SETS[setId]
  return Boolean(stickModeKey) && !isDirectionalStickMode(getKeymapValue(text, stickModeKey!))
}
