import { useMemo, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { configChanges, type ConfigChange } from '../utils/configChanges'
import { inputDefinitions, readableSetting, readLayers, layerHue, layerSlot, layerVerbLabels } from '../utils/layers'
import { inputDisplayName } from '../keymap/inputNames'
import { describeBinding } from '../utils/bindingDescription'
import { commandLabel } from '../utils/commandLabels'
import { parseBindingExpression } from '../utils/keymap'
import type { ControllerVisualFamily } from '../utils/controllerStatus'
import { BindingIconArt } from './keymap/IconPicker'
import { InputGlyph } from './glyphs/InputGlyph'
import { Icon } from './icons/Icon'
import { Dialog } from './ui/Dialog'
import styles from './ChangeReview.module.css'

const inputs = new Set(inputDefinitions.map(input => input.command))
const isInput = (key: string) => inputs.has(key.replace(/^!/, '')) || /^[LR]?[TM]\d+$/.test(key)
const targetOf = (key: string) => { const parts = key.replace(/^#\s*@\S+\s+/, '').split(','); return parts[parts.length - 1] }
const isBinding = (key: string) => isInput(targetOf(key)) || targetOf(key).split('+').every(isInput)
const words = (value: string) => value.replace(/^#\s*/, '').replace(/_/g, ' ').replace(/\bSENS\b/g, 'sensitivity').replace(/\bMIN\b/g, 'minimum').replace(/\bMAX\b/g, 'maximum').replace(/\bDEADZONE\b/g, 'dead zone').toLowerCase().replace(/^./, c => c.toUpperCase())
const groupOf = (change: ConfigChange) => {
  if (change.layerId) return `Layer · ${change.layerName}`
  const key = targetOf(change.key)
  if (/TOUCHPAD|GRID|^# @overlay|^[LR]?T\d+/.test(key)) return 'Trackpads'
  if (/STICK|^FLICK|^[LR]M\d+/.test(key)) return 'Sticks'
  if (/GYRO|TILT|MOTION|ROTATION/.test(key)) return 'Gyro & motion'
  if (/TIME|DURATION|WINDOW|PERIOD|TURBO/.test(key)) return 'Timing'
  if (isBinding(change.key) || /^# @(label|icon|layer-action)/.test(change.key)) return 'Buttons & actions'
  if (change.key.startsWith('#')) return 'Labels & notes'
  return 'Controller settings'
}

type Props = { baseline: string; text: string; family: ControllerVisualFamily; disabled: boolean; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; onRevert: (change: ConfigChange) => void; onRevertAll: () => void; onApply: () => void; onClose: () => void }
export function ChangeReview(props: Props) {
  const { t } = useTranslation()
  const changes = useMemo(() => configChanges(props.baseline, props.text), [props.baseline, props.text])
  const groups = useMemo(() => {
    const result = new Map<string, ConfigChange[]>()
    for (const change of changes) { const group = groupOf(change); result.set(group, [...(result.get(group) ?? []), change]) }
    return result
  }, [changes])
  const layers = useMemo(() => { const current = readLayers(props.text); return [...current, ...readLayers(props.baseline).filter(l => !current.some(layer => layer.id === l.id))] }, [props.text, props.baseline])
  const input = (command: string) => <span className={styles.input}>{command.split('+').map((part, index) => <span key={index}><InputGlyph command={part.replace(/^!/, '')} family={props.family} size={22} />{inputDisplayName(part, props.family)}</span>)}</span>
  const label = (change: ConfigChange) => {
    const key = targetOf(change.key), metadata = change.key.match(/^# @(\S+)/)?.[1]
    if (isBinding(change.key)) return <>{input(key)}{metadata && <span>{metadata === 'label' ? 'Action name' : metadata === 'icon' ? 'Action icon' : metadata === 'layer-action' ? 'Layer actions' : words(metadata)}</span>}</>
    return metadata ? metadata === 'overlay' ? 'Menu appearance' : 'Configuration note' : readableSetting(key).replace(/\bsens\b/gi, 'sensitivity').replace(/\bmin\b/gi, 'minimum').replace(/\bmax\b/gi, 'maximum')
  }
  const value = (change: ConfigChange, raw: string | undefined) => {
    if (raw === undefined) return <span className={styles.unset}>{change.layerId && change.kind === 'entry' ? 'Use Default layer' : 'Not set'}</span>
    if (change.kind === 'layer' || change.property === 'name' || /^# @label/.test(change.key)) return raw || 'Unnamed'
    if (/^# @icon/.test(change.key)) return <><BindingIconArt value={raw} size={22} />{words(raw.split(':').pop() ?? 'Icon')}</>
    if (/^# @overlay/.test(change.key)) return raw.replace(/at\s+([\d.]+)\s+([\d.]+)/, (_, x, y) => `Position ${Math.round(Number(x) * 100)}%, ${Math.round(Number(y) * 100)}%`).replace(/size\s+(\d+)/, 'Width $1 px').replace(/font\s+(\d+)/, 'Text $1 px').replace(/labels\s+(on|off)/, 'Action names $1').replace(/keys\s+(on|off)/, 'Keycaps $1').replace(/icons\s+(on|off)/, 'Icons $1').replace(/show\s+ring/, 'Show at outer ring').replace(/show\s+touch/, 'Show on touch')
    if (/^# @layer-action/.test(change.key)) return raw.split('\n').map((action, index) => { const [verb, id] = action.split(/\s+/); return <span key={index}>{layerVerbLabels[verb as keyof typeof layerVerbLabels] ?? words(verb)} {layers.find(l => l.id.toUpperCase() === id?.toUpperCase())?.name ?? 'layer'}</span> })
    if (isBinding(change.key)) {
      const assignment = raw.trim().replace(/^"|"$/g, '').match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.+)$/)
      if (assignment) return `${readableSetting(assignment[1])}: ${words(assignment[2])}`
      const command = commandLabel(raw)
      if (command) return command
      const expression = parseBindingExpression(raw)
      return expression?.tokens.length ? expression.tokens.map((token, index) => token.kind === 'input' ? <kbd key={index}>{describeBinding(token.raw, t)}</kbd> : <span key={index}>{describeBinding(token.raw, t)}</span>) : describeBinding(raw, t)
    }
    if (raw === 'true' || raw === 'ON') return 'Enabled'
    if (raw === 'false' || raw === 'OFF') return 'Disabled'
    if (raw === 'NONE') return 'Disabled'
    if (raw === 'NO_MOUSE') return 'No mouse movement'
    if (/^-?[\d.]+(?:\s+-?[\d.]+)*$/.test(raw)) return raw
    return raw.split(/\s+/).map(part => isInput(part) ? inputDisplayName(part, props.family) : words(part)).join(' ')
  }
  return <Dialog title="Review changes" eyebrow="Configuration" subtitle={`${changes.length} ${changes.length === 1 ? 'change' : 'changes'} since the last save or load. Revert puts back the previous value.`} width={820} height={690} onClose={props.onClose}
    toolbar={<div className={styles.toolbar}><button className="ghost-btn" disabled={props.disabled || !props.canUndo} onClick={props.onUndo}><Icon name="undo" />Undo <kbd>Ctrl Z</kbd></button><button className="ghost-btn" disabled={props.disabled || !props.canRedo} onClick={props.onRedo}><Icon name="redo" />Redo <kbd>Ctrl Shift Z</kbd></button><button className="ghost-btn" disabled={props.disabled || !changes.length} onClick={props.onRevertAll}><Icon name="remove" />Revert all</button></div>}
    hints={[{ button: 'B', label: 'Back' }]} actions={<button className="primary-btn" disabled={props.disabled || !changes.length} onClick={props.onApply}><Icon name="apply" />Save and apply</button>}>
    {!changes.length && <div className={styles.empty}><Icon name="apply" size={32} /><h3>No pending changes</h3><p>Your configuration matches its saved version. Undo and redo are available above.</p></div>}
    {[...groups].map(([group, entries]) => <section className={styles.group} key={group}><h3>{group}<span>{entries.length}</span></h3>{entries.map(change => {
      const modifier = targetOf(change.key) !== change.key ? change.key.replace(/^#\s*@\S+\s+/, '').split(',').slice(0, -1).join(',') : ''
      const shifted = !!modifier
      const hue = change.layerId ? layerHue(layerSlot(layers, change.layerId)) : undefined
      return <article key={change.id} className={styles.row} data-shift={shifted || undefined} style={hue ? { '--change-hue': hue } as CSSProperties : undefined}>
        <div className={styles.details}><div className={styles.label}>{label(change)}</div>{shifted && <div className={styles.shift}><Icon name="chords" size={16} />Modeshift · {modifier.split(',').map((part, index) => <span key={index}>{part.startsWith('!') ? 'While released ' : 'While holding '}{input(part.replace(/^!/, ''))}</span>)}</div>}
        <div className={styles.values}><div><small>Before</small><span>{value(change, change.before)}</span></div><Icon name="chevronRight" size={18} /><div><small>After</small><span>{value(change, change.after)}</span></div></div></div>
        <button className="ghost-btn" disabled={props.disabled} onClick={() => props.onRevert(change)} aria-label={`Revert ${isBinding(change.key) ? inputDisplayName(targetOf(change.key), props.family) : readableSetting(targetOf(change.key))}${/^# @label/.test(change.key) ? ' action name' : /^# @icon/.test(change.key) ? ' action icon' : ''}${modifier ? ` while holding ${inputDisplayName(modifier, props.family)}` : ''}${change.layerName ? ` in ${change.layerName}` : ''}`}><Icon name="undo" size={18} />Revert</button>
      </article>
    })}</section>)}
  </Dialog>
}
