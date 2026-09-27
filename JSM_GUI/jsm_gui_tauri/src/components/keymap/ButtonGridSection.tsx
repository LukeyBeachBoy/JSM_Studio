import { ReactNode } from 'react'
import { KeymapSection } from '../KeymapSection'
import { SectionActions } from '../SectionActions'
import { type ButtonDefinition } from '../../keymap/schema'
import keymapStyles from '../Keymap.module.css'
import { BindingList } from './BindingList'

type ButtonGridSectionProps = {
  title: string
  description: string
  buttons: ButtonDefinition[]
  renderButton: (button: ButtonDefinition) => ReactNode
  /** Sits in the section header, beside the title. */
  action?: ReactNode
  extraContent?: ReactNode
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

export function ButtonGridSection({
  title,
  description,
  buttons,
  renderButton,
  action,
  extraContent,
  hasPendingChanges,
  statusMessage,
  onApply,
  onCancel,
  applyDisabled,
}: ButtonGridSectionProps) {
  return (
    <>
      <KeymapSection title={title} description={description} action={action}>
        <BindingList>
          {buttons.map(button => (
            <div key={button.command}>{renderButton(button)}</div>
          ))}
        </BindingList>
        {extraContent}
      </KeymapSection>
      <SectionActions
        className={keymapStyles.keymapSectionActions}
        hasPendingChanges={hasPendingChanges}
        statusMessage={statusMessage}
        onApply={onApply}
        onCancel={onCancel}
        applyDisabled={applyDisabled}
      />
    </>
  )
}
