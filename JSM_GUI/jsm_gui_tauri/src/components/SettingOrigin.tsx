import { createContext, useContext, useState, type ReactNode } from 'react'
import { layerEntries, readableSetting } from '../utils/layers'
import { DirtyScope } from '../hooks/configContext'

export const SettingOrigins = createContext<{
  text: string; base: string; own: string; origins: Record<string, string>; layer?: string;
  reset?: (key: string) => void; disabled?: boolean
}>({ text: '', base: '', own: '', origins: {} })

const SettingKeyPrefix = createContext('')
export function SettingPrefix({ prefix, children }: { prefix: string; children: ReactNode }) { return <SettingKeyPrefix.Provider value={prefix}>{children}</SettingKeyPrefix.Provider> }

/**
 * The origin marker (Components 13.8): a hollow dot and the source's name when
 * a value is inherited, a solid dot and "Override" when this profile or layer
 * sets it, and nothing for a plain value with nothing behind it. "Use
 * inherited" removes the override; it is never the same as None.
 */
export function SettingOrigin({ setting }: { setting?: string }) {
  const context = useContext(SettingOrigins)
  const prefix = useContext(SettingKeyPrefix)
  if (!setting) return null
  setting = setting.includes(',') ? setting : prefix + setting
  const own = Object.prototype.hasOwnProperty.call(layerEntries(context.own), setting)
  const source = context.origins[setting]
  const imported = source && source !== '<editor>' ? source.split('/').pop()?.replace(/.txt$/i, '') : null
  const inBase = Object.prototype.hasOwnProperty.call(layerEntries(context.base), setting)
  const resetAvailable = own && (context.layer || imported || inBase)
  // What the marker says, and the fuller wording a screen reader hears.
  const [kind, shown, spoken] = context.layer
    ? own ? ['override', `Override · ${context.layer}`, ''] : ['inherited', 'From Default', 'Inherited · ']
    : own
      ? resetAvailable ? ['override', 'Override', ''] : ['own', 'This profile', '']
      : imported ? ['inherited', imported, 'Inherited · '] : ['default', 'App default', '']
  if (kind === 'default' || kind === 'own') return null
  return <span className="setting-origin origin-marker" data-origin={kind} data-setting-origin={setting}>
    <span className="origin-marker__dot" aria-hidden="true" />
    <small>{spoken && <span className="origin-marker__spoken">{spoken}</span>}{shown}</small>
    {resetAvailable && context.reset && <button type="button" className="origin-marker__reset" disabled={context.disabled} title={`Restore ${readableSetting(setting)} from ${context.layer ? 'Default' : 'its source'}`} onClick={event => { event.preventDefault(); event.stopPropagation(); context.reset?.(setting) }}>{context.layer ? 'Use Default' : 'Use inherited'}</button>}
  </span>
}

/** A complete per-value view also covers advanced settings and imported rows. */
export function SettingsInventory() {
  const context = useContext(SettingOrigins), scope = useContext(DirtyScope)
  const [query, setQuery] = useState('')
  const values = Object.entries(layerEntries(context.text)).filter(([key]) => !key.startsWith('#') && (!scope || scope.test(key.split(',').pop()!)))
  if (!context.layer && !Object.values(context.origins).some(source => source !== '<editor>')) return null
  return <details className="settings-inventory"><summary>Values & inheritance · {values.length} settings and bindings</summary><input type="search" aria-label="Find inherited value" placeholder="Find a setting or binding" value={query} onChange={e => setQuery(e.target.value)} />{values.filter(([key,value]) => `${readableSetting(key)} ${value}`.toLowerCase().includes(query.toLowerCase())).map(([key,value]) => <div className="setting-inventory-row" key={key}><span title={key}>{readableSetting(key)}</span><span>{value}</span><SettingOrigin setting={key} /></div>)}</details>
}
