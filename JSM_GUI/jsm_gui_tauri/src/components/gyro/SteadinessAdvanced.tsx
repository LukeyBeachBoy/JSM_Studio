import { SubPage, FineTune, stepGroup, ValueRow, type FineTuneGroup } from '../ui/console'
import { upsertFlagCommand } from '../../utils/config'
import { readPair, writePair } from '../../utils/gyroSpeed'
import { euroSmoothedAt, isOneEuroOn, passedAt, readSteadyingSettings, smoothedAt, smoothingLagMs } from '../../utils/gyroSteadiness'
import { useGyro, KeyNumberRow, KeySwitchRow, SwitchRow, Note, VisualTitle, PadActions } from './GyroContext'
import { FractionGraph, PipelineStrip, SnapZones, BrakeIllustration, liveOmega, liveGyro, useModel } from './visuals'
import { useOutputReasons } from './groups'

// Steadiness ▸ Advanced (GyroSteadinessAdvanced, GyroJitterFilter,
// GyroAdaptiveFilter, GyroSnapBrake): the four stages the gyro passes through,
// each a part on the rail with its graph and the pipeline strip.

export type SteadinessPart = 'jitter' | 'smoothing' | 'adaptive' | 'snap'

type Props = { open: boolean; onClose: () => void; trail: string[]; part: SteadinessPart; onPart: (part: SteadinessPart) => void }

const sp = (value: number) => `${Number(value.toFixed(2))} °/s`

export function SteadinessAdvanced({ open, onClose, trail, part, onPart }: Props) {
  const gyro = useGyro()
  const reasons = useOutputReasons()
  const s = readSteadyingSettings(gyro.text, { oneEuro: isOneEuroOn(gyro.rootText), tickMs: readSteadyingSettings(gyro.rootText).tickMs })
  const live = liveOmega(gyro.sample)
  const floor = readPair(gyro.text, 'GYRO_STEADYING_FLOOR') ?? [0, 0]
  const snap = gyro.num('GYRO_ANGLE_SNAP', 0)
  const brake = gyro.num('DECEL_BRAKE_STRENGTH', 0)
  const click = gyro.num('GYRO_CLICK_DAMPEN', 0)
  const lag = useModel(() => smoothingLagMs(s), s)
  const filters = reasons.filters
  const deflectionOnly = reasons.deflectionOnly

  const status = {
    jitter: s.cutoff > 0 || s.recovery > 0 ? `Ignore below ${s.cutoff} °/s${s.recovery > s.cutoff ? ` · in by ${s.recovery}` : ''}` : 'Off',
    smoothing: s.smoothThreshold > 0 ? `Smooth below ${s.smoothThreshold} °/s` : 'Off',
    adaptive: s.oneEuro ? 'On' : 'Off',
    snap: [snap > 0 ? `snap within ${snap}°` : '', brake > 0 ? `brake ${Math.round(brake * 100)}%` : '', click > 0 ? `click ${Math.round(click * 100)}%` : ''].filter(Boolean).join(' · ') || 'All off',
  }
  const changed = {
    jitter: gyro.changed('GYRO_CUTOFF_SPEED', 'GYRO_CUTOFF_RECOVERY', 'GYRO_STEADYING_FLOOR'),
    smoothing: gyro.changed('GYRO_SMOOTH_THRESHOLD', 'GYRO_SMOOTH_TIME', 'GYRO_SMOOTHING_DECAY'),
    adaptive: s.oneEuro || gyro.changed('ONE_EURO_MIN_CUTOFF', 'ONE_EURO_SPEED_COEFF'),
    snap: gyro.changed('GYRO_ANGLE_SNAP', 'GYRO_ANGLE_SNAP_EASE', 'DECEL_BRAKE_STRENGTH', 'DECEL_BRAKE_THRESHOLD', 'GYRO_CLICK_DAMPEN', 'TRACKBALL_DECAY'),
  }
  const label = (id: SteadinessPart, text: string) => (changed[id] ? `Changed: ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text)
  const strip = (current: SteadinessPart, caption: string) => <PipelineStrip current={current} caption={caption} stages={[
    { id: 'jitter', label: 'Jitter', status: s.cutoff > 0 ? `Below ${s.cutoff}` : 'Off' },
    { id: 'smoothing', label: 'Smooth', status: s.smoothThreshold > 0 ? `Below ${s.smoothThreshold} °/s` : 'Off' },
    { id: 'adaptive', label: 'Adaptive', status: s.oneEuro ? 'On' : 'Off' },
    { id: 'snap', label: 'Snap/brake', status: snap > 0 || brake > 0 ? 'On' : 'Off' },
  ]} />
  const floorDisabled = filters ?? deflectionOnly ?? (s.recovery <= s.cutoff ? 'Needs Fade back in above Ignore turns slower than.' : undefined)
  const setFloor = (axis: 0 | 1, value: number) => gyro.setText(previous => {
    const pair: [number, number] = [...(readPair(gyro.text, 'GYRO_STEADYING_FLOOR') ?? [0, 0])] as [number, number]
    pair[axis] = value
    return writePair(previous, 'GYRO_STEADYING_FLOOR', pair)
  })
  const restNow = live === null ? null : Math.min(live, 99)

  const groups: FineTuneGroup[] = [
    {
      id: 'jitter', label: 'Ignore jitter', status: label('jitter', status.jitter), changed: changed.jitter,
      detail: 'Cutoff speed, fade back in, keep-moving floor',
      description: 'Silences the tiny buzz of a controller sitting still.',
      content: <>
        <KeyNumberRow k="GYRO_CUTOFF_SPEED" hero label="Ignore turns slower than" fallback={0} min={0} max={360} step={0.1} fineStep={0.01} format={sp} disabled={filters}
          caption={`Set it just above what the controller reads sitting still${restNow === null ? '' : `: ${restNow.toFixed(1)} °/s right now`}. ◂ ▸ steps 0.1.`} />
        <KeyNumberRow k="GYRO_CUTOFF_RECOVERY" label="Fade back in by" hint="Aim eases in up to this speed, not all at once" fallback={0} min={0} max={360} step={0.5} fineStep={0.01} format={sp} disabled={filters} />
        <ValueRow label="Keep at least, left/right" hint="Least speed while fading in; 0 is the classic feel" value={floor[0]} min={0} max={100} step={0.1} fineStep={0.01}
          setting={gyro.held ? undefined : 'GYRO_STEADYING_FLOOR'} disabled={floorDisabled ?? gyro.locked} onChange={value => setFloor(0, value)}
          onReset={gyro.get('GYRO_STEADYING_FLOOR') !== undefined ? () => gyro.reset('GYRO_STEADYING_FLOOR') : undefined} data={{ 'data-setting': 'GYRO_STEADYING_FLOOR' }} />
        <ValueRow label="Keep at least, up/down" hint="Same, for vertical aim" value={floor[1]} min={0} max={100} step={0.1} fineStep={0.01}
          setting={gyro.held ? undefined : 'GYRO_STEADYING_FLOOR'} disabled={floorDisabled ?? gyro.locked} onChange={value => setFloor(1, value)}
          onReset={gyro.get('GYRO_STEADYING_FLOOR') !== undefined ? () => gyro.reset('GYRO_STEADYING_FLOOR') : undefined} data={{ 'data-setting': 'GYRO_STEADYING_FLOOR' }} />
      </>,
      visual: <>
        <VisualTitle title="How much gets through, by speed" live={restNow === null ? '—' : sp(restNow)} />
        <FractionGraph yLabel="Gets through →" xMax={Math.max(8, s.recovery * 2, s.cutoff * 3)} live={live}
          curves={[{ fn: speed => passedAt(speed, s.cutoff, s.recovery) }]}
          marks={[...(s.cutoff > 0 ? [{ at: s.cutoff, label: String(s.cutoff) }] : []), ...(s.recovery > s.cutoff ? [{ at: s.recovery, label: String(s.recovery) }] : [])]}
          bands={s.cutoff > 0 ? [{ from: 0, to: s.cutoff, label: 'Ignored' }, ...(s.recovery > s.cutoff ? [{ from: s.cutoff, to: s.recovery, label: 'Fades in' }] : []), { from: Math.max(s.cutoff, s.recovery), to: Math.max(8, s.recovery * 2, s.cutoff * 3), label: 'All of it' }] : []} />
        {strip('jitter', s.cutoff > 0 || s.recovery > 0 ? `Above ${Math.max(s.cutoff, s.recovery)} °/s nothing is held back, so real turns never feel this.` : 'Off: every movement gets through.')}
      </>,
    },
    {
      id: 'smoothing', label: 'Smoothing', status: label('smoothing', status.smoothing), changed: changed.smoothing,
      detail: 'Speed, time, continuous',
      description: 'Averages out slow movement. Fast turns pass straight through.',
      content: <>
        <KeyNumberRow k="GYRO_SMOOTH_THRESHOLD" hero label="Smooth below this speed" fallback={0} min={0} max={360} step={1} fineStep={0.1} format={value => (value > 0 ? sp(value) : 'Off')} disabled={filters}
          caption="Turns slower than this are smoothed, faster ones go straight through. Set it just above how fast your hands shake." />
        <KeyNumberRow k="GYRO_SMOOTH_TIME" label="Smoothing time" hint="Longer is calmer but adds a little delay" fallback={0.125} min={0} max={1} step={0.025} fineStep={0.001} format={value => `${value} s`} disabled={filters} />
        <KeySwitchRow k="GYRO_SMOOTHING_DECAY" label="Continuous smoothing" hint="Same feel whatever the update rate" disabled={filters} />
      </>,
      visual: <>
        <VisualTitle title="How much is smoothed, by speed" live={live === null ? '—' : sp(live)} />
        <FractionGraph yLabel="Smoothed →" xMax={Math.max(24, s.smoothThreshold * 3)} live={live} curves={[{ fn: speed => smoothedAt(speed, s) }]}
          marks={s.smoothThreshold > 0 ? [{ at: s.smoothThreshold, label: sp(s.smoothThreshold) }] : []}
          bands={s.smoothThreshold > 0 ? [{ from: 0, to: s.smoothThreshold / 2, label: 'Fully smoothed' }, { from: s.smoothThreshold / 2, to: s.smoothThreshold, label: 'Blend' }, { from: s.smoothThreshold, to: Math.max(24, s.smoothThreshold * 3), label: 'Straight through' }] : []} />
        {strip('smoothing', s.smoothThreshold > 0 ? `Your movement passes through these in order. At ${s.smoothTime} s, slow aim lags by about ${Math.round(lag)} ms.` : 'Your movement passes through these in order. Smoothing is off.')}
      </>,
    },
    {
      id: 'adaptive', label: 'Adaptive filter', status: label('adaptive', status.adaptive), changed: changed.adaptive,
      detail: 'On or off, smoothing at rest, how fast it lets go',
      description: 'Smooths hard when you’re still, lets go as you speed up.',
      content: <>
        <SwitchRow label="Adaptive filter" hint="For the whole configuration" on={s.oneEuro} setting="ONE_EURO_FILTER" disabled={filters ?? gyro.locked}
          onChange={next => gyro.setRootText(previous => upsertFlagCommand(previous, 'ONE_EURO_FILTER', next))} />
        <KeyNumberRow k="ONE_EURO_SPEED_COEFF" hero label="How fast it lets go" fallback={0.3} min={0} max={2} step={0.05} fineStep={0.01}
          disabled={filters ?? (s.oneEuro ? undefined : 'Turn the adaptive filter on first.')}
          caption="Higher lets a flick through sooner; lower stays calm for longer. ◂ ▸ steps 0.05; Shift for 0.01." />
        <KeyNumberRow k="ONE_EURO_MIN_CUTOFF" label="Smoothing at rest" hint="Lower is calmer; higher keeps tiny moves sharp" fallback={6} min={0} max={20} step={0.5} fineStep={0.1} format={value => `${value} Hz`}
          disabled={filters ?? (s.oneEuro ? undefined : 'Turn the adaptive filter on first.')} />
        <Note>The two numbers can change while you hold a button; on or off cannot.</Note>
      </>,
      visual: <>
        <VisualTitle title="How much is smoothed, by speed" live={live === null ? '—' : sp(live)} />
        <FractionGraph yLabel="Smoothed →" xMax={60} live={s.oneEuro ? live : null}
          curves={[
            { fn: speed => euroSmoothedAt(speed, s.minCutoff, 0.1), label: '0.1 · calmer', tone: 'alt' },
            { fn: speed => euroSmoothedAt(speed, s.minCutoff, 0.8), label: '0.8 · lets go sooner', tone: 'alt' },
            { fn: speed => euroSmoothedAt(speed, s.minCutoff, s.speedCoeff), label: String(s.speedCoeff) },
          ]} />
        {strip('adaptive', `At rest: smoothed at ${s.minCutoff} Hz. Unlike smoothing, there is no hard switch-over speed, so there’s nothing to feel kick in.`)}
      </>,
    },
    {
      id: 'snap', label: 'Snap & brake', status: label('snap', status.snap), changed: changed.snap,
      detail: 'Snap angle and ease, brake after flicks, steady while clicking, coast slowdown',
      description: 'Straighter sweeps, cleaner stops, steadier clicks.',
      content: <>
        {deflectionOnly && <Note tone="warn">{deflectionOnly}</Note>}
        <KeyNumberRow k="GYRO_ANGLE_SNAP" hero label="Snap within" fallback={0} min={0} max={45} step={1} fineStep={0.1} format={value => (value > 0 ? `${value}°` : 'Off')} disabled={filters ?? deflectionOnly}
          caption={`A sweep within ${snap || 'this many degrees'}${snap ? '°' : ''} of level or straight up comes out exactly level. 0 turns it off.`} />
        <KeySwitchRow k="GYRO_ANGLE_SNAP_EASE" label="Ease into the snap" hint="Pull gradually instead of jumping" disabled={filters ?? deflectionOnly} />
        <KeyNumberRow k="DECEL_BRAKE_STRENGTH" label="Brake after flicks" hint="Trims the overshoot as a flick slows" fallback={0} min={0} max={1} step={0.05} fineStep={0.01} factor={100} format={value => `${Math.round(value)}%`} disabled={filters ?? deflectionOnly} />
        <KeyNumberRow k="DECEL_BRAKE_THRESHOLD" label="Brake trigger" hint="Slowing faster than this starts the brake" fallback={25} min={1} max={60} step={0.5} fineStep={0.1} format={sp} disabled={filters ?? deflectionOnly} />
        <KeyNumberRow k="GYRO_CLICK_DAMPEN" label="Steady while clicking" hint="How much a trackpad press freezes aim" fallback={0} min={0} max={1} step={0.05} fineStep={0.01} factor={100} format={value => `${Math.round(value)}%`} disabled={filters ?? deflectionOnly} />
        <KeyNumberRow k="TRACKBALL_DECAY" label="Coast slowdown" hint="While Gyro trackball is held" fallback={1} min={0} max={60} step={0.1} fineStep={0.01} format={value => `${value} /s`} disabled={deflectionOnly} />
      </>,
      visual: <>
        <VisualTitle title="Where aim snaps" live={headingText(liveGyro(gyro.sample))} />
        <SnapZones snap={snap} heading={heading(liveGyro(gyro.sample))} />
        <VisualTitle title={`End of a flick · brake ${brake > 0 ? `${Math.round(brake * 100)}%` : 'off · dashed: at 50%'}`} />
        <BrakeIllustration strength={brake} />
      </>,
    },
  ]

  return (
    <SubPage open={open} onClose={onClose} trail={trail} title="Advanced" stepLabel="Part" backLabel="Back to Steadiness"
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
  const degrees = (Math.atan2(gyro.x, gyro.y) * 180) / Math.PI
  return (degrees + 360) % 360
}
const headingText = (gyro: { x: number; y: number } | null) => {
  const value = heading(gyro)
  if (value === null) return 'still'
  const off = Math.min(...[0, 90, 180, 270, 360].map(center => Math.abs(value - center)))
  return `${Math.round(off)}° off level`
}
