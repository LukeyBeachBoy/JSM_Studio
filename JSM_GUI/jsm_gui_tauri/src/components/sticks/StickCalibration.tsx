import { useState } from 'react'
import { calibrationDirections, captureStickDirection, transformStickGeometry, type StickGeometry, type StickPoint } from '../../utils/stickGeometry'
import { OpenRow, SegmentedRow, SubPage, SwitchRow, ValueRow } from '../ui/console'
import { writeKey, writeKeys, type SetText } from './shared'
import { StickGeometryPreview } from './StickGeometryPreview'
import styles from './StickCalibration.module.css'

const names = ['Forward', 'Right', 'Backward', 'Left']
export function StickCalibration({ side, geometry, raw, setText, disabled, global }: {
  side: 'LEFT' | 'RIGHT'; geometry: StickGeometry; raw: StickPoint | null; setText?: SetText; disabled?: string; global?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [direction, setDirection] = useState(0)
  const [recorded, setRecorded] = useState('')
  const prefix = `${side}_STICK_CALIBRATION`
  const calibration = geometry.calibration ?? { enabled: false, angles: [0, 0, 0, 0], ranges: [1, 1, 1, 1] }
  const key = `${prefix}_${calibrationDirections[direction]}`
  const capture = captureStickDirection(raw, geometry, direction)
  const unavailable = disabled ?? (!setText ? 'This layout is read-only' : undefined)
  const captureUnavailable = unavailable ?? (!capture ? 'Hold this direction at least a quarter of the way out. If it is outside the guide, align Stick rotation first.' : undefined)
  const adjusted = raw ? transformStickGeometry(raw, geometry) : null
  const total = geometry.rotation + calibration.angles[direction]
  return <>
    <OpenRow label="Natural direction calibration" value={calibration.enabled ? 'On' : 'Off'}
      hint="Fit forward, right, backward and left to your thumb. Applies to keyboard directions and analog output."
      onOpen={() => setOpen(true)} />
    <SubPage open={open} onClose={() => setOpen(false)} title="Natural direction calibration" trail={global ? ['Global Cyborg stick defaults'] : ['Sticks']} crumbRoot={global ? 'Settings' : undefined}>
      <div className={styles.page} data-stick-calibration={side}>
        <p className={styles.intro}>Start with your comfortable forward rotation. Then record each natural direction, or adjust it below. Use your mouse or keyboard here so moving the stick doesn’t navigate the controls. Movement between directions stays continuous, with no added input delay.</p>
        <SwitchRow global={global} label="Use natural directions" setting={prefix} on={calibration.enabled} disabled={unavailable}
          hint="Off keeps your normal rotation and ring settings. Your recorded directions are retained."
          onChange={on => writeKey(setText, prefix, on ? 'ON' : 'OFF')} onReset={() => writeKey(setText, prefix, null)} />
        <div className={styles.layout}>
          <div className={styles.controls}>
            <SegmentedRow label="Direction to calibrate" value={String(direction)}
              options={names.map((label, i) => ({ label, value: String(i) }))}
              onChange={value => { setDirection(Number(value)); setRecorded('') }} />
            <ValueRow global={global} label={`${names[direction]} adjustment`} setting={`${key}_ANGLE`} value={calibration.angles[direction]}
              min={-40} max={40} step={1} fineStep={.1} format={value => `${value > 0 ? '+' : ''}${value.toFixed(1)}°`} disabled={unavailable}
              caption={`Added to your ${geometry.rotation}° stick rotation: ${Math.round(total * 10) / 10}° total correction. Adjustments stay within ±40° so directions cannot cross.`}
              onChange={value => writeKey(setText, `${key}_ANGLE`, value)} onReset={() => writeKey(setText, `${key}_ANGLE`, null)} />
            <OpenRow label={`Record ${names[direction].toLowerCase()} direction`} value="Record" disabled={captureUnavailable}
              hint={`Hold the stick comfortably ${names[direction].toLowerCase()}, then select Record. Only the angle is recorded.`}
              onOpen={() => { if (capture) { writeKey(setText, `${key}_ANGLE`, capture.angle); setRecorded(`${names[direction]} direction recorded. Select the next direction when ready.`) } }} />
            <ValueRow global={global} label={`${names[direction]} travel`} setting={`${key}_RANGE`} value={Math.round(calibration.ranges[direction] * 1000) / 10}
              min={10} max={100} step={1} fineStep={.1} format={value => `${value}%`} disabled={unavailable}
              caption="Optional: the travel that becomes full output in this direction, after restrictor-ring scaling. Leave at 100% to keep the current reach."
              onChange={value => writeKey(setText, `${key}_RANGE`, value / 100)} onReset={() => writeKey(setText, `${key}_RANGE`, null)} />
            <OpenRow label={`Record ${names[direction].toLowerCase()} full travel`} value="Record" disabled={captureUnavailable}
              hint="Push to your comfortable full reach in this direction. Records travel only."
              onOpen={() => { if (capture) { writeKey(setText, `${key}_RANGE`, capture.range); setRecorded(`${names[direction]} full travel recorded.`) } }} />
            <p className={styles.status} role="status">{recorded || (raw ? 'Physical and corrected movement are shown live.' : 'Connect the selected controller to record. Manual adjustments remain available.')}</p>
            <OpenRow label="Reset natural directions" value="Reset" disabled={unavailable}
              hint="Return all four adjustments to zero and travel to 100%. Keeps your stick rotation and ring settings."
              onOpen={() => { writeKeys(setText, Object.fromEntries(calibrationDirections.flatMap(d => [[`${prefix}_${d}_ANGLE`, 0], [`${prefix}_${d}_RANGE`, 1]]))); setRecorded('Natural directions reset.') }} />
          </div>
          <aside className={styles.preview}>
            <h2>Your stick shape</h2>
            <StickGeometryPreview raw={raw} adjusted={adjusted} geometry={geometry} inner={0} outer={0} />
            <p>The tinted outline is your calibrated physical reach. Its four markers become the corrected cardinal directions.</p>
            {!calibration.enabled && <p>Enable “Use natural directions” to preview and apply the calibrated shape.</p>}
            <p>Calibration affects keyboard movement, analog steering and other stick modes. Keyboard direction width and deadzones are applied afterwards.</p>
          </aside>
        </div>
      </div>
    </SubPage>
  </>
}
