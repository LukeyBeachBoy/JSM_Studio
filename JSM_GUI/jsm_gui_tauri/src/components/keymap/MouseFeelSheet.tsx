import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../ui/Sheet'
import { ExpandRow, RowGroup, SummaryRow } from '../ui/SummaryRow'
import { Icon } from '../icons/Icon'
import { SettingOrigins } from '../SettingOrigin'
import { TouchpadAccelSection } from './TouchpadAccelSection'
import { HAPTIC_EFFECT_CHOICES } from '../../utils/hapticBindings'
import { previewHaptic, type HapticPreviewSide } from '../../utils/hapticPreview'
import { SMOOTHING_PRESETS, smoothingPreset, strengthWord } from '../../utils/mouseFeel'
import type { TouchpadAccelParamKey, TouchpadAccelValues } from '../../hooks/useTouchpadConfig'
import type { AccelCurveLink, AccelCurveShape } from '../../utils/accelCurve'

// Mouse feel (console refinement 2c, D3): how a pad feels when it moves the
// mouse. Every TOUCHPAD_* smoothing, lift, click-damping, trackball and
// haptics key, which JoyShockMapper shares between the pads -- so the strip
// at the top says which pads use it right now, and which it leaves alone.
// Opened from the Mouse feel row under any pad set to Mouse, or from Home.

export type PadScope = { key: string; name: string; mode: string }

const MODE_NAMES: Record<string, string> = { MOUSE: 'Mouse', GRID_AND_STICK: 'Menu', PS_TOUCHPAD: 'PlayStation touchpad', '': 'Not set' }

type MouseFeelSheetProps = {
  open: boolean
  onClose: () => void
  /** Each pad and its mode right now: two on a Steam Controller, one on a DualSense. */
  pads: PadScope[]
  minCutoff?: number
  speedCoeff?: number
  movementThreshold?: number
  liftSpeed?: number
  clickDampen?: number
  clickDampenThreshold?: number
  trackballDecay?: number
  trackballMinVelocity?: number
  hapticIntensity?: number
  hapticEffect?: string
  hapticInterval?: number
  clickHapticIntensity?: number
  clickHapticEffect?: string
  releaseHapticIntensity?: number
  releaseHapticEffect?: string
  /** Live pad pressure, 0-1, for dialling click damping against. */
  livePressure?: { left?: number; right?: number }
  onMinCutoffChange: (value: string) => void
  onSpeedCoeffChange: (value: string) => void
  onMovementThresholdChange: (value: string) => void
  onLiftSpeedChange: (value: string) => void
  onClickDampenChange: (value: string) => void
  onClickDampenThresholdChange: (value: string) => void
  onTrackballDecayChange: (value: string) => void
  onTrackballMinVelocityChange: (value: string) => void
  onHapticIntensityChange: (value: string) => void
  onHapticEffectChange: (value: string) => void
  onHapticIntervalChange: (value: string) => void
  onClickHapticIntensityChange: (value: string) => void
  onClickHapticEffectChange: (value: string) => void
  onReleaseHapticIntensityChange: (value: string) => void
  onReleaseHapticEffectChange: (value: string) => void
  accel?: {
    values: TouchpadAccelValues
    gyroShape?: AccelCurveShape
    link?: string
    liveSpeed: number
    onCurveChange: (curve: string) => void
    onParamChange: (key: TouchpadAccelParamKey, value: string) => void
    onLinkChange: (link: AccelCurveLink) => void
  }
}

export function MouseFeelSheet(props: MouseFeelSheetProps) {
  const { t } = useTranslation()
  const config = useContext(SettingOrigins).config
  const cutoff = props.minCutoff ?? 6
  const speed = props.speedCoeff ?? 0.6
  const preset = smoothingPreset(cutoff, speed)
  const dampen = props.clickDampen ?? 0
  const decay = props.trackballDecay ?? 0
  const haptic = props.hapticIntensity ?? 0
  const clickHaptic = props.clickHapticIntensity ?? 0
  const releaseHaptic = props.releaseHapticIntensity ?? 0
  const effectOptions = HAPTIC_EFFECT_CHOICES.filter(effect => effect !== 'OFF').map(effect => ({ value: effect, label: t(`keymap.hapticEffect_${effect}`) }))
  const effectName = (effect: string | undefined, fallback: string) => t(`keymap.hapticEffect_${effect ?? fallback}`).replace(/ \(.*\)$/, '')
  const pressure = (value?: number) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '—'
  // Felt on the pad (or pads) set to Mouse, which is where these haptics play.
  const mousePads = props.pads.filter(pad => pad.mode === 'MOUSE')
  const previewSide: HapticPreviewSide = mousePads.length !== 1 ? 'both' : /LEFT/i.test(mousePads[0].key) ? 'left' : /RIGHT/i.test(mousePads[0].key) ? 'right' : 'both'
  const preview = (effect: string, strength: number) => previewHaptic(effect, strength, previewSide)

  return (
    <Sheet open={props.open} onClose={props.onClose} eyebrow={`Trackpads · ${config ?? 'Configuration'}`} title="Mouse feel"
      description="How a pad feels when it moves the mouse. Shared by every pad set to Mouse in this configuration.">
      <div className="scope-strip" role="list" aria-label="Pads this affects">
        {[...props.pads].sort((a, b) => Number(b.mode === 'MOUSE') - Number(a.mode === 'MOUSE')).map(pad => {
          const uses = pad.mode === 'MOUSE'
          return (
            <div key={pad.key} role="listitem" className="scope-tile" data-state={uses ? 'uses' : 'not'}>
              <span className="scope-tile__mark" aria-hidden="true">{uses ? <Icon name="success" size={14} /> : '–'}</span>
              <span><b>{pad.name}</b> · {MODE_NAMES[pad.mode] ?? pad.mode} · {uses ? 'uses this' : 'not affected'}</span>
            </div>
          )
        })}
      </div>

      <RowGroup title="Motion">
        <SummaryRow size="sheet" label="Smoothing" hint="Steadies a resting thumb; flicks escape it" setting="TOUCHPAD_MIN_CUTOFF"
          help={t('keymap.touchSmoothingHint')}
          adjust={{
            kind: 'choice',
            value: preset,
            options: [...SMOOTHING_PRESETS.map(p => ({ value: p.id, label: p.label })), { value: 'custom', label: 'Custom' }],
            onChange: value => {
              const next = SMOOTHING_PRESETS.find(p => p.id === value)
              // Custom keeps the numbers as they are and shows them as rows.
              if (next) { props.onMinCutoffChange(String(next.cutoff)); props.onSpeedCoeffChange(String(next.speed)) }
              else if (preset !== 'custom') props.onMinCutoffChange(String(cutoff + 0.1))
            },
          }} />
        {preset === 'custom' && <>
          <SummaryRow size="sheet" label="Smoothing cutoff" hint="Lower smooths resting and slow movement more" setting="TOUCHPAD_MIN_CUTOFF" mono
            value={`${cutoff} Hz`} adjust={{ kind: 'number', value: cutoff, min: 0, max: 20, step: 0.1, onChange: v => props.onMinCutoffChange(String(v)) }}
            help="Lower values smooth resting and slow movement more strongly. Fast swipes escape that smoothing using Flick responsiveness." />
          <SummaryRow size="sheet" label="Flick responsiveness" hint="How soon a fast swipe escapes smoothing" setting="TOUCHPAD_SPEED_COEFF" mono
            value={String(speed)} adjust={{ kind: 'number', value: speed, min: 0, max: 5, step: 0.05, onChange: v => props.onSpeedCoeffChange(String(v)) }}
            help="Higher values reduce smoothing sooner when your finger speeds up, keeping quick flicks responsive." />
        </>}
        <SummaryRow size="sheet" label="Minimum movement" hint="Ignore motion slower than this" setting="TOUCHPAD_MOVEMENT_THRESHOLD" mono
          value={`${props.movementThreshold ?? 0} px/s`} help={t('keymap.touchpadMovementThresholdHint')}
          adjust={{ kind: 'number', value: props.movementThreshold ?? 0, min: 0, max: 500, step: 5, onChange: v => props.onMovementThresholdChange(String(v)) }} />
      </RowGroup>

      <RowGroup title="Press & release">
        <SummaryRow size="sheet" label="Lift-off protection" hint="Holds the cursor as your thumb lifts" setting="TOUCHPAD_LIFT_SPEED" mono
          value={(props.liftSpeed ?? 150) === 0 ? 'Off' : `${props.liftSpeed ?? 150} px/s`}
          help="Below this finger speed, falling pressure reduces mouse output to suppress thumb lift motion. Small pressure fluctuations are ignored; releasing 35% of the resting pressure stops output. Faster swipes remain responsive. 0 turns it off. Needs a controller that reports analog pad pressure."
          adjust={{ kind: 'number', value: props.liftSpeed ?? 150, min: 0, max: 1000, step: 10, onChange: v => props.onLiftSpeedChange(String(v)) }} />
        <SummaryRow size="sheet" label="Click damping" hint="Hold the cursor still while clicking" setting="TOUCHPAD_CLICK_DAMPEN" mono
          value={dampen === 0 ? 'Off' : `${Math.round(dampen * 100)}%`} help={t('keymap.touchpadClickDampenHint')}
          adjust={{ kind: 'number', value: dampen, min: 0, max: 1, step: 0.05, onChange: v => props.onClickDampenChange(String(v)) }}
          adjustDetail={<span className="pressure-meter">Pressure now <b>{pressure(props.livePressure?.left)}</b> left · <b>{pressure(props.livePressure?.right)}</b> right</span>} />
        {dampen > 0 && (
          <SummaryRow size="sheet" label="Damping pressure" hint="Pressure at which damping is full" setting="TOUCHPAD_CLICK_DAMPEN_THRESHOLD" mono
            value={(props.clickDampenThreshold ?? 0) === 0 ? 'On click' : (props.clickDampenThreshold ?? 0).toFixed(3)}
            help="Pressure at which click damping is fully applied. Read the live pressure while adjusting. 0 damps only while the physical click is held."
            adjust={{ kind: 'number', value: props.clickDampenThreshold ?? 0, min: 0, max: 1, step: 0.01, onChange: v => props.onClickDampenThresholdChange(String(v)) }}
            adjustDetail={<span className="pressure-meter">Pressure now <b>{pressure(props.livePressure?.left)}</b> left · <b>{pressure(props.livePressure?.right)}</b> right</span>} />
        )}
      </RowGroup>

      <RowGroup title="Glide">
        <SummaryRow size="sheet" label="Trackball glide" hint="Keep moving after a flick" setting="TOUCHPAD_TRACKBALL_DECAY" mono
          value={decay > 0 ? `On · ${decay}` : 'Off'}
          help="0 stops when your finger leaves. Higher values coast after a flick and slow the coast down sooner."
          adjust={{ kind: 'number', value: decay, min: 0, max: 60, step: 1, onChange: v => props.onTrackballDecayChange(String(v)) }}
          adjustDetail={decay > 0 ? <>Coasts from flicks faster than {props.trackballMinVelocity ?? 200} px/s.</> : <>Off: the cursor stops when your finger leaves.</>} />
        {decay > 0 && (
          <SummaryRow size="sheet" label="Minimum flick speed" hint="How fast a swipe must be to coast" setting="TOUCHPAD_TRACKBALL_MIN_VELOCITY" mono
            value={`${props.trackballMinVelocity ?? 200} px/s`} help={t('keymap.touchpadTrackballMinVelocityHint')}
            adjust={{ kind: 'number', value: props.trackballMinVelocity ?? 200, min: 0, max: 2000, step: 25, onChange: v => props.onTrackballMinVelocityChange(String(v)) }} />
        )}
      </RowGroup>

      <RowGroup title="Haptics">
        <ExpandRow size="sheet" label="Movement ticks" hint="A tick as your finger travels" setting="TOUCHPAD_HAPTIC_INTENSITY"
          value={haptic > 0 ? strengthWord(haptic) : 'Off'} help={t('keymap.touchpadHapticHint')}>
          <SummaryRow size="sheet" label="Strength" setting="TOUCHPAD_HAPTIC_INTENSITY" mono value={haptic > 0 ? `${haptic}%` : 'Off'}
            onX={{ label: 'Preview', run: () => preview(props.hapticEffect ?? 'TICK', haptic) }}
            adjust={{ kind: 'number', value: haptic, min: 0, max: 100, step: 5, onChange: v => { props.onHapticIntensityChange(String(v)); preview(props.hapticEffect ?? 'TICK', v) } }} />
          {haptic > 0 && <>
            <SummaryRow size="sheet" label="Effect" setting="TOUCHPAD_HAPTIC_EFFECT"
              onX={{ label: 'Preview', run: () => preview(props.hapticEffect ?? 'TICK', haptic) }}
              adjust={{ kind: 'choice', value: props.hapticEffect ?? 'TICK', options: effectOptions, onChange: v => { props.onHapticEffectChange(v); preview(v, haptic) } }} />
            <SummaryRow size="sheet" label="Tick spacing" hint="Travel between ticks" setting="TOUCHPAD_HAPTIC_INTERVAL" mono value={`${props.hapticInterval ?? 250} px`}
              adjust={{ kind: 'number', value: props.hapticInterval ?? 250, min: 5, max: 2000, step: 5, onChange: v => props.onHapticIntervalChange(String(v)) }} />
          </>}
        </ExpandRow>
        <ExpandRow size="sheet" label="Click and release" hint="Feedback when the pad clicks" setting="TOUCHPAD_CLICK_HAPTIC_INTENSITY"
          value={clickHaptic > 0 ? `${effectName(props.clickHapticEffect, 'CLICK')} · ${clickHaptic}%` : releaseHaptic > 0 ? `Release · ${releaseHaptic}%` : 'Off'}
          help={t('keymap.touchpadClickHapticHint')}>
          <SummaryRow size="sheet" label="On click" setting="TOUCHPAD_CLICK_HAPTIC_INTENSITY" mono value={clickHaptic > 0 ? `${clickHaptic}%` : 'Off'}
            onX={{ label: 'Preview', run: () => preview(props.clickHapticEffect ?? 'CLICK', clickHaptic) }}
            adjust={{ kind: 'number', value: clickHaptic, min: 0, max: 100, step: 5, onChange: v => { props.onClickHapticIntensityChange(String(v)); preview(props.clickHapticEffect ?? 'CLICK', v) } }} />
          {clickHaptic > 0 && <SummaryRow size="sheet" label="Click effect" setting="TOUCHPAD_CLICK_HAPTIC_EFFECT"
            onX={{ label: 'Preview', run: () => preview(props.clickHapticEffect ?? 'CLICK', clickHaptic) }}
            adjust={{ kind: 'choice', value: props.clickHapticEffect ?? 'CLICK', options: effectOptions, onChange: v => { props.onClickHapticEffectChange(v); preview(v, clickHaptic) } }} />}
          <SummaryRow size="sheet" label="On release" setting="TOUCHPAD_RELEASE_HAPTIC_INTENSITY" mono value={releaseHaptic > 0 ? `${releaseHaptic}%` : 'Off'}
            help={t('keymap.touchpadReleaseHapticHint')}
            adjust={{ kind: 'number', value: releaseHaptic, min: 0, max: 100, step: 5, onChange: v => { props.onReleaseHapticIntensityChange(String(v)); preview(props.releaseHapticEffect ?? 'TICK', v) } }} />
          {releaseHaptic > 0 && <SummaryRow size="sheet" label="Release effect" setting="TOUCHPAD_RELEASE_HAPTIC_EFFECT"
            onX={{ label: 'Preview', run: () => preview(props.releaseHapticEffect ?? 'TICK', releaseHaptic) }}
            adjust={{ kind: 'choice', value: props.releaseHapticEffect ?? 'TICK', options: effectOptions, onChange: v => { props.onReleaseHapticEffectChange(v); preview(v, releaseHaptic) } }} />}
        </ExpandRow>
      </RowGroup>

      {props.accel && (
        <RowGroup title="Acceleration">
          <ExpandRow size="sheet" label="Acceleration curve" hint="Faster swipes move further" setting="TOUCHPAD_ACCEL_CURVE"
            value={props.accel.link === 'TOUCHPAD_USES_GYRO' ? 'Same as gyro' : ((props.accel.values.minGain ?? 1) === (props.accel.values.maxGain ?? 1) ? 'Off' : String(props.accel.values.curve ?? 'On'))}>
            <div className="sheet-embed">
              <TouchpadAccelSection liveSpeed={props.accel.liveSpeed} values={props.accel.values} gyroShape={props.accel.gyroShape}
                accelCurveLink={props.accel.link} onCurveChange={props.accel.onCurveChange} onParamChange={props.accel.onParamChange}
                onLinkChange={props.accel.onLinkChange} hasPendingChanges={false} onApply={() => {}} onCancel={() => {}} embedded />
            </div>
          </ExpandRow>
        </RowGroup>
      )}
    </Sheet>
  )
}
