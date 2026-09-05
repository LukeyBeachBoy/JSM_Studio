import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './AdvancedDisclosure.module.css'

type AdvancedDisclosureProps = {
  /** Defaults to "Advanced". */
  label?: string
  /** Short summary shown next to the label while collapsed, e.g. current values. */
  summary?: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}

// Steam Input's pattern: the common controls are in your face, the rarely
// touched ones fold away behind one disclosure per card rather than being
// dumped inline. Native <details> so it is keyboard/controller operable for
// free (Enter/Space on the summary).
export function AdvancedDisclosure({ label, summary, defaultOpen = false, className = '', children }: AdvancedDisclosureProps) {
  const { t } = useTranslation()
  return (
    <details className={`${styles.disclosure} ${className}`.trim()} open={defaultOpen || undefined}>
      <summary className={styles.summary}>
        <span className={styles.chevron} aria-hidden="true" />
        <span className={styles.label}>{label ?? t('keymap.advancedOptions', 'Advanced')}</span>
        {summary && <span className={styles.preview}>{summary}</span>}
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  )
}
