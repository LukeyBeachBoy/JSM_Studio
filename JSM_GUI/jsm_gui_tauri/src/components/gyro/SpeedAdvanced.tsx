import { useEffect, useRef, useState } from 'react'
import { SubPage, ModeCards, OpenRow, ValueRow, SegmentedRow } from '../ui/console'
import { CurvePlot, TRAIL_MS, type CurveHandle, type CurveMarker } from '../CurvePlot'
import { niceCeil, niceStep, snapTo } from '../../utils/niceNumbers'
import {
  ACCEL_CURVE_TYPES, GYRO_ACCEL_DEFAULTS, TOUCHPAD_ACCEL_DEFAULTS, accelCurveSettleSpeed, accelSensitivityAt,
  inheritsCurveShape, normalizeAccelCurveLink, normalizeAccelCurveType, type AccelCurveParams, type AccelCurveType,
} from '../../utils/accelCurve'
import { CURVE_WORDS, gyroCurveParams, joinVerticalSpeeds, readGyroSpeed, round4, setCurveType, writePair } from '../../utils/gyroSpeed'
import { readVirtualSetting } from '../../utils/virtualStickSettings'
import { useGyro, KeyNumberRow, SwitchRow, Note, PadActions } from './GyroContext'
import { CurveArt } from './art'
import { liveOmega, StatTiles } from './visuals'
import { usePointerSpeed, pointerSpeedText } from './usePointerSpeed'
import { useOutputReasons } from './groups'
import { MatchTurnVisual } from './MatchFullTurn'
import { useTurned } from './visuals'
import styles from './Gyro.module.css'

// Speed ▸ Advanced (GyroSpeedAdvanced, GyroSpeedShape, GyroSpeedGame): the
// curve on the left at the size of the space, the parts on the right, stepped
// with LT / RT. This is the gyro half of the old curve editor (AccelCurveView),
// which kept the trackpad half: LB / RB no longer switch inputs (V1 gives the
// bumpers to tabs).

export type SpeedPart = 'speeds' | 'shape' | 'game'
const PARTS: SpeedPart[] = ['speeds', 'shape', 'game']
const CURVE_LABEL: Record<AccelCurveType | 'OFF', string> = { OFF: 'Off', LINEAR: 'Linear', NATURAL: 'Natural', POWER: 'Power', QUADRATIC: 'Quadratic', SIGMOID: 'Sigmoid', JUMP: 'Jump' }
const fmtX = (value: number) => `${Number(value.toFixed(2))}×`
const fmtSpeed = (value: number) => `${Number(value.toFixed(1))} °/s`

type Props = { open: boolean; onClose: () => void; trail: string[]; part: SpeedPart; onPart: (part: SpeedPart) => void; onMatchTurn: () => void }

export function SpeedAdvanced({ open, onClose, trail, part, onPart, onMatchTurn }: Props) {
  const gyro = useGyro()
  const reasons = useOutputReasons()
  const [range, setRange] = useState<'fit' | 'wide'>('fit')
  const [separate, setSeparate] = useState(false)
  const speed = readGyroSpeed(gyro.text)
  const isStatic = speed.mode === 'static'
  const curve: AccelCurveType | 'OFF' = isStatic ? 'OFF' : speed.curve
  const link = normalizeAccelCurveLink(readVirtualSetting(gyro.rootText, 'ACCEL_CURVE_LINK'))
  const borrowed = inheritsCurveShape('gyro', link)
  const own = gyroCurveParams(gyro.text)
  const ownY = gyroCurveParams(gyro.text, '', 'y')
  const touchpadShape = (): AccelCurveParams => {
    const n = (key: string, fallback: number) => { const v = Number(readVirtualSetting(gyro.rootText, key)); return Number.isFinite(v) && readVirtualSetting(gyro.rootText, key) !== undefined ? v : fallback }
    return {
      curveType: normalizeAccelCurveType(readVirtualSetting(gyro.rootText, 'TOUCHPAD_ACCEL_CURVE')), minSens: own.minSens, maxSens: own.maxSens,
      minThreshold: n('TOUCHPAD_ACCEL_MIN_SPEED', TOUCHPAD_ACCEL_DEFAULTS.minThreshold), maxThreshold: n('TOUCHPAD_ACCEL_MAX_SPEED', TOUCHPAD_ACCEL_DEFAULTS.maxThreshold),
      naturalVHalf: n('TOUCHPAD_ACCEL_NATURAL_VHALF', TOUCHPAD_ACCEL_DEFAULTS.naturalVHalf), powerVRef: n('TOUCHPAD_ACCEL_POWER_VREF', TOUCHPAD_ACCEL_DEFAULTS.powerVRef),
      powerExponent: n('TOUCHPAD_ACCEL_POWER_EXPONENT', TOUCHPAD_ACCEL_DEFAULTS.powerExponent), sigmoidMid: n('TOUCHPAD_ACCEL_SIGMOID_MID', TOUCHPAD_ACCEL_DEFAULTS.sigmoidMid),
      sigmoidWidth: n('TOUCHPAD_ACCEL_SIGMOID_WIDTH', TOUCHPAD_ACCEL_DEFAULTS.sigmoidWidth), jumpTau: n('TOUCHPAD_ACCEL_JUMP_TAU', TOUCHPAD_ACCEL_DEFAULTS.jumpTau),
      ownRange: { min: speed.minThreshold, max: speed.maxThreshold },
    }
  }
  const params: AccelCurveParams = !isStatic && borrowed ? touchpadShape() : own
  const secondary = speed.separateY ? { minSens: ownY.minSens, maxSens: ownY.maxSens } : null
  const separateOn = separate || speed.separateY
  const live = liveOmega(gyro.sample)

  // Recent speeds for the plot's ticks.
  const trailRef = useRef<{ at: number; speed: number }[]>([])
  useEffect(() => {
    if (!open || live === null) return
    const now = performance.now()
    const last = trailRef.current[trailRef.current.length - 1]
    if (!last || now - last.at >= 30) trailRef.current.push({ at: now, speed: live })
    while (trailRef.current.length && now - trailRef.current[0].at > TRAIL_MS) trailRef.current.shift()
  })

  // ---- Writes.
  const write = (fn: (previous: string) => string) => gyro.setText(fn)
  const setSens = (which: 'MIN_GYRO_SENS' | 'MAX_GYRO_SENS', axis: 0 | 1, value: number) => write(previous => {
    const state = readGyroSpeed(gyro.text)
    const pair: [number, number] = which === 'MIN_GYRO_SENS' ? [...state.min] : [...state.max]
    pair[axis] = value
    if (axis === 0 && !separateOn) pair[1] = value
    return writePair(previous, which, pair)
  })
  const setStatic = (axis: 0 | 1, value: number) => write(previous => {
    const pair: [number, number] = [speed.base, speed.baseY]
    pair[axis] = value
    if (axis === 0 && !separateOn) pair[1] = value
    return writePair(previous, 'GYRO_SENS', pair)
  })
  // A dragged point moves left/right and, in proportion, up/down: one write of the pair.
  const dragSens = (which: 'MIN_GYRO_SENS' | 'MAX_GYRO_SENS', value: number) => write(previous => {
    const state = readGyroSpeed(gyro.text)
    const [x, y] = which === 'MIN_GYRO_SENS' ? state.min : state.max
    return writePair(previous, which, [value, x > 0 ? round4((y * value) / x) : value])
  })
  const setThreshold = (key: 'MIN_GYRO_THRESHOLD' | 'MAX_GYRO_THRESHOLD', value: number) => gyro.set(key, round4(Math.max(0, value)))

  // ---- The graph's handles (dragged with the pointer, or the right stick on a focused row).
  const xMaxRaw = Math.max(20, accelCurveSettleSpeed(params) * 1.25, speed.minThreshold * 1.5, (params.curveType === 'LINEAR' || borrowed ? speed.maxThreshold : 0) * 1.2)
  const xMax = niceCeil(range === 'wide' ? Math.max(xMaxRaw, 500) : xMaxRaw)
  const speedSnap = Math.max(0.1, niceStep(xMax, 200))
  const outSnap = niceStep(Math.max(params.maxSens, params.minSens, 0.5), 100)
  const handles: CurveHandle[] = []
  const markers: CurveMarker[] = []
  if (!isStatic) {
    const linearish = params.curveType === 'LINEAR'
    const fromMin = !borrowed && (params.curveType === 'QUADRATIC' || params.curveType === 'JUMP')
    handles.push({ id: 'min', label: 'Slow', speed: speed.minThreshold, sens: speed.min[0], axis: 'xy',
      onDrag: (s, v) => { setThreshold('MIN_GYRO_THRESHOLD', snapTo(linearish ? Math.min(s, speed.maxThreshold) : s, speedSnap)); dragSens('MIN_GYRO_SENS', Math.max(0, snapTo(v, outSnap))) } })
    if (linearish) handles.push({ id: 'max', label: 'Fast', speed: speed.maxThreshold, sens: speed.max[0], axis: 'xy',
      onDrag: (s, v) => { setThreshold('MAX_GYRO_THRESHOLD', snapTo(Math.max(s, speed.minThreshold), speedSnap)); dragSens('MAX_GYRO_SENS', Math.max(0, snapTo(v, outSnap))) } })
    else if (fromMin) handles.push({ id: 'max', label: 'Fast', speed: speed.minThreshold + speed.maxThreshold, sens: speed.max[0], axis: 'xy',
      onDrag: (s, v) => { setThreshold('MAX_GYRO_THRESHOLD', snapTo(s - speed.minThreshold, speedSnap)); dragSens('MAX_GYRO_SENS', Math.max(0, snapTo(v, outSnap))) } })
    else handles.push({ id: 'max', label: 'Maximum', speed: xMax * 0.94, sens: speed.max[0], axis: 'y', onDrag: (_s, v) => dragSens('MAX_GYRO_SENS', Math.max(0, snapTo(v, outSnap))) })
    if (!borrowed && params.curveType === 'SIGMOID') handles.push({ id: 'shape', label: 'Midpoint', speed: speed.minThreshold + params.sigmoidMid, sens: accelSensitivityAt(speed.minThreshold + params.sigmoidMid, params), axis: 'x',
      onDrag: s => gyro.set('ACCEL_SIGMOID_MID', round4(Math.max(0, snapTo(s - speed.minThreshold, speedSnap)))) })
    if (!borrowed && params.curveType === 'NATURAL') handles.push({ id: 'shape', label: 'Half-way', speed: speed.minThreshold + params.naturalVHalf, sens: accelSensitivityAt(speed.minThreshold + params.naturalVHalf, params), axis: 'x',
      onDrag: s => gyro.set('ACCEL_NATURAL_VHALF', round4(Math.max(speedSnap, snapTo(s - speed.minThreshold, speedSnap)))) })
    if (speed.minThreshold > 0) markers.push({ speed: speed.minThreshold, label: `Slow · ${fmtSpeed(speed.minThreshold)}` })
    if (linearish || borrowed) markers.push({ speed: speed.maxThreshold, label: `Fast · ${fmtSpeed(speed.maxThreshold)}` })
    else if (params.curveType === 'SIGMOID') markers.push({ speed: speed.minThreshold + params.sigmoidMid, label: `Midpoint · ${fmtSpeed(speed.minThreshold + params.sigmoidMid)}` })
    else if (params.curveType === 'NATURAL') markers.push({ speed: speed.minThreshold + params.naturalVHalf, label: `Half-way · ${fmtSpeed(speed.minThreshold + params.naturalVHalf)}` })
    else if (fromMin) markers.push({ speed: speed.minThreshold + speed.maxThreshold, label: `${params.curveType === 'JUMP' ? 'Jump' : 'Full'} at ${fmtSpeed(speed.minThreshold + speed.maxThreshold)}` })
  }
  const levels = !isStatic && handles.some(handle => handle.id === 'max' && handle.axis === 'y') ? [{ sens: speed.max[0], label: `Max ${fmtX(speed.max[0])}` }] : []

  // The right stick moves the focused row's point: x its speed, y its output.
  const latestStick = useRef<{ x: number; y: number } | null>(null)
  latestStick.current = gyro.sample?.devices?.[0]?.status?.rightStick ?? null
  const lastMove = useRef(0)
  useEffect(() => {
    if (!open || isStatic) return
    const stick = latestStick.current
    if (!stick || Math.hypot(stick.x, stick.y) < 0.3) return
    const now = performance.now()
    if (now - lastMove.current < 90) return
    lastMove.current = now
    const id = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-handle]')?.dataset.handle
    const handle = handles.find(item => item.id === id)
    if (!handle) return
    const dx = Math.abs(stick.x) > 0.3 && handle.axis !== 'y' ? Math.sign(stick.x) * speedSnap * 5 : 0
    const dy = Math.abs(stick.y) > 0.3 && handle.axis !== 'x' ? Math.sign(stick.y) * outSnap * 2 : 0
    handle.onDrag(handle.speed + dx, handle.sens + dy)
  })

  const now = performance.now()
  const recent = trailRef.current.filter(entry => now - entry.at <= TRAIL_MS).map(entry => ({ age: now - entry.at, speed: entry.speed }))
  const unavailable = reasons.speed

  // ---- Parts.
  const partStatus: Record<SpeedPart, string> = {
    speeds: isStatic ? `${fmtX(speed.base)} · no speed-up` : `${fmtX(speed.min[0])} to ${fmtX(speed.max[0])}`,
    shape: isStatic ? 'Off' : borrowed ? `${CURVE_LABEL[params.curveType as AccelCurveType]} · trackpad’s` : `${CURVE_LABEL[curve]} · own`,
    game: gyro.changed('REAL_WORLD_CALIBRATION', 'IN_GAME_SENS', 'ROLL_CONTRIBUTION') || gyro.callbacks.counterOsMouseSpeed ? 'Changed' : 'All default',
  }
  const partTitle: Record<SpeedPart, string> = { speeds: 'Speeds', shape: 'Shape', game: 'Game & lean' }
  const step = (direction: -1 | 1) => onPart(PARTS[(PARTS.indexOf(part) + direction + PARTS.length) % PARTS.length])
  // A part opened by LT / RT (or on arrival) puts focus on its first row.
  const rowsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const layers = document.querySelectorAll('[data-subpage]')
      if (rowsRef.current && layers[layers.length - 1] !== rowsRef.current.closest('[data-subpage]')) return
      const active = document.activeElement
      if (active && rowsRef.current?.parentElement?.contains(active) && active.closest('[role="tablist"]')) return
      rowsRef.current?.querySelector<HTMLElement>('[tabindex="0"], button:not([disabled])')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [open, part])

  const handleRow = (id: string) => ({ 'data-handle': id })
  const speedsRows = isStatic ? <>
    <ValueRow hero label="Speed" hint="One speed at every turn speed" value={Number(speed.base.toFixed(2))} min={0} max={30} step={0.1} fineStep={0.01} format={fmtX}
      setting={gyro.held ? undefined : 'GYRO_SENS'} disabled={unavailable ?? gyro.locked} onChange={value => setStatic(0, value)} data={{ 'data-setting': 'GYRO_SENS' }} />
    {separateOn && <ValueRow label="Speed, up/down" value={Number(speed.baseY.toFixed(2))} min={0} max={30} step={0.1} fineStep={0.01} format={fmtX}
      disabled={unavailable ?? gyro.locked} onChange={value => setStatic(1, value)} data={{ 'data-setting': 'GYRO_SENS' }} />}
    <Note>Pick a curve on the left to give fast turns their own speed.</Note>
  </> : <>
    <ValueRow label="Slow speed" hint="At and below the slow point" value={Number(speed.min[0].toFixed(2))} min={0} max={30} step={0.1} fineStep={0.01} format={fmtX}
      setting={gyro.held ? undefined : 'MIN_GYRO_SENS'} disabled={unavailable ?? gyro.locked} onChange={value => setSens('MIN_GYRO_SENS', 0, value)} data={{ 'data-setting': 'MIN_GYRO_SENS', ...handleRow('min') }} />
    {separateOn && <ValueRow label="Slow speed, up/down" value={Number(speed.min[1].toFixed(2))} min={0} max={30} step={0.1} fineStep={0.01} format={fmtX}
      disabled={unavailable ?? gyro.locked} onChange={value => setSens('MIN_GYRO_SENS', 1, value)} data={{ 'data-setting': 'MIN_GYRO_SENS' }} />}
    <ValueRow hero label="Fast speed" value={Number(speed.max[0].toFixed(2))} min={0} max={30} step={0.1} fineStep={0.01} format={fmtX}
      caption="Aim speed once you pass the fast point. ◂ ▸ steps 0.1, or move the point with the right stick."
      setting={gyro.held ? undefined : 'MAX_GYRO_SENS'} disabled={unavailable ?? gyro.locked} onChange={value => setSens('MAX_GYRO_SENS', 0, value)} data={{ 'data-setting': 'MAX_GYRO_SENS', ...handleRow('max') }} />
    {separateOn && <ValueRow label="Fast speed, up/down" value={Number(speed.max[1].toFixed(2))} min={0} max={30} step={0.1} fineStep={0.01} format={fmtX}
      disabled={unavailable ?? gyro.locked} onChange={value => setSens('MAX_GYRO_SENS', 1, value)} data={{ 'data-setting': 'MAX_GYRO_SENS' }} />}
    <KeyNumberRow k="MIN_GYRO_THRESHOLD" label="Slow until" hint="Below this, aim stays at the slow speed" fallback={0} min={0} max={500} step={1} fineStep={0.1} format={fmtSpeed} disabled={unavailable} />
    <KeyNumberRow k="MAX_GYRO_THRESHOLD" label="Fast from" fallback={0} min={0} max={500} step={1} fineStep={0.1} format={fmtSpeed} disabled={unavailable}
      hint={borrowed ? 'Where the borrowed shape tops out' : params.curveType === 'NATURAL' || params.curveType === 'POWER' || params.curveType === 'SIGMOID'
        ? 'Not used by this curve unless the trackpads borrow it' : params.curveType === 'QUADRATIC' || params.curveType === 'JUMP' ? 'Counted from the slow speed' : 'Above this, aim is at the fast speed'} />
  </>
  const shapeKey = (key: string, label: string, hint: string, fallback: number, min: number, max: number, stepBy: number, fine: number, speedUnit = true) =>
    <KeyNumberRow key={key} k={key} label={label} hint={hint} fallback={fallback} min={min} max={max} step={stepBy} fineStep={fine} format={value => (speedUnit ? fmtSpeed(value) : String(value))} disabled={unavailable} />
  const kept = (type: AccelCurveType) => {
    const n = (key: string, fallback: number) => Number(gyro.get(key) ?? fallback)
    if (type === 'NATURAL') return `Half-way speed ${n('ACCEL_NATURAL_VHALF', GYRO_ACCEL_DEFAULTS.naturalVHalf)} °/s`
    if (type === 'POWER') return `Start speed · bend ${n('ACCEL_POWER_VREF', GYRO_ACCEL_DEFAULTS.powerVRef)} · ${n('ACCEL_POWER_EXPONENT', GYRO_ACCEL_DEFAULTS.powerExponent)}`
    if (type === 'SIGMOID') return `Midpoint · width ${n('ACCEL_SIGMOID_MID', GYRO_ACCEL_DEFAULTS.sigmoidMid)} · ${n('ACCEL_SIGMOID_WIDTH', GYRO_ACCEL_DEFAULTS.sigmoidWidth)} °/s`
    if (type === 'JUMP') return `Smoothness ${n('ACCEL_JUMP_TAU', GYRO_ACCEL_DEFAULTS.jumpTau)}`
    return 'Nothing to shape'
  }
  const shapeRows = <>
    <SegmentedRow label="Curve source" hint="Gyro and trackpads can share one shape" value={link} setting="ACCEL_CURVE_LINK" disabled={gyro.locked}
      options={[{ value: 'NONE', label: 'Each has its own', caption: 'Gyro and trackpads keep their own shapes' }, { value: 'GYRO_USES_TOUCHPAD', label: 'Gyro uses trackpad’s', caption: 'Gyro borrows the trackpad shape, over its own speeds' }, { value: 'TOUCHPAD_USES_GYRO', label: 'Trackpads use gyro’s', caption: 'The trackpads borrow this shape' }]}
      onChange={value => gyro.set('ACCEL_CURVE_LINK', value === 'NONE' ? '' : value)} data={{ 'data-setting': 'ACCEL_CURVE_LINK' }} />
    {isStatic ? <Note>Pick a curve on the left first: Off has no shape.</Note>
      : borrowed ? <Note>Using the trackpads’ {CURVE_LABEL[params.curveType as AccelCurveType]} shape, stretched across gyro’s own speeds. Change the shape under Trackpads ▸ Mouse feel.</Note>
      : <>
        {speed.curve === 'NATURAL' && shapeKey('ACCEL_NATURAL_VHALF', 'Half-way speed', 'Above the slow speed, where it is half-way up', GYRO_ACCEL_DEFAULTS.naturalVHalf, 0.1, 500, 1, 0.1)}
        {speed.curve === 'POWER' && <>{shapeKey('ACCEL_POWER_VREF', 'Start speed', 'Smaller reaches the fast speed sooner', GYRO_ACCEL_DEFAULTS.powerVRef, 0.0001, 1, 0.001, 0.0001, false)}{shapeKey('ACCEL_POWER_EXPONENT', 'Bend', 'Below 1 eases in; above 1 starts slowly', GYRO_ACCEL_DEFAULTS.powerExponent, 0.05, 3, 0.05, 0.01, false)}</>}
        {speed.curve === 'SIGMOID' && <>{shapeKey('ACCEL_SIGMOID_MID', 'Midpoint', `Counted from the slow speed, so the S is centred on ${fmtSpeed(speed.minThreshold + params.sigmoidMid)}. ◂ ▸ steps 1 °/s.`, GYRO_ACCEL_DEFAULTS.sigmoidMid, 0, 500, 1, 0.1)}{shapeKey('ACCEL_SIGMOID_WIDTH', 'Width', 'How gradual the S is; wider is gentler', GYRO_ACCEL_DEFAULTS.sigmoidWidth, 0.1, 200, 1, 0.1)}</>}
        {speed.curve === 'JUMP' && shapeKey('ACCEL_JUMP_TAU', 'Smoothness', 'How early the climb starts; 0 is a step', GYRO_ACCEL_DEFAULTS.jumpTau, 0, 20, 0.1, 0.01, false)}
        {(speed.curve === 'LINEAR' || speed.curve === 'QUADRATIC') && <Note>{CURVE_LABEL[speed.curve]}: nothing to shape. The speeds part sets where it starts and ends.</Note>}
      </>}
    <div className={styles.kept}>
      <b>Kept for the other curves</b><span>Pick that curve on the left to change them</span>
      <StatTiles tiles={(['NATURAL', 'POWER', 'SIGMOID', 'JUMP'] as const).filter(type => type !== speed.curve || isStatic).map(type => ({ label: CURVE_LABEL[type], value: kept(type) }))} />
    </div>
  </>

  const inYawRoll = (gyro.get('GYRO_SPACE') ?? '').toUpperCase() === 'YAW_PLUS_ROLL'
  const mouseOnly = reasons.output !== 'MOUSE' ? 'Only while gyro sends the mouse.' : undefined
  const pointer = usePointerSpeed(open && part === 'game')
  const turned = useTurned(gyro.sample)
  const gameRows = <>
    <OpenRow label="Match a full turn (360°)" hint="Turn once in game and we work it out. Already know the value? Type it below."
      value={gyro.get('REAL_WORLD_CALIBRATION') ?? 'Not set'} onOpen={onMatchTurn} disabled={mouseOnly} hints="A:Start" />
    <KeyNumberRow k="REAL_WORLD_CALIBRATION" label="Full-turn value" hint="What Match a full turn works out; type one you already know" fallback={0} min={0} max={10000} step={0.1} fineStep={0.01}
      format={value => (value > 0 ? String(value) : 'Not set')} disabled={mouseOnly} />
    <KeyNumberRow k="IN_GAME_SENS" label="In-game sensitivity" hint="The mouse sensitivity set inside the game" fallback={1} min={0} max={100} step={0.1} fineStep={0.01} disabled={mouseOnly} />
    <SwitchRow label="Ignore Windows pointer speed" hint="For games that don’t read raw mouse input" setting="COUNTER_OS_MOUSE_SPEED"
      on={gyro.callbacks.counterOsMouseSpeed} disabled={mouseOnly ?? gyro.locked} onChange={gyro.callbacks.onCounterOsMouseSpeedChange}
      caption={`Ignore Windows pointer speed · ${pointerSpeedText(pointer)}`} />
    <KeyNumberRow k="ROLL_CONTRIBUTION" label="Lean adds turn" hint="Only when Direction ▸ Turn using is Turn + lean" fallback={0} min={-100} max={100} step={5} fineStep={1}
      format={value => `${value}%`} disabled={inYawRoll ? undefined : 'Only when Direction ▸ Turn using is Turn + lean.'} />
    <Note>Full turn and in-game sensitivity only matter while gyro sends the mouse. Lean can also turn the other way: below 0% reverses it.</Note>
  </>

  const summary = isStatic ? `Off · ${fmtX(speed.base)} at every speed` : `${CURVE_LABEL[params.curveType as AccelCurveType]} curve from ${fmtX(speed.min[0])} at ${fmtSpeed(speed.minThreshold)} to ${fmtX(speed.max[0])}`
  return (
    <SubPage open={open} onClose={onClose} trail={trail} title="Advanced" stepLabel="Part" onStep={step} backLabel="Back to Speed"
      hints={part === 'game' ? [{ button: 'X', label: 'Count again' }] : gyro.callbacks.onTryIt ? [{ button: 'X', label: 'Try it' }] : undefined}
      where={`${trail.join(' · ')} · Advanced · ${partTitle[part]}`}>
      <PadActions x={part === 'game' ? turned.reset : gyro.callbacks.onTryIt}><div className={styles.speedAdvanced} data-speed-advanced="">
        <section className={styles.curveCard} aria-label="Speed-up curve">
          {part === 'game' ? <MatchTurnVisual pointer={pointer} turned={turned} /> : <>
            <header className={styles.curveHeader}>
              <div><h2>Speed-up curve</h2><p>{CURVE_LABEL[curve]}: {CURVE_WORDS[curve].toLowerCase()}</p></div>
              <span className={styles.live}><i aria-hidden="true" />live {live === null ? '—' : `${Math.round(live)} °/s → ${fmtX(accelSensitivityAt(live, params))}`}</span>
              <span className={styles.rangeToggle} role="radiogroup" aria-label="Speeds shown">
                {(['fit', 'wide'] as const).map(value => <button key={value} type="button" role="radio" aria-checked={range === value} data-current={range === value ? 'true' : undefined}
                  data-hints={`A:Show ${value === 'fit' ? 'the bend' : 'up to 500 °/s'};B:Back to Speed`} data-caption={value === 'fit' ? 'Fit · keeps the bend in view' : 'Full range · up to 500 °/s'}
                  onClick={() => setRange(value)}>{value === 'fit' ? 'Fit' : 'Full range'}</button>)}
              </span>
            </header>
            <ModeCards columns={7} value={curve} useLabel={card => `Use ${card.label}`}
              onChange={value => write(previous => setCurveType(previous, value as AccelCurveType | 'OFF', '', gyro.text))}
              options={(['OFF', ...ACCEL_CURVE_TYPES] as (AccelCurveType | 'OFF')[]).map(type => ({ value: type, label: CURVE_LABEL[type], art: <CurveArt type={type} />, unavailable: unavailable ?? gyro.locked ?? (borrowed && type !== 'OFF' ? 'Gyro is borrowing the trackpads’ shape (Shape ▸ Curve source).' : undefined) }))} />
            <div className={styles.plot}>
              <CurvePlot params={params} secondary={secondary} unit="°/s" formatOutput={fmtX} xMax={xMax} liveSpeed={live} trail={recent}
                handles={handles} markers={markers} levels={levels} disabled={Boolean(unavailable ?? gyro.locked)} ariaLabel={summary} />
            </div>
            <p className={styles.visualCaption}><span className={styles.keyDot} data-key="handle" />Drag a point · <span className={styles.keyDot} data-key="live" />Your hand, right now</p>
          </>}
        </section>
        <section className={styles.partsPanel} aria-label="Parts">
          <div className={styles.partTabs} role="tablist" aria-label="Parts">
            {PARTS.map(id => (
              <button key={id} type="button" role="tab" aria-selected={id === part} className={styles.partTab} data-current={id === part ? 'true' : undefined}
                data-hints="A:Open;LT/RT:Part;B:Back to Speed" onClick={() => onPart(id)}>
                <b>{partTitle[id]}</b><span>{partStatus[id]}</span>
              </button>
            ))}
          </div>
          {unavailable && <Note tone="warn">{unavailable}</Note>}
          <div ref={rowsRef} className={styles.partRows} key={part} data-part={part}>
            {part === 'speeds' && <>{speedsRows}
              <SwitchRow label="Separate up/down speeds" hint="Off: up and down use the same speeds" on={separateOn} disabled={unavailable ?? gyro.locked}
                onChange={next => { setSeparate(next); if (!next) write(previous => joinVerticalSpeeds(previous, '', gyro.text)) }} />
              <p className={styles.partSummary}><b>Shape</b> · half-way speed, start speed and bend, midpoint and width, smoothness, share a curve with the trackpads<br /><b>Game & lean</b> · in-game sensitivity, full-turn value, Ignore Windows pointer speed, lean adds turn</p>
            </>}
            {part === 'shape' && shapeRows}
            {part === 'game' && gameRows}
          </div>
        </section>
      </div></PadActions>
    </SubPage>
  )
}
