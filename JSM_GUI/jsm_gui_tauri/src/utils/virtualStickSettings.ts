import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from './keymap'

export type VirtualStickTarget = 'LEFT_STICK' | 'RIGHT_STICK'
export const isVirtualStickTarget = (value?: string): value is VirtualStickTarget => value === 'LEFT_STICK' || value === 'RIGHT_STICK'

// Curated metadata for the native virtual-output pipeline. VIRTUAL_SCALE
// belongs to the physical stick contribution; it must never be sold as gyro gain.
export const VIRTUAL_STICK_FIELDS = {
  UNDEADZONE_INNER: { label: 'Inner anti-deadzone', default: 0, min: 0, max: 0.999, step: 0.01, unit: '%', factor: 100,
    hint: 'Counter the game’s inner deadzone; use the test signal to measure it.',
    help: 'Matches the game’s inner stick deadzone. A game with a 20% deadzone needs about 20%. Enable Deadzone test signal to find the largest value that does not turn the camera; disable it after tuning.' },
  UNDEADZONE_OUTER: { label: 'Outer range correction', default: 0, min: 0, max: 0.999, step: 0.01, unit: '%', factor: 100,
    hint: 'Correct where the game reaches maximum stick output.',
    help: 'Distance below the theoretical edge treated as full output. 5% caps the corrected radius at 95%. Inner and outer corrections must total less than 100%.' },
  UNPOWER: { label: 'Game response exponent', default: 0, min: 0, max: 8, step: 0.1, unit: '', factor: 1,
    hint: 'Compensate a nonlinear game response curve.',
    help: 'Cancels a game power curve with its inverse. 0 or 1 means linear; 2 compensates a squared response. It cannot undo time-based game acceleration or different curves on each axis.' },
  VIRTUAL_SCALE: { label: 'Physical stick contribution', default: 1, min: 0, max: 4, step: 0.05, unit: '×', factor: 1,
    hint: 'Mix physical stick aiming with gyro camera velocity.',
    help: 'Scales the physical stick’s camera velocity before combining it with gyro. This does not change gyro sensitivity. Reduce it when the game’s high stick sensitivity makes ordinary stick aiming too fast.' },
} as const

export type VirtualStickField = keyof typeof VIRTUAL_STICK_FIELDS

export const DEADZONE_PROBE_HELP = 'Sends the inner anti-deadzone radius while the controller rests, so you can find the game’s deadzone. Turn it off after calibration for zero idle output. Existing profiles default to On.'

export function readVirtualSetting(text: string, key: string, prefix = '') {
  return getKeymapValue(text, prefix + key) ?? (prefix ? getKeymapValue(text, key) : undefined)
}

export function virtualStickValues(text: string, target: VirtualStickTarget, prefix = '') {
  const read = (field: VirtualStickField) => {
    const raw = readVirtualSetting(text, target + '_' + field, prefix)
    const value = raw === undefined ? NaN : Number(raw)
    return Number.isFinite(value) ? value : VIRTUAL_STICK_FIELDS[field].default
  }
  return { inner: read('UNDEADZONE_INNER'), outer: read('UNDEADZONE_OUTER'), exponent: read('UNPOWER'), scale: read('VIRTUAL_SCALE'),
    probe: (readVirtualSetting(text, target + '_DEADZONE_PROBE', prefix) ?? 'ON') === 'ON',
    maxSpeed: Number(readVirtualSetting(text, 'VIRTUAL_STICK_CALIBRATION', prefix) ?? 360) }
}

export function virtualStickProblem(values: ReturnType<typeof virtualStickValues>) {
  if (!Number.isFinite(values.maxSpeed) || values.maxSpeed <= 0) return 'Maximum game turn rate must be greater than zero.'
  if (values.inner < 0 || values.outer < 0 || values.inner + values.outer >= 1) return 'Inner and outer range corrections must total less than 100%.'
  if (values.exponent < 0) return 'A negative game response exponent cannot provide stable curve compensation.'
  return null
}

// Static curve illustration, not live processing. Mirrors the radial inverse
// mapping in JoyShock::processGyroStick, including its 1% response cutoff.
export function correctedStickRadius(normalizedVelocity: number, inner: number, outer: number, exponent: number, probe = true) {
  if (inner + outer >= 1 || inner < 0 || outer < 0 || exponent < 0 || !Number.isFinite(normalizedVelocity)) return 0
  const strength = Math.pow(Math.max(0, Math.min(1, normalizedVelocity)), 1 / (exponent || 1))
  return strength > 0.01 ? inner + strength * (1 - inner - outer) : normalizedVelocity === 0 && probe ? inner : 0
}

// Targeted writes preserve all other lines and this assignment's inline notes.
// The layer-aware app setter folds this ordinary syntax into the selected layer.
export function writeVirtualSetting(text: string, key: string, value: string | number, prefix = '') {
  const scoped = prefix + key
  if (value === '') return removeKeymapEntry(text, scoped)
  const escaped = scoped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^\\s*${escaped}\\s*=`, 'i')
  const matches = text.split(/\r?\n/).filter(line => pattern.test(line))
  const old = matches[matches.length - 1]
  const comment = old?.match(/\s+#.*$/)?.[0] ?? ''
  const next = updateKeymapEntry(text, scoped, [value])
  if (!comment) return next
  const lines = next.split('\n')
  let index = lines.length - 1
  while (index >= 0 && !pattern.test(lines[index])) index--
  lines[index] += comment
  return lines.join('\n')
}

export function writeVirtualStickNumber(text: string, target: VirtualStickTarget, field: VirtualStickField, value: number, readText = text, prefix = '') {
  const meta = VIRTUAL_STICK_FIELDS[field]
  if (!Number.isFinite(value) || value < meta.min || value > meta.max) return text
  const current = virtualStickValues(readText, target, prefix)
  if (field === 'UNDEADZONE_INNER' && value + current.outer >= 1) return text
  if (field === 'UNDEADZONE_OUTER' && value + current.inner >= 1) return text
  return writeVirtualSetting(text, target + '_' + field, value, prefix)
}
