import { useTranslation } from 'react-i18next'
import { formatStickModeLabel, STICK_MODE_VALUES } from '../../constants/sticks'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'
import { TOUCH_STICK_AXIS_VALUES } from '../../utils/touchpadConfig'

type TouchpadStickSectionProps = {
  touchStickMode: string
  touchDeadzoneInner: string
  touchRingMode: string
  touchStickRadius: string
  touchStickAxis: string
  onTouchStickModeChange?: (value: string) => void
  onTouchDeadzoneInnerChange?: (value: string) => void
  onTouchRingModeChange?: (value: string) => void
  onTouchStickRadiusChange?: (value: string) => void
  onTouchStickAxisChange?: (value: string) => void
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

export function TouchpadStickSection({
  touchStickMode,
  touchDeadzoneInner,
  touchRingMode,
  touchStickRadius,
  touchStickAxis,
  onTouchStickModeChange,
  onTouchDeadzoneInnerChange,
  onTouchRingModeChange,
  onTouchStickRadiusChange,
  onTouchStickAxisChange,
  hasPendingChanges,
  statusMessage,
  onApply,
  onCancel,
  applyDisabled,
}: TouchpadStickSectionProps) {
  const { t } = useTranslation()
  const hasCustomMode = Boolean(touchStickMode && !STICK_MODE_VALUES.includes(touchStickMode as (typeof STICK_MODE_VALUES)[number]))
  const hasCustomAxis = Boolean(touchStickAxis && !(TOUCH_STICK_AXIS_VALUES as readonly string[]).includes(touchStickAxis))
  const hasCustomRingMode = Boolean(touchRingMode && !['INNER', 'OUTER'].includes(touchRingMode))

  return (
    <>
      <KeymapSection title={t('keymap.touchStickTitle')} description={t('keymap.touchStickDescription')}>
        <div className={styles.touchpadSettings}>
          <label>
            {t('keymap.touchStickMode')}
            <select className="app-select" value={touchStickMode} onChange={(event) => onTouchStickModeChange?.(event.target.value)}>
              <option value="">{t('common.noneSelected')}</option>
              {STICK_MODE_VALUES.map(mode => (
                <option key={mode} value={mode}>
                  {formatStickModeLabel(mode, t)}
                </option>
              ))}
              {hasCustomMode && (
                <option value={touchStickMode}>{t('keymap.currentRawValue', { value: touchStickMode })}</option>
              )}
            </select>
          </label>
          <div className={styles.touchpadAdvancedGrid}>
            <label>
              {t('keymap.touchDeadzoneInner')}
              <input
                type="number"
                min="0"
                step="1"
                value={touchDeadzoneInner}
                onChange={(event) => onTouchDeadzoneInnerChange?.(event.target.value)}
                placeholder={t('common.defaultPlaceholder')}
              />
            </label>
            <label>
              {t('stickModes.ringMode')}
              <select className="app-select" value={touchRingMode} onChange={(event) => onTouchRingModeChange?.(event.target.value)}>
                <option value="">{t('common.defaultPlaceholder')}</option>
                <option value="INNER">{t('stickModes.inner')}</option>
                <option value="OUTER">{t('stickModes.outer')}</option>
                {hasCustomRingMode && (
                  <option value={touchRingMode}>{t('keymap.currentRawValue', { value: touchRingMode })}</option>
                )}
              </select>
            </label>
            <label>
              {t('keymap.touchStickRadius')}
              <input
                type="number"
                min="0"
                step="1"
                value={touchStickRadius}
                onChange={(event) => onTouchStickRadiusChange?.(event.target.value)}
                placeholder={t('common.defaultPlaceholder')}
              />
            </label>
            <label>
              {t('keymap.touchStickAxis')}
              <select className="app-select" value={touchStickAxis} onChange={(event) => onTouchStickAxisChange?.(event.target.value)}>
                <option value="">{t('common.defaultValue', { value: 'STANDARD' })}</option>
                {TOUCH_STICK_AXIS_VALUES.map(mode => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
                {hasCustomAxis && (
                  <option value={touchStickAxis}>{t('keymap.currentRawValue', { value: touchStickAxis })}</option>
                )}
              </select>
            </label>
          </div>
          <p className={styles.touchpadHint}>{t('keymap.touchStickHint')}</p>
        </div>
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
