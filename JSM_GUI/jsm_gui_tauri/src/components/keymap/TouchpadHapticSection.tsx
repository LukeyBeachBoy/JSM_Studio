import { useTranslation } from 'react-i18next'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'
import { NumberField } from '../NumberField'
import { HAPTIC_EFFECTS } from '../../utils/hapticBindings'
import { AppSelect } from '../ui/AppSelect'

type Props = {
  touchpadHapticIntensity?: number
  touchpadHapticEffect?: string
  touchpadHapticInterval?: number
  touchpadClickHapticIntensity?: number
  touchpadClickHapticEffect?: string
  touchpadReleaseHapticIntensity?: number
  touchpadReleaseHapticEffect?: string
  onTouchpadHapticIntensityChange?: (v: string) => void
  onTouchpadHapticEffectChange?: (v: string) => void
  onTouchpadHapticIntervalChange?: (v: string) => void
  onTouchpadClickHapticIntensityChange?: (v: string) => void
  onTouchpadClickHapticEffectChange?: (v: string) => void
  onTouchpadReleaseHapticIntensityChange?: (v: string) => void
  onTouchpadReleaseHapticEffectChange?: (v: string) => void
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

// The pads have their own actuators, the same ones the grips do. Three
// independent pulses: one that ticks as your finger travels, the way a scroll
// wheel detents, and one for each edge of a pad click. All off by default -- an
// unasked-for buzz on every swipe would be worse than no feature at all.
export function TouchpadHapticSection(props: Props) {
  const { t } = useTranslation()
  const intensity = props.touchpadHapticIntensity ?? 0
  const effect = props.touchpadHapticEffect ?? 'TICK'
  const interval = props.touchpadHapticInterval ?? 250
  const clickIntensity = props.touchpadClickHapticIntensity ?? 0
  const clickEffect = props.touchpadClickHapticEffect ?? 'CLICK'
  const releaseIntensity = props.touchpadReleaseHapticIntensity ?? 0
  const releaseEffect = props.touchpadReleaseHapticEffect ?? 'TICK'

  return (
    <>
      <KeymapSection
        title={t('keymap.touchpadHapticTitle', 'Trackpad haptics')}
        description={t(
          'keymap.touchpadHapticDescription',
          'What each pad’s own actuator does as you move across it and when you press it down. One setting for both pads; each pad pulses for its own finger.'
        )}
      >
        <div className={styles.touchpadSettings}>
          <NumberField layout="inline"
            label={t('keymap.touchpadHapticIntensity', 'Movement haptic')}
            value={intensity}
            onChange={v => props.onTouchpadHapticIntensityChange?.(v)}
            min={0}
            max={100}
            step={1}
            coarseStep={5}
            hint={intensity === 0 ? t('keymap.touchpadHapticOff', 'Off') : undefined}
          />
          <label>
            {t('keymap.touchpadHapticEffect', 'Movement haptic effect')}
            <AppSelect
              className="app-select"
              value={effect}
              disabled={intensity === 0}
              onChange={e => props.onTouchpadHapticEffectChange?.(e.target.value)}
            >
              {HAPTIC_EFFECTS.filter(entry => entry !== 'OFF').map(entry => (
                <option key={entry} value={entry}>{t(`keymap.hapticEffect_${entry}`)}</option>
              ))}
            </AppSelect>
          </label>
          <NumberField layout="inline"
            label={t('keymap.touchpadHapticInterval', 'Tick spacing')}
            value={interval}
            onChange={v => props.onTouchpadHapticIntervalChange?.(v)}
            min={1}
            max={2000}
            step={5}
            coarseStep={50}
            unit="px"
            disabled={intensity === 0}
            hint={t('keymap.touchpadHapticHint')}
          />
          <NumberField layout="inline"
            label={t('keymap.touchpadClickHapticIntensity', 'Click haptic')}
            value={clickIntensity}
            onChange={v => props.onTouchpadClickHapticIntensityChange?.(v)}
            min={0}
            max={100}
            step={1}
            coarseStep={5}
            hint={t('keymap.touchpadClickHapticHint')}
          />
          <label>
            {t('keymap.touchpadClickHapticEffect', 'Click haptic effect')}
            <AppSelect
              className="app-select"
              value={clickEffect}
              disabled={clickIntensity === 0}
              onChange={e => props.onTouchpadClickHapticEffectChange?.(e.target.value)}
            >
              {HAPTIC_EFFECTS.filter(entry => entry !== 'OFF').map(entry => (
                <option key={entry} value={entry}>{t(`keymap.hapticEffect_${entry}`)}</option>
              ))}
            </AppSelect>
          </label>
          <NumberField layout="inline"
            label={t('keymap.touchpadReleaseHapticIntensity', 'Click release haptic')}
            value={releaseIntensity}
            onChange={v => props.onTouchpadReleaseHapticIntensityChange?.(v)}
            min={0}
            max={100}
            step={1}
            coarseStep={5}
            hint={t('keymap.touchpadReleaseHapticHint')}
          />
          <label>
            {t('keymap.touchpadReleaseHapticEffect', 'Click release haptic effect')}
            <AppSelect
              className="app-select"
              value={releaseEffect}
              disabled={releaseIntensity === 0}
              onChange={e => props.onTouchpadReleaseHapticEffectChange?.(e.target.value)}
            >
              {HAPTIC_EFFECTS.filter(entry => entry !== 'OFF').map(entry => (
                <option key={entry} value={entry}>{t(`keymap.hapticEffect_${entry}`)}</option>
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
