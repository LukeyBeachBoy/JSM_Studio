import { useTranslation } from 'react-i18next'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'
import { GRIP_FIRMWARE_DEFAULT } from '../../hooks/useGripConfig'
import { HAPTIC_EFFECTS } from '../../utils/hapticBindings'
import { NumberField } from '../NumberField'
import { AppSelect } from '../ui/AppSelect'
import { gripRangePercent, gripGuardPercent, gripRangeRaw, gripGuardRaw } from '../../utils/gripCalibration'

type Props = {
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
// Guard, both written to the controller. One pair rather than one per side --
// the firmware has a single capacitive threshold pair, which is why Steam Input
// shows a single pair too.
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
            hint={range < 0 ? inherited : undefined}
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
            hint={guard < 0 ? inherited : undefined}
          />
          <p className={styles.touchpadHint}>
            {t(
              'keymap.gripCalibrationHint',
              'Lower range requires closer contact, so a small finger lift can release the grip. Lower flicker guard releases sooner; raise it slightly if contact flickers. Both settings affect both grips. Clear a field to leave that controller setting unchanged. Save and Apply the configuration to test changes.'
            )}
          </p>
          <NumberField layout="inline"
            label={t('keymap.gripHapticIntensity', 'Grip haptic')}
            value={haptic}
            onChange={v => props.onGripHapticIntensityChange?.(v)}
            min={0}
            max={100}
            step={1}
            hint={haptic === 0 ? t('keymap.gripHapticOff', 'Off') : undefined}
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
          <p className={styles.touchpadHint}>
            {t(
              'keymap.gripHapticHint',
              'A short pulse from the grip’s own actuator the moment that sensor detects your hand. Fires once on detection rather than buzzing for as long as you hold the controller. 0 turns it off. Click is the tap Steam Input plays while calibrating the grip sensors; the other effects are the controller’s own, and any of them can be bound to any input from the Buttons pages.'
            )}
          </p>
          <NumberField layout="inline"
            label={t('keymap.gripReleaseHapticIntensity', 'Grip release haptic')}
            value={releaseHaptic}
            onChange={v => props.onGripReleaseHapticIntensityChange?.(v)}
            min={0}
            max={100}
            step={1}
            hint={releaseHaptic === 0 ? t('keymap.gripHapticOff', 'Off') : undefined}
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
          <p className={styles.touchpadHint}>
            {t(
              'keymap.gripReleaseHapticHint',
              'The same kind of pulse, but for the moment your hand pulls away instead of the moment it arrives. Independent from the contact pulse above, so you can run one without the other, or tune them to feel different. Off by default.'
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
