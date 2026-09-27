import { useScopedActions } from '../hooks/configContext'
import { useTranslation } from 'react-i18next'

type SectionActionsProps = {
  className?: string
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel?: () => void
  applyDisabled?: boolean
  applyLabel?: string
  cancelLabel?: string
  pendingMessage?: string
  /**
   * Only dialogs with their own commit render these now (the source editor,
   * calibration, the RWC guide). On a page, saving and applying is the title
   * bar's one state button (console refinement D5, §5), so a section's own
   * Save / Cancel pair renders nothing.
   */
  standalone?: boolean
}

export function SectionActions({
  className = 'control-actions',
  hasPendingChanges,
  statusMessage,
  onApply,
  onCancel,
  applyDisabled = false,
  applyLabel,
  cancelLabel,
  pendingMessage,
  standalone = false,
}: SectionActionsProps) {
  const { t } = useTranslation()
  const scoped = useScopedActions(hasPendingChanges, onCancel)
  hasPendingChanges = scoped.dirty
  onCancel = scoped.cancel
  if (!hasPendingChanges || !standalone) return null

  return (
    <div className={className}>
      <button className="primary-btn" onClick={onApply} disabled={applyDisabled}>
        {applyLabel ?? t('common.save')}
      </button>
      {hasPendingChanges ? (
        <>
          {onCancel && (
            <button className="ghost-btn" onClick={onCancel}>
              {cancelLabel ?? t('common.cancel')}
            </button>
          )}
          <span className="pill pill--warning">{pendingMessage ?? 'Unsaved changes'}</span>
        </>
      ) : statusMessage ? (
        <span className="pill pill--success">{statusMessage}</span>
      ) : null}
    </div>
  )
}
