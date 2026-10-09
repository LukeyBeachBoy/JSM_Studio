import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerDisplayName, controllerSupportsInput } from './controllerStatus'
import { commandKey, stripComment } from './configIncludes'
import { layerEntries, readLayers, writeLayers, readLayerActions, inputDefinitions } from './layers'
import { applyGamepadPassthrough } from './quickBind'
import { updateKeymapEntry } from './keymap'
import { readVirtualMenus, writeVirtualMenus } from './virtualMenus'
import { sameValue } from './inheritedOverrides'

export const controllerModelKey = (device?: Pick<TelemetryDevice, 'type' | 'vid' | 'pid'>) =>
  !device?.type ? '' : device.type === 5 && device.vid === 0x054c && device.pid === 0x0df2 ? 'type-5-edge' : `type-${device.type}`
const row = /^\s*#\s*@controller\s+(type-\d+(?:-edge)?)\s+(.+)$/
const pad = /^\s*#\s*@controller-pad\s+(type-\d+(?:-edge)?)\s+(left|right)\s*$/
export const controllerBase = (text: string) => text.split(/\r?\n/).filter(line => !row.test(line) && !pad.test(line)).join('\n')
export const controllerPadSource = (text: string, model: string): 'left' | 'right' => {
  let source: 'left' | 'right' = 'right'
  for (const line of text.split(/\r?\n/)) { const match = line.match(pad); if (match?.[1] === model) source = match[2] as typeof source }
  return source
}
export const controllerOverrides = (text: string, model: string) => text.split(/\r?\n/).flatMap(line => {
  const match = line.match(row)
  return match?.[1] === model ? [match[2]] : []
})
export const hasControllerVariant = (text: string, model: string) => controllerOverrides(text, model).length > 0

export function translateControllerToken(token: string, side: 'left' | 'right') {
  const prefix = `${side.toUpperCase()}_`
  if (token === `${prefix}GRID_REQUIRES_CLICK`) return 'TOUCHPAD_GRID_REQUIRES_CLICK'
  if (token.startsWith(prefix) && /^(TOUCH|GRID_)/.test(token.slice(prefix.length))) return token.slice(prefix.length)
  if (new RegExp(`^${side === 'left' ? 'LT' : 'RT'}\\d+$`).test(token)) return token.slice(1)
  if (token === (side === 'left' ? 'MISC3' : 'MISC2')) return 'CAPTURE'
  if (side === 'left' && token === 'MISC4') return 'TOUCH'
  return token
}
const translateKey = (key: string, side: 'left' | 'right') => key.replace(/[A-Z][A-Z0-9_]*/g, token => translateControllerToken(token, side))
const singlePadModel = (model: string) => ['type-4', 'type-5', 'type-5-edge'].includes(model)

/** Derived runtime/editor view. The source text is never rewritten by this. */
export function adaptControllerBase(text: string, model: string, side: 'left' | 'right' = 'right', forcePad = false) {
  if (!singlePadModel(model)) return text
  const entries = layerEntries(text)
  const additions: string[] = []
  for (const [key, value] of Object.entries(entries)) {
    const translated = translateKey(key, side)
    if (translated !== key && (forcePad || !Object.prototype.hasOwnProperty.call(entries, translated))) additions.push(`${translated} = ${value}`)
  }
  const layers = readLayers(text).map(layer => ({ ...layer, trigger: layer.trigger && translateKey(layer.trigger, side), applyTrigger: layer.applyTrigger && translateKey(layer.applyTrigger, side), removeTrigger: layer.removeTrigger && translateKey(layer.removeTrigger, side), overrides: Object.fromEntries(Object.entries(layer.overrides).map(([key, value]) => [translateKey(key, side), value])) }))
  const physicalView = text.split(/\r?\n/).map(line => line.replace(/^(\s*#\s*@(?:layer-action|label|icon)\s+)([^=]+)(=)/, (_, prefix: string, input: string, equal: string) => prefix + translateKey(input, side) + equal)).filter(line => !/^\s*(?:[!A-Z0-9_]+,)?(?:LEFT|RIGHT)_(?:TOUCH|GRID)/.test(line)).join('\n')
  let result = writeLayers([physicalView, ...additions].join('\n'), layers)
  const menus = readVirtualMenus(result)
  if (!menus.problem && menus.menus.length) {
    result = writeVirtualMenus(result, menus.menus.map(menu => ({ ...menu, attachments: menu.attachments
      .filter(attachment => !['LEFT', 'RIGHT'].includes(attachment.source) || attachment.source === side.toUpperCase())
      .map(attachment => ({ ...attachment, source: attachment.source === side.toUpperCase() ? 'RIGHT' as const : attachment.source,
        input: translateKey(attachment.input, side), confirm: translateKey(attachment.confirm, side), cancel: translateKey(attachment.cancel, side) })) })))
  }
  return result
}

export function projectController(text: string, model: string, effectiveBase = controllerBase(text)) {
  if (!model) return text
  const adapted = adaptControllerBase(controllerBase(effectiveBase), model, controllerPadSource(text, model), text.split(/\r?\n/).some(line => line.match(pad)?.[1] === model))
  const overrides = controllerOverrides(effectiveBase, model).concat(controllerOverrides(text, model))
  const baseLayers = readLayers(adapted), variantLayers = [...new Map(overrides.flatMap(line => readLayers(line)).map(layer => [layer.id, layer])).values()]
  const merged = baseLayers.filter(layer => !variantLayers.some(variant => variant.id === layer.id)).concat(variantLayers.filter(layer => !(layer as typeof layer & { deleted?: boolean }).deleted))
  return writeLayers([adapted, ...overrides.filter(line => !/^#\s*@layer\s/.test(line))].join('\n'), merged)
}

function identity(line: string): string | null {
  const layer = line.match(/^\s*#\s*@layer\s+(.+)$/)
  if (layer) { try { return `@layer:${JSON.parse(layer[1]).id}` } catch { return null } }
  const annotation = line.match(/^\s*#\s*@(label|icon|overlay|layer-action)\s+([^=]+)=/)
  if (annotation) return `@${annotation[1]}:${annotation[2].trim().toUpperCase()}`
  if (line.trim().startsWith('#') || !line.includes('=')) return null
  return commandKey(line)
}
const bindingInputs = new Set(inputDefinitions.map(input => input.command))
const bindingAssignment = (key: string) => bindingInputs.has(key) || key.split(/[,+*]/).filter(Boolean).every(token => bindingInputs.has(token.replace(/^!/, '')) || /^[LR]?[TM]\d+$/.test(token))
function editableLines(text: string) {
  const result = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) { const key = identity(line); if (key) result.set(key, line.trim()) }
  return result
}

// "# @overlay LEFT at 0.2 0.75 size 280 …" has no "=", so identity() cannot key
// it and a per-controller override never saw an on-screen menu's position,
// size or text size change: the edit was dropped. A menu's place on screen is
// the screen's, not the controller's, so these lines stay in the shared text.
const overlayKey = (line: string) => line.match(/^\s*#\s*@overlay\s+((?:LEFT|RIGHT|LSTICK|RSTICK)(?::[A-Z0-9_,+]+)?)\s+at\s/i)?.[1].toUpperCase() ?? null
const overlayLines = (text: string) => {
  const result = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) { const key = overlayKey(line); if (key) result.set(key, line.trim()) }
  return result
}
function foldSharedOverlays(lines: string[], before: string, after: string) {
  const old = overlayLines(before), next = overlayLines(after)
  for (const key of new Set([...old.keys(), ...next.keys()])) {
    if (old.get(key) === next.get(key)) continue
    const index = lines.findIndex(line => overlayKey(line) === key)
    const replacement = next.get(key)
    if (replacement === undefined) lines = lines.filter(line => overlayKey(line) !== key)
    else if (index < 0) lines = [...lines.filter((line, at) => at < lines.length - 1 || line.trim()), replacement]
    else lines = lines.flatMap((line, at) => at === index ? [replacement] : overlayKey(line) === key ? [] : [line])
  }
  return lines
}

/** What this controller would show with none of its own overrides: the shared
 *  layout (imports resolved) adapted for the model. foldController compares an
 *  edit with it, so a value set back to what everyone else gets stops being an
 *  override. */
export function sharedController(text: string, model: string, effectiveBase = controllerBase(text)) {
  if (!model) return text
  return projectController(text.split(/\r?\n/).filter(line => line.match(row)?.[1] !== model).join('\n'), model, effectiveBase)
}

// The same assignment to JoyShockMapper: spacing does not matter, numbers compare
// by value (75 = 75.0) and words ignore case, as for imports (inheritedOverrides).
// App notes riding on comment lines (a label, an icon) must match exactly.
function sameAssignment(a: string | undefined, b: string | undefined) {
  if (a === undefined || b === undefined) return false
  if (a === b) return true
  const at = a.indexOf('='), bt = b.indexOf('=')
  if (at < 0 || bt < 0 || a.startsWith('#') || b.startsWith('#')) return a.replace(/\s*=\s*/, ' = ').replace(/\s+/g, ' ') === b.replace(/\s*=\s*/, ' = ').replace(/\s+/g, ' ')
  return a.slice(0, at).replace(/\s+/g, '').toUpperCase() === b.slice(0, bt).replace(/\s+/g, '').toUpperCase() && sameValue(a.slice(at + 1), b.slice(bt + 1))
}

/** Fold only the changed assignments/metadata into the model's saved override.
 *  With `shared` (sharedController), an edit that lands on the shared layout's
 *  own value is dropped instead of saved as an override, and removing something
 *  the shared layout never had removes the override instead of writing NONE. */
export function foldController(text: string, model: string, before: string, after: string, shared?: string) {
  if (!model) return after
  const old = editableLines(before), next = editableLines(after)
  const overrides = editableLines(controllerOverrides(text, model).join('\n'))
  const base = shared === undefined ? null : editableLines(shared)
  for (const key of new Set([...old.keys(), ...next.keys()])) {
    if (old.get(key) === next.get(key)) continue
    // A mode (a layer) is merged by id, not line by line: it keeps the old path.
    const lineKey = base !== null && !key.startsWith('@layer:')
    if (next.has(key)) {
      if (lineKey && sameAssignment(base.get(key), next.get(key))) overrides.delete(key)
      else overrides.set(key, next.get(key)!)
    } else if (lineKey && !base.has(key)) overrides.delete(key)
    else if (key.startsWith('@layer:')) {
      const previous = JSON.parse(old.get(key)!.replace(/^#\s*@layer\s+/, ''))
      overrides.set(key, `# @layer ${JSON.stringify({ ...previous, overrides: {}, deleted: true })}`)
    } else if (!key.startsWith('@')) { if (bindingAssignment(key)) overrides.set(key, `${key} = NONE`); else overrides.delete(key) }
    else if (/^@(label|icon):/.test(key)) overrides.set(key, old.get(key)!.split('=')[0].trimEnd() + ' =')
    else overrides.delete(key)
  }
  const kept = foldSharedOverlays(text.split(/\r?\n/).filter(line => line.match(row)?.[1] !== model), before, after)
  return [...kept.filter((line, index, all) => index < all.length - 1 || line.trim()), ...[...overrides.values()].map(line => `# @controller ${model} ${line}`)].join('\n') + '\n'
}
export function setControllerPadSource(text: string, model: string, source: 'left' | 'right') {
  return text.split(/\r?\n/).filter(line => line.match(pad)?.[1] !== model).join('\n').trimEnd() + `\n# @controller-pad ${model} ${source}\n`
}
export function resetControllerVariant(text: string, model: string) {
  return text.split(/\r?\n/).filter(line => line.match(row)?.[1] !== model && line.match(pad)?.[1] !== model).join('\n')
}
/** An assignment the shared layout keeps that this controller has no input for
 *  (ControllerVariant.dc.html "DualSense doesn't have · 5"). `kind` says what
 *  it is: a binding or setting line, a mode's activation (`# @layer-action`),
 *  or a virtual menu's opener or pad; `layerId` / `menuId` name its owner. */
export type UnavailableInput = { input: string; assignment: string; value: string; kind?: 'binding' | 'setting' | 'mode' | 'menu'; layerId?: string; menuId?: string; attachment?: number; field?: 'source' | 'input' | 'confirm' | 'cancel' }
export function unavailableControllerInputs(text: string, device?: TelemetryDevice): UnavailableInput[] {
  if (!device?.type) return []
  const model = controllerModelKey(device), side = controllerPadSource(text, model)
  const single = singlePadModel(model)
  const missing = (input: string) => {
    if (/^(LEFT|RIGHT)_(TOUCH|GRID)/.test(input)) return device.type !== 24 && !(single && input.startsWith(side.toUpperCase()))
    if (single && translateControllerToken(input, side) !== input) return false
    if (/^(TOUCH|T\d|TUP|TDOWN|TLEFT|TRIGHT|TRING)/.test(input)) return ![4, 5, 24].includes(device.type)
    if (/^(LT|RT)\d+|^MISC[1-6]$|^[LR]MINI$|^[LR]S[LR]$|^[LR]TOUCH$/.test(input)) return !controllerSupportsInput(device, input)
    return false
  }
  const base = controllerBase(text)
  const layers = readLayers(base)
  const owned: [string, string, string | undefined][] = [
    ...Object.entries(layerEntries(base)).map(([key, value]) => [key, value, undefined] as [string, string, undefined]),
    ...layers.flatMap(layer => Object.entries(layer.overrides).map(([key, value]) => [key, value, layer.id] as [string, string, string])),
  ]
  const result: UnavailableInput[] = owned.flatMap(([assignment, raw, layerId]) => {
    if (assignment.startsWith('#')) return []
    const value = stripComment(raw).trim()
    if (!value || value === 'NONE') return []
    const tokens = assignment.split(/[,+*]/).map(token => token.replace(/^!/, ''))
    const setting = /^(GYRO|TILT)_(ON|OFF)$/.test(tokens[tokens.length - 1])
    if (setting) tokens.push(...value.split(/\s+/))
    return tokens.filter(missing).map(input => ({ input, assignment, value, kind: setting ? 'setting' as const : 'binding' as const, ...(layerId ? { layerId } : {}) }))
  })
  // What turns a mode on: "# @layer-action L4 = hold veh" is an annotation the
  // entries above skip, and the mode it holds is lost with it.
  for (const action of readLayerActions(base, layers)) {
    const input = action.input.replace(/^!/, '')
    if (missing(input)) result.push({ input, assignment: `# @layer-action ${action.input}`, value: `${action.verb} ${action.layerId}`, kind: 'mode', layerId: action.layerId })
  }
  // A virtual menu's pad, and the buttons that open, confirm or cancel it.
  const menus = readVirtualMenus(base)
  if (!menus.problem) for (const menu of menus.menus) menu.attachments.forEach((attachment, index) => {
    if (attachment.source === 'LEFT' && (device.type !== 24 && !(single && side === 'left'))) result.push({ input: 'LEFT_PAD', assignment: `VIRTUAL_MENUS ${menu.id}`, value: menu.name, kind: 'menu', menuId: menu.id, attachment: index, field: 'source' })
    for (const field of ['input', 'confirm', 'cancel'] as const) {
      const input = attachment[field].replace(/^!/, '')
      if (input && input !== 'NONE' && missing(input)) result.push({ input, assignment: `VIRTUAL_MENUS ${menu.id}`, value: menu.name, kind: 'menu', menuId: menu.id, attachment: index, field })
    }
  })
  return result
}

/** "Pick a button" (ControllerVariant): moves one unavailable assignment to an
 *  input this controller has, written into this controller's own layout only. */
export function rebindForController(text: string, effectiveText: string, model: string, entry: UnavailableInput, to: string) {
  const before = projectController(text, model, effectiveText)
  const swap = (token: string) => token.replace(/^!/, '') === entry.input ? token.replace(entry.input, to) : token
  const rename = (key: string) => key.replace(/[^,+*]+/g, swap)
  let after = before
  if (entry.kind === 'mode') {
    const actions = readLayerActions(before).map(action => action.input.replace(/^!/, '') === entry.input && action.layerId === entry.layerId ? { ...action, input: swap(action.input) } : action)
    after = writeLayers(before, readLayers(before), actions)
  } else if (entry.kind === 'menu' && entry.menuId !== undefined) {
    const catalog = readVirtualMenus(before)
    if (catalog.problem) return text
    after = writeVirtualMenus(before, catalog.menus.map(menu => menu.id !== entry.menuId ? menu : { ...menu, attachments: menu.attachments.map((attachment, index) => {
      if (index !== entry.attachment) return attachment
      if (entry.field === 'source') return { ...attachment, source: to as typeof attachment.source }
      const field = entry.field ?? 'input'
      return { ...attachment, [field]: swap(attachment[field]) }
    }) }))
  } else if (entry.layerId) {
    const layers = readLayers(before).map(layer => {
      if (layer.id !== entry.layerId) return layer
      const overrides: Record<string, string> = {}
      for (const [key, value] of Object.entries(layer.overrides)) {
        if (key !== entry.assignment) { overrides[key] = value; continue }
        overrides[entry.kind === 'setting' ? key : rename(key)] = entry.kind === 'setting' ? value.split(/\s+/).map(swap).join(' ') : value
      }
      return { ...layer, overrides }
    })
    after = writeLayers(before, layers)
  } else if (entry.kind === 'setting') {
    after = updateKeymapEntry(before, entry.assignment, entry.value.split(/\s+/).map(swap))
  } else {
    after = updateKeymapEntry(before, rename(entry.assignment), entry.value.split(/\s+/))
  }
  return foldController(text, model, before, after)
}
export const controllerVariantLabel = (device?: TelemetryDevice) => device ? controllerDisplayName(device.type) + (controllerModelKey(device).endsWith('-edge') ? ' Edge' : '') : 'Shared base'

export function resetControllerAssignment(text: string, model: string, assignment: string) {
  const key = assignment.replace(/\s/g, '').toUpperCase()
  return text.split(/\r?\n/).filter(line => { const match = line.match(row); return match?.[1] !== model || identity(match[2]) !== key }).join('\n')
}

/** A reversible model-only regular gamepad layout for local multiplayer. */
export function regularControllerGamepad(text: string, effectiveText: string, model: string) {
  const before = projectController(text, model, effectiveText)
  let next = before
  for (const key of new Set([...inputDefinitions.map(input => input.command), ...Object.keys(layerEntries(before)).filter(bindingAssignment)])) next = updateKeymapEntry(next, key, ['NONE'])
  for (const [key, value] of Object.entries({ GYRO_OUTPUT: 'MOUSE', GYRO_SENS: '0', MOTION_STICK_MODE: 'NO_MOUSE', TOUCHPAD_MODE: 'GRID_AND_STICK', LEFT_TOUCHPAD_MODE: 'GRID_AND_STICK', RIGHT_TOUCHPAD_MODE: 'GRID_AND_STICK', TOUCH_STICK_MODE: 'NO_MOUSE', LEFT_TOUCH_STICK_MODE: 'NO_MOUSE', RIGHT_TOUCH_STICK_MODE: 'NO_MOUSE' })) { if (singlePadModel(model) && /^(LEFT|RIGHT)_TOUCH/.test(key)) continue; next = updateKeymapEntry(next, key, [value]) }
  next = applyGamepadPassthrough(next, 'XBOX')
  const plain = layerEntries(next)
  // A held input must not bring an old keyboard/flick mapping back.
  for (const key of Object.keys(layerEntries(before))) {
    if (!key.includes(',')) continue
    const target = key.slice(key.lastIndexOf(',') + 1)
    if (plain[target]) next = updateKeymapEntry(next, key, [plain[target]])
  }
  next = writeVirtualMenus(writeLayers(next, []), [])
  return foldController(text, model, before, next)
}
