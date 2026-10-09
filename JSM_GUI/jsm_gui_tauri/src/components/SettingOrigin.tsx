import { createContext, useContext, useState, type ReactNode } from 'react'
import { layerEntries, readableSetting } from '../utils/layers'
import { DirtyScope } from '../hooks/configContext'
import { bindingTargetAlias } from '../utils/bindingAliases'
import { getKeymapValue } from '../utils/keymap'
import { ConfigName } from './ConfigName'

export const SettingOrigins = createContext<{
  text: string; base: string; own: string; origins: Record<string, string>; layer?: string;
  /** The configuration being edited. */
  config?: string
  /** Which import each value in `base` came from, for "Overrides FPS Template". */
  baseOrigins?: Record<string, string>
  reset?: (key: string) => void; disabled?: boolean
}>({ text: '', base: '', own: '', origins: {} })

const SettingKeyPrefix = createContext('')
export function SettingPrefix({ prefix, children }: { prefix: string; children: ReactNode }) { return <SettingKeyPrefix.Provider value={prefix}>{children}</SettingKeyPrefix.Provider> }
export function useSettingKey(setting?: string) {
  const prefix = useContext(SettingKeyPrefix)
  return setting && !setting.includes(',') ? prefix + setting : setting
}

/**
 * The origin marker (Components 13.8): a hollow dot and the source's name when
 * a value is inherited, a solid dot and "Changed here" when this configuration or mode
 * sets it, and nothing for a plain value with nothing behind it. "Use
 * inherited" removes the override; it is never the same as None.
 */
export function SettingOrigin({ setting }: { setting?: string }) {
  const context = useContext(SettingOrigins)
  const prefix = useContext(SettingKeyPrefix)
  if (!setting) return null
  setting = setting.includes(',') ? setting : prefix + setting
  const literalOwn = Object.prototype.hasOwnProperty.call(layerEntries(context.own), setting)
  const own = literalOwn || Boolean(bindingTargetAlias(setting) && getKeymapValue(context.own, setting) !== undefined)
  const source = context.origins[setting]
  const imported = source && source !== '<editor>' ? source.split('/').pop()?.replace(/.txt$/i, '') : null
  const inBase = Object.prototype.hasOwnProperty.call(layerEntries(context.base), setting) || Boolean(bindingTargetAlias(setting) && getKeymapValue(context.base, setting) !== undefined)
  // Removing the shared source would also reset its sibling. Offer this
  // per-input reset only when an individual assignment actually owns it.
  const resetAvailable = literalOwn && (context.layer || imported || inBase)
  // What the marker says, and the fuller wording a screen reader hears.
  const [kind, shown, spoken] = context.layer
    ? own ? ['override', `Changed in ${context.layer}`, ''] : ['inherited', 'From Default', 'Same as Default · ']
    : own
      ? resetAvailable ? ['override', 'Changed here', ''] : ['own', 'This configuration', '']
      : imported ? ['inherited', `From ${imported}`, ''] : ['default', 'App default', '']
  if (kind === 'default' || kind === 'own') return null
  return <span className="setting-origin origin-marker" data-origin={kind} data-setting-origin={setting}>
    <span className="origin-marker__dot" aria-hidden="true" />
    <small>{spoken && <span className="origin-marker__spoken">{spoken}</span>}{shown}</small>
    {resetAvailable && context.reset && <button type="button" className="origin-marker__reset" disabled={context.disabled} data-caption={`Restore ${readableSetting(setting)} from ${context.layer ? 'Default' : 'its source'}`} onClick={event => { event.preventDefault(); event.stopPropagation(); context.reset?.(setting) }}>{context.layer ? 'Use Default' : 'Use the base'}</button>}
  </span>
}

/** Values & inheritance: every value in the configuration with where it comes
 *  from, including advanced settings and imported rows. Most people never need
 *  it, so it is a dialog opened from the title bar's configuration menu rather
 *  than a panel under every page. Opened on a page with a narrower scope (Gyro),
 *  it starts filtered to that page's settings, with a way to see them all. */
export function SettingsInventory({ open, onClose, pageLabel }: { open: boolean; onClose: () => void; pageLabel?: string }) {
  const context = useContext(SettingOrigins), scope = useContext(DirtyScope)
  const [query, setQuery] = useState('')
  const [pageOnly, setPageOnly] = useState(true)
  if (!open) return null
  const scoped = !!scope && scope.source !== '.' && pageOnly
  const values = Object.entries(layerEntries(context.text)).filter(([key]) => !key.startsWith('#') && (!scoped || scope!.test(key.split(',').pop()!)))
  const shown = values.filter(([key, value]) => `${readableSetting(key)} ${key} ${value}`.toLowerCase().includes(query.toLowerCase()))
  const inherits = !!context.layer || Object.values(context.origins).some(source => source !== '<editor>')
  return <div className="modal-overlay">
    <section className="modal-card settings-inventory" role="dialog" aria-modal="true" aria-labelledby="settings-inventory-title">
      <div className="modal-header"><h3 id="settings-inventory-title">Where values come from</h3><button type="button" className="button button--ghost button--sm" data-modal-close onClick={onClose}>Close</button></div>
      <p className="settings-inventory__note">{inherits
        ? `Where each of the ${values.length} settings and bindings comes from: ${context.layer ? `${context.layer} or Default` : 'this configuration or its base'}.`
        : `Nothing comes from a base: all ${values.length} settings and bindings are set in this configuration.`}</p>
      <div className="settings-inventory__filters">
        <input className="text-field" type="search" aria-label="Find a value" placeholder="Find a setting or binding" value={query} onChange={e => setQuery(e.target.value)} />
        {scope && scope.source !== '.' && pageLabel && <label className="settings-inventory__scope">
          <input type="checkbox" checked={pageOnly} onChange={e => setPageOnly(e.target.checked)} /> {pageLabel} only
        </label>}
      </div>
      <div className="settings-inventory__rows">
        {shown.map(([key, value]) => <div className="setting-inventory-row" key={key}><span data-caption={key}>{readableSetting(key)}<ConfigName name={key} /></span><span>{value}</span><SettingOrigin setting={key} /></div>)}
        {!shown.length && <p className="settings-inventory__empty">No setting or binding matches.</p>}
      </div>
    </section>
  </div>
}
