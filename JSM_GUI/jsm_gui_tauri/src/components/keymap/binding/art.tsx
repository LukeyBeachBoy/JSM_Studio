import type { ReactNode } from 'react'

// Flat timelines (STYLE-FLAT.md): what the button does over time, and what is
// sent. The well is the card's; bars are the press, accent marks are output.
// Used by More (BindingMore) and Fine-tune's "How Space is sent".

type Lane = { label: string; marks: ReactNode }

const W = 280
const H = 104
const BAR = 'rgba(255,255,255,.16)'
const OUT = 'var(--accent)'
const LABEL_X = 12
const X0 = 70

function Timeline({ lanes, extra }: { lanes: Lane[]; extra?: ReactNode }) {
  const gap = (H - 26) / lanes.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      {lanes.map((lane, index) => {
        const y = 18 + index * gap
        return (
          <g key={lane.label} transform={`translate(0 ${y})`}>
            <text x={LABEL_X} y={5} fill="var(--text-2)" fontSize="12" fontWeight="600" fontFamily="var(--font-ui)">{lane.label}</text>
            {lane.marks}
          </g>
        )
      })}
      <line x1={X0} x2={W - 12} y1={H - 8} y2={H - 8} stroke="rgba(255,255,255,.08)" />
      {Array.from({ length: 10 }, (_, i) => <line key={i} x1={X0 + i * 21} x2={X0 + i * 21} y1={H - 11} y2={H - 8} stroke="rgba(255,255,255,.1)" />)}
      {extra}
    </svg>
  )
}

const bar = (from: number, to: number, fill = BAR) => <rect x={X0 + from} y={-4} width={to - from} height={10} rx={5} fill={fill} />
const dot = (at: number) => <circle cx={X0 + at} cy={1} r={6} fill={OUT} />
const marker = (at: number) => <line x1={X0 + at} x2={X0 + at} y1={-14} y2={70} stroke="rgba(255,255,255,.25)" strokeDasharray="3 3" />

/** Fine-tune: Normal, Send once, Toggle on/off, Only when let go. */
export function BehaviourArt({ behaviour, input, output }: { behaviour: 'normal' | 'tapOnce' | 'toggle' | 'releaseOnly'; input: string; output: string }) {
  // The lane fits about seven characters; a longer output reads "Sends", the
  // heading above the cards already names it ("Turn o…" said nothing).
  const out = output.length > 7 ? 'Sends' : output
  if (behaviour === 'normal') return <Timeline lanes={[{ label: input, marks: bar(10, 150) }, { label: out, marks: bar(10, 150, OUT) }]} />
  if (behaviour === 'tapOnce') return <Timeline lanes={[{ label: input, marks: bar(10, 150) }, { label: out, marks: dot(14) }]} extra={marker(10)} />
  if (behaviour === 'toggle') return <Timeline lanes={[{ label: input, marks: <>{bar(10, 34)}{bar(130, 154)}</> }, { label: out, marks: bar(10, 130, OUT) }]} extra={<>{marker(10)}{marker(130)}</>} />
  return (
    <Timeline lanes={[{ label: input, marks: bar(40, 150) }, { label: out, marks: <><rect x={X0 + 6} y={-4} width={140} height={10} rx={5} fill="none" stroke="rgba(255,255,255,.3)" strokeDasharray="4 3" /><rect x={X0 + 146} y={-6} width={6} height={14} rx={2} fill={OUT} /><path d={`M${X0 + 162} 8 v-12 m-5 5 l5 -5 l5 5`} stroke={OUT} fill="none" strokeWidth="2" /></> }]} extra={marker(150)} />
  )
}

/** More: Let go, Turbo, Press together with…, Stick diagonal. */
export function MoreArt({ kind, input }: { kind: 'release' | 'turbo' | 'simultaneous' | 'diagonal'; input: string }) {
  if (kind === 'release') return <Timeline lanes={[{ label: input, marks: bar(0, 130) }, { label: 'Sends', marks: <rect x={X0 + 130} y={-4} width={20} height={10} rx={5} fill={OUT} /> }]} extra={<>{marker(130)}<text x={X0 + 136} y={14} fill={OUT} fontSize="11" fontFamily="var(--font-ui)">let go</text></>} />
  if (kind === 'turbo') return <Timeline lanes={[{ label: input, marks: bar(0, 190) }, { label: 'Sends', marks: <>{[10, 36, 62, 88, 114, 140, 166].map(at => <circle key={at} cx={X0 + at} cy={1} r={5} fill={OUT} />)}</> }]} />
  if (kind === 'simultaneous') return <Timeline lanes={[{ label: 'Other', marks: bar(14, 170) }, { label: input, marks: bar(20, 170) }, { label: 'Sends', marks: bar(20, 170, OUT) }]} extra={<rect x={X0 + 8} y={8} width={22} height={50} rx={4} fill="color-mix(in srgb, var(--accent) 12%, transparent)" />} />
  return <Timeline lanes={[{ label: 'Up', marks: bar(10, 110) }, { label: 'Right', marks: bar(60, 180) }, { label: 'Sends', marks: bar(60, 110, OUT) }]} extra={<>{marker(60)}{marker(110)}</>} />
}

/** While holding step 3: what a stick becomes (flat, the overlay's line weight). */
export function StickArt({ mode }: { mode: string }) {
  const line = 'var(--art-line, #e3eaf1)'
  return (
    <svg viewBox="0 0 120 90" role="img" aria-hidden="true">
      {mode === '' && <><circle cx="60" cy="45" r="26" fill="none" stroke={line} strokeOpacity=".35" strokeWidth="2" /><circle cx="60" cy="45" r="14" fill="none" stroke={line} strokeWidth="2" /><circle cx="60" cy="45" r="5" fill={line} /></>}
      {mode === 'NO_MOUSE' && ['W', 'A', 'S', 'D'].map((key, index) => {
        const x = index === 0 ? 48 : 22 + (index - 1) * 26
        const y = index === 0 ? 14 : 44
        return <g key={key}><rect x={x} y={y} width="24" height="24" rx="5" fill="rgba(255,255,255,.08)" stroke={line} strokeOpacity=".4" /><text x={x + 12} y={y + 16} textAnchor="middle" fontSize="11" fontWeight="700" fill={line} fontFamily="var(--font-ui)">{key}</text></g>
      })}
      {mode === 'AIM' && <><path d="M18 72 C 40 70, 52 40, 82 26" fill="none" stroke={line} strokeWidth="2" /><circle cx="86" cy="24" r="9" fill="none" stroke="var(--accent)" strokeWidth="2" /><path d="M86 10v8M86 30v8M72 24h8M92 24h8" stroke="var(--accent)" strokeWidth="2" /></>}
      {mode === 'FLICK' && <><path d="M60 19 a26 26 0 1 1 -22 12" fill="none" stroke={line} strokeWidth="2" /><path d="M34 24 l4 8 l8 -3" fill="none" stroke={line} strokeWidth="2" /><path d="M60 45 L76 58" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" /><circle cx="60" cy="45" r="4" fill="var(--accent)" /></>}
    </svg>
  )
}
