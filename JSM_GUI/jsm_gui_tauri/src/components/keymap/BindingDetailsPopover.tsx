import { useContext, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LayerUsageContext, useInputUses } from '../LayerBar'
import { actionsOnInput, describeAction, layerHue, layerSlot } from '../../utils/layers'
import { describeBinding } from '../../utils/bindingDescription'
import { useSettingOriginInfo } from './settingOriginInfo'
import { Dialog } from '../ui/Dialog'
import { useShell } from '../../shell/ShellContext'
import { inputDisplayName } from '../../keymap/inputNames'
import { useInputVariant, requestOpenBinding } from './binding/variantScope'
import styles from './binding/binding.module.css'

// Details (console v2, BindingDetails "Where this comes from"): a centred
// modal reached from the row's Y menu. What Press sends; where the input gets
// its action, top wins (a mode → this controller only → this configuration →
// its base → JoyShockMapper's default); what each mode does with it, A opening
// the sheet in that mode; and everything else that leans on it, X showing
// every use (jsm:input-uses). Footer: A Open in <mode> · X Every use · B Close.

type Props = {
  command: string
  /** "A button". */
  title: string
  /** Your name for it ("Jump"). */
  label?: string
  glyph?: ReactNode
  /** What Press sends, in words. */
  summary: string
  modeshiftCount: number
  /** A profile activation on this input (GYRO_OFF = A): read-only here. */
  profileActivation?: string
  onClose: () => void
  /** Kept for callers of the old popover; the modal is centred. */
  anchor?: HTMLElement | null
}

export function BindingDetailsPopover({ command, title, label, glyph, summary, modeshiftCount, profileActivation, onClose }: Props) {
  const { t } = useTranslation()
  const shell = useShell()
  const origin = useSettingOriginInfo(command)
  const uses = useInputUses(command)
  const variant = useInputVariant(command)
  const { actions, layers, onSelect, selected } = useContext(LayerUsageContext)
  const layerActions = actionsOnInput(actions, command).map(action => describeAction(action, layers))
  const [focusedMode, setFocusedMode] = useState<string | null>(null)
  const key = command.toUpperCase()
  const config = shell.configName ?? 'This configuration'
  const short = title.replace(/ button$/, '')

  const modeValue = (overrides: Record<string, string>) => overrides[key] ?? overrides[command]
  const changedModes = layers.filter(layer => modeValue(layer.overrides) !== undefined)
  const baseName = origin?.sourceName && origin.kind !== 'default' && !(selected && origin.sourceName === 'Default') ? origin.sourceName : null
  const ownSet = origin?.kind === 'own' || origin?.kind === 'override'
  const baseValue = origin?.kind === 'inherited' ? summary : origin?.baseValue ? describeBinding(origin.baseValue, t) : null

  // The stack, top wins.
  type Item = { key: string; name: string; sub?: string; value?: string; set: boolean; mode?: string }
  const items: Item[] = [
    ...changedModes.map(layer => ({ key: `mode-${layer.id}`, name: `${layer.name} layer`, sub: describeActivation(layer.id, actions, input => inputDisplayName(input, shell.family)), value: describeBinding(modeValue(layer.overrides)!, t), set: true, mode: layerHue(layerSlot(layers, layer.id)) })),
    ...(variant ? [{ key: 'variant', name: `${variant.label} only`, value: variant.changed && variant.value ? describeBinding(variant.value, t) : undefined, set: variant.changed }] : []),
    { key: 'config', name: config, value: ownSet ? summary || 'Nothing' : undefined, set: ownSet },
    ...(baseName ? [{ key: 'base', name: baseName, value: baseValue ?? undefined, set: Boolean(baseValue) }] : []),
    { key: 'jsm', name: 'JoyShockMapper default', sub: 'Nothing, unless set above', set: true },
  ]
  const used = items.find(item => !item.mode && item.set && item.value !== undefined)?.key ?? 'jsm'

  const openIn = (layerId: string) => {
    onClose()
    onSelect?.(layerId)
    window.setTimeout(() => requestOpenBinding({ command }), 80)
  }
  const everyUse = () => { onClose(); window.dispatchEvent(new CustomEvent('jsm:input-uses', { detail: command })) }
  const focusedName = layers.find(layer => layer.id === focusedMode)?.name

  const alsoParts = [
    modeshiftCount ? `${modeshiftCount} chord${modeshiftCount === 1 ? '' : 's'}` : 'no chords',
    layerActions.length ? layerActions.join(' · ') : 'no layer switches',
    uses.length ? `${uses.length} other use${uses.length === 1 ? '' : 's'}` : 'no other button leans on it',
  ]
  const nothingElse = !modeshiftCount && !layerActions.length && !uses.length

  return (
    <Dialog onClose={onClose} width={1120} eyebrow={`${title}${label ? ` · ${label}` : ''}`} title={t('bind.details', 'Details')}
      lead={glyph ? <span className={styles.headGlyph} aria-hidden="true">{glyph}</span> : undefined}
      aside={<span className={styles.sendsTag}>{t('bind.pressSends', 'Press sends')}<b>{summary || 'Nothing'}</b></span>}
      footerNote={`${config} · ${title} · Details`}
      hints={[...(focusedName ? [{ button: 'A' as const, label: `Open in ${focusedName}` }] : []), { button: 'X', label: 'Every use' }, { button: 'B', label: 'Close' }]}
      onPad={button => { if (button === 'X') { everyUse(); return true } return false }}
      onKeyDown={event => { if ((event.key === 'x' || event.key === 'X') && !event.defaultPrevented) { event.preventDefault(); everyUse() } }}>
      <div className={styles.details} aria-label={`Details for ${title}`}>
        <section className={styles.stack} aria-label={`Where ${short} gets its action`}>
          <div className={styles.stackHead}><span>Where {short} gets its action</span><span>Top wins</span></div>
          {items.map(item => (
            <div key={item.key} className={styles.stackItem} data-set={item.set ? 'true' : undefined} data-used={item.key === used ? 'true' : undefined}
              data-mode={item.mode ? 'true' : undefined} style={item.mode ? { ['--mode-hue' as string]: item.mode } as CSSProperties : undefined}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <b>{item.name}</b>
                <span>{item.key === used ? 'used now' : item.sub ?? (item.value === undefined ? 'not set' : '')}</span>
              </span>
              {item.value !== undefined && <span className={styles.stackValue}>{item.value}</span>}
            </div>
          ))}
        </section>
        <div className={styles.detailsCol}>
          <p className={styles.eyebrowLabel}>Where it comes from</p>
          <div className={styles.detailRow}>
            <span />
            <span className={styles.detailRowText}>
              {baseName && !ownSet
                ? <><b>From the {baseName} base</b><span>{config} uses the base’s {summary || 'value'}. Change it here and {config} keeps its own.</span></>
                : ownSet
                  ? <><b>Set in {selected ? `${selected.name} layer` : config}</b><span>{origin?.baseValue ? `Overrides ${origin.sourceName ?? 'the base'} (${describeBinding(origin.baseValue, t)}).` : 'This configuration’s own.'}</span></>
                  : <><b>Not set</b><span>JoyShockMapper uses its own default.</span></>}
            </span>
            <span className={styles.tag} data-tone={ownSet ? 'accent' : undefined}>{baseName && !ownSet ? 'Base' : ownSet ? 'Own' : 'Default'}</span>
          </div>
          {variant && (
            <div className={styles.detailRow}>
              <span />
              <span className={styles.detailRowText}>
                <b>{variant.label} layout</b>
                <span>{variant.changed ? `Changed for this controller only · other controllers use the shared layout` : 'Shared with every controller · nothing changed for this one'}</span>
              </span>
              <span className={styles.tag} data-tone={variant.changed ? 'accent' : undefined}>{variant.changed ? 'Only here' : 'Shared'}</span>
            </div>
          )}
          {profileActivation && (
            <div className={styles.detailRow}>
              <span />
              <span className={styles.detailRowText}>
                <b>Also {profileActivation}</b>
                <span>A gyro on/off setting that names this button. Change it on the Gyro page.</span>
              </span>
              <span className={styles.tag}>Gyro page</span>
            </div>
          )}

          {layers.length > 0 && <p className={styles.eyebrowLabel}>In each layer</p>}
          {layers.map((layer, index) => {
            const value = modeValue(layer.overrides)
            const hue = layerHue(layerSlot(layers, layer.id))
            return (
              <button key={layer.id} type="button" className={styles.detailRow} data-autofocus={index === 0 ? '' : undefined} data-mode-row={layer.id}
                style={{ ['--mode-hue' as string]: hue } as CSSProperties}
                data-hints={`A:Open in ${layer.name};X:Every use;B:Close`} data-caption={`${layer.name} · ${value !== undefined ? `changed: ${describeBinding(value, t)}` : 'same as Default'}`}
                onFocus={() => setFocusedMode(layer.id)} onBlur={() => setFocusedMode(current => current === layer.id ? null : current)}
                onClick={() => openIn(layer.id)}>
                <span className={styles.swatch} aria-hidden="true" />
                <span className={styles.detailRowText}>
                  <b>{layer.name} layer</b>
                  <span>{value !== undefined ? `Changed here · ${describeBinding(value, t)}` : 'Same as Default'} · on {describeActivation(layer.id, actions, input => inputDisplayName(input, shell.family))}</span>
                </span>
                <span className={styles.tag} data-tone={value !== undefined ? 'mode' : undefined}>{value !== undefined ? `Changed · ${describeBinding(value, t)}` : 'Same as Default'}</span>
              </button>
            )
          })}

          <p className={styles.eyebrowLabel}>Also on {short}</p>
          <button type="button" className={styles.detailRow} data-autofocus={layers.length ? undefined : ''} data-hints="A:Every use;X:Every use;B:Close"
            data-caption={uses.length ? uses.join(' · ') : 'Nothing else uses it'} onClick={everyUse}>
            <span />
            <span className={styles.detailRowText}>
              <b>{nothingElse ? `Nothing else uses ${short}` : `What else uses ${short}`}</b>
              <span>{alsoParts.join(' · ')}{uses.length ? ` (${uses.join('; ')})` : ''}</span>
            </span>
            <span className={styles.quiet} style={{ fontSize: 'var(--fs-hint)' }}>Every use ▸</span>
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function describeActivation(layerId: string, actions: { input: string; verb: string; layerId: string }[], name: (input: string) => string) {
  const action = actions.find(item => item.layerId === layerId)
  if (!action) return 'nothing turns it on'
  const input = name(action.input.replace(/^!/, ''))
  return action.verb === 'hold' ? `while ${input} is held` : action.verb === 'toggle' ? `${input} toggles it` : action.verb === 'apply' ? `${input} turns it on` : `${input} turns it off`
}
