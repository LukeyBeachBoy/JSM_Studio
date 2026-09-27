import { useContext, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LayerUsageContext } from '../LayerBar'
import { AppSelect } from '../ui/AppSelect'
import { Sheet } from '../ui/Sheet'
import { Icon } from '../icons/Icon'
import { actionsOnInput, layerHue, layerSlot, layerVerbKeys, layerVerbOrder, type LayerAction, type LayerVerb } from '../../utils/layers'
import { isReleasedInput, withRelease } from '../../utils/released'
import { Lane, LaneAddButton, laneStyles, removeRow, useJustAdded } from './Lane'
import { AddLayerActionSheet } from './AddLayerActionSheet'
import { LayerTile } from './ConceptTiles'
import { ReleaseSwitch } from './ReleaseSwitch'
import sheetStyles from './BindingEditor.module.css'

const DESCRIPTION_KEYS: Record<LayerVerb, [pressed: string, released: string]> = {
  hold: ['keymap.layerDescHold', 'keymap.layerDescHoldReleased'],
  toggle: ['keymap.layerDescToggle', 'keymap.layerDescToggleReleased'],
  apply: ['keymap.layerDescApply', 'keymap.layerDescApplyReleased'],
  remove: ['keymap.layerDescRemove', 'keymap.layerDescRemoveReleased'],
}

type Props = {
  command: string
  label: string
  /** The input's glyph, first in each row. */
  glyph: ReactNode
  /** "A", for "On while A is held". */
  shortName: string
  /** "A button", for the add sheet's eyebrow. */
  longName: string
}

/**
 * The Layer actions lane of the open binding card (binding card refresh 3c):
 * per action, the input, an arrow, the layer's "Hold Vehicles" tile and a line
 * saying when it is on; its cog holds when, how, which layer and Remove.
 */
export function LayerActionsLane({ command, label, glyph, shortName, longName }: Props) {
  const { t } = useTranslation()
  const { layers, actions, onSetActions, onSelect, disabled } = useContext(LayerUsageContext)
  const [editing, setEditing] = useState<LayerAction | null>(null)
  const [adding, setAdding] = useState(false)
  const laneRef = useRef<HTMLElement>(null)
  const mine = actionsOnInput(actions, command)
  const keyOf = (action: LayerAction) => `${action.input}:${action.verb}:${action.layerId}`
  const added = useJustAdded(mine.map(keyOf), key => `[data-layer-key="${CSS.escape(key)}"] button`)
  if (!onSetActions) return null
  const closeLabel = `Close ${shortName}`
  const replace = (from: LayerAction, to: LayerAction | null) => {
    // One action per layer for each of press and release.
    const rest = mine.filter(action => action !== from && !(to && action.layerId === to.layerId && action.input === to.input))
    onSetActions(command, to ? [...rest, to] : rest)
    setEditing(to)
  }
  // Pressed; "happens on release" is set afterwards in the action's cog. An
  // action this input already has for the layer is replaced -- the add sheet
  // says so before it happens.
  const add = (layerId: string, verb: LayerVerb) => {
    added.expect()
    onSetActions(command, [...mine.filter(action => !(action.layerId === layerId && action.input === command)), { input: command, verb, layerId }])
    setAdding(false)
  }
  const describe = (action: LayerAction) => t(DESCRIPTION_KEYS[action.verb][isReleasedInput(action.input) ? 1 : 0], { input: shortName })
  // The lane wears the colour of the first layer it names, not always layer 1's.
  const hue = mine[0] ? layerHue(layerSlot(layers, mine[0].layerId)) : undefined
  // The row of a removed action, found in this lane only: another card on the
  // page can hold the same action key.
  const rowOf = (action: LayerAction) => laneRef.current?.querySelector<HTMLElement>(`[data-layer-key="${CSS.escape(keyOf(action))}"]`)

  return (
    <Lane ref={laneRef} concept="layer" label={t('keymap.layerActionsHeading', 'Layer actions')} count={mine.length} hue={hue}
      footer={
        layers.length ? (
          <LaneAddButton concept="layer" label={t('keymap.addLayerAction', 'Add layer action')} disabled={disabled}
            hints={`A:Add layer action;B:${closeLabel}`} onClick={() => setAdding(true)} />
        ) : (
          // No layers yet: say so where a pad user can read it, with the way
          // to the Layers page, rather than a disabled button with a tooltip.
          <div className={laneStyles.empty}>
            <span className={laneStyles.emptyText}>{t('keymap.layerActionNoLayers', 'Create a layer on the Layers page first.')}</span>
            <button type="button" className="console-btn" disabled={disabled} data-hints={`A:Go to Layers;B:${closeLabel}`}
              onClick={() => window.dispatchEvent(new CustomEvent('jsm:open-page', { detail: 'layers' }))}>
              <Icon name="layer" size={16} />{t('keymap.goToLayers', 'Go to Layers')}
            </button>
          </div>
        )
      }>
      {mine.length > 0 && (
        <div className={laneStyles.rows} aria-label={label}>
          {mine.map((action, index) => (
            <div key={action.layerId + action.verb + action.input + index} className={laneStyles.row} data-kind="layer" data-layer-action={action.layerId}
              data-layer-key={keyOf(action)} data-just-added={added.justAdded === keyOf(action) ? 'true' : undefined}
              data-pad-keys="Y" data-hints={`A:Edit layer;Y:Settings;B:${closeLabel}`}
              onKeyDown={event => { if (event.key === 'y' || event.key === 'Y') { event.preventDefault(); setEditing(action) } }}>
              <span className={laneStyles.glyph} aria-hidden="true">{glyph}</span>
              <span className={laneStyles.arrow} aria-hidden="true">→</span>
              <button type="button" className={laneStyles.tileButton} disabled={disabled} onClick={() => onSelect?.(action.layerId)} title={t('keymap.editLayer', 'Edit this layer')}>
                <LayerTile layerId={action.layerId} verb={action.verb} size="md" />
              </button>
              <span className={laneStyles.text}>{describe(action)}</span>
              <button type="button" className="console-btn console-btn--icon" aria-label={t('keymap.layerActionSettings', 'Layer action settings')}
                disabled={disabled} onClick={() => setEditing(action)} data-hints={`A:Settings;B:${closeLabel}`}>
                <Icon name="cog" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      {adding && <AddLayerActionSheet shortName={shortName} longName={longName} existing={mine.filter(action => action.input === command)} onAdd={add} onClose={() => setAdding(false)} />}
      <LayerActionSheet action={editing} shortName={shortName} onClose={() => setEditing(null)} onChange={replace}
        onRemove={action => { const row = rowOf(action); setEditing(null); removeRow(row, () => replace(action, null), { afterClose: true }) }} />
    </Lane>
  )
}

/** A layer action's cog: when it happens, what it does, which layer, Remove. */
function LayerActionSheet({ action, shortName, onClose, onChange, onRemove }: {
  action: LayerAction | null
  shortName: string
  onClose: () => void
  onChange: (from: LayerAction, to: LayerAction | null) => void
  onRemove: (action: LayerAction) => void
}) {
  const { t } = useTranslation()
  const { layers } = useContext(LayerUsageContext)
  if (!action) return null
  const released = isReleasedInput(action.input)
  const input = released ? action.input.slice(1) : action.input
  const name = layers.find(layer => layer.id === action.layerId)?.name ?? action.layerId
  return (
    <Sheet open onClose={onClose} eyebrow={t('keymap.layerActionEyebrow', 'Layer action · {{input}}', { input: shortName })}
      title={t('keymap.layerTile', { verb: t(layerVerbKeys[action.verb]), layer: name })} width={560}
      hints={[{ button: 'A', label: t('keymap.sheetSelect', 'Select') }, { button: 'B', label: t('keymap.sheetClose', 'Close') }]}>
      <div className={sheetStyles.sheet} data-capture-ignore="true">
        <div className={sheetStyles.field}>
          <span>{t('keymap.layerActionWhenPressed', 'When {{input}} is pressed', { input: shortName })}</span>
          <div className="segmented" role="radiogroup" aria-label={t('keymap.layerActionWhenPressed', 'When {{input}} is pressed', { input: shortName })} data-hints="MOVE:Choose;A:Select;B:Close">
            {layerVerbOrder.map(verb => (
              <button key={verb} type="button" role="radio" aria-checked={action.verb === verb} onClick={() => onChange(action, { ...action, verb })}>{t(layerVerbKeys[verb])}</button>
            ))}
          </div>
        </div>
        <div className={sheetStyles.field}>
          <span>{t('keymap.layerActionOn', 'Happens on')}</span>
          <ReleaseSwitch released={released} ariaLabel={t('keymap.layerActionOn', 'Happens on')}
            labels={[t('keymap.layerActionPress', 'Press'), t('keymap.layerActionRelease', 'Release')]}
            onChange={next => onChange(action, { ...action, input: withRelease(input, next) })} />
        </div>
        <label className={sheetStyles.field}>
          <span>{t('keymap.layerActionLayer', 'Layer')}</span>
          <AppSelect aria-label={t('keymap.layerActionLayer', 'Layer')} value={action.layerId} onChange={event => onChange(action, { ...action, layerId: event.target.value })}>
            {layers.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
          </AppSelect>
        </label>
        <div className={sheetStyles.actions}>
          <button type="button" className="console-btn console-btn--danger" onClick={() => onRemove(action)} data-hints="A:Remove;B:Close">
            <Icon name="remove" size={18} />{t('keymap.removeLayerAction', 'Remove layer action')}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
