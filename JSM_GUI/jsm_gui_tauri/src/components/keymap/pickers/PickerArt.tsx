import { createElement, useId, useMemo, type ReactNode } from 'react'
import type { ControllerVisualFamily } from '../../../utils/controllerStatus'
import models from '../../controllerModels.json'
import steamFront from '../../../assets/controllers/steam-front.svg?raw'
import styles from './Pickers.module.css'

// The pickers' pictures (console v2: KeyPicker, PickerFamily, ControllerActions*,
// STYLE-FLAT.md). Flat line art in the app's own tokens: controllers are the
// real artwork in src/assets/controllers with the --art-* variables, the
// selected thing is a flat accent fill, nothing glows. Strokes are
// currentColor so a tile can switch its art to the dark on-accent ink when it
// is the current choice.

export type ModelKey = keyof typeof models
type Control = { command: string; tag: string; attrs: Record<string, string | undefined> }

/** The artwork a family draws: the connected pad's own, Xbox when unknown. */
export const artModelFor = (family: ControllerVisualFamily): ModelKey | 'steam' =>
  family === 'steam' ? 'steam' : family === 'playstation' ? 'dualsense' : family === 'nintendo' ? 'switch-pro' : 'xbox-series'

// The Steam Controller (2026) has no entry in controllerModels.json; its
// inputs, in the same 1117×750 space, as ControllerStatusSvg measures them.
const STEAM_CONTROLS: Control[] = [
  { command: 'N', tag: 'circle', attrs: { cx: '864', cy: '93', r: '31' } },
  { command: 'E', tag: 'circle', attrs: { cx: '922', cy: '146', r: '31' } },
  { command: 'S', tag: 'circle', attrs: { cx: '864', cy: '200', r: '31' } },
  { command: 'W', tag: 'circle', attrs: { cx: '805', cy: '146', r: '31' } },
  { command: 'UP', tag: 'circle', attrs: { cx: '252', cy: '99', r: '22' } },
  { command: 'LEFT', tag: 'circle', attrs: { cx: '206', cy: '145', r: '22' } },
  { command: 'RIGHT', tag: 'circle', attrs: { cx: '298', cy: '145', r: '22' } },
  { command: 'DOWN', tag: 'circle', attrs: { cx: '252', cy: '191', r: '22' } },
  { command: 'HOME', tag: 'circle', attrs: { cx: '557', cy: '147', r: '33' } },
  { command: 'MISC1', tag: 'circle', attrs: { cx: '556', cy: '409', r: '18' } },
  { command: '-', tag: 'circle', attrs: { cx: '382', cy: '77', r: '15' } },
  { command: '+', tag: 'circle', attrs: { cx: '730', cy: '77', r: '15' } },
  { command: 'L3', tag: 'circle', attrs: { cx: '412', cy: '219', r: '66' } },
  { command: 'R3', tag: 'circle', attrs: { cx: '700', cy: '219', r: '66' } },
  { command: 'L', tag: 'ellipse', attrs: { cx: '268', cy: '26', rx: '74', ry: '14' } },
  { command: 'R', tag: 'ellipse', attrs: { cx: '851', cy: '26', rx: '74', ry: '14' } },
  { command: 'ZL', tag: 'ellipse', attrs: { cx: '210', cy: '18', rx: '60', ry: '12' } },
  { command: 'ZR', tag: 'ellipse', attrs: { cx: '907', cy: '18', rx: '60', ry: '12' } },
  { command: 'LEFT_PAD', tag: 'circle', attrs: { cx: '365', cy: '410', r: '96' } },
  { command: 'RIGHT_PAD', tag: 'circle', attrs: { cx: '751', cy: '410', r: '96' } },
]
const STICKS: Record<string, [string, string]> = { L3: ['L3', 'LRING'], R3: ['R3', 'RRING'] }

const scopeIds = (markup: string, id: string) => markup.replace(/id="([^"]+)"/g, `id="${id}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${id}-$1)`)
const STEAM_INNER = steamFront.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')

/**
 * The connected pad's front, flat, with the inputs in `highlight` filled in
 * the accent (the one being bound) and `glow` drawn as the light's colour on
 * the light bar or LED. `viewBox` crops it (the Light tiles show the top half).
 */
export function ControllerArt({ family, model, highlight = [], light, viewBox = '-20 -30 1157 810', className, label }: {
  family: ControllerVisualFamily; model?: ModelKey | 'steam'; highlight?: string[]; light?: string | null; viewBox?: string; className?: string; label?: string
}) {
  const id = useId().replace(/:/g, '')
  const key = model ?? artModelFor(family)
  const markup = useMemo(() => scopeIds(key === 'steam' ? STEAM_INNER : (models[key] as { front: string }).front, id), [id, key])
  const controls: Control[] = key === 'steam' ? STEAM_CONTROLS : [
    ...(models[key] as { controls: Control[] }).controls,
    ...(models[key] as { sticks: number[][] }).sticks.map(([cx, cy, r], index) => ({ command: index ? 'R3' : 'L3', tag: 'circle', attrs: { cx: String(cx), cy: String(cy), r: String(r) } })),
  ]
  const wanted = new Set(highlight.flatMap(command => STICKS[command] ?? [command]))
  // The light: a bar over the touchpad on a PlayStation pad, a dot by the
  // Steam button on the Steam Controller, the guide ring on an Xbox pad.
  const lightAt = key === 'steam' ? { cx: 557, cy: 147, r: 44 } : key === 'dualsense' ? { cx: 558, cy: 80, r: 60 } : key === 'switch-pro' ? { cx: 630, cy: 237, r: 30 } : { cx: 558, cy: 114, r: 34 }
  return (
    <svg className={`${styles.controllerArt} ${className ?? ''}`} viewBox={viewBox} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} preserveAspectRatio="xMidYMid meet">
      <g dangerouslySetInnerHTML={{ __html: markup }} />
      {light && <circle cx={lightAt.cx} cy={lightAt.cy} r={lightAt.r} fill={light} opacity={0.85} />}
      {controls.filter(control => wanted.has(control.command)).map((control, index) => createElement(control.tag, {
        key: `${control.command}-${index}`, ...control.attrs, className: styles.artHighlight,
      }))}
    </svg>
  )
}

// ---- 56px tile icons (ControllerActions*): a rounded square with line art.
const TILE_PATHS: Record<string, ReactNode> = {
  gyroOn: <g strokeWidth="2"><path d="M18 25h20a7 7 0 0 1 7 7v1a5 5 0 0 1-9 3l-2-2h-12l-2 2a5 5 0 0 1-9-3v-1a7 7 0 0 1 7-7z" /><path d="M17 16a16 16 0 0 1 22 0M36 12l3 4-4 1" /></g>,
  gyroOff: <g strokeWidth="2"><path d="M18 25h20a7 7 0 0 1 7 7v1a5 5 0 0 1-9 3l-2-2h-12l-2 2a5 5 0 0 1-9-3v-1a7 7 0 0 1 7-7z" /><path d="M17 16a16 16 0 0 1 22 0" opacity=".5" /><path d="M14 12L42 42" strokeWidth="2.4" /></g>,
  gyroOnAll: <g strokeWidth="2"><path d="M22 21h16a6 6 0 0 1 6 6v1" opacity=".45" /><path d="M16 28h18a6 6 0 0 1 6 6v1a4.5 4.5 0 0 1-8 2.6L30.5 36h-11l-1.5 1.6A4.5 4.5 0 0 1 10 35v-1a6 6 0 0 1 6-6z" /><path d="M17 15a16 16 0 0 1 22 0M36 11l3 4-4 1" /></g>,
  gyroOffAll: <g strokeWidth="2"><path d="M22 21h16a6 6 0 0 1 6 6v1" opacity=".45" /><path d="M16 28h18a6 6 0 0 1 6 6v1a4.5 4.5 0 0 1-8 2.6L30.5 36h-11l-1.5 1.6A4.5 4.5 0 0 1 10 35v-1a6 6 0 0 1 6-6z" /><path d="M17 15a16 16 0 0 1 22 0" opacity=".5" /><path d="M14 12L42 42" strokeWidth="2.4" /></g>,
  invert: <g strokeWidth="2"><path d="M17 22a12 12 0 0 1 20-5M39 32a12 12 0 0 1-20 5" /><path d="M38 11v7h-7M18 43v-7h7" /></g>,
  invertX: <><path d="M28 13v28" strokeWidth="1.6" strokeDasharray="3 3" opacity=".6" /><path d="M13 27h30M19 21l-6 6 6 6M37 21l6 6-6 6" strokeWidth="2" /></>,
  invertY: <><path d="M14 27h28" strokeWidth="1.6" strokeDasharray="3 3" opacity=".6" /><path d="M28 12v30M22 18l6-6 6 6M22 36l6 6 6-6" strokeWidth="2" /></>,
  glide: <><path d="M12 40l9-9M10 32l7-7M20 44l7-7" strokeWidth="2" opacity=".6" /><circle cx="33" cy="22" r="10" fill="var(--art-cap)" strokeWidth="1.5" /></>,
  glideX: <><path d="M9 22h12M12 28h10M9 34h12" strokeWidth="2" opacity=".6" /><circle cx="35" cy="28" r="10" fill="var(--art-cap)" strokeWidth="1.5" /></>,
  glideY: <><path d="M22 34v12M28 36v10M34 34v12" strokeWidth="2" opacity=".6" /><circle cx="28" cy="20" r="10" fill="var(--art-cap)" strokeWidth="1.5" /></>,
  calibrate: <><g strokeWidth="2"><path d="M11 43h34" /><path d="M18 33h20a4 4 0 0 1 0 8H18a4 4 0 0 1 0-8z" /><path d="M28 10a8 8 0 1 1-8 8" /></g><circle cx="28" cy="18" r="2" fill="currentColor" stroke="none" /></>,
  calibrateHeld: <g strokeWidth="2"><path d="M12 19v-6h6M44 19v-6h-6M12 35v6h6M44 35v6h-6" /><path d="M20 23h16a5 5 0 0 1 5 5v0a4 4 0 0 1-7 2.5L33 29h-10l-1 1.5A4 4 0 0 1 15 28v0a5 5 0 0 1 5-5z" /></g>,
  continuousStart: <><circle cx="28" cy="27" r="13" strokeWidth="2" /><path d="M25 21l9 6-9 6z" fill="currentColor" stroke="none" /></>,
  continuousFinish: <><circle cx="28" cy="27" r="13" strokeWidth="2" /><rect x="23" y="22" width="10" height="10" rx="2" fill="currentColor" stroke="none" /></>,
  tiltNeutral: <><g strokeWidth="2"><path d="M28 31V12M28 31l15 8M28 31l-15 8" /><path d="M24 16l4-4 4 4" /></g><circle cx="28" cy="31" r="3" fill="currentColor" stroke="none" /></>,
  recentre: <><g strokeWidth="2"><circle cx="28" cy="27" r="11" /><path d="M28 11v8M28 35v8M12 27h8M36 27h8" /></g><circle cx="28" cy="27" r="2.5" fill="currentColor" stroke="none" /></>,
  triggers: <g strokeWidth="2"><path d="M14 13h11a8 8 0 0 1 8 8v21h-7a12 12 0 0 1-12-12z" /><path d="M38 22a9 9 0 0 1 0 14M42 18a15 15 0 0 1 0 22" /></g>,
  haptic: <path d="M10 27h9l3-10 5 20 4-14 3 7 2-3h10" strokeWidth="2" />,
  rumble: <g strokeWidth="2"><circle cx="20" cy="30" r="6" /><circle cx="36" cy="27" r="9" /><path d="M20 30l3-4M36 27l5-6" /></g>,
  music: <g strokeWidth="2" transform="translate(10 9) scale(1.5)"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></g>,
}

/** A 56px tile icon; `on` draws it in the accent with dark ink (the current one). */
export function TileIcon({ name, size = 56 }: { name: string; size?: number }) {
  return (
    <svg className={styles.tileIcon} width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <rect x="2" y="1" width="52" height="52" rx="16" className={styles.tileIconWell} />
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" fill="none">{TILE_PATHS[name]}</g>
    </svg>
  )
}

// ---- Rumble & sound
/** The 120×56 strip beside Haptic pulse and Rumble motors. */
export function FeelArt({ kind }: { kind: 'haptic' | 'rumble' }) {
  return (
    <svg className={styles.feelArt} width="120" height="56" viewBox="0 0 120 56" fill="none" aria-hidden="true">
      <rect width="120" height="56" rx="10" className={styles.well} />
      {kind === 'haptic'
        ? <path d="M8 28h14l2-12 3 24 3-12h12l2-8 2 16 2-8h12q4-14 8 0t8 0t8 0t8 0h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity=".7" />
        : <>
            <circle cx="38" cy="28" r="12" fill="var(--art-cap)" stroke="var(--art-detail)" strokeWidth="1.5" />
            <path d="M38 28l6-7" stroke="var(--art-line)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="82" cy="28" r="18" fill="var(--art-cap)" stroke="var(--art-detail)" strokeWidth="1.5" />
            <path d="M82 28l9-11" stroke="var(--art-line)" strokeWidth="2" strokeLinecap="round" />
            <path d="M60 10a26 26 0 0 1 10 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".6" />
          </>}
    </svg>
  )
}

// The built-in tunes as notes: start, pitch row and length on a 100×40 roll
// (the Steam Controller's own scripts, drawn the way the sound library draws a
// tune). Indexed as BUILT_IN_SOUNDS.
export const TUNE_NOTES: [number, number, number][][] = [
  [[2, 28, 12], [16, 22, 10], [28, 16, 12], [42, 22, 8], [52, 10, 18], [72, 16, 10], [84, 8, 14]],
  [[2, 10, 8], [12, 26, 8], [22, 10, 8], [32, 26, 8], [44, 18, 14], [60, 30, 10], [72, 30, 10], [84, 14, 14]],
  [[2, 26, 10], [14, 18, 10], [26, 10, 24], [52, 18, 8], [62, 6, 30]],
  [[2, 24, 8], [12, 24, 8], [22, 24, 8], [32, 12, 22], [56, 18, 10], [68, 8, 30]],
  [[2, 32, 10], [14, 26, 10], [26, 20, 10], [38, 14, 10], [50, 8, 10], [62, 4, 30]],
  [[10, 18, 14], [30, 10, 14], [50, 18, 14]],
  [[2, 30, 30], [34, 22, 14], [50, 14, 22], [74, 20, 22]],
  [[2, 26, 10], [14, 20, 10], [26, 14, 10], [40, 26, 10], [52, 20, 10], [64, 8, 30]],
  [[2, 14, 6], [10, 22, 6], [18, 14, 6], [26, 22, 6], [34, 14, 6], [42, 22, 6], [52, 10, 20], [76, 18, 20]],
  [[2, 10, 24], [30, 22, 28], [62, 32, 34]],
  [[2, 6, 14], [18, 14, 14], [34, 22, 14], [50, 30, 44]],
  [[2, 24, 10], [14, 12, 10], [26, 30, 10], [38, 8, 18], [58, 16, 12], [72, 8, 24]],
  [[2, 22, 14], [18, 22, 6], [26, 14, 14], [42, 14, 6], [50, 6, 44]],
  [[2, 20, 8], [12, 12, 8], [22, 20, 8], [32, 28, 8], [42, 20, 16], [60, 12, 8], [70, 20, 26]],
]

/** Notes for a library sound with no roll of its own: a short motif from its name. */
const notesFor = (seed: string): [number, number, number][] => {
  let hash = 0
  for (const char of seed) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  const notes: [number, number, number][] = []
  let x = 2
  while (x < 92) {
    hash = (Math.imul(hash, 1103515245) + 12345) >>> 0
    const length = 6 + ((hash >>> 16) % 4) * 6
    notes.push([x, 4 + ((hash >>> 20) % 8) * 4, Math.min(length, 98 - x)])
    x += length + 2
  }
  return notes
}

/** A tune tile's flat note strip (100×40). */
export function TuneArt({ index, seed, width = 99, height = 40 }: { index?: number; seed?: string; width?: number; height?: number }) {
  const notes = index !== undefined ? TUNE_NOTES[index] ?? [] : notesFor(seed ?? '')
  return (
    <svg className={styles.tuneArt} width={width} height={height} viewBox="0 0 100 40" fill="none" aria-hidden="true">
      <path d="M0 9.5H100M0 19.5H100M0 29.5H100" stroke="var(--line-1)" />
      <g fill="currentColor">{notes.map(([x, y, w], at) => <rect key={at} x={x} y={y} width={w} height="5" rx="2.5" />)}</g>
    </svg>
  )
}

/** The aside's piano roll: keys down the side, the tune's notes in the accent. */
export function PianoRoll({ index, seed }: { index?: number; seed?: string }) {
  const notes = index !== undefined ? TUNE_NOTES[index] ?? [] : notesFor(seed ?? '')
  return (
    <svg viewBox="0 0 332 180" width="100%" height="180" fill="none" aria-hidden="true" className={styles.asideArtSvg}>
      <g fill="var(--art-detail)" stroke="var(--surface-sunken)">{Array.from({ length: 8 }, (_, row) => <rect key={row} x="0" y={10 + row * 20} width="34" height="20" />)}</g>
      <g fill="var(--art-body)">{[0, 1, 3, 4, 5].map(row => <rect key={row} x="0" y={24 + row * 20} width="20" height="12" />)}</g>
      <path d="M34 30H332M34 50H332M34 70H332M34 90H332M34 110H332M34 130H332M34 150H332" stroke="var(--line-1)" />
      <path d="M90 10V170M146 10V170M202 10V170M258 10V170" stroke="var(--line-1)" />
      <g fill="var(--accent-strong)">{notes.map(([x, y, w], at) => <rect key={at} x={44 + x * 2.8} y={14 + y * 4} width={Math.max(10, w * 2.8 - 6)} height="12" rx="6" />)}</g>
    </svg>
  )
}

// ---- Mouse
const MOUSE_PARTS: Record<string, ReactNode> = {
  LMOUSE: <path d="M55 12C33 12 18 28 18 50v4h37z" />,
  RMOUSE: <path d="M55 12c22 0 37 16 37 38v4H55z" />,
  MMOUSE: <rect x="49" y="24" width="12" height="22" rx="6" />,
  SCROLLUP: <path d="M49 34v-4a6 6 0 0 1 12 0v4z" />,
  SCROLLDOWN: <path d="M49 36h12v4a6 6 0 0 1-12 0z" />,
  BMOUSE: <rect x="13" y="62" width="9" height="20" rx="4" />,
  FMOUSE: <rect x="13" y="88" width="9" height="20" rx="4" />,
}

/** A mouse, flat, with the focused button in the accent (PickerFamily: Mouse). */
export function MouseArt({ focus }: { focus?: string }) {
  return (
    <svg className={styles.mouseArt} viewBox="0 0 110 140" width="150" height="190" fill="none" aria-hidden="true">
      <path d="M18 54c0-24 15-42 37-42s37 18 37 42v32c0 26-16 42-37 42S18 112 18 86z" fill="var(--art-body)" stroke="var(--art-line)" strokeWidth="2" />
      <path d="M18 54h74M55 12v42" stroke="var(--art-detail)" strokeWidth="1.5" />
      <rect x="49" y="24" width="12" height="22" rx="6" fill="var(--art-cap)" stroke="var(--art-detail)" strokeWidth="1.5" />
      <rect x="13" y="62" width="9" height="20" rx="4" fill="var(--art-cap)" stroke="var(--art-detail)" strokeWidth="1.2" />
      <rect x="13" y="88" width="9" height="20" rx="4" fill="var(--art-cap)" stroke="var(--art-detail)" strokeWidth="1.2" />
      {focus && MOUSE_PARTS[focus] && <g className={styles.artHighlightSolid}>{MOUSE_PARTS[focus]}</g>}
      {(focus === 'SCROLLUP' || focus === 'SCROLLDOWN') && <path d={focus === 'SCROLLUP' ? 'M55 4v-0M50 8l5-6 5 6' : 'M50 50l5 6 5-6'} stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

// ---- Menus
/** A menu's shape, small (Open a menu): a wheel, a grid or a strip. */
export function MenuShapeArt({ type, count, size = 30 }: { type: string; count: number; size?: number }) {
  const slices = Math.max(2, Math.min(12, count))
  if (type === 'HOTBAR') {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2" y="9" width="20" height="6" rx="1.5" />{Array.from({ length: Math.min(slices, 6) - 1 }, (_, at) => <path key={at} d={`M${2 + (20 / Math.min(slices, 6)) * (at + 1)} 9v6`} />)}
    </svg>
  }
  if (type === 'TOUCH') {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18M3 12h18" />
    </svg>
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" />
    {Array.from({ length: slices }, (_, at) => {
      const angle = (at / slices) * Math.PI * 2 - Math.PI / 2
      return <path key={at} d={`M${12 + Math.cos(angle) * 3} ${12 + Math.sin(angle) * 3}L${12 + Math.cos(angle) * 9} ${12 + Math.sin(angle) * 9}`} />
    })}
  </svg>
}

// ---- Other (ControllerActionsOther): 220×116 pictures in a sunken well.
export function OtherArt({ name, steps }: { name: string; steps?: string[] }) {
  const box = (children: ReactNode) => <svg className={styles.picSvg} viewBox="0 0 220 116" width="220" height="116" fill="none" aria-hidden="true">{children}</svg>
  if (name === 'keyboard') {
    return box(<g transform="translate(26 26)">
      <rect width="168" height="66" rx="12" fill="var(--surface-control)" stroke="var(--line-2)" />
      <g fill="var(--surface-control-hover)">
        {[10, 32, 54, 76, 98, 120].map(x => <rect key={x} x={x} y="10" width="18" height="14" rx="4" />)}<rect x="142" y="10" width="16" height="14" rx="4" />
        {[16, 38, 60, 82, 104].map(x => <rect key={x} x={x} y="28" width="18" height="14" rx="4" />)}<rect x="126" y="28" width="32" height="14" rx="4" />
        <rect x="40" y="46" width="88" height="12" rx="4" />
      </g>
    </g>)
  }
  if (name === 'pause') {
    return box(<>
      <circle cx="110" cy="58" r="34" fill="var(--surface-control)" stroke="var(--line-2)" strokeWidth="1.5" />
      <rect x="97" y="42" width="9" height="32" rx="3" fill="currentColor" /><rect x="114" y="42" width="9" height="32" rx="3" fill="currentColor" />
      <path d="M58 58a52 52 0 0 1 20-41M162 58a52 52 0 0 1-20 41M74 14l5 4-6 3M146 102l-5-4 6-3" stroke="var(--text-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>)
  }
  if (name === 'cycle') {
    const labels = (steps ?? ['1', '2', '3']).slice(0, 3)
    return box(<>
      <path d="M48 88C70 108 150 108 172 88" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 5" strokeLinecap="round" />
      <path d="M54 82l-6 6 8 3" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {labels.map((label, at) => <g key={at}>
        <rect x={24 + at * 64} y="36" width="44" height="40" rx="11" fill={at === 0 ? 'var(--accent-strong)' : 'var(--surface-control)'} stroke={at === 0 ? 'none' : 'var(--line-2)'} />
        <text x={46 + at * 64} y="62" fill={at === 0 ? 'var(--text-on-accent)' : 'var(--text-1)'} fontSize={label.length > 3 ? 11 : 16} fontWeight="700" textAnchor="middle">{label.length > 6 ? `${label.slice(0, 5)}…` : label}</text>
        {at < labels.length - 1 && <path d={`M${76 + at * 64} 56h10M${83 + at * 64} 52l4 4-4 4`} stroke="var(--text-2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
      </g>)}
    </>)
  }
  if (name === 'power') {
    return box(<>
      <circle cx="110" cy="58" r="34" fill="var(--surface-control)" stroke="var(--line-2)" strokeWidth="1.5" />
      <path d="M98 44a20 20 0 1 0 24 0M110 36v22" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </>)
  }
  // A stick taking another mode while held.
  return box(<>
    <circle cx="110" cy="58" r="40" fill="var(--art-well)" stroke="var(--art-detail)" strokeWidth="1.5" />
    <circle cx="110" cy="58" r="17" fill="var(--art-cap)" stroke="var(--art-line)" strokeWidth="2" />
    <circle cx="110" cy="58" r="10" stroke="var(--art-detail)" strokeWidth="1.5" />
    <path d="M162 40l12 18-12 18M58 40L46 58l12 18" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>)
}

/** The cycle aside: the steps on a loop (ControllerActionsOther). */
export function CycleLoopArt({ steps }: { steps: string[] }) {
  const [a = '1', b = '2', c = '3'] = steps
  const short = (label: string) => label.length > 6 ? `${label.slice(0, 5)}…` : label
  return (
    <svg viewBox="0 0 332 190" width="100%" height="190" fill="none" aria-hidden="true" className={styles.asideArtSvg}>
      <ellipse cx="166" cy="98" rx="120" ry="58" stroke="var(--line-1)" strokeWidth="10" />
      <path d="M46 98A120 58 0 0 1 286 98" stroke="var(--accent-strong)" strokeWidth="3" strokeLinecap="round" />
      <path d="M278 88l8 10 6-12" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="138" y="22" width="56" height="50" rx="14" fill="var(--accent-strong)" />
      <text x="166" y="54" fill="var(--text-on-accent)" fontSize={a.length > 3 ? 13 : 20} fontWeight="700" textAnchor="middle">{short(a)}</text>
      <rect x="246" y="96" width="48" height="42" rx="12" fill="var(--surface-control)" stroke="var(--line-2)" />
      <text x="270" y="122" fill="var(--text-1)" fontSize={b.length > 3 ? 12 : 18} fontWeight="700" textAnchor="middle">{short(b)}</text>
      <rect x="38" y="96" width="48" height="42" rx="12" fill="var(--surface-control)" stroke="var(--line-2)" />
      <text x="62" y="122" fill="var(--text-1)" fontSize={c.length > 3 ? 12 : 18} fontWeight="700" textAnchor="middle">{short(c)}</text>
      <text x="166" y="172" fill="var(--text-3)" fontSize="14" textAnchor="middle">press · press · press · starts over</text>
    </svg>
  )
}

/** Calibrate's aside: the controller put down, the countdown over it. */
export function CalibrateArt({ family, step = 'down' }: { family: ControllerVisualFamily; step?: 'down' | 'held' | 'continuous' | 'neutral' | 'triggers' }) {
  return (
    <div className={styles.calibrateArt} aria-hidden="true">
      <ControllerArt family={family} viewBox="-60 -40 1237 830" highlight={step === 'triggers' ? ['ZL', 'ZR'] : []} />
      {step !== 'triggers' && <span className={styles.calibrateBadge}>{step === 'held' ? 'Keep still' : step === 'neutral' ? 'Hold it as you play' : step === 'continuous' ? 'Every controller' : '3 · 2 · 1'}</span>}
      <span className={styles.calibrateTable} />
    </div>
  )
}

/** "Ctrl + C": the combo as flat key caps. */
export function KeyComboArt({ keys }: { keys: string[] }) {
  return (
    <div className={styles.comboArt} aria-hidden="true">
      {keys.map((key, at) => <span key={`${key}-${at}`} className={styles.comboPart}>{at > 0 && <i>+</i>}<kbd>{key}</kbd></span>)}
    </div>
  )
}

/** A configuration's cover when it has no art of its own: its name on a flat tone. */
export function FlatCover({ name }: { name: string }) {
  let hash = 0
  for (const char of name) hash = (hash * 33 + char.charCodeAt(0)) >>> 0
  const hue = hash % 360
  return <span className={styles.flatCover} style={{ ['--cover-hue' as string]: String(hue) }} aria-hidden="true">
    <b>{name.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase()}</b>
  </span>
}
