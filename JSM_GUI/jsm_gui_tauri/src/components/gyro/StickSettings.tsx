import { useState } from 'react'
import { SubPage, FineTune, stepGroup, ModeCards, ValueRow, OpenRow, type FineTuneGroup } from '../ui/console'
import {
  correctedStickRadius, readVirtualSetting, virtualStickProblem, virtualStickValues, writeVirtualStickNumber,
  VIRTUAL_STICK_FIELDS, type VirtualStickField, type VirtualStickTarget,
} from '../../utils/virtualStickSettings'
import { gyroDeflectionEnabled, gyroDeflectionRange, writeGyroDeflectionRange } from '../../utils/gyroDeflectionSettings'
import { useGyro, KeyChoiceRow, SwitchRow, Note, VisualTitle, PadActions } from './GyroContext'
import { StickTimeline, StatTiles, VirtualStickResponse } from './visuals'
import { StickBehaviourArt } from './art'
import { GameStickMatchGuide } from '../sticks/GameStickMatchGuide'
import styles from './Gyro.module.css'

// Gyro as a stick (GyroStickSetup, GyroStickSettings): Direction ▸ Right (or
// Left) stick settings. Setup: the virtual pad, camera speed or hold the
// angle, the game's turn rate, the real stick's mix. Deadzone & curve: undo
// the game's own stick handling. Was one long GyroVirtualStick panel.

export type StickPart = 'setup' | 'deadzone'
const CONTROLLER_LABEL: Record<string, string> = { NONE: 'Off', XBOX: 'Xbox 360', DS4: 'PlayStation 4' }

type Props = { open: boolean; onClose: () => void; trail: string[]; target: VirtualStickTarget; part: StickPart; onPart: (part: StickPart) => void }

export function StickSettings({ open, onClose, trail, target, part, onPart }: Props) {
  const gyro = useGyro()
  const [guide, setGuide] = useState(false)
  const side = target === 'LEFT_STICK' ? 'left' : 'right'
  const Side = target === 'LEFT_STICK' ? 'Left' : 'Right'
  const values = virtualStickValues(gyro.text, target)
  const deflection = gyroDeflectionEnabled(gyro.text)
  const range = gyroDeflectionRange(gyro.text)
  const lock = (gyro.get('GYRO_DEFLECTION_LOCK_EXTENTS') ?? 'ON').toUpperCase() === 'ON'
  const controller = (gyro.get('VIRTUAL_CONTROLLER') ?? 'NONE').toUpperCase()
  const problem = virtualStickProblem(values)
  const live = gyro.sample?.devices?.[0]?.status?.virtualSticks?.[side] ?? null
  const steering = target === 'LEFT_STICK'

  const field = (key: VirtualStickField, label: string, hint: string, opts: { hero?: boolean; caption?: string } = {}) => {
    const meta = VIRTUAL_STICK_FIELDS[key]
    const name = `${target}_${key}`
    const current = Number(readVirtualSetting(gyro.text, name) ?? meta.default)
    const max = key === 'UNDEADZONE_INNER' ? Math.max(0, Math.min(meta.max, 0.999 - values.outer)) : key === 'UNDEADZONE_OUTER' ? Math.max(0, Math.min(meta.max, 0.999 - values.inner)) : meta.max
    return <ValueRow label={label} hint={hint} hero={opts.hero} caption={opts.caption} setting={gyro.held ? undefined : name}
      value={Number((current * meta.factor).toFixed(3))} min={meta.min * meta.factor} max={max * meta.factor} step={meta.step * meta.factor} fineStep={(meta.step * meta.factor) / 10}
      format={value => `${value}${meta.unit}`} disabled={gyro.locked}
      onChange={next => gyro.setText(previous => writeVirtualStickNumber(previous, target, key, next / meta.factor, gyro.text))}
      onReset={readVirtualSetting(gyro.text, name) !== undefined ? () => gyro.reset(name) : undefined} data={{ 'data-setting': name }} />
  }

  const setupChanged = gyro.changed('VIRTUAL_CONTROLLER', 'GYRO_STICK_DEFLECTION', 'GYRO_DEFLECTION_RANGE', 'GYRO_DEFLECTION_LOCK_EXTENTS', 'VIRTUAL_STICK_CALIBRATION', `${target}_VIRTUAL_SCALE`)
  const deadzoneChanged = gyro.changed(`${target}_UNDEADZONE_INNER`, `${target}_UNDEADZONE_OUTER`, `${target}_UNPOWER`, `${target}_DEADZONE_PROBE`)
  const groups: FineTuneGroup[] = [
    {
      id: 'setup', label: 'Setup', changed: setupChanged,
      status: `${CONTROLLER_LABEL[controller] ?? controller} pad · ${deflection ? 'hold the angle' : steering ? 'rotation speed' : 'camera speed'}`,
      detail: 'Virtual pad, camera speed or hold the angle, game turn rate, real stick mix',
      description: `Gyro becomes a ${side} stick. The game decides what that stick does.`,
      content: <div data-virtual-stick={target}>
        <KeyChoiceRow k="VIRTUAL_CONTROLLER" label="Virtual pad" hint="For the whole configuration" fallback="NONE"
          options={[{ value: 'NONE', label: 'Off' }, { value: 'XBOX', label: 'Xbox 360' }, { value: 'DS4', label: 'PlayStation 4' }]} />
        {controller === 'NONE' && <Note tone="warn">Gyro to a stick needs a virtual pad. Choose Xbox 360 or PlayStation 4.</Note>}
        {problem && <Note tone="warn">{problem} Imported values are kept until you change them.</Note>}
        <ModeCards variant="compare" columns={2} value={deflection ? 'ON' : 'OFF'} onChange={value => gyro.set('GYRO_STICK_DEFLECTION', value === 'ON' ? 'ON' : 'OFF')}
          useLabel={card => `Use ${card.label}`}
          options={[
            { value: 'OFF', label: steering ? 'Rotation speed' : 'Camera speed', caption: 'Turn faster, stick goes further. Stop, it re-centres.', art: <StickBehaviourArt kind="speed" />, unavailable: gyro.locked },
            { value: 'ON', label: 'Hold the angle', caption: 'Tilt to push the stick; hold still and it stays.', art: <StickBehaviourArt kind="angle" />, unavailable: gyro.locked },
          ]} />
        {!deflection ? <>
          <ValueRow label="Game turn rate at full stick" hint="Camera speed at full stick, with the game’s current settings; shared with flick output" setting={gyro.held ? undefined : 'VIRTUAL_STICK_CALIBRATION'}
            value={values.maxSpeed} min={1} max={20000} step={30} fineStep={1} format={value => `${value} °/s`} disabled={gyro.locked}
            onChange={value => gyro.set('VIRTUAL_STICK_CALIBRATION', value)} onReset={gyro.get('VIRTUAL_STICK_CALIBRATION') !== undefined ? () => gyro.reset('VIRTUAL_STICK_CALIBRATION') : undefined}
            data={{ 'data-setting': 'VIRTUAL_STICK_CALIBRATION' }} />
          <OpenRow label={steering ? 'Tune camera output' : 'Tune for this game'} hint={steering ? 'For games that use the left stick as a camera. For driving, use Set up tilt steering under Direction.' : '6 steps: output, turn rate, deadzone, curve and slow/fast aim'}
            value="Start" onOpen={() => setGuide(true)} hints="A:Start;B:Back" data={{ 'data-stick-guide-open': '' }} />
          <Note>Best for aiming. A full turn in a set time tells us the game’s top speed.</Note>
        </> : <>
          {range.problem && <Note tone="warn">{range.problem}</Note>}
          {(['x', 'y'] as const).map(axis => <ValueRow key={axis} label={axis === 'x' ? 'Full stick at, left/right' : 'Full stick at, up/down'} hint="Degrees of turn from neutral to full stick"
            setting={gyro.held ? undefined : 'GYRO_DEFLECTION_RANGE'} value={range[axis]} min={1} max={180} step={1} fineStep={0.1} format={value => `${value}°`} disabled={gyro.locked}
            onChange={next => gyro.setText(previous => writeGyroDeflectionRange(previous, gyro.text, axis, next))}
            onReset={gyro.get('GYRO_DEFLECTION_RANGE') !== undefined ? () => gyro.reset('GYRO_DEFLECTION_RANGE') : undefined} data={{ 'data-setting': 'GYRO_DEFLECTION_RANGE' }} />)}
          <SwitchRow label="Lock at the limits" hint="Turn back to move at once; off remembers turning past the limit" on={lock} setting="GYRO_DEFLECTION_LOCK_EXTENTS" disabled={gyro.locked}
            onChange={next => gyro.set('GYRO_DEFLECTION_LOCK_EXTENTS', next ? 'ON' : 'OFF')} />
          <Note>Bind Recenter gyro deflection to a button to capture a fresh neutral. Filters and drift calibration affect the angle; turn speed, speed-up, snapping and click steadying don’t. A held Gyro trackball clutches the angle instead of coasting.</Note>
        </>}
        {field('VIRTUAL_SCALE', 'Real stick adds', `Your ${side} stick still aims; this scales it`)}
      </div>,
      visual: <>
        <VisualTitle title="Turn, then stop" live />
        <StickTimeline deflection={deflection} />
      </>,
    },
    {
      id: 'deadzone', label: 'Deadzone & curve', changed: deadzoneChanged,
      status: deadzoneChanged ? `Changed: skip deadzone ${Math.round(values.inner * 100)}%` : 'Default',
      detail: 'Skip the game’s deadzone, full speed sooner, undo its curve, test signal',
      description: 'Undo the game’s own stick handling, so small turns aren’t lost.',
      content: <div data-virtual-stick={target}>
        {field('UNDEADZONE_INNER', 'Skip the game’s deadzone', 'Counter the game’s inner deadzone', { hero: true, caption: 'With the test signal on, raise it until the camera just starts to creep, then back off a touch.' })}
        <SwitchRow label="Deadzone test signal" hint="Holds the stick at that edge; turn off when done" setting={`${target}_DEADZONE_PROBE`} on={values.probe} disabled={gyro.locked}
          onChange={next => gyro.set(`${target}_DEADZONE_PROBE`, next ? 'ON' : 'OFF')}
          onReset={gyro.get(`${target}_DEADZONE_PROBE`) !== undefined ? () => gyro.reset(`${target}_DEADZONE_PROBE`) : undefined} />
        {field('UNDEADZONE_OUTER', 'Full speed sooner', 'If the game maxes out before the edge')}
        {field('UNPOWER', 'Undo the game’s curve', '0 or 1 is straight; 2 undoes a squared curve')}
        <Note>Inner and Full speed sooner together stay under 100%.</Note>
      </div>,
      visual: <>
        <VisualTitle title={`Your virtual ${side} stick`} live={values.probe ? 'test signal on' : true} />
        <VirtualStickResponse inner={values.inner} live={live}
          curve={x => correctedStickRadius(x, values.inner, values.outer, values.exponent, values.probe)}
          label={deflection ? 'Stick sent for each angle from neutral' : 'Stick sent for each camera speed you ask for'} />
        <StatTiles tiles={[
          { label: 'Virtual pad', value: CONTROLLER_LABEL[controller] ?? controller },
          { label: deflection ? 'Full stick at' : 'Game turn rate', value: deflection ? `${range.x}° · ${range.y}°` : `${values.maxSpeed} °/s` },
          { label: 'Stick now', value: live ? `${live.x.toFixed(2)}, ${live.y.toFixed(2)}` : 'No output read' },
        ]} />
        <p className={styles.visualCaption}>{live ? 'Dashed is the game without the fix. The live dot is what the game receives.' : 'Dashed is the game without the fix. Live output appears once the mapper reports it for the applied configuration.'}</p>
      </>,
    },
  ]
  return (
    <SubPage open={open} onClose={onClose} trail={trail} title={`${Side} stick settings`} stepLabel="Part" backLabel="Back to Direction"
      onStep={direction => onPart(stepGroup(groups, part, direction) as StickPart)}
      hints={gyro.callbacks.onTryIt ? [{ button: 'X', label: 'Try it' }] : undefined}
      where={`${trail.join(' · ')} · ${Side} stick · ${part === 'setup' ? 'Setup' : 'Deadzone & curve'}`}>
      <PadActions x={gyro.callbacks.onTryIt}><FineTune railLabel="Part" groups={groups} active={part} onActive={id => onPart(id as StickPart)} /></PadActions>
      {guide && <GameStickMatchGuide open onClose={() => setGuide(false)} text={gyro.text} setText={gyro.setText} target={target} trail={[...trail, `${Side} stick settings`]}
        live={live ? Math.hypot(live.x, live.y) : 0} />}
    </SubPage>
  )
}
