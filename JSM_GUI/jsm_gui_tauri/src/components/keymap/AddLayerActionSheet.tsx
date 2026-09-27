import { useContext, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../ui/Dialog'
import { LayerUsageContext } from '../LayerBar'
import { layerHue, layerSlot, layerVerbKeys, layerVerbOrder, type LayerAction, type LayerVerb } from '../../utils/layers'
import { LayerTile } from './ConceptTiles'
import styles from './AddSheets.module.css'

const EXPLAIN_KEYS: Record<LayerVerb, [string, string]> = {
  hold: ['keymap.layerExplainHold', 'Layer is on only while {{input}} is held down.'],
  toggle: ['keymap.layerExplainToggle', 'Each press turns the layer on or off.'],
  apply: ['keymap.layerExplainApply', 'Press turns the layer on; it stays on.'],
  remove: ['keymap.layerExplainRemove', 'Press turns the layer off.'],
}

type Props = {
  /** "A", for "When A is pressed"; "A button" for the eyebrow. */
  shortName: string
  longName: string
  /** The press actions this input already has, one per layer: adding for
   *  one of those layers replaces it, and the sheet says so. */
  existing?: LayerAction[]
  onAdd: (layerId: string, verb: LayerVerb) => void
  onClose: () => void
}

/**
 * Add layer action (binding card refresh 3f): one sheet, no picker. Which
 * layer, and "When A is pressed" -- Hold, Toggle, Turn on, Turn off -- with
 * the tile the card will show and one line on what it does. Turn on and Turn
 * off are the UI's words for JSM's apply and remove; the file is unchanged.
 */
export function AddLayerActionSheet({ shortName, longName, existing = [], onAdd, onClose }: Props) {
  const { t } = useTranslation()
  const { layers } = useContext(LayerUsageContext)
  // Start on the first layer this input does not use yet, when there is one.
  const [layerId, setLayerId] = useState((layers.find(layer => !existing.some(action => action.layerId === layer.id)) ?? layers[0])?.id ?? '')
  const [verb, setVerb] = useState<LayerVerb>('hold')
  const hue = layerHue(layerSlot(layers, layerId))
  const step = (by: number) => setVerb(current => layerVerbOrder[(layerVerbOrder.indexOf(current) + by + layerVerbOrder.length) % layerVerbOrder.length])
  const currentFor = (id: string) => existing.find(action => action.layerId === id)
  const current = currentFor(layerId)
  // The same action again is nothing to add.
  const duplicate = Boolean(current && current.verb === verb)
  const add = (id = layerId) => { if (id && !(currentFor(id)?.verb === verb)) onAdd(id, verb) }
  // A from the pad or keyboard adds at once; the mouse selects first.
  const pick = (id: string) => (event: MouseEvent<HTMLButtonElement>) => { setLayerId(id); if (event.detail === 0) add(id) }
  const whenLabel = t('keymap.layerActionWhenPressed', 'When {{input}} is pressed', { input: shortName })
  const tileName = (action: LayerAction) => t('keymap.layerTile', { verb: t(layerVerbKeys[action.verb]), layer: layers.find(layer => layer.id === action.layerId)?.name ?? action.layerId })
  const previewText = duplicate
    ? t('keymap.layerActionAlready', '{{input}} already does this.', { input: shortName })
    : current
      ? t('keymap.layerActionReplaces', 'Replaces {{tile}}.', { tile: tileName(current) })
      : t(EXPLAIN_KEYS[verb][0], EXPLAIN_KEYS[verb][1], { input: shortName })

  return (
    <Dialog onClose={onClose} width={600} tone="layer" hue={hue}
      onPad={button => { if (button === 'LB' || button === 'RB') { step(button === 'RB' ? 1 : -1); return true } return false }}
      eyebrow={t('keymap.newLayerActionEyebrow', 'New layer action · {{input}}', { input: longName })}
      title={t('keymap.whichLayer', 'Which layer?')}
      hints={[
        { button: ['LB', 'RB'], label: t('keymap.layerVerbCycle', 'Hold / Toggle / On / Off') },
        { button: 'A', label: t('keymap.sheetAdd', 'Add') },
        { button: 'B', label: t('common.cancel', 'Cancel') },
      ]}
      actions={
        <>
          <button type="button" className="console-btn" onClick={onClose} data-hints="A:Cancel;B:Cancel">{t('common.cancel', 'Cancel')}</button>
          <button type="button" className="console-btn console-btn--primary" disabled={!layerId || duplicate} onClick={() => add()} data-hints="A:Add;B:Cancel">{t('keymap.sheetAdd', 'Add')}</button>
        </>
      }>
      <div className={styles.layerBody}>
        <div className={styles.layerList} role="radiogroup" aria-label={t('keymap.whichLayer', 'Which layer?')}>
          {layers.map(layer => {
            const used = currentFor(layer.id)
            return (
              <button key={layer.id} type="button" role="radio" aria-checked={layer.id === layerId} className={styles.layerRow}
                data-hints="MOVE:Move;A:Add;LB/RB:Hold / Toggle / On / Off;B:Cancel" onClick={pick(layer.id)}>
                <span className={styles.layerSwatch} style={{ background: layerHue(layerSlot(layers, layer.id)) }} aria-hidden="true" />
                <span className={styles.layerName}>{layer.name}</span>
                {/* A layer this input already acts on wears that action's tile. */}
                {used && <LayerTile layerId={used.layerId} verb={used.verb} />}
                <span className={styles.layerCount}>{t('keymap.layerBindingCount', { count: Object.keys(layer.overrides).length, defaultValue: '{{count}} bindings' })}</span>
              </button>
            )
          })}
        </div>
        <div className={styles.field}>
          <span className={styles.groupLabel}>{whenLabel}</span>
          <div className={styles.verbTrack} role="radiogroup" aria-label={whenLabel} style={{ ['--verb-hue' as string]: hue }}
            data-hints="MOVE:Choose;A:Add;LB/RB:Hold / Toggle / On / Off;B:Cancel"
            onKeyDown={event => {
              if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1) }
              if (event.key === 'ArrowRight') { event.preventDefault(); step(1) }
            }}>
            {layerVerbOrder.map(value => (
              <button key={value} type="button" role="radio" aria-checked={verb === value} tabIndex={verb === value ? 0 : -1}
                className={styles.verb} onClick={() => setVerb(value)}>
                {t(layerVerbKeys[value])}
              </button>
            ))}
          </div>
        </div>
        {/* What it will be: the card's own tile, and one fixed line on what it
            does -- or on what it replaces. */}
        <div className={styles.preview} data-replaces={current && !duplicate ? 'true' : undefined}>
          {layerId && <LayerTile layerId={layerId} verb={verb} size="md" />}
          <span className={styles.previewText}>{previewText}</span>
        </div>
      </div>
    </Dialog>
  )
}
