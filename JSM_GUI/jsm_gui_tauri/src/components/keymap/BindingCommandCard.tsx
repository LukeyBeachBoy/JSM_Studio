import { parseMenuCommand, menuCommandLabel } from '../../utils/menuCommands'
import { readVirtualMenus } from '../../utils/virtualMenus'
import { forwardRef, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BindingCommand, BindingCommandPatch, BindingTriggerKind, isFixedCommand } from '../../utils/bindingCommands'
import { Icon } from '../icons/Icon'
import { Select } from '../ui/Select'
import { CommandSettingsSheet } from './BindingEditor'
import { ActionPicker } from './ActionPicker'
import { laneStyles, removeRow } from './Lane'
import { buildTriggerGroups, conditionTriggers, TRIGGER_LABEL_KEYS } from './triggerKinds'
import {
  getPreferredVirtualControllerDisplayType,
  getVirtualControllerLogicalOutput,
  getVirtualControllerOutputLabel,
  getVirtualControllerTokenType,
  type VirtualControllerType,
} from '../../utils/virtualController'
import { describeCommandOutput, explainCommandOutput } from '../../utils/bindingDescription'
import { LayerUsageContext } from '../LayerBar'
import { LayerTile } from './ConceptTiles'
import { hasBindingParameters } from '../../utils/bindingParameters'

type Option = { value: string; label: string; disabled?: boolean }

type BindingCommandCardProps = {
  allowedTriggers?: BindingTriggerKind[]
  allowCapture?: boolean
  allowHeldLed?: boolean
  inputLabel: string
  /** "A", for a layer action's "On while A is held". */
  inputShortName?: string
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
  /** Just added from the picker with a parameter to set: its sheet opens at once (TODO-54). */
  openSettingsOnMount?: boolean
  onSettingsOpened?: () => void
  /** The profile's (or the app's) LED colour and brightness, for the LED rows' sheets. */
  defaultLedColor?: string
  baseLedBrightness?: number
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
 *
 * An LED-while-held row or a layer-action row (TODO-54, TODO-55) is the same
 * row with a fixed activation: its keycap opens the settings sheet, where the
 * colour, the sound or the layer is chosen, since the picker has no token to
 * swap for it.
 */
export const BindingCommandCard = forwardRef<HTMLDivElement, BindingCommandCardProps>(function BindingCommandCard({
  allowedTriggers,
  allowCapture = true,
  allowHeldLed = true,
  inputLabel,
  inputShortName,
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
  openSettingsOnMount,
  onSettingsOpened,
  defaultLedColor,
  baseLedBrightness,
}, ref) {
  const { t } = useTranslation()
  const { layers, text: menuText } = useContext(LayerUsageContext)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const setRow = (element: HTMLDivElement | null) => {
    rowRef.current = element
    if (typeof ref === 'function') ref(element)
    else if (ref) ref.current = element
  }
  // Added from the picker with something still to choose: straight into the
  // sheet, once the row is there to return focus to.
  useEffect(() => {
    if (!openSettingsOnMount) return
    setSettingsOpen(true)
    onSettingsOpened?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSettingsOnMount])
  const fixed = isFixedCommand(command)
  const triggerLabel = t(TRIGGER_LABEL_KEYS[command.triggerKind])
  const behaviorLabel = command.outputBehavior === 'normal' ? '' : t(BEHAVIOR_LABEL_KEYS[command.outputBehavior])
  // The second input of a chord or simultaneous press: its own chip before
  // the arrow (the keycap keeps its width), the kind in small over the name.
  const conditionKind = command.conditionInput ? t(conditionPrefixKeys[command.triggerKind] ?? 'keymap.commandCondition') : ''
  const conditionName = command.conditionInput ? modifierOptions.find(option => option.value === command.conditionInput)?.label.split(' — ')[0] ?? command.conditionInput : ''
  const conditionLabel = command.conditionInput ? `${conditionKind}: ${conditionName}` : ''
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
  const menuCommand = parseMenuCommand(command.outputValue)
  const menuLabel = menuCommand ? menuCommandLabel(command.outputValue, readVirtualMenus(menuText ?? '').menus.find(menu => menu.id === menuCommand.id)?.name) : null
  const outputLabel = menuLabel ?? virtualLabel ?? (describeCommandOutput(command, layers, t) || '')
  const summaryOutput = outputLabel ? (behaviorLabel && !/^LIGHT_BAR\s*=/i.test(command.outputValue) ? `${behaviorLabel} ${outputLabel}` : outputLabel) : ''
  const outputTitle = explainCommandOutput(command, inputShortName ?? inputLabel, t)
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
  const ledCommand = command.source.kind === 'heldLed' || /^LIGHT_BAR\s*=/i.test(command.outputValue)
  const canRetarget = command.source.kind === 'row' && command.triggerKind !== 'stickShift' && !ledCommand
  const conditionsAllowed = !chordsLiveInModeshifts && modifierOptions.length > 0
  const triggerGroups = buildTriggerGroups(t)
    .map(group => ({ ...group, options: group.options.filter(option => (!allowedTriggers || allowedTriggers.includes(option.value as BindingTriggerKind)) && (conditionsAllowed || !conditionTriggers.has(option.value as BindingCommand['triggerKind'])) && (menuCommand?.verb !== 'HOLD' || !['release', 'turbo'].includes(option.value))) }))
    .filter(group => group.options.length > 0)

  // X captures a key for this command, as X does inside the picker. Only a
  // written or draft row can take one: a gyro special or a stick shift has no
  // key to capture into.
  const canCaptureHere = allowCapture && command.source.kind === 'row' && command.triggerKind !== 'stickShift'
  const captureHint = canCaptureHere ? 'X:Capture;' : ''
  const canChange = command.isRoundTripSafe && command.triggerKind !== 'stickShift' && !fixed
  const rowHints = `A:${canChange ? 'Change action' : 'Settings'};${captureHint}Y:Settings;B:${closeLabel}`
  const heldLed = command.source.kind === 'heldLed' ? command.source : null
  const layerAction = command.source.kind === 'layerAction' ? command.source.action : null

  return (
    <>
      <div ref={setRow} className={laneStyles.row} data-kind={glyph ? 'command' : 'command-bare'} data-command-row={command.id}
        data-condition={conditionLabel ? 'true' : undefined}
        data-unnamed={glyph && label === undefined ? 'true' : undefined}
        data-just-added={justAdded ? 'true' : undefined}
        data-capturing={isCapturing ? 'true' : undefined}
        data-held-led={heldLed ? 'true' : undefined}
        data-layer-action={layerAction?.layerId}
        data-pad-keys={`${canCaptureHere ? 'X' : ''}Y`}
        data-hints={rowHints}
        onKeyDown={event => {
          if (event.defaultPrevented || isTextEntry(event.target)) return
          if (canCaptureHere && (event.key === 'x' || event.key === 'X')) { event.preventDefault(); onCapture(command); return }
          if (event.key === 'y' || event.key === 'Y') { event.preventDefault(); setSettingsOpen(true) }
        }}
        onContextMenu={event => { event.preventDefault(); setSettingsOpen(true) }}>
        {glyph && <span className={laneStyles.glyph} aria-hidden="true">{glyph}</span>}
        {ledCommand ? <Select className={laneStyles.chip} value={heldLed ? 'hold' : 'press'} ariaLabel="LED activation" options={[{ value: 'press', label: 'Press' }, { value: 'hold', label: 'Hold' }]} onValueChange={value => onUpdate(command, { ledActivation: value as 'press' | 'hold' })} /> : canRetarget ? (
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
                if (conditionTriggers.has(next) || next === 'turbo') setSettingsOpen(true)
              }}
            />
          </span>
        ) : (
          <span className={laneStyles.chip} data-static="true">{triggerLabel}</span>
        )}
        {conditionLabel && (
          <span className={laneStyles.condition} title={conditionLabel}>
            <span className={laneStyles.conditionKind}>{conditionKind}</span>
            <span>{conditionName}</span>
          </span>
        )}
        <span className={laneStyles.arrow} aria-hidden="true">→</span>
        {layerAction ? (
          // The layer's tile is the keycap: its colour is the layer's, and A
          // opens the sheet where the layer and the verb are chosen.
          <button type="button" className={laneStyles.tileButton} aria-label={`${t('keymap.chooseAction', 'Choose action')}: ${summaryOutput}`}
            title={outputTitle} data-hints={rowHints} onClick={() => setSettingsOpen(true)}>
            <LayerTile layerId={layerAction.layerId} verb={layerAction.verb} size="md" title={outputTitle} />
          </button>
        ) : (
          <button type="button" className={laneStyles.keycap} aria-label={`${t('keymap.chooseAction', 'Choose action')}: ${summaryOutput || t('keymap.commandNoOutput')}`}
            title={outputTitle} data-hints={rowHints}
            onClick={() => canChange ? setPickerOpen(true) : setSettingsOpen(true)}>
            {ledCommand && <span className={laneStyles.swatch} style={{ background: heldLed?.color ?? `#${/^LIGHT_BAR\s*=\s*x([0-9a-f]{6})/i.exec(command.outputValue)?.[1] ?? 'ffffff'}` }} aria-hidden="true" />}
            <span className={`${laneStyles.keycapText} ${summaryOutput ? '' : laneStyles.keycapEmpty}`}>{summaryOutput || t('keymap.commandChooseOutput', 'Choose…')}</span>
            {!command.isRoundTripSafe && <span className={laneStyles.badge}>{t('keymap.commandRawSyntax')}</span>}
          </button>
        )}
        {/* Each command keeps its own name beside its output. */}
        {glyph && label !== undefined && (
          <span className={`${laneStyles.text} ${label ? '' : laneStyles.textEmpty}`}>
            {label || t('keymap.bindingLabelPlaceholder', 'Name this action')}
          </span>
        )}
        <button type="button" className="console-btn console-btn--icon" aria-label={t('keymap.commandSettings', 'Command settings')}
          onClick={() => setSettingsOpen(true)} data-hints={`A:Settings;${captureHint}B:${closeLabel}`}>
          <Icon name="cog" size={18} />
        </button>
      </div>
      {virtualWarning && <div className={laneStyles.warning}>{virtualWarning}</div>}
      {pickerOpen && <ActionPicker inputLabel={inputLabel} command={command} virtualControllerType={virtualControllerType} specialOptions={specialOptions} libraryProfiles={libraryProfiles} currentProfileName={currentProfileName} defaultLedColor={defaultLedColor} onSelect={patch => {
        onUpdate(command, patch)
        if (hasBindingParameters(patch.outputValue ?? '')) setSettingsOpen(true)
      }} onClose={() => setPickerOpen(false)} onEnableVirtualController={onEnableVirtualController} onCapture={canCaptureHere ? () => onCapture(command) : undefined} />}
      <CommandSettingsSheet
        allowHeldLed={allowHeldLed}
        virtualControllerType={virtualControllerType}
        onEnableVirtualController={onEnableVirtualController}
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
        onCopy={onCopy && !fixed ? () => onCopy(command) : undefined}
        defaultLedColor={defaultLedColor}
        baseLedBrightness={baseLedBrightness}
        inputShortName={inputShortName}
        libraryProfiles={libraryProfiles}
        onEditOutput={!fixed && command.source.kind === 'row' ? () => { setSettingsOpen(false); setPickerOpen(true) } : undefined}
        // The sheet closes first; the removal follows once focus is back on the row.
        onRemove={() => { const row = rowRef.current; setSettingsOpen(false); removeRow(row, () => onRemove(command), { afterClose: true }) }}
      />
    </>
  )
})
