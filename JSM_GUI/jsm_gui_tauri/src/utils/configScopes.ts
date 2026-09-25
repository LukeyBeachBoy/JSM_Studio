function scopeKey(line: string): string | null {
  const label = line.match(/^\s*#\s*@label\s+([^=]+)=/i)
  if (label) return label[1].trim()
  if (!line.includes('=') || line.trimStart().startsWith('#')) return null
  return line.split('=')[0].trim().split(',').pop()?.trim() ?? null
}
export function scopedConfig(text: string, match: RegExp): string {
  const entries = new Map<string, string>()
  text.split(/\r?\n/).forEach(line => {
    const key = scopeKey(line)
    if (key !== null && match.test(key)) {
      const index = line.indexOf('=')
      const identity = line.slice(0, index).trim()
      entries.set(identity, line.slice(index + 1).split('#')[0].trim())
    }
  })
  return [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key} = ${value}`).join('\n')
}
export function replaceScope(text: string, replacement: string, match: RegExp): string {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(line => !!scopedConfig(line, match))
  const retained = lines.filter(line => !scopedConfig(line, match))
  retained.splice(start < 0 ? retained.length : start, 0, ...replacement.split(/\r?\n/).filter(Boolean))
  return retained.join('\n')
}
