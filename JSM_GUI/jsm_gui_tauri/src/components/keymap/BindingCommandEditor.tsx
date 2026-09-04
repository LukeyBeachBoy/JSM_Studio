import { useTranslation } from 'react-i18next'
import {
  BindingCommand,
  BindingCommandPatch,
  BindingOutputBehavior,
  BindingOutputKind,
  BindingTriggerKind,
} from '../../utils/bindingCommands'
import keymapStyles from '../Keymap.module.css'
import { HapticOutputPicker } from './HapticOutputPicker'
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

type Option = { value: string; label: string; disabled?: boolean }

type BindingCommandEditorProps = {
  command: BindingCommand
  modifierOptions: Option[]
  specialOptions: Option[]
  virtualControllerType: VirtualControllerType
  isCapturing: boolean
  captureLabel: string
  onChange: (patch: BindingCommandPatch) => void
  onCapture: () => void
}

const TRIGGER_OPTIONS: Array<{ value: BindingTriggerKind; labelKey: string }> = [
  { value: 'regular', labelKey: 'keymap.commandTriggerRegular' },
  { value: 'tap', labelKey: 'keymap.commandTriggerTap' },
  { value: 'hold', labelKey: 'keymap.commandTriggerHold' },
  { value: 'double', labelKey: 'keymap.commandTriggerDouble' },
  { value: 'release', labelKey: 'keymap.commandTriggerRelease' },
  { value: 'turbo', labelKey: 'keymap.commandTriggerTurbo' },
  { value: 'chord', labelKey: 'keymap.commandTriggerChord' },
  { value: 'simultaneous', labelKey: 'keymap.commandTriggerSimultaneous' },
  { value: 'diagonal', labelKey: 'keymap.commandTriggerDiagonal' },
]

const OUTPUT_KIND_OPTIONS: Array<{ value: BindingOutputKind; labelKey: string }> = [
  { value: 'keyboard', labelKey: 'keymap.commandOutputKeyboard' },
  { value: 'mouse', labelKey: 'keymap.commandOutputMouse' },
  { value: 'wheel', labelKey: 'keymap.commandOutputWheel' },
  { value: 'virtualController', labelKey: 'keymap.commandOutputVirtualController' },
  { value: 'haptic', labelKey: 'keymap.commandOutputHaptic' },
  { value: 'special', labelKey: 'keymap.commandOutputSpecial' },
  { value: 'command', labelKey: 'keymap.commandOutputCommand' },
  { value: 'raw', labelKey: 'keymap.commandOutputRaw' },
]

const BEHAVIOR_OPTIONS: Array<{ value: BindingOutputBehavior; labelKey: string }> = [
  { value: 'normal', labelKey: 'keymap.commandBehaviorNormal' },
  { value: 'tapOnce', labelKey: 'keymap.commandBehaviorTapOnce' },
  { value: 'toggle', labelKey: 'keymap.commandBehaviorToggle' },
  { value: 'releaseOnly', labelKey: 'keymap.commandBehaviorReleaseOnly' },
]

const mouseOptions = ['LMOUSE', 'MMOUSE', 'RMOUSE', 'BMOUSE', 'FMOUSE']
const wheelOptions = ['SCROLLUP', 'SCROLLDOWN']
const conditionTriggers = new Set<BindingTriggerKind>(['chord', 'simultaneous', 'diagonal'])

export function BindingCommandEditor({
  command,
  modifierOptions,
  specialOptions,
  virtualControllerType,
  isCapturing,
  captureLabel,
  onChange,
  onCapture,
}: BindingCommandEditorProps) {
  const { t } = useTranslation()
  const canCapture = command.outputKind === 'keyboard' || command.outputKind === 'mouse' || command.outputKind === 'wheel'
  const showCondition = conditionTriggers.has(command.triggerKind)
  const virtualDisplayType = getPreferredVirtualControllerDisplayType(virtualControllerType, command.outputValue)
  const virtualOptions = virtualDisplayType ? getVirtualControllerOptions(virtualDisplayType, t) : []
  const virtualSelection = command.virtualControllerLogicalOutput ?? getVirtualControllerLogicalOutput(command.outputValue) ?? ''
  const handleOutputKindChange = (nextOutputKind: BindingOutputKind) => {
    if (nextOutputKind === command.outputKind) return
    if (nextOutputKind === 'virtualController') {
      const logical = getDefaultVirtualControllerLogicalOutput(virtualControllerType)
      const token = logical ? toVirtualControllerToken(logical, virtualControllerType) ?? '' : ''
      onChange({
        outputKind: nextOutputKind,
        outputValue: token,
        virtualControllerLogicalOutput: logical ?? undefined,
      })
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

  return (
    <div className={keymapStyles.commandEditor}>
      <label>
        <span>{t('keymap.commandTrigger')}</span>
        <select
          className="app-select"
          value={command.triggerKind}
          onChange={(event) => onChange({ triggerKind: event.target.value as BindingTriggerKind })}
          data-capture-ignore="true"
          disabled={command.triggerKind === 'stickShift'}
        >
          {TRIGGER_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </label>

      {showCondition && (
        <label>
          <span>{t('keymap.commandCondition')}</span>
          <select
            className="app-select"
            value={command.conditionInput ?? ''}
            onChange={(event) => onChange({ conditionInput: event.target.value })}
            data-capture-ignore="true"
          >
            {modifierOptions.map(option => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        <span>{t('keymap.commandOutput')}</span>
        <select
          className="app-select"
          value={command.outputKind}
          onChange={(event) => handleOutputKindChange(event.target.value as BindingOutputKind)}
          data-capture-ignore="true"
          disabled={command.triggerKind === 'stickShift'}
        >
          {OUTPUT_KIND_OPTIONS.map(option => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.value === 'virtualController' && virtualControllerType === 'NONE' && command.outputKind !== 'virtualController'}
            >
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </label>

      <label className={keymapStyles.commandOutputValue}>
        <span>{t('keymap.commandOutputValue')}</span>
        {command.outputKind === 'mouse' ? (
          <select
            className="app-select"
            value={command.outputValue}
            onChange={(event) => onChange({ outputValue: event.target.value })}
            data-capture-ignore="true"
          >
            <option value="">{t('keymap.commandNoOutput')}</option>
            {mouseOptions.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        ) : command.outputKind === 'wheel' ? (
          <select
            className="app-select"
            value={command.outputValue}
            onChange={(event) => onChange({ outputValue: event.target.value })}
            data-capture-ignore="true"
          >
            <option value="">{t('keymap.commandNoOutput')}</option>
            {wheelOptions.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        ) : command.outputKind === 'haptic' ? (
          <HapticOutputPicker
            value={command.outputValue}
            disabled={command.triggerKind === 'stickShift'}
            onChange={(next) => onChange({ outputValue: next })}
          />
        ) : command.outputKind === 'special' ? (
          <select
            className="app-select"
            value={command.outputValue}
            onChange={(event) => onChange({ outputValue: event.target.value })}
            data-capture-ignore="true"
            disabled={command.triggerKind === 'stickShift'}
          >
            <option value="">{t('keymap.commandNoOutput')}</option>
            {specialOptions.map(option => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        ) : command.outputKind === 'virtualController' ? (
          <select
            className="app-select"
            value={virtualSelection}
            onChange={(event) => {
              const logical = event.target.value as VirtualControllerLogicalOutput | ''
              const tokenType = virtualControllerType !== 'NONE' ? virtualControllerType : virtualDisplayType
              const token = logical && tokenType ? toVirtualControllerToken(logical, tokenType) ?? '' : ''
              onChange({ outputValue: token, virtualControllerLogicalOutput: logical || undefined })
            }}
            data-capture-ignore="true"
            disabled={command.triggerKind === 'stickShift' || virtualControllerType === 'NONE'}
          >
            <option value="">{t('keymap.commandNoOutput')}</option>
            {virtualOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={command.outputValue}
            onChange={(event) => onChange({ outputValue: event.target.value })}
            placeholder={command.outputKind === 'command' ? t('keymap.advancedCommandPlaceholder') : t('keymap.advancedValuePlaceholder')}
            data-capture-ignore="true"
          />
        )}
      </label>

      {canCapture && (
        <button type="button" className={keymapStyles.commandCaptureBtn} onClick={onCapture}>
          {isCapturing ? captureLabel : t('keymap.captureToken')}
        </button>
      )}

      <label>
        <span>{t('keymap.commandBehavior')}</span>
        <select
          className="app-select"
          value={command.outputBehavior}
          onChange={(event) => onChange({ outputBehavior: event.target.value as BindingOutputBehavior })}
          data-capture-ignore="true"
          disabled={command.triggerKind === 'stickShift'}
        >
          {BEHAVIOR_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
