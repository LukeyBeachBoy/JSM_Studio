import { inputContent } from './glyphs/InputText'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerTargetKey, targetModel, addControllerLayout, savedControllerModels, controllerLayoutModels, controllerLayoutDevice, controllerOverrides, controllerPadSource, controllerVariantLabel, hasControllerVariant, rebindForController, regularControllerGamepad, resetControllerVariant, setControllerPadSource, unavailableControllerInputs, type UnavailableInput } from '../utils/controllerLayouts'
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
import { addAzeronCyberpunkLayout, hasAzeronCyberpunkLayout } from '../utils/azeronCyberpunk'

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
  configName?: string | null
  devices?: TelemetryDevice[]
  /** The model being edited; '' is the shared layout. */
  model: string
  onModel: (key: string) => void
  onChange: (text: string) => void
}

const deviceFor = controllerLayoutDevice

export function ControllerLayoutScope({ open, ...props }: Props) {
  return open ? <VariantPage {...props} /> : null
}

function VariantPage({ onClose, text, effectiveText, configName, devices, model, onModel, onChange }: Omit<Props, 'open'>) {
  const { t } = useTranslation()
  // In a steady order: the shell moves the controller being edited to the front
  // of `devices`, which would reshuffle the choice under the pad's thumb.
  const connected = useMemo(() => [...new Map((devices ?? []).map(candidate => [controllerTargetKey(candidate), candidate])).values()]
    .sort((a, b) => controllerTargetKey(a).localeCompare(controllerTargetKey(b), undefined, { numeric: true })), [devices])
  const savedModels = useMemo(() => savedControllerModels(text)
    .filter(key => !connected.some(candidate => controllerTargetKey(candidate) === key)), [text, connected])
  const availableModels = controllerLayoutModels.filter(key => !savedControllerModels(text).includes(key))
  const [adding, setAdding] = useState('type-25')

  const [target, setTarget] = useState(model || (connected[0] ? controllerTargetKey(connected[0]) : savedModels[0] ?? ''))
  useEffect(() => { if (model) setTarget(model) }, [model])
  const device = deviceFor(target, devices)
  const name = device ? controllerVariantLabel(target.includes('-device-') ? device : deviceFor(target)) : 'This controller'
  const isConnected = connected.some(candidate => controllerTargetKey(candidate) === target || (targetModel(target) === target && targetModel(controllerTargetKey(candidate)) === target))
  const family = controllerVisualFamily(device?.type)
  const ownVariant = !!target && (hasControllerVariant(text, target) || (/^\s*#\s*@controller-pad\s+/m.test(text) && controllerPadSource(text, target) === 'left'))
  const inheritedVariant = targetModel(target) !== target && hasControllerVariant(text, targetModel(target))
  const variant = ownVariant || inheritedVariant
  const ownCount = target ? controllerOverrides(text, target).length : 0
  const count = ownCount + (inheritedVariant ? controllerOverrides(text, targetModel(target)).length : 0)
  const missing = useMemo(() => unavailableControllerInputs(effectiveText, device), [effectiveText, device?.type, device?.vid, device?.pid, device?.supportedButtons]) // eslint-disable-line react-hooks/exhaustive-deps
  const single = ['type-4', 'type-5', 'type-5-edge'].includes(targetModel(target))
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

  return (
    <SubPage open onClose={resetting ? () => setResetting(false) : onClose} trail={['Layout']} title="Layout for this controller"
      badge={target ? `${isConnected ? '●' : '○'} ${name} · ${targetModel(target) === target ? 'model default' : isConnected ? 'connected' : 'not connected'}` : null}
      where={resetting ? `Layout · ${name} · Reset` : undefined} backLabel={resetting ? 'Keep them' : 'Back to Layout'} hints={[{ button: 'A', label: 'Choose' }]}>
      <div className={styles.page}>
        <div className={styles.controllerHeading}>
          <div className={styles.controllerArt}>{art(target)}</div>
          <div><b>{name}</b><p className={styles.note}>{inheritedVariant && !ownCount ? 'Using the saved model layout. Changes here apply only to this device.' : variant ? 'This controller has a saved layout for this game.' : 'Choose which layout to edit in this game.'}</p></div>
        </div>
        <div className={styles.cards} role="radiogroup" aria-label="Editing for controller">
          <button type="button" role="radio" aria-checked={!model} className={styles.card} data-current={!model ? 'true' : undefined} data-autofocus={!model ? '' : undefined}
            data-hints="A:Use shared layout;B:Back to Layout" data-caption={`Use shared layout · Every controller follows one layout. ${name} uses the nearest buttons it has.`}
            onClick={() => onModel('')}>
            <span className={styles.cardText}><b>Use shared layout</b>{!model && <span className={styles.inUse}>✓ In use</span>}</span>
            <span className={styles.cardCaption}>Edit the shared bindings used as a fallback by your controllers.</span>
          </button>
          <button type="button" role="radio" aria-checked={!!model} className={styles.card} data-current={model ? 'true' : undefined} data-autofocus={model ? '' : undefined}
            aria-disabled={!target ? 'true' : undefined} data-reason={!target ? 'Connect a controller to give it a layout of its own' : undefined}
            data-hints={target ? `A:Only for ${name};B:Back to Layout` : 'B:Back to Layout'} data-caption={`Only for ${name} · changes made here leave the shared layout as it is`}
            onClick={() => { if (target) onModel(target) }}>
            <span className={styles.cardText}><b>Only for {name}</b>{model && <span className={styles.inUse}>✓ In use</span>}</span>
            <span className={styles.cardCaption}>{inheritedVariant && !ownCount ? 'Uses the saved model layout. Changes here apply only to this device.' : variant ? 'Edit this controller’s saved bindings for this game.' : 'Give this controller its own bindings for this game.'}</span>
          </button>
        </div>
        <div className={styles.columns}>
          <div className={styles.rows}>
            {targetModel(target) === 'type-25' && /cyberpunk/i.test(configName ?? '') && !hasAzeronCyberpunkLayout(text) && <OpenRow label="Set up Cyberpunk for Cyborg" hint="WASD on foot · upper thumb Escape · lower thumb toggles analog Driving" value="Set up" onOpen={() => { onModel(target); onChange(addAzeronCyberpunkLayout(text, effectiveText)) }} />}
            <details className={styles.disclosure}>
              <summary>Add another controller to this game config</summary>
            <section className={styles.addLayout} aria-label="Add controller layout">
              <label htmlFor="add-controller-model">Controller model</label>
              <div><select id="add-controller-model" value={availableModels.includes(adding) ? adding : availableModels[0] ?? ''} onChange={event => setAdding(event.target.value)}>
                {availableModels.map(key => <option key={key} value={key}>{controllerVariantLabel(deviceFor(key))}</option>)}
              </select><button type="button" disabled={!availableModels.length} onClick={() => {
                const key = availableModels.includes(adding) ? adding : availableModels[0]
                if (!key) return
                onModel(key); onChange(addControllerLayout(text, key)); setTarget(key)
              }}>Add layout</button></div>
              <p>Saved in this config. The matching layout loads automatically for each controller, including when both are connected.</p>
            </section>
            </details>
            {connected.length + savedModels.length > 1 && <SegmentedRow label="Controller" hint="Each controller gets its own bindings in this game config" value={target}
              options={[...connected.map(candidate => ({ value: controllerTargetKey(candidate), label: controllerVariantLabel(candidate) })), ...savedModels.map(key => ({ value: key, label: `${controllerVariantLabel(deviceFor(key))} (${targetModel(key) === key ? 'model default' : 'disconnected'})` }))]}
              onChange={key => { setTarget(key); if (model) onModel(key) }} />}
            {single && dualLayout && target && <SegmentedRow label="Touchpad uses" hint={`${name} has one. The other pad’s layout stays saved.`} value={controllerPadSource(text, target)}
              options={[{ value: 'right', label: 'Right trackpad', caption: 'The Steam right trackpad’s layout' }, { value: 'left', label: 'Left trackpad', caption: 'The Steam left trackpad’s layout' }]}
              onChange={side => onChange(setControllerPadSource(text, target, side as 'left' | 'right'))} />}
            {target && targetModel(target) !== 'type-25' && <OpenRow icon={<Icon name="catGamepad" size={22} />} label="Use regular gamepad" hint={`On ${name} every button acts as a plain gamepad button`}
              onOpen={() => { onModel(target); onChange(regularControllerGamepad(text, effectiveText, target)) }} hints="A:Use regular gamepad;B:Back to Layout" />}
            {inheritedVariant && <OpenRow label="Edit the saved model layout" hint="Defaults used by every Cyborg of this model in this game" onOpen={() => { setTarget(targetModel(target)); onModel(targetModel(target)) }} />}
            {ownVariant && !resetting && <button type="button" className={`${styles.row} ${styles.danger}`} data-hints="A:Reset…;B:Back to Layout"
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
            {savedModels.length > 0 && <details className={styles.disclosure}><summary>Other saved controller layouts · {savedModels.length}</summary><section className={styles.saved} aria-label="Saved for controllers not connected">
              <span className={styles.eyebrow}>Saved for controllers not connected</span>
              {savedModels.map(key => <OpenRow key={key} label={controllerVariantLabel(deviceFor(key))} hint={targetModel(key) === key ? 'Defaults for this controller model in this game' : `${controllerOverrides(text, key).length} changes · not connected`}
                value={key === model ? 'Editing' : 'Edit'} onOpen={() => { setTarget(key); onModel(key) }} hints="A:Edit its layout;B:Back to Layout" />)}
            </section></details>}
          </div>
          <details className={styles.missing} aria-label={`${name} doesn't have`}>
            <summary>Review controls from the shared layout · {missing.length} unavailable</summary>
            <p className={styles.note}>These shared controls belong to other controllers. Expand only if you want to move one onto {name}.</p>
            {!missing.length && <p className={styles.note}>{target ? `Everything the shared layout uses is on ${name}.` : 'Connect a controller to see what it lacks.'}</p>}
            {missing.map((entry, index) => {
              const words = describe(entry)
              return <button key={`${entry.assignment}:${entry.input}:${index}`} type="button" className={styles.missingRow} style={words.hue ? { '--mode-hue': words.hue } as CSSProperties : undefined}
                data-hints="A:Pick a button;B:Back to Layout" data-caption={`${inputDisplayName(entry.input, 'steam')} · ${words.name} · ${words.detail} · A moves it to a button ${name} has, for ${name} only`}
                onClick={() => setPicking(entry)}>
                <span className={styles.pill} data-hue={words.hue ? 'true' : undefined}><InputGlyph command={entry.input === 'LEFT_PAD' ? 'MISC3' : entry.input} family="steam" size={20} /></span>
                <span className={styles.missingText}><b>{inputContent(words.name)}</b><small>{inputContent(words.detail)}</small></span>
                <span className={styles.pick}>Pick a button ▸</span>
              </button>
            })}
          </details>
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
