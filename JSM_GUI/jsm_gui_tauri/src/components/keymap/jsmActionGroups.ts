/** Picker families only: the original output tokens remain the saved actions. */
export const jsmActionGroups = [
  { id: 'gyro', label: 'Gyro control', icon: 'lucide:compass', tokens: ['GYRO_OFF', 'GYRO_ON', 'GYRO_OFF_ALL', 'GYRO_ON_ALL'], advanced: false },
  { id: 'calibration', label: 'Calibrate gyro', icon: 'lucide:scan-line', tokens: ['CALIBRATE_GYRO', 'CALIBRATE'], advanced: false },
  { id: 'keyboard', label: 'Open keyboard', icon: 'lucide:keyboard', tokens: ['OPEN_KEYBOARD'], advanced: false },
  { id: 'mapping', label: 'Pause / resume mapping', icon: 'lucide:circle-pause', tokens: ['TOGGLE_MAPPING'], advanced: false },
  { id: 'cycle', label: 'Cycle actions', icon: 'lucide:repeat', tokens: ['CYCLE 1 | 2 | 3'], advanced: false },
  { id: 'led', label: 'Change LED colour', icon: 'lucide:palette', tokens: ['LIGHT_BAR'], advanced: false },
  { id: 'power', label: 'Turn off controller', icon: 'lucide:power', tokens: ['TURN_OFF_CONTROLLER'], advanced: false },
  { id: 'invert', label: 'Invert gyro', icon: 'lucide:arrow-left-right', tokens: ['GYRO_INVERT', 'GYRO_INV_X', 'GYRO_INV_Y'], advanced: true },
  { id: 'trackball', label: 'Gyro trackball', icon: 'lucide:orbit', tokens: ['GYRO_TRACKBALL', 'GYRO_TRACK_X', 'GYRO_TRACK_Y'], advanced: true },
  { id: 'tilt', label: 'Set tilt neutral', icon: 'lucide:axis-3d', tokens: ['SET_MOTION_STICK_NEUTRAL'], advanced: true },
  { id: 'recenter', label: 'Recenter gyro deflection', icon: 'lucide:crosshair', tokens: ['RECENTER_GYRO_DEFLECTION'], advanced: true },
  { id: 'stick', label: 'Stick mode shift', icon: 'lucide:joystick', tokens: ['STICK_SHIFT'], advanced: true },
  { id: 'triggers', label: 'Calibrate adaptive triggers', icon: 'lucide:sliders-horizontal', tokens: ['CALIBRATE_TRIGGERS'], advanced: true },
  { id: 'continuous', label: 'Continuous gyro calibration', icon: 'lucide:timer', tokens: ['RESTART_GYRO_CALIBRATION', 'FINISH_GYRO_CALIBRATION'], advanced: true },
]

export const jsmActionGroupFor = (token: string) => jsmActionGroups.find(group => group.tokens.some(value => token === value || (value === 'LIGHT_BAR' && /^LIGHT_BAR\s*=/i.test(token))))

export const jsmActionIcon = (token: string) => {
  const variants: Record<string, string> = {
    GYRO_OFF: 'lucide:circle-off', GYRO_ON: 'lucide:compass',
    GYRO_OFF_ALL: 'lucide:circle-off', GYRO_ON_ALL: 'lucide:compass',
    CALIBRATE: 'lucide:hand', GYRO_INV_X: 'lucide:arrow-left-right', GYRO_INV_Y: 'lucide:arrow-up-down',
    GYRO_INVERT: 'lucide:move', GYRO_TRACK_X: 'lucide:move-horizontal', GYRO_TRACK_Y: 'lucide:move-vertical',
    RESTART_GYRO_CALIBRATION: 'lucide:play', FINISH_GYRO_CALIBRATION: 'lucide:square',
  }
  return variants[token] ?? jsmActionGroupFor(token)?.icon ?? 'lucide:settings-2'
}
