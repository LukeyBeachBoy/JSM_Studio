import { ModeCards, OpenRow, SegmentedRow, ValueRow, type FineTuneGroup } from '../ui/console'
import { HAPTIC_EFFECT_CHOICES } from '../../utils/hapticBindings'
import { previewHaptic } from '../../utils/hapticPreview'
import { gyroDeflectionEnabled } from '../../utils/gyroDeflectionSettings'
import { isVirtualStickTarget, writeVirtualSetting } from '../../utils/virtualStickSettings'
import { gyroConditions, parseTiltActivation, writeGyroActivation, writeTiltActivation, type GyroActivationMode } from '../../utils/gyroActivation'
import { useTranslation } from 'react-i18next'
import { formatStickModeLabel } from '../../constants/sticks'
import { TILT_LABELS, TiltAngleVisual } from './TiltSettings'
import { defaultHoldInput, inputName } from './inputs'
import { applySpeedUp, detectSpeedUp, gyroCurveParams, readGyroSpeed, speedUpPreviewParams, writeTurnSpeed, type SpeedUpPreset } from '../../utils/gyroSpeed'
import {
  ANGLE_SNAP_ON, CLICK_DAMPEN_ON, RUMBLE_LABELS, RUMBLE_PRESETS, STEADINESS_LABELS,
  applySteadiness, detectRumble, detectSteadiness, readSteadiness, type RumblePreset, type SteadinessPreset,
} from '../../utils/gyroPresets'
import { readSteadyingSettings, steadinessStats, sweepPaths } from '../../utils/gyroSteadiness'
import type { GyroSub } from '../../utils/gyroRoutes'
import { useGyro, KeyNumberRow, KeyChoiceRow, SwitchRow, VisualTitle, RowLabel, Note } from './GyroContext'
import { SpeedResponse, SteadySweep, StatTiles, RotationDiagram, RumbleDial, liveOmega, liveGyro, useTurned, useModel } from './visuals'
import { OutputArt, SpaceArt, EffectArt, type SpaceKind } from './art'
import styles from './Gyro.module.css'

// The four Fine-tune groups (GyroFineTune, GyroSteadiness, GyroDirection,
// GyroRumble): three or four settings each beside a live visual. The rest of
// each group sits behind its Advanced row.

type Open = (sub: GyroSub) => void

const fmtX = (value: number) => `${Number(value.toFixed(2))}×`
const ms = (value: number) => (Number.isFinite(value) ? `≈ ${Math.round(value)} ms` : '—')

export const OUTPUT_LABEL: Record<string, string> = { MOUSE: 'Mouse', LEFT_STICK: 'Left stick', RIGHT_STICK: 'Right stick', PS_MOTION: 'Motion to game' }

/** Why speed and steadiness rows can't change, for the current output. */
export function useOutputReasons() {
  const gyro = useGyro()
  const output = (gyro.get('GYRO_OUTPUT') ?? 'MOUSE').toUpperCase()
  const motion = output === 'PS_MOTION'
  const deflection = isVirtualStickTarget(output) && gyroDeflectionEnabled(gyro.text)
  return {
    output, motion, deflection,
    speed: motion ? 'Motion to game sends the raw motion; the game sets the speed.'
      : deflection ? 'Hold the angle sets the stick from the angle: see Direction ▸ Stick settings.' : undefined,
    filters: motion ? 'Motion to game sends the raw motion; filters don’t change it.' : undefined,
    deflectionOnly: deflection ? 'Not used while the stick holds the angle (Hold the angle).' : undefined,
  }
}

// ---- Speed.
export function useSpeedGroup(open: Open): FineTuneGroup {
  const gyro = useGyro()
  const reasons = useOutputReasons()
  const speed = readGyroSpeed(gyro.text)
  const preset = detectSpeedUp(gyro.text)
  const params = gyroCurveParams(gyro.text)
  const presets: Exclude<SpeedUpPreset, 'off'>[] = ['gentle', 'strong']
  const changed = gyro.changed('GYRO_SENS', 'MIN_GYRO_SENS', 'MAX_GYRO_SENS', 'MIN_GYRO_THRESHOLD', 'MAX_GYRO_THRESHOLD', 'ACCEL_CURVE')
  const presetLabel = { off: 'Off', gentle: 'Gentle', strong: 'Strong', custom: 'Custom' }[preset]
  return {
    id: 'speed', label: 'Speed', changed,
    status: changed ? `Changed: ${fmtX(speed.base)}${preset !== 'off' ? ` · ${presetLabel}` : ''}` : `All default · ${fmtX(speed.base)}`,
    description: 'How fast your aim turns, and whether quick flicks go further.',
    content: <>
      <ValueRow hero label="Turn speed" setting={gyro.held ? undefined : speed.mode === 'static' ? 'GYRO_SENS' : 'MIN_GYRO_SENS'} value={Number(speed.base.toFixed(2))}
        min={0} max={30} step={0.1} fineStep={0.01} format={fmtX} disabled={reasons.speed ?? gyro.locked}
        caption="Every speed below is measured from this one."
        onChange={value => gyro.setText(previous => writeTurnSpeed(previous, value, '', gyro.text))}
        // Held: back to following the normal speed. Otherwise the mapper's 1×.
        onReset={gyro.held ? () => ['GYRO_SENS', 'MIN_GYRO_SENS', 'MAX_GYRO_SENS'].forEach(gyro.reset) : () => gyro.setText(previous => writeTurnSpeed(previous, 1, '', gyro.text))}
        onX={gyro.callbacks.onTryIt ? { label: 'Try it', run: gyro.callbacks.onTryIt } : undefined}
        data={{ 'data-setting': 'GYRO_SENS' }} />
      <SegmentedRow label="Speed up fast turns" hint="Slow movements stay precise; fast flicks travel further."
        value={preset} disabled={reasons.speed ?? gyro.locked}
        options={[
          { value: 'off', label: 'Off', caption: `${fmtX(speed.base)} at every speed` },
          { value: 'gentle', label: 'Gentle', caption: `Up to ${fmtX(speed.base * 1.5)} past 75 °/s` },
          { value: 'strong', label: 'Strong', caption: `Up to ${fmtX(speed.base * 2.5)} past 50 °/s` },
          { value: 'custom', label: 'Custom', caption: 'Your own curve: Advanced ▸ has its numbers' },
        ]}
        onChange={value => { if (value === 'custom') open({ view: 'speed-advanced', part: 'speeds' }); else gyro.setText(previous => applySpeedUp(previous, value as SpeedUpPreset, '', gyro.text)) }}
        data={{ 'data-setting': 'ACCEL_CURVE' }} />
      <OpenRow label="Match a full turn (360°)" hint="Turn once in game and the speed is set for you" value="Start"
        disabled={reasons.output !== 'MOUSE' ? 'Only while gyro sends the mouse: a stick’s speed is its game turn rate.' : undefined}
        onOpen={() => open({ view: 'match-turn' })} hints="A:Start;B:Back" />
      <OpenRow label="Advanced" hint="Exact speeds and switch points, curve shape, lean, Windows pointer speed" onOpen={() => open({ view: 'speed-advanced' })} />
    </>,
    visual: <>
      <VisualTitle title="How your aim responds" live={liveOmega(gyro.sample) === null ? '—' : `${Math.round(liveOmega(gyro.sample) ?? 0)} °/s`} />
      <SpeedResponse params={params} live={liveOmega(gyro.sample)}
        caption={preset === 'off' ? `Off · ${fmtX(speed.base)} at every speed` : `${presetLabel}`}
        compare={presets.filter(name => name !== preset).map(name => ({ label: name === 'gentle' ? 'Gentle' : 'Strong', params: speedUpPreviewParams(speed.base, name) }))} />
      <p className={styles.visualCaption}>Dashed lines are the other speed-ups from this turn speed. ◂ ▸ on Speed up fast turns applies one live.</p>
    </>,
  }
}

// ---- Steadiness.
export function useSteadinessGroup(open: Open): FineTuneGroup {
  const gyro = useGyro()
  const reasons = useOutputReasons()
  const preset = detectSteadiness(gyro.text)
  const values = readSteadiness(gyro.text)
  const settings = readSteadyingSettings(gyro.text, { oneEuro: readSteadyingSettings(gyro.rootText).oneEuro, tickMs: readSteadyingSettings(gyro.rootText).tickMs })
  const stats = useModel(() => steadinessStats(settings), settings)
  const paths = useModel(() => sweepPaths(settings), settings)
  const click = gyro.num('GYRO_CLICK_DAMPEN', 0)
  const snap = gyro.num('GYRO_ANGLE_SNAP', 0)
  const changed = gyro.changed('GYRO_CUTOFF_SPEED', 'GYRO_CUTOFF_RECOVERY', 'GYRO_STEADYING_FLOOR', 'GYRO_SMOOTH_THRESHOLD', 'GYRO_SMOOTH_TIME', 'GYRO_SMOOTHING_DECAY', 'GYRO_CLICK_DAMPEN', 'GYRO_ANGLE_SNAP', 'GYRO_ANGLE_SNAP_EASE', 'DECEL_BRAKE_STRENGTH', 'DECEL_BRAKE_THRESHOLD', 'TRACKBALL_DECAY', 'ONE_EURO_MIN_CUTOFF', 'ONE_EURO_SPEED_COEFF')
  const label = preset === 'custom' ? 'Custom' : STEADINESS_LABELS[preset]
  const extras = [click > 0 && !reasons.deflection ? 'click steady' : '', snap > 0 && !reasons.deflection ? `snap ${snap}°` : '', settings.oneEuro ? 'adaptive' : ''].filter(Boolean)
  const presetCaption = (name: SteadinessPreset) => name === 'off' ? 'No smoothing or jitter cutoff' : `Smooth below ${applyValues(name).GYRO_SMOOTH_THRESHOLD} °/s · ignore below ${applyValues(name).GYRO_CUTOFF_SPEED} °/s`
  return {
    id: 'steadiness', label: 'Steadiness', changed,
    status: changed ? `Changed: ${[label, ...extras].join(' · ')}` : 'All default',
    description: 'Calm small wobbles without slowing real turns.',
    content: <>
      <SegmentedRow label="Steady small movements" hint="Changes are live while you’re here." value={preset} disabled={reasons.filters ?? gyro.locked}
        options={[...(['off', 'light', 'medium', 'heavy'] as const).map(name => ({ value: name, label: STEADINESS_LABELS[name], caption: presetCaption(name) })),
          { value: 'custom', label: 'Custom', caption: `Your own numbers: smooth below ${values.GYRO_SMOOTH_THRESHOLD} °/s, ignore below ${values.GYRO_CUTOFF_SPEED} °/s` }]}
        onChange={value => { if (value === 'custom') open({ view: 'steadiness-advanced', part: 'smoothing' }); else gyro.setText(previous => applySteadiness(previous, value as SteadinessPreset, Boolean(gyro.held))) }}
        onX={gyro.callbacks.onTryIt ? { label: 'Try it', run: gyro.callbacks.onTryIt } : undefined}
        data={{ 'data-setting': 'GYRO_SMOOTH_THRESHOLD' }} />
      <SwitchRow label="Steady while clicking" hint="Pressing a trackpad won’t nudge your aim" on={click > 0} setting="GYRO_CLICK_DAMPEN"
        disabled={reasons.filters ?? reasons.deflectionOnly ?? gyro.locked}
        onChange={next => gyro.set('GYRO_CLICK_DAMPEN', next ? CLICK_DAMPEN_ON : 0)}
        onReset={gyro.get('GYRO_CLICK_DAMPEN') !== undefined ? () => gyro.reset('GYRO_CLICK_DAMPEN') : undefined} />
      <SwitchRow label="Snap to straight lines" hint="Nearly level sweeps come out perfectly level" on={snap > 0} setting="GYRO_ANGLE_SNAP"
        disabled={reasons.filters ?? reasons.deflectionOnly ?? gyro.locked}
        onChange={next => gyro.set('GYRO_ANGLE_SNAP', next ? ANGLE_SNAP_ON : 0)}
        onReset={gyro.get('GYRO_ANGLE_SNAP') !== undefined ? () => gyro.reset('GYRO_ANGLE_SNAP') : undefined} />
      <OpenRow label="Advanced" hint="Ignore jitter, smoothing, adaptive filter, snap and brake" onOpen={() => open({ view: 'steadiness-advanced' })} />
    </>,
    visual: <>
      <VisualTitle title="Your aim, up close" live={liveOmega(gyro.sample) === null ? '—' : `${Number((liveOmega(gyro.sample) ?? 0).toFixed(1))} °/s`} />
      <SteadySweep raw={paths.raw} out={paths.out} label={`With ${label}`} />
      <StatTiles tiles={[
        { label: 'Wobble while still', value: stats.wobbleCut > 0.005 ? `−${Math.round(stats.wobbleCut * 100)}%` : 'Untouched', tone: stats.wobbleCut > 0.005 ? 'good' : undefined },
        { label: 'Delay on slow aim', value: stats.slowDelayMs <= settings.tickMs * 1.5 ? 'None' : ms(stats.slowDelayMs) },
        { label: 'Fast turns', value: stats.fastDelayMs <= settings.tickMs * 1.5 && stats.fastKept > 0.99 ? 'Untouched' : ms(stats.fastDelayMs) },
      ]} />
      <p className={styles.visualCaption}>Worked out from these settings on a recorded-style hand: a still hold, a 4 °/s aim and a 120 °/s turn.</p>
    </>,
  }
}
const applyValues = (name: SteadinessPreset) => {
  // The preset's own numbers, for the captions.
  const text = applySteadiness('', name)
  return readSteadiness(text)
}

// ---- Direction.
const SPACES: { value: SpaceKind; label: string; caption: string; help: string }[] = [
  { value: 'LOCAL', label: 'Controller', caption: 'Its own axes', help: 'Default. Turn it to aim sideways, tilt its front to aim up and down.' },
  { value: 'YAW_PLUS_ROLL', label: 'Turn + lean', caption: 'Lean adds turn', help: 'Turning aims sideways, and leaning it adds to the turn (Speed ▸ Advanced ▸ Lean adds turn sets how much).' },
  { value: 'PLAYER_TURN', label: 'Player turn', caption: 'Any grip angle', help: 'Turn your body or the controller around you: works whatever angle you hold it at.' },
  { value: 'PLAYER_LEAN', label: 'Player lean', caption: 'Lean to turn', help: 'Lean the controller like a wheel to aim sideways, relative to how you hold it.' },
  { value: 'WORLD_TURN', label: 'World turn', caption: 'Around gravity', help: 'Turning around the real vertical aims sideways, however the controller is tilted.' },
  { value: 'WORLD_LEAN', label: 'World lean', caption: 'Lean vs. gravity', help: 'Leaning against gravity aims sideways, like steering a wheel.' },
]

export function useDirectionGroup(open: Open): FineTuneGroup {
  const gyro = useGyro()
  const output = (gyro.get('GYRO_OUTPUT') ?? 'MOUSE').toUpperCase()
  const spaceRaw = (gyro.get('GYRO_SPACE') ?? '').toUpperCase()
  const space = (spaceRaw || 'LOCAL') as SpaceKind
  const spaceInfo = SPACES.find(item => item.value === space)
  const invertX = (gyro.get('GYRO_AXIS_X') ?? '').toUpperCase() === 'INVERTED'
  const invertY = (gyro.get('GYRO_AXIS_Y') ?? '').toUpperCase() === 'INVERTED'
  const controller = (gyro.get('VIRTUAL_CONTROLLER') ?? 'NONE').toUpperCase()
  const stick = isVirtualStickTarget(output)
  const changed = gyro.changed('GYRO_OUTPUT', 'GYRO_SPACE', 'GYRO_AXIS_X', 'GYRO_AXIS_Y', 'MOUSE_X_FROM_GYRO_AXIS', 'MOUSE_Y_FROM_GYRO_AXIS', 'GYRO_STICK_DEFLECTION')
  const axes = invertX || invertY ? [invertX ? 'left/right inverted' : '', invertY ? 'up/down inverted' : ''].filter(Boolean).join(', ') : 'normal axes'
  const xFrom = (gyro.get('MOUSE_X_FROM_GYRO_AXIS') ?? 'Y').toUpperCase()
  const yFrom = (gyro.get('MOUSE_Y_FROM_GYRO_AXIS') ?? 'X').toUpperCase()
  const leanUsed = space === 'YAW_PLUS_ROLL' || space === 'PLAYER_LEAN' || space === 'WORLD_LEAN' || (space === 'LOCAL' && (xFrom.includes('Z') || yFrom.includes('Z')))
  const setOutput = (value: string) => gyro.set('GYRO_OUTPUT', value)
  return {
    id: 'direction', label: 'Direction', changed,
    status: `${OUTPUT_LABEL[output] ?? output} · ${axes}`,
    description: 'What the gyro moves, and which way.',
    content: <>
      <RowLabel>Sends</RowLabel>
      <ModeCards columns={4} value={output} onChange={setOutput} useLabel={card => `Use ${card.label}`}
        options={[
          { value: 'MOUSE', label: 'Mouse', caption: 'Turn speed moves it', art: <OutputArt kind="MOUSE" /> },
          { value: 'LEFT_STICK', label: 'Left stick', caption: 'For pad games', art: <OutputArt kind="LEFT_STICK" /> },
          { value: 'RIGHT_STICK', label: 'Right stick', caption: 'Camera in pad games', art: <OutputArt kind="RIGHT_STICK" /> },
          { value: 'PS_MOTION', label: 'Motion to game', caption: controller === 'DS4' ? 'PlayStation 4 reads it' : 'Needs the PlayStation 4 virtual pad', art: <OutputArt kind="PS_MOTION" /> },
        ].map(card => gyro.locked ? { ...card, unavailable: gyro.locked } : card)} />
      {output === 'PS_MOTION' && <>
        <Note>The real gyro and accelerometer go to a virtual PlayStation 4 controller for the game to read. Your controller can be Steam, Nintendo or PlayStation. Turn speed, steadiness and the camera settings don’t change this output, and When gyro is on only turns Rumble while aiming on and off: the motion always goes through.</Note>
        {controller !== 'DS4' && <Note tone="warn">Motion to game needs the PlayStation 4 virtual pad. Set Virtual pad to PlayStation 4.</Note>}
        <KeyChoiceRow k="VIRTUAL_CONTROLLER" label="Virtual pad" hint="For the whole configuration" fallback="NONE"
          options={[{ value: 'NONE', label: 'Off' }, { value: 'XBOX', label: 'Xbox 360' }, { value: 'DS4', label: 'PlayStation 4' }]} />
      </>}
      {output === 'LEFT_STICK' && <>
        <OpenRow label="Set up tilt steering" hint="For driving: leaning steers the left stick, and gyro aiming turns off" value="Configure"
          onOpen={() => {
            gyro.setText(previous => {
              let next = writeVirtualSetting(previous, 'MOTION_STICK_MODE', 'LEFT_STEER_X')
              next = writeVirtualSetting(next, 'GYRO_OUTPUT', 'MOUSE')
              next = writeGyroActivation(next, 'always_off', 'R3')
              return writeTiltActivation(next, 'always_on', 'R3')
            })
            open({ view: 'tilt', part: 'behaviour' })
          }} data={{ 'data-steering-shortcut': '' }} />
        <Note>For wheel-style driving, Tilt ▸ Behaviour ▸ Steering → left stick uses lean for steering. Set gyro to Mouse and When gyro is on to Off so they don’t fight, turn on a virtual pad, and bind Set tilt neutral to a button.</Note>
      </>}
      <OpenRow label={stick ? `${OUTPUT_LABEL[output]} settings` : 'Stick settings'}
        hint={stick ? 'Camera speed or hold-the-angle, game turn rate, deadzone and curve fixes, stick mixing, virtual pad' : 'For Left stick or Right stick'}
        disabled={stick ? undefined : 'Choose Left stick or Right stick first.'} onOpen={() => open({ view: 'stick' })} data={{ 'data-stick-settings': '' }} />
      <RowLabel>Turn using</RowLabel>
      <ModeCards columns={3} value={space} onChange={value => gyro.set('GYRO_SPACE', value !== 'LOCAL' || gyro.held || (spaceRaw && !gyro.changed('GYRO_SPACE')) ? value : '')}
        useLabel={card => `Use ${card.label}`}
        options={SPACES.map(item => ({ value: item.value, label: item.label, caption: item.caption, art: <SpaceArt kind={item.value} />, unavailable: gyro.locked }))} />
      <Note>{spaceRaw === '' ? 'Default. ' : ''}{spaceInfo?.help}</Note>
      <OpenRow label="Advanced" hint="Tilt to move, update rate, which rotations steer, ignore other controllers’ gyro" onOpen={() => open({ view: 'direction-advanced' })} />
    </>,
    visual: <>
      <VisualTitle title="Which move does what" live />
      <RotationDiagram live={liveGyro(gyro.sample)}
        turn={output === 'PS_MOTION' ? 'Turn → to the game' : 'Turn → aims left and right'}
        tilt={output === 'PS_MOTION' ? 'Tilt → to the game' : 'Tilt → up and down'}
        lean={leanUsed ? 'Lean → adds to the turn' : 'Lean · not used here'} />
      <div className={styles.visualRows}>
        <SwitchRow label="Invert left/right" hint="Turn left, aim goes right" on={invertX} setting="GYRO_AXIS_X" disabled={gyro.locked}
          onChange={next => gyro.set('GYRO_AXIS_X', next ? 'INVERTED' : 'STANDARD')}
          onReset={gyro.get('GYRO_AXIS_X') !== undefined ? () => gyro.reset('GYRO_AXIS_X') : undefined} />
        <SwitchRow label="Invert up/down" hint="Like a flight stick" on={invertY} setting="GYRO_AXIS_Y" disabled={gyro.locked}
          onChange={next => gyro.set('GYRO_AXIS_Y', next ? 'INVERTED' : 'STANDARD')}
          onReset={gyro.get('GYRO_AXIS_Y') !== undefined ? () => gyro.reset('GYRO_AXIS_Y') : undefined} />
      </div>
    </>,
  }
}

// ---- Rumble.
const EFFECT_LABEL: Record<string, string> = { TICK: 'Tick', CLICK: 'Click', TONE: 'Tone', RUMBLE: 'Rumble', SWEEP: 'Sweep', PULSE: 'Pulse', TAP: 'Tap', OFF: 'Silent' }

export function useRumbleGroup(): FineTuneGroup {
  const gyro = useGyro()
  const strength = gyro.num('GYRO_HAPTIC_INTENSITY', 0)
  const interval = gyro.num('GYRO_HAPTIC_INTERVAL', 15)
  const effect = (gyro.get('GYRO_HAPTIC_EFFECT') ?? 'TICK').toUpperCase()
  const side = (gyro.get('GYRO_HAPTIC_SIDE') ?? '3').trim()
  const preset = detectRumble(strength)
  const turned = useTurned(gyro.sample)
  const sideName = side === '1' ? 'left pad' : side === '2' ? 'right pad' : 'both pads'
  const feel = () => previewHaptic(effect, Math.max(strength, preset === 'off' ? 50 : strength), side === '1' ? 'left' : side === '2' ? 'right' : 'both')
  const notSteam = gyro.devices?.[0] && gyro.devices[0].type !== 24 ? 'Rumble while aiming uses the Steam Controller’s haptic pads; this controller doesn’t have them.' : undefined
  // Silent last, as the design lists them.
  const effects = [...HAPTIC_EFFECT_CHOICES.map(String).filter(value => value !== 'OFF'), 'OFF']
  if (!effects.includes(effect)) effects.push(effect)
  return {
    id: 'rumble', label: 'Rumble', changed: gyro.changed('GYRO_HAPTIC_INTENSITY', 'GYRO_HAPTIC_INTERVAL', 'GYRO_HAPTIC_EFFECT', 'GYRO_HAPTIC_SIDE'),
    status: strength > 0 ? `${preset === 'custom' ? 'Custom' : RUMBLE_LABELS[preset]} · ${strength}% · every ${interval}°` : 'Off',
    description: 'Feel a click as you turn, like the notches on a dial.',
    content: <div data-gyro-rotation-feedback="">
      {notSteam && <Note tone="warn">{notSteam}</Note>}
      <SegmentedRow label="Rumble while aiming" hint={strength > 0 ? `${strength}%` : 'Off'} value={preset} disabled={gyro.locked}
        options={[...(['off', 'light', 'medium', 'strong'] as const).map(name => ({ value: name, label: RUMBLE_LABELS[name], caption: name === 'off' ? 'No clicks' : `${RUMBLE_PRESETS[name]}% · X feels it` })),
          { value: 'custom', label: 'Custom', caption: `${strength}% · A types a strength` }]}
        onChange={value => { if (value !== 'custom') gyro.set('GYRO_HAPTIC_INTENSITY', RUMBLE_PRESETS[value as RumblePreset]) }}
        onX={{ label: 'Feel it', run: feel }}
        data={{ 'data-setting': 'GYRO_HAPTIC_INTENSITY' }} />
      <KeyNumberRow k="GYRO_HAPTIC_INTENSITY" label="Strength" fallback={0} min={0} max={100} step={5} fineStep={1} format={value => (value > 0 ? `${value}%` : 'Off')} onX={{ label: 'Feel it', run: feel }} />
      <RowLabel>Feels like</RowLabel>
      <ModeCards columns={4} value={effect} onChange={value => gyro.set('GYRO_HAPTIC_EFFECT', value)} useLabel={card => `Use ${card.label}`}
        options={effects.map(value => ({ value, label: EFFECT_LABEL[value] ?? 'Imported firmware effect', art: <EffectArt effect={value} />, unavailable: gyro.locked }))} />
      <Note>Rumble uses the back motor. Pulse and Tap play at a fixed strength.</Note>
      <KeyNumberRow k="GYRO_HAPTIC_INTERVAL" label="Pulse every" hint="How far you turn between clicks" fallback={15} min={0.1} max={3600} step={1} fineStep={0.1} format={value => `${value}°`} />
      <KeyChoiceRow k="GYRO_HAPTIC_SIDE" label="Which side" hint="Under which thumb" fallback="3"
        options={[{ value: '1', label: 'Left pad' }, { value: '2', label: 'Right pad' }, { value: '3', label: 'Both' }]} />
    </div>,
    visual: <>
      <VisualTitle title="What you’ll feel" live={`turned ${Math.round(Math.abs(turned.degrees))}°`} />
      <RumbleDial interval={interval} turned={turned.degrees} off={strength <= 0} label={`One ${EFFECT_LABEL[effect] ?? 'pulse'} every ${interval}° · ${sideName}`} />
      <p className={styles.visualCaption}>{strength > 0 ? `One ${EFFECT_LABEL[effect] ?? 'pulse'} every ${interval}° · ${sideName}` : 'Off: turn on a strength to feel the clicks.'}</p>
      <button type="button" className={styles.feelButton} onClick={feel} data-hints="A:Feel it;B:Back">Feel it on the controller</button>
    </>,
  }
}

// ---- Tilt (a group of its own since the 2026-10-09 UX review, I7: it was five
// levels deep under Direction ▸ Advanced). The group names what tilting does and
// when; each part opens over it (TiltSettings) with the full settings.
export function useTiltGroup(open: Open, unavailable?: string, onWhileHolding?: () => void): FineTuneGroup {
  const gyro = useGyro()
  const { t } = useTranslation()
  const mode = (gyro.get('MOTION_STICK_MODE') ?? 'NO_MOUSE').toUpperCase()
  const label = TILT_LABELS[mode] ?? formatStickModeLabel(mode, t)
  const tilt = parseTiltActivation(gyro.text)
  const tiltCombined = gyroConditions(tilt.button)
  const holdButton = tilt.button && !tiltCombined ? tilt.button : defaultHoldInput(gyro.devices?.[0])
  const inner = gyro.num('MOTION_DEADZONE_INNER', 15)
  const range = Number((180 - gyro.num('MOTION_DEADZONE_OUTER', 135)).toFixed(4))
  const when = tilt.mode === 'always_on' ? 'Always' : tilt.mode === 'always_off' ? 'Off' : `${tilt.mode === 'hold_on' ? 'While I hold' : 'Unless I hold'} ${tiltCombined ? `${tiltCombined.conditions.length} inputs` : inputName(holdButton, gyro.family)}`
  const changed = gyro.changed('TILT_ON', 'TILT_OFF', 'MOTION_STICK_MODE', 'MOTION_DEADZONE_INNER', 'MOTION_DEADZONE_OUTER', 'LEAN_THRESHOLD', 'MOTION_RING_MODE', 'MOTION_STICK_AXIS', 'CONTROLLER_ORIENTATION')
  const part = (id: 'behaviour' | 'angles' | 'tuning' | 'orientation' | 'when' | 'holding') => open({ view: 'tilt', part: id })
  return {
    id: 'tilt', label: 'Tilt', changed,
    status: tilt.mode === 'always_off' ? 'Off' : `${label} · ${when.toLowerCase()}`,
    description: 'Tilt uses the controller’s angle from neutral; gyro uses how fast you turn. Both can run together.',
    content: <div data-tilt-group="">
      {unavailable && <Note tone="warn">{unavailable}</Note>}
      <SegmentedRow label="Tilt to move" hint="When tilting counts" value={tilt.mode} setting={tilt.mode === 'hold_off' ? 'TILT_OFF' : 'TILT_ON'}
        disabled={unavailable ?? gyro.locked} data={{ 'data-setting': 'TILT_ON' }}
        options={[
          { value: 'always_on', label: 'Always', caption: 'Tilt works whenever the controller is tilted' },
          { value: 'hold_on', label: 'While I hold', caption: tiltCombined ? 'Several inputs: When tilt is on' : `While ${inputName(holdButton, gyro.family)} is held` },
          { value: 'hold_off', label: 'Unless I hold', caption: tiltCombined ? 'Several inputs: When tilt is on' : `Paused while ${inputName(holdButton, gyro.family)} is held` },
          { value: 'always_off', label: 'Off', caption: 'Tilt settings and bindings are kept for later' },
        ]}
        onChange={value => gyro.setText(previous => writeTiltActivation(previous, value as GyroActivationMode, tiltCombined ? tilt.button : holdButton))} />
      <OpenRow label="Behaviour" hint="What tilting does: actions, mouse, a stick or steering" value={label} onOpen={() => part('behaviour')} disabled={unavailable} data={{ 'data-tilt-open': '' }} />
      <OpenRow label="Angles" hint="Neutral dead zone, full-output angle, lean threshold, ring" value={`${inner}° – ${range}°`} onOpen={() => part('angles')} disabled={unavailable} />
      <OpenRow label="Tuning" hint="Speed, response, flick and output for the behaviour" onOpen={() => part('tuning')} disabled={unavailable} />
      <OpenRow label="Orientation" hint="Which way is which, and how the controller is mounted" onOpen={() => part('orientation')} disabled={unavailable} />
      <OpenRow label="When tilt is on" hint="Several inputs together" value={when} onOpen={() => part('when')} disabled={unavailable} />
      {!gyro.held && onWhileHolding && <OpenRow label="Mode shift" hint="Hold a button to change what tilt does" onOpen={onWhileHolding} data={{ 'data-while-holding': 'tilt' }} />}
    </div>,
    visual: <TiltAngleVisual inner={inner} full={range} />,
  }
}
