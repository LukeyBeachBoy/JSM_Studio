import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { configChanges, controllerModelLabel, type ConfigChange } from '../utils/configChanges'
import { readVirtualMenus } from '../utils/virtualMenus'
import { inputDefinitions, layerEntries, layerHue, layerSlot, layerVerbLabels, overrideInput, readableSetting, readLayers, type ConfigLayer } from '../utils/layers'
import { inputDisplayName } from '../keymap/inputNames'
import { describeBinding } from '../utils/bindingDescription'
import { isGyroRouteKey } from '../utils/gyroRoutes'
import type { ControllerVisualFamily } from '../utils/controllerStatus'
import type { HistoryStep } from '../hooks/useConfigHistory'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { SubPage } from './ui/console'
import { InputGlyph } from './glyphs/InputGlyph'
import { Icon } from './icons/Icon'
import { describeValue, inputLong } from './modes/modeText'
import styles from './ChangeReview.module.css'

// Review changes, undo, save (console v2, ReviewChanges.dc.html): a full page
// from the configuration menu (☰ ▸ Review changes) and the status chip. Every
// change since the file was saved, grouped the way the tabs are, each read as
// "before → after"; A goes to it, X reverts it. Beside it the history of edits
// since the save, Undo and Redo, Save and make live (☰), Discard all.

const inputs = new Set(inputDefinitions.map(input => input.command))
const isInput = (key: string) => inputs.has(key.replace(/^!/, '')) || /^[LR]?[TM]\d+$/.test(key)
const targetOf = (key: string) => { const parts = key.replace(/^#\s*@\S+\s+/, '').split(','); return parts[parts.length - 1] }
const isBinding = (key: string) => isInput(targetOf(key)) || targetOf(key).split('+').every(isInput)

/** Friendlier names for the settings people change most (V8 vocabulary). */
const SETTING_NAMES: Record<string, string> = {
  GYRO_SENS: 'Turn speed', MIN_GYRO_SENS: 'Turn speed, slow', MAX_GYRO_SENS: 'Turn speed, fast', IN_GAME_SENS: 'Game sensitivity',
  REAL_WORLD_CALIBRATION: 'Match a full turn (360°)', COUNTER_OS_MOUSE_SPEED: 'Ignore Windows pointer speed', IGNORE_OS_MOUSE_SPEED: 'Ignore Windows pointer speed',
  GYRO_ON: 'Gyro on while holding', GYRO_OFF: 'Gyro off while holding', HOLD_PRESS_TIME: 'Hold time', DBL_PRESS_WINDOW: 'Double-tap window', SIM_PRESS_WINDOW: 'Press together window',
  LIGHT_BAR: 'Controller light', LED_BRIGHTNESS: 'Light brightness', LEFT_TOUCHPAD_ROTATION: 'Left pad rotation', RIGHT_TOUCHPAD_ROTATION: 'Right pad rotation',
  RIGHT_TOUCHPAD_SENS: 'Right pad speed', LEFT_TOUCHPAD_SENS: 'Left pad speed', TOUCHPAD_SENS: 'Touchpad speed', VIRTUAL_CONTROLLER: 'Controller output',
}
const settingName = (key: string) => SETTING_NAMES[key] ?? readableSetting(key).replace(/\bsens\b/gi, 'sensitivity').replace(/\bmin\b/gi, 'minimum').replace(/\bmax\b/gi, 'maximum')

type Group = { id: string; label: string; order: number; hue?: string }
const groupOf = (change: ConfigChange, layers: ConfigLayer[]): Group => {
  if (change.kind === 'menu') return { id: 'menus', label: 'Menus', order: 6 }
  if (change.kind === 'order' || change.kind === 'layer' || change.kind === 'property') return { id: 'modes', label: 'Layers', order: 7 }
  if (change.kind === 'controller') return { id: `controller:${change.model}`, label: `Only for ${controllerModelLabel(change.model ?? '')}`, order: 9 }
  if (change.layerId) return { id: `layer:${change.layerId}`, label: `${change.layerName} layer`, order: 8, hue: layerHue(layerSlot(layers, change.layerId)) }
  const key = targetOf(change.key)
  if (/TOUCHPAD|GRID|^# @overlay|^[LR]?T\d+$|^TOUCH|^CAPTURE|^MISC[234]$/.test(key)) return { id: 'trackpads', label: 'Trackpads', order: 4 }
  if (/^Z[LR]F?$|^Z[LR]_MODE|TRIGGER/.test(key)) return { id: 'triggers', label: 'Triggers', order: 3 }
  if (/STICK|^FLICK|^[LR]M\d+$|^[LR](UP|DOWN|LEFT|RIGHT|RING|3|TOUCH)$/.test(key)) return { id: 'sticks', label: 'Sticks', order: 2 }
  if (isGyroRouteKey(key) || /GYRO|TILT|MOTION/.test(key)) return { id: 'gyro', label: 'Gyro', order: 5 }
  if (isBinding(change.key) || /^# @(label|icon|layer-action)/.test(change.key)) return { id: 'buttons', label: 'Buttons', order: 1 }
  if (/TIME|DURATION|WINDOW|PERIOD|TURBO/.test(key)) return { id: 'timing', label: 'Timing', order: 10 }
  if (change.key.startsWith('#')) return { id: 'notes', label: 'Labels & notes', order: 11 }
  return { id: 'settings', label: 'Controller settings', order: 12 }
}

export type ReviewRow = { name: string; input?: string; icon?: 'gyro' | 'menuLayout' | 'layers' | 'tuning'; before: string; after: string; beforeUnset: boolean; modifier?: string }

/** One change, as a row reads it: what it is, before and after. */
export function describeReviewChange(change: ConfigChange, from: string, to: string, layers: ConfigLayer[], family: ControllerVisualFamily, t: TFunction): ReviewRow {
  const short = (command: string) => inputDisplayName(command, family)
  const layerName = (id: string) => layers.find(layer => layer.id.toUpperCase() === id.toUpperCase())?.name ?? 'a layer'
  if (change.kind === 'menu') {
    const field = change.menuField ?? ''
    const what = field === 'menu' ? 'Menu' : field.startsWith('slot:') ? `Slice ${Number(field.slice(5)) + 1}` : change.key
    const slot = (label: string | undefined, binding: string | undefined) => label === undefined ? 'Not set' : binding === undefined ? label : `${label} · ${binding.trim().toUpperCase() === 'NONE' ? 'nothing' : describeBinding(binding, t)}`
    const before = change.binding ? slot(change.before, change.binding.before) : field === 'menu' ? (change.before ? 'In the file' : 'Not there') : change.before ?? 'Not set'
    const after = change.binding ? slot(change.after, change.binding.after) : field === 'menu' ? (change.after ? 'Added' : 'Deleted') : change.after ?? 'Not set'
    return { name: `${change.menuName} · ${what}`, icon: 'menuLayout', before, after, beforeUnset: change.before === undefined }
  }
  if (change.kind === 'order') return { name: 'Layer order', icon: 'layers', before: change.before ?? '', after: change.after ?? '', beforeUnset: false }
  if (change.kind === 'layer') return { name: `${change.layerName} layer`, icon: 'layers', before: change.before ? 'In the file' : 'Not there', after: change.after ? 'Added' : 'Deleted', beforeUnset: !change.before }
  if (change.kind === 'property') {
    const flag = (value?: string) => value === 'true' ? 'On' : 'Off'
    return change.property === 'name'
      ? { name: 'Layer name', icon: 'layers', before: change.before ?? '', after: change.after ?? '', beforeUnset: false }
      : { name: `Pause holds while ${change.layerName} is on`, icon: 'layers', before: flag(change.before), after: flag(change.after), beforeUnset: false }
  }
  if (change.kind === 'controller') {
    if (change.key === 'pad') return { name: 'Touchpad uses', icon: 'tuning', before: change.before ? `${change.before === 'left' ? 'Left' : 'Right'} trackpad` : 'Right trackpad', after: change.after ? `${change.after === 'left' ? 'Left' : 'Right'} trackpad` : 'Right trackpad', beforeUnset: !change.before }
    // A variant carries whole lines: a mode's JSON, what turns modes on, the
    // menu catalogue. Each is read the way the rest of the review reads it.
    if (change.key === 'VIRTUAL_MENUS') {
      const catalog = (line?: string) => {
        if (line === undefined) return 'Same as shared'
        const { menus, problem } = readVirtualMenus(line)
        return problem ? 'Menus the editor cannot read' : menus.length ? menus.map(menu => `${menu.name} (${menu.actions.length} ${menu.type === 'TOUCH' ? 'zones' : menu.type === 'HOTBAR' ? 'slots' : 'slices'})`).join(', ') : 'No menus'
      }
      return { name: 'Menus', icon: 'menuLayout', before: catalog(change.before), after: catalog(change.after), beforeUnset: change.before === undefined }
    }
    if (change.key.startsWith('@layer:')) {
      const mode = (line?: string) => { try { return line ? JSON.parse(line.replace(/^#\s*@layer\s+/, '')) as { name: string; overrides: Record<string, string>; deleted?: boolean } : null } catch { return null } }
      const before = mode(change.before), after = mode(change.after)
      const words = (value: ReturnType<typeof mode>, line?: string) => line === undefined ? 'Same as shared' : !value ? 'A layer of its own' : value.deleted ? 'Deleted' : `${Object.keys(value.overrides).length} change${Object.keys(value.overrides).length === 1 ? '' : 's'}`
      return { name: `${after?.name ?? before?.name ?? layerName(change.key.slice(7))} layer`, icon: 'layers', before: words(before, change.before), after: words(after, change.after), beforeUnset: change.before === undefined }
    }
    if (change.key.startsWith('# @layer-action ')) {
      const input = change.key.slice('# @layer-action '.length)
      const read = (line?: string) => line === undefined ? 'Same as shared' : line.split('\n').map(item => { const [verb, id] = item.replace(/^.*=\s*/, '').trim().split(/\s+/); return `${layerVerbLabels[verb as keyof typeof layerVerbLabels] ?? verb} ${layerName(id ?? '')}` }).join(', ')
      return { name: `${short(input.replace(/^!/, ''))} turns layers on`, input: input.replace(/^!/, ''), before: read(change.before), after: read(change.after), beforeUnset: change.before === undefined }
    }
    const value = (line?: string) => {
      if (line === undefined) return 'Same as shared'
      const assignment = line.match(/^([^=#]+?)\s*=\s*(.*)$/)
      if (!assignment) return line.startsWith('# @') ? line.replace(/^#\s*@(label|icon)\s+[^=]*=\s*/, '') || 'No name' : line
      return describeValue(assignment[1].trim(), assignment[2], {}, t)
    }
    const input = overrideInput(change.key)
    return { name: input ? inputLong(input, family, t) : change.key.startsWith('@layer:') ? `${layerName(change.key.slice(7))} layer` : settingName(change.key), input: input ?? undefined, icon: input ? undefined : 'tuning', before: value(change.before), after: value(change.after), beforeUnset: change.before === undefined }
  }
  // An entry: Default's own, or a mode's override.
  const key = targetOf(change.key)
  const metadata = change.key.match(/^# @(\S+)/)?.[1]
  const modifierPart = key !== change.key.replace(/^#\s*@\S+\s+/, '') ? change.key.replace(/^#\s*@\S+\s+/, '').split(',').slice(0, -1).join(',') : ''
  const modifier = modifierPart ? modifierPart.split(',').map(part => `With ${short(part.replace(/^!/, ''))} ${part.startsWith('!') ? 'let go' : 'held'}`).join(' · ') : undefined
  const entriesBefore = layerEntries(from), entriesAfter = layerEntries(to)
  const inMode = change.layerId ? ` in ${change.layerName}` : ''
  const unset = change.layerId && change.kind === 'entry' ? 'Same as Default' : 'Not set'
  if (metadata === 'layer-action') {
    const read = (raw?: string) => raw === undefined ? 'Nothing' : raw.split('\n').map(action => { const [verb, id] = action.trim().split(/\s+/); return `${layerVerbLabels[verb as keyof typeof layerVerbLabels] ?? verb} ${layerName(id ?? '')}` }).join(', ')
    return { name: `${short(key)} turns layers on`, input: key, before: read(change.before), after: read(change.after), beforeUnset: change.before === undefined }
  }
  if (metadata === 'label') return { name: `${short(key.split('::')[0])} button name${inMode}`, input: isInput(key.split('::')[0]) ? key.split('::')[0] : undefined, before: change.before || unset, after: change.after || 'No name', beforeUnset: !change.before, modifier }
  if (metadata === 'icon') return { name: `${short(key)} icon${inMode}`, input: isInput(key) ? key : undefined, before: change.before?.split(':').pop() || unset, after: change.after?.split(':').pop() || 'No icon', beforeUnset: !change.before, modifier }
  if (metadata === 'overlay') return { name: `On-screen menu layout${inMode}`, icon: 'menuLayout', before: change.before ?? unset, after: change.after ?? 'Not set', beforeUnset: change.before === undefined }
  if (isBinding(change.key)) {
    const input = isInput(key) ? key : undefined
    const name = change.layerId ? `${short(key)}${inMode}` : input ? inputLong(input, family, t) : short(key)
    return { name, input, modifier,
      before: change.before === undefined ? unset : describeValue(change.key, change.before, entriesBefore, t),
      after: change.after === undefined ? unset : describeValue(change.key, change.after, entriesAfter, t), beforeUnset: change.before === undefined }
  }
  const format = (raw?: string) => {
    if (raw === undefined) return unset
    const value = raw.replace(/#.*$/, '').trim()
    if (/_SENS$/.test(key) && /^-?[\d.]+$/.test(value)) return `${value}×`
    if (/^(true|ON)$/i.test(value)) return 'On'
    if (/^(false|OFF|NONE)$/i.test(value)) return 'Off'
    if (/^x[0-9a-f]{6}$/i.test(value)) return `#${value.slice(1)}`
    return value.split(/\s+/).map(part => isInput(part) ? short(part) : part.replace(/_/g, ' ').toLowerCase()).join(' ').replace(/^./, c => c.toUpperCase())
  }
  return { name: `${settingName(key)}${inMode}`, icon: isGyroRouteKey(key) || /GYRO/.test(key) ? 'gyro' : 'tuning', before: format(change.before), after: format(change.after), beforeUnset: change.before === undefined, modifier }
}

/** A step in the history, as a sentence: "Horn on RB in Vehicles", "Turn speed 2.3×". */
export function stepSentence(from: string, to: string, layers: ConfigLayer[], family: ControllerVisualFamily, t: TFunction): string {
  const changes = configChanges(from, to)
  if (!changes.length) return 'No change'
  const change = changes[0]
  const row = describeReviewChange(change, from, to, layers, family, t)
  const first = change.kind === 'entry' && isBinding(change.key) && !change.key.startsWith('#') && change.after !== undefined
    ? `${row.after.split(' · ')[0]} on ${inputDisplayName(targetOf(change.key), family)}${change.layerId ? ` in ${change.layerName}` : ''}`
    : change.kind === 'entry' && !isBinding(change.key) ? `${row.name} ${row.after}`
    : `${row.name}: ${row.after}`
  return changes.length > 1 ? `${first} and ${changes.length - 1} more` : first
}

const ago = (at: number, now: number) => {
  const minutes = Math.floor((now - at) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  return `${hours} hour${hours === 1 ? '' : 's'} ago`
}

type Props = {
  baseline: string; text: string; family: ControllerVisualFamily; disabled: boolean
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void
  onRevert: (change: ConfigChange) => void; onRevertAll: () => void; onApply: () => void; onClose: () => void
  /** A on a row: go to the input or setting the change is on. */
  onGoTo?: (change: ConfigChange) => void
  /** The undo history, for the History timeline. */
  history?: { past: HistoryStep[]; future: HistoryStep[]; at: number }
  /** When the saved file was last written or opened. */
  savedAt?: { at: number; kind: 'opened' | 'saved' } | null
}

export function ChangeReview(props: Props) {
  const { t } = useTranslation()
  const root = useRef<HTMLDivElement>(null)
  const aside = useRef<HTMLElement>(null)
  const [now, setNow] = useState(Date.now())
  const [allHistory, setAllHistory] = useState(false)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const changes = useMemo(() => configChanges(props.baseline, props.text), [props.baseline, props.text])
  // Modes as the file has them, including those a controller's own layout
  // carries ("# @controller type-5 # @layer {…}"), so every change can name its mode.
  const layers = useMemo(() => {
    const unwrap = (text: string) => text.split(/\r?\n/).map(line => line.replace(/^\s*#\s*@controller\s+type-\d+(?:-edge)?\s+/, '')).join('\n')
    const found: ConfigLayer[] = []
    for (const text of [props.text, props.baseline]) for (const layer of readLayers(unwrap(text))) if (!found.some(item => item.id === layer.id)) found.push(layer)
    return found
  }, [props.text, props.baseline])
  const groups = useMemo(() => {
    const result = new Map<string, { group: Group; entries: ConfigChange[] }>()
    for (const change of changes) {
      const group = groupOf(change, layers)
      const entry = result.get(group.id) ?? { group, entries: [] }
      entry.entries.push(change)
      result.set(group.id, entry)
    }
    return [...result.values()].sort((a, b) => a.group.order - b.group.order)
  }, [changes, layers])
  const savedAt = props.savedAt ?? null
  // The edits since the save, newest first, named by what each one changed.
  const steps = useMemo(() => {
    const history = props.history
    if (!history) return []
    const list: { sentence: string; at: number }[] = []
    for (let index = history.past.length - 1; index >= 0 && list.length < 30; index--) {
      const after = index === history.past.length - 1 ? props.text : history.past[index + 1].text
      const at = index === history.past.length - 1 ? history.at : history.past[index + 1].at
      if (savedAt && at < savedAt.at) break
      list.push({ sentence: stepSentence(history.past[index].text, after, layers, props.family, t), at })
    }
    return list
  }, [props.history, props.text, savedAt, layers, props.family, t])
  const redoSentence = props.history?.future.length ? stepSentence(props.text, props.history.future[props.history.future.length - 1].text, layers, props.family, t) : null
  const shown = allHistory ? steps : steps.slice(0, 4)

  // X reverts the focused change; Y goes to Undo · redo; ☰ saves and makes it live.
  const latest = useRef({ changes, onRevert: props.onRevert, onApply: props.onApply, disabled: props.disabled })
  latest.current = { changes, onRevert: props.onRevert, onApply: props.onApply, disabled: props.disabled }
  useEffect(() => {
    const node = root.current
    if (!node) return
    const onPad = (event: Event) => {
      const button = (event as CustomEvent<PadEventDetail>).detail.button
      const { changes, onRevert, onApply, disabled } = latest.current
      if (button === 'X') {
        const id = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-change-id]')?.dataset.changeId
        const change = changes.find(item => item.id === id)
        if (change && !disabled) { event.preventDefault(); onRevert(change) }
      } else if (button === 'Y') {
        event.preventDefault()
        aside.current?.querySelector<HTMLElement>('[data-undo]')?.focus()
      } else if (button === 'MENU') {
        event.preventDefault()
        if (!disabled && changes.length) onApply()
      }
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [])

  const savedLine = savedAt ? `since you ${savedAt.kind === 'saved' ? 'last saved' : 'opened it'}, ${ago(savedAt.at, now)}` : 'since the last save or load'
  return (
    <SubPage open onClose={props.onClose} trail={['Menu']} title="Review changes" badge={null}
      hints={[{ button: 'Y', label: 'Undo · redo' }, ...(changes.length ? [{ button: 'MENU' as const, label: 'Save' }] : [])]}>
      <div ref={root} className={styles.page} role="region" aria-label="Review changes">
        <section className={styles.main} aria-label="Changes">
          <header className={styles.head}>
            <h1>{changes.length ? `${changes.length} ${changes.length === 1 ? 'change' : 'changes'}` : 'All changes saved'}</h1>
            {changes.length > 0 && <span>{savedLine}</span>}
          </header>
          {!changes.length && <div className={styles.empty}>
            <Icon name="apply" size={32} /><h2>No pending changes</h2><p>Your configuration matches its saved version.</p>
          </div>}
          {groups.map(({ group, entries }, groupIndex) => <section className={styles.group} key={group.id} aria-label={group.label} style={group.hue ? { '--change-hue': group.hue } as CSSProperties : undefined}>
            <h2 className={styles.groupLabel}>{group.hue && <span className={styles.groupSwatch} aria-hidden="true" />}{group.label}<span className={styles.count}>{entries.length}</span></h2>
            {entries.map((change, index) => {
              const row = describeReviewChange(change, props.baseline, props.text, layers, props.family, t)
              const label = `Revert ${row.name}${row.modifier ? ` ${row.modifier.toLowerCase()}` : ''}`
              return <button key={change.id} type="button" className={styles.row} data-change-id={change.id} data-autofocus={groupIndex === 0 && index === 0 ? 'true' : undefined}
                data-hints={`A:Go to it;X:Revert;Y:Undo · redo;${changes.length ? 'MENU:Save;' : ''}B:Back`}
                data-caption={`${row.name}${row.modifier ? ` · ${row.modifier}` : ''} · ${row.before} → ${row.after}`}
                aria-label={`${row.name}${row.modifier ? `, ${row.modifier}` : ''}: ${row.before} to ${row.after}`}
                onClick={() => props.onGoTo?.(change)}>
                <span className={styles.what}>
                  {row.input ? <span className={styles.glyph}><InputGlyph command={row.input} family={props.family} size={24} /></span> : row.icon ? <span className={styles.glyph}><Icon name={row.icon} size={20} /></span> : null}
                  <span className={styles.name}><b>{row.name}</b>{row.modifier && <small>{row.modifier}</small>}</span>
                </span>
                <span className={styles.values}>
                  <s className={styles.before} data-unset={row.beforeUnset ? 'true' : undefined}>{row.before}</s>
                  <span className={styles.arrow} aria-hidden="true">→</span>
                  <b className={styles.after}>{row.after}</b>
                </span>
                <span className={styles.revert} role="button" tabIndex={-1} aria-label={label} data-nav-skip
                  onClick={event => { event.stopPropagation(); if (!props.disabled) props.onRevert(change) }}><span className={styles.revertKey} aria-hidden="true">X</span>Revert</span>
              </button>
            })}
          </section>)}
        </section>

        <aside ref={aside} className={styles.aside} aria-label="History">
          <h2 className={styles.groupLabel}>History</h2>
          <ol className={styles.timeline}>
            {shown.map((step, index) => <li key={index} data-latest={index === 0 ? 'true' : undefined}><span>{step.sentence}</span>{index === 0 && <small>{now - step.at < 60000 ? 'now' : ago(step.at, now)}</small>}</li>)}
            {!allHistory && steps.length > 4 && <li data-more=""><button type="button" className={styles.moreSteps} data-hints="A:Show them;B:Back" onClick={() => setAllHistory(true)}>{steps.length - 4} more</button></li>}
            {savedAt && <li data-saved="">{savedAt.kind === 'saved' ? 'Saved' : 'Opened'} {ago(savedAt.at, now)}</li>}
          </ol>
          <div className={styles.historyActions}>
            <button type="button" className={styles.hs} data-undo="" aria-disabled={props.disabled || !props.canUndo ? 'true' : undefined} data-reason={!props.canUndo ? 'Nothing to undo' : undefined}
              data-hints={props.canUndo ? 'A:Undo;B:Back' : 'B:Back'} aria-label="Undo" onClick={() => { if (!props.disabled && props.canUndo) props.onUndo() }}>
              <Icon name="undo" size={20} /><span><b>Undo</b><small>{props.canUndo ? steps[0]?.sentence ?? 'Last change' : 'Nothing to undo'}</small></span>
            </button>
            <button type="button" className={styles.hs} aria-disabled={props.disabled || !props.canRedo ? 'true' : undefined} data-reason={!props.canRedo ? 'Nothing to redo' : undefined}
              data-hints={props.canRedo ? 'A:Redo;B:Back' : 'B:Back'} aria-label="Redo" onClick={() => { if (!props.disabled && props.canRedo) props.onRedo() }}>
              <Icon name="redo" size={20} /><span><b>Redo</b><small>{redoSentence ?? 'Nothing to redo'}</small></span>
            </button>
            <span className={styles.spacer} />
            {changes.length > 0 && <><button type="button" className={`${styles.hs} ${styles.save}`} aria-disabled={props.disabled || !changes.length ? 'true' : undefined} data-reason={!changes.length ? 'No unsaved changes' : undefined}
              data-hints={changes.length ? 'A:Save and make live;B:Back' : 'B:Back'} onClick={() => { if (!props.disabled && changes.length) props.onApply() }}>
              <span className={styles.menuKey} aria-hidden="true"><Icon name="more" size={16} /></span><b>Save and make live</b>
            </button>
            <button type="button" className={`${styles.hs} ${styles.discard}`} aria-disabled={props.disabled || !changes.length ? 'true' : undefined} data-reason={!changes.length ? 'No unsaved changes' : undefined}
              data-hints={changes.length ? 'A:Discard;B:Back' : 'B:Back'} aria-label={`Discard all ${changes.length}`} onClick={() => { if (!props.disabled && changes.length) props.onRevertAll() }}>
              <Icon name="remove" size={20} /><span><b>Discard all {changes.length}</b><small>Back to the saved file</small></span>
            </button></>}
          </div>
        </aside>
      </div>
    </SubPage>
  )
}
