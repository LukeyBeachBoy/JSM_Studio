// An override that says what the import already says is not an override.
//
// A profile that imports a template writes a line of its own whenever a value
// is changed in the editor. Setting that value back by hand -- typing the
// number the template has, picking the same mode, rebinding the same key --
// used to leave the line in place, still marked "Override", so the profile
// quietly stopped following the template for that value: a later edit to the
// template never reached it. The line is dropped instead, which is exactly
// what "Use inherited" does, only reached by setting the value.
//
// Only the values an edit touched are considered. A redundant override that is
// already in a file when it is opened is the author's business and is left
// alone; the app never rewrites a file just for loading it.
//
// Everything here is pure: `resolve` flattens a profile's own text with its
// imports spliced in (useConfigIncludes' resolveText).

import { includeTarget, stripComment } from './configIncludes'

type Line = { key: string; value: string; comment: string; annotation: boolean }

// `# @label W = Crouch` and `# @icon W = ...` are app data riding on comment
// lines. They are per-input and last-one-wins like any assignment, so they
// take part too; other comments never do.
const ANNOTATION = /^\s*#\s*@(label|icon)\s+([^=\s]+)\s*=\s*(.*)$/i

// A trailing note, quote-aware: a console command in quotes may contain '#'.
function splitComment(text: string) {
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') quoted = !quoted
    else if (char === '#' && !quoted) return { body: text.slice(0, index), comment: text.slice(index + 1).trim() }
  }
  return { body: text, comment: '' }
}

function parseLine(raw: string): Line | null {
  const annotation = raw.match(ANNOTATION)
  if (annotation) {
    return { key: `# @${annotation[1].toLowerCase()} ${annotation[2].toUpperCase()}`, value: annotation[3].trim(), comment: '', annotation: true }
  }
  if (raw.trimStart().startsWith('#') || includeTarget(raw)) return null
  const { body, comment } = splitComment(raw)
  const equals = body.indexOf('=')
  if (equals < 0) return null
  const key = body.slice(0, equals).replace(/\s+/g, '').toUpperCase()
  if (!key) return null
  return { key, value: body.slice(equals + 1).trim(), comment, annotation: false }
}

const isReset = (raw: string) => stripComment(raw).trim().toUpperCase() === 'RESET_MAPPINGS'

// Settings JoyShockMapper stores in one place under more than one name. A
// value only counts as inherited when the line that finally sets it is the
// same key: `GYRO_ON = RS` after `GYRO_OFF = RS` is a different activation,
// and `GYRO_SENS = 2` after `MIN_GYRO_SENS = 2` changes the maximum as well.
// Per-side settings have an unprefixed form that sets both sides.
function family(key: string): Set<string> {
  const comma = key.lastIndexOf(',')
  const prefix = comma >= 0 ? key.slice(0, comma + 1) : ''
  const name = key.slice(prefix.length)
  const names = new Set([name])
  if (name === 'GYRO_ON' || name === 'GYRO_OFF' || name === 'NO_GYRO_BUTTON') ['GYRO_ON', 'GYRO_OFF', 'NO_GYRO_BUTTON'].forEach(n => names.add(n))
  if (name === 'MIN_GYRO_SENS' || name === 'MAX_GYRO_SENS') names.add('GYRO_SENS')
  if (name === 'GYRO_SENS') ['MIN_GYRO_SENS', 'MAX_GYRO_SENS'].forEach(n => names.add(n))
  const side = name.match(/^(LEFT|RIGHT)_(.+)$/)
  if (side) names.add(side[2])
  else if (/_/.test(name)) ['LEFT_', 'RIGHT_'].forEach(p => names.add(p + name))
  return new Set([...names].map(n => prefix + n))
}

/** The line that finally decides `key` in resolved text, or null when nothing (after the last reset) does. */
function decidingLine(resolved: string, key: string): Line | null {
  const names = key.startsWith('# @') ? new Set([key]) : family(key)
  let found: Line | null = null
  for (const raw of resolved.split(/\r?\n/)) {
    if (isReset(raw)) { found = null; continue }
    // A bare NO_GYRO_BUTTON clears the gyro button like an assignment would.
    const bare = stripComment(raw).trim().toUpperCase()
    if (bare && !bare.includes('=') && names.has(bare)) { found = { key: bare, value: '', comment: '', annotation: false }; continue }
    const line = parseLine(raw)
    if (line && names.has(line.key)) found = line
  }
  return found
}

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i

/**
 * Whether two values say the same thing to JoyShockMapper: whitespace is
 * collapsed, numbers compare by value (1 = 1.0 = 1.00), words ignore case, and
 * anything quoted must match exactly. Order is kept -- `W = R E` (tap R,
 * hold E) is not `W = E R`.
 */
export function sameValue(a: string, b: string) {
  const tokens = (value: string) => value.trim().split(/\s+/).filter(Boolean)
  const left = tokens(a), right = tokens(b)
  if (left.length !== right.length) return false
  return left.every((token, index) => {
    const other = right[index]
    if (token === other) return true
    if (token.includes('"') || other.includes('"')) return false
    if (NUMBER.test(token) && NUMBER.test(other)) return Number(token) === Number(other)
    return token.toUpperCase() === other.toUpperCase()
  })
}

const ownLines = (text: string) => {
  const map = new Map<string, Line>()
  for (const raw of text.split(/\r?\n/)) {
    const line = parseLine(raw)
    if (line) map.set(line.key, line)
  }
  return map
}

const withoutKey = (text: string, key: string) =>
  text.split(/\r?\n/).filter(raw => parseLine(raw)?.key !== key).join('\n')

/**
 * Drop the lines an edit made redundant.
 *
 * `before` and `after` are the profile's own text either side of one edit. For
 * each key the edit added or changed, the line is removed when the value the
 * profile would inherit without it is the same value -- decided on the
 * import-resolved text, so a template that sets it, a later template that
 * sets it differently, or a RESET_MAPPINGS in between are all respected.
 *
 * A line is kept when it carries something the template's does not: a
 * trailing note of its own, or a label or icon for the same input that
 * differs from the template's. Dropping it would silently lose the note, or
 * leave the name describing a binding the profile no longer owns.
 */
export function dropRedundantOverrides(before: string, after: string, resolve: (text: string) => string): string {
  if (before === after) return after
  const previous = ownLines(before)
  const next = ownLines(after)
  let text = after
  for (const [key, line] of next) {
    const old = previous.get(key)
    if (old && old.value === line.value && old.comment === line.comment) continue
    const without = withoutKey(text, key)
    const inherited = decidingLine(resolve(without), key)
    if (!inherited || inherited.key !== key || !sameValue(inherited.value, line.value)) continue
    // The profile's line must be the one in force, or removing it changes
    // nothing we can reason about (a line above the import, say).
    const current = decidingLine(resolve(text), key)
    if (!current || current.key !== key || !sameValue(current.value, inherited.value)) continue
    if (line.comment && line.comment !== inherited.comment) continue
    if (!line.annotation) {
      const annotated = ['label', 'icon'].some(kind => {
        const own = next.get(`# @${kind} ${key}`)
        if (!own) return false
        const theirs = decidingLine(resolve(withoutKey(text, own.key)), own.key)
        return own.value !== (theirs?.value ?? '')
      })
      if (annotated) continue
    }
    text = without
  }
  return text
}
