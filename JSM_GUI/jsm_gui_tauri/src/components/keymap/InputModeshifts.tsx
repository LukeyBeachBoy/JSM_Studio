import { useCallback, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { AppSelect } from '../ui/AppSelect'
import { HelpButton } from '../HelpButton'
import { Icon } from '../icons/Icon'
import { getBindingLabel, setBindingLabel } from '../../utils/bindingLabels'
import { parseBindingIcons, setBindingIcon } from '../../utils/bindingIcons'
import { describeBinding } from '../../utils/bindingDescription'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import { getButtonBindingRows, getKeymapValue } from '../../utils/keymap'
import { resolveOverlayMenus } from '../../utils/overlayLayout'
import { resolveTouchpadGrids } from '../../utils/touchpadGrids'
import { addModeshift, foldModeshift, modeshiftTriggers, projectModeshift, readModeshift, readShifted, removeModeshift, renameModeshift, writeModeshift, type ModeshiftTarget } from '../../utils/modeshift'
import type { VirtualControllerType } from '../../utils/virtualController'
import type { LivePadTouch } from './TouchpadGridSection'
import type { TouchpadModeCardConfig } from './TouchpadSettingsSection'
import { TouchpadStickSection } from './TouchpadStickSection'
import { PadSection } from './PadSection'
import { buildTouchpadGridButton, getSpecialOptionList, type ButtonDefinition } from '../../keymap/schema'
import { ButtonBindingsCard } from './ButtonBindingsCard'
import { InputGlyph } from '../glyphs/InputGlyph'
import { useButtonRowState } from '../../keymap/useButtonRowState'
import { useBindingsConfig } from '../../hooks/useBindingsConfig'
import styles from './InputModeshifts.module.css'
import { ReleaseSwitch } from './ReleaseSwitch'
import { heldInput, isReleasedInput, withRelease } from '../../utils/released'

type SectionActionProps = {
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

export type InputModeshiftsProps = {
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
  /** The connected pad's real shape, so a shifted menu is drawn as the pad is. */
  padAspect?: number
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
const SHAPE_NAMES: Record<string, string> = { RECTANGLE: 'Grid', FOUR_WAY: '4-way', EIGHT_WAY: '8-way', RADIAL: 'Radial' }

// A target carries its inputs' own definitions where it has them. Where it
// does not -- a bare command and a label -- stand one in, so the shifted card
// still has a name to show.
const definitionFor = (button: ModeshiftTarget['buttons'][number]): ButtonDefinition =>
  button.definition ?? { command: button.command, descriptionKey: button.label, playstation: button.label, xbox: button.label }

/**
 * What a held input is called, on this controller and for this target: the
 * short name for a header ("LB"), the whole option ("LB — top-left bumper")
 * for a picker.
 */
const heldInputName = (target: ModeshiftTarget, modifiers: InputModeshiftsProps['modifiers'], rawTrigger: string, full = false) => {
  // "!X" (while released) is named for X; the sentence around it says released.
  const trigger = heldInput(rawTrigger)
  // A pad's click is named for its side: "Pad click" on the right pad's
  // modeshift left you to guess which pad's click it meant.
  if (target.grid && trigger === target.grid.clickButton && target.pad) {
    return target.pad.side === 'left' ? 'Left pad click' : 'Right pad click'
  }
  const label = modifiers.find(option => option.value === trigger)?.label ?? trigger
  return full ? label : label.split(' — ')[0]
}

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
export function ShiftedBinding({ button, trigger, defaultOpen, rowLabel, subtitle, xAction, embedded, ...props }: InputModeshiftsProps & {
  button: ButtonDefinition
  trigger: string
  defaultOpen?: boolean
  /** Just the commands lane, inside the shift's sheet (3c). */
  embedded?: boolean
  /** The row's own name where the section around it names the input ("Region 1 · Ping"). */
  rowLabel?: string
  subtitle?: string
  xAction?: { label: string; run: () => void }
}) {
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

  // Each of these walks the whole config, and this component re-renders with
  // every telemetry frame, so they are read once per config change.
  const annotations = useMemo(() => ({
    label: getBindingLabel(props.text, key) ?? getBindingLabel(props.text, button.command),
    icon: parseBindingIcons(props.text)[key],
  }), [props.text, key, button.command])

  return (
    <ButtonBindingsCard
      button={button}
      // The shifted key, so a shifted card and the normal card for the same
      // input are separately addressable: focus, rename and the Overview's
      // jump-to-binding all go through this attribute.
      domCommand={key}
      defaultOpen={defaultOpen}
      embedded={embedded}
      label={rowLabel}
      subtitle={subtitle}
      xAction={xAction}
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
      bindingLabel={annotations.label}
      onBindingLabelChange={(_target, value) =>
        onChange(previous =>
          setBindingLabel(previous, key, value, { keepEmpty: Boolean(getBindingLabel(previous, button.command)) })
        )
      }
      bindingIcon={annotations.icon}
      onBindingIconChange={
        isGridRegion ? (_target, value) => onChange(previous => setBindingIcon(previous, key, value)) : undefined
      }
    />
  )
}

/** The pad a shift turns this one into, read once per config change. */
function useShiftedPad(text: string, trigger: string, target: ModeshiftTarget) {
  const pad = target.pad!
  return useMemo(() => {
    const key = (name: string) => `${pad.keyPrefix}_${name}`
    const read = (name: string, fallback = '') => readShifted(text, trigger, key(name)) ?? fallback
    const mode = read('TOUCHPAD_MODE', 'GRID_AND_STICK').trim().toUpperCase()
    const [rawColumns, rawRows] = read('GRID_SIZE', '2 2').trim().split(/\s+/).map(Number)
    const shape = (read('GRID_SHAPE', 'RECTANGLE').trim().toUpperCase() || 'RECTANGLE')
    const prefix = pad.side === 'left' ? 'LT' : 'RT'
    const side = { columns: clampGrid(rawColumns), rows: clampGrid(rawRows) }
    const grid = resolveTouchpadGrids(pad.side === 'left'
      ? { leftMode: mode, leftColumns: side.columns, leftRows: side.rows, leftShape: shape }
      : { rightMode: mode, rightColumns: side.columns, rightRows: side.rows, rightShape: shape })[0]
    const regions = grid
      ? Array.from({ length: grid.cells }, (_, index) =>
          buildTouchpadGridButton(index + 1, Math.floor(index / grid.columns) + 1, (index % grid.columns) + 1, prefix))
      : []
    const icons = parseBindingIcons(text)
    const describe = (command: string) => {
      const value = readShifted(text, trigger, command)
      return {
        label: getBindingLabel(text, `${trigger},${command}`) ?? getBindingLabel(text, command),
        binding: value && value.toUpperCase() !== 'NONE' ? value : '',
        extra: 0,
        icon: icons[`${trigger},${command}`] ?? icons[command],
      }
    }
    return { mode, columns: clampGrid(rawColumns), rows: clampGrid(rawRows), shape, regions, describe, read }
  }, [text, trigger, pad.keyPrefix, pad.side])
}

/**
 * The shifted configuration for a trackpad.
 *
 * A pad is one physical input with several modes, so a shift is just that input
 * in one of those modes -- and it is drawn with the very section the pad itself
 * uses (PadSection): the same preview, the same shape tiles, the same region
 * row, the same menu appearance. Anything the normal pad can be configured to
 * do, a shifted pad can, because it is literally the same UI.
 *
 * Reads fall through to the unshifted value (`readShifted`) because a shift
 * overrides only the keys it assigns; writes always produce a chorded line.
 */
function PadModeshiftBody({ trigger, heldName, ...props }: InputModeshiftsProps & { trigger: string; heldName: string }) {
  const { t } = useTranslation()
  const { target, text, onChange, actions } = props
  const pad = target.pad!
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null)
  const shifted = useShiftedPad(text, trigger, target)
  const menuKey = `${pad.keyPrefix}:${trigger}`
  // The overlay's menus are resolved from the whole config; once per change,
  // not once per telemetry frame.
  const shiftedMenu = useMemo(() => resolveOverlayMenus(text)[menuKey], [text, menuKey])

  const key = (name: string) => `${pad.keyPrefix}_${name}`
  const read = shifted.read
  const write = (name: string, value: string) => onChange(previous => writeModeshift(previous, trigger, key(name), value))
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
  const deadzone = Number.parseFloat(read('GRID_DEADZONE'))

  const config: TouchpadModeCardConfig = {
    keyPrefix: `${pad.keyPrefix}_`,
    mode: shifted.mode,
    dualStageMode: read('TOUCHPAD_DUAL_STAGE_MODE').trim().toUpperCase(),
    gridColumns: shifted.columns,
    gridRows: shifted.rows,
    gridShape: shifted.shape,
    gridDeadzone: Number.isFinite(deadzone) ? deadzone : undefined,
    sensitivity,
    sensitivityY,
    onModeChange: value => write('TOUCHPAD_MODE', value),
    onGridSizeChange: (nextColumns, nextRows) => write('GRID_SIZE', `${clampGrid(nextColumns)} ${clampGrid(nextRows)}`),
    onGridShapeChange: value => write('GRID_SHAPE', value),
    onGridDeadzoneChange: value => write('GRID_DEADZONE', value === '' ? 'NONE' : value),
    onSensitivityChange: value => writeSens(value, 'x'),
    onSensitivityYChange: value => writeSens(value, 'y'),
    onDualStageModeChange: value => write('TOUCHPAD_DUAL_STAGE_MODE', value),
    gridRequiresClick: read('GRID_REQUIRES_CLICK', 'OFF').trim().toUpperCase() === 'ON',
    onGridRequiresClickChange: checked => write('GRID_REQUIRES_CLICK', checked ? 'ON' : 'OFF'),
  }

  const grid = shifted.mode === 'GRID_AND_STICK'
  const selected = shifted.regions.find(button => button.command === selectedCommand) ?? shifted.regions[0] ?? null
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

  return (
    <PadSection
      keyPrefix={`${pad.keyPrefix}_` as 'LEFT_' | 'RIGHT_'}
      settingPrefix={`${trigger},`}
      title={pad.side === 'left' ? t('keymap.leftPad', 'Left pad') : t('keymap.rightPad', 'Right pad')}
      command={`${trigger},${pad.keyPrefix}_PAD`}
      config={config}
      menu={grid ? shiftedMenu : undefined}
      appearance={{ menuKey, onChange }}
      livePad={props.livePad}
      padAspect={props.padAspect ?? 1}
      regions={grid ? shifted.regions : []}
      selected={grid ? selected : null}
      onSelect={setSelectedCommand}
      describeRegion={shifted.describe}
      renderButton={(button, options) => (
        <ShiftedBinding key={`${trigger}:${button.command}`} {...props} trigger={trigger} button={button}
          defaultOpen={options?.defaultOpen} rowLabel={options?.label} subtitle={options?.subtitle} xAction={options?.xAction} />
      )}
    >
      {grid && config.gridRequiresClick && trigger !== target.grid?.clickButton && (
        <p className={styles.hint}>
          {t('keymap.shiftRequiresClick', 'Regions fire on a pad click while {{held}} is held.', { held: heldName })}{' '}
          <button type="button" className="link-btn" onClick={() => write('GRID_REQUIRES_CLICK', 'OFF')}>
            {t('keymap.shiftFireOnHeld', 'Fire as soon as it is held instead')}
          </button>
        </p>
      )}
      {grid && (
        <TouchpadStickSection
          title={t(pad.side === 'left' ? 'keymap.touchStickTitleLeft' : 'keymap.touchStickTitleRight')}
          {...stick}
          {...actions}
        />
      )}
    </PadSection>
  )
}

/** One line on what a shift turns its target into, for the card's header. */
function useShiftSummary(props: InputModeshiftsProps, trigger: string) {
  const { t } = useTranslation()
  const { target, text } = props
  return useMemo(() => {
    if (target.pad) {
      const key = (name: string) => `${target.pad!.keyPrefix}_${name}`
      const mode = (readShifted(text, trigger, key('TOUCHPAD_MODE')) ?? 'GRID_AND_STICK').trim().toUpperCase()
      if (mode !== 'GRID_AND_STICK') return mode === 'MOUSE' ? t('keymap.mouse', 'Mouse') : mode === 'PS_TOUCHPAD' ? t('keymap.psTouchpad', 'PS Touchpad') : mode
      const shape = (readShifted(text, trigger, key('GRID_SHAPE')) ?? 'RECTANGLE').trim().toUpperCase()
      const prefix = target.pad.side === 'left' ? 'LT' : 'RT'
      const names: string[] = []
      for (let index = 1; index <= 25 && names.length < 8; index++) {
        const command = `${prefix}${index}`
        const value = readShifted(text, trigger, command)
        if (!value || value.toUpperCase() === 'NONE') continue
        names.push(getBindingLabel(text, `${trigger},${command}`) ?? getBindingLabel(text, command) ?? describeBinding(value, t))
      }
      return [`${t('keymap.gridMenu', 'Menu')} · ${SHAPE_NAMES[shape] ?? shape}`, names.join(', ') || t('keymap.shiftNoRegions', 'no regions bound yet')].join(' · ')
    }
    const mode = target.mode ? readShifted(text, trigger, target.mode.key) : undefined
    const modeLabel = mode ? target.mode?.options.find(option => option.value === mode.trim().toUpperCase())?.label ?? mode : ''
    const bound = target.buttons.filter(button => {
      const value = readModeshift(text, trigger, button.command)
      return value && value.trim().toUpperCase() !== 'NONE'
    })
    const boundText = bound.length
      ? bound.slice(0, 3).map(button => `${button.label} → ${describeBinding(readModeshift(text, trigger, button.command) ?? '', t)}`).join(', ') + (bound.length > 3 ? ` +${bound.length - 3}` : '')
      : ''
    return [modeLabel ? `${modeLabel.charAt(0).toUpperCase()}${modeLabel.slice(1)}` : '', boundText].filter(Boolean).join(' · ') || t('keymap.shiftNothingYet', 'Nothing changed yet')
  }, [t, target, text, trigger])
}

function ModeshiftCard({ trigger, triggers, ...props }: InputModeshiftsProps & { trigger: string; triggers: string[] }) {
  const { t } = useTranslation()
  const { target, text, onChange } = props
  const read = (key: string, fallback: string) => readShifted(text, trigger, key) ?? fallback
  const write = (key: string, value: string) => onChange(previous => writeModeshift(previous, trigger, key, value))
  const mode = target.mode ? read(target.mode.key, target.mode.defaultValue) : ''
  const heldName = heldInputName(target, props.modifiers, trigger)
  const summary = useShiftSummary(props, trigger)
  const ownBinding = target.grid ? getKeymapValue(text, trigger) : undefined
  const released = isReleasedInput(trigger)
  const choices = props.modifiers.filter(option => !option.disabled && ((!triggers.includes(withRelease(option.value, released)) && !target.buttons.some(button => button.command === option.value)) || option.value === heldInput(trigger)))
  const heldWord = released ? t('keymap.modeshiftIsReleased', 'is released') : t('keymap.modeshiftIsHeld', 'is held')

  return (
    <details open={props.initiallyOpen || undefined} className={styles.card} aria-label={`${target.title}: while ${heldName} ${heldWord}`} data-modeshift={trigger}>
      <summary className={styles.cardHead} data-hints="A:Open;B:Back">
        <span className={styles.cardGlyph} aria-hidden="true"><InputGlyph command={heldInput(trigger)} family={props.controllerFamily} size={24} /></span>
        <span className={styles.cardText}>
          <span className={styles.cardTitle}>
            <span className={styles.cardBadge}>{t('keymap.modeshiftBadge', 'Modeshift')}</span>
            {t('keymap.modeshiftWhile', 'While')} <b>{heldName}</b> {heldWord}
          </span>
          <span className={styles.cardSummary}>{summary}</span>
        </span>
        <span className={styles.cardChevron} aria-hidden="true" />
      </summary>
      <div className={styles.body}>
        <div className={styles.controls}>
          <label className={styles.heldField}>
            <span>{t('keymap.modeshiftHeldInput', 'Held input')}</span>
            <AppSelect aria-label={t('keymap.modeshiftHeldInput', 'Held input')} value={heldInput(trigger)} onChange={event => onChange(previous => renameModeshift(previous, target, trigger, withRelease(event.target.value, released)))}>
              {choices.map(option => <option key={option.value} value={option.value}>{heldInputName(target, props.modifiers, option.value, true)}</option>)}
            </AppSelect>
          </label>
          <label className={styles.heldField}>
            <span>{t('keymap.modeshiftWhen', 'Applies while it is')}</span>
            <ReleaseSwitch released={released} ariaLabel={`${heldName}: held or released`}
              disabled={triggers.includes(withRelease(trigger, !released))}
              onChange={next => onChange(previous => renameModeshift(previous, target, trigger, withRelease(trigger, next)))} />
          </label>
          {target.mode && !target.pad && (
            <label className={styles.heldField}>
              <span>{t('keymap.modeshiftShiftedMode', 'Mode while held')}</span>
              <AppSelect setting={trigger + ',' + target.mode.key} aria-label={t('keymap.modeshiftShiftedMode', 'Mode while held')} value={mode} onChange={event => write(target.mode!.key, event.target.value)}>
                {target.mode.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </AppSelect>
            </label>
          )}
          <button type="button" className={`button button--ghost button--lg ${styles.remove}`} data-hints="A:Remove modeshift;B:Back" onClick={() => onChange(previous => removeModeshift(previous, target, trigger))}>
            <Icon name="remove" size={16} />{t('keymap.removeModeshift', 'Remove modeshift')}
          </button>
        </div>
        {ownBinding && ownBinding !== 'NONE' && (
          <p className={styles.hint}>{t('keymap.shiftTriggerOwnBinding', '{{held}} also sends {{binding}} of its own. Clear it on its row if you only want the shift.', { held: heldName, binding: describeBinding(ownBinding, t) })}</p>
        )}
        {target.pad
          ? <PadModeshiftBody {...props} trigger={trigger} heldName={heldName} />
          : (
            <div className={styles.bindings}>
              {target.buttons.map(button => <ShiftedBinding key={button.command} {...props} trigger={trigger} button={definitionFor(button)} />)}
            </div>
          )}
      </div>
    </details>
  )
}

/**
 * Every modeshift on one pad or stick, as a headed group of its own under it.
 * Unlike Steam Input a control can have any number of these, so they are
 * counted and announced rather than trailing off the end of the settings as
 * one more row.
 */
export function InputModeshifts(props: InputModeshiftsProps & { heading?: ReactNode }) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [newTrigger, setNewTrigger] = useState('')
  const [releasedNew, setReleasedNew] = useState(false)

  // A scan of the whole config; the target is rebuilt by the caller on every
  // render, so it is keyed on what the scan actually reads from it.
  const { target, text } = props
  const targetKey = `${target.id}|${target.buttons.map(button => button.command).join(',')}|${target.mode?.key ?? ''}|${target.settings?.join(',') ?? ''}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const triggers = useMemo(() => modeshiftTriggers(text, target), [text, targetKey])
  const available = props.modifiers.filter(option => !option.disabled && !triggers.includes(withRelease(option.value, releasedNew)) && !target.buttons.some(button => button.command === option.value))
  const what = target.pad ? t('keymap.modeshiftWhatPad', 'this pad') : t('keymap.modeshiftWhatStick', 'this stick')

  return (
    <section className={styles.group} aria-label={`${target.title} modeshifts`}>
      <header className={styles.groupHead}>
        <span className={styles.groupTitle}>
          {t('keymap.modeshiftsTitle', 'Modeshifts')}
          <span className={styles.groupCount}>{triggers.length}</span>
          <HelpButton title={t('keymap.modeshiftsTitle', 'Modeshifts')}>
            {t('keymap.modeshiftsHelp', 'A modeshift switches {{what}} to another mode and set of bindings while another input is held, and back when it is released. Add as many as you like, one per held input.', { what })}
          </HelpButton>
        </span>
        <span className={styles.groupNote}>
          {triggers.length
            ? t('keymap.modeshiftsNote', 'What {{what}} becomes while another input is held', { what })
            : t('keymap.modeshiftsNoneNote', 'None yet. Hold another input to make {{what}} do something else.', { what })}
        </span>
        {!adding && (
          <button type="button" className="button button--secondary button--lg" disabled={!available.length} data-hints="A:Add modeshift;B:Back" onClick={() => setAdding(true)}>
            <Icon name="modeshift" size={16} />{t('keymap.addModeshiftShort', 'Add modeshift')}
          </button>
        )}
      </header>
      {adding && (
        <div className={styles.addRow}>
          <label className={styles.heldField}>
            <span>{releasedNew ? t('keymap.modeshiftReleasedInputNew', 'While this is released') : t('keymap.modeshiftHeldInputNew', 'While this is held')}</span>
            <AppSelect aria-label={t('keymap.modeshiftTrigger', 'Modeshift trigger')} value="" onChange={event => {
              if (!event.target.value) return
              const trigger = withRelease(event.target.value, releasedNew)
              setNewTrigger(trigger)
              props.onChange(previous => addModeshift(previous, target, trigger))
              setAdding(false)
            }}>
              <option value="">{t('keymap.modeshiftChooseTrigger', 'Choose a trigger…')}</option>
              {available.map(option => <option key={option.value} value={option.value}>{heldInputName(target, props.modifiers, option.value, true)}</option>)}
            </AppSelect>
          </label>
          <ReleaseSwitch released={releasedNew} onChange={setReleasedNew} ariaLabel={t('keymap.modeshiftWhen', 'While the input is held or released')} />
          <button type="button" className="button button--ghost button--lg" onClick={() => setAdding(false)}>{t('common.cancel', 'Cancel')}</button>
        </div>
      )}
      {triggers.map(trigger => (
        <ModeshiftCard key={`${target.id}:${trigger}`} {...props} initiallyOpen={trigger === newTrigger} trigger={trigger} triggers={triggers} />
      ))}
    </section>
  )
}
