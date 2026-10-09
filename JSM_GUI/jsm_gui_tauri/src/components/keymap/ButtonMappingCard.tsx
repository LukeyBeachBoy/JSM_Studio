import { useContext, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import keymapStyles from '../Keymap.module.css'
import { LayerUsageContext } from '../LayerBar'
import { layerHue, layerSlot } from '../../utils/layers'
import { Icon } from '../icons/Icon'
import { Menu, type MenuItem } from '../ui/Menu'
import { OriginMarker } from './OriginMarker'
import { useSettingOriginInfo } from './settingOriginInfo'
import { BindingDetailsPopover } from './BindingDetailsPopover'
import { describeBinding } from '../../utils/bindingDescription'
import { inputDisplayName } from '../../keymap/inputNames'
import type { ModeshiftSummary } from '../../utils/modeshift'
import { heldInput, isReleasedInput } from '../../utils/released'
import { Sheet } from '../ui/Sheet'
import { useShell } from '../../shell/ShellContext'
import { BindingSheetBody, renameInput } from './binding/BindingSheet'
import { activationLabel, type ActivationRef, type BindingApi } from './binding/model'
import { useInputVariant, OPEN_BINDING_EVENT, type OpenBindingDetail } from './binding/variantScope'
import styles from './binding/binding.module.css'

/** One binding as the row shows it: how it fires, and what it sends. */
export type BindingSummaryEntry = {
  trigger?: string
  /** How it is pressed ("regular", "hold"…). */
  kind?: string
  output: string
  /** The binding spelled out, for the focus caption. */
  outputTitle?: string
  /** A JoyShockMapper setting rather than a key. */
  jsm?: boolean
}

type ButtonMappingCardProps = {
  api: BindingApi
  summary: BindingSummaryEntry[]
  /** The shifts that reconfigure this input (While holding…). */
  shifts?: ModeshiftSummary[]
  /** The row's name where the block around it already names the input ("Soft pull"). */
  rowTitle?: string
  rowSubtitle?: string
  isCapturing: boolean
  /** Just the sheet's body, for a card drawn inside another page (a While holding change). */
  embedded?: boolean
  defaultOpen?: boolean
}

const NO_SHIFTS: ModeshiftSummary[] = []

const isTextEntry = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  return Boolean(element && element.matches('input, textarea, select, [contenteditable="true"]'))
}

/**
 * One input on the Buttons list (console v2, ButtonList: "one stop per row"):
 * the input on the left; on the right your name for what it does and the key
 * it sends, "Not set", or "■ <mode> only". The focused row says more without
 * opening: its other activations, what each mode changes, and whether it is
 * this controller's own. A opens the binding sheet; X opens it at Hold; Y is
 * the menu of the rest (Copy · Paste · Clear · Rename · Details · Reset).
 */
export function ButtonMappingCard({ api, summary, shifts = NO_SHIFTS, rowTitle, rowSubtitle, isCapturing, embedded, defaultOpen }: ButtonMappingCardProps) {
  const { t } = useTranslation()
  const shell = useShell()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(Boolean(defaultOpen))
  const [initial, setInitial] = useState<ActivationRef | undefined>(undefined)
  const [focused, setFocused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [details, setDetails] = useState(false)
  const { layers, selected: mode } = useContext(LayerUsageContext)
  const command = api.command
  const origin = useSettingOriginInfo(command)
  const variant = useInputVariant(api.shifted ? undefined : api.button.command)

  useEffect(() => {
    if (defaultOpen && detailsRef.current) detailsRef.current.open = true
  }, [command, defaultOpen])

  const openAt = (activation?: ActivationRef) => {
    setInitial(activation)
    if (detailsRef.current) detailsRef.current.open = true
  }
  // Y on a row elsewhere (Layout's quick menu) asks for Details; Details'
  // "Open in <mode>" and Layout ask for the sheet.
  useEffect(() => {
    const element = detailsRef.current
    if (!element) return
    const request = (event: Event) => { event.stopPropagation(); setDetails(true) }
    element.addEventListener('jsm:binding-details', request)
    const openRequest = (event: Event) => {
      const detail = (event as CustomEvent<OpenBindingDetail>).detail
      if (detail?.command?.toUpperCase() !== command.toUpperCase()) return
      openAt(detail.activation ? { kind: detail.activation as ActivationRef['kind'] } : undefined)
      summaryRef.current?.scrollIntoView({ block: 'center' })
    }
    window.addEventListener(OPEN_BINDING_EVENT, openRequest)
    return () => { element.removeEventListener('jsm:binding-details', request); window.removeEventListener(OPEN_BINDING_EVENT, openRequest) }
  }, [command])

  if (embedded) return <div data-input-command={command}><BindingSheetBody api={api} embedded /></div>

  const inputKey = api.button.command.toUpperCase()
  const entries = summary
  const unbound = entries.length === 0
  const primary = entries.find(entry => entry.kind === 'regular') ?? entries[0]
  const name = rowTitle ?? api.longName
  // The row's subtitle explains the row; it is never its label or the sheet's
  // title -- a sentence there was too long for the row and said nothing about
  // what the sheet is for.
  const label = api.label
  const modeChanges = layers.map(layer => ({ layer, value: layer.overrides[inputKey] })).filter(item => item.value !== undefined)
  const modeOnly = unbound && !mode && modeChanges[0]
  const hueOf = (layerId: string) => layerHue(layerSlot(layers, layerId))

  // The focused row's preview (ButtonList): Hold · not set, Double-tap · not
  // set, the other set activations, While holding, and each mode's change.
  const preview = (() => {
    const items: { key: string; text: string; value?: string; hue?: string }[] = []
    for (const kind of ['hold', 'double'] as const) {
      const set = entries.filter(entry => entry.kind === kind)
      items.push({ key: kind, text: activationLabel(kind, t), value: set.length ? set.map(entry => entry.output).join(' + ') : undefined })
    }
    entries.filter(entry => entry !== primary && entry.kind !== 'hold' && entry.kind !== 'double')
      .forEach((entry, index) => items.push({ key: `e${index}`, text: entry.trigger ?? '', value: entry.output }))
    shifts.slice(0, 2).forEach(shift => items.push({
      key: `s-${shift.trigger}`, text: `With ${inputDisplayName(heldInput(shift.trigger), api.family)} ${isReleasedInput(shift.trigger) ? 'let go' : 'held'}`,
      value: describeBinding(shift.value, t) || t('keymap.rowNone', 'None'),
    }))
    if (shifts.length > 2) items.push({ key: 's-more', text: `+${shifts.length - 2} more chords` })
    modeChanges.forEach(({ layer, value }) => items.push({ key: `m-${layer.id}`, text: `${layer.name} layer`, value: describeBinding(value!, t), hue: hueOf(layer.id) }))
    return items
  })()
  // The origin dot's words, on the focused row (UX review 2026-10-09: the dot alone was undiscoverable).
  const scopeLine = variant?.changed
    ? `Only for ${variant.label}. Other controllers use the shared layout.`
    : origin?.kind === 'inherited' && origin.sourceName ? `From the ${origin.sourceName} base. Change it here and this configuration keeps its own.`
    : origin?.kind === 'override' ? `${origin.shown}${origin.baseValue ? ` · ${origin.sourceName ?? 'the base'} has ${describeBinding(origin.baseValue, t)}` : ''}` : null

  const copyable = api.commands.filter(item => item.source.kind === 'row' || item.source.kind === 'special')
  const clearable = api.commands.filter(item => item.triggerKind !== 'chord')
  const rename = () => renameInput(api, t, shell.configName ?? undefined)
  const menuItems: MenuItem[] = [
    { label: t('keymap.copy', 'Copy'), description: copyable.length ? `Everything ${api.shortName} sends` : undefined, icon: <Icon name="copy" size={16} />, disabled: !api.copy || !copyable.length, onSelect: () => api.copy?.(copyable) },
    { label: api.canPaste ? api.pasteLabel : t('keymap.paste', 'Paste'), description: !api.paste ? 'Not here' : !api.canPaste ? 'Nothing copied yet' : undefined, icon: <Icon name="paste" size={16} />, disabled: !api.canPaste || !api.paste, onSelect: () => api.paste?.() },
    { label: t('bind.clear', 'Clear'), description: clearable.length ? `Remove what ${api.shortName} sends` : undefined, icon: <Icon name="remove" size={16} />, disabled: !clearable.length, onSelect: () => api.clear(clearable) },
    { label: t('bind.rename', 'Rename'), icon: <Icon name="details" size={16} />, disabled: !api.onRename, onSelect: rename },
    { kind: 'separator' },
    { label: t('bind.details', 'Details'), description: 'Where it comes from, each layer, every use', icon: <Icon name="info" size={16} />, onSelect: () => setDetails(true) },
    ...(origin?.canReset && origin.reset ? [{ label: variant?.changed ? 'Use shared layout' : origin.resetLabel === 'Use Default' ? 'Use Default layer’s' : 'Reset to inherited', icon: <Icon name="inherited" size={16} />, disabled: origin.disabled, onSelect: () => origin.reset?.() }] : []),
  ]

  const onSummaryKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || isTextEntry(event.target) || event.target !== event.currentTarget) return
    if (event.key === 'x' || event.key === 'X') {
      event.preventDefault()
      if (api.xAction) api.xAction.run()
      else openAt({ kind: 'hold' })
      return
    }
    if (event.key === 'y' || event.key === 'Y') { event.preventDefault(); setMenuOpen(true) }
  }
  const xLabel = api.xAction?.label ?? 'Hold & double-tap'
  const hints = `A:Change;X:${xLabel};Y:Copy · clear · name;B:Back`
  const caption = `${name}${rowSubtitle ? ` · ${rowSubtitle}` : ''} · ${unbound ? (modeOnly ? `${modeOnly.layer.name} only` : 'not set') : entries.map(entry => `${entry.trigger && entry.kind !== 'regular' ? `${entry.trigger} ` : ''}${entry.output}`).join(', ')}`
  const description = <span className="binding-summary-input"><OriginMarker setting={command} detail={origin?.kind === 'override' && origin.baseValue ? `base: ${describeBinding(origin.baseValue, t)}` : undefined} addressable withReset /></span>

  return (
    <details ref={detailsRef} onToggle={event => {
      const element = event.currentTarget
      setOpen(element.open)
      if (element.open) {
        // Into the sheet once it is there. Its body can arrive a few frames after the
        // row opens (a lazy chunk, a slow frame), and one try missed it now and then,
        // leaving the pad on the row behind the sheet; keep trying for about a second,
        // and stop the moment focus is inside it or has been moved on purpose.
        let tries = 0
        const enter = () => {
          if (!element.open || element.querySelector('.sheet')?.contains(document.activeElement)) return
          if (document.activeElement !== summaryRef.current && document.activeElement !== document.body) return
          const first = element.querySelector<HTMLElement>('.sheet [data-autofocus]') ?? element.querySelector<HTMLElement>('.sheet .sheet__body button')
          if (first) first.focus({ preventScroll: true })
          if (!first || document.activeElement !== first) { if (tries++ < 60) requestAnimationFrame(enter) }
        }
        requestAnimationFrame(enter)
        element.parentElement?.closest('.main-pane, body')?.querySelectorAll<HTMLDetailsElement>('details[data-input-command][open]').forEach(other => { if (other !== element && !other.contains(element) && !element.contains(other)) other.open = false })
      } else {
        setInitial(undefined)
        // Opened from Layout: App goes back there with the callout focused (L4).
        window.dispatchEvent(new CustomEvent('jsm:binding-closed', { detail: api.button.command }))
      }
      window.dispatchEvent(new Event('jsm:interaction-hint'))
    }} data-input-command={command} data-card={open ? 'true' : undefined} tabIndex={-1}
      className={`${keymapStyles.keymapRow} ${isCapturing ? keymapStyles.keymapRowCapturing : ''}`}>
      <summary ref={summaryRef} className={styles.row} data-expanded={focused ? 'true' : undefined} data-hints={hints} data-pad-keys="XY"
        data-caption={caption} onKeyDown={onSummaryKey}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
        <span className={styles.rowGlyph} aria-hidden="true">{api.menuItem?.icon ?? api.glyph}</span>
        <span className={styles.rowName}><span className="binding-summary-label">{name}</span><OriginMarker setting={command} compact /></span>
        <span className={styles.rowRight}>
          {modeOnly ? (
            <>
              <span className={styles.rowLabel}>{label || describeBinding(modeOnly.value!, t)}</span>
              <span className={styles.modeOnly} style={{ ['--mode-hue' as string]: hueOf(modeOnly.layer.id) } as CSSProperties}>
                <span className={styles.swatch} aria-hidden="true" />{modeOnly.layer.name} only
              </span>
            </>
          ) : unbound ? (
            <span className={styles.rowNone}>{api.emptyLabel ?? t('keymap.rowNotSet', 'Not set')}</span>
          ) : (
            <>
              {label && <span className={styles.rowLabel}>{label}</span>}
              {label
                ? <span className={styles.rowKey} data-row-output="">{primary.output}</span>
                : <span className={styles.rowLabel} data-row-output="">{primary.kind && primary.kind !== 'regular' ? `${primary.trigger} · ` : ''}{primary.output}</span>}
              {entries.length > 1 && <span className={styles.rowMore}>+{entries.length - 1}</span>}
            </>
          )}
        </span>
        {focused && (
          <span className={styles.preview}>
            <span className={styles.previewLine}>
              {preview.map(item => (
                <span key={item.key} className={styles.previewItem} style={item.hue ? { ['--mode-hue' as string]: item.hue } as CSSProperties : undefined}>
                  {item.hue && <span className={styles.swatch} aria-hidden="true" />}
                  {item.text}{item.value ? <>: {item.value}</> : <small> · not set</small>}
                </span>
              ))}
            </span>
            {scopeLine && <span className={styles.scopeLine}>{scopeLine}</span>}
          </span>
        )}
        <Menu open={menuOpen} onOpenChange={next => { setMenuOpen(next); if (!next) requestAnimationFrame(() => { if (!document.activeElement || document.activeElement === document.body || document.activeElement.closest('[data-menu-anchor]')) summaryRef.current?.focus() }) }} items={menuItems} align="end" ariaLabel={`${name} · Copy, clear, name`}
          returnFocusTo={() => summaryRef.current}
          trigger={<button type="button" tabIndex={-1} aria-hidden="true" data-nav-skip className={styles.menuAnchor} data-menu-anchor="" onFocus={() => { if (!menuOpen) summaryRef.current?.focus() }} />} />
      </summary>
      <Sheet inPlace open={open} width={700}
        onClose={() => { if (detailsRef.current) detailsRef.current.open = false }}
        lead={api.menuItem?.icon ?? api.glyph}
        eyebrow={`${rowTitle ?? api.longName} · ${mode?.name ?? t('bind.defaultMode', 'Default layer')}`}
        title={api.label || rowTitle || api.longName}
        description={rowSubtitle ? <>{rowSubtitle}{' '}{description}</> : description}
        hints={[{ button: 'A', label: 'Choose' }, { button: 'X', label: 'Clear' }, ...(api.onRename ? [{ button: 'Y' as const, label: 'Rename' }] : []), { button: 'B', label: 'Done' }]}
        actions={api.onRename ? (
          <button type="button" className="console-btn" data-hints="A:Rename;B:Done" data-caption="Rename · the name shown for this button everywhere"
            onClick={rename}><Icon name="details" size={18} />{t('bind.rename', 'Rename')}</button>
        ) : undefined}>
        {open && <BindingSheetBody api={api} initial={initial} />}
      </Sheet>
      {details && (
        <BindingDetailsPopover command={command} title={name} label={api.label} glyph={api.glyph}
          summary={primary?.output ?? ''} modeshiftCount={shifts.length}
          profileActivation={api.commands.find(item => item.source.kind === 'special')?.outputValue.replace(/_/g, ' ').toLowerCase()}
          onClose={() => setDetails(false)} />
      )}
    </details>
  )
}
