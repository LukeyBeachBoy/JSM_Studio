import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../../hooks/useTelemetry'
import type { LayerStack } from '../../platform/desktopBridge'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { requestValueEntry } from '../../nav/textEntry'
import { showToast } from '../../utils/toast'
import { actionsForLayer, defaultLayer, layerEntries, layerHue, layerSlotOf, modeActivation, readLayerActions, readLayers, reorderLayers, writeLayers, type ConfigLayer } from '../../utils/layers'
import { InputGlyph } from '../glyphs/InputGlyph'
import { inputDisplayName } from '../../keymap/inputNames'
import { ControllerMarks } from './ControllerMarks'
import { Icon } from '../icons/Icon'
import { ModeHow } from './ModeHow'
import { ModeChanges } from './ModeChanges'
import { MoreChip } from './MoreChip'
import { modeChangeRows } from './modeText'
import styles from './Modes.module.css'

// Layers (console v2, Modes.dc.html, "08 Modes (was Layers)"): Default and one
// card per layer, each saying what turns it on and what it changes, with the
// changed inputs drawn on the controller when the card has focus. A card is
// the way in: A opens what it changes (See it on Layout is a row there), X how
// it turns on and off, Y its menu (rename, order, delete). A "⋯" in the card's
// corner gives the mouse the same X / Y menu.

/** "Two modes on at once? The one you turned on last wins." (the page header's right side). */
export function ModesCallout() {
  return <p className={styles.callout}>Two layers on at once? <b>The last one turned on wins.</b></p>
}

export type ModesPageProps = {
  /** The configuration as the editor holds it, modes included. */
  text: string
  layers: ConfigLayer[]
  /** The mode being edited ('' is Default). */
  selected: string
  /** Default with its imports resolved: what "Default: …" reads. */
  defaultText: string
  onChange: (next: string | ((previous: string) => string)) => void
  /** A on a card: edit that mode on Layout. */
  onEditOnLayout: (layerId: string) => void
  /** A on a change: go to that input or setting, in that mode. */
  onGoTo: (layerId: string, key: string) => void
  /** X Try it (D13): test the configuration with this mode on. */
  onTry?: (layerId: string) => void
  tryReason?: string | null
  disabled?: boolean
  family: ControllerVisualFamily
  device?: TelemetryDevice
  /** The mapper's live stack when it is running this configuration, else null. */
  liveStack?: LayerStack | null
  /** What the mapper is running, when it is not this configuration. */
  liveProfileName?: string | null
}

type Open = { kind: 'how'; id: string } | { kind: 'changes'; id: string; focus?: 'menu' | 'advanced' | 'delete' }

const TEMPLATES = ['Build', 'Photo']

export function ModesPage(props: ModesPageProps) {
  const { text, layers, defaultText, onChange, family, device, liveStack, liveProfileName, disabled } = props
  const { t } = useTranslation()
  const [open, setOpen] = useState<Open | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const actions = useMemo(() => readLayerActions(text, layers), [text, layers])
  const defaults = useMemo(() => layerEntries(defaultLayer(defaultText)), [defaultText])
  const name = (command: string) => inputDisplayName(command, family)
  const activeIds = new Set(liveStack?.layers.map(layer => layer.id) ?? [])

  const taken = (value: string, except?: string) => value.toLowerCase() === 'default' || layers.some(layer => layer.id !== except && layer.name.toLowerCase() === value.toLowerCase())
  const uniqueName = (base: string) => { let candidate = base; for (let n = 2; taken(candidate); n++) candidate = `${base} ${n}`; return candidate }
  const create = (base: string) => {
    if (disabled) return
    const layer: ConfigLayer = { id: crypto.randomUUID(), name: uniqueName(base), overrides: {} }
    onChange(previous => writeLayers(previous, [...readLayers(previous), layer]))
    requestAnimationFrame(() => requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-mode-id="${CSS.escape(layer.id)}"]`)?.focus()))
  }
  const createNamed = () => requestValueEntry({
    title: 'Name the new layer', eyebrow: 'Layers · Add a layer', hint: 'Driving, the map, a build menu: what it is for.',
    suggestions: ['Vehicles', 'Map', 'Comms', 'Build', 'Photo', 'Menu'].filter(item => !taken(item)),
    value: '', onDone: value => {
      const trimmed = value.trim()
      if (!trimmed) return
      if (taken(trimmed)) { showToast(`There is already a layer called ${trimmed}. Choose another name.`, 'error'); return }
      create(trimmed)
    },
  })
  const rename = (layer: ConfigLayer) => requestValueEntry({
    title: `Rename ${layer.name}`, eyebrow: 'Layers · Rename', value: layer.name, hint: 'Shown on the layer strip, the cards and the overlay.',
    onDone: value => {
      const trimmed = value.trim()
      if (!trimmed || trimmed === layer.name) return
      if (taken(trimmed, layer.id)) { showToast(`Choose a name no other layer uses, and not "Default".`, 'error'); return }
      onChange(previous => writeLayers(previous, readLayers(previous).map(item => item.id === layer.id ? { ...item, name: trimmed } : item)))
    },
  })
  const move = (id: string, to: number) => onChange(previous => reorderLayers(previous, readLayers(previous), id, to))
  const remove = (layer: ConfigLayer) => { onChange(previous => writeLayers(previous, readLayers(previous).filter(item => item.id !== layer.id))); setOpen(null) }

  // X and Y on a card: how it turns on, and its menu.
  useEffect(() => {
    const host = grid.current
    if (!host) return
    const onPad = (event: Event) => {
      const button = (event as CustomEvent<PadEventDetail>).detail.button
      if (button !== 'X' && button !== 'Y') return
      const id = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-mode-id]')?.dataset.modeId
      if (!id) return
      event.preventDefault()
      setOpen(button === 'X' ? { kind: 'how', id } : { kind: 'changes', id, focus: 'menu' })
    }
    host.addEventListener(PAD_EVENT, onPad)
    return () => host.removeEventListener(PAD_EVENT, onPad)
  }, [])

  // A sub-page closed: the pad lands back on the card it was opened from.
  const lastOpen = useRef<string | null>(null)
  useEffect(() => {
    if (open) { lastOpen.current = open.id; return }
    const id = lastOpen.current
    lastOpen.current = null
    if (id) requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-mode-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }))
  }, [open])

  // The mapper reports a layer by id and a short name; the card's full name is the one to show.
  const fullName = (live: { id: string; name: string }) => layers.find(layer => layer.id === live.id)?.name ?? live.name
  const status = liveStack
    ? liveStack.layers.length
      ? <><span className={styles.liveDot} aria-hidden="true" /><b>{liveStack.layers.map(fullName).join(' · ')}</b> {liveStack.layers.length === 1 ? 'is on now' : 'are on now'}{liveStack.layers.length > 1 ? `; ${fullName(liveStack.layers[liveStack.layers.length - 1])} wins a conflict` : ''}.</>
      : <><span className={styles.liveDot} aria-hidden="true" />Only Default is on. A layer turns on from its button.</>
    : liveProfileName
      ? <><b>Not running</b> · the mapper is running {liveProfileName}. Make this configuration live to see its layers turn on.</>
      : <><b>Mapper not running</b> · start it to see which layers are on.</>

  const current = open ? layers.find(layer => layer.id === open.id) : undefined
  const index = current ? layers.indexOf(current) : -1
  // Try it from a sub-page: the sub-page closes first, so the test banner and
  // the shell's own hints are what is on screen, not "B Back to Layers".
  const tryLayer = props.onTry && current ? () => { const id = current.id; setOpen(null); props.onTry?.(id) } : undefined
  return (
    <div className={styles.page} data-modes-page="">
      <p className={styles.status} role="status" aria-live="polite">{status}</p>
      <div ref={grid} className={styles.grid} role="list" aria-label="Layers">
        <button type="button" className={styles.card} data-mode-id="" data-default="" role="listitem" aria-current={!props.selected ? 'true' : undefined}
          data-hints="A:See it on Layout;B:Back" data-caption="Default · Always underneath. Every layer starts from here."
          onClick={() => props.onEditOnLayout('')} onFocus={() => setFocused('')}>
          <span className={styles.cardHead}><span className={styles.swatch} data-base="" aria-hidden="true" /><b className={styles.cardName}>Default</b></span>
          <span className={styles.cardText}>Always underneath. Every layer starts from here.</span>
        </button>
        {layers.map((layer, position) => {
          const slot = layerSlotOf(position)
          const hue = layerHue(slot)
          const activation = modeActivation(actions, layer.id, name)
          const rows = modeChangeRows(layer, defaults, family, t)
          const holders = layers.filter(other => other.id !== layer.id).flatMap(other => actionsForLayer(actions, other.id).filter(action => action.verb === 'hold').map(action => ({ input: name(action.input.replace(/^!/, '')), mode: other.name })))
          const on = activeIds.has(layer.id)
          const isFocused = focused === layer.id
          return (
            <div key={layer.id} className={`${styles.cardHost} more-host`} role="listitem">
            <button type="button" className={styles.card} data-mode-id={layer.id} aria-current={props.selected === layer.id ? 'true' : undefined}
              style={{ '--mode-hue': hue, '--mode-soft': layerHue(slot, '-soft') } as CSSProperties}
              data-hints={`A:What changes;X:How it turns on;Y:Rename · colour · delete;B:Back`}
              data-caption={`${layer.name} · ${activation.primary ? `${name(activation.primary.input.replace(/^!/, ''))} ${activation.phrase.toLowerCase()}` : activation.phrase} · ${rows.length} change${rows.length === 1 ? '' : 's'}`}
              aria-label={`${layer.name}${on ? ', on now' : ''}`}
              onClick={() => setOpen({ kind: 'changes', id: layer.id })} onFocus={() => setFocused(layer.id)} onBlur={() => setFocused(current => current === layer.id ? null : current)}>
              <span className={styles.cardHead}>
                <span className={styles.swatch} style={{ background: hue }} aria-hidden="true" />
                <b className={styles.cardName}>{layer.name}</b>
                {on && <span className={styles.onNow}>● on now</span>}
              </span>
              <span className={styles.activation}>
                {activation.primary
                  ? <><span className={styles.pill} data-hue=""><InputGlyph command={activation.primary.input.replace(/^!/, '')} family={family} size={20} /></span>
                    <span>{activation.phrase}{activation.closes && <span className={styles.muted}> · {activation.closes}</span>}{activation.on.length > 1 && <span className={styles.muted}> · +{activation.on.length - 1} more</span>}</span></>
                  : <span className={styles.muted}>No button yet</span>}
              </span>
              {isFocused && rows.some(row => row.input) && <span className={styles.cardArt}>
                <ControllerMarks device={device} width={190} marks={rows.filter(row => row.input).map(row => ({ command: row.input!, color: hue }))} />
              </span>}
              <span className={styles.changes}>
                {rows.slice(0, isFocused ? 5 : 6).map(row => <span key={row.key} className={styles.change}>
                  <span className={styles.pill}>{row.input ? <InputGlyph command={row.input} family={family} size={20} /> : <Icon name="tuning" size={18} />}</span>
                  <span className={styles.changeText}>{row.input ? row.short : `${row.name} ${row.short}`}</span>
                </span>)}
                {rows.length > (isFocused ? 5 : 6) && <span className={styles.more}>+{rows.length - (isFocused ? 5 : 6)} more · Y to see them all</span>}
                {!rows.length && <span className={styles.muted}>No changes yet</span>}
              </span>
              {layer.suppressHolds && <span className={styles.note}>
                Holds are paused while {layer.name} is on, so a held button can’t get stuck.
                {holders.length > 0 && <> {holders.map(holder => `${holder.input} won’t hold ${holder.mode}`).join(', ')} while it’s on.</>}
              </span>}
            </button>
            <MoreChip label={`More for ${layer.name}`} />
            </div>
          )
        })}
        <section className={styles.addCard} role="listitem" aria-label="Add a layer">
          <button type="button" className={styles.addTile} aria-disabled={disabled ? 'true' : undefined} data-hints="A:Name it;B:Back"
            data-caption="New layer · name it, then choose the button that turns it on" onClick={createNamed}>
            <span className={styles.addPlus} aria-hidden="true">+</span>
            <b>New layer</b>
            <small>Name it, then pick its button</small>
          </button>
          <span className={styles.addChips} aria-label="Start from">
            <span className={styles.addFrom}>Start from</span>
            {TEMPLATES.map(template => <button key={template} type="button" className={styles.chip} aria-disabled={disabled ? 'true' : undefined}
              data-hints="A:Add;B:Back" data-caption={`${template} · an empty layer called ${uniqueName(template)}, in the next colour`} onClick={() => create(template)}>{template}</button>)}
          </span>
        </section>
      </div>
      {current && open?.kind === 'how' && <ModeHow layer={current} index={index} layers={layers} text={text} actions={actions} family={family} defaults={defaults}
        onChange={onChange} onClose={() => setOpen(null)} onMove={to => move(current.id, to)}
        onOpenChanges={focus => setOpen({ kind: 'changes', id: current.id, focus })} onTry={tryLayer} tryReason={props.tryReason} disabled={disabled} />}
      {current && open?.kind === 'changes' && <ModeChanges layer={current} index={index} layers={layers} text={text} actions={actions} family={family} defaults={defaults} focus={open.focus}
        onChange={onChange} onClose={() => setOpen(null)} onMove={to => move(current.id, to)} onRename={() => rename(current)} onDelete={() => remove(current)}
        onOpenHow={() => setOpen({ kind: 'how', id: current.id })} onGoTo={key => { setOpen(null); props.onGoTo(current.id, key) }}
        onEditOnLayout={() => { setOpen(null); props.onEditOnLayout(current.id) }}
        onTry={tryLayer} tryReason={props.tryReason} disabled={disabled} />}
    </div>
  )
}
