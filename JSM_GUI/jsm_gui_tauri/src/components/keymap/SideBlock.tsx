import { HelpButton } from '../HelpButton'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './SideBlock.module.css'

type SideBlockProps = {
  side: 'left' | 'right'
  /** Omit to show only the L / R strip (when the content carries its own heading). */
  title?: string
  description?: string
  /** Anchor for a within-page nav to scroll to. */
  id?: string
  /** False when the section around it already names the side. */
  header?: boolean
  children: ReactNode
}

// Symmetrical inputs (triggers, pads, sticks, paddles, grips) are laid out by
// SIDE: everything for the left hand first, then a clearly separated block for
// the right. Interleaving left and right rows is what made those pages hard to
// scan -- you had to read every label to know which hand it was about.
// Left and right sit side by side at 1440 and stack at 1024 (Configuration
// Pages.dc.html): one column per hand, so each reads top to bottom.
//
// `stack` keeps them one above the other at every width, for sides that are
// already two columns inside (a trackpad: preview beside its settings). Split
// again into hands, each settings column was left ~300px at 1440 and the
// region editor inside it clipped its own buttons and values.
export function SideSplit({ children, stack = false }: { children: ReactNode; stack?: boolean }) {
  return <div className={`${styles.split} ${stack ? styles.stack : ''}`.trim()}>{children}</div>
}

export function SideBlock({ side, title, description, id, header = true, children }: SideBlockProps) {
  const { t } = useTranslation()
  const sideLabel = side === 'left' ? t('keymap.sideLeft', 'Left') : t('keymap.sideRight', 'Right')
  return (
    <section id={id} className={`${styles.block} ${side === 'left' ? styles.left : styles.right}`} aria-label={title ?? sideLabel}>
      {header && <header className={styles.header}>
        <span className={styles.tag} aria-hidden="true">
          {side === 'left' ? 'L' : 'R'}
        </span>
        <div className={styles.headerText}>
          <span className={styles.title}>{title ?? sideLabel} {description && <HelpButton title={title ?? sideLabel}>{description}</HelpButton>}</span>

        </div>
      </header>}
      <div className={styles.body}>{children}</div>
    </section>
  )
}
