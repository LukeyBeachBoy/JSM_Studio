import { ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import keymapStyles from '../Keymap.module.css'

type ButtonMappingCardProps = {
  title: string
  description: string
  isCapturing: boolean
  commands: ReactNode
  addControl: ReactNode
  extras?: ReactNode
  /** Your own name for what this input does; shown on the Overview diagram. */
  label?: string
  onLabelChange?: (label: string) => void
}

export function ButtonMappingCard({
  title,
  description,
  isCapturing,
  commands,
  addControl,
  extras,
  label,
  onLabelChange,
}: ButtonMappingCardProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(label ?? '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(label ?? '')
  }, [label, editing])

  return (
    <div className={`${keymapStyles.keymapRow} ${isCapturing ? keymapStyles.keymapRowCapturing : ''}`}>
      <div className={keymapStyles.keymapLabel}>
        <span className={keymapStyles.buttonName}>{title}</span>
        <span className={keymapStyles.buttonMeta}>{description}</span>
        {onLabelChange && (
          <input
            className={keymapStyles.buttonLabelInput}
            type="text"
            value={draft}
            placeholder={t('keymap.bindingLabelPlaceholder', 'Name this action')}
            aria-label={t('keymap.bindingLabel', 'Action name')}
            data-capture-ignore="true"
            onFocus={() => setEditing(true)}
            onChange={event => setDraft(event.target.value)}
            onBlur={() => {
              setEditing(false)
              if (draft !== (label ?? '')) onLabelChange(draft)
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                setDraft(label ?? '')
                setEditing(false)
                event.currentTarget.blur()
              }
            }}
          />
        )}
      </div>
      <div className={keymapStyles.commandList}>
        {commands}
        {addControl}
        {extras}
      </div>
    </div>
  )
}
