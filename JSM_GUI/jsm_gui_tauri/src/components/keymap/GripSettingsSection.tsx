import { useTranslation } from 'react-i18next'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'
import { GRIP_FIRMWARE_DEFAULT } from '../../hooks/useGripConfig'
import { HAPTIC_EFFECTS } from '../../utils/hapticBindings'
import { NumberField } from '../NumberField'
import { AppSelect } from '../ui/AppSelect'
import { HelpButton } from '../HelpButton'
import { gripRangePercent, gripGuardPercent, gripRangeRaw, gripGuardRaw } from '../../utils/gripCalibration'

type Props = {
  leftGripHaptics?: boolean
  rightGripHaptics?: boolean
  onLeftGripHapticsChange?: (enabled: boolean) => void
  onRightGripHapticsChange?: (enabled: boolean) => void
  gripSensorRange?: number
  gripFlickerGuard?: number
  gripHapticIntensity?: number
  gripHapticEffect?: string
  gripReleaseHapticIntensity?: number
  gripReleaseHapticEffect?: string
  onGripSensorRangeChange?: (v: string) => void
  onGripFlickerGuardChange?: (v: string) => void
  onGripHapticIntensityChange?: (v: string) => void
  onGripHapticEffectChange?: (v: string) => void
  onGripReleaseHapticIntensityChange?: (v: string) => void
  onGripReleaseHapticEffectChange?: (v: string) => void
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

// Mirrors Steam Input's Grip Sensor Calibration page: a Range and a Flicker
// Guard, both written to the controller. The verified firmware settings path
// applies this pair to both sensors; automatic haptics can be gated per side.
export function GripSettingsSection(props: Props) {
  const { t } = useTranslation()
  const range = props.gripSensorRange ?? GRIP_FIRMWARE_DEFAULT
  const guard = props.gripFlickerGuard ?? GRIP_FIRMWARE_DEFAULT
  const haptic = props.gripHapticIntensity ?? 0
  const hapticEffect = props.gripHapticEffect ?? 'CLICK'
  const releaseHaptic = props.gripReleaseHapticIntensity ?? 0
  const releaseHapticEffect = props.gripReleaseHapticEffect ?? 'CLICK'
  const inherited = t('keymap.gripKeepCurrent', 'Keep controller setting')

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
          <details><summary className="binding-summary">Advanced Calibration</summary>
          <NumberField layout="inline"
            label={t('keymap.gripSensorRange', 'Grip sensor range')}
            value={gripRangePercent(range)}
            onChange={v => props.onGripSensorRangeChange?.(gripRangeRaw(v))}
            min={0}
            max={100}
            step={1}
            coarseStep={10}
            defaultValue={80}
            unit="%"
            placeholder={inherited}
            hint={t('keymap.gripCalibrationHint')}
          />
          <NumberField layout="inline"
            label={t('keymap.gripFlickerGuard', 'Flicker guard size')}
            value={gripGuardPercent(guard)}
            onChange={v => props.onGripFlickerGuardChange?.(gripGuardRaw(v))}
            min={0}
            max={100}
            step={1}
            coarseStep={10}
            defaultValue={27}
            unit="%"
            placeholder={inherited}
            hint={t('keymap.gripCalibrationHint')}
          />
          </details>
          <h3>Feedback</h3>
          <div className={styles.gripHapticSides}>
            <span className={styles.settingLabel}>
              {t('keymap.gripHapticSensors', 'Haptic feedback')}
              <HelpButton title={t('keymap.gripHapticSensors', 'Haptic feedback')}>
                {t('keymap.gripHapticSensorsHint')}
              </HelpButton>
            </span>
            <label>
              <input type="checkbox" checked={props.leftGripHaptics ?? true}
                onChange={e => props.onLeftGripHapticsChange?.(e.target.checked)} />
              {t('keymap.leftGripHaptics', 'Left grip')}
            </label>
            <label>
              <input type="checkbox" checked={props.rightGripHaptics ?? true}
                onChange={e => props.onRightGripHapticsChange?.(e.target.checked)} />
              {t('keymap.rightGripHaptics', 'Right grip')}
            </label>
          </div>
          <NumberField layout="inline"
            label={t('keymap.gripHapticIntensity', 'Grip haptic')}
            value={haptic}
            onChange={v => props.onGripHapticIntensityChange?.(v)}
            min={0}
            max={100}
            step={1}
            hint={t('keymap.gripHapticHint')}
          />
          <label>
            {t('keymap.gripHapticEffect', 'Grip haptic effect')}
            <AppSelect
              className="app-select"
              value={hapticEffect}
              disabled={haptic === 0}
              onChange={e => props.onGripHapticEffectChange?.(e.target.value)}
            >
              {HAPTIC_EFFECTS.filter(effect => effect !== 'OFF').map(effect => (
                <option key={effect} value={effect}>{t(`keymap.hapticEffect_${effect}`)}</option>
              ))}
            </AppSelect>
          </label>
          <NumberField layout="inline"
            label={t('keymap.gripReleaseHapticIntensity', 'Grip release haptic')}
            value={releaseHaptic}
            onChange={v => props.onGripReleaseHapticIntensityChange?.(v)}
            min={0}
            max={100}
            step={1}
            hint={t('keymap.gripReleaseHapticHint')}
          />
          <label>
            {t('keymap.gripReleaseHapticEffect', 'Grip release haptic effect')}
            <AppSelect
              className="app-select"
              value={releaseHapticEffect}
              disabled={releaseHaptic === 0}
              onChange={e => props.onGripReleaseHapticEffectChange?.(e.target.value)}
            >
              {HAPTIC_EFFECTS.filter(effect => effect !== 'OFF').map(effect => (
                <option key={effect} value={effect}>{t(`keymap.hapticEffect_${effect}`)}</option>
              ))}
            </AppSelect>
          </label>
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
