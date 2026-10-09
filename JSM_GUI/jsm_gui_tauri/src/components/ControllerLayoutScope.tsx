import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerModelKey, controllerOverrides, controllerPadSource, controllerVariantLabel, hasControllerVariant, rebindForController, regularControllerGamepad, resetControllerVariant, setControllerPadSource, unavailableControllerInputs, type UnavailableInput } from '../utils/controllerLayouts'
import { controllerSupportsInput, controllerVisualFamily } from '../utils/controllerStatus'
import { layerHue, layerSlotOf, readLayers, readableSetting } from '../utils/layers'
import { readVirtualMenus } from '../utils/virtualMenus'
import { describeBinding } from '../utils/bindingDescription'
import { inputDisplayName } from '../keymap/inputNames'
import { SubPage, OpenRow, SegmentedRow } from './ui/console'
import { InputGlyph } from './glyphs/InputGlyph'
import { Icon } from './icons/Icon'
import { ControllerMarks } from './modes/ControllerMarks'
import { ButtonCapture } from './modes/ButtonCapture'
import styles from './ControllerLayoutScope.module.css'

// Layout for this controller (console v2, ControllerVariant.dc.html): edit the
// shared layout, or a layout only for the connected controller (a variant:
// "# @controller type-5 …" lines). What the shared layout uses that this
// controller lacks is listed with "Pick a button", which moves it to a button
// it has -- in this controller's layout only. Reset is confirmed in place with
// Keep them focused. Saved layouts of controllers that are not connected stay
// reachable at the bottom. Opened from Layout's quick menu, the game chip and
// jsm:open-controller-layout.

type Props = {
  open: boolean
  onClose: () => void
  text: string
  effectiveText: string
  devices?: TelemetryDevice[]
  /** The model being edited; '' is the shared layout. */
  model: string
  onModel: (key: string) => void
  onChange: (text: string) => void
}

const deviceFor = (key: string, devices?: TelemetryDevice[]): TelemetryDevice | undefined =>
  devices?.find(candidate => controllerModelKey(candidate) === key)
  ?? (key ? { type: Number(key.match(/type-(\d+)/)?.[1]), handle: 0, ...(key.endsWith('-edge') ? { vid: 0x054c, pid: 0x0df2 } : {}) } as TelemetryDevice : undefined)

export function ControllerLayoutScope({ open, ...props }: Props) {
  return open ? <VariantPage {...props} /> : null
}

function VariantPage({ onClose, text, effectiveText, devices, model, onModel, onChange }: Omit<Props, 'open'>) {
  const { t } = useTranslation()
  // In a steady order: the shell moves the controller being edited to the front
  // of `devices`, which would reshuffle the choice under the pad's thumb.
  const connected = useMemo(() => [...new Map((devices ?? []).map(candidate => [controllerModelKey(candidate), candidate])).values()]
    .sort((a, b) => controllerModelKey(a).localeCompare(controllerModelKey(b), undefined, { numeric: true })), [devices])
  const savedModels = useMemo(() => [...new Set([...text.matchAll(/#\s*@controller(?:-pad)?\s+(type-\d+(?:-edge)?)/g)].map(match => match[1]))]
    .filter(key => !connected.some(candidate => controllerModelKey(candidate) === key)), [text, connected])
  const [target, setTarget] = useState(model || (connected[0] ? controllerModelKey(connected[0]) : savedModels[0] ?? ''))
  useEffect(() => { if (model) setTarget(model) }, [model])
  const device = deviceFor(target, devices)
  const name = device ? controllerVariantLabel(device) : 'This controller'
  const isConnected = connected.some(candidate => controllerModelKey(candidate) === target)
  const family = controllerVisualFamily(device?.type)
  const variant = !!target && (hasControllerVariant(text, target) || (/^\s*#\s*@controller-pad\s+/m.test(text) && controllerPadSource(text, target) === 'left'))
  const count = target ? controllerOverrides(text, target).length : 0
  const missing = useMemo(() => unavailableControllerInputs(effectiveText, device), [effectiveText, device?.type, device?.vid, device?.pid, device?.supportedButtons]) // eslint-disable-line react-hooks/exhaustive-deps
  const single = ['type-4', 'type-5', 'type-5-edge'].includes(target)
  const dualLayout = /^\s*(LEFT|RIGHT)_(TOUCHPAD|GRID|TOUCH)_/m.test(effectiveText)
  const layers = readLayers(effectiveText)
  const menus = readVirtualMenus(effectiveText).menus
  const [resetting, setResetting] = useState(false)
  const [picking, setPicking] = useState<UnavailableInput | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { if (resetting) requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[data-keep]')?.focus()) }, [resetting])

  const describe = (entry: UnavailableInput) => {
    if (entry.kind === 'mode') {
      const index = layers.findIndex(layer => layer.id === entry.layerId)
      return { name: `${layers[index]?.name ?? 'A'} layer`, detail: entry.value.split(' ')[0] === 'hold' ? 'hold' : entry.value.split(' ')[0] === 'toggle' ? 'tap' : entry.value.split(' ')[0], hue: index >= 0 ? layerHue(layerSlotOf(index)) : undefined }
    }
    if (entry.kind === 'menu') {
      const menu = menus.find(item => item.id === entry.menuId)
      return { name: menu?.name ?? entry.value, detail: entry.field === 'source' ? `${menu?.actions.length ?? 0} ${menu?.type === 'TOUCH' ? 'zones' : 'slices'}` : entry.field === 'input' ? 'opens it' : entry.field === 'confirm' ? 'confirms' : 'cancels' }
    }
    if (entry.kind === 'setting') return { name: readableSetting(entry.assignment.split(',').pop() ?? entry.assignment), detail: entry.assignment.includes(',') ? `with ${inputDisplayName(entry.assignment.split(',')[0], family)} held` : 'while held' }
    const layerName = entry.layerId ? layers.find(layer => layer.id === entry.layerId)?.name : undefined
    return { name: describeBinding(entry.value, t) || entry.value, detail: [entry.assignment.includes(',') ? `with ${inputDisplayName(entry.assignment.split(',')[0], family)} held` : '', layerName ? `in ${layerName}` : ''].filter(Boolean).join(' · ') || inputDisplayName(entry.input, 'steam') }
  }
  const art = (key: string) => <ControllerMarks device={deviceFor(key, devices)} width={150} marks={[]} />
  const doc = (lit: boolean) => <span className={styles.doc} data-lit={lit ? 'true' : undefined} aria-hidden="true"><Icon name="source" size={30} /></span>

  return (
    <SubPage open onClose={resetting ? () => setResetting(false) : onClose} trail={['Layout']} title="Layout for this controller"
      badge={target ? `${isConnected ? '●' : '○'} ${name} ${isConnected ? 'connected' : 'not connected'}` : null}
      where={resetting ? `Layout · ${name} · Reset` : undefined} backLabel={resetting ? 'Keep them' : 'Back to Layout'} hints={[{ button: 'A', label: 'Choose' }]}>
      <div className={styles.page}>
        <div className={styles.cards} role="radiogroup" aria-label="Editing for controller">
          <button type="button" role="radio" aria-checked={!model} className={styles.card} data-current={!model ? 'true' : undefined} data-autofocus={!model ? '' : undefined}
            data-hints="A:Use shared layout;B:Back to Layout" data-caption={`Use shared layout · Every controller follows one layout. ${name} uses the nearest buttons it has.`}
            onClick={() => onModel('')}>
            <span className={styles.cardArt}>{art('')}<span className={styles.link} />{doc(!model)}<span className={styles.link} />{art(target)}</span>
            <span className={styles.cardText}><b>Use shared layout</b>{!model && <span className={styles.inUse}>✓ In use</span>}</span>
            <span className={styles.cardCaption}>Every controller follows one layout. {name} uses the nearest buttons it has.</span>
          </button>
          <button type="button" role="radio" aria-checked={!!model} className={styles.card} data-current={model ? 'true' : undefined} data-autofocus={model ? '' : undefined}
            aria-disabled={!target ? 'true' : undefined} data-reason={!target ? 'Connect a controller to give it a layout of its own' : undefined}
            data-hints={target ? `A:Only for ${name};B:Back to Layout` : 'B:Back to Layout'} data-caption={`Only for ${name} · changes made here leave the shared layout as it is`}
            onClick={() => { if (target) onModel(target) }}>
            <span className={styles.cardArt}>{art('')}<span className={styles.link} data-dim="true" />{doc(false)}<span className={styles.split} />{doc(!!model)}<span className={styles.link} />{art(target)}</span>
            <span className={styles.cardText}><b>Only for {name}</b>{model && <span className={styles.inUse}>✓ In use</span>}</span>
            <span className={styles.cardCaption}>{variant ? `${count} change${count === 1 ? '' : 's'} just for ${name}. The shared layout and other controllers stay as they are.` : `Your first change here makes a layout just for ${name}. The shared layout stays as it is.`}</span>
          </button>
        </div>
        <div className={styles.columns}>
          <div className={styles.rows}>
            {connected.length + savedModels.length > 1 && <SegmentedRow label="Controller" hint="Whose layout this page shows" value={target}
              options={[...connected.map(candidate => ({ value: controllerModelKey(candidate), label: controllerVariantLabel(candidate) })), ...savedModels.map(key => ({ value: key, label: `${controllerVariantLabel(deviceFor(key))} (disconnected)` }))]}
              onChange={key => { setTarget(key); if (model) onModel(key) }} />}
            {single && dualLayout && target && <SegmentedRow label="Touchpad uses" hint={`${name} has one. The other pad’s layout stays saved.`} value={controllerPadSource(text, target)}
              options={[{ value: 'right', label: 'Right trackpad', caption: 'The Steam right trackpad’s layout' }, { value: 'left', label: 'Left trackpad', caption: 'The Steam left trackpad’s layout' }]}
              onChange={side => onChange(setControllerPadSource(text, target, side as 'left' | 'right'))} />}
            {target && <OpenRow icon={<Icon name="catGamepad" size={22} />} label="Use regular gamepad" hint={`On ${name} every button acts as a plain gamepad button`}
              onOpen={() => { onModel(target); onChange(regularControllerGamepad(text, effectiveText, target)) }} hints="A:Use regular gamepad;B:Back to Layout" />}
            {variant && !resetting && <button type="button" className={`${styles.row} ${styles.danger}`} data-hints="A:Reset…;B:Back to Layout"
              data-caption={`Reset ${name}’s layout · its changes go and it follows the shared layout again`} onClick={() => setResetting(true)}>
              <Icon name="undo" size={20} /><span><b>Reset {name}’s layout</b><small>{count} change{count === 1 ? '' : 's'} just for {name}</small></span>
            </button>}
            {resetting && <div ref={panel} className={styles.resetPanel} role="alertdialog" aria-labelledby="reset-controller-variant">
              <h3 id="reset-controller-variant"><Icon name="undo" size={20} /> Reset {name}’s layout?</h3>
              <p>Its {count} change{count === 1 ? '' : 's'} go and it follows the shared layout again. Your other controller layouts stay. Undo can bring them back.</p>
              <div className={styles.resetActions}>
                <button type="button" className={styles.keep} data-keep="" data-hints="A:Keep them;B:Keep them" onClick={() => setResetting(false)}><b>Keep them</b><small>Nothing changes</small></button>
                <button type="button" className={styles.resetButton} data-hints="A:Reset;B:Keep them" onClick={() => { onChange(resetControllerVariant(text, target)); setResetting(false) }}>Reset</button>
              </div>
            </div>}
            {savedModels.length > 0 && <section className={styles.saved} aria-label="Saved for controllers not connected">
              <span className={styles.eyebrow}>Saved for controllers not connected</span>
              {savedModels.map(key => <OpenRow key={key} label={controllerVariantLabel(deviceFor(key))} hint={`${controllerOverrides(text, key).length} changes · not connected`}
                value={key === model ? 'Editing' : 'Edit'} onOpen={() => { setTarget(key); onModel(key) }} hints="A:Edit its layout;B:Back to Layout" />)}
            </section>}
          </div>
          <section className={styles.missing} aria-label={`${name} doesn't have`}>
            <header><span className={styles.eyebrow}>{name} doesn’t have · {missing.length}</span><small>Kept for the controllers that do</small></header>
            {!missing.length && <p className={styles.note}>{target ? `Everything the shared layout uses is on ${name}.` : 'Connect a controller to see what it lacks.'}</p>}
            {missing.map((entry, index) => {
              const words = describe(entry)
              return <button key={`${entry.assignment}:${entry.input}:${index}`} type="button" className={styles.missingRow} style={words.hue ? { '--mode-hue': words.hue } as CSSProperties : undefined}
                data-hints="A:Pick a button;B:Back to Layout" data-caption={`${inputDisplayName(entry.input, 'steam')} · ${words.name} · ${words.detail} · A moves it to a button ${name} has, for ${name} only`}
                onClick={() => setPicking(entry)}>
                <span className={styles.pill} data-hue={words.hue ? 'true' : undefined}><InputGlyph command={entry.input === 'LEFT_PAD' ? 'MISC3' : entry.input} family="steam" size={20} /></span>
                <span className={styles.missingText}><b>{words.name}</b><small>{words.detail}</small></span>
                <span className={styles.pick}>Pick a button ▸</span>
              </button>
            })}
          </section>
        </div>
      </div>
      <ButtonCapture open={!!picking} trail={['Layout', 'Layout for this controller']} title="Pick a button"
        purpose={picking ? `${describe(picking).name}, on ${name} only` : undefined}
        unavailable={command => device && !controllerSupportsInput(device, command) ? `${name} doesn’t have it` : undefined}
        onPick={command => { const entry = picking; setPicking(null); if (entry && target) { onModel(target); onChange(rebindForController(text, effectiveText, target, entry, entry.kind === 'menu' && entry.field === 'source' ? (command === 'L3' ? 'LSTICK' : command === 'R3' ? 'RSTICK' : 'RIGHT') : command)) } }}
        onClose={() => setPicking(null)} />
    </SubPage>
  )
}
