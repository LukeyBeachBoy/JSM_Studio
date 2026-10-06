import type { Dispatch, SetStateAction } from 'react'
import { SummaryRow, ExpandRow } from './ui/SummaryRow'
import { STICK_MODE_VALUES, formatStickModeLabel } from '../constants/sticks'
import { useTranslation } from 'react-i18next'
import { readVirtualSetting, writeVirtualSetting } from '../utils/virtualStickSettings'
import { SourceModeTuning } from './SourceModeTuning'
import { SettingPrefix } from './SettingOrigin'
import { projectModeshift, foldModeshift } from '../utils/modeshift'
import { GyroSettingRow } from './GyroBehaviorControls'
import { TiltActivationControls } from './TiltActivationControls'
import { Select } from './ui/Select'
import { parseGyroActivation, parseTiltActivation } from '../utils/gyroActivation'

const TILT_DESCRIPTIONS: Record<string, string> = {
  NO_MOUSE: 'Tilt up, down, left or right to hold the corresponding Tilt action. Assign actions under Buttons → Tilt inputs. No mouse or stick output; unbound actions do nothing.',
  AIM: 'Hold a tilt to keep moving the mouse. Greater tilt means faster movement; return to neutral to stop. Gyro mouse aiming can run alongside it.',
  FLICK: 'Tilt towards a direction to flick the camera to that heading, then circle the tilt direction around neutral to turn horizontally. Uses mouse output.',
  FLICK_ONLY: 'Tilt towards a direction to flick the camera to that heading. Circling the tilt direction does not continue turning. Uses mouse output.',
  ROTATE_ONLY: 'Circle the tilt direction around neutral to turn the camera horizontally, without an initial flick. Uses mouse output.',
  MOUSE_AREA: 'Tilt position controls the cursor within an area around its starting point. Returning to neutral returns the cursor to the centre.',
  MOUSE_RING: 'Tilt towards a direction to place the cursor on a ring around the screen centre. The direction selects the point on the ring.',
  SCROLL_WHEEL: 'Circle the tilt direction around neutral to trigger Tilt left or Tilt right in steps. Bind these actions to scroll, selection or other commands.',
  HYBRID_AIM: 'Combine movement from changes in tilt position with continuous mouse aiming. Shared hybrid response and edge settings control the transition.',
  INNER_RING: 'Tilt holds directional actions and sets the Tilt ring action to engage near neutral, outside the deadzone. Bind directions and the ring under Buttons → Tilt inputs.',
  OUTER_RING: 'Tilt holds directional actions and sets the Tilt ring action to engage towards full tilt. Bind directions and the ring under Buttons → Tilt inputs.',
  LEFT_STICK: 'Tilt direction and amount set both axes of the virtual left stick. Holding a tilt holds the stick away from centre. Requires Xbox or PlayStation 4 virtual output.',
  RIGHT_STICK: 'Tilt direction and amount set both axes of the virtual right stick. Holding a tilt holds the stick away from centre. Requires Xbox or PlayStation 4 virtual output.',
  LEFT_STEER_X: 'Lean left or right like a steering wheel to hold the virtual left stick horizontally. Forward/back tilt is ignored. Requires virtual output; independent of gyro activation.',
  RIGHT_STEER_X: 'Lean left or right like a steering wheel to hold the virtual right stick horizontally. Forward/back tilt is ignored. Requires virtual output; independent of gyro activation.',
  LEFT_ANGLE_TO_X: 'The direction of your tilt, scaled by its amount, controls only the virtual left stick horizontal axis. Uses direction around neutral rather than wheel-style lean. Requires virtual output.',
  LEFT_ANGLE_TO_Y: 'The direction of your tilt, scaled by its amount, controls only the virtual left stick vertical axis. Requires Xbox or PlayStation 4 virtual output.',
  RIGHT_ANGLE_TO_X: 'The direction of your tilt, scaled by its amount, controls only the virtual right stick horizontal axis. Uses direction around neutral rather than wheel-style lean. Requires virtual output.',
  RIGHT_ANGLE_TO_Y: 'The direction of your tilt, scaled by its amount, controls only the virtual right stick vertical axis. Requires Xbox or PlayStation 4 virtual output.',
  LEFT_WIND_X: 'Circle the tilt direction to build up virtual left stick steering. Reduce tilt to let steering unwind towards centre. Requires virtual output.',
  RIGHT_WIND_X: 'Circle the tilt direction to build up virtual right stick steering. Reduce tilt to let steering unwind towards centre. Requires virtual output.',
}

const MOUNTING_DIRECTIONS = ['FORWARD', 'LEFT', 'RIGHT', 'BACKWARD', 'JOYCON_SIDEWAYS'].map(value => ({ value, label: value === 'JOYCON_SIDEWAYS' ? 'Sideways Joy-Con pair' : value[0] + value.slice(1).toLowerCase() }))

export function MotionInputTuning({ text, setText, prefix = '', disabled, deviceType, gridCommands }: { text: string; setText: Dispatch<SetStateAction<string>>; prefix?: string; disabled?: boolean; deviceType?: number; gridCommands?: string[] }) {
  const { t } = useTranslation()
  const read = (key: string, fallback: string) => readVirtualSetting(text, key, prefix) ?? fallback
  const write = (key: string, value: string | number) => setText(previous => writeVirtualSetting(previous, key, value, prefix))
  const mode = read('MOTION_STICK_MODE', 'NO_MOUSE')
  const inner = Number(read('MOTION_DEADZONE_INNER', '15'))
  const outer = Number(read('MOTION_DEADZONE_OUTER', '135'))
  const range = 180 - outer
  const axis = read('MOTION_STICK_AXIS', 'STANDARD STANDARD').split(/\s+/)
  const modeLabel = mode === 'NO_MOUSE' ? 'Directional actions' : mode === 'AIM' ? 'Tilt to mouse' : mode === 'LEFT_STICK' ? 'Tilt deflection → left stick' : mode === 'RIGHT_STICK' ? 'Tilt deflection → right stick' : mode === 'LEFT_STEER_X' ? 'Steering → left stick' : mode === 'RIGHT_STEER_X' ? 'Steering → right stick' : formatStickModeLabel(mode, t)
  const modeHelp = TILT_DESCRIPTIONS[mode] ?? 'This profile uses a custom tilt behaviour.'
  const modeOptions = [...STICK_MODE_VALUES.filter(value => value !== 'RADIAL_MENU'), 'LEFT_STEER_X', 'RIGHT_STEER_X'].map(value => ({
    value,
    label: value === 'NO_MOUSE' ? 'Directional actions' : value === 'AIM' ? 'Tilt to mouse' : value === 'LEFT_STICK' ? 'Tilt deflection → left stick' : value === 'RIGHT_STICK' ? 'Tilt deflection → right stick' : value === 'LEFT_STEER_X' ? 'Steering → left stick' : value === 'RIGHT_STEER_X' ? 'Steering → right stick' : formatStickModeLabel(value, t),
    description: TILT_DESCRIPTIONS[value],
  }))
  const number = (key: string, label: string, fallback: number, min: number, max: number, step: number, unit = '', index?: 0 | 1) => {
    const parts = read(key, String(fallback)).split(/\s+/).map(Number)
    const value = parts[index ?? 0] ?? parts[0]
    return <SummaryRow key={key + (index ?? '')} setting={key} label={label} value={`${value}${unit}`} disabled={disabled}
      help={key === 'STICK_SENS' ? 'Camera turn speed at full tilt. Shared by sources using mouse aim; the horizontal and vertical values are independent.' : key === 'STICK_POWER' ? '1 is linear. Higher values reduce output near neutral. Shared with aim and steering sources.' : key === 'STICK_ACCELERATION_RATE' ? 'Increase the mouse speed multiplier each second while holding full tilt. 0 disables acceleration.' : key === 'STICK_ACCELERATION_CAP' ? 'Maximum multiplier for tilt mouse acceleration. 1 keeps the base speed; used only when acceleration is enabled.' : key === 'MOUSE_RING_RADIUS' ? 'Mouse movement scale for changes in tilt position, in pixels. Shared with other cursor area and ring sources.' : key === 'SCROLL_SENS' ? 'Degrees of rotation around neutral per action step. Uses the horizontal scroll sensitivity; the vertical setting is preserved.' : 'Shared flick tuning. Applies to sources using flick modes; held settings override it while their trigger is active.'}
      adjust={{ kind: 'number', value, min, max, step, onChange: next => setText(previous => {
        if (index === undefined) return writeVirtualSetting(previous, key, next, prefix)
        const pair = (readVirtualSetting(previous, key, prefix) ?? String(fallback)).split(/\s+/).map(Number)
        if (pair.length === 1) pair.push(pair[0])
        pair[index] = next
        return writeVirtualSetting(previous, key, pair.join(' '), prefix)
      }) }} />
  }
  const virtual = mode.startsWith('LEFT_') || mode.startsWith('RIGHT_')
  const bothEnabled = parseTiltActivation(text, prefix).mode !== 'always_off' && parseGyroActivation(text, prefix).mode !== 'always_off'
  return <SettingPrefix prefix={prefix}>
    <TiltActivationControls text={text} setText={setText} prefix={prefix} disabled={disabled} deviceType={deviceType} gridCommands={gridCommands} />
    <GyroSettingRow setting="MOTION_STICK_MODE" label="Tilt behaviour" description={modeHelp}
      control={<Select ariaLabel="Tilt behaviour" value={mode} disabled={disabled} inlineDescriptions
        groups={[
          { label: 'Button actions', options: modeOptions.filter(option => ['NO_MOUSE', 'INNER_RING', 'OUTER_RING', 'SCROLL_WHEEL'].includes(option.value)) },
          { label: 'Mouse and camera', options: modeOptions.filter(option => ['AIM', 'HYBRID_AIM', 'FLICK', 'FLICK_ONLY', 'ROTATE_ONLY', 'MOUSE_AREA', 'MOUSE_RING'].includes(option.value)) },
          { label: 'Virtual stick and steering', options: modeOptions.filter(option => option.value.startsWith('LEFT_') || option.value.startsWith('RIGHT_')) },
        ]} onValueChange={next => write('MOTION_STICK_MODE', next)} />} />
    {bothEnabled && virtual && readVirtualSetting(text, 'GYRO_OUTPUT', prefix) === (mode.startsWith('LEFT_') ? 'LEFT_STICK' : 'RIGHT_STICK') && <p role="status">Gyro and tilt target the same stick and can interfere; gyro can overwrite tilt steering. Use different outputs, or select gyro Output → Mouse and Activation → Always off for tilt-only stick control.</p>}
    {bothEnabled && ['AIM', 'HYBRID_AIM', 'FLICK', 'FLICK_ONLY', 'ROTATE_ONLY', 'MOUSE_AREA', 'MOUSE_RING'].includes(mode) && read('GYRO_OUTPUT', 'MOUSE') === 'MOUSE' && <p role="status">Gyro and tilt both control the mouse. Their movement can combine. For tilt-only mouse control, set gyro Activation → Always off.</p>}
    {virtual && readVirtualSetting(text, 'VIRTUAL_CONTROLLER') !== 'DS4' && readVirtualSetting(text, 'VIRTUAL_CONTROLLER') !== 'XBOX' && <p role="status">Tilt-to-controller output requires Xbox or DS4 virtual output.</p>}
    <SummaryRow setting="MOTION_DEADZONE_INNER" label="Neutral tilt deadzone" value={`${inner}°`} help="Tilt below this angle produces no motion-stick movement. This setting is in degrees."
      disabled={disabled} adjust={{ kind: 'number', value: inner, min: 0, max: Math.max(0, range - 0.1), step: 1, fineStep: 0.1, onChange: next => write('MOTION_DEADZONE_INNER', next) }} />
    <SummaryRow setting="MOTION_DEADZONE_OUTER" label="Full-output tilt angle" value={`${range}°`} help="Tilt at or beyond this angle gives full output. Stored as 180° minus this angle in JSM’s outer deadzone. Must exceed the neutral deadzone."
      disabled={disabled} adjust={{ kind: 'number', value: range, min: Math.min(180, inner + 0.1), max: 180, step: 1, fineStep: 0.1, onChange: next => write('MOTION_DEADZONE_OUTER', Number((180 - next).toFixed(4))) }} />
    <ExpandRow key={mode} label={`Tilt tuning · ${modeLabel}`} hint="Sensitivity, response and output for the selected behaviour.">
      {['AIM', 'HYBRID_AIM'].includes(mode) && <>
        {number('STICK_SENS', 'Horizontal tilt mouse speed', 360, 0, 1200, 1, ' °/s', 0)}
        {number('STICK_SENS', 'Vertical tilt mouse speed', 360, 0, 1200, 1, ' °/s', 1)}
        {number('STICK_ACCELERATION_RATE', 'Tilt acceleration rate', 0, 0, 50, 0.1)}
        {number('STICK_ACCELERATION_CAP', 'Tilt acceleration cap', 1000000, 1, 1000000, 1)}
      </>}
      {['AIM', 'HYBRID_AIM', 'LEFT_STEER_X', 'RIGHT_STEER_X'].includes(mode) && number('STICK_POWER', 'Tilt response curve', 1, 0.01, 8, 0.1)}
      {['FLICK', 'FLICK_ONLY'].includes(mode) && <>
        {number('FLICK_TIME', 'Tilt flick time', 0.1, 0, 1, 0.01, ' s')}
        {number('FLICK_TIME_EXPONENT', 'Tilt flick time exponent', 0, 0, 2, 0.1)}
        <SummaryRow setting="FLICK_SNAP_MODE" label="Tilt flick snapping" value={read('FLICK_SNAP_MODE', 'NONE')} disabled={disabled}
          adjust={{ kind: 'choice', value: read('FLICK_SNAP_MODE', 'NONE'), options: [{ value: 'NONE', label: 'Off' }, { value: '4', label: 'Four directions' }, { value: '8', label: 'Eight directions' }], onChange: next => write('FLICK_SNAP_MODE', next) }} />
        {number('FLICK_SNAP_STRENGTH', 'Tilt flick snap strength', 1, 0, 1, 0.01)}
        {number('FLICK_DEADZONE_ANGLE', 'Tilt flick forward deadzone', 0, 0, 180, 1, '°')}
      </>}
      {mode === 'MOUSE_AREA' && number('MOUSE_RING_RADIUS', 'Tilt cursor travel', 128, 0, 4000, 10, ' px')}
      {mode === 'SCROLL_WHEEL' && <>
        <p>Bind Tilt left and Tilt right under Buttons → Tilt inputs to the actions each rotation step should trigger.</p>
        {number('SCROLL_SENS', 'Tilt rotation per step', 30, 0.1, 180, 1, '°', 0)}
      </>}
      {['NO_MOUSE', 'INNER_RING', 'OUTER_RING'].includes(mode) && <p>Edit direction and ring bindings under Buttons → Tilt inputs. The tilt deadzone and full-output angle above control engagement.</p>}
      <SourceModeTuning mode={mode} configText={prefix ? projectModeshift(text, prefix.slice(0, -1)) : text}
        onConfigTextChange={prefix ? update => setText(previous => {
          const trigger = prefix.slice(0, -1)
          const projected = projectModeshift(previous, trigger)
          return foldModeshift(previous, trigger, typeof update === 'function' ? update(projected) : update, {}, projected)
        }) : setText} disabled={disabled} />
      <small>Aim, flick and output tuning is shared with other stick sources. Held settings apply while their trigger is active.</small>
    </ExpandRow>
    <ExpandRow label="Tilt orientation and response" hint="Inversion, mounting direction, lean actions and ring behaviour.">
      {(['Horizontal', 'Vertical'] as const).map((name, i) => <SummaryRow key={name} setting="MOTION_STICK_AXIS" label={`${name} tilt direction`} value={(axis[i] ?? axis[0]) === 'INVERTED' ? 'Inverted' : 'Normal'} disabled={disabled}
        adjust={{ kind: 'choice', value: axis[i] ?? axis[0], options: [{ value: 'STANDARD', label: 'Normal' }, { value: 'INVERTED', label: 'Inverted' }], onChange: next => { const pair = [axis[0], axis[1] ?? axis[0]]; pair[i] = next; write('MOTION_STICK_AXIS', pair.join(' ')) } }} />)}
      <SummaryRow setting="CONTROLLER_ORIENTATION" label="Controller mounting direction" value={MOUNTING_DIRECTIONS.find(option => option.value === read('CONTROLLER_ORIENTATION', 'FORWARD'))?.label ?? 'Unrecognised mounting direction'} help="Adjusts tilt and lean interpretation for the direction the controller faces. Sideways Joy-Con pair turns each split half appropriately and leaves full controllers facing forward. Gyro camera space is configured separately."
        disabled={disabled} adjust={{ kind: 'choice', value: read('CONTROLLER_ORIENTATION', 'FORWARD'), options: MOUNTING_DIRECTIONS, onChange: next => write('CONTROLLER_ORIENTATION', next) }} />
      <SummaryRow setting="LEAN_THRESHOLD" label="Lean action threshold" value={`${read('LEAN_THRESHOLD', '15')}°`} help="Sideways lean beyond this angle presses Lean left or Lean right. Their bindings appear under Buttons → Tilt inputs."
        disabled={disabled} adjust={{ kind: 'number', value: Number(read('LEAN_THRESHOLD', '15')), min: 0, max: 89, step: 1, onChange: next => write('LEAN_THRESHOLD', next) }} />
      <SummaryRow setting="MOTION_RING_MODE" label="Tilt ring activation" value={read('MOTION_RING_MODE', 'OUTER') === 'INNER' ? 'Near neutral' : 'Towards full tilt'} help="Determines where the motion ring action is held."
        disabled={disabled} adjust={{ kind: 'choice', value: read('MOTION_RING_MODE', 'OUTER'), options: [{ value: 'INNER', label: 'Near neutral' }, { value: 'OUTER', label: 'Towards full tilt' }], onChange: next => write('MOTION_RING_MODE', next) }} />
    </ExpandRow>
  </SettingPrefix>
}
