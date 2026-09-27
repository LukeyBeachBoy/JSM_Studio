// Steam presents these firmware values in reverse. Keep config values raw for
// compatibility, but present a 0–100 range/guard control with intuitive direction.
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
export const gripRangePercent = (raw: number) =>
  raw < 0 || !Number.isFinite(raw) ? undefined : Math.round((400 - clamp(raw, 25, 400)) / 3.75)
export const gripGuardPercent = (raw: number) =>
  raw < 0 || !Number.isFinite(raw) ? undefined : Math.round((100 - clamp(raw, 25, 100)) / 0.75)
const fromPercent = (value: string, high: number, span: number) => {
  if (value.trim() === '') return ''
  const number = Number(value)
  return Number.isFinite(number) ? String(Math.round(high - clamp(number, 0, 100) * span / 100)) : ''
}
export const gripRangeRaw = (value: string) => fromPercent(value, 400, 375)
export const gripGuardRaw = (value: string) => fromPercent(value, 100, 75)

// The controller stores whole numbers (guard 25–100, range 25–400), and a 1%
// step on the guard is 0.75 of a unit: rounded, it lands back where it started
// and the value cannot climb. When a percent would not move the stored value,
// move it one unit toward the percent instead.
const stepRaw = (toRaw: (value: string) => string, toPercent: (raw: number) => number | undefined, low: number, high: number) =>
  (currentRaw: number | undefined, percent: number) => {
    const raw = toRaw(String(percent))
    const shown = currentRaw === undefined ? undefined : toPercent(currentRaw)
    if (raw === '' || currentRaw === undefined || shown === undefined || shown === percent || Number(raw) !== Math.round(currentRaw)) return raw
    // Percent and the stored value run in opposite directions.
    return String(clamp(Number(raw) + (percent > shown ? -1 : 1), low, high))
  }
export const gripGuardStepRaw = stepRaw(gripGuardRaw, gripGuardPercent, 25, 100)
export const gripRangeStepRaw = stepRaw(gripRangeRaw, gripRangePercent, 25, 400)

// Unset: the controller keeps its own value (hooks/useGripConfig's GRIP_FIRMWARE_DEFAULT).
const FIRMWARE_DEFAULT = -1

/** The Grip sensors row's line on Buttons › Grips: "Touch 62% · release 40 ms". */
export const gripSensorsSummary = (range?: number, leftDelay?: string, rightDelay?: string) => {
  const percent = gripRangePercent(range ?? FIRMWARE_DEFAULT)
  const left = Number.parseFloat(leftDelay ?? '') || 0
  const right = Number.parseFloat(rightDelay ?? '') || 0
  return [
    percent === undefined ? 'Controller’s own sensitivity' : `Sensitivity ${percent}%`,
    left === right ? `release ${left} ms` : `release ${left} / ${right} ms`,
  ].join(' · ')
}
