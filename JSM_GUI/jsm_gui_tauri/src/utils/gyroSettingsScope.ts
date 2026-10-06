/** Settings owned by the gyro page, including its native motion source.
 * Global controller creation is deliberately outside copy/paste scope.
 */
export const GYRO_TUNING_KEYS = /^(?:(?:MIN_|MAX_)?GYRO_|ACCEL_|ROLL_CONTRIBUTION$|IN_GAME_SENS$|REAL_WORLD_CALIBRATION$|CUTOFF_|SMOOTH_|ONE_EURO_|ANGLE_SNAP|DECEL_BRAKE|TRACKBALL_DECAY$|MOUSE_[XY]_FROM_GYRO_AXIS$|VIRTUAL_STICK_CALIBRATION$|(?:LEFT|RIGHT)_STICK_(?:UNDEADZONE_INNER|UNDEADZONE_OUTER|UNPOWER|VIRTUAL_SCALE|DEADZONE_PROBE)$|TILT_(?:ON|OFF)$|MOTION_STICK_|MOTION_DEADZONE_|MOTION_RING_MODE$|LEAN_THRESHOLD$|JOYCON_GYRO_MASK$|JOYCON_MOTION_MASK$)/

export const SHARED_MOTION_OUTPUT_KEYS = /^(?:VIRTUAL_STICK_CALIBRATION$|(?:LEFT|RIGHT)_STICK_(?:UNDEADZONE_INNER|UNDEADZONE_OUTER|UNPOWER|VIRTUAL_SCALE|DEADZONE_PROBE)$)/
export const TILT_MODESHIFT_KEYS = /^(?:TILT_(?:ON|OFF)$|MOTION_STICK_|MOTION_DEADZONE_|MOTION_RING_MODE$|LEAN_THRESHOLD$|CONTROLLER_ORIENTATION$|JOYCON_MOTION_MASK$|STICK_(?:SENS|POWER|ACCELERATION_RATE|ACCELERATION_CAP)$|FLICK_|ROTATE_SMOOTH_OVERRIDE$|MOUSE_RING_RADIUS$|SCREEN_RESOLUTION_[XY]$|SCROLL_SENS$|MOUSELIKE_FACTOR$|RETURN_DEADZONE_|EDGE_PUSH_IS_ACTIVE$|ANGLE_TO_AXIS_|WIND_STICK_|UNWIND_RATE$)/

export const isGyroModeshiftKey = (key: string) => GYRO_TUNING_KEYS.test(key) && !TILT_MODESHIFT_KEYS.test(key)

/** Retarget native setting chords without reconstructing values or comments.
 * Existing settings on the destination win: other chords remain intact.
 */
export function moveGyroSettingChord(text: string, from: string, to: string): string {
  if (!from || from === to) return text
  const assignment = /^\s*([^,=]+)\s*,\s*([^=]+?)\s*=/
  const destination = new Set(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(assignment)
    return match && match[1].trim() === to ? [match[2].trim()] : []
  }))
  const sharesTiltOutput = text.split(/\r?\n/).some(line => {
    const match = line.match(assignment)
    return match && match[1].trim() === from && match[2].trim() === 'MOTION_STICK_MODE'
  })
  return text.split(/(\r?\n)/).map(line => {
    const match = line.match(assignment)
    if (!match || match[1].trim() !== from || !isGyroModeshiftKey(match[2].trim())) return line
    if (sharesTiltOutput && SHARED_MOTION_OUTPUT_KEYS.test(match[2].trim())) {
      return destination.has(match[2].trim()) ? line : `${line}${text.includes('\r\n') ? '\r\n' : '\n'}${line.replace(from, to)}`
    }
    if (!to || destination.has(match[2].trim())) return ''
    return line.replace(from, to)
  }).join('')
}
