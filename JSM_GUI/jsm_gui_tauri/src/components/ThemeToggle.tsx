import { useTranslation } from 'react-i18next'
import styles from './ThemeToggle.module.css'
import { useTheme, type Theme } from '../hooks/useTheme'

type ThemeToggleProps = {
  compact?: boolean
  className?: string
}

// Theme (Preferences 16j): a setting row with a Dark / Light / System
// segmented control. System follows the OS and re-evaluates when it changes.
export function ThemeToggle({ compact = false, className = '' }: ThemeToggleProps) {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const options: { value: Theme; label: string }[] = [
    { value: 'dark', label: t('theme.dark') },
    { value: 'light', label: t('theme.light') },
    { value: 'system', label: t('theme.system', 'System') },
  ]

  return (
    <div className={`${styles.row} ${compact ? styles.compact : ''} ${className}`.trim()} data-hints="MOVE:Choose;A:Select;B:Back">
      {!compact && <span className={styles.text}>{t('theme.label', 'Theme')}</span>}
      <div className="segmented" role="radiogroup" aria-label={t('theme.label', 'Theme')}>
        {options.map(option => (
          <button key={option.value} type="button" role="radio" aria-checked={theme === option.value}
            onClick={() => setTheme(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
