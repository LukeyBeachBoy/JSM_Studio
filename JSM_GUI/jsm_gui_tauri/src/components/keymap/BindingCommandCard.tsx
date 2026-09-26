import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../icons/Icon'
import { useTranslation } from 'react-i18next'
import { BindingCommand, BindingCommandPatch } from '../../utils/bindingCommands'
import keymapStyles from '../Keymap.module.css'
import { Menu } from '../ui/Menu'
import { BindingEditor } from './BindingEditor'
import { ActionPicker } from './ActionPicker'
import { SettingOrigin } from '../SettingOrigin'
import { buildTriggerGroups, conditionTriggers, RETARGETABLE_TRIGGER_KINDS, TRIGGER_LABEL_KEYS } from './triggerKinds'
import { Select } from '../ui/Select'
import {
  getPreferredVirtualControllerDisplayType,
  getVirtualControllerLogicalOutput,
  getVirtualControllerOutputLabel,
  getVirtualControllerTokenType,
  type VirtualControllerType,
} from '../../utils/virtualController'
import { describeBinding, explainBinding } from '../../utils/bindingDescription'
import { ReorderGrip } from './ButtonMappingCard'

type Option = { value: string; label: string; disabled?: boolean }

type BindingCommandCardProps = {
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  inputLabel: string
  layerInput?: string
  command: BindingCommand
  modifierOptions: Option[]
  specialOptions: Option[]
  virtualControllerType: VirtualControllerType
  /** Configurations this profile can switch to, for a load-config binding. */
  libraryProfiles?: string[]
  /** The configuration being edited, so it can be marked in that list. */
  currentProfileName?: string | null
  isCapturing: boolean
  captureLabel: string
  onUpdate: (command: BindingCommand, patch: BindingCommandPatch) => void
  onRemove: (command: BindingCommand) => void
  onDuplicate: (command: BindingCommand) => void
  onCopy?: (command: BindingCommand) => void
  onCapture: (command: BindingCommand) => void
  onEnableVirtualController?: () => void
  onRename?: () => void
  /** Y on the row: the input's details popover. */
  onDetails?: () => void
  /** The input's name field, on its first command (7a). */
  labelField?: ReactNode
  /** What B does from here, for the hint capsule: "Close RB". */
  closeLabel?: string
  /** Chords are edited in the input's modeshift panel, so this card cannot keep one. */
  chordsLiveInModeshifts?: boolean
}


const BEHAVIOR_LABEL_KEYS: Record<BindingCommand['outputBehavior'], string> = {
  normal: 'keymap.commandBehaviorNormal',
  tapOnce: 'keymap.commandBehaviorTapOnce',
  toggle: 'keymap.commandBehaviorToggle',
  releaseOnly: 'keymap.commandBehaviorReleaseOnly',
}

const conditionPrefixKeys: Partial<Record<BindingCommand['triggerKind'], string>> = {
  chord: 'keymap.commandConditionChord',
  simultaneous: 'keymap.commandConditionSimultaneous',
  diagonal: 'keymap.commandConditionDiagonal',
}

export function BindingCommandCard({
  expanded,
  onExpandedChange,
  inputLabel,
  layerInput,
  command,
  modifierOptions,
  specialOptions,
  virtualControllerType,
  libraryProfiles,
  currentProfileName,
  isCapturing,
  captureLabel,
  onUpdate,
  onRemove,
  onDuplicate,
  onCopy,
  onCapture,
  onEnableVirtualController,
  onRename,
  onDetails,
  labelField,
  closeLabel = 'Back',
  chordsLiveInModeshifts,
}: BindingCommandCardProps) {
  const { t } = useTranslation()
  // Basic selection uses the action picker; advanced properties stay contextual.
  const setExpanded = onExpandedChange
  const [pickerOpen, setPickerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout>>()
  const cancelHold = () => { clearTimeout(holdTimer.current) }
  useEffect(() => cancelHold, [])
  const triggerLabel = t(TRIGGER_LABEL_KEYS[command.triggerKind])
  const behaviorLabel = command.outputBehavior === 'normal' ? '' : t(BEHAVIOR_LABEL_KEYS[command.outputBehavior])
  const conditionLabel = command.conditionInput
    ? `${t(conditionPrefixKeys[command.triggerKind] ?? 'keymap.commandCondition')}: ${command.conditionInput}`
    : ''
  const virtualLogicalOutput = command.virtualControllerLogicalOutput ?? getVirtualControllerLogicalOutput(command.outputValue)
  const virtualDisplayType = getPreferredVirtualControllerDisplayType(virtualControllerType, command.outputValue)
  // A virtual-controller button is named from the scheme being displayed, so
  // it keeps its own label rather than going through the binding reader.
  const virtualLabel =
    command.outputKind === 'virtualController' && virtualLogicalOutput && virtualDisplayType
      ? getVirtualControllerOutputLabel(virtualLogicalOutput, virtualDisplayType, t)
      : null
  // A parsed token arrives here stripped: its action modifier is `outputBehavior`
  // and its event modifier is `triggerKind`, both of which this card shows in
  // their own controls -- so the value is read on its own and the behaviour word
  // still goes in front, or the card would say it twice. A row the parser could
  // not split keeps its whole expression in outputValue, and that is where the
  // reader earns its keep.
  const outputLabel = virtualLabel ?? (describeBinding(command.outputValue, t) || t('keymap.commandNoOutput'))
  const summaryOutput = behaviorLabel ? `${behaviorLabel} ${outputLabel}` : outputLabel
  const tokenType = command.outputKind === 'virtualController' ? getVirtualControllerTokenType(command.outputValue) : null
  const virtualWarning =
    command.outputKind !== 'virtualController'
      ? ''
      : virtualControllerType === 'NONE'
        ? t('keymap.virtualControllerWarningCommandModeRequired')
        : tokenType && tokenType !== virtualControllerType
          ? t('keymap.virtualControllerWarningCommandSchemeMismatch', {
              detected: t(`keymap.virtualControllerType_${tokenType}`),
              current: t(`keymap.virtualControllerType_${virtualControllerType}`),
            })
          : ''

  // The one trigger picker in the card. A draft row is written from scratch on
  // save, so it can become any kind, chords included. A binding that already
  // exists in the config is edited in place, and updateCommandExpression cannot
  // move a plain `BUTTON = OUTPUT` line to the `MODIFIER,BUTTON = OUTPUT` form a
  // chord needs -- it returns nothing and the choice is silently dropped. The
  // editor body used to offer all nine kinds here regardless, so five of them
  // did nothing at all. Offer what this command can actually become.
  const isDraftRow = command.source.kind === 'row' && command.source.isManual && !command.source.expression
  const canRetargetTrigger =
    command.source.kind === 'row' && (isDraftRow || RETARGETABLE_TRIGGER_KINDS.includes(command.triggerKind))
  const triggerGroups = isDraftRow
    ? buildTriggerGroups(t)
        // Where the input's modeshift panel owns chords, a chord made here is
        // filtered straight back out of the card and lost. Do not offer it.
        .map(group => ({ ...group, options: group.options.filter(option => !(chordsLiveInModeshifts && option.value === 'chord')) }))
        .filter(group => group.options.length > 0)
    : [{ options: RETARGETABLE_TRIGGER_KINDS.map(value => ({ value, label: t(TRIGGER_LABEL_KEYS[value]) })) }]

  // X on the pad captures a key for this command (Binding Editor 7a), the
  // same as X inside the picker. Only a written or draft row can take one:
  // a gyro special or a stick shift has no key to capture into.
  const canCaptureHere = command.source.kind === 'row' && command.triggerKind !== 'stickShift'
  const captureHint = canCaptureHere ? 'X:Capture;' : ''
  const detailsHint = onDetails ? 'Y:Details;' : ''
  const canChange = command.isRoundTripSafe && command.triggerKind !== 'stickShift'
  const isTextEntry = (target: EventTarget | null) => {
    const element = target as HTMLElement | null
    return Boolean(element && (element.matches('input, textarea, select, [contenteditable="true"]')))
  }

  return (
    <div className={keymapStyles.commandCard}
      data-pad-keys={`${canCaptureHere ? 'X' : ''}${onDetails ? 'Y' : ''}` || undefined}
      data-hints={`A:${canChange ? 'Change action' : 'Edit'};${captureHint}${detailsHint}B:${closeLabel}`}
      onKeyDown={event => {
        if (event.defaultPrevented || isTextEntry(event.target)) return
        if (canCaptureHere && (event.key === 'x' || event.key === 'X')) { event.preventDefault(); onCapture(command); return }
        if (onDetails && (event.key === 'y' || event.key === 'Y')) { event.preventDefault(); onDetails() }
      }}
      onContextMenu={event => { event.preventDefault(); setMenuOpen(true) }}
      onPointerDown={event => { if (event.pointerType === 'touch') holdTimer.current = setTimeout(() => setMenuOpen(true), 600) }}
      onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerMove={cancelHold}>
      <div className={keymapStyles.commandSummary}>
        <ReorderGrip />
        {canRetargetTrigger ? (
          <Select
            className={`${keymapStyles.commandTriggerBadge} ${keymapStyles.commandTriggerBadgeSelect}`}
            value={command.triggerKind}
            groups={triggerGroups}
            ariaLabel={t('keymap.commandTrigger')}
            onValueChange={value => {
              const next = value as BindingCommand['triggerKind']
              // Chord, simultaneous and diagonal need a second input picked, and
              // that picker lives in the editor body -- so open it rather than
              // leaving the choice half made and out of sight.
              if (conditionTriggers.has(next)) setExpanded(true)
              onUpdate(command, {
                triggerKind: next,
                // A chord with nothing to chord against is not a valid command
                // and is dropped on write, so the choice appeared to do nothing
                // at all. Seed the same default modifier that adding a chord
                // command from scratch uses; the body picker changes it.
                conditionInput: conditionTriggers.has(next)
                  ? command.conditionInput ?? modifierOptions[0]?.value
                  : undefined,
              })
            }}
          />
        ) : (
          <span className={keymapStyles.commandTriggerBadge}>{triggerLabel}</span>
        )}
        <span className={keymapStyles.commandArrow} aria-hidden="true">→</span>
        <button type="button" className={keymapStyles.commandSummaryMain} aria-label={`Choose action: ${summaryOutput}`}
          data-hints={`A:${canChange ? 'Change action' : 'Edit'};${captureHint}${detailsHint}B:${closeLabel}`}
          onClick={() => canChange ? setPickerOpen(true) : setExpanded(!expanded)}>
          {conditionLabel && <span className={keymapStyles.commandConditionBadge}>{conditionLabel}</span>}
          <kbd className={keymapStyles.commandOutputSummary} title={explainBinding(command.outputValue, t)}>{summaryOutput}</kbd>
          {!command.isRoundTripSafe && <span className={keymapStyles.commandRawBadge}>{t('keymap.commandRawSyntax')}</span>}
        </button>
        <span className={keymapStyles.commandLabelSlot}>{labelField}</span>
        <div className={keymapStyles.commandActions} data-capture-ignore="true">
          {/* What this opens is the output's kind and value and how it behaves
              (tap once, toggle, on release). It was labelled Timing, and there
              is no timing in it: the press windows are shared, under Tuning. */}
          <button type="button" className="ghost-btn" aria-label="Command options" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} data-hints={`A:${expanded ? 'Hide options' : 'Options'};B:${closeLabel}`}><Icon name="tuning" size={16} />{t('keymap.commandOptions', 'Options')}</button>
          <Menu open={menuOpen} onOpenChange={setMenuOpen} ariaLabel={t('keymap.commandActionsAriaLabel')}
            trigger={<button type="button" className="ghost-btn" aria-label={t('keymap.commandActionsAriaLabel')}><Icon name="more" size={18} /></button>}
            items={[
              { label: t('keymap.commandMenuRename'), disabled: !onRename, onSelect: () => { requestAnimationFrame(() => onRename?.()) } },
              { label: t('keymap.commandCopy'), disabled: !onCopy, onSelect: () => onCopy?.(command) },
              { label: t('keymap.commandDuplicate'), onSelect: () => onDuplicate(command) },
            ]} />
          <button type="button" className={keymapStyles.advancedRemoveBtn} onClick={() => onRemove(command)} data-hints={`A:Remove;B:${closeLabel}`}>
            {t('keymap.removeBinding')}
          </button>
        </div>
      </div>
      {virtualWarning && <div className={keymapStyles.commandWarningText}>{virtualWarning}</div>}
      <SettingOrigin setting={command.source.kind === 'special' ? command.source.specialKey : command.sourceLine.includes('=') ? command.sourceLine.split('=')[0].trim() : command.physicalInput} />
      {pickerOpen && <ActionPicker layerInput={layerInput} inputLabel={inputLabel} command={command} virtualControllerType={virtualControllerType} specialOptions={specialOptions} libraryProfiles={libraryProfiles} onSelect={patch => onUpdate(command, patch)} onClose={() => setPickerOpen(false)} onAdvanced={() => setExpanded(true)} onEnableVirtualController={onEnableVirtualController} onCapture={() => onCapture(command)} />}

      {expanded && (
        <BindingEditor
          libraryProfiles={libraryProfiles}
          currentProfileName={currentProfileName}
          command={command}
          modifierOptions={modifierOptions}
          specialOptions={specialOptions}
          virtualControllerType={virtualControllerType}
          isCapturing={isCapturing}
          captureLabel={captureLabel}
          onChange={(patch) => onUpdate(command, patch)}
          onCapture={() => onCapture(command)}
          onEnableVirtualController={onEnableVirtualController}
        />
      )}
    </div>
  )
}
