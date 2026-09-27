import { useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../icons/Icon'
import { ButtonGlyph, type PadButtonName } from '../glyphs/ButtonGlyph'

// The detail sheet (console refinement 1d, §5): 640px from the right edge,
// over a scrim, below the title bar. It is a focus trap the shell already
// understands -- data-focus-trap puts the pad inside it on open and hands
// focus back to the row that opened it on close (useKeyboardNav) -- and B
// closes it through its data-modal-close button, which is mouse-only so the
// pad lands on the first row rather than on the close mark. The page's hint
// capsule hides while a sheet is open; the sheet carries its own footer.

export type SheetHint = { button: PadButtonName; label: string }

type SheetProps = {
  open: boolean
  onClose: () => void
  /** "{PAGE} · {CONFIG}", drawn uppercase. */
  eyebrow: string
  title: string
  description?: ReactNode
  /** Footer hints, drawn as controller art. */
  hints?: SheetHint[]
  /** 640 for detail sheets; the Configuration menu is its own dialog. */
  width?: number
  children: ReactNode
}

const SHEET_HINTS: SheetHint[] = [
  { button: 'A', label: 'Adjust' },
  { button: 'Y', label: 'Use Default' },
  { button: 'X', label: 'What’s this?' },
  { button: 'B', label: 'Close' },
]

export function Sheet({ open, onClose, eyebrow, title, description, hints = SHEET_HINTS, width = 640, children }: SheetProps) {
  const titleId = useId()
  if (!open) return null
  return createPortal(
    <div className="sheet-layer" data-focus-trap="true" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ width }}>
        <header className="sheet__header">
          <span className="eyebrow">{eyebrow}</span>
          <h2 id={titleId} className="sheet__title">{title}</h2>
          {description && <p className="sheet__description">{description}</p>}
          <button type="button" className="sheet__close" tabIndex={-1} data-nav-skip data-modal-close aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="sheet__body">{children}</div>
        {hints.length > 0 && (
          <footer className="sheet__footer" aria-label="Controls">
            {hints.map(hint => (
              <span key={hint.button + hint.label} className="sheet__hint"><ButtonGlyph button={hint.button} size={24} />{hint.label}</span>
            ))}
          </footer>
        )}
      </aside>
    </div>,
    document.body,
  )
}
