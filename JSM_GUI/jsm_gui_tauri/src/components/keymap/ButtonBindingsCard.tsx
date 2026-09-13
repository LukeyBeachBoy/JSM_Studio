import { useMemo, useState } from 'react'
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
  getButtonDescription,
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

import { ButtonMappingCard } from './ButtonMappingCard'
import { describeOutputValue, getVirtualControllerLogicalOutput, type VirtualControllerType } from '../../utils/virtualController'

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

export const ButtonBindingsCard = ({
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
  modeshiftCount,
  inheritedFrom,
  onOpenConfigEditor,
}: ButtonBindingsCardProps) => {
  const { t } = useTranslation()

  // Captures are registered against this, and a command id is built from the
  // input's own command -- so a shifted card and the normal card for the same
  // input would register under the same key, leaving both rows showing as
  // capturing and the captured value landing on whichever registered last.
  // `domCommand` is what tells the two apart.
  const captureKeyFor = (command: BindingCommand) =>
    domCommand ? `${domCommand}:${command.id}` : command.id
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
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

  const exitSelection = () => {
    setSelectionMode(false)
    setSelectedIds([])
  }

  const toggleSelected = (command: BindingCommand) => {
    setSelectedIds(prev =>
      prev.includes(command.id) ? prev.filter(id => id !== command.id) : [...prev, command.id]
    )
  }

  const copyCommands = (picked: BindingCommand[]) => {
    if (picked.length === 0) return
    onCopyBindings?.(picked.map(commandToPreset))
    exitSelection()
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

  const handleAddCommand = (trigger: BindingTriggerKind | 'script') => {
    if (trigger === 'script') {
      addDraftCommand(createBindingCommandPreset('regular', { outputKind: 'command', outputValue: '' }))
      return
    }
    addDraftCommand(createBindingCommandPreset(trigger, trigger === 'chord' || trigger === 'simultaneous' || trigger === 'diagonal'
      ? { conditionInput: defaultModifier }
      : undefined))
  }

  // Nothing bound yet: one button, defaulting to Press, same as Steam Input's
  // own empty-slot affordance. Changing that first command's trigger kind
  // (Press/Tap/Hold/...) happens on the command card itself once it exists --
  // this row is for adding a *new* trigger, so there's nothing to choose among
  // before the first one exists. The full picker only reappears once there's
  // already a command to add an additional simultaneous trigger alongside.
  // One button opening a menu, with the rare trigger kinds behind a submenu --
  // Steam's own pattern. The nine buttons this replaces put every option on
  // screen at once whether or not you wanted any of them.
  // Where the chord slot is filtered out of the rows, the menu must not offer
  // to make one either: it would be written to a line this card does not show,
  // and so be lost the moment anything else on the card was edited. The same
  // goes for the two other condition-carrying kinds, which are chords by
  // another name.
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

  const addControl =
    commands.length === 0 ? (
      <div className={keymapStyles.addCommandRow} data-capture-ignore="true">
        <button type="button" className="secondary-btn" onClick={() => handleAddCommand('regular')}>
          {t('keymap.addCommand')}
        </button>
      </div>
    ) : (
      <div className={keymapStyles.addCommandRow} data-capture-ignore="true">
        <Menu
          ariaLabel={t('keymap.addAnotherTrigger')}
          items={addMenuItems}
          trigger={
            <button type="button" className="secondary-btn">
              {t('keymap.addAnotherTrigger')}
            </button>
          }
        />
      </div>
    )

  const extras = (
    <>
      {buttonHasTrackball && (
        <div className={keymapStyles.trackballInline} data-capture-ignore="true">
          <NumberField
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
      )}
    </>
  )

  const canSelect = commands.length > 1 && !!onCopyBindings
  const selectedCommands = commands.filter(command => selectedIds.includes(command.id))
  const bindingsToolbar =
    bindingClipboard.length > 0 || canSelect ? (
      <div className={keymapStyles.bindingsToolbar} data-capture-ignore="true">
        {canSelect && !selectionMode && (
          <button type="button" className="ghost-btn" onClick={() => setSelectionMode(true)}>
            {t('keymap.bindingsSelect')}
          </button>
        )}
        {selectionMode && (
          <>
            <button
              type="button"
              className="secondary-btn"
              disabled={selectedCommands.length === 0}
              onClick={() => copyCommands(selectedCommands)}
            >
              {t('keymap.bindingsCopySelected', { count: selectedCommands.length })}
            </button>
            <button type="button" className="ghost-btn" onClick={exitSelection}>
              {t('keymap.bindingsCancelSelect')}
            </button>
          </>
        )}
        {bindingClipboard.length > 0 && !selectionMode && (
          <button type="button" className="link-btn" onClick={pasteBindings}>
            {t('keymap.bindingsPaste', { count: bindingClipboard.length })}
          </button>
        )}
      </div>
    ) : null

  return (
    <ButtonMappingCard
      command={domCommand ?? button.command}
      summary={commands
        .filter(command => command.outputValue.trim().length > 0)
        .map(command => ({
          trigger: command.triggerKind === 'regular' ? undefined : t(`keymap.commandTrigger${command.triggerKind.charAt(0).toUpperCase()}${command.triggerKind.slice(1)}`, command.triggerKind),
          // What the game receives, not how the file spells it.
          output: describeOutputValue(command.outputValue),
        }))}
      defaultOpen={defaultOpen}
      modeshiftCount={modeshiftCount}
      onPaste={bindingClipboard.length > 0 && !selectionMode ? pasteBindings : undefined}
      pasteLabel={t('keymap.bindingsPaste', { count: bindingClipboard.length })}
      title={controllerButtonLabel(button, controllerFamily)}
      glyph={<InputGlyph command={button.command} family={controllerFamily} size={19} />}
      description={getButtonDescription(button, t)}
      isCapturing={rowCapturing}
      inheritedFrom={inheritedFrom}
      onOpenConfigEditor={onOpenConfigEditor}
      toolbar={bindingsToolbar}
      addControl={addControl}
      extras={extras}
      label={bindingLabel}
      onLabelChange={onBindingLabelChange ? (value) => onBindingLabelChange(button.command, value) : undefined}
      icon={bindingIcon}
      onIconChange={onBindingIconChange ? (value) => onBindingIconChange(button.command, value) : undefined}
      commands={
        commands.length > 0 ? (
          commands.map(command => (
            <BindingCommandCard
              key={command.id}
              command={command}
              modifierOptions={modifierOptions}
              specialOptions={command.source.kind === 'special' ? allSpecialOptionList : actionSpecialOptionList}
              virtualControllerType={virtualControllerType}
              libraryProfiles={libraryProfiles}
              currentProfileName={currentProfileName}
              isCapturing={isCapturingValue(captureKeyFor(command))}
              captureLabel={captureLabel}
              onUpdate={updateCommand}
              onRemove={removeCommand}
              chordsLiveInModeshifts={chordsLiveInModeshifts}
              onDuplicate={duplicateCommand}
              onCopy={onCopyBindings ? (picked) => copyCommands([picked]) : undefined}
              selectable={selectionMode}
              selected={selectedIds.includes(command.id)}
              onToggleSelected={toggleSelected}
              onRename={() => document.querySelector<HTMLInputElement>(`[data-input-command="${domCommand ?? button.command}"] input[aria-label]`)?.focus()}
              onCapture={captureCommand}
              onEnableVirtualController={onEnableVirtualController}
            />
          ))
        ) : (
          <div className={keymapStyles.commandEmptyState}>{t('keymap.commandEmptyState')}</div>
        )
      }
    />
  )
}
