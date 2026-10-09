import { useEffect, useRef, useState } from 'react'
import { SubPage, OpenRow, ValueRow } from '../ui/console'
import { usePreferences } from '../../platform/preferenceStore'
import { useGyro, KeySwitchRow, Note, PadActions } from './GyroContext'
import { ControllerArt, CalibrationRing, StatTiles, liveOmega } from './visuals'
import styles from './Gyro.module.css'

// Recalibrate (GyroCalibrate): CALIBRATE_GYRO with its progress, read from the
// mapper's telemetry (gyroCal: 1 waiting to start, 2 measuring, 3 thrown away
// because the controller moved), and the settings for the next run.
//
// Two things the design draws need the mapper: there is no command to stop a
// run and keep the old calibration, and telemetry carries no "drift found so
// far". The mapper does keep the old calibration whenever the controller moves
// while it measures, so that is how a run is stopped here. See notes/GYRO.md.

type Gyrocal = { phase: number; remainingMs: number; totalMs: number; reached: number }

export function Recalibrate({ open, onClose, trail, isCalibrating, countdown }: { open: boolean; onClose: () => void; trail: string[]; isCalibrating: boolean; countdown: number | null }) {
  const gyro = useGyro()
  const { runtime } = usePreferences()
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState<'done' | 'moved' | null>(null)
  const cal = (gyro.sample?.gyroCal as Gyrocal | undefined) ?? null
  const phase = cal?.phase ?? (isCalibrating ? 2 : 0)
  const lastPhase = useRef(0)
  const start = () => { setFinished(null); setStarted(true); gyro.callbacks.onRecalibrate?.() }

  // Starts as it opens: "Aim drifts when still · Run".
  useEffect(() => { if (open && !started) start() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase === 3 && lastPhase.current !== 3) setFinished('moved')
    else if (phase === 0 && lastPhase.current === 2) setFinished('done')
    lastPhase.current = phase
  }, [phase])

  const delay = gyro.num('GYRO_CALIBRATION_DELAY', runtime?.gyroCalibrationDelay ?? 0)
  const duration = gyro.num('GYRO_CALIBRATION_TIME', runtime?.gyroCalibrationSeconds ?? 5)
  const remaining = cal && phase ? cal.remainingMs / 1000 : countdown ?? 0
  const total = cal && phase ? cal.totalMs / 1000 : phase === 1 ? delay : duration
  const omega = liveOmega(gyro.sample)
  const still = omega === null ? null : omega < 2
  const step = finished ? 3 : phase === 2 ? 2 : 1
  const ring = phase === 1 ? { big: String(Math.ceil(remaining)), small: `second${Math.ceil(remaining) === 1 ? '' : 's'} · set it down` }
    : phase === 2 ? { big: String(Math.ceil(remaining)), small: `second${Math.ceil(remaining) === 1 ? '' : 's'} left · keep it still` }
    : finished === 'moved' ? { big: '!', small: `moved at ${cal?.reached ?? 0}% · old one kept` }
    : finished === 'done' ? { big: '✓', small: 'calibrated' }
    : { big: '…', small: started ? 'starting' : 'ready' }
  const statusText = phase === 1 ? 'Waiting · put it down' : phase === 2 ? 'Measuring · keep it still' : finished === 'moved' ? 'Stopped: the controller moved' : finished === 'done' ? 'Done' : 'Ready'
  const ownRun = !gyro.held

  return (
    <SubPage open={open} onClose={onClose} trail={trail} title="Recalibrate" backLabel={phase ? 'Close · keeps measuring' : 'Back to Gyro'}
      hints={[{ button: 'X', label: 'Start over' }]}>
      <PadActions x={start}><div className={styles.calibrate} data-recalibrate="" data-phase={phase}>
        <section className={styles.visualCard}>
          <ol className={styles.calSteps}>
            {['Set it down', 'Keep it still', 'Done'].map((label, index) => <li key={label} data-current={step === index + 1 ? 'true' : undefined} data-done={step > index + 1 ? 'true' : undefined}>{index + 1} · {label}</li>)}
            <li className={styles.calStatus} role="status">{statusText}</li>
          </ol>
          <div className={styles.calBody}>
            <ControllerArt label="The controller, resting" className={styles.calArt} />
            <CalibrationRing fraction={phase && total > 0 ? remaining / total : finished ? 0 : 1} big={ring.big} small={ring.small} still={phase === 2 ? still : null} />
          </div>
          {/* The mapper reports no "drift found so far" while measuring, so there is no tile for it. */}
          <StatTiles tiles={[
            { label: 'Movement now', value: omega === null ? '—' : `${omega.toFixed(2)} °/s` },
            { label: phase === 1 ? 'Starting in' : 'Measured', value: phase === 2 ? `${Math.max(0, total - remaining).toFixed(1)} of ${total.toFixed(0)} s` : phase === 1 ? `${remaining.toFixed(1)} s` : finished === 'done' ? `${duration} of ${duration} s` : '—' },
          ]} />
          <div className={styles.calActions}>
            <OpenRow label={phase === 2 ? 'Stop and keep the old calibration' : phase === 1 ? 'Stop' : 'Close'}
              hint={phase === 2 ? 'Pick the controller up: a moved controller throws the run away and keeps the old calibration' : phase === 1 ? 'The mapper can’t cancel a run; it will measure after the wait. Pick it up while it measures to keep the old one.' : 'Back to Gyro'}
              onOpen={onClose} hints={`A:${phase === 2 ? 'Stop' : 'Close'};X:Start over`} data={{ 'data-cal-stop': '' }}
              disabled={phase === 2 ? 'The mapper has no stop command yet: pick the controller up and the run is thrown away, keeping the old calibration.' : undefined} />
            <OpenRow label="Start over" hint="Measure again from the start" onOpen={start} hints="A:Start over" data={{ 'data-cal-restart': '' }} />
          </div>
        </section>
        <section className={styles.splitRows}>
          <header className={styles.pageHeading}><h1>Recalibrate</h1><p>Fixes aim that slowly drifts on its own. Measures every connected controller.</p></header>
          <KeySwitchRow k="AUTO_CALIBRATE_GYRO" label="Fix drift automatically" hint="While a controller rests during play" />
          <ValueRow label="Wait before measuring" hint="Time to put it down" setting={ownRun ? 'GYRO_CALIBRATION_DELAY' : undefined} value={delay} min={0} max={30} step={0.5} fineStep={0.1}
            format={value => `${value} s`}
            onChange={value => gyro.set('GYRO_CALIBRATION_DELAY', Number(value.toFixed(4)))} onReset={gyro.get('GYRO_CALIBRATION_DELAY') !== undefined ? () => gyro.reset('GYRO_CALIBRATION_DELAY') : undefined}
            data={{ 'data-setting': 'GYRO_CALIBRATION_DELAY' }} />
          <ValueRow label="Measure for" hint="Keep it still this long" setting={ownRun ? 'GYRO_CALIBRATION_TIME' : undefined} value={duration} min={0.5} max={60} step={0.5} fineStep={0.1}
            format={value => `${value} s`}
            onChange={value => gyro.set('GYRO_CALIBRATION_TIME', Number(value.toFixed(4)))} onReset={gyro.get('GYRO_CALIBRATION_TIME') !== undefined ? () => gyro.reset('GYRO_CALIBRATION_TIME') : undefined}
            data={{ 'data-setting': 'GYRO_CALIBRATION_TIME' }} />
          <Note>These apply to the next run, for this configuration only. A held button can’t change them. Without a value here, Settings ▸ Controller’s defaults apply.</Note>
          <OpenRow label="Aim slides back on its own?" hint="That’s the Steam Controller’s own re-centring: switch it off in Settings ▸ Controller" value="Settings ▸ Controller"
            onOpen={() => gyro.callbacks.onOpenControllerSettings?.()} disabled={gyro.callbacks.onOpenControllerSettings ? undefined : 'Open Settings ▸ Controller from Home.'} data={{ 'data-controller-settings': '' }} />
        </section>
      </div></PadActions>
    </SubPage>
  )
}
