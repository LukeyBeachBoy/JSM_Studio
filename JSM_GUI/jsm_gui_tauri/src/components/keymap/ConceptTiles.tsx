import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../icons/Icon'
import { LayerUsageContext } from '../LayerBar'
import { layerVerbKeys, type ConfigLayer, type LayerVerb } from '../../utils/layers'
import styles from './ConceptTiles.module.css'

// The concept tiles (binding card refresh §1-§3): one look each for a
// modeshift, a layer and a command's output, shared by the compact row, the
// open card's lanes, the add sheets and Overview, so a modeshift or a layer
// reads the same wherever it is mentioned.

/** Which of the three layer hues a layer wears: its place in the list. */
export const layerSlot = (layers: ConfigLayer[], layerId: string) =>
  (Math.max(0, layers.findIndex(layer => layer.id === layerId)) % 3) + 1

/** The held input drawn as a white rounded cap: the L4 of "L4 + A". */
export function TriggerCap({ label, size = 'sm' }: { label: string; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={styles.triggerCap} data-size={size}>{label}</span>
}

/** "L4 → V": a shift on the compact row. */
export function ModeshiftTile({ trigger, output, title }: { trigger: string; output: string; title?: string }) {
  return (
    <span className={styles.shiftTile} title={title}>
      <TriggerCap label={trigger} />
      <span className={styles.shiftArrow} aria-hidden="true">→</span>
      <span className={styles.tileText}>{output}</span>
    </span>
  )
}

/** "Hold Vehicles": a layer action, in the layer's own hue. */
export function LayerTile({ layerId, verb, size = 'sm', title }: { layerId: string; verb: LayerVerb; size?: 'sm' | 'md'; title?: string }) {
  const { t } = useTranslation()
  const { layers } = useContext(LayerUsageContext)
  const slot = layerSlot(layers, layerId)
  const name = layers.find(layer => layer.id === layerId)?.name ?? layerId
  const text = t('keymap.layerTile', { verb: t(layerVerbKeys[verb]), layer: name })
  return (
    <span className={styles.layerTile} data-size={size} data-layer-slot={slot} title={title ?? text}>
      <Icon name="layer" size={size === 'md' ? 16 : 14} />
      <span className={styles.tileText}>{text}</span>
    </span>
  )
}

/** "+2": whatever did not fit, as one neutral tile. */
export function MoreTile({ count, tone = 'neutral', title }: { count: number; tone?: 'neutral' | 'command'; title?: string }) {
  const { t } = useTranslation()
  return <span className={styles.moreTile} data-tone={tone} title={title} aria-label={t('keymap.rowMore', { count })}>+{count}</span>
}

/** A command's output as a keycap, its activation printed on the cap. */
export function OutputKeycap({ activation, output, title }: { activation?: string; output: string; title?: string }) {
  return (
    <kbd className={styles.keycap} title={title}>
      {activation && <span className={styles.keycapActivation}>{activation}</span>}
      <span className={styles.keycapKey}>{output}</span>
    </kbd>
  )
}
