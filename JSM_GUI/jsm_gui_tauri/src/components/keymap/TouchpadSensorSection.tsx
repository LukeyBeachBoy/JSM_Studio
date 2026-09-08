import { ConfigScope } from '../ConfigScope'
import { HelpButton } from '../HelpButton'
import { useTranslation } from 'react-i18next'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'
import { NumberField } from '../NumberField'
import { AdvancedDisclosure } from '../AdvancedDisclosure'
import { AppSelect } from '../ui/AppSelect'

type Props = {
  liftSpeed?: number
  onLiftSpeedChange?: (value: string) => void
  touchpadMinCutoff?: number
  touchpadSpeedCoeff?: number
  touchpadTrackballDecay?: number
  touchpadTrackballMinVelocity?: number
  touchpadMovementThreshold?: number
  touchpadClickDampen?: number
  touchpadClickDampenThreshold?: number
  /** Live force reading per pad, so the threshold can be dialled against it. */
  livePadPressures?: { left?: number; right?: number }
  onTouchpadMinCutoffChange?: (v: string) => void
  onTouchpadSpeedCoeffChange?: (v: string) => void
  onTouchpadTrackballDecayChange?: (v: string) => void
  onTouchpadTrackballMinVelocityChange?: (v: string) => void
  onTouchpadMovementThresholdChange?: (v: string) => void
  onTouchpadClickDampenChange?: (v: string) => void
  onTouchpadClickDampenThresholdChange?: (v: string) => void
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

// Four decimals because a resting finger and a click can differ in the third.
const formatPressure = (value?: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '—'

function matchPreset(cutoff: number, speed: number) {
  const hit = SMOOTHING_PRESETS.find(
    p => Math.abs(p.cutoff - cutoff) < 0.001 && Math.abs(p.speed - speed) < 0.0001
  )
  return hit?.id ?? 'custom'
}

export function TouchpadSensorSection(props: Props) {
  const { t } = useTranslation()
  const cutoff = props.touchpadMinCutoff ?? 6
  const speed = props.touchpadSpeedCoeff ?? 0.6
  const preset = matchPreset(cutoff, speed)
  const actions = <SectionActions className={keymapStyles.keymapSectionActions} hasPendingChanges={props.hasPendingChanges} onApply={props.onApply} onCancel={props.onCancel} applyDisabled={props.applyDisabled} />
  return <div className={styles.touchpadSettings}>
    <ConfigScope match={/^TOUCHPAD_(MIN_CUTOFF|SPEED_COEFF|D_CUTOFF|MOVEMENT_)/}>
      <section id="touch-smoothing" className="tuning-group tuning-anchor">
        <h3>Motion</h3>
        <div className={styles.smoothingRow}>
          <span className={styles.settingLabel}>Mouse smoothing <HelpButton title="Mouse smoothing">{t('keymap.touchSmoothingHint')}</HelpButton></span>
          <AppSelect aria-label="Mouse smoothing" value={preset} onChange={e => {
            const next = SMOOTHING_PRESETS.find(p => p.id === e.target.value)
            if (next) { props.onTouchpadMinCutoffChange?.(String(next.cutoff)); props.onTouchpadSpeedCoeffChange?.(String(next.speed)) }
          }}>
            <option value="off">Off</option><option value="light">Light</option><option value="balanced">Balanced</option><option value="heavy">Heavy</option><option value="custom" disabled={preset !== 'custom'}>Custom</option>
          </AppSelect>
        </div>
        <NumberField layout="inline" label="Minimum movement" value={props.touchpadMovementThreshold ?? 0} onChange={v => props.onTouchpadMovementThresholdChange?.(v)} min={0} max={500} step={1} coarseStep={10} unit="px/s" hint={t('keymap.touchpadMovementThresholdHint')} />
        <AdvancedDisclosure summary={`${cutoff} Hz · ${speed}`}>
          <NumberField layout="inline" label="Smoothing cutoff" value={cutoff} onChange={v => props.onTouchpadMinCutoffChange?.(v)} min={0} max={20} step={0.1} unit="Hz" hint="Lower values smooth resting and slow movement more strongly. Fast swipes escape that smoothing using Flick responsiveness." />
          <NumberField layout="inline" label="Flick responsiveness" value={speed} onChange={v => props.onTouchpadSpeedCoeffChange?.(v)} min={0} max={5} step={0.05} hint="Higher values reduce smoothing sooner when your finger speeds up, keeping quick flicks responsive." />
        </AdvancedDisclosure>
        {actions}
      </section>
    </ConfigScope>
    <ConfigScope match={/^TOUCHPAD_(CLICK_DAMPEN|LIFT_)/}>
      <section id="touch-release" className="tuning-group tuning-anchor">
        <h3>Press & release</h3>
        <NumberField layout="inline" label="Lift-off protection" value={props.liftSpeed ?? 150} onChange={v => props.onLiftSpeedChange?.(v)} min={0} max={1000} step={10} unit="px/s" hint="Below this finger speed, falling pressure reduces mouse output to suppress thumb lift motion. Small pressure fluctuations are ignored; releasing 35% of the resting pressure stops output. Faster swipes remain responsive. 0 disables. Requires a controller that reports analog pad pressure." />
        <NumberField layout="inline" label="Click damping" value={props.touchpadClickDampen ?? 0} onChange={v => props.onTouchpadClickDampenChange?.(v)} min={0} max={1} step={0.05} hint={t('keymap.touchpadClickDampenHint')} />
        <NumberField layout="inline" label="Damping pressure" value={props.touchpadClickDampenThreshold ?? 0} onChange={v => props.onTouchpadClickDampenThresholdChange?.(v)} min={0} max={1} step={0.002} coarseStep={0.02} disabled={(props.touchpadClickDampen ?? 0) === 0} hint="Pressure at which click damping is fully applied. Read the live pressure below while pressing the pad. 0 damps only while the physical click is held." />
        <p className={styles.touchpadHint}>Pressure now: <strong>{formatPressure(props.livePadPressures?.left)}</strong> Left · <strong>{formatPressure(props.livePadPressures?.right)}</strong> Right
          <HelpButton title="Live pad pressure">Readings use the driver’s normalized 0–1 scale and are shown to four decimals. Hardware precision varies by controller.</HelpButton>
        </p>
        {actions}
      </section>
    </ConfigScope>
    <ConfigScope match={/^TOUCHPAD_TRACKBALL_/}>
      <section id="touch-glide" className="tuning-group tuning-anchor">
        <h3>Trackball</h3>
        <NumberField layout="inline" label="Trackball glide decay" value={props.touchpadTrackballDecay ?? 0} onChange={v => props.onTouchpadTrackballDecayChange?.(v)} min={0} max={60} step={1} hint="0 stops when your finger leaves. Positive values enable coasting after a flick; larger values slow the coast faster." />
        <NumberField layout="inline" label="Minimum flick speed" value={props.touchpadTrackballMinVelocity ?? 200} onChange={v => props.onTouchpadTrackballMinVelocityChange?.(v)} min={0} max={2000} step={25} unit="px/s" hint={t('keymap.touchpadTrackballMinVelocityHint')} />
        {actions}
      </section>
    </ConfigScope>
  </div>
}
