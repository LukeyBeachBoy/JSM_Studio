import { removeKeymapEntry, updateKeymapEntry } from './keymap'
import { readVirtualSetting } from './virtualStickSettings'
import {
  GYRO_ACCEL_DEFAULTS,
  GYRO_OUTPUT_DEFAULTS,
  normalizeAccelCurveType,
  type AccelCurveParams,
  type AccelCurveType,
} from './accelCurve'

// Console v2 Gyro (Gyro.dc.html "How fast?", GyroFineTune Speed): one "turn
// speed" over the two ways the mapper can be told how fast gyro aims.
//
//   Static:  GYRO_SENS x [y] -- one sensitivity at every speed (it sets
//            MIN_GYRO_SENS and MAX_GYRO_SENS together in the mapper).
//   Curve:   MIN_GYRO_SENS / MAX_GYRO_SENS between MIN_ / MAX_GYRO_THRESHOLD,
//            shaped by ACCEL_CURVE.
//
// Turn speed is GYRO_SENS's horizontal value when static, or MIN_GYRO_SENS's
// when a curve is on ("Every speed below is measured from this one"):
// changing it scales the fast speed with it and keeps up/down in proportion.
//
// Unset, the mapper runs MIN_GYRO_SENS 0, MAX_GYRO_SENS 1 with both thresholds
// at 0, which is 1x at every speed, so an empty file reads as a static 1x.

export type Pair = [number, number]

export type GyroSpeedState = {
  mode: 'static' | 'accel'
  /** Turn speed: GYRO_SENS x (static) or MIN_GYRO_SENS x (curve). */
  base: number
  /** Up/down at the turn speed. */
  baseY: number
  min: Pair
  max: Pair
  minThreshold: number
  maxThreshold: number
  curve: AccelCurveType
  /** Up/down differs from left/right anywhere. */
  separateY: boolean
}

const SHAPE_KEYS = ['ACCEL_NATURAL_VHALF', 'ACCEL_POWER_VREF', 'ACCEL_POWER_EXPONENT', 'ACCEL_SIGMOID_MID', 'ACCEL_SIGMOID_WIDTH', 'ACCEL_JUMP_TAU'] as const
const CURVE_KEYS = ['MIN_GYRO_SENS', 'MAX_GYRO_SENS', 'MIN_GYRO_THRESHOLD', 'MAX_GYRO_THRESHOLD', 'ACCEL_CURVE', ...SHAPE_KEYS] as const

export const round4 = (value: number) => Number(value.toFixed(4))

export function readPair(text: string, key: string, prefix = ''): Pair | undefined {
  const raw = readVirtualSetting(text, key, prefix)
  if (raw === undefined) return undefined
  const parts = raw.trim().split(/\s+/).map(Number).filter(Number.isFinite)
  if (!parts.length) return undefined
  return [parts[0], parts[1] ?? parts[0]]
}

export function readNumber(text: string, key: string, fallback: number, prefix = '') {
  const raw = readVirtualSetting(text, key, prefix)
  const value = raw === undefined ? NaN : Number(raw.trim().split(/\s+/)[0])
  return Number.isFinite(value) ? value : fallback
}

/** A pair as the mapper reads it: one number when both axes agree. */
const pairValues = ([x, y]: Pair): number[] => (round4(x) === round4(y) ? [round4(x)] : [round4(x), round4(y)])

export function writePair(text: string, key: string, pair: Pair, prefix = '') {
  return updateKeymapEntry(text, prefix + key, pairValues(pair))
}

export function readGyroSpeed(text: string, prefix = ''): GyroSpeedState {
  const gyroSens = readPair(text, 'GYRO_SENS', prefix)
  const minSens = readPair(text, 'MIN_GYRO_SENS', prefix)
  const maxSens = readPair(text, 'MAX_GYRO_SENS', prefix)
  const curveSet = CURVE_KEYS.some(key => readVirtualSetting(text, key, prefix) !== undefined)
  const mode: 'static' | 'accel' = gyroSens ? 'static' : curveSet ? 'accel' : 'static'
  const min: Pair = minSens ?? [GYRO_OUTPUT_DEFAULTS.minSens, GYRO_OUTPUT_DEFAULTS.minSens]
  const max: Pair = maxSens ?? [GYRO_OUTPUT_DEFAULTS.maxSens, GYRO_OUTPUT_DEFAULTS.maxSens]
  const staticPair: Pair = gyroSens ?? maxSens ?? [1, 1]
  const base = mode === 'static' ? staticPair[0] : min[0]
  const baseY = mode === 'static' ? staticPair[1] : min[1]
  const separateY = mode === 'static' ? round4(staticPair[0]) !== round4(staticPair[1]) : round4(min[0]) !== round4(min[1]) || round4(max[0]) !== round4(max[1])
  return {
    mode, base, baseY, min, max, separateY,
    minThreshold: readNumber(text, 'MIN_GYRO_THRESHOLD', GYRO_OUTPUT_DEFAULTS.minThreshold, prefix),
    maxThreshold: readNumber(text, 'MAX_GYRO_THRESHOLD', GYRO_OUTPUT_DEFAULTS.maxThreshold, prefix),
    curve: normalizeAccelCurveType(readVirtualSetting(text, 'ACCEL_CURVE', prefix)),
  }
}

/** The curve the mapper evaluates for left/right (or up/down), with its shape. */
export function gyroCurveParams(text: string, prefix = '', axis: 'x' | 'y' = 'x'): AccelCurveParams {
  const speed = readGyroSpeed(text, prefix)
  const i = axis === 'x' ? 0 : 1
  const shape = {
    naturalVHalf: readNumber(text, 'ACCEL_NATURAL_VHALF', GYRO_ACCEL_DEFAULTS.naturalVHalf, prefix),
    powerVRef: readNumber(text, 'ACCEL_POWER_VREF', GYRO_ACCEL_DEFAULTS.powerVRef, prefix),
    powerExponent: readNumber(text, 'ACCEL_POWER_EXPONENT', GYRO_ACCEL_DEFAULTS.powerExponent, prefix),
    sigmoidMid: readNumber(text, 'ACCEL_SIGMOID_MID', GYRO_ACCEL_DEFAULTS.sigmoidMid, prefix),
    sigmoidWidth: readNumber(text, 'ACCEL_SIGMOID_WIDTH', GYRO_ACCEL_DEFAULTS.sigmoidWidth, prefix),
    jumpTau: readNumber(text, 'ACCEL_JUMP_TAU', GYRO_ACCEL_DEFAULTS.jumpTau, prefix),
  }
  if (speed.mode === 'static') {
    const value = i === 0 ? speed.base : speed.baseY
    return { curveType: 'LINEAR', minSens: value, maxSens: value, minThreshold: 0, maxThreshold: 0, ...shape }
  }
  return { curveType: speed.curve, minSens: speed.min[i], maxSens: speed.max[i], minThreshold: speed.minThreshold, maxThreshold: speed.maxThreshold, ...shape }
}

/** Turn speed: scales whatever is in force, keeping up/down and the fast speed in proportion. */
export function writeTurnSpeed(text: string, value: number, prefix = '', readText = text) {
  if (!Number.isFinite(value) || value < 0) return text
  const state = readGyroSpeed(readText, prefix)
  if (state.mode === 'static') {
    const ratio = state.base > 0 ? state.baseY / state.base : 1
    return writePair(text, 'GYRO_SENS', [value, value * ratio], prefix)
  }
  if (state.min[0] > 0) {
    const factor = value / state.min[0]
    let next = writePair(text, 'MIN_GYRO_SENS', [value, state.min[1] * factor], prefix)
    next = writePair(next, 'MAX_GYRO_SENS', [state.max[0] * factor, state.max[1] * factor], prefix)
    return next
  }
  return writePair(text, 'MIN_GYRO_SENS', [value, value], prefix)
}

/** Up/down speeds follow left/right (the "Separate up/down speeds" toggle off). */
export function joinVerticalSpeeds(text: string, prefix = '', readText = text) {
  const state = readGyroSpeed(readText, prefix)
  if (state.mode === 'static') return writePair(text, 'GYRO_SENS', [state.base, state.base], prefix)
  let next = writePair(text, 'MIN_GYRO_SENS', [state.min[0], state.min[0]], prefix)
  next = writePair(next, 'MAX_GYRO_SENS', [state.max[0], state.max[0]], prefix)
  return next
}

// ---- Speed up fast turns (GyroFineTune): Off / Gentle / Strong / Custom.
// Values chosen from today's defaults (IMPLEMENTATION.md D7) and documented in
// design/console-v2/notes/GYRO.md. Both are LINEAR (no ACCEL_CURVE line), from
// the turn speed at MIN_GYRO_THRESHOLD to turn speed x factor at MAX_GYRO_THRESHOLD.
export type SpeedUpPreset = 'off' | 'gentle' | 'strong'
export const SPEED_UP_PRESETS: Record<Exclude<SpeedUpPreset, 'off'>, { factor: number; minThreshold: number; maxThreshold: number }> = {
  gentle: { factor: 1.5, minThreshold: 5, maxThreshold: 75 },
  strong: { factor: 2.5, minThreshold: 5, maxThreshold: 50 },
}

export function detectSpeedUp(text: string, prefix = ''): SpeedUpPreset | 'custom' {
  const state = readGyroSpeed(text, prefix)
  if (state.mode === 'static') return 'off'
  if (state.curve !== 'LINEAR' || state.min[0] <= 0) return 'custom'
  const ratio = state.max[0] / state.min[0]
  const ratioY = state.min[1] > 0 ? state.max[1] / state.min[1] : ratio
  for (const [name, preset] of Object.entries(SPEED_UP_PRESETS) as [Exclude<SpeedUpPreset, 'off'>, typeof SPEED_UP_PRESETS.gentle][]) {
    if (Math.abs(ratio - preset.factor) < 0.011 && Math.abs(ratioY - preset.factor) < 0.011
      && state.minThreshold === preset.minThreshold && state.maxThreshold === preset.maxThreshold) return name
  }
  return 'custom'
}

const removeAll = (text: string, keys: readonly string[], prefix: string) => keys.reduce((next, key) => removeKeymapEntry(next, prefix + key), text)

/** Off goes back to one speed (GYRO_SENS) at the turn speed; Gentle / Strong write a linear curve from it. */
export function applySpeedUp(text: string, preset: SpeedUpPreset, prefix = '', readText = text) {
  const state = readGyroSpeed(readText, prefix)
  const base: Pair = [state.base, state.baseY]
  if (preset === 'off') {
    const next = removeAll(text, CURVE_KEYS, prefix)
    return writePair(next, 'GYRO_SENS', base, prefix)
  }
  const spec = SPEED_UP_PRESETS[preset]
  let next = removeKeymapEntry(text, prefix + 'GYRO_SENS')
  next = removeAll(next, ['ACCEL_CURVE', ...SHAPE_KEYS], prefix)
  next = writePair(next, 'MIN_GYRO_SENS', base, prefix)
  next = writePair(next, 'MAX_GYRO_SENS', [base[0] * spec.factor, base[1] * spec.factor], prefix)
  next = updateKeymapEntry(next, prefix + 'MIN_GYRO_THRESHOLD', [spec.minThreshold])
  next = updateKeymapEntry(next, prefix + 'MAX_GYRO_THRESHOLD', [spec.maxThreshold])
  return next
}

/** The curve Gentle or Strong would draw from the turn speed (the Speed visual's comparison lines). */
export function speedUpPreviewParams(base: number, preset: Exclude<SpeedUpPreset, 'off'>): AccelCurveParams {
  const spec = SPEED_UP_PRESETS[preset]
  return { curveType: 'LINEAR', minSens: base, maxSens: base * spec.factor, minThreshold: spec.minThreshold, maxThreshold: spec.maxThreshold, ...GYRO_ACCEL_DEFAULTS }
}

/** Static ↔ curve, keeping what is in force (the curve picker's "Off" card). */
export function setCurveType(text: string, type: AccelCurveType | 'OFF', prefix = '', readText = text) {
  const state = readGyroSpeed(readText, prefix)
  if (type === 'OFF') return applySpeedUp(text, 'off', prefix, readText)
  let next = text
  if (state.mode === 'static') {
    // A static speed becomes the slow speed of a Gentle-shaped curve, so the
    // shape is visible at once rather than a flat line.
    next = applySpeedUp(next, 'gentle', prefix, readText)
  }
  next = type === 'LINEAR' ? removeKeymapEntry(next, prefix + 'ACCEL_CURVE') : updateKeymapEntry(next, prefix + 'ACCEL_CURVE', [type])
  return next
}

export const CURVE_WORDS: Record<AccelCurveType | 'OFF', string> = {
  OFF: 'One speed at every turn speed',
  LINEAR: 'Rises evenly from the slow point to the fast point',
  NATURAL: 'Rises quickly, then levels off',
  POWER: 'Eases in along a power law',
  QUADRATIC: 'Flat at first, then bends upwards',
  SIGMOID: 'Eases in, then out, around a midpoint',
  JUMP: 'Holds low, then climbs sharply',
}
