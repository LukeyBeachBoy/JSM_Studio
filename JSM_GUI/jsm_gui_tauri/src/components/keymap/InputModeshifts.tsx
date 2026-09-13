import { resolveOverlayMenus } from '../../utils/overlayLayout'
import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import { useTranslation } from 'react-i18next'

import { AppSelect } from '../ui/AppSelect'

import { HelpButton } from '../HelpButton'

import { getBindingLabel, setBindingLabel } from '../../utils/bindingLabels'

import { parseBindingIcons, setBindingIcon } from '../../utils/bindingIcons'

import type { ControllerVisualFamily } from '../../utils/controllerStatus'

import { getButtonBindingRows, getKeymapValue } from '../../utils/keymap'

import { addModeshift, foldModeshift, modeshiftTriggers, projectModeshift, readModeshift, readShifted, removeModeshift, renameModeshift, writeModeshift, type ModeshiftTarget } from '../../utils/modeshift'

import type { VirtualControllerType } from '../../utils/virtualController'

import { TouchpadGridSection, type LivePadTouch } from './TouchpadGridSection'

import { TouchpadModeCard, type TouchpadModeCardConfig } from './TouchpadSettingsSection'

import { TouchpadStickSection } from './TouchpadStickSection'

import { buildTouchpadGridButton, getSpecialOptionList, type ButtonDefinition } from '../../keymap/schema'

import { ButtonBindingsCard } from './ButtonBindingsCard'

import { InputGlyph } from '../glyphs/InputGlyph'

import { useButtonRowState } from '../../keymap/useButtonRowState'

import { useBindingsConfig } from '../../hooks/useBindingsConfig'

import styles from './InputModeshifts.module.css'



type SectionActionProps = {

  hasPendingChanges: boolean

  statusMessage?: string | null

  onApply: () => void

  onCancel: () => void

  applyDisabled?: boolean

}



type Props = {

  initiallyOpen?: boolean
  controllerFamily?: ControllerVisualFamily

  target: ModeshiftTarget

  text: string

  onChange: Dispatch<SetStateAction<string>>

  modifiers: { value: string; label: string; disabled?: boolean }[]

  virtualControllerType: VirtualControllerType

  onEnableVirtualController?: () => void

  beginValueCapture: (key: string, label: string, onCaptured: (value: string) => void) => void

  isCapturingValue: (key: string) => boolean

  captureLabel: string

  livePad?: LivePadTouch | null

  /** Where a shifted key gets its value, when that is an imported file. */

  /** Configurations a shifted binding can switch to. */

  libraryProfiles?: string[]

  currentProfileName?: string | null

  inheritedFrom?: (key: string) => string | null

  onOpenConfigEditor?: () => void

  // Forwarded to the real pad sections, which carry their own Apply/Cancel.

  actions: SectionActionProps

}



const clampGrid = (value: number) => Math.max(1, Math.min(5, Math.round(value) || 1))

const finite = (value: number) => (Number.isFinite(value) ? value : undefined)

// A target carries its inputs' own definitions where it has them. Where it
// does not -- a bare command and a label -- stand one in, so the shifted card
// still has a name to show.
const definitionFor = (button: ModeshiftTarget['buttons'][number]): ButtonDefinition =>
  button.definition ?? { command: button.command, descriptionKey: button.label, playstation: button.label, xbox: button.label }



/**
 * One input's bindings while a shift is held.
 *
 * The shift is projected onto an ordinary configuration and edited with the
 * card the unshifted input uses, so activation types, additional triggers,
 * capture, advanced options, labels, help and the inherited-value indicator
 * are the same controls in both places rather than a reduced imitation of
 * them that has to be kept in step. Edits are folded back into `TRIGGER,KEY`
 * lines, so only the selected shift is written.
 *
 * Chords are the one thing a shift cannot hold: the configuration format has
 * no second condition to put them on, so `chordsLiveInModeshifts` takes them
 * out of the card's pickers here the same way it does for an input whose
 * chords live in this panel.
 */
function ShiftedBinding({ button, trigger, defaultOpen, ...props }: Props & { button: ButtonDefinition; trigger: string; defaultOpen?: boolean }) {
  const { t } = useTranslation()
  const rowState = useButtonRowState()
  const key = `${trigger},${button.command}`
  const command = button.command.toUpperCase()

  const projected = useMemo(() => projectModeshift(props.text, trigger), [props.text, trigger])

  // Clearing a binding in a shift means unbound while the shift is held. Left
  // to fall through, the projection would read the normal binding back and the
  // control would spring back to a value nobody asked for.
  const clearTo = useMemo(() => ({ [command]: 'NONE' }), [command])

  const { onChange } = props
  const setProjected = useCallback<Dispatch<SetStateAction<string>>>(
    update => {
      const after = typeof update === 'function' ? update(projected) : update
      onChange(previous => foldModeshift(previous, trigger, after, clearTo, projected))
    },
    [clearTo, onChange, projected, trigger]
  )

  const bindings = useBindingsConfig({ configText: projected, setConfigText: setProjected })

  const rows = useMemo(
    () =>
      getButtonBindingRows(projected, button.command, rowState.manualRows[button.command] ?? {}).filter(
        row => row.slot !== 'chord'
      ),
    [button.command, projected, rowState.manualRows]
  )

  const specialsByButton = useMemo(() => {
    const assignments: Record<string, string | undefined> = {}
    getSpecialOptionList(t).forEach(binding => {
      getKeymapValue(projected, binding.value)
        ?.split(/\s+/)
        .filter(Boolean)
        .forEach(token => {
          assignments[token.toUpperCase()] = binding.value
        })
    })
    return assignments
  }, [projected, t])

  const captureKey = (target: string, slot: string, rowId?: string) => `${trigger},${target}::${slot}::${rowId ?? ''}`
  const isGridRegion = /^(?:[LR]?T|[LR]M)\d+$/.test(command)

  return (
    <ButtonBindingsCard
      button={button}
      // The shifted key, so a shifted card and the normal card for the same
      // input are separately addressable: focus, rename and the Overview's
      // jump-to-binding all go through this attribute.
      domCommand={key}

      defaultOpen={defaultOpen}
      rows={rows}
      // A shift has no second condition to hang a chord on, so the card offers
      // none. Everything else it offers unshifted, it offers here.
      modifierOptions={[]}
      chordsLiveInModeshifts
      specialsByButton={specialsByButton}
      inheritedFrom={props.inheritedFrom?.(key) ?? null}
      onOpenConfigEditor={props.onOpenConfigEditor}
      stickShiftDisplayModes={rowState.stickShiftDisplayModes}
      updateStickShiftDisplayMode={rowState.updateStickShiftDisplayMode}
      manualRows={rowState.manualRows}
      ensureManualRow={rowState.ensureManualRow}
      updateManualRow={rowState.updateManualRow}
      removeManualRow={rowState.removeManualRow}
      getRowEditorMode={rowState.getRowEditorMode}
      setRowEditorMode={rowState.setRowEditorMode}
      captureLabel={props.captureLabel}
      isCapturing={(target, slot, rowId) => props.isCapturingValue(captureKey(target, slot, rowId))}
      isCapturingValue={props.isCapturingValue}
      beginCapture={(target, slot, rowId, label, modifier, writeMode) =>
        props.beginValueCapture(captureKey(target, slot, rowId), label, value =>
          bindings.handleFaceButtonBindingChange(target, slot, rowId, value, { modifier, writeMode })
        )
      }
      beginValueCapture={props.beginValueCapture}
      cancelCapture={() => undefined}
      onBindingChange={bindings.handleFaceButtonBindingChange}
      onModifierChange={bindings.handleModifierChange}
      onAssignSpecialAction={bindings.handleSpecialActionAssignment}
      onClearSpecialAction={bindings.handleClearSpecialAction}
      trackballDecay={bindings.trackballDecayValue}
      onTrackballDecayChange={bindings.handleTrackballDecayChange}
      virtualControllerType={props.virtualControllerType}

      libraryProfiles={props.libraryProfiles}

      currentProfileName={props.currentProfileName}
      controllerFamily={props.controllerFamily}
      onEnableVirtualController={props.onEnableVirtualController}
      // Labels and icons are annotations rather than assignments, so they are
      // written straight to the shifted key instead of travelling through the
      // projection.
      // A shift with no label of its own shows the unshifted one, so a shifted
      // card is never anonymous. Clearing the field then has to leave a record
      // of that -- an empty label line for the shifted key -- or the next read
      // inherits the unshifted label straight back and the field refills itself.
      // With nothing to inherit there is nothing to suppress, so the line goes.
      bindingLabel={getBindingLabel(props.text, key) ?? getBindingLabel(props.text, button.command)}
      onBindingLabelChange={(_target, value) =>
        onChange(previous =>
          setBindingLabel(previous, key, value, { keepEmpty: Boolean(getBindingLabel(previous, button.command)) })
        )
      }
      bindingIcon={parseBindingIcons(props.text)[key]}
      onBindingIconChange={
        isGridRegion ? (_target, value) => onChange(previous => setBindingIcon(previous, key, value)) : undefined
      }
    />
  )
}



/**

 * The shifted configuration for a trackpad.

 *

 * A pad is one physical input with several modes, so a shift is just that input

 * in one of those modes. This renders the pad's own mode card and mode sections

 * against chorded keys, rather than a second, smaller editor that has to be

 * kept in step with the first. Anything the normal pad can be configured to do

 * -- including a touch stick with its four swipe directions -- a shifted pad

 * can be configured to do, because it is literally the same UI.

 *

 * Reads fall through to the unshifted value (`readShifted`) because a shift

 * overrides only the keys it assigns; writes always produce a chorded line.

 */

function PadModeshiftBody({ trigger, ...props }: Props & { trigger: string }) {

  const { t } = useTranslation()

  const { target, text, onChange, actions } = props

  const pad = target.pad!

  const [selectedCommand, setSelectedCommand] = useState<string | null>(null)



  const key = (name: string) => `${pad.keyPrefix}_${name}`

  const read = (name: string, fallback = '') => readShifted(text, trigger, key(name)) ?? fallback

  const write = (name: string, value: string) => onChange(previous => writeModeshift(previous, trigger, key(name), value))



  const mode = read('TOUCHPAD_MODE', 'GRID_AND_STICK').trim().toUpperCase()

  const [rawColumns, rawRows] = read('GRID_SIZE', '2 2').trim().split(/\s+/).map(Number)

  const columns = clampGrid(rawColumns)

  const rows = clampGrid(rawRows)

  const sens = read('TOUCHPAD_SENS').trim().split(/\s+/).map(Number.parseFloat)

  const sensitivity = finite(sens[0])

  const sensitivityY = finite(sens[1]) ?? sensitivity



  // TOUCHPAD_SENS is a FloatXY: one number means both axes, two means X then Y.

  // Collapse back to one when the axes agree so a shift does not gratuitously

  // widen a setting the normal card would have written as a single value.

  const writeSens = (value: string, axis: 'x' | 'y') => {

    if (value === '') {

      if (axis === 'x') return write('TOUCHPAD_SENS', 'NONE')

      return write('TOUCHPAD_SENS', sensitivity === undefined ? 'NONE' : String(sensitivity))

    }

    const next = Number.parseFloat(value)

    if (!Number.isFinite(next)) return

    const x = axis === 'x' ? next : sensitivity ?? next

    const y = axis === 'y' ? next : sensitivityY ?? next

    write('TOUCHPAD_SENS', x === y ? String(x) : `${x} ${y}`)

  }



  const card: TouchpadModeCardConfig = {

    mode,

    dualStageMode: read('TOUCHPAD_DUAL_STAGE_MODE').trim().toUpperCase(),

    gridColumns: columns,

    gridRows: rows,

    sensitivity,

    sensitivityY,

    onModeChange: value => write('TOUCHPAD_MODE', value),

    onGridSizeChange: (nextColumns, nextRows) => write('GRID_SIZE', `${clampGrid(nextColumns)} ${clampGrid(nextRows)}`),

    onSensitivityChange: value => writeSens(value, 'x'),

    onSensitivityYChange: value => writeSens(value, 'y'),

    onDualStageModeChange: value => write('TOUCHPAD_DUAL_STAGE_MODE', value),

    gridRequiresClick: read('GRID_REQUIRES_CLICK', 'OFF').trim().toUpperCase() === 'ON',

    onGridRequiresClickChange: checked => write('GRID_REQUIRES_CLICK', checked ? 'ON' : 'OFF'),

  }



  const gridButtons: ButtonDefinition[] = Array.from({ length: columns * rows }, (_, index) =>

    buildTouchpadGridButton(

      index + 1,

      Math.floor(index / columns) + 1,

      (index % columns) + 1,

      pad.side === 'left' ? 'LT' : 'RT'

    )

  )

  const selected = gridButtons.find(button => button.command === selectedCommand) ?? gridButtons[0] ?? null

  const isBound = (command: string) => {

    const value = readShifted(text, trigger, command)

    return Boolean(value && value.toUpperCase() !== 'NONE')

  }

  // The shifted grid gets the same at-a-glance layout as the normal one. There

  // is no label here: labels are keyed by input, and a shift is a second set of

  // bindings on the same input, so the binding text stands on its own.

  const describeRegion = (command: string) => {

    const value = readShifted(text, trigger, command)

    return { binding: value && value.toUpperCase() !== 'NONE' ? value : '', extra: 0 }

  }



  const stick = {

    touchStickMode: read('TOUCH_STICK_MODE').trim().toUpperCase(),

    touchDeadzoneInner: read('TOUCH_DEADZONE_INNER'),

    touchRingMode: read('TOUCH_RING_MODE').trim().toUpperCase(),

    touchStickRadius: read('TOUCH_STICK_RADIUS'),

    touchStickAxis: read('TOUCH_STICK_AXIS').trim().toUpperCase(),

    onTouchStickModeChange: (value: string) => write('TOUCH_STICK_MODE', value),

    onTouchDeadzoneInnerChange: (value: string) => write('TOUCH_DEADZONE_INNER', value),

    onTouchRingModeChange: (value: string) => write('TOUCH_RING_MODE', value),

    onTouchStickRadiusChange: (value: string) => write('TOUCH_STICK_RADIUS', value),

    onTouchStickAxisChange: (value: string) => write('TOUCH_STICK_AXIS', value),

  }



  return <>

    <TouchpadModeCard config={card} />

    {mode === 'GRID_AND_STICK' && <>

      <p className={styles.hint}>

        The region under your thumb activates as soon as the trigger is pressed. Release the trigger to return to the

        normal mode.

      </p>

      {card.gridRequiresClick && (

        <button type="button" className="ghost-btn" onClick={() => write('GRID_REQUIRES_CLICK', 'OFF')}>

          Activate with the modeshift trigger only

        </button>

      )}

      <TouchpadGridSection

        menu={resolveOverlayMenus(text)[`${pad.keyPrefix}:${trigger}`]}
        side={pad.side}

        gridColumns={columns}

        gridCells={columns * rows}

        livePad={props.livePad}

        touchpadButtons={gridButtons}

        selectedButton={selected}

        selectedCommand={selected?.command ?? null}

        onSelectButton={setSelectedCommand}

        isButtonBound={isBound}

        describeRegion={describeRegion}

        renderButton={(button, options) => (

          <ShiftedBinding key={`${trigger}:${button.command}`} {...props} trigger={trigger} button={button} defaultOpen={options?.defaultOpen} />

        )}

        {...actions}

      />

      <TouchpadStickSection

        title={t(pad.side === 'left' ? 'keymap.touchStickTitleLeft' : 'keymap.touchStickTitleRight')}

        {...stick}

        {...actions}

      />

    </>}

  </>

}



function ModeshiftCard({ trigger, ...props }: Props & { trigger: string }) {

  const { target, text, onChange } = props

  const triggers = modeshiftTriggers(text, target)

  const read = (key: string, fallback: string) => readShifted(text, trigger, key) ?? fallback

  const write = (key: string, value: string) => onChange(previous => writeModeshift(previous, trigger, key, value))

  const mode = target.mode ? read(target.mode.key, target.mode.defaultValue) : ''

  const grid = target.grid

  // The same row every other input on the page gets: the trigger's own glyph,
  // what it is, and a summary of what it changes. It used to be a bare line of
  // text in a bordered box of its own, which is what made it read as belonging
  // to a different application.
  const triggerLabel = props.modifiers.find(option => option.value === trigger)?.label ?? trigger
  const boundCount = target.buttons.filter(button => {
    const value = readModeshift(text, trigger, button.command)
    return value && value.trim().toUpperCase() !== 'NONE'
  }).length

  return <details open={props.initiallyOpen || undefined} className={styles.card} aria-label={`${target.title} modeshift`}>

    <summary className="binding-summary">

      <InputGlyph command={trigger} family={props.controllerFamily} size={19} />

      <span>Modeshift · {triggerLabel}</span>

      <span className="binding-summary-hint">

        {mode && <span className={styles.summaryMode}>{mode}</span>}

        {boundCount > 0 && <span className="binding-summary-shifts">{boundCount} bound</span>}

      </span>

    </summary>

    <div className={styles.body}>


    <div className={styles.heading}>

      <h4>While Held <HelpButton title="Modeshift">This card replaces this input’s mode and bindings while its trigger is held. Releasing the trigger restores the normal card. Other input groups keep their own bindings.</HelpButton></h4>

      <button type="button" className="ghost-btn" onClick={() => onChange(previous => removeModeshift(previous, target, trigger))}>Remove modeshift</button>

    </div>

    <label className={styles.selectField}><span className={styles.caption}>Modeshift trigger <span className={styles.required}>Required</span></span>

      <AppSelect aria-label="Modeshift trigger" value={trigger} onChange={event => onChange(previous => renameModeshift(previous, target, trigger, event.target.value))}>

        {props.modifiers.filter(option => !option.disabled && ((!triggers.includes(option.value) && !target.buttons.some(button => button.command === option.value)) || option.value === trigger)).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}

      </AppSelect>

    </label>

    {target.pad ? <PadModeshiftBody {...props} trigger={trigger} /> : <>

      {target.mode && <label className={styles.selectField}>Shifted mode

        <AppSelect aria-label="Shifted mode" value={mode} onChange={event => write(target.mode!.key, event.target.value)}>

          {target.mode.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}

        </AppSelect>

      </label>}

      <div className={styles.bindings}>

        {target.buttons.map(button => <ShiftedBinding key={button.command} {...props} trigger={trigger} button={definitionFor(button)} />)}

      </div>

    </>}

    {grid && getKeymapValue(text, trigger) && getKeymapValue(text, trigger) !== 'NONE' && <p className={styles.hint}>The trigger also has its own binding ({getKeymapValue(text, trigger)}). Clear it under Touch and click buttons if you only want the shifted action.</p>}

    </div>

  </details>

}



export function InputModeshifts(props: Props) {

  const [adding, setAdding] = useState(false)
  const [newTrigger, setNewTrigger] = useState('')

  const triggers = modeshiftTriggers(props.text, props.target)

  const available = props.modifiers.filter(option => !option.disabled && !triggers.includes(option.value) && !props.target.buttons.some(button => button.command === option.value))

  const click = props.target.grid?.clickButton

  const modifiers = props.modifiers.map(option => option.value === click ? { ...option, label: 'Pad click' } : option)

  return <div className={styles.list}>

    {triggers.map(trigger => <ModeshiftCard key={`${props.target.id}:${trigger}`} {...props} modifiers={modifiers} initiallyOpen={trigger === newTrigger} trigger={trigger} />)}

    {adding ? <section className={styles.card} aria-label={`New ${props.target.title} modeshift`}>

      <div className={styles.heading}><h4>Add modeshift</h4><button type="button" className="ghost-btn" onClick={() => setAdding(false)}>Cancel</button></div>

      <label className={styles.selectField}>Modeshift trigger <span className={styles.required}>Required</span>

        <AppSelect aria-label="Modeshift trigger" value="" onChange={event => {

          if (!event.target.value) return

          setNewTrigger(event.target.value)
          props.onChange(previous => addModeshift(previous, props.target, event.target.value))

          setAdding(false)

        }}>

          <option value="">Choose a trigger…</option>

          {available.map(option => <option key={option.value} value={option.value}>{option.value === click ? 'Pad click' : option.label}</option>)}

        </AppSelect>

      </label>

    </section> : <button type="button" className={`ghost-btn ${styles.add}`} disabled={!available.length} onClick={() => setAdding(true)}>Add modeshift</button>}

  </div>

}

