import { useContext, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActionPickerProps } from '../ActionPicker'
import { PickerPage, PickerSection, useRefocusOn } from './PickerPage'
import { usePickerWords } from './pickerShared'
import { SegmentedRow } from '../../ui/console'
import { LayerUsageContext } from '../../LayerBar'
import { actionsOnInput, layerHue, layerSlot, layerVerbKeys, layerVerbOrder, sameLayerAction, visibleOverrideKeys, type LayerAction, type LayerVerb } from '../../../utils/layers'
import styles from './Pickers.module.css'

// Switch mode · mode, then how (console v2, PickerFamily). The configuration's
// modes as tiles in their colours; "When A is pressed" Hold · Toggle · Turn on ·
// Turn off; "Happens on" Press · Let go. A uses the focused mode with both.
// The same picker edits a mode switch that is already there (Y removes it) and
// adds a new one.

export function ModePicker(props: ActionPickerProps & { onSearch?: () => void }) {
  const { inputLabel, command, onSelect, onClose, onAddLayerAction, onSearch } = props
  const { t } = useTranslation()
  const words = usePickerWords(inputLabel, command)
  const { layers, actions, onSetActions } = useContext(LayerUsageContext)
  const existing: LayerAction | null = command.source.kind === 'layerAction' ? command.source.action : null
  const base = command.physicalInput.replace(/^!/, '')
  const [verb, setVerb] = useState<LayerVerb>(existing?.verb ?? 'hold')
  const [onRelease, setOnRelease] = useState(Boolean(existing?.input.startsWith('!')))
  const tiles = useRef<HTMLDivElement>(null)
  useRefocusOn(tiles, 'modes', ['[data-current="true"]', 'button'])
  const verbLabel = (value: LayerVerb) => t(layerVerbKeys[value], value)
  const canWrite = Boolean(existing || onAddLayerAction || onSetActions)

  const choose = (layerId: string) => {
    const input = onRelease ? `!${base}` : base
    if (existing) {
      onSelect({ layerAction: { layerId, verb, input } })
    } else if (onSetActions && (verb !== 'hold' || onRelease || !onAddLayerAction)) {
      // The same writer the card's add uses, with the verb and "Happens on"
      // chosen here (a caller's onAddLayerAction may only know Hold on press).
      const mine = actionsOnInput(actions, base).filter(action => !(action.layerId === layerId && action.input === input))
      onSetActions(base, [...mine, { input, verb, layerId }])
    } else if (onAddLayerAction) {
      onAddLayerAction(layerId, verb, onRelease)
    }
    onClose()
  }
  const remove = existing && onSetActions ? () => {
    onSetActions(base, actionsOnInput(actions, base).filter(action => !sameLayerAction(action, existing)))
    onClose()
  } : undefined
  const describe = (released: boolean) => t(`keymap.layerDesc${verb === 'hold' ? 'Hold' : verb === 'toggle' ? 'Toggle' : verb === 'apply' ? 'Apply' : 'Remove'}${released ? 'Released' : ''}`, { input: words.input, defaultValue: '' })

  return (
    <PickerPage kind="mode" onClose={onClose} input={command.physicalInput} eyebrow={words.eyebrow} title={t('pickers.modeTitle', 'Switch layer')}
      where={words.where(t('pickers.modeTitle', 'Switch layer'))}
      hints={[...(remove ? [{ button: 'Y' as const, label: t('pickers.remove', 'Remove') }] : onSearch ? [{ button: 'Y' as const, label: t('pickers.search', 'Search') }] : [])]}
      onPad={button => {
        if (button === 'Y' && remove) { remove(); return true }
        if (button === 'Y' && onSearch) { onSearch(); return true }
        return false
      }}>
      <div className={styles.main} style={{ maxWidth: 900 }}>
        <PickerSection label={t('pickers.modeWhich', 'Which mode')} caption={layers.length ? t('pickers.modeCaption', 'A mode changes a few buttons while it’s on') : undefined}>
          <div ref={tiles} className={styles.grid} style={{ ['--cols' as string]: 3 }}>
            {layers.map(layer => {
              const isCurrent = existing?.layerId === layer.id
              const changes = visibleOverrideKeys(layer.overrides).length
              return (
                <button key={layer.id} type="button" className={`${styles.tile} ${styles.plainTile}`} data-layer={layer.id}
                  style={{ ['--mode-hue' as string]: layerHue(layerSlot(layers, layer.id)) }}
                  data-current={isCurrent ? 'true' : undefined} aria-pressed={isCurrent}
                  aria-disabled={canWrite ? undefined : 'true'} data-reason={canWrite ? undefined : t('pickers.modeCannot', 'A mode switch is added from the binding sheet')}
                  data-caption={`${verbLabel(verb)} ${layer.name} · ${describe(onRelease) || ''}`}
                  data-hints={`A:${t('pickers.useNamed', 'Use {{name}}', { name: `${verbLabel(verb)} ${layer.name}` })}${remove ? `;Y:${t('pickers.remove', 'Remove')}` : ''}`}
                  onClick={() => { if (canWrite) choose(layer.id) }}>
                  <span className={styles.modeSwatch} aria-hidden="true" />
                  {layer.name}
                  <span className={styles.tileSub}>{isCurrent ? t('pickers.current', 'current') : t('pickers.modeChanges', { count: changes, defaultValue: '{{count}} changes' })}</span>
                </button>
              )
            })}
            {layers.length === 0 && (
              <div className={styles.empty} style={{ gridColumn: '1 / -1' }}>
                <h3>{t('pickers.modeNoneTitle', 'No layers yet')}</h3>
                <p>{t('pickers.modeNoneBody', 'A layer swaps a few bindings while it’s on: Vehicles, a map, comms. Make one on the Layers tab, then come back to switch to it from {{input}}.', { input: words.input })}</p>
              </div>
            )}
            <button type="button" className={`${styles.tile} ${styles.plainTile} ${styles.ghostTile}`} data-make-mode
              data-hints={`A:${t('pickers.goToModes', 'Go to Layers')}`}
              onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('jsm:open-page', { detail: 'layers' })) }}>
              {t('pickers.makeMode', '+ Make a layer')}
            </button>
          </div>
        </PickerSection>
        <SegmentedRow label={t('pickers.modeWhen', 'When {{input}} is pressed', { input: words.input })} value={verb} onChange={value => setVerb(value as LayerVerb)}
          data={{ 'data-mode-verb': verb }}
          options={layerVerbOrder.map(value => ({ value, label: verbLabel(value), caption: t(`keymap.layerDesc${value === 'hold' ? 'Hold' : value === 'toggle' ? 'Toggle' : value === 'apply' ? 'Apply' : 'Remove'}`, { input: words.input, defaultValue: '' }) || undefined }))} />
        <SegmentedRow label={t('pickers.happensOn', 'Happens on')} value={onRelease ? 'release' : 'press'} onChange={value => setOnRelease(value === 'release')}
          data={{ 'data-mode-on': onRelease ? 'release' : 'press' }}
          options={[
            { value: 'press', label: t('pickers.activationPress', 'Press'), caption: t('pickers.happensOnPress', 'Press: when {{input}} goes down', { input: words.input }) },
            { value: 'release', label: t('pickers.activationRelease', 'Let go'), caption: t('pickers.happensOnRelease', 'Let go: when {{input}} comes back up', { input: words.input }) },
          ]} />
      </div>
    </PickerPage>
  )
}
