import { readLayers, readableSetting, writeLayers, readLayerActions, type ConfigLayer } from './layers'

export type ConfigChange = { id: string; key: string; before?: string; after?: string; layerId?: string; layerName?: string; kind: 'entry' | 'layer' | 'property'; property?: 'name' | 'suppressHolds' }

// Stable identities turn renamed metadata and individual overrides into one change.
function records(text: string) {
  const result = new Map<string, { value: string; lines: string[] }>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^#\s*@layer\s/i.test(line)) continue
    const annotation = line.match(/^#\s*@(label|icon|overlay|layer-action)\s+(\S+)\s*(?:=\s*)?(.*)$/i)
    const assignment = !line.startsWith('#') && line.match(/^([^=]+?)\s*=\s*(.*)$/)
    const key = annotation ? `# @${annotation[1].toLowerCase()} ${annotation[2].toUpperCase()}` : assignment ? assignment[1].trim().toUpperCase().replace(/\s*([,+])\s*/g, '$1') : line
    const value = annotation ? annotation[3] : assignment ? assignment[2] : line
    const previous = result.get(key)
    result.set(key, { value: annotation?.[1] === 'layer-action' && previous ? `${previous.value}\n${value}` : value, lines: [...(previous?.lines ?? []), raw] })
  }
  return result
}

export function configChanges(from: string, to: string): ConfigChange[] {
  const changes: ConfigChange[] = []
  const diff = (a: Map<string, string>, b: Map<string, string>, layer?: ConfigLayer) => {
    for (const key of new Set([...b.keys(), ...a.keys()])) if (a.get(key) !== b.get(key)) changes.push({ id: JSON.stringify([layer?.id ?? '', key]), key, before: a.get(key), after: b.get(key), layerId: layer?.id, layerName: layer?.name, kind: 'entry' })
  }
  diff(new Map([...records(from)].map(([key, record]) => [key, record.value])), new Map([...records(to)].map(([key, record]) => [key, record.value])))
  const a = readLayers(from), b = readLayers(to)
  for (const id of new Set([...b.map(l => l.id), ...a.map(l => l.id)])) {
    const before = a.find(l => l.id === id), after = b.find(l => l.id === id), layer = after ?? before!
    if (!before || !after) changes.push({ id: JSON.stringify([id, 'layer']), key: 'Layer', kind: 'layer', layerId: id, layerName: layer.name, before: before?.name, after: after?.name })
    else {
      diff(new Map(Object.entries(before.overrides)), new Map(Object.entries(after.overrides)), after)
      for (const property of ['name', 'suppressHolds'] as const) if (before[property] !== after[property]) changes.push({ id: JSON.stringify([id, property]), key: property === 'name' ? 'Layer name' : 'Ignore other held layers', before: String(before[property] ?? false), after: String(after[property] ?? false), layerId: id, layerName: after.name, kind: 'property', property })
    }
  }
  return changes
}

/** Restore this setting from the saved baseline while keeping unrelated edits. */
export function revertConfigChange(current: string, baseline: string, change: ConfigChange): string {
  if (change.layerId) {
    const layers = readLayers(current), saved = readLayers(baseline).find(l => l.id === change.layerId)
    const index = layers.findIndex(l => l.id === change.layerId)
    if (change.kind === 'layer') {
      if (index >= 0) layers.splice(index, 1)
      if (saved) layers.splice(Math.min(index < 0 ? layers.length : index, layers.length), 0, saved)
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
  const existing = records(current).get(change.key)?.lines ?? [], replacement = records(baseline).get(change.key)?.lines ?? []
  const lines = current.split(/\r?\n/), index = lines.findIndex(line => existing.includes(line))
  const kept = lines.filter(line => !existing.includes(line))
  kept.splice(index < 0 ? kept.length : Math.min(index, kept.length), 0, ...replacement)
  return kept.join('\n')
}

export const countChanges = (from: string, to: string) => configChanges(from, to).length
export const describeChange = (from: string | undefined, to: string): string | null => {
  if (from === undefined) return null
  const changes = configChanges(from, to)
  if (!changes.length) return null
  const label = changes[0].layerName ? `${changes[0].layerName} layer` : changes[0].key.startsWith('#') ? 'A label or layout' : readableSetting(changes[0].key)
  return changes.length > 1 ? `${label} and ${changes.length - 1} more` : label
}
