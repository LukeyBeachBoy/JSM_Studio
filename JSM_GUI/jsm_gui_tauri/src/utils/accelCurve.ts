// The one acceleration-curve model both the gyro and the trackpad mouse use.
// Gyro: input is deg/s, output is a sensitivity. Trackpad: input is px/s,
// output is a gain. The *shape* (curve type + its parameters) is what
// ACCEL_CURVE_LINK lets one borrow from the other.

export type AccelCurveType = 'LINEAR' | 'NATURAL' | 'POWER' | 'QUADRATIC' | 'SIGMOID' | 'JUMP'

export const ACCEL_CURVE_TYPES: AccelCurveType[] = ['LINEAR', 'NATURAL', 'POWER', 'QUADRATIC', 'SIGMOID', 'JUMP']

export type AccelCurveLink = 'NONE' | 'TOUCHPAD_USES_GYRO' | 'GYRO_USES_TOUCHPAD'

export const ACCEL_CURVE_LINKS: AccelCurveLink[] = ['NONE', 'TOUCHPAD_USES_GYRO', 'GYRO_USES_TOUCHPAD']

export type AccelCurveShape = {
  curve?: string
  minThreshold?: number
  maxThreshold?: number
  naturalVHalf?: number
  powerVRef?: number
  powerExponent?: number
  sigmoidMid?: number
  sigmoidWidth?: number
  jumpTau?: number
}

export type AccelCurveShapeKey = keyof AccelCurveShape

export const normalizeAccelCurveLink = (raw?: string | null): AccelCurveLink => {
  const upper = (raw ?? '').trim().toUpperCase()
  return (ACCEL_CURVE_LINKS as string[]).includes(upper) ? (upper as AccelCurveLink) : 'NONE'
}

export const normalizeAccelCurveType = (raw?: string | null): AccelCurveType => {
  const upper = (raw ?? '').trim().toUpperCase()
  return (ACCEL_CURVE_TYPES as string[]).includes(upper) ? (upper as AccelCurveType) : 'LINEAR'
}

/** Whether `side` is the one borrowing the other's shape under `link`. */
export const inheritsCurveShape = (side: 'gyro' | 'touchpad', link: AccelCurveLink) =>
  (side === 'gyro' && link === 'GYRO_USES_TOUCHPAD') || (side === 'touchpad' && link === 'TOUCHPAD_USES_GYRO')

// Must track the JSMSetting defaults registered in main.cpp.
export const TOUCHPAD_ACCEL_DEFAULTS = {
  minThreshold: 0,
  maxThreshold: 2000,
  minGain: 1,
  maxGain: 1,
  naturalVHalf: 800,
  powerVRef: 0.002,
  powerExponent: 0.5,
  sigmoidMid: 900,
  sigmoidWidth: 300,
  jumpTau: 1.5,
} as const

export const GYRO_ACCEL_DEFAULTS = {
  naturalVHalf: 200,
  powerVRef: 0.01,
  powerExponent: 0.5,
  sigmoidMid: 20,
  sigmoidWidth: 8,
  jumpTau: 1.5,
} as const
