import { useState } from 'react'
import { convertModeshifts, inputUsage, inputDefinitions, readableSetting, writeLayers, actionsForLayer, readLayerActions, type ConfigLayer, type LayerVerb } from '../utils/layers'
import { controllerButtonLabel, type ControllerVisualFamily } from '../utils/controllerStatus'
import { layerColor } from '../shell/TitleBar'
import { AppSelect } from './ui/AppSelect'
import type { LayerStack } from '../platform/desktopBridge'
import './Layers.css'

const VERB_PHRASE: Record<LayerVerb, string> = { hold: 'Held by', toggle: 'Toggled by', apply: 'Applied by', remove: 'Removed by' }
/** Inputs whose modeshifts can be lifted into a layer. */
const modeshiftSources = inputDefinitions.filter(b => !/^(L|R|T)(UP|DOWN|LEFT|RIGHT|RING)$/.test(b.command))

/** The Layers page (Configuration Pages 15e): which layer you are editing, the
 *  layers in the order they stack, and the selected layer's overrides. What
 *  turns a layer on is shown here but bound from the input, as everywhere. */
export function LayersPage({ text, layers, selected, onChange, onSelect, disabled, family, liveStack, liveProfileName }: {
  text: string; layers: ConfigLayer[]; selected: string; onChange: (text: string) => void; onSelect?: (id: string) => void
  disabled?: boolean; family: ControllerVisualFamily
  /** The mapper's live stack when it is running this configuration, else null. */
  liveStack?: LayerStack | null
  /** What the mapper is running, when it is not this configuration. */
  liveProfileName?: string | null
}) {
  const [name, setName] = useState('')
  const [source, setSource] = useState('RSR')
  const current = layers.find(layer => layer.id === selected)
  const actions = readLayerActions(text, layers)
  const taken = (value: string) => layers.some(layer => layer.name.toLowerCase() === value.toLowerCase())
  const duplicateName = !!name.trim() && (taken(name.trim()) || name.trim().toLowerCase() === 'default')
  const update = (layer: ConfigLayer) => onChange(writeLayers(text, layers.map(item => item.id === layer.id ? layer : item)))
  const moving = inputUsage(text, source, []).filter(use => use.kind === 'shift').length
  const inputName = (command: string) => {
    const button = inputDefinitions.find(b => b.command === command)
    return button ? controllerButtonLabel(button, family) : command
  }
  const boundBy = (layer: ConfigLayer) => {
    const mine = actionsForLayer(actions, layer.id)
    return mine.length ? mine.map(action => `${VERB_PHRASE[action.verb]} ${inputName(action.input)}`).join(' · ') : 'Not bound to an input yet'
  }
  const overrideCount = (layer: ConfigLayer) => {
    const count = Object.keys(layer.overrides).length
    return `${count} override${count === 1 ? '' : 's'}`
  }
  const activeIds = new Set(liveStack?.layers.map(layer => layer.id) ?? [])
  const indexOf = (id: string) => layers.findIndex(layer => layer.id === id)
  const suppressors = layers.filter(layer => layer.suppressHolds)
  const holdInputs = (layer: ConfigLayer) => actionsForLayer(actions, layer.id).filter(action => action.verb === 'hold').map(action => inputName(action.input))
  const create = () => {
    const layer: ConfigLayer = { id: crypto.randomUUID(), name: name.trim(), overrides: {} }
    onChange(writeLayers(text, [...layers, layer]))
    onSelect?.(layer.id)
    setName('')
  }

  return <div className="layers-page">
    <section id="layer-management" className="layer-page-content" aria-label="Layers">
      <div className="layer-cards">
        <div className="layer-card">
          <span className="layer-card__eyebrow">Editing</span>
          <AppSelect className="layer-card__select" aria-label="Layer to edit" value={current?.id ?? ''} disabled={disabled} onChange={event => onSelect?.(event.target.value)}>
            <option value="">Default</option>
            {layers.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
          </AppSelect>
          <p className="layer-card__note">Change it from the title bar or here. Editing a layer never turns it on.</p>
        </div>
        <div className="layer-card" aria-live="polite">
          <span className="layer-card__eyebrow">Active now · live</span>
          {liveStack ? <>
            <div className="layer-stack">
              <span className="layer-stack__item">Default</span>
              {liveStack.layers.map(live => <span key={live.id} className="layer-stack__item" style={{ color: indexOf(live.id) >= 0 ? layerColor(indexOf(live.id)) : undefined }}>
                <span className="layer-stack__sep" aria-hidden="true">›</span>{live.name}
              </span>)}
            </div>
            <p className="layer-card__note">{liveStack.layers.length
              ? `${liveStack.layers[liveStack.layers.length - 1].name} wins a conflict; the last layer on is on top.`
              : 'Only Default is on. Layers turn on from the inputs bound to them.'}</p>
          </> : <>
            <div className="layer-stack"><span className="layer-stack__item layer-stack__item--muted">{liveProfileName ? 'Not running' : 'Mapper not running'}</span></div>
            <p className="layer-card__note">{liveProfileName ? `The mapper is running ${liveProfileName}. Apply this configuration to see its layers live.` : 'Start the mapper to see which layers are on.'}</p>
          </>}
        </div>
      </div>

      <section id="layers-list" className="page-section" data-section="Layers">
        <h3 className="layer-eyebrow">Layers · stack order</h3>
        <div className="layer-rows">
          <button type="button" className="layer-row" aria-current={!current ? 'true' : undefined} onClick={() => onSelect?.('')} disabled={disabled}>
            <span className="layer-row__swatch layer-row__swatch--base" aria-hidden="true" />
            <span className="layer-row__text"><span className="layer-row__name">Default</span><span className="layer-row__sub">Base bindings; every layer inherits them</span></span>
            {!current && <span className="layer-row__tag">Editing</span>}
          </button>
          {layers.map((layer, index) => <button type="button" key={layer.id} className="layer-row" aria-current={layer.id === selected ? 'true' : undefined} onClick={() => onSelect?.(layer.id)} disabled={disabled}>
            <span className="layer-row__swatch" style={{ background: layerColor(index) }} aria-hidden="true" />
            <span className="layer-row__text"><span className="layer-row__name">{layer.name}</span><span className="layer-row__sub">{boundBy(layer)}</span></span>
            <span className="layer-row__count">{overrideCount(layer)}</span>
            {layer.suppressHolds && <span className="layer-row__tag layer-row__tag--quiet">Suppresses holds</span>}
            {liveStack && <span className={`layer-row__state${activeIds.has(layer.id) ? ' layer-row__state--on' : ''}`}>{activeIds.has(layer.id) ? 'Active' : 'Inactive'}</span>}
            {layer.id === selected && <span className="layer-row__tag">Editing</span>}
          </button>)}
        </div>
        <div className="layer-new">
          <input className="text-field" aria-label="New layer name" value={name} disabled={disabled} placeholder="New layer, e.g. Comms or Vehicles"
            onChange={event => setName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && name.trim() && !duplicateName) create() }} />
          <button type="button" className="button button--secondary" disabled={disabled || !name.trim() || duplicateName} onClick={create}>Create layer</button>
          {duplicateName && <small className="layer-new__error">Choose a unique layer name.</small>}
        </div>
        {suppressors.map(layer => {
          const others = layers.filter(other => other.id !== layer.id && holdInputs(other).length)
          return <p key={layer.id} className="layer-hint layer-hint--warn"><strong>{layer.name} suppresses holds while active</strong>{others.length ? ` · so ${others.map(other => `${holdInputs(other).join(' or ')} won’t hold ${other.name}`).join(', ')} while it is on.` : ' · no other layer is held from an input yet.'}</p>
        })}
        <p className="layer-hint">What turns a layer on is bound to an input, not kept here: open that input and use <strong>Add layer action</strong>.</p>
      </section>

      <section id="layers-overrides" className="page-section" data-section="Overrides">
        <h3 className="layer-eyebrow">Overrides{current ? ` · ${current.name}` : ''}</h3>
        {!current && <p className="layer-empty">Default is the base every layer starts from. Choose a layer to see what it changes.</p>}
        {current && <>
          <div className="layer-rename">
            <label className="layer-rename__field">Name
              <input className="text-field" aria-label="Layer name" defaultValue={current.name} key={current.id + current.name} disabled={disabled}
                onBlur={event => {
                  const value = event.target.value.trim()
                  if (value && value.toLowerCase() !== 'default' && !layers.some(l => l.id !== current.id && l.name.toLowerCase() === value.toLowerCase())) update({ ...current, name: value })
                  else event.target.value = current.name
                }} />
            </label>
            <button type="button" className="button button--danger" disabled={disabled}
              onClick={() => { onChange(writeLayers(text, layers.filter(l => l.id !== current.id))); onSelect?.('') }}>Delete layer</button>
          </div>
          <label className="layer-switch">
            <input type="checkbox" checked={!!current.suppressHolds} disabled={disabled}
              onChange={event => update({ ...current, suppressHolds: event.target.checked || undefined })} />
            <span className="layer-switch__text">
              <span>Suppress holds while active</span>
              <small>While {current.name} is applied, other layers’ hold inputs do nothing. For a map or menu layer that a grip-held layer must not cover.</small>
            </span>
          </label>
          {Object.keys(current.overrides).length
            ? <div className="layer-override-rows">{Object.entries(current.overrides).map(([key, value]) => <div className="layer-override" key={key}>
                <span className="layer-override__name" title={key}>{readableSetting(key)}</span>
                <span className="layer-override__value">{value}</span>
                <button type="button" className="button button--tertiary" disabled={disabled} onClick={() => {
                  const overrides = { ...current.overrides }; delete overrides[key]; update({ ...current, overrides })
                }}>Use Default</button>
              </div>)}</div>
            : <p className="layer-empty">{current.name} changes nothing yet. Make it the editing layer and change a binding or setting.</p>}
          <div className="layer-from-modeshifts">
            <label>Move modeshifts into {current.name} from
              <AppSelect className="app-select" aria-label="Move modeshifts from" value={source} disabled={disabled}
                onChange={event => setSource(event.target.value)}>
                {modeshiftSources.map(button => <option key={button.command} value={button.command}>{controllerButtonLabel(button, family)} ({button.command})</option>)}
              </AppSelect>
              <small>Takes what this input already modeshifts and makes it this layer’s changes. Default keeps every other input.</small>
            </label>
            <button type="button" className="button button--secondary" disabled={disabled || !moving} onClick={() => {
              const layer = { ...current, overrides: { ...current.overrides } }
              const without = writeLayers(text, layers.filter(l => l.id !== layer.id))
              onChange(convertModeshifts(without, layer, source))
              onSelect?.(layer.id)
            }}>Move {moving} assignment{moving === 1 ? '' : 's'}</button>
          </div>
        </>}
      </section>
    </section>
  </div>
}
