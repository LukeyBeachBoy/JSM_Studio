import { OPTION_HELP } from '../../utils/optionHelp'
import { Fragment, useCallback, useLayoutEffect, useId, useRef, useState, type ReactNode } from 'react'
import * as RadixSelect from '@radix-ui/react-select'
import styles from './Select.module.css'

// Kept in step with .description in Select.module.css.
const HELP_PANEL_WIDTH = 320
const HELP_PANEL_GAP = 8
// The whole surface stays 16px inside the window (HANDOFF.md, placement rule).
const VIEWPORT_MARGIN = 16

export type SelectOption = {
  value: string
  label: string
  /** Optional glyph or icon rendered before the label, in the trigger and the list. */
  icon?: ReactNode
  description?: string
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
  /** Wide list with descriptions beneath every option. */
  inlineDescriptions?: boolean
  placeholder?: string
  disabled?: boolean
  className?: string
  ariaLabel?: string
  ariaDescribedBy?: string
  /** Hover tooltip on the trigger, matching the native select's `title`. */
  title?: string
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
  inlineDescriptions = false,
  disabled,
  className = '',
  ariaLabel,
  ariaDescribedBy,
  title,
  id,
}: SelectProps) {
  const descriptionId = useId()
  let resolved: SelectGroup[] = groups ?? [{ options: options ?? [] }]
  // A hand-written or newer mapper value must remain visible and selectable.
  // Showing a blank trigger hides configuration that the app did not create.
  if (value && !resolved.some(group => group.options.some(option => option.value === value))) {
    resolved = [...resolved, { options: [{ value, label: value }] }]
  }
  const flat = resolved.flatMap(group => group.options)
  const active = flat.find(option => option.value === value)
  const [helpValue, setHelpValue] = useState(value)
  const helpOption = flat.find(option => option.value === helpValue) ?? active
  const description = helpOption?.description ?? OPTION_HELP[helpOption?.value ?? '']

  // The help panel is positioned out of the popup's flow, so a long description
  // can never change the popup's height and shuffle the options out from under
  // the pointer. Which side it sits on is decided once, when the list opens:
  // the width is fixed, so nothing after that can change the answer.
  const [helpSide, setHelpSide] = useState<'right' | 'left' | 'bottom'>('right')
  // Docked below, the panel is wider than a short list; a list that ends near
  // the window's right edge would push it off, so it slides left to fit.
  const [helpShift, setHelpShift] = useState(0)
  const [open, setOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const placeHelpPanel = useCallback(() => {
    const node = contentRef.current
    if (!node) return
    // Prefer the right, then the left; dock below only when neither side
    // has enough room for a readable panel inside the viewport margin.
    const { left, right, width } = node.getBoundingClientRect()
    const requiredSpace = HELP_PANEL_WIDTH + HELP_PANEL_GAP + VIEWPORT_MARGIN
    const side = window.innerWidth - right >= requiredSpace
      ? 'right'
      : left >= requiredSpace ? 'left' : 'bottom'
    setHelpSide(side)
    const panelWidth = Math.max(HELP_PANEL_WIDTH, width)
    setHelpShift(side !== 'bottom' ? 0 : Math.min(0, window.innerWidth - VIEWPORT_MARGIN - (left + panelWidth)))
  }, [])
  // Measured a frame after opening, not in the Content's ref. Radix positions a
  // popper with Floating UI *after* it mounts, so a ref callback measures the
  // list where it has not been put yet -- which read as "acres of room on the
  // right" every time, and the panel went right and off the screen even when
  // the list ended a few pixels from the window edge.
  useLayoutEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(placeHelpPanel)
    return () => cancelAnimationFrame(frame)
  }, [open, placeHelpPanel])

  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled} onOpenChange={next => { setOpen(next); if (next) setHelpValue(value) }}>
      <RadixSelect.Trigger className={`${styles.trigger} ${className}`.trim()} aria-label={ariaLabel} aria-describedby={ariaDescribedBy} title={title} id={id}
        // Radix opens a closed trigger on Up/Down. Here Up/Down walk to the
        // neighbouring control instead, so the pad can pass a row of selects
        // without opening each one; A / Enter / Space open the list.
        onKeyDown={event => {
          if (open || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
          event.preventDefault()
          window.dispatchEvent(new CustomEvent('jsm:navigate-direction', { detail: event.key }))
        }}>
        <span className={styles.value}>
          {active?.icon && <span className={styles.icon}>{active.icon}</span>}
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon>
          <Chevron />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content ref={contentRef} className={`${styles.content} ${inlineDescriptions ? styles.descriptiveContent : ''}`} position="popper" sideOffset={4}>
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
                    aria-label={inlineDescriptions ? option.label : undefined}
                    aria-describedby={inlineDescriptions && option.description ? descriptionId + option.value : undefined}
                    disabled={option.disabled}
                    className={`${styles.item} ${inlineDescriptions ? styles.descriptiveItem : ''}`}
                    onFocus={() => setHelpValue(option.value)}
                    onPointerMove={() => setHelpValue(option.value)}
                  >
                    <span className={styles.itemIndicator}>
                      <RadixSelect.ItemIndicator>
                        <Check />
                      </RadixSelect.ItemIndicator>
                    </span>
                    {option.icon && <span className={styles.icon}>{option.icon}</span>}
                    <span className={inlineDescriptions ? styles.optionBody : undefined}>
                      <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                      {inlineDescriptions && (option.description ?? OPTION_HELP[option.value]) && <span id={descriptionId + option.value} className={styles.optionDescription}>{option.description ?? OPTION_HELP[option.value]}</span>}
                    </span>
                    {option.hint && <span className={styles.itemHint}>{option.hint}</span>}
                  </RadixSelect.Item>
                ))}
              </Fragment>
            ))}
          </RadixSelect.Viewport>
          {description && !inlineDescriptions && (
            <div className={`${styles.description} ${styles[helpSide]}`} style={helpSide === 'bottom' && helpShift ? { left: helpShift } : undefined} aria-live="polite">
              <strong>{helpOption?.label}</strong>
              <p>{description}</p>
            </div>
          )}
          <RadixSelect.ScrollDownButton className={styles.scrollButton}>▼</RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
