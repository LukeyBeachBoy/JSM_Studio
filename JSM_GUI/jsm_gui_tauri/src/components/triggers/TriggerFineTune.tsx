import { useEffect, useRef, useState } from 'react'
import { SubPage, FineTune, AdvancedParts, ModeCards, ValueRow, SegmentedRow, OpenRow, stepGroup, type FineTuneGroup } from '../ui/console'
import { SummaryRow } from '../ui/SummaryRow'
import { SettingPrefix } from '../SettingOrigin'
import { desktopBridge } from '../../platform/desktopBridge'
import { getKeymapValue } from '../../utils/keymap'
import { TRIGGER_EFFECTS, TRIGGER_EFFECT_CARDS, defaultTriggerEffect, effectFieldDisplay, effectProfile, parseTriggerEffect, readTriggerCalibration, triggerEffectProblem, writeTriggerEffect, type TriggerEffectMode } from '../../utils/adaptiveTriggers'
import { isSet, Note, readNumber, writeKey } from '../sticks/shared'
import { TriggerBlade, PushBackGraph } from './TriggerBlade'
import { gamepadModeValue, gamepadTarget, hasFullPress, isGamepadTriggerMode, type TriggerSide } from './triggerModes'
import type { TriggersPageProps } from './TriggersPage'
import styles from './Triggers.module.css'

// Triggers ▸ Fine-tune (TriggersFineTune, TriggersResistance, TriggersEffects)
// and its Advanced (TriggersAdvanced). Press points are shared by both
// triggers; resistance is per trigger; calibration is the DualSense's
// automatic-resistance start and travel.

type Props = TriggersPageProps & { side: TriggerSide; group: string; onGroup: (group: string) => void; onClose: () => void; onCalibrate: () => void }

const EFFECT_ORDER: TriggerEffectMode[] = ['ON', 'OFF', 'RESISTANCE', 'BOW', 'GALLOPING', 'SEMI_AUTOMATIC', 'AUTOMATIC', 'MACHINE', 'SEGMENT']
const SIDE_KEY = (side: TriggerSide): 'LEFT' | 'RIGHT' => side === 'left' ? 'LEFT' : 'RIGHT'

/** Send an effect to the running mapper so the trigger can be felt now
 *  (X Feel it): Studio's own profile is what runs while you edit, so the
 *  configuration's value would otherwise only arrive on Make live. */
const feelEffect = (side: TriggerSide, value: string) => {
  void desktopBridge.runCalibrationCommand(`ADAPTIVE_TRIGGER = ON`).catch(() => {})
  void desktopBridge.runCalibrationCommand(`${SIDE_KEY(side)}_TRIGGER_EFFECT = ${value}`).catch(() => {})
}

export function TriggerFineTune(props: Props) {
  const { side, group, onGroup, onClose, readText, setText, liveDevice } = props
  const [advanced, setAdvanced] = useState(false)
  const [part, setPart] = useState('window')
  const [effectSide, setEffectSide] = useState<TriggerSide>(side)
  const felt = useRef(new Set<TriggerSide>())
  // Leaving Fine-tune puts back the mapper's own effect for anything felt.
  useEffect(() => () => { felt.current.forEach(feltSide => void desktopBridge.runCalibrationCommand(`${SIDE_KEY(feltSide)}_TRIGGER_EFFECT = ON`).catch(() => {})) }, [])
  const name = side === 'left' ? 'Left trigger' : 'Right trigger'
  const mode = (side === 'left' ? props.zlMode : props.zrMode) || 'NO_FULL'
  const gamepad = isGamepadTriggerMode(mode)
  const dualSense = liveDevice?.type === 5
  const pull = liveDevice?.status ? liveDevice.status.triggers[side] : null
  const threshold = props.threshold
  const hair = threshold < 0
  const margin = readNumber(readText, 'TRIGGER_HYSTERESIS', 0.02)
  const skip = readNumber(readText, 'TRIGGER_SKIP_DELAY', 150)
  const adaptiveOn = (props.adaptiveValue || 'ON').toUpperCase() !== 'OFF'
  const halfInfo = props.buttons[side][0] ? props.describe(props.buttons[side][0].command) : { binding: '' }

  // ---- Press points
  const pressStatus = hair ? 'Changed: hair trigger' : threshold > 0 ? `Changed: half press at ${Math.round(threshold * 100)}%` : isSet(readText, 'TRIGGER_HYSTERESIS') ? `Changed: release margin ${Math.round(margin * 100)}%` : 'Default · first touch'
  const press: FineTuneGroup = {
    id: 'press', label: 'Press points', status: pressStatus, changed: isSet(readText, 'TRIGGER_THRESHOLD', 'TRIGGER_HYSTERESIS'),
    description: 'Where a pull counts, and where it lets go.',
    content: <>
      <SegmentedRow label="Fires at" setting="TRIGGER_THRESHOLD" value={hair ? 'hair' : 'point'} disabled={props.disabled ? 'Calibrating' : undefined}
        options={[{ value: 'point', label: 'A set point', caption: 'Fires once the pull passes the half-press point.' }, { value: 'hair', label: 'Hair trigger', caption: 'Hair trigger fires as you squeeze and lets go as you ease off.' }]}
        onChange={value => props.onThresholdChange(value === 'hair' ? '-1' : '0')} onReset={() => writeKey(setText, 'TRIGGER_THRESHOLD', null)} />
      <ValueRow hero label="Half-press point" setting="TRIGGER_THRESHOLD" value={hair ? 0 : Math.round(threshold * 1000) / 10} min={0} max={100} step={1} fineStep={0.1}
        format={value => `${value}%`} disabled={hair ? 'A hair trigger has no set point. Choose A set point above.' : undefined}
        caption="Default fires on the lightest touch. Raise it if resting your finger starts aiming."
        onChange={value => props.onThresholdChange(String(Number((value / 100).toFixed(4))))} onReset={() => writeKey(setText, 'TRIGGER_THRESHOLD', null)}
        onX={{ label: 'Try it', run: () => window.dispatchEvent(new Event('jsm:start-test')) }} />
      <ValueRow label="Release margin" hint={`Lets go ${Math.round(margin * 100)}% below the press point, so a shaky finger can’t flicker it`} setting="TRIGGER_HYSTERESIS"
        value={Math.round(margin * 1000) / 10} min={0} max={100} step={0.5} fineStep={0.1} format={value => `${value}%`}
        disabled={hair ? 'A hair trigger lets go as you ease off; it has no margin.' : undefined}
        onChange={value => writeKey(setText, 'TRIGGER_HYSTERESIS', Number((value / 100).toFixed(6)))} onReset={() => writeKey(setText, 'TRIGGER_HYSTERESIS', null)} />
      {hair && dualSense && adaptiveOn && <>
        <Note tone="warn">A hair trigger needs push-back off on a DualSense. While push-back is on, it fires at 0% instead.</Note>
        {props.onAdaptiveChange && <OpenRow label="Use hair trigger without push-back" hint="Turns resistance off for both triggers in this configuration" onOpen={() => props.onAdaptiveChange?.('OFF')} />}
      </>}
      <OpenRow label="Advanced" hint="Quick full press window, used by the skip cards" value={`${skip} ms`} onOpen={() => { setPart('window'); setAdvanced(true) }} />
    </>,
    visual: <div className={styles.visualStack}>
      <TriggerBlade title="Your trigger, live" pull={pull} threshold={threshold} margin={margin} halfName={halfInfo.label || halfInfo.binding} twoStep={hasFullPress(mode)} gamepad={gamepad} showMargin
        caption="Squeeze the trigger: the blade follows your finger and the half press turns on as it passes the pin." />
      {/* Push-back is a DualSense thing: the chart only shows where it can mean something. */}
      {dualSense && <PushBackGraph title="How a DualSense pushes back" chip="live"
        profile={effectProfile(parseTriggerEffect(getKeymapValue(readText, `${SIDE_KEY(side)}_TRIGGER_EFFECT`) ?? 'ON'), hair ? 0 : threshold)}
        marks={[{ at: Math.max(0.05, hair ? 0 : threshold), label: 'Push-back starts at half press' }]} pull={pull} />}
    </div>,
  }

  // ---- Resistance
  const effectKey = `${SIDE_KEY(effectSide)}_TRIGGER_EFFECT`
  const rawEffect = getKeymapValue(readText, effectKey)
  const effect = parseTriggerEffect(rawEffect ?? 'ON')
  const problem = effect && triggerEffectProblem(effect)
  const effectChanged = isSet(readText, 'ADAPTIVE_TRIGGER', 'LEFT_TRIGGER_EFFECT', 'RIGHT_TRIGGER_EFFECT')
  const sideEffect = (s: TriggerSide) => parseTriggerEffect(getKeymapValue(readText, `${SIDE_KEY(s)}_TRIGGER_EFFECT`) ?? 'ON')
  const changedSides = (['left', 'right'] as const).filter(s => isSet(readText, `${SIDE_KEY(s)}_TRIGGER_EFFECT`))
  const resistanceStatus = !adaptiveOn ? 'Changed: off for both triggers'
    : changedSides.length ? `Changed: ${changedSides.map(s => `${s} · ${TRIGGER_EFFECT_CARDS[sideEffect(s)?.mode ?? 'ON'].label}`).join(', ')}`
    : dualSense ? 'Automatic on both' : 'Needs a DualSense'
  const writeEffect = (next: { mode: TriggerEffectMode; values: number[] }) => {
    setText?.(previous => writeTriggerEffect(previous, SIDE_KEY(effectSide), next))
  }
  const feel = () => { if (effect) { felt.current.add(effectSide); feelEffect(effectSide, [effect.mode, ...effect.values].join(' ')) } }
  const feelAction = dualSense ? { label: 'Feel it', run: feel } : undefined
  const resistance: FineTuneGroup = {
    id: 'resistance', label: 'Resistance', status: resistanceStatus, changed: effectChanged,
    description: 'How the trigger pushes back against your finger.',
    content: <>
      <SegmentedRow label="Trigger" value={effectSide} options={[{ value: 'left', label: 'Left trigger' }, { value: 'right', label: 'Right trigger' }]} onChange={value => setEffectSide(value as TriggerSide)} />
      {props.onAdaptiveChange && <SummaryRow label="Push back on the triggers" hint="Both triggers. While on, a hair trigger fires at 0% instead." setting="ADAPTIVE_TRIGGER"
        toggle={{ on: adaptiveOn, onChange: on => props.onAdaptiveChange?.(on ? '' : 'OFF') }} />}
      <ModeCards columns={5} className={styles.effectCards} value={effect?.mode ?? ''} useLabel={card => `Use ${card.label}`} hints={feelAction ? 'X:Feel it' : undefined}
        options={EFFECT_ORDER.map(value => ({ value, label: TRIGGER_EFFECT_CARDS[value].label, caption: TRIGGER_EFFECT_CARDS[value].caption, art: <EffectArt mode={value} /> }))}
        onChange={value => writeEffect(defaultTriggerEffect(value as TriggerEffectMode))} />
      {!effect && rawEffect && <Note>This trigger has an effect from an older file: {rawEffect}. It is kept as it is until you pick a card.</Note>}
      {problem && <Note tone="warn">{problem}</Note>}
      {effect && TRIGGER_EFFECTS[effect.mode].fields.map((_, index) => {
        const field = effectFieldDisplay(effect, index)
        const update = (raw: number) => writeEffect({ mode: effect.mode, values: effect.values.map((old, i) => i === index ? Math.round(raw) : old) })
        return field.kind === 'percent'
          ? <ValueRow key={index} hero={index === 0} label={field.label} hint={field.help} setting={effectKey} value={Math.round(field.value / 2.55)} min={0} max={100} step={1} format={value => `${value}%`}
              onChange={value => update(value * 2.55)} onX={feelAction} onReset={() => writeEffect({ mode: effect.mode, values: effect.values.map((old, i) => i === index ? defaultTriggerEffect(effect.mode).values[i] : old) })} />
          : <ValueRow key={index} hero={index === 0} label={field.label} hint={field.help} setting={effectKey} value={field.value} min={field.min} max={field.max} step={1}
              format={value => field.kind === 'hz' ? `${value} Hz` : field.text.startsWith('Zone') ? `Zone ${value}` : String(value)}
              onChange={update} onX={feelAction} onReset={() => writeEffect({ mode: effect.mode, values: effect.values.map((old, i) => i === index ? defaultTriggerEffect(effect.mode).values[i] : old) })} />
      })}
      <Note>{dualSense ? 'Each trigger has its own effect. X plays it on the trigger now; leaving Fine-tune puts the controller back.' : 'Resistance needs a DualSense. You can still set it here; it is kept in the configuration for when one is connected.'} Effects from older files are kept as they are.</Note>
    </>,
    visual: <PushBackGraph title={`${effectSide === 'left' ? 'Left' : 'Right'} trigger, ${effect ? TRIGGER_EFFECT_CARDS[effect.mode].label : 'older effect'}`} chip={liveDevice?.status ? `live ${Math.round((liveDevice.status.triggers[effectSide] ?? 0) * 100)}%` : undefined}
      profile={effectProfile(effect, hair ? 0 : threshold)} pull={liveDevice?.status ? liveDevice.status.triggers[effectSide] : null}
      caption="Where the trigger pushes back along the pull, and how hard." />,
  }

  // ---- Calibration
  const calibrationChanged = isSet(readText, 'LEFT_TRIGGER_OFFSET', 'LEFT_TRIGGER_RANGE', 'RIGHT_TRIGGER_OFFSET', 'RIGHT_TRIGGER_RANGE')
  const calibrateReason = !liveDevice ? 'Connect a DualSense to calibrate its triggers.' : !dualSense ? 'Only a DualSense’s triggers push back, so there is nothing to calibrate on this controller.' : undefined
  const calibrationRows = (s: 'LEFT' | 'RIGHT') => (['OFFSET', 'RANGE'] as const).map(field => (
    <ValueRow key={s + field} label={`${s === 'LEFT' ? 'Left' : 'Right'} · ${field === 'OFFSET' ? 'starts at' : 'travel'}`} setting={`${s}_TRIGGER_${field}`}
      value={readTriggerCalibration(readText, s, field)} min={0} max={255} step={1} format={value => `${Math.round(value / 2.55)}%`}
      onChange={value => writeKey(setText, `${s}_TRIGGER_${field}`, value)} onReset={() => writeKey(setText, `${s}_TRIGGER_${field}`, null)} />
  ))
  const calibration: FineTuneGroup = {
    id: 'calibration', label: 'Calibration', status: calibrationChanged ? 'Changed: start and travel' : dualSense ? 'Default start and travel' : 'Needs a DualSense', changed: calibrationChanged,
    description: 'Where a DualSense’s automatic resistance starts, and how far it travels.',
    content: <>
      <OpenRow label="Calibrate triggers" hint="Measures both values for you" value="Start" disabled={calibrateReason} onOpen={props.onCalibrate} />
      {/* The typed values only mean something on a DualSense; on another pad they stay under Advanced (D5) and the group says why. */}
      {dualSense || calibrationChanged ? <>
        {/* Calibration can't change while a button is held, so these are never shifted. */}
        <SettingPrefix prefix="">{calibrationRows(SIDE_KEY(side))}</SettingPrefix>
        <OpenRow label="Advanced" hint="Both triggers’ start and travel, typed" onOpen={() => { setPart('calibration'); setAdvanced(true) }} />
        <Note>Calibrate keeps its result for this controller until the mapper restarts. Type the numbers here to keep them in the configuration.</Note>
      </> : <>
        <Note>DualSense only. The start and travel values are kept for when one is connected; type them under Advanced.</Note>
        <OpenRow label="Advanced" hint="Both triggers’ start and travel, typed" onOpen={() => { setPart('calibration'); setAdvanced(true) }} />
      </>}
    </>,
    visual: <CalibrationStrip side={side} offset={readTriggerCalibration(readText, SIDE_KEY(side), 'OFFSET')} range={readTriggerCalibration(readText, SIDE_KEY(side), 'RANGE')} />,
  }

  const groups = [press, resistance, calibration]
  const gamepadMode = isGamepadTriggerMode(mode)
  return (
    <>
      <SubPage open onClose={onClose} trail={['Triggers', name]} title="Fine-tune" stepLabel="Group" backLabel="Back to Triggers"
        onStep={direction => onGroup(stepGroup(groups, group, direction))}
        where={`Triggers · ${name} · Fine-tune · ${groups.find(item => item.id === group)?.label ?? ''}`}>
        <FineTune groups={groups} active={group} onActive={onGroup}
          railNote={group === 'resistance' ? (dualSense ? 'DualSense connected. Each trigger has its own effect.' : 'Resistance needs a DualSense; it is kept for when one is connected.') : 'Press points are shared by both triggers. A gamepad trigger ignores them.'} />
      </SubPage>
      <SubPage open={advanced} onClose={() => setAdvanced(false)} trail={['Triggers', name, 'Fine-tune']} title="Advanced" stepLabel="Part" backLabel="Back to Fine-tune"
        onStep={direction => setPart(stepGroup([{ id: 'window' }, { id: 'calibration' }, { id: 'sends' }], part, direction))}>
        <AdvancedParts active={part} onActive={setPart} parts={[
          { id: 'window', eyebrow: 'Press points', title: 'Quick full press window', description: 'How long the skip cards wait to tell a quick full press from a half press.',
            content: <>
              <ValueRow hero label="Window" setting="TRIGGER_SKIP_DELAY" value={skip} min={0} max={2000} step={10} fineStep={1} format={value => `${value} ms`}
                caption="Reach full press inside this time and the half press is skipped."
                onChange={value => writeKey(setText, 'TRIGGER_SKIP_DELAY', value)} onReset={() => writeKey(setText, 'TRIGGER_SKIP_DELAY', null)} />
              <SkipWindowArt ms={skip} />
              <Note>Shared by both triggers. Used by the Quick full press and Responsive cards{/SKIP/.test(mode) ? '' : '; this trigger’s card doesn’t use it yet'}.</Note>
            </> },
          { id: 'calibration', eyebrow: 'Calibration', title: 'Resistance start and travel', description: 'Set by Calibrate, or typed here. DualSense automatic resistance only.',
            content: <SettingPrefix prefix="">
              {calibrationRows('LEFT')}{calibrationRows('RIGHT')}
              <OpenRow label="Calibrate triggers" hint="Measures both values for you" value="Start" disabled={calibrateReason} onOpen={() => { setAdvanced(false); props.onCalibrate() }} />
            </SettingPrefix> },
          { id: 'sends', eyebrow: 'When Gamepad trigger is chosen', title: 'Sends as', description: 'Which trigger the game sees. The usual choice matches the side.',
            content: <>
              <SegmentedRow label="Sends as" setting={side === 'left' ? 'ZL_MODE' : 'ZR_MODE'} value={gamepadMode ? gamepadTarget(mode) : side}
                disabled={gamepadMode ? undefined : 'Choose the Gamepad trigger card first: this is only used while it is chosen.'}
                options={[{ value: 'left', label: 'Left pad trigger' }, { value: 'right', label: 'Right pad trigger' }]}
                onChange={value => props.onModeChange(side, gamepadModeValue(value as TriggerSide, props.virtualControllerType))} />
              <Note tone={props.virtualControllerType === 'NONE' ? 'warn' : undefined}>Needs Xbox or PlayStation output, set under Controller output.</Note>
              <Note>Half and full press bindings and press points aren’t used while this card is chosen.</Note>
            </> },
        ]} />
      </SubPage>
    </>
  )
}

/** A flat picture per effect: the push-back profile along the pull. */
function EffectArt({ mode }: { mode: TriggerEffectMode }) {
  const profile = effectProfile(defaultTriggerEffect(mode), 0.3)
  const d = Array.from({ length: 41 }, (_, index) => { const p = index / 40; return `${index ? 'L' : 'M'}${8 + p * 104},${52 - Math.max(0, Math.min(1, profile(p))) * 40}` }).join(' ')
  return (
    <svg viewBox="0 0 120 60" aria-hidden="true">
      <path d="M8 52 H112" stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
      <path d={`${d} L112,52 L8,52 Z`} fill="color-mix(in srgb, var(--accent) 14%, transparent)" />
      <path d={d} stroke="var(--accent)" strokeWidth="2" fill="none" />
    </svg>
  )
}

function SkipWindowArt({ ms }: { ms: number }) {
  const at = 20 + Math.min(1, ms / 400) * 220
  return (
    <svg viewBox="0 0 280 90" role="img" aria-label={`Skip window ${ms} ms`} className={styles.inlineArt}>
      <rect x="20" y="20" width={at - 20} height="22" rx="4" fill="color-mix(in srgb, var(--accent) 18%, transparent)" stroke="var(--accent)" />
      <text x={(20 + at) / 2} y="35" fill="#e3eaf1" fontSize="11" textAnchor="middle">{ms} ms</text>
      <path d="M20 54 H260" stroke="rgba(255,255,255,.12)" />
      <text x="20" y="70" fill="#b0bcc8" fontSize="10">Quick: full press only</text>
      <text x="260" y="70" fill="#b0bcc8" fontSize="10" textAnchor="end">Slow: half, then full</text>
      <text x="140" y="86" fill="#808c99" fontSize="10" textAnchor="middle">Time from first touch →</text>
    </svg>
  )
}

function CalibrationStrip({ side, offset, range }: { side: TriggerSide; offset: number; range: number }) {
  const x = (value: number) => 20 + (Math.max(0, Math.min(255, value)) / 255) * 320
  return (
    <div className={styles.calibrationVisual}>
      <b>{side === 'left' ? 'Left' : 'Right'} trigger</b>
      <svg viewBox="0 0 360 90" role="img" aria-label={`Starts at ${offset}, travel ${range} of 255`}>
        <rect x="20" y="30" width="320" height="16" rx="8" fill="#0e1419" stroke="rgba(255,255,255,.08)" />
        <rect x={x(offset)} y="30" width={Math.max(2, x(offset + range) - x(offset))} height="16" rx="8" fill="color-mix(in srgb, var(--accent) 60%, transparent)" />
        <text x={x(offset)} y="22" fill="#e3eaf1" fontSize="11" textAnchor="middle">starts {offset}</text>
        <text x={x(offset + range)} y="64" fill="#e3eaf1" fontSize="11" textAnchor="middle">travel {range}</text>
        <text x="340" y="82" fill="#808c99" fontSize="10" textAnchor="end">255</text>
      </svg>
      <p>Resistance is placed along this stretch.</p>
    </div>
  )
}
