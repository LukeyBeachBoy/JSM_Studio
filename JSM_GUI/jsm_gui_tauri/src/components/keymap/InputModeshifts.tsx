import { detachStickMenu } from '../../utils/stickMenus'
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { SubPage, OpenRow, SegmentedRow } from '../ui/console'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { AddModeshiftSheet } from './AddModeshiftSheet'
import { Icon } from '../icons/Icon'
import { getBindingLabel, setBindingLabel, parseBindingLabels } from '../../utils/bindingLabels'
import { parseBindingIcons, setBindingIcon } from '../../utils/bindingIcons'
import { describeBinding } from '../../utils/bindingDescription'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import { getButtonBindingRows, getKeymapValue, updateKeymapEntry } from '../../utils/keymap'
import { resolveOverlayMenus } from '../../utils/overlayLayout'
import { resolveTouchpadGrids } from '../../utils/touchpadGrids'
import { addModeshift, foldModeshift, modeshiftTriggers, projectModeshift, readModeshift, readShifted, removeModeshift, renameModeshift, writeModeshift, type ModeshiftTarget } from '../../utils/modeshift'
import type { VirtualControllerType } from '../../utils/virtualController'
import type { LivePadTouch } from './TouchpadGridSection'
import type { TouchpadModeCardConfig } from './TouchpadSettingsSection'
import { TrackpadsPage } from '../trackpads/TrackpadsPage'
import { useMouseAreaConfig } from '../../hooks/useMouseAreaConfig'
import { buildTouchpadGridButton, getSpecialOptionList, TOUCH_BUTTONS, MISC_BUTTONS, TOUCH_STICK_BUTTONS, LEFT_STICK_BUTTONS, RIGHT_STICK_BUTTONS, TRIGGER_BUTTONS, type ButtonDefinition } from '../../keymap/schema'
import { ButtonBindingsCard } from './ButtonBindingsCard'
import { InputGlyph } from '../glyphs/InputGlyph'
import { useButtonRowState } from '../../keymap/useButtonRowState'
import { useBindingsConfig } from '../../hooks/useBindingsConfig'
import styles from './InputModeshifts.module.css'
import { takeModeshiftRequest, useModeshiftRequestVersion } from '../sticks/inputSide'
import { SticksPage } from '../sticks/SticksPage'
import { TriggersPage } from '../triggers/TriggersPage'
import { SettingPrefix } from '../SettingOrigin'
import { heldInput, isReleasedInput, withRelease } from '../../utils/released'

type SectionActionProps = {
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

export type InputModeshiftsProps = {
  renderEditor?: (trigger: string) => ReactNode
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
      commandLabels={parseBindingLabels(props.text)}
      bindingLabel={annotations.label}
      onBindingLabelChange={(targetKey, value) =>
        onChange(previous =>
          setBindingLabel(previous, targetKey, value, { keepEmpty: !targetKey.includes('::') && Boolean(getBindingLabel(previous, button.command)) })
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
    const key = (name: string) => `${pad.keyPrefix ? pad.keyPrefix + '_' : ''}${name}`
    const read = (name: string, fallback = '') => readShifted(text, trigger, key(name)) ?? fallback
    const mode = read('TOUCHPAD_MODE', 'GRID_AND_STICK').trim().toUpperCase()
    const [rawColumns, rawRows] = read('GRID_SIZE', '2 2').trim().split(/\s+/).map(Number)
    const shape = (read('GRID_SHAPE', 'RECTANGLE').trim().toUpperCase() || 'RECTANGLE')
    const prefix = pad.side === 'left' ? 'LT' : pad.side === 'right' ? 'RT' : 'T'
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
 * uses (TrackpadsPage): the same preview, the same shape tiles, the same region
 * row, the same menu appearance. Anything the normal pad can be configured to
 * do, a shifted pad can, because it is literally the same UI.
 *
 * Reads fall through to the unshifted value (`readShifted`) because a shift
 * overrides only the keys it assigns; writes always produce a chorded line.
 */
function PadModeshiftBody({ trigger, heldName, ...props }: InputModeshiftsProps & { trigger: string; heldName: string }) {
  const { t } = useTranslation()
  const { target, text, onChange } = props
  const pad = target.pad!
  const shifted = useShiftedPad(text, trigger, target)
  const [selected, setSelected] = useState<string | null>(null)
  const projected = useMemo(() => projectModeshift(text, trigger), [text, trigger])
  const setProjected = useCallback<Dispatch<SetStateAction<string>>>(update => {
    const next = typeof update === 'function' ? update(projected) : update
    onChange(previous => foldModeshift(previous, trigger, next, {}, projected))
  }, [onChange, projected, trigger])
  const areas = useMouseAreaConfig({ readText: projected, setConfigText: setProjected, settingPrefix: `${trigger},` })
  const area = areas[pad.keyPrefix]
  const side = pad.side === 'shared' ? 'single' : pad.side
  const menuKey = `${pad.keyPrefix || 'TOUCH'}:${trigger}`
  const card: TouchpadModeCardConfig = {
    mode: shifted.mode, dualStageMode: shifted.read('TOUCHPAD_DUAL_STAGE_MODE'), gridColumns: shifted.columns, gridRows: shifted.rows, gridShape: shifted.shape,
    mouseArea: area.area, mouseAreaFit: area.fit, onMouseAreaFitChange: area.setFit,
    onPickMouseArea: () => area.pick(props.padAspect ?? 1),
  }
  const buttons = [...TOUCH_BUTTONS, ...MISC_BUTTONS]
  const click = buttons.find(button => button.command === (pad.side === 'left' ? 'MISC3' : pad.side === 'right' ? 'MISC2' : 'CAPTURE'))
  const touch = buttons.find(button => button.command === (pad.side === 'left' ? 'MISC4' : 'TOUCH'))
  return <SettingPrefix prefix={`${trigger},`}>
    <TrackpadsPage readText={projected} setText={setProjected}
      modeShift={{ trigger, label: isReleasedInput(trigger) ? `${heldName} released` : `${heldName} held` }} dualPadController={pad.side !== 'shared'}
      pads={[{ side, card, regions: shifted.regions, menu: resolveOverlayMenus(text)[menuKey], menuKey, live: props.livePad ?? null,
        touch, click, modeshiftTarget: target }]}
      padAspect={props.padAspect ?? 1} selectedRegion={selected} onSelectRegion={setSelected}
      renderButton={(button, options) => <ShiftedBinding {...props} trigger={trigger} button={button} defaultOpen={options?.defaultOpen}
        rowLabel={options?.label} subtitle={options?.subtitle} xAction={options?.xAction} />}
      renderModeshifts={() => null}
      describe={command => { const info = shifted.describe(command); return { ...info, binding: info.binding ? describeBinding(info.binding, t) : '' } }}
      stickButtons={TOUCH_STICK_BUTTONS} onBindTouchStickWasd={() => setProjected(previous => Object.entries({ TUP: 'W', TLEFT: 'A', TDOWN: 'S', TRIGHT: 'D' }).reduce((next, [key, value]) => updateKeymapEntry(next, key, [value]), previous))} warnings={[]} virtualControllerType={props.virtualControllerType} />
  </SettingPrefix>
}

/** One line on what a shift turns its target into, for the card's header. */
function useShiftSummary(props: InputModeshiftsProps, trigger: string) {
  const { t } = useTranslation()
  const { target, text } = props
  return useMemo(() => {
    if (target.pad) {
      const key = (name: string) => `${target.pad!.keyPrefix ? target.pad!.keyPrefix + '_' : ''}${name}`
      const mode = (readShifted(text, trigger, key('TOUCHPAD_MODE')) ?? 'GRID_AND_STICK').trim().toUpperCase()
      if (mode !== 'GRID_AND_STICK') return mode === 'MOUSE' ? t('keymap.mouse', 'Mouse') : mode === 'MOUSE_AREA' ? t('keymap.mouseArea', 'Mouse area') : mode === 'PS_TOUCHPAD' ? t('keymap.psTouchpad', 'PS Touchpad') : mode
      const shape = (readShifted(text, trigger, key('GRID_SHAPE')) ?? 'RECTANGLE').trim().toUpperCase()
      const prefix = target.pad.side === 'left' ? 'LT' : target.pad.side === 'right' ? 'RT' : 'T'
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

/** Use the ordinary stick editor against a trigger-scoped projection. */
function StickModeshiftBody({ trigger, ...props }: InputModeshiftsProps & { trigger: string }) {
  const { t } = useTranslation()
  const side = props.target.mode!.key === 'LEFT_STICK_MODE' ? 'left' : 'right'
  const projected = useMemo(() => projectModeshift(props.text, trigger), [props.text, trigger])
  const setProjected = useCallback<Dispatch<SetStateAction<string>>>(update => {
    const next = typeof update === 'function' ? update(projected) : update
    props.onChange(previous => foldModeshift(previous, trigger, next, {}, projected))
  }, [props.onChange, projected, trigger])
  const describe = (command: string) => ({
    label: getBindingLabel(projected, command),
    binding: describeBinding(getKeymapValue(projected, command) ?? '', t),
  })
  const inputs = (side: 'left' | 'right') => {
    const list = side === 'left' ? LEFT_STICK_BUTTONS : RIGHT_STICK_BUTTONS
    const prefix = side === 'left' ? 'L' : 'R'
    const find = (command: string) => list.find(button => button.command === command)
    return { directions: list.filter(button => new RegExp(`^${prefix}(UP|DOWN|LEFT|RIGHT)$`).test(button.command)),
      rotation: list.filter(button => new RegExp(`^${prefix}(LEFT|RIGHT)$`).test(button.command)),
      click: find(`${prefix}3`), ring: find(`${prefix}RING`), touch: find(`${prefix}TOUCH`) }
  }
  const segments = (side: 'left' | 'right') => Array.from({ length: Math.max(2, Math.min(25, Number(getKeymapValue(projected, `${side.toUpperCase()}_STICK_MENU_SIZE`)) || 8)) }, (_, i) => ({
    command: `${side === 'left' ? 'L' : 'R'}M${i + 1}`, descriptionKey: 'keymap.stickSegment', playstation: `Segment ${i + 1}`, xbox: `Segment ${i + 1}`,
  }))
  return <SettingPrefix prefix={`${trigger},`}><SticksPage readText={projected} setText={setProjected}
    modeShift={{ trigger, label: heldInputName(props.target, props.modifiers, trigger), side }}
    inputs={{ left: inputs('left'), right: inputs('right') }}
    onModeChange={(SIDE, value) => props.onChange(previous => writeModeshift(detachStickMenu(previous, side, trigger), trigger, `${SIDE}_STICK_MODE`, value || 'NO_MOUSE'))}
    renderButton={(button, options) => <ShiftedBinding {...props} trigger={trigger} button={button} defaultOpen={options?.defaultOpen} rowLabel={options?.label} subtitle={options?.subtitle} xAction={options?.xAction} />}
    renderModeshifts={() => null} modeshiftTarget={() => props.target} describe={describe}
    wheelMenus={{ left: resolveOverlayMenus(props.text)[`LSTICK:${trigger}`], right: resolveOverlayMenus(props.text)[`RSTICK:${trigger}`] }}
    wheelSegments={{ left: segments('left'), right: segments('right') }}
    menuConfig={{ text: props.text, onChange: props.onChange, trigger }} virtualControllerType={props.virtualControllerType}
    onVirtualControllerTypeChange={value => props.onChange(previous => updateKeymapEntry(previous, 'VIRTUAL_CONTROLLER', [value]))}
    onBindWasd={side => setProjected(previous => Object.entries({ UP: 'W', LEFT: 'A', DOWN: 'S', RIGHT: 'D' }).reduce((next, [key, value]) => updateKeymapEntry(next, `${side === 'left' ? 'L' : 'R'}${key}`, [value]), previous))} />
  </SettingPrefix>
}

function TriggerModeshiftBody({ trigger, ...props }: InputModeshiftsProps & { trigger: string }) {
  const { t } = useTranslation()
  const side = props.target.mode!.key === 'ZL_MODE' ? 'left' : 'right'
  const projected = useMemo(() => projectModeshift(props.text, trigger), [props.text, trigger])
  const setProjected = useCallback<Dispatch<SetStateAction<string>>>(update => {
    const next = typeof update === 'function' ? update(projected) : update
    props.onChange(previous => foldModeshift(previous, trigger, next, {}, projected))
  }, [props.onChange, projected, trigger])
  const read = (key: string, fallback = '') => getKeymapValue(projected, key) ?? fallback
  const write = (key: string, value: string) => props.onChange(previous => writeModeshift(previous, trigger, key, value))
  return <SettingPrefix prefix={`${trigger},`}><TriggersPage readText={projected} setText={setProjected}
    modeShift={{ trigger, label: heldInputName(props.target, props.modifiers, trigger), side }}
    zlMode={read('ZL_MODE', 'NO_FULL')} zrMode={read('ZR_MODE', 'NO_FULL')} onModeChange={(side, value) => write(side === 'left' ? 'ZL_MODE' : 'ZR_MODE', value)}
    threshold={Number(read('TRIGGER_THRESHOLD', '0.5'))} onThresholdChange={value => write('TRIGGER_THRESHOLD', value)}
    adaptiveValue={read('ADAPTIVE_TRIGGER', 'OFF')} onAdaptiveChange={value => write('ADAPTIVE_TRIGGER', value)}
    buttons={{ left: TRIGGER_BUTTONS.filter(button => /^ZLF?$/.test(button.command)), right: TRIGGER_BUTTONS.filter(button => /^ZRF?$/.test(button.command)) }}
    renderButton={(button, options) => <ShiftedBinding {...props} trigger={trigger} button={button} defaultOpen={options?.defaultOpen} rowLabel={options?.label} subtitle={options?.subtitle} />}
    renderModeshifts={() => null} describe={command => ({ binding: describeBinding(read(command), t), label: getBindingLabel(projected, command) })}
    virtualControllerType={props.virtualControllerType}
    onVirtualControllerTypeChange={value => props.onChange(previous => updateKeymapEntry(previous, 'VIRTUAL_CONTROLLER', [value]))} />
  </SettingPrefix>
}

/** One shift in the list: the held button's glyph, what it turns the input into. */
function ShiftRow({ trigger, onOpen, ...props }: InputModeshiftsProps & { trigger: string; onOpen: () => void }) {
  const { t } = useTranslation()
  const summary = useShiftSummary(props, trigger)
  const heldName = heldInputName(props.target, props.modifiers, trigger)
  const released = isReleasedInput(trigger)
  return (
    <OpenRow onOpen={onOpen} hint={summary} hints="A:Change settings;X:Remove;Y:Change button;B:Back" data={{ 'data-modeshift': trigger }}
      label={<span className={styles.rowLabel}><InputGlyph command={heldInput(trigger)} family={props.controllerFamily} size={28} />
        {released ? t('keymap.modeshiftRowReleased', '{{held}} let go', { held: heldName }) : t('keymap.modeshiftRowHeld', '{{held}} held', { held: heldName })}</span>} />
  )
}

/** One shift's editor, on a page of its own: which button, held or let go, then what changes. */
function ShiftEditor({ trigger, triggers, onRename, onRemove, onClose, onPickButton, ...props }: InputModeshiftsProps & {
  trigger: string; triggers: string[]; onRename: (from: string, to: string) => void; onRemove: () => void; onClose: () => void; onPickButton: () => void
}) {
  const { t } = useTranslation()
  const { target, text, onChange } = props
  const heldName = heldInputName(target, props.modifiers, trigger)
  const released = isReleasedInput(trigger)
  const ownBinding = target.grid ? getKeymapValue(text, trigger) : undefined
  const write = (key: string, value: string) => onChange(previous => writeModeshift(previous, trigger, key, value))
  const mode = target.mode ? readShifted(text, trigger, target.mode.key) ?? target.mode.defaultValue : ''
  const title = released ? t('keymap.modeshiftTitleReleased', 'Mode shift · {{held}} let go', { held: heldName }) : t('keymap.modeshiftTitleHeld', 'Mode shift · {{held}}', { held: heldName })
  return (
    <SubPage open onClose={onClose} trail={[target.title]} title={title} backLabel="Back">
      <div className={styles.editor} data-modeshift-editor={trigger}>
        <OpenRow label={t('keymap.modeshiftHeldInput', 'Held button')} hint="Pick another button for this change" value={heldName} onOpen={onPickButton}
          icon={<InputGlyph command={heldInput(trigger)} family={props.controllerFamily} size={26} />} hints="A:Pick button;B:Back" data={{ 'data-modeshift-button': '' }} />
        <SegmentedRow label={t('keymap.modeshiftWhen', 'When')} value={released ? 'released' : 'held'}
          disabled={triggers.includes(withRelease(trigger, !released)) ? 'This button already has the other one' : undefined}
          options={[{ value: 'held', label: 'While held', caption: 'The change lasts while the button is down' }, { value: 'released', label: 'While let go', caption: 'The change lasts while the button is up' }]}
          onChange={value => onRename(trigger, withRelease(trigger, value === 'released'))} />
        {target.mode && !props.renderEditor && !target.pad && !/^(?:(LEFT|RIGHT)_STICK_MODE|Z[LR]_MODE)$/.test(target.mode.key) && (
          <SegmentedRow label={t('keymap.modeshiftShiftedMode', 'Mode while held')} setting={trigger + ',' + target.mode.key} value={mode}
            options={target.mode.options.map(option => ({ value: option.value, label: option.label }))} onChange={value => write(target.mode!.key, value)} />
        )}
        {ownBinding && ownBinding !== 'NONE' && (
          <p className={styles.hint}>{t('keymap.shiftTriggerOwnBinding', '{{held}} also sends {{binding}} of its own. Clear it on its row if you only want the shift.', { held: heldName, binding: describeBinding(ownBinding, t) })}</p>
        )}
        {props.renderEditor ? props.renderEditor(trigger) : target.pad
          ? <PadModeshiftBody {...props} trigger={trigger} heldName={heldName} />
          : target.mode && /^(LEFT|RIGHT)_STICK_MODE$/.test(target.mode.key)
          ? <StickModeshiftBody {...props} trigger={trigger} />
          : target.mode && /^Z[LR]_MODE$/.test(target.mode.key)
          ? <TriggerModeshiftBody {...props} trigger={trigger} />
          : (
            <div className={styles.bindings}>
              {target.buttons.map(button => <ShiftedBinding key={button.command} {...props} trigger={trigger} button={definitionFor(button)} />)}
            </div>
          )}
        <OpenRow label={t('keymap.removeModeshift', 'Remove mode shift')} hint="No change while this button is held" onOpen={onRemove}
          icon={<Icon name="remove" size={20} />} hints="A:Remove;B:Back" data={{ 'data-remove-modeshift': '' }} />
      </div>
    </SubPage>
  )
}

/**
 * Every mode shift on one pad or stick: a calm list of "LB held" rows
 * (console v2), each opening its own page, with the button chosen on the same
 * "Hold which button?" sheet the Chords page uses. Unlike Steam
 * Input a control can have any number of these.
 */
export function InputModeshifts(props: InputModeshiftsProps & { heading?: ReactNode }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<string | null>(null)
  // 'new' / 'new-released' add a shift; 'change' rebinds the open one.
  const [picking, setPicking] = useState<null | 'new' | 'new-released' | 'change'>(null)
  const anchor = useRef<HTMLElement>(null)
  const { target, text } = props
  const rename = (from: string, to: string) => {
    if (from === to || modeshiftTriggers(props.text, props.target).includes(to)) return
    setEditing(current => current === from ? to : current)
    props.onChange(previous => renameModeshift(previous, props.target, from, to))
  }
  // A scan of the whole config; the target is rebuilt by the caller on every
  // render, so it is keyed on what the scan actually reads from it.
  const targetKey = `${target.id}|${target.buttons.map(button => button.command).join(',')}|${target.mode?.key ?? ''}|${target.settings?.join(',') ?? ''}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const triggers = useMemo(() => modeshiftTriggers(text, target), [text, targetKey])
  const remove = (trigger: string) => { setEditing(current => current === trigger ? null : current); props.onChange(previous => removeModeshift(previous, target, trigger)) }

  // X removes a shift and Y changes its button, from the list.
  const latest = useRef({ remove, openPicker: (_trigger: string) => {} })
  latest.current = { remove, openPicker: trigger => { setEditing(trigger); setPicking('change') } }
  useEffect(() => {
    const node = anchor.current
    if (!node) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      const row = (event.target as Element | null)?.closest<HTMLElement>('[data-modeshift]')
      if (!row?.dataset.modeshift) return
      if (button === 'X') { event.preventDefault(); latest.current.remove(row.dataset.modeshift) }
      else if (button === 'Y') { event.preventDefault(); latest.current.openPicker(row.dataset.modeshift) }
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [])

  // Opened for one held button from elsewhere (a chord's "Also shifts", a stick
  // mode shift chip, Controller action ▸ Stick mode shift): its editor.
  const shiftRequest = useModeshiftRequestVersion()
  useEffect(() => {
    const side = target.mode?.key === 'LEFT_STICK_MODE' ? 'left' : target.mode?.key === 'RIGHT_STICK_MODE' ? 'right' : null
    if (!side || !shiftRequest || shiftRequest.side !== side) return
    const request = takeModeshiftRequest('joysticks', side)
    if (!request) return
    if (!modeshiftTriggers(text, target).includes(request.trigger)) {
      if (!request.create) return
      props.onChange(previous => addModeshift(previous, target, request.trigger))
    }
    setEditing(request.trigger)
  }, [shiftRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  const taken = triggers.map(trigger => heldInput(trigger))
  const rebinding = picking === 'change' && editing ? editing : null
  return (
    <section ref={anchor} className={styles.list} aria-label={`${target.title} mode shifts`} data-modeshift-list={target.id}>
      {typeof props.heading === 'string' && <h3 className={styles.listHeading}>{props.heading}</h3>}
      {triggers.length === 0 && <p className={styles.hint}>{t('keymap.modeshiftNone', 'None yet. Add a button to hold, then change how this works while it is held.')}</p>}
      {triggers.map(trigger => <ShiftRow key={trigger} {...props} trigger={trigger} onOpen={() => setEditing(trigger)} />)}
      <OpenRow label={t('keymap.modeshiftAddButton', 'Add a button')} hint="Pick the button to hold" onOpen={() => setPicking('new')} hints="A:Pick button;B:Back" data={{ 'data-add-modeshift': '' }} />
      <OpenRow label="Add a button to let go of" hint="Changes this while the button is up, like a binding's Let go" onOpen={() => setPicking('new-released')} hints="A:Pick button;B:Back" data={{ 'data-add-modeshift-released': '' }} />
      {editing && triggers.includes(editing) && (
        <ShiftEditor {...props} trigger={editing} triggers={triggers} onRename={rename} onClose={() => setEditing(null)}
          onRemove={() => remove(editing)} onPickButton={() => setPicking('change')} />
      )}
      {picking && (
        <AddModeshiftSheet inputName={target.title} command={target.buttons[0]?.command ?? ''} family={props.controllerFamily ?? 'generic'} modifiers={props.modifiers}
          taken={rebinding ? taken.filter(item => item !== heldInput(rebinding)) : taken} initial={rebinding ? heldInput(rebinding) : null}
          eyebrow={rebinding ? `${target.title} · Change the button` : picking === 'new-released' ? `${target.title} · Mode shift · let go` : `${target.title} · Mode shift`}
          onClose={() => setPicking(null)}
          onNext={picked => {
            if (rebinding) rename(rebinding, withRelease(picked, isReleasedInput(rebinding)))
            else {
              const trigger = withRelease(picked, picking === 'new-released')
              props.onChange(previous => addModeshift(previous, target, trigger))
              setEditing(trigger)
            }
            setPicking(null)
          }} />
      )}
    </section>
  )
}
