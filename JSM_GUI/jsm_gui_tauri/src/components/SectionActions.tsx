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
}: SectionActionsProps) {
  const { t } = useTranslation()
  const scoped = useScopedActions(hasPendingChanges, onCancel)
  hasPendingChanges = scoped.dirty
  onCancel = scoped.cancel
  if (!hasPendingChanges) return null

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
