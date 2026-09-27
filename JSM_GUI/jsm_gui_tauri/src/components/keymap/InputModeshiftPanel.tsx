import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppSelect } from '../ui/AppSelect'
import { Sheet } from '../ui/Sheet'
import { Icon } from '../icons/Icon'
import { InputGlyph } from '../glyphs/InputGlyph'
import { addModeshift, modeshiftTriggers, readModeshift, removeModeshift, renameModeshift, writeModeshift, type ModeshiftTarget } from '../../utils/modeshift'
import { heldInput, isReleasedInput, withRelease } from '../../utils/released'
import { getBindingLabel } from '../../utils/bindingLabels'
import { describeBinding, explainBinding } from '../../utils/bindingDescription'
import { commandForValue, replaceFirstOutput } from '../../utils/bindingCommands'
import { parseBindingExpression, serializeBindingToken } from '../../utils/keymap'
import { inputDisplayName } from '../../keymap/inputNames'
import { getActionSpecialOptionList, getButtonDescription, type ButtonDefinition } from '../../keymap/schema'
import { ReleaseSwitch } from './ReleaseSwitch'
import { ShiftedBinding, type InputModeshiftsProps } from './InputModeshifts'
import { ActionPicker } from './ActionPicker'
import { Lane, LaneAddButton, laneStyles } from './Lane'
import { TriggerCap } from './ConceptTiles'
import { OriginMarker } from './OriginMarker'
import sheetStyles from './BindingEditor.module.css'

type Props = Omit<InputModeshiftsProps, 'target' | 'initiallyOpen' | 'livePad'> & {
  button: ButtonDefinition
  /** The input's short name: "A", for "Close A" and the sheet's eyebrow. */
  shortName: string
}

/**
 * The Modeshifts lane of the open binding card (binding card refresh 3c):
 * what this input does while another input is held. One row per shift --
 * the held input's cap, "+", this input, an arrow, what it sends then -- with
 * the output keycap opening the action picker and the cog opening the shift's
 * sheet: held or released, which input, every command of the shift (the same
 * rows the card's own Commands lane has) and Remove.
 */
export function InputModeshiftPanel({ button, shortName, ...props }: Props) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  // A new shift holds while its input is held, or while it is released ("!X").
  const [releasedNew, setReleasedNew] = useState(false)
  const target = useMemo<ModeshiftTarget>(() => ({
    id: button.command,
    title: getButtonDescription(button, t),
    buttons: [{ command: button.command, label: getButtonDescription(button, t), definition: button }],
  }), [button, t])
  const { text, onChange, modifiers, controllerFamily = 'generic' } = props
  const triggers = useMemo(() => modeshiftTriggers(text, target), [text, target])
  const available = modifiers.filter(option => !option.disabled && !triggers.includes(withRelease(option.value, releasedNew)) && option.value !== button.command.toUpperCase())
  const heldName = (trigger: string) => inputDisplayName(heldInput(trigger), controllerFamily)
  const closeLabel = `Close ${shortName}`
  const specialOptions = useMemo(() => getActionSpecialOptionList(t), [t])
  const command = button.command.toUpperCase()
  const pickingValue = picking ? readModeshift(text, picking, command) ?? '' : ''

  return (
    <Lane concept="shift" label={t('keymap.modeshiftsTitle', 'Modeshifts')} count={triggers.length}
      footer={adding ? (
        // Replaced by the "Hold which button?" sheet (3e).
        <div className={laneStyles.inlineAdd}>
          <ReleaseSwitch released={releasedNew} onChange={setReleasedNew} ariaLabel={t('keymap.modeshiftWhen', 'While the input is held or released')} />
          <AppSelect aria-label={t('keymap.modeshiftTrigger', 'Held input')} value="" onChange={event => {
            const trigger = event.target.value && withRelease(event.target.value, releasedNew)
            if (!trigger) return
            onChange(previous => addModeshift(previous, target, trigger))
            setAdding(false)
          }}>
            <option value="">{t('keymap.modeshiftChooseTrigger', 'Choose a trigger…')}</option>
            {available.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </AppSelect>
          <button type="button" className="console-btn" onClick={() => setAdding(false)}>{t('common.cancel', 'Cancel')}</button>
        </div>
      ) : (
        <LaneAddButton concept="shift" label={t('keymap.addModeshiftShort', 'Add modeshift')} disabled={!available.length}
          hints={`A:Add modeshift;B:${closeLabel}`} onClick={() => setAdding(true)} />
      )}>
      {triggers.length > 0 && (
        <div className={laneStyles.rows} aria-label={`${target.title} modeshifts`}>
          {triggers.map(trigger => {
            const value = readModeshift(text, trigger, command) ?? ''
            const tokens = parseBindingExpression(value)?.tokens ?? []
            const first = tokens[0] ? describeBinding(serializeBindingToken(tokens[0]), t) : ''
            const shown = value && value.toUpperCase() !== 'NONE' ? first || describeBinding(value, t) : ''
            const single = tokens.length <= 1 && commandForValue(command, value).isRoundTripSafe
            const label = getBindingLabel(text, `${trigger},${command}`) ?? ''
            const rowHints = `A:${single ? 'Change action' : 'Settings'};Y:Settings;B:${closeLabel}`
            return (
              <div key={trigger} className={laneStyles.row} data-kind="shift" data-modeshift-row={trigger} data-pad-keys="Y" data-hints={rowHints}
                onKeyDown={event => { if (event.key === 'y' || event.key === 'Y') { event.preventDefault(); setEditing(trigger) } }}>
                <span className={laneStyles.chain} title={`${inputDisplayName(trigger, controllerFamily)} + ${shortName}`}>
                  <TriggerCap label={heldName(trigger)} size="lg" />
                  <span className={laneStyles.chainPlus} aria-hidden="true">+</span>
                  <InputGlyph command={button.command} family={controllerFamily} size={28} />
                  {isReleasedInput(trigger) && <span className={laneStyles.badge}>{t('keymap.whileReleased', 'Released')}</span>}
                </span>
                <span className={laneStyles.arrow} aria-hidden="true">→</span>
                <button type="button" className={laneStyles.keycap} title={explainBinding(value, t)} data-hints={rowHints}
                  aria-label={`${t('keymap.chooseAction', 'Choose action')}: ${shown || t('keymap.commandNoOutput')}`}
                  onClick={() => single ? setPicking(trigger) : setEditing(trigger)}>
                  <span className={`${laneStyles.keycapText} ${shown ? '' : laneStyles.keycapEmpty}`}>{shown || t('keymap.commandChooseOutput', 'Choose…')}</span>
                  {tokens.length > 1 && <span className={laneStyles.keycapMore}>+{tokens.length - 1}</span>}
                </button>
                <span className={laneStyles.textCell}>
                  <span className={`${laneStyles.text} ${label ? '' : laneStyles.textEmpty}`}>{label || t('keymap.bindingLabelPlaceholder', 'Name this action')}</span>
                  {/* Inherited from a template, or overriding one. */}
                  <OriginMarker setting={`${trigger},${command}`} />
                </span>
                <button type="button" className="console-btn console-btn--icon" aria-label={t('keymap.modeshiftSettings', 'Modeshift settings')}
                  onClick={() => setEditing(trigger)} data-hints={`A:Settings;B:${closeLabel}`}>
                  <Icon name="cog" size={18} />
                </button>
              </div>
            )
          })}
        </div>
      )}
      {picking && (
        <ActionPicker inputLabel={`${heldName(picking)} + ${shortName}`} command={commandForValue(command, pickingValue)}
          virtualControllerType={props.virtualControllerType} specialOptions={specialOptions} libraryProfiles={props.libraryProfiles} currentProfileName={props.currentProfileName}
          onEnableVirtualController={props.onEnableVirtualController}
          onSelect={patch => {
            const trigger = picking
            onChange(previous => writeModeshift(previous, trigger, command,
              replaceFirstOutput(readModeshift(previous, trigger, command) ?? '', patch.outputKind ?? 'keyboard', patch.outputValue ?? '')))
          }}
          onClose={() => setPicking(null)} />
      )}
      {editing && triggers.includes(editing) && (
        <ModeshiftSheet {...props} button={button} target={target} trigger={editing} triggers={triggers} shortName={shortName}
          onClose={() => setEditing(null)} onRename={setEditing} />
      )}
    </Lane>
  )
}

/** A shift's cog (3c): held or released, which input, its commands, Remove. */
function ModeshiftSheet({ button, target, trigger, triggers, shortName, onClose, onRename, ...props }: Omit<Props, 'shortName'> & {
  target: ModeshiftTarget
  trigger: string
  triggers: string[]
  shortName: string
  onClose: () => void
  /** The shift's key changed (another input, or held ↔ released). */
  onRename: (trigger: string) => void
}) {
  const { t } = useTranslation()
  const { onChange, modifiers, controllerFamily = 'generic' } = props
  const released = isReleasedInput(trigger)
  const held = inputDisplayName(heldInput(trigger), controllerFamily)
  const choices = modifiers.filter(option => !option.disabled && option.value !== button.command.toUpperCase() &&
    (option.value === heldInput(trigger) || !triggers.includes(withRelease(option.value, released))))
  const rename = (next: string) => { onChange(previous => renameModeshift(previous, target, trigger, next)); onRename(next) }
  return (
    <Sheet open onClose={onClose} width={760}
      eyebrow={t('keymap.modeshiftEyebrow', 'Modeshift · {{input}}', { input: shortName })}
      title={released ? t('keymap.modeshiftWhileReleased', 'While {{trigger}} is released', { trigger: held }) : t('keymap.modeshiftWhileHeld', 'While {{trigger}} is held', { trigger: held })}
      hints={[{ button: 'A', label: t('keymap.sheetSelect', 'Select') }, { button: 'B', label: t('keymap.sheetClose', 'Close') }]}>
      <div className={sheetStyles.sheet} data-capture-ignore="true">
        <label className={sheetStyles.field}>
          <span>{t('keymap.modeshiftHeldButton', 'Held button')}</span>
          <AppSelect aria-label={t('keymap.modeshiftHeldButton', 'Held button')} value={heldInput(trigger)} onChange={event => rename(withRelease(event.target.value, released))}>
            {choices.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </AppSelect>
        </label>
        <div className={sheetStyles.field}>
          <span>{t('keymap.modeshiftAppliesWhile', 'Applies while it is')}</span>
          <ReleaseSwitch released={released} ariaLabel={`${held}: held or released`}
            disabled={triggers.includes(withRelease(trigger, !released))}
            onChange={next => rename(withRelease(trigger, next))} />
        </div>
        <div className={sheetStyles.field}>
          <span>{t('keymap.modeshiftCommands', 'Commands while held')}</span>
          <ShiftedBinding {...props} target={target} trigger={trigger} button={button} embedded />
        </div>
        <div className={sheetStyles.actions}>
          <button type="button" className="console-btn console-btn--danger" data-hints="A:Remove modeshift;B:Close"
            onClick={() => { onChange(previous => removeModeshift(previous, target, trigger)); onClose() }}>
            <Icon name="remove" size={18} />{t('keymap.removeModeshift', 'Remove modeshift')}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
