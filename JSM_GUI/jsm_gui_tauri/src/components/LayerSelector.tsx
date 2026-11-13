import { useContext, type CSSProperties } from 'react'
import { LayerUsageContext } from './LayerBar'
import { layerHue, layerSlot, type ConfigLayer } from '../utils/layers'
import styles from './LayerSelector.module.css'

/** The editing layer is page context, never a repeated badge on each binding. */
export function LayerSelector(props: { layers?: ConfigLayer[]; selected?: ConfigLayer; onSelect?: (id: string) => void; disabled?: boolean } = {}) {
  const context = useContext(LayerUsageContext)
  const layers = props.layers ?? context.layers
  const selected = props.layers ? props.selected : context.selected
  const onSelect = props.onSelect ?? context.onSelect
  const disabled = props.disabled ?? context.disabled
  if (!layers.length) return null
  return <div className={styles.strip} role="group" aria-label="Editing layer" data-layer-selector="">
    <span className={styles.label}>Editing layer</span>
    <button type="button" aria-pressed={!selected} disabled={disabled} onClick={() => onSelect?.('')}>Default</button>
    {layers.map(layer => <button key={layer.id} type="button" aria-pressed={selected?.id === layer.id} disabled={disabled}
      style={{ '--layer-color': layerHue(layerSlot(layers, layer.id)) } as CSSProperties} onClick={() => onSelect?.(layer.id)}>
      <span className={styles.dot} aria-hidden="true" />{layer.name}
    </button>)}
  </div>
}
