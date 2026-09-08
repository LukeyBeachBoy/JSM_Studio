import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BindingCommand, BindingCommandPatch } from '../../utils/bindingCommands'
import keymapStyles from '../Keymap.module.css'
import { Menu } from '../ui/Menu'
import { BindingEditor } from './BindingEditor'
import { buildTriggerGroups, conditionTriggers, RETARGETABLE_TRIGGER_KINDS, TRIGGER_LABEL_KEYS } from './triggerKinds'
import { Select } from '../ui/Select'
import {
  getPreferredVirtualControllerDisplayType,
  getVirtualControllerLogicalOutput,
  getVirtualControllerOutputLabel,
  getVirtualControllerTokenType,
  type VirtualControllerType,
} from '../../utils/virtualController'

type Option = { value: string; label: string; disabled?: boolean }

type BindingCommandCardProps = {
  command: BindingCommand
  modifierOptions: Option[]
  specialOptions: Option[]
  virtualControllerType: VirtualControllerType
  isCapturing: boolean
  captureLabel: string
  onUpdate: (command: BindingCommand, patch: BindingCommandPatch) => void
  onRemove: (command: BindingCommand) => void
  onDuplicate: (command: BindingCommand) => void
  onCopy?: (command: BindingCommand) => void
  /** Selection mode is on: show a checkbox instead of the normal actions. */
  selectable?: boolean
  selected?: boolean
  onToggleSelected?: (command: BindingCommand) => void
  onCapture: (command: BindingCommand) => void
  onEnableVirtualController?: () => void
  onRename?: () => void
  /** Chords are edited in the group's modeshift panel, so this card cannot keep one. */
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
  command,
  modifierOptions,
  specialOptions,
  virtualControllerType,
  isCapturing,
  captureLabel,
  onUpdate,
  onRemove,
  onDuplicate,
  onCopy,
  selectable,
  selected,
  onToggleSelected,
  onCapture,
  onEnableVirtualController,
  onRename,
  chordsLiveInModeshifts,
}: BindingCommandCardProps) {
  const { t } = useTranslation()
  // Open by default. Collapsing as soon as a binding had a value meant the only
  // editable control left on screen was the trigger badge, with the binding
  // itself rendered as plain text behind a summary row that does not look
  // clickable -- so a bound grid region (or any bound input) looked like it
  // could no longer be changed at all. The row still collapses on request.
  const [expanded, setExpanded] = useState(true)
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
  const outputLabel =
    command.outputKind === 'virtualController' && virtualLogicalOutput && virtualDisplayType
      ? getVirtualControllerOutputLabel(virtualLogicalOutput, virtualDisplayType, t)
      : command.outputValue || t('keymap.commandNoOutput')
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
        // Where the group's modeshift panel owns chords, a chord made here is
        // filtered straight back out of the card and lost. Do not offer it.
        .map(group => ({ ...group, options: group.options.filter(option => !(chordsLiveInModeshifts && option.value === 'chord')) }))
        .filter(group => group.options.length > 0)
    : [{ options: RETARGETABLE_TRIGGER_KINDS.map(value => ({ value, label: t(TRIGGER_LABEL_KEYS[value]) })) }]

  return (
    <div className={keymapStyles.commandCard}
      onContextMenu={event => { event.preventDefault(); setMenuOpen(true) }}
      onPointerDown={event => { if (event.pointerType === 'touch') holdTimer.current = setTimeout(() => setMenuOpen(true), 600) }}
      onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerMove={cancelHold}>
      <div className={keymapStyles.commandSummary}>
        {selectable && (
          <input
            type="checkbox"
            className={keymapStyles.commandSelectCheckbox}
            checked={!!selected}
            data-capture-ignore="true"
            aria-label={t('keymap.bindingsSelect')}
            onChange={() => onToggleSelected?.(command)}
          />
        )}
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
        <button type="button" className={keymapStyles.commandSummaryMain} onClick={() => setExpanded(value => !value)}>
          {conditionLabel && <span className={keymapStyles.commandConditionBadge}>{conditionLabel}</span>}
          <span className={keymapStyles.commandArrow}>-&gt;</span>
          <kbd className={keymapStyles.commandOutputSummary}>{summaryOutput}</kbd>
          {!command.isRoundTripSafe && <span className={keymapStyles.commandRawBadge}>{t('keymap.commandRawSyntax')}</span>}
        </button>
        <div className={keymapStyles.commandActions} data-capture-ignore="true">
          <Menu open={menuOpen} onOpenChange={setMenuOpen} ariaLabel={t('keymap.commandActionsAriaLabel')}
            trigger={<button type="button" className="ghost-btn" aria-label={t('keymap.commandActionsAriaLabel')}>&#9881;</button>}
            items={[
              { label: t('keymap.commandMenuRename'), disabled: !onRename, onSelect: () => { requestAnimationFrame(() => onRename?.()) } },
              { label: t('keymap.commandCopy'), disabled: !onCopy, onSelect: () => onCopy?.(command) },
              { label: t('keymap.commandDuplicate'), onSelect: () => onDuplicate(command) },
            ]} />
          <button type="button" className={keymapStyles.advancedRemoveBtn} onClick={() => onRemove(command)}>
            {t('keymap.removeBinding')}
          </button>
        </div>
      </div>
      {virtualWarning && <div className={keymapStyles.commandWarningText}>{virtualWarning}</div>}

      {expanded && (
        <BindingEditor
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
