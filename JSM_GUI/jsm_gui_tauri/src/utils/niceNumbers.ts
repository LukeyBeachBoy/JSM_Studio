// Round numbers for graph axes and for values a pointer sets.

/** 1, 2, 2.5 or 5 times a power of ten: a step a person reads at a glance. */
export function niceStep(range: number, count: number) {
  if (!(range > 0)) return 1
  const raw = range / Math.max(1, count)
  const power = Math.pow(10, Math.floor(Math.log10(raw)))
  const fraction = raw / power
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * power
}

/** The next tick at or above `value`. */
export function niceCeil(value: number, count = 6) {
  const step = niceStep(value, count)
  return Math.max(step, Math.ceil(value / step - 1e-9) * step)
}

/** Rounds to a step without the float dust (0.30000000000000004). */
export function snapTo(value: number, step: number) {
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  return Number((Math.round(value / step) * step).toFixed(Math.min(6, digits)))
}
