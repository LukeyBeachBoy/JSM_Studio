import { useTranslation } from 'react-i18next'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'
import { NumberField } from '../NumberField'
import { AdvancedDisclosure } from '../AdvancedDisclosure'
import { AppSelect } from '../ui/AppSelect'

type Props = {
  touchpadMinCutoff?: number
  touchpadSpeedCoeff?: number
  touchpadTrackballDecay?: number
  touchpadTrackballMinVelocity?: number
  onTouchpadMinCutoffChange?: (v: string) => void
  onTouchpadSpeedCoeffChange?: (v: string) => void
  onTouchpadTrackballDecayChange?: (v: string) => void
  onTouchpadTrackballMinVelocityChange?: (v: string) => void
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

// The One Euro filter has two dials and neither is self-explanatory, so the
// combinations that are actually worth using are named. The pair is what the
// backend reads (TOUCHPAD_MIN_CUTOFF / TOUCHPAD_SPEED_COEFF); these are just
// labelled points in that space, and Custom exposes the raw numbers.
//
// Cutoff is the floor: how much smoothing survives when the finger is barely
// moving, in Hz. Lower is smoother and laggier. Speed lifts the cutoff as the
// finger speeds up, so a flick escapes the smoothing that a slow pan needs.
//
// Speed only matters once TOUCHPAD_D_CUTOFF (fixed at 15Hz, not exposed here)
// has noticed the finger sped up, so these presets no longer tie speed to
// cutoff the way earlier tuning did. Cutoff is free to go as low as Heavy
// wants for a still, jitter-free resting finger, while speed stays high
// across every preset so a flick escapes that smoothing almost immediately
// instead of inheriting the same lag the low floor implies.
const SMOOTHING_PRESETS = [
  { id: 'off', cutoff: 0, speed: 0 },
  { id: 'light', cutoff: 10, speed: 0.8 },
  { id: 'balanced', cutoff: 6, speed: 0.6 },
  { id: 'heavy', cutoff: 2.5, speed: 3.0 },
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

  const applyPreset = (id: string) => {
    const p = SMOOTHING_PRESETS.find(entry => entry.id === id)
    if (!p) return
    props.onTouchpadMinCutoffChange?.(String(p.cutoff))
    props.onTouchpadSpeedCoeffChange?.(String(p.speed))
  }

  return (
    <>
      <KeymapSection
        title={t('keymap.touchSensitivityTitle', 'Mouse output')}
        description={t(
          'keymap.touchSensitivityDescription',
          'How the cursor is smoothed as you swipe, and what it does when you let go.'
        )}
      >
        <div className={styles.touchpadSettings}>
          <label>
            {t('keymap.touchSmoothing', 'Mouse smoothing')}
            <AppSelect
              className="app-select"
              value={preset}
              onChange={e => applyPreset(e.target.value)}
            >
              <option value="off">{t('keymap.smoothingOff', 'Off — raw pad motion (0 / 0)')}</option>
              <option value="light">{t('keymap.smoothingLight', 'Light — sharpest, some jitter (10 / 0.8)')}</option>
              <option value="balanced">{t('keymap.smoothingBalanced', 'Balanced — default (6 / 0.6)')}</option>
              <option value="heavy">{t('keymap.smoothingHeavy', 'Heavy — smoothest at rest, flicks stay fast (2.5 / 3.0)')}</option>
              <option value="custom" disabled={preset !== 'custom'}>
                {t('keymap.smoothingCustom', 'Custom')}
              </option>
            </AppSelect>
          </label>
          <p className={styles.touchpadHint}>
            {t(
              'keymap.touchSmoothingHint',
              'Smoothing cutoff is the floor, in Hz: how much smoothing survives when your finger is barely moving or resting. Lower is smoother but laggier at rest. Flick responsiveness lifts that cutoff once a flick is detected, letting a fast swipe escape the resting smoothing almost immediately — so a low cutoff no longer means a slow flick, only a stiller resting cursor. If the cursor looks jittery at rest or panning slowly, go one step heavier; if flicks still feel like they trail your finger, go one step lighter.'
            )}
          </p>
          <AdvancedDisclosure summary={`${cutoff} Hz · ${speed}`}>
            <NumberField layout="inline"
              label={t('keymap.touchpadMinCutoff', 'Smoothing cutoff')}
              value={cutoff}
              onChange={v => props.onTouchpadMinCutoffChange?.(v)}
              min={0}
              max={20}
              step={0.1}
              unit="Hz"
            />
            <NumberField layout="inline"
              label={t('keymap.touchpadSpeedCoeff', 'Flick responsiveness')}
              value={speed}
              onChange={v => props.onTouchpadSpeedCoeffChange?.(v)}
              min={0}
              max={5}
              step={0.05}
            />
          </AdvancedDisclosure>
          <NumberField layout="inline"
            label={t('keymap.touchpadTrackballDecay', 'Trackball glide decay')}
            value={props.touchpadTrackballDecay ?? 0}
            onChange={v => props.onTouchpadTrackballDecayChange?.(v)}
            min={0}
            max={60}
            step={1}
          />
          <NumberField layout="inline"
            label={t('keymap.touchpadTrackballMinVelocity', 'Minimum flick speed')}
            value={props.touchpadTrackballMinVelocity ?? 200}
            onChange={v => props.onTouchpadTrackballMinVelocityChange?.(v)}
            min={0}
            max={2000}
            step={25}
            unit="px/s"
          />
          <p className={styles.touchpadHint}>
            {t(
              'keymap.touchpadTrackballMinVelocityHint',
              'How fast a swipe must still be moving as your finger leaves the pad before the trackball coasts, in pixels per second. Raise it if putting a finger down to stop a coast flicks the cursor instead; 0 coasts from any speed.'
            )}
          </p>
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
