import { readableSetting } from './layers'

// How far two versions of a configuration are apart, in the reader's terms:
// the state button says "Apply 3 changes" and Undo names what it undoes
// (console refinement 1e). A change is a setting (or comment line) whose
// value differs, not a line of text, so re-ordering or a blank line is none.

const entriesOf = (text: string) => {
  const entries = new Map<string, string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const at = line.indexOf('=')
    // Comment lines (labels, icons, layers) are their own key.
    if (line.startsWith('#') || at < 0) { entries.set(line, line); continue }
    entries.set(line.slice(0, at).trim().toUpperCase(), line.slice(at + 1).trim())
  }
  return entries
}

const changedKeys = (from: string, to: string) => {
  const a = entriesOf(from), b = entriesOf(to)
  const keys: string[] = []
  for (const [key, value] of b) if (a.get(key) !== value) keys.push(key)
  for (const key of a.keys()) if (!b.has(key)) keys.push(key)
  return keys
}

/** How many settings differ between two texts. */
export const countChanges = (from: string, to: string) => changedKeys(from, to).length

/** A name for what changed from one text to the next, e.g. "Smoothing time". */
export const describeChange = (from: string | undefined, to: string): string | null => {
  if (from === undefined) return null
  const keys = changedKeys(from, to)
  if (!keys.length) return null
  const key = keys[0]
  const label = key.startsWith('#') ? 'A label' : readableSetting(key)
  return keys.length > 1 ? `${label} and ${keys.length - 1} more` : label
}
