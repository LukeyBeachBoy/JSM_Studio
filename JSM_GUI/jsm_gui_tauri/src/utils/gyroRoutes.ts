// Where every gyro setting lives in the console v2 Gyro screens, so a link to a
// key (Review changes, a configuration error's "Open", Settings inventory) lands
// on the Fine-tune group or Advanced part that edits it, not just the Gyro tab.
//
// MODES (Review changes) imports gyroRouteForKey and requestGyroRoute; App's
// navigateInput uses the same pair.

export type GyroGroup = 'speed' | 'steadiness' | 'direction' | 'tilt' | 'rumble'
export type GyroSub =
  | { view: 'speed-advanced'; part?: 'speeds' | 'shape' | 'game' }
  | { view: 'match-turn' }
  | { view: 'steadiness-advanced'; part?: 'jitter' | 'smoothing' | 'adaptive' | 'snap' }
  | { view: 'direction-advanced' }
  | { view: 'tilt'; part?: 'behaviour' | 'angles' | 'tuning' | 'orientation' | 'when' | 'holding' }
  | { view: 'stick'; part?: 'setup' | 'deadzone' }

export type GyroRoute =
  | { view: 'front' }
  | { view: 'fine-tune'; group: GyroGroup; sub?: GyroSub }
  | { view: 'when-on' }
  /** A held variant's settings: gyro's list (When is gyro on? ▸ While holding…), opened on `trigger`'s editor. */
  | { view: 'while-holding'; trigger?: string }
  | { view: 'calibrate' }

const fine = (group: GyroGroup, sub?: GyroSub): GyroRoute => ({ view: 'fine-tune', group, sub })

// Ordered: the first pattern that matches the (unprefixed) key wins.
const ROUTES: [RegExp, GyroRoute][] = [
  [/^(GYRO_ON|GYRO_OFF|NO_GYRO_BUTTON)$/, { view: 'when-on' }],
  [/^(AUTO_CALIBRATE_GYRO|GYRO_CALIBRATION_DELAY|GYRO_CALIBRATION_TIME)$/, { view: 'calibrate' }],
  [/^(GYRO_SENS|MIN_GYRO_SENS|MAX_GYRO_SENS)$/, fine('speed')],
  [/^(MIN_GYRO_THRESHOLD|MAX_GYRO_THRESHOLD)$/, fine('speed', { view: 'speed-advanced', part: 'speeds' })],
  [/^(ACCEL_CURVE|ACCEL_CURVE_LINK|ACCEL_NATURAL_VHALF|ACCEL_POWER_VREF|ACCEL_POWER_EXPONENT|ACCEL_SIGMOID_MID|ACCEL_SIGMOID_WIDTH|ACCEL_JUMP_TAU)$/, fine('speed', { view: 'speed-advanced', part: 'shape' })],
  [/^(REAL_WORLD_CALIBRATION|IN_GAME_SENS|COUNTER_OS_MOUSE_SPEED|IGNORE_OS_MOUSE_SPEED|ROLL_CONTRIBUTION)$/, fine('speed', { view: 'speed-advanced', part: 'game' })],
  [/^(GYRO_CUTOFF_SPEED|GYRO_CUTOFF_RECOVERY|GYRO_STEADYING_FLOOR)$/, fine('steadiness', { view: 'steadiness-advanced', part: 'jitter' })],
  [/^(GYRO_SMOOTH_THRESHOLD|GYRO_SMOOTH_TIME|GYRO_SMOOTHING_DECAY)$/, fine('steadiness', { view: 'steadiness-advanced', part: 'smoothing' })],
  [/^(ONE_EURO_FILTER|ONE_EURO_MIN_CUTOFF|ONE_EURO_SPEED_COEFF)$/, fine('steadiness', { view: 'steadiness-advanced', part: 'adaptive' })],
  [/^(GYRO_ANGLE_SNAP|GYRO_ANGLE_SNAP_EASE|DECEL_BRAKE_STRENGTH|DECEL_BRAKE_THRESHOLD|GYRO_CLICK_DAMPEN|TRACKBALL_DECAY)$/, fine('steadiness', { view: 'steadiness-advanced', part: 'snap' })],
  [/^(GYRO_OUTPUT|GYRO_SPACE|GYRO_AXIS_X|GYRO_AXIS_Y)$/, fine('direction')],
  [/^(MOUSE_X_FROM_GYRO_AXIS|MOUSE_Y_FROM_GYRO_AXIS|TICK_TIME|IGNORE_GYRO_DEVICES|JOYCON_GYRO_MASK|JOYCON_MOTION_MASK)$/, fine('direction', { view: 'direction-advanced' })],
  [/^(VIRTUAL_CONTROLLER|GYRO_STICK_DEFLECTION|GYRO_DEFLECTION_RANGE|GYRO_DEFLECTION_LOCK_EXTENTS|VIRTUAL_STICK_CALIBRATION|(LEFT|RIGHT)_STICK_VIRTUAL_SCALE)$/, fine('direction', { view: 'stick', part: 'setup' })],
  [/^(LEFT|RIGHT)_STICK_(UNDEADZONE_INNER|UNDEADZONE_OUTER|UNPOWER|DEADZONE_PROBE)$/, fine('direction', { view: 'stick', part: 'deadzone' })],
  // Tilt is a Fine-tune group of its own (UX review I7); its parts open over it.
  [/^(TILT_ON|TILT_OFF)$/, fine('tilt', { view: 'tilt', part: 'when' })],
  [/^MOTION_STICK_MODE$/, fine('tilt', { view: 'tilt', part: 'behaviour' })],
  [/^(MOTION_DEADZONE_INNER|MOTION_DEADZONE_OUTER|LEAN_THRESHOLD|MOTION_RING_MODE)$/, fine('tilt', { view: 'tilt', part: 'angles' })],
  [/^(MOTION_STICK_AXIS|CONTROLLER_ORIENTATION)$/, fine('tilt', { view: 'tilt', part: 'orientation' })],
  [/^GYRO_HAPTIC_/, fine('rumble')],
]

// Keys only tilt's held variants set (the shared stick keys belong to gyro's).
const TILT_ONLY = /^(TILT_(ON|OFF)|MOTION_STICK_|MOTION_DEADZONE_|MOTION_RING_MODE|LEAN_THRESHOLD|CONTROLLER_ORIENTATION|JOYCON_MOTION_MASK)/

/** The screen that edits `key` (chords like "L,GYRO_SENS" go to While holding…). */
export function gyroRouteForKey(key: string): GyroRoute | null {
  const raw = key.trim().toUpperCase()
  const comma = raw.indexOf(',')
  if (comma >= 0) {
    const setting = raw.slice(comma + 1), trigger = raw.slice(0, comma)
    if (!isGyroRouteKey(setting)) return null
    // Tilt's held variants live under Tilt ▸ While holding…, gyro's under When is gyro on?.
    if (TILT_ONLY.test(setting)) return fine('tilt', { view: 'tilt', part: 'holding' })
    return { view: 'while-holding', trigger }
  }
  return ROUTES.find(([pattern]) => pattern.test(raw))?.[1] ?? null
}

export const isGyroRouteKey = (key: string) => ROUTES.some(([pattern]) => pattern.test(key.trim().toUpperCase()))

// ---- Asking the Gyro page to open a route. The page is lazy, so a request
// made before it mounts waits here until it does.
export const GYRO_ROUTE_EVENT = 'jsm:gyro-route'
let pending: GyroRoute | null = null

export function requestGyroRoute(route: GyroRoute) {
  pending = route
  window.dispatchEvent(new CustomEvent<GyroRoute>(GYRO_ROUTE_EVENT, { detail: route }))
}

/** The page takes the waiting request once (on mount, or when the event arrives). */
export function takeGyroRoute(): GyroRoute | null {
  const route = pending
  pending = null
  return route
}
