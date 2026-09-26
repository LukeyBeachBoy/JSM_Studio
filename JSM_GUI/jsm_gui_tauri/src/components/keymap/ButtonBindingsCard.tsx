import { memo, useContext, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BindingCommand,
  BindingCommandPatch,
  BindingCommandPreset,
  BindingTriggerKind,
  bindingCommandToToken,
  commandTokenPreview,
  createBindingCommandPreset,
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
import { Menu, type MenuItem } from '../ui/Menu'
import { controllerButtonLabel, type ControllerVisualFamily } from '../../utils/controllerStatus'
import { InputGlyph } from '../glyphs/InputGlyph'

import { ButtonMappingCard, type BindingSummaryEntry } from './ButtonMappingCard'
import { BindingLabelField } from './BindingLabelField'
import { IconPicker } from './IconPicker'
import { InputModeshiftPanel } from './InputModeshiftPanel'
import { InputLayerActions, LayerUsageContext } from '../LayerBar'
import { actionsOnInput } from '../../utils/layers'
import { inputLongName, inputShortName } from '../../keymap/inputNames'
import type { InputModeshiftsProps } from './InputModeshifts'
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
  /** How many shifts reconfigure this input; shown on its compact row. */
  modeshiftCount?: number
  /** Chord bindings are edited in this group's modeshift panel, not here. */
  chordsLiveInModeshifts?: boolean
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
  captureLabel,
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
  modeshiftCount,
  beginCapture,
}: ButtonBindingsCardProps) {
  const { t } = useTranslation()

  // Captures are registered against this, and a command id is built from the
  // input's own command -- so a shifted card and the normal card for the same
  // input would register under the same key, leaving both rows showing as
  // capturing and the captured value landing on whichever registered last.
  // `domCommand` is what tells the two apart.
  const captureKeyFor = (command: BindingCommand) =>
    domCommand ? `${domCommand}:${command.id}` : command.id
  // Parsing a draft into a real command can change its id. Keep disclosure at
  // input level so typing the first character cannot close the active editor.
  const [expandedCommands, setExpandedCommands] = useState<Set<number>>(() => new Set())
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
      { value: 'CALIBRATE', label: 'CALIBRATE' },
      ...getSpecialOptionList(t),
    ].filter((option, index, source) => source.findIndex(candidate => candidate.value === option.value) === index),
    [t]
  )
  const actionSpecialOptionList = useMemo(
    () => [
      { value: 'NONE', label: 'NONE' },
      { value: 'DEFAULT', label: 'DEFAULT' },
      { value: 'CALIBRATE', label: 'CALIBRATE' },
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

  const handleAddCommand = (trigger: BindingTriggerKind | 'script') => {
    if (trigger === 'script') {
      addDraftCommand(createBindingCommandPreset('regular', { outputKind: 'command', outputValue: '' }))
      return
    }
    addDraftCommand(createBindingCommandPreset(trigger, trigger === 'chord' || trigger === 'simultaneous' || trigger === 'diagonal'
      ? { conditionInput: defaultModifier }
      : undefined))
  }

  // One button opening a menu, with the rare trigger kinds behind a submenu --
  // Steam's own pattern. Where the chord slot is filtered out of the rows, the
  // menu must not offer to make one either: it would be written to a line this
  // card does not show, and so be lost the moment anything else on the card
  // was edited. The same goes for the two other condition-carrying kinds, which
  // are chords by another name.
  const addMenuItems: MenuItem[] = [
    { label: t('keymap.commandTriggerRegular'), onSelect: () => handleAddCommand('regular') },
    { label: t('keymap.commandTriggerTap'), onSelect: () => handleAddCommand('tap') },
    { label: t('keymap.commandTriggerHold'), onSelect: () => handleAddCommand('hold') },
    { label: t('keymap.commandTriggerDouble'), onSelect: () => handleAddCommand('double') },
    ...(chordsLiveInModeshifts
      ? []
      : [{ label: t('keymap.commandTriggerChord'), onSelect: () => handleAddCommand('chord') } as MenuItem]),
    { kind: 'separator' },
    {
      kind: 'submenu',
      label: t('keymap.advancedOptions'),
      items: [
        ...(chordsLiveInModeshifts
          ? []
          : [
              { label: t('keymap.commandTriggerSimultaneous'), onSelect: () => handleAddCommand('simultaneous') } as MenuItem,
              { label: t('keymap.commandTriggerDiagonal'), onSelect: () => handleAddCommand('diagonal') } as MenuItem,
            ]),
        ...(onStickModeShiftChange
          ? [{ label: t('keymap.commandAddStickShift'), onSelect: () => handleAddCommand('stickShift') } as MenuItem]
          : []),
        { label: t('keymap.commandAddScript'), onSelect: () => handleAddCommand('script') },
      ],
    },
  ]

  const shortName = inputShortName(button, controllerFamily)
  const longName = label ?? inputLongName(button, controllerFamily, t)
  const closeLabel = `Close ${shortName}`
  const isShifted = Boolean(domCommand?.includes(','))

  // The input's own name, on its first command; beside "+ Add command" when
  // there is none yet. One label per input in the configuration.
  const labelField = (
    <>
      {onBindingLabelChange && <BindingLabelField value={bindingLabel} onChange={value => onBindingLabelChange(button.command, value)} />}
      {onBindingIconChange && <IconPicker value={bindingIcon ?? ''} onChange={value => onBindingIconChange(button.command, value)} />}
    </>
  )

  // Nothing bound yet: one press adds a Press command, same as Steam Input's
  // own empty-slot affordance. With a command already there the same button
  // opens the menu of activation kinds.
  const addControl = (
    <div className={keymapStyles.addCommandRow} data-capture-ignore="true">
      {commands.length === 0 ? (
        <button type="button" className="button button--secondary button--sm" onClick={() => handleAddCommand('regular')} data-hints={`A:Add command;B:${closeLabel}`}>
          {t('keymap.addCommand')}
        </button>
      ) : (
        <Menu
          ariaLabel={t('keymap.addCommand')}
          items={addMenuItems}
          trigger={
            <button type="button" className="button button--secondary button--sm" data-hints={`A:Add command;B:${closeLabel}`}>
              {t('keymap.addCommand')}
            </button>
          }
        />
      )}
      <button type="button" className="button button--ghost button--sm" onClick={capturePrimary} data-hints={`A:Capture a key;B:${closeLabel}`}>
        {t('keymap.captureAKey', 'Capture a key')}
      </button>
      {commands.length === 0 && labelField}
    </div>
  )

  const extras = buttonHasTrackball ? (
    <div className={keymapStyles.trackballInline} data-capture-ignore="true">
      <NumberField setting="TRACKBALL_DECAY"
        label={t('keymap.trackballDecay')}
        value={trackballDecay}
        onChange={onTrackballDecayChange}
        min={0}
        max={10}
        step={0.1}
        coarseStep={0.5}
        placeholder={t('common.defaultValue', { value: '1.0' })}
      />
    </div>
  ) : null

  const kindLabels = commands
    .filter(command => command.outputValue.trim().toUpperCase() !== 'NONE')
    .map(command => t(TRIGGER_LABEL_KEYS[command.triggerKind]))
    .filter((kind, index, all) => all.indexOf(kind) === index)
  // NONE is how a profile says "nothing" over an imported binding, and a pill
  // reading "Unbound" beside a row that drives a layer said the opposite of
  // what the input does.
  const summary: BindingSummaryEntry[] = commands
    .filter(command => command.outputValue.trim().length > 0 && command.outputValue.trim().toUpperCase() !== 'NONE')
    .map(command => ({
      trigger: command.triggerKind === 'regular' ? undefined : t(TRIGGER_LABEL_KEYS[command.triggerKind]),
      // What the game receives, in words, not how the file spells it.
      output: describeBinding(command.outputValue, t),
      outputTitle: explainBinding(command.outputValue, t),
      jsm: command.outputKind === 'special' || command.source.kind === 'special' || command.source.kind === 'stickShift',
    }))
  const requestDetails = (element: HTMLElement | null) => element?.dispatchEvent(new CustomEvent('jsm:binding-details', { bubbles: true }))
  const selector = `[data-input-command="${(domCommand ?? button.command).replace(/"/g, '\\"')}"]`

  return (
    <ButtonMappingCard
      command={domCommand ?? button.command}
      title={longName}
      shortName={shortName}
      summary={summary}
      kinds={kindLabels.join(' / ')}
      defaultOpen={defaultOpen}
      modeshiftCount={modeshiftCount}
      rowTitle={label}
      rowSubtitle={subtitle}
      emptyLabel={emptyLabel}
      onPaste={onCopyBindings ? pasteBindings : undefined}
      canPaste={bindingClipboard.length > 0}
      pasteLabel={t('keymap.bindingsPaste', { count: bindingClipboard.length })}
      onCopyAll={onCopyBindings && commands.length > 0 ? () => copyCommands(commands) : undefined}
      onCapture={capturePrimary}
      xAction={xAction}
      glyph={<InputGlyph command={button.command} family={controllerFamily} size={28} />}
      isCapturing={rowCapturing}
      addControl={addControl}
      extras={extras}
      label={bindingLabel}
      modeshifts={modeshiftPanel && !isShifted ? <InputModeshiftPanel {...modeshiftPanel} button={button} shortName={shortName} /> : undefined}
      layerActions={!isShifted ? (
        <LayerActionsPanel command={button.command} label={`${longName} layer actions`} />
      ) : undefined}
      commands={
        commands.length > 0 ? (
          commands.map((command, index) => (
            <BindingCommandCard
              key={command.id}
              layerInput={isShifted ? undefined : button.command}
              inputLabel={controllerButtonLabel(button, controllerFamily)}
              expanded={expandedCommands.has(index)}
              onExpandedChange={open => setExpandedCommands(previous => { const next = new Set(previous); if (open) next.add(index); else next.delete(index); return next })}
              command={command}
              modifierOptions={modifierOptions}
              specialOptions={command.source.kind === 'special' ? allSpecialOptionList : actionSpecialOptionList}
              virtualControllerType={virtualControllerType}
              libraryProfiles={libraryProfiles}
              currentProfileName={currentProfileName}
              isCapturing={isCapturingValue(captureKeyFor(command))}
              captureLabel={captureLabel}
              onUpdate={updateCommand}
              onRemove={removed => { setExpandedCommands(previous => new Set([...previous].filter(i => i !== index).map(i => i > index ? i - 1 : i))); removeCommand(removed) }}
              chordsLiveInModeshifts={chordsLiveInModeshifts}
              onDuplicate={duplicateCommand}
              onCopy={onCopyBindings ? (picked) => copyCommands([picked]) : undefined}
              onRename={() => document.querySelector<HTMLInputElement>(`${selector} input[aria-label]`)?.focus()}
              onCapture={captureCommand}
              onDetails={() => requestDetails(document.querySelector<HTMLElement>(selector))}
              labelField={index === 0 ? labelField : undefined}
              closeLabel={closeLabel}
              onEnableVirtualController={onEnableVirtualController}
            />
          ))
        ) : (
          <div className={keymapStyles.commandEmptyState}>{t('keymap.commandEmptyState')}</div>
        )
      }
    />
  )
})

// The LAYER ACTIONS panel (7a), the same shape as the Modeshifts panel: title
// and count, one line of what it is, the actions, one add button.
function LayerActionsPanel({ command, label }: { command: string; label: string }) {
  const { t } = useTranslation()
  const { actions } = useContext(LayerUsageContext)
  const mine = actionsOnInput(actions, command)
  return (
    <section className={keymapStyles.editorPanel} aria-label={label}>
      <div className={keymapStyles.editorPanelHead}>
        <span className={keymapStyles.eyebrowHeading}>{t('keymap.layerActionsHeading', 'Layer actions')}</span>
        <span className={keymapStyles.editorPanelCount}>{mine.length}</span>
      </div>
      <span className={keymapStyles.editorPanelEmpty}>
        {mine.length
          ? t('keymap.layerActionsNote', 'Layers this input turns on or off.')
          : t('keymap.layerActionsEmpty', 'None. Hold, apply, remove or toggle a layer from this input.')}
      </span>
      <InputLayerActions command={command} variant="panel" />
    </section>
  )
}
