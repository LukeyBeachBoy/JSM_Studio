import { useState } from 'react'
import { SubPage, OpenRow, ValueRow } from '../ui/console'
import { desktopBridge, type WindowsPointerSpeed } from '../../platform/desktopBridge'
import { readGyroSpeed } from '../../utils/gyroSpeed'
import { useGyro, KeyNumberRow, Note, VisualTitle, PadActions } from './GyroContext'
import { StatTiles, TurnCompass, useTurned, liveOmega } from './visuals'
import { pointerNotch, pointerSpeedText, usePointerSpeed } from './usePointerSpeed'
import styles from './Gyro.module.css'

// Match a full turn (360°) (GyroSpeedGame's guide; was RwcGuideModal and the
// manual calibration dialog): one full turn of the controller is one full
// turn in game, so turn speed then means turns. REAL_WORLD_CALIBRATION and
// IN_GAME_SENS, three ways to get the number: measure it in game with the
// mapper, work it out from mouse-sensitivity.com counts, or type a known one.

const MOUSE_SENSITIVITY_URL = 'https://www.mouse-sensitivity.com'

/** The left visual: a compass you fill by turning, the numbers, and Windows' pointer speed. */
export function MatchTurnVisual({ pointer, turned }: { pointer: WindowsPointerSpeed | null | undefined; turned: ReturnType<typeof useTurned> }) {
  const gyro = useGyro()
  const rwc = gyro.get('REAL_WORLD_CALIBRATION')
  const sens = gyro.num('IN_GAME_SENS', 1)
  const base = readGyroSpeed(gyro.text).base
  const omega = liveOmega(gyro.sample)
  return <div className={styles.matchVisual}>
    <VisualTitle title="One turn here, one turn there" live={omega === null ? '—' : `${Math.round(omega)} °/s`} />
    <p className={styles.visualCaption}>{rwc ? 'Matched: one turn of the controller is one turn in game at 1×.' : 'Not matched yet, so turn speed is a plain mouse multiplier.'}</p>
    <TurnCompass degrees={turned.degrees} label={`You have turned the controller ${Math.round(Math.abs(turned.degrees))}°`} />
    <p className={styles.visualCaption}>Turn the controller once, all the way round. X starts the count again.</p>
    <StatTiles tiles={[
      { label: 'Full-turn value', value: rwc ?? 'Not set' },
      { label: 'In-game sensitivity', value: String(sens) },
      { label: rwc ? `${Number(base.toFixed(2))}× means` : 'Once matched', value: `${Number(base.toFixed(2))} turn${Number(base.toFixed(2)) === 1 ? '' : 's'}${rwc ? '' : ` at ${Number(base.toFixed(2))}×`}` },
    ]} />
    <p className={styles.pointer} data-fine={pointer && pointer.speed === 10 && !pointer.enhancePrecision ? 'true' : undefined}>
      {pointer ? <b>{pointerNotch(pointer.speed)}</b> : null}{pointerSpeedText(pointer)}
    </p>
  </div>
}

export function MatchFullTurn({ open, onClose, trail }: { open: boolean; onClose: () => void; trail: string[] }) {
  const gyro = useGyro()
  const pointer = usePointerSpeed(open)
  const turned = useTurned(gyro.sample)
  const [counts, setCounts] = useState(0)
  const [countSens, setCountSens] = useState<number | null>(null)
  const sens = countSens ?? gyro.num('IN_GAME_SENS', 1)
  const computed = counts > 0 && sens > 0 ? sens / (360 / counts) : null
  const output = (gyro.get('GYRO_OUTPUT') ?? 'MOUSE').toUpperCase()
  const mouseOnly = output !== 'MOUSE' ? 'Only while gyro sends the mouse.' : undefined
  return (
    <SubPage open={open} onClose={onClose} trail={trail} title="Match a full turn (360°)" backLabel="Back" hints={[{ button: 'X', label: 'Count again' }]}
      where={`${trail.join(' · ')} · Match a full turn`}>
      <PadActions x={turned.reset}><div className={styles.split} data-match-turn="">
        <section className={styles.visualCard}><MatchTurnVisual pointer={pointer} turned={turned} /></section>
        <section className={styles.splitRows}>
          <header className={styles.pageHeading}><h1>Match a full turn (360°)</h1><p>One turn of the controller becomes one turn in game, so 1× means one turn. Three ways, in order of effort.</p></header>
          {mouseOnly && <Note tone="warn">{mouseOnly} A stick’s speed is its game turn rate, under Direction ▸ Stick settings.</Note>}
          <KeyNumberRow k="IN_GAME_SENS" label="In-game sensitivity" hint="Set this to the mouse sensitivity inside the game first" fallback={1} min={0} max={100} step={0.1} fineStep={0.01} disabled={mouseOnly} />
          <div className={styles.subhead}>1 · Measure it in game</div>
          <OpenRow label="Measure it in game" hint="The mapper turns you a set amount; you count the turns, it works out the value" value="Start"
            onOpen={() => gyro.callbacks.onOpenCalibration?.()} disabled={mouseOnly ?? (gyro.callbacks.onOpenCalibration ? undefined : 'Not available here.')} hints="A:Start" />
          <div className={styles.subhead}>2 · From mouse-sensitivity.com</div>
          <OpenRow label="Open mouse-sensitivity.com" hint="Set Units to Counts, pick your game, enter any sensitivity and DPI" onOpen={() => void desktopBridge.openExternal(MOUSE_SENSITIVITY_URL)} hints="A:Open the site" />
          <ValueRow label="Sensitivity you entered there" value={sens} min={0} max={100} step={0.1} fineStep={0.01} onChange={setCountSens} disabled={mouseOnly} />
          <ValueRow label="Counts it shows" value={counts} min={0} max={50000} step={100} fineStep={1} format={value => (value > 0 ? String(value) : '—')} onChange={setCounts} disabled={mouseOnly} />
          <OpenRow label="Use this value" hint={computed !== null ? `Full-turn value ${computed.toFixed(4)} at sensitivity ${sens}` : 'Enter the counts first'}
            value={computed !== null ? computed.toFixed(4) : undefined} disabled={computed === null ? 'Enter the counts first.' : mouseOnly}
            onOpen={() => { if (computed === null) return; gyro.set('REAL_WORLD_CALIBRATION', Number(computed.toFixed(4))); gyro.set('IN_GAME_SENS', sens) }} hints="A:Use it" />
          <div className={styles.subhead}>3 · Already know it</div>
          <KeyNumberRow k="REAL_WORLD_CALIBRATION" label="Full-turn value" hint="Type a value you already know" fallback={0} min={0} max={10000} step={0.1} fineStep={0.01}
            format={value => (value > 0 ? String(value) : 'Not set')} disabled={mouseOnly} />
        </section>
      </div></PadActions>
    </SubPage>
  )
}
