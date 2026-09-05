import { Fragment, type ReactNode } from 'react'
import * as RadixSelect from '@radix-ui/react-select'
import styles from './Select.module.css'

export type SelectOption = {
  value: string
  label: string
  /** Optional glyph or icon rendered before the label, in the trigger and the list. */
  icon?: ReactNode
  hint?: string
  disabled?: boolean
}

export type SelectGroup = {
  /** Omit for an unlabelled group; a separator still divides it from the previous one. */
  label?: string
  options: SelectOption[]
}

type SelectProps = {
  value: string
  onValueChange: (value: string) => void
  /** Flat list, or groups when the options need separating (common kinds first, rare ones after). */
  options?: SelectOption[]
  groups?: SelectGroup[]
  placeholder?: string
  disabled?: boolean
  className?: string
  ariaLabel?: string
  id?: string
}

const Chevron = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={styles.chevron}>
    <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Check = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2 6.4 4.6 9 10 3.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Radix Select styled to sit alongside the app's native `.app-select` controls,
// which stay native where a plain list of values is all that's needed. This one
// earns its keep where the list needs grouping, separators or a glyph per row --
// none of which a native <option> can carry.
export function Select({
  value,
  onValueChange,
  options,
  groups,
  placeholder,
  disabled,
  className = '',
  ariaLabel,
  id,
}: SelectProps) {
  const resolved: SelectGroup[] = groups ?? [{ options: options ?? [] }]
  const flat = resolved.flatMap(group => group.options)
  const active = flat.find(option => option.value === value)

  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger className={`${styles.trigger} ${className}`.trim()} aria-label={ariaLabel} id={id}>
        <span className={styles.value}>
          {active?.icon && <span className={styles.icon}>{active.icon}</span>}
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon>
          <Chevron />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content className={styles.content} position="popper" sideOffset={4}>
          <RadixSelect.ScrollUpButton className={styles.scrollButton}>▲</RadixSelect.ScrollUpButton>
          <RadixSelect.Viewport className={styles.viewport}>
            {resolved.map((group, index) => (
              <Fragment key={group.label ?? index}>
                {index > 0 && <RadixSelect.Separator className={styles.separator} />}
                {group.label && <div className={styles.groupLabel}>{group.label}</div>}
                {group.options.map(option => (
                  <RadixSelect.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className={styles.item}
                  >
                    <span className={styles.itemIndicator}>
                      <RadixSelect.ItemIndicator>
                        <Check />
                      </RadixSelect.ItemIndicator>
                    </span>
                    {option.icon && <span className={styles.icon}>{option.icon}</span>}
                    <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                    {option.hint && <span className={styles.itemHint}>{option.hint}</span>}
                  </RadixSelect.Item>
                ))}
              </Fragment>
            ))}
          </RadixSelect.Viewport>
          <RadixSelect.ScrollDownButton className={styles.scrollButton}>▼</RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
