import { ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import keymapStyles from '../Keymap.module.css'
import { InheritedBadge } from './InheritedBadge'
import { IconPicker } from './IconPicker'

/** One binding as the compact row shows it: how it fires, and what it sends. */
export type BindingSummaryEntry = { trigger?: string; output: string }

type ButtonMappingCardProps = {
  command?: string
  summary?: BindingSummaryEntry[]
  /** How many shifts reconfigure this input, shown as a count on the row. */
  modeshiftCount?: number
  title: string
  description: string
  isCapturing: boolean
  commands: ReactNode
  /** Row of binding-wide actions (select / copy / paste) shown above the list. */
  toolbar?: ReactNode
  addControl: ReactNode
  extras?: ReactNode
  /** The input's drawn glyph, shown beside its name. */
  glyph?: ReactNode
  /** Your own name for what this input does; shown on the Overview diagram. */
  label?: string
  onLabelChange?: (label: string) => void
  /** Iconify name shown above this action on the trackpad overlay. */
  icon?: string
  onIconChange?: (icon: string) => void
  /**
   * Drop the clipboard onto this input. Offered on the closed row as well as
   * inside the card: with progressive disclosure only one input is open at a
   * time, and a paste target you have to go looking for is not a paste target.
   */
  onPaste?: () => void
  pasteLabel?: string
  /**
   * Start expanded. For a card that IS the selection -- the one region a pad
   * preview has selected -- a collapsed row is a second click to reach the
   * thing you just clicked. It stays closable.
   */
  defaultOpen?: boolean
  /** Set when this binding comes from a file the profile imports. */
  inheritedFrom?: string | null
  onOpenConfigEditor?: () => void
}

export function ButtonMappingCard({
  command,
  title,
  summary,
  modeshiftCount,
  description,
  isCapturing,
  commands,
  toolbar,
  addControl,
  extras,
  glyph,
  label,
  onLabelChange,
  icon,
  onIconChange,
  defaultOpen,
  onPaste,
  pasteLabel,
  inheritedFrom,
  onOpenConfigEditor,
}: ButtonMappingCardProps) {
  const { t } = useTranslation()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [draft, setDraft] = useState(label ?? '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(label ?? '')
  }, [label, editing])

  // Imperative rather than the  attribute, which React would keep
  // reasserting on every parent render and so refuse to stay closed.
  useEffect(() => {
    if (defaultOpen && detailsRef.current) detailsRef.current.open = true
  }, [command, defaultOpen])

  return (
    <details ref={detailsRef} onToggle={event => {
      if (!event.currentTarget.open) return
      const current = event.currentTarget
      current.parentElement?.querySelectorAll<HTMLDetailsElement>(':scope > details[data-input-command][open]').forEach(other => { if (other !== current) other.open = false })
    }} data-input-command={command} tabIndex={-1} className={`${keymapStyles.keymapRow} ${isCapturing ? keymapStyles.keymapRowCapturing : ''}`}>
      {/* Glyph, the name you gave it, what it sends, and how many shifts change
          that -- enough to read a page of inputs without opening any of them.
          The output wears the same keycap as it does inside the card, so the
          row and the editor describe a binding the same way. */}
      <summary className="binding-summary">
        {glyph}<span>{label || title}</span>
        <span className="binding-summary-hint">
          {summary?.length
            ? summary.map((entry, index) => (
                <span key={index} className="binding-summary-entry">
                  {entry.trigger && <span className="binding-summary-trigger">{entry.trigger}</span>}
                  <kbd className={keymapStyles.commandOutputSummary}>{entry.output}</kbd>
                </span>
              ))
            : t('keymap.bindingSummaryEmpty', 'Unbound')}
          {onPaste && pasteLabel && (
            <button
              type="button"
              className="link-btn"
              // Inside a summary, so the row would otherwise open underneath
              // the click that was meant for the button.
              onClick={event => { event.preventDefault(); event.stopPropagation(); onPaste() }}
            >
              {pasteLabel}
            </button>
          )}
          {!!modeshiftCount && (
            <span className="binding-summary-shifts">
              {t('keymap.bindingSummaryModeshifts', { count: modeshiftCount, defaultValue: '{{count}} modeshift' })}
            </span>
          )}
        </span>
      </summary>
      <div className="binding-detail">
      <div className={keymapStyles.keymapLabel}>
        <span className={keymapStyles.buttonNameRow}>
          {glyph && <span className={keymapStyles.buttonGlyph}>{glyph}</span>}
          <span className={keymapStyles.buttonName}>{title}</span>
          {inheritedFrom && <InheritedBadge source={inheritedFrom} onOpenConfigEditor={onOpenConfigEditor} />}
        </span>
        <span className={keymapStyles.buttonMeta}>{description}</span>
        {onLabelChange && (
          <input
            className={keymapStyles.buttonLabelInput}
            type="text"
            value={draft}
            placeholder={t('keymap.bindingLabelPlaceholder', 'Name this action')}
            aria-label={t('keymap.bindingLabel', 'Action name')}
            data-capture-ignore="true"
            onFocus={() => setEditing(true)}
            onChange={event => setDraft(event.target.value)}
            onBlur={() => {
              setEditing(false)
              if (draft !== (label ?? '')) onLabelChange(draft)
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                setDraft(label ?? '')
                setEditing(false)
                event.currentTarget.blur()
              }
            }}
          />
        )}
        {/* Beside the name, because an icon and a label are two halves of the
            same thing: what this region is called on the overlay. */}
        {onIconChange && <IconPicker value={icon ?? ''} onChange={onIconChange} />}
      </div>
      <div className={keymapStyles.commandList}>
        {toolbar}
        {commands}
        {addControl}
        {extras}
      </div>
      </div>
    </details>
  )
}
