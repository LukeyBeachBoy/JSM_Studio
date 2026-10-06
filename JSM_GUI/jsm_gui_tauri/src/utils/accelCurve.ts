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

/** Everything a curve needs to turn a speed into an output. */
export type AccelCurveParams = {
  curveType: string
  minSens: number
  maxSens: number
  /** The shape's own speed range. */
  minThreshold: number
  maxThreshold: number
  naturalVHalf: number
  powerVRef: number
  powerExponent: number
  sigmoidMid: number
  sigmoidWidth: number
  jumpTau: number
  /**
   * Set when the shape is borrowed from the other input (ACCEL_CURVE_LINK):
   * this input's own speed range, which rescaleAdjustedSpeed in main.cpp maps
   * onto the shape's range -- the same fraction of the way from slow to fast,
   * held at the top past this input's maximum.
   */
  ownRange?: { min: number; max: number }
  steadying?: { cutoff: number; recovery: number; floor: number; enabled: boolean }
}

const clampUnit = (value: number) => Math.min(Math.max(value, 0), 1)

/**
 * The output (gyro sensitivity, trackpad gain) the curve picks at `speed`,
 * as evaluateAccelCurve in main.cpp and the NaturalCurve/PowerCurve/... files
 * compute it. Every curve measures from the minimum threshold, so QUADRATIC
 * and JUMP reach their maximum at min + max threshold, not at max.
 */
export function accelSensitivityAt(speed: number, p: AccelCurveParams): number {
  const s = p.steadying
  if (!s) return baseAccelSensitivityAt(speed, p)
  const factor = s.recovery > s.cutoff ? clampUnit((speed - s.cutoff) / (s.recovery - s.cutoff)) : s.cutoff > 0 && speed < s.cutoff ? 0 : 1
  if (s.cutoff > 0 && (s.recovery > s.cutoff ? speed <= s.cutoff : speed < s.cutoff)) return 0
  if (!s.enabled) return factor * baseAccelSensitivityAt(speed * factor, p)
  const base = baseAccelSensitivityAt(speed, p)
  if (factor >= 1) return base
  const floor = Number.isFinite(s.floor) ? Math.min(Math.max(0, s.floor), Math.max(0, base)) : 0
  return floor + factor * (base - floor)
}

function baseAccelSensitivityAt(speed: number, p: AccelCurveParams): number {
  let adjusted = Math.max(0, speed - (p.ownRange ? p.ownRange.min : p.minThreshold))
  if (p.ownRange) {
    const ownSpan = p.ownRange.max - p.ownRange.min
    const fraction = ownSpan > 0 ? clampUnit(adjusted / ownSpan) : adjusted > 0 ? 1 : 0
    adjusted = fraction * Math.max(0, p.maxThreshold - p.minThreshold)
  }
  const span = p.maxSens - p.minSens
  switch (p.curveType) {
    case 'NATURAL': {
      if (p.naturalVHalf <= 0) return p.maxSens
      return p.maxSens - span * Math.exp(-(Math.log(2) / p.naturalVHalf) * adjusted)
    }
    case 'POWER': {
      if (p.powerVRef <= 0) return p.maxSens
      if (p.powerExponent <= 0 || adjusted <= 0) return p.minSens
      return p.minSens + span * clampUnit(1 - Math.exp(-Math.pow(adjusted / p.powerVRef, p.powerExponent)))
    }
    case 'QUADRATIC': {
      if (p.maxThreshold <= 0) return p.maxSens
      const t = clampUnit(adjusted / p.maxThreshold)
      return p.minSens + span * t * t
    }
    case 'SIGMOID': {
      const w = p.sigmoidWidth > 0 ? p.sigmoidWidth : 1e-6
      const raw = (x: number) => 1 / (1 + Math.exp(-(x - p.sigmoidMid) / w))
      const sigma0 = raw(0)
      const denom = 1 - sigma0
      return p.minSens + span * clampUnit(denom > 0 ? (raw(adjusted) - sigma0) / denom : 0)
    }
    case 'JUMP': {
      const vJump = p.maxThreshold
      if (p.jumpTau <= 0) return adjusted < vJump ? p.minSens : p.maxSens
      const raw = (x: number) => (x >= vJump ? 1 : Math.exp((x - vJump) / p.jumpTau))
      const raw0 = raw(0)
      const denom = 1 - raw0
      return p.minSens + span * (denom > 0 ? clampUnit((raw(adjusted) - raw0) / denom) : 0)
    }
    default: {
      const denom = p.maxThreshold - p.minThreshold
      if (denom <= 0) return adjusted > 0 ? p.maxSens : p.minSens
      return p.minSens + clampUnit(adjusted / denom) * span
    }
  }
}

/**
 * The speed at which the curve has (all but) finished rising: where the
 * editor's graph should end so the bend is not squeezed into one corner.
 */
export function accelCurveSettleSpeed(p: AccelCurveParams): number {
  // How far past the shape's minimum it settles, in the shape's own speeds.
  const settles = (() => {
    switch (p.curveType) {
      // 95% of the way: a little over four half-lives.
      case 'NATURAL': return Math.max(1e-3, p.naturalVHalf) * 4.4
      // u = 3 leaves 5% to go: (adjusted / vRef)^exponent = 3.
      case 'POWER': return p.powerVRef > 0 && p.powerExponent > 0 ? p.powerVRef * Math.pow(3, 1 / p.powerExponent) : 0
      case 'SIGMOID': return Math.max(0, p.sigmoidMid) + Math.max(1e-3, p.sigmoidWidth) * 3
      case 'QUADRATIC':
      case 'JUMP': return Math.max(0, p.maxThreshold)
      default: return Math.max(0, p.maxThreshold - p.minThreshold)
    }
  })()
  if (!p.ownRange) return Math.max(0, p.minThreshold) + settles
  const shapeSpan = p.maxThreshold - p.minThreshold
  const ownSpan = Math.max(0, p.ownRange.max - p.ownRange.min)
  return p.ownRange.min + ownSpan * (shapeSpan > 0 ? clampUnit(settles / shapeSpan) : 1)
}

// The gyro's own outputs and speed range when a configuration leaves them
// unset (main.cpp: MIN_GYRO_SENS 0 0, MAX_GYRO_SENS 1 1, thresholds 0).
export const GYRO_OUTPUT_DEFAULTS = { minSens: 0, maxSens: 1, minThreshold: 0, maxThreshold: 0 } as const
