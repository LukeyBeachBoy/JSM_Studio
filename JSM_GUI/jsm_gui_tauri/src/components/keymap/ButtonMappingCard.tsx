import { useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import keymapStyles from '../Keymap.module.css'
import { LayerUsageContext, useInputUses } from '../LayerBar'
import { actionsOnInput, layerVerbLabels } from '../../utils/layers'
import { Icon } from '../icons/Icon'
import { OriginMarker } from './OriginMarker'
import { useSettingOriginInfo } from './settingOriginInfo'
import { BindingDetailsPopover } from './BindingDetailsPopover'
import { describeBinding } from '../../utils/bindingDescription'

/** One binding as the compact row shows it: how it fires, and what it sends. */
export type BindingSummaryEntry = {
  trigger?: string
  output: string
  /** The binding spelled out, shown on hover. */
  outputTitle?: string
  /** A JoyShockMapper setting rather than a key: drawn as the accent pill. */
  jsm?: boolean
}

type ButtonMappingCardProps = {
  command?: string
  /** The input's long name: "Right bumper", "D-pad up". */
  title: string
  /** The input's short name, for "Close RB". */
  shortName?: string
  summary?: BindingSummaryEntry[]
  /** Activation kinds of the commands, "Tap / Hold". */
  kinds?: string
  /** How many shifts reconfigure this input, shown on the row. */
  modeshiftCount?: number
  /**
   * The row's name where the block around it already names the input, like
   * "Soft pull" inside Left trigger or "Segment 4 · Equipment" on a wheel.
   * The subtitle then reads the binding, or `rowSubtitle` when given.
   */
  rowTitle?: string
  rowSubtitle?: string
  /** What an unbound row says instead of "Unbound": "Analog passthrough · Xbox LT". */
  emptyLabel?: string
  isCapturing: boolean
  commands: ReactNode
  /** "+ Add command" and "Capture a key". */
  addControl: ReactNode
  /** The input's own rare settings, inside the Advanced disclosure. */
  extras?: ReactNode
  /** The modeshift panel for this input; omitted on a shifted card. */
  modeshifts?: ReactNode
  /** The layer action panel; omitted on a shifted card. */
  layerActions?: ReactNode
  /** The input's drawn glyph, 28px. */
  glyph?: ReactNode
  /** Your own name for what this input does; shown on the Overview diagram. */
  label?: string
  /** Drop the clipboard onto this input, from the closed row. */
  onPaste?: () => void
  pasteLabel?: string
  /** Copy every command on this input to the clipboard. */
  onCopyAll?: () => void
  /** True when the clipboard holds something to paste. */
  canPaste?: boolean
  /** X on the closed row: capture a key for the primary command. */
  onCapture?: () => void
  /** What X does on this row instead of capturing: "Test segment" (15b). */
  xAction?: { label: string; run: () => void }
  defaultOpen?: boolean
}

const isTextEntry = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  return Boolean(element && element.matches('input, textarea, select, [contenteditable="true"]'))
}

export function ButtonMappingCard({
  command,
  title,
  shortName,
  summary,
  kinds,
  modeshiftCount = 0,
  rowTitle,
  rowSubtitle,
  emptyLabel,
  isCapturing,
  commands,
  addControl,
  extras,
  modeshifts,
  layerActions,
  glyph,
  label,
  defaultOpen,
  onPaste,
  pasteLabel,
  onCopyAll,
  canPaste,
  onCapture,
  xAction,
}: ButtonMappingCardProps) {
  const { t } = useTranslation()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(Boolean(defaultOpen))
  const [details, setDetails] = useState(false)
  const inputUses = useInputUses(command)
  const { actions, layers } = useContext(LayerUsageContext)
  const origin = useSettingOriginInfo(command)

  // Imperative rather than the attribute, which React would keep reasserting
  // on every parent render and so refuse to stay closed.
  useEffect(() => {
    if (defaultOpen && detailsRef.current) detailsRef.current.open = true
  }, [command, defaultOpen])

  // Y on a command row asks its input for the details popover. Stopped here
  // so a shifted card nested inside an editor answers for itself.
  useEffect(() => {
    const element = detailsRef.current
    if (!element) return
    const request = (event: Event) => { event.stopPropagation(); setDetails(true) }
    element.addEventListener('jsm:binding-details', request)
    return () => element.removeEventListener('jsm:binding-details', request)
  }, [])

  const entries = summary ?? []
  const first = entries[0]
  const inputActions = command ? actionsOnInput(actions, command) : []
  const layerAction = inputActions[0]
  // Every layer this input drives, as its own chip beside the key it sends: a
  // paddle that holds "Vehicles & utility" used to read Unbound, because the
  // row only looked at key bindings.
  const layerChips = inputActions.map((action, index) => {
    const layerIndex = layers.findIndex(layer => layer.id === action.layerId)
    const slot = (Math.max(0, layerIndex) % 3) + 1
    const name = layers[layerIndex]?.name ?? action.layerId
    const verb = layerVerbLabels[action.verb].replace(/ layer$/, '')
    return (
      <span key={`${action.layerId}-${action.verb}-${index}`} className={`${keymapStyles.valuePill} ${keymapStyles.valuePillLayer}`} style={{ background: `var(--layer-${slot}-soft)`, color: `var(--layer-${slot})` }} title={`${layerVerbLabels[action.verb]}: ${name}`}>
        <span className={keymapStyles.layerSwatch} style={{ background: `var(--layer-${slot})` }} aria-hidden="true" />{verb} · {name}
      </span>
    )
  })

  // The closed row (Components 13.6): the name you gave it over the input it
  // belongs to. With no name, the input itself is the title: the action is
  // already on the value pill, and a title that repeats the pill ("F" beside
  // [F]) says nothing twice. Unbound rows read "Menu button / Unbound", as
  // Overview's callouts do.
  const unbound = entries.length === 0 && !layerAction
  const sends = entries.map(entry => entry.output).join(', ')
  const closedTitle = rowTitle ?? (label || title)
  const extraBits = [
    entries.length > 1 ? `${entries.length} commands` : '',
    entries.length > 1 && kinds ? kinds : '',
    modeshiftCount ? t('keymap.bindingSummaryModeshifts', { count: modeshiftCount, defaultValue: '{{count}} modeshift' }) : '',
  ].filter(Boolean)
  const unboundText = emptyLabel ?? t('keymap.bindingSummaryEmpty', 'Unbound')
  const closedSubtitle = rowTitle
    ? rowSubtitle ?? (unbound ? unboundText : [label, sends].filter(Boolean).join(' · '))
    : label
      ? [title, ...extraBits].join(' · ')
      : unbound
        ? unboundText
        : extraBits.join(' · ')

  // The open header (Binding Editor 7a): the input's name and a one-line
  // account of the editor under it.
  const openSummary = [
    entries.length === 1 ? '1 command' : `${entries.length} commands`,
    kinds || '',
    modeshiftCount ? `${modeshiftCount} ${modeshiftCount === 1 ? 'modeshift' : 'modeshifts'}` : 'no modeshifts',
    layerAction ? `${actionsOnInput(actions, command ?? '').length} layer ${actionsOnInput(actions, command ?? '').length === 1 ? 'action' : 'actions'}` : 'no layer actions',
  ].filter(Boolean).join(' · ')
  const templateValue = origin?.kind === 'override' && origin.baseValue ? `template: ${describeBinding(origin.baseValue, t)}` : undefined

  const pill = layerAction && entries.length === 0
    ? null
    : first
      ? entries.length > 1
        ? <kbd className={`${keymapStyles.valuePill} ${keymapStyles.valuePillMulti}`} title={entries.map(entry => entry.outputTitle ?? entry.output).join('\n')}>{first.output}<span className={keymapStyles.valuePillMore}>+{entries.length - 1}</span></kbd>
        : <kbd className={`${keymapStyles.valuePill} ${first.jsm ? keymapStyles.valuePillJsm : keymapStyles.valuePillKey}`} title={first.outputTitle}>{first.output}</kbd>
      : inputUses.length
        ? <span className={keymapStyles.valuePillQuiet}>Used as modifier</span>
        : <span className={keymapStyles.valuePillQuiet}>{t('keymap.addAction', 'Add action')}</span>

  const stop = (event: { preventDefault: () => void; stopPropagation: () => void }) => { event.preventDefault(); event.stopPropagation() }
  const onSummaryKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || isTextEntry(event.target)) return
    if (event.key === 'x' || event.key === 'X') {
      if (xAction) { event.preventDefault(); xAction.run(); return }
      if (onCapture) { event.preventDefault(); onCapture(); return }
    }
    if (event.key === 'y' || event.key === 'Y') { event.preventDefault(); setDetails(true) }
  }
  const closeLabel = shortName ? `Close ${shortName}` : 'Close'
  const xHint = xAction ? `X:${xAction.label};` : onCapture ? 'X:Capture;' : ''
  const hints = open
    ? `A:Close;${xHint}Y:Details;B:${closeLabel}`
    : `A:Edit;${xHint}Y:Details;B:Back`

  return (
    <details ref={detailsRef} onToggle={event => {
      setOpen(event.currentTarget.open)
      // Focus stays on the summary across a toggle, so the capsule is told.
      window.dispatchEvent(new Event('jsm:interaction-hint'))
      if (!event.currentTarget.open) return
      const current = event.currentTarget
      current.parentElement?.querySelectorAll<HTMLDetailsElement>(':scope > details[data-input-command][open]').forEach(other => { if (other !== current) other.open = false })
    }} data-input-command={command} tabIndex={-1} className={`${keymapStyles.keymapRow} ${isCapturing ? keymapStyles.keymapRowCapturing : ''}`}>
      <summary ref={summaryRef} className={`binding-summary ${open ? keymapStyles.editorHead : ''}`.trim()} data-hints={hints} data-pad-keys="XY" onKeyDown={onSummaryKey}>
        <span className={keymapStyles.glyphBadge} aria-hidden="true">{glyph}</span>
        {open ? (
          <span className="binding-summary-name">
            <span className={keymapStyles.editorTitle}>{rowTitle ?? title}</span>
            <span className={`binding-summary-input ${keymapStyles.editorSummaryLine}`}>
              {entries.slice(0, 2).map((entry, index) => <kbd key={index} className={keymapStyles.editorSummaryKey} title={entry.outputTitle}>{entry.output}</kbd>)}
              {entries.length > 2 && <span>+{entries.length - 2}</span>}
              <span>{openSummary}</span>
            </span>
          </span>
        ) : (
          <span className="binding-summary-name">
            <span className="binding-summary-label">{closedTitle}</span>
            {closedSubtitle && <span className={`binding-summary-input ${unbound && !rowTitle ? keymapStyles.unboundTitle : ''}`.trim()}>{closedSubtitle}</span>}
          </span>
        )}
        <span className="binding-summary-hint">
          {open ? (
            <>
              <OriginMarker setting={command} detail={templateValue} withReset addressable />
              <span className={keymapStyles.editorHeadActions}>
                <button type="button" className="button button--ghost button--sm" disabled={!onCopyAll} onClick={event => { stop(event); onCopyAll?.() }} data-hints="A:Copy;B:Back">{t('keymap.copy', 'Copy')}</button>
                <button type="button" className="button button--ghost button--sm" disabled={!canPaste || !onPaste} title={canPaste ? pasteLabel : undefined} onClick={event => { stop(event); onPaste?.() }} data-hints="A:Paste;B:Back">{t('keymap.paste', 'Paste')}</button>
                <button type="button" className="button button--ghost button--sm" onClick={event => { stop(event); setDetails(true) }} data-hints="A:Details;B:Back"><b className={keymapStyles.faceHint} aria-hidden="true">Y</b>{t('keymap.details', 'Details')}</button>
              </span>
            </>
          ) : (
            <>
              {onPaste && canPaste && pasteLabel && (
                <button
                  type="button"
                  className="link-btn"
                  // Inside a summary, so the row would otherwise open underneath
                  // the click that was meant for the button.
                  onClick={event => { stop(event); onPaste() }}
                >
                  {pasteLabel}
                </button>
              )}
              <OriginMarker setting={command} />
              {layerChips}
              {pill}
            </>
          )}
        </span>
      </summary>
      <div className="binding-detail">
        <div className={keymapStyles.editorBody}>
          <div className={keymapStyles.editorSection}>
            <span className={keymapStyles.eyebrowHeading}>{t('keymap.commandsHeading', 'Commands')}</span>
            <div className={keymapStyles.commandList}>{commands}</div>
            {addControl}
          </div>
          {(modeshifts || layerActions) && (
            <div className={keymapStyles.editorPanels}>
              {modeshifts}
              {layerActions}
            </div>
          )}
          {/* Per-command timing lives on each command's Timing button; the
              only binding-wide option (trackball decay) shows when it applies.
              What is left to say is where the shared press windows live. */}
          {extras}
          <p className={keymapStyles.advancedNote}>{t('keymap.advancedBindingNote', 'Hold, double-press and chord windows are shared by the whole configuration: Tuning · Press timing.')}</p>
        </div>
      </div>
      {details && (
        <BindingDetailsPopover
          anchor={summaryRef.current}
          command={command ?? ''}
          title={rowTitle ?? title}
          summary={sends}
          modeshiftCount={modeshiftCount}
          onClose={() => setDetails(false)}
        />
      )}
    </details>
  )
}

/** The reorder grip of a command row (7a): six dots, decorative for now. */
export function ReorderGrip() {
  return <span className={keymapStyles.commandGrip} aria-hidden="true"><Icon name="reorder" size={16} /></span>
}
