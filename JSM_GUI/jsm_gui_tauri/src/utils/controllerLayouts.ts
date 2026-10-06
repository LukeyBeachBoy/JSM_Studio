import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerDisplayName, controllerSupportsInput } from './controllerStatus'
import { commandKey, stripComment } from './configIncludes'
import { layerEntries, readLayers, writeLayers, inputDefinitions } from './layers'
import { applyGamepadPassthrough } from './quickBind'
import { updateKeymapEntry } from './keymap'
import { readVirtualMenus, writeVirtualMenus } from './virtualMenus'

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

/** Fold only the changed assignments/metadata into the model's saved override. */
export function foldController(text: string, model: string, before: string, after: string) {
  if (!model) return after
  const old = editableLines(before), next = editableLines(after)
  const overrides = editableLines(controllerOverrides(text, model).join('\n'))
  for (const key of new Set([...old.keys(), ...next.keys()])) {
    if (old.get(key) === next.get(key)) continue
    if (next.has(key)) overrides.set(key, next.get(key)!)
    else if (key.startsWith('@layer:')) {
      const previous = JSON.parse(old.get(key)!.replace(/^#\s*@layer\s+/, ''))
      overrides.set(key, `# @layer ${JSON.stringify({ ...previous, overrides: {}, deleted: true })}`)
    } else if (!key.startsWith('@')) { if (bindingAssignment(key)) overrides.set(key, `${key} = NONE`); else overrides.delete(key) }
    else if (/^@(label|icon):/.test(key)) overrides.set(key, old.get(key)!.split('=')[0].trimEnd() + ' =')
    else overrides.delete(key)
  }
  const kept = text.split(/\r?\n/).filter(line => line.match(row)?.[1] !== model)
  return [...kept.filter((line, index, all) => index < all.length - 1 || line.trim()), ...[...overrides.values()].map(line => `# @controller ${model} ${line}`)].join('\n') + '\n'
}
export function setControllerPadSource(text: string, model: string, source: 'left' | 'right') {
  return text.split(/\r?\n/).filter(line => line.match(pad)?.[1] !== model).join('\n').trimEnd() + `\n# @controller-pad ${model} ${source}\n`
}
export function resetControllerVariant(text: string, model: string) {
  return text.split(/\r?\n/).filter(line => line.match(row)?.[1] !== model && line.match(pad)?.[1] !== model).join('\n')
}
export type UnavailableInput = { input: string; assignment: string; value: string }
export function unavailableControllerInputs(text: string, device?: TelemetryDevice): UnavailableInput[] {
  if (!device?.type) return []
  const model = controllerModelKey(device), side = controllerPadSource(text, model)
  const single = singlePadModel(model)
  const entries: Record<string, string> = Object.assign({}, layerEntries(controllerBase(text)), ...readLayers(controllerBase(text)).map(layer => layer.overrides))
  return Object.entries(entries).flatMap(([assignment, raw]) => {
    const value = stripComment(raw).trim()
    if (!value || value === 'NONE') return []
    const tokens = assignment.split(/[,+*]/).map(token => token.replace(/^!/, ''))
    if (/^(GYRO|TILT)_(ON|OFF)$/.test(tokens[tokens.length - 1])) tokens.push(...value.split(/\s+/))
    return tokens.filter(input => {
      if (/^(LEFT|RIGHT)_(TOUCH|GRID)/.test(input)) return device.type !== 24 && !(single && input.startsWith(side.toUpperCase()))
      if (single && translateControllerToken(input, side) !== input) return false
      if (/^(TOUCH|T\d|TUP|TDOWN|TLEFT|TRIGHT|TRING)/.test(input)) return ![4, 5, 24].includes(device.type)
      if (/^(LT|RT)\d+|^MISC[1-6]$|^[LR]MINI$|^[LR]S[LR]$|^[LR]TOUCH$/.test(input)) return !controllerSupportsInput(device, input)
      return false
    }).map(input => ({ input, assignment, value }))
  })
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
