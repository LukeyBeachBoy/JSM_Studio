import { Children, isValidElement, type ReactNode } from 'react'
import { Select, type SelectGroup, type SelectOption } from './Select'

// A drop-in replacement for `<select className="app-select">`. It takes the same
// props and the same `<option>` / `<optgroup>` children, and renders the Radix
// Select underneath, so a native dropdown never opens the operating system's own
// unstyleable list. Call sites keep their existing shape; only the tag changes.

type ChangeLike = { target: { value: string } }

type AppSelectProps = {
  value?: string | number
  onChange?: (event: ChangeLike) => void
  disabled?: boolean
  className?: string
  children?: ReactNode
  id?: string
  title?: string
  'aria-label'?: string
  'data-testid'?: string
  /** Kept so existing `data-capture-ignore` call sites type-check unchanged. */
  'data-capture-ignore'?: string
}

type OptionElementProps = {
  value?: string | number
  disabled?: boolean
  children?: ReactNode
  label?: string
}

/** `<option>` children are text nodes; flatten them to the label string. */
const textOf = (node: ReactNode): string => {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

const toOption = (node: ReactNode): SelectOption | null => {
  if (!isValidElement(node)) return null
  const props = node.props as OptionElementProps
  return {
    value: String(props.value ?? ''),
    label: textOf(props.children) || props.label || String(props.value ?? ''),
    disabled: props.disabled,
  }
}

export function AppSelect({
  value,
  onChange,
  disabled,
  className,
  children,
  id,
  title,
  'aria-label': ariaLabel,
}: AppSelectProps) {
  const groups: SelectGroup[] = []
  let loose: SelectOption[] = []

  Children.forEach(children, child => {
    if (!isValidElement(child)) return
    if (child.type === 'optgroup') {
      // Flush anything collected before this group so ordering is preserved.
      if (loose.length) {
        groups.push({ options: loose })
        loose = []
      }
      const groupProps = child.props as OptionElementProps & { label?: string }
      const options = Children.map(groupProps.children, toOption)?.filter((o): o is SelectOption => Boolean(o)) ?? []
      groups.push({ label: groupProps.label, options })
      return
    }
    const option = toOption(child)
    if (option) loose.push(option)
  })
  if (loose.length) groups.push({ options: loose })

  const flat = groups.flatMap(group => group.options)
  // A native select shows its first option when the value matches nothing; an
  // empty-valued option is the usual "no selection" row, so it doubles as the
  // placeholder rather than rendering as a blank row you can pick.
  const placeholderOption = flat.find(option => option.value === '')
  // Radix reserves the empty string for its placeholder. Keep the native
  // option selectable through a private sentinel, translating at the boundary.
  let emptyValue = '__jsm_empty__'
  while (flat.some(option => option.value === emptyValue)) emptyValue += '_'
  const visibleGroups = groups.map(group => ({ ...group, options: group.options.map(option =>
    option.value === '' ? { ...option, value: emptyValue } : option) }))

  return (
    <Select
      value={String(value ?? '') || (placeholderOption ? emptyValue : '')}
      onValueChange={next => onChange?.({ target: { value: next === emptyValue ? '' : next } })}
      groups={visibleGroups}
      placeholder={placeholderOption?.label}
      disabled={disabled}
      className={className}
      ariaLabel={ariaLabel}
      title={title}
      id={id}
    />
  )
}
