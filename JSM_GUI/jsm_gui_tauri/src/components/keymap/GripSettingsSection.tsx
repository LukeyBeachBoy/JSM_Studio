import { useTranslation } from 'react-i18next'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'

type Props = {
  gripThreshold?: number
  gripHysteresis?: number
  onGripThresholdChange?: (v: string) => void
  onGripHysteresisChange?: (v: string) => void
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

export function GripSettingsSection(props: Props) {
  const { t } = useTranslation()
  const threshold = props.gripThreshold ?? 0.5
  const hysteresis = props.gripHysteresis ?? 0.08
  const releasePoint = Math.max(0, threshold - hysteresis)
  return (
    <>
      <KeymapSection
        title={t('keymap.gripSettingsTitle', 'Grip sensors')}
        description={t('keymap.gripSettingsDescription', 'How far the grips must be squeezed to register, and how much they must relax before releasing.')}
      >
        <div className={styles.touchpadSettings}>
          <label>
            {t('keymap.gripThreshold', 'Squeeze distance')}
            <input type="range" min="0" max="1" step="0.01" value={threshold} onChange={e => props.onGripThresholdChange?.(e.target.value)} />
            <span>{threshold.toFixed(2)}</span>
          </label>
          <label>
            {t('keymap.gripHysteresis', 'Hysteresis')}
            <input type="range" min="0" max="0.5" step="0.01" value={hysteresis} onChange={e => props.onGripHysteresisChange?.(e.target.value)} />
            <span>{hysteresis.toFixed(2)}</span>
          </label>
          <p className={styles.touchpadHint}>
            {t(
              'keymap.gripHysteresisHint',
              'Releases at {{releasePoint}}, not {{threshold}} -- resting exactly on the threshold can\'t make the grip chatter on and off.',
              { releasePoint: releasePoint.toFixed(2), threshold: threshold.toFixed(2) }
            )}
          </p>
        </div>
      </KeymapSection>
      <SectionActions
        className={keymapStyles.keymapSectionActions}
        hasPendingChanges={props.hasPendingChanges}
        statusMessage={props.statusMessage}
        onApply={props.onApply}
        onCancel={props.onCancel}
        applyDisabled={props.applyDisabled}
      />
    </>
  )
}
