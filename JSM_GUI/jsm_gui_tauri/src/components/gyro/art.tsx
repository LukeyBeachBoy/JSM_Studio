import { accelSensitivityAt, GYRO_ACCEL_DEFAULTS, type AccelCurveType } from '../../utils/accelCurve'
import styles from './Gyro.module.css'

// Small flat pictures for the Gyro picture cards (STYLE-FLAT.md: 2px strokes,
// --art-* colours, the accent for the picked thing, no glows).

const svg = (children: React.ReactNode, label?: string) => <svg className={styles.cardArt} viewBox="0 0 120 80" aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label}>{children}</svg>

/** Sends: Mouse · Left stick · Right stick · Motion to game. */
export function OutputArt({ kind }: { kind: 'MOUSE' | 'LEFT_STICK' | 'RIGHT_STICK' | 'PS_MOTION' }) {
  if (kind === 'MOUSE') return svg(<>
    <rect x="46" y="14" width="28" height="44" rx="14" className={styles.artBody} />
    <path d="M60 14 V32 M46 32 H74" className={styles.artLine} />
    <path d="M30 38 H40 M34 34 L30 38 L34 42 M90 38 H80 M86 34 L90 38 L86 42" className={styles.artAccent} />
  </>)
  if (kind === 'PS_MOTION') return svg(<>
    <path d="M34 34 C34 24 44 22 60 22 C76 22 86 24 86 34 L90 52 C91 58 84 60 80 54 L74 46 H46 L40 54 C36 60 29 58 30 52 Z" className={styles.artBody} />
    <circle cx="48" cy="34" r="4" className={styles.artLine} /><circle cx="72" cy="34" r="4" className={styles.artLine} />
    <path d="M46 14 C54 9 66 9 74 14 M70 10 L74 14 L69 16" className={styles.artAccent} />
  </>)
  const letter = kind === 'LEFT_STICK' ? 'L' : 'R'
  return svg(<>
    <circle cx="60" cy="40" r="24" className={styles.artBody} />
    <circle cx="60" cy="40" r="11" className={styles.artLine} />
    <text x="60" y="44" textAnchor="middle" className={styles.artText}>{letter}</text>
    <path d={kind === 'LEFT_STICK' ? 'M88 40 H100 M96 36 L100 40 L96 44' : 'M40 18 C30 22 26 30 28 40 M26 34 L28 40 L33 36'} className={styles.artAccent} />
  </>)
}

export type SpaceKind = 'LOCAL' | 'YAW_PLUS_ROLL' | 'PLAYER_TURN' | 'PLAYER_LEAN' | 'WORLD_TURN' | 'WORLD_LEAN'
/** Turn using: one small pictogram per gyro space. */
export function SpaceArt({ kind }: { kind: SpaceKind }) {
  const pad = <rect x="38" y="30" width="44" height="20" rx="10" className={styles.artBody} />
  switch (kind) {
    case 'LOCAL': return svg(<>{pad}<path d="M60 18 V62 M26 40 H94" className={styles.artLine} strokeDasharray="3 4" /></>)
    case 'YAW_PLUS_ROLL': return svg(<>{pad}<path d="M30 24 C46 16 74 16 90 24 M86 20 L90 24 L85 27 M94 46 C98 54 94 62 86 64" className={styles.artAccent} /></>)
    case 'PLAYER_TURN': return svg(<><circle cx="60" cy="22" r="7" className={styles.artLine} /><path d="M60 29 V52 M48 38 H72 M52 66 L60 52 L68 66" className={styles.artLine} /><path d="M38 30 C30 40 32 52 40 58" className={styles.artAccent} /></>)
    case 'PLAYER_LEAN': return svg(<><circle cx="56" cy="22" r="7" className={styles.artLine} /><path d="M57 29 L62 52 M48 40 L72 34 M54 66 L62 52 L70 66" className={styles.artLine} /><path d="M80 24 C88 30 90 40 86 48" className={styles.artAccent} /></>)
    case 'WORLD_TURN': return svg(<>{pad}<path d="M60 10 V70 M54 64 L60 70 L66 64" className={styles.artLine} /><path d="M32 22 C44 14 76 14 88 22" className={styles.artAccent} /></>)
    case 'WORLD_LEAN': return svg(<>{pad}<path d="M60 10 V70 M54 64 L60 70 L66 64" className={styles.artLine} /><path d="M30 40 C24 50 28 60 36 64 M90 40 C96 50 92 60 84 64" className={styles.artAccent} /></>)
  }
}

/** Feels like: a strip of the effect's shape. */
export function EffectArt({ effect }: { effect: string }) {
  const base = 'M8 40 H112'
  const shapes: Record<string, string> = {
    TICK: 'M8 40 H50 L56 22 L62 58 L68 40 H112',
    CLICK: 'M8 40 H40 L46 26 L52 54 L58 40 H70 L74 32 L78 48 L82 40 H112',
    TONE: 'M8 40 C18 26 28 26 38 40 C48 54 58 54 68 40 C78 26 88 26 98 40 C104 48 108 48 112 44',
    RUMBLE: 'M8 40 L14 30 L20 50 L26 30 L32 50 L38 30 L44 50 L50 30 L56 50 L62 30 L68 50 L74 30 L80 50 L86 30 L92 50 L98 30 L104 50 L112 40',
    SWEEP: 'M8 40 C14 20 22 20 28 40 C34 56 40 56 46 40 C50 32 54 32 58 40 C61 46 64 46 67 40 H112',
    PULSE: 'M8 40 H40 C44 30 48 28 60 28 C72 28 76 30 80 40 H112',
    TAP: 'M8 40 H44 L50 26 L56 54 L62 40 H70 C74 34 80 32 86 32 C92 32 96 34 100 40 H112',
    OFF: base,
  }
  return svg(<path d={shapes[effect] ?? 'M8 40 H40 L46 30 L52 50 L58 40 H112'} className={effect === 'OFF' ? styles.artDashed : styles.artAccent} />)
}

/** A curve type as a thumbnail (Speed ▸ Advanced curve picker). */
export function CurveArt({ type }: { type: AccelCurveType | 'OFF' }) {
  if (type === 'OFF') return svg(<path d="M10 50 H110" className={styles.artAccent} />)
  const params = { curveType: type, minSens: 0.25, maxSens: 1, minThreshold: 10, maxThreshold: type === 'QUADRATIC' || type === 'JUMP' ? 60 : 70, ...GYRO_ACCEL_DEFAULTS, naturalVHalf: 18, powerVRef: 8, powerExponent: 1, sigmoidMid: 30, sigmoidWidth: 6, jumpTau: 3 }
  const d = Array.from({ length: 41 }, (_, i) => { const s = (100 * i) / 40; return `${i ? 'L' : 'M'}${10 + s},${66 - accelSensitivityAt(s, params) * 52}` }).join('')
  return svg(<path d={d} className={styles.artAccent} />)
}

/** Stick behaviour: speed (re-centres) or angle (holds). */
export function StickBehaviourArt({ kind }: { kind: 'speed' | 'angle' }) {
  return svg(<>
    <circle cx="60" cy="40" r="26" className={styles.artBody} />
    {kind === 'speed'
      ? <><circle cx="74" cy="30" r="8" className={styles.artLine} /><path d="M28 66 H44 M40 62 L44 66 L40 70" className={styles.artAccent} /></>
      : <><circle cx="76" cy="34" r="8" className={styles.artLine} /><path d="M60 40 L60 12 M60 40 L80 22" className={styles.artDashed} /><text x="40" y="20" className={styles.artText}>30°</text></>}
  </>)
}

/** When is gyro on: Always · While I hold… · Unless I hold… · Only while aiming · Off (the Gyro front's cards). */
export function ActivationArt({ kind }: { kind: 'always' | 'hold' | 'unless' | 'aiming' | 'off' }) {
  const pad = <path d="M30 30 C30 22 40 20 60 20 C80 20 90 22 90 30 L94 48 C95 54 88 56 84 50 L78 42 H42 L36 50 C32 56 25 54 26 48 Z" className={styles.artBody} />
  if (kind === 'always') return svg(<>{pad}<path d="M14 40 C18 32 22 32 26 40 M94 40 C98 32 102 32 106 40" className={styles.artAccent} /><path d="M60 8 C66 4 74 6 76 12 M72 8 L76 12 L70 14" className={styles.artAccent} /></>)
  if (kind === 'off') return svg(<>{pad}<path d="M24 64 L96 16" className={styles.artDashed} /></>)
  if (kind === 'aiming') return svg(<>{pad}<path d="M36 10 H54 C58 10 58 16 54 16 H40" className={styles.artAccent} /><circle cx="60" cy="33" r="7" className={styles.artLine} /><path d="M60 22 V26 M60 40 V44 M49 33 H53 M67 33 H71" className={styles.artLine} /></>)
  // Hold: a grip lit in the accent; Unless: the same grip, crossed.
  return svg(<>{pad}<path d="M78 42 L84 50 C88 56 95 54 94 48 L91 36" className={styles.artAccent} />{kind === 'unless' && <path d="M72 58 L100 34" className={styles.artDashed} />}</>)
}
