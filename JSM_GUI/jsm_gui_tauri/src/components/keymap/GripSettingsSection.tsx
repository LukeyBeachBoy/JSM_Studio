import { useTranslation } from 'react-i18next'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'
import { GRIP_FIRMWARE_DEFAULT } from '../../hooks/useGripConfig'

type Props = {
  gripSensorRange?: number
  gripFlickerGuard?: number
  gripHapticIntensity?: number
  onGripSensorRangeChange?: (v: string) => void
  onGripFlickerGuardChange?: (v: string) => void
  onGripHapticIntensityChange?: (v: string) => void
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

// Mirrors Steam Input's Grip Sensor Calibration page: a Range and a Flicker
// Guard, both written to the controller. One pair rather than one per side --
// the firmware has a single capacitive threshold pair, which is why Steam Input
// shows a single pair too.
export function GripSettingsSection(props: Props) {
  const { t } = useTranslation()
  const range = props.gripSensorRange ?? GRIP_FIRMWARE_DEFAULT
  const guard = props.gripFlickerGuard ?? GRIP_FIRMWARE_DEFAULT
  const haptic = props.gripHapticIntensity ?? 0
  const show = (v: number) =>
    v < 0 ? t('keymap.firmwareDefault', 'Controller default') : String(Math.round(v))

  return (
    <>
      <KeymapSection
        title={t('keymap.gripSettingsTitle', 'Grip sensors')}
        description={t(
          'keymap.gripSettingsDescription',
          'The capacitive strips inside the handles detect how near your hands are. These are the same two settings as Steam Input’s Grip Sensor Calibration, and they are stored on the controller.'
        )}
      >
        <div className={styles.touchpadSettings}>
          <label>
            {t('keymap.gripSensorRange', 'Grip sensor range')}
            <input
              type="number" min="-1" max="32767" step="1"
              value={range}
              onChange={e => props.onGripSensorRangeChange?.(e.target.value)}
            />
            <span className={styles.settingReadout}>{show(range)}</span>
          </label>
          <label>
            {t('keymap.gripFlickerGuard', 'Flicker guard size')}
            <input
              type="number" min="-1" max="32767" step="1"
              value={guard}
              onChange={e => props.onGripFlickerGuardChange?.(e.target.value)}
            />
            <span className={styles.settingReadout}>{show(guard)}</span>
          </label>
          <p className={styles.touchpadHint}>
            {t(
              'keymap.gripSensorHint',
              'Range is how near your hand must come before the sensor trips; lower detects your hands sooner. Flicker guard is the extra distance it must move away again before releasing, so a hand resting at the edge of the range cannot chatter on and off. Raw firmware units, and -1 keeps the controller’s own value. This is one setting for both grips: the controller stores a single capacitive threshold, which is why Steam Input also shows one.'
            )}
          </p>
          <label>
            {t('keymap.gripHapticIntensity', 'Grip haptic')}
            <input
              type="range" min="0" max="100" step="1"
              value={haptic}
              onChange={e => props.onGripHapticIntensityChange?.(e.target.value)}
            />
            <span className={styles.settingReadout}>
              {haptic === 0 ? t('keymap.gripHapticOff', 'Off') : String(haptic)}
            </span>
          </label>
          <p className={styles.touchpadHint}>
            {t(
              'keymap.gripHapticHint',
              'A short pulse from the grip’s own actuator the moment that sensor detects your hand. Fires once on detection rather than buzzing for as long as you hold the controller. 0 turns it off.'
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
