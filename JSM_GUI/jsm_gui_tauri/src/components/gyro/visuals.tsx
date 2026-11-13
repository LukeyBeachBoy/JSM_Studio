import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { accelCurveSettleSpeed, accelSensitivityAt, type AccelCurveParams } from '../../utils/accelCurve'
import { niceCeil } from '../../utils/niceNumbers'
import { SteadyingModel, type SteadyingSettings } from '../../utils/gyroSteadiness'
import { STEAM_BACK_ART, STEAM_FRONT_ART } from '../controllerArt'
import type { TelemetrySample } from '../../hooks/useTelemetry'
import styles from './Gyro.module.css'

// The live visuals of the console v2 Gyro screens (Gyro*.dc.html), flat per
// design/console-v2/STYLE-FLAT.md: 2px strokes, the accent for what is in
// force, #808c99 dashes for alternatives, --telemetry for anything live, the
// app's own controller art. Response graphs use the edited settings; live
// signals use selected-controller telemetry. Example motions are labeled.

const fmt = (value: number, digits = 1) => String(Number(value.toFixed(digits)))

/** The controller's turning speed now, °/s (telemetry omega). */
export const liveOmega = (sample: TelemetrySample | null) => {
  const value = sample?.devices?.[0]?.status?.motion?.omega ?? sample?.omega
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The first device's raw gyro, °/s. */
export const liveGyro = (sample: TelemetrySample | null) => sample?.devices?.[0]?.status?.gyro ?? null

/** The last `ms` of a live value, sampled at most every 30 ms. */
export function useHistory(value: number | null, ms = 2000, source?: number) {
  const history = useRef<{ at: number; value: number }[]>([])
  const previousSource = useRef(source)
  if (previousSource.current !== source || value === null) history.current = []
  previousSource.current = source
  const now = performance.now()
  if (value !== null) {
    const last = history.current[history.current.length - 1]
    if (!last || now - last.at >= 30) history.current.push({ at: now, value })
  }
  while (history.current.length && now - history.current[0].at > ms) history.current.shift()
  return history.current
}

/**
 * Degrees turned since this mounted (or since reset), integrated from the
 * gyro's yaw. Telemetry arrives once a frame; the time between frames is the
 * integration step.
 */
export function useTurned(sample: TelemetrySample | null, axis: 'x' | 'y' | 'z' = 'y') {
  const [degrees, setDegrees] = useState(0)
  const last = useRef<number | null>(null)
  const source = sample?.devices?.[0]?.handle
  const previousSource = useRef(source)
  const gyro = liveGyro(sample)
  const timestamp = sample?.devices?.[0]?.status?.motion?.timestampMs ?? sample?.ts
  useEffect(() => {
    if (!gyro || previousSource.current !== source) {
      previousSource.current = source
      last.current = null
      setDegrees(0)
    }
    const now = timestamp ?? performance.now()
    if (gyro && last.current !== null && now > last.current) {
      const dt = (now - last.current) / 1000
      // Do not integrate across a disconnect, suspended view or missing packet.
      if (dt <= 0.1) setDegrees(value => value + (gyro[axis] ?? 0) * dt)
    }
    last.current = gyro ? now : null
  }, [gyro, axis, source, timestamp])
  return { degrees, reset: () => { last.current = null; setDegrees(0) } }
}

/** Replay the selected controller's recent mapped samples through the current
 * smoothing settings. Replaying lets a settings edit redraw immediately;
 * this is a sampled preview, not the native output or a synthetic hand. */
export function useLiveSweep(sample: TelemetrySample | null, settings: SteadyingSettings) {
  const history = useRef<{ at: number; x: number; y: number }[]>([])
  const source = sample?.devices?.[0]?.handle
  const previousSource = useRef(source)
  const motion = sample?.devices?.[0]?.status?.motion
  if (source !== previousSource.current || !motion) history.current = []
  previousSource.current = source
  if (!motion) return null
  const last = history.current[history.current.length - 1]
  if (last && (motion.timestampMs < last.at || motion.timestampMs - last.at > 250)) history.current = []
  if (!last || motion.timestampMs !== last.at) history.current.push({ at: motion.timestampMs, ...motion.input })
  history.current = history.current.filter(entry => motion.timestampMs - entry.at <= 2000)
  const frames = history.current
  const model = new SteadyingModel({ ...settings, cutoff: 0, recovery: 0 })
  const raw: [number, number][] = [[0, 0]], out: [number, number][] = [[0, 0]]
  let frame = 0, rx = 0, ry = 0, ox = 0, oy = 0
  const start = frames[0]?.at ?? motion.timestampMs
  for (let at = start; at <= motion.timestampMs; at += settings.tickMs) {
    while (frame + 1 < frames.length && frames[frame + 1].at <= at) frame++
    const input = frames[frame]
    if (!input) break
    const [x, y] = model.step(input.x, input.y)
    const dt = settings.tickMs / 1000
    rx += input.x * dt; ry += input.y * dt; ox += x * dt; oy += y * dt
    raw.push([rx, ry]); out.push([ox, oy])
  }
  return { raw, out }
}

// ---- Graph frame.
type Frame = { w: number; h: number; left: number; right: number; top: number; bottom: number }
const FRAME: Frame = { w: 420, h: 250, left: 36, right: 12, top: 14, bottom: 34 }
const px = (f: Frame, x: number, xMax: number) => f.left + (x / xMax) * (f.w - f.left - f.right)
const py = (f: Frame, y: number, yMax: number) => f.h - f.bottom - (y / yMax) * (f.h - f.top - f.bottom)

function Axes({ f, xLabel, yLabel, xTicks }: { f: Frame; xLabel: string; yLabel: string; xTicks?: { at: number; label: string }[] }) {
  return <g className={styles.axes}>
    <path d={`M${f.left} ${f.top} V${f.h - f.bottom} H${f.w - f.right}`} />
    {xTicks?.map(tick => <text key={tick.label} x={tick.at} y={f.h - f.bottom + 14} textAnchor={tick.at >= f.w - f.right ? 'end' : tick.at <= f.left ? 'start' : 'middle'}>{tick.label}</text>)}
    <text x={(f.left + f.w - f.right) / 2} y={f.h - 4} textAnchor="middle">{xLabel}</text>
    <text x={10} y={(f.top + f.h - f.bottom) / 2} transform={`rotate(-90 10 ${(f.top + f.h - f.bottom) / 2})`} textAnchor="middle">{yLabel}</text>
  </g>
}

const pathOf = (points: [number, number][]) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')

/** Speed: aim speed against turning speed, the current curve and the ones to compare. */
export function SpeedResponse({ params, compare = [], live, caption }: {
  params: AccelCurveParams; compare?: { label: string; params: AccelCurveParams }[]; live: number | null; caption?: string
}) {
  const all = [params, ...compare.map(item => item.params)]
  const xMax = niceCeil(Math.max(120, ...all.map(p => accelCurveSettleSpeed(p) * 1.1), params.steadying?.recovery ?? 0))
  const yMax = Math.max(0.5, ...all.map(p => Math.max(p.minSens, p.maxSens))) * 1.25
  const line = (p: AccelCurveParams) => pathOf(Array.from({ length: 61 }, (_, i) => { const s = (xMax * i) / 60; return [px(FRAME, s, xMax), py(FRAME, accelSensitivityAt(s, p), yMax)] }))
  const liveSpeed = live === null ? null : Math.min(xMax, live)
  return <svg className={styles.graph} viewBox={`0 0 ${FRAME.w} ${FRAME.h}`} role="img" aria-label={`${caption ?? 'How your aim responds'}${live === null ? '' : `. Live: ${fmt(live)} degrees per second, ${fmt(accelSensitivityAt(live, params), 2)} RWS`}.
    Controller rotation speed from 0 to ${fmt(xMax)} degrees per second; sensitivity from 0 to ${fmt(yMax, 2)} RWS.`}>
    <Axes f={FRAME} xLabel="Controller rotation speed →" yLabel="Sensitivity (RWS) →" xTicks={[0, xMax / 3, xMax * 2 / 3, xMax].map(v => ({ at: px(FRAME, v, xMax), label: `${fmt(v)}${v === xMax ? ' °/s' : ''}` }))} />
    <path className={styles.area} d={`${line(params)}L${px(FRAME, xMax, xMax)},${py(FRAME, 0, yMax)}L${px(FRAME, 0, xMax)},${py(FRAME, 0, yMax)}Z`} />
    {compare.map(item => <g key={item.label}>
      <path className={styles.alt} d={line(item.params)} />
      <text className={styles.altLabel} x={FRAME.w - FRAME.right - 4} y={py(FRAME, accelSensitivityAt(xMax, item.params), yMax) - 6} textAnchor="end">{item.label}</text>
    </g>)}
    <path className={styles.curve} d={line(params)} />
    <text className={styles.curveLabel} x={FRAME.left + 8} y={py(FRAME, accelSensitivityAt(0, params), yMax) - 8}>{caption}</text>
    {liveSpeed !== null && <circle className={styles.liveDot} data-live-speed={live} cx={px(FRAME, liveSpeed, xMax)} cy={py(FRAME, accelSensitivityAt(live!, params), yMax)} r={5}><title>{fmt(live!)} °/s · {fmt(accelSensitivityAt(live!, params), 2)} RWS{live! > xMax ? ' · beyond chart range' : ''}</title></circle>}
  </svg>
}

/** A short live line of a value over the last 2 s (the front's "live · 19 °/s"). */
export function LiveTrace({ history, max = 60, label }: { history: { at: number; value: number }[]; max?: number; label: ReactNode }) {
  const now = performance.now()
  const w = 360, h = 70
  const ceiling = niceCeil(Math.max(max, ...history.map(entry => entry.value)))
  const points: [number, number][] = history.map(entry => [w - ((now - entry.at) / 2000) * w, h - 8 - (entry.value / ceiling) * (h - 16)])
  return <div className={styles.trace}>
    <span className={styles.traceLabel}>{label}</span>
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Rotation speed, last 2 seconds, 0 to ${ceiling} degrees per second`} data-max={ceiling}>{points.length > 1 && <path d={pathOf(points)} />}</svg>
  </div>
}

/** A fraction against speed (Ignore jitter / Smoothing / Adaptive filter graphs). */
export function FractionGraph({ curves, xMax, live, yLabel, marks = [], bands = [], xLabel = 'Controller rotation speed →', unit = '°/s' }: {
  curves: { label?: string; fn: (speed: number) => number; tone?: 'main' | 'alt' }[]
  xMax: number; live: number | null; yLabel: string
  marks?: { at: number; label: string }[]
  bands?: { from: number; to: number; label: string }[]
  xLabel?: string; unit?: string
}) {
  const main = curves.find(curve => curve.tone !== 'alt') ?? curves[0]
  const line = (fn: (speed: number) => number) => pathOf(Array.from({ length: 81 }, (_, i) => { const s = (xMax * i) / 80; return [px(FRAME, s, xMax), py(FRAME, fn(s), 1.1)] }))
  return <svg className={styles.graph} viewBox={`0 0 ${FRAME.w} ${FRAME.h}`} role="img" aria-label={`${yLabel}. ${xLabel}, 0 to ${fmt(xMax)} ${unit}.${live === null ? '' : ` Live: ${fmt(live)} ${unit}, ${fmt(main.fn(live) * 100)}%.`}`}>
    <Axes f={FRAME} xLabel={xLabel} yLabel={yLabel} xTicks={[{ at: px(FRAME, 0, xMax), label: '0' }, { at: px(FRAME, xMax, xMax), label: `${fmt(xMax)} ${unit}` }]} />
    {bands.map((band, index) => <text key={band.label} className={styles.bandLabel} x={Math.max(band.label.length * 3, Math.min(FRAME.w - band.label.length * 3, (px(FRAME, band.from, xMax) + px(FRAME, band.to, xMax)) / 2))} y={FRAME.top + 14 + (index % 2) * 14} textAnchor="middle">{band.label}</text>)}
    {marks.map(mark => <g key={mark.label}>
      <path className={styles.mark} d={`M${px(FRAME, mark.at, xMax)} ${FRAME.top} V${FRAME.h - FRAME.bottom}`} />
      <text className={styles.markLabel} x={px(FRAME, mark.at, xMax)} y={FRAME.h - FRAME.bottom - 6} textAnchor="middle">{mark.label}</text>
    </g>)}
    <path className={styles.area} d={`${line(main.fn)}L${px(FRAME, xMax, xMax)},${py(FRAME, 0, 1.1)}L${px(FRAME, 0, xMax)},${py(FRAME, 0, 1.1)}Z`} />
    {curves.map((curve, index) => <g key={index}>
      <path className={curve.tone === 'alt' ? styles.alt : styles.curve} d={line(curve.fn)} />
      {curve.label && <text className={curve.tone === 'alt' ? styles.altLabel : styles.curveLabel} x={px(FRAME, xMax * (curve.tone === 'alt' ? 0.75 : 0.5), xMax)} y={py(FRAME, curve.fn(xMax * (curve.tone === 'alt' ? 0.75 : 0.5)), 1.1) - 8} textAnchor="middle">{curve.label}</text>}
    </g>)}
    {live !== null && <circle className={styles.liveDot} data-live-value={live} cx={px(FRAME, Math.min(xMax, live), xMax)} cy={py(FRAME, main.fn(live), 1.1)} r={5}><title>{fmt(live)} {unit}{live > xMax ? ' · beyond chart range' : ''}</title></circle>}
  </svg>
}

/** Smooth › Adaptive › Jitter › Snap/brake, each stage with its status. */
export function PipelineStrip({ stages, current, caption }: { stages: { id: string; label: string; status: string }[]; current: string; caption?: ReactNode }) {
  return <div className={styles.pipeline}>
    <ol>{stages.map((stage, index) => <li key={stage.id} data-current={stage.id === current ? 'true' : undefined}>
      {index > 0 && <span className={styles.pipeArrow} aria-hidden="true">›</span>}
      <b>{stage.label}</b><span>{stage.status}</span>
    </li>)}</ol>
    {caption && <p>{caption}</p>}
  </div>
}

/** Raw vs steadied aim on a slow sweep onto a target (GyroSteadiness). */
export function SteadySweep({ raw, out, label, live = false }: { raw: [number, number][]; out: [number, number][]; label: string; live?: boolean }) {
  const all = [...raw, ...out]
  const minX = Math.min(...all.map(p => p[0])), maxX = Math.max(...all.map(p => p[0]))
  const minY = Math.min(...all.map(p => p[1])), maxY = Math.max(...all.map(p => p[1]))
  const w = 420, h = 250, pad = 44
  const scale = Math.min((w - pad * 2) / Math.max(1e-3, maxX - minX), (h - pad * 2 - 20) / Math.max(1e-3, maxY - minY))
  const map = ([x, y]: [number, number]): [number, number] => [pad + (x - minX) * scale, h - pad - 20 - (y - minY) * scale]
  const end = map(out[out.length - 1] ?? [0, 0])
  return <figure className={styles.sweep}>
    <svg className={styles.graph} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${live ? 'Recent controller motion' : 'Simulated sweep'}, raw and ${label}`} data-live-sweep={live}>
      {!live && <><circle className={styles.target} cx={end[0]} cy={end[1]} r={16} />
      <path className={styles.target} d={`M${end[0] - 24} ${end[1]} H${end[0] + 24} M${end[0]} ${end[1] - 24} V${end[1] + 24}`} />
      <text className={styles.markLabel} x={end[0]} y={end[1] - 30} textAnchor="middle">Target</text></>}
      <path className={styles.raw} d={pathOf(raw.map(map))} />
      <path className={styles.curve} d={pathOf(out.map(map))} />
      <text className={styles.markLabel} x={pad} y={h - 8}>{live ? 'Recent motion · last 2 s' : 'Simulated slow sweep · 2 s'}</text>
    </svg>
    <figcaption className={styles.legend}><span><i data-key="raw" />{live ? 'Before smoothing' : 'Simulated input'}</span><span><i data-key="curve" />{label}</span></figcaption>
  </figure>
}

/** Small number tiles under a visual. */
export function StatTiles({ tiles }: { tiles: { label: string; value: ReactNode; tone?: 'good' }[] }) {
  return <dl className={styles.tiles}>{tiles.map(tile => <div key={tile.label}><dt>{tile.label}</dt><dd data-tone={tile.tone}>{tile.value}</dd></div>)}</dl>
}

/** The Steam Controller as the app draws it (front, 1117×750), with optional overlay. */
export function ControllerArt({ back, children, className, label }: { back?: boolean; children?: ReactNode; className?: string; label: string }) {
  const art = back ? STEAM_BACK_ART : STEAM_FRONT_ART
  return <svg className={`${styles.art} ${className ?? ''}`} viewBox={back ? '0 0 428 319' : '0 0 1117 750'} role="img" aria-label={label}>
    <g dangerouslySetInnerHTML={{ __html: art }} />
    {children}
  </svg>
}

/** Which rotation moves aim which way (GyroDirection, DirectionAdvanced). */
export function RotationDiagram({ turn, tilt, lean, live }: { turn: string; tilt: string; lean: string; live?: { x: number; y: number; z: number } | null }) {
  const glow = (value: number) => Math.min(1, Math.abs(value) / 60)
  return <div className={styles.rotation}>
    <ControllerArt label="Steam Controller, which way each rotation aims">
      <ellipse className={styles.rotArrow} cx={558} cy={70} rx={280} ry={34} style={{ opacity: 0.45 + 0.55 * glow(live?.y ?? 0) }} />
      <path className={styles.rotArrow} d="M1060 520 C1100 420 1100 300 1060 200" style={{ opacity: 0.45 + 0.55 * glow(live?.x ?? 0) }} />
      <path className={styles.rotArrowAlt} d="M380 700 C480 740 640 740 740 700" style={{ opacity: 0.45 + 0.55 * glow(live?.z ?? 0) }} />
    </ControllerArt>
    <span className={styles.rotTurn}>{turn}</span>
    <span className={styles.rotTilt}>{tilt}</span>
    <span className={styles.rotLean}>{lean}</span>
  </div>
}

/** Rumble: a dial notched every `interval` degrees, the needle at how far you have turned. */
export function RumbleDial({ interval, turned, off, label }: { interval: number; turned: number; off: boolean; label: string }) {
  const cx = 210, cy = 200, r = 150
  const span = 240
  const step = Math.max(1, interval)
  const notches = Math.min(72, Math.floor(span / step))
  const needle = ((turned % span) + span) % span
  const at = (deg: number, radius: number) => { const a = ((-210 + deg) * Math.PI) / 180; return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)] }
  const [nx, ny] = at(needle, r - 18)
  return <svg className={styles.graph} viewBox="0 0 420 260" role="img" aria-label={label}>
    <path className={styles.dialTrack} d={`M${at(0, r).join(' ')} A${r} ${r} 0 1 1 ${at(span, r).join(' ')}`} />
    {Array.from({ length: notches + 1 }, (_, i) => { const [x1, y1] = at(i * step, r - 8); const [x2, y2] = at(i * step, r + 8); return <path key={i} className={off ? styles.alt : styles.notch} d={`M${x1} ${y1} L${x2} ${y2}`} /> })}
    <path className={styles.needle} d={`M${cx} ${cy} L${nx} ${ny}`} />
    <circle className={styles.hub} cx={cx} cy={cy} r={10} />
    <text className={styles.dialValue} x={cx + 60} y={cy - 10}>{fmt(interval)}°</text>
    <text className={styles.markLabel} x={cx + 60} y={cy + 12}>between clicks</text>
  </svg>
}

/** Snap: ±snap bands around level and straight up, with the live heading. */
export function SnapZones({ snap, heading }: { snap: number; heading: number | null }) {
  const cx = 210, cy = 125, r = 100
  const band = (center: number) => {
    const a1 = ((center - snap) * Math.PI) / 180, a2 = ((center + snap) * Math.PI) / 180
    return `M${cx} ${cy} L${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)} A${r} ${r} 0 0 0 ${cx + r * Math.cos(a2)} ${cy - r * Math.sin(a2)} Z`
  }
  const snapped = heading !== null && snap > 0 && [0, 90, 180, 270, 360].some(center => Math.abs(heading - center) <= snap)
  return <svg className={styles.graph} viewBox="0 0 420 250" role="img" aria-label={`±${snap}° around each straight line`}>
    <circle className={styles.dialTrack} cx={cx} cy={cy} r={r} />
    {snap > 0 && [0, 90, 180, 270].map(center => <path key={center} className={styles.band} d={band(center)} />)}
    <path className={styles.axes} d={`M${cx - r} ${cy} H${cx + r} M${cx} ${cy - r} V${cy + r}`} />
    {heading !== null && <path className={snapped ? styles.curve : styles.liveLine} d={`M${cx} ${cy} L${cx + r * Math.cos((heading * Math.PI) / 180)} ${cy - r * Math.sin((heading * Math.PI) / 180)}`} />}
    <text className={styles.markLabel} x={cx} y={240} textAnchor="middle">{snap > 0 ? `±${fmt(snap)}° around each straight line` : 'Snapping is off'}</text>
  </svg>
}

/** The end of a flick, brake off against brake at `strength`. */
export function BrakeIllustration({ strength }: { strength: number }) {
  const w = 420, h = 160
  // Aim position over time: a flick to the target, then the overshoot the
  // slowing hand adds, which the brake trims.
  const curve = (brake: number) => pathOf(Array.from({ length: 41 }, (_, i) => {
    const t = i / 40
    const rise = t < 0.45 ? (1 - Math.cos((t / 0.45) * Math.PI)) / 2 : 1
    const overshoot = t > 0.45 ? Math.sin(Math.min(1, (t - 0.45) / 0.4) * Math.PI) * 26 * (1 - brake) : 0
    return [20 + t * (w - 40), h - 30 - rise * 80 - overshoot]
  }))
  return <svg className={styles.graph} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="End of a flick">
    <path className={styles.axes} d={`M20 ${h - 30} H${w - 20}`} />
    <path className={styles.raw} d={curve(0)} />
    <path className={strength > 0 ? styles.curve : styles.alt} d={curve(strength > 0 ? strength : 0.5)} strokeDasharray={strength > 0 ? undefined : '6 6'} />
    <text className={styles.markLabel} x={w - 24} y={24} textAnchor="end">overshoot</text>
  </svg>
}

/** Update rate: one tick per read over the first ~33 ms. */
export function UpdateRateStrip({ tickMs, measuredHz }: { tickMs: number; measuredHz?: number | null }) {
  const count = Math.min(40, Math.max(2, Math.round(33 / Math.max(0.5, tickMs))))
  return <div className={styles.rate}>
    <header><b>Update rate</b><span>≈ {Math.round(1000 / Math.max(0.5, tickMs))} reads a second{measuredHz ? ` · telemetry ${Math.round(measuredHz)} Hz` : ''}</span></header>
    <svg viewBox="0 0 400 40" aria-hidden="true">{Array.from({ length: count }, (_, i) => <path key={i} d={`M${10 + (i * 380) / (count - 1)} 8 V32`} />)}</svg>
  </div>
}

/** Turn, then stop: what each stick behaviour sends (GyroStickSetup). */
export function StickTimeline({ deflection }: { deflection: boolean }) {
  const w = 380, h = 70
  const turn = pathOf(Array.from({ length: 41 }, (_, i) => { const t = i / 40; const v = t < 0.5 ? (1 - Math.cos((t / 0.5) * Math.PI)) / 2 : 1; return [10 + t * (w - 20), h - 10 - v * (h - 24)] }))
  const speed = pathOf(Array.from({ length: 41 }, (_, i) => { const t = i / 40; const v = t < 0.5 ? Math.sin((t / 0.5) * Math.PI) : 0; return [10 + t * (w - 20), h - 10 - v * (h - 24)] }))
  return <div className={styles.timeline}>
    <span>Your controller</span>
    <svg viewBox={`0 0 ${w} ${h}`} aria-label="Turned 30°, then still" role="img"><path className={styles.raw} d={turn} /><text className={styles.markLabel} x={w - 10} y={14} textAnchor="end">turned 30°, then still</text></svg>
    <span data-current={!deflection ? 'true' : undefined}>Camera speed · stick sent</span>
    <svg viewBox={`0 0 ${w} ${h}`} aria-label="Camera speed: back to centre" role="img"><path className={!deflection ? styles.curve : styles.alt} d={speed} /><text className={styles.markLabel} x={w - 10} y={h - 14} textAnchor="end">back to centre</text></svg>
    <span data-current={deflection ? 'true' : undefined}>Hold the angle · stick sent</span>
    <svg viewBox={`0 0 ${w} ${h}`} aria-label="Hold the angle: stays at full" role="img"><path className={deflection ? styles.curve : styles.alt} d={turn} /><text className={styles.markLabel} x={w - 10} y={14} textAnchor="end">stays at full</text></svg>
  </div>
}

/** The virtual stick's response with the deadzone fix, dashed without it, and the live dot. */
export function VirtualStickResponse({ curve, inner, live, label }: { curve: (x: number) => number; inner: number; live: { x: number; y: number } | null; label: string }) {
  const f = FRAME
  const line = (fn: (x: number) => number) => pathOf(Array.from({ length: 101 }, (_, i) => { const x = i / 100; return [px(f, x, 1), py(f, fn(x), 1.05)] }))
  const liveRadius = live ? Math.min(1, Math.hypot(live.x, live.y)) : null
  return <svg className={styles.graph} viewBox={`0 0 ${f.w} ${f.h}`} role="img" aria-label={`${label}${liveRadius === null ? '' : `. Measured output: ${Math.round(liveRadius * 100)}%. Requested input is not reported.`}`}>
    <Axes f={f} xLabel="Camera speed you ask for →" yLabel="Stick sent ↑" />
    {inner > 0 && <rect className={styles.deadzone} x={f.left} y={py(f, inner, 1.05)} width={f.w - f.left - f.right} height={py(f, 0, 1.05) - py(f, inner, 1.05)} />}
    {inner > 0 && <text className={styles.markLabel} x={f.w - f.right - 4} y={py(f, inner, 1.05) - 4} textAnchor="end">Game ignores the striped middle</text>}
    <path className={styles.alt} d={line(x => x)} />
    <path className={styles.curve} d={line(curve)} />
    {inner > 0 && <text className={styles.curveLabel} x={f.left + 6} y={py(f, inner, 1.05) - 6}>jumps to {Math.round(inner * 100)}%</text>}
    {liveRadius !== null && <g data-live-output={liveRadius}>
      <path className={styles.liveLine} d={`M${f.left} ${py(f, liveRadius, 1.05)} H${f.w - f.right}`} strokeDasharray="3 3" />
      <circle className={styles.liveDot} cx={f.w - f.right} cy={py(f, liveRadius, 1.05)} r={5}><title>Measured output: {Math.round(liveRadius * 100)}%. Requested input is not reported.</title></circle>
    </g>}
  </svg>
}

/** One turn: a compass that fills as you turn (Real-world calibration). */
export function TurnCompass({ degrees, label }: { degrees: number; label: string }) {
  const cx = 150, cy = 150, r = 110
  const sweep = Math.min(359.9, Math.abs(degrees) % 720 > 360 ? 359.9 : Math.abs(degrees) % 360)
  const a = ((sweep - 90) * Math.PI) / 180
  const large = sweep > 180 ? 1 : 0
  return <svg className={styles.compass} viewBox="0 0 300 300" role="img" aria-label={label}>
    <circle className={styles.dialTrack} cx={cx} cy={cy} r={r} />
    {sweep > 0.5 && <path className={styles.curve} d={`M${cx} ${cy - r} A${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`} />}
    {(['N', 'E', 'S', 'W'] as const).map((point, i) => <text key={point} className={styles.markLabel} x={cx + (r + 18) * Math.cos(((i * 90 - 90) * Math.PI) / 180)} y={cy + (r + 18) * Math.sin(((i * 90 - 90) * Math.PI) / 180) + 4} textAnchor="middle">{point}</text>)}
    <text className={styles.dialValue} x={cx} y={cy + 8} textAnchor="middle">{Math.round(Math.abs(degrees))}°</text>
    <text className={styles.markLabel} x={cx} y={cy + 30} textAnchor="middle">of 360°</text>
  </svg>
}

/** Calibration progress: a ring that empties as the run goes. */
export function CalibrationRing({ fraction, big, small, still }: { fraction: number; big: string; small: string; still: boolean | null }) {
  const cx = 150, cy = 150, r = 130
  const end = Math.max(0.001, Math.min(0.999, fraction))
  const a = (end * 360 - 90) * (Math.PI / 180)
  return <div className={styles.ring}>
    <svg viewBox="0 0 300 300" role="img" aria-label={`${big} ${small}`}>
      <circle className={styles.dialTrack} cx={cx} cy={cy} r={r} />
      <path className={styles.ringArc} d={`M${cx} ${cy - r} A${r} ${r} 0 ${end > 0.5 ? 1 : 0} 1 ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`} />
      <text className={styles.ringBig} x={cx} y={cy + 20} textAnchor="middle">{big}</text>
      <text className={styles.ringSmall} x={cx} y={cy + 56} textAnchor="middle">{small}</text>
    </svg>
    {still !== null && <span className={styles.still} data-still={still ? 'true' : undefined}><i />{still ? 'Still' : 'Moving'}</span>}
  </div>
}

/** Memoise a heavy model on its inputs' JSON. */
export function useModel<T>(make: () => T, deps: unknown) {
  const key = JSON.stringify(deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(make, [key])
}
