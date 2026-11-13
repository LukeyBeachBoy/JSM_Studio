import { BindingSourceMark, useBindingProvenance } from '../BindingProvenance'
import { useContext, type CSSProperties } from 'react'
import { readableSetting, layerHue, layerSlot } from '../../utils/layers'
import { LayerUsageContext } from '../LayerBar'
import { useSettingOriginInfo } from './settingOriginInfo'

type MarkerProps = {
  setting?: string
  /** Extra text after the marker, e.g. "template: Middle mouse". */
  detail?: string
  /** Render the reset button (the open editor); the closed row never does. */
  withReset?: boolean
  /** Carry data-setting-origin, so the row's marker is addressable. */
  addressable?: boolean
}

/** The origin marker alone: nothing for a plain value with nothing behind it. */
export function OriginMarker({ setting, detail, withReset, addressable, compact }: MarkerProps & {
  /** Just the dot, with the words as its caption: for rows, where the full
   *  "From Strategy and builders - Steam Controller" squeezed out the name. */
  compact?: boolean
}) {
  const info = useSettingOriginInfo(setting)
  const { selected, layers } = useContext(LayerUsageContext)
  const provenance = useBindingProvenance()
  const source = provenance?.input(setting)
  if (!info || (source ? source.kind === 'unset' : info.kind === 'default' || info.kind === 'own')) return null
  const shown = source?.label ?? info.shown
  return (
    <span className="setting-origin origin-marker" data-origin={info.kind} data-setting-origin={addressable ? setting : undefined}
      data-compact={compact ? 'true' : undefined} title={shown} data-binding-source={source?.kind}
      style={source ? { '--origin-override': source.color, color: source.color } as CSSProperties : selected && info.kind === 'override' ? { '--origin-override': layerHue(layerSlot(layers, selected.id)) } as CSSProperties : undefined}>
      <span aria-hidden="true">{source ? <BindingSourceMark source={source} className="origin-marker__dot" /> : <span className="origin-marker__dot" />}</span>
      <small>{shown}{detail ? ` · ${detail}` : ''}</small>
      {withReset && info.reset && (
        <button
          type="button"
          className="origin-marker__reset"
          disabled={info.disabled}
          title={`Restore ${readableSetting(setting ?? '')} from ${info.sourceName ?? 'its source'}`}
          data-hints={`A:${info.resetLabel};B:Back`}
          onClick={event => { event.preventDefault(); event.stopPropagation(); info.reset?.() }}
        >
          {info.resetLabel}
        </button>
      )}
    </span>
  )
}
