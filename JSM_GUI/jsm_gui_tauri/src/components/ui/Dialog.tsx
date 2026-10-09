import { useEffect, useId, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ButtonGlyph, type PadButtonName } from '../glyphs/ButtonGlyph'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'

// The centred dialog (binding card refresh 3e, 3f, 1g): always in the middle of
// the viewport over a scrim, never placed relative to what opened it. Like the
// Sheet it is a focus trap the shell understands -- data-focus-trap puts the
// pad inside it and hands focus back on close, and B / Escape reach it through
// its data-modal-close button, which the pad never lands on.

/** One button, or a pair drawn together (LB / RB). */
export type DialogHint = { button: PadButtonName | [PadButtonName, PadButtonName]; label: string }

type DialogProps = {
  onClose: () => void
  /** Drawn uppercase over the title. */
  eyebrow?: ReactNode
  title: ReactNode
  /** A line under the title. */
  subtitle?: ReactNode
  /** Left of the title: the icon modal's preview well. */
  lead?: ReactNode
  /** Right of the title: a preview, a search field, an action. */
  aside?: ReactNode
  /** A fixed row between the header and the scrolling body: tabs. */
  toolbar?: ReactNode
  /** The footer's lead text, left of the hints: "Or press it on your controller". */
  footerNote?: ReactNode
  /** The footer's controller hints, drawn as the pad's own art. */
  hints?: DialogHint[]
  /** The footer's buttons, for the mouse; the hints say what the pad does. */
  actions?: ReactNode
  width: number
  height?: number
  /** Scrim opacity over the page: .64 by default, .72 for the icon picker. */
  scrim?: number
  /** Concept tint for the frame: a modeshift glows crimson, a layer takes its hue. */
  tone?: 'shift' | 'layer'
  /** A layer's own colour when the tone is 'layer'. */
  hue?: string
  className?: string
  /** LB / RB and the other buttons a dialog can claim from the pad. */
  onPad?: (button: string) => boolean
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
  children: ReactNode
}

export function Dialog({ onClose, eyebrow, title, subtitle, lead, aside, toolbar, footerNote, hints = [], actions, width, height, scrim, tone, hue, className = '', onPad, onKeyDown, children }: DialogProps) {
  const titleId = useId()
  const ref = useRef<HTMLElement>(null)
  const padRef = useRef(onPad)
  padRef.current = onPad
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const handle = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (padRef.current?.(button)) event.preventDefault()
    }
    root.addEventListener(PAD_EVENT, handle)
    return () => root.removeEventListener(PAD_EVENT, handle)
  }, [])
  const style = { width, height, ...(hue ? { '--dialog-hue': hue } : {}) } as CSSProperties
  return createPortal(
    <div className="dialog-layer" data-focus-trap="true" style={scrim !== undefined ? { background: `rgba(5, 9, 13, ${scrim})` } : undefined}
      // preventDefault: the press on the scrim must not move focus to <body>,
      // so it returns to what opened the dialog (UX review, B3).
      onMouseDown={event => { if (event.target === event.currentTarget) { event.preventDefault(); onClose() } }}>
      <section ref={ref} className={`dialog ${className}`.trim()} data-tone={tone} role="dialog" aria-modal="true" aria-labelledby={titleId} style={style} onKeyDown={onKeyDown}>
        <header className="dialog__header">
          {lead}
          <div className="dialog__heading">
            {eyebrow && <span className="dialog__eyebrow">{eyebrow}</span>}
            <h2 id={titleId} className="dialog__title">{title}</h2>
            {subtitle && <span className="dialog__subtitle">{subtitle}</span>}
          </div>
          {aside}
          <button type="button" className="dialog__close" tabIndex={-1} data-nav-skip data-modal-close aria-label="Close" onClick={onClose} />
        </header>
        {toolbar}
        <div className="dialog__body">{children}</div>
        <footer className="dialog__footer" aria-label="Controls">
          {footerNote && <span className="dialog__note">{footerNote}</span>}
          <span className="dialog__hints">
            {hints.map(hint => (
              <span key={String(hint.button) + hint.label} className="dialog__hint">{(Array.isArray(hint.button) ? hint.button : [hint.button]).map(button => <ButtonGlyph key={button} button={button} size={24} />)}{hint.label}</span>
            ))}
          </span>
          {actions}
        </footer>
      </section>
    </div>,
    document.body,
  )
}
