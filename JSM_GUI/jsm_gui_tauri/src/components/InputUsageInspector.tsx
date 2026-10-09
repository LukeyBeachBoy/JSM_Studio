import { useContext, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from './ui/Sheet'
import { Icon } from './icons/Icon'
import { InputGlyph } from './glyphs/InputGlyph'
import { LayerTile, TriggerCap } from './keymap/ConceptTiles'
import { LayerUsageContext } from './LayerBar'
import { SettingOrigins } from './SettingOrigin'
import { inputDisplayName } from '../keymap/inputNames'
import { actionsOnInput, inputDefinitions, layerEntries, readLayerActions, readableSetting, type ConfigLayer } from '../utils/layers'
import { describeBinding } from '../utils/bindingDescription'
import { describeShiftedInput, shiftedInputGlyph, shiftedInputName, shiftedInputOf, shiftedInputTarget } from '../utils/shiftedInputs'
import { controllerButtonLabel, type ControllerVisualFamily } from '../utils/controllerStatus'
import styles from './InputUsageInspector.module.css'

// Where an input is used (Overview's X, or a relation tile under a callout):
// what holding it changes, what it becomes while something else is held, the
// chords it is in, the layers it drives and the settings that listen to it.
// Rows read like the binding card's (binding card refresh §3): the held
// input's cap, "+", the input it changes, then what it becomes. One row per
// input, not per config key -- a shift that rebuilds the right pad as a 2x2
// menu is one Right trackpad row, not its grid size, mode and 25 cells.

type Row = {
  key: string
  chain: ReactNode
  title: string
  detail?: string
  onOpen: () => void
}
type Section = { title: string; rows: Row[] }

const valueOf = (raw: string) => raw.split('#')[0].trim()
// Settings that listen to an input: GYRO_ON = MISC5, the trigger mode.
const LISTENS = /^(GYRO_ON|GYRO_OFF|[A-Z_]+_(ON|OFF|BUTTON|TRIGGER))$/

function sections(text: string, command: string, layers: ConfigLayer[], family: ControllerVisualFamily,
  describe: (value: string) => string, go: (target: string) => void, selectLayer?: (id: string) => void): Section[] {
  const name = (input: string) => inputDisplayName(input, family)
  const cap = (input: string) => <TriggerCap label={name(input)} size="md" />
  const plus = <span className={styles.plus} aria-hidden="true">+</span>
  const glyph = (input: string) => <InputGlyph command={input} family={family} size={28} />
  const entries = Object.entries(layerEntries(text)).filter(([key]) => !key.startsWith('#'))

  // What holding (or releasing) it changes, grouped by the input changed.
  const held = new Map<string, Map<string, [string, string][]>>()
  const shiftedBy = new Map<string, string>()
  const chords: Row[] = []
  const settings: Row[] = []
  for (const [key, raw] of entries) {
    const parts = key.split(',')
    if (parts.length > 1) {
      const trigger = parts[0], target = parts.slice(1).join(',')
      if (trigger.replace(/^!/, '') === command) {
        const input = shiftedInputOf(target)
        const byInput = held.get(trigger) ?? new Map<string, [string, string][]>()
        byInput.set(input, [...(byInput.get(input) ?? []), [target, raw]])
        held.set(trigger, byInput)
      }
      if (target === command) shiftedBy.set(trigger, raw)
    }
    if (key.length > 1 && !key.includes(',') && key.includes('+') && key.split('+').includes(command)) {
      const members = key.split('+')
      chords.push({
        key: `chord:${key}`,
        chain: <>{members.map((member, index) => <span key={member} className={styles.chainPart}>{index > 0 && plus}{glyph(member)}</span>)}</>,
        title: members.map(name).join(' + '),
        detail: describe(valueOf(raw)),
        onOpen: () => go(command),
      })
    }
    const setting = parts[parts.length - 1]
    if (LISTENS.test(setting) && valueOf(raw).split(/\s+/).includes(command)) {
      settings.push({
        key: `setting:${key}`,
        chain: <span className={styles.settingIcon}><Icon name="cog" size={18} /></span>,
        title: readableSetting(setting),
        detail: parts.length > 1 ? `While ${name(parts[0])} is held` : undefined,
        onOpen: () => go(setting),
      })
    }
    if (key === `${command}_MODE` && /^X_[LR]T$/.test(valueOf(raw))) {
      settings.push({ key: `analog:${key}`, chain: <span className={styles.settingIcon}><Icon name="cog" size={18} /></span>, title: 'Analog trigger', detail: 'Sent to the virtual Xbox controller', onOpen: () => go(command) })
    }
  }

  const heldRows = (trigger: string) => [...(held.get(trigger) ?? new Map()).entries()].map(([input, changes]): Row => ({
    key: `shift:${trigger}:${input}`,
    chain: <>{cap(trigger)}{plus}{glyph(shiftedInputGlyph(input))}</>,
    title: shiftedInputName(input, family),
    detail: describeShiftedInput(input, changes, describe),
    onOpen: () => go(shiftedInputTarget(input)),
  }))
  const layerRows = actionsOnInput(readLayerActions(text, layers), command).map((action, index): Row => ({
    key: `layer:${action.layerId}:${index}`,
    chain: <LayerTile layerId={action.layerId} verb={action.verb} size="md" />,
    title: '',
    detail: action.input.startsWith('!') ? `When ${name(command)} is let go` : undefined,
    onOpen: () => selectLayer?.(action.layerId),
  }))

  return [
    { title: `While ${name(command)} is held`, rows: heldRows(command) },
    { title: `While ${name(command)} is released`, rows: heldRows(`!${command}`) },
    {
      title: 'Changed while another input is held',
      rows: [...shiftedBy].map(([trigger, raw]): Row => ({
        key: `by:${trigger}`,
        chain: <>{cap(trigger.replace(/^!/, ''))}{plus}{glyph(command)}</>,
        title: `${name(trigger.replace(/^!/, ''))}${trigger.startsWith('!') ? ' released' : ' held'}`,
        detail: describe(valueOf(raw)),
        onOpen: () => go(command),
      })),
    },
    { title: 'Pressed together', rows: chords },
    { title: 'Layers', rows: layerRows },
    { title: 'Settings that listen to it', rows: settings },
  ].filter(section => section.rows.length)
}

export function InputUsageInspector() {
  const { t } = useTranslation()
  const { text, layers, onNavigate, onSelect, family = 'generic' } = useContext(LayerUsageContext)
  const config = useContext(SettingOrigins).config
  const [command, setCommand] = useState<string | null>(null)
  useEffect(() => {
    const open = (event: Event) => setCommand((event as CustomEvent<string>).detail)
    window.addEventListener('jsm:input-uses', open)
    return () => window.removeEventListener('jsm:input-uses', open)
  }, [])
  const close = () => setCommand(null)
  const describe = (value: string) => describeBinding(value, t)
  const go = (target: string) => { close(); onNavigate?.(target) }
  // The full name in the title ("D-Pad Left"); rows use the short one on caps.
  const definition = command ? inputDefinitions.find(button => button.command === command.toUpperCase()) : undefined
  // The D-pad's directions are named "Left" in the schema; the card around
  // them says D-pad, which a title on its own does not have.
  const label = definition ? controllerButtonLabel(definition, family) : command ? inputDisplayName(command, family) : ''
  const name = command && /^(UP|DOWN|LEFT|RIGHT)$/.test(command) && !/d-pad/i.test(label) ? `D-Pad ${label}` : label
  const own = command ? sections(text, command, layers, family, describe, go, id => { close(); onSelect?.(id) }) : []
  // The same, inside each layer that changes it.
  const inLayers = command ? layers.map(layer => ({
    layer,
    sections: sections(Object.entries(layer.overrides).map(([key, value]) => `${key} = ${value}`).join('\n'), command, [], family, describe,
      target => { close(); onSelect?.(layer.id); onNavigate?.(target) }),
  })).filter(entry => entry.sections.length) : []

  const renderRow = (row: Row) => (
    <button key={row.key} type="button" className={styles.row} onClick={row.onOpen} data-hints="A:Open;B:Close">
      <span className={styles.chain}>{row.chain}</span>
      <span className={styles.text}>
        {row.title && <span className={styles.title}>{row.title}</span>}
        {row.detail && <span className={styles.detail}>{row.detail}</span>}
      </span>
      <Icon name="chevronRight" size={18} className={styles.chevron} />
    </button>
  )
  const renderSection = (section: Section, prefix = '') => (
    <div key={prefix + section.title} className="row-group">
      <div className="row-group__title"><span className="eyebrow">{section.title}</span></div>
      <div className="row-group__rows">{section.rows.map(renderRow)}</div>
    </div>
  )

  return (
    <Sheet open={command !== null} onClose={close} width={560} eyebrow={`Layout · ${config ?? 'Configuration'}`}
      title={t('overview.usesTitle', 'Where {{name}} is used', { name })}
      description={t('overview.usesDescription', 'What holding it changes, and what it takes part in. Select a row to edit it.')}
      hints={[{ button: 'A', label: 'Open' }, { button: 'B', label: 'Close' }]}>
      {own.map(section => renderSection(section))}
      {inLayers.map(entry => entry.sections.map(section => renderSection({ ...section, title: `${entry.layer.name} layer · ${section.title}` }, entry.layer.id)))}
      {!own.length && !inLayers.length && <p className={styles.empty}>{t('overview.usesNone', 'Nothing else depends on {{name}}: no chords, mode shifts, presses together, layers or settings.', { name })}</p>}
    </Sheet>
  )
}
