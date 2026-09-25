import { HelpButton } from './HelpButton'
import { ReactNode } from 'react'
import styles from './Keymap.module.css'

type KeymapSectionProps = {
  className?: string
  title: string
  description?: string
  icon?: ReactNode
  /** How many inputs the section holds, shown after its name. */
  count?: number
  action?: ReactNode
  children: ReactNode
}

export function KeymapSection({ className = '', title, description, count, action, children }: KeymapSectionProps) {
  return (
    <section className={`${styles.keymapSection} ${className}`.trim()}>
      <div className={styles.keymapSectionHeader}>
        <div className={styles.keymapSectionHeading}>
          <div>
            <h3>{title}{count !== undefined && <span className={styles.keymapSectionCount}>{count}</span>} {description && <HelpButton title={title}>{description}</HelpButton>}</h3>

          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

