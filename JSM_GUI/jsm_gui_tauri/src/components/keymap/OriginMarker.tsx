import { readableSetting } from '../../utils/layers'
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
  if (!info || info.kind === 'default' || info.kind === 'own') return null
  return (
    <span className="setting-origin origin-marker" data-origin={info.kind} data-setting-origin={addressable ? setting : undefined}
      data-compact={compact ? 'true' : undefined} title={compact ? info.shown : undefined}>
      <span className="origin-marker__dot" aria-hidden="true" />
      <small>{info.spoken && <span className="origin-marker__spoken">{info.spoken}</span>}{info.shown}{detail ? ` · ${detail}` : ''}</small>
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
