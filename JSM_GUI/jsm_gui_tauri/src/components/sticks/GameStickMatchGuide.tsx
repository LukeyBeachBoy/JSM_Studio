import { useState, type Dispatch, type SetStateAction } from 'react'
import { SubPage, SegmentedRow, ValueRow, OpenRow } from '../ui/console'
import { SummaryRow } from '../ui/SummaryRow'
import { readVirtualSetting, VIRTUAL_STICK_FIELDS, virtualStickValues, writeVirtualSetting, writeVirtualStickNumber, type VirtualStickTarget } from '../../utils/virtualStickSettings'
import { GameCurve } from './visuals'
import { Note, VisualPanel } from './shared'
import styles from './P4.module.css'

// Match the game / Find the game's dead zone (console v2: StickGamepadOutput,
// StickFlickOutput, GyroStickSetup). The six steps that used to live in
// GyroVirtualStick's "Tune for this game" sheet, as one shared guided
// sub-page for any virtual stick target: a stick in Gamepad stick mode, a
// flick sent through a gamepad stick, and gyro to joystick (P5 can reuse this:
// pass `prefix` for a shifted scope, and `live` for the dot).

export const GAME_STICK_STEPS = [
  { title: 'Choose controller output', detail: 'Turn on Xbox or PlayStation output. Hide the real controller if the game sees it twice.' },
  { title: 'Set the game’s camera sensitivity', detail: 'Set its stick sensitivity high and turn off its camera acceleration if it has one. Keep those fixed while you do this.' },
  { title: 'Time one full turn', detail: 'Hold the game’s stick fully and time one complete turn. JSM uses 360 ÷ seconds as the game’s top turn speed.' },
  { title: 'Find the game’s dead zone', detail: 'Put the controller down: the test signal is on. Raise the dead zone until the view just creeps, then back off a little. Stand somewhere safe in the game.' },
  { title: 'Undo the game’s curve', detail: 'Start with Even. If small turns feel too slow next to big ones, try Undo square. Lower Outer range if the game reaches top speed before full tilt.' },
  { title: 'Test slow aim and fast turns', detail: 'Finish turns the test signal off, so the stick sends nothing while it rests.' },
] as const

type Props = { open: boolean; onClose: () => void; text: string; setText?: Dispatch<SetStateAction<string>>; target: VirtualStickTarget; prefix?: string; trail: string[]; live?: number }

export function GameStickMatchGuide({ open, onClose, text, setText, target, prefix = '', trail, live = 0 }: Props) {
  const [step, setStep] = useState(0)
  const values = virtualStickValues(text, target, prefix)
  const controller = readVirtualSetting(text, 'VIRTUAL_CONTROLLER') ?? 'NONE'
  const write = (key: string, value: string | number, scoped = prefix) => setText?.(previous => writeVirtualSetting(previous, key, value, scoped))
  const field = (key: keyof typeof VIRTUAL_STICK_FIELDS, value: number) => setText?.(previous => writeVirtualStickNumber(previous, target, key, value, text, prefix))
  const finish = () => { write(`${target}_DEADZONE_PROBE`, 'OFF'); onClose() }
  const next = () => step === GAME_STICK_STEPS.length - 1 ? finish() : setStep(step + 1)
  const current = GAME_STICK_STEPS[step]
  const stickName = target === 'LEFT_STICK' ? 'left' : 'right'
  return (
    <SubPage open={open} onClose={onClose} trail={trail} title="Match the game" stepLabel="Step" onStep={direction => setStep(value => Math.max(0, Math.min(GAME_STICK_STEPS.length - 1, value + direction)))}
      badge={values.probe ? 'Test signal on · B to stop' : undefined} backLabel="Stop test"
      where={`${trail.join(' · ')} · Match the game · Step ${step + 1} of ${GAME_STICK_STEPS.length}`}>
      <div className={styles.frontLower} data-wide-visual="true" data-game-stick-guide={step}>
        <div className={styles.frontRows}>
          <span className={styles.subHead}>Step {step + 1} of {GAME_STICK_STEPS.length} · game’s {stickName} stick</span>
          <h2 style={{ margin: 0 }}>{current.title}</h2>
          <p className={styles.lede}>{current.detail}</p>
          {step === 0 && <SegmentedRow label="Controller output" setting="VIRTUAL_CONTROLLER" value={controller === 'DS4' ? 'DS4' : controller === 'XBOX' ? 'XBOX' : 'NONE'}
            options={[{ value: 'NONE', label: 'Off' }, { value: 'XBOX', label: 'Xbox' }, { value: 'DS4', label: 'PlayStation' }]} onChange={value => write('VIRTUAL_CONTROLLER', value === 'NONE' ? '' : value, '')} />}
          {step === 2 && <ValueRow hero label="Seconds for one full turn" setting="VIRTUAL_STICK_CALIBRATION" value={Number((360 / values.maxSpeed).toFixed(3))} min={0.02} max={30} step={0.05} fineStep={0.01}
            format={value => `${value} s · ${Math.round(360 / value)}°/s`} onChange={value => write('VIRTUAL_STICK_CALIBRATION', Number((360 / value).toFixed(4)))} />}
          {step === 3 && <>
            <SummaryRow label="Test signal" hint="Sends the dead zone while the stick rests" setting={`${target}_DEADZONE_PROBE`} toggle={{ on: values.probe, onChange: on => write(`${target}_DEADZONE_PROBE`, on ? 'ON' : 'OFF') }} />
            <ValueRow hero label="Game’s dead zone" setting={`${target}_UNDEADZONE_INNER`} value={Math.round(values.inner * 1000) / 10} min={0} max={Math.round((0.999 - values.outer) * 1000) / 10} step={1} fineStep={0.1}
              format={value => `${value}%`} onChange={value => field('UNDEADZONE_INNER', value / 100)} />
          </>}
          {step === 4 && <>
            <SegmentedRow label="Response curve" setting={`${target}_UNPOWER`} value={values.exponent === 2 ? 'square' : values.exponent <= 1 ? 'even' : 'custom'}
              options={[{ value: 'even', label: 'Even' }, { value: 'square', label: 'Undo square' }, { value: 'custom', label: 'Custom' }]}
              onChange={value => value === 'custom' ? field('UNPOWER', 1.5) : field('UNPOWER', value === 'square' ? 2 : 0)} />
            <ValueRow label="Outer range" setting={`${target}_UNDEADZONE_OUTER`} value={Math.round((1 - values.outer) * 1000) / 10} min={Math.round((values.inner + 0.001) * 1000) / 10} max={100} step={1} fineStep={0.1}
              format={value => `Full at ${value}%`} onChange={value => field('UNDEADZONE_OUTER', (100 - value) / 100)} />
          </>}
          {step === 5 && <Note>The game still caps how fast it turns; this matches your stick to it.</Note>}
          <OpenRow label={step === GAME_STICK_STEPS.length - 1 ? 'Finish' : 'Next step'} hint={step === GAME_STICK_STEPS.length - 1 ? 'Turns the test signal off' : GAME_STICK_STEPS[step + 1].title}
            onOpen={next} hints={`A:${step === GAME_STICK_STEPS.length - 1 ? 'Finish' : 'Next step'};B:Stop test`} />
        </div>
        <VisualPanel title="What the game receives" chip={`${values.probe ? 'test signal on' : 'resting'} · sends ${Math.round((values.probe && live < 0.05 ? values.inner : live) * 100)}%`}>
          <GameCurve inner={values.inner} outer={values.outer} exponent={values.exponent} probe={values.probe} push={live} />
        </VisualPanel>
      </div>
    </SubPage>
  )
}
