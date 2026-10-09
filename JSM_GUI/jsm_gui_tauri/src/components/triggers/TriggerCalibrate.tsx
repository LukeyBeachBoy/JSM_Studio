import { useEffect, useRef, useState } from 'react'
import { SubPage } from '../ui/console'
import { desktopBridge } from '../../platform/desktopBridge'
import { getPressedControllerCommandSet } from '../../utils/controllerStatus'
import type { TelemetryDevice } from '../../hooks/useTelemetry'
import { writeKeys, type SetText } from '../sticks/shared'
import { useShell } from '../../shell/ShellContext'
import styles from './Triggers.module.css'

// Calibrate triggers (console v2, TriggersCalibrate; D8). The mapper's
// CALIBRATE_TRIGGERS runs its own steps and reports no progress, so this
// screen follows them from telemetry: it starts the command, then watches the
// trigger and the buttons the mapper waits for (D-pad down for the right
// trigger, Cross for the left; Home abandons). The mapper keeps what it
// measured for this controller (runtime settings); it is not written into the
// configuration unless you copy it in at the end.

type Step = 'start' | 'squeeze' | 'follow' | 'release'
type Props = { readText: string; setText?: SetText; liveDevice?: TelemetryDevice; onClose: () => void
  /** The trigger the page was on when Calibrate was opened: what the panel shows until the mapper's own order (right, then left) takes over. */
  from?: 'left' | 'right' }

const STEPS: { id: Step; title: string; detail: string }[] = [
  { id: 'squeeze', title: 'Squeeze until it pushes back', detail: 'Softly, until you just feel the resistance.' },
  { id: 'follow', title: 'Pull fully', detail: 'Light touch, all the way to the stop' },
  { id: 'release', title: 'Let go', detail: 'Then the same three steps on the other trigger' },
]
const CONFIRM: Record<'right' | 'left', { command: string; label: string }> = { right: { command: 'DOWN', label: 'D-pad down' }, left: { command: 'S', label: 'Cross' } }

export function TriggerCalibrate({ setText, liveDevice, onClose, from = 'right' }: Props) {
  const { configName } = useShell()
  const [trigger, setTrigger] = useState<'right' | 'left' | 'done'>('right')
  const [step, setStep] = useState<Step>('start')
  const [found, setFound] = useState<Record<string, number>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [result, setResult] = useState<Record<string, number> | null>(null)
  const peak = useRef(0)
  const dualSense = liveDevice?.type === 5

  // Start the mapper's procedure once.
  useEffect(() => {
    if (!dualSense) return
    let cancelled = false
    void desktopBridge.runCalibrationCommand('CALIBRATE_TRIGGERS').then(answer => {
      if (cancelled) return
      if (!answer.success) setProblem('The mapper did not start calibration. Is it running?')
      else setStep('squeeze')
    }).catch(() => { if (!cancelled) setProblem('The mapper did not start calibration. Is it running?') })
    return () => { cancelled = true }
  }, [dualSense])

  // Follow the steps from telemetry. Until the mapper's procedure has started
  // (and on a controller that can't calibrate) the panel shows the trigger
  // the page was on, not the mapper's first.
  const started = dualSense && step !== 'start'
  const side = !started ? from : trigger === 'done' ? 'right' : trigger
  const pull = liveDevice?.status ? liveDevice.status.triggers[side] : 0
  const pressed = getPressedControllerCommandSet(liveDevice)
  useEffect(() => {
    if (trigger === 'done' || step === 'start') return
    if (pressed.has('HOME')) { onClose(); return }
    if (step === 'squeeze' && pressed.has(CONFIRM[trigger].command)) { setFound(previous => ({ ...previous, [trigger]: Math.round(pull * 100) })); peak.current = 0; setStep('follow') }
    else if (step === 'follow') { peak.current = Math.max(peak.current, pull); if (pull >= 0.99) setStep('release') }
    else if (step === 'release' && pull < 0.05) {
      if (trigger === 'right') { setTrigger('left'); setStep('squeeze') }
      else setTrigger('done')
    }
  })

  // When both are done, ask the mapper what it measured.
  useEffect(() => {
    if (trigger !== 'done') return
    let cancelled = false
    void (async () => {
      const read: Record<string, number> = {}
      for (const key of ['RIGHT_TRIGGER_OFFSET', 'RIGHT_TRIGGER_RANGE', 'LEFT_TRIGGER_OFFSET', 'LEFT_TRIGGER_RANGE']) {
        const answer = await desktopBridge.runCalibrationCommand(key).catch(() => null)
        const match = answer?.output && new RegExp(`${key}\\s*(?:=|is)\\s*(-?\\d+)`, 'i').exec(answer.output)
        if (match) read[key] = Number(match[1])
      }
      if (!cancelled) setResult(Object.keys(read).length === 4 ? read : null)
    })()
    return () => { cancelled = true }
  }, [trigger])

  const index = STEPS.findIndex(item => item.id === step)
  const title = trigger === 'done' ? 'Both triggers are calibrated' : step === 'start' ? 'Starting calibration…' : step === 'squeeze' ? 'Squeeze until it pushes back' : step === 'follow' ? 'Keep a gentle pull all the way down' : 'Let go'
  const lead = trigger === 'done' ? 'The controller keeps these values until the mapper restarts.'
    : step === 'squeeze' ? `Squeeze the ${trigger} trigger softly until you just feel it push back, then press ${CONFIRM[trigger].label}.`
    : step === 'follow' ? 'The trigger slowly gives way. Follow it with a light finger until it stops.'
    : step === 'release' ? 'Let the trigger come all the way back.' : 'Waiting for the mapper.'
  const where = `Triggers · Calibrate · ${trigger === 'done' ? 'Done' : side === 'right' ? 'Right trigger' : 'Left trigger'}`
  // Nothing has been measured until the mapper's procedure is under way, so
  // B is a plain Back until then; while measuring it stops and keeps the old values.
  const backLabel = trigger === 'done' ? 'Done' : started ? 'Stop, keep old values' : 'Back to Triggers'
  return (
    <SubPage open onClose={onClose} trail={['Triggers', from === 'left' ? 'Left trigger' : 'Right trigger']} title="Calibrate" badge={dualSense ? 'Calibrating · DualSense' : undefined} where={where}
      backLabel={backLabel}>
      <div className={styles.calibrate} data-trigger-calibrate={step}>
        <section className={styles.calibrateVisual}>
          <header><b>{side === 'right' ? 'Right' : 'Left'} trigger</b><span className={styles.live}>● live {Math.round(pull * 100)}%</span></header>
          <svg viewBox="0 0 360 260" role="img" aria-label={`${side} trigger at ${Math.round(pull * 100)}%`}>
            <path d="M60 210 Q200 230 280 70" stroke="#0e1419" strokeWidth="18" fill="none" strokeLinecap="round" />
            <path d="M60 210 Q200 230 280 70" stroke="var(--accent)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray="400" strokeDashoffset={400 - pull * 400} />
            {found[side] !== undefined && <text x="240" y="60" fill="#a6d65a" fontSize="13" fontWeight="600">Pushes back here · {found[side]}%</text>}
            <text x="40" y="244" fill="#e3eaf1" fontSize="13" fontWeight="600">Full press</text>
          </svg>
          <div className={styles.calibrateProgress}><span>{step === 'follow' ? 'Following it down' : 'Pull'}</span><b>{Math.round(pull * 100)}%</b></div>
          <div className={styles.bar}><span style={{ width: `${pull * 100}%` }} /></div>
        </section>
        <section className={styles.calibrateSteps}>
          {!dualSense ? <>
            <h1>Calibration needs a DualSense</h1>
            <p>Only a DualSense’s triggers push back, so there is nothing to measure on {liveDevice ? 'this controller' : 'a controller that isn’t connected'}.</p>
            <button type="button" className={styles.calibrateButton} data-autofocus data-hints="A:Back to Triggers;B:Back to Triggers" onClick={onClose}>Back to Triggers</button>
          </> : <>
            <div className={styles.calibrateTabs}><b data-current={trigger === 'right' ? 'true' : undefined}>Right trigger</b><b data-current={trigger === 'left' ? 'true' : undefined}>Left trigger</b></div>
            {trigger !== 'done' && step !== 'start' && <span className={styles.eyebrow}>{trigger === 'right' ? 'Right' : 'Left'} trigger · step {index + 1} of 3</span>}
            <h1>{title}</h1>
            <p>{lead}</p>
            {problem && <p role="alert" className={styles.problem}>{problem}</p>}
            {trigger !== 'done' && <ol className={styles.calibrateList}>
              {STEPS.map((item, i) => (
                <li key={item.id} data-state={i < index ? 'done' : i === index ? 'current' : 'next'}>
                  <span className={styles.stepNo}>{i < index ? '✓' : i + 1}</span>
                  <span><b>{item.id === 'squeeze' ? `${item.title} · then ${CONFIRM[trigger].label}` : item.title}</b><small>{item.id === 'squeeze' && found[trigger] !== undefined ? `Found at ${found[trigger]}%` : item.detail}</small></span>
                </li>
              ))}
            </ol>}
            {trigger === 'right' && <p className={styles.small}>Then the left trigger: confirm its push-back with Cross.</p>}
            {trigger === 'done' && (result
              ? <>
                  <p>Right starts at {result.RIGHT_TRIGGER_OFFSET}, travel {result.RIGHT_TRIGGER_RANGE}. Left starts at {result.LEFT_TRIGGER_OFFSET}, travel {result.LEFT_TRIGGER_RANGE}.</p>
                  <button type="button" className={styles.calibrateButton} data-autofocus onClick={() => { writeKeys(setText, result); onClose() }}>Keep these in {configName ?? 'this configuration'}</button>
                </>
              : <p>The mapper didn’t report the values it found, so they stay with this controller only. You can type them under Fine-tune ▸ Calibration.</p>)}
            {/* Something to hold focus that the pad's D-pad and A can't act on:
                the mapper reads those buttons during calibration. */}
            {trigger !== 'done' && <span tabIndex={0} data-autofocus className={styles.focusSink} data-hints={`B:${backLabel}`} aria-label="Calibrating" />}
            <p className={styles.small}>{trigger === 'done' ? 'Kept for this controller until the mapper restarts.' : 'Home stops and keeps the old values.'}</p>
          </>}
        </section>
      </div>
    </SubPage>
  )
}
