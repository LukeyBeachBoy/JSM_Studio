import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { SubPage, OpenRow } from '../ui/console'

import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import { actionsForLayer, layerHue, layerHueName, layerSlotOf, modeActivation, onVerbs, ordinal, readLayers, replaceLayerActions, writeLayers, type ConfigLayer, type LayerAction, type LayerVerb } from '../../utils/layers'
import { InputGlyph } from '../glyphs/InputGlyph'
import { inputDisplayName } from '../../keymap/inputNames'
import { ButtonCapture } from './ButtonCapture'
import { Icon, type IconName } from '../icons/Icon'
import { useShell } from '../../shell/ShellContext'
import { inputLong, listWords, modeChangeRows } from './modeText'
import styles from './Modes.module.css'

// How a mode turns on and off (console v2, ModeHow.dc.html): what turns it on
// (Holding · Tap to toggle · Turn on) and with which button, what turns it off,
// whether it pauses other modes' holds, and where it sits in the order (LT/RT),
// which is also its colour. Several buttons with different verbs are listed as
// rows, one per button, each with its own verb.

const VERB_TILES: { verb: LayerVerb; label: string; caption: string; icon: IconName }[] = [
  { verb: 'hold', label: 'Holding', caption: 'On while you hold it', icon: 'modeshift' },
  { verb: 'toggle', label: 'Tap to toggle', caption: 'Tap on, tap off', icon: 'redo' },
  { verb: 'apply', label: 'Turn on', caption: 'Stays on until turned off', icon: 'apply' },
]
const VERB_WORD: Record<LayerVerb, string> = { hold: 'Holding', toggle: 'Tap to toggle', apply: 'Turn on', remove: 'Turn off' }

type Props = {
  layer: ConfigLayer
  index: number
  layers: ConfigLayer[]
  text: string
  actions: LayerAction[]
  family: ControllerVisualFamily
  defaults: Readonly<Record<string, string>>
  onChange: (next: string | ((previous: string) => string)) => void
  onMove: (to: number) => void
  onOpenChanges: (focus?: 'menu' | 'advanced') => void
  onTry?: () => void
  tryReason?: string | null
  onClose: () => void
  disabled?: boolean
}

export function ModeHow({ layer, index, layers, actions, family, defaults, onChange, onMove, onOpenChanges, onTry, tryReason, onClose, disabled }: Props) {
  const { t } = useTranslation()
  const shell = useShell()
  const root = useRef<HTMLDivElement>(null)
  const [capture, setCapture] = useState<null | { purpose: 'primary' | 'add' | 'off'; verb?: LayerVerb; replace?: string }>(null)
  const name = (command: string) => inputDisplayName(command, family)
  const slot = layerSlotOf(index)
  const hue = layerHue(slot)
  const mine = actionsForLayer(actions, layer.id)
  const activation = modeActivation(actions, layer.id, name)
  const { primary, on, off } = activation
  const several = on.length > 1
  const rows = modeChangeRows(layer, defaults, family, t)
  const changed = [...new Set(rows.filter(row => row.input).map(row => inputLong(row.input!, family, t).replace(/^(\w)/, c => c)))]
  const write = (next: LayerAction[]) => onChange(previous => replaceLayerActions(previous, layer.id, next))
  const setVerb = (verb: LayerVerb) => {
    if (disabled) return
    if (!primary) { setCapture({ purpose: 'primary', verb }); return }
    write(mine.map(action => action === primary ? { ...action, verb } : action))
  }
  const pick = (command: string) => {
    const request = capture
    setCapture(null)
    if (!request) return
    if (request.purpose === 'off') { write([...mine.filter(action => !(action.verb === 'remove' && action.input === command)), { input: command, verb: 'remove', layerId: layer.id }]); return }
    if (request.purpose === 'add') { write([...mine, { input: command, verb: primary?.verb ?? 'hold', layerId: layer.id }]); return }
    if (request.replace !== undefined) { write(mine.map(action => action.input === request.replace && onVerbs.includes(action.verb) ? { ...action, input: action.input.startsWith('!') ? `!${command}` : command } : action)); return }
    if (primary) write(mine.map(action => action === primary ? { ...action, input: primary.input.startsWith('!') ? `!${command}` : command } : action))
    else write([...mine, { input: command, verb: request.verb ?? 'hold', layerId: layer.id }])
  }
  const usedElsewhere = (command: string) => {
    const own = mine.find(action => action.input.replace(/^!/, '') === command)
    if (!own) return undefined
    if (capture?.purpose === 'off') return own.verb === 'remove' ? `Already turns ${layer.name} off` : `Already turns ${layer.name} on`
    return own.verb === 'remove' ? `Already turns ${layer.name} off` : capture?.replace === own.input ? undefined : `Already turns ${layer.name} on`
  }
  const verb = primary?.verb
  const helpLine = !primary ? 'Choose how it turns on, then press the button that does it.'
    : verb === 'hold' ? `Good for driving: let go of ${name(primary.input.replace(/^!/, ''))} and you’re back on foot.`
    : verb === 'toggle' ? `Good for a map: tap ${name(primary.input.replace(/^!/, ''))} to open it, tap again to close it.`
    : `Good for a build menu: it stays on until another button turns it off.`

  // X is Try it, Y the mode's menu (rename, delete), wherever a row does not
  // answer them itself.
  const latest = useRef({ onTry, tryReason, onOpenChanges, clearOff: () => write(mine.filter(action => action.verb !== 'remove')), hasOff: off.length > 0 })
  latest.current = { onTry, tryReason, onOpenChanges, clearOff: () => write(mine.filter(action => action.verb !== 'remove')), hasOff: off.length > 0 }
  useEffect(() => {
    const node = root.current
    if (!node) return
    const onPad = (event: Event) => {
      if (event.defaultPrevented) return
      const button = (event as CustomEvent<PadEventDetail>).detail.button
      const { onTry, tryReason, onOpenChanges, clearOff, hasOff } = latest.current
      if (button === 'X' && (event.target as HTMLElement | null)?.closest('[data-off-tile]') && hasOff) { event.preventDefault(); clearOff() }
      else if (button === 'X' && onTry && !tryReason) { event.preventDefault(); onTry() }
      else if (button === 'Y') { event.preventDefault(); onOpenChanges('menu') }
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [])

  const stack = [...layers.map((item, position) => ({ item, position }))].reverse()
  return (
    <SubPage open onClose={onClose} trail={['Layers', layer.name]} title="How it turns on and off" where={`${shell.configName ?? 'Configuration'} · Layers · ${layer.name} · On and off`}
      badge={null} backLabel="Back to Layers" stepLabel="Move in order" onStep={direction => onMove(index - direction)}
      hints={[{ button: 'A', label: 'Choose' }, ...(onTry ? [{ button: 'X' as const, label: 'Try it' }] : []), { button: 'Y', label: 'Rename · delete' }]}>
      <div ref={root} className={styles.how} style={{ '--mode-hue': hue, '--mode-soft': layerHue(slot, '-soft') } as CSSProperties}>
        <div className={styles.howMain}>
          <header className={styles.subHead}>
            <span className={styles.bigSwatch} style={{ background: hue }} aria-hidden="true" />
            <div><h1>{layer.name}</h1><p>{changed.length ? `Changes ${listWords(changed.map(item => item.charAt(0).toLowerCase() + item.slice(1)).map((item, i) => i === 0 ? item.charAt(0).toUpperCase() + item.slice(1) : item))} while it’s on` : 'Changes nothing yet: edit it on Layout with this layer chosen'}</p></div>
          </header>

          {!several ? <section className={styles.panel} data-focus-panel="" aria-label="Turn it on by">
            <h2>Turn it on by</h2>
            <div className={styles.tiles} role="radiogroup" aria-label="Turn it on by">
              {VERB_TILES.map(tile => <button key={tile.verb} type="button" role="radio" aria-checked={verb === tile.verb} className={styles.tile} data-current={verb === tile.verb ? 'true' : undefined}
                data-autofocus={verb === tile.verb || (!verb && tile.verb === 'hold') ? 'true' : undefined}
                aria-disabled={disabled ? 'true' : undefined} data-hints={`A:${primary ? 'Choose' : 'Choose, then press a button'};${onTry ? 'X:Try it;' : ''}Y:Rename · delete;B:Back to Layers`}
                data-caption={`${tile.label} · ${tile.caption}`} onClick={() => setVerb(tile.verb)}>
                <b><Icon name={tile.icon} size={18} /> {tile.label}</b><span>{tile.caption}</span>
              </button>)}
            </div>
            <p className={styles.helpLine}>{helpLine}</p>
          </section> : <section className={styles.panel} aria-label="Turned on by several buttons">
            <h2>Turned on by {on.length} buttons</h2>
            <p className={styles.helpLine}>Each button has its own way. ◂ ▸ changes it; X takes the button off.</p>
            {on.map(action => <VerbRow key={action.input + action.verb} action={action} family={family} disabled={disabled}
              onVerb={next => write(mine.map(item => item === action ? { ...item, verb: next } : item))}
              onRemove={() => write(mine.filter(item => item !== action))}
              onReplace={() => setCapture({ purpose: 'primary', replace: action.input })} />)}
            <OpenRow label="Another button" hint="Any number of buttons can turn it on" value="+ Add" onOpen={() => setCapture({ purpose: 'add' })} hints="A:Press a button;B:Back to Layers" />
          </section>}

          {!several && <button type="button" className={styles.row} aria-disabled={disabled ? 'true' : undefined}
            data-hints={`A:${primary ? 'Press a new one' : 'Press a button'};${on.length ? 'X:Another button too;' : ''}B:Back to Layers`}
            data-caption="With this button · Press a new one to change it"
            onClick={() => { if (!disabled) setCapture({ purpose: 'primary', verb: verb ?? 'hold' }) }}>
            <span className={styles.rowText}><b>With this button</b><span>{primary ? 'Press a new one to change it' : 'Nothing turns it on yet: press A, then the button'}</span></span>
            {primary ? <span className={styles.rowValue}><span className={styles.pill} data-hue=""><InputGlyph command={primary.input.replace(/^!/, '')} family={family} size={20} /></span>{inputLong(primary.input.replace(/^!/, ''), family, t)}{primary.input.startsWith('!') ? ' · let go' : ''}</span>
              : <span className={styles.rowValue}>Choose ▸</span>}
          </button>}

          <section className={styles.panel} aria-label="Turned off by">
            <h2>Turned off by</h2>
            <div className={styles.tiles}>
              <button type="button" className={styles.tile} data-current={verb === 'hold' ? 'true' : undefined} aria-disabled="true"
                data-reason={verb === 'hold' ? 'Comes with Holding: letting go turns it off' : 'Comes with Holding'} data-caption="Letting go · Comes with Holding">
                <b>{verb === 'hold' && <span aria-hidden="true">✓ </span>}Letting go</b><span>Comes with Holding</span>
              </button>
              <button type="button" className={styles.tile} data-current={verb === 'toggle' ? 'true' : undefined} aria-disabled="true"
                data-reason={verb === 'toggle' ? 'Comes with Tap to toggle: tapping again turns it off' : 'Comes with Tap to toggle'} data-caption="Tapping again · Comes with Tap to toggle">
                <b>{verb === 'toggle' && <span aria-hidden="true">✓ </span>}Tapping again</b><span>Comes with Tap to toggle</span>
              </button>
              <button type="button" className={styles.tile} data-current={off.length ? 'true' : undefined} aria-disabled={disabled ? 'true' : undefined}
                data-hints={`A:${off.length ? 'Add another' : 'Press a button'};${off.length ? 'X:Clear;' : ''}B:Back to Layers`}
                data-caption="Another button · e.g. View leaves the map"
                onClick={() => { if (!disabled) setCapture({ purpose: 'off' }) }}
                data-off-tile="">
                <b>{off.length > 0 && <span aria-hidden="true">✓ </span>}Another button</b>
                <span>{off.length ? `${listWords([...new Set(off.map(action => name(action.input.replace(/^!/, ''))))])} turns it off` : 'e.g. View leaves the map'}</span>
              </button>
            </div>
            {verb === 'apply' && !off.length && <p className={styles.warn} role="status">Nothing turns {layer.name} off yet. Choose Another button.</p>}
          </section>

          <button type="button" role="switch" aria-checked={!!layer.suppressHolds} className={styles.row} aria-disabled={disabled ? 'true' : undefined}
            data-hints={`A:Turn ${layer.suppressHolds ? 'off' : 'on'};${onTry ? 'X:Try it;' : ''}Y:Rename · delete;B:Back to Layers`}
            data-caption={`Pause holds while it’s on · Other layers’ hold buttons do nothing until ${layer.name} is off, so a held button can’t get stuck`}
            onClick={() => { if (!disabled) onChange(previous => writeLayers(previous, readLayers(previous).map(item => item.id === layer.id ? { ...item, suppressHolds: !layer.suppressHolds || undefined } : item))) }}>
            <span className={styles.rowText}><b>Pause holds while it’s on</b><span>Other layers’ hold buttons do nothing until it’s off</span></span>
            <span className={styles.switch} data-on={layer.suppressHolds ? 'true' : undefined} aria-hidden="true"><span /></span>
          </button>
          <OpenRow label="Advanced" hint="Act when you let go · more buttons · bring in chords" onOpen={() => onOpenChanges('advanced')} hints="A:Open;B:Back to Layers" />
        </div>

        <aside className={styles.order} aria-label="Order">
          <header><span className={styles.label}>Order</span><span className={styles.orderKeys}>LT up · RT down</span></header>
          {/* The one reorder control: ◂ ▸ (or LT/RT anywhere on the page) move the
              layer; the list below shows where it sits and the colour it wears there. */}
          <div className={`${styles.row} ${styles.orderRow}`} tabIndex={0} role="slider" data-arrows="horizontal" aria-valuemin={1} aria-valuemax={layers.length} aria-valuenow={index + 1}
            aria-valuetext={`${ordinal(index + 1)} of ${layers.length} · ${layerHueName(slot)}`} aria-label="Move in order" aria-disabled={disabled ? 'true' : undefined}
            data-hints="MOVE:Move;B:Back to Layers" data-caption={`Move in order · ${ordinal(index + 1)} of ${layers.length} · its place is its colour and where it sits on the layer strip`}
            onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); if (!disabled) onMove(index + (event.key === 'ArrowRight' ? 1 : -1)) } }}>
            <span className={styles.bigSwatch} style={{ background: hue, margin: 0 }} aria-hidden="true" />
            <span className={styles.rowText}><b>Move in order</b><span>Colour · {layerHueName(slot)}</span></span>
            <span className={styles.rowValue}><button type="button" tabIndex={-1} data-nav-skip aria-label="Move earlier" className={styles.arrowBtn} onClick={() => { if (!disabled) onMove(index - 1) }}>◂</button> {ordinal(index + 1)} of {layers.length} <button type="button" tabIndex={-1} data-nav-skip aria-label="Move later" className={styles.arrowBtn} onClick={() => { if (!disabled) onMove(index + 1) }}>▸</button></span>
          </div>
          <ol className={styles.stack} aria-label="Layers, last on top">
            {stack.map(({ item, position }) => <li key={item.id} data-current={item.id === layer.id ? 'true' : undefined} style={{ '--row-hue': layerHue(layerSlotOf(position)) } as CSSProperties}>
              <span className={styles.stackSwatch} aria-hidden="true" />{position + 1} · {item.name}
            </li>)}
            <li data-base=""><span className={styles.stackSwatch} aria-hidden="true" />Default</li>
          </ol>
          <p className={styles.orderNote}>First on the layer strip and in lists. When two layers are on, the last one turned on wins.</p>
        </aside>
      </div>
      <ButtonCapture open={!!capture} trail={['Layers', layer.name, 'How it turns on and off']}
        title={capture?.purpose === 'off' ? 'Turned off by' : capture?.purpose === 'add' ? 'Another button' : 'With this button'}
        purpose={capture?.purpose === 'off' ? `Turns ${layer.name} off` : `${VERB_WORD[capture?.verb ?? primary?.verb ?? 'hold']} turns ${layer.name} on`}
        unavailable={usedElsewhere} onPick={pick} onClose={() => setCapture(null)} />
    </SubPage>
  )
}

/** One button that turns the mode on, with its own verb: ◂ ▸ changes the verb,
 *  A presses a new button, X takes this one off. */
function VerbRow({ action, family, disabled, onVerb, onRemove, onReplace }: { action: LayerAction; family: ControllerVisualFamily; disabled?: boolean; onVerb: (verb: LayerVerb) => void; onRemove: () => void; onReplace: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const input = action.input.replace(/^!/, '')
  const index = Math.max(0, onVerbs.indexOf(action.verb))
  const step = (direction: 1 | -1) => { if (!disabled) onVerb(onVerbs[(index + direction + onVerbs.length) % onVerbs.length]) }
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const onPad = (event: Event) => { if ((event as CustomEvent<PadEventDetail>).detail.button === 'X' && !disabled) { event.preventDefault(); onRemove() } }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [disabled, onRemove])
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); step(event.key === 'ArrowRight' ? 1 : -1) }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!disabled) onReplace() }
  }
  return (
    <div ref={ref} className={styles.verbRow} tabIndex={0} role="group" data-arrows="horizontal" aria-label={`${inputDisplayName(input, family)}: ${VERB_WORD[action.verb]}`}
      data-hints="MOVE:Change;A:Press a new one;X:Take it off;B:Back to Layers" data-caption={`${inputLong(input, family, t)} · ${VERB_WORD[action.verb]}${action.input.startsWith('!') ? ' · when let go' : ''}`}
      onKeyDown={onKeyDown} onClick={() => { if (!disabled) onReplace() }}>
      <span className={styles.pill} data-hue=""><InputGlyph command={input} family={family} size={20} /></span>
      <span className={styles.rowText}><b>{inputLong(input, family, t)}</b>{action.input.startsWith('!') && <span>When let go</span>}</span>
      <span className={styles.verbValue}><button type="button" tabIndex={-1} data-nav-skip aria-label="Previous" className={styles.arrowBtn} onClick={event => { event.stopPropagation(); step(-1) }}>◂</button> {VERB_WORD[action.verb]} <button type="button" tabIndex={-1} data-nav-skip aria-label="Next" className={styles.arrowBtn} onClick={event => { event.stopPropagation(); step(1) }}>▸</button></span>
    </div>
  )
}
