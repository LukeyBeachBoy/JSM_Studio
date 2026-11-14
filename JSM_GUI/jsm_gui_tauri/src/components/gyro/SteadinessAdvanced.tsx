import { SubPage, FineTune, stepGroup, type FineTuneGroup } from '../ui/console'
import { upsertFlagCommand } from '../../utils/config'
import { euroSmoothedAt, isOneEuroOn, readSteadyingSettings, smoothedAt, smoothingLagMs } from '../../utils/gyroSteadiness'
import { useGyro, KeyNumberRow, KeySwitchRow, SwitchRow, Note, VisualTitle, PadActions } from './GyroContext'
import { FractionGraph, PipelineStrip, SnapZones, BrakeIllustration, useModel } from './visuals'
import { useOutputReasons } from './groups'

// Steadiness ▸ Advanced (GyroSteadinessAdvanced, GyroJitterFilter,
// GyroAdaptiveFilter, GyroSnapBrake): time-based and directional filters,
// each a part on the rail with its graph and the pipeline strip.

export type SteadinessPart = 'smoothing' | 'adaptive' | 'snap'

type Props = { open: boolean; onClose: () => void; trail: string[]; part: SteadinessPart; onPart: (part: SteadinessPart) => void }

const sp = (value: number) => `${Number(value.toFixed(2))} °/s`

export function SteadinessAdvanced({ open, onClose, trail, part, onPart }: Props) {
  const gyro = useGyro()
  const reasons = useOutputReasons()
  const s = readSteadyingSettings(gyro.text, { oneEuro: isOneEuroOn(gyro.rootText), tickMs: readSteadyingSettings(gyro.rootText).tickMs })
  const motion = gyro.sample?.devices?.[0]?.status?.motion
  const inputSpeed = motion ? Math.hypot(motion.input.x, motion.input.y) : null
  const derivative = motion?.derivative ? Math.max(Math.abs(motion.derivative.x), Math.abs(motion.derivative.y)) : null
  const snap = gyro.num('GYRO_ANGLE_SNAP', 0)
  const brake = gyro.num('DECEL_BRAKE_STRENGTH', 0)
  const click = gyro.num('GYRO_CLICK_DAMPEN', 0)
  const lag = useModel(() => smoothingLagMs(s), s)
  const filters = reasons.filters
  const deflectionOnly = reasons.deflectionOnly

  const status = {
    smoothing: s.smoothThreshold > 0 ? `Smooth below ${s.smoothThreshold} °/s` : 'Off',
    adaptive: s.oneEuro ? 'On' : 'Off',
    snap: [snap > 0 ? `snap within ${snap}°` : '', brake > 0 ? `brake ${Math.round(brake * 100)}%` : '', click > 0 ? `click ${Math.round(click * 100)}%` : ''].filter(Boolean).join(' · ') || 'All off',
  }
  const changed = {
    smoothing: gyro.changed('GYRO_SMOOTH_THRESHOLD', 'GYRO_SMOOTH_TIME', 'GYRO_SMOOTHING_DECAY'),
    adaptive: s.oneEuro || gyro.changed('ONE_EURO_MIN_CUTOFF', 'ONE_EURO_SPEED_COEFF'),
    snap: gyro.changed('GYRO_ANGLE_SNAP', 'GYRO_ANGLE_SNAP_EASE', 'DECEL_BRAKE_STRENGTH', 'DECEL_BRAKE_THRESHOLD', 'GYRO_CLICK_DAMPEN', 'TRACKBALL_DECAY'),
  }
  const label = (id: SteadinessPart, text: string) => (changed[id] ? `Changed: ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text)
  const strip = (current: SteadinessPart, caption: string) => <PipelineStrip current={current} caption={caption} stages={[
    { id: 'smoothing', label: 'Smooth', status: s.smoothThreshold > 0 ? `Below ${s.smoothThreshold} °/s` : 'Off' },
    { id: 'adaptive', label: 'Adaptive', status: s.oneEuro ? 'On' : 'Off' },
    { id: 'jitter', label: 'Jitter', status: s.cutoff > 0 || s.recovery > 0 ? `Below ${Math.max(s.cutoff, s.recovery)} °/s` : 'Off' },
    { id: 'snap', label: 'Snapping & braking', status: snap > 0 || brake > 0 ? 'On' : 'Off' },
  ]} />
  const groups: FineTuneGroup[] = [
    {
      id: 'smoothing', label: 'Smoothing', status: label('smoothing', status.smoothing), changed: changed.smoothing,
      detail: 'Speed, time, continuous',
      description: 'Smoothing averages motion over time to reduce jitter, adding some delay. Steadying instead reduces low-speed sensitivity.',
      content: <>
        <KeyNumberRow k="GYRO_SMOOTH_THRESHOLD" hero label="Smoothing threshold" fallback={0} min={0} max={360} step={1} fineStep={0.1} format={value => (value > 0 ? sp(value) : 'Off')} disabled={filters}
          caption="Turns slower than this are smoothed, faster ones go straight through. Set it just above how fast your hands shake." />
        <KeyNumberRow k="GYRO_SMOOTH_TIME" label="Smoothing time" hint="Longer is calmer but adds a little delay" fallback={0.125} min={0} max={1} step={0.025} fineStep={0.001} format={value => `${value} s`} disabled={filters} />
        <KeySwitchRow k="GYRO_SMOOTHING_DECAY" label="Exponential smoothing" hint="Uses time-based decay instead of a fixed sample window" disabled={filters} />
      </>,
      visual: <>
        <VisualTitle title="Smoothing weight by input speed" live={inputSpeed === null ? undefined : sp(inputSpeed)} />
        <FractionGraph yLabel="Smoothed →" xMax={Math.max(24, s.smoothThreshold * 3)} live={inputSpeed} curves={[{ fn: speed => smoothedAt(speed, s) }]}
          marks={s.smoothThreshold > 0 ? [{ at: s.smoothThreshold, label: sp(s.smoothThreshold) }] : []}
          bands={s.smoothThreshold > 0 && s.smoothTime > 0 ? [...(s.decay ? [{ from: 0, to: s.smoothThreshold, label: 'Quadratic blend' }] : [{ from: 0, to: s.smoothThreshold / 2, label: 'Fully smoothed' }, { from: s.smoothThreshold / 2, to: s.smoothThreshold, label: 'Blend' }]), { from: s.smoothThreshold, to: Math.max(24, s.smoothThreshold * 3), label: 'Straight through' }] : []} />
        {strip('smoothing', s.smoothThreshold > 0 ? `Your movement passes through these in order. At ${s.smoothTime} s, slow aim lags by about ${Math.round(lag)} ms.` : 'Your movement passes through these in order. Smoothing is off.')}
      </>,
    },
    {
      id: 'adaptive', label: 'One Euro filter', status: label('adaptive', status.adaptive), changed: changed.adaptive,
      detail: 'On or off, smoothing at rest, how fast it lets go',
      description: 'Smooths hard when you’re still, lets go as you speed up.',
      content: <>
        <SwitchRow label="One Euro filter" hint="For the whole configuration" on={s.oneEuro} setting="ONE_EURO_FILTER" disabled={filters ?? gyro.locked}
          onChange={next => gyro.setRootText(previous => upsertFlagCommand(previous, 'ONE_EURO_FILTER', next))} />
        <KeyNumberRow k="ONE_EURO_SPEED_COEFF" hero label="Speed coefficient (beta)" fallback={0.3} min={0} max={2} step={0.05} fineStep={0.01}
          disabled={filters ?? (s.oneEuro ? undefined : 'Turn the One Euro filter on first.')}
          caption="Higher lets a flick through sooner; lower stays calm for longer. ◂ ▸ steps 0.05; Shift for 0.01." />
        <KeyNumberRow k="ONE_EURO_MIN_CUTOFF" label="Minimum cutoff frequency" hint="Lower is calmer; higher keeps tiny moves sharp" fallback={6} min={0} max={20} step={0.5} fineStep={0.1} format={value => `${value} Hz`}
          disabled={filters ?? (s.oneEuro ? undefined : 'Turn the One Euro filter on first.')} />
        <Note>The two numbers can change while you hold a button; on or off cannot.</Note>
      </>,
      visual: <>
        <VisualTitle title="One Euro response to acceleration" live={s.oneEuro && derivative !== null ? `${Math.round(derivative)} °/s²` : undefined} />
        <FractionGraph yLabel="Previous output weight →" xLabel="Filtered angular acceleration →" unit="°/s²" xMax={600} live={s.oneEuro ? derivative : null}
          curves={[
            { fn: derivative => euroSmoothedAt(derivative, s.minCutoff, 0.1, s.tickMs), label: 'beta 0.1', tone: 'alt' },
            { fn: derivative => euroSmoothedAt(derivative, s.minCutoff, 0.8, s.tickMs), label: 'beta 0.8', tone: 'alt' },
            { fn: derivative => s.oneEuro ? euroSmoothedAt(derivative, s.minCutoff, s.speedCoeff, s.tickMs) : 0, label: s.oneEuro ? `beta ${s.speedCoeff}` : 'Off' },
          ]} />
        <Note>Response at the configured {s.tickMs} ms update interval. The live point uses the axis with the larger filtered acceleration.</Note>
        {strip('adaptive', `At rest: smoothed at ${s.minCutoff} Hz. Unlike smoothing, there is no hard switch-over speed, so there’s nothing to feel kick in.`)}
      </>,
    },
    {
      id: 'snap', label: 'Angle snapping & braking', status: label('snap', status.snap), changed: changed.snap,
      detail: 'Angle snapping, deceleration brake, click damping and trackball decay',
      description: 'Straighter sweeps, cleaner stops, steadier clicks.',
      content: <>
        {deflectionOnly && <Note tone="warn">{deflectionOnly}</Note>}
        <KeyNumberRow k="GYRO_ANGLE_SNAP" hero label="Angle snapping threshold" fallback={0} min={0} max={45} step={1} fineStep={0.1} format={value => (value > 0 ? `${value}°` : 'Off')} disabled={filters ?? deflectionOnly}
          caption={`Motion within ${snap || 'this many degrees'}${snap ? '°' : ''} of a horizontal or vertical axis snaps to that axis. 0 turns it off.`} />
        <KeySwitchRow k="GYRO_ANGLE_SNAP_EASE" label="Angle snapping easing" hint="Pull gradually instead of jumping" disabled={filters ?? deflectionOnly} />
        <KeyNumberRow k="DECEL_BRAKE_STRENGTH" label="Deceleration brake strength" hint="Trims the overshoot as a flick slows" fallback={0} min={0} max={1} step={0.05} fineStep={0.01} factor={100} format={value => `${Math.round(value)}%`} disabled={filters ?? deflectionOnly} />
        <KeyNumberRow k="DECEL_BRAKE_THRESHOLD" label="Deceleration brake threshold" hint="Slowing faster than this starts the brake" fallback={25} min={1} max={60} step={0.5} fineStep={0.1} format={sp} disabled={filters ?? deflectionOnly} />
        <KeyNumberRow k="GYRO_CLICK_DAMPEN" label="Click damping" hint="How much a trackpad press freezes aim" fallback={0} min={0} max={1} step={0.05} fineStep={0.01} factor={100} format={value => `${Math.round(value)}%`} disabled={filters ?? deflectionOnly} />
        <KeyNumberRow k="TRACKBALL_DECAY" label="Trackball decay" hint="How quickly simulated gyro trackball motion loses speed" fallback={1} min={0} max={60} step={0.1} fineStep={0.01} format={value => `${value} /s`} disabled={deflectionOnly} />
      </>,
      visual: <>
        <VisualTitle title="Where aim snaps" live={motion?.snapInput ? headingText(motion.snapInput) : undefined} />
        <SnapZones snap={snap} heading={heading(motion?.snapInput ?? null)} />
        <VisualTitle title={`Brake illustration · ${brake > 0 ? `${Math.round(brake * 100)}%` : 'off · dashed: at 50%'}`} />
        <BrakeIllustration strength={brake} />
      </>,
    },
  ]

  return (
    <SubPage open={open} onClose={onClose} trail={trail} title="Advanced" stepLabel="Part" backLabel="Back to Filters"
      onStep={direction => onPart(stepGroup(groups, part, direction) as SteadinessPart)}
      hints={gyro.callbacks.onTryIt ? [{ button: 'X', label: 'Try it' }] : undefined}
      where={`${trail.join(' · ')} · Advanced · ${groups.find(group => group.id === part)?.label ?? ''}`}>
      <PadActions x={gyro.callbacks.onTryIt}>
        {filters && <Note tone="warn">{filters}</Note>}
        <FineTune railLabel="Part" groups={groups} active={part} onActive={id => onPart(id as SteadinessPart)} />
      </PadActions>
    </SubPage>
  )
}

/** Direction of the live movement, degrees from level (for the snap picture). */
const heading = (gyro: { x: number; y: number } | null) => {
  if (!gyro || Math.hypot(gyro.x, gyro.y) < 1) return null
  const degrees = (Math.atan2(gyro.y, gyro.x) * 180) / Math.PI
  return (degrees + 360) % 360
}
const headingText = (gyro: { x: number; y: number } | null) => {
  const value = heading(gyro)
  if (value === null) return 'still'
  const off = Math.min(...[0, 90, 180, 270, 360].map(center => Math.abs(value - center)))
  return `${Math.round(off)}° off level`
}
