/** Layers travel with their profile. Only explicit overrides are stored. */
import { FACE_BUTTONS, DPAD_BUTTONS, BUMPER_BUTTONS, TRIGGER_BUTTONS, CENTER_BUTTONS, PADDLE_BUTTONS, MINI_BUTTONS, MISC_BUTTONS, LEFT_STICK_BUTTONS, RIGHT_STICK_BUTTONS, TOUCH_BUTTONS, TOUCH_STICK_BUTTONS } from '../keymap/schema'
/** What turns a layer on or off belongs to the input, the way Steam binds
 *  "Apply Action Layer" onto a button rather than storing it on the layer. So a
 *  layer is a name and a set of overrides, any number of inputs can drive the
 *  same layer, and a layer with nothing bound to it is a perfectly good layer
 *  that simply never activates. */
export type ConfigLayer = {
  id: string; name: string; overrides: Record<string, string>
  /** While this layer is applied, other layers' holds are ignored (Layers 15e). */
  suppressHolds?: boolean
  /** Read from older profiles and migrated on write; never written again. */
  trigger?: string; applyTrigger?: string; removeTrigger?: string
}
export const layerVerbs = ['hold', 'apply', 'remove', 'toggle'] as const
export type LayerVerb = (typeof layerVerbs)[number]
export type LayerAction = { input: string; verb: LayerVerb; layerId: string }
export const layerVerbLabels: Record<LayerVerb, string> = {
  hold: 'Hold layer', apply: 'Apply layer', remove: 'Remove layer', toggle: 'Toggle layer',
}
export const actionsForLayer = (actions: LayerAction[], layerId: string) => actions.filter(a => a.layerId === layerId)
export const actionsOnInput = (actions: LayerAction[], input: string) => actions.filter(a => a.input === input)
export const describeAction = (action: LayerAction, layers: ConfigLayer[]) =>
  `${layerVerbLabels[action.verb]}: ${layers.find(l => l.id === action.layerId)?.name ?? action.layerId}`
const inputs = new Set([...FACE_BUTTONS, ...DPAD_BUTTONS, ...BUMPER_BUTTONS, ...TRIGGER_BUTTONS, ...CENTER_BUTTONS, ...PADDLE_BUTTONS, ...MINI_BUTTONS, ...MISC_BUTTONS, ...LEFT_STICK_BUTTONS, ...RIGHT_STICK_BUTTONS, ...TOUCH_BUTTONS, ...TOUCH_STICK_BUTTONS].map(b => b.command))
export const inputDefinitions = [...FACE_BUTTONS, ...DPAD_BUTTONS, ...BUMPER_BUTTONS, ...TRIGGER_BUTTONS, ...CENTER_BUTTONS, ...PADDLE_BUTTONS, ...MINI_BUTTONS, ...MISC_BUTTONS, ...LEFT_STICK_BUTTONS, ...RIGHT_STICK_BUTTONS, ...TOUCH_BUTTONS, ...TOUCH_STICK_BUTTONS]
export function readableSetting(key: string) {
  const names: Record<string, string> = { GYRO_ON: 'Enable gyro', GYRO_OFF: 'Disable gyro', ZL_MODE: 'Left trigger output', ZR_MODE: 'Right trigger output', RIGHT_TOUCHPAD_MODE: 'Right pad behavior', LEFT_TOUCHPAD_MODE: 'Left pad behavior', RIGHT_TOUCHPAD_SENS: 'Right pad sensitivity', LEFT_TOUCHPAD_SENS: 'Left pad sensitivity' }
  return names[key] ?? key.toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}
/** All configured positions, including positions without assignment lines. */
export function configuredInputs(text: string): string[] {
  const entries = layerEntries(text), commands = new Set(inputDefinitions.map(b => b.command))
  for (const key of Object.keys(entries)) for (const part of key.split(/[,+]/)) if (/^[LR]?[TM]\d+$/.test(part)) commands.add(part)
  for (const [side, prefix] of [['LEFT_', 'LT'], ['RIGHT_', 'RT'], ['', 'T']]) {
    if (entries[side + 'TOUCHPAD_MODE']?.split('#')[0].trim() !== 'GRID_AND_STICK') continue
    const size = (entries[side + 'GRID_SIZE'] ?? '2 1').split('#')[0].trim().split(/\s+/).map(Number)
    const shape = entries[side + 'GRID_SHAPE']?.split('#')[0].trim()
    const count = shape === 'FOUR_WAY' ? 4 : shape === 'EIGHT_WAY' ? 8 : shape === 'RADIAL' && size[0] * size[1] < 2 ? 0 : Math.min(25, Math.max(1, (size[0] || 2) * (size[1] || 1)))
    for (let i = 1; i <= count; i++) commands.add(prefix + i)
  }
  for (const [side, prefix] of [['LEFT', 'LM'], ['RIGHT', 'RM']]) {
    if (entries[side + '_STICK_MODE']?.trim() !== 'RADIAL_MENU') continue
    const count = Math.min(25, Math.max(0, parseInt(entries[side + '_STICK_MENU_SIZE'] ?? '0') || 0))
    if (count < 2) continue
    for (let i = 1; i <= count; i++) commands.add(prefix + i)
  }
  return [...commands]
}
export type InputUsage = { kind: 'setting' | 'shift' | 'chord' | 'layer' | 'analog'; target: string; label: string; layerId?: string }
export function inputUsage(text: string, command: string, layers = readLayers(text)): InputUsage[] {
  const uses: InputUsage[] = actionsOnInput(readLayerActions(text, layers), command)
    .map(action => ({ kind: 'layer' as const, target: command, label: describeAction(action, layers), layerId: action.layerId }))
  for (const [key, raw] of Object.entries(layerEntries(text))) {
    if (key.startsWith('#')) continue
    const value = raw.split('#')[0].trim(), parts = key.split(',')
    if (parts.length > 1 && parts[0] === command) uses.push({ kind: 'shift', target: parts.slice(1).join(','), label: `${readableSetting(parts.slice(1).join(','))} → ${value.replace(/_/g, ' ')}` })
    if (key.length > 1 && key.includes('+') && key.split('+').includes(command)) uses.push({ kind: 'chord', target: key, label: `Together ${key}: ${value}` })
    if (/^(GYRO_ON|GYRO_OFF|[A-Z_]+_(ON|OFF|BUTTON|TRIGGER))$/.test(parts[parts.length - 1]) && value.split(/\s+/).includes(command)) uses.push({ kind: 'setting', target: key, label: readableSetting(parts[parts.length - 1]) + (parts.length > 1 ? ` (hold ${parts[0]})` : '') })
    if (key === `${command}_MODE` && /^X_[LR]T$/.test(value)) uses.push({ kind: 'analog', target: key, label: `Analog ${command === 'ZL' ? 'left' : 'right'} trigger → Xbox` })
  }
  return uses
}
const isBinding = (key: string) => inputs.has(key) || key.split(/[,+]/).some(k => inputs.has(k) || /^[LR]?T\d+$/.test(k)) || /^[LR]?T\d+$/.test(key)
const marker = /^\s*#\s*@layer\s+(.+)$/i
export function readLayers(text: string): ConfigLayer[] {
  const layers: ConfigLayer[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(marker)
    if (!match) continue
    try {
      const layer = JSON.parse(match[1]) as ConfigLayer
      // Activation is not part of a layer any more, so nothing about it is
      // required here. The legacy fields are read by readLayerActions and are
      // simply carried until the next write drops them.
      const legacy = (value: unknown) => value === undefined || typeof value === 'string'
      if (typeof layer.id === 'string' && typeof layer.name === 'string' && layer.overrides &&
        legacy(layer.trigger) && legacy(layer.applyTrigger) && legacy(layer.removeTrigger) &&
        Object.values(layer.overrides).every(v => typeof v === 'string') && !layers.some(l => l.id === layer.id)) layers.push(layer)
    } catch { /* Preserve unrecognized metadata verbatim. */ }
  }
  return layers
}
const actionMarker = /^\s*#\s*@layer-action\s+(\S+)\s*=\s*(\S+)\s+(\S+)\s*$/i
/** Activation, from the annotations and from the fields older profiles used. */
const ACTION_CACHE = new Map<string, LayerAction[]>()
export function readLayerActions(text: string, layers = readLayers(text)): LayerAction[] {
  const cacheable = text.includes('\n')
  const hit = cacheable ? ACTION_CACHE.get(text) : undefined
  if (hit) return hit
  const actions: LayerAction[] = []
  const add = (input: string, verb: LayerVerb, layerId: string) => {
    if (!input || !layers.some(layer => layer.id === layerId)) return
    if (actions.some(a => a.input === input && a.verb === verb && a.layerId === layerId)) return
    actions.push({ input, verb, layerId })
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(actionMarker)
    if (!match) continue
    const verb = match[2].toLowerCase() as LayerVerb
    if (layerVerbs.includes(verb)) add(match[1].toUpperCase(), verb, match[3])
  }
  // A profile written before activation moved to the input still carries it on
  // the layer. Read it so nothing breaks; it is dropped on the next write.
  for (const layer of layers) {
    if (layer.trigger) add(layer.trigger.toUpperCase(), 'hold', layer.id)
    const apply = layer.applyTrigger, remove = layer.removeTrigger
    if (apply && remove && apply === remove) add(apply.toUpperCase(), 'toggle', layer.id)
    else {
      if (apply) add(apply.toUpperCase(), 'apply', layer.id)
      if (remove) add(remove.toUpperCase(), 'remove', layer.id)
    }
  }
  if (cacheable) {
    ACTION_CACHE.set(text, actions)
    if (ACTION_CACHE.size > 8) ACTION_CACHE.delete(ACTION_CACHE.keys().next().value!)
  }
  return actions
}

export function defaultLayer(text: string) {
  const known = new Set(readLayers(text).map(layer => layer.id))
  return text.split(/\r?\n/).filter(line => {
    const match = line.match(marker)
    if (!match) return true
    try { return !known.has(JSON.parse(match[1]).id) } catch { return true }
  }).join('\n')
}
/** Writes the layers and what activates them. The activation fields older
 *  profiles kept on the layer are dropped here, which is the migration. */
export function writeLayers(text: string, layers: ConfigLayer[], actions = readLayerActions(text, layers)) {
  const live = actions.filter(action => layers.some(layer => layer.id === action.layerId))
  return [
    // Dropped from the base here rather than in defaultLayer, because they are
    // re-emitted below and everything else that reads the base needs them.
    defaultLayer(text).split(/\r?\n/).filter(line => !actionMarker.test(line)).join('\n').trimEnd(),
    ...layers.map(({ id, name, overrides, suppressHolds }) => `# @layer ${JSON.stringify(suppressHolds ? { id, name, suppressHolds, overrides } : { id, name, overrides })}`),
    ...live.map(action => `# @layer-action ${action.input} = ${action.verb} ${action.layerId}`),
  ].join('\n')
}
/** Replace the activation for one input, keeping every other input intact. */
export function setLayerActions(text: string, input: string, next: LayerAction[]) {
  const layers = readLayers(text)
  const kept = readLayerActions(text, layers).filter(action => action.input !== input)
  return writeLayers(text, layers, [...kept, ...next])
}
// Parsing a whole configuration is pure, and the text only changes when the
// profile is edited -- but the callers (input usage, per-value origin) run on
// every render, and renders are driven by controller telemetry, so this was
// re-parsing the profile hundreds of times a second and costing most of the
// frame. Cache the last few whole-configuration parses. Single-line lookups
// (projectLayer, the reset path) are not cached: they are cheap, and each line
// is a distinct key that would otherwise evict the configuration we want.
const ENTRY_CACHE = new Map<string, Readonly<Record<string, string>>>()
const ENTRY_CACHE_LIMIT = 8

// Annotation keys use their complete prefix, e.g. "# @label R,N".
export function layerEntries(text: string): Readonly<Record<string, string>> {
  const cacheable = text.includes('\n')
  if (cacheable) {
    const hit = ENTRY_CACHE.get(text)
    if (hit) return hit
  }
  const entries = parseLayerEntries(text)
  if (cacheable) {
    // Frozen so a future caller cannot mutate a shared result, and evicted
    // oldest-first so an editing session cannot grow this without bound.
    Object.freeze(entries)
    ENTRY_CACHE.set(text, entries)
    if (ENTRY_CACHE.size > ENTRY_CACHE_LIMIT) ENTRY_CACHE.delete(ENTRY_CACHE.keys().next().value!)
  }
  return entries
}

function parseLayerEntries(text: string) {
  const entries: Record<string, string> = {}
  for (const line of defaultLayer(text).split(/\r?\n/)) {
    const overlay = line.match(/^\s*#\s*@overlay\s+(\S+)\s+(.*)$/i)
    if (overlay) { entries[`# @overlay ${overlay[1]}`] = overlay[2]; continue }
    const match = line.match(/^\s*((?:#\s*@(label|icon|overlay)\s+)?[^=#]+?)\s*=\s*(.*)$/i)
    if (!match || (line.trimStart().startsWith('#') && !match[2])) continue
    entries[match[1].trim().replace(/\s*([,+])\s*/g, '$1')] = match[3].trim()
  }
  return entries
}
export function layerLine(key: string, value: string) { return key.startsWith('# @overlay ') ? `${key} ${value}` : `${key} = ${value}` }
export function projectLayer(text: string, id: string) {
  const base = defaultLayer(text)
  const layer = readLayers(text).find(layer => layer.id === id)
  if (!layer) return base
  const keys = new Set(Object.keys(layer.overrides))
  const seen = new Set<string>()
  const lines = base.split(/\r?\n/).reverse().filter(line => {
    const key = Object.keys(layerEntries(line))[0]
    if (!key) return true
    if (keys.has(key) || seen.has(key)) return false
    seen.add(key); return true
  }).reverse()
  return [...lines, ...Object.entries(layer.overrides).map(([key, value]) => layerLine(key, value))].join('\n')
}
export function foldLayer(text: string, id: string, edited: string, before = projectLayer(text, id)) {
  if (edited === before) return text
  const layers = readLayers(text)
  const layer = layers.find(layer => layer.id === id)
  if (!layer) return writeLayers(edited, layers)
  const old = layerEntries(before), next = layerEntries(edited)
  for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
    if (old[key] === next[key]) continue
    if (next[key] === undefined && !key.startsWith('#') && !isBinding(key)) delete layer.overrides[key]
    else layer.overrides[key] = next[key] ?? (key.startsWith('#') ? '' : 'NONE')
  }
  return writeLayers(text, layers)
}
export function convertModeshifts(text: string, layer: ConfigLayer, trigger: string) {
  const retained: string[] = []
  for (const line of defaultLayer(text).split(/\r?\n/)) {
    const overlay = line.match(/^\s*#\s*@overlay\s+(\w+):([^\s]+)\s+(.*)$/i)
    if (overlay && overlay[2].toUpperCase() === trigger) {
      layer.overrides[`# @overlay ${overlay[1]}`] = overlay[3]; continue
    }
    const match = line.match(/^\s*(#\s*@(label|icon)\s+)?([^#,=]+),\s*([^=]+?)\s*=\s*(.*)$/i)
    if (match && match[3].trim().toUpperCase() === trigger) {
      layer.overrides[`${match[1] ?? ''}${match[4].trim()}`] = match[5]
    } else retained.push(line)
  }
  return writeLayers(retained.join('\n'), [...readLayers(text), layer])
}
export function inputUses(text: string, command: string, layers = readLayers(text)): string[] {
  const uses = actionsOnInput(readLayerActions(text, layers), command).map(action => describeAction(action, layers))
  const targets = new Set<string>(), shifted = new Set<string>(), chords = new Set<string>()
  for (const key of Object.keys(layerEntries(text)).filter(key => !key.startsWith('#'))) {
    const comma = key.indexOf(',')
    if (comma > 0) {
      const trigger = key.slice(0, comma), target = key.slice(comma + 1)
      if (trigger === command) targets.add(target)
      if (target === command) shifted.add(trigger)
    }
    // A literal + is the Plus button; only interior + separates a simultaneous chord.
    if (key.length > 1 && key.includes('+') && key.split('+').includes(command)) chords.add(key)
  }
  if (targets.size) uses.push(`Shift trigger: ${[...targets].join(', ')}`)
  if (shifted.size) uses.push(`Modeshift: hold ${[...shifted].join(' / ')}`)
  if (chords.size) uses.push(`Chord: ${[...chords].join(', ')}`)
  inputUsage(text, command, []).filter(use => use.kind === 'setting' || use.kind === 'analog').forEach(use => uses.push(use.label))
  return uses
}
