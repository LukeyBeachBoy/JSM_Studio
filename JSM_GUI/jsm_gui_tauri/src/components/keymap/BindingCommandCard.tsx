import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BindingCommand, BindingCommandPatch } from '../../utils/bindingCommands'
import keymapStyles from '../Keymap.module.css'
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
  // Set when this card replaces a draft the user was already editing.
  defaultExpanded?: boolean
  onUpdate: (command: BindingCommand, patch: BindingCommandPatch) => void
  onRemove: (command: BindingCommand) => void
  onDuplicate: (command: BindingCommand) => void
  onCapture: (command: BindingCommand) => void
  onEnableVirtualController?: () => void
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
  defaultExpanded = false,
  onUpdate,
  onRemove,
  onDuplicate,
  onCapture,
  onEnableVirtualController,
}: BindingCommandCardProps) {
  const { t } = useTranslation()
  const isDraftCommand = command.source.kind === 'row' && command.source.isManual && !command.outputValue
  const [expanded, setExpanded] = useState(isDraftCommand || defaultExpanded)
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
    <div className={keymapStyles.commandCard}>
      <div className={keymapStyles.commandSummary}>
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
