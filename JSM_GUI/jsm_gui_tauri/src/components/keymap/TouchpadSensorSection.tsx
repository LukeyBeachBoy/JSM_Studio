import { useTranslation } from 'react-i18next'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'

type Props = {
  touchOnThreshold?: number
  touchOffThreshold?: number
  onTouchOnThresholdChange?: (v: string) => void
  onTouchOffThresholdChange?: (v: string) => void
  touchpadMinCutoff?: number
  touchpadSpeedCoeff?: number
  touchpadTrackballDecay?: number
  onTouchpadMinCutoffChange?: (v: string) => void
  onTouchpadSpeedCoeffChange?: (v: string) => void
  onTouchpadTrackballDecayChange?: (v: string) => void
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

// Contact detection is a firmware threshold on the controller, in raw sensor
// units, and -1 means "leave whatever the device already has".
export const FIRMWARE_DEFAULT = -1

// The One Euro filter has two dials and neither is self-explanatory, so the
// combinations that are actually worth using are named. The pair is what the
// backend reads (TOUCHPAD_MIN_CUTOFF / TOUCHPAD_SPEED_COEFF); these are just
// labelled points in that space, and Custom exposes the raw numbers.
//
// Cutoff is the floor: how much smoothing survives when the finger is barely
// moving, in Hz. Lower is smoother and laggier. Speed lifts the cutoff as the
// finger speeds up, so a flick escapes the smoothing that a slow pan needs.
const SMOOTHING_PRESETS = [
  { id: 'off', cutoff: 0, speed: 0 },
  { id: 'light', cutoff: 10, speed: 0.8 },
  { id: 'balanced', cutoff: 6, speed: 0.6 },
  { id: 'heavy', cutoff: 2.5, speed: 0.35 },
] as const

function matchPreset(cutoff: number, speed: number) {
  const hit = SMOOTHING_PRESETS.find(
    p => Math.abs(p.cutoff - cutoff) < 0.001 && Math.abs(p.speed - speed) < 0.0001
  )
  return hit?.id ?? 'custom'
}

export function TouchpadSensorSection(props: Props) {
  const { t } = useTranslation()
  const cutoff = props.touchpadMinCutoff ?? 6.0
  const speed = props.touchpadSpeedCoeff ?? 0.6
  const preset = matchPreset(cutoff, speed)
  const touchOn = props.touchOnThreshold ?? FIRMWARE_DEFAULT
  const touchOff = props.touchOffThreshold ?? FIRMWARE_DEFAULT
  const showDefault = (v: number) =>
    v < 0 ? t('keymap.firmwareDefault', 'Controller default') : String(Math.round(v))

  const applyPreset = (id: string) => {
    const p = SMOOTHING_PRESETS.find(entry => entry.id === id)
    if (!p) return
    props.onTouchpadMinCutoffChange?.(String(p.cutoff))
    props.onTouchpadSpeedCoeffChange?.(String(p.speed))
  }

  return (
    <>
      <KeymapSection
        title={t('keymap.touchSensitivityTitle', 'Trackpad sensitivity')}
        description={t(
          'keymap.touchSensitivityDescription',
          'How light a touch the pads register, and how the cursor is smoothed once they do.'
        )}
      >
        <div className={styles.touchpadSettings}>
          <div className={styles.gridSizeInputs}>
            <label>
              {t('keymap.touchOnThreshold', 'Touch threshold')}
              <input
                type="number" min="-1" max="32767" step="1"
                value={touchOn}
                onChange={e => props.onTouchOnThresholdChange?.(e.target.value)}
              />
              <span className={styles.settingReadout}>{showDefault(touchOn)}</span>
            </label>
            <label>
              {t('keymap.touchOffThreshold', 'Touch release threshold')}
              <input
                type="number" min="-1" max="32767" step="1"
                value={touchOff}
                onChange={e => props.onTouchOffThresholdChange?.(e.target.value)}
              />
              <span className={styles.settingReadout}>{showDefault(touchOff)}</span>
            </label>
          </div>
          <p className={styles.touchpadHint}>
            {t(
              'keymap.touchThresholdHint',
              'Set in the controller itself, the same place Steam Input sets it. Lower the first value to register lighter touches; the gap down to the second is the hysteresis that stops a resting finger chattering. -1 keeps the controller’s own value.'
            )}
          </p>

          <label>
            {t('keymap.touchSmoothing', 'Mouse smoothing')}
            <select
              className="app-select"
              value={preset}
              onChange={e => applyPreset(e.target.value)}
            >
              <option value="off">{t('keymap.smoothingOff', 'Off — raw pad motion (0 / 0)')}</option>
              <option value="light">{t('keymap.smoothingLight', 'Light — sharpest, some jitter (10 / 0.8)')}</option>
              <option value="balanced">{t('keymap.smoothingBalanced', 'Balanced — default (6 / 0.6)')}</option>
              <option value="heavy">{t('keymap.smoothingHeavy', 'Heavy — smoothest slow pans (2.5 / 0.35)')}</option>
              <option value="custom" disabled={preset !== 'custom'}>
                {t('keymap.smoothingCustom', 'Custom')}
              </option>
            </select>
          </label>
          <p className={styles.touchpadHint}>
            {t(
              'keymap.touchSmoothingHint',
              'Smoothing cutoff is the floor, in Hz: how much smoothing survives when your finger is barely moving. Lower is smoother but laggier, and below about 3 a quick swipe visibly trails your finger. Flick responsiveness lifts that cutoff as the finger speeds up, so a fast flick escapes the smoothing a slow pan needs. If the cursor looks jittery during steady movement, go one step heavier; if it feels like it lags behind your finger, go one step lighter.'
            )}
          </p>
          <div className={styles.gridSizeInputs}>
            <label>
              {t('keymap.touchpadMinCutoff', 'Smoothing cutoff (Hz)')}
              <input
                type="number" min="0" max="20" step="0.1"
                value={cutoff}
                onChange={e => props.onTouchpadMinCutoffChange?.(e.target.value)}
              />
            </label>
            <label>
              {t('keymap.touchpadSpeedCoeff', 'Flick responsiveness')}
              <input
                type="number" min="0" max="5" step="0.005"
                value={speed}
                onChange={e => props.onTouchpadSpeedCoeffChange?.(e.target.value)}
              />
            </label>
          </div>

          <label>
            {t('keymap.touchpadTrackballDecay', 'Trackball glide decay')}
            <input
              type="range" min="0" max="60" step="1"
              value={props.touchpadTrackballDecay ?? 0}
              onChange={e => props.onTouchpadTrackballDecayChange?.(e.target.value)}
            />
            <span className={styles.settingReadout}>{props.touchpadTrackballDecay ?? 0}</span>
          </label>
          <p className={styles.touchpadHint}>
            {t(
              'keymap.touchpadTrackballDecayHint',
              '0 stops the cursor the instant your finger leaves the pad, matching Steam Input’s Mouse style. Higher values coast briefly after a flick.'
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
