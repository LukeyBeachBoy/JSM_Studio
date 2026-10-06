import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { SummaryRow, ExpandRow } from './ui/SummaryRow'
import { Sheet } from './ui/Sheet'
import { SettingPrefix } from './SettingOrigin'
import { VirtualStickProbe } from './VirtualStickProbe'
import type { TelemetrySample } from '../hooks/useTelemetry'
import { correctedStickRadius, readVirtualSetting, VIRTUAL_STICK_FIELDS, virtualStickProblem, virtualStickValues,
  writeVirtualSetting, writeVirtualStickNumber, type VirtualStickField, type VirtualStickTarget } from '../utils/virtualStickSettings'
import styles from './GyroVirtualStick.module.css'
import { writeGyroActivation, writeTiltActivation } from '../utils/gyroActivation'
import { gyroDeflectionEnabled, gyroDeflectionRange, writeGyroDeflectionRange } from '../utils/gyroDeflectionSettings'

type Props = { text: string; target: VirtualStickTarget; prefix?: string; disabled?: boolean; sample?: TelemetrySample | null;
  setText: Dispatch<SetStateAction<string>>; scopeControls?: ReactNode }

const STEPS = [
  { title: 'Choose controller output', detail: 'Enable Xbox or DS4 output below. Use the Device visibility page to hide duplicate physical input when needed. For controller-only gameplay, every binding and source must also use controller outputs.' },
  { title: 'Set the game’s camera sensitivity', detail: 'Set stick sensitivity high and disable camera acceleration if the game permits it. Keep those game settings fixed during calibration.' },
  { title: 'Measure maximum turn rate', detail: 'Hold the target stick at full tilt and time one complete camera turn. Enter that time below: JSM uses 360 ÷ seconds as its maximum game turn rate.' },
  { title: 'Find the inner deadzone', detail: 'Enable Deadzone test signal, rest the controller and increase Inner anti-deadzone until the camera just starts moving; then reduce it slightly. Test this in a quiet, safe in-game location. Turn the test signal off after calibration.' },
  { title: 'Compensate the response curve', detail: 'Start with exponent 1. If small turns are too slow relative to large turns, try 2, then compare equal physical rotations at different speeds. Use outer correction if the game reaches maximum speed before full tilt.' },
  { title: 'Test slow aim and fast turns', detail: 'Turn off Deadzone test signal for zero idle output. Use the sensitivity section for independent horizontal and vertical gain. Test micro-adjustments, fast turns and activation ratcheting. Finishing this guide turns off the test signal; the game still caps turn rate.' },
] as const

export function GyroVirtualStick({ text, target, prefix = '', disabled, sample, setText, scopeControls }: Props) {
  const steeringTarget = target === 'LEFT_STICK'
  const [guide, setGuide] = useState(false)
  const [step, setStep] = useState(0)
  const values = virtualStickValues(text, target, prefix)
  const deflection = gyroDeflectionEnabled(text, prefix)
  const range = gyroDeflectionRange(text, prefix)
  const lockExtents = readVirtualSetting(text, 'GYRO_DEFLECTION_LOCK_EXTENTS', prefix) ?? 'ON'
  const controller = readVirtualSetting(text, 'VIRTUAL_CONTROLLER') ?? 'NONE'
  const problem = virtualStickProblem(values)
  const write = (key: string, value: string | number, scoped = prefix) => setText(previous => writeVirtualSetting(previous, key, value, scoped))
  const curve = useMemo(() => Array.from({ length: 101 }, (_, index) => {
    const x = index / 100
    const radius = correctedStickRadius(x, values.inner, values.outer, values.exponent, values.probe)
    return `${index ? 'L' : 'M'}${30 + x * 320},${180 - radius * 150}`
  }).join(' '), [values.inner, values.outer, values.exponent, values.probe])
  const probe = <VirtualStickProbe text={text} target={target} prefix={prefix} disabled={disabled} setText={setText} />
  const field = (key: VirtualStickField) => {
    const meta = VIRTUAL_STICK_FIELDS[key]
    const name = target + '_' + key
    const current = Number(readVirtualSetting(text, name, prefix) ?? meta.default)
    const max = key === 'UNDEADZONE_INNER' ? Math.max(0, Math.min(meta.max, 0.999 - values.outer))
      : key === 'UNDEADZONE_OUTER' ? Math.max(0, Math.min(meta.max, 0.999 - values.inner)) : meta.max
    return <SummaryRow key={key} setting={name} label={meta.label} hint={key === 'VIRTUAL_SCALE' ? 'Scale physical stick input before combining it with gyro output.' : meta.hint} help={key === 'UNDEADZONE_INNER' ? 'Matches the game’s inner stick deadzone. Use the test signal to find the largest value that does not move the controlled action, then disable it after tuning.' : key === 'VIRTUAL_SCALE' ? 'Scales the physical stick contribution before mixing with gyro. It does not change gyro sensitivity.' : meta.help}
      value={`${Number((current * meta.factor).toFixed(3))}${meta.unit}`} disabled={disabled}
      adjust={{ kind: 'number', value: current * meta.factor, min: meta.min * meta.factor, max: max * meta.factor,
        step: meta.step * meta.factor, fineStep: meta.step * meta.factor / 10,
        onChange: next => setText(previous => writeVirtualStickNumber(previous, target, key, next / meta.factor, text, prefix)) }} />
  }
  return <SettingPrefix prefix={prefix}>
    <div className={styles.panel} data-virtual-stick={target}>
      <p className={styles.intro}>{deflection ? 'Relative angular travel sets joystick position. Hold still to keep that position; release gyro activation to capture a new neutral next time.' : `Controller rotation speed becomes a ${target === 'LEFT_STICK' ? 'left' : 'right'} joystick signal. The game decides whether that stick controls movement, steering or a camera. These corrections counter the game’s stick processing.`}</p>
      {steeringTarget && <SummaryRow label="Set up tilt steering" hint="Shortcut to Tilt below: enables tilt steering on the left stick and turns off gyro aiming. Changes stay in the editable profile until applied." value="Configure"
        disabled={disabled} onActivate={() => {
          setText(previous => {
            let next = writeVirtualSetting(previous, 'MOTION_STICK_MODE', 'LEFT_STEER_X', prefix)
            next = writeVirtualSetting(next, 'GYRO_OUTPUT', 'MOUSE', prefix)
            next = writeGyroActivation(next, 'always_off', 'R3', prefix)
            return writeTiltActivation(next, 'always_on', 'R3', prefix)
          })
          const section = document.getElementById('gyro-motion')
          section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          section?.querySelector<HTMLButtonElement>('button[role=combobox], button')?.focus({ preventScroll: true })
        }} />}
      {steeringTarget && <p>For wheel-style driving, choose Tilt → Tilt behaviour → Steering → left stick. This uses controller lean for horizontal steering. Use gyro Output → Mouse with Activation → Always off to prevent competing gyro output; use Tilt activation to control steering independently. Enable Xbox or PlayStation 4 virtual output and bind Set tilt neutral to a button.</p>}
      <SummaryRow setting="GYRO_STICK_DEFLECTION" label="Joystick behavior" value={deflection ? 'Angular deflection' : steeringTarget ? 'Rotation speed' : 'Camera velocity'} disabled={disabled}
        help="Rotation-speed output returns the stick to center when you stop rotating. Angular deflection integrates the selected filtered gyro axes from activation neutral, holding the stick away from center until you rotate back. This is relative angular travel, not an absolute orientation sensor."
        adjust={{ kind: 'choice', value: deflection ? 'ON' : 'OFF', options: [{ value: 'OFF', label: steeringTarget ? 'Rotation speed' : 'Camera velocity', description: 'Map how fast you rotate the controller to virtual stick output.' }, { value: 'ON', label: 'Angular deflection', description: 'Map the angle away from neutral to virtual stick output. Hold an angle to keep the stick deflected.' }], onChange: next => { setGuide(false); write('GYRO_STICK_DEFLECTION', next) } }} />
      {deflection && <>
        {scopeControls}
        {range.problem && <p role="alert" className={styles.warning}>{range.problem}</p>}
        {(['x', 'y'] as const).map(axis => <SummaryRow key={axis} setting="GYRO_DEFLECTION_RANGE" label={axis === 'x' ? 'Horizontal rotation for full output' : 'Vertical rotation for full output'} value={`${range[axis]}°`} disabled={disabled}
          help="Degrees of selected-axis rotation from neutral to full joystick output. Smaller ranges need less movement. Configure the source axes and inversion in Orientation."
          adjust={{ kind: 'number', value: range[axis], min: 1, max: 180, step: 1, fineStep: 0.1, onChange: next => setText(previous => writeGyroDeflectionRange(previous, text, axis, next, prefix)) }} />)}
        <SummaryRow setting="GYRO_DEFLECTION_LOCK_EXTENTS" label="Lock deflection limits" value={lockExtents === 'ON' ? 'On' : 'Off'} disabled={disabled}
          help="On discards rotation beyond the limits, so reversing moves the stick immediately. Off remembers excess travel until you rotate back inside the range."
          adjust={{ kind: 'choice', value: lockExtents, options: [{ value: 'ON', label: 'On' }, { value: 'OFF', label: 'Off' }], onChange: next => write('GYRO_DEFLECTION_LOCK_EXTENTS', next) }} />
        <p>Bind “Recenter gyro deflection” to any input to capture a fresh neutral on every connected controller. Filters and drift calibration affect angular travel; camera sensitivity, acceleration, snapping and click dampening do not. A held gyro-trackball action clutches deflection instead of adding momentum.</p>
      </>}
      <SettingPrefix prefix=""><SummaryRow setting="VIRTUAL_CONTROLLER" label="Virtual controller" value={controller === 'DS4' ? 'PlayStation 4' : controller === 'XBOX' ? 'Xbox 360' : 'Off'}
        help="This selects the virtual device for the whole configuration. The driver and device must also be available; a saved selection alone does not prove output is working."
        disabled={disabled} adjust={{ kind: 'choice', value: controller,
          options: [{ value: 'NONE', label: 'Off' }, { value: 'XBOX', label: 'Xbox 360' }, { value: 'DS4', label: 'PlayStation 4' }],
          onChange: next => write('VIRTUAL_CONTROLLER', next, '') }} /></SettingPrefix>
      {controller === 'NONE' && <p className={styles.warning} role="status">This mode requires a virtual controller. Enable Xbox or DS4 output.</p>}
      {problem && <p className={styles.warning} role="alert">{problem} Imported values are preserved until you edit them.</p>}
      {!deflection && <SummaryRow label={steeringTarget ? 'Tune camera output' : 'Tune for this game'} hint={steeringTarget ? 'For games that use the left stick as a camera. For driving, use Set up tilt steering above.' : 'Six steps: output, turn rate, deadzone, curve and slow/fast aim.'} value="Start guide" onActivate={() => { setStep(0); setGuide(true) }} disabled={disabled} />}
      {field('UNDEADZONE_INNER')}
      {field('UNDEADZONE_OUTER')}
      {field('UNPOWER')}
      {probe}
      {!deflection && <SummaryRow setting="VIRTUAL_STICK_CALIBRATION" label="Maximum game turn rate" value={`${values.maxSpeed} °/s`}
        hint="Camera speed at full stick tilt, measured with the game’s current settings. Shared by virtual gyro and flick output."
        help="If a full 360° turn takes 0.5 seconds, enter 720 °/s. This maps your intended gyro camera speed into the game’s achievable range; it does not change the game’s maximum speed."
        disabled={disabled} adjust={{ kind: 'number', value: values.maxSpeed, min: 1, max: 20000, step: 30, fineStep: 1,
          onChange: next => write('VIRTUAL_STICK_CALIBRATION', next) }} />}
      <figure className={styles.graph}>
        <svg viewBox="0 0 380 210" role="img" aria-label={deflection ? 'Virtual stick response compensation: angular deflection versus joystick radius' : 'Virtual stick response compensation: requested camera speed versus joystick radius'}>
          <path d="M30 30 V180 H350" className={styles.axis} />
          <path d={`M30 ${180 - values.inner * 150} H350 M30 ${30 + values.outer * 150} H350`} className={styles.guide} />
          <path d={curve} className={styles.curve} />
          <text x="30" y="202">0</text><text x="290" y="202">{deflection ? 'Full deflection' : 'Max turn rate'}</text><text x="35" y="22">Joystick radius</text>
        </svg>
        <figcaption>Static correction preview · {Math.round(values.inner * 100)}% inner · {Math.round((1 - values.outer) * 100)}% maximum radius</figcaption>
      </figure>
      <VirtualStickLive sample={sample} target={target} />
      <ExpandRow label="Physical stick mixing" hint="Adjust the physical stick contribution alongside gyro output.">{field('VIRTUAL_SCALE')}</ExpandRow>
    </div>
    <Sheet open={guide} onClose={() => setGuide(false)} eyebrow={`Gyro to joystick · Step ${step + 1} of ${STEPS.length}`}
      title={STEPS[step].title} description={STEPS[step].detail} hints={[{ button: 'A', label: 'Adjust' }, { button: 'B', label: 'Close' }]}>
      {step === 0 && <SummaryRow label="Controller output" value={controller} adjust={{ kind: 'choice', value: controller,
        options: [{ value: 'XBOX', label: 'Xbox 360' }, { value: 'DS4', label: 'PlayStation 4' }], onChange: next => write('VIRTUAL_CONTROLLER', next, '') }} />}
      {step === 2 && <SummaryRow label="Seconds for one full turn" value={`${Number((360 / values.maxSpeed).toFixed(3))} s`}
        adjust={{ kind: 'number', value: 360 / values.maxSpeed, min: 0.02, max: 30, step: 0.1, fineStep: 0.01, onChange: next => write('VIRTUAL_STICK_CALIBRATION', Number((360 / next).toFixed(4))) }} />}
      {step === 3 && <>{probe}{field('UNDEADZONE_INNER')}</>}
      {step === 4 && <>{field('UNPOWER')}{field('UNDEADZONE_OUTER')}</>}
      {step === 5 && probe}
      <div className={styles.actions}>
        <button type="button" className="button button--secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Previous</button>
        <button type="button" className="button button--primary" onClick={() => {
          if (step === STEPS.length - 1) { write(target + '_DEADZONE_PROBE', 'OFF'); setGuide(false) }
          else setStep(step + 1)
        }}>{step === STEPS.length - 1 ? 'Finish' : 'Next'}</button>
      </div>
    </Sheet>
  </SettingPrefix>
}

function VirtualStickLive({ sample, target }: Pick<Props, 'sample' | 'target'>) {
  const outputs = sample?.devices?.flatMap(device => device.status?.virtualSticks ? [{ handle: device.handle, output: target === 'LEFT_STICK' ? device.status.virtualSticks.left : device.status.virtualSticks.right }] : []) ?? []
  return <div className={styles.live}>
    {outputs.length ? outputs.map(({ handle, output }) => <div key={handle}>
      <svg viewBox="0 0 110 110" role="img" aria-label={`Device ${handle} processed virtual stick output`}><circle cx="55" cy="55" r="45" className={styles.axis} />
        <path d="M10 55 H100 M55 10 V100" className={styles.guide} /><circle cx={55 + output.x * 45} cy={55 - output.y * 45} r="5" className={styles.dot} /></svg>
      <span>Device {handle} · X {output.x.toFixed(3)} · Y {output.y.toFixed(3)}</span>
    </div>) : <p>Processed output is unavailable from this mapper. The curve above previews saved tuning; it is not a live gamepad measurement.</p>}
    <small>Gyro speed: {typeof sample?.omega === 'number' ? `${sample.omega.toFixed(1)} °/s` : 'Waiting for telemetry'}. Live output uses the applied profile; save and apply edits before comparing.</small>
  </div>
}
