import { createContext, useContext, useState } from 'react'
import { convertModeshifts, inputUses, inputUsage, inputDefinitions, readableSetting, writeLayers, actionsOnInput, describeAction, layerVerbOrder, layerVerbLabels, type ConfigLayer, type LayerAction, type LayerVerb } from '../utils/layers'
import { type ControllerVisualFamily } from '../utils/controllerStatus'
import { inputDisplayName } from '../keymap/inputNames'
import { AppSelect } from './ui/AppSelect'
import { Icon } from './icons/Icon'
import { withRelease } from '../utils/released'
import './Layers.css'

/** The layer mark (binding card refresh 2a): stacked sheets, the top one filled. */
export function LayerIcon({ size = 16 }: { size?: number }) { return <Icon name="layer" size={size} /> }

export const LayerUsageContext = createContext<{
  text: string; layers: ConfigLayer[]; actions: LayerAction[]; selected?: ConfigLayer
  onChangeLayers?: (layers: ConfigLayer[]) => void
  /** Replaces every layer action on one input. */
  onSetActions?: (input: string, actions: LayerAction[]) => void
  onSelect?: (id: string) => void; onNavigate?: (command: string) => void; disabled?: boolean
  /** The pad in front of you, so inputs read L4 / LB rather than LSL / L. */
  family?: ControllerVisualFamily
}>({ text: '', layers: [], actions: [] })
export function useInputUses(command?: string) {
  const { text, layers, family = 'generic' } = useContext(LayerUsageContext)
  return command ? inputUses(text, command, layers, input => inputDisplayName(input, family)) : []
}
export function LayerValueBadge({ command }: { command?: string }) {
  const { selected } = useContext(LayerUsageContext)
  if (!selected || !command) return null
  const side = command === 'LEFT_PAD' ? 'LEFT' : command === 'RIGHT_PAD' ? 'RIGHT' : null
  const overridden = Object.keys(selected.overrides).some(key => key === command || key.endsWith(`,${command}`) ||
    (side && key.startsWith(`${side}_`)) || (command === 'L3' && key.startsWith('LEFT_STICK_')) || (command === 'R3' && key.startsWith('RIGHT_STICK_')))
  return <small className="layer-value-badge" title={overridden ? `Changed in ${selected.name}` : 'Inherited from Default'}>{overridden ? 'Override' : 'Default'}</small>
}
export function InputUseBadge({ command, iconOnly = false }: { command?: string; iconOnly?: boolean }) {
  const uses = useInputUses(command)
  const { family = 'generic' } = useContext(LayerUsageContext)
  return uses.length ? <button type="button" className="input-use-badge" title={uses.join('\n')} aria-label={`Show uses of ${inputDisplayName(command ?? '', family)}`} onClick={event => { event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new CustomEvent('jsm:input-uses', { detail: command })) }}><LayerIcon />{!iconOnly && uses.map(use => /^(Hold|Toggle|Turn on|Turn off) /.test(use) ? use : use.split(':')[0]).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</button> : null
}
const buttons = inputDefinitions.filter(b => !/^(L|R|T)(UP|DOWN|LEFT|RIGHT|RING)$/.test(b.command))
/** Inputs whose modeshifts can be lifted into a layer. */
const modeshiftSources = buttons
// The uses inspector (Overview's X) is components/InputUsageInspector.tsx.
/** Layer actions belong to the input editor while remaining portable metadata. */
export function InputLayerActions({ command }: { command?: string }) {
  const { layers, actions, onSetActions, onSelect, disabled } = useContext(LayerUsageContext)
  const [verb, setVerb] = useState<LayerVerb>('hold')
  // Pressed, or released ("!X"): a layer held while a grip is let go.
  const [released] = useState(false)
  if (!command || !onSetActions) return null
  const mine = actionsOnInput(actions, command)
  const drop = (action: LayerAction) => onSetActions(command, mine.filter(a => a !== action))
  // One action per layer for each of press and release: a layer can be held
  // while the grip is squeezed and something else when it is let go.
  const add = (layerId: string) => {
    const input = withRelease(command, released)
    onSetActions(command, [...mine.filter(a => !(a.layerId === layerId && a.input === input)), { input, verb, layerId }])
  }
  return <div className="input-layer-actions">
    {mine.map((action, index) => <div className="layer-binding-row" key={action.layerId + action.verb + index}>
      <LayerIcon />
      <button type="button" disabled={disabled} onClick={() => onSelect?.(action.layerId)}>{describeAction(action, layers)}</button>
      <button type="button" disabled={disabled} aria-label={`Remove ${describeAction(action, layers)}`} onClick={() => drop(action)}>Remove</button>
    </div>)}
    <details><summary>Add layer action</summary>
      <small>Hold turns a layer on while this input is down. Toggle switches it on and off. Any number of inputs can drive the same layer.</small>
      {layers.length ? <div className="layer-binding-row">
        <AppSelect aria-label="Layer action" value={verb} disabled={disabled} onChange={e => setVerb(e.target.value as LayerVerb)}>
          {layerVerbOrder.map(v => <option key={v} value={v}>{layerVerbLabels[v]}</option>)}
        </AppSelect>
        <AppSelect aria-label="Layer action destination" value="" disabled={disabled} onChange={e => { if (e.target.value) add(e.target.value) }}>
          <option value="">Choose layer</option>
          {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </AppSelect>
      </div> : <p>Create a named layer using Manage layers, then assign it here.</p>}
    </details>
  </div>
}
export function LayerSelector({ layers, selected, onSelect, disabled, managing, onManage }: {
  layers: ConfigLayer[]; selected: string; onSelect: (id: string) => void; disabled?: boolean; managing: boolean; onManage: () => void
}) {
  const current = layers.find(layer => layer.id === selected)
  const choices = ['', ...layers.map(layer => layer.id)]
  const index = Math.max(0, choices.indexOf(selected))
  const step = (direction: number) => onSelect(choices[(index + direction + choices.length) % choices.length])
  return <section className="layer-selector" aria-label="Configuration layers">
    <div className="layer-selector-inner">
      <label className="layer-title" htmlFor="editing-layer"><LayerIcon /> Edit layer</label>
      <div className="layer-picker">
        <button type="button" className="layer-step" aria-label="Previous layer" title="Previous layer" disabled={disabled || !layers.length} onClick={() => step(-1)}>‹</button>
        <AppSelect id="editing-layer" className="layer-select" aria-label="Editing layer" value={current?.id ?? ''} disabled={disabled} onChange={event => onSelect(event.target.value)}>
          <option value="">Default</option>
          {layers.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
        </AppSelect>
        <button type="button" className="layer-step" aria-label="Next layer" title="Next layer" disabled={disabled || !layers.length} onClick={() => step(1)}>›</button>
      </div>
      <span className="layer-context" title={current ? 'Bound from an input with Add layer action' : 'Other layers inherit these bindings and settings'}>{current ? 'Inherits Default' : 'Base bindings'}</span>
      <button type="button" className="ghost-btn layer-manage" aria-expanded={managing} aria-controls="layer-management" onClick={onManage}>Manage layers</button>
    </div>
  </section>
}

/** Managing layers is naming, creating and deleting them. Nothing here binds a
 *  layer to an input: that is the configuration’s business, done from the input
 *  itself, so this deliberately offers no way to do it. */
export function LayerBar({ text, layers, selected, onChange, onSelect, disabled, family = 'generic', managing, onClose, presentation = 'dialog' }: {
  text: string; layers: ConfigLayer[]; selected: string; onChange: (text: string) => void; onSelect?: (id: string) => void
  disabled?: boolean; family?: ControllerVisualFamily; managing: boolean; onClose?: () => void; presentation?: 'dialog' | 'page'
}) {
  const [name, setName] = useState('')
  const [source, setSource] = useState('RSR')
  // A destructive confirmation (System States 17g) starts on Cancel: the
  // dialog's first control, which useKeyboardNav focuses when it appears.
  const [deleting, setDeleting] = useState<ConfigLayer | null>(null)
  const current = layers.find(layer => layer.id === selected)
  const taken = (value: string) => layers.some(layer => layer.name.toLowerCase() === value.toLowerCase())
  const duplicateName = !!name.trim() && (taken(name.trim()) || name.trim().toLowerCase() === 'default')
  const update = (layer: ConfigLayer) => onChange(writeLayers(text, layers.map(item => item.id === layer.id ? layer : item)))
  const moving = inputUsage(text, source, []).filter(use => use.kind === 'shift').length
  const remove = (layer: ConfigLayer) => { onChange(writeLayers(text, layers.filter(l => l.id !== layer.id))); if (layer.id === selected) onSelect?.('') }
  if (!managing) return null
  const dialog = presentation === 'dialog'
  const create = () => {
    const layer: ConfigLayer = { id: crypto.randomUUID(), name: name.trim(), overrides: {} }
    onChange(writeLayers(text, [...layers, layer]))
    onSelect?.(layer.id)
    setName('')
  }
  // The dialog is built from the shared primitives (modal-card, text-field,
  // button--*). Its controls used to be bare <input>/<button> elements, which
  // no stylesheet dresses, so they rendered as the browser's grey defaults.
  // Close is a ghost button so useKeyboardNav lands the pad on the name field
  // rather than on Close; B / Escape still reach it through data-modal-close.
  return <div className={dialog ? 'modal-overlay' : 'layers-page'}>
    <section id="layer-management" className={dialog ? 'modal-card layer-modal' : 'layer-page-content'} role={dialog ? 'dialog' : 'region'} aria-modal={dialog ? true : undefined}
      aria-labelledby={dialog ? 'layer-modal-title' : undefined} aria-label={dialog ? undefined : 'Layers'}>
      {dialog && <div className="modal-header">
        <h3 id="layer-modal-title">Layers</h3>
        <button type="button" className="ghost-btn" data-modal-close onClick={() => onClose?.()}>Close</button>
      </div>}
      <p className="modal-description layer-modal-note">
        A layer is a set of changes on top of Default. What turns one on is bound to an input,
        not kept here: open that input and use <strong>Add layer action</strong>.
      </p>

      <div className="layer-create">
        <label className="layer-field-label" htmlFor="new-layer-name">New layer</label>
        <div className="layer-create__row">
          <input id="new-layer-name" className="text-field" aria-label="New layer name" value={name} disabled={disabled} autoComplete="off"
            onChange={event => setName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && name.trim() && !duplicateName && !disabled) { event.preventDefault(); create() } }}
            placeholder="Comms or Vehicles" />
          <button type="button" className="button button--primary" disabled={disabled || !name.trim() || duplicateName} onClick={create}>Create layer</button>
        </div>
        {duplicateName && <small className="layer-create__error">Choose a unique layer name.</small>}
      </div>

      <div className="layer-modal-section">
        <span className="layer-eyebrow">Layers in this configuration</span>
        {layers.length ? <ul className="layer-list">
          {layers.map(layer => {
            const count = Object.keys(layer.overrides).length
            return <li key={layer.id} aria-current={layer.id === selected ? 'true' : undefined}>
              <div className="layer-list__row">
                {/* Selecting the editing layer is a click or Enter, never a focus:
                    the pad walking past a name field must not switch layers. */}
                <input className="text-field" aria-label="Layer name" defaultValue={layer.name} key={layer.id + layer.name} disabled={disabled}
                  onClick={() => onSelect?.(layer.id)}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onSelect?.(layer.id); event.currentTarget.blur() } }}
                  onBlur={event => {
                    const value = event.target.value.trim()
                    if (value && value.toLowerCase() !== 'default' && !layers.some(l => l.id !== layer.id && l.name.toLowerCase() === value.toLowerCase())) update({ ...layer, name: value })
                    else event.target.value = layer.name
                  }} />
                {layer.id === selected && <span className="layer-row__tag">Editing</span>}
                <button type="button" className="button button--danger button--sm" disabled={disabled} onClick={() => setDeleting(layer)}>Delete layer</button>
              </div>
              <details className="layer-list__overrides">
                <summary>{count} override{count === 1 ? '' : 's'} · Restore inheritance</summary>
                {count ? Object.entries(layer.overrides).map(([key, value]) => <div className="layer-override" key={key}>
                  <span className="layer-override__name" title={key}>{readableSetting(key)}</span><span className="layer-override__value">{value}</span>
                  <button type="button" className="button button--tertiary button--sm" disabled={disabled} onClick={() => {
                    const overrides = { ...layer.overrides }; delete overrides[key]; update({ ...layer, overrides })
                  }}>Use Default</button>
                </div>) : <p className="layer-list__none">Nothing changed yet. Make it the editing layer and change a binding or setting.</p>}
              </details>
            </li>
          })}
        </ul> : <p className="layer-empty">No layers yet. Create one, then bind it from an input.</p>}
      </div>

      {current && <div className="layer-from-modeshifts">
        <label>Move modeshifts into {current.name} from
          <AppSelect className="app-select" aria-label="Move modeshifts from" value={source} disabled={disabled}
            onChange={event => setSource(event.target.value)}>
            {modeshiftSources.map(button => <option key={button.command} value={button.command}>{inputDisplayName(button.command, family)}</option>)}
          </AppSelect>
          <small>Takes what this input already modeshifts and makes it this layer’s changes. Default keeps every other input.</small>
        </label>
        <button type="button" className="button button--secondary" disabled={disabled || !moving} onClick={() => {
          const layer = { ...current, overrides: { ...current.overrides } }
          const without = writeLayers(text, layers.filter(l => l.id !== layer.id))
          onChange(convertModeshifts(without, layer, source))
          onSelect?.(layer.id)
        }}>Move {moving} assignment{moving === 1 ? '' : 's'}</button>
      </div>}
    </section>
    {deleting && <DeleteLayerConfirm layer={deleting} onCancel={() => setDeleting(null)} onConfirm={() => { const layer = deleting; setDeleting(null); remove(layer) }} />}
  </div>
}

/** "Delete Comms?" (System States 17g): what goes with it, Cancel first. */
export function DeleteLayerConfirm({ layer, onCancel, onConfirm }: { layer: ConfigLayer; onCancel: () => void; onConfirm: () => void }) {
  const overrides = Object.keys(layer.overrides).length
  return (
    // Escape must preventDefault, or the same press also reaches the page's
    // own handler once the overlay is gone.
    <div className="modal-overlay modal-overlay--over" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel() } }}>
      <div className="modal-card confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-layer-title" aria-describedby="delete-layer-body">
        <h3 id="delete-layer-title">Delete {layer.name}?</h3>
        <p id="delete-layer-body">
          {overrides ? `Its ${overrides} override${overrides === 1 ? '' : 's'} go with it; ` : ''}the inputs that turn it on keep their other bindings. Nothing leaves your configuration until you save.
        </p>
        <div className="confirm-dialog__actions">
          <button type="button" className="button button--secondary" data-modal-close onClick={onCancel}>Cancel</button>
          <button type="button" className="button button--danger-solid" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}
