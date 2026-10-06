// Curated mode-specific controls. Defaults and semantics follow main.cpp's
// registrations and JoyShock.cpp's processing branches, not Steam terminology.
import { readVirtualSetting, writeVirtualSetting } from './virtualStickSettings'

export type ModeNumber = { key: string; label: string; help: string; default: number; min: number; max: number; step: number; unit?: string; axis?: 0 | 1 }
export const MODE_NUMBERS: Record<string, ModeNumber[]> = {
  HYBRID_AIM: [
    { key: 'MOUSELIKE_FACTOR', axis: 0, label: 'Relative movement · horizontal', help: 'Camera movement from changes in stick position, combined with continuous aim at the edge.', default: 90, min: 0, max: 1200, step: 5 },
    { key: 'MOUSELIKE_FACTOR', axis: 1, label: 'Relative movement · vertical', help: 'Independent vertical relative sensitivity. These values are shared across sources using Hybrid aim.', default: 90, min: 0, max: 1200, step: 5 },
    { key: 'RETURN_DEADZONE_ANGLE', label: 'Return suppression angle', help: 'Suppresses unintended camera movement while returning the stick towards its centre. Suppression fades towards the cutoff angle.', default: 45, min: 0, max: 90, step: 1, unit: '°' },
    { key: 'RETURN_DEADZONE_ANGLE_CUTOFF', label: 'Return suppression cutoff', help: 'Return suppression finishes fading at this angle. Keep it greater than the return suppression angle.', default: 90, min: 0, max: 90, step: 1, unit: '°' },
  ],
  ANGLE: [
    { key: 'ANGLE_TO_AXIS_DEADZONE_INNER', label: 'Angular centre deadzone', help: 'Ignores small direction changes around the axis centre. The source’s ordinary circular deadzone still controls engagement.', default: 0, min: 0, max: 89, step: 1, unit: '°' },
    { key: 'ANGLE_TO_AXIS_DEADZONE_OUTER', label: 'Angular endpoint tolerance', help: 'Treats directions this close to the positive or negative endpoint as full output. The two angular deadzones must total less than 90°.', default: 10, min: 0, max: 89, step: 1, unit: '°' },
  ],
  WIND: [
    { key: 'WIND_STICK_RANGE', label: 'Full winding range', help: 'Accumulated circular stick movement from minimum to maximum virtual output. Multiple turns can provide fine steering.', default: 900, min: 1, max: 7200, step: 90, unit: '°' },
    { key: 'WIND_STICK_POWER', label: 'Winding response curve', help: 'Changes sensitivity near neutral. 1 is linear; larger values give finer control near the centre.', default: 1, min: 0.01, max: 8, step: 0.1 },
    { key: 'UNWIND_RATE', label: 'Return to neutral', help: 'How quickly accumulated winding returns when the source is no longer engaged. 0 holds its winding position.', default: 1800, min: 0, max: 20000, step: 90, unit: '°/s' },
  ],
  ROTATE: [{ key: 'ROTATE_SMOOTH_OVERRIDE', label: 'Rotation smoothing threshold', help: 'Movement threshold below which rotation is smoothed. -1 uses JSM’s automatic threshold.', default: -1, min: -1, max: 100, step: 0.1 }],
  MOUSE_RING: [
    { key: 'MOUSE_RING_RADIUS', label: 'Cursor ring radius', help: 'Cursor distance from screen centre when pointing the source in a direction.', default: 128, min: 0, max: 4000, step: 10, unit: 'px' },
    { key: 'SCREEN_RESOLUTION_X', label: 'Desktop width', help: 'Horizontal resolution used to place the cursor ring around screen centre.', default: 1920, min: 1, max: 16384, step: 10, unit: 'px' },
    { key: 'SCREEN_RESOLUTION_Y', label: 'Desktop height', help: 'Vertical resolution used to place the cursor ring around screen centre.', default: 1080, min: 1, max: 16384, step: 10, unit: 'px' },
  ],
}

export function modeNumberFields(mode: string) {
  if (mode.includes('_ANGLE_TO_')) return MODE_NUMBERS.ANGLE
  if (mode.endsWith('_WIND_X')) return MODE_NUMBERS.WIND
  if (mode === 'FLICK' || mode === 'ROTATE_ONLY') return MODE_NUMBERS.ROTATE
  return MODE_NUMBERS[mode] ?? []
}

export function readModeNumber(text: string, meta: ModeNumber) {
  const parts = (readVirtualSetting(text, meta.key) ?? '').trim().split(/\s+/).map(Number)
  const value = meta.axis === undefined ? parts[0] : parts[meta.axis] ?? parts[0]
  return readVirtualSetting(text, meta.key) !== undefined && Number.isFinite(value) ? value : meta.default
}

export function writeModeNumber(text: string, meta: ModeNumber, value: number, readText = text) {
  if (!Number.isFinite(value) || value < meta.min || value > meta.max) return text
  if (meta.key.startsWith('ANGLE_TO_AXIS_')) {
    const other = MODE_NUMBERS.ANGLE.find(field => field.key !== meta.key)!
    if (value + readModeNumber(readText, other) >= 90) return text
  }
  if (meta.key.startsWith('RETURN_DEADZONE_ANGLE')) {
    const low = meta.key === 'RETURN_DEADZONE_ANGLE' ? value : readModeNumber(readText, MODE_NUMBERS.HYBRID_AIM[2])
    const high = meta.key === 'RETURN_DEADZONE_ANGLE_CUTOFF' ? value : readModeNumber(readText, MODE_NUMBERS.HYBRID_AIM[3])
    if (low >= high) return text
  }
  if (meta.axis !== undefined) {
    const peer = MODE_NUMBERS.HYBRID_AIM.find(field => field.key === meta.key && field.axis !== meta.axis)!
    const other = readModeNumber(readText, peer)
    const pair = meta.axis === 0 ? [value, other] : [other, value]
    return writeVirtualSetting(text, meta.key, pair[0] === pair[1] ? pair[0] : pair.join(' '))
  }
  return writeVirtualSetting(text, meta.key, value)
}
