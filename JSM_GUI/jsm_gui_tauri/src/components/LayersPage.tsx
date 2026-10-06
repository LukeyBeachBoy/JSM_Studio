import { SummaryRow } from './ui/SummaryRow'
import { LayerOverrideRows } from './LayerOverrideRows'
import { visibleOverrideKeys } from '../utils/layers'
import { useEffect, useRef, useState } from 'react'
import { convertModeshifts, inputUsage, inputDefinitions, writeLayers, actionsForLayer, readLayerActions, describeLayerActivation, type ConfigLayer } from '../utils/layers'
import { type ControllerVisualFamily } from '../utils/controllerStatus'
import { inputDisplayName } from '../keymap/inputNames'
import { layerColor } from '../shell/TitleBar'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { AppSelect } from './ui/AppSelect'
import { DeleteLayerConfirm } from './LayerBar'
import type { LayerStack } from '../platform/desktopBridge'
import './Layers.css'

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
  // A destructive confirmation (System States 17g) starts on Cancel: the
  // dialog's first control, which useKeyboardNav focuses when it appears.
  const [deleting, setDeleting] = useState<ConfigLayer | null>(null)
  const rowsRef = useRef<HTMLDivElement | null>(null)
  const current = layers.find(layer => layer.id === selected)
  const actions = readLayerActions(text, layers)
  // X on a stack row makes it the editing layer (Configuration Pages 15e
  // "X Edit this layer"); A opens it as before.
  useEffect(() => {
    const host = rowsRef.current
    if (!host) return
    const onPad = (event: Event) => {
      if ((event as CustomEvent<PadEventDetail>).detail.button !== 'X') return
      const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-layer-id]')
      if (!row) return
      event.preventDefault()
      onSelect?.(row.dataset.layerId ?? '')
    }
    host.addEventListener(PAD_EVENT, onPad)
    return () => host.removeEventListener(PAD_EVENT, onPad)
  })
  const taken = (value: string) => layers.some(layer => layer.name.toLowerCase() === value.toLowerCase())
  const duplicateName = !!name.trim() && (taken(name.trim()) || name.trim().toLowerCase() === 'default')
  const update = (layer: ConfigLayer) => onChange(writeLayers(text, layers.map(item => item.id === layer.id ? layer : item)))
  const moving = inputUsage(text, source, []).filter(use => use.kind === 'shift').length
  const inputName = (command: string) => inputDisplayName(command, family)
  const boundBy = (layer: ConfigLayer) => describeLayerActivation(actions, layer.id, inputName, 'Not bound to an input yet')
  // Override keys are JSM names: an input reads as the pad names it, a label
  // annotation as what it labels, a setting as words.
  const overrideCount = (layer: ConfigLayer) => {
    const count = visibleOverrideKeys(layer.overrides).length
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
        <div className="layer-rows" ref={rowsRef}>
          <button type="button" className="layer-row" aria-current={!current ? 'true' : undefined} onClick={() => onSelect?.('')} disabled={disabled} data-layer-id="" data-hints="A:Edit;X:Edit this layer;B:Back">
            <span className="layer-row__swatch layer-row__swatch--base" aria-hidden="true" />
            <span className="layer-row__text"><span className="layer-row__name">Default</span><span className="layer-row__sub">Base bindings; every layer inherits them</span></span>
            {!current && <span className="layer-row__tag">Editing</span>}
          </button>
          {layers.map((layer, index) => <button type="button" key={layer.id} className="layer-row" aria-current={layer.id === selected ? 'true' : undefined} onClick={() => onSelect?.(layer.id)} disabled={disabled} data-layer-id={layer.id} data-hints="A:Edit;X:Edit this layer;B:Back">
            <span className="layer-row__swatch" style={{ background: layerColor(index) }} aria-hidden="true" />
            <span className="layer-row__text"><span className="layer-row__name">{layer.name}</span><span className="layer-row__sub">{boundBy(layer)}</span></span>
            <span className="layer-row__count">{overrideCount(layer)}</span>
            {layer.suppressHolds && <span className="layer-row__tag layer-row__tag--quiet">Suppresses holds</span>}
            {liveStack && <span className={`layer-row__state${activeIds.has(layer.id) ? ' layer-row__state--on' : ''}`}>{activeIds.has(layer.id) ? 'Active' : 'Inactive'}</span>}
            {layer.id === selected && <span className="layer-row__tag">Editing</span>}
          </button>)}
        </div>
        {/* TODO-50: creating a layer is the primary entry point of this section:
            a labelled card, a tall text field and the primary button. */}
        <div className="layer-new">
          <label className="layer-new__label" htmlFor="layers-page-new-layer">New layer</label>
          <input id="layers-page-new-layer" className="text-field" aria-label="New layer name" value={name} disabled={disabled} autoComplete="off" placeholder="e.g. Comms or Vehicles"
            onChange={event => setName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && name.trim() && !duplicateName) create() }} />
          <button type="button" className="button button--primary" disabled={disabled || !name.trim() || duplicateName} onClick={create}>Create layer</button>
          {duplicateName
            ? <small className="layer-new__error">Choose a unique layer name.</small>
            : <small className="layer-new__hint">Name it, then bind an input to turn it on.</small>}
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
            <button type="button" className="button button--danger" disabled={disabled} onClick={() => setDeleting(current)}>Delete layer</button>
          </div>
          <SummaryRow label="Suppress holds while active" disabled={disabled}
            hint={`While ${current.name} is applied, other layers� hold inputs do nothing. For a map or menu layer that a grip-held layer must not cover.`}
            toggle={{ on: !!current.suppressHolds, onChange: next => update({ ...current, suppressHolds: next || undefined }) }} />
          {visibleOverrideKeys(current.overrides).length
            ? <LayerOverrideRows overrides={current.overrides} inputName={inputName} disabled={disabled} onRestore={keys => {
                const overrides = { ...current.overrides }; keys.forEach(key => delete overrides[key]); update({ ...current, overrides })
              }} />
            : <p className="layer-empty">{current.name} changes nothing yet. Make it the editing layer and change a binding or setting.</p>}
          {modeshiftSources.some(input => inputUsage(text, input.command, []).some(use => use.kind === 'shift')) && <details className="layer-migration"><summary>Convert existing modeshifts to a layer</summary><div className="layer-from-modeshifts">
            <label>Move modeshifts into {current.name} from
              <AppSelect className="app-select" aria-label="Move modeshifts from" value={source} disabled={disabled}
                onChange={event => setSource(event.target.value)}>
                {modeshiftSources.map(button => <option key={button.command} value={button.command}>{inputName(button.command)}</option>)}
              </AppSelect>
              <small>For older profiles: moves the selected input’s alternate bindings and settings into this layer, then binds that input to hold it. Other inputs can then use the same layer. Save only after reviewing the result.</small>
            </label>
            {/* TODO-51: the label may wrap onto two lines when squeezed (Layers.css). */}
            <button type="button" className="button button--secondary layer-from-modeshifts__move" disabled={disabled || !moving} onClick={() => {
              const layer = { ...current, overrides: { ...current.overrides } }
              const without = writeLayers(text, layers.filter(l => l.id !== layer.id))
              onChange(convertModeshifts(without, layer, source))
              onSelect?.(layer.id)
            }}>Move {moving} assignment{moving === 1 ? '' : 's'}</button>
          </div></details>}
        </>}
      </section>
    </section>
    {deleting && <DeleteLayerConfirm layer={deleting} onCancel={() => setDeleting(null)}
      onConfirm={() => { const layer = deleting; setDeleting(null); onChange(writeLayers(text, layers.filter(l => l.id !== layer.id))); if (layer.id === selected) onSelect?.('') }} />}
  </div>
}
