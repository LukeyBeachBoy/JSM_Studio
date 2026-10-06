// The global timing keys (console refinement D8) and how to find them in a
// configuration's own lines.

export const TIMING_KEYS = ['HOLD_PRESS_TIME', 'DBL_PRESS_WINDOW', 'SIM_PRESS_WINDOW', 'TURBO_PERIOD', 'TICK_TIME'] as const
export type TimingKey = (typeof TIMING_KEYS)[number]

// Native assignments are milliseconds, including fractional/small values.
// A magnitude heuristic cannot distinguish an old GUI bug from a valid JSM
// profile and must not silently change its semantics during migration.
export const timingMilliseconds = (raw: string): number | null => {
  if (!raw.trim()) return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

/** The default-layer lines of a configuration that set one of the timing keys. */
export const timingLines = (text: string): { key: TimingKey; raw: string }[] => {
  const found = new Map<TimingKey, string>()
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)\s*=\s*([^#\r\n]*)/i.exec(line)
    const key = match?.[1].toUpperCase()
    if (match && key && (TIMING_KEYS as readonly string[]).includes(key)) found.set(key as TimingKey, match[2].trim())
  }
  return [...found].map(([key, raw]) => ({ key, raw }))
}
