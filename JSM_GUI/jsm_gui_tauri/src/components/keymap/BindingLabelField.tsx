import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import keymapStyles from '../Keymap.module.css'

type Props = {
  value?: string
  onChange: (label: string) => void
  className?: string
  placeholder?: string
}

/**
 * Your own name for what an input does (Binding Editor 7a, the text field in
 * a command row). Committed on blur or Enter; Escape puts the old name back.
 * The caller supplies the individual command name or the menu item label.
 */
export function BindingLabelField({ value, onChange, className = '', placeholder }: Props) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value ?? '')
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])
  return (
    <input
      className={`${keymapStyles.buttonLabelInput} ${className}`.trim()}
      type="text"
      value={draft}
      placeholder={placeholder ?? t('keymap.bindingLabelPlaceholder', 'Name this action')}
      aria-label={t('keymap.bindingLabel', 'Action name')}
      data-capture-ignore="true"
      onFocus={() => setEditing(true)}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false)
        if (draft !== (value ?? '')) onChange(draft)
      }}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value ?? '')
          setEditing(false)
          event.currentTarget.blur()
        }
      }}
    />
  )
}
