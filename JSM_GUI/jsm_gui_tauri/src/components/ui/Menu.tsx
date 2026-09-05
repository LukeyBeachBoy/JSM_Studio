import type { ReactNode } from 'react'
import * as RadixMenu from '@radix-ui/react-dropdown-menu'
import styles from './Menu.module.css'

export type MenuItem =
  | { kind?: 'item'; label: string; onSelect: () => void; icon?: ReactNode; hint?: string; disabled?: boolean }
  | { kind: 'submenu'; label: string; icon?: ReactNode; items: MenuItem[] }
  | { kind: 'separator' }
  | { kind: 'label'; label: string }

type MenuProps = {
  /** The control that opens the menu. Rendered as the trigger itself. */
  trigger: ReactNode
  items: MenuItem[]
  align?: 'start' | 'center' | 'end'
  ariaLabel?: string
}

const SubArrow = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={styles.subArrow}>
    <path d="M3.5 1.5 7 5l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Steam's configurator opens a menu whose rarer choices live in a submenu
// (`Analog >` expanding to the press types) rather than laying every option out
// at once. Radix gives the submenu, typeahead and roving focus; the styling is
// the app's own tokens.
function renderItems(items: MenuItem[]) {
  return items.map((item, index) => {
    if (item.kind === 'separator') {
      return <RadixMenu.Separator key={`sep-${index}`} className={styles.separator} />
    }
    if (item.kind === 'label') {
      return (
        <RadixMenu.Label key={`label-${index}`} className={styles.groupLabel}>
          {item.label}
        </RadixMenu.Label>
      )
    }
    if (item.kind === 'submenu') {
      return (
        <RadixMenu.Sub key={`sub-${item.label}-${index}`}>
          <RadixMenu.SubTrigger className={styles.item}>
            {item.icon && <span className={styles.icon}>{item.icon}</span>}
            <span className={styles.itemLabel}>{item.label}</span>
            <SubArrow />
          </RadixMenu.SubTrigger>
          <RadixMenu.Portal>
            <RadixMenu.SubContent className={styles.content} sideOffset={2} alignOffset={-4}>
              {renderItems(item.items)}
            </RadixMenu.SubContent>
          </RadixMenu.Portal>
        </RadixMenu.Sub>
      )
    }
    return (
      <RadixMenu.Item
        key={`${item.label}-${index}`}
        className={styles.item}
        disabled={item.disabled}
        onSelect={item.onSelect}
      >
        {item.icon && <span className={styles.icon}>{item.icon}</span>}
        <span className={styles.itemLabel}>{item.label}</span>
        {item.hint && <span className={styles.itemHint}>{item.hint}</span>}
      </RadixMenu.Item>
    )
  })
}

export function Menu({ trigger, items, align = 'start', ariaLabel }: MenuProps) {
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger asChild aria-label={ariaLabel}>
        {trigger}
      </RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content className={styles.content} align={align} sideOffset={5}>
          {renderItems(items)}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  )
}
