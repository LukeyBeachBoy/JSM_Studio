import { useEffect, useRef, useState } from 'react'
import { ModeCards, OpenRow, ValueRow } from '../ui/console'
import { AddModeshiftSheet } from '../keymap/AddModeshiftSheet'
import { SettingOrigin } from '../SettingOrigin'
import { parseGyroActivation, writeGyroActivation, gyroConditions, type GyroActivationMode } from '../../utils/gyroActivation'
import { readGyroSpeed, writeTurnSpeed } from '../../utils/gyroSpeed'
import { gyroDeflectionEnabled } from '../../utils/gyroDeflectionSettings'
import { isVirtualStickTarget } from '../../utils/virtualStickSettings'
import { useGyro } from './GyroContext'
import { LiveTrace, liveOmega, useHistory } from './visuals'
import { ActivationArt } from './art'
import { useHoldInputs, inputName, defaultHoldInput, pressedNow, isActiveNow } from './inputs'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import p4 from '../sticks/P4.module.css'
import styles from './Gyro.module.css'

// The Gyro front (console v2, redesigned after the 2026-10-09 UX review): the
// same frame as Sticks, Triggers and Trackpads. "Gyro is on…" picture cards for
// the activation, the gyro drawn live with whether it is on right now, the
// hero Turn speed, the hold button (A picks it), Recalibrate, Match a full
// turn and Fine-tune. Y is More everywhere (GyroPage wraps the front in
// GyroMore); a row that answers Y itself (a value's Use Default) claims it
// first. Every choice writes at once (IMPLEMENTATION.md D1).

type Props = {
  onFineTune: () => void
  onWhenOn: () => void
  onCalibrate: () => void
  onMatchTurn: () => void
}

type Q1 = 'always' | 'hold' | 'unless' | 'aiming' | 'off'

export function GyroFront({ onFineTune, onWhenOn, onCalibrate, onMatchTurn }: Props) {
  const gyro = useGyro()
  const root = useRef<HTMLDivElement>(null)
  const [picking, setPicking] = useState<null | 'hold_on' | 'hold_off'>(null)
  const holdInputs = useHoldInputs(gyro.family, gyro.callbacks.gridCommands)
  const output = (gyro.get('GYRO_OUTPUT') ?? 'MOUSE').toUpperCase()
  const motion = output === 'PS_MOTION'
  const deflection = isVirtualStickTarget(output) && gyroDeflectionEnabled(gyro.text)
  const activation = parseGyroActivation(gyro.text)
  const combined = gyroConditions(activation.button)
  const speed = readGyroSpeed(gyro.text)
  const omega = liveOmega(gyro.sample)
  const history = useHistory(omega)
  const tryIt = gyro.callbacks.onTryIt
  const pressed = pressedNow(gyro.sample?.devices?.[0])
  const onNow = isActiveNow(activation, pressed)

  // X on the front tries the configuration in Test (Y is More, in GyroPage).
  const latestTry = useRef(tryIt)
  latestTry.current = tryIt
  useEffect(() => {
    const node = root.current
    if (!node) return
    const onPad = (event: Event) => {
      if ((event as CustomEvent<PadEventDetail>).detail.button !== 'X' || event.defaultPrevented || !latestTry.current) return
      event.preventDefault()
      latestTry.current()
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [])

  const q1: Q1 = activation.mode === 'always_on' ? 'always' : activation.mode === 'always_off' ? 'off' : activation.mode === 'hold_off' ? 'unless' : activation.button === 'ZL' ? 'aiming' : 'hold'
  const holdButton = activation.button && !combined ? activation.button : defaultHoldInput(gyro.devices?.[0])
  const setActivation = (mode: GyroActivationMode, button = holdButton) => gyro.setText(previous => writeGyroActivation(previous, mode, button))
  const heldText = combined ? `${combined.match === 'ANY' ? 'Any' : 'All'} of ${combined.conditions.length} inputs` : inputName(activation.button || holdButton, gyro.family)
  const pickHold = () => { if (combined) onWhenOn(); else setPicking(q1 === 'unless' ? 'hold_off' : 'hold_on') }
  const choose = (value: string) => {
    const option = value as Q1
    if (gyro.locked) return
    // A on the current hold card changes its button (a combined condition lives on its own screen).
    if ((option === 'hold' && q1 === 'hold') || (option === 'unless' && q1 === 'unless')) { pickHold(); return }
    if (option === 'always') setActivation('always_on')
    else if (option === 'off') setActivation('always_off')
    else if (option === 'aiming') setActivation('hold_on', 'ZL')
    else if (option === 'unless') setActivation('hold_off', q1 === 'hold' || q1 === 'unless' ? activation.button || holdButton : holdButton)
    else setActivation('hold_on', q1 === 'unless' && activation.button ? activation.button : holdButton)
  }
  const cards: { value: Q1; label: string; caption: string }[] = [
    { value: 'always', label: 'Always', caption: 'Simplest. Lift the controller to stop.' },
    { value: 'hold', label: 'While I hold…', caption: q1 === 'hold' ? heldText : 'A button you choose' },
    { value: 'unless', label: 'Unless I hold…', caption: q1 === 'unless' ? heldText : 'Hold to reposition, like lifting a mouse' },
    { value: 'aiming', label: 'Only while aiming', caption: `While ${inputName('ZL', gyro.family)} is pulled` },
    { value: 'off', label: 'Off', caption: 'Bindings that switch gyro on still work' },
  ]
  // B on a top-level tab goes to Layout (App), so the footer says so.
  const stepHints = `${tryIt ? 'X:Try it in Test;' : ''}Y:More;B:Layout`
  const speedReason = motion ? 'Motion to game sends the raw motion; the game sets the speed.'
    : deflection ? 'Hold the angle sets the stick from the angle: change it under Fine-tune ▸ Direction ▸ Stick settings.' : undefined
  const held = q1 === 'hold' || q1 === 'unless'
  const status = onNow ? 'On now' : 'Off now'
  const statusDetail = q1 === 'always' ? 'Always on' : q1 === 'off' ? 'Switched off' : q1 === 'aiming' ? `${inputName('ZL', gyro.family)} ${onNow ? 'is' : 'is not'} pulled`
    : combined ? `${heldText} ${q1 === 'unless' ? 'not ' : ''}matched` : `${heldText} ${pressed.has(activation.button || holdButton) ? 'is held' : 'is not held'}`

  return (
    <div ref={root} className={p4.front} data-gyro-front="">
      {/* The first section holds the cards and the way to combined inputs (tests reach When is gyro on? through its last button). */}
      <section className={styles.frontCards} aria-label="When is gyro on?">
        <header className={p4.frontHeading}>
          <h1>Gyro is on…</h1>
          <SettingOrigin setting={activation.mode === 'hold_off' ? 'GYRO_OFF' : 'GYRO_ON'} />
          <span>Changes apply live.</span>
        </header>
        {motion && <p className={styles.questionNote}>Motion to game always sends the motion; this turns Rumble while aiming on and off.</p>}
        <ModeCards columns={5} value={q1} onChange={choose} hints={stepHints} className={styles.cards}
          useLabel={card => (card.value === q1 && held ? 'Change button' : `Use ${card.label.replace(/…$/, '')}`)}
          options={cards.map(card => ({ value: card.value, label: card.label, caption: card.caption, art: <ActivationArt kind={card.value} />,
            unavailable: gyro.locked, data: { 'data-q1': card.value } }))} />
        <button type="button" className={styles.footnote} data-hints={`A:Open;${stepHints}`} onClick={onWhenOn}
          data-caption="When is gyro on? · Several inputs together, and gyro changes while you hold a button">
          Several inputs at once, or gyro changes while you hold a button <span aria-hidden="true">▸</span>
        </button>
      </section>
      <div className={p4.frontLower}>
        <div className={styles.frontLive} data-gyro-live={onNow ? 'on' : 'off'}>
          <LiveTrace history={history} label={<>live · {omega === null ? '—' : `${Math.round(omega)} °/s`}</>} />
          <p className={styles.frontStatus}><b data-on={onNow ? 'true' : undefined}>{status}</b><span>{statusDetail}</span></p>
        </div>
        <div className={p4.frontRows}>
          {held && <OpenRow label={q1 === 'unless' ? 'Gyro pauses while I hold' : 'Gyro is on while I hold'} hint={combined ? 'Several inputs · When is gyro on?' : 'A pad, a grip, any button'} value={heldText}
            hints={`A:${combined ? 'Open' : 'Change button'};${stepHints}`} data={{ 'data-hold-button': '' }} onOpen={pickHold} disabled={gyro.locked} />}
          <ValueRow hero label="Turn speed" setting={speed.mode === 'static' ? 'GYRO_SENS' : 'MIN_GYRO_SENS'} value={Number(speed.base.toFixed(2))} min={0} max={30} step={0.1} fineStep={0.01}
            format={value => `${Number(value.toFixed(2))}×`} disabled={speedReason ?? gyro.locked}
            caption={speed.mode === 'accel' ? 'Speed-up is on: fast turns go further. Slow · precise ↔ Fast · twitchy' : 'Slow · precise ↔ Fast · twitchy'}
            onChange={value => gyro.setText(previous => writeTurnSpeed(previous, value, '', gyro.text))}
            onReset={() => gyro.setText(previous => writeTurnSpeed(previous, 1, '', gyro.text))}
            onX={tryIt ? { label: 'Try it in Test', run: tryIt } : undefined} extraHints={stepHints}
            data={{ 'data-setting': 'GYRO_SENS' }} />
          <OpenRow label="Aim drifts when still" hint={`Recalibrate · set it down for ${gyro.num('GYRO_CALIBRATION_TIME', 5)} s`} value="Run" onOpen={onCalibrate} hints={`A:Run;${stepHints}`} />
          <OpenRow label="Match a full turn" hint="Turn once in game; the speed is set for you" onOpen={onMatchTurn}
            value={gyro.get('REAL_WORLD_CALIBRATION') ? 'Matched' : undefined}
            disabled={output !== 'MOUSE' ? 'Only while gyro sends the mouse: a stick’s speed is its game turn rate (Fine-tune ▸ Direction ▸ Stick settings).' : undefined}
            hints={`A:Start;${stepHints}`} />
          <OpenRow label="Fine-tune" hint="Speed, steadiness, direction, tilt, rumble" onOpen={onFineTune} hints={`A:Open;${stepHints}`} data={{ 'data-gyro-fine-tune': '' }} />
        </div>
      </div>

      {picking && <AddModeshiftSheet inputName="gyro" command="GYRO" family={gyro.family} modifiers={holdInputs}
        taken={[]} initial={activation.button && !combined ? activation.button : null}
        eyebrow={picking === 'hold_off' ? 'Gyro · Unless I hold…' : 'Gyro · While I hold…'}
        onClose={() => setPicking(null)}
        onNext={trigger => { setActivation(picking, trigger); setPicking(null) }} />}
    </div>
  )
}
