import { useTranslation } from 'react-i18next'
import { SubPage, FineTune, stepGroup, ModeCards, ValueRow, SegmentedRow, OpenRow, type FineTuneGroup } from '../ui/console'
import { SourceModeTuning } from '../SourceModeTuning'
import { STICK_MODE_VALUES, formatStickModeLabel } from '../../constants/sticks'
import { parseGyroActivation, parseTiltActivation } from '../../utils/gyroActivation'
import { readVirtualSetting, writeVirtualSetting } from '../../utils/virtualStickSettings'
import { useGyro, KeyNumberRow, KeyChoiceRow, Note, RowLabel, VisualTitle } from './GyroContext'
import { ActivationEditor, WhenOnVisual } from './WhenOn'
import { liveGyro } from './visuals'
import styles from './Gyro.module.css'

// Tilt (D6): Gyro ▸ Fine-tune ▸ Direction ▸ Advanced ▸ Tilt, a sub-page on the
// same rail. Tilt uses the controller's angle from a neutral position, where
// gyro uses its rotation speed; both can run together. Every tilt setting the
// old Tilt section had is here: behaviour (incl. steering), angles, tuning,
// orientation, when tilt is on, and tilt while holding a button.

export type TiltPart = 'behaviour' | 'angles' | 'tuning' | 'orientation' | 'when' | 'holding'

const DESCRIPTIONS: Record<string, string> = {
  NO_MOUSE: 'Tilt up, down, left or right to hold that Tilt action (Buttons ▸ Tilt gestures).',
  AIM: 'Hold a tilt to keep moving the mouse; more tilt is faster. Back to neutral stops.',
  FLICK: 'Tilt towards a direction to flick the camera there, then circle to turn.',
  FLICK_ONLY: 'Tilt towards a direction to flick the camera there; circling doesn’t keep turning.',
  ROTATE_ONLY: 'Circle the tilt around neutral to turn the camera, without the flick.',
  MOUSE_AREA: 'Tilt moves the cursor within an area around where it started.',
  MOUSE_RING: 'Tilt places the cursor on a ring around the screen centre.',
  SCROLL_WHEEL: 'Circle the tilt to step Tilt left / Tilt right, for scrolling or cycling.',
  HYBRID_AIM: 'Changes in tilt move the aim, plus continuous mouse aiming.',
  INNER_RING: 'Directions, plus the Tilt ring action near neutral.',
  OUTER_RING: 'Directions, plus the Tilt ring action towards full tilt.',
  LEFT_STICK: 'Tilt sets the virtual left stick; hold a tilt to hold it.',
  RIGHT_STICK: 'Tilt sets the virtual right stick; hold a tilt to hold it.',
  LEFT_STEER_X: 'Lean like a wheel to steer the virtual left stick. Forward/back is ignored.',
  RIGHT_STEER_X: 'Lean like a wheel to steer the virtual right stick.',
  LEFT_ANGLE_TO_X: 'The tilt’s direction sets the left stick’s horizontal axis.',
  LEFT_ANGLE_TO_Y: 'The tilt’s direction sets the left stick’s vertical axis.',
  RIGHT_ANGLE_TO_X: 'The tilt’s direction sets the right stick’s horizontal axis.',
  RIGHT_ANGLE_TO_Y: 'The tilt’s direction sets the right stick’s vertical axis.',
  LEFT_WIND_X: 'Circle to wind up left stick steering; less tilt unwinds it.',
  RIGHT_WIND_X: 'Circle to wind up right stick steering; less tilt unwinds it.',
}
// Behaviour names reuse the Sticks' card names in sentence case (UX review);
// tilt-only behaviours get their own.
export const TILT_LABELS: Record<string, string> = {
  NO_MOUSE: 'Directional actions', AIM: 'Tilt to mouse', LEFT_STICK: 'Tilt → left stick', RIGHT_STICK: 'Tilt → right stick',
  LEFT_STEER_X: 'Steering → left stick', RIGHT_STEER_X: 'Steering → right stick',
  FLICK: 'Flick to turn', FLICK_ONLY: 'Flick only', ROTATE_ONLY: 'Turn only', HYBRID_AIM: 'Aim + flick', MOUSE_AREA: 'Mouse area', MOUSE_RING: 'Mouse ring',
  SCROLL_WHEEL: 'Scroll wheel', INNER_RING: 'Directions + inner ring', OUTER_RING: 'Directions + outer ring',
  LEFT_ANGLE_TO_X: 'Angle → left stick X', LEFT_ANGLE_TO_Y: 'Angle → left stick Y', RIGHT_ANGLE_TO_X: 'Angle → right stick X', RIGHT_ANGLE_TO_Y: 'Angle → right stick Y',
  LEFT_WIND_X: 'Wind-up steering → left stick', RIGHT_WIND_X: 'Wind-up steering → right stick',
}
const LABELS = TILT_LABELS
const GROUPS = [
  { label: 'Button actions', test: (mode: string) => ['NO_MOUSE', 'INNER_RING', 'OUTER_RING', 'SCROLL_WHEEL'].includes(mode) },
  { label: 'Mouse and camera', test: (mode: string) => ['AIM', 'HYBRID_AIM', 'FLICK', 'FLICK_ONLY', 'ROTATE_ONLY', 'MOUSE_AREA', 'MOUSE_RING'].includes(mode) },
  { label: 'Virtual stick and steering', test: (mode: string) => mode.startsWith('LEFT_') || mode.startsWith('RIGHT_') },
]
const MOUNTING = [{ value: 'FORWARD', label: 'Forward' }, { value: 'LEFT', label: 'Left' }, { value: 'RIGHT', label: 'Right' }, { value: 'BACKWARD', label: 'Backward' }, { value: 'JOYCON_SIDEWAYS', label: 'Sideways Joy-Con pair' }]

type Props = { open: boolean; onClose: () => void; trail: string[]; part: TiltPart; onPart: (part: TiltPart) => void; onWhileHolding?: () => void; held?: boolean }

export function TiltSettings({ open, onClose, trail, part, onPart, onWhileHolding, held }: Props) {
  const gyro = useGyro()
  const { t } = useTranslation()
  const mode = (gyro.get('MOTION_STICK_MODE') ?? 'NO_MOUSE').toUpperCase()
  const label = (value: string) => LABELS[value] ?? formatStickModeLabel(value, t)
  const inner = gyro.num('MOTION_DEADZONE_INNER', 15)
  const outer = gyro.num('MOTION_DEADZONE_OUTER', 135)
  const range = Number((180 - outer).toFixed(4))
  const axis = (gyro.get('MOTION_STICK_AXIS') ?? 'STANDARD STANDARD').toUpperCase().split(/\s+/)
  const virtual = mode.startsWith('LEFT_') || mode.startsWith('RIGHT_')
  const tiltOn = parseTiltActivation(gyro.text)
  const bothEnabled = tiltOn.mode !== 'always_off' && parseGyroActivation(gyro.text).mode !== 'always_off'
  const gyroOutput = (gyro.get('GYRO_OUTPUT') ?? 'MOUSE').toUpperCase()
  const controller = (gyro.get('VIRTUAL_CONTROLLER') ?? 'NONE').toUpperCase()
  const modes = [...STICK_MODE_VALUES.filter(value => value !== 'RADIAL_MENU'), 'LEFT_STEER_X', 'RIGHT_STEER_X']
  if (!modes.includes(mode)) modes.push(mode)

  const setPair = (key: string, index: 0 | 1, value: number, fallback: number) => gyro.setText(previous => {
    const pair = (readVirtualSetting(gyro.text, key) ?? String(fallback)).split(/\s+/).map(Number)
    if (pair.length === 1) pair.push(pair[0])
    pair[index] = value
    return writeVirtualSetting(previous, key, pair.join(' '))
  })
  const pairRow = (key: string, rowLabel: string, index: 0 | 1, fallback: number, min: number, max: number, step: number, unit: string, hint?: string) => {
    const parts = (gyro.get(key) ?? String(fallback)).split(/\s+/).map(Number)
    const value = parts[index] ?? parts[0]
    return <ValueRow key={key + index} label={rowLabel} hint={hint} value={value} min={min} max={max} step={step} format={v => `${v}${unit}`} disabled={gyro.locked}
      onChange={next => setPair(key, index, next, fallback)} onReset={gyro.get(key) !== undefined ? () => gyro.reset(key) : undefined} data={{ 'data-setting': key }} />
  }

  const warnings = <>
    {bothEnabled && virtual && gyroOutput === (mode.startsWith('LEFT_') ? 'LEFT_STICK' : 'RIGHT_STICK') && <Note tone="warn">Gyro and tilt send the same stick and can fight; gyro can overwrite tilt steering. Send gyro somewhere else, or set gyro to Mouse and When gyro is on to Off.</Note>}
    {bothEnabled && ['AIM', 'HYBRID_AIM', 'FLICK', 'FLICK_ONLY', 'ROTATE_ONLY', 'MOUSE_AREA', 'MOUSE_RING'].includes(mode) && gyroOutput === 'MOUSE' && <Note tone="warn">Gyro and tilt both move the mouse, and their movement adds up. For tilt alone, set When gyro is on to Off.</Note>}
    {virtual && controller !== 'DS4' && controller !== 'XBOX' && <Note tone="warn">Tilt to a stick needs a virtual pad: Direction ▸ Stick settings ▸ Virtual pad.</Note>}
  </>

  const groups: FineTuneGroup[] = [
    {
      id: 'behaviour', label: 'Behaviour', status: label(mode), changed: gyro.changed('MOTION_STICK_MODE'),
      detail: 'What tilting does: actions, mouse, a stick or steering',
      description: DESCRIPTIONS[mode] ?? 'This configuration uses a custom tilt behaviour.',
      content: <div data-tilt-behaviour="">
        {warnings}
        {GROUPS.map(group => (
          <ModeCards key={group.label} label={group.label} columns={3} value={mode} useLabel={card => `Use ${card.label}`}
            onChange={value => gyro.set('MOTION_STICK_MODE', value)}
            options={modes.filter(group.test).map(value => ({ value, label: label(value), caption: DESCRIPTIONS[value], unavailable: gyro.locked }))} />
        ))}
        <Note>Bind Set tilt neutral under Buttons to capture your comfortable holding angle as the centre.</Note>
      </div>,
    },
    {
      id: 'angles', label: 'Angles', status: `Dead below ${inner}° · full at ${range}°`, changed: gyro.changed('MOTION_DEADZONE_INNER', 'MOTION_DEADZONE_OUTER', 'LEAN_THRESHOLD', 'MOTION_RING_MODE'),
      detail: 'Neutral deadzone, full-output angle, lean threshold, ring',
      description: 'How far you tilt before anything happens, and where it is full.',
      content: <>
        <KeyNumberRow k="MOTION_DEADZONE_INNER" hero label="Neutral tilt deadzone" hint="Tilt below this angle does nothing" fallback={15} min={0} max={Math.max(0, range - 0.1)} step={1} fineStep={0.1} format={v => `${v}°`} />
        <ValueRow label="Full output at" hint="Tilt at or past this angle is full; must be past the deadzone" value={range} min={Math.min(180, inner + 0.1)} max={180} step={1} fineStep={0.1} format={v => `${v}°`}
          disabled={gyro.locked} onChange={next => gyro.set('MOTION_DEADZONE_OUTER', Number((180 - next).toFixed(4)))}
          onReset={gyro.get('MOTION_DEADZONE_OUTER') !== undefined ? () => gyro.reset('MOTION_DEADZONE_OUTER') : undefined} data={{ 'data-setting': 'MOTION_DEADZONE_OUTER' }} />
        <KeyNumberRow k="LEAN_THRESHOLD" label="Lean action threshold" hint="Leaning past this presses Lean left / Lean right" fallback={15} min={0} max={89} step={1} format={v => `${v}°`} />
        <KeyChoiceRow k="MOTION_RING_MODE" label="Tilt ring" hint="Where the Tilt ring action is held" fallback="OUTER" options={[{ value: 'INNER', label: 'Near neutral' }, { value: 'OUTER', label: 'Towards full tilt' }]} />
      </>,
      visual: <TiltAngleVisual inner={inner} full={range} />,
    },
    {
      id: 'tuning', label: 'Tuning', status: `For ${label(mode).toLowerCase()}`, changed: gyro.changed('STICK_SENS', 'STICK_POWER', 'STICK_ACCELERATION_RATE', 'STICK_ACCELERATION_CAP', 'FLICK_TIME', 'MOUSE_RING_RADIUS', 'SCROLL_SENS'),
      detail: 'Speed, response, flick and output for the behaviour',
      description: `Tilt tuning · ${label(mode)}`,
      content: <div data-tilt-tuning="">
        {['AIM', 'HYBRID_AIM'].includes(mode) && <>
          {pairRow('STICK_SENS', 'Left/right tilt mouse speed', 0, 360, 0, 1200, 1, ' °/s', 'Camera speed at full tilt')}
          {pairRow('STICK_SENS', 'Up/down tilt mouse speed', 1, 360, 0, 1200, 1, ' °/s')}
          <KeyNumberRow k="STICK_ACCELERATION_RATE" label="Speed-up rate" hint="How fast holding full tilt speeds up; 0 is off" fallback={0} min={0} max={50} step={0.1} />
          <KeyNumberRow k="STICK_ACCELERATION_CAP" label="Speed-up cap" hint="The most it speeds up" fallback={1000000} min={1} max={1000000} step={1} />
        </>}
        {['AIM', 'HYBRID_AIM', 'LEFT_STEER_X', 'RIGHT_STEER_X'].includes(mode) && <KeyNumberRow k="STICK_POWER" label="Tilt response curve" hint="1 is straight; higher is gentler near neutral" fallback={1} min={0.01} max={8} step={0.1} fineStep={0.01} />}
        {['FLICK', 'FLICK_ONLY'].includes(mode) && <>
          <KeyNumberRow k="FLICK_TIME" label="Flick time" fallback={0.1} min={0} max={1} step={0.01} format={v => `${v} s`} />
          <KeyNumberRow k="FLICK_TIME_EXPONENT" label="Flick time exponent" fallback={0} min={0} max={2} step={0.1} />
          <KeyChoiceRow k="FLICK_SNAP_MODE" label="Flick snapping" fallback="NONE" options={[{ value: 'NONE', label: 'Off' }, { value: '4', label: 'Four directions' }, { value: '8', label: 'Eight directions' }]} />
          <KeyNumberRow k="FLICK_SNAP_STRENGTH" label="Flick snap strength" fallback={1} min={0} max={1} step={0.01} />
          <KeyNumberRow k="FLICK_DEADZONE_ANGLE" label="Flick forward deadzone" fallback={0} min={0} max={180} step={1} format={v => `${v}°`} />
        </>}
        {mode === 'MOUSE_AREA' && <KeyNumberRow k="MOUSE_RING_RADIUS" label="Tilt cursor travel" fallback={128} min={0} max={4000} step={10} format={v => `${v} px`} />}
        {mode === 'SCROLL_WHEEL' && <>
          <Note>Bind Tilt left and Tilt right under Buttons ▸ Tilt gestures to what each step does.</Note>
          {pairRow('SCROLL_SENS', 'Tilt rotation per step', 0, 30, 0.1, 180, 1, '°')}
        </>}
        {['NO_MOUSE', 'INNER_RING', 'OUTER_RING'].includes(mode) && <>
          <Note>Edit the direction and ring bindings under Buttons ▸ Tilt gestures. Angles sets where they engage.</Note>
          <OpenRow label="Nothing to tune for this behaviour" hint="Pick a mouse, camera or stick behaviour to tune its speed and response" value="Behaviour" onOpen={() => onPart('behaviour')} />
        </>}
        <SourceModeTuning mode={mode} configText={gyro.text} onConfigTextChange={gyro.setText} disabled={Boolean(gyro.locked)} />
        <Note>Aim, flick and output tuning is shared with the sticks that use the same behaviour. Held settings apply while their button is held.</Note>
      </div>,
    },
    {
      id: 'orientation', label: 'Orientation', status: `${axis[0] === 'INVERTED' || axis[1] === 'INVERTED' ? 'Inverted' : 'Normal'} · ${MOUNTING.find(item => item.value === (gyro.get('CONTROLLER_ORIENTATION') ?? 'FORWARD').toUpperCase())?.label ?? 'Custom'}`,
      changed: gyro.changed('MOTION_STICK_AXIS', 'CONTROLLER_ORIENTATION'),
      detail: 'Which way is which, and how the controller is mounted',
      description: 'Inversion and mounting direction. Gyro’s own direction is under Direction.',
      content: <>
        {(['Left/right', 'Up/down'] as const).map((name, index) => (
          <ValueRowChoice key={name} label={`${name} tilt direction`} value={(axis[index] ?? axis[0]) === 'INVERTED' ? 'INVERTED' : 'STANDARD'}
            onChange={next => { const pair = [axis[0] ?? 'STANDARD', axis[1] ?? axis[0] ?? 'STANDARD']; pair[index] = next; gyro.set('MOTION_STICK_AXIS', pair.join(' ')) }} />
        ))}
        <KeyChoiceRow k="CONTROLLER_ORIENTATION" label="Controller mounting direction" hint="Which way the controller faces; gyro’s Turn using is separate" fallback="FORWARD" options={MOUNTING} />
      </>,
    },
    {
      id: 'when', label: 'When tilt is on', status: tiltOn.mode === 'always_on' ? 'Always' : tiltOn.mode === 'always_off' ? 'Off' : tiltOn.mode === 'hold_on' ? 'While I hold…' : 'Unless I hold…',
      changed: gyro.changed('TILT_ON', 'TILT_OFF'),
      detail: 'Tilt activation and combined inputs',
      description: 'Tilt has its own on and off, separate from gyro.',
      content: <ActivationEditor source="tilt" />,
      visual: <WhenOnVisual source="tilt" />,
    },
  ]
  if (!held && onWhileHolding) groups.push({
    id: 'holding', label: 'Mode shift', status: 'Tilt changes while a button is held', detail: 'Tilt behaviour and tuning for a held button',
    description: 'Hold a button to change what tilt does.',
    content: <RowLabelOpen onOpen={onWhileHolding} />,
  })
  const active = groups.some(group => group.id === part) ? part : 'behaviour'
  return (
    <SubPage open={open} onClose={onClose} trail={trail} title="Tilt" stepLabel="Part" backLabel="Back"
      onStep={direction => onPart(stepGroup(groups, active, direction) as TiltPart)}
      where={`${trail.join(' · ')} · Tilt · ${groups.find(group => group.id === active)?.label ?? ''}`}>
      <div data-tilt="" id="gyro-motion">
        <FineTune railLabel="Part" groups={groups} active={active} onActive={id => onPart(id as TiltPart)}
          railNote={<>Tilt uses your angle from neutral; gyro uses how fast you turn. Both can run together. Live: {tiltText(liveGyro(gyro.sample))}</>} />
      </div>
    </SubPage>
  )
}

const tiltText = (gyro: { x: number; y: number; z: number } | null) => (gyro ? `${Math.round(Math.abs(gyro.x) + Math.abs(gyro.z))} °/s of tilting` : 'no controller')

function ValueRowChoice({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const gyro = useGyro()
  return <SegmentedRow label={label} value={value} disabled={gyro.locked} setting="MOTION_STICK_AXIS" onChange={onChange}
    options={[{ value: 'STANDARD', label: 'Normal' }, { value: 'INVERTED', label: 'Inverted' }]} data={{ 'data-setting': 'MOTION_STICK_AXIS' }} />
}
function RowLabelOpen({ onOpen }: { onOpen: () => void }) {
  return <>
    <RowLabel>Held buttons</RowLabel>
    <OpenRow label="Mode shift" hint="Hold a button to change tilt behaviour, angles or tuning" onOpen={onOpen} data={{ 'data-while-holding': 'tilt' }} />
  </>
}

/** Angles: the deadzone and full-output angle as a tilt dial. */
export function TiltAngleVisual({ inner, full }: { inner: number; full: number }) {
  const gyro = useGyro()
  const cx = 210, cy = 210, r = 170
  const at = (deg: number) => { const a = ((deg - 90) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] }
  const arc = (from: number, to: number) => { const [x1, y1] = at(from), [x2, y2] = at(to); return `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${Math.abs(to - from) > 180 ? 1 : 0} 1 ${x2} ${y2} Z` }
  const clampDeg = (deg: number) => Math.min(90, Math.max(0, deg))
  return <>
    <VisualTitle title="How far you tilt" live={gyro.sample ? true : undefined} />
    <svg className={styles.graph} viewBox="0 0 420 240" role="img" aria-label={`Nothing below ${inner}°, full at ${full}°`}>
      <path className={styles.band} d={arc(-clampDeg(inner), clampDeg(inner))} />
      <path className={styles.area} d={arc(clampDeg(inner), clampDeg(full))} />
      <path className={styles.area} d={arc(-clampDeg(full), -clampDeg(inner))} />
      <text className={styles.markLabel} x={cx} y={cy - r - 6 + 20} textAnchor="middle">Dead below {inner}°</text>
      <text className={styles.markLabel} x={cx} y={234} textAnchor="middle">Full past {full}°</text>
    </svg>
  </>
}
