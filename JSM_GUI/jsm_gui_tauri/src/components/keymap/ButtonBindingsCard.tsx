import { memo, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BindingCommand,
  BindingCommandPatch,
  BindingCommandPreset,
  BindingTriggerKind,
  bindingCommandToToken,
  commandTokenPreview,
  commandForValue,
  inferOutputKindFromBindingValue,
  parseRowsToCommands,
  updateCommandExpression,
} from '../../utils/bindingCommands'
import {
  BindingSlot,
  ButtonBindingRow,
  ManualRowInfo,
  ManualRowState,
  createBindingExpression,
  parseBindingExpression,
  removeBindingExpressionToken,
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
import { LayerActionsLane } from './LayerActionsLane'
import { inputLongName, inputShortName } from '../../keymap/inputNames'
import type { InputModeshiftsProps } from './InputModeshifts'
import type { ModeshiftSummary } from '../../utils/modeshift'
import { TRIGGER_LABEL_KEYS } from './triggerKinds'
import { getVirtualControllerLogicalOutput, type VirtualControllerType } from '../../utils/virtualController'
import { describeBinding, explainBinding } from '../../utils/bindingDescription'

type ButtonBindingsCardProps = {
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
  const commands = useMemo(
    () => parseRowsToCommands(rows, button.command, { specialKey, stickShiftAssignments: stickShiftEntries }),
    [button.command, rows, specialKey, stickShiftEntries]
  )
  const rowCapturing = rows.some(row => isCapturing(button.command, row.slot, row.id)) || commands.some(command => isCapturingValue(captureKeyFor(command)))
  const buttonHasTrackball = commands.some(command => command.outputValue.toUpperCase().includes('TRACK'))
  const defaultModifier = getDefaultModifierForButton(button.command, modifierOptions)

  const addCommandToBaseLine = (preset: BindingCommandPreset) => {
    if (!hasOutputValue(preset)) return
    const baseRow = rows.find(row => row.slot === 'tap')
    const existingTokens = baseRow?.expression?.tokens ?? []
    const token = bindingCommandToToken(preset)
    const expression = createBindingExpression([...existingTokens, token])
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

  const removeCommand = (command: BindingCommand) => {
    if (command.source.kind === 'special') {
      onClearSpecialAction(command.source.specialKey, button.command)
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
      const expression = removeBindingExpressionToken(command.source.expression, command.source.tokenIndex)
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
        conditionInput: nextCommand.conditionInput,
      })
      return
    }

    const expression = updateCommandExpression(command, patch)
    if (!expression) return
    const nextValue = serializeBindingExpression(expression)
    const targetSlot = commandSlot(nextCommand.triggerKind)
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
    conditionInput: command.conditionInput,
  })

  const duplicateCommand = (command: BindingCommand) => {
    writeCommand(commandToPreset(command))
  }

  const copyCommands = (picked: BindingCommand[]) => {
    if (picked.length === 0) return
    onCopyBindings?.(picked.map(commandToPreset))
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
      const expression = createBindingExpression([
        ...existingTokens,
        ...baseLine.map(preset => bindingCommandToToken(preset)),
      ])
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

  const captureCommand = (command: BindingCommand) => {
    beginValueCapture(captureKeyFor(command), t('keymap.anyBindingPrompt'), value => {
      const token = parseBindingExpression(value)?.tokens[0]
      updateCommand(command, {
        outputKind:
          token?.kind === 'mouse'
            ? 'mouse'
            : token?.kind === 'wheel'
              ? 'wheel'
              : token?.kind === 'special'
                ? 'special'
                : inferOutputKindFromBindingValue(token?.value ?? value),
        outputValue: token?.value ?? value,
      })
    })
  }

  // X on the closed row, and "Capture a key" in the editor: the primary command
  // takes the key, or a new Press binding is captured when there is none.
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
  const addChosen = (patch: BindingCommandPatch) => {
    added.expect()
    writeCommand({ triggerKind: 'regular', outputKind: patch.outputKind ?? 'keyboard', outputValue: patch.outputValue ?? '', outputBehavior: 'normal' })
  }
  const addStickShift = onStickModeShiftChange ? () => {
    onStickModeShiftChange(button.command, 'RIGHT', 'NO_MOUSE')
    updateStickShiftDisplayMode(buttonKey, 'extra')
  } : undefined

  const shortName = inputShortName(button, controllerFamily)
  const longName = label ?? inputLongName(button, controllerFamily, t)
  const closeLabel = `Close ${shortName}`
  const isShifted = Boolean(domCommand?.includes(','))
  // A menu item (3d): a region or segment of an on-screen menu, which has an
  // icon and a label on the menu and nothing but commands behind them.
  const menuItem = Boolean(onBindingIconChange)
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
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => { if (event.key === 'x' || event.key === 'X') { event.preventDefault(); capturePrimary() } },
  }
  const commandsLane = (
    <Lane concept="command" label={t('keymap.commandsHeading', 'Commands')} count={commands.length} twoUpFooter={!menuItem}
      footer={
        <>
          <LaneAddButton {...addButtonProps} />
          {!menuItem && <LaneSideButton glyph={<ButtonGlyph button="X" size={28} family={controllerFamily === 'generic' ? undefined : controllerFamily} />}
            label={t('keymap.captureAKey', 'Capture a key')} onClick={capturePrimary} hints={`A:Capture a key;B:${closeLabel}`} />}
        </>
      }>
      {commands.length > 0 && (
        <div className={laneStyles.rows} data-capture-ignore="true">
          {commands.map((command, index) => (
            <BindingCommandCard
              key={command.id}
              layerInput={isShifted ? undefined : button.command}
              inputLabel={controllerButtonLabel(button, controllerFamily)}
              command={command}
              glyph={inputGlyph}
              // One name per input, on its first row (3c); a menu item's is its label field (3d).
              label={index === 0 && onBindingLabelChange && !menuItem ? bindingLabel ?? '' : undefined}
              onLabelChange={onBindingLabelChange && !menuItem ? value => onBindingLabelChange(button.command, value) : undefined}
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
        <ActionPicker layerInput={isShifted ? undefined : button.command} inputLabel={controllerButtonLabel(button, controllerFamily)}
          command={commandForValue(button.command, '')} virtualControllerType={virtualControllerType} specialOptions={actionSpecialOptionList}
          libraryProfiles={libraryProfiles} currentProfileName={currentProfileName} onEnableVirtualController={onEnableVirtualController}
          onSelect={addChosen} onClose={() => setAddingCommand(false)} onCapture={capturePrimary} onAddStickShift={addStickShift} />
      )}
    </Lane>
  )

  // Change icon and the text shown on the menu (3d).
  const identity = menuItem ? (
    <div className={keymapStyles.identityRow} data-capture-ignore="true">
      <IconPicker value={bindingIcon ?? ''} label={bindingLabel || undefined} onChange={value => onBindingIconChange?.(button.command, value)} />
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
      // What the game receives, in words, not how the file spells it.
      output: describeBinding(command.outputValue, t),
      outputTitle: explainBinding(command.outputValue, t),
      jsm: command.outputKind === 'special' || command.source.kind === 'special' || command.source.kind === 'stickShift',
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
      onCopyAll={onCopyBindings && commands.length > 0 ? () => copyCommands(commands) : undefined}
      onCapture={capturePrimary}
      xAction={xAction}
      glyph={<InputGlyph command={button.command} family={controllerFamily} size={embedded ? 30 : 40} />}
      iconWell={menuItem ? <BindingIconArt value={bindingIcon} size={22} /> : undefined}
      isCapturing={rowCapturing}
      embedded={embedded}
      lanes={
        <>
          {identity}
          {commandsLane}
          {!menuItem && modeshiftPanel && !isShifted && <InputModeshiftPanel {...modeshiftPanel} button={button} shortName={shortName} />}
          {!menuItem && !isShifted && <LayerActionsPanel command={button.command} label={`${longName} layer actions`} glyph={inputGlyph} shortName={shortName} longName={longName} />}
        </>
      }
      extras={extras}
      label={bindingLabel}
    />
  )
})

// The LAYER ACTIONS lane (3c): one row per action -- the input, an arrow, the
// layer's tile and what it does -- and one add button.
function LayerActionsPanel({ command, label, glyph, shortName, longName }: { command: string; label: string; glyph: ReactNode; shortName: string; longName: string }) {
  return <LayerActionsLane command={command} label={label} glyph={glyph} shortName={shortName} longName={longName} />
}
