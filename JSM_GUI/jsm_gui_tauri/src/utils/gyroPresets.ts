import { removeKeymapEntry, updateKeymapEntry } from './keymap'
import { readVirtualSetting } from './virtualStickSettings'

// Console v2 Gyro presets (IMPLEMENTATION.md D7): each maps to numbers chosen
// from today's defaults, and reads "Custom" when the current numbers match
// none. Every value here is listed in design/console-v2/notes/GYRO.md.

// ---- Steadiness (GyroSteadiness "Steady small movements").
// Over the per-mode noise keys only. The adaptive (One Euro) filter's on/off is
// global to the configuration, so it is never part of a preset; it stays under
// Steadiness ▸ Advanced ▸ Adaptive filter.
export type SteadinessPreset = 'off' | 'light' | 'medium' | 'heavy'
export const STEADINESS_KEYS = ['GYRO_CUTOFF_SPEED', 'GYRO_CUTOFF_RECOVERY', 'GYRO_SMOOTH_THRESHOLD', 'GYRO_SMOOTH_TIME'] as const
type SteadinessKey = typeof STEADINESS_KEYS[number]
/** Mapper defaults: no cutoff, no smoothing (threshold 0), a 0.125 s window. */
export const STEADINESS_DEFAULTS: Record<SteadinessKey, number> = { GYRO_CUTOFF_SPEED: 0, GYRO_CUTOFF_RECOVERY: 0, GYRO_SMOOTH_THRESHOLD: 0, GYRO_SMOOTH_TIME: 0.125 }
export const STEADINESS_PRESETS: Record<SteadinessPreset, Record<SteadinessKey, number>> = {
  off: { ...STEADINESS_DEFAULTS },
  // Chosen by running the filter model (utils/gyroSteadiness) over a still hand: about -50%, -70%
  // and nearly all of the wobble, for about 0, 25 and 75 ms of delay on slow aim. Real turns are untouched.
  light: { GYRO_CUTOFF_SPEED: 0, GYRO_CUTOFF_RECOVERY: 0, GYRO_SMOOTH_THRESHOLD: 5, GYRO_SMOOTH_TIME: 0.08 },
  medium: { GYRO_CUTOFF_SPEED: 0.3, GYRO_CUTOFF_RECOVERY: 1, GYRO_SMOOTH_THRESHOLD: 6, GYRO_SMOOTH_TIME: 0.1 },
  heavy: { GYRO_CUTOFF_SPEED: 0.5, GYRO_CUTOFF_RECOVERY: 2, GYRO_SMOOTH_THRESHOLD: 10, GYRO_SMOOTH_TIME: 0.15 },
}
export const STEADINESS_LABELS: Record<SteadinessPreset, string> = { off: 'Off', light: 'Light', medium: 'Medium', heavy: 'Heavy' }

const numberAt = (text: string, key: string, fallback: number) => {
  const value = Number((readVirtualSetting(text, key) ?? '').trim().split(/\s+/)[0])
  return (readVirtualSetting(text, key) ?? '').trim() === '' || !Number.isFinite(value) ? fallback : value
}

export function readSteadiness(text: string): Record<SteadinessKey, number> {
  return Object.fromEntries(STEADINESS_KEYS.map(key => [key, numberAt(text, key, STEADINESS_DEFAULTS[key])])) as Record<SteadinessKey, number>
}

export function detectSteadiness(text: string): SteadinessPreset | 'custom' {
  const current = readSteadiness(text)
  // Off ignores the window length: with the threshold at 0 nothing is smoothed.
  if (current.GYRO_CUTOFF_SPEED === 0 && current.GYRO_CUTOFF_RECOVERY === 0 && current.GYRO_SMOOTH_THRESHOLD === 0) return 'off'
  for (const name of ['light', 'medium', 'heavy'] as const) {
    const preset = STEADINESS_PRESETS[name]
    if (STEADINESS_KEYS.every(key => Math.abs(current[key] - preset[key]) < 1e-6)) return name
  }
  return 'custom'
}

/**
 * Defaults are written as "no line", so Off leaves the file as it was before steadying was
 * touched. A held variant (`explicit`) writes them instead: a missing line there means "follow
 * the base", which may not be Off.
 */
export function applySteadiness(text: string, preset: SteadinessPreset, explicit = false) {
  const values = STEADINESS_PRESETS[preset]
  return STEADINESS_KEYS.reduce((next, key) => values[key] === STEADINESS_DEFAULTS[key] && !explicit ? removeKeymapEntry(next, key) : updateKeymapEntry(next, key, [values[key]]), text)
}

// ---- Rumble while aiming (GyroRumble). GYRO_HAPTIC_INTENSITY, 0-100.
export type RumblePreset = 'off' | 'light' | 'medium' | 'strong'
export const RUMBLE_PRESETS: Record<RumblePreset, number> = { off: 0, light: 25, medium: 50, strong: 100 }
export const RUMBLE_LABELS: Record<RumblePreset, string> = { off: 'Off', light: 'Light', medium: 'Medium', strong: 'Strong' }
export function detectRumble(intensity: number): RumblePreset | 'custom' {
  const match = (Object.entries(RUMBLE_PRESETS) as [RumblePreset, number][]).find(([, value]) => value === intensity)
  return match ? match[0] : 'custom'
}

// ---- Toggles over numbers (GyroSteadiness, Gyro front).
/** "Steady while clicking" on: GYRO_CLICK_DAMPEN. 0.75 keeps a quarter of the shove. */
export const CLICK_DAMPEN_ON = 0.75
/** "Snap to straight lines" on: GYRO_ANGLE_SNAP, in degrees. */
export const ANGLE_SNAP_ON = 6
/** Front "Small aim wobbles" on: the Steadiness preset it applies. */
export const WOBBLE_FIX_PRESET: SteadinessPreset = 'medium'
