import { readVirtualMenus, writeVirtualMenus } from './virtualMenus'
import { PAD_FEEDBACK_FIELDS } from './padFeedback'
import { getKeymapValue } from './keymap'
import type { ButtonDefinition } from '../keymap/schema'
import { shiftedInputOf } from './shiftedInputs'
import { BINDING_ALIASES, bindingTargetMatches } from './bindingAliases'

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
  pad?: { side: 'left' | 'right' | 'shared'; keyPrefix: 'LEFT' | 'RIGHT' | '' }
}

// Every per-pad setting a shift can carry. Used both to scope a shift's
// lines -- removing or renaming one must take all of them, or orphaned chorded
// lines keep applying -- and to know what the shifted editor may write.
export function padModeshiftSettings(keyPrefix: 'LEFT' | 'RIGHT' | '') {
  return [
    'TOUCHPAD_MODE',
    'GRID_SIZE',
    'GRID_SHAPE',
    'GRID_DEADZONE',
    'GRID_REQUIRES_CLICK',
    'TOUCHPAD_SENS',
    'TOUCHPAD_DUAL_STAGE_MODE',
    'TOUCHPAD_HAPTICS',
    ...PAD_FEEDBACK_FIELDS.map(entry => `TOUCHPAD_${entry.field}`),
    'TOUCH_STICK_MODE',
    'TOUCH_STICK_RADIUS',
    'TOUCH_STICK_AXIS',
    'TOUCH_DEADZONE_INNER',
    'TOUCH_RING_MODE',
  ].map(name => `${keyPrefix ? keyPrefix + '_' : ''}${name}`).concat(SHARED_STICK_SETTINGS)
}

const SHARED_STICK_SETTINGS = [
  'STICK_SENS', 'STICK_POWER', 'STICK_ACCELERATION_RATE', 'STICK_ACCELERATION_CAP',
  'FLICK_TIME', 'FLICK_TIME_EXPONENT', 'FLICK_SNAP_MODE', 'FLICK_SNAP_STRENGTH',
  'FLICK_DEADZONE_ANGLE', 'MOUSE_RING_RADIUS', 'SCROLL_SENS',
  'FLICK_STICK_OUTPUT', 'VIRTUAL_STICK_CALIBRATION', 'ROTATE_SMOOTH_OVERRIDE',
  'SCREEN_RESOLUTION_X', 'SCREEN_RESOLUTION_Y', 'ANGLE_TO_AXIS_DEADZONE_INNER', 'ANGLE_TO_AXIS_DEADZONE_OUTER',
  'WIND_STICK_RANGE', 'WIND_STICK_POWER', 'UNWIND_RATE', 'MOUSELIKE_FACTOR',
  'RETURN_DEADZONE_IS_ACTIVE', 'EDGE_PUSH_IS_ACTIVE', 'RETURN_DEADZONE_ANGLE', 'RETURN_DEADZONE_ANGLE_CUTOFF',
  ...['LEFT', 'RIGHT'].flatMap(side => ['UNDEADZONE_INNER', 'UNDEADZONE_OUTER', 'UNPOWER', 'VIRTUAL_SCALE', 'DEADZONE_PROBE'].map(field => `${side}_STICK_${field}`)),
]

/** Settings exposed by the full stick editor, including shared mouse tuning. */
export function stickModeshiftSettings(side: 'LEFT' | 'RIGHT') {
  return [
    `${side}_STICK_DEADZONE_INNER`, `${side}_STICK_DEADZONE_OUTER`, `${side}_RING_MODE`,
    `${side}_STICK_AXIS`,
    `${side}_STICK_MENU_SIZE`, `${side}_STICK_MENU_DEADZONE`,
    ...Array.from({ length: 25 }, (_, i) => `${side[0]}M${i + 1}`),
    ...SHARED_STICK_SETTINGS,
  ]
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
const assignment = (line: string) => {
  const match = line.match(/^\s*([^#,=]+),\s*([^=]+?)\s*=\s*(.*)$/)
  // Shared assignment shortcuts have no physical ButtonID. Keep invalid
  // source lines intact, but never manufacture them as held conditions.
  return match && match[1].trim().toUpperCase().replace(/^!/, '') in BINDING_ALIASES ? null : match
}
const owns = (target: ModeshiftTarget, key: string) =>
  target.buttons.some(button => bindingTargetMatches(key, button.command)) || target.settings?.includes(key) || target.mode?.key === key

/** `X,X = …` is JoyShockMapper's double press of X, not X chorded with itself
 *  (UX review 2026-10-09, L5): never a held trigger. */
const selfChord = (trigger: string, key: string) => trigger.replace(/^!/, '').toUpperCase() === key.toUpperCase()

export function modeshiftTriggers(text: string, target: ModeshiftTarget): string[] {
  return [...new Set(text.split(/\r?\n/).flatMap(line => {
    const match = assignment(line)
    const key = match?.[2].trim().toUpperCase()
    // Shared tuning alone cannot identify a stick. The mode or one of its
    // own bindings/settings establishes which input actually has a shift.
    return match && key && owns(target, key) && !SHARED_STICK_SETTINGS.includes(key) && !selfChord(match[1].trim(), key) ? [match[1].trim().toUpperCase()] : []
  }))]
}

export function readModeshift(text: string, trigger: string, key: string) {
  const lines = text.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = assignment(lines[i])
    if (match?.[1].trim().toUpperCase() === trigger.toUpperCase() && bindingTargetMatches(match[2].trim().toUpperCase(), key.toUpperCase())) {
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
  text = updateShiftMenuControls(text, target, trigger)
  text = splitSharedShiftTargets(text, target, trigger)
  const shared = sharedTuningInUse(text, target, trigger)
  return text.split(/\r?\n/).filter(line => {
    if (shiftAnnotation(line, target, trigger) === null) return false
    const match = assignment(line)
    if (shared && match && SHARED_STICK_SETTINGS.includes(match[2].trim().toUpperCase())) return true
    return !(match?.[1].trim().toUpperCase() === trigger && owns(target, match[2].trim().toUpperCase()))
  }).join('\n')
}

export function renameModeshift(text: string, target: ModeshiftTarget, from: string, to: string): string {
  if (!to || modeshiftTriggers(text, target).includes(to)) return text
  text = updateShiftMenuControls(text, target, from, to)
  text = splitSharedShiftTargets(text, target, from)
  const shared = sharedTuningInUse(text, target, from)
  return text.split(/\r?\n/).flatMap(line => {
    const annotation = shiftAnnotation(line, target, from, to)
    if (annotation !== undefined) return annotation ?? line
    const match = assignment(line)
    if (shared && match?.[1].trim().toUpperCase() === from && SHARED_STICK_SETTINGS.includes(match[2].trim().toUpperCase())) {
      return [line, `${to},${match[2].trim()} = ${match[3]}`]
    }
    return match?.[1].trim().toUpperCase() === from && owns(target, match[2].trim().toUpperCase())
      ? `${to},${match[2].trim()} = ${match[3]}` : line
  }).join('\n')
}

// A shared assignment can belong to two physical cards. Split it only when
// mutating one card's shift, keeping the sibling's assignment and comments.
function splitSharedShiftTargets(text: string, target: ModeshiftTarget, trigger: string) {
  return text.split(/\r?\n/).flatMap(line => {
    const match = assignment(line)
    const annotation = line.match(/^(\s*#\s*@(label|icon)\s+)([^,\s]+),([^=\s]+)(\s*=.*)$/i)
    const condition = match?.[1].trim().toUpperCase() ?? annotation?.[3].toUpperCase()
    const key = match?.[2].trim().toUpperCase() ?? annotation?.[4].toUpperCase()
    const members = key && BINDING_ALIASES[key as keyof typeof BINDING_ALIASES]
    if (condition !== trigger.toUpperCase() || !members || !members.some(member => owns(target, member)) || members.every(member => owns(target, member))) return [line]
    return members.map(member => annotation
      ? `${annotation[1]}${annotation[3]},${member}${annotation[5]}`
      : `${match![1].trim()},${member} = ${match![3]}`)
  }).join('\n')
}

/** Shared tuning must survive while the other stick uses the same trigger. */
function sharedTuningInUse(text: string, target: ModeshiftTarget, trigger: string) {
  return text.split(/\r?\n/).some(line => {
    const match = assignment(line)
    const key = match?.[2].trim().toUpperCase() ?? ''
    return match?.[1].trim().toUpperCase() === trigger.toUpperCase() &&
      /^(?:(?:LEFT_|RIGHT_)?(?:STICK_MODE|TOUCH_STICK_MODE)|MOTION_STICK_MODE|GYRO_OUTPUT)$/.test(key) && !owns(target, key)
  })
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
  // Projection is an editor view, not saved source. Expand targets here so a
  // shifted individual always wins over its inherited shared base assignment.
  const lines = text.split(/\r?\n/).flatMap(line => {
    const match = assignment(line)
    const plain = plainAssignment(line)
    const key = match?.[2].trim().toUpperCase() ?? plain?.key
    const members = key && BINDING_ALIASES[key as keyof typeof BINDING_ALIASES]
    if (!members) return [line]
    return members.map(member => match ? `${match[1].trim()},${member} = ${match[3]}` : `${plain!.indent}${member}${plain!.separator}${line.slice(line.indexOf('=') + 1).trimStart()}`)
  })
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
    if (match && bindingTargetMatches(match[2].trim().toUpperCase(), wanted) && !selfChord(match[1].trim(), match[2].trim())) triggers.add(match[1].trim().toUpperCase())
  }
  return triggers.size
}

/** One shift on an input: the held input and what the input sends meanwhile. */
export type ModeshiftSummary = { trigger: string; value: string }

/**
 * Every shift on this input, in the order they are written, each with the
 * value its last line gives the input. The compact row draws the first of
 * these as its modeshift tile (binding card refresh 3b).
 */
export function modeshiftsOn(text: string, command: string): ModeshiftSummary[] {
  const wanted = command.trim().toUpperCase()
  const shifts = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const match = assignment(line)
    if (!match || !bindingTargetMatches(match[2].trim().toUpperCase(), wanted) || selfChord(match[1].trim(), match[2].trim())) continue
    const trigger = match[1].trim().toUpperCase()
    shifts.set(trigger, getKeymapValue(`${wanted} = ${match[3]}`, wanted) ?? match[3].trim())
  }
  return [...shifts].map(([trigger, value]) => ({ trigger, value }))
}

/** Every modeshift trigger in the config and the inputs it changes, for the
 *  live "L4 held · 3 shifted" status (binding card refresh 2a, 2g). Released
 *  triggers ("!X") hold while up, so they are not "held". Inputs, not config
 *  keys: a shift that makes the right pad a 2x2 menu writes its mode, grid
 *  size and 25 region cells, and shifts one input (utils/shiftedInputs). */
export function shiftTriggerTargets(text: string): Map<string, Set<string>> {
  const triggers = new Map<string, Set<string>>()
  for (const line of text.split(/\r?\n/)) {
    const match = assignment(line)
    if (!match) continue
    const trigger = match[1].trim().toUpperCase()
    if (trigger.startsWith('!') || selfChord(trigger, match[2].trim())) continue
    if (!triggers.has(trigger)) triggers.set(trigger, new Set())
    triggers.get(trigger)!.add(shiftedInputOf(match[2]))
  }
  return triggers
}

/** The modeshift trigger held now and the inputs it changes, or null. */
export function heldModeshift(triggers: Map<string, Set<string>>, pressed: Set<string>) {
  for (const [trigger, targets] of triggers) if (pressed.has(trigger)) return { trigger, count: targets.size, inputs: [...targets] }
  return null
}

/**
 * Every input that is part of a chord ("RB+A = X") and the inputs it chords
 * with, for the same fixed status slot: holding a chord button says
 * "RB held · 2 chorded" instead of growing a callout.
 */
export function chordTriggerTargets(text: string): Map<string, Set<string>> {
  const triggers = new Map<string, Set<string>>()
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)$/)
    if (!match || !match[1].includes('+') || match[1].includes(',')) continue
    const members = match[1].split('+').map(part => part.trim().toUpperCase()).filter(Boolean)
    if (members.length < 2) continue
    for (const member of members) {
      if (!triggers.has(member)) triggers.set(member, new Set())
      members.filter(other => other !== member).forEach(other => triggers.get(member)!.add(other))
    }
  }
  return triggers
}

/** What the held status slot shows: which kind of relation, its trigger, its count. */
export type HeldStatus = { kind: 'shift' | 'chord'; trigger: string; count: number; inputs: string[] }

/**
 * The first held modeshift trigger, else the first held chord member: one
 * status at a time, a modeshift first because it changes more.
 */
export function heldStatus(shifts: Map<string, Set<string>>, chords: Map<string, Set<string>>, pressed: Set<string>): HeldStatus | null {
  const shift = heldModeshift(shifts, pressed)
  if (shift) return { kind: 'shift', ...shift }
  const chord = heldModeshift(chords, pressed)
  return chord ? { kind: 'chord', ...chord } : null
}

/** Menu controls created from the shifted stick editor follow its lifecycle. */
function updateShiftMenuControls(text: string, target: ModeshiftTarget, trigger: string, replacement?: string) {
  const source = target.mode?.key === 'LEFT_STICK_MODE' ? 'LSTICK' : target.mode?.key === 'RIGHT_STICK_MODE' ? 'RSTICK' : null
  if (!source) return text
  const catalog = readVirtualMenus(text)
  const marker = `${source}:${trigger}`
  const ownsMenu = (menu: typeof catalog.menus[number]) => Array.isArray(menu.extra?.stickModeshiftControls) && menu.extra.stickModeshiftControls.includes(marker)
  if (catalog.problem || !catalog.menus.some(ownsMenu)) return text
  return writeVirtualMenus(text, catalog.menus.map(menu => !ownsMenu(menu) ? menu : ({ ...menu,
    extra: { ...menu.extra, stickModeshiftControls: (menu.extra!.stickModeshiftControls as string[]).flatMap(key => key === marker ? replacement ? [`${source}:${replacement}`] : [] : [key]) },
    attachments: menu.attachments.flatMap(a => a.source === source && a.activation === 'HOLD' && a.input === trigger ? replacement ? [{ ...a, input: replacement }] : [] : [a]),
  })))
}
