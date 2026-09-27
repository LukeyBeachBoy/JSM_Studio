import { useContext } from 'react'
import { SettingOrigins } from '../SettingOrigin'
import { layerEntries } from '../../utils/layers'

export type OriginKind = 'inherited' | 'override' | 'own' | 'default'

export type OriginInfo = {
  kind: OriginKind
  /** What the marker says: "FPS Template", "Override", "Override · Comms". */
  shown: string
  /** The prefix a screen reader hears before it, "Inherited · ". */
  spoken: string
  /** The imported file's display name, when the value comes from or overrides one. */
  sourceName: string | null
  /** The imported (or Default-layer) value this file overrides, raw. */
  baseValue: string | null
  /** True when "Use inherited" / "Use Default" would do something. */
  canReset: boolean
  resetLabel: string
  reset: (() => void) | null
  disabled: boolean
}

const has = (entries: Readonly<Record<string, string>>, key: string) => Object.prototype.hasOwnProperty.call(entries, key)

/**
 * Where a setting's value comes from, read the same way SettingOrigin reads
 * it (Components 13.8): this file, an imported template, or the Default
 * layer. The binding row draws its own marker from this because the closed
 * row shows the origin without a reset button and the open editor shows it
 * with one, beside the template's value.
 */
export function useSettingOriginInfo(setting?: string): OriginInfo | null {
  const context = useContext(SettingOrigins)
  if (!setting) return null
  const ownEntries = layerEntries(context.own)
  const own = has(ownEntries, setting)
  const source = context.origins[setting]
  const imported = source && source !== '<editor>' ? source.split('/').pop()?.replace(/\.txt$/i, '') ?? null : null
  const baseEntries = layerEntries(context.base)
  const inBase = has(baseEntries, setting)
  const canReset = own && Boolean(context.layer || imported || inBase)
  const baseValue = inBase ? baseEntries[setting] : null
  const baseSource = inBase ? context.baseOrigins?.[setting] : undefined
  const overridden = baseSource && baseSource !== '<editor>' ? baseSource.split('/').pop()?.replace(/\.txt$/i, '') ?? null : null
  let kind: OriginKind
  let shown: string
  let spoken = ''
  if (context.layer) {
    kind = own ? 'override' : 'inherited'
    shown = own ? `Override · ${context.layer}` : 'From Default'
    spoken = own ? '' : 'Inherited · '
  } else if (own) {
    kind = canReset ? 'override' : 'own'
    shown = canReset ? 'Override' : 'This profile'
  } else if (imported) {
    kind = 'inherited'
    shown = imported
    spoken = 'Inherited · '
  } else {
    kind = 'default'
    shown = 'App default'
  }
  return {
    kind,
    shown,
    spoken,
    sourceName: imported ?? (context.layer ? 'Default' : overridden),
    baseValue,
    canReset,
    resetLabel: context.layer ? 'Use Default' : 'Use inherited',
    reset: canReset && context.reset ? () => context.reset?.(setting) : null,
    disabled: Boolean(context.disabled),
  }
}

