/**
 * Controller action's groups (console v2, ControllerActions*): Gyro, Calibrate,
 * Rumble & sound, Light, Other. Picker families only: the output tokens are
 * what is saved. Each entry names its tile (the design's words) and the icon
 * Search every action draws for it.
 */
export const CONTROLLER_ACTION_GROUPS = ['Gyro', 'Calibrate', 'Rumble', 'Light', 'Other'] as const
export type ControllerActionGroup = (typeof CONTROLLER_ACTION_GROUPS)[number]

export const jsmActionGroups: { id: string; group: ControllerActionGroup; label: string; icon: string; tokens: string[] }[] = [
  { id: 'gyroOnOff', group: 'Gyro', label: 'Turn gyro on or off', icon: 'lucide:compass', tokens: ['GYRO_ON', 'GYRO_OFF', 'GYRO_ON_ALL', 'GYRO_OFF_ALL'] },
  { id: 'invert', group: 'Gyro', label: 'Invert', icon: 'lucide:arrow-left-right', tokens: ['GYRO_INVERT', 'GYRO_INV_X', 'GYRO_INV_Y'] },
  { id: 'glide', group: 'Gyro', label: 'Glide', icon: 'lucide:orbit', tokens: ['GYRO_TRACKBALL', 'GYRO_TRACK_X', 'GYRO_TRACK_Y'] },
  { id: 'calibrate', group: 'Calibrate', label: 'Calibrate the gyro', icon: 'lucide:scan-line', tokens: ['CALIBRATE_GYRO', 'CALIBRATE', 'RESTART_GYRO_CALIBRATION', 'FINISH_GYRO_CALIBRATION'] },
  { id: 'neutral', group: 'Calibrate', label: 'Neutral and triggers', icon: 'lucide:axis-3d', tokens: ['SET_MOTION_STICK_NEUTRAL', 'RECENTER_GYRO_DEFLECTION', 'CALIBRATE_TRIGGERS'] },
  { id: 'feel', group: 'Rumble', label: 'Feel it', icon: 'lucide:activity', tokens: ['HAPTIC', 'RUMBLE'] },
  { id: 'sound', group: 'Rumble', label: 'Sounds', icon: 'lucide:music', tokens: ['PLAY_SOUND'] },
  { id: 'light', group: 'Light', label: 'The controller light', icon: 'lucide:palette', tokens: ['LIGHT_BAR', 'LED_BRIGHTNESS', 'HELD_LED'] },
  { id: 'other', group: 'Other', label: 'Other', icon: 'lucide:settings-2', tokens: ['OPEN_KEYBOARD', 'TOGGLE_MAPPING', 'CYCLE', 'TURN_OFF_CONTROLLER', 'STICK_SHIFT'] },
]

/** The group a token belongs to: matched whole, or by its command word. */
export const jsmActionGroupFor = (token: string) => {
  const value = token.trim().replace(/^"|"$/g, '').toUpperCase()
  const word = /^(HAPTIC|PLAY_SOUND|LIGHT_BAR|LED_BRIGHTNESS|CYCLE)\b/.exec(value)?.[1] ?? (/^R[0-9A-F]{4}$|^(SMALL|BIG)_RUMBLE$/.test(value) ? 'RUMBLE' : value)
  return jsmActionGroups.find(group => group.tokens.includes(word))
}

const ICONS: Record<string, string> = {
  GYRO_ON: 'lucide:compass', GYRO_OFF: 'lucide:circle-off', GYRO_ON_ALL: 'lucide:compass', GYRO_OFF_ALL: 'lucide:circle-off',
  GYRO_INVERT: 'lucide:move', GYRO_INV_X: 'lucide:arrow-left-right', GYRO_INV_Y: 'lucide:arrow-up-down',
  GYRO_TRACKBALL: 'lucide:orbit', GYRO_TRACK_X: 'lucide:move-horizontal', GYRO_TRACK_Y: 'lucide:move-vertical',
  CALIBRATE_GYRO: 'lucide:scan-line', CALIBRATE: 'lucide:hand', RESTART_GYRO_CALIBRATION: 'lucide:play', FINISH_GYRO_CALIBRATION: 'lucide:square',
  SET_MOTION_STICK_NEUTRAL: 'lucide:axis-3d', RECENTER_GYRO_DEFLECTION: 'lucide:crosshair', CALIBRATE_TRIGGERS: 'lucide:sliders-horizontal',
  HAPTIC: 'lucide:activity', RUMBLE: 'lucide:vibrate', PLAY_SOUND: 'lucide:music', LIGHT_BAR: 'lucide:palette', LED_BRIGHTNESS: 'lucide:sun', HELD_LED: 'lucide:lightbulb',
  OPEN_KEYBOARD: 'lucide:keyboard', TOGGLE_MAPPING: 'lucide:circle-pause', CYCLE: 'lucide:repeat', TURN_OFF_CONTROLLER: 'lucide:power', STICK_SHIFT: 'lucide:joystick',
}

export const jsmActionIcon = (token: string) => {
  const value = token.trim().replace(/^"|"$/g, '').toUpperCase()
  const word = /^(HAPTIC|PLAY_SOUND|LIGHT_BAR|LED_BRIGHTNESS|CYCLE)\b/.exec(value)?.[1] ?? (/^R[0-9A-F]{4}$/.test(value) ? 'RUMBLE' : value)
  return ICONS[word] ?? jsmActionGroupFor(token)?.icon ?? 'lucide:settings-2'
}
