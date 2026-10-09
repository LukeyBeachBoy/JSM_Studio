import type { ReactNode } from 'react'
import { VisualPanel } from './shared'
import { correctedStickRadius } from '../../utils/virtualStickSettings'

// Live visuals for the Sticks screens (console v2), flat per STYLE-FLAT.md:
// art tokens for the stick, the accent for what is chosen, #808c99 dashed for
// alternatives, the telemetry green for where your thumb is now.

const LIVE = '#a6d65a'
const ACCENT = 'var(--accent)'
const ALT = '#808c99'
const LINE = '#e3eaf1'
const GRID = 'rgba(255,255,255,.08)'

type Live = { x: number; y: number } | null | undefined

/** The stick from above: gate, the ignored inner ring, the dashed full-speed
 *  ring, and the live dot (StickDeadZone, Sticks front). */
export function StickDiagram({ live, inner, outer, size = 220, wedge }: { live: Live; inner: number; outer: number; size?: number; wedge?: ReactNode }) {
  const r = 90
  const x = live ? live.x : 0
  const y = live ? -live.y : 0
  return (
    <svg viewBox="0 0 220 220" width={size} height={size} role="img" aria-label={`Stick at ${Math.round(Math.hypot(x, y) * 100)}%`} data-stick-diagram="">
      <circle cx="110" cy="110" r={r + 4} fill="#0e1419" stroke={LINE} strokeWidth="2" />
      <path d="M110 24 V196 M24 110 H196" stroke={GRID} strokeWidth="1" />
      <circle cx="110" cy="110" r={Math.max(0, (1 - outer) * r)} fill="none" stroke={ACCENT} strokeWidth="1.5" strokeDasharray="4 4" />
      <circle cx="110" cy="110" r={Math.max(2, inner * r)} fill="color-mix(in srgb, var(--accent) 12%, transparent)" stroke={ACCENT} strokeWidth="1.5" />
      {wedge}
      {live && Math.hypot(x, y) > 0.01 && <path d={`M110 110 L${110 + x * r} ${110 + y * r}`} stroke={LIVE} strokeWidth="2" />}
      <circle cx={110 + x * r} cy={110 + y * r} r="9" fill="none" stroke={LINE} strokeWidth="2" />
      <circle cx={110 + x * r} cy={110 + y * r} r="4.5" fill={live ? LIVE : ALT} />
    </svg>
  )
}

/** The 1D strip under the dead-zone diagram: Ignored | Speed builds | Full. */
export function DeadZoneBar({ inner, outer, push }: { inner: number; outer: number; push: number }) {
  const x = (fraction: number) => 10 + Math.max(0, Math.min(1, fraction)) * 380
  return (
    <svg viewBox="0 0 400 56" role="img" aria-label={`Ignored below ${Math.round(inner * 100)}%, full past ${Math.round((1 - outer) * 100)}%`}>
      <rect x={x(0)} y="14" width={x(inner) - x(0)} height="14" fill="rgba(255,255,255,.06)" />
      <rect x={x(inner)} y="14" width={Math.max(0, x(1 - outer) - x(inner))} height="14" fill="color-mix(in srgb, var(--accent) 35%, transparent)" />
      <rect x={x(1 - outer)} y="14" width={Math.max(0, x(1) - x(1 - outer))} height="14" fill={ACCENT} />
      <circle cx={x(push)} cy="21" r="6" fill={LIVE} stroke={LINE} strokeWidth="2" />
      <text x={x(0)} y="46" fill={ALT} fontSize="11">0</text>
      <text x={x(inner)} y="46" fill={ALT} fontSize="11" textAnchor="middle">{Math.round(inner * 100)}%</text>
      <text x={x(1 - outer)} y="46" fill={ALT} fontSize="11" textAnchor="middle">{Math.round((1 - outer) * 100)}%</text>
      <text x={(x(0) + x(inner)) / 2} y="10" fill={ALT} fontSize="10" textAnchor="middle">Ignored</text>
      <text x={(x(inner) + x(1 - outer)) / 2} y="10" fill={ALT} fontSize="10" textAnchor="middle">Speed builds</text>
      <text x={(x(1 - outer) + x(1)) / 2} y="10" fill={ALT} fontSize="10" textAnchor="middle">Full</text>
    </svg>
  )
}

/** Turn speed for a push, the way JoyShock's AIM mode works it out: past the
 *  inner dead zone the push is rescaled to 0..1 at the outer edge, raised to
 *  STICK_POWER (0 = full strength at once), times STICK_SENS. */
export const aimSpeed = (push: number, inner: number, outer: number, power: number, sens: number) => {
  const span = Math.max(0.0001, 1 - outer - inner)
  const t = Math.max(0, Math.min(1, (push - inner) / span))
  if (push <= inner) return 0
  return (power <= 0 ? 1 : Math.pow(t, power)) * sens
}

export function SpeedCurve({ inner, outer, power, sens, push, alternatives }: { inner: number; outer: number; power: number; sens: number; push: number; alternatives: { label: string; power: number }[] }) {
  const max = Math.max(sens, 1)
  const point = (p: number, pw: number) => `${40 + p * 320},${200 - (aimSpeed(p, inner, outer, pw, sens) / max) * 170}`
  const path = (pw: number) => Array.from({ length: 101 }, (_, index) => `${index ? 'L' : 'M'}${point(index / 100, pw)}`).join(' ')
  const now = aimSpeed(push, inner, outer, power, sens)
  return (
    <svg viewBox="0 0 380 230" role="img" aria-label={`Turn speed ${Math.round(now)} degrees a second at ${Math.round(push * 100)}% push`}>
      <rect x="40" y="30" width={inner * 320} height="170" fill="rgba(255,255,255,.04)" />
      <path d="M40 30 V200 H360" stroke={GRID} strokeWidth="1.5" fill="none" />
      {alternatives.filter(alt => Math.abs(alt.power - power) > 0.001).map(alt => <g key={alt.label}><path d={path(alt.power)} stroke={ALT} strokeWidth="1.5" strokeDasharray="4 4" fill="none" /><text x={point(0.62, alt.power).split(',')[0]} y={Number(point(0.62, alt.power).split(',')[1]) - 6} fill={ALT} fontSize="10">{alt.label}</text></g>)}
      <path d={`${path(power)} L360,200 L40,200 Z`} fill="color-mix(in srgb, var(--accent) 10%, transparent)" />
      <path d={path(power)} stroke={ACCENT} strokeWidth="2" fill="none" />
      <circle cx={40 + push * 320} cy={200 - (now / max) * 170} r="5" fill={LIVE} stroke={LINE} strokeWidth="2" />
      <text x="44" y="194" fill={ALT} fontSize="10">Ignored</text>
      <text x="360" y="24" fill={LINE} fontSize="11" fontWeight="600" textAnchor="end">{Math.round(sens)}°/s</text>
      <text x="200" y="222" fill={ALT} fontSize="10" textAnchor="middle">How far you push the stick →</text>
    </svg>
  )
}

/** Speed-up: turn speed against seconds held at full tilt. */
export function SpeedUpChart({ sens, rate, cap, held, presets }: { sens: number; rate: number; cap: number; held: number; presets: { label: string; rate: number; cap: number }[] }) {
  const seconds = 3
  const top = Math.max(sens * 3.2, sens * Math.min(cap, 4))
  const speed = (t: number, r: number, c: number) => sens * Math.min(c, 1 + r * t)
  const path = (r: number, c: number) => Array.from({ length: 61 }, (_, index) => { const t = (index / 60) * seconds; return `${index ? 'L' : 'M'}${40 + (t / seconds) * 320},${200 - (speed(t, r, c) / top) * 170}` }).join(' ')
  const at = Math.min(held, seconds)
  return (
    <svg viewBox="0 0 380 230" role="img" aria-label={`Held ${held.toFixed(1)} seconds: ${Math.round(speed(held, rate, cap))} degrees a second`}>
      <path d="M40 30 V200 H360" stroke={GRID} strokeWidth="1.5" fill="none" />
      {presets.map(preset => <g key={preset.label}><path d={path(preset.rate, preset.cap)} stroke={ALT} strokeWidth="1.5" strokeDasharray="4 4" fill="none" /><text x="358" y={200 - (speed(seconds, preset.rate, preset.cap) / top) * 170 - 6} fill={ALT} fontSize="10" textAnchor="end">{preset.label}</text></g>)}
      <path d={path(rate, cap)} stroke={ACCENT} strokeWidth="2" fill="none" />
      <circle cx={40 + (at / seconds) * 320} cy={200 - (speed(held, rate, cap) / top) * 170} r="5" fill={LIVE} stroke={LINE} strokeWidth="2" />
      {[1, 2].map(s => <text key={s} x={40 + (s / seconds) * 320} y="214" fill={ALT} fontSize="10" textAnchor="middle">{s} s</text>)}
      <text x="36" y={200 - (sens / top) * 170 + 4} fill={ALT} fontSize="10" textAnchor="end">{Math.round(sens)}</text>
      <text x="200" y="228" fill={ALT} fontSize="10" textAnchor="middle">Seconds held at full tilt →</text>
    </svg>
  )
}

/** Flick compass: where a flick lands, snap points and the forward zone. */
export function FlickCompass({ angle, snap, forward, strength = 1 }: { angle: number | null; snap: number; forward: number; strength?: number }) {
  const r = 86
  const polar = (deg: number, radius = r) => [110 + Math.sin(deg * Math.PI / 180) * radius, 110 - Math.cos(deg * Math.PI / 180) * radius]
  const snapped = angle === null || snap === 0 ? angle : (() => { const step = 360 / snap; const near = Math.round(angle / step) * step; return angle + (near - angle) * strength })()
  const wedge = forward > 0 ? (() => { const [x1, y1] = polar(-forward), [x2, y2] = polar(forward); return `M110 110 L${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2} Z` })() : ''
  return (
    <svg viewBox="0 0 220 230" role="img" aria-label={angle === null ? 'Stick centred' : `Push ${Math.round(angle)} degrees, lands ${Math.round(snapped ?? angle)}`}>
      <circle cx="110" cy="110" r={r} fill="#0e1419" stroke={LINE} strokeWidth="2" />
      {wedge && <path d={wedge} fill="color-mix(in srgb, var(--accent) 18%, transparent)" stroke={ACCENT} strokeWidth="1" />}
      {snap > 0 && Array.from({ length: snap }, (_, index) => { const [x, y] = polar(index * (360 / snap), r - 10); return <circle key={index} cx={x} cy={y} r="4" fill={ALT} /> })}
      <text x="110" y="16" fill={ALT} fontSize="10" textAnchor="middle">Forward</text>
      <text x="110" y="224" fill={ALT} fontSize="10" textAnchor="middle">Behind</text>
      {snapped !== null && angle !== null && <>
        <path d={`M110 110 L${polar(angle)[0]} ${polar(angle)[1]}`} stroke={LIVE} strokeWidth="2" strokeDasharray="3 3" />
        <path d={`M110 110 L${polar(snapped)[0]} ${polar(snapped)[1]}`} stroke={ACCENT} strokeWidth="3" />
        <circle cx={polar(snapped)[0]} cy={polar(snapped)[1]} r="6" fill={ACCENT} />
      </>}
      <path d="M110 92 L100 120 L110 113 L120 120 Z" fill={LINE} />
    </svg>
  )
}

/** Mouse-like feel: the return wedge (ignored, fading) and the edge. */
export function HybridWedge({ ignored, fade, edge, active }: { ignored: number; fade: number; edge: boolean; active: boolean }) {
  const r = 86
  const arc = (from: number, to: number, radius: number) => { const p = (deg: number) => `${110 + Math.sin(deg * Math.PI / 180) * radius} ${110 - Math.cos(deg * Math.PI / 180) * radius}`; return `M110 110 L${p(from)} A${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${p(to)} Z` }
  return (
    <svg viewBox="0 0 220 220" role="img" aria-label={`Return ignored within ${ignored} degrees, normal by ${fade}`}>
      <circle cx="110" cy="110" r={r} fill="#0e1419" stroke={LINE} strokeWidth="2" />
      {active && <path d={arc(180 - fade, 180 + fade, r)} fill="color-mix(in srgb, var(--accent) 12%, transparent)" />}
      {active && <path d={arc(180 - ignored, 180 + ignored, r)} fill="color-mix(in srgb, var(--accent) 35%, transparent)" stroke={ACCENT} />}
      {edge && <circle cx="110" cy="110" r={r - 4} fill="none" stroke={LIVE} strokeWidth="3" strokeDasharray="6 6" />}
      <circle cx="110" cy="40" r="6" fill={LINE} />
      <path d="M110 46 V100" stroke={LINE} strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  )
}

/** What the game receives through a gamepad stick: your push against the
 *  corrected radius (correctedStickRadius mirrors JoyShock::processGyroStick). */
export function GameCurve({ inner, outer, exponent, probe, push }: { inner: number; outer: number; exponent: number; probe: boolean; push: number }) {
  const path = (exp: number, dashed = false) => <path d={Array.from({ length: 101 }, (_, index) => { const x = index / 100; return `${index ? 'L' : 'M'}${40 + x * 300},${190 - correctedStickRadius(x, inner, outer, exp, probe) * 160}` }).join(' ')} stroke={dashed ? ALT : ACCENT} strokeWidth={dashed ? 1.5 : 2} strokeDasharray={dashed ? '4 4' : undefined} fill="none" />
  const now = correctedStickRadius(push, inner, outer, exponent, probe)
  return (
    <svg viewBox="0 0 380 220" role="img" aria-label={`Sends ${Math.round(now * 100)}% to the game`}>
      <rect x="40" y={190 - inner * 160} width="300" height={inner * 160} fill="rgba(255,255,255,.04)" />
      <path d="M40 30 V190 H340" stroke={GRID} strokeWidth="1.5" fill="none" />
      {exponent !== 2 && path(2, true)}
      {exponent > 1.001 || exponent < 0.999 ? path(1, true) : null}
      {path(exponent)}
      <circle cx={40 + push * 300} cy={190 - now * 160} r="5" fill={LIVE} stroke={LINE} strokeWidth="2" />
      {/* Inside the game's dead zone band, clear of the axis (the band is at least a few pixels tall before the label shows). */}
      {inner * 160 > 14 && <text x="46" y={190 - inner * 160 / 2 + 4} fill={ALT} fontSize="10">Game ignores this</text>}
      <text x="190" y="212" fill={ALT} fontSize="10" textAnchor="middle">How far you push your stick →</text>
    </svg>
  )
}

/** Mouse ring: the screen with the cursor ring round its centre. */
export function MouseRingScreen({ radius, width, height, live }: { radius: number; width: number; height: number; live: Live }) {
  const scale = 300 / Math.max(1, width)
  const ring = Math.max(2, radius * scale)
  const px = live && Math.hypot(live.x, live.y) > 0.1 ? Math.atan2(live.x, live.y) : null
  return (
    <svg viewBox="0 0 340 220" role="img" aria-label={`Ring ${radius} px on a ${width} by ${height} screen`}>
      <rect x="20" y="10" width="300" height={Math.max(40, height * scale)} rx="4" fill="#0e1419" stroke="#aebbc8" strokeWidth="1.5" />
      <circle cx="170" cy={10 + (height * scale) / 2} r={ring} fill="none" stroke={ACCENT} strokeWidth="1.5" strokeDasharray="4 4" />
      {px !== null && <circle cx={170 + Math.sin(px) * ring} cy={10 + (height * scale) / 2 - Math.cos(px) * ring} r="5" fill={LIVE} stroke={LINE} strokeWidth="2" />}
      <text x="314" y={Math.max(40, height * scale) + 2} fill={ALT} fontSize="10" textAnchor="end">{width} × {height}</text>
      <text x={170 - ring - 6} y={14 + (height * scale) / 2} fill={ACCENT} fontSize="11" textAnchor="end">{radius} px</text>
    </svg>
  )
}

/** A visual panel with the stick diagram and its legend, for groups that
 *  have nothing more particular to draw. */
export function StickPanel({ title, live, inner, outer, caption }: { title: string; live: Live; inner: number; outer: number; caption?: ReactNode }) {
  const push = live ? Math.hypot(live.x, live.y) : 0
  return (
    <VisualPanel title={title} chip={live ? `${push <= inner ? 'resting' : 'moving'} · ${Math.round(push * 100)}%${push <= inner ? ' · ignored' : ''}` : 'no controller'} caption={caption}
      legend={[{ mark: <svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="color-mix(in srgb, var(--accent) 20%, transparent)" stroke={ACCENT} /></svg>, label: 'Inner ring', detail: `Ignored · ${Math.round(inner * 100)}%` },
        { mark: <svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="none" stroke={ACCENT} strokeDasharray="3 3" /></svg>, label: 'Outer ring', detail: `Full speed past ${Math.round((1 - outer) * 100)}%` },
        { mark: <svg width="18" height="18"><circle cx="9" cy="9" r="4.5" fill={LIVE} /></svg>, label: 'Your stick now', detail: `${Math.round(push * 100)}% push` }]}>
      <StickDiagram live={live} inner={inner} outer={outer} />
    </VisualPanel>
  )
}
