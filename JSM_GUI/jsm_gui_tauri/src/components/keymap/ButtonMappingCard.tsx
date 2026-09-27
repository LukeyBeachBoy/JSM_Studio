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
import { inputDisplayName } from '../../keymap/inputNames'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import type { ModeshiftSummary } from '../../utils/modeshift'
import { heldInput } from '../../utils/released'
import { LayerTile, ModeshiftTile, MoreTile, OutputKeycap } from './ConceptTiles'

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
  /** The shifts that reconfigure this input; the first is drawn on the row. */
  shifts?: ModeshiftSummary[]
  /** Whose names the held inputs go by: L4 on a Deck, LSL on nothing. */
  family?: ControllerVisualFamily
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

const NO_SHIFTS: ModeshiftSummary[] = []

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
  shifts = NO_SHIFTS,
  family = 'generic',
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
  const inputActions = command ? actionsOnInput(actions, command) : []
  const layerAction = inputActions[0]
  const modeshiftCount = shifts.length

  // The closed row (binding card refresh 3b): the name you gave it over the
  // input it belongs to. With no name the input is the title; unbound, the
  // title says so in the quiet colour. What it sends is the Output column and
  // what else it does is the Extras column, so the text says neither.
  const unbound = entries.length === 0
  const sends = entries.map(entry => entry.output).join(', ')
  const unboundText = emptyLabel ?? t('keymap.bindingSummaryEmpty', 'Unbound')
  const closedTitle = rowTitle ?? (label || (unbound && !layerAction ? unboundText : title))
  const closedSubtitle = rowTitle
    ? rowSubtitle ?? (label || (unbound ? unboundText : undefined))
    : label || (unbound && !layerAction) ? title : undefined
  const quietTitle = !rowTitle && !label && unbound && !layerAction

  // Extras: at most one modeshift tile and one layer tile, then one "+n" for
  // the rest. Output: up to two keycaps, then "+n".
  const shift = shifts[0]
  const extraCount = Math.max(0, shifts.length - 1) + Math.max(0, inputActions.length - 1)
  const extrasColumn = (
    <span className={keymapStyles.rowExtras}>
      {shift && (
        <ModeshiftTile trigger={inputDisplayName(heldInput(shift.trigger), family)} output={describeBinding(shift.value, t) || t('keymap.rowNone', 'None')}
          title={`${inputDisplayName(shift.trigger, family)} → ${describeBinding(shift.value, t)}`} />
      )}
      {layerAction && <LayerTile layerId={layerAction.layerId} verb={layerAction.verb} />}
      {extraCount > 0 && <MoreTile count={extraCount} title={[
        ...shifts.slice(1).map(item => `${inputDisplayName(item.trigger, family)} → ${describeBinding(item.value, t)}`),
        ...inputActions.slice(1).map(action => `${layerVerbLabels[action.verb]}: ${layers.find(layer => layer.id === action.layerId)?.name ?? action.layerId}`),
      ].join('\n')} />}
    </span>
  )
  const outputColumn = (
    <span className={keymapStyles.rowOutput}>
      {entries.slice(0, 2).map((entry, index) => <OutputKeycap key={index} activation={entry.trigger} output={entry.output} title={entry.outputTitle} />)}
      {entries.length > 2 && <MoreTile count={entries.length - 2} tone="command" title={entries.slice(2).map(entry => entry.outputTitle ?? entry.output).join('\n')} />}
      {unbound && <span className={keymapStyles.rowNone} title={inputUses.length ? inputUses.join('\n') : undefined}>{t('keymap.rowNone', 'None')}</span>}
    </span>
  )

  // The open header (Binding Editor 7a): the input's name and a one-line
  // account of the editor under it.
  const openSummary = [
    entries.length === 1 ? '1 command' : `${entries.length} commands`,
    kinds || '',
    modeshiftCount ? `${modeshiftCount} ${modeshiftCount === 1 ? 'modeshift' : 'modeshifts'}` : 'no modeshifts',
    layerAction ? `${actionsOnInput(actions, command ?? '').length} layer ${actionsOnInput(actions, command ?? '').length === 1 ? 'action' : 'actions'}` : 'no layer actions',
  ].filter(Boolean).join(' · ')
  const templateValue = origin?.kind === 'override' && origin.baseValue ? `template: ${describeBinding(origin.baseValue, t)}` : undefined

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
    : `A:Open;${xHint}Y:Details;B:Back`

  return (
    <details ref={detailsRef} onToggle={event => {
      setOpen(event.currentTarget.open)
      // Focus stays on the summary across a toggle, so the capsule is told.
      window.dispatchEvent(new Event('jsm:interaction-hint'))
      if (!event.currentTarget.open) return
      const current = event.currentTarget
      current.parentElement?.querySelectorAll<HTMLDetailsElement>(':scope > details[data-input-command][open]').forEach(other => { if (other !== current) other.open = false })
    }} data-input-command={command} tabIndex={-1} className={`${keymapStyles.keymapRow} ${isCapturing ? keymapStyles.keymapRowCapturing : ''}`}>
      <summary ref={summaryRef} className={`binding-summary ${open ? keymapStyles.editorHead : keymapStyles.bindingRow}`} data-hints={hints} data-pad-keys="XY" onKeyDown={onSummaryKey}>
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
            <span className={`binding-summary-label ${quietTitle ? keymapStyles.unboundTitle : ''}`.trim()}>{closedTitle}</span>
            <span className="binding-summary-input">{closedSubtitle}<OriginMarker setting={command} /></span>
          </span>
        )}
        {open ? (
          <span className="binding-summary-hint">
            <OriginMarker setting={command} detail={templateValue} withReset addressable />
            <span className={keymapStyles.editorHeadActions}>
              <button type="button" className="button button--ghost button--sm" disabled={!onCopyAll} onClick={event => { stop(event); onCopyAll?.() }} data-hints="A:Copy;B:Back">{t('keymap.copy', 'Copy')}</button>
              <button type="button" className="button button--ghost button--sm" disabled={!canPaste || !onPaste} title={canPaste ? pasteLabel : undefined} onClick={event => { stop(event); onPaste?.() }} data-hints="A:Paste;B:Back">{t('keymap.paste', 'Paste')}</button>
              <button type="button" className="button button--ghost button--sm" onClick={event => { stop(event); setDetails(true) }} data-hints="A:Details;B:Back"><b className={keymapStyles.faceHint} aria-hidden="true">Y</b>{t('keymap.details', 'Details')}</button>
            </span>
          </span>
        ) : (
          <>
            {extrasColumn}
            {outputColumn}
          </>
        )}
      </summary>
      <div className="binding-detail">
        <div className={keymapStyles.editorBody}>
          <div className={keymapStyles.editorSection}>
            <span className={`${keymapStyles.eyebrowHeading} ${keymapStyles.eyebrowWithIcon}`}><Icon name="command" size={14} />{t('keymap.commandsHeading', 'Commands')}</span>
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
