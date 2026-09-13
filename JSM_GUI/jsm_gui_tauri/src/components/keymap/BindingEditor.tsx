import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BindingCommand,
  BindingCommandPatch,
  BindingOutputBehavior,
  BindingOutputKind,
} from '../../utils/bindingCommands'
import keymapStyles from '../Keymap.module.css'
import styles from './BindingEditor.module.css'
import { Select, type SelectGroup } from '../ui/Select'
import { conditionTriggers } from './triggerKinds'
import { AdvancedDisclosure } from '../AdvancedDisclosure'
import { HapticOutputPicker } from './HapticOutputPicker'
import { KeyboardBindingModal } from './KeyboardBindingModal'
import { DEFAULT_HAPTIC_BINDING, formatHapticBinding } from '../../utils/hapticBindings'
import {
  getDefaultVirtualControllerLogicalOutput,
  getPreferredVirtualControllerDisplayType,
  getVirtualControllerLogicalOutput,
  getVirtualControllerOptions,
  toVirtualControllerToken,
  type VirtualControllerLogicalOutput,
  type VirtualControllerType,
} from '../../utils/virtualController'
import { loadConfigBindingName, loadConfigBindingValue } from '../../utils/loadConfigBinding'
import { keyDisplayName, keyTokenFromDisplay } from '../../utils/keyNames'

type Option = { value: string; label: string; disabled?: boolean }

type BindingEditorProps = {
  command: BindingCommand
  modifierOptions: Option[]
  specialOptions: Option[]
  virtualControllerType: VirtualControllerType
  isCapturing: boolean
  captureLabel: string
  onChange: (patch: BindingCommandPatch) => void
  onCapture: () => void
  /** Turns the virtual gamepad on when a binding asks for one. */
  onEnableVirtualController?: () => void
  /** Configurations this profile can switch to, for a load-config binding. */
  libraryProfiles?: string[]
  /** The configuration being edited, so it can be marked in that list. */
  currentProfileName?: string | null
}




const COMMON_OUTPUTS: BindingOutputKind[] = ['keyboard', 'mouse', 'wheel']
const RARE_OUTPUTS: BindingOutputKind[] = ['virtualController', 'haptic', 'special', 'loadConfig', 'command', 'raw']

const OUTPUT_LABEL_KEYS: Record<BindingOutputKind, string> = {
  keyboard: 'keymap.commandOutputKeyboard',
  mouse: 'keymap.commandOutputMouse',
  wheel: 'keymap.commandOutputWheel',
  virtualController: 'keymap.commandOutputVirtualController',
  haptic: 'keymap.commandOutputHaptic',
  special: 'keymap.commandOutputSpecial',
  command: 'keymap.commandOutputCommand',
  loadConfig: 'keymap.commandOutputLoadConfig',
  raw: 'keymap.commandOutputRaw',
}

const BEHAVIOR_OPTIONS: Array<{ value: BindingOutputBehavior; labelKey: string }> = [
  { value: 'normal', labelKey: 'keymap.commandBehaviorNormal' },
  { value: 'tapOnce', labelKey: 'keymap.commandBehaviorTapOnce' },
  { value: 'toggle', labelKey: 'keymap.commandBehaviorToggle' },
  { value: 'releaseOnly', labelKey: 'keymap.commandBehaviorReleaseOnly' },
]

const mouseOptions = ['LMOUSE', 'MMOUSE', 'RMOUSE', 'BMOUSE', 'FMOUSE']
const wheelOptions = ['SCROLLUP', 'SCROLLDOWN']
// Valid keyboard-output tokens that a physical key capture cannot produce, so
// without this quick-pick they are only reachable by typing the exact token.
const systemKeyOptions = ['VOLUME_UP', 'VOLUME_DOWN', 'MUTE', 'SCREENSHOT', 'NEXT_TRACK', 'PREV_TRACK', 'PLAY_PAUSE']
const builtInCommandOptions = ['TURN_OFF_CONTROLLER', 'RESTART_GYRO_CALIBRATION', 'FINISH_GYRO_CALIBRATION', 'CALIBRATE_TRIGGERS']

export function BindingEditor({
  command,
  modifierOptions,
  specialOptions,
  virtualControllerType,
  libraryProfiles = [],
  currentProfileName,
  isCapturing,
  captureLabel,
  onChange,
  onCapture,
  onEnableVirtualController,
}: BindingEditorProps) {
  const { t } = useTranslation()
  const [keyboardPickerOpen, setKeyboardPickerOpen] = useState(false)
  const valueInputRef = useRef<HTMLInputElement>(null)
  // Clearing a written binding turns the card back into an empty draft, which
  // remounts this editor and drops the caret on the floor. Take it back only
  // when nothing else has claimed focus, so this never steals it.
  useEffect(() => {
    if (command.outputValue) return
    if (document.activeElement && document.activeElement !== document.body) return
    valueInputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const locked = command.triggerKind === 'stickShift'
  const canCapture = COMMON_OUTPUTS.includes(command.outputKind)
  const showCondition = conditionTriggers.has(command.triggerKind)
  // With no gamepad configured there is no scheme to read the options from, so
  // fall back to the Xbox layout -- the same one selecting this output turns on.
  const virtualDisplayType = getPreferredVirtualControllerDisplayType(virtualControllerType, command.outputValue) ?? 'XBOX'
  const virtualOptions = getVirtualControllerOptions(virtualDisplayType, t)
  const virtualSelection = command.virtualControllerLogicalOutput ?? getVirtualControllerLogicalOutput(command.outputValue) ?? ''

  const outputGroups: SelectGroup[] = [
    { options: COMMON_OUTPUTS.map(value => ({ value, label: t(OUTPUT_LABEL_KEYS[value]) })) },
    {
      label: t('keymap.advancedOptions'),
      // Virtual controller stays selectable with no virtual gamepad configured:
      // choosing it switches the gamepad on, which is what you meant. Greying it
      // out left you with no way to find out why from here.
      options: RARE_OUTPUTS.map(value => ({
        value,
        label: t(OUTPUT_LABEL_KEYS[value]),
        hint: value === 'virtualController' && virtualControllerType === 'NONE' ? t('keymap.virtualControllerTurnsOn') : undefined,
      })),
    },
  ]

  const handleOutputKindChange = (nextOutputKind: BindingOutputKind) => {
    if (nextOutputKind === command.outputKind) return
    if (nextOutputKind === 'virtualController') {
      // With no gamepad configured there is nothing to emit into, so turn one on
      // and bind against it rather than leaving the row inert.
      const effectiveType = virtualControllerType === 'NONE' ? 'XBOX' : virtualControllerType
      if (virtualControllerType === 'NONE') onEnableVirtualController?.()
      const logical = getDefaultVirtualControllerLogicalOutput(effectiveType)
      const token = logical ? toVirtualControllerToken(logical, effectiveType) ?? '' : ''
      onChange({ outputKind: nextOutputKind, outputValue: token, virtualControllerLogicalOutput: logical ?? undefined })
      return
    }
    if (nextOutputKind === 'loadConfig') {
      // Seed the first configuration rather than an empty path, so the row
      // is valid the moment it is chosen. Anything but this profile: loading
      // the one you are already in does nothing useful.
      const first = libraryProfiles.find(name => name !== currentProfileName) ?? libraryProfiles[0]
      onChange({ outputKind: nextOutputKind, outputValue: first ? loadConfigBindingValue(first) : '' })
      return
    }
    if (nextOutputKind === 'haptic') {
      onChange({
        outputKind: nextOutputKind,
        outputValue: formatHapticBinding(DEFAULT_HAPTIC_BINDING),
        virtualControllerLogicalOutput: undefined,
      })
      return
    }
    onChange({ outputKind: nextOutputKind, outputValue: '', virtualControllerLogicalOutput: undefined })
  }

  const renderOutputValue = () => {
    if (command.outputKind === 'haptic') {
      return <HapticOutputPicker value={command.outputValue} disabled={locked} onChange={next => onChange({ outputValue: next })} />
    }
    if (command.outputKind === 'mouse' || command.outputKind === 'wheel') {
      const values = command.outputKind === 'mouse' ? mouseOptions : wheelOptions
      return (
        <Select
          value={command.outputValue}
          onValueChange={value => onChange({ outputValue: value })}
          options={values.map(value => ({ value, label: value }))}
          placeholder={t('keymap.commandNoOutput')}
          disabled={locked}
          ariaLabel={t('keymap.commandOutputValue')}
        />
      )
    }
    if (command.outputKind === 'loadConfig') {
      const selected = loadConfigBindingName(command.outputValue)
      // A path pointing at a configuration that no longer exists still has to
      // be shown, or renaming a profile would silently empty the control that
      // refers to it.
      const names = selected && !libraryProfiles.includes(selected) ? [...libraryProfiles, selected] : libraryProfiles
      return (
        <Select
          value={selected ?? ''}
          onValueChange={value => onChange({ outputValue: value ? loadConfigBindingValue(value) : '' })}
          options={names.map(name => ({
            value: name,
            label: name === currentProfileName ? t('keymap.commandLoadConfigCurrent', { name }) : name,
          }))}
          placeholder={t('keymap.commandLoadConfigPlaceholder')}
          disabled={locked}
          ariaLabel={t('keymap.commandOutputValue')}
        />
      )
    }
    if (command.outputKind === 'special') {
      return (
        <Select
          value={command.outputValue}
          onValueChange={value => onChange({ outputValue: value })}
          options={specialOptions.map(option => ({ value: option.value, label: option.label, disabled: option.disabled }))}
          placeholder={t('keymap.commandNoOutput')}
          disabled={locked}
          ariaLabel={t('keymap.commandOutputValue')}
        />
      )
    }
    if (command.outputKind === 'virtualController') {
      return (
        <Select
          value={virtualSelection}
          onValueChange={value => {
            const logical = value as VirtualControllerLogicalOutput | ''
            const tokenType = virtualControllerType !== 'NONE' ? virtualControllerType : virtualDisplayType
            const token = logical && tokenType ? toVirtualControllerToken(logical, tokenType) ?? '' : ''
            onChange({ outputValue: token, virtualControllerLogicalOutput: logical || undefined })
          }}
          options={virtualOptions.map(option => ({ value: option.value, label: option.label }))}
          placeholder={t('keymap.commandNoOutput')}
          disabled={locked}
          ariaLabel={t('keymap.commandOutputValue')}
        />
      )
    }
    // Keyboard, raw and console-command values are free text, with capture as
    // the fast path for anything a physical key can produce.
    return (
      <div className={styles.valueRow}>
        <input
          ref={valueInputRef}
          className={`${styles.valueInput} ${isCapturing ? styles.valueInputCapturing : ''}`}
          type="text"
          // Shown by the name on the key; stored as the token the backend
          // reads. Typing either works, so anyone who knows the tokens can
          // still use them, and anything unrecognised passes through.
          value={keyDisplayName(command.outputValue)}
          onChange={event => onChange({ outputValue: keyTokenFromDisplay(event.target.value) })}
          placeholder={
            isCapturing
              ? captureLabel
              : command.outputKind === 'command'
                ? t('keymap.advancedCommandPlaceholder')
                : t('keymap.quickOutputPlaceholder')
          }
          disabled={locked}
          data-capture-ignore="true"
        />
        {canCapture && (
          <button
            type="button"
            className={`secondary-btn ${styles.captureBtn}`}
            onClick={onCapture}
            disabled={locked}
            data-capture-ignore="true"
          >
            {isCapturing ? captureLabel : t('keymap.captureToken')}
          </button>
        )}
        {command.outputKind === 'keyboard' && (
          // Typing a binding needs you to already know the JSM token; the
          // picker lets you point at the key on a drawn keyboard instead.
          <button
            type="button"
            className={`secondary-btn ${styles.captureBtn}`}
            onClick={() => setKeyboardPickerOpen(true)}
            disabled={locked}
            data-capture-ignore="true"
          >
            {t('keymap.keyboardPickerOpen')}
          </button>
        )}
        <KeyboardBindingModal
          isOpen={keyboardPickerOpen}
          value={command.outputValue}
          onSelect={token => onChange({ outputValue: token })}
          onClose={() => setKeyboardPickerOpen(false)}
        />
      </div>
    )
  }

  return (
    <div className={styles.editor} data-capture-ignore="true">
      <div className={styles.row}>
        {/* The trigger lives in the card header, where it stays readable with
            the card collapsed. Editing it in two places let the two pickers
            drift apart, offering different sets of the same choices. */}
        <label className={styles.field}>
          <span>{t('keymap.commandOutput')}</span>
          <Select
            value={command.outputKind}
            onValueChange={value => handleOutputKindChange(value as BindingOutputKind)}
            groups={outputGroups}
            disabled={locked}
            ariaLabel={t('keymap.commandOutput')}
          />
        </label>
      </div>

      {showCondition && (
        <label className={styles.field}>
          <span>{t('keymap.commandCondition')}</span>
          <Select
            value={command.conditionInput ?? ''}
            onValueChange={value => onChange({ conditionInput: value })}
            options={modifierOptions.map(option => ({ value: option.value, label: option.label, disabled: option.disabled }))}
            ariaLabel={t('keymap.commandCondition')}
          />
        </label>
      )}

      <label className={styles.field}>
        <span>{t('keymap.commandOutputValue')}</span>
        {renderOutputValue()}
      </label>

      <AdvancedDisclosure>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>{t('keymap.commandBehavior')}</span>
            <Select
              value={command.outputBehavior}
              onValueChange={value => onChange({ outputBehavior: value as BindingOutputBehavior })}
              options={BEHAVIOR_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey) }))}
              disabled={locked}
              ariaLabel={t('keymap.commandBehavior')}
            />
          </label>

          {command.outputKind === 'keyboard' && (
            <label className={styles.field}>
              <span>{t('keymap.commandOutputSystemKey')}</span>
              <Select
                value={systemKeyOptions.includes(command.outputValue) ? command.outputValue : ''}
                onValueChange={value => onChange({ outputValue: value })}
                options={systemKeyOptions.map(value => ({ value, label: keyDisplayName(value) }))}
                placeholder={t('keymap.commandNoOutput')}
                ariaLabel={t('keymap.commandOutputSystemKey')}
              />
            </label>
          )}

          {command.outputKind === 'command' && (
            <label className={styles.field}>
              <span>{t('keymap.commandOutputBuiltIn')}</span>
              <Select
                value={builtInCommandOptions.includes(command.outputValue) ? command.outputValue : ''}
                onValueChange={value => onChange({ outputValue: value })}
                options={builtInCommandOptions.map(value => ({ value, label: value }))}
                placeholder={t('keymap.commandNoOutput')}
                ariaLabel={t('keymap.commandOutputBuiltIn')}
              />
            </label>
          )}
        </div>
        {command.outputValue === 'TURN_OFF_CONTROLLER' && (
          <p className={keymapStyles.hapticHint}>{t('keymap.turnOffControllerHint')}</p>
        )}
      </AdvancedDisclosure>
    </div>
  )
}
