import { getKeymapValue } from './keymap'
import type { ButtonDefinition } from '../keymap/schema'

export type ModeshiftTarget = {
  id: string
  title: string
  // The input's own definition travels with it so a shifted editor can render
  // the same card the unshifted input does, names and descriptions included.
  buttons: { command: string; label: string; definition?: ButtonDefinition }[]
  settings?: string[]
  mode?: { key: string; options: { value: string; label: string }[]; defaultValue: string }
  grid?: { sizeKey: string; clickKey: string; stickKey: string; clickButton: string; prefix: string }
  // Set for a trackpad. A pad is one physical input with several modes, and a
  // shift can select any of them -- including the one it is already in, with
  // different bindings. The editor renders the pad's own mode UI rather than a
  // modeshift-specific imitation of it, so anything the normal card can
  // configure a shifted card can configure too.
  pad?: { side: 'left' | 'right'; keyPrefix: 'LEFT' | 'RIGHT' }
}

// Every per-pad setting a shift can carry. Used both to scope a shift's
// lines -- removing or renaming one must take all of them, or orphaned chorded
// lines keep applying -- and to know what the shifted editor may write.
export function padModeshiftSettings(keyPrefix: 'LEFT' | 'RIGHT') {
  return [
    'TOUCHPAD_MODE',
    'GRID_SIZE',
    'GRID_REQUIRES_CLICK',
    'TOUCHPAD_SENS',
    'TOUCHPAD_DUAL_STAGE_MODE',
    'TOUCH_STICK_MODE',
    'TOUCH_STICK_RADIUS',
    'TOUCH_STICK_AXIS',
    'TOUCH_DEADZONE_INNER',
    'TOUCH_RING_MODE',
  ].map(name => `${keyPrefix}_${name}`)
}

/**
 * What a setting is actually worth while the shift is held.
 *
 * A modeshift overrides only the keys it assigns; everything else keeps the
 * value the normal configuration gave it. Reading the shifted assignment alone
 * would show a blank for every setting the shift inherits, so fall through to
 * the base value the way the runtime does.
 */
export function readShifted(text: string, trigger: string, key: string) {
  return readModeshift(text, trigger, key) ?? getKeymapValue(text, key)
}

// Chord assignments are the persisted representation. Keep all edits scoped to
// both the input group and its trigger; other groups may use the same trigger.
const assignment = (line: string) => line.match(/^\s*([^#,=]+),\s*([^=]+?)\s*=\s*(.*)$/)
const owns = (target: ModeshiftTarget, key: string) =>
  target.buttons.some(button => button.command === key) || target.settings?.includes(key) || target.mode?.key === key

export function modeshiftTriggers(text: string, target: ModeshiftTarget): string[] {
  return [...new Set(text.split(/\r?\n/).flatMap(line => {
    const match = assignment(line)
    return match && owns(target, match[2].trim().toUpperCase()) ? [match[1].trim().toUpperCase()] : []
  }))]
}

export function readModeshift(text: string, trigger: string, key: string) {
  const lines = text.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = assignment(lines[i])
    if (match?.[1].trim().toUpperCase() === trigger.toUpperCase() && match[2].trim().toUpperCase() === key.toUpperCase()) {
      return getKeymapValue(`${key} = ${match[3]}`, key)
    }
  }
  return undefined
}

export function writeModeshift(text: string, trigger: string, key: string, value: string): string {
  if (!trigger.trim()) throw new Error('A modeshift trigger is required')
  const lines = text.split(/\r?\n/)
  const retained = lines.filter(line => {
    const match = assignment(line)
    return !(match?.[1].trim().toUpperCase() === trigger.toUpperCase() && match[2].trim().toUpperCase() === key.toUpperCase())
  })
  retained.push(`${trigger},${key} = ${value.trim() || 'NONE'}`)
  return retained.join('\n')
}

function shiftAnnotation(line: string, target: ModeshiftTarget, trigger: string, replacement?: string): string | null | undefined {
  const binding = line.match(/^(\s*#\s*@(label|icon)\s+)([^,\s]+),([^=\s]+)(\s*=.*)$/i)
  if (binding && binding[3].toUpperCase() === trigger.toUpperCase() && owns(target, binding[4].toUpperCase())) {
    return replacement ? `${binding[1]}${replacement},${binding[4]}${binding[5]}` : null
  }
  const surface = target.pad?.keyPrefix ?? (target.mode?.key === 'LEFT_STICK_MODE' ? 'LSTICK' : target.mode?.key === 'RIGHT_STICK_MODE' ? 'RSTICK' : undefined)
  const menu = line.match(/^(\s*#\s*@overlay\s+)([^:\s]+):([^\s]+)(.*)$/i)
  if (surface && menu && menu[2].toUpperCase() === surface && menu[3].toUpperCase() === trigger.toUpperCase()) {
    return replacement ? `${menu[1]}${menu[2]}:${replacement}${menu[4]}` : null
  }
  return undefined
}

export function removeModeshift(text: string, target: ModeshiftTarget, trigger: string): string {
  return text.split(/\r?\n/).filter(line => {
    if (shiftAnnotation(line, target, trigger) === null) return false
    const match = assignment(line)
    return !(match?.[1].trim().toUpperCase() === trigger && owns(target, match[2].trim().toUpperCase()))
  }).join('\n')
}

export function renameModeshift(text: string, target: ModeshiftTarget, from: string, to: string): string {
  if (!to || modeshiftTriggers(text, target).includes(to)) return text
  return text.split(/\r?\n/).map(line => {
    const annotation = shiftAnnotation(line, target, from, to)
    if (annotation !== undefined) return annotation ?? line
    const match = assignment(line)
    return match?.[1].trim().toUpperCase() === from && owns(target, match[2].trim().toUpperCase())
      ? `${to},${match[2].trim()} = ${match[3]}` : line
  }).join('\n')
}

export function addModeshift(text: string, target: ModeshiftTarget, trigger: string): string {
  if (!trigger || modeshiftTriggers(text, target).includes(trigger)) return text
  let next = text
  // A new shift starts as a copy of the normal configuration, including its
  // mode. Forcing a particular mode here was what made a pad shift mean "the
  // grid mode" rather than "this input, reconfigured": a shift is allowed to
  // stay in the mode it is already in and only change bindings.
  if (target.mode) next = writeModeshift(next, trigger, target.mode.key, getKeymapValue(text, target.mode.key) ?? target.mode.defaultValue)
  if (target.grid) {
    next = writeModeshift(next, trigger, target.grid.sizeKey, getKeymapValue(text, target.grid.sizeKey) ?? '2 2')
    // Requiring a click to activate a region is redundant when the click is
    // already what triggered the shift, so that one case starts off. Otherwise
    // the shift inherits whatever the normal mode does.
    const inheritedClick = getKeymapValue(text, target.grid.clickKey) ?? 'OFF'
    next = writeModeshift(next, trigger, target.grid.clickKey, trigger === target.grid.clickButton ? 'OFF' : inheritedClick)
    next = writeModeshift(next, trigger, target.grid.stickKey, getKeymapValue(text, target.grid.stickKey) ?? 'NO_MOUSE')
  }
  for (const button of target.buttons) {
    next = writeModeshift(next, trigger, button.command, getKeymapValue(text, button.command) ?? 'NONE')
  }
  return next
}

/**
 * The shift seen as an ordinary configuration.
 *
 * Every `TRIGGER,KEY = value` line is rewritten as `KEY = value` and appended
 * after the profile's own lines, so the result reads exactly the way
 * `readShifted` does: the shift's own assignments win, everything else keeps
 * the value it inherits. The point is that every reader below this -- row
 * parsing, binding expressions, special actions, the binding card itself --
 * is then the code that runs for an unshifted input, rather than a second,
 * smaller editor that has to be kept in step with the first.
 */
/** A `KEY = value` line that is not chorded, split into its parts. */
const plainAssignment = (line: string) => {
  const match = line.match(/^(\s*)([^=#\s]+)(\s*=\s*)(.*)$/)
  return match ? { indent: match[1], name: match[2], separator: match[3], key: match[2].toUpperCase() } : null
}

export function projectModeshift(text: string, trigger: string): string {
  const wanted = trigger.trim().toUpperCase()
  const lines = text.split(/\r?\n/)
  const overrides = new Map<string, string>()
  for (const line of lines) {
    const match = assignment(line)
    if (match && match[1].trim().toUpperCase() === wanted) overrides.set(match[2].trim().toUpperCase(), match[3])
  }

  // Only the last assignment of a key is the one in force, and a profile that
  // imports a file routinely has two: the template sets it and the profile
  // sets it again. Both have to collapse to one line here, because this
  // projection is read from AND written to -- an editor that writes to the
  // first occurrence while reading the last sees its own change come back as
  // the value it just replaced, and reports the edit as having done nothing.
  const winner = new Map<string, number>()
  lines.forEach((line, index) => {
    if (assignment(line)) return
    const plain = plainAssignment(line)
    if (plain) winner.set(plain.key, index)
  })

  const placed = new Set<string>()
  const projected = lines.flatMap((line, index) => {
    const match = assignment(line)
    // This trigger's lines become the values they stand for. Another trigger's
    // are left exactly as they are -- editing one shift must not touch another.
    if (match) return match[1].trim().toUpperCase() === wanted ? [] : [line]
    const plain = plainAssignment(line)
    if (!plain) return [line]
    if (winner.get(plain.key) !== index) return []
    const override = overrides.get(plain.key)
    if (override === undefined) return [line]
    placed.add(plain.key)
    return [`${plain.indent}${plain.name}${plain.separator}${override}`]
  })
  for (const [key, value] of overrides) if (!placed.has(key)) projected.push(`${key} = ${value}`)
  return projected.join('\n')
}

/** Plain `KEY = value` assignments, last one winning, as the projection reads them. */
function projectedAssignments(text: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || assignment(line)) continue
    const match = trimmed.match(/^([^=\s]+)\s*=\s*(.*)$/)
    if (match) values.set(match[1].toUpperCase(), match[2].split('#')[0].trim())
  }
  return values
}

/**
 * Fold an edited projection back into chorded lines.
 *
 * Only keys whose value actually changed are written, so editing one binding
 * cannot mint overrides for everything else the shift happens to inherit, and
 * a value edited back to what it inherits is not written at all. `clearTo`
 * names the keys that mean "nothing here" rather than "inherit" when they are
 * removed outright -- a binding cleared in a shift is unbound while the shift
 * is held, not quietly restored to the normal binding.
 */
export function foldModeshift(
  original: string,
  trigger: string,
  nextProjection: string,
  clearTo: Record<string, string> = {},
  // The projection the edit was made against. It comes from the import-resolved
  // text, while `original` is the profile's own; diffing against `original`
  // would read every inherited value as newly added and mint an override for
  // each one.
  baseProjection = projectModeshift(original, trigger)
): string {
  const before = projectedAssignments(baseProjection)
  const after = projectedAssignments(nextProjection)
  let next = original
  for (const [key, value] of after) {
    if (before.get(key) !== value) next = writeModeshift(next, trigger, key, value)
  }
  for (const key of before.keys()) {
    if (after.has(key)) continue
    const cleared = clearTo[key]
    next = cleared ? writeModeshift(next, trigger, key, cleared) : clearModeshift(next, trigger, key)
  }
  return next
}

/** Drop one key's chorded line, so the shift inherits that value again. */
export function clearModeshift(text: string, trigger: string, key: string): string {
  const wanted = trigger.trim().toUpperCase()
  return text.split(/\r?\n/).filter(line => {
    const match = assignment(line)
    return !(match?.[1].trim().toUpperCase() === wanted && match[2].trim().toUpperCase() === key.toUpperCase())
  }).join('\n')
}

/**
 * How many shifts this input has.
 *
 * Shown on the input's compact row so a binding that behaves differently under
 * a held trigger says so before it is opened. Counted by trigger rather than by
 * line, since one shift assigns several keys.
 */
export function modeshiftCount(text: string, command: string): number {
  const wanted = command.trim().toUpperCase()
  const triggers = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const match = assignment(line)
    if (match && match[2].trim().toUpperCase() === wanted) triggers.add(match[1].trim().toUpperCase())
  }
  return triggers.size
}
