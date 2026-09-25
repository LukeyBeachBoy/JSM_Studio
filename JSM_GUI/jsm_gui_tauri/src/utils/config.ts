const REQUIRED_HEADER_LINES = [
  { pattern: /^RESET_MAPPINGS\b/i, value: 'RESET_MAPPINGS' },
  { pattern: /^AUTOCONNECT\b/i, value: 'AUTOCONNECT = ON' },
  { pattern: /^TELEMETRY_ENABLED\b/i, value: 'TELEMETRY_ENABLED = ON' },
  { pattern: /^TELEMETRY_PORT\b/i, value: 'TELEMETRY_PORT = 8974' },
]

const CALIBRATION_PATTERNS = [
  /^RESET_MAPPINGS\b/i,
  /^AUTOCONNECT\b/i,
  /^TELEMETRY_ENABLED\b/i,
  /^TELEMETRY_PORT\b/i,
  /^RESTART_GYRO_CALIBRATION\b/i,
  /^FINISH_GYRO_CALIBRATION\b/i,
  /^SLEEP\b/i,
  /^COUNTER_OS_MOUSE_SPEED\b/i,
]

/**
 * Puts the settings a configuration must have at the top of it.
 *
 * Only for a configuration that IS one. A file meant to be imported -- a shared
 * template -- deliberately has no RESET_MAPPINGS, because the profile importing
 * it has already run its own, and a second one part-way through the load wipes
 * everything above the import line. It also makes the mapper report the template
 * as the configuration it is running, since that is the file whose
 * RESET_MAPPINGS it saw last: "Currently applied: FPS Template".
 *
 * So the absence of RESET_MAPPINGS is taken as deliberate and left alone. Studio
 * seeds a new profile with the header already, so a real profile always has one
 * to find.
 */
export const ensureHeaderLines = (text: string) => {
  const lines = text.split(/\r?\n/)
  if (!lines.some(line => /^RESET_MAPPINGS\b/i.test(line.trim()))) return text
  const remaining: string[] = []
  lines.forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) {
      remaining.push(line)
      return
    }
    if (REQUIRED_HEADER_LINES.some(entry => entry.pattern.test(trimmed))) {
      return
    }
    remaining.push(line)
  })
  const header = REQUIRED_HEADER_LINES.map(entry => entry.value)
  const rest = remaining.join('\n').trimStart()
  return rest ? `${header.join('\n')}\n${rest}` : header.join('\n')
}

export const sanitizeImportedConfig = (rawText: string) => {
  const withoutComments = rawText
    .split(/\r?\n/)
    .map(line => {
      // These comments are portable editor data, including entire named layers.
      if (/^\s*#\s*@(label|icon|overlay|layer)\b/i.test(line)) return line.trim()
      const hashIndex = line.indexOf('#')
      const withoutHash = hashIndex >= 0 ? line.slice(0, hashIndex) : line
      return withoutHash.trim()
    })
    .filter(line => line.length > 0 && !CALIBRATION_PATTERNS.some(pattern => pattern.test(line)))
    .join('\n')

  return ensureHeaderLines(withoutComments)
}

export const upsertFlagCommand = (text: string, key: string, enabled: boolean) => {
  const lines = text.split(/\r?\n/).filter(line => {
    const trimmed = line.trim().toUpperCase()
    if (!trimmed) return true
    return !(trimmed === key.toUpperCase() || trimmed.startsWith(`${key.toUpperCase()} `) || trimmed.startsWith(`${key.toUpperCase()}=`))
  })
  if (enabled) {
    lines.push(key)
  }
  return lines.join('\n')
}
