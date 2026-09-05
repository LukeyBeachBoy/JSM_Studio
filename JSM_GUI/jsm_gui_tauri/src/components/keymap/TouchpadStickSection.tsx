import { useTranslation } from 'react-i18next'
import { formatStickModeLabel, STICK_MODE_VALUES } from '../../constants/sticks'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'
import { TOUCH_STICK_AXIS_VALUES } from '../../utils/touchpadConfig'
import { NumberField } from '../NumberField'
import { AdvancedDisclosure } from '../AdvancedDisclosure'

type TouchpadStickSectionProps = {
  /** Overrides the generic "Touch stick" heading, e.g. "Left touch stick". */
  title?: string
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
  title,
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
      <KeymapSection title={title ?? t('keymap.touchStickTitle')} description={t('keymap.touchStickDescription')}>
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
          {/* Deadzone/ring/radius/axis only mean anything once the touch stick
              actually has a mode -- same reasoning as hiding a real stick's
              raw direction rows once it has one. Showing four settings that
              do nothing for a mode-less touch stick was a real part of "the
              touchpad config is confusing". */}
          {touchStickMode && (
            <AdvancedDisclosure>
              <div className={styles.touchpadAdvancedGrid}>
                <NumberField
                  label={t('keymap.touchDeadzoneInner')}
                  value={touchDeadzoneInner}
                  onChange={v => onTouchDeadzoneInnerChange?.(v)}
                  min={0}
                  max={500}
                  step={1}
                  placeholder={t('common.defaultPlaceholder')}
                />
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
                <NumberField
                  label={t('keymap.touchStickRadius')}
                  value={touchStickRadius}
                  onChange={v => onTouchStickRadiusChange?.(v)}
                  min={0}
                  max={2000}
                  step={10}
                  placeholder={t('common.defaultPlaceholder')}
                />
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
            </AdvancedDisclosure>
          )}
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
