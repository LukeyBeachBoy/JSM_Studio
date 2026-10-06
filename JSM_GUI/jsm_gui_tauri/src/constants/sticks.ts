import type { TFunction } from 'i18next'

export const STICK_MODE_VALUES = [
  'NO_MOUSE',
  'AIM',
  'FLICK',
  'FLICK_ONLY',
  'ROTATE_ONLY',
  'MOUSE_AREA',
  'MOUSE_RING',
  'SCROLL_WHEEL',
  'HYBRID_AIM',
  'INNER_RING',
  'OUTER_RING',
  // A weapon wheel on the stick: pushing past the menu deadzone selects one of
  // LM1..LM25 / RM1..RM25 by angle, numbered clockwise from up exactly as a
  // RADIAL touch grid is, and drawn by the same trackpad overlay.
  'RADIAL_MENU',
  // Real analog passthrough to a virtual Xbox/DS4 controller (JoyShockMapper's
  // processGyroStick already forwards the physical stick's own curve/deadzone
  // untouched when no gyro is combined with it -- these aren't gyro-only modes
  // despite the backend naming). Lets a game keep native analog stick input
  // while everything else (buttons, the other stick, gyro) still goes through
  // JSM. Requires VIRTUAL_CONTROLLER to be set; see stickModeExtras' hint.
  'LEFT_STICK',
  'RIGHT_STICK',
  'LEFT_ANGLE_TO_X',
  'LEFT_ANGLE_TO_Y',
  'RIGHT_ANGLE_TO_X',
  'RIGHT_ANGLE_TO_Y',
  'LEFT_WIND_X',
  'RIGHT_WIND_X',
] as const

// The mode picker groups the three native flick behaviours under Flick Stick.
export const STICK_MODE_PICKER_VALUES = STICK_MODE_VALUES.filter(mode => mode !== 'FLICK_ONLY' && mode !== 'ROTATE_ONLY')
export const isFlickStickMode = (mode: string) => ['FLICK', 'FLICK_ONLY', 'ROTATE_ONLY'].includes(mode.toUpperCase())
export const stickModePickerValue = (mode: string) => isFlickStickMode(mode) ? 'FLICK' : mode

export type StickMode = (typeof STICK_MODE_VALUES)[number]

const STICK_MODE_LABEL_KEYS: Record<StickMode, string> = {
  NO_MOUSE: 'stickModes.NO_MOUSE',
  AIM: 'stickModes.AIM',
  FLICK: 'stickModes.FLICK',
  FLICK_ONLY: 'stickModes.FLICK_ONLY',
  ROTATE_ONLY: 'stickModes.ROTATE_ONLY',
  MOUSE_AREA: 'stickModes.MOUSE_AREA',
  MOUSE_RING: 'stickModes.MOUSE_RING',
  SCROLL_WHEEL: 'stickModes.SCROLL_WHEEL',
  HYBRID_AIM: 'stickModes.HYBRID_AIM',
  INNER_RING: 'stickModes.INNER_RING',
  OUTER_RING: 'stickModes.OUTER_RING',
  RADIAL_MENU: 'stickModes.RADIAL_MENU',
  LEFT_STICK: 'stickModes.LEFT_STICK',
  RIGHT_STICK: 'stickModes.RIGHT_STICK',
  LEFT_ANGLE_TO_X: 'stickModes.LEFT_ANGLE_TO_X',
  LEFT_ANGLE_TO_Y: 'stickModes.LEFT_ANGLE_TO_Y',
  RIGHT_ANGLE_TO_X: 'stickModes.RIGHT_ANGLE_TO_X',
  RIGHT_ANGLE_TO_Y: 'stickModes.RIGHT_ANGLE_TO_Y',
  LEFT_WIND_X: 'stickModes.LEFT_WIND_X',
  RIGHT_WIND_X: 'stickModes.RIGHT_WIND_X',
}

export const getStickModeLabelKey = (mode: string) => {
  const upper = mode?.toUpperCase() as StickMode
  return STICK_MODE_LABEL_KEYS[upper]
}

export const formatStickModeLabel = (mode: string, t: TFunction) => {
  const key = getStickModeLabelKey(mode)
  if (key) return t(key, FRIENDLY_SPECIAL_MODES[mode.toUpperCase()] ?? mode.replace(/_/g, ' '))
  const upper = mode?.toUpperCase()
  return upper ? upper.replace(/_/g, ' ') : ''
}

const FRIENDLY_SPECIAL_MODES: Record<string, string> = {
  MOUSE_RING: 'Cursor ring',
  LEFT_ANGLE_TO_X: 'Direction → left stick horizontal',
  LEFT_ANGLE_TO_Y: 'Direction → left stick vertical',
  RIGHT_ANGLE_TO_X: 'Direction → right stick horizontal',
  RIGHT_ANGLE_TO_Y: 'Direction → right stick vertical',
  LEFT_WIND_X: 'Winding → left stick steering',
  RIGHT_WIND_X: 'Winding → right stick steering',
}

export function stickModeTuningLabel(mode: string, t: TFunction) {
  const upper = mode.toUpperCase()
  if (['FLICK', 'FLICK_ONLY', 'ROTATE_ONLY'].includes(upper)) return t('keymap.flickTuning', 'Flick tuning')
  if (['AIM', 'HYBRID_AIM'].includes(upper)) return t('keymap.aimTuning', 'Aim tuning')
  if (upper === 'SCROLL_WHEEL') return t('keymap.scrollTuning', 'Scroll tuning')
  if (upper === 'MOUSE_AREA') return t('keymap.cursorTuning', 'Cursor tuning')
  return t('keymap.outputSettings', 'Output settings')
}

// Directional presses (Up/Down/Left/Right) only mean anything while the stick is
// in one of these digital-direction modes. Once it is in a whole-stick mode (AIM,
// a mouse mode, LEFT_STICK/RIGHT_STICK passthrough, ...) those four commands are
// never sent. An unset mode is JSM's own default, which is directional.
const STICK_DIRECTIONAL_MODES = new Set(['', 'NO_MOUSE', 'INNER_RING', 'OUTER_RING'])

export const isDirectionalStickMode = (mode?: string | null) =>
  STICK_DIRECTIONAL_MODES.has((mode ?? '').trim().toUpperCase())

/**
 * Which of a stick's four direction commands a mode still sends.
 *
 * SCROLL_WHEEL is the odd one out. It is a whole-stick mode, so
 * isDirectionalStickMode says no to it -- but every notch of rotation pulses the
 * stick's *left and right* bindings, and those two are the only place to say
 * what scrolling does. Folding them away with the rest of the directions left
 * the mode with nothing to fire, which reads as the scroll wheel being broken.
 */
export type StickDirectionUse = 'all' | 'leftRight' | 'none'

export const stickModeDirectionUse = (mode?: string | null): StickDirectionUse => {
  const upper = (mode ?? '').trim().toUpperCase()
  if (STICK_DIRECTIONAL_MODES.has(upper)) return 'all'
  if (upper === 'SCROLL_WHEEL') return 'leftRight'
  return 'none'
}
