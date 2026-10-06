import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { accelSensitivityAt, type AccelCurveParams } from '../utils/accelCurve'
import { niceCeil, niceStep } from '../utils/niceNumbers'

// The curve editor's graph (TODO-40): the acceleration curve drawn at the size
// of the space it is given, in SVG so its text stays 11px at any size and its
// colours follow the theme through CSS. What it adds over SensitivityGraph is
// that it can be edited: each handle is a setting (or two) the pointer moves,
// and the live input speed shows where the hand is on the curve right now,
// with the last few seconds of speeds as ticks along the bottom so the speed
// range can be set against how the hand actually moves.

export type CurveHandle = {
  id: string
  /** Named beside the handle while it is hovered or dragged. */
  label: string
  speed: number
  sens: number
  /** A threshold slides, an output lifts, a corner does both. */
  axis: 'x' | 'y' | 'xy'
  onDrag: (speed: number, sens: number) => void
}

export type CurveMarker = { speed: number; label: string }

type CurvePlotProps = {
  params: AccelCurveParams
  /** The vertical axis's outputs when they differ from the horizontal's (gyro Y). */
  secondary?: { minSens: number; maxSens: number; steadying?: AccelCurveParams['steadying'] } | null
  unit: string
  formatOutput: (value: number) => string
  /** The right edge of the speed axis. */
  xMax: number
  liveSpeed?: number | null
  /** Recent live speeds, oldest first, as ticks along the bottom. */
  trail?: { age: number; speed: number }[]
  handles: CurveHandle[]
  markers: CurveMarker[]
  /** Outputs to draw as levels across the frame (an eased curve's maximum). */
  levels?: { sens: number; label: string }[]
  disabled?: boolean
  ariaLabel: string
  /** A drag began or ended, for the view to hold its layout still meanwhile. */
  onDragChange?: (dragging: boolean) => void
}

const MARGIN = { top: 34, right: 20, bottom: 40, left: 52 }
/** How long a trail tick stays, fading. */
export const TRAIL_MS = 3000

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

// As many decimals as the step has (2.5 needs one), so ticks never round.
const tickText = (value: number, step: number) => {
  const decimals = (String(Number(step.toPrecision(6))).split('.')[1] ?? '').length
  return value.toFixed(Math.min(4, decimals))
}

export function CurvePlot({ params, secondary, unit, formatOutput, xMax, liveSpeed, trail = [], handles, markers, levels = [], disabled, ariaLabel, onDragChange }: CurvePlotProps) {
  const host = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const node = host.current
    if (!node) return
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    measure()
    return () => observer.disconnect()
  }, [])

  // The output axis leaves headroom over the highest output, so the curve
  // never runs along the frame.
  const topOutput = Math.max(params.minSens, params.maxSens, secondary?.minSens ?? 0, secondary?.maxSens ?? 0)
  const fitted = { x: Math.max(xMax, 1e-3), y: niceCeil(Math.max(topOutput * 1.12, 0.5), 5) }

  // While a handle is held the axes stay where they were: they are fitted to
  // the curve, and refitting under the pointer would move the handle away
  // from it, which moves the value, which refits the axes again.
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const domain = drag ? { x: drag.x, y: drag.y } : fitted
  const [hover, setHover] = useState<number | null>(null)

  const latestHandles = useRef(handles)
  latestHandles.current = handles

  const plotW = Math.max(0, size.width - MARGIN.left - MARGIN.right)
  const plotH = Math.max(0, size.height - MARGIN.top - MARGIN.bottom)
  const toX = (speed: number) => MARGIN.left + (clamp(speed, 0, domain.x) / domain.x) * plotW
  const toY = (sens: number) => MARGIN.top + plotH - (clamp(sens, 0, domain.y) / domain.y) * plotH
  const fromPointer = (event: { clientX: number; clientY: number }) => {
    const box = svg.current?.getBoundingClientRect()
    if (!box || plotW <= 0 || plotH <= 0) return null
    return {
      speed: clamp(((event.clientX - box.left - MARGIN.left) / plotW) * domain.x, 0, domain.x),
      sens: clamp(((MARGIN.top + plotH - (event.clientY - box.top)) / plotH) * domain.y, 0, domain.y),
    }
  }

  const beginDrag = (handle: CurveHandle) => (event: ReactPointerEvent) => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    svg.current?.setPointerCapture(event.pointerId)
    setDrag({ id: handle.id, x: domain.x, y: domain.y })
    setHover(null)
    onDragChange?.(true)
  }
  const endDrag = () => {
    if (!drag) return
    setDrag(null)
    onDragChange?.(false)
  }
  const onPointerMove = (event: ReactPointerEvent) => {
    const point = fromPointer(event)
    if (!point) return
    if (drag) {
      const handle = latestHandles.current.find(candidate => candidate.id === drag.id)
      if (handle) handle.onDrag(handle.axis === 'y' ? handle.speed : point.speed, handle.axis === 'x' ? handle.sens : point.sens)
      return
    }
    const box = svg.current!.getBoundingClientRect()
    const x = event.clientX - box.left
    setHover(x >= MARGIN.left && x <= MARGIN.left + plotW ? point.speed : null)
  }

  // A level handle (an output alone) sits near the right edge of the axis shown.
  const handleSpeed = (handle: CurveHandle) => (handle.axis === 'y' ? Math.min(handle.speed, domain.x * 0.94) : handle.speed)

  const ready = size.width > 0 && size.height > 0 && plotW > 20 && plotH > 20
  const samples = Math.round(clamp(plotW / 2, 120, 480))
  const at = (speed: number, p: AccelCurveParams = params) => accelSensitivityAt(speed, p)
  const trace = (sens: (speed: number) => number) => {
    let d = ''
    for (let i = 0; i <= samples; i++) {
      const speed = (domain.x * i) / samples
      d += `${i === 0 ? 'M' : 'L'}${toX(speed).toFixed(1)},${toY(sens(speed)).toFixed(1)}`
    }
    return d
  }

  let body = null
  if (ready) {
    const xStep = niceStep(domain.x, Math.max(3, Math.min(10, Math.floor(plotW / 90))))
    const yStep = niceStep(domain.y, Math.max(3, Math.min(8, Math.floor(plotH / 56))))
    const xTicks: number[] = []
    for (let v = 0; v <= domain.x + xStep * 1e-6; v += xStep) xTicks.push(v)
    const yTicks: number[] = []
    for (let v = 0; v <= domain.y + yStep * 1e-6; v += yStep) yTicks.push(v)

    const curve = trace(speed => at(speed))
    const baseline = toY(0)
    const area = `${curve}L${toX(domain.x).toFixed(1)},${baseline}L${toX(0).toFixed(1)},${baseline}Z`
    const secondaryCurve = secondary ? trace(speed => at(speed, { ...params, ...secondary })) : null

    // Output speed (input speed times the curve's output), scaled to the
    // frame: its shape says whether turning faster ever moves the aim less.
    const outputs = Array.from({ length: samples + 1 }, (_, i) => { const speed = (domain.x * i) / samples; return speed * at(speed) })
    const topOut = Math.max(...outputs, 1e-9)
    const output = outputs.map((value, i) => `${i === 0 ? 'M' : 'L'}${toX((domain.x * i) / samples).toFixed(1)},${toY((value / topOut) * domain.y).toFixed(1)}`).join('')

    const live = typeof liveSpeed === 'number' && Number.isFinite(liveSpeed) ? liveSpeed : null
    const liveOff = live !== null && live > domain.x

    const bubble = (x: number, y: number, text: string, tone: 'live' | 'hover' | 'handle') => {
      const width = text.length * 6.7 + 16
      const left = x + 12 + width > MARGIN.left + plotW ? x - 12 - width : x + 12
      const top = clamp(y - 30, MARGIN.top - 26, MARGIN.top + plotH - 24)
      return (
        <g className="curve-plot__bubble" data-tone={tone} pointerEvents="none">
          <rect x={left} y={top} width={width} height={22} rx={6} />
          <text x={left + 8} y={top + 15}>{text}</text>
        </g>
      )
    }
    // Marker captions sit above the frame; one too close to the last drops a line.
    const placedMarkers = markers
      .filter(marker => marker.speed >= 0 && marker.speed <= domain.x)
      .sort((a, b) => a.speed - b.speed)
      .map(marker => ({ ...marker, x: toX(marker.speed), y: MARGIN.top - 8 }))
    placedMarkers.forEach((marker, index) => {
      const previous = placedMarkers[index - 1]
      if (previous && marker.x - previous.x < 110 && previous.y === MARGIN.top - 8) marker.y = MARGIN.top - 21
    })
    const readout = (speed: number) => `${tickText(speed, speed >= 100 ? 1 : 0.1)} ${unit} → ${formatOutput(at(speed))}`
    const held = drag ? handles.find(handle => handle.id === drag.id) : undefined

    body = (
      <>
        <rect className="curve-plot__frame" x={MARGIN.left} y={MARGIN.top} width={plotW} height={plotH} rx={4} />
        <g className="curve-plot__grid">
          {yTicks.map(v => <line key={`y${v}`} x1={MARGIN.left} x2={MARGIN.left + plotW} y1={toY(v)} y2={toY(v)} />)}
          {xTicks.map(v => <line key={`x${v}`} x1={toX(v)} x2={toX(v)} y1={MARGIN.top} y2={MARGIN.top + plotH} />)}
        </g>
        <g className="curve-plot__ticks">
          {yTicks.map(v => <text key={`y${v}`} x={MARGIN.left - 8} y={toY(v) + 4} textAnchor="end">{tickText(v, yStep)}</text>)}
          {xTicks.map(v => <text key={`x${v}`} x={toX(v)} y={MARGIN.top + plotH + 18} textAnchor="middle">{tickText(v, xStep)}</text>)}
          <text className="curve-plot__axis-name" x={MARGIN.left + plotW} y={MARGIN.top + plotH + 34} textAnchor="end">{unit}</text>
        </g>

        {placedMarkers.map(marker => (
          <g key={marker.label} className="curve-plot__marker">
            <line x1={marker.x} x2={marker.x} y1={MARGIN.top} y2={MARGIN.top + plotH} />
            <text x={marker.x} y={marker.y} textAnchor={marker.x > MARGIN.left + plotW - 60 ? 'end' : marker.x < MARGIN.left + 60 ? 'start' : 'middle'}>{marker.label}</text>
          </g>
        ))}

        {levels.filter(level => level.sens <= domain.y).map(level => (
          <g key={level.label} className="curve-plot__level">
            <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={toY(level.sens)} y2={toY(level.sens)} />
            <text x={MARGIN.left + 8} y={toY(level.sens) - 6}>{level.label}</text>
          </g>
        ))}
        <path className="curve-plot__area" d={area} />
        <path className="curve-plot__output" d={output} />
        {secondaryCurve && <path className="curve-plot__secondary" d={secondaryCurve} />}
        <path className="curve-plot__curve" d={curve} data-curve={params.curveType} />

        {trail.map((entry, index) => (
          <line key={index} className="curve-plot__rug" x1={toX(entry.speed)} x2={toX(entry.speed)} y1={MARGIN.top + plotH - 10} y2={MARGIN.top + plotH}
            opacity={0.12 + 0.5 * (1 - entry.age / TRAIL_MS)} />
        ))}

        {live !== null && !drag && (
          <g className="curve-plot__live" data-off-scale={liveOff ? 'true' : undefined}>
            <line x1={toX(live)} x2={toX(live)} y1={MARGIN.top} y2={MARGIN.top + plotH} />
            <circle cx={toX(live)} cy={toY(at(live))} r={5} />
          </g>
        )}

        {hover !== null && !drag && (
          <g className="curve-plot__hover" pointerEvents="none">
            <line x1={toX(hover)} x2={toX(hover)} y1={MARGIN.top} y2={MARGIN.top + plotH} />
            <circle cx={toX(hover)} cy={toY(at(hover))} r={4} />
          </g>
        )}

        {!disabled && handles.map(handle => (
          <g key={handle.id} className="curve-plot__handle" data-axis={handle.axis} data-handle={handle.id} data-state={drag?.id === handle.id ? 'held' : undefined}
            transform={`translate(${toX(handleSpeed(handle)).toFixed(1)},${toY(handle.sens).toFixed(1)})`} onPointerDown={beginDrag(handle)}>
            <circle className="curve-plot__handle-hit" r={14} />
            <circle className="curve-plot__handle-dot" r={7} />
            <title>{handle.label}</title>
          </g>
        ))}

        {held && bubble(toX(handleSpeed(held)), toY(held.sens), held.axis === 'y' ? `${held.label} · ${formatOutput(held.sens)}` : `${held.label} · ${readout(held.speed)}`, 'handle')}
        {!held && hover !== null && bubble(toX(hover), toY(at(hover)), readout(hover), 'hover')}
        {!held && hover === null && live !== null && bubble(toX(live), toY(at(live)), `${liveOff ? '› ' : ''}Now ${readout(live)}`, 'live')}
      </>
    )
  }

  return (
    <div ref={host} className="curve-plot" data-dragging={drag ? 'true' : undefined}>
      <svg ref={svg} width={size.width} height={size.height} viewBox={`0 0 ${size.width || 1} ${size.height || 1}`} role="img" aria-label={ariaLabel}
        onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
        onPointerLeave={() => { if (!drag) setHover(null) }}>
        {body}
      </svg>
    </div>
  )
}

/** The curve in miniature, for a row that opens the editor. */
export function CurveSparkline({ params, xMax, width = 96, height = 32 }: { params: AccelCurveParams; xMax: number; width?: number; height?: number }) {
  const top = Math.max(params.minSens, params.maxSens, 1e-6) * 1.15
  const pad = 4
  let d = ''
  for (let i = 0; i <= 48; i++) {
    const speed = (xMax * i) / 48
    const x = pad + ((width - pad * 2) * i) / 48
    const y = height - pad - ((height - pad * 2) * accelSensitivityAt(speed, params)) / top
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }
  return <svg className="curve-entry__spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><path d={d} /></svg>
}
