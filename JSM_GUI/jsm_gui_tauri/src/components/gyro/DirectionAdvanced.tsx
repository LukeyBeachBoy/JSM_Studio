import { useTranslation } from 'react-i18next'
import { SubPage, OpenRow, ValueRow, SegmentedRow } from '../ui/console'
import { parseTiltActivation, writeTiltActivation, gyroConditions, type GyroActivationMode } from '../../utils/gyroActivation'
import { controllerLabel, formatVidPid } from '../../utils/controllers'
import { useGyro, KeyChoiceRow, SwitchRow, RowLabel, Note, VisualTitle, PadActions } from './GyroContext'
import { RotationDiagram, UpdateRateStrip, liveGyro } from './visuals'
import { inputName, defaultHoldInput } from './inputs'
import styles from './Gyro.module.css'

// Direction ▸ Advanced (GyroDirectionAdvanced): which rotations aim, when tilt
// counts (and the way into Tilt, D6), how often controllers are read, and which
// controllers' gyro is used.

const AXIS_OPTIONS = [
  { value: 'X', label: 'Pitch', caption: 'Tilt the front of the controller up or down.' },
  { value: 'Y', label: 'Yaw', caption: 'Turn the controller left or right while keeping it level.' },
  { value: 'Z', label: 'Roll', caption: 'Lean it so one grip rises and the other falls.' },
  { value: 'XY', label: 'Pitch + yaw', caption: 'Tilting and turning add together, so they can boost or cancel.' },
  { value: 'XZ', label: 'Pitch + roll', caption: 'Tilting and leaning add together, so they can boost or cancel.' },
  { value: 'YZ', label: 'Yaw + roll', caption: 'Turning and leaning add together, so they can boost or cancel.' },
  { value: 'XYZ', label: 'All three', caption: 'Pitch, yaw and roll all add together.' },
  { value: 'NONE', label: 'None', caption: 'This direction doesn’t move at all; the other is unaffected.' },
]
const AXIS_WORD: Record<string, string> = { X: 'Pitch · tilting', Y: 'Yaw · turning', Z: 'Roll · leaning' }
const sourceText = (value: string) => value === 'NONE' ? 'nothing' : value.split('').map(axis => AXIS_WORD[axis]?.split(' · ')[0]).join(' + ')

export function DirectionAdvanced({ open, onClose, trail, onTilt, tiltUnavailable }: { open: boolean; onClose: () => void; trail: string[]; onTilt: () => void; tiltUnavailable?: string }) {
  const gyro = useGyro()
  const { t } = useTranslation()
  const space = (gyro.get('GYRO_SPACE') ?? 'LOCAL').toUpperCase() || 'LOCAL'
  const local = space === 'LOCAL'
  const localOnly = local ? undefined : 'Only when Turn using is Controller.'
  const xFrom = (gyro.get('MOUSE_X_FROM_GYRO_AXIS') ?? 'Y').toUpperCase()
  const yFrom = (gyro.get('MOUSE_Y_FROM_GYRO_AXIS') ?? 'X').toUpperCase()
  const tilt = parseTiltActivation(gyro.text)
  const tiltCombined = gyroConditions(tilt.button)
  const tiltMode: GyroActivationMode = tilt.mode
  const tick = gyro.num('TICK_TIME', 3)
  const live = liveGyro(gyro.sample)
  const devices = gyro.devices ?? []
  const ignored = (gyro.callbacks.ignoredDevices ?? []).map(id => id.toLowerCase())
  const yawRate = live ? Math.abs(live.y) : null
  const usedAxes = local ? `${xFrom}${yFrom}` : space === 'YAW_PLUS_ROLL' ? 'XYZ' : 'XY'
  const holdButton = tilt.button && !tiltCombined ? tilt.button : defaultHoldInput(gyro.devices?.[0])
  // Joy-Con L/R are types 1 and 2 in JSL; with nothing connected the rows stay (they may be edited for later).
  const joyCon = devices.length === 0 || devices.some(device => device.type === 1 || device.type === 2)
  return (
    <SubPage open={open} onClose={onClose} trail={trail} title="Advanced" backLabel="Back to Direction"
      hints={gyro.callbacks.onTryIt ? [{ button: 'X', label: 'Try it' }] : undefined}>
      <PadActions x={gyro.callbacks.onTryIt}><div className={styles.split} data-direction-advanced="">
        <section className={styles.splitRows}>
          <p className={styles.note}>Which rotations count, and which controllers.</p>
          <RowLabel>Which rotations aim</RowLabel>
          <KeyChoiceRow k="MOUSE_X_FROM_GYRO_AXIS" label="Left/right aim comes from" fallback="Y" options={AXIS_OPTIONS} disabled={localOnly}
            hint={local ? 'Pairs add together, so they can boost or cancel.' : 'Only when Turn using is Controller'} />
          <KeyChoiceRow k="MOUSE_Y_FROM_GYRO_AXIS" label="Up/down aim comes from" fallback="X" options={AXIS_OPTIONS} disabled={localOnly} hint="Both only when Turn using is Controller" />
          <SegmentedRow label="Tilt to move" hint="When tilting counts; what it does is under Fine-tune ▸ Tilt" value={tiltMode} setting={tiltMode === 'hold_off' ? 'TILT_OFF' : 'TILT_ON'}
            disabled={tiltUnavailable ?? gyro.locked} data={{ 'data-setting': 'TILT_ON' }}
            options={[
              { value: 'always_on', label: 'Always', caption: 'Tilt works whenever the controller is tilted' },
              { value: 'hold_on', label: 'While I hold', caption: tiltCombined ? 'Several inputs: Tilt ▸ When tilt is on' : `While ${inputName(holdButton, gyro.family)} is held` },
              { value: 'hold_off', label: 'Unless I hold', caption: tiltCombined ? 'Several inputs: Tilt ▸ When tilt is on' : `Paused while ${inputName(holdButton, gyro.family)} is held` },
              { value: 'always_off', label: 'Off', caption: 'Tilt settings and bindings are kept for later' },
            ]}
            onChange={value => gyro.setText(previous => writeTiltActivation(previous, value as GyroActivationMode, tiltCombined ? tilt.button : holdButton))} />
          <OpenRow label="Tilt" hint="What tilting does: behaviour, angles, tuning, orientation" onOpen={onTilt} disabled={tiltUnavailable} data={{ 'data-tilt-open': '' }} />
          <RowLabel>Controllers</RowLabel>
          <ValueRow label="Update rate" hint="How often every controller is read" setting="TICK_TIME" value={tick} min={1} max={100} step={1} fineStep={0.5}
            format={value => `Every ${value} ms`} disabled={gyro.locked} onChange={value => gyro.set('TICK_TIME', value)}
            onReset={gyro.get('TICK_TIME') !== undefined ? () => gyro.reset('TICK_TIME') : undefined} data={{ 'data-setting': 'TICK_TIME' }} />
          {devices.length === 0 && <Note>Connect a controller to choose whose gyro is used.</Note>}
          {devices.map(device => {
            const id = formatVidPid(device.vid, device.pid)
            const isIgnored = id ? ignored.includes(id.toLowerCase()) : false
            const name = controllerLabel(device.type, t)
            return <SwitchRow key={device.handle} label={`Use gyro from ${name}`} hint={id ? `Off ignores this controller’s gyro · ${id}` : 'Off ignores this controller’s gyro'}
              on={!isIgnored} setting="IGNORE_GYRO_DEVICES"
              disabled={gyro.locked ?? (!device.vid || !device.pid ? 'This controller doesn’t report an ID the mapper can ignore.' : undefined)}
              onChange={next => { if (device.vid && device.pid) gyro.callbacks.onToggleIgnoreDevice?.(device.vid, device.pid, !next) }} />
          })}
          {/* Joy-Con halves only mean something with a Joy-Con pair connected (or no controller, or a value already set: D5). */}
          {(joyCon || gyro.changed('JOYCON_GYRO_MASK', 'JOYCON_MOTION_MASK')) && <>
            <KeyChoiceRow k="JOYCON_GYRO_MASK" label="Paired Joy-Con: gyro from" hint={joyCon ? undefined : 'No effect on this controller'} fallback="IGNORE_LEFT"
              options={[{ value: 'IGNORE_LEFT', label: 'Right half' }, { value: 'IGNORE_RIGHT', label: 'Left half' }, { value: 'USE_BOTH', label: 'Both halves' }, { value: 'IGNORE_BOTH', label: 'Neither' }]} />
            <KeyChoiceRow k="JOYCON_MOTION_MASK" label="Paired Joy-Con: tilt from" hint="Gyro and tilt can use different halves" fallback="IGNORE_RIGHT"
              options={[{ value: 'IGNORE_LEFT', label: 'Right half' }, { value: 'IGNORE_RIGHT', label: 'Left half' }, { value: 'USE_BOTH', label: 'Both halves' }, { value: 'IGNORE_BOTH', label: 'Neither' }]} />
          </>}
        </section>
        <aside className={styles.visualCard}>
          <VisualTitle title="Three ways to rotate" live={yawRate === null ? '—' : `yaw ${Math.round(yawRate)} °/s`} />
          <RotationDiagram live={live}
            turn={local ? `Yaw · turning → ${xFrom.includes('Y') ? 'left/right' : yFrom.includes('Y') ? 'up/down' : 'not used'}` : 'Yaw · turning → left/right'}
            tilt={local ? `Pitch · tilting → ${yFrom.includes('X') ? 'up/down' : xFrom.includes('X') ? 'left/right' : 'not used'}` : 'Pitch · tilting → up/down'}
            lean={usedAxes.includes('Z') ? `Roll · leaning → ${local ? (xFrom.includes('Z') ? 'left/right' : 'up/down') : 'adds to the turn'}` : 'Roll · leaning · not used'} />
          <p className={styles.visualCaption}>Left/right from {sourceText(xFrom)}; up/down from {sourceText(yFrom)}.{local ? '' : ' Turn using sets these while it isn’t Controller.'}</p>
          <UpdateRateStrip tickMs={tick} measuredHz={typeof gyro.sample?.sampleHz === 'number' ? gyro.sample.sampleHz : null} />
          <div className={styles.deviceCards}>
            {devices.map(device => {
              const id = formatVidPid(device.vid, device.pid)
              const isIgnored = id ? ignored.includes(id.toLowerCase()) : false
              return <div key={device.handle} className={styles.deviceCard}>
                <b>{controllerLabel(device.type, t)}</b><span>{devices.length === 1 ? 'The only controller connected' : `Controller ${device.handle}`}</span>
                <em data-on={!isIgnored ? 'true' : undefined}>{isIgnored ? 'Gyro ignored' : 'Gyro in use'}</em>
              </div>
            })}
          </div>
        </aside>
      </div></PadActions>
    </SubPage>
  )
}
