import { forwardRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BindingCommand, BindingCommandPatch } from '../../utils/bindingCommands'
import { Icon } from '../icons/Icon'
import { Select } from '../ui/Select'
import { CommandSettingsSheet } from './BindingEditor'
import { ActionPicker } from './ActionPicker'
import { laneStyles } from './Lane'
import { buildTriggerGroups, conditionTriggers, TRIGGER_LABEL_KEYS } from './triggerKinds'
import {
  getPreferredVirtualControllerDisplayType,
  getVirtualControllerLogicalOutput,
  getVirtualControllerOutputLabel,
  getVirtualControllerTokenType,
  type VirtualControllerType,
} from '../../utils/virtualController'
import { describeBinding, explainBinding } from '../../utils/bindingDescription'

type Option = { value: string; label: string; disabled?: boolean }

type BindingCommandCardProps = {
  inputLabel: string
  layerInput?: string
  command: BindingCommand
  /** The input's glyph, first in the row. A menu item's row has none (3d). */
  glyph?: ReactNode
  /** The input's name, shown on its first row; '' shows the placeholder, and
   *  undefined leaves the column empty (the name is one per input). */
  label?: string
  onLabelChange?: (label: string) => void
  modifierOptions: Option[]
  specialOptions: Option[]
  virtualControllerType: VirtualControllerType
  /** Configurations this profile can switch to, for a load-config binding. */
  libraryProfiles?: string[]
  /** The configuration being edited, so it can be marked in that list. */
  currentProfileName?: string | null
  isCapturing: boolean
  onUpdate: (command: BindingCommand, patch: BindingCommandPatch) => void
  onRemove: (command: BindingCommand) => void
  onDuplicate: (command: BindingCommand) => void
  onCopy?: (command: BindingCommand) => void
  onCapture: (command: BindingCommand) => void
  onEnableVirtualController?: () => void
  /** What B does from here, for the hint capsule: "Close RB". */
  closeLabel?: string
  /** Chords are edited in the input's modeshift panel, so this row cannot hold one. */
  chordsLiveInModeshifts?: boolean
  /** Just added: the row glows in its lane's colour for a moment (2f). */
  justAdded?: boolean
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

const isTextEntry = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  return Boolean(element && element.matches('input, textarea, select, [contenteditable="true"]'))
}

/**
 * One command in the open binding card's Commands lane (binding card refresh
 * 3c): the input's glyph, its activation as a coloured chip-select, an arrow,
 * the output as a keycap (A opens the action picker), the input's name, and a
 * cog for everything else.
 */
export const BindingCommandCard = forwardRef<HTMLDivElement, BindingCommandCardProps>(function BindingCommandCard({
  inputLabel,
  layerInput,
  command,
  glyph,
  label,
  onLabelChange,
  modifierOptions,
  specialOptions,
  virtualControllerType,
  libraryProfiles,
  currentProfileName,
  isCapturing,
  onUpdate,
  onRemove,
  onDuplicate,
  onCopy,
  onCapture,
  onEnableVirtualController,
  closeLabel = 'Back',
  chordsLiveInModeshifts,
  justAdded,
}, ref) {
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
  // A parsed token arrives stripped: its action modifier is `outputBehavior`
  // and its event modifier `triggerKind`, both shown on their own, so the
  // value is read alone with the behaviour word in front.
  const outputLabel = virtualLabel ?? (describeBinding(command.outputValue, t) || '')
  const summaryOutput = outputLabel ? (behaviorLabel ? `${behaviorLabel} ${outputLabel}` : outputLabel) : ''
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

  // Every activation is offered on the chip (the common ones, then the rest);
  // one that needs its own config line is moved there by the card. Where the
  // input's modeshift panel owns chords, or there is nothing to chord with,
  // the kinds that need a second input are left out: made here, they would be
  // written to a line this card does not show.
  const canRetarget = command.source.kind === 'row' && command.triggerKind !== 'stickShift'
  const conditionsAllowed = !chordsLiveInModeshifts && modifierOptions.length > 0
  const triggerGroups = buildTriggerGroups(t)
    .map(group => ({ ...group, options: group.options.filter(option => conditionsAllowed || !conditionTriggers.has(option.value as BindingCommand['triggerKind'])) }))
    .filter(group => group.options.length > 0)

  // X captures a key for this command, as X does inside the picker. Only a
  // written or draft row can take one: a gyro special or a stick shift has no
  // key to capture into.
  const canCaptureHere = command.source.kind === 'row' && command.triggerKind !== 'stickShift'
  const captureHint = canCaptureHere ? 'X:Capture;' : ''
  const canChange = command.isRoundTripSafe && command.triggerKind !== 'stickShift'
  const rowHints = `A:${canChange ? 'Change action' : 'Settings'};${captureHint}Y:Settings;B:${closeLabel}`

  return (
    <>
      <div ref={ref} className={laneStyles.row} data-kind={glyph ? 'command' : 'command-bare'} data-command-row={command.id}
        data-just-added={justAdded ? 'true' : undefined}
        data-capturing={isCapturing ? 'true' : undefined}
        data-pad-keys={`${canCaptureHere ? 'X' : ''}Y`}
        data-hints={rowHints}
        onKeyDown={event => {
          if (event.defaultPrevented || isTextEntry(event.target)) return
          if (canCaptureHere && (event.key === 'x' || event.key === 'X')) { event.preventDefault(); onCapture(command); return }
          if (event.key === 'y' || event.key === 'Y') { event.preventDefault(); setSettingsOpen(true) }
        }}
        onContextMenu={event => { event.preventDefault(); setSettingsOpen(true) }}>
        {glyph && <span className={laneStyles.glyph} aria-hidden="true">{glyph}</span>}
        {canRetarget ? (
          <span data-hints={`A:Change activation;${captureHint}Y:Settings;B:${closeLabel}`}>
            <Select
              className={laneStyles.chip}
              value={command.triggerKind}
              groups={triggerGroups}
              ariaLabel={t('keymap.commandTrigger')}
              onValueChange={value => {
                const next = value as BindingCommand['triggerKind']
                onUpdate(command, {
                  triggerKind: next,
                  // A chord with nothing to chord against is dropped on write;
                  // seed the default partner, which the settings sheet changes.
                  conditionInput: conditionTriggers.has(next) ? command.conditionInput ?? modifierOptions[0]?.value : undefined,
                })
                if (conditionTriggers.has(next)) setSettingsOpen(true)
              }}
            />
          </span>
        ) : (
          <span className={laneStyles.chip} data-static="true">{triggerLabel}</span>
        )}
        <span className={laneStyles.arrow} aria-hidden="true">→</span>
        <button type="button" className={laneStyles.keycap} aria-label={`${t('keymap.chooseAction', 'Choose action')}: ${summaryOutput || t('keymap.commandNoOutput')}`}
          title={explainBinding(command.outputValue, t)} data-hints={rowHints}
          onClick={() => canChange ? setPickerOpen(true) : setSettingsOpen(true)}>
          {conditionLabel && <span className={laneStyles.badge}>{conditionLabel}</span>}
          <span className={`${laneStyles.keycapText} ${summaryOutput ? '' : laneStyles.keycapEmpty}`}>{summaryOutput || t('keymap.commandChooseOutput', 'Choose…')}</span>
          {!command.isRoundTripSafe && <span className={laneStyles.badge}>{t('keymap.commandRawSyntax')}</span>}
        </button>
        {glyph && (
          <span className={`${laneStyles.text} ${label ? '' : laneStyles.textEmpty}`}>
            {label === undefined ? '' : label || t('keymap.bindingLabelPlaceholder', 'Name this action')}
          </span>
        )}
        <button type="button" className="console-btn console-btn--icon" aria-label={t('keymap.commandSettings', 'Command settings')}
          onClick={() => setSettingsOpen(true)} data-hints={`A:Settings;${captureHint}B:${closeLabel}`}>
          <Icon name="cog" size={18} />
        </button>
      </div>
      {virtualWarning && <div className={laneStyles.warning}>{virtualWarning}</div>}
      {pickerOpen && <ActionPicker layerInput={layerInput} inputLabel={inputLabel} command={command} virtualControllerType={virtualControllerType} specialOptions={specialOptions} libraryProfiles={libraryProfiles} currentProfileName={currentProfileName} onSelect={patch => onUpdate(command, patch)} onClose={() => setPickerOpen(false)} onEnableVirtualController={onEnableVirtualController} onCapture={canCaptureHere ? () => onCapture(command) : undefined} />}
      <CommandSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        command={command}
        eyebrow={`${inputLabel} · ${triggerLabel}`}
        title={summaryOutput || t('keymap.commandSettings', 'Command settings')}
        modifierOptions={modifierOptions}
        onChange={patch => onUpdate(command, patch)}
        label={label}
        onLabelChange={onLabelChange}
        onDuplicate={() => onDuplicate(command)}
        onCopy={onCopy ? () => onCopy(command) : undefined}
        onRemove={() => onRemove(command)}
      />
    </>
  )
})
