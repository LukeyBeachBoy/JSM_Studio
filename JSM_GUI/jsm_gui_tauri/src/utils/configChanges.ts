import { readLayers, readableSetting, writeLayers, readLayerActions, type ConfigLayer } from './layers'
import { readVirtualMenus, writeVirtualMenus, type VirtualMenu } from './virtualMenus'
import { controllerDisplayName } from './controllerStatus'

export type ConfigChangeKind = 'entry' | 'layer' | 'property' | 'order' | 'menu' | 'controller'
export type ConfigChange = {
  id: string; key: string; before?: string; after?: string; layerId?: string; layerName?: string; kind: ConfigChangeKind; property?: 'name' | 'suppressHolds'
  /** A virtual menu change: which menu, and which part of it ("name", "slot:2", "opened"…). */
  menuId?: string; menuName?: string; menuField?: string
  /** A menu slot's binding, before and after, for the reader to describe. */
  binding?: { before?: string; after?: string }
  /** A "# @controller" variant line: which controller model it is only for. */
  model?: string
}

const controllerRow = /^\s*#\s*@controller\s+(type-\d+(?:-edge)?)\s+(.+)$/
const controllerPad = /^\s*#\s*@controller-pad\s+(type-\d+(?:-edge)?)\s+(left|right)\s*$/
const menusLine = /^\s*VIRTUAL_MENUS\s*=/i

/** "DualSense", "DualSense Edge": what a "# @controller type-5" line is for. */
export const controllerModelLabel = (model: string) => {
  const type = Number(model.match(/type-(\d+)/)?.[1])
  return controllerDisplayName(Number.isFinite(type) ? type : undefined) + (model.endsWith('-edge') ? ' Edge' : '')
}

/** A line's identity inside a variant: the key it assigns, or the mode it defines. */
function lineIdentity(line: string): string {
  const layer = line.match(/^\s*#\s*@layer\s+(.+)$/)
  if (layer) { try { return `@layer:${JSON.parse(layer[1]).id}` } catch { return line.trim() } }
  const annotation = line.match(/^\s*#\s*@(label|icon|overlay|layer-action)\s+([^=]+?)\s*(?:=|\s|$)/i)
  if (annotation) return `# @${annotation[1].toLowerCase()} ${annotation[2].trim().toUpperCase()}`
  const assignment = !line.trim().startsWith('#') && line.match(/^([^=]+?)\s*=/)
  return assignment ? assignment[1].trim().toUpperCase().replace(/\s*([,+])\s*/g, '$1') : line.trim()
}

// Stable identities turn renamed metadata and individual overrides into one change.
function records(text: string, menusDecoded: boolean) {
  const result = new Map<string, { value: string; lines: string[] }>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^#\s*@layer\s/i.test(line) || controllerRow.test(line) || controllerPad.test(line)) continue
    if (menusDecoded && menusLine.test(line)) continue
    const annotation = line.match(/^#\s*@(label|icon|overlay|layer-action)\s+(\S+)\s*(?:=\s*)?(.*)$/i)
    const assignment = !line.startsWith('#') && line.match(/^([^=]+?)\s*=\s*(.*)$/)
    const key = annotation ? `# @${annotation[1].toLowerCase()} ${annotation[2].toUpperCase()}` : assignment ? assignment[1].trim().toUpperCase().replace(/\s*([,+])\s*/g, '$1') : line
    const value = annotation ? annotation[3] : assignment ? assignment[2] : line
    const previous = result.get(key)
    result.set(key, { value: annotation?.[1] === 'layer-action' && previous ? `${previous.value}\n${value}` : value, lines: [...(previous?.lines ?? []), raw] })
  }
  return result
}

/** The variant lines of a configuration, by "model|identity". */
function controllerRecords(text: string) {
  const result = new Map<string, { model: string; key: string; value: string; lines: string[] }>()
  for (const raw of text.split(/\r?\n/)) {
    const pad = raw.match(controllerPad)
    if (pad) { result.set(`${pad[1]}|pad`, { model: pad[1], key: 'pad', value: pad[2], lines: [raw] }); continue }
    const row = raw.match(controllerRow)
    if (!row) continue
    const key = lineIdentity(row[2])
    const id = `${row[1]}|${key}`
    const previous = result.get(id)
    result.set(id, { model: row[1], key, value: row[2].trim(), lines: [...(previous?.lines ?? []), raw] })
  }
  return result
}

/** The menu catalogue, when both sides decode; null sends it through the plain diff. */
function menuCatalog(text: string): VirtualMenu[] | null {
  const plain = text.split(/\r?\n/).filter(line => !/^\s*#\s*@(layer|controller)/.test(line)).join('\n')
  const { menus, problem } = readVirtualMenus(plain)
  return problem ? null : menus
}

const TYPE_WORD: Record<string, string> = { RADIAL: 'Wheel', TOUCH: 'Grid', HOTBAR: 'Hotbar' }
const SOURCE_WORD: Record<string, string> = { RIGHT: 'Right pad', LEFT: 'Left pad', RSTICK: 'Right stick', LSTICK: 'Left stick', DPAD: 'D-pad', ABXY: 'Face buttons' }
const describeLook = (menu: VirtualMenu) => `${menu.placement.size} px · names ${menu.placement.labelFontSize ?? 18} px · keys ${menu.placement.outputFontSize ?? menu.placement.fontSize} px${[menu.placement.showLabels ? '' : 'no names', menu.placement.showKeys ? '' : 'no keys', menu.placement.showIcons ? '' : 'no icons'].filter(Boolean).map(part => ` · ${part}`).join('')}`
const describePosition = (menu: VirtualMenu) => `${Math.round(menu.placement.x * 100)}% across, ${Math.round(menu.placement.y * 100)}% down · ${({ touch: 'shows when opened', navigate: 'shows while moving', ring: 'shows on a slice', never: 'hidden' } as Record<string, string>)[menu.placement.reveal] ?? menu.placement.reveal}`
const describeOpeners = (menu: VirtualMenu) => menu.attachments.length ? menu.attachments.map(attachment => `${SOURCE_WORD[attachment.source] ?? attachment.source}${attachment.activation === 'ALWAYS' ? ' · always ready' : attachment.activation === 'COMMAND' ? '' : ` · ${attachment.activation === 'HOLD' ? 'hold' : 'toggle'} ${attachment.input.replace(/^!/, '')}${attachment.input.startsWith('!') ? ' (let go)' : ''}`}`).join('; ') : 'Nothing opens it'
const slotLabel = (menu: VirtualMenu, index: number) => menu.actions[index]?.label || `Slice ${index + 1}`

function menuChanges(from: VirtualMenu[], to: VirtualMenu[]): ConfigChange[] {
  const changes: ConfigChange[] = []
  const push = (menu: VirtualMenu, field: string, key: string, before: string | undefined, after: string | undefined, binding?: ConfigChange['binding']) => {
    if (before === after && !binding) return
    changes.push({ id: JSON.stringify(['menu', menu.id, field]), key, kind: 'menu', menuId: menu.id, menuName: menu.name, menuField: field, before, after, ...(binding ? { binding } : {}) })
  }
  for (const id of new Set([...to.map(menu => menu.id), ...from.map(menu => menu.id)])) {
    const a = from.find(menu => menu.id === id), b = to.find(menu => menu.id === id)
    if (!a || !b) { push((b ?? a)!, 'menu', 'Menu', a?.name, b?.name); continue }
    push(b, 'name', 'Menu name', a.name, b.name)
    push(b, 'type', 'Shape', TYPE_WORD[a.type] ?? a.type, TYPE_WORD[b.type] ?? b.type)
    push(b, 'count', 'Slices', String(a.actions.length), String(b.actions.length))
    if (b.type === 'TOUCH' || a.type === 'TOUCH') push(b, 'columns', 'Grid columns', String(a.columns), String(b.columns))
    push(b, 'deadzone', 'Centre dead zone', `${Math.round(a.deadzone * 100)}%`, `${Math.round(b.deadzone * 100)}%`)
    for (let index = 0; index < Math.min(a.actions.length, b.actions.length); index++) {
      const x = a.actions[index], y = b.actions[index]
      if (x.binding === y.binding && x.label === y.label && x.icon === y.icon) continue
      const field = `slot:${index}`
      changes.push({ id: JSON.stringify(['menu', id, field]), key: `Slice ${index + 1}`, kind: 'menu', menuId: id, menuName: b.name, menuField: field,
        before: slotLabel(a, index), after: slotLabel(b, index), binding: { before: x.binding, after: y.binding } })
    }
    const ca = a.centerAction, cb = b.centerAction
    if (ca?.binding !== cb?.binding || ca?.label !== cb?.label) changes.push({ id: JSON.stringify(['menu', id, 'center']), key: 'Centre action', kind: 'menu', menuId: id, menuName: b.name, menuField: 'center',
      before: ca ? ca.label || 'Centre' : undefined, after: cb ? cb.label || 'Centre' : undefined, binding: { before: ca?.binding, after: cb?.binding } })
    push(b, 'look', 'Look', describeLook(a), describeLook(b))
    push(b, 'position', 'Position on screen', describePosition(a), describePosition(b))
    push(b, 'opened', 'Opened by', describeOpeners(a), describeOpeners(b))
  }
  return changes
}

export function configChanges(from: string, to: string): ConfigChange[] {
  const changes: ConfigChange[] = []
  const menusFrom = menuCatalog(from), menusTo = menuCatalog(to)
  const decoded = menusFrom !== null && menusTo !== null
  const diff = (a: Map<string, string>, b: Map<string, string>, layer?: ConfigLayer) => {
    for (const key of new Set([...b.keys(), ...a.keys()])) if (a.get(key) !== b.get(key)) changes.push({ id: JSON.stringify([layer?.id ?? '', key]), key, before: a.get(key), after: b.get(key), layerId: layer?.id, layerName: layer?.name, kind: 'entry' })
  }
  diff(new Map([...records(from, decoded)].map(([key, record]) => [key, record.value])), new Map([...records(to, decoded)].map(([key, record]) => [key, record.value])))
  if (decoded) changes.push(...menuChanges(menusFrom, menusTo))
  const a = readLayers(from), b = readLayers(to)
  for (const id of new Set([...b.map(l => l.id), ...a.map(l => l.id)])) {
    const before = a.find(l => l.id === id), after = b.find(l => l.id === id), layer = after ?? before!
    if (!before || !after) changes.push({ id: JSON.stringify([id, 'layer']), key: 'Layer', kind: 'layer', layerId: id, layerName: layer.name, before: before?.name, after: after?.name })
    else {
      diff(new Map(Object.entries(before.overrides)), new Map(Object.entries(after.overrides)), after)
      for (const property of ['name', 'suppressHolds'] as const) if (before[property] !== after[property]) changes.push({ id: JSON.stringify([id, property]), key: property === 'name' ? 'Mode name' : 'Pause holds while it’s on', before: String(before[property] ?? false), after: String(after[property] ?? false), layerId: id, layerName: after.name, kind: 'property', property })
    }
  }
  // The order modes are listed in is their colour and their place on the
  // strip; moving one is a change of its own.
  const common = (list: ConfigLayer[], other: ConfigLayer[]) => list.filter(layer => other.some(o => o.id === layer.id)).map(layer => layer.id)
  if (common(a, b).join('\n') !== common(b, a).join('\n')) changes.push({ id: JSON.stringify(['', 'order']), key: 'Layer order', kind: 'order', before: a.map(l => l.name).join(' · '), after: b.map(l => l.name).join(' · ') })
  const ca = controllerRecords(from), cb = controllerRecords(to)
  for (const id of new Set([...cb.keys(), ...ca.keys()])) {
    const x = ca.get(id), y = cb.get(id)
    if (x?.value === y?.value) continue
    const record = (y ?? x)!
    changes.push({ id: JSON.stringify(['controller', id]), key: record.key, kind: 'controller', model: record.model, before: x?.value, after: y?.value })
  }
  return changes
}

/** Restore this setting from the saved baseline while keeping unrelated edits. */
export function revertConfigChange(current: string, baseline: string, change: ConfigChange): string {
  if (change.kind === 'order') {
    const layers = readLayers(current), saved = readLayers(baseline)
    const ordered = [...saved.flatMap(layer => layers.filter(l => l.id === layer.id)), ...layers.filter(layer => !saved.some(s => s.id === layer.id))]
    return writeLayers(current, ordered, readLayerActions(current, layers))
  }
  if (change.kind === 'menu' && change.menuId) {
    const now = menuCatalog(current), saved = menuCatalog(baseline)
    if (!now || !saved) return current
    const old = saved.find(menu => menu.id === change.menuId), index = now.findIndex(menu => menu.id === change.menuId)
    const menus = [...now]
    if (change.menuField === 'menu') {
      if (index >= 0) menus.splice(index, 1)
      if (old) menus.splice(Math.min(saved.indexOf(old), menus.length), 0, old)
    } else if (old && index >= 0) {
      const menu = { ...menus[index], actions: [...menus[index].actions], placement: { ...menus[index].placement } }
      const field = change.menuField ?? ''
      if (field === 'name') menu.name = old.name
      else if (field === 'type') menu.type = old.type
      else if (field === 'columns') menu.columns = old.columns
      else if (field === 'deadzone') menu.deadzone = old.deadzone
      else if (field === 'center') menu.centerAction = old.centerAction
      else if (field === 'look') menu.placement = { ...old.placement, x: menu.placement.x, y: menu.placement.y, reveal: menu.placement.reveal }
      else if (field === 'position') menu.placement = { ...menu.placement, x: old.placement.x, y: old.placement.y, reveal: old.placement.reveal }
      else if (field === 'opened') menu.attachments = old.attachments
      else if (field === 'count') { menu.actions = old.actions.map((action, i) => menu.actions[i] ?? action); menu.columns = Math.min(menu.columns, menu.actions.length) }
      else if (field.startsWith('slot:')) { const slot = Number(field.slice(5)); if (old.actions[slot] && menu.actions[slot]) menu.actions[slot] = old.actions[slot] }
      menus[index] = menu
    }
    return writeVirtualMenus(current, menus)
  }
  if (change.kind === 'controller' && change.model) {
    const identity = (raw: string) => {
      const pad = raw.match(controllerPad)
      if (pad) return pad[1] === change.model && change.key === 'pad'
      const row = raw.match(controllerRow)
      return !!row && row[1] === change.model && lineIdentity(row[2]) === change.key
    }
    const lines = current.split(/\r?\n/)
    const index = lines.findIndex(identity)
    const kept = lines.filter(line => !identity(line))
    const replacement = baseline.split(/\r?\n/).filter(identity)
    kept.splice(index < 0 ? kept.length : Math.min(index, kept.length), 0, ...replacement)
    return kept.join('\n')
  }
  if (change.layerId) {
    const layers = readLayers(current), saved = readLayers(baseline).find(l => l.id === change.layerId)
    const index = layers.findIndex(l => l.id === change.layerId)
    if (change.kind === 'layer') {
      if (index >= 0) layers.splice(index, 1)
      // A mode put back goes back to its saved place, so its colour and the order return too.
      if (saved) layers.splice(Math.min(index < 0 ? readLayers(baseline).findIndex(l => l.id === change.layerId) : index, layers.length), 0, saved)
      const actions = [...readLayerActions(current).filter(a => a.layerId !== change.layerId), ...readLayerActions(baseline).filter(a => a.layerId === change.layerId)]
      return writeLayers(current, layers, actions)
    }
    if (index < 0) return current
    const layer = { ...layers[index], overrides: { ...layers[index].overrides } }
    if (change.kind === 'property') {
      if (change.property === 'name') layer.name = saved?.name ?? layer.name
      else layer.suppressHolds = saved?.suppressHolds
    } else if (saved?.overrides[change.key] === undefined) delete layer.overrides[change.key]
    else layer.overrides[change.key] = saved.overrides[change.key]
    layers[index] = layer
    return writeLayers(current, layers)
  }
  const decoded = menuCatalog(current) !== null && menuCatalog(baseline) !== null
  const existing = records(current, decoded).get(change.key)?.lines ?? [], replacement = records(baseline, decoded).get(change.key)?.lines ?? []
  const lines = current.split(/\r?\n/), index = lines.findIndex(line => existing.includes(line))
  const kept = lines.filter(line => !existing.includes(line))
  kept.splice(index < 0 ? kept.length : Math.min(index, kept.length), 0, ...replacement)
  return kept.join('\n')
}

export const countChanges = (from: string, to: string) => configChanges(from, to).length

/** A short name for what a change touched ("Vehicles mode", "Weapon wheel menu"),
 *  for the Configuration menu's Undo and Redo. */
export const changeSubject = (change: ConfigChange) =>
  change.kind === 'menu' ? `${change.menuName ?? 'A'} menu`
  : change.kind === 'controller' && change.model ? `Only for ${controllerModelLabel(change.model)}`
  : change.kind === 'order' ? 'Layer order'
  : change.layerName ? `${change.layerName} layer`
  : change.key.startsWith('#') ? 'A label or layout' : readableSetting(change.key)

export const describeChange = (from: string | undefined, to: string): string | null => {
  if (from === undefined) return null
  const changes = configChanges(from, to)
  if (!changes.length) return null
  const label = changeSubject(changes[0])
  return changes.length > 1 ? `${label} and ${changes.length - 1} more` : label
}
