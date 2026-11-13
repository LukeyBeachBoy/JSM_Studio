import { getKeymapValue } from './keymap'

export type StickPoint = { x: number; y: number }
export const calibrationDirections = ['UP', 'RIGHT', 'DOWN', 'LEFT'] as const
export type StickCalibration = { enabled: boolean; angles: number[]; ranges: number[] }
export type StickGeometry = { rotation: number; restrictor: boolean; range: number; calibration?: StickCalibration }
export const cyborgDefaultsText = (values?: Record<string, string>) => Object.entries(values ?? {}).map(([key, value]) => `${key} = ${value}`).join('\n')
export function withCyborgDefaults(text: string, values?: Record<string, string>) {
  const defaults = { ...values }
  for (const suffix of ['INNER', 'OUTER']) {
    if (getKeymapValue(text, `STICK_DEADZONE_${suffix}`)) delete defaults[`LEFT_STICK_DEADZONE_${suffix}`]
  }
  return `${cyborgDefaultsText(defaults)}\n${text}`
}
const bounded = (value: number, fallback: number, min: number, max: number) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback

export function readStickGeometry(text: string, side: 'LEFT' | 'RIGHT'): StickGeometry {
  return {
    rotation: bounded(Number.parseFloat(getKeymapValue(text, `${side}_STICK_ROTATION`) ?? ''), 0, -180, 180),
    restrictor: getKeymapValue(text, `${side}_STICK_RESTRICTOR_RING`)?.trim().toUpperCase() === 'ON',
    range: bounded(Number.parseFloat(getKeymapValue(text, `${side}_STICK_RESTRICTOR_RANGE`) ?? ''), .7, .1, 1),
    calibration: {
      enabled: getKeymapValue(text, `${side}_STICK_CALIBRATION`)?.trim().toUpperCase() === 'ON',
      angles: calibrationDirections.map(direction => bounded(Number.parseFloat(getKeymapValue(text, `${side}_STICK_CALIBRATION_${direction}_ANGLE`) ?? ''), 0, -40, 40)),
      ranges: calibrationDirections.map(direction => bounded(Number.parseFloat(getKeymapValue(text, `${side}_STICK_CALIBRATION_${direction}_RANGE`) ?? ''), 1, .1, 1)),
    },
  }
}

/** Matches native StickGeometry.h. Preview is input before deadzones and modes. */
export function transformStickGeometry(point: StickPoint, geometry: StickGeometry): StickPoint {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return { x: 0, y: 0 }
  const rotation = bounded(geometry.rotation, 0, -180, 180)
  if (!geometry.restrictor && rotation === 0 && !geometry.calibration?.enabled) return point
  const angle = rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
  const range = geometry.restrictor ? bounded(geometry.range, .7, .1, 1) : 1
  const x = (point.x * c + point.y * s) / range, y = (point.y * c - point.x * s) / range
  const scale = Math.max(1, Math.hypot(x, y))
  return calibrateStick({ x: x / scale, y: y / scale }, geometry.calibration)
}

/** Same bounded, circular piecewise mapping as native StickGeometry.h. */
export function calibrateStick(point: StickPoint, calibration?: StickCalibration): StickPoint {
  if (!calibration?.enabled) return point
  const radius = Math.hypot(point.x, point.y)
  if (!Number.isFinite(radius) || radius === 0) return { x: 0, y: 0 }
  const anchors = calibrationDirections.map((_, i) => i * 90 - bounded(calibration.angles[i], 0, -40, 40))
  const ranges = calibrationDirections.map((_, i) => bounded(calibration.ranges[i], 1, .1, 1))
  anchors.push(anchors[0] + 360)
  let angle = Math.atan2(point.x, point.y) * 180 / Math.PI
  if (angle < anchors[0]) angle += 360
  if (angle >= anchors[4]) angle -= 360
  let segment = 0
  while (segment < 3 && angle >= anchors[segment + 1]) segment++
  const t = (angle - anchors[segment]) / (anchors[segment + 1] - anchors[segment])
  const mappedAngle = (segment + t) * Math.PI / 2
  const travel = ranges[segment] + t * (ranges[(segment + 1) % 4] - ranges[segment])
  const mappedRadius = Math.min(1, radius / travel)
  return { x: Math.sin(mappedAngle) * mappedRadius, y: Math.cos(mappedAngle) * mappedRadius }
}

/** Do not silently clamp a capture of the wrong direction. */
export function captureStickDirection(raw: StickPoint | null, geometry: StickGeometry, direction: number) {
  if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y) || Math.hypot(raw.x, raw.y) < .25) return null
  const point = transformStickGeometry(raw, { ...geometry, calibration: undefined })
  const angle = Math.atan2(point.x, point.y) * 180 / Math.PI
  const correction = ((direction * 90 - angle + 540) % 360) - 180
  if (Math.abs(correction) > 40) return null
  return { angle: Math.round(correction * 10) / 10, range: Math.max(.1, Math.min(1, Math.round(Math.hypot(point.x, point.y) * 1000) / 1000)) }
}

/** Physical input boundary which maps to a full output circle. */
export function calibrationOutline(geometry: StickGeometry) {
  const cal = geometry.calibration
  if (!cal?.enabled) return []
  return calibrationDirections.flatMap((_, i) => Array.from({ length: 17 }, (_, step) => {
    const t = step / 16, next = (i + 1) % 4
    const a = i * 90 - cal.angles[i], b = (i + 1) * 90 - cal.angles[next]
    const angle = (a + t * (b - a) - geometry.rotation) * Math.PI / 180
    const radius = (cal.ranges[i] + t * (cal.ranges[next] - cal.ranges[i])) * (geometry.restrictor ? geometry.range : 1)
    return { x: Math.sin(angle) * radius, y: Math.cos(angle) * radius }
  }))
}

export function rotationToUp(point: StickPoint) {
  return Number((-Math.atan2(point.x, point.y) * 180 / Math.PI).toFixed(1))
}
