import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppSelect } from '../ui/AppSelect'
import { Icon } from '../icons/Icon'
import { InputGlyph } from '../glyphs/InputGlyph'
import { addModeshift, modeshiftTriggers, removeModeshift, type ModeshiftTarget } from '../../utils/modeshift'
import { getButtonDescription, type ButtonDefinition } from '../../keymap/schema'
import { ShiftedBinding, type InputModeshiftsProps } from './InputModeshifts'
import keymapStyles from '../Keymap.module.css'

type Props = Omit<InputModeshiftsProps, 'target' | 'initiallyOpen' | 'livePad'> & {
  button: ButtonDefinition
  /** The input's short name, for the empty copy: "A modeshift makes RB do…". */
  shortName: string
}

/**
 * The MODESHIFTS section of one input's editor (Binding Editor 7a): what this
 * input does while another input is held. Each shift is a `TRIGGER,INPUT`
 * line, edited with the same card the unshifted input uses. The section has
 * the shape every editor panel has -- title and count, one line of what it
 * is, the list, one add button -- so it and Layer actions read as a pair.
 */
export function InputModeshiftPanel({ button, shortName, ...props }: Props) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const target = useMemo<ModeshiftTarget>(() => ({
    id: button.command,
    title: getButtonDescription(button, t),
    buttons: [{ command: button.command, label: getButtonDescription(button, t), definition: button }],
  }), [button, t])
  const { text, onChange, modifiers } = props
  const triggers = useMemo(() => modeshiftTriggers(text, target), [text, target])
  const available = modifiers.filter(option => !option.disabled && !triggers.includes(option.value) && option.value !== button.command.toUpperCase())
  const labelFor = (trigger: string) => (modifiers.find(option => option.value === trigger)?.label ?? trigger).split(' — ')[0]
  // The example in the empty copy: a paddle if the controller has one, else
  // whatever the first available trigger is.
  const example = available.find(option => /^(LSL|RSR|LSR|RSL)$/.test(option.value)) ?? available[0]

  return (
    <section className={keymapStyles.editorPanel} aria-label={`${target.title} modeshifts`}>
      <div className={keymapStyles.editorPanelHead}>
        <span className={keymapStyles.eyebrowHeading}>{t('keymap.modeshiftsTitle', 'Modeshifts')}</span>
        <span className={keymapStyles.editorPanelCount}>{triggers.length}</span>
      </div>
      <span className={keymapStyles.editorPanelEmpty}>
        {triggers.length
          ? t('keymap.modeshiftsPanelNote', 'What {{input}} does instead while another input is held.', { input: shortName })
          : example
            ? t('keymap.modeshiftsEmpty', 'None. A modeshift makes {{input}} do something else while, say, {{trigger}} is held.', { input: shortName, trigger: labelFor(example.value) })
            : t('keymap.modeshiftsNone', 'None.')}
      </span>
      {triggers.map(trigger => (
        <div key={trigger} className={keymapStyles.modeshiftRow}>
          <div className={keymapStyles.modeshiftRowHead}>
            <InputGlyph command={trigger} family={props.controllerFamily} size={20} />
            <span>{t('keymap.modeshiftWhile', 'While')} <b>{labelFor(trigger)}</b> {t('keymap.modeshiftIsHeld', 'is held')}</span>
            <button type="button" className={`button button--ghost button--sm ${keymapStyles.editorPanelRemove}`} data-hints="A:Remove modeshift;B:Back" onClick={() => onChange(previous => removeModeshift(previous, target, trigger))}>
              {t('keymap.removeModeshift', 'Remove')}
            </button>
          </div>
          <ShiftedBinding {...props} target={target} trigger={trigger} button={button} defaultOpen={trigger === fresh} />
        </div>
      ))}
      {adding ? (
        <div className={keymapStyles.editorPanelAdd}>
          <AppSelect aria-label={t('keymap.modeshiftTrigger', 'Held input')} value="" onChange={event => {
            const trigger = event.target.value
            if (!trigger) return
            setFresh(trigger)
            onChange(previous => addModeshift(previous, target, trigger))
            setAdding(false)
          }}>
            <option value="">{t('keymap.modeshiftChooseTrigger', 'Choose a trigger…')}</option>
            {available.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </AppSelect>
          <button type="button" className="button button--ghost button--sm" onClick={() => setAdding(false)}>{t('common.cancel', 'Cancel')}</button>
        </div>
      ) : (
        <div>
          <button type="button" className={`button button--secondary button--sm ${keymapStyles.editorPanelAddButton}`} disabled={!available.length} data-hints="A:Add modeshift;B:Back" onClick={() => setAdding(true)}>
            <Icon name="add" size={16} />{t('keymap.addModeshiftShort', 'Add modeshift')}
          </button>
        </div>
      )}
    </section>
  )
}
