import { HelpButton } from './HelpButton'
import { ReactNode } from 'react'
import styles from './Keymap.module.css'

type KeymapSectionProps = {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
}

export function KeymapSection({ title, description, icon, action, children }: KeymapSectionProps) {
  return (
    <section className={styles.keymapSection}>
      <div className={styles.keymapSectionHeader}>
        <div className={styles.keymapSectionHeading}>
          {icon && <span className={styles.keymapSectionIcon}>{icon}</span>}
          <div>
            <h3>{title} {description && <HelpButton title={title}>{description}</HelpButton>}</h3>

          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

