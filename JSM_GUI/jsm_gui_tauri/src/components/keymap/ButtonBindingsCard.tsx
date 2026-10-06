import { memo, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BindingCommand,
  BindingCommandPatch,
  BindingCommandPreset,
  BindingTriggerKind,
  bindingCommandToToken,
  commandTokenPreview,
  commandForValue,
  commandNameKey,
  heldLedCommandId,
  inferOutputKindFromBindingValue,
  isFixedCommand,
  layerActionCommandId,
  parseRowsToCommands,
  updateCommandExpression,
} from '../../utils/bindingCommands'
import {
  BindingSlot,
  ButtonBindingRow,
  ManualRowInfo,
  ManualRowState,
  appendBaseLineTokens,
  createBindingExpression,
  parseBindingExpression,
  removeBindingExpressionToken,
  replaceBaseLineToken,
  serializeBindingExpression,
  serializeBindingToken,
} from '../../utils/keymap'
import keymapStyles from '../Keymap.module.css'
import {
  MODIFIER_SLOT_TYPES,
  getActionSpecialOptionList,
  getDefaultModifierForButton,
  getSpecialOptionList,
  isGyroButtonSettingSpecial,
  type ButtonDefinition,
} from '../../keymap/schema'
import { BindingCommandCard } from './BindingCommandCard'
import { NumberField } from '../NumberField'
import { controllerButtonLabel, type ControllerVisualFamily } from '../../utils/controllerStatus'
import { InputGlyph } from '../glyphs/InputGlyph'

import { ButtonMappingCard, type BindingSummaryEntry } from './ButtonMappingCard'
import { BindingIconArt, IconPicker } from './IconPicker'
import { BindingLabelField } from './BindingLabelField'
import { ButtonGlyph } from '../glyphs/ButtonGlyph'
import { Lane, LaneAddButton, LaneSideButton, laneStyles, useJustAdded } from './Lane'
import { ActionPicker } from './ActionPicker'
import { InputModeshiftPanel } from './InputModeshiftPanel'
import { inputLongName, inputShortName } from '../../keymap/inputNames'
import type { InputModeshiftsProps } from './InputModeshifts'
import type { ModeshiftSummary } from '../../utils/modeshift'
import { TRIGGER_LABEL_KEYS } from './triggerKinds'
import { getVirtualControllerLogicalOutput, type VirtualControllerType } from '../../utils/virtualController'
import { describeCommandOutput, explainCommandOutput } from '../../utils/bindingDescription'
import { LayerUsageContext } from '../LayerBar'
import { actionsOnInput, sameLayerAction, type LayerAction } from '../../utils/layers'
import { hasBindingParameters } from '../../utils/bindingParameters'

type ButtonBindingsCardProps = {
  /** The LED while this input is held (TODO-54): the chorded LIGHT_BAR and
   *  LED_BRIGHTNESS settings, shown as one command row. Omitted where the
   *  card has no input of its own to chord them on. */
  heldLedColor?: string | null
  heldLedBrightness?: number | null
  baseLedBrightness?: number
  /** The profile's (or the app's) LED colour: what a new LED row starts from. */
  defaultLedColor?: string
  onHeldLedColorChange?: (color: string | null) => void
  onHeldLedBrightnessChange?: (brightness: number | null) => void
  button: ButtonDefinition
  /**
   * What this card is called in the DOM, when that is not the input's own
   * command. A shifted card edits the same input under a chorded key, so it
   * needs its own identity for focus, rename and jump-to-binding.
   */
  domCommand?: string
  rows: ButtonBindingRow[]
  modifierOptions: { value: string; label: string; disabled?: boolean }[]
  specialsByButton: Record<string, string | undefined>
  stickModeShiftAssignments?: Record<string, { target: 'LEFT' | 'RIGHT'; mode: string }[]>
  stickShiftDisplayModes: Record<string, 'tap' | 'extra'>
  updateStickShiftDisplayMode: (buttonKey: string, mode?: 'tap' | 'extra') => void
  manualRows: Record<string, ManualRowState>
  ensureManualRow: (button: string, slot: BindingSlot, defaults?: Partial<ManualRowInfo>) => string
  updateManualRow: (button: string, slot: BindingSlot, rowId: string, info: Omit<ManualRowInfo, 'id'>) => void
  removeManualRow: (button: string, slot: BindingSlot, rowId?: string) => void
  getRowEditorMode: (button: string, slot: BindingSlot, rowId: string) => 'simple' | 'advanced' | undefined
  setRowEditorMode: (button: string, slot: BindingSlot, rowId: string, mode?: 'simple' | 'advanced') => void
  captureLabel: string
  // Set when this button's binding comes from an imported file rather than
  // this profile.
  inheritedFrom?: string | null
  onOpenConfigEditor?: () => void
  isCapturing: (button: string, slot: BindingSlot, rowId?: string) => boolean
  isCapturingValue: (key: string) => boolean
  beginCapture: (
    button: string,
    slot: BindingSlot,
    rowId: string,
    label: string,
    modifier?: string,
    writeMode?: 'slot' | 'line'
  ) => void
  beginValueCapture: (key: string, label: string, onCaptured: (value: string) => void) => void
  cancelCapture: () => void
  onBindingChange: (
    button: string,
    slot: BindingSlot,
    rowId: string,
    value: string | null,
    options?: { modifier?: string; writeMode?: 'slot' | 'line' }
  ) => void
  onModifierChange: (
    button: string,
    slot: BindingSlot,
    rowId: string,
    previousModifier: string | undefined,
    nextModifier: string,
    binding: string | null
  ) => void
  onAssignSpecialAction: (special: string, buttonCommand: string) => void
  onClearSpecialAction: (special: string, buttonCommand: string) => void
  onStickModeShiftChange?: (button: string, target: 'LEFT' | 'RIGHT', mode?: string) => void
  trackballDecay: string
  onTrackballDecayChange: (value: string) => void
  virtualControllerType: VirtualControllerType
  /** Configurations this profile can switch to, for a load-config binding. */
  libraryProfiles?: string[]
  /** The configuration being edited, so it can be marked in that list. */
  currentProfileName?: string | null
  /** Which controller's glyphs to draw beside the input's name. */
  controllerFamily?: ControllerVisualFamily
  onEnableVirtualController?: () => void
  commandLabels?: Record<string, string>
  bindingLabel?: string
  bindingIcon?: string
  onBindingIconChange?: (command: string, icon: string) => void
  onBindingLabelChange?: (command: string, label: string) => void
  /** Bindings on the shared clipboard, ready to paste onto this button. */
  bindingClipboard?: BindingCommandPreset[]
  /** Replace the shared clipboard with the given bindings (copy). */
  onCopyBindings?: (presets: BindingCommandPreset[]) => void
  /** Start expanded; see ButtonMappingCard. */
  defaultOpen?: boolean
  /** The row's name where the block around it already names the input, like
      "Soft pull" inside Left trigger. */
  label?: string
  /** The subtitle under that name, when the binding itself is not it. */
  subtitle?: string
  /** What an unbound row says instead of Unbound. */
  emptyLabel?: string
  /** Everything the input's modeshift panel needs; omitted where a group or
      pad owns the shifts, and on a shifted card. */
  modeshiftPanel?: Omit<InputModeshiftsProps, 'target' | 'initiallyOpen' | 'livePad'>
  /** What X does on the closed row instead of capturing. */
  xAction?: { label: string; run: () => void }
  /** The shifts that reconfigure this input; the first shows on its compact row. */
  modeshifts?: ModeshiftSummary[]
  /** Chord bindings are edited in this group's modeshift panel, not here. */
  chordsLiveInModeshifts?: boolean
  /** Just the lanes, for a card inside a sheet (a modeshift's commands). */
  embedded?: boolean
}

const triggerToSlot = (trigger: BindingTriggerKind): BindingSlot => {
  switch (trigger) {
    case 'hold':
      return 'hold'
    case 'double':
      return 'double'
    case 'chord':
      return 'chord'
    case 'simultaneous':
      return 'simultaneous'
    case 'diagonal':
      return 'diagonal'
    case 'regular':
    case 'tap':
    case 'release':
    case 'turbo':
    case 'stickShift':
    default:
      return 'tap'
  }
}

const triggerUsesBaseLine = (trigger: BindingTriggerKind) =>
  trigger === 'regular' || trigger === 'tap' || trigger === 'hold' || trigger === 'release' || trigger === 'turbo'

const hasOutputValue = (command: Pick<BindingCommandPreset, 'outputValue'>) => command.outputValue.trim().length > 0

// Memoised: the page around it re-renders on every telemetry frame, and a
// card only changes with the config, the capture state or the clipboard.
// KeymapControls keeps every prop's identity stable for the same reason.
export const ButtonBindingsCard = memo(function ButtonBindingsCard({
  button,
  heldLedColor,
  heldLedBrightness,
  baseLedBrightness = 100,
  defaultLedColor,
  onHeldLedColorChange,
  onHeldLedBrightnessChange,
  domCommand,
  rows,
  modifierOptions,
  specialsByButton,
  stickModeShiftAssignments,
  updateStickShiftDisplayMode,
  ensureManualRow,
  updateManualRow,
  removeManualRow,
  isCapturing,
  isCapturingValue,
  beginValueCapture,
  onBindingChange,
  onAssignSpecialAction,
  onClearSpecialAction,
  onStickModeShiftChange,
  trackballDecay,
  onTrackballDecayChange,
  virtualControllerType,
  libraryProfiles,
  currentProfileName,
  controllerFamily = 'generic',
  onEnableVirtualController,
  commandLabels,
  bindingLabel,
  bindingIcon,
  onBindingIconChange,
  onBindingLabelChange,
  bindingClipboard = [],
  onCopyBindings,
  chordsLiveInModeshifts,
  defaultOpen,
  label,
  subtitle,
  emptyLabel,
  modeshiftPanel,
  xAction,
  modeshifts,
  beginCapture,
  embedded,
}: ButtonBindingsCardProps) {
  const { t } = useTranslation()

  // Captures are registered against this, and a command id is built from the
  // input's own command -- so a shifted card and the normal card for the same
  // input would register under the same key, leaving both rows showing as
  // capturing and the captured value landing on whichever registered last.
  // `domCommand` is what tells the two apart.
  const captureKeyFor = (command: BindingCommand) =>
    domCommand ? `${domCommand}:${command.id}` : command.id
  const buttonKey = button.command.toUpperCase()
  const specialKey = specialsByButton[button.command]
  const stickShiftEntries = useMemo(
    () => stickModeShiftAssignments?.[buttonKey] ?? [],
    [buttonKey, stickModeShiftAssignments]
  )
  const allSpecialOptionList = useMemo(
    () => [
      { value: 'NONE', label: 'NONE' },
      { value: 'DEFAULT', label: 'DEFAULT' },
      { value: 'CALIBRATE', label: 'Calibrate while held (raw)' },
      ...getSpecialOptionList(t),
    ].filter((option, index, source) => source.findIndex(candidate => candidate.value === option.value) === index),
    [t]
  )
  const actionSpecialOptionList = useMemo(
    () => [
      { value: 'NONE', label: 'NONE' },
      { value: 'DEFAULT', label: 'DEFAULT' },
      { value: 'CALIBRATE', label: 'Calibrate while held (raw)' },
      ...getActionSpecialOptionList(t),
    ].filter((option, index, source) => source.findIndex(candidate => candidate.value === option.value) === index),
    [t]
  )
  const isShifted = Boolean(domCommand?.includes(','))
  // A menu item (3d): a region or segment of an on-screen menu, which has an
  // icon and a label on the menu and nothing but commands behind them.
  const menuItem = Boolean(onBindingIconChange)
  // The LED while held and the layer actions are the input's own (TODO-54,
  // TODO-55): a shifted card and a menu item chord and annotate nothing.
  const { actions: layerActions, onSetActions, layers } = useContext(LayerUsageContext)
  const ownsExtras = !menuItem && !isShifted
  const heldLed = useMemo(
    () => (ownsExtras && onHeldLedColorChange ? { color: heldLedColor ?? null, brightness: heldLedBrightness ?? null } : null),
    [ownsExtras, onHeldLedColorChange, heldLedColor, heldLedBrightness]
  )
  const myLayerActions = useMemo(
    () => (ownsExtras && onSetActions ? actionsOnInput(layerActions, button.command) : undefined),
    [ownsExtras, onSetActions, layerActions, button.command]
  )
  const commands = useMemo(
    () => parseRowsToCommands(rows, button.command, { specialKey, stickShiftAssignments: stickShiftEntries, heldLed, layerActions: myLayerActions }),
    [button.command, rows, specialKey, stickShiftEntries, heldLed, myLayerActions]
  )
  const rowCapturing = rows.some(row => isCapturing(button.command, row.slot, row.id)) || commands.some(command => isCapturingValue(captureKeyFor(command))) || isCapturingValue(`${domCommand ?? button.command}:new`)
  const buttonHasTrackball = commands.some(command => command.outputValue.toUpperCase().includes('TRACK'))
  const defaultModifier = getDefaultModifierForButton(button.command, modifierOptions)

  // A second command on the base line is written with its modifier, so a
  // Press added beside a Press stays a press for both (`SPACE\ J\`) rather
  // than the pair reading as tap-then-hold by JoyShockMapper's position rule.
  const addCommandToBaseLine = (preset: BindingCommandPreset) => {
    if (!hasOutputValue(preset)) return
    const baseRow = rows.find(row => row.slot === 'tap')
    const existingTokens = baseRow?.expression?.tokens ?? []
    const token = bindingCommandToToken(preset)
    const expression = createBindingExpression(appendBaseLineTokens(existingTokens, [token, ...(preset.ledBrightness !== null && preset.ledBrightness !== undefined ? [{ ...token, value: `LED_BRIGHTNESS = ${preset.ledBrightness}`, raw: '' }] : [])]))
    onBindingChange(button.command, 'tap', baseRow?.id ?? `${button.command}-tap`, serializeBindingExpression(expression), { writeMode: 'line' })
  }

  const commandSlot = (trigger: BindingTriggerKind) => (triggerUsesBaseLine(trigger) ? 'tap' : triggerToSlot(trigger))

  const manualInfoForCommand = (command: BindingCommandPreset, modifier?: string): Omit<ManualRowInfo, 'id'> => ({
    modifierCommand: modifier,
    manualTriggerKind: command.triggerKind,
    manualOutputKind: command.outputKind,
    manualOutputBehavior: command.outputBehavior,
    manualOutputValue: command.outputValue,
  })

  const addDraftCommand = (preset: BindingCommandPreset) => {
    if (preset.triggerKind === 'stickShift') {
      onStickModeShiftChange?.(button.command, 'RIGHT', 'NO_MOUSE')
      updateStickShiftDisplayMode(buttonKey, 'extra')
      return
    }
    const slot = commandSlot(preset.triggerKind)
    const modifier = MODIFIER_SLOT_TYPES.includes(slot) ? preset.conditionInput || defaultModifier : preset.conditionInput
    ensureManualRow(button.command, slot, manualInfoForCommand({ ...preset, conditionInput: modifier }, modifier))
  }

  const writeCommand = (preset: BindingCommandPreset) => {
    if (preset.triggerKind === 'stickShift') {
      onStickModeShiftChange?.(button.command, 'RIGHT', 'NO_MOUSE')
      updateStickShiftDisplayMode(buttonKey, 'extra')
      return
    }
    if (preset.outputKind === 'special' && isGyroButtonSettingSpecial(preset.outputValue)) {
      onAssignSpecialAction(preset.outputValue, button.command)
      return
    }
    if (!hasOutputValue(preset)) {
      addDraftCommand(preset)
      return
    }
    if (triggerUsesBaseLine(preset.triggerKind)) {
      addCommandToBaseLine(preset)
      return
    }
    const slot = triggerToSlot(preset.triggerKind)
    const modifier = MODIFIER_SLOT_TYPES.includes(slot) ? preset.conditionInput || defaultModifier : undefined
    const rowId = ensureManualRow(button.command, slot, modifier ? { modifierCommand: modifier } : undefined)
    onBindingChange(button.command, slot, rowId, serializeBindingToken(bindingCommandToToken(preset)), modifier ? { modifier } : undefined)
  }

  // Layer actions (TODO-55): one row per annotation on this input. Replacing
  // one keeps every other action, but an input holds one action per layer for
  // each of press and release, so a change that lands on another's layer and
  // input takes that one's place.
  const setLayerAction = (from: LayerAction | null, to: LayerAction | null) => {
    if (!onSetActions || !myLayerActions) return
    const rest = myLayerActions.filter(action => !(from && sameLayerAction(action, from)) && !(to && action.layerId === to.layerId && action.input === to.input))
    onSetActions(button.command, to ? [...rest, to] : rest)
  }

  const removeCommand = (command: BindingCommand, preserveName = false) => {
    if (!preserveName) onBindingLabelChange?.(commandNameKey(command, commands, domCommand ?? button.command), '')
    if (command.source.kind === 'special') {
      onClearSpecialAction(command.source.specialKey, button.command)
      return
    }
    if (command.source.kind === 'heldLed') {
      // Both settings go: the row is the pair of them.
      onHeldLedColorChange?.(null)
      onHeldLedBrightnessChange?.(null)
      return
    }
    if (command.source.kind === 'layerAction') {
      setLayerAction(command.source.action, null)
      return
    }
    if (command.source.kind === 'stickShift') {
      onStickModeShiftChange?.(button.command, command.source.target)
      updateStickShiftDisplayMode(buttonKey, undefined)
      return
    }
    if (command.source.isManual && !command.source.expression) {
      removeManualRow(button.command, command.source.slot, command.source.rowId)
      return
    }
    if (command.source.writeMode === 'line' && command.source.expression && command.source.expression.tokens.length > 1) {
      const withoutBrightness = command.source.ledBrightnessTokenIndex !== undefined
        ? removeBindingExpressionToken(command.source.expression, command.source.ledBrightnessTokenIndex) : command.source.expression
      const expression = withoutBrightness ? removeBindingExpressionToken(withoutBrightness, command.source.tokenIndex) : null
      onBindingChange(
        button.command,
        command.source.slot,
        command.source.rowId,
        expression ? serializeBindingExpression(expression) : null,
        { modifier: command.conditionInput, writeMode: 'line' }
      )
      return
    }
    onBindingChange(
      button.command,
      command.source.slot,
      command.source.rowId,
      null,
      command.conditionInput ? { modifier: command.conditionInput, writeMode: command.source.writeMode } : { writeMode: command.source.writeMode }
    )
    if (command.source.isManual) {
      removeManualRow(button.command, command.source.slot, command.source.rowId)
    }
  }

  const updateDraftCommand = (command: BindingCommand, nextCommand: BindingCommand) => {
    if (command.source.kind !== 'row') return
    const slot = commandSlot(nextCommand.triggerKind)
    const modifier = MODIFIER_SLOT_TYPES.includes(slot) ? nextCommand.conditionInput || defaultModifier : nextCommand.conditionInput
    const info = manualInfoForCommand({ ...nextCommand, conditionInput: modifier }, modifier)
    if (slot !== command.source.slot) {
      removeManualRow(button.command, command.source.slot, command.source.rowId)
      ensureManualRow(button.command, slot, { id: command.source.rowId, ...info })
      return
    }
    updateManualRow(button.command, command.source.slot, command.source.rowId, info)
  }

  const updateCommand = (command: BindingCommand, patch: BindingCommandPatch) => {
    if (patch.ledActivation) {
      const previousNameKey = commandNameKey(command, commands, domCommand ?? button.command)
      const previousName = commandLabels?.[previousNameKey]
      const renameLed = (next: BindingCommand) => {
        if (!previousName || !onBindingLabelChange) return
        onBindingLabelChange(previousNameKey, '')
        onBindingLabelChange(commandNameKey(next, [], domCommand ?? button.command), previousName)
      }
      if (patch.ledActivation === 'press' && command.source.kind === 'heldLed') {
        added.expect()
        sheetOnNextAdd.current = true
        const color = command.source.color ?? defaultLedColor ?? '#ffffff'
        removeCommand(command, true)
        const outputValue = `LIGHT_BAR = x${color.slice(1)}`
        writeCommand({ triggerKind: 'regular', outputKind: 'command', outputValue, outputBehavior: 'tapOnce', ledBrightness: command.source.brightness })
        renameLed(commandForValue(button.command, `"${outputValue}"`))
      } else if (patch.ledActivation === 'hold' && command.source.kind === 'row') {
        const color = /^LIGHT_BAR\s*=\s*x([0-9a-f]{6})/i.exec(command.outputValue)?.[1]
        if (!color || !onHeldLedColorChange) return
        setOpenSettingsFor(heldLedCommandId(button.command))
        removeCommand(command, true)
        onHeldLedColorChange(`#${color}`)
        renameLed({ ...command, source: { kind: 'heldLed', color: `#${color}`, brightness: command.ledBrightness ?? null } })
        onHeldLedBrightnessChange?.(command.ledBrightness ?? null)
      }
      return
    }
    if (patch.outputValue && patch.outputValue !== command.outputValue && onBindingLabelChange) {
      const previousKey = commandNameKey(command, commands, domCommand ?? button.command)
      const name = commandLabels?.[previousKey]
      if (name) {
        onBindingLabelChange(previousKey, '')
        onBindingLabelChange(commandNameKey({ ...command, ...patch }, [], domCommand ?? button.command), name)
      }
    }
    // The two fixed rows edit their setting or annotation, nothing else: they
    // have no token to retarget, so a trigger or output patch is ignored.
    if (command.source.kind === 'heldLed') {
      if (!patch.heldLed) return
      if ('color' in patch.heldLed) onHeldLedColorChange?.(patch.heldLed.color ?? null)
      if ('brightness' in patch.heldLed) onHeldLedBrightnessChange?.(patch.heldLed.brightness ?? null)
      return
    }
    if (command.source.kind === 'layerAction') {
      if (patch.layerAction) setLayerAction(command.source.action, { ...command.source.action, ...patch.layerAction })
      return
    }
    const nextCommand = {
      ...command,
      ...patch,
      virtualControllerLogicalOutput:
        patch.outputKind === 'virtualController' && patch.outputValue
          ? getVirtualControllerLogicalOutput(patch.outputValue) ?? patch.virtualControllerLogicalOutput ?? command.virtualControllerLogicalOutput
          : patch.outputKind && patch.outputKind !== 'virtualController'
            ? undefined
            : patch.virtualControllerLogicalOutput ?? command.virtualControllerLogicalOutput,
    }
    if (command.source.kind !== 'special' && nextCommand.outputKind === 'special' && isGyroButtonSettingSpecial(nextCommand.outputValue)) {
      removeCommand(command)
      onAssignSpecialAction(nextCommand.outputValue, button.command)
      return
    }
    if (command.source.kind === 'special') {
      if (nextCommand.outputKind === 'special') {
        onAssignSpecialAction(nextCommand.outputValue, button.command)
      }
      return
    }
    if (command.source.kind === 'stickShift') return

    // Emptying the output field used to fall through to the token serializer,
    // which substitutes its default (SPACE) for an empty value -- so deleting
    // the last character refilled the field. Drop the written binding and keep
    // the card as an empty draft row instead, so the field stays empty until
    // something is typed.
    if (!(command.source.isManual && !command.source.expression) && !hasOutputValue(nextCommand)) {
      const slot = commandSlot(nextCommand.triggerKind)
      const modifier = MODIFIER_SLOT_TYPES.includes(slot) ? nextCommand.conditionInput || defaultModifier : nextCommand.conditionInput
      // Config-backed rows keep their generated ids (`BUTTON-tap` and friends)
      // whether or not they hold a binding, so only a manual row's id is free
      // to reuse -- anything else has to become a new draft row.
      const reusableRowId = command.source.isManual ? command.source.rowId : undefined
      removeCommand(command)
      ensureManualRow(button.command, slot, {
        ...(reusableRowId ? { id: reusableRowId } : {}),
        ...manualInfoForCommand({ ...nextCommand, conditionInput: modifier }, modifier),
      })
      return
    }

    if (command.source.isManual && !command.source.expression) {
      if (!hasOutputValue(nextCommand)) {
        updateDraftCommand(command, nextCommand)
        return
      }
      writeCommand({
        triggerKind: nextCommand.triggerKind,
        outputKind: nextCommand.outputKind,
        outputValue: nextCommand.outputValue,
        outputBehavior: nextCommand.outputBehavior,
        turboIntervalMs: nextCommand.turboIntervalMs,
        conditionInput: nextCommand.conditionInput,
      })
      removeManualRow(button.command, command.source.slot, command.source.rowId)
      return
    }

    // A new activation that lives on another config line (Press → Chord, Double
    // → Press): the command moves there, rather than the change being dropped
    // because the line it is on cannot say it (3c, every kind on the chip).
    if (patch.triggerKind && patch.triggerKind !== command.triggerKind && command.source.slot !== commandSlot(nextCommand.triggerKind)) {
      removeCommand(command)
      writeCommand({
        triggerKind: nextCommand.triggerKind,
        outputKind: nextCommand.outputKind,
        outputValue: nextCommand.outputValue,
        outputBehavior: nextCommand.outputBehavior,
        turboIntervalMs: nextCommand.turboIntervalMs,
        conditionInput: nextCommand.conditionInput,
      })
      return
    }

    const targetSlot = commandSlot(nextCommand.triggerKind)

    // A row of a tap-and-hold pair (`R E`) is one token of a two-token line.
    // Writing its token as the line dropped the other one; the whole line is
    // rebuilt with this token replaced, each token keeping what it meant.
    const pairRow = rows.find(row => row.slot === 'tap' && row.writeMode === 'slot' && row.expression?.tokens.length === 2)
    if (pairRow && command.source.writeMode === 'slot' && (command.source.slot === 'tap' || command.source.slot === 'hold') && targetSlot === 'tap') {
      const tokens = replaceBaseLineToken(pairRow.expression!.tokens, command.source.slot === 'tap' ? 0 : 1, bindingCommandToToken(nextCommand))
      onBindingChange(button.command, 'tap', pairRow.id, serializeBindingExpression(createBindingExpression(tokens)), { writeMode: 'line' })
      return
    }

    const expression = updateCommandExpression(command, patch)
    if (!expression) return
    const nextValue = serializeBindingExpression(expression)
    const shouldWriteLine =
      command.source.writeMode === 'line' ||
      triggerUsesBaseLine(nextCommand.triggerKind) ||
      command.source.slot !== targetSlot

    if (shouldWriteLine) {
      if (command.source.slot !== 'tap' && targetSlot !== command.source.slot) {
        removeCommand(command)
        writeCommand({
          triggerKind: nextCommand.triggerKind,
          outputKind: nextCommand.outputKind,
          outputValue: nextCommand.outputValue,
          outputBehavior: nextCommand.outputBehavior,
        turboIntervalMs: nextCommand.turboIntervalMs,
          conditionInput: nextCommand.conditionInput,
        })
        return
      }
      onBindingChange(button.command, command.source.slot, command.source.rowId, nextValue, {
        modifier: nextCommand.conditionInput,
        writeMode: 'line',
      })
      return
    }

    if (command.source.slot !== targetSlot) {
      removeCommand(command)
      writeCommand({
        triggerKind: nextCommand.triggerKind,
        outputKind: nextCommand.outputKind,
        outputValue: nextCommand.outputValue,
        outputBehavior: nextCommand.outputBehavior,
        turboIntervalMs: nextCommand.turboIntervalMs,
        conditionInput: nextCommand.conditionInput,
      })
      return
    }

    if (nextCommand.conditionInput && command.source.modifierCommand && nextCommand.conditionInput !== command.source.modifierCommand) {
      updateManualRow(button.command, command.source.slot, command.source.rowId, { modifierCommand: nextCommand.conditionInput })
    }
    onBindingChange(button.command, command.source.slot, command.source.rowId, commandTokenPreview(nextCommand), {
      modifier: nextCommand.conditionInput,
      writeMode: command.source.writeMode,
    })
  }

  const commandToPreset = (command: BindingCommand): BindingCommandPreset => ({
    triggerKind: command.triggerKind,
    outputKind: command.outputKind,
    outputValue: command.outputValue,
    outputBehavior: command.outputBehavior,
    turboIntervalMs: command.turboIntervalMs,
    ledBrightness: command.ledBrightness,
    conditionInput: command.conditionInput,
  })

  // A setting or an annotation is one per input: nothing to duplicate, and a
  // preset cannot carry it to another input.
  const duplicateCommand = (command: BindingCommand) => {
    if (isFixedCommand(command)) return
    writeCommand(commandToPreset(command))
  }

  const copyableCommands = commands.filter(command => !isFixedCommand(command))
  const copyCommands = (picked: BindingCommand[]) => {
    const presets = picked.filter(command => !isFixedCommand(command)).map(commandToPreset)
    if (presets.length === 0) return
    onCopyBindings?.(presets)
  }

  // Base-line triggers (Press/Tap/Hold/...) all share one config line, so pasting
  // several of them one-by-one would each re-read the same pre-paste line and
  // clobber the last write. Merge those into a single expression, then let
  // writeCommand handle the slot-based triggers (Double/Chord/...) individually.
  const pasteBindings = () => {
    if (bindingClipboard.length === 0) return
    const baseLine = bindingClipboard.filter(
      preset =>
        hasOutputValue(preset) &&
        triggerUsesBaseLine(preset.triggerKind) &&
        !(preset.outputKind === 'special' && isGyroButtonSettingSpecial(preset.outputValue))
    )
    if (baseLine.length > 0) {
      const baseRow = rows.find(row => row.slot === 'tap')
      const existingTokens = baseRow?.expression?.tokens ?? []
      const expression = createBindingExpression(appendBaseLineTokens(existingTokens, baseLine.map(preset => bindingCommandToToken(preset))))
      onBindingChange(
        button.command,
        'tap',
        baseRow?.id ?? `${button.command}-tap`,
        serializeBindingExpression(expression),
        { writeMode: 'line' }
      )
    }
    bindingClipboard.filter(preset => !baseLine.includes(preset)).forEach(writeCommand)
  }

  // What a captured key or mouse button is, as the command's output.
  const capturedOutput = (value: string): Pick<BindingCommandPreset, 'outputKind' | 'outputValue'> => {
    const token = parseBindingExpression(value)?.tokens[0]
    return {
      outputKind:
        token?.kind === 'mouse'
          ? 'mouse'
          : token?.kind === 'wheel'
            ? 'wheel'
            : token?.kind === 'special'
              ? 'special'
              : inferOutputKindFromBindingValue(token?.value ?? value),
      outputValue: token?.value ?? value,
    }
  }

  const captureCommand = (command: BindingCommand) => {
    beginValueCapture(captureKeyFor(command), t('keymap.anyBindingPrompt'), value => {
      updateCommand(command, capturedOutput(value))
    })
  }

  // X on the closed row: the primary command takes the key, or a new Press
  // binding is captured when there is none.
  const capturePrimary = () => {
    const primary = commands.find(command => command.source.kind === 'row' && command.triggerKind !== 'stickShift')
    if (primary) {
      captureCommand(primary)
      return
    }
    const baseRow = rows.find(row => row.slot === 'tap')
    beginCapture(button.command, 'tap', baseRow?.id ?? `${button.command}-tap`, t('keymap.anyBindingPrompt'))
  }

  // Add command (5): the action picker straight away, as a Press; what it
  // chooses is written as a new command, which keeps focus and glows. Other
  // activations are the new row's chip; a console command is the picker's
  // Custom, a stick mode shift its JSM category.
  const [addingCommand, setAddingCommand] = useState(false)
  const added = useJustAdded(commands.map(command => command.id), id => `[data-command-row="${CSS.escape(id)}"] button[aria-label^="${t('keymap.chooseAction', 'Choose action')}"]`)
  // A command with a parameter (an LED colour or brightness, a sound, a
  // layer action) is added with a starting value and its sheet opens on the
  // new row, so the value is chosen where it is edited (TODO-54, TODO-55).
  // The row's id is known ahead for the fixed rows; a token row's is the one
  // that was not there before, which useJustAdded finds.
  const [openSettingsFor, setOpenSettingsFor] = useState<string | null>(null)
  const sheetOnNextAdd = useRef(false)
  useEffect(() => {
    if (added.justAdded && sheetOnNextAdd.current) {
      sheetOnNextAdd.current = false
      setOpenSettingsFor(added.justAdded)
    }
  }, [added.justAdded])
  const hasParameter = hasBindingParameters
  const addChosen = (patch: BindingCommandPatch) => {
    added.expect()
    sheetOnNextAdd.current = hasParameter(patch.outputValue ?? '')
    writeCommand({ triggerKind: 'regular', outputKind: patch.outputKind ?? 'keyboard', outputValue: patch.outputValue ?? '', outputBehavior: 'normal' })
  }
  // LED while held (TODO-54): the profile's colour to begin with, and the
  // sheet to change it. Choosing it again on an input that has one only
  // opens that row's sheet.
  const addHeldLed = onHeldLedColorChange && heldLed ? () => {
    added.expect()
    setOpenSettingsFor(heldLedCommandId(button.command))
    if (!heldLed.color && heldLed.brightness === null) onHeldLedColorChange(defaultLedColor ?? '#ffffff')
  } : undefined
  // A layer (TODO-55): held while this input is down, with the sheet open to
  // make it a Toggle, Turn on or Turn off. An action this input already has
  // for the layer is replaced, as the lane's add did.
  const addLayerAction = onSetActions && myLayerActions ? (layerId: string) => {
    const action: LayerAction = { input: button.command, verb: 'hold', layerId }
    added.expect()
    setOpenSettingsFor(layerActionCommandId(button.command, action, [...myLayerActions.filter(other => !(other.layerId === layerId && other.input === button.command)), action]))
    setLayerAction(null, action)
  } : undefined
  // "Capture a key", X on Add command and X in its picker: another way to add
  // a command. The key becomes a new Press command, which glows and takes
  // focus like one chosen from the picker; nothing already on the input is
  // overwritten.
  const newCaptureKey = `${domCommand ?? button.command}:new`
  const captureNew = () => {
    beginValueCapture(newCaptureKey, t('keymap.anyBindingPrompt'), value => {
      added.expect()
      writeCommand({ triggerKind: 'regular', ...capturedOutput(value), outputBehavior: 'normal' })
    })
  }
  const capturingNew = isCapturingValue(newCaptureKey)
  const addStickShift = onStickModeShiftChange ? () => {
    onStickModeShiftChange(button.command, 'RIGHT', 'NO_MOUSE')
    updateStickShiftDisplayMode(buttonKey, 'extra')
  } : undefined

  const shortName = inputShortName(button, controllerFamily)
  const longName = label ?? inputLongName(button, controllerFamily, t)
  const closeLabel = `Close ${shortName}`
  const inputGlyph = menuItem ? undefined : <InputGlyph command={button.command} family={controllerFamily} size={28} />

  // Nothing bound yet: one press adds a Press command, as Steam Input's own
  // empty slot does. With a command there the same button offers the kinds.
  const addButtonProps = {
    concept: 'command' as const,
    label: t('keymap.addCommand'),
    hints: `A:Add command;X:Capture;B:${closeLabel}`,
    'data-pad-keys': 'X',
    onClick: () => setAddingCommand(true),
    // X on the add button captures a key instead (5).
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => { if (event.key === 'x' || event.key === 'X') { event.preventDefault(); captureNew() } },
  }
  const commandLabelKey = (command: BindingCommand) => {
    const input = (domCommand ?? button.command).toUpperCase()
    const key = commandNameKey(command, commands, input)
    // Legacy profiles label the input once. Keep that annotation on its first
    // command until a command-specific name exists, including explicit blanks.
    return commands[0] === command && commandLabels?.[key] === undefined && commandLabels?.[input] !== undefined ? input : key
  }
  const commandsLane = (
    <Lane concept="command" label={t('keymap.commandsHeading', 'Commands')} count={commands.length} twoUpFooter={!menuItem}
      footer={
        <>
          <LaneAddButton {...addButtonProps} />
          {!menuItem && <LaneSideButton glyph={<ButtonGlyph button="X" size={28} family={controllerFamily === 'generic' ? undefined : controllerFamily} />}
            label={t('keymap.captureAKey', 'Capture a key')} onClick={captureNew} hints={`A:Capture a key;B:${closeLabel}`} capturing={capturingNew} />}
        </>
      }>
      {commands.length > 0 && (
        <div className={laneStyles.rows} data-capture-ignore="true">
          {commands.map(command => (
            <BindingCommandCard
              key={command.id}
              inputLabel={controllerButtonLabel(button, controllerFamily)}
              inputShortName={shortName}
              command={command}
              defaultLedColor={defaultLedColor}
              baseLedBrightness={baseLedBrightness}
              openSettingsOnMount={openSettingsFor === command.id}
              onSettingsOpened={() => setOpenSettingsFor(null)}
              glyph={inputGlyph}
              // Output names are independent of the input or menu item identity.
              label={onBindingLabelChange ? commandLabels?.[commandLabelKey(command)] ?? '' : undefined}
              onLabelChange={onBindingLabelChange ? value => onBindingLabelChange(commandLabelKey(command), value) : undefined}
              modifierOptions={modifierOptions}
              specialOptions={command.source.kind === 'special' ? allSpecialOptionList : actionSpecialOptionList}
              virtualControllerType={virtualControllerType}
              libraryProfiles={libraryProfiles}
              currentProfileName={currentProfileName}
              isCapturing={isCapturingValue(captureKeyFor(command))}
              onUpdate={updateCommand}
              onRemove={removeCommand}
              chordsLiveInModeshifts={chordsLiveInModeshifts}
              onDuplicate={duplicateCommand}
              onCopy={onCopyBindings ? (picked) => copyCommands([picked]) : undefined}
              onCapture={captureCommand}
              closeLabel={closeLabel}
              onEnableVirtualController={onEnableVirtualController}
              justAdded={added.justAdded === command.id}
            />
          ))}
        </div>
      )}
      {addingCommand && (
        // Layers and LED while held are added from here too (TODO-54, TODO-55):
        // a command is anything the input does, not only a token it sends.
        <ActionPicker inputLabel={controllerButtonLabel(button, controllerFamily)}
          command={commandForValue(button.command, '')} virtualControllerType={virtualControllerType} specialOptions={actionSpecialOptionList}
          libraryProfiles={libraryProfiles} currentProfileName={currentProfileName} onEnableVirtualController={onEnableVirtualController}
          defaultLedColor={defaultLedColor}
          onSelect={addChosen} onClose={() => setAddingCommand(false)} onCapture={captureNew} onAddStickShift={addStickShift}
          onAddHeldLed={addHeldLed} onAddLayerAction={addLayerAction} />
      )}
    </Lane>
  )

  // Change icon and the text shown on the menu (3d).
  const identity = menuItem ? (
    <div className={keymapStyles.identityRow} data-capture-ignore="true">
      <IconPicker value={bindingIcon ?? ''} label={bindingLabel || undefined} family={controllerFamily} onChange={value => onBindingIconChange?.(button.command, value)} />
      {onBindingLabelChange && (
        <BindingLabelField value={bindingLabel} onChange={value => onBindingLabelChange(button.command, value)}
          className={keymapStyles.identityField} placeholder={t('keymap.menuLabelPlaceholder', 'Label on the menu')} />
      )}
    </div>
  ) : null

  const extras = buttonHasTrackball ? (
    <div className={keymapStyles.trackballInline} data-capture-ignore="true">
      {buttonHasTrackball && <NumberField setting="TRACKBALL_DECAY"
        label={t('keymap.trackballDecay')}
        value={trackballDecay}
        onChange={onTrackballDecayChange}
        min={0}
        max={10}
        step={0.1}
        coarseStep={0.5}
        placeholder={t('common.defaultValue', { value: '1.0' })}
      />}
    </div>
  ) : null

  // NONE is how a profile says "nothing" over an imported binding, and a pill
  // reading "Unbound" beside a row that drives a layer said the opposite of
  // what the input does.
  const summary: BindingSummaryEntry[] = commands
    .filter(command => command.outputValue.trim().length > 0 && command.outputValue.trim().toUpperCase() !== 'NONE')
    .map(command => ({
      // Printed on the keycap (3b): PRESS, HOLD, TAP, DOUBLE PRESS.
      trigger: t(TRIGGER_LABEL_KEYS[command.triggerKind]),
      // What the game receives, in words, not how the file spells it; the
      // LED and layer rows in the words their lanes used (TODO-54, TODO-55).
      output: describeCommandOutput(command, layers, t),
      outputTitle: explainCommandOutput(command, shortName, t),
      jsm: command.outputKind === 'special' || command.outputKind === 'gyroAction' || command.source.kind === 'special' || command.source.kind === 'stickShift' || isFixedCommand(command),
    }))

  return (
    <ButtonMappingCard
      command={domCommand ?? button.command}
      title={longName}
      shortName={shortName}
      summary={summary}
      defaultOpen={defaultOpen}
      shifts={modeshifts}
      family={controllerFamily}
      rowTitle={label}
      rowSubtitle={subtitle}
      emptyLabel={emptyLabel}
      onPaste={onCopyBindings ? pasteBindings : undefined}
      canPaste={bindingClipboard.length > 0}
      pasteLabel={t('keymap.bindingsPaste', { count: bindingClipboard.length })}
      onCopyAll={onCopyBindings && copyableCommands.length > 0 ? () => copyCommands(copyableCommands) : undefined}
      onCapture={capturePrimary}
      xAction={xAction}
      glyph={<InputGlyph command={button.command} family={controllerFamily} size={embedded ? 30 : 40} />}
      iconWell={menuItem ? <BindingIconArt value={bindingIcon} size={22} /> : undefined}
      isCapturing={rowCapturing}
      embedded={embedded}
      lanes={
        <>
          {identity}
          {/* Commands, then the modeshifts: the LED while held and the layer
              actions are rows of the Commands lane (TODO-54, TODO-55). */}
          {commandsLane}
          {!menuItem && modeshiftPanel && !isShifted && <InputModeshiftPanel {...modeshiftPanel} button={button} shortName={shortName} />}
        </>
      }
      extras={extras}
      label={bindingLabel}
    />
  )
})
