import { physicalBindingTargets } from './bindingAliases'
import { defaultLayer, layerEntries, layerHue, layerSlot, overrideInput, type ConfigLayer } from './layers'

export type BindingSourceKind = 'base' | 'game' | 'layer' | 'mixed' | 'unset'
export type BindingSource = { kind: BindingSourceKind; label: string; color: string; sources?: BindingSource[] }
export const BASE_BINDING_COLOR = 'var(--binding-base)'
export const GAME_BINDING_COLOR = 'var(--binding-game)'
const UNSET: BindingSource = { kind: 'unset', label: 'Not set', color: 'var(--text-3)' }
const nameOf = (path: string) => path.split(/[\\/]/).pop()?.replace(/\.txt$/i, '') || 'Base config'

/** Preserve file order for shared aliases such as SL and its physical targets. */
function assignments(text: string) {
  const values = new Map<string, string>()
  for (const line of defaultLayer(text).split(/\r?\n/)) {
    const action = line.match(/^\s*#\s*@layer-action\s+(\S+)\s*=\s*(.+)$/i)
    if (action) { values.set(`@action:${action[1]}:${action[2]}`, action[2]); continue }
    for (const [key, value] of Object.entries(layerEntries(line))) {
      if (key.startsWith('#')) continue // A custom name/icon does not change the output's source.
      for (const target of physicalBindingTargets(key)) values.set(target, value)
    }
  }
  return values
}

const physicalInput = (key: string) => key.startsWith('@action:') ? key.split(':')[1].replace(/^!/, '') : overrideInput(key)
const groupInput = (input: string) => /^L(UP|DOWN|LEFT|RIGHT|RING|TOUCH)$/.test(input) ? 'L3'
  : /^R(UP|DOWN|LEFT|RIGHT|RING|TOUCH)$/.test(input) ? 'R3'
  : input === 'ZLF' ? 'ZL' : input === 'ZRF' ? 'ZR' : input === 'MISC3' ? 'LEFT_PAD' : input === 'MISC2' ? 'RIGHT_PAD' : input

/** A visual read model only. Never writes or flattens the saved configuration. */
export function createBindingProvenance({ ownText, baseText, baseOrigins = {}, gameName = 'Game config', selected, layers = [] }: {
  ownText: string; baseText: string; baseOrigins?: Record<string, string>; gameName?: string; selected?: ConfigLayer; layers?: ConfigLayer[]
}) {
  const base = assignments(baseText), own = assignments(ownText)
  const exact = new Map<string, BindingSource>()
  const baseNames = [...new Set(Object.values(baseOrigins).filter(path => path !== '<editor>').map(nameOf))]
  const meaningful = (value?: string) => Boolean(value?.trim() && value.trim().toUpperCase() !== 'NONE')
  for (const [key, value] of base) exact.set(key, meaningful(value) ? { kind: 'base', label: `Base · ${baseOrigins[key] ? nameOf(baseOrigins[key]) : baseNames.join(', ') || 'Base config'}`, color: BASE_BINDING_COLOR } : UNSET)
  for (const [key, value] of own) exact.set(key, meaningful(value) || meaningful(base.get(key)) ? { kind: 'game', label: `Game · ${gameName}`, color: GAME_BINDING_COLOR } : UNSET)
  if (selected) for (const key of assignments(Object.entries(selected.overrides).map(([k, v]) => `${k} = ${v}`).join('\n')).keys()) {
    exact.set(key, { kind: 'layer', label: `Layer · ${selected.name}`, color: layerHue(layerSlot(layers, selected.id)) })
  }
  const combine = (items: BindingSource[]): BindingSource => {
    const sources = [...new Map(items.filter(s => s.kind !== 'unset').flatMap(s => s.sources ?? [s]).map(s => [s.label, s])).values()]
    if (!sources.length) return UNSET
    if (sources.every(s => s.kind === sources[0].kind && s.color === sources[0].color)) return { ...sources[0], label: [...new Set(sources.map(s => s.label))].join('; ') }
    return { kind: 'mixed', label: sources.map(s => s.label).join('; '), color: 'var(--text-2)', sources }
  }
  const groups = new Map<string, BindingSource[]>()
  for (const [key, source] of exact) {
    const input = physicalInput(key)
    if (!input) continue
    for (const group of new Set([input, groupInput(input)])) groups.set(group, [...(groups.get(group) ?? []), source])
  }
  const inputs = new Map([...groups].map(([input, sources]) => [input, combine(sources)]))
  const input = (command?: string) => command ? inputs.get(command === 'LUP' ? 'L3' : command) ?? exact.get(command) ?? UNSET : UNSET
  return {
    input,
    setting: (key?: string) => key ? exact.get(key) ?? UNSET : UNSET,
    group: (commands: readonly string[], prefixes: readonly string[] = []) => combine([
      ...commands.map(input), ...(prefixes.length ? [...exact].filter(([key]) => prefixes.some(prefix => key.startsWith(prefix))).map(([, source]) => source) : []),
    ]),
    hasBase: base.size > 0,
    mixed: [...inputs.values()].find(source => source.kind === 'mixed'),
    baseNames,
    gameName,
  }
}
