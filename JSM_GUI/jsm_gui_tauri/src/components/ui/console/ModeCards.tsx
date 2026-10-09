import type { ReactNode } from 'react'
import styles from './ModeCards.module.css'

// Picture cards (console v2, V7 "the front shows the choice as picture cards"):
// Sticks "Left stick is for…", Triggers "Left trigger works as…", Trackpads,
// Gyro's three questions, New configuration presets. Each card is a button: the
// D-pad moves between them, A uses one. The current one is outlined and says
// so. A "More" card (`more`) opens the rest of the choices.
//
// `variant="compare"` draws large text cards with a sentence each (Binding
// Fine-tune "How Space is sent"): the same choice, explained.
//
// Choosing writes at once: changes are live while you're here (no OK step).

export type ModeCard = {
  value: string
  label: string
  /** One line under the label: "Sends W A S D". */
  caption?: ReactNode
  /** Flat art per STYLE-FLAT.md (an svg, a MenuPreview…). */
  art?: ReactNode
  /** Still focusable, says why it can't be used here (Kit: unavailable). */
  unavailable?: string
  /** Extra data-* attributes on the card (a test hook, a glyph the footer reads). */
  data?: Record<`data-${string}`, string | undefined>
}

type ModeCardsProps = {
  /** The question: "Left stick is for…". */
  label?: ReactNode
  /** Under the question: "◂ ▸ to compare · changes are live while you’re here". */
  note?: ReactNode
  options: ModeCard[]
  value: string
  onChange: (value: string) => void
  /** The last card: "More +10 · Mouse area, mouse ring, scroll wheel…". */
  more?: { label: string; caption?: ReactNode; count?: number; onOpen: () => void; current?: boolean }
  /** Cards per row (6 on Sticks, 4 on Triggers). */
  columns?: number
  variant?: 'picture' | 'compare'
  /** Hint for A on a card, given the card's label: "Use Moving". */
  useLabel?: (card: ModeCard) => string
  className?: string
  /** More hints every card declares, before B: "X:Try it in Test;Y:More;LT/RT:Other stick". */
  hints?: string
}

export function ModeCards({ label, note, options, value, onChange, more, columns = 4, variant = 'picture', useLabel, className, hints }: ModeCardsProps) {
  const extra = hints ? `;${hints}` : ''
  return (
    <section className={`${styles.wrap} ${className ?? ''}`.trim()} aria-label={typeof label === 'string' ? label : undefined}>
      {(label || note) && (
        <header className={styles.heading}>
          {label && <h2>{label}</h2>}
          {note && <span className={styles.note}>{note}</span>}
        </header>
      )}
      <div className={styles.grid} data-variant={variant} data-wide={columns > 4 ? 'true' : undefined} role="radiogroup" style={{ ['--cols' as string]: columns }}>
        {options.map(option => {
          const current = option.value === value
          return (
            <button key={option.value} type="button" role="radio" aria-checked={current} className={styles.card} data-variant={variant}
              data-current={current ? 'true' : undefined} data-value={option.value} {...option.data}
              aria-disabled={option.unavailable ? 'true' : undefined} data-reason={option.unavailable}
              // The page's hints come last so its B ("Layout" on a front) wins over the default.
              data-hints={option.unavailable ? `B:Back${extra}` : `A:${useLabel ? useLabel(option) : `Use ${option.label}`};B:Back${extra}`}
              data-caption={typeof option.caption === 'string' ? `${option.label} · ${option.caption}` : undefined} data-caption-label={option.label}
              onClick={() => { if (!option.unavailable) onChange(option.value) }}>
              {option.art && <span className={styles.art} aria-hidden="true">{option.art}</span>}
              <span className={styles.text}>
                <b className={styles.label}>{option.label}</b>
                {option.caption && <span className={styles.caption}>{option.caption}</span>}
                {current && variant === 'compare' && <span className={styles.currentTag}>Current</span>}
              </span>
              {current && variant === 'picture' && <span className={styles.currentDot} aria-hidden="true" />}
            </button>
          )
        })}
        {more && (
          <button type="button" className={`${styles.card} ${styles.more}`} data-variant={variant} data-current={more.current ? 'true' : undefined}
            data-hints={`A:${more.label};B:Back${extra}`} onClick={more.onOpen}>
            <span className={styles.moreCount} aria-hidden="true">{more.count !== undefined ? `+${more.count}` : '…'}</span>
            <span className={styles.text}>
              <b className={styles.label}>{more.label}</b>
              {more.caption && <span className={styles.caption}>{more.caption}</span>}
            </span>
          </button>
        )}
      </div>
    </section>
  )
}
