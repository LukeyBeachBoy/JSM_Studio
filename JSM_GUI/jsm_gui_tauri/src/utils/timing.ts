// The global timing keys (console refinement D8) and how to find them in a
// configuration's own lines.

export const TIMING_KEYS = ['HOLD_PRESS_TIME', 'DBL_PRESS_WINDOW', 'SIM_PRESS_WINDOW', 'TURBO_PERIOD', 'TICK_TIME'] as const
export type TimingKey = (typeof TIMING_KEYS)[number]

/** The default-layer lines of a configuration that set one of the timing keys. */
export const timingLines = (text: string): { key: TimingKey; raw: string }[] => {
  const found: { key: TimingKey; raw: string }[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)\s*=\s*([^#\r\n]*)/.exec(line)
    if (match && (TIMING_KEYS as readonly string[]).includes(match[1])) found.push({ key: match[1] as TimingKey, raw: match[2].trim() })
  }
  return found
}
