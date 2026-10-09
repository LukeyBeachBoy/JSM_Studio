/**
 * Steam Input layouts, converted to JSM Studio configurations.
 *
 * Steam keeps a controller layout as a KeyValues (.vdf) file: a list of
 * "groups" (one input source in one mode -- the right trackpad as a mouse, the
 * face buttons as four buttons), and "presets" that say which group each source
 * uses. A preset is an action set, or, when it names a parent set, an action
 * layer. Every binding is a string such as `key_press SPACE, Jump, , `.
 *
 * Most of that has a direct counterpart here, because Studio borrowed Steam's
 * vocabulary on purpose (see docs/config-layers.md):
 *
 *   Steam                         Studio
 *   ---------------------------   ------------------------------------------
 *   action set                    its own configuration, loaded by a binding
 *   action layer                  a `# @layer` with its overrides
 *   add/remove/hold layer         `# @layer-action INPUT = apply|remove|hold`
 *   mode shift                    `TRIGGER,SETTING = value` chorded lines
 *   long / double / chord press   tap-hold, `X,X =` and `MOD,X =` bindings
 *   binding label                 `# @label INPUT = text`
 *   trackpad as dpad / menu       a FOUR_WAY / RECTANGLE / RADIAL touch grid
 *   stick as radial menu          RADIAL_MENU with LM1.. / RM1..
 *   gamepad output                VIRTUAL_CONTROLLER = XBOX and X_* outputs
 *
 * Anything without one is never dropped silently: it lands in the report the
 * import dialog shows, and in a comment block at the end of the file, so the
 * person importing knows exactly what to finish by hand.
 *
 * Both file versions are read: version 3 (activators, presets) and the older
 * version 2 (bare binding strings and one top-level group_source_bindings).
 */

// --- KeyValues -------------------------------------------------------------

export type VdfValue = string | VdfNode
/** Keys repeat in a layout ("group" appears once per group), so a node is a list. */
export type VdfNode = Array<[string, VdfValue]>

export function parseVdf(text: string): VdfNode {
  const source = text.replace(/^\uFEFF/, '')
  let index = 0
  const root: VdfNode = []
  const stack: VdfNode[] = [root]
  let pendingKey: string | null = null

  const readToken = (): string | '{' | '}' | null => {
    for (;;) {
      while (index < source.length && /\s/.test(source[index])) index++
      if (source.startsWith('//', index)) {
        while (index < source.length && source[index] !== '\n') index++
        continue
      }
      break
    }
    if (index >= source.length) return null
    const char = source[index]
    if (char === '{' || char === '}') { index++; return char }
    if (char === '"') {
      index++
      let value = ''
      while (index < source.length && source[index] !== '"') {
        if (source[index] === '\\' && index + 1 < source.length) {
          const next = source[index + 1]
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next
          index += 2
          continue
        }
        value += source[index++]
      }
      index++
      return value
    }
    let value = ''
    while (index < source.length && !/[\s{}"]/.test(source[index])) value += source[index++]
    return value
  }

  for (;;) {
    const token = readToken()
    if (token === null) break
    const node = stack[stack.length - 1]
    if (token === '{') {
      const child: VdfNode = []
      node.push([pendingKey ?? '', child])
      stack.push(child)
      pendingKey = null
    } else if (token === '}') {
      if (stack.length > 1) stack.pop()
      pendingKey = null
    } else if (pendingKey === null) {
      // A platform conditional such as [$WIN32] trails a value; it is not a key.
      if (/^\[.*\]$/.test(token)) continue
      pendingKey = token
    } else {
      node.push([pendingKey, token])
      pendingKey = null
    }
  }
  return root
}

const lower = (value: string) => value.toLowerCase()
export const vdfGet = (node: VdfNode | undefined, key: string): VdfValue | undefined =>
  node?.find(([name]) => lower(name) === lower(key))?.[1]
export const vdfNode = (node: VdfNode | undefined, key: string): VdfNode | undefined => {
  const value = vdfGet(node, key)
  return Array.isArray(value) ? value : undefined
}
export const vdfString = (node: VdfNode | undefined, key: string): string | undefined => {
  const value = vdfGet(node, key)
  return typeof value === 'string' ? value : undefined
}
const vdfAll = (node: VdfNode | undefined, key: string) =>
  (node ?? []).filter(([name]) => lower(name) === lower(key)).map(([, value]) => value)

// --- The report ------------------------------------------------------------

export type ReportStatus = 'converted' | 'approximated' | 'skipped'
export type ReportItem = {
  status: ReportStatus
  /** The Steam input or feature, in Steam's words: "Right trackpad", "L4". */
  where: string
  /** What happened to it, as one sentence. */
  detail: string
  /** The action set or layer it belongs to, when it is not the default set. */
  scope?: string
  /** The action set whose configuration it belongs to. */
  set: string
  /** The input it is about, as a JSM command for its glyph ("RIGHT_PAD",
   *  "LSL"), or "GYRO" / "ALL" for the gyro and settings for every button. */
  input?: string
}

export type ConvertedSet = {
  /** The configuration's file name in the library: "Wardogs Steam - Vehicle". */
  name: string
  /** How the review names it (console v2): "Wardogs Steam · Vehicle". The
   *  file keeps " - ", which every code page the mapper reads paths in has. */
  displayName: string
  /** Steam's name for the action set. */
  setTitle: string
  isDefault: boolean
  text: string
  layers: string[]
}

export type SteamConversion = {
  title: string
  controllerType: string
  sets: ConvertedSet[]
  report: ReportItem[]
  counts: Record<ReportStatus, number>
}

// --- Names -----------------------------------------------------------------

const KEY_NAMES: Record<string, string> = {
  SPACE: 'SPACE', TAB: 'TAB', ESCAPE: 'ESC', ESC: 'ESC', RETURN: 'ENTER', ENTER: 'ENTER',
  BACKSPACE: 'BACKSPACE', DELETE: 'DELETE', INSERT: 'INSERT', HOME: 'HOME', END: 'END',
  PAGE_UP: 'PAGEUP', PAGEUP: 'PAGEUP', PAGE_DOWN: 'PAGEDOWN', PAGEDOWN: 'PAGEDOWN',
  UP_ARROW: 'UP', DOWN_ARROW: 'DOWN', LEFT_ARROW: 'LEFT', RIGHT_ARROW: 'RIGHT',
  UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT',
  LEFT_SHIFT: 'LSHIFT', RIGHT_SHIFT: 'RSHIFT', SHIFT: 'SHIFT',
  LEFT_CONTROL: 'LCONTROL', RIGHT_CONTROL: 'RCONTROL', CONTROL: 'CONTROL',
  LEFT_ALT: 'LALT', RIGHT_ALT: 'RALT', ALT: 'ALT',
  LEFT_WINDOWS: 'LWINDOWS', LWIN: 'LWINDOWS', LEFT_WIN: 'LWINDOWS', RIGHT_WINDOWS: 'RWINDOWS', RWIN: 'RWINDOWS', RIGHT_WIN: 'RWINDOWS',
  CAPSLOCK: 'CAPS_LOCK', CAPS_LOCK: 'CAPS_LOCK', SCROLLLOCK: 'SCROLL_LOCK', SCROLL_LOCK: 'SCROLL_LOCK',
  NUMLOCK: 'NUM_LOCK', NUM_LOCK: 'NUM_LOCK', PRINTSCREEN: 'SCREENSHOT', PRINT_SCREEN: 'SCREENSHOT',
  KEYPAD_PLUS: 'ADD', KEYPAD_DASH: 'SUBTRACT', KEYPAD_MINUS: 'SUBTRACT', KEYPAD_ASTERISK: 'MULTIPLY',
  KEYPAD_FORWARD_SLASH: 'DIVIDE', KEYPAD_PERIOD: 'DECIMAL', KEYPAD_ENTER: 'ENTER',
  PERIOD: '.', COMMA: ',', SEMICOLON: ';', SINGLE_QUOTE: "'", FORWARD_SLASH: '/',
  BACK_SLASH: '\\', BACKSLASH: '\\', DASH: '-', MINUS: '-', EQUALS: '=',
  LEFT_BRACKET: '[', RIGHT_BRACKET: ']', BACK_TICK: '`', GRAVE: '`', TILDE: '`',
  VOLUME_UP: 'VOLUME_UP', VOLUME_DOWN: 'VOLUME_DOWN', VOLUME_MUTE: 'MUTE', MUTE: 'MUTE',
  MEDIA_NEXT_TRACK: 'NEXT_TRACK', NEXT_TRACK: 'NEXT_TRACK', MEDIA_PREV_TRACK: 'PREV_TRACK', PREV_TRACK: 'PREV_TRACK',
  MEDIA_STOP: 'STOP_TRACK', MEDIA_PLAY_PAUSE: 'PLAY_PAUSE', PLAY_PAUSE: 'PLAY_PAUSE',
}

const keyToken = (raw: string): string | null => {
  const name = raw.trim().toUpperCase()
  if (KEY_NAMES[name]) return KEY_NAMES[name]
  if (/^[A-Z0-9]$/.test(name)) return name
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(name)) return name
  const keypad = /^KEYPAD_([0-9])$/.exec(name)
  if (keypad) return `N${keypad[1]}`
  return null
}

const MOUSE_BUTTONS: Record<string, string> = {
  LEFT: 'LMOUSE', RIGHT: 'RMOUSE', MIDDLE: 'MMOUSE', BACK: 'BMOUSE', FORWARD: 'FMOUSE', X1: 'BMOUSE', X2: 'FMOUSE',
}
const MOUSE_WHEEL: Record<string, string> = { SCROLL_UP: 'SCROLLUP', SCROLL_DOWN: 'SCROLLDOWN' }
const XINPUT: Record<string, string> = {
  A: 'X_A', B: 'X_B', X: 'X_X', Y: 'X_Y',
  SHOULDER_LEFT: 'X_LB', SHOULDER_RIGHT: 'X_RB', LEFT_BUMPER: 'X_LB', RIGHT_BUMPER: 'X_RB',
  TRIGGER_LEFT: 'X_LT', TRIGGER_RIGHT: 'X_RT',
  JOYSTICK_LEFT: 'X_LS', JOYSTICK_RIGHT: 'X_RS',
  START: 'X_START', SELECT: 'X_BACK', BACK: 'X_BACK', GUIDE: 'X_GUIDE',
  DPAD_UP: 'X_UP', DPAD_DOWN: 'X_DOWN', DPAD_LEFT: 'X_LEFT', DPAD_RIGHT: 'X_RIGHT',
}

// What Steam calls each source and input, for the report.
const SOURCE_NAMES: Record<string, string> = {
  button_diamond: 'Face buttons', dpad: 'D-pad', joystick: 'Left stick', left_joystick: 'Left stick',
  right_joystick: 'Right stick', left_trackpad: 'Left trackpad', right_trackpad: 'Right trackpad',
  center_trackpad: 'Touchpad', left_trigger: 'Left trigger', right_trigger: 'Right trigger',
  gyro: 'Gyro', switch: 'Buttons',
}
const sourceName = (source: string) => SOURCE_NAMES[source] ?? source.replace(/_/g, ' ')

// Steam's names for inputs (the report's "where") -> the JSM command whose
// glyph stands for it in the review. Longest name first.
const WHERE_INPUTS: [string, string][] = ([
  ['Left trackpad', 'LEFT_PAD'], ['Right trackpad', 'RIGHT_PAD'], ['Touchpad', 'CAPTURE'],
  ['Left stick', 'LEFT_STICK'], ['Right stick', 'RIGHT_STICK'], ['Left trigger', 'ZL'], ['Right trigger', 'ZR'],
  ['Gyro', 'GYRO'], ['D-pad', 'UP'], ['Face buttons', 'S'],
  ['A button', 'S'], ['B button', 'E'], ['X button', 'W'], ['Y button', 'N'],
  ['Menu button', '+'], ['View button', '-'], ['Left bumper', 'L'], ['Right bumper', 'R'],
  ['L4', 'LSL'], ['R4', 'RSR'], ['L5', 'LSR'], ['R5', 'RSL'],
  ['Quick Access button', 'MISC1'], ['Left grip', 'MISC6'], ['Right grip', 'MISC5'],
  ['Long press', 'ALL'], ['Double-tap', 'ALL'],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length)
export const reportInput = (where: string) => WHERE_INPUTS.find(([name]) => where.toLowerCase().startsWith(name.toLowerCase()))?.[1]

// The face, bumper, menu and back buttons: Steam input name -> Studio command.
const SWITCH_INPUTS: Record<string, { command: string; name: string }> = {
  button_escape: { command: '+', name: 'Menu button' },
  button_menu: { command: '-', name: 'View button' },
  left_bumper: { command: 'L', name: 'Left bumper' },
  right_bumper: { command: 'R', name: 'Right bumper' },
  button_back_left: { command: 'LSL', name: 'L4' },
  button_back_right: { command: 'RSR', name: 'R4' },
  button_back_left_upper: { command: 'LSR', name: 'L5' },
  button_back_right_upper: { command: 'RSL', name: 'R5' },
  button_quick_access: { command: 'MISC1', name: 'Quick Access button' },
  left_grip: { command: 'MISC6', name: 'Left grip' },
  right_grip: { command: 'MISC5', name: 'Right grip' },
}
const FACE_INPUTS: Record<string, { command: string; name: string }> = {
  button_a: { command: 'S', name: 'A button' }, button_b: { command: 'E', name: 'B button' },
  button_x: { command: 'W', name: 'X button' }, button_y: { command: 'N', name: 'Y button' },
}
// Inputs a chord_button setting may name.
const CHORD_INPUTS: Record<string, string> = {
  ...Object.fromEntries(Object.entries({ ...SWITCH_INPUTS, ...FACE_INPUTS }).map(([key, value]) => [key, value.command])),
  left_trigger: 'ZL', right_trigger: 'ZR', left_stick_click: 'L3', right_stick_click: 'R3',
}

// --- Bindings --------------------------------------------------------------

type Translated =
  | { kind: 'token'; token: string; xinput?: boolean; label?: string }
  | { kind: 'layer'; verb: 'apply' | 'remove' | 'hold'; preset: number; label?: string }
  | { kind: 'set'; preset: number; label?: string }
  | { kind: 'modeshift'; source: string; group: string }
  | { kind: 'skip'; reason: string }

/** One Steam binding string, as something Studio can write or a reason it cannot. */
export function translateBinding(binding: string): Translated | null {
  const [command, label] = binding.split(',').map(part => part.trim())
  if (!command) return null
  const [type, ...args] = command.split(/\s+/)
  const arg = args[0] ?? ''
  const withLabel = <T extends Translated>(value: T): T => (label ? { ...value, label } : value)
  switch (type.toLowerCase()) {
    case 'key_press': {
      const token = keyToken(arg)
      return token ? withLabel({ kind: 'token', token }) : { kind: 'skip', reason: `the key ${arg} has no JoyShockMapper equivalent` }
    }
    case 'mouse_button': {
      const token = MOUSE_BUTTONS[arg.toUpperCase()]
      return token ? withLabel({ kind: 'token', token }) : { kind: 'skip', reason: `mouse button ${arg} has no match here` }
    }
    case 'mouse_wheel': {
      const token = MOUSE_WHEEL[arg.toUpperCase()]
      return token ? withLabel({ kind: 'token', token }) : { kind: 'skip', reason: `horizontal scrolling (${arg}) is not supported` }
    }
    case 'xinput_button': {
      const token = XINPUT[arg.toUpperCase()]
      return token ? withLabel({ kind: 'token', token, xinput: true }) : { kind: 'skip', reason: `gamepad button ${arg} has no match here` }
    }
    case 'mode_shift':
      return { kind: 'modeshift', source: arg, group: args[1] ?? '' }
    case 'controller_action': {
      const action = arg.toLowerCase()
      const preset = Number(args[1])
      if (action === 'change_preset' && Number.isFinite(preset)) return withLabel({ kind: 'set', preset })
      if (action === 'add_layer' && Number.isFinite(preset)) return withLabel({ kind: 'layer', verb: 'apply', preset })
      if (action === 'remove_layer' && Number.isFinite(preset)) return withLabel({ kind: 'layer', verb: 'remove', preset })
      if (action === 'hold_layer' && Number.isFinite(preset)) return withLabel({ kind: 'layer', verb: 'hold', preset })
      if (action === 'empty_binding') return null
      return { kind: 'skip', reason: `the Steam action "${args.join(' ')}" only exists inside Steam` }
    }
    case 'game_action':
      return { kind: 'skip', reason: `"${args.slice(1).join(' ') || arg}" is a Steam Input API game action, which only the game itself understands` }
    default:
      return { kind: 'skip', reason: `"${command}" is not a binding Studio understands` }
  }
}

type Activator = { type: string; bindings: string[]; settings: VdfNode | undefined }

/** An input's activators, from either file version. */
const readActivators = (input: VdfValue): Activator[] => {
  if (typeof input === 'string') return [{ type: 'full_press', bindings: [input], settings: undefined }]
  const activators = vdfNode(input, 'activators')
  if (!activators) return []
  return activators.flatMap(([type, value]) => {
    if (!Array.isArray(value)) return []
    const bindings = vdfAll(vdfNode(value, 'bindings'), 'binding').filter((b): b is string => typeof b === 'string')
    return [{ type: type.toLowerCase(), bindings, settings: vdfNode(value, 'settings') }]
  })
}

// --- The writer ------------------------------------------------------------

type LayerRef = { id: string; name: string }

type Context = {
  report: (status: ReportStatus, where: string, detail: string) => void
  /** Resolves a CHANGE_PRESET / layer number to what it means here. */
  resolveSet: (preset: number) => string | null
  resolveLayer: (preset: number) => LayerRef | null
  groups: Map<string, VdfNode>
  localize: (text: string) => string
  usesXinput: () => void
  timing: { hold: number[]; double: number[] }
}

/** Collects one configuration's lines. A modeshift writes through a prefixed view. */
class Writer {
  entries = new Map<string, string>()
  labels = new Map<string, string>()
  layerActions: Array<{ input: string; verb: string; layerId: string }> = []
  constructor(readonly ctx: Context, readonly prefix = '', private root?: Writer) {}

  get base(): Writer { return this.root ?? this }
  shifted(trigger: string) { return new Writer(this.ctx, `${trigger},`, this.base) }

  set(key: string, value: string, where: string) {
    const target = this.base
    const full = this.prefix + key
    const existing = target.entries.get(full)
    if (existing !== undefined && existing !== value) {
      this.ctx.report('skipped', where, `${full} was already set to ${existing}, so ${value} from here was left out`)
      return false
    }
    target.entries.set(full, value)
    return true
  }
  label(command: string, label: string) {
    if (this.prefix || !label) return
    this.base.labels.set(command, label)
  }
}

const quoted = (name: string) => `"profiles-library/${name}.txt"`

/**
 * Writes one input's activators as a Studio binding on `command`.
 * Returns true when anything was written for it.
 */
function writeInput(writer: Writer, command: string, where: string, input: VdfValue) {
  const { ctx } = writer
  const activators = readActivators(input)
  const groups: Record<'full' | 'long' | 'start' | 'release' | 'double', string[]> = { full: [], long: [], start: [], release: [], double: [] }
  let label = ''
  let toggle = false
  let turbo = false
  let wrote = false

  for (const activator of activators) {
    const kind = activator.type === 'full_press' || activator.type === 'soft_press' ? 'full'
      : activator.type === 'long_press' ? 'long'
        : activator.type === 'start_press' ? 'start'
          : activator.type === 'release_press' ? 'release'
            : activator.type === 'double_press' ? 'double'
              : activator.type === 'chord' ? 'chord' : null
    if (!kind) {
      if (activator.bindings.length) ctx.report('skipped', where, `the ${activator.type.replace(/_/g, ' ')} activator has no match here`)
      continue
    }
    const settings = activator.settings
    if (kind === 'long') {
      const time = Number(vdfString(settings, 'long_press_time'))
      if (time > 0) ctx.timing.hold.push(time)
    }
    if (kind === 'double') {
      const time = Number(vdfString(settings, 'double_tap_time'))
      if (time > 0) ctx.timing.double.push(time)
    }
    if (kind === 'full') {
      if (vdfString(settings, 'toggle') === '1') toggle = true
      if (vdfString(settings, 'hold_repeats') === '1' || Number(vdfString(settings, 'repeat_rate')) > 0) turbo = true
    }
    for (const setting of ['delay_start', 'delay_end']) {
      if (Number(vdfString(settings, setting)) > 0) ctx.report('approximated', where, `the ${setting.replace('_', ' ')} timing was dropped; the binding fires without it`)
    }

    const tokens: string[] = []
    for (const binding of activator.bindings) {
      const translated = translateBinding(binding)
      if (!translated) continue
      if (translated.kind === 'skip') { ctx.report('skipped', where, `${translated.reason[0].toUpperCase()}${translated.reason.slice(1)}`); continue }
      if (translated.kind === 'modeshift') {
        writeModeshift(writer, command, where, translated.source, translated.group)
        wrote = true
        continue
      }
      if (translated.kind === 'layer') {
        const layer = ctx.resolveLayer(translated.preset)
        if (!layer) { ctx.report('skipped', where, `it turns on a mode this layout doesn't have`); continue }
        if (writer.prefix || kind === 'chord' || kind === 'double') {
          ctx.report('skipped', where, `turning a layer on inside a mode shift, chord or double-tap has no match here`)
          continue
        }
        writer.base.layerActions.push({ input: command, verb: translated.verb, layerId: layer.id })
        if (kind !== 'full') ctx.report('approximated', where, `${translated.verb === 'apply' ? 'Turning on' : translated.verb === 'remove' ? 'Turning off' : 'Holding'} mode "${layer.name}" now happens on a normal press rather than a ${activator.type.replace(/_/g, ' ')}`)
        else ctx.report('converted', where, `${translated.verb === 'apply' ? 'Turns on' : translated.verb === 'remove' ? 'Turns off' : 'Holds'} mode "${layer.name}"`)
        wrote = true
        continue
      }
      if (translated.kind === 'set') {
        const name = ctx.resolveSet(translated.preset)
        if (!name) { ctx.report('skipped', where, `it switches to an action set this layout does not have`); continue }
        tokens.push(quoted(name))
        if (!label && translated.label) label = ctx.localize(translated.label)
        continue
      }
      if (translated.xinput) ctx.usesXinput()
      tokens.push(translated.token)
      if (!label && translated.label) label = ctx.localize(translated.label)
    }
    if (!tokens.length) continue

    if (kind === 'chord') {
      const chordWith = (vdfString(settings, 'chord_button') ?? '').toLowerCase()
      const modifier = CHORD_INPUTS[chordWith]
      if (!modifier || writer.prefix) {
        ctx.report('skipped', where, `its chord binding (${tokens.join(' ')}) could not be converted${modifier ? ' inside a mode shift' : `: JSM Evolved doesn't know chord button "${chordWith || 'unset'}"`}`)
        continue
      }
      if (writer.set(`${modifier},${command}`, formatTokens(tokens), where)) {
        ctx.report('converted', where, `Chord with ${modifier}: ${tokens.join(' ')}`)
        wrote = true
      }
      continue
    }
    groups[kind].push(...tokens)
  }

  const value = combine(groups, toggle, turbo)
  if (value) {
    if (writer.set(command, value, where)) {
      wrote = true
      ctx.report(turbo ? 'approximated' : 'converted', where, turbo ? `${value} (Steam's repeat rate is not kept; turbo uses JoyShockMapper's own)` : value)
      if (label) writer.label(command, label)
    }
  }
  if (groups.double.length) {
    if (writer.prefix) ctx.report('skipped', where, `a double-tap inside a mode shift has no match here`)
    else if (writer.set(`${command},${command}`, formatTokens(groups.double), where)) {
      ctx.report('converted', where, `Double-tap: ${groups.double.join(' ')}`)
      wrote = true
    }
  }
  return wrote
}

const formatTokens = (tokens: string[]) => tokens.length === 1 ? tokens[0] : tokens.map(token => `${token}\\`).join(' ')

/** Steam's separate activators as one JoyShockMapper binding value. */
function combine(groups: Record<'full' | 'long' | 'start' | 'release' | 'double', string[]>, toggle: boolean, turbo: boolean): string | null {
  const { full, long, start, release } = groups
  if (!full.length && !long.length && !start.length && !release.length) return null
  // The common shapes keep the plain syntax people write by hand.
  if (!long.length && !start.length && !release.length && !toggle && !turbo) return formatTokens(full)
  if (long.length === 1 && full.length <= 1 && !start.length && !release.length && !toggle && !turbo) return `${full[0] ?? 'NONE'} ${long[0]}`
  const parts: string[] = []
  const fullEvent = turbo ? '+' : long.length ? "'" : '\\'
  for (const token of full) parts.push(`${toggle ? '^' : ''}${token}${fullEvent}`)
  for (const token of long) parts.push(`${token}_`)
  for (const token of start) parts.push(`!${token}\\`)
  for (const token of release) parts.push(`!${token}/`)
  return parts.join(' ')
}

// --- Sources ---------------------------------------------------------------

type GroupInputs = Array<[string, VdfValue]>

const groupInputs = (group: VdfNode): GroupInputs =>
  vdfNode(group, 'inputs') ?? vdfNode(group, 'bindings') ?? []

const reportUnused = (writer: Writer, where: string, inputs: GroupInputs, used: Set<string>) => {
  for (const [name, value] of inputs) {
    if (used.has(name.toLowerCase())) continue
    if (!readActivators(value).some(a => a.bindings.length)) continue
    writer.ctx.report('skipped', `${where} ${name.replace(/_/g, ' ')}`, 'this input has no match here in this mode')
  }
}

function writeButtons(writer: Writer, where: string, inputs: GroupInputs, map: Record<string, { command: string; name: string }>) {
  const used = new Set<string>()
  for (const [name, value] of inputs) {
    const target = map[name.toLowerCase()]
    if (!target) continue
    used.add(name.toLowerCase())
    writeInput(writer, target.command, target.name, value)
  }
  reportUnused(writer, where, inputs, used)
}

const DPAD_ORDER = ['dpad_north', 'dpad_east', 'dpad_south', 'dpad_west']
const DIAMOND_ORDER = ['button_y', 'button_b', 'button_a', 'button_x']

/** Directional inputs onto four commands, up/right/down/left. */
function writeDirections(writer: Writer, where: string, inputs: GroupInputs, commands: string[], names: string[]) {
  const used = new Set<string>()
  const order = inputs.some(([name]) => name.toLowerCase().startsWith('dpad_')) ? DPAD_ORDER : DIAMOND_ORDER
  order.forEach((inputName, index) => {
    const input = inputs.find(([name]) => name.toLowerCase() === inputName)
    if (!input) return
    used.add(inputName)
    writeInput(writer, commands[index], `${where} ${names[index]}`, input[1])
  })
  return used
}

function writeClick(writer: Writer, where: string, inputs: GroupInputs, used: Set<string>, command: string, what = 'click') {
  const click = inputs.find(([name]) => name.toLowerCase() === 'click')
  if (!click) return
  used.add('click')
  writeInput(writer, command, `${where} ${what}`, click[1])
}

const menuIndex = (name: string) => {
  const match = /^touch_menu_button_(\d+)$/i.exec(name)
  return match ? Number(match[1]) : null
}

/** A touch menu's button count as the grid JoyShockMapper can draw. */
const TOUCH_MENU_GRIDS: Record<number, [number, number]> = { 1: [1, 1], 2: [2, 1], 4: [2, 2], 9: [3, 3], 12: [4, 3], 16: [4, 4] }

const write = (writer: Writer, key: string, value: string, where: string) => writer.set(key, value, where)

function writeStick(writer: Writer, source: string, group: VdfNode) {
  const ctx = writer.ctx
  const right = source === 'right_joystick'
  const side = right ? 'RIGHT' : 'LEFT'
  const p = right ? 'R' : 'L'
  const where = sourceName(source)
  const mode = (vdfString(group, 'mode') ?? '').toLowerCase()
  const inputs = groupInputs(group)
  const used = new Set<string>()
  const stickMode = (value: string) => write(writer, `${side}_STICK_MODE`, value, where)
  const output = vdfString(vdfNode(group, 'settings'), 'output_joystick')
  const passthrough = output === '0' ? 'LEFT_STICK' : output === '1' ? 'RIGHT_STICK' : `${side}_STICK`

  switch (mode) {
    case 'joystick_move':
      stickMode(passthrough); ctx.usesXinput()
      ctx.report('converted', where, `Joystick output to the virtual ${passthrough === 'LEFT_STICK' ? 'left' : 'right'} stick`)
      break
    case 'joystick_camera':
      stickMode(passthrough); ctx.usesXinput()
      ctx.report('approximated', where, `Joystick Camera became plain joystick output; Steam's camera tuning is not kept`)
      break
    case 'joystick_mouse':
    case 'mouse_joystick':
      stickMode('AIM')
      ctx.report('converted', where, 'Moves the mouse (stick aim)')
      break
    case 'flickstick':
    case 'flick_stick':
      stickMode('FLICK')
      ctx.report('converted', where, 'Flick stick')
      break
    case 'mouse_region':
      stickMode('MOUSE_AREA')
      ctx.report('approximated', where, `Mouse Region became mouse area; check its size on Sticks`)
      break
    case 'dpad':
    case 'four_buttons':
      stickMode('NO_MOUSE')
      for (const name of writeDirections(writer, where, inputs, [`${p}UP`, `${p}RIGHT`, `${p}DOWN`, `${p}LEFT`], ['up', 'right', 'down', 'left'])) used.add(name)
      break
    case 'scrollwheel': {
      stickMode('SCROLL_WHEEL')
      for (const [name, command] of [['scroll_clockwise', `${p}RIGHT`], ['scroll_counterclockwise', `${p}LEFT`]] as const) {
        const input = inputs.find(([key]) => key.toLowerCase() === name)
        if (input) { used.add(name); writeInput(writer, command, `${where} ${name.replace('_', ' ')}`, input[1]) }
      }
      break
    }
    case 'radial_menu': {
      const items = inputs.filter(([name]) => menuIndex(name) !== null)
      const count = Math.min(25, Math.max(2, ...items.map(([name]) => (menuIndex(name) ?? 0) + 1)))
      stickMode('RADIAL_MENU')
      write(writer, `${side}_STICK_MENU_SIZE`, String(count), where)
      for (const [name, value] of items) {
        const index = menuIndex(name)!
        if (index >= 25) { ctx.report('skipped', `${where} menu item ${index + 1}`, 'a radial menu holds at most 25 items'); continue }
        used.add(name.toLowerCase())
        writeInput(writer, `${p}M${index + 1}`, `${where} menu item ${index + 1}`, value)
      }
      break
    }
    case 'single_button':
    case '':
      break
    default:
      ctx.report('skipped', where, `the "${mode.replace(/_/g, ' ')}" stick mode has no match here`)
  }
  writeClick(writer, where, inputs, used, `${p}3`)
  const edge = inputs.find(([name]) => name.toLowerCase() === 'edge')
  if (edge && readActivators(edge[1]).some(a => a.bindings.length)) {
    used.add('edge')
    write(writer, `${side}_RING_MODE`, 'OUTER', where)
    writeInput(writer, `${p}RING`, `${where} outer ring`, edge[1])
  }
  const touch = inputs.find(([name]) => name.toLowerCase() === 'touch')
  if (touch) { used.add('touch'); writeInput(writer, `${p}TOUCH`, `${where} touch`, touch[1]) }
  reportUnused(writer, where, inputs, used)
}

function writeTrackpad(writer: Writer, source: string, group: VdfNode) {
  const ctx = writer.ctx
  const pad = source === 'left_trackpad' ? { key: 'LEFT_', cell: 'LT', click: 'MISC3', requiresClick: 'LEFT_GRID_REQUIRES_CLICK' }
    : source === 'right_trackpad' ? { key: 'RIGHT_', cell: 'RT', click: 'MISC2', requiresClick: 'RIGHT_GRID_REQUIRES_CLICK' }
      : { key: '', cell: 'T', click: 'CAPTURE', requiresClick: 'TOUCHPAD_GRID_REQUIRES_CLICK' }
  const where = sourceName(source)
  const mode = (vdfString(group, 'mode') ?? '').toLowerCase()
  const settings = vdfNode(group, 'settings')
  const inputs = groupInputs(group)
  const used = new Set<string>()
  const set = (key: string, value: string) => write(writer, key, value, where)
  const grid = (shape: string, size?: string) => {
    set(`${pad.key}TOUCHPAD_MODE`, 'GRID_AND_STICK')
    if (size) set(`${pad.key}GRID_SIZE`, size)
    set(`${pad.key}GRID_SHAPE`, shape)
  }
  const requiresClick = (fallback: boolean) => {
    const value = vdfString(settings, 'requires_click')
    set(pad.requiresClick, (value === undefined ? fallback : value === '1') ? 'ON' : 'OFF')
  }
  const output = vdfString(settings, 'output_joystick')

  switch (mode) {
    case 'absolute_mouse':
    case 'trackball':
      set(`${pad.key}TOUCHPAD_MODE`, 'MOUSE')
      ctx.report('converted', where, 'Moves the mouse')
      if (vdfString(settings, 'sensitivity')) ctx.report('approximated', where, `Steam's trackpad sensitivity is not carried over; tune it on Trackpads`)
      break
    case 'joystick_move':
    case 'joystick_camera':
    case 'mouse_joystick': {
      const stick = output === '0' ? 'LEFT_STICK' : output === '1' ? 'RIGHT_STICK' : mode === 'joystick_move' && source === 'left_trackpad' ? 'LEFT_STICK' : 'RIGHT_STICK'
      set(`${pad.key}TOUCHPAD_MODE`, 'GRID_AND_STICK')
      set(`${pad.key}TOUCH_STICK_MODE`, stick)
      ctx.usesXinput()
      ctx.report(mode === 'joystick_move' ? 'converted' : 'approximated', where,
        `Touch stick to the virtual ${stick === 'LEFT_STICK' ? 'left' : 'right'} stick${mode === 'joystick_move' ? '' : `; Steam's ${mode.replace(/_/g, ' ')} tuning is not kept`}`)
      break
    }
    case 'dpad':
    case 'four_buttons':
      grid('FOUR_WAY')
      requiresClick(true)
      for (const name of writeDirections(writer, where, inputs, [1, 2, 3, 4].map(n => `${pad.cell}${n}`), ['up', 'right', 'down', 'left'])) used.add(name)
      break
    case 'touch_menu': {
      const items = inputs.filter(([name]) => menuIndex(name) !== null)
      const count = Number(vdfString(settings, 'touch_menu_button_count')) || Math.max(1, ...items.map(([name]) => (menuIndex(name) ?? 0) + 1))
      let size = TOUCH_MENU_GRIDS[count]
      if (!size) {
        // Steam's 7 and 13 are staggered layouts; the nearest grid holds every button.
        const columns = Math.min(5, Math.ceil(Math.sqrt(count)))
        size = [columns, Math.min(5, Math.ceil(count / columns))]
        ctx.report('approximated', where, `Steam's ${count}-button touch menu became a ${size[0]}×${size[1]} grid, so the buttons sit in different places`)
      }
      grid('RECTANGLE', `${size[0]} ${size[1]}`)
      for (const [name, value] of items) {
        const index = menuIndex(name)!
        if (index >= size[0] * size[1]) { ctx.report('skipped', `${where} menu button ${index + 1}`, 'it does not fit in the grid'); continue }
        used.add(name.toLowerCase())
        writeInput(writer, `${pad.cell}${index + 1}`, `${where} menu button ${index + 1}`, value)
      }
      break
    }
    case 'radial_menu': {
      const items = inputs.filter(([name]) => menuIndex(name) !== null)
      const count = Math.min(25, Math.max(2, Number(vdfString(settings, 'touch_menu_button_count')) || 0, ...items.map(([name]) => (menuIndex(name) ?? 0) + 1)))
      grid('RADIAL', `${count} 1`)
      for (const [name, value] of items) {
        const index = menuIndex(name)!
        if (index >= count) continue
        used.add(name.toLowerCase())
        writeInput(writer, `${pad.cell}${index + 1}`, `${where} menu item ${index + 1}`, value)
      }
      break
    }
    case 'single_button': {
      const touch = inputs.find(([name]) => name.toLowerCase() === 'touch')
      if (touch && readActivators(touch[1]).some(a => a.bindings.length)) {
        grid('RECTANGLE', '1 1')
        set(pad.requiresClick, 'OFF')
        used.add('touch')
        writeInput(writer, `${pad.cell}1`, `${where} touch`, touch[1])
      }
      break
    }
    case '':
      break
    default:
      ctx.report('skipped', where, `the "${mode.replace(/_/g, ' ')}" trackpad mode has no match here`)
  }
  writeClick(writer, where, inputs, used, pad.click)
  reportUnused(writer, where, inputs, used)
}

function writeTrigger(writer: Writer, source: string, group: VdfNode) {
  const ctx = writer.ctx
  const left = source === 'left_trigger'
  const command = left ? 'ZL' : 'ZR'
  const where = sourceName(source)
  const mode = (vdfString(group, 'mode') ?? '').toLowerCase()
  const inputs = groupInputs(group)
  const used = new Set<string>()
  const output = vdfString(vdfNode(group, 'settings'), 'output_trigger')
  const analog = output === '1' ? 'X_LT' : output === '2' ? 'X_RT' : null

  if (mode !== 'trigger' && mode !== 'single_button' && mode !== '') {
    ctx.report('skipped', where, `the "${mode.replace(/_/g, ' ')}" trigger mode has no match here`)
  }
  if (analog) {
    write(writer, `${command}_MODE`, analog, where)
    ctx.usesXinput()
    ctx.report('converted', where, `Analog output to the virtual ${analog === 'X_LT' ? 'left' : 'right'} trigger`)
  }
  const click = inputs.find(([name]) => name.toLowerCase() === 'click')
  if (click) {
    used.add('click')
    // Steam's soft pull is a separate activator on the same input; it is
    // Studio's ordinary trigger press, and the rest is the full pull.
    const activators = readActivators(click[1])
    const soft = activators.filter(a => a.type === 'soft_press')
    const full = activators.filter(a => a.type !== 'soft_press')
    const redundant = (a: Activator) => a.bindings.every(b => (translateBinding(b) as { token?: string } | null)?.token === analog)
    const node = (list: Activator[]): VdfNode => [['activators', list.map(a => [a.type, [['bindings', a.bindings.map(b => ['binding', b] as [string, VdfValue])], ...(a.settings ? [['settings', a.settings] as [string, VdfValue]] : [])]] as [string, VdfValue])]]
    if (soft.length) writeInput(writer, command, `${where} soft pull`, node(soft))
    const fullBindings = full.filter(a => a.bindings.length && !(analog && redundant(a)))
    if (fullBindings.length) {
      if (mode === 'single_button' || (!soft.length && !analog)) {
        // Nothing else on the trigger: the press is the trigger.
        writeInput(writer, command, `${where} pull`, node(fullBindings))
      } else {
        if (!analog) write(writer, `${command}_MODE`, 'NO_SKIP', where)
        writeInput(writer, `${command}F`, `${where} full pull`, node(fullBindings))
      }
    }
  }
  reportUnused(writer, where, inputs, used)
}

function writeGyro(writer: Writer, group: VdfNode) {
  const ctx = writer.ctx
  const where = 'Gyro'
  const mode = (vdfString(group, 'mode') ?? '').toLowerCase()
  const settings = vdfNode(group, 'settings')
  const sensitivity = Number(vdfString(settings, 'sensitivity'))
  const sens = Number.isFinite(sensitivity) && sensitivity > 0 ? Math.round(sensitivity) / 100 : 1
  switch (mode) {
    case 'gyro_to_mouse':
    case 'mouse_joystick':
      write(writer, 'GYRO_OUTPUT', 'MOUSE', where)
      break
    case 'gyro_to_joystick_camera':
    case 'gyro_to_joystick':
    case 'gyro_to_joystick_deflection':
      write(writer, 'GYRO_OUTPUT', 'RIGHT_STICK', where)
      ctx.usesXinput()
      break
    default:
      ctx.report('skipped', where, `the "${mode.replace(/_/g, ' ')}" gyro mode has no match here`)
      return
  }
  write(writer, 'GYRO_SENS', String(sens), where)
  ctx.report('approximated', where, `Gyro ${mode.includes('joystick') ? 'to the virtual right stick' : 'to mouse'} at a starting speed of ${sens}; Steam measures speed differently, so tune it on Gyro`)
  const button = vdfString(settings, 'gyro_button')
  if (button && button !== '0') ctx.report('skipped', `${where} activation`, `Steam's gyro enable button could not be read, so gyro is always on; choose when it's on in Gyro`)
}

function writeSource(writer: Writer, source: string, group: VdfNode) {
  const where = sourceName(source)
  const mode = (vdfString(group, 'mode') ?? '').toLowerCase()
  const inputs = groupInputs(group)
  switch (source) {
    case 'button_diamond':
      if (mode === 'dpad') {
        const used = writeDirections(writer, where, inputs, ['N', 'E', 'S', 'W'], ['up', 'right', 'down', 'left'])
        reportUnused(writer, where, inputs, used)
      } else writeButtons(writer, where, inputs, FACE_INPUTS)
      return
    case 'dpad': {
      if (mode !== 'dpad' && mode !== 'four_buttons') { writer.ctx.report('skipped', where, `the "${mode.replace(/_/g, ' ')}" d-pad mode has no match here`); return }
      const used = writeDirections(writer, where, inputs, ['UP', 'RIGHT', 'DOWN', 'LEFT'], ['up', 'right', 'down', 'left'])
      reportUnused(writer, where, inputs, used)
      return
    }
    case 'switch':
      writeButtons(writer, where, inputs, SWITCH_INPUTS)
      return
    case 'joystick':
    case 'left_joystick':
    case 'right_joystick':
      writeStick(writer, source === 'left_joystick' ? 'joystick' : source, group)
      return
    case 'left_trackpad':
    case 'right_trackpad':
    case 'center_trackpad':
      writeTrackpad(writer, source, group)
      return
    case 'left_trigger':
    case 'right_trigger':
      writeTrigger(writer, source, group)
      return
    case 'gyro':
      writeGyro(writer, group)
      return
    default:
      writer.ctx.report('skipped', where, 'this input source has no match here')
  }
}

function writeModeshift(writer: Writer, trigger: string, where: string, source: string, groupId: string) {
  const ctx = writer.ctx
  const group = ctx.groups.get(groupId)
  if (writer.prefix) { ctx.report('skipped', where, 'a mode shift inside another has no match here'); return }
  if (!group) { ctx.report('skipped', where, `its mode shift points at a group this layout does not have`); return }
  if (source === 'switch' || source === 'gyro') {
    ctx.report('skipped', where, `changing the ${sourceName(source).toLowerCase()} while holding a button has no match here`)
    return
  }
  writeSource(writer.shifted(trigger), source, group)
  ctx.report('converted', where, `Mode shift: ${sourceName(source)}`)
}

// --- Presets ---------------------------------------------------------------

type Preset = { id: number; name: string; title: string; bindings: Array<{ group: string; source: string; active: boolean; modeshift: boolean }>; parent?: string }

const readBindings = (node: VdfNode | undefined) =>
  (node ?? []).flatMap(([group, value]) => {
    if (typeof value !== 'string') return []
    const [source, state, extra] = value.trim().split(/\s+/)
    return [{ group, source: source.toLowerCase(), active: state === 'active', modeshift: extra === 'modeshift' }]
  })

const sanitizeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Steam layout'
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'layer'

export type ConvertOptions = {
  fileName?: string
  /** Shown in the file's header comment. */
  date?: string
  /** Names the configurations instead of the layout's own title. */
  title?: string
}

export function convertSteamLayout(text: string, options: ConvertOptions = {}): SteamConversion {
  const root = vdfNode(parseVdf(text), 'controller_mappings')
  if (!root) throw new Error('This is not a Steam Input layout: it has no controller_mappings block.')

  const localization = vdfNode(vdfNode(root, 'localization'), 'english')
  const localize = (value: string) => {
    if (!value.startsWith('#')) return value
    return vdfString(localization, value.slice(1)) ?? value.slice(1).replace(/_/g, ' ')
  }
  const fileTitle = (options.fileName ?? '').replace(/\.[^.]+$/, '')
  const rawTitle = localize(vdfString(root, 'title') ?? '')
  const title = sanitizeName(options.title?.trim() || (rawTitle && rawTitle !== 'Title' ? rawTitle : vdfString(root, 'game') ?? fileTitle))
  const controllerType = vdfString(root, 'controller_type') ?? ''

  const groups = new Map<string, VdfNode>()
  for (const value of vdfAll(root, 'group')) {
    if (!Array.isArray(value)) continue
    const id = vdfString(value, 'id')
    if (id !== undefined) groups.set(id, value)
  }

  // Version 2 has one implicit set: top-level source bindings plus a switch block.
  const presets: Preset[] = vdfAll(root, 'preset').filter(Array.isArray).map((node, order) => {
    const presetNode = node as VdfNode
    const name = vdfString(presetNode, 'name') ?? `Preset ${order}`
    return { id: Number(vdfString(presetNode, 'id') ?? order), name, title: name, bindings: readBindings(vdfNode(presetNode, 'group_source_bindings')) }
  })
  if (!presets.length) {
    const bindings = readBindings(vdfNode(root, 'group_source_bindings'))
    const switches = vdfNode(root, 'switch_bindings')
    if (switches) {
      const id = '__switches'
      groups.set(id, [['mode', 'switches'], ['inputs', vdfNode(switches, 'bindings') ?? []]])
      bindings.push({ group: id, source: 'switch', active: true, modeshift: false })
    }
    presets.push({ id: 0, name: 'Default', title: 'Default', bindings })
  }

  // Which presets are sets and which are layers, and what each is called.
  const actions = vdfNode(root, 'actions')
  const actionLayers = vdfNode(root, 'action_layers')
  for (const preset of presets) {
    const layerInfo = vdfNode(actionLayers, preset.name)
    const setInfo = vdfNode(actions, preset.name)
    const info = layerInfo ?? setInfo
    preset.title = localize(vdfString(info, 'title') ?? preset.name)
    if (layerInfo) preset.parent = vdfString(layerInfo, 'parent_set_name') ?? presets[0].name
  }
  const sets = presets.filter(preset => !preset.parent)
  if (!sets.length) sets.push(presets[0])
  const setName = (preset: Preset) => preset === sets[0] ? title : sanitizeName(`${title} - ${preset.title}`)

  const report: ReportItem[] = []
  const usedLayerIds = new Set<string>()
  const layerRefs = new Map<Preset, LayerRef>()
  for (const preset of presets.filter(p => p.parent)) {
    let id = slug(preset.title)
    while (usedLayerIds.has(id)) id += '-2'
    usedLayerIds.add(id)
    layerRefs.set(preset, { id, name: preset.title })
  }
  // Steam numbers presets from 1 in these actions: CHANGE_PRESET 2 is the
  // preset whose id is 1. A file that numbers them from its own ids still
  // resolves, by falling back to the id itself.
  const findPreset = (n: number) => presets.find(p => p.id === n - 1) ?? presets.find(p => p.id === n) ?? null

  const timing = { hold: [] as number[], double: [] as number[] }
  const converted: ConvertedSet[] = []
  const bodies: string[][] = []
  for (const set of sets) {
    const scope = set === sets[0] ? undefined : set.title
    const setLayers = presets.filter(p => p.parent && (p.parent === set.name || (set === sets[0] && !sets.some(s => s.name === p.parent))))
    let xinput = false
    let currentScope = scope
    const ctx: Context = {
      report: (status, where, detail) => report.push({ status, where, detail, set: set.title, input: reportInput(where), ...(currentScope ? { scope: currentScope } : {}) }),
      resolveSet: n => { const p = findPreset(n); return p && sets.includes(p) ? setName(p) : null },
      resolveLayer: n => { const p = findPreset(n); return p && setLayers.includes(p) ? layerRefs.get(p) ?? null : null },
      groups, localize, usesXinput: () => { xinput = true }, timing,
    }

    const writeSet = (writer: Writer, preset: Preset) => {
      for (const binding of preset.bindings) {
        if (!binding.active || binding.modeshift) continue
        const group = groups.get(binding.group)
        if (!group) { ctx.report('skipped', sourceName(binding.source), `its group ${binding.group} is missing from the file`); continue }
        writeSource(writer, binding.source, group)
      }
    }

    const main = new Writer(ctx)
    writeSet(main, set)
    const layerLines: string[] = []
    for (const layerPreset of setLayers) {
      const ref = layerRefs.get(layerPreset)!
      currentScope = `Mode: ${ref.name}`
      const layerWriter = new Writer(ctx)
      writeSet(layerWriter, layerPreset)
      main.layerActions.push(...layerWriter.layerActions)
      layerLines.push(`# @layer ${JSON.stringify({ id: ref.id, name: ref.name, overrides: Object.fromEntries(layerWriter.entries) })}`)
      currentScope = scope
    }

    const lines: string[] = [
      `# Imported from the Steam Input layout "${title}"${set === sets[0] ? '' : `, action set "${set.title}"`}${options.fileName ? ` (${options.fileName})` : ''}`,
      ...(options.date ? [`# Converted by JSM Evolved on ${options.date}.`] : []),
      'RESET_MAPPINGS',
    ]
    if (xinput) lines.push('VIRTUAL_CONTROLLER = XBOX')
    {
      const consistent = (values: number[]) => values.length && values.every(v => v === values[0]) ? values[0] : null
      const hold = consistent(timing.hold)
      const double = consistent(timing.double)
      if (hold) lines.push(`HOLD_PRESS_TIME = ${hold}`)
      if (double) lines.push(`DBL_PRESS_WINDOW = ${double}`)
      if (set === sets[0] && timing.hold.length && !hold) report.push({ status: 'approximated', set: set.title, where: 'Long press', input: 'ALL', detail: 'Steam had a hold time per button; one time is used for every button' })
      if (set === sets[0] && timing.double.length && !double) report.push({ status: 'approximated', set: set.title, where: 'Double-tap', input: 'ALL', detail: 'Steam had a double-tap time per button; one time is used for every button' })
    }
    for (const [key, value] of main.entries) lines.push(`${key} = ${value}`)
    for (const [command, label] of main.labels) lines.push(`# @label ${command} = ${label.replace(/[\r\n#]/g, '').trim()}`)
    lines.push(...layerLines)
    // Steam often applies a layer from one button and removes it from the same
    // button inside the layer; Studio says that in one word.
    const actions = main.layerActions.filter((action, index, all) => all.findIndex(a => a.input === action.input && a.verb === action.verb && a.layerId === action.layerId) === index)
    for (const action of actions) {
      const pair = (verb: string) => actions.some(a => a.input === action.input && a.layerId === action.layerId && a.verb === verb)
      if (action.verb === 'remove' && pair('apply')) continue
      const verb = action.verb === 'apply' && pair('remove') ? 'toggle' : action.verb
      lines.push(`# @layer-action ${action.input} = ${verb} ${action.layerId}`)
    }

    converted.push({ name: setName(set), displayName: set === sets[0] ? title : `${title} · ${set.title}`, setTitle: set.title, isDefault: set === sets[0], text: '', layers: setLayers.map(p => layerRefs.get(p)!.name) })
    bodies.push(lines)
  }

  // Notes join the header comment, once every set has reported. Above the first
  // setting they stay put however often the file is saved; at the end of the
  // file the serializer would carry them into whichever section came last.
  converted.forEach((entry, index) => {
    const misses = report.filter(item => item.status !== 'converted' && item.set === entry.setTitle)
    const notes = misses.length
      ? ['# Not brought over exactly from Steam:', ...misses.map(item => `# - ${item.status === 'skipped' ? 'Not brought over' : 'Close enough'}: ${item.where}${item.scope?.startsWith('Mode:') ? ` (${item.scope})` : ''}: ${item.detail}`.replace(/[\r\n]/g, ' '))]
      : []
    const body = bodies[index]
    const header = body.findIndex(line => !line.startsWith('#'))
    entry.text = [...body.slice(0, header), ...notes, ...body.slice(header)].join('\n') + '\n'
  })

  const counts: Record<ReportStatus, number> = { converted: 0, approximated: 0, skipped: 0 }
  for (const item of report) counts[item.status]++
  return { title, controllerType, sets: converted, report, counts }
}

/** What Steam calls a controller_type, for the import list. */
export function steamControllerName(type: string) {
  const known: Record<string, string> = {
    controller_neptune: 'Steam Deck', controller_steamcontroller_gordon: 'Steam Controller (2015)',
    controller_triton: 'Steam Controller', controller_xbox360: 'Xbox 360', controller_xboxone: 'Xbox',
    controller_xboxelite: 'Xbox Elite', controller_ps4: 'DualShock 4', controller_ps5: 'DualSense',
    controller_ps5_edge: 'DualSense Edge', controller_switch_pro: 'Switch Pro', controller_generic: 'Generic gamepad',
  }
  return known[type.toLowerCase()] ?? (type ? type.replace(/^controller_/, '').replace(/_/g, ' ') : 'Unknown controller')
}
