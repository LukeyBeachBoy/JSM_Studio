import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BindingCommand, BindingCommandPatch } from '../../utils/bindingCommands'
import keymapStyles from '../Keymap.module.css'
import { Menu } from '../ui/Menu'
import { BindingEditor } from './BindingEditor'
import { AppSelect } from '../ui/AppSelect'
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
  onAddExtra?: () => void
  onAddSub?: () => void
  onRename?: () => void
}

const TRIGGER_LABEL_KEYS: Record<BindingCommand['triggerKind'], string> = {
  regular: 'keymap.commandTriggerRegular',
  tap: 'keymap.commandTriggerTap',
  hold: 'keymap.commandTriggerHold',
  double: 'keymap.commandTriggerDouble',
  release: 'keymap.commandTriggerRelease',
  turbo: 'keymap.commandTriggerTurbo',
  chord: 'keymap.commandTriggerChord',
  simultaneous: 'keymap.commandTriggerSimultaneous',
  diagonal: 'keymap.commandTriggerDiagonal',
  stickShift: 'keymap.stickModeShifts',
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

// The trigger kinds a binding can be switched directly to from this dropdown.
// Chord/simultaneous/diagonal need a modifier button chosen alongside the
// trigger change (nothing to chord *with* otherwise), which is a bigger flow
// than a dropdown -- they stay reachable only through "add another trigger",
// same as today. onUpdate already handles moving a binding between config
// slots correctly (see ButtonBindingsCard's updateCommand), so this is purely
// a UI gap, not a new capability.
const RETARGETABLE_TRIGGER_KINDS: BindingCommand['triggerKind'][] = ['regular', 'tap', 'hold', 'double']

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
  onAddExtra,
  onAddSub,
  onRename,
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

  const canRetargetTrigger = command.source.kind === 'row' && RETARGETABLE_TRIGGER_KINDS.includes(command.triggerKind)
  const triggerOptions = canRetargetTrigger
    ? RETARGETABLE_TRIGGER_KINDS
    : [command.triggerKind]

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
          <AppSelect
            className={`${keymapStyles.commandTriggerBadge} ${keymapStyles.commandTriggerBadgeSelect}`}
            value={command.triggerKind}
            data-capture-ignore="true"
            onChange={(event) => onUpdate(command, { triggerKind: event.target.value as BindingCommand['triggerKind'] })}
          >
            {triggerOptions.map(kind => (
              <option key={kind} value={kind}>{t(TRIGGER_LABEL_KEYS[kind])}</option>
            ))}
          </AppSelect>
        ) : (
          <span className={keymapStyles.commandTriggerBadge}>{triggerLabel}</span>
        )}
        <button type="button" className={keymapStyles.commandSummaryMain} onClick={() => setExpanded(value => !value)}>
          {conditionLabel && <span className={keymapStyles.commandConditionBadge}>{conditionLabel}</span>}
          <span className={keymapStyles.commandArrow}>-&gt;</span>
          <span className={keymapStyles.commandOutputSummary}>{summaryOutput}</span>
          {!command.isRoundTripSafe && <span className={keymapStyles.commandRawBadge}>{t('keymap.commandRawSyntax')}</span>}
        </button>
        <div className={keymapStyles.commandActions} data-capture-ignore="true">
          <Menu open={menuOpen} onOpenChange={setMenuOpen} ariaLabel={t('keymap.commandActionsAriaLabel')}
            trigger={<button type="button" className="ghost-btn" aria-label={t('keymap.commandActionsAriaLabel')}>&#9881;</button>}
            items={[
              { label: t('keymap.commandMenuRegularPress'), disabled: !canRetargetTrigger, onSelect: () => onUpdate(command, { triggerKind: 'regular' }) },
              { label: t('keymap.commandMenuSettings'), onSelect: () => setExpanded(true) },
              { label: t('keymap.commandMenuRename'), disabled: !onRename, onSelect: () => { requestAnimationFrame(() => onRename?.()) } },
              { label: t('keymap.commandCopy'), disabled: !onCopy, onSelect: () => onCopy?.(command) },
              { label: t('keymap.commandMenuRemove'), onSelect: () => onRemove(command) },
              { label: t('keymap.commandMenuAddExtra'), onSelect: () => onAddExtra?.() },
              { label: t('keymap.commandMenuAddSub'), onSelect: () => onAddSub?.() },
            ]} />
          <button type="button" className="link-btn" onClick={() => onDuplicate(command)}>
            {t('keymap.commandDuplicate')}
          </button>
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
