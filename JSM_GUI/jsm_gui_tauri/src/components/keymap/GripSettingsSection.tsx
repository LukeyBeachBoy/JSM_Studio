import { useTranslation } from 'react-i18next'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'
import { GRIP_RANGE_FIRMWARE_DEFAULT } from '../../hooks/useGripConfig'

type Props = {
  leftGripRange?: number
  rightGripRange?: number
  onLeftGripRangeChange?: (v: string) => void
  onRightGripRangeChange?: (v: string) => void
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

// One control per hand, because the grip range genuinely is per hand -- the
// controller stores a separate squeeze threshold for each side. There is no
// second "hysteresis" control here: the grip arrives as one bit with one
// threshold behind it, and a host-side gate on an already-quantized bit can
// only add latency, not sensitivity.
export function GripSettingsSection(props: Props) {
  const { t } = useTranslation()
  const left = props.leftGripRange ?? GRIP_RANGE_FIRMWARE_DEFAULT
  const right = props.rightGripRange ?? GRIP_RANGE_FIRMWARE_DEFAULT
  const show = (v: number) => (v < 0 ? t('keymap.gripRangeDefault', 'Controller default') : String(Math.round(v)))
  return (
    <>
      <KeymapSection
        title={t('keymap.gripSettingsTitle', 'Grip sensors')}
        description={t(
          'keymap.gripSettingsDescription',
          'How hard each grip must be squeezed to register. Set in the controller itself, per hand -- you do not hold both sides with the same squeeze.'
        )}
      >
        <div className={styles.touchpadSettings}>
          <label>
            {t('keymap.leftGripRange', 'Left grip range')}
            <input
              type="number"
              min="-1"
              max="32767"
              step="1"
              value={left}
              onChange={e => props.onLeftGripRangeChange?.(e.target.value)}
            />
            <span className={styles.settingReadout}>{show(left)}</span>
          </label>
          <label>
            {t('keymap.rightGripRange', 'Right grip range')}
            <input
              type="number"
              min="-1"
              max="32767"
              step="1"
              value={right}
              onChange={e => props.onRightGripRangeChange?.(e.target.value)}
            />
            <span className={styles.settingReadout}>{show(right)}</span>
          </label>
          <p className={styles.touchpadHint}>
            {t(
              'keymap.gripRangeHint',
              'Raw firmware units, the same setting Steam Input drives. Lower means a lighter squeeze is enough. -1 keeps the controller’s own value.'
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
