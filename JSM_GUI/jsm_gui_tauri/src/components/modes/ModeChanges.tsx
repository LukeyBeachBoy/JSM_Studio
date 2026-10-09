import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { SubPage } from '../ui/console'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import { actionsForLayer, convertModeshifts, inputDefinitions, inputUsage, layerHue, layerSlotOf, modeActivation, onVerbs, ordinal, readLayers, replaceLayerActions, writeLayers, type ConfigLayer, type LayerAction } from '../../utils/layers'
import { InputGlyph } from '../glyphs/InputGlyph'
import { inputDisplayName } from '../../keymap/inputNames'
import { ButtonCapture } from './ButtonCapture'
import { useDeleteGuard } from './deleteGuard'
import { Icon } from '../icons/Icon'
import { useShell } from '../../shell/ShellContext'
import { modeChangeRows } from './modeText'
import styles from './Modes.module.css'

// What changes in this mode (console v2, ModeChanges.dc.html): one row per
// change with what Default does instead, A to go to it, X to use Default; the
// Advanced rows (act when you let go, more buttons, bring in old While holding
// changes); and the mode's Y menu: rename, how it turns on and off, its place
// in the order, Try it, and Delete, confirmed in place with Keep it focused.

/** Inputs whose old "While holding" changes can be brought into a mode. */
const SHIFT_SOURCES = inputDefinitions.filter(input => !/^(L|R|T)(UP|DOWN|LEFT|RIGHT|RING)$/.test(input.command)).map(input => input.command)

type Props = {
  layer: ConfigLayer
  index: number
  layers: ConfigLayer[]
  text: string
  actions: LayerAction[]
  family: ControllerVisualFamily
  defaults: Readonly<Record<string, string>>
  focus?: 'menu' | 'advanced' | 'delete'
  onChange: (next: string | ((previous: string) => string)) => void
  onMove: (to: number) => void
  onRename: () => void
  onDelete: () => void
  onOpenHow: () => void
  onGoTo: (key: string) => void
  /** "See it on Layout": edit this layer's buttons there. */
  onEditOnLayout?: () => void
  onTry?: () => void
  tryReason?: string | null
  onClose: () => void
  disabled?: boolean
}

export function ModeChanges({ layer, index, layers, text, actions, family, defaults, focus, onChange, onMove, onRename, onDelete, onOpenHow, onGoTo, onEditOnLayout, onTry, tryReason, onClose, disabled }: Props) {
  const { t } = useTranslation()
  const shell = useShell()
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLElement>(null)
  const advanced = useRef<HTMLElement>(null)
  const [deleting, setDeleting] = useState(focus === 'delete')
  const guard = useDeleteGuard(deleting, () => setDeleting(false))
  const [adding, setAdding] = useState(false)
  const name = (command: string) => inputDisplayName(command, family)
  const slot = layerSlotOf(index)
  const hue = layerHue(slot)
  const rows = modeChangeRows(layer, defaults, family, t)
  const mine = actionsForLayer(actions, layer.id)
  const activation = modeActivation(actions, layer.id, name)
  const { primary } = activation
  const releasedAll = mine.length > 0 && mine.every(action => action.input.startsWith('!'))
  const sources = useMemo(() => SHIFT_SOURCES.map(command => ({ command, count: inputUsage(text, command, []).filter(use => use.kind === 'shift').length })).filter(source => source.count > 0), [text])
  const [source, setSource] = useState(0)
  const chosen = sources[Math.min(source, sources.length - 1)]

  const sentence = !primary ? 'Nothing turns it on yet'
    : primary.verb === 'hold' ? `On while you ${primary.input.startsWith('!') ? 'let go of' : 'hold'} ${name(primary.input.replace(/^!/, ''))}`
    : primary.verb === 'toggle' ? `${primary.input.startsWith('!') ? 'Let go of' : 'Tap'} ${name(primary.input.replace(/^!/, ''))} to turn it on and off`
    : `${name(primary.input.replace(/^!/, ''))} turns it on${activation.closes ? `; ${activation.closes.replace(/ closes$/, ' turns it off')}` : ''}`

  const restore = (keys: string[]) => onChange(previous => writeLayers(previous, readLayers(previous).map(item => {
    if (item.id !== layer.id) return item
    const overrides = { ...item.overrides }
    keys.forEach(key => delete overrides[key])
    return { ...item, overrides }
  })))
  const writeActions = (next: LayerAction[]) => onChange(previous => replaceLayerActions(previous, layer.id, next))
  const actWhenLetGo = (on: boolean) => writeActions(mine.map(action => ({ ...action, input: on ? `!${action.input.replace(/^!/, '')}` : action.input.replace(/^!/, '') })))
  const bringIn = () => {
    if (!chosen || disabled) return
    onChange(previous => {
      const current = readLayers(previous)
      const own = current.find(item => item.id === layer.id)
      if (!own) return previous
      const without = writeLayers(previous, current.filter(item => item.id !== layer.id))
      const converted = convertModeshifts(without, { ...own, overrides: { ...own.overrides } }, chosen.command)
      // convertModeshifts appends the mode; put it back in its place.
      const after = readLayers(converted)
      const moved = after.find(item => item.id === layer.id)!
      const ordered = after.filter(item => item.id !== layer.id)
      ordered.splice(current.findIndex(item => item.id === layer.id), 0, moved)
      return writeLayers(converted, ordered)
    })
  }

  // Where the page opens: the Y menu, the Advanced rows, or the first change.
  useEffect(() => {
    requestAnimationFrame(() => {
      const target = focus === 'menu' ? menu.current?.querySelector<HTMLElement>('button')
        : focus === 'advanced' ? advanced.current?.querySelector<HTMLElement>('button, [tabindex="0"]')
        : focus === 'delete' ? root.current?.querySelector<HTMLElement>('[data-keep]') : null
      target?.focus({ preventScroll: false })
    })
  }, [focus])

  // X uses Default on a change row; Y goes to the menu.
  const latest = useRef({ restore, rows })
  latest.current = { restore, rows }
  useEffect(() => {
    const node = root.current
    if (!node) return
    const onPad = (event: Event) => {
      if (event.defaultPrevented) return
      const button = (event as CustomEvent<PadEventDetail>).detail.button
      const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-change-key]')
      if (button === 'X' && row) {
        event.preventDefault()
        const found = latest.current.rows.find(item => item.key === row.dataset.changeKey)
        if (found) latest.current.restore(found.keys)
      } else if (button === 'Y') {
        event.preventDefault()
        menu.current?.querySelector<HTMLElement>('button')?.focus()
      }
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [])

  return (
    <SubPage open onClose={deleting ? () => setDeleting(false) : onClose} trail={['Layers', layer.name]} title="What changes in this layer"
      where={`${shell.configName ?? 'Configuration'} · Layers · ${layer.name}${deleting ? ' · Delete' : ''}`} badge={null} backLabel={deleting ? 'Keep it' : 'Back to Layers'}
      hints={deleting ? [{ button: 'A', label: 'Choose' }] : [{ button: 'Y', label: 'More' }]}>
      <div ref={root} className={styles.changesPage} style={{ '--mode-hue': hue, '--mode-soft': layerHue(slot, '-soft') } as CSSProperties}>
        <div className={styles.changesMain}>
          <header className={styles.subHead}>
            <span className={styles.bigSwatch} style={{ background: hue }} aria-hidden="true" />
            <div><h1>{layer.name}</h1><p>{sentence}. Everything not listed comes from Default.</p></div>
          </header>
          <h2 className={styles.label}>Changed in this layer · {rows.length}</h2>
          {rows.length ? <div className={styles.overrides}>
            {rows.map((row, position) => <button key={row.key} type="button" className={styles.ov} data-change-key={row.key} data-autofocus={!focus && position === 0 ? 'true' : undefined}
              data-hints={`A:Go to it;X:Use Default;Y:More;B:Back to Layers`} data-caption={`${row.name} · ${row.value} · Default: ${row.defaultValue}`}
              onClick={() => onGoTo(row.key)}>
              <span className={styles.ovName}>
                {row.input ? <span className={styles.pill}><InputGlyph command={row.input} family={family} size={22} /></span> : <span className={styles.pill}><Icon name="tuning" size={18} /></span>}
                <b>{row.name}</b>
              </span>
              <span className={styles.ovValue}><b>{row.value}{[...row.value.matchAll(/#([0-9a-f]{6})\b/gi)].map(match => <span key={match[1]} className={styles.colourChip} style={{ background: `#${match[1]}` }} role="img" aria-label={`Color #${match[1].toLowerCase()}`} />)}</b><small>Default: {row.defaultValue}</small></span>
              <span className={styles.ovAction}>Use Default</span>
            </button>)}
          </div> : <p className={styles.empty}>{layer.name} changes nothing yet. See it on Layout and change a button or a setting there.</p>}

          <section ref={advanced} className={styles.advanced} aria-label="Advanced">
            <h2 className={styles.label}>Advanced</h2>
            <button type="button" role="switch" aria-checked={releasedAll} className={styles.row} aria-disabled={!mine.length || disabled ? 'true' : undefined}
              data-reason={!mine.length ? 'Nothing turns it on yet' : undefined} data-hints="A:Switch;B:Back to Layers"
              data-caption="Act when you let go · The button works the other way round: on while it is up"
              onClick={() => { if (mine.length && !disabled) actWhenLetGo(!releasedAll) }}>
              <span className={styles.rowIcon} aria-hidden="true"><Icon name="undo" size={18} /></span>
              <span className={styles.rowText}><b>Act when you let go</b><span>{primary ? `On while ${name(primary.input.replace(/^!/, ''))} is up, off while you hold it` : 'Turns the layer’s buttons the other way round'}</span></span>
              <span className={styles.switch} data-on={releasedAll ? 'true' : undefined} aria-hidden="true"><span /></span>
            </button>
            <button type="button" className={styles.row} aria-disabled={disabled ? 'true' : undefined} data-hints="A:Add a button;X:Edit each one;B:Back to Layers"
              data-caption="More buttons · Any number of buttons can turn it on or off"
              onClick={() => { if (!disabled) setAdding(true) }}
              onKeyDown={(event: KeyboardEvent) => { if (event.key === 'x' || event.key === 'X') { event.preventDefault(); onOpenHow() } }}
              data-pad-keys="X">
              <span className={styles.rowIcon} aria-hidden="true"><Icon name="add" size={18} /></span>
              <span className={styles.rowText}><b>More buttons</b><span>Any number of buttons can turn it on or off</span></span>
              <span className={styles.rowValue}>
                {mine.map(action => <span key={action.input + action.verb} className={styles.pill} data-hue={onVerbs.includes(action.verb) ? '' : undefined}
                  title={undefined} aria-label={`${name(action.input.replace(/^!/, ''))} ${action.verb}`}><InputGlyph command={action.input.replace(/^!/, '')} family={family} size={20} /></span>)}
                + Add
              </span>
            </button>
            <div className={styles.row} tabIndex={0} role="group" data-arrows="horizontal" aria-disabled={!sources.length || disabled ? 'true' : undefined}
              data-reason={!sources.length ? 'This file has no chords to bring in' : undefined}
              data-hints={sources.length ? `MOVE:Choose a button;A:Bring in ${chosen?.count ?? 0};B:Back to Layers` : 'B:Back to Layers'}
              data-caption={`Bring in chords · A held button’s chords and mode shifts move here, then that button holds ${layer.name}`}
              onKeyDown={event => {
                if (event.target !== event.currentTarget) return
                if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && sources.length) { event.preventDefault(); event.stopPropagation(); setSource(value => (Math.min(value, sources.length - 1) + (event.key === 'ArrowRight' ? 1 : -1) + sources.length) % sources.length) }
                else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); bringIn() }
              }}
              onClick={bringIn}>
              <span className={styles.rowIcon} aria-hidden="true"><Icon name="modeshift" size={18} /></span>
              <span className={styles.rowText}><b>Bring in chords</b><span>A held button’s chords and mode shifts move here, then it holds {layer.name}</span></span>
              <span className={styles.rowValue}>{chosen ? <>From <button type="button" tabIndex={-1} data-nav-skip aria-label="Previous button" className={styles.arrowBtn} onClick={event => { event.stopPropagation(); setSource(value => (Math.min(value, sources.length - 1) - 1 + sources.length) % sources.length) }}>◂</button> {name(chosen.command)} <button type="button" tabIndex={-1} data-nav-skip aria-label="Next button" className={styles.arrowBtn} onClick={event => { event.stopPropagation(); setSource(value => (Math.min(value, sources.length - 1) + 1) % sources.length) }}>▸</button> · {chosen.count}</> : 'None'}</span>
            </div>
          </section>
        </div>

        <aside ref={menu} className={styles.menu} aria-label={`${layer.name} · More`}>
          <header className={styles.menuHead}><span className={styles.swatch} style={{ background: hue }} aria-hidden="true" /><b>{layer.name}</b><span className={styles.menuKey}>Y More</span></header>
          {!deleting ? <>
            {onEditOnLayout && <button type="button" className={styles.mi} data-hints="A:See it on Layout;B:Back to Layers" data-caption={`See it on Layout · The controller with ${layer.name}’s changes, where its buttons are edited`} onClick={onEditOnLayout}>
              <Icon name="overview" size={18} /><b>See it on Layout</b><small>Edit its buttons there</small>
            </button>}
            <button type="button" className={styles.mi} data-hints="A:Rename;B:Back to Layers" aria-disabled={disabled ? 'true' : undefined} onClick={() => { if (!disabled) onRename() }}>
              <Icon name="details" size={18} /><b>Rename</b><small>Opens the keyboard</small>
            </button>
            <button type="button" className={styles.mi} data-hints="A:Open;B:Back to Layers" onClick={onOpenHow}>
              <Icon name="layers" size={18} /><b>How it turns on and off</b><small>{primary ? `${({ hold: 'Hold', toggle: 'Tap', apply: 'Turn on', remove: 'Turn off' })[primary.verb]} ${name(primary.input.replace(/^!/, ''))}` : 'Not on a button yet'} ▸</small>
            </button>
            <div className={styles.mi} tabIndex={0} role="slider" data-arrows="horizontal" aria-valuemin={1} aria-valuemax={layers.length} aria-valuenow={index + 1} aria-valuetext={`${ordinal(index + 1)} of ${layers.length}`}
              aria-label="Move in order" data-hints="MOVE:Move;B:Back to Layers" data-caption="Move in order · Its place is its colour and where it sits on the layer strip"
              onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); if (!disabled) onMove(index + (event.key === 'ArrowRight' ? 1 : -1)) } }}>
              <Icon name="reorder" size={18} /><b>Move in order</b><small><button type="button" tabIndex={-1} data-nav-skip aria-label="Move earlier" className={styles.arrowBtn} onClick={() => { if (!disabled) onMove(index - 1) }}>◂</button> {ordinal(index + 1)} of {layers.length} <button type="button" tabIndex={-1} data-nav-skip aria-label="Move later" className={styles.arrowBtn} onClick={() => { if (!disabled) onMove(index + 1) }}>▸</button></small>
            </div>
            {onTry && <button type="button" className={styles.mi} aria-disabled={tryReason ? 'true' : undefined} data-reason={tryReason ?? undefined}
              data-hints={tryReason ? 'B:Back to Layers' : 'A:Try it;B:Back to Layers'} data-caption={`Try it · Runs the configuration with ${layer.name} on, until you return`}
              onClick={() => { if (!tryReason) onTry() }}>
              <Icon name="test" size={18} /><b>Try it</b><small>With {layer.name} on</small>
            </button>}
            <button type="button" className={`${styles.mi} ${styles.danger}`} data-delete-row="" data-hints="A:Delete…;B:Back to Layers" aria-disabled={disabled ? 'true' : undefined} onClick={() => { if (!disabled) setDeleting(true) }}>
              <Icon name="remove" size={18} /><b>Delete {layer.name}</b>
            </button>
          </> : <div ref={guard.ref} onKeyDown={guard.onKeyDown} className={styles.deletePanel} role="alertdialog" aria-labelledby="mode-delete-title" aria-describedby="mode-delete-body">
            <h3 id="mode-delete-title"><Icon name="remove" size={20} /> Delete {layer.name}?</h3>
            <p id="mode-delete-body">{rows.length ? `Its ${rows.length} change${rows.length === 1 ? '' : 's'} go with it. ` : ''}{primary ? `${name(primary.input.replace(/^!/, ''))} keeps its other actions. ` : ''}Nothing leaves the file until you save.</p>
            <button type="button" className={styles.keep} data-keep="" data-hints="A:Keep it;B:Keep it" onClick={() => setDeleting(false)}><b>Keep it</b><small>Nothing changes.</small></button>
            <button type="button" className={styles.deleteButton} data-delete="" data-hints="A:Delete;B:Keep it" onClick={onDelete}>Delete {layer.name}</button>
          </div>}
        </aside>
      </div>
      <ButtonCapture open={adding} trail={['Layers', layer.name, 'What changes in this layer']} title="More buttons"
        purpose={`${primary ? ({ hold: 'Holding', toggle: 'Tap to toggle', apply: 'Turn on', remove: 'Turn off' })[primary.verb] : 'Holding'} turns ${layer.name} on`}
        unavailable={command => mine.some(action => action.input.replace(/^!/, '') === command) ? `Already turns ${layer.name} on or off` : undefined}
        onPick={command => { setAdding(false); writeActions([...mine, { input: releasedAll ? `!${command}` : command, verb: primary?.verb ?? 'hold', layerId: layer.id }]) }}
        onClose={() => setAdding(false)} />
    </SubPage>
  )
}
