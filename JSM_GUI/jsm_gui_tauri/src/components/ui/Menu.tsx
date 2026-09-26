import { useRef, type ReactNode } from 'react'
import * as RadixMenu from '@radix-ui/react-dropdown-menu'
import { Icon } from '../icons/Icon'
import styles from './Menu.module.css'

export type MenuTagTone = 'ok' | 'accent' | 'neutral' | 'warn' | 'layer-1' | 'layer-2' | 'layer-3'

export type MenuItem =
  | {
      kind?: 'item'
      label: string
      onSelect: () => void
      icon?: ReactNode
      /** Short trailing text, as before. */
      hint?: string
      /** Second line under the label (design menus are two-line). */
      description?: string
      /** Marks the current value: a check in the leading column, and where focus lands on open. */
      checked?: boolean
      /** A small colour square in the leading column (layers). */
      swatch?: string
      tag?: { label: string; tone?: MenuTagTone }
      /** Trailing control drawn inside the row, e.g. a segmented On/Off. */
      trailing?: ReactNode
      /** Selecting runs onSelect without closing the menu. */
      keepOpen?: boolean
      /** A trailing chevron: this row goes somewhere else. */
      navigates?: boolean
      disabled?: boolean
    }
  | { kind: 'submenu'; label: string; icon?: ReactNode; items: MenuItem[] }
  | { kind: 'separator' }
  | { kind: 'label'; label: string }

type MenuSearch = { placeholder: string; value: string; onChange: (value: string) => void }

type MenuProps = {
  /** The control that opens the menu. Rendered as the trigger itself. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger: ReactNode
  items: MenuItem[]
  align?: 'start' | 'center' | 'end'
  ariaLabel?: string
  /** Width of the surface; design menus are 320–380px. */
  width?: number
  search?: MenuSearch
  /** Rendered when search leaves nothing to show. */
  empty?: string
}

// Leading column: check for the current value, a swatch for a layer, an icon,
// or an empty 10px spacer so labels line up down the list.
const Leading = ({ item }: { item: Extract<MenuItem, { label: string; onSelect: () => void }> }) => {
  if (item.checked) return <span className={styles.check} aria-hidden="true"><Icon name="success" size={16} /></span>
  if (item.swatch) return <span className={styles.swatch} style={{ background: item.swatch }} aria-hidden="true" />
  if (item.icon) return <span className={styles.icon}>{item.icon}</span>
  return <span className={styles.spacer} aria-hidden="true" />
}

// Steam's configurator opens a menu whose rarer choices live in a submenu
// (`Analog >` expanding to the press types) rather than laying every option out
// at once. Radix gives the submenu, typeahead and roving focus; the styling is
// the design's menu (Shell Directions 2b–2d).
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
            {item.icon ? <span className={styles.icon}>{item.icon}</span> : <span className={styles.spacer} aria-hidden="true" />}
            <span className={styles.itemText}><span className={styles.itemLabel}>{item.label}</span></span>
            <span className={styles.chevron} aria-hidden="true"><Icon name="chevronRight" size={16} /></span>
          </RadixMenu.SubTrigger>
          <RadixMenu.Portal>
            <RadixMenu.SubContent className={styles.content} sideOffset={2} alignOffset={-8}>
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
        data-current={item.checked ? 'true' : undefined}
        onSelect={event => {
          if (item.keepOpen) event.preventDefault()
          item.onSelect()
        }}
      >
        <Leading item={item} />
        <span className={styles.itemText}>
          <span className={styles.itemLabel}>{item.label}</span>
          {item.description && <span className={styles.itemDescription}>{item.description}</span>}
        </span>
        {item.hint && <span className={styles.itemHint}>{item.hint}</span>}
        {item.tag && <span className={styles.tag} data-tone={item.tag.tone ?? 'neutral'}>{item.tag.label}</span>}
        {item.trailing}
        {item.navigates && <span className={styles.chevron} aria-hidden="true"><Icon name="chevronRight" size={16} /></span>}
      </RadixMenu.Item>
    )
  })
}

export function Menu({ trigger, items, align = 'start', ariaLabel, open, onOpenChange, width, search, empty }: MenuProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const hasItems = items.some(item => item.kind !== 'separator' && item.kind !== 'label')

  return (
    <RadixMenu.Root open={open} onOpenChange={onOpenChange}>
      <RadixMenu.Trigger ref={triggerRef} asChild aria-label={ariaLabel}
        // Radix opens the menu on Down. Down from a title-bar segment or a
        // page tab is meant to move focus (HANDOFF.md, "Focus model": Down
        // from the title bar returns to the tab), so Up/Down navigate and
        // A / Enter / Space open.
        onKeyDown={event => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          if (event.currentTarget.getAttribute('data-state') === 'open') return
          event.preventDefault()
          window.dispatchEvent(new CustomEvent('jsm:navigate-direction', { detail: event.key }))
        }}>
        {trigger}
      </RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          ref={contentRef}
          className={styles.content}
          align={align}
          sideOffset={6}
          collisionPadding={16}
          style={width ? { width } : undefined}
          data-pad-keys={search ? 'Y' : undefined}
          // A row that opens a dialog (Manage layers…, a configuration switch
          // that raises the unsaved-changes guard) has already had focus put
          // inside that dialog by useKeyboardNav when the menu finishes
          // closing. Radix would then return focus to the trigger, behind the
          // scrim, leaving the pad outside the dialog. Keep it in the dialog,
          // and give it back to the trigger once the dialog closes.
          onCloseAutoFocus={event => {
            const overlay = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.modal-overlay, [data-focus-trap="true"]')
            if (!overlay) return
            event.preventDefault()
            const trigger = triggerRef.current
            const observer = new MutationObserver(() => {
              if (overlay.isConnected) return
              observer.disconnect()
              const active = document.activeElement
              if (trigger?.isConnected && (!active || active === document.body)) trigger.focus()
            })
            observer.observe(document.body, { childList: true, subtree: true })
          }}
          // Focus lands on the current value rather than the first row
          // (HANDOFF.md, "Focus model"), synchronously as focus enters the list.
          // Radix runs this before its own entry focus and skips that when
          // the default is prevented.
          onFocus={event => {
            if (event.target !== event.currentTarget) return
            const current = event.currentTarget.querySelector<HTMLElement>('[data-current="true"]:not([data-disabled])')
            if (current) { event.preventDefault(); current.focus() }
          }}
          onKeyDown={event => {
            // Y focuses search, the way the capsule says it does.
            if (search && (event.key === 'y' || event.key === 'Y') && document.activeElement !== searchRef.current) {
              event.preventDefault()
              searchRef.current?.focus()
            }
          }}
        >
          {search && (
            <div className={styles.search}>
              <Icon name="search" size={16} />
              <input
                ref={searchRef}
                type="search"
                value={search.value}
                placeholder={search.placeholder}
                aria-label={search.placeholder}
                onChange={event => search.onChange(event.target.value)}
                // Radix menus treat letters as typeahead; while typing here
                // they belong to the field. Arrows still move into the list.
                onKeyDown={event => {
                  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation()
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    contentRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')?.focus()
                  }
                }}
              />
            </div>
          )}
          {renderItems(items)}
          {!hasItems && empty && <div className={styles.empty}>{empty}</div>}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  )
}
