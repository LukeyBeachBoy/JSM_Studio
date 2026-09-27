import { useEffect, useRef } from 'react'
import { SectionActions } from './SectionActions'
import styles from './ConfigEditor.module.css'

type ConfigEditorProps = {
  value: string
  label: string
  disabled?: boolean
  hasPendingChanges: boolean
  statusMessage?: string | null
  onChange: (value: string) => void
  onApply: () => void
  onCancel: () => void
  /** Select this line and bring it into view; the nonce repeats a jump to the same line. */
  focusLine?: { line: number; nonce: number } | null
}

export function ConfigEditor({
  value,
  label,
  disabled = false,
  hasPendingChanges,
  statusMessage,
  onChange,
  onApply,
  onCancel,
  focusLine,
}: ConfigEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const textarea = textareaRef.current
    if (!focusLine || !textarea) return
    const lines = textarea.value.split('\n')
    const index = Math.min(Math.max(0, focusLine.line - 1), Math.max(0, lines.length - 1))
    const start = lines.slice(0, index).reduce((total, text) => total + text.length + 1, 0)
    textarea.focus()
    textarea.setSelectionRange(start, start + (lines[index]?.length ?? 0))
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20
    textarea.scrollTop = Math.max(0, index * lineHeight - textarea.clientHeight / 3)
  }, [focusLine])
  return (
    <section className={`${styles.configPanel} config-panel`}>
      <label>
        {label}
        <textarea ref={textareaRef} value={value} onChange={(e) => onChange(e.target.value)} rows={12} disabled={disabled} />
      </label>
      <SectionActions
        standalone
        className={`${styles.configActions} config-actions`}
        hasPendingChanges={hasPendingChanges}
        statusMessage={statusMessage}
        onApply={onApply}
        onCancel={onCancel}
        applyDisabled={disabled}
      />
    </section>
  )
}
