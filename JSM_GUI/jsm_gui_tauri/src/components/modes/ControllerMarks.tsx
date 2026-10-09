import { useId, useMemo } from 'react'
import type { TelemetryDevice } from '../../hooks/useTelemetry'
import { STEAM_FRONT_ART } from '../controllerArt'
import { controllerArtworkModel } from '../../utils/controllerArtwork'
import models from '../controllerModels.json'
import styles from './ControllerMarks.module.css'

// Flat controller art with some inputs filled in a colour (STYLE-FLAT.md): the
// focused mode card's 140px locator ("A, RB and the left stick change"), the
// controller light's ring round the Steam button, the variant cards. The real
// art for the connected model, themed by --art-*; the marks are flat shapes at
// each input's place in the art's own 1117 × 750 space.

export type ControllerMark = { command: string; color: string; ring?: boolean }

type Shape = { kind: 'circle'; cx: number; cy: number; r: number } | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; rotate?: number; cx?: number; cy?: number }

// Measured in ControllerStatusSvg.tsx (Steam Controller 2026 front): do not
// hand-tune; re-measure there if the artwork changes.
const STEAM: Record<string, Shape> = {
  N: { kind: 'circle', cx: 864, cy: 93, r: 31 }, E: { kind: 'circle', cx: 922, cy: 146, r: 31 },
  S: { kind: 'circle', cx: 864, cy: 200, r: 31 }, W: { kind: 'circle', cx: 805, cy: 146, r: 31 },
  UP: { kind: 'circle', cx: 252, cy: 99, r: 22 }, LEFT: { kind: 'circle', cx: 206, cy: 145, r: 22 },
  RIGHT: { kind: 'circle', cx: 298, cy: 145, r: 22 }, DOWN: { kind: 'circle', cx: 252, cy: 191, r: 22 },
  L3: { kind: 'circle', cx: 412, cy: 219, r: 66 }, R3: { kind: 'circle', cx: 700, cy: 219, r: 66 },
  HOME: { kind: 'circle', cx: 557, cy: 147, r: 33 }, MISC1: { kind: 'circle', cx: 556, cy: 409, r: 18 },
  '-': { kind: 'circle', cx: 382, cy: 77, r: 15 }, '+': { kind: 'circle', cx: 730, cy: 77, r: 15 },
  L: { kind: 'rect', x: 198, y: 8, w: 140, h: 30, rx: 15 }, R: { kind: 'rect', x: 781, y: 8, w: 140, h: 30, rx: 15 },
  LEFT_PAD: { kind: 'rect', x: 364.9 - 108, y: 410.5 - 108, w: 216, h: 216, rx: 48, rotate: 10.7, cx: 364.9, cy: 410.5 },
  RIGHT_PAD: { kind: 'rect', x: 750.8 - 108.7, y: 410.5 - 108.7, w: 217.4, h: 217.4, rx: 48, rotate: -10.5, cx: 750.8, cy: 410.5 },
  // The back's paddles and grips, shown at the handles the hand holds.
  L4: { kind: 'circle', cx: 92, cy: 470, r: 24 }, L5: { kind: 'circle', cx: 138, cy: 600, r: 24 },
  R4: { kind: 'circle', cx: 1025, cy: 470, r: 24 }, R5: { kind: 'circle', cx: 979, cy: 600, r: 24 },
  LGRIP: { kind: 'rect', x: 40, y: 520, w: 70, h: 40, rx: 20 }, RGRIP: { kind: 'rect', x: 1007, y: 520, w: 70, h: 40, rx: 20 },
}

/** Where an input sits on the Steam front: stick directions on their stick,
 *  pad zones and clicks on their pad, triggers with their bumper. */
const steamKey = (command: string) => {
  const c = command.replace(/^!/, '').toUpperCase()
  if (STEAM[c] && !['L4', 'L5', 'R4', 'R5'].includes(c)) return c
  if (/^(L3|LUP|LDOWN|LLEFT|LRIGHT|LRING|LTOUCH|LM\d+|LEFT_STICK)$/.test(c)) return 'L3'
  if (/^(R3|RUP|RDOWN|RLEFT|RRIGHT|RRING|RTOUCH|RM\d+|RIGHT_STICK)$/.test(c)) return 'R3'
  if (/^(MISC3|MISC4|LT\d+|LEFT_PAD)$/.test(c)) return 'LEFT_PAD'
  if (/^(MISC2|TOUCH|CAPTURE|RT\d+|T\d+|TUP|TDOWN|TLEFT|TRIGHT|TRING|RIGHT_PAD)$/.test(c)) return 'RIGHT_PAD'
  if (c === 'ZL' || c === 'ZLF') return 'L'
  if (c === 'ZR' || c === 'ZRF') return 'R'
  // JSM's LSL / LSR / RSL / RSR are L4 / L5 / R4 / R5 on the Steam Controller.
  if (c === 'LSL') return 'L4'
  if (c === 'LSR') return 'L5'
  if (c === 'RSR') return 'R4'
  if (c === 'RSL') return 'R5'
  if (c === 'MISC6') return 'LGRIP'
  if (c === 'MISC5') return 'RGRIP'
  return null
}

function ShapeMark({ shape, color, ring }: { shape: Shape; color: string; ring?: boolean }) {
  const paint = ring ? { fill: 'none', stroke: color, strokeWidth: 12 } : { fill: color, fillOpacity: .85, stroke: color, strokeWidth: 3 }
  if (shape.kind === 'circle') return <circle cx={shape.cx} cy={shape.cy} r={ring ? shape.r + 10 : shape.r} {...paint} />
  return <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} {...paint}
    transform={shape.rotate ? `rotate(${shape.rotate} ${shape.cx} ${shape.cy})` : undefined} />
}

type Props = {
  device?: TelemetryDevice
  marks: ControllerMark[]
  /** Width in px; the height follows the art (1117 × 750). */
  width?: number
  className?: string
  label?: string
}

export function ControllerMarks({ device, marks, width = 140, className, label }: Props) {
  const id = useId().replace(/:/g, '')
  const key = device ? controllerArtworkModel(device) : undefined
  const model = key ? (models as unknown as Record<string, { front: string; controls: { command: string; tag: string; attrs: Record<string, string | undefined> }[]; sticks: number[][] }>)[key] : undefined
  const art = useMemo(() => {
    const markup = model ? model.front : STEAM_FRONT_ART
    return { __html: markup.replace(/id="([^"]+)"/g, `id="${id}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${id}-$1)`) }
  }, [id, model])
  return (
    <svg className={`${styles.art} ${className ?? ''}`.trim()} viewBox="0 0 1117 750" width={width} height={width * 750 / 1117}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g dangerouslySetInnerHTML={art} />
      {marks.map((mark, index) => {
        if (model) {
          const command = mark.command.replace(/^!/, '').toUpperCase()
          const stick = /^(L3|LUP|LDOWN|LLEFT|LRIGHT|LRING|LTOUCH)$/.test(command) ? model.sticks[0] : /^(R3|RUP|RDOWN|RLEFT|RRIGHT|RRING|RTOUCH)$/.test(command) ? model.sticks[1] : undefined
          if (stick) return <ShapeMark key={index} shape={{ kind: 'circle', cx: stick[0], cy: stick[1], r: stick[2] }} color={mark.color} ring={mark.ring} />
          const control = model.controls.find(item => item.command === command)
          if (!control) return null
          const a = control.attrs
          const shape: Shape | null = control.tag === 'circle' ? { kind: 'circle', cx: Number(a.cx), cy: Number(a.cy), r: Number(a.r) }
            : control.tag === 'rect' ? { kind: 'rect', x: Number(a.x), y: Number(a.y), w: Number(a.width), h: Number(a.height), rx: Number(a.rx ?? 8) } : null
          if (!shape) return <path key={index} d={a.d ?? ''} fill={mark.color} fillOpacity={.85} stroke={mark.color} strokeWidth={3} />
          return <ShapeMark key={index} shape={shape} color={mark.color} ring={mark.ring} />
        }
        const where = steamKey(mark.command)
        return where ? <ShapeMark key={index} shape={STEAM[where]} color={mark.color} ring={mark.ring} /> : null
      })}
    </svg>
  )
}
