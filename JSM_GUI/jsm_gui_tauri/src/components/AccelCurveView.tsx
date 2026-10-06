import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from './icons/Icon'
import { ButtonGlyph } from './glyphs/ButtonGlyph'
import { SummaryRow, RowGroup } from './ui/SummaryRow'
import { SettingPrefix } from './SettingOrigin'
import { CurvePlot, TRAIL_MS, type CurveHandle, type CurveMarker } from './CurvePlot'
import { niceCeil, niceStep, snapTo } from '../utils/niceNumbers'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { inputDisplayName } from '../keymap/inputNames'
import type { SensitivityValues } from '../utils/keymap'
import type { TouchpadAccelParamKey, TouchpadAccelValues } from '../hooks/useTouchpadConfig'
import {
  ACCEL_CURVE_TYPES,
  GYRO_ACCEL_DEFAULTS,
  GYRO_OUTPUT_DEFAULTS,
  TOUCHPAD_ACCEL_DEFAULTS,
  accelCurveSettleSpeed,
  accelSensitivityAt,
  inheritsCurveShape,
  normalizeAccelCurveLink,
  normalizeAccelCurveType,
  type AccelCurveLink,
  type AccelCurveParams,
  type AccelCurveShape,
  type AccelCurveType,
} from '../utils/accelCurve'

// The acceleration curve editor (TODO-40): a full-window view, like On-screen
// menus, with the curve at the size of the window in the middle and every
// setting that shapes it in the panel on the right. Opened from the Gyro
// page's Sensitivity section and from Mouse feel › Acceleration; LB/RB switch
// between the gyro's curve and the trackpad's, since either can borrow the
// other's shape. The curve is drawn from the configuration being edited, so
// it moves with every row and every drag before anything is saved; the live
// input speed rides on it so the thresholds can be set against the hand.

export type CurveSide = 'gyro' | 'touchpad'

export type GyroCurveInput = {
  /** The values of the view being edited: base, or the modeshift's. */
  values: SensitivityValues
  mode: 'static' | 'accel'
  onModeChange: (mode: 'static' | 'accel') => void
  view: 'base' | 'modeshift'
  onViewChange: (view: 'base' | 'modeshift') => void
  shiftButton: string | null
  liveSpeed?: number
  onCurveChange: (value: string) => void
  onMinThresholdChange: (value: string) => void
  onMaxThresholdChange: (value: string) => void
  onNaturalVHalfChange: (value: string) => void
  onPowerVRefChange: (value: string) => void
  onPowerExponentChange: (value: string) => void
  onSigmoidMidChange: (value: string) => void
  onSigmoidWidthChange: (value: string) => void
  onJumpTauChange: (value: string) => void
  onMinSensXChange: (value: string) => void
  onMinSensYChange: (value: string) => void
  onMaxSensXChange: (value: string) => void
  onMaxSensYChange: (value: string) => void
  /** Both axes of one output at once (a handle moves them together). */
  onSensPairChange: (which: 'min' | 'max', x: number, y: number) => void
}

export type TouchpadCurveInput = {
  values: TouchpadAccelValues
  liveSpeed?: number
  onCurveChange: (value: string) => void
  onParamChange: (key: TouchpadAccelParamKey, value: string) => void
}

type AccelCurveViewProps = {
  open: boolean
  side: CurveSide
  onSideChange: (side: CurveSide) => void
  onClose: () => void
  configName: string
  disabled?: boolean
  link?: string
  onLinkChange: (link: AccelCurveLink) => void
  gyro: GyroCurveInput
  touchpad: TouchpadCurveInput
}

type ShapeKey = 'naturalVHalf' | 'powerVRef' | 'powerExponent' | 'sigmoidMid' | 'sigmoidWidth' | 'jumpTau'

// What differs between the two inputs, as numbers the view can draw and rows
// it can write: units, ranges, steps, setting names and the setters.
type SideModel = {
  side: CurveSide
  name: string
  unit: string
  /** The shape as configured, unset fields left undefined (rows show the default). */
  shape: AccelCurveShape
  defaults: Required<Omit<AccelCurveShape, 'curve'>>
  minOut?: number
  maxOut?: number
  outDefaults: { min: number; max: number }
  speedMax: number
  speedStep: number
  speedFine: number
  wideRange: number
  keys: Record<'curve' | 'minThreshold' | 'maxThreshold' | ShapeKey, string>
  setCurve: (value: string) => void
  setThreshold: (which: 'min' | 'max', value: number | '') => void
  setShape: (key: ShapeKey, value: number | '') => void
  liveSpeed?: number
}

// One line under the Curve row; X (What's this?) has the full explanation.
const CURVE_WORDS: Record<AccelCurveType, string> = {
  LINEAR: 'Rises evenly from slow to fast',
  NATURAL: 'Rises quickly, then levels off',
  POWER: 'Eases in along a power law',
  QUADRATIC: 'Flat at first, then bends upwards',
  SIGMOID: 'An S: flat, a ramp, then flat again',
  JUMP: 'Holds low, then climbs sharply',
}

const trimmed = (value: number, digits = 3) => String(Number(value.toFixed(digits)))

export function AccelCurveView(props: AccelCurveViewProps) {
  const { t } = useTranslation()
  const { open, side, onSideChange, onClose, configName, disabled, gyro, touchpad } = props
  const link = normalizeAccelCurveLink(props.link)
  const [range, setRange] = useState<'fit' | 'wide'>('fit')

  // LB / RB switch inputs, as they step menus in On-screen menus.
  const latestSide = useRef(side)
  latestSide.current = side
  useEffect(() => {
    if (!open) return
    const onPad = (event: Event) => {
      const button = (event as CustomEvent<PadEventDetail>).detail.button
      if (button !== 'LB' && button !== 'RB') return
      const next: CurveSide = button === 'LB' ? 'gyro' : 'touchpad'
      if (next !== latestSide.current) onSideChange(next)
      event.preventDefault()
    }
    document.addEventListener(PAD_EVENT, onPad)
    return () => document.removeEventListener(PAD_EVENT, onPad)
  }, [open, onSideChange])

  // The last few seconds of live speed, for the plot's ticks and the peak
  // readout. Taken on every render (App renders per telemetry frame) at most
  // every 30 ms, not on change: a hand held at one speed is still a speed.
  const trail = useRef<{ at: number; speed: number; side: CurveSide }[]>([])
  const liveSpeed = side === 'gyro' ? gyro.liveSpeed : touchpad.liveSpeed
  useEffect(() => {
    if (!open) { trail.current = []; return }
    if (typeof liveSpeed !== 'number' || !Number.isFinite(liveSpeed)) return
    const now = performance.now()
    const last = trail.current[trail.current.length - 1]
    if (last && last.side === side && now - last.at < 30) return
    trail.current.push({ at: now, speed: liveSpeed, side })
    while (trail.current.length && now - trail.current[0].at > TRAIL_MS) trail.current.shift()
  })

  if (!open) return null

  const gyroShape: AccelCurveShape = { ...gyro.values, curve: gyro.values.accelCurve }
  const models: Record<CurveSide, SideModel> = {
    gyro: {
      side: 'gyro',
      name: t('curveView.gyro', 'Gyro'),
      unit: '°/s',
      shape: gyroShape,
      defaults: { ...GYRO_ACCEL_DEFAULTS, minThreshold: GYRO_OUTPUT_DEFAULTS.minThreshold, maxThreshold: GYRO_OUTPUT_DEFAULTS.maxThreshold },
      minOut: gyro.values.minSensX,
      maxOut: gyro.values.maxSensX,
      outDefaults: { min: GYRO_OUTPUT_DEFAULTS.minSens, max: GYRO_OUTPUT_DEFAULTS.maxSens },
      speedMax: 500,
      speedStep: 1,
      speedFine: 0.1,
      wideRange: 500,
      keys: {
        curve: 'ACCEL_CURVE', minThreshold: 'MIN_GYRO_THRESHOLD', maxThreshold: 'MAX_GYRO_THRESHOLD',
        naturalVHalf: 'ACCEL_NATURAL_VHALF', powerVRef: 'ACCEL_POWER_VREF', powerExponent: 'ACCEL_POWER_EXPONENT',
        sigmoidMid: 'ACCEL_SIGMOID_MID', sigmoidWidth: 'ACCEL_SIGMOID_WIDTH', jumpTau: 'ACCEL_JUMP_TAU',
      },
      setCurve: gyro.onCurveChange,
      setThreshold: (which, value) => (which === 'min' ? gyro.onMinThresholdChange : gyro.onMaxThresholdChange)(String(value)),
      setShape: (key, value) => ({
        naturalVHalf: gyro.onNaturalVHalfChange, powerVRef: gyro.onPowerVRefChange, powerExponent: gyro.onPowerExponentChange,
        sigmoidMid: gyro.onSigmoidMidChange, sigmoidWidth: gyro.onSigmoidWidthChange, jumpTau: gyro.onJumpTauChange,
      })[key](String(value)),
      liveSpeed: gyro.liveSpeed,
    },
    touchpad: {
      side: 'touchpad',
      name: t('curveView.touchpad', 'Trackpad'),
      unit: 'px/s',
      shape: touchpad.values,
      defaults: { ...TOUCHPAD_ACCEL_DEFAULTS },
      minOut: touchpad.values.minGain,
      maxOut: touchpad.values.maxGain,
      outDefaults: { min: TOUCHPAD_ACCEL_DEFAULTS.minGain, max: TOUCHPAD_ACCEL_DEFAULTS.maxGain },
      speedMax: 5000,
      speedStep: 50,
      speedFine: 10,
      wideRange: 5000,
      keys: {
        curve: 'TOUCHPAD_ACCEL_CURVE', minThreshold: 'TOUCHPAD_ACCEL_MIN_SPEED', maxThreshold: 'TOUCHPAD_ACCEL_MAX_SPEED',
        naturalVHalf: 'TOUCHPAD_ACCEL_NATURAL_VHALF', powerVRef: 'TOUCHPAD_ACCEL_POWER_VREF', powerExponent: 'TOUCHPAD_ACCEL_POWER_EXPONENT',
        sigmoidMid: 'TOUCHPAD_ACCEL_SIGMOID_MID', sigmoidWidth: 'TOUCHPAD_ACCEL_SIGMOID_WIDTH', jumpTau: 'TOUCHPAD_ACCEL_JUMP_TAU',
      },
      setCurve: touchpad.onCurveChange,
      setThreshold: (which, value) => touchpad.onParamChange(which === 'min' ? 'minThreshold' : 'maxThreshold', String(value)),
      setShape: (key, value) => touchpad.onParamChange(key, String(value)),
      liveSpeed: touchpad.liveSpeed,
    },
  }
  const model = models[side]
  const other = models[side === 'gyro' ? 'touchpad' : 'gyro']
  const inherits = inheritsCurveShape(side, link)
  const isStatic = side === 'gyro' && gyro.mode === 'static'

  const numbers = (m: SideModel) => {
    const s = m.shape
    const d = m.defaults
    return {
      curveType: normalizeAccelCurveType(s.curve),
      minThreshold: s.minThreshold ?? d.minThreshold,
      maxThreshold: s.maxThreshold ?? d.maxThreshold,
      naturalVHalf: s.naturalVHalf ?? d.naturalVHalf,
      powerVRef: s.powerVRef ?? d.powerVRef,
      powerExponent: s.powerExponent ?? d.powerExponent,
      sigmoidMid: s.sigmoidMid ?? d.sigmoidMid,
      sigmoidWidth: s.sigmoidWidth ?? d.sigmoidWidth,
      jumpTau: s.jumpTau ?? d.jumpTau,
    }
  }
  const own = numbers(model)
  const minOut = model.minOut ?? model.outDefaults.min
  const maxOut = model.maxOut ?? model.outDefaults.max
  // The gyro's vertical axis, when it is set apart from the horizontal. A
  // static gyro has one sensitivity per axis, at every speed.
  const staticSens = gyro.values.gyroSensX ?? gyro.values.minSensX ?? 1
  const staticSensY = gyro.values.gyroSensY ?? staticSens
  const minOutY = side === 'gyro' ? gyro.values.minSensY ?? minOut : minOut
  const maxOutY = side === 'gyro' ? gyro.values.maxSensY ?? maxOut : maxOut
  const secondary = side !== 'gyro' ? null
    : isStatic ? (staticSensY !== staticSens || gyro.values.steadyingFloorX !== gyro.values.steadyingFloorY ? { minSens: staticSensY, maxSens: staticSensY } : null)
      : minOutY !== minOut || maxOutY !== maxOut || gyro.values.steadyingFloorX !== gyro.values.steadyingFloorY ? { minSens: minOutY, maxSens: maxOutY } : null
  const splitAxes = secondary !== null

  // What the mapper evaluates: this input's own shape, or the other's mapped
  // onto this input's speed range.
  const params: AccelCurveParams = isStatic
    ? { ...own, curveType: 'LINEAR', minSens: staticSens, maxSens: staticSens, minThreshold: 0, maxThreshold: 0 }
    : inherits
      ? { ...numbers(other), minSens: minOut, maxSens: maxOut, ownRange: { min: own.minThreshold, max: own.maxThreshold } }
      : { ...own, minSens: minOut, maxSens: maxOut }
  const steadying = side === 'gyro' ? { cutoff: gyro.values.cutoffSpeed ?? 0, recovery: gyro.values.cutoffRecovery ?? 0, floor: gyro.values.steadyingFloorX ?? 0, enabled: (gyro.values.steadyingFloorX ?? 0) > 0 || (gyro.values.steadyingFloorY ?? 0) > 0 } : undefined
  params.steadying = steadying
  if (secondary && steadying) Object.assign(secondary, { steadying: { ...steadying, floor: gyro.values.steadyingFloorY ?? gyro.values.steadyingFloorX ?? 0 } })
  const curveType = params.curveType as AccelCurveType

  // The speed axis ends a little past where the curve settles, on a round
  // number; "Full range" shows the whole span the rows allow.
  const floor = side === 'gyro' ? 20 : 400
  const fitRaw = Math.max(floor, (steadying?.recovery ?? 0) * 1.25, accelCurveSettleSpeed(params) * 1.25, own.minThreshold * 1.5, (curveType === 'LINEAR' || inherits ? own.maxThreshold : 0) * 1.2)
  const xMax = niceCeil(range === 'wide' ? Math.max(fitRaw, model.wideRange) : fitRaw)
  const speedSnap = Math.max(side === 'gyro' ? 0.1 : 1, niceStep(xMax, 200))
  const outSnap = niceStep(Math.max(maxOut, minOut, 0.5), 100)
  const fmtSpeed = (value: number) => `${trimmed(value, 1)} ${model.unit}`
  const fmtOut = (value: number) => (side === 'gyro' ? value.toFixed(2) : `${value.toFixed(2)}×`)

  // ---- Handles: each is one or two settings the pointer moves.
  const setOutput = (which: 'min' | 'max', raw: number) => {
    const value = Math.max(0, snapTo(raw, outSnap))
    if (side === 'touchpad') { touchpad.onParamChange(which === 'min' ? 'minGain' : 'maxGain', String(value)); return }
    // X follows the pointer; Y keeps its proportion to X, so equal axes stay equal.
    const [x, y] = which === 'min' ? [minOut, minOutY] : [maxOut, maxOutY]
    gyro.onSensPairChange(which, value, x > 0 ? snapTo((y * value) / x, outSnap / 10) : value)
  }
  const setSpeed = (which: 'min' | 'max', raw: number) => model.setThreshold(which, Math.max(0, snapTo(raw, speedSnap)))
  const handles: CurveHandle[] = []
  if (!isStatic) {
    const at = (speed: number) => accelSensitivityAt(speed, params)
    const linearish = curveType === 'LINEAR'
    const cappedFromMin = !inherits && (curveType === 'QUADRATIC' || curveType === 'JUMP')
    handles.push({
      id: 'min', label: t('curveView.handleSlow', 'Slow'), speed: own.minThreshold, sens: minOut, axis: 'xy',
      onDrag: (speed, sens) => {
        setSpeed('min', linearish ? Math.min(speed, own.maxThreshold) : speed)
        setOutput('min', sens)
      },
    })
    if (linearish) {
      handles.push({
        id: 'max', label: t('curveView.handleFast', 'Fast'), speed: own.maxThreshold, sens: maxOut, axis: 'xy',
        onDrag: (speed, sens) => { setSpeed('max', Math.max(speed, own.minThreshold)); setOutput('max', sens) },
      })
    } else if (cappedFromMin) {
      handles.push({
        id: 'max', label: t('curveView.handleFast', 'Fast'), speed: own.minThreshold + own.maxThreshold, sens: maxOut, axis: 'xy',
        onDrag: (speed, sens) => { setSpeed('max', speed - own.minThreshold); setOutput('max', sens) },
      })
    } else {
      // An eased curve only approaches its maximum: it is a level to lift.
      handles.push({
        id: 'max', label: t('curveView.handleMax', 'Maximum'), speed: xMax * 0.94, sens: maxOut, axis: 'y',
        onDrag: (_speed, sens) => setOutput('max', sens),
      })
      if (inherits) {
        handles.push({
          id: 'range', label: t('curveView.handleRange', 'Fast speed'), speed: own.maxThreshold, sens: at(own.maxThreshold), axis: 'x',
          onDrag: speed => setSpeed('max', Math.max(speed, own.minThreshold)),
        })
      }
    }
    if (!inherits && curveType === 'NATURAL') {
      handles.push({
        id: 'shape', label: t('curveView.handleHalf', 'Half-way'), speed: own.minThreshold + own.naturalVHalf, sens: at(own.minThreshold + own.naturalVHalf), axis: 'x',
        onDrag: speed => model.setShape('naturalVHalf', Math.max(speedSnap, snapTo(speed - own.minThreshold, speedSnap))),
      })
    }
    if (!inherits && curveType === 'SIGMOID') {
      handles.push({
        id: 'shape', label: t('curveView.handleMid', 'Midpoint'), speed: own.minThreshold + own.sigmoidMid, sens: at(own.minThreshold + own.sigmoidMid), axis: 'x',
        onDrag: speed => model.setShape('sigmoidMid', Math.max(0, snapTo(speed - own.minThreshold, speedSnap))),
      })
    }
  }

  // ---- Markers: the speeds the settings name, captioned over the frame.
  const markers: CurveMarker[] = []
  if (!isStatic) {
    if (own.minThreshold > 0) markers.push({ speed: own.minThreshold, label: `${t('curveView.markerSlow', 'Slow')} ${fmtSpeed(own.minThreshold)}` })
    if (curveType === 'LINEAR' || inherits) markers.push({ speed: own.maxThreshold, label: `${t('curveView.markerFast', 'Fast')} ${fmtSpeed(own.maxThreshold)}` })
    else if (curveType === 'QUADRATIC') markers.push({ speed: own.minThreshold + own.maxThreshold, label: `${t('curveView.markerFull', 'Full at')} ${fmtSpeed(own.minThreshold + own.maxThreshold)}` })
    else if (curveType === 'JUMP') markers.push({ speed: own.minThreshold + own.maxThreshold, label: `${t('curveView.markerJump', 'Jump at')} ${fmtSpeed(own.minThreshold + own.maxThreshold)}` })
    else if (curveType === 'NATURAL') markers.push({ speed: own.minThreshold + own.naturalVHalf, label: `${t('curveView.markerHalf', 'Half-way')} ${fmtSpeed(own.minThreshold + own.naturalVHalf)}` })
    else if (curveType === 'SIGMOID') markers.push({ speed: own.minThreshold + own.sigmoidMid, label: `${t('curveView.markerMid', 'Midpoint')} ${fmtSpeed(own.minThreshold + own.sigmoidMid)}` })
  }

  // An eased curve only approaches its maximum; the level it approaches is drawn.
  const levels = !isStatic && handles.some(handle => handle.id === 'max' && handle.axis === 'y')
    ? [{ sens: maxOut, label: `${t('curveView.levelMax', 'Max')} ${fmtOut(maxOut)}` }]
    : []

  // ---- Rows.
  const speedRow = (which: 'min' | 'max', label: string, hint: string, value: number) => (
    <SummaryRow size="sheet" label={label} hint={hint} setting={model.keys[which === 'min' ? 'minThreshold' : 'maxThreshold']} mono
      value={fmtSpeed(value)} disabled={disabled}
      adjust={{ kind: 'number', value, min: 0, max: model.speedMax, step: model.speedStep, fineStep: model.speedFine, onChange: next => model.setThreshold(which, next) }} />
  )
  const shapeRow = (key: ShapeKey, label: string, hint: string, spec: { min: number; max: number; step: number; fine: number; speed?: boolean }) => {
    const value = own[key]
    return (
      <SummaryRow key={key} size="sheet" label={label} hint={hint} setting={model.keys[key]} mono disabled={disabled}
        value={spec.speed ? fmtSpeed(value) : trimmed(value, 4)}
        adjust={{ kind: 'number', value, min: spec.min, max: spec.max, step: spec.step, fineStep: spec.fine, onChange: next => model.setShape(key, next) }} />
    )
  }
  const speedSpec = { min: 0, max: model.speedMax, step: model.speedStep, fine: model.speedFine, speed: true }
  const hasShape = !inherits && !isStatic && (curveType === 'NATURAL' || curveType === 'POWER' || curveType === 'SIGMOID' || curveType === 'JUMP')
  const shapeRows: ReactNode = !hasShape ? null : (
    <>
      {curveType === 'NATURAL' && shapeRow('naturalVHalf', t('curveView.naturalVHalf', 'Half-way speed'), t('curveView.naturalVHalfHint', 'Above the slow speed, where it is half-way up'), { ...speedSpec, min: model.speedFine })}
      {curveType === 'POWER' && <>
        {shapeRow('powerVRef', t('sensitivity.powerVRef'), t('curveView.powerVRefHint', 'Smaller reaches the maximum sooner'), { min: 0.0001, max: side === 'gyro' ? 1 : 100, step: 0.001, fine: 0.0001 })}
        {shapeRow('powerExponent', t('sensitivity.powerExponent'), t('curveView.powerExponentHint', 'Below 1 eases in; above 1 starts slowly'), { min: 0.05, max: 3, step: 0.05, fine: 0.01 })}
      </>}
      {curveType === 'SIGMOID' && <>
        {shapeRow('sigmoidMid', t('curveView.sigmoidMid', 'Midpoint'), t('curveView.sigmoidMidHint', 'Above the slow speed, the middle of the S'), speedSpec)}
        {shapeRow('sigmoidWidth', t('curveView.sigmoidWidth', 'Width'), t('curveView.sigmoidWidthHint', 'How gradual the S is: wider is gentler'), { ...speedSpec, min: model.speedFine })}
      </>}
      {curveType === 'JUMP' && shapeRow('jumpTau', t('sensitivity.jumpTau'), t('curveView.jumpTauHint', 'How early the climb starts; 0 is a step'), { min: 0, max: 20, step: 0.1, fine: 0.01 })}
    </>
  )
  const outStep = side === 'gyro' ? 0.1 : 0.05
  const outFine = 0.01
  const gyroOutRow = (which: 'min' | 'max', axis: 'X' | 'Y', value: number, onChange: (value: string) => void) => (
    <SummaryRow key={which + axis} size="sheet" mono disabled={disabled}
      label={`${which === 'min' ? t('gyroPage.minSensitivity') : t('gyroPage.maxSensitivity')} (${axis})`}
      hint={axis === 'X' ? (which === 'min' ? t('curveView.minSensHint', 'Sensitivity at and below the slow speed') : t('curveView.maxSensHint', 'Sensitivity once the curve has risen')) : t('curveView.axisYHint', 'Vertical aim, drawn faintly when it differs')}
      setting={which === 'min' ? 'MIN_GYRO_SENS' : 'MAX_GYRO_SENS'} value={value.toFixed(2)}
      adjust={{ kind: 'number', value, min: 0, max: 30, step: outStep, fineStep: outFine, onChange: next => onChange(String(next)) }} />
  )
  const gainRow = (which: 'min' | 'max', value: number) => (
    <SummaryRow size="sheet" mono disabled={disabled} setting={which === 'min' ? 'TOUCHPAD_ACCEL_MIN_GAIN' : 'TOUCHPAD_ACCEL_MAX_GAIN'}
      label={which === 'min' ? t('touchpadAccel.minGain') : t('touchpadAccel.maxGain')}
      hint={which === 'min' ? t('curveView.minGainHint', 'Cursor multiplier at slow finger speeds') : t('curveView.maxGainHint', 'Above 1, flicks travel further')}
      value={fmtOut(value)}
      adjust={{ kind: 'number', value, min: 0.1, max: 5, step: outStep, fineStep: outFine, onChange: next => touchpad.onParamChange(which === 'min' ? 'minGain' : 'maxGain', String(next)) }} />
  )

  const linkOptions = [
    { value: 'NONE', label: t('accelCurve.linkOwn'), description: 'Keep independent acceleration curves for gyro and trackpad input.' },
    { value: 'GYRO_USES_TOUCHPAD', label: t('accelCurve.linkGyroUsesTouchpad') },
    { value: 'TOUCHPAD_USES_GYRO', label: t('accelCurve.linkTouchpadUsesGyro') },
  ]
  const shiftName = gyro.shiftButton ? inputDisplayName(gyro.shiftButton, 'generic') : ''
  const trackpadOff = side === 'touchpad' && minOut === maxOut && minOut === 1

  // ---- Live figures under the curve.
  const live = typeof liveSpeed === 'number' && Number.isFinite(liveSpeed) ? liveSpeed : null
  const now = performance.now()
  const recent = trail.current.filter(entry => entry.side === side && now - entry.at <= TRAIL_MS).map(entry => ({ age: now - entry.at, speed: entry.speed }))
  const peak = recent.reduce((top, entry) => Math.max(top, entry.speed), live ?? 0)
  const outputName = side === 'gyro' ? t('curveView.sensitivity', 'Sensitivity') : t('curveView.gain', 'Gain')

  const rows = (
    <>
      {side === 'gyro' && gyro.shiftButton && (
        <SummaryRow size="sheet" label={t('gyroPage.shiftView')} hint={t('curveView.shiftHint', 'The curve while {{input}} is held is its own', { input: shiftName })}
          adjust={{ kind: 'choice', value: gyro.view, options: [{ value: 'base', label: t('gyroPage.shiftViewBase') }, { value: 'modeshift', label: `${t('gyroPage.shiftViewShifted')} · ${shiftName}` }], onChange: value => gyro.onViewChange(value as 'base' | 'modeshift') }} />
      )}
      {side === 'gyro' && (
        <SummaryRow size="sheet" label={t('gyroPage.sensitivityMode')} hint={t('curveView.modeHint', 'One value, or a curve')} disabled={disabled}
          adjust={{ kind: 'choice', value: gyro.mode, options: [{ value: 'static', label: t('gyroPage.modeStatic') }, { value: 'accel', label: t('gyroPage.modeAccel') }], onChange: value => gyro.onModeChange(value as 'static' | 'accel') }} />
      )}
      {isStatic ? (
        <p className="curve-view__note">{t('curveView.staticNote', 'The gyro uses one sensitivity at every speed. Choose Acceleration curve above to shape it.')}</p>
      ) : (
        <>
          <SummaryRow size="sheet" label={t('accelCurve.linkLabel')} hint={t('curveView.linkHint', 'Own shape, or the other input’s')} setting="ACCEL_CURVE_LINK" disabled={disabled}
            help={t('accelCurve.linkHint')}
            adjust={{ kind: 'choice', value: link, options: linkOptions, onChange: value => props.onLinkChange(value as AccelCurveLink) }} />
          {inherits ? (
            <p className="curve-view__note">
              {t('curveView.inheritingNote', 'Using the {{other}}’s curve shape ({{curve}}), stretched across this input’s speed range. Press {{button}} to change the shape; the speeds and outputs here stay the {{own}}’s own.',
                { other: other.name.toLowerCase(), own: model.name.toLowerCase(), curve: t(`sensitivity.curves.${curveType.toLowerCase()}`), button: side === 'gyro' ? 'RB' : 'LB' })}
            </p>
          ) : (
            <SummaryRow size="sheet" label={t('curveView.curve', 'Curve')} hint={t(`curveView.words.${curveType.toLowerCase()}`, CURVE_WORDS[curveType])} setting={model.keys.curve} disabled={disabled}
              help={t('gyroPage.curveTypeDesc')}
              data={{ 'data-autofocus': '' }}
              adjust={{ kind: 'choice', value: curveType, options: ACCEL_CURVE_TYPES.map(type => ({ value: type, label: t(`sensitivity.curves.${type.toLowerCase()}`) })), onChange: model.setCurve }} />
          )}
          <RowGroup title={side === 'gyro' ? t('curveView.outputsGyro', 'Sensitivity') : t('curveView.outputsTrackpad', 'Gain')}>
            {side === 'gyro' ? <>
              {gyroOutRow('min', 'X', minOut, gyro.onMinSensXChange)}
              {gyroOutRow('min', 'Y', minOutY, gyro.onMinSensYChange)}
              {gyroOutRow('max', 'X', maxOut, gyro.onMaxSensXChange)}
              {gyroOutRow('max', 'Y', maxOutY, gyro.onMaxSensYChange)}
            </> : <>
              {gainRow('min', minOut)}
              {gainRow('max', maxOut)}
            </>}
          </RowGroup>
          {trackpadOff && <p className="curve-view__note">{t('touchpadAccel.inactiveNote')}</p>}
          <RowGroup title={t('curveView.speeds', 'Speed range')}>
            {speedRow('min', t('accelCurve.minSpeed'), t('curveView.minSpeedHint', 'At or below this the minimum applies'), own.minThreshold)}
            {speedRow('max', t('accelCurve.maxSpeed'), inherits
              ? t('curveView.maxSpeedBorrowedHint', 'Where the borrowed shape tops out')
              : curveType === 'NATURAL' || curveType === 'POWER' || curveType === 'SIGMOID'
              ? t('curveView.maxSpeedUnusedHint', 'Unused here unless the other input borrows it')
              : curveType === 'QUADRATIC' || curveType === 'JUMP'
                ? t('curveView.maxSpeedFromMinHint', 'Counted from the slow speed')
                : t('curveView.maxSpeedHint', 'At or above this the maximum applies'), own.maxThreshold)}
          </RowGroup>
          {shapeRows && <RowGroup title={t('accelCurve.shapeParams')}>{shapeRows}</RowGroup>}
        </>
      )}
      <RowGroup title={t('curveView.graph', 'Graph')}>
        <SummaryRow size="sheet" label={t('curveView.range', 'Speeds shown')} hint={t('curveView.rangeHint', 'Fit keeps the bend in view')}
          adjust={{ kind: 'choice', value: range, options: [{ value: 'fit', label: t('curveView.rangeFit', 'Fit the curve') }, { value: 'wide', label: `${t('curveView.rangeWide', 'Full range')} · ${fmtSpeed(model.wideRange)}` }], onChange: value => setRange(value as 'fit' | 'wide') }} />
      </RowGroup>
    </>
  )

  const sides: CurveSide[] = ['gyro', 'touchpad']
  const summary = isStatic
    ? `${model.name}: static sensitivity ${fmtOut(staticSens)}`
    : `${model.name} ${t(`sensitivity.curves.${curveType.toLowerCase()}`)} curve from ${fmtOut(minOut)} at ${fmtSpeed(own.minThreshold)} to ${fmtOut(maxOut)}`

  return createPortal(
    <div className="modal-overlay curve-view-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="curve-view" role="dialog" aria-modal="true" aria-labelledby="curve-view-title" data-side={side}>
        <button type="button" className="sheet__close" tabIndex={-1} data-nav-skip data-modal-close aria-label={t('common.close', 'Close')} onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
        <header className="curve-view__header">
          <div className="curve-view__title">
            <span className="eyebrow">{configName}{side === 'gyro' && gyro.view === 'modeshift' && gyro.shiftButton ? ` · ${t('gyroPage.shiftViewShifted')} · ${shiftName}` : ''}</span>
            <b id="curve-view-title">{t('curveView.title', 'Acceleration curve')}</b>
          </div>
          <div className="curve-view__chips" role="tablist" aria-label={t('curveView.inputs', 'Input')}>
            <ButtonGlyph button="LB" size={22} />
            {sides.map(key => (
              <button key={key} type="button" role="tab" aria-selected={key === side} className="menus-chip" data-state={key === side ? 'selected' : undefined}
                data-nav-entry-skip="" tabIndex={key === side ? 0 : -1} onClick={() => onSideChange(key)} data-hints="A:Select;B:Done">
                <b>{models[key].name}</b>
                <span>{inheritsCurveShape(key, link) ? t('curveView.borrowed', 'borrowed shape') : key === 'gyro' && gyro.mode === 'static' ? t('gyroPage.modeStatic') : t(`sensitivity.curves.${normalizeAccelCurveType(models[key].shape.curve).toLowerCase()}`)}</span>
              </button>
            ))}
            <ButtonGlyph button="RB" size={22} />
          </div>
        </header>

        <div className="curve-view__body">
          <div className="curve-view__plot-col">
            <div className="curve-view__legend" aria-hidden="true">
              <span><i className="curve-view__key" data-key="curve" />{outputName}{splitAxes ? ' (X)' : ''}</span>
              {splitAxes && <span><i className="curve-view__key" data-key="secondary" />{outputName} (Y)</span>}
              <span><i className="curve-view__key" data-key="output" />{t('curveView.outputSpeed', 'Output speed, scaled to fit')}</span>
              <span><i className="curve-view__key" data-key="live" />{t('curveView.live', 'Live')}</span>
            </div>
            <CurvePlot params={params} secondary={secondary} unit={model.unit} formatOutput={fmtOut}
              xMax={xMax} liveSpeed={live} trail={recent} levels={levels} handles={handles} markers={markers} disabled={disabled} ariaLabel={summary} />
            <div className="curve-view__readout" aria-live="off">
              <span>{side === 'gyro' ? t('curveView.liveGyro', 'Turning now') : t('curveView.liveTrackpad', 'Finger now')} <strong>{live === null ? '—' : fmtSpeed(Number(live.toFixed(live >= 100 ? 0 : 1)))}</strong></span>
              <span>{outputName} {t('curveView.atThatSpeed', 'at that speed')} <strong>{live === null ? '—' : fmtOut(accelSensitivityAt(live, params))}</strong></span>
              <span>{t('curveView.peak', 'Fastest in the last 3 s')} <strong>{fmtSpeed(Number(peak.toFixed(peak >= 100 ? 0 : 1)))}</strong></span>
            </div>
            <p className="curve-view__hint">{t('curveView.dragHint', 'Drag the points on the curve, or adjust the rows. The curve shows each change at once; the controller follows it after Save.')}</p>
          </div>

          <div className="curve-view__panel" data-nav-region="curve-rows">
            <SettingPrefix prefix={side === 'gyro' && gyro.view === 'modeshift' && gyro.shiftButton ? `${gyro.shiftButton},` : ''}>
              {rows}
            </SettingPrefix>
            <div className="menus-view__spacer" />
            <footer className="sheet__footer" aria-label="Controls">
              <span className="sheet__hint"><ButtonGlyph button="A" size={24} />{t('curveView.footerAdjust', 'Adjust')}</span>
              <span className="sheet__hint"><ButtonGlyph button="Y" size={24} />{t('curveView.footerDefault', 'Default')}</span>
              <span className="sheet__hint"><ButtonGlyph button="LB" size={24} /><ButtonGlyph button="RB" size={24} />{t('curveView.footerSides', 'Input')}</span>
              <span className="sheet__hint"><ButtonGlyph button="B" size={24} />{t('curveView.footerDone', 'Done')}</span>
            </footer>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

