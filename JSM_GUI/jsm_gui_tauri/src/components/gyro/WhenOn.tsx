import { useContext, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { SettingOrigins } from '../SettingOrigin'
import { layerEntries } from '../../utils/layers'
import { SubPage, SegmentedRow, OpenRow } from '../ui/console'
import { InputGlyph } from '../glyphs/InputGlyph'
import { AddModeshiftSheet } from '../keymap/AddModeshiftSheet'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import {
  gyroConditions, parseGyroActivation, parseTiltActivation, writeGyroActivation, writeTiltActivation,
  type GyroActivationMode, type GyroCondition,
} from '../../utils/gyroActivation'
import { isGyroModeshiftKey, TILT_MODESHIFT_KEYS, SHARED_MOTION_OUTPUT_KEYS } from '../../utils/gyroSettingsScope'
import { useGyro, Note, VisualTitle } from './GyroContext'
import { ControllerArt } from './visuals'
import { useHoldInputs, inputName, defaultHoldInput, pressedNow, isActiveNow } from './inputs'
import rowStyles from '../ui/console/Rows.module.css'
import styles from './Gyro.module.css'

// When is gyro on? (GyroWhenOn): the activation, every input it combines
// ("While I hold… · 2 of up to 16 inputs", Any one / All of them, each held or
// not), the live check of whether gyro is on right now, and the way into the
// held variants (Mode shift). Tilt uses the same
// editor for its own activation (Tilt ▸ When tilt is on).

type Source = 'gyro' | 'tilt'
const MAX_INPUTS = 16

/** Where each input sits on the app's art: front pads (1117×750), back grips and paddles (428×319). */
const FRONT_SPOTS: Record<string, [number, number]> = { TOUCH: [751, 410], MISC3: [365, 410], MISC2: [751, 410] }
const BACK_SPOTS: Record<string, [number, number]> = {
  MISC6: [30, 228], GRIP_L: [30, 228], MISC5: [398, 228], GRIP_R: [398, 228], LSL: [103, 175], LSR: [84, 235], RSR: [325, 175], RSL: [344, 235],
  L: [80, 30], ZL: [70, 52], R: [348, 30], ZR: [358, 52],
}

export function useActivation(source: Source) {
  const gyro = useGyro()
  const parse = source === 'tilt' ? parseTiltActivation : parseGyroActivation
  const save = source === 'tilt' ? writeTiltActivation : writeGyroActivation
  const current = parse(gyro.text)
  const combined = gyroConditions(current.button)
  const list: GyroCondition[] = combined ? combined.conditions : current.button ? [{ input: current.button, released: false }] : []
  const match = combined?.match ?? 'ANY'
  const write = (mode: GyroActivationMode, nextMatch: 'ANY' | 'ALL', conditions: GyroCondition[]) => {
    const button = conditions.length === 1 && !conditions[0].released ? conditions[0].input
      : [nextMatch, ...conditions.map(condition => (condition.released ? '!' : '') + condition.input)].join(' ')
    gyro.setText(previous => save(previous, mode, button || defaultHoldInput(gyro.devices?.[0])))
  }
  return { current, combined, list, match, write }
}

/** The activation editor (shared by gyro and tilt). */
export function ActivationEditor({ source, onWhileHolding }: { source: Source; onWhileHolding?: () => void }) {
  const gyro = useGyro()
  const { current, list, match, write } = useActivation(source)
  const holdInputs = useHoldInputs(gyro.family, gyro.callbacks.gridCommands)
  const [picking, setPicking] = useState<{ index: number } | null>(null)
  const held = current.mode === 'hold_on' || current.mode === 'hold_off'
  // Activation is GYRO_ON or GYRO_OFF (TILT_…): where it comes from is either's.
  const keys = source === 'tilt' ? ['TILT_ON', 'TILT_OFF'] : ['GYRO_ON', 'GYRO_OFF']
  const origins = useContext(SettingOrigins)
  const ownHas = !gyro.held && keys.some(key => Object.prototype.hasOwnProperty.call(layerEntries(origins.own), key))
  const baseSource = keys.map(key => origins.baseOrigins?.[key]).find(Boolean)
  const baseName = baseSource && baseSource !== '<editor>' ? baseSource.split('/').pop()?.replace(/.txt$/i, '') : undefined
  const importedSource = keys.map(key => origins.origins[key]).find(source => source && source !== '<editor>')
  const importedName = importedSource?.split('/').pop()?.replace(/.txt$/i, '')
  const originTag = gyro.held || origins.layer ? undefined
    : ownHas && (baseName || keys.some(key => Object.prototype.hasOwnProperty.call(layerEntries(origins.base), key))) ? { text: baseName ? `Changed from ${baseName}` : 'Changed', tone: 'changed' as const }
    : !ownHas && importedName ? { text: `From ${importedName}`, tone: 'inherited' as const }
    : null
  const resetActivation = ownHas ? () => keys.forEach(key => gyro.reset(key)) : undefined
  const conditions = list.length ? list : [{ input: defaultHoldInput(gyro.devices?.[0]), released: false }]
  const pressed = pressedNow(gyro.sample?.devices?.[0])
  const noun = source === 'tilt' ? 'Tilt' : 'Gyro'
  const setMode = (mode: GyroActivationMode) => write(mode, match, conditions)
  return <>
    <SegmentedRow label={`${noun} is on`} value={current.mode} disabled={gyro.locked} setting={current.mode === 'hold_off' ? keys[1] : keys[0]} originTag={originTag} onReset={resetActivation}
      data={{ 'data-activation': source, 'data-autofocus': source === 'gyro' ? '' : undefined }}
      options={[
        { value: 'always_on', label: 'Always', caption: source === 'tilt' ? 'Tilt works whenever the controller is tilted' : 'Simplest. Lift the controller to stop.' },
        { value: 'hold_on', label: 'While I hold', caption: 'On only while the inputs below match' },
        { value: 'hold_off', label: 'Unless I hold', caption: 'Off while the inputs below match, like lifting a mouse' },
        { value: 'always_off', label: 'Off', caption: source === 'tilt' ? 'Tilt settings and bindings are kept for later' : 'Bindings that switch gyro on still work' },
      ]}
      onChange={value => setMode(value as GyroActivationMode)} />
    <div className={styles.conditionCard} aria-disabled={held ? undefined : 'true'} data-conditions={source}>
      <header><b>{current.mode === 'hold_off' ? 'Unless I hold…' : 'While I hold…'}</b><span>{conditions.length} input{conditions.length === 1 ? '' : 's'}</span></header>
      {!held && <Note>Choose While I hold or Unless I hold to use these inputs.</Note>}
      <SegmentedRow label="Count it when" value={match} disabled={!held ? 'Choose While I hold or Unless I hold first.' : conditions.length < 2 ? 'Add a second input first.' : gyro.locked}
        options={[{ value: 'ANY', label: 'Any one', caption: 'One matching input is enough' }, { value: 'ALL', label: 'All of them', caption: 'Every input has to match' }]}
        onChange={value => write(current.mode, value as 'ANY' | 'ALL', conditions)} />
      {conditions.map((condition, index) => (
        <ConditionRow key={index} index={index} condition={condition} disabled={!held ? 'Choose While I hold or Unless I hold first.' : gyro.locked}
          active={condition.released ? !pressed.has(condition.input) : pressed.has(condition.input)}
          canRemove={conditions.length > 1}
          onToggle={() => write(current.mode, match, conditions.map((old, i) => (i === index ? { ...old, released: !old.released } : old)))}
          onPick={() => setPicking({ index })}
          onRemove={() => write(current.mode, match, conditions.filter((_, i) => i !== index))} />
      ))}
      <OpenRow label="Add an input" hint={`A pad, a grip, any button · up to ${MAX_INPUTS}`} disabled={!held ? 'Choose While I hold or Unless I hold first.' : conditions.length >= MAX_INPUTS ? `Up to ${MAX_INPUTS} inputs.` : gyro.locked}
        onOpen={() => setPicking({ index: conditions.length })} hints="A:Pick input" data={{ 'data-add-condition': '' }} />
    </div>
    {onWhileHolding && <OpenRow label="Mode shift" hint={source === 'tilt' ? 'Hold a button to change what tilt does' : 'Hold a button: slower while aiming, off in menus, a stick when driving'}
      value={<WhileHoldingCount source={source} />} onOpen={onWhileHolding} data={{ 'data-while-holding': source }} />}
    {picking && <AddModeshiftSheet inputName={noun.toLowerCase()} command={source === 'tilt' ? 'TILT' : 'GYRO'} family={gyro.family} modifiers={holdInputs}
      taken={conditions.filter((_, i) => i !== picking.index).map(condition => condition.input)}
      initial={conditions[picking.index]?.input ?? null}
      eyebrow={`${noun} · ${picking.index < conditions.length ? `Input ${picking.index + 1}` : 'Add an input'}`}
      onClose={() => setPicking(null)}
      onNext={input => {
        const next = picking.index < conditions.length ? conditions.map((old, i) => (i === picking.index ? { ...old, input } : old)) : [...conditions, { input, released: false }]
        write(held ? current.mode : 'hold_on', match, next)
        setPicking(null)
      }} />}
  </>
}

function WhileHoldingCount({ source }: { source: Source }) {
  const gyro = useGyro()
  const count = heldTriggers(gyro.rootText, source).length
  return <>{count ? `${count} set` : 'None yet · Add'}</>
}

/** A held setting line: "TRIGGER,KEY = value". */
export const HELD_LINE = /^\s*([^#,=\s]+)\s*,\s*([^=\s]+)\s*=/

/** Held inputs that change gyro (or tilt): the X of every "X,KEY =" line in scope. */
export function heldTriggers(text: string, source: Source): string[] {
  const inScope = (key: string) => source === 'tilt' ? TILT_MODESHIFT_KEYS.test(key) || SHARED_MOTION_OUTPUT_KEYS.test(key) : isGyroModeshiftKey(key)
  const found = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(HELD_LINE)
    if (match && inScope(match[2].toUpperCase())) found.add(match[1].toUpperCase())
  }
  return [...found]
}

function ConditionRow({ index, condition, active, disabled, canRemove, onToggle, onPick, onRemove }: {
  index: number; condition: GyroCondition; active: boolean; disabled?: string; canRemove: boolean
  onToggle: () => void; onPick: () => void; onRemove: () => void
}) {
  const gyro = useGyro()
  const ref = useRef<HTMLButtonElement>(null)
  const latest = useRef({ onRemove, canRemove, disabled })
  latest.current = { onRemove, canRemove, disabled }
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const onPad = (event: Event) => {
      if ((event as CustomEvent<PadEventDetail>).detail.button !== 'X') return
      event.preventDefault()
      if (latest.current.canRemove && !latest.current.disabled) latest.current.onRemove()
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [])
  const touchy = /TOUCH|^T\d/.test(condition.input)
  const state = condition.released ? (touchy ? 'Not touched' : 'Let go') : touchy ? 'Touched' : 'Held'
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); if (!disabled) onToggle() }
    else if ((event.key === 'x' || event.key === 'X') && canRemove && !disabled) { event.preventDefault(); onRemove() }
  }
  return (
    <button ref={ref} type="button" className={`${rowStyles.row} ${styles.conditionRow}`} data-arrows="horizontal" data-condition={index}
      aria-disabled={disabled ? 'true' : undefined} data-reason={disabled}
      aria-label={`Input ${index + 1}: ${inputName(condition.input, gyro.family)}, counts while ${state.toLowerCase()}`}
      data-hints={`MOVE:Change;A:Pick input;${canRemove ? 'X:Remove' : ''}`}
      data-caption={`${inputName(condition.input, gyro.family)} · counts while ${state.toLowerCase()}`}
      onClick={() => { if (!disabled) onPick() }} onKeyDown={onKeyDown}>
      <span className={rowStyles.main}>
        <span className={styles.conditionIndex}>{index + 1}</span>
        <InputGlyph command={condition.input} family={gyro.family} size={28} />
        <span className={rowStyles.labelBlock}><span className={rowStyles.label}>{inputName(condition.input, gyro.family)}</span>
          <span className={rowStyles.hint} data-live={active ? 'true' : undefined}>{active ? 'Matches now' : 'Doesn’t match now'}</span></span>
        <span className={rowStyles.valueBlock}><span aria-hidden="true">◂</span><b className={rowStyles.value}>{state}</b><span aria-hidden="true">▸</span></span>
      </span>
    </button>
  )
}

/** The live left side: the inputs on the controller, and whether gyro is on right now. */
export function WhenOnVisual({ source, onRecalibrate, onMatchTurn }: { source: Source; onRecalibrate?: () => void; onMatchTurn?: () => void }) {
  const gyro = useGyro()
  const { current, list, match } = useActivation(source)
  const pressed = pressedNow(gyro.sample?.devices?.[0])
  const on = isActiveNow(current, pressed)
  const held = current.mode === 'hold_on' || current.mode === 'hold_off'
  const noun = source === 'tilt' ? 'tilt' : 'gyro'
  const verdict = !held ? (current.mode === 'always_on' ? `Always on, so ${noun} is` : `Off, so ${noun} is`)
    : `${list.length > 1 ? (match === 'ALL' ? 'All of them, ' : 'Any one is enough, ') : ''}${current.mode === 'hold_off' ? 'unless held' : 'while held'}, so ${noun} is`
  const front = held ? list.filter(condition => FRONT_SPOTS[condition.input]) : []
  const back = held ? list.filter(condition => BACK_SPOTS[condition.input]) : []
  const marker = (index: number, [x, y]: [number, number], scale: number, live: boolean) =>
    <g key={index} className={styles.marker} data-live={live ? 'true' : undefined}><circle cx={x} cy={y} r={18 * scale} /><text x={x} y={y + 6 * scale} textAnchor="middle" fontSize={18 * scale}>{index + 1}</text></g>
  return <div className={styles.whenVisual}>
    <VisualTitle title="The inputs involved" live />
    <div className={styles.whenArt}>
      <ControllerArt label="Controller front, with the inputs that turn gyro on">
        {front.map(condition => marker(list.indexOf(condition), FRONT_SPOTS[condition.input], 2.4, pressed.has(condition.input)))}
      </ControllerArt>
      <div className={styles.backInset}>
        <ControllerArt back label="Controller back">
          {back.map(condition => marker(list.indexOf(condition), BACK_SPOTS[condition.input], 1, pressed.has(condition.input)))}
        </ControllerArt>
        <span>Back</span>
      </div>
    </div>
    <ul className={styles.inputList}>
      {held && list.map((condition, index) => {
        const isPressed = pressed.has(condition.input)
        return <li key={index}><span className={styles.conditionIndex}>{index + 1}</span><span>{inputName(condition.input, gyro.family)}</span>
          <em data-live={isPressed ? 'true' : undefined}>{isPressed ? 'Held now' : /TOUCH/.test(condition.input) ? 'Not touched' : 'Not held'}</em></li>
      })}
      <li className={styles.verdict}><span>{verdict}</span><b data-on={on ? 'true' : undefined} data-gyro-verdict={on ? 'on' : 'off'}>{on ? 'On' : 'Off'}</b></li>
    </ul>
    {/* Recalibrate and Match a full turn live on the front and in More; no second set of tiles here (UX review). */}
    {void onRecalibrate}{void onMatchTurn}
  </div>
}

export function WhenOn({ open, onClose, trail, onWhileHolding, onRecalibrate, onMatchTurn }: {
  open: boolean; onClose: () => void; trail: string[]; onWhileHolding: () => void; onRecalibrate: () => void; onMatchTurn: () => void
}) {
  const gyro = useGyro()
  const output = (gyro.get('GYRO_OUTPUT') ?? 'MOUSE').toUpperCase()
  return (
    <SubPage open={open} onClose={onClose} trail={trail} title="When is gyro on?" backLabel="Back to Gyro">
      <div className={styles.whenOn} data-when-on="">
        <section className={styles.visualCard}><WhenOnVisual source="gyro" onRecalibrate={onRecalibrate} onMatchTurn={onMatchTurn} /></section>
        <section className={styles.splitRows}>
          <header className={styles.pageHeading}><h1>When is gyro on?</h1><p>Combine inputs, or change gyro while you hold a button.</p></header>
          {output === 'PS_MOTION' && <Note>Motion to game always sends the motion; this turns Rumble while aiming on and off.</Note>}
          <ActivationEditor source="gyro" onWhileHolding={onWhileHolding} />
        </section>
      </div>
    </SubPage>
  )
}
