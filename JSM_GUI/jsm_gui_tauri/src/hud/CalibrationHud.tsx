import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import styles from './Hud.module.css'

// Mirrors JoyShockMapper's GyroCalibrationRun phases, as the backend forwards
// them from telemetry.
// Phase 3: the controller moved while it was sampled and the run was thrown
// away; reached is how far it got.
type Payload = { phase: number; remainingMs?: number; totalMs?: number; done?: boolean; reached?: number }
type Phase = 'hidden' | 'waiting' | 'calibrating' | 'done' | 'failed'
type Run = { phase: Phase; remainingMs: number; totalMs: number; at: number; since: number; reached?: number }

const SEGMENTS = 60
// Read from the tokens (design-tokens.css + accents.css) so the ring wears the chosen accent.
const token = (name: string, fallback: string) => (typeof document === 'undefined' ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback)
const colors = () => ({ accent: token('--accent', '#6ec3f4'), ok: token('--ok', '#7cc7a0'), warn: token('--warn', '#e8b56a'), idle: token('--art-detail', '#aebbc8') })
const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3)
const clamp = (x: number) => Math.max(0, Math.min(1, x))

// The Steam Controller silhouette from the approved art (Controller Art 9c).
const CONTROLLER_PATH = 'M109.129 2.09533C111.67 1.83272 115.706 1.90069 118.263 1.94414C123.279 2.02938 126.884 3.85153 130.242 7.53745C133.611 7.69185 138.182 7.54883 141.627 7.54095L166.072 7.4578L244.21 7.49073L288.935 7.49388L302.25 7.5376C303.35 7.54473 307.827 7.73703 308.712 7.54143C311.835 6.85308 314.358 3.37035 317.983 2.58393C322.998 1.49671 328.322 1.96333 333.422 2.23575C347.987 4.84038 372.105 9.1774 376.628 25.3138C381.955 29.595 385.49 33.7538 388.698 39.7838C393.06 47.9915 395.505 55.9275 398.395 64.5708C403.375 79.4775 407.855 94.5032 411.753 109.728C413.085 114.931 414.992 120.549 416.117 125.739C418.762 137.95 421.942 149.99 424.217 162.276C425.835 169.769 426.582 177.569 427.897 185.078C428.862 190.585 429.418 195.872 430.23 201.293C431.298 208.419 431.763 214.014 432.108 221.227C433.26 245.315 433.005 271.2 420.29 292.552C413.703 303.595 402.552 312.09 390 314.938C376.84 318.01 362.602 316.583 356.085 302.888C352.777 296.465 351.558 289.452 349.47 282.707C346.443 272.93 339.96 257.538 331.1 251.848L330.875 251.703C321.875 245.828 313.248 246.919 303 246.938L279.642 246.951L186.304 246.923L146.076 246.95C132.819 246.876 116.195 244.41 105.892 254.14C96.578 262.935 92.195 275.745 88.509 287.76C85.7955 296.605 83.1455 307.182 74.7818 312.58C66.8313 317.402 55.744 316.75 47.1323 314.443C34.5363 311.205 24.4946 302.638 17.9333 291.535C7.34481 272.995 6.13453 249.569 6.29896 228.64C6.39473 223.913 7.05863 219.107 7.30233 214.398C7.83083 197.91 11.4324 182.134 14.2666 166.03C16.8123 151.565 20.2276 138.73 23.8489 124.55C29.1633 104.451 35.2555 84.5655 42.1123 64.939C46.4433 52.5323 52.199 32.7263 64.2318 25.586C64.2438 25.3598 64.262 25.134 64.2865 24.9087L64.318 24.621C65.8118 10.2315 97.8073 3.25995 109.129 2.09533Z'

function fromPayload(payload: Payload, previous: Run): Run {
  const now = performance.now()
  const phase: Phase = payload.phase === 1 ? 'waiting' : payload.phase === 2 ? 'calibrating' : payload.phase === 3 ? 'failed' : payload.done ? 'done' : 'hidden'
  return {
    phase,
    remainingMs: Math.max(0, payload.remainingMs ?? 0),
    totalMs: Math.max(1, payload.totalMs ?? previous.totalMs ?? 1),
    at: now,
    since: phase === previous.phase ? previous.since : now,
    reached: payload.reached ?? previous.reached,
  }
}

// hud.html?demo=waiting|calibrating|done|failed holds a phase; ?demo alone
// loops all of them, for working on the look without a controller.
function demoRun(demo: string, t: number): Run {
  const at = performance.now()
  if (demo === 'failed') return { phase: 'failed', remainingMs: 0, totalMs: 5400, at, since: at - (t % 6) * 1000, reached: 26 }
  const u = demo === 'waiting' ? t % 3 : demo === 'calibrating' ? 3 + (t % 5.4) : demo === 'done' ? 8.4 + (t % 3) : t % 11.4
  if (u < 3) return { phase: 'waiting', remainingMs: (3 - u) * 1000, totalMs: 3000, at, since: at - u * 1000 }
  if (u < 8.4) return { phase: 'calibrating', remainingMs: (8.4 - u) * 1000, totalMs: 5400, at, since: at - (u - 3) * 1000 }
  return { phase: 'done', remainingMs: 0, totalMs: 5400, at, since: at - (u - 8.4) * 1000 }
}

export function CalibrationHud() {
  const COLORS = colors()
  const [run, setRun] = useState<Run>({ phase: 'hidden', remainingMs: 0, totalMs: 1, at: 0, since: 0 })
  const [, setFrame] = useState(0)
  const runRef = useRef(run)
  runRef.current = run
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    listen<Payload>('hud-calibration', event => {
      if (!disposed) setRun(previous => fromPayload(event.payload, previous))
    }).then(fn => { if (disposed) fn(); else unlisten = fn }).catch(() => {})
    return () => { disposed = true; unlisten?.() }
  }, [])

  // Progress is interpolated every frame between the ~30 Hz updates, and the
  // demo drives itself; nothing draws while the HUD is hidden.
  useEffect(() => {
    const demo = new URLSearchParams(location.search).get('demo')
    const started = performance.now()
    let raf = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) return
      if (demo !== null) setRun(demoRun(demo, (now - started) / 1000))
      else if (runRef.current.phase !== 'hidden') setFrame(frame => frame + 1)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (run.phase === 'hidden') return <div className={styles.root} />

  const now = performance.now()
  const local = Math.max(0, (now - run.since) / 1000)
  const remaining = Math.max(0, run.remainingMs - (run.phase === 'waiting' || run.phase === 'calibrating' ? now - run.at : 0))
  const progress = clamp(1 - remaining / run.totalMs)

  let fill = 0, drain = 1, ringRot = 0, segOp = 1, solidOp = 0, checkOff = 60, checkOp = 0, ctrlOp = 1, ctrlY = 0, ctrlRot = 0
  let shadowOp = .35, shadowRx = 22, bloomOp = 0, bloomScale = .9, sweepOp = 0, sweepRot = 0, hudOp = 1, hudY = 0, shakeX = 0, failOp = 0
  let segColor = COLORS.accent, eyebrowColor = COLORS.accent
  let eyebrow = '', title = '', sub = '', big = '', bigUnit = ''
  if (run.phase === 'waiting') {
    drain = 1 - progress
    eyebrow = 'GYRO CALIBRATION'; title = 'Set it down'; sub = 'Controller flat and still. Starting in'
    big = String(Math.max(1, Math.ceil(remaining / 1000))); bigUnit = `s · start delay ${Math.round(run.totalMs / 1000)} s`
  } else if (run.phase === 'calibrating') {
    fill = ease(progress) * .06 + progress * .94
    const e = ease(local / .4)
    ringRot = reduced ? 0 : 90 * e
    ctrlY = reduced ? 0 : -4 * e + Math.sin(local * 2.4) * .8 * (1 - progress)
    ctrlRot = reduced ? 0 : Math.sin(local * 5) * 3 * (1 - progress)
    shadowOp = .35 - .2 * e; shadowRx = 22 - 5 * e
    sweepOp = reduced ? 0 : .9 * e; sweepRot = local * 225
    eyebrow = 'CALIBRATING'; title = 'Hold still'; sub = 'Sampling the gyro'
    big = String(Math.round(progress * 100)); bigUnit = `% · ${Math.ceil(remaining / 1000)} s left`
  } else if (run.phase === 'done') {
    const a = ease(local / .24)
    segOp = 1 - a; solidOp = a; fill = 1; ctrlOp = 1 - a; checkOp = 1
    checkOff = 60 * (1 - ease((local - .15) / .4))
    bloomOp = reduced ? 0 : .35 * Math.max(0, 1 - Math.abs(local - .55) / .45)
    bloomScale = .9 + .25 * ease((local - .2) / .6)
    segColor = COLORS.ok; eyebrowColor = COLORS.ok
    eyebrow = 'DONE'; title = 'Calibrated'; sub = 'Gyro offset saved for this session'
    if (local > 1) { const x = ease((local - 1) / .6); hudOp = 1 - x; hudY = reduced ? 0 : -6 * x }
  } else {
    const reached = Math.max(0, Math.min(99, run.reached ?? 0))
    fill = reached / 100; segColor = COLORS.warn; eyebrowColor = COLORS.warn; ctrlOp = 0; failOp = ease(local / .2)
    shakeX = reduced ? 0 : (local < .36 ? Math.sin(local / .36 * Math.PI * 6) * 6 * (1 - local / .36) : 0)
    eyebrow = 'CANCELLED'; title = 'Controller moved'; sub = 'Put it down and press Calibrate again'
    big = String(reached); bigUnit = '% reached'
  }

  const segments = Array.from({ length: SEGMENTS }, (_, i) => {
    const f = i / SEGMENTS
    let on: boolean, opacity: number
    if (run.phase === 'waiting') { on = f < drain; opacity = on ? .95 : .14 }
    else { const edge = fill * SEGMENTS - i; on = edge > 0; opacity = on ? (edge < 1 ? .3 + .65 * edge : .95) : .14 }
    return <line key={i} x1="60" y1="7" x2="60" y2={on ? 15 : 12} stroke={on ? segColor : COLORS.idle} opacity={opacity} transform={`rotate(${f * 360} 60 60)`} />
  })
  const dots = run.phase === 'calibrating' && !reduced ? Array.from({ length: 10 }, (_, i) => {
    const angle = i * 2.4 + local * .6, r = 44 - ((local * 14 + i * 9) % 30)
    return <circle key={i} cx={60 + Math.cos(angle) * r} cy={60 + Math.sin(angle) * r} r="1.4" className={styles.dot} opacity={Math.max(0, Math.min(.8, (r - 14) / 20))} />
  }) : null

  return (
    <div className={styles.root}>
      <div className={styles.card} data-phase={run.phase} role="status" aria-live="polite"
        style={{ opacity: hudOp, transform: `translateY(${hudY}px) translateX(${shakeX}px)` }}>
        <svg className={styles.jewel} viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="54" fill={COLORS.ok} opacity={bloomOp} style={{ transformOrigin: '60px 60px', transform: `scale(${bloomScale})` }} />
          <g className={styles.segments} style={{ transformOrigin: '60px 60px', transform: `rotate(${ringRot}deg)`, opacity: segOp }}>{segments}</g>
          <circle cx="60" cy="60" r="52" fill="none" stroke={COLORS.ok} strokeWidth="3.2" transform="rotate(-90 60 60)" opacity={solidOp} />
          <path d="M60 60 L60 8 A52 52 0 0 1 86 15 Z" fill="url(#hud-sweep)" opacity={sweepOp} style={{ transformOrigin: '60px 60px', transform: `rotate(${sweepRot}deg)` }} />
          <defs>
            <linearGradient id="hud-sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={COLORS.accent} stopOpacity="0" />
              <stop offset="1" stopColor={COLORS.accent} stopOpacity=".28" />
            </linearGradient>
          </defs>
          {dots}
          <g style={{ opacity: ctrlOp, transformOrigin: '60px 64px', transform: `translate(0px, ${ctrlY}px) rotate(${ctrlRot}deg)` }}>
            <ellipse cx="60" cy="86" rx={shadowRx} ry="3" fill="#000" opacity={shadowOp} />
            <g transform="translate(29 47) scale(.0555)"><g transform="translate(42.43417 0) scale(2.3510972)">
              <path d={CONTROLLER_PATH} fill="#1c242d" stroke="#e3eaf1" strokeWidth="6" />
            </g></g>
          </g>
          <path d="M42 61 l12 12 l25 -26" fill="none" stroke={COLORS.ok} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="60" strokeDashoffset={checkOff} opacity={checkOp} />
          <path d="M60 38 v26 M60 76 v.5" fill="none" stroke={COLORS.warn} strokeWidth="6" strokeLinecap="round" opacity={failOp} />
        </svg>
        <div className={styles.text}>
          <span className={styles.eyebrow} style={{ color: eyebrowColor }}>{eyebrow}</span>
          <span className={styles.title}>{title}</span>
          <span className={styles.sub}>{sub}</span>
          {big && <div className={styles.readout}><span className={styles.big}>{big}</span>{bigUnit}</div>}
        </div>
      </div>
    </div>
  )
}
