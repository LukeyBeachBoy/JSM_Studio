import { useTranslation } from 'react-i18next'
import type { BindingCommand, BindingCommandPatch, BindingOutputBehavior } from '../../utils/bindingCommands'
import keymapStyles from '../Keymap.module.css'
import styles from './BindingEditor.module.css'
import { Select } from '../ui/Select'
import { Sheet } from '../ui/Sheet'
import { Icon } from '../icons/Icon'
import { SettingOrigin } from '../SettingOrigin'
import { conditionTriggers } from './triggerKinds'
import { BindingLabelField } from './BindingLabelField'

type Option = { value: string; label: string; disabled?: boolean }

type CommandSettingsProps = {
  open: boolean
  onClose: () => void
  command: BindingCommand
  /** "A button · Press", over the sheet's title. */
  eyebrow: string
  /** What the command sends, in words: the sheet's title. */
  title: string
  modifierOptions: Option[]
  onChange: (patch: BindingCommandPatch) => void
  /** The input's own name; one per input, so it is the same on every row. */
  label?: string
  onLabelChange?: (label: string) => void
  onDuplicate: () => void
  onCopy?: () => void
  onRemove: () => void
}

const BEHAVIOR_OPTIONS: Array<{ value: BindingOutputBehavior; labelKey: string }> = [
  { value: 'normal', labelKey: 'keymap.commandBehaviorNormal' },
  { value: 'tapOnce', labelKey: 'keymap.commandBehaviorTapOnce' },
  { value: 'toggle', labelKey: 'keymap.commandBehaviorToggle' },
  { value: 'releaseOnly', labelKey: 'keymap.commandBehaviorReleaseOnly' },
]

/**
 * A command's settings sheet, opened from its row's cog (binding card refresh
 * 3c). What the command sends is chosen in the action picker from the row's
 * keycap, so this holds only true options -- output mode, and for a chord the
 * input it chords with -- then Rename, Duplicate, Copy and Remove.
 */
export function CommandSettingsSheet({
  open,
  onClose,
  command,
  eyebrow,
  title,
  modifierOptions,
  onChange,
  label,
  onLabelChange,
  onDuplicate,
  onCopy,
  onRemove,
}: CommandSettingsProps) {
  const { t } = useTranslation()
  const locked = command.triggerKind === 'stickShift'
  const showCondition = conditionTriggers.has(command.triggerKind)
  const setting = command.source.kind === 'special' ? command.source.specialKey : command.sourceLine.includes('=') ? command.sourceLine.split('=')[0].trim() : command.physicalInput
  const act = (run: () => void) => () => { onClose(); run() }

  return (
    <Sheet open={open} onClose={onClose} eyebrow={eyebrow} title={title} width={560}
      hints={[{ button: 'A', label: t('keymap.sheetSelect', 'Select') }, { button: 'B', label: t('keymap.sheetClose', 'Close') }]}>
      <div className={styles.sheet} data-capture-ignore="true">
        <div className={styles.field}>
          <span>{t('keymap.commandBehavior')}</span>
          <div className="segmented" role="radiogroup" aria-label={t('keymap.commandBehavior')} data-hints="MOVE:Choose;A:Select;B:Close">
            {BEHAVIOR_OPTIONS.map(option => (
              <button key={option.value} type="button" role="radio" aria-checked={command.outputBehavior === option.value} disabled={locked}
                onClick={() => onChange({ outputBehavior: option.value })}>
                {t(option.labelKey)}
              </button>
            ))}
          </div>
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

        {onLabelChange && (
          <label className={styles.field}>
            <span>{t('keymap.commandRename', 'Name')}</span>
            <BindingLabelField value={label} onChange={onLabelChange} className={styles.nameField} />
          </label>
        )}

        {command.outputValue === 'TURN_OFF_CONTROLLER' && (
          <p className={keymapStyles.hapticHint}>{t('keymap.turnOffControllerHint')}</p>
        )}
        <SettingOrigin setting={setting} />

        <div className={styles.actions}>
          <button type="button" className="console-btn" onClick={act(onDuplicate)} data-hints="A:Duplicate;B:Close">
            <Icon name="add" size={18} />{t('keymap.commandDuplicate')}
          </button>
          <button type="button" className="console-btn" disabled={!onCopy} onClick={act(() => onCopy?.())} data-hints="A:Copy;B:Close">
            <Icon name="copy" size={18} />{t('keymap.commandCopy')}
          </button>
          <button type="button" className="console-btn console-btn--danger" onClick={act(onRemove)} data-hints="A:Remove;B:Close">
            <Icon name="remove" size={18} />{t('keymap.removeBinding')}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
